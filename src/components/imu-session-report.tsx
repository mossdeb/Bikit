"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { formatSessionTime } from "@/lib/imu/derive";
import { buildSessionReport, type ReportSection } from "@/lib/imu/report";
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
export function ImuSessionReport({
  storagePath,
  mountOrientation = null,
  header,
  session,
  snapshots,
  referenceSessions,
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
}) {
  const { data, error } = useImuSession(storagePath, mountOrientation);
  const report = useMemo(
    () => (data ? buildSessionReport(data) : null),
    [data],
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
          <SectionCard section={report.bike} />
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

function SectionCard({ section }: { section: ReportSection }) {
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

      {section.caveat && (
        <p className="mt-auto border-t border-border pt-4 text-xs leading-snug text-muted-foreground">
          {section.caveat}
        </p>
      )}
    </section>
  );
}
