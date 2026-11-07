import { CFG } from "./config";
import { dieSize } from "./dice";

let nextId = 1;

interface Base {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SocketKey = "count" | "speed";

export interface ScrollItem extends Base {
  kind: "scroll";
  name: string;
  sockets: Record<SocketKey, NumberItem | null>;
}

export interface DieItem extends Base {
  kind: "die";
  faces: number;
}

export interface NumberItem extends Base {
  kind: "number";
  value: number;
  /** The die it was rolled on, shown as a small label. */
  faces: number;
}

export type Item = ScrollItem | DieItem | NumberItem;

export const makeScroll = (): ScrollItem => ({
  id: nextId++, kind: "scroll", name: "Fireball", x: 0, y: 0, w: 2, h: 2,
  sockets: { count: null, speed: null },
});

export const makeDie = (faces: number): DieItem => ({ id: nextId++, kind: "die", faces, x: 0, y: 0, ...dieSize(faces) });

export const makeNumber = (value: number, faces: number): NumberItem => ({
  id: nextId++, kind: "number", value, faces, x: 0, y: 0, w: 1, h: 1,
});

export class Bag {
  readonly cols = CFG.bag.cols;
  readonly rows = CFG.bag.rows;
  items: Item[] = [];

  fits(w: number, h: number, x: number, y: number, ignore?: Item): boolean {
    if (x < 0 || y < 0 || x + w > this.cols || y + h > this.rows) return false;
    for (const it of this.items) {
      if (it === ignore) continue;
      if (x < it.x + it.w && x + w > it.x && y < it.y + it.h && y + h > it.y) return false;
    }
    return true;
  }

  placeAt(item: Item, x: number, y: number): boolean {
    if (!this.fits(item.w, item.h, x, y, item)) return false;
    item.x = x;
    item.y = y;
    if (!this.items.includes(item)) this.items.push(item);
    return true;
  }

  /** Puts the item in the first free spot. Returns false if the bag is full. */
  add(item: Item): boolean {
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) if (this.placeAt(item, x, y)) return true;
    return false;
  }

  remove(item: Item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  get scroll(): ScrollItem {
    return this.items.find((i): i is ScrollItem => i.kind === "scroll")!;
  }

  get unrolledDice(): number {
    return this.items.filter((i) => i.kind === "die").length;
  }
}

export interface FireballStats {
  count: number;
  cooldown: number;
  damage: number;
}

export function fireballStats(scroll: ScrollItem, level: number): FireballStats {
  const fb = CFG.fireball;
  const count = scroll.sockets.count?.value ?? 1;
  const pips = scroll.sockets.speed?.value ?? 0;
  return {
    count,
    cooldown: fb.cooldown / (1 + fb.speedPerPip * pips),
    damage: fb.damage * (1 + fb.damagePerLevel * (level - 1)),
  };
}
