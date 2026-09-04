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

function buildBkt(
  blocks: (ImuBlock | GnssBlock)[],
  overrides: {
    sessionId?: number;
    durationMs?: number;
    totalImuSamples?: number;
    calibration?: boolean;
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

  put(0, "BKTL");
  view.setUint8(4, 1);
  view.setUint8(5, 2);
  view.setUint16(6, 64, true);
  const cal = overrides.calibration ?? true;
  view.setUint32(8, (cal ? 1 : 0) | 2, true);
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
  const headerCrc = crc32(u8.subarray(0, 60));
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
    view.setUint32(116, crc32(u8.subarray(64, 116)), true);
  }

  let imuIndex = 0;
  let gnssIndex = 0;
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
    const size = b.type === 1 ? 12 : b.size;
    view.setUint16(off + 16, b.samples.length, true);
    view.setUint16(off + 18, size, true);
    view.setBigUint64(off + 20, BigInt(0), true);
    if (b.type === 1) {
      view.setUint32(off + 12, imuIndex, true);
      b.samples.forEach((s, i) => {
        const p = off + 32 + i * 12;
        s.forEach((v, k) => view.setInt16(p + k * 2, v, true));
      });
      imuIndex += b.samples.length;
    } else {
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
    const payload = u8.subarray(off + 32, off + 32 + b.samples.length * size);
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
