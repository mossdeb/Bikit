/**
 * Trimming a session: keeping the stretch of a recording that IS the run.
 *
 * A logger is switched on at the car and off at the car, so a file holds
 * the walk to the top and the roll-out at the bottom around the descent
 * that matters — and every figure read from the whole file (mean speed,
 * distance, the counts, the comparisons between setups) reads the walk
 * too. The trim is two instants on the file's own timeline; the file in
 * Storage is never rewritten. Every reader crops on load (loadImuSession)
 * and re-zeroes time at the start, so the run opens at 00:00 and a
 * Snapshot's gates, saved in the trimmed timeline, keep meaning the same
 * place. Decided 2026-09-13.
 */

import { lowerBoundIndex } from "./downsample";
import type {
  GpsChannels,
  ImuChannels,
  ImuEvent,
  ImuSessionData,
} from "./format";

export interface ImuSessionTrim {
  /** Where the run starts, ms on the file's own timeline. */
  startMs: number;
  /** Where the run ends, ms on the file's own timeline. */
  endMs: number;
}

/** The shortest stretch a trim may keep, ms — anything less is not a run. */
export const TRIM_MIN_MS = 5_000;

/**
 * The stored pair as a trim, or null when the row has none or the pair is
 * not a window (the check constraint refuses those, but a reader should
 * not crash on a row written before it).
 */
export function trimOf(
  startMs: number | null | undefined,
  endMs: number | null | undefined,
): ImuSessionTrim | null {
  if (startMs == null || endMs == null) return null;
  if (!(startMs >= 0) || !(endMs > startMs)) return null;
  return { startMs, endMs };
}

/**
 * The session cropped to [startMs, endMs] with time re-zeroed at startMs:
 * samples, GPS fixes, recording gaps and events all move by −startMs, and
 * an event that straddles a cut is clipped to it (a curve you entered
 * before the trim starts is still a curve for the part you kept). An event
 * wholly outside is dropped, and an event kind whose whole meaning is one
 * instant (an impact, a flight) goes with its instant. The duration is the
 * window's length, which is what the recording now spans.
 *
 * Out of range is tolerated — the window is clamped to the recording — so
 * a trim saved on a longer file still reads on a re-parsed shorter one.
 * A window with nothing in it returns the session untouched: an empty
 * channel would break every reader downstream.
 */
export function trimSession(
  session: ImuSessionData,
  trim: ImuSessionTrim | null | undefined,
): ImuSessionData {
  if (!trim) return session;
  const t = session.channels.tMs;
  if (t.length === 0) return session;
  const start = Math.max(trim.startMs, t[0]);
  const end = Math.min(trim.endMs, session.durationMs);
  if (!(end > start)) return session;

  const from = lowerBoundIndex(t, start);
  // Half-open: a sample exactly at the end belongs to the next stretch.
  const to = lowerBoundIndex(t, end);
  if (to - from < 2) return session;

  return {
    ...session,
    durationMs: end - start,
    sampleCount: to - from,
    channels: cropChannels(session.channels, from, to, start),
    gps: session.gps ? cropGps(session.gps, start, end) : null,
    events: cropEvents(session.events, start, end),
    imuGaps: session.imuGaps
      ?.filter((gap) => gap.atMs >= start && gap.atMs < end)
      .map((gap) => ({ ...gap, atMs: gap.atMs - start })),
    // A shock goes with its instant, like an impact.
    highG: session.highG
      ?.filter((hit) => hit.timeMs >= start && hit.timeMs < end)
      .map((hit) => ({ ...hit, timeMs: hit.timeMs - start })),
  };
}

function cropChannels(
  c: ImuChannels,
  from: number,
  to: number,
  startMs: number,
): ImuChannels {
  const tMs = new Float64Array(to - from);
  for (let i = from; i < to; i++) tMs[i - from] = c.tMs[i] - startMs;
  return {
    tMs,
    ax: c.ax.slice(from, to),
    ay: c.ay.slice(from, to),
    az: c.az.slice(from, to),
    gx: c.gx.slice(from, to),
    gy: c.gy.slice(from, to),
    gz: c.gz.slice(from, to),
    gForce: c.gForce ? c.gForce.slice(from, to) : null,
  };
}

function cropGps(gps: GpsChannels, startMs: number, endMs: number) {
  const from = lowerBoundIndex(gps.tMs, startMs);
  const to = lowerBoundIndex(gps.tMs, endMs);
  const tMs = new Float64Array(Math.max(0, to - from));
  for (let i = from; i < to; i++) tMs[i - from] = gps.tMs[i] - startMs;
  // The cumulative distance restarts at the cut, so "distance" reads the
  // run's own metres and not the walk's. NaN stays NaN.
  const distanceM = gps.distanceM.slice(from, to);
  const d0 = distanceM.length > 0 ? distanceM[0] : NaN;
  if (Number.isFinite(d0))
    for (let i = 0; i < distanceM.length; i++) distanceM[i] -= d0;
  return {
    tMs,
    latDeg: gps.latDeg.slice(from, to),
    lonDeg: gps.lonDeg.slice(from, to),
    altitudeM: gps.altitudeM.slice(from, to),
    speedMps: gps.speedMps.slice(from, to),
    headingDeg: gps.headingDeg.slice(from, to),
    distanceM,
    hAccM: gps.hAccM.slice(from, to),
  };
}

function cropEvents(
  events: ImuEvent[],
  startMs: number,
  endMs: number,
): ImuEvent[] {
  const out: ImuEvent[] = [];
  for (const event of events) {
    switch (event.kind) {
      case "curve":
      case "braking":
      case "rough_section": {
        if (event.endMs <= startMs || event.startMs >= endMs) break;
        out.push({
          ...event,
          startMs: Math.max(event.startMs, startMs) - startMs,
          endMs: Math.min(event.endMs, endMs) - startMs,
        });
        break;
      }
      case "jump":
      case "drop": {
        // A flight is kept whole or not at all: half an airtime is not
        // a figure. It stays when its takeoff is inside the window.
        if (event.takeoffMs < startMs || event.takeoffMs >= endMs) break;
        out.push({
          ...event,
          takeoffMs: event.takeoffMs - startMs,
          landingMs: event.landingMs - startMs,
        });
        break;
      }
      case "impact": {
        if (event.timeMs < startMs || event.timeMs >= endMs) break;
        out.push({ ...event, timeMs: event.timeMs - startMs });
        break;
      }
      case "crash": {
        // Kept when it starts inside the window, the moment it came to
        // rest pulled in with it.
        if (event.startMs < startMs || event.startMs >= endMs) break;
        const end = Math.min(event.endMs, endMs);
        out.push({
          ...event,
          startMs: event.startMs - startMs,
          downMs: Math.min(event.downMs, end) - startMs,
          endMs: end - startMs,
        });
        break;
      }
    }
  }
  return out;
}

/** Below this the bike is standing or being walked, km/h. */
export const TRIM_MOVING_KMH = 3;
/** A pause shorter than this inside the run is part of the run, ms. */
export const TRIM_PAUSE_MS = 10_000;
/** A moving stretch shorter than this is a roll in the car park, ms. */
export const TRIM_STRETCH_MIN_MS = 20_000;

/**
 * A guess at the run: the longest stretch of GPS speed above walking pace,
 * where a stop shorter than TRIM_PAUSE_MS does not break the stretch (a
 * rider waits at a junction, then goes on; that is one run). Null when the
 * recording has no GPS to read, or never moves long enough to call a run.
 * The suggestion is rounded to the second outward so the run's first and
 * last metres are kept, and it is only a suggestion — the dialog shows it
 * and the rider decides.
 */
export function suggestTrim(session: ImuSessionData): ImuSessionTrim | null {
  const gps = session.gps;
  if (!gps || gps.tMs.length < 2) return null;
  const moving = TRIM_MOVING_KMH / 3.6;
  const stretches: { startMs: number; endMs: number }[] = [];
  let open: { startMs: number; endMs: number } | null = null;
  for (let i = 0; i < gps.tMs.length; i++) {
    const t = gps.tMs[i];
    const v = gps.speedMps[i];
    if (Number.isFinite(v) && v >= moving) {
      if (open && t - open.endMs <= TRIM_PAUSE_MS) open.endMs = t;
      else {
        if (open) stretches.push(open);
        open = { startMs: t, endMs: t };
      }
    }
  }
  if (open) stretches.push(open);

  let best: { startMs: number; endMs: number } | null = null;
  for (const s of stretches) {
    if (s.endMs - s.startMs < TRIM_STRETCH_MIN_MS) continue;
    if (!best || s.endMs - s.startMs > best.endMs - best.startMs) best = s;
  }
  if (!best) return null;
  const startMs = Math.max(0, Math.floor(best.startMs / 1000) * 1000);
  const endMs = Math.min(
    session.durationMs,
    Math.ceil(best.endMs / 1000) * 1000,
  );
  return endMs - startMs >= TRIM_MIN_MS ? { startMs, endMs } : null;
}

/**
 * "mm:ss" or "mm:ss.mmm" → ms, or null when the text is not a time. Also
 * takes "ss" and "h:mm:ss", because a rider types what they read off the
 * axis and the axis is not always the same shape.
 */
export function parseSessionTime(text: string): number | null {
  const m = text
    .trim()
    .match(/^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const [, a, b, s, frac] = m;
  let h = 0;
  let min = 0;
  if (a != null && b != null) {
    h = Number(a);
    min = Number(b);
  } else if (a != null) min = Number(a);
  const sec = Number(s);
  if (min >= 60 || sec >= 60) return null;
  const ms = frac ? Number(frac.padEnd(3, "0")) : 0;
  return ((h * 60 + min) * 60 + sec) * 1000 + ms;
}
