"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { proNumber, proPercent, type ProDictionary } from "@/lib/i18n/pro";
import type { ReportMetricKey } from "@/lib/imu/report";
import {
  AbsorptionAxisIcon,
  ControlAxisIcon,
  RecoveryAxisIcon,
  SupportAxisIcon,
} from "@/components/imu-setup-icons";
import {
  DYNAMICS_AXES,
  DYNAMICS_NOISE_SPAN,
  type DynamicsAxisKey,
  type DynamicsScore,
} from "@/lib/imu/setup-dynamics";

/**
 * The setup dynamics on the setups page (by request, 2026-09-15, from a
 * supplied layout; under the table since 2026-09-24): a four-axis radar
 * of two setups chosen from two dropdowns — absorption at the top,
 * control on the right, support at the foot, recovery on the left — on
 * the lab's hatched plate (off from 2026-09-15, back on 2026-09-25, both
 * by request), and beside it the
 * four axes as cards, each with the two scores as bars and the second
 * setup's gain or loss against the first.
 *
 * The scale is scoreDynamics's: 100 % is the best of the setups on the
 * trail, and the first ring in from the rim is one noise — a tie. The
 * chart waits for two setups: with one, every axis would read 100 %.
 */

/** The two setups' colours: the brand green and the chart's violet,
 * theme-aware through the tokens. Shared with "Em detalhe", whose bars
 * wear the same two. */
export const SETUP_COLOURS = ["var(--chart-1)", "var(--chart-2)"] as const;

/** The bars' colours (the axis boxes here, the detail cards on the
 * page): the brand green, and black for the second setup (by request,
 * 2026-09-25 — the supplied layout's), where the radar and the
 * dropdowns keep the violet as the setup's mark. */
export const BAR_COLOURS = ["var(--chart-1)", "var(--foreground)"] as const;

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

/** Each axis's mark, before its name on its box (by request,
 * 2026-09-25, the supplied art). */
const AXIS_ICONS: Record<
  DynamicsAxisKey,
  ComponentType<{ className?: string }>
> = {
  absorption: AbsorptionAxisIcon,
  control: ControlAxisIcon,
  support: SupportAxisIcon,
  recovery: RecoveryAxisIcon,
};

export interface ImuSetupDynamicsSetup {
  letter: string;
  /** The setup in one line, for the dropdown. */
  summary: string;
  runs: number;
  /** The whole setup, knob by knob, for the popover a setup's name opens
   * on the axis boxes (by request, 2026-09-24) — the table's own
   * popover, rendered by the page so this module need not import it. */
  details?: ReactNode;
  /** The popover trigger's aria-label: "The full setup B". */
  detailsLabel?: string;
}

/** The two setups a page compares, by letter: the pair the dynamics'
 * dropdowns pick, shared with "Em detalhe" (2026-09-25) so one choice
 * drives both. The page holds it (pickSetupPair); this module only
 * shows and changes it. */
export type SetupPair = [string | null, string | null];

/** The pair from what was picked and what exists: the reference first,
 * the next setup against it; a pick that no longer exists falls back
 * the same way. */
export function pickSetupPair(
  picked: SetupPair,
  letters: string[],
  referenceLetter: string | null,
): SetupPair {
  const fallbackA =
    referenceLetter && letters.includes(referenceLetter)
      ? referenceLetter
      : (letters[0] ?? null);
  const a = picked[0] && letters.includes(picked[0]) ? picked[0] : fallbackA;
  const fallbackB = letters.find((l) => l !== a) ?? null;
  const b = picked[1] && letters.includes(picked[1]) ? picked[1] : fallbackB;
  return [a, b];
}

export function ImuSetupDynamics({
  setups,
  scores,
  referenceLetter,
  pending,
  pair,
  onPairChange,
}: {
  setups: ImuSetupDynamicsSetup[];
  /** One per setup, in the same order, once its files are read. */
  scores: DynamicsScore[];
  referenceLetter: string | null;
  /** Files still being read: the chart fills in as they arrive. */
  pending: boolean;
  /** The two setups compared, already resolved (pickSetupPair). */
  pair: SetupPair;
  onPairChange: (pair: SetupPair) => void;
}) {
  const t = useProDict();
  const locale = useProLocale();
  const words = t.compare.dynamics;
  const [a, b] = pair;
  const chosen = [a, b].map((l) =>
    l ? (scores.find((s) => s.letter === l) ?? null) : null,
  );
  const enough = setups.length >= 2;
  const ready = chosen.every((s) => s != null);

  return (
    // One card for the whole module (by request, 2026-09-24, the supplied
    // layout): the heading with the two dropdowns beside it, then the
    // radar's plate on the left and the four axes as boxes on the right.
    <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
      <div className="px-5 py-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-x-[22px] gap-y-4">
          <div className="min-w-0">
            <p className="text-2xl leading-tight font-semibold">
              {words.title}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {words.subtitle}
            </p>
          </div>
          {enough && (
            <SetupPairPicker
              setups={setups}
              referenceLetter={referenceLetter}
              pair={pair}
              onPairChange={onPairChange}
            />
          )}
        </div>

        {/* The radar and the boxes in two equal halves (the Figma
            layout, 2026-09-25; 5 to 6 before). */}
        <div className="mt-8 grid gap-[22px] lg:grid-cols-2">
          {/* The lab's hatch on the plate (back by request, 2026-09-25 —
              it had come off on 2026-09-15): the same pattern the report's
              bands wear, with the labels' pills and the chips lifting off
              it on the card's white. */}
          <div className="imu-event-band @container rounded-[12px] border border-border p-3 sm:p-4">
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

          {/* The four axes as boxes, two by two: the axis's name with the
              second setup's gain or loss against the first as a pill, the
              two scores as bars in the setups' colours, and what the axis
              reads. The figures behind each score stay on the table
              above. */}
          {/* Two boxes a row only when the half holds them (measured: a
              box needs ~250 px for "Recuperação", its mark, the "i" and
              the pill) — counted against the half, not the window, since
              the half is the window's share. Narrower, one under another. */}
          <div className="@container">
            <div className="grid gap-[22px] @min-[520px]:grid-cols-2">
              {DYNAMICS_AXES.map((axis) => {
                const per = chosen.map(
                  (s) => s?.axes.find((x) => x.key === axis.key)?.score ?? null,
                );
                const axisWords = t.compare.axes[axis.key];
                const delta =
                  enough && ready && per[0] != null && per[1] != null
                    ? per[1] - per[0]
                    : null;
                return (
                  <div
                    key={axis.key}
                    className="flex min-w-0 flex-col rounded-lg border border-border p-4 sm:p-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <AxisMark axisKey={axis.key} />
                      <p className="flex min-w-0 items-center gap-1 text-base font-semibold">
                        <span className="truncate">{axisWords.name}</span>
                        <AxisInfo words={axisWords} metrics={axis.metrics} />
                      </p>
                      {delta != null && Math.round(delta) !== 0 && (
                        <span
                          // The second setup against the first, in points of
                          // the axis: the table's pill colours — green where
                          // it gained, the lab's red where it lost.
                          className={cn(
                            "shrink-0 rounded-full border border-foreground bg-foreground px-2 text-xs leading-[17px] font-normal tabular-nums",
                            delta > 0 ? "text-primary" : "text-[#FF5A39]",
                          )}
                          title={words.deltaTitle(b ?? "", a ?? "")}
                        >
                          {delta > 0 ? "+" : "−"}
                          {proPercent(Math.abs(delta), locale, 0)}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 w-full space-y-1">
                      {[a, b].map((l, i) => {
                        const setup = setups.find((s) => s.letter === l);
                        return (
                          <ScoreBar
                            key={i}
                            label={`Setup ${l ?? "—"}`}
                            colour={BAR_COLOURS[i]}
                            value={enough && ready ? per[i] : null}
                            hidden={!enough || !l}
                            details={setup?.details}
                            detailsLabel={setup?.detailsLabel}
                          />
                        );
                      })}
                    </div>
                    <p className="mt-[22px] text-sm text-muted-foreground">
                      {axisWords.description}
                    </p>
                    {/* The figures the axis is scored on (by request,
                      2026-09-24), as chips, from the axis's own list —
                      so the words never drift from what scoreDynamics
                      reads. */}
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {axis.metrics.map((key) => (
                        <li
                          key={key}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                        >
                          {t.report.metric[key]}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {enough && (
          <p className="mt-3 text-xs text-muted-foreground">
            {words.scale(DYNAMICS_NOISE_SPAN)}
          </p>
        )}
      </div>
    </div>
  );
}

function AxisMark({ axisKey }: { axisKey: DynamicsAxisKey }) {
  const Icon = AXIS_ICONS[axisKey];
  return <Icon className="text-foreground" />;
}

/** The "i" beside an axis's name (by request, 2026-09-24): the table's
 * own pattern — a popover, not a tooltip, since this is read on a phone
 * — with what the axis reads, the figures it is made of, and the
 * settings that move it, the main one first. */
function AxisInfo({
  words,
  metrics,
}: {
  words: ProDictionary["compare"]["axes"][DynamicsAxisKey];
  metrics: ReportMetricKey[];
}) {
  const t = useProDict();
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t.compare.metricInfo.whatIs(words.name)}
        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4">
        <p className="text-sm font-semibold">{words.name}</p>
        <p className="mt-1.5 text-sm font-normal text-muted-foreground">
          {words.description}.{" "}
          {metrics.map((key) => t.report.metric[key]).join(" · ")}.
        </p>
        <p className="mt-2 border-t border-border pt-2 text-xs font-medium text-foreground">
          {t.compare.metricInfo.tuning}
        </p>
        <ul className="mt-1.5 space-y-1.5 text-xs font-normal text-muted-foreground">
          {words.tuning.map((item, i) => (
            <li key={item.knob}>
              <span
                className={cn("text-foreground", i === 0 && "font-semibold")}
              >
                {item.knob}:
              </span>{" "}
              {item.effect}
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-border pt-2 text-xs font-normal text-muted-foreground">
          {t.compare.metricInfo.tuningNote}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** One setup's score on an axis as a bar: the word, the track with the
 * setup's colour filling its share of it, the number. The fill eases to
 * a new score, so switching a dropdown moves the bars as it moves the
 * radar's vertices. */
function ScoreBar({
  label,
  colour,
  value,
  hidden,
  details,
  detailsLabel,
}: {
  label: string;
  colour: string;
  /** 0–100, or null while the files are read. */
  value: number | null;
  /** No setup to show on this row: the row keeps its place, unseen. */
  hidden: boolean;
  /** The whole setup, for the popover the word opens; none, and the word
   * is only a word. */
  details?: ReactNode;
  detailsLabel?: string;
}) {
  const locale = useProLocale();
  const word = "w-[64px] shrink-0 truncate text-left text-base font-medium";
  return (
    <div
      // Tight columns (by request, 2026-09-24): the word and the number
      // take only the room "Setup B" and "100" need, the bar the rest.
      className={cn("flex w-full items-center gap-3", hidden && "invisible")}
    >
      {details ? (
        // The setup's name opens the whole setup, as it does on the table
        // (by request, 2026-09-24): a popover, since this is read on a
        // phone too.
        <Popover>
          <PopoverTrigger
            aria-label={detailsLabel}
            className={cn(
              word,
              "cursor-pointer rounded-[6px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50",
            )}
          >
            {label}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-4">
            {details}
          </PopoverContent>
        </Popover>
      ) : (
        <span className={word}>{label}</span>
      )}
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-400 ease-out"
          style={{
            width: `${value ?? 0}%`,
            background: colour,
          }}
        />
      </div>
      <span className="w-7 shrink-0 text-right text-sm font-medium text-muted-foreground tabular-nums">
        {value == null ? "…" : proNumber(value, locale, 0)}
      </span>
    </div>
  );
}

/** The two dropdowns that pick the pair, "Setup A vs Setup B": on the
 * dynamics' heading and on "Em detalhe"'s (by request, 2026-09-25), both
 * driving the one pair the page holds, so either moves both modules. */
export function SetupPairPicker({
  setups,
  referenceLetter,
  pair,
  onPairChange,
}: {
  setups: ImuSetupDynamicsSetup[];
  referenceLetter: string | null;
  pair: SetupPair;
  onPairChange: (pair: SetupPair) => void;
}) {
  const t = useProDict();
  const words = t.compare.dynamics;
  const [a, b] = pair;
  return (
    <div className="flex flex-1 items-center gap-3 sm:flex-none">
      <SetupPicker
        colour={SETUP_COLOURS[0]}
        value={a ?? ""}
        setups={setups}
        referenceLetter={referenceLetter}
        label={words.firstSetup}
        onChange={(l) => onPairChange([l, b])}
      />
      <span className="text-sm text-muted-foreground uppercase">
        {words.vs}
      </span>
      <SetupPicker
        colour={SETUP_COLOURS[1]}
        value={b ?? ""}
        setups={setups}
        referenceLetter={referenceLetter}
        label={words.secondSetup}
        onChange={(l) => onPairChange([a, l])}
      />
    </div>
  );
}

function SetupPicker({
  colour,
  value,
  setups,
  referenceLetter,
  label,
  onChange,
}: {
  colour: string;
  value: string;
  setups: ImuSetupDynamicsSetup[];
  /** The setup this page's session rode on, marked in the list (by
   * request, 2026-09-25). */
  referenceLetter: string | null;
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
        className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-[7px] -translate-y-1/2 rounded-full"
        style={{ background: colour }}
      />
      <NativeSelect
        aria-label={label}
        className="h-12 rounded-[11px] bg-card pl-[27px] text-sm tracking-[-0.15px]"
        wrapperClassName="min-w-[120px] flex-1 sm:flex-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {setups.map((s) => (
          <option key={s.letter} value={s.letter}>
            Setup {s.letter}
            {s.letter === referenceLetter
              ? ` ${t.compare.dynamics.usedInThisRun}`
              : ""}
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
