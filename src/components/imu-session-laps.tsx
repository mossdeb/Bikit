"use client";

import { useState } from "react";
import { ChevronDown, SquareArrowOutUpRight } from "lucide-react";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { FinishFlag } from "@/components/imu-session-track";
import { lapSectorStats, lapTime } from "@/components/imu-laps-table";
import {
  formatRunGap,
  formatSeconds,
  type TimedRun,
} from "@/lib/imu/timed-track";
import { cn } from "@/lib/utils";

/**
 * A circuit's laps as a card (by request, 2026-10-31), dressed like the Rider's
 * and in its place, with its own switch on the page: how many, the best, and each lap's time
 * and gap. The fastest is marked, and picking one zooms the plot onto it.
 *
 * Each lap folds open on its sector times (by request, 2026-11-12), when the
 * circuit has sector lines: each sector's time and its gap to the best of
 * that sector among this session's laps, the fastest marked like the best
 * lap. The chevron opens it; the rest of the row still zooms, and so does
 * a sector, onto its stretch of the lap.
 */
/** The colour of time lost to the best (by request, 2026-11-13): amber up
 * to half a second, red past it — read at a glance down a column of gaps. */
function gapTone(lostMs: number): string {
  return lostMs <= 500
    ? "text-amber-600 dark:text-amber-400"
    : "text-red-600 dark:text-red-400";
}

export function ImuSessionLaps({
  laps,
  sectors,
  trimStartMs,
  onPick,
  onExpand,
  className,
}: {
  /** "View larger": the track popup, on its laps and sectors tab. */
  onExpand?: () => void;
  laps: TimedRun[];
  /** Per lap, in `laps`' order: the sectors' edges (start, each split,
   * finish) on the whole recording's clock, null for a lap that misses a
   * line. Null altogether when the circuit has no sector lines. */
  sectors?: (number[] | null)[] | null;
  /** The runs are on the whole recording's clock, the plot on the trimmed. */
  trimStartMs: number;
  onPick: (window: [number, number]) => void;
  className?: string;
}) {
  const t = useProDict().tracks;
  const locale = useProLocale();
  const time = lapTime;
  const bestMs = Math.min(...laps.map((lap) => lap.durationMs));
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  // Each lap's sector durations, and each sector's best across the laps.
  const { sectorMs, count, sectorBest } = lapSectorStats(sectors);

  const toggle = (index: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className={cn("flex-col", className)}>
      <div className="flex items-center gap-3 border-b border-border p-5">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted"
        >
          <FinishFlag className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {/* The count up in the label, the best alone below (by request,
              2026-11-12): "4 voltas · melhor 02:41.10" did not fit. */}
          <p className="text-xs leading-tight text-muted-foreground uppercase">
            {t.lapsTitle(laps.length)}
          </p>
          <p className="-mt-1 truncate text-lg leading-tight font-semibold">
            {t.lapsBest(time(bestMs))}
          </p>
        </div>
        {onExpand && (
          <button
            type="button"
            aria-label={t.lapsExpand}
            title={t.lapsExpand}
            onClick={onExpand}
            // Named for the tab it opens (by request, 2026-11-13; an icon
            // alone before), in the outlined pill of the rows' buttons.
            className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-foreground/25 px-3.5 text-sm font-medium transition-colors hover:border-foreground hover:bg-muted"
          >
            {t.perfect.tabLaps}
            <SquareArrowOutUpRight aria-hidden className="size-4" />
          </button>
        )}
      </div>
      <ol className="divide-y divide-border lg:max-h-[480px] lg:overflow-y-auto">
        {laps.map((lap, index) => {
          const from = lap.entryMs - trimStartMs;
          const to = lap.exitMs - trimStartMs;
          const best = lap.durationMs === bestMs;
          const gap = formatRunGap(lap.durationMs, bestMs, locale);
          const foldable = count > 0;
          const isOpen = foldable && open.has(index);
          const own = sectorMs?.[index];
          const panelId = `lap-sectors-${index}`;
          return (
            <li
              key={lap.entryMs}
              className={cn(best && "shadow-[inset_3px_0_0_#D9FF00]")}
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  aria-label={t.lapZoom(index + 1)}
                  onClick={() => onPick([from, to])}
                  className={cn(
                    "flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 py-4 pl-5 text-left transition-colors hover:bg-muted",
                    // Room between the gap and the sectors' button.
                    "pr-5",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">
                      {t.lap(index + 1)}
                    </span>
                    <span className="block font-display text-lg leading-tight font-bold tabular-nums">
                      {time(lap.durationMs)}
                    </span>
                  </span>
                  {/* The gap, or the best's pill, centred on the row (by
                      request, 2026-11-12). */}
                  {best ? (
                    <span className="shrink-0 rounded-full bg-[#D9FF00] px-2 text-xs font-semibold text-[#101014]">
                      {t.best}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        gap
                          ? gapTone(lap.durationMs - bestMs)
                          : "text-muted-foreground",
                      )}
                    >
                      {gap ?? t.tied}
                    </span>
                  )}
                </button>
                {foldable && (
                  <button
                    type="button"
                    aria-label={t.lapSectors(index + 1)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(index)}
                    className="group flex shrink-0 cursor-pointer items-center justify-center pr-3"
                  >
                    {/* The chevron in an outlined pill, named for what it
                        opens (by request, 2026-11-13; a bare circle before). */}
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-8 items-center gap-1.5 rounded-full border border-foreground/25 pr-2 pl-3 text-xs font-medium text-foreground transition-colors group-hover:border-foreground group-hover:bg-muted",
                        isOpen && "border-foreground",
                      )}
                    >
                      {t.lapSectorsButton}
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform duration-200",
                          isOpen && "rotate-180",
                        )}
                      />
                    </span>
                  </button>
                )}
              </div>
              {isOpen && (
                <div id={panelId} className="px-3 pb-4">
                  {own && own.length === count ? (
                    <ol className="divide-y divide-border overflow-hidden rounded-md bg-muted/60">
                      {own.map((ms, i) => {
                        const fastest = ms - sectorBest[i] < 1;
                        const delta = formatRunGap(ms, sectorBest[i], locale);
                        // The sector's edges, on the whole recording's clock.
                        const edges = sectors?.[index];
                        return (
                          <li key={i}>
                            <button
                              type="button"
                              aria-label={t.sectorZoom(i + 1, index + 1)}
                              onClick={() =>
                                edges &&
                                onPick([
                                  edges[i] - trimStartMs,
                                  edges[i + 1] - trimStartMs,
                                ])
                              }
                              className={cn(
                                "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-4 text-left text-sm transition-colors hover:bg-muted",
                                // The fastest sector's bar, as the best lap's.
                                fastest && "shadow-[inset_3px_0_0_#D9FF00]",
                              )}
                            >
                              <span className="font-bold">S{i + 1}</span>
                              <span className="flex items-center gap-3 tabular-nums">
                                {fastest ? (
                                  <span className="rounded-full bg-[#D9FF00] px-2 text-xs font-semibold text-[#101014]">
                                    {t.best}
                                  </span>
                                ) : (
                                  <span
                                    className={cn(
                                      "text-xs",
                                      delta
                                        ? gapTone(ms - sectorBest[i])
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {delta ?? t.tied}
                                  </span>
                                )}
                                <span className="font-semibold">
                                  {formatSeconds(ms, 2, locale)} s
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t.lapNoSectors}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * A start-to-finish track's sectors as a card (by request, 2026-11-12): the
 * laps card's twin for bike runs, "only as splits" — one row per sector of
 * the run, its time, and its gap to the rider's best there (the Perfect
 * Run's best sectors, the same yardstick as the Splits band over the plot).
 * The rider's best carries the lime bar and the pill; picking a sector zooms
 * the plot onto it. With several runs on the track in one recording, each
 * run's sectors stand under a line of their own.
 */
export function ImuSessionSplits({
  runs,
  sectors,
  bests,
  trimStartMs,
  onPick,
  onExpand,
  className,
}: {
  runs: TimedRun[];
  /** Per run, in `runs`' order: the sectors' edges on the whole recording's
   * clock, or null for a run that misses a line. */
  sectors: (number[] | null)[];
  /** The rider's best time in each sector, ms; null while the Perfect Run
   * is not read, or when its sectors do not match these. */
  bests: number[] | null;
  trimStartMs: number;
  onPick: (window: [number, number]) => void;
  /** "View larger": the track popup, on its "Sectors" tab. */
  onExpand?: () => void;
  className?: string;
}) {
  const t = useProDict().tracks;
  const locale = useProLocale();
  const { sectorMs, count } = lapSectorStats(sectors);
  const bestRunMs = Math.min(...runs.map((r) => r.durationMs));
  const many = runs.length > 1;
  return (
    <div className={cn("flex-col", className)}>
      <div className="flex items-center gap-3 border-b border-border p-5">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted"
        >
          <FinishFlag className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-tight text-muted-foreground uppercase">
            {t.sectorsCount(count)}
          </p>
          <p className="-mt-1 truncate text-lg leading-tight font-semibold">
            {/* The time alone: in the 240 px column beside the Rider,
                "Run 01:34.96" did not fit. */}
            {lapTime(bestRunMs)}
          </p>
        </div>
        {onExpand && (
          <button
            type="button"
            aria-label={t.lapsExpand}
            title={t.lapsExpand}
            onClick={onExpand}
            // Named for the tab it opens (by request, 2026-11-13; an icon
            // alone before), in the outlined pill of the rows' buttons.
            className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-foreground/25 px-3.5 text-sm font-medium transition-colors hover:border-foreground hover:bg-muted"
          >
            {t.perfect.tabSectors}
            <SquareArrowOutUpRight aria-hidden className="size-4" />
          </button>
        )}
      </div>
      <div className="lg:max-h-[480px] lg:overflow-y-auto">
        {runs.map((run, r) => {
          const own = sectorMs[r];
          const edges = sectors[r];
          return (
            <div key={run.entryMs}>
              {many && (
                <p className="border-b border-border bg-muted/60 px-5 py-2 text-xs font-semibold">
                  {t.runNumbered(r + 1, lapTime(run.durationMs))}
                </p>
              )}
              {own && edges && own.length === count ? (
                <ol className="divide-y divide-border">
                  {own.map((ms, i) => {
                    const best = bests?.[i] ?? null;
                    const delta = best != null ? ms - best : null;
                    // Within a millisecond, or faster (a reading the Perfect
                    // Run left out): this run holds the rider's best here.
                    const fastest = delta != null && delta < 1;
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          aria-label={t.sectorZoomRun(i + 1)}
                          onClick={() =>
                            onPick([
                              edges[i] - trimStartMs,
                              edges[i + 1] - trimStartMs,
                            ])
                          }
                          className={cn(
                            "flex w-full cursor-pointer items-center justify-between gap-2 px-5 py-4 text-left transition-colors hover:bg-muted",
                            fastest && "shadow-[inset_3px_0_0_#D9FF00]",
                          )}
                        >
                          {/* The sector on the left, its time on the right
                              with the gap under it (by request, 2026-11-12). */}
                          <span className="min-w-0 text-sm text-foreground">
                            {t.perfect.sector(i + 1)}
                          </span>
                          <span className="flex shrink-0 flex-col items-end">
                            <span className="font-display text-lg leading-tight font-bold tabular-nums">
                              {formatSeconds(ms, 2, locale)} s
                            </span>
                            {fastest ? (
                              <span className="mt-0.5 rounded-full bg-[#D9FF00] px-2 text-xs font-semibold text-[#101014]">
                                {t.best}
                              </span>
                            ) : delta != null ? (
                              <span
                                className={cn(
                                  "text-xs tabular-nums",
                                  formatRunGap(ms, best!, locale)
                                    ? gapTone(ms - best!)
                                    : "text-muted-foreground",
                                )}
                              >
                                {formatRunGap(ms, best!, locale) ?? t.tied}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="px-5 py-4 text-xs text-muted-foreground">
                  {t.runNoSectors}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
