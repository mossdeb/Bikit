"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { NativeSelect } from "@/components/ui/native-select";
import {
  DYNAMICS_AXES,
  DYNAMICS_NOISE_SPAN,
  type DynamicsAxisKey,
  type DynamicsScore,
} from "@/lib/imu/setup-dynamics";
import type { ReportMetric } from "@/lib/imu/report";

/**
 * The setup dynamics at the head of the setups page (by request,
 * 2026-09-15, from a supplied layout): a four-axis radar of two setups
 * chosen from two dropdowns — absorption at the top, control on the
 * right, support at the foot, recovery on the left — on the lab's hatched
 * plate, and beside it the four axes explained once, with both setups'
 * scores and the figures each score is made of.
 *
 * The scale is scoreDynamics's: 100 % is the best of the setups on the
 * trail, and the ring the chart shades is one noise from it — a tie. The
 * chart waits for two setups: with one, every axis would read 100 %.
 */

/** The two setups' colours: the brand green and the chart's violet,
 * theme-aware through the tokens. */
const SETUP_COLOURS = ["var(--chart-1)", "var(--chart-2)"] as const;

/** The chart's geometry, in a 400-square: the 100 % ring's radius, and
 * the four compass directions in the axes' order. */
const SIZE = 400;
const CENTRE = SIZE / 2;
const RADIUS = 122;
const DIRECTIONS: Record<DynamicsAxisKey, [number, number]> = {
  absorption: [0, -1],
  control: [1, 0],
  support: [0, 1],
  recovery: [-1, 0],
};

const nf = (value: number, digits: number) =>
  value.toLocaleString("pt-PT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export interface ImuSetupDynamicsSetup {
  letter: string;
  /** The setup in one line, for the dropdown. */
  summary: string;
  runs: number;
}

export function ImuSetupDynamics({
  setups,
  scores,
  rules,
  referenceLetter,
  pending,
}: {
  setups: ImuSetupDynamicsSetup[];
  /** One per setup, in the same order, once its files are read. */
  scores: DynamicsScore[];
  /** How each figure is printed, by label. */
  rules: Map<string, Pick<ReportMetric, "unit" | "value">>;
  referenceLetter: string | null;
  /** Files still being read: the chart fills in as they arrive. */
  pending: boolean;
}) {
  const letters = setups.map((s) => s.letter);
  const [picked, setPicked] = useState<[string | null, string | null]>([
    null,
    null,
  ]);
  // The reference first, the next setup against it; a pick that no longer
  // exists falls back the same way.
  const fallbackA =
    referenceLetter && letters.includes(referenceLetter)
      ? referenceLetter
      : (letters[0] ?? null);
  const a = picked[0] && letters.includes(picked[0]) ? picked[0] : fallbackA;
  const fallbackB = letters.find((l) => l !== a) ?? null;
  const b = picked[1] && letters.includes(picked[1]) ? picked[1] : fallbackB;
  const chosen = [a, b].map((l) =>
    l ? (scores.find((s) => s.letter === l) ?? null) : null,
  );
  const enough = setups.length >= 2;
  const ready = chosen.every((s) => s != null);

  const pct = (score: number | null) =>
    score == null ? "—" : `${nf(score, 0)} %`;
  // A figure in its own unit and decimals — read off how the report prints
  // it. The one composite figure, "Estabilidade" (±5° · ±4°), carries its
  // number as the pitch alone: printed ± with a decimal, since two setups
  // a degree apart can still score differently.
  const figure = (label: string, value: number) => {
    const rule = rules.get(label);
    const printed = rule?.value ?? "";
    const unit = rule?.unit ?? printed.match(/[°%×]$/)?.[0] ?? "";
    const composite = /^±/.test(printed);
    const digits = composite
      ? 1
      : (printed.split(",")[1] ?? "").replace(/\D/g, "").length;
    return `${composite ? "±" : ""}${nf(value, digits)}${/^[°/%×]/.test(unit) ? "" : " "}${unit}`;
  };

  return (
    <div className="grid gap-[18px] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* The chart's card: the heading and the two dropdowns, then the
          plate. */}
      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div>
              <p className="text-lg font-semibold">Dinâmica do setup</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Equilíbrio e comportamento do setup
              </p>
            </div>
            {enough && (
              <div className="flex flex-1 items-center gap-2 sm:flex-none">
                <SetupPicker
                  colour={SETUP_COLOURS[0]}
                  value={a ?? ""}
                  setups={setups}
                  label="Primeiro setup"
                  onChange={(l) => setPicked([l, picked[1]])}
                />
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  vs
                </span>
                <SetupPicker
                  colour={SETUP_COLOURS[1]}
                  value={b ?? ""}
                  setups={setups}
                  label="Segundo setup"
                  onChange={(l) => setPicked([picked[0], l])}
                />
              </div>
            )}
          </div>

          <div className="imu-event-band mt-5 rounded-[14px] border border-border p-3 sm:p-4">
            {!enough ? (
              <p className="flex min-h-[220px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                {pending
                  ? "Aparece quando as sessões estiverem lidas."
                  : setups.length === 0
                    ? "Regista a afinação das voltas desta pista para as ver aqui."
                    : "Aparece quando houver duas afinações nesta pista: cada eixo mede um setup contra o outro."}
              </p>
            ) : (
              <Radar
                scores={chosen}
                letters={[a, b]}
                ready={ready}
                pct={pct}
              />
            )}
          </div>
          {enough && (
            <p className="mt-3 text-xs text-muted-foreground">
              100 % é o melhor dos setups em cada eixo. A faixa junto ao aro é
              o empate: até um ruído entre voltas iguais do melhor; a{" "}
              {DYNAMICS_NOISE_SPAN} ruídos o eixo chega a zero.
            </p>
          )}
        </div>
      </div>

      {/* The axes explained once, with both setups' scores. */}
      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-x-3">
            <p className="text-sm text-muted-foreground">Explicação</p>
            {[a, b].map((l, i) => (
              <div key={i} className="flex flex-col items-end">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 font-display text-xs font-bold tracking-wide text-background uppercase"
                  style={{ visibility: enough && l ? "visible" : "hidden" }}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: SETUP_COLOURS[i] }}
                  />
                  Setup {l}
                </span>
              </div>
            ))}
          </div>

          <ul className="mt-2 divide-y divide-border">
            {DYNAMICS_AXES.map((axis) => {
              const per = chosen.map(
                (s) => s?.axes.find((x) => x.key === axis.key) ?? null,
              );
              // The figures behind the score, one line each, both setups.
              const labels = [
                ...new Set(per.flatMap((x) => x?.parts.map((p) => p.label) ?? [])),
              ];
              return (
                <li key={axis.key} className="py-4 first:pt-3 last:pb-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3">
                    <p className="text-sm font-semibold">{axis.name}</p>
                    {per.map((x, i) => (
                      <p
                        key={i}
                        className={cn(
                          "min-w-[52px] text-right text-sm font-semibold tabular-nums",
                          !enough && "invisible",
                        )}
                      >
                        {x ? pct(x.score) : "…"}
                      </p>
                    ))}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {axis.description}
                  </p>
                  <p className="mt-1 text-sm font-medium">• {axis.parts}</p>
                  {enough && labels.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {labels.map((label) => (
                        <li
                          key={label}
                          className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 text-xs text-muted-foreground tabular-nums"
                        >
                          <span className="truncate">{label}</span>
                          {per.map((x, i) => {
                            const part = x?.parts.find((p) => p.label === label);
                            return (
                              <span
                                key={i}
                                className={cn(
                                  "min-w-[52px] text-right",
                                  part && !part.tie && "text-foreground",
                                )}
                              >
                                {part ? figure(label, part.value) : "—"}
                              </span>
                            );
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SetupPicker({
  colour,
  value,
  setups,
  label,
  onChange,
}: {
  colour: string;
  value: string;
  setups: ImuSetupDynamicsSetup[];
  label: string;
  onChange: (letter: string) => void;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        // Over the select: its wrapper is positioned too and, later in
        // the DOM, would paint the field's background across the dot.
        className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-2 -translate-y-1/2 rounded-full"
        style={{ background: colour }}
      />
      <NativeSelect
        aria-label={label}
        className="h-11 rounded-[12px] bg-card pl-7 text-sm"
        wrapperClassName="min-w-[120px] flex-1 sm:flex-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {setups.map((s) => (
          <option key={s.letter} value={s.letter}>
            Setup {s.letter}
            {s.runs > 1 ? ` · ${s.runs} voltas` : ""}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** The radar: four rings as diamonds, the tie band shaded inside the
 * outer one, the two setups as filled polygons, and a black pill at each
 * vertex with the axis's name and the two scores in the setups' dots. */
function Radar({
  scores,
  letters,
  ready,
  pct,
}: {
  scores: (DynamicsScore | null)[];
  letters: (string | null)[];
  ready: boolean;
  pct: (score: number | null) => string;
}) {
  const point = (key: DynamicsAxisKey, r: number): [number, number] => {
    const [dx, dy] = DIRECTIONS[key];
    return [CENTRE + dx * r, CENTRE + dy * r];
  };
  const ring = (fraction: number) =>
    DYNAMICS_AXES.map((axis) => point(axis.key, RADIUS * fraction).join(","))
      .join(" ");
  const polygon = (score: DynamicsScore) =>
    DYNAMICS_AXES.map((axis) => {
      const s = score.axes.find((x) => x.key === axis.key)?.score ?? 0;
      return point(axis.key, (RADIUS * s) / 100).join(",");
    }).join(" ");
  // The tie band: from one noise inside the rim (1 − 1/SPAN) to the rim.
  const tieInner = 1 - 1 / DYNAMICS_NOISE_SPAN;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[400px]">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block h-full w-full"
        role="img"
        aria-label={`Dinâmica do setup: ${letters.filter(Boolean).map((l) => `Setup ${l}`).join(" contra ")}`}
      >
        <polygon
          points={`${ring(1)} ${ring(tieInner)}`}
          fillRule="evenodd"
          className="fill-foreground/[0.06]"
        />
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={ring(f)}
            className="fill-none stroke-foreground/20"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {DYNAMICS_AXES.map((axis) => {
          const [x, y] = point(axis.key, RADIUS);
          return (
            <line
              key={axis.key}
              x1={CENTRE}
              y1={CENTRE}
              x2={x}
              y2={y}
              className="stroke-foreground/20"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {ready &&
          scores.map((s, i) =>
            s ? (
              <polygon
                key={i}
                points={polygon(s)}
                fill={SETUP_COLOURS[i]}
                fillOpacity={i === 0 ? 0.45 : 0.35}
                stroke={SETUP_COLOURS[i]}
                strokeWidth={1}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
      </svg>

      {/* The pills: over the top vertex and under the bottom one, centred;
          the side ones over the left vertex and under the right, flush
          with the box — a pill with two scores is wider than the room
          beside a vertex at any width the card gets. */}
      {DYNAMICS_AXES.map((axis) => {
        const [, y] = point(axis.key, RADIUS + 10);
        const [dx, dy] = DIRECTIONS[axis.key];
        const values = scores.map(
          (s) => s?.axes.find((a) => a.key === axis.key)?.score ?? null,
        );
        const style =
          dx === 0
            ? {
                left: "50%",
                top: `${(100 * y) / SIZE}%`,
                transform: `translate(-50%, ${dy < 0 ? -100 : 0}%)`,
              }
            : dx < 0
              ? {
                  left: 0,
                  top: "50%",
                  transform: "translateY(calc(-100% - 8px))",
                }
              : { right: 0, top: "50%", transform: "translateY(8px)" };
        return (
          <div
            key={axis.key}
            className="pointer-events-none absolute"
            style={style}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2 py-0.5 text-xs whitespace-nowrap text-background">
              <span className="font-semibold">{axis.name}</span>
              {ready &&
                values.map((v, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ background: SETUP_COLOURS[i] }}
                    />
                    <span className="font-normal tabular-nums">
                      {pct(v).replace(" %", "")}
                    </span>
                  </span>
                ))}
            </span>
          </div>
        );
      })}
      {!ready && (
        <p className="absolute inset-x-0 bottom-0 text-center text-xs text-muted-foreground">
          A ler as sessões…
        </p>
      )}
    </div>
  );
}
