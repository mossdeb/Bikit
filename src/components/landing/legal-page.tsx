import Link from "next/link";
import { landingHeadingFont, landingBodyFont } from "@/components/landing/fonts";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { getLandingDictionary, getLegalDictionary, type LandingLocale } from "@/components/landing/i18n";
import { LegalDocumentBody } from "@/components/legal-document";

/**
 * The public face of a legal document — landing chrome around the shared body.
 * `/privacy` and `/terms` have to keep rendering this: they're what Google's
 * console points at for brand verification, and what a signed-out reader gets.
 * The signed-in app has its own page over the same text.
 */
export function LegalPage({
  locale,
  document: documentKey,
}: {
  locale: LandingLocale;
  document: "privacy" | "terms";
}) {
  const nav = getLandingDictionary(locale).nav;
  const footer = getLandingDictionary(locale).footer;
  const legal = getLegalDictionary(locale);
  const doc = legal[documentKey];

  return (
    <div
      id="top"
      className={`${landingHeadingFont.variable} ${landingBodyFont.variable} min-h-screen bg-white font-[family-name:var(--font-landing-body)]`}
    >
      <LandingHeader nav={nav} locale={locale} hrefBase="/" />

      {/* Masthead in the header's own colour, inset at xl exactly like the hero
          card — so the coloured band never reads as a stray stripe. */}
      <section className="bg-white xl:px-8 xl:pt-4">
        <div className="landing-dots xl:rounded-[20px]">
          <div className="mx-auto max-w-[1160px] px-5 py-12 sm:px-8 xl:py-16">
            <h1 className="font-[family-name:var(--font-landing-heading)] text-[30px] font-bold leading-tight text-[#101014] sm:text-[42px]">
              {doc.title}
            </h1>
            <p className="mt-3 text-xs text-[#101014]/70">
              {legal.updatedLabel}: {legal.updated}
            </p>
          </div>
        </div>
      </section>

      <article className="mx-auto max-w-[760px] px-5 pb-16 pt-12 sm:px-8 md:pb-24">
        <LegalDocumentBody doc={doc} variant="landing" />

        <Link
          href="/"
          className="mt-12 inline-flex text-xs font-bold text-[#101014] underline underline-offset-4 hover:text-[#35363C]"
        >
          {legal.backToHome}
        </Link>
      </article>

      <LandingFooter dict={footer} hrefBase="/" />
    </div>
  );
}
