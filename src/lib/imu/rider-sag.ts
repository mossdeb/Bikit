import type {
  ImuMountOrientation,
  ImuRiderSag,
} from "@/lib/imu/format";

/**
 * The bike's attitude with the rider on it (the rider-sag calibration step,
 * 2026-10-26): how far the frame turned, nose up or down and to a side,
 * between standing empty and carrying the rider in their riding position.
 * The two readings are taken on the same spot, so the ground's own slope is
 * in both and drops out of the difference.
 *
 * Read in the bike's frame — the mounting orientation's front, left and up
 * (ORI1) — where `up` IS the empty bike's gravity, so the empty attitude is
 * level by construction and the rider-on gravity alone says the change.
 * Pitch is signed as pitchSeries signs it: nose up positive.
 *
 * The frame turns because the two ends sink by different amounts. Nose up
 * means the rear sank more than the front:
 *   rear drop − front drop ≈ wheelbase · tan(Δpitch)
 * One angle cannot say both drops — two unknowns — but with one of them
 * measured (the fork's sag in the Bike setup) it gives the other's share.
 */

export interface RiderAttitude {
  /** Nose up positive, degrees. */
  pitchDeg: number;
  /** Left side down positive, degrees. */
  rollDeg: number;
}

/** A frame turn smaller than this is the readings' noise, degrees: ~4 s of
 * a still accelerometer average to a few hundredths. */
export const RIDER_ATTITUDE_TIE_DEG = 0.1;

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** The rider-on attitude against the empty bike's, or null without the
 * step's reading or without a mounting orientation to read it in. */
export function riderAttitude(
  sag: ImuRiderSag | undefined,
  orientation: ImuMountOrientation | undefined,
): RiderAttitude | null {
  if (!sag || !orientation) return null;
  const g = sag.gravityG;
  if (!g.every(Number.isFinite) || Math.hypot(...g) < 0.5) return null;
  const front = dot(g, orientation.front);
  const left = dot(g, orientation.left);
  const up = dot(g, orientation.up);
  const toDeg = 180 / Math.PI;
  return {
    pitchDeg: Math.atan2(front, Math.hypot(left, up)) * toDeg,
    rollDeg: Math.atan2(left, up) * toDeg,
  };
}

/**
 * The reading as a session row keeps it (`imu_sessions.rider_sag`,
 * migration 00052) — the setup's history across a bike's sessions without
 * downloading their files. Analysis and display only (by request,
 * 2026-10-27): ORI1 stays the frame every figure is read in, and nothing
 * detected or measured reads this.
 */
export interface StoredRiderSag {
  pitchDeg: number;
  rollDeg: number;
  /** The calibration it was taken in: the logger repeats one SAG1 in
   * every file until it is calibrated again, so this tells readings apart. */
  calibrationCount: number;
  gravityG: [number, number, number];
  sampleCount: number;
  accelStddevG: number;
}

/** What a session's file says, ready to store; null without the step or
 * without a mounting orientation to read it in. */
export function storedRiderSag(
  sag: ImuRiderSag | undefined,
  orientation: ImuMountOrientation | undefined,
): StoredRiderSag | null {
  const attitude = riderAttitude(sag, orientation);
  if (!sag || !attitude) return null;
  return {
    pitchDeg: attitude.pitchDeg,
    rollDeg: attitude.rollDeg,
    calibrationCount: sag.calibrationCount,
    gravityG: sag.gravityG,
    sampleCount: sag.sampleCount,
    accelStddevG: sag.accelStddevG,
  };
}

export function isStoredRiderSag(value: unknown): value is StoredRiderSag {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  return (
    finite(v.pitchDeg) &&
    finite(v.rollDeg) &&
    finite(v.calibrationCount) &&
    finite(v.sampleCount) &&
    finite(v.accelStddevG) &&
    Array.isArray(v.gravityG) &&
    v.gravityG.length === 3 &&
    v.gravityG.every(finite)
  );
}

/** Two stored readings are one calibration's — the same SAG1 repeated in
 * several files — when the logger's count and the gravity agree. */
export function sameRiderSag(a: StoredRiderSag, b: StoredRiderSag): boolean {
  return (
    a.calibrationCount === b.calibrationCount &&
    a.gravityG.every((x, i) => Math.abs(x - b.gravityG[i]) < 1e-6)
  );
}

/** One rider-sag reading in a bike's history: one calibration, however
 * many recordings repeated it. */
export interface RiderSagHistoryEntry<S> {
  reading: StoredRiderSag;
  /** The first session that carried it, ISO. */
  firstAt: string;
  sessionIds: string[];
  sessionNames: string[];
  /** The setup of that first session — the nearest record of what the
   * bike was set to when it was calibrated; null when it had none. */
  setup: S | null;
}

/**
 * A bike's sessions folded into its rider-sag history (by request,
 * 2026-10-27: compare the bike's configurations by the SAG1): each
 * calibration once, newest first. The rows come oldest first; rows
 * without a reading are skipped.
 */
export function riderSagHistory<S>(
  rows: {
    id: string;
    name: string;
    createdAt: string;
    riderSag: unknown;
    setup: S | null;
  }[],
): RiderSagHistoryEntry<S>[] {
  const entries: RiderSagHistoryEntry<S>[] = [];
  for (const row of rows) {
    if (!isStoredRiderSag(row.riderSag)) continue;
    const reading = row.riderSag;
    const entry = entries.find((e) => sameRiderSag(e.reading, reading));
    if (entry) {
      entry.sessionIds.push(row.id);
      entry.sessionNames.push(row.name);
    } else
      entries.push({
        reading,
        firstAt: row.createdAt,
        sessionIds: [row.id],
        sessionNames: [row.name],
        setup: row.setup,
      });
  }
  return entries.reverse();
}

/** How much more the rear sank than the front, mm (negative: the front
 * sank more), from the frame's pitch and the wheelbase. */
export function rearMinusFrontDropMm(
  pitchDeg: number,
  wheelbaseMm: number,
): number {
  return wheelbaseMm * Math.tan((pitchDeg * Math.PI) / 180);
}

/**
 * Each end's drop, mm, vertical (by request, 2026-10-27): the one measured
 * — the fork's sag off its O-ring, along the leg — stood up by the head
 * angle (degrees from the ground, the catalogue's), and the rear's as the
 * front's plus the difference the pitch says. So the rear's is a sag the
 * sensor measured, to set beside what the shock's O-ring shows.
 *
 * Approximate on purpose: the head angle is the bike's unladen one and
 * sag itself slackens it by about the pitch, a ~1 % error on the front's
 * drop; and each figure carries its tyre's squash, the rear's more.
 */
export function riderSagDropsMm(input: {
  pitchDeg: number;
  wheelbaseMm: number;
  headAngleDeg: number;
  forkSagMm: number;
}): { frontMm: number; rearMm: number } {
  const frontMm =
    input.forkSagMm * Math.sin((input.headAngleDeg * Math.PI) / 180);
  return {
    frontMm,
    rearMm: frontMm + rearMinusFrontDropMm(input.pitchDeg, input.wheelbaseMm),
  };
}
