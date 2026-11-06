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
import { FLIGHT_PITCH_STEP_MS } from "@/lib/imu/snapshot";

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
/** After touching down the bike settles onto the landing over this, s —
 * from the angle it flew in at to the ramp's. */
const SETTLE_S = 0.15;

/** How far the bike had turned since the lip `t` s into the flight,
 * degrees, nose down positive — between the series' samples. */
function pitchAt(series: number[], t: number): number {
  const f = Math.max(0, (t * 1000) / FLIGHT_PITCH_STEP_MS);
  const i = Math.min(series.length - 1, Math.floor(f));
  const j = Math.min(series.length - 1, i + 1);
  return series[i] + (series[j] - series[i]) * (f - i);
}

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
  timeOf,
  readout,
  corner,
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
  /** A pass's own time at the cursor — shifted when the passes are lined
   * up at the lip (2026-11-06); the cursor itself otherwise. */
  timeOf?: (p: SimulationPass) => number;
  readout: React.ReactNode;
  /** Drawn in the top-left corner: the switch between the two clocks. */
  corner?: React.ReactNode;
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
  const bikePx = Math.max(BIKE_MIN_PX, Math.min(BIKE_MAX_PX, BIKE_ICON_M * sx));

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
  const nowOf = (p: SimulationPass) => (timeOf ? timeOf(p) : cursorMs);
  const dotOf = (p: SimulationPass, atMs = nowOf(p)) => {
    const shape = shapeOf(p);
    if (!shape || !p.flight) return null;
    const v = Math.hypot(shape.vx, shape.vy);
    const t = (atMs - p.flight.takeoffMs) / 1000;
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
  // The bike's angle on the drawing, degrees, clockwise from the right
  // (2026-11-06). On the ramps, the ramp's. In the air, the angle it left
  // the lip at turned by what the pitch gyro measured — the real angle
  // taken through the drawing's taller height scale, so a bike that turns
  // with its arc stays on it and one that turns more is seen to. Without
  // the bike's forward known, it follows the arc.
  const tangentAt = (p: SimulationPass, atMs: number) => {
    const a = dotOf(p, atMs - 10);
    const b = dotOf(p, atMs + 10);
    return a && b ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI : 0;
  };
  const angleOf = (p: SimulationPass) => {
    const shape = shapeOf(p);
    const now = nowOf(p);
    if (!shape || !p.flight?.pitchDeg) return tangentAt(p, now);
    const series = p.flight.pitchDeg;
    const flying = (t: number) => {
      const lipDeg = (Math.atan2(shape.vy, shape.vx) * 180) / Math.PI;
      const real = Math.max(-80, Math.min(80, lipDeg - pitchAt(series, t)));
      return (
        (-Math.atan((Math.tan((real * Math.PI) / 180) * sy) / sx) * 180) /
        Math.PI
      );
    };
    const t = (now - p.flight.takeoffMs) / 1000;
    if (t < 0) return tangentAt(p, now);
    if (t <= shape.airtimeS) return flying(t);
    const settled = tangentAt(p, now);
    const f = (t - shape.airtimeS) / SETTLE_S;
    if (f >= 1) return settled;
    const from = flying(shape.airtimeS);
    return from + (settled - from) * f;
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
  // A pass's whole ride on the drawing, up to `t` s after its take-off: up
  // the kicker from the plate's edge, the arc, and down the landing to the
  // far edge — the line the dot follows (by request, 2026-10-29: the dashes
  // went on past the landing).
  const ridePoints = (shape: FlightShape, t: number) => {
    const v = Math.hypot(shape.vx, shape.vy);
    const steps = 24;
    const pts: [number, number][] = [];
    const runIn = Math.max(fromM, Math.min(0, v * t));
    for (let i = 0; i <= steps; i++) {
      const m = fromM + ((runIn - fromM) * i) / steps;
      pts.push([X(m), groundY - kickerAt(m)]);
    }
    if (t <= 0) return pts;
    pts.push(...arcPoints(shape, t).slice(1));
    if (t <= shape.airtimeS) return pts;
    const out = Math.min(toM, shape.distanceM + v * (t - shape.airtimeS));
    for (let i = 1; i <= steps; i++) {
      const m = shape.distanceM + ((out - shape.distanceM) * i) / steps;
      pts.push([X(m), groundY - landingAt(m, shape.distanceM)]);
    }
    return pts;
  };
  const flownPieces = (p: SimulationPass, shape: FlightShape) => {
    if (!p.flight) return [];
    const t = (nowOf(p) - p.flight.takeoffMs) / 1000;
    const pts = ridePoints(shape, t);
    if (pts.length < 2) return [];
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

  // The marks and the figures are the reference's (by request,
  // 2026-11-06): the drawing is laid out on its run, and each pass's own
  // airtime and distance stand in the list. Another pass's only when the
  // reference never left the ground.
  const shown = shapeOf(reference) ? reference : followed;
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
          {order.map((p, i) => {
            // Drawn last is on top, at full strength; each bike under it
            // a little fainter (by request, 2026-11-06), so the stack
            // reads when they fly together.
            const depth = order.length - 1 - i;
            const bikeOpacity = Math.max(0.3, 1 - 0.22 * depth);
            const shape = shapeOf(p);
            const dot = dotOf(p);
            return (
              <g key={p.key} className={inkOf(p)}>
                {/* The whole flight thin, dashed and grey; the part
                    flown, solid in colour (by request, 2026-10-29). */}
                {shape && (
                  <path
                    d={line(ridePoints(shape, Infinity))}
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
                  <Bike
                    x={dot.x}
                    y={dot.y}
                    angleDeg={angleOf(p)}
                    widthPx={bikePx}
                    opacity={bikeOpacity}
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
            pill
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
            pill
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
      {corner && <div className="absolute top-3 left-3">{corner}</div>}
      {/* The flight's figures left the top corner (by request, 2026-11-06):
          each pass's are in its pill under the plate. */}
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

/** The app's own bike (bike-type-icon's Downhill, by request,
 * 2026-11-06), its paths in the icon's 101 × 61 box. */
const BIKE_PATHS = [
  "M17.9713 58.6135C26.792 58.6135 33.9426 51.4629 33.9426 42.6422C33.9426 33.8214 26.792 26.6708 17.9713 26.6708C9.1506 26.6708 2 33.8214 2 42.6422C2 51.4629 9.1506 58.6135 17.9713 58.6135Z",
  "M82.9058 58.6135C91.7265 58.6135 98.8771 51.4629 98.8771 42.6422C98.8771 33.8214 91.7265 26.6708 82.9058 26.6708C74.085 26.6708 66.9344 33.8214 66.9344 42.6422C66.9344 51.4629 74.085 58.6135 82.9058 58.6135Z",
  "M82.9058 42.9633L67.6755 4.26874L74.4589 2.00055",
  "M47.0563 42.3951L38.2361 15.3657",
  "M41.2347 23.4495L69.3416 8.50165L47.0563 42.6422",
  "M31.3803 13.9799L42.6461 12.5547",
  "M48.2372 27.8395L53.7221 25.5719",
  "M47.0562 42.6422L17.7846 42.7117L43.1897 30.5463",
];
/** The bike drawn to the run's scale (by request, 2026-11-06): a
 * wheelbase of about 1.25 m, the icon's axles 65 of its 101 units apart —
 * so the icon spans ~1.94 m of ground. Held between these, px, so a short
 * hop still shows a bike and a long one is not covered by it. */
const BIKE_WHEELBASE_M = 1.25;
const BIKE_ICON_M = (BIKE_WHEELBASE_M * 101) / 65;
const BIKE_MIN_PX = 36;
const BIKE_MAX_PX = 150;

/** A bike seen from the side, its wheels standing on (x, y) — where the
 * dot was — and turned by `angleDeg`, clockwise, in the pass's colour. */
function Bike({
  x,
  y,
  angleDeg,
  widthPx,
  opacity = 1,
}: {
  x: number;
  y: number;
  angleDeg: number;
  widthPx: number;
  opacity?: number;
}) {
  const k = widthPx / 101;
  return (
    <g
      transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${angleDeg.toFixed(1)}) scale(${k.toFixed(4)}) translate(-50.44,-60)`}
      opacity={opacity}
      stroke="currentColor"
      // About 3 px whatever the size (2026-11-06, a little thicker).
      strokeWidth={3 / k}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      {BIKE_PATHS.map((d) => (
        <path key={d.slice(0, 16)} d={d} />
      ))}
    </g>
  );
}

function Mark({
  x,
  y,
  title,
  value,
  pill = false,
}: {
  x: number;
  y: number;
  title: string;
  value: string;
  /** In a small pill of its own (by request, 2026-11-06): the take-off's
   * and the landing's, under the ground. */
  pill?: boolean;
}) {
  return (
    <div
      className={
        "pointer-events-none absolute -translate-x-1/2 text-center whitespace-nowrap" +
        (pill
          ? " rounded-[10px] bg-card px-2.5 py-1 ring-1 ring-foreground/10"
          : "")
      }
      style={{ left: x, top: y }}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground tabular-nums">{value}</p>
    </div>
  );
}
