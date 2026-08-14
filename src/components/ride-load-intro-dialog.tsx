"use client";

import { useCallback, useState, useTransition } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { BikeIcon } from "@/components/bike-icon";
import { INTENSITY_FILL_CLASS } from "@/components/ride-intensity-visuals";
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
  duration: string;
  score: string;
  band: RideIntensityBand;
  bandLabel: string;
}

export interface RideLoadIntroLabels {
  title: string;
  tagline: string;
  vs: string;
  rideLoadLabel: string;
  compareLead: string;
  compareEmphasis: string;
  recentTitle: string;
  recentPoints: string[];
  lifetimeTitle: string;
  lifetimePoints: string[];
  gotIt: string;
  examples: RideLoadExample[];
}

function ExampleCard({ example, rideLoadLabel }: { example: RideLoadExample; rideLoadLabel: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="overflow-hidden rounded-[12px] border border-border">
        <p className="border-b border-border bg-muted px-3 py-2 text-center text-sm font-bold">{example.distance}</p>
        <div className="flex items-center justify-center gap-2 px-3 py-3">
          <BikeIcon type={example.bikeType} plain className="size-9" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{example.bikeLabel}</span>
            {/* The climb and the clock, because the score cannot be checked
                from the distance alone and an example nobody can check is a
                claim rather than a demonstration. */}
            <span className="block text-xs text-muted-foreground">
              {example.elevation} · {example.duration}
            </span>
          </span>
        </div>
      </div>
      <p
        className={cn(
          "-mt-2 mx-auto w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold",
          INTENSITY_FILL_CLASS[example.band]
        )}
      >
        {rideLoadLabel} {example.score} · {example.bandLabel}
      </p>
    </div>
  );
}

function IntroCard({ labels, onDismiss }: { labels: RideLoadIntroLabels; onDismiss: () => void }) {
  return (
    <>
      <DialogPrimitive.Title className="text-center font-display text-[28px] leading-tight font-bold">
        {labels.title}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-2 text-center text-base">{labels.tagline}</DialogPrimitive.Description>

      <div className="mt-6 flex items-center gap-2">
        <ExampleCard example={labels.examples[0]} rideLoadLabel={labels.rideLoadLabel} />
        <span className="shrink-0 self-center text-xs font-semibold text-muted-foreground">{labels.vs}</span>
        <ExampleCard example={labels.examples[1]} rideLoadLabel={labels.rideLoadLabel} />
      </div>

      <p className="mt-5 rounded-[12px] bg-muted px-4 py-3 text-center text-sm">
        {labels.compareLead} <strong className="font-bold">{labels.compareEmphasis}</strong>
      </p>

      <section className="mt-6">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <span aria-hidden>⚡</span>
          {labels.recentTitle}
        </h3>
        <ul className="mt-2 space-y-1.5">
          {labels.recentPoints.map((point) => (
            <li key={point} className="flex gap-2 text-sm leading-snug">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span className="min-w-0">{point}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <span aria-hidden>📈</span>
          {labels.lifetimeTitle}
        </h3>
        <ul className="mt-2 space-y-1.5">
          {labels.lifetimePoints.map((point) => (
            <li key={point} className="flex gap-2 text-sm leading-snug">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span className="min-w-0">{point}</span>
            </li>
          ))}
        </ul>
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
