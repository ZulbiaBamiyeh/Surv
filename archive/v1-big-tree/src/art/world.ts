import { RAMPS } from "./palette";
import { Painter, Sprite, seeded } from "./painter";

// ---------- Props ----------

export interface PropArt {
  sprite: Sprite;
  /** Where the prop touches the ground, relative to the sprite's top-left. */
  ax: number;
  ay: number;
  shadow: number;
  /** Tall props fade out when the player walks behind them. */
  tall?: boolean;
}

function leafy(p: Painter, rnd: () => number, test: (x: number, y: number) => boolean) {
  // Breaks up smooth shading into leaf clusters.
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (!test(x + 0.5, y + 0.5)) continue;
      const r = rnd();
      if (r < 0.12) p.nudge(x, y, -1);
      else if (r > 0.94) p.nudge(x, y, 1);
    }
}

export function treeArt(seed: number): PropArt {
  const W = 44;
  const H = 58;
  const p = new Painter(W, H);
  const R = RAMPS;
  const rnd = seeded(seed);
  const cx = W / 2;
  // Trunk with flared roots
  p.column(30, 55, () => cx, (y) => 3.2 + Math.max(0, y - 49) * 0.7, R.wood, { tilt: -0.1 });
  p.ellipsoid(cx - 4.5, 55, 2.6, 1.4, R.wood, { bias: -0.05 });
  p.ellipsoid(cx + 4.5, 55, 2.6, 1.4, R.wood, { bias: -0.1 });
  for (let y = 34; y < 52; y += 3) p.nudge(cx - 1 + (y % 2), y, -1);
  // Canopy: back clumps first, then front clumps
  const clumps: [number, number, number, number, number][] = [
    [cx - 11, 26, 9, 8, -0.12],
    [cx + 11, 26, 9, 8, -0.15],
    [cx, 18, 15, 13, 0],
    [cx - 8, 12, 9, 8, 0.02],
    [cx + 7, 11, 9, 8, 0],
    [cx - 7, 27, 10, 7, 0.02],
    [cx + 7, 28, 10, 7, -0.02],
    [cx, 6, 8, 6, 0.05],
  ];
  for (const [x, y, rx, ry, bias] of clumps) p.ellipsoid(x, y, rx, ry, R.leaf, { sep: 0.18, bias, spec: 0.97 });
  leafy(p, rnd, (x, y) => y < 36 && p.ramp[Math.floor(y) * W + Math.floor(x)] === R.leaf);
  // A few apples
  for (const [ax, ay] of [[cx - 6, 20], [cx + 9, 16], [cx + 2, 27]] as [number, number][]) {
    p.dot(ax, ay, "#ff5a3a");
    p.dot(ax + 1, ay, "#d02a2a");
    p.dot(ax, ay + 1, "#d02a2a");
    p.dot(ax + 1, ay + 1, "#7a1424");
    p.dot(ax, ay - 1, "#ffb08a");
  }
  return { sprite: p.bake(), ax: W / 2 + 1, ay: H - 1, shadow: 30, tall: true };
}

export function bushArt(seed: number): PropArt {
  const W = 26;
  const H = 17;
  const p = new Painter(W, H);
  const rnd = seeded(seed);
  const R = RAMPS;
  p.ellipsoid(7, 10, 6.5, 6, R.leaf, { sep: 0.18, bias: -0.05 });
  p.ellipsoid(19, 10, 6.5, 6, R.leaf, { sep: 0.18, bias: -0.08 });
  p.ellipsoid(13, 8, 8, 7, R.leaf, { sep: 0.2, spec: 0.97 });
  leafy(p, rnd, (x, y) => p.ramp[Math.floor(y) * W + Math.floor(x)] === R.leaf);
  const berry = rnd() < 0.5 ? ["#ff8ad8", "#c23a9c"] : ["#5ad0ff", "#2490d0"];
  for (let i = 0; i < 4; i++) {
    const x = 5 + Math.floor(rnd() * 16);
    const y = 5 + Math.floor(rnd() * 8);
    p.dot(x, y, berry[0]);
    p.dot(x, y + 1, berry[1]);
  }
  return { sprite: p.bake(), ax: W / 2 + 1, ay: H, shadow: 22 };
}

export function rockArt(seed: number): PropArt {
  const rnd = seeded(seed);
  const W = 16;
  const H = 11;
  const p = new Painter(W, H);
  const R = RAMPS;
  p.ellipsoid(8, 7.5, 7.2, 5.5, R.stone, { clip: (_x, y) => y < 10.5, spec: 0.96 });
  if (rnd() < 0.7) p.ellipsoid(13, 9, 3, 2.2, R.stone, { sep: 0.2, bias: -0.05 });
  p.nudge(6, 6, -2);
  p.nudge(7, 7, -2);
  p.nudge(7, 8, -1);
  // Moss on top
  for (let x = 4; x < 11; x++) if (rnd() < 0.6) p.dot(x, 2 + Math.round(Math.abs(x - 7.5) * 0.45), RAMPS.leaf[3 + (x % 2)], RAMPS.leaf);
  return { sprite: p.bake(), ax: W / 2 + 1, ay: H, shadow: 14 };
}

export function mushroomArt(seed: number): PropArt {
  const rnd = seeded(seed);
  const W = 14;
  const H = 13;
  const p = new Painter(W, H);
  const R = RAMPS;
  const twin = rnd() < 0.6;
  if (twin) {
    p.column(8, 12, () => 11, () => 1.1, R.ivory);
    p.ellipsoid(11, 8, 2.8, 2.4, R.mushroom, { clip: (_x, y) => y < 8.6, spec: 0.95 });
  }
  p.column(6, 12.5, () => 6, () => 1.7, R.ivory, { sep: 0.15 });
  p.ellipsoid(6, 6, 5.2, 4.4, R.mushroom, { clip: (_x, y) => y < 7, spec: 0.95, sep: 0.25 });
  for (const [x, y] of [[4, 3], [7, 2], [8, 5], [3, 5]] as [number, number][]) p.dot(x, y, "#fff6ec");
  return { sprite: p.bake(), ax: 7, ay: H, shadow: 10 };
}

export function stumpArt(): PropArt {
  const W = 18;
  const H = 14;
  const p = new Painter(W, H);
  const R = RAMPS;
  p.column(4, 12.5, () => 9, (y) => 6 + Math.max(0, y - 10) * 0.8, R.wood, { tilt: 0 });
  p.ellipsoid(9, 4.5, 6, 2.4, R.wood, { bias: 0.25 });
  for (let x = 6; x <= 12; x++) p.nudge(x, 4, x === 9 ? -2 : -1);
  p.nudge(9, 5, -1);
  for (let y = 7; y < 12; y += 2) p.nudge(6 + (y % 3), y, -1);
  return { sprite: p.bake(), ax: 10, ay: H, shadow: 16 };
}

export function grassClumpArt(seed: number): PropArt {
  const rnd = seeded(seed);
  const W = 14;
  const H = 10;
  const p = new Painter(W, H);
  const R = RAMPS.grass;
  for (let i = 0; i < 7; i++) {
    const x = 2 + i * 1.6 + rnd() * 0.6;
    const lean = (rnd() - 0.5) * 3;
    p.rod(x, 9.5, x + lean, 1 + rnd() * 4, 0.55, R, { bias: 0.15 + rnd() * 0.15 });
  }
  return { sprite: p.bake(), ax: 8, ay: H, shadow: 0 };
}

// ---------- Ground ----------

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise that is continuous across the whole world. */
export function noise(x: number, y: number, scale: number, seed: number) {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const GRASS = RAMPS.grass.map(hexToRgb);
const STONE = RAMPS.stone.map(hexToRgb);
const FLOWERS: [string, string][] = [
  ["#ffffff", "#ffd640"],
  ["#ffe46a", "#f05a1a"],
  ["#ff8ac4", "#ffe46a"],
  ["#8fd0ff", "#ffffff"],
];

export const CHUNK = 256;

/** Paints one 256x256 piece of ground at world position (wx, wy). */
export function groundChunk(wx: number, wy: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CHUNK;
  c.height = CHUNK;
  const x = c.getContext("2d")!;
  const img = x.createImageData(CHUNK, CHUNK);
  const d = img.data;
  const set = (i: number, j: number, rgb: [number, number, number]) => {
    if (i < 0 || j < 0 || i >= CHUNK || j >= CHUNK) return;
    const k = (j * CHUNK + i) * 4;
    d[k] = rgb[0];
    d[k + 1] = rgb[1];
    d[k + 2] = rgb[2];
    d[k + 3] = 255;
  };
  for (let j = 0; j < CHUNK; j++)
    for (let i = 0; i < CHUNK; i++) {
      const gx = wx + i;
      const gy = wy + j;
      const th = BAYER[(j % 4) * 4 + (i % 4)];
      // Big soft tone patches with only a thin dithered seam between tones
      const v = noise(gx, gy, 110, 1) * 0.7 + noise(gx, gy, 34, 2) * 0.3;
      const level = (v - 0.5) * 5 + 0.5 + (th - 0.5) * 0.12;
      const k = Math.max(2, Math.min(5, 3 + Math.floor(level)));
      set(i, j, GRASS[k]);
    }
  // Details, placed with a random generator seeded by the chunk position
  const rnd = seeded(Math.floor(wx / CHUNK) * 7919 + Math.floor(wy / CHUNK) * 104729 + 17);
  const isGrass = (i: number, j: number) => {
    const k = (j * CHUNK + i) * 4;
    return d[k + 1] > d[k] + 20;
  };
  // Grass blades
  for (let n = 0; n < 260; n++) {
    const i = (rnd() * CHUNK) | 0;
    const j = (rnd() * CHUNK) | 0;
    if (!isGrass(i, j)) continue;
    set(i, j, GRASS[rnd() < 0.5 ? 1 : 2]);
    set(i, j - 1, GRASS[rnd() < 0.5 ? 5 : 6]);
  }
  // Tufts
  for (let n = 0; n < 45; n++) {
    const i = (rnd() * CHUNK) | 0;
    const j = (rnd() * CHUNK) | 0;
    if (!isGrass(i, j)) continue;
    for (const [di, dj, k] of [[0, 0, 1], [1, -1, 6], [2, 0, 1], [-1, -1, 5], [3, -1, 5], [1, 0, 2], [0, -1, 2], [2, -1, 3]])
      set(i + di, j + dj, GRASS[k]);
  }
  // Flowers, in loose patches
  for (let n = 0; n < 140; n++) {
    const i = (rnd() * CHUNK) | 0;
    const j = (rnd() * CHUNK) | 0;
    if (!isGrass(i, j) || noise(wx + i, wy + j, 40, 9) < 0.55) continue;
    const [petal, center] = FLOWERS[(noise(wx + i, wy + j, 60, 10) * FLOWERS.length) | 0];
    const pr = hexToRgb(petal);
    set(i - 1, j, pr);
    set(i + 1, j, pr);
    set(i, j - 1, pr);
    set(i, j + 1, GRASS[1]);
    set(i, j, hexToRgb(center));
  }
  // Pebbles
  for (let n = 0; n < 60; n++) {
    const i = (rnd() * CHUNK) | 0;
    const j = (rnd() * CHUNK) | 0;
    if (rnd() < 0.6) continue;
    set(i, j, STONE[3]);
    set(i + 1, j, STONE[2]);
    set(i, j + 1, STONE[1]);
    set(i + 1, j + 1, STONE[1]);
    set(i - 1, j, STONE[4]);
  }
  x.putImageData(img, 0, 0);
  return c;
}

export interface PlacedProp {
  x: number;
  y: number;
  art: PropArt;
}

/** Decorative props for a chunk, the same every time for the same chunk. */
export function chunkProps(cx: number, cy: number, kit: PropKit): PlacedProp[] {
  const rnd = seeded(cx * 92821 + cy * 68917 + 5);
  const out: PlacedProp[] = [];
  const wx = cx * CHUNK;
  const wy = cy * CHUNK;
  const tries = 10;
  for (let n = 0; n < tries; n++) {
    const x = wx + 12 + rnd() * (CHUNK - 24);
    const y = wy + 12 + rnd() * (CHUNK - 24);
    if (Math.hypot(x, y) < 90) continue; // keep the start area clear
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < 40)) continue;
    const r = rnd();
    const pick = (list: PropArt[]) => list[(rnd() * list.length) | 0];
    const art =
      r < 0.16 ? pick(kit.trees) :
      r < 0.34 ? pick(kit.bushes) :
      r < 0.5 ? pick(kit.rocks) :
      r < 0.64 ? pick(kit.mushrooms) :
      r < 0.72 ? kit.stump : null;
    if (art) out.push({ x, y, art });
  }
  return out;
}

export interface PropKit {
  trees: PropArt[];
  bushes: PropArt[];
  rocks: PropArt[];
  mushrooms: PropArt[];
  stump: PropArt;
  grass: PropArt[];
}

export function makePropKit(): PropKit {
  return {
    trees: [treeArt(1), treeArt(2), treeArt(3)],
    bushes: [bushArt(1), bushArt(2), bushArt(3)],
    rocks: [rockArt(1), rockArt(2), rockArt(5)],
    mushrooms: [mushroomArt(1), mushroomArt(4)],
    stump: stumpArt(),
    grass: [grassClumpArt(1), grassClumpArt(2), grassClumpArt(3)],
  };
}
