import { describe, expect, it } from "vitest";
import type { ImuSessionData } from "./format";
import {
  IMPACT_SEVERITY_REF_ENERGY,
  eventsAt,
  formatSessionTime,
  gForceOf,
  impactEnergy,
  impactSeverityIndex,
  jerkSeries,
  leanSeries,
  nearestSampleIndex,
  roughnessSeries,
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
        {
          kind: "curve",
          direction: "left",
          startMs: 0,
          endMs: 10,
          confidence: 0.9,
        },
        {
          kind: "curve",
          direction: "right",
          startMs: 15,
          endMs: 25,
          confidence: 0.9,
        },
        {
          kind: "jump",
          takeoffMs: 5,
          landingMs: 25,
          airtimeMs: 620,
          confidence: 0.98,
        },
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
    {
      kind: "curve",
      direction: "left",
      startMs: 1000,
      endMs: 2000,
      confidence: 0.9,
    },
    { kind: "impact", timeMs: 5000, severity: "hard", confidence: 0.96 },
    {
      kind: "jump",
      takeoffMs: 8000,
      landingMs: 8620,
      airtimeMs: 620,
      confidence: 0.98,
    },
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

describe("impactEnergy / impactSeverityIndex", () => {
  it("integrates dynamicG² over the window — constant deviation d for T seconds gives d²·T", () => {
    // 1 kHz-free case: 11 samples, 10 ms apart, all at 3 G → deviation 2.
    const t = new Float64Array(Array.from({ length: 11 }, (_, i) => i * 10));
    const g = new Float32Array(11).fill(3);
    expect(impactEnergy(t, g, 0, 100)).toBeCloseTo(4 * 0.1, 5);
  });

  it("reads zero on smooth ground and null outside the recording", () => {
    const t = new Float64Array([0, 10, 20]);
    const g = new Float32Array([1, 1, 1]);
    expect(impactEnergy(t, g, 0, 20)).toBeCloseTo(0, 6);
    expect(impactEnergy(t, g, 30, 99)).toBeNull();
  });

  it("maps energy to a clamped 0–100 index on a square-root scale", () => {
    expect(impactSeverityIndex(0)).toBe(0);
    expect(impactSeverityIndex(IMPACT_SEVERITY_REF_ENERGY)).toBe(100);
    expect(impactSeverityIndex(IMPACT_SEVERITY_REF_ENERGY / 4)).toBe(50);
    expect(impactSeverityIndex(IMPACT_SEVERITY_REF_ENERGY * 9)).toBe(100);
  });
});

describe("roughnessSeries", () => {
  it("reads zero on smooth ground", () => {
    const t = new Float64Array(Array.from({ length: 100 }, (_, i) => i * 10));
    const g = new Float32Array(100).fill(1);
    const rough = roughnessSeries(t, g);
    expect(rough[50]).toBeCloseTo(0, 6);
  });

  it("reads the RMS of a constant deviation", () => {
    const t = new Float64Array(Array.from({ length: 100 }, (_, i) => i * 10));
    const g = new Float32Array(100).fill(1.3);
    const rough = roughnessSeries(t, g, 500);
    expect(rough[50]).toBeCloseTo(0.3, 5);
  });

  it("is local: a burst far away does not move a quiet sample", () => {
    const t = new Float64Array(Array.from({ length: 1000 }, (_, i) => i * 10));
    const g = new Float32Array(1000).fill(1);
    for (let i = 800; i < 850; i++) g[i] = 5;
    const rough = roughnessSeries(t, g, 500);
    expect(rough[100]).toBeCloseTo(0, 6);
    expect(rough[820]).toBeGreaterThan(1);
  });
});

describe("jerkSeries", () => {
  it("reads a constant slope's rate of change", () => {
    // g climbs 0.01 per 10 ms sample → 1 G/s.
    const t = new Float64Array(Array.from({ length: 50 }, (_, i) => i * 10));
    const g = new Float32Array(
      Array.from({ length: 50 }, (_, i) => 1 + i * 0.01),
    );
    const jerk = jerkSeries(t, g);
    expect(jerk[25]).toBeCloseTo(1, 3);
  });

  it("reads zero on a flat signal", () => {
    const t = new Float64Array(Array.from({ length: 50 }, (_, i) => i * 10));
    const g = new Float32Array(50).fill(1);
    expect(jerkSeries(t, g)[25]).toBeCloseTo(0, 6);
  });
});

describe("leanSeries", () => {
  it("settles on the accelerometer's angle when the bike is held tilted", () => {
    // 30°: ay = sin 30° = 0.5, az = cos 30° ≈ 0.866, gyro silent.
    const n = 500;
    const t = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
    const ay = new Float32Array(n).fill(0.5);
    const az = new Float32Array(n).fill(Math.cos(Math.PI / 6));
    const gx = new Float32Array(n);
    const lean = leanSeries(t, ay, az, gx);
    expect(lean[n - 1]).toBeCloseTo(30, 1);
  });

  it("reads upright as zero", () => {
    const n = 100;
    const t = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
    const lean = leanSeries(
      t,
      new Float32Array(n),
      new Float32Array(n).fill(1),
      new Float32Array(n),
    );
    expect(lean[n - 1]).toBeCloseTo(0, 5);
  });

  it("follows the gyro on the fast path — a step of rotation moves it before the accelerometer agrees", () => {
    const n = 20;
    const t = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
    const ay = new Float32Array(n); // accelerometer still says upright
    const az = new Float32Array(n).fill(1);
    const gx = new Float32Array(n).fill(100); // 100°/s of roll
    const lean = leanSeries(t, ay, az, gx);
    expect(lean[n - 1]).toBeGreaterThan(10);
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
