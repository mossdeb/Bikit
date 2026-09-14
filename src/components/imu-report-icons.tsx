/**
 * The report's section marks that are not elsewhere in the app. The Bike
 * card wears the bike's own type mark (bike-type-icon) and the Rider card
 * the lab's helmet (ImuRiderGlyph); the Trail card this.
 */

/** Two peaks, the Trail card's mark — the owner's drawing (trail_icon.svg,
 * 2026-09-14), in currentColor so it follows the theme. */
export function TrailPeaksIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 39"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeMiterlimit={10}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M1 37.643L23.0407 2.05615L40.6733 37.643" />
      <path d="M34.3364 24.8532L42.386 13.5259L54.3355 37.643" />
    </svg>
  );
}
