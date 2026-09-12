"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { Bike, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { ImuDocGlyph } from "@/components/imu-pro-logo";
import {
  HarshnessIcon,
  ImpactIcon,
  RetentionIcon,
  SettleIcon,
  SetupSlidersIcon,
  SpeedGaugeIcon,
  VibrationIcon,
} from "@/components/imu-setup-icons";
import type { ImuSnapshotCandidate } from "@/components/imu-snapshot-view";
import { loadImuSession } from "@/lib/imu/use-imu-session";
import {
  buildSessionReport,
  type ReportMetric,
  type SessionReport,
} from "@/lib/imu/report";
import {
  circuitMode,
  damperSpring,
  formatSetupChange,
  setupDiff,
  setupKey,
  setupSpread,
  type ImuDamperSetup,
  type ImuSetupValues,
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
 * the reference's with the difference in a pill — green where better,
 * red where worse, grey where neither direction is better. Above it,
 * what the set of setups held constant and what it varied, computed from
 * the setups, so the reader knows which knob the table is about.
 *
 * At the foot, the setup that did best by a declared figure, its knobs
 * as tiles — and, with one setup only, the honest note that it is the
 * only one known and was compared with nothing; with several, whether
 * the margin beats the spread between two runs on the same setup.
 *
 * The files are read here, in the browser, as they arrive.
 */

const COLUMNS: {
  label: string;
  short: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  {
    label: "Velocidade média",
    short: "Velocidade média",
    Icon: SpeedGaugeIcon,
  },
  { label: "Retenção nas curvas", short: "Retenção", Icon: RetentionIcon },
  { label: "Harshness", short: "Harshness", Icon: HarshnessIcon },
  { label: "Vibração", short: "Vibração", Icon: VibrationIcon },
  { label: "Assentamento", short: "Assentamento", Icon: SettleIcon },
  { label: "Impactos", short: "Impactos", Icon: ImpactIcon },
];

/** The figure the best setup is picked by: what the corners kept, the
 * one figure on the table that is the bike's grip more than the trail's
 * hits. Ties go to the lower harshness. */
const BEST_BY = "Retenção nas curvas";
const BEST_TIE_BREAK = "Harshness";

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; report: SessionReport };

type Tone = "better" | "worse" | "tie" | "neutral";

const nf = (value: number, digits: number) =>
  value.toLocaleString("pt-PT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const signed = (value: number, digits: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${nf(Math.abs(value), digits)}`;
const digitsOf = (m: ReportMetric) =>
  (m.value.split(",")[1] ?? "").replace(/\D/g, "").length;
const unitOf = (m: ReportMetric) => m.unit ?? (/%$/.test(m.value) ? "%" : "");
/** "[11.9.26]" — the supplied layout's date. */
const bracketDate = (iso: string) => {
  const d = new Date(iso);
  return `[${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(-2)}]`;
};

function metricOf(report: SessionReport, label: string): ReportMetric | null {
  return (
    [...report.rider.metrics, ...report.bike.metrics, ...report.trail.metrics]
      .filter((m) => m.raw != null)
      .find((m) => m.label === label) ?? null
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
  const all = useMemo(() => [reference, ...runs], [reference, runs]);
  const [loaded, setLoaded] = useState<Map<string, Loaded>>(
    () => new Map(all.map((c) => [c.id, { status: "loading" }])),
  );

  useEffect(() => {
    let cancelled = false;
    for (const c of all) {
      (async () => {
        const result = await loadImuSession(c.storagePath, c.mountOrientation);
        if (cancelled) return;
        const next: Loaded =
          result.data === null
            ? { status: "error", message: result.error }
            : { status: "done", report: buildSessionReport(result.data) };
        setLoaded((prev) => new Map(prev).set(c.id, next));
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [all]);

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
    const values = new Map<string, number[]>();
    for (const c of members) {
      const r = reportOf(c);
      if (!r) continue;
      for (const { label } of COLUMNS) {
        const raw = metricOf(r, label)?.raw;
        if (raw != null) values.set(label, [...(values.get(label) ?? []), raw]);
      }
    }
    const medians = new Map<string, number>();
    for (const [label, list] of values) medians.set(label, median(list)!);
    return { key, letter, setup: members[0].setup!, members, values, medians };
  });
  const unset = all.filter((c) => !c.setup);

  const spread = setupSpread(
    groups.map((g) => g.setup),
    labels,
  );
  const constants = [
    ...spread.constant,
    ...(spread.constantClicks > 0
      ? [
          spread.constantClicks === 1
            ? "o outro clique"
            : `os outros ${spread.constantClicks} cliques`,
        ]
      : []),
  ];
  const list = (items: string[]) =>
    items.length <= 1
      ? items.join("")
      : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;

  // The rows: the reference first, then the others grouped by setup in
  // the letters' order, the runs without a setup last.
  const rows = [
    reference,
    ...groups.flatMap((g) =>
      g.members
        .filter((c) => c.id !== reference.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),
    ...unset
      .filter((c) => c.id !== reference.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  ];

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
  if (leftOut.noGps)
    leftOutBits.push(
      "esta gravação não tem GPS, por isso não há como saber quais das outras voltas foram nesta pista",
    );
  else if (leftOut.otherTrail > 0)
    leftOutBits.push(
      `${leftOut.otherTrail} ${leftOut.otherTrail === 1 ? "volta desta bicicleta ficou" : "voltas desta bicicleta ficaram"} de fora por ${leftOut.otherTrail === 1 ? "ser" : "serem"} noutra pista ou sem GPS`,
    );
  if (leftOut.otherRider > 0)
    leftOutBits.push(
      `${leftOut.otherRider} ${leftOut.otherRider === 1 ? "foi" : "foram"} com outro rider`,
    );

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
          const changes = setupDiff(referenceGroup.setup, g.setup);
          const name = (label: string) =>
            label
              .replace(/^garfo /, `${labels.fork || "garfo"} `)
              .replace(/^amort\. /, `${labels.shock || "amortecedor"} `);
          const effects = [BEST_BY, BEST_TIE_BREAK]
            .map((metricLabel) => {
              const from = referenceGroup.medians.get(metricLabel);
              const to = g.medians.get(metricLabel);
              const m = referenceReport
                ? metricOf(referenceReport, metricLabel)
                : null;
              if (from == null || to == null || !m) return null;
              const digits = digitsOf(m);
              const unit = unitOf(m);
              const diff = to - from;
              const noise = metricLabel === BEST_BY ? bestNoise : (m.tie ?? 0);
              const column = COLUMNS.find((c) => c.label === metricLabel)!;
              return `${column.short} ${nf(from, digits)} → ${nf(to, digits)}${/^[°/%×]/.test(unit) ? "" : " "}${unit}, ${Math.abs(diff) <= noise ? `uma diferença de ${signed(diff, digits)} que fica dentro do ruído` : `${signed(diff, digits)}${metricLabel === BEST_BY ? " pontos" : ""}`}.`;
            })
            .filter((x): x is string => x != null);
          return {
            letter: g.letter,
            title: changes.map((c) => name(c.label)).join(" e "),
            changes,
            runs: g.members.length,
            effects,
          };
        })
        .filter((d) => d.changes.length > 0)
    : [];
  const changeLine = (c: ReturnType<typeof setupDiff>[number]) => {
    const unit = c.kind === "clicks" ? "cliques" : c.unit.trim() || "";
    const num = (n: number | null) => (n == null ? "—" : nf(n, 0));
    return { text: `${num(c.from)} → ${num(c.to)}`, unit };
  };

  return (
    <div className="space-y-[18px]">
      {/* The heading, in a card of its own (the supplied layout). */}
      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <ImuDocGlyph className="h-auto w-[28px] text-foreground" />
          <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
            <Bike className="size-4" strokeWidth={2} aria-hidden />
            Afinações{reference.bikeName && ` · ${reference.bikeName}`}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold">
            As voltas nesta pista, afinação a afinação
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Referência:{" "}
            <Link
              href={`/labs/imu/${reference.id}`}
              className="text-foreground underline underline-offset-2"
            >
              {reference.name}
            </Link>{" "}
            ·{" "}
            {runs.length === 1
              ? "1 outra volta"
              : `${runs.length} outras voltas`}{" "}
            da mesma bicicleta{reference.riderName && " e do mesmo rider"} na
            mesma pista
            {leftOutBits.length > 0 && ` · ${leftOutBits.join(" · ")}`}
          </p>
        </div>
      </div>

      {pending > 0 && (
        <p className="px-1 text-sm text-muted-foreground" aria-live="polite">
          A ler {all.length - pending + 1} de {all.length}{" "}
          {all.length === 1 ? "sessão" : "sessões"}…
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
          <p className="text-lg font-semibold">Comparação dos setups</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {groups.length === 0
              ? "Nenhuma destas voltas tem afinação registada."
              : groups.length === 1
                ? "Todas as voltas foram na mesma afinação."
                : spread.varying.length === 0
                  ? "As afinações diferem só no que não foi preenchido."
                  : `${constants.length > 0 ? `Mantiveste ${constants.length === 1 ? "constante" : "constantes"} ${list(constants)}. ` : ""}Portanto, a variável relevante é ${list(spread.varying)}:`}
            {unset.length > 0 &&
              groups.length > 0 &&
              ` ${unset.length === 1 ? "Uma volta não tem" : `${unset.length} voltas não têm`} afinação registada.`}
          </p>

          {/* Wider than a phone, the table scrolls inside the card. */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pr-4 pb-3 align-bottom font-semibold">
                    Sessão
                  </th>
                  <th className="px-4 pb-3 align-bottom font-semibold">
                    <SetupSlidersIcon className="mb-2" />
                    Afinação
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.label}
                      className="px-4 pb-3 align-bottom font-semibold whitespace-nowrap"
                    >
                      <c.Icon className="mb-2" />
                      {c.short}
                    </th>
                  ))}
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
                  />
                ))}
              </tbody>
            </table>
          </div>
          {runs.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Só esta volta, por enquanto. As que importares desta bicicleta
              nesta pista entram sozinhas.
            </p>
          )}
        </section>

        {details.length > 0 && (
          <section className="px-5 py-6 sm:px-6 sm:py-8">
            <p className="text-lg font-semibold">Em detalhe</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada afinação face à referência, botão a botão, e o que as duas
              figuras da escolha fizeram com ela.
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {details.map((d) => (
                <div
                  key={d.letter}
                  className="rounded-[14px] border border-border p-5"
                >
                  <p className="font-semibold">
                    {d.title}
                    <span className="ml-2 text-xs font-medium text-muted-foreground">
                      Setup {d.letter}
                      {d.runs > 1 && ` · ${d.runs} voltas`}
                    </span>
                  </p>
                  <p className="mt-4 border-b border-border pb-1 text-xs text-muted-foreground">
                    Alteração de
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    {d.changes.map((c) => {
                      const line = changeLine(c);
                      return (
                        <p key={c.label} className="tabular-nums">
                          {d.changes.length > 1 && (
                            <span className="mr-1.5 text-xs text-muted-foreground">
                              {c.label.replace(/^(garfo|amort\.) /, "")}
                            </span>
                          )}
                          {line.text}
                          {line.unit && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {line.unit}
                            </span>
                          )}
                        </p>
                      );
                    })}
                  </div>
                  {d.effects.length > 0 ? (
                    <p className="mt-3 text-sm">{d.effects.join(" ")}</p>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Aparece quando as sessões estiverem lidas.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* The best so far — or the only one known, said as such. */}
        {shown && (
          <section className="px-5 py-6 sm:px-6 sm:py-8">
            <p className="text-lg font-semibold">O melhor setup até agora</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {groups.length === 1
                ? "É a única afinação registada nesta pista. Ainda não foi testada nem comparada com outra, por isso não há como dizer se é a melhor."
                : !best
                  ? "Aparece quando as sessões estiverem lidas."
                  : bestMargin != null && Math.abs(bestMargin) <= bestNoise
                    ? `Setup ${best.letter}, pela retenção mediana nas curvas — mas a diferença para o ${runnerUp!.letter} (${signed(bestMargin, 1)} pontos) não passa o ruído entre voltas iguais (${nf(bestNoise, 1)} pontos). Ainda não separa os dois.`
                    : `Setup ${best.letter}, pela retenção mediana nas curvas: ${nf(best.medians.get(BEST_BY)!, 0)} % em ${best.members.length === 1 ? "uma volta" : `${best.members.length} voltas`}${runnerUp ? `, ${signed(bestMargin!, 0)} pontos sobre o ${runnerUp.letter}` : ""}.${best.members.length === 1 ? " Com uma volta só, a diferença pode ser o dia e não a afinação." : ""}`}
            </p>
            <SetupTiles setup={shown.setup} labels={labels} />
          </section>
        )}
      </div>
    </div>
  );
}

function RunRow({
  run,
  report,
  letter,
  reference,
  referenceReport,
}: {
  run: ImuSnapshotCandidate;
  report: SessionReport | null;
  letter: string | null;
  reference: ImuSnapshotCandidate;
  referenceReport: SessionReport | null;
}) {
  const isReference = run.id === reference.id;
  const changes =
    !isReference && reference.setup && run.setup
      ? setupDiff(reference.setup, run.setup)
      : [];
  return (
    <tr className="border-t border-border">
      <td className="py-4 pr-4 align-middle whitespace-nowrap">
        <Link
          href={`/labs/imu/${run.id}`}
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
      <td className="px-4 py-4 align-middle">
        <div className="flex flex-wrap items-center gap-2">
          <FileText
            className="size-[18px] shrink-0 text-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="whitespace-nowrap">
            {letter ? `Setup ${letter}` : "Sem afinação"}
          </span>
          {changes.map((change) => (
            <span
              key={change.label}
              className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-background tabular-nums"
            >
              {formatSetupChange(change)}
            </span>
          ))}
        </div>
      </td>
      {COLUMNS.map(({ label }) => {
        const m = report ? metricOf(report, label) : null;
        const ref =
          !isReference && referenceReport
            ? metricOf(referenceReport, label)
            : null;
        return (
          <td
            key={label}
            className="px-4 py-4 align-middle whitespace-nowrap tabular-nums"
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

/** One figure and, beside it, its difference to the reference's in a
 * pill — bold where it differs beyond the tie. */
function Figure({
  metric,
  reference,
}: {
  metric: ReportMetric;
  reference: ReportMetric | null;
}) {
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
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
            tone === "better" &&
              "bg-emerald-600 text-white dark:bg-emerald-500",
            tone === "worse" && "bg-[#FF5A39] text-white",
            tone === "neutral" && "bg-foreground text-background",
          )}
        >
          {signed(diff, digitsOf(metric))}
        </span>
      )}
    </span>
  );
}

/** A setup laid out as the supplied layout's tiles: "Garfo. Fox X2"
 * over a row of cells — spring, the four damping dials high before low,
 * sag — and the same for the shock; then the tyres and the rider. Only
 * the knobs that were filled in. */
function SetupTiles({
  setup,
  labels,
}: {
  setup: ImuSetupValues;
  labels: ImuSetupCompareLabels;
}) {
  const pt = (n: number) => nf(n, Number.isInteger(n) ? 0 : 1);
  const clicks = (n: number) => `${pt(n)} ${n === 1 ? "clique" : "cliques"}`;
  const damperTiles = (d: ImuDamperSetup | undefined) => {
    if (!d) return [];
    const tiles: { label: string; value: string }[] = [];
    if (damperSpring(d) === "coil") {
      if (d.springRateLbs != null)
        tiles.push({ label: "Mola", value: `${pt(d.springRateLbs)} lbs` });
    } else if (d.pressurePsi != null)
      tiles.push({ label: "Pressão de ar", value: `${pt(d.pressurePsi)} psi` });
    if (circuitMode(d, "compression") === "simple") {
      if (d.compression != null)
        tiles.push({ label: "Compressão", value: clicks(d.compression) });
    } else {
      if (d.compressionHigh != null)
        tiles.push({
          label: "Compressão alta velocidade",
          value: clicks(d.compressionHigh),
        });
      if (d.compressionLow != null)
        tiles.push({
          label: "Compressão baixa velocidade",
          value: clicks(d.compressionLow),
        });
    }
    if (circuitMode(d, "rebound") === "simple") {
      if (d.rebound != null)
        tiles.push({ label: "Rebound", value: clicks(d.rebound) });
    } else {
      if (d.reboundHigh != null)
        tiles.push({
          label: "Rebound alta velocidade",
          value: clicks(d.reboundHigh),
        });
      if (d.reboundLow != null)
        tiles.push({
          label: "Rebound baixa velocidade",
          value: clicks(d.reboundLow),
        });
    }
    if (d.sagPct != null)
      tiles.push({ label: "SAG", value: `${pt(d.sagPct)} %` });
    return tiles;
  };
  const blocks: {
    kind: string;
    name: string;
    tiles: { label: string; value: string }[];
  }[] = [
    { kind: "Garfo", name: labels.fork || "", tiles: damperTiles(setup.fork) },
    {
      kind: "Amortecedor",
      name: labels.shock || "",
      tiles: damperTiles(setup.shock),
    },
    {
      kind: "Pneus",
      name: "",
      tiles: [
        ...(setup.tires?.frontPsi != null
          ? [{ label: "Frente", value: `${nf(setup.tires.frontPsi, 0)} psi` }]
          : []),
        ...(setup.tires?.rearPsi != null
          ? [{ label: "Trás", value: `${nf(setup.tires.rearPsi, 0)} psi` }]
          : []),
        ...(setup.rider?.weightKg != null
          ? [{ label: "Rider", value: `${nf(setup.rider.weightKg, 0)} kg` }]
          : []),
      ],
    },
  ].filter((b) => b.tiles.length > 0);
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {blocks.map((block) => (
        <div key={block.kind}>
          <p className="text-base">
            {block.kind}.{" "}
            {block.name && <span className="font-semibold">{block.name}</span>}
          </p>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-px overflow-hidden rounded-[14px] border border-border bg-border bg-clip-padding">
            {block.tiles.map((tile) => (
              <div
                key={tile.label}
                className="flex min-h-[96px] flex-col justify-center bg-card px-3 py-3 text-center"
              >
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {tile.label}
                </p>
                <p className="mt-1.5 leading-tight font-semibold tabular-nums">
                  {tile.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
