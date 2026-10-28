"use client";

import { cn } from "@/lib/utils";

/**
 * The bike as the IMU SAG reads it (the supplied illustration, 2026-10-27):
 * a dashed ground, the bike standing on it, and a line across its middle
 * per reading, tilted by the rider-sag pitch — rising towards the fork, on
 * the right, when the nose is up — and sunk by the frame's mean drop, with
 * the real angle on a pill and the two ends' heights marked. Drawn by the
 * Bike Setup's geometry card (one mint line) and by the setup comparison's
 * Balance (a line per setup, in its colour; 2026-10-28).
 */

/** The bike's width in the illustration, px, and where it stands: the art
 * is 101 × 61, so at 176 px wide it is ~106 px tall. */
const SAG_ART_W = 176;
const SAG_GROUND_PX = 22;
/** The line sits at the bike's vertical middle (by request, 2026-10-27;
 * it was at the hubs, low in the drawing): the art stands 1 px into the
 * ground and is SAG_ART_W × 61/101 tall. */
const SAG_LINE_PX = SAG_GROUND_PX - 1 + Math.round((SAG_ART_W * 61) / 101 / 2);
/** 1.9° is a line nobody sees tilt across 300 px: the drawing exaggerates
 * the angle, within a bound, and the pill says the real one. */
const SAG_TILT_GAIN = 2.5;
const SAG_TILT_MAX_DEG = 12;
export const SAG_MINT = "#7BF1B8";
/** The art's hubs are this far apart at SAG_ART_W, px (x 17.97 and 82.91
 * of 101): the wheelbase the drops are scaled by. */
const SAG_HUBS_PX = ((82.91 - 17.97) / 101) * SAG_ART_W;
/** The frame never sinks out of the drawing, px. */
const SAG_DROP_MAX_PX = 28;

export interface BikeBalanceLine {
  key: string;
  /** The real pitch, nose up positive, degrees. */
  pitchDeg: number;
  /** The two ends' drops, mm, and the wheelbase they are over — the line
   * sinks by their mean, on the tilt's scale; without them it only tilts. */
  drops?: { frontMm: number; rearMm: number; wheelbaseMm: number } | null;
  colour: string;
  /** What the pill says. */
  label: string;
  /** The pill's ink: dark on a light colour, white on a strong one. */
  labelInk?: string;
}

/** A thin double-headed arrow of any height, px. */
function HeightArrow({
  height,
  className,
  style,
}: {
  height: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={12}
      height={height}
      viewBox={`0 0 12 ${height}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d={`M6 1V${height - 1}`} />
      <path d="M2 5L6 1L10 5" />
      <path d={`M2 ${height - 5}L6 ${height - 1}L10 ${height - 5}`} />
    </svg>
  );
}

export function BikeBalanceArt({
  BikeMark,
  lines,
  className,
}: {
  BikeMark: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** None: the ground and the bike alone. */
  lines: BikeBalanceLine[];
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("relative h-[170px] w-full max-w-[320px]", className)}
    >
      {/* The ground. */}
      <div
        className="absolute inset-x-0 border-t-2 border-dashed border-foreground/15"
        style={{ bottom: SAG_GROUND_PX }}
      />
      {/* The two ends' heights, ground to the line — drawn here and not
          an icon, because an icon cannot stretch without its stroke
          stretching too. Only with a reading to show (2026-10-28). */}
      {lines.length > 0 &&
        (["left-3", "right-3"] as const).map((side) => (
          <HeightArrow
            key={side}
            className={cn("absolute text-foreground/25", side)}
            height={SAG_LINE_PX - SAG_GROUND_PX}
            style={{ bottom: SAG_GROUND_PX }}
          />
        ))}
      {/* A 3 px line on screen whatever the size it is drawn at (by
          request, 2026-09-11), the event cards' way. The art faces right,
          towards the fork (2026-10-27). */}
      <BikeMark
        className="absolute left-1/2 h-auto -translate-x-1/2 text-foreground [&_*]:[stroke-width:3px] [&_*]:[vector-effect:non-scaling-stroke]"
        style={{ width: SAG_ART_W, bottom: SAG_GROUND_PX - 1 }}
      />
      {lines.map((line, i) => {
        const drawn = Math.max(
          -SAG_TILT_MAX_DEG,
          Math.min(SAG_TILT_MAX_DEG, line.pitchDeg * SAG_TILT_GAIN),
        );
        const sinkPx = line.drops
          ? Math.min(
              SAG_DROP_MAX_PX,
              Math.max(
                0,
                ((line.drops.frontMm + line.drops.rearMm) / 2) *
                  (SAG_HUBS_PX / line.drops.wheelbaseMm) *
                  SAG_TILT_GAIN,
              ),
            )
          : 0;
        // Several lines spread their pills along the line, so two close
        // readings do not stack their labels on one spot.
        const at = lines.length === 1 ? 50 : 22 + (56 * i) / (lines.length - 1);
        return (
          // The line at the bike's middle, lowered by the frame's sink and
          // turned by the drawn angle about the middle; nose up turns it
          // anticlockwise. A box of no height, so its middle is the line's.
          <div
            key={line.key}
            className="absolute inset-x-0 h-0 transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{
              bottom: SAG_LINE_PX,
              transform: `translateY(${sinkPx}px) rotate(${-drawn}deg)`,
            }}
          >
            <div
              className="absolute inset-x-0 -top-px h-0.5"
              style={{ backgroundColor: line.colour }}
            />
            <span
              className="absolute top-0 -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium whitespace-nowrap tabular-nums"
              style={{
                left: `${at}%`,
                backgroundColor: line.colour,
                color: line.labelInk ?? "#101014",
              }}
            >
              {line.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
