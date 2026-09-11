"use client";

import { Children, useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { CLICKABLE_CARD_HOVER, DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import {
  buildSessionReport,
  compareReports,
  type ReportComparisonRow,
  type ReportSection,
} from "@/lib/imu/report";
import { formatSetupChange, type SetupChange } from "@/lib/imu/setup";
import { useImuSession } from "@/lib/imu/use-imu-session";
import { ImuClockIcon } from "@/components/imu-event-icons";
import { ImuReportSnapshots } from "@/components/imu-report-snapshots";
import type {
  ImuSnapshotCandidate,
  ImuSnapshotRow,
} from "@/components/imu-snapshot-view";

/**
 * The session's report: the recording read as three answers — rider, bike,
 * trail — each a sentence, its figures, and the instants to go back to.
 * Computed on the client from the same file and the same alignment the
 * analysis page uses (useImuSession), so the two never disagree.
 *
 * Three columns from `lg`, stacked below: each section is a card of its
 * own with the lab's rhythm — the résumé's ruled figures, the event cards'
 * headline-then-facts — so it reads as the analysis page's sibling.
 */
/** The run the Bike section sets this one's setup against (the page picks
 * it: same bike and rider, another setup, the same trail) and the knobs
 * that moved from that run to this one. */
export interface ImuReportSetupComparison {
  session: ImuSnapshotCandidate;
  changes: SetupChange[];
}

export function ImuSessionReport({
  storagePath,
  mountOrientation = null,
  header,
  session,
  snapshots,
  referenceSessions,
  setupComparison = null,
  setupComparisonNote = null,
}: {
  storagePath: string;
  mountOrientation?: ImuMountOrientation | null;
  /** The session's identity, rendered by the page. */
  header: ReactNode;
  /** This recording as a Snapshot line names it, the Snapshots whose gates
   * its track comes near, and the sessions their references live in. */
  session: ImuSnapshotCandidate;
  snapshots: ImuSnapshotRow[];
  referenceSessions: Record<string, ImuSnapshotCandidate>;
  setupComparison?: ImuReportSetupComparison | null;
  /** Why there is none, when there is none — printed where it would go. */
  setupComparisonNote?: string | null;
}) {
  const { data, error } = useImuSession(storagePath, mountOrientation);
  const report = useMemo(
    () => (data ? buildSessionReport(data) : null),
    [data],
  );
  // The other run's file, read the same way, for the Bike section's
  // comparison; its report is built once it lands.
  const other = useImuSession(
    setupComparison?.session.storagePath ?? null,
    setupComparison?.session.mountOrientation ?? null,
  );
  const comparisonRows = useMemo(
    () =>
      report && other.data
        ? compareReports(report, buildSessionReport(other.data))
        : null,
    [report, other.data],
  );

  return (
    <div className="space-y-[18px]">
      <div className={cn("rounded-lg bg-card", DARK_CARD_HAIRLINE)}>
        {header}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!error && !report && (
        <p className="text-sm text-muted-foreground">A carregar a sessão…</p>
      )}
      {report && (
        <div className="grid gap-[18px] lg:grid-cols-3">
          <SectionCard section={report.rider} />
          <SectionCard
            section={report.bike}
            // With a comparison the generic caveat has been answered: the
            // block says what it is compared with. Without one, the
            // reason why stands where the comparison would.
            caveat={
              setupComparison
                ? "Mesma bicicleta, mesmo rider, mesma pista: a diferença entre as duas voltas é a afinação e o dia."
                : (setupComparisonNote ?? report.bike.caveat)
            }
          >
            {setupComparison && (
              <SetupComparisonBlock
                comparison={setupComparison}
                rows={comparisonRows}
                error={other.error}
              />
            )}
            {/* The door to the whole picture — every run of this bike on
                this trail, line by line (by request, 2026-09-11). Only
                with a bike: without one there is no "its runs". */}
            {session.bikeId && (
              <Link
                href={`/labs/imu/${session.id}/afinacoes`}
                className={cn(
                  "mt-4 inline-flex items-center gap-2.5 self-start rounded-[14px] border border-border bg-card px-5 py-3 font-semibold text-foreground",
                  CLICKABLE_CARD_HOVER,
                )}
              >
                <SlidersHorizontal
                  className="size-[18px]"
                  strokeWidth={2.1}
                  aria-hidden
                />
                Comparar afinações
              </Link>
            )}
          </SectionCard>
          <SectionCard section={report.trail} />
        </div>
      )}
      {/* The Snapshots this recording passes through, under the three
          cards (by request, 2026-09-10). Draws nothing when it passes none:
          a heading over an empty list would be a label for nothing. */}
      {data && snapshots.length > 0 && (
        <ImuReportSnapshots
          data={data}
          session={session}
          snapshots={snapshots}
          referenceSessions={referenceSessions}
        />
      )}
    </div>
  );
}

/**
 * The Bike section's comparison: the run it is set against, the knobs
 * that moved, and each shared metric with its difference — green where
 * this run did better, the lab's red where worse, quiet within the tie.
 */
function SetupComparisonBlock({
  comparison,
  rows,
  error,
}: {
  comparison: ImuReportSetupComparison;
  rows: ReportComparisonRow[] | null;
  error: string | null;
}) {
  const { session, changes } = comparison;
  return (
    <div className="mt-5 rounded-[12px] border border-border p-3.5">
      <p className="text-xs font-medium text-muted-foreground">
        Face à afinação anterior ·{" "}
        <Link
          href={`/labs/imu/${session.id}`}
          className="text-foreground underline-offset-2 hover:underline"
        >
          {session.name}
        </Link>{" "}
        · {formatDate(session.createdAt)}
      </p>
      {changes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {changes.map((change) => (
            <span
              key={change.label}
              className="rounded-full border border-foreground/40 bg-background px-2 py-0.5 text-xs font-medium text-foreground tabular-nums"
            >
              {formatSetupChange(change)}
            </span>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {!error && !rows && (
        <p className="mt-2 text-xs text-muted-foreground">
          A ler a outra sessão…
        </p>
      )}
      {rows && rows.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          As duas voltas não têm métricas em comum para comparar.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {row.label}
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="text-muted-foreground">{row.previous}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="font-semibold">{row.value}</span>
                {row.unit && (
                  <span className="text-xs text-muted-foreground">
                    {/^[°/%×]/.test(row.unit) ? "" : " "}
                    {row.unit}
                  </span>
                )}
                <span
                  className={cn(
                    "ml-2 text-xs",
                    row.tone === "better" &&
                      "text-emerald-600 dark:text-emerald-400",
                    row.tone === "worse" && "text-[#FF5A39]",
                    row.tone === "tie" && "text-muted-foreground",
                  )}
                >
                  {row.tone === "tie" ? "≈" : signed(row.diff, row.digits)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const signed = (value: number, digits: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString(
    "pt-PT",
    { minimumFractionDigits: digits, maximumFractionDigits: digits },
  )}`;

function SectionCard({
  section,
  caveat = section.caveat,
  children,
}: {
  section: ReportSection;
  /** Stands in for the section's own caveat when the page knows better. */
  caveat?: string | null;
  /** Anything to draw between the highlights and the caveat. */
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-lg bg-card p-5 sm:p-6",
        DARK_CARD_HAIRLINE,
      )}
    >
      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {section.title}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{section.subtitle}</p>
      {/* The conclusion first, in words: what the figures below add up to. */}
      <p className="mt-4 text-base leading-snug font-medium">
        {section.headline}
      </p>

      {section.metrics.length > 0 && (
        // The résumé's ruled box: cells over a `bg-border` ground, 1px apart.
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-border bg-border bg-clip-padding">
          {section.metrics.map((metric) => (
            <div key={metric.label} className="bg-card px-3.5 py-3">
              <p className="text-xs leading-tight text-muted-foreground">
                {metric.label}
              </p>
              <p className="mt-0.5 leading-tight font-semibold tabular-nums">
                {metric.value}
                {metric.unit && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {/^[°/%×]/.test(metric.unit) ? "" : " "}
                    {metric.unit}
                  </span>
                )}
              </p>
              {metric.hint && (
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {metric.hint}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {section.highlights && (
        <div className="mt-5">
          <p className="text-xs font-medium text-muted-foreground">
            {section.highlights.heading}
          </p>
          <ul className="mt-2 divide-y divide-border">
            {section.highlights.items.map((item, i) => (
              <li key={i} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                  <ImuClockIcon className="size-3 shrink-0" />
                  {formatSessionTime(item.timeMs, true)}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {item.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}

      {/* The rule over the caveat separates it from the figures; under a
          block of its own (the Bike card's comparison and door) the rule
          is one line too many (by request, 2026-09-11). */}
      {caveat && (
        <p
          className={cn(
            "mt-auto pt-4 text-xs leading-snug text-muted-foreground",
            Children.toArray(children).length === 0 && "border-t border-border",
          )}
        >
          {caveat}
        </p>
      )}
    </section>
  );
}
