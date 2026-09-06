import { describe, expect, it } from "vitest";
import type { ImuSessionData } from "./format";
import { DEFAULT_SENSOR_SCALES, realignImuWords } from "./realign";

/**
 * A ride the sensor would record: gravity where the logger's calibration
 * puts it (sideways mount), road vibration, a long turn with a real yaw
 * rate — then the six words of each frame rotated by k over given
 * stretches, the way the firmware's files arrive. The repair must give the
 * truth back and say where it had to act.
 */

const RATE = 416;
const A = DEFAULT_SENSOR_SCALES.accelGPerLsb;
const G = DEFAULT_SENSOR_SCALES.gyroDpsPerLsb;

// Deterministic noise, so a failure reproduces.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

function trueRide(seconds: number) {
  const n = seconds * RATE;
  const rnd = rng(7);
  const tMs = new Float64Array(n);
  const ch = [0, 1, 2, 3, 4, 5].map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    tMs[i] = t * 1000;
    // Gravity on -Y/+Z (the logger's real mount), 0.08 g of vibration, and
    // a bump every 7 s.
    const bump = Math.abs((t % 7) - 3.5) < 0.05 ? 3 : 0;
    ch[0][i] = -0.03 + 0.08 * rnd() + bump * rnd();
    ch[1][i] = -0.84 + 0.08 * rnd();
    ch[2][i] = 0.55 + 0.08 * rnd() + bump;
    // Gyro: noise, plus a 40 °/s turn between 25 s and 31 s.
    const turn = t > 25 && t < 31 ? 40 : 0;
    ch[3][i] = 2 * rnd();
    ch[4][i] = 2 * rnd() + turn * 0.3;
    ch[5][i] = 2 * rnd() + turn;
  }
  return { tMs, ch };
}

/** Stores the truth rotated by k over [fromS, toS): stored word j holds
 * channel (j + k) mod 6, rescaled into word j's unit. */
function rotateStored(
  truth: Float32Array[],
  tMs: Float64Array,
  spans: { fromS: number; toS: number; k: number }[],
): Float32Array[] {
  const n = tMs.length;
  const scale = [A, A, A, G, G, G];
  const out = truth.map((c) => Float32Array.from(c));
  for (const span of spans) {
    for (let i = 0; i < n; i++) {
      const t = tMs[i] / 1000;
      if (t < span.fromS || t >= span.toS) continue;
      for (let j = 0; j < 6; j++) {
        const c = (j + span.k) % 6;
        out[j][i] = (truth[c][i] / scale[c]) * scale[j];
      }
    }
  }
  return out;
}

function session(tMs: Float64Array, ch: Float32Array[]): ImuSessionData {
  return {
    format: "test",
    sessionId: null,
    durationMs: tMs[tMs.length - 1],
    sampleRateHz: RATE,
    sampleCount: tMs.length,
    channels: {
      tMs,
      ax: ch[0],
      ay: ch[1],
      az: ch[2],
      gx: ch[3],
      gy: ch[4],
      gz: ch[5],
      gForce: null,
    },
    gps: null,
    events: [],
    calibration: null,
    aligned: false,
    mounting: null,
  };
}

function maxAbsDiff(a: Float32Array, b: Float32Array, from = 0, to = a.length) {
  let m = 0;
  for (let i = from; i < to; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

describe("realignImuWords", () => {
  it("leaves an aligned recording untouched and reports nothing rotated", () => {
    const { tMs, ch } = trueRide(20);
    const s = session(tMs, ch);
    const out = realignImuWords(s);
    expect(out.channels.ax).toBe(s.channels.ax);
    expect(out.realignment?.rotatedMs).toBe(0);
    expect(out.realignment?.segments.map((x) => x.k)).toEqual([0]);
  });

  it("finds the rotated stretches, including the swap through a turn, and restores the truth", () => {
    const { tMs, ch } = trueRide(60);
    // k=3 (gyro/accel triplets swapped) across the turn, then a one-word
    // rotation, then clean again.
    const stored = rotateStored(ch, tMs, [
      { fromS: 20, toS: 40, k: 3 },
      { fromS: 40, toS: 50.3, k: 1 },
    ]);
    const out = realignImuWords(session(tMs, stored));
    const r = out.realignment!;
    expect(r.segments.map((x) => x.k)).toEqual([0, 3, 1, 0]);
    // Boundaries within a tenth of a second.
    expect(r.segments[1].fromMs).toBeGreaterThan(19_900);
    expect(r.segments[1].fromMs).toBeLessThan(20_100);
    expect(r.segments[2].fromMs).toBeGreaterThan(39_900);
    expect(r.segments[2].fromMs).toBeLessThan(40_100);
    expect(r.segments[3].fromMs).toBeGreaterThan(50_200);
    expect(r.segments[3].fromMs).toBeLessThan(50_400);
    expect(r.rotatedMs).toBeGreaterThan(30_100);
    expect(r.rotatedMs).toBeLessThan(30_500);
    // Everything the repair touched now looks like physics again.
    expect(r.unresolvedMs).toBe(0);
    // The channels are the truth again, everywhere but the samples right
    // at a refined boundary (one refinement step of slack).
    const c = out.channels;
    const restored = [c.ax, c.ay, c.az, c.gx, c.gy, c.gz];
    const slack = 10;
    const bounds = [20, 40, 50.3].map((s) => Math.round(s * RATE));
    for (let ch6 = 0; ch6 < 6; ch6++) {
      let from = 0;
      for (const b of [...bounds, tMs.length]) {
        const to = Math.min(b - slack, tMs.length);
        if (to > from)
          expect(maxAbsDiff(restored[ch6], ch[ch6], from, to)).toBeLessThan(
            1e-3,
          );
        from = b + slack;
      }
    }
    // The wrong reading is gone: "az" no longer holds 1 g of gyro.
    expect(out.channels.gz[30 * RATE]).toBeLessThan(60);
    expect(out.channels.az[30 * RATE]).toBeGreaterThan(0.4);
  });

  it("does not judge a recording shorter than two windows", () => {
    const { tMs, ch } = trueRide(1);
    const s = session(tMs, ch);
    expect(realignImuWords(s)).toBe(s);
  });
});
