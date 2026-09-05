import { describe, expect, it } from "vitest";
import type { GpsChannels, ImuSessionData } from "./format";
import {
  IMPACT_SEVERITY_REF_ENERGY,
  alignSessionToBike,
  altitudeMSeries,
  applyMountingYaw,
  estimateMountingYaw,
  eventsAt,
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
    // Mirror the lateral axis: the turn now reads as if to the left.
    for (let i = 0; i < s.channels.ay.length; i++) {
      s.channels.ay[i] = -s.channels.ay[i];
      s.channels.gz[i] = -s.channels.gz[i];
    }
    const m = estimateMountingYaw(s);
    expect(m).not.toBeNull();
    expect(m!.headingCheck).toBe("inverted");
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
  it("settles on the accelerometer's angle when the bike is held nose-up", () => {
    // 30° nose up: ax = -sin 30° = -0.5, az = cos 30°, gyro silent.
    const n = 500;
    const t = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
    const ax = new Float32Array(n).fill(-0.5);
    const ay = new Float32Array(n);
    const az = new Float32Array(n).fill(Math.cos(Math.PI / 6));
    const gy = new Float32Array(n);
    const pitch = pitchSeries(t, ax, ay, az, gy);
    expect(pitch[n - 1]).toBeCloseTo(30, 1);
  });

  it("reads level ground as zero", () => {
    const n = 100;
    const t = new Float64Array(Array.from({ length: n }, (_, i) => i * 10));
    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    const az = new Float32Array(n).fill(1);
    const gy = new Float32Array(n);
    const pitch = pitchSeries(t, ax, ay, az, gy);
    expect(pitch[n - 1]).toBeCloseTo(0, 5);
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
