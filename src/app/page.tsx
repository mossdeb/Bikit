import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/areas";
import { LandingPage } from "@/components/landing/landing-page";
import { PublicAnalytics } from "@/components/public-analytics";
import { LANDING_LOCALE_COOKIE, type LandingLocale } from "@/components/landing/i18n";

/** The promotional landing page, for a signed-out visitor at "/" (back on by
 * request, 2026-10-30). Set to false and they land on the login instead. */
const SHOW_LANDING = true;

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  // The account's home: the Pro, its beta's waiting page, or the dashboard
  // while the maintenance app is shown (src/lib/areas.ts). Signing in
  // lands here and is sent on.
  if (data?.claims) redirect(homePathFor(data.claims.email as string | undefined));
  if (!SHOW_LANDING) redirect("/login");

  const cookieStore = await cookies();
  const locale = (cookieStore.get(LANDING_LOCALE_COOKIE)?.value as LandingLocale) ?? "en";

  return (
    <>
      <LandingPage locale={locale} />
      <PublicAnalytics />
    </>
  );
}
