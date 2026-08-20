"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ImuEvent } from "@/lib/imu/format";
import { formatSessionTime, nearestSampleIndex } from "@/lib/imu/derive";
import { lowerBoundIndex, minMaxEnvelope, upperBoundIndex } from "@/lib/imu/downsample";

/** The plot's drawing box. Stretched to the container (preserveAspectRatio
 * "none"), so every position is a ratio of these — the trend chart's idiom. */
const W = 800;
const H = 260;
const PAD_Y = 14;

/** Envelope buckets across the visible window. ~2 points per bucket keeps the
 * polyline near 800 points whatever the recording length; below ~2 samples
 * per bucket the raw samples are drawn as they are. */
const BUCKETS = 400;

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
 * is normalized to its own min/max over the visible window — G forces and
 * °/s share one plot only as shapes, and the details panel is where exact
 * numbers live.
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
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const dragRef = useRef<{ pointerId: number; startMs: number; isMouse: boolean; moved: boolean } | null>(null);
  /** Every pointer currently down on the plot, by id — the pinch is read
   * from the first two. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ startDist: number; startSpan: number; anchorMs: number } | null>(null);

  const [w0, w1] = windowMs;
  const span = Math.max(1, w1 - w0);
  const fullSpan = Math.max(1, fullMs[1] - fullMs[0]);
  // Never narrower than ~20 samples' worth of time, whatever the rate.
  const minSpan = Math.max(50, ((tMs[tMs.length - 1] - tMs[0]) / Math.max(1, tMs.length - 1)) * 20);

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
        const frac = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const anchorMs = w0 + frac * span;
        // deltaY < 0 (fingers apart) shrinks the window. exp keeps the zoom
        // rate proportional, so slow and fast pinches both feel right.
        const newSpan = Math.min(fullSpan, Math.max(minSpan, span * Math.exp(event.deltaY * 0.01)));
        let from = anchorMs - frac * newSpan;
        from = Math.min(Math.max(from, fullMs[0]), fullMs[1] - newSpan);
        onWindowChange([from, from + newSpan]);
      } else if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && span < fullSpan) {
        event.preventDefault();
        const shift = (event.deltaX / rect.width) * span;
        const from = Math.min(Math.max(w0 + shift, fullMs[0]), fullMs[1] - span);
        onWindowChange([from, from + span]);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [w0, w1, span, fullSpan, minSpan, fullMs, onWindowChange]);

  const paths = useMemo(() => {
    const i0 = Math.max(0, lowerBoundIndex(tMs, w0) - 1);
    const i1 = Math.min(tMs.length - 1, upperBoundIndex(tMs, w1) + 1);
    return series.map((s) => {
      const points = minMaxEnvelope(tMs, s.values, i0, i1, BUCKETS);
      if (points.length === 0) return { id: s.id, color: s.color, d: "", raw: false, min: 0, max: 0 };
      let min = Infinity;
      let max = -Infinity;
      for (const p of points) {
        if (p.value < min) min = p.value;
        if (p.value > max) max = p.value;
      }
      const range = max - min || 1;
      let d = "";
      for (let i = 0; i < points.length; i++) {
        const x = ((points[i].tMs - w0) / span) * W;
        const y = H - PAD_Y - ((points[i].value - min) / range) * (H - PAD_Y * 2);
        d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      }
      // Raw when the window has fewer samples than two per bucket — the
      // envelope returns them untouched and the label below says so.
      const rawCount = i1 - i0 + 1;
      return { id: s.id, color: s.color, d, raw: rawCount <= BUCKETS * 2, min, max };
    });
  }, [tMs, series, w0, w1, span]);

  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        if (!eventKinds.has(event.kind)) return false;
        const [from, to] = eventSpan(event);
        return to >= w0 && from <= w1;
      }),
    [events, eventKinds, w0, w1]
  );

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
  const snappedCursorMs = cursorMs != null ? tMs[nearestSampleIndex(tMs, cursorMs)] : null;
  const cursorPercent =
    snappedCursorMs != null && snappedCursorMs >= w0 && snappedCursorMs <= w1
      ? ((snappedCursorMs - w0) / span) * 100
      : null;
  const primary = paths[0];
  const rawResolution = paths.length > 0 && paths.every((p) => p.raw);

  return (
    <div>
      <div
        ref={plotRef}
        role="slider"
        aria-label="Cursor da sessão"
        aria-valuemin={w0}
        aria-valuemax={w1}
        aria-valuenow={cursorMs ?? w0}
        aria-valuetext={cursorMs != null ? formatSessionTime(cursorMs, true) : undefined}
        tabIndex={0}
        className="relative h-[280px] w-full cursor-crosshair touch-pan-y overflow-hidden rounded-[12px] border border-border bg-card outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onPointerDown={(event) => {
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
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
            pinchRef.current = { startDist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), startSpan: span, anchorMs };
            dragRef.current = null;
            setSelection(null);
            return;
          }
          const ms = msFromClientX(event.clientX);
          if (ms == null) return;
          dragRef.current = { pointerId: event.pointerId, startMs: ms, isMouse: event.pointerType === "mouse", moved: false };
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
            const newSpan = Math.min(fullSpan, Math.max(minSpan, pinch.startSpan * (pinch.startDist / dist)));
            const midFrac = Math.min(1, Math.max(0, ((a.x + b.x) / 2 - rect.left) / rect.width));
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
              setSelection([Math.min(drag.startMs, ms), Math.max(drag.startMs, ms)]);
            } else {
              onCursorChange(ms);
            }
            return;
          }
          // A mouse just passing over reads the chart without pressing.
          if (event.pointerType === "mouse") {
            const ms = msFromClientX(event.clientX);
            if (ms != null) onCursorChange(ms);
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
        onPointerCancel={(event) => {
          // The browser took the gesture (vertical scroll) — drop everything.
          pointersRef.current.delete(event.pointerId);
          if (pointersRef.current.size < 2) pinchRef.current = null;
          dragRef.current = null;
          setSelection(null);
        }}
        onKeyDown={(event) => {
          if (cursorMs == null) return;
          const idx = Math.min(tMs.length - 1, Math.max(0, lowerBoundIndex(tMs, cursorMs)));
          if (event.key === "ArrowLeft" && idx > 0) onCursorChange(tMs[idx - 1]);
          else if (event.key === "ArrowRight" && idx < tMs.length - 1) onCursorChange(tMs[idx + 1]);
          else return;
          event.preventDefault();
        }}
      >
        {/* Horizontal gridlines as HTML — a stretched viewBox turns dash
            patterns and circles into taffy; divs do not stretch. */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <div
            key={frac}
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-border"
            style={{ top: `${((PAD_Y + frac * (H - PAD_Y * 2)) / H) * 100}%` }}
          />
        ))}

        {/* Event ranges under the lines: neutral bands with a label on the
            top edge. Deliberately not the health nor the Ride Load palettes —
            events are a third vocabulary and stay grey, with only the jump
            wearing the brand mint and impacts the warning red. */}
        {visibleEvents.map((event, i) => {
          const [from, to] = eventSpan(event);
          if (event.kind === "impact") {
            const left = ((event.timeMs - w0) / span) * 100;
            return (
              <div key={i} aria-hidden className="absolute inset-y-0" style={{ left: `${left}%` }}>
                <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-[#F5533D]/60" />
                <span className="absolute top-0.5 -translate-x-1/2 text-[9px] font-semibold text-[#F5533D]">▼</span>
              </div>
            );
          }
          const left = (Math.max(0, from - w0) / span) * 100;
          const width = ((Math.min(w1, to) - Math.max(w0, from)) / span) * 100;
          return (
            <div
              key={i}
              aria-hidden
              className={cn(
                "absolute inset-y-0 overflow-hidden",
                event.kind === "jump" ? "bg-primary/20" : "bg-muted-foreground/8"
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <span className="absolute top-0.5 left-1 text-[9px] whitespace-nowrap text-muted-foreground">
                {eventShortLabel(event)}
              </span>
            </div>
          );
        })}

        <svg viewBox={`0 0 ${W} ${H}`} className="relative h-full w-full" preserveAspectRatio="none" aria-hidden>
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

        {/* The y extremes of the first active series — the plot normalizes
            each series to its own range, so one pair of numbers is honest
            and eight would be noise. */}
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

        {cursorPercent != null && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-foreground/70" style={{ left: `${cursorPercent}%` }} />
        )}
      </div>

      <div className="relative mt-1.5 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{formatSessionTime(w0)}</span>
        <span>{rawResolution ? "dados brutos" : `envelope ~${Math.max(1, Math.round(span / BUCKETS))} ms`}</span>
        <span>{formatSessionTime(w1)}</span>
        {/* The cursor's exact time, pinned to the base of the rule. Near the
            edges it stops centring and tucks against the side it is nearest,
            the trend chart's label trick. */}
        {cursorPercent != null && snappedCursorMs != null && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-0.5 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-background tabular-nums"
            style={{
              left: `${cursorPercent}%`,
              transform:
                cursorPercent > 85 ? "translateX(-100%)" : cursorPercent < 15 ? "none" : "translateX(-50%)",
            }}
          >
            {formatSessionTime(snappedCursorMs, true)}
          </span>
        )}
      </div>
    </div>
  );
}

function eventSpan(event: ImuEvent): [number, number] {
  switch (event.kind) {
    case "impact":
      return [event.timeMs, event.timeMs];
    case "jump":
      return [event.takeoffMs, event.landingMs];
    default:
      return [event.startMs, event.endMs];
  }
}

function eventShortLabel(event: ImuEvent): string {
  switch (event.kind) {
    case "curve":
      return event.direction === "left" ? "Curva ←" : "Curva →";
    case "jump":
      return "Salto";
    case "rough_section":
      return "Acidentado";
    case "braking":
      return "Travagem";
    case "impact":
      return "Impacto";
  }
}
