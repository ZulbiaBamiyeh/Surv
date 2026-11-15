import { Art, FIRE_DIRS, Sprite, WorldArt, buildArt } from "./art";
import { numberSprite } from "./art/font";
import { OUTLINE } from "./art/palette";
import type { PlacedProp } from "./art/world";
import { CFG } from "./config";
import type { DamageNumber, Enemy, Flames, Game, Theme, Totem } from "./game";

export interface Joystick {
  active: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

type R = (v: number) => number;
type Drawable = { y: number; e?: Enemy; prop?: PlacedProp; player?: true; totem?: Totem; echo?: { x: number; y: number } };

const RING_COLORS: Record<Theme, [string, string, string, string]> = {
  ice: ["#ffffff", "#8fd8ff", "#50b8f0", "#2490d0"],
  fire: ["#fffbe0", "#ffe46a", "#ffa424", "#f05a1a"],
  green: ["#f0ffd0", "#c8f080", "#7ad040", "#3f8a2a"],
  toxic: ["#f0ffd0", "#c8f080", "#7ad040", "#245c22"],
  steam: ["#ffffff", "#e8f4ff", "#c0d4e8", "#90a8c0"],
  dirt: ["#f0d6a0", "#bc9a72", "#9c7656", "#4e3430"],
  void: ["#e0c8ff", "#a070ff", "#64309a", "#1a0f2e"],
};
const GROUND_RAMPS: Record<Theme, string[]> = {
  toxic: ["#0c2010", "#173d1c", "#245c22", "#3f8a2a", "#7ad040", "#c8f080"],
  fire: ["#3a0f0a", "#6e2410", "#b0441a", "#e0702a", "#ffc040", "#fff0a0"],
  green: ["#0c2010", "#16401c", "#23662a", "#3f9a36", "#8ad850", "#d8ff90"],
  ice: ["#16304a", "#2a5a80", "#4a8ac0", "#8fd8ff", "#d0f0ff", "#ffffff"],
  steam: ["#5a6a7a", "#7a8a9a", "#a0b0c0", "#c8d4e0", "#e8f0f8", "#ffffff"],
  dirt: ["#2e1c1c", "#4e3430", "#7a5440", "#9c7656", "#bc9a72", "#d8c0a0"],
  void: ["#0a0614", "#1a0f2e", "#3a1d5c", "#64309a", "#a070ff", "#e0c8ff"],
};

export class Renderer {
  readonly art: Art = buildArt();
  private world = new WorldArt();
  private frame = 0;
  private vignette: HTMLCanvasElement | null = null;
  private redVignette: HTMLCanvasElement | null = null;
  private vignetteKey = "";

  draw(ctx: CanvasRenderingContext2D, g: Game, scale: number, realTime: number, joy: Joystick) {
    this.frame++;
    const A = this.art;
    const vw = g.viewW;
    const vh = g.viewH;
    const p = g.player;
    const t = g.time;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const shx = g.shake > 0 ? (Math.random() * 2 - 1) * g.shake : 0;
    const shy = g.shake > 0 ? (Math.random() * 2 - 1) * g.shake : 0;
    const camX = p.x - vw / 2 + shx;
    const camY = p.y - 8 - vh / 2 + shy;
    // Snap to screen pixels (not art pixels): motion stays smooth while sprites stay crisp.
    const R: R = (v: number) => Math.round(v * scale) / scale;
    const img = (c: HTMLCanvasElement, wx: number, wy: number, w = c.width, h = c.height) =>
      ctx.drawImage(c, R(wx - camX), R(wy - camY), w, h);
    const glow = (c: HTMLCanvasElement, x: number, y: number, k: number, alpha: number) => {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      img(c, x - (c.width * k) / 2, y - (c.height * k) / 2, c.width * k, c.height * k);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    // ---------- Ground ----------
    const C = this.world.size;
    const cx0 = Math.floor(camX / C);
    const cy0 = Math.floor(camY / C);
    const cx1 = Math.floor((camX + vw) / C);
    const cy1 = Math.floor((camY + vh) / C);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) img(this.world.get(cx, cy, this.frame).canvas, cx * C, cy * C);
    this.world.prefetch(cx0, cy0, cx1, cy1, this.frame);

    // Props near the view (tall trees can reach in from below)
    const props: PlacedProp[] = [];
    for (let cy = Math.floor((camY - 8) / C); cy <= Math.floor((camY + vh + 70) / C); cy++)
      for (let cx = Math.floor((camX - 40) / C); cx <= Math.floor((camX + vw + 40) / C); cx++)
        for (const pr of this.world.get(cx, cy, this.frame).props) {
          if (pr.x < camX - 40 || pr.x > camX + vw + 40 || pr.y < camY - 8 || pr.y > camY + vh + 70) continue;
          props.push(pr);
        }

    // Only trees are tall enough to stand in front of characters; small props are part of the ground.
    ctx.globalAlpha = 0.28;
    for (const pr of props) if (pr.art.shadow) this.shadow(ctx, pr.x, pr.y, pr.art.shadow, R, camX, camY);
    ctx.globalAlpha = 1;
    for (const pr of props) if (!pr.art.tall) img(pr.art.sprite.n, pr.x - pr.art.ax, pr.y - pr.art.ay);

    // ---------- Things on the ground ----------
    for (const f of g.flames) this.drawGround(ctx, f, R, camX, camY, realTime);
    for (const tr of g.trails) this.drawTrail(ctx, tr, g.time, R, camX, camY, realTime);
    for (const h of g.holes) this.drawHole(ctx, h.x, h.y, h.r, h.t, h.dur, R, camX, camY, realTime);
    // Meteor target shadows grow as the rock falls
    for (const m of g.meteors) {
      const k = Math.min(1, m.t / m.fall);
      ctx.globalAlpha = 0.25 + k * 0.3;
      ctx.fillStyle = m.kind === "hail" ? "#2a4a6a" : "#3a0f0a";
      ctx.beginPath();
      ctx.ellipse(R(m.x - camX), R(m.y - camY), m.r * (0.3 + k * 0.7), m.r * 0.8 * (0.3 + k * 0.7), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.6 * k;
      ctx.strokeStyle = m.kind === "hail" ? "#cfefff" : "#ffa424";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = 0.28;
    for (const e of g.enemies) this.shadow(ctx, e.x, e.y, shadowW(e), R, camX, camY);
    for (const tt of g.totems) this.shadow(ctx, tt.x, tt.y, 14, R, camX, camY);
    if (p.under <= 0) this.shadow(ctx, p.x, p.y, 14, R, camX, camY);
    ctx.globalAlpha = 1;

    // ---------- Pickups ----------
    for (const gem of g.gems) {
      const s = gem.value >= 5 ? A.bigGem : A.gem;
      const bob = gem.magnet ? 0 : Math.round(Math.sin(t * 3 + gem.x * 0.7) * 1.2);
      img(s.n, gem.x - s.w / 2, gem.y - s.h + 2 + bob);
      if (((realTime * 0.8 + gem.x * 0.013 + gem.y * 0.007) % 1) < 0.06) img(A.spark[0], gem.x - 1, gem.y - s.h - 1);
    }
    for (const d of g.loot) {
      const bob = Math.round(Math.sin(realTime * 4 + d.x) * 2);
      const s = d.kind === "scroll" ? A.lootScroll : d.kind === "magnet" ? A.magnet : d.kind === "carrot" ? A.carrot : A.chest;
      const gl = d.kind === "scroll" ? A.lootGlow : d.kind === "magnet" ? A.zapGlow : d.kind === "carrot" ? A.fireGlow : A.goldGlow;
      glow(gl, d.x, d.y - s.h / 2 - 2 + bob, 1, 0.55 + Math.sin(realTime * 6) * 0.25);
      img(s.n, d.x - s.w / 2, d.y - s.h - 2 + bob);
    }

    // ---------- Death puffs, under the living so they never hide the wizard ----------
    for (const f of g.fx) {
      if (f.kind !== "poof") continue;
      const k = f.t / f.dur;
      const fr = A.poof[Math.min(A.poof.length - 1, Math.floor(k * A.poof.length))];
      const sc = Math.max(1, Math.round(f.scale));
      ctx.globalAlpha = (k > 0.5 ? 1 - (k - 0.5) / 0.5 : 1) * 0.8;
      img(fr.n, f.x - (fr.w * sc) / 2, f.y - (fr.h * sc) / 2, fr.w * sc, fr.h * sc);
    }
    ctx.globalAlpha = 1;

    // ---------- Characters and props, back to front ----------
    const list: Drawable[] = [];
    for (const pr of props) if (pr.art.tall) list.push({ y: pr.y, prop: pr });
    for (const e of g.enemies) list.push({ y: e.y, e });
    for (const tt of g.totems) list.push({ y: tt.y, totem: tt });
    for (const ec of g.echoes) list.push({ y: ec.y, echo: ec });
    list.push({ y: p.y, player: true });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) {
      if (d.player) this.drawPlayer(ctx, g, R, camX, camY, realTime);
      else if (d.e) this.drawEnemy(ctx, d.e, g, R, camX, camY, realTime);
      else if (d.totem) this.drawTotem(ctx, d.totem, g, R, camX, camY, realTime);
      else if (d.echo) this.drawEcho(ctx, d.echo, g, R, camX, camY, realTime);
      else if (d.prop) {
        const pr = d.prop;
        const s = pr.art.sprite;
        const x = pr.x - pr.art.ax;
        const y = pr.y - pr.art.ay;
        // See-through when the player walks behind a tree
        const behind = pr.art.tall && p.y < pr.y && p.y > y + 6 && Math.abs(p.x - pr.x) < s.w / 2;
        if (behind) ctx.globalAlpha = 0.55;
        img(s.n, x, y);
        ctx.globalAlpha = 1;
      }
    }

    // ---------- Projectiles ----------
    for (const s of g.shots) {
      if (s.kind === "fire" || s.kind === "orb") glow(s.green ? A.greenGlow : A.fireGlow, s.x, s.y, s.kind === "orb" ? 2 : 1, 0.6);
      else if (s.kind === "spore") glow(A.greenGlow, s.x, s.y, 0.7, 0.6);
    }
    for (const s of g.shots) {
      const a = Math.atan2(s.vy, s.vx);
      if (s.kind === "shard") {
        // A short spike of ice pointing where it flies
        const len = 7;
        ctx.strokeStyle = "#2490d0";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(R(s.x - Math.cos(a) * len - camX), R(s.y - Math.sin(a) * len - camY));
        ctx.lineTo(R(s.x - camX), R(s.y - camY));
        ctx.stroke();
        ctx.strokeStyle = "#e8f8ff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (s.kind === "glob") {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#1a1430";
        ctx.fillRect(R(s.x - 2 - camX), R(s.y + 6 - camY), 4, 1);
        ctx.globalAlpha = 1;
        this.ball(ctx, s.x, s.y - 4 - Math.sin(Math.min(1, s.life * 2) * Math.PI) * 6, 3, "#c8f080", "#3f8a2a", R, camX, camY);
      } else if (s.kind === "snow") {
        this.ball(ctx, s.x, s.y, 2.5, "#ffffff", "#9cb0d0", R, camX, camY);
      } else if (s.kind === "spore") {
        this.ball(ctx, s.x, s.y, 2.5, "#c8f080", "#3f8a2a", R, camX, camY);
      } else if (s.kind === "carrot") {
        const c = A.carrot;
        ctx.save();
        ctx.translate(R(s.x - camX), R(s.y - camY));
        ctx.rotate(a + Math.PI * 0.75);
        ctx.drawImage(c.n, -c.w / 2, -c.h / 2);
        ctx.restore();
      } else {
        const dir = ((Math.round((a / (Math.PI * 2)) * FIRE_DIRS) % FIRE_DIRS) + FIRE_DIRS) % FIRE_DIRS;
        let fr = A.fire[dir][Math.floor(realTime * 14 + s.x * 0.05) % 3].n;
        if (s.green) fr = greenFire(fr);
        const k = s.kind === "orb" ? 2 : 1;
        img(fr, s.x - (fr.width * k) / 2, s.y - (fr.height * k) / 2, fr.width * k, fr.height * k);
      }
    }
    for (const s of g.spits) {
      glow(A.greenGlow, s.x, s.y, 0.6, 0.45);
      this.ball(ctx, s.x, s.y, 3, "#d8a0ff", "#64309a", R, camX, camY);
      ctx.fillStyle = "#c8f080";
      ctx.fillRect(R(s.x - 1 - camX), R(s.y - 1 - camY), 1, 1);
    }

    // ---------- Orbiters ----------
    for (const s of g.suns) glow(A.fireGlow, s.x, s.y, 1.2, 0.55);
    for (const m of g.moons) glow(A.moonGlow, m.x, m.y, m.big ? 1.6 : 1, 0.45);
    for (const s of g.suns) img(A.sun.n, s.x - A.sun.w / 2, s.y - A.sun.h / 2);
    for (const m of g.moons) {
      const s = m.big ? A.bigMoon : A.moon;
      img(s.n, m.x - s.w / 2, m.y - s.h / 2);
    }

    // ---------- Rings ----------
    for (const n of g.novas) {
      const k = Math.min(1, n.t / 0.35);
      const ring = this.ringSprite(Math.max(3, Math.round(n.r * k)), n.theme);
      ctx.globalAlpha = n.t > 0.35 ? Math.max(0, 1 - (n.t - 0.35) / 0.25) : 1;
      img(ring, n.x - ring.width / 2, n.y - ring.height / 2);
      ctx.globalAlpha = 1;
    }

    // ---------- Falling meteors and hail ----------
    for (const m of g.meteors) {
      const k = Math.min(1, m.t / m.fall);
      const h = (1 - k) * (m.kind === "giant" ? 260 : 150);
      const x = m.x + (1 - k) * 60;
      const y = m.y - h;
      if (m.kind === "hail") {
        this.ball(ctx, m.x, y + 40 * (1 - k), 2, "#ffffff", "#8fd8ff", R, camX, camY);
        continue;
      }
      const dir = Math.round(((Math.atan2(150, -60) / (Math.PI * 2)) * FIRE_DIRS + FIRE_DIRS) % FIRE_DIRS);
      const fr = A.fire[dir][Math.floor(realTime * 14) % 3].n;
      const sc = m.kind === "giant" ? 5 : 2;
      glow(A.fireGlow, x, y, sc, 0.7);
      img(fr, x - (fr.width * sc) / 2, y - (fr.height * sc) / 2, fr.width * sc, fr.height * sc);
    }

    // ---------- Lightning ----------
    if (g.bolts.length) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const b of g.bolts) {
        const path = this.boltPath(b.pts, b.t);
        const fade = Math.max(0, 1 - b.t / 0.2);
        for (const [w, col] of [[6, `rgba(255,190,60,${0.3 * fade})`], [3, `rgba(255,240,140,${0.95 * fade})`], [1.2, `rgba(255,255,255,${fade})`]] as const) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          path.forEach(([x, y], i) => (i ? ctx.lineTo(R(x - camX), R(y - camY)) : ctx.moveTo(R(x - camX), R(y - camY))));
          ctx.stroke();
        }
        for (const [x, y] of b.pts.slice(1)) img(A.zapGlow, x - A.zapGlow.width / 2, y - A.zapGlow.height / 2);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // ---------- Particles and effects ----------
    for (const pt of g.parts) {
      ctx.fillStyle = pt.color;
      const sz = pt.life / pt.max > 0.5 ? pt.size : 1;
      ctx.fillRect(R(pt.x - camX), R(pt.y - camY), sz, sz);
    }
    for (const f of g.fx) {
      const k = f.t / f.dur;
      if (f.kind === "poof" || f.kind === "flash") continue;
      if (f.kind === "spark") {
        img(A.spark[Math.min(2, Math.floor(k * 3))], f.x - 2, f.y - 2);
      } else if (f.kind === "blast") {
        const r = (8 + k * 22) * f.scale;
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.fillStyle = f.color ?? "#ffa424";
        ctx.beginPath();
        ctx.arc(R(f.x - camX), R(f.y - camY), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.color ? "#ffffff" : "#ffe46a";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "dust") {
        // A swirly purple cloud
        for (let i = 0; i < 9; i++) {
          const a = i * 0.7 + k * 3;
          const r = (10 + k * 30) * f.scale * (0.5 + (i % 3) * 0.25);
          ctx.globalAlpha = (1 - k) * 0.5;
          ctx.fillStyle = i % 2 ? "#c8a0ff" : "#ffffff";
          ctx.beginPath();
          ctx.arc(R(f.x + Math.cos(a) * r - camX), R(f.y + Math.sin(a) * r * 0.6 - camY), 4 + (1 - k) * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (f.kind === "heart") {
        ctx.globalAlpha = 1 - k;
        this.heart(ctx, f.x, f.y - k * 14, R, camX, camY);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.kind === "heal" ? "#b8f080" : "#c6fbff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(R(f.x - camX), R(f.y - camY), 6 + k * 30 * f.scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ---------- Damage numbers: pop up, then float away ----------
    for (const n of g.nums) {
      const pop = n.t < 0.06 ? 3 : n.t < 0.12 ? 1 : 0;
      const [col, sh] = NUMBER_COLORS[n.style];
      const c = numberSprite(String(n.value), col, sh);
      const sc = n.style === "big" || n.style === "heal" || n.style === "max" ? 2 : 1;
      ctx.globalAlpha = n.t > 0.5 ? 1 - (n.t - 0.5) / 0.2 : 1;
      img(c, n.x - (c.width * sc) / 2, n.y - n.t * 22 - pop, c.width * sc, c.height * sc);
      ctx.globalAlpha = 1;
    }

    // ---------- Player health bar ----------
    const frac = p.hp / p.maxHp;
    if (p.under <= 0) {
      const hpw = 16;
      const hx = R(p.x - hpw / 2 - camX);
      const hy = R(p.y + 5 - camY);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(hx - 1, hy - 1, hpw + 2, 4);
      ctx.fillStyle = "#3a1530";
      ctx.fillRect(hx, hy, hpw, 2);
      ctx.fillStyle = frac < 0.3 ? "#ffa424" : "#e8304a";
      ctx.fillRect(hx, hy, Math.ceil(hpw * frac), 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(hx, hy, Math.ceil(hpw * frac), 1);
    }

    // ---------- Screen-wide moods ----------
    const tint = (color: string, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    };
    if (g.weather === "blizzard") {
      tint("#d8f0ff", 0.16);
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 70; i++) {
        const x = (i * 97.3 + realTime * 60 * (1 + (i % 3) * 0.3)) % vw;
        const y = (i * 53.9 + realTime * 40 * (1 + (i % 4) * 0.2)) % vh;
        ctx.fillRect(Math.round(x), Math.round(y), 1 + (i % 2), 1 + (i % 2));
      }
    } else if (g.weather === "thunder") tint("#1a2a5a", 0.22);
    else if (g.weather === "heat") tint("#ff7a1a", 0.12 + Math.sin(realTime * 3) * 0.03);
    if (g.fullMoon) tint("#c8d0ff", 0.08);
    if (g.midnight > 0) tint("#3a1d5c", 0.28);
    if (g.timeStop > 0) tint("#a8a0d0", 0.28);
    if (g.dark > 0) tint("#0a0614", Math.min(0.55, g.dark * 0.4));
    for (const f of g.fx) if (f.kind === "flash") tint(f.color ?? "#ffffff", (1 - f.t / f.dur) * 0.4);

    // ---------- Arrows toward scrolls and chests off screen ----------
    for (const d of g.loot) {
      if (d.kind !== "scroll" && d.kind !== "chest") continue;
      const sx = d.x - camX;
      const sy = d.y - 10 - camY;
      if (sx > 6 && sx < vw - 6 && sy > 6 && sy < vh - 6) continue;
      const a = Math.atan2(sy - vh / 2, sx - vw / 2);
      const k = Math.min((vw / 2 - 14) / Math.abs(Math.cos(a) || 1e-6), (vh / 2 - 30) / Math.abs(Math.sin(a) || 1e-6));
      const ax = vw / 2 + Math.cos(a) * k;
      const ay = vh / 2 + Math.sin(a) * k;
      ctx.save();
      ctx.translate(Math.round(ax), Math.round(ay));
      ctx.rotate(a);
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -6);
      ctx.lineTo(-5, 6);
      ctx.fill();
      ctx.fillStyle = d.kind === "scroll" ? "#ffd0f0" : "#ffd640";
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-4, 4);
      ctx.fill();
      ctx.restore();
    }

    this.drawVignette(ctx, vw, vh, frac, realTime);
    if (joy.active) this.drawJoystick(ctx, joy);
  }

  private ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string, R: R, camX: number, camY: number) {
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(R(x - camX), R(y - camY), r + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(R(x - camX), R(y - camY), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(R(x - 0.6 - camX), R(y - 0.6 - camY), r * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }

  private heart(ctx: CanvasRenderingContext2D, x: number, y: number, R: R, camX: number, camY: number) {
    const rows = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
    const ox = R(x - 3 - camX);
    const oy = R(y - 3 - camY);
    rows.forEach((r, j) =>
      [...r].forEach((ch, i) => {
        if (ch === ".") return;
        ctx.fillStyle = j === 1 && i === 1 ? "#ffffff" : "#ff80c0";
        ctx.fillRect(ox + i, oy + j, 1, 1);
      }),
    );
  }

  private rings = new Map<string, HTMLCanvasElement>();
  /** A crisp pixel ring, cached by radius and color theme. */
  private ringSprite(r: number, theme: Theme): HTMLCanvasElement {
    const key = theme + r;
    let c = this.rings.get(key);
    if (c) return c;
    const [c0, c1, c2, c3] = RING_COLORS[theme];
    const ry = Math.round(r * 0.8);
    c = document.createElement("canvas");
    c.width = r * 2 + 7;
    c.height = ry * 2 + 7;
    const x = c.getContext("2d")!;
    const cx = r + 3.5;
    const cy = ry + 3.5;
    for (let j = 0; j < c.height; j++)
      for (let i = 0; i < c.width; i++) {
        const d = Math.hypot((i + 0.5 - cx) / r, (j + 0.5 - cy) / ry);
        const px = (1 - d) * r;
        let col = "";
        if (px >= -1 && px < 1.2) col = c0;
        else if (px >= 1.2 && px < 3.5) col = c1;
        else if (px >= 3.5 && px < 5) col = c2;
        else if (px >= 5 && px < 8 && (i + j) % 2 === 0) col = c3;
        if (!col) continue;
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    if (this.rings.size > 300) this.rings.clear();
    this.rings.set(key, c);
    return c;
  }

  private bolts = new WeakMap<object, [number, number][]>();
  /** A jagged lightning path through the hit points, re-jittered a few times while it lives. */
  private boltPath(pts: [number, number][], t: number): [number, number][] {
    const step = Math.floor(t / 0.05);
    const cached = this.bolts.get(pts);
    if (cached && (cached as unknown as { step: number }).step === step) return cached;
    const out: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = -(y1 - y0) / len;
      const ny = (x1 - x0) / len;
      const segs = Math.max(2, Math.round(len / 10));
      for (let k = 1; k < segs; k++) {
        const off = (Math.random() - 0.5) * 9;
        out.push([x0 + ((x1 - x0) * k) / segs + nx * off, y0 + ((y1 - y0) * k) / segs + ny * off]);
      }
      out.push(pts[i]);
    }
    (out as unknown as { step: number }).step = step;
    this.bolts.set(pts, out);
    return out;
  }

  private blobs = new Map<string, HTMLCanvasElement>();
  /** Puddles, fire patches and icy ground: an organic blob, cached by size and theme. */
  private drawGround(ctx: CanvasRenderingContext2D, f: Flames, R: R, camX: number, camY: number, realTime: number) {
    const r = Math.round(f.r);
    const key = f.theme + r;
    let c = this.blobs.get(key);
    if (!c) {
      const ry = Math.round(r * 0.7);
      c = document.createElement("canvas");
      c.width = r * 2 + 4;
      c.height = ry * 2 + 4;
      const x = c.getContext("2d")!;
      const ramp = GROUND_RAMPS[f.theme];
      const lobes = [[0, 0, 0.8], [-0.42, 0.12, 0.55], [0.45, -0.1, 0.55], [0.1, 0.38, 0.5], [-0.15, -0.35, 0.5]];
      const field = (u: number, v: number) => Math.max(...lobes.map(([lx, ly, lr]) => 1 - Math.hypot(u - lx, v - ly) / lr));
      for (let j = 0; j < c.height; j++)
        for (let i = 0; i < c.width; i++) {
          const u = (i + 0.5 - c.width / 2) / r;
          const v = (j + 0.5 - c.height / 2) / ry;
          const fv = field(u, v);
          if (fv <= 0) continue;
          const shine = u < -0.15 && v < -0.1 && fv > 0.35 && fv < 0.5;
          x.fillStyle = fv < 0.08 ? ramp[0] : fv < 0.18 ? ramp[1] : shine ? ramp[4] : fv > 0.55 ? ramp[3] : ramp[2];
          x.fillRect(i, j, 1, 1);
        }
      if (this.blobs.size > 200) this.blobs.clear();
      this.blobs.set(key, c);
    }
    const life = f.t / f.dur;
    const sc = life < 0.08 ? life / 0.08 : 1;
    const fiery = f.theme === "fire" || f.theme === "green";
    ctx.globalAlpha = (life > 0.8 ? (1 - life) / 0.2 : 1) * (fiery ? 0.55 : 0.75);
    const w = c.width * sc;
    const h = c.height * sc;
    ctx.drawImage(c, R(f.x - w / 2 - camX), R(f.y - h / 2 - camY), w, h);
    // Bubbles in puddles, licks of flame on fire, sparkles on ice
    const ramp = GROUND_RAMPS[f.theme];
    for (let i = 0; i < 4; i++) {
      const ph = (realTime * (fiery ? 2.5 : 1.3) + i * 0.27 + f.x * 0.01) % 1;
      const a = i * 2.1 + f.y;
      const bx = f.x + Math.cos(a) * f.r * 0.5;
      const by = f.y + Math.sin(a) * f.r * 0.3 - ph * (fiery ? 8 : 3);
      ctx.fillStyle = ph < 0.8 ? ramp[5] : ramp[4];
      const sz = ph < 0.6 ? 2 : 1;
      ctx.fillRect(R(bx - camX), R(by - camY), sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  /** A path of fire or poison: thick near you, thinning and fading behind. */
  private drawTrail(ctx: CanvasRenderingContext2D, tr: { theme: Theme; pts: { x: number; y: number; t: number }[] }, now: number, R: R, camX: number, camY: number, realTime: number) {
    const pts = tr.pts;
    if (pts.length < 2) return;
    const fiery = tr.theme === "fire" || tr.theme === "green";
    const cols = tr.theme === "toxic" ? ["#173d1c", "#3f8a2a", "#9ae04a"] : tr.theme === "green" ? ["#123a14", "#3f9a36", "#b8f070"] : ["#6e1a0a", "#e0501a", "#ffb030"];
    ctx.lineCap = "round";
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const age = (now - b.t) / 2.5;
        const life = Math.max(0, 1 - age);
        const flick = fiery ? 0.8 + Math.sin(realTime * 18 + i * 1.7) * 0.2 : 1;
        ctx.globalAlpha = Math.min(1, life * 1.6) * (layer === 0 ? 0.7 : layer === 1 ? 0.85 : 0.9);
        ctx.strokeStyle = cols[layer];
        ctx.lineWidth = Math.max(1, [8, 5, 1.5][layer] * (0.4 + life * 0.6) * flick);
        ctx.beginPath();
        ctx.moveTo(R(a.x - camX), R(a.y - camY));
        ctx.lineTo(R(b.x - camX), R(b.y - camY));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // Licks of flame or bubbles rising off the path
    const lick = fiery ? (tr.theme === "green" ? ["#e0ffb0", "#8ad850", "#3f9a36"] : ["#fff0a0", "#ffa424", "#e0501a"]) : cols;
    for (let i = 0; i < pts.length; i++) {
      for (let k = 0; k < (fiery ? 2 : 1); k++) {
        if (!fiery && i % 3) continue;
        const pt = pts[i];
        const ph = (realTime * (fiery ? 2.8 : 2.2) + i * 0.37 + k * 0.5) % 1;
        const life = Math.max(0, 1 - (now - pt.t) / 2.5);
        ctx.globalAlpha = (1 - ph) * life;
        ctx.fillStyle = lick[ph < 0.3 ? 0 : ph < 0.65 ? 1 : 2];
        const sz = ph < 0.4 ? 2 : 1;
        const fx = R(pt.x + Math.sin(i * 3.1 + k * 2) * 3.5 - camX);
        const fy = R(pt.y - ph * (fiery ? 9 + life * 5 : 4) - camY);
        // A little tongue of flame: wider at the bottom
        ctx.fillRect(fx, fy, sz, sz + (fiery && ph < 0.5 ? 2 : 0));
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawHole(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, dur: number, R: R, camX: number, camY: number, realTime: number) {
    const grow = Math.min(1, t / 0.3) * (t > dur - 0.2 ? Math.max(0, (dur - t) / 0.2) : 1);
    const rr = r * 0.32 * grow;
    const cx = R(x - camX);
    const cy = R(y - camY);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#64309a";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr * 2.4, rr * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0a0614";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr, rr * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    // Swirling arms
    ctx.strokeStyle = "#a070ff";
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let s = 0; s <= 12; s++) {
        const a = realTime * 5 + (k * Math.PI * 2) / 3 + s * 0.35;
        const d = rr * (0.3 + s * 0.09);
        const px = cx + Math.cos(a) * d;
        const py = cy + Math.sin(a) * d * 0.75;
        if (s) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, R: R, camX: number, camY: number) {
    const s = this.art.shadow(w);
    ctx.drawImage(s, R(x - w / 2 - camX), R(y - s.height / 2 - camY));
  }

  private heroSprite(g: Game, realTime: number): Sprite {
    const p = g.player;
    const frames = p.moving ? this.art.heroWalk : this.art.heroIdle;
    return frames[Math.floor(p.moving ? p.walkT * 11 : realTime * 2.5) % frames.length];
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, g: Game, R: R, camX: number, camY: number, realTime: number) {
    const p = g.player;
    const A = this.art;
    if (p.under > 0) {
      // Underground: just a mound of dirt with two ears poking out
      ctx.fillStyle = "#4e3430";
      ctx.beginPath();
      ctx.ellipse(R(p.x - camX), R(p.y - camY), 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#9c7656";
      ctx.fillRect(R(p.x - 5 - camX), R(p.y - 3 - camY), 10, 2);
      ctx.fillStyle = "#f3edf5";
      ctx.fillRect(R(p.x - 3 - camX), R(p.y - 9 - camY), 2, 6);
      ctx.fillRect(R(p.x + 1 - camX), R(p.y - 8 - camY), 2, 5);
      return;
    }
    const blinking = p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0;
    const flash = p.inv > CFG.player.iframes - 0.08;
    // Staff orb glow
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.35 + Math.sin(realTime * 5) * 0.12;
    const og = A.orbGlow;
    ctx.drawImage(og, R(p.x + 9 * p.face - og.width / 2 - camX), R(p.y - 24 - og.height / 2 - camY));
    if (g.fullMoon) {
      ctx.globalAlpha = 0.35;
      const mg = A.moonGlow;
      ctx.drawImage(mg, R(p.x - mg.width - camX), R(p.y - 14 - mg.height - camY), mg.width * 2, mg.height * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (p.ward > 0) {
      const pulse = Math.sin(realTime * 10) * 1.5;
      const fading = p.ward < 1 && Math.floor(realTime * 10) % 2 === 0;
      if (!fading) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(70,214,240,0.16)";
        ctx.strokeStyle = "rgba(198,251,255,0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(R(p.x - camX), R(p.y - 12 - camY), 20 + pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    }
    if (blinking && !g.over) return;
    const s = this.heroSprite(g, realTime);
    const c = p.face < 0 ? (flash ? s.fl : s.nl) : flash ? s.f : s.n;
    ctx.drawImage(c, R(p.x - s.w / 2 - camX), R(p.y - s.h + 3 - camY));
  }

  /** A see-through mirror image of the bunny. */
  private drawEcho(ctx: CanvasRenderingContext2D, e: { x: number; y: number }, g: Game, R: R, camX: number, camY: number, realTime: number) {
    const s = this.heroSprite(g, realTime);
    const c = tinted(g.player.face < 0 ? s.n : s.nl, "rgba(150,210,255,0.6)");
    ctx.globalAlpha = 0.55 + Math.sin(realTime * 4 + e.x) * 0.1;
    ctx.drawImage(c, R(e.x - s.w / 2 - camX), R(e.y - s.h + 3 - camY));
    ctx.globalAlpha = 1;
  }

  private drawTotem(ctx: CanvasRenderingContext2D, tt: Totem, g: Game, R: R, camX: number, camY: number, realTime: number) {
    const A = this.art;
    let frames: Sprite[];
    if (tt.kind === "snow") frames = g.has("yeti") ? A.yeti : A.snowman;
    else frames = g.has("wicker") ? A.wicker : A.totem;
    const s = frames[(Math.floor(realTime * 6 + Math.abs(tt.x)) % frames.length + frames.length) % frames.length];
    const rise = Math.min(1, tt.t / 0.25);
    const fade = tt.t > tt.dur - 1 && Math.floor(realTime * 10) % 2 === 0;
    if (fade) ctx.globalAlpha = 0.5;
    const h = Math.round(s.h * rise);
    ctx.drawImage(s.n, 0, 0, s.w, h, R(tt.x - s.w / 2 - camX), R(tt.y - h + 3 - camY), s.w, h);
    ctx.globalAlpha = 1;
    if (tt.kind === "snow" && tt.hp < tt.maxHp) {
      const bw = 14;
      const bx = R(tt.x - bw / 2 - camX);
      const by = R(tt.y - s.h - camY);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(bx - 1, by - 1, bw + 2, 3);
      ctx.fillStyle = "#8fd8ff";
      ctx.fillRect(bx, by, Math.ceil((bw * Math.max(0, tt.hp)) / tt.maxHp), 1);
    }
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, g: Game, R: R, camX: number, camY: number, realTime: number) {
    const A = this.art;
    const t = g.time;
    let frames: Sprite[];
    let speed = 8;
    let lift = 0;
    switch (e.kind) {
      case "bat":
        frames = A.bat;
        speed = 10;
        lift = 10 + Math.sin(t * 3 + e.phase) * 2;
        break;
      case "skel":
        frames = A.skel;
        speed = 6;
        break;
      case "king":
        frames = A.king;
        speed = 5;
        break;
      case "jelly":
        frames = A.jelly;
        speed = 6;
        break;
      case "ghost":
        frames = A.ghost;
        speed = 6;
        lift = 4;
        break;
      case "shroom":
        frames = e.flash > 0.04 && e.aiT > 2 ? [A.shroomSpit] : A.shroom;
        speed = 6;
        break;
      case "boar":
        frames = e.ai === 1 ? A.boarStamp : A.boar;
        speed = e.ai === 2 ? 16 : e.ai === 1 ? 14 : 7;
        break;
      case "golem":
        frames = A.golem;
        speed = 4;
        break;
      default:
        frames = A.slime;
    }
    const still = e.freezeT > 0 || g.timeStop > 0;
    const s = frames[still ? 0 : Math.floor(t * speed + e.phase * 3) % frames.length];
    // Sprites face right; mirror them when heading left
    const left = e.kind === "boar" && e.ai === 2 ? e.dirX < 0 : e.charmT > 0 ? e.kx < 0 : g.player.x < e.x;
    let c = e.flash > 0 ? (left ? s.fl : s.f) : left ? s.nl : s.n;
    if (e.flash <= 0) {
      if (e.freezeT > 0 || e.chillT > 0) c = tinted(c, "rgba(120,200,255,0.5)");
      else if (e.charmT > 0) c = tinted(c, e.allySrc === "Heart Charm" ? "rgba(255,128,192,0.45)" : "rgba(200,240,255,0.55)");
    }
    const shakeX = e.kind === "boar" && e.ai === 1 ? Math.round(Math.sin(realTime * 60)) : 0;
    const dx = R(e.x - s.w / 2 - camX) + shakeX;
    const dy = R(e.y - s.h + 3 - lift - camY);
    if (e.elite) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.45 + Math.sin(realTime * 5) * 0.15;
      const gg = A.goldGlow;
      ctx.drawImage(gg, R(e.x - gg.width - camX), R(e.y - s.h / 2 - gg.height - camY), gg.width * 2, gg.height * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(outlined(left ? s.nl : s.n, "#ffd640"), dx - 1, dy - 1);
    }
    if (e.kind === "ghost" && e.charmT <= 0) ctx.globalAlpha = 0.82;
    ctx.drawImage(c, dx, dy);
    ctx.globalAlpha = 1;
    // Status marks over the head
    const top = e.y - s.h - lift + 1;
    if (e.dizzyT > 0 || e.stunT > 0) {
      for (let i = 0; i < 2; i++) {
        const a = realTime * 7 + i * Math.PI;
        ctx.fillStyle = e.stunT > 0 ? "#ffe46a" : "#c8a0ff";
        ctx.fillRect(R(e.x + Math.cos(a) * 5 - camX), R(top + Math.sin(a) * 1.5 - camY), 2, 2);
      }
    }
    if (e.kind === "boar" && e.ai === 1) {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(R(e.x - 1 - camX), R(top - 9 - camY), 4, 8);
      ctx.fillStyle = "#ff4a5e";
      ctx.fillRect(R(e.x - camX), R(top - 8 - camY), 2, 4);
      ctx.fillRect(R(e.x - camX), R(top - 3 - camY), 2, 1);
    }
    if (e.kind === "king" || e.elite) {
      const bw = e.kind === "king" ? 30 : 18;
      const bx = R(e.x - bw / 2 - camX);
      const by = dy - 4;
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = "#3a2410";
      ctx.fillRect(bx, by, bw, 2);
      ctx.fillStyle = "#ffd640";
      ctx.fillRect(bx, by, Math.ceil((bw * Math.max(0, e.hp)) / e.maxHp), 2);
    }
  }

  private drawVignette(ctx: CanvasRenderingContext2D, vw: number, vh: number, hpFrac: number, realTime: number) {
    const key = vw + "x" + vh;
    if (key !== this.vignetteKey) {
      this.vignetteKey = key;
      const make = (rgb: string, edge: number) => {
        const c = document.createElement("canvas");
        c.width = Math.ceil(vw);
        c.height = Math.ceil(vh);
        const x = c.getContext("2d")!;
        const grd = x.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.42, vw / 2, vh / 2, Math.hypot(vw, vh) / 2);
        grd.addColorStop(0, `rgba(${rgb},0)`);
        grd.addColorStop(1, `rgba(${rgb},${edge})`);
        x.fillStyle = grd;
        x.fillRect(0, 0, c.width, c.height);
        return c;
      };
      this.vignette = make("20,13,28", 0.42);
      this.redVignette = make("210,20,40", 0.7);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.vignette!, 0, 0, vw, vh);
    if (hpFrac < 0.3) {
      ctx.globalAlpha = Math.min(1, (0.3 - hpFrac) * 4) * (0.55 + Math.sin(realTime * 6) * 0.35);
      ctx.drawImage(this.redVignette!, 0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = false;
  }

  private drawJoystick(ctx: CanvasRenderingContext2D, j: Joystick) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(j.ox, j.oy, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(j.x, j.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function shadowW(e: Enemy) {
  switch (e.kind) {
    case "king":
      return 34;
    case "golem":
      return 22;
    case "jelly":
    case "boar":
      return 20;
    case "slime":
      return 16;
    case "ghost":
      return 8;
    default:
      return e.kind === "skel" || e.kind === "shroom" ? 12 : 10;
  }
}

const NUMBER_COLORS: Record<DamageNumber["style"], [string, string]> = {
  hit: ["#ffffff", "#c8c8dc"],
  big: ["#ffe46a", "#ffa424"],
  burn: ["#ffa424", "#f05a1a"],
  green: ["#c8f080", "#5ac040"],
  heal: ["#ffd0f0", "#e080b0"],
  max: ["#ffe46a", "#ffa424"],
  ice: ["#d0f0ff", "#50b8f0"],
  zap: ["#fff8a0", "#ffd640"],
  toxic: ["#c8f080", "#7ad040"],
};

const tintCache = new Map<string, WeakMap<HTMLCanvasElement, HTMLCanvasElement>>();
/** A color-washed copy of a sprite (icy for chilled enemies, pink for charmed). */
function tinted(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  let m = tintCache.get(color);
  if (!m) tintCache.set(color, (m = new WeakMap()));
  let c = m.get(src);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext("2d")!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "source-atop";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  m.set(src, c);
  return c;
}

const outlineCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
/** A 1px colored outline around a sprite (for golden elites). */
function outlined(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  let c = outlineCache.get(src);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = src.width + 2;
  c.height = src.height + 2;
  const x = c.getContext("2d")!;
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(src, dx, dy);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  outlineCache.set(src, c);
  return c;
}

const greenCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
/** Fire recolored green for Verdant Flame. */
function greenFire(src: HTMLCanvasElement): HTMLCanvasElement {
  let c = greenCache.get(src);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext("2d")!;
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i];
    const gch = d.data[i + 1];
    d.data[i] = Math.round(gch * 0.6);
    d.data[i + 1] = Math.min(255, Math.round(r * 0.95 + 20));
    d.data[i + 2] = Math.round(d.data[i + 2] * 0.5);
  }
  x.putImageData(d, 0, 0);
  greenCache.set(src, c);
  return c;
}
