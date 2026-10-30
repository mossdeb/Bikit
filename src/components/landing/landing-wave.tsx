"use client";

import { useEffect, useRef } from "react";

const WIDTH = 435;
const MID_Y = 39.4;
const AMPLITUDE = 35;
/** One wave, in the drawing's units, and how long it takes to go by. */
const WAVELENGTH = 104;
const PERIOD_MS = 3200;
const DOT_X = 209.5;
/** The reading at the top of a wave, and at the bottom with its sign turned. */
const PEAK = 124567;
const STEP = 4;

const yAt = (x: number, shift: number) =>
  MID_Y + AMPLITUDE * Math.sin((2 * Math.PI * (x - shift)) / WAVELENGTH);

function pathAt(shift: number): string {
  let d = "";
  for (let x = 0; x <= WIDTH; x += STEP) {
    d += `${d ? "L" : "M"}${x} ${yAt(x, shift).toFixed(2)}`;
  }
  return d;
}

function readingAt(y: number): string {
  const value = Math.round(((MID_Y - y) / AMPLITUDE) * PEAK);
  const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+$)/g, " ");
  return `${value < 0 ? "-" : "+"}${digits}`;
}

// Where the frame's drawing starts: the dot a little past a crest and on its
// way down, the reading negative — as a still, it is also the page's first
// paint and all a reader who asked for less motion sees.
const START_SHIFT = 86;
const START_Y = yAt(DOT_X, START_SHIFT);

/**
 * The features card's signal, as a telemetry trace (by request, 2026-10-30):
 * the wave runs sideways for ever, the dot stays at the centre riding it, and
 * the figure under it reads the dot's height, above the middle positive and
 * below it negative. Written straight to the nodes, frame by frame, with no
 * React state — and only while it is on screen.
 */
export function LandingWave() {
  const svg = useRef<SVGSVGElement>(null);
  const line = useRef<SVGPathElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const reading = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const root = svg.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let start: number | null = null;
    const draw = (now: number) => {
      start ??= now;
      const shift = START_SHIFT - (((now - start) / PERIOD_MS) * WAVELENGTH) % WAVELENGTH;
      const y = yAt(DOT_X, shift);
      line.current?.setAttribute("d", pathAt(shift));
      dot.current?.setAttribute("cy", y.toFixed(2));
      if (reading.current) reading.current.textContent = readingAt(y);
      frame = requestAnimationFrame(draw);
    };

    const watcher = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry.isIntersecting) frame = requestAnimationFrame(draw);
    });
    watcher.observe(root);
    return () => {
      watcher.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <svg
        ref={svg}
        viewBox={`0 0 ${WIDTH} 79`}
        fill="none"
        className="absolute top-[calc(var(--u)*65)] left-1/2 w-[calc(var(--u)*434)] -translate-x-1/2 overflow-visible"
      >
        <defs>
          {/* In the drawing's own units, so the fade stays put at the two
              ends while the wave runs through it. */}
          <linearGradient id="home-wave" x1="0" y1="0" x2={WIDTH} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0.05" stopColor="#000" stopOpacity="0" />
            <stop offset="0.36" stopColor="#000" />
            <stop offset="0.69" stopColor="#000" />
            <stop offset="0.92" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          ref={line}
          d={pathAt(START_SHIFT)}
          stroke="url(#home-wave)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle ref={dot} cx={DOT_X} cy={START_Y.toFixed(2)} r="7.5" fill="#43F3AF" />
      </svg>
      <p
        ref={reading}
        className="absolute top-[calc(var(--u)*156)] left-1/2 -translate-x-1/2 font-[family-name:var(--font-landing-heading)] text-[calc(var(--u)*18)] font-bold tracking-[-0.45px] whitespace-nowrap text-[#101014] tabular-nums"
      >
        {readingAt(START_Y)}
      </p>
    </>
  );
}
