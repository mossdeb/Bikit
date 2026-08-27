"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImuEvent } from "@/lib/imu/format";
import { formatSessionTime, nearestSampleIndex } from "@/lib/imu/derive";
import {
  lowerBoundIndex,
  minMaxEnvelope,
  upperBoundIndex,
} from "@/lib/imu/downsample";
import { ImuClockIcon } from "@/components/imu-event-icons";

/** The plot's drawing box. Stretched to the container (preserveAspectRatio
 * "none"), so every position is a ratio of these — the trend chart's idiom. */
const W = 800;
const H = 260;
const PAD_Y = 14;

/** Paint order in the event lane: the longest context first, the sharpest
 * last, so an impact tick sits on top of the rough section it happened in. */
const STRIP_PAINT_ORDER: Record<ImuEvent["kind"], number> = {
  rough_section: 0,
  braking: 1,
  curve: 2,
  jump: 3,
  drop: 3,
  impact: 4,
};

/** How tall the event-name tabs are, px.
 *
 * One number for two things that must agree: the tabs are pinned to it, and
 * the impact arrows start just under it. Left to itself the tab measured
 * 16.5px — `py-0.5` around 10px/tight text — and the arrows sat at 2px,
 * which put them straight through any tab they shared an instant with. */
const EVENT_TAB_H = 17;

/** The gap between the plot's top edge and the tabs, px. They used to hang
 * from that edge — square on top, rounded below; now they float clear of it,
 * rounded on the four corners. Everything that has to clear a tab measures
 * from `EVENT_TAB_TOP + EVENT_TAB_H`, never from the height alone. */
const EVENT_TAB_TOP = 4;

/** Envelope buckets across the visible window. ~2 points per bucket keeps the
 * polyline near 800 points whatever the recording length; below ~2 samples
 * per bucket the raw samples are drawn as they are. */
const BUCKETS = 400;

/** The pan scrollbar under the chart — built 2026-08-27 to test panning a
 * zoomed window by hand, then shelved BY REQUEST once the real bug turned out
 * to be the per-window y scale (fixed in seriesRanges): kept off, not deleted,
 * in case it earns its place later. Flip to true and the whole thing is back —
 * everything it owns is gated on this one constant. */
const PAN_BAR_ENABLED = false;

export interface ImuChartSeries {
  id: string;
  label: string;
  /** Stroke color, fixed in both themes — lab palette, not design system. */
  color: string;
  values: ArrayLike<number>;
}

/**
 * The interactive session plot.
 *
 * Fully controlled: the window (zoom) and cursor live in the parent, this
 * component turns them into pixels and gestures back into times. Each series
 * is normalized to its own min/max over the WHOLE recording — G forces and
 * °/s share one plot only as shapes, and the details panel is where exact
 * numbers live. Session-wide and not the visible window's, so panning and
 * zooming never re-stretch a trace (see seriesRanges).
 *
 * Gestures: hover or touch-drag scrubs the cursor (touch-action is pan-y, so
 * a thumb can still scroll past the chart — the browser sends pointercancel
 * when it takes the gesture, same as the Ride Load trend). A mouse drag
 * paints a selection and zooms into it on release; a drag under the click
 * threshold is a click, which just places the cursor. Two fingers pinch:
 * pan-y permits vertical panning only, so the browser has no claim on a
 * spreading gesture and both pointers keep streaming — the time under the
 * fingers' midpoint stays anchored while the window stretches around it,
 * which also makes moving both fingers together a pan.
 */
export function ImuChart({
  tMs,
  series,
  events,
  eventKinds,
  windowMs,
  fullMs,
  cursorMs,
  onCursorChange,
  onWindowChange,
  showValues = true,
}: {
  tMs: Float64Array;
  series: ImuChartSeries[];
  events: ImuEvent[];
  eventKinds: ReadonlySet<string>;
  windowMs: [number, number];
  /** The whole recording — what a pinch out may grow the window back to. */
  fullMs: [number, number];
  cursorMs: number | null;
  onCursorChange: (ms: number) => void;
  onWindowChange: (windowMs: [number, number]) => void;
  /** Value pills where the cursor crosses each trace — toggleable, because
   * with several series on they cost real plot. */
  showValues?: boolean;
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  /**
   * The cursor pinned where it was left, so the details panel can be read
   * without the mouse having to stay perfectly still over the plot — a double
   * click locks, the next click anywhere lets it follow again.
   *
   * A double click and not a single one, because a single click already means
   * "read this instant" and scrubbing produces them by the dozen; pinning is
   * the deliberate act and deserves the deliberate gesture.
   *
   * Mouse-only, and by construction rather than by breakpoint: locking is
   * answering a problem that only hover has. A finger already leaves the
   * cursor where it lifted, so on touch this state is never entered.
   */
  const [locked, setLocked] = useState(false);
  /** What kind of pointer opened the last gesture — a `dblclick` carries no
   * pointerType of its own, and a double tap must not lock. */
  const lastPointerTypeRef = useRef<string>("mouse");
  const dragRef = useRef<{
    pointerId: number;
    startMs: number;
    isMouse: boolean;
    moved: boolean;
  } | null>(null);
  /** Every pointer currently down on the plot, by id — the pinch is read
   * from the first two. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    startDist: number;
    startSpan: number;
    anchorMs: number;
  } | null>(null);
  /** The pan scrollbar's drag — shelved with the bar, see PAN_BAR_ENABLED. */
  const panBarDragRef = useRef<{
    pointerId: number;
    startX: number;
    startFrom: number;
    trackWidth: number;
  } | null>(null);
  const [panBarActive, setPanBarActive] = useState(false);

  const [w0, w1] = windowMs;
  const span = Math.max(1, w1 - w0);
  const fullSpan = Math.max(1, fullMs[1] - fullMs[0]);
  // Never narrower than ~20 samples' worth of time, whatever the rate.
  const minSpan = Math.max(
    50,
    ((tMs[tMs.length - 1] - tMs[0]) / Math.max(1, tMs.length - 1)) * 20,
  );

  /**
   * Trackpad support. A macOS trackpad pinch arrives as a wheel event with
   * ctrlKey set (Chrome/Edge/Firefox; Safari's gesture events are not
   * handled) — zoom anchored at the pointer. A mostly-horizontal two-finger
   * swipe pans a zoomed window. A plain vertical wheel is left alone so the
   * page keeps scrolling. Attached natively with passive: false, because
   * preventDefault on a pinch-wheel is what stops the browser zooming the
   * whole page.
   */
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      if (event.ctrlKey) {
        event.preventDefault();
        const frac = Math.min(
          1,
          Math.max(0, (event.clientX - rect.left) / rect.width),
        );
        const anchorMs = w0 + frac * span;
        // deltaY < 0 (fingers apart) shrinks the window. exp keeps the zoom
        // rate proportional, so slow and fast pinches both feel right.
        const newSpan = Math.min(
          fullSpan,
          Math.max(minSpan, span * Math.exp(event.deltaY * 0.01)),
        );
        let from = anchorMs - frac * newSpan;
        from = Math.min(Math.max(from, fullMs[0]), fullMs[1] - newSpan);
        onWindowChange([from, from + newSpan]);
      } else if (
        Math.abs(event.deltaX) > Math.abs(event.deltaY) &&
        span < fullSpan
      ) {
        event.preventDefault();
        const shift = (event.deltaX / rect.width) * span;
        const from = Math.min(
          Math.max(w0 + shift, fullMs[0]),
          fullMs[1] - span,
        );
        onWindowChange([from, from + span]);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [w0, w1, span, fullSpan, minSpan, fullMs, onWindowChange]);

  /**
   * "Anywhere else" means anywhere, not just the plot: a press that lands on
   * the page outside the chart releases the cursor too. Captured on the way
   * down so it fires before whatever was clicked reacts, and skipped inside
   * the plot, where the press handler already deals with it.
   */
  useEffect(() => {
    if (!locked) return;
    const onDown = (event: PointerEvent) => {
      const el = plotRef.current;
      if (el && event.target instanceof Node && el.contains(event.target))
        return;
      setLocked(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [locked]);

  /**
   * Each series' range over the WHOLE recording — the y scale every window
   * is drawn against.
   *
   * It used to be the visible window's own min/max, and that is what made
   * the curves change shape while the window moved: the scale was re-derived
   * from whatever the window happened to contain, so panning past a peak
   * re-stretched the entire trace the instant the peak crossed the edge —
   * with the wheel drift, with the pan bar, with anything. Anchored to the
   * session, the trace is one fixed drawing seen through a moving window.
   * The price is stated: zoomed into a quiet stretch, small ripples stay
   * small instead of being amplified to fill the plot.
   */
  const seriesRanges = useMemo(
    () =>
      series.map((s) => {
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < s.values.length; i++) {
          const v = s.values[i];
          if (!Number.isFinite(v)) continue;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        return min <= max ? { min, max } : { min: 0, max: 0 };
      }),
    [series],
  );

  const paths = useMemo(() => {
    const i0 = Math.max(0, lowerBoundIndex(tMs, w0) - 1);
    const i1 = Math.min(tMs.length - 1, upperBoundIndex(tMs, w1) + 1);
    return series.map((s, si) => {
      const { min, max } = seriesRanges[si];
      const points = minMaxEnvelope(tMs, s.values, i0, i1, BUCKETS);
      if (points.length === 0)
        return { id: s.id, color: s.color, d: "", raw: false, min, max };
      const range = max - min || 1;
      let d = "";
      for (let i = 0; i < points.length; i++) {
        const x = ((points[i].tMs - w0) / span) * W;
        const y =
          H - PAD_Y - ((points[i].value - min) / range) * (H - PAD_Y * 2);
        d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      }
      // Raw when the window has fewer samples than two per bucket — the
      // envelope returns them untouched and the label below says so.
      const rawCount = i1 - i0 + 1;
      return {
        id: s.id,
        color: s.color,
        d,
        raw: rawCount <= BUCKETS * 2,
        min,
        max,
      };
    });
  }, [tMs, series, seriesRanges, w0, w1, span]);

  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        if (!eventKinds.has(event.kind)) return false;
        const [from, to] = eventSpan(event);
        return to >= w0 && from <= w1;
      }),
    [events, eventKinds, w0, w1],
  );

  /**
   * The hand's height over the plot, as a fraction — where the value pills
   * anchor. They used to sit on each trace's intersection, which meant the
   * whole stack jumped vertically with every sample the cursor crossed;
   * pinned to the pointer instead, they move only when the hand does, and
   * whoever is scrubbing is already looking exactly there. Kept after the
   * gesture ends (a lock, a lifted finger), so the reading stays where it
   * was left.
   */
  const [pointerYFrac, setPointerYFrac] = useState(0.5);

  function captureYFrac(clientY: number) {
    const el = plotRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) return;
    setPointerYFrac(
      Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    );
  }

  function msFromClientX(clientX: number): number | null {
    const el = plotRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return null;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return w0 + frac * span;
  }

  function endDrag(clientX: number) {
    const drag = dragRef.current;
    dragRef.current = null;
    setSelection(null);
    if (!drag) return;
    const ms = msFromClientX(clientX);
    if (ms == null) return;
    if (drag.isMouse && drag.moved) {
      const from = Math.min(drag.startMs, ms);
      const to = Math.max(drag.startMs, ms);
      // A selection narrower than ~1% of the window is a shaky click.
      if (to - from > span * 0.01) {
        onWindowChange([from, to]);
        return;
      }
    }
    onCursorChange(ms);
  }

  // The rule and its time pill snap to the nearest sample — the pointer's
  // continuous position read 24251.x ms while the details panel read the
  // sample at 24250, and two clocks for one cursor is a bug report waiting.
  const cursorIndex = cursorMs != null ? nearestSampleIndex(tMs, cursorMs) : null;
  const snappedCursorMs = cursorIndex != null ? tMs[cursorIndex] : null;
  const cursorPercent =
    snappedCursorMs != null && snappedCursorMs >= w0 && snappedCursorMs <= w1
      ? ((snappedCursorMs - w0) / span) * 100
      : null;
  const primary = paths[0];
  const rawResolution = paths.length > 0 && paths.every((p) => p.raw);

  return (
    // The chart reaches its container's edges — the full-bleed against the
    // card's padding now lives on the wrapper in the analysis page, which
    // breaks out and then splits the width with the map on desktop. The plot
    // and the event lane share one x scale, so they fill together; only the
    // axis labels keep an inset, so text does not kiss the edge.
    //
    // Relative so the cursor's badge could hang off the plot's top edge: the
    // plot itself is overflow-hidden (the event bands need clipping).
    <div className="relative">
      <div
        ref={plotRef}
        role="slider"
        aria-label="Cursor da sessão"
        aria-valuemin={w0}
        aria-valuemax={w1}
        aria-valuenow={cursorMs ?? w0}
        aria-valuetext={
          cursorMs != null ? formatSessionTime(cursorMs, true) : undefined
        }
        tabIndex={0}
        // The card around this plot carries a hairline in the dark theme, but
        // an inset ring paints UNDER its children — and this plot is a
        // full-width child with a `bg-card` of its own, so along its 350px it
        // covered the card's sides up. It closes its own box instead.
        //
        // A shadow and not `border-x`: a border is two more pixels of width,
        // and the plot and the event strip below share an x scale that has to
        // stay aligned to the pixel. A shadow and not a `ring`, because `ring`
        // here already belongs to the focus state.
        //
        // Only the bottom rule survives — it is the seam against the event
        // strip. The top one was the edge the event tabs hung from, and since
        // they float clear of it nothing needs it any more.
        className="relative h-[350px] w-full cursor-crosshair touch-pan-y overflow-hidden border-b border-border bg-card outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:shadow-[inset_1px_0_0_var(--border),inset_-1px_0_0_var(--border)]"
        onPointerDown={(event) => {
          pointersRef.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // No capture: moves still arrive while over the plot.
          }
          // A second finger turns the gesture into a pinch: the scrub (and
          // any selection) is abandoned, and the time under the fingers'
          // midpoint becomes the anchor the window stretches around.
          if (event.pointerType !== "mouse" && pointersRef.current.size === 2) {
            const [a, b] = [...pointersRef.current.values()];
            const anchorMs = msFromClientX((a.x + b.x) / 2);
            if (anchorMs == null) return;
            pinchRef.current = {
              startDist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
              startSpan: span,
              anchorMs,
            };
            dragRef.current = null;
            setSelection(null);
            return;
          }
          const ms = msFromClientX(event.clientX);
          if (ms == null) return;
          dragRef.current = {
            pointerId: event.pointerId,
            startMs: ms,
            isMouse: event.pointerType === "mouse",
            moved: false,
          };
          lastPointerTypeRef.current = event.pointerType;
          // Pressing anywhere releases a locked cursor, here included. The
          // two presses of a double click release it and then the dblclick
          // that follows them pins it again, at the new spot.
          setLocked(false);
          captureYFrac(event.clientY);
          onCursorChange(ms);
        }}
        onPointerMove={(event) => {
          const tracked = pointersRef.current.get(event.pointerId);
          if (tracked) {
            tracked.x = event.clientX;
            tracked.y = event.clientY;
          }
          const pinch = pinchRef.current;
          if (pinch && pointersRef.current.size >= 2) {
            const el = plotRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0) return;
            const [a, b] = [...pointersRef.current.values()];
            const dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
            // Fingers apart → smaller window. Clamped between ~20 samples
            // and the whole recording.
            const newSpan = Math.min(
              fullSpan,
              Math.max(minSpan, pinch.startSpan * (pinch.startDist / dist)),
            );
            const midFrac = Math.min(
              1,
              Math.max(0, ((a.x + b.x) / 2 - rect.left) / rect.width),
            );
            let from = pinch.anchorMs - midFrac * newSpan;
            from = Math.min(Math.max(from, fullMs[0]), fullMs[1] - newSpan);
            onWindowChange([from, from + newSpan]);
            return;
          }
          const drag = dragRef.current;
          if (drag && drag.pointerId === event.pointerId) {
            const ms = msFromClientX(event.clientX);
            if (ms == null) return;
            drag.moved = true;
            if (drag.isMouse) {
              setSelection([
                Math.min(drag.startMs, ms),
                Math.max(drag.startMs, ms),
              ]);
            } else {
              captureYFrac(event.clientY);
              onCursorChange(ms);
            }
            return;
          }
          // A mouse just passing over reads the chart without pressing —
          // unless the cursor is locked, which is the whole point of locking.
          if (event.pointerType === "mouse" && !locked) {
            const ms = msFromClientX(event.clientX);
            if (ms != null) {
              captureYFrac(event.clientY);
              onCursorChange(ms);
            }
          }
        }}
        onPointerUp={(event) => {
          pointersRef.current.delete(event.pointerId);
          if (pinchRef.current) {
            // Under two fingers the pinch is over, and the survivor does NOT
            // fall back into a scrub — the cursor jumping to wherever that
            // finger happens to rest would undo the framing just chosen.
            if (pointersRef.current.size < 2) pinchRef.current = null;
          } else {
            endDrag(event.clientX);
          }
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // Nothing was captured.
          }
        }}
        onDoubleClick={() => {
          if (lastPointerTypeRef.current !== "mouse") return;
          setLocked(true);
        }}
        onPointerCancel={(event) => {
          // The browser took the gesture (vertical scroll) — drop everything.
          pointersRef.current.delete(event.pointerId);
          if (pointersRef.current.size < 2) pinchRef.current = null;
          dragRef.current = null;
          setSelection(null);
        }}
        onKeyDown={(event) => {
          if (cursorMs == null) return;
          const idx = Math.min(
            tMs.length - 1,
            Math.max(0, lowerBoundIndex(tMs, cursorMs)),
          );
          if (event.key === "ArrowLeft" && idx > 0)
            onCursorChange(tMs[idx - 1]);
          else if (event.key === "ArrowRight" && idx < tMs.length - 1)
            onCursorChange(tMs[idx + 1]);
          else return;
          event.preventDefault();
        }}
      >
        {/* No horizontal gridlines. They were three rules at a quarter, a
            half and three quarters of the plot — and they measured nothing:
            every series here is normalised to its own min/max over the
            visible window, so a line at "half height" is half of a different
            number for each one. The exact figures are read from the cursor's
            panel, which is where the y axis actually lives. Removed on
            request; the vertical marks (events, the cursor's rule) stay,
            because those do line up with something real. */}
        {/* The event stretches, shaded behind the signal. They say where the
            signal is happening; the lane below says what and how long. What
            they no longer carry is their old label — at this width the text
            was truncated to "Acident" and "S", and naming the event is now
            the badge's job and the card's. */}
        {visibleEvents.map((event, i) => {
          // Impacts are instants, so they mark the plot as a red rule rather
          // than a stretch — several close together read as one red zone,
          // which is exactly what a run of hits is.
          if (event.kind === "impact") {
            return (
              <div
                key={i}
                aria-hidden
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-[#F5533D]/30"
                style={{ left: `${((event.timeMs - w0) / span) * 100}%` }}
              />
            );
          }
          const [from, to] = eventSpan(event);
          const left = (Math.max(0, from - w0) / span) * 100;
          const width = ((Math.min(w1, to) - Math.max(w0, from)) / span) * 100;
          return (
            <div
              key={i}
              aria-hidden
              className={cn(
                // `imu-event-band` is the hatch, in globals.css: the tint
                // says where by being darker, the surface says it by being
                // another material. The class carries no colour, so the two
                // kinds keep their own and share the texture.
                "imu-event-band absolute inset-y-0",
                event.kind === "jump" || event.kind === "drop"
                  ? "bg-primary/20"
                  : // Lighter than it was (8%) now that the hatch carries the
                    // signal: with a surface on top, the tint only has to
                    // separate the stretch from the card, not announce it.
                    "bg-muted-foreground/6",
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="relative h-full w-full"
          preserveAspectRatio="none"
          aria-hidden
        >
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* The y extremes of the first active series, over the whole
            recording — the scale the plot is drawn against, so they hold
            still while the window moves. One pair of numbers is honest where
            eight would be noise. */}
        {primary && primary.d && (
          <>
            <span className="absolute top-0.5 right-1.5 text-[10px] text-muted-foreground tabular-nums">
              {primary.max.toFixed(2)}
            </span>
            <span className="absolute bottom-0.5 right-1.5 text-[10px] text-muted-foreground tabular-nums">
              {primary.min.toFixed(2)}
            </span>
          </>
        )}

        {selection && (
          <div
            aria-hidden
            className="absolute inset-y-0 bg-foreground/10"
            style={{
              left: `${((selection[0] - w0) / span) * 100}%`,
              width: `${((selection[1] - selection[0]) / span) * 100}%`,
            }}
          />
        )}

        {/* Event names, drawn after the signal so they sit on top of it.
            Pills rather than bare text: at this size a word laid straight on
            a busy trace is unreadable, and the plate gives it a floor. They
            are allowed to spill past their own band — a jump is 600 ms wide
            and its name is not — and the plot's overflow-hidden trims
            whatever reaches the edge. */}
        {visibleEvents.map((event, i) => {
          if (event.kind === "impact") {
            return (
              <span
                key={i}
                aria-hidden
                // Below the tab strip, not inside it: an impact falling within
                // a rough patch put its arrow straight through the word
                // "Acidentado" — three of them, in the demo. The arrows start
                // where the tabs end, gap included.
                className="pointer-events-none absolute -translate-x-1/2 text-[9px] leading-none font-semibold text-[#F5533D]"
                style={{
                  left: `${((event.timeMs - w0) / span) * 100}%`,
                  top: EVENT_TAB_TOP + EVENT_TAB_H + 2,
                }}
              >
                ▼
              </span>
            );
          }
          const [from, to] = eventSpan(event);
          const mid = (Math.max(w0, from) + Math.min(w1, to)) / 2;
          return (
            <span
              key={i}
              aria-hidden
              // A chip clear of the plot's top edge: 5px on the four corners
              // and a gap above it, so it reads as laid over the trace rather
              // than hung from the frame.
              className="pointer-events-none absolute flex -translate-x-1/2 items-center rounded-[5px] bg-foreground px-1.5 text-[10px] leading-tight font-medium whitespace-nowrap text-background"
              style={{
                left: `${((mid - w0) / span) * 100}%`,
                top: EVENT_TAB_TOP,
                height: EVENT_TAB_H,
              }}
            >
              {eventShortLabel(event)}
            </span>
          );
        })}

        {cursorPercent != null && locked && (
          // The padlock rides the line rather than sitting in a corner: it is
          // this line that is pinned, and at the top it clears the signal.
          <div
            aria-hidden
            className="pointer-events-none absolute top-2 z-10 flex h-7 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-foreground text-background"
            style={{ left: `${cursorPercent}%` }}
          >
            <Lock className="size-3" />
          </div>
        )}

        {cursorPercent != null && (
          <div
            aria-hidden
            // Black and 2px: the red belongs to the impacts, and now that
            // those sit at 30% the live cursor does not need a colour of its
            // own to stand out — weight is enough, and it keeps the plot to
            // one red meaning one thing.
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground/70"
            style={{ left: `${cursorPercent}%` }}
          />
        )}

        {/* The cursor's reading on the plot: one pill per active series —
            its dot and the sample's value, the time pill's idiom. Behind a
            toggle (the "Valores" switch by the zoom buttons): with several
            series they cost real plot, and the exact figures also live in
            the panel below — `aria-hidden` for that same reason.

            The stack rides the HAND's height, not each trace's: pinned to
            the intersections it jumped with every sample the cursor crossed,
            and the eye it is for is already at the pointer. The y is only
            captured while scrubbing, so a lock or a lifted finger leaves the
            reading where it was. Near the right edge the stack steps to the
            rule's other side — the time pill's trick.

            And only the series the hand is NEAR (Grafana's manner, asked
            for): a pill answers the line under the pointer, not every line
            on the plot — hold the hand on the trace you are reading and the
            others stay quiet. The reach is generous (32px) because a scrub
            follows the time axis, not the wiggle of the line. */}
        {showValues &&
          cursorPercent != null &&
          cursorIndex != null &&
          (() => {
            // The plot is h-[350px] by class, so a px reach converts to the
            // fraction space the pointer is tracked in.
            const near = paths.flatMap((p, i) => {
              const value = series[i].values[cursorIndex];
              if (!Number.isFinite(value) || !p.d) return [];
              const range = p.max - p.min || 1;
              const traceFrac =
                (H - PAD_Y - ((value - p.min) / range) * (H - PAD_Y * 2)) / H;
              if (Math.abs(traceFrac - pointerYFrac) * 350 > 32) return [];
              return [{ id: p.id, color: p.color, value }];
            });
            if (near.length === 0) return null;
            return (
              <div
                aria-hidden
                className="pointer-events-none absolute z-10 flex flex-col items-start gap-1"
                style={{
                  left: `calc(${cursorPercent}% + ${cursorPercent > 80 ? -8 : 8}px)`,
                  // Clamped so the stack never hangs off the plot's edge.
                  top: `${Math.min(92, Math.max(8, pointerYFrac * 100))}%`,
                  transform: `translateY(-50%)${cursorPercent > 80 ? " translateX(-100%)" : ""}`,
                }}
              >
                {near.map((p) => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1.5 rounded-full bg-foreground py-0.5 pr-2.5 pl-2 text-[11px] font-semibold text-background tabular-nums"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.value.toFixed(4)}
                  </span>
                ))}
              </div>
            );
          })()}
      </div>

      {/* The event lane.

          Events used to be painted inside the plot as translucent bands with
          a label on the top edge; at six minutes and twenty events those
          bands overlapped into mush and every label was truncated to two
          letters. Here they get their own strip, sharing the plot's exact x
          scale, so vertical alignment still tells you which spike belongs to
          which event while the plot goes back to being about the signal.

          Almost monochrome on purpose. The app already carries three colour
          vocabularies that must not blend (health, Ride Load bands, the lab's
          series palette); a fourth — one hue per event kind — would be a
          legend to memorise. Greys carry intensity instead, and only two
          kinds earn a colour: what is airborne, and what hit hard. Which
          event it is comes from the badge on the rule and the card below. */}
      {events.some((event) => eventKinds.has(event.kind)) && (
        <div
          aria-hidden
          // Gated on the SESSION's events, not the window's: while panning, a
          // stretch with nothing in it used to unmount the lane, and its 4px
          // collapsing mid-drag walked the axis row and everything under it
          // up the page. The lane stands whenever the session has events to
          // show; an empty window just shows it empty.
          //
          // Square ends: the lane runs the card's full width now, and a
          // stadium track would leave two pale nicks against the card edges.
          // Flush against the plot's bottom border — the two share an x axis,
          // and a gap made them read as two pictures instead of one.
          className="relative h-1 w-full overflow-hidden bg-muted"
        >
          {[...visibleEvents]
            // Painted widest-context first so a point event lands on top of
            // the stretch that contains it.
            .sort(
              (a, b) => STRIP_PAINT_ORDER[a.kind] - STRIP_PAINT_ORDER[b.kind],
            )
            .map((event, i) => {
              if (event.kind === "impact") {
                return (
                  <span
                    key={i}
                    className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full bg-[#F5533D]"
                    style={{ left: `${((event.timeMs - w0) / span) * 100}%` }}
                  />
                );
              }
              const [from, to] = eventSpan(event);
              const left = (Math.max(0, from - w0) / span) * 100;
              const width =
                ((Math.min(w1, to) - Math.max(w0, from)) / span) * 100;
              return (
                <span
                  key={i}
                  className={cn(
                    "absolute inset-y-0 rounded-full",
                    event.kind === "jump" || event.kind === "drop"
                      ? "bg-primary"
                      : event.kind === "rough_section"
                        ? "bg-foreground/45"
                        : "bg-foreground/25",
                  )}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.4)}%`,
                  }}
                />
              );
            })}

          {/* The cursor crosses the lane too — without it the strip and the
              plot would be two pictures instead of one. */}
          {cursorPercent != null && (
            <span
              className="absolute inset-y-0 w-px bg-background/70"
              style={{ left: `${cursorPercent}%` }}
            />
          )}
        </div>
      )}

      {/* The axis row is padded, but the cursor's pill is positioned against
          the full-bleed plot — so the pill hangs off this wrapper, not off
          the padded row, or it would drift from the rule by the padding. */}
      <div className="relative mt-1.5">
        <div className="flex justify-between px-5 text-[10px] text-muted-foreground tabular-nums sm:px-6">
          <span>{formatSessionTime(w0)}</span>
          <span>
            {rawResolution
              ? "dados brutos"
              : `envelope ~${Math.max(1, Math.round(span / BUCKETS))} ms`}
          </span>
          <span>{formatSessionTime(w1)}</span>
        </div>

        {/* The instant, hung under the rule that marks it. Near the edges it
            stops centring and tucks against the side it is nearest — the
            trend chart's label trick. */}
        {cursorPercent != null && snappedCursorMs != null && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-0.5 flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-background tabular-nums"
            style={{
              left: `${cursorPercent}%`,
              transform:
                cursorPercent > 85
                  ? "translateX(-100%)"
                  : cursorPercent < 15
                    ? "none"
                    : "translateX(-50%)",
            }}
          >
            <ImuClockIcon className="size-2.5 shrink-0" />
            {formatSessionTime(snappedCursorMs, true)}
          </span>
        )}
      </div>

      {/* The pan scrollbar — shelved, see PAN_BAR_ENABLED. Only while
          zoomed, like any scrollbar: at full width there is nowhere to pan.
          The track is the WHOLE recording, the thumb is the visible window —
          dragging it pans, pressing outside it jumps the window there and
          keeps dragging. */}
      {PAN_BAR_ENABLED && span < fullSpan - 1 && (
        <div
          className="relative mx-5 mt-2 h-4 cursor-pointer touch-none sm:mx-6"
          onPointerDown={(event) => {
            if (
              !event.isPrimary ||
              (event.pointerType === "mouse" && event.button !== 0)
            )
              return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width === 0) return;
            event.preventDefault();
            const frac = Math.min(
              1,
              Math.max(0, (event.clientX - rect.left) / rect.width),
            );
            const pressedMs = fullMs[0] + frac * fullSpan;
            let startFrom = w0;
            if (pressedMs < w0 || pressedMs > w1) {
              // Pressed the track, not the thumb: centre the window there,
              // then the drag continues from that new footing.
              startFrom = Math.min(
                Math.max(pressedMs - span / 2, fullMs[0]),
                fullMs[1] - span,
              );
              onWindowChange([startFrom, startFrom + span]);
            }
            panBarDragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startFrom,
              trackWidth: rect.width,
            };
            setPanBarActive(true);
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // No capture: moves still arrive while over the bar.
            }
          }}
          onPointerMove={(event) => {
            const drag = panBarDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            // A move with no button held means the release was missed — end
            // the drag instead of trailing the hover (the preview pane's
            // spurious-pointer rule).
            if (event.pointerType === "mouse" && event.buttons === 0) {
              panBarDragRef.current = null;
              setPanBarActive(false);
              return;
            }
            const shift =
              ((event.clientX - drag.startX) / drag.trackWidth) * fullSpan;
            const from = Math.min(
              Math.max(drag.startFrom + shift, fullMs[0]),
              fullMs[1] - span,
            );
            onWindowChange([from, from + span]);
          }}
          onPointerUp={(event) => {
            if (panBarDragRef.current?.pointerId === event.pointerId) {
              panBarDragRef.current = null;
              setPanBarActive(false);
            }
          }}
          onPointerCancel={(event) => {
            if (panBarDragRef.current?.pointerId === event.pointerId) {
              panBarDragRef.current = null;
              setPanBarActive(false);
            }
          }}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted"
          />
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-colors",
              panBarActive ? "bg-foreground" : "bg-muted-foreground/50",
            )}
            style={{
              left: `${((w0 - fullMs[0]) / fullSpan) * 100}%`,
              // A floor so a deep zoom still leaves something to grab.
              width: `${Math.max((span / fullSpan) * 100, 3)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function eventShortLabel(event: ImuEvent): string {
  switch (event.kind) {
    case "curve":
      return event.direction === "left" ? "Curva ←" : "Curva →";
    case "jump":
      return "Salto";
    case "drop":
      return "Drop";
    case "rough_section":
      return "Acidentado";
    case "braking":
      return "Travagem";
    case "impact":
      return "Impacto";
  }
}

function eventSpan(event: ImuEvent): [number, number] {
  switch (event.kind) {
    case "impact":
      return [event.timeMs, event.timeMs];
    case "jump":
    case "drop":
      return [event.takeoffMs, event.landingMs];
    default:
      return [event.startMs, event.endMs];
  }
}
