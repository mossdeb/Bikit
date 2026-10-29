/**
 * The confidentiality, IP and patent notice (by request, 2026-10-29):
 * shown after every sign-in, until it is confirmed. A sign-in sets the
 * cookie; while it is set the proxy sends every page to the notice's own
 * page, with nothing of the app behind it (a dialog over the app could be
 * scrolled past on a phone); confirming clears it, records, once, that the
 * user accepted this version of the text (notice_acceptances, migration
 * 00054), and goes on to the page that was asked for.
 */
export const NOTICE_COOKIE = "bikit_notice";
/** The text's version: a new one is asked for, and recorded, anew. */
export const NOTICE_ID = "confidentiality-2026-10";
/** The notice's page. */
export const NOTICE_PATH = "/notice";

/** The cookie as a sign-in sets it: for the session, readable only by the
 * server. */
export const NOTICE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Where to go once it is confirmed: a path on this site, never another
 * site and never the notice again; "/" (the account's home) otherwise. */
export function noticeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (next === NOTICE_PATH || next.startsWith(`${NOTICE_PATH}?`)) return "/";
  return next;
}
