import { describe, expect, it } from "vitest";
import type { GpsChannels } from "./format";
import { smoothPolyline, splinePositionAt } from "./track-spline";

const R = 6_371_000;
const RAD = Math.PI / 180;
const LAT0 = 37.18;
const LON0 = -7.91;

/** A point east and north of the origin, m. */
function at(x: number, y: number): [number, number] {
  return [LAT0 + y / (R * RAD), LON0 + x / (R * RAD * Math.cos(LAT0 * RAD))];
}

/** A quarter circle of radius 10 m, a fix every 1.5 m. */
const arc = Array.from({ length: 11 }, (_, k) => {
  const a = (k / 10) * (Math.PI / 2);
  return at(10 * Math.cos(a), 10 * Math.sin(a));
});

function distanceFromCentre(p: [number, number]): number {
  const x = (p[1] - LON0) * RAD * R * Math.cos(LAT0 * RAD);
  const y = (p[0] - LAT0) * RAD * R;
  return Math.hypot(x, y);
}

describe("smoothPolyline", () => {
  it("passes through every fix", () => {
    const out = smoothPolyline(arc);
    for (const p of arc)
      expect(out.some((q) => q[0] === p[0] && q[1] === p[1])).toBe(true);
  });

  it("bends the chords onto the curve they sample", () => {
    const out = smoothPolyline(arc);
    expect(out.length).toBeGreaterThan(arc.length);
    // A chord's middle sits ~2.8 cm inside a 10 m circle; the curve's
    // points stay within a few millimetres of it.
    for (const p of out) expect(distanceFromCentre(p)).toBeCloseTo(10, 1);
  });

  it("does not loop where two fixes are one place", () => {
    const stop = [at(0, 0), at(5, 0), at(5, 0), at(10, 0)];
    for (const p of smoothPolyline(stop)) {
      const y = (p[0] - LAT0) * RAD * R;
      expect(Math.abs(y)).toBeLessThan(0.01);
    }
  });
});

describe("splinePositionAt", () => {
  it("is the fix at a fix's instant and on the curve between", () => {
    const n = arc.length;
    const gps = {
      tMs: Float64Array.from({ length: n }, (_, k) => k * 100),
      latDeg: Float64Array.from(arc.map((p) => p[0])),
      lonDeg: Float64Array.from(arc.map((p) => p[1])),
    } as unknown as GpsChannels;
    const p = splinePositionAt(gps, 300)!;
    expect(p.latDeg).toBeCloseTo(arc[3][0], 12);
    expect(p.lonDeg).toBeCloseTo(arc[3][1], 12);
    const mid = splinePositionAt(gps, 350)!;
    expect(distanceFromCentre([mid.latDeg, mid.lonDeg])).toBeCloseTo(10, 2);
  });
});
