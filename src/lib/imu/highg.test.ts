import { describe, expect, it } from "vitest";
import type { ImuHighGEvent } from "./format";
import { highGNear, highGSummary, highGWidthMs } from "./highg";

function hit(timeMs: number, peakLsb: number, wide = 1): ImuHighGEvent {
  const x = new Float32Array(32);
  for (let k = 16; k < 16 + wide; k++) x[k] = peakLsb * 0.049;
  const z = new Float32Array(32).fill(0.98);
  const peakG = Math.hypot(peakLsb * 0.049, 0.98);
  return {
    timeMs,
    peakG,
    peakIndex: 16,
    sampleRateHz: 800,
    preTriggerSamples: 16,
    x,
    y: new Float32Array(32),
    z,
  };
}

describe("highGNear", () => {
  const hits = [hit(1000, 200), hit(1060, 300), hit(5000, 400)];

  it("gives an instant the hardest shock within reach", () => {
    expect(highGNear(hits, 1030)?.timeMs).toBe(1060);
    expect(highGNear(hits, 4950)?.timeMs).toBe(5000);
  });

  it("gives nothing past the window, or on a file without the sensor", () => {
    expect(highGNear(hits, 2000)).toBeNull();
    expect(highGNear(hits, 1000, 10)?.timeMs).toBe(1000);
    expect(highGNear(undefined, 1000)).toBeNull();
  });
});

describe("highGWidthMs", () => {
  it("counts the samples over half the peak, at the window's own rate", () => {
    expect(highGWidthMs(hit(0, 200, 1))).toBeCloseTo(1.25, 6);
    expect(highGWidthMs(hit(0, 200, 4))).toBeCloseTo(5, 6);
  });
});

describe("highGSummary", () => {
  it("names the hardest shock, and tells no sensor from no shocks", () => {
    const s = highGSummary([hit(1000, 200), hit(3000, 300)])!;
    expect(s.count).toBe(2);
    expect(s.maxAtMs).toBe(3000);
    expect(s.maxG).toBeCloseTo(Math.hypot(300 * 0.049, 0.98), 5);
    expect(highGSummary([])).toEqual({ count: 0, maxG: null, maxAtMs: null });
    expect(highGSummary(undefined)).toBeNull();
  });
});
