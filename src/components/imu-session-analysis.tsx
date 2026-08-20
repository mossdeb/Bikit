"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
  impact: 1,
  curve: 2,
  braking: 3,
  rough_section: 4,
};

/**
 * Headline + one-line summary for an event, every figure computed from the
 * raw channels over the event's own window — peak lateral G through a curve,
 * landing G in the 300 ms after touchdown, RMS vibration across a rough
 * section, impact severity from integrated dynamicG² energy. The curve's
 * lean angle comes from the complementary-filter estimate and always wears
 * the (est.) suffix — it stays an estimate until validated against real
 * recordings.
 */
function describeEvent(
  event: ImuEvent,
  tMs: Float64Array,
  ax: ArrayLike<number>,
  ay: ArrayLike<number>,
  g: ArrayLike<number>,
  lean: ArrayLike<number>,
): { title: string; summary: string } {
  const parts: string[] = [];
  switch (event.kind) {
    case "curve": {
      const lat = windowPeak(tMs, ay, event.startMs, event.endMs);
      if (lat != null) parts.push(`${lat.toFixed(2)} G lateral máx`);
      const maxLean = windowPeak(tMs, lean, event.startMs, event.endMs);
      if (maxLean != null) parts.push(`~${Math.round(maxLean)}° lean (est.)`);
      parts.push(`${((event.endMs - event.startMs) / 1000).toFixed(1)} s`);
      return {
        title:
          event.direction === "left" ? "Curva à esquerda" : "Curva à direita",
        summary: parts.join(" · "),
      };
    }
    case "jump": {
      parts.push(`${(event.airtimeMs / 1000).toFixed(2)} s no ar`);
      const landing = windowPeak(
        tMs,
        g,
        event.landingMs,
        event.landingMs + 300,
      );
      if (landing != null) parts.push(`aterragem ${landing.toFixed(1)} G`);
      const energy = impactEnergy(
        tMs,
        g,
        event.landingMs,
        event.landingMs + 300,
      );
      if (energy != null)
        parts.push(`severidade ${impactSeverityIndex(energy)}/100`);
      return { title: "Salto", summary: parts.join(" · ") };
    }
    case "impact": {
      const peak = windowPeak(tMs, g, event.timeMs - 150, event.timeMs + 150);
      if (peak != null) parts.push(`${peak.toFixed(2)} G de pico`);
      const energy = impactEnergy(
        tMs,
        g,
        event.timeMs - 150,
        event.timeMs + 150,
      );
      if (energy != null)
        parts.push(`severidade ${impactSeverityIndex(energy)}/100`);
      const severity = event.severity
        ? (SEVERITY_LABEL[event.severity] ?? event.severity)
        : null;
      return {
        title: severity ? `Impacto ${severity}` : "Impacto",
        summary: parts.join(" · "),
      };
    }
    case "braking": {
      const decel = windowPeak(tMs, ax, event.startMs, event.endMs);
      if (decel != null) parts.push(`${decel.toFixed(2)} G de travagem máx`);
      parts.push(`${((event.endMs - event.startMs) / 1000).toFixed(1)} s`);
      return { title: "Travagem", summary: parts.join(" · ") };
    }
    case "rough_section": {
      const rms = windowRms(tMs, g, event.startMs, event.endMs, 1);
      if (rms != null) parts.push(`vibração ${rms.toFixed(2)} G RMS`);
      parts.push(`${((event.endMs - event.startMs) / 1000).toFixed(1)} s`);
      return { title: "Zona muito acidentada", summary: parts.join(" · ") };
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
    return <p className="pt-5 text-sm text-destructive">{loadError}</p>;
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
  const primaryDesc = primaryEvent
    ? describeEvent(
        primaryEvent,
        tMs,
        data.channels.ax,
        data.channels.ay,
        gForce,
        seriesValues.lean,
      )
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
      <div className="grid grid-cols-3 gap-x-3 gap-y-4 py-5 sm:grid-cols-7">
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
      <div className="space-y-4 py-5">
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
            <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
              Arrasta ou faz pinch no trackpad para ampliar · toca para ler
            </span>
          </div>
        </div>
      </div>

      {/* Details of the instant under the cursor — the headline is the main
          event (or "Andamento normal"), its figures computed from the raw
          channels over the event's window, and the raw sample itself sits
          underneath, all channels, whatever the chart is drawing. */}
      <div className="pt-5">
        <h2 className="font-display text-xl leading-tight font-bold">
          Detalhes
        </h2>
        {cursorIndex < 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Toca ou arrasta sobre o gráfico para ler um instante.
          </p>
        ) : (
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-lg leading-tight font-semibold">
                {primaryDesc ? primaryDesc.title : "Andamento normal"}
              </p>
              {primaryEvent?.confidence != null && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {Math.round(primaryEvent.confidence * 100)}%
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {formatSessionTime(tMs[cursorIndex], true)}
            </p>
            <p className="mt-1.5 font-medium tabular-nums">
              {primaryDesc
                ? primaryDesc.summary
                : `${gForce[cursorIndex].toFixed(2)} G`}
            </p>

            {cursorEvents.length > 1 && (
              <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                {cursorEvents.slice(1).map((event, i) => {
                  const desc = describeEvent(
                    event,
                    tMs,
                    data.channels.ax,
                    data.channels.ay,
                    gForce,
                    seriesValues.lean,
                  );
                  return (
                    <div
                      key={i}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="font-medium">{desc.title}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {desc.summary}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

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
