import { describe, expect, it } from "vitest";
import { crc32, isBktFile, parseBktFile, BKT_FORMAT } from "./bkt";
import { parseImuBytes } from "./format";

/**
 * Builds a valid .BKT in memory, the way the firmware lays it out, so every
 * test starts from a file that passes and breaks exactly one thing. The
 * CRCs come from the same crc32 the parser uses — which is why there is a
 * known-answer test for crc32 itself below: a broken crc32 would otherwise
 * agree with itself and hide.
 */

const BLOCK = 4096;
const RATE_MHZ = 416_000;
const ACCEL_SCALE_UG = 488;
const GYRO_SCALE_MDPS = 70;

interface ImuBlock {
  type: 1;
  samples: [number, number, number, number, number, number][];
  /** Timeline samples the logger lost before this block (a FIFO reset):
   * advances first_sample_index without adding samples, as V11 does. */
  skipBefore?: number;
  /** The block's stream_time_us stamp; nominal index / rate when absent. */
  streamTimeUs?: number;
}
interface GnssSample {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  speed: number;
  heading: number;
  dist: number;
  flags: number;
}
interface GnssBlock {
  type: 2;
  size: 32 | 36;
  samples: GnssSample[];
}

/** One ADXL375 shock event as firmware V15 writes it: 208 bytes, the
 * three axes as three arrays. The window rests at 1 g on z (20 LSB of
 * 49 mg) and peaks on x at `peakIndex`. */
interface HighGEventSpec {
  triggerUs: number;
  count?: number;
  peakLsb?: number;
  peakIndex?: number;
  /** Every raw value even, the way the part reports at 3200 Hz; the
   * default rests y at −3 LSB, as it would at 800 Hz. */
  even?: boolean;
}
interface HighGBlock {
  type: 3;
  events: HighGEventSpec[];
  /** The block's flags byte — the record layout; 0x01 is V15's. */
  format?: number;
}

function buildBkt(
  blocks: (ImuBlock | GnssBlock | HighGBlock)[],
  overrides: {
    /** Header flag bit 2, which firmware V15 sets on every file. */
    highGFlag?: boolean;
    /** "BKT1" builds firmware V13's header: CRC over all 64 bytes with the
     * CRC field zeroed. Default is the exporter-era "BKTL". */
    magic?: "BKTL" | "BKT1";
    sessionId?: number;
    durationMs?: number;
    totalImuSamples?: number;
    calibration?: boolean;
    /** Write firmware V13.5's ORI1 record after CAL1 (BKT1 only). */
    orientation?: boolean;
    breakOrientationCrc?: boolean;
    breakHeaderCrc?: boolean;
    breakBlockCrc?: number;
    breakSequence?: number;
    truncateBlocks?: number;
  } = {},
): ArrayBuffer {
  const imuTotal =
    overrides.totalImuSamples ??
    blocks.reduce((n, b) => (b.type === 1 ? n + b.samples.length : n), 0);
  const total = blocks.length;
  const buf = new ArrayBuffer(BLOCK + total * BLOCK);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const put = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  const magic = overrides.magic ?? "BKTL";
  put(0, magic);
  view.setUint8(4, 1);
  view.setUint8(5, magic === "BKT1" ? 0 : 2);
  view.setUint16(6, 64, true);
  const cal = overrides.calibration ?? true;
  view.setUint32(8, (cal ? 1 : 0) | 2 | (overrides.highGFlag ? 4 : 0), true);
  view.setUint32(12, overrides.sessionId ?? 7, true);
  view.setBigUint64(16, BigInt(0), true);
  // BigInt() calls and not `0n` literals: the tsconfig target predates them.
  view.setBigUint64(24, BigInt(78_450_993), true);
  view.setUint32(32, RATE_MHZ, true);
  view.setUint16(36, 16, true);
  view.setUint16(38, 2000, true);
  view.setUint16(40, ACCEL_SCALE_UG, true);
  view.setUint16(42, GYRO_SCALE_MDPS, true);
  view.setUint16(44, 12, true);
  view.setUint16(46, BLOCK, true);
  view.setUint32(48, imuTotal, true);
  view.setUint32(52, total, true);
  view.setUint32(56, overrides.durationMs ?? 10_131, true);
  // With the CRC field still zero, the V13 CRC is simply over the 64 bytes.
  const headerCrc =
    magic === "BKT1" ? crc32(u8.subarray(0, 64)) : crc32(u8.subarray(0, 60));
  view.setUint32(
    60,
    overrides.breakHeaderCrc ? headerCrc ^ 1 : headerCrc,
    true,
  );

  if (cal) {
    put(64, "CAL1");
    view.setUint8(68, 1);
    const floats = [0.31, -0.13, 0.94, 1.6, -2.2, -0.3, 1.0, 0.004, 0.2];
    floats.forEach((f, i) => view.setFloat32(72 + i * 4, f, true));
    view.setUint32(108, 2000, true);
    view.setUint32(112, 3, true);
    // Legacy: CRC over the 52 bytes before the field. BKT1: over all 56
    // with the field zero — which it still is at this point.
    view.setUint32(
      116,
      magic === "BKT1"
        ? crc32(u8.subarray(64, 120))
        : crc32(u8.subarray(64, 116)),
      true,
    );
  }

  if (overrides.orientation) {
    // A right-handed frame: up is the calibration's gravity direction,
    // front a unit vector normal to it, left = up × front.
    put(128, "ORI1");
    view.setUint8(132, 1);
    const up = [0.31, -0.13, 0.94];
    const un = Math.hypot(...up);
    const u = up.map((x) => x / un);
    const f0 = [1, 0, 0];
    const d = f0[0] * u[0];
    let f = [f0[0] - d * u[0], -d * u[1], -d * u[2]];
    const fn = Math.hypot(...f);
    f = f.map((x) => x / fn);
    const l = [
      u[1] * f[2] - u[2] * f[1],
      u[2] * f[0] - u[0] * f[2],
      u[0] * f[1] - u[1] * f[0],
    ];
    [...u, ...f, ...l, 0.716].forEach((x, i) =>
      view.setFloat32(136 + i * 4, x, true),
    );
    view.setUint16(176, 6, true);
    view.setUint32(180, 1, true);
    const oriCrc = crc32(u8.subarray(128, 188));
    view.setUint32(
      184,
      overrides.breakOrientationCrc ? oriCrc ^ 1 : oriCrc,
      true,
    );
  }

  let imuIndex = 0;
  let gnssIndex = 0;
  let highGIndex = 0;
  blocks.forEach((b, seq) => {
    const off = BLOCK + seq * BLOCK;
    put(off, "BLK1");
    view.setUint8(off + 4, b.type);
    view.setUint16(off + 6, 32, true);
    view.setUint32(
      off + 8,
      overrides.breakSequence === seq ? seq + 5 : seq,
      true,
    );
    const size = b.type === 1 ? 12 : b.type === 3 ? 208 : b.size;
    const count = b.type === 3 ? b.events.length : b.samples.length;
    view.setUint16(off + 16, count, true);
    view.setUint16(off + 18, size, true);
    if (b.type === 3) {
      view.setUint8(off + 5, b.format ?? 1);
      view.setUint32(off + 12, highGIndex, true);
      view.setBigUint64(off + 20, BigInt(b.events[0]?.triggerUs ?? 0), true);
      b.events.forEach((e, i) => {
        const p = off + 32 + i * 208;
        const n = e.count ?? 32;
        view.setUint32(p, e.triggerUs, true);
        view.setUint32(p + 4, Math.round((e.triggerUs * 32768) / 1e6), true);
        view.setUint8(p + 8, n);
        view.setUint8(p + 9, e.peakIndex ?? 16);
        view.setUint16(p + 10, 1, true);
        view.setUint16(p + 12, Math.round((e.peakLsb ?? 200) * 49), true);
        for (let k = 0; k < Math.min(n, 32); k++) {
          view.setInt16(
            p + 16 + 2 * k,
            k === (e.peakIndex ?? 16) ? (e.peakLsb ?? 200) : 0,
            true,
          );
          view.setInt16(p + 80 + 2 * k, e.even ? -4 : -3, true);
          view.setInt16(p + 144 + 2 * k, 20, true);
        }
      });
      highGIndex += b.events.length;
    } else if (b.type === 1) {
      imuIndex += b.skipBefore ?? 0;
      view.setBigUint64(
        off + 20,
        BigInt(
          b.streamTimeUs ?? Math.round((imuIndex * 1_000_000_000) / RATE_MHZ),
        ),
        true,
      );
      view.setUint32(off + 12, imuIndex, true);
      b.samples.forEach((s, i) => {
        const p = off + 32 + i * 12;
        s.forEach((v, k) => view.setInt16(p + k * 2, v, true));
      });
      imuIndex += b.samples.length;
    } else {
      view.setBigUint64(off + 20, BigInt(0), true);
      view.setUint32(off + 12, gnssIndex, true);
      b.samples.forEach((s, i) => {
        const p = off + 32 + i * size;
        view.setUint32(p, s.t, true);
        view.setInt32(p + 4, Math.round(s.lat * 1e7), true);
        view.setInt32(p + 8, Math.round(s.lon * 1e7), true);
        view.setInt32(p + 12, Math.round(s.alt * 1000), true);
        view.setUint32(p + 16, Math.round(s.speed * 1000), true);
        view.setUint32(p + 20, Math.round(s.heading * 100_000), true);
        if (size === 36) {
          view.setUint32(p + 24, Math.round(s.dist * 1000), true);
          view.setUint16(p + 28, 264, true);
          view.setUint8(p + 30, 12);
          view.setUint8(p + 31, 2);
          view.setUint8(p + 32, s.flags);
        } else {
          view.setUint16(p + 24, 264, true);
          view.setUint8(p + 26, 12);
          view.setUint8(p + 27, 2);
          view.setUint8(p + 28, s.flags);
        }
      });
      gnssIndex += b.samples.length;
    }
    const payload = u8.subarray(off + 32, off + 32 + count * size);
    const crc = crc32(payload);
    view.setUint32(
      off + 28,
      overrides.breakBlockCrc === seq ? crc ^ 1 : crc,
      true,
    );
  });

  if (overrides.truncateBlocks != null) {
    return buf.slice(0, BLOCK + overrides.truncateBlocks * BLOCK);
  }
  return buf;
}

const imuBlock = (count: number, raw = 2048): ImuBlock => ({
  type: 1,
  samples: Array.from({ length: count }, () => [10, -20, raw, 23, -32, 4]),
});

const gnss = (t: number, over: Partial<GnssSample> = {}): GnssSample => ({
  t,
  lat: 37.0163977,
  lon: -7.9313235,
  alt: 52.2,
  speed: 0.25,
  heading: 41.93,
  dist: 12.345,
  flags: 0x1f,
  ...over,
});

describe("crc32", () => {
  it("matches the IEEE check value zlib produces", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("parseBktFile", () => {
  it("reads the header, scales the raw counts and times the samples nominally", () => {
    const result = parseBktFile(buildBkt([imuBlock(338), imuBlock(100)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.session;
    expect(s.format).toBe(BKT_FORMAT);
    expect(s.sessionId).toBe("S0007");
    expect(s.sampleRateHz).toBe(416);
    expect(s.sampleCount).toBe(438);
    expect(s.durationMs).toBe(10_131);
    // 2048 × 488 µg = 0.999424 g; 23 × 70 mdps = 1.61 °/s.
    expect(s.channels.az[0]).toBeCloseTo(0.999424, 5);
    expect(s.channels.gx[0]).toBeCloseTo(1.61, 5);
    // Nominal period: 1/416 s = 2.4038… ms; sample 338 opens the second block.
    expect(s.channels.tMs[0]).toBe(0);
    expect(s.channels.tMs[338]).toBeCloseTo(338 * (1000 / 416), 6);
    // No recorded g-force in the binary — derived on read.
    expect(s.channels.gForce).toBeNull();
    expect(s.events).toEqual([]);
    expect(s.gps).toBeNull();
  });

  it('reads firmware V13\'s "BKT1" header, whose CRC covers all 64 bytes', () => {
    const bytes = buildBkt([imuBlock(10)], {
      magic: "BKT1",
      calibration: false,
    });
    expect(isBktFile(bytes)).toBe(true);
    const result = parseBktFile(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.sampleCount).toBe(10);
    expect(result.session.calibration).toBeNull();
    // The legacy 60-byte CRC would not have matched: a broken one still fails.
    const broken = buildBkt([imuBlock(10)], {
      magic: "BKT1",
      calibration: false,
      breakHeaderCrc: true,
    });
    expect(parseBktFile(broken).ok).toBe(false);
  });

  it("accepts a timeline gap between blocks and times the samples past it", () => {
    // Firmware V11: a FIFO reset lost 200 nominal samples; the next block's
    // first_sample_index jumps by them and the file holds 20 samples.
    const result = parseBktFile(
      buildBkt([imuBlock(10), { ...imuBlock(10), skipBefore: 200 }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.session;
    const period = 1000 / 416;
    expect(s.sampleCount).toBe(20);
    expect(s.channels.tMs.length).toBe(20);
    // Three decimals: the builder stamps blocks to the microsecond, and the
    // per-block period derived from those stamps carries that rounding.
    expect(s.channels.tMs[9]).toBeCloseTo(9 * period, 3);
    expect(s.channels.tMs[10]).toBeCloseTo(210 * period, 3);
    expect(s.imuGaps).toHaveLength(1);
    expect(s.imuGaps![0].atMs).toBeCloseTo(10 * period, 6);
    expect(s.imuGaps![0].durationMs).toBeCloseTo(200 * period, 6);
  });

  it("reads firmware V13.5's ORI1 orientation after a BKT1 calibration", () => {
    const result = parseBktFile(
      buildBkt([imuBlock(10)], { magic: "BKT1", orientation: true }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.session;
    expect(s.calibration).not.toBeNull();
    const o = s.orientation!;
    expect(o.confidence).toBeCloseTo(0.716, 5);
    expect(o.voteCount).toBe(6);
    expect(o.calibrationCount).toBe(1);
    // up is the calibration's gravity direction; the frame is orthonormal.
    const g = s.calibration!.gravityRefG;
    const gn = Math.hypot(...g);
    expect(o.up[0]).toBeCloseTo(g[0] / gn, 5);
    expect(o.up[2]).toBeCloseTo(g[2] / gn, 5);
    const dot = (a: number[], b: number[]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(o.up, o.front)).toBeCloseTo(0, 5);
    expect(dot(o.front, o.left)).toBeCloseTo(0, 5);
    expect(Math.hypot(...o.left)).toBeCloseTo(1, 5);
    // A legacy file has no such record and says nothing about it.
    const legacy = parseBktFile(buildBkt([imuBlock(10)]));
    expect(legacy.ok && legacy.session.orientation).toBeUndefined();
    // A damaged record is a corrupt file, not a missing feature.
    const broken = parseBktFile(
      buildBkt([imuBlock(10)], {
        magic: "BKT1",
        orientation: true,
        breakOrientationCrc: true,
      }),
    );
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toMatch(/orientação/);
  });

  it("times the samples by the blocks' real clock stamps when the firmware stamps them", () => {
    // Firmware V13: 338 samples per block and the sensor really running at
    // ~419 Hz, so consecutive stamps are 806.15 ms apart, not 812.5.
    const result = parseBktFile(
      buildBkt([
        { ...imuBlock(338), streamTimeUs: 1_648 },
        { ...imuBlock(338), streamTimeUs: 807_800 },
        { ...imuBlock(100), streamTimeUs: 1_613_950 },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.session.channels.tMs;
    expect(t[0]).toBeCloseTo(1.648, 3);
    expect(t[338]).toBeCloseTo(807.8, 3);
    expect(t[1] - t[0]).toBeCloseTo(806.152 / 338, 4);
    // The last block keeps the cadence of the one before it.
    expect(t[676]).toBeCloseTo(1613.95, 3);
    expect(t[677] - t[676]).toBeCloseTo(806.15 / 338, 4);
  });

  it("unwraps V13 clock stamps, which turn over every 512 s", () => {
    // Real times 511.6 s, 512.406 s, 513.212 s; the RTC counter wrapped
    // between the first two blocks, so the stored stamps drop to 0.406 s.
    const result = parseBktFile(
      buildBkt([
        { ...imuBlock(338), streamTimeUs: 511_600_000 },
        { ...imuBlock(338), streamTimeUs: 406_150 },
        { ...imuBlock(100), streamTimeUs: 1_212_300 },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.session.channels.tMs;
    expect(t[0]).toBeCloseTo(511_600, 3);
    expect(t[338]).toBeCloseTo(512_406.15, 3);
    expect(t[676]).toBeCloseTo(513_212.3, 3);
    expect(t[338] - t[337]).toBeCloseTo(806.15 / 338, 3);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });

  it("moves the IMU origin by the first block's clock stamp", () => {
    // A firmware that stamps the real clock: the first sample landed 274 ms
    // after the session started. Every sample time shifts by it.
    const result = parseBktFile(
      buildBkt([{ ...imuBlock(10), streamTimeUs: 274_000 }, imuBlock(10)]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.channels.tMs[0]).toBeCloseTo(274, 6);
    expect(result.session.channels.tMs[10]).toBeCloseTo(
      274 + 10 * (1000 / 416),
      6,
    );
    expect(result.session.imuGaps).toEqual([]);
  });

  it("still rejects an index that goes backwards", () => {
    const bytes = buildBkt([imuBlock(10), imuBlock(10)]);
    // Rewrite the second block's first_sample_index to 5 and refresh nothing
    // else: the index is not under the payload CRC.
    new DataView(bytes).setUint32(BLOCK * 2 + 12, 5, true);
    const result = parseBktFile(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/volta atrás/);
  });

  it("decodes 36-byte GNSS records into the same channels the JSON path fills", () => {
    const result = parseBktFile(
      buildBkt([
        imuBlock(10),
        { type: 2, size: 36, samples: [gnss(91), gnss(1091, { speed: 8.5 })] },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gps = result.session.gps!;
    expect(Array.from(gps.tMs)).toEqual([91, 1091]);
    expect(gps.latDeg[0]).toBeCloseTo(37.0163977, 7);
    expect(gps.lonDeg[0]).toBeCloseTo(-7.9313235, 7);
    expect(gps.altitudeM[0]).toBeCloseTo(52.2, 3);
    expect(gps.speedMps[1]).toBeCloseTo(8.5, 3);
    expect(gps.headingDeg[0]).toBeCloseTo(41.93, 4);
    expect(gps.distanceM[0]).toBeCloseTo(12.345, 3);
    // hdop is not an accuracy in metres and is not mapped.
    expect(Number.isNaN(gps.hAccM[0])).toBe(true);
  });

  it("honours the validity flags: no heading is NaN, no position skips the sample", () => {
    const result = parseBktFile(
      buildBkt([
        imuBlock(10),
        {
          type: 2,
          size: 36,
          samples: [
            gnss(0, { flags: 0x1f & ~0x08 }), // heading invalid
            gnss(1000, { flags: 0x1f & ~0x01 }), // position invalid
            gnss(2000, { flags: 0x1f & ~0x10 }), // odometer invalid
          ],
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gps = result.session.gps!;
    expect(Array.from(gps.tMs)).toEqual([0, 2000]);
    expect(Number.isNaN(gps.headingDeg[0])).toBe(true);
    expect(gps.headingDeg[1]).toBeCloseTo(41.93, 4);
    expect(Number.isNaN(gps.distanceM[1])).toBe(true);
  });

  it("reads legacy 32-byte GNSS records, which carry no odometer", () => {
    const result = parseBktFile(
      buildBkt([imuBlock(10), { type: 2, size: 32, samples: [gnss(500)] }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gps = result.session.gps!;
    expect(gps.speedMps[0]).toBeCloseTo(0.25, 3);
    expect(Number.isNaN(gps.distanceM[0])).toBe(true);
  });

  it("accepts the GNSS flag with every fix invalid as a recording without GPS", () => {
    const result = parseBktFile(
      buildBkt([
        imuBlock(10),
        { type: 2, size: 36, samples: [gnss(0, { flags: 0 })] },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.gps).toBeNull();
  });

  it("rejects a header whose CRC does not match", () => {
    const result = parseBktFile(
      buildBkt([imuBlock(10)], { breakHeaderCrc: true }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("CRC do cabeçalho");
  });

  it("rejects a block whose payload CRC does not match, naming the block", () => {
    const result = parseBktFile(
      buildBkt([imuBlock(10), imuBlock(10)], { breakBlockCrc: 1 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("bloco 1");
  });

  it("rejects a block out of sequence", () => {
    const result = parseBktFile(
      buildBkt([imuBlock(10), imuBlock(10)], { breakSequence: 1 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("fora de sequência");
  });

  it("rejects a truncated file, saying how many blocks are missing", () => {
    const result = parseBktFile(
      buildBkt([imuBlock(10), imuBlock(10), imuBlock(10)], {
        truncateBlocks: 2,
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("declara 3 blocos");
    expect(result.error).toContain("traz 2");
  });

  it("rejects a header that declares more IMU samples than the blocks carry", () => {
    const result = parseBktFile(
      buildBkt([imuBlock(10)], { totalImuSamples: 12 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("cabeçalho declara 12");
  });

  it("rejects a file without the BKTL magic", () => {
    const buf = buildBkt([imuBlock(10)]);
    new Uint8Array(buf)[0] = 0x58;
    expect(isBktFile(buf)).toBe(false);
    const result = parseBktFile(buf);
    expect(result.ok).toBe(false);
  });
});

describe("parseBktFile — firmware V15's high-g events", () => {
  it("reads the ADXL375's shock windows, three arrays per event, onto the IMU's clock", () => {
    const result = parseBktFile(
      buildBkt(
        [
          imuBlock(338),
          imuBlock(338),
          {
            type: 3,
            events: [
              { triggerUs: 300_000, peakLsb: 200, peakIndex: 16 },
              { triggerUs: 1_200_000, peakLsb: 260, peakIndex: 15 },
            ],
          },
        ],
        { magic: "BKT1", highGFlag: true },
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = result.session.highG!;
    expect(events).toHaveLength(2);
    expect(events[0].timeMs).toBeCloseTo(300, 6);
    expect(events[1].timeMs).toBeCloseTo(1200, 6);
    // 200 LSB of 49 mg on x, over the −3 and 20 LSB the other axes rest at.
    expect(events[0].peakG).toBeCloseTo(Math.hypot(200, 3, 20) * 0.049, 4);
    expect(events[0].peakIndex).toBe(16);
    expect(events[1].peakIndex).toBe(15);
    expect(events[0].sampleRateHz).toBe(800);
    expect(events[0].preTriggerSamples).toBe(16);
    // Three arrays, not interleaved triplets: y is −3 LSB all the way.
    expect(events[0].x[16]).toBeCloseTo(9.8, 4);
    expect(events[0].x[15]).toBe(0);
    expect([...events[0].y].every((v) => Math.abs(v + 0.147) < 1e-6)).toBe(
      true,
    );
    expect(events[0].z[31]).toBeCloseTo(0.98, 4);
    // The IMU side of the file is untouched by the extra block.
    expect(result.session.sampleCount).toBe(676);
  });

  it("reads the faster window of the later firmware off the samples' parity", () => {
    // Same layout, same header version, four times the rate: at 3200 Hz
    // the ADXL375's output LSB is always 0, and that is all the file says.
    const fast = parseBktFile(
      buildBkt(
        [
          imuBlock(338),
          {
            type: 3,
            events: [
              { triggerUs: 300_000, even: true },
              { triggerUs: 600_000, even: true },
            ],
          },
        ],
        { magic: "BKT1", highGFlag: true },
      ),
    );
    expect(fast.ok && fast.session.highG?.map((e) => e.sampleRateHz)).toEqual([
      3200, 3200,
    ]);
    // One odd value anywhere and it is the older rate.
    const mixed = parseBktFile(
      buildBkt(
        [
          imuBlock(338),
          {
            type: 3,
            events: [
              { triggerUs: 300_000, even: true },
              { triggerUs: 600_000 },
            ],
          },
        ],
        { magic: "BKT1", highGFlag: true },
      ),
    );
    expect(mixed.ok && mixed.session.highG?.map((e) => e.sampleRateHz)).toEqual(
      [800, 800],
    );
  });

  it("tells a sensor that caught nothing from a file with no such sensor", () => {
    const v15 = parseBktFile(
      buildBkt([imuBlock(100)], { magic: "BKT1", highGFlag: true }),
    );
    const v13 = parseBktFile(buildBkt([imuBlock(100)], { magic: "BKT1" }));
    expect(v15.ok && v15.session.highG).toEqual([]);
    expect(v13.ok && v13.session.highG).toBeUndefined();
  });

  it("drops a capture whose FIFO read came back empty, and keeps the rest", () => {
    const result = parseBktFile(
      buildBkt(
        [
          imuBlock(338),
          {
            type: 3,
            events: [{ triggerUs: 100_000, count: 0 }, { triggerUs: 400_000 }],
          },
        ],
        { magic: "BKT1", highGFlag: true },
      ),
    );
    expect(result.ok && result.session.highG?.map((e) => e.timeMs)).toEqual([
      400,
    ]);
  });

  it("unwraps a trigger past 512 s: by the order of the events, and by where the IMU felt the hit", () => {
    // The IMU timeline: a block at 0 s with a hit at 0,3 s, a gap, a block
    // at 511,6 s, and one whose stamp has wrapped to 0,406 s — really
    // 512,406 s — with a hit at 512,5 s.
    const hitAt = (block: ImuBlock, index: number): ImuBlock => ({
      ...block,
      samples: block.samples.map((sample, i) =>
        i === index ? [10, -20, 20000, 23, -32, 4] : sample,
      ),
    });
    const result = parseBktFile(
      buildBkt(
        [
          { ...hitAt(imuBlock(338), 125), streamTimeUs: 0 },
          { ...imuBlock(338), skipBefore: 212_491, streamTimeUs: 511_600_000 },
          { ...hitAt(imuBlock(100), 40), streamTimeUs: 406_150 },
          {
            type: 3,
            events: [
              // Two turns would hold it; the IMU felt it in the first.
              { triggerUs: 300_000 },
              // Reads 0,5 s, earlier than nothing before it — but the hit
              // the IMU felt is a turn later.
              { triggerUs: 500_000 },
              // Reads 0,6 s, which is before the event ahead of it.
              { triggerUs: 600_000 },
            ],
          },
        ],
        { magic: "BKT1", highGFlag: true },
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const wrap = (2 ** 24 / 32768) * 1000;
    const times = result.session.highG!.map((e) => e.timeMs);
    expect(times[0]).toBeCloseTo(300, 6);
    expect(times[1]).toBeCloseTo(500 + wrap, 6);
    expect(times[2]).toBeCloseTo(600 + wrap, 6);
  });

  it("rejects an event layout it does not know, and a record of the wrong size", () => {
    const unknown = parseBktFile(
      buildBkt(
        [imuBlock(100), { type: 3, format: 2, events: [{ triggerUs: 1 }] }],
        { magic: "BKT1", highGFlag: true },
      ),
    );
    expect(unknown).toEqual({
      ok: false,
      error: "O bloco 1 (HIGHG) traz um formato de evento desconhecido (2).",
    });
    const tooMany = parseBktFile(
      buildBkt(
        [imuBlock(100), { type: 3, events: [{ triggerUs: 1, count: 40 }] }],
        { magic: "BKT1", highGFlag: true },
      ),
    );
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toMatch(/declara 40 amostras/);
  });
});

describe("parseImuBytes", () => {
  it("routes a BKT buffer to the binary parser", () => {
    const result = parseImuBytes(buildBkt([imuBlock(10)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.format).toBe(BKT_FORMAT);
  });

  it("routes text to the JSON parser", () => {
    const json = {
      format: "bikit_imu_session",
      session: { session_id: "s1" },
      samples: [
        { t_ms: 0, ax_g: 0, ay_g: 0, az_g: 1, gx_dps: 0, gy_dps: 0, gz_dps: 0 },
      ],
    };
    const result = parseImuBytes(
      new TextEncoder().encode(JSON.stringify(json)).buffer,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.format).toBe("bikit_imu_session");
  });

  it("names both formats when the bytes are neither", () => {
    const result = parseImuBytes(new TextEncoder().encode("not a file").buffer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(".BKT");
  });
});
