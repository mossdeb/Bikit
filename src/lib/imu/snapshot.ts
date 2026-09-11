import type { GpsChannels, ImuEvent, ImuSessionData } from "./format";
import {
  fusedSpeedKmhSeries,
  gForceOf,
  gpsGradient,
  MOMENTUM_MIN_ENTRY_KMH,
  windowPeak,
} from "./derive";
import { lowerBoundIndex, upperBoundIndex } from "./downsample";

/**
 * Snapshots — a stretch of trail kept as a reference, and every pass through
 * it found again in any recording (by request, 2026-09-10).
 *
 * A Snapshot is made from one event of one session — a corner, a jump, a
 * rough section, a brake — but it is not the event. The detector cuts the
 * same corner differently from run to run (13 of R0050's 79 corners were cut
 * differently on R0045), so "the corner the detector found near here" would
 * compare windows of different lengths, and a time between them would mean
 * nothing. The event is turned instead into two GATES: lines across the
 * trail SNAPSHOT_GATE_OFFSET_M before the event starts and after it ends,
 * each facing the direction of travel. A pass is crossing the entry gate and
 * then the exit gate, forwards — so the time between them is always the same
 * piece of ground, two laps in one session are two passes, and the same
 * trail ridden the other way is no pass at all.
 *
 * The gates sit outside the event on purpose (decided 2026-09-10): the time
 * then covers the brake, the corner and the exit, the way a rider thinks of
 * a corner, and a gate's own error is a small share of it.
 *
 * That error was measured on R0050 → R0045 (the same descent twice,
 * 2026-09-10). Gates found exactly one pass for all 79 corners, 18 jumps and
 * 10 rough sections, and none in five sessions elsewhere, with the half-width
 * anywhere from 8 to 20 m. Against the takeoff the IMU times to the
 * millisecond, a gate on a jump's lip was crossed within 110 ms (median;
 * 230 ms at p90) — about a metre. That is the 1 Hz receiver's position, not
 * the interpolation: placing the crossing by the fused speed instead of by
 * time read the same. So crossings are interpolated in time and need no bike
 * frame, and a difference under ~0.2 s between two passes is noise.
 *
 * Pure: nothing here downloads, stores or draws. A page loads each session,
 * prepares it once (prepareSnapshotSession), and asks for passes and their
 * figures.
 */

export type SnapshotKind = "curve" | "jump" | "rough_section" | "braking";

/** The kinds in words, for names and headings. */
export const SNAPSHOT_KIND_LABEL: Record<SnapshotKind, string> = {
  curve: "Curva",
  jump: "Salto",
  rough_section: "Zona acidentada",
  braking: "Travagem",
};

export function isSnapshotKind(value: unknown): value is SnapshotKind {
  return (
    value === "curve" ||
    value === "jump" ||
    value === "rough_section" ||
    value === "braking"
  );
}

/** How far outside the event each gate is placed, m, along the trail. */
export const SNAPSHOT_GATE_OFFSET_M = 20;
/** Half a gate's width, m. A crossing further than this from the gate's
 * centre is another line or another trail. Measured insensitive from 8 to
 * 20 m (2026-09-10); 12 is wider than the receiver's wander and narrower
 * than the two legs of a switchback. */
export const SNAPSHOT_GATE_HALF_WIDTH_M = 12;
/** Below this, km/h, the bike is stopped, and a pass that falls to it says
 * so — the report's walking threshold. */
export const SNAPSHOT_STOPPED_KMH = 3;

/** Two fixes closer than this are one fix stamped twice (see
 * fusedSpeedKmhSeries); the second is dropped. */
const MIN_FIX_GAP_MS = 200;
/** A hole in the track longer than this is not bridged: a straight line
 * across five seconds without a fix could cross a gate the bike never went
 * near. A pass whose gate falls in such a hole is lost, not guessed. */
const MAX_FIX_GAP_MS = 5000;
/** The direction at a gate is read between the positions this far before
 * and after it, ms; the longer spans are tried when the bike barely moved. */
const HEADING_SPANS_MS = [1000, 2500, 5000];
const MIN_HEADING_BASE_M = 1;
/** A segment crossing a gate must head within ~72° of the gate's own
 * direction (cos 0.3) — a line crossed sideways is a trail that meets this
 * one, not a pass along it. */
const MIN_ALIGNMENT = 0.3;
/** A segment shorter than this, m, is a stopped bike's jitter, not travel. */
const MIN_SEGMENT_M = 0.5;
/** A pass may take this multiple of the reference's time, or the reference
 * plus the slack, whichever is longer: room for a stop — R0045 stood still
 * for up to 12 s inside three of R0050's corners — without pairing an entry
 * with an exit from another lap. */
const PASS_MAX_FACTOR = 4;
const PASS_MAX_SLACK_MS = 60_000;
/** Deceleration is read over this window, ms: short enough for a brake,
 * long enough that a kink at a fix is not a spike. */
const DECEL_WINDOW_MS = 500;
/** The trail's gradient is read over the pass padded by this each side —
 * the same padding curveMomentum uses. */
const GRADIENT_PAD_MS = 10_000;

const EARTH_R = 6_371_000;
const RAD = Math.PI / 180;

export interface SnapshotGate {
  latDeg: number;
  lonDeg: number;
  /** Direction of travel through the gate, degrees true: 0 north, 90 east. */
  headingDeg: number;
  halfWidthM: number;
}

/** What is kept of a Snapshot — enough to find its passes in any session. */
export interface SnapshotDefinition {
  kind: SnapshotKind;
  entry: SnapshotGate;
  exit: SnapshotGate;
  /** The reference pass's time between the gates, ms. How long another
   * pass may take is measured against it. */
  referenceDurationMs: number;
}

export interface SnapshotPass {
  /** When the entry gate was crossed, and then the exit gate, ms from the
   * session's start. */
  entryMs: number;
  exitMs: number;
}

/** The fixes as a path: de-duplicated, with the ground covered. */
export interface SnapshotTrack {
  tMs: number[];
  latDeg: number[];
  lonDeg: number[];
  /** Ground covered along the fixes, m, cumulative from the first. */
  distM: number[];
}

/** A session made ready for Snapshots once, however many it is read for. */
export interface SnapshotSession {
  session: ImuSessionData;
  track: SnapshotTrack | null;
  /** The speed every figure is read from, km/h, on the IMU timeline. Null
   * without a track. */
  speedKmh: Float32Array | null;
  /** How the speed was read: "fused" when the bike's forward is known (the
   * accelerometer draws the shape between fixes), "gps" when it is the
   * receiver's straight line. Two passes are only compared when read the
   * same way — the straight line reads a corner's minimum up to 10 km/h
   * higher (R0050, 2026-09-10). */
  speedSource: "fused" | "gps" | null;
  gForce: Float32Array;
}

export interface SnapshotPassMetrics {
  /** Time between the gates, ms. */
  durationMs: number;
  speedSource: "fused" | "gps" | null;
  /** Speed at the entry gate and at the exit gate, km/h. */
  entryKmh: number | null;
  exitKmh: number | null;
  /** The least and the most between the gates, km/h, and when the least. */
  minKmh: number | null;
  minMs: number | null;
  maxKmh: number | null;
  /** The bike fell below SNAPSHOT_STOPPED_KMH between the gates: the time
   * is a stop's, not a line's. */
  stopped: boolean;
  /** exit / entry, gravity and all. Null below MOMENTUM_MIN_ENTRY_KMH. */
  retention: number | null;
  /** 1 − least / entry. Null below MOMENTUM_MIN_ENTRY_KMH. */
  apexLoss: number | null;
  /** Height lost between the gates, m, positive downhill, from the trail's
   * gradient around them. Null without a usable track. */
  dropM: number | null;
  /** exit / the exit the drop alone would have given, √(entry² + 2·g·drop)
   * — as curveMomentum reads it. Downhill only. */
  retentionCorrected: number | null;
  /** The hardest slowing between the gates, m/s², over DECEL_WINDOW_MS. */
  maxDecelMps2: number | null;
  /** Impacts the session's events place between the gates. */
  impacts: number;
  /** Time in the air between the gates, ms — the jumps and drops the
   * session's events place there, added up. */
  airtimeMs: number;
  /** The highest G force between the gates. */
  peakG: number | null;
}

/** East and north, m, from the first point to the second. */
function metresBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): [number, number] {
  const cosLat = Math.cos(((lat1 + lat2) / 2) * RAD);
  return [
    (lon2 - lon1) * RAD * EARTH_R * cosLat,
    (lat2 - lat1) * RAD * EARTH_R,
  ];
}

function trackOf(gps: GpsChannels): SnapshotTrack | null {
  const tMs: number[] = [];
  const latDeg: number[] = [];
  const lonDeg: number[] = [];
  const distM: number[] = [];
  for (let k = 0; k < gps.tMs.length; k++) {
    const t = gps.tMs[k];
    const n = tMs.length;
    if (n > 0 && t - tMs[n - 1] < MIN_FIX_GAP_MS) continue;
    const lat = gps.latDeg[k];
    const lon = gps.lonDeg[k];
    const [dx, dy] =
      n > 0 ? metresBetween(latDeg[n - 1], lonDeg[n - 1], lat, lon) : [0, 0];
    tMs.push(t);
    latDeg.push(lat);
    lonDeg.push(lon);
    distM.push(n > 0 ? distM[n - 1] + Math.hypot(dx, dy) : 0);
  }
  return tMs.length >= 2 ? { tMs, latDeg, lonDeg, distM } : null;
}

/** The segment holding a time: k with tMs[k] ≤ t < tMs[k + 1], clamped to
 * the track's first and last segments. */
function segmentAt(track: SnapshotTrack, timeMs: number): number {
  const t = track.tMs;
  let lo = 0;
  let hi = t.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t[mid] <= timeMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function fractionAt(track: SnapshotTrack, k: number, timeMs: number): number {
  const t0 = track.tMs[k];
  const t1 = track.tMs[k + 1];
  return Math.min(1, Math.max(0, (timeMs - t0) / (t1 - t0)));
}

function positionAt(
  track: SnapshotTrack,
  timeMs: number,
): { latDeg: number; lonDeg: number } {
  const k = segmentAt(track, timeMs);
  const f = fractionAt(track, k, timeMs);
  return {
    latDeg: track.latDeg[k] + f * (track.latDeg[k + 1] - track.latDeg[k]),
    lonDeg: track.lonDeg[k] + f * (track.lonDeg[k + 1] - track.lonDeg[k]),
  };
}

function distanceAt(track: SnapshotTrack, timeMs: number): number {
  const k = segmentAt(track, timeMs);
  const f = fractionAt(track, k, timeMs);
  return track.distM[k] + f * (track.distM[k + 1] - track.distM[k]);
}

/** When the track had covered a distance — the first time, if it stood
 * still there. Clamped to the track's ends. */
function timeAtDistance(track: SnapshotTrack, distM: number): number {
  const d = track.distM;
  const t = track.tMs;
  if (distM <= d[0]) return t[0];
  if (distM >= d[d.length - 1]) return t[t.length - 1];
  let lo = 1;
  let hi = d.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (d[mid] < distM) lo = mid + 1;
    else hi = mid;
  }
  const span = d[lo] - d[lo - 1];
  const f = span > 0 ? (distM - d[lo - 1]) / span : 0;
  return t[lo - 1] + f * (t[lo] - t[lo - 1]);
}

function headingAt(track: SnapshotTrack, timeMs: number): number | null {
  for (const span of HEADING_SPANS_MS) {
    const a = positionAt(track, timeMs - span);
    const b = positionAt(track, timeMs + span);
    const [dx, dy] = metresBetween(a.latDeg, a.lonDeg, b.latDeg, b.lonDeg);
    if (Math.hypot(dx, dy) >= MIN_HEADING_BASE_M)
      return (Math.atan2(dx, dy) / RAD + 360) % 360;
  }
  return null;
}

function gateAt(track: SnapshotTrack, timeMs: number): SnapshotGate | null {
  const headingDeg = headingAt(track, timeMs);
  if (headingDeg == null) return null;
  return {
    ...positionAt(track, timeMs),
    headingDeg,
    halfWidthM: SNAPSHOT_GATE_HALF_WIDTH_M,
  };
}

/** The kind of Snapshot an event makes, or null for one that cannot: an
 * impact is an instant, not a stretch of trail, and each run hits different
 * stones — of R0050's ten impacts only five had one within 1.5 s on R0045.
 * A drop is airborne like a jump, and is compared as one. */
export function snapshotKindOf(event: ImuEvent): SnapshotKind | null {
  switch (event.kind) {
    case "curve":
      return "curve";
    case "jump":
    case "drop":
      return "jump";
    case "rough_section":
      return "rough_section";
    case "braking":
      return "braking";
    case "impact":
      return null;
  }
}

function eventSpan(event: ImuEvent): [number, number] | null {
  switch (event.kind) {
    case "curve":
    case "rough_section":
    case "braking":
      return [event.startMs, event.endMs];
    case "jump":
    case "drop":
      return [event.takeoffMs, event.landingMs];
    case "impact":
      return null;
  }
}

/** Reads a session once for any number of Snapshots: its track, the speed
 * the figures come from — fused only when the bike's forward is known, as
 * the report and the analysis read it — and its G force. */
export function prepareSnapshotSession(
  session: ImuSessionData,
): SnapshotSession {
  const gps = session.gps;
  const track = gps ? trackOf(gps) : null;
  const fused = session.mounting?.applied === true;
  const { tMs, ax } = session.channels;
  const speedKmh =
    gps && track ? fusedSpeedKmhSeries(tMs, fused ? ax : null, gps) : null;
  return {
    session,
    track,
    speedKmh,
    speedSource: speedKmh ? (fused ? "fused" : "gps") : null,
    gForce: gForceOf(session),
  };
}

/** The times a track crosses a gate forwards, ms. */
function crossings(track: SnapshotTrack, gate: SnapshotGate): number[] {
  const hx = Math.sin(gate.headingDeg * RAD);
  const hy = Math.cos(gate.headingDeg * RAD);
  const cosLat = Math.cos(gate.latDeg * RAD);
  const x = (k: number) =>
    (track.lonDeg[k] - gate.lonDeg) * RAD * EARTH_R * cosLat;
  const y = (k: number) => (track.latDeg[k] - gate.latDeg) * RAD * EARTH_R;
  const out: number[] = [];
  for (let k = 0; k + 1 < track.tMs.length; k++) {
    const t0 = track.tMs[k];
    const t1 = track.tMs[k + 1];
    if (t1 - t0 > MAX_FIX_GAP_MS) continue;
    const ax = x(k);
    const ay = y(k);
    const bx = x(k + 1);
    const by = y(k + 1);
    // Signed distance along the gate's direction: behind it, then at or
    // past it — which is also what rejects the trail ridden the other way.
    const sA = ax * hx + ay * hy;
    const sB = bx * hx + by * hy;
    if (!(sA < 0 && sB >= 0)) continue;
    const segM = Math.hypot(bx - ax, by - ay);
    if (segM < MIN_SEGMENT_M) continue;
    if (((bx - ax) * hx + (by - ay) * hy) / segM < MIN_ALIGNMENT) continue;
    const f = -sA / (sB - sA);
    const cx = ax + f * (bx - ax);
    const cy = ay + f * (by - ay);
    if (Math.abs(cy * hx - cx * hy) > gate.halfWidthM) continue;
    out.push(t0 + f * (t1 - t0));
  }
  return out;
}

/**
 * Every pass a session makes through a Snapshot: each crossing of the exit
 * gate, paired with the latest crossing of the entry gate before it and
 * after the previous pass ended — a rider who crossed the entry, turned back
 * and came again started the pass the second time. A pair further apart
 * than the reference allows (PASS_MAX_FACTOR, PASS_MAX_SLACK_MS) is not a
 * pass. Empty without a track.
 */
export function findSnapshotPasses(
  prepared: SnapshotSession,
  definition: SnapshotDefinition,
): SnapshotPass[] {
  const track = prepared.track;
  if (!track) return [];
  const entries = crossings(track, definition.entry);
  const exits = crossings(track, definition.exit);
  const maxMs = Math.max(
    PASS_MAX_FACTOR * definition.referenceDurationMs,
    definition.referenceDurationMs + PASS_MAX_SLACK_MS,
  );
  const passes: SnapshotPass[] = [];
  let lastExit = -Infinity;
  for (const exitMs of exits) {
    let entryMs = -Infinity;
    for (const t of entries)
      if (t > lastExit && t < exitMs && exitMs - t <= maxMs && t > entryMs)
        entryMs = t;
    if (entryMs === -Infinity) continue;
    passes.push({ entryMs, exitMs });
    lastExit = exitMs;
  }
  return passes;
}

/**
 * A Snapshot made from one event of a prepared session: the gates
 * SNAPSHOT_GATE_OFFSET_M along the trail before the event starts and after
 * it ends, and the pass it was made from — found by the same rule as any
 * other pass, so the reference and the rest are measured alike. Null for an
 * event that makes none (see snapshotKindOf), without a track, or where the
 * bike never moved enough to give a gate a direction.
 */
export function createSnapshot(
  prepared: SnapshotSession,
  event: ImuEvent,
): { definition: SnapshotDefinition; reference: SnapshotPass } | null {
  const kind = snapshotKindOf(event);
  const span = eventSpan(event);
  const track = prepared.track;
  if (!kind || !span || !track) return null;
  const total = track.distM[track.distM.length - 1];
  // A metre inside the track's ends at most: a crossing needs ground on
  // both sides of the gate, and a gate on the very first fix has none.
  const clampDist = (d: number) => Math.min(total - 1, Math.max(1, d));
  const entryDist = clampDist(
    distanceAt(track, span[0]) - SNAPSHOT_GATE_OFFSET_M,
  );
  const exitDist = clampDist(
    distanceAt(track, span[1]) + SNAPSHOT_GATE_OFFSET_M,
  );
  if (exitDist <= entryDist) return null;
  const entryMs = timeAtDistance(track, entryDist);
  const exitMs = timeAtDistance(track, exitDist);
  const entry = gateAt(track, entryMs);
  const exit = gateAt(track, exitMs);
  if (!entry || !exit) return null;
  const draft: SnapshotDefinition = {
    kind,
    entry,
    exit,
    referenceDurationMs: exitMs - entryMs,
  };
  let reference: SnapshotPass | null = null;
  let bestError = Infinity;
  for (const pass of findSnapshotPasses(prepared, draft)) {
    const error =
      Math.abs(pass.entryMs - entryMs) + Math.abs(pass.exitMs - exitMs);
    if (error < bestError) {
      bestError = error;
      reference = pass;
    }
  }
  if (!reference) return null;
  return {
    definition: {
      ...draft,
      referenceDurationMs: reference.exitMs - reference.entryMs,
    },
    reference,
  };
}

/** The ground a pass covered, as [lat, lon] points: the gate crossings
 * themselves (interpolated) with the fixes between them. For drawing the
 * stretch on a map; empty without a track. */
export function snapshotPassPath(
  prepared: SnapshotSession,
  pass: SnapshotPass,
): [number, number][] {
  const track = prepared.track;
  if (!track) return [];
  const at = (ms: number): [number, number] => {
    const p = positionAt(track, ms);
    return [p.latDeg, p.lonDeg];
  };
  const out: [number, number][] = [at(pass.entryMs)];
  for (let k = 0; k < track.tMs.length; k++) {
    const t = track.tMs[k];
    if (t > pass.entryMs && t < pass.exitMs)
      out.push([track.latDeg[k], track.lonDeg[k]]);
  }
  out.push(at(pass.exitMs));
  return out;
}

function valueAt(
  tMs: Float64Array,
  values: ArrayLike<number>,
  timeMs: number,
): number {
  const n = tMs.length;
  const i = lowerBoundIndex(tMs, timeMs);
  if (i <= 0) return values[0];
  if (i >= n) return values[n - 1];
  const span = tMs[i] - tMs[i - 1];
  const f = span > 0 ? (timeMs - tMs[i - 1]) / span : 0;
  return values[i - 1] + f * (values[i] - values[i - 1]);
}

/** A pass's figures, all of them read between its gates. */
export function snapshotPassMetrics(
  prepared: SnapshotSession,
  pass: SnapshotPass,
): SnapshotPassMetrics {
  const { session, speedKmh, speedSource, gForce } = prepared;
  const tMs = session.channels.tMs;
  const { entryMs, exitMs } = pass;
  let impacts = 0;
  let airtimeMs = 0;
  for (const e of session.events) {
    if (e.kind === "impact" && e.timeMs >= entryMs && e.timeMs <= exitMs)
      impacts++;
    if (
      (e.kind === "jump" || e.kind === "drop") &&
      e.takeoffMs >= entryMs &&
      e.takeoffMs <= exitMs
    )
      airtimeMs += e.airtimeMs;
  }
  const metrics: SnapshotPassMetrics = {
    durationMs: exitMs - entryMs,
    speedSource,
    entryKmh: null,
    exitKmh: null,
    minKmh: null,
    minMs: null,
    maxKmh: null,
    stopped: false,
    retention: null,
    apexLoss: null,
    dropM: null,
    retentionCorrected: null,
    maxDecelMps2: null,
    impacts,
    airtimeMs,
    peakG: windowPeak(tMs, gForce, entryMs, exitMs),
  };
  if (!speedKmh || tMs.length === 0) return metrics;

  const entryKmh = valueAt(tMs, speedKmh, entryMs);
  const exitKmh = valueAt(tMs, speedKmh, exitMs);
  const i0 = lowerBoundIndex(tMs, entryMs);
  const i1 = Math.min(tMs.length - 1, upperBoundIndex(tMs, exitMs));
  let minKmh = Math.min(entryKmh, exitKmh);
  let minMs = entryKmh <= exitKmh ? entryMs : exitMs;
  let maxKmh = Math.max(entryKmh, exitKmh);
  let distanceM = 0;
  for (let i = i0; i <= i1; i++) {
    const v = speedKmh[i];
    if (v < minKmh) {
      minKmh = v;
      minMs = tMs[i];
    }
    if (v > maxKmh) maxKmh = v;
    if (i > i0)
      distanceM +=
        (((speedKmh[i] + speedKmh[i - 1]) / 2 / 3.6) * (tMs[i] - tMs[i - 1])) /
        1000;
  }

  let maxDecel = 0;
  let decelRead = false;
  let j = i0;
  for (let i = i0; i <= i1; i++) {
    const target = tMs[i] + DECEL_WINDOW_MS;
    if (target > exitMs) break;
    while (j < tMs.length && tMs[j] < target) j++;
    if (j >= tMs.length) break;
    const dt = (tMs[j] - tMs[i]) / 1000;
    if (dt <= 0) continue;
    maxDecel = Math.max(maxDecel, (speedKmh[i] - speedKmh[j]) / 3.6 / dt);
    decelRead = true;
  }

  const ratios = entryKmh >= MOMENTUM_MIN_ENTRY_KMH;
  const gradient = session.gps
    ? gpsGradient(
        session.gps,
        entryMs - GRADIENT_PAD_MS,
        exitMs + GRADIENT_PAD_MS,
      )
    : null;
  const dropM = gradient != null ? -gradient * distanceM : null;
  let retentionCorrected: number | null = null;
  if (ratios && dropM != null && dropM > 0) {
    const entryMps = entryKmh / 3.6;
    retentionCorrected =
      exitKmh / 3.6 / Math.sqrt(entryMps * entryMps + 2 * 9.81 * dropM);
  }

  return {
    ...metrics,
    entryKmh,
    exitKmh,
    minKmh,
    minMs,
    maxKmh,
    stopped: minKmh < SNAPSHOT_STOPPED_KMH,
    retention: ratios ? exitKmh / entryKmh : null,
    apexLoss: ratios ? 1 - minKmh / entryKmh : null,
    dropM,
    retentionCorrected,
    maxDecelMps2: decelRead ? maxDecel : null,
  };
}

// ---- The track index ------------------------------------------------------
//
// Where a session went, small enough to keep on its row (imu_sessions
// .track_index, migration 00045): the fixes thinned to the points that shape
// the line, plus the box around them. It answers one question without the
// file — does this track come near these gates? — so a Snapshot fetches only
// the sessions that might pass, not every recording in the account. It is
// never read for a figure; passes and their metrics come from the file.

/** How far a fix may sit from the straight line between two kept points
 * before the line needs another, m — under the receiver's own wander, so
 * the outline is the track as recorded minus the points that add nothing. */
const OUTLINE_TOLERANCE_M = 4;
/** A cap on the outline's points: the tolerance doubles until the line
 * fits, so a three-hour ride still keeps a few KB on its row. */
export const OUTLINE_MAX_POINTS = 600;
/** How near a gate the outline must come, beyond the gate's half-width:
 * the outline's tolerance plus the receiver's wander between two passes
 * (2.8 m at most where it was measured, 2026-09-10). */
const OUTLINE_NEAR_MARGIN_M = 10;

export interface SnapshotTrackIndex {
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  /** [lat, lon] pairs, in the order ridden. */
  outline: [number, number][];
}

/** Douglas–Peucker over points already in metres: the indices kept, in
 * order. Iterative — a 10 Hz track runs to tens of thousands of points. */
function simplify(
  xs: Float64Array,
  ys: Float64Array,
  toleranceM: number,
): number[] {
  const n = xs.length;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let worstD = toleranceM;
    for (let i = a + 1; i < b; i++) {
      // Distance to the chord, or to the point when the chord is a point.
      const d =
        len > 0
          ? Math.abs((xs[i] - xs[a]) * dy - (ys[i] - ys[a]) * dx) / len
          : Math.hypot(xs[i] - xs[a], ys[i] - ys[a]);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([a, worst], [worst, b]);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

/** The index of a recording's track. Null without one, or with fewer than
 * two fixes — a point is not somewhere a bike went through. */
export function buildTrackIndex(
  gps: GpsChannels | null,
): SnapshotTrackIndex | null {
  if (!gps || gps.tMs.length < 2) return null;
  const n = gps.tMs.length;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (let k = 0; k < n; k++) {
    minLat = Math.min(minLat, gps.latDeg[k]);
    maxLat = Math.max(maxLat, gps.latDeg[k]);
    minLon = Math.min(minLon, gps.lonDeg[k]);
    maxLon = Math.max(maxLon, gps.lonDeg[k]);
  }
  const lat0 = (minLat + maxLat) / 2;
  const cosLat = Math.cos(lat0 * RAD);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    xs[k] = (gps.lonDeg[k] - minLon) * RAD * EARTH_R * cosLat;
    ys[k] = (gps.latDeg[k] - minLat) * RAD * EARTH_R;
  }
  let tolerance = OUTLINE_TOLERANCE_M;
  let kept = simplify(xs, ys, tolerance);
  while (kept.length > OUTLINE_MAX_POINTS) {
    tolerance *= 2;
    kept = simplify(xs, ys, tolerance);
  }
  return {
    bounds: { minLat, maxLat, minLon, maxLon },
    outline: kept.map((k) => [gps.latDeg[k], gps.lonDeg[k]]),
  };
}

function isGate(value: unknown): value is SnapshotGate {
  if (!value || typeof value !== "object") return false;
  const g = value as Record<string, unknown>;
  const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  return (
    finite(g.latDeg) &&
    finite(g.lonDeg) &&
    finite(g.headingDeg) &&
    finite(g.halfWidthM) &&
    (g.halfWidthM as number) > 0
  );
}

/** Whether a definition has the shape one was written with — checked on
 * the way into the database and on the way out, since the row is JSON. */
export function isSnapshotDefinition(
  value: unknown,
): value is SnapshotDefinition {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    isSnapshotKind(d.kind) &&
    isGate(d.entry) &&
    isGate(d.exit) &&
    typeof d.referenceDurationMs === "number" &&
    Number.isFinite(d.referenceDurationMs) &&
    d.referenceDurationMs > 0
  );
}

/** Whether an index came back from the database in one piece: the row is
 * JSON, and a row written by an older build, or by hand, is not trusted to
 * have the shape. */
export function isTrackIndex(value: unknown): value is SnapshotTrackIndex {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const b = v.bounds as Record<string, unknown> | undefined;
  const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  if (
    !b ||
    typeof b !== "object" ||
    !finite(b.minLat) ||
    !finite(b.maxLat) ||
    !finite(b.minLon) ||
    !finite(b.maxLon)
  )
    return false;
  const o = v.outline;
  if (!Array.isArray(o) || o.length < 2 || o.length > OUTLINE_MAX_POINTS)
    return false;
  return o.every(
    (p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]),
  );
}

/** Whether the outline comes within reach of a gate — its half-width plus
 * OUTLINE_NEAR_MARGIN_M of the gate's centre. The box is tried first, so a
 * ride in another valley costs four comparisons. */
export function trackIndexNearGate(
  index: SnapshotTrackIndex,
  gate: SnapshotGate,
): boolean {
  const reachM = gate.halfWidthM + OUTLINE_NEAR_MARGIN_M;
  const cosLat = Math.cos(gate.latDeg * RAD);
  const dLat = reachM / (EARTH_R * RAD);
  const dLon = reachM / (EARTH_R * RAD * cosLat);
  const { bounds: b } = index;
  if (
    gate.latDeg < b.minLat - dLat ||
    gate.latDeg > b.maxLat + dLat ||
    gate.lonDeg < b.minLon - dLon ||
    gate.lonDeg > b.maxLon + dLon
  )
    return false;
  const o = index.outline;
  const x = (p: [number, number]) =>
    (p[1] - gate.lonDeg) * RAD * EARTH_R * cosLat;
  const y = (p: [number, number]) => (p[0] - gate.latDeg) * RAD * EARTH_R;
  for (let k = 0; k + 1 < o.length; k++) {
    const ax = x(o[k]);
    const ay = y(o[k]);
    const bx = x(o[k + 1]);
    const by = y(o[k + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // Nearest point of the segment to the origin, which is the gate.
    const t =
      len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
    if (Math.hypot(ax + t * dx, ay + t * dy) <= reachM) return true;
  }
  return false;
}

/** Whether a session might pass a Snapshot — near both gates — and so is
 * worth fetching and reading. Near is not through: the file decides. */
export function trackIndexMayPass(
  index: SnapshotTrackIndex,
  definition: SnapshotDefinition,
): boolean {
  return (
    trackIndexNearGate(index, definition.entry) &&
    trackIndexNearGate(index, definition.exit)
  );
}

/** Two gates are the same gate when their centres are within this, m —
 * the gate's own half-width: closer than that and a pass through one is a
 * pass through the other. */
export const SNAPSHOT_TWIN_GATE_M = SNAPSHOT_GATE_HALF_WIDTH_M;
/** …and their directions of travel agree to within this, degrees: the same
 * corner ridden the other way is another Snapshot. */
export const SNAPSHOT_TWIN_HEADING_DEG = 45;

function sameGate(a: SnapshotGate, b: SnapshotGate): boolean {
  const [dx, dy] = metresBetween(a.latDeg, a.lonDeg, b.latDeg, b.lonDeg);
  if (Math.hypot(dx, dy) > SNAPSHOT_TWIN_GATE_M) return false;
  const turn = Math.abs(((a.headingDeg - b.headingDeg + 540) % 360) - 180);
  return turn <= SNAPSHOT_TWIN_HEADING_DEG;
}

/**
 * The Snapshots already standing where a new one would: the same kind,
 * both gates within SNAPSHOT_TWIN_GATE_M and SNAPSHOT_TWIN_HEADING_DEG of
 * the new ones. Nothing forbids the twin — two Snapshots of one corner with
 * different references are a legitimate thing to want — but the dialog
 * asks before making it (by request, 2026-09-11: pressing "Snapshot" twice
 * on a corner made two of it, and the report listed both). Order kept.
 */
export function findSnapshotTwins<T extends { definition: SnapshotDefinition }>(
  definition: SnapshotDefinition,
  existing: readonly T[],
): T[] {
  return existing.filter(
    (s) =>
      s.definition.kind === definition.kind &&
      sameGate(s.definition.entry, definition.entry) &&
      sameGate(s.definition.exit, definition.exit),
  );
}

/** How far a point of one outline may sit from the other outline's line
 * and still be "on the same trail", m: the outline's own tolerance twice
 * over, plus the receiver's wander, plus a line ridden a bike's width to
 * one side. */
export const TRACK_COVER_M = 20;

/**
 * How much of one track the other covers: the fraction of `track`'s
 * outline points within TRACK_COVER_M of `by`'s outline. 1 when `track`
 * was ridden entirely along `by` (a lap of a ride that went on further),
 * 0 in another valley — the box is tried first, so that costs nothing.
 * Used to find, among a bike's earlier sessions, one on the same trail
 * for the report to compare setups against.
 */
export function trackIndexCoverage(
  track: SnapshotTrackIndex,
  by: SnapshotTrackIndex,
): number {
  const a = track.outline;
  const b = by.outline;
  if (a.length === 0 || b.length < 2) return 0;
  const lat0 = (track.bounds.minLat + track.bounds.maxLat) / 2;
  const cosLat = Math.cos(lat0 * RAD);
  const dLat = TRACK_COVER_M / (EARTH_R * RAD);
  const dLon = TRACK_COVER_M / (EARTH_R * RAD * cosLat);
  const bb = by.bounds;
  if (
    track.bounds.maxLat < bb.minLat - dLat ||
    track.bounds.minLat > bb.maxLat + dLat ||
    track.bounds.maxLon < bb.minLon - dLon ||
    track.bounds.minLon > bb.maxLon + dLon
  )
    return 0;
  // Both outlines in metres on one plane, `by` as segments.
  const x = (p: [number, number]) => p[1] * RAD * EARTH_R * cosLat;
  const y = (p: [number, number]) => p[0] * RAD * EARTH_R;
  const bx = b.map(x);
  const byy = b.map(y);
  let covered = 0;
  for (const p of a) {
    const px = x(p);
    const py = y(p);
    let near = false;
    for (let k = 0; k + 1 < b.length && !near; k++) {
      const dx = bx[k + 1] - bx[k];
      const dy = byy[k + 1] - byy[k];
      const len2 = dx * dx + dy * dy;
      const t =
        len2 > 0
          ? Math.min(
              1,
              Math.max(0, ((px - bx[k]) * dx + (py - byy[k]) * dy) / len2),
            )
          : 0;
      near =
        Math.hypot(px - (bx[k] + t * dx), py - (byy[k] + t * dy)) <=
        TRACK_COVER_M;
    }
    if (near) covered++;
  }
  return covered / a.length;
}
