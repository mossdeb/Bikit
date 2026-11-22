/**
 * The live SAG's "steady" rule (firmware V19.0.038, 2026-11-22): the logger
 * streams each end's compression at ~20 Hz, and a reading is worth saving
 * only once the rider has held still in the riding position for a while.
 *
 * Electrical noise is not what this waits out — at rest both sensors jitter
 * by about 0.05 mm (R0058, bench) — but the rider settling: breathing,
 * balance and weight shifts move the suspension by millimetres. So the
 * spreads below are a rider's, to be tuned on the bike.
 */

export interface LiveSagSample {
  /** When it arrived, ms (any monotonic clock, the same for `nowMs`). */
  atMs: number;
  forkMm: number | null;
  shockMm: number | null;
}

/** How long the rider must hold still, ms. */
export const LIVE_SAG_WINDOW_MS = 2000;
/** Fewer readings than this in the window is a link dropping updates: 20 Hz
 * would bring 40. */
export const LIVE_SAG_MIN_SAMPLES = 30;
/** No reading for this long and the stream counts as stalled, ms. */
export const LIVE_SAG_STALE_MS = 1000;
/** The most each end may move inside the window and still be steady, mm. */
export const LIVE_SAG_MAX_SPREAD_MM = { fork: 2, shock: 1 } as const;
/** What to keep of the stream, ms: the window and a margin. */
const KEEP_MS = LIVE_SAG_WINDOW_MS + 1000;

/** The samples worth keeping at `nowMs`, oldest first. */
export function keepRecent(
  samples: LiveSagSample[],
  nowMs: number,
): LiveSagSample[] {
  const from = samples.findIndex((s) => s.atMs >= nowMs - KEEP_MS);
  return from <= 0 ? (from === 0 ? samples : []) : samples.slice(from);
}

/** The stream has gone quiet. */
export function isStale(samples: LiveSagSample[], nowMs: number): boolean {
  const last = samples[samples.length - 1];
  return !last || nowMs - last.atMs > LIVE_SAG_STALE_MS;
}

/**
 * The reading to save, or null while not steady: the mean of each end over
 * the last LIVE_SAG_WINDOW_MS, rounded to a tenth.
 *
 * An end counts when the latest reading has it; a counted end must have a
 * value in every reading of the window and stay within its spread. An end
 * the logger sends as NA throughout (off, or not calibrated) is left out,
 * null, and does not hold the other back. At least one end must count.
 */
export function steadySag(
  samples: LiveSagSample[],
  nowMs: number,
): { forkMm: number | null; shockMm: number | null } | null {
  if (samples.length === 0 || isStale(samples, nowMs)) return null;
  // The stream must cover the whole window, not just have started in it.
  if (samples[0].atMs > nowMs - LIVE_SAG_WINDOW_MS) return null;
  const window = samples.filter((s) => s.atMs >= nowMs - LIVE_SAG_WINDOW_MS);
  if (window.length < LIVE_SAG_MIN_SAMPLES) return null;
  const last = window[window.length - 1];

  const end = (key: "forkMm" | "shockMm", spread: number) => {
    if (last[key] == null) return { counted: false, mean: null };
    const values = window.map((s) => s[key]);
    if (values.some((v) => v == null)) return null;
    const nums = values as number[];
    if (Math.max(...nums) - Math.min(...nums) > spread) return null;
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    return { counted: true, mean: Math.round(mean * 10) / 10 };
  };
  const fork = end("forkMm", LIVE_SAG_MAX_SPREAD_MM.fork);
  const shock = end("shockMm", LIVE_SAG_MAX_SPREAD_MM.shock);
  if (!fork || !shock || (!fork.counted && !shock.counted)) return null;
  return { forkMm: fork.mean, shockMm: shock.mean };
}
