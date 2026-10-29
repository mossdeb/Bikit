"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { proNumber } from "@/lib/i18n/pro";
import {
  flightPositionAt,
  flightShape,
  type FlightShape,
} from "@/lib/imu/snapshot-simulation";
import type { SimulationPass } from "@/components/imu-snapshot-simulation";

/**
 * A jump's simulation seen from the side (by request, 2026-10-29, from a
 * sketch): the kicker, the landing and each pass's arc between them, the
 * dots riding them on the simulation's clock. The arcs are each pass's
 * own — its time in the air and its speed off the lip (flightShape) — and
 * so are the figures on them, marked ≈: as if the landing were as high as
 * the lip. The ramps are a drawing, not a measure: the logger knows
 * neither their heights nor their lengths, and nothing is written on them.
 * The height is drawn on a scale of its own, taller than the run's, so a
 * metre of height can be seen beside a dozen of run.
 */

const PAD_X = 28;
/** Where the lip stands over the ground, px — a drawing. */
const LIP_PX = 56;
/** The kicker's face and the landing's slope, as shares of the longest
 * run. */
const KICKER_SHARE = 0.28;
const LANDING_SHARE = 0.38;
/** The flown part fades in over this many pieces, from this opacity at the
 * lip to full at the dot — as the corners' lines do. */
const FADE_PIECES = 16;
const FADE_FROM = 0.15;

function useBoxWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface JumpProfileWords {
  takeoff: string;
  apex: string;
  landing: string;
  distance: string;
  height: string;
  airtime: string;
  speed: string;
  noFlight: string;
}

export function ImuSnapshotJumpProfile({
  passes,
  framed,
  reference,
  followed,
  inkOf,
  cursorMs,
  readout,
  words,
  locale,
}: {
  /** The passes on show. */
  passes: SimulationPass[];
  /** All of them, which the drawing is scaled to. */
  framed: SimulationPass[];
  reference: SimulationPass;
  followed: SimulationPass;
  inkOf: (p: SimulationPass) => string;
  cursorMs: number;
  readout: React.ReactNode;
  words: JumpProfileWords;
  locale: Locale;
}) {
  const [ref, W] = useBoxWidth<HTMLDivElement>();
  const H = W < 500 ? 380 : 470;
  const shapeOf = (p: SimulationPass): FlightShape | null =>
    p.flight ? flightShape(p.flight.airtimeMs, p.flight.takeoffKmh) : null;
  const shapes = framed.map(shapeOf).filter((s): s is FlightShape => !!s);
  const longest = Math.max(4, ...shapes.map((s) => s.distanceM));
  const highest = Math.max(0.5, ...shapes.map((s) => s.apexM));
  const kicker = KICKER_SHARE * longest;
  const landing = LANDING_SHARE * longest;
  // Framed on the jump itself, the ramps only just in (by request,
  // 2026-10-29: trimmed, so they read larger).
  // Centred (by request, 2026-10-29): the same margin before the kicker's
  // foot as after the landing's — the landing drawn from the reference's
  // run, the longest arc's end the farthest anything flies.
  const landingTop = shapeOf(reference)?.distanceM ?? longest;
  const drawnTo = Math.max(landingTop + landing, longest);
  const margin = 0.02 * (drawnTo + kicker);
  const fromM = -kicker - margin;
  const toM = drawnTo + margin;
  const sx = W > 0 ? (W - 2 * PAD_X) / (toM - fromM) : 1;
  // Room under the ground for the run's arrow and, below it, the pills —
  // two rows of them on a narrow plate.
  const groundY = H - 150;
  const lipY = groundY - LIP_PX;
  const apexRoom = lipY - 70;
  const sy = apexRoom / highest;
  const X = (m: number) => PAD_X + (m - fromM) * sx;

  // The ramps as height over the ground, px, at a distance from the lip:
  // the kicker's face rising to the lip, the landing's falling from its
  // top. Both drawn and ridden by the same curve.
  const kickerAt = (m: number) =>
    m > 0 || m <= -kicker ? 0 : LIP_PX * ((m + kicker) / kicker) ** 2;
  // At the lip and at the landing's top themselves the ramps stand at
  // their height, so each knuckle's two sides meet there without a notch.
  const landingAt = (m: number, top: number) =>
    m < top || m >= top + landing ? 0 : LIP_PX * (1 - (m - top) / landing) ** 2;

  // A pass's dot: on the kicker before the lip, on its arc in the air, on
  // the landing after; at the speed it left the lip at.
  const dotOf = (p: SimulationPass) => {
    const shape = shapeOf(p);
    if (!shape || !p.flight) return null;
    const v = Math.hypot(shape.vx, shape.vy);
    const t = (cursorMs - p.flight.takeoffMs) / 1000;
    if (t < 0) {
      const m = Math.max(fromM, v * t);
      return { x: X(m), y: groundY - kickerAt(m) };
    }
    if (t <= shape.airtimeS) {
      const at = flightPositionAt(shape, t);
      return { x: X(at.x), y: lipY - at.y * sy };
    }
    const m = Math.min(toM, shape.distanceM + v * (t - shape.airtimeS));
    return { x: X(m), y: groundY - landingAt(m, shape.distanceM) };
  };
  // An arc's points, from the lip to `upToS` into the flight.
  const arcPoints = (shape: FlightShape, upToS = shape.airtimeS) => {
    const pts: [number, number][] = [];
    const steps = 48;
    const end = Math.max(0, Math.min(shape.airtimeS, upToS));
    for (let i = 0; i <= steps; i++) {
      const at = flightPositionAt(shape, (end * i) / steps);
      pts.push([X(at.x), lipY - at.y * sy]);
    }
    return pts;
  };
  const line = (pts: [number, number][]) =>
    `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`;
  // The ground flown so far, solid in the pass's colour and fading in from
  // the lip to the dot — the corners' way (2026-10-29).
  const flownPieces = (p: SimulationPass, shape: FlightShape) => {
    if (!p.flight) return [];
    const t = (cursorMs - p.flight.takeoffMs) / 1000;
    if (t <= 0) return [];
    const pts = arcPoints(shape, t);
    const n = FADE_PIECES;
    return Array.from({ length: n }, (_, j) => {
      const from = Math.floor((j * (pts.length - 1)) / n);
      const to = Math.floor(((j + 1) * (pts.length - 1)) / n);
      return {
        d: line(pts.slice(from, to + 1)),
        opacity: FADE_FROM + ((1 - FADE_FROM) * (j + 1)) / n,
      };
    });
  };
  const rampPath = (from: number, to: number, at: (m: number) => number) => {
    const pts: string[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const m = from + ((to - from) * i) / steps;
      pts.push(`${X(m).toFixed(1)},${(groundY - at(m)).toFixed(1)}`);
    }
    return `M${pts.join(" L")}`;
  };
  // The kicker's back and the landing's knuckle, drawn and not ridden.
  const kickerShape = `${rampPath(-kicker, 0, kickerAt)} L${X(kicker * 0.35).toFixed(1)},${groundY} Z`;
  const landingShape = `M${X(landingTop - landing * 0.3).toFixed(1)},${groundY} L${X(landingTop).toFixed(1)},${lipY} ${rampPath(
    landingTop,
    landingTop + landing,
    (m) => landingAt(m, landingTop),
  ).slice(1)} Z`;

  const shown = shapeOf(followed) ? followed : reference;
  const shownShape = shapeOf(shown);
  // The run's arrow, between the take-off's and the landing's words.
  const runFrom = X(0) + 52;
  const runTo = shownShape ? X(shownShape.distanceM) - 52 : runFrom;
  const order = [
    ...passes.filter((p) => p !== shown),
    ...passes.filter((p) => p === shown),
  ];
  const n = (v: number, d = 1) => proNumber(v, locale, d);

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-[16px] bg-muted/60"
      style={{ height: H }}
    >
      {W > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          aria-hidden
        >
          {/* The ground, and the two ramps on it. */}
          <line
            x1={0}
            x2={W}
            y1={groundY}
            y2={groundY}
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-foreground/25"
          />
          {[kickerShape, landingShape].map((d) => (
            <path
              key={d.slice(0, 24)}
              d={d}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth={1}
              className="text-foreground/[0.09]"
            />
          ))}
          {/* The shown pass's marks: the lip, the apex, the landing, and
              the run and the height, ≈. */}
          {shownShape && (
            <g
              className="text-foreground/55"
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="4 3"
            >
              {/* The lip's and the landing's lines, faint, from the top of
                  the plate to their words under the ground (by request,
                  2026-10-29). */}
              <line
                x1={X(0)}
                x2={X(0)}
                y1={0}
                y2={groundY + 6}
                strokeOpacity={0.3}
              />
              <line
                x1={X(shownShape.distanceM)}
                x2={X(shownShape.distanceM)}
                y1={0}
                y2={groundY + 6}
                strokeOpacity={0.3}
              />
              {/* The lip's level, faint — darker than the marks (by
                  request, 2026-10-29). */}
              <line
                x1={X(0)}
                x2={X(shownShape.distanceM)}
                y1={lipY}
                y2={lipY}
                strokeOpacity={0.3}
              />
            </g>
          )}
          {shownShape && (
            <g className="text-foreground" stroke="currentColor" fill="none">
              {/* The height, from the lip's line to the apex. */}
              <line
                x1={X(shownShape.distanceM / 2)}
                x2={X(shownShape.distanceM / 2)}
                y1={lipY}
                y2={lipY - shownShape.apexM * sy}
                strokeWidth={1.2}
              />
              {/* The run, under the ground. */}
              <line
                x1={runFrom}
                x2={runTo}
                y1={groundY + 22}
                y2={groundY + 22}
                strokeWidth={1.2}
              />
              <path
                d={`M${runFrom + 6},${groundY + 18} L${runFrom},${groundY + 22} L${runFrom + 6},${groundY + 26} M${runTo - 6},${groundY + 18} L${runTo},${groundY + 22} L${runTo - 6},${groundY + 26}`}
                strokeWidth={1.2}
              />
            </g>
          )}
          {/* Each pass's arc, dashed, and its dot on the clock. */}
          {order.map((p) => {
            const shape = shapeOf(p);
            const dot = dotOf(p);
            return (
              <g key={p.key} className={inkOf(p)}>
                {/* The whole flight thin, dashed and grey; the part
                    flown, solid in colour (by request, 2026-10-29). */}
                {shape && (
                  <path
                    d={line(arcPoints(shape))}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    className="text-foreground/30"
                  />
                )}
                {shape &&
                  flownPieces(p, shape).map((piece, j) => (
                    <path
                      key={j}
                      d={piece.d}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity={piece.opacity}
                      strokeWidth={p === shown ? 3 : 2.5}
                      strokeLinecap="butt"
                      strokeLinejoin="round"
                    />
                  ))}
                {dot && (
                  <circle
                    cx={dot.x}
                    cy={dot.y}
                    r={p === shown ? 5 : 4}
                    fill="currentColor"
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}
      {/* The marks' words, over the drawing. */}
      {W > 0 && shownShape && shown.flight && (
        <>
          <Mark
            x={X(0)}
            y={groundY + 10}
            title={words.takeoff}
            value={
              shown.flight.takeoffKmh == null
                ? "—"
                : `${n(shown.flight.takeoffKmh)} ${words.speed}`
            }
          />
          <Mark
            x={X(shownShape.distanceM / 2)}
            y={lipY - shownShape.apexM * sy - 52}
            title={words.apex}
            value={`≈ ${n(shownShape.apexM)} m`}
          />
          <Mark
            x={X(shownShape.distanceM)}
            y={groundY + 10}
            title={words.landing}
            value={
              shown.flight.landingG == null
                ? "—"
                : `${n(shown.flight.landingG)} G`
            }
          />
          <p
            className="pointer-events-none absolute -translate-x-1/2 text-center text-xs text-muted-foreground tabular-nums"
            style={{ left: X(shownShape.distanceM / 2), top: groundY + 30 }}
          >
            {words.distance} ≈ {n(shownShape.distanceM)} m
          </p>
          <p
            className="pointer-events-none absolute text-xs text-muted-foreground tabular-nums"
            style={{
              left: X(shownShape.distanceM / 2) + 8,
              top: lipY - (shownShape.apexM * sy) / 2 - 8,
            }}
          >
            {words.height} ≈ {n(shownShape.apexM)} m
          </p>
        </>
      )}
      {W > 0 && !shownShape && (
        <p className="absolute inset-x-0 top-6 text-center text-sm text-muted-foreground">
          {words.noFlight}
        </p>
      )}
      {/* The shown pass's flight in words, top left — the bottom holds the
          pills. */}
      {shownShape && (
        <div className="absolute top-3 left-3 flex h-9 items-center divide-x divide-border rounded-[12px] bg-card px-1 text-sm whitespace-nowrap tabular-nums">
          <span className="px-3">
            <span className="text-muted-foreground">{words.airtime}</span>{" "}
            <span className="font-semibold">{n(shownShape.airtimeS, 2)} s</span>
          </span>
          <span className="px-3">
            <span className="text-muted-foreground">{words.distance}</span>{" "}
            <span className="font-semibold">≈ {n(shownShape.distanceM)} m</span>
          </span>
          <span className="px-3">
            <span className="text-muted-foreground">{words.height}</span>{" "}
            <span className="font-semibold">≈ {n(shownShape.apexM)} m</span>
          </span>
        </div>
      )}
      <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)]">
        {readout}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[16px] ring-1 ring-foreground/10 ring-inset"
      />
    </div>
  );
}

function Mark({
  x,
  y,
  title,
  value,
}: {
  x: number;
  y: number;
  title: string;
  value: string;
}) {
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 text-center whitespace-nowrap"
      style={{ left: x, top: y }}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground tabular-nums">{value}</p>
    </div>
  );
}
