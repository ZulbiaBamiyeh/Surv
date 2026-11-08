import { numberSprite } from "../art/font";
import type { Sprite } from "../art/painter";
import { CAT_CHARM, CatPose, catFrame, crawlerFrame, glow, makeCanvas, mothFrame, starBolt, wispFrame } from "./art";
import "./side.css";
import { PARALLAX, Plat, WH, WW, World } from "./world";

// ---------- Tuning ----------
const T = {
  run: 150,
  accel: 1500,
  airAccel: 900,
  friction: 1700,
  gravity: 1350,
  jump: 470,
  airJump: 400,
  jumpCut: 0.45,
  coyote: 0.1,
  buffer: 0.12,
  dash: 420,
  dashTime: 0.16,
  dashCd: 0.7,
  safeFall: 250,
  fallDmg: 0.11,
  maxFall: 720,
};

// ---------- Art ----------
const T0 = performance.now();
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const ART = {
  idle: range(8).map((i) => catFrame("idle", i / 8)),
  run: range(8).map((i) => catFrame("run", i / 8)),
  jump: [catFrame("jump", 0)],
  fall: [catFrame("fall", 0)],
  dash: [catFrame("dash", 0)],
  wisp: range(4).map((i) => wispFrame(i / 4)),
  moth: range(4).map((i) => mothFrame(i / 4)),
  crawler: range(4).map((i) => crawlerFrame(i / 4)),
  bolt: [starBolt(0), starBolt(1)],
  pinkGlow: glow(14, "#ff7ad0"),
  softGlow: glow(30, "#ff7ad0"),
  eyeGlow: glow(6, "#ffd27a"),
};
// Let the loading message paint before the (slow) world generation runs
await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const T1 = performance.now();
const world = new World();
document.querySelector(".loading")?.remove();
const T2 = performance.now();

// ---------- Screen ----------
const app = document.getElementById("app")!;
const canvas = document.createElement("canvas");
app.appendChild(canvas);
const ctx = canvas.getContext("2d")!;
let buf = makeCanvas(16, 16);
let VW = 480;
let VH = 270;
let scale = 3;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(innerWidth * dpr);
  const h = Math.round(innerHeight * dpr);
  // Whole-number scale so pixels stay square, aiming for about 320 pixels of height
  scale = Math.max(1, Math.round(Math.min(h / 320, w / 420)));
  VW = Math.ceil(w / scale);
  VH = Math.ceil(h / scale);
  buf = makeCanvas(VW, VH);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
}
addEventListener("resize", resize);
resize();

// ---------- Input ----------
const keys = new Set<string>();
let jumpBuf = 0;
let jumpHeld = false;
let dashQ = 0;
// Arrow keys move; Space or Alt jumps; Shift dashes
const JUMP_KEYS = ["Space", "AltLeft", "AltRight"];
const press = (code: string) => {
  if (JUMP_KEYS.includes(code)) {
    jumpBuf = T.buffer;
    jumpHeld = true;
  }
  if (["ShiftLeft", "ShiftRight", "KeyJ", "KeyX"].includes(code)) dashQ = 0.12;
};
const release = (code: string) => {
  if (JUMP_KEYS.includes(code)) jumpHeld = false;
};
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  // Alt would otherwise focus the browser menu on some systems
  if (["Space", "AltLeft", "AltRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  press(e.code);
});
addEventListener("keyup", (e) => {
  if (e.code.startsWith("Alt")) e.preventDefault();
  keys.delete(e.code);
  release(e.code);
});
addEventListener("blur", () => {
  keys.clear();
  jumpHeld = false;
});
// Touch buttons
for (const [sel, code] of [[".tb.left", "ArrowLeft"], [".tb.right", "ArrowRight"], [".tb.jump", "Space"], [".tb.dash", "ShiftLeft"], [".tb.down", "ArrowDown"]] as const) {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) continue;
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    keys.add(code);
    press(code);
  });
  const up = () => {
    keys.delete(code);
    release(code);
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);
}

// ---------- Player ----------
const P = {
  x: world.spawn.x, y: world.spawn.y, vx: 0, vy: 0,
  ground: true, plat: null as Plat | null, coyote: 0, airJumps: 1,
  face: 1, dashT: 0, dashCd: 0, dropT: 0, dropPlat: null as Plat | null,
  fallTop: world.spawn.y, hp: 100, inv: 0, anim: 0, pose: "idle" as CatPose, land: 0, kills: 0,
};
P.plat = world.platAt(P.x, P.y);
const trail: { x: number; y: number; face: number; frame: Sprite; t: number }[] = [];

// ---------- Enemies, bolts and effects ----------
type Kind = "wisp" | "moth" | "crawler";
interface Foe { kind: Kind; x: number; y: number; vx: number; vy: number; hp: number; flash: number; ph: number; plat: Plat | null; dir: number; }
const foes: Foe[] = [];
interface Bolt { x: number; y: number; vx: number; vy: number; life: number; target: Foe | null; }
const bolts: Bolt[] = [];
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; g: number; }
const sparks: Spark[] = [];
interface Pop { x: number; y: number; t: number; v: number; col: string; sh: string; }
const pops: Pop[] = [];
const motes = range(70).map(() => ({ x: Math.random() * WW, y: Math.random() * WH, s: 0.2 + Math.random() * 0.6, ph: Math.random() * 6 }));

function burst(x: number, y: number, cols: string[], n: number, sp: number, g = 160) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = sp * (0.3 + Math.random() * 0.7);
    const life = 0.3 + Math.random() * 0.4;
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.2, life, max: life, col: cols[i % cols.length], g });
  }
}

let spawnT = 1;
let time = 0;
function spawnFoe() {
  const r = Math.random();
  const side = Math.random() < 0.5 ? -1 : 1;
  if (r < 0.28) {
    // Crawlers appear on a platform near the edge of the screen
    const near = world.plats.filter((p) => Math.abs((p.x0 + p.x1) / 2 - (P.x + side * VW * 0.6)) < 200 && Math.abs(p.y - P.y) < 200);
    const p = near[Math.floor(Math.random() * near.length)];
    if (p) {
      foes.push({ kind: "crawler", x: side > 0 ? p.x1 - 8 : p.x0 + 8, y: p.y, vx: 0, vy: 0, hp: 5, flash: 0, ph: Math.random(), plat: p, dir: -side });
      return;
    }
  }
  const kind: Kind = r < 0.65 ? "wisp" : "moth";
  foes.push({
    kind, x: P.x + side * (VW / 2 + 30), y: P.y - 60 + Math.random() * 120, vx: 0, vy: 0, hp: kind === "wisp" ? 3 : 2,
    flash: 0, ph: Math.random() * 6, plat: null, dir: -side,
  });
}

function hurt(n: number, col = "#ff6a8a") {
  if (P.inv > 0) return;
  P.hp = Math.max(0, P.hp - n);
  P.inv = 0.8;
  shake = 4;
  hitstop = 0.06;
  pops.push({ x: P.x, y: P.y - 34, t: 0, v: Math.round(n), col, sh: "#c03a5a" });
  burst(P.x, P.y - 12, ["#ff7ad0", "#ffffff"], 10, 120);
  if (P.hp <= 0) {
    P.hp = 100;
    P.x = world.spawn.x;
    P.y = world.spawn.y;
    P.vx = P.vy = 0;
    P.fallTop = P.y;
    foes.length = 0;
  }
}

let shake = 0;
let hitstop = 0;
let castT = 0.6;

function step(dt: number) {
  time += dt;
  shake = Math.max(0, shake - dt * 20);
  if (hitstop > 0) {
    hitstop -= dt;
    return;
  }
  const left = keys.has("ArrowLeft");
  const right = keys.has("ArrowRight");
  const down = keys.has("ArrowDown");
  const ix = (right ? 1 : 0) - (left ? 1 : 0);
  jumpBuf = Math.max(0, jumpBuf - dt);
  dashQ = Math.max(0, dashQ - dt);
  P.dashCd = Math.max(0, P.dashCd - dt);
  P.inv = Math.max(0, P.inv - dt);
  P.dropT = Math.max(0, P.dropT - dt);
  P.land = Math.max(0, P.land - dt);
  if (ix !== 0) P.face = ix;

  // Dash: a quick horizontal burst that ignores gravity and makes you untouchable
  if (dashQ > 0 && P.dashCd <= 0) {
    dashQ = 0;
    P.dashT = T.dashTime;
    P.dashCd = T.dashCd;
    P.vx = P.face * T.dash;
    P.vy = 0;
    P.fallTop = P.y;
    burst(P.x - P.face * 10, P.y - 10, ["#ffd9f0", "#ff7ad0"], 8, 90, 0);
  }
  if (P.dashT > 0) {
    P.dashT -= dt;
    if (Math.random() < dt * 60) trail.push({ x: P.x, y: P.y, face: P.face, frame: ART.dash[0], t: 0.25 });
  } else {
    const target = ix * T.run;
    const acc = ix !== 0 ? (P.ground ? T.accel : T.airAccel) : P.ground ? T.friction : T.airAccel * 0.4;
    const d = target - P.vx;
    P.vx += Math.sign(d) * Math.min(Math.abs(d), acc * dt);
    P.vy = Math.min(T.maxFall, P.vy + T.gravity * dt);
  }

  // Jumping: coyote time, buffering, one extra jump in the air, and drop-through
  P.coyote = P.ground ? T.coyote : Math.max(0, P.coyote - dt);
  if (jumpBuf > 0) {
    if (down && P.ground && P.plat) {
      jumpBuf = 0;
      P.dropPlat = P.plat;
      P.dropT = 0.25;
      P.ground = false;
      P.plat = null;
    } else if (P.coyote > 0) {
      jumpBuf = 0;
      P.vy = -T.jump;
      P.ground = false;
      P.coyote = 0;
      P.plat = null;
      burst(P.x, P.y, ["#d9d2df"], 5, 50);
    } else if (P.airJumps > 0) {
      jumpBuf = 0;
      P.airJumps--;
      P.vy = -T.airJump;
      P.fallTop = P.y;
      burst(P.x, P.y - 4, ["#ffd9f0", "#ff7ad0", "#ffffff"], 12, 110, 60);
    }
  }
  if (!jumpHeld && P.vy < -120 && P.dashT <= 0) P.vy *= 1 - T.jumpCut * dt * 20;

  // Move and collide
  const prevY = P.y;
  P.x = Math.max(16, Math.min(WW - 16, P.x + P.vx * dt));
  P.y += P.vy * dt;
  const ceil = world.ceilY(P.x) + 20;
  if (P.y - 18 < ceil) {
    P.y = ceil + 18;
    if (P.vy < 0) P.vy = 0;
  }
  if (P.ground) {
    const still = P.plat ? world.platAt(P.x, P.plat.y) : null;
    const fy = world.floorY(P.x);
    if (P.plat && !still) {
      P.ground = false;
      P.plat = null;
      P.fallTop = P.y;
    } else if (P.vy >= 0) {
      // Standing: stay glued to the platform or floor
      P.y = P.plat ? P.plat.y : fy;
      P.vy = 0;
    }
  }
  if (!P.ground && P.vy >= 0) {
    const ignore = P.dropT > 0 ? P.dropPlat : null;
    const land = world.landing(P.x, prevY, P.y, ignore);
    const fy = world.floorY(P.x);
    if (land || P.y >= fy) {
      P.y = land ? land.y : fy;
      const fell = P.y - P.fallTop;
      if (fell > T.safeFall) hurt((fell - T.safeFall) * T.fallDmg, "#ffb040");
      if (fell > 40) {
        burst(P.x, P.y, ["#d9d2df", "#a399b2"], Math.min(14, 4 + fell / 30), 70);
        P.land = 0.12;
      }
      P.ground = true;
      P.plat = land;
      P.vy = 0;
      P.airJumps = 1;
    }
  }
  if (!P.ground && P.vy < 0) P.fallTop = P.y;
  if (!P.ground) P.fallTop = Math.min(P.fallTop, P.y);

  // Animation state
  const speed = Math.abs(P.vx);
  P.pose = P.dashT > 0 ? "dash" : !P.ground ? (P.vy < 0 ? "jump" : "fall") : speed > 20 ? "run" : "idle";
  P.anim += dt * (P.pose === "run" ? 4 + speed / 22 : 4);

  // Enemies
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = Math.max(0.35, 1.6 - time * 0.01);
    if (foes.length < 40) spawnFoe();
  }
  for (const f of foes) {
    f.flash = Math.max(0, f.flash - dt);
    f.ph += dt;
    const dx = P.x - f.x;
    const dy = P.y - 14 - f.y;
    const d = Math.hypot(dx, dy) || 1;
    if (f.kind === "wisp") {
      f.vx += ((dx / d) * 60 - f.vx) * dt * 2;
      f.vy += ((dy / d) * 60 + Math.sin(f.ph * 3) * 30 - f.vy) * dt * 2;
    } else if (f.kind === "moth") {
      f.vx += ((dx / d) * 85 + Math.cos(f.ph * 5) * 70 - f.vx) * dt * 3;
      f.vy += ((dy / d) * 85 + Math.sin(f.ph * 7) * 90 - f.vy) * dt * 3;
    } else if (f.plat) {
      const onSame = P.plat === f.plat;
      if (onSame) f.dir = Math.sign(dx) || f.dir;
      f.vx = f.dir * (onSame ? 70 : 38);
      if (f.x < f.plat.x0 + 6) f.dir = 1;
      if (f.x > f.plat.x1 - 6) f.dir = -1;
      f.vy = 0;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.y < world.ceilY(f.x) + 24) f.y = world.ceilY(f.x) + 24;
    const touch = f.kind === "crawler" ? Math.abs(dx) < 16 && Math.abs(P.y - f.y) < 14 : d < 15;
    if (touch && P.dashT <= 0) hurt(f.kind === "crawler" ? 12 : 8);
  }

  // Auto-cast: star bolts fly from the charm to the nearest creature
  castT -= dt;
  if (castT <= 0) {
    let best: Foe | null = null;
    let bd = 260;
    for (const f of foes) {
      const d = Math.hypot(f.x - P.x, f.y - (P.y - 14));
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    castT = best ? 0.42 : 0.1;
    if (best) {
      const ox = P.x + P.face * (CAT_CHARM.x - 29);
      const oy = P.y - 38 + CAT_CHARM.y;
      const a = Math.atan2(best.y - oy, best.x - ox);
      bolts.push({ x: ox, y: oy, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, life: 1.2, target: best });
      burst(ox, oy, ["#ffd9f0", "#ffffff"], 4, 50, 0);
    }
  }
  for (const b of bolts) {
    b.life -= dt;
    if (b.target && b.target.hp > 0) {
      const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
      const cur = Math.atan2(b.vy, b.vx);
      let diff = want - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const na = cur + Math.max(-7 * dt, Math.min(7 * dt, diff));
      b.vx = Math.cos(na) * 330;
      b.vy = Math.sin(na) * 330;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (Math.random() < dt * 50) sparks.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.35, max: 0.35, col: Math.random() < 0.5 ? "#ff7ad0" : "#ffd9f0", g: 0 });
    for (const f of foes) {
      if (f.hp <= 0 || Math.hypot(f.x - b.x, f.y - b.y) > 11) continue;
      f.hp -= 1;
      f.flash = 0.08;
      f.vx += b.vx * 0.25;
      f.vy += b.vy * 0.25;
      b.life = 0;
      pops.push({ x: f.x, y: f.y - 14, t: 0, v: 1, col: "#ffffff", sh: "#c8c0d8" });
      burst(b.x, b.y, ["#ff7ad0", "#ffd9f0", "#ffffff"], 6, 90, 0);
      if (f.hp <= 0) {
        P.kills++;
        burst(f.x, f.y, f.kind === "moth" ? ["#e0dae8", "#ffffff", "#ff7ad0"] : ["#3a2a52", "#5a4280", "#ffe27a"], 16, 130, 80);
      }
      break;
    }
  }
  for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].life <= 0) bolts.splice(i, 1);
  for (let i = foes.length - 1; i >= 0; i--) if (foes[i].hp <= 0 || Math.abs(foes[i].x - P.x) > VW * 1.5) foes.splice(i, 1);
  for (const s of sparks) {
    s.life -= dt;
    s.vy += s.g * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 1 - dt * 3;
  }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
  for (const p of pops) p.t += dt;
  for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 0.8) pops.splice(i, 1);
  for (const t of trail) t.t -= dt;
  for (let i = trail.length - 1; i >= 0; i--) if (trail[i].t <= 0) trail.splice(i, 1);
}

// ---------- Camera ----------
const cam = { x: P.x, y: P.y };
function updateCam(dt: number) {
  const tx = P.x + P.face * 40 + P.vx * 0.15;
  const ty = P.y - 30 + Math.max(0, P.vy) * 0.12;
  cam.x += (tx - cam.x) * Math.min(1, dt * 5);
  cam.y += (ty - cam.y) * Math.min(1, dt * (P.vy > 300 ? 9 : 4));
  cam.x = Math.max(VW / 2, Math.min(WW - VW / 2, cam.x));
  cam.y = Math.max(VH / 2, Math.min(WH - VH / 2, cam.y));
}

// ---------- Drawing ----------
const hpEl = document.querySelector<HTMLElement>(".hp i")!;
const hpTx = document.querySelector<HTMLElement>(".hp span")!;
const killsEl = document.querySelector<HTMLElement>(".kills b")!;
const dashEl = document.querySelector<HTMLElement>(".dashbar i")!;

function draw() {
  const x = buf.x;
  const sx = Math.round(cam.x - VW / 2 + (Math.random() - 0.5) * shake);
  const sy = Math.round(cam.y - VH / 2 + (Math.random() - 0.5) * shake);
  const layer = (img: HTMLCanvasElement, p: number, oy = 0) => x.drawImage(img, -Math.round(sx * p), -Math.round(sy * p) + oy);

  // Sky and stars
  layer(world.sky, PARALLAX.sky);
  for (const s of world.stars) {
    const px = Math.round(s.x - sx * PARALLAX.sky);
    const py = Math.round(s.y - sy * PARALLAX.sky);
    if (px < -3 || py < -3 || px > VW + 3 || py > VH + 3) continue;
    const tw = Math.sin(time * 2 + s.ph);
    if (tw < -0.85) continue;
    x.fillStyle = s.c;
    x.fillRect(px, py, 1, 1);
    if (s.big && tw > 0) {
      x.globalAlpha = 0.7;
      x.fillRect(px - 1, py, 3, 1);
      x.fillRect(px, py - 1, 1, 3);
      if (tw > 0.7) {
        x.globalAlpha = 0.35;
        x.fillRect(px - 2, py, 5, 1);
        x.fillRect(px, py - 2, 1, 5);
      }
      x.globalAlpha = 1;
    }
  }
  layer(world.far, PARALLAX.far);
  layer(world.mid, PARALLAX.mid);

  // A soft pink glow around the cat lights up the roots nearby
  x.globalCompositeOperation = "lighter";
  x.globalAlpha = 0.3;
  x.drawImage(ART.softGlow, Math.round(P.x - sx - 30), Math.round(P.y - sy - 44));
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";

  // The playable world
  x.drawImage(world.main, sx, sy, VW, VH, 0, 0, VW, VH);

  // Drifting motes
  for (const m of motes) {
    const px = Math.round(((m.x + Math.sin(time * 0.5 + m.ph) * 20 - sx) % WW + WW) % WW);
    const py = Math.round(m.y - sy - ((time * 8 * m.s) % 200));
    if (px > VW || py < 0 || py > VH) continue;
    x.fillStyle = m.s > 0.6 ? "#ffd9f0" : "#a399b2";
    x.globalAlpha = 0.5 + Math.sin(time * 3 + m.ph) * 0.3;
    x.fillRect(px, py, 1, 1);
  }
  x.globalAlpha = 1;

  // Enemies
  for (const f of foes) {
    const frames = ART[f.kind];
    const s = frames[Math.floor(f.ph * (f.kind === "moth" ? 14 : 7)) % frames.length];
    const faceLeft = f.kind === "crawler" ? f.dir < 0 : P.x < f.x;
    const img = f.flash > 0 ? (faceLeft ? s.fl : s.f) : faceLeft ? s.nl : s.n;
    const ox = Math.round(f.x - s.w / 2 - sx);
    const oy = Math.round(f.y - (f.kind === "crawler" ? s.h - 1 : s.h / 2) - sy);
    if (f.kind === "wisp") {
      x.globalCompositeOperation = "lighter";
      x.globalAlpha = 0.5;
      x.drawImage(ART.eyeGlow, ox + s.w / 2 - 6, oy + 4);
      x.globalAlpha = 1;
      x.globalCompositeOperation = "source-over";
    }
    x.drawImage(img, ox, oy);
  }

  // Dash afterimages
  for (const t of trail) {
    x.globalAlpha = t.t * 2;
    const img = t.face < 0 ? t.frame.fl : t.frame.f;
    x.drawImage(img, Math.round(t.x - t.frame.w / 2 - sx), Math.round(t.y - t.frame.h + 2 - sy));
  }
  x.globalAlpha = 1;

  // The cat
  const frames = ART[P.pose];
  const fr = frames[Math.floor(P.anim) % frames.length];
  const blink = P.inv > 0 && Math.floor(P.inv * 16) % 2 === 0;
  if (!blink) {
    const squash = P.land > 0 ? 1 : 0;
    const img = P.face < 0 ? fr.nl : fr.n;
    x.drawImage(img, Math.round(P.x - fr.w / 2 - sx), Math.round(P.y - fr.h + 2 - sy) + squash, fr.w, fr.h - squash);
  }

  // Star bolts and sparks
  x.globalCompositeOperation = "lighter";
  for (const b of bolts) {
    x.globalAlpha = 0.65;
    x.drawImage(ART.pinkGlow, Math.round(b.x - 14 - sx), Math.round(b.y - 14 - sy));
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
  for (const b of bolts) x.drawImage(ART.bolt[Math.floor(time * 16) % 2], Math.round(b.x - 5 - sx), Math.round(b.y - 5 - sy));
  for (const s of sparks) {
    x.fillStyle = s.col;
    x.globalAlpha = Math.min(1, (s.life / s.max) * 1.6);
    const size = s.life / s.max > 0.6 ? 2 : 1;
    x.fillRect(Math.round(s.x - sx), Math.round(s.y - sy), size, size);
  }
  x.globalAlpha = 1;
  for (const p of pops) {
    const c = numberSprite(String(p.v), p.col, p.sh);
    x.globalAlpha = p.t > 0.5 ? 1 - (p.t - 0.5) / 0.3 : 1;
    x.drawImage(c, Math.round(p.x - c.width / 2 - sx), Math.round(p.y - p.t * 24 - sy));
  }
  x.globalAlpha = 1;

  // Close foreground roots frame the top of the screen
  layer(world.fg, PARALLAX.fg);

  // Vignette darkening toward the edges
  const g = x.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.6);
  g.addColorStop(0, "rgba(6,5,11,0)");
  g.addColorStop(1, "rgba(6,5,11,0.6)");
  x.fillStyle = g;
  x.fillRect(0, 0, VW, VH);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buf.c, 0, 0, VW * scale, VH * scale);

  hpEl.style.width = P.hp + "%";
  hpTx.textContent = String(Math.ceil(P.hp));
  killsEl.textContent = String(P.kills);
  dashEl.style.width = (1 - P.dashCd / T.dashCd) * 100 + "%";
}

// ---------- Loop ----------
let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= 1 / 120) {
    step(1 / 120);
    acc -= 1 / 120;
  }
  updateCam(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, { __side: { timing: { sprites: Math.round(T1 - T0), world: Math.round(T2 - T1) }, P, world, T, setPos: (x: number, y: number) => { P.x = x; P.y = y; P.vx = P.vy = 0; P.fallTop = y; cam.x = x; cam.y = y; } } });
void WH;
