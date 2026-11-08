import { Art, FIRE_DIRS, Sprite, WorldArt, buildArt } from "./art";
import { numberSprite } from "./art/font";
import { OUTLINE } from "./art/palette";
import type { PlacedProp } from "./art/world";
import { CFG } from "./config";
import type { DamageNumber, Enemy, Game, Puddle } from "./game";

export interface Joystick {
  active: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

type Drawable = { y: number; e?: Enemy; prop?: PlacedProp; player?: true };

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
    const R = (v: number) => Math.round(v * scale) / scale;
    const img = (c: HTMLCanvasElement, wx: number, wy: number, w = c.width, h = c.height) =>
      ctx.drawImage(c, R(wx - camX), R(wy - camY), w, h);

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

    // ---------- Shadows, then small props lying on the ground ----------
    // Only trees are tall enough to stand in front of characters. Everything else is
    // drawn as part of the ground, so a mushroom never covers the wizard's face.
    ctx.globalAlpha = 0.28;
    for (const pr of props) if (pr.art.shadow) this.shadow(ctx, pr.x, pr.y, pr.art.shadow, R, camX, camY);
    ctx.globalAlpha = 1;
    for (const pr of props) if (!pr.art.tall) img(pr.art.sprite.n, pr.x - pr.art.ax, pr.y - pr.art.ay);

    // ---------- Puddles ----------
    for (const pd of g.puddles) this.drawPuddle(ctx, pd, R, camX, camY, realTime);

    ctx.globalAlpha = 0.28;
    for (const e of g.enemies) this.shadow(ctx, e.x, e.y, shadowW(e), R, camX, camY);
    this.shadow(ctx, p.x, p.y, 14, R, camX, camY);
    ctx.globalAlpha = 1;

    // ---------- Pickups ----------
    for (const gem of g.gems) {
      const s = gem.value >= 5 ? A.bigGem : A.gem;
      const bob = gem.magnet ? 0 : Math.round(Math.sin(t * 3 + gem.x * 0.7) * 1.2);
      img(s.n, gem.x - s.w / 2, gem.y - s.h + 2 + bob);
      // An occasional glint
      if (((realTime * 0.8 + gem.x * 0.013 + gem.y * 0.007) % 1) < 0.06) {
        const sp = A.spark[0];
        img(sp, gem.x - 1, gem.y - s.h - 1);
      }
    }
    // Scroll pickups: a sealed scroll bobbing in a pink glow
    for (const d of g.loot) {
      const s = A.scrolls.get("light")!;
      const bob = Math.round(Math.sin(realTime * 4) * 2);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.6 + Math.sin(realTime * 6) * 0.25;
      img(A.lootGlow, d.x - A.lootGlow.width / 2, d.y - 14 - A.lootGlow.height / 2 + bob);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      img(s.n, d.x - s.w / 2, d.y - s.h - 2 + bob);
    }

    // Blizzard: a cold, snowy disc around the player
    if (g.blizzard > 0) {
      ctx.globalAlpha = 0.16 + Math.sin(realTime * 3) * 0.04;
      ctx.fillStyle = "#cfefff";
      ctx.beginPath();
      ctx.ellipse(R(p.x - camX), R(p.y - 8 - camY), g.blizzard, g.blizzard * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
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
    list.push({ y: p.y, player: true });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) {
      if (d.player) this.drawPlayer(ctx, g, R, camX, camY, realTime);
      else if (d.e) this.drawEnemy(ctx, d.e, g, R, camX, camY);
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

    // ---------- Fireballs ----------
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.6;
    for (const s of g.shots) {
      if (s.kind === "icicle") continue;
      const k = s.kind === "orb" ? 2 : 1;
      img(A.fireGlow, s.x - A.fireGlow.width * k / 2, s.y - A.fireGlow.height * k / 2, A.fireGlow.width * k, A.fireGlow.height * k);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const s of g.shots) {
      const a = Math.atan2(s.vy, s.vx);
      if (s.kind === "icicle") {
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
        continue;
      }
      const dir = ((Math.round((a / (Math.PI * 2)) * FIRE_DIRS) % FIRE_DIRS) + FIRE_DIRS) % FIRE_DIRS;
      const fr = A.fire[dir][Math.floor(realTime * 14 + s.x * 0.05) % 3];
      const k = s.kind === "orb" ? 2 : 1;
      img(fr.n, s.x - (fr.w * k) / 2, s.y - (fr.h * k) / 2, fr.w * k, fr.h * k);
    }

    // ---------- Orbit rocks, frost novas, lightning ----------
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.45;
    for (const m of g.moons) {
      const gl = A.moonGlow;
      const k = m.big ? 1.6 : 1;
      img(gl, m.x - (gl.width * k) / 2, m.y - (gl.height * k) / 2, gl.width * k, gl.height * k);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const m of g.moons) {
      const s = m.big ? A.bigMoon : A.moon;
      img(s.n, m.x - s.w / 2, m.y - s.h / 2);
    }
    for (const n of g.novas) {
      if (n.t < 0) continue;
      const k = Math.min(1, n.t / 0.35);
      const ring = this.ringSprite(Math.max(3, Math.round(n.r * k)));
      ctx.globalAlpha = n.t > 0.35 ? Math.max(0, 1 - (n.t - 0.35) / 0.25) : 1;
      img(ring, n.x - ring.width / 2, n.y - ring.height / 2);
      ctx.globalAlpha = 1;
    }
    if (g.bolts.length) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const b of g.bolts) {
        const path = this.boltPath(b.pts, b.t);
        const fade = 1 - b.t / 0.2;
        for (const [w, col] of [[7, `rgba(255,190,60,${0.3 * fade})`], [3.5, `rgba(255,240,140,${0.95 * fade})`], [1.5, `rgba(255,255,255,${fade})`]] as const) {
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
      if (f.kind === "poof") {
        continue;
      } else if (f.kind === "spark") {
        const fr = A.spark[Math.min(2, Math.floor(k * 3))];
        img(fr, f.x - 2, f.y - 2);
      } else if (f.kind === "blast") {
        const r = (8 + k * 22) * f.scale;
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.fillStyle = "#ffa424";
        ctx.beginPath();
        ctx.arc(R(f.x - camX), R(f.y - camY), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = "#ffe46a";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "freeze") {
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.fillStyle = "#bfe8ff";
        ctx.fillRect(0, 0, vw, vh);
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
    const hpw = 16;
    const hx = R(p.x - hpw / 2 - camX);
    const hy = R(p.y + 5 - camY);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(hx - 1, hy - 1, hpw + 2, 4);
    ctx.fillStyle = "#3a1530";
    ctx.fillRect(hx, hy, hpw, 2);
    const frac = p.hp / p.maxHp;
    ctx.fillStyle = frac < 0.3 ? "#ffa424" : "#e8304a";
    ctx.fillRect(hx, hy, Math.ceil(hpw * frac), 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(hx, hy, Math.ceil(hpw * frac), 1);

    // ---------- Screen-space finish ----------
    this.drawVignette(ctx, vw, vh, frac, realTime);
    if (joy.active) this.drawJoystick(ctx, joy);
  }

  private rings = new Map<number, HTMLCanvasElement>();
  /** A crisp pixel ring of ice, cached by radius. */
  private ringSprite(r: number): HTMLCanvasElement {
    let c = this.rings.get(r);
    if (c) return c;
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
        if (px >= -1 && px < 1.2) col = "#ffffff";
        else if (px >= 1.2 && px < 3.5) col = "#8fd8ff";
        else if (px >= 3.5 && px < 5) col = "#50b8f0";
        else if (px >= 5 && px < 8 && (i + j) % 2 === 0) col = "#2490d0";
        if (!col) continue;
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    if (this.rings.size > 200) this.rings.clear();
    this.rings.set(r, c);
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

  private puddles = new Map<number, HTMLCanvasElement>();
  private drawPuddle(ctx: CanvasRenderingContext2D, pd: Puddle, R: (v: number) => number, camX: number, camY: number, realTime: number) {
    const r = Math.round(pd.r);
    let c = this.puddles.get(r);
    if (!c) {
      const ry = Math.round(r * 0.7);
      c = document.createElement("canvas");
      c.width = r * 2 + 4;
      c.height = ry * 2 + 4;
      const x = c.getContext("2d")!;
      const ramp = ["#0c2010", "#173d1c", "#245c22", "#3f8a2a", "#7ad040", "#c8f080"];
      // A blob made of a few overlapping circles, so each puddle size has an organic outline
      const lobes = [[0, 0, 0.8], [-0.42, 0.12, 0.55], [0.45, -0.1, 0.55], [0.1, 0.38, 0.5], [-0.15, -0.35, 0.5]];
      const field = (u: number, v: number) => Math.max(...lobes.map(([lx, ly, lr]) => 1 - Math.hypot(u - lx, v - ly) / lr));
      for (let j = 0; j < c.height; j++)
        for (let i = 0; i < c.width; i++) {
          const u = (i + 0.5 - c.width / 2) / r;
          const v = (j + 0.5 - c.height / 2) / ry;
          const f = field(u, v);
          if (f <= 0) continue;
          const shine = u < -0.15 && v < -0.1 && f > 0.35 && f < 0.5;
          x.fillStyle = f < 0.08 ? ramp[0] : f < 0.18 ? ramp[1] : shine ? ramp[4] : f > 0.55 ? ramp[3] : ramp[2];
          x.fillRect(i, j, 1, 1);
        }
      this.puddles.set(r, c);
    }
    const life = pd.t / pd.dur;
    const sc = life < 0.08 ? life / 0.08 : 1;
    ctx.globalAlpha = (life > 0.8 ? (1 - life) / 0.2 : 1) * 0.78;
    const w = c.width * sc;
    const h = c.height * sc;
    ctx.drawImage(c, R(pd.x - w / 2 - camX), R(pd.y - h / 2 - camY), w, h);
    // Bubbles that pop up and burst
    for (let i = 0; i < 4; i++) {
      const ph = (realTime * 1.3 + i * 0.27 + pd.x * 0.01) % 1;
      const a = i * 2.1 + pd.y;
      const bx = pd.x + Math.cos(a) * pd.r * 0.5;
      const by = pd.y + Math.sin(a) * pd.r * 0.3 - ph * 3;
      ctx.fillStyle = ph < 0.8 ? "#c8f080" : "#7ad040";
      const sz = ph < 0.8 ? 2 : 1;
      ctx.fillRect(R(bx - camX), R(by - camY), sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  private shadow(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, R: (v: number) => number, camX: number, camY: number,
  ) {
    const s = this.art.shadow(w);
    ctx.drawImage(s, R(x - w / 2 - camX), R(y - s.height / 2 - camY));
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, g: Game, R: (v: number) => number, camX: number, camY: number, realTime: number) {
    const p = g.player;
    const A = this.art;
    const blinking = p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0;
    const flash = p.inv > CFG.player.iframes - 0.08;
    // Staff orb glow
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.35 + Math.sin(realTime * 5) * 0.12;
    const og = A.orbGlow;
    ctx.drawImage(og, R(p.x + 9 * p.face - og.width / 2 - camX), R(p.y - 24 - og.height / 2 - camY));
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
    const frames = p.moving ? A.heroWalk : A.heroIdle;
    const s = frames[Math.floor(p.moving ? p.walkT * 11 : realTime * 2.5) % frames.length];
    const c = p.face < 0 ? (flash ? s.fl : s.nl) : flash ? s.f : s.n;
    ctx.drawImage(c, R(p.x - s.w / 2 - camX), R(p.y - s.h + 3 - camY));
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, g: Game, R: (v: number) => number, camX: number, camY: number) {
    const A = this.art;
    const t = g.time;
    let frames: Sprite[];
    let speed: number;
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
    } else {
      frames = A.slime;
      speed = 8;
    }
    // Frozen enemies stop animating
    const s = frames[e.freezeT > 0 ? 0 : Math.floor(t * speed + e.phase * 3) % frames.length];
    const left = g.player.x < e.x;
    let c = e.flash > 0 ? (left ? s.fl : s.f) : left ? s.nl : s.n;
    if ((e.chillT > 0 || e.freezeT > 0) && e.flash <= 0) c = tinted(c);
    const dx = R(e.x - s.w / 2 - camX);
    const dy = R(e.y - s.h + 3 - lift - camY);
    ctx.drawImage(c, dx, dy);
    if (e.kind === "king") {
      const bw = 30;
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
  return e.kind === "king" ? 34 : e.kind === "slime" ? 16 : e.kind === "skel" ? 12 : 10;
}

const NUMBER_COLORS: Record<DamageNumber["style"], [string, string]> = {
  hit: ["#ffffff", "#c8c8dc"],
  big: ["#ffe46a", "#ffa424"],
  burn: ["#ffa424", "#f05a1a"],
  heal: ["#ffd0f0", "#e080b0"],
  max: ["#ffe46a", "#ffa424"],
};

const tintCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
/** An icy blue version of a sprite, for chilled enemies. */
function tinted(src: HTMLCanvasElement): HTMLCanvasElement {
  let c = tintCache.get(src);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext("2d")!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "source-atop";
  x.fillStyle = "rgba(120,200,255,0.5)";
  x.fillRect(0, 0, c.width, c.height);
  tintCache.set(src, c);
  return c;
}
