"use client";

import { useLayoutEffect, useRef } from "react";

/** Same 1.8s and same curve as the bar beside it, so the two arrive together
 * rather than merely start together. */
const DURATION_MS = 1800;
const EASE = [0.65, 0, 0.35, 1] as const;

/** cubic-bezier(x1,y1,x2,y2) solved for y at a given x, Newton with a bisection
 * fallback — the same curve CSS applies, computed here because the count has to
 * be driven frame by frame rather than declared. */
function ease(p: number): number {
  const [x1, y1, x2, y2] = EASE;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (t: number) => ((ax * t + bx) * t + cx) * t;
  const yAt = (t: number) => ((ay * t + by) * t + cy) * t;

  let t = p;
  for (let i = 0; i < 8; i += 1) {
    const err = xAt(t) - p;
    if (Math.abs(err) < 1e-6) return yAt(t);
    const slope = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(slope) < 1e-6) break;
    t -= err / slope;
  }
  let lo = 0;
  let hi = 1;
  t = p;
  for (let i = 0; i < 24; i += 1) {
    const x = xAt(t);
    if (Math.abs(x - p) < 1e-6) break;
    if (x < p) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return yAt(t);
}

/**
 * The Ride Load figure counting up beside its bar.
 *
 * This was a CSS counter driven by an animated registered property, which is
 * the tidier idea and only works where `@property` does. Where it does not —
 * Tailwind emits a `@supports` block for exactly those engines, setting the
 * property on every element — an unregistered custom property cannot be
 * interpolated at all, so `animation-fill-mode: both` held the `0%` keyframe
 * for the whole duration and snapped to the answer at the end. Stuck on zero,
 * then a jump: the failure looked like a bug in the timing and was really the
 * property never having been animatable.
 *
 * Driving it frame by frame is duller and works in every engine.
 *
 * Renders the final value on the server and on the first client render alike,
 * so there is no hydration mismatch and no frame where the reading is wrong —
 * the count is set up afterwards by writing to the node, holding no React
 * state. A reader with JavaScript off sees the number, which is the part that
 * matters.
 */
export function RideLoadCountUp({ value, className }: { value: number; className?: string }) {
  const node = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (value <= 0) return;

    let frame = 0;
    let start: number | null = null;

    const step = (now: number) => {
      if (start === null) start = now;
      const p = Math.min(1, (now - start) / DURATION_MS);
      el.textContent = String(Math.round(ease(p) * value));
      if (p < 1) frame = requestAnimationFrame(step);
    };

    // Painted at zero before the first frame runs, so the count is seen to
    // start rather than to begin already underway.
    el.textContent = "0";
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      // Whatever interrupted this — a re-render, leaving the page — the number
      // left behind has to be the true one, never a frame from halfway.
      el.textContent = String(value);
    };
  }, [value]);

  return (
    <span ref={node} className={className}>
      {value}
    </span>
  );
}
