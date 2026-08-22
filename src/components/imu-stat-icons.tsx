/**
 * Marks for the session résumé's seven figures — supplied art.
 *
 * Separate from the event icons next door on purpose: those name a thing that
 * happened at an instant and are read inside a card about it, these label a
 * number that describes the whole recording. They are drawn thinner and sit
 * in `currentColor`, so the muted grey comes from the row rather than from a
 * hex baked into the glyph (the source files carry #8A8D93).
 *
 * Every one is stroked, so a size change needs no stroke-width correction as
 * long as the box keeps its own viewBox ratio.
 */

interface IconProps {
  className?: string;
}

/** Duração — a clock. */
export function StatClockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M10.0002 18.7209C14.8167 18.7209 18.7212 14.8164 18.7212 9.99998C18.7212 5.18354 14.8167 1.27905 10.0002 1.27905C5.18379 1.27905 1.2793 5.18354 1.2793 9.99998C1.2793 14.8164 5.18379 18.7209 10.0002 18.7209Z"
        stroke="currentColor"
        strokeWidth="1.26647"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10 9.99991V4.24414"
        stroke="currentColor"
        strokeWidth="1.26647"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10 10L12.7731 12.7731"
        stroke="currentColor"
        strokeWidth="1.26647"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** G máx — the trace itself, the same shape the session's mark carries. */
export function StatMetricIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 22 16" fill="none" className={className} aria-hidden>
      <path
        d="M0.658203 9.57108H3.60259L5.70972 6.00573L7.64828 11.9846L10.7977 0.657715L14.939 14.9191L17.2568 9.57108H20.6582"
        stroke="currentColor"
        strokeWidth="1.31547"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Impactos — a burst. */
export function StatImpactIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 22 22" fill="none" className={className} aria-hidden>
      <path
        d="M10.75 0.75L12.2117 7.22109L17.8211 3.67893L14.2789 9.28828L20.75 10.75L14.2789 12.2117L17.8211 17.8211L12.2117 14.2789L10.75 20.75L9.28828 14.2789L3.67893 17.8211L7.22109 12.2117L0.75 10.75L7.22109 9.28828L3.67893 3.67893L9.28828 7.22109L10.75 0.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Curvas — a line bending away. */
export function StatTurnIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 19 20" fill="none" className={className} aria-hidden>
      <g clipPath="url(#imu-stat-turn-clip)">
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
      </g>
      <defs>
        <clipPath id="imu-stat-turn-clip">
          <rect width="19" height="20" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Saltos — a ramp with the take-off arrow above it. */
export function StatJumpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 21 21" fill="none" className={className} aria-hidden>
      <path
        d="M0.75 11.9784L14.5463 1.57336"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.6123 0.75H15.0739V4.21156"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.93164 19.7203L19.873 7.7594V19.7203H1.93164Z"
        stroke="currentColor"
        strokeWidth="1.5"
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
    <svg viewBox="0 0 21 24" fill="none" className={className} aria-hidden>
      <path
        d="M10.1807 23.2071C15.3891 23.2071 19.6114 18.9848 19.6114 13.7764C19.6114 8.56797 15.3891 4.3457 10.1807 4.3457C4.97227 4.3457 0.75 8.56797 0.75 13.7764C0.75 18.9848 4.97227 23.2071 10.1807 23.2071Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10.1807 13.7763V7.55212"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10.1807 13.7764L13.1795 16.7752"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M16.6504 6.91489L18.9665 4.59875"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M10.1807 4.34569V0.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M8.24219 0.75H12.3877"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
    </svg>
  );
}
