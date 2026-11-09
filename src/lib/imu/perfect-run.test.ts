import { describe, expect, it } from "vitest";
import type { GpsChannels, ImuSessionData } from "./format";
import { prepareSnapshotSession } from "./snapshot";
import { createTimedTrack, findTimedRuns } from "./timed-track";
import {
  createSplits,
  perfectRun,
  perfectRunPool,
  readSectorRun,
  type SectorRun,
} from "./perfect-run";

const LAT0 = 37.1;
const LON0 = -7.8;
const R = 6_371_000;
const RAD = Math.PI / 180;
const LEAD_M = 60;
const SECTOR_M = 100;

/**
 * A straight descent north, a fix every 100 ms: LEAD_M at 8 m/s, then six
 * stretches of SECTOR_M at the given speeds, then LEAD_M at 8 m/s again.
 */
function descent(speedsMps: number[]): ImuSessionData {
  const totalM = 2 * LEAD_M + speedsMps.length * SECTOR_M;
  const speedAt = (x: number) => {
    const k = Math.floor((x - LEAD_M) / SECTOR_M);
    return x < LEAD_M || k >= speedsMps.length ? 8 : speedsMps[k];
  };
  const xs: number[] = [];
  for (let x = 0; x < totalM; x += speedAt(x) / 10) xs.push(x);
  const fixes = xs.length;
  const gps = {
    tMs: new Float64Array(fixes),
    latDeg: new Float64Array(fixes),
    lonDeg: new Float64Array(fixes),
    altitudeM: new Float32Array(fixes),
    speedMps: new Float32Array(fixes),
  } as unknown as GpsChannels;
  xs.forEach((x, k) => {
    gps.tMs[k] = k * 100;
    gps.latDeg[k] = LAT0 + x / (R * RAD);
    gps.lonDeg[k] = LON0;
    gps.altitudeM[k] = 500 - x * 0.2;
    gps.speedMps[k] = speedAt(x);
  });
  const durationMs = fixes * 100;
  const n = Math.round(durationMs / 20);
  const tMs = new Float64Array(n);
  for (let i = 0; i < n; i++) tMs[i] = i * 20;
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
    durationMs,
  } as unknown as ImuSessionData;
}

/** A track from LEAD_M/2 to the far LEAD_M/2, split in six on `base`. */
function splitTrack(base: number[]) {
  const prepared = prepareSnapshotSession(descent(base));
  const msAt = (x: number) => {
    let t = 0;
    for (let d = 0; d < x; d += 0.01) {
      const k = Math.floor((d - LEAD_M) / SECTOR_M);
      t += 0.01 / (d < LEAD_M || k >= base.length ? 8 : base[k]);
    }
    return t * 1000;
  };
  const made = createTimedTrack(
    prepared,
    msAt(LEAD_M / 2),
    msAt(LEAD_M * 1.5 + base.length * SECTOR_M),
  )!;
  const splits = createSplits(prepared, made.definition, made.reference)!;
  return { definition: { ...made.definition, splits }, prepared };
}

function read(
  speeds: number[],
  definition: ReturnType<typeof splitTrack>["definition"],
  id: string,
  riderName = "Miguel",
  motorbike = false,
) {
  const prepared = prepareSnapshotSession(descent(speeds));
  const [run] = findTimedRuns(prepared, definition);
  return readSectorRun(prepared, definition, run, {
    id,
    sessionId: id,
    riderName,
    motorbike,
  });
}

describe("createSplits", () => {
  it("cuts the run into six sectors of about equal ground", () => {
    const { definition } = splitTrack([8, 8, 8, 8, 8, 8]);
    expect(definition.splits).toHaveLength(5);
    const run = read([8, 8, 8, 8, 8, 8], definition, "a")!;
    expect(run.sectorsMs).toHaveLength(6);
    // Start at 30 m, finish at 690 m: 660 m in six.
    for (const d of run.distancesM) expect(Math.abs(d - 110)).toBeLessThan(1);
    expect(run.sectorsMs.reduce((a, b) => a + b, 0)).toBe(run.durationMs);
  });

  it("gives no sectors to a run that never crosses a split", () => {
    const { definition } = splitTrack([8, 8, 8, 8, 8, 8]);
    const astray = {
      ...definition,
      splits: definition.splits.map((g, i) =>
        i === 2 ? { ...g, lonDeg: g.lonDeg + 0.01 } : g,
      ),
    };
    expect(read([8, 8, 8, 8, 8, 8], astray, "a")).toBeNull();
  });
});

describe("perfectRun", () => {
  const { definition } = splitTrack([8, 8, 8, 8, 8, 8]);

  it("adds up the best of each sector, from whichever run rode it", () => {
    const a = read([10, 6, 8, 8, 8, 8], definition, "a")!;
    const b = read([6, 10, 8, 8, 8, 8], definition, "b")!;
    const c = read([8, 8, 9, 9, 9, 9], definition, "c")!;
    const result = perfectRun([a, b, c])!;
    expect(result.bestActual.id).toBe("c");
    const bests = [0, 1, 2, 3, 4, 5].map((i) =>
      Math.min(a.sectorsMs[i], b.sectorsMs[i], c.sectorsMs[i]),
    );
    expect(result.perfectMs).toBe(bests.reduce((x, y) => x + y, 0));
    expect(result.sectors[0].bestRunId).toBe("a");
    expect(result.sectors[1].bestRunId).toBe("b");
    expect(result.sectors[3].bestRunId).toBe("c");
    expect(result.gainMs).toBeGreaterThan(1000);
    expect(result.sectors[3].potentialMs).toBe(0);
    expect(result.sectors[0].potentialMs).toBeGreaterThan(0);
    expect(result.excluded).toEqual([]);
  });

  it("needs two runs", () => {
    expect(perfectRun([read([8, 8, 8, 8, 8, 8], definition, "a")!])).toBeNull();
  });
});

describe("perfectRun's checks", () => {
  const run = (id: string, sectorsMs: number[], over: Partial<SectorRun> = {}) => ({
    id,
    sessionId: id,
    riderName: "Miguel",
    motorbike: false,
    durationMs: sectorsMs.reduce((a, b) => a + b, 0),
    sectorsMs,
    distancesM: sectorsMs.map(() => 100),
    fixGapsMs: sectorsMs.map(() => 100),
    stoppedMs: sectorsMs.map(() => 0),
    ...over,
  });

  it("leaves out a sector ridden over other ground, a GPS hole, or an impossible time", () => {
    const a = run("a", [10_000, 10_000, 10_000]);
    const b = run("b", [8_000, 10_500, 10_200], { distancesM: [70, 100, 100] });
    const c = run("c", [10_200, 9_000, 6_000], { fixGapsMs: [100, 2500, 100] });
    const result = perfectRun([a, b, c])!;
    expect(result.excluded).toEqual([
      { runId: "b", sector: 0, reason: "distance" },
      { runId: "c", sector: 1, reason: "gps_gap" },
      { runId: "c", sector: 2, reason: "too_fast" },
    ]);
    expect(result.sectors.map((s) => s.bestRunId)).toEqual(["a", "a", "a"]);
    expect(result.perfectMs).toBe(30_000);
  });

  it("reads a sector's usual time from the runs that did not stop in it", () => {
    // Three of five stopped in the last sector: their median would make the
    // two that rode it through look impossibly fast (Mitica, 2026-11-09).
    const a = run("a", [10_000, 39_000]);
    const b = run("b", [10_200, 39_500]);
    const c = run("c", [10_100, 75_000], { stoppedMs: [0, 30_000] });
    const d = run("d", [10_300, 96_000], { stoppedMs: [0, 50_000] });
    const e = run("e", [10_000, 142_000], { stoppedMs: [0, 90_000] });
    const result = perfectRun([a, b, c, d, e])!;
    expect(result.excluded).toEqual([]);
    expect(result.sectors[1].bestRunId).toBe("a");
    expect(result.gainMs).toBe(0);
  });

  it("keeps the best actual run's other sectors when one of its own is left out", () => {
    const a = run("a", [9_000, 10_000], { distancesM: [60, 100] });
    const b = run("b", [10_000, 10_500]);
    const c = run("c", [10_100, 10_400]);
    const result = perfectRun([a, b, c])!;
    expect(result.bestActual.id).toBe("a");
    expect(result.sectors[0].bestActualMs).toBeNull();
    expect(result.sectors[0].potentialMs).toBeNull();
    expect(result.sectors[1].potentialMs).toBe(0);
  });

  it("pools one rider on one kind of vehicle", () => {
    const runs = [
      run("a", [1, 1], { riderName: " miguel " }),
      run("b", [1, 1], { riderName: "Rui" }),
      run("c", [1, 1], { motorbike: true }),
      run("d", [1, 1]),
    ];
    expect(perfectRunPool(runs, "Miguel", false).map((r) => r.id)).toEqual([
      "a",
      "d",
    ]);
    expect(perfectRunPool(runs, "Miguel", true).map((r) => r.id)).toEqual([
      "c",
    ]);
  });

  it("says how far the gain may be off", () => {
    const result = perfectRun([
      run("a", [1000, 1000, 1000, 1000, 1000, 1000]),
      run("b", [1000, 1000, 1000, 1000, 1000, 1000]),
    ])!;
    // Six sectors: twelve crossings, plus the best run's two.
    expect(result.uncertaintyMs).toBe(Math.round(110 * Math.sqrt(14)));
  });
});
