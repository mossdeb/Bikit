import Link from "next/link";
import { PoweredByStrava } from "@/components/strava-brand";
import { LandingHeroCarousel } from "@/components/landing/landing-hero-carousel";
import type { LandingDictionary } from "@/components/landing/i18n/en";

export function LandingHero({ dict }: { dict: LandingDictionary["hero"] }) {
  return (
    // pb-1 because the next section already brings 96px of its own padding-top:
    // 4 + 96 = the 100px gap the design asks for.
    // No padding-top below xl: there the header already carries the card's
    // colour, and 16px of white between the two would split the surface.
    <section className="bg-white pb-1 xl:px-8 xl:pt-4">
      {/* Full bleed until the desktop layout: no side margin, square corners. */}
      <div className="relative mx-auto max-w-[1470px] overflow-hidden bg-[#B8B3AF] xl:rounded-[20px]">
        {/* The DOM order is the desktop reading order; on mobile the subtitle
            block alone is moved below the buttons (see `order-last`). On desktop
            the visual is lifted out of the flow to fill the card's full height
            and run off its right edge, and `pr` keeps the copy clear of it. */}
        <div className="grid grid-cols-1 gap-8 px-6 pb-12 pt-6 sm:px-12 sm:pt-12 lg:px-24 xl:min-h-[792px] xl:content-center xl:py-20 xl:pr-[54%]">
          <div className="flex flex-col gap-6">
            {/* Below 400px the badge crowds the heading, and it is decoration. */}
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white py-2 pl-3 pr-4 shadow-sm max-[400px]:hidden">
              <img src="/landing/icons/bike-enduro.svg" alt="" className="h-3.5 w-auto" />
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#101014]">
                {dict.badge}
              </span>
            </span>

            <h1 className="font-[family-name:var(--font-landing-heading)] text-[32px] font-bold leading-[1.1] tracking-tight text-white sm:text-[44px] lg:text-[52px] xl:text-[56px]">
              {dict.titleLine1}.
              <br />
              {dict.titleLine2}.
            </h1>
          </div>

          {/* Sits under the buttons on mobile, back under the heading from xl.
              `-mt-2` cancels the 8px difference between the grid's gap-8 and the
              gap-6 this block had while it lived inside the heading's column. */}
          <div className="order-last flex flex-col gap-6 xl:order-none xl:-mt-2">
            <p className="max-w-[460px] text-base font-medium leading-relaxed text-[#101014]/80 sm:text-[16.8px]">
              {dict.subtitle}
            </p>

            {/* The dividers only exist from sm, where the row fits on one line —
                on mobile it wraps, and a wrapped divider strands at the end of a line. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-6">
              <div className="flex items-center gap-2 sm:gap-2.5">
                <img
                  src="/landing/icons/bell.svg"
                  alt=""
                  className="h-3.5 w-3.5 shrink-0 brightness-0 sm:h-4 sm:w-4"
                />
                <p className="text-sm font-bold text-[#101014] sm:text-base">{dict.alerts}</p>
              </div>
              <div className="hidden h-5 w-px shrink-0 bg-[#101014]/20 sm:block sm:h-6" />
              <div className="flex items-center gap-2 sm:gap-2.5">
                <img
                  src="/landing/icons/wrench-mountain.svg"
                  alt=""
                  className="h-3.5 w-3.5 shrink-0 brightness-0 sm:h-4 sm:w-4"
                />
                <p className="text-sm font-bold text-[#101014] sm:text-base">{dict.services}</p>
              </div>
              <div className="hidden h-5 w-px shrink-0 bg-[#101014]/20 sm:block sm:h-6" />
              <div className="flex items-center gap-2 sm:gap-2.5">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 text-[#101014] sm:h-4 sm:w-4"
                >
                  <path
                    d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01M20.5 4.5V10H15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="text-sm font-bold text-[#101014] sm:text-base">{dict.smart}</p>
              </div>
            </div>
          </div>

          {/* Bleeds past the copy's side padding so the photo reaches the card edges. */}
          <div className="-mx-6 sm:-mx-12 lg:-mx-24 xl:absolute xl:inset-y-0 xl:right-0 xl:mx-0 xl:w-[64%]">
            <LandingHeroCarousel dict={dict} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:pt-2">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#101014] px-7 py-4 text-sm font-bold text-[#43F3AF] transition-opacity hover:opacity-90"
            >
              {dict.ctaPrimary}
              <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-4 w-4">
                <path
                  d="M2.5 8h11m0 0L9 3.5M13.5 8 9 12.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <a
              href="#precos"
              className="inline-flex items-center justify-center rounded-full border border-[#101014]/35 px-7 py-4 text-sm font-bold text-[#101014] transition-colors hover:bg-white/30"
            >
              {dict.ctaSecondary}
            </a>
          </div>

          {/* Stays in the flow rather than pinned to the card's bottom-left.
              Pinned, the gap above it is whatever the centred copy happens to
              leave: measured 49px at 1400 and 3px at 1280, where the heading
              wraps onto another line and pushes the buttons down into it. In
              the flow the gap is the same at every width, which is the
              relationship worth holding — it reads as belonging under the
              buttons, not as floating in a corner.

              `order-last` twice is deliberate: the subtitle block carries it
              too, and equal order values fall back to DOM order, so this stays
              underneath it.

              Black, not the themed variant — the card is #B8B3AF whatever the
              reader's theme is doing. */}
          <div className="order-last mt-6 flex justify-center xl:mt-4 xl:justify-start">
            <PoweredByStrava variant="black" />
          </div>
        </div>
      </div>
    </section>
  );
}
