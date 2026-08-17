/**
 * Who may reach the lab routes.
 *
 * These are probes, not features: they exist to answer a question about
 * hardware or about a browser API before anything is built on top of it. They
 * are not translated, not designed, and may read raw numbers off a device.
 * Nobody but the owner should meet one.
 *
 * An email allowlist and not a plan feature, deliberately. `PLAN_FEATURES` is
 * the honest expression of "this is a capability someone paid for"; a lab
 * route is the opposite — it is a capability nobody should have, including
 * the paying customers. When a probe graduates into a feature it moves to
 * PLAN_FEATURES and this list stops mentioning it, the way the Ride Load
 * allowlist did on 2026-08-15.
 */
const LAB_EMAILS = ["miguelgomesdzn@gmail.com"];

export function hasLabAccess(email: string | null | undefined): boolean {
  if (!email) return false;
  return LAB_EMAILS.includes(email.trim().toLowerCase());
}
