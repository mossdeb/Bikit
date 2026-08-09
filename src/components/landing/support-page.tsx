import Link from "next/link";
import { landingHeadingFont, landingBodyFont } from "@/components/landing/fonts";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingFAQ } from "@/components/landing/landing-faq";
import { getLandingDictionary, type LandingLocale } from "@/components/landing/i18n";
import { getDictionary } from "@/lib/i18n";
import { SUPPORT_EMAIL, CONTACT_EMAIL } from "@/lib/contact";

/**
 * The public face of Help & Support — landing chrome around the two addresses
 * and the FAQ.
 *
 * It has to be reachable signed out, which is the whole point: the people most
 * likely to need it are the ones who cannot get in. The signed-in app keeps its
 * own pages over the same content, at /help/support and /help/docs, for the
 * same reason /legal/* exists — a reader who already has an account should not
 * be handed a "Log in" and a "Start free" in the header.
 *
 * The copy is read from the app dictionary rather than copied into the landing
 * ones. It is the same text in both places and already translated there; a
 * second copy would answer differently to the first edit.
 */
export function SupportPage({ locale }: { locale: LandingLocale }) {
  const landing = getLandingDictionary(locale);
  const page = getDictionary(locale).settings.supportPage;

  return (
    <div
      id="top"
      className={`${landingHeadingFont.variable} ${landingBodyFont.variable} min-h-screen bg-white font-[family-name:var(--font-landing-body)]`}
    >
      <LandingHeader nav={landing.nav} locale={locale} hrefBase="/" />

      {/* Same masthead as the legal pages: the header's own colour, inset at xl
          exactly like the hero card, so the band never reads as a stray stripe. */}
      <section className="bg-white xl:px-8 xl:pt-4">
        <div className="bg-[#B8B3AF] xl:rounded-[20px]">
          <div className="mx-auto max-w-[1160px] px-5 py-12 sm:px-8 xl:py-16">
            <h1 className="font-[family-name:var(--font-landing-heading)] text-[30px] font-bold leading-tight text-white sm:text-[42px]">
              {page.title}
            </h1>
            <p className="mt-3 max-w-[560px] text-sm text-[#101014]/70">{page.subtitle}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[760px] px-5 pb-16 pt-12 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <MailBlock heading={page.helpHeading} body={page.helpBody} email={SUPPORT_EMAIL} />
          <MailBlock heading={page.ideasHeading} body={page.ideasBody} email={CONTACT_EMAIL} />
        </div>
      </section>

      {/* The same FAQ the landing shows, from the same dictionary — the answers
          people need before writing to either address. */}
      <LandingFAQ dict={landing.faq} />

      <LandingFooter dict={landing.footer} hrefBase="/" />
    </div>
  );
}

function MailBlock({ heading, body, email }: { heading: string; body: string; email: string }) {
  return (
    <div className="rounded-[15px] border border-[#101014]/[0.09] p-6">
      <h2 className="font-[family-name:var(--font-landing-heading)] text-lg font-bold text-[#101014]">{heading}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#35363C]">{body}</p>
      <Link
        href={`mailto:${email}`}
        className="mt-4 inline-block text-base font-bold break-all text-[#101014] underline underline-offset-4 hover:text-[#35363C]"
      >
        {email}
      </Link>
    </div>
  );
}
