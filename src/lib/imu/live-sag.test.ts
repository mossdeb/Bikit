import { describe, expect, it } from "vitest";
import {
  isStale,
  keepRecent,
  steadySag,
  type LiveSagSample,
} from "./live-sag";

/** `seconds` of readings at 20 Hz ending at t = 10 000 ms. */
function stream(
  seconds: number,
  fork: (i: number) => number | null,
  shock: (i: number) => number | null,
): LiveSagSample[] {
  const n = Math.round(seconds * 20);
  return Array.from({ length: n }, (_, i) => ({
    atMs: 10_000 - (n - 1 - i) * 50,
    forkMm: fork(i),
    shockMm: shock(i),
  }));
}
const NOW = 10_000;

describe("steadySag", () => {
  it("saves the window's mean once both ends have held still for 2 s", () => {
    const s = stream(
      3,
      (i) => 45.4 + (i % 2 ? 0.1 : -0.1),
      (i) => 21.2 + (i % 3 ? 0.05 : 0),
    );
    expect(steadySag(s, NOW)).toEqual({ forkMm: 45.4, shockMm: 21.2 });
  });

  it("waits while the rider is still moving", () => {
    // The fork sways ±1.5 mm: 3 mm of spread, over the 2 mm allowed.
    const s = stream(3, (i) => 45 + 1.5 * Math.sin(i), () => 21);
    expect(steadySag(s, NOW)).toBeNull();
    // The shock is held to 1 mm.
    const t = stream(3, () => 45, (i) => 21 + 0.6 * Math.sin(i));
    expect(steadySag(t, NOW)).toBeNull();
  });

  it("waits until the stream covers the whole window", () => {
    expect(steadySag(stream(1.5, () => 45, () => 21), NOW)).toBeNull();
  });

  it("waits when too many readings are missing", () => {
    // Every other reading lost: 20 in the window, under the 30 asked.
    const s = stream(3, () => 45, () => 21).filter((_, i) => i % 2 === 0);
    expect(steadySag(s, NOW)).toBeNull();
  });

  it("leaves out an end the logger sends as NA throughout", () => {
    const s = stream(3, () => 45.4, () => null);
    expect(steadySag(s, NOW)).toEqual({ forkMm: 45.4, shockMm: null });
  });

  it("waits when a counted end drops out inside the window", () => {
    const s = stream(3, (i) => (i === 50 ? null : 45), () => 21);
    expect(steadySag(s, NOW)).toBeNull();
  });

  it("has nothing with both ends NA, or a stalled stream", () => {
    expect(steadySag(stream(3, () => null, () => null), NOW)).toBeNull();
    expect(steadySag(stream(3, () => 45, () => 21), NOW + 1500)).toBeNull();
  });
});

describe("isStale and keepRecent", () => {
  it("reads a quiet stream as stale", () => {
    const s = stream(1, () => 45, () => 21);
    expect(isStale(s, NOW + 500)).toBe(false);
    expect(isStale(s, NOW + 1500)).toBe(true);
    expect(isStale([], NOW)).toBe(true);
  });

  it("keeps the last 3 s", () => {
    const s = stream(10, () => 45, () => 21);
    const kept = keepRecent(s, NOW);
    expect(kept[0].atMs).toBeGreaterThanOrEqual(NOW - 3000);
    expect(kept[kept.length - 1].atMs).toBe(NOW);
    expect(keepRecent(s, NOW + 60_000)).toEqual([]);
  });
});
