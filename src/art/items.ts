import { DIE_RAMPS, OUTLINE, RAMPS, Ramp } from "./palette";
import { Painter, Sprite, lightOf, seeded } from "./painter";

const TAU = Math.PI * 2;

// ---------- XP gems ----------

export function gemSprite(ramp: Ramp, scale = 1): Sprite {
  const W = Math.round(8 * scale);
  const H = Math.round(11 * scale);
  const p = new Painter(W, H);
  const cx = W / 2;
  const mid = H * 0.33;
  const lo = H * 0.66;
  const top: [number, number] = [cx, 0.3];
  const bot: [number, number] = [cx, H - 0.3];
  p.poly([top, [0.3, mid], [cx, mid]], ramp, 0.95);
  p.poly([top, [cx, mid], [W - 0.3, mid]], ramp, 0.72);
  p.poly([[0.3, mid], [cx, mid], bot, [0.3, lo]], ramp, 0.56);
  p.poly([[cx, mid], [W - 0.3, mid], [W - 0.3, lo], bot], ramp, 0.3);
  p.dot(Math.floor(cx) - 2, Math.floor(mid) - 1, "#ffffff");
  p.dot(Math.floor(cx) - 1, Math.floor(mid) - 2, ramp[4]);
  return p.bake();
}

// ---------- Fireball ----------

/** A teardrop of fire pointing along `angle`, with a flickering tail. */
export function fireballFrame(angle: number, frame: number): Sprite {
  const S = 18;
  const p = new Painter(S, S);
  const c = S / 2;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const rnd = seeded(frame * 977 + 13);
  const wob = [rnd(), rnd(), rnd(), rnd()].map((v) => v * TAU);
  const local = (x: number, y: number) => {
    const dx = x - c;
    const dy = y - c;
    return { u: dx * ca + dy * sa, w: -dx * sa + dy * ca };
  };
  const head = 2.6;
  const r = 3.6;
  const tail = 7.5;
  const inside = (x: number, y: number) => {
    const { u, w } = local(x, y);
    if ((u - head) ** 2 + w * w <= r * r) return true;
    if (u < head && u > -tail) {
      const k = (u + tail) / (head + tail);
      const flick = Math.sin(u * 1.4 + wob[0]) * 0.7 + Math.sin(u * 2.3 + wob[1]) * 0.4;
      return Math.abs(w + flick * (1 - k)) <= r * k ** 0.9;
    }
    return false;
  };
  p.glow(inside, RAMPS.fire, (x, y) => {
    const { u, w } = local(x, y);
    const d = Math.hypot((u - head - 0.6) * 0.75, w * 1.15);
    return 1 - d / 6.2 + Math.sin(u * 3 + wob[2]) * 0.04;
  });
  return p.bake(false);
}

/** A soft round glow, used behind fireballs and pickups. */
export function glowSprite(radius: number, color: string): HTMLCanvasElement {
  const S = radius * 2 + 1;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const x = c.getContext("2d")!;
  x.fillStyle = color;
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const d = Math.hypot(i - radius, j - radius) / radius;
      if (d > 1) continue;
      // Three rings of falling alpha, dithered between them for a pixel-art feel
      const a = d < 0.45 ? 0.5 : d < 0.75 ? ((i + j) % 2 ? 0.35 : 0.22) : (i + j) % 2 ? 0.16 : 0;
      if (!a) continue;
      x.globalAlpha = a;
      x.fillRect(i, j, 1, 1);
    }
  return c;
}

// ---------- Dice ----------

function shadeFor(cx: number, cy: number, fx: number, fy: number, base = 0.55, amount = 0.42) {
  const dx = fx - cx;
  const dy = fy - cy;
  const m = Math.hypot(dx, dy) || 1;
  return base + amount * ((-0.5 * dx - 0.85 * dy) / m);
}

function centroid(pts: [number, number][]): [number, number] {
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}

function ring(cx: number, cy: number, r: number, n: number, start: number): [number, number][] {
  return Array.from({ length: n }, (_, k) => {
    const a = start + (k * TAU) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
  });
}

export function dieSprite(faces: number): Sprite {
  const ramp = DIE_RAMPS[faces] ?? RAMPS.ivory;
  const S = 16;
  const p = new Painter(S, S);
  const c = 8;
  const face = (pts: [number, number][], light?: number) => {
    const [fx, fy] = centroid(pts);
    p.poly(pts, ramp, light ?? shadeFor(c, c, fx, fy));
  };
  // Bright lines along facet edges make the shape read at small sizes.
  const edge = (a: [number, number], b: [number, number], col = ramp[4]) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let k = 0; k <= n; k++) p.dot(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, col, ramp);
  };
  const pip = (x: number, y: number, col = faces === 6 ? "#d02a2a" : ramp[0]) => p.dot(x, y, col);

  if (faces === 6) {
    face([[8, 0.6], [15.4, 4.4], [8, 8.2], [0.6, 4.4]], 0.98);
    face([[0.6, 4.4], [8, 8.2], [8, 15.4], [0.6, 11.6]], 0.62);
    face([[8, 8.2], [15.4, 4.4], [15.4, 11.6], [8, 15.4]], 0.36);
    edge([0.8, 4.4], [8, 8.2]);
    edge([8, 8.2], [15.2, 4.4], ramp[3]);
    edge([8, 8.4], [8, 15.2], ramp[3]);
    pip(7, 4);
    pip(8, 4);
    pip(3, 7);
    pip(5, 12);
    pip(10, 13);
    pip(12, 10);
    pip(14, 7);
  } else if (faces === 3 || faces === 4) {
    face([[8, 0.5], [8, 11], [0.5, 15]], 0.9);
    face([[8, 0.5], [15.5, 15], [8, 11]], 0.4);
    face([[0.5, 15], [8, 11], [15.5, 15]], 0.62);
    pip(5, 10);
    if (faces === 4) pip(11, 10);
    pip(8, 13);
  } else if (faces === 8 || faces === 10) {
    const mid = faces === 8 ? 7.5 : 6.5;
    const ctr: [number, number] = [7.4, faces === 8 ? 7.2 : 9.4];
    const T: [number, number] = [8, 0.4];
    const Lp: [number, number] = [0.5, mid];
    const Rp: [number, number] = [15.5, mid];
    const B: [number, number] = [8, 15.6];
    face([T, Lp, ctr], 0.96);
    face([T, ctr, Rp], 0.68);
    edge(T, ctr);
    edge(Lp, ctr, ramp[3]);
    if (faces === 8) {
      face([Lp, ctr, B], 0.52);
      face([ctr, Rp, B], 0.3);
    } else {
      face([Lp, [0.5, mid + 2.5], B, ctr], 0.52);
      face([ctr, B, [15.5, mid + 2.5], Rp], 0.3);
    }
    pip(6, 5);
    pip(9, 5);
  } else if (faces === 12) {
    const outer = ring(c, c, 7.6, 10, -Math.PI / 2);
    const inner = ring(c, c + 0.4, 4, 5, -Math.PI / 2);
    for (let k = 0; k < 5; k++) {
      const pts: [number, number][] = [inner[k], outer[k * 2], outer[(k * 2 + 1) % 10], outer[(k * 2 + 2) % 10], inner[(k + 1) % 5]];
      face(pts);
    }
    face(inner, 0.95);
    for (let k = 0; k < 5; k++) edge(inner[k], inner[(k + 1) % 5], k < 2 || k === 4 ? ramp[4] : ramp[3]);
  } else {
    // d20: a hexagon outline with a triangle face in the middle
    const V = ring(c, c, 7.7, 6, -Math.PI / 2);
    const T = ring(c, c + 0.6, 4.4, 3, -Math.PI / 2);
    face([V[5], V[0], T[0]]);
    face([V[0], V[1], T[0]]);
    face([V[1], V[2], T[1]]);
    face([V[2], V[3], T[1]]);
    face([V[3], V[4], T[2]]);
    face([V[4], V[5], T[2]]);
    face([T[0], T[1], V[1]]);
    face([T[1], T[2], V[3]]);
    face([T[2], T[0], V[5]]);
    face(T, 0.96);
    edge(T[0], T[1]);
    edge(T[1], T[2], ramp[3]);
    edge(T[2], T[0]);
    edge(T[0], V[0], ramp[3]);
    edge(T[2], V[4], ramp[2]);
    edge(T[1], V[2], ramp[2]);
  }
  return p.bake();
}

// ---------- Scrolls ----------

export type Emblem = "fire" | "frost" | "zap" | "bonk" | "poison" | "ward" | "mend";

const SEALS: Record<Emblem, Ramp> = {
  fire: RAMPS.red,
  frost: RAMPS.gemBlue,
  zap: RAMPS.gold,
  bonk: RAMPS.stone,
  poison: ["#0f2a14", "#1e5a24", "#3a9a2a", "#7ad040", "#c8f080"],
  ward: RAMPS.magic,
  mend: RAMPS.gemPink,
};

function emblem(p: Painter, kind: Emblem, cx: number, cy: number) {
  const R = RAMPS;
  if (kind === "fire") {
    p.glow(
      (x, y) => {
        const dy = y - cy;
        const w = dy > 0 ? 3.6 * Math.sqrt(Math.max(0, 1 - (dy / 3.6) ** 2)) : 3.6 * (1 + dy / 6.2);
        return Math.abs(x - cx) <= w && dy > -6.2 && dy < 3.6;
      },
      R.fire,
      (x, y) => 1 - Math.hypot((x - cx) * 0.9, (y - cy - 1) * 0.7) / 4.4,
    );
  } else if (kind === "frost") {
    const ice = RAMPS.gemBlue;
    for (let k = -4; k <= 4; k++) {
      p.dot(cx + k, cy, ice[Math.abs(k) < 2 ? 4 : 3], ice);
      p.dot(cx, cy + k, ice[Math.abs(k) < 2 ? 4 : 3], ice);
      if (Math.abs(k) <= 3) {
        p.dot(cx + k, cy + k, ice[2], ice);
        p.dot(cx + k, cy - k, ice[2], ice);
      }
    }
    p.dot(cx, cy, "#ffffff", ice);
  } else if (kind === "zap") {
    p.poly([[cx + 1, cy - 6], [cx - 3.5, cy + 0.8], [cx - 0.2, cy + 0.8], [cx - 1.5, cy + 6.2], [cx + 3.6, cy - 1], [cx + 0.4, cy - 1], [cx + 2.2, cy - 6]], R.gold, 0.66, { sep: 0.45 });
  } else if (kind === "bonk") {
    p.ellipsoid(cx - 1.5, cy + 1, 3.6, 3, R.stone, { spec: 0.95, sep: 0.35 });
    p.ellipsoid(cx + 2.5, cy - 2, 2.2, 2, R.stone, { sep: 0.2, spec: 0.95 });
  } else if (kind === "poison") {
    const g = SEALS.poison;
    p.ellipsoid(cx, cy + 1.5, 3.4, 3.2, g, { spec: 0.9, sep: 0.35 });
    p.poly([[cx - 2.6, cy], [cx, cy - 5.5], [cx + 2.6, cy]], g, 0.75);
    p.ellipsoid(cx + 3.5, cy - 4, 1.2, 1.2, g, { bias: 0.2 });
    p.dot(cx - 1, cy + 1, R.shadowEye[0]);
    p.dot(cx + 1, cy + 1, R.shadowEye[0]);
  } else if (kind === "ward") {
    const pts: [number, number][] = [[cx - 4.5, cy - 5], [cx + 4.5, cy - 5], [cx + 4.5, cy], [cx, cy + 5.5], [cx - 4.5, cy]];
    p.poly(pts, R.magic, 0.6, { sep: 0.4 });
    p.poly([[cx - 4.5, cy - 5], [cx, cy - 5], [cx, cy + 5.5], [cx - 4.5, cy]], R.magic, 0.85);
    for (let y = -4; y <= 3; y++) p.dot(cx, cy + y, R.gold[3], R.gold);
    for (let x = -3; x <= 3; x++) p.dot(cx + x, cy - 2, R.gold[3], R.gold);
  } else {
    const h = R.gemPink;
    p.ellipsoid(cx - 2, cy - 1.5, 2.6, 2.6, h, { spec: 0.9, sep: 0.35 });
    p.ellipsoid(cx + 2, cy - 1.5, 2.6, 2.6, h, { spec: 0.95 });
    p.poly([[cx - 4.5, cy - 0.5], [cx + 4.5, cy - 0.5], [cx, cy + 5]], h, 0.5);
    p.dot(cx - 3, cy - 3, "#ffffff");
  }
}

export function scrollSprite(kind: Emblem = "fire"): Sprite {
  const W = 20;
  const H = 30;
  const p = new Painter(W, H);
  const R = RAMPS;
  p.fill(
    (x, y) => x > 3 && x < 17 && y > 3 && y < 27,
    R.paper,
    (x) => 0.82 - ((x - 3) / 14) * 0.32,
  );
  for (const ry of [3.5, 26.5]) {
    p.fill(
      (x, y) => x > 2 && x < 18 && Math.abs(y - ry) <= 2.1,
      R.paper,
      (_x, y) => lightOf(0, (y - ry) / 2.1, Math.sqrt(Math.max(0, 1 - ((y - ry) / 2.1) ** 2)), { bias: 0.05 }),
      { sep: 0.25 },
    );
    p.ellipsoid(2, ry, 1.6, 1.8, R.wood, { sep: 0.2 });
    p.ellipsoid(18, ry, 1.6, 1.8, R.wood, { sep: 0.2 });
  }
  emblem(p, kind, 10, 12);
  for (let x = 6; x <= 14; x++) {
    p.nudge(x, 20, -2);
    if (x < 12) p.nudge(x, 22, -2);
  }
  p.ellipsoid(14.5, 26.5, 2.2, 2.2, SEALS[kind], { spec: 0.85, sep: 0.2 });
  return p.bake();
}

// ---------- Gear ----------

export function gearSprite(id: string): Sprite {
  const R = RAMPS;
  if (id === "hourglass") {
    const p = new Painter(16, 30);
    const glass = ["#2a3a5a", "#5a7aa8", "#9cc0e0", "#d0ecff", "#ffffff"];
    p.fill(
      (x, y) => y > 4 && y < 26 && Math.abs(x - 8) <= 0.8 + 5 * Math.abs(y - 15) / 10,
      glass,
      (x, y) => lightOf((x - 8) / 6, 0, 0.8) + (y < 15 ? 0.05 : 0),
    );
    // Sand: a little left on top, a pile below, a falling thread
    p.fill((x, y) => y > 10 && y < 14 && Math.abs(x - 8) <= 0.8 + 5 * Math.abs(y - 15) / 10 - 0.6, R.gold, () => 0.7);
    p.fill((x, y) => y > 19 && y < 25.5 && Math.abs(x - 8) <= Math.min(0.8 + 5 * Math.abs(y - 15) / 10 - 0.6, (y - 19) * 1.3), R.gold, (x) => 0.75 - (x - 8) * 0.06);
    for (let y = 15; y < 20; y++) p.dot(8, y, R.gold[3], R.gold);
    for (const y of [3, 27]) p.column(y - 2, y + 2, () => 8, () => 7, R.wood, { tilt: y < 10 ? -0.4 : 0.2 });
    p.rod(2.2, 4, 2.2, 26, 0.8, R.wood);
    p.rod(13.8, 4, 13.8, 26, 0.8, R.wood, { bias: -0.1 });
    p.dot(6, 8, "#ffffff");
    return p.bake();
  }
  if (id === "boots") {
    const p = new Painter(30, 16);
    for (const [ox, bias] of [[2, -0.08], [15, 0]] as [number, number][]) {
      p.column(1.5, 11, () => ox + 6, () => 3.6, R.leather, { bias, sep: 0.2 });
      p.ellipsoid(ox + 7.5, 12, 6.2, 3, R.leather, { bias, sep: 0.2 });
      p.column(1, 3, () => ox + 6, () => 4.2, R.gold, { bias });
      p.ellipsoid(ox + 7.5, 14.2, 6.6, 1.2, R.wood, { bias: bias - 0.1 });
    }
    return p.bake();
  }
  if (id === "magnet") {
    const p = new Painter(16, 16);
    p.fill(
      (x, y) => {
        const d = Math.hypot(x - 8, y - 8);
        return (y >= 8 && d <= 7.2 && d >= 3.2) || (y < 8 && ((x >= 0.8 && x <= 4.8) || (x >= 11.2 && x <= 15.2)) && y > 1);
      },
      R.red,
      (x, y) => (y >= 8 ? lightOf((x - 8) / 7, (y - 8) / 7, 0.6) : lightOf(x < 8 ? (x - 2.8) / 2 : (x - 13.2) / 2, -0.2, 0.8)),
    );
    for (const x0 of [0.8, 11.2]) p.fill((x, y) => x >= x0 && x <= x0 + 4 && y > 1 && y < 4.5, R.ivory, (x) => lightOf((x - x0 - 2) / 2, -0.3, 0.8));
    return p.bake();
  }
  if (id === "heart") {
    const p = new Painter(16, 15);
    const h = R.red;
    p.fill(
      (x, y) => Math.hypot(x - 5, y - 5) <= 4.4 || Math.hypot(x - 11, y - 5) <= 4.4 || (y >= 5 && Math.abs(x - 8) <= 7.8 - (y - 5) * 0.85),
      h,
      (x, y) => lightOf((x - 8) / 8, (y - 7) / 8, 0.7, { spec: 0.97 }),
    );
    p.dot(4, 3, "#ffffff");
    p.dot(3, 4, "#ffffff");
    return p.bake();
  }
  if (id === "clover") {
    const p = new Painter(16, 16);
    const g = R.leaf;
    p.rod(8, 9, 11, 15.5, 0.7, g, { bias: -0.1 });
    for (const [dx, dy] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) p.ellipsoid(8 + dx, 8 + dy, 3.4, 3.4, g, { spec: 0.95, sep: 0.15 });
    p.dot(8, 8, g[1], g);
    return p.bake();
  }
  if (id === "ember") {
    const p = new Painter(16, 16);
    p.fill(
      (x, y) => {
        const d = Math.hypot((x - 8) / 6.6, (y - 10) / 4.8);
        return d <= 1 && d >= 0.55;
      },
      R.gold,
      (x, y) => lightOf((x - 8) / 6.6, (y - 10) / 4.8, 0.5, { spec: 0.93 }),
    );
    p.ellipsoid(8, 5, 3.2, 3.2, R.fire, { spec: 0.85, sep: 0.2 });
    p.dot(7, 4, "#ffffff");
    return p.bake();
  }
  if (id === "whetstone") {
    const p = new Painter(16, 16);
    p.rod(3, 12.5, 13, 3.5, 3.2, R.stone, { spec: 0.97 });
    p.rod(3.5, 14, 13.5, 5, 1, R.stone, { bias: -0.25 });
    p.dot(6, 8, "#ffffff");
    p.dot(7, 7, "#ffffff");
    return p.bake();
  }
  if (id === "prism") {
    const p = new Painter(16, 16);
    const c = ["#2a1a4a", "#5a4a9a", "#9a8ae0", "#d0c8ff", "#ffffff"];
    p.poly([[8, 0.5], [0.5, 15], [8, 12]], c, 0.85);
    p.poly([[8, 0.5], [8, 12], [15.5, 15]], c, 0.45);
    p.poly([[0.5, 15], [8, 12], [15.5, 15]], c, 0.65);
    const rainbow = ["#ff5a5a", "#ffa424", "#ffe46a", "#8ae04a", "#50d2ff", "#b07aff"];
    rainbow.forEach((col, k) => p.dot(10 + Math.floor(k / 2), 6 + k, col, c));
    return p.bake();
  }
  // Big Lens
  const p = new Painter(30, 16);
  p.rod(16, 10, 27, 14.5, 1.4, R.wood);
  p.ellipsoid(9, 8, 7.4, 7.4, R.gold, { spec: 0.95 });
  p.ellipsoid(9, 8, 5.6, 5.6, ["#1a3a5a", "#3a7ab0", "#7ac0e8", "#c0ecff", "#ffffff"], { bias: 0.05, spec: 0.9, sep: 0.3 });
  p.dot(6, 5, "#ffffff");
  p.dot(7, 5, "#ffffff");
  p.dot(6, 6, "#ffffff");
  return p.bake();
}

export function rockSprite(): Sprite {
  const p = new Painter(10, 9);
  p.ellipsoid(5, 4.8, 4.6, 4, RAMPS.stone, { spec: 0.95 });
  p.nudge(4, 5, -2);
  p.nudge(5, 6, -1);
  return p.bake();
}

// ---------- Effects ----------

export function shadowSprite(w: number): HTMLCanvasElement {
  const h = Math.max(2, Math.round(w * 0.32));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  x.fillStyle = "#1a1430";
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const d = ((i + 0.5 - w / 2) / (w / 2)) ** 2 + ((j + 0.5 - h / 2) / (h / 2)) ** 2;
      if (d <= 1) x.fillRect(i, j, 1, 1);
    }
  return c;
}

/** A puff of smoke that expands and breaks apart over `n` frames. */
export function poofFrames(n = 6, size = 16, ramp: Ramp = RAMPS.ivory): Sprite[] {
  const frames: Sprite[] = [];
  const rnd = seeded(77);
  const blobs = Array.from({ length: 5 }, (_, k) => ({
    a: (k / 5) * TAU + rnd() * 0.6,
    r: 0.55 + rnd() * 0.25,
    s: 0.5 + rnd() * 0.25,
  }));
  for (let f = 0; f < n; f++) {
    const t = f / (n - 1);
    const p = new Painter(size, size);
    const c = size / 2;
    for (const b of blobs) {
      const dist = c * 0.25 + c * 0.5 * t * b.r * 1.4;
      const rad = c * b.s * (1 - t * 0.85) * 0.75;
      if (rad < 0.6) continue;
      p.ellipsoid(c + Math.cos(b.a) * dist, c + Math.sin(b.a) * dist - t * 2, rad, rad, ramp, { bias: 0.1 });
    }
    frames.push(p.bake(t < 0.7));
  }
  return frames;
}

/** A tiny star-shaped impact spark. */
export function sparkFrames(): HTMLCanvasElement[] {
  const shapes = [
    ["..w..", ".wyw.", "wyWyw", ".wyw.", "..w.."],
    ["w...w", ".y.y.", "..W..", ".y.y.", "w...w"],
    [".....", ".y.y.", ".....", ".y.y.", "....."],
  ];
  const col: Record<string, string> = { w: "#ffe46a", y: "#ffa424", W: "#ffffff" };
  return shapes.map((rows) => {
    const c = document.createElement("canvas");
    c.width = 5;
    c.height = 5;
    const x = c.getContext("2d")!;
    rows.forEach((r, j) =>
      [...r].forEach((ch, i) => {
        if (ch === ".") return;
        x.fillStyle = col[ch];
        x.fillRect(i, j, 1, 1);
      }),
    );
    return c;
  });
}

export const INK = OUTLINE;
