// The night sky is your skill tree.
//
// The Moon sits in the middle with your first spell and six simple stars around it.
// Eight constellations surround it. Each one is a small, complete idea: a new spell (its
// first star, free when you find the constellation), three upgrades, and one bright star
// that changes how the spell works.
//
// You never see the whole sky in one night. You start with one constellation, falling
// stars reveal up to four more, and you can only light LIGHT_CAP stars in total, so every
// run is a different slice of the sky.

export type ConId = "moon" | "fox" | "stag" | "owl" | "toad" | "moth" | "whale" | "cat" | "hare";
export type StarKind = "gate" | "star" | "bright";

export interface Star {
  id: string;
  con: ConId;
  name: string;
  desc: string;
  kind: StarKind;
  /** Position on the sky map, in cells (the map is 3 × 3). */
  x: number;
  y: number;
  links: string[];
  icon: string;
}

export interface Constellation {
  id: ConId;
  name: string;
  /** The spell its first star teaches. */
  spell: string;
  color: string;
  /** One line for the picker. */
  blurb: string;
  /** Column and row on the 3 × 3 sky map. */
  cell: [number, number];
}

/** How many stars you can light in one night (first stars of constellations are free and extra). */
export const LIGHT_CAP = 16;

export const CONS: Record<ConId, Constellation> = {
  moon: { id: "moon", name: "The Moon", spell: "Moonbolt", color: "#fff2b0", blurb: "", cell: [1, 1] },
  stag: { id: "stag", name: "The Stag", spell: "Frost Ring", color: "#8fd8ff", blurb: "Rings of frost that push enemies back and slow them.", cell: [0, 0] },
  owl: { id: "owl", name: "The Owl", spell: "Chain Lightning", color: "#ffe46a", blurb: "Lightning that leaps from enemy to enemy.", cell: [1, 0] },
  fox: { id: "fox", name: "The Fox", spell: "Foxfire", color: "#ff8a3a", blurb: "Fans of flame that set everything alight.", cell: [2, 0] },
  moth: { id: "moth", name: "The Moth", spell: "Moon Moths", color: "#d8c8ff", blurb: "Glowing moths that circle you and bonk what comes close.", cell: [0, 1] },
  toad: { id: "toad", name: "The Toad", spell: "Bog Bubble", color: "#9ae04a", blurb: "Lobbed bubbles that leave poison puddles.", cell: [2, 1] },
  whale: { id: "whale", name: "The Whale", spell: "Whirlpool", color: "#6ab8ff", blurb: "Whirlpools that drag a crowd together, then burst.", cell: [0, 2] },
  hare: { id: "hare", name: "The Hare", spell: "Lucky Dice", color: "#ffd640", blurb: "Dice rolls: more bolts, lucky hits, and one big gamble.", cell: [1, 2] },
  cat: { id: "cat", name: "The Cat", spell: "Charm", color: "#ff80c0", blurb: "Charm enemies so they fight on your side.", cell: [2, 2] },
};

export const ALL_CONS = (Object.keys(CONS) as ConId[]).filter((c) => c !== "moon");

const stars: Star[] = [];
const byId = new Map<string, Star>();

function add(s: Omit<Star, "links">) {
  if (byId.has(s.id)) throw new Error("duplicate star " + s.id);
  const star = { ...s, links: [] };
  stars.push(star);
  byId.set(s.id, star);
}
function link(a: string, b: string) {
  byId.get(a)!.links.push(b);
  byId.get(b)!.links.push(a);
}

// ---------- The Moon ----------
add({ id: "moon", con: "moon", kind: "gate", name: "Moonbolt", icon: "moon", x: 1.5, y: 1.5, desc: "Shoots a bolt of moonlight at the nearest enemy." });
const MOON_STARS: [string, string, string, string][] = [
  ["bright", "Bright Moon", "up", "+25% damage for every spell."],
  ["twin", "Twin Bolt", "orb", "Moonbolt fires two bolts side by side."],
  ["fur", "Thick Fur", "heart", "+30 max health, and you heal 30 right away."],
  ["quick", "Quick Paws", "hourglass", "Every spell casts 20% faster."],
  ["ears", "Long Ears", "stars", "Pick up stardust from twice as far away."],
  ["hop", "Swift Hop", "paw", "+15% move speed."],
];
MOON_STARS.forEach(([id, name, icon, desc], i) => {
  const a = ((-90 + i * 60) * Math.PI) / 180;
  add({ id, con: "moon", kind: "star", name, icon, desc, x: 1.5 + Math.cos(a) * 0.36, y: 1.5 + Math.sin(a) * 0.36 });
  link("moon", id);
});

// ---------- Constellations ----------
/**
 * Each constellation is a kite of five stars pointing at the Moon: the free first star
 * nearest the Moon, three upgrades, and the bright star at the far tip. The bright star
 * can be reached through either wing.
 */
function constellation(id: ConId, gate: [string, string], a: [string, string, string, string], b: [string, string, string, string], c: [string, string, string, string], bright: [string, string, string, string]) {
  const [col, row] = CONS[id].cell;
  const cx = col + 0.5;
  const cy = row + 0.5;
  const len = Math.hypot(1.5 - cx, 1.5 - cy);
  const ix = (1.5 - cx) / len;
  const iy = (1.5 - cy) / len;
  const at = (inward: number, side: number) => ({ x: cx + ix * inward - iy * side, y: cy + iy * inward + ix * side });
  add({ id, con: id, kind: "gate", name: CONS[id].spell, icon: gate[0], desc: gate[1], ...at(0.3, 0) });
  add({ id: a[0], con: id, kind: "star", name: a[1], icon: a[2], desc: a[3], ...at(0.04, -0.32) });
  add({ id: b[0], con: id, kind: "star", name: b[1], icon: b[2], desc: b[3], ...at(-0.02, 0.32) });
  add({ id: c[0], con: id, kind: "star", name: c[1], icon: c[2], desc: c[3], ...at(0, 0) });
  add({ id: bright[0], con: id, kind: "bright", name: bright[1], icon: bright[2], desc: bright[3], ...at(-0.31, 0) });
  link(id, a[0]);
  link(id, b[0]);
  link(id, c[0]);
  link(a[0], bright[0]);
  link(b[0], bright[0]);
}

constellation("fox",
  ["flame", "Every 2.5 seconds, three flames fan out toward the nearest enemy. They pass through everything and set it on fire."],
  ["kindle", "Kindle", "up", "Burns deal double damage."],
  ["tails", "Five Tails", "burst", "Foxfire throws five flames instead of three."],
  ["firepath", "Fire Path", "paw", "You leave a path of fire behind you as you walk."],
  ["wildfire", "Wildfire", "flame", "Burning enemies explode when they fall, setting their neighbors alight."],
);
constellation("stag",
  ["flake", "Every 3 seconds a ring of frost bursts around you. It pushes enemies back and chills them, so they move 40% slower."],
  ["winter", "Deep Winter", "ring", "Frost Ring is 40% bigger, and chilled enemies move 60% slower."],
  ["shatter", "Shatter", "shatter", "Chilled enemies take 30% more damage from everything."],
  ["icicles", "Icicles", "spike", "Each Frost Ring also fires 8 icicles outward."],
  ["freeze", "Freeze Solid", "crystal", "Every third Frost Ring freezes enemies solid for 2 seconds."],
);
constellation("owl",
  ["bolt", "Every 2 seconds lightning strikes the nearest enemy and jumps to 3 more."],
  ["forked", "Forked", "chain", "Lightning jumps 3 more times."],
  ["static", "Static", "spark", "Lightning stuns each enemy it hits for a moment."],
  ["cloud", "Storm Cloud", "cloud", "Every second, a bolt strikes a random enemy on screen."],
  ["overload", "Overload", "burst", "Enemies felled by lightning burst into sparks that zap their neighbors."],
);
constellation("toad",
  ["drop", "Every 2 seconds you lob a bubble of bog water at a crowd. It splats, then leaves a poison puddle for 4 seconds."],
  ["bigbog", "Big Bog", "ring", "Puddles are 50% bigger and last 2 seconds longer."],
  ["corrode", "Corrode", "skull", "Poisoned enemies take 25% more damage from everything."],
  ["sticky", "Sticky", "bubbles", "Puddles slow enemies by 40%."],
  ["plague", "Plague", "drop", "Enemies that fall while poisoned leave a puddle behind."],
);
constellation("moth",
  ["moth", "Two glowing moths circle you, bonking enemies away."],
  ["swarm", "Swarm", "moth", "Two more moths."],
  ["dust", "Moth Dust", "swirl", "Enemies bonked by a moth get dizzy for 2 seconds: they wander and can't hurt you."],
  ["flutter", "Flutter", "orbit", "Moths fly 40% faster and sweep a wider circle."],
  ["beam", "Moonbeam", "spark", "Each moth fires a beam at a nearby enemy every second."],
);
constellation("whale",
  ["vortex", "Every 7 seconds a whirlpool opens under the biggest crowd, drags enemies in for 2.5 seconds, then bursts."],
  ["undertow", "Undertow", "ring", "Whirlpools are 40% bigger and pull harder."],
  ["deep", "Deep Water", "drop", "Enemies caught in a whirlpool take 40% more damage from everything."],
  ["tides", "Twin Tides", "waves", "Two whirlpools open at a time."],
  ["leviathan", "Leviathan", "vortex", "The burst deals triple damage and stuns for 1.5 seconds."],
);
constellation("cat",
  ["heart", "Every 9 seconds the toughest nearby enemy falls for you. It fights on your side for 8 seconds, then poofs."],
  ["crush", "Crush", "up", "Charmed enemies hit three times as hard."],
  ["twohearts", "Two Hearts", "heart", "Charm two enemies at a time."],
  ["heartbreak", "Heartbreak", "burst", "When a charm ends, the enemy bursts into hearts that hurt its neighbors and heal you a little."],
  ["ninelives", "Nine Lives", "shield", "Once a night, get back up with half your health instead of falling."],
);
constellation("hare",
  ["die", "Every Moonbolt cast rolls a die and fires 1 to 3 bolts."],
  ["loaded", "Loaded Dice", "die", "Roll twice and keep the better roll."],
  ["lucky", "Lucky Star", "clover", "Every hit has a 20% chance to strike twice as hard."],
  ["jackpot", "Jackpot", "stars", "Rolling a 3 also bursts a ring of 8 bolts around you."],
  ["roller", "High Roller", "die", "Every 12 seconds roll a d20. On a 1 you take 15 damage. On a 20 everything on screen is blasted and you heal fully. Otherwise that many bolts spiral out."],
);

export const STARS: Star[] = stars;
export const STAR = byId;
/** Stars you can spend a point on (everything except the free first stars). */
export const LIGHTABLE = stars.filter((s) => s.kind !== "gate").length;

export type StarState = "lit" | "open" | "dim" | "hidden";

/** Your sky for one night: which constellations you've found and which stars are lit. */
export class Sky {
  /** Unspent points. */
  points = 0;
  /** Points earned so far tonight (never more than LIGHT_CAP). */
  earned = 0;
  lit = new Set<string>(["moon"]);
  found: ConId[] = ["moon"];
  /** Bumped on every change, for anything that caches. */
  version = 0;

  has(id: string) {
    return this.lit.has(id);
  }

  /** Stars lit with points (free first stars don't count). */
  get spent() {
    let n = 0;
    for (const id of this.lit) if (byId.get(id)!.kind !== "gate") n++;
    return n;
  }

  state(s: Star): StarState {
    if (this.lit.has(s.id)) return "lit";
    if (!this.found.includes(s.con)) return "hidden";
    return s.links.some((l) => this.lit.has(l)) ? "open" : "dim";
  }

  canLight(s: Star) {
    return this.points > 0 && this.state(s) === "open";
  }

  light(s: Star): boolean {
    if (!this.canLight(s)) return false;
    this.lit.add(s.id);
    this.points--;
    this.version++;
    return true;
  }

  /** Takes back a star (for undo). The caller makes sure nothing depends on it. */
  unlight(s: Star) {
    if (s.kind === "gate" || !this.lit.delete(s.id)) return;
    this.points++;
    this.version++;
  }

  /** A level-up: one more point, until the cap. Returns false once the cap is reached. */
  earn(): boolean {
    if (this.earned >= LIGHT_CAP) return false;
    this.earned++;
    this.points++;
    this.version++;
    return true;
  }

  /** Reveals a constellation and lights its first star for free. */
  discover(c: ConId) {
    if (this.found.includes(c)) return;
    this.found.push(c);
    this.lit.add(c);
    this.version++;
  }

  /** Constellations not found yet, in random order. */
  offers(n: number): ConId[] {
    return ALL_CONS.filter((c) => !this.found.includes(c)).sort(() => Math.random() - 0.5).slice(0, n);
  }

  /** Every star a point could go into right now. */
  options(): Star[] {
    return stars.filter((s) => this.state(s) === "open");
  }
}
