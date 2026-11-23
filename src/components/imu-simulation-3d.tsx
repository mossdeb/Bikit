"use client";

import { useMemo } from "react";
import type { SnapshotPassTrace } from "@/lib/imu/snapshot";
import { traceSampleAt, traceValueAt } from "@/lib/imu/snapshot-simulation";
import { smoothPolyline } from "@/lib/imu/track-spline";
import { buildScene, seedFrom, type Vec3 } from "@/lib/imu/scene-3d";
import {
  Scene3DView,
  type View3DFrame,
  type View3DPass,
} from "@/components/imu-scene-3d-view";

const R = 6_371_000;
const RAD = Math.PI / 180;

/** A pass as the 3D view needs it. */
export interface Pass3D extends View3DPass {
  trace: SnapshotPassTrace;
}

/**
 * The corners' simulation in 3D (by request, 2026-11-23; for everyone since
 * the same day): the passes of the 2D map, as ghosts or lines, on a trail
 * laid on made-up low-poly hills — the trail at the reference's GNSS
 * altitude where it has one. The drawing is Scene3DView's; this lays the
 * passes on the trail by their GPS.
 */
export function SimulationMap3D({
  passes,
  reference,
  followedKey,
  lines = false,
  surroundings,
  cursorMs,
  height,
  clock,
  views,
  topLabel,
}: {
  passes: Pass3D[];
  reference: Pass3D;
  followedKey: string;
  /** "Linhas" in 3D (2026-11-23): every pass its own line on the road, in
   * its colour, the token at its tip — not only the reference's. */
  lines?: boolean;
  /** The trail around the stretch, [lat, lon]. */
  surroundings: [number, number][];
  cursorMs: number;
  height: number;
  clock?: React.ReactNode;
  views?: React.ReactNode;
  /** The top-view switch's label; no switch without it. */
  topLabel?: string;
}) {
  // Metres east and north of the reference's entry, as the 2D map.
  const lat0 = reference.trace.latDeg[0];
  const lon0 = reference.trace.lonDeg[0];
  const toXY = useMemo(() => {
    const cos = Math.cos(lat0 * RAD);
    return (lat: number, lon: number): [number, number] => [
      (lon - lon0) * RAD * R * cos,
      (lat - lat0) * RAD * R,
    ];
  }, [lat0, lon0]);

  const scene = useMemo(() => {
    const stretch = reference.trace.latDeg.map((lat, k) =>
      toXY(lat, reference.trace.lonDeg[k]),
    );
    const around =
      surroundings.length > 1
        ? smoothPolyline(surroundings).map(([lat, lon]) => toXY(lat, lon))
        : stretch;
    // The trail at the reference's real altitude where the GNSS gave one
    // (2026-11-23); the ground round it stays made up.
    return buildScene(around, stretch, seedFrom(lat0, lon0), {
      stretchAltM: reference.trace.altM,
    });
  }, [reference, surroundings, toXY, lat0, lon0]);

  const frame = useMemo((): View3DFrame => {
    const onRoad = (lat: number, lon: number): Vec3 => {
      const [x, y] = toXY(lat, lon);
      return [x, y, scene.roadHeightAt(x, y) + 0.05];
    };
    // The ground covered up to the cursor, and its tip.
    const covered = (trace: SnapshotPassTrace): Vec3[] => {
      const { k } = traceSampleAt(trace, cursorMs);
      const path: Vec3[] = [];
      for (let i = 0; i <= k; i++) path.push(onRoad(trace.latDeg[i], trace.lonDeg[i]));
      path.push(tipOf(trace));
      return path;
    };
    const tipOf = (trace: SnapshotPassTrace) =>
      onRoad(
        traceValueAt(trace, trace.latDeg, cursorMs),
        traceValueAt(trace, trace.lonDeg, cursorMs),
      );
    // As ghosts the reference's line alone, in ink; as "Linhas", each
    // pass's in its colour.
    const paths = new Map<string, Vec3[]>(
      lines
        ? passes.map((p) => [p.key, covered(p.trace)])
        : [[reference.key, covered(reference.trace)]],
    );
    // The gates: dashed marks across the road at the stretch's ends.
    const t = reference.trace;
    const n = t.latDeg.length;
    const gate = (k: number, toward: number): [Vec3, Vec3] => {
      const [x, y] = toXY(t.latDeg[k], t.lonDeg[k]);
      const [x2, y2] = toXY(t.latDeg[toward], t.lonDeg[toward]);
      const len = Math.hypot(x2 - x, y2 - y) || 1;
      const ox = (-(y2 - y) / len) * scene.roadHalfM * 1.4;
      const oy = ((x2 - x) / len) * scene.roadHalfM * 1.4;
      const z = scene.roadHeightAt(x, y) + 0.08;
      return [
        [x + ox, y + oy, z],
        [x - ox, y - oy, z],
      ];
    };
    return {
      paths,
      inkPaths: lines ? undefined : new Set([reference.key]),
      tokens: new Map(passes.map((p) => [p.key, tipOf(p.trace)])),
      gates: n > 1 ? [gate(0, Math.min(3, n - 1)), gate(n - 1, Math.max(0, n - 4))] : [],
    };
  }, [passes, reference, lines, cursorMs, scene, toXY]);

  return (
    <Scene3DView
      scene={scene}
      passes={passes}
      followedKey={followedKey}
      frame={frame}
      height={height}
      clock={clock}
      views={views}
      topLabel={topLabel}
    />
  );
}
