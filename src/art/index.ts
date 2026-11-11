import { batFrame, heroFrame, kingFrame, skeletonFrame, slimeFrame } from "./characters";
import { JELLY, boarFrame, ghostFrame, golemFrame, shroomFrame, snowmanFrame, totemFrame, yetiFrame } from "./creatures";
import { glyph } from "./glyphs";
import {
  Emblem, carrotSprite, chestSprite, fireballFrame, gemSprite, glowSprite, glyphScroll, magnetSprite, moonSprite, poofFrames,
  scrollSprite, shadowSprite, sparkFrames, sunSprite,
} from "./items";
import { ALL_SCROLLS, ALL_SUPPORTS, SCROLLS, SUPPORTS, ScrollId, SupportId } from "../content";
import { RAMPS, Ramp } from "./palette";
import type { Sprite } from "./painter";
import { CHUNK, PlacedProp, PropKit, chunkProps, groundChunk, makePropKit } from "./world";

export type { Sprite } from "./painter";

export const FIRE_DIRS = 16;

/** Scrolls with a hand-painted emblem; the rest use a glyph. */
const EMBLEMS: Partial<Record<ScrollId | SupportId, Emblem>> = {
  fire: "fire", frost: "frost", storm: "zap", toxic: "poison", moon: "moon", charm: "mend", ward: "ward",
};
export const SCROLL_GLYPH: Record<ScrollId | SupportId, string> = {
  fire: "flame", frost: "flake", storm: "bolt", toxic: "drop", moon: "moon", meteor: "meteor", suns: "sun", verdant: "flame",
  totem: "totem", spirit: "ghost", burrow: "carrot", dice: "die", clock: "hourglass", mirror: "mirror", gravity: "vortex",
  confuse: "swirl", charm: "heart", moonlight: "moon", ward: "shield", swift: "paw", clover: "clover",
};
const seal = (color: string): Ramp => ["#140d1c", color, color, "#ffffff"];

function scrollFor(id: ScrollId | SupportId, color: string): Sprite {
  const e = EMBLEMS[id];
  return e ? scrollSprite(e) : glyphScroll(glyph(SCROLL_GLYPH[id], color), seal(color));
}

/** All game art, generated once at startup. */
export function buildArt() {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const fire: Sprite[][] = range(FIRE_DIRS).map((d) => range(3).map((f) => fireballFrame((d / FIRE_DIRS) * Math.PI * 2, f)));
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
    totem: range(4).map((i) => totemFrame(i / 4)),
    wicker: range(4).map((i) => totemFrame(i / 4, true)),
    snowman: range(4).map((i) => snowmanFrame(i / 4)),
    yeti: range(4).map((i) => yetiFrame(i / 4)),
    gem: gemSprite(RAMPS.gemBlue),
    bigGem: gemSprite(RAMPS.gemPink, 1.35),
    magnet: magnetSprite(),
    carrot: carrotSprite(),
    chest: chestSprite(),
    sun: sunSprite(),
    fire,
    fireGlow: glowSprite(11, "#ff7a1a"),
    greenGlow: glowSprite(11, "#7ad040"),
    goldGlow: glowSprite(12, "#ffd640"),
    orbGlow: glowSprite(8, "#8ae8ff"),
    poof: poofFrames(7, 18),
    spark: sparkFrames(),
    scrolls: new Map<ScrollId | SupportId, Sprite>([
      ...ALL_SCROLLS.map((id) => [id, scrollFor(id, SCROLLS[id].color)] as const),
      ...ALL_SUPPORTS.map((id) => [id, scrollFor(id, SUPPORTS[id].color)] as const),
    ]),
    lootScroll: scrollSprite("mend"),
    moon: moonSprite(false),
    bigMoon: moonSprite(true),
    moonGlow: glowSprite(9, "#fff2b0"),
    lootGlow: glowSprite(14, "#ffd0f0"),
    iceGlow: glowSprite(8, "#8fd8ff"),
    zapGlow: glowSprite(9, "#ffe46a"),
    voidGlow: glowSprite(16, "#a070ff"),
    shadow(w: number) {
      let s = shadows.get(w);
      if (!s) shadows.set(w, (s = shadowSprite(w)));
      return s;
    },
  };
}

export type Art = ReturnType<typeof buildArt>;

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
