import { batFrame, heroFrame, kingFrame, skeletonFrame, slimeFrame } from "./characters";
import { JELLY, boarFrame, ghostFrame, golemFrame, shroomFrame } from "./creatures";
import { carrotSprite, fireballFrame, gemSprite, glowSprite, magnetSprite, moonboltFrame, mothSprite, poofFrames, shadowSprite, sparkFrames, starSprite } from "./items";
import { RAMPS } from "./palette";
import type { Sprite } from "./painter";
import { CHUNK, PlacedProp, PropKit, chunkProps, groundChunk, makePropKit } from "./world";

export type { Sprite } from "./painter";

export const DIRS = 16;

/** The night's color grade: everything on the ground is washed in cool moonlight. */
const NIGHT_GROUND = "#4f6fb0";
const NIGHT_PROPS = "#7f96cc";

/** Multiplies a canvas by a color, keeping its shape. */
function grade(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext("2d")!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "multiply";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = "destination-in";
  x.drawImage(src, 0, 0);
  return c;
}

/** All game art, generated once at startup. */
export function buildArt() {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const fire: Sprite[][] = range(DIRS).map((d) => range(3).map((f) => fireballFrame((d / DIRS) * Math.PI * 2, f)));
  const shadows = new Map<number, HTMLCanvasElement>();
  return {
    heroIdle: range(4).map((i) => heroFrame(i / 4, false)),
    heroWalk: range(6).map((i) => heroFrame(i / 6, true)),
    slime: range(8).map((i) => slimeFrame(i / 8)),
    jelly: range(8).map((i) => slimeFrame(i / 8, JELLY, 1.35)),
    king: range(8).map((i) => kingFrame(i / 8)),
    bat: range(4).map((i) => batFrame(i / 4)),
    skel: range(4).map((i) => skeletonFrame(i / 4)),
    ghost: range(6).map((i) => ghostFrame(i / 6)),
    shroom: range(4).map((i) => shroomFrame(i / 4)),
    shroomSpit: shroomFrame(0, true),
    boar: range(4).map((i) => boarFrame(i / 4)),
    boarStamp: range(4).map((i) => boarFrame(i / 4, true)),
    golem: range(4).map((i) => golemFrame(i / 4)),
    gem: gemSprite(["#2a2a6a", "#5a5ad0", "#9aa0ff", "#d8dcff", "#ffffff"]),
    bigGem: gemSprite(RAMPS.gold, 1.35),
    magnet: magnetSprite(),
    carrot: carrotSprite(),
    star: starSprite(),
    moth: [mothSprite(true), mothSprite(false)],
    bolt: range(DIRS).map((d) => moonboltFrame((d / DIRS) * Math.PI * 2)),
    fire,
    fireGlow: glowSprite(11, "#ff7a1a"),
    moonGlow: glowSprite(9, "#c0d0ff"),
    goldGlow: glowSprite(14, "#ffd640"),
    greenGlow: glowSprite(9, "#7ad040"),
    iceGlow: glowSprite(8, "#8fd8ff"),
    zapGlow: glowSprite(9, "#ffe46a"),
    poof: poofFrames(7, 18),
    spark: sparkFrames(),
    shadow(w: number) {
      let s = shadows.get(w);
      if (!s) shadows.set(w, (s = shadowSprite(w)));
      return s;
    },
  };
}

export type Art = ReturnType<typeof buildArt>;

/** Ground and props, generated chunk by chunk as the camera moves, in night colors. */
export class WorldArt {
  private chunks = new Map<string, { canvas: HTMLCanvasElement; props: PlacedProp[]; used: number }>();
  private kit: PropKit;
  private queue: [number, number][] = [];
  readonly size = CHUNK;

  constructor() {
    const kit = makePropKit();
    for (const list of [kit.trees, kit.bushes, kit.rocks, kit.mushrooms, [kit.stump], kit.grass])
      for (const p of list) p.sprite = { ...p.sprite, n: grade(p.sprite.n, NIGHT_PROPS) };
    this.kit = kit;
  }

  private key(cx: number, cy: number) {
    return cx + "," + cy;
  }

  get(cx: number, cy: number, frame: number) {
    const k = this.key(cx, cy);
    let ch = this.chunks.get(k);
    if (!ch) {
      ch = { canvas: grade(groundChunk(cx * CHUNK, cy * CHUNK), NIGHT_GROUND), props: chunkProps(cx, cy, this.kit), used: frame };
      this.chunks.set(k, ch);
    }
    ch.used = frame;
    return ch;
  }

  /** Generates one nearby chunk ahead of time per frame, so walking never stutters. */
  prefetch(cx0: number, cy0: number, cx1: number, cy1: number, frame: number) {
    if (this.queue.length === 0)
      for (let cy = cy0 - 1; cy <= cy1 + 1; cy++)
        for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) if (!this.chunks.has(this.key(cx, cy))) this.queue.push([cx, cy]);
    const next = this.queue.shift();
    if (next) this.get(next[0], next[1], frame);
    if (this.chunks.size > 48) {
      const oldest = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, 8);
      for (const [k] of oldest) this.chunks.delete(k);
    }
  }
}

/** A sprite scaled up as an image URL, for the HTML interface. */
export function spriteURL(s: Sprite, scale: number): string {
  const c = document.createElement("canvas");
  c.width = s.w * scale;
  c.height = s.h * scale;
  const x = c.getContext("2d")!;
  x.imageSmoothingEnabled = false;
  x.drawImage(s.n, 0, 0, c.width, c.height);
  return c.toDataURL();
}
