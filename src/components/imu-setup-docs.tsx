"use client";

import type { ComponentType } from "react";
import { Activity } from "lucide-react";
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
import {
  ChassisBandIcon,
  ChatterBandIcon,
  HarshnessIcon,
  ImpactIcon,
  RetentionIcon,
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
  rms: ({ className }) => (
    <Activity className={className} strokeWidth={1.75} aria-hidden />
  ),
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
        // The comparison popup's frame: nearly the whole window, the
        // whole screen on a phone, one scroller. White, not the lab's
        // ground — this is a page of text, not a page of cards.
        className="h-dvh max-h-none w-screen max-w-none grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-none p-0 ring-0 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-none sm:rounded-lg sm:ring-1"
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
                <article key={entry.key} className="max-w-[440px]">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
