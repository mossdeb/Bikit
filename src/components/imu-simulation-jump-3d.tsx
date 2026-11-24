"use client";

import { useMemo } from "react";
import { flightShape, type FlightShape } from "@/lib/imu/snapshot-simulation";
import { buildScene, seedFrom, type Vec3 } from "@/lib/imu/scene-3d";
import {
  jumpLayout,
  rampFaces,
  rideAt,
  ridePath,
} from "@/lib/imu/jump-scene-3d";
import type { SimulationPass } from "@/components/imu-snapshot-simulation";
import { Scene3DView, type View3DFrame } from "@/components/imu-scene-3d-view";

/** The made-up trail runs this far past the jump either way, m. */
const RUN_ON_M = 40;

/**
 * A jump's simulation in 3D (by request, 2026-11-23; for everyone since the
 * same day): the side view's model (jump-scene-3d) on the corners' 3D
 * ground. The passes ride one straight run, each in its own lane across
 * it, over a kicker and a landing, each flying its own arc — drawn twice
 * as tall as flown, as the side view draws it taller. No GNSS: on a jump
 * a few metres long its fixes are too coarse to place a bike.
 */
export function SimulationJump3D({
  passes,
  framed,
  reference,
  followed,
  inkOf,
  cursorMs,
  timeOf,
  readout,
  corner,
  topLabel,
  caption,
  namesLabel,
}: {
  /** The passes on show. */
  passes: SimulationPass[];
  /** All of them, which the jump is laid out on and the lanes given by. */
  framed: SimulationPass[];
  reference: SimulationPass;
  followed: SimulationPass;
  inkOf: (p: SimulationPass) => string;
  cursorMs: number;
  /** A pass's own time at the cursor — shifted when the passes are lined
   * up at the lip. */
  timeOf: (p: SimulationPass) => number;
  readout: React.ReactNode;
  /** The switch between the two clocks, in the top-left corner. */
  corner?: React.ReactNode;
  topLabel?: string;
  caption?: React.ReactNode;
  namesLabel?: string;
}) {
  const shapeOf = (p: SimulationPass): FlightShape | null =>
    p.flight ? flightShape(p.flight.airtimeMs, p.flight.takeoffKmh) : null;

  const layout = useMemo(() => {
    const shapes = framed
      .map((p) => (p.flight ? flightShape(p.flight.airtimeMs, p.flight.takeoffKmh) : null))
      .filter((s): s is FlightShape => !!s);
    const ref = reference.flight
      ? flightShape(reference.flight.airtimeMs, reference.flight.takeoffKmh)
      : null;
    return jumpLayout(shapes, ref);
  }, [framed, reference]);

  // A straight run along x, the jump on it from the kicker's foot to past
  // the landing; its ground flat there (a level "altitude"), made up round.
  const scene = useMemo(() => {
    const trail: [number, number][] = [];
    for (let m = layout.fromM - RUN_ON_M; m <= layout.toM + RUN_ON_M; m += 1) trail.push([m, 0]);
    const stretch = trail.filter(([m]) => m >= layout.fromM && m <= layout.toM);
    const lat = reference.trace.latDeg[0] ?? 0;
    const lon = reference.trace.lonDeg[0] ?? 0;
    const base = buildScene(trail, stretch, seedFrom(lat, lon), {
      stretchAltM: stretch.map(() => 0),
    });
    const ramps = rampFaces(layout, base.roadHalfM * 0.85, (m) => base.roadHeightAt(m, 0));
    return { ...base, road: [...base.road, ...ramps] };
  }, [layout, reference]);

  // Each pass its lane across the run, by its place among all of them, so
  // hiding one does not move the others.
  const laneOf = useMemo(() => {
    const n = framed.length;
    const gap = Math.min(0.6, (scene.roadHalfM * 1.4) / Math.max(1, n));
    const lanes = new Map(framed.map((p, i) => [p.key, (i - (n - 1) / 2) * gap]));
    return (p: SimulationPass) => lanes.get(p.key) ?? 0;
  }, [framed, scene]);

  const frame = useMemo((): View3DFrame => {
    const ground = (m: number) => scene.roadHeightAt(m, 0) + 0.05;
    const paths = new Map<string, Vec3[]>();
    const dashed = new Map<string, Vec3[]>();
    const tokens = new Map<string, Vec3>();
    for (const p of passes) {
      const shape = shapeOf(p);
      if (!shape || !p.flight) continue;
      const y = laneOf(p);
      const t = (timeOf(p) - p.flight.takeoffMs) / 1000;
      const world = ({ m, h }: { m: number; h: number }): Vec3 => [m, y, ground(m) + h];
      paths.set(p.key, ridePath(layout, shape, t).map(world));
      dashed.set(p.key, ridePath(layout, shape, Infinity, 32).map(world));
      tokens.set(p.key, world(rideAt(layout, shape, t)));
    }
    // The lip's and the landing's marks, across the ramps' tops.
    const w = scene.roadHalfM * 0.95;
    const mark = (m: number): [Vec3, Vec3] => {
      const z = ground(m) + layout.lipM + 0.04;
      return [
        [m, -w, z],
        [m, w, z],
      ];
    };
    return { paths, dashed, tokens, gates: [mark(0), mark(layout.landingTopM)] };
    // shapeOf only reads the passes it is given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passes, layout, scene, laneOf, timeOf, cursorMs]);

  return (
    <Scene3DView
      scene={scene}
      passes={passes.map((p) => ({
        key: p.key,
        ink: inkOf(p),
        name: p.name,
        rider: p.rider,
      }))}
      followedKey={followed.key}
      frame={frame}
      // From the side, a little above: the height is what a jump shows.
      // Closer than the corners: the jump is a few metres of the ground's 30.
      // Opening on the jump itself (by request, 2026-11-23): the kicker's
      // foot to past the landing across about the plate's width — the
      // camera sees ~0.92 of the scene's extent at zoom 1.
      initialCamera={{
        azimuth: 0,
        elevation: 0.32,
        zoom: Math.max(0.35, Math.min(1, (1.25 * (layout.toM - layout.fromM)) / scene.extentM)),
      }}
      // A bike's size against a jump of a few metres.
      tokenRadiusM={0.14}
      tokenShape="triangle"
      // Closer than the corners (by request, 2026-11-23), to the limit the
      // owner chose on the jump at 01:35 of R0072: the run across the
      // plate, the ramps' tops in full.
      zoomMin={0.22}
      // The switch shows it from the front (by request, 2026-11-23): level
      // with the ramps, square to the run — the side view's angle.
      snapTo={{ azimuth: 0, elevation: 0.06 }}
      height={520}
      clock={readout}
      views={corner}
      topLabel={topLabel}
      caption={caption}
      namesLabel={namesLabel}
    />
  );
}
