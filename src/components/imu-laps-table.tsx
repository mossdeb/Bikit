"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { useProDict } from "@/components/pro-locale";
import { formatDurationMillis } from "@/lib/imu/derive";
import { formatRunGap, type TimedRun } from "@/lib/imu/timed-track";
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
}: {
  laps: TimedRun[];
  /** As the laps card's: per lap, the sectors' edges, or null. */
  sectors: (number[] | null)[] | null;
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
  const lastRow = count > 0 ? laps.length : laps.length - 1;
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
    "px-3 pt-6 pb-2 text-xs font-medium whitespace-nowrap text-foreground";
  return (
    <div className="-mx-1 mt-4 overflow-x-auto px-1">
      <table
        onPointerOver={readFocus}
        onPointerLeave={() => setFocus(null)}
        className="w-full border-separate border-spacing-0 text-sm tabular-nums"
      >
        <thead>
          <tr>
            <th className={cn(head, "text-left")}>{t.lapsCard}</th>
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
            return (
              <tr key={lap.entryMs}>
                <td
                  className={cn(
                    "border-t border-border px-3 py-7 text-lg font-semibold whitespace-nowrap",
                    best && "shadow-[inset_3px_0_0_#D9FF00]",
                  )}
                >
                  {t.lapNumbered(index + 1)}
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
          {count > 0 && (
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
