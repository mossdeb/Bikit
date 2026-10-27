import { describe, expect, it } from "vitest";
import type { ImuMountOrientation, ImuRiderSag } from "./format";
import {
  rearMinusFrontDropMm,
  riderAttitude,
  riderSagDropsMm,
} from "./rider-sag";

/** A sensor mounted with its x forward, y left and z up. */
const level: ImuMountOrientation = {
  up: [0, 0, 1],
  front: [1, 0, 0],
  left: [0, 1, 0],
  confidence: 1,
  voteCount: 10,
  calibrationCount: 1,
};

/** The specific force of a frame pitched nose up by `deg`: the forward
 * axis reads +sin. */
function sagAt(deg: number, rollDeg = 0): ImuRiderSag {
  const p = (deg * Math.PI) / 180;
  const r = (rollDeg * Math.PI) / 180;
  return {
    gravityG: [Math.sin(p), Math.cos(p) * Math.sin(r), Math.cos(p) * Math.cos(r)],
    accelStddevG: 0.002,
    gyroStddevDps: 0.05,
    sampleCount: 1600,
    calibrationCount: 1,
  };
}

describe("riderAttitude", () => {
  it("reads the frame's pitch and roll with the rider on", () => {
    const a = riderAttitude(sagAt(1.2, -0.5), level)!;
    expect(a.pitchDeg).toBeCloseTo(1.2, 6);
    expect(a.rollDeg).toBeCloseTo(-0.5, 6);
  });

  it("reads it in the bike's frame, whatever way the sensor is mounted", () => {
    // The sensor's x points left, its y back, its z up.
    const turned: ImuMountOrientation = {
      ...level,
      front: [0, -1, 0],
      left: [1, 0, 0],
    };
    const p = (0.8 * Math.PI) / 180;
    const a = riderAttitude(
      { ...sagAt(0), gravityG: [0, -Math.sin(p), Math.cos(p)] },
      turned,
    )!;
    expect(a.pitchDeg).toBeCloseTo(0.8, 6);
    expect(a.rollDeg).toBeCloseTo(0, 6);
  });

  it("is nothing without the step or without an orientation", () => {
    expect(riderAttitude(undefined, level)).toBeNull();
    expect(riderAttitude(sagAt(1), undefined)).toBeNull();
    expect(
      riderAttitude({ ...sagAt(1), gravityG: [0, 0, 0] }, level),
    ).toBeNull();
  });
});

describe("rearMinusFrontDropMm", () => {
  it("turns the frame's pitch into the difference between the two ends", () => {
    // 1 mm over a 1250 mm wheelbase is ~0.046°.
    expect(rearMinusFrontDropMm(0.0458, 1250)).toBeCloseTo(1, 1);
    expect(rearMinusFrontDropMm(-1, 1250)).toBeCloseTo(-21.8, 1);
  });
});

describe("riderSagDropsMm", () => {
  it("stands the fork's sag up by the head angle and adds the difference", () => {
    // 34 mm along a 64° fork is ~30.6 mm of drop; R0126's 1.86° over
    // 1288 mm puts the rear ~41.8 mm deeper.
    const d = riderSagDropsMm({
      pitchDeg: 1.86,
      wheelbaseMm: 1288,
      headAngleDeg: 64,
      forkSagMm: 34,
    });
    expect(d.frontMm).toBeCloseTo(30.56, 1);
    expect(d.rearMm).toBeCloseTo(30.56 + 41.83, 0);
  });
});
