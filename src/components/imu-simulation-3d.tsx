"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { SnapshotPassTrace } from "@/lib/imu/snapshot";
import { traceSampleAt, traceValueAt } from "@/lib/imu/snapshot-simulation";
import { smoothPolyline } from "@/lib/imu/track-spline";
import { cn } from "@/lib/utils";
import {
  buildScene,
  faceLight,
  projector,
  seedFrom,
  type Camera,
  type Face,
  type Vec3,
} from "@/lib/imu/scene-3d";

const R = 6_371_000;
/** How far the wheel may zoom: in to a third of the framing distance, out
 * to twice it. */
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2;
/** The scene's frame fading to the page at all four edges. */
const FRAME_FADE =
  "linear-gradient(to bottom, transparent, black 10%, black 86%, transparent), linear-gradient(to right, transparent, black 7%, black 93%, transparent)";
const RAD = Math.PI / 180;
/** Straight down, a hair short of it: at exactly 90° the camera's own
 * bearing is lost. */
const TOP_ELEVATION = 1.55;
/** How far the map slides, a share of the ground's half-width. */
const PAN_LIMIT = 0.35;
/** The lines fade in over this many pieces, from this opacity at the
 * entry to full at the dot — the 2D map's numbers. */
const FADE_PIECES = 24;
const FADE_FROM = 0.05;

/** A pass as the 3D view needs it. */
export interface Pass3D {
  key: string;
  trace: SnapshotPassTrace;
  /** Its colour: a CSS colour or a `text-[#…]`/`text-primary` class. */
  ink: string;
  /** For the pill under the mouse, as on the 2D map. */
  name?: string;
  rider?: string | null;
}

/** Where each pass was drawn on the canvas, for the mouse to find. */
interface DrawnPass {
  key: string;
  line: [number, number][];
  token: [number, number, number] | null;
}

/** The distance from a point to a segment, px. */
function toSegment(
  px: number,
  py: number,
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** A "#rrggbb" (or "#rgb") colour as its three channels; mid grey for
 * anything else. */
function rgbOf(colour: string): [number, number, number] {
  const hex = colour.trim().replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [128, 128, 128];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** A Tailwind ink class turned into a colour the canvas can use. */
function colourOf(ink: string, root: HTMLElement): string {
  const hex = /#([0-9a-f]{6})/i.exec(ink);
  if (hex) return `#${hex[1]}`;
  const token = /text-(primary|foreground)/.exec(ink);
  if (token)
    return getComputedStyle(root).getPropertyValue(`--${token[1]}`).trim() || "#d9ff00";
  return ink;
}

/**
 * The simulation in 3D (by request, 2026-11-23; for everyone since the same
 * day): the passes of the 2D map, as ghosts or lines, on a trail laid on
 * white low-poly hills in perspective. Drawn on a canvas
 * by hand (scene-3d.ts), no library: the ground, the road and the
 * decorations once per camera angle, the ghosts over them each frame.
 * Dragging turns the camera. The ground is made up.
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
  /** The top-view button's label; no button without it. */
  topLabel?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const drawnRef = useRef<DrawnPass[]>([]);
  const [width, setWidth] = useState(0);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const [camera, setCamera] = useState({
    azimuth: 0.55,
    elevation: 0.72,
    /** The wheel's zoom: a share of the framing distance (2026-11-23). */
    zoom: 1,
    /** Slid along the ground by dragging (2026-11-23), m from the stretch's
     * middle, within PAN_LIMIT of the ground's half-width. */
    panX: 0,
    panY: 0,
  });
  // The top view (by request, 2026-11-23): the camera straight down, north
  // up; the angle it came from kept, to go back to. Eased both ways.
  const [beforeTop, setBeforeTop] = useState<{ azimuth: number; elevation: number } | null>(
    null,
  );
  const tween = useRef(0);
  const swing = (to: { azimuth: number; elevation: number }) => {
    cancelAnimationFrame(tween.current);
    const start = performance.now();
    let from: { azimuth: number; elevation: number } | null = null;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 450);
      const e = 1 - (1 - k) ** 3;
      setCamera((c) => {
        from ??= { azimuth: c.azimuth, elevation: c.elevation };
        // The short way round to the bearing.
        const turn = Math.atan2(
          Math.sin(to.azimuth - from.azimuth),
          Math.cos(to.azimuth - from.azimuth),
        );
        return {
          ...c,
          azimuth: from.azimuth + turn * e,
          elevation: from.elevation + (to.elevation - from.elevation) * e,
        };
      });
      if (k < 1) tween.current = requestAnimationFrame(step);
    };
    tween.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(tween.current), []);
  const toggleTop = () => {
    if (beforeTop) {
      swing(beforeTop);
      setBeforeTop(null);
    } else {
      setBeforeTop({ azimuth: camera.azimuth, elevation: camera.elevation });
      swing({ azimuth: 0, elevation: TOP_ELEVATION });
    }
  };

  // The wheel (a trackpad's pinch too, which comes as a wheel with Ctrl)
  // zooms. A native listener, not React's: React's wheel listeners are
  // passive, and only a non-passive one can keep the page from scrolling
  // under the scene.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setCamera((c) => ({
        ...c,
        zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.zoom * step)),
      }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  const cam: Camera = useMemo(() => {
    const fov = 0.62;
    return {
      azimuth: camera.azimuth,
      elevation: camera.elevation,
      target: [
        scene.centre[0] + camera.panX,
        scene.centre[1] + camera.panY,
        scene.centre[2],
      ] as Vec3,
      distance: ((scene.extentM * 0.46) / Math.tan(fov / 2)) * camera.zoom,
      fov,
    };
  }, [camera, scene]);

  // The static layer: ground, decorations and road, back to front.
  useEffect(() => {
    if (width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const layer = staticRef.current ?? document.createElement("canvas");
    staticRef.current = layer;
    layer.width = width * dpr;
    layer.height = height * dpr;
    const ctx = layer.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const project = projector(cam, width, height);

    // White in the light. In the dark (by request, 2026-11-23, after a
    // reference image, with more contrast): near-black facets lit up to a
    // graphite on the slopes facing the light, a light wireframe over
    // them, and the road a darker band than the ground with a light rim.
    const base = dark ? [52, 55, 62] : [247, 247, 248];
    const tone = (face: Face) => {
      const light = faceLight(face);
      const k = dark
        ? face.material === 1
          ? 0.42 + 0.06 * light
          : face.material === 2
            ? 0.3 + 0.15 * light
            : face.material === 3
              ? // Trees and rocks: steep faces, which the ground's curve
                // would leave black — lit on their own so they stand out.
                0.6 + 0.9 * light
              : // Spread round a flat face's light (~0.8), so a slope
              // turned away is near black and one facing the light shines.
              0.45 + 0.85 * Math.max(0, Math.min(1, (light - 0.6) / 0.4)) ** 1.3
        : face.material === 1
          ? 0.93 + 0.07 * light
          : face.material === 2
            ? 0.66 + 0.2 * light
            : 0.5 + 0.5 * light;
      const [r, g, b] = base.map((c) => Math.round(Math.min(255, c * k)));
      return `rgb(${r},${g},${b})`;
    };
    const edge = dark ? "rgba(255,255,255,0.17)" : "rgba(255,255,255,0.75)";
    const rim = dark ? "rgba(255,255,255,0.3)" : edge;

    // The edges fade out in the scene itself (by request, 2026-11-23): each
    // face the more transparent the further it is from the stretch, so the
    // ground ends as a soft round patch whatever the angle, and the road
    // running on past it fades with it.
    const [ox, oy] = scene.centre;
    const fadeOf = (face: Face) => {
      const x = (face.a[0] + face.b[0] + face.c[0]) / 3 - ox;
      const y = (face.a[1] + face.b[1] + face.c[1]) / 3 - oy;
      const r = Math.hypot(x, y) / scene.halfM;
      const t = Math.max(0, Math.min(1, (r - 0.45) / 0.5));
      return 1 - t * t * (3 - 2 * t);
    };
    const draw = (faces: Face[]) => {
      const placed = faces
        .map((face) => {
          const a = project(face.a);
          const b = project(face.b);
          const c = project(face.c);
          if (!a || !b || !c) return null;
          const alpha = fadeOf(face);
          if (alpha <= 0.01) return null;
          return { face, a, b, c, alpha, depth: (a[2] + b[2] + c[2]) / 3 };
        })
        .filter((p) => p !== null)
        .sort((p, q) => q.depth - p.depth);
      for (const { face, a, b, c, alpha } of placed) {
        const fill = tone(face);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        // The fill's own colour round it first, hiding the hairline seams
        // between faces; then the faint light edge of the low-poly look.
        ctx.strokeStyle = fill;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        if (face.material !== 1) {
          ctx.strokeStyle = face.material === 0 ? edge : rim;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    };
    draw([...scene.ground, ...scene.props]);
    draw(scene.road);
    ctx.globalAlpha = 1;
  }, [scene, cam, width, height, dark]);

  // The moving layer: the static image, then the reference's line, the
  // gates and the ghosts, each frame of the replay.
  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = staticRef.current;
    if (!canvas || !layer || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr) canvas.width = width * dpr;
    if (canvas.height !== height * dpr) canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(layer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const project = projector(cam, width, height);
    const root = document.documentElement;
    const onRoad = (lat: number, lon: number): Vec3 => {
      const [x, y] = toXY(lat, lon);
      return [x, y, scene.roadHeightAt(x, y) + 0.05];
    };

    // The gates: dashed marks across the road at the stretch's ends.
    const t = reference.trace;
    const n = t.latDeg.length;
    const gate = (k: number, toward: number) => {
      const [x, y] = toXY(t.latDeg[k], t.lonDeg[k]);
      const [x2, y2] = toXY(t.latDeg[toward], t.lonDeg[toward]);
      const len = Math.hypot(x2 - x, y2 - y) || 1;
      const ox = (-(y2 - y) / len) * scene.roadHalfM * 1.4;
      const oy = ((x2 - x) / len) * scene.roadHalfM * 1.4;
      const z = scene.roadHeightAt(x, y) + 0.08;
      const a = project([x + ox, y + oy, z]);
      const b = project([x - ox, y - oy, z]);
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.7)" : "rgba(16,16,20,0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (n > 1) {
      gate(0, Math.min(3, n - 1));
      gate(n - 1, Math.max(0, n - 4));
    }

    // The ground covered, as lines on the road: as ghosts, the
    // reference's alone in ink; as "Linhas", every pass's in its colour,
    // the followed one on top and bolder.
    // Fading in from the entry to the dot, as on the 2D map (by request,
    // 2026-11-23): pieces that share their ends, each a shade stronger,
    // with flat ends so the joins don't darken.
    const coveredLine = (trace: SnapshotPassTrace, stroke: string, w: number) => {
      const { k: upTo } = traceSampleAt(trace, cursorMs);
      const pts: [number, number][] = [];
      for (let i = 0; i <= upTo; i++) {
        const p = project(onRoad(trace.latDeg[i], trace.lonDeg[i]));
        if (p) pts.push([p[0], p[1]]);
      }
      const tip = project(
        onRoad(
          traceValueAt(trace, trace.latDeg, cursorMs),
          traceValueAt(trace, trace.lonDeg, cursorMs),
        ),
      );
      if (tip && pts.length) pts.push([tip[0], tip[1]]);
      const n = Math.min(FADE_PIECES, pts.length - 1);
      if (n < 1) return pts;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = w;
      ctx.lineJoin = "round";
      ctx.lineCap = "butt";
      const alpha = ctx.globalAlpha;
      for (let j = 0; j < n; j++) {
        const from = Math.floor((j * (pts.length - 1)) / n);
        const to = Math.floor(((j + 1) * (pts.length - 1)) / n);
        ctx.beginPath();
        ctx.moveTo(pts[from][0], pts[from][1]);
        for (let i = from + 1; i <= to; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.globalAlpha = alpha * (FADE_FROM + ((1 - FADE_FROM) * (j + 1)) / n);
        ctx.stroke();
      }
      ctx.globalAlpha = alpha;
      return pts;
    };
    // What was drawn where, for the pill under the mouse.
    const drawn = new Map<string, DrawnPass>(
      passes.map((p) => [p.key, { key: p.key, line: [], token: null }]),
    );
    if (lines) {
      const order = [
        ...passes.filter((p) => p.key !== followedKey),
        ...passes.filter((p) => p.key === followedKey),
      ];
      for (const p of order) {
        const line = coveredLine(
          p.trace,
          colourOf(p.ink, root),
          p.key === followedKey ? 5 : 4,
        );
        const d = drawn.get(p.key);
        if (d) d.line = line;
      }
    } else {
      const line = coveredLine(
        t,
        dark ? "rgba(255,255,255,0.85)" : "rgba(16,16,20,0.8)",
        5,
      );
      const d = drawn.get(reference.key);
      if (d) d.line = line;
    }

    // The ghosts: flat cylinders, a token on the road each (by request,
    // 2026-11-23, in place of balls) — far first, each with its shadow.
    // Smaller than the first cut, twice (by request, 2026-11-23).
    const radius = scene.roadHalfM * 0.24;
    const tall = radius * 0.45;
    const SIDES = 20;
    const placed = passes
      .map((p) => {
        const lat = traceValueAt(p.trace, p.trace.latDeg, cursorMs);
        const lon = traceValueAt(p.trace, p.trace.lonDeg, cursorMs);
        const [x, y, z] = onRoad(lat, lon);
        const middle = project([x, y, z + tall / 2]);
        return middle ? { p, x, y, z, depth: middle[2] } : null;
      })
      .filter((g) => g !== null)
      .sort((g, h) => h.depth - g.depth);
    for (const { p, x, y, z } of placed) {
      const r = radius * (p.key === followedKey ? 1.15 : 1);
      const ring = (zz: number, rr: number) =>
        Array.from({ length: SIDES }, (_, i) => {
          const a = (i / SIDES) * Math.PI * 2;
          return project([x + Math.cos(a) * rr, y + Math.sin(a) * rr, zz]);
        });
      const shadow = ring(z, r * 1.25);
      const bottom = ring(z, r);
      const top = ring(z + tall, r);
      if ([...shadow, ...bottom, ...top].some((q) => q === null)) continue;
      const pts = (ring: ([number, number, number] | null)[]) =>
        ring as [number, number, number][];
      const polygon = (ring: [number, number, number][]) => {
        ctx.beginPath();
        ring.forEach(([sx, sy], i) =>
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy),
        );
        ctx.closePath();
      };
      // The shadow, soft and a little larger, on the road.
      polygon(pts(shadow));
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fill();
      const [cr, cg, cb] = rgbOf(colourOf(p.ink, root));
      const tint = (k: number) =>
        `rgb(${Math.round(Math.min(255, cr * k))},${Math.round(Math.min(255, cg * k))},${Math.round(Math.min(255, cb * k))})`;
      // The side: its quads back to front, darker as they turn from the
      // light (from the upper left, as the ground's).
      const b = pts(bottom);
      const t2 = pts(top);
      const quads = Array.from({ length: SIDES }, (_, i) => {
        const j = (i + 1) % SIDES;
        const a = ((i + 0.5) / SIDES) * Math.PI * 2;
        const lit = Math.max(0, -Math.cos(a) * 0.6 + Math.sin(a) * 0.45);
        return {
          q: [b[i], b[j], t2[j], t2[i]],
          depth: (b[i][2] + b[j][2]) / 2,
          k: 0.62 + 0.3 * lit,
        };
      }).sort((m, n) => n.depth - m.depth);
      for (const { q, k } of quads) {
        polygon(q);
        ctx.fillStyle = tint(k);
        ctx.fill();
        ctx.strokeStyle = tint(k);
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      // The top, the colour itself, with a thin light rim.
      polygon(t2);
      ctx.fillStyle = tint(1.04);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Its place on screen: the middle of its top and its widest reach.
      const mx = t2.reduce((s, q) => s + q[0], 0) / SIDES;
      const my = t2.reduce((s, q) => s + q[1], 0) / SIDES;
      const reach = Math.max(...t2.map((q) => Math.hypot(q[0] - mx, q[1] - my)));
      const d = drawn.get(p.key);
      if (d) d.token = [mx, my, reach];
    }
    drawnRef.current = [...drawn.values()];
  }, [passes, reference, followedKey, lines, cursorMs, cam, scene, toXY, width, height, dark]);

  // Dragging turns the camera: across for the bearing, up and down for the
  // height, within bounds that keep the hills in view.
  const drag = useRef<{ x: number; y: number; pan: boolean } | null>(null);
  // The pass under the mouse and where the mouse is, for its pill — a
  // token first, then a line within a few px (as the 2D map's 12 px band).
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(
    null,
  );
  const readHover = (clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = clientX - box.left;
    const y = clientY - box.top;
    let best: { key: string; d: number } | null = null;
    for (const p of drawnRef.current) {
      if (!p.token) continue;
      const d = Math.hypot(x - p.token[0], y - p.token[1]);
      if (d <= p.token[2] + 3 && (!best || d < best.d)) best = { key: p.key, d };
    }
    if (!best)
      for (const p of drawnRef.current)
        for (let i = 1; i < p.line.length; i++) {
          const d = toSegment(x, y, p.line[i - 1], p.line[i]);
          if (d <= 6 && (!best || d < best.d)) best = { key: p.key, d };
        }
    setHover(best ? { key: best.key, x, y } : null);
  };
  const hovered = hover && passes.find((p) => p.key === hover.key);
  return (
    <div
      ref={boxRef}
      // On the card's own white (by request, 2026-11-23): the scene fades
      // into it, inside the plate's outline.
      className="relative w-full touch-none overflow-hidden rounded-[16px] bg-card select-none"
      style={{ height }}
      onPointerDown={(e) => {
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          // Sliding the map (by request, 2026-11-23): any drag in the top
          // view; in perspective, with Shift or the right button — a plain
          // drag there still turns the camera.
          pan: beforeTop !== null || e.shiftKey || e.button === 2,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={(e) => {
        const from = drag.current;
        if (!from) {
          readHover(e.clientX, e.clientY);
          return;
        }
        if (hover) setHover(null);
        drag.current = { ...from, x: e.clientX, y: e.clientY };
        const dx = e.clientX - from.x;
        const dy = e.clientY - from.y;
        if (from.pan) {
          // The ground under the mouse follows it: metres per px at the
          // target's depth, the far-near way stretched by the tilt.
          const perPx = (2 * cam.distance * Math.tan(cam.fov / 2)) / height;
          const a = cam.azimuth;
          const along = perPx / Math.max(0.5, Math.sin(cam.elevation));
          const limit = scene.halfM * PAN_LIMIT;
          const clamp = (v: number) => Math.max(-limit, Math.min(limit, v));
          setCamera((c) => ({
            ...c,
            panX: clamp(c.panX - Math.cos(a) * dx * perPx + Math.sin(a) * dy * along),
            panY: clamp(c.panY + Math.sin(a) * dx * perPx + Math.cos(a) * dy * along),
          }));
          return;
        }
        // Turning by hand leaves the top view.
        if (beforeTop) setBeforeTop(null);
        setCamera((c) => ({
          ...c,
          azimuth: c.azimuth + dx * 0.008,
          elevation: Math.max(0.3, Math.min(1.35, c.elevation + dy * 0.005)),
        }));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onPointerLeave={() => setHover(null)}
    >
      <canvas
        ref={canvasRef}
        className="block cursor-grab active:cursor-grabbing"
        style={{
          width,
          height,
          // The frame's own edges fade too: close up, the ground nearest
          // the camera runs past the bottom, and would be cut there.
          maskImage: FRAME_FADE,
          WebkitMaskImage: FRAME_FADE,
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
        }}
      />
      {clock && <div className="absolute bottom-4 left-4">{clock}</div>}
      {/* The plate's soft outline, back on the white (by request,
          2026-11-23). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[16px] ring-1 ring-foreground/10 ring-inset"
      />
      {(views || topLabel) && (
        <div
          className="absolute top-3 left-3 flex items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {views}
          {topLabel && (
            // A switch (by request, 2026-11-23): the session's "Valores"
            // track and thumb, on the views' pill.
            <button
              type="button"
              role="switch"
              aria-checked={beforeTop !== null}
              onClick={toggleTop}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-[12px] bg-card px-3 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {topLabel}
              <span
                aria-hidden
                className={cn(
                  "relative h-4 w-7 shrink-0 rounded-full transition-colors",
                  beforeTop !== null ? "bg-foreground" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform",
                    beforeTop !== null && "translate-x-3",
                  )}
                />
              </span>
            </button>
          )}
        </div>
      )}
      {/* The run and its rider over what the mouse is on, as on the 2D
          map (by request, 2026-11-23). */}
      {hover && hovered?.name && (
        <div
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-full items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm whitespace-nowrap shadow-sm"
          style={{
            left: Math.min(width - 80, Math.max(80, hover.x)),
            top: hover.y - 10,
          }}
        >
          <span
            aria-hidden
            className={cn("size-2.5 shrink-0 rounded-full bg-current", hovered.ink)}
          />
          <span className="font-medium">{hovered.name}</span>
          {hovered.rider && (
            <span className="text-muted-foreground">{hovered.rider}</span>
          )}
        </div>
      )}
    </div>
  );
}
