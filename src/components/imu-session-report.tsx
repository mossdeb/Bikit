"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { DARK_CARD_HAIRLINE } from "@/lib/card-styles";
import type { BikeType } from "@/lib/constants";
import type { ImuMountOrientation } from "@/lib/imu/format";
import {
  buildSessionReport,
  type ReportMetric,
  type ReportSection,
} from "@/lib/imu/report";
import type { ImuSetupValues } from "@/lib/imu/setup";
import { useImuSession } from "@/lib/imu/use-imu-session";
import { BIKE_TYPE_ICON } from "@/components/bike-type-icon";
import { ImuRiderGlyph } from "@/components/imu-pro-logo";
import { TrailPeaksIcon } from "@/components/imu-report-icons";
import { MetricInfo } from "@/components/imu-setup-compare-view";
import {
  ImuSessionSetup,
  type ImuSetupLabels,
} from "@/components/imu-session-setup";
import { ImuReportSnapshots } from "@/components/imu-report-snapshots";
import type {
  ImuSnapshotCandidate,
  ImuSnapshotRow,
} from "@/components/imu-snapshot-view";

/**
 * The session's report: the recording read as three answers — bike, rider,
 * trail — in the supplied layout (2026-09-14). Each is a card: its mark,
 * its name with an "i" for what the section is, a sentence with the
 * figures that matter in bold, and under a rule the figures as tiles, each
 * with an "i" for what it is. The Bike card also opens the setup form and
 * the comparison of setups. Three columns from `lg`, stacked below; the
 * tiles sit at the foot, so the three grids end on one line.
 *
 * Computed on the client from the same file and the same alignment the
 * analysis page uses (useImuSession), so the two never disagree.
 */
export function ImuSessionReport({
  storagePath,
  mountOrientation = null,
  header,
  session,
  snapshots,
  referenceSessions,
  bikeType = null,
  setup = null,
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
  /** The bike's type, for the Bike card's mark; null draws a generic one. */
  bikeType?: BikeType | null;
  /** What the setup form opens on, null without a bike. */
  setup?: {
    values: ImuSetupValues;
    note: string | null;
    labels: ImuSetupLabels;
  } | null;
}) {
  const { data, error } = useImuSession(
    storagePath,
    mountOrientation,
    session.trim,
  );
  const report = useMemo(
    () => (data ? buildSessionReport(data) : null),
    [data],
  );
  const BikeGlyph =
    (bikeType && BIKE_TYPE_ICON[bikeType]) || BIKE_TYPE_ICON.Other!;

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
          <SectionCard
            section={report.bike}
            mark={<BikeGlyph className="h-[52px] w-auto text-foreground" />}
            info={
              report.bike.caveat ??
              "Como a bicicleta respondeu ao terreno, lido pelo sensor no quadro."
            }
            actions={
              session.bikeId ? (
                <>
                  {setup && (
                    <ImuSessionSetup
                      sessionId={session.id}
                      values={setup.values}
                      note={setup.note}
                      labels={setup.labels}
                      bikeType={bikeType}
                      triggerLabel="Afinação da bicicleta nesta sessão"
                      triggerIcon={
                        <FileText
                          className="size-[18px]"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      }
                      triggerClassName="flex w-full items-center justify-center gap-2.5 rounded-[14px] border border-border bg-card px-5 py-3 font-semibold text-foreground"
                    />
                  )}
                  {/* The door to the whole picture — every run of this bike
                      on this trail, line by line. */}
                  <Link
                    href={`/labs/imu/${session.id}/afinacoes`}
                    className="flex w-full items-center justify-center gap-2.5 rounded-[14px] bg-foreground px-5 py-3 font-semibold text-background transition-opacity hover:opacity-90"
                  >
                    <FileText
                      className="size-[18px]"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    Comparar afinações
                  </Link>
                </>
              ) : null
            }
          />
          <SectionCard
            section={report.rider}
            mark={<ImuRiderGlyph className="h-[48px] w-auto text-foreground" />}
            info={
              report.rider.caveat ??
              "Como a volta foi conduzida: a velocidade, as curvas e as travagens, lidas do GPS fundido com o acelerómetro."
            }
          />
          <SectionCard
            section={report.trail}
            mark={
              <TrailPeaksIcon className="h-[40px] w-auto text-foreground" />
            }
            info={
              report.trail.caveat ??
              "O que o percurso pediu: a distância, o desnível, o terreno, os impactos, as curvas e os saltos."
            }
          />
        </div>
      )}
      {/* The Snapshots this recording passes through, under the three
          cards. Draws nothing when it passes none: a heading over an empty
          list would be a label for nothing. */}
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

/** A figure with its unit, as the headline and the tiles write it: no
 * space before a unit that starts with a sign (°, /, %, ×). */
function withUnit(metric: ReportMetric) {
  if (!metric.unit) return metric.value;
  return `${metric.value}${/^[°/%×]/.test(metric.unit) ? "" : " "}${metric.unit}`;
}

/** The numbers in a headline, with their unit when one follows, set in
 * bold (the supplied layout: "Reteve em média **76 %** nas curvas"). */
const HEADLINE_FIGURE =
  /(\d+(?:[.,]\d+)?(?:\s?%|\s?(?:G|km|m)(?![A-Za-zÀ-ÿ]))?)/g;
function emphasize(text: string): ReactNode[] {
  return text.split(HEADLINE_FIGURE).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

/** A label's frequency band, printed in the "i" and not on the tile. */
const BAND = /\s(\d+–\d+ Hz)$/;

function SectionCard({
  section,
  mark,
  info,
  actions = null,
}: {
  section: ReportSection;
  /** The section's drawing, over its name. */
  mark: ReactNode;
  /** What the section is, for the "i" beside its name. */
  info: string;
  /** Buttons under the sentence (the Bike card's). */
  actions?: ReactNode;
}) {
  // The tiles run in threes; empty ones close the last row, so every grid
  // is a whole rectangle (the supplied layout).
  const fillers = (3 - (section.metrics.length % 3)) % 3;
  return (
    <section
      className={cn("flex flex-col rounded-lg bg-card", DARK_CARD_HAIRLINE)}
    >
      <div className="px-5 pt-6 pb-6 sm:px-[22px]">
        <div className="flex h-14 items-end">{mark}</div>
        <div className="mt-5 flex items-center gap-1.5">
          <h2 className="font-display text-xl font-bold tracking-wide uppercase">
            {section.title}
          </h2>
          <MetricInfo label={section.title} description={info} />
        </div>
        <p className="text-sm text-muted-foreground">{section.subtitle}</p>
        {/* The conclusion first, in words: what the figures below add up
            to, the figures themselves in bold. */}
        <p className="mt-6 text-sm leading-relaxed">
          {emphasize(section.headline)}
        </p>
        {actions && <div className="mt-6 space-y-3">{actions}</div>}
      </div>

      {section.metrics.length > 0 && (
        <div className="mt-auto border-t border-border px-5 py-5 sm:px-[22px]">
          <div className="grid grid-cols-3 gap-3">
            {section.metrics.map((metric) => (
              <MetricTile key={metric.label} metric={metric} />
            ))}
            {Array.from({ length: fillers }, (_, i) => (
              <div
                key={`filler-${i}`}
                aria-hidden
                className="min-h-[104px] rounded-[14px] border border-border"
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** One figure as a tile: its name with an "i" for what it is (the line
 * that used to sit under the figure), and the figure with its unit. */
function MetricTile({ metric }: { metric: ReportMetric }) {
  const band = metric.label.match(BAND)?.[1];
  const label = band ? metric.label.replace(BAND, "") : metric.label;
  return (
    <div className="flex min-h-[104px] flex-col items-center justify-center rounded-[14px] border border-border px-2 py-3 text-center">
      <div className="flex items-center justify-center gap-0.5 text-xs leading-tight text-foreground">
        <span>{label}</span>
        {metric.hint && (
          <MetricInfo
            label={metric.label}
            description={metric.hint}
            band={band}
          />
        )}
      </div>
      <p className="mt-2 text-base leading-tight font-semibold tabular-nums">
        {withUnit(metric)}
      </p>
    </div>
  );
}
