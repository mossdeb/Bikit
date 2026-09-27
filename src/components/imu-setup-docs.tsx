"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_HOVER } from "@/lib/card-styles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProDict } from "@/components/pro-locale";
import type { CompareDocEntry } from "@/lib/i18n/pro/compare";
import { ImuDocGlyph } from "@/components/imu-pro-logo";
import { DYNAMICS_AXES, DYNAMICS_NOISE_SPAN } from "@/lib/imu/setup-dynamics";
import type { DynamicsAxisKey } from "@/lib/imu/setup-dynamics";
import {
  AbsorptionAxisIcon,
  ControlAxisIcon,
  RecoveryAxisIcon,
  SupportAxisIcon,
  ChassisBandIcon,
  ChatterBandIcon,
  HarshnessIcon,
  ImpactIcon,
  RetentionIcon,
  RmsIcon,
  SettleIcon,
  SpeedGaugeIcon,
} from "@/components/imu-setup-icons";

/**
 * "Documentação" on the setups page's header (by request, 2026-09-24,
 * from a supplied layout): a popup, nearly the whole window like the
 * comparison's, with every concept the table and the dynamics use
 * explained once — the question each figure answers, how it is read,
 * and which way is better. The words are the dictionary's
 * (`compare.docs`); the marks are the table's own, so a figure looks
 * the same here as over its column.
 *
 * The layout draws a second tile beside each mark, a bike in the
 * situation the figure describes; those drawings do not exist yet, so
 * each concept carries its mark alone.
 */

const MARKS: Record<
  CompareDocEntry["key"],
  ComponentType<{ className?: string }>
> = {
  harshness: HarshnessIcon,
  chassis: ChassisBandIcon,
  chatter: ChatterBandIcon,
  settle: SettleIcon,
  impacts: ImpactIcon,
  speed: SpeedGaugeIcon,
  retention: RetentionIcon,
  // RMS has no column, so no mark of its own: a trace stands for it.
  rms: RmsIcon,
};

/** The dynamics' four axes, with the marks their boxes wear (by request,
 * 2026-09-27: a "Dinâmica" section under the concepts). The recovery
 * mark is wider than tall, so it is drawn a step lower, as on its box. */
const AXIS_MARKS: Record<
  DynamicsAxisKey,
  { Icon: ComponentType<{ className?: string }>; className: string }
> = {
  absorption: { Icon: AbsorptionAxisIcon, className: "h-12" },
  control: { Icon: ControlAxisIcon, className: "h-12" },
  support: { Icon: SupportAxisIcon, className: "h-12" },
  recovery: { Icon: RecoveryAxisIcon, className: "h-9" },
};

export function ImuSetupDocs() {
  const t = useProDict();
  const words = t.compare.docs;
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "inline-flex h-[50px] shrink-0 items-center gap-3.5 rounded-[18px] border border-border bg-card px-5 leading-5 font-semibold text-foreground",
          CLICKABLE_CARD_HOVER,
        )}
      >
        <ImuDocGlyph className="h-auto w-[18px] text-foreground [&_path]:[stroke-width:2.1]" />
        {words.button}
      </DialogTrigger>
      <DialogContent
        // The backdrop leaves with the popup, at its 250 ms.
        overlayClassName="data-closed:duration-250"
        // The comparison popup's frame: nearly the whole window, the
        // whole screen on a phone, one scroller. White, not the lab's
        // ground — this is a page of text, not a page of cards.
        //
        // It rises into place from below (by request, 2026-09-27): 48 px
        // over 400 ms on an ease-out that starts quick and lands soft,
        // with the fade but no zoom (the shared dialog's 95 % → 100 %,
        // taken off by request); closing sinks back the same way, a little
        // quicker.
        className="h-dvh max-h-none w-screen max-w-none grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-none p-0 ring-0 duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] data-open:slide-in-from-bottom-[48px] data-open:zoom-in-100! data-closed:duration-250 data-closed:slide-out-to-bottom-[48px] data-closed:zoom-out-100! sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] lg:h-[calc(100dvh-4rem)] lg:max-h-[calc(100dvh-4rem)] lg:w-[calc(100%-4rem)] sm:max-w-none sm:rounded-lg sm:ring-1"
      >
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-6 sm:px-10 sm:py-10">
          <ImuDocGlyph className="h-auto w-[28px] text-foreground" />
          {/* The pages' heading (2026-09-25, the setups page's): 32 px
              bold, 26 px apart. */}
          <DialogTitle className="mt-7 font-display text-[32px] leading-8 font-bold tracking-[-0.6px]">
            {words.title}
          </DialogTitle>
          <DialogDescription className="mt-[26px] text-sm text-muted-foreground">
            {words.subtitle}
          </DialogDescription>

          <div className="mt-8 grid gap-x-10 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
            {words.entries.map((entry) => {
              const Mark = MARKS[entry.key];
              return (
                // `doc-concept`: its mark animates while the mouse is
                // over the concept (globals.css, with the table's).
                <article key={entry.key} className="doc-concept max-w-[440px]">
                  <div className="flex size-[104px] items-center justify-center rounded-[14px] border border-border bg-muted/40">
                    <Mark className="size-12 text-foreground" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">{entry.title}</h3>
                  <div className="mt-1 space-y-3 text-sm leading-relaxed text-foreground/80">
                    {entry.paragraphs.map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                    {entry.verdict && (
                      <p>
                        <strong className="font-semibold text-foreground">
                          {entry.verdict.lead}
                        </strong>{" "}
                        {entry.verdict.text}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* "Dinâmica" (2026-09-27): the four axes of the dynamics card,
              in the concepts' own form — mark, name, what it reads, what
              it is made of, and what moves it. Every word is the one the
              page already uses (`compare.dynamics`, `compare.axes`), so
              the documentation and the card cannot drift apart. */}
          <section className="mt-16">
            <h2 className="text-2xl leading-tight font-semibold">
              {t.compare.dynamics.title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t.compare.dynamics.subtitle}
            </p>
            <div className="mt-4 max-w-[920px] space-y-2 text-sm leading-relaxed text-foreground/80">
              <p>{t.compare.dynamics.scale(DYNAMICS_NOISE_SPAN)}</p>
              <p>{t.compare.metricInfo.tuningNote}</p>
            </div>
            <div className="mt-8 grid gap-x-10 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
              {DYNAMICS_AXES.map((axis) => {
                const axisWords = t.compare.axes[axis.key];
                const mark = AXIS_MARKS[axis.key];
                return (
                  <article key={axis.key} className="doc-concept max-w-[440px]">
                    <div className="flex size-[104px] items-center justify-center rounded-[14px] border border-border bg-muted/40">
                      <mark.Icon
                        className={cn(mark.className, "text-foreground")}
                      />
                    </div>
                    <h3 className="mt-3 text-sm font-semibold">
                      {axisWords.name}
                    </h3>
                    <div className="mt-1 space-y-3 text-sm leading-relaxed text-foreground/80">
                      <p>{axisWords.description}.</p>
                      <p>{axisWords.parts}.</p>
                      <div>
                        <p className="font-semibold text-foreground">
                          {t.compare.metricInfo.tuning}
                        </p>
                        <ul className="mt-1.5 space-y-1.5">
                          {axisWords.tuning.map((item) => (
                            <li key={item.knob}>
                              <span className="text-foreground">
                                {item.knob}:
                              </span>{" "}
                              {item.effect}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
