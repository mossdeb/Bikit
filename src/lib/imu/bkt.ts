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
 *   [0, 64)      session header  "BKTL"  — CRC32 over its first 60 bytes
 *   [64, 120)    calibration     "CAL1"  — only when header flag bit 0 is set
 *   [4096, …)    blocks of 4096 bytes, each: 32-byte header "BLK1" + payload
 *                type 1 = IMU, 12-byte samples (six int16)
 *                type 2 = GNSS, 36-byte samples (or 32 in older firmware,
 *                         without the odometer)
 *
 * Strict where the JSON parser is strict, and for the same reason: a bad
 * CRC, a block out of sequence or a file shorter than its header declares is
 * a corrupt recording, not a variant, and the sample index would have a hole
 * in it. Every recusal names the block, written on screen like the rest.
 *
 * Two places this is deliberately LESS strict than the exporter:
 * - A header with the GNSS flag set but no GNSS samples is accepted, as a
 *   recording without a fix (`gps: null`). The exporter fails it; a ride
 *   under trees that never got a fix is still a ride.
 * - A GNSS sample the receiver flags invalid is skipped, not failed — the
 *   same tunnel rule the JSON path has.
 *
 * Sample time is the nominal one, `index ÷ rate`, the same the exporter
 * writes into its JSON — so a session imported either way reads the same.
 * The per-block `stream_time_us` is read and checked but not yet used to
 * correct drift; on the files seen so far it is itself nominal.
 */

import type { GpsChannels, ImuCalibration, ImuParseResult } from "./format";

export const BKT_FORMAT = "bikit_bkt";
/** What the upload declares. The bucket's allow-list has it (migration
 * 00041); the JSON path keeps `application/json`. */
export const BKT_CONTENT_TYPE = "application/octet-stream";

const MAGIC = "BKTL";
const BLOCK_MAGIC = "BLK1";
const CAL_MAGIC = "CAL1";
const SESSION_HEADER_SIZE = 64;
const BLOCK_SIZE = 4096;
const BLOCK_HEADER_SIZE = 32;
const IMU_SAMPLE_SIZE = 12;
const GNSS_SAMPLE_SIZES = new Set([32, 36]);
const BLOCK_TYPE_IMU = 1;
const BLOCK_TYPE_GNSS = 2;
const FLAG_CALIBRATION = 0x1;
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
  return ascii(new DataView(bytes), 0, 4) === MAGIC;
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
  headerSize: number;
  sequence: number;
  firstSampleIndex: number;
  sampleCount: number;
  sampleSize: number;
  payloadCrc: number;
}

function readBlockHeader(view: DataView, offset: number): BlockHeader {
  return {
    type: view.getUint8(offset + 4),
    // offset + 5: flags — unused by the firmware so far.
    headerSize: view.getUint16(offset + 6, true),
    sequence: view.getUint32(offset + 8, true),
    firstSampleIndex: view.getUint32(offset + 12, true),
    sampleCount: view.getUint16(offset + 16, true),
    sampleSize: view.getUint16(offset + 18, true),
    // offset + 20: stream_time_us (u64) — read when drift correction lands.
    payloadCrc: view.getUint32(offset + 28, true),
  };
}

const fail = (error: string): ImuParseResult => ({ ok: false, error });

export function parseBktFile(bytes: ArrayBuffer): ImuParseResult {
  if (bytes.byteLength < SESSION_HEADER_SIZE) {
    return fail("O ficheiro é mais pequeno do que o cabeçalho de 64 bytes.");
  }
  const view = new DataView(bytes);
  const u8 = new Uint8Array(bytes);
  if (ascii(view, 0, 4) !== MAGIC) {
    return fail('O ficheiro não começa pela assinatura "BKTL".');
  }
  const h = readHeader(view);

  if (h.headerSize !== SESSION_HEADER_SIZE)
    return fail(`Cabeçalho com tamanho inesperado (${h.headerSize} bytes).`);
  if (h.blockSize !== BLOCK_SIZE)
    return fail(`Blocos com tamanho inesperado (${h.blockSize} bytes).`);
  if (h.imuSampleSize !== IMU_SAMPLE_SIZE)
    return fail(
      `Amostras IMU com tamanho inesperado (${h.imuSampleSize} bytes).`,
    );
  if (crc32(u8.subarray(0, 60)) !== h.storedCrc)
    return fail("O CRC do cabeçalho não bate certo — ficheiro corrompido.");
  if (h.imuRateMHz === 0)
    return fail("O cabeçalho declara uma taxa de amostragem de zero.");
  if (h.accelScaleUg === 0 || h.gyroScaleMdps === 0)
    return fail("O cabeçalho não traz as escalas dos sensores.");

  // Calibration: validated when the header says it is there, because a bad
  // snapshot is a sign the header region itself is damaged — and read, for
  // alignSessionToBike to express the channels in the bike's frame.
  let calibration: ImuCalibration | null = null;
  if (h.flags & FLAG_CALIBRATION) {
    if (bytes.byteLength < CAL_OFFSET + CAL_SIZE)
      return fail("O bloco de calibração está truncado.");
    if (ascii(view, CAL_OFFSET, 4) !== CAL_MAGIC)
      return fail('O bloco de calibração não começa por "CAL1".');
    const storedCalCrc = view.getUint32(CAL_OFFSET + 52, true);
    if (crc32(u8.subarray(CAL_OFFSET, CAL_OFFSET + 52)) !== storedCalCrc)
      return fail("O CRC da calibração não bate certo — ficheiro corrompido.");
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

  const expectedSize = BLOCK_SIZE + h.totalBlocks * BLOCK_SIZE;
  if (bytes.byteLength !== expectedSize) {
    const present = Math.max(0, Math.floor(bytes.byteLength / BLOCK_SIZE) - 1);
    return fail(
      `Ficheiro incompleto: o cabeçalho declara ${h.totalBlocks} blocos e o ficheiro traz ${present}.`,
    );
  }

  const n = h.totalImuSamples;
  if (n === 0) return fail("O ficheiro não tem amostras IMU.");
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

  let nextImuIndex = 0;
  let nextGnssIndex = 0;
  let imuWritten = 0;

  for (let b = 0; b < h.totalBlocks; b++) {
    const off = BLOCK_SIZE + b * BLOCK_SIZE;
    if (ascii(view, off, 4) !== BLOCK_MAGIC)
      return fail(`O bloco ${b} não começa por "BLK1" — ficheiro corrompido.`);
    const bh = readBlockHeader(view, off);
    if (bh.sequence !== b)
      return fail(
        `O bloco ${b} está fora de sequência (diz ser o ${bh.sequence}).`,
      );
    if (bh.headerSize !== BLOCK_HEADER_SIZE)
      return fail(`O bloco ${b} tem um cabeçalho de ${bh.headerSize} bytes.`);

    let stream: "IMU" | "GNSS";
    if (bh.type === BLOCK_TYPE_IMU) {
      if (bh.sampleSize !== IMU_SAMPLE_SIZE)
        return fail(
          `O bloco ${b} (IMU) tem amostras de ${bh.sampleSize} bytes.`,
        );
      stream = "IMU";
    } else if (bh.type === BLOCK_TYPE_GNSS) {
      if (!GNSS_SAMPLE_SIZES.has(bh.sampleSize))
        return fail(
          `O bloco ${b} (GNSS) tem amostras de ${bh.sampleSize} bytes.`,
        );
      stream = "GNSS";
    } else {
      return fail(`O bloco ${b} é de um tipo desconhecido (${bh.type}).`);
    }

    const maxCount = Math.floor(
      (BLOCK_SIZE - BLOCK_HEADER_SIZE) / bh.sampleSize,
    );
    if (bh.sampleCount > maxCount)
      return fail(
        `O bloco ${b} (${stream}) declara mais amostras do que cabem.`,
      );

    const payloadStart = off + BLOCK_HEADER_SIZE;
    const payloadLen = bh.sampleCount * bh.sampleSize;
    if (
      crc32(u8.subarray(payloadStart, payloadStart + payloadLen)) !==
      bh.payloadCrc
    )
      return fail(
        `O CRC do bloco ${b} (${stream}) não bate certo — ficheiro corrompido.`,
      );

    if (stream === "IMU") {
      if (bh.firstSampleIndex !== nextImuIndex)
        return fail(
          `O bloco ${b} (IMU) deixa um buraco no índice das amostras.`,
        );
      if (nextImuIndex + bh.sampleCount > n)
        return fail(
          "Os blocos trazem mais amostras IMU do que o cabeçalho declara.",
        );
      for (let i = 0; i < bh.sampleCount; i++) {
        const s = payloadStart + i * IMU_SAMPLE_SIZE;
        const idx = nextImuIndex + i;
        tMs[idx] = idx * periodMs;
        ax[idx] = view.getInt16(s, true) * accelScale;
        ay[idx] = view.getInt16(s + 2, true) * accelScale;
        az[idx] = view.getInt16(s + 4, true) * accelScale;
        gx[idx] = view.getInt16(s + 6, true) * gyroScale;
        gy[idx] = view.getInt16(s + 8, true) * gyroScale;
        gz[idx] = view.getInt16(s + 10, true) * gyroScale;
      }
      nextImuIndex += bh.sampleCount;
      imuWritten += bh.sampleCount;
    } else {
      if (bh.firstSampleIndex !== nextGnssIndex)
        return fail(
          `O bloco ${b} (GNSS) deixa um buraco no índice das amostras.`,
        );
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
        const t = view.getUint32(s, true);
        const prev = gpsKept[gpsKept.length - 1];
        if (prev && t < prev.t)
          return fail(
            `O tempo anda para trás na amostra GNSS ${nextGnssIndex + i} (${t} ms após ${prev.t} ms).`,
          );
        gpsKept.push({
          t,
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

  if (imuWritten !== n)
    return fail(
      `Os blocos trazem ${imuWritten} amostras IMU e o cabeçalho declara ${n}.`,
    );

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
      sessionId: `S${String(h.sessionId).padStart(4, "0")}`,
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
    },
  };
}
