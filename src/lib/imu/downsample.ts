/**
 * Zoom-adaptive downsampling for the session chart.
 *
 * A 6-minute session at 100 Hz is ~36k samples; the plot is ~800 CSS pixels
 * wide. Drawing every sample wastes work and, worse, antialiases spikes away.
 * A min/max envelope per pixel bucket keeps every extreme visible — a 10 ms
 * impact spike survives any zoom level — while the drawn polyline stays at
 * ~2 points per pixel whatever the recording length.
 *
 * The original arrays are never touched; this returns new, smaller ones.
 * Granularity adapts to zoom by construction: the envelope is recomputed
 * over the visible window, so zooming in raises resolution until, below
 * ~2 samples per bucket, the raw samples are returned as they are.
 */

export interface EnvelopePoint {
  tMs: number;
  value: number;
}

/**
 * Min/max envelope of values[i0..i1] (inclusive) into at most `buckets`
 * time slices. Each bucket contributes its minimum and maximum in the order
 * they occurred, preserving the shape of the swing inside the bucket.
 */
export function minMaxEnvelope(
  tMs: Float64Array,
  values: ArrayLike<number>,
  i0: number,
  i1: number,
  buckets: number
): EnvelopePoint[] {
  const from = Math.max(0, i0);
  const to = Math.min(tMs.length - 1, i1);
  const count = to - from + 1;
  if (count <= 0 || buckets <= 0) return [];

  // Fewer than ~2 samples per bucket: the raw data is already at (or below)
  // drawing resolution, so it is returned untouched.
  if (count <= buckets * 2) {
    const out: EnvelopePoint[] = new Array(count);
    for (let i = 0; i < count; i++) out[i] = { tMs: tMs[from + i], value: values[from + i] };
    return out;
  }

  const t0 = tMs[from];
  const t1 = tMs[to];
  const span = t1 - t0;
  if (span <= 0) return [{ tMs: t0, value: values[from] }];

  const out: EnvelopePoint[] = [];
  let i = from;
  for (let b = 0; b < buckets && i <= to; b++) {
    const bucketEnd = b === buckets - 1 ? t1 : t0 + (span * (b + 1)) / buckets;
    let minIdx = i;
    let maxIdx = i;
    let j = i;
    while (j <= to && (tMs[j] <= bucketEnd || j === i)) {
      if (values[j] < values[minIdx]) minIdx = j;
      if (values[j] > values[maxIdx]) maxIdx = j;
      j++;
    }
    if (minIdx === maxIdx) {
      out.push({ tMs: tMs[minIdx], value: values[minIdx] });
    } else if (minIdx < maxIdx) {
      out.push({ tMs: tMs[minIdx], value: values[minIdx] }, { tMs: tMs[maxIdx], value: values[maxIdx] });
    } else {
      out.push({ tMs: tMs[maxIdx], value: values[maxIdx] }, { tMs: tMs[minIdx], value: values[minIdx] });
    }
    i = j;
  }
  return out;
}

/** First sample index at or after a time — the window's left edge. */
export function lowerBoundIndex(tMs: Float64Array, targetMs: number): number {
  let lo = 0;
  let hi = tMs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tMs[mid] < targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Last sample index at or before a time — the window's right edge.
 * Clamped to 0 when every sample is after the time, so a window edge is
 * always a usable index. */
export function upperBoundIndex(tMs: Float64Array, targetMs: number): number {
  let lo = -1;
  let hi = tMs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tMs[mid] <= targetMs) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}
