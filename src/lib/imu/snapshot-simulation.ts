import type { SnapshotPassTrace } from "@/lib/imu/snapshot";

/**
 * The comparison's simulation (by request, 2026-10-28, from sketches):
 * every pass through a stretch replayed from the entry gate on one clock,
 * and how far each is ahead of or behind the reference as they go.
 *
 * Behind is read by ground, not by place: at an instant of the
 * reference's, the gap is how much longer — or shorter — the other pass
 * took to cover the same share of its ground. Each pass's share is of its
 * own line between the gates, so a wider line is not counted as lost time.
 */

/** When a trace had covered a share of its ground, ms from the entry. */
export function traceTimeAtProgress(
  trace: SnapshotPassTrace,
  progress: number,
): number {
  const p = trace.progress;
  const last = p.length - 1;
  if (progress <= p[0]) return 0;
  if (progress >= p[last]) return trace.durationMs;
  let lo = 1;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p[mid] < progress) lo = mid + 1;
    else hi = mid;
  }
  const span = p[lo] - p[lo - 1];
  const f = span > 0 ? (progress - p[lo - 1]) / span : 0;
  const t0 = (lo - 1) * trace.stepMs;
  const t1 = Math.min(lo * trace.stepMs, trace.durationMs);
  return t0 + f * (t1 - t0);
}

/** The sample of a trace at a time from the entry: its index, clamped to
 * the exit, and the share of the step past it. */
export function traceSampleAt(
  trace: SnapshotPassTrace,
  timeMs: number,
): { k: number; f: number } {
  const last = trace.progress.length - 1;
  const at = Math.max(0, Math.min(timeMs, trace.durationMs)) / trace.stepMs;
  const k = Math.min(last, Math.floor(at));
  return { k, f: k >= last ? 0 : at - k };
}

/** A trace's value at a time from the entry, between its samples. */
export function traceValueAt(
  trace: SnapshotPassTrace,
  values: ArrayLike<number>,
  timeMs: number,
): number {
  const { k, f } = traceSampleAt(trace, timeMs);
  return f > 0 ? values[k] + f * (values[k + 1] - values[k]) : values[k];
}

/** The gap to the reference at an instant of the reference's, ms —
 * positive behind it. Past the reference's exit it is the final gap, the
 * difference of the two times. */
export function gapToReferenceAt(
  trace: SnapshotPassTrace,
  reference: SnapshotPassTrace,
  timeMs: number,
): number | null {
  if (timeMs < 0) return null;
  if (timeMs >= reference.durationMs)
    return trace.durationMs - reference.durationMs;
  const progress = traceValueAt(reference, reference.progress, timeMs);
  return traceTimeAtProgress(trace, progress) - timeMs;
}

/**
 * How the map lays the passes out (by request, 2026-11-05, to compare the
 * ways tried on 2026-10-28 side by side). The times, the gaps and the
 * readout are the same in all of them — none was ever read off the map.
 *
 * - `gps`: where each run's GPS put it, on the curve through its fixes.
 * - `aligned`: each whole line shifted by its mean offset from the
 *   reference (the first fix for the GPS's steady error, 19:19 that day);
 *   a U-turn's mean also pushes it along, so it can start off the gate.
 * - `gates`: shifted by its offset at the entry gate there, at the exit
 *   gate there, and blended between (20:16, reverted for lines that left
 *   the trail).
 * - `lane`: along the reference's line by share of ground, beside it by
 *   the line ridden less the steady offset, within the trail (20:22, in
 *   production since c422bbb).
 * - `laneSmooth`: the lane with its sides read over 10 m of the reference,
 *   each pass's sideways averaged over 8 m and its edge reached softly
 *   (2026-11-05): the plain lane's edge shook with the reference's GPS,
 *   turned a corner wherever a line met it, and in a hairpin threw a line
 *   across the trail in a few samples.
 * - `alignedTrail`: the aligned lines as they are, and the stretch's trail
 *   opened out where they leave it (2026-11-05), within WIDEN_MAX_HALF_M
 *   either side — the lines kept, the ground drawn to hold them.
 * - `ghost`: on the reference's line, by share of ground — a dot each and
 *   no line of its own, the racing games' ghosts.
 */
export const SIMULATION_LAYOUTS = [
  "lane",
  "laneSmooth",
  "gps",
  "aligned",
  "alignedTrail",
  "gates",
  "ghost",
] as const;
export type SimulationLayout = (typeof SIMULATION_LAYOUTS)[number];

export function isSimulationLayout(value: unknown): value is SimulationLayout {
  return (SIMULATION_LAYOUTS as readonly unknown[]).includes(value);
}

/** A pass as a layout draws it. The reference is always as recorded. */
export function layoutTrace(
  layout: SimulationLayout,
  trace: SnapshotPassTrace,
  reference: SnapshotPassTrace,
  maxOffsetM: number,
): SnapshotPassTrace {
  switch (layout) {
    case "gps":
      return trace;
    case "aligned":
    case "alignedTrail":
      return alignTrace(trace, reference);
    case "gates":
      return gateTrace(trace, reference);
    case "lane":
      return laneTrace(trace, reference, maxOffsetM);
    case "laneSmooth":
      return laneTrace(trace, reference, maxOffsetM, {
        tangentSpanM: SMOOTH_LANE_TANGENT_M,
        softEdge: true,
        sidewaysSpanM: SMOOTH_LANE_SIDEWAYS_M,
      });
    case "ghost":
      return ghostTrace(trace, reference);
  }
}

/** Whether a layout opens the stretch's trail out to hold its lines. */
export function layoutWidensTrail(layout: SimulationLayout): boolean {
  return layout === "alignedTrail";
}

/** The widened trail reaches at most this far either side of the
 * reference's line, m — four times the trail's half-width; a line further
 * out than that stays outside rather than the trail turning into a field. */
export const WIDEN_MAX_HALF_M = 5;
/** A line is held this far inside the widened edge, m. */
const WIDEN_PAD_M = 0.5;
/** The widening grows and fades over this much of the line, m, so the
 * trail swells and narrows instead of stepping. */
const WIDEN_SPAN_M = 12;
/** The direction of the reference read over this much of its line, m. */
const WIDEN_TANGENT_M = 10;
/** On the inside of a bend the trail never reaches past this share of the
 * bend's radius, or its two edges would cross and fold over. */
const WIDEN_INSIDE_OF_RADIUS = 0.8;

/** The stretch's trail, widened: at each of the reference's samples, its
 * point, its left-hand normal (east, north) and how far the trail reaches
 * to the left and to the right of it, m. The base half-width is the
 * map's to add — the widths here are only what the lines need. */
export interface WidenedStretch {
  /** Distance along the reference's line, m. */
  alongM: number[];
  latDeg: number[];
  lonDeg: number[];
  nx: number[];
  ny: number[];
  leftM: number[];
  rightM: number[];
}

/**
 * How far the trail must reach either side of the reference's line to
 * hold every pass's line (by request, 2026-11-05: "keep the lines as they
 * are, open the trail where they leave it, within a limit"). Each pass's
 * points are put on the reference's line at the nearest place and read as
 * a distance to its left or right; the furthest at each place, plus a
 * little, is what the trail must reach. Then, so the shape stays a trail:
 * spread over WIDEN_SPAN_M (a running maximum, then a running mean), held
 * within WIDEN_MAX_HALF_M, and on the inside of a bend within most of its
 * radius.
 */
export function widenedStretch(
  /** The line the trail is drawn along — the reference's, or the trail
   * around it the map draws. */
  reference: { latDeg: number[]; lonDeg: number[] },
  passes: SnapshotPassTrace[],
): WidenedStretch {
  const lat0 = reference.latDeg[0];
  const lon0 = reference.lonDeg[0];
  const cos = Math.cos(lat0 * RAD);
  const toX = (lon: number) => (lon - lon0) * RAD * EARTH_R * cos;
  const toY = (lat: number) => (lat - lat0) * RAD * EARTH_R;
  const rx = reference.lonDeg.map(toX);
  const ry = reference.latDeg.map(toY);
  const n = rx.length;
  const along = [0];
  for (let k = 1; k < n; k++)
    along.push(along[k - 1] + Math.hypot(rx[k] - rx[k - 1], ry[k] - ry[k - 1]));
  const length = along[n - 1];
  const pointAt = (s: number) => {
    const c = Math.max(0, Math.min(length, s));
    let k = 1;
    while (k < n - 1 && along[k] < c) k++;
    const span = along[k] - along[k - 1];
    const f = span > 0 ? (c - along[k - 1]) / span : 0;
    return {
      x: rx[k - 1] + f * (rx[k] - rx[k - 1]),
      y: ry[k - 1] + f * (ry[k] - ry[k - 1]),
    };
  };
  const headingAt = (s: number) => {
    const a = pointAt(s - WIDEN_TANGENT_M / 2);
    const b = pointAt(s + WIDEN_TANGENT_M / 2);
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const nx: number[] = [];
  const ny: number[] = [];
  /** Signed curvature, 1/m — positive turning left. */
  const bend: number[] = [];
  for (let k = 0; k < n; k++) {
    const h = headingAt(along[k]);
    nx.push(-Math.sin(h));
    ny.push(Math.cos(h));
    // The bend over 10 m, not 5: a GPS wobble in the reference is no bend.
    let dh = headingAt(along[k] + 5) - headingAt(along[k] - 5);
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    bend.push(dh / 10);
  }

  // What each place needs: the furthest line to its left and its right.
  const needL = new Array<number>(n).fill(0);
  const needR = new Array<number>(n).fill(0);
  for (const pass of passes)
    for (let i = 0; i < pass.latDeg.length; i++) {
      const px = toX(pass.lonDeg[i]);
      const py = toY(pass.latDeg[i]);
      let best = Infinity;
      let at = 0;
      let side = 0;
      for (let k = 1; k < n; k++) {
        const ax = rx[k - 1];
        const ay = ry[k - 1];
        const dx = rx[k] - ax;
        const dy = ry[k] - ay;
        const len2 = dx * dx + dy * dy;
        const t =
          len2 > 0
            ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
            : 0;
        const qx = ax + t * dx;
        const qy = ay + t * dy;
        const d = Math.hypot(px - qx, py - qy);
        if (d < best) {
          best = d;
          at = t < 0.5 ? k - 1 : k;
          side = dx * (py - ay) - dy * (px - ax);
        }
      }
      const need = best + WIDEN_PAD_M;
      if (side >= 0) needL[at] = Math.max(needL[at], need);
      else needR[at] = Math.max(needR[at], need);
    }

  // Spread along the line: the furthest within half the span, then the
  // mean of that within half the span — a swell, not a spike.
  const half = WIDEN_SPAN_M / 2;
  const window = (values: number[], pick: (xs: number[]) => number) =>
    values.map((_, k) => {
      const xs: number[] = [];
      for (let j = 0; j < n; j++)
        if (Math.abs(along[j] - along[k]) <= half) xs.push(values[j]);
      return pick(xs);
    });
  const spread = (values: number[]) =>
    window(
      window(values, (xs) => Math.max(...xs)),
      (xs) => xs.reduce((a, b) => a + b, 0) / xs.length,
    );
  const leftM = spread(needL);
  const rightM = spread(needR);
  for (let k = 0; k < n; k++) {
    leftM[k] = Math.min(WIDEN_MAX_HALF_M, leftM[k]);
    rightM[k] = Math.min(WIDEN_MAX_HALF_M, rightM[k]);
    const radius = Math.abs(bend[k]) > 1e-6 ? 1 / Math.abs(bend[k]) : Infinity;
    const inside = WIDEN_INSIDE_OF_RADIUS * radius;
    if (bend[k] > 0) leftM[k] = Math.min(leftM[k], inside);
    else if (bend[k] < 0) rightM[k] = Math.min(rightM[k], inside);
  }
  // The limits cut where they bite; spread once more so the cut is a
  // slope, not a notch (2026-11-05, the Cabeço S-bend's inside edge).
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const leftSmooth = window(leftM, mean);
  const rightSmooth = window(rightM, mean);
  return {
    alongM: along,
    latDeg: reference.latDeg.slice(),
    lonDeg: reference.lonDeg.slice(),
    nx,
    ny,
    leftM: leftSmooth,
    rightM: rightSmooth,
  };
}

/** Shares of the ground the alignment compares the two lines at. */
const ALIGN_SAMPLES = 50;

/**
 * A pass moved onto the reference's line (by request, 2026-10-28): its
 * whole line shifted by its mean distance from the reference, compared at
 * the same shares of their ground. A run's GPS is off by a few metres the
 * same way for the whole run — 5 m between R0050 and R0059, ridden two
 * days apart — which drew the same corner beside itself; shifted, the
 * lines lie together and only the line ridden differs. Its shape, its
 * times and its gaps are untouched.
 */
export function alignTrace(
  trace: SnapshotPassTrace,
  reference: SnapshotPassTrace,
): SnapshotPassTrace {
  let dLat = 0;
  let dLon = 0;
  for (let i = 0; i <= ALIGN_SAMPLES; i++) {
    const share = i / ALIGN_SAMPLES;
    const own = traceTimeAtProgress(trace, share);
    const ref = traceTimeAtProgress(reference, share);
    dLat +=
      traceValueAt(reference, reference.latDeg, ref) -
      traceValueAt(trace, trace.latDeg, own);
    dLon +=
      traceValueAt(reference, reference.lonDeg, ref) -
      traceValueAt(trace, trace.lonDeg, own);
  }
  dLat /= ALIGN_SAMPLES + 1;
  dLon /= ALIGN_SAMPLES + 1;
  return {
    ...trace,
    latDeg: trace.latDeg.map((v) => v + dLat),
    lonDeg: trace.lonDeg.map((v) => v + dLon),
  };
}

/**
 * A pass pinned to the reference's gates (2026-10-28, tried and reverted
 * that evening): shifted by its offset from the reference at the entry,
 * by its offset at the exit, and by a blend of the two between, by its
 * share of the ground — so every pass starts and ends where the reference
 * did. Its shape between them is kept; a side step on a gate is not.
 */
export function gateTrace(
  trace: SnapshotPassTrace,
  reference: SnapshotPassTrace,
): SnapshotPassTrace {
  const last = trace.latDeg.length - 1;
  const refLast = reference.latDeg.length - 1;
  const inLat = reference.latDeg[0] - trace.latDeg[0];
  const inLon = reference.lonDeg[0] - trace.lonDeg[0];
  const outLat = reference.latDeg[refLast] - trace.latDeg[last];
  const outLon = reference.lonDeg[refLast] - trace.lonDeg[last];
  return {
    ...trace,
    latDeg: trace.latDeg.map(
      (v, k) => v + inLat + trace.progress[k] * (outLat - inLat),
    ),
    lonDeg: trace.lonDeg.map(
      (v, k) => v + inLon + trace.progress[k] * (outLon - inLon),
    ),
  };
}

/**
 * A pass as a ghost on the reference's line (2026-10-28's second option):
 * at each instant where the reference was when it had covered the same
 * share of its ground. Who is ahead reads at a glance; the line ridden is
 * not shown at all.
 */
export function ghostTrace(
  trace: SnapshotPassTrace,
  reference: SnapshotPassTrace,
): SnapshotPassTrace {
  const at = trace.progress.map((p) => traceTimeAtProgress(reference, p));
  return {
    ...trace,
    latDeg: at.map((ms) => traceValueAt(reference, reference.latDeg, ms)),
    lonDeg: at.map((ms) => traceValueAt(reference, reference.lonDeg, ms)),
  };
}

const EARTH_R = 6_371_000;
const RAD = Math.PI / 180;
/** The reference's direction at a point is read over this many samples
 * either side, so a GPS wobble does not turn its sideways. */
const LANE_TANGENT_SPAN = 4;
/** The smooth lane reads the reference's direction over this much of its
 * line, m, half each side. On the Cabeço corner of 2026-11-05 the plain
 * lane's 2.2 m (four samples of 0.27 m each side) swung by enough to step
 * a line held 1.25 m out by up to 0.25 m. */
const SMOOTH_LANE_TANGENT_M = 10;
/** …and averages each pass's sideways over this much of the line, m. */
const SMOOTH_LANE_SIDEWAYS_M = 8;

/**
 * A pass laid out in the reference's lane (by request, 2026-10-28): where
 * it was along the stretch and how far to the side of the reference's
 * line, not where its GPS put it.
 *
 * Along: the share of its own ground it had covered, put at the same share
 * of the reference's line — so every pass starts on the entry gate and
 * ends on the exit gate. Sideways: its distance from the reference's line
 * there, less its own mean distance over the stretch — a run's GPS sits a
 * few metres off the same way for a long while (5 m between R0050 and
 * R0059, two days apart), and that is no line ridden — and held within
 * `maxOffsetM`, the trail's half-width, so it stays on the trail. What is
 * left is the line ridden: wider out of a corner, tighter into it. Under
 * about a metre that is the GPS's own scatter, not the rider. Its times and
 * its gaps are untouched.
 */
export function laneTrace(
  trace: SnapshotPassTrace,
  reference: SnapshotPassTrace,
  maxOffsetM: number,
  options: {
    /** Read the reference's direction over this many metres of its line
     * instead of LANE_TANGENT_SPAN samples either side. */
    tangentSpanM?: number;
    /** Reach the trail's edge softly, as tanh does, instead of cutting at
     * it: a line meeting the edge turns no corner, and one far off still
     * sits a hair inside it. */
    softEdge?: boolean;
    /** Average the sideways over this many metres of the reference's line,
     * centred: in a hairpin a line metres off the reference swings from one
     * side to the other within a few samples, as its normal turns round. */
    sidewaysSpanM?: number;
  } = {},
): SnapshotPassTrace {
  const lat0 = reference.latDeg[0];
  const lon0 = reference.lonDeg[0];
  const cos = Math.cos(lat0 * RAD);
  const toX = (lon: number) => (lon - lon0) * RAD * EARTH_R * cos;
  const toY = (lat: number) => (lat - lat0) * RAD * EARTH_R;
  const rx = reference.lonDeg.map(toX);
  const ry = reference.latDeg.map(toY);
  const n = rx.length;
  // The reference's line by distance along it.
  const along = [0];
  for (let k = 1; k < n; k++)
    along.push(along[k - 1] + Math.hypot(rx[k] - rx[k - 1], ry[k] - ry[k - 1]));
  const length = along[n - 1];
  // The point of the line at a distance along it, and the sample past it.
  const pointAt = (s: number) => {
    let lo = 1;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (along[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const k = lo;
    const span = along[k] - along[k - 1];
    const f =
      span > 0 ? Math.min(1, Math.max(0, (s - along[k - 1]) / span)) : 0;
    return {
      k,
      x: rx[k - 1] + f * (rx[k] - rx[k - 1]),
      y: ry[k - 1] + f * (ry[k] - ry[k - 1]),
    };
  };
  // …and its left-hand normal there.
  const frame = (s: number) => {
    const { k, x, y } = pointAt(s);
    let tx: number;
    let ty: number;
    if (options.tangentSpanM != null) {
      const half = options.tangentSpanM / 2;
      const p0 = pointAt(Math.max(0, s - half));
      const p1 = pointAt(Math.min(length, s + half));
      tx = p1.x - p0.x;
      ty = p1.y - p0.y;
    } else {
      const a = Math.max(0, k - 1 - LANE_TANGENT_SPAN);
      const b = Math.min(n - 1, k + LANE_TANGENT_SPAN);
      tx = rx[b] - rx[a];
      ty = ry[b] - ry[a];
    }
    const t = Math.hypot(tx, ty) || 1;
    return { x, y, nx: -ty / t, ny: tx / t };
  };
  const frames = trace.progress.map((p) => frame(p * length));
  const sideways = frames.map(
    (fr, k) =>
      (toX(trace.lonDeg[k]) - fr.x) * fr.nx +
      (toY(trace.latDeg[k]) - fr.y) * fr.ny,
  );
  const mean = sideways.reduce((sum, d) => sum + d, 0) / sideways.length;
  const span = options.sidewaysSpanM;
  const shown =
    span != null && span > 0
      ? sideways.map((_, k) => {
          // The samples within half the span of this one, along the line.
          const at = trace.progress[k] * length;
          let sum = 0;
          let count = 0;
          for (let j = 0; j < sideways.length; j++)
            if (Math.abs(trace.progress[j] * length - at) <= span / 2) {
              sum += sideways[j];
              count++;
            }
          return sum / count;
        })
      : sideways;
  const latDeg: number[] = [];
  const lonDeg: number[] = [];
  frames.forEach((fr, k) => {
    const raw = shown[k] - mean;
    const d = options.softEdge
      ? maxOffsetM * Math.tanh(raw / maxOffsetM)
      : Math.max(-maxOffsetM, Math.min(maxOffsetM, raw));
    lonDeg.push(lon0 + (fr.x + d * fr.nx) / (RAD * EARTH_R * cos));
    latDeg.push(lat0 + (fr.y + d * fr.ny) / (RAD * EARTH_R));
  });
  return { ...trace, latDeg, lonDeg };
}

const GRAVITY = 9.81;

/** A flight as a ball would fly it — the side view's arc (2026-10-29). */
export interface FlightShape {
  airtimeS: number;
  /** Along and up at the lip, m/s. */
  vx: number;
  vy: number;
  /** How far and how high, m. */
  distanceM: number;
  apexM: number;
}

/**
 * The arc of a flight from what the logger knows of it: the time in the
 * air (the IMU's, to the millisecond) and the speed off the lip (the fused
 * speed). As if the landing were as high as the lip — the only shape those
 * two allow: the rise is then g·t/2, the height g·t²/8, the run the rest of
 * the speed times the time. A landing lower than the lip (most of a
 * trail's) gives a longer flight for the same jump, so the height reads
 * over and the run a little over: the page says both are estimates. Null
 * without a speed or a flight.
 */
export function flightShape(
  airtimeMs: number,
  takeoffKmh: number | null,
): FlightShape | null {
  if (takeoffKmh == null || !(airtimeMs > 0) || !(takeoffKmh > 0)) return null;
  const t = airtimeMs / 1000;
  const v = takeoffKmh / 3.6;
  const vy = (GRAVITY * t) / 2;
  // A speed too low for the time in the air cannot be split; it is then
  // all taken as along the ground, the arc's height still the time's.
  const vx = vy < v ? Math.sqrt(v * v - vy * vy) : v;
  return {
    airtimeS: t,
    vx,
    vy,
    distanceM: vx * t,
    apexM: (GRAVITY * t * t) / 8,
  };
}

/** Where a flight is a time after the lip, m along and up from it. */
export function flightPositionAt(
  shape: FlightShape,
  afterTakeoffS: number,
): { x: number; y: number } {
  const s = Math.max(0, Math.min(shape.airtimeS, afterTakeoffS));
  return { x: shape.vx * s, y: shape.vy * s - (GRAVITY * s * s) / 2 };
}
