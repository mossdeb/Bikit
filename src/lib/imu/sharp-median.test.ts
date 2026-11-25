import { describe, expect, it } from "vitest";
import {
  contiguousSegments,
  medianFilter,
  sharpMedianRaw,
  sharpRawToMm,
} from "./sharp-median";

describe("medianFilter", () => {
  it("keeps the spec's example centre at 1588, the 1712 spike ignored", () => {
    const w = [1587, 1586, 1590, 1588, 1585, 1712, 1589, 1586, 1588, 1591, 1587];
    expect(medianFilter(w, 11)[5]).toBe(1588);
  });

  it("uses a shorter window at the ends", () => {
    // i=0 sees [5, 1, 9] → 5; i=1 four values → mean of the middle two.
    expect(Array.from(medianFilter([5, 1, 9, 2, 7], 5))).toEqual([
      5, 3.5, 5, 4.5, 7,
    ]);
  });

  it("leaves non-finite samples NaN and out of the windows", () => {
    const out = medianFilter([1, NaN, 3], 3);
    expect(out[0]).toBe(1);
    expect(out[1]).toBeNaN();
    expect(out[2]).toBe(3);
  });

  it("refuses an even window", () => {
    expect(() => medianFilter([1, 2], 4)).toThrow();
  });
});

describe("sharpRawToMm", () => {
  it("reads the table's points and interpolates between them", () => {
    expect(sharpRawToMm(1633)).toBe(100);
    expect(sharpRawToMm((1633 + 1373) / 2)).toBeCloseTo(110);
  });

  it("is NaN outside the table, never clamped", () => {
    expect(sharpRawToMm(3996)).toBeNaN();
    expect(sharpRawToMm(400)).toBeNaN();
  });
});

describe("segments", () => {
  it("splits on gaps over 10 ms and on a clock that does not advance", () => {
    expect(contiguousSegments([0, 2, 4, 20, 22, 22, 24])).toEqual([
      [0, 3],
      [3, 5],
      [5, 7],
    ]);
  });

  it("never lets a window cross a gap", () => {
    const tMs = new Float64Array([0, 2, 4, 30, 32, 34]);
    const raw = new Uint16Array([10, 10, 10, 900, 900, 900]);
    expect(Array.from(sharpMedianRaw({ tMs, raw }, 5))).toEqual([
      10, 10, 10, 900, 900, 900,
    ]);
  });
});
