/**
 * Pure arithmetic for the BLE odometer sync (lab test, one account).
 *
 * The sensor keeps one number worth syncing: a cumulative wheel-revolution
 * counter, proven on 2026-08-18 to survive deep sleep (38 → 107 across a
 * night). A sync reads it, subtracts the baseline stored at the previous
 * sync, and turns revolutions into km via the wheel circumference. Same
 * shape as the Strava sync: pull an accumulator, take the difference, add.
 *
 * Distance is all it can give. The counter carries no timing — the CSC
 * event-time field wraps every 64 seconds and exists for live speed, not
 * history — so hours never advance from here.
 *
 * Dependency-free on purpose: there is no vitest.config.ts, so the test file
 * imports this module relatively and anything imported from here would need
 * to survive that too.
 */

/** ISO rim diameters (mm) for the wheel choices the pairing UI offers.
 * 29" and 700c share a rim, as do 27.5" and 650b — the label difference is
 * road-vs-MTB convention, kept because riders look for their own word. */
export const WHEEL_RIM_ISO_MM = {
  '26"': 559,
  '27.5"': 584,
  '29"': 622,
  "700c": 622,
  "650b": 584,
} as const;

export type WheelChoice = keyof typeof WHEEL_RIM_ISO_MM;

/**
 * Approximate rolling circumference: π × (rim diameter + twice the tire
 * height). Within about 1% of the published charts — 29×2.3" computes 2321
 * against Garmin's 2326 — and pressure and tread account for that much
 * anyway. The pairing UI shows the result in an editable field, so this is
 * a starting point, not the last word.
 */
export function wheelCircumferenceMm(rimIsoMm: number, tireHeightMm: number): number {
  return Math.round(Math.PI * (rimIsoMm + 2 * tireHeightMm));
}

export type SensorSyncOutcome =
  | { kind: "advance"; revs: number; km: number }
  | { kind: "reset" };

/**
 * A current count below the baseline means the sensor restarted — battery
 * swap — and the ride that may have preceded it is unrecoverable. The rule:
 * rebase on the new count and add nothing, never a negative distance. The
 * uint32 rollover is ignored on purpose; it sits ~9 million km away.
 */
export function sensorSyncOutcome(
  baselineCount: number,
  currentCount: number,
  wheelMm: number
): SensorSyncOutcome {
  if (currentCount < baselineCount) return { kind: "reset" };
  const revs = currentCount - baselineCount;
  return { kind: "advance", revs, km: (revs * wheelMm) / 1_000_000 };
}
