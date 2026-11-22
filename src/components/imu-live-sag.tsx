"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bluetooth, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProDict } from "@/components/pro-locale";
import {
  BikitPinForm,
  describeError,
  useBikitLink,
} from "@/components/use-bikit-link";
import { AUTH_REQUIRED, BikitDeviceError } from "@/lib/bikit-ble/protocol";
import { cn } from "@/lib/utils";
import {
  isStale,
  keepRecent,
  steadySag,
  type LiveSagSample,
} from "@/lib/imu/live-sag";

/** What the form shows while the logger streams: each end's compression,
 * mm (null: the logger sends NA for it), and whether the stream stalled. */
export interface LiveSagView {
  forkMm: number | null;
  shockMm: number | null;
  stale: boolean;
}

/** How often the panel looks at the clock while live — for "stalled" and
 * "steady" to change without a new reading. */
const TICK_MS = 250;

/**
 * The setup's "Live SAG" (firmware V19.0.038, by request 2026-11-22): link
 * to the logger, `SAG START`, and the fork's and shock's compression stream
 * into the form's SAG fields — held while live — until "Save reading" puts
 * the last steady 2 s into them (steadySag) and lets the logger go. The
 * setup's own Save then keeps them, as with anything typed.
 *
 * Stop, Cancel or closing the dialog end it without touching the fields.
 * `?simulate=1` on the page talks to the logger in software.
 */
export function LiveSagControl({
  onView,
  onSave,
}: {
  /** The reading to show, or null when not live. */
  onView: (view: LiveSagView | null) => void;
  /** The steady reading to keep. */
  onSave: (reading: { forkMm: number | null; shockMm: number | null }) => void;
}) {
  const t = useProDict().report.setup.form.liveSag;
  const simulate = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("simulate") === "1",
    () => false,
  );
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  /** The stream's state, worked out where the samples are touched (a
   * reading, the clock) — never from the ref during render. */
  const [status, setStatus] = useState({ stale: false, steady: false });
  const samplesRef = useRef<LiveSagSample[]>([]);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const onViewRef = useRef(onView);
  useEffect(() => {
    onViewRef.current = onView;
  });

  function refresh(atMs: number) {
    const samples = samplesRef.current;
    setStatus({
      stale: isStale(samples, atMs),
      steady: steadySag(samples, atMs) != null,
    });
  }

  function end() {
    stopRef.current = null;
    samplesRef.current = [];
    setStatus({ stale: false, steady: false });
    setLive(false);
    setStarting(false);
    onViewRef.current(null);
  }

  const link = useBikitLink({
    simulate,
    onAuthenticated: async (device) => {
      setStarting(true);
      samplesRef.current = [];
      try {
        const session = await device.startLiveSag(
          (reading) => {
            const atMs = performance.now();
            samplesRef.current = keepRecent(
              [...samplesRef.current, { atMs, ...reading }],
              atMs,
            );
            refresh(atMs);
            onViewRef.current({ ...reading, stale: false });
          },
          (reason) => {
            // The logger ended it (a recording began, the calibration
            // went): say why and let it go.
            link.setError(reason);
            end();
            link.disconnect();
          },
        );
        stopRef.current = session.stop;
        setLive(true);
      } catch (e) {
        // The PIN form answers AUTH_REQUIRED; any other refusal
        // (SAG_NO_CAL, SAG_BUSY…) is said, and the logger let go — a link
        // held for nothing keeps it from recording.
        if (e instanceof BikitDeviceError && e.raw === AUTH_REQUIRED) throw e;
        link.disconnect();
        link.setError(describeError(e));
      } finally {
        setStarting(false);
      }
    },
    onLost: end,
  });

  // The clock, while live: a stalled stream and a steady one both show
  // without a reading to trigger them.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      const at = performance.now();
      refresh(at);
      const last = samplesRef.current[samplesRef.current.length - 1];
      if (last && isStale(samplesRef.current, at))
        onViewRef.current({
          forkMm: last.forkMm,
          shockMm: last.shockMm,
          stale: true,
        });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [live]);

  // Closing the dialog unmounts this: the hook lets the logger go (which
  // ends its stream too), and the form stops showing a live reading.
  useEffect(() => () => onViewRef.current(null), []);

  async function stop() {
    const stopFn = stopRef.current;
    end();
    try {
      await stopFn?.();
    } catch {
      // The link may already be gone; letting it go below is the point.
    }
    link.disconnect();
  }

  function save() {
    const reading = steadySag(samplesRef.current, performance.now());
    if (!reading) return;
    onSave(reading);
    void stop();
  }

  if (!link.supported) return null;

  const stale = live && status.stale;
  const steady = live && status.steady;
  const { phase } = link;
  const busy =
    phase.kind === "connecting" ||
    phase.kind === "authenticating" ||
    starting;

  return (
    <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
      {!live && !busy && phase.kind !== "auth" && (
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-2 rounded-[14px] px-5"
          onClick={() => void link.connect()}
        >
          <Bluetooth className="size-4" aria-hidden />
          {t.start}
        </Button>
      )}

      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden />
          {phase.kind === "connecting"
            ? t.connecting
            : phase.kind === "authenticating"
              ? t.authenticating
              : t.starting}
        </p>
      )}

      {phase.kind === "auth" && (
        <div className="w-full space-y-2 sm:w-72">
          <BikitPinForm link={link} idPrefix="live-sag" className="space-y-3" />
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => link.disconnect()}
          >
            {t.cancel}
          </Button>
        </div>
      )}

      {live && (
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span
                aria-hidden
                className={cn(
                  "size-2.5 rounded-full",
                  stale
                    ? "bg-[#FFC711]"
                    : "bg-[#D9FF00] motion-safe:animate-pulse",
                )}
              />
              {t.live}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-full px-4"
              onClick={() => void stop()}
            >
              {t.stop}
            </Button>
            <Button
              type="button"
              variant="inverted"
              className="h-9 rounded-full px-4"
              disabled={!steady}
              onClick={save}
            >
              {t.save}
            </Button>
          </div>
          <p
            className={cn(
              "text-xs",
              stale ? "text-destructive" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {stale ? t.stale : steady ? t.steady : t.settle}
          </p>
        </div>
      )}

      {link.notice && !live && (
        <p className="text-xs text-muted-foreground">{link.notice}</p>
      )}
      {link.error && (
        <p className="max-w-xs text-right text-xs text-destructive">
          {link.error}
        </p>
      )}
    </div>
  );
}

