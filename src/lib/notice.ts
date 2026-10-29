/**
 * The confidentiality, IP and patent notice (by request, 2026-10-29):
 * shown after every sign-in, until it is confirmed. A sign-in sets the
 * cookie; the layouts read it and show the notice; confirming clears it
 * and records, once, that the user accepted this version of the text
 * (notice_acceptances, migration 00054).
 */
export const NOTICE_COOKIE = "bikit_notice";
/** The text's version: a new one is asked for, and recorded, anew. */
export const NOTICE_ID = "confidentiality-2026-10";

/** The cookie as a sign-in sets it: for the session, readable only by the
 * server. */
export const NOTICE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
