"use client";

import { useProDict } from "@/components/pro-locale";
import { FinishFlag } from "@/components/imu-session-track";
import { formatDurationMillis } from "@/lib/imu/derive";
import { formatRunGap, type TimedRun } from "@/lib/imu/timed-track";
import { cn } from "@/lib/utils";

/**
 * A circuit's laps as a card (by request, 2026-10-31), dressed like the Rider's
 * and in its place, with its own switch on the page: how many, the best, and each lap's time
 * and gap. The lap under the cursor is marked, and picking one zooms the plot
 * onto it.
 */
export function ImuSessionLaps({
  laps,
  trimStartMs,
  cursorMs,
  onPick,
  className,
}: {
  laps: TimedRun[];
  /** The runs are on the whole recording's clock, the plot on the trimmed. */
  trimStartMs: number;
  cursorMs: number | null;
  onPick: (window: [number, number]) => void;
  className?: string;
}) {
  const t = useProDict().tracks;
  const time = (ms: number) => formatDurationMillis(ms).slice(0, -1);
  const bestMs = Math.min(...laps.map((lap) => lap.durationMs));
  return (
    <div className={cn("flex-col", className)}>
      <div className="flex items-center gap-3 border-b border-border p-5">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted"
        >
          <FinishFlag className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs leading-tight text-muted-foreground uppercase">
            {t.lapsCard}
          </p>
          <p className="-mt-1 truncate text-lg leading-tight font-semibold">
            {t.lapsSummary(laps.length, time(bestMs))}
          </p>
        </div>
      </div>
      <ol className="divide-y divide-border lg:max-h-[480px] lg:overflow-y-auto">
        {laps.map((lap, index) => {
          const from = lap.entryMs - trimStartMs;
          const to = lap.exitMs - trimStartMs;
          const here = cursorMs != null && cursorMs >= from && cursorMs < to;
          const best = lap.durationMs === bestMs;
          const gap = formatRunGap(lap.durationMs, bestMs);
          return (
            <li key={lap.entryMs}>
              <button
                type="button"
                aria-label={t.lapZoom(index + 1)}
                aria-current={here || undefined}
                onClick={() => onPick([from, to])}
                className={cn(
                  "w-full cursor-pointer px-5 py-4 text-left transition-colors hover:bg-muted",
                  here && "bg-muted",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  {t.lap(index + 1)}
                  {best ? (
                    <span className="rounded-full bg-foreground px-2 font-semibold text-background">
                      {t.best}
                    </span>
                  ) : (
                    <span className="tabular-nums">{gap ?? t.tied}</span>
                  )}
                </span>
                <span className="block font-display text-lg leading-tight font-bold tabular-nums">
                  {time(lap.durationMs)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
