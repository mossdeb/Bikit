import { describe, expect, it } from "vitest";
import type { SnapshotPassTrace } from "./snapshot";
import {
  flightPositionAt,
  flightShape,
  laneTrace,
  gapToReferenceAt,
  traceTimeAtProgress,
  traceValueAt,
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
