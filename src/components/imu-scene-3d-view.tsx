"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  faceLight,
  polygonProjector,
  projector,
  type Camera,
  type Face,
  type Scene,
  type Vec3,
} from "@/lib/imu/scene-3d";

/** How far the wheel may zoom: in to a third of the framing distance, out
 * to twice it. */
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2;
/** The scene's frame fading to the page at all four edges. */
const FRAME_FADE =
  "linear-gradient(to bottom, transparent, black 10%, black 86%, transparent), linear-gradient(to right, transparent, black 7%, black 93%, transparent)";
/** Straight down, a hair short of it: at exactly 90° the camera's own
 * bearing is lost. */
const TOP_ELEVATION = 1.55;
/** How far the map slides, a share of the ground's half-width. */
const PAN_LIMIT = 0.35;
/** The lines fade in over this many pieces, from this opacity at the
 * entry to full at the dot — the 2D map's numbers. */
const FADE_PIECES = 24;
const FADE_FROM = 0.05;

/** A pass as the view draws it. */
export interface View3DPass {
  key: string;
  /** Its colour: a CSS colour or a `text-[#…]`/`text-primary` class. */
  ink: string;
  /** For the pill under the mouse, as on the 2D map. */
  name?: string;
  rider?: string | null;
}

/** What the view draws at one moment of the replay, in the scene's metres. */
export interface View3DFrame {
  /** Each pass's ground covered so far, the entry to where it is now. */
  paths: Map<string, Vec3[]>;
  /** Where each pass's token stands. */
  tokens: Map<string, Vec3>;
  /** Which way each token's tip points, radians from +x towards +y — for
   * triangles; +x without. */
  headings?: Map<string, number>;
  /** The paths drawn in the page's ink rather than the pass's colour —
   * the ghosts' one line. */
  inkPaths?: Set<string>;
  /** Each pass's whole ride, thin and dashed under the part covered (the
   * jumps', as their side view). */
  dashed?: Map<string, Vec3[]>;
  /** Dashed marks across the road: the gates. */
  gates: [Vec3, Vec3][];
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
 * The simulation's 3D view (2026-11-23), whatever is laid in it: a scene of
 * made-up low-poly ground with its road (scene-3d.ts), and over it, each
 * frame, each pass's line and token where the caller puts them — the
 * corners on the GPS, the jumps along their run. Drawn on a canvas by
 * hand, no library: the scene once per camera angle, the passes each
 * frame. Dragging turns the camera, the wheel zooms, Shift-drag (or any
 * drag from the top) slides it.
 */
export function Scene3DView({
  scene,
  passes,
  followedKey,
  frame,
  initialCamera = { azimuth: 0.55, elevation: 0.72, zoom: 1 },
  tokenRadiusM,
  tokenShape = "disc",
  snapTo = { azimuth: 0, elevation: TOP_ELEVATION },
  zoomMin = ZOOM_MIN,
  height,
  clock,
  views,
  topLabel,
  caption,
  namesLabel,
}: {
  scene: Scene;
  passes: View3DPass[];
  followedKey: string;
  frame: View3DFrame;
  initialCamera?: { azimuth: number; elevation: number; zoom?: number };
  /** The tokens' radius, m; a quarter of the road's half-width without. */
  tokenRadiusM?: number;
  /** Round tokens, or triangles pointing along +x. */
  tokenShape?: "disc" | "triangle";
  /** Where the switch swings the camera: straight down by default; the
   * jumps' from the front (2026-11-23). */
  snapTo?: { azimuth: number; elevation: number };
  /** How close the wheel may go, a share of the framing distance. */
  zoomMin?: number;
  height: number;
  clock?: React.ReactNode;
  views?: React.ReactNode;
  /** The top-view switch's label; no switch without it. */
  topLabel?: string;
  /** In the bottom-right corner: the track and the place. */
  caption?: React.ReactNode;
  /** The names switch's label: every pass's pill over its token, always.
   * No switch without it. */
  namesLabel?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const drawnRef = useRef<DrawnPass[]>([]);
  const [width, setWidth] = useState(0);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const [camera, setCamera] = useState({
    azimuth: initialCamera.azimuth,
    elevation: initialCamera.elevation,
    /** The wheel's zoom: a share of the framing distance (2026-11-23). */
    zoom: initialCamera.zoom ?? 1,
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
      swing(snapTo);
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
        zoom: Math.max(zoomMin, Math.min(ZOOM_MAX, c.zoom * step)),
      }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomMin]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cam: Camera = useMemo(() => {
    const fov = 0.62;
    const distance = ((scene.extentM * 0.46) / Math.tan(fov / 2)) * camera.zoom;
    // Level with the ground (the jumps' front view, below the drag's 0.3),
    // the camera looks higher, so the ground sits on the plate's bottom and
    // the flight fills it (by request, 2026-11-23) — eased in as it comes
    // down, none from 0.3 up.
    const level = Math.max(0, Math.min(1, (0.3 - camera.elevation) / 0.2));
    const lift = level * 0.62 * distance * Math.tan(fov / 2);
    return {
      azimuth: camera.azimuth,
      elevation: camera.elevation,
      target: [
        scene.centre[0] + camera.panX,
        scene.centre[1] + camera.panY,
        scene.centre[2] + lift,
      ] as Vec3,
      distance,
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
    // The road's sides outlined almost in the ground's own colour (by
    // request, 2026-11-23): the light rim read as a hatched outline.
    const roadSide = dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.35)";

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
    // Each face cut at the camera's near plane, so close up the ground does
    // not lose every face with a corner behind it (2026-11-23).
    const polygon = polygonProjector(cam, width, height);
    const draw = (faces: Face[]) => {
      const placed = faces
        .map((face) => {
          const corners = polygon([face.a, face.b, face.c]);
          if (!corners) return null;
          const alpha = fadeOf(face);
          if (alpha <= 0.01) return null;
          const depth = corners.reduce((sum, q) => sum + q[2], 0) / corners.length;
          return { face, corners, alpha, depth };
        })
        .filter((p) => p !== null)
        .sort((p, q) => q.depth - p.depth);
      for (const { face, corners, alpha } of placed) {
        const fill = tone(face);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        // The fill's own colour round it first, hiding the hairline seams
        // between faces; then the faint light edge of the low-poly look.
        ctx.strokeStyle = fill;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        if (face.material !== 1) {
          ctx.strokeStyle =
            face.material === 0 ? edge : face.material === 2 ? roadSide : rim;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    };
    draw([...scene.ground, ...scene.props]);
    draw(scene.road);
    ctx.globalAlpha = 1;
  }, [scene, cam, width, height, dark]);

  // The moving layer: the static image, then the gates, the lines and the
  // tokens, each frame of the replay.
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
    const ink = dark ? "rgba(255,255,255,0.85)" : "rgba(16,16,20,0.8)";

    // The gates: dashed marks across the road.
    for (const [from, to] of frame.gates) {
      const a = project(from);
      const b = project(to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.7)" : "rgba(16,16,20,0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const onScreen = (path: Vec3[]) =>
      path.flatMap((q) => {
        const p = project(q);
        return p ? [[p[0], p[1]] as [number, number]] : [];
      });
    // The whole rides, thin and dashed, under everything else.
    if (frame.dashed)
      for (const path of frame.dashed.values()) {
        const pts = onScreen(path);
        if (pts.length < 2) continue;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.28)" : "rgba(16,16,20,0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }

    // The ground covered, fading in from the entry to the token, as on the
    // 2D map (by request, 2026-11-23): pieces that share their ends, each a
    // shade stronger, with flat ends so the joins don't darken.
    const coveredLine = (path: Vec3[], stroke: string, w: number) => {
      const pts = onScreen(path);
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
    // The followed one on top, and bolder.
    const order = [
      ...passes.filter((p) => p.key !== followedKey),
      ...passes.filter((p) => p.key === followedKey),
    ];
    for (const p of order) {
      const path = frame.paths.get(p.key);
      if (!path) continue;
      const inked = frame.inkPaths?.has(p.key) ?? false;
      const line = coveredLine(
        path,
        inked ? ink : colourOf(p.ink, root),
        inked ? 5 : p.key === followedKey ? 5 : 4,
      );
      const d = drawn.get(p.key);
      if (d) d.line = line;
    }

    // The ghosts: flat cylinders, a token on the road each (by request,
    // 2026-11-23, in place of balls) — far first, each with its shadow.
    // Smaller than the first cut, twice (by request, 2026-11-23).
    const radius = tokenRadiusM ?? scene.roadHalfM * 0.24;
    const tall = radius * 0.45;
    // A disc, or a triangle with a tip along +x — the jumps' way of travel
    // (by request, 2026-11-23).
    const SIDES = tokenShape === "triangle" ? 3 : 20;
    const placed = passes
      .map((p) => {
        const at = frame.tokens.get(p.key);
        if (!at) return null;
        const [x, y, z] = at;
        const middle = project([x, y, z + tall / 2]);
        return middle ? { p, x, y, z, depth: middle[2] } : null;
      })
      .filter((g) => g !== null)
      .sort((g, h) => h.depth - g.depth);
    for (const { p, x, y, z } of placed) {
      const r = radius * (p.key === followedKey ? 1.15 : 1);
      const turn = frame.headings?.get(p.key) ?? 0;
      const ring = (zz: number, rr: number) =>
        Array.from({ length: SIDES }, (_, i) => {
          const a = (i / SIDES) * Math.PI * 2 + turn;
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
      // The top, the colour itself — no light rim (by request, 2026-11-23:
      // it read as a wireframe outline on the arrows). Stroked in its own
      // colour, only to close the hairline against the sides.
      polygon(t2);
      ctx.fillStyle = tint(1.04);
      ctx.fill();
      ctx.strokeStyle = tint(1.04);
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // Its place on screen: the middle of its top and its widest reach.
      const mx = t2.reduce((s, q) => s + q[0], 0) / SIDES;
      const my = t2.reduce((s, q) => s + q[1], 0) / SIDES;
      const reach = Math.max(...t2.map((q) => Math.hypot(q[0] - mx, q[1] - my)));
      const d = drawn.get(p.key);
      if (d) d.token = [mx, my, reach];
    }
    drawnRef.current = [...drawn.values()];
  }, [passes, followedKey, frame, cam, scene, width, height, dark, tokenRadiusM, tokenShape]);

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

  // Every pass's pill over its token, always, by a switch (by request,
  // 2026-11-24). Placed nearest first; a pill that would cover one already
  // placed climbs above it, a hairline down to its token.
  const [names, setNames] = useState(false);
  const pins = useMemo(() => {
    if (!names || !namesLabel) return [];
    const project = projector(cam, width, height);
    const lift = (tokenRadiusM ?? scene.roadHalfM * 0.24) * 0.45;
    const PILL_H = 26;
    const placed = passes
      .flatMap((p) => {
        const at = frame.tokens.get(p.key);
        const s = at && project([at[0], at[1], at[2] + lift]);
        return s && p.name ? [{ p, x: s[0], y: s[1], depth: s[2] }] : [];
      })
      .sort((a, b) => a.depth - b.depth);
    const rects: { l: number; r: number; t: number; b: number }[] = [];
    return placed.map(({ p, x, y }) => {
      // The pill's width, near enough: its words at the xs size, the dot
      // and the padding.
      const w = (p.name!.length + (p.rider?.length ?? 0)) * 6.2 + 44;
      const left = Math.min(width - w - 8, Math.max(8, x - w / 2));
      // Well clear of its arrow (by request, 2026-11-24), a hairline down.
      let top = y - 56 - PILL_H;
      const hits = (t: number) =>
        rects.some((r) => left < r.r && left + w > r.l && t < r.b && t + PILL_H > r.t);
      while (hits(top) && top > 4) top -= PILL_H + 4;
      rects.push({ l: left, r: left + w, t: top, b: top + PILL_H });
      return { p, x, y, left, top, h: PILL_H };
    });
  }, [names, namesLabel, cam, width, height, passes, frame, tokenRadiusM, scene]);
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
          pan:
            (beforeTop !== null && snapTo.elevation > 1) ||
            e.shiftKey ||
            e.button === 2,
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
      {/* Where it was ridden, opposite the clock (2026-11-24). */}
      {caption && (
        <div className="pointer-events-none absolute right-4 bottom-4 max-w-[45%]">
          {caption}
        </div>
      )}
      {/* The plate's outline, almost the card's own colour (by request,
          2026-11-23): there, but barely. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[16px] ring-1 ring-foreground/[0.04] ring-inset"
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
      {namesLabel && (
        <div
          className="absolute top-3 right-3"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="switch"
            aria-checked={names}
            onClick={() => setNames((on) => !on)}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-[12px] bg-card px-3 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {namesLabel}
            <span
              aria-hidden
              className={cn(
                "relative h-4 w-7 shrink-0 rounded-full transition-colors",
                names ? "bg-foreground" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform",
                  names && "translate-x-3",
                )}
              />
            </span>
          </button>
        </div>
      )}
      {pins.length > 0 && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
        >
          {pins.map(({ p, x, y, top, h }) =>
            top + h < y - 8 ? (
              <line
                key={p.key}
                x1={x}
                y1={top + h}
                x2={x}
                y2={y - 6}
                className="stroke-muted-foreground/50"
                strokeWidth={1}
              />
            ) : null,
          )}
        </svg>
      )}
      {pins.map(({ p, left, top, h }) => (
        <div
          key={p.key}
          className="pointer-events-none absolute flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs whitespace-nowrap shadow-sm"
          style={{ left, top, height: h }}
        >
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full bg-current", p.ink)}
          />
          <span className="font-medium">{p.name}</span>
          {p.rider && <span className="text-muted-foreground">{p.rider}</span>}
        </div>
      ))}
      {/* The run and its rider over what the mouse is on, as on the 2D
          map (by request, 2026-11-23) — not twice, under the names. */}
      {hover && hovered?.name && !(names && namesLabel) && (
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
