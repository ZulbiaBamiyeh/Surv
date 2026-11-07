import { CFG } from "./config";
import type { Enemy, Game } from "./game";
import { OUTLINE, ROWS, Sprite, dieSprite, makeSprite, textSprite } from "./sprites";

export interface Joystick {
  active: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

function makeGroundTile(): HTMLCanvasElement {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const x = c.getContext("2d")!;
  let seed = 1234;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const px = (a: number, b: number, col: string) => {
    x.fillStyle = col;
    x.fillRect(((a % size) + size) % size, ((b % size) + size) % size, 1, 1);
  };
  x.fillStyle = "#78cc48";
  x.fillRect(0, 0, size, size);
  for (let k = 0; k < 220; k++) px((rnd() * size) | 0, (rnd() * size) | 0, "#86d654");
  for (let k = 0; k < 26; k++) {
    const a = (rnd() * size) | 0;
    const b = (rnd() * size) | 0;
    px(a, b + 1, "#4fa83a");
    px(a + 1, b, "#4fa83a");
    px(a + 2, b + 1, "#4fa83a");
  }
  const petals = ["#ffffff", "#ff5a8a", "#ffffff", "#8fd0ff"];
  for (let k = 0; k < 9; k++) {
    const a = (rnd() * size) | 0;
    const b = (rnd() * size) | 0;
    const pc = petals[k % petals.length];
    px(a - 1, b, pc);
    px(a + 1, b, pc);
    px(a, b - 1, pc);
    px(a, b + 1, pc);
    px(a, b, "#ffd23d");
  }
  return c;
}

export class Renderer {
  private spr = {
    hero: makeSprite(ROWS.hero),
    slime: makeSprite(ROWS.slime),
    king: makeSprite(ROWS.slime, { g: "#ffd23d", G: "#e09a1a", c: "#ff7a1a" }),
    skel: makeSprite(ROWS.skel),
    batA: makeSprite(ROWS.batA),
    batB: makeSprite(ROWS.batB),
    gem: makeSprite(ROWS.gem),
    bigGem: makeSprite(ROWS.gem, { x: "#ff8ad8", X: "#d050a8" }),
    fire: makeSprite(ROWS.fire),
    fire2: makeSprite(ROWS.fire2),
    crown: makeSprite(ROWS.crown),
  };
  private ground = makeGroundTile();

  draw(ctx: CanvasRenderingContext2D, g: Game, scale: number, realTime: number, joy: Joystick) {
    const vw = g.viewW;
    const vh = g.viewH;
    const p = g.player;
    const t = g.time;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const shx = g.shake > 0 ? (Math.random() * 2 - 1) * g.shake : 0;
    const shy = g.shake > 0 ? (Math.random() * 2 - 1) * g.shake : 0;
    const camX = p.x - vw / 2 + shx;
    const camY = p.y - vh / 2 + shy;
    // Snap to screen pixels (not art pixels) so motion stays smooth while sprites stay crisp.
    const R = (v: number) => Math.round(v * scale) / scale;
    const at = (s: Sprite | HTMLCanvasElement, wx: number, wy: number, w: number, h: number) =>
      ctx.drawImage(s instanceof HTMLCanvasElement ? s : s.n, R(wx - camX), R(wy - camY), w, h);

    // Ground
    const T = this.ground.width;
    const startX = Math.floor(camX / T) * T;
    const startY = Math.floor(camY / T) * T;
    for (let ty = startY; ty < camY + vh; ty += T)
      for (let tx = startX; tx < camX + vw; tx += T) ctx.drawImage(this.ground, R(tx - camX), R(ty - camY), T, T);

    // Gems
    for (const gem of g.gems) {
      const s = gem.value >= 5 ? this.spr.bigGem : this.spr.gem;
      const bob = gem.magnet ? 0 : Math.round(Math.sin(t * 4 + gem.x) * 1);
      at(s, gem.x - s.w / 2, gem.y - s.h / 2 + bob, s.w, s.h);
    }

    // Dice on the ground, with a pulsing glow so they stand out
    for (const d of g.dice) {
      const s = dieSprite(d.faces);
      const bob = Math.round(Math.sin(realTime * 5) * 1.5);
      const glow = 7 + Math.sin(realTime * 6) * 1.5;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#ffe63d";
      ctx.beginPath();
      ctx.arc(R(d.x - camX), R(d.y - camY), glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      at(s, d.x - s.w / 2, d.y - s.h / 2 - 2 + bob, s.w, s.h);
    }

    // Shadows
    ctx.fillStyle = "rgba(27,27,42,0.2)";
    for (const e of g.enemies) {
      const w = e.kind === "king" ? 18 : 8;
      if (e.kind !== "bat") ctx.fillRect(R(e.x - w / 2 - camX), R(e.y + (e.kind === "king" ? 8 : 3) - camY), w, 2);
    }
    ctx.fillRect(R(p.x - 4 - camX), R(p.y + 1 - camY), 8, 2);

    // Actors, drawn back to front
    g.enemies.sort((a, b) => a.y - b.y);
    let playerDrawn = false;
    const drawPlayer = () => {
      playerDrawn = true;
      const blinking = p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0;
      if (blinking && !g.over) return;
      const s = this.spr.hero;
      const bob = p.moving ? Math.abs(Math.sin(t * 14)) * 1.5 : Math.abs(Math.sin(t * 3)) * 0.5;
      const flash = p.inv > CFG.player.iframes - 0.08;
      ctx.drawImage(flash ? s.f : s.n, R(p.x - s.w / 2 - camX), R(p.y - s.h + 2 - bob - camY), s.w, s.h);
    };
    for (const e of g.enemies) {
      if (!playerDrawn && e.y > p.y) drawPlayer();
      this.drawEnemy(ctx, e, t, R, camX, camY);
    }
    if (!playerDrawn) drawPlayer();

    // Fireballs
    for (const s of g.shots) {
      const spr = Math.floor(realTime * 16 + s.x) % 2 ? this.spr.fire : this.spr.fire2;
      at(spr, s.x - spr.w / 2, s.y - spr.h / 2, spr.w, spr.h);
    }

    // Particles
    for (const pt of g.parts) {
      ctx.fillStyle = pt.color;
      const sz = pt.life / pt.max > 0.5 ? pt.size : 1;
      ctx.fillRect(R(pt.x - camX), R(pt.y - camY), sz, sz);
    }

    // Damage numbers: pop up, then float away
    for (const n of g.nums) {
      const pop = n.t < 0.08 ? 2 : 0;
      const img = textSprite(String(n.value), n.big ? "#ffd23d" : "#ffe63d");
      const sc = n.big ? 2 : 1;
      ctx.drawImage(img, R(n.x - (img.width * sc) / 2 - camX), R(n.y - n.t * 18 - pop - camY), img.width * sc, img.height * sc);
    }

    // Player health bar
    const hpw = 14;
    const hx = R(p.x - hpw / 2 - camX);
    const hy = R(p.y + 4 - camY);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(hx - 1, hy - 1, hpw + 2, 4);
    ctx.fillStyle = "#3a3a5c";
    ctx.fillRect(hx, hy, hpw, 2);
    ctx.fillStyle = p.hp / p.maxHp < 0.3 ? "#ffe63d" : "#ff3d4a";
    ctx.fillRect(hx, hy, Math.ceil((hpw * p.hp) / p.maxHp), 2);

    this.drawHud(ctx, g);
    if (joy.active) this.drawJoystick(ctx, joy);
  }

  private drawEnemy(
    ctx: CanvasRenderingContext2D, e: Enemy, t: number, R: (v: number) => number, camX: number, camY: number,
  ) {
    let s: Sprite;
    let y = e.y;
    let scale = 1;
    if (e.kind === "bat") {
      s = Math.floor(t * 8 + e.phase) % 2 ? this.spr.batA : this.spr.batB;
      y += Math.sin(t * 3 + e.phase) * 2 - 6;
    } else if (e.kind === "skel") {
      s = this.spr.skel;
      y -= Math.floor(t * 5 + e.phase) % 2;
    } else if (e.kind === "king") {
      s = this.spr.king;
      scale = 2;
      y -= Math.abs(Math.sin(t * 2.5 + e.phase)) * 4;
    } else {
      s = this.spr.slime;
      y -= Math.abs(Math.sin(t * 5 + e.phase)) * 4;
    }
    const w = s.w * scale;
    const h = s.h * scale;
    const dx = R(e.x - w / 2 - camX);
    const dy = R(y - h + 3 * scale - camY);
    ctx.drawImage(e.flash > 0 ? s.f : s.n, dx, dy, w, h);
    if (e.kind === "king") {
      const c = this.spr.crown;
      ctx.drawImage(c.n, R(e.x - c.w / 2 - camX), dy - c.h + 3, c.w, c.h);
      const bw = 24;
      const bx = R(e.x - bw / 2 - camX);
      const by = dy - c.h - 2;
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = "#ffd23d";
      ctx.fillRect(bx, by, Math.ceil((bw * Math.max(0, e.hp)) / e.maxHp), 2);
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, g: Game) {
    const vw = g.viewW;
    // XP bar across the top
    const barX = 4;
    const barW = vw - 8 - 26;
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(barX, 3, barW, 7);
    ctx.fillStyle = "#2a2a44";
    ctx.fillRect(barX + 1, 4, barW - 2, 5);
    ctx.fillStyle = "#3df0ff";
    ctx.fillRect(barX + 1, 4, Math.round(((barW - 2) * g.xp) / g.xpNeeded), 5);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(barX + 1, 4, Math.round(((barW - 2) * g.xp) / g.xpNeeded), 1);
    const lv = textSprite("LV" + g.level, "#ffffff");
    ctx.drawImage(lv, vw - lv.width - 3, 3);

    // Timer
    const m = Math.floor(g.time / 60);
    const sec = Math.floor(g.time % 60);
    const timer = textSprite(`${m}:${sec < 10 ? "0" : ""}${sec}`, "#ffffff");
    ctx.drawImage(timer, Math.round(vw / 2 - timer.width), 13, timer.width * 2, timer.height * 2);
  }

  private drawJoystick(ctx: CanvasRenderingContext2D, j: Joystick) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(j.ox, j.oy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(j.x, j.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
