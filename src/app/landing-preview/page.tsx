import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { LandingPage } from "@/components/landing/landing-page";
import { LANDING_LOCALE_COOKIE, type LandingLocale } from "@/components/landing/i18n";

export const metadata: Metadata = {
  title: "Landing preview",
  robots: { index: false, follow: false },
};

/**
 * The landing while it is hidden (SHOW_LANDING in src/app/page.tsx), for the
 * accounts with Pro access to review (by request, 2026-10-30). To anyone else
 * the page does not exist; signed out, the proxy sends them to the login.
 * Remove it once the landing is published.
 */
export default async function LandingPreview() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!hasLabAccess(data?.claims?.email as string | undefined)) notFound();

  const cookieStore = await cookies();
  const locale = (cookieStore.get(LANDING_LOCALE_COOKIE)?.value as LandingLocale) ?? "en";

  return <LandingPage locale={locale} />;
}
