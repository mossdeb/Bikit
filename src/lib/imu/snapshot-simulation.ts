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
