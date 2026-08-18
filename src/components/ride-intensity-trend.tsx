"use client";

import { useRef, useState } from "react";
import { CURVE_BOX, INTENSITY_BAR_CLASS, curveCoords, curvePath } from "@/components/ride-intensity-visuals";
import { rideIntensityBand } from "@/lib/ride-stress";
import { cn } from "@/lib/utils";

export interface TrendPoint {
  /** Already formatted for display — the dictionary never crosses into the
   * client bundle, here as everywhere else on this page. */
  label: string;
  value: number;
}

/**
 * The 30-day intensity curve with a scrubber.
 *
 * The vertical rule starts at the last day, which is the value the rest of the
 * page is talking about, and can be dragged back through the month. The number
 * under the title follows it: reading a day means putting the line on it, so
 * the line and the readout are the same gesture rather than a line plus a
 * tooltip that has to be chased.
 *
 * touch-action is pan-y and not none. A scrubber wants the horizontal axis,
 * but this chart sits in the middle of a long scrolling page, and taking the
 * vertical axis too would mean a thumb landing here could not scroll past it.
 * The browser keeps vertical panning and sends a pointercancel when it takes
 * over, which releases the drag.
 */
export function RideIntensityTrend({
  points,
  title,
  axisTitle,
  axisDay,
  scrubLabel,
}: {
  points: TrendPoint[];
  title: string;
  axisTitle: string;
  axisDay: string;
  scrubLabel: string;
}) {
  const [active, setActive] = useState(points.length - 1);
  const [dragging, setDragging] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);

  if (points.length < 2) return null;

  const { width: W, height: H, pad: PAD } = CURVE_BOX;
  const coords = curveCoords(points.map((p) => p.value));
  const path = curvePath(coords);
  const index = Math.min(Math.max(active, 0), points.length - 1);
  const [markerX, markerY] = coords[index];
  const leftPercent = (markerX / W) * 100;

  // The band of the day the rule is on, not of today — the whole point of
  // moving the rule is to read that day, and a marker still wearing today's
  // colour would be answering a question nobody asked. At rest the rule sits
  // on the last day, so this is today's band until someone moves it.
  const band = rideIntensityBand(points[index].value);

  function indexFromClientX(clientX: number) {
    const el = plotRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    // Back through the same stretch the viewBox went through: the plot is
    // W units wide however many pixels it ended up occupying.
    const viewBoxX = ((clientX - rect.left) / rect.width) * W;
    const step = (W - PAD * 2) / (points.length - 1);
    const next = Math.round((viewBoxX - PAD) / step);
    setActive(Math.min(Math.max(next, 0), points.length - 1));
  }

  /**
   * Lifting the finger puts the rule back on today.
   *
   * Scrubbing is a peek, not a setting: everything else in this section — the
   * headline number, the band, the colour — describes the bike now, and a rule
   * left parked on the 3rd of August would leave the whole card quietly
   * describing a Tuesday three weeks ago to anyone who walked away and came
   * back. Keyboard use is deliberately not reset: arrow keys are someone
   * stepping through days on purpose, and there is no release to hang it on.
   */
  function release() {
    setDragging(false);
    setActive(points.length - 1);
  }

  // Near the ends the label would hang off the plot, so it stops centring and
  // tucks against the edge it is nearest.
  const labelTransform = leftPercent > 85 ? "translateX(-100%)" : leftPercent < 15 ? "none" : "translateX(-50%)";

  return (
    <div>
      {/* 14px where the other section headings are 16: this one is a caption
          over a number, not a heading standing on its own, and at the same
          size it competed with the reading underneath it. */}
      <h2 className="flex items-center gap-2.5 font-display text-sm leading-tight font-medium">
        <span aria-hidden className={cn("h-9 w-1 shrink-0 rounded-full", INTENSITY_BAR_CLASS[band])} />
        <span>
          {title}
          {/* The reading keeps its weight while the heading gives some up —
              the number is what the section is for. */}
          <span className="block tabular-nums text-lg font-bold">{Math.round(points[index].value)}</span>
        </span>
      </h2>

      {/* No gaps anywhere in this row: the axis furniture sits against the
          plot it belongs to. What cost width before was the spacing, not the
          sideways text, which is only as wide as a 10px glyph is tall. */}
      <div className="mt-4 flex">
        <div className="flex shrink-0">
          <span
            aria-hidden
            className="self-center text-[10px] text-muted-foreground"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {axisTitle}
          </span>
          {/* Sized by "100" rather than pinned to a round number of pixels:
              the fixed 24px column left a strip of nothing down the left of
              the plot, because "0" is right-aligned and one glyph wide. */}
          <div className="flex flex-col justify-between pt-4 pb-5 pr-1 text-right text-[10px] text-muted-foreground">
            <span>100</span>
            <span>0</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {/* The day the rule is on, above the rule. */}
          <div className="relative h-4">
            <span
              className="absolute text-[10px] font-semibold whitespace-nowrap"
              style={{ left: `${leftPercent}%`, transform: labelTransform }}
            >
              {points[index].label}
            </span>
          </div>

          <div
            ref={plotRef}
            role="slider"
            aria-label={scrubLabel}
            aria-valuemin={0}
            aria-valuemax={points.length - 1}
            aria-valuenow={index}
            aria-valuetext={`${points[index].label}: ${Math.round(points[index].value)}`}
            tabIndex={0}
            // 300px tall against a 96-unit viewBox: preserveAspectRatio is
            // "none", so the plot stretches to whatever height it is given
            // and the stroke stays a hairline through vectorEffect. Every
            // position on it is a ratio of the viewBox, so nothing else moves.
            className="relative h-[300px] w-full cursor-ew-resize touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            // Read the position FIRST, then try to capture. setPointerCapture
            // throws if the pointer is not currently active, and doing it
            // first meant one throw took the whole gesture down with it —
            // including the tap, which needs no capture at all. Capture is an
            // improvement (the drag survives leaving the box), never a
            // precondition, so it is best-effort and the drag state is the
            // component's own rather than read back off the DOM.
            onPointerDown={(event) => {
              indexFromClientX(event.clientX);
              setDragging(true);
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // No capture: pointermove still arrives while over the plot.
              }
            }}
            onPointerMove={(event) => {
              if (!dragging) return;
              indexFromClientX(event.clientX);
            }}
            onPointerUp={(event) => {
              release();
              try {
                event.currentTarget.releasePointerCapture(event.pointerId);
              } catch {
                // Nothing was captured.
              }
            }}
            // The browser takes the gesture over when it decides the finger is
            // scrolling the page, and says so with pointercancel. Without this
            // the chart would keep scrubbing to wherever the page scrolled to.
            onPointerCancel={release}
            onLostPointerCapture={release}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setActive((i) => Math.max(0, i - 1));
              else if (event.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, i + 1));
              else if (event.key === "Home") setActive(0);
              else if (event.key === "End") setActive(points.length - 1);
              else return;
              event.preventDefault();
            }}
          >
            {/* The gridlines are HTML and not <line>s: preserveAspectRatio
                "none" stretches the viewBox horizontally, and while
                vectorEffect keeps the stroke a hairline it does not keep the
                dash pattern — at desktop width the dashes came out four times
                longer than on a phone. A border-dashed div is the same line at
                every width, and the marker below is a div for the matching
                reason: a <circle> in a stretched viewBox is an ellipse. */}
            {[0, 25, 50, 75, 100].map((line) => (
              <div
                key={line}
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-border"
                style={{ top: `${((H - PAD - (line / 100) * (H - PAD * 2)) / H) * 100}%` }}
              />
            ))}

            <svg viewBox={`0 0 ${W} ${H}`} className="relative h-full w-full" preserveAspectRatio="none" aria-hidden>
              <path
                d={path}
                fill="none"
                // The line stays foreground whatever band the bike is in: it
                // is the data, not the classification, and two of the four
                // band colours are pale enough that a curve drawn in them
                // would be a curve nobody can see. The band shows up on the
                // marker and the rule beside the title instead.
                className="text-foreground"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                // preserveAspectRatio="none" stretches the stroke with the
                // box, so the width is pinned to device pixels instead.
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-muted-foreground/60"
              style={{ left: `${leftPercent}%` }}
            />
            <span
              aria-hidden
              className={cn(
                // The band's colour, matching the rule beside the title: the
                // marker is the one place on the chart that says which band
                // the day under it belongs to. The ring keeps a pale band
                // separated from the black line it sits on.
                "pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                INTENSITY_BAR_CLASS[band]
              )}
              style={{ left: `${leftPercent}%`, top: `${(markerY / H) * 100}%` }}
            />
          </div>

          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
            <span>{points[0].label}</span>
            <span>{axisDay}</span>
            <span>{points[points.length - 1].label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
