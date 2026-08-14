"use client";

import { useCallback, useState, useTransition } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { RideIntensityChip } from "@/components/ride-intensity-visuals";
import type { RideIntensityBand } from "@/lib/ride-stress";

/**
 * What Ride Load is, before the reader is asked to believe a number.
 *
 * The report opens on a score with no units and a band with no definition,
 * and nothing else on the page explains why two rides of the same distance
 * score differently. This is that explanation, once on arrival and then on
 * demand from the foot of the page.
 *
 * Deliberately dumb: every string arrives translated from the server, so no
 * dictionary crosses into the client bundle — the same contract the install
 * prompt and the interval popover keep.
 */
export interface RideLoadIntroLabels {
  title: string;
  tagline: string;
  lead: string;
  recentTitle: string;
  recentPoints: string[];
  lifetimeTitle: string;
  lifetimePoints: string[];
  closing: string;
  gotIt: string;
  /** The four band names, in order, for the sample chips. */
  bands: Record<RideIntensityBand, string>;
}

const BAND_ORDER: RideIntensityBand[] = ["light", "moderate", "high", "extreme"];

function IntroCard({ labels, onDismiss }: { labels: RideLoadIntroLabels; onDismiss: () => void }) {
  return (
    <>
      <DialogPrimitive.Title className="text-center font-display text-[28px] leading-tight font-bold">
        {labels.title}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-2 text-center text-base font-semibold">
        {labels.tagline}
      </DialogPrimitive.Description>

      {/* The four bands, as they appear on the page itself. Showing them here
          is the whole reason the chips are a shared component: a legend drawn
          separately would be a second thing to keep in step. */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {BAND_ORDER.map((band) => (
          <RideIntensityChip key={band} band={band} label={labels.bands[band]} className="px-2 py-1 text-[11px]" />
        ))}
      </div>

      <p className="mt-6 text-center text-sm leading-relaxed">{labels.lead}</p>

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

      <p className="mt-6 rounded-[12px] bg-muted px-4 py-3 text-center text-sm">{labels.closing}</p>

      <Button type="button" variant="inverted" size="lg" className="mt-6 w-full" onClick={onDismiss}>
        {labels.gotIt}
      </Button>
    </>
  );
}

const POPUP_CLASS =
  "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-40px)] w-[calc(100%-40px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-card p-6 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

const BACKDROP_CLASS =
  "fixed inset-0 isolate z-50 bg-black/40 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0";

/** The one-shot, on the first visit to a bike's report. */
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
