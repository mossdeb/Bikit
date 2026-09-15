import { describe, expect, it } from "vitest";
import type { GpsChannels, ImuSessionData } from "./format";
import {
  IMPACT_SEVERITY_REF_ENERGY,
  alignSessionToBike,
  alignSessionWithOrientation,
  altitudeMSeries,
  applyMountingYaw,
  bandpassSeries,
  corneringGSeries,
  impactDecayRatio,
  impactRecoveryRatio,
  recoveryHits,
  curveMomentum,
  estimateMountingYaw,
  fusedSpeedKmhSeries,
  eventsAt,
  eventsNear,
  formatSessionTime,
  gForceOf,
  gpsDistance,
  gpsMeanSpeed,
  gpsPositionAt,
  gpsSpeedAt,
  impactEnergy,
  impactSeverityIndex,
  jerkSeries,
  leanSeries,
  nearestSampleIndex,
  pitchSeries,
  roughnessSeries,
  sessionSummary,
  speedKmhSeries,
  windowMeanAbs,
  windowPeak,
  windowRange,
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
    gps: null,
    events: [],
    calibration: null,
    aligned: false,
    mounting: null,
    ...overrides,
  };
}

describe("estimateMountingYaw / applyMountingYaw", () => {
  /**
   * A ride the maths can be checked against: the bike accelerates, cruises,
   * brakes, and takes a right-hand turn, all with the bike's forward on +X.
   * The sensor is mounted rotated by `yaw` about the vertical, so what it
   * records is that motion rotated the other way. GPS at 1 Hz, IMU at 100.
   */
  function ride(yawDeg: number, withGps = true) {
    const rate = 100;
    const seconds = 40;
    const n = seconds * rate;
    const tMs = new Float64Array(n);
    // Bike-frame truth per second: forward accel (m/s²) and heading (deg).
    // Accelerate, cruise, brake — but not to a stop: the turn that follows
    // needs speed, or there is no centripetal acceleration to check.
    const fwdAt = (s: number) =>
      s < 10 ? 1.5 : s < 20 ? 0 : s < 26 ? -1.5 : 0;
    const speedAt = (s: number) => {
      let v = 0;
      for (let k = 0; k < s; k++) v = Math.max(0, v + fwdAt(k));
      return v;
    };
    const headingAt = (s: number) =>
      s >= 28 && s < 36 ? (s - 28) * 11 : s >= 36 ? 88 : 0;
    const yawRateAt = (s: number) => (s >= 28 && s < 36 ? 11 : 0); // deg/s, turning right
    const psi = (yawDeg * Math.PI) / 180;
    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    const az = new Float32Array(n);
    const gx = new Float32Array(n);
    const gy = new Float32Array(n);
    const gz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = Math.floor(i / rate);
      tMs[i] = (i / rate) * 1000;
      // Bike frame: forward accel on +X (in g); in a right turn the
      // centripetal acceleration points RIGHT, i.e. −Y in a frame where
      // +Y is left; the yaw rate about +Z (up) is negative for a right turn.
      const v = speedAt(s);
      const omega = (yawRateAt(s) * Math.PI) / 180;
      const bx = fwdAt(s) / 9.81;
      const by = -(v * omega) / 9.81;
      const bz = 1;
      // Sensor frame = bike frame rotated by −yaw about Z.
      ax[i] = bx * Math.cos(psi) + by * Math.sin(psi);
      ay[i] = -bx * Math.sin(psi) + by * Math.cos(psi);
      az[i] = bz;
      gz[i] = -yawRateAt(s);
    }
    const gpsN = seconds;
    const gps: GpsChannels = {
      tMs: new Float64Array(Array.from({ length: gpsN }, (_, s) => s * 1000)),
      latDeg: new Float64Array(gpsN).fill(37),
      lonDeg: new Float64Array(gpsN).fill(-7),
      altitudeM: new Float32Array(gpsN),
      speedMps: new Float32Array(
        Array.from({ length: gpsN }, (_, s) => speedAt(s)),
      ),
      headingDeg: new Float32Array(
        Array.from({ length: gpsN }, (_, s) => headingAt(s)),
      ),
      distanceM: new Float32Array(gpsN).fill(NaN),
      hAccM: new Float32Array(gpsN).fill(NaN),
    };
    return session({
      sampleRateHz: rate,
      sampleCount: n,
      durationMs: seconds * 1000,
      channels: { tMs, ax, ay, az, gx, gy, gz, gForce: null },
      gps: withGps ? gps : null,
      aligned: true,
    });
  }

  it("recovers the mounting yaw from GPS speed changes and confirms the lateral axis by heading", () => {
    for (const yaw of [0, 37, -120, 175]) {
      const s = ride(yaw);
      const m = estimateMountingYaw(s);
      expect(m, `yaw ${yaw}`).not.toBeNull();
      const diff = ((m!.yawDeg - yaw + 540) % 360) - 180;
      expect(Math.abs(diff), `yaw ${yaw} → ${m!.yawDeg}`).toBeLessThan(1);
      // Perfect correlation, tempered by the count: 16 votes → 16/24 ≈ 0.67.
      // A real ride has hundreds and climbs towards 1; forty seconds cannot
      // claim more than "moderate", which is the point of the tempering.
      expect(m!.confidence).toBeGreaterThan(0.6);
      expect(m!.confidence).toBeLessThan(0.75);
      expect(m!.headingCheck).toBe("ok");
      // Applied, the forward acceleration sits on +X and the turn's lateral on −Y.
      const a = applyMountingYaw(s, m!);
      const braking = 22 * 100; // inside the braking phase
      expect(a.channels.ax[braking]).toBeCloseTo(-1.5 / 9.81, 3);
      expect(a.channels.ay[braking]).toBeCloseTo(0, 3);
      const turning = 32 * 100;
      expect(a.channels.ay[turning]).toBeLessThan(0);
      expect(a.mounting?.applied).toBe(true);
    }
  });

  it("gives up without GPS, and on a ride that never accelerates", () => {
    expect(estimateMountingYaw(ride(37, false))).toBeNull();
    const flat = ride(37);
    flat.channels.ax.fill(0);
    flat.channels.ay.fill(0);
    flat.gps!.speedMps.fill(5);
    expect(estimateMountingYaw(flat)).toBeNull();
  });

  it("flags a left-handed sensor as inverted rather than rotating it", () => {
    const s = ride(20);
    // Mirror the yaw gyro: the turn now reads as if to the left. The
    // lateral acceleration is left alone — a bike leans, so it says
    // nothing either way, and the check no longer reads it.
    for (let i = 0; i < s.channels.gz.length; i++) {
      s.channels.gz[i] = -s.channels.gz[i];
    }
    const m = estimateMountingYaw(s);
    expect(m).not.toBeNull();
    expect(m!.headingCheck).toBe("inverted");
  });

  it("is not swayed by a fix stamped milliseconds after the one before it", () => {
    // The logger stamps a fix when it parses it, so a backlog drained at
    // once yields two fixes 3 ms apart. A 2 m/s step over 3 ms is a bogus
    // 667 m/s²; before the interval guard, one such vote outweighed a ride.
    const clean = ride(37);
    const g = clean.gps!;
    const at = 5; // insert after the fix at 5 s, mid-acceleration
    const n = g.tMs.length + 1;
    const ins = <T extends Float64Array | Float32Array>(
      arr: T,
      value: number,
    ): T => {
      const out = new (arr.constructor as new (len: number) => T)(n);
      for (let i = 0, j = 0; i < n; i++) {
        if (i === at + 1) out[i] = value;
        else out[i] = arr[j++];
      }
      return out;
    };
    // Its horizontal acceleration points sideways, where nothing else does.
    const dirty = session({
      ...clean,
      gps: {
        tMs: ins(g.tMs, g.tMs[at] + 3),
        latDeg: ins(g.latDeg, 37),
        lonDeg: ins(g.lonDeg, -7),
        altitudeM: ins(g.altitudeM, 0),
        speedMps: ins(g.speedMps, g.speedMps[at] + 2),
        headingDeg: ins(g.headingDeg, g.headingDeg[at]),
        distanceM: ins(g.distanceM, NaN),
        hAccM: ins(g.hAccM, NaN),
      },
    });
    const m = estimateMountingYaw(dirty)!;
    const diff = ((m.yawDeg - 37 + 540) % 360) - 180;
    expect(Math.abs(diff)).toBeLessThan(1);
    expect(m.confidence).toBeGreaterThan(0.6);
  });
});

describe("alignSessionWithOrientation", () => {
  // The logger's frame: up along the real logger's gravity, front chosen
  // normal to it, left = up × front. A sensor reading of 1 g along up plus
  // 0.3 g along front must come out as bike (0.3, 0, 1).
  const up = [-0.057, -0.853, 0.519];
  const un = Math.hypot(...up);
  const u = up.map((x) => x / un) as [number, number, number];
  const raw = [0.294, -0.511, -0.808];
  const d = raw[0] * u[0] + raw[1] * u[1] + raw[2] * u[2];
  const fr = raw.map((x, i) => x - d * u[i]);
  const fn = Math.hypot(...fr);
  const f = fr.map((x) => x / fn) as [number, number, number];
  const l: [number, number, number] = [
    u[1] * f[2] - u[2] * f[1],
    u[2] * f[0] - u[0] * f[2],
    u[0] * f[1] - u[1] * f[0],
  ];

  it("puts the channels in the bike's frame from the ORI1 vectors and reports the logger as the source", () => {
    const n = 4;
    const s = session({
      channels: {
        tMs: new Float64Array([0, 10, 20, 30]),
        ax: new Float32Array(n).fill(u[0] + 0.3 * f[0]),
        ay: new Float32Array(n).fill(u[1] + 0.3 * f[1]),
        az: new Float32Array(n).fill(u[2] + 0.3 * f[2]),
        // A yaw rate about the bike's up, plus the calibration's bias.
        gx: new Float32Array(n).fill(20 * u[0] + 1.2),
        gy: new Float32Array(n).fill(20 * u[1] - 2.5),
        gz: new Float32Array(n).fill(20 * u[2] + 0.07),
        gForce: null,
      },
      calibration: {
        gravityRefG: [up[0], up[1], up[2]],
        gyroBiasDps: [1.2, -2.5, 0.07],
        gravityMagnitudeG: 1,
        accelStddevG: 0.002,
        gyroStddevDps: 0.1,
        sampleCount: 832,
        calibrationCount: 1,
      },
      orientation: {
        up: u,
        front: f,
        left: l,
        confidence: 0.716,
        voteCount: 6,
        calibrationCount: 1,
      },
    });
    const out = alignSessionWithOrientation(s);
    expect(out).not.toBe(s);
    expect(out.aligned).toBe(true);
    expect(out.channels.ax[0]).toBeCloseTo(0.3, 4);
    expect(out.channels.ay[0]).toBeCloseTo(0, 4);
    expect(out.channels.az[0]).toBeCloseTo(1, 4);
    expect(out.channels.gx[0]).toBeCloseTo(0, 3);
    expect(out.channels.gy[0]).toBeCloseTo(0, 3);
    expect(out.channels.gz[0]).toBeCloseTo(20, 3);
    expect(out.mounting).toMatchObject({
      source: "logger",
      applied: true,
      confidence: 0.716,
      intervals: 6,
      headingCheck: "ok",
    });
    // Nothing to do twice, and nothing to do without the record.
    expect(alignSessionWithOrientation(out)).toBe(out);
    const bare = session();
    expect(alignSessionWithOrientation(bare)).toBe(bare);
  });
});

describe("alignSessionToBike", () => {
  it("is the identity without a calibration", () => {
    const s = session();
    expect(alignSessionToBike(s)).toBe(s);
  });

  it("rotates a tilted mounting so rest gravity lands on +Z and subtracts the gyro bias", () => {
    // Sensor mounted tilted: at rest it reads gravity along (0.133, 0.106, 1),
    // the first real logger's snapshot. The gyro sits at a bias.
    const gRef: [number, number, number] = [0.133, 0.106, 1.0];
    const bias: [number, number, number] = [1.26, -2.35, 0.14];
    const s = session({
      channels: {
        tMs: new Float64Array([0, 10]),
        ax: new Float32Array([gRef[0], gRef[0]]),
        ay: new Float32Array([gRef[1], gRef[1]]),
        az: new Float32Array([gRef[2], gRef[2]]),
        gx: new Float32Array([bias[0], bias[0] + 10]),
        gy: new Float32Array([bias[1], bias[1]]),
        gz: new Float32Array([bias[2], bias[2]]),
        gForce: null,
      },
      calibration: {
        gravityRefG: gRef,
        gyroBiasDps: bias,
        gravityMagnitudeG: Math.hypot(...gRef),
        accelStddevG: 0.002,
        gyroStddevDps: 0.18,
        sampleCount: 832,
        calibrationCount: 6,
      },
    });
    const a = alignSessionToBike(s);
    expect(a).not.toBe(s);
    expect(a.aligned).toBe(true);
    // Rest gravity is now straight down the bike's Z, norm preserved.
    expect(a.channels.ax[0]).toBeCloseTo(0, 5);
    expect(a.channels.ay[0]).toBeCloseTo(0, 5);
    expect(a.channels.az[0]).toBeCloseTo(Math.hypot(...gRef), 5);
    // Lean and pitch read zero for a level bike.
    expect(Math.atan2(a.channels.ay[0], a.channels.az[0])).toBeCloseTo(0, 5);
    // The gyro at rest reads zero; a real rotation survives (rotated).
    expect(a.channels.gx[0]).toBeCloseTo(0, 5);
    expect(a.channels.gy[0]).toBeCloseTo(0, 5);
    expect(a.channels.gz[0]).toBeCloseTo(0, 5);
    expect(
      Math.hypot(a.channels.gx[1], a.channels.gy[1], a.channels.gz[1]),
    ).toBeCloseTo(10, 4);
    // The originals were not touched.
    expect(s.channels.ax[0]).toBeCloseTo(gRef[0], 6);
    expect(s.channels.gy[0]).toBeCloseTo(bias[1], 6);
    // Applying twice is a no-op.
    expect(alignSessionToBike(a)).toBe(a);
  });

  it("leaves an already-upright mounting alone except for the bias", () => {
    const s = session({
      calibration: {
        gravityRefG: [0, 0, 1],
        gyroBiasDps: [0.5, 0, 0],
        gravityMagnitudeG: 1,
        accelStddevG: 0,
        gyroStddevDps: 0,
        sampleCount: 1,
        calibrationCount: 1,
      },
    });
    const a = alignSessionToBike(s);
    expect(Array.from(a.channels.ax)).toEqual(Array.from(s.channels.ax));
    expect(Array.from(a.channels.az)).toEqual(Array.from(s.channels.az));
    expect(a.channels.gx[0]).toBeCloseTo(-0.5, 6);
  });
});

/** A straight-line GPS track: one fix per 100 ms, speeds 2 → 4 m/s. */
function gpsTrack(): GpsChannels {
  return {
    tMs: new Float64Array([0, 100, 200]),
    latDeg: new Float64Array([37.1, 37.2, 37.3]),
    lonDeg: new Float64Array([-7.7, -7.8, -7.9]),
    altitudeM: new Float32Array([100, 110, 120]),
    speedMps: new Float32Array([2, 3, 4]),
    headingDeg: new Float32Array([0, 0, 0]),
    distanceM: new Float32Array([0, 5, 10]),
    hAccM: new Float32Array([1, 1, 1]),
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

  it("eventsNear widens each event by its own reach and says how far outside the instant is", () => {
    const reach = (e: ImuSessionData["events"][number]) =>
      e.kind === "curve"
        ? ([e.startMs - 800, e.endMs + 1200] as const)
        : e.kind === "impact"
          ? ([e.timeMs - 150, e.timeMs + 150] as const)
          : e.kind === "jump" || e.kind === "drop"
            ? ([e.takeoffMs - 500, e.landingMs + 500] as const)
            : ([e.startMs, e.endMs] as const);
    // Inside the curve: offset 0. 400 ms before it: −400. 900 ms after:
    // +900. Past the reach: nothing.
    expect(eventsNear(events, 1500, reach)).toEqual([
      { event: events[0], offsetMs: 0 },
    ]);
    expect(eventsNear(events, 600, reach)).toEqual([
      { event: events[0], offsetMs: -400 },
    ]);
    expect(eventsNear(events, 2900, reach)).toEqual([
      { event: events[0], offsetMs: 900 },
    ]);
    expect(eventsNear(events, 3500, reach)).toHaveLength(0);
    // A jump's reach runs half a second past the landing.
    expect(eventsNear(events, 9000, reach)).toEqual([
      { event: events[2], offsetMs: 380 },
    ]);
    expect(eventsNear(events, 9200, reach)).toHaveLength(0);
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

describe("windowRange", () => {
  const t = new Float64Array([0, 10, 20, 30, 40]);
  const v = new Float32Array([13, 17, 15, 14, 16]);

  it("reads the signed floor and ceiling inside the window, and when each came", () => {
    expect(windowRange(t, v, 0, 40)).toEqual({
      min: 13,
      max: 17,
      minMs: 0,
      maxMs: 10,
    });
    expect(windowRange(t, v, 20, 40)).toEqual({
      min: 14,
      max: 16,
      minMs: 30,
      maxMs: 40,
    });
  });

  it("returns null for a window with no samples", () => {
    expect(windowRange(t, v, 41, 99)).toBeNull();
    expect(windowRange(t, v, -20, -1)).toBeNull();
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
  const n = 500; // 5 s at 100 Hz
  const t = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
  const upright = { ay: new Float32Array(n), az: new Float32Array(n).fill(1) };

  it("settles on a corner's balance angle from speed and yaw rate, right positive", () => {
    // 36 km/h turning right at 30 °/s (right is a negative yaw rate about
    // up): atan(10 · 0.5236 / 9.81) = 28.1°. The roll gyro is silent, so the
    // filter has only the balance angle to go on and reaches it in a few
    // time constants. The accelerometer says upright throughout, as it
    // does in a coordinated turn — and is not asked.
    const speed = new Float32Array(n).fill(36);
    const noRoll = new Float32Array(n);
    const right = leanSeries(
      t,
      upright.ay,
      upright.az,
      noRoll,
      new Float32Array(n).fill(-30),
      speed,
    );
    expect(right[n - 1]).toBeCloseTo(28.1, 0);
    const left = leanSeries(
      t,
      upright.ay,
      upright.az,
      noRoll,
      new Float32Array(n).fill(30),
      speed,
    );
    expect(left[n - 1]).toBeCloseTo(-28.1, 0);
    // Standing still, no turn can lean it.
    const still = leanSeries(
      t,
      upright.ay,
      upright.az,
      noRoll,
      new Float32Array(n).fill(30),
      new Float32Array(n),
    );
    expect(still[n - 1]).toBeCloseTo(0, 5);
  });

  it("follows the roll gyro at once, and lets a yaw spike without a roll leak only a fraction", () => {
    const speed = new Float32Array(n).fill(36);
    // A roll into a corner the gyro sees: 100 °/s for 0.3 s from 1 s. The
    // lean is 30° the moment the roll stops, whatever the balance angle
    // says yet.
    const gx = new Float32Array(n);
    for (let i = 100; i < 130; i++) gx[i] = 100;
    const rolled = leanSeries(
      t,
      upright.ay,
      upright.az,
      gx,
      new Float32Array(n),
      speed,
    );
    expect(rolled[130]).toBeGreaterThan(25);
    expect(rolled[130]).toBeLessThan(31);
    // A yaw spike the roll gyro does not see — a rear stepping out, a
    // hit: 90 °/s for 0.3 s says 48° of balance angle. With a 1 s constant
    // a third of a second leaks about a quarter of it.
    const gz = new Float32Array(n);
    for (let i = 200; i < 230; i++) gz[i] = -90;
    const kicked = leanSeries(
      t,
      upright.ay,
      upright.az,
      new Float32Array(n),
      gz,
      speed,
    );
    const peak = Math.max(...Array.from(kicked));
    expect(peak).toBeGreaterThan(8);
    expect(peak).toBeLessThan(20);
  });

  it("falls back to the accelerometer's average tilt without GPS or a known up", () => {
    // 30° to the right: ay = sin 30° = 0.5, az = cos 30°.
    const ay = new Float32Array(n).fill(0.5);
    const az = new Float32Array(n).fill(Math.cos(Math.PI / 6));
    expect(leanSeries(t, ay, az, null, null, null)[250]).toBeCloseTo(30, 1);
    // A gyro without a track is no balance angle either.
    expect(
      leanSeries(
        t,
        ay,
        az,
        new Float32Array(n),
        new Float32Array(n),
        null,
      )[250],
    ).toBeCloseTo(30, 1);
  });

  it("reads upright as zero", () => {
    const lean = leanSeries(t, upright.ay, upright.az, null, null, null);
    expect(lean[n - 1]).toBeCloseTo(0, 5);
  });
});

describe("speedKmhSeries", () => {
  it("interpolates the 10 Hz speed onto the IMU timeline, in km/h", () => {
    const tMs = new Float64Array([0, 50, 100, 150, 200]);
    const out = speedKmhSeries(tMs, gpsTrack());
    // 2 m/s = 7.2 km/h; halfway between fixes reads halfway between speeds.
    expect(out[0]).toBeCloseTo(7.2, 4);
    expect(out[1]).toBeCloseTo(2.5 * 3.6, 4);
    expect(out[2]).toBeCloseTo(3 * 3.6, 4);
    expect(out[4]).toBeCloseTo(4 * 3.6, 4);
  });

  it("holds the nearest fix beyond the track's ends instead of extrapolating", () => {
    const tMs = new Float64Array([-100, 500]);
    const out = speedKmhSeries(tMs, gpsTrack());
    expect(out[0]).toBeCloseTo(7.2, 4);
    expect(out[1]).toBeCloseTo(14.4, 4);
  });
});

describe("fusedSpeedKmhSeries", () => {
  /** 100 Hz for `seconds`, fixes every second at the speeds given. */
  function track(speedsMps: number[]) {
    const m = speedsMps.length;
    return {
      tMs: new Float64Array(Array.from({ length: m }, (_, s) => s * 1000)),
      latDeg: new Float64Array(m).fill(37),
      lonDeg: new Float64Array(m).fill(-7),
      altitudeM: new Float32Array(m),
      speedMps: new Float32Array(speedsMps),
      headingDeg: new Float32Array(m),
      distanceM: new Float32Array(m).fill(NaN),
      hAccM: new Float32Array(m).fill(NaN),
    } satisfies GpsChannels;
  }
  const n = 300;
  const tMs = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));

  it("passes through every fix and draws the dip between two equal ones", () => {
    // 10 m/s at 0, 1 and 2 s; between 1 and 2 s the bike brakes at −5 m/s²
    // for 0.4 s and accelerates back at +5 m/s² for 0.4 s. The straight
    // line says 36 km/h throughout; the accelerometer knows it fell to 8.
    const ax = new Float32Array(n);
    for (let i = 100; i < 140; i++) ax[i] = -5 / 9.81;
    for (let i = 140; i < 180; i++) ax[i] = 5 / 9.81;
    const v = fusedSpeedKmhSeries(tMs, ax, track([10, 10, 10]));
    expect(v[0]).toBeCloseTo(36, 0);
    expect(v[100]).toBeCloseTo(36, 0);
    expect(v[200]).toBeCloseTo(36, 0);
    expect(Math.min(...Array.from(v.slice(100, 200)))).toBeCloseTo(28.8, 0);
    expect(v[140]).toBeCloseTo(28.8, 0);
  });

  it("spreads a constant bias — a slope's gravity — so the fixes still hold", () => {
    // A 10 % descent reads −0.98 m/s² on the forward axis the whole time,
    // yet the GPS says the speed is steady: the residual absorbs it and
    // the fused speed stays flat.
    const ax = new Float32Array(n).fill(-0.1);
    const v = fusedSpeedKmhSeries(tMs, ax, track([8, 8, 8]));
    for (const i of [0, 50, 100, 150, 250]) expect(v[i]).toBeCloseTo(28.8, 0);
  });

  it("is the plain resample without a forward axis, and never negative", () => {
    const plain = fusedSpeedKmhSeries(tMs, null, track([2, 3, 4]));
    expect(Array.from(plain)).toEqual(
      Array.from(speedKmhSeries(tMs, track([2, 3, 4]))),
    );
    const ax = new Float32Array(n).fill(-1);
    const v = fusedSpeedKmhSeries(tMs, ax, track([0.5, 0, 0]));
    for (const x of v) expect(x).toBeGreaterThanOrEqual(0);
  });
});

describe("curveMomentum", () => {
  // 100 Hz, 20 s. Two corners: one at 5–7 s, one at 12–14 s. The speed
  // (km/h) peaks at 31 before the first, dips to 19 in it, peaks at 29
  // between the two, dips to 12 in the second, and climbs to 24 after.
  const n = 2000;
  const tMs = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / 100;
    speed[i] =
      t < 3
        ? 25
        : t < 4
          ? 31
          : t < 6
            ? 19
            : t < 9
              ? 29
              : t < 13
                ? 12
                : t < 16
                  ? 24
                  : 20;
  }
  const curves = [
    { startMs: 5000, endMs: 7000 },
    { startMs: 12000, endMs: 14000 },
  ];

  it("reads entry, minimum and exit and the two ratios", () => {
    const first = curveMomentum(tMs, speed, curves, 0)!;
    expect(first.entryKmh).toBe(31);
    expect(first.minKmh).toBe(19);
    expect(first.exitKmh).toBe(29);
    expect(first.retention).toBeCloseTo(29 / 31, 3);
    expect(first.apexLoss).toBeCloseTo(1 - 19 / 31, 3);
    const second = curveMomentum(tMs, speed, curves, 1)!;
    expect(second.entryKmh).toBe(29);
    expect(second.minKmh).toBe(12);
    expect(second.exitKmh).toBe(24);
  });

  it("stops the exit window at the next corner and the entry at the previous one", () => {
    // The 29 between the two is the first's exit AND the second's entry;
    // the first must not reach the 24 past the second corner, nor the
    // second reach back to the 31.
    const close = [
      { startMs: 5000, endMs: 7000 },
      { startMs: 8000, endMs: 14000 },
    ];
    const first = curveMomentum(tMs, speed, close, 0)!;
    expect(first.exitKmh).toBe(29);
    expect(first.exitMs).toBeLessThanOrEqual(8000);
    const second = curveMomentum(tMs, speed, close, 1)!;
    expect(second.entryKmh).toBe(29);
    expect(second.entryMs).toBeGreaterThanOrEqual(7000);
  });

  it("declines a corner rolled into from near standstill", () => {
    const crawl = new Float32Array(n).fill(3);
    expect(curveMomentum(tMs, crawl, curves, 0)).toBeNull();
  });

  it("takes the hill's free speed out of the corrected retention", () => {
    // A steady 28.8 km/h (8 m/s) through a corner at 5–7 s, entry and exit
    // both at 8 m/s: raw retention 100 %. GPS at 1 Hz on a 10 % descent —
    // 8 m of ground and 0.8 m of height a second, with a metre of wander on
    // the altitude that the regression must see through.
    const m = 20;
    const wander = [0.4, -0.6, 0.9, -0.2, -0.8, 0.5, 0.1, -0.9, 0.7, -0.3];
    const gps: GpsChannels = {
      tMs: new Float64Array(Array.from({ length: m }, (_, s) => s * 1000)),
      latDeg: new Float64Array(m).fill(37),
      lonDeg: new Float64Array(m).fill(-7),
      altitudeM: new Float32Array(
        Array.from({ length: m }, (_, s) => 300 - 0.8 * s + wander[s % 10]),
      ),
      speedMps: new Float32Array(m).fill(8),
      headingDeg: new Float32Array(m),
      distanceM: new Float32Array(m).fill(NaN),
      hAccM: new Float32Array(m).fill(NaN),
    };
    const steady = new Float32Array(n).fill(28.8);
    const one = [{ startMs: 5000, endMs: 7000 }];
    const mo = curveMomentum(tMs, steady, one, 0, gps)!;
    expect(mo.retention).toBeCloseTo(1, 3);
    // At a steady speed the peak is the first sample of each window: entry
    // at 1 s, exit at 7 s — 48 m of ground, 4.8 m of drop, give or take the
    // wander's leftover.
    expect(mo.dropM).toBeGreaterThan(4);
    expect(mo.dropM).toBeLessThan(5.6);
    // Gravity alone would have made 8 m/s into √(64 + 2·9.81·4.8) ≈ 12.6
    // m/s; holding 8 is keeping about 64 % of that.
    expect(mo.retentionCorrected).toBeGreaterThan(0.6);
    expect(mo.retentionCorrected).toBeLessThan(0.68);
    // On the flat there is nothing to correct, and uphill the legs decide:
    // the raw figure stands alone, the drop still signed.
    const flat = { ...gps, altitudeM: new Float32Array(m).fill(300) };
    const level = curveMomentum(tMs, steady, one, 0, flat)!;
    expect(level.dropM).toBeCloseTo(0, 5);
    expect(level.retentionCorrected).toBeNull();
    const climb = {
      ...gps,
      altitudeM: new Float32Array(
        Array.from({ length: m }, (_, s) => 300 + 0.8 * s),
      ),
    };
    const rise = curveMomentum(tMs, steady, one, 0, climb)!;
    expect(rise.dropM).toBeLessThan(-4);
    expect(rise.retentionCorrected).toBeNull();
    // And without a track there is no correction to claim.
    expect(curveMomentum(tMs, steady, one, 0)!.retentionCorrected).toBeNull();
  });
});

describe("gpsPositionAt", () => {
  it("interpolates the position between two fixes", () => {
    const pos = gpsPositionAt(gpsTrack(), 50);
    expect(pos).not.toBeNull();
    expect(pos!.latDeg).toBeCloseTo(37.15, 10);
    expect(pos!.lonDeg).toBeCloseTo(-7.75, 10);
  });

  it("reads a fix's own time exactly", () => {
    const pos = gpsPositionAt(gpsTrack(), 100);
    expect(pos!.latDeg).toBeCloseTo(37.2, 10);
  });

  it("clamps to the track's ends", () => {
    expect(gpsPositionAt(gpsTrack(), -50)!.latDeg).toBeCloseTo(37.1, 10);
    expect(gpsPositionAt(gpsTrack(), 999)!.latDeg).toBeCloseTo(37.3, 10);
  });
});

describe("gpsSpeedAt / gpsMeanSpeed / gpsDistance", () => {
  it("interpolates the speed at an instant", () => {
    expect(gpsSpeedAt(gpsTrack(), 50)).toBeCloseTo(2.5, 6);
    expect(gpsSpeedAt(gpsTrack(), 100)).toBeCloseTo(3, 6);
    // Clamped at the ends.
    expect(gpsSpeedAt(gpsTrack(), -10)).toBeCloseTo(2, 6);
    expect(gpsSpeedAt(gpsTrack(), 999)).toBeCloseTo(4, 6);
  });

  it("takes the time-weighted mean across a window", () => {
    // Linear ramp 2→4 m/s over the whole track: the mean is the midpoint.
    expect(gpsMeanSpeed(gpsTrack(), 0, 200)).toBeCloseTo(3, 6);
    // Half windows read their own midpoints.
    expect(gpsMeanSpeed(gpsTrack(), 0, 100)).toBeCloseTo(2.5, 6);
    expect(gpsMeanSpeed(gpsTrack(), 100, 200)).toBeCloseTo(3.5, 6);
  });

  it("returns null for a degenerate window", () => {
    expect(gpsMeanSpeed(gpsTrack(), 100, 100)).toBeNull();
  });

  it("reads distance off the receiver's cumulative figure when carried", () => {
    // distanceM runs 0 → 5 → 10 over 200 ms.
    expect(gpsDistance(gpsTrack(), 0, 200)).toBeCloseTo(10, 6);
    expect(gpsDistance(gpsTrack(), 50, 150)).toBeCloseTo(5, 6);
  });

  it("falls back to integrated speed when the cumulative distance is absent", () => {
    const gps = gpsTrack();
    gps.distanceM = new Float32Array([NaN, NaN, NaN]);
    // Mean 3 m/s across 0.2 s → 0.6 m.
    expect(gpsDistance(gps, 0, 200)).toBeCloseTo(0.6, 6);
  });
});

describe("windowMeanAbs", () => {
  it("averages magnitudes across the window", () => {
    const tMs = new Float64Array([0, 10, 20, 30]);
    const values = new Float32Array([1, -3, 5, -7]);
    expect(windowMeanAbs(tMs, values, 0, 30)).toBeCloseTo(4, 6);
    expect(windowMeanAbs(tMs, values, 10, 20)).toBeCloseTo(4, 6);
  });

  it("returns null outside the recording", () => {
    const tMs = new Float64Array([0, 10]);
    expect(windowMeanAbs(tMs, new Float32Array(2), 50, 60)).toBeNull();
  });
});

describe("altitudeMSeries", () => {
  it("interpolates the altitude onto the IMU timeline", () => {
    const tMs = new Float64Array([0, 50, 200]);
    const out = altitudeMSeries(tMs, gpsTrack());
    expect(out[0]).toBeCloseTo(100, 4);
    expect(out[1]).toBeCloseTo(105, 4);
    expect(out[2]).toBeCloseTo(120, 4);
  });
});

describe("sessionSummary — GPS figures", () => {
  it("carries distance and max speed when the session has a track", () => {
    const s = sessionSummary(session({ gps: gpsTrack() }));
    expect(s.distanceM).toBeCloseTo(10, 6);
    expect(s.maxSpeedKmh).toBeCloseTo(14.4, 4);
  });

  it("reads null figures without GPS", () => {
    const s = sessionSummary(session());
    expect(s.distanceM).toBeNull();
    expect(s.maxSpeedKmh).toBeNull();
  });
});

describe("pitchSeries", () => {
  it("reads a bike held nose-up as positive, nose-down as negative", () => {
    // 30° nose up: the specific force is minus gravity, and gravity projects
    // −sin 30° on an axis pointing up, so ax = +0.5 and az = cos 30°.
    const n = 500;
    const t = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
    const ax = new Float32Array(n).fill(0.5);
    const ay = new Float32Array(n);
    const az = new Float32Array(n).fill(Math.cos(Math.PI / 6));
    const up = pitchSeries(t, ax, ay, az);
    expect(up[n - 1]).toBeCloseTo(30, 1);
    // A descent (or a brake) leans the force back: nose down.
    const down = pitchSeries(
      t,
      ax.map((v) => -v),
      ay,
      az,
    );
    expect(down[250]).toBeCloseTo(-30, 1);
  });

  it("reads level ground as zero", () => {
    const n = 100;
    const t = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    const az = new Float32Array(n).fill(1);
    const pitch = pitchSeries(t, ax, ay, az);
    expect(pitch[n - 1]).toBeCloseTo(0, 5);
  });

  it("averages a hit away instead of reading it as an angle", () => {
    // Level ground at 100 Hz, and one 30 ms hit of 3 g on the forward axis:
    // read alone that is 72°; over the 1.5 s window it is a few degrees.
    const n = 400;
    const t = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
    const ax = new Float32Array(n);
    for (let i = 200; i < 203; i++) ax[i] = 3;
    const ay = new Float32Array(n);
    const az = new Float32Array(n).fill(1);
    const pitch = pitchSeries(t, ax, ay, az);
    expect(pitch[201]).toBeGreaterThan(0);
    expect(pitch[201]).toBeLessThan(5);
    // And the window is centred, so the hit weighs the same before and
    // after it.
    expect(pitch[150]).toBeCloseTo(pitch[252], 3);
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

describe("corneringGSeries", () => {
  // 1 s at 100 Hz, 36 km/h (10 m/s) through a 1 rad/s turn to the right —
  // 10 m/s × 1 rad/s ÷ 9.81 ≈ 1.02 G — with one sample of the yaw gyro
  // kicked to −2000 °/s by a hit halfway.
  const t = Float64Array.from({ length: 101 }, (_, i) => i * 10);
  const v = new Float32Array(101).fill(36);
  const right = new Float32Array(101).fill((-180 / Math.PI) * 1);
  right[50] = -2000;

  it("reads v·ω/g, right positive, left negative", () => {
    expect(corneringGSeries(t, v, right)[20]).toBeCloseTo(10 / 9.81, 2);
    const left = right.map((w) => -w);
    expect(corneringGSeries(t, v, left)[20]).toBeCloseTo(-10 / 9.81, 2);
  });

  it("spreads a one-sample yaw hit over the window instead of printing it", () => {
    // Raw, that sample alone would read 35 G.
    expect(corneringGSeries(t, v, right)[50]).toBeLessThan(3);
  });
});

describe("bandpassSeries", () => {
  // 20 s at 200 Hz: a 5 Hz tone between a 0.3 Hz sway and a 40 Hz buzz.
  const fs = 200;
  const t = Float64Array.from({ length: 20 * fs }, (_, i) => (i * 1000) / fs);
  const tone = (hz: number, i: number) => Math.sin((2 * Math.PI * hz * i) / fs);
  const x = Float32Array.from(
    t,
    (_, i) => tone(5, i) + tone(0.3, i) + tone(40, i),
  );

  it("keeps the tone inside the band and drops the ones outside it", () => {
    const y = bandpassSeries(t, x, 2, 12);
    let worst = 0;
    for (let i = 5 * fs; i < 15 * fs; i++)
      worst = Math.max(worst, Math.abs(y[i] - tone(5, i)));
    expect(worst).toBeLessThan(0.15);
  });

  it("holds the band under the sample rate", () => {
    const y = bandpassSeries(t, x, 12, 60);
    for (let i = 5 * fs; i < 15 * fs; i++)
      expect(Number.isFinite(y[i])).toBe(true);
    // The 40 Hz buzz is inside 12–60: it survives, the 5 Hz tone does not.
    let rms = 0;
    for (let i = 5 * fs; i < 15 * fs; i++) rms += y[i] * y[i];
    expect(Math.sqrt(rms / (10 * fs))).toBeGreaterThan(0.5);
    expect(Math.sqrt(rms / (10 * fs))).toBeLessThan(0.9);
  });
});

describe("impactDecayRatio", () => {
  // 4 s at 400 Hz, a hit at 2 s: an 8 G spike, then a 6 Hz bounce that
  // dies with the given time constant.
  const fs = 400;
  const t = Float64Array.from({ length: 4 * fs }, (_, i) => (i * 1000) / fs);
  const hit = (tauMs: number) =>
    Float32Array.from(t, (ms) => {
      const dt = ms - 2000;
      if (dt < 0) return 0;
      if (dt < 10) return 8;
      return (
        3 * Math.exp(-dt / tauMs) * Math.sin((2 * Math.PI * 6 * dt) / 1000)
      );
    });

  it("reads less where the bounce dies sooner", () => {
    const fast = hit(60);
    const slow = hit(400);
    const rFast = impactDecayRatio(
      t,
      bandpassSeries(t, fast, 2, 12),
      fast,
      2000,
    )!;
    const rSlow = impactDecayRatio(
      t,
      bandpassSeries(t, slow, 2, 12),
      slow,
      2000,
    )!;
    expect(rFast).toBeGreaterThan(0);
    expect(rFast).toBeLessThan(rSlow);
    expect(rSlow).toBeLessThan(1);
  });

  it("is null off the end of the recording or on a hit with no peak", () => {
    const flat = new Float32Array(t.length);
    expect(impactDecayRatio(t, flat, flat, 2000)).toBeNull();
    expect(impactDecayRatio(t, flat, hit(60), 3900)).toBeNull();
  });
});

describe("impactRecoveryRatio", () => {
  // 4 s at 400 Hz, a hit at 1 s and the next at 1.8 s: an 8 G spike, then
  // a 6 Hz bounce that dies with the given time constant.
  const fs = 400;
  const t = Float64Array.from({ length: 4 * fs }, (_, i) => (i * 1000) / fs);
  const hits = (tauMs: number) =>
    Float32Array.from(t, (ms) => {
      let v = 0;
      for (const at of [1000, 1800]) {
        const dt = ms - at;
        if (dt < 0) continue;
        v +=
          dt < 10
            ? 8
            : 3 * Math.exp(-dt / tauMs) * Math.sin((2 * Math.PI * 6 * dt) / 1000);
      }
      return v;
    });

  it("reads less where the frame has settled before the next hit", () => {
    const fast = hits(60);
    const slow = hits(600);
    const rFast = impactRecoveryRatio(
      t,
      bandpassSeries(t, fast, 2, 12),
      fast,
      1000,
      1800,
    )!;
    const rSlow = impactRecoveryRatio(
      t,
      bandpassSeries(t, slow, 2, 12),
      slow,
      1000,
      1800,
    )!;
    expect(rFast).toBeGreaterThan(0);
    expect(rFast).toBeLessThan(rSlow);
    expect(rSlow).toBeLessThan(1);
  });

  it("finds the hits at the floor, the highest sample within the merge window", () => {
    const x = hits(60);
    // Two spikes of 8 G, 800 ms apart, each a 10 ms plateau (the second
    // rides the first's bounce, so its highest sample can be any of its
    // own); the bounce after each peaks under 3 G, so it is no hit.
    const found = recoveryHits(t, x);
    expect(found).toHaveLength(2);
    expect(found[0]).toBeGreaterThanOrEqual(1000);
    expect(found[0]).toBeLessThan(1010);
    expect(found[1]).toBeGreaterThanOrEqual(1800);
    expect(found[1]).toBeLessThan(1810);
    // A hit under the floor is no hit.
    const faint = Float32Array.from(x, (v) => v * 0.3);
    expect(recoveryHits(t, faint)).toEqual([]);
    // Two spikes 100 ms apart are one hit, the higher's instant.
    const twin = Float32Array.from(t, (ms) =>
      ms >= 1000 && ms < 1010 ? 5 : ms >= 1100 && ms < 1110 ? 7 : 0,
    );
    expect(recoveryHits(t, twin)).toEqual([1100]);
  });

  it("is null when the hits are not successive or the window has no room", () => {
    const x = hits(60);
    const band = bandpassSeries(t, x, 2, 12);
    // Too far apart to be one after the other.
    expect(impactRecoveryRatio(t, band, x, 1000, 1000 + 1600)).toBeNull();
    // So close the window before the second would sit on the first's peak.
    expect(impactRecoveryRatio(t, band, x, 1000, 1200)).toBeNull();
    // The wrong way round, and a hit with no peak.
    expect(impactRecoveryRatio(t, band, x, 1800, 1000)).toBeNull();
    const flat = new Float32Array(t.length);
    expect(impactRecoveryRatio(t, flat, flat, 1000, 1800)).toBeNull();
  });
});
