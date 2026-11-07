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
    pip(7, 7);
    pip(9, 7);
    pip(8, 9);
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
    pip(7, 8);
    pip(9, 8);
  }
  return p.bake();
}

// ---------- Fireball scroll ----------

export function scrollSprite(): Sprite {
  const W = 20;
  const H = 24;
  const p = new Painter(W, H);
  const R = RAMPS;
  // Paper sheet, lit from the left
  p.fill(
    (x, y) => x > 3 && x < 17 && y > 3 && y < 21,
    R.paper,
    (x) => 0.82 - ((x - 3) / 14) * 0.32,
  );
  // Rolled ends
  for (const ry of [3.5, 20.5]) {
    p.fill(
      (x, y) => x > 2 && x < 18 && Math.abs(y - ry) <= 2.1,
      R.paper,
      (_x, y) => lightOf(0, (y - ry) / 2.1, Math.sqrt(Math.max(0, 1 - ((y - ry) / 2.1) ** 2)), { bias: 0.05 }),
      { sep: 0.25 },
    );
    p.ellipsoid(2, ry, 1.6, 1.8, R.wood, { sep: 0.2 });
    p.ellipsoid(18, ry, 1.6, 1.8, R.wood, { sep: 0.2 });
  }
  // Fire emblem
  const fx = 10;
  const fy = 10.5;
  p.glow(
    (x, y) => {
      const dy = y - fy;
      const w = dy > 0 ? 3.6 * Math.sqrt(Math.max(0, 1 - (dy / 3.6) ** 2)) : 3.6 * (1 + dy / 6.2);
      return Math.abs(x - fx) <= w && dy > -6.2 && dy < 3.6;
    },
    R.fire,
    (x, y) => 1 - Math.hypot((x - fx) * 0.9, (y - fy - 1) * 0.7) / 4.4,
  );
  // Text lines
  for (let x = 6; x <= 14; x++) {
    p.nudge(x, 16, -2);
    if (x < 12) p.nudge(x, 18, -2);
  }
  // Wax seal
  p.ellipsoid(14.5, 20.5, 2.2, 2.2, R.red, { spec: 0.85, sep: 0.2 });
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
