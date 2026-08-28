import { cn } from "@/lib/utils";

/**
 * Marks for the session résumé's seven figures — supplied art.
 *
 * Separate from the event icons next door on purpose: those name a thing that
 * happened at an instant and are read inside a card about it, these label a
 * number that describes the whole recording. They are drawn thinner and sit
 * in `currentColor`, so the muted grey comes from the row rather than from a
 * hex baked into the glyph (the source files carry #8A8D93).
 *
 * **The stroke-widths are not the ones the source files carry.** Each is set
 * so the glyph paints 1.5px in the 20×20 box these are drawn at, and since
 * the viewBoxes differ — 19×20 to 22×24 — that is a different number in each
 * file: the box scales the art, and the stroke with it. Left as supplied they
 * ranged from 1.20px to 1.50px in the same row, which read as some marks
 * being fainter than others.
 *
 * The corollary: showing one of these at another size needs the width redone,
 * or a `[&_path]:[stroke-width:…]` override at the call site.
 *
 * `overflow-visible` on every one: the art is drawn to the edge of its own
 * viewBox, so half the stroke falls outside it — an SVG clips to its viewport
 * by default and was shaving that half off all four sides. Thickening the
 * strokes made the shave visible, but it was there from the first draw.
 */

interface IconProps {
  className?: string;
}

/** Duração — a clock. */
export function StatClockIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M10.0002 18.7209C14.8167 18.7209 18.7212 14.8164 18.7212 9.99998C18.7212 5.18354 14.8167 1.27905 10.0002 1.27905C5.18379 1.27905 1.2793 5.18354 1.2793 9.99998C1.2793 14.8164 5.18379 18.7209 10.0002 18.7209Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10 9.99991V4.24414"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10 10L12.7731 12.7731"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** G máx — the trace itself, the same shape the session's mark carries. */
export function StatMetricIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 22 16"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M0.658203 9.57108H3.60259L5.70972 6.00573L7.64828 11.9846L10.7977 0.657715L14.939 14.9191L17.2568 9.57108H20.6582"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Impactos — a burst. */
export function StatImpactIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 22 22"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M10.75 0.75L12.2117 7.22109L17.8211 3.67893L14.2789 9.28828L20.75 10.75L14.2789 12.2117L17.8211 17.8211L12.2117 14.2789L10.75 20.75L9.28828 14.2789L3.67893 17.8211L7.22109 12.2117L0.75 10.75L7.22109 9.28828L3.67893 3.67893L9.28828 7.22109L10.75 0.75Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Curvas — a line bending away. */
export function StatTurnIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 19 20"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M15.7891 0.476074L18.5124 3.13283L15.7891 5.78959"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.2904 3.13281C8.01086 3.13281 0.488281 10.4714 0.488281 19.524"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Saltos — a ramp with the take-off arrow above it. */
export function StatJumpIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 21 21"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M0.75 11.9784L14.5463 1.57336"
        stroke="currentColor"
        strokeWidth="1.575"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.6123 0.75H15.0739V4.21156"
        stroke="currentColor"
        strokeWidth="1.575"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.93164 19.7203L19.873 7.7594V19.7203H1.93164Z"
        stroke="currentColor"
        strokeWidth="1.575"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** No ar — a stopwatch, because airtime is a duration and not a time of day.
 * The plain clock above labels the recording's length; this one labels a
 * measurement taken during it. */
export function StatStopwatchIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 21 24"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M10.1807 23.2071C15.3891 23.2071 19.6114 18.9848 19.6114 13.7764C19.6114 8.56797 15.3891 4.3457 10.1807 4.3457C4.97227 4.3457 0.75 8.56797 0.75 13.7764C0.75 18.9848 4.97227 23.2071 10.1807 23.2071Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10.1807 13.7763V7.55212"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10.1807 13.7764L13.1795 16.7752"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M16.6504 6.91489L18.9665 4.59875"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10.1807 4.34569V0.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M8.24219 0.75H12.3877"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Raio (est.) — a slope with the centre of the arc marked, supplied art.
 *
 * The stroke follows this file's rule and not the source's: 1.65 in a 22-wide
 * viewBox paints 1.5px at the 20px these are drawn at (1.5 × 22/20). The file
 * carries 0.85, which would have painted 0.77 — half the weight of the marks
 * beside it.
 */
export function StatRadiusIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 22 22"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M0.421875 21.5769H21.5757"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M0.421875 21.2044L8.11418 0.423096"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.9612 21.5769C11.9612 16.5645 8.89668 12.2678 4.53906 10.4581"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.1335 11.2209C16.9687 11.2209 17.6458 10.5438 17.6458 9.70854C17.6458 8.87328 16.9687 8.19617 16.1335 8.19617C15.2982 8.19617 14.6211 8.87328 14.6211 9.70854C14.6211 10.5438 15.2982 11.2209 16.1335 11.2209Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Inclinação teórica — an upright over a ground line with the lean arc
 * dashed in, supplied art.
 *
 * 1.94 in a 25.93-wide viewBox for the same 1.5px (1.5 × 25.93/20); the file
 * carries 1.21. The dash pattern is scaled with it, or the dots would have
 * kept the source's spacing against a thicker stroke and read as a dotted
 * line rather than a dashed arc.
 */
export function StatLeanAngleIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 26 22"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d="M0.605469 21.3957H25.3258"
        stroke="currentColor"
        strokeWidth="1.94"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.5977 18.0791L12.5977 1.0791"
        stroke="currentColor"
        strokeWidth="1.94"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23.2026 21.3957C23.2026 15.7404 18.618 11.1558 12.9626 11.1558C7.30725 11.1558 2.72266 15.7404 2.72266 21.3957"
        stroke="currentColor"
        strokeWidth="1.94"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeDasharray="1.94 5.82"
      />
    </svg>
  );
}
