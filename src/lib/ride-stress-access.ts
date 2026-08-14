/**
 * Ride Stress is a closed beta — one account, the owner's.
 *
 * An email allowlist rather than a PLAN_FEATURES flag, because this is not a
 * plan capability that happens to be off: it is unfinished work in front of
 * real data, and the question it answers is "is this person me", not "did this
 * person pay". When it opens up, it opens through PLAN_FEATURES and this file
 * goes away, the same way the Smart Setup beta list did on 2026-08-11.
 *
 * Not an env var: one that only exists in Production cannot be tested here,
 * and this gate has to behave identically in local dev, where it is being
 * built.
 */
export const RIDE_STRESS_BETA_EMAILS = ["miguelgomesdzn@gmail.com"];

export function hasRideStressAccess(email: string | null | undefined): boolean {
  if (!email) return false;
  return RIDE_STRESS_BETA_EMAILS.includes(email.trim().toLowerCase());
}
