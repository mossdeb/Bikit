/**
 * The `.BKT` binary — what the BIKIT logger writes to its microSD, and the
 * source of truth for a recording. Parsed here straight into the same
 * normalized session the JSON parser produces, so nothing downstream knows
 * which file it came from.
 *
 * Why read the binary and not the exporter's JSON: the JSON is sixteen times
 * the size (12 bytes per IMU sample become ~240), which puts a 25 MB bucket
 * ceiling at about four minutes of riding; and it carries nothing the binary
 * does not — its per-sample `t_ms` is index ÷ rate, computed on the way out,
 * and its `g_force` is √(ax²+ay²+az²), which derive.ts already does. The
 * binary, meanwhile, keeps things the JSON drops: a CRC per block, the
 * sensor scales in the header, and a stream clock per block.
 *
 * Layout (all little-endian), mirrored from `bikit_export.py`, which is the
 * reference implementation until the firmware ships a written spec:
 *
 *   [0, 64)      session header  "BKTL" (CRC32 over its first 60 bytes) or
 *                                "BKT1" (firmware V13: CRC32 over all 64,
 *                                with the CRC field itself as zero)
 *   [64, 120)    calibration     "CAL1"  — only when header flag bit 0 is set
 *   [128, 188)   orientation     "ORI1"  — BKT1 with flag bit 0, firmware
 *                                V13.5+: the bike's up/front/left in the
 *                                sensor's frame (the two-step calibration)
 *   [4096, …)    blocks of 4096 bytes, each: 32-byte header "BLK1" + payload
 *                type 1 = IMU, 12-byte samples (six int16)
 *                type 2 = GNSS, 36-byte samples (or 32 in older firmware,
 *                         without the odometer)
 *                type 3 = HIGHG, firmware V15: 208-byte shock events from
 *                         the ADXL375, written at STOP after every other
 *                         block — see readHighGEvents
 *
 * Strict where the JSON parser is strict, and for the same reason: a bad
 * CRC, a block out of sequence, an index that goes backwards or a file
 * shorter than its header declares is a corrupt recording, not a variant.
 * Every recusal names the block, written on screen like the rest — in the
 * reader's language, which is why the parser takes a `locale`: the
 * messages come from the Pro dictionary (i18n/pro/importing.ts, `bkt`).
 *
 * Three places this is deliberately LESS strict than the exporter:
 * - A header with the GNSS flag set but no GNSS samples is accepted, as a
 *   recording without a fix (`gps: null`). The exporter fails it; a ride
 *   under trees that never got a fix is still a ride.
 * - A GNSS sample the receiver flags invalid is skipped, not failed — the
 *   same tunnel rule the JSON path has.
 * - A forward jump in the IMU block index is a GAP, not a hole: since
 *   firmware V11 the index is a nominal timeline that a FIFO reset moves
 *   forward by what was lost, so the samples after it keep their real
 *   place in time. Gaps are reported in `imuGaps`.
 *
 * Sample time is `origin + index ÷ rate`, with the index the block's
 * `first_sample_index` and the origin from the first block's
 * `stream_time_us` — nominal (so 0) in every firmware so far, and the hook
 * for a firmware that stamps when the first sample really landed.
 */

import type { Locale } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
import type {
  GpsChannels,
  ImuCalibration,
  ImuHighGEvent,
  ImuMountOrientation,
  ImuParseResult,
  ImuTimelineGap,
} from "./format";

export const BKT_FORMAT = "bikit_bkt";
/** What the upload declares. The bucket's allow-list has it (migration
 * 00041); the JSON path keeps `application/json`. */
export const BKT_CONTENT_TYPE = "application/octet-stream";

/** Two generations of the session header, told apart by their magic.
 * "BKTL" is the exporter-era layout (firmware through V11), CRC over the
 * first 60 bytes. "BKT1" is firmware V13's: same 64-byte field layout, but
 * the CRC covers all 64 bytes with the CRC field itself read as zero — and
 * the block clock stamps are the logger's real clock, not the nominal
 * index ÷ rate. Blocks are identical between the two. */
const MAGIC_LEGACY = "BKTL";
const MAGIC_V1 = "BKT1";
const BLOCK_MAGIC = "BLK1";
const CAL_MAGIC = "CAL1";
const SESSION_HEADER_SIZE = 64;
const BLOCK_SIZE = 4096;
const BLOCK_HEADER_SIZE = 32;
const IMU_SAMPLE_SIZE = 12;
const GNSS_SAMPLE_SIZES = new Set([32, 36]);
const BLOCK_TYPE_IMU = 1;
const BLOCK_TYPE_GNSS = 2;
/** Firmware V15: the ADXL375's shock events. One record per event,
 * `HighGDiskEventV1` in the firmware: trigger_time_us u32 @0,
 * trigger_rtc_tick u32 @4, sample_count u8 @8, peak_index u8 @9, flags
 * u16 @10, peak_mg u16 @12, reserved u16 @14, then int16 x[32] @16,
 * y[32] @80, z[32] @144 — the three axes as three arrays, NOT interleaved.
 * The block's own flags byte names the record layout; 0x01 is this one.
 *
 * What the record does not say and the firmware's configuration does: 16
 * samples are held before the trigger (FIFO_CTL 0xD0), at the ADXL375's
 * fixed 49 mg/LSB — and the RATE, which changed under the same layout and
 * the same header version: 800 Hz in firmware V15 (BW_RATE 0x0D), 3200 Hz
 * from V15.x/V16 (0x0F), a 40 ms window against a 10 ms one. Until the
 * firmware writes it down, the samples themselves tell the two apart: at
 * 3200 Hz the part's output LSB is always 0. Measured on real files
 * (2026-09-19): 685 odd values in 1344 at 800 Hz (R0098), 0 in 288 at
 * 3200 Hz (R0154). Too few samples to judge reads as the older rate. */
const BLOCK_TYPE_HIGHG = 3;
const HIGHG_RECORD_SIZE = 208;
const HIGHG_SAMPLES = 32;
const HIGHG_FORMAT_V1 = 0x01;
const HIGHG_G_PER_LSB = 0.049;
const HIGHG_RATE_HZ = 800;
const HIGHG_FAST_RATE_HZ = 3200;
/** Fewer raw values than this and "all even" proves nothing: one event's
 * three axes. */
const HIGHG_PARITY_MIN_VALUES = 96;
const HIGHG_PRE_TRIGGER = 16;
/** Two candidates for an event's place this close in what the main IMU
 * read are not told apart by it, G. */
const HIGHG_UNWRAP_MARGIN_G = 0.5;
const FLAG_CALIBRATION = 0x1;
/** Firmware V15 sets it on every file it writes, whether or not the
 * ADXL375 answered at boot — so it says "this firmware", not "this sensor
 * worked"; a HIGHG block is the only proof of the latter. */
const FLAG_HIGHG = 0x4;
/** Firmware V13.5's mounting orientation record, right after CAL1. */
const ORI_MAGIC = "ORI1";
const ORI_OFFSET = 128;
const ORI_SIZE = 60;
/** 2^24 ticks of the logger's 32768 Hz RTC, the span of firmware V13's block
 * clock stamps before they wrap. */
const RTC_WRAP_MS = (2 ** 24 / 32768) * 1000;
const CAL_OFFSET = 64;
const CAL_SIZE = 56;

/** GNSS per-sample validity bits, as the firmware sets them. */
const GNSS_POSITION = 0x01;
const GNSS_ALTITUDE = 0x02;
const GNSS_SPEED = 0x04;
const GNSS_HEADING = 0x08;
const GNSS_ODOMETER = 0x10;

/** Does this buffer start with the BKT magic? The sniff the dispatcher uses
 * to pick this parser over the JSON one before decoding anything. */
export function isBktFile(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 4) return false;
  const magic = ascii(new DataView(bytes), 0, 4);
  return magic === MAGIC_LEGACY || magic === MAGIC_V1;
}

/**
 * IEEE CRC-32, the polynomial zlib uses — so the numbers match what the
 * firmware wrote and what `bikit_export.py` checks. Table built once.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function ascii(view: DataView, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++)
    out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

interface SessionHeader {
  versionMajor: number;
  versionMinor: number;
  headerSize: number;
  flags: number;
  sessionId: number;
  startUnixMs: number;
  imuRateMHz: number;
  accelScaleUg: number;
  gyroScaleMdps: number;
  imuSampleSize: number;
  blockSize: number;
  totalImuSamples: number;
  totalBlocks: number;
  durationMs: number;
  storedCrc: number;
}

function readHeader(view: DataView): SessionHeader {
  return {
    versionMajor: view.getUint8(4),
    versionMinor: view.getUint8(5),
    headerSize: view.getUint16(6, true),
    flags: view.getUint32(8, true),
    sessionId: view.getUint32(12, true),
    startUnixMs: Number(view.getBigUint64(16, true)),
    // 24: start_monotonic_us — the logger's clock at start; not needed.
    imuRateMHz: view.getUint32(32, true),
    // 36: accel_range_g, 38: gyro_range_dps — informative; the scales below
    // are what convert the raw counts, and they are what we read.
    accelScaleUg: view.getUint16(40, true),
    gyroScaleMdps: view.getUint16(42, true),
    imuSampleSize: view.getUint16(44, true),
    blockSize: view.getUint16(46, true),
    totalImuSamples: view.getUint32(48, true),
    totalBlocks: view.getUint32(52, true),
    durationMs: view.getUint32(56, true),
    storedCrc: view.getUint32(60, true),
  };
}

interface BlockHeader {
  type: number;
  /** Unused by IMU and GNSS blocks; the record layout on HIGHG ones. */
  flags: number;
  headerSize: number;
  sequence: number;
  firstSampleIndex: number;
  sampleCount: number;
  sampleSize: number;
  /** The logger's clock at the block's first sample, µs. Nominal
   * (index / rate) in every firmware so far; a firmware that stamps the
   * real clock here moves the IMU timeline's origin — see the loop. */
  streamTimeUs: number;
  payloadCrc: number;
}

function readBlockHeader(view: DataView, offset: number): BlockHeader {
  return {
    type: view.getUint8(offset + 4),
    flags: view.getUint8(offset + 5),
    headerSize: view.getUint16(offset + 6, true),
    sequence: view.getUint32(offset + 8, true),
    firstSampleIndex: view.getUint32(offset + 12, true),
    sampleCount: view.getUint16(offset + 16, true),
    sampleSize: view.getUint16(offset + 18, true),
    streamTimeUs: Number(view.getBigUint64(offset + 20, true)),
    payloadCrc: view.getUint32(offset + 28, true),
  };
}

const fail = (error: string): ImuParseResult => ({ ok: false, error });

interface HighGRaw {
  /** trigger_time_us as written: session-relative, from the logger's
   * 24-bit RTC — so modulo RTC_WRAP_MS, like the IMU blocks' stamps. */
  triggerMs: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
}

/**
 * The shock events on the session's timeline. Their trigger time comes
 * from the same clock as the IMU blocks' stamps — RTC2 ticks since the
 * session started, masked to 24 bits — so it needs no offset, but in a
 * recording longer than 512 s it has wrapped and says so nowhere. The IMU
 * blocks are dense enough to unwrap by order alone; shock events are not
 * (one at 100 s and one at 700 s read 100 s and 188 s, in order). So each
 * event takes, among the turns that keep it inside the recording and not
 * before the event written ahead of it, the one where the main IMU read
 * the hardest hit: a shock over the ADXL's threshold is one the LSM6DS3
 * felt too. A tie — the IMU saw the same in both — goes to the earliest.
 */
function placeHighGEvents(
  raw: HighGRaw[],
  sampleRateHz: number,
  tMs: Float64Array,
  ax: Float32Array,
  ay: Float32Array,
  az: Float32Array,
): ImuHighGEvent[] {
  const n = tMs.length;
  const endMs = n > 0 ? tMs[n - 1] : 0;
  const lowerBound = (ms: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tMs[mid] < ms) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  /** The main IMU's highest |a| within 60 ms of an instant, G. */
  const imuPeak = (ms: number) => {
    let peak = 0;
    for (let i = lowerBound(ms - 60); i < n && tMs[i] <= ms + 60; i++)
      peak = Math.max(peak, Math.hypot(ax[i], ay[i], az[i]));
    return peak;
  };

  const out: ImuHighGEvent[] = [];
  let previousMs = -Infinity;
  for (const event of raw) {
    let timeMs = event.triggerMs;
    let best = -1;
    for (
      let candidate = event.triggerMs;
      candidate <= endMs + RTC_WRAP_MS;
      candidate += RTC_WRAP_MS
    ) {
      if (candidate < previousMs) continue;
      // Past the end only when nothing earlier would do: a trigger in the
      // last block's tail is still this recording's.
      if (candidate > endMs + 1000 && best >= 0) break;
      const peak = imuPeak(candidate);
      if (peak > best + HIGHG_UNWRAP_MARGIN_G) {
        best = peak;
        timeMs = candidate;
      }
      if (candidate > endMs) break;
    }
    previousMs = timeMs;

    let peakG = 0;
    let peakIndex = 0;
    for (let k = 0; k < event.x.length; k++) {
      const m = Math.hypot(event.x[k], event.y[k], event.z[k]);
      if (m > peakG) {
        peakG = m;
        peakIndex = k;
      }
    }
    out.push({
      timeMs,
      peakG,
      peakIndex,
      sampleRateHz,
      preTriggerSamples: HIGHG_PRE_TRIGGER,
      x: event.x,
      y: event.y,
      z: event.z,
    });
  }
  return out;
}

/** The clock stamp and index of the next IMU block after `b`, or null when
 * `b` is the last one. Only headers are read; the main loop validates. */
function nextImuStamp(
  view: DataView,
  totalBlocks: number,
  b: number,
): { stampMs: number; firstSampleIndex: number } | null {
  for (let j = b + 1; j < totalBlocks; j++) {
    const off = BLOCK_SIZE + j * BLOCK_SIZE;
    if (off + BLOCK_HEADER_SIZE > view.byteLength) return null;
    if (view.getUint8(off + 4) !== BLOCK_TYPE_IMU) continue;
    return {
      stampMs: Number(view.getBigUint64(off + 20, true)) / 1000,
      firstSampleIndex: view.getUint32(off + 12, true),
    };
  }
  return null;
}

/** The header CRC the way each generation computes it — see the magics. */
function headerCrc(u8: Uint8Array, magic: string): number {
  return recordCrc(u8, 0, SESSION_HEADER_SIZE, magic);
}

/** The CRC of a fixed-size record whose last four bytes are the CRC: the
 * legacy generation covers the bytes before the field, BKT1 covers the
 * whole record with the field read as zero. */
function recordCrc(
  u8: Uint8Array,
  offset: number,
  size: number,
  magic: string,
): number {
  if (magic === MAGIC_LEGACY)
    return crc32(u8.subarray(offset, offset + size - 4));
  const copy = u8.slice(offset, offset + size);
  copy.fill(0, size - 4, size);
  return crc32(copy);
}

export function parseBktFile(
  bytes: ArrayBuffer,
  locale: Locale,
): ImuParseResult {
  const t = getProDictionary(locale).importing.bkt;
  if (bytes.byteLength < SESSION_HEADER_SIZE) {
    return fail(t.tooShort);
  }
  const view = new DataView(bytes);
  const u8 = new Uint8Array(bytes);
  const magic = ascii(view, 0, 4);
  if (magic !== MAGIC_LEGACY && magic !== MAGIC_V1) {
    return fail(t.badMagic);
  }
  const h = readHeader(view);

  if (h.headerSize !== SESSION_HEADER_SIZE)
    return fail(t.headerSize(h.headerSize));
  if (h.blockSize !== BLOCK_SIZE) return fail(t.blockSize(h.blockSize));
  if (h.imuSampleSize !== IMU_SAMPLE_SIZE)
    return fail(t.imuSampleSize(h.imuSampleSize));
  if (headerCrc(u8, magic) !== h.storedCrc) return fail(t.headerCrc);
  if (h.imuRateMHz === 0) return fail(t.zeroRate);
  if (h.accelScaleUg === 0 || h.gyroScaleMdps === 0) return fail(t.noScales);

  // Calibration: validated when the header says it is there, because a bad
  // snapshot is a sign the header region itself is damaged — and read, for
  // alignSessionToBike to express the channels in the bike's frame.
  let calibration: ImuCalibration | null = null;
  if (h.flags & FLAG_CALIBRATION) {
    if (bytes.byteLength < CAL_OFFSET + CAL_SIZE) return fail(t.calTruncated);
    if (ascii(view, CAL_OFFSET, 4) !== CAL_MAGIC) return fail(t.calMagic);
    const storedCalCrc = view.getUint32(CAL_OFFSET + 52, true);
    if (recordCrc(u8, CAL_OFFSET, CAL_SIZE, magic) !== storedCalCrc)
      return fail(t.calCrc);
    // CAL1 layout (`<4sB3x9fIII`): magic, version, pad, then nine floats —
    // gravity reference xyz, gyro bias xyz, gravity magnitude, accel and
    // gyro stddev — then sample_count, calibration_count, crc32.
    const f = (i: number) => view.getFloat32(CAL_OFFSET + 8 + i * 4, true);
    const values = Array.from({ length: 9 }, (_, i) => f(i));
    if (values.every(Number.isFinite)) {
      calibration = {
        gravityRefG: [values[0], values[1], values[2]],
        gyroBiasDps: [values[3], values[4], values[5]],
        gravityMagnitudeG: values[6],
        accelStddevG: values[7],
        gyroStddevDps: values[8],
        sampleCount: view.getUint32(CAL_OFFSET + 44, true),
        calibrationCount: view.getUint32(CAL_OFFSET + 48, true),
      };
    }
  }

  // The mounting orientation, firmware V13.5's second calibration step:
  // written right after CAL1 and only by the BKT1 generation. Its absence
  // is a file from before the step existed, not a fault; its presence with
  // a bad CRC is. The three vectors are read as given and checked to be
  // unit and near-orthogonal, because everything downstream rotates by
  // them and a rotation by a skewed frame would distort every figure.
  let orientation: ImuMountOrientation | undefined;
  if (
    magic === MAGIC_V1 &&
    h.flags & FLAG_CALIBRATION &&
    bytes.byteLength >= ORI_OFFSET + ORI_SIZE &&
    ascii(view, ORI_OFFSET, 4) === ORI_MAGIC
  ) {
    const storedOriCrc = view.getUint32(ORI_OFFSET + 56, true);
    if (recordCrc(u8, ORI_OFFSET, ORI_SIZE, magic) !== storedOriCrc)
      return fail(t.oriCrc);
    const f = (i: number) => view.getFloat32(ORI_OFFSET + 8 + i * 4, true);
    const v = Array.from({ length: 10 }, (_, i) => f(i));
    const up: [number, number, number] = [v[0], v[1], v[2]];
    const front: [number, number, number] = [v[3], v[4], v[5]];
    const left: [number, number, number] = [v[6], v[7], v[8]];
    const unit = (a: number[]) => Math.abs(Math.hypot(...a) - 1) < 0.01;
    const dot = (a: number[], b: number[]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (
      !v.every(Number.isFinite) ||
      !unit(up) ||
      !unit(front) ||
      !unit(left) ||
      Math.abs(dot(up, front)) > 0.02 ||
      Math.abs(dot(up, left)) > 0.02 ||
      Math.abs(dot(front, left)) > 0.02
    )
      return fail(t.oriNotOrthonormal);
    orientation = {
      up,
      front,
      left,
      confidence: v[9],
      voteCount: view.getUint16(ORI_OFFSET + 48, true),
      calibrationCount: view.getUint32(ORI_OFFSET + 52, true),
    };
  }

  const expectedSize = BLOCK_SIZE + h.totalBlocks * BLOCK_SIZE;
  if (bytes.byteLength !== expectedSize) {
    const present = Math.max(0, Math.floor(bytes.byteLength / BLOCK_SIZE) - 1);
    return fail(t.incomplete(h.totalBlocks, present));
  }

  const n = h.totalImuSamples;
  if (n === 0) return fail(t.noImuSamples);
  const tMs = new Float64Array(n);
  const ax = new Float32Array(n);
  const ay = new Float32Array(n);
  const az = new Float32Array(n);
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const gz = new Float32Array(n);
  const accelScale = h.accelScaleUg / 1_000_000;
  const gyroScale = h.gyroScaleMdps / 1000;
  // Nominal sample period in ms from a rate in millihertz: 416000 → 2.4038…
  const periodMs = 1_000_000 / h.imuRateMHz;

  const gpsKept: {
    t: number;
    lat: number;
    lon: number;
    alt: number;
    speed: number;
    heading: number;
    dist: number;
  }[] = [];

  // `first_sample_index` is the logger's NOMINAL TIMELINE, not a count of
  // stored samples: since firmware V11 a FIFO reset moves it forward by the
  // samples that were lost, so a jump between blocks is a recorded gap and
  // not corruption. Time comes from that index; the arrays stay compact
  // (only what is in the file), so `imuWritten` and `nextImuIndex` differ
  // by the samples that never made it.
  let nextImuIndex = 0;
  let nextGnssIndex = 0;
  let nextHighGIndex = 0;
  let sawHighG = false;
  let highGValues = 0;
  let highGOddValues = 0;
  const highGRaw: HighGRaw[] = [];
  let imuWritten = 0;
  // Where the IMU timeline starts, from the first block's clock stamp. Every
  // firmware so far stamps the nominal index / rate, which makes this 0; a
  // firmware that stamps the real clock (the first sample lands ~270 ms
  // after the session starts) shifts the whole IMU timeline to match the
  // GNSS clock without a format change.
  let originMs = 0;
  const imuGaps: ImuTimelineGap[] = [];
  // For the per-block time base below.
  let lastImuEndMs = -Infinity;
  let lastBlockPeriodMs = 0;
  let stampWrapMs = 0;

  for (let b = 0; b < h.totalBlocks; b++) {
    const off = BLOCK_SIZE + b * BLOCK_SIZE;
    if (ascii(view, off, 4) !== BLOCK_MAGIC) return fail(t.blockMagic(b));
    const bh = readBlockHeader(view, off);
    if (bh.sequence !== b) return fail(t.blockSequence(b, bh.sequence));
    if (bh.headerSize !== BLOCK_HEADER_SIZE)
      return fail(t.blockHeaderSize(b, bh.headerSize));

    let stream: "IMU" | "GNSS" | "HIGHG";
    if (bh.type === BLOCK_TYPE_IMU) {
      if (bh.sampleSize !== IMU_SAMPLE_SIZE)
        return fail(t.imuBlockSampleSize(b, bh.sampleSize));
      stream = "IMU";
    } else if (bh.type === BLOCK_TYPE_GNSS) {
      if (!GNSS_SAMPLE_SIZES.has(bh.sampleSize))
        return fail(t.gnssBlockSampleSize(b, bh.sampleSize));
      stream = "GNSS";
    } else if (bh.type === BLOCK_TYPE_HIGHG) {
      if (bh.flags !== HIGHG_FORMAT_V1) return fail(t.highGFormat(b, bh.flags));
      if (bh.sampleSize !== HIGHG_RECORD_SIZE)
        return fail(t.highGRecordSize(b, bh.sampleSize));
      stream = "HIGHG";
      sawHighG = true;
    } else {
      return fail(t.unknownBlockType(b, bh.type));
    }

    const maxCount = Math.floor(
      (BLOCK_SIZE - BLOCK_HEADER_SIZE) / bh.sampleSize,
    );
    if (bh.sampleCount > maxCount) return fail(t.tooManySamples(b, stream));

    const payloadStart = off + BLOCK_HEADER_SIZE;
    const payloadLen = bh.sampleCount * bh.sampleSize;
    if (
      crc32(u8.subarray(payloadStart, payloadStart + payloadLen)) !==
      bh.payloadCrc
    )
      return fail(t.blockCrc(b, stream));

    if (stream === "IMU") {
      // Backwards or overlapping is still corruption; forwards is a gap.
      if (bh.firstSampleIndex < nextImuIndex)
        return fail(t.imuIndexBackwards(b));
      if (imuWritten + bh.sampleCount > n) return fail(t.moreImuThanDeclared);
      if (imuWritten === 0)
        originMs = bh.streamTimeUs / 1000 - bh.firstSampleIndex * periodMs;
      if (bh.firstSampleIndex > nextImuIndex && imuWritten > 0)
        imuGaps.push({
          atMs: originMs + nextImuIndex * periodMs,
          durationMs: (bh.firstSampleIndex - nextImuIndex) * periodMs,
        });
      // Where this block starts and how fast it runs. The block's clock
      // stamp is the truth when the firmware stamps the real clock (V13:
      // the sensor runs at 411–419 Hz, not the header's 416, and the stamps
      // say so); the nominal index ÷ rate is the fallback when the stamp
      // is nominal itself (older firmware, where the two agree anyway) or
      // does not follow the block before it. A block's own period comes
      // from the distance to the next IMU block's stamp, so the time base
      // is the sensor's real cadence, block by block; the last block keeps
      // the cadence of the one before it.
      let blockStartMs = originMs + bh.firstSampleIndex * periodMs;
      let blockPeriodMs = periodMs;
      // V13 stamps come from a 24-bit RTC counter at 32768 Hz and wrap
      // every 512 s; a stamp that lands far behind the block before it has
      // wrapped, and takes the turns the stream has made so far.
      let stampMs = bh.streamTimeUs / 1000 + stampWrapMs;
      while (Number.isFinite(lastImuEndMs) && stampMs < lastImuEndMs - 1000) {
        stampWrapMs += RTC_WRAP_MS;
        stampMs += RTC_WRAP_MS;
      }
      if (stampMs >= lastImuEndMs - periodMs) {
        const next = nextImuStamp(view, h.totalBlocks, b);
        if (next) {
          let nextStampMs = next.stampMs + stampWrapMs;
          if (nextStampMs < stampMs) nextStampMs += RTC_WRAP_MS;
          const p =
            (nextStampMs - stampMs) /
            (next.firstSampleIndex - bh.firstSampleIndex);
          if (p > periodMs * 0.9 && p < periodMs * 1.1) {
            blockStartMs = stampMs;
            blockPeriodMs = p;
          }
        } else if (lastBlockPeriodMs > 0) {
          blockStartMs = stampMs;
          blockPeriodMs = lastBlockPeriodMs;
        }
      }
      lastBlockPeriodMs = blockPeriodMs;
      lastImuEndMs = blockStartMs + bh.sampleCount * blockPeriodMs;
      for (let i = 0; i < bh.sampleCount; i++) {
        const s = payloadStart + i * IMU_SAMPLE_SIZE;
        const idx = imuWritten + i;
        tMs[idx] = blockStartMs + i * blockPeriodMs;
        ax[idx] = view.getInt16(s, true) * accelScale;
        ay[idx] = view.getInt16(s + 2, true) * accelScale;
        az[idx] = view.getInt16(s + 4, true) * accelScale;
        gx[idx] = view.getInt16(s + 6, true) * gyroScale;
        gy[idx] = view.getInt16(s + 8, true) * gyroScale;
        gz[idx] = view.getInt16(s + 10, true) * gyroScale;
      }
      nextImuIndex = bh.firstSampleIndex + bh.sampleCount;
      imuWritten += bh.sampleCount;
    } else if (stream === "HIGHG") {
      if (bh.firstSampleIndex !== nextHighGIndex)
        return fail(t.highGIndexHole(b));
      for (let i = 0; i < bh.sampleCount; i++) {
        const s = payloadStart + i * HIGHG_RECORD_SIZE;
        const count = view.getUint8(s + 8);
        if (count > HIGHG_SAMPLES)
          return fail(t.highGTooManySamples(nextHighGIndex + i, count));
        // A window the FIFO read came back empty for is a failed capture,
        // not an event: nothing to place, nothing to read.
        if (count === 0) continue;
        const x = new Float32Array(count);
        const y = new Float32Array(count);
        const z = new Float32Array(count);
        for (let k = 0; k < count; k++) {
          const rx = view.getInt16(s + 16 + 2 * k, true);
          const ry = view.getInt16(s + 80 + 2 * k, true);
          const rz = view.getInt16(s + 144 + 2 * k, true);
          highGValues += 3;
          highGOddValues += (rx & 1) + (ry & 1) + (rz & 1);
          x[k] = rx * HIGHG_G_PER_LSB;
          y[k] = ry * HIGHG_G_PER_LSB;
          z[k] = rz * HIGHG_G_PER_LSB;
        }
        highGRaw.push({ triggerMs: view.getUint32(s, true) / 1000, x, y, z });
      }
      nextHighGIndex += bh.sampleCount;
    } else {
      if (bh.firstSampleIndex !== nextGnssIndex)
        return fail(t.gnssIndexHole(b));
      const wide = bh.sampleSize === 36;
      for (let i = 0; i < bh.sampleCount; i++) {
        const s = payloadStart + i * bh.sampleSize;
        // Field offsets: t u32 @0, lat i32 @4, lon i32 @8, alt i32 @12,
        // speed u32 @16, heading u32 @20, then either distance u32 @24 and
        // hdop u16 @28 (36-byte) or hdop u16 @24 (32-byte). satellites,
        // fix_quality and hdop are not read — see the JSON parser for why
        // hdop is not an accuracy in metres.
        const flags = view.getUint8(s + (wide ? 32 : 28));
        // The receiver's own verdict, the tunnel rule: a sample whose
        // position, altitude or speed it disowns is skipped whole — those
        // three are the strict core downstream, and a disowned value is the
        // last guess, not a reading. Heading is per field.
        if (
          !(flags & GNSS_POSITION) ||
          !(flags & GNSS_ALTITUDE) ||
          !(flags & GNSS_SPEED)
        )
          continue;
        const sampleT = view.getUint32(s, true);
        const prev = gpsKept[gpsKept.length - 1];
        if (prev && sampleT < prev.t)
          return fail(t.gnssTimeBackwards(nextGnssIndex + i, sampleT, prev.t));
        gpsKept.push({
          t: sampleT,
          lat: view.getInt32(s + 4, true) / 1e7,
          lon: view.getInt32(s + 8, true) / 1e7,
          alt: view.getInt32(s + 12, true) / 1000,
          speed: view.getUint32(s + 16, true) / 1000,
          heading:
            flags & GNSS_HEADING ? view.getUint32(s + 20, true) / 100_000 : NaN,
          dist:
            wide && flags & GNSS_ODOMETER
              ? view.getUint32(s + 24, true) / 1000
              : NaN,
        });
      }
      nextGnssIndex += bh.sampleCount;
    }
  }

  if (imuWritten !== n) return fail(t.imuCountMismatch(imuWritten, n));

  let gps: GpsChannels | null = null;
  if (gpsKept.length > 0) {
    const m = gpsKept.length;
    gps = {
      tMs: new Float64Array(m),
      latDeg: new Float64Array(m),
      lonDeg: new Float64Array(m),
      altitudeM: new Float32Array(m),
      speedMps: new Float32Array(m),
      headingDeg: new Float32Array(m),
      distanceM: new Float32Array(m),
      hAccM: new Float32Array(m).fill(NaN),
    };
    for (let i = 0; i < m; i++) {
      const s = gpsKept[i];
      gps.tMs[i] = s.t;
      gps.latDeg[i] = s.lat;
      gps.lonDeg[i] = s.lon;
      gps.altitudeM[i] = s.alt;
      gps.speedMps[i] = s.speed;
      gps.headingDeg[i] = s.heading;
      gps.distanceM[i] = s.dist;
    }
  }

  const lastT = tMs[n - 1];
  return {
    ok: true,
    session: {
      format: BKT_FORMAT,
      // "S0007", the way the logger names the file on the card — and the
      // name the import form will suggest.
      // The way the logger names the file on the card — "S0007" through
      // firmware V11, "R0006" from V13 — and the name the import form will
      // suggest.
      sessionId: `${magic === MAGIC_V1 ? "R" : "S"}${String(h.sessionId).padStart(4, "0")}`,
      durationMs: h.durationMs > 0 ? h.durationMs : lastT,
      sampleRateHz: h.imuRateMHz / 1000,
      sampleCount: n,
      // No recorded g-force in the binary: derived on read, like a JSON
      // file that omits it.
      channels: { tMs, ax, ay, az, gx, gy, gz, gForce: null },
      gps,
      // The logger detects nothing yet. Same as the exporter's JSON, which
      // carries no `events` either.
      events: [],
      calibration,
      aligned: false,
      mounting: null,
      imuGaps,
      sensorScales: { accelGPerLsb: accelScale, gyroDpsPerLsb: gyroScale },
      orientation,
      // Present — empty, even — when the file says the sensor was there:
      // header flag bit 2, or a HIGHG block. "No shock crossed the
      // threshold" and "no such sensor" are different recordings.
      ...((h.flags & FLAG_HIGHG || sawHighG) && {
        highG: placeHighGEvents(
          highGRaw,
          highGValues >= HIGHG_PARITY_MIN_VALUES && highGOddValues === 0
            ? HIGHG_FAST_RATE_HZ
            : HIGHG_RATE_HZ,
          tMs,
          ax,
          ay,
          az,
        ),
      }),
    },
  };
}
