/**
 * Derived metrics over a normalized IMU session.
 *
 * The raw channels are never modified: everything here computes a new array
 * or a scalar on read. Adding a metric in the future is adding a function
 * here (and a filter entry in the chart) — the stored file does not change.
 */

import type { ImuEvent, ImuSessionData } from "./format";

/**
 * The G-force series: the file's own when it recorded one, otherwise
 * √(ax² + ay² + az²) computed from the accelerometer.
 */
export function gForceOf(session: ImuSessionData): Float32Array {
  const { ax, ay, az, gForce } = session.channels;
  if (gForce) return gForce;
  const out = new Float32Array(ax.length);
  for (let i = 0; i < ax.length; i++) {
    out[i] = Math.sqrt(ax[i] * ax[i] + ay[i] * ay[i] + az[i] * az[i]);
  }
  return out;
}

export interface ImuSessionSummary {
  durationMs: number;
  sampleRateHz: number;
  sampleCount: number;
  maxG: number;
  eventCount: number;
  curveCount: number;
  jumpCount: number;
  impactCount: number;
  brakingCount: number;
  /** Total airtime across every jump, ms. */
  airtimeMs: number;
  /** Total time inside rough sections, ms. */
  roughMs: number;
}

/** The numbers the session list and the report header show — computed once
 * at import (stored on the row) and again on the analysis page. */
export function sessionSummary(session: ImuSessionData): ImuSessionSummary {
  const g = gForceOf(session);
  let maxG = 0;
  for (let i = 0; i < g.length; i++) if (g[i] > maxG) maxG = g[i];

  let curveCount = 0;
  let jumpCount = 0;
  let impactCount = 0;
  let brakingCount = 0;
  let airtimeMs = 0;
  let roughMs = 0;
  for (const event of session.events) {
    if (event.kind === "curve") curveCount++;
    else if (event.kind === "jump") {
      jumpCount++;
      airtimeMs += event.airtimeMs;
    } else if (event.kind === "impact") impactCount++;
    else if (event.kind === "braking") brakingCount++;
    else if (event.kind === "rough_section") roughMs += event.endMs - event.startMs;
  }

  return {
    durationMs: session.durationMs,
    sampleRateHz: session.sampleRateHz,
    sampleCount: session.sampleCount,
    maxG,
    eventCount: session.events.length,
    curveCount,
    jumpCount,
    impactCount,
    brakingCount,
    airtimeMs,
    roughMs,
  };
}

/**
 * Index of the sample nearest to a target time — the cursor's question.
 * Binary search over the (monotonic) timestamps; O(log n) per pointer move.
 */
export function nearestSampleIndex(tMs: Float64Array, targetMs: number): number {
  const n = tMs.length;
  if (n === 0) return -1;
  if (targetMs <= tMs[0]) return 0;
  if (targetMs >= tMs[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tMs[mid] <= targetMs) lo = mid;
    else hi = mid;
  }
  return targetMs - tMs[lo] <= tMs[hi] - targetMs ? lo : hi;
}

/** The events covering an instant: ranged events that span it, point events
 * (impact, jump) within a small window around it. */
export function eventsAt(events: ImuEvent[], timeMs: number, pointWindowMs = 150): ImuEvent[] {
  return events.filter((event) => {
    switch (event.kind) {
      case "curve":
      case "rough_section":
      case "braking":
        return timeMs >= event.startMs && timeMs <= event.endMs;
      case "jump":
        return timeMs >= event.takeoffMs && timeMs <= event.landingMs;
      case "impact":
        return Math.abs(event.timeMs - timeMs) <= pointWindowMs;
    }
  });
}

/** mm:ss.mmm for the details panel, mm:ss for axes. */
export function formatSessionTime(ms: number, withMillis = false): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const base = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (!withMillis) return base;
  const millis = Math.floor(clamped % 1000);
  return `${base}.${String(millis).padStart(3, "0")}`;
}
