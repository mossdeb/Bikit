export function StravaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#FC4C02" d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066z" />
      <path fill="#FC4C02" d="M9.936 13.828h3.066L8.808 0 3.463 13.828h3.066l2.279-4.976z" />
    </svg>
  );
}

/** Square badge variant — used inline next to a bike's details to flag that
 * it's synced with Strava.
 *
 * Geometry taken verbatim from assets/icons/geral/strava-2.svg, including its
 * 422 viewBox, so the mark is the supplied artwork rather than a redraw of it.
 * The source's clipPath is dropped: it clips to a rect the size of the whole
 * viewBox, so it never removed anything. */
export function StravaBadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 422 422" className={className} aria-hidden="true">
      <path d="M0 0H422V422H0V0Z" fill="#FC4C02" />
      <path
        opacity="0.6"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M181.987 232.1L247.925 350.787L311.225 232.1H271.662L247.925 276.937L221.55 232.1H181.987Z"
        fill="white"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M189.9 65.9375L271.663 232.1H105.5L189.9 65.9375ZM189.9 166.163L221.55 232.1H155.613L189.9 166.163Z"
        fill="white"
      />
    </svg>
  );
}
