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
  nearestSampleIndex,
  sessionSummary,
} from "@/lib/imu/derive";
import { ImuChart, type ImuChartSeries } from "@/components/imu-chart";

/**
 * Series the chart can draw. A future metric (roughness, lateral G, …) is one
 * more entry here plus a `values` provider below — the raw channels are never
 * touched. Colors are a lab palette, fixed in both themes, deliberately not
 * the health nor the Ride Load vocabularies.
 */
const SERIES_DEFS = [
  { id: "gforce", label: "Força G", unit: "G", color: "#2563EB" },
  { id: "ax", label: "Acel X", unit: "g", color: "#0D9488" },
  { id: "ay", label: "Acel Y", unit: "g", color: "#16A34A" },
  { id: "az", label: "Acel Z", unit: "g", color: "#0891B2" },
  { id: "gx", label: "Roll (X)", unit: "°/s", color: "#9333EA" },
  { id: "gy", label: "Pitch (Y)", unit: "°/s", color: "#C026D3" },
  { id: "gz", label: "Yaw (Z)", unit: "°/s", color: "#EA580C" },
] as const;

type SeriesId = (typeof SERIES_DEFS)[number]["id"];

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
    const { ax, ay, az, gx, gy, gz } = data.channels;
    return { gforce: gForce, ax, ay, az, gx, gy, gz } as Record<
      SeriesId,
      ArrayLike<number>
    >;
  }, [data, gForce]);

  if (loadError) {
    // Written on screen with the whole message — the garage rule.
    return <p className="pt-5 text-sm text-destructive">{loadError}</p>;
  }
  if (!data || !summary || !seriesValues) {
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
  const cursorEvents =
    cursorIndex >= 0 ? eventsAt(data.events, tMs[cursorIndex]) : [];

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
            cursorMs={cursorMs}
            onCursorChange={setCursorMs}
            onWindowChange={([from, to]) => setWindowMs([from, to])}
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
              Arrasta com o rato para ampliar uma zona · toca para ler
            </span>
          </div>
        </div>
      </div>

      {/* Details of the instant under the cursor — always read off the raw
          samples, whatever resolution the plot is drawn at. */}
      <div className="pt-5">
        <h2 className="font-display text-xl leading-tight font-bold">
          Detalhes
        </h2>
        {cursorIndex < 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Toca ou arrasta sobre o gráfico para ler um instante.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Hora</span>
              <span className="font-medium tabular-nums">
                {formatSessionTime(tMs[cursorIndex], true)}
              </span>
            </div>
            {SERIES_DEFS.filter((def) => activeSeries.has(def.id)).map(
              (def) => (
                <div
                  key={def.id}
                  className="flex items-baseline justify-between"
                >
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
              ),
            )}
            {cursorEvents.length === 0 ? (
              <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                Sem eventos neste instante.
              </p>
            ) : (
              <div className="space-y-2 border-t border-border pt-3">
                {cursorEvents.map((event, i) => (
                  <div
                    key={i}
                    className="flex items-baseline justify-between text-sm"
                  >
                    <span className="font-medium">
                      {eventDetailLabel(event)}
                    </span>
                    {event.confidence != null && (
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round(event.confidence * 100)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
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

function eventDetailLabel(event: ImuEvent): string {
  switch (event.kind) {
    case "curve":
      return event.direction === "left"
        ? "Curva à esquerda"
        : "Curva à direita";
    case "jump":
      return `Salto · ${(event.airtimeMs / 1000).toFixed(2)} s no ar`;
    case "impact":
      return event.severity
        ? `Impacto ${SEVERITY_LABEL[event.severity] ?? event.severity}`
        : "Impacto";
    case "rough_section":
      return "Zona muito acidentada";
    case "braking":
      return "Travagem";
  }
}
