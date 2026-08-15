"use client";

import { useCallback, useState, useTransition } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { BikeIcon } from "@/components/bike-icon";
import { INTENSITY_FILL_CLASS } from "@/components/ride-intensity-visuals";
import { ElevationGlyph, LifetimeLoadGlyph, RideLoadGlyph } from "@/components/ride-load-icons";
import { cn } from "@/lib/utils";
import type { RideIntensityBand } from "@/lib/ride-stress";

/**
 * What Ride Load is, before the reader is asked to believe a number.
 *
 * The report opens on a score with no units and a band with no definition, and
 * nothing else on the page explains why two rides of the same distance score
 * differently. So the card answers that with the case itself: two 20 km rides,
 * side by side, scoring three times apart.
 *
 * The two examples are scored by the real function on the server, not written
 * down here — a worked example that the app would contradict teaches the wrong
 * thing, and the reader can check it against their own rides. Re-tune the
 * reference values and this card re-tunes with them.
 *
 * Deliberately dumb otherwise: every string arrives translated, so no
 * dictionary crosses into the client bundle.
 */
export interface RideLoadExample {
  /** A BIKE_TYPES entry — picks the drawing and named the modality that
   * scored it. */
  bikeType: string;
  bikeLabel: string;
  distance: string;
  elevation: string;
  score: string;
  band: RideIntensityBand;
  bandLabel: string;
}

export interface RideLoadIntroLabels {
  title: string;
  tagline: string;
  vs: string;
  compareLead: string;
  compareEmphasis: string;
  recentTitle: string;
  recentPoint: string;
  lifetimeTitle: string;
  lifetimePoint: string;
  gotIt: string;
  examples: RideLoadExample[];
}

function ExampleCard({ example }: { example: RideLoadExample }) {
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-[14px] border border-border">
      <p className="px-2 py-2 text-center text-base font-bold">
        {example.distance.replace(/\s?(km|mi)$/, "")}{" "}
        <span className="text-sm font-medium text-muted-foreground">{example.distance.match(/km|mi/)?.[0]}</span>
      </p>
      <div className="bg-muted px-2 py-2.5">
        <div className="flex items-center justify-center gap-1.5">
          {/* Width only, height from the viewBox. The bike glyphs are wide
              (101 across, 55 to 104 tall) and pinned to the bottom of their
              box by `xMidYMax`, which is what puts them all on one ground
              line in a column. In a square box beside two lines of text that
              left a third of the box empty above the drawing, and the bike
              sat 7px below the label it belongs to. A box the height of the
              drawing centres what the eye actually sees. */}
          <BikeIcon type={example.bikeType} plain className="h-auto w-9" />
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight font-bold">{example.bikeLabel}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {example.elevation}
              <ElevationGlyph />
            </span>
          </span>
        </div>
        <p
          className={cn(
            "mt-2 flex items-center justify-center gap-1 rounded-[8px] px-2 py-1 text-sm font-bold",
            INTENSITY_FILL_CLASS[example.band]
          )}
        >
          <RideLoadGlyph className="size-3.5" />
          {example.score}
          <span className="text-xs font-medium">[{example.bandLabel}]</span>
        </p>
      </div>
    </div>
  );
}

function IntroCard({ labels, onDismiss }: { labels: RideLoadIntroLabels; onDismiss: () => void }) {
  return (
    <>
      <DialogPrimitive.Title className="text-center font-display text-[28px] leading-tight font-bold">
        {labels.title}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-0 text-center text-base">{labels.tagline}</DialogPrimitive.Description>

      {/* 38px between the card's three groups — the header, the worked
          example, the definitions — against 0 to 16 inside them. The
          separation is what says "this is a different thing", and with the
          two distances close the three groups read as one long column. */}
      <div className="mt-[38px] flex items-stretch gap-2">
        <ExampleCard example={labels.examples[0]} />
        <span className="shrink-0 self-center text-xs font-semibold text-muted-foreground">{labels.vs}</span>
        <ExampleCard example={labels.examples[1]} />
      </div>

      <p className="mt-4 rounded-[12px] bg-muted px-4 py-3 text-center text-sm">
        {labels.compareLead} · <strong className="font-bold">{labels.compareEmphasis}</strong>
      </p>

      <section className="mt-[38px]">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <RideLoadGlyph className="size-[18px]" />
          {labels.recentTitle}
        </h3>
        <p className="mt-1.5 text-sm leading-snug">{labels.recentPoint}</p>
      </section>

      <section className="mt-5">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <LifetimeLoadGlyph className="size-[18px]" />
          {labels.lifetimeTitle}
        </h3>
        <p className="mt-1.5 text-sm leading-snug">{labels.lifetimePoint}</p>
      </section>

      <Button type="button" variant="inverted" size="lg" className="mt-7 w-full" onClick={onDismiss}>
        {labels.gotIt}
      </Button>
    </>
  );
}

const POPUP_CLASS =
  "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-40px)] w-[calc(100%-40px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-card p-6 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

const BACKDROP_CLASS =
  "fixed inset-0 isolate z-50 bg-black/40 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0";

/** The one-shot, on the first report anyone opens. */
export function RideLoadIntroDialog({
  labels,
  action,
}: {
  labels: RideLoadIntroLabels;
  action: () => Promise<void>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  const dismiss = useCallback(() => {
    // Closed on the spot, recorded in the background: the flag only has to
    // survive the next visit, and awaiting it would hold the dialog open over
    // a round trip for nobody's benefit.
    setDismissed(true);
    startTransition(async () => {
      await action();
    });
  }, [action]);

  return (
    <DialogPrimitive.Root
      open={!dismissed}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={BACKDROP_CLASS} />
        <DialogPrimitive.Popup className={POPUP_CLASS}>
          <IntroCard labels={labels} onDismiss={dismiss} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The same card on demand, from the foot of the report. Records nothing:
 * asking how something works is not the same as having been interrupted by
 * the answer, and a reader who opens it twice should get it twice.
 */
export function RideLoadHowItWorksButton({
  labels,
  buttonLabel,
}: {
  labels: RideLoadIntroLabels;
  buttonLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        render={
          <Button type="button" variant="outline" size="sm" className="bg-transparent">
            {buttonLabel}
          </Button>
        }
      />
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={BACKDROP_CLASS} />
        <DialogPrimitive.Popup className={POPUP_CLASS}>
          <IntroCard labels={labels} onDismiss={() => setOpen(false)} />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
