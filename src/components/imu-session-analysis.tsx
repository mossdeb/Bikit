"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Bike,
  Check,
  ChevronDown,
  ChevronsLeftRight,
  Gauge,
  Info,
  Minus,
  Plus,
  Route,
  Undo2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { createClient } from "@/lib/supabase/client";
import {
  parseImuFile,
  type GpsChannels,
  type ImuEvent,
  type ImuSessionData,
} from "@/lib/imu/format";
import {
  altitudeMSeries,
  eventsAt,
  formatSessionTime,
  gForceOf,
  gpsDistance,
  gpsMeanSpeed,
  gpsSpeedAt,
  impactEnergy,
  impactSeverityIndex,
  jerkSeries,
  leanSeries,
  nearestSampleIndex,
  roughnessSeries,
  sessionSummary,
  speedKmhSeries,
  windowMeanAbs,
  windowPeak,
  windowRms,
} from "@/lib/imu/derive";
import { ImuChart, type ImuChartSeries } from "@/components/imu-chart";
import { ImuSessionMap } from "@/components/imu-session-map";
import { ImuChartGlyph } from "@/components/imu-pro-logo";
import {
  StatClockIcon,
  StatImpactIcon,
  StatJumpIcon,
  StatMetricIcon,
  StatStopwatchIcon,
  StatTurnIcon,
} from "@/components/imu-stat-icons";

/**
 * Series the chart can draw. A future metric (roughness, lateral G, …) is one
 * more entry here plus a `values` provider below — the raw channels are never
 * touched. Colors are a lab palette, fixed in both themes, deliberately not
 * the health nor the Ride Load vocabularies.
 */
const SERIES_DEFS = [
  {
    id: "gforce",
    label: "Força G",
    unit: "G",
    color: "#2563EB",
    summary: "Aceleração",
    description: "Magnitude total da aceleração — √(x²+y²+z²)",
  },
  {
    id: "ax",
    label: "Acel X",
    unit: "g",
    color: "#0D9488",
    summary: "Acelerar e travar",
    description: "Aceleração longitudinal — acelerar e travar",
  },
  {
    id: "ay",
    label: "Acel Y",
    unit: "g",
    color: "#16A34A",
    summary: "Curvas e movimento lateral",
    description: "Aceleração lateral — sobretudo curvas e movimentos laterais",
  },
  {
    id: "az",
    label: "Acel Z",
    unit: "g",
    color: "#0891B2",
    summary: "Impactos e aterragens",
    description: "Aceleração vertical — impactos, terreno, saltos e aterragens",
  },
  {
    id: "gx",
    label: "Roll (X)",
    unit: "°/s",
    color: "#9333EA",
    summary: "Inclinar a bicicleta",
    description: "Rotação sobre o eixo longitudinal — inclinar a bicicleta",
  },
  {
    id: "gy",
    label: "Pitch (Y)",
    unit: "°/s",
    color: "#C026D3",
    summary: "Empinar e mergulhar",
    description: "Rotação sobre o eixo lateral — empinar e mergulhar",
  },
  {
    id: "gz",
    label: "Yaw (Z)",
    unit: "°/s",
    color: "#EA580C",
    summary: "Mudar de direção",
    description: "Rotação sobre o eixo vertical — mudar de direção",
  },
  {
    id: "roughness",
    label: "Roughness",
    unit: "G RMS",
    color: "#D97706",
    summary: "Trepidação do terreno",
    description: "Trepidação do terreno — RMS do G dinâmico em janela de 0,5 s",
  },
  {
    id: "jerk",
    label: "Jerk",
    unit: "G/s",
    color: "#DB2777",
    summary: "Movimentos abruptos",
    description: "Variação da aceleração — transições e movimentos abruptos",
  },
  {
    id: "lean",
    label: "Lean (est.)",
    unit: "°",
    color: "#475569",
    summary: "Inclinação estimada",
    description:
      "Inclinação estimada — filtro complementar acel+giro, não calibrado",
  },
  /** Only offered when the file carries a GPS track — recorded speed,
   * resampled onto the IMU timeline, never integrated from acceleration. */
  {
    id: "speed",
    label: "Velocidade",
    unit: "km/h",
    color: "#65A30D",
    summary: "Velocidade GPS",
    description: "Velocidade sobre o solo, medida pelo GPS da gravação",
  },
  /** GPS-only as well: the receiver's own altitude, resampled. */
  {
    id: "altitude",
    label: "Altitude",
    unit: "m",
    color: "#92400E",
    summary: "Perfil de elevação",
    description: "Altitude acima do nível do mar, medida pelo GPS da gravação",
  },
] as const;

type SeriesId = (typeof SERIES_DEFS)[number]["id"];

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

const EVENT_KIND_DEFS = [
  { kind: "curve", label: "Curvas", Icon: CurveRightIcon },
  { kind: "jump", label: "Saltos", Icon: JumpIcon },
  { kind: "drop", label: "Drops", Icon: DropIcon },
  { kind: "impact", label: "Impactos", Icon: Zap },
  { kind: "rough_section", label: "Zonas acidentadas", Icon: RoughSectionIcon },
  { kind: "braking", label: "Travagens", Icon: BrakingIcon },
] as const;

const SEVERITY_LABEL: Record<string, string> = {
  light: "leve",
  medium: "médio",
  hard: "forte",
};

/** Which event owns the headline when several cover the same instant — the
 * pointiest wins (an impact inside a rough section reads as the impact). */
const EVENT_PRIORITY: Record<ImuEvent["kind"], number> = {
  jump: 0,
  drop: 0,
  impact: 1,
  curve: 2,
  braking: 3,
  rough_section: 4,
};

/** The desktop split between the chart and the map: the map column's width,
 * in px, adjustable by the handle on their shared edge. Per session, not
 * stored — a framing choice, like the zoom window. */
const MAP_DEFAULT_W = 300;
const MAP_MIN_W = 220;
/** What the chart may never be squeezed below — the plot is the one thing
 * this page exists to show, so the map is the side that gives. */
const CHART_MIN_W = 420;

/** One labelled figure in an event's card. */
interface EventMetric {
  label: string;
  value: string;
  /** Unit set apart from the figure, the way the app's totals read. */
  unit?: string;
  /**
   * The same quantity at the cursor's instant, when it has one — printed
   * beside the event's figure as "agora …", so the two can be compared at a
   * glance. A card's headline numbers describe the whole event and so do not
   * move while the cursor travels inside it; without this comparison that
   * stillness reads as a stuck number rather than as a peak. Signed, unlike
   * the peak, because the sign is the direction. Carries its own unit.
   */
  now?: string;
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
  /** Yaw rate, °/s — the curve radius and the theoretical lean read it. */
  gz: ArrayLike<number>;
  g: ArrayLike<number>;
  lean: ArrayLike<number>;
  roughness: ArrayLike<number>;
  /** The GPS track when the file carries one — the fusion figures (jump
   * length, curve radius, braking distance, retained speed) exist only
   * with it, and every card degrades to its IMU-only self without. */
  gps: GpsChannels | null;
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
 * The curve's lean is the complementary-filter estimate, and its label — not
 * its value — carries the (est.), so the number stays readable while the
 * caveat stays attached.
 */
function describeEvent(event: ImuEvent, ctx: EventContext): EventDescription {
  const { tMs, ax, ay, gz, g, lean, roughness, gps, cursorIndex } = ctx;
  const seconds = (fromMs: number, toMs: number) => ({
    label: "Duração",
    value: ((toMs - fromMs) / 1000).toFixed(1),
    unit: "s",
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
      now: `${v.toFixed(digits)}${/^[°/]/.test(unit) ? "" : " "}${unit}`,
      progress: peak > 0 ? Math.min(1, Math.abs(v) / peak) : 0,
    };
  };

  switch (event.kind) {
    case "curve": {
      const metrics: EventMetric[] = [];
      const lat = windowPeak(tMs, ay, event.startMs, event.endMs);
      if (lat != null)
        metrics.push({
          label: "G lateral máx",
          value: lat.toFixed(2),
          unit: "G",
          ...nowOf(ay, "G", lat),
        });
      const maxLean = windowPeak(tMs, lean, event.startMs, event.endMs);
      if (maxLean != null)
        metrics.push({
          label: "Inclinação máx (est.)",
          value: `~${Math.round(maxLean)}`,
          unit: "°",
          ...nowOf(lean, "°", maxLean, 0),
        });
      // IMU+GPS fusion: the mean speed through the curve against the mean
      // yaw rate it held. Radius = v/ω; theoretical lean = atan(v·ω/g) —
      // the balance angle physics asks for at that speed and rate, printed
      // beside the complementary filter's estimate as its external check.
      // Means and not peaks: the radius comes from what the curve held,
      // not what it spiked. Skipped below 1 °/s, where a "curve" is a
      // straight and the division makes up kilometres.
      if (gps) {
        const vMean = gpsMeanSpeed(gps, event.startMs, event.endMs);
        const omegaDeg = windowMeanAbs(tMs, gz, event.startMs, event.endMs);
        if (vMean != null && omegaDeg != null && omegaDeg > 1) {
          const omega = (omegaDeg * Math.PI) / 180;
          metrics.push({
            label: "Raio (est.)",
            value: `~${Math.round(vMean / omega)}`,
            unit: "m",
          });
          metrics.push({
            label: "Inclinação teórica",
            value: `~${Math.round(
              (Math.atan((vMean * omega) / 9.81) * 180) / Math.PI,
            )}`,
            unit: "°",
          });
        }
      }
      metrics.push(seconds(event.startMs, event.endMs));
      return {
        title:
          event.direction === "left" ? "Curva à esquerda" : "Curva à direita",
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
          label: "No ar",
          value: (event.airtimeMs / 1000).toFixed(2),
          unit: "s",
        },
      ];
      // Fusion: takeoff speed × airtime — how far the bike flew. The
      // ballistic horizontal estimate, not track distance: in the air the
      // receiver's own distance barely accumulates.
      if (gps) {
        const v = gpsSpeedAt(gps, event.takeoffMs);
        if (v != null)
          metrics.push({
            label: "Distância",
            value: `~${((v * event.airtimeMs) / 1000).toFixed(1)}`,
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
          label: "Aterragem",
          value: landing.toFixed(1),
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
          label: "Severidade",
          value: String(impactSeverityIndex(energy)),
          unit: "/100",
        });
      return event.kind === "drop"
        ? { title: "Drop", Icon: DropIcon, metrics }
        : { title: "Salto", Icon: JumpIcon, metrics };
    }
    case "impact": {
      const metrics: EventMetric[] = [];
      const peak = windowPeak(tMs, g, event.timeMs - 150, event.timeMs + 150);
      if (peak != null)
        metrics.push({
          label: "Pico",
          value: peak.toFixed(2),
          unit: "G",
          ...nowOf(g, "G", peak),
        });
      const energy = impactEnergy(
        tMs,
        g,
        event.timeMs - 150,
        event.timeMs + 150,
      );
      if (energy != null)
        metrics.push({
          label: "Severidade",
          value: String(impactSeverityIndex(energy)),
          unit: "/100",
        });
      const severity = event.severity
        ? (SEVERITY_LABEL[event.severity] ?? event.severity)
        : null;
      return {
        title: severity ? `Impacto ${severity}` : "Impacto",
        Icon: Zap,
        metrics,
      };
    }
    case "braking": {
      const metrics: EventMetric[] = [];
      const decel = windowPeak(tMs, ax, event.startMs, event.endMs);
      if (decel != null)
        metrics.push({
          label: "Travagem máx",
          value: decel.toFixed(2),
          unit: "G",
          ...nowOf(ax, "G", decel),
        });
      // Fusion: what the braking actually did — the speed it entered and
      // left with, and the ground it took to do it. Read off the GPS series
      // rather than the file's own event fields, so a braking WE detect one
      // day carries the same figures.
      if (gps) {
        const v0 = gpsSpeedAt(gps, event.startMs);
        const v1 = gpsSpeedAt(gps, event.endMs);
        if (v0 != null && v1 != null)
          metrics.push({
            label: "Velocidade",
            value: `${Math.round(v0 * 3.6)} → ${Math.round(v1 * 3.6)}`,
            unit: "km/h",
          });
        const dist = gpsDistance(gps, event.startMs, event.endMs);
        if (dist != null)
          metrics.push({
            label: "Distância",
            value: String(Math.round(dist)),
            unit: "m",
          });
      }
      metrics.push(seconds(event.startMs, event.endMs));
      return { title: "Travagem", Icon: BrakingIcon, metrics };
    }
    case "rough_section": {
      const metrics: EventMetric[] = [];
      const rms = windowRms(tMs, g, event.startMs, event.endMs, 1);
      if (rms != null)
        metrics.push({
          label: "Vibração",
          value: rms.toFixed(2),
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
              label: "Vel. retida",
              value: String(Math.round((inside / before) * 100)),
              unit: "%",
            });
          }
        }
      }
      metrics.push(seconds(event.startMs, event.endMs));
      return {
        title: "Zona muito acidentada",
        Icon: RoughSectionIcon,
        metrics,
      };
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
  storagePath,
  header,
}: {
  storagePath: string;
  /** The session's identity block, rendered on the server and handed over as
   * a node. It shares a card with the résumé, and the résumé's figures are
   * computed from the file this component parses — so the cards are drawn
   * here, where both halves are in hand. */
  header: ReactNode;
}) {
  const [data, setData] = useState<ImuSessionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSeries, setActiveSeries] = useState<Set<SeriesId>>(
    new Set(["gforce"]),
  );
  const [eventsOn, setEventsOn] = useState(true);
  const [activeKinds, setActiveKinds] = useState<Set<string>>(
    new Set(EVENT_KIND_DEFS.map((d) => d.kind)),
  );
  const [windowMs, setWindowMs] = useState<[number, number] | null>(null);
  const [cursorMs, setCursorMs] = useState<number | null>(null);

  /** The map column's width on desktop — dragged by the handle on the
   * chart/map edge. The value rides a custom property because the grid only
   * exists from `lg` up, and an inline style cannot carry a breakpoint. */
  const [mapWidth, setMapWidth] = useState(MAP_DEFAULT_W);
  const splitRef = useRef<HTMLDivElement>(null);
  const splitDragRef = useRef<{
    pointerId: number;
    startX: number;
    startW: number;
    maxW: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: blob, error } = await supabase.storage
        .from("imu-sessions")
        .download(storagePath);
      if (cancelled) return;
      if (error || !blob) {
        setLoadError(
          `Não foi possível descarregar o ficheiro: ${error?.message ?? "sem resposta"}.`,
        );
        return;
      }
      let json: unknown;
      try {
        json = JSON.parse(await blob.text());
      } catch {
        setLoadError("O ficheiro guardado não é JSON válido.");
        return;
      }
      const result = parseImuFile(json);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setData(result.session);
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  const summary = useMemo(() => (data ? sessionSummary(data) : null), [data]);
  const gForce = useMemo(() => (data ? gForceOf(data) : null), [data]);

  const seriesValues = useMemo(() => {
    if (!data || !gForce) return null;
    const { tMs, ax, ay, az, gx, gy, gz } = data.channels;
    // Derived series computed once per file, on read — the raw channels are
    // inputs, never rewritten. Speed exists only when the file carries a GPS
    // track; every consumer below goes through availableSeriesDefs, which is
    // what keeps a missing entry from ever being read.
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
      lean: leanSeries(tMs, ay, az, gx),
    };
    if (data.gps) {
      values.speed = speedKmhSeries(tMs, data.gps);
      values.altitude = altitudeMSeries(tMs, data.gps);
    }
    return values as Record<SeriesId, ArrayLike<number>>;
  }, [data, gForce]);

  /**
   * The biggest reading each channel produced in this session, as a magnitude
   * — the full end of that channel's gauge.
   *
   * Per channel and not one number for all of them: a gyro reads in hundreds
   * of °/s where an accelerometer reads in single g, and a shared scale would
   * flatten every accelerometer row to nothing. Per session and not global,
   * for the reason the G force gauge already carries: two recordings are not
   * on the same scale.
   */
  const seriesPeaks = useMemo(() => {
    if (!seriesValues) return null;
    const peaks = {} as Record<SeriesId, number>;
    for (const def of SERIES_DEFS) {
      const values = seriesValues[def.id];
      if (!values) continue; // speed, in a file without GPS
      let peak = 0;
      for (let i = 0; i < values.length; i++) {
        const magnitude = Math.abs(values[i]);
        if (magnitude > peak) peak = magnitude;
      }
      peaks[def.id] = peak;
    }
    return peaks;
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
  if (!data || !summary || !seriesValues || !seriesPeaks || !gForce) {
    return (
      <SessionCards header={header}>
        <p className="py-10 text-center text-sm text-muted-foreground">
          A carregar a sessão…
        </p>
      </SessionCards>
    );
  }

  const tMs = data.channels.tMs;
  const sampleRateHz = data.sampleRateHz;
  const full: [number, number] = [tMs[0], data.durationMs];
  const win = windowMs ?? full;
  const zoomed = win[0] > full[0] || win[1] < full[1];

  // The GPS series are real pills only when this file recorded a track;
  // without one they stay the disabled pills they always were, with their
  // "sem dados" hint.
  const hasGps = data.gps != null;
  const availableSeriesDefs = SERIES_DEFS.filter(
    (def) => !GPS_SERIES_IDS.has(def.id) || hasGps,
  );
  const activeSeriesDefs = availableSeriesDefs.filter((def) =>
    activeSeries.has(def.id),
  );
  const activeKindDefs = EVENT_KIND_DEFS.filter((def) =>
    activeKinds.has(def.kind),
  );
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
  const cursorEvents = (
    cursorIndex >= 0 ? eventsAt(data.events, tMs[cursorIndex]) : []
  )
    .filter((event) => eventsOn && activeKinds.has(event.kind))
    .sort((a, b) => EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind]);
  const primaryEvent = cursorEvents[0] ?? null;
  const eventContext: EventContext = {
    tMs,
    ax: data.channels.ax,
    ay: data.channels.ay,
    gz: data.channels.gz,
    g: gForce,
    lean: seriesValues.lean,
    roughness: seriesValues.roughness,
    gps: data.gps,
    cursorIndex,
  };
  const primaryDesc = primaryEvent
    ? describeEvent(primaryEvent, eventContext)
    : null;

  function toggleSeries(id: SeriesId) {
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleKind(kind: string) {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  /** How wide the map may grow right now — everything the chart does not
   * need, measured at gesture time rather than kept in sync with resizes. */
  function maxMapWidth(): number {
    const container = splitRef.current;
    return container
      ? Math.max(
          MAP_MIN_W,
          container.getBoundingClientRect().width - CHART_MIN_W,
        )
      : MAP_MIN_W;
  }

  function startMapResize(event: React.PointerEvent<HTMLElement>) {
    // Only a deliberate primary press opens a drag — the preview pane has a
    // history of synthesizing stray pointer traffic while it settles, and a
    // resize that can start without a button held is a chart that shrinks
    // on its own.
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0))
      return;
    event.preventDefault();
    splitDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startW: mapWidth,
      maxW: maxMapWidth(),
    };
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

  return (
    <SessionCards
      header={header}
      /* Session résumé: the numbers the whole recording boils down to. It
         shares the identity's card, because both answer "what recording is
         this" — the reading of it starts in the card below.

         Desktop puts the seven in one ruled box, the shape the bike header's
         totals already use — a rule between each pair and the figures
         centred. The phone keeps three loose columns: seven cells become
         three rows there, and the last one holds a single figure, so the
         same box would draw two dividers into empty space. */
      resume={
        <div className="border-t border-border px-5 pt-5 pb-5 sm:border-0 sm:px-6 sm:pt-0">
          {/* The rows breathe more than the columns: pulling the label onto
              its figure made each cell a tight block, and at 16px the three
              rows read as one paragraph instead of three. Phone only — the
              desktop box puts all seven on one line. */}
          <div
            className={cn(
              "grid grid-cols-3 gap-x-3 gap-y-7 sm:gap-0 sm:divide-x sm:divide-border sm:rounded-[12px] sm:border sm:border-border",
              // Nine figures with a GPS track (three clean phone rows),
              // the original seven without one.
              summary.distanceM != null ? "sm:grid-cols-9" : "sm:grid-cols-7",
            )}
          >
            <Stat
              Icon={StatClockIcon}
              label="Duração"
              value={formatSessionTime(summary.durationMs)}
            />
            {/* The ride-level GPS figures ride next to the duration —
                the three answer "how much ride" before the rest answer
                "how hard". Lucide marks for now; the supplied art set has
                no distance or speedometer glyph yet. */}
            {summary.distanceM != null && (
              <Stat
                Icon={StatRouteIcon}
                label="Distância"
                value={formatTrackDistance(summary.distanceM)}
              />
            )}
            {summary.maxSpeedKmh != null && (
              <Stat
                Icon={StatGaugeIcon}
                label="Vel. máx"
                value={`${summary.maxSpeedKmh.toFixed(1)} km/h`}
              />
            )}
            <Stat
              Icon={StatMetricIcon}
              label="G máx"
              value={summary.maxG.toFixed(2)}
            />
            <Stat
              Icon={StatImpactIcon}
              label="Impactos"
              value={String(summary.impactCount)}
            />
            <Stat
              Icon={StatTurnIcon}
              label="Curvas"
              value={String(summary.curveCount)}
            />
            <Stat
              Icon={StatJumpIcon}
              label="Saltos"
              value={String(summary.jumpCount)}
            />
            <Stat
              Icon={StatStopwatchIcon}
              label="No ar"
              value={`${(summary.airtimeMs / 1000).toFixed(1)} s`}
            />
            {/* The rough section borrows the event mark: there is no seventh
                glyph in the set, and the figure counts exactly the thing that
                mark already names down in the lane. */}
            <Stat
              Icon={RoughSectionIcon}
              label="Acidentado"
              value={formatSessionTime(summary.roughMs)}
            />
          </div>
        </div>
      }
    >
      {/* Filters and the plot: one section — the pills configure the chart
          directly below them. "Velocidade" is a real pill only when the file
          carries a GPS track; without one it stays listed but disabled,
          because a line invented from acceleration would lie. */}
      <div className="relative space-y-4 px-5 pt-[22px] pb-5 sm:px-6">
        {/* Phone: two menus on one line. Desktop: the pill rows below. */}
        <div className="grid grid-cols-2 gap-1.5 sm:hidden">
          <ImuFilterMenu
            summary={
              activeSeriesDefs.length === 1 ? (
                <>
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: activeSeriesDefs[0].color }}
                  />
                  <span className="truncate">{activeSeriesDefs[0].label}</span>
                </>
              ) : (
                <span className="truncate">
                  {activeSeriesDefs.length === 0
                    ? "Métricas"
                    : `${activeSeriesDefs.length} métricas`}
                </span>
              )
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
                : ["Velocidade", "Altitude"].map((label) => ({
                    key: label,
                    label,
                    checked: false,
                    disabled: true,
                    hint: "sem dados",
                    onToggle: () => {},
                  }))),
            ]}
          />
          <ImuFilterMenu
            summary={
              !eventsOn ? (
                <span className="truncate text-muted-foreground">
                  Eventos ocultos
                </span>
              ) : soleKind ? (
                <>
                  <soleKind.Icon className="size-4 shrink-0" />
                  <span className="truncate">{soleKind.label}</span>
                </>
              ) : (
                <span className="truncate">
                  {activeKindDefs.length === EVENT_KIND_DEFS.length
                    ? "Eventos"
                    : `${activeKindDefs.length} de ${EVENT_KIND_DEFS.length} eventos`}
                </span>
              )
            }
            items={[
              {
                key: "events-master",
                label: "Mostrar eventos",
                checked: eventsOn,
                onToggle: () => setEventsOn((v) => !v),
              },
              ...EVENT_KIND_DEFS.map((def) => ({
                key: def.kind,
                label: def.label,
                Icon: def.Icon,
                checked: eventsOn && activeKinds.has(def.kind),
                disabled: !eventsOn,
                onToggle: () => toggleKind(def.kind),
              })),
            ]}
          />
        </div>

        {/* Desktop keeps the pills, but in two boxed columns rather than two
            loose rows: the two sets answer different questions — what to draw
            and what to mark — and stacked bare they read as one long run of
            seventeen controls. The phone keeps its two menus (above): at
            375px these columns would be one pill wide. */}
        <div className="hidden gap-3 sm:grid sm:grid-cols-2">
          <div className="rounded-[12px] border border-border p-5">
            <p className="text-base">Métricas</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {availableSeriesDefs.map((def) => {
                const active = activeSeries.has(def.id);
                return (
                  <button
                    key={def.id}
                    type="button"
                    aria-pressed={active}
                    title={def.description}
                    onClick={() => toggleSeries(def.id)}
                    className={cn(
                      "flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                      active
                        ? "border-transparent bg-foreground text-background"
                        : "border-border bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: def.color }}
                    />
                    {def.label}
                  </button>
                );
              })}
              {!hasGps &&
                ["Velocidade", "Altitude"].map((label) => (
                  <button
                    key={label}
                    type="button"
                    disabled
                    title="Este ficheiro não tem GPS."
                    className="h-8 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground/60"
                  >
                    {label}
                  </button>
                ))}
            </div>
          </div>
          <div className="rounded-[12px] border border-border p-5">
            <p className="text-base">Eventos</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={eventsOn}
                onClick={() => setEventsOn((v) => !v)}
                className={cn(
                  "h-8 cursor-pointer rounded-full border px-3 text-xs font-medium transition-colors",
                  eventsOn
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                Mostrar eventos
              </button>
              {EVENT_KIND_DEFS.map((def) => {
                const active = eventsOn && activeKinds.has(def.kind);
                return (
                  <button
                    key={def.kind}
                    type="button"
                    aria-pressed={active}
                    disabled={!eventsOn}
                    onClick={() => toggleKind(def.kind)}
                    className={cn(
                      "h-8 cursor-pointer rounded-full border px-3 text-xs transition-colors disabled:cursor-default disabled:opacity-40",
                      active
                        ? "border-foreground/30 bg-muted text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {def.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* The plot's full-bleed lives here now: the wrapper cancels the
            section's px-5/px-6 — on a 375px phone that padding was over a
            tenth of the plot — and on desktop, when the file has a track,
            splits the freed width between the chart and the map, the map
            flush against the card's right edge. Without a track the grid
            never engages and the chart keeps the whole width, as before. */}
        <div
          ref={splitRef}
          style={{ "--imu-map-w": `${mapWidth}px` } as React.CSSProperties}
          className={cn(
            "-mx-5 sm:-mx-6",
            data.gps &&
              "lg:grid lg:grid-cols-[minmax(0,1fr)_var(--imu-map-w)]",
          )}
        >
          <div className="min-w-0">
            <ImuChart
              tMs={tMs}
              series={chartSeries}
              events={eventsOn ? data.events : []}
              eventKinds={activeKinds}
              windowMs={win}
              fullMs={full}
              cursorMs={cursorMs}
              onCursorChange={setCursorMs}
              // A pinch that grows back to the whole recording IS "reset zoom".
              onWindowChange={([from, to]) =>
                setWindowMs(
                  from <= full[0] && to >= full[1] ? null : [from, to],
                )
              }
            />
            <div className="mt-2 flex items-center gap-1.5 px-5 sm:px-6">
              <ZoomButton label="Aproximar" onClick={() => zoomAround(0.5)}>
                <Plus className="size-3.5" />
              </ZoomButton>
              <ZoomButton
                label="Afastar"
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
                  Repor zoom
                </button>
              )}
            </div>
          </div>

          {/* The route, cursor-synchronized both ways. On a phone it takes a
              band of its own under the chart; on desktop it stretches to the
              chart column's full height beside it, the mockup's shape. The
              filter switches govern its marks too — the rule that a kind
              switched off is off everywhere. */}
          {data.gps && (
            <div className="relative mt-4 min-w-0 lg:mt-0">
              <ImuSessionMap
                gps={data.gps}
                events={
                  eventsOn
                    ? data.events.filter((event) =>
                        activeKinds.has(event.kind),
                      )
                    : []
                }
                windowMs={win}
                speedOn={activeSeries.has("speed")}
                cursorMs={cursorMs}
                onSeek={setCursorMs}
                className="h-[280px] border-y border-border lg:h-full lg:border-l"
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
                aria-label="Redimensionar o mapa"
                aria-valuenow={Math.round(mapWidth)}
                aria-valuemin={MAP_MIN_W}
                onPointerDown={startMapResize}
                onPointerMove={moveMapResize}
                onPointerUp={endMapResize}
                onPointerCancel={endMapResize}
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
                // context, and at z-20 the map painted over the disc's half.
                className="absolute top-1/2 left-0 z-[1100] hidden size-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-foreground text-background outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:flex"
              >
                <ChevronsLeftRight className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Details of the instant under the cursor — the headline is the main
          event (or "Andamento normal"), its figures computed from the raw
          channels over the event's window, and the raw sample itself sits
          underneath, all channels, whatever the chart is drawing. */}
      <div className="border-t border-border px-5 pt-5 pb-6 sm:px-6">
        {cursorIndex < 0 ? (
          <p className="text-sm text-muted-foreground">
            Toca ou arrasta sobre o gráfico para ler um instante.
          </p>
        ) : (
          // Desktop reads the two side by side — the channels on the left, the
          // event on the right — because they answer the same instant from two
          // directions and stacking them puts a scroll between the question and
          // its answer. The phone keeps them stacked, channels first.
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
            {/* Only what the chart is drawing — toggling a pill toggles its
                reading here too. Each channel is a row of its own, ruled off
                from the next. The recorded ones carry no heading; the computed
                ones keep theirs, because "Derivadas (calculadas)" is the label
                that says where roughness/jerk/lean come from.

                The box is a desktop affair: on a phone these rows already have
                the section to themselves and a border would be a frame around
                the whole screen width. */}
            <div className="lg:rounded-[12px] lg:border lg:border-border lg:p-5">
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
                  heading: "Derivadas (calculadas)",
                  defs: activeSeriesDefs.filter((def) =>
                    DERIVED_IDS.has(def.id),
                  ),
                },
              ]
                .filter((group) => group.defs.length > 0)
                .map((group, gi) => (
                  <div key={group.key}>
                    {group.heading && (
                      <p
                        className={cn(
                          "text-xs font-medium text-muted-foreground",
                          gi > 0 && "mt-5 border-t border-border pt-5",
                        )}
                      >
                        {group.heading}
                      </p>
                    )}
                    {group.defs.map((def, i) => (
                      <div
                        key={def.id}
                        className={cn(
                          // The rule separates one channel from the next, so
                          // the first of a group never carries one: above it
                          // there is either the group's heading or the top of
                          // the panel, both of which already close the space.
                          i > 0
                            ? "mt-5 border-t border-border pt-5"
                            : group.heading
                              ? "mt-3"
                              : gi > 0 && "mt-5",
                        )}
                      >
                        {/* Both lines are `leading-tight` and carry no margin
                          between them: at this size the gap that shows is
                          half-leading, not margin, so tightening the boxes is
                          what halves it — the bike header's totals again. */}
                        <div className="flex items-baseline justify-between gap-2 leading-tight">
                          {/* A column of its own width, wide enough for the
                              longest name this panel has: it is what anchors
                              the gauge that follows to the same x in every
                              row, whatever the name's length. */}
                          <span className="flex w-[116px] shrink-0 items-center gap-1.5 text-base">
                            <span
                              aria-hidden
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: def.color }}
                            />
                            {/* The name is the only part allowed to give: if
                                a longer one ever arrives it ellipsizes rather
                                than pushing the gauge out of column. */}
                            <span className="truncate">{def.label}</span>
                            {/* The full sentence moved behind the (i) so the
                              line under the name can be a two-word summary.
                              A popover and not a tooltip: this is read on a
                              phone, and hover is not a thing a finger does. */}
                            <Popover>
                              <PopoverTrigger
                                aria-label={`O que é ${def.label}`}
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
                          {/* Every channel carries a gauge, and its full end
                            is that channel's own peak in this session — for
                            the G force, the same 7.41 printed up in the stats.
                            Nothing global: two recordings are not on the same
                            scale, and saying so would invent a comparison the
                            data does not support. */}
                          <MetricGauge
                            value={seriesValues[def.id][cursorIndex]}
                            peak={seriesPeaks[def.id]}
                            signed={!UNSIGNED_IDS.has(def.id)}
                            className="mr-3 self-center"
                          />
                          {/* The reading sits in a cell of its own width, so
                              the gauge beside it lands at the same x in every
                              row and stays there: without it a sign appearing
                              or an integer digit arriving shoved every ramp
                              sideways while the cursor moved. 104px covers a
                              signed gyro reading in the hundreds, the widest
                              this file can produce; the phone gives up the
                              slack it does not have. */}
                          <span className="min-w-[92px] text-right font-medium tabular-nums whitespace-nowrap sm:min-w-[104px]">
                            {seriesValues[def.id][cursorIndex].toFixed(4)}{" "}
                            <span className="text-sm text-muted-foreground">
                              {def.unit}
                            </span>
                          </span>
                        </div>
                        <p className="pl-3.5 text-sm leading-tight text-muted-foreground">
                          {def.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
            </div>

            {/* The instant's headline event as a card of its own: mark, name,
                confidence, then its figures as labelled columns.

                "Andamento normal" is the card for an instant no event covers,
                and it lives under the same switch: turning events off leaves
                the channels alone, with no card and no column at all. */}
            {eventsOn && (
              <div className="mt-5 lg:mt-0">
                <EventCard
                  title={primaryDesc ? primaryDesc.title : "Andamento normal"}
                  Icon={primaryDesc ? primaryDesc.Icon : Bike}
                  timeMs={tMs[cursorIndex]}
                  confidence={primaryEvent?.confidence ?? null}
                  metrics={
                    primaryDesc
                      ? primaryDesc.metrics
                      : [
                          {
                            label: "Força G",
                            value: gForce[cursorIndex].toFixed(2),
                            unit: "G",
                          },
                        ]
                  }
                />

                {/* Anything else covering the same instant — a rough section
                    under an impact, say — gets the same card, one rung
                    quieter. */}
                {cursorEvents.slice(1).map((event, i) => {
                  const desc = describeEvent(event, eventContext);
                  return (
                    <EventCard
                      key={i}
                      className="mt-2"
                      title={desc.title}
                      Icon={desc.Icon}
                      confidence={event.confidence}
                      metrics={desc.metrics}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </SessionCards>
  );
}

/**
 * The page's two cards: what the recording IS, and the reading of it.
 *
 * Separate cards on a phone, one continuous card from `sm` up. On a small
 * screen the two are a scroll apart and a rule between them is a hairline
 * asking to be noticed; a gap says the same thing without being read. On a
 * wide one they sit close enough that two floating cards would be two
 * objects where the page has one subject.
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
  return (
    <div className="space-y-[18px] sm:space-y-0">
      <div className="rounded-lg bg-card sm:rounded-b-none">
        {header}
        {resume}
      </div>
      <div className="rounded-lg bg-card sm:rounded-t-none sm:border-t sm:border-border">
        {/* The section's own title, the mark first: the glyph belongs to the
            reading of the recording, which is exactly what this card is. */}
        <div className="flex items-center gap-2.5 px-5 pt-5 sm:px-6">
          <ImuChartGlyph className="h-auto w-[30px] shrink-0 text-foreground [&_path]:[stroke-width:1.5]" />
          <h2 className="font-display text-xl font-semibold">Telemetria</h2>
        </div>
        {children}
      </div>
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
function EventCard({
  title,
  Icon,
  timeMs,
  confidence,
  metrics,
  className,
}: {
  title: string;
  Icon: ComponentType<{ className?: string }>;
  timeMs?: number;
  confidence: number | null;
  metrics: EventMetric[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-border px-4 py-3.5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sidebar text-white">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="leading-tight font-semibold">{title}</p>
            {timeMs != null && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                <ImuClockIcon className="size-3 shrink-0" />
                {formatSessionTime(timeMs, true)}
              </p>
            )}
          </div>
        </div>
        {confidence != null && (
          // Named, not just a bare percentage: on its own in the corner of a
          // card, "98%" reads as a share of something the card is about — how
          // much of the ride was a jump, say — when it is the detector's own
          // certainty that this IS a jump.
          <span className="shrink-0 text-sm text-muted-foreground">
            Confiança ·{" "}
            <span className="tabular-nums">
              {Math.round(confidence * 100)}%
            </span>
          </span>
        )}
      </div>

      {/* Two columns on a phone, three from sm: a metric carrying its "agora"
          comparison needs the width, and three of those on 375px wrapped
          every figure onto its own line. */}
      {metrics.length > 0 && (
        <div className="mt-[22px] grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="mt-0.5 font-medium tabular-nums">
                {metric.value}
                {metric.unit && (
                  // Degrees and "/100" ride against the figure; word-like
                  // units (G, s, G RMS) take the space they are owed.
                  <span className="text-sm text-muted-foreground">
                    {/^[°/]/.test(metric.unit) ? "" : " "}
                    {metric.unit}
                  </span>
                )}
                {metric.now && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {" · agora "}
                    {metric.now}
                  </span>
                )}
              </p>
              {/* How far the instant is along the event's own peak. Not a
                  health or Ride Load bar — this one fills from empty and its
                  full end is this event's maximum, nothing global. */}
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
          ))}
        </div>
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

/** Metres below a kilometre, kilometres with two decimals above it. */
function formatTrackDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
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
    // The cell's own padding lives here and not on the box: it is what gives
    // the desktop rules their full height, edge to edge of the row.
    //
    // The mark sits beside the pair on a phone and above it on desktop: there
    // the seven columns are ~106px wide and a mark on the left would leave
    // "Acidentado" less room than the word needs.
    <div className="flex items-center gap-2.5 sm:flex-col sm:gap-1.5 sm:px-3 sm:py-4 sm:text-center">
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
