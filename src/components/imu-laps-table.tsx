"use client";

import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { formatDurationMillis } from "@/lib/imu/derive";
import { formatDate } from "@/lib/format";
import { sectorBoundaries } from "@/lib/imu/perfect-run";
import {
  prepareSnapshotSession,
  type SnapshotSession,
} from "@/lib/imu/snapshot";
import {
  findTimedRuns,
  formatRunGap,
  type TimedRun,
} from "@/lib/imu/timed-track";
import type {
  ImuTimedTrack,
  ImuTrackCandidate,
} from "@/lib/imu/track-candidates";
import { loadWholeImuSession } from "@/lib/imu/use-imu-session";
import { cn } from "@/lib/utils";

/**
 * A circuit's laps and their sectors, as numbers: each lap's sector times,
 * how many sectors there are, and each sector's best across the laps. A lap
 * that misses a line has no sector times (null).
 */
export function lapSectorStats(sectors: (number[] | null)[] | null | undefined) {
  const sectorMs = (sectors ?? []).map((bounds) =>
    bounds ? bounds.slice(1).map((to, i) => to - bounds[i]) : null,
  );
  const count = sectorMs.find((s) => s != null)?.length ?? 0;
  const sectorBest = Array.from({ length: count }, (_, i) =>
    Math.min(
      ...sectorMs.flatMap((s) => (s && s.length === count ? [s[i]] : [])),
    ),
  );
  return { sectorMs, count, sectorBest };
}

/** A lap's time as the laps card writes it: mm:ss.cc. */
export function lapTime(ms: number): string {
  return formatDurationMillis(ms).slice(0, -1);
}

/**
 * The laps and sectors in full (by request, 2026-11-12), the track popup's
 * "Laps & sectors" tab: one row per lap, one column per sector. The best lap
 * carries the lime bar, as on the card; each sector's best is the lime cell,
 * and the others read their gap to it under the time. The last row is each
 * sector's best. Scrolls sideways when the sectors do not fit.
 */
export function ImuLapsTable({
  laps,
  sectors,
  rows,
  heading,
}: {
  laps: TimedRun[];
  /** As the laps card's: per lap, the sectors' edges, or null. */
  sectors: (number[] | null)[] | null;
  /** In place of "Lap #n", each row's own name and a line under it — a
   * start-to-finish track's runs, from every session (2026-11-12). `mine`
   * tints this session's rows. */
  rows?: { title: string; sub?: string | null; mine?: boolean }[];
  /** The first column's heading, "Laps" by default. */
  heading?: string;
}) {
  const t = useProDict().tracks;
  const bestMs = Math.min(...laps.map((lap) => lap.durationMs));
  const { sectorMs, count, sectorBest } = lapSectorStats(sectors);
  // The column the mouse is over, as in the Snapshots' comparison table
  // (by request, 2026-11-12): a band down that column. Unlike there, the
  // other columns do not fade — here the lap is read across. Mouse only — a finger has no hover. Read by delegation, and
  // cleared only when the mouse leaves the table, so crossing from one
  // cell to the next never flickers.
  const [focus, setFocus] = useState<string | null>(null);
  function readFocus(event: ReactPointerEvent<HTMLTableElement>) {
    if (event.pointerType !== "mouse") return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-lap-col]",
    );
    const key = cell?.dataset.lapCol ?? null;
    if (key !== focus) setFocus(key);
  }
  // A figure column's cell: the band when it has the mouse — rounded at
  // the header and at the last row.
  // The "Best" row is hidden (by request, 2026-11-12): the last lap's row
  // closes the band.
  const showBestRow = false;
  const lastRow = showBestRow && count > 0 ? laps.length : laps.length - 1;
  const col = (key: string, row: number | "head") =>
    cn(
      "border-x border-x-transparent transition-colors duration-150",
      // The band without the comparison's side rules (by request,
      // 2026-11-12): the tint alone.
      focus === key && "imu-focus-band",
      focus === key && row === "head" && "rounded-t-[12px]",
      focus === key && row === lastRow && "rounded-b-[12px]",
    );
  const head =
    "px-3 pt-4 pb-2 text-xs font-medium whitespace-nowrap text-foreground";
  return (
    <div className="-mx-1 mt-4 overflow-x-auto px-1">
      <table
        onPointerOver={readFocus}
        onPointerLeave={() => setFocus(null)}
        className="w-full border-separate border-spacing-0 text-sm tabular-nums"
      >
        <thead>
          <tr>
            <th className={cn(head, "text-left")}>{heading ?? t.lapsCard}</th>
            <th
              data-lap-col="time"
              className={cn(head, "text-right", col("time", "head"))}
            >
              {t.lapTimeHeading}
            </th>
            {Array.from({ length: count }, (_, i) => (
              <th
                key={i}
                data-lap-col={`s${i}`}
                className={cn(head, "text-right", col(`s${i}`, "head"))}
              >
                S{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {laps.map((lap, index) => {
            const best = lap.durationMs === bestMs;
            const gap = formatRunGap(lap.durationMs, bestMs);
            const own = sectorMs[index];
            const row = rows?.[index];
            return (
              <tr key={`${index}-${lap.entryMs}`} className={cn(row?.mine && "bg-muted/60")}>
                <td
                  className={cn(
                    "border-t border-border px-3 py-7 whitespace-nowrap",
                    row ? "text-base font-semibold" : "text-lg font-semibold",
                    best && "shadow-[inset_3px_0_0_#D9FF00]",
                  )}
                >
                  {row ? (
                    <>
                      {/* The name on up to two lines in 160 px (by request,
                          2026-11-12), so eight columns fit the 800 px popup;
                          "This run" on the line under it. */}
                      <span className="line-clamp-2 block w-[160px] leading-[18px] break-words whitespace-normal">
                        {row.title}
                      </span>
                      <span className="mt-0.5 flex w-[160px] items-center gap-1.5 text-xs font-normal text-muted-foreground">
                        {row.mine && (
                          <span className="shrink-0 rounded-full bg-[#D9FF00] px-1.5 font-semibold text-[#101014]">
                            {t.thisRun}
                          </span>
                        )}
                        {row.sub && (
                          <span className="truncate">{row.sub}</span>
                        )}
                      </span>
                    </>
                  ) : (
                    t.lapNumbered(index + 1)
                  )}
                </td>
                <td
                  data-lap-col="time"
                  className={cn(
                    "border-t border-t-border px-3 py-7 text-right whitespace-nowrap",
                    col("time", index),
                  )}
                >
                  <span className="block font-display text-base font-bold">
                    {lapTime(lap.durationMs)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {best ? t.best : (gap ?? t.tied)}
                  </span>
                </td>
                {Array.from({ length: count }, (_, i) => {
                  const ms = own && own.length === count ? own[i] : null;
                  const fastest = ms != null && ms - sectorBest[i] < 1;
                  return (
                    <td
                      key={i}
                      data-lap-col={`s${i}`}
                      className={cn(
                        "border-t border-t-border px-1.5 py-3 text-right whitespace-nowrap",
                        col(`s${i}`, index),
                      )}
                    >
                      {ms == null ? (
                        <span className="px-2.5 text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={cn(
                            "block rounded-md px-2.5 py-4",
                            fastest && "bg-[#D9FF00] text-[#101014]",
                          )}
                        >
                          <span className="block text-base font-semibold">
                            {(ms / 1000).toFixed(2)}
                          </span>
                          <span
                            className={cn(
                              "block text-xs",
                              fastest
                                ? "text-[#101014]"
                                : "text-muted-foreground",
                            )}
                          >
                            {fastest
                              ? t.best
                              : (formatRunGap(ms, sectorBest[i]) ?? t.tied)}
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {showBestRow && count > 0 && (
            <tr>
              <td className="border-t-2 border-border px-3 py-5 text-lg font-semibold whitespace-nowrap">
                {t.bestSectorsRow}
              </td>
              <td
                data-lap-col="time"
                className={cn(
                  "border-t-2 border-t-border px-3 py-5",
                  col("time", laps.length),
                )}
              />
              {sectorBest.map((ms, i) => (
                <td
                  key={i}
                  data-lap-col={`s${i}`}
                  className={cn(
                    "border-t-2 border-t-border px-3 py-5 text-right text-base font-semibold whitespace-nowrap",
                    col(`s${i}`, laps.length),
                  )}
                >
                  {(ms / 1000).toFixed(2)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {count === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{t.lapsNoSplits}</p>
      )}
    </div>
  );
}

type SectorRow = {
  key: string;
  title: string;
  sub: string | null;
  mine: boolean;
  run: TimedRun;
  edges: number[] | null;
};

/**
 * A start-to-finish track's sectors in full (by request, 2026-11-12), the
 * track popup's "Sectors" tab: every run on the track — this session's and
 * every other recording the account has on it, as in "Times" — cut at the
 * track's sector lines, fastest first, in the laps table. The other files
 * are read here, in the browser, once each while the tab is open.
 */
export function ImuTrackSectors({
  sessionId,
  track,
  runs,
  prepared,
  candidates,
}: {
  sessionId: string;
  track: ImuTimedTrack;
  /** This session's runs on the track, and its recording, prepared. */
  runs: TimedRun[];
  prepared: SnapshotSession;
  candidates: ImuTrackCandidate[];
}) {
  const t = useProDict().tracks;
  const locale = useProLocale();
  const splits = useMemo(
    () => track.definition.splits ?? [],
    [track.definition.splits],
  );
  const sub = (c: ImuTrackCandidate | undefined) =>
    [c?.riderName, c?.createdAt && formatDate(c.createdAt, locale)]
      .filter(Boolean)
      .join(" · ") || null;
  const self = candidates.find((c) => c.id === sessionId);
  const selfRows = useMemo<SectorRow[]>(
    () =>
      runs.map((run, k) => ({
        key: `${sessionId}:${k}`,
        title: self?.name ?? "",
        sub: null,
        mine: true,
        run,
        edges: splits.length
          ? sectorBoundaries(prepared, splits, run)
          : null,
      })),
    [runs, prepared, splits, sessionId, self?.name],
  );
  const others = useMemo(
    () =>
      candidates.filter(
        (c) => c.id !== sessionId && track.candidateIds.includes(c.id),
      ),
    [candidates, sessionId, track.candidateIds],
  );
  const [read, setRead] = useState<Map<string, SectorRow[]>>(new Map());
  useEffect(() => {
    let live = true;
    for (const c of others) {
      void loadWholeImuSession(c.storagePath, c.mountOrientation, locale).then(
        (r) => {
          if (!live || !r.data) return;
          const p = prepareSnapshotSession(r.data);
          const found = findTimedRuns(p, track.definition).map((run, k) => ({
            key: `${c.id}:${k}`,
            title: c.name,
            sub: null,
            mine: false,
            run,
            edges: splits.length ? sectorBoundaries(p, splits, run) : null,
          }));
          setRead((prev) => new Map(prev).set(c.id, found));
        },
      );
    }
    return () => {
      live = false;
    };
  }, [others, track.definition, splits, locale]);

  const all = [...selfRows, ...[...read.values()].flat()].sort(
    (a, b) => a.run.durationMs - b.run.durationMs,
  );
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const pending = others.length - read.size;
  return (
    <div>
      <ImuLapsTable
        laps={all.map((r) => r.run)}
        sectors={all.map((r) => r.edges)}
        heading={t.runsHeading}
        rows={all.map((r) => ({
          title: r.title,
          sub: sub(byId.get(r.key.split(":")[0])),
          mine: r.mine,
        }))}
      />
      {pending > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t.loadingRuns}
        </p>
      )}
    </div>
  );
}
