import { Art, FIRE_DIRS, Sprite, WorldArt, buildArt } from "./art";
import { numberSprite } from "./art/font";
import { OUTLINE } from "./art/palette";
import type { PlacedProp } from "./art/world";
import { CFG } from "./config";
import type { Enemy, Game } from "./game";

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

    // ---------- Shadows ----------
    ctx.globalAlpha = 0.28;
    for (const pr of props) if (pr.art.shadow) this.shadow(ctx, pr.x, pr.y, pr.art.shadow, R, camX, camY);
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
    for (const d of g.dice) {
      const s = A.dice.get(d.faces)!;
      const bob = Math.round(Math.sin(realTime * 4) * 2);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 + Math.sin(realTime * 6) * 0.2;
      img(A.goldGlow, d.x - A.goldGlow.width / 2, d.y - 10 - A.goldGlow.height / 2 + bob);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      img(s.n, d.x - s.w / 2, d.y - s.h - 2 + bob);
    }

    // ---------- Characters and props, back to front ----------
    const list: Drawable[] = [];
    for (const pr of props) list.push({ y: pr.y, prop: pr });
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
    for (const s of g.shots) img(A.fireGlow, s.x - A.fireGlow.width / 2, s.y - A.fireGlow.height / 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const s of g.shots) {
      const a = Math.atan2(s.vy, s.vx);
      const dir = ((Math.round((a / (Math.PI * 2)) * FIRE_DIRS) % FIRE_DIRS) + FIRE_DIRS) % FIRE_DIRS;
      const fr = A.fire[dir][Math.floor(realTime * 14 + s.x * 0.05) % 3];
      img(fr.n, s.x - fr.w / 2, s.y - fr.h / 2);
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
        const fr = A.poof[Math.min(A.poof.length - 1, Math.floor(k * A.poof.length))];
        const sc = Math.max(1, Math.round(f.scale));
        ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
        img(fr.n, f.x - (fr.w * sc) / 2, f.y - (fr.h * sc) / 2, fr.w * sc, fr.h * sc);
        ctx.globalAlpha = 1;
      } else if (f.kind === "spark") {
        const fr = A.spark[Math.min(2, Math.floor(k * 3))];
        img(fr, f.x - 2, f.y - 2);
      } else {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = "#c6fbff";
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
      const c = numberSprite(String(n.value), n.big ? "#ffe46a" : "#ffffff", n.big ? "#ffa424" : "#c8c8dc");
      const sc = n.big ? 2 : 1;
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
    ctx.drawImage(og, R(p.x + 8 * p.face - og.width / 2 - camX), R(p.y - 18 - og.height / 2 - camY));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
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
    const s = frames[Math.floor(t * speed + e.phase * 3) % frames.length];
    const left = g.player.x < e.x;
    const c = e.flash > 0 ? (left ? s.fl : s.f) : left ? s.nl : s.n;
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
    ctx.arc(j.ox, j.oy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(j.x, j.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function shadowW(e: Enemy) {
  return e.kind === "king" ? 34 : e.kind === "slime" ? 16 : e.kind === "skel" ? 12 : 10;
}
