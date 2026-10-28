import { describe, expect, it } from "vitest";
import type { GpsChannels, ImuSessionData } from "./format";
import {
  findSnapshotPasses,
  passWithinGates,
  prepareSnapshotSession,
} from "./snapshot";
import {
  createTimedTrack,
  findTimedRuns,
  formatRunGap,
  formatRunTime,
  isTimedTrackDefinition,
  runTrimOf,
  trackNameOfRun,
} from "./timed-track";

const LAT0 = 37.1;
const LON0 = -7.8;
const R = 6_371_000;
const RAD = Math.PI / 180;

/**
 * A straight descent heading north at a steady speed, a fix every 100 ms,
 * standing still for `waitS` first — the rider at the top before the off.
 */
function descent(speedMps: number, seconds: number, waitS = 0): ImuSessionData {
  const fixes = Math.round((seconds + waitS) * 10);
  const gps: GpsChannels = {
    tMs: new Float64Array(fixes),
    latDeg: new Float64Array(fixes),
    lonDeg: new Float64Array(fixes),
    altitudeM: new Float32Array(fixes),
    speedMps: new Float32Array(fixes),
  } as unknown as GpsChannels;
  for (let k = 0; k < fixes; k++) {
    const tS = k / 10;
    const north = Math.max(0, tS - waitS) * speedMps;
    gps.tMs[k] = tS * 1000;
    gps.latDeg[k] = LAT0 + north / (R * RAD);
    gps.lonDeg[k] = LON0;
    gps.altitudeM[k] = 500 - north * 0.2;
    gps.speedMps[k] = tS < waitS ? 0 : speedMps;
  }
  const rate = 50;
  const n = Math.round((seconds + waitS) * rate);
  const tMs = new Float64Array(n);
  for (let i = 0; i < n; i++) tMs[i] = (i / rate) * 1000;
  const zeros = () => new Float32Array(n);
  return {
    channels: {
      tMs,
      ax: zeros(),
      ay: zeros(),
      az: new Float32Array(n).fill(1),
      gx: zeros(),
      gy: zeros(),
      gz: zeros(),
    },
    gps,
    events: [],
    durationMs: (seconds + waitS) * 1000,
  } as unknown as ImuSessionData;
}

describe("timed tracks", () => {
  it("times a run between the lines it was made from", () => {
    const made = createTimedTrack(
      prepareSnapshotSession(descent(10, 60)),
      10_000,
      50_000,
    );
    expect(made).not.toBeNull();
    expect(isTimedTrackDefinition(made!.definition)).toBe(true);
    expect(made!.reference.durationMs).toBeCloseTo(40_000, -2);
  });

  it("times another run between the same lines, whatever its own clock", () => {
    const made = createTimedTrack(
      prepareSnapshotSession(descent(10, 60)),
      10_000,
      50_000,
    )!;
    // The same 400 m at 8 m/s, after 7 s standing at the top: 50 s.
    const runs = findTimedRuns(
      prepareSnapshotSession(descent(8, 70, 7)),
      made.definition,
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].durationMs).toBeCloseTo(50_000, -2);
    expect(runs[0].entryMs).toBeCloseTo(7_000 + 100_000 / 8, -2);
  });

  it("finds no run in a session that never reaches the finish", () => {
    const made = createTimedTrack(
      prepareSnapshotSession(descent(10, 60)),
      10_000,
      50_000,
    )!;
    expect(
      findTimedRuns(prepareSnapshotSession(descent(10, 30)), made.definition),
    ).toHaveLength(0);
  });

  it("trims a run to the first track it passes, or to nothing", () => {
    const made = createTimedTrack(
      prepareSnapshotSession(descent(10, 60)),
      10_000,
      50_000,
    )!;
    const short = createTimedTrack(
      prepareSnapshotSession(descent(10, 60)),
      20_000,
      30_000,
    )!;
    const other = prepareSnapshotSession(descent(8, 70, 7));
    const trim = runTrimOf(other, [made.definition, short.definition]);
    const run = findTimedRuns(other, made.definition)[0];
    expect(trim).toEqual({
      startMs: Math.round(run.entryMs),
      endMs: Math.round(run.exitMs),
    });
    expect(
      runTrimOf(prepareSnapshotSession(descent(10, 30)), [made.definition]),
    ).toBeNull();
    expect(runTrimOf(other, [])).toBeNull();
  });

  it("tells which track a stretch's pass was ridden on", () => {
    const prepared = prepareSnapshotSession(descent(10, 60));
    const track = createTimedTrack(prepared, 10_000, 50_000)!;
    const below = createTimedTrack(prepared, 52_000, 58_000)!;
    const stretch = createTimedTrack(prepared, 20_000, 30_000)!;
    const pass = findSnapshotPasses(prepared, stretch.definition)[0];
    expect(passWithinGates(prepared, pass, track.definition)).toBe(true);
    expect(passWithinGates(prepared, pass, below.definition)).toBe(false);
    // The same track ridden by a run trimmed to its lines: the fix before
    // the start is gone, and the pass is still on it.
    const trimmed = prepareSnapshotSession(descent(10, 60));
    const cut = trimmed.track!;
    const from = cut.tMs.findIndex((t) => t >= 10_000);
    for (const key of ["tMs", "latDeg", "lonDeg", "distM"] as const)
      cut[key] = cut[key].slice(from);
    expect(
      passWithinGates(
        trimmed,
        findSnapshotPasses(trimmed, stretch.definition)[0],
        track.definition,
      ),
    ).toBe(true);
  });

  it("writes times and gaps to the thousandth, with a point", () => {
    expect(formatRunTime(107_320)).toBe("1:47.320");
    expect(formatRunTime(59_999.6)).toBe("1:00.000");
    expect(formatRunGap(108_732, 107_320)).toBe("+1.412 s");
    expect(formatRunGap(107_500, 107_320)).toBeNull();
    expect(formatRunGap(107_320, 107_320)).toBeNull();
  });
});

describe("trackNameOfRun", () => {
  it("takes the trail the rider wrote after the logger's code", () => {
    expect(trackNameOfRun("R0117 - Salgueiro")).toBe("Salgueiro");
    expect(trackNameOfRun("S0089 – Casa Velha ")).toBe("Casa Velha");
    expect(trackNameOfRun("R0022-Xdream")).toBe("Xdream");
  });

  it("keeps a name without a code whole", () => {
    expect(trackNameOfRun("Fonte Ferrea")).toBe("Fonte Ferrea");
  });

  it("has no name for the code alone", () => {
    expect(trackNameOfRun("R0117")).toBeNull();
    expect(trackNameOfRun("  ")).toBeNull();
  });
});
