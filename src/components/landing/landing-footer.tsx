import Link from "next/link";
import { PATENT_LINE } from "@/components/site-footer";
import type { LandingDictionary } from "@/components/landing/i18n/en";

export function LandingFooter({
  dict,
  // Same reason as the header: the product links are anchors into the landing
  // page, so a page that is not the landing page prefixes them with "/".
  hrefBase = "",
}: {
  dict: LandingDictionary["footer"];
  hrefBase?: string;
}) {
  return (
    <footer className="bg-white px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-[1160px]">
        <div className="mb-3 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#101014] px-3.5 py-1.5 text-center text-xs font-bold tracking-wide text-white uppercase">
            <span className="size-1.5 shrink-0 rounded-full bg-white" />
            {PATENT_LINE}
          </span>
        </div>
        <div className="flex flex-col gap-9 border-b border-[#101014]/[0.09] pb-9 sm:flex-row sm:justify-between">
          <div className="flex max-w-[280px] flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <img src="/landing/icons/logo.svg" alt="" className="h-[34px] w-[34px]" />
              <span className="font-[family-name:var(--font-landing-heading)] text-base font-bold text-[#101014]">
                Bikit
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[#8A8D93]">{dict.tagline}</p>
          </div>

          {/* Wraps because the third column does not fit beside the other two at 375px. */}
          <div className="flex flex-wrap gap-10 sm:gap-16">
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8A8D93]">{dict.productHeading}</p>
              {dict.productLinks.map((link) => (
                <a
                  key={link.label}
                  href={`${hrefBase}${link.href}`}
                  className="text-sm text-[#101014] hover:text-[#35363C]"
                >
                  {link.label}
                </a>
              ))}
              {/* A page of its own rather than an anchor, so it takes no
                  hrefBase — that prefix exists to send the anchors above back
                  to the landing, and applied here it would build "//support". */}
              <Link href="/support" className="text-sm text-[#101014] hover:text-[#35363C]">
                {dict.productSupport}
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8A8D93]">{dict.accountHeading}</p>
              <Link href="/login" className="text-sm text-[#101014] hover:text-[#35363C]">
                {dict.accountLogin}
              </Link>
              <Link href="/signup" className="text-sm text-[#101014] hover:text-[#35363C]">
                {dict.accountSignup}
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8A8D93]">{dict.legalHeading}</p>
              <Link href="/privacy" className="text-sm text-[#101014] hover:text-[#35363C]">
                {dict.legalPrivacy}
              </Link>
              <Link href="/terms" className="text-sm text-[#101014] hover:text-[#35363C]">
                {dict.legalTerms}
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-4 text-xs text-[#8A8D93] sm:flex-row sm:items-center sm:justify-between">
          <p>{dict.copyright}</p>
          <p>{dict.madeFor}</p>
        </div>
      </div>
    </footer>
  );
}
