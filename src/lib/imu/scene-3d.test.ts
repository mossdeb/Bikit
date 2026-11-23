import { describe, expect, it } from "vitest";
import { buildScene, projector, seedFrom } from "./scene-3d";

// A trail curving through 120 m, the stretch its middle third.
const trail: [number, number][] = Array.from({ length: 61 }, (_, i) => [
  i * 2,
  20 * Math.sin(i / 10),
]);
const stretch = trail.slice(20, 41);

describe("buildScene", () => {
  it("makes the same made-up hills for the same place", () => {
    const seed = seedFrom(37.1, -7.8);
    const a = buildScene(trail, stretch, seed);
    const b = buildScene(trail, stretch, seed);
    expect(a.ground[100].a).toEqual(b.ground[100].a);
    expect(a.props.length).toBe(b.props.length);
    const c = buildScene(trail, stretch, seedFrom(38.7, -9.1));
    expect(c.ground[100].a).not.toEqual(a.ground[100].a);
  });

  it("lays the road on the ground, not above it nor under it", () => {
    const scene = buildScene(trail, stretch, seedFrom(37.1, -7.8));
    // The road's top: its sides' feet are just under it, by the curb.
    for (const face of scene.road.filter((f) => f.material === 2)) {
      const zs = [face.a[2], face.b[2], face.c[2]];
      expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(scene.roadHalfM * 2);
    }
    const [x, y] = trail[30];
    expect(Number.isFinite(scene.roadHeightAt(x, y))).toBe(true);
  });

  it("keeps the trees and rocks off the road", () => {
    const scene = buildScene(trail, stretch, seedFrom(37.1, -7.8));
    for (const face of scene.props) {
      const [x, y] = face.a;
      const d = Math.min(...trail.map(([tx, ty]) => Math.hypot(tx - x, ty - y)));
      expect(d).toBeGreaterThan(scene.roadHalfM * 2);
    }
  });
});

describe("projector", () => {
  it("puts the target in the middle and hides what is behind the camera", () => {
    const project = projector(
      { azimuth: 0, elevation: 0.6, target: [0, 0, 0], distance: 100, fov: 0.6 },
      800,
      400,
    );
    const [sx, sy] = project([0, 0, 0])!;
    expect(sx).toBeCloseTo(400, 6);
    expect(sy).toBeCloseTo(200, 6);
    // Looking north from the south: east is to the right.
    expect(project([10, 0, 0])![0]).toBeGreaterThan(400);
    expect(project([0, -200, 0])).toBeNull();
  });
});
