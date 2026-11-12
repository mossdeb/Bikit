"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useProDict } from "@/components/pro-locale";
import { FinishFlag } from "@/components/imu-session-track";
import { formatDurationMillis } from "@/lib/imu/derive";
import { formatRunGap, type TimedRun } from "@/lib/imu/timed-track";
import { cn } from "@/lib/utils";

/**
 * A circuit's laps as a card (by request, 2026-10-31), dressed like the Rider's
 * and in its place, with its own switch on the page: how many, the best, and each lap's time
 * and gap. The fastest is marked, and picking one zooms the plot onto it.
 *
 * Each lap folds open on its sector times (by request, 2026-11-12), when the
 * circuit has sector lines: each sector's time and its gap to the best of
 * that sector among this session's laps, the fastest marked like the best
 * lap. The chevron opens it; the rest of the row still zooms.
 */
export function ImuSessionLaps({
  laps,
  sectors,
  trimStartMs,
  onPick,
  className,
}: {
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
  const time = (ms: number) => formatDurationMillis(ms).slice(0, -1);
  const bestMs = Math.min(...laps.map((lap) => lap.durationMs));
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  // Each lap's sector durations, and each sector's best across the laps.
  const sectorMs = sectors?.map((bounds) =>
    bounds ? bounds.slice(1).map((to, i) => to - bounds[i]) : null,
  );
  const count = sectorMs?.find((s) => s != null)?.length ?? 0;
  const sectorBest = Array.from({ length: count }, (_, i) =>
    Math.min(
      ...(sectorMs ?? []).flatMap((s) => (s && s.length === count ? [s[i]] : [])),
    ),
  );

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
          const best = lap.durationMs === bestMs;
          const gap = formatRunGap(lap.durationMs, bestMs);
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
                    "min-w-0 flex-1 cursor-pointer py-4 pl-5 text-left transition-colors hover:bg-muted",
                    foldable ? "pr-2" : "pr-5",
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
                {foldable && (
                  <button
                    type="button"
                    aria-label={t.lapSectors(index + 1)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(index)}
                    className="flex w-12 shrink-0 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "size-4 transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                )}
              </div>
              {isOpen && (
                <div id={panelId} className="px-5 pb-4">
                  {own && own.length === count ? (
                    <ol className="divide-y divide-border rounded-md bg-muted/60">
                      {own.map((ms, i) => {
                        const fastest = ms - sectorBest[i] < 1;
                        const delta = formatRunGap(ms, sectorBest[i]);
                        return (
                          <li
                            key={i}
                            className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                          >
                            <span className="text-muted-foreground">
                              S{i + 1}
                            </span>
                            <span className="flex items-center gap-3 tabular-nums">
                              {fastest ? (
                                <span className="rounded-full bg-foreground px-2 text-xs font-semibold text-background">
                                  {t.best}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {delta ?? t.tied}
                                </span>
                              )}
                              <span className="font-semibold">
                                {(ms / 1000).toFixed(2)} s
                              </span>
                            </span>
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
