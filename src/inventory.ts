import { CFG } from "./config";
import { GEAR, GearId, MAX_TIER, SCROLLS, ScrollDef, ScrollId } from "./content";
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
  def: ScrollId;
  tier: number;
  sockets: Record<SocketKey, NumberItem | null>;
}

export interface GearItem extends Base {
  kind: "gear";
  def: GearId;
  tier: number;
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

export type Item = ScrollItem | GearItem | DieItem | NumberItem;

export const makeScroll = (def: ScrollId, tier = 1): ScrollItem => ({
  id: nextId++, kind: "scroll", def, tier, x: 0, y: 0, w: 1, h: 2, sockets: { count: null, speed: null },
});

export const makeGear = (def: GearId, tier = 1): GearItem => ({
  id: nextId++, kind: "gear", def, tier, x: 0, y: 0, w: GEAR[def].w, h: GEAR[def].h,
});

export const makeDie = (faces: number): DieItem => ({ id: nextId++, kind: "die", faces, x: 0, y: 0, ...dieSize(faces) });

export const makeNumber = (value: number, faces: number): NumberItem => ({
  id: nextId++, kind: "number", value, faces, x: 0, y: 0, w: 1, h: 1,
});

export function itemName(it: Item): string {
  if (it.kind === "scroll") return SCROLLS[it.def].name;
  if (it.kind === "gear") return GEAR[it.def].name;
  if (it.kind === "die") return `d${it.faces}`;
  return String(it.value);
}

export class Bag {
  readonly cols = CFG.bag.cols;
  readonly rows = CFG.bag.rows;
  items: Item[] = [];
  /** An item waiting to be placed because the bag was full. */
  pending: Item | null = null;

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
    if (this.pending === item) this.pending = null;
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
    if (this.pending === item) this.pending = null;
  }

  get scrolls(): ScrollItem[] {
    return this.items.filter((i): i is ScrollItem => i.kind === "scroll");
  }

  get gear(): GearItem[] {
    return this.items.filter((i): i is GearItem => i.kind === "gear");
  }

  get unrolledDice(): number {
    return this.items.filter((i) => i.kind === "die").length + (this.pending?.kind === "die" ? 1 : 0);
  }

  /** True when two items share an edge in the grid. */
  touching(a: Item, b: Item): boolean {
    const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
    const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
    return ((a.x + a.w === b.x || b.x + b.w === a.x) && overlapY) || ((a.y + a.h === b.y || b.y + b.h === a.y) && overlapX);
  }

  canMerge(a: Item, b: Item): boolean {
    if (a === b) return false;
    if (a.kind === "scroll" && b.kind === "scroll") return a.def === b.def && a.tier === b.tier && b.tier < MAX_TIER;
    if (a.kind === "gear" && b.kind === "gear") return a.def === b.def && a.tier === b.tier && b.tier < MAX_TIER;
    return false;
  }

  /**
   * Merges `src` into `dst`, raising its tier. Numbers socketed in `src` are returned
   * so the caller can put them back in the bag.
   */
  merge(src: ScrollItem | GearItem, dst: ScrollItem | GearItem): NumberItem[] {
    this.remove(src);
    dst.tier++;
    const loose: NumberItem[] = [];
    if (src.kind === "scroll" && dst.kind === "scroll") {
      for (const k of ["count", "speed"] as SocketKey[]) {
        const n = src.sockets[k];
        if (!n) continue;
        if (!dst.sockets[k] || dst.sockets[k]!.value < n.value) {
          if (dst.sockets[k]) loose.push(dst.sockets[k]!);
          dst.sockets[k] = n;
        } else loose.push(n);
      }
    }
    return loose;
  }
}

// ---------- Stats ----------

export interface SpellStats {
  item: ScrollItem;
  def: ScrollDef;
  count: number;
  cooldown: number;
  damage: number;
  area: number;
  /** Burn damage per second added by Ember Rings. */
  burn: number;
  /** Speed socket pips (Orbit Rocks spin faster with them). */
  pips: number;
  /** Names of the gear boosting this scroll. */
  boosts: string[];
}

export interface Loadout {
  spells: SpellStats[];
  moveMul: number;
  pickupMul: number;
  maxHpBonus: number;
  diceMul: number;
}

export function computeLoadout(bag: Bag, level: number): Loadout {
  let cooldownMul = 1;
  let moveMul = 1;
  let pickupMul = 1;
  let maxHpBonus = 0;
  let diceMul = 1;
  for (const g of bag.gear) {
    if (g.def === "hourglass") cooldownMul *= 0.88 ** g.tier;
    else if (g.def === "boots") moveMul += 0.15 * g.tier;
    else if (g.def === "magnet") pickupMul += 0.5 * g.tier;
    else if (g.def === "heart") maxHpBonus += 30 * g.tier;
    else if (g.def === "clover") diceMul += 0.75 * g.tier;
  }
  const spells = bag.scrolls.map((s): SpellStats => {
    const def = SCROLLS[s.def];
    const tierMul = 1 + 0.6 * (s.tier - 1);
    let count = (s.sockets.count?.value ?? def.baseCount) + (s.tier - 1);
    if (s.def === "ward" || s.def === "mend") count = (s.sockets.count?.value ?? 0) + (s.tier - 1) * 2;
    const pips = s.sockets.speed?.value ?? 0;
    let dmgMul = tierMul * (1 + CFG.levelDamage * (level - 1));
    let areaMul = 1 + 0.15 * (s.tier - 1);
    let burn = 0;
    const boosts: string[] = [];
    for (const g of bag.gear) {
      if (!GEAR[g.def].adjacent || !bag.touching(s, g)) continue;
      boosts.push(GEAR[g.def].name);
      if (g.def === "ember") burn += 4 * g.tier;
      else if (g.def === "whetstone") dmgMul *= 1 + 0.25 * g.tier;
      else if (g.def === "prism") count += g.tier;
      else if (g.def === "lens") areaMul *= 1 + 0.3 * g.tier;
    }
    return {
      item: s, def, count, pips, burn, boosts,
      cooldown: (def.cooldown / (1 + CFG.speedPerPip * pips)) * (s.def === "orbit" ? 1 : cooldownMul),
      damage: def.damage * dmgMul,
      area: def.area * areaMul,
    };
  });
  return { spells, moveMul, pickupMul, maxHpBonus, diceMul };
}
