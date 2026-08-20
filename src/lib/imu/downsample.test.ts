import { describe, expect, it } from "vitest";
import { lowerBoundIndex, minMaxEnvelope, upperBoundIndex } from "./downsample";

function ramp(n: number): { t: Float64Array; v: Float32Array } {
  const t = new Float64Array(n);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    t[i] = i * 10;
    v[i] = Math.sin(i / 7);
  }
  return { t, v };
}

describe("minMaxEnvelope", () => {
  it("returns raw samples when they are already at drawing resolution", () => {
    const { t, v } = ramp(50);
    const out = minMaxEnvelope(t, v, 0, 49, 100);
    expect(out).toHaveLength(50);
    expect(out[0]).toEqual({ tMs: 0, value: v[0] });
    expect(out[49].tMs).toBe(490);
  });

  it("caps the output near two points per bucket however many samples go in", () => {
    const { t, v } = ramp(36000);
    const out = minMaxEnvelope(t, v, 0, 35999, 400);
    expect(out.length).toBeLessThanOrEqual(800);
    expect(out.length).toBeGreaterThan(400);
  });

  it("never loses the extremes — a one-sample spike survives", () => {
    const { t, v } = ramp(10000);
    v[7777] = 99; // the impact
    v[3333] = -99;
    const out = minMaxEnvelope(t, v, 0, 9999, 100);
    const values = out.map((p) => p.value);
    expect(Math.max(...values)).toBe(99);
    expect(Math.min(...values)).toBe(-99);
  });

  it("keeps time monotonic within each bucket pair", () => {
    const { t, v } = ramp(5000);
    const out = minMaxEnvelope(t, v, 0, 4999, 50);
    for (let i = 1; i < out.length; i += 2) {
      // Pairs from one bucket come in occurrence order.
      if (out[i - 1] && out[i]) expect(out[i].tMs).toBeGreaterThanOrEqual(out[i - 1].tMs);
    }
  });

  it("respects the window bounds", () => {
    const { t, v } = ramp(1000);
    const out = minMaxEnvelope(t, v, 100, 199, 400);
    expect(out[0].tMs).toBe(1000);
    expect(out[out.length - 1].tMs).toBe(1990);
  });

  it("handles an empty or inverted window", () => {
    const { t, v } = ramp(10);
    expect(minMaxEnvelope(t, v, 5, 4, 10)).toEqual([]);
  });
});

describe("window bounds", () => {
  const t = new Float64Array([0, 10, 20, 30]);

  it("lowerBoundIndex finds the first sample at or after a time", () => {
    expect(lowerBoundIndex(t, -5)).toBe(0);
    expect(lowerBoundIndex(t, 10)).toBe(1);
    expect(lowerBoundIndex(t, 11)).toBe(2);
    expect(lowerBoundIndex(t, 31)).toBe(4);
  });

  it("upperBoundIndex finds the last sample at or before a time", () => {
    expect(upperBoundIndex(t, 35)).toBe(3);
    expect(upperBoundIndex(t, 30)).toBe(3);
    expect(upperBoundIndex(t, 29)).toBe(2);
    expect(upperBoundIndex(t, -1)).toBe(0);
  });
});
