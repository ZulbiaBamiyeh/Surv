import { OUTLINE, Ramp } from "./palette";

// A tiny pixel painter. Shapes are drawn as 3D-ish primitives with surface normals,
// lit from the top left, then snapped onto a color ramp. This gives every sprite
// consistent, hand-shaded-looking lighting.

export interface Sprite {
  /** Normal look. */
  n: HTMLCanvasElement;
  /** All-white look for hit flashes. */
  f: HTMLCanvasElement;
  /** Mirrored versions, for facing left. */
  nl: HTMLCanvasElement;
  fl: HTMLCanvasElement;
  w: number;
  h: number;
}

const L = (() => {
  const v = [-0.5, -0.8, 0.7];
  const m = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / m) as [number, number, number];
})();

export interface ShadeOpts {
  /** Added to the light value; negative darkens (for parts behind). */
  bias?: number;
  /** Light value above which the pixel becomes the brightest highlight. */
  spec?: number;
  /** Darkens the pixels of other parts that touch this one, drawing a soft inner line. */
  sep?: number;
  /** The light value never goes below this (keeps faces from getting muddy). */
  floor?: number;
  /** Only paint where this returns true. */
  clip?: (x: number, y: number) => boolean;
}

/** Light value for a surface normal: 0 is darkest, 1 is brightest. */
export function lightOf(nx: number, ny: number, nz: number, o: ShadeOpts = {}): number {
  const m = Math.hypot(nx, ny, nz) || 1;
  const d = (nx * L[0] + ny * L[1] + nz * L[2]) / m;
  if (o.spec !== undefined && d > o.spec) return 2;
  return Math.max(o.floor ?? 0, 0.12 + 0.8 * Math.max(0, d) + (o.bias ?? 0));
}

export class Painter {
  readonly ramp: (Ramp | null)[];
  readonly shade: Float32Array;
  readonly color: (string | null)[];

  constructor(readonly w: number, readonly h: number) {
    this.ramp = new Array(w * h).fill(null);
    this.shade = new Float32Array(w * h);
    this.color = new Array(w * h).fill(null);
  }

  /** Paints every pixel whose center passes `test`, with a light value from `light`. */
  fill(test: (x: number, y: number) => boolean, ramp: Ramp, light: (x: number, y: number) => number, o: ShadeOpts = {}) {
    const painted = new Set<number>();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        if (!test(cx, cy) || (o.clip && !o.clip(cx, cy))) continue;
        const i = y * this.w + x;
        this.ramp[i] = ramp;
        this.shade[i] = light(cx, cy);
        this.color[i] = null;
        painted.add(i);
      }
    if (o.sep) {
      const touched = new Set<number>();
      for (const i of painted) {
        const x = i % this.w;
        const y = (i / this.w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          const j = ny * this.w + nx;
          if (painted.has(j) || touched.has(j) || !this.ramp[j] || this.ramp[j] === ramp) continue;
          touched.add(j);
          this.shade[j] -= o.sep;
        }
      }
    }
  }

  ellipsoid(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, o: ShadeOpts = {}) {
    this.fill(
      (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
      ramp,
      (x, y) => {
        const u = (x - cx) / rx;
        const v = (y - cy) / ry;
        return lightOf(u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v)), o);
      },
      o,
    );
  }

  /** A vertical rounded column whose center and radius can vary by row (robes, legs, hats). */
  column(
    y0: number, y1: number, center: (y: number) => number, radius: (y: number) => number, ramp: Ramp,
    o: ShadeOpts & { tilt?: number } = {},
  ) {
    this.fill(
      (x, y) => y >= y0 && y <= y1 && Math.abs(x - center(y)) <= radius(y),
      ramp,
      (x, y) => {
        const u = Math.max(-1, Math.min(1, (x - center(y)) / Math.max(0.01, radius(y))));
        return lightOf(u, o.tilt ?? -0.2, Math.sqrt(1 - u * u), o);
      },
      o,
    );
  }

  /** A flat polygon face with a fixed light value (dice faces, wings, gem facets). */
  poly(pts: [number, number][], ramp: Ramp, light: number, o: ShadeOpts = {}) {
    this.fill((x, y) => inPoly(pts, x, y), ramp, () => light, o);
  }

  /** A thick line, shaded like a round rod. */
  rod(x0: number, y0: number, x1: number, y1: number, r: number, ramp: Ramp, o: ShadeOpts = {}) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    const len = Math.sqrt(len2);
    const px = -dy / len;
    const py = dx / len;
    const dist = (x: number, y: number) => {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
      const qx = x0 + dx * t;
      const qy = y0 + dy * t;
      return { d: Math.hypot(x - qx, y - qy), side: (x - qx) * px + (y - qy) * py };
    };
    this.fill(
      (x, y) => dist(x, y).d <= r,
      ramp,
      (x, y) => {
        const { side } = dist(x, y);
        const u = Math.max(-1, Math.min(1, side / r));
        return lightOf(px * u, py * u, Math.sqrt(1 - u * u), o);
      },
      o,
    );
  }

  /** Glowing shapes colored by heat (0..1) instead of lighting. */
  glow(test: (x: number, y: number) => boolean, ramp: Ramp, heat: (x: number, y: number) => number) {
    this.fill(test, ramp, heat);
  }

  /** Sets one pixel to an exact color. Uses a ramp's darkest color for the outline logic. */
  dot(x: number, y: number, color: string, ramp?: Ramp) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = Math.floor(y) * this.w + Math.floor(x);
    this.color[i] = color;
    this.ramp[i] = ramp ?? this.ramp[i] ?? [color];
  }

  /** Darkens or lightens one already-painted pixel by whole ramp steps. */
  nudge(x: number, y: number, steps: number) {
    const i = Math.floor(y) * this.w + Math.floor(x);
    const r = this.ramp[i];
    if (!r) return;
    this.shade[i] += steps / r.length;
    this.color[i] = null;
  }

  erase(x: number, y: number) {
    const i = Math.floor(y) * this.w + Math.floor(x);
    this.ramp[i] = null;
    this.color[i] = null;
  }

  colorAt(i: number): string | null {
    const r = this.ramp[i];
    if (!r) return null;
    if (this.color[i]) return this.color[i];
    const n = r.length;
    const idx = Math.max(0, Math.min(n - 1, Math.floor(this.shade[i] * n)));
    return r[idx];
  }

  /**
   * Bakes the sprite. The outline uses each part's own darkest color on the lit
   * (top and left) side and a deep ink color on the shadow side.
   */
  bake(outline = true): Sprite {
    const W = this.w + 2;
    const H = this.h + 2;
    const make = (flash: boolean) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d")!;
      const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < this.w && j < this.h ? j * this.w + i : -1);
      if (outline)
        for (let j = -1; j <= this.h; j++)
          for (let i = -1; i <= this.w; i++) {
            const k = at(i, j);
            if (k >= 0 && this.ramp[k]) continue;
            const right = at(i + 1, j);
            const below = at(i, j + 1);
            const left = at(i - 1, j);
            const above = at(i, j - 1);
            const litSide = (right >= 0 && this.ramp[right]) || (below >= 0 && this.ramp[below]);
            const darkSide = (left >= 0 && this.ramp[left]) || (above >= 0 && this.ramp[above]);
            if (!litSide && !darkSide) continue;
            let col = OUTLINE;
            if (litSide && !darkSide) {
              const src = (right >= 0 && this.ramp[right]) || this.ramp[below]!;
              col = src[0];
            }
            x.fillStyle = flash ? "#ffffff" : col;
            x.fillRect(i + 1, j + 1, 1, 1);
          }
      for (let j = 0; j < this.h; j++)
        for (let i = 0; i < this.w; i++) {
          const col = this.colorAt(j * this.w + i);
          if (!col) continue;
          x.fillStyle = flash ? "#ffffff" : col;
          x.fillRect(i + 1, j + 1, 1, 1);
        }
      return c;
    };
    const n = make(false);
    const f = make(true);
    return { n, f, nl: mirror(n), fl: mirror(f), w: W, h: H };
  }
}

export function mirror(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext("2d")!;
  x.translate(src.width, 0);
  x.scale(-1, 1);
  x.drawImage(src, 0, 0);
  return c;
}

export function inPoly(pts: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Small seeded random generator so generated art is the same every time. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
