import { Art, DIRS, Sprite, WorldArt, buildArt } from "./art";
import { numberSprite } from "./art/font";
import { OUTLINE } from "./art/palette";
import type { PlacedProp } from "./art/world";
import { CFG } from "./config";
import type { DamageNumber, Enemy, Game, Puddle, RingTheme } from "./game";

export interface Joystick {
  active: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

type R = (v: number) => number;
type Drawable = { y: number; e?: Enemy; prop?: PlacedProp; player?: true };

const RING_COLORS: Record<RingTheme, [string, string, string, string]> = {
  ice: ["#ffffff", "#8fd8ff", "#50b8f0", "#2490d0"],
  fire: ["#fffbe0", "#ffe46a", "#ffa424", "#f05a1a"],
  star: ["#ffffff", "#fff2b0", "#ffd640", "#d49a1c"],
  heart: ["#ffffff", "#ffd0f0", "#ff80c0", "#c23a9c"],
  water: ["#ffffff", "#c0e4ff", "#6ab8ff", "#2a70c0"],
};

export class Renderer {
  readonly art: Art = buildArt();
  /** Turn off for players who don't want the screen to shake. */
  shakeOn = true;
  private world = new WorldArt();
  private frame = 0;
  private dark: HTMLCanvasElement | null = null;
  private red: HTMLCanvasElement | null = null;
  private light: HTMLCanvasElement | null = null;
  private sizeKey = "";

  draw(ctx: CanvasRenderingContext2D, g: Game, scale: number, realTime: number, joy: Joystick) {
    this.frame++;
    const A = this.art;
    const vw = g.viewW;
    const vh = g.viewH;
    const p = g.player;
    const t = g.time;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const sh = this.shakeOn ? g.shake : 0;
    const camX = p.x - vw / 2 + (sh > 0 ? (Math.random() * 2 - 1) * sh : 0);
    const camY = p.y - 8 - vh / 2 + (sh > 0 ? (Math.random() * 2 - 1) * sh : 0);
    // Snap to screen pixels (not art pixels): motion stays smooth while sprites stay crisp.
    const R: R = (v: number) => Math.round(v * scale) / scale;
    const img = (c: HTMLCanvasElement, wx: number, wy: number, w = c.width, h = c.height) => ctx.drawImage(c, R(wx - camX), R(wy - camY), w, h);
    const glow = (c: HTMLCanvasElement, x: number, y: number, k: number, alpha: number) => {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      img(c, x - (c.width * k) / 2, y - (c.height * k) / 2, c.width * k, c.height * k);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
    this.prepare(vw, vh);

    // ---------- Ground ----------
    const C = this.world.size;
    const cx0 = Math.floor(camX / C);
    const cy0 = Math.floor(camY / C);
    const cx1 = Math.floor((camX + vw) / C);
    const cy1 = Math.floor((camY + vh) / C);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) img(this.world.get(cx, cy, this.frame).canvas, cx * C, cy * C);
    this.world.prefetch(cx0, cy0, cx1, cy1, this.frame);

    const props: PlacedProp[] = [];
    for (let cy = Math.floor((camY - 8) / C); cy <= Math.floor((camY + vh + 70) / C); cy++)
      for (let cx = Math.floor((camX - 40) / C); cx <= Math.floor((camX + vw + 40) / C); cx++)
        for (const pr of this.world.get(cx, cy, this.frame).props) {
          if (pr.x < camX - 40 || pr.x > camX + vw + 40 || pr.y < camY - 8 || pr.y > camY + vh + 70) continue;
          props.push(pr);
        }

    // Your staff lights the grass around you
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 + Math.sin(realTime * 2) * 0.04;
    ctx.imageSmoothingEnabled = true;
    const L = this.light!;
    ctx.drawImage(L, R(p.x - camX) - 80, R(p.y - 10 - camY) - 64, 160, 128);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // Only trees are tall enough to stand in front of characters; small props are part of the ground.
    ctx.globalAlpha = 0.3;
    for (const pr of props) if (pr.art.shadow) this.shadow(ctx, pr.x, pr.y, pr.art.shadow, R, camX, camY);
    ctx.globalAlpha = 1;
    for (const pr of props)
      if (!pr.art.tall) {
        img(pr.art.sprite.n, pr.x - pr.art.ax, pr.y - pr.art.ay);
        // Mushrooms glow softly at night
        if (pr.art.sprite.w <= 16 && pr.art.sprite.h === 15) glow(A.fireGlow, pr.x, pr.y - 7, 0.9, 0.22 + Math.sin(realTime * 1.7 + pr.x) * 0.06);
      }

    // ---------- Things on the ground ----------
    for (const f of g.puddles) this.drawPuddle(ctx, f, R, camX, camY, realTime);
    for (const h of g.pools) this.drawPool(ctx, h.x, h.y, h.r, h.t, h.dur, R, camX, camY, realTime);
    this.drawPath(ctx, g.path, t, R, camX, camY, realTime);
    // Where a falling star will land
    for (const s of g.starfalls) {
      const k = s.t / s.dur;
      ctx.globalAlpha = 0.25 + k * 0.4;
      ctx.strokeStyle = "#fff2b0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(R(s.x - camX), R(s.y - camY), 6 + (1 - k) * 22, (6 + (1 - k) * 22) * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = 0.3;
    for (const e of g.enemies) this.shadow(ctx, e.x, e.y, shadowW(e), R, camX, camY);
    this.shadow(ctx, p.x, p.y, 14, R, camX, camY);
    ctx.globalAlpha = 1;

    // ---------- Pickups ----------
    for (const gem of g.gems) {
      const s = gem.value >= 3 ? A.bigGem : A.gem;
      const bob = gem.magnet ? 0 : Math.round(Math.sin(t * 3 + gem.x * 0.7) * 1.2);
      img(s.n, gem.x - s.w / 2, gem.y - s.h + 2 + bob);
      if (((realTime * 0.8 + gem.x * 0.013 + gem.y * 0.007) % 1) < 0.08) img(A.spark[0], gem.x - 1, gem.y - s.h - 1);
    }
    for (const d of g.loot) {
      const bob = Math.round(Math.sin(realTime * 4 + d.x) * 2);
      if (d.kind === "star") {
        // A fallen star: a pillar of light you can see from far away
        ctx.globalCompositeOperation = "lighter";
        const grd = ctx.createLinearGradient(0, R(d.y - 150 - camY), 0, R(d.y - camY));
        grd.addColorStop(0, "rgba(255,242,176,0)");
        grd.addColorStop(1, `rgba(255,242,176,${0.28 + Math.sin(realTime * 3) * 0.08})`);
        ctx.fillStyle = grd;
        ctx.fillRect(R(d.x - 5 - camX), R(d.y - 150 - camY), 10, 150);
        ctx.globalCompositeOperation = "source-over";
        glow(A.goldGlow, d.x, d.y - 10 + bob, 2, 0.6 + Math.sin(realTime * 5) * 0.2);
        img(A.star.n, d.x - A.star.w / 2, d.y - A.star.h - 1 + bob);
        continue;
      }
      const s = d.kind === "magnet" ? A.magnet : A.carrot;
      const big = d.kind === "feast" ? 2 : 1;
      glow(d.kind === "magnet" ? A.zapGlow : A.fireGlow, d.x, d.y - (s.h * big) / 2 - 2 + bob, big, 0.5 + Math.sin(realTime * 6) * 0.2);
      img(s.n, d.x - (s.w * big) / 2, d.y - s.h * big - 2 + bob, s.w * big, s.h * big);
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

    // ---------- Characters and trees, back to front ----------
    const list: Drawable[] = [];
    for (const pr of props) if (pr.art.tall) list.push({ y: pr.y, prop: pr });
    for (const e of g.enemies) list.push({ y: e.y, e });
    list.push({ y: p.y, player: true });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) {
      if (d.player) this.drawPlayer(ctx, g, R, camX, camY, realTime);
      else if (d.e) this.drawEnemy(ctx, d.e, g, R, camX, camY, realTime);
      else if (d.prop) {
        const pr = d.prop;
        const s = pr.art.sprite;
        const x = pr.x - pr.art.ax;
        const y = pr.y - pr.art.ay;
        // See-through when the player walks behind a tree
        if (p.y < pr.y && p.y > y + 6 && Math.abs(p.x - pr.x) < s.w / 2) ctx.globalAlpha = 0.55;
        img(s.n, x, y);
        ctx.globalAlpha = 1;
      }
    }

    // ---------- Projectiles ----------
    for (const s of g.shots) {
      const a = Math.atan2(s.vy, s.vx);
      const dir = ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
      if (s.kind === "bolt") {
        glow(A.moonGlow, s.x, s.y, 1, 0.7);
        const fr = A.bolt[dir].n;
        img(fr, s.x - fr.width / 2, s.y - fr.height / 2);
      } else if (s.kind === "flame") {
        glow(A.fireGlow, s.x, s.y, 1, 0.6);
        const fr = A.fire[dir][Math.floor(realTime * 14 + s.x * 0.05) % 3].n;
        img(fr, s.x - fr.width / 2, s.y - fr.height / 2);
      } else if (s.kind === "icicle") {
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
      } else {
        // A bog bubble, lobbed in an arc
        const arc = Math.sin(Math.min(1, s.life * 2.2) * Math.PI) * 10;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#0a0614";
        ctx.fillRect(R(s.x - 2 - camX), R(s.y - camY), 4, 1);
        ctx.globalAlpha = 1;
        glow(A.greenGlow, s.x, s.y - 8 - arc, 0.8, 0.5);
        this.ball(ctx, s.x, s.y - 8 - arc, 3, "#c8f080", "#3f8a2a", R, camX, camY);
      }
    }
    for (const s of g.spits) {
      glow(A.zapGlow, s.x, s.y, 0.6, 0.35);
      this.ball(ctx, s.x, s.y, 2.5, "#e8c0ff", "#8a40c0", R, camX, camY);
    }

    // ---------- Moths ----------
    for (const m of g.moths) {
      glow(A.moonGlow, m.x, m.y, 1.3, 0.6);
      const s = A.moth[Math.floor(realTime * 14 + m.x * 0.1) % 2];
      img(s.n, m.x - s.w / 2, m.y - s.h / 2);
    }

    // ---------- Rings ----------
    for (const n of g.rings) {
      const k = Math.min(1, n.t / 0.35);
      const ring = this.ringSprite(Math.max(3, Math.round(n.r * k)), n.theme);
      ctx.globalAlpha = n.t > 0.35 ? Math.max(0, 1 - (n.t - 0.35) / 0.25) : 1;
      img(ring, n.x - ring.width / 2, n.y - ring.height / 2);
      ctx.globalAlpha = 1;
    }

    // ---------- Stars on their way down ----------
    for (const s of g.starfalls) {
      const k = s.t / s.dur;
      const x = s.x + (1 - k) * 90;
      const y = s.y - (1 - k) * 260;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const [w, a] of [[6, 0.25], [3, 0.6], [1.2, 1]] as const) {
        ctx.strokeStyle = `rgba(255,242,176,${a})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(R(x + 26 - camX), R(y - 75 - camY));
        ctx.lineTo(R(x - camX), R(y - camY));
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      glow(A.goldGlow, x, y, 1.6, 0.9);
      img(A.star.n, x - A.star.w / 2, y - A.star.h / 2);
    }

    // ---------- Lightning and moonbeams ----------
    if (g.bolts.length) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const b of g.bolts) {
        const path = b.beam ? b.pts : this.boltPath(b.pts, b.t);
        const fade = Math.max(0, 1 - b.t / 0.2);
        const cols = b.beam
          ? ([[4, `rgba(160,180,255,${0.35 * fade})`], [1.5, `rgba(240,244,255,${fade})`]] as const)
          : ([[6, `rgba(255,190,60,${0.3 * fade})`], [3, `rgba(255,240,140,${0.95 * fade})`], [1.2, `rgba(255,255,255,${fade})`]] as const);
        for (const [w, col] of cols) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          path.forEach(([x, y], i) => (i ? ctx.lineTo(R(x - camX), R(y - camY)) : ctx.moveTo(R(x - camX), R(y - camY))));
          ctx.stroke();
        }
        if (!b.beam) for (const [x, y] of b.pts.slice(1)) img(A.zapGlow, x - A.zapGlow.width / 2, y - A.zapGlow.height / 2);
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
      if (f.kind === "spark") img(A.spark[Math.min(2, Math.floor(k * 3))], f.x - 2, f.y - 2);
      else if (f.kind === "blast") {
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
      } else if (f.kind === "heart") {
        ctx.globalAlpha = 1 - k;
        this.heart(ctx, f.x, f.y - k * 14, R, camX, camY);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.color ?? "#fff2b0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(R(f.x - camX), R(f.y - camY), 6 + k * 30 * f.scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Fireflies drifting through the night
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 14; i++) {
      const fx = ((i * 137.5 + Math.sin(realTime * 0.3 + i) * 30 - camX * 0.9) % (vw + 40) + vw + 40) % (vw + 40) - 20;
      const fy = ((i * 89.3 + Math.cos(realTime * 0.23 + i * 2) * 24 - camY * 0.9) % (vh + 40) + vh + 40) % (vh + 40) - 20;
      const tw = 0.5 + Math.sin(realTime * 2 + i * 1.7) * 0.5;
      if (tw < 0.25) continue;
      ctx.globalAlpha = tw * 0.8;
      ctx.fillStyle = "#e8ff9a";
      ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
      ctx.globalAlpha = tw * 0.25;
      ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // ---------- Damage numbers: pop up, then float away ----------
    for (const n of g.nums) {
      const pop = n.t < 0.06 ? 3 : n.t < 0.12 ? 1 : 0;
      const [col, shade] = NUMBER_COLORS[n.style];
      const c = numberSprite(String(n.value), col, shade);
      const sc = n.style === "big" || n.style === "heal" || n.style === "roll" || n.style === "crit" ? 2 : 1;
      ctx.globalAlpha = n.t > 0.5 ? 1 - (n.t - 0.5) / 0.2 : 1;
      img(c, n.x - (c.width * sc) / 2, n.y - n.t * 22 - pop, c.width * sc, c.height * sc);
      ctx.globalAlpha = 1;
    }

    // ---------- Player health bar ----------
    const frac = p.hp / p.maxHp;
    const hpw = 16;
    const hx = R(p.x - hpw / 2 - camX);
    const hy = R(p.y + 5 - camY);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(hx - 1, hy - 1, hpw + 2, 4);
    ctx.fillStyle = "#3a1530";
    ctx.fillRect(hx, hy, hpw, 2);
    ctx.fillStyle = frac < 0.3 ? "#ffa424" : "#e8304a";
    ctx.fillRect(hx, hy, Math.ceil(hpw * frac), 2);

    // ---------- Screen-wide moods ----------
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.dark!, 0, 0, vw, vh);
    if (frac < 0.3) {
      ctx.globalAlpha = Math.min(1, (0.3 - frac) * 4) * (0.55 + Math.sin(realTime * 6) * 0.35);
      ctx.drawImage(this.red!, 0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = false;
    // The sky lightens in the last minute before dawn
    const dawn = Math.max(0, (t - (CFG.nightLength - 60)) / 60);
    if (dawn > 0) {
      ctx.globalAlpha = dawn * 0.22;
      ctx.fillStyle = "#ffb070";
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
    for (const f of g.fx)
      if (f.kind === "flash") {
        ctx.globalAlpha = (1 - f.t / f.dur) * 0.45;
        ctx.fillStyle = f.color ?? "#ffffff";
        ctx.fillRect(0, 0, vw, vh);
        ctx.globalAlpha = 1;
      }

    // ---------- Arrows toward fallen stars off screen ----------
    for (const d of [...g.loot.filter((l) => l.kind === "star"), ...g.starfalls]) {
      const sx = d.x - camX;
      const sy = d.y - 10 - camY;
      if (sx > 8 && sx < vw - 8 && sy > 8 && sy < vh - 8) continue;
      const a = Math.atan2(sy - vh / 2, sx - vw / 2);
      const k = Math.min((vw / 2 - 14) / Math.abs(Math.cos(a) || 1e-6), (vh / 2 - 34) / Math.abs(Math.sin(a) || 1e-6));
      ctx.save();
      ctx.translate(Math.round(vw / 2 + Math.cos(a) * k), Math.round(vh / 2 + Math.sin(a) * k));
      ctx.rotate(a);
      const pulse = 1 + Math.sin(realTime * 6) * 0.15;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, -7);
      ctx.lineTo(-5, 7);
      ctx.fill();
      ctx.fillStyle = "#ffd640";
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -5);
      ctx.lineTo(-4, 5);
      ctx.fill();
      ctx.restore();
    }

    if (joy.active) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(joy.ox, joy.oy, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(joy.x, joy.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Builds the soft overlays that depend on the view size. */
  private prepare(vw: number, vh: number) {
    const key = vw + "x" + vh;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    const radial = (w: number, h: number, inner: number, stops: [number, string][]) => {
      const c = document.createElement("canvas");
      c.width = Math.ceil(w);
      c.height = Math.ceil(h);
      const x = c.getContext("2d")!;
      const grd = x.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, Math.hypot(w, h) / 2);
      for (const [o, col] of stops) grd.addColorStop(o, col);
      x.fillStyle = grd;
      x.fillRect(0, 0, c.width, c.height);
      return c;
    };
    this.dark = radial(vw, vh, Math.min(vw, vh) * 0.3, [[0, "rgba(8,6,24,0)"], [1, "rgba(8,6,24,0.62)"]]);
    this.red = radial(vw, vh, Math.min(vw, vh) * 0.42, [[0, "rgba(210,20,40,0)"], [1, "rgba(210,20,40,0.7)"]]);
    const l = document.createElement("canvas");
    l.width = 80;
    l.height = 64;
    const x = l.getContext("2d")!;
    const grd = x.createRadialGradient(40, 32, 2, 40, 32, 40);
    grd.addColorStop(0, "rgba(150,170,255,0.5)");
    grd.addColorStop(0.5, "rgba(110,130,230,0.2)");
    grd.addColorStop(1, "rgba(90,110,220,0)");
    x.fillStyle = grd;
    x.fillRect(0, 0, 80, 64);
    this.light = l;
  }

  private ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string, R: R, camX: number, camY: number) {
    for (const [rr, col, off] of [[r + 1, OUTLINE, 0], [r, dark, 0], [r * 0.65, light, -0.6]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(R(x + off - camX), R(y + off - camY), rr, 0, Math.PI * 2);
      ctx.fill();
    }
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
  private ringSprite(r: number, theme: RingTheme): HTMLCanvasElement {
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

  private jag = new WeakMap<object, [number, number][]>();
  /** A jagged lightning path through the hit points, re-jittered a few times while it lives. */
  private boltPath(pts: [number, number][], t: number): [number, number][] {
    const step = Math.floor(t / 0.05);
    const cached = this.jag.get(pts);
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
    this.jag.set(pts, out);
    return out;
  }

  private blobs = new Map<number, HTMLCanvasElement>();
  /** A poison puddle: an organic blob, cached by size. */
  private drawPuddle(ctx: CanvasRenderingContext2D, f: Puddle, R: R, camX: number, camY: number, realTime: number) {
    const r = Math.round(f.r);
    let c = this.blobs.get(r);
    if (!c) {
      const ry = Math.round(r * 0.7);
      c = document.createElement("canvas");
      c.width = r * 2 + 4;
      c.height = ry * 2 + 4;
      const x = c.getContext("2d")!;
      const ramp = ["#0c2010", "#173d1c", "#2a6a26", "#4a9a30", "#8ad850", "#d0f890"];
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
      this.blobs.set(r, c);
    }
    const life = f.t / f.dur;
    const sc = life < 0.08 ? life / 0.08 : 1;
    ctx.globalAlpha = (life > 0.8 ? (1 - life) / 0.2 : 1) * 0.8;
    const w = c.width * sc;
    const h = c.height * sc;
    ctx.drawImage(c, R(f.x - w / 2 - camX), R(f.y - h / 2 - camY), w, h);
    for (let i = 0; i < 4; i++) {
      const ph = (realTime * 1.3 + i * 0.27 + f.x * 0.01) % 1;
      const a = i * 2.1 + f.y;
      ctx.fillStyle = ph < 0.8 ? "#d0f890" : "#8ad850";
      const sz = ph < 0.6 ? 2 : 1;
      ctx.fillRect(R(f.x + Math.cos(a) * f.r * 0.5 - camX), R(f.y + Math.sin(a) * f.r * 0.3 - ph * 3 - camY), sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  /** A whirlpool: dark water with pale swirling arms. */
  private drawPool(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, dur: number, R: R, camX: number, camY: number, realTime: number) {
    const grow = Math.min(1, t / 0.3) * (t > dur - 0.2 ? Math.max(0, (dur - t) / 0.2) : 1);
    const rr = r * grow;
    const cx = R(x - camX);
    const cy = R(y - camY);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#16306a";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr, rr * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#0a1434";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr * 0.3, rr * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = k % 2 ? "#c0e4ff" : "#6ab8ff";
      ctx.beginPath();
      for (let s = 0; s <= 14; s++) {
        const a = realTime * 5 + (k * Math.PI) / 2 + s * 0.3;
        const d = rr * (0.25 + s * 0.052);
        const px = cx + Math.cos(a) * d;
        const py = cy + Math.sin(a) * d * 0.75;
        if (s) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Fire Path: thick near you, thinning and fading behind. */
  private drawPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number; t: number }[], now: number, R: R, camX: number, camY: number, realTime: number) {
    if (pts.length < 2) return;
    const cols = ["#6e1a0a", "#e0501a", "#ffb030"];
    ctx.lineCap = "round";
    for (let layer = 0; layer < 3; layer++)
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const life = Math.max(0, 1 - (now - b.t) / 2.5);
        ctx.globalAlpha = Math.min(1, life * 1.6) * (layer === 0 ? 0.7 : 0.9);
        ctx.strokeStyle = cols[layer];
        ctx.lineWidth = Math.max(1, [8, 5, 1.5][layer] * (0.4 + life * 0.6) * (0.8 + Math.sin(realTime * 18 + i * 1.7) * 0.2));
        ctx.beginPath();
        ctx.moveTo(R(a.x - camX), R(a.y - camY));
        ctx.lineTo(R(b.x - camX), R(b.y - camY));
        ctx.stroke();
      }
    const lick = ["#fff0a0", "#ffa424", "#e0501a"];
    for (let i = 0; i < pts.length; i++)
      for (let k = 0; k < 2; k++) {
        const pt = pts[i];
        const ph = (realTime * 2.8 + i * 0.37 + k * 0.5) % 1;
        const life = Math.max(0, 1 - (now - pt.t) / 2.5);
        ctx.globalAlpha = (1 - ph) * life;
        ctx.fillStyle = lick[ph < 0.3 ? 0 : ph < 0.65 ? 1 : 2];
        const sz = ph < 0.4 ? 2 : 1;
        ctx.fillRect(R(pt.x + Math.sin(i * 3.1 + k * 2) * 3.5 - camX), R(pt.y - ph * (9 + life * 5) - camY), sz, sz + (ph < 0.5 ? 2 : 0));
      }
    ctx.globalAlpha = 1;
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, R: R, camX: number, camY: number) {
    const s = this.art.shadow(w);
    ctx.drawImage(s, R(x - w / 2 - camX), R(y - s.height / 2 - camY));
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, g: Game, R: R, camX: number, camY: number, realTime: number) {
    const p = g.player;
    const A = this.art;
    const blinking = p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0;
    const flash = p.inv > CFG.player.iframes - 0.08 && p.inv <= CFG.player.iframes;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 + Math.sin(realTime * 5) * 0.12;
    const og = A.moonGlow;
    ctx.drawImage(og, R(p.x + 9 * p.face - og.width / 2 - camX), R(p.y - 24 - og.height / 2 - camY));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (blinking && !g.over) return;
    const frames = p.moving ? A.heroWalk : A.heroIdle;
    const s = frames[Math.floor(p.moving ? p.walkT * 11 : realTime * 2.5) % frames.length];
    const c = p.face < 0 ? (flash ? s.fl : s.nl) : flash ? s.f : s.n;
    ctx.drawImage(c, R(p.x - s.w / 2 - camX), R(p.y - s.h + 3 - camY));
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, g: Game, R: R, camX: number, camY: number, realTime: number) {
    const A = this.art;
    const t = g.time;
    let frames: Sprite[] = A.slime;
    let speed = 8;
    let lift = 0;
    if (e.kind === "bat") {
      frames = A.bat;
      speed = 10;
      lift = 10 + Math.sin(t * 3 + e.phase) * 2;
    } else if (e.kind === "skel") {
      frames = A.skel;
      speed = 6;
    } else if (e.kind === "king") {
      frames = A.king;
      speed = 5;
      lift = Math.abs(Math.sin(t * 3)) * 3;
    } else if (e.kind === "jelly") {
      frames = A.jelly;
      speed = 6;
    } else if (e.kind === "ghost") {
      frames = A.ghost;
      speed = 6;
      lift = 4;
    } else if (e.kind === "shroom") {
      frames = e.flash > 0.04 && e.aiT > 2 ? [A.shroomSpit] : A.shroom;
      speed = 6;
    } else if (e.kind === "boar") {
      frames = e.ai === 1 ? A.boarStamp : A.boar;
      speed = e.ai === 2 ? 16 : e.ai === 1 ? 14 : 7;
    } else if (e.kind === "golem") {
      frames = A.golem;
      speed = 4;
    }
    const still = e.freezeT > 0 || e.stunT > 0;
    const s = frames[still ? 0 : Math.floor(t * speed + e.phase * 3) % frames.length];
    // Sprites face right; mirror them when heading left
    const left = e.kind === "boar" && e.ai === 2 ? e.dirX < 0 : e.charmT > 0 ? e.kx < 0 : g.player.x < e.x;
    let c = e.flash > 0 ? (left ? s.fl : s.f) : left ? s.nl : s.n;
    if (e.flash <= 0) {
      if (e.freezeT > 0) c = tinted(c, "rgba(170,225,255,0.75)");
      else if (e.chillT > 0) c = tinted(c, "rgba(120,200,255,0.45)");
      else if (e.charmT > 0) c = tinted(c, "rgba(255,128,192,0.45)");
      else if (e.boss === 1) c = tinted(c, "rgba(120,60,200,0.5)");
    }
    const shakeX = e.kind === "boar" && e.ai === 1 ? Math.round(Math.sin(realTime * 60)) : 0;
    const big = e.boss === 1 ? 1.25 : 1;
    const w = Math.round(s.w * big);
    const h = Math.round(s.h * big);
    const dx = R(e.x - w / 2 - camX) + shakeX;
    const dy = R(e.y - h + 3 - lift - camY);
    if (e.elite) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.45 + Math.sin(realTime * 5) * 0.15;
      const gg = A.goldGlow;
      ctx.drawImage(gg, R(e.x - gg.width / 2 - camX), R(e.y - s.h / 2 - gg.height / 2 - camY));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(outlined(left ? s.nl : s.n, "#ffd640"), dx - 1, dy - 1);
    }
    if (e.kind === "ghost" && e.charmT <= 0) ctx.globalAlpha = 0.85;
    ctx.drawImage(c, dx, dy, w, h);
    ctx.globalAlpha = 1;
    // Status marks over the head
    const top = e.y - h - lift + 1;
    if (e.dizzyT > 0 || e.stunT > 0)
      for (let i = 0; i < 2; i++) {
        const a = realTime * 7 + i * Math.PI;
        ctx.fillStyle = e.stunT > 0 ? "#ffe46a" : "#d8c8ff";
        ctx.fillRect(R(e.x + Math.cos(a) * 5 - camX), R(top + Math.sin(a) * 1.5 - camY), 2, 2);
      }
    if (e.charmT > 0) this.heart(ctx, e.x, top - 4 + Math.sin(realTime * 5) * 1.5, R, camX, camY);
    if (e.kind === "boar" && e.ai === 1) {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(R(e.x - 1 - camX), R(top - 9 - camY), 4, 8);
      ctx.fillStyle = "#ff4a5e";
      ctx.fillRect(R(e.x - camX), R(top - 8 - camY), 2, 4);
      ctx.fillRect(R(e.x - camX), R(top - 3 - camY), 2, 1);
    }
    if (e.elite) {
      const bw = 18;
      const bx = R(e.x - bw / 2 - camX);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(bx - 1, dy - 5, bw + 2, 4);
      ctx.fillStyle = "#ffd640";
      ctx.fillRect(bx, dy - 4, Math.ceil((bw * Math.max(0, e.hp)) / e.maxHp), 2);
    }
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
  moon: ["#ffffff", "#c0c8f0"],
  none: ["#ffffff", "#c0c8f0"],
  fire: ["#ffb040", "#f05a1a"],
  frost: ["#d0f0ff", "#50b8f0"],
  storm: ["#fff8a0", "#ffd640"],
  poison: ["#c8f080", "#7ad040"],
  crit: ["#ffe46a", "#ff7a1a"],
  big: ["#ffe46a", "#ffa424"],
  heal: ["#ffd0f0", "#e080b0"],
  roll: ["#ffe46a", "#ffa424"],
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
