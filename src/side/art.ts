import { Painter, Sprite, lightOf } from "../art/painter";
import type { Ramp } from "../art/palette";

// Art for the root-world sidescroller: chalk-white roots on a starry void,
// a pink spotted cat witch, and shadowy creatures. Everything is drawn in crisp pixels.

export const COL = {
  void0: "#06050b",
  void1: "#120c1f",
  nebula: "#1d1233",
  soil: ["#0e0a14", "#17111f", "#221a2c"],
  chalk: ["#2a2236", "#5f5470", "#a399b2", "#d9d2df", "#f6f2f5"],
  far: ["#120e1a", "#211a2c", "#2e263a", "#3b3249", "#463c55"],
  mid: ["#140f1c", "#2c2438", "#463d56", "#605570", "#776b88"],
  star: ["#ffffff", "#ffd9f0", "#cfe6ff", "#fff0c8"],
  pink: "#ff7ad0",
};

const CAT: Ramp = ["#3a0f2e", "#7a2060", "#c8489a", "#f07ac0", "#ffbfe4"];
const SPOT = "#8e2c72";
const SPOT_DARK = "#6a1f58";
const SHADOW: Ramp = ["#07050c", "#15101f", "#251b35", "#3a2a52", "#5a4280"];
const WING: Ramp = ["#3a3448", "#7a7090", "#b8b0c8", "#e0dae8", "#fbf8ff"];
const GOLD: Ramp = ["#3a1f12", "#874516", "#cf8a24", "#ffc83d", "#fff2a0"];

// ---------- Crisp pixel discs ----------
const stamps = new Map<string, HTMLCanvasElement>();

/** A crisp pixel disc. Each size and color is drawn once, then stamped. */
export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  if (r < 0.75) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
    return;
  }
  const q = Math.round(r * 4) / 4;
  const key = color + q;
  let st = stamps.get(key);
  const ri = Math.ceil(q);
  if (!st) {
    st = document.createElement("canvas");
    st.width = st.height = ri * 2 + 1;
    const x = st.getContext("2d")!;
    x.fillStyle = color;
    for (let dy = -ri; dy <= ri; dy++) {
      const w = Math.sqrt(Math.max(0, q * q - dy * dy));
      if (w < 0.4) continue;
      const x0 = Math.round(ri - w);
      const x1 = Math.round(ri + w);
      x.fillRect(x0, dy + ri, Math.max(1, x1 - x0), 1);
    }
    stamps.set(key, st);
  }
  ctx.drawImage(st, Math.round(cx) - ri, Math.round(cy) - ri);
}

// ---------- Roots ----------
export interface RootPt { x: number; y: number; r: number; }

export interface GrowOpts {
  /** Direction the root drifts toward, in radians (PI/2 = down). */
  pull: number;
  pullStrength: number;
  wobble: number;
  taper: number;
  branch: number;
  maxDepth: number;
  minR: number;
  bottom: number;
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000003) / 1000003;
  };
}

/** Grows a branching root as a list of points with radii. */
export function growRoot(out: RootPt[], x: number, y: number, angle: number, r: number, len: number, o: GrowOpts, rnd: () => number, depth = 0) {
  let a = angle;
  for (let i = 0; i < len; i++) {
    a += (rnd() - 0.5) * o.wobble + Math.sin(i * 0.07 + depth) * 0.01;
    let diff = o.pull - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    a += diff * o.pullStrength;
    const stepLen = r > 2 ? 1.3 : 0.9;
    x += Math.cos(a) * stepLen;
    y += Math.sin(a) * stepLen;
    r *= o.taper;
    if (r < o.minR || y > o.bottom) return;
    out.push({ x, y, r });
    if (depth < o.maxDepth && r > 1 && rnd() < o.branch) {
      const side = rnd() < 0.5 ? -1 : 1;
      growRoot(out, x, y, a + side * (0.45 + rnd() * 0.6), r * (0.5 + rnd() * 0.2), len * (0.35 + rnd() * 0.35), o, rnd, depth + 1);
    }
  }
}

/**
 * Paints roots as shaded tubes in four passes (outline, mid, light, highlight), so
 * overlapping branches merge cleanly. `ramp` is dark to light.
 */
export function paintRoots(ctx: CanvasRenderingContext2D, pts: RootPt[], ramp: string[], highlight = true) {
  for (const p of pts) disc(ctx, p.x + 0.6, p.y + 0.7, p.r + 1.1, ramp[0]);
  for (const p of pts) disc(ctx, p.x, p.y, p.r, ramp[2]);
  for (const p of pts) if (p.r > 1.2) disc(ctx, p.x - p.r * 0.25, p.y - p.r * 0.15, p.r * 0.72, ramp[3]);
  if (highlight) for (const p of pts) if (p.r > 2.2) disc(ctx, p.x - p.r * 0.42, p.y - p.r * 0.3, p.r * 0.3, ramp[4]);
}

/** Adds a dry, chalky grain to everything already painted on a canvas. */
export function chalkGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, amount = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rnd = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = rnd();
    let k = 1;
    if (r < 0.1 * amount) k = 0.86;
    else if (r < 0.14 * amount) k = 1.08;
    if (k !== 1) {
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  x.imageSmoothingEnabled = false;
  return { c, x };
}

// ---------- The cat witch ----------

export type CatPose = "idle" | "run" | "jump" | "fall" | "dash";

/** A pink spotted cat with a long curling tail and a glowing star charm. Facing right. */
export function catFrame(pose: CatPose, phase: number): Sprite {
  const W = 58;
  const H = 38;
  const p = new Painter(W, H);
  const t = phase * Math.PI * 2;
  const run = pose === "run";
  const dash = pose === "dash";
  const air = pose === "jump" || pose === "fall";
  const ground = H - 2.5;

  // Body pose: a gallop squashes and stretches the spine
  const stretch = run ? Math.sin(t) * 2.2 : dash ? 5 : air ? 2 : 0;
  const rise = run ? Math.abs(Math.cos(t)) * 1.6 : pose === "idle" ? (phase > 0.5 ? 0.6 : 0) : 0;
  const tilt = pose === "jump" ? -3 : pose === "fall" ? 2.5 : 0;
  const bodyY = ground - 13 - rise - (air ? 2 : 0) + (dash ? 2 : 0);
  const hipX = 18 - stretch * 0.5;
  const shX = 36 + stretch * 0.5;
  const hipY = bodyY + 1 - tilt;
  const shY = bodyY + 1 + tilt;

  // Legs: hip -> knee -> paw, back legs then front legs
  const legs = (hx: number, hy: number, front: boolean, ph: number, far: boolean) => {
    let kx: number;
    let ky: number;
    let fx: number;
    let fy: number;
    const len = front ? 12 : 13;
    if (run) {
      const s = Math.sin(t + ph);
      const lift = Math.max(0, Math.cos(t + ph));
      fx = hx + s * 7;
      fy = ground - lift * 4;
      kx = hx + s * 3 + (front ? 1.5 : -2.5);
      ky = hy + len * 0.5 - lift * 1.5;
    } else if (dash) {
      fx = hx + (front ? 10 : -11);
      fy = hy + 4;
      kx = hx + (front ? 5 : -6);
      ky = hy + 3;
    } else if (air) {
      const up = pose === "jump";
      fx = hx + (front ? (up ? 6 : 3) : up ? -6 : -2);
      fy = hy + (up ? 7 : 11);
      kx = hx + (front ? 3 : -3);
      ky = hy + (up ? 5 : 6);
    } else {
      fx = hx + (front ? 1 : -1) + (far ? 2 : 0);
      fy = ground;
      kx = hx + (front ? 0.5 : -2) + (far ? 1 : 0);
      ky = hy + len * 0.5;
    }
    const o = far ? { bias: -0.18 } : {};
    p.rod(hx, hy, kx, ky, front ? 2.1 : 2.8, CAT, o);
    p.rod(kx, ky, fx, fy - 1, 1.6, CAT, o);
    p.ellipsoid(fx + (front ? 0.8 : 0.4), fy - 0.6, 2.1, 1.3, CAT, { ...o, bias: (o.bias ?? 0) + 0.1 });
  };
  legs(hipX + 1, hipY, false, Math.PI * 0.85, true);
  legs(shX - 1, shY, true, Math.PI * 0.35, true);

  // Tail: a long curl that streams back when running or dashing
  const sway = Math.sin(t) * (run ? 0.8 : 0.5);
  const segs = 9;
  let tx = hipX - 4;
  let ty = hipY - 2;
  let ta = dash ? Math.PI : run ? Math.PI + 0.25 + sway * 0.25 : Math.PI * 0.62 + sway * 0.2;
  for (let i = 0; i < segs; i++) {
    const nx = tx + Math.cos(ta) * 2.4;
    const ny = ty + Math.sin(ta) * 2.4;
    p.rod(tx, ty, nx, ny, 2.4 - i * 0.1, CAT, { bias: -0.05 });
    if (i % 3 === 1) p.dot(Math.round(nx), Math.round(ny - 1), SPOT, CAT);
    tx = nx;
    ty = ny;
    ta += dash ? 0.02 : run ? -0.06 + sway * 0.04 : 0.24 + sway * 0.05;
  }

  // Body and chest
  p.ellipsoid((hipX + shX) / 2, bodyY, (shX - hipX) / 2 + 5, 6.4, CAT, { spec: 0.96 });
  p.ellipsoid(hipX + 1, hipY - 0.5, 6.2, 6.4, CAT, { bias: -0.03 });
  p.ellipsoid(shX + 1, shY - 0.3, 5.6, 6.6, CAT, { sep: 0.1 });

  // Rosette spots along the back and flank
  const spots: [number, number][] = [[-12, -3], [-8, -4], [-4, -3.5], [0, -4], [4, -3], [-10, 1], [-5, 0], [1, 0.5], [6, -0.5], [-2, 3], [-8, 3.5]];
  const mx = (hipX + shX) / 2;
  for (const [dx, dy] of spots) {
    const x = Math.round(mx + dx * ((shX - hipX + 10) / 28));
    const y = Math.round(bodyY + dy);
    p.dot(x, y, SPOT, CAT);
    p.dot(x + 1, y, SPOT_DARK, CAT);
    if (dy < 0) p.dot(x, y + 1, SPOT, CAT);
  }

  // Near legs over the body
  legs(hipX, hipY + 1, false, 0, false);
  legs(shX, shY + 1, true, Math.PI * 1.2, false);

  // Head, with a collar and a glowing star charm
  const hx = shX + 7 + (dash ? 2 : 0);
  const hy = shY - 7 + (dash ? 3 : 0) + (pose === "jump" ? -1 : 0);
  p.ellipsoid(hx - 3, hy + 4, 3.6, 3.4, CAT, { sep: 0.1 }); // neck
  p.ellipsoid(hx, hy, 7, 6.2, CAT, { sep: 0.22, spec: 0.97 });
  p.ellipsoid(hx + 4.6, hy + 1.6, 2.8, 2.2, CAT, { bias: 0.15, sep: 0.15 }); // muzzle
  // Ears
  const earBack = dash ? 2 : 0;
  p.poly([[hx - 4.5 - earBack, hy - 2], [hx - 3.5 - earBack, hy - 9.5], [hx - 0.5, hy - 4]], CAT, 0.72);
  p.poly([[hx + 0.5, hy - 4.2], [hx + 2.5 - earBack, hy - 10], [hx + 4.5, hy - 3]], CAT, 0.5);
  p.dot(Math.round(hx - 3.2 - earBack), Math.round(hy - 6), CAT[1], CAT);
  p.dot(Math.round(hx + 2.4 - earBack), Math.round(hy - 6.5), CAT[1], CAT);
  // A sleepy, knowing eye
  const ex = Math.round(hx + 2);
  const ey = Math.round(hy - 0.5);
  const blink = pose === "idle" && phase > 0.92;
  if (blink) {
    p.dot(ex - 1, ey + 1, CAT[0], CAT);
    p.dot(ex, ey + 1, CAT[0], CAT);
    p.dot(ex + 1, ey + 1, CAT[0], CAT);
  } else {
    p.dot(ex - 1, ey, CAT[0], CAT);
    p.dot(ex, ey, CAT[0], CAT);
    p.dot(ex + 1, ey, CAT[0], CAT);
    p.dot(ex - 1, ey + 1, "#ffe27a", CAT);
    p.dot(ex, ey + 1, "#1a0a18", CAT);
    p.dot(ex + 1, ey + 1, "#ffe27a", CAT);
  }
  p.dot(Math.round(hx + 7), Math.round(hy + 1), CAT[0], CAT); // nose
  p.dot(Math.round(hx + 5), Math.round(hy + 3), CAT[1], CAT); // mouth
  // Collar and charm
  p.rod(hx - 5, hy + 3.5, hx - 1.5, hy + 5.5, 0.9, GOLD, { bias: 0.1 });
  p.dot(Math.round(hx - 2), Math.round(hy + 7), "#fff2a0", GOLD);
  p.dot(Math.round(hx - 3), Math.round(hy + 7), "#ffc83d", GOLD);
  p.dot(Math.round(hx - 1), Math.round(hy + 7), "#ffc83d", GOLD);
  p.dot(Math.round(hx - 2), Math.round(hy + 6), "#ffc83d", GOLD);
  p.dot(Math.round(hx - 2), Math.round(hy + 8), "#cf8a24", GOLD);
  return p.bake();
}

/** Where the star charm sits in a cat frame (for spell origins), relative to the sprite's top-left. */
export const CAT_CHARM = { x: 40, y: 22 };

// ---------- Creatures of the dark ----------

export function wispFrame(phase: number): Sprite {
  const p = new Painter(26, 24);
  const t = phase * Math.PI * 2;
  // Trailing tendrils
  for (let k = 0; k < 3; k++) {
    let x = 13 + (k - 1) * 3.5;
    let y = 15;
    for (let i = 0; i < 4; i++) {
      const nx = x + Math.sin(t + k + i * 0.9) * 1.2;
      const ny = y + 2;
      p.rod(x, y, nx, ny, 2 - i * 0.4, SHADOW, { bias: -0.1 });
      x = nx;
      y = ny;
    }
  }
  p.ellipsoid(13, 11 + Math.sin(t) * 0.6, 8.5, 7.5, SHADOW, { spec: 0.9 });
  // Rim light along the top
  for (let x = 7; x <= 19; x++) p.dot(x, Math.round(4.5 + Math.abs(x - 13) * 0.35 + Math.sin(t) * 0.6), SHADOW[4], SHADOW);
  const ey = Math.round(10 + Math.sin(t) * 0.6);
  for (const ex of [9, 15]) {
    p.dot(ex, ey, "#fff6d0");
    p.dot(ex + 1, ey, "#ffe27a");
    p.dot(ex, ey + 1, "#ffb84a");
    p.dot(ex + 1, ey + 1, "#ffe27a");
  }
  return p.bake();
}

export function mothFrame(phase: number): Sprite {
  const p = new Painter(32, 22);
  const a = Math.sin(phase * Math.PI * 2);
  const cx = 16;
  const cy = 11;
  for (const side of [-1, 1]) {
    const up = a * 5;
    const tip: [number, number] = [cx + side * 14, cy - 4 - up];
    p.poly([[cx + side * 1, cy - 2], [cx + side * 6, cy - 7 - up * 0.6], tip, [cx + side * 12, cy + 1 - up * 0.3], [cx + side * 2, cy + 2]], WING, side < 0 ? 0.82 : 0.6);
    p.poly([[cx + side * 1.5, cy + 1], [cx + side * 8, cy + 3 - up * 0.2], [cx + side * 7, cy + 8 - up * 0.1], [cx + side * 2, cy + 5]], WING, side < 0 ? 0.62 : 0.45);
    // Eye spots on the wings
    const ex = Math.round(cx + side * 8);
    const ey = Math.round(cy - 2 - up * 0.45);
    p.dot(ex, ey, "#2a2236", WING);
    p.dot(ex + side, ey, "#ff7ad0", WING);
  }
  p.ellipsoid(cx, cy + 1, 2, 5, SHADOW, { sep: 0.3, spec: 0.9 });
  p.dot(cx - 1, cy - 3, "#ffe27a");
  p.dot(cx + 1, cy - 3, "#ffe27a");
  p.rod(cx - 1, cy - 4, cx - 4, cy - 8, 0.5, SHADOW);
  p.rod(cx + 1, cy - 4, cx + 4, cy - 8, 0.5, SHADOW);
  return p.bake();
}

export function crawlerFrame(phase: number): Sprite {
  const p = new Painter(28, 16);
  const t = phase * Math.PI * 2;
  for (let i = 0; i < 3; i++) {
    const lx = 8 + i * 6;
    const s = Math.sin(t + i * 2) * 2;
    p.rod(lx, 9, lx - 3 + s, 15, 0.7, WING, { bias: -0.15 });
  }
  p.ellipsoid(14, 8, 10, 5.5, SHADOW, { spec: 0.92, clip: (_x, y) => y < 12 });
  for (let x = 6; x <= 22; x += 3) p.dot(x, Math.round(4 + Math.abs(x - 14) * 0.18), SHADOW[4], SHADOW);
  p.ellipsoid(23, 9, 3.6, 3.2, SHADOW, { sep: 0.2 });
  p.dot(24, 8, "#9ae8ff");
  p.dot(25, 8, "#e0faff");
  for (let i = 0; i < 3; i++) {
    const lx = 10 + i * 6;
    const s = Math.sin(t + i * 2 + Math.PI) * 2;
    p.rod(lx, 10, lx + 2 + s, 15, 0.75, WING);
  }
  return p.bake();
}

// ---------- Magic ----------

export function starBolt(frame: number): HTMLCanvasElement {
  const { c, x } = makeCanvas(11, 11);
  const rows = frame % 2 === 0
    ? [".....w.....", ".....p.....", ".....p.....", "....pwp....", "...pwWwp...", "wppwWWWwppw", "...pwWwp...", "....pwp....", ".....p.....", ".....p.....", ".....w....."]
    : [".w.......w.", "..p.....p..", "...p...p...", "....pwp....", "....wWw....", "...pWWWp...", "....wWw....", "....pwp....", "...p...p...", "..p.....p..", ".w.......w."];
  const col: Record<string, string> = { p: "#ff7ad0", w: "#ffd9f0", W: "#ffffff" };
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === ".") return;
    x.fillStyle = col[ch];
    x.fillRect(i, j, 1, 1);
  }));
  return c;
}

/** A pixel glow made of dithered rings of falling alpha. */
export function glow(radius: number, color: string): HTMLCanvasElement {
  const S = radius * 2 + 1;
  const { c, x } = makeCanvas(S, S);
  x.fillStyle = color;
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const d = Math.hypot(i - radius, j - radius) / radius;
      if (d > 1) continue;
      const a = d < 0.3 ? 0.55 : d < 0.6 ? ((i + j) % 2 ? 0.4 : 0.25) : (i + j) % 2 ? 0.16 : 0.05;
      x.globalAlpha = a;
      x.fillRect(i, j, 1, 1);
    }
  return c;
}

export { lightOf };
