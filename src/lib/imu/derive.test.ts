import { describe, expect, it } from "vitest";
import type { ImuSessionData } from "./format";
import {
  eventsAt,
  formatSessionTime,
  gForceOf,
  nearestSampleIndex,
  sessionSummary,
  windowPeak,
  windowRms,
} from "./derive";

function session(overrides: Partial<ImuSessionData> = {}): ImuSessionData {
  return {
    format: "bikit_imu_session",
    sessionId: "s1",
    durationMs: 30,
    sampleRateHz: 100,
    sampleCount: 4,
    channels: {
      tMs: new Float64Array([0, 10, 20, 30]),
      ax: new Float32Array([0, 3, 0, 0]),
      ay: new Float32Array([0, 4, 0, 0]),
      az: new Float32Array([1, 0, 1, 2]),
      gx: new Float32Array(4),
      gy: new Float32Array(4),
      gz: new Float32Array(4),
      gForce: null,
    },
    events: [],
    ...overrides,
  };
}

describe("gForceOf", () => {
  it("computes √(ax²+ay²+az²) when the file recorded none", () => {
    const g = gForceOf(session());
    expect(g[0]).toBeCloseTo(1, 5);
    expect(g[1]).toBeCloseTo(5, 5); // 3-4-5 triangle
  });

  it("returns the recorded series untouched when present", () => {
    const recorded = new Float32Array([9, 9, 9, 9]);
    const s = session();
    s.channels.gForce = recorded;
    expect(gForceOf(s)).toBe(recorded);
  });
});

describe("sessionSummary", () => {
  it("counts events by kind and totals airtime and rough time", () => {
    const s = session({
      events: [
        { kind: "curve", direction: "left", startMs: 0, endMs: 10, confidence: 0.9 },
        { kind: "curve", direction: "right", startMs: 15, endMs: 25, confidence: 0.9 },
        { kind: "jump", takeoffMs: 5, landingMs: 25, airtimeMs: 620, confidence: 0.98 },
        { kind: "impact", timeMs: 12, severity: "hard", confidence: 0.96 },
        { kind: "braking", startMs: 20, endMs: 30, confidence: 0.89 },
        { kind: "rough_section", startMs: 0, endMs: 3000, confidence: 0.97 },
      ],
    });
    const summary = sessionSummary(s);
    expect(summary.curveCount).toBe(2);
    expect(summary.jumpCount).toBe(1);
    expect(summary.impactCount).toBe(1);
    expect(summary.brakingCount).toBe(1);
    expect(summary.eventCount).toBe(6);
    expect(summary.airtimeMs).toBe(620);
    expect(summary.roughMs).toBe(3000);
    expect(summary.maxG).toBeCloseTo(5, 5);
  });
});

describe("nearestSampleIndex", () => {
  const t = new Float64Array([0, 10, 20, 30]);

  it("clamps outside the recording", () => {
    expect(nearestSampleIndex(t, -5)).toBe(0);
    expect(nearestSampleIndex(t, 99)).toBe(3);
  });

  it("picks the nearer neighbour, favouring the earlier on a tie", () => {
    expect(nearestSampleIndex(t, 14)).toBe(1);
    expect(nearestSampleIndex(t, 16)).toBe(2);
    expect(nearestSampleIndex(t, 15)).toBe(1);
  });
});

describe("eventsAt", () => {
  const events: ImuSessionData["events"] = [
    { kind: "curve", direction: "left", startMs: 1000, endMs: 2000, confidence: 0.9 },
    { kind: "impact", timeMs: 5000, severity: "hard", confidence: 0.96 },
    { kind: "jump", takeoffMs: 8000, landingMs: 8620, airtimeMs: 620, confidence: 0.98 },
  ];

  it("returns ranged events spanning the instant", () => {
    expect(eventsAt(events, 1500)).toHaveLength(1);
    expect(eventsAt(events, 2500)).toHaveLength(0);
  });

  it("returns point events within the window only", () => {
    expect(eventsAt(events, 5100)).toHaveLength(1);
    expect(eventsAt(events, 5400)).toHaveLength(0);
  });

  it("treats a jump as spanning takeoff to landing", () => {
    expect(eventsAt(events, 8300)).toHaveLength(1);
  });
});

describe("windowPeak", () => {
  const t = new Float64Array([0, 10, 20, 30, 40]);
  const v = new Float32Array([0.1, -2.5, 0.3, 1.8, -0.2]);

  it("finds the largest magnitude inside the window, sign ignored", () => {
    expect(windowPeak(t, v, 0, 40)).toBeCloseTo(2.5, 5);
    expect(windowPeak(t, v, 20, 40)).toBeCloseTo(1.8, 5);
  });

  it("returns null for a window with no samples", () => {
    expect(windowPeak(t, v, 41, 99)).toBeNull();
    expect(windowPeak(t, v, -20, -1)).toBeNull();
    expect(windowPeak(t, v, 11, 19)).toBeCloseTo(0, 5); // no sample between
  });
});

describe("windowRms", () => {
  const t = new Float64Array([0, 10, 20, 30]);

  it("reads near zero on smooth ground with center 1", () => {
    const v = new Float32Array([1, 1, 1, 1]);
    expect(windowRms(t, v, 0, 30, 1)).toBeCloseTo(0, 5);
  });

  it("measures the deviation from the center", () => {
    const v = new Float32Array([1.5, 0.5, 1.5, 0.5]);
    expect(windowRms(t, v, 0, 30, 1)).toBeCloseTo(0.5, 5);
  });

  it("returns null outside the recording", () => {
    const v = new Float32Array([1, 1, 1, 1]);
    expect(windowRms(t, v, 31, 99, 1)).toBeNull();
  });
});

describe("formatSessionTime", () => {
  it("prints mm:ss and mm:ss.mmm", () => {
    expect(formatSessionTime(0)).toBe("00:00");
    expect(formatSessionTime(134420)).toBe("02:14");
    expect(formatSessionTime(134420, true)).toBe("02:14.420");
    expect(formatSessionTime(348000)).toBe("05:48");
  });
});
