import type { GpsChannels } from "@/lib/imu/format";

/**
 * The map's track as a curve and not a chain of chords (by request,
 * 2026-10-26: zoomed in, every GPS fix showed as a corner). A centripetal
 * Catmull-Rom spline through the fixes: it passes through every one of
 * them — nothing is moved, only the stretch between two fixes is bent to
 * follow the ones around it — and, unlike the uniform kind, it neither
 * loops nor overshoots where fixes bunch up (a brake, a stop).
 *
 * Drawing only. Every figure keeps reading the fixes themselves; the
 * needle and the event marks ride the same curve so they stay on the line.
 */

type LatLon = [number, number];

const EARTH_R = 6_371_000;
const RAD = Math.PI / 180;
/** Points inserted between two fixes: one every this many metres, capped
 * — at 10 Hz fixes are 0.3–1.2 m apart, so a corner gets a handful. */
const STEP_M = 0.4;
const MAX_STEPS = 8;
/** Below this, m, two fixes are one place; the curve's knot spacing is
 * kept off zero there. */
const MIN_SPAN_M = 0.01;

/** Point p1→p2 at fraction f of the way, bent by p0 and p3 —
 * Barry–Goldman's pyramid with centripetal knots (α = ½), in metres around
 * p1. */
function curvePoint(
  p0: LatLon,
  p1: LatLon,
  p2: LatLon,
  p3: LatLon,
  f: number,
): LatLon {
  const cos = Math.cos(p1[0] * RAD);
  const toXY = (p: LatLon): [number, number] => [
    (p[1] - p1[1]) * RAD * EARTH_R * cos,
    (p[0] - p1[0]) * RAD * EARTH_R,
  ];
  const P = [toXY(p0), [0, 0] as [number, number], toXY(p2), toXY(p3)];
  const knot = (a: [number, number], b: [number, number]) =>
    Math.sqrt(Math.max(MIN_SPAN_M, Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0;
  const t1 = t0 + knot(P[0], P[1]);
  const t2 = t1 + knot(P[1], P[2]);
  const t3 = t2 + knot(P[2], P[3]);
  const t = t1 + f * (t2 - t1);
  const lerp = (
    a: [number, number],
    b: [number, number],
    ta: number,
    tb: number,
  ): [number, number] => {
    const w = (t - ta) / (tb - ta);
    return [a[0] + w * (b[0] - a[0]), a[1] + w * (b[1] - a[1])];
  };
  const A1 = lerp(P[0], P[1], t0, t1);
  const A2 = lerp(P[1], P[2], t1, t2);
  const A3 = lerp(P[2], P[3], t2, t3);
  const B1 = lerp(A1, A2, t0, t2);
  const B2 = lerp(A2, A3, t1, t3);
  const [x, y] = lerp(B1, B2, t1, t2);
  return [p1[0] + y / (RAD * EARTH_R), p1[1] + x / (RAD * EARTH_R * cos)];
}

/** The fix before i, or a mirror of the next one past the first. */
function before(pts: LatLon[], i: number): LatLon {
  if (i > 0) return pts[i - 1];
  const next = pts[Math.min(1, pts.length - 1)];
  return [2 * pts[0][0] - next[0], 2 * pts[0][1] - next[1]];
}

function after(pts: LatLon[], i: number): LatLon {
  if (i < pts.length - 1) return pts[i + 1];
  const prev = pts[Math.max(0, pts.length - 2)];
  const last = pts[pts.length - 1];
  return [2 * last[0] - prev[0], 2 * last[1] - prev[1]];
}

function metres(a: LatLon, b: LatLon): number {
  const cos = Math.cos(((a[0] + b[0]) / 2) * RAD);
  return Math.hypot(
    (b[1] - a[1]) * RAD * EARTH_R * cos,
    (b[0] - a[0]) * RAD * EARTH_R,
  );
}

/** The curve from pts[i] to pts[i + 1]: both fixes and the points between,
 * so consecutive pieces share their ends. */
export function smoothPiece(pts: LatLon[], i: number): LatLon[] {
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const steps = Math.min(MAX_STEPS, Math.floor(metres(p1, p2) / STEP_M));
  const out: LatLon[] = [p1];
  for (let s = 1; s <= steps; s++)
    out.push(
      curvePoint(before(pts, i), p1, p2, after(pts, i + 1), s / (steps + 1)),
    );
  out.push(p2);
  return out;
}

/** The curve from pts[i] to pts[i + 1] at fraction f of the way. */
export function curveAt(pts: LatLon[], i: number, f: number): LatLon {
  return curvePoint(before(pts, i), pts[i], pts[i + 1], after(pts, i + 1), f);
}

/** A whole line of fixes as a curve through them. */
export function smoothPolyline(pts: LatLon[]): LatLon[] {
  if (pts.length < 3) return pts.slice();
  const out: LatLon[] = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++)
    out.push(...smoothPiece(pts, i).slice(1));
  return out;
}

/** Where on the curve the bike was at an instant — gpsPositionAt's place
 * between two fixes, bent like the line it is drawn on. */
export function splinePositionAt(
  gps: GpsChannels,
  timeMs: number,
): { latDeg: number; lonDeg: number } | null {
  const t = gps.tMs;
  const m = t.length;
  if (m === 0) return null;
  if (timeMs <= t[0]) return { latDeg: gps.latDeg[0], lonDeg: gps.lonDeg[0] };
  if (timeMs >= t[m - 1])
    return { latDeg: gps.latDeg[m - 1], lonDeg: gps.lonDeg[m - 1] };
  let lo = 0;
  let hi = m - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= timeMs) lo = mid;
    else hi = mid;
  }
  const at = (k: number): LatLon => [gps.latDeg[k], gps.lonDeg[k]];
  const p1 = at(lo);
  const p2 = at(hi);
  const span = t[hi] - t[lo];
  const f = span > 0 ? (timeMs - t[lo]) / span : 0;
  const p0 =
    lo > 0 ? at(lo - 1) : ([2 * p1[0] - p2[0], 2 * p1[1] - p2[1]] as LatLon);
  const p3 =
    hi < m - 1
      ? at(hi + 1)
      : ([2 * p2[0] - p1[0], 2 * p2[1] - p1[1]] as LatLon);
  const [latDeg, lonDeg] = curvePoint(p0, p1, p2, p3, f);
  return { latDeg, lonDeg };
}
