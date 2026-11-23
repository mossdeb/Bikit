import { describe, expect, it } from "vitest";
import { flightShape } from "./snapshot-simulation";
import {
  FLIGHT_HEIGHT_SCALE,
  jumpLayout,
  kickerHeight,
  rampFaces,
  rideAt,
  ridePath,
} from "./jump-scene-3d";

// 0.6 s in the air at 25 km/h: about 4 m long, 0.44 m high.
const shape = flightShape(600, 25)!;
const layout = jumpLayout([shape], shape);

describe("jumpLayout", () => {
  it("draws the kicker before the lip and the landing at the reference's run", () => {
    expect(layout.fromM).toBeLessThan(-layout.kickerM);
    expect(layout.landingTopM).toBeCloseTo(shape.distanceM, 6);
    expect(layout.toM).toBeGreaterThan(layout.landingTopM + layout.landingM);
    expect(kickerHeight(layout, 0)).toBeCloseTo(layout.lipM, 6);
    expect(kickerHeight(layout, -layout.kickerM)).toBe(0);
  });
});

describe("rideAt", () => {
  it("leaves the lip, tops out over the middle and lands at its run", () => {
    expect(rideAt(layout, shape, 0)).toEqual({ m: 0, h: layout.lipM });
    const apex = rideAt(layout, shape, shape.airtimeS / 2);
    expect(apex.m).toBeCloseTo(shape.distanceM / 2, 6);
    expect(apex.h).toBeCloseTo(layout.lipM + shape.apexM * FLIGHT_HEIGHT_SCALE, 6);
    const down = rideAt(layout, shape, shape.airtimeS);
    expect(down.m).toBeCloseTo(shape.distanceM, 6);
    expect(down.h).toBeCloseTo(layout.lipM, 6);
  });

  it("rides the kicker before the lip", () => {
    const before = rideAt(layout, shape, -0.05);
    expect(before.m).toBeLessThan(0);
    expect(before.h).toBeGreaterThan(0);
    expect(before.h).toBeLessThan(layout.lipM);
  });
});

describe("ridePath", () => {
  it("runs from the start of the run to the moment asked, never back", () => {
    const pts = ridePath(layout, shape, shape.airtimeS / 2);
    expect(pts[0].m).toBeCloseTo(layout.fromM, 6);
    expect(pts[pts.length - 1].m).toBeCloseTo(shape.distanceM / 2, 6);
    for (let i = 1; i < pts.length; i++) expect(pts[i].m).toBeGreaterThanOrEqual(pts[i - 1].m);
  });
});

describe("rampFaces", () => {
  it("stands the ramps on the ground, as high as the lip and no higher", () => {
    const faces = rampFaces(layout, 2, () => 10);
    const zs = faces.flatMap((f) => [f.a[2], f.b[2], f.c[2]]);
    expect(Math.min(...zs)).toBeCloseTo(10, 6);
    expect(Math.max(...zs)).toBeCloseTo(10 + layout.lipM, 6);
  });
});
