// Every spell scroll and piece of gear in the game. Numbers here are the Tier 1 values.

export type ScrollId = "fireball" | "frost" | "zap" | "orbit" | "puddle" | "ward" | "mend";
export type GearId = "hourglass" | "boots" | "magnet" | "heart" | "clover" | "ember" | "whetstone" | "prism" | "lens";
export type Element = "fire" | "frost" | "zap" | "bonk" | "poison" | "holy";

export interface ScrollDef {
  name: string;
  element: Element;
  /** One sentence shown on cards and in the backpack. */
  desc: string;
  /** What the Count socket controls, e.g. "Fireballs per cast". */
  countLabel: string;
  /** Count when the socket is empty. */
  baseCount: number;
  cooldown: number;
  damage: number;
  /** Base radius in pixels for area spells. */
  area: number;
  utility?: boolean;
}

export const SCROLLS: Record<ScrollId, ScrollDef> = {
  fireball: {
    name: "Fireball", element: "fire", desc: "Shoots a fireball at the nearest enemy.",
    countLabel: "Fireballs per cast", baseCount: 1, cooldown: 0.8, damage: 10, area: 0,
  },
  frost: {
    name: "Frost Nova", element: "frost", desc: "A ring of ice bursts out around you, chilling everything it hits.",
    countLabel: "Waves per cast", baseCount: 1, cooldown: 3, damage: 7, area: 52,
  },
  zap: {
    name: "Zap Chain", element: "zap", desc: "Lightning strikes an enemy, then jumps to others nearby.",
    countLabel: "Extra jumps", baseCount: 2, cooldown: 1.5, damage: 9, area: 70,
  },
  orbit: {
    name: "Orbit Rocks", element: "bonk", desc: "Rocks circle you, bonking enemies away.",
    countLabel: "Rocks", baseCount: 2, cooldown: 0.5, damage: 7, area: 30,
  },
  puddle: {
    name: "Stink Puddle", element: "poison", desc: "Leaves a poison puddle that hurts everything standing in it.",
    countLabel: "Puddles per cast", baseCount: 1, cooldown: 2.6, damage: 4, area: 22,
  },
  ward: {
    name: "Ward", element: "holy", desc: "Every so often, a bubble makes you invulnerable for a few seconds.",
    countLabel: "Extra half-seconds", baseCount: 0, cooldown: 24, damage: 0, area: 0, utility: true,
  },
  mend: {
    name: "Mend", element: "holy", desc: "Every so often, heals you.",
    countLabel: "Extra healing (×3%)", baseCount: 0, cooldown: 35, damage: 0, area: 0, utility: true,
  },
};

export interface GearDef {
  name: string;
  desc: string;
  w: number;
  h: number;
  /** Adjacent gear only affects scrolls it touches in the backpack. */
  adjacent: boolean;
}

export const GEAR: Record<GearId, GearDef> = {
  hourglass: { name: "Hourglass", desc: "All scrolls cast 12% faster per tier.", w: 1, h: 2, adjacent: false },
  boots: { name: "Comfy Boots", desc: "+15% move speed per tier.", w: 2, h: 1, adjacent: false },
  magnet: { name: "Magnet", desc: "+50% pickup range per tier.", w: 1, h: 1, adjacent: false },
  heart: { name: "Big Heart", desc: "+30 max health per tier.", w: 1, h: 1, adjacent: false },
  clover: { name: "Lucky Clover", desc: "Enemies drop dice more often.", w: 1, h: 1, adjacent: false },
  ember: { name: "Ember Ring", desc: "Touching scrolls set enemies on fire.", w: 1, h: 1, adjacent: true },
  whetstone: { name: "Whetstone", desc: "Touching scrolls deal +25% damage per tier.", w: 1, h: 1, adjacent: true },
  prism: { name: "Prism", desc: "Touching scrolls get +1 count per tier.", w: 1, h: 1, adjacent: true },
  lens: { name: "Big Lens", desc: "Touching scrolls get +30% area per tier.", w: 2, h: 1, adjacent: true },
};

export const MAX_TIER = 3;

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: "#ffa424",
  frost: "#8fd8ff",
  zap: "#ffe46a",
  bonk: "#c8b8a0",
  poison: "#8ae04a",
  holy: "#fff2a0",
};
