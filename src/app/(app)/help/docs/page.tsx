import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { getLandingDictionary } from "@/components/landing/i18n";
import { FaqAccordion } from "@/components/faq-accordion";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

/**
 * The FAQ, for a reader who already has an account.
 *
 * The questions are the landing page's, read from the landing dictionary
 * rather than copied — the same arrangement as `/legal/*`, and for the same
 * reason: a second copy would answer differently the first time one of them
 * was edited. Only the surface differs.
 */
async function resolve() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const locale = localeFromMetadata(data?.claims?.user_metadata);
  const dict = getDictionary(locale);
  return { dict, page: dict.settings.docsPage, faq: getLandingDictionary(locale).faq };
}

export async function generateMetadata(): Promise<Metadata> {
  const { page } = await resolve();
  return { title: page.metaTitle, description: page.metaDescription };
}

export default async function DocsPage() {
  const { dict, page, faq } = await resolve();

  // Rendered twice rather than moved: on mobile the title belongs to the card,
  // on desktop it titles the page above it, and CSS can't reparent an element.
  // Only one of the two is ever visible — the same arrangement as /legal/*.
  const heading = (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold">{page.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{page.subtitle}</p>
    </div>
  );

  return (
    <div className="pt-4 sm:pt-8">
      <div className="hidden text-sm text-muted-foreground sm:mb-2 sm:block">
        <Link href="/settings" className="hover:text-foreground">
          {dict.settings.title}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{page.title}</span>
      </div>

      <div className="hidden sm:block">{heading}</div>

      <article className={`rounded-lg bg-card px-5 py-6 sm:px-6 ${DARK_CARD_HAIRLINE}`}>
        <div className="sm:hidden">{heading}</div>
        <FaqAccordion items={[...faq.questions]} />
      </article>
    </div>
  );
}
