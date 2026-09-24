"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { Bike, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NativeSelect } from "@/components/ui/native-select";
import { ImuDocGlyph } from "@/components/imu-pro-logo";
import {
  ChassisBandIcon,
  ChatterBandIcon,
  HarshnessIcon,
  ImpactIcon,
  RetentionIcon,
  SettleIcon,
  SetupSlidersIcon,
  SpeedGaugeIcon,
} from "@/components/imu-setup-icons";
import type { ImuSnapshotCandidate } from "@/components/imu-snapshot-view";
import { ImuSetupDynamics } from "@/components/imu-setup-dynamics";
import { useProDict, useProLocale } from "@/components/pro-locale";
import type { Locale } from "@/lib/i18n";
import { proNumber, proPercent, type ProDictionary } from "@/lib/i18n/pro";
import type { CompareColumnKey } from "@/lib/i18n/pro/compare";
import { loadImuSession } from "@/lib/imu/use-imu-session";
import { dynamicsMetricRules, scoreDynamics } from "@/lib/imu/setup-dynamics";
import {
  buildSessionReport,
  type ReportMetric,
  type ReportMetricKey,
  type SessionReport,
} from "@/lib/imu/report";
import {
  circuitMode,
  damperSpring,
  changeDirection,
  formatSetupChange,
  type SetupChange,
  setupDiff,
  setupKey,
  setupSummary,
  type ImuDamperSetup,
  type ImuSetupValues,
  sagPercent,
} from "@/lib/imu/setup";

/**
 * The setups of one bike, run by run — the supplied layout (2026-09-12,
 * "quero que o layout fique completamente idêntico"): the heading on the
 * lab's dotted ground, then a hatched plate holding a white card with the
 * comparison table, then a second plate with the setup that did best.
 *
 * The table: a row per run, its name with the date in brackets and REF
 * on the reference; its setup as "Setup A" with the knobs that differ
 * from the reference's as black pills; then a column per figure of the
 * report, each headed by a mark, the value in bold where it differs from
 * the reference's with the difference in a pill — black with green where
 * better, black with red where worse, white with a black outline where
 * neither direction is better. Above it,
 * what the set of setups held constant and what it varied, computed from
 * the setups, so the reader knows which knob the table is about.
 *
 * At the foot, the setup that did best by a declared figure, its knobs
 * as tiles — and, with one setup only, the honest note that it is the
 * only one known and was compared with nothing; with several, whether
 * the margin beats the spread between two runs on the same setup.
 *
 * The files are read here, in the browser, as they arrive.
 *
 * The words — the headings, the "i"s' explanations, the sentences — are
 * the Pro dictionary's (`compare`), read through useProDict(); what stays
 * here is the structure: which report figure each column reads, its
 * mark, its band.
 */

/**
 * The table's columns, each reading one figure of the report by that
 * figure's key (ReportMetricKey, the same in every language). The words
 * for each are `t.compare.columns[key]`.
 */
const COLUMNS: {
  key: CompareColumnKey;
  /** The report's key for the figure. */
  metric: ReportMetricKey;
  Icon: ComponentType<{ className?: string }>;
  /** The band, printed light in brackets after the name (by request,
   * 2026-09-12: "[2–12 Hz] fonte light"). */
  band?: string;
}[] = [
  { key: "speed", metric: "avgSpeed", Icon: SpeedGaugeIcon },
  { key: "retention", metric: "cornerRetention", Icon: RetentionIcon },
  { key: "harshness", metric: "harshness", Icon: HarshnessIcon },
  {
    key: "chassis",
    metric: "chassisMovement",
    band: "2–12 Hz",
    Icon: ChassisBandIcon,
  },
  {
    key: "chatter",
    metric: "chatter",
    band: "12–60 Hz",
    Icon: ChatterBandIcon,
  },
  { key: "settle", metric: "residualOscillation", Icon: SettleIcon },
  { key: "impacts", metric: "impacts", Icon: ImpactIcon },
];

/** The figure the best setup is picked by: what the corners kept, the
 * one figure on the table that is the bike's grip more than the trail's
 * hits. Ties go to the lower harshness. Both by the report's key, the
 * columns' way. */
const BEST_BY = COLUMNS.find((c) => c.key === "retention")!.metric;
const BEST_TIE_BREAK = COLUMNS.find((c) => c.key === "harshness")!.metric;

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; report: SessionReport };

type Tone = "better" | "worse" | "tie" | "neutral";

const nf = (value: number, digits: number, locale: Locale) =>
  proNumber(value, locale, digits);
const signed = (value: number, digits: number, locale: Locale) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${nf(Math.abs(value), digits, locale)}`;
/** How many decimals the report printed the figure with — whichever
 * separator its language uses. */
const digitsOf = (m: ReportMetric) =>
  (m.value.match(/[.,](\d+)/)?.[1] ?? "").length;
const unitOf = (m: ReportMetric) => m.unit ?? (/%$/.test(m.value) ? "%" : "");
/** "[11.9.26]" — the supplied layout's date. */
const bracketDate = (iso: string) => {
  const d = new Date(iso);
  return `[${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(-2)}]`;
};

function metricOf(
  report: SessionReport,
  key: ReportMetricKey,
): ReportMetric | null {
  return (
    [...report.rider.metrics, ...report.bike.metrics, ...report.trail.metrics]
      .filter((m) => m.raw != null)
      .find((m) => m.key === key) ?? null
  );
}

function toneOf(m: ReportMetric, diff: number): Tone {
  if (Math.abs(diff) <= (m.tie ?? 0)) return "tie";
  if (!m.better) return "neutral";
  return (m.better === "lower" ? diff < 0 : diff > 0) ? "better" : "worse";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface ImuSetupCompareLabels {
  fork: string | null;
  shock: string | null;
}

export function ImuSetupCompareView({
  reference,
  runs,
  labels,
  leftOut,
}: {
  /** The session this page was reached from: the row every other is
   * read against. */
  reference: ImuSnapshotCandidate;
  /** The bike's other runs on the same trail, newest first. */
  runs: ImuSnapshotCandidate[];
  /** What the bike calls its dampers, for the sentence and the tiles. */
  labels: ImuSetupCompareLabels;
  /** What the page does not show, and why — for one honest line. */
  leftOut: { otherTrail: number; otherRider: number; noGps: boolean };
}) {
  const t = useProDict();
  const locale = useProLocale();
  const words = t.compare;
  // The numbers as the reader's language writes them.
  const n = (value: number, digits: number) => nf(value, digits, locale);
  const sg = (value: number, digits: number) => signed(value, digits, locale);
  const all = useMemo(() => [reference, ...runs], [reference, runs]);
  const [loaded, setLoaded] = useState<Map<string, Loaded>>(
    () => new Map(all.map((c) => [c.id, { status: "loading" }])),
  );
  /** The table's two dropdowns, back by request (2026-09-14): which setup
   * to show against the reference, and in what order. They shape the
   * table only — the detail cards and the best setup read every run. */
  const [setupFilter, setSetupFilter] = useState("");
  const [sort, setSort] = useState<"setup" | "date">("setup");

  useEffect(() => {
    let cancelled = false;
    for (const c of all) {
      (async () => {
        const result = await loadImuSession(
          c.storagePath,
          c.mountOrientation,
          c.trim,
          locale,
        );
        if (cancelled) return;
        const next: Loaded =
          result.data === null
            ? { status: "error", message: result.error }
            : {
                status: "done",
                report: buildSessionReport(result.data, locale),
              };
        setLoaded((prev) => new Map(prev).set(c.id, next));
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [all, locale]);

  const pending = [...loaded.values()].filter(
    (l) => l.status === "loading",
  ).length;
  const failed = all.filter((c) => loaded.get(c.id)?.status === "error");
  const reportOf = (c: ImuSnapshotCandidate): SessionReport | null => {
    const state = loaded.get(c.id);
    return state?.status === "done" ? state.report : null;
  };
  const referenceReport = reportOf(reference);

  // One letter per distinct setup — the reference's first, then by the
  // run's date, so a letter does not move when a newer run arrives.
  const setupLetters = useMemo(() => {
    const letters = new Map<string, string>();
    const ordered = [
      reference,
      ...[...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ];
    for (const r of ordered) {
      if (!r.setup) continue;
      const key = setupKey(r.setup);
      if (!letters.has(key))
        letters.set(key, String.fromCharCode(65 + letters.size));
    }
    return letters;
  }, [reference, runs]);
  const letterOf = (c: ImuSnapshotCandidate) =>
    c.setup ? (setupLetters.get(setupKey(c.setup)) ?? null) : null;

  /** The setups, each with its runs and — once their files are read — the
   * median of every column across them, for the choice at the foot. */
  const groups = [...setupLetters.entries()].map(([key, letter]) => {
    const members = all.filter((c) => c.setup && setupKey(c.setup) === key);
    // Every figure with a number, not only the table's columns: the
    // dynamics at the head read the Bike section's whole set.
    const values = new Map<string, number[]>();
    for (const c of members) {
      const r = reportOf(c);
      if (!r) continue;
      for (const m of [
        ...r.rider.metrics,
        ...r.bike.metrics,
        ...r.trail.metrics,
      ])
        if (m.raw != null)
          values.set(m.key, [...(values.get(m.key) ?? []), m.raw]);
    }
    const medians = new Map<string, number>();
    for (const [label, list] of values) medians.set(label, median(list)!);
    return { key, letter, setup: members[0].setup!, members, values, medians };
  });
  const unset = all.filter((c) => !c.setup);

  // The dynamics at the head: each setup scored on the four axes against
  // the best of them, from the medians above — only the setups whose
  // files are all read, so a score never moves under the reader.
  const loadedReports = all
    .map(reportOf)
    .filter((r): r is SessionReport => r != null);
  const dynamicsRules = dynamicsMetricRules(loadedReports);
  const dynamicsGroups = groups.filter((g) => g.members.every(reportOf));
  const dynamicsScores = scoreDynamics(dynamicsGroups, dynamicsRules);

  const list = (items: string[]) =>
    items.length <= 1
      ? items.join("")
      : `${items.slice(0, -1).join(", ")} ${t.common.and} ${items[items.length - 1]}`;

  // The rows: the reference first whatever the filter — it is what every
  // other row is read against — then the runs the setup filter keeps,
  // grouped by setup in the letters' order (the runs without one last) or
  // newest first.
  const others = all
    .filter((c) => c.id !== reference.id)
    .filter(
      (c) =>
        !setupFilter ||
        (setupFilter === "none"
          ? !c.setup
          : (letterOf(c) ?? "") === setupFilter),
    )
    .sort((a, b) => {
      const byDate = b.createdAt.localeCompare(a.createdAt);
      if (sort !== "setup") return byDate;
      return (letterOf(a) ?? "~").localeCompare(letterOf(b) ?? "~") || byDate;
    });
  const rows = [reference, ...others];

  // The best setup: by the declared figure over the setups whose files
  // are in; the tie-break by the second. What its margin has to beat is
  // the metric's own tie or — when any setup was ridden twice — the widest
  // spread between two runs on one setup, what the day alone does.
  const ranked = groups
    .filter((g) => g.medians.has(BEST_BY))
    .sort(
      (a, b) =>
        b.medians.get(BEST_BY)! - a.medians.get(BEST_BY)! ||
        (a.medians.get(BEST_TIE_BREAK) ?? Infinity) -
          (b.medians.get(BEST_TIE_BREAK) ?? Infinity),
    );
  const best = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;
  const bestMargin =
    best && runnerUp
      ? best.medians.get(BEST_BY)! - runnerUp.medians.get(BEST_BY)!
      : null;
  const bestMetric = referenceReport
    ? metricOf(referenceReport, BEST_BY)
    : null;
  const withinSetupSpread = Math.max(
    0,
    ...groups.map((g) => {
      const v = g.values.get(BEST_BY) ?? [];
      return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0;
    }),
  );
  const bestNoise = Math.max(bestMetric?.tie ?? 0, withinSetupSpread);
  const shown = groups.length === 1 ? groups[0] : best;

  const leftOutBits: string[] = [];
  if (leftOut.noGps) leftOutBits.push(words.header.leftOutNoGps);
  else if (leftOut.otherTrail > 0)
    leftOutBits.push(words.header.leftOutOtherTrail(leftOut.otherTrail));
  if (leftOut.otherRider > 0)
    leftOutBits.push(words.header.leftOutOtherRider(leftOut.otherRider));

  // "Em detalhe": each other setup against the reference's, knob by knob —
  // what moved, by how much, and what the two figures the choice rests on
  // did. Only once both sides' files are read.
  const referenceGroup = groups.find((g) =>
    g.members.some((c) => c.id === reference.id),
  );
  const details = referenceGroup
    ? groups
        .filter((g) => g !== referenceGroup)
        .map((g) => {
          const changes = setupDiff(referenceGroup.setup, g.setup, locale);
          // The card's title, the supplied layout's way: the component
          // light, the knob in full and bold, the setup — "Fox X2 ·
          // High-Speed Compression · Setup B". Which component a change
          // belongs to is the change's own block; the knob's full name
          // comes from the dictionary's table by the change's field.
          const component = (c: SetupChange) =>
            c.block === "fork"
              ? labels.fork || words.parts.fork
              : c.block === "shock"
                ? labels.shock || words.parts.shock
                : c.block === "tires"
                  ? words.parts.tires
                  : words.parts.rider;
          const knobOf = (c: SetupChange) => words.knobs[c.knob] ?? c.knob;
          const components = [...new Set(changes.map(component))];
          const knobs = changes.map(knobOf);
          const boxes = changes.map((c) => {
            const steps =
              c.from != null && c.to != null ? Math.abs(c.to - c.from) : 0;
            const unit =
              c.kind === "clicks" ? words.clicks(steps) : c.unit.trim();
            const num = (x: number | null) => (x == null ? "—" : n(x, 0));
            const delta =
              c.from != null && c.to != null
                ? `${sg(c.to - c.from, 0)}${unit ? ` ${unit}` : ""}`
                : null;
            // The direction in words ("mais aberto") is setup.ts's, in
            // the reader's language — the pills on the table say the same.
            const direction =
              c.from != null && c.to != null
                ? changeDirection(c.kind, c.to - c.from, locale)
                : null;
            return {
              knob: knobOf(c),
              text: `${num(c.from)} → ${num(c.to)}`,
              delta,
              direction: direction
                ? direction.charAt(0).toUpperCase() + direction.slice(1)
                : null,
            };
          });
          // Each figure the choice rests on: the reference run's value,
          // this setup's median, the spread across its runs when it has
          // more than one — two runs on one setup are the noise every
          // difference has to beat (by request, 2026-09-12) — and the
          // verdict against the wider of that spread and the metric's tie.
          const effects = [BEST_BY, BEST_TIE_BREAK]
            .map((metricLabel) => {
              const ref = referenceReport
                ? metricOf(referenceReport, metricLabel)
                : null;
              const to = g.medians.get(metricLabel);
              if (ref?.raw == null || to == null) return null;
              const digits = digitsOf(ref);
              const unit = unitOf(ref);
              const values = g.values.get(metricLabel) ?? [];
              const range =
                values.length > 1
                  ? { min: Math.min(...values), max: Math.max(...values) }
                  : null;
              const spreadAll = Math.max(
                0,
                ...groups.map((other) => {
                  const v = other.values.get(metricLabel) ?? [];
                  return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0;
                }),
              );
              const noise = Math.max(ref.tie ?? 0, spreadAll);
              const diff = to - ref.raw;
              const tone: Tone =
                Math.abs(diff) <= noise ? "tie" : toneOf(ref, diff);
              const fmt = (x: number) =>
                `${n(x, digits)}${/^[°/%×]/.test(unit) ? "" : " "}${unit}`;
              // A difference's unit: percentage points for a share, else
              // the figure's own.
              const deltaUnit =
                unit === "%"
                  ? " pp"
                  : unit
                    ? `${/^[°/×]/.test(unit) ? "" : " "}${unit}`
                    : "";
              const column = COLUMNS.find((c) => c.metric === metricLabel)!;
              return {
                name: words.columns[column.key].short,
                ref: fmt(ref.raw),
                value: fmt(to),
                runs: values.length,
                range: range
                  ? `${n(range.min, digits)}–${fmt(range.max)}`
                  : null,
                delta: `${sg(diff, digits)}${deltaUnit}`,
                tone,
                verdict:
                  tone === "tie"
                    ? range
                      ? words.details.withinSpread
                      : words.details.withinNoise(
                          `${n(noise, digits)}${deltaUnit}`,
                        )
                    : tone === "better"
                      ? words.details.aboveBetter
                      : tone === "worse"
                        ? words.details.aboveWorse
                        : words.details.above,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x != null);
          return {
            letter: g.letter,
            component: components.join(` ${t.common.and} `),
            knobs: list(knobs),
            boxes,
            changes,
            runs: g.members.length,
            effects,
          };
        })
        .filter((d) => d.changes.length > 0)
    : [];

  return (
    <div className="space-y-[18px]">
      {/* The heading, in a card of its own (the supplied layout). */}
      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <ImuDocGlyph className="h-auto w-[28px] text-foreground" />
          <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
            <Bike className="size-4" strokeWidth={2} aria-hidden />
            {reference.bikeName ?? words.header.fallbackBike}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold">
            {words.header.title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {words.header.reference}{" "}
            <Link
              href={`/pro/sessoes/${reference.id}`}
              className="text-foreground underline underline-offset-2"
            >
              {reference.name}
            </Link>{" "}
            · {words.header.otherRuns(runs.length, !!reference.riderName)}
            {leftOutBits.length > 0 && ` · ${leftOutBits.join(" · ")}`}
          </p>
        </div>
      </div>

      <ImuSetupDynamics
        setups={groups.map((g) => ({
          letter: g.letter,
          summary: setupSummary(g.setup, labels, locale) ?? "",
          runs: g.members.length,
        }))}
        scores={dynamicsScores}
        rules={dynamicsRules}
        referenceLetter={letterOf(reference)}
        pending={pending > 0}
      />

      {runs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {groups.length + (unset.length > 0 ? 1 : 0) > 1 && (
            <NativeSelect
              wrapperClassName="min-w-[180px] flex-1 sm:flex-none"
              className="h-11 bg-card text-sm"
              aria-label={words.filters.setup}
              value={setupFilter}
              onChange={(e) => setSetupFilter(e.target.value)}
            >
              <option value="">{words.filters.allSetups}</option>
              {groups.map((g) => {
                const summary = setupSummary(g.setup, labels, locale);
                return (
                  <option key={g.letter} value={g.letter}>
                    {words.filters.setupOption(g.letter)}
                    {summary && ` · ${summary}`}
                  </option>
                );
              })}
              {unset.length > 0 && (
                <option value="none">{words.filters.noSetup}</option>
              )}
            </NativeSelect>
          )}
          <NativeSelect
            wrapperClassName="min-w-[180px] flex-1 sm:flex-none"
            className="h-11 bg-card text-sm"
            aria-label={words.filters.order}
            value={sort}
            onChange={(e) => setSort(e.target.value as "setup" | "date")}
          >
            <option value="setup">{words.filters.groupedBySetup}</option>
            <option value="date">{words.filters.newestFirst}</option>
          </NativeSelect>
        </div>
      )}

      {pending > 0 && (
        <p className="px-1 text-sm text-muted-foreground" aria-live="polite">
          {words.reading(all.length - pending + 1, all.length)}
        </p>
      )}
      {failed.map((c) => (
        <p key={c.id} role="alert" className="px-1 text-sm text-destructive">
          {c.name}: {(loaded.get(c.id) as { message: string }).message}
        </p>
      ))}

      {/* One card, three sections ruled apart (the supplied layout). */}
      <div
        className={cn(
          "divide-y divide-border rounded-lg bg-card",
          DARK_CARD_HAIRLINE,
        )}
      >
        <section className="px-5 py-6 sm:px-6 sm:py-8">
          <p className="text-lg font-semibold">{words.table.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {words.table.intro}
          </p>

          {/* Wider than a phone, the table scrolls inside the card. */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pr-4 pb-3 align-bottom font-semibold">
                    {words.table.session}
                  </th>
                  <th className="px-4 pb-3 align-bottom font-semibold">
                    <SetupSlidersIcon className="mb-2" />
                    <span className="flex items-center gap-1">
                      {words.table.setup}
                      <MetricInfo
                        label={words.table.setup}
                        description={words.table.setupDescription}
                      />
                    </span>
                  </th>
                  {COLUMNS.map((c) => {
                    const column = words.columns[c.key];
                    return (
                      <th
                        key={c.key}
                        className="px-4 pb-3 align-bottom font-semibold whitespace-nowrap"
                      >
                        <c.Icon className="mb-2" />
                        <span className="flex items-center gap-1">
                          {column.short}
                          <MetricInfo
                            label={column.name}
                            description={column.description}
                            method={column.method}
                            footnote={column.footnote}
                            band={c.band}
                          />
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    report={reportOf(run)}
                    letter={letterOf(run)}
                    reference={reference}
                    referenceReport={referenceReport}
                    labels={labels}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {runs.length > 0 && others.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              {words.table.noOtherWithSetup}
            </p>
          )}
          {runs.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              {words.table.onlyThisRun}
            </p>
          )}
        </section>

        {details.length > 0 && (
          <section className="px-5 py-6 sm:px-6 sm:py-8">
            <p className="text-lg font-semibold">{words.details.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {words.details.intro}
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {details.map((d) => (
                <div
                  key={d.letter}
                  className="rounded-[14px] border border-border p-5"
                >
                  <p className="text-lg">
                    {d.component} ·{" "}
                    <span className="font-semibold">{d.knobs}</span> · Setup{" "}
                    {d.letter}
                    {d.runs > 1 && (
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        {t.common.run(d.runs)}
                      </span>
                    )}
                  </p>
                  {/* The change on the left in a box of its own, the
                      figures on the right (the supplied layout). */}
                  <div className="mt-4 grid gap-3 sm:grid-cols-[168px_1fr]">
                    <div className="flex flex-col gap-3">
                      {d.boxes.map((box) => (
                        <div
                          key={box.knob}
                          className="flex flex-1 flex-col items-center justify-center rounded-[12px] border border-border px-3 py-4 text-center"
                        >
                          <p className="text-sm text-muted-foreground">
                            {words.details.changeOf}
                            {d.boxes.length > 1 && (
                              <span className="block text-xs">{box.knob}</span>
                            )}
                          </p>
                          <p className="mt-1.5 text-2xl font-semibold tabular-nums">
                            {box.text}
                          </p>
                          {box.delta && (
                            <span className="mt-2 rounded-full bg-foreground px-2.5 py-0.5 text-xs font-medium text-background tabular-nums">
                              {box.delta}
                            </span>
                          )}
                          {box.direction && (
                            <p className="mt-1.5 text-sm text-muted-foreground">
                              [{box.direction}]
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    {d.effects.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {d.effects.map((effect) => (
                          <div
                            key={effect.name}
                            className="flex flex-1 flex-col justify-center rounded-[12px] bg-muted/40 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="mr-1 text-base font-semibold">
                                {effect.name}
                              </p>
                              <span className="rounded-[8px] bg-card px-2.5 py-1 text-sm tabular-nums">
                                {words.details.reference}{" "}
                                <span className="font-semibold">
                                  {effect.ref}
                                </span>
                              </span>
                              <span className="rounded-[8px] bg-card px-2.5 py-1 text-sm tabular-nums">
                                {words.details.setupValue(d.letter)}{" "}
                                <span className="font-semibold">
                                  {effect.value}
                                </span>
                                {effect.runs > 1 && (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    {words.details.medianOf(effect.runs)}
                                  </span>
                                )}
                              </span>
                              {effect.range && (
                                <span className="rounded-[8px] bg-card px-2.5 py-1 text-sm tabular-nums">
                                  {words.details.runsRange}{" "}
                                  <span className="font-semibold">
                                    {effect.range}
                                  </span>
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm">
                              <span
                                className={cn(
                                  "font-semibold tabular-nums",
                                  effect.tone === "better" &&
                                    "text-emerald-600 dark:text-emerald-400",
                                  effect.tone === "worse" && "text-[#FF5A39]",
                                )}
                              >
                                {effect.delta}
                              </span>
                              , {effect.verdict}.
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="self-center text-sm text-muted-foreground">
                        {words.waitingForSessions}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* The best so far — or the only one known, said as such. */}
        {shown && (
          <section className="px-5 py-6 sm:px-6 sm:py-8">
            <p className="text-lg font-semibold">{words.best.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {groups.length === 1
                ? words.best.onlyOne
                : !best
                  ? words.waitingForSessions
                  : bestMargin != null && Math.abs(bestMargin) <= bestNoise
                    ? words.best.withinNoise(
                        best.letter,
                        runnerUp!.letter,
                        sg(bestMargin, 1),
                        n(bestNoise, 1),
                      )
                    : words.best.clear(
                        best.letter,
                        proPercent(best.medians.get(BEST_BY)!, locale, 0),
                        best.members.length,
                        runnerUp
                          ? {
                              letter: runnerUp.letter,
                              margin: sg(bestMargin!, 0),
                            }
                          : null,
                      )}
            </p>
            <SetupTiles setup={shown.setup} labels={labels} />
          </section>
        )}
      </div>
    </div>
  );
}

/** The "i" beside a heading: what the figure is and which way is better
 * — the analysis page's own pattern, a popover and not a tooltip because
 * a finger cannot hover. */
export function MetricInfo({
  label,
  description,
  method,
  footnote,
  band,
}: {
  label: string;
  description: string;
  method?: string;
  footnote?: string;
  /** The band, light after the name (by request, 2026-09-12). */
  band?: string;
}) {
  const t = useProDict();
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t.compare.metricInfo.whatIs(label)}
        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="p-4">
        <p className="text-sm font-semibold">
          {band ? label.replace(` ${band}`, "") : label}
          {band && <span className="ml-1.5 font-light">[{band}]</span>}
        </p>
        <p className="mt-1.5 text-sm font-normal text-muted-foreground">
          {description}
        </p>
        {method && (
          <p className="mt-2 border-t border-border pt-2 text-xs font-normal text-muted-foreground">
            <span className="font-medium text-foreground">
              {t.compare.metricInfo.method}
            </span>{" "}
            {method}
          </p>
        )}
        {footnote && (
          <p className="mt-2 border-t border-border pt-2 text-xs font-normal text-muted-foreground">
            {footnote}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RunRow({
  run,
  report,
  letter,
  reference,
  referenceReport,
  labels,
}: {
  run: ImuSnapshotCandidate;
  report: SessionReport | null;
  letter: string | null;
  reference: ImuSnapshotCandidate;
  referenceReport: SessionReport | null;
  labels: ImuSetupCompareLabels;
}) {
  const t = useProDict();
  const locale = useProLocale();
  const isReference = run.id === reference.id;
  const changes =
    !isReference && reference.setup && run.setup
      ? setupDiff(reference.setup, run.setup, locale)
      : [];
  return (
    <tr className="h-[90px] border-t border-border">
      <td className="py-2 pr-4 align-middle whitespace-nowrap">
        <Link
          href={`/pro/sessoes/${run.id}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {run.name.split(" - ")[0]}
        </Link>{" "}
        <span className="text-xs text-muted-foreground">
          {bracketDate(run.createdAt)}
        </span>
        {isReference && (
          <span className="ml-2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wide text-background">
            REF
          </span>
        )}
      </td>
      <td className="px-4 py-2 align-middle">
        <div className="flex flex-wrap items-center gap-2">
          {run.setup && letter ? (
            // The whole setup, on a click (by request, 2026-09-12): a
            // popover with every knob listed, the same blocks the tiles
            // below draw. A popover and not a tooltip: this is read on a
            // phone, where hover is not a thing a finger does.
            <Popover>
              <PopoverTrigger
                aria-label={t.compare.row.fullSetup(letter)}
                className="flex cursor-pointer items-center gap-2 rounded-[6px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <FileText
                  className="size-[18px] shrink-0 text-foreground"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="whitespace-nowrap">Setup {letter}</span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-4">
                <ImuSetupDetails
                  title={`Setup ${letter}`}
                  setup={run.setup}
                  note={run.setupNote}
                  labels={labels}
                />
              </PopoverContent>
            </Popover>
          ) : (
            <>
              <FileText
                className="size-[18px] shrink-0 text-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="whitespace-nowrap">{t.compare.row.noSetup}</span>
            </>
          )}
          {changes.map((change) => (
            <span
              key={change.label}
              className="rounded-full border border-foreground bg-card px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground tabular-nums"
            >
              {formatSetupChange(change, locale)}
            </span>
          ))}
        </div>
      </td>
      {COLUMNS.map(({ key, metric }) => {
        const m = report ? metricOf(report, metric) : null;
        const ref =
          !isReference && referenceReport
            ? metricOf(referenceReport, metric)
            : null;
        return (
          <td
            key={key}
            className="px-4 py-2 align-middle whitespace-nowrap tabular-nums"
          >
            {!report ? (
              <span className="text-muted-foreground">…</span>
            ) : m == null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <Figure metric={m} reference={ref} />
            )}
          </td>
        );
      })}
    </tr>
  );
}

/** A setup's every knob, listed the way the popover on a run's setup shows
 * it — here, and on a Snapshot's passes — with the rider's note under it.
 * The popover itself stays with the caller: each has its own trigger. */
export function ImuSetupDetails({
  title,
  setup,
  note,
  labels,
}: {
  title: string;
  setup: ImuSetupValues;
  note: string | null;
  labels: ImuSetupCompareLabels;
}) {
  const t = useProDict();
  const locale = useProLocale();
  return (
    <>
      <p className="text-sm font-semibold">{title}</p>
      {setupBlocks(setup, labels, t, locale).map((block) => (
        <div key={block.kind} className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {block.kind}
            {block.name && ` · ${block.name}`}
          </p>
          <ul className="mt-1 divide-y divide-border">
            {block.tiles.map((tile) => (
              <li
                key={tile.label}
                className="flex items-baseline justify-between gap-3 py-1 text-sm"
              >
                <span className="text-muted-foreground">{tile.label}</span>
                <span className="font-medium whitespace-nowrap tabular-nums">
                  {tile.value}
                  {tile.unit === "%" ? "" : " "}
                  {tile.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {note && <p className="mt-3 text-xs text-muted-foreground">“{note}”</p>}
    </>
  );
}

/** One figure and, beside it, its difference to the reference's in a
 * pill — bold where it differs beyond the tie. */
function Figure({
  metric,
  reference,
}: {
  metric: ReportMetric;
  reference: ReportMetric | null;
}) {
  const locale = useProLocale();
  const diff =
    reference?.raw != null && metric.raw != null
      ? metric.raw - reference.raw
      : null;
  const tone = reference && diff != null ? toneOf(reference, diff) : null;
  const unit = unitOf(metric);
  const differs = tone != null && tone !== "tie";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn(differs && "font-bold")}>
        {metric.value.replace(/\s*%$/, "")}
        {unit && (
          <>
            {/^[°/%×]/.test(unit) ? "" : " "}
            {unit}
          </>
        )}
      </span>
      {differs && diff != null && (
        <span
          // The verdict in the pill's colours, the Snapshot page's rule
          // (2026-09-14): black with the brand green where better, black
          // with the lab's red where worse, clear with a black outline
          // where the metric has no better direction. The black pills carry
          // the same outline in their own colour, so both are one size. A
          // tie has no pill here: the figure is simply not bold.
          className={cn(
            "rounded-full border border-foreground px-1.5 py-0.5 text-xs font-semibold",
            tone === "better" && "bg-foreground text-primary",
            tone === "worse" && "bg-foreground text-[#FF5A39]",
            tone === "neutral" && "bg-transparent text-foreground",
          )}
        >
          {signed(diff, digitsOf(metric), locale)}
        </span>
      )}
    </span>
  );
}

/** A setup laid out as the supplied layout's tiles: "Garfo. Fox X2"
 * over a row of cells — spring, the four damping dials high before low,
 * sag — and the same for the shock; then the tyres and the rider. Only
 * the knobs that were filled in. */
type SetupBlock = {
  kind: string;
  name: string;
  tiles: { label: string; value: string; unit: string }[];
};

/** A setup as blocks of labelled values — the fork's, the shock's, the
 * tyres with the rider — for the tiles and for the row's popover alike.
 * Only the knobs that were filled in. */
function setupBlocks(
  setup: ImuSetupValues,
  labels: ImuSetupCompareLabels,
  t: ProDictionary,
  locale: Locale,
): SetupBlock[] {
  const num = (n: number) => nf(n, Number.isInteger(n) ? 0 : 1, locale);
  // The supplied layout's words (2026-09-14): the knobs by their English
  // names, as the dampers' own manuals and the detail cards above say them,
  // the number apart from its unit so the number can be bold. The clicks'
  // unit is English in both languages the same way — the layout's word.
  const clicks = (label: string, n: number) => ({
    label,
    value: num(n),
    unit: n === 1 ? "click" : "clicks",
  });
  const damperTiles = (
    d: ImuDamperSetup | undefined,
    block: "fork" | "shock",
  ) => {
    if (!d) return [];
    const tiles: { label: string; value: string; unit: string }[] = [];
    if (damperSpring(d) === "coil") {
      if (d.springRateLbs != null)
        tiles.push({
          label: "Spring",
          value: num(d.springRateLbs),
          unit: "Lbs",
        });
    } else if (d.pressurePsi != null)
      tiles.push({
        label: "Air spring",
        value: num(d.pressurePsi),
        unit: "PSI",
      });
    if (circuitMode(d, "compression") === "simple") {
      if (d.compression != null)
        tiles.push(clicks("Compression", d.compression));
    } else {
      if (d.compressionHigh != null)
        tiles.push(clicks("High-Speed Compression", d.compressionHigh));
      if (d.compressionLow != null)
        tiles.push(clicks("Low-Speed Compression", d.compressionLow));
    }
    if (circuitMode(d, "rebound") === "simple") {
      if (d.rebound != null) tiles.push(clicks("Rebound", d.rebound));
    } else {
      if (d.reboundHigh != null)
        tiles.push(clicks("High-Speed Rebound", d.reboundHigh));
      if (d.reboundLow != null)
        tiles.push(clicks("Low-Speed Rebound", d.reboundLow));
    }
    // The travel (the shock's own stroke) and the sag in mm, with the
    // share the two make when both are in (2026-09-23).
    if (d.travelMm != null)
      tiles.push({
        label: block === "fork" ? "Travel" : "Stroke",
        value: num(d.travelMm),
        unit: "mm",
      });
    if (d.sagMm != null) {
      tiles.push({ label: "SAG", value: num(d.sagMm), unit: "mm" });
      const share = sagPercent(d);
      if (share != null)
        tiles.push({ label: "SAG %", value: num(share), unit: "%" });
    }
    return tiles;
  };
  const blocks: SetupBlock[] = [
    {
      kind: "Fork",
      name: labels.fork || "",
      tiles: damperTiles(setup.fork, "fork"),
    },
    {
      kind: "Shock",
      name: labels.shock || "",
      tiles: damperTiles(setup.shock, "shock"),
    },
    {
      kind: t.compare.blocks.tires,
      name: t.compare.blocks.pressure,
      tiles: [
        ...(setup.tires?.frontPsi != null
          ? [
              {
                label: t.compare.blocks.front,
                value: nf(setup.tires.frontPsi, 0, locale),
                unit: "PSI",
              },
            ]
          : []),
        ...(setup.tires?.rearPsi != null
          ? [
              {
                label: t.compare.blocks.rear,
                value: nf(setup.tires.rearPsi, 0, locale),
                unit: "PSI",
              },
            ]
          : []),
        ...(setup.rider?.weightKg != null
          ? [{ label: "Rider", value: num(setup.rider.weightKg), unit: "Kg" }]
          : []),
      ],
    },
  ].filter((b) => b.tiles.length > 0);
  return blocks;
}

function SetupTiles({
  setup,
  labels,
}: {
  setup: ImuSetupValues;
  labels: ImuSetupCompareLabels;
}) {
  const t = useProDict();
  const locale = useProLocale();
  const blocks = setupBlocks(setup, labels, t, locale);
  return (
    // The setup form's own hatched plate (imu-event-band), holding a white
    // card per block — fork, shock, tyres — each with its knobs in a box of
    // cells ruled apart (the supplied layout, 2026-09-14). The rules are
    // each cell's top and left edge, the first row's and column's tucked
    // under the box's clipped rim, so a wrapped row on a narrow card is
    // ruled like the first.
    <div className="imu-event-band mt-6 rounded-[18px] border border-border p-3 sm:p-4">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        {blocks.map((block) => (
          <div
            key={block.kind}
            className="rounded-[14px] border border-border bg-card p-4 sm:p-5"
          >
            <p className="text-base">
              {block.kind}.{" "}
              {block.name && (
                <span className="font-semibold">{block.name}</span>
              )}
            </p>
            <div className="mt-4 overflow-hidden rounded-[14px] border border-border">
              <div className="-mt-px -ml-px grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))]">
                {block.tiles.map((tile) => (
                  <div
                    key={tile.label}
                    className="flex min-h-[76px] flex-col items-center justify-center border-t border-l border-border px-2 py-3 text-center"
                  >
                    <p className="text-xs leading-tight text-muted-foreground">
                      {tile.label}
                    </p>
                    <p className="mt-1.5 text-base leading-tight whitespace-nowrap tabular-nums">
                      <span className="font-semibold">{tile.value}</span>
                      {tile.unit === "%" ? "" : " "}
                      {tile.unit}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
