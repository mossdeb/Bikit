import { describe, expect, it } from "vitest";
import type { ImuSessionData } from "./format";
import { lowPass, suppressPeriodicNoise, withEngineFilter } from "./mx-noise";

const RATE = 416;
const rms = (v: ArrayLike<number>, from = 0, to = v.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += v[i] * v[i];
  return Math.sqrt(s / (to - from));
};

/** An engine tone climbing from 100 Hz to 180 Hz, on 1 g. */
function engine(seconds: number, amplitude = 5): Float32Array {
  const n = seconds * RATE;
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    phase += (2 * Math.PI * (100 + (80 * i) / n)) / RATE;
    out[i] = 1 + amplitude * Math.sin(phase);
  }
  return out;
}

describe("periodic noise suppression", () => {
  it("takes out a tone that moves with the revs", () => {
    const raw = engine(10);
    const out = suppressPeriodicNoise(raw, RATE);
    const noise = (v: ArrayLike<number>) => {
      const x = Float32Array.from(v as ArrayLike<number>, (y) => y - 1);
      return rms(x, 300, x.length - 300);
    };
    expect(noise(out)).toBeLessThan(noise(raw) * 0.3);
  });

  it("keeps the slow part, the ride itself", () => {
    const raw = engine(10);
    const out = suppressPeriodicNoise(raw, RATE);
    let mean = 0;
    for (let i = 300; i < out.length - 300; i++) mean += out[i];
    expect(mean / (out.length - 600)).toBeCloseTo(1, 1);
  });

  it("keeps an impact in the middle of the noise", () => {
    const raw = engine(10, 1);
    const hit = 5 * RATE;
    for (let i = 0; i < 12; i++) raw[hit + i] += 20 * Math.exp(-i / 4);
    const out = suppressPeriodicNoise(raw, RATE);
    let top = 0;
    for (let i = hit - 5; i < hit + 15; i++) top = Math.max(top, out[i]);
    expect(top).toBeGreaterThan(15);
  });

  it("leaves a signal with no tone in it about as it was", () => {
    const n = 10 * RATE;
    const slow = Float32Array.from(
      { length: n },
      (_, i) => 1 + 0.5 * Math.sin((2 * Math.PI * 2 * i) / RATE),
    );
    const out = suppressPeriodicNoise(slow, RATE);
    for (let i = 300; i < n - 300; i += 50)
      expect(out[i]).toBeCloseTo(slow[i], 1);
  });
});

describe("the low-pass", () => {
  it("passes the slow and stops the fast, in place in time", () => {
    const n = 4 * RATE;
    const slow = Float32Array.from({ length: n }, (_, i) =>
      Math.sin((2 * Math.PI * 2 * i) / RATE),
    );
    const fast = Float32Array.from({ length: n }, (_, i) =>
      Math.sin((2 * Math.PI * 180 * i) / RATE),
    );
    expect(rms(lowPass(slow, RATE, 60), 200, n - 200)).toBeGreaterThan(0.65);
    expect(rms(lowPass(fast, RATE, 60), 200, n - 200)).toBeLessThan(0.05);
  });
});

describe("the session's filter", () => {
  const session = () => {
    const az = engine(10);
    const n = az.length;
    return {
      durationMs: (n / RATE) * 1000,
      events: [],
      channels: {
        tMs: Float64Array.from({ length: n }, (_, i) => (i / RATE) * 1000),
        ax: new Float32Array(n),
        ay: new Float32Array(n),
        az,
        gx: new Float32Array(n),
        gy: new Float32Array(n),
        gz: new Float32Array(n),
      },
    } as unknown as ImuSessionData;
  };

  it("cleans the acceleration and leaves the original as it was", () => {
    const original = session();
    const before = Float32Array.from(original.channels.az);
    const filtered = withEngineFilter(original);
    expect(original.channels.az).toEqual(before);
    expect(rms(filtered.channels.az, 300, 3800)).toBeLessThan(
      rms(before, 300, 3800) * 0.5,
    );
    expect(filtered.channels.gz).toBe(original.channels.gz);
  });

  it("keeps the vibration the sensor really sat in, for the warning", () => {
    const filtered = withEngineFilter(session());
    expect(filtered.unfilteredVibrationG![2000]).toBeGreaterThan(3);
  });
});
