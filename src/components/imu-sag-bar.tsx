"use client";

import { cn } from "@/lib/utils";
import { sagTone } from "@/lib/imu/setup-balance";
import { useProDict, useProLocale } from "@/components/pro-locale";
import { proPercent } from "@/lib/i18n/pro";

/** The bar's scale, %: 0 to 50 marked, and a hatched stretch past it. */
const SAG_BAR_MAX = 55;
const SAG_BAR_TICKS = [0, 10, 20, 30, 40, 50];
/** The bar's colours follow sagTone (src/lib/imu/setup-balance.ts): green
 * inside the usual range, amber outside it, red from half the travel. */

/**
 * The sag's share of the travel as a bar (the supplied layout, 2026-10-27):
 * the figure large over it, a scale from 0 to 50 % under it, green inside
 * the usual range and amber outside it. An empty track until both numbers
 * are in.
 */
export function SagBar({
  percent: pct,
  block,
  caption,
  className,
}: {
  /** The sag's share of the travel, %, or null until both are known. */
  percent: number | null;
  block: "fork" | "shock";
  /** The word beside the figure; the setup's "de SAG" when not given. */
  caption?: string;
  className?: string;
}) {
  const t = useProDict().report.setup.form;
  const locale = useProLocale();
  const tone = pct != null ? sagTone(block, pct) : null;
  const inRange = tone === "good";
  const danger = tone === "danger";
  const at = (v: number) =>
    `${(Math.min(v, SAG_BAR_MAX) / SAG_BAR_MAX) * 100}%`;
  return (
    <div className={cn("mt-5 rounded-[10px] bg-muted/60 px-4 pt-3 pb-2", className)}>
      <p className="text-center tabular-nums">
        <span className="text-2xl font-semibold">
          {pct != null ? proPercent(pct, locale) : "–"}
        </span>{" "}
        <span className="text-xs text-muted-foreground">
          {caption ?? t.sagOfTravel}
        </span>
      </p>
      <div className="relative mt-2 h-1.5 rounded-full bg-foreground/10">
        <div
          aria-hidden
          className="imu-event-band absolute inset-y-0 right-0 rounded-r-full"
          style={{ left: at(50) }}
        />
        {/* Always there, at nothing until both numbers are in, so the
            fill grows into place and slides and changes colour as the sag
            is typed (by request, 2026-10-27). */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none",
            danger ? "bg-[#FF5A39]" : inRange ? "bg-[#3DDC97]" : "bg-[#F5B82E]",
          )}
          style={{ width: pct != null ? at(pct) : "0%" }}
        />
        <div
          aria-hidden
          className="absolute -top-1 h-3.5 w-px bg-foreground/60"
          style={{ left: at(50) }}
        />
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] text-muted-foreground tabular-nums">
        {SAG_BAR_TICKS.map((v) => (
          <span
            key={v}
            className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0"
            style={{ left: at(v) }}
          >
            {proPercent(v, locale)}
          </span>
        ))}
        <span className="absolute right-0">…</span>
      </div>
    </div>
  );
}

