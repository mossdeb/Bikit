import { describe, expect, it } from "vitest";
import type { GpsChannels, ImuSessionData } from "./format";
import { parseSessionTime, suggestTrim, trimOf, trimSession } from "./trim";

/**
 * A 60 s recording at 100 Hz with a fix a second: the bike stands for 5 s,
 * rolls for 3 s (a car-park shuffle), stands until 20 s, then rides at
 * 8 m/s until 50 s with a 4 s wait at 35–39 s, and stands to the end.
 */
function recording(): ImuSessionData {
  const rate = 100;
  const seconds = 60;
  const n = seconds * rate;
  const tMs = new Float64Array(n);
  const az = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) tMs[i] = (i / rate) * 1000;
  const speed = (s: number) =>
    (s >= 5 && s < 8) || (s >= 20 && s < 35) || (s >= 39 && s < 50) ? 8 : 0;
  const m = seconds;
  const gps: GpsChannels = {
    tMs: new Float64Array(Array.from({ length: m }, (_, s) => s * 1000)),
    latDeg: new Float64Array(m).fill(37),
    lonDeg: new Float64Array(m).fill(-7),
    altitudeM: new Float32Array(m).fill(300),
    speedMps: new Float32Array(Array.from({ length: m }, (_, s) => speed(s))),
    headingDeg: new Float32Array(m),
    distanceM: new Float32Array(Array.from({ length: m }, (_, s) => 100 + s)),
    hAccM: new Float32Array(m).fill(NaN),
  };
  return {
    format: "test",
    sessionId: null,
    durationMs: seconds * 1000,
    sampleRateHz: rate,
    sampleCount: n,
    channels: {
      tMs,
      ax: new Float32Array(n),
      ay: new Float32Array(n),
      az,
      gx: new Float32Array(n),
      gy: new Float32Array(n),
      gz: new Float32Array(n),
      gForce: null,
    },
    gps,
    events: [
      { kind: "braking", startMs: 18000, endMs: 21000, confidence: 0.9 },
      {
        kind: "curve",
        direction: "left",
        startMs: 25000,
        endMs: 27000,
        confidence: 0.9,
      },
      { kind: "impact", timeMs: 19000, severity: "hard", confidence: 1 },
      { kind: "impact", timeMs: 30000, severity: "hard", confidence: 1 },
      {
        kind: "jump",
        takeoffMs: 49000,
        landingMs: 50500,
        airtimeMs: 1500,
        confidence: 0.8,
      },
      { kind: "rough_section", startMs: 48000, endMs: 55000, confidence: 0.8 },
    ],
    calibration: null,
    aligned: true,
    mounting: null,
    imuGaps: [
      { atMs: 5000, durationMs: 200 },
      { atMs: 40000, durationMs: 300 },
    ],
  };
}

describe("trimSession", () => {
  it("keeps the window, re-zeroed, and clips what straddles the cuts", () => {
    const cut = trimSession(recording(), { startMs: 20000, endMs: 50000 });
    expect(cut.durationMs).toBe(30000);
    expect(cut.sampleCount).toBe(3000);
    expect(cut.channels.tMs[0]).toBe(0);
    expect(cut.channels.tMs[2999]).toBe(29990);
    expect(cut.channels.az.length).toBe(3000);
    // The fixes at 20…49 s; the distance restarts at the cut.
    expect(cut.gps!.tMs.length).toBe(30);
    expect(cut.gps!.tMs[0]).toBe(0);
    expect(cut.gps!.distanceM[0]).toBe(0);
    expect(cut.gps!.distanceM[29]).toBe(29);
    // The brake that ran into the window is kept for its last second; the
    // hit before the window and the jump whose airtime crosses the end are
    // gone — the jump for taking off inside would stay, but this one lands
    // after the cut, and a flight is kept whole.
    expect(cut.events).toEqual([
      { kind: "braking", startMs: 0, endMs: 1000, confidence: 0.9 },
      {
        kind: "curve",
        direction: "left",
        startMs: 5000,
        endMs: 7000,
        confidence: 0.9,
      },
      { kind: "impact", timeMs: 10000, severity: "hard", confidence: 1 },
      {
        kind: "jump",
        takeoffMs: 29000,
        landingMs: 30500,
        airtimeMs: 1500,
        confidence: 0.8,
      },
      { kind: "rough_section", startMs: 28000, endMs: 30000, confidence: 0.8 },
    ]);
    expect(cut.imuGaps).toEqual([{ atMs: 20000, durationMs: 300 }]);
  });

  it("leaves the session alone without a trim or with an empty window", () => {
    const s = recording();
    expect(trimSession(s, null)).toBe(s);
    expect(trimSession(s, { startMs: 70000, endMs: 80000 })).toBe(s);
    expect(trimSession(s, { startMs: 30000, endMs: 30000 })).toBe(s);
    // Out of range is clamped, not refused.
    const tail = trimSession(s, { startMs: 55000, endMs: 90000 });
    expect(tail.durationMs).toBe(5000);
    expect(tail.sampleCount).toBe(500);
  });

  it("reads a stored pair only when it is a window", () => {
    expect(trimOf(1000, 5000)).toEqual({ startMs: 1000, endMs: 5000 });
    expect(trimOf(null, null)).toBeNull();
    expect(trimOf(5000, 1000)).toBeNull();
    expect(trimOf(-1, 1000)).toBeNull();
  });
});

describe("suggestTrim", () => {
  it("picks the long moving stretch, bridging the short wait, and ignores the shuffle", () => {
    expect(suggestTrim(recording())).toEqual({ startMs: 20000, endMs: 49000 });
  });

  it("has nothing to say without GPS or without a run", () => {
    const s = recording();
    expect(suggestTrim({ ...s, gps: null })).toBeNull();
    const still = recording();
    still.gps!.speedMps.fill(0);
    expect(suggestTrim(still)).toBeNull();
  });
});

describe("parseSessionTime", () => {
  it("reads what the axis shows", () => {
    expect(parseSessionTime("01:30")).toBe(90000);
    expect(parseSessionTime("1:30.250")).toBe(90250);
    expect(parseSessionTime("45")).toBe(45000);
    expect(parseSessionTime("1:02:03")).toBe(3723000);
    expect(parseSessionTime("01:75")).toBeNull();
    expect(parseSessionTime("abc")).toBeNull();
    expect(parseSessionTime("")).toBeNull();
  });
});
