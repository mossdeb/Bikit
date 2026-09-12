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

/** RMS, for the "i"s that lean on it (by request, 2026-09-12). */
const RMS_NOTE =
  "*RMS: a raiz da média dos quadrados — o nível médio de uma força que oscila, contando igual o que sobe e o que desce. Um valor de pico diz quão alto foi o pior instante; o RMS diz quanto houve ao todo.";

const COLUMNS: {
  label: string;
  short: string;
  Icon: ComponentType<{ className?: string }>;
  /** What the figure is and which way is better, for the "i" beside the
   * heading (by request, 2026-09-12). */
  description: string;
  /** How the figure is computed, under "Como é calculado:". */
  method?: string;
  /** A last line for a term the description leans on. */
  footnote?: string;
  /** The band, printed light in brackets after the name (by request,
   * 2026-09-12: "[2–12 Hz] fonte light"). */
  band?: string;
}[] = [
  {
    label: "Velocidade média",
    short: "Velocidade média",
    Icon: SpeedGaugeIcon,
    description:
      "A velocidade média em andamento, acima de 3 km/h, lida da série que funde o GPS com o acelerómetro. Não tem lado melhor: é do rider e do dia, não da afinação.",
  },
  {
    label: "Retenção nas curvas",
    short: "Retenção",
    Icon: RetentionIcon,
    description:
      "Quanto da velocidade de entrada é mantida à saída das curvas, corrigindo o efeito da gravidade da descida. O valor representa a média de todas as curvas da volta. Mais é melhor: indica maior conservação de velocidade ao longo das curvas.",
  },
  {
    label: "Harshness",
    short: "Harshness",
    Icon: HarshnessIcon,
    description:
      "Quanto dos impactos mais fortes do terreno chega ao quadro, em relação à vibração normal da bicicleta nas zonas acidentadas. Menos é melhor: significa que a suspensão está a absorver melhor os impactos em vez de os transmitir ao quadro.",
    method:
      "Compara o percentil 99 dos impactos com o nível médio (RMS) da força dinâmica nas zonas acidentadas. Um valor mais alto indica impactos mais destacados em relação à vibração normal.",
    footnote: RMS_NOTE,
  },
  {
    label: "Chassis Movement 2–12 Hz",
    short: "Chassis Movement",
    band: "2–12 Hz",
    Icon: ChassisBandIcon,
    description:
      "Quanto a bicicleta se movimenta e oscila nas zonas acidentadas, nas frequências mais associadas ao movimento do chassis e da suspensão. Menos é melhor: significa uma bicicleta mais estável e controlada sobre o terreno.",
    method:
      "Mede o RMS da força dinâmica entre 2 e 12 Hz nas zonas acidentadas. Esta banda representa movimentos relativamente lentos do chassis, onde a compressão da suspensão tem maior influência.",
    footnote: RMS_NOTE,
  },
  {
    label: "Chatter 12–60 Hz",
    short: "Chatter",
    band: "12–60 Hz",
    Icon: ChatterBandIcon,
    description:
      "Quanto das vibrações rápidas e dos pequenos impactos do terreno chega ao quadro nas zonas acidentadas. Menos é melhor: significa que pneus e suspensão estão a filtrar melhor as irregularidades rápidas do terreno.",
    method:
      "Mede o RMS da força dinâmica entre 12 e 60 Hz nas zonas acidentadas. Esta banda representa vibrações rápidas provocadas por pequenas pedras, raízes, irregularidades sucessivas e outras fontes de chatter.",
    footnote: RMS_NOTE,
  },
  {
    label: "Oscilação residual",
    short: "Oscilação residual",
    Icon: SettleIcon,
    description:
      "Quanto movimento continua no quadro depois de um impacto. Menos é melhor: significa que a suspensão estabiliza a bicicleta mais rapidamente após cada pancada.",
    method:
      "Mede a energia que permanece na banda de 2–12 Hz durante os 300 ms após cada impacto, relativamente à intensidade do próprio impacto. O resultado representa a mediana de todos os impactos analisados na volta.",
  },
  {
    label: "Impactos",
    short: "Impactos",
    Icon: ImpactIcon,
    description:
      "Quantos impactos fortes a bicicleta recebe por quilómetro. Este valor descreve a intensidade da passagem, mas mais ou menos impactos não significa necessariamente melhor ou pior.",
    method:
      "Conta os impactos que ultrapassam um limiar definido para cada volta — 1,5× o percentil 99 da própria gravação — e normaliza o resultado pela distância percorrida. Como o limiar se adapta a cada volta, esta métrica é mais útil para caracterizar a sessão do que para comparar diretamente diferentes setups.",
  },
];

/** The knobs in full, for the detail cards' titles (the supplied layout
 * says "High-Speed Compression", not "HSC"). */
const KNOB_FULL: Record<string, string> = {
  LSC: "Low-Speed Compression",
  HSC: "High-Speed Compression",
  LSR: "Low-Speed Rebound",
  HSR: "High-Speed Rebound",
  C: "Compressão",
  R: "Rebound",
  pressão: "Pressão",
  mola: "Mola",
  sag: "SAG",
  "pneu dt.": "Pneu da frente",
  "pneu tr.": "Pneu de trás",
  rider: "Peso",
};

const SETUP_DESCRIPTION =
  "A afinação da bicicleta nessa volta. A mesma letra é o mesmo conjunto de valores; as cápsulas dizem o que difere da referência e para que lado. Clica no setup para ver todos os valores.";

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
          // The card's title, the supplied layout's way: the component
          // light, the knob in full and bold, the setup — "Fox X2 ·
          // High-Speed Compression · Setup B".
          const component = (label: string) =>
            /^garfo /.test(label)
              ? labels.fork || "Garfo"
              : /^amort\. /.test(label)
                ? labels.shock || "Amortecedor"
                : /^pneu /.test(label)
                  ? "Pneus"
                  : "Rider";
          const knobOf = (label: string) =>
            KNOB_FULL[label.replace(/^(garfo|amort\.) /, "")] ??
            label.replace(/^(garfo|amort\.) /, "");
          const components = [
            ...new Set(changes.map((c) => component(c.label))),
          ];
          const knobs = changes.map((c) => knobOf(c.label));
          const boxes = changes.map((c) => {
            const unit = c.kind === "clicks" ? "cliques" : c.unit.trim();
            const num = (n: number | null) => (n == null ? "—" : nf(n, 0));
            const delta =
              c.from != null && c.to != null
                ? `${signed(c.to - c.from, 0)}${unit ? ` ${unit}` : ""}`
                : null;
            const direction = formatSetupChange(c).split(" · ")[1] ?? null;
            return {
              knob: knobOf(c.label),
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
                `${nf(x, digits)}${/^[°/%×]/.test(unit) ? "" : " "}${unit}`;
              const column = COLUMNS.find((c) => c.label === metricLabel)!;
              return {
                name: column.short,
                ref: fmt(ref.raw),
                value: fmt(to),
                runs: values.length,
                range: range
                  ? `${nf(range.min, digits)}–${fmt(range.max)}`
                  : null,
                delta: `${signed(diff, digits)}${unit === "%" ? " pp" : unit ? `${/^[°/×]/.test(unit) ? "" : " "}${unit}` : ""}`,
                tone,
                verdict:
                  tone === "tie"
                    ? range
                      ? "dentro da variação entre voltas"
                      : `dentro do ruído entre voltas iguais (${nf(noise, digits)}${unit === "%" ? " pp" : unit ? `${/^[°/×]/.test(unit) ? "" : " "}${unit}` : ""})`
                    : tone === "better"
                      ? "acima da variação entre voltas · melhor"
                      : tone === "worse"
                        ? "acima da variação entre voltas · pior"
                        : "acima da variação entre voltas",
              };
            })
            .filter((x): x is NonNullable<typeof x> => x != null);
          return {
            letter: g.letter,
            component: components.join(" e "),
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
            {reference.bikeName ?? "Afinações"}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold">
            Comparar afinações
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
            Compara os setups para perceber qual oferece o melhor equilíbrio
            entre velocidade, controlo e absorção do terreno.
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
                    <span className="flex items-center gap-1">
                      Afinação
                      <MetricInfo
                        label="Afinação"
                        description={SETUP_DESCRIPTION}
                      />
                    </span>
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.label}
                      className="px-4 pb-3 align-bottom font-semibold whitespace-nowrap"
                    >
                      <c.Icon className="mb-2" />
                      <span className="flex items-center gap-1">
                        {c.short}
                        <MetricInfo
                          label={c.label}
                          description={c.description}
                          method={c.method}
                          footnote={c.footnote}
                          band={c.band}
                        />
                      </span>
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
                    labels={labels}
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
                  <p className="text-lg">
                    {d.component} ·{" "}
                    <span className="font-semibold">{d.knobs}</span> · Setup{" "}
                    {d.letter}
                    {d.runs > 1 && (
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        {d.runs} voltas
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
                            Alteração de
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
                                Referência{" "}
                                <span className="font-semibold">
                                  {effect.ref}
                                </span>
                              </span>
                              <span className="rounded-[8px] bg-card px-2.5 py-1 text-sm tabular-nums">
                                setup {d.letter}{" "}
                                <span className="font-semibold">
                                  {effect.value}
                                </span>
                                {effect.runs > 1 && (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    mediana de {effect.runs}
                                  </span>
                                )}
                              </span>
                              {effect.range && (
                                <span className="rounded-[8px] bg-card px-2.5 py-1 text-sm tabular-nums">
                                  voltas{" "}
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
                        Aparece quando as sessões estiverem lidas.
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

/** The "i" beside a heading: what the figure is and which way is better
 * — the analysis page's own pattern, a popover and not a tooltip because
 * a finger cannot hover. */
function MetricInfo({
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
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`O que é ${label}`}
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
              Como é calculado:
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
          {run.setup && letter ? (
            // The whole setup, on a click (by request, 2026-09-12): a
            // popover with every knob listed, the same blocks the tiles
            // below draw. A popover and not a tooltip: this is read on a
            // phone, where hover is not a thing a finger does.
            <Popover>
              <PopoverTrigger
                aria-label={`A afinação ${letter} completa`}
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
                <p className="text-sm font-semibold">Setup {letter}</p>
                {setupBlocks(run.setup, labels).map((block) => (
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
                          <span className="text-muted-foreground">
                            {tile.label}
                          </span>
                          <span className="font-medium whitespace-nowrap tabular-nums">
                            {tile.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {run.setupNote && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    “{run.setupNote}”
                  </p>
                )}
              </PopoverContent>
            </Popover>
          ) : (
            <>
              <FileText
                className="size-[18px] shrink-0 text-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="whitespace-nowrap">Sem afinação</span>
            </>
          )}
          {changes.map((change) => (
            <span
              key={change.label}
              className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-background tabular-nums"
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
          // Black pills, the ink carrying the verdict (by request,
          // 2026-09-12): the brand green where better, the lab's red where
          // worse, the card's own colour where neither is better. In the
          // dark theme the pill is light and the inks stay the same.
          className={cn(
            "rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold",
            tone === "better" && "text-primary",
            tone === "worse" && "text-[#FF5A39]",
            tone === "neutral" && "text-background",
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
type SetupBlock = {
  kind: string;
  name: string;
  tiles: { label: string; value: string }[];
};

/** A setup as blocks of labelled values — the fork's, the shock's, the
 * tyres with the rider — for the tiles and for the row's popover alike.
 * Only the knobs that were filled in. */
function setupBlocks(
  setup: ImuSetupValues,
  labels: ImuSetupCompareLabels,
): SetupBlock[] {
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
  const blocks: SetupBlock[] = [
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
  return blocks;
}

function SetupTiles({
  setup,
  labels,
}: {
  setup: ImuSetupValues;
  labels: ImuSetupCompareLabels;
}) {
  const blocks = setupBlocks(setup, labels);
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
