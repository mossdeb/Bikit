"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import { NativeSelect } from "@/components/ui/native-select";
import type { ImuSnapshotCandidate } from "@/components/imu-snapshot-view";
import { loadImuSession } from "@/lib/imu/use-imu-session";
import {
  buildSessionReport,
  compareReports,
  type ReportComparisonRow,
  type ReportMetric,
  type SessionReport,
} from "@/lib/imu/report";
import {
  formatSetupChange,
  setupDiff,
  setupKey,
  setupSummary,
} from "@/lib/imu/setup";

/**
 * The setups of one bike, run by run: the reference run pinned at the
 * top, and under it every other run of the same bike on the same trail,
 * each with its setup, the knobs that differ from the reference's, and
 * the report's comparable figures with their difference — the Snapshot
 * page's shape, over whole runs instead of one stretch (by request,
 * 2026-09-11). The files are read here, in the browser, as they arrive.
 *
 * Green and red only where a metric has a better direction; speed and
 * impacts are neither, and read quiet.
 */

/** The report's metrics with a number, in the order the columns go. */
const COLUMNS = [
  "Velocidade média",
  "Retenção nas curvas",
  "Harshness",
  "Vibração",
  "Assentamento",
  "Impactos",
] as const;

const SHORT_LABEL: Record<(typeof COLUMNS)[number], string> = {
  "Velocidade média": "Vel. média",
  "Retenção nas curvas": "Retenção",
  Harshness: "Harshness",
  Vibração: "Vibração",
  Assentamento: "Assentamento",
  Impactos: "Impactos",
};

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; report: SessionReport };

const signed = (value: number, digits: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString(
    "pt-PT",
    { minimumFractionDigits: digits, maximumFractionDigits: digits },
  )}`;

function metricOf(report: SessionReport, label: string): ReportMetric | null {
  return (
    [...report.rider.metrics, ...report.bike.metrics, ...report.trail.metrics]
      .filter((m) => m.raw != null)
      .find((m) => m.label === label) ?? null
  );
}

export function ImuSetupCompareView({
  reference,
  runs,
  leftOut,
}: {
  /** The session this page was reached from: the line every other is
   * read against. */
  reference: ImuSnapshotCandidate;
  /** The bike's other runs on the same trail, newest first. */
  runs: ImuSnapshotCandidate[];
  /** What the page does not show, and why — for one honest line. */
  leftOut: { otherTrail: number; otherRider: number; noGps: boolean };
}) {
  const all = useMemo(() => [reference, ...runs], [reference, runs]);
  const [loaded, setLoaded] = useState<Map<string, Loaded>>(
    () => new Map(all.map((c) => [c.id, { status: "loading" }])),
  );
  const [setupFilter, setSetupFilter] = useState("");
  const [sort, setSort] = useState<"date" | "setup">("date");

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
  const referenceState = loaded.get(reference.id);
  const referenceReport =
    referenceState?.status === "done" ? referenceState.report : null;

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
  const setupGroups = [...setupLetters.entries()].map(([key, letter]) => ({
    key,
    letter,
    summary: setupSummary(
      all.find((c) => c.setup && setupKey(c.setup) === key)!.setup!,
    ),
  }));
  const unsetCount = all.filter((c) => !c.setup).length;

  const shown = runs
    .filter(
      (r) =>
        !setupFilter ||
        (setupFilter === "none"
          ? !r.setup
          : (letterOf(r) ?? "") === setupFilter),
    )
    .sort((a, b) => {
      const byDate = b.createdAt.localeCompare(a.createdAt);
      if (sort !== "setup") return byDate;
      const la = letterOf(a) ?? "~";
      const lb = letterOf(b) ?? "~";
      return la.localeCompare(lb) || byDate;
    });

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

  return (
    <div className="space-y-[18px]">
      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <SlidersHorizontal
            className="size-7 text-foreground"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="mt-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Afinações{reference.bikeName && ` · ${reference.bikeName}`}
          </p>
          <h1 className="mt-0.5 font-display text-2xl font-semibold">
            As voltas nesta pista, afinação a afinação
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Referência:{" "}
            <Link
              href={`/labs/imu/${reference.id}`}
              className="text-foreground underline-offset-2 hover:underline"
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

      {runs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {setupGroups.length + (unsetCount > 0 ? 1 : 0) > 1 && (
            <NativeSelect
              wrapperClassName="min-w-[180px] flex-1 sm:flex-none"
              className="h-11 bg-card text-sm"
              aria-label="Afinação"
              value={setupFilter}
              onChange={(e) => setSetupFilter(e.target.value)}
            >
              <option value="">Todas as afinações</option>
              {setupGroups.map((g) => (
                <option key={g.letter} value={g.letter}>
                  Afinação {g.letter}
                  {g.summary && ` · ${g.summary}`}
                </option>
              ))}
              {unsetCount > 0 && <option value="none">Sem afinação</option>}
            </NativeSelect>
          )}
          <NativeSelect
            wrapperClassName="min-w-[180px] flex-1 sm:flex-none"
            className="h-11 bg-card text-sm"
            aria-label="Ordem"
            value={sort}
            onChange={(e) => setSort(e.target.value as "date" | "setup")}
          >
            <option value="date">Mais recentes primeiro</option>
            {setupGroups.length > 0 && (
              <option value="setup">Agrupadas por afinação</option>
            )}
          </NativeSelect>
        </div>
      )}

      {pending > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          A ler {all.length - pending + 1} de {all.length}{" "}
          {all.length === 1 ? "sessão" : "sessões"}…
        </p>
      )}
      {failed.map((c) => (
        <p key={c.id} role="alert" className="text-sm text-destructive">
          {c.name}: {(loaded.get(c.id) as { message: string }).message}
        </p>
      ))}

      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        <RunLine
          run={reference}
          report={referenceReport}
          reference={null}
          referenceReport={null}
          setupLetter={letterOf(reference)}
          pinned
        />
        {shown.map((run) => {
          const state = loaded.get(run.id);
          return (
            <RunLine
              key={run.id}
              run={run}
              report={state?.status === "done" ? state.report : null}
              reference={reference}
              referenceReport={referenceReport}
              setupLetter={letterOf(run)}
            />
          );
        })}
        {runs.length === 0 && (
          <p className="border-t border-border px-5 py-5 text-sm text-muted-foreground sm:px-6">
            Só esta volta, por enquanto. As que importares desta bicicleta nesta
            pista entram sozinhas.
          </p>
        )}
        {runs.length > 0 && shown.length === 0 && (
          <p className="border-t border-border px-5 py-5 text-sm text-muted-foreground sm:px-6">
            Nenhuma outra volta com estes filtros.
          </p>
        )}
      </div>
    </div>
  );
}

function RunLine({
  run,
  report,
  reference,
  referenceReport,
  setupLetter,
  pinned = false,
}: {
  run: ImuSnapshotCandidate;
  /** This run's report, once its file has been read. */
  report: SessionReport | null;
  /** What the figures are compared with; null on the reference itself. */
  reference: ImuSnapshotCandidate | null;
  referenceReport: SessionReport | null;
  setupLetter: string | null;
  pinned?: boolean;
}) {
  const setupText = run.setup ? setupSummary(run.setup) : null;
  const setupChanges =
    reference?.setup && run.setup ? setupDiff(reference.setup, run.setup) : [];
  const rows: Map<string, ReportComparisonRow> | null =
    report && referenceReport
      ? new Map(
          compareReports(report, referenceReport).map((r) => [r.label, r]),
        )
      : null;
  return (
    <div
      className={cn(
        "px-5 py-4 sm:px-6 sm:py-5",
        !pinned && "border-t border-border",
        pinned && "bg-muted/40",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          href={`/labs/imu/${run.id}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {run.name}
        </Link>
        {pinned && (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
            Referência
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {formatDate(run.createdAt)}
        {run.riderName && ` · ${run.riderName}`}
        {run.groupLabel && ` · ${run.groupLabel}`}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {setupLetter && (
          <span
            className="rounded-[6px] bg-foreground px-1.5 py-0.5 font-semibold text-background"
            title="A mesma letra é a mesma afinação"
          >
            Afinação {setupLetter}
          </span>
        )}
        <span className="text-muted-foreground">
          {setupText ?? "Sem afinação registada"}
          {run.setupNote && ` · “${run.setupNote}”`}
        </span>
        {setupChanges.map((change) => (
          <span
            key={change.label}
            className="rounded-full border border-foreground/40 bg-background px-2 py-0.5 font-medium text-foreground tabular-nums"
          >
            {formatSetupChange(change)}
          </span>
        ))}
        {reference?.setup && run.setup && setupChanges.length === 0 && (
          <span className="text-muted-foreground">· igual à referência</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-4 gap-y-3">
        {COLUMNS.map((label) => {
          const metric = report ? metricOf(report, label) : null;
          const row = rows?.get(label) ?? null;
          return (
            <div key={label} className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">
                {SHORT_LABEL[label]}
              </p>
              <p className="leading-tight font-semibold tabular-nums">
                {!report ? (
                  <span className="text-muted-foreground">…</span>
                ) : metric == null ? (
                  "—"
                ) : (
                  <>
                    {metric.value.replace(/\s*%$/, "")}
                    {(metric.unit || /%$/.test(metric.value)) && (
                      <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                        {metric.unit ?? "%"}
                      </span>
                    )}
                  </>
                )}
              </p>
              {row && (
                <p
                  className={cn(
                    "text-xs tabular-nums",
                    row.tone === "better" &&
                      "text-emerald-600 dark:text-emerald-400",
                    row.tone === "worse" && "text-[#FF5A39]",
                    (row.tone === "neutral" || row.tone === "tie") &&
                      "text-muted-foreground",
                  )}
                >
                  {row.tone === "tie" ? "≈" : signed(row.diff, row.digits)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
