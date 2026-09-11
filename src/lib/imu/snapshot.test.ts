import { describe, expect, it } from "vitest";
import type { GpsChannels, ImuEvent, ImuSessionData } from "./format";
import {
  buildTrackIndex,
  createSnapshot,
  findSnapshotPasses,
  findSnapshotTwins,
  isTrackIndex,
  OUTLINE_MAX_POINTS,
  prepareSnapshotSession,
  snapshotKindOf,
  snapshotPassMetrics,
  trackIndexMayPass,
  trackIndexNearGate,
  type SnapshotDefinition,
} from "./snapshot";

const LAT0 = 37.1;
const LON0 = -7.8;
const R = 6_371_000;
const RAD = Math.PI / 180;

interface RideOptions {
  seconds: number;
  /** m/s at a time, s. */
  speed: (tS: number) => number;
  /** East and north, m, at a distance ridden, m. */
  at: (sM: number) => [number, number];
  altitude?: (sM: number) => number;
  /** Fixes the receiver never delivered, by their second. */
  missingFix?: (tS: number) => boolean;
  events?: ImuEvent[];
  /** Seconds at which the frame takes a 6 G hit. */
  hitsAtS?: number[];
  forwardKnown?: boolean;
}

/**
 * A ride drawn by hand: the path as a function of distance, the speed as a
 * function of time, a fix a second and a flat 50 Hz IMU. The distance is
 * integrated at 10 ms, which is exact for the piecewise-linear speeds used
 * here, so every gate time below can be worked out on paper.
 */
function ride(o: RideOptions): ImuSessionData {
  const dt = 0.01;
  const steps = Math.round(o.seconds / dt);
  const dist = new Float64Array(steps + 1);
  for (let i = 0; i < steps; i++)
    dist[i + 1] =
      dist[i] + ((o.speed(i * dt) + o.speed((i + 1) * dt)) / 2) * dt;
  const distAt = (tS: number) => dist[Math.round(tS / dt)];

  const rate = 50;
  const n = o.seconds * rate;
  const tMs = new Float64Array(n);
  const az = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) tMs[i] = (i / rate) * 1000;
  for (const s of o.hitsAtS ?? []) az[Math.round(s * rate)] = 6;

  const fixes: number[] = [];
  for (let s = 0; s <= o.seconds - 1; s++)
    if (!o.missingFix?.(s)) fixes.push(s);
  const m = fixes.length;
  const gps: GpsChannels = {
    tMs: new Float64Array(fixes.map((s) => s * 1000)),
    latDeg: new Float64Array(m),
    lonDeg: new Float64Array(m),
    altitudeM: new Float32Array(m),
    speedMps: new Float32Array(fixes.map((s) => o.speed(s))),
    headingDeg: new Float32Array(m).fill(NaN),
    distanceM: new Float32Array(m).fill(NaN),
    hAccM: new Float32Array(m).fill(NaN),
  };
  fixes.forEach((s, k) => {
    const d = distAt(s);
    const [x, y] = o.at(d);
    gps.latDeg[k] = LAT0 + y / (R * RAD);
    gps.lonDeg[k] = LON0 + x / (R * RAD * Math.cos(LAT0 * RAD));
    gps.altitudeM[k] = o.altitude ? o.altitude(d) : 300;
  });

  return {
    format: "test",
    sessionId: null,
    durationMs: o.seconds * 1000,
    sampleRateHz: rate,
    sampleCount: n,
    channels: {
      tMs,
      ax: new Float32Array(n),
      ay: new Float32Array(n),
      az,
      gx: new Float32Array(n),
      gy: new Float32Array(n),
      gz: new Float32Array(n),
      gForce: null,
    },
    gps,
    events: o.events ?? [],
    calibration: null,
    aligned: true,
    mounting: o.forwardKnown
      ? {
          yawDeg: 0,
          confidence: 0.9,
          intervals: 20,
          headingCheck: "ok",
          applied: true,
          source: "logger",
        }
      : null,
  };
}

const east = (s: number): [number, number] => [s, 0];
const corner = (startMs: number, endMs: number): ImuEvent => ({
  kind: "curve",
  direction: "right",
  startMs,
  endMs,
  confidence: 0.9,
});

/** The Snapshot most tests share: a corner at 25–27 s on a ride east at
 * 8 m/s — 200 m to 216 m in, so gates at 180 m (22.5 s) and 236 m (29.5 s). */
function eastSnapshot(): SnapshotDefinition {
  const s = prepareSnapshotSession(
    ride({
      seconds: 60,
      speed: () => 8,
      at: east,
      events: [corner(25000, 27000)],
    }),
  );
  const made = createSnapshot(s, s.session.events[0]);
  if (!made) throw new Error("no snapshot");
  return made.definition;
}

describe("createSnapshot", () => {
  it("puts the gates 20 m outside the event, facing the way the bike went", () => {
    const s = prepareSnapshotSession(
      ride({
        seconds: 60,
        speed: () => 8,
        at: east,
        events: [corner(25000, 27000)],
      }),
    );
    const made = createSnapshot(s, s.session.events[0]);
    expect(made).not.toBeNull();
    expect(made!.definition.kind).toBe("curve");
    expect(made!.reference.entryMs).toBeCloseTo(22500, -1);
    expect(made!.reference.exitMs).toBeCloseTo(29500, -1);
    expect(made!.definition.referenceDurationMs).toBeCloseTo(7000, -1);
    expect(made!.definition.entry.headingDeg).toBeCloseTo(90, 1);
    expect(made!.definition.exit.headingDeg).toBeCloseTo(90, 1);
  });

  it("makes a jump's from takeoff to landing, and none from an impact", () => {
    const jump: ImuEvent = {
      kind: "jump",
      takeoffMs: 25000,
      landingMs: 25400,
      airtimeMs: 400,
      confidence: 0.9,
    };
    const impact: ImuEvent = {
      kind: "impact",
      timeMs: 30000,
      severity: null,
      confidence: 0.9,
    };
    expect(snapshotKindOf(jump)).toBe("jump");
    expect(snapshotKindOf({ ...jump, kind: "drop" })).toBe("jump");
    expect(snapshotKindOf(impact)).toBeNull();
    const s = prepareSnapshotSession(
      ride({ seconds: 60, speed: () => 8, at: east, events: [jump, impact] }),
    );
    // 200 m and 203.2 m in, so 180 m (22.5 s) and 223.2 m (27.9 s).
    const made = createSnapshot(s, jump);
    expect(made!.definition.kind).toBe("jump");
    expect(made!.reference.entryMs).toBeCloseTo(22500, -1);
    expect(made!.reference.exitMs).toBeCloseTo(27900, -1);
    expect(createSnapshot(s, impact)).toBeNull();
  });

  it("needs a track", () => {
    const s = ride({
      seconds: 60,
      speed: () => 8,
      at: east,
      events: [corner(25000, 27000)],
    });
    const prepared = prepareSnapshotSession({ ...s, gps: null });
    expect(createSnapshot(prepared, s.events[0])).toBeNull();
    expect(findSnapshotPasses(prepared, eastSnapshot())).toEqual([]);
  });
});

describe("findSnapshotPasses", () => {
  it("finds the pass over the same ground at another pace, and none the other way", () => {
    const def = eastSnapshot();
    const faster = prepareSnapshotSession(
      ride({ seconds: 60, speed: () => 10, at: east }),
    );
    const passes = findSnapshotPasses(faster, def);
    expect(passes).toHaveLength(1);
    expect(passes[0].entryMs).toBeCloseTo(18000, -1);
    expect(passes[0].exitMs).toBeCloseTo(23600, -1);

    const west = prepareSnapshotSession(
      ride({ seconds: 60, speed: () => 8, at: (s) => [400 - s, 0] }),
    );
    expect(findSnapshotPasses(west, def)).toEqual([]);
  });

  it("takes a line inside the gate's width, and not a trail beside it", () => {
    const def = eastSnapshot();
    const wide = prepareSnapshotSession(
      ride({ seconds: 60, speed: () => 8, at: (s) => [s, 8] }),
    );
    const beside = prepareSnapshotSession(
      ride({ seconds: 60, speed: () => 8, at: (s) => [s, 20] }),
    );
    expect(findSnapshotPasses(wide, def)).toHaveLength(1);
    expect(findSnapshotPasses(beside, def)).toEqual([]);
  });

  it("counts two laps of a loop as two passes, the first being the reference", () => {
    // A 400 m straight east, a half circle north, 400 m back west 60 m
    // away, and a half circle home: a loop of ~988 m, ridden twice.
    const L = 400;
    const r = 30;
    const P = 2 * L + 2 * Math.PI * r;
    const loop = (sIn: number): [number, number] => {
      let s = sIn % P;
      if (s < L) return [s, 0];
      s -= L;
      if (s < Math.PI * r) {
        const a = -Math.PI / 2 + s / r;
        return [L + r * Math.cos(a), r + r * Math.sin(a)];
      }
      s -= Math.PI * r;
      if (s < L) return [L - s, 2 * r];
      s -= L;
      const a = Math.PI / 2 + s / r;
      return [r * Math.cos(a), r + r * Math.sin(a)];
    };
    const s = prepareSnapshotSession(
      ride({
        seconds: 250,
        speed: () => 8,
        at: loop,
        events: [corner(25000, 27000)],
      }),
    );
    const made = createSnapshot(s, s.session.events[0])!;
    expect(made.reference.entryMs).toBeCloseTo(22500, -1);
    const passes = findSnapshotPasses(s, made.definition);
    expect(passes).toHaveLength(2);
    expect(passes[0]).toEqual(made.reference);
    expect(passes[1].entryMs).toBeCloseTo(((P + 180) / 8) * 1000, -1);
  });

  it("keeps a pass with a stop inside it, and says it stopped", () => {
    const def = eastSnapshot();
    // At 8 m/s to 24 s (192 m), stood still to 44 s, then on: in at 180 m
    // (22.5 s), out at 236 m (44 + 44/8 = 49.5 s).
    const s = prepareSnapshotSession(
      ride({
        seconds: 70,
        speed: (t) => (t < 24 || t >= 44 ? 8 : 0),
        at: east,
      }),
    );
    const passes = findSnapshotPasses(s, def);
    expect(passes).toHaveLength(1);
    expect(passes[0].entryMs).toBeCloseTo(22500, -1);
    expect(passes[0].exitMs).toBeCloseTo(49500, -1);
    const metrics = snapshotPassMetrics(s, passes[0]);
    expect(metrics.stopped).toBe(true);
    expect(metrics.minKmh).toBeLessThan(1);
  });

  it("loses a pass whose gate falls in a hole in the track, and not one whose hole is between the gates", () => {
    // Fixes 21–26 s missing: a 7 s hole across the entry gate at 22.5 s.
    const holeAtGate = prepareSnapshotSession(
      ride({
        seconds: 60,
        speed: () => 8,
        at: east,
        missingFix: (t) => t > 20 && t < 27,
      }),
    );
    expect(findSnapshotPasses(holeAtGate, eastSnapshot())).toEqual([]);

    // A rough section at 20–40 s makes gates at 140 m (17.5 s) and 340 m
    // (42.5 s); a 12 s hole between them leaves both crossings whole.
    const long = prepareSnapshotSession(
      ride({
        seconds: 60,
        speed: () => 8,
        at: east,
        events: [
          {
            kind: "rough_section",
            startMs: 20000,
            endMs: 40000,
            confidence: 0.8,
          },
        ],
      }),
    );
    const def = createSnapshot(long, long.session.events[0])!.definition;
    const holeBetween = prepareSnapshotSession(
      ride({
        seconds: 60,
        speed: () => 8,
        at: east,
        missingFix: (t) => t > 24 && t < 36,
      }),
    );
    expect(findSnapshotPasses(holeBetween, def)).toHaveLength(1);
  });
});

describe("snapshotPassMetrics", () => {
  it("reads the speed at the gates, the floor between them, and what the hill gave", () => {
    // 10 m/s, slowing at 1 m/s² from 25 s to 5 m/s at 30 s, held to 34 s,
    // back up to 10 m/s at 39 s, down a 10 % slope. The corner at 25–39 s
    // spans 250 m to 345 m, so the gates are at 230 m (23 s) and 365 m
    // (41 s), both at 10 m/s, 135 m apart.
    const speed = (t: number) =>
      t < 25
        ? 10
        : t < 30
          ? 10 - (t - 25)
          : t < 34
            ? 5
            : t < 39
              ? 5 + (t - 34)
              : 10;
    const s = prepareSnapshotSession(
      ride({
        seconds: 70,
        speed,
        at: east,
        altitude: (d) => 300 - 0.1 * d,
        events: [
          corner(25000, 39000),
          { kind: "impact", timeMs: 30000, severity: null, confidence: 0.9 },
          { kind: "impact", timeMs: 50000, severity: null, confidence: 0.9 },
        ],
        hitsAtS: [30, 50],
      }),
    );
    const made = createSnapshot(s, s.session.events[0])!;
    const m = snapshotPassMetrics(s, made.reference);
    expect(m.speedSource).toBe("gps");
    expect(m.durationMs).toBeCloseTo(18000, -1);
    expect(m.entryKmh).toBeCloseTo(36, 1);
    expect(m.exitKmh).toBeCloseTo(36, 1);
    expect(m.minKmh).toBeCloseTo(18, 1);
    expect(m.stopped).toBe(false);
    expect(m.retention).toBeCloseTo(1, 2);
    expect(m.apexLoss).toBeCloseTo(0.5, 2);
    expect(m.maxDecelMps2).toBeCloseTo(1, 1);
    // 135 m down a 10 % slope is 13.5 m; the drop alone would have brought
    // 10 m/s to √(100 + 2·9.81·13.5) = 19.1 m/s, and it left at 10.
    expect(m.dropM).toBeCloseTo(13.5, 0);
    expect(m.retentionCorrected).toBeCloseTo(0.52, 2);
    // The hit at 30 s is between the gates; the one at 50 s is not.
    expect(m.impacts).toBe(1);
    expect(m.peakG).toBeCloseTo(6, 3);
  });

  it("says when the speed was read by the bike's forward", () => {
    const s = prepareSnapshotSession(
      ride({ seconds: 60, speed: () => 8, at: east, forwardKnown: true }),
    );
    expect(s.speedSource).toBe("fused");
  });
});

describe("the track index", () => {
  // 300 m east, then 300 m north: an L of 76 fixes that two segments draw.
  const L = (d: number): [number, number] =>
    d < 300 ? [d, 0] : [300, d - 300];

  it("keeps the corners of the track and nothing else, inside its box", () => {
    const s = ride({ seconds: 76, speed: () => 8, at: L });
    const index = buildTrackIndex(s.gps)!;
    expect(index.outline).toHaveLength(3);
    expect(index.outline[0]).toEqual([s.gps!.latDeg[0], s.gps!.lonDeg[0]]);
    // The corner is 300 m in, between the fixes at 37 s (296 m) and 38 s
    // (304 m), each 4 m off the line the other draws: either may be kept.
    expect([s.gps!.lonDeg[37], s.gps!.lonDeg[38]]).toContain(
      index.outline[1][1],
    );
    expect(index.bounds.minLat).toBe(s.gps!.latDeg[0]);
    expect(index.bounds.maxLon).toBe(s.gps!.lonDeg[38]);
    expect(isTrackIndex(index)).toBe(true);
    expect(isTrackIndex(JSON.parse(JSON.stringify(index)))).toBe(true);
  });

  it("caps a long, wiggly track by coarsening, not by cutting", () => {
    // A 4 m zigzag every second for 2000 s: every fix is a corner at the
    // 4 m tolerance, so the tolerance has to grow until 600 are left.
    const zig = (d: number): [number, number] => [d, d % 16 < 8 ? 0 : 4];
    const s = ride({ seconds: 2000, speed: () => 8, at: zig });
    const index = buildTrackIndex(s.gps)!;
    expect(index.outline.length).toBeLessThanOrEqual(OUTLINE_MAX_POINTS);
    expect(index.outline.length).toBeGreaterThan(1);
    const last = index.outline[index.outline.length - 1];
    expect(last[1]).toBe(s.gps!.lonDeg[s.gps!.lonDeg.length - 1]);
  });

  it("is null without a track, and refuses a shape it did not write", () => {
    expect(buildTrackIndex(null)).toBeNull();
    expect(isTrackIndex(null)).toBe(false);
    expect(isTrackIndex({ bounds: {}, outline: [] })).toBe(false);
    expect(
      isTrackIndex({
        bounds: { minLat: 1, maxLat: 2, minLon: 3, maxLon: 4 },
        outline: [
          [1, 3],
          [2, "x"],
        ],
      }),
    ).toBe(false);
  });

  it("says which tracks come near a Snapshot's gates", () => {
    const def = eastSnapshot();
    const same = buildTrackIndex(
      ride({ seconds: 60, speed: () => 8, at: east }).gps,
    )!;
    const beside = buildTrackIndex(
      ride({ seconds: 60, speed: () => 8, at: (d) => [d, 40] }).gps,
    )!;
    // Comes to the entry gate and turns away 30 m before the exit gate.
    const turnsOff = buildTrackIndex(
      ride({
        seconds: 60,
        speed: () => 8,
        at: (d) => (d < 206 ? [d, 0] : [206, d - 206]),
      }).gps,
    )!;
    expect(trackIndexNearGate(same, def.entry)).toBe(true);
    expect(trackIndexMayPass(same, def)).toBe(true);
    expect(trackIndexMayPass(beside, def)).toBe(false);
    expect(trackIndexNearGate(turnsOff, def.entry)).toBe(true);
    expect(trackIndexMayPass(turnsOff, def)).toBe(false);
  });
});

describe("findSnapshotTwins", () => {
  // Gates by hand, 200 m apart heading east; the offsets below are metres.
  const gate = (eastM: number, northM: number, headingDeg: number) => ({
    latDeg: LAT0 + northM / (R * RAD),
    lonDeg: LON0 + eastM / (R * RAD * Math.cos(LAT0 * RAD)),
    headingDeg,
    halfWidthM: 12,
  });
  const definition = (
    kind: SnapshotDefinition["kind"],
    eastM: number,
    northM: number,
    headingDeg: number,
  ): SnapshotDefinition => ({
    kind,
    entry: gate(eastM, northM, headingDeg),
    exit: gate(eastM + 200, northM, headingDeg),
    referenceDurationMs: 20_000,
  });
  const here = definition("curve", 0, 0, 90);
  const existing = [
    { id: "same", definition: definition("curve", 5, -4, 100) },
    { id: "moved", definition: definition("curve", 30, 0, 90) },
    { id: "backwards", definition: definition("curve", 0, 0, 270) },
    { id: "other-kind", definition: definition("braking", 0, 0, 90) },
  ];

  it("finds the Snapshot standing on the same gates, and not its neighbours", () => {
    expect(findSnapshotTwins(here, existing).map((s) => s.id)).toEqual([
      "same",
    ]);
  });

  it("finds nothing among Snapshots elsewhere", () => {
    expect(
      findSnapshotTwins(definition("curve", 500, 500, 90), existing),
    ).toEqual([]);
  });
});
