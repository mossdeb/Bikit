import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, localeFromMetadata } from "@/lib/i18n";
import { getLegalDictionary } from "@/components/landing/i18n";
import { LegalDocumentBody } from "@/components/legal-document";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";

/**
 * The legal documents inside the app, in the app's own UI.
 *
 * `/privacy` and `/terms` stay exactly as they are — they're public, Google's
 * console points at them, and a signed-out reader needs them. What they don't
 * suit is a reader who already has an account: they come wrapped in landing
 * chrome that offers to log them in and sign them up. Same text, read from the
 * same dictionary; only the surface differs.
 */
const DOCUMENTS = ["privacy", "terms"] as const;
type DocumentKey = (typeof DOCUMENTS)[number];

function parseDocument(value: string): DocumentKey | null {
  return (DOCUMENTS as readonly string[]).includes(value) ? (value as DocumentKey) : null;
}

/** The account's language decides here — inside the app there is always a
 * session, so the landing cookie that `legalLocale()` falls back to never
 * applies and the claims are already being read for the page itself. */
async function resolve(documentKey: string) {
  const key = parseDocument(documentKey);
  if (!key) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const locale = localeFromMetadata(data?.claims?.user_metadata);
  const legal = getLegalDictionary(locale);

  return { doc: legal[key], legal, dict: getDictionary(locale) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  const { doc } = await resolve(document);
  return { title: doc.metaTitle, description: doc.metaDescription };
}

export default async function AppLegalPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  const { doc, legal, dict } = await resolve(document);

  // Rendered twice rather than moved: on mobile the title belongs to the card,
  // on desktop it titles the page above it, and CSS can't reparent an element.
  // Only one of the two is ever visible.
  const heading = (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold">{doc.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {legal.updatedLabel}: {legal.updated}
      </p>
    </div>
  );

  return (
    <div className="pt-4 sm:pt-8">
      <div className="hidden text-sm text-muted-foreground sm:mb-2 sm:block">
        <Link href="/settings" className="hover:text-foreground">
          {dict.settings.title}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{doc.title}</span>
      </div>

      <div className="hidden sm:block">{heading}</div>

      <article className={`rounded-lg bg-card px-5 py-6 sm:px-6 ${DARK_CARD_HAIRLINE}`}>
        <div className="sm:hidden">{heading}</div>
        <LegalDocumentBody doc={doc} variant="app" />
      </article>
    </div>
  );
}
