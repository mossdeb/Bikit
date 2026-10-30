import Link from "next/link";
import { LandingLocaleSwitcher } from "@/components/landing/landing-locale-switcher";
import type { LandingDictionary } from "@/components/landing/i18n/en";
import type { LandingLocale } from "@/components/landing/i18n";

/** The sign-in button is hidden for now (by request, 2026-10-30): the beta's
 * riders go to /login directly. Set back to true to bring it back. */
const SHOW_LOGIN = false;

export function LandingHeader({
  nav,
  locale,
  // The nav is a set of anchors into the landing page. On any other page that
  // reuses this header (the legal pages) they have nothing to scroll to, so the
  // caller prefixes them with "/" to send the visitor home first.
  hrefBase = "",
  // Over the landing's hero photograph; the other pages keep it on white.
  onDark = false,
}: {
  nav: LandingDictionary["nav"];
  locale: LandingLocale;
  hrefBase?: string;
  onDark?: boolean;
}) {
  const NAV_LINKS = [
    { label: nav.features, href: `${hrefBase}#features` },
    { label: nav.device, href: `${hrefBase}#device` },
    { label: nav.faq, href: `${hrefBase}#faq` },
  ];
  const ink = onDark ? "text-white" : "text-[#101014]";

  return (
    <header className={onDark ? "absolute inset-x-0 top-0 z-10" : "bg-white"}>
      <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <a href={`${hrefBase}#top`} className="flex items-center gap-2.5">
          <img
            src={onDark ? "/landing/icons/logo-white.svg" : "/landing/icons/logo.svg"}
            alt=""
            className="h-[34px] w-[34px]"
          />
          <span className={`font-[family-name:var(--font-landing-heading)] text-base font-bold ${ink}`}>
            Bikit
          </span>
        </a>

        <nav className="hidden items-center gap-[30px] md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`text-sm font-bold transition-opacity hover:opacity-75 ${ink}`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <LandingLocaleSwitcher locale={locale} label={nav.switchLanguage} onDark={onDark} />
          {SHOW_LOGIN && (
            <Link
              href="/login"
              className="rounded-full bg-[#43F3AF] px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-[#101014] transition-opacity hover:opacity-90"
            >
              {nav.login}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
