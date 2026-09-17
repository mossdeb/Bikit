/**
 * Reading the high-g accelerometer's shocks against the main IMU's events
 * (firmware V15, 2026-09-17).
 *
 * What the two sensors are to each other. The LSM6DS3 is the recording:
 * continuous, 416 Hz, ±16 g, in the bike's frame once aligned — every
 * figure of the report is read from it. The ADXL375 is a witness called
 * only for the hits: 40 ms at 800 Hz round each shock over its ~7,8 g
 * threshold, ±200 g, in its own uncalibrated frame. So the link is by
 * INSTANT and the reading is by MAGNITUDE: a shock belongs to the impact
 * or the landing it fell within HIGHG_LINK_MS of, and what it adds is the
 * one number the main IMU cannot give — how hard the hit really peaked.
 *
 * It does NOT replace the main IMU's peak. The two differ by more than the
 * clipping: twice the sample rate and a wider band read a short shock
 * higher at any level (on the bench, 12,7 g against 6,3 g for the same
 * tap, far under 16 g). A session recorded without the sensor has no such
 * figure, so putting it where "Pico" or "G máx" stand would make sessions
 * with and without it incomparable. It is shown as its own figure, named
 * for where it came from.
 */

import type { ImuHighGEvent } from "./format";

/** A shock this close to an event's instant is that event's, ms. The
 * window covers what separates the two readings of one hit: the impact
 * detector names the main IMU's highest sample within 500 ms, the shock
 * interrupt fires as the hit ends, and the two clocks agree to a sample. */
export const HIGHG_LINK_MS = 100;

/** The hardest shock within `withinMs` of an instant, or null. */
export function highGNear(
  hits: readonly ImuHighGEvent[] | undefined,
  timeMs: number,
  withinMs = HIGHG_LINK_MS,
): ImuHighGEvent | null {
  let best: ImuHighGEvent | null = null;
  for (const hit of hits ?? [])
    if (
      Math.abs(hit.timeMs - timeMs) <= withinMs &&
      (!best || hit.peakG > best.peakG)
    )
      best = hit;
  return best;
}

/** How long the shock stayed over `fraction` of its peak, ms — how sharp
 * the hit was, read off the window the sensor kept. */
export function highGWidthMs(hit: ImuHighGEvent, fraction = 0.5): number {
  let over = 0;
  for (let k = 0; k < hit.x.length; k++)
    if (Math.hypot(hit.x[k], hit.y[k], hit.z[k]) >= fraction * hit.peakG)
      over++;
  return (over * 1000) / hit.sampleRateHz;
}

/** The session's shocks in one line: how many, the hardest and when —
 * null on a file without the sensor. */
export function highGSummary(
  hits: readonly ImuHighGEvent[] | undefined,
): { count: number; maxG: number | null; maxAtMs: number | null } | null {
  if (!hits) return null;
  let top: ImuHighGEvent | null = null;
  for (const hit of hits) if (!top || hit.peakG > top.peakG) top = hit;
  return {
    count: hits.length,
    maxG: top?.peakG ?? null,
    maxAtMs: top?.timeMs ?? null,
  };
}
