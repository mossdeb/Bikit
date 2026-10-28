/**
 * A topographic map's contour lines as a decoration (by request,
 * 2026-10-28, from a reference pattern): the simulation's plate drawn as
 * a hillside and not as stripes. Not real ground — a smooth made-up
 * height field, the same on every visit (a fixed seed), cut into levels
 * by marching squares. Every fourth level is an index line, drawn
 * heavier, as maps draw them.
 */

/** The field's features, px: hills about this far apart. */
const FEATURE_PX = 170;
/** The grid the levels are cut on, px — fine enough that a line's facets
 * do not show at 1 px. */
const CELL_PX = 4;
const LEVELS = 16;
const INDEX_EVERY = 4;
const SEED = 20261028;

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise: a lattice of random heights, eased between. */
function noise(size: number, seed: number) {
  const next = random(seed);
  const lattice = Array.from({ length: size * size }, next);
  const at = (i: number, j: number) =>
    lattice[(((j % size) + size) % size) * size + (((i % size) + size) % size)];
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = ease(x - i);
    const v = ease(y - j);
    const top = at(i, j) + u * (at(i + 1, j) - at(i, j));
    const bottom = at(i, j + 1) + u * (at(i + 1, j + 1) - at(i, j + 1));
    return top + v * (bottom - top);
  };
}

/** The contour lines over a box of `width` × `height` px, as two path
 * strings: the ordinary levels and the index ones. */
export function topoContours(
  width: number,
  height: number,
): { lines: string; index: string } {
  const broad = noise(64, SEED);
  const fine = noise(64, SEED + 1);
  const height_ = (x: number, y: number) => {
    // A long slope across the box, so the lines run mostly one way like
    // a hillside's, with hills and hollows on it.
    const fx = x / FEATURE_PX;
    const fy = y / FEATURE_PX;
    return (
      0.55 * broad(fx, fy) +
      0.25 * fine(fx * 2.1 + 7.3, fy * 2.1 + 3.1) +
      0.35 * ((x * 0.6 + y) / (FEATURE_PX * 4))
    );
  };
  const cols = Math.ceil(width / CELL_PX) + 2;
  const rows = Math.ceil(height / CELL_PX) + 2;
  const grid: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const h = height_((c - 1) * CELL_PX, (r - 1) * CELL_PX);
      grid.push(h);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  const lines: string[] = [];
  const index: string[] = [];
  const f = (n: number) => n.toFixed(1);
  for (let l = 1; l < LEVELS; l++) {
    const level = lo + ((hi - lo) * l) / LEVELS;
    const out = l % INDEX_EVERY === 0 ? index : lines;
    for (let r = 0; r + 1 < rows; r++)
      for (let c = 0; c + 1 < cols; c++) {
        const a = grid[r * cols + c];
        const b = grid[r * cols + c + 1];
        const d = grid[(r + 1) * cols + c];
        const e = grid[(r + 1) * cols + c + 1];
        const x0 = (c - 1) * CELL_PX;
        const y0 = (r - 1) * CELL_PX;
        // Where the level crosses each edge of the cell, if it does.
        const cuts: [number, number][] = [];
        const edge = (
          p: number,
          q: number,
          px: number,
          py: number,
          qx: number,
          qy: number,
        ) => {
          if (p < level === q < level) return;
          const t = (level - p) / (q - p);
          cuts.push([px + t * (qx - px), py + t * (qy - py)]);
        };
        edge(a, b, x0, y0, x0 + CELL_PX, y0);
        edge(b, e, x0 + CELL_PX, y0, x0 + CELL_PX, y0 + CELL_PX);
        edge(e, d, x0 + CELL_PX, y0 + CELL_PX, x0, y0 + CELL_PX);
        edge(d, a, x0, y0 + CELL_PX, x0, y0);
        for (let k = 0; k + 1 < cuts.length; k += 2)
          out.push(
            `M${f(cuts[k][0])},${f(cuts[k][1])}L${f(cuts[k + 1][0])},${f(cuts[k + 1][1])}`,
          );
      }
  }
  return { lines: lines.join(""), index: index.join("") };
}
