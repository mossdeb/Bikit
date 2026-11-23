"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bluetooth, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BikeBalanceArt, SAG_MINT } from "@/components/bike-balance-art";
import { SagBar } from "@/components/imu-sag-bar";
import { useProDict, useProLocale } from "@/components/pro-locale";
import {
  BikitPinForm,
  describeError,
  useBikitLink,
} from "@/components/use-bikit-link";
import { proNumber, proPercent } from "@/lib/i18n/pro";
import { AUTH_REQUIRED, BikitDeviceError } from "@/lib/bikit-ble/protocol";
import {
  isStale,
  keepRecent,
  steadySag,
  type LiveSagSample,
} from "@/lib/imu/live-sag";
import {
  linearSagAttitude,
  RIDER_ATTITUDE_TIE_DEG,
  shockRearDropMm,
} from "@/lib/imu/rider-sag";
import { sagPercent } from "@/lib/imu/setup";
import { cn } from "@/lib/utils";

/** What the popup reads from the setup's form: each end's travel and the
 * frame's geometry, null until typed. */
export interface LiveSagSetup {
  forkTravelMm: number | null;
  strokeMm: number | null;
  rearTravelMm: number | null;
  wheelbaseMm: number | null;
  headAngleDeg: number | null;
}

type Reading = { forkMm: number | null; shockMm: number | null };

/** How often the popup looks at the clock while live — for "stalled" and
 * "steady" to change without a new reading. */
const TICK_MS = 250;

/**
 * "Live SAG" (firmware V19.0.038; its own popup by request, 2026-11-23, the
 * supplied layout): the button on a bike's setup opens it and links to the
 * logger in the same click — the Bluetooth picker opens only from one. The
 * fork, the geometry and the shock follow the logger's stream (`SAG
 * START`): each end as its share of the travel, its mm and its wheel's
 * vertical drop, and the bike tilting by the two. "Guardar Leitura" puts
 * the last steady 2 s (steadySag) into the setup's SAG fields and closes;
 * "Fechar" closes and changes nothing. Either lets the logger go.
 *
 * `?simulate=1` on the page talks to the logger in software.
 */
export function LiveSagDialog({
  setup,
  BikeMark,
  labels,
  onSave,
}: {
  setup: LiveSagSetup;
  BikeMark: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** The cards' headings: the bike's own names for its dampers. */
  labels: { fork: string; shock: string };
  /** The steady reading, into the setup's SAG fields. */
  onSave: (reading: Reading) => void;
}) {
  const tl = useProDict().report.setup.form.liveSag;
  const simulate = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("simulate") === "1",
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  /** The stream's state, worked out where the samples are touched (a
   * reading, the clock) — never from the ref during render. */
  const [status, setStatus] = useState({ stale: false, steady: false });
  const samplesRef = useRef<LiveSagSample[]>([]);
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  function refresh(atMs: number) {
    const samples = samplesRef.current;
    setStatus({
      stale: isStale(samples, atMs),
      steady: steadySag(samples, atMs) != null,
    });
  }

  function reset() {
    stopRef.current = null;
    samplesRef.current = [];
    setLive(false);
    setStarting(false);
    setReading(null);
    setStatus({ stale: false, steady: false });
  }

  const link = useBikitLink({
    simulate,
    onAuthenticated: async (device) => {
      setStarting(true);
      samplesRef.current = [];
      try {
        const session = await device.startLiveSag(
          (r) => {
            const atMs = performance.now();
            samplesRef.current = keepRecent(
              [...samplesRef.current, { atMs, ...r }],
              atMs,
            );
            setReading(r);
            refresh(atMs);
          },
          (reason) => {
            // The logger ended it (a recording began, the calibration
            // went): say why and let it go.
            reset();
            link.disconnect();
            link.setError(reason);
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
    onLost: reset,
  });

  // The clock, while live: a stalled stream and a steady one both show
  // without a reading to trigger them.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => refresh(performance.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [live]);

  /** Opened from the button: the link starts in the same click. */
  function openAndConnect() {
    setOpen(true);
    void link.connect();
  }

  async function close() {
    const stopFn = stopRef.current;
    setOpen(false);
    reset();
    try {
      await stopFn?.();
    } catch {
      // The link may already be gone; letting it go below is the point.
    }
    link.disconnect();
    link.setError(null);
  }

  function save() {
    const steady = steadySag(samplesRef.current, performance.now());
    if (!steady) return;
    onSave(steady);
    void close();
  }

  if (!link.supported) return null;

  const { phase } = link;
  const busy =
    phase.kind === "connecting" || phase.kind === "authenticating" || starting;
  const message = link.error
    ? { text: link.error, bad: true }
    : busy
      ? {
          text:
            phase.kind === "connecting"
              ? tl.connecting
              : phase.kind === "authenticating"
                ? tl.authenticating
                : tl.starting,
          bad: false,
        }
      : live
        ? status.stale
          ? { text: tl.stale, bad: true }
          : { text: status.steady ? tl.steady : tl.settle, bad: false }
        : link.notice
          ? { text: link.notice, bad: false }
          : null;
  const shown = live ? reading : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-2 rounded-[14px] px-5"
        onClick={openAndConnect}
      >
        <Bluetooth className="size-4" aria-hidden />
        {tl.start}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) void close();
        }}
      >
        <DialogContent
          showClose={false}
          nested
          className="gap-0 p-0 sm:w-[calc(100%-2rem)] sm:max-w-[1264px] lg:w-[calc(100%-4rem)]"
        >
          {/* The supplied layout (2026-11-23): a white band with the mark
              and the title, "Fechar" on its right, over a rule. */}
          <div className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-6 sm:px-8">
            <div className="flex items-center gap-2.5">
              <Bluetooth className="size-7" strokeWidth={2.2} aria-hidden />
              <DialogTitle className="text-2xl font-bold">{tl.title}</DialogTitle>
            </div>
            <Button
              type="button"
              variant="inverted"
              className="h-10 rounded-full px-10"
              onClick={() => void close()}
            >
              {tl.close}
            </Button>
          </div>

          <div className="imu-event-band space-y-8 px-4 py-6 sm:px-8 sm:py-8">
            {/* The cards dim while the stream is stalled: the numbers are
                the last the logger sent, not now. */}
            <div
              className={cn(
                "grid gap-4 transition-opacity lg:grid-cols-3 lg:gap-6",
                live && status.stale && "opacity-50",
              )}
            >
              <EndCard
                heading={labels.fork}
                block="fork"
                sagMm={shown?.forkMm ?? null}
                travelMm={setup.forkTravelMm}
                dropMm={
                  shown?.forkMm != null && setup.headAngleDeg != null
                    ? shown.forkMm *
                      Math.sin((setup.headAngleDeg * Math.PI) / 180)
                    : null
                }
              />
              <GeometryCard setup={setup} reading={shown} BikeMark={BikeMark} />
              <EndCard
                heading={labels.shock}
                block="shock"
                sagMm={shown?.shockMm ?? null}
                travelMm={setup.strokeMm}
                dropMm={shockRearDropMm({
                  shockSagMm: shown?.shockMm ?? null,
                  strokeMm: setup.strokeMm,
                  rearTravelMm: setup.rearTravelMm,
                })}
              />
            </div>

            <div className="flex flex-col items-center gap-3">
              {phase.kind === "auth" && (
                <BikitPinForm
                  link={link}
                  idPrefix="live-sag"
                  className="w-full max-w-sm space-y-3"
                />
              )}
              {live ? (
                <Button
                  type="button"
                  variant="inverted"
                  className="h-10 w-full max-w-[376px] rounded-full"
                  disabled={!status.steady}
                  onClick={save}
                >
                  {tl.save}
                </Button>
              ) : (
                !busy &&
                phase.kind !== "auth" && (
                  // Not live and not on the way: the link failed or was
                  // refused — the same place offers it again.
                  <Button
                    type="button"
                    variant="inverted"
                    className="h-10 w-full max-w-[376px] gap-2 rounded-full"
                    onClick={() => void link.connect()}
                  >
                    <Bluetooth className="size-4" aria-hidden />
                    {tl.retry}
                  </Button>
                )
              )}
              {message && (
                <p
                  aria-live="polite"
                  className={cn(
                    "flex items-center gap-2 text-center text-sm",
                    message.bad ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {busy && (
                    <Loader2
                      className="size-4 shrink-0 motion-safe:animate-spin"
                      aria-hidden
                    />
                  )}
                  {live && !status.stale && (
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        status.steady
                          ? "bg-[#3DDC97]"
                          : "bg-[#D9FF00] motion-safe:animate-pulse",
                      )}
                    />
                  )}
                  {message.text}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A white card on the hatching, the supplied layout's. */
function Card({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-[22px] border border-border bg-card p-6 sm:p-[30px]">
      <p className="text-[22px] leading-none font-semibold">{heading}</p>
      {children}
    </div>
  );
}

/**
 * One end, the fork's or the shock's: the sag as a share of its travel,
 * large, with the mm under it; the bar; and how far its wheel sinks — the
 * fork's along the head angle, the shock's by the average leverage.
 */
function EndCard({
  heading,
  block,
  sagMm,
  travelMm,
  dropMm,
}: {
  heading: string;
  block: "fork" | "shock";
  sagMm: number | null;
  travelMm: number | null;
  dropMm: number | null;
}) {
  const t = useProDict().report.setup.form;
  const locale = useProLocale();
  const pct =
    sagMm != null
      ? sagPercent({ sagMm, travelMm: travelMm ?? undefined })
      : null;
  return (
    <Card heading={heading}>
      {/* 40 px either side of the bar (by request, 2026-11-23): the
          reading, the bar and the drop as three groups. */}
      <div className="mb-5 flex flex-col items-center text-center">
        {/* The label, the figure and its mm held close (by request,
            2026-11-23): one reading, not three lines. */}
        <p className="font-medium">SAG</p>
        <p className="mt-1 text-[60px] leading-none font-semibold tabular-nums">
          {pct != null ? proPercent(pct, locale) : "–"}
        </p>
        <p className="mt-1 font-bold tabular-nums">
          {sagMm != null ? `${proNumber(sagMm, locale, 1)} mm` : "–"}
        </p>
      </div>
      <SagBar
        percent={pct}
        block={block}
        caption={t.liveSag.ofTravel}
        className="mt-0"
      />
      <div className="mt-5 text-center">
        <p className="text-xs font-medium">{t.riderSag.displacement}</p>
        <p className="mt-2 text-[22px] leading-none tabular-nums">
          {dropMm != null ? `${proNumber(dropMm, locale, 0)} mm` : "–"}
        </p>
      </div>
    </Card>
  );
}

/**
 * The frame: the bike tilting by the two ends' drops, the wheelbase and
 * head angle it reads them with, and the pitch they make — with the head
 * angle as the rider's weight leaves it and which end sank more.
 */
function GeometryCard({
  setup,
  reading,
  BikeMark,
}: {
  setup: LiveSagSetup;
  reading: Reading | null;
  BikeMark: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  const t = useProDict().report.setup.form;
  const locale = useProLocale();
  const attitude = reading
    ? linearSagAttitude({
        forkSagMm: reading.forkMm,
        shockSagMm: reading.shockMm,
        strokeMm: setup.strokeMm,
        rearTravelMm: setup.rearTravelMm,
        wheelbaseMm: setup.wheelbaseMm,
        headAngleDeg: setup.headAngleDeg,
      })
    : null;
  const pitch = attitude?.pitchDeg ?? null;
  const signed = (deg: number) =>
    `${deg > 0 ? "+" : deg < 0 ? "−" : ""}${proNumber(Math.abs(deg), locale, 1)}°`;
  const diff = attitude ? attitude.rearMm - attitude.frontMm : null;
  const level = pitch != null && Math.abs(pitch) < RIDER_ATTITUDE_TIE_DEG;

  return (
    <Card heading={t.geometry}>
      <div className="flex justify-center">
        <BikeBalanceArt
          BikeMark={BikeMark}
          lines={
            attitude && setup.wheelbaseMm
              ? [
                  {
                    key: "live",
                    pitchDeg: attitude.pitchDeg,
                    drops: {
                      frontMm: attitude.frontMm,
                      rearMm: attitude.rearMm,
                      wheelbaseMm: setup.wheelbaseMm,
                    },
                    colour: SAG_MINT,
                    label: signed(attitude.pitchDeg),
                  },
                ]
              : []
          }
        />
      </div>
      <div className="grid grid-cols-2 text-center">
        <div>
          <p className="text-xs font-light">{t.wheelbase}</p>
          <p className="mt-1 font-medium tabular-nums">
            {setup.wheelbaseMm != null
              ? `${proNumber(setup.wheelbaseMm, locale, 0)} mm`
              : "–"}
          </p>
        </div>
        <div>
          <p className="text-xs font-light">{t.headAngle}</p>
          <p className="mt-1 font-medium tabular-nums">
            {setup.headAngleDeg != null
              ? `${proNumber(setup.headAngleDeg, locale, 1)}°`
              : "–"}
          </p>
        </div>
      </div>
      <div className="rounded-[12px] bg-muted/60 px-6 py-6">
        <div className="flex items-center justify-center gap-6">
          <p className="text-[42px] leading-none font-semibold whitespace-nowrap tabular-nums">
            {pitch != null ? signed(pitch) : "–"}
          </p>
          {/* The head angle as the rider's weight leaves it: the frame
              turns by the pitch and the fork with it. */}
          <div className="text-left">
            <p>{t.headAngle}</p>
            <p className="tabular-nums">
              {pitch != null && setup.headAngleDeg != null
                ? `${proNumber(setup.headAngleDeg - pitch, locale, 1)}°`
                : "–"}
            </p>
          </div>
        </div>
        <p className="mt-4 text-center text-xs font-medium tabular-nums">
          {diff == null
            ? reading
              ? t.liveSag.needsNumbers
              : "–"
            : level
              ? t.riderSag.same
              : `${proNumber(Math.abs(diff), locale, 0)} mm ${
                  diff > 0 ? t.riderSag.deeperRear : t.riderSag.deeperFront
                }`}
        </p>
      </div>
    </Card>
  );
}
