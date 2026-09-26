"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Activity,
  Bike,
  Check,
  ChevronDown,
  Gauge,
  Info,
  Minus,
  Plus,
  Route,
  Scissors,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Undo2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE, DARK_CARD_HAIRLINE_SM } from "@/lib/card-styles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BrakingIcon,
  CurveLeftIcon,
  CurveRightIcon,
  DropIcon,
  ImuClockIcon,
  JumpIcon,
  RoughSectionIcon,
} from "@/components/imu-event-icons";
import { loadImuSession, useImuSession } from "@/lib/imu/use-imu-session";
import type { ImuSessionTrim } from "@/lib/imu/trim";
import { ImuSessionTrimDialog } from "@/components/imu-session-trim";
import { prepareSnapshotSession, snapshotKindOf } from "@/lib/imu/snapshot";
import {
  ImuSnapshotCreate,
  type ImuSnapshotTwin,
} from "@/components/imu-snapshot-create";
import type { ImuSnapshotSessionLoader } from "@/components/imu-snapshot-view";
import type {
  GpsChannels,
  ImuEvent,
  ImuHighGEvent,
  ImuMountOrientation,
  ImuSessionData,
} from "@/lib/imu/format";
import { HIGHG_LINK_MS, highGNear, highGWidthMs } from "@/lib/imu/highg";
import {
  altitudeMSeries,
  centredMeanSeries,
  corneringGSeries,
  EVENT_REACH_MS,
  INSTANT_WINDOW_MS,
  eventsNear,
  formatSessionTime,
  gForceOf,
  gpsDistance,
  gpsMeanSpeed,
  gpsPeakSpeed,
  gpsSpeedAt,
  impactEnergy,
  impactSeverityIndex,
  jerkSeries,
  leanSeries,
  nearestSampleIndex,
  pitchSeries,
  roughnessSeries,
  sessionSummary,
  curveMomentum,
  fusedSpeedKmhSeries,
  windowMeanAbs,
  windowPeak,
  windowRange,
  windowRms,
} from "@/lib/imu/derive";
import { ImuChart, type ImuChartSeries } from "@/components/imu-chart";
import { ImuSessionDashboard } from "@/components/imu-session-dashboard";
import { ImuSessionMap } from "@/components/imu-session-map";
import { ImuChartGlyph } from "@/components/imu-pro-logo";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { proNumber, type ProDictionary } from "@/lib/i18n/pro";
import type { Locale } from "@/lib/i18n";
import {
  StatClockIcon,
  StatImpactIcon,
  StatJumpIcon,
  StatLeanAngleIcon,
  StatMetricIcon,
  StatRadiusIcon,
  StatStopwatchIcon,
  StatTurnIcon,
} from "@/components/imu-stat-icons";

/**
 * Series the chart can draw. A future metric (roughness, lateral G, …) is one
 * more entry here plus a `values` provider below — the raw channels are never
 * touched. Colors are a lab palette, fixed in both themes, deliberately not
 * the health nor the Ride Load vocabularies.
 *
 * The words — the pill's name, the two-word summary under it and the
 * sentence behind the (i) — are not here: they live in the Pro dictionary
 * under `analysis.series`, keyed by the same id, and the component joins
 * them on at render (LabelledSeriesDef) in the reader's language.
 */
const SERIES_DEFS = [
  { id: "gforce", unit: "G", color: "#2563EB" },
  { id: "ax", unit: "g", color: "#0D9488" },
  { id: "ay", unit: "g", color: "#16A34A" },
  { id: "az", unit: "g", color: "#0891B2" },
  { id: "gx", unit: "°/s", color: "#9333EA" },
  { id: "gy", unit: "°/s", color: "#C026D3" },
  { id: "gz", unit: "°/s", color: "#EA580C" },
  { id: "roughness", unit: "G RMS", color: "#D97706" },
  { id: "jerk", unit: "G/s", color: "#DB2777" },
  { id: "lean", unit: "°", color: "#475569" },
  /** Only offered when the file carries a GPS track — the recorded speed,
   * with the forward accelerometer drawing the shape between fixes once the
   * bike's forward is known (fusedSpeedKmhSeries); a straight line between
   * fixes until then. */
  { id: "speed", unit: "km/h", color: "#65A30D" },
  /** GPS-only as well: the receiver's own altitude, resampled. */
  { id: "altitude", unit: "m", color: "#92400E" },
] as const;

type SeriesId = (typeof SERIES_DEFS)[number]["id"];

/** A series definition with its words joined on from the dictionary — what
 * every consumer below reads, so a label is never looked up twice. */
type LabelledSeriesDef = (typeof SERIES_DEFS)[number] & {
  label: string;
  summary: string;
  description: string;
};

/** The series computed from the raw channels rather than recorded by the
 * sensor — listed apart in the details panel, never under "Dados brutos". */
const DERIVED_IDS = new Set<SeriesId>(["roughness", "jerk", "lean"]);

/** The series that cannot go below zero — magnitudes, an RMS, a ground
 * speed, an altitude above sea level. Their gauge starts at the left of the
 * positive half; every other channel is signed and gets a gauge with zero
 * in the middle, because for those the sign is the direction and a bar that
 * hid it would say the wrong thing. */
const UNSIGNED_IDS = new Set<SeriesId>([
  "gforce",
  "roughness",
  "speed",
  "altitude",
]);

/** The series that only exist when the file carries a GPS track. Without
 * one they stay listed but disabled — the promise the Velocidade pill has
 * made since before speed existed. */
const GPS_SERIES_IDS = new Set<SeriesId>(["speed", "altitude"]);

/** The event kinds with a switch on the events menu. Their names come from
 * the dictionary (`analysis.kinds`, keyed by the kind) at render. */
const EVENT_KIND_DEFS = [
  { kind: "curve", Icon: CurveRightIcon },
  { kind: "jump", Icon: JumpIcon },
  // No "Drops" entry: the detector calls every flight a jump (the pre-load
  // heuristic mislabelled real jumps on 2026-09-09), and a file that
  // brings its own drops still draws them — they just have no switch.
  { kind: "impact", Icon: Zap },
  { kind: "rough_section", Icon: RoughSectionIcon },
  { kind: "braking", Icon: BrakingIcon },
  // Lucide's warning triangle until there is art of its own (2026-09-26).
  { kind: "crash", Icon: TriangleAlert },
] as const;

/** The high-g sensor's shocks (firmware V15) as a kind of their own on the
 * events menu — listed only on a file that has the sensor. Not an ImuEvent:
 * the app detects those from the main IMU's trace, and these are the other
 * sensor's own record of a hit, often of the same one. */
/** How many other sessions the comparison keeps read, at ~5 MB each. */
const SNAPSHOT_CACHE_MAX = 12;

const HIGHG_KIND = "highg";
const HIGHG_KIND_DEF = {
  kind: HIGHG_KIND,
  Icon: Activity,
} as const;

/** Which event owns the headline when several cover the same instant — the
 * pointiest wins (an impact inside a rough section reads as the impact). */
const EVENT_PRIORITY: Record<ImuEvent["kind"], number> = {
  // A crash owns every instant it covers: the impacts and corners inside a
  // fall are the fall.
  crash: -1,
  jump: 0,
  drop: 0,
  impact: 1,
  curve: 2,
  braking: 3,
  rough_section: 4,
};

/** A crash's deceleration ends here: under this the bike is practically
 * stopped, and what is left is the receiver settling. */
const CRASH_STOPPED_KMH = 5;

/** How much room the speedometer keeps above the session's own top speed,
 * km/h.
 *
 * The dial used to end at a fixed 60 — chosen so a needle position meant the
 * same thing on every ride — and now ends at this session's fastest plus
 * this. The trade is deliberate: readings are no longer comparable between
 * recordings, but a ride that never passes 20 km/h stops living in the first
 * third of the dial. The headroom is what keeps the fastest instant off the
 * end stop, so the needle still reads as having somewhere left to go. */
const DASH_SPEED_HEADROOM_KMH = 20;

/** The desktop split between the chart and the map: the map column's width,
 * in px, adjustable by the handle on their shared edge. Per session, not
 * stored — a framing choice, like the zoom window. */
const MAP_DEFAULT_W = 300;
const MAP_MIN_W = 220;
/** The map card's height below `lg`, where it is stacked under the plot and
 * the edge that moves is its bottom. 280 is the card as it has been; 160
 * still shows a track; 640 is a phone screen's worth. */
const MAP_DEFAULT_H = 280;
const MAP_MIN_H = 160;
const MAP_MAX_H = 640;
/** What the chart may never be squeezed below — the plot is the one thing
 * this page exists to show, so the map is the side that gives. */
const CHART_MIN_W = 420;
/** The Rider column's width and the channel between columns, exactly as the
 * grid templates below spell them. Repeated here as numbers because Tailwind
 * only generates classes it can read literally, so those templates cannot be
 * built from these — the two have to be changed together, and this note is
 * the only thing linking them. */
const DASH_COL_W = 300;
const COL_GAP = 22;

/** The narrowest either half of the reading may be dragged to, px — and, by
 * the same number, the narrowest a card in it is allowed to be laid out at.
 * One constant for the two because they are the same fact: below this the
 * figure and its gauge stop sharing a line, so it is both the floor of the
 * split and the `auto-fill` threshold that decides one sub-column or two.
 * The threshold is spelled again in the grid classes below — Tailwind only
 * generates what it can read literally, so the two have to move together. */
const READ_MIN_W = 320;
/** Below this the ride's vote on "forward" is shown but not applied: a
 * rotation by a guess would move the braking figure onto the wrong axis
 * with more authority than the guess deserves. */

/** How narrow a half may be dragged while it holds nothing but its outline,
 * px. A half with cards keeps a card's width; one with nothing to show has
 * no reason to, and giving it back is the whole point of turning a side off.
 *
 * Not zero: the outline still has to read as a box with a sentence in it,
 * and the handle needs something left to grab. */
const READ_MIN_W_EMPTY = 200;

/** One labelled figure in an event's card. */
interface EventMetric {
  label: string;
  value: string;
  /** Unit set apart from the figure, the way the app's totals read. */
  unit?: string;
  /**
   * The figure's mark, for the ones that HAVE supplied art — set here and
   * not guessed from the label in the card, so a renamed metric cannot end
   * up wearing someone else's glyph.
   *
   * Only the plain figures use it (the box at the card's foot); a metric
   * carrying an "agora" comparison is drawn big, where a mark would compete
   * with the number. And the box shows marks only when EVERY figure in it
   * has one — one lonely glyph in a row of three reads as two of them
   * having lost theirs.
   */
  Icon?: ComponentType<{ className?: string }>;
  /**
   * The same quantity at the cursor's instant, when it has one — printed
   * beside the event's figure as "agora …", so the two can be compared at a
   * glance. A card's headline numbers describe the whole event and so do not
   * move while the cursor travels inside it; without this comparison that
   * stillness reads as a stuck number rather than as a peak. Signed, unlike
   * the peak, because the sign is the direction. Carries its own unit.
   */
  now?: string;
  /** A line under the figure, in full ink — "em 2,4 s" under a crash's
   * "31 → 0 km/h" (by request, 2026-09-26). Only the modules draw it. */
  detail?: string;
  /**
   * Where the instant sits against the event's own peak, 0..1 — the bar
   * under the figures. Clamped: a rolling window can momentarily read above
   * the whole-window figure it is compared against, and a bar past its own
   * track would be a rendering bug rather than a fact.
   */
  progress?: number;
}

/** Everything the card's figures are computed from: the raw channels, the
 * derived series, and where the cursor is. One object rather than seven
 * positional arguments — the list was growing with each new metric. */
interface EventContext {
  tMs: Float64Array;
  ax: ArrayLike<number>;
  ay: ArrayLike<number>;
  /** Roll and pitch rates, °/s — a crash's rotation reads all three. */
  gx: ArrayLike<number>;
  gy: ArrayLike<number>;
  /** Yaw rate, °/s — the curve radius and the theoretical lean read it. */
  gz: ArrayLike<number>;
  g: ArrayLike<number>;
  lean: ArrayLike<number>;
  roughness: ArrayLike<number>;
  /** The corner's lateral force, G, right positive (corneringGSeries) —
   * null without a speed or a frame whose up is known. */
  cornerG: ArrayLike<number> | null;
  /** The forward axis averaged over INSTANT_WINDOW_MS — the braking card's
   * deceleration, flattened of the trail's chatter. */
  axMean: ArrayLike<number>;
  /** The GPS track when the file carries one — the fusion figures (jump
   * length, curve radius, braking distance, retained speed) exist only
   * with it, and every card degrades to its IMU-only self without. */
  gps: GpsChannels | null;
  /** The speed series the chart draws, km/h on the IMU timeline — the
   * momentum figures read it, so card and plot agree to the sample. */
  speed: ArrayLike<number> | null;
  /** The session's curves in time order: a corner's momentum window is
   * bounded by its neighbours, so the card needs to know them. */
  curves: readonly Extract<ImuEvent, { kind: "curve" }>[];
  /** The high-g sensor's shocks (firmware V15), when the file has them:
   * an impact's and a landing's real peak, beside the main IMU's own. */
  highG?: readonly ImuHighGEvent[];
  cursorIndex: number;
}

interface EventDescription {
  title: string;
  Icon: ComponentType<{ className?: string }>;
  metrics: EventMetric[];
}

/**
 * Title, mark and labelled figures for an event, every number computed from
 * the raw channels over the event's own window — peak lateral G through a
 * curve, landing G in the 300 ms after touchdown, RMS vibration across a
 * rough section, impact severity from integrated dynamicG² energy.
 *
 * Figures come apart from their labels rather than joined into a sentence:
 * "0.79 G lateral máx · ~34° lean (est.) · 3.0 s" reads as one long string,
 * where a labelled column says what each number IS before it says how big.
 *
 * The curve's lean is the balance-angle estimate (leanSeries), and its
 * label — not its value — carries the (est.), so the number stays readable
 * while the caveat stays attached.
 *
 * The words come from the dictionary and the figures are written the way
 * the reader's language writes them — "0,79" in Portuguese, "0.79" in
 * English — which is why the two ride in as arguments: this runs outside
 * render, where no hook can be asked.
 */
function describeEvent(
  event: ImuEvent,
  ctx: EventContext,
  t: ProDictionary["analysis"],
  locale: Locale,
): EventDescription {
  const { tMs, gz, g, lean, roughness, gps, cursorIndex } = ctx;
  /** A figure with a fixed number of decimals, in the reader's language. */
  const num = (n: number, digits: number) => proNumber(n, locale, digits);
  const seconds = (fromMs: number, toMs: number) => ({
    label: t.event.duration,
    value: num((toMs - fromMs) / 1000, 1),
    unit: "s",
    Icon: StatStopwatchIcon,
  });
  /**
   * The instant's own reading of a channel — the printed value, signed and
   * with its unit (degrees ride against the figure, word-like units keep
   * their space), plus where it sits against the event's peak.
   */
  const nowOf = (
    values: ArrayLike<number>,
    unit: string,
    peak: number,
    digits = 2,
  ): Pick<EventMetric, "now" | "progress"> => {
    if (cursorIndex < 0) return {};
    const v = values[cursorIndex];
    return {
      now: `${num(v, digits)}${/^[°/]/.test(unit) ? "" : " "}${unit}`,
      progress: peak > 0 ? Math.min(1, Math.abs(v) / peak) : 0,
    };
  };
  /**
   * The speed at an instant, m/s — off the chart's own series when there is
   * one (the fused speed, which dips inside a corner the way the bike did),
   * and off the receiver's straight line between fixes otherwise. Every
   * speed a card prints goes through here, so the cards, the plot and the
   * dashboard never disagree about how fast the bike was going.
   */
  const speedAt = (ms: number): number | null => {
    if (ctx.speed) return ctx.speed[nearestSampleIndex(tMs, ms)] / 3.6;
    return gps ? gpsSpeedAt(gps, ms) : null;
  };

  switch (event.kind) {
    case "curve": {
      const metrics: EventMetric[] = [];
      // The corner's force, v·ω/g over INSTANT_WINDOW_MS, peak and now
      // alike — not the frame's lateral axis, which a leaning bike holds
      // near zero and a stone spikes to 5 G (corneringGSeries, by request,
      // 2026-09-11). Without a speed or a frame whose up is known there is
      // no such force to read, and no figure.
      const cornerG = ctx.cornerG;
      const lat = cornerG
        ? windowPeak(tMs, cornerG, event.startMs, event.endMs)
        : null;
      if (cornerG && lat != null && lat > 0) {
        const now = cursorIndex >= 0 ? Math.abs(cornerG[cursorIndex]) : null;
        metrics.push({
          label: t.event.lateralGMax,
          value: num(lat, 2),
          unit: "G",
          ...(now != null && {
            now: `${num(now, 2)} G`,
            progress: Math.min(1, now / lat),
          }),
        });
      }
      const maxLean = windowPeak(tMs, lean, event.startMs, event.endMs);
      if (maxLean != null)
        metrics.push({
          label: t.event.leanMax,
          value: `~${Math.round(maxLean)}`,
          unit: "°",
          ...nowOf(lean, "°", maxLean, 0),
        });
      // IMU+GPS fusion: the mean speed through the curve against the mean
      // yaw rate it held. Radius = v/ω; theoretical lean = atan(v·ω/g) —
      // the balance angle physics asks for at that speed and rate. The
      // lean series above is the same physics instant by instant, so the
      // two differ as a peak differs from a mean: what the corner spiked
      // against what it held. Means and not peaks here: the radius comes
      // from what the curve held, not what it spiked. Skipped below 1 °/s,
      // where a "curve" is a straight and the division makes up kilometres.
      if (gps) {
        // The pace through the corner, in the same module the two G-figures
        // wear: the fastest the curve was carried, with the reading under the
        // cursor beside it and a bar past it.
        //
        // Off the chart's speed series when there is one, like everything
        // else on the card (by request, 2026-09-10: read off the receiver's
        // 1 Hz line, the "agora" sat still through a one-second corner
        // while the plot's own line dipped and the momentum box said 17).
        //
        // The bar runs from the corner's SLOWEST to its fastest, not from
        // zero (by request, 2026-09-10): a bike never nears 0 km/h in a
        // corner, so a bar from zero sat near full whatever the cursor did
        // — 15 of 17 read as 89 %. Between 13 and 17 the same instant is
        // half way, which is where it is. The G and lean bars keep their
        // zero: a corner does pass through 0 G lateral and 0° at its ends.
        //
        // The two ends are printed in the order the corner reached them
        // (by request, 2026-09-11): "26–19" for a corner entered fast and
        // left slow, "19–26" for one that opened out. The bar does NOT
        // follow that order: empty is the corner's slowest, full its
        // fastest, always (by request, same day — a bar running from 25
        // down to 17 read 24 km/h as nearly empty, which looked broken).
        const gpsMax = gpsPeakSpeed(gps, event.startMs, event.endMs);
        const range = ctx.speed
          ? windowRange(tMs, ctx.speed, event.startMs, event.endMs)
          : gpsMax != null
            ? { min: gpsMax * 3.6, max: gpsMax * 3.6, minMs: 0, maxMs: 0 }
            : null;
        const vNow = cursorIndex >= 0 ? speedAt(tMs[cursorIndex]) : null;
        if (range) {
          const span = range.max - range.min;
          const [first, last] =
            range.maxMs < range.minMs
              ? [range.max, range.min]
              : [range.min, range.max];
          metrics.push({
            label: t.event.curveSpeed,
            value:
              span >= 0.5
                ? `${Math.round(first)}–${Math.round(last)}`
                : Math.round(range.max).toString(),
            unit: "km/h",
            ...(vNow != null && {
              now: `${Math.round(vNow * 3.6)} km/h`,
              progress:
                span > 0
                  ? Math.min(1, Math.max(0, (vNow * 3.6 - range.min) / span))
                  : 1,
            }),
          });
        }
        const vMean = gpsMeanSpeed(gps, event.startMs, event.endMs);
        const omegaDeg = windowMeanAbs(tMs, gz, event.startMs, event.endMs);
        if (vMean != null && omegaDeg != null && omegaDeg > 1) {
          const omega = (omegaDeg * Math.PI) / 180;
          metrics.push({
            label: t.event.radius,
            value: `~${Math.round(vMean / omega)}`,
            unit: "m",
            Icon: StatRadiusIcon,
          });
          metrics.push({
            label: t.event.theoreticalLean,
            value: `~${Math.round(
              (Math.atan((vMean * omega) / 9.81) * 180) / Math.PI,
            )}`,
            unit: "°",
            Icon: StatLeanAngleIcon,
          });
        }
        // What the corner did to the pace — momentum retention (by request,
        // 2026-09-10): the peak carried in, the trough at the apex, the peak
        // carried out, and exit over entry as a percentage. "31 → 19 → 29"
        // and "31 → 12 → 24" are the same corner ridden very differently,
        // and no power meter is needed to say which was the better line.
        // Read off the chart's own speed series, bounded by the neighbouring
        // corners (curveMomentum), so what the card says is what the plot
        // shows.
        //
        // Plain facts and not modules like the peak above: an "agora" rides
        // beside a PEAK, and entry→min→exit is not one — it is three
        // instants of the same pass, and there is no instant for the cursor
        // to sit at inside it. So they go in the box at the foot.
        const momentum = ctx.speed
          ? curveMomentum(
              tMs,
              ctx.speed,
              ctx.curves,
              ctx.curves.indexOf(event),
              gps,
            )
          : null;
        if (momentum) {
          metrics.push({
            label: t.event.entryMinExit,
            value: `${Math.round(momentum.entryKmh)} → ${Math.round(momentum.minKmh)} → ${Math.round(momentum.exitKmh)}`,
            unit: "km/h",
            Icon: StatGaugeIcon,
          });
          // The corrected figure when the track allows it — the hill's free
          // speed taken out, so a downhill corner is not credited with the
          // gravity — and the raw exit/entry otherwise. The drop it was
          // corrected by stands beside it, so the reader can see how much
          // of the raw ratio was the hill: a "−4 m" next to "88 %" says the
          // corner was ridden well on a descent, not coasted.
          metrics.push({
            label: t.event.retention,
            value: Math.round(
              100 * (momentum.retentionCorrected ?? momentum.retention),
            ).toString(),
            unit: "%",
            Icon: StatMomentumIcon,
          });
          if (momentum.dropM != null && Math.abs(momentum.dropM) >= 0.5)
            metrics.push({
              label: t.event.elevationDrop,
              value: `${momentum.dropM > 0 ? "−" : "+"}${num(Math.abs(momentum.dropM), 1)}`,
              unit: "m",
              Icon: StatDropIcon,
            });
        }
      }
      metrics.push(seconds(event.startMs, event.endMs));
      return {
        title:
          event.direction === "left" ? t.event.curveLeft : t.event.curveRight,
        Icon: event.direction === "left" ? CurveLeftIcon : CurveRightIcon,
        metrics,
      };
    }
    // A drop and a jump look identical to an IMU — airborne, then a landing
    // — so they share every figure and differ only in name and mark.
    case "jump":
    case "drop": {
      const metrics: EventMetric[] = [
        {
          label: t.event.airtime,
          value: num(event.airtimeMs / 1000, 2),
          unit: "s",
        },
      ];
      // Fusion: takeoff speed × airtime — how far the bike flew. The
      // ballistic horizontal estimate, not track distance: in the air the
      // receiver's own distance barely accumulates.
      if (gps) {
        const v = speedAt(event.takeoffMs);
        if (v != null)
          metrics.push({
            label: t.event.distance,
            value: `~${num((v * event.airtimeMs) / 1000, 1)}`,
            unit: "m",
          });
      }
      const landing = windowPeak(
        tMs,
        g,
        event.landingMs,
        event.landingMs + 300,
      );
      if (landing != null)
        metrics.push({
          label: t.event.landing,
          value: num(landing, 1),
          unit: "G",
        });
      // The same landing as the high-g sensor caught it, over the same
      // 300 ms — its own figure, not the one above corrected: see highg.ts.
      const landingShock = highGNear(ctx.highG, event.landingMs + 100, 200);
      if (landingShock)
        metrics.push({
          label: t.event.landingHighG,
          value: num(landingShock.peakG, 1),
          unit: "G",
        });
      const energy = impactEnergy(
        tMs,
        g,
        event.landingMs,
        event.landingMs + 300,
      );
      if (energy != null)
        metrics.push({
          label: t.event.severity,
          value: String(impactSeverityIndex(energy)),
          unit: "/100",
        });
      return event.kind === "drop"
        ? { title: t.event.dropTitle, Icon: DropIcon, metrics }
        : { title: t.event.jumpTitle, Icon: JumpIcon, metrics };
    }
    case "impact": {
      const metrics: EventMetric[] = [];
      const peak = windowPeak(tMs, g, event.timeMs - 150, event.timeMs + 150);
      // An impact IS a spike, so its figure stays the raw peak; the "now"
      // is the highest reading within INSTANT_WINDOW_MS of the cursor
      // rather than one sample — steady as it scrubs, full on the hit
      // itself (2026-09-11).
      if (peak != null) {
        const nowPeak =
          cursorIndex >= 0
            ? windowPeak(
                tMs,
                g,
                tMs[cursorIndex] - INSTANT_WINDOW_MS / 2,
                tMs[cursorIndex] + INSTANT_WINDOW_MS / 2,
              )
            : null;
        metrics.push({
          label: t.event.peak,
          value: num(peak, 2),
          unit: "G",
          ...(nowPeak != null && {
            now: `${num(nowPeak, 2)} G`,
            progress: peak > 0 ? Math.min(1, nowPeak / peak) : 0,
          }),
        });
      }
      // What the high-g sensor read of the same hit, when it caught it:
      // 800 Hz and ±200 g against 416 Hz and ±16 g, so higher on any sharp
      // hit and the only true figure on a clipped one. Beside "Pico" and
      // not in its place — sessions without the sensor have no such number.
      const shock = highGNear(ctx.highG, event.timeMs);
      if (shock)
        metrics.push({
          label: t.event.peakHighG,
          value: num(shock.peakG, 1),
          unit: "G",
        });
      const energy = impactEnergy(
        tMs,
        g,
        event.timeMs - 150,
        event.timeMs + 150,
      );
      if (energy != null)
        metrics.push({
          label: t.event.severity,
          value: String(impactSeverityIndex(energy)),
          unit: "/100",
        });
      // The file's own word for the severity when the dictionary knows it,
      // the raw value when it does not — a new grade would still be shown.
      const severity = event.severity
        ? (t.severity[event.severity as keyof typeof t.severity] ??
          event.severity)
        : null;
      return {
        title: t.event.impactTitle(severity),
        Icon: Zap,
        metrics,
      };
    }
    case "braking": {
      const metrics: EventMetric[] = [];
      // The deceleration over INSTANT_WINDOW_MS, peak and now alike: the
      // raw forward axis peaked on the trail's hits — of either sign, as
      // windowPeak reads |ax| — and a braking is a sustained pull, not a
      // spike (2026-09-11). The bar fills with the pull; accelerating
      // leaves it empty.
      const axRange = windowRange(tMs, ctx.axMean, event.startMs, event.endMs);
      const decel = axRange ? -axRange.min : null;
      if (decel != null && decel > 0) {
        const now = cursorIndex >= 0 ? ctx.axMean[cursorIndex] : null;
        metrics.push({
          label: t.event.brakingMax,
          value: num(decel, 2),
          unit: "G",
          ...(now != null && {
            now: `${num(now, 2)} G`,
            progress: Math.min(1, Math.max(0, -now) / decel),
          }),
        });
      }
      // Fusion: what the braking actually did — the speed it entered and
      // left with, and the ground it took to do it. Read off the speed
      // series rather than the file's own event fields, so a braking WE
      // detect one day carries the same figures.
      if (gps) {
        const v0 = speedAt(event.startMs);
        const v1 = speedAt(event.endMs);
        if (v0 != null && v1 != null)
          metrics.push({
            label: t.event.speed,
            value: `${Math.round(v0 * 3.6)} → ${Math.round(v1 * 3.6)}`,
            unit: "km/h",
          });
        const dist = gpsDistance(gps, event.startMs, event.endMs);
        if (dist != null)
          metrics.push({
            label: t.event.distance,
            value: String(Math.round(dist)),
            unit: "m",
          });
      }
      metrics.push(seconds(event.startMs, event.endMs));
      return { title: t.event.brakingTitle, Icon: BrakingIcon, metrics };
    }
    case "rough_section": {
      const metrics: EventMetric[] = [];
      const rms = windowRms(tMs, g, event.startMs, event.endMs, 1);
      if (rms != null)
        metrics.push({
          label: t.event.vibration,
          value: num(rms, 2),
          unit: "G RMS",
          // The rolling roughness at this instant — the same quantity over a
          // 0.5 s window, so it compares with the section's whole-window RMS.
          ...nowOf(roughness, "G", rms),
        });
      // Fusion: how much pace the ground cost — mean speed inside the
      // section against the stretch of equal length just before it. The
      // first honest cut of a flow figure; the composite Smoothness/Flow
      // scores still wait for real recordings. Skipped when there is less
      // than half a second of "before" to compare against, or when the
      // before-speed is walking pace and the ratio would be noise.
      if (gps) {
        const durMs = event.endMs - event.startMs;
        const beforeFrom = Math.max(tMs[0], event.startMs - durMs);
        if (event.startMs - beforeFrom >= 500) {
          const inside = gpsMeanSpeed(gps, event.startMs, event.endMs);
          const before = gpsMeanSpeed(gps, beforeFrom, event.startMs);
          if (inside != null && before != null && before > 0.5) {
            metrics.push({
              label: t.event.retainedSpeed,
              value: String(Math.round((inside / before) * 100)),
              unit: "%",
            });
          }
        }
      }
      metrics.push(seconds(event.startMs, event.endMs));
      return {
        title: t.event.roughTitle,
        Icon: RoughSectionIcon,
        metrics,
      };
    }
    case "crash": {
      const metrics: EventMetric[] = [];
      // Two modules with a bar (by request, 2026-09-26), so the cursor can
      // be followed through the fall:
      //
      // The DECELERATION, as speed: the speed it was ridden into, a second
      // before the bike began to turn over (the detector's own reading), to
      // the speed when it came to rest; the "agora" is the speed under the
      // cursor, and the bar fills with how much of the entry speed is gone.
      const vIn = speedAt(event.startMs - 1000);
      // The lowest speed over the whole fall, not the one at the instant it
      // came to rest: the receiver lags, and at that instant R0173 still
      // read 13 km/h, a second before 0.
      const range = ctx.speed
        ? windowRange(tMs, ctx.speed, event.startMs, event.endMs)
        : null;
      const vOut = range ? range.min / 3.6 : speedAt(event.endMs);
      if (vIn != null && vOut != null) {
        const vNow = cursorIndex >= 0 ? speedAt(tMs[cursorIndex]) : null;
        // How long it took (by request, 2026-09-26): from the entry reading
        // to the speed first under CRASH_STOPPED_KMH — practically stopped;
        // the last km/h to a true 0 is the receiver settling, and on R0173
        // added a second to a 2.4 s fall.
        let tookMs: number | null = null;
        if (ctx.speed)
          for (
            let i = nearestSampleIndex(tMs, event.startMs - 1000);
            i < tMs.length && tMs[i] <= event.endMs;
            i++
          )
            if (ctx.speed[i] <= CRASH_STOPPED_KMH) {
              tookMs = tMs[i] - (event.startMs - 1000);
              break;
            }
        metrics.push({
          label: t.event.deceleration,
          value: `${Math.round(vIn * 3.6)} → ${Math.round(vOut * 3.6)}`,
          unit: "km/h",
          ...(tookMs != null && {
            detail: t.event.inSeconds(num(tookMs / 1000, 1)),
          }),
          ...(vNow != null && {
            now: `${Math.round(vNow * 3.6)} km/h`,
            progress:
              vIn > 0 ? Math.min(1, Math.max(0, (vIn - vNow) / vIn)) : 0,
          }),
        });
      }
      // The G FORCE: the hardest hit from the tumble to the bike coming to
      // rest — at the main IMU's ±16 G often clipped, and then it says so,
      // "≥ 16" — and the "agora" as an impact's is, the highest reading
      // within INSTANT_WINDOW_MS of the cursor.
      const peak = windowPeak(tMs, g, event.startMs, event.downMs);
      if (peak != null) {
        const nowPeak =
          cursorIndex >= 0
            ? windowPeak(
                tMs,
                g,
                tMs[cursorIndex] - INSTANT_WINDOW_MS / 2,
                tMs[cursorIndex] + INSTANT_WINDOW_MS / 2,
              )
            : null;
        metrics.push({
          label: t.event.impactPeak,
          value: peak >= 15.9 ? `≥ ${num(16, 0)}` : num(peak, 1),
          unit: "G",
          ...(nowPeak != null && {
            now: `${num(nowPeak, 1)} G`,
            progress: peak > 0 ? Math.min(1, nowPeak / peak) : 0,
          }),
        });
      }
      const shock = highGNear(
        ctx.highG,
        (event.startMs + event.downMs) / 2,
        (event.downMs - event.startMs) / 2 + 200,
      );
      if (shock)
        metrics.push({
          label: t.event.peakHighG,
          value: num(shock.peakG, 1),
          unit: "G",
        });
      // How fast the bike turned over: the gyro's norm, peak.
      let rotation = 0;
      for (let i = 0; i < tMs.length; i++) {
        if (tMs[i] < event.startMs) continue;
        if (tMs[i] > event.downMs) break;
        const dps = Math.hypot(ctx.gx[i], ctx.gy[i], gz[i]);
        if (dps > rotation) rotation = dps;
      }
      if (rotation > 0)
        metrics.push({
          label: t.event.rotationMax,
          value: String(Math.round(rotation)),
          unit: "°/s",
        });
      metrics.push({
        label: t.event.timeDown,
        value: num((event.endMs - event.downMs) / 1000, 1),
        unit: "s",
        Icon: StatStopwatchIcon,
      });
      return { title: t.event.crashTitle, Icon: TriangleAlert, metrics };
    }
  }
}

/**
 * The analysis screen. Downloads the raw file from Storage (authenticated,
 * RLS-guarded — the browser is the only reader), normalizes it, and holds
 * the interaction state: which series are drawn, the zoom window, and the
 * cursor. Every readout comes from the raw samples via nearestSampleIndex;
 * downsampling only ever touches what is drawn.
 */
export function ImuSessionAnalysis({
  sessionId,
  storagePath,
  riderName,
  header,
  existingSnapshots,
  mountOrientation = null,
  trim = null,
}: {
  /** The row's id — what a Snapshot made from this recording points at. */
  sessionId: string;
  /** The account's Snapshots, so the dialog on an event's card can say
   * when one already stands on the same stretch instead of making a twin. */
  existingSnapshots: ImuSnapshotTwin[];
  storagePath: string;
  /** An orientation copied from another session (setGroupMountOrientation),
   * used when the file carries none of its own. */
  mountOrientation?: ImuMountOrientation | null;
  /** The session's trim (src/lib/imu/trim.ts), null for the whole
   * recording. The plot shows the trimmed run from 00:00; the scissors on
   * the zoom row open the dialog that sets it. */
  trim?: ImuSessionTrim | null;
  /** Who rode this recording, as recorded on import. It titles the
   * dashboard — the instruments are that person's ride, not a panel with a
   * generic name. Null on sessions imported before the field existed, and
   * then the panel falls back to its old title. */
  riderName: string | null;
  /** The session's identity block, rendered on the server and handed over as
   * a node. It shares a card with the résumé, and the résumé's figures are
   * computed from the file this component parses — so the cards are drawn
   * here, where both halves are in hand. */
  header: ReactNode;
}) {
  // The reader's language: every word on the page comes from the Pro
  // dictionary, and the figures are written the way that language writes
  // them (proNumber) — read once here and handed to whatever runs outside
  // render, describeEvent above all.
  const t = useProDict().analysis;
  const locale = useProLocale();
  // The file, downloaded, parsed and read in the bike's frame — the same
  // hook the report page uses, so the two pages never disagree.
  const {
    data,
    whole,
    error: loadError,
  } = useImuSession(storagePath, mountOrientation, trim);
  const [trimOpen, setTrimOpen] = useState(false);

  const [activeSeries, setActiveSeries] = useState<Set<SeriesId>>(
    new Set(["gforce"]),
  );
  /** The optional panels beside the plot — the dashboard and the map, each
   * behind its own switch on the Telemetria heading row. Per session, like
   * the filters: which panels are up is a way of looking, not a setting. */
  const [dashOn, setDashOn] = useState(true);
  const [mapOn, setMapOn] = useState(true);
  /** The event kinds drawn on the plot and read in the panel. "Mostrar
   * eventos" is not a switch of its own but this set's emptiness: unticking
   * it clears the filters, ticking it fills them, and ticking one kind with
   * the set empty shows events again with just that kind (by request — a
   * filter must be reachable directly, not through the master first).
   *
   * Opens on the curves alone (by request, 2026-09-10): with every kind on,
   * a downhill run's plot is a wall of eighty tabs and five colours before
   * the trace has been looked at, and the curves are the events the
   * momentum work is about. The others are one tick away. */
  // …and the high-g shocks: three marks on a run are not the wall the
  // app's own events are, and they are the reason the second sensor is on
  // the bike. The kind is in the set from the start — the file is still
  // loading when this state is born — and counts for nothing on a file
  // without the sensor (kindsOn), where it has no switch either.
  // Crashes on from the start too (2026-09-26): rare, and the first thing
  // a rider who fell wants to find.
  const [activeKinds, setActiveKinds] = useState<Set<string>>(
    new Set(["curve", "crash", HIGHG_KIND]),
  );
  const hasHighG = data?.highG != null;
  const kindsOn = (kinds: ReadonlySet<string>) =>
    [...kinds].some((kind) => kind !== HIGHG_KIND || hasHighG);
  const eventsOn = kindsOn(activeKinds);
  const [windowMs, setWindowMs] = useState<[number, number] | null>(null);
  const [cursorMs, setCursorMs] = useState<number | null>(null);
  /** Whether the chart has the cursor pinned (its double-click lock). The
   * chart owns the lock; this is a copy for the map's seek to consult. */
  const [cursorLocked, setCursorLocked] = useState(false);
  /** The value pills on the plot, by the cursor's hand. Off by default (by
   * request): the reading panel already answers the cursor, and the pills
   * are the opt-in extra for tracing one line closely. */
  const [valuesOn, setValuesOn] = useState(false);

  /** The map column's width on desktop — dragged by the handle on the
   * chart/map edge. The value rides a custom property because the grid only
   * exists from `lg` up, and an inline style cannot carry a breakpoint. */
  const [mapWidth, setMapWidth] = useState(MAP_DEFAULT_W);
  /** The map card's height on a phone — dragged by the grip under the map.
   * Same custom-property route as the width: the height applies below
   * `lg` only, where the map is stacked, and from `lg` it fills the row. */
  const [mapHeight, setMapHeight] = useState(MAP_DEFAULT_H);
  const [heightActive, setHeightActive] = useState(false);
  const heightDragRef = useRef<{
    pointerId: number;
    startY: number;
    startH: number;
  } | null>(null);
  /** Held true through a drag, so the handle stays in its grabbed colour
   * while the pointer wanders off it — a drag keeps the pointer captured,
   * and the bar going grey mid-gesture would say the grip had been lost. */
  const [splitActive, setSplitActive] = useState(false);
  /** A mouse is over the handle. State and not `group-hover:`, because
   * `hover:` in this build is NOT wrapped in `@media (hover: hover)` —
   * measured in the generated CSS on 2026-08-25 — so a touch would leave
   * the bar stuck black. Gating on `pointerType` is the hand-written
   * version of the media query the utility does not carry. */
  const [splitHover, setSplitHover] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const splitDragRef = useRef<{
    pointerId: number;
    startX: number;
    startW: number;
    maxW: number;
  } | null>(null);

  /**
   * The reading's own split: how much of it the channels take, leaving the
   * rest to the events. `null` is the rest state and means "halves" — the
   * property is then written as `1fr`, so the untouched panel is the 50/50 it
   * always was and a double click can put it back there exactly.
   *
   * It matters more than a preference: each half lays its cards out with
   * `auto-fill`, so the width given here is what decides whether that half
   * runs in one column or two. The split is the control for the density.
   */
  const [readWidth, setReadWidth] = useState<number | null>(null);
  const [readActive, setReadActive] = useState(false);
  const [readHover, setReadHover] = useState(false);
  const readGridRef = useRef<HTMLDivElement>(null);
  const readLeftRef = useRef<HTMLDivElement>(null);
  const readDragRef = useRef<{
    pointerId: number;
    startX: number;
    startW: number;
    maxW: number;
  } | null>(null);

  const summary = useMemo(() => (data ? sessionSummary(data) : null), [data]);
  const gForce = useMemo(() => (data ? gForceOf(data) : null), [data]);
  // The session as a Snapshot reads it — its track and the speed the
  // figures come from — made once, for the "Snapshot" button on an event's
  // card to turn that event into gates without rereading the file.
  const snapshotSession = useMemo(
    () => (data?.gps ? prepareSnapshotSession(data) : null),
    [data],
  );
  // The other sessions a comparison has read, kept while this page stands
  // (2026-09-20): from one corner of a trail to the next the candidates
  // barely change, and their download — a megabyte each, measured; reading
  // one takes ~30 ms — is the whole cost of opening "Comparar". So the
  // first corner pays it and the rest open at once. This session is never
  // downloaded at all: it is already in hand. Promises and not results, so
  // two openings share one download; a failure is forgotten, to be tried
  // again; and the oldest goes past SNAPSHOT_CACHE_MAX, at ~5 MB a session.
  const [snapshotCache] = useState(
    () => new Map<string, ReturnType<ImuSnapshotSessionLoader>>(),
  );
  const loadSnapshotSession = useCallback<ImuSnapshotSessionLoader>(
    (candidate) => {
      if (candidate.id === sessionId && snapshotSession)
        return Promise.resolve({ data: snapshotSession });
      const key = JSON.stringify([
        candidate.storagePath,
        candidate.trim,
        candidate.mountOrientation,
      ]);
      const hit = snapshotCache.get(key);
      if (hit) return hit;
      const loading = loadImuSession(
        candidate.storagePath,
        candidate.mountOrientation,
        candidate.trim,
        locale,
      ).then((result) =>
        result.data === null
          ? { data: null, error: result.error }
          : { data: prepareSnapshotSession(result.data) },
      );
      snapshotCache.set(key, loading);
      void loading.then((result) => {
        if (result.data === null) snapshotCache.delete(key);
      });
      while (snapshotCache.size > SNAPSHOT_CACHE_MAX)
        snapshotCache.delete(snapshotCache.keys().next().value!);
      return loading;
    },
    [sessionId, snapshotSession, snapshotCache, locale],
  );

  const seriesValues = useMemo(() => {
    if (!data || !gForce) return null;
    const { tMs, ax, ay, az, gx, gy, gz } = data.channels;
    // Derived series computed once per file, on read — the raw channels are
    // inputs, never rewritten. Speed exists only when the file carries a GPS
    // track; every consumer below goes through availableSeriesDefs, which is
    // what keeps a missing entry from ever being read.
    // The forward axis is only forward once the mounting yaw is applied;
    // until then the speed is the GPS's own straight line between fixes.
    const speed = data.gps
      ? fusedSpeedKmhSeries(tMs, data.mounting?.applied ? ax : null, data.gps)
      : null;
    const values: Partial<Record<SeriesId, ArrayLike<number>>> = {
      gforce: gForce,
      ax,
      ay,
      az,
      gx,
      gy,
      gz,
      roughness: roughnessSeries(tMs, gForce),
      jerk: jerkSeries(tMs, gForce),
      // The lean needs the roll about the bike's FORWARD and the yaw about
      // its UP, which gx and gz only are once the frame is aligned;
      // unaligned, or without a track, it falls back to the accelerometer's
      // tilt.
      lean: leanSeries(
        tMs,
        ay,
        az,
        data.aligned ? gx : null,
        data.aligned ? gz : null,
        speed,
      ),
    };
    if (data.gps && speed) {
      values.speed = speed;
      values.altitude = altitudeMSeries(tMs, data.gps);
    }
    return values as Record<SeriesId, ArrayLike<number>>;
  }, [data, gForce]);

  /** The estimated pitch, the dashboard's second attitude — not a chart
   * series, so it lives beside seriesValues rather than inside it. */
  /** The cards' readings of an instant, over INSTANT_WINDOW_MS: the
   * corner's force and the flattened forward axis. Not chart series, so
   * beside seriesValues rather than inside it. */
  const instantSeries = useMemo(() => {
    if (!data || !seriesValues) return null;
    const { tMs, ax, gz } = data.channels;
    const speed = seriesValues.speed ?? null;
    return {
      // The yaw is about the bike's up only once the frame is aligned —
      // the lean's own condition.
      cornerG: data.aligned && speed ? corneringGSeries(tMs, speed, gz) : null,
      axMean: centredMeanSeries(tMs, ax, INSTANT_WINDOW_MS),
    };
  }, [data, seriesValues]);

  /** The corners in time order — each one's momentum window is bounded by
   * its neighbours, so the cards read the list rather than the event. */
  const sessionCurves = useMemo(
    () =>
      data
        ? data.events.filter(
            (e): e is Extract<ImuEvent, { kind: "curve" }> =>
              e.kind === "curve",
          )
        : [],
    [data],
  );

  /**
   * How far each event's card reaches past the event itself, in session ms
   * (by request, 2026-09-10 — scrubbing along an event, the card vanished
   * the instant the thumb overshot an edge, and the panel flickered between
   * a card and a blank).
   *
   * Every kind gets EVENT_REACH_MS each side and nothing more — a curve's
   * momentum window was tried as its reach and carried the card over the
   * straight after the corner, which is not what a margin is for. Past the
   * reach the panel blanks, as it always did. When several events are
   * within reach the nearest wins, and one the instant is inside wins
   * outright (see cursorHits).
   */
  const eventReaches = useMemo(() => {
    const reaches = new Map<ImuEvent, readonly [number, number]>();
    if (!data) return reaches;
    for (const event of data.events) {
      switch (event.kind) {
        case "jump":
        case "drop":
          reaches.set(event, [
            event.takeoffMs - EVENT_REACH_MS,
            event.landingMs + EVENT_REACH_MS,
          ]);
          break;
        case "impact":
          reaches.set(event, [
            event.timeMs - EVENT_REACH_MS,
            event.timeMs + EVENT_REACH_MS,
          ]);
          break;
        default:
          reaches.set(event, [
            event.startMs - EVENT_REACH_MS,
            event.endMs + EVENT_REACH_MS,
          ]);
      }
    }
    return reaches;
  }, [data]);

  const pitchValues = useMemo(() => {
    if (!data) return null;
    const { tMs, ax, ay, az } = data.channels;
    return pitchSeries(tMs, ax, ay, az);
  }, [data]);

  /**
   * What each channel did across this session: its extremes, its mean, and
   * the biggest magnitude it reached — the last being the full end of that
   * channel's gauge.
   *
   * Per channel and not one number for all of them: a gyro reads in hundreds
   * of °/s where an accelerometer reads in single g, and a shared scale would
   * flatten every accelerometer row to nothing. Per session and not global,
   * for the reason the G force gauge already carries: two recordings are not
   * on the same scale.
   *
   * The WHOLE session and not the chart's visible window, decided with the
   * owner: the gauge beside these numbers is anchored to the session's peak,
   * so a min/max that moved with the zoom would have the card describing two
   * different populations at once. The cost is stated and accepted — zoomed
   * into a stretch, the three figures still speak for the whole recording.
   *
   * One pass for the four: they read the same array, and a channel is up to
   * hundreds of thousands of samples long.
   */
  const seriesStats = useMemo(() => {
    if (!seriesValues) return null;
    const stats = {} as Record<
      SeriesId,
      { min: number; max: number; avg: number; peak: number }
    >;
    for (const def of SERIES_DEFS) {
      const values = seriesValues[def.id];
      if (!values) continue; // speed, in a file without GPS
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
        const magnitude = Math.abs(v);
        if (magnitude > peak) peak = magnitude;
      }
      // An empty channel would leave the sentinels in place, and ±Infinity
      // printed in a card is worse than a zero.
      stats[def.id] = values.length
        ? { min, max, avg: sum / values.length, peak }
        : { min: 0, max: 0, avg: 0, peak: 0 };
    }
    return stats;
  }, [seriesValues]);

  if (loadError) {
    // Written on screen with the whole message — the garage rule.
    return (
      <SessionCards header={header}>
        <p className="px-5 py-5 text-sm text-destructive sm:px-6">
          {loadError}
        </p>
      </SessionCards>
    );
  }
  if (
    !data ||
    !summary ||
    !seriesValues ||
    !seriesStats ||
    !gForce ||
    !pitchValues
  ) {
    return (
      <SessionCards header={header}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t.loading}
        </p>
      </SessionCards>
    );
  }

  const tMs = data.channels.tMs;
  const sampleRateHz = data.sampleRateHz;
  const full: [number, number] = [tMs[0], data.durationMs];
  const win = windowMs ?? full;
  const zoomed = win[0] > full[0] || win[1] < full[1];

  // The series with their words joined on, in the reader's language — the
  // list every consumer below reads.
  const seriesDefs: LabelledSeriesDef[] = SERIES_DEFS.map((def) => ({
    ...def,
    ...t.series[def.id],
  }));
  // The GPS series are real pills only when this file recorded a track;
  // without one they stay the disabled pills they always were, with their
  // "no data" hint.
  const hasGps = data.gps != null;
  const availableSeriesDefs = seriesDefs.filter(
    (def) => !GPS_SERIES_IDS.has(def.id) || hasGps,
  );
  const activeSeriesDefs = availableSeriesDefs.filter((def) =>
    activeSeries.has(def.id),
  );
  const kindDefs = data.highG
    ? [...EVENT_KIND_DEFS, HIGHG_KIND_DEF]
    : EVENT_KIND_DEFS;
  const activeKindDefs = kindDefs.filter((def) => activeKinds.has(def.kind));
  // JSX will not take an indexed expression as a component name, so the sole
  // active kind is hoisted to a capitalised binding.
  const soleKind = activeKindDefs.length === 1 ? activeKindDefs[0] : null;

  const chartSeries: ImuChartSeries[] = activeSeriesDefs.map((def) => ({
    id: def.id,
    label: def.label,
    color: def.color,
    values: seriesValues[def.id],
  }));

  const cursorIndex = cursorMs != null ? nearestSampleIndex(tMs, cursorMs) : -1;
  // The filters hold here too, not just on the plot: a kind switched off is
  // off everywhere, and a card describing an event the chart is not drawing
  // was the one place the switch did not mean what it says.
  //
  // Within REACH and not only inside: a card stands a little before and
  // after its event (eventReaches), so a thumb overshooting a corner's edge
  // does not blank the panel. Events the instant is inside come first, by
  // kind; the ones it is merely near follow, nearest first.
  const cursorHits = (
    cursorIndex >= 0
      ? eventsNear(
          data.events,
          tMs[cursorIndex],
          (event) => eventReaches.get(event) ?? [0, -1],
        )
      : []
  )
    .filter(({ event }) => eventsOn && activeKinds.has(event.kind))
    .sort((a, b) =>
      a.offsetMs === 0 && b.offsetMs === 0
        ? EVENT_PRIORITY[a.event.kind] - EVENT_PRIORITY[b.event.kind]
        : Math.abs(a.offsetMs) - Math.abs(b.offsetMs),
    );
  const cursorEvents = cursorHits.map((hit) => hit.event);
  const primaryEvent = cursorEvents[0] ?? null;
  const primaryOffsetMs = cursorHits[0]?.offsetMs ?? 0;
  const eventContext: EventContext = {
    tMs,
    ax: data.channels.ax,
    ay: data.channels.ay,
    gx: data.channels.gx,
    gy: data.channels.gy,
    gz: data.channels.gz,
    g: gForce,
    lean: seriesValues.lean,
    roughness: seriesValues.roughness,
    cornerG: instantSeries?.cornerG ?? null,
    axMean: instantSeries?.axMean ?? data.channels.ax,
    gps: data.gps,
    speed: seriesValues.speed ?? null,
    curves: sessionCurves,
    highG: data.highG,
    cursorIndex,
  };
  const primaryDesc = primaryEvent
    ? describeEvent(primaryEvent, eventContext, t, locale)
    : null;
  // The shock within reach of the cursor, for a card of its own under the
  // app's events: the same hit is often an impact above and a shock here,
  // and the two say different things — one read off the continuous trace,
  // the other the second sensor's own 40 ms of it.
  const shocksOn = eventsOn && activeKinds.has(HIGHG_KIND);
  const cursorShock =
    shocksOn && cursorIndex >= 0
      ? highGNear(data.highG, tMs[cursorIndex], EVENT_REACH_MS)
      : null;

  // The dashboard reads the same instant as the cards; before the first
  // scrub it parks at the recording's start, so the instruments open on the
  // ride's first breath instead of on a dead panel.
  //
  // The ring is a speedometer whose dial ends at THIS session's top speed
  // plus a fixed headroom — the per-session rule the rest of the lab's
  // gauges already follow, adopted here in place of the old fixed 60 km/h.
  // What it costs is comparability between rides; what it buys is a needle
  // that uses the whole dial on a slow one. The full end comes from the same
  // `summary.maxSpeedKmh` the "Vel. máx" tile prints, so the two can never
  // disagree, and it is the whole recording's maximum rather than the
  // visible window's — a dial that rescaled while zooming would move the
  // needle without the ride changing.
  //
  // Without GPS there is no speed, and the ring falls back to the clock —
  // how far into the recording the cursor sits.
  const dashIndex = cursorIndex >= 0 ? cursorIndex : 0;
  const dashSpeedKmh = data.gps
    ? (seriesValues.speed[dashIndex] as number)
    : null;
  const dashSpeedFullKmh = (summary.maxSpeedKmh ?? 0) + DASH_SPEED_HEADROOM_KMH;
  const dashProgress =
    dashSpeedKmh != null
      ? dashSpeedKmh / dashSpeedFullKmh
      : data.durationMs > 0
        ? tMs[dashIndex] / data.durationMs
        : 0;

  /**
   * Re-fit the dragged split to the floors that are ABOUT to apply.
   *
   * A half that holds only its outline may be dragged down to 200px; one that
   * holds cards may not go under 320. So a split left at 200 while the
   * metrics were off is illegal the moment they come back — and the card
   * inside, which cannot be laid out under 320, would spill out of the panel.
   * Turning a side back on therefore has to bring the edge with it.
   *
   * Called from the switches and not from an effect on their state: a
   * `setState` in an effect body is an ESLint error in this project, and the
   * switch is where the fact actually changes — the same shape `toggleDash`
   * uses for the map's width.
   *
   * Nothing to do at rest: `null` means halves, and halves are legal at any
   * width the row can be.
   */
  function refitRead(nextMetricsEmpty: boolean, nextEventsOn: boolean) {
    const grid = readGridRef.current;
    if (!grid || readWidth == null) return;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const minLeft = nextMetricsEmpty ? READ_MIN_W_EMPTY : READ_MIN_W;
    const minRight = nextEventsOn ? READ_MIN_W : READ_MIN_W_EMPTY;
    const maxLeft = Math.max(
      minLeft,
      grid.getBoundingClientRect().width - gap - minRight,
    );
    setReadWidth(Math.min(maxLeft, Math.max(minLeft, readWidth)));
  }

  function toggleSeries(id: SeriesId) {
    const next = new Set(activeSeries);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Read through the SAME filter the panel does: a series that is on but
    // not available in this recording (speed without GPS) leaves the half as
    // empty as no series at all.
    refitRead(
      availableSeriesDefs.every((def) => !next.has(def.id)),
      eventsOn,
    );
    setActiveSeries(next);
  }

  function toggleEvents() {
    const next = eventsOn
      ? new Set<string>()
      : new Set<string>(kindDefs.map((d) => d.kind));
    refitRead(activeSeriesDefs.length === 0, kindsOn(next));
    setActiveKinds(next);
  }

  function toggleKind(kind: string) {
    const next = new Set(activeKinds);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    // The last kind off, or the first one on, is the events half of the
    // reading panel going away or coming back: the same refit the master
    // does.
    if (kindsOn(next) !== eventsOn)
      refitRead(activeSeriesDefs.length === 0, kindsOn(next));
    setActiveKinds(next);
  }

  /**
   * How wide the map may grow right now — everything the row does not owe
   * the other columns, measured at gesture time rather than kept in sync
   * with resizes.
   *
   * It used to subtract the chart's floor and nothing else, which was wrong
   * by a whole column: the Rider panel's 300px and BOTH channels were never
   * counted. Reproduced with the handle's arrow keys — the map grew to
   * 713px and the plot was squeezed to 84, against the 420 it declares as
   * its minimum. What the row owes is the chart's floor plus the channel it
   * shares with the map, and, while the Rider stands, that column plus its
   * own channel.
   */
  function maxMapWidth(withDash: boolean = dashOn): number {
    const container = splitRef.current;
    if (!container) return MAP_MIN_W;
    const owed = CHART_MIN_W + COL_GAP + (withDash ? DASH_COL_W + COL_GAP : 0);
    return Math.max(MAP_MIN_W, container.getBoundingClientRect().width - owed);
  }

  /**
   * The Rider switch, which is also where the map gets pulled back under
   * its ceiling.
   *
   * Fixing the arithmetic above closes one door and leaves the next one
   * open: drag the map wide with the panel off, switch the panel back on,
   * and its 300px plus a channel come out of the plot — the grid hands them
   * over silently, because `minmax(0,1fr)` lets the chart go to nothing.
   * Clamped here and not in an effect on `dashOn`: a `setState` in an
   * effect body is an ESLint error in this project, and the switch is where
   * the fact actually changes.
   */
  function toggleDash() {
    const next = !dashOn;
    if (next) setMapWidth((w) => Math.min(w, maxMapWidth(true)));
    setDashOn(next);
  }

  function startMapResize(event: React.PointerEvent<HTMLElement>) {
    // Only a deliberate primary press opens a drag — the preview pane has a
    // history of synthesizing stray pointer traffic while it settles, and a
    // resize that can start without a button held is a chart that shrinks
    // on its own.
    if (
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    splitDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startW: mapWidth,
      maxW: maxMapWidth(),
    };
    setSplitActive(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // No capture: moves still arrive while over the handle.
    }
  }

  function moveMapResize(event: React.PointerEvent<HTMLElement>) {
    const drag = splitDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // A move with no button held means the release was missed (capture torn
    // down, pointer swapped) — end the drag instead of trailing the hover.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      splitDragRef.current = null;
      setSplitActive(false);
      return;
    }
    // The handle rides the columns' shared edge, so dragging left grows the
    // map by exactly what the pointer travelled.
    const next = drag.startW + (drag.startX - event.clientX);
    setMapWidth(Math.min(drag.maxW, Math.max(MAP_MIN_W, next)));
  }

  function endMapResize(event: React.PointerEvent<HTMLElement>) {
    if (splitDragRef.current?.pointerId === event.pointerId) {
      splitDragRef.current = null;
      setSplitActive(false);
    }
  }

  // The phone's grip, under the map: the same drag contract as the split
  // handle — a deliberate primary press, pointer capture, a missed release
  // ends the drag — with the travel read vertically. Dragging down grows
  // the map by what the thumb travelled.
  function startMapHeightResize(event: React.PointerEvent<HTMLElement>) {
    if (
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    heightDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startH: mapHeight,
    };
    setHeightActive(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // No capture: moves still arrive while over the grip.
    }
  }

  function moveMapHeightResize(event: React.PointerEvent<HTMLElement>) {
    const drag = heightDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      heightDragRef.current = null;
      setHeightActive(false);
      return;
    }
    const next = drag.startH + (event.clientY - drag.startY);
    setMapHeight(Math.min(MAP_MAX_H, Math.max(MAP_MIN_H, next)));
  }

  function endMapHeightResize(event: React.PointerEvent<HTMLElement>) {
    if (heightDragRef.current?.pointerId === event.pointerId) {
      heightDragRef.current = null;
      setHeightActive(false);
    }
  }

  /** How narrow the channels' half may be dragged: a card's worth while it
   * holds cards, the outline's width while it holds only the outline — which
   * is what lets the events take the rest when the metrics are all off. The
   * events' own floor never moves: that half always holds a card. */
  const readMinLeft =
    activeSeriesDefs.length === 0 ? READ_MIN_W_EMPTY : READ_MIN_W;
  /** The same rule on the other side: with the events hidden that half holds
   * only its outline, so it stops reserving a card's width and the channels
   * can take the rest. */
  const readMinRight = eventsOn ? READ_MIN_W : READ_MIN_W_EMPTY;

  /** The far end the channels' half may be dragged to: everything the row
   * has, less the channel between the halves and the floor the events keep.
   * Read from the DOM rather than tracked, for the reason the map's twin
   * carries — the row's width is the window's, and nothing here is told when
   * that changes. */
  function maxReadWidth(): number {
    const grid = readGridRef.current;
    if (!grid) return READ_MIN_W;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    return Math.max(
      readMinLeft,
      grid.getBoundingClientRect().width - gap - readMinRight,
    );
  }

  /** Where the edge stands right now — the stored width, or, at rest, the
   * half the browser is already drawing. Measured and not assumed: `null`
   * means `1fr`, and a drag has to start from what is on screen. */
  function currentReadWidth(): number {
    if (readWidth != null) return readWidth;
    const left = readLeftRef.current?.getBoundingClientRect().width;
    return left && left > 0 ? left : readMinLeft;
  }

  function startReadResize(event: React.PointerEvent<HTMLElement>) {
    if (
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    readDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startW: currentReadWidth(),
      maxW: maxReadWidth(),
    };
    setReadActive(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // No capture: moves still arrive while over the handle.
    }
  }

  function moveReadResize(event: React.PointerEvent<HTMLElement>) {
    const drag = readDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      readDragRef.current = null;
      setReadActive(false);
      return;
    }
    // The handle rides the halves' shared edge, and the channels are on the
    // left: dragging right gives them exactly what the pointer travelled.
    const next = drag.startW + (event.clientX - drag.startX);
    setReadWidth(Math.min(drag.maxW, Math.max(readMinLeft, next)));
  }

  function endReadResize(event: React.PointerEvent<HTMLElement>) {
    if (readDragRef.current?.pointerId === event.pointerId) {
      readDragRef.current = null;
      setReadActive(false);
    }
  }

  function zoomAround(factor: number) {
    const center =
      cursorMs != null && cursorMs >= win[0] && cursorMs <= win[1]
        ? cursorMs
        : (win[0] + win[1]) / 2;
    const half = ((win[1] - win[0]) * factor) / 2;
    const from = Math.max(full[0], center - half);
    const to = Math.min(full[1], center + half);
    // Never narrower than 20 samples' worth of time.
    if (to - from < (20 / Math.max(1, sampleRateHz)) * 1000) return;
    setWindowMs(to - from >= full[1] - full[0] ? null : [from, to]);
  }

  // The two filter menus, built once and placed twice — at the head of the
  // telemetry card on a phone, and on the Telemetria heading row from `sm`
  // up. They used to be the phone's answer only, with desktop keeping a
  // wall of pills; two controls for one job meant every metric added had to
  // be added in both places, and the pills spent a full band of the page on
  // decisions that are taken rarely. The menu says what is on — a name and
  // its mark when one is picked, a count when several are.
  const metricsMenu = (
    <ImuFilterMenu
      summary={
        // Two readings of the same control, because two things sit beside
        // it. On a phone the menu is alone and has to say what is on. From
        // `sm` the legend on the plot's head says it, in the series' own
        // colours, so the trigger goes back to naming what it opens —
        // otherwise "G force" would be printed twice, a chip apart.
        <>
          <span className="truncate sm:hidden">
            {activeSeriesDefs.length === 1 ? (
              <>
                <span
                  aria-hidden
                  className="mr-1.5 inline-block size-2 shrink-0 rounded-full align-middle"
                  style={{ backgroundColor: activeSeriesDefs[0].color }}
                />
                {activeSeriesDefs[0].label}
              </>
            ) : activeSeriesDefs.length === 0 ? (
              t.menus.metrics
            ) : (
              t.menus.metricsCount(activeSeriesDefs.length)
            )}
          </span>
          <span className="hidden truncate sm:inline">{t.menus.metrics}</span>
        </>
      }
      items={[
        ...availableSeriesDefs.map((def) => ({
          key: def.id,
          label: def.label,
          sublabel: def.summary,
          color: def.color,
          checked: activeSeries.has(def.id),
          onToggle: () => toggleSeries(def.id),
        })),
        ...(hasGps
          ? []
          : [t.series.speed.label, t.series.altitude.label].map((label) => ({
              key: label,
              label,
              checked: false,
              disabled: true,
              hint: t.menus.noData,
              onToggle: () => {},
            }))),
      ]}
    />
  );
  const eventsMenu = (
    <ImuFilterMenu
      summary={
        !eventsOn ? (
          <span className="truncate text-muted-foreground">
            {t.menus.eventsHidden}
          </span>
        ) : soleKind ? (
          <>
            <soleKind.Icon className="size-4 shrink-0" />
            <span className="truncate">{t.kinds[soleKind.kind]}</span>
          </>
        ) : (
          <span className="truncate">
            {activeKindDefs.length === kindDefs.length
              ? t.menus.events
              : t.menus.eventsOf(activeKindDefs.length, kindDefs.length)}
          </span>
        )
      }
      items={[
        {
          key: "events-master",
          label: t.menus.showEvents,
          checked: eventsOn,
          onToggle: toggleEvents,
        },
        ...kindDefs.map((def) => ({
          key: def.kind,
          label: t.kinds[def.kind],
          Icon: def.Icon,
          checked: activeKinds.has(def.kind),
          onToggle: () => toggleKind(def.kind),
        })),
      ]}
    />
  );

  // The panel switches, built once and placed twice like the menus above:
  // on the heading row from `sm`, and down in the filter grid on a phone,
  // where the heading has no room for them beside the title. They matter on
  // a phone too — there the panels do not stand beside the plot, they stack
  // under it, so switching one off is scrolling saved.
  const panelToggles = (
    <>
      <RealignmentBadge session={data} />
      <MountingBadge session={data} />
      <PanelToggle label={t.panels.rider} on={dashOn} onToggle={toggleDash} />
      {hasGps && (
        <PanelToggle
          label={t.panels.map}
          on={mapOn}
          onToggle={() => setMapOn((v) => !v)}
        />
      )}
    </>
  );

  return (
    <SessionCards
      header={header}
      /* Session résumé: the numbers the whole recording boils down to. It
         shares the identity's card, because both answer "what recording is
         this" — the reading of it starts in the card below.

         Eight figures with a GPS track, six without. The phone keeps three
         loose columns and takes the ragged last row that follows: a ruled
         box, which is what the bike header's totals use, would draw its
         dividers into the empty cells. */
      resume={
        <div className="border-t border-border px-5 pt-5 pb-5 sm:border-0 sm:px-6 sm:pt-0 2xl:py-6 2xl:pl-0">
          {/* The rows breathe more than the columns: pulling the label onto
              its figure made each cell a tight block, and at 16px the three
              rows read as one paragraph instead of three. Phone only — the
              desktop tiles space themselves.

              From `sm` the figures share ONE ruled box instead of standing
              as eight outlined tiles — the shape the bike header's totals
              already use. Eight boxes, each with its own outline and its own
              gap, made a row of eight objects out of what is one fact about
              one recording; a box with rules says the same thing quietly.

              The rules are `gap-px` over a background, not borders on the
              cells. A border would have to know which cell ends a row, and
              this grid wraps — 8 cells over 4 columns at `sm`, 8 over 8 at
              `lg`, 6 over 6 without GPS. A one-pixel gap draws the line
              wherever the wrap happens to fall, and needs no `nth-child`.

              Eight divide where nine did not: `sm` takes two rows of four
              and `lg` puts them on one line. Without GPS the six fit a
              single row from `sm`. The phone stays at three columns either
              way — four cells across 345px of content leave ~77px each, and
              "36.0 km/h" already broke at 81. */}
          {/* The box's white base, so the rules read at the strength they
              read everywhere else. `--border` is a 9% ink, so what it paints
              depends on what is under it: over the identity card — white at
              40% over the page, #f5f5f5 — the same token came out #e0e0e0,
              against the #e9e9e9 the Rider card's rules make over solid
              white. Same token, two intensities. An opaque white plate under
              the grid puts them back on the same backdrop, and with it the
              same colour. */}
          {/* The figures alone: the report's door moved into the identity
              block, beside the name (by request, 2026-09-10 — it had been a
              ninth cell, then a card beside the plate). */}
          <div className="sm:overflow-hidden sm:rounded-[14px] sm:border sm:border-border sm:bg-card">
            <div
              className={cn(
                "grid grid-cols-3 gap-x-3 gap-y-7 sm:gap-px sm:bg-border",
                summary.distanceM != null
                  ? "sm:grid-cols-4 lg:grid-cols-8"
                  : "sm:grid-cols-6",
              )}
            >
              <Stat
                Icon={StatClockIcon}
                label={t.resume.duration}
                value={formatSessionTime(summary.durationMs)}
              />
              {/* The ride-level GPS figures ride next to the duration —
                  the three answer "how much ride" before the rest answer
                  "how hard". Lucide marks for now; the supplied art set has
                  no distance or speedometer glyph yet. */}
              {summary.distanceM != null && (
                <Stat
                  Icon={StatRouteIcon}
                  label={t.resume.distance}
                  value={formatTrackDistance(summary.distanceM, locale)}
                />
              )}
              {summary.maxSpeedKmh != null && (
                <Stat
                  Icon={StatGaugeIcon}
                  label={t.resume.maxSpeed}
                  value={`${proNumber(summary.maxSpeedKmh, locale, 1)} km/h`}
                />
              )}
              <Stat
                Icon={StatMetricIcon}
                label={t.resume.maxG}
                value={proNumber(summary.maxG, locale, 2)}
              />
              <Stat
                Icon={StatImpactIcon}
                label={t.resume.impacts}
                value={String(summary.impactCount)}
              />
              <Stat
                Icon={StatTurnIcon}
                label={t.resume.curves}
                value={String(summary.curveCount)}
              />
              <Stat
                Icon={StatJumpIcon}
                label={t.resume.jumps}
                value={String(summary.jumpCount)}
              />
              <Stat
                Icon={StatStopwatchIcon}
                label={t.resume.airtime}
                value={`${proNumber(summary.airtimeMs / 1000, locale, 1)} s`}
              />
            </div>
          </div>
        </div>
      }
    >
      {/* The filters, at the head of the telemetry card on a phone. From
          `sm` up the very same two menus move to the Telemetria heading row
          — see below — and this copy stands down. "Velocidade" and
          "Altitude" stay listed but disabled without a GPS track, because a
          line invented from acceleration would lie. */}
      {/* No panel switches in this copy: on a phone the Rider panel is not
          shown at all and the map is a thumbnail that costs nothing to
          leave standing, so both switches would govern something the reader
          cannot see the point of. Two menus, one row. */}
      <div className="grid grid-cols-2 gap-1.5 px-5 pt-[22px] pb-5 sm:hidden">
        {metricsMenu}
        {eventsMenu}
      </div>

      {/* Only the panel switches stand on the page now. The two menus went
          down onto the plot's own head, where the thing they configure is:
          they never governed the Rider panel or the map, and a heading over
          all three cards said they did. What is left up here is the pair
          that decides which cards exist at all, which is nobody's card. */}
      <PanelSwitchRow>{panelToggles}</PanelSwitchRow>

      {/* The plot and the route: one card each from `sm` up, side by side
          from `lg`. The plot runs to its card's edges — on a 375px phone
          the padding was over a tenth of it, and on desktop the card has no
          side padding for it to cancel; only the axis labels and the zoom
          row keep an inset. Without a GPS track the grid never engages and
          the chart keeps the whole width, as before. */}
      <div
        ref={splitRef}
        style={{ "--imu-map-w": `${mapWidth}px` } as React.CSSProperties}
        // The proximity tracking that used to live here is gone with the
        // fade: the handle is a bar that stands in the channel at all times,
        // so nothing has to measure the pointer against the boundary on
        // every move to decide whether to show it.
        //
        // The grid's shape follows the switches: chart alone, chart with one
        // panel, or all three. Spelled out as whole literal classes because
        // Tailwind only generates what it can read in the source.
        //
        // `flex flex-col` below `lg` so `order` has a formatting context to
        // work in: stacked, this was a plain block and `order` is inert
        // there. No `gap` with it — the children keep their own `mt-4`, and
        // since the phone's first item carries none while the rest do, the
        // spacing lands the same as when they stacked in source order.
        className={cn(
          "flex flex-col",
          data.gps && mapOn && dashOn
            ? "lg:grid lg:grid-cols-[300px_minmax(0,1fr)_var(--imu-map-w)] lg:gap-x-[22px]"
            : data.gps && mapOn
              ? "lg:grid lg:grid-cols-[minmax(0,1fr)_var(--imu-map-w)] lg:gap-x-[22px]"
              : dashOn
                ? "lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-x-[22px]"
                : undefined,
        )}
      >
        {/* The four blocks are placed by `order` and not by moving them in
            the source. The chart comes first on either layout — it is the
            thing you drag, and everything else only says what the cursor
            found. Phone: chart, map, reading, Rider. Desktop: Rider, chart,
            map, then the reading across the foot. */}
        {/* The plot's column: its head on the page, the plot in a card under
            it. The head is not part of the card because it is not part of
            the picture — it names the picture and holds the controls that
            shape it, the way the page's own section titles do. Inside the
            card it had read as a strip of chrome bolted onto the plot. */}
        <div className="order-1 flex min-w-0 flex-col lg:order-2">
          <ChartCardHeading
            legend={<MetricLegend defs={activeSeriesDefs} />}
            controls={
              <>
                {metricsMenu}
                {eventsMenu}
              </>
            }
          />
          <div
            className={cn(
              // `flex-1` so the card takes what the head leaves: at `lg` the
              // grid row is as tall as the tallest column, and without it
              // the card would stop at its content and leave the map and the
              // Rider standing past its foot.
              "min-w-0 flex-1 sm:overflow-hidden sm:rounded-lg sm:bg-card sm:py-5",
              DARK_CARD_HAIRLINE_SM,
            )}
          >
            <ImuChart
              tMs={tMs}
              series={chartSeries}
              events={eventsOn ? data.events : []}
              eventKinds={activeKinds}
              shocks={shocksOn ? data.highG : undefined}
              windowMs={win}
              fullMs={full}
              cursorMs={cursorMs}
              onCursorChange={setCursorMs}
              onLockChange={setCursorLocked}
              // A pinch that grows back to the whole recording IS "reset zoom".
              onWindowChange={([from, to]) =>
                setWindowMs(
                  from <= full[0] && to >= full[1] ? null : [from, to],
                )
              }
              showValues={valuesOn}
            />
            <div className="mt-2 flex items-center gap-1.5 px-5 sm:px-6">
              <ZoomButton label={t.zoom.in} onClick={() => zoomAround(0.5)}>
                <Plus className="size-3.5" />
              </ZoomButton>
              <ZoomButton
                label={t.zoom.out}
                onClick={() => zoomAround(2)}
                disabled={!zoomed}
              >
                <Minus className="size-3.5" />
              </ZoomButton>
              {zoomed && (
                <button
                  type="button"
                  onClick={() => setWindowMs(null)}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
                >
                  <Undo2 className="size-3.5" />
                  {t.zoom.reset}
                </button>
              )}
              {whole && trimOpen && (
                <ImuSessionTrimDialog
                  open={trimOpen}
                  onOpenChange={setTrimOpen}
                  sessionId={sessionId}
                  whole={whole}
                  trim={trim}
                  // The plot's window is on the trimmed clock; the dialog
                  // speaks the whole recording's, so the trim's start is
                  // added back.
                  // The first sample sits a millisecond or two after zero;
                  // an unzoomed left edge is "from the start", not 00:00.001.
                  visibleMs={[
                    (zoomed ? Math.round(win[0]) : 0) + (trim?.startMs ?? 0),
                    Math.round(win[1]) + (trim?.startMs ?? 0),
                  ]}
                />
              )}
              {/* The value pills' control, on the zoom row because both
                  shape what the plot shows of the cursor. A small switch, by
                  request — the panel toggles' track-and-thumb at two thirds
                  the size, since it shares a row with 32px buttons rather
                  than 40px menus. Same inks as theirs: `bg-foreground` track
                  when on, `bg-background` thumb (NOT white — the on-track is
                  light in the dark theme, and a white thumb would sink). */}
              <button
                type="button"
                role="switch"
                aria-checked={valuesOn}
                onClick={() => setValuesOn((on) => !on)}
                // At the row's far end, apart from the zoom cluster it shares a line
                // with: the three buttons act on the window, this one only dresses
                // the cursor's reading.
                // The word in the quiet ink: the switch beside it is the part
                // that says on/off, and a foreground label pulled this to the
                // same weight as the axis figures around it.
                className="ml-auto flex h-8 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground"
              >
                {t.zoom.values}
                <span
                  aria-hidden
                  className={cn(
                    "relative h-4 w-7 shrink-0 rounded-full transition-colors",
                    valuesOn ? "bg-foreground" : "bg-muted-foreground/30",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform",
                      valuesOn && "translate-x-3",
                    )}
                  />
                </span>
              </button>
              {/* The scissors: trim the session to the window shown. On the
                  zoom row because that is the gesture — zoom onto the run,
                  cut — and flush right, an icon in a circle like the zoom
                  pair, and dressed like them whether or not a trim is in
                  force (by request, 2026-09-13) — the label and the dialog
                  say which. */}
              {whole && (
                <button
                  type="button"
                  onClick={() => setTrimOpen(true)}
                  aria-label={trim ? t.zoom.trimSet : t.zoom.trim}
                  title={trim ? t.zoom.trimSet : t.zoom.trim}
                  className="ml-3 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted"
                >
                  <Scissors className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* The instant dashboard — the same cursor, read as instruments. A
            card of its own beside the chart on desktop, a stacked section
            on a phone. */}
        {dashOn && (
          <ImuSessionDashboard
            riderName={riderName}
            progress={dashProgress}
            headline={
              dashSpeedKmh != null
                ? proNumber(dashSpeedKmh, locale, 1)
                : formatSessionTime(tMs[dashIndex])
            }
            headlineUnit={dashSpeedKmh != null ? "km/h" : undefined}
            gForce={gForce[dashIndex]}
            ax={data.channels.ax[dashIndex]}
            axPeak={seriesStats.ax.peak}
            ay={data.channels.ay[dashIndex]}
            leanDeg={seriesValues.lean[dashIndex] as number}
            pitchDeg={pitchValues[dashIndex]}
            // No padding on the card itself: its sections are told apart by
            // rules that have to reach both edges, and a padded card would
            // hold every one of them off by 15px. Each section pads itself
            // instead.
            //
            // Off the phone entirely. It is the one block that says nothing
            // the plot and the reading have not already said — a dial and
            // two attitudes of the instant under a cursor you are holding
            // with the same thumb — and on a screen you scroll it was a
            // whole panel between the reader and the end of the page. Hidden
            // and not unmounted: the same instance is back at `sm` with no
            // state to rebuild.
            //
            // `order-4` is still live where it IS shown and stacked — the
            // `sm`-to-`lg` band — and puts it under the reading there for
            // the same reason. From `lg` it is the first column again.
            className={cn(
              "order-4 mt-4 hidden min-w-0 sm:flex sm:rounded-lg sm:bg-card lg:order-1 lg:mt-0",
              DARK_CARD_HAIRLINE_SM,
            )}
          />
        )}

        {/* The route, cursor-synchronized both ways. On a phone it takes a
              band of its own under the chart; from `sm` it becomes a card of
              its own, and from `lg` that card stands beside the plot at its
              full height — the mockup's shape. Its card is the app's fixed
              dark surface: the imagery is dark-treated, so a white card
              around it would be a bright frame on a dark picture. The filter
              switches govern its marks too — the rule that a kind switched
              off is off everywhere. */}
        {data.gps && mapOn && (
          // `isolate` fences the map in. Leaflet gives its panes z-indexes
          // from 200 to 1000, and with no stacking context around them those
          // numbers competed with the whole page — the filter menus opened
          // from the heading row and the map painted straight over them,
          // because a popover sits at z-40 and a Leaflet control at 800.
          // Raising the popover was the wrong lever: it is a shared primitive
          // and above 1000 it would also cover dialogs (z-50) and toasts.
          // Isolating turns the map into one opaque layer that stacks by
          // document order, so its internals stop bidding against the app.
          // The resize handle is inside this same fence, which is why its
          // z-[1100] still clears the panes.
          //
          // `//` and not `{/* */}`: this div is the whole of a `&&`
          // expression, and a JSX comment there is a second child where only
          // one is allowed. That trap has now bitten seven times.
          // A card at every width, under the plot on a phone and beside it
          // from `lg`. It was a 104px thumbnail on the phone for a week
          // (2026-08-26 to 09-05), inert and lifted over the plot's corner,
          // on the argument that the map made itself the subject of a
          // screen about numbers. The first rides on a real bike said the
          // opposite: a map you cannot read or touch is a picture, and the
          // rider wanted to see where the curve was. So it is a map again —
          // 280px tall, interactive, credited — and the reading follows it.
          <div
            className="relative isolate order-2 mt-4 min-w-0 lg:order-3 lg:mt-0"
            style={{ "--imu-map-h": `${mapHeight}px` } as React.CSSProperties}
          >
            <ImuSessionMap
              gps={data.gps}
              events={
                eventsOn
                  ? data.events.filter((event) => activeKinds.has(event.kind))
                  : []
              }
              windowMs={win}
              speedOn={activeSeries.has("speed")}
              cursorMs={cursorMs}
              // A pinned cursor stays pinned: only the plot locks and
              // unlocks (by request, 2026-09-10), so a tap on the map while
              // it holds is not a seek.
              onSeek={(ms) => {
                if (!cursorLocked) setCursorMs(ms);
              }}
              title={t.map.title}
              // The hairline reaches the map too. Its surface is `--sidebar`
              // rather than `--card` — a fixed dark panel in both themes — so
              // in the light theme it is already a dark card on a light page
              // and needs no help; in the dark one it is #1c1c1c against
              // #17181b, the same vanishing edge every other card had.
              className={cn(
                // A card with the card radius at every width — as tall as
                // the grip under it says, 280px until dragged; from `lg` it
                // fills the column beside the plot.
                "h-[var(--imu-map-h)] rounded-lg lg:h-full",
                DARK_CARD_HAIRLINE_SM,
              )}
            />
            {/* The resize handle, straddling the edge the two columns
                  share — the split is what it adjusts, so it stands on the
                  split. A separator by role, with the separator's keyboard
                  contract; the arrows move the edge the way they point, and
                  a double click restores the default framing. Desktop only:
                  below `lg` the two are stacked and there is no split. */}
            <button
              type="button"
              role="separator"
              aria-orientation="vertical"
              aria-label={t.map.resizeWidth}
              aria-valuenow={Math.round(mapWidth)}
              aria-valuemin={MAP_MIN_W}
              onPointerDown={startMapResize}
              onPointerMove={moveMapResize}
              onPointerUp={endMapResize}
              onPointerCancel={endMapResize}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setSplitHover(true);
              }}
              onPointerLeave={() => setSplitHover(false)}
              onBlur={() => setSplitHover(false)}
              onDoubleClick={() => setMapWidth(MAP_DEFAULT_W)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft")
                  setMapWidth((w) => Math.min(maxMapWidth(), w + 24));
                else if (event.key === "ArrowRight")
                  setMapWidth((w) => Math.max(MAP_MIN_W, w - 24));
                else return;
                event.preventDefault();
              }}
              // z above 1000: the Leaflet panes inside the sibling map div
              // carry z-indexes up to 1000 (controls) in this same stacking
              // context, and at z-20 the map painted over the handle.
              //
              // The button is a 32px-wide grab area and the bar inside it is
              // 4px of it. A 4px target is a target you miss; a 32px one
              // that LOOKS 4px is the grip every split view uses. Centred on
              // the channel between the cards — half the gap left of the
              // map's edge — where it reads against the page instead of
              // against the dark map it would otherwise sit on.
              className="absolute top-1/2 left-0 z-[1100] hidden h-24 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center outline-none focus-visible:[&>span]:bg-foreground lg:-ml-[11px] lg:flex"
            >
              {/* Always there, and grey until the hand is on it. The disc it
                  replaces only appeared within 48px of the boundary, which
                  meant the split existed but nothing said so — you had to
                  already know to go looking. A rule standing in the channel
                  says "this edge moves" without asking for the page's
                  attention.
                  `--border` on the page is a hair too faint to read as a
                  grip, so it takes the `--muted-foreground` at 40%, and goes
                  to full `--foreground` under the hand or through a drag. */}
              <span
                aria-hidden
                className={cn(
                  "h-full w-1 rounded-full transition-colors",
                  splitActive || splitHover
                    ? "bg-foreground"
                    : "bg-muted-foreground/40",
                )}
              />
            </button>
            {/* The phone's grip: under the map, where its bottom edge is
                the one that moves. Full width so a thumb finds it, 32px
                tall, and the same 4px bar as the split handle — a short one,
                lying down. A separator by role with the arrows moving the
                edge the way they point and a double tap restoring 280px.
                `lg:hidden`, the mirror of the split handle's `lg:flex`. */}
            <button
              type="button"
              role="separator"
              aria-orientation="horizontal"
              aria-label={t.map.resizeHeight}
              aria-valuenow={Math.round(mapHeight)}
              aria-valuemin={MAP_MIN_H}
              aria-valuemax={MAP_MAX_H}
              onPointerDown={startMapHeightResize}
              onPointerMove={moveMapHeightResize}
              onPointerUp={endMapHeightResize}
              onPointerCancel={endMapHeightResize}
              onDoubleClick={() => setMapHeight(MAP_DEFAULT_H)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown")
                  setMapHeight((h) => Math.min(MAP_MAX_H, h + 24));
                else if (event.key === "ArrowUp")
                  setMapHeight((h) => Math.max(MAP_MIN_H, h - 24));
                else return;
                event.preventDefault();
              }}
              className="flex h-8 w-full cursor-ns-resize touch-none items-center justify-center outline-none focus-visible:[&>span]:bg-foreground lg:hidden"
            >
              <span
                aria-hidden
                className={cn(
                  "h-1 w-12 rounded-full transition-colors",
                  heightActive ? "bg-foreground" : "bg-muted-foreground/40",
                )}
              />
            </button>
          </div>
        )}

        {/* Details of the instant under the cursor — the headline is the main
            event (or "Andamento normal"), its figures computed from the raw
            channels over the event's window, and the raw sample itself sits
            underneath, all channels, whatever the chart is drawing.

            The floor exists because this card is read WHILE scrubbing, and its
            content changes size under the cursor: an instant no event covers
            carries one figure, a curve carries five over two rows. Left to its
            natural height the page grew and shrank with every event the cursor
            crossed, which moves everything on screen. 248px is the tallest
            single-card reading measured (a curve, at 200px of card inside 48px
            of padding) — enough that entering or leaving an event moves
            nothing. Two events at the same instant — an impact inside a rough
            section — still stack two cards and still grow past it. */}
        <div
          className={cn(
            "min-h-[248px] border-t border-border px-5 pt-5 pb-6 sm:rounded-lg sm:border-0 sm:bg-card/40 sm:p-6",
            // It lives inside the columns block now, which is what lets the
            // Rider panel fall past it on a phone — `order` can only shuffle
            // siblings, and these two were in different parents.
            //
            // `order-3` on a phone: third of four, straight after the map,
            // still flush against it with its own top rule. `lg:order-4`
            // plus `col-span-full` puts it across the foot of the grid,
            // where it stood as the block's last sibling before.
            //
            // The 22px above it is a margin at every width from `sm`, and
            // the grid's gap was narrowed to `gap-x` so nothing adds to it.
            // The block used to get that space from the parent's `space-y`,
            // which stops reaching it a level down. Leaving it to a row gap
            // instead does not cover the case where both panels are off:
            // there the grid never engages, the container stays a flex
            // column, and there is no row gap to give — measured, the card
            // came up flush against the plot. One rule owns the distance in
            // every combination. Zero only on a phone, where the top rule is
            // the divider and a gap would leave it floating.
            "order-3 sm:mt-[22px] lg:order-4 lg:col-span-full",
            // The identity card's treatment, and only from `sm` for the same
            // reason the hairline is: below that this is a transparent section
            // inside the one big card, and neither a translucent fill nor a
            // ring means anything there. The light outline is what the 40%
            // fill costs — #f5f5f5 against the page's #efefef no longer draws
            // its own edge. Dark keeps the hairline's 60%.
            "sm:ring-1 sm:ring-inset sm:ring-border",
            DARK_CARD_HAIRLINE_SM,
          )}
        >
          {cursorIndex < 0 ? (
            <p className="text-sm text-muted-foreground">{t.reading.prompt}</p>
          ) : (
            // Desktop reads the two side by side — the channels on the left, the
            // event on the right — because they answer the same instant from two
            // directions and stacking them puts a scroll between the question and
            // its answer. The phone keeps them stacked, channels first.
            <div
              ref={readGridRef}
              // The split rides a custom property for the reason the map's
              // does: the grid only exists from `lg` up, and an inline style
              // cannot carry a breakpoint. `1fr` at rest, so an untouched
              // panel is the halves it always was.
              style={
                {
                  // `minmax(0,1fr)` at rest and not a bare `1fr`: a plain
                  // `1fr` is `minmax(auto,1fr)`, so the track refuses to go
                  // below its content's minimum and the halves come out
                  // uneven the moment the channels hold two cards side by
                  // side — measured, 776/507 where 646/646 was meant.
                  "--imu-read-w":
                    readWidth != null ? `${readWidth}px` : "minmax(0,1fr)",
                } as React.CSSProperties
              }
              className={cn(
                // 22px, the lab's channel between cards — the same one the
                // chart, the Rider and the map already stand apart by, so the
                // reading below them reads as the same page and not as a
                // block with a rhythm of its own.
                "lg:items-start lg:gap-[22px] lg:grid",
                // The events' half always stands, empty or not — an outline
                // where the cards would be, because it carries the handle.
                // The channels' half does not (by request, 2026-09-11): with
                // no metric on it folds away, the split and its handle go
                // with it, and the events take the whole row. An outline
                // saying "no metrics" beside a full-width card was a column
                // reserved for nothing.
                activeSeriesDefs.length > 0
                  ? "lg:grid-cols-[var(--imu-read-w)_minmax(0,1fr)]"
                  : "lg:grid-cols-1",
              )}
            >
              {/* Only what the chart is drawing — toggling a pill toggles its
                  reading here too. Each channel is a row of its own, ruled off
                  from the next. The recorded ones carry no heading; the computed
                  ones keep theirs, because "Derivadas (calculadas)" is the label
                  that says where roughness/jerk/lean come from.

                  The card is a desktop affair: on a phone these rows already
                  have the section to themselves, and a card each inside the
                  reading's own card would draw a second frame a few pixels
                  from the first — the rule the Rider panel already carries.
                  Below `lg` they stay plain rows told apart by a rule. */}
              {/* Gone entirely while no metric is on — not an outline, at
                  any width: stacked it was 128px of nothing to scroll past
                  (2026-09-10), side by side it was a column held open for
                  nothing (2026-09-11). The ref stays on it for the drag,
                  which cannot start while it is hidden. */}
              <div
                ref={readLeftRef}
                className={cn(
                  "min-w-0",
                  activeSeriesDefs.length === 0 && "hidden",
                )}
              >
                {[
                  {
                    key: "raw",
                    heading: null,
                    defs: activeSeriesDefs.filter(
                      (def) => !DERIVED_IDS.has(def.id),
                    ),
                  },
                  {
                    key: "derived",
                    heading: t.reading.derived,
                    defs: activeSeriesDefs.filter((def) =>
                      DERIVED_IDS.has(def.id),
                    ),
                  },
                ]
                  .filter((group) => group.defs.length > 0)
                  .map((group, gi) => (
                    <div
                      key={group.key}
                      // Two sub-columns where the half is wide enough for
                      // them, one where it is not — and never three. The
                      // edge the reader drags is what chooses, since this
                      // column's width is not the window's and no breakpoint
                      // could see it.
                      //
                      // The ceiling of two is the `max()` inside the track's
                      // minimum: half the row, less one channel, is a floor
                      // no third column can squeeze past, and on a narrow
                      // half the 320px floor wins instead and leaves one.
                      // The 11 in it IS the gap below — the two are one
                      // number written twice, because a track function
                      // cannot read the gap it is laid out with. Half the
                      // 22px between the halves: cards of one group are one
                      // subject, and the wider channel is what tells the two
                      // subjects apart.
                      //
                      // `auto-fit` and not `auto-fill`: with one card the
                      // second track collapses instead of standing there
                      // empty, so a lone channel takes the half it was given
                      // rather than half of it.
                      className="lg:grid lg:grid-cols-[repeat(auto-fit,minmax(max(320px,(100%_-_11px)/2),1fr))] lg:gap-[11px]"
                    >
                      {group.heading && (
                        <p
                          className={cn(
                            "text-xs font-medium text-muted-foreground lg:col-span-full",
                            // The rule under it is a phone affair: at `lg` the
                            // channels are separate cards, and a line drawn
                            // across the gap between them would belong to
                            // neither.
                            gi > 0 &&
                              "mt-5 border-t border-border pt-5 lg:border-t-0 lg:pt-0",
                          )}
                        >
                          {group.heading}
                        </p>
                      )}
                      {group.defs.map((def, i) => (
                        <div
                          key={def.id}
                          className={cn(
                            // A card of its own from `lg`. Below that, the rule
                            // separates one channel from the next, and the
                            // first of a group never carries one: above it
                            // there is either the group's heading or the top of
                            // the panel, both of which already close the space.
                            // The margins are the phone's rhythm only: at `lg`
                            // the cards are grid items and the gap between
                            // them is the grid's, so a margin here would add
                            // to it instead of replacing it.
                            "lg:rounded-[12px] lg:border lg:border-border lg:bg-card lg:p-5 lg:mt-0",
                            i > 0
                              ? "mt-5 border-t border-border pt-5"
                              : group.heading
                                ? "mt-3"
                                : gi > 0 && "mt-5",
                          )}
                        >
                          {/* The head: what the channel IS on the left, what it
                              did across the whole recording on the right.
                              The two lines on the left are `leading-tight` and
                              carry no margin between them: at this size the gap
                              that shows is half-leading, not margin, so
                              tightening the boxes is what halves it — the bike
                              header's totals again. */}
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <div className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 text-base leading-tight font-semibold">
                                <span
                                  aria-hidden
                                  className="size-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: def.color }}
                                />
                                {/* The name is the only part allowed to give:
                                    if a longer one ever arrives it ellipsizes
                                    rather than pushing the figures out of the
                                    card. */}
                                <span className="truncate">{def.label}</span>
                                {/* The full sentence lives behind the (i) so
                                  the line under the name can be a two-word
                                  summary. A popover and not a tooltip: this is
                                  read on a phone, and hover is not a thing a
                                  finger does. */}
                                <Popover>
                                  <PopoverTrigger
                                    aria-label={t.reading.whatIs(def.label)}
                                    className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                                  >
                                    <Info className="size-3.5" />
                                  </PopoverTrigger>
                                  <PopoverContent align="start" className="p-4">
                                    <p className="text-sm font-semibold">
                                      {def.label}
                                    </p>
                                    <p className="mt-1.5 text-sm text-muted-foreground">
                                      {def.description}
                                    </p>
                                  </PopoverContent>
                                </Popover>
                              </span>
                              <p className="pl-3.5 text-sm leading-tight text-muted-foreground">
                                {def.summary}
                              </p>
                            </div>
                            <SessionStatLine
                              stats={seriesStats[def.id]}
                              unit={def.unit}
                              locale={locale}
                            />
                          </div>

                          {/* The instant itself, and its gauge. The gauge's
                              full end is that channel's own peak in this
                              session — for the G force, the same 7.41 printed
                              up in the stats. Nothing global: two recordings
                              are not on the same scale, and saying so would
                              invent a comparison the data does not support.

                              The figure sits in a cell of its own width so the
                              gauge lands at the same x in every card and stays
                              there: without it a sign appearing or an integer
                              digit arriving shoved every ramp sideways while
                              the cursor moved. */}
                          <div className="mt-4 flex items-center justify-between gap-3">
                            {/* 22px and not the scale's 24: two points down,
                                asked for after seeing it beside the stat box.
                                Written as a value because the scale has no
                                rung there — `text-xl` is 20. */}
                            <span className="min-w-[132px] text-[22px] leading-none font-semibold tabular-nums whitespace-nowrap sm:min-w-[164px]">
                              {proNumber(
                                seriesValues[def.id][cursorIndex],
                                locale,
                                4,
                              )}{" "}
                              <span className="text-sm font-normal text-muted-foreground">
                                {def.unit}
                              </span>
                            </span>
                            <MetricGauge
                              value={seriesValues[def.id][cursorIndex]}
                              peak={seriesStats[def.id].peak}
                              signed={!UNSIGNED_IDS.has(def.id)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>

              {/* The instant's headline event as a card of its own: mark, name,
                  confidence, then its figures as labelled columns.

                  "Andamento normal" is the card for an instant no event covers.
                  Turning the events off leaves the channels alone and puts an
                  outline here instead — the half stays, because it carries the
                  handle that splits the two. */}
              <div
                className={cn(
                  // No top margin stacked when there is nothing above to
                  // stand apart from — the metrics half is gone.
                  activeSeriesDefs.length > 0 && "mt-5",
                  "lg:relative lg:mt-0",
                  // The same `auto-fit` the channels use, against the same
                  // floor: a half wide enough for two event cards side by
                  // side gets them, and the cards themselves never had to
                  // know about it.
                  //
                  // Only while there ARE cards. That floor is 320px — a
                  // card's width — and a track cannot go under it, so with
                  // the events hidden the outline was held at 320 inside a
                  // half the handle had taken down to 200 and spilled 120px
                  // out of the card. Nothing to lay out, no layout: the
                  // outline is then the half's only child and simply fills
                  // it.
                  eventsOn &&
                    "lg:grid lg:grid-cols-[repeat(auto-fit,minmax(max(320px,(100%_-_11px)/2),1fr))] lg:items-start lg:gap-[11px]",
                )}
              >
                {!eventsOn && (
                  <ReadingPlaceholder>
                    {t.menus.eventsHidden}
                  </ReadingPlaceholder>
                )}
                {eventsOn && (
                  // A fragment because the switch guards two things — the
                  // headline card and whatever else covers the same instant.
                  <>
                    <EventCard
                      title={primaryDesc ? primaryDesc.title : null}
                      Icon={primaryDesc ? primaryDesc.Icon : Bike}
                      timeMs={tMs[cursorIndex]}
                      outsideMs={primaryOffsetMs}
                      confidence={primaryEvent?.confidence ?? null}
                      // "Snapshot" on an event the cursor is INSIDE, when
                      // the recording has a track to put gates on. Not on
                      // the ghost card outside the event — that one is a
                      // neighbour's, and a Snapshot made from it would be
                      // of a corner the cursor is not in.
                      action={
                        snapshotSession &&
                        primaryEvent &&
                        primaryOffsetMs === 0 &&
                        snapshotKindOf(primaryEvent) ? (
                          <ImuSnapshotCreate
                            prepared={snapshotSession}
                            event={primaryEvent}
                            sessionId={sessionId}
                            existing={existingSnapshots}
                            loadSession={loadSnapshotSession}
                          />
                        ) : undefined
                      }
                      metrics={
                        primaryDesc
                          ? primaryDesc.metrics
                          : [
                              {
                                label: t.event.gforce,
                                value: proNumber(
                                  gForce[cursorIndex],
                                  locale,
                                  2,
                                ),
                                unit: "G",
                              },
                            ]
                      }
                    />

                    {/* Anything else COVERING the same instant — a rough section
                      under an impact, say — gets the same card, one rung
                      quieter. Covering, not merely within reach: the reach
                      is what keeps the headline card standing past its
                      event's edges, and with two seconds of it a panel that
                      listed every neighbour showed four corners at once. */}
                    {cursorHits
                      .slice(1)
                      .filter(({ offsetMs }) => offsetMs === 0)
                      .map(({ event, offsetMs }, i) => {
                        const desc = describeEvent(
                          event,
                          eventContext,
                          t,
                          locale,
                        );
                        return (
                          <EventCard
                            key={i}
                            // Phone rhythm only — at `lg` these are grid items and
                            // the gap is the grid's.
                            className="mt-2 lg:mt-0"
                            title={desc.title}
                            Icon={desc.Icon}
                            outsideMs={offsetMs}
                            confidence={event.confidence}
                            // "Comparar" here too (by request, 2026-09-20):
                            // a brake inside a corner is never the headline
                            // card, and was the one event with gates of its
                            // own that could not be compared. These cards
                            // only stand while the cursor is inside their
                            // event, which is the headline's own rule.
                            action={
                              snapshotSession && snapshotKindOf(event) ? (
                                <ImuSnapshotCreate
                                  prepared={snapshotSession}
                                  event={event}
                                  sessionId={sessionId}
                                  existing={existingSnapshots}
                                  loadSession={loadSnapshotSession}
                                />
                              ) : undefined
                            }
                            metrics={desc.metrics}
                          />
                        );
                      })}
                    {cursorShock && (
                      <EventCard
                        className="mt-2 lg:mt-0"
                        title={t.event.shockTitle}
                        Icon={Activity}
                        timeMs={cursorShock.timeMs}
                        confidence={null}
                        action={<ShockWindow hit={cursorShock} />}
                        metrics={[
                          {
                            label: t.event.peak,
                            value: proNumber(cursorShock.peakG, locale, 1),
                            unit: "G",
                          },
                          {
                            label: t.event.width,
                            value: proNumber(
                              highGWidthMs(cursorShock),
                              locale,
                              1,
                            ),
                            unit: "ms",
                          },
                          // What the main IMU read of the same hit — the
                          // figure every other card and the plot go by.
                          ...(() => {
                            const peak = windowPeak(
                              tMs,
                              gForce,
                              cursorShock.timeMs - HIGHG_LINK_MS,
                              cursorShock.timeMs + HIGHG_LINK_MS,
                            );
                            return peak != null
                              ? [
                                  {
                                    label: t.event.mainImu,
                                    value: proNumber(peak, locale, 1),
                                    unit: "G",
                                  },
                                ]
                              : [];
                          })(),
                        ]}
                      />
                    )}
                  </>
                )}

                {/* The handle on the halves' shared edge — the chart/map
                      split's twin, and deliberately the same object: one
                      grip idiom on this page, not two. Standing in the
                      channel it always says the edge moves, instead of
                      waiting to be discovered. Arrows move it the way they
                      point; a double click puts the halves back. */}
                <button
                  type="button"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t.reading.split}
                  // Only once the reader has moved it: at rest the split is
                  // `1fr` and its width lives in the DOM, and reading a ref
                  // during render is exactly what this project's lint rule
                  // forbids. No value beats a value measured at the wrong
                  // moment.
                  aria-valuenow={
                    readWidth != null ? Math.round(readWidth) : undefined
                  }
                  aria-valuemin={readMinLeft}
                  onPointerDown={startReadResize}
                  onPointerMove={moveReadResize}
                  onPointerUp={endReadResize}
                  onPointerCancel={endReadResize}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setReadHover(true);
                  }}
                  onPointerLeave={() => setReadHover(false)}
                  onBlur={() => setReadHover(false)}
                  onDoubleClick={() => setReadWidth(null)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight")
                      setReadWidth(
                        Math.min(maxReadWidth(), currentReadWidth() + 24),
                      );
                    else if (event.key === "ArrowLeft")
                      setReadWidth(
                        Math.max(readMinLeft, currentReadWidth() - 24),
                      );
                    else return;
                    event.preventDefault();
                  }}
                  // A 32px grab area showing 4px of bar: a 4px target is a
                  // target you miss. Centred on the channel — half the gap
                  // left of this column's edge. It is a grid item like the
                  // cards, so it is taken out of the flow with `absolute`;
                  // otherwise it would claim a cell of its own and push one
                  // card off the row.
                  className={cn(
                    "absolute top-1/2 left-0 z-20 hidden h-24 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center outline-none focus-visible:[&>span]:bg-foreground lg:-ml-[11px]",
                    // No split to move while the channels' half is gone.
                    activeSeriesDefs.length > 0 && "lg:flex",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-full w-1 rounded-full transition-colors",
                      readActive || readHover
                        ? "bg-foreground"
                        : "bg-muted-foreground/40",
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SessionCards>
  );
}

/**
 * The wave glyph beside "Telemetria" — the phone's card head and the
 * desktop twin wear the same one, so it is written once.
 *
 * The stroke is 2.25 and not 1.5 because what gets painted is
 * `width × (size on screen ÷ viewBox)`: the art is drawn in a 30-wide box
 * and rendered at 20px, so 1.5 ÷ (20/30) is what lands on the page's
 * 1.5px. Changing the size means changing both numbers.
 */
const TELEMETRY_GLYPH_CLASS =
  "h-auto w-[20px] shrink-0 text-foreground [&_path]:[stroke-width:2.25]";

/**
 * The marks in an event card's box of facts: full ink where the résumé's
 * tiles are muted, at the same 1.5px stroke (by request, 2026-09-11 — 2px
 * was tried the same day and read too heavy against the figures).
 *
 * The width is pinned ON THE PAGE, whatever the glyph: the box holds
 * supplied art in 19- to 24-unit viewBoxes and Lucide's 24, each with a
 * stroke tuned to its own box, and one override in units would paint a
 * different width on each. `non-scaling-stroke` makes the width a screen
 * measure, so the same 1.5px lands on all of them — and on every element,
 * not just `path`, because Lucide draws circles and lines too.
 */
const FACT_ICON_CLASS =
  "size-5 shrink-0 text-foreground [&_*]:[vector-effect:non-scaling-stroke] [&_*]:[stroke-width:1.5px]";

/**
 * The page's shell.
 *
 * **A phone keeps two cards** — what the recording IS, and the reading of
 * it: the two are a scroll apart there, and a rule between them would be a
 * hairline asking to be noticed where a gap says the same thing unread.
 *
 * **A wide screen breaks the second card apart**, one card per subject:
 * identity beside its figures, the two filter sets, then the plot, the map
 * and the readout. The single continuous card was one object holding five
 * unrelated things, and at this width that reads as a wall; separate cards
 * let the eye find the one it wants. The sections carry their own
 * `sm:rounded-lg sm:bg-card`, so this wrapper simply stops being a card
 * from `sm` up.
 *
 * The identity card is rendered whatever the file does — while it downloads,
 * and if it fails — so the page never opens on a spinner alone.
 */
function SessionCards({
  header,
  resume,
  children,
}: {
  header: ReactNode;
  /** The résumé figures, once the file has been parsed. */
  resume?: ReactNode;
  children: ReactNode;
}) {
  const t = useProDict().analysis;
  return (
    <div className="space-y-[18px]">
      {/* Identity and its figures: stacked while there is no room, side by
          side from `2xl`, which is where nine tiles still read beside the
          name. At `xl` they were 81px wide and "36.0 km/h" broke in two —
          measured, not guessed. Stacked, the figures take the full width and
          go back to one comfortable row from `lg`. */}
      <div
        className={cn(
          // Opaque white again. It spent a while at 40%, letting the lab's
          // dot texture through, and the light outline that went with it has
          // gone too — that ring existed only because the translucent fill
          // landed on #f5f5f5 against a #efefef page and stopped drawing its
          // own edge. White on the page reads on its own, which is the rule
          // the rest of the app keeps.
          // `relative`: the header's settings button is absolutely placed,
          // and from `2xl` — where the header is a column beside the tiles —
          // it measures its corner from this card, not from the column. The
          // `2xl:pr-12` is that button's lane: the tiles reach 24px short of
          // the card's edge, and the button, 40px wide 8px in, would land on
          // the last tile's top corner without it.
          "relative rounded-lg bg-card 2xl:flex 2xl:items-center 2xl:justify-between 2xl:gap-6 2xl:pr-12",
          DARK_CARD_HAIRLINE,
        )}
      >
        {header}
        {resume}
      </div>
      {/* `mt-5` — 20px above this block, half the 40 it carried. The 40 was
          there to make the recording's identity and its reading read as two
          chapters rather than two cards in a list, and it no longer has to
          do that work alone: the block below now opens on the page with its
          own switch row and the plot's head, which separate the two on their
          own.

          Written as a margin on this side and not as a bigger `space-y`
          above, which would have stretched every gap on the page. And it has
          to be LARGER than the 18px the `space-y` puts under the card above:
          adjacent sibling margins collapse to the greater of the two rather
          than adding up, so anything up to 18 here would change nothing —
          which is also the floor this value cannot go under. */}
      <div
        className={cn(
          "mt-5 rounded-lg bg-card sm:space-y-[18px] sm:rounded-none sm:bg-transparent",
          // A card only on a phone: the ring goes with the background.
          DARK_CARD_HAIRLINE,
          "sm:dark:ring-0",
        )}
      >
        {/* The reading's title. On a phone it is the head of the one card
            that follows; on desktop it stands on the page between the
            filters and the plot they configure — see the twin below. */}
        <div className="flex items-center gap-2.5 px-5 pt-5 sm:hidden">
          <ImuChartGlyph className={TELEMETRY_GLYPH_CLASS} />
          <h2 className="font-display text-xl font-semibold">{t.telemetry}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * In what frame the reading is: the sensor's, or the bike's. One quiet line
 * beside the panel switches, because it changes what every lean, pitch and
 * braking figure on the page means.
 *
 * Three states, in the words the rider needs: "Sensor" when the file has
 * no calibration; "Bicicleta" when gravity is on +Z; and, when the ride
 * could also say where forward is, the angle the sensor sits at and how
 * sure the vote was. A ride without GPS, or without enough accelerating
 * and braking to vote, says so instead of pretending. An inverted lateral
 * check is a warning, not a badge: it means the axes do not behave as a
 * right-handed sensor's should, and nothing on the page should be trusted
 * until the firmware says why.
 */
/**
 * Says when the file arrived with its frames rotated and the reader had to
 * put the words back (realign.ts). A warning colour on purpose: the numbers
 * on the page are now believed, not read, and the firmware still has the
 * fault. Nothing when the file was clean.
 */
function RealignmentBadge({ session }: { session: ImuSessionData }) {
  const t = useProDict().analysis.realignment;
  const r = session.realignment;
  if (!r || (r.rotatedMs <= 0 && r.unresolvedMs <= 0)) return null;
  const pct = Math.round((r.rotatedMs / r.totalMs) * 100);
  const lost = Math.round((r.unresolvedMs / r.totalMs) * 100);
  const stretches = r.segments.filter((s) => s.k !== 0).length;
  let text = t.text(pct);
  let title = t.title(stretches, Math.round(r.windowMs / 100) / 10);
  if (lost >= 5) {
    text += t.lost(lost);
    title += t.lostTitle(lost);
  }
  return (
    <span className="text-xs text-destructive tabular-nums" title={title}>
      {text}
    </span>
  );
}

function MountingBadge({ session }: { session: ImuSessionData }) {
  const t = useProDict().analysis.mounting;
  const { aligned, mounting } = session;
  if (!aligned) {
    return (
      <span className="text-xs text-muted-foreground" title={t.sensorTitle}>
        {t.sensor}
      </span>
    );
  }
  const pct = mounting ? Math.round(mounting.confidence * 100) : 0;
  const yaw = mounting ? Math.round(mounting.yawDeg) : 0;
  let text: string;
  let title: string;
  let warn = false;
  if (!mounting) {
    text = t.frontUndefined;
    title = t.frontUndefinedTitle;
  } else if (mounting.source === "logger") {
    const from = session.orientation?.inheritedFrom;
    text = from ? t.orientationFrom(from, pct) : t.frontByLogger(pct);
    title = t.loggerTitle(mounting.intervals, pct, yaw);
    if (from) title += t.inheritedTitle(from);
  } else if (mounting.applied) {
    text = t.frontAt(yaw, pct);
    title = t.gpsTitle(mounting.intervals, pct);
  } else {
    text = t.frontUncertain(pct);
    title = t.uncertainTitle(yaw, pct, mounting.intervals);
  }
  if (mounting && mounting.headingCheck === "inverted") {
    warn = true;
    text += t.invertedAxes;
    title += t.invertedTitle;
  }
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        warn ? "text-destructive" : "text-muted-foreground",
      )}
      title={title}
    >
      {text}
    </span>
  );
}

/**
 * The panel switches, alone on the page above the cards they govern.
 *
 * They are the only controls left outside a card, and that is the point:
 * the metric and event menus decide what is drawn INSIDE the plot and now
 * ride on its own head, while these two decide which cards stand at all.
 * A control that adds and removes cards does not belong to any one of them.
 *
 * Right-aligned on an otherwise empty row, so the eye meets the three cards
 * first and finds the switches only when it looks for them.
 */
function PanelSwitchRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden justify-end gap-2 px-1 pt-1 sm:flex">{children}</div>
  );
}

/** How many metrics the legend names before it starts counting. Four is what
 * fits beside the title in the narrowest desktop column measured; past that
 * the names would start eating the menus. */
const LEGEND_MAX = 4;

/**
 * What the plot is drawing, said in its own head.
 *
 * A legend and not a control: the menu beside it is the single place a
 * metric is switched, and putting a second set of toggles here would bring
 * back exactly the two-controls-for-one-job the pill wall was removed for.
 * What it buys back is the state at a glance that a closed menu cannot give
 * — and it costs nothing to keep true, since it reads the same list the
 * plot does.
 *
 * The mark is the series' own colour, so the chip and the line it names are
 * the same object. Past four it counts the rest, because the row has a menu
 * and a title to house as well.
 */
function MetricLegend({
  defs,
}: {
  defs: { id: string; label: string; color: string }[];
}) {
  if (defs.length === 0) return null;
  const shown = defs.slice(0, LEGEND_MAX);
  const rest = defs.length - shown.length;
  return (
    // Nothing here shrinks. Four names plus the title plus two menus ask for
    // more than the middle column has at 1400, and the first version let the
    // names truncate to keep one line — which produced "● F.", a chip that
    // names nothing. A legend that cannot be read is not a legend, so the
    // row wraps instead (see the head) and the head grows a line on the one
    // case that causes it: many metrics on at once.
    <div aria-hidden className="flex items-center gap-1.5">
      {shown.map((def) => (
        <span
          key={def.id}
          // White, where the menus beside it are the page's own colour. On
          // the background `--muted` is #f1f1f1 against #efefef — two levels,
          // a chip you cannot see. Making it white instead of outlining it
          // like the menus is also the tell: an outlined pill next to an
          // outlined menu invites a click, and this one does nothing.
          // `rounded-[6px]`, not a token: the app's scale starts at 11px
          // (`rounded-sm`) and a 24px-tall chip at 11 is most of the way to
          // a capsule, which is the shape the controls use. A small radius
          // is the second thing, after the fill, that keeps a legend from
          // reading as something you press.
          className="flex h-6 shrink-0 items-center gap-1.5 rounded-[6px] bg-card px-2 text-xs font-medium"
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: def.color }}
          />
          {def.label}
        </span>
      ))}
      {rest > 0 && (
        <span className="flex h-6 shrink-0 items-center rounded-[6px] bg-card px-2 text-xs font-medium text-muted-foreground">
          +{rest}
        </span>
      )}
    </div>
  );
}

/**
 * The plot's head: the mark, the name, what is being drawn, and the two
 * menus that decide it.
 *
 * On the page background and not on the card, which is the whole point of
 * where it sits. It used to stand above all THREE cards, which said it
 * governed all three — it never did; the Rider panel and the map take
 * nothing from these menus but the event filter. Now it stands above one,
 * in that column, on the page: a section title over the section it names,
 * with the picture in a card beneath. Put inside the card it read as a
 * strip of chrome bolted to the plot.
 *
 * No side padding: it lines up with the card's edges rather than with the
 * axis times inside it. Standing on the page it belongs to the column, not
 * to the plot's inner grid, and an inset would have read as a margin nobody
 * else on this page keeps.
 */
function ChartCardHeading({
  legend,
  controls,
}: {
  legend?: React.ReactNode;
  controls?: React.ReactNode;
}) {
  const t = useProDict().analysis;
  return (
    // `flex-wrap` and a row gap: the legend never shortens a name, so when
    // the title, four chips and two menus do not fit — the middle column is
    // 617px at 1400 and four chips alone want ~290 — the menus drop to a
    // second line rather than everything being crushed on one. Costs 36px of
    // head, and only while many metrics are on.
    <div className="mb-4 hidden flex-wrap items-center gap-x-2.5 gap-y-2 sm:flex">
      <ImuChartGlyph className={TELEMETRY_GLYPH_CLASS} />
      <h2 className="font-display text-xl font-semibold whitespace-nowrap">
        {t.telemetry}
      </h2>
      {legend}
      {controls && (
        // Pushed to the far end by `ml-auto` rather than by making the row
        // `justify-between`: the glyph and the title are one group with a
        // gap of their own, and space-between would have prised them apart.
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {controls}
        </div>
      )}
    </div>
  );
}

/** The gauge's box, in the units the wedge is drawn in. */
const GAUGE_HALF = 56;
const GAUGE_H = 20;
/**
 * The box the reading gets, whatever its shape: it takes the space the name
 * and the number leave and no more.
 *
 * Fluid rather than fixed because a fixed one had to be sized for the widest
 * window and then crushed the row in a narrow one — at 700px it ate the names
 * down to an ellipsis. The name and the number are the parts that must not
 * move; the ramp is the part that can breathe.
 */
const GAUGE_BOX = "h-5 min-w-10 max-w-56 flex-1";

/**
 * The outline that stands where a half's cards would be when it has none.
 *
 * It exists for the layout as much as for the reader: the two halves share a
 * draggable edge, and a half that disappeared when it emptied would take the
 * handle with it — turning the events off would cost the split too.
 *
 * Dashed and not a card: the app's own empty-state line (`border-input`, the
 * optional-fields blocks), which says "nothing here yet" without pretending
 * to be a surface. It carries a word, because an unexplained empty box makes
 * the reader wonder what broke; what it says is what the menu that emptied it
 * says, so the two agree.
 */
function ReadingPlaceholder({
  children,
  className,
}: {
  children: React.ReactNode;
  /** Extra classes — the metrics half hides its outline below `lg`. Placed
   * after the base so a `hidden lg:flex` wins over the `flex`. */
  className?: string;
}) {
  return (
    // Fills its half, whatever the reader has left it — the width is not
    // this box's to decide. It was pinned at 200 for a while, and the pin was
    // what made an empty half look like a hole: with the handle able to take
    // that half down to 200px (READ_MIN_W_EMPTY), the outline can simply
    // follow it and the same 200 stops being written in two places to mean
    // two different things.
    <div
      className={cn(
        "flex min-h-[128px] w-full items-center justify-center rounded-[12px] border border-dashed border-input px-5 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * What a channel did across the WHOLE recording — its two extremes and its
 * mean — as one line in the head of its card.
 *
 * Two decimals and not the four the instant carries: three figures at four
 * decimals is a line nobody reads, and these are here to give the instant a
 * scale, not to be transcribed. The number worth reading to the digit is the
 * one printed big underneath.
 *
 * The whole session and not the chart's window, so these never move while the
 * plot is zoomed — the same population the gauge below is anchored to.
 */
function SessionStatLine({
  stats,
  unit,
  locale,
}: {
  stats: { min: number; max: number; avg: number };
  unit: string;
  /** The reader's language, for the decimal separator. */
  locale: Locale;
}) {
  const t = useProDict().analysis.reading;
  const figures = [
    { label: t.min, value: stats.min },
    { label: t.max, value: stats.max },
    { label: t.avg, value: stats.avg },
  ];
  return (
    // Three cells in an outlined box, told apart by rules rather than by the
    // dots that used to sit between them: a rule needs no space of its own,
    // and it says "another figure" at a glance where a `·` had to be read.
    // The box takes the card's own 12px radius — one number for the two, not
    // a second one to keep in step.
    //
    // A line of its own on a phone and beside the name from `sm`. Squeezed in
    // next to the name at 375px it took enough width to break "Acelerar e
    // travar" over two lines and still wrapped itself; a full line costs the
    // height of one box and neither happens.
    <span className="scrollbar-none flex w-full divide-x divide-border overflow-x-auto rounded-[12px] border border-border text-xs leading-tight text-muted-foreground sm:w-auto sm:overflow-visible">
      {figures.map((figure) => (
        <span
          key={figure.label}
          // One line each, always: a figure broken from its own label reads as
          // two things. The padding is `px-2.5` for it — at `px-3` the three
          // cells came to 316px against the 305 a 375px phone gives them.
          //
          // What cannot be promised is that they always FIT: a gyro reads in
          // hundreds of °/s and three of those overflow any phone. The box
          // scrolls sideways on its own in that case (`overflow-x-auto`, and
          // no scrollbar drawn) — the page never has to.
          className="flex-1 px-2.5 py-2 text-center whitespace-nowrap"
        >
          {figure.label}{" "}
          <span className="font-medium text-foreground tabular-nums">
            {proNumber(figure.value, locale, 2)}
            {unit}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Where the instant sits against the biggest reading its own channel produced
 * in this session.
 *
 * **Zero is at the middle of the box in every row**, whatever the shape, so a
 * column of these reads as one scale: nothing is ever painted left of the
 * middle unless the reading is actually negative.
 *
 * Two shapes, because two kinds of quantity:
 *
 * - **Unsigned** (the G force, the roughness) get a wedge in the right half.
 *   A ramp and not a bar because the quantity is not a proportion of anything
 *   the reader chose — it is "how big is this next to the biggest" — and the
 *   widening ramp says *more* in a way a uniform bar does not. The fill is a
 *   smaller similar triangle, so its area grows quadratically: half the peak
 *   paints a quarter of the ink, which is honest about how far the top is.
 * - **Signed** channels get a bar that grows out of the middle, left for
 *   negative and right for positive, with a tick standing at zero. For these
 *   the sign IS the direction — braking against accelerating, leaning left
 *   against right — and a ramp that folded both into one length would throw
 *   away the half of the reading that says which way.
 *
 * `aria-hidden`: the exact number sits right beside it.
 */
function MetricGauge({
  value,
  peak,
  signed,
  className,
}: {
  value: number;
  /** The channel's biggest magnitude this session — the gauge's full end. */
  peak: number;
  signed: boolean;
  className?: string;
}) {
  const W = GAUGE_HALF * 2;
  const H = GAUGE_H;
  // A flat channel divides into NaN, and a rolling reading can momentarily
  // sit above the whole-session peak it is scaled against.
  const raw = peak > 0 && Number.isFinite(value) ? value / peak : 0;
  const f = Math.min(Math.max(raw, -1), 1);

  // The bar is CSS and not SVG for one reason: the gauge changes width with
  // the breakpoint, and an SVG stretched to fit drags its round caps out into
  // ellipses. A CSS radius is measured in pixels at paint time, so the caps
  // stay caps at every width. The wedge can stay SVG — a triangle has no
  // curve to distort, only a slope.
  if (signed) {
    const positive = f >= 0;
    return (
      <span
        aria-hidden
        className={cn("relative flex items-center", GAUGE_BOX, className)}
      >
        <span className="h-2 w-full rounded-full bg-muted" />
        {f !== 0 && (
          <span
            // Square where it meets zero, round at the reading: a rounded
            // corner against the tick made the fill look as if it started a
            // hair away from the origin, the one place that has to be exact.
            className={cn(
              "absolute h-2 bg-foreground",
              positive ? "rounded-r-full" : "rounded-l-full",
            )}
            style={{
              left: `${positive ? 50 : 50 + f * 50}%`,
              width: `${Math.abs(f) * 50}%`,
            }}
          />
        )}
        {/* Zero, standing taller than the bar so it still reads as the origin
            when the fill starts right at it. */}
        <span className="absolute left-1/2 h-5 w-[1.5px] -translate-x-1/2 bg-foreground" />
      </span>
    );
  }

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn(GAUGE_BOX, className)}
    >
      <polygon
        points={`${GAUGE_HALF},${H} ${W},0 ${W},${H}`}
        className="fill-muted"
      />
      {f > 0 && (
        <polygon
          points={`${GAUGE_HALF},${H} ${GAUGE_HALF + f * GAUGE_HALF},${H - f * H} ${GAUGE_HALF + f * GAUGE_HALF},${H}`}
          className="fill-foreground"
        />
      )}
    </svg>
  );
}

/**
 * One event at the cursor: its mark on a fixed dark tile, its name, and its
 * figures as labelled columns.
 *
 * The tile is `bg-sidebar` — the app's fixed dark surface — rather than
 * `bg-foreground`, because the curve marks carry a fixed mint arrow: on a
 * tile that inverts with the theme, that mint would land on white in dark
 * mode and disappear. Fixed dark keeps one contrast in both themes.
 */
/** The shock's own window drawn small: |a| over its 40 ms, scaled to its
 * peak, with a tick where the trigger fell — enough to see whether the hit
 * was one sharp sample or a pulse with a body. */
function ShockWindow({ hit }: { hit: ImuHighGEvent }) {
  const t = useProDict().analysis;
  const n = hit.x.length;
  if (n < 2 || !(hit.peakG > 0)) return null;
  const width = 96;
  const height = 36;
  const points = Array.from({ length: n }, (_, k) => {
    const g = Math.hypot(hit.x[k], hit.y[k], hit.z[k]);
    return `${((k / (n - 1)) * width).toFixed(1)},${(height - 2 - (g / hit.peakG) * (height - 4)).toFixed(1)}`;
  }).join(" ");
  const triggerX = (hit.preTriggerSamples / (n - 1)) * width;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-9 w-24 shrink-0 text-foreground"
      role="img"
      aria-label={t.shockWindow(
        ((n * 1000) / hit.sampleRateHz).toFixed(0),
        hit.sampleRateHz,
      )}
    >
      <line
        x1={triggerX}
        x2={triggerX}
        y1={0}
        y2={height}
        className="stroke-foreground/25"
        strokeWidth={1}
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EventCard({
  title,
  Icon,
  timeMs,
  outsideMs = 0,
  confidence,
  metrics,
  className,
  action,
}: {
  /** Null for an instant no event covers: the card drops the headline and
   * promotes the time into its place. */
  title: string | null;
  Icon: ComponentType<{ className?: string }>;
  timeMs?: number;
  /** How far the instant is outside the event's own span, ms — negative
   * before it, positive after, 0 inside. Outside, the card stands (it is
   * within the event's reach) but says so, and its live modules dim: the
   * facts are the event's and hold; the "agora" readings are the instant's
   * and the instant is not in the event. */
  outsideMs?: number;
  confidence: number | null;
  metrics: EventMetric[];
  className?: string;
  /** A control that acts on the event — the Snapshot button — placed at
   * the head's far end, before the confidence. */
  action?: ReactNode;
}) {
  const t = useProDict().analysis.card;
  const locale = useProLocale();
  const compared = metrics.filter((m) => m.now != null || m.progress != null);
  const plain = metrics.filter((m) => m.now == null && m.progress == null);
  const outside = title != null && outsideMs !== 0;
  const allPlainMarked = plain.every((m) => m.Icon);
  /**
   * The titleless card's single figure, printed in its head. Guarded on the
   * count and not just on the title: the card is built with exactly one
   * metric today, and if a second ever arrives the body should take them
   * rather than the head quietly dropping it.
   */
  const soleFigure = title == null && metrics.length === 1 ? metrics[0] : null;
  return (
    <div
      className={cn(
        // Its own solid fill, like the résumé tiles: the card under it is
        // translucent from `sm` up, and an outlined box with nothing behind
        // it would let the lab's dot texture run straight through the
        // figures. On a phone the surface under it is still opaque white, so
        // this costs nothing there.
        // No padding on the card itself (by request, 2026-09-10 — a layout
        // was supplied): its three bands — head, facts, readings — are
        // divided by rules that run edge to edge, the Rider card's idiom,
        // so each band pays its own padding. 20px on the sides, the metric
        // cards' `p-5`: the two kinds of card stand side by side in the
        // reading, so their contents have to start on the same line.
        // `overflow-hidden` so the bands' rules stop at the rounded corner.
        "@container overflow-hidden rounded-[12px] border border-border bg-card",
        // Outside the event — within its reach but not inside it — the whole
        // card dims, facts and readings alike (by request, 2026-09-10;
        // dimming only the live modules read as two cards in one). Down to
        // 30 %: the card is a ghost of the event the cursor just left, there
        // so the panel does not blank and jump, not to be read as if the
        // cursor were still inside.
        outside && "opacity-30 transition-opacity",
        className,
      )}
    >
      {/* The head: mark, name and time on the left; the Snapshot pill and
          the confidence on the right, centred on the two lines (the
          supplied layout). Wrapping, so in a narrow card — 305px on a
          phone — the pill and the confidence drop to a line of their own,
          right-aligned by `ml-auto`, instead of squeezing the name until
          the time runs under them.

          `min-h-[90px]`: the head's height WITH the Snapshot pill — 50px of
          pill and 20 of padding each side — held when the pill is not there
          (outside the event, only the confidence stays), so the card does
          not change height as the cursor crosses an event's edge (by
          request, 2026-09-10). Border-box, so the padding is inside it. */}
      <div className="flex min-h-[90px] flex-wrap items-center justify-between gap-3 px-5 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sidebar text-white">
            <Icon className="size-5" />
          </span>
          {/* An instant no event covers has no name worth printing — the
              old "Andamento normal" was a label for the absence of one. The
              time takes the headline's place instead: it is the only fact
              the card carries, so it gets the headline's weight. */}
          <div className="min-w-0">
            {title && <p className="leading-tight font-semibold">{title}</p>}
            {timeMs != null && (
              <p
                className={cn(
                  "flex items-center gap-1 tabular-nums",
                  title
                    ? "text-sm text-muted-foreground"
                    : "leading-tight font-semibold",
                )}
              >
                <ImuClockIcon
                  className={cn("shrink-0", title ? "size-3" : "size-4")}
                />
                {formatSessionTime(timeMs, true)}
                {outside && (
                  // Where the instant stands against the event, in the
                  // reader's words: "0,4 s antes", "0.8 s after". One
                  // decimal — the reach is half a second to a few, and a
                  // millisecond here would be noise dressed as precision.
                  <span className="truncate">
                    {" · "}
                    {/* Rounded UP to the tenth: 20 ms outside is "0,1 s",
                        never "0,0 s antes", which contradicts itself. */}
                    {(outsideMs < 0 ? t.before : t.after)(
                      proNumber(
                        Math.ceil(Math.abs(outsideMs) / 100) / 10,
                        locale,
                        1,
                      ),
                    )}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        {(action || confidence != null) && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {action}
            {confidence != null && (
              // Named, not just a bare percentage: on its own in the corner
              // of a card, "98%" reads as a share of something the card is
              // about — how much of the ride was a jump, say — when it is
              // the detector's own certainty that this IS a jump.
              <span className="text-sm text-muted-foreground">
                {t.confidence}{" "}
                <span className="tabular-nums">
                  {Math.round(confidence * 100)}%
                </span>
              </span>
            )}
          </div>
        )}
        {/* The titleless card's figure rides the head's far end instead of
            going down into a box of its own. An instant no event covers
            carries ONE number, and a ruled box around a single cell is a
            container drawn for nothing — the row is the card. No label
            either: the reading panel beside it names the channel, and here
            "G force" under a lone 1.05 would say what the whole card is
            about twice. */}
        {title == null && soleFigure && (
          <p className="shrink-0 leading-tight font-semibold tabular-nums">
            {soleFigure.value}
            {soleFigure.unit && (
              <span className="text-sm font-normal text-muted-foreground">
                {/^[°/]/.test(soleFigure.unit) ? "" : " "}
                {soleFigure.unit}
              </span>
            )}
          </p>
        )}
      </div>

      {/* The figures, split the way the data already splits them: the ones
          that carry an "agora" comparison are the event's own peaks — they
          get the room, the big figure and the bar — and the rest are single
          facts, which go in a ruled box.

          The box comes FIRST and the peaks under it (by request,
          2026-09-10): the facts are what the corner was — radius, entry to
          exit, retention, duration — and the peaks with their bars are what
          the cursor is doing inside it right now. The card is read top
          down: the event, then the instant.

          It is not a new flag: a metric HAS a comparison when the cursor can
          sit inside the quantity it describes, and those are exactly the
          ones worth watching move. */}
      {metrics.length > 0 && soleFigure == null && (
        <>
          {/* The plain figures as one band of cells under a rule, each with
              its mark beside the figure — the rules run edge to edge (the
              supplied layout), no box inside the card. The dividers are
              `gap-px` letting the band's own colour through rather than
              borders on the cells, because a border would have to know
              which cell ends each row, and the band breaks differently at
              every width — the first cell of a second row would carry a
              line against nothing.

              WRAPPING FLEX AND NOT A GRID, and that is the whole trick: a
              grid keeps its columns on the last row whether or not there are
              cells to put in them, so four figures over three columns left
              two empty tracks — and an empty track over a `bg-border` band
              is a grey slab, which is exactly what it looked like. Flex has
              no phantom cells: the last row holds only what is in it, and
              the one that is left stretches to the width. How many share a
              row is a share of the CARD's width — two at any width, three
              from 768px, and all six on one row from 1240px, the 1px taken
              off each for the gaps — so a wide card reads 3 + 3 and a
              full-width one a single row (by request, 2026-09-10: a 140px
              basis packed four into the first row and two into the
              second). Two and not one on a phone (by request, 2026-09-11):
              six facts one under the other were a column of the card's
              height to scroll past. A cell whose figure is wider than its
              half — "39 → 27 → 27 km/h" needs ~190px at the phone's
              padding — does not wrap the figure (see below); it grows, its
              neighbour drops to the next row, and the band reflows around
              it. 1240 is measured: the widest cell, with its mark and
              padding, needs ~205px, and six of those is 1230. Measured
              against the card and not the window: the reading's split is
              dragged by hand. Both steps are written as `@min-[…]` and not
              as `@lg`/`@3xl`: Tailwind emits the named ones AFTER an
              arbitrary one, so at 1282px the 33% rule came later in the
              sheet and beat the 16% one that also matched. */}
          {plain.length > 0 && (
            <div
              // `bg-clip-padding`, and it is what keeps every rule the same
              // weight: a background reaches the BORDER box by default, so
              // the band's `--border` fill sat under its own `--border`
              // top rule — two coats of the same 9% ink, and the horizontal
              // rules came out darker than the vertical ones the gaps paint
              // in one coat. Clipped to the padding box, the rule paints
              // over the card's white like the gaps do — the Rider card's
              // lines, all one weight (by request, 2026-09-10).
              className="flex flex-wrap gap-px border-t border-border bg-border bg-clip-padding"
            >
              {plain.map((metric) => (
                <div
                  key={metric.label}
                  // 16px of side padding until the card is 512px wide, the
                  // 20 the rest of the cards wear from there: at 345px two
                  // cells across leave 172 each, and the 8px are what keep
                  // "Inclinação teórica" and its mark on one line.
                  className="flex grow basis-[calc(50%-1px)] items-center gap-3 bg-card px-4 py-6 @min-[512px]:px-5 @min-[768px]:basis-[calc(33.333%-1px)] @min-[1240px]:basis-[calc(16.666%-1px)]"
                >
                  {/* All or none: see EventMetric.Icon. */}
                  {allPlainMarked && metric.Icon && (
                    <metric.Icon className={FACT_ICON_CLASS} />
                  )}
                  {/* No `min-w-0` here, and the figure does not wrap: the
                      unit stays on the numbers' line — "24 → 18 → 24 km/h"
                      had been breaking before "km/h" (by request,
                      2026-09-10) — and the cell grows to fit it, which the
                      wrapping band absorbs by reflowing the others. */}
                  <div>
                    <p className="leading-tight font-semibold whitespace-nowrap tabular-nums">
                      {metric.value}
                      {metric.unit && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {/^[°/]/.test(metric.unit) ? "" : " "}
                          {metric.unit}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {metric.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* The peaks — the modules with an "agora" and a bar — as a second
              band of cells under their own rule, the same idiom as the facts
              (the supplied layout). Wrapping flex for the same reason, and
              the same shares of the card's width as the facts — one, two
              from 512px, three from 768px — so the three modules sit on one
              row wherever the facts do, and a partial last row stretches. */}
          {compared.length > 0 && (
            <div
              // `bg-clip-padding`, and it is what keeps every rule the same
              // weight: a background reaches the BORDER box by default, so
              // the band's `--border` fill sat under its own `--border`
              // top rule — two coats of the same 9% ink, and the horizontal
              // rules came out darker than the vertical ones the gaps paint
              // in one coat. Clipped to the padding box, the rule paints
              // over the card's white like the gaps do — the Rider card's
              // lines, all one weight (by request, 2026-09-10).
              className="flex flex-wrap gap-px border-t border-border bg-border bg-clip-padding"
            >
              {compared.map((metric) => (
                <div
                  key={metric.label}
                  className="min-w-0 grow basis-full bg-card px-5 py-7 @min-[512px]:basis-[calc(50%-1px)] @min-[768px]:basis-[calc(33.333%-1px)]"
                >
                  <p className="text-sm text-muted-foreground">
                    {metric.label}
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    {/* The figure, with its detail line right under it —
                        in one block, so the line sits against the figure
                        and not under the whole row. */}
                    <div className="shrink-0">
                      <p className="text-[22px] leading-none font-semibold tabular-nums">
                        {metric.value}
                        {metric.unit && (
                          // Degrees and "/100" ride against the figure;
                          // word-like units (G, s, G RMS) take their space.
                          <span className="text-sm font-normal text-muted-foreground">
                            {/^[°/]/.test(metric.unit) ? "" : " "}
                            {metric.unit}
                          </span>
                        )}
                      </p>
                      {metric.detail && (
                        <p className="mt-1 text-sm leading-none text-foreground tabular-nums">
                          {metric.detail}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {metric.now && (
                        // Full ink and not the muted grey the labels wear:
                        // this is a live reading, the one thing on the card
                        // that changes as the cursor moves, and at 14px in
                        // grey it was the faintest thing in the module while
                        // being the only one worth watching.
                        <p className="truncate text-sm tabular-nums">
                          {t.now(metric.now)}
                        </p>
                      )}
                      {/* Where the instant sits between the module's floor
                          and its ceiling — zero and the event's peak for the
                          G and lean modules, the corner's slowest and fastest
                          for the speed. Not a health or Ride Load bar: its
                          ends are this event's own, nothing global. */}
                      {metric.progress != null && (
                        <span
                          aria-hidden
                          className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        >
                          <span
                            className="block h-full rounded-full bg-foreground transition-[width] duration-100"
                            style={{ width: `${metric.progress * 100}%` }}
                          />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One row of a filter menu. */
interface FilterMenuItem {
  key: string;
  label: string;
  /** What the channel is, in two or three words, under its name — the same
   * summary the details panel prints. The phone's menu is where these are
   * chosen without the panel in view, so the name alone is thin: "Acel Y"
   * says nothing that "Curvas e movimento lateral" does not say better. */
  sublabel?: string;
  /** The series' colour, drawn as a dot — metrics have one, events a mark. */
  color?: string;
  Icon?: ComponentType<{ className?: string }>;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onToggle: () => void;
}

/**
 * A filter as a dropdown with checkboxes — the phone's answer to the pill
 * rows.
 *
 * Seventeen pills wrap into four lines on a 375px screen, and those four
 * lines push the chart itself below the fold, which is the one thing this
 * page exists to show. Two menus take one line. Desktop keeps the pills:
 * there the whole set is visible at a glance and one tap toggles any of
 * them, which a menu cannot beat.
 */
function ImuFilterMenu({
  summary,
  items,
}: {
  summary: React.ReactNode;
  items: FilterMenuItem[];
}) {
  return (
    <Popover>
      {/* White, and back to lifting to `--muted` on hover. It briefly took
          the page's own colour, from when both menus and both panel switches
          shared one row over the background and a white pill there read as a
          small card floating beside the title. The menus have since moved
          down onto the plot's head, where they are the only controls in the
          column and want to be found; white is what separates them from the
          page they stand on. */}
      <PopoverTrigger className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-full border border-border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-muted">
        <span className="flex min-w-0 items-center gap-2 truncate">
          {summary}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      {/* Bounded by the room the anchor actually leaves — Base UI publishes it
          as `--available-height` and `--available-width` on the positioner.
          Height: the popup does not scroll on its own, and without a ceiling
          the last metrics fell off the bottom of a phone with no way to reach
          them. Width: at the shared 280px four of the names lost their tail
          to the ellipsis, so it grows to 320 where there is room. */}
      <PopoverContent
        align="start"
        className="max-h-[var(--available-height)] w-[min(20rem,var(--available-width))] overflow-y-auto overscroll-contain p-1.5"
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="checkbox"
            aria-checked={item.checked}
            disabled={item.disabled}
            onClick={item.onToggle}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {/* Drawn, not interactive. The app's Checkbox is a real control,
                and nesting one inside this button split the click between the
                two: the tick swallowed it and toggled nothing. The row is the
                single target — better for a thumb, too. */}
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                item.checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent dark:bg-input/30",
              )}
            >
              {item.checked && <Check className="size-3" />}
            </span>
            {item.color && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            )}
            {item.Icon && <item.Icon className="size-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">
              {item.label}
              {item.sublabel && (
                <span className="text-muted-foreground">
                  {" · "}
                  {item.sublabel}
                </span>
              )}
            </span>
            {item.hint && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.hint}
              </span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Lucide stand-ins for the two GPS résumé figures, thinned to the 1.5px
 * the supplied stat art paints — until that set gains its own glyphs. */
function StatRouteIcon({ className }: { className?: string }) {
  return <Route strokeWidth={1.5} className={className} />;
}
function StatGaugeIcon({ className }: { className?: string }) {
  return <Gauge strokeWidth={1.5} className={className} />;
}

/** The corner's retention figure — pace carried out over pace carried in. */
function StatMomentumIcon({ className }: { className?: string }) {
  return <TrendingUp strokeWidth={1.5} className={className} />;
}

/** The height the corner's stretch lost — what the retention was corrected
 * by. */
function StatDropIcon({ className }: { className?: string }) {
  return <TrendingDown strokeWidth={1.5} className={className} />;
}

/** Metres below a kilometre, kilometres with two decimals above it — the
 * decimals written the way the reader's language writes them. */
function formatTrackDistance(m: number, locale: Locale): string {
  return m >= 1000
    ? `${proNumber(m / 1000, locale, 2)} km`
    : `${Math.round(m)} m`;
}

function Stat({
  Icon,
  label,
  value,
}: {
  Icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    // A cell of the ruled box from `sm` up. No outline of its own — the
    // box draws one line between neighbours instead of two — but it keeps
    // the solid `bg-card`: it is what the 1px gaps show as rules, and what
    // stops the lab's texture coming through the translucent card behind.
    //
    // The mark sits beside the pair on a phone and above it on desktop: there
    // the columns are ~106px wide and a mark on the left would leave
    // "Acidentado" less room than the word needs.
    <div className="flex items-center gap-2.5 sm:flex-col sm:gap-1.5 sm:bg-card sm:px-2 sm:py-4 sm:text-center">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div>
        {/* A NEGATIVE margin, and measured rather than guessed: with both
            boxes already `leading-tight`, the ink of the label sat 7.75px
            above the ink of the figure — 2px of margin plus the half-leading
            each box carries (15px of box around 12px of label, 20px around a
            16px figure). Pulling 2px back lands it at 3.75px, which is the
            4 asked for. A label without a descender reads a hair looser; that
            is type, not layout. */}
        <p className="text-xs leading-tight text-muted-foreground">{label}</p>
        <p className="-mt-0.5 leading-tight font-semibold tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

/** One panel switch: an iOS-style track and thumb over its label, the
 * whole tile the target. Hand-rolled — the app has no Switch primitive,
 * and a checkbox styled as one would fight Base UI for nothing. */
function PanelToggle({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  const t = useProDict().analysis;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t.panels.show(label)}
      onClick={onToggle}
      // A pill on the heading row now, name first and the switch at its
      // end — read left to right as "this panel: on". 40px and not the
      // app's 44: it shares the row with the two filter menus, whose
      // trigger is 40, and that trigger is the phone's control too — so
      // the height that gives is this one, which exists only here.
      // `justify-between` for the phone, where this sits in a grid cell and
      // stretches to it — the switch belongs at the pill's far end, the way
      // the filter menu's chevron does. On the heading row the pill is sized
      // by its content, so there is no free space and the rule is inert.
      // `px-3.5` to match the filter menu's trigger exactly: on a phone the
      // two sit in the same grid, one above the other, and 16px here against
      // its 14 left the switch and the chevron on two different columns.
      // A filled pill with no outline, which is the whole difference between
      // these and the two menus: the menus are white with a border because
      // they open something, and these only flip. `--muted` is two levels
      // off the page in the light theme, and that is enough here where a
      // hairline was not — the fill is opaque, so what actually says "pill"
      // is the dot texture stopping at its edge rather than a colour step.
      //
      // The hover lifts in both themes: to white in light (+14 levels), and
      // to `--emphasis` in dark, which is the one token above `--muted`
      // there (+7). `--card` would have gone DOWN in dark.
      className="flex h-10 cursor-pointer items-center justify-between gap-2.5 rounded-full bg-muted px-3.5 transition-colors hover:bg-card dark:hover:bg-emphasis"
    >
      <span className="text-sm font-medium whitespace-nowrap">{label}</span>
      <span
        aria-hidden
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-foreground" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            // bg-background and not white: the on-track is bg-foreground,
            // which is LIGHT in dark theme — a white thumb would sink
            // into it there.
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-background transition-transform",
            on && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  );
}
