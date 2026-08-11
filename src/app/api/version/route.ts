// Which build is live, as a fact instead of a deduction.
//
// This exists because confirming a deploy from the development machine kept
// costing time and producing wrong answers: every change of the last few
// sessions lives inside the authenticated app, so no public page carries a
// fingerprint; comparing chunk hashes of /login is inconclusive by
// construction (a build that doesn't touch that page emits identical
// hashes); and a curl to a protected route answers 200 from the login page
// at the end of the redirect chain, which reads as success and isn't. The
// Vercel MCP would settle it, and has answered 403 since 2026-08-09.
//
// Vercel sets these at build time. Locally they don't exist, and saying so
// is more useful than inventing a value.

/** No caching layer may answer this — the whole point is what is running
 * right now. */
export const dynamic = "force-dynamic";

export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return Response.json(
    {
      commit,
      short: commit?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      env: process.env.VERCEL_ENV ?? "local",
    },
    { headers: { "cache-control": "no-store" } }
  );
}
