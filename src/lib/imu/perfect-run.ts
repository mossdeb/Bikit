import {
  createLineAt,
  distanceAt,
  lineCrossings,
  timeAtDistance,
  type SnapshotGate,
  type SnapshotPass,
  type SnapshotSession,
} from "@/lib/imu/snapshot";
import {
  isLapTrack,
  LINE_HEADING_SPAN_M,
  type TimedRun,
  type TimedTrackDefinition,
} from "@/lib/imu/timed-track";

/**
 * Perfect Run (Ideia #011, by request, 2026-11-09): a timed track cut into
 * sectors by lines between its start and its finish, every run's time in
 * each sector, and the best of each added up — the run the rider has ridden
 * in pieces but never in one go.
 *
 * Built on the tracks and not beside them. A sector is two lines crossed in
 * order, found by the same crossing rule as the start, the finish and every
 * Snapshot gate (findSnapshotPasses), so nothing new has to agree about
 * where a rider was. As with the tracks nothing measured is stored: the
 * lines are kept on the track's definition (`splits`), the times are read
 * from the files every time.
 *
 * The sum is theoretical, and says so. Each line places a crossing to about
 * a tenth of a second (the Snapshots' measure, 2026-09-10), the Perfect Run
 * adds up crossings from different runs, and a sector's best may have been
 * ridden off a faster entry than the sector before it ever gave. So the
 * result carries its own uncertainty, and a sector whose GPS went wrong is
 * left out rather than allowed to make the sum artificially fast.
 *
 * One rider, one kind of vehicle (decided 2026-11-09): the pool is the
 * caller's, filtered by perfectRunPool. Pure: nothing here downloads,
 * stores or draws. Circuits (`laps`) are not split yet.
 */

/** Sectors a new split cuts a track into (decided 2026-11-09; the rider
 * may move the lines later). */
export const PERFECT_RUN_SECTORS = 6;

/** How far off one line's crossing may be, ms: the median measured against
 * the IMU's takeoff on R0050 → R0045 (2026-09-10, see snapshot.ts). */
export const GATE_ERROR_MS = 110;

/** A sector ridden over a distance this far from the others' median, as a
 * share of it, is not the same ground: the GPS cut a corner or jumped. */
const SECTOR_DISTANCE_TOLERANCE = 0.15;
/** A sector faster than this share of the others' median time is a GPS
 * fault before it is a ride. */
const SECTOR_MIN_SHARE_OF_MEDIAN = 0.75;
/** A sector with a hole in the fixes this long, ms, is guessed across, not
 * measured. Shorter than the crossing rule's own limit (5 s, which only
 * stops a line being crossed inside a hole): a sector is short enough that
 * two seconds guessed are a real share of it. */
const SECTOR_MAX_FIX_GAP_MS = 2000;
/** Where a split is tried when it cannot stand at its equal share of the
 * track, m along the run from there: on "Chibeira_wildpack" (2026-11-09)
 * lines drawn on one run were missed by half the others, and three of six
 * runs put a line where they crossed it twice — a bend tighter than the
 * line's heading span. */
const SPLIT_NUDGES_M = [
  0, 5, -5, 10, -10, 15, -15, 20, -20, 30, -30, 40, -40, 50, -50,
];

/** Below this between two fixes, m/s, the bike is standing. */
const STOP_MPS = 1;
/** A sector in which the bike stood this long in all, ms, holds a stop:
 * its time is the rider's wait, not the trail's. It may still be the best
 * (it never is), but it is no measure of the sector's usual time — on
 * "Mitica" (2026-11-09) three of five runs stopped in the last sector, and
 * their median made the two runs that did not look impossibly fast. */
const SECTOR_MAX_STOP_MS = 2000;

/** The ground covered between two instants of a track, m. */
function distanceBetween(
  prepared: SnapshotSession,
  fromMs: number,
  toMs: number,
): number {
  const track = prepared.track;
  if (!track) return 0;
  return distanceAt(track, toMs) - distanceAt(track, fromMs);
}

/** The longest stretch without a fix between two instants, ms. */
function longestFixGap(
  prepared: SnapshotSession,
  fromMs: number,
  toMs: number,
): number {
  const t = prepared.track?.tMs;
  if (!t || t.length === 0) return Infinity;
  let gap = 0;
  let prev = fromMs;
  for (const tk of t) {
    if (tk <= fromMs) continue;
    if (tk >= toMs) break;
    gap = Math.max(gap, tk - prev);
    prev = tk;
  }
  return Math.max(gap, toMs - prev);
}

/** How long the bike stood still between two instants, ms. */
function stoppedTime(
  prepared: SnapshotSession,
  fromMs: number,
  toMs: number,
): number {
  const track = prepared.track;
  if (!track) return 0;
  let stopped = 0;
  for (let k = 0; k + 1 < track.tMs.length; k++) {
    const t0 = Math.max(fromMs, track.tMs[k]);
    const t1 = Math.min(toMs, track.tMs[k + 1]);
    if (t1 <= t0) continue;
    const dt = track.tMs[k + 1] - track.tMs[k];
    const v = dt > 0 ? ((track.distM[k + 1] - track.distM[k]) * 1000) / dt : 0;
    if (v < STOP_MPS) stopped += t1 - t0;
  }
  return stopped;
}

/**
 * Where one run crossed each line, in order: the start, every split, the
 * finish — rounded to the millisecond as the track's own times are, so a
 * run's sectors add up to its time exactly. Null when it misses a split or
 * crosses them out of order (a run that cut across, or a gap in the fixes
 * at a line).
 */
export function sectorBoundaries(
  prepared: SnapshotSession,
  splits: SnapshotGate[],
  run: SnapshotPass,
): number[] | null {
  const out = [Math.round(run.entryMs)];
  let prev = run.entryMs;
  for (const gate of splits) {
    const crossing = lineCrossings(prepared, gate).find(
      (t) => t > prev && t < run.exitMs,
    );
    if (crossing === undefined) return null;
    out.push(Math.round(crossing));
    prev = crossing;
  }
  out.push(Math.round(run.exitMs));
  return out;
}

/** The one crossing of a line inside a run after `afterMs`, or null when
 * the run crosses it there not at all, or more than once. */
function singleCrossing(
  prepared: SnapshotSession,
  line: SnapshotGate,
  run: SnapshotPass,
  afterMs: number,
): number | null {
  const crossed = lineCrossings(prepared, line).filter(
    (t) => t > run.entryMs && t < run.exitMs,
  );
  return crossed.length === 1 && crossed[0] > afterMs ? crossed[0] : null;
}

/**
 * Splits for a track, drawn on one of its runs: `count − 1` lines at about
 * equal distances along it between the start and the finish, each facing
 * the trail as the start and the finish do.
 *
 * A line is first tried at its equal share of the run, then nudged along
 * it (SPLIT_NUDGES_M) — kept only where the run crosses it once, after the
 * line before it: a line on a hairpin, or reaching across the other leg of
 * a switchback, is crossed twice or by the wrong stretch. Given the track's
 * `others` runs, it goes where the most of them cross it too (the nearest
 * to the equal share among equals): on "Chibeira_wildpack" (2026-11-09)
 * lines drawn on one run alone were missed by half the others, who rode
 * another line through one bend.
 *
 * Null on a circuit, without GPS, or when no place near a share gives a
 * line the run crosses once.
 */
export function createSplits(
  prepared: SnapshotSession,
  definition: TimedTrackDefinition,
  run: SnapshotPass,
  count: number = PERFECT_RUN_SECTORS,
  others: { prepared: SnapshotSession; run: SnapshotPass }[] = [],
): SnapshotGate[] | null {
  const track = prepared.track;
  if (!track || isLapTrack(definition) || count < 2) return null;
  const fromM = distanceAt(track, run.entryMs);
  const toM = distanceAt(track, run.exitMs);
  if (!(toM > fromM)) return null;
  const splits: SnapshotGate[] = [];
  let prevMs = run.entryMs;
  // Each other run's last crossing, or null once it has missed a line —
  // it can no longer be read into these sectors, and stops voting.
  const othersPrev: (number | null)[] = others.map((o) => o.run.entryMs);
  for (let k = 1; k < count; k++) {
    const atM = fromM + ((toM - fromM) * k) / count;
    let best: {
      line: SnapshotGate;
      crossingMs: number;
      votes: (number | null)[];
      score: number;
    } | null = null;
    for (const offsetM of SPLIT_NUDGES_M) {
      const atMs = timeAtDistance(track, atM + offsetM);
      if (atMs <= prevMs || atMs >= run.exitMs) continue;
      const line = createLineAt(prepared, atMs, LINE_HEADING_SPAN_M);
      if (!line) continue;
      const own = singleCrossing(prepared, line, run, prevMs);
      if (own === null) continue;
      const votes = others.map((o, i) =>
        othersPrev[i] === null
          ? null
          : singleCrossing(o.prepared, line, o.run, othersPrev[i]!),
      );
      const score = votes.filter((v) => v !== null).length;
      if (!best || score > best.score)
        best = { line, crossingMs: own, votes, score };
      if (score === othersPrev.filter((p) => p !== null).length) break;
    }
    if (!best) return null;
    splits.push(best.line);
    prevMs = best.crossingMs;
    best.votes.forEach((v, i) => (othersPrev[i] = v));
  }
  return sectorBoundaries(prepared, splits, run) ? splits : null;
}

/** One run of a track read sector by sector — what the Perfect Run is made
 * of. `id` tells two runs of one session apart. */
export interface SectorRun {
  id: string;
  sessionId: string;
  riderName: string | null;
  motorbike: boolean;
  /** Start to finish, ms — the sum of `sectorsMs`. */
  durationMs: number;
  sectorsMs: number[];
  /** Ground covered in each sector, m. */
  distancesM: number[];
  /** The longest hole in the fixes inside each sector, ms. */
  fixGapsMs: number[];
  /** How long the bike stood still in each sector, ms. */
  stoppedMs: number[];
}

/** A run read into sectors, or null when it misses one of the track's
 * splits (or the track has none). */
export function readSectorRun(
  prepared: SnapshotSession,
  definition: TimedTrackDefinition,
  run: TimedRun,
  meta: {
    id: string;
    sessionId: string;
    riderName: string | null;
    motorbike: boolean;
  },
): SectorRun | null {
  const splits = definition.splits;
  if (!splits || splits.length === 0 || isLapTrack(definition)) return null;
  const bounds = sectorBoundaries(prepared, splits, run);
  if (!bounds) return null;
  const sectorsMs: number[] = [];
  const distancesM: number[] = [];
  const fixGapsMs: number[] = [];
  const stoppedMs: number[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    sectorsMs.push(bounds[i + 1] - bounds[i]);
    distancesM.push(distanceBetween(prepared, bounds[i], bounds[i + 1]));
    fixGapsMs.push(longestFixGap(prepared, bounds[i], bounds[i + 1]));
    stoppedMs.push(stoppedTime(prepared, bounds[i], bounds[i + 1]));
  }
  return {
    ...meta,
    durationMs: bounds[bounds.length - 1] - bounds[0],
    sectorsMs,
    distancesM,
    fixGapsMs,
    stoppedMs,
  };
}

function riderKey(name: string | null): string {
  return (name ?? "").trim().toLocaleLowerCase();
}

/** The runs one Perfect Run is made of: one rider's (the name as written,
 * ignoring case and spaces at the ends), on one kind of vehicle — a
 * motorbike's sector never stands in a bicycle's sum. */
export function perfectRunPool(
  runs: SectorRun[],
  riderName: string | null,
  motorbike: boolean,
): SectorRun[] {
  const key = riderKey(riderName);
  return runs.filter(
    (r) => riderKey(r.riderName) === key && r.motorbike === motorbike,
  );
}

export type SectorExclusionReason = "distance" | "gps_gap" | "too_fast";

export interface PerfectRunSector {
  /** The fastest valid time, ms, and the run it came from. */
  bestMs: number;
  bestRunId: string;
  /** The best actual run's time here, ms — null when its own reading of
   * this sector was left out. */
  bestActualMs: number | null;
  /** What the best actual run would gain here, ms: its time minus the
   * best. Null with bestActualMs. */
  potentialMs: number | null;
  /** The median time here of the runs that did not stop in it, ms (of
   * every run, when all of them did) — the sector's usual time. */
  medianMs: number;
}

export interface PerfectRun {
  sectors: PerfectRunSector[];
  /** The best sectors added up, ms. */
  perfectMs: number;
  /** The fastest run ridden start to finish. */
  bestActual: SectorRun;
  /** bestActual's time minus perfectMs, ms. */
  gainMs: number;
  /** How far gainMs may be off from the lines alone, ms: the sectors'
   * crossings and the best run's two, each about GATE_ERROR_MS, taken as
   * independent. */
  uncertaintyMs: number;
  /** Sectors left out, with why. */
  excluded: { runId: string; sector: number; reason: SectorExclusionReason }[];
  runCount: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The Perfect Run of a pool of runs (perfectRunPool's), or null with fewer
 * than two runs, runs split differently, or a sector no run rode validly.
 *
 * A run's sector is left out when it covered ground more than
 * SECTOR_DISTANCE_TOLERANCE away from the sector's median, when it holds a
 * hole in the fixes over SECTOR_MAX_FIX_GAP_MS, or when it is faster than
 * SECTOR_MIN_SHARE_OF_MEDIAN of the median time of the runs that rode it
 * without stopping. The run's other sectors,
 * and its time start to finish, still count.
 */
export function perfectRun(runs: SectorRun[]): PerfectRun | null {
  if (runs.length < 2) return null;
  const n = runs[0].sectorsMs.length;
  if (n < 2 || runs.some((r) => r.sectorsMs.length !== n)) return null;

  const bestActual = runs.reduce((a, b) =>
    b.durationMs < a.durationMs ? b : a,
  );
  const excluded: PerfectRun["excluded"] = [];
  const sectors: PerfectRunSector[] = [];
  for (let i = 0; i < n; i++) {
    const ridden = runs.filter((r) => r.stoppedMs[i] <= SECTOR_MAX_STOP_MS);
    const medianMs = median(
      (ridden.length > 0 ? ridden : runs).map((r) => r.sectorsMs[i]),
    );
    const medianM = median(runs.map((r) => r.distancesM[i]));
    const valid = new Set<string>();
    for (const r of runs) {
      let reason: SectorExclusionReason | null = null;
      if (
        medianM > 0 &&
        Math.abs(r.distancesM[i] - medianM) / medianM > SECTOR_DISTANCE_TOLERANCE
      )
        reason = "distance";
      else if (r.fixGapsMs[i] > SECTOR_MAX_FIX_GAP_MS) reason = "gps_gap";
      else if (r.sectorsMs[i] < SECTOR_MIN_SHARE_OF_MEDIAN * medianMs)
        reason = "too_fast";
      if (reason) excluded.push({ runId: r.id, sector: i, reason });
      else valid.add(r.id);
    }
    const best = runs
      .filter((r) => valid.has(r.id))
      .reduce<SectorRun | null>(
        (a, b) => (!a || b.sectorsMs[i] < a.sectorsMs[i] ? b : a),
        null,
      );
    if (!best) return null;
    const bestActualMs = valid.has(bestActual.id)
      ? bestActual.sectorsMs[i]
      : null;
    sectors.push({
      bestMs: best.sectorsMs[i],
      bestRunId: best.id,
      bestActualMs,
      potentialMs:
        bestActualMs === null ? null : bestActualMs - best.sectorsMs[i],
      medianMs,
    });
  }
  const perfectMs = sectors.reduce((sum, s) => sum + s.bestMs, 0);
  return {
    sectors,
    perfectMs,
    bestActual,
    gainMs: bestActual.durationMs - perfectMs,
    uncertaintyMs: Math.round(GATE_ERROR_MS * Math.sqrt(2 * n + 2)),
    excluded,
    runCount: runs.length,
  };
}
