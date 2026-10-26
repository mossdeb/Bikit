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

/** How much more the rear sank than the front, mm (negative: the front
 * sank more), from the frame's pitch and the wheelbase. */
export function rearMinusFrontDropMm(
  pitchDeg: number,
  wheelbaseMm: number,
): number {
  return wheelbaseMm * Math.tan((pitchDeg * Math.PI) / 180);
}
