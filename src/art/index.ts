import { batFrame, heroFrame, kingFrame, skeletonFrame, slimeFrame } from "./characters";
import { Emblem, dieSprite, fireballFrame, gearSprite, gemSprite, glowSprite, poofFrames, rockSprite, scrollSprite, shadowSprite, sparkFrames } from "./items";
import { GEAR, GearId, SCROLLS, ScrollId } from "../content";
import { DIE_RAMPS, RAMPS } from "./palette";
import type { Sprite } from "./painter";
import { CHUNK, PlacedProp, PropKit, chunkProps, groundChunk, makePropKit } from "./world";

export type { Sprite } from "./painter";

export const FIRE_DIRS = 16;

const EMBLEMS: Record<ScrollId, Emblem> = {
  fireball: "fire", frost: "frost", zap: "zap", orbit: "bonk", puddle: "poison", ward: "ward", mend: "mend",
};

/** All game art, generated once at startup. */
export function buildArt() {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const fire: Sprite[][] = range(FIRE_DIRS).map((d) => range(3).map((f) => fireballFrame((d / FIRE_DIRS) * Math.PI * 2, f)));
  const dice = new Map<number, Sprite>();
  for (const f of [3, 4, 6, 8, 10, 12, 20]) dice.set(f, dieSprite(f));
  const shadows = new Map<number, HTMLCanvasElement>();
  return {
    heroIdle: range(4).map((i) => heroFrame(i / 4, false)),
    heroWalk: range(6).map((i) => heroFrame(i / 6, true)),
    slime: range(8).map((i) => slimeFrame(i / 8)),
    king: range(8).map((i) => kingFrame(i / 8)),
    bat: range(4).map((i) => batFrame(i / 4)),
    skel: range(4).map((i) => skeletonFrame(i / 4)),
    gem: gemSprite(RAMPS.gemBlue),
    bigGem: gemSprite(RAMPS.gemPink, 1.35),
    fire,
    fireGlow: glowSprite(11, "#ff7a1a"),
    goldGlow: glowSprite(12, "#ffd640"),
    orbGlow: glowSprite(7, "#46d6f0"),
    poof: poofFrames(7, 18),
    spark: sparkFrames(),
    scrolls: new Map(
      (Object.keys(SCROLLS) as ScrollId[]).map((id) => [id, scrollSprite(EMBLEMS[id])] as const),
    ),
    gear: new Map((Object.keys(GEAR) as GearId[]).map((id) => [id, gearSprite(id)] as const)),
    rock: rockSprite(),
    iceGlow: glowSprite(8, "#8fd8ff"),
    zapGlow: glowSprite(9, "#ffe46a"),
    dice,
    shadow(w: number) {
      let s = shadows.get(w);
      if (!s) shadows.set(w, (s = shadowSprite(w)));
      return s;
    },
  };
}

export type Art = ReturnType<typeof buildArt>;

export const dieColor = (faces: number) => (DIE_RAMPS[faces] ?? RAMPS.ivory)[3];

/** Ground and props, generated chunk by chunk as the camera moves. */
export class WorldArt {
  private chunks = new Map<string, { canvas: HTMLCanvasElement; props: PlacedProp[]; used: number }>();
  private kit: PropKit = makePropKit();
  private queue: [number, number][] = [];
  readonly size = CHUNK;

  private key(cx: number, cy: number) {
    return cx + "," + cy;
  }

  get(cx: number, cy: number, frame: number) {
    const k = this.key(cx, cy);
    let ch = this.chunks.get(k);
    if (!ch) {
      ch = { canvas: groundChunk(cx * CHUNK, cy * CHUNK), props: chunkProps(cx, cy, this.kit), used: frame };
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
