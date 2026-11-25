/**
 * The Sharp IR fork sensor's experimental median (2026-11-25, from the spec
 * "Sharp IR · Median 11", BIKIT telemetry engineering): a centred moving
 * median over the ADC's RAW readings, before any conversion, run on each
 * stretch of contiguous samples so it never reaches across a hole.
 *
 * Temporary and for the owner only: the analysis draws it behind a Dev info
 * control, and only on a side whose LIN1 says infrared. Nothing here touches
 * the file, the timestamps or the linear sensors' path.
 *
 * Not done here, from the same spec, on purpose for now: the 3.3 V LUT to
 * millimetres (the R0073/R0074 peaks go past its 3701 top, which it may not
 * extrapolate), travel and velocity from it, and the RAW/filtered overlay.
 */

import type { ImuSuspensionTrace } from "./format";

/** Bumped with any change to the filter or its segmentation. */
export const SHARP_MEDIAN_VERSION = 1;

/** The LIN1 flags bit the firmware sets for a Sharp (infrared) sensor:
 * proposed by the spec as bit 2, and what R0073/R0074 carry (0x06) while
 * every linear file seen carries 0x03. */
export const LIN_FLAG_INFRARED = 0x04;

/** The windows the spec asks to offer; 0 is off. */
export const SHARP_MEDIAN_WINDOWS = [0, 3, 5, 7, 9, 11, 15, 21] as const;
export type SharpMedianWindow = (typeof SHARP_MEDIAN_WINDOWS)[number];
export const SHARP_MEDIAN_DEFAULT: SharpMedianWindow = 11;

/** A step longer than this between two samples starts a new segment. */
export const SHARP_SEGMENT_GAP_MS = 10;

/**
 * Centred moving median over `samples`, `windowSize` odd. The ends use the
 * part of the window that exists; a non-finite sample stays NaN and is left
 * out of its neighbours' windows. As the spec's reference code.
 */
export function medianFilter(
  samples: ArrayLike<number>,
  windowSize = 11,
): Float64Array {
  if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize % 2 === 0)
    throw new Error("Window must be a positive odd integer");
  const output = new Float64Array(samples.length);
  const half = Math.floor(windowSize / 2);
  const values: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) {
      output[i] = NaN;
      continue;
    }
    values.length = 0;
    const to = Math.min(samples.length - 1, i + half);
    for (let j = Math.max(0, i - half); j <= to; j++)
      if (Number.isFinite(samples[j])) values.push(samples[j]);
    values.sort((a, b) => a - b);
    const m = Math.floor(values.length / 2);
    output[i] =
      values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
  }
  return output;
}

/** [start, end) index ranges of contiguous samples: split where the clock
 * stands still or goes back, or steps more than SHARP_SEGMENT_GAP_MS. */
export function contiguousSegments(tMs: ArrayLike<number>): [number, number][] {
  const out: [number, number][] = [];
  let start = 0;
  for (let i = 1; i < tMs.length; i++) {
    const dt = tMs[i] - tMs[i - 1];
    if (!(dt > 0) || dt > SHARP_SEGMENT_GAP_MS) {
      out.push([start, i]);
      start = i;
    }
  }
  if (tMs.length > 0) out.push([start, tMs.length]);
  return out;
}

/** The trace's RAW through the median, segment by segment, index for index
 * with `trace.tMs`. */
export function sharpMedianRaw(
  trace: Pick<ImuSuspensionTrace, "tMs" | "raw">,
  windowSize: number,
): Float64Array {
  const out = new Float64Array(trace.raw.length);
  for (const [a, b] of contiguousSegments(trace.tMs))
    out.set(medianFilter(trace.raw.subarray(a, b), windowSize), a);
  return out;
}
