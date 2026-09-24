import { cn } from "@/lib/utils";

/**
 * The marks over the columns of the setups comparison. The setup's
 * sliders are the supplied art of 2026-09-12 (assets/icons/Setup); the
 * seven figures' marks are the second set (assets/icons/IMU_v2, 1–7, by
 * request 2026-09-24): the speed gauge, the retention's circling arrows,
 * the harshness spikes, the chassis wave between two arrows, the chatter
 * stacks round a dot, the settling echo and the impact burst. All seven
 * are drawn in one 50-square, cropped here to the art's own box so they
 * read at one size; inks ride currentColor so the dark theme keeps them.
 * The files' clip-paths are dropped — each clipped to its own box, and
 * their ids would collide on one page.
 */

type Props = { className?: string };

const base = "h-5 w-auto shrink-0";

/** The seven figure marks share a box and a size: a 42-square cut from
 * the files' 50, which is where the art sits. */
const FIGURE_BOX = "4 4 42 42";
const figure = "h-8 w-8 shrink-0";

/** 1.svg (Setup) — a filled square with three slider rails. */
export function SetupSlidersIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 21 21"
      fill="none"
      className={cn(base, className)}
      aria-hidden
    >
      <path
        d="M17.5017 0.398438H3.20395C1.65424 0.398438 0.397949 1.65473 0.397949 3.20444V17.796C0.397949 19.3458 1.65424 20.602 3.20395 20.602H17.5017C19.0514 20.602 20.3077 19.3458 20.3077 17.796V3.20444C20.3077 1.65473 19.0514 0.398438 17.5017 0.398438Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.796388"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <g
        stroke="var(--card)"
        strokeWidth="0.995485"
        strokeMiterlimit="10"
        strokeLinecap="round"
      >
        <path d="M4.11865 5.72021H12.5685" />
        <path d="M4.11865 10.5488H6.5329" />
        <path d="M4.11865 15.3774H12.5685" />
        <path d="M14.9829 5.72021H17.3972" />
        <path d="M8.94727 10.5488H17.3971" />
        <path d="M14.9829 15.3774H17.3972" />
        <path d="M6.53271 11.756V9.3418" />
        <path d="M14.9829 6.92743V4.51318" />
        <path d="M14.9829 16.5847V14.1704" />
      </g>
    </svg>
  );
}

/** IMU_v2/1.svg — a gauge with its needle, the dial dashed. */
export function SpeedGaugeIcon({ className }: Props) {
  return (
    <svg
      viewBox={FIGURE_BOX}
      fill="none"
      className={cn(figure, className)}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="2.07463"
        strokeMiterlimit="10"
        strokeLinecap="round"
      >
        <path d="M24.1387 32.419L34.5045 23.6719" />
        <path d="M40.232 36.3493C41.1498 34.1989 41.6173 31.8147 41.5121 29.3102C41.165 21.0472 34.4809 14.2432 26.1417 13.6887C16.4975 13.0474 8.47266 20.5984 8.47266 30.0041C8.47266 32.2536 8.93408 34.3955 9.76561 36.3454" />
        <path d="M22.4031 20.3967C21.5816 20.6434 20.805 20.9926 20.0889 21.4293" />
        <path
          d="M17.2827 23.9902C16.1709 25.4886 15.4788 27.3106 15.377 29.2868"
          strokeDasharray="4.7 4.7"
        />
        <path d="M15.4629 31.1829C15.5844 32.0291 15.8153 32.8405 16.1405 33.6029" />
        <path d="M32.9423 24.191C31.2659 21.9373 28.6683 20.4059 25.6855 20.2075" />
      </g>
    </svg>
  );
}

/** IMU_v2/2.svg — two arrows chasing each other round a circle. */
export function RetentionIcon({ className }: Props) {
  return (
    <svg
      viewBox={FIGURE_BOX}
      fill="none"
      className={cn(figure, className)}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.7158 35.291C20.396 40.9711 29.6054 40.9711 35.2856 35.291C39.1491 31.4274 40.3848 25.9311 38.9925 21.0232" />
        <path d="M35.285 14.7213C29.6048 9.04114 20.3954 9.04114 14.7152 14.7213C11.2882 18.1484 9.92878 22.8601 10.637 27.3063" />
        <path d="M13.5996 39.76V34.1763H19.1833" />
        <path d="M36.113 10.24V15.8237H30.5293" />
      </g>
    </svg>
  );
}

/** IMU_v2/3.svg — a spiky trace with three sparks over its peak. */
export function HarshnessIcon({ className }: Props) {
  return (
    <svg
      viewBox={FIGURE_BOX}
      fill="none"
      className={cn(figure, className)}
      aria-hidden
    >
      <path
        d="M4.63281 38.0114H9.30035L13.0344 29.2704L18.89 40.812L25.0003 21.8872L29.8971 38.6308L35.778 30.6282L40.4456 38.0114H45.3677"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.26868"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M23.3105 9.1875H26.3868L24.9988 16.8295L23.3105 9.1875Z" />
        <path d="M30.1211 18.5536L33.3592 12.0774L35.7231 14.2469L30.1211 18.5536Z" />
        <path d="M20.6068 18.5536L17.3687 12.0774L15.0049 14.2469L20.6068 18.5536Z" />
      </g>
    </svg>
  );
}

/** IMU_v2/4.svg — a wave between an arrow up and an arrow down: the
 * chassis's own motion. */
export function ChassisBandIcon({ className }: Props) {
  return (
    <svg
      viewBox={FIGURE_BOX}
      fill="none"
      className={cn(figure, className)}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="1.93548"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M25 6.59814V17.479" />
        <path d="M20.8037 9.99268L24.3889 6.39968C24.7267 6.06111 25.2745 6.06111 25.6123 6.39968L29.1975 9.99268" />
        <path d="M25 43.4017L25 32.5208" />
        <path d="M29.1975 40.0073L25.6123 43.6003C25.2745 43.9389 24.7267 43.9389 24.3889 43.6003L20.8037 40.0073" />
        <path d="M5.82129 30.6093L9.75175 24.4258C11.1061 22.2952 13.3222 22.2952 14.6765 24.4258L16.1446 26.7355C17.4989 28.8661 19.715 28.8661 21.0693 26.7355L22.5374 24.4258C23.8917 22.2952 26.1078 22.2952 27.4621 24.4258L28.9302 26.7355C30.2845 28.8661 32.5007 28.8661 33.855 26.7355L35.3231 24.4258C36.6774 22.2952 38.8935 22.2952 40.2478 24.4258L44.1783 30.6093" />
      </g>
    </svg>
  );
}

/** IMU_v2/5.svg — zigzag stacks above and below a dot: the chatter. */
export function ChatterBandIcon({ className }: Props) {
  return (
    <svg
      viewBox={FIGURE_BOX}
      fill="none"
      className={cn(figure, className)}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="1.6832"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M40.032 7.35693L35.0209 12.2974L30.0099 7.41707L24.9989 12.2974L19.9879 7.41707L14.9768 12.146L9.96582 7.35693" />
        <path d="M35.0207 18.9064L30.0096 14.0261L24.9986 18.9064L19.9876 14.0261L14.9766 18.7551" />
        <path
          d="M24.9992 27.3277C26.209 27.3277 27.1898 26.347 27.1898 25.1371C27.1898 23.9273 26.209 22.9465 24.9992 22.9465C23.7894 22.9465 22.8086 23.9273 22.8086 25.1371C22.8086 26.347 23.7894 27.3277 24.9992 27.3277Z"
          fill="currentColor"
        />
        <path d="M9.96582 42.6431L14.9768 37.7026L19.9879 42.5829L24.9989 37.7026L30.0099 42.5829L35.0209 37.854L40.032 42.6431" />
        <path d="M14.9766 31.094L19.9876 35.9743L24.9986 31.094L30.0096 35.9743L35.0207 31.2453" />
      </g>
    </svg>
  );
}

/** IMU_v2/6.svg — a ball and its echo, fading to the right: the settling
 * after a hit. */
export function SettleIcon({ className }: Props) {
  return (
    <svg
      viewBox={FIGURE_BOX}
      fill="none"
      className={cn(figure, className)}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="1.75677"
        strokeLinecap="round"
        strokeMiterlimit="10"
      >
        <path
          d="m14.8265 31.7442c3.7248 0 6.7444-3.0196 6.7444-6.7444s-3.0196-6.7444-6.7444-6.7444c-3.7249 0-6.74447 3.0196-6.74447 6.7444s3.01957 6.7444 6.74447 6.7444z"
          fill="currentColor"
        />
        <path d="m22.4238 31.7442c3.7249 0 6.7445-3.0196 6.7445-6.7444s-3.0196-6.7444-6.7445-6.7444" />
        <path d="m30.874 30.2293c2.8881 0 5.2294-2.3413 5.2294-5.2294s-2.3413-5.2294-5.2294-5.2294" />
        <path d="m39.0596 27.8598c1.5795 0 2.8599-1.2805 2.8599-2.86s-1.2804-2.8599-2.8599-2.8599" />
      </g>
    </svg>
  );
}

/** IMU_v2/7.svg — a burst. */
export function ImpactIcon({ className }: Props) {
  return (
    <svg
      viewBox={FIGURE_BOX}
      fill="none"
      className={cn(figure, className)}
      aria-hidden
    >
      <path
        d="M25 12.25L26.8637 20.5006L34.0156 15.9844L29.4994 23.1363L37.75 25L29.4994 26.8637L34.0156 34.0156L26.8637 29.4994L25 37.75L23.1363 29.4994L15.9844 34.0156L20.5006 26.8637L12.25 25L20.5006 23.1363L15.9844 15.9844L23.1363 20.5006L25 12.25Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.721698"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
