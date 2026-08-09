import type { Metadata } from "next";
import { SupportPage } from "@/components/landing/support-page";
import { PublicAnalytics } from "@/components/public-analytics";
import { getDictionary } from "@/lib/i18n";
import { legalLocale } from "@/lib/legal";

/**
 * Public Help & Support. No redirect for a signed-in reader, same as /privacy
 * and /terms — they get the public page if they ask for this URL, and the app's
 * own copy at /help/support when they arrive from Settings.
 */
export async function generateMetadata(): Promise<Metadata> {
  const page = getDictionary(await legalLocale()).settings.supportPage;
  return { title: page.metaTitle, description: page.metaDescription };
}

export default async function Support() {
  const locale = await legalLocale();

  return (
    <>
      <SupportPage locale={locale} />
      <PublicAnalytics />
    </>
  );
}
