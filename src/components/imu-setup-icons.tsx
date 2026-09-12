import { cn } from "@/lib/utils";

/**
 * The marks over the columns of the setups comparison (supplied art,
 * assets/icons/Setup, 2026-09-12): the setup's sliders, the speed gauge,
 * the retention's circling arrows, the harshness peaks, the vibration
 * waves, the settling rings and the impact burst. Inks ride currentColor
 * so the dark theme keeps them; the white cut-outs inside the filled
 * marks take the card's own surface. The files' clip-paths are dropped —
 * each clipped to its own box, and their ids would collide on one page.
 */

type Props = { className?: string };

const base = "h-5 w-auto shrink-0";

/** 1.svg — a filled square with three slider rails. */
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

/** 2.svg — a filled gauge with its needle. */
export function SpeedGaugeIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 28 21"
      fill="none"
      className={cn(base, className)}
      aria-hidden
    >
      <path
        d="M25.929 18.9156C26.6587 17.1874 27.0305 15.2715 26.9469 13.2588C26.6708 6.61838 21.3558 1.15053 14.7246 0.704889C7.05554 0.189503 0.674316 6.25772 0.674316 13.8164C0.674316 15.6242 1.04124 17.3455 1.70246 18.9125C2.06726 19.777 2.93081 20.3257 3.86919 20.3257H23.764C24.7011 20.3257 25.5645 19.7789 25.929 18.9156Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.12253"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M12.2837 17.1461L20.5265 10.1167"
        stroke="var(--card)"
        strokeWidth="1.12253"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 3.svg — two arrows chasing each other. */
export function RetentionIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 22 21"
      fill="currentColor"
      className={cn(base, className)}
      aria-hidden
    >
      <path d="M18.1684 8.41182C19.1001 8.61614 19.9319 8.4814 20.6471 7.85303C21.5367 10.8427 20.9288 15.304 17.4493 18.3857C13.8471 21.576 8.19163 22.0103 4.02322 18.7759C3.71724 19.0831 3.40861 19.3931 3.09989 19.703C3.04385 19.7592 2.98722 19.8149 2.93124 19.8712C2.81244 19.9907 2.65435 20.0454 2.51828 19.9633C2.41022 19.8982 2.29559 19.7613 2.27781 19.6423C2.14898 18.7793 2.04342 17.9128 1.93166 17.0472C1.85038 16.4177 1.77307 15.7877 1.6897 15.1585C1.64309 14.8067 1.81291 14.6118 2.16758 14.6547C3.25612 14.7864 4.34338 14.9286 5.43109 15.0671C5.83176 15.1181 6.23206 15.1722 6.63307 15.2204C6.81158 15.2418 6.95096 15.3082 7.01364 15.49C7.07379 15.6644 7.00513 15.7987 6.88517 15.9183C6.55296 16.2492 6.22064 16.5801 5.88745 16.9119C7.71392 18.357 10.8342 19.0245 13.6815 17.7672C15.4736 16.9758 16.808 15.6906 17.6577 13.9246C18.5026 12.1684 18.6455 10.3334 18.1684 8.41182Z" />
      <path d="M2.83961 12.5869C1.90984 12.3832 1.07853 12.5189 0.363931 13.151C-0.534914 10.0496 0.125651 5.66326 3.53714 2.64599C5.43299 0.969214 7.65846 0.0804804 10.1927 0.00506468C12.7169 -0.070055 14.9768 0.691409 16.99 2.22621C17.3376 1.87724 17.6816 1.53784 18.0181 1.19106C18.154 1.05098 18.2998 0.960664 18.4972 1.02716C18.6897 1.09202 18.7364 1.25534 18.7596 1.43703C18.9494 2.9248 19.1433 4.41205 19.3327 5.89988C19.3699 6.19158 19.1804 6.38389 18.8745 6.3478C18.0008 6.24473 17.1284 6.13012 16.2557 6.01877C15.6404 5.94026 15.0258 5.85652 14.4101 5.78192C14.2255 5.75955 14.0729 5.70714 14.0032 5.51646C13.9323 5.32252 14.0236 5.18511 14.1545 5.05612C14.4832 4.7323 14.8092 4.40571 15.1377 4.07872C12.9358 2.41253 9.55034 1.97957 6.68291 3.54884C3.90955 5.06661 1.82962 8.51296 2.83961 12.5869Z" />
    </svg>
  );
}

/** 4.svg — a row of peaks. The file's box is 77 wide for 56 of art;
 * the box is the art's, so the mark sits where the label starts. */
export function HarshnessIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 56 21"
      fill="currentColor"
      className={cn(base, className)}
      aria-hidden
    >
      <path d="M56 21L43.8835 5.3809L35.8714 17.2844L27.8593 5L19.8474 17.2844L11.8353 5L0 21H56Z" />
    </svg>
  );
}

/** 5.svg — waves above and below a dot. */
export function VibrationIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 20 22"
      fill="none"
      className={cn(base, className)}
      aria-hidden
    >
      <g stroke="currentColor" strokeLinejoin="round">
        <path d="M18.9775 0.462891L15.8731 3.52356L12.7687 0.500146L9.66428 3.52356L6.55988 0.500146L3.45548 3.4298L0.351074 0.462891" />
        <path d="M18.9775 3.87158L15.8731 6.93226L12.7687 3.90884L9.66428 6.93226L6.55988 3.90884L3.45548 6.83849L0.351074 3.87158" />
        <path d="M0.351074 20.8048L3.45548 17.7441L6.55988 20.7676L9.66428 17.7441L12.7687 20.7676L15.8731 17.8379L18.9775 20.8048" />
        <path d="M0.351074 17.5783L3.45548 14.5176L6.55988 17.541L9.66428 14.5176L12.7687 17.541L15.8731 14.6113L18.9775 17.5783" />
        <path
          d="M9.66435 12.7467C10.7243 12.7467 11.5836 11.8874 11.5836 10.8274C11.5836 9.76747 10.7243 8.9082 9.66435 8.9082C8.60439 8.9082 7.74512 9.76747 7.74512 10.8274C7.74512 11.8874 8.60439 12.7467 9.66435 12.7467Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

/** 6.svg — a ball coming to rest, its bounces as fading rings. */
export function SettleIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 37 21"
      fill="none"
      className={cn(base, className)}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="1.39196"
        strokeMiterlimit="10"
        strokeLinecap="round"
      >
        <path d="M0.696289 20.3042H35.4953" />
        <path
          d="M28.1683 13.9768C31.8357 13.9768 34.8088 11.0037 34.8088 7.33628C34.8088 3.66885 31.8357 0.695801 28.1683 0.695801C24.5009 0.695801 21.5278 3.66885 21.5278 7.33628C21.5278 11.0037 24.5009 13.9768 28.1683 13.9768Z"
          fill="currentColor"
        />
        <path d="M21.3578 0.695801C17.6903 0.695801 14.7173 3.66884 14.7173 7.33628C14.7173 11.0037 17.6903 13.9768 21.3578 13.9768" />
        <path d="M14.5472 0.695801C10.8798 0.695801 7.90674 3.66884 7.90674 7.33628C7.90674 11.0037 10.8798 13.9768 14.5472 13.9768" />
        <path d="M7.73667 0.695801C4.06924 0.695801 1.09619 3.66884 1.09619 7.33628C1.09619 11.0037 4.06923 13.9768 7.73667 13.9768" />
      </g>
    </svg>
  );
}

/** 7.svg — a burst. */
export function ImpactIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 23 23"
      fill="none"
      className={cn(base, className)}
      aria-hidden
    >
      <path
        d="M11.25 0.75L12.7848 7.54465L18.6746 3.82538L14.9554 9.71519L21.75 11.25L14.9554 12.7848L18.6746 18.6746L12.7848 14.9554L11.25 21.75L9.71519 14.9554L3.82538 18.6746L7.54465 12.7848L0.75 11.25L7.54465 9.71519L3.82538 3.82538L9.71519 7.54465L11.25 0.75Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
