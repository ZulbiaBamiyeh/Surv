import { noise } from "../art/world";
import "./iso.css";

// Isometric 2D with real height, drawn in a clean-line illustration style:
// flat colors, ink outlines on cliff edges, hand-drawn hatching, and a caped heroine.

// ---------- Look ----------
const INK = "#2a221e";
const COL = {
  bg: "#c9d4d2",
  grass: ["#93a878", "#8aa070", "#7f9667"],
  dirt: ["#8f735c", "#866a54"],
  path: "#b39b7b",
  sand: "#c8b892",
  water: "#5d6d80",
  waterLight: "#8e9db0",
  cliffL: ["#a4978a", "#968a7c"],
  cliffR: ["#827668", "#766b5e"],
  trunk: "#5e4636",
  leaf: ["#5f7a52", "#6c8a5c", "#557048"],
  rock: "#a19a8e",
};

// ---------- Iso projection ----------
const TW = 72; // tile width in px
const TH = 36; // tile height in px
const HZ = 40; // px per height level
const MAP = 44;

// ---------- Map ----------
const level = new Int8Array(MAP * MAP);
const kind = new Uint8Array(MAP * MAP); // 0 grass, 1 dirt, 2 path, 3 sand, 4 water
const lv = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP || y >= MAP ? -1 : level[y * MAP + x]);
const kd = (x: number, y: number) => kind[y * MAP + x];
for (let y = 0; y < MAP; y++)
  for (let x = 0; x < MAP; x++) {
    const u = (x - MAP / 2) / (MAP / 2);
    const v = (y - MAP / 2) / (MAP / 2);
    const island = Math.max(0, 1 - Math.hypot(u, v) ** 2.5);
    const n = noise(x, y, 11, 3) * 0.65 + noise(x, y, 5, 4) * 0.35;
    const mesa = noise(x, y, 16, 8);
    let h = island * (n * 5.2 + (mesa > 0.58 ? 2 : 0) + (mesa > 0.7 ? 1 : 0)) - 0.4;
    if (island < 0.08) h = -1;
    const L = Math.max(0, Math.min(6, Math.floor(h)));
    level[y * MAP + x] = h < 0 ? 0 : L;
    const k = h < 0 ? 4 : L === 0 && h < 0.35 ? 3 : Math.abs(noise(x, y, 14, 9) - 0.5) < 0.055 ? 2 : noise(x, y, 7, 12) > 0.58 ? 1 : 0;
    kind[y * MAP + x] = k;
  }

// Seeded random for decoration
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Hatch strokes on tile tops (in tile-local 0..1 coords)
const hatch: number[][][] = [];
for (let i = 0; i < MAP * MAP; i++) {
  const strokes: number[][] = [];
  const k = kind[i];
  const n = k === 1 ? 4 : k === 2 ? 3 : k === 4 ? 0 : 2;
  for (let s = 0; s < n; s++) if (rnd() < 0.7) strokes.push([rnd() * 0.8 + 0.1, rnd() * 0.8 + 0.1, 0.06 + rnd() * 0.1, rnd()]);
  hatch.push(strokes);
}

// Props: trees, bushes, rocks
interface Prop { x: number; y: number; type: "tree" | "bush" | "rock"; s: number; v: number; }
const props: Prop[] = [];
for (let y = 1; y < MAP - 1; y++)
  for (let x = 1; x < MAP - 1; x++) {
    const k = kd(x, y);
    if (k === 4 || k === 2 || k === 3) continue;
    const r = rnd();
    const px = x + 0.25 + rnd() * 0.5;
    const py = y + 0.25 + rnd() * 0.5;
    if (r < (k === 0 ? 0.09 : 0.03)) props.push({ x: px, y: py, type: "tree", s: 0.8 + rnd() * 0.5, v: Math.floor(rnd() * 3) });
    else if (r < 0.14) props.push({ x: px, y: py, type: "bush", s: 0.7 + rnd() * 0.5, v: Math.floor(rnd() * 3) });
    else if (r < 0.17) props.push({ x: px, y: py, type: "rock", s: 0.6 + rnd() * 0.7, v: 0 });
  }

// ---------- Canvas ----------
const app = document.getElementById("app")!;
const canvas = document.createElement("canvas");
app.appendChild(canvas);
const ctx = canvas.getContext("2d")!;
let W = 0;
let H = 0;
let dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
}
addEventListener("resize", resize);
resize();

const iso = (x: number, y: number, z: number) => ({ sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) - z * HZ });

// ---------- Player ----------
const start = (() => {
  let best = { x: MAP / 2, y: MAP / 2 };
  let bd = 1e9;
  for (let y = 4; y < MAP - 4; y++)
    for (let x = 4; x < MAP - 4; x++) {
      if (kd(x, y) === 4 || lv(x, y) !== 2) continue;
      const d = Math.hypot(x - MAP / 2, y - MAP / 2);
      if (d < bd) {
        bd = d;
        best = { x: x + 0.5, y: y + 0.5 };
      }
    }
  return best;
})();
const P = {
  x: start.x, y: start.y, z: lv(Math.floor(start.x), Math.floor(start.y)), vx: 0, vy: 0, vz: 0,
  ground: true, fallFrom: 0, face: 1, walk: 0, moving: false, dashT: 0, dashCd: 0, hp: 100, inv: 0,
};
P.fallFrom = P.z;

const groundAt = (x: number, y: number) => {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (kd(cx, cy) === 4) return -0.35;
  return lv(cx, cy);
};
const R = 0.22;
const footGround = (x: number, y: number) => Math.max(groundAt(x - R, y - R), groundAt(x + R, y - R), groundAt(x - R, y + R), groundAt(x + R, y + R));

// ---------- Slimes, fireballs, effects ----------
interface Slime { x: number; y: number; z: number; vz: number; hop: number; hp: number; col: string; flash: number; }
const slimes: Slime[] = [];
function spawnSlime() {
  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 7 + rnd() * 6;
    const x = P.x + Math.cos(a) * d;
    const y = P.y + Math.sin(a) * d;
    if (x < 1 || y < 1 || x > MAP - 1 || y > MAP - 1 || kd(Math.floor(x), Math.floor(y)) === 4) continue;
    slimes.push({ x, y, z: groundAt(x, y), vz: 0, hop: rnd() * 6, hp: 3, col: rnd() < 0.3 ? "#3f9a8c" : "#c8463a", flash: 0 });
    return;
  }
}
for (let i = 0; i < 9; i++) spawnSlime();

interface Shot { x: number; y: number; z: number; vx: number; vy: number; life: number; trail: { x: number; y: number; z: number }[]; }
const shots: Shot[] = [];
interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; col: string; }
const bits: Bit[] = [];
interface Pop { x: number; y: number; z: number; t: number; text: string; col: string; }
const pops: Pop[] = [];
function burst(x: number, y: number, z: number, col: string, n: number) {
  for (let i = 0; i < n; i++) bits.push({ x, y, z, vx: (rnd() - 0.5) * 3, vy: (rnd() - 0.5) * 3, vz: 2 + rnd() * 3, life: 0.5 + rnd() * 0.3, col });
}

// ---------- Input ----------
const keys = new Set<string>();
let jumpQ = 0;
let dashQ = 0;
addEventListener("keydown", (e) => {
  if (e.code === "Space") { jumpQ = 0.12; e.preventDefault(); }
  if (e.code.startsWith("Shift")) dashQ = 0.12;
  if (e.code.startsWith("Arrow")) e.preventDefault();
  keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
const stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
  Object.assign(stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== stick.id) return;
  const dx = e.clientX - stick.ox;
  const dy = e.clientY - stick.oy;
  const d = Math.hypot(dx, dy);
  const k = Math.min(1, d / 45) / (d || 1);
  stick.x = dx * k;
  stick.y = dy * k;
});
const endStick = (e: PointerEvent) => { if (e.pointerId === stick.id) stick.id = -1; };
canvas.addEventListener("pointerup", endStick);
canvas.addEventListener("pointercancel", endStick);
document.querySelector(".tb.jump")?.addEventListener("pointerdown", (e) => { e.preventDefault(); jumpQ = 0.12; });
document.querySelector(".tb.dash")?.addEventListener("pointerdown", (e) => { e.preventDefault(); dashQ = 0.12; });

// ---------- Simulation ----------
const SPEED = 4.2;
const GRAV = 22;
const JUMP = 7.6;
let castT = 0.5;
let shake = 0;

function hurt(n: number, col = "#e04a3a") {
  P.hp = Math.max(0, P.hp - n);
  P.inv = 0.7;
  shake = 6;
  pops.push({ x: P.x, y: P.y, z: P.z + 2.2, t: 0, text: String(Math.round(n)), col });
  if (P.hp <= 0) {
    P.hp = 100;
    P.x = start.x;
    P.y = start.y;
    P.z = groundAt(P.x, P.y);
  }
}

function step(dt: number) {
  // Screen-aligned input mapped onto the iso grid
  let ix = 0;
  let iy = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) iy -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) iy += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
  if (stick.id >= 0) { ix = stick.x; iy = stick.y; }
  const l = Math.hypot(ix, iy);
  if (l > 1) { ix /= l; iy /= l; }
  // Screen right = (+x, -y) in world, screen down = (+x, +y), scaled for the 2:1 tiles
  let wx = ix * 0.5 + iy;
  let wy = -ix * 0.5 + iy;
  const wl = Math.hypot(wx, wy);
  if (wl > 0) { wx = (wx / wl) * Math.min(1, l); wy = (wy / wl) * Math.min(1, l); }

  P.dashCd = Math.max(0, P.dashCd - dt);
  P.inv = Math.max(0, P.inv - dt);
  jumpQ = Math.max(0, jumpQ - dt);
  dashQ = Math.max(0, dashQ - dt);
  if (ix !== 0) P.face = ix > 0 ? 1 : -1;

  if (dashQ > 0 && P.dashCd <= 0) {
    dashQ = 0;
    P.dashT = 0.17;
    P.dashCd = 0.8;
    const dx = wl > 0 ? wx : P.face * 0.7;
    const dy = wl > 0 ? wy : -P.face * 0.7;
    const d = Math.hypot(dx, dy) || 1;
    P.vx = (dx / d) * 13;
    P.vy = (dy / d) * 13;
    if (P.vz < 0) P.vz = 0;
    burst(P.x, P.y, P.z + 0.6, "#9fc4d8", 6);
  }
  if (P.dashT > 0) {
    P.dashT -= dt;
    P.vz -= GRAV * 0.3 * dt;
  } else {
    const k = P.ground ? 1 : 0.6;
    P.vx += (wx * SPEED - P.vx) * Math.min(1, dt * 18 * k);
    P.vy += (wy * SPEED - P.vy) * Math.min(1, dt * 18 * k);
    P.vz -= GRAV * dt;
  }
  if (jumpQ > 0 && P.ground) {
    jumpQ = 0;
    P.vz = JUMP;
    P.ground = false;
    P.fallFrom = P.z;
  }
  const nx = P.x + P.vx * dt;
  if (footGround(nx, P.y) <= P.z + 0.25) P.x = nx;
  else P.vx = 0;
  const ny = P.y + P.vy * dt;
  if (footGround(P.x, ny) <= P.z + 0.25) P.y = ny;
  else P.vy = 0;
  P.x = Math.max(1, Math.min(MAP - 1, P.x));
  P.y = Math.max(1, Math.min(MAP - 1, P.y));
  P.z += P.vz * dt;
  const g = footGround(P.x, P.y);
  if (P.z <= g) {
    if (!P.ground) {
      const fell = P.fallFrom - g;
      if (fell > 2.2) hurt((fell - 2.2) * 14, "#e8902a");
      if (fell > 0.6) burst(P.x, P.y, g + 0.05, "#d8cbb0", 6);
    }
    P.z = g;
    P.vz = 0;
    P.ground = true;
  } else if (P.z > g + 0.02) {
    if (P.ground) P.fallFrom = P.z;
    P.ground = false;
    P.fallFrom = Math.max(P.fallFrom, P.z);
  }
  if (g < 0 && P.z < -0.2) {
    hurt(10);
    P.x = start.x;
    P.y = start.y;
    P.z = groundAt(P.x, P.y);
  }
  P.moving = Math.hypot(P.vx, P.vy) > 0.4;
  if (P.moving) P.walk += dt * Math.hypot(P.vx, P.vy) * 2.4;

  // Slimes hop toward you and can climb one level per hop
  for (const s of slimes) {
    s.hop += dt * 2.4;
    s.flash = Math.max(0, s.flash - dt);
    const sg = groundAt(s.x, s.y);
    const onGround = s.z <= sg + 0.01;
    if (onGround && Math.sin(s.hop) > 0.96) s.vz = 6;
    if (!onGround || s.vz > 0) {
      const dx = P.x - s.x;
      const dy = P.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const mx = s.x + (dx / d) * 1.8 * dt;
      const my = s.y + (dy / d) * 1.8 * dt;
      if (groundAt(mx, my) <= s.z + 0.2) { s.x = mx; s.y = my; }
    }
    s.vz -= GRAV * dt;
    s.z += s.vz * dt;
    const ng = groundAt(s.x, s.y);
    if (s.z <= ng) { s.z = ng; s.vz = 0; }
    if (Math.hypot(P.x - s.x, P.y - s.y) < 0.45 && Math.abs(P.z - s.z) < 0.8 && P.inv <= 0 && P.dashT <= 0) hurt(8);
  }

  // Auto-cast fireballs at the nearest slime
  castT -= dt;
  if (castT <= 0) {
    let best: Slime | null = null;
    let bd = 8;
    for (const s of slimes) {
      const d = Math.hypot(s.x - P.x, s.y - P.y);
      if (d < bd) { bd = d; best = s; }
    }
    castT = best ? 0.6 : 0.1;
    if (best) {
      const dx = best.x - P.x;
      const dy = best.y - P.y;
      const d = Math.hypot(dx, dy) || 1;
      shots.push({ x: P.x, y: P.y, z: P.z + 1.1, vx: (dx / d) * 9, vy: (dy / d) * 9, life: 1.2, trail: [] });
    }
  }
  for (const sh of shots) {
    sh.trail.unshift({ x: sh.x, y: sh.y, z: sh.z });
    if (sh.trail.length > 6) sh.trail.pop();
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.life -= dt;
    if (groundAt(sh.x, sh.y) > sh.z) sh.life = 0;
    for (const s of slimes) {
      if (s.hp <= 0 || Math.hypot(s.x - sh.x, s.y - sh.y) > 0.45 || Math.abs(s.z + 0.4 - sh.z) > 1.1) continue;
      s.hp -= 1;
      s.flash = 0.1;
      sh.life = 0;
      burst(sh.x, sh.y, sh.z, "#f0a040", 6);
      if (s.hp <= 0) burst(s.x, s.y, s.z + 0.3, s.col, 12);
      break;
    }
  }
  for (let i = shots.length - 1; i >= 0; i--) if (shots[i].life <= 0) shots.splice(i, 1);
  for (let i = slimes.length - 1; i >= 0; i--) if (slimes[i].hp <= 0) slimes.splice(i, 1);
  while (slimes.length < 9) spawnSlime();
  for (const b of bits) {
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vz -= 14 * dt;
    b.z += b.vz * dt;
  }
  for (let i = bits.length - 1; i >= 0; i--) if (bits[i].life <= 0) bits.splice(i, 1);
  for (const p of pops) p.t += dt;
  for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 1) pops.splice(i, 1);
  shake = Math.max(0, shake - dt * 30);
}

// ---------- Drawing helpers ----------
/** A stroke with an ink outline: draw it wide in ink, then narrower in color. */
function inked(path: () => void, width: number, color: string, outline = 2.5) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + outline * 2;
  ctx.beginPath();
  path();
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  path();
  ctx.stroke();
}

function fillInk(path: () => void, color: string, lw = 2) {
  ctx.beginPath();
  path();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------- Tiles ----------
function drawTile(x: number, y: number, t: number) {
  const L = lv(x, y);
  const k = kd(x, y);
  const { sx, sy } = iso(x, y, k === 4 ? 0 : L);
  const top = [
    [sx, sy],
    [sx + TW / 2, sy + TH / 2],
    [sx, sy + TH],
    [sx - TW / 2, sy + TH / 2],
  ];
  // Cliff faces toward the viewer: the left face (toward +y) and the right face (toward +x)
  if (k !== 4) {
    const faces: [number, number, string[], number[][]][] = [
      [x, y + 1, COL.cliffL, [top[3], top[2]]],
      [x + 1, y, COL.cliffR, [top[2], top[1]]],
    ];
    for (const [nx, ny, cols, [a, b]] of faces) {
      const nL = kd(nx, ny) === 4 ? -0.4 : Math.max(-0.4, lv(nx, ny));
      if (nL >= L) continue;
      const drop = (L - nL) * HZ;
      // One band per level, so cliffs show rock strata
      for (let i = 0; i < L - Math.floor(nL); i++) {
        const y0 = i * HZ;
        const y1 = Math.min(drop, (i + 1) * HZ);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1] + y0);
        ctx.lineTo(b[0], b[1] + y0);
        ctx.lineTo(b[0], b[1] + y1);
        ctx.lineTo(a[0], a[1] + y1);
        ctx.closePath();
        ctx.fillStyle = cols[(L - i) % 2];
        ctx.fill();
      }
      // Strata lines and vertical hatching
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45;
      for (let i = 1; i < L - nL; i++) {
        ctx.beginPath();
        ctx.moveTo(a[0], a[1] + i * HZ);
        ctx.lineTo(b[0], b[1] + i * HZ);
        ctx.stroke();
      }
      const n = cols === COL.cliffR ? 5 : 2;
      for (let i = 0; i < n; i++) {
        const f = ((x * 7 + y * 13 + i * 5) % 10) / 10;
        const px = a[0] + (b[0] - a[0]) * (0.1 + f * 0.8);
        const py = a[1] + (b[1] - a[1]) * (0.1 + f * 0.8);
        const len = 6 + ((x * 3 + i * 7) % 9);
        ctx.beginPath();
        ctx.moveTo(px, py + 4 + (i % 3) * 6);
        ctx.lineTo(px, py + 4 + (i % 3) * 6 + Math.min(len, drop - 8));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Face outline
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(a[0], a[1] + drop);
      ctx.lineTo(b[0], b[1] + drop);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }

  // Top surface
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(top[i][0], top[i][1]);
  ctx.closePath();
  const tint = 0.9 + Math.min(L, 6) * 0.025;
  const base = k === 4 ? COL.water : k === 3 ? COL.sand : k === 2 ? COL.path : k === 1 ? COL.dirt[noise(x, y, 3, 5) > 0.5 ? 1 : 0] : COL.grass[Math.floor(noise(x, y, 4, 2) * 3)];
  ctx.fillStyle = k === 4 ? base : shade(base, tint);
  ctx.fill();
  // Hairline seam so the fill covers anti-aliasing gaps
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (k === 4) {
    // Ripples
    ctx.strokeStyle = COL.waterLight;
    ctx.lineWidth = 1.5;
    const ph = (t * 0.6 + (x * 0.37 + y * 0.21)) % 1;
    ctx.globalAlpha = Math.sin(ph * Math.PI);
    ctx.beginPath();
    ctx.moveTo(sx - 10, sy + TH / 2 + 3);
    ctx.lineTo(sx + 6, sy + TH / 2 + 3 - ph * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    // Hand-drawn dashes on the ground, along the iso axes
    ctx.strokeStyle = INK;
    ctx.globalAlpha = k === 2 ? 0.3 : 0.38;
    ctx.lineWidth = 1.2;
    for (const [u, v, len, r] of hatch[y * MAP + x]) {
      const p0 = iso(x + u, y + v, L);
      const along = r < 0.5;
      const p1 = iso(x + u + (along ? len : 0), y + v + (along ? 0 : len), L);
      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Ink along edges that drop to lower ground or touch water
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  const edges: [number, number, number[], number[]][] = [
    [x, y - 1, top[0], top[1]],
    [x + 1, y, top[1], top[2]],
    [x, y + 1, top[2], top[3]],
    [x - 1, y, top[3], top[0]],
  ];
  for (const [nx, ny, a, b] of edges) {
    const nk = kd(Math.max(0, Math.min(MAP - 1, nx)), Math.max(0, Math.min(MAP - 1, ny)));
    const nL = lv(nx, ny);
    if ((k !== 4 && (nL < L || nk === 4)) || (k === 4 && nk !== 4 && nL > 0)) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }
}

// ---------- Props ----------
function drawProp(p: Prop) {
  const z = lv(Math.floor(p.x), Math.floor(p.y));
  const { sx, sy } = iso(p.x, p.y, z);
  const s = p.s;
  // Trees standing in front of the heroine fade so she never disappears
  const me = iso(P.x, P.y, P.z);
  const inFront = p.type === "tree" && p.x + p.y > P.x + P.y && Math.abs(sx - me.sx) < 26 * s && me.sy < sy && me.sy > sy - 70 * s;
  ctx.globalAlpha = inFront ? 0.45 : 1;
  ctx.fillStyle = "rgba(42,34,30,0.18)";
  ctx.beginPath();
  ctx.ellipse(sx, sy, 16 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.type === "tree") {
    inked(() => { ctx.moveTo(sx, sy); ctx.lineTo(sx + 2 * s, sy - 26 * s); }, 5 * s, COL.trunk, 2);
    const blobs = [[0, -40, 17], [-12, -32, 12], [12, -30, 12], [3, -52, 12]];
    const leaf = COL.leaf[p.v];
    ctx.fillStyle = INK;
    for (const [bx, by, r] of blobs) {
      ctx.beginPath();
      ctx.arc(sx + bx * s, sy + by * s, r * s + 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = leaf;
    for (const [bx, by, r] of blobs) {
      ctx.beginPath();
      ctx.arc(sx + bx * s, sy + by * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shade and a couple of leaf strokes
    ctx.fillStyle = "rgba(42,34,30,0.12)";
    ctx.beginPath();
    ctx.arc(sx + 6 * s, sy - 34 * s, 13 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    for (const [bx, by, r] of blobs.slice(0, 3)) {
      ctx.beginPath();
      ctx.arc(sx + bx * s + r * s * 0.2, sy + by * s + r * s * 0.2, r * s * 0.5, 0.2, 1.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (p.type === "bush") {
    const blobs = [[-7, -8, 8], [6, -8, 8], [0, -14, 8]];
    ctx.fillStyle = INK;
    for (const [bx, by, r] of blobs) {
      ctx.beginPath();
      ctx.arc(sx + bx * s, sy + by * s, r * s + 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COL.leaf[(p.v + 1) % 3];
    for (const [bx, by, r] of blobs) {
      ctx.beginPath();
      ctx.arc(sx + bx * s, sy + by * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    fillInk(() => {
      ctx.moveTo(sx - 12 * s, sy + 1);
      ctx.lineTo(sx - 9 * s, sy - 9 * s);
      ctx.lineTo(sx + 1 * s, sy - 13 * s);
      ctx.lineTo(sx + 11 * s, sy - 6 * s);
      ctx.lineTo(sx + 12 * s, sy + 1);
      ctx.closePath();
    }, COL.rock, 2);
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + 2 * s, sy - 11 * s);
    ctx.lineTo(sx + 4 * s, sy - 1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 1;
}

// ---------- The heroine ----------
function drawHeroine(t: number) {
  const g = footGround(P.x, P.y);
  const shadowP = iso(P.x, P.y, g);
  const lift = P.z - g;
  ctx.fillStyle = "rgba(42,34,30,0.25)";
  ctx.beginPath();
  ctx.ellipse(shadowP.sx, shadowP.sy, 11 - Math.min(5, lift * 2), 5 - Math.min(2, lift), 0, 0, Math.PI * 2);
  ctx.fill();
  if (P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0) return;
  const { sx, sy } = iso(P.x, P.y, P.z);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(P.face, 1);
  const w = P.moving && P.ground ? Math.sin(P.walk * 3.2) : 0;
  const air = !P.ground;
  const dash = P.dashT > 0;
  const lean = dash ? 0.35 : P.moving ? 0.08 : 0;
  const bob = P.moving && P.ground ? Math.abs(Math.cos(P.walk * 3.2)) * 1.5 : Math.sin(t * 2.5) * 0.6;
  const hip = { x: 0, y: -24 - bob };
  ctx.rotate(lean);

  // Cape, flowing behind (to the left when facing right)
  const flow = dash ? 14 : P.moving ? 7 + Math.sin(t * 9) * 2 : 2 + Math.sin(t * 2) * 1;
  fillInk(() => {
    ctx.moveTo(-3, hip.y - 17);
    ctx.quadraticCurveTo(-8 - flow * 0.5, hip.y - 6, -6 - flow, hip.y + 12 - (air ? 4 : 0));
    ctx.quadraticCurveTo(-2 - flow * 0.6, hip.y + 15, 2, hip.y + 8);
    ctx.lineTo(4, hip.y - 15);
    ctx.closePath();
  }, "#c8463a", 2);

  // Legs: back leg first
  const leg = (ph: number, col: string) => {
    const kneeX = air ? 5 * ph : 4 * ph;
    const footX = air ? 2 + 6 * ph : 7 * ph;
    const footY = air ? -4 : 0;
    inked(() => {
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(hip.x + kneeX, hip.y + 12);
      ctx.lineTo(hip.x + footX, footY - 2);
    }, 5.5, col);
    inked(() => {
      ctx.moveTo(hip.x + footX - 1, footY - 4);
      ctx.lineTo(hip.x + footX + 3, footY - 1);
    }, 5, "#6a4632");
  };
  leg(air ? -0.8 : -w, "#4f4560");
  // Back arm
  inked(() => { ctx.moveTo(-1, hip.y - 15); ctx.lineTo(-4 - w * 3, hip.y - 4); }, 4, "#e2d6c2");
  leg(air ? 0.6 : w, "#5a4e6a");

  // Torso: cream shirt, belt and strap
  fillInk(() => {
    ctx.moveTo(-5, hip.y - 17);
    ctx.quadraticCurveTo(0, hip.y - 20, 6, hip.y - 17);
    ctx.lineTo(5, hip.y + 1);
    ctx.lineTo(-5, hip.y + 1);
    ctx.closePath();
  }, "#efe5d4", 2);
  ctx.fillStyle = "#4a3428";
  ctx.fillRect(-5, hip.y - 3, 10, 3);
  ctx.strokeStyle = "#8a5a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, hip.y - 16);
  ctx.lineTo(4, hip.y - 4);
  ctx.stroke();
  // Pack with a bedroll
  fillInk(() => ctx.rect(-10, hip.y - 17, 5, 12), "#8a5a3a", 1.8);
  fillInk(() => ctx.ellipse(-8, hip.y - 19, 6, 3.2, -0.2, 0, Math.PI * 2), "#f2ead8", 1.8);

  // Head with a messy bun, facing the direction of travel
  const hy = hip.y - 25;
  fillInk(() => ctx.arc(1, hy, 6.5, 0, Math.PI * 2), "#f2d2b4", 2);
  fillInk(() => {
    ctx.arc(0, hy - 1, 6.8, Math.PI * 0.95, Math.PI * 2.1);
    ctx.quadraticCurveTo(2, hy - 3, -6, hy + 2);
    ctx.closePath();
  }, "#e2c486", 2);
  fillInk(() => ctx.arc(-3, hy - 8, 3.4, 0, Math.PI * 2), "#e2c486", 1.8);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-2, hy - 10);
  ctx.lineTo(-6, hy - 15);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(4, hy, 1.6, 2.2);

  // Front arm with a staff
  const ax = 5 + w * 2;
  inked(() => { ctx.moveTo(3, hip.y - 15); ctx.lineTo(ax, hip.y - 4); }, 4, "#efe5d4");
  inked(() => { ctx.moveTo(ax - 1, hip.y + 18); ctx.lineTo(ax + 3, hip.y - 30); }, 2.4, "#7a5a3e", 1.6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax + 6, hip.y - 31, 4, Math.PI * 0.9, Math.PI * 2.1);
  ctx.stroke();
  ctx.restore();
}

function drawSlime(s: Slime, t: number) {
  const g = groundAt(s.x, s.y);
  const sp = iso(s.x, s.y, g);
  ctx.fillStyle = "rgba(42,34,30,0.22)";
  ctx.beginPath();
  ctx.ellipse(sp.sx, sp.sy, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const { sx, sy } = iso(s.x, s.y, s.z);
  const air = s.z > g + 0.02;
  const sq = air ? 0.88 : 1 + Math.max(0, -Math.sin(s.hop)) * 0.15;
  const rw = 11 / Math.sqrt(sq);
  const rh = 9 * sq;
  fillInk(() => {
    ctx.moveTo(sx - rw, sy);
    ctx.bezierCurveTo(sx - rw, sy - rh * 1.6, sx + rw, sy - rh * 1.6, sx + rw, sy);
    ctx.closePath();
  }, s.flash > 0 ? "#ffffff" : s.col, 2);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(sx - rw * 0.4, sy - rh * 0.95, 2.5, 1.6, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  const look = P.x - s.x - (P.y - s.y) > 0 ? 1.5 : -1.5;
  ctx.fillRect(sx - 4 + look, sy - rh * 0.65, 2, 3);
  ctx.fillRect(sx + 2 + look, sy - rh * 0.65, 2, 3);
  void t;
}

function drawShot(sh: Shot) {
  sh.trail.forEach((p, i) => {
    const q = iso(p.x, p.y, p.z);
    ctx.fillStyle = i < 2 ? "#f6c060" : "#e8902a";
    ctx.globalAlpha = 1 - i / 6;
    ctx.beginPath();
    ctx.arc(q.sx, q.sy, 4 - i * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  const q = iso(sh.x, sh.y, sh.z);
  fillInk(() => ctx.arc(q.sx, q.sy, 5.5, 0, Math.PI * 2), "#e8902a", 2);
  ctx.fillStyle = "#fff0b0";
  ctx.beginPath();
  ctx.arc(q.sx - 1, q.sy - 1, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- Frame ----------
const hpEl = document.querySelector<HTMLElement>(".hp i")!;
const hpText = document.querySelector<HTMLElement>(".hp span")!;
const lvlEl = document.querySelector<HTMLElement>(".height b")!;
function draw(t: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);
  const zoom = Math.min(W, H * 1.6) < 700 ? 1.25 : 1.7;
  const vw = W / zoom;
  const vh = H / zoom;
  const cam = iso(P.x, P.y, P.z * 0.6);
  ctx.scale(zoom, zoom);
  const ox = vw / 2 - cam.sx + (Math.random() - 0.5) * shake;
  const oy = vh / 2 - cam.sy + 30 + (Math.random() - 0.5) * shake;
  ctx.translate(ox, oy);

  // Entities bucketed by diagonal so cliffs in front cover things behind them
  const buckets = new Map<number, (() => void)[]>();
  const add = (x: number, y: number, fn: () => void) => {
    const d = Math.floor(x) + Math.floor(y);
    let b = buckets.get(d);
    if (!b) buckets.set(d, (b = []));
    b.push(fn);
  };
  for (const p of props) add(p.x, p.y, () => drawProp(p));
  for (const s of slimes) add(s.x, s.y, () => drawSlime(s, t));
  add(P.x, P.y, () => drawHeroine(t));
  for (const sh of shots) add(sh.x, sh.y, () => drawShot(sh));

  // Only draw tiles near the screen
  const span = Math.ceil(Math.max(vw / TW, vh / TH)) + 8;
  const cx = Math.floor(P.x);
  const cy = Math.floor(P.y);
  for (let d = cx + cy - span; d <= cx + cy + span + 6; d++) {
    for (let x = Math.max(0, d - (MAP - 1)); x <= Math.min(MAP - 1, d); x++) {
      const y = d - x;
      if (Math.abs(x - y - (cx - cy)) > span) continue;
      drawTile(x, y, t);
    }
    const b = buckets.get(d);
    if (b) for (const fn of b) fn();
  }

  // Particles and damage numbers on top
  for (const b of bits) {
    const q = iso(b.x, b.y, b.z);
    ctx.fillStyle = b.col;
    ctx.globalAlpha = Math.min(1, b.life * 2);
    ctx.beginPath();
    ctx.arc(q.sx, q.sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = "700 20px Figtree, system-ui, sans-serif";
  ctx.textAlign = "center";
  for (const p of pops) {
    const q = iso(p.x, p.y, p.z + p.t * 1.5);
    ctx.globalAlpha = 1 - p.t;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#f3f1e8";
    ctx.strokeText(p.text, q.sx, q.sy);
    ctx.fillStyle = p.col;
    ctx.fillText(p.text, q.sx, q.sy);
  }
  ctx.globalAlpha = 1;

  hpEl.style.width = P.hp + "%";
  hpText.textContent = `${Math.ceil(P.hp)} / 100`;
  lvlEl.textContent = String(Math.max(0, Math.round(P.z)));
}

let last = performance.now();
let time = 0;
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= 1 / 120) {
    step(1 / 120);
    time += 1 / 120;
    acc -= 1 / 120;
  }
  draw(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, { __iso: { P, lv } });
