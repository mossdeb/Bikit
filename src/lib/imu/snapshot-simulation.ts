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

const EARTH_R = 6_371_000;
const RAD = Math.PI / 180;
/** The reference's direction at a point is read over this many samples
 * either side, so a GPS wobble does not turn its sideways. */
const LANE_TANGENT_SPAN = 4;

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
  // The point of the line at a distance along it, and its left-hand normal.
  const frame = (s: number) => {
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
    const x = rx[k - 1] + f * (rx[k] - rx[k - 1]);
    const y = ry[k - 1] + f * (ry[k] - ry[k - 1]);
    const a = Math.max(0, k - 1 - LANE_TANGENT_SPAN);
    const b = Math.min(n - 1, k + LANE_TANGENT_SPAN);
    const tx = rx[b] - rx[a];
    const ty = ry[b] - ry[a];
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
  const latDeg: number[] = [];
  const lonDeg: number[] = [];
  frames.forEach((fr, k) => {
    const d = Math.max(-maxOffsetM, Math.min(maxOffsetM, sideways[k] - mean));
    lonDeg.push(lon0 + (fr.x + d * fr.nx) / (RAD * EARTH_R * cos));
    latDeg.push(lat0 + (fr.y + d * fr.ny) / (RAD * EARTH_R));
  });
  return { ...trace, latDeg, lonDeg };
}
