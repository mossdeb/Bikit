import { describe, expect, it } from "vitest";
import { parseImuFile } from "./format";

function sample(t: number, overrides: Record<string, number> = {}) {
  return { t_ms: t, ax_g: 0.01, ay_g: -0.02, az_g: 1.0, gx_dps: 0.5, gy_dps: -0.5, gz_dps: 1.2, g_force: 1.0002, ...overrides };
}

function gpsSample(t: number, overrides: Record<string, unknown> = {}) {
  return {
    t_ms: t,
    fix_type: 3,
    fix_valid: true,
    latitude_deg: 37.1217259,
    longitude_deg: -7.7828334,
    altitude_msl_m: 118.63,
    ground_speed_mps: 8.766,
    heading_deg: 41.93,
    distance_m: 0.88,
    horizontal_accuracy_m: 1.25,
    ...overrides,
  };
}

function demoFile(overrides: Record<string, unknown> = {}) {
  return {
    format: "bikit_imu_session",
    version: 1,
    session: { session_id: "s1", duration_ms: 30, sample_rate_hz: 100, sample_count: 4 },
    events: [
      { type: "curve", direction: "left", start_ms: 0, end_ms: 20, confidence: 0.94 },
      { type: "impact", time_ms: 10, severity: "hard", confidence: 0.96 },
      { type: "jump", takeoff_ms: 5, landing_ms: 25, airtime_ms: 20, confidence: 0.98 },
      { type: "rough_section", start_ms: 0, end_ms: 30, confidence: 0.9 },
      { type: "braking", start_ms: 20, end_ms: 30, confidence: 0.89 },
    ],
    samples: [sample(0), sample(10), sample(20), sample(30)],
    ...overrides,
  };
}

describe("parseImuFile", () => {
  it("parses the bikit_imu_session format into typed channels", () => {
    const result = parseImuFile(demoFile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.format).toBe("bikit_imu_session");
    expect(result.session.sessionId).toBe("s1");
    expect(result.session.sampleCount).toBe(4);
    expect(result.session.durationMs).toBe(30);
    expect(result.session.sampleRateHz).toBe(100);
    expect(Array.from(result.session.channels.tMs)).toEqual([0, 10, 20, 30]);
    expect(result.session.channels.gForce).not.toBeNull();
    expect(result.session.channels.gForce![0]).toBeCloseTo(1.0002, 4);
    expect(result.session.events).toHaveLength(5);
  });

  it("rejects a file of another format with a readable error", () => {
    const result = parseImuFile({ format: "garmin_fit", samples: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("bikit_imu_session");
  });

  it("rejects a file without samples", () => {
    const result = parseImuFile(demoFile({ samples: [] }));
    expect(result.ok).toBe(false);
  });

  it("rejects a sample with a missing axis — corrupt, not a variant", () => {
    const bad = demoFile();
    delete (bad.samples[2] as Record<string, unknown>).az_g;
    const result = parseImuFile(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("amostra 2");
  });

  it("rejects time running backwards", () => {
    const result = parseImuFile(demoFile({ samples: [sample(0), sample(20), sample(10)] }));
    expect(result.ok).toBe(false);
  });

  it("marks gForce as absent when any sample lacks it, instead of inventing zeros", () => {
    const file = demoFile();
    delete (file.samples[1] as Record<string, unknown>).g_force;
    const result = parseImuFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.channels.gForce).toBeNull();
  });

  it("drops unknown event types without failing the file", () => {
    const file = demoFile({
      events: [
        { type: "curve", direction: "left", start_ms: 0, end_ms: 20 },
        { type: "wheelie", start_ms: 5, end_ms: 6 },
      ],
    });
    const result = parseImuFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.events).toHaveLength(1);
    expect(result.session.events[0].kind).toBe("curve");
    expect(result.session.events[0].confidence).toBeNull();
  });

  it("parses a drop as its own kind, shaped like a jump", () => {
    const file = demoFile({
      events: [{ type: "drop", takeoff_ms: 100, landing_ms: 900, confidence: 0.9 }],
    });
    const result = parseImuFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const drop = result.session.events[0];
    expect(drop.kind).toBe("drop");
    if (drop.kind !== "drop") return;
    expect(drop.airtimeMs).toBe(800);
    expect(drop.landingMs).toBe(900);
  });

  it("derives a jump's airtime from takeoff and landing when absent", () => {
    const file = demoFile({ events: [{ type: "jump", takeoff_ms: 5, landing_ms: 25 }] });
    const result = parseImuFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const jump = result.session.events[0];
    expect(jump.kind).toBe("jump");
    if (jump.kind !== "jump") return;
    expect(jump.airtimeMs).toBe(20);
  });

  it("reads gps as null when the file has no gps_samples — a v1 file", () => {
    const result = parseImuFile(demoFile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.gps).toBeNull();
  });

  it("parses gps_samples into typed channels, doubles for the coordinates", () => {
    const result = parseImuFile(demoFile({ gps_samples: [gpsSample(0), gpsSample(100, { ground_speed_mps: 9.0 })] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const gps = result.session.gps;
    expect(gps).not.toBeNull();
    expect(Array.from(gps!.tMs)).toEqual([0, 100]);
    // Float64 keeps the seventh decimal a Float32 would round away.
    expect(gps!.latDeg[0]).toBe(37.1217259);
    expect(gps!.lonDeg[0]).toBe(-7.7828334);
    expect(gps!.speedMps[1]).toBeCloseTo(9.0, 5);
    expect(gps!.headingDeg[0]).toBeCloseTo(41.93, 5);
    expect(gps!.distanceM[0]).toBeCloseTo(0.88, 5);
  });

  it("skips a gps sample without a valid fix — a tunnel, not corruption", () => {
    const result = parseImuFile(
      demoFile({ gps_samples: [gpsSample(0), gpsSample(100, { fix_valid: false }), gpsSample(200)] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.from(result.session.gps!.tMs)).toEqual([0, 200]);
  });

  it("reads gps as null when every fix is invalid, instead of an empty track", () => {
    const result = parseImuFile(demoFile({ gps_samples: [gpsSample(0, { fix_valid: false })] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.gps).toBeNull();
  });

  it("rejects a gps sample missing its coordinates — corrupt, not a variant", () => {
    const bad = gpsSample(100) as Record<string, unknown>;
    delete bad.latitude_deg;
    const result = parseImuFile(demoFile({ gps_samples: [gpsSample(0), bad] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("GPS 1");
  });

  it("rejects gps time running backwards", () => {
    const result = parseImuFile(demoFile({ gps_samples: [gpsSample(100), gpsSample(0)] }));
    expect(result.ok).toBe(false);
  });

  it("tolerates a gps sample without heading or distance — NaN, not a failure", () => {
    const bare = gpsSample(0) as Record<string, unknown>;
    delete bare.heading_deg;
    delete bare.distance_m;
    delete bare.horizontal_accuracy_m;
    const result = parseImuFile(demoFile({ gps_samples: [bare] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number.isNaN(result.session.gps!.headingDeg[0])).toBe(true);
    expect(Number.isNaN(result.session.gps!.distanceM[0])).toBe(true);
  });

  it("measures the sample rate off the recording when the metadata omits it", () => {
    const file = demoFile();
    delete (file.session as Record<string, unknown>).sample_rate_hz;
    const result = parseImuFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 4 samples across 30 ms → 3 intervals / 0.03 s = 100 Hz.
    expect(result.session.sampleRateHz).toBeCloseTo(100, 5);
  });
});
