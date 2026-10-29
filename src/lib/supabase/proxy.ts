import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { signedInRedirect } from "@/lib/areas";
import type { Database } from "@/types/database.types";
import {
  isActiveSession,
  sessionIdOf,
  SIGNED_IN_ELSEWHERE,
} from "@/lib/active-session";

// /privacy and /terms have to answer to signed-out visitors and to crawlers:
// Google reads them when verifying the OAuth consent screen's branding, and a
// policy only reachable behind a login is no policy at all.
// "/start" carries the landing page's plan choice into signup, so it has to be
// reachable without a session — the proxy runs before routing, and a protected
// route and a nonexistent one produce the same 307 to /login.
// The fifth time this matcher has had to be told about a public path — after
// the legal pages, the root verification files, /_vercel/ and /start. A route
// missing here 307s to /login, which looks exactly like a route that does not
// exist. /support is public on purpose: a help page behind a login fails the
// readers most likely to need it. The app's own copy lives at /help/support.
const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/auth",
  "/forgot-password",
  "/privacy",
  "/terms",
  "/start",
  "/support",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() — see
  // https://supabase.com/docs/guides/auth/server-side/nextjs for why.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // "/" is the landing page for signed-out visitors — exact match only, or
  // startsWith would make every route public.
  const isPublicRoute =
    request.nextUrl.pathname === "/" ||
    PUBLIC_ROUTES.some((route) => request.nextUrl.pathname.startsWith(route));

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // One session per account (src/lib/active-session.ts): a session another
  // sign-in has replaced is signed out here, on its next request, and sent
  // to the sign-in page with the reason.
  if (
    user &&
    !isPublicRoute &&
    !(await isActiveSession(supabase, user.sub, sessionIdOf(user)))
  ) {
    await supabase.auth.signOut({ scope: "local" });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?error=${encodeURIComponent(SIGNED_IN_ELSEWHERE)}`;
    const response = NextResponse.redirect(url);
    // The signed-out session's cookies, cleared on the way out.
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  // The sign-in pages send a signed-in account home, and so — while the
  // maintenance app is hidden — do its routes and the area the account
  // may not be in (src/lib/areas.ts).
  const target = user
    ? signedInRedirect(
        request.nextUrl.pathname,
        user.email as string | undefined,
      )
    : null;
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Must return supabaseResponse as-is (or copy its cookies onto a new
  // response) or the browser and server session cookies go out of sync.
  return supabaseResponse;
}
