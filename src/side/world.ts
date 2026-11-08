import { noise } from "../art/world";
import { COL, GrowOpts, RootPt, chalkGrain, growRoot, makeCanvas, paintRoots, rng } from "./art";

// The level: a cavern hanging upside down under the earth. A soil ceiling with roots,
// floating root-tangle platforms, and a tangled floor far below.

export const WW = 3800;
export const WH = 1500;
/** Background layers are drawn at these fractions of camera movement. */
export const PARALLAX = { sky: 0.06, far: 0.28, mid: 0.58, fg: 1.22 };
/** Generous maximum view size, so layers always cover the screen. */
const MAXV = { w: 960, h: 560 };

export interface Plat { x0: number; x1: number; y: number; }

export class World {
  plats: Plat[] = [];
  timing = { main: 0, layers: 0 };
  spawn = { x: 300, y: 600 };
  main!: HTMLCanvasElement;
  mid!: HTMLCanvasElement;
  far!: HTMLCanvasElement;
  fg!: HTMLCanvasElement;
  sky!: HTMLCanvasElement;
  stars: { x: number; y: number; c: string; big: boolean; ph: number }[] = [];

  ceilY(x: number) {
    return 70 + noise(x * 0.5, 0, 60, 3) * 50;
  }

  floorY(x: number) {
    return WH - 90 + noise(x * 0.5, 7, 70, 4) * 36;
  }

  constructor(seed = 5) {
    const rnd = rng(seed);
    // Rows of floating platforms, staggered so there is always a way up
    let row = 0;
    for (let y = 300; y < WH - 190; y += 118 + rnd() * 20) {
      let x = 60 + (row % 2 ? 140 : 0) + rnd() * 60;
      while (x < WW - 120) {
        const w = 110 + rnd() * 200;
        this.plats.push({ x0: Math.round(x), x1: Math.round(Math.min(WW - 40, x + w)), y: Math.round(y + (rnd() - 0.5) * 30) });
        x += w + 70 + rnd() * 120;
      }
      row++;
    }
    const mid = this.plats.filter((p) => p.y > WH * 0.45 && p.y < WH * 0.6 && p.x0 < 600);
    const sp = mid[0] ?? this.plats[0];
    this.spawn = { x: (sp.x0 + sp.x1) / 2, y: sp.y };

    const a = performance.now();
    this.paintMain(seed);
    const b = performance.now();
    this.paintLayers(seed);
    this.timing = { main: Math.round(b - a), layers: Math.round(performance.now() - b) };
  }

  private paintMain(seed: number) {
    const { c, x } = makeCanvas(WW, WH);
    const rnd = rng(seed * 7 + 1);
    // Soil ceiling with a chalky lower edge
    for (let i = 0; i < WW; i++) {
      const cy = this.ceilY(i);
      const g = noise(i, 0, 9, 9);
      x.fillStyle = COL.soil[g > 0.6 ? 2 : g > 0.35 ? 1 : 0];
      x.fillRect(i, 0, 1, Math.round(cy));
    }
    // Pebbles and grit in the soil
    for (let k = 0; k < 900; k++) {
      const px = Math.floor(rnd() * WW);
      const py = Math.floor(rnd() * (this.ceilY(px) - 6));
      x.fillStyle = rnd() < 0.5 ? "#2c2338" : "#1f1829";
      x.fillRect(px, py, 1 + Math.floor(rnd() * 2), 1);
    }
    const ceilRoots: RootPt[] = [];
    const hang: GrowOpts = { pull: Math.PI / 2, pullStrength: 0.04, wobble: 0.18, taper: 0.985, branch: 0.025, maxDepth: 2, minR: 0.45, bottom: WH };
    // A chalky band along the ceiling edge
    const edge: RootPt[] = [];
    for (let i = 0; i < WW; i += 2) edge.push({ x: i, y: this.ceilY(i) - 1, r: 2.2 + noise(i, 3, 20, 5) * 2 });
    for (let k = 0; k < 140; k++) {
      const rx = rnd() * WW;
      growRoot(ceilRoots, rx, this.ceilY(rx), Math.PI / 2 + (rnd() - 0.5) * 0.6, 1.4 + rnd() * 2.2, 40 + rnd() * 130, hang, rnd);
    }
    paintRoots(x, edge.concat(ceilRoots), COL.chalk);

    // Floor tangle
    const floor: RootPt[] = [];
    for (let i = 0; i < WW; i += 1.5) floor.push({ x: i, y: this.floorY(i) + 6 + Math.sin(i * 0.03) * 2, r: 6 });
    const flat: GrowOpts = { pull: 0, pullStrength: 0.05, wobble: 0.12, taper: 0.9995, branch: 0.004, maxDepth: 1, minR: 1, bottom: WH };
    for (let k = 0; k < 18; k++) {
      const sx = (k / 18) * WW - 60;
      growRoot(floor, sx, this.floorY(Math.max(0, sx)) + 10 + rnd() * 8, 0, 3 + rnd() * 2.5, 320, flat, rnd);
    }
    x.fillStyle = COL.soil[0];
    for (let i = 0; i < WW; i++) x.fillRect(i, Math.round(this.floorY(i) + 10), 1, WH);
    paintRoots(x, floor, COL.chalk);

    // Floating platforms: a few roots twisted together, with rootlets dangling below
    for (const p of this.plats) {
      const pts: RootPt[] = [];
      const len = p.x1 - p.x0 + 14;
      const strands = 3 + Math.floor(rnd() * 2);
      for (let s = 0; s < strands; s++) {
        const opts: GrowOpts = { pull: 0, pullStrength: 0.06, wobble: 0.1, taper: 0.9985, branch: 0, maxDepth: 0, minR: 0.8, bottom: WH };
        growRoot(pts, p.x0 - 7, p.y + 4 + s * 2.6 + rnd() * 2, (rnd() - 0.5) * 0.2, 4.4 - s * 0.6, len, opts, rnd);
      }
      // Keep the walkable top flat-ish: clamp strand tops to the platform line
      for (const q of pts) if (q.y - q.r < p.y) q.y = p.y + q.r;
      const dangle: GrowOpts = { pull: Math.PI / 2, pullStrength: 0.05, wobble: 0.22, taper: 0.975, branch: 0.05, maxDepth: 2, minR: 0.45, bottom: WH };
      for (let dx = p.x0 + 4; dx < p.x1; dx += 9 + rnd() * 14) growRoot(pts, dx, p.y + 9, Math.PI / 2 + (rnd() - 0.5) * 0.8, 1.2 + rnd() * 1.6, 15 + rnd() * 55, dangle, rnd);
      paintRoots(x, pts, COL.chalk);
      // Tiny pale flowers and moss tufts on top
      for (let dx = p.x0 + 6; dx < p.x1 - 4; dx += 7 + rnd() * 20) {
        if (rnd() < 0.5) {
          x.fillStyle = rnd() < 0.5 ? "#ffd9f0" : "#cfe6ff";
          x.fillRect(Math.round(dx), p.y - 2, 1, 1);
          x.fillStyle = "#a399b2";
          x.fillRect(Math.round(dx), p.y - 1, 1, 1);
        }
      }
    }
    chalkGrain(x, WW, WH, seed + 3, 1);
    this.main = c;
  }

  private paintLayers(seed: number) {
    // Sky: a deep void with faint dithered nebula clouds
    {
      const w = Math.ceil(WW * PARALLAX.sky + MAXV.w);
      const h = Math.ceil(WH * PARALLAX.sky + MAXV.h);
      const { c, x } = makeCanvas(w, h);
      const img = x.createImageData(w, h);
      const d = img.data;
      const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const c0 = [6, 5, 11];
      const c1 = [18, 12, 31];
      const c2 = [32, 18, 52];
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const n = noise(i, j, 70, seed + 20) * 0.7 + noise(i, j, 22, seed + 21) * 0.3;
          const v = n + (j / h) * 0.25 + (B[(j % 4) * 4 + (i % 4)] / 16 - 0.5) * 0.12;
          const col = v > 0.74 ? c2 : v > 0.5 ? c1 : c0;
          const k = (j * w + i) * 4;
          d[k] = col[0];
          d[k + 1] = col[1];
          d[k + 2] = col[2];
          d[k + 3] = 255;
        }
      x.putImageData(img, 0, 0);
      this.sky = c;
      const rnd = rng(seed + 99);
      for (let k = 0; k < 900; k++)
        this.stars.push({ x: rnd() * w, y: rnd() * h, c: COL.star[Math.floor(rnd() * 4)], big: rnd() < 0.05, ph: rnd() * 6 });
    }
    // Far and mid roots: giant trunks hanging from the dark above
    const layer = (p: number, ramp: string[], count: number, rMin: number, rMax: number, s: number) => {
      const w = Math.ceil(WW * p + MAXV.w);
      const h = Math.ceil(WH * p + MAXV.h);
      const { c, x } = makeCanvas(w, h);
      const rnd = rng(s);
      const pts: RootPt[] = [];
      const o: GrowOpts = { pull: Math.PI / 2, pullStrength: 0.012, wobble: 0.12, taper: 0.9975, branch: 0.009, maxDepth: 3, minR: 0.5, bottom: h };
      for (let k = 0; k < count; k++) {
        const rx = (k / count) * w + rnd() * (w / count) * 0.8;
        growRoot(pts, rx, -4, Math.PI / 2 + (rnd() - 0.5) * 0.3, rMin + rnd() * (rMax - rMin), h * (0.55 + rnd() * 0.5), o, rnd);
      }
      paintRoots(x, pts, ramp, ramp === COL.mid);
      chalkGrain(x, w, h, s + 1, 0.8);
      return c;
    };
    this.far = layer(PARALLAX.far, COL.far, 26, 3, 6, seed + 31);
    this.mid = layer(PARALLAX.mid, COL.mid, 22, 5, 10, seed + 41);
    // Foreground: a few dark roots close to the camera, framing the top of the screen
    {
      const w = Math.ceil(WW * PARALLAX.fg + MAXV.w);
      const h = 260;
      const { c, x } = makeCanvas(w, h);
      const rnd = rng(seed + 51);
      const pts: RootPt[] = [];
      const o: GrowOpts = { pull: Math.PI / 2, pullStrength: 0.03, wobble: 0.16, taper: 0.982, branch: 0.04, maxDepth: 3, minR: 0.6, bottom: h };
      for (let k = 0; k < 30; k++) growRoot(pts, rnd() * w, -4, Math.PI / 2, 5 + rnd() * 6, 60 + rnd() * 160, o, rnd);
      paintRoots(x, pts, ["#030206", "#08060d", "#0f0b17", "#18121f", "#211a2b"], false);
      this.fg = c;
    }
  }

  /** The platform you would land on when falling from prevY to y at x. */
  landing(x: number, prevY: number, y: number, ignore: Plat | null): Plat | null {
    for (const p of this.plats) {
      if (p === ignore || x < p.x0 - 4 || x > p.x1 + 4) continue;
      if (prevY <= p.y + 0.5 && y >= p.y) return p;
    }
    return null;
  }

  platAt(x: number, y: number): Plat | null {
    for (const p of this.plats) if (x >= p.x0 - 4 && x <= p.x1 + 4 && Math.abs(y - p.y) < 1) return p;
    return null;
  }
}
