/**
 * Who may reach the lab routes — Bikit Pro's area (`/pro`, since
 * 2026-09-23) and the sensor probe under it.
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
// wearewildpack@gmail.com: the Pro's first beta account (2026-10-23);
// miguel_gomes@sapo.pt: the owner's second account, to see the Pro as a
// beta account does; foxtrot.mecanicanaval@gmail.com: a beta account
// (2026-10-30); amandioplasticos@gmail.com: a beta account (2026-11-02);
// vitorb87@hotmail.com: a beta account (2026-11-07).
// andre.r.c.guerreiro@gmail.com: a beta account (2026-11-08).
const LAB_EMAILS = [
  "miguelgomesdzn@gmail.com",
  "wearewildpack@gmail.com",
  "miguel_gomes@sapo.pt",
  "foxtrot.mecanicanaval@gmail.com",
  "amandioplasticos@gmail.com",
  "vitorb87@hotmail.com",
  "andre.r.c.guerreiro@gmail.com",
];

/**
 * Who sees "Download file" in a session's settings (by request,
 * 2026-10-23): the owner, not the beta accounts. It only hides the button —
 * the page itself fetches the recording from Storage to analyse it, so an
 * account can still reach its own file's bytes.
 */
const RECORDING_DOWNLOAD_EMAILS = ["miguelgomesdzn@gmail.com"];

/**
 * Who sees the administration page (/pro/admin, 2026-11-09): how every
 * account uses the app. The owner only — it reads every account's rows.
 */
const ADMIN_EMAILS = ["miguelgomesdzn@gmail.com"];

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * The beta's end for an account (by request, 2026-11-10): a date, set on
 * the administration page, from which the Pro is closed to it — the
 * account lands on the beta's page, told its trial ended. Kept in the
 * account's `app_metadata` (only the service role writes it), so every
 * request reads it off the session's claims without a query; a change
 * reaches an open session when its token next refreshes, within the hour.
 * The day is Portugal's, and the owner's account never expires.
 */
export const ACCESS_ENDS_KEY = "access_ends_on";

/** The account's end date, "YYYY-MM-DD", or null for none. */
export function accessEndsOn(appMetadata: unknown): string | null {
  const value = (appMetadata as Record<string, unknown> | null | undefined)?.[
    ACCESS_ENDS_KEY
  ];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

/** Today in Portugal, "YYYY-MM-DD". */
export function lisbonToday(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
}

/** Whether the account's beta has ended: its end date is today or past. */
export function isAccessExpired(
  claims: { email?: unknown; app_metadata?: unknown } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!claims || isAdmin(claims.email as string | undefined)) return false;
  const ends = accessEndsOn(claims.app_metadata);
  return ends != null && lisbonToday(now) >= ends;
}

/**
 * Who sees the Perfect Run and the track editor page. The owner's account
 * only from 2026-11-09; every account with the Pro since 2026-11-12 (by
 * request). Each account reads and writes only its own tracks and sessions —
 * the queries and actions are scoped by user id, not by this gate.
 */
export function hasPerfectRun(email: string | null | undefined): boolean {
  return hasLabAccess(email);
}

export function canDownloadRecordings(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return RECORDING_DOWNLOAD_EMAILS.includes(email.trim().toLowerCase());
}

export function hasLabAccess(email: string | null | undefined): boolean {
  if (!email) return false;
  return LAB_EMAILS.includes(email.trim().toLowerCase());
}
