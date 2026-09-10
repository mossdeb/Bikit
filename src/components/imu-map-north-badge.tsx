import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Which way north went on a lab map: a white disc with an arrow and the
 * letter, in the top-right corner. Fixed colours like the rest of the
 * lab's map marks — the satellite under it never changes with the theme.
 * The arrow alone rotates; the letter stays upright and readable. Shared
 * by the session map (rotated, so the arrow says where north landed) and
 * the Snapshot's mini map (north-up, so the arrow points up) — one badge
 * on every map, by request (2026-09-10).
 */
export function ImuMapNorthBadge({
  northDeg = 0,
  className,
}: {
  /** Where north points, degrees clockwise from screen-up. */
  northDeg?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-2 right-2 flex size-7 flex-col items-center justify-center rounded-full bg-white/90 text-[#1c1c1c] shadow-sm",
        className,
      )}
    >
      <ArrowUp
        className="size-3"
        style={{ transform: `rotate(${northDeg}deg)` }}
      />
      <span className="text-[9px] leading-none font-semibold">N</span>
    </span>
  );
}
