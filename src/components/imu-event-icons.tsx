import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { SnapshotKind } from "@/lib/imu/snapshot";

/**
 * Icons for the IMU details panel.
 *
 * All supplied art. The source files paint in white for a dark tile; here
 * white becomes currentColor so each glyph follows whatever surface it sits
 * on. The curves' secondary arrows keep their literal #434343 — they are the
 * branches NOT taken, and want to stay dimmer than the one that was.
 *
 * The impact is the one kind still borrowing lucide.
 */

interface IconProps {
  className?: string;
}

/** The clock in the chart's time pill. */
export function ImuClockIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5.33467e-07 4.92304C0.00126179 2.19966 2.20771 -0.00951569 4.91694 3.08238e-05C7.65078 0.00966315 9.83941 2.20109 9.8405 4.92988C9.84158 7.65351 7.63484 9.84119 4.88808 9.83951C2.19736 9.83787 -0.00125032 7.62648 5.33467e-07 4.92304ZM4.43134 3.44164H4.43057C4.43057 3.90668 4.43568 4.3718 4.42817 4.83671C4.42497 5.0353 4.48841 5.19072 4.63043 5.32916C4.98818 5.67788 5.33844 6.03428 5.69183 6.38749C5.81415 6.50975 5.93278 6.63606 6.06015 6.75283C6.33425 7.00412 6.76438 6.8879 6.86627 6.53498C6.92374 6.33591 6.86387 6.16632 6.71775 6.0211C6.30886 5.61471 5.90313 5.20513 5.49345 4.79954C5.43467 4.74136 5.40501 4.68422 5.40791 4.599C5.41445 4.40706 5.40997 4.21474 5.40996 4.02258C5.40995 3.35001 5.40868 2.67743 5.41087 2.00487C5.41137 1.85072 5.37148 1.71528 5.25649 1.61024C5.10278 1.46982 4.92193 1.43697 4.73205 1.51544C4.54165 1.59412 4.43401 1.74506 4.4325 1.95432C4.42891 2.45007 4.43134 2.94586 4.43134 3.44164Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** The bike alone (supplied art, Bikes_2/enduro.svg, 2026-09-27): the
 * event card's mark when the cursor is in no event — it was Lucide's.
 * Drawn wider than tall, so it fits the tile's square by its width; the
 * art's 4-unit line thickened to 7 so it reads at the tiles' weight. */
export function EnduroBikeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="-2 -2 105 65"
      fill="none"
      className={cn("overflow-visible", className)}
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 42.6422C2 51.4629 9.15063 58.6135 17.9714 58.6135C26.7921 58.6135 33.9427 51.4629 33.9427 42.6422C33.9427 33.8214 26.7921 26.6708 17.9714 26.6708C9.15063 26.6708 2 33.8214 2 42.6422Z" />
        <path d="M82.9061 58.6135C91.7268 58.6135 98.8773 51.4629 98.8773 42.6422C98.8773 33.8214 91.7268 26.6708 82.9061 26.6708C74.0853 26.6708 66.9347 33.8214 66.9347 42.6422C66.9347 51.4629 74.0853 58.6135 82.9061 58.6135Z" />
        <path d="M82.9061 42.9633L66.9347 4.55144L74.9204 2.00055" />
        <path d="M47.0562 42.395L34.5076 12.7922" />
        <path d="M47.0564 42.6422L69.7494 11.3212L47.0564 24.4803L47.5311 31.949" />
        <path d="M47.0566 42.6422H17.9716L40.6014 28.2235" />
        <path d="M28.5637 12.7261H43.5074" />
      </g>
    </svg>
  );
}

/** A jump: the lip and the arrow off it (supplied art, IMU_v3, 2026-09-28). */
export function JumpIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 22 23"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0.75 13.1963L15.2362 1.66272"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.1558 0.75H15.7904V4.58698"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.99072 21.7777L20.8291 8.51965V21.7777H1.99072Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A bike off a ledge — the drop's landing is all there is to see. */
export function DropIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 19 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9.86632 5.16368C10.9321 5.16368 11.7961 4.29968 11.7961 3.23388C11.7961 2.16808 10.9321 1.30408 9.86632 1.30408C8.80053 1.30408 7.93652 2.16808 7.93652 3.23388C7.93652 4.29968 8.80053 5.16368 9.86632 5.16368Z"
        stroke="currentColor"
        strokeWidth="0.82"
        strokeLinejoin="round"
      />
      <path
        d="M15.7484 7.97496C16.8142 7.97496 17.6782 7.11095 17.6782 6.04516C17.6782 4.97936 16.8142 4.11536 15.7484 4.11536C14.6826 4.11536 13.8186 4.97936 13.8186 6.04516C13.8186 7.11095 14.6826 7.97496 15.7484 7.97496Z"
        stroke="currentColor"
        strokeWidth="0.82"
        strokeLinejoin="round"
      />
      <path
        d="M9.86633 3.23389L13.9557 5.18837"
        stroke="currentColor"
        strokeWidth="0.82"
        strokeLinejoin="round"
      />
      <path
        d="M14.8348 0.369873L15.7863 0.824603C16.0056 0.929441 16.1381 1.15818 16.1199 1.40061L15.7755 5.98845"
        stroke="currentColor"
        strokeWidth="0.82"
        strokeLinejoin="round"
      />
      <path
        d="M12.8237 4.57771L13.1146 1.12451"
        stroke="currentColor"
        strokeWidth="0.82"
        strokeLinejoin="round"
      />
      <path
        d="M12.0895 0.689331L14.2001 1.69808"
        stroke="currentColor"
        strokeWidth="0.82"
        strokeLinejoin="round"
      />
      <path
        d="M12.9908 2.58838L15.9441 3.99988"
        stroke="currentColor"
        strokeWidth="0.82"
        strokeLinejoin="round"
      />
      <path
        d="M0.410034 3.63159L8.88117 6.94915L5.31912 13.8908V15.5271H0.512013L0.410034 3.63159Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.82"
        strokeLinejoin="round"
      />
      <path
        d="M13.501 15.5271V12.1349L18.4101 13.8908V15.5271H13.501Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.82"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A bike over broken ground (supplied art, IMU_v3, 2026-09-28). */
export function RoughSectionIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 29 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0.75 22.3771L5.29998 15.5584L9.84997 22.2941L14.4 15.5583L18.9499 22.2941L23.4999 15.7672L28.0499 22.3771"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.76221 9.08973C4.76221 10.8997 6.22947 12.367 8.03944 12.367C9.8494 12.367 11.3167 10.8997 11.3167 9.08973C11.3167 7.27977 9.8494 5.8125 8.03944 5.8125C6.22947 5.8125 4.76221 7.27977 4.76221 9.08973Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
      />
      <path
        d="M21.3637 12.367C23.1736 12.367 24.6409 10.8997 24.6409 9.08973C24.6409 7.27977 23.1736 5.8125 21.3637 5.8125C19.5537 5.8125 18.0864 7.27977 18.0864 9.08973C18.0864 10.8997 19.5537 12.367 21.3637 12.367Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
      />
      <path
        d="M21.3637 9.15558L18.0864 1.27367L19.725 0.750244"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.007 9.03894L11.4321 2.9646"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.0073 9.08961L18.6638 2.66272L14.0073 5.3629L14.1047 6.89542"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.0071 9.08973H8.03906L12.6826 6.1311"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.2129 2.95105H13.2793"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A brake disc and its caliper (supplied art, IMU_v3, 2026-09-28). */
export function BrakingIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 23 23"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M11.2437 18.2121C15.0922 18.2121 18.212 15.0923 18.212 11.2438C18.212 7.39532 15.0922 4.27551 11.2437 4.27551C7.3952 4.27551 4.27539 7.39532 4.27539 11.2438C4.27539 15.0923 7.3952 18.2121 11.2437 18.2121Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M11.2438 13.9099C12.7162 13.9099 13.9099 12.7162 13.9099 11.2438C13.9099 9.7713 12.7162 8.57764 11.2438 8.57764C9.7713 8.57764 8.57764 9.7713 8.57764 11.2438C8.57764 12.7162 9.7713 13.9099 11.2438 13.9099Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M11.2438 22.0496C17.2117 22.0496 22.0496 17.2117 22.0496 11.2438C22.0496 5.27592 17.2117 0.437988 11.2438 0.437988C5.27592 0.437988 0.437988 5.27592 0.437988 11.2438C0.437988 17.2117 5.27592 22.0496 11.2438 22.0496Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M10.3275 18.2121L9.01221 12.7018"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M13.6308 10.0733L12.2393 4.24353"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M4.39893 10.0983L10.7064 8.63196"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M12.9893 13.2676L18.0615 12.0569"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M5.64893 15.2922L8.85706 10.0723"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M13.9097 11.2439L16.7475 6.82227"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M7.1626 5.55884L12.7725 9.00665"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M11.2437 13.91L15.6081 16.6744"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M7.02148 21.206C7.21849 19.9861 7.41549 18.7662 7.6125 17.5463"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M14.7695 5.23381L15.4667 0.91687"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M1.09961 6.83887C2.40022 7.0489 4.08713 7.25894 5.38774 7.46898"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M17.583 14.6694C18.8516 14.8743 20.1201 15.0792 21.3886 15.284"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M1.08496 15.2488C2.067 14.5399 3.48325 13.5681 4.46528 12.8591"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M17.9409 9.31713C18.9828 8.56499 20.3613 7.62604 21.4032 6.8739"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M7.05664 0.902344L9.70176 4.56633"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M12.9897 17.9916C13.6987 18.9736 14.7226 20.2384 15.4316 21.2204"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M21.9217 5.91994L18.625 4.57101C17.9476 4.29388 17.2056 4.79203 17.2056 5.52385V16.4364C17.2056 17.1682 17.9476 17.6663 18.625 17.3892L21.9217 16.0403C22.3086 15.882 22.5614 15.5055 22.5614 15.0874V6.87278C22.5614 6.45476 22.3086 6.07824 21.9217 5.91994Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The same junction, right-hand branch taken — the left one mirrored. */
export function CurveRightIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 26 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(25.56 0) scale(-1 1)">
        <path
          d="M22.9985 4.13269L24.7151 5.84929C24.8769 6.01105 24.8769 6.27331 24.7151 6.43506L22.9985 8.15167"
          stroke="#6A6A6A"
          strokeWidth="1.45388"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2.56497 8.15167L0.848368 6.43506C0.686612 6.27331 0.686612 6.01105 0.848368 5.84929L2.56497 4.13269"
          stroke="currentColor"
          strokeWidth="1.45388"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.7725 2.56485L12.4891 0.848245C12.6508 0.68649 12.9131 0.68649 13.0748 0.848245L14.7914 2.56485"
          stroke="#6A6A6A"
          strokeWidth="1.45388"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M24.3046 6.06335C19.1968 6.06335 15.0562 10.204 15.0562 15.3118V18.549"
          stroke="#6A6A6A"
          strokeWidth="1.45388"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M1.24023 6.06335C6.34803 6.06335 10.4887 10.204 10.4887 15.3118V18.549"
          stroke="currentColor"
          strokeWidth="1.45388"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.7793 18.549V1.64575"
          stroke="#6A6A6A"
          strokeWidth="1.45388"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** A junction, left-hand branch taken (supplied art, IMU_v3, 2026-09-28): the taken branch in currentColor, the two not taken in the art's fixed grey, which reads on the dark tile and on white alike. */
export function CurveLeftIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 26 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M22.9985 4.13269L24.7151 5.84929C24.8769 6.01105 24.8769 6.27331 24.7151 6.43506L22.9985 8.15167"
        stroke="#6A6A6A"
        strokeWidth="1.45388"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.56497 8.15167L0.848368 6.43506C0.686612 6.27331 0.686612 6.01105 0.848368 5.84929L2.56497 4.13269"
        stroke="currentColor"
        strokeWidth="1.45388"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.7725 2.56485L12.4891 0.848245C12.6508 0.68649 12.9131 0.68649 13.0748 0.848245L14.7914 2.56485"
        stroke="#6A6A6A"
        strokeWidth="1.45388"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24.3046 6.06335C19.1968 6.06335 15.0562 10.204 15.0562 15.3118V18.549"
        stroke="#6A6A6A"
        strokeWidth="1.45388"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.24023 6.06335C6.34803 6.06335 10.4887 10.204 10.4887 15.3118V18.549"
        stroke="currentColor"
        strokeWidth="1.45388"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.7793 18.549V1.64575"
        stroke="#6A6A6A"
        strokeWidth="1.45388"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** An impact: the burst (supplied art, IMU_v3, 2026-09-28) — it had been Lucide's bolt. */
export function ImpactIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 19 19"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9.49987 0.522583L10.8121 6.33195L15.8479 3.152L12.6679 8.18774L18.4773 9.49999L12.6679 10.8122L15.8479 15.848L10.8121 12.668L9.49987 18.4774L8.18762 12.668L3.15188 15.848L6.33182 10.8122L0.522461 9.49999L6.33182 8.18774L3.15188 3.152L8.18762 6.33195L9.49987 0.522583Z"
        stroke="currentColor"
        strokeWidth="1.35951"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A crash: the warning triangle (supplied art, IMU_v3, 2026-09-28) — it had been Lucide's. */
export function CrashIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 22 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9.67463 1.42931L0.930196 16.8569C0.416819 17.7626 1.05854 18.8948 2.0853 18.8948H19.5742C20.6009 18.8948 21.2426 17.7626 20.7293 16.8569L11.9848 1.42931C11.4714 0.523565 10.188 0.523565 9.67463 1.42931Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10.8301 4.77661V12.8558"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.8301 14.7849V16.3734"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A Snapshot's kind as its event's icon. A curve Snapshot does not keep
 * its direction, so every curve wears the right-hand one. */
const SNAPSHOT_KIND_ICON: Record<SnapshotKind, ComponentType<IconProps>> = {
  curve: CurveRightIcon,
  jump: JumpIcon,
  rough_section: RoughSectionIcon,
  braking: BrakingIcon,
};

/** A Snapshot's mark: its event's icon, white on a black rounded square —
 * the report's Snapshot cards and the Snapshot page's header wear it (by
 * request, 2026-09-14: the event's icon, not the Snapshot glyph). */
export function SnapshotKindMark({
  kind,
  className,
}: {
  kind: SnapshotKind;
  className?: string;
}) {
  const Icon = SNAPSHOT_KIND_ICON[kind];
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-foreground text-background",
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
