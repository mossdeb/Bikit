import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Match every route except static assets and /api, so the session
    // cookie stays fresh everywhere without re-running on _next internals.
    // /api routes (e.g. the cron endpoint) use their own auth and must not
    // get redirected to /login for lacking a browser session.
    //
    // /_vercel is excluded for the same reason: Web Analytics serves its
    // script from /_vercel/insights/script.js and posts page views to
    // /_vercel/insights/view. Both were being answered with a 307 to /login,
    // measured against production — and a signed-out visitor is exactly the
    // one we want to count, so it would have failed silently for everyone.
    //
    // `webmanifest` is in the extension list for the same reason, added after
    // an Android install showed the generic letter tile instead of the app
    // icon: the icons under /icons/*.png were always fine — they end in .png
    // and never reached this proxy — but /manifest.webmanifest did, and came
    // back as a 307 to /login. Chrome cannot read a manifest it was redirected
    // away from, so it had no icons to install and drew its own. The manifest
    // has to be readable by a signed-out visitor: it is fetched on the landing
    // page, before anyone has an account.
    "/((?!api/|_vercel/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
