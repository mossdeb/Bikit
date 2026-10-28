"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { proNumber } from "@/lib/i18n/pro";
import { normalizeSetupValues, type ImuSetupValues } from "@/lib/imu/setup";
import type { BikeType } from "@/lib/constants";
import {
  BIKE_ICON_FALLBACK,
  BIKE_TYPE_ICON,
} from "@/components/bike-type-icon";
import { BikeBalanceArt } from "@/components/bike-balance-art";
import type { StoredRiderSag } from "@/lib/imu/rider-sag";
import {
  knobEffects,
  sagTone,
  setupBalance,
  type EffectKnobId,
  type SagTone,
} from "@/lib/imu/setup-balance";

/**
 * The setup comparison's Balance (by request, 2026-10-28), under the
 * dynamics: first how each setup sits — the sags as shares of the travel,
 * the logger's rider-sag reading and what it means in mm — then the effect
 * of one knob the setups differ in on one figure, run by run.
 *
 * Each setup has one colour wherever it appears here, by its letter and in
 * a fixed order (--series-1…5, the dataviz reference palette, validated in
 * both themes); a colour is identity, never a verdict. Below 3:1 on the
 * light card, so every coloured mark has its letter beside it.
 */

export interface BalanceSetup {
  letter: string;
  setup: ImuSetupValues;
  members: {
    id: string;
    name: string;
    createdAt: string;
    riderSag?: StoredRiderSag | null;
    /** The run's figures by the report's key, once its file is read. */
    figures: Map<string, number> | null;
  }[];
}

export interface BalanceMetric {
  key: string;
  label: string;
  unit: string;
  digits: number;
  /** The figure's own tie, in its unit. */
  tie: number;
}

const SERIES = 5;
const colourOf = (index: number) => `var(--series-${(index % SERIES) + 1})`;

const TONE_DOT: Record<SagTone, string> = {
  good: "bg-[#3DDC97]",
  warn: "bg-[#F5B82E]",
  danger: "bg-[#FF5A39]",
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function ImuSetupBalance({
  setups,
  metrics,
  bikeType = null,
}: {
  bikeType?: BikeType | null;
  setups: BalanceSetup[];
  /** The figures the effect can be read on, in the table's order. */
  metrics: BalanceMetric[];
}) {
  const t = useProDict();
  const words = t.compare.balance;
  const locale = useProLocale();
  const n = (value: number, digits: number) => proNumber(value, locale, digits);
  const signedDeg = (deg: number) =>
    `${deg > 0 ? "+" : deg < 0 ? "−" : ""}${n(Math.abs(deg), 1)}°`;
  const indexOf = new Map(setups.map((s, i) => [s.letter, i]));

  const balances = setups.map((s) => ({
    s,
    b: setupBalance(
      s.setup,
      s.members.map((m) => m.riderSag),
    ),
  }));

  const BikeMark = (bikeType && BIKE_TYPE_ICON[bikeType]) || BIKE_ICON_FALLBACK;
  // A line per setup with a reading, in its colour, letter and real angle
  // on the pill; it sinks by the mean drop where the setup gives the
  // wheelbase, the head angle and the fork's sag.
  const artLines = balances.flatMap(({ s, b }) => {
    if (b.pitchDeg == null) return [];
    const wheelbaseMm = normalizeSetupValues(s.setup).frame?.wheelbaseMm;
    return [
      {
        key: s.letter,
        pitchDeg: b.pitchDeg,
        drops:
          b.frontMm != null && b.rearMm != null && wheelbaseMm
            ? { frontMm: b.frontMm, rearMm: b.rearMm, wheelbaseMm }
            : null,
        colour: colourOf(indexOf.get(s.letter)!),
        labelInk: "#ffffff",
        label: `${s.letter} ${signedDeg(b.pitchDeg)}`,
      },
    ];
  });

  const effects = useMemo(
    () =>
      knobEffects(setups.map((s) => ({ letter: s.letter, setup: s.setup }))),
    [setups],
  );
  const [knobPick, setKnobPick] = useState<EffectKnobId | null>(null);
  const [metricPick, setMetricPick] = useState<string | null>(null);
  const effect = effects.find((e) => e.knob === knobPick) ?? effects[0] ?? null;
  const metric =
    metrics.find((m) => m.key === metricPick) ?? metrics[0] ?? null;

  const knobName = (knob: EffectKnobId) => {
    const [block, field] = knob.split(".");
    const s = t.report.setup;
    if (block === "tires")
      return field === "frontPsi"
        ? words.effect.tyreFront
        : words.effect.tyreRear;
    if (block === "rider") return words.effect.riderWeight;
    const blockWord = block === "fork" ? s.diffFork : s.diffShock;
    if (field === "sagPct") return `${blockWord} ${words.effect.sagPct}`;
    return `${blockWord} ${s.knob[field as keyof typeof s.knob]}`;
  };
  const knobUnit = (knob: EffectKnobId) => {
    const field = knob.split(".")[1];
    if (field === "sagPct") return "%";
    if (field === "sagMm") return " mm";
    if (field === "springRateLbs") return " lbs";
    if (field === "weightKg") return " kg";
    if (field.endsWith("Psi")) return " psi";
    return "";
  };

  const pct = (block: "fork" | "shock", value: number | null) =>
    value == null ? (
      <span className="text-muted-foreground">–</span>
    ) : (
      <span className="inline-flex items-center gap-2 tabular-nums">
        <span
          aria-hidden
          className={cn("size-2 rounded-full", TONE_DOT[sagTone(block, value)])}
        />
        {n(value, 0)}%
      </span>
    );
  const mm = (value: number | null) =>
    value == null ? (
      <span className="text-muted-foreground">–</span>
    ) : (
      <span className="tabular-nums">{n(value, 0)} mm</span>
    );

  return (
    <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
      <section className="px-5 py-6 sm:p-8">
        <p className="text-2xl leading-tight font-semibold">{words.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{words.subtitle}</p>

        {/* How each setup sits. */}
        <div className="mt-8 rounded-[12px] border border-border p-4 sm:p-5">
          <p className="font-semibold">{words.standing.title}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">
                    {words.standing.setup}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {words.standing.shockSag}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {words.standing.forkSag}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {words.standing.imuSag}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {words.standing.rearMinusFront}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {words.standing.rearDrop}
                  </th>
                  <th className="py-2 font-medium">
                    {words.standing.frontDrop}
                  </th>
                </tr>
              </thead>
              <tbody>
                {balances.map(({ s, b }) => (
                  <tr key={s.letter} className="border-t border-border">
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span
                          aria-hidden
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor: colourOf(indexOf.get(s.letter)!),
                          }}
                        />
                        Setup {s.letter}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{pct("shock", b.shockSagPct)}</td>
                    <td className="py-3 pr-4">{pct("fork", b.forkSagPct)}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {b.pitchDeg == null ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        <>
                          {signedDeg(b.pitchDeg)}
                          {b.calibrations > 1 && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {words.standing.calibrations(b.calibrations)}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {b.rearMinusFrontMm == null ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        <span className="tabular-nums">
                          {b.rearMinusFrontMm > 0 ? "+" : "−"}
                          {n(Math.abs(b.rearMinusFrontMm), 0)} mm
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">{mm(b.rearMm)}</td>
                    <td className="py-3">{mm(b.frontMm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {words.standing.footnote}
          </p>
        </div>

        {/* The bike with each setup's line on the left, the effect of
            one knob on the right (by request, 2026-10-28). One column
            until xl, where the chart still has room beside the drawing. */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col rounded-[12px] border border-border p-4 sm:p-5">
            <p className="font-semibold">{words.art.title}</p>
            <div className="flex flex-1 items-center justify-center py-6">
              <BikeBalanceArt BikeMark={BikeMark} lines={artLines} />
            </div>
            {artLines.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                  {balances
                    .filter(({ b }) => b.pitchDeg != null)
                    .map(({ s, b }) => (
                      <span
                        key={s.letter}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          aria-hidden
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor: colourOf(indexOf.get(s.letter)!),
                          }}
                        />
                        Setup {s.letter}
                        <span className="text-muted-foreground tabular-nums">
                          {signedDeg(b.pitchDeg!)}
                        </span>
                      </span>
                    ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {words.art.hint}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{words.art.none}</p>
            )}
          </div>

          {/* The effect of one knob on one figure. */}
          <div className="min-w-0 rounded-[12px] border border-border p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <p className="font-semibold">{words.effect.title}</p>
              {effect && metric && (
                <div className="flex flex-wrap gap-3">
                  <div className="w-56 space-y-1.5">
                    <Label htmlFor="balance-knob" className="text-xs">
                      {words.effect.knob}
                    </Label>
                    <NativeSelect
                      id="balance-knob"
                      value={effect.knob}
                      onChange={(e) =>
                        setKnobPick(e.target.value as EffectKnobId)
                      }
                    >
                      {effects.map((e) => (
                        <option key={e.knob} value={e.knob}>
                          {knobName(e.knob)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="w-56 space-y-1.5">
                    <Label htmlFor="balance-metric" className="text-xs">
                      {words.effect.metric}
                    </Label>
                    <NativeSelect
                      id="balance-metric"
                      value={metric.key}
                      onChange={(e) => setMetricPick(e.target.value)}
                    >
                      {metrics.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
              )}
            </div>
            {!effect || !metric ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {words.effect.none}
              </p>
            ) : (
              <>
                <EffectChart
                  points={effect.values.flatMap(({ letter, value }) => {
                    const s = setups.find((x) => x.letter === letter)!;
                    return s.members.flatMap((m) => {
                      const y = m.figures?.get(metric.key);
                      return y == null
                        ? []
                        : [{ letter, x: value, y, run: m.name }];
                    });
                  })}
                  colourOf={(letter) => colourOf(indexOf.get(letter) ?? 0)}
                  xLabel={(v) =>
                    `${n(v, v % 1 ? 1 : 0)}${knobUnit(effect.knob)}`
                  }
                  yLabel={(v) =>
                    `${n(v, metric.digits)}${metric.unit ? ` ${metric.unit}` : ""}`.replace(
                      " %",
                      "%",
                    )
                  }
                  medianWord={words.effect.median}
                  noData={words.effect.noData}
                  tie={metric.tie}
                />
                {/* The legend: each setup's colour with its letter and what
                  the knob was on it. */}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                  {effect.values.map(({ letter, value }) => (
                    <span
                      key={letter}
                      className="inline-flex items-center gap-1.5"
                    >
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{
                          backgroundColor: colourOf(indexOf.get(letter)!),
                        }}
                      />
                      Setup {letter}
                      <span className="text-muted-foreground tabular-nums">
                        {n(value, value % 1 ? 1 : 0)}
                        {knobUnit(effect.knob)}
                      </span>
                    </span>
                  ))}
                </div>
                <p
                  className={cn(
                    "mt-3 text-xs",
                    effect.confounded.length > 0
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {effect.confounded.length > 0
                    ? words.effect.confounded(
                        effect.confounded.map(knobName).join(", "),
                      )
                    : words.effect.clean}{" "}
                  <span className="text-muted-foreground">
                    {words.effect.note}
                  </span>
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** The plot's box, in viewBox units, and its margins. Wide and low, and
 * never drawn wider than W px (by request, 2026-10-28: on a big screen it
 * grew to 340 px tall), so the labels stay at their size. */
const W = 820;
const H = 220;
const M = { top: 22, right: 20, bottom: 34, left: 64 };

/**
 * One knob against one figure: a dot per run in its setup's colour, each
 * setup's median as a short bar with its letter, the medians joined in
 * order of the knob. One axis each; the grid recedes.
 */
function EffectChart({
  points,
  colourOf,
  xLabel,
  yLabel,
  medianWord,
  noData,
  tie,
}: {
  /** The figure's tie: the axis never spans less than three of them, so
   * a difference inside the noise is not drawn as a cliff. */
  tie: number;
  points: { letter: string; x: number; y: number; run: string }[];
  colourOf: (letter: string) => string;
  xLabel: (v: number) => string;
  yLabel: (v: number) => string;
  medianWord: string;
  noData: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0)
    return <p className="mt-4 text-sm text-muted-foreground">{noData}</p>;

  const xs = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const xPad = (xMax - xMin || 1) * 0.12;
  const ys = points.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const minSpan = tie * 3;
  const grow = Math.max(0, minSpan - (hi - lo)) / 2;
  const yMin0 = lo - grow;
  const yMax0 = hi + grow;
  const yPad = (yMax0 - yMin0 || Math.abs(yMax0) || 1) * 0.2;
  const yMin = yMin0 - yPad;
  const yMax = yMax0 + yPad;
  const px = (v: number) =>
    M.left +
    ((v - (xMin - xPad)) / (xMax + xPad - (xMin - xPad))) *
      (W - M.left - M.right);
  const py = (v: number) =>
    M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
  const yTicks = Array.from(
    { length: 4 },
    (_, i) => yMin0 + ((yMax0 - yMin0) * i) / 3,
  );
  const uniqueYTicks = yMax0 === yMin0 ? [yMin0] : yTicks;

  // Each setup's median, and the dots of a setup spread a little sideways
  // so two runs with one value do not hide each other.
  const byLetter = new Map<string, typeof points>();
  for (const p of points)
    byLetter.set(p.letter, [...(byLetter.get(p.letter) ?? []), p]);
  const medians = [...byLetter.entries()]
    .map(([letter, list]) => ({
      letter,
      x: list[0].x,
      y: median(list.map((p) => p.y))!,
    }))
    .sort((a, b) => a.x - b.x);
  const offsetOf = new Map<(typeof points)[number], number>();
  for (const list of byLetter.values())
    list.forEach((p, i) => offsetOf.set(p, (i - (list.length - 1) / 2) * 9));

  const hovered = hover != null ? points[hover] : null;

  return (
    <div className="relative mt-5 w-full max-w-[820px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={medians
          .map((m) => `Setup ${m.letter}: ${xLabel(m.x)} → ${yLabel(m.y)}`)
          .join("; ")}
      >
        {/* The grid and the axes, recessive. */}
        {uniqueYTicks.map((v) => (
          <g key={v}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={py(v)}
              y2={py(v)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={M.left - 10}
              y={py(v)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {yLabel(v)}
            </text>
          </g>
        ))}
        {xs.map((v) => (
          <text
            key={v}
            x={px(v)}
            y={H - 10}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] tabular-nums"
          >
            {xLabel(v)}
          </text>
        ))}
        {/* The medians joined in order of the knob. */}
        {medians.length > 1 && (
          <polyline
            points={medians.map((m) => `${px(m.x)},${py(m.y)}`).join(" ")}
            fill="none"
            className="stroke-foreground/40"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {/* Each setup's median: a short bar in its colour, its letter over
            it — the letter carries identity where the colour is faint. */}
        {medians.map((m) => (
          <g key={m.letter}>
            <line
              x1={px(m.x) - 14}
              x2={px(m.x) + 14}
              y1={py(m.y)}
              y2={py(m.y)}
              stroke={colourOf(m.letter)}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <text
              x={px(m.x)}
              y={py(m.y) - 12}
              textAnchor="middle"
              className="fill-foreground text-[12px] font-semibold"
            >
              {m.letter}
            </text>
          </g>
        ))}
        {/* The runs: a dot each, ringed in the card's colour so neighbours
            stay apart, with a larger invisible target for the hover. */}
        {points.map((p, i) => {
          const cx = px(p.x) + (offsetOf.get(p) ?? 0);
          const cy = py(p.y);
          return (
            <g
              key={i}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? null : h))}
            >
              <circle
                cx={cx}
                cy={cy}
                r={5}
                fill={colourOf(p.letter)}
                className="stroke-card"
                strokeWidth={2}
              />
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm"
          style={{
            left: `${((px(hovered.x) + (offsetOf.get(hovered) ?? 0)) / W) * 100}%`,
            top: `calc(${(py(hovered.y) / H) * 100}% - 10px)`,
          }}
        >
          <span className="font-medium">{hovered.run}</span>
          <span className="text-muted-foreground">
            {" "}
            · Setup {hovered.letter}
          </span>
          <br />
          <span className="tabular-nums">
            {xLabel(hovered.x)} → {yLabel(hovered.y)}
          </span>
          <span className="text-muted-foreground">
            {" "}
            ({medianWord}{" "}
            {yLabel(medians.find((m) => m.letter === hovered.letter)!.y)})
          </span>
        </div>
      )}
    </div>
  );
}
