import { describe, expect, it } from "vitest";
import type { SnapshotPassTrace } from "./snapshot";
import {
  alignTrace,
  flightPositionAt,
  flightShape,
  gateTrace,
  ghostTrace,
  laneTrace,
  layoutTrace,
  gapToReferenceAt,
  traceTimeAtProgress,
  traceValueAt,
  widenedStretch,
  WIDEN_MAX_HALF_M,
} from "./snapshot-simulation";

/** A pass at a steady pace over its ground, a sample every 100 ms. */
function steady(durationMs: number): SnapshotPassTrace {
  const steps = Math.ceil(durationMs / 100);
  const progress = Array.from({ length: steps + 1 }, (_, k) =>
    Math.min(1, (k * 100) / durationMs),
  );
  return {
    durationMs,
    stepMs: 100,
    latDeg: progress.map(() => 0),
    lonDeg: progress.map(() => 0),
    progress,
    speedKmh: progress.map(() => 30),
    gForce: progress.map((_, k) => k),
  };
}

describe("the simulation's gaps", () => {
  it("finds when a share of the ground was covered", () => {
    expect(traceTimeAtProgress(steady(8000), 0.5)).toBeCloseTo(4000);
    expect(traceTimeAtProgress(steady(8000), 1)).toBe(8000);
    expect(traceTimeAtProgress(steady(8000), 0)).toBe(0);
  });

  it("reads a value between samples", () => {
    expect(traceValueAt(steady(8000), steady(8000).gForce, 150)).toBeCloseTo(
      1.5,
    );
    expect(traceValueAt(steady(8000), steady(8000).gForce, 99_000)).toBe(80);
  });

  it("puts a slower pass behind by its share of the difference", () => {
    const reference = steady(8000);
    const slower = steady(10_000);
    expect(gapToReferenceAt(slower, reference, 4000)).toBeCloseTo(1000);
    expect(gapToReferenceAt(slower, reference, 8000)).toBeCloseTo(2000);
    expect(gapToReferenceAt(steady(6000), reference, 8000)).toBeCloseTo(-2000);
    expect(gapToReferenceAt(slower, reference, 9500)).toBeCloseTo(2000);
    expect(gapToReferenceAt(slower, reference, -1)).toBeNull();
  });
});

describe("laneTrace", () => {
  const M = 1 / (6_371_000 * (Math.PI / 180));
  /** A line north along the reference, `east` metres to its side at each
   * share of the ground. */
  function north(durationMs: number, east: (p: number) => number) {
    const t = steady(durationMs);
    t.latDeg = t.progress.map((p) => p * 100 * M);
    t.lonDeg = t.progress.map((p) => east(p) * M);
    return t;
  }

  it("takes off a pass's steady offset and keeps it on the gates", () => {
    const reference = north(8000, () => 0);
    const lane = laneTrace(
      north(9000, () => 5),
      reference,
      1.25,
    );
    expect(lane.lonDeg[0] / M).toBeCloseTo(0, 6);
    expect(lane.latDeg[0] / M).toBeCloseTo(0, 6);
    expect(lane.latDeg.at(-1)! / M).toBeCloseTo(100, 6);
    expect(lane.lonDeg.at(-1)! / M).toBeCloseTo(0, 6);
  });

  it("keeps the line ridden, within the trail", () => {
    const reference = north(8000, () => 0);
    // Half a metre wider in the middle, on a 5 m GPS offset.
    const wide = laneTrace(
      north(8000, (p) => 5 + 0.5 * Math.sin(Math.PI * p)),
      reference,
      1.25,
    );
    const mid = Math.round((wide.lonDeg.length - 1) / 2);
    const ends = (wide.lonDeg[0] + wide.lonDeg.at(-1)!) / 2;
    expect((wide.lonDeg[mid] - ends) / M).toBeCloseTo(0.5, 1);
    const far = laneTrace(
      north(8000, (p) => 20 * Math.sin(Math.PI * p)),
      reference,
      1.25,
    );
    for (const lon of far.lonDeg)
      expect(Math.abs(lon / M)).toBeLessThanOrEqual(1.25 + 1e-6);
  });
});

describe("the smooth lane", () => {
  const M = 1 / (6_371_000 * (Math.PI / 180));
  function north(durationMs: number, east: (p: number) => number) {
    const t = steady(durationMs);
    t.latDeg = t.progress.map((p) => p * 100 * M);
    t.lonDeg = t.progress.map((p) => east(p) * M);
    return t;
  }

  it("reaches the edge softly, never past it", () => {
    const reference = north(8000, () => 0);
    const far = laneTrace(
      north(8000, (p) => 20 * Math.sin(Math.PI * p)),
      reference,
      1.25,
      { tangentSpanM: 10, softEdge: true },
    );
    const side = far.lonDeg.map((lon) => lon / M);
    for (const d of side) expect(Math.abs(d)).toBeLessThan(1.25);
    // No corner where the plain lane meets its edge: its sharpest bend, the
    // change from one step to the next, is well under the plain lane's.
    const bend = (xs: number[]) =>
      Math.max(
        ...xs.slice(2).map((d, k) => Math.abs(d - 2 * xs[k + 1] + xs[k])),
      );
    const plain = laneTrace(
      north(8000, (p) => 20 * Math.sin(Math.PI * p)),
      reference,
      1.25,
    ).lonDeg.map((lon) => lon / M);
    expect(bend(side)).toBeLessThan(bend(plain) / 2);
  });

  it("is a layout of its own", () => {
    const reference = north(8000, () => 0);
    const pass = north(8000, (p) => 0.5 * Math.sin(Math.PI * p));
    const smooth = layoutTrace("laneSmooth", pass, reference, 1.25);
    const mid = Math.round((smooth.lonDeg.length - 1) / 2);
    expect(smooth.lonDeg[mid] / M).toBeGreaterThan(0);
  });
});

describe("the other layouts", () => {
  const M = 1 / (6_371_000 * (Math.PI / 180));
  function north(durationMs: number, east: (p: number) => number) {
    const t = steady(durationMs);
    t.latDeg = t.progress.map((p) => p * 100 * M);
    t.lonDeg = t.progress.map((p) => east(p) * M);
    return t;
  }
  const reference = north(8000, () => 0);

  it("leaves the raw GPS as it was", () => {
    const pass = north(9000, () => 5);
    expect(layoutTrace("gps", pass, reference, 1.25)).toBe(pass);
  });

  it("aligns a whole line by its mean offset, keeping its shape", () => {
    const aligned = alignTrace(
      north(9000, (p) => 5 + 2 * p),
      reference,
    );
    // Mean offset 6 m: from −1 m at the entry to +1 m at the exit.
    expect(aligned.lonDeg[0] / M).toBeCloseTo(-1, 1);
    expect(aligned.lonDeg.at(-1)! / M).toBeCloseTo(1, 1);
  });

  it("pins a line to the gates, blending between", () => {
    const pinned = gateTrace(
      north(9000, (p) => 5 + 2 * p + Math.sin(Math.PI * p)),
      reference,
    );
    expect(pinned.lonDeg[0] / M).toBeCloseTo(0, 6);
    expect(pinned.lonDeg.at(-1)! / M).toBeCloseTo(0, 6);
    const mid = Math.round((pinned.lonDeg.length - 1) / 2);
    expect(pinned.lonDeg[mid] / M).toBeCloseTo(1, 1);
  });

  it("puts a ghost on the reference's line by its share of the ground", () => {
    const ghost = ghostTrace(
      north(9000, () => 5),
      reference,
    );
    for (const [k, lon] of ghost.lonDeg.entries()) {
      expect(lon).toBeCloseTo(0, 9);
      expect(ghost.latDeg[k] / M).toBeCloseTo(ghost.progress[k] * 100, 3);
    }
  });
});

describe("flightShape", () => {
  it("flies a jump as a ball would, landing as high as the lip", () => {
    const shape = flightShape(1000, 36)!;
    expect(shape.apexM).toBeCloseTo((9.81 * 1) / 8, 6);
    expect(shape.vy).toBeCloseTo(9.81 / 2, 6);
    expect(shape.distanceM).toBeCloseTo(Math.sqrt(100 - (9.81 / 2) ** 2), 6);
    expect(flightPositionAt(shape, 0.5).y).toBeCloseTo(shape.apexM, 6);
    expect(flightPositionAt(shape, 1).y).toBeCloseTo(0, 6);
    expect(flightPositionAt(shape, 5).x).toBeCloseTo(shape.distanceM, 6);
  });

  it("has no arc without a speed or a time in the air", () => {
    expect(flightShape(800, null)).toBeNull();
    expect(flightShape(0, 30)).toBeNull();
  });
});

describe("widenedStretch", () => {
  const M = 1 / (6_371_000 * (Math.PI / 180));
  function north(durationMs: number, east: (p: number) => number) {
    const t = steady(durationMs);
    t.latDeg = t.progress.map((p) => p * 100 * M);
    t.lonDeg = t.progress.map((p) => east(p) * M);
    return t;
  }
  const reference = north(8000, () => 0);
  const at = (w: { latDeg: number[] }, northM: number) =>
    w.latDeg.findIndex((lat) => lat / M >= northM);

  it("opens the trail where a line leaves it, on that side", () => {
    // 3 m to the east (the right, going north) from 40 m to 60 m.
    const w = widenedStretch(reference, [
      north(8000, (p) => (p >= 0.4 && p <= 0.6 ? 3 : 0)),
    ]);
    expect(w.rightM[at(w, 50)]).toBeGreaterThan(3);
    expect(w.leftM[at(w, 50)]).toBeLessThan(1);
    expect(w.rightM[at(w, 5)]).toBeLessThan(1);
  });

  it("swells and narrows instead of stepping", () => {
    const w = widenedStretch(reference, [
      north(8000, (p) => (p >= 0.4 && p <= 0.6 ? 3 : 0)),
    ]);
    const steps = w.rightM.slice(1).map((r, k) => Math.abs(r - w.rightM[k]));
    expect(Math.max(...steps)).toBeLessThan(0.5);
  });

  it("stops at its limit", () => {
    const w = widenedStretch(reference, [north(8000, () => 20)]);
    for (const r of w.rightM)
      expect(r).toBeLessThanOrEqual(WIDEN_MAX_HALF_M + 1e-9);
  });
});
