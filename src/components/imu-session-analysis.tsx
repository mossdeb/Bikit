"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Bike, Minus, Plus, Undo2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
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
  type ImuEvent,
  type ImuSessionData,
} from "@/lib/imu/format";
import {
  eventsAt,
  formatSessionTime,
  gForceOf,
  impactEnergy,
  impactSeverityIndex,
  jerkSeries,
  leanSeries,
  nearestSampleIndex,
  roughnessSeries,
  sessionSummary,
  windowPeak,
  windowRms,
} from "@/lib/imu/derive";
import { ImuChart, type ImuChartSeries } from "@/components/imu-chart";

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
    description: "magnitude total da aceleração — √(x²+y²+z²)",
  },
  {
    id: "ax",
    label: "Acel X",
    unit: "g",
    color: "#0D9488",
    description: "aceleração longitudinal — acelerar e travar",
  },
  {
    id: "ay",
    label: "Acel Y",
    unit: "g",
    color: "#16A34A",
    description: "aceleração lateral — sobretudo curvas e movimentos laterais",
  },
  {
    id: "az",
    label: "Acel Z",
    unit: "g",
    color: "#0891B2",
    description: "aceleração vertical — impactos, terreno, saltos e aterragens",
  },
  {
    id: "gx",
    label: "Roll (X)",
    unit: "°/s",
    color: "#9333EA",
    description: "rotação sobre o eixo longitudinal — inclinar a bicicleta",
  },
  {
    id: "gy",
    label: "Pitch (Y)",
    unit: "°/s",
    color: "#C026D3",
    description: "rotação sobre o eixo lateral — empinar e mergulhar",
  },
  {
    id: "gz",
    label: "Yaw (Z)",
    unit: "°/s",
    color: "#EA580C",
    description: "rotação sobre o eixo vertical — mudar de direção",
  },
  {
    id: "roughness",
    label: "Roughness",
    unit: "G RMS",
    color: "#D97706",
    description: "trepidação do terreno — RMS do G dinâmico em janela de 0,5 s",
  },
  {
    id: "jerk",
    label: "Jerk",
    unit: "G/s",
    color: "#DB2777",
    description: "variação da aceleração — transições e movimentos abruptos",
  },
  {
    id: "lean",
    label: "Lean (est.)",
    unit: "°",
    color: "#475569",
    description:
      "inclinação estimada — filtro complementar acel+giro, não calibrado",
  },
] as const;

type SeriesId = (typeof SERIES_DEFS)[number]["id"];

/** The series computed from the raw channels rather than recorded by the
 * sensor — listed apart in the details panel, never under "Dados brutos". */
const DERIVED_IDS = new Set<SeriesId>(["roughness", "jerk", "lean"]);

const EVENT_KIND_DEFS = [
  { kind: "curve", label: "Curvas" },
  { kind: "jump", label: "Saltos" },
  { kind: "drop", label: "Drops" },
  { kind: "impact", label: "Impactos" },
  { kind: "rough_section", label: "Zonas acidentadas" },
  { kind: "braking", label: "Travagens" },
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
}

/** Everything the card's figures are computed from: the raw channels, the
 * derived series, and where the cursor is. One object rather than seven
 * positional arguments — the list was growing with each new metric. */
interface EventContext {
  tMs: Float64Array;
  ax: ArrayLike<number>;
  ay: ArrayLike<number>;
  g: ArrayLike<number>;
  lean: ArrayLike<number>;
  roughness: ArrayLike<number>;
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
  const { tMs, ax, ay, g, lean, roughness, cursorIndex } = ctx;
  const seconds = (fromMs: number, toMs: number) => ({
    label: "Duração",
    value: ((toMs - fromMs) / 1000).toFixed(1),
    unit: "s",
  });
  /** The instant's own reading of a channel, signed and with its unit —
   * degrees ride against the figure, word-like units keep their space. */
  const now = (values: ArrayLike<number>, unit: string, digits = 2) =>
    cursorIndex >= 0
      ? `${values[cursorIndex].toFixed(digits)}${/^[°/]/.test(unit) ? "" : " "}${unit}`
      : undefined;

  switch (event.kind) {
    case "curve": {
      const metrics: EventMetric[] = [];
      const lat = windowPeak(tMs, ay, event.startMs, event.endMs);
      if (lat != null)
        metrics.push({
          label: "G lateral máx",
          value: lat.toFixed(2),
          unit: "G",
          now: now(ay, "G"),
        });
      const maxLean = windowPeak(tMs, lean, event.startMs, event.endMs);
      if (maxLean != null)
        metrics.push({
          label: "Inclinação máx (est.)",
          value: `~${Math.round(maxLean)}`,
          unit: "°",
          now: now(lean, "°", 0),
        });
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
          now: now(g, "G"),
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
          now: now(ax, "G"),
        });
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
          now: now(roughness, "G"),
        });
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
export function ImuSessionAnalysis({ storagePath }: { storagePath: string }) {
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
    // inputs, never rewritten.
    return {
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
    } as Record<SeriesId, ArrayLike<number>>;
  }, [data, gForce]);

  if (loadError) {
    // Written on screen with the whole message — the garage rule.
    return (
      <p className="px-5 py-5 text-sm text-destructive sm:px-6">{loadError}</p>
    );
  }
  if (!data || !summary || !seriesValues || !gForce) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        A carregar a sessão…
      </p>
    );
  }

  const tMs = data.channels.tMs;
  const sampleRateHz = data.sampleRateHz;
  const full: [number, number] = [tMs[0], data.durationMs];
  const win = windowMs ?? full;
  const zoomed = win[0] > full[0] || win[1] < full[1];

  const chartSeries: ImuChartSeries[] = SERIES_DEFS.filter((def) =>
    activeSeries.has(def.id),
  ).map((def) => ({
    id: def.id,
    label: def.label,
    color: def.color,
    values: seriesValues[def.id],
  }));

  const cursorIndex = cursorMs != null ? nearestSampleIndex(tMs, cursorMs) : -1;
  const cursorEvents = (
    cursorIndex >= 0 ? eventsAt(data.events, tMs[cursorIndex]) : []
  ).sort((a, b) => EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind]);
  const primaryEvent = cursorEvents[0] ?? null;
  const eventContext: EventContext = {
    tMs,
    ax: data.channels.ax,
    ay: data.channels.ay,
    g: gForce,
    lean: seriesValues.lean,
    roughness: seriesValues.roughness,
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
    // Sections of the parent's single card, separated by rules — not cards of
    // their own. divide-y draws the line between consecutive sections.
    <div className="divide-y divide-border">
      {/* Session résumé: the numbers the whole recording boils down to. */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-4 px-5 py-5 sm:grid-cols-7 sm:px-6">
        <Stat label="Duração" value={formatSessionTime(summary.durationMs)} />
        <Stat label="G máx" value={summary.maxG.toFixed(2)} />
        <Stat label="Impactos" value={String(summary.impactCount)} />
        <Stat label="Curvas" value={String(summary.curveCount)} />
        <Stat label="Saltos" value={String(summary.jumpCount)} />
        <Stat
          label="No ar"
          value={`${(summary.airtimeMs / 1000).toFixed(1)} s`}
        />
        <Stat label="Acidentado" value={formatSessionTime(summary.roughMs)} />
      </div>

      {/* Filters and the plot: one section — the pills configure the chart
          directly below them. "Velocidade" is listed but disabled: this file
          records no speed, and a line invented from acceleration would lie. */}
      <div className="relative space-y-4 px-5 py-5 sm:px-6">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {SERIES_DEFS.map((def) => {
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
            <button
              type="button"
              disabled
              title="Este ficheiro não tem velocidade."
              className="h-8 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground/60"
            >
              Velocidade
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
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
              Eventos
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

        <div>
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
              setWindowMs(from <= full[0] && to >= full[1] ? null : [from, to])
            }
          />
          <div className="mt-2 flex items-center gap-1.5">
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

        {/* The cursor's exact time, straddling the rule between the chart and
            the card that describes that instant — it belongs to both, so it
            sits on the seam. Centred rather than tracking the cursor: down
            here it is no longer beside the rule anyway, and a pill that slid
            along a divider would read as a stray control. */}
        {cursorIndex >= 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-1/2 flex -translate-x-1/2 translate-y-1/2 items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-background tabular-nums"
          >
            <ImuClockIcon className="size-3 shrink-0" />
            {formatSessionTime(tMs[cursorIndex], true)}
          </span>
        )}
      </div>

      {/* Details of the instant under the cursor — the headline is the main
          event (or "Andamento normal"), its figures computed from the raw
          channels over the event's window, and the raw sample itself sits
          underneath, all channels, whatever the chart is drawing. */}
      <div className="px-5 pt-5 pb-6 sm:px-6">
        {cursorIndex < 0 ? (
          <p className="text-sm text-muted-foreground">
            Toca ou arrasta sobre o gráfico para ler um instante.
          </p>
        ) : (
          <div>
            {/* The instant's headline event as a card of its own: mark,
                name, confidence, then its figures as labelled columns. */}
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

            {/* Anything else covering the same instant — a rough section under
                an impact, say — gets the same card, one rung quieter. */}
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

            {/* Only what the chart is drawing — toggling a pill toggles its
                reading here too. Recorded channels and computed series sit in
                separate groups: "Dados brutos" is a promise about provenance,
                and roughness/jerk/lean would break it. */}
            {[
              {
                heading: "Dados brutos",
                defs: SERIES_DEFS.filter(
                  (def) => activeSeries.has(def.id) && !DERIVED_IDS.has(def.id),
                ),
              },
              {
                heading: "Derivadas (calculadas)",
                defs: SERIES_DEFS.filter(
                  (def) => activeSeries.has(def.id) && DERIVED_IDS.has(def.id),
                ),
              },
            ]
              .filter((group) => group.defs.length > 0)
              .map((group) => (
                <div
                  key={group.heading}
                  className="mt-4 border-t border-border pt-3"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {group.heading}
                  </p>
                  <div className="mt-2.5 space-y-3">
                    {group.defs.map((def) => (
                      <div key={def.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <span
                              aria-hidden
                              className="size-2 rounded-full"
                              style={{ backgroundColor: def.color }}
                            />
                            {def.label}
                          </span>
                          <span className="font-medium tabular-nums">
                            {seriesValues[def.id][cursorIndex].toFixed(4)}{" "}
                            <span className="text-sm text-muted-foreground">
                              {def.unit}
                            </span>
                          </span>
                        </div>
                        <p className="mt-0.5 pl-3.5 text-xs text-muted-foreground">
                          {def.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
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
              <p className="text-sm text-muted-foreground tabular-nums">
                {formatSessionTime(timeMs, true)}
              </p>
            )}
          </div>
        </div>
        {confidence != null && (
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      {/* Two columns on a phone, three from sm: a metric carrying its "agora"
          comparison needs the width, and three of those on 375px wrapped
          every figure onto its own line. */}
      {metrics.length > 0 && (
        <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
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
