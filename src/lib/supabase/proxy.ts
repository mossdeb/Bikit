import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
const PUBLIC_ROUTES = ["/login", "/signup", "/auth", "/forgot-password", "/privacy", "/terms", "/start", "/support"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
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

  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup" ||
      request.nextUrl.pathname === "/forgot-password")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Must return supabaseResponse as-is (or copy its cookies onto a new
  // response) or the browser and server session cookies go out of sync.
  return supabaseResponse;
}
