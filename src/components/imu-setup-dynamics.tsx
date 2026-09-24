"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { NativeSelect } from "@/components/ui/native-select";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { proNumber, proPercent } from "@/lib/i18n/pro";
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
 * right, support at the foot, recovery on the left — on a plain plate
 * (the lab's hatch came off by request), and beside it the four axes
 * explained once, with both setups' scores and the figures each score is
 * made of.
 *
 * The scale is scoreDynamics's: 100 % is the best of the setups on the
 * trail, and the first ring in from the rim is one noise — a tie. The
 * chart waits for two setups: with one, every axis would read 100 %.
 */

/** The two setups' colours: the brand green and the chart's violet,
 * theme-aware through the tokens. */
const SETUP_COLOURS = ["var(--chart-1)", "var(--chart-2)"] as const;

/** The chart's geometry, in a 400-square: the 100 % ring's radius, and
 * the four compass directions in the axes' order. */
const SIZE = 400;
const CENTRE = SIZE / 2;
const RADIUS = 150;
const DIRECTIONS: Record<DynamicsAxisKey, [number, number]> = {
  absorption: [0, -1],
  control: [1, 0],
  support: [0, 1],
  recovery: [-1, 0],
};

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
  const t = useProDict();
  const locale = useProLocale();
  const words = t.compare.dynamics;
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
    score == null ? "—" : proPercent(score, locale, 0);
  // A figure in its own unit and decimals — read off how the report prints
  // it, whichever decimal separator that is. The one composite figure,
  // the stability (±5° · ±4°), carries its number as the pitch alone:
  // printed ± with a decimal, since two setups a degree apart can still
  // score differently.
  const figure = (key: string, value: number) => {
    const rule = rules.get(key);
    const printed = rule?.value ?? "";
    const unit = rule?.unit ?? printed.match(/[°%×]$/)?.[0] ?? "";
    const composite = /^±/.test(printed);
    const digits = composite
      ? 1
      : (printed.match(/[.,](\d+)/)?.[1] ?? "").length;
    return `${composite ? "±" : ""}${proNumber(value, locale, digits)}${/^[°/%×]/.test(unit) ? "" : " "}${unit}`;
  };

  return (
    <div className="grid gap-[18px] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* The chart's card: the heading and the two dropdowns, then the
          plate. */}
      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div>
              <p className="text-lg font-semibold">{words.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {words.subtitle}
              </p>
            </div>
            {enough && (
              <div className="flex flex-1 items-center gap-2 sm:flex-none">
                <SetupPicker
                  colour={SETUP_COLOURS[0]}
                  value={a ?? ""}
                  setups={setups}
                  label={words.firstSetup}
                  onChange={(l) => setPicked([l, picked[1]])}
                />
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {words.vs}
                </span>
                <SetupPicker
                  colour={SETUP_COLOURS[1]}
                  value={b ?? ""}
                  setups={setups}
                  label={words.secondSetup}
                  onChange={(l) => setPicked([picked[0], l])}
                />
              </div>
            )}
          </div>

          <div className="@container mt-5 rounded-[14px] border border-border p-3 sm:p-4">
            {!enough ? (
              <p className="flex min-h-[220px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                {pending
                  ? t.compare.waitingForSessions
                  : setups.length === 0
                    ? words.noSetups
                    : words.needTwo}
              </p>
            ) : (
              <Radar scores={chosen} letters={[a, b]} ready={ready} />
            )}
          </div>
          {enough && (
            <p className="mt-3 text-xs text-muted-foreground">
              {words.scale(DYNAMICS_NOISE_SPAN)}
            </p>
          )}
        </div>
      </div>

      {/* The axes explained once, with both setups' scores. */}
      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-x-3">
            <p className="text-sm text-muted-foreground">{words.explanation}</p>
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
              // The axis in words — its name, what it reads, what it is
              // made of — from the dictionary, by the axis's key.
              const axisWords = t.compare.axes[axis.key];
              // The figures behind the score, one line each, both setups.
              const keys = [
                ...new Set(
                  per.flatMap((x) => x?.parts.map((p) => p.key) ?? []),
                ),
              ];
              return (
                <li key={axis.key} className="py-4 first:pt-3 last:pb-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3">
                    <p className="text-sm font-semibold">{axisWords.name}</p>
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
                    {axisWords.description}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    • {axisWords.parts}
                  </p>
                  {enough && keys.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {keys.map((key) => (
                        <li
                          key={key}
                          className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 text-xs text-muted-foreground tabular-nums"
                        >
                          <span className="truncate">
                            {t.report.metric[key]}
                          </span>
                          {per.map((x, i) => {
                            const part = x?.parts.find((p) => p.key === key);
                            return (
                              <span
                                key={i}
                                className={cn(
                                  "min-w-[52px] text-right",
                                  part && !part.tie && "text-foreground",
                                )}
                              >
                                {part ? figure(key, part.value) : "—"}
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
  const t = useProDict();
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
            {s.runs > 1 ? ` · ${t.common.run(s.runs)}` : ""}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** How long a vertex takes to reach its new place, ms. */
const TWEEN_MS = 400;

/**
 * A list of numbers eased towards its target whenever the target changes,
 * from wherever the list is at that moment — a change mid-flight turns,
 * it does not jump. An SVG's `points` cannot be transitioned in CSS, so
 * this is a requestAnimationFrame loop with an ease-out; with reduced
 * motion asked for, the first frame lands. The target travels as a
 * string so a fresh array each render does not restart the loop.
 */
function useTweened(target: number[]): number[] {
  const targetKey = target.join(",");
  const [shown, setShown] = useState<number[]>(() => target.map(() => 0));
  const shownRef = useRef(shown);
  useEffect(() => {
    const to = targetKey === "" ? [] : targetKey.split(",").map(Number);
    const from =
      shownRef.current.length === to.length
        ? shownRef.current
        : to.map(() => 0);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - t) ** 3;
      const next = to.map((v, i) => from[i] + (v - from[i]) * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targetKey]);
  return shown;
}

/** The radar: four rings as diamonds, the two setups as filled polygons,
 * and a black pill at each vertex with the axis's name and the two
 * scores in the setups' dots. */
function Radar({
  scores,
  letters,
  ready,
}: {
  scores: (DynamicsScore | null)[];
  letters: (string | null)[];
  ready: boolean;
}) {
  const t = useProDict();
  const locale = useProLocale();
  const point = (key: DynamicsAxisKey, r: number): [number, number] => {
    const [dx, dy] = DIRECTIONS[key];
    return [CENTRE + dx * r, CENTRE + dy * r];
  };
  const ring = (fraction: number) =>
    DYNAMICS_AXES.map((axis) =>
      point(axis.key, RADIUS * fraction).join(","),
    ).join(" ");
  // The vertices tween from where they are to where the picked setups
  // put them (by request, 2026-09-15): the two polygons' four scores as
  // one list, zero — the centre — until the files are read, so the first
  // reading grows out of the middle.
  const targets = scores.flatMap((s) =>
    DYNAMICS_AXES.map((axis) =>
      ready && s ? (s.axes.find((x) => x.key === axis.key)?.score ?? 0) : 0,
    ),
  );
  const shown = useTweened(targets);
  const polygon = (i: number) =>
    DYNAMICS_AXES.map((axis, k) =>
      point(axis.key, (RADIUS * shown[4 * i + k]) / 100).join(","),
    ).join(" ");
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block h-full w-full"
        role="img"
        aria-label={t.compare.dynamics.chartLabel(
          letters.filter(Boolean).map((l) => `Setup ${l}`),
        )}
      >
        {/* Four rings, one noise apart: the first in from the rim is the
            tie. (A shaded band said the same and came off by request.) */}
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
              <g key={i}>
                <polygon
                  points={polygon(i)}
                  fill={SETUP_COLOURS[i]}
                  // Both light, so neither hides the other where they
                  // overlap, the violet lighter still — it reads darker
                  // than the green at the same opacity (by request,
                  // 2026-09-15).
                  fillOpacity={i === 0 ? 0.2 : 0.12}
                  stroke={SETUP_COLOURS[i]}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {/* A dot on each vertex, the card's colour round it so
                    two dots on one spot still read as two (by request,
                    2026-09-16). */}
                {DYNAMICS_AXES.map((axis, k) => {
                  const [cx, cy] = point(
                    axis.key,
                    (RADIUS * shown[4 * i + k]) / 100,
                  );
                  return (
                    <circle
                      key={axis.key}
                      cx={cx}
                      cy={cy}
                      r={3.5}
                      fill={SETUP_COLOURS[i]}
                      className="stroke-card"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>
            ) : null,
          )}
      </svg>

      {/* The axis labels, name only, at the ends of the axes (by request,
          2026-09-15): over the top vertex and under the bottom one; beside
          the left and right ones where the plate is wide enough for the
          word to reach past the box — under 600 px of plate the side
          labels stack over the left vertex and under the right, flush
          with the box, leaving the vertex's chips their room. */}
      {DYNAMICS_AXES.map((axis) => {
        const [, y] = point(axis.key, RADIUS + 16);
        const [dx, dy] = DIRECTIONS[axis.key];
        return (
          <div
            key={axis.key}
            className={cn(
              "pointer-events-none absolute",
              dx === 0 && "left-1/2 -translate-x-1/2",
              dx === 0 && dy < 0 && "-translate-y-full",
              // The side ones: 87.5 % is the rim, (CENTRE − RADIUS) / SIZE
              // in from the box's edge — one of those literals Tailwind
              // must find written out.
              dx < 0 &&
                "top-1/2 left-0 -translate-y-[calc(100%+36px)] @min-[600px]:right-[calc(87.5%+8px)] @min-[600px]:left-auto @min-[600px]:-translate-y-1/2",
              dx > 0 &&
                "top-1/2 right-0 translate-y-[36px] @min-[600px]:left-[calc(87.5%+8px)] @min-[600px]:right-auto @min-[600px]:-translate-y-1/2",
            )}
            style={dx === 0 ? { top: `${(100 * y) / SIZE}%` } : undefined}
          >
            <span className="inline-flex rounded-full bg-card px-2 py-0.5 text-sm font-semibold whitespace-nowrap text-foreground">
              {t.compare.axes[axis.key].name}
            </span>
          </div>
        );
      })}

      {/* Each setup's score as a chip at its own vertex, riding the tween:
          on the vertical axes the first setup's to the left of its point
          and the second's to the right, on the horizontal ones over and
          under — so two chips never cover each other however close the
          points are, and read as one label when they coincide. */}
      {ready &&
        DYNAMICS_AXES.map((axis, k) => {
          const [dx] = DIRECTIONS[axis.key];
          return scores.map((s, i) => {
            const value = s?.axes.find((a) => a.key === axis.key)?.score;
            if (value == null) return null;
            const [x, y] = point(axis.key, (RADIUS * shown[4 * i + k]) / 100);
            const transform =
              dx === 0
                ? i === 0
                  ? "translate(calc(-100% - 6px), -50%)"
                  : "translate(6px, -50%)"
                : i === 0
                  ? "translate(-50%, calc(-100% - 12px))"
                  : "translate(-50%, 12px)";
            return (
              <div
                key={`${axis.key}-${i}`}
                className="pointer-events-none absolute"
                style={{
                  left: `${(100 * x) / SIZE}%`,
                  top: `${(100 * y) / SIZE}%`,
                  transform,
                }}
              >
                <span className="inline-flex items-center gap-1 rounded-full border border-foreground bg-foreground px-1.5 py-px text-xs font-semibold whitespace-nowrap text-background tabular-nums">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: SETUP_COLOURS[i] }}
                  />
                  {/* The score without its sign — the chip is small, and
                      the caption says the scale is a percentage. */}
                  {proNumber(value, locale, 0)}
                </span>
              </div>
            );
          });
        })}
      {!ready && (
        <p className="absolute inset-x-0 bottom-0 text-center text-xs text-muted-foreground">
          {t.compare.dynamics.readingSessions}
        </p>
      )}
    </div>
  );
}
