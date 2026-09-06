/**
 * Undoing the logger's rotated frames.
 *
 * The LSM6DS3TR-C hands its FIFO out six words at a time — Gx Gy Gz Ax Ay
 * Az — and the firmware (through V11, at least; see the 2026-09-06 bench
 * test S0113) sometimes lands out of step with it: for tens of seconds at a
 * time every stored frame is the true one rotated by k words, so what the
 * file calls "az" is a gyro reading and what it calls "gz" is gravity. It
 * happens on the bench with the logger still, so it is not vibration; it is
 * the read path, and until the firmware reads the sensor another way, the
 * files we already have — and the ones recorded tomorrow — arrive this way.
 *
 * Physics tells the rotation apart. Over a second the mean of the three
 * accelerometer words is gravity: a vector of 1 g, whatever the bike is
 * doing. The mean of the three gyro words is small: a bike does not spin.
 * Try all six rotations on each window, keep the one where the accel
 * triplet averages 1 g and the gyro triplet averages near zero, and rotate
 * the words back. In counts, not in g or °/s: a word that moves from a gyro
 * role to an accel role changes units, and the sensor's scales are what
 * relate them (1 g of gravity read as a gyro is 143 °/s).
 *
 * Deliberately cautious. A window only votes when the best rotation beats
 * the second by a margin and looks like physics; the rest inherit their
 * neighbour's. Hard riding blurs the vote — the mean gyro in a long turn is
 * not small — so windows are a second long, enough for gravity to
 * dominate and short enough that a rotation lasting seconds is caught.
 * Boundaries between rotations are then refined to the sample. A session
 * that never rotated comes back unchanged, arrays and all.
 */

import type {
  ImuRealignment,
  ImuRealignSegment,
  ImuSensorScales,
  ImuSessionData,
} from "./format";

/** The LSM6DS3TR-C at ±16 g / ±2000 °/s, the logger's configuration and
 * what the exporter's JSON assumes. */
export const DEFAULT_SENSOR_SCALES: ImuSensorScales = {
  accelGPerLsb: 488e-6,
  gyroDpsPerLsb: 0.07,
};

const WORDS = 6;
/** Voting window. */
const DEFAULT_WINDOW_MS = 1000;
/** A window votes only when its best rotation scores under this. */
const MAX_ERR = 0.6;
/** …and beats the runner-up by this much. */
const MIN_MARGIN = 0.2;
/** After the repair, a window scoring worse than this under its assigned
 * rotation is reported as unresolved. Looser than MAX_ERR: a hard second of
 * riding (a 60 °/s turn, a 0.2 g mean off gravity, a 30° lean) scores
 * ~0.55 and is fine; a wrong rotation scores 1 and up. */
const UNRESOLVED_ERR = 0.9;
/** Weight of the mean gyro, in g-equivalent counts: a 60 °/s turn held
 * for a whole second costs 0.21, a gyro word posing as gravity costs 0.5. */
const GYRO_WEIGHT = 0.5;
/** Weight of the direction term: 1 − cos of the angle between the window's
 * gravity and the reference. A 30° lean costs 0.07; gravity's components
 * permuted into the wrong slots cost 0.5–1. */
const DIRECTION_WEIGHT = 0.5;
/** Boundary refinement step, samples. */
const REFINE_STEP = 8;

/**
 * The session with its frames un-rotated, and a report of what was found.
 * Same contract as the other derive steps: the same object back when there
 * is nothing to do (too short to judge, or nothing rotated), fresh channel
 * arrays otherwise and the originals untouched.
 */
export function realignImuWords(
  session: ImuSessionData,
  options: { windowMs?: number } = {},
): ImuSessionData {
  const { tMs, ax, ay, az, gx, gy, gz, gForce } = session.channels;
  const n = tMs.length;
  const rate = session.sampleRateHz;
  if (!(rate > 0)) return session;
  // Voting window in samples; a session under two of them cannot be judged.
  const W = Math.max(
    8,
    Math.round((rate * (options.windowMs ?? DEFAULT_WINDOW_MS)) / 1000),
  );
  if (n < W * 2) return session;

  const scales = session.sensorScales ?? DEFAULT_SENSOR_SCALES;
  const aS = scales.accelGPerLsb;
  const gS = scales.gyroDpsPerLsb;
  const src = [ax, ay, az, gx, gy, gz];
  const scale = [aS, aS, aS, gS, gS, gS];

  // Prefix sums of each stored word in raw counts, so any range's mean is
  // two lookups — the vote and the boundary search both lean on this.
  const P = src.map((ch, j) => {
    const p = new Float64Array(n + 1);
    const inv = 1 / scale[j];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += ch[i] * inv;
      p[i + 1] = acc;
    }
    return p;
  });

  // Which stored word holds channel c under rotation k.
  const wordOf = (c: number, k: number) => (((c - k) % WORDS) + WORDS) % WORDS;
  const mean = (c: number, k: number, a: number, b: number) =>
    ((P[wordOf(c, k)][b] - P[wordOf(c, k)][a]) / (b - a)) * aS;

  // Magnitudes alone cannot always tell. With gravity along one axis and
  // the bike still, shifting the frame by one word swaps a near-zero accel
  // axis with a near-zero gyro axis and nothing in |mean accel| or |mean
  // gyro| moves — k=0 and k=5 tie. The DIRECTION of gravity breaks the tie:
  // its components permuted into other slots point somewhere else entirely.
  // The reference is the first second of the file, which the FIFO starts
  // aligned by construction, when that second looks like a resting sensor;
  // otherwise the calibration's gravity, if there is one.
  let ref: [number, number, number] | null = null;
  {
    const g0: [number, number, number] = [
      mean(0, 0, 0, W),
      mean(1, 0, 0, W),
      mean(2, 0, 0, W),
    ];
    const mag = Math.hypot(...g0);
    const gyr = Math.hypot(
      mean(3, 0, 0, W),
      mean(4, 0, 0, W),
      mean(5, 0, 0, W),
    );
    if (Math.abs(mag - 1) < 0.2 && gyr < 0.1) {
      ref = [g0[0] / mag, g0[1] / mag, g0[2] / mag];
    } else if (session.calibration) {
      const c = session.calibration.gravityRefG;
      const m = Math.hypot(...c);
      if (m > 0) ref = [c[0] / m, c[1] / m, c[2] / m];
    }
  }

  // How far range [a, b) under rotation k is from physics: |mean accel| off
  // 1 g, the mean gyro in g-equivalent counts (143 °/s is a whole g), and
  // how far the mean accel points from where gravity should be.
  const err = (a: number, b: number, k: number): number => {
    if (b - a <= 0) return Infinity;
    const x = mean(0, k, a, b);
    const y = mean(1, k, a, b);
    const z = mean(2, k, a, b);
    const acc = Math.hypot(x, y, z);
    const gyr = Math.hypot(
      mean(3, k, a, b),
      mean(4, k, a, b),
      mean(5, k, a, b),
    );
    let e = Math.abs(acc - 1) + GYRO_WEIGHT * gyr;
    if (ref && acc > 0) {
      const cos = (x * ref[0] + y * ref[1] + z * ref[2]) / acc;
      e += DIRECTION_WEIGHT * (1 - cos);
    }
    return e;
  };

  // One vote per window; -1 is "could not tell".
  const windows = Math.floor(n / W);
  const ks = new Int8Array(windows).fill(-1);
  let decided = 0;
  for (let i = 0; i < windows; i++) {
    const a = i * W;
    const b = i === windows - 1 ? n : a + W;
    let best = 0;
    let e1 = Infinity;
    let e2 = Infinity;
    for (let k = 0; k < WORDS; k++) {
      const e = err(a, b, k);
      if (e < e1) {
        e2 = e1;
        e1 = e;
        best = k;
      } else if (e < e2) {
        e2 = e;
      }
    }
    if (e1 < MAX_ERR && e2 - e1 >= MIN_MARGIN) {
      ks[i] = best;
      decided++;
    }
  }
  if (decided === 0) return session;

  // Undecided windows inherit: the previous decided one, or the first
  // decided one when they lead.
  const first = ks.findIndex((k) => k >= 0);
  for (let i = 0; i < first; i++) ks[i] = ks[first];
  for (let i = first + 1; i < windows; i++) if (ks[i] < 0) ks[i] = ks[i - 1];

  // Runs of one rotation, with the boundary between two runs moved to the
  // sample where the two rotations best explain their own sides.
  const runs: { from: number; to: number; k: number }[] = [];
  let segStart = 0;
  for (let i = 1; i <= windows; i++) {
    if (i < windows && ks[i] === ks[i - 1]) continue;
    let split = n;
    if (i < windows) {
      const lo = Math.max(segStart, (i - 1) * W);
      const hi = Math.min(n, (i + 1) * W);
      split = i * W;
      let bestCost = Infinity;
      for (let s = lo + REFINE_STEP; s <= hi - REFINE_STEP; s += REFINE_STEP) {
        const cost =
          err(lo, s, ks[i - 1]) * (s - lo) + err(s, hi, ks[i]) * (hi - s);
        if (cost < bestCost) {
          bestCost = cost;
          split = s;
        }
      }
    }
    runs.push({ from: segStart, to: split, k: ks[i - 1] });
    segStart = split;
  }

  const period = 1000 / rate;
  const segments: ImuRealignSegment[] = runs.map((r) => ({
    fromMs: tMs[r.from],
    toMs: r.to < n ? tMs[r.to] : tMs[n - 1] + period,
    k: r.k,
  }));
  let rotatedMs = 0;
  for (const s of segments) if (s.k !== 0) rotatedMs += s.toMs - s.fromMs;

  // What the repair could not make right: windows that, under the rotation
  // they were given, still do not look like a sensor on a bike. A file
  // whose rotation flips faster than a window (firmware V11_3 did this on
  // every burst) ends up here, and the page must say so rather than show
  // it as fixed.
  let unresolvedMs = 0;
  {
    let r = 0;
    for (let i = 0; i < windows; i++) {
      const a = i * W;
      const b = i === windows - 1 ? n : a + W;
      while (r < runs.length - 1 && runs[r].to <= a) r++;
      // A window a boundary runs through is mixed by construction; judge
      // only the ones that sit whole inside one run.
      if (runs[r].to < b) continue;
      if (err(a, b, runs[r].k) > UNRESOLVED_ERR)
        unresolvedMs += (b - a) * period;
    }
  }

  const realignment: ImuRealignment = {
    windowMs: W * period,
    windows,
    decided,
    rotatedMs,
    unresolvedMs,
    totalMs: tMs[n - 1] - tMs[0] + period,
    segments,
  };

  if (rotatedMs === 0) return { ...session, realignment };

  // Rotate back, segment by segment, through raw counts: channel c takes the
  // stored word that held it, rescaled from that word's unit to its own.
  const out = src.map(() => new Float32Array(n));
  for (const r of runs) {
    for (let c = 0; c < WORDS; c++) {
      const j = wordOf(c, r.k);
      const from = src[j];
      const to = out[c];
      const factor = scale[c] / scale[j];
      for (let i = r.from; i < r.to; i++) to[i] = from[i] * factor;
    }
  }

  return {
    ...session,
    channels: {
      tMs,
      ax: out[0],
      ay: out[1],
      az: out[2],
      gx: out[3],
      gy: out[4],
      gz: out[5],
      // A g-force the file precomputed was computed from the rotated
      // words; derive.ts recomputes it from the repaired ones.
      gForce: gForce ? null : gForce,
    },
    realignment,
  };
}
