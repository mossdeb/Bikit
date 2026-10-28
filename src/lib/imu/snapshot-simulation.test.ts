import { describe, expect, it } from "vitest";
import type { SnapshotPassTrace } from "./snapshot";
import {
  alignTrace,
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

describe("alignTrace", () => {
  it("moves a line by its mean distance from the reference", () => {
    const reference = steady(8000);
    reference.latDeg = reference.progress.map((p) => p * 0.001);
    reference.lonDeg = reference.progress.map(() => 0);
    const beside = steady(9000);
    beside.latDeg = beside.progress.map((p) => p * 0.001);
    beside.lonDeg = beside.progress.map(() => 0.00005);
    const aligned = alignTrace(beside, reference);
    expect(aligned.lonDeg[0]).toBeCloseTo(0, 9);
    expect(aligned.latDeg.at(-1)).toBeCloseTo(0.001, 9);
    expect(aligned.durationMs).toBe(9000);
  });
});
