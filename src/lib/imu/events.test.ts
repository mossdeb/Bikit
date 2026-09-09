import { describe, expect, it } from "vitest";
import type { GpsChannels, ImuSessionData } from "./format";
import { detectBikeFrameEvents, detectImuEvents } from "./events";

/**
 * A recording drawn by hand: 1 g at rest with a little road noise, then
 * the things the detector must tell apart — a jump (free fall, then a
 * landing), a lone hard hit, a soft bump, and a dip too short to be
 * flight. 400 Hz, like the logger.
 */
const RATE = 400;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

function recording(seconds: number, shape: (tS: number) => number | null) {
  const n = seconds * RATE;
  const rnd = rng(3);
  const tMs = new Float64Array(n);
  const az = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    tMs[i] = t * 1000;
    const forced = shape(t);
    az[i] = forced ?? 1 + 0.05 * rnd();
  }
  const zeros = new Float32Array(n);
  const session: ImuSessionData = {
    format: "test",
    sessionId: null,
    durationMs: seconds * 1000,
    sampleRateHz: RATE,
    sampleCount: n,
    channels: {
      tMs,
      ax: zeros,
      ay: zeros,
      az,
      gx: zeros,
      gy: zeros,
      gz: zeros,
      gForce: null,
    },
    gps: null,
    events: [],
    calibration: null,
    aligned: false,
    mounting: null,
  };
  return session;
}

describe("detectImuEvents", () => {
  it("finds a jump by its free fall and landing, and a lone hard hit, and nothing else", () => {
    const s = recording(20, (t) => {
      // Jump: a 2.2 g pop off the lip, 0.30 s in the air from 5.00 s, a
      // 4.5 g landing at 5.32 s.
      if (t >= 4.9 && t < 5) return 2.2;
      if (t >= 5 && t < 5.3) return 0.1;
      if (t >= 5.3 && t < 5.35) return 4.5;
      // A lone 7 g hit at 12 s, 30 ms wide.
      if (t >= 12 && t < 12.03) return 7;
      // A soft 2 g bump at 15 s: below any threshold.
      if (t >= 15 && t < 15.03) return 2;
      // A 60 ms dip at 17 s with a 3 g rebound: a bump, not flight.
      if (t >= 17 && t < 17.06) return 0.2;
      if (t >= 17.06 && t < 17.09) return 3;
      return null;
    });
    const { events, impactThresholdG } = detectImuEvents(s);
    // The recording is calm, so the absolute floor is the threshold.
    expect(impactThresholdG).toBe(4);
    const jumps = events.filter((e) => e.kind === "jump");
    const impacts = events.filter((e) => e.kind === "impact");
    expect(jumps).toHaveLength(1);
    expect(impacts).toHaveLength(1);
    const jump = jumps[0] as Extract<(typeof events)[number], { kind: "jump" }>;
    expect(jump.takeoffMs).toBeCloseTo(5000, -1);
    expect(jump.landingMs).toBeCloseTo(5300, -1);
    expect(jump.airtimeMs).toBeGreaterThan(280);
    expect(jump.airtimeMs).toBeLessThan(320);
    expect(jump.confidence).toBeGreaterThan(0.7);
    const hit = impacts[0] as Extract<
      (typeof events)[number],
      { kind: "impact" }
    >;
    expect(hit.timeMs).toBeCloseTo(12000, -2);
    expect(hit.severity).toBe("medium");
    // Sorted by time, jump first.
    expect(events[0].kind).toBe("jump");
  });

  it("bridges a mid-air jolt and merges one hit's cluster into one impact", () => {
    const s = recording(10, (t) => {
      // 0.4 s of air with a 20 ms touch in the middle, then a 3 g landing.
      if (t >= 3 && t < 3.2) return 0.05;
      if (t >= 3.2 && t < 3.22) return 0.8;
      if (t >= 3.22 && t < 3.4) return 0.05;
      if (t >= 3.4 && t < 3.45) return 3;
      // A hit that rings: three peaks within 200 ms.
      if (t >= 7 && t < 7.02) return 5;
      if (t >= 7.1 && t < 7.12) return 6.5;
      if (t >= 7.2 && t < 7.22) return 4.5;
      return null;
    });
    const { events } = detectImuEvents(s);
    const jumps = events.filter((e) => e.kind === "jump");
    const impacts = events.filter((e) => e.kind === "impact");
    expect(jumps).toHaveLength(1);
    expect((jumps[0] as { airtimeMs: number }).airtimeMs).toBeGreaterThan(380);
    expect(impacts).toHaveLength(1);
    expect((impacts[0] as { timeMs: number }).timeMs).toBeCloseTo(7100, -2);
  });

  it("finds curves from the yaw gyro and braking from the forward axis, in the bike's frame", () => {
    // Bike frame: +Z up, +X forward, right-handed. 60 s at 8 m/s on a 15 %
    // descent (gravity leans −1.44 m/s² on the forward axis the whole time),
    // one right-hand corner, one left-hand corner, one real brake, one
    // wobble too short to be a corner.
    const seconds = 60;
    const n = seconds * RATE;
    const tMs = new Float64Array(n);
    const ax = new Float32Array(n);
    const az = new Float32Array(n).fill(1);
    const gz = new Float32Array(n);
    const speed = (t: number) =>
      t >= 40 && t < 43 ? 8 - (t - 40) * 2 : t >= 43 ? 2 : 8;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      tMs[i] = t * 1000;
      // Right corner 10–13 s at −35 °/s, left corner 25–27 s at +25 °/s, a
      // 0.3 s wobble at 50 s.
      gz[i] =
        t >= 10 && t < 13
          ? -35
          : t >= 25 && t < 27
            ? 25
            : t >= 50 && t < 50.3
              ? 40
              : 0;
      // Forward: the descent's −1.44 m/s² throughout, and a −3 m/s² brake
      // on top of it from 40 to 43 s.
      ax[i] = (-1.44 + (t >= 40 && t < 43 ? -3 : 0)) / 9.81;
    }
    const gpsN = seconds;
    const gps: GpsChannels = {
      tMs: new Float64Array(Array.from({ length: gpsN }, (_, s) => s * 1000)),
      latDeg: new Float64Array(gpsN).fill(37),
      lonDeg: new Float64Array(gpsN).fill(-7),
      altitudeM: new Float32Array(gpsN),
      speedMps: new Float32Array(
        Array.from({ length: gpsN }, (_, s) => speed(s)),
      ),
      headingDeg: new Float32Array(gpsN),
      distanceM: new Float32Array(gpsN).fill(NaN),
      hAccM: new Float32Array(gpsN).fill(NaN),
    };
    const zeros = new Float32Array(n);
    const s: ImuSessionData = {
      format: "test",
      sessionId: null,
      durationMs: seconds * 1000,
      sampleRateHz: RATE,
      sampleCount: n,
      channels: {
        tMs,
        ax,
        ay: zeros,
        az,
        gx: zeros,
        gy: zeros,
        gz,
        gForce: null,
      },
      gps,
      events: [],
      calibration: null,
      aligned: true,
      mounting: {
        yawDeg: 0,
        confidence: 0.9,
        intervals: 20,
        headingCheck: "ok",
        applied: true,
        source: "logger",
      },
    };
    const events = detectBikeFrameEvents(s);
    const curves = events.filter((e) => e.kind === "curve") as Extract<
      ImuSessionData["events"][number],
      { kind: "curve" }
    >[];
    const brakes = events.filter((e) => e.kind === "braking") as Extract<
      ImuSessionData["events"][number],
      { kind: "braking" }
    >[];
    expect(curves.map((c) => c.direction)).toEqual(["right", "left"]);
    expect(curves[0].startMs).toBeCloseTo(10_000, -3);
    expect(curves[0].endMs).toBeCloseTo(13_000, -3);
    // The descent's constant lean on the forward axis is not a brake; the
    // real one is found, and once.
    expect(brakes).toHaveLength(1);
    expect(brakes[0].startMs).toBeCloseTo(40_000, -3);
    expect(brakes[0].endMs).toBeCloseTo(43_000, -3);
    // Without forward (the GPS vote not applied) braking is not judged, but
    // curves still are: they only need "up".
    const noForward = { ...s, mounting: { ...s.mounting!, applied: false } };
    const kinds = detectBikeFrameEvents(noForward).map((e) => e.kind);
    expect(kinds).toEqual(["curve", "curve"]);
    // And a file that brought its own curves keeps them.
    const own = { ...s, events: [curves[0]] };
    expect(detectBikeFrameEvents(own).map((e) => e.kind)).toEqual(["braking"]);
  });

  it("calls every flight a jump, with or without a lip before it", () => {
    const s = recording(20, (t) => {
      // Popped off a lip: 2.5 g of load, then 0.3 s in the air, 4 g landing.
      if (t >= 4.85 && t < 5) return 2.5;
      if (t >= 5 && t < 5.3) return 0.1;
      if (t >= 5.3 && t < 5.35) return 4;
      // Off a ledge: straight from 1 g into 0.3 s of air, 4 g landing.
      if (t >= 12 && t < 12.3) return 0.1;
      if (t >= 12.3 && t < 12.35) return 4;
      return null;
    });
    const { events } = detectImuEvents(s);
    const flights = events.filter(
      (e) => e.kind === "jump" || e.kind === "drop",
    );
    expect(flights.map((e) => e.kind)).toEqual(["jump", "jump"]);
  });

  it("marks a sustained rough stretch as a section, and not a short burst", () => {
    const rnd = rng(11);
    const s = recording(40, (t) => {
      // Rock garden 10–16 s: ±2 g of shake. A one-second burst at 25 s.
      if (t >= 10 && t < 16) return 1 + 4 * rnd();
      if (t >= 25 && t < 26) return 1 + 4 * rnd();
      return null;
    });
    const { events, roughThresholdG } = detectImuEvents(s);
    // A calm recording: the absolute floor is the threshold.
    expect(roughThresholdG).toBe(0.6);
    const sections = events.filter(
      (e) => e.kind === "rough_section",
    ) as Extract<(typeof events)[number], { kind: "rough_section" }>[];
    expect(sections).toHaveLength(1);
    expect(sections[0].startMs).toBeCloseTo(10_000, -3);
    expect(sections[0].endMs).toBeCloseTo(16_000, -3);
    expect(sections[0].confidence).toBeGreaterThan(0.6);
  });

  it("raises the impact threshold on rough terrain so the terrain itself is not an event", () => {
    // Downhill: half the samples at 3–7 g. p99 ≈ 7 → threshold ≈ 10.5 g; a
    // 9 g peak is terrain, a 12 g one is an impact.
    const rnd = rng(9);
    const s = recording(30, (t) => {
      if (t >= 20 && t < 20.02) return 12;
      if (t >= 25 && t < 25.02) return 9;
      return 1 + Math.abs(rnd()) * 12; // 1–7 g, heavy tail
    });
    const { events, impactThresholdG } = detectImuEvents(s);
    expect(impactThresholdG).toBeGreaterThan(9);
    const impacts = events.filter((e) => e.kind === "impact");
    expect(impacts).toHaveLength(1);
    expect((impacts[0] as { timeMs: number }).timeMs).toBeCloseTo(20000, -2);
  });
});
