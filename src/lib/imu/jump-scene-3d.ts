import type { Face, Vec3 } from "./scene-3d";
import { flightPositionAt, type FlightShape } from "./snapshot-simulation";

/**
 * A jump laid out for the 3D view (2026-11-23, a Dev info prototype): the
 * side view's model (imu-snapshot-jump-profile) in metres. The passes ride
 * one axis — x, metres from the lip — each in its own lane across it, and
 * fly their own arc (flightShape) between a kicker and a landing. As in the
 * side view the ramps are a drawing, not a measure: the logger knows
 * neither their heights nor their lengths. The GNSS is not used: on a jump
 * a few metres long its fixes are a second and a metre or two apart.
 */
export interface JumpLayout {
  /** The run drawn, m from the lip: the kicker's foot to past the landing. */
  fromM: number;
  toM: number;
  /** The kicker's face and the landing's slope, m along. */
  kickerM: number;
  landingM: number;
  /** The lip's height, m — the landing's top stands as high. */
  lipM: number;
  /** Where the drawn landing's top is, m from the lip: the reference's. */
  landingTopM: number;
}

/** The kicker's face and the landing's slope, shares of the longest run —
 * the side view's. */
const KICKER_SHARE = 0.28;
const LANDING_SHARE = 0.38;
/** The lip's height, a share of the kicker's length: the side view's
 * drawing (a 56 px lip on a ~110 px face). */
const LIP_SHARE = 0.45;
/** The arcs drawn this much taller than flown: a jump's height is a few
 * tenths of a metre beside a run of several — the side view draws it on a
 * scale of its own for the same reason. */
export const FLIGHT_HEIGHT_SCALE = 2;

export function jumpLayout(
  shapes: FlightShape[],
  reference: FlightShape | null,
): JumpLayout {
  const longest = Math.max(4, ...shapes.map((s) => s.distanceM));
  const kickerM = KICKER_SHARE * longest;
  const landingM = LANDING_SHARE * longest;
  const landingTopM = reference?.distanceM ?? longest;
  const drawnTo = Math.max(landingTopM + landingM, longest);
  const margin = 0.02 * (drawnTo + kickerM);
  return {
    fromM: -kickerM - margin,
    toM: drawnTo + margin,
    kickerM,
    landingM,
    lipM: LIP_SHARE * kickerM,
    landingTopM,
  };
}

/** The kicker's face rising to the lip, m over the ground. */
export function kickerHeight(layout: JumpLayout, m: number): number {
  const k = layout.kickerM;
  return m > 0 || m <= -k ? 0 : layout.lipM * ((m + k) / k) ** 2;
}

/** A landing whose top is at `top`, falling from the lip's height. */
export function landingHeight(layout: JumpLayout, m: number, top: number): number {
  const l = layout.landingM;
  return m < top || m >= top + l ? 0 : layout.lipM * (1 - (m - top) / l) ** 2;
}

/** Where a pass is `t` s after its take-off: m along, m over the ground.
 * Up the kicker before, its own arc in the air, down a landing set at its
 * own distance after — the side view's ride. */
export function rideAt(
  layout: JumpLayout,
  shape: FlightShape,
  t: number,
): { m: number; h: number } {
  const v = Math.hypot(shape.vx, shape.vy);
  if (t < 0) {
    const m = Math.max(layout.fromM, v * t);
    return { m, h: kickerHeight(layout, m) };
  }
  if (t <= shape.airtimeS) {
    const at = flightPositionAt(shape, t);
    return { m: at.x, h: layout.lipM + at.y * FLIGHT_HEIGHT_SCALE };
  }
  const m = Math.min(layout.toM, shape.distanceM + v * (t - shape.airtimeS));
  return { m, h: landingHeight(layout, m, shape.distanceM) };
}

/** A pass's ride from the run's start to `t` s after its take-off, as
 * points along it: the kicker, the arc and the landing each in steps. */
export function ridePath(
  layout: JumpLayout,
  shape: FlightShape,
  t: number,
  steps = 24,
): { m: number; h: number }[] {
  const v = Math.hypot(shape.vx, shape.vy);
  // The time it takes to ride from the run's start to the lip.
  const startT = layout.fromM / v;
  const pts: { m: number; h: number }[] = [];
  const end = Math.min(t, shape.airtimeS + (layout.toM - shape.distanceM) / v);
  const phases: [number, number][] = [
    [startT, Math.min(0, end)],
    [0, Math.min(shape.airtimeS, end)],
    [shape.airtimeS, end],
  ];
  for (const [a, b] of phases) {
    if (b <= a) continue;
    for (let i = pts.length ? 1 : 0; i <= steps; i++)
      pts.push(rideAt(layout, shape, a + ((b - a) * i) / steps));
  }
  return pts;
}

/** The two ramps as faces, across the road `halfWidth` either side of the
 * axis, on a ground at `groundZ(m)`, in the decorations' material — lighter
 * than the road and outlined, so they stand out on it (2026-11-23). The
 * kicker's back and the landing's knuckle as the side view draws them. */
export function rampFaces(
  layout: JumpLayout,
  halfWidth: number,
  groundZ: (m: number) => number,
): Face[] {
  const { kickerM: k, landingM: l, landingTopM: top } = layout;
  const curve = (from: number, to: number, at: (m: number) => number, n = 16) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const m = from + ((to - from) * i) / n;
      return [m, at(m)] as [number, number];
    });
  const kicker: [number, number][] = [
    ...curve(-k, 0, (m) => kickerHeight(layout, m)),
    [0, layout.lipM],
    [k * 0.35, 0],
  ];
  const landing: [number, number][] = [
    [top - l * 0.3, 0],
    [top, layout.lipM],
    ...curve(top, top + l, (m) => landingHeight(layout, m, top)).slice(1),
  ];
  const faces: Face[] = [];
  const w = halfWidth;
  for (const profile of [kicker, landing])
    for (let i = 0; i + 1 < profile.length; i++) {
      const [m0, h0] = profile[i];
      const [m1, h1] = profile[i + 1];
      const z0 = groundZ(m0);
      const z1 = groundZ(m1);
      const a: Vec3 = [m0, -w, z0 + h0];
      const b: Vec3 = [m0, w, z0 + h0];
      const c: Vec3 = [m1, w, z1 + h1];
      const d: Vec3 = [m1, -w, z1 + h1];
      faces.push({ a, b, c, material: 3 }, { a, b: c, c: d, material: 3 });
      // The two sides, from the ground up to the profile.
      for (const y of [-w, w]) {
        const g0: Vec3 = [m0, y, z0];
        const g1: Vec3 = [m1, y, z1];
        const t0: Vec3 = [m0, y, z0 + h0];
        const t1: Vec3 = [m1, y, z1 + h1];
        if (h0 > 0.001 || h1 > 0.001)
          faces.push({ a: g0, b: g1, c: t1, material: 3 }, { a: g0, b: t1, c: t0, material: 3 });
      }
    }
  return faces;
}
