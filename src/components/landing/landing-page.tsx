import {
  landingBodyFont,
  landingDisplayFont,
  landingHeadingFont,
} from "@/components/landing/fonts";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingDevice3D } from "@/components/landing/landing-device-3d";
import { LandingFAQ } from "@/components/landing/landing-faq";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingWave } from "@/components/landing/landing-wave";
import { LandingWaitlistForm } from "@/components/landing/landing-waitlist-form";
import { getLandingDictionary, type LandingLocale } from "@/components/landing/i18n";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#101014] px-3.5 py-1.5 text-xs font-bold tracking-wide text-white uppercase">
      <span className="size-1.5 rounded-full bg-white" />
      {children}
    </span>
  );
}

const SECTION_TITLE =
  "font-[family-name:var(--font-landing-heading)] text-3xl leading-tight font-bold tracking-tight text-[#101014] sm:text-[36.8px]";
const SECTION_LEAD = "text-[16.3px] leading-relaxed text-[#35363C]";

/**
 * The promotional page, for the product as it is now (Landing V3 in Figma,
 * 2026-10-30): the telemetry device and its waitlist, no longer the
 * maintenance app.
 */
export function LandingPage({ locale }: { locale: LandingLocale }) {
  const dict = getLandingDictionary(locale);
  const { hero, features, device, faq } = dict.home;

  return (
    <div
      id="top"
      className={`${landingHeadingFont.variable} ${landingBodyFont.variable} ${landingDisplayFont.variable} min-h-screen overflow-x-clip bg-white font-[family-name:var(--font-landing-body)]`}
    >
      <section
        className="relative flex min-h-[640px] flex-col items-center justify-center overflow-hidden bg-[#101014] bg-cover bg-center px-5 pt-24 pb-14 text-center lg:h-[876px]"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, transparent 71%, rgb(77 79 74 / 0.73)), linear-gradient(rgb(0 0 0 / 0.7), rgb(0 0 0 / 0.7)), url(/landing/images/home-hero.webp)",
        }}
      >
        <LandingHeader nav={dict.nav} locale={locale} onDark />

        <div className="flex items-center gap-[18px] sm:gap-[27px]">
          <img src="/landing/icons/logo-white.svg" alt="" className="size-16 sm:size-[92px]" />
          <span className="font-[family-name:var(--font-landing-display)] text-[44px] leading-none font-bold text-white sm:text-[60px]">
            Bikit
          </span>
        </div>

        <p className="mt-9 text-base text-white uppercase sm:mt-14 sm:text-lg">
          {hero.kicker}
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-landing-display)] text-[22px] leading-[1.1] tracking-[2.5px] text-[#F9F9F7] uppercase sm:text-[42px] sm:tracking-[7px]">
          <span className="font-bold">{hero.titleBold1}</span>
          <br />
          <span className="font-light">{hero.titleLight}</span>{" "}
          <span className="font-bold">{hero.titleBold2}</span>
        </h1>

        <p className="mt-14 text-base leading-relaxed text-white sm:mt-[110px] sm:text-lg">
          {hero.lead1} <br className="hidden sm:block" />
          {hero.lead2}
        </p>
        <div className="mt-7 flex w-full justify-center">
          <LandingWaitlistForm dict={hero} locale={locale} />
        </div>
      </section>

      {/* --u is one design pixel: the bikes and the card keep the frame's
          proportions, held at the centre of the page, and shrink with it. */}
      <section
        id="features"
        className="landing-dots relative scroll-mt-4 overflow-hidden pt-16 [--u:calc(100vw/700)] md:pt-24 lg:[--u:calc(100vw/1616)]"
      >
        <div className="relative z-10 mx-auto flex max-w-[600px] flex-col items-center gap-3.5 px-5 text-center">
          <Badge>{features.badge}</Badge>
          <h2 className={SECTION_TITLE}>{features.title}</h2>
          <p className={SECTION_LEAD}>{features.lead}</p>
        </div>
        <div className="relative h-[calc(var(--u)*507)]" aria-hidden="true">
          <img
            src="/landing/images/home-mtb.webp"
            alt=""
            className="absolute top-[calc(var(--u)*-74)] left-[calc(50%-var(--u)*1235)] w-[calc(var(--u)*1257)] max-w-none"
          />
          <img
            src="/landing/images/home-moto.webp"
            alt=""
            className="absolute top-[calc(var(--u)*-123)] left-[calc(50%-var(--u)*37)] w-[calc(var(--u)*1230)] max-w-none"
          />
          <div className="landing-dots-white absolute top-[calc(var(--u)*37)] left-1/2 h-[calc(var(--u)*175)] w-[calc(var(--u)*218)] -translate-x-1/2 rounded-[calc(var(--u)*22)]" />
          <LandingWave />
        </div>
      </section>

      <section id="device" className="scroll-mt-4 bg-white px-5 pt-16 md:pt-24">
        <div className="mx-auto flex max-w-[1160px] flex-col items-center">
          <div className="flex max-w-[608px] flex-col items-center gap-3.5 text-center">
            <Badge>{device.badge}</Badge>
            <h2 className={SECTION_TITLE}>{device.title}</h2>
            <p className={SECTION_LEAD}>
              {device.lead1} {device.lead2}
            </p>
          </div>
          <LandingDevice3D
            imageAlt={device.imageAlt}
            hint={device.hint}
            disclaimer={device.disclaimer}
          />
        </div>
      </section>

      <LandingFAQ dict={faq} />
      <LandingFooter dict={dict.footer} />
    </div>
  );
}
