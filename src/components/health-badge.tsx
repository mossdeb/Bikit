import { classifyHealth, type HealthLevel } from "@/lib/maintenance/health";
import { cn } from "@/lib/utils";
import { getDictionary } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

const LEVEL_STYLES: Record<HealthLevel, string> = {
  excellent: "bg-health-positive text-health-positive-foreground",
  good: "bg-health-positive text-health-positive-foreground",
  attention: "bg-health-attention text-health-attention-foreground",
  critical: "bg-health-critical text-health-critical-foreground",
};

const NOT_CONFIGURED_STYLE = "bg-muted text-muted-foreground";

/**
 * The wrench, from assets/icons/geral/maintenance.svg.
 *
 * That file draws two things — a wrench and a hex badge beside it — and only
 * the wrench is taken: at this size the pair is a smudge. Its own clipPath
 * gives the wrench's square (24.6162), which is what the viewBox here is.
 *
 * Inlined and `currentColor` rather than loaded as a file, like every other
 * glyph in this app: the source is `fill="black"`, and this badge is drawn on
 * four different grounds, one of them near-black.
 */
function WrenchGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24.6162 24.6163" fill="currentColor" aria-hidden className={cn("shrink-0", className)}>
      <path d="M17.6637 13.9111C17.1278 13.8305 16.5898 13.7611 16.0572 13.6629C15.8804 13.6303 15.7703 13.6528 15.6401 13.7835C12.4074 17.0291 9.16754 20.2675 5.93433 23.5125C5.18175 24.2678 4.29129 24.6838 3.22249 24.6074C1.8301 24.5077 0.814068 23.7991 0.281738 22.5117C-0.242206 21.2446 -0.0259911 20.0479 0.852131 18.9843C0.953849 18.8611 1.06878 18.7484 1.18186 18.6352C4.3954 15.4158 7.60853 12.196 10.8268 8.98132C10.9629 8.84539 10.9957 8.72754 10.95 8.54396C9.98435 4.66812 12.6318 0.694783 16.5721 0.0864206C17.7687 -0.0983182 18.9297 0.01261 20.0661 0.424173C20.7588 0.675065 20.8981 1.25735 20.3807 1.77683C19.2221 2.94 18.0634 4.10302 16.8975 5.25888C16.7729 5.38245 16.7416 5.49217 16.7797 5.65686C16.9004 6.1791 17.0122 6.70352 17.1183 7.22896C17.1485 7.37861 17.2066 7.4595 17.3684 7.49092C17.9017 7.59449 18.4329 7.71004 18.962 7.83355C19.1203 7.8705 19.2233 7.83822 19.3389 7.72153C20.4716 6.57785 21.6109 5.44068 22.7484 4.30175C22.805 4.2451 22.8601 4.18664 22.9199 4.13358C23.348 3.75385 23.9277 3.8815 24.1284 4.41681C24.8795 6.42073 24.7726 8.38541 23.7425 10.2593C22.657 12.2342 20.9608 13.3895 18.7473 13.785C18.6058 13.8103 18.4623 13.8319 18.319 13.8378C18.1034 13.8467 17.8872 13.8401 17.6712 13.8401C17.6687 13.8638 17.6662 13.8875 17.6637 13.9111Z" />
    </svg>
  );
}

/** Bike-level badge — wrench + classification name (Excellent/Good/Need Attention/Service Due). */
export function HealthBadge({
  level,
  dict = getDictionary("en"),
  className,
}: {
  level: HealthLevel | null;
  dict?: Dictionary;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-xs font-semibold",
        level ? LEVEL_STYLES[level] : NOT_CONFIGURED_STYLE,
        className
      )}
    >
      <WrenchGlyph className="size-3" />
      {level ? dict.health[level] : dict.health.notConfigured}
    </span>
  );
}

/**
 * Component-level badge — percentage only, no text, shown next to a
 * ServiceIntervalBar. With no reminder configured there is no percentage to
 * show; `fallback` lets the caller put something useful in the same slot
 * (the component's accumulated distance) instead of the placeholder dash.
 */
export function HealthPercentBadge({
  percent,
  fallback,
  className,
}: {
  percent: number | null;
  fallback?: string;
  className?: string;
}) {
  const level = percent != null ? classifyHealth(percent) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[7px] px-2.5 py-1 text-xs font-semibold",
        level ? LEVEL_STYLES[level] : NOT_CONFIGURED_STYLE,
        className
      )}
    >
      {level ? `${percent}%` : (fallback ?? "—")}
    </span>
  );
}
