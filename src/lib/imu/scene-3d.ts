/**
 * A small 3D scene for the simulation's prototype (by request, 2026-11-23):
 * white low-poly ground in perspective, the trail raised on it like a road,
 * and a few discreet trees and rocks — the look of the supplied reference
 * image, with no library (no three.js at this stage, by request).
 *
 * The ground is MADE UP: there is no elevation model yet. It is smooth
 * hills from a seed (the stretch's own coordinates, so the same Snapshot
 * always gets the same hills), flattened under the trail so the road lies
 * on it. The trees and rocks are decoration, not data.
 *
 * World units are metres: x east, y north, z up, from the reference's
 * entry. Everything here is pure — the canvas drawing is the component's.
 */

export type Vec3 = [number, number, number];

/** One flat face, its corners anticlockwise seen from outside. */
export interface Face {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  /** 0 the ground's white, 1 the road's top, 2 the road's sides, 3 the
   * decorations. The drawing picks the colours. */
  material: 0 | 1 | 2 | 3;
}

export interface Scene {
  ground: Face[];
  /** Trees and rocks, sorted with the ground. */
  props: Face[];
  /** The raised road: drawn after the ground. */
  road: Face[];
  /** The road's top height along the trail, for the dots and the gates. */
  roadHeightAt: (x: number, y: number) => number;
  /** The road's half width, m. */
  roadHalfM: number;
  /** The middle of the stretch and how far the scene reaches, m — what
   * the camera frames. */
  centre: Vec3;
  extentM: number;
  /** Half the ground's side, m: where it ends, for the fade. */
  halfM: number;
}

/** The real altitude's rise and fall drawn this much taller: a stretch of
 * a few dozen metres climbs or drops only a few. */
const ALT_EXAGGERATION = 1.5;

/** Deterministic pseudo-random numbers from a seed (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from a place: the same stretch, the same hills. */
export function seedFrom(latDeg: number, lonDeg: number): number {
  return (Math.round(latDeg * 1e5) * 73856093) ^ (Math.round(lonDeg * 1e5) * 19349663);
}

/** The nearest point of a polyline, its distance and the index of the
 * segment it falls on with the share along it. */
function nearestOnLine(
  line: [number, number][],
  x: number,
  y: number,
): { d: number; i: number; t: number } {
  let best = { d: Infinity, i: 0, t: 0 };
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best.d) best = { d, i, t };
  }
  return best;
}

const smoothstep = (e0: number, e1: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * The scene around a trail.
 *
 * `trail` is the trail drawn around the stretch, in metres; `stretch` the
 * reference's own line through it, which the camera centres on.
 */
export function buildScene(
  trail: [number, number][],
  stretch: [number, number][],
  seed: number,
  options: {
    cells?: number;
    /** The stretch's real altitude, m, one per `stretch` point (the GNSS,
     * 2026-11-23): the trail follows it there, the hills bend to meet it. */
    stretchAltM?: number[];
  } = {},
): Scene {
  const cells = options.cells ?? 26;
  const random = rng(seed);
  const pts = stretch.length > 1 ? stretch : trail;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(30, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // The ground reaches well past the stretch, so the hills frame it.
  const half = span * 0.95;
  // Wider than a real singletrack: at this scale a true 1.25 m reads as a
  // thread (the reference image's road is a band).
  const roadHalfM = Math.max(2, span * 0.045);

  // The made-up hills: a few broad bumps and a gentle tilt, as tall as a
  // fifth of the stretch — exaggerated on purpose, a short stretch being
  // nearly flat in metres.
  const amp = span * 0.2;
  const hills = Array.from({ length: 7 }, () => ({
    x: cx + (random() * 2 - 1) * half,
    y: cy + (random() * 2 - 1) * half,
    r: half * (0.25 + random() * 0.45),
    h: amp * (0.35 + random() * 0.65) * (random() < 0.2 ? -0.5 : 1),
  }));
  const tiltX = (random() * 2 - 1) * 0.08;
  const tiltY = (random() * 2 - 1) * 0.08;
  const invented = (x: number, y: number) => {
    let z = (x - cx) * tiltX + (y - cy) * tiltY;
    for (const h of hills) {
      const d2 = ((x - h.x) ** 2 + (y - h.y) ** 2) / (h.r * h.r);
      z += h.h * Math.exp(-d2);
    }
    return z;
  };

  // The road's height along the trail: the ground's, smoothed, so the road
  // climbs and falls with the hills without their bumps.
  const smooth = (values: number[], reach: number) =>
    values.map((_, k) => {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, k - reach); j <= Math.min(values.length - 1, k + reach); j++) {
        sum += values[j];
        n++;
      }
      return sum / n;
    });
  const inventedRoad = smooth(trail.map(([x, y]) => invented(x, y)), 6);

  // The real altitude where there is one (by request, 2026-11-23): on the
  // stretch the trail takes the GNSS's rise and fall, set on the made-up
  // ground's mean level there; past the stretch it carries on from its
  // nearer end. What that moved the trail by, the hills are moved by too,
  // fading with distance, so they meet the trail instead of cutting it.
  const alt = options.stretchAltM;
  const delta = trail.map(() => 0);
  if (alt && alt.length === stretch.length && stretch.length > 1) {
    const on = trail.map(([x, y]) => {
      const { d, i, t } = nearestOnLine(stretch, x, y);
      if (d > roadHalfM * 2) return null;
      return alt[i] + t * ((alt[Math.min(i + 1, alt.length - 1)] ?? alt[i]) - alt[i]);
    });
    const ks = on.flatMap((v, k) => (v == null ? [] : [k]));
    if (ks.length > 1) {
      const meanReal = ks.reduce((s, k) => s + (on[k] as number), 0) / ks.length;
      const meanMade = ks.reduce((s, k) => s + inventedRoad[k], 0) / ks.length;
      for (const k of ks)
        delta[k] = meanMade + ((on[k] as number) - meanReal) * ALT_EXAGGERATION - inventedRoad[k];
      const first = ks[0];
      const last = ks[ks.length - 1];
      for (let k = 0; k < first; k++) delta[k] = delta[first];
      for (let k = last + 1; k < delta.length; k++) delta[k] = delta[last];
    }
  }
  const shift = smooth(delta, 4);
  const roadZ = inventedRoad.map((z, k) => z + shift[k]);
  // The hills' share of the shift: the trail's, weighted by nearness.
  const sigma2 = (span * 0.25) ** 2 * 2;
  const anchors = trail.filter((_, k) => k % 3 === 0).map((p, j) => [p[0], p[1], shift[j * 3]]);
  const lift = (x: number, y: number) => {
    if (!delta.some((v) => v !== 0)) return 0;
    let sum = 0;
    let weight = 0;
    for (const [ax, ay, dz] of anchors) {
      const w = Math.exp(-((x - ax) ** 2 + (y - ay) ** 2) / sigma2) + 1e-9;
      sum += w * dz;
      weight += w;
    }
    return sum / weight;
  };
  const base = (x: number, y: number) => invented(x, y) + lift(x, y);
  const curb = roadHalfM * 0.45;
  const roadTopAt = (x: number, y: number) => {
    const { i, t } = nearestOnLine(trail, x, y);
    const z0 = roadZ[i];
    const z1 = roadZ[Math.min(i + 1, roadZ.length - 1)];
    return z0 + t * (z1 - z0) + curb;
  };

  // The ground: brought up to the road's own top near it (by request,
  // 2026-11-23: the road level with the ground, not a raised wall), a hair
  // under it so the road is drawn over and never through.
  // The grid's cell, which the band level with the road must outreach:
  // narrower than a cell, few corners fall in it and the faces beside the
  // road drop straight to the hill (seen 2026-11-23).
  const step = (2 * half) / cells;
  const ground = (x: number, y: number) => {
    const z = base(x, y);
    const { d, i, t } = nearestOnLine(trail, x, y);
    const z0 = roadZ[i];
    const z1 = roadZ[Math.min(i + 1, roadZ.length - 1)];
    const road = z0 + t * (z1 - z0) + curb - 0.03;
    // Only where the two coincide (by request, 2026-11-23): under the road
    // and a cell past its edge; past that the hills keep their own shape.
    const w = 1 - smoothstep(roadHalfM + step, roadHalfM + step * 2, d);
    return z + (road - z) * w;
  };

  // The grid, its inner corners nudged so the faces are not all one shape:
  // the low-poly look.
  const grid: Vec3[][] = [];
  for (let j = 0; j <= cells; j++) {
    const row: Vec3[] = [];
    for (let i = 0; i <= cells; i++) {
      const edge = i === 0 || j === 0 || i === cells || j === cells;
      const x = cx - half + i * step + (edge ? 0 : (random() - 0.5) * step * 0.6);
      const y = cy - half + j * step + (edge ? 0 : (random() - 0.5) * step * 0.6);
      // A little made-up roughness per corner, so the faces catch the light
      // differently — the faceted look — but none near the road.
      const near = nearestOnLine(trail, x, y).d < roadHalfM * 4;
      const rough = near ? 0 : (random() - 0.5) * amp * 0.12;
      row.push([x, y, ground(x, y) + rough]);
    }
    grid.push(row);
  }
  const groundFaces: Face[] = [];
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const p00 = grid[j][i];
      const p10 = grid[j][i + 1];
      const p01 = grid[j + 1][i];
      const p11 = grid[j + 1][i + 1];
      // The diagonal alternates, as a hand-made mesh would.
      if ((i + j) % 2 === 0) {
        groundFaces.push({ a: p00, b: p10, c: p11, material: 0 });
        groundFaces.push({ a: p00, b: p11, c: p01, material: 0 });
      } else {
        groundFaces.push({ a: p00, b: p10, c: p01, material: 0 });
        groundFaces.push({ a: p10, b: p11, c: p01, material: 0 });
      }
    }

  // The road: a top and two sides along the trail.
  const road: Face[] = [];
  const left: Vec3[] = [];
  const right: Vec3[] = [];
  const leftLow: Vec3[] = [];
  const rightLow: Vec3[] = [];
  trail.forEach(([x, y], k) => {
    const [px, py] = trail[Math.max(0, k - 1)];
    const [nx, ny] = trail[Math.min(trail.length - 1, k + 1)];
    const len = Math.hypot(nx - px, ny - py) || 1;
    // The normal, to the left of the way of travel.
    const ox = (-(ny - py) / len) * roadHalfM;
    const oy = ((nx - px) / len) * roadHalfM;
    const top = roadZ[k] + curb;
    left.push([x + ox, y + oy, top]);
    right.push([x - ox, y - oy, top]);
    leftLow.push([x + ox, y + oy, ground(x + ox, y + oy) - 0.3]);
    rightLow.push([x - ox, y - oy, ground(x - ox, y - oy) - 0.3]);
  });
  for (let k = 0; k + 1 < trail.length; k++) {
    road.push({ a: left[k], b: right[k], c: right[k + 1], material: 1 });
    road.push({ a: left[k], b: right[k + 1], c: left[k + 1], material: 1 });
    road.push({ a: leftLow[k], b: left[k], c: left[k + 1], material: 2 });
    road.push({ a: leftLow[k], b: left[k + 1], c: leftLow[k + 1], material: 2 });
    road.push({ a: right[k], b: rightLow[k], c: rightLow[k + 1], material: 2 });
    road.push({ a: right[k], b: rightLow[k + 1], c: right[k + 1], material: 2 });
  }

  // The decorations: a few clumps of trees and some rocks, kept off the
  // road and inside the ground's edge. Small and the ground's own white.
  const props: Face[] = [];
  const clear = (x: number, y: number, min: number) =>
    nearestOnLine(trail, x, y).d > min &&
    Math.abs(x - cx) < half * 0.85 &&
    Math.abs(y - cy) < half * 0.85;
  const cone = (x: number, y: number, h: number, r: number) => {
    const z = ground(x, y);
    const top: Vec3 = [x, y, z + h];
    const sides = 6;
    for (let s = 0; s < sides; s++) {
      const a0 = (s / sides) * Math.PI * 2;
      const a1 = ((s + 1) / sides) * Math.PI * 2;
      props.push({
        a: [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z],
        b: [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z],
        c: top,
        material: 3,
      });
    }
  };
  const rock = (x: number, y: number, r: number) => {
    const z = ground(x, y);
    const top: Vec3 = [x, y, z + r * 0.9];
    const sides = 5;
    const rim: Vec3[] = Array.from({ length: sides }, (_, s) => {
      const a = (s / sides) * Math.PI * 2 + random() * 0.4;
      const rr = r * (0.8 + random() * 0.4);
      return [x + Math.cos(a) * rr, y + Math.sin(a) * rr, z + r * 0.35];
    });
    const foot: Vec3[] = rim.map(([rx, ry]) => [
      x + (rx - x) * 1.15,
      y + (ry - y) * 1.15,
      z - 0.1,
    ]);
    for (let s = 0; s < sides; s++) {
      const n = (s + 1) % sides;
      props.push({ a: rim[s], b: rim[n], c: top, material: 3 });
      props.push({ a: foot[s], b: foot[n], c: rim[n], material: 3 });
      props.push({ a: foot[s], b: rim[n], c: rim[s], material: 3 });
    }
  };
  const treeSize = span * 0.035;
  // A few more of each (by request, 2026-11-23): 11 clumps, 14 rocks.
  for (let c = 0; c < 11; c++) {
    const x = cx + (random() * 2 - 1) * half * 0.8;
    const y = cy + (random() * 2 - 1) * half * 0.8;
    const count = 2 + Math.floor(random() * 3);
    for (let n = 0; n < count; n++) {
      const tx = x + (random() - 0.5) * treeSize * 3;
      const ty = y + (random() - 0.5) * treeSize * 3;
      if (!clear(tx, ty, roadHalfM * 4)) continue;
      const h = treeSize * (1.6 + random() * 1.2);
      cone(tx, ty, h, h * 0.32);
    }
  }
  for (let n = 0; n < 14; n++) {
    const x = cx + (random() * 2 - 1) * half * 0.8;
    const y = cy + (random() * 2 - 1) * half * 0.8;
    if (!clear(x, y, roadHalfM * 3)) continue;
    rock(x, y, treeSize * (0.5 + random() * 0.7));
  }

  return {
    ground: groundFaces,
    props,
    road,
    roadHeightAt: roadTopAt,
    roadHalfM,
    centre: [cx, cy, base(cx, cy)],
    extentM: span,
    halfM: half,
  };
}

export interface Camera {
  /** Around the vertical, radians: 0 looks north from the south. */
  azimuth: number;
  /** Above the horizon, radians. */
  elevation: number;
  target: Vec3;
  distance: number;
  /** Vertical field of view, radians. */
  fov: number;
}

/** World to screen: [x, y] in px and the depth along the view, or null
 * behind the camera. */
export function projector(camera: Camera, width: number, height: number) {
  const { azimuth: a, elevation: e, target, distance } = camera;
  const pos: Vec3 = [
    target[0] - Math.sin(a) * Math.cos(e) * distance,
    target[1] - Math.cos(a) * Math.cos(e) * distance,
    target[2] + Math.sin(e) * distance,
  ];
  const f: Vec3 = [
    (target[0] - pos[0]) / distance,
    (target[1] - pos[1]) / distance,
    (target[2] - pos[2]) / distance,
  ];
  // Right = forward × up, normalised; up' = right × forward.
  const rl = Math.hypot(f[1], f[0]) || 1;
  const r: Vec3 = [f[1] / rl, -f[0] / rl, 0];
  const u: Vec3 = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];
  const focal = height / 2 / Math.tan(camera.fov / 2);
  return (p: Vec3): [number, number, number] | null => {
    const d: Vec3 = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
    const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (z <= 0.1) return null;
    const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
    const y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return [width / 2 + (x / z) * focal, height / 2 - (y / z) * focal, z];
  };
}

/** How lit a face is, 0–1: a soft light from the upper left. */
export function faceLight(face: Face): number {
  const [ax, ay, az] = face.a;
  const ux = face.b[0] - ax;
  const uy = face.b[1] - ay;
  const uz = face.b[2] - az;
  const vx = face.c[0] - ax;
  const vy = face.c[1] - ay;
  const vz = face.c[2] - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const lx = -0.45;
  const ly = 0.35;
  const lz = 0.82;
  const ll = Math.hypot(lx, ly, lz);
  return Math.max(0, (nx * lx + ny * ly + nz * lz) / ll);
}

/** The nearest the camera draws, m along its view. */
const NEAR_M = 0.1;

/**
 * A polygon onto the screen, cut at the camera's near plane rather than
 * dropped whole when a corner is behind it (2026-11-23): close up, the
 * ground's large faces always have one, and the ground went blank. The
 * corners in screen px with their depth; null when nothing is in front.
 */
export function polygonProjector(camera: Camera, width: number, height: number) {
  const { azimuth: a, elevation: e, target, distance } = camera;
  const pos: Vec3 = [
    target[0] - Math.sin(a) * Math.cos(e) * distance,
    target[1] - Math.cos(a) * Math.cos(e) * distance,
    target[2] + Math.sin(e) * distance,
  ];
  const f: Vec3 = [
    (target[0] - pos[0]) / distance,
    (target[1] - pos[1]) / distance,
    (target[2] - pos[2]) / distance,
  ];
  const rl = Math.hypot(f[1], f[0]) || 1;
  const r: Vec3 = [f[1] / rl, -f[0] / rl, 0];
  const u: Vec3 = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];
  const focal = height / 2 / Math.tan(camera.fov / 2);
  const toView = (p: Vec3): Vec3 => {
    const d: Vec3 = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
    return [
      d[0] * r[0] + d[1] * r[1] + d[2] * r[2],
      d[0] * u[0] + d[1] * u[1] + d[2] * u[2],
      d[0] * f[0] + d[1] * f[1] + d[2] * f[2],
    ];
  };
  return (corners: Vec3[]): [number, number, number][] | null => {
    const view = corners.map(toView);
    // Sutherland–Hodgman against z ≥ NEAR_M.
    const kept: Vec3[] = [];
    for (let i = 0; i < view.length; i++) {
      const p = view[i];
      const q = view[(i + 1) % view.length];
      const pIn = p[2] >= NEAR_M;
      const qIn = q[2] >= NEAR_M;
      if (pIn) kept.push(p);
      if (pIn !== qIn) {
        const t = (NEAR_M - p[2]) / (q[2] - p[2]);
        kept.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, NEAR_M]);
      }
    }
    if (kept.length < 3) return null;
    return kept.map(([x, y, z]) => [
      width / 2 + (x / z) * focal,
      height / 2 - (y / z) * focal,
      z,
    ]);
  };
}
