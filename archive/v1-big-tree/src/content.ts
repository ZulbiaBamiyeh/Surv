// The bunny's spell tree and the scrolls you can find.
//
// One huge passive-style tree. Five element cores (Fire, Frost, Storm, Toxic, Moon) sit
// around it like the points of a star. You start a run on one of them, chosen from three.
// Every level gives a point to take a node next to one you already have.
//
// Everything else starts sealed. A region opens when you carry the scrolls it needs:
// another element's whole core, the crossovers where two elements meet, rarer places that
// need three or more, odd support magic (charm, dizzy dust, bubbles...) and the strange
// niche corners. When a region opens, its first node comes free.

export type ScrollId =
  | "fire" | "frost" | "storm" | "toxic" | "moon"
  | "meteor" | "suns" | "verdant" | "totem"
  | "charm" | "dizzy" | "ward" | "mend" | "swift"
  | "spirit" | "burrow" | "dice" | "clock" | "mirror" | "gravity";
export type NodeKind = "start" | "small" | "notable" | "keystone" | "entry";

/** Everything a node can add. Fractions are additive, so two +10% nodes make +20%. */
export interface Stats {
  dmg: number; haste: number; burn: number; area: number; hp: number; regen: number; move: number; pickup: number;
  meteor: number; sun: number; totem: number; frost: number; storm: number; toxic: number; moon: number; carrot: number; ghost: number; heal: number;
}
export const ZERO_STATS: Stats = {
  dmg: 0, haste: 0, burn: 0, area: 0, hp: 0, regen: 0, move: 0, pickup: 0,
  meteor: 0, sun: 0, totem: 0, frost: 0, storm: 0, toxic: 0, moon: 0, carrot: 0, ghost: 0, heal: 0,
};

export interface TreeNode {
  id: string;
  name: string;
  desc: string;
  kind: NodeKind;
  /** Position in tree units (the middle of the star is 0, 0). */
  x: number;
  y: number;
  links: string[];
  region: string;
  stats?: Partial<Stats>;
  /** Rolls a die of this size on every cast. */
  die?: number;
  icon: string;
}

export type ScrollKind = "element" | "branch" | "support" | "niche";

export interface ScrollDef {
  id: ScrollId;
  name: string;
  short: string;
  color: string;
  kind: ScrollKind;
}

const S = (id: ScrollId, short: string, color: string, kind: ScrollKind, name = `${short} Scroll`): ScrollDef => ({ id, name, short, color, kind });
export const SCROLLS: Record<ScrollId, ScrollDef> = {
  fire: S("fire", "Fire", "#ff8a3a", "element"),
  frost: S("frost", "Frost", "#8fd8ff", "element"),
  storm: S("storm", "Storm", "#ffe46a", "element"),
  toxic: S("toxic", "Toxic", "#9ae04a", "element"),
  moon: S("moon", "Moon", "#fff2b0", "element"),
  meteor: S("meteor", "Meteor", "#ff6a3a", "branch"),
  suns: S("suns", "Sun", "#ffd640", "branch"),
  verdant: S("verdant", "Green Flame", "#7ae04a", "branch"),
  totem: S("totem", "Totem", "#e0a060", "branch"),
  charm: S("charm", "Charm", "#ff80c0", "support"),
  dizzy: S("dizzy", "Dizzy", "#c8a0ff", "support"),
  ward: S("ward", "Bubble", "#8ae8ff", "support"),
  mend: S("mend", "Mending", "#ffd0f0", "support"),
  swift: S("swift", "Swift", "#ffe0a0", "support"),
  spirit: S("spirit", "Spirit", "#c8f0ff", "niche"),
  burrow: S("burrow", "Burrow", "#ff9a3a", "niche"),
  dice: S("dice", "Dice", "#ffffff", "niche"),
  clock: S("clock", "Clock", "#d8b070", "niche"),
  mirror: S("mirror", "Mirror", "#b8e0ff", "niche"),
  gravity: S("gravity", "Gravity", "#a070ff", "niche"),
};
export const ALL_SCROLLS = Object.keys(SCROLLS) as ScrollId[];
export const ELEMENTS: ScrollId[] = ["fire", "frost", "storm", "toxic", "moon"];

export interface RegionDef {
  id: string;
  name: string;
  needs: ScrollId[];
  color: string;
  /** An element's home: where you can start a run. */
  core?: boolean;
}

// ---------- Building the tree ----------

const nodes: TreeNode[] = [];
const byId = new Map<string, TreeNode>();
export const REGIONS = new Map<string, RegionDef>();
const D = Math.PI / 180;
const polar = (deg: number, r: number) => [Math.cos(deg * D) * r, Math.sin(deg * D) * r] as const;

type Spec = Omit<TreeNode, "id" | "x" | "y" | "links" | "region">;

function put(id: string, sp: Spec, region: string, x: number, y: number) {
  if (byId.has(id)) throw new Error("duplicate node " + id);
  const node: TreeNode = { ...sp, id, region, links: [], x, y };
  nodes.push(node);
  byId.set(id, node);
}
function link(a: string, b: string) {
  const na = byId.get(a)!;
  const nb = byId.get(b)!;
  if (!na.links.includes(b)) na.links.push(b);
  if (!nb.links.includes(a)) nb.links.push(a);
}

const small = (name: string, desc: string, stats: Partial<Stats>, icon: string): Spec => ({ name, desc, kind: "small", stats, icon });
const notable = (name: string, desc: string, icon: string, extra: Partial<Spec> = {}): Spec => ({ name, desc, kind: "notable", icon, ...extra });
const keystone = (name: string, desc: string, icon: string, extra: Partial<Spec> = {}): Spec => ({ name, desc, kind: "keystone", icon, ...extra });
const entry = (name: string, desc: string, icon: string, extra: Partial<Spec> = {}): Spec => ({ name, desc, kind: "entry", icon, ...extra });
const DMG = () => small("Kindle", "+12% damage.", { dmg: 0.12 }, "up");
const HASTE = () => small("Quick Paws", "Cast 8% faster.", { haste: 0.08 }, "hourglass");
const AREA = () => small("Wide Magic", "+15% area.", { area: 0.15 }, "ring");
const BURN = () => small("Smolder", "+20% burn damage.", { burn: 0.2 }, "flame");
const HP = () => small("Thick Fur", "+12 max health.", { hp: 12 }, "heart");
const PICK = () => small("Long Ears", "Pick up gems from 20% farther away.", { pickup: 0.2 }, "stars");
const pct = (stat: keyof Stats, what: string, icon = "up") => small(`${what[0].toUpperCase()}${what.slice(1)}`, `+25% ${what} damage.`, { [stat]: 0.25 }, icon);
const FUR = (name: string) => notable(name, "+30 max health and regain 1 health every second.", "shield", { stats: { hp: 30, regen: 1 } });

// ---------- The five element cores ----------
const CORE_R = 16;
const CORE_DEG: Record<string, number> = { fire: -90, frost: -18, storm: 54, toxic: 126, moon: 198 };

/**
 * An element's core: its first spell in the middle, six spokes of three nodes (the first spoke
 * points away from the star's middle), a ring joining the spokes, and keystones beyond the ring.
 */
function core(el: ScrollId, name: string, start: [string, Spec], spokes: [string, Spec][][], ring: Spec[], keys: [number, string, Spec][]) {
  const deg = CORE_DEG[el];
  const [cx, cy] = polar(deg, CORE_R);
  REGIONS.set(el, { id: el, name, needs: [el], color: SCROLLS[el].color, core: true });
  put(start[0], { ...start[1], kind: "start" }, el, cx, cy);
  spokes.forEach((sp, k) => {
    sp.forEach(([id, spec], i) => {
      const [dx, dy] = polar(deg + k * 60, 1.4 * (i + 1));
      put(id, spec, el, cx + dx, cy + dy);
      link(id, i === 0 ? start[0] : sp[i - 1][0]);
    });
  });
  ring.forEach((spec, k) => {
    const [dx, dy] = polar(deg + k * 60 + 30, 3.9);
    const id = `${el}Ring${k}`;
    put(id, spec, el, cx + dx, cy + dy);
    link(id, spokes[k][2][0]);
    link(id, spokes[(k + 1) % 6][2][0]);
  });
  for (const [slot, id, spec] of keys) {
    const [dx, dy] = polar(deg + slot * 60 + 30, 5.5);
    put(id, spec, el, cx + dx, cy + dy);
    link(id, `${el}Ring${slot}`);
  }
}

core("fire", "Fire", ["fireball", notable("Fireball", "Shoots a fireball at the nearest enemy.", "flame")], [
  [["kindle1", DMG()], ["kindling", notable("Kindling", "+30% damage.", "up", { stats: { dmg: 0.3 } })], ["firestorm", notable("Firestorm", "Every 4th cast also bursts a ring of 8 fireballs.", "burst")]],
  [["haste1", HASTE()], ["scatter", notable("Scatter", "Each cast throws 1d4 fireballs, each 30% weaker.", "die", { die: 4 })], ["kindle2", DMG()]],
  [["wide1", AREA()], ["blast", notable("Blast", "Fireballs explode when they hit, hurting everything nearby for 60%.", "burst")], ["fireRing", notable("Fire Ring", "Every 3 seconds a ring of fire bursts out around you.", "ring")]],
  [["smolder1", BURN()], ["ignite", notable("Ignite", "Hits set enemies on fire, burning for 20% of the hit every second.", "flame")], ["hotPaws", notable("Hot Paws", "You leave a path of fire behind you as you walk.", "paw")]],
  [["fur1", HP()], ["cozy", FUR("Cozy Coat")], ["ears1", PICK()]],
  [["haste2", HASTE()], ["heavyOrb", notable("Heavy Orb", "Your fireball becomes a big, slow orb that passes through everything. 2.5× damage, casts 60% slower.", "orb")], ["phoenix", notable("Phoenix", "Fireballs home in on enemies and bounce to a second target.", "wing")]],
], [DMG(), HASTE(), BURN(), AREA(), HP(), DMG()], [
  [0, "inferno", keystone("Inferno Heart", "+60% damage, but you take 30% more damage.", "skull")],
  [2, "wildfire", keystone("Wildfire", "When a burning enemy dies its fire jumps to 2 neighbors. Burns deal double, but hits deal 25% less.", "skull")],
  [4, "patient", keystone("Patient Flame", "Fireballs cast 40% slower but deal double damage, and dice always roll their highest.", "hourglass")],
  [5, "ember", keystone("Ember Heart", "Burns deal triple damage, but fireball hits deal none.", "flame")],
]);

core("frost", "Frost", ["shard", notable("Ice Shard", "Shoots a piercing shard of ice that chills enemies (they move at half speed).", "crystal")], [
  [["cold1", pct("frost", "frost")], ["frost", notable("Frost Nova", "Every 3 seconds a ring of ice bursts around you, chilling everything it touches.", "flake")], ["ripples", notable("Ripples", "Frost Nova sends out 1d3 waves.", "die", { die: 3 })]],
  [["fhaste1", HASTE()], ["fan", notable("Icicle Fan", "Ice Shards come in threes.", "spike")], ["cold2", pct("frost", "frost")]],
  [["fwide1", AREA()], ["shatter", notable("Shatter", "Chilled enemies take 40% more damage from everything.", "shatter")], ["cold3", pct("frost", "frost")]],
  [["fwide2", AREA()], ["deepfreeze", notable("Deep Freeze", "Frost that hits an already chilled enemy freezes it solid for a moment.", "crystal")], ["cold4", pct("frost", "frost")]],
  [["ffur1", HP()], ["glacial", FUR("Snow Coat")], ["fears", PICK()]],
  [["fhaste2", HASTE()], ["pals", notable("Snow Pals", "Every 10 seconds you build a snowman. It throws chilly snowballs, and nearby enemies go for it instead of you.", "snowman")], ["yeti", notable("Yeti", "Your snowmen grow into yetis: tougher, and they stomp the ground every 2 seconds.", "skull")]],
], [pct("frost", "frost"), HASTE(), AREA(), DMG(), HP(), HASTE()], [
  [1, "glacialheart", keystone("Glacial Heart", "Frozen enemies take triple damage, but you move 15% slower.", "crystal", { stats: { move: -0.15 } })],
  [4, "permafrost", keystone("Permafrost", "Chill never wears off, but frost deals 40% less damage.", "flake")],
]);

core("storm", "Storm", ["storm", notable("Zap Chain", "Lightning strikes an enemy and jumps to 3 more, knocking them back.", "bolt")], [
  [["charge1", pct("storm", "lightning")], ["forked", notable("Forked", "Lightning jumps 1d6 + 1 times.", "die", { die: 6 })], ["charge2", pct("storm", "lightning")]],
  [["shaste1", HASTE()], ["call", notable("Storm Call", "Lightning strikes a random nearby enemy every second.", "cloud")], ["overload", notable("Overload", "Enemies killed by lightning explode.", "burst")]],
  [["swide1", AREA()], ["static", notable("Static", "Every lightning hit sparks to another nearby enemy for 40%.", "spark")], ["charge3", pct("storm", "lightning")]],
  [["charge4", pct("storm", "lightning")], ["thunderbolt", notable("Thunderbolt", "Every 5th Zap Chain is a huge bolt: 4× damage and it stuns.", "bolt")], ["sdmg1", DMG()]],
  [["sfur1", HP()], ["insulated", FUR("Insulated")], ["sears", PICK()]],
  [["shaste2", HASTE()], ["arc", notable("Endless Arc", "Lightning jumps 60% farther and grows 15% stronger with every jump.", "chain")], ["sdmg2", DMG()]],
], [HASTE(), pct("storm", "lightning"), AREA(), DMG(), HP(), HASTE()], [
  [0, "rod", keystone("Lightning Rod", "Lightning deals 80% more damage, but every 12 seconds a bolt strikes you too.", "bolt")],
  [3, "conductor", keystone("Conductor", "Lightning can jump to any enemy on screen, but deals 30% less damage.", "chain")],
]);

core("toxic", "Toxic", ["toxic", notable("Poison Glob", "Lobs a glob of poison at an enemy. It splats, then leaves a puddle that hurts anything standing in it.", "drop")], [
  [["pot1", pct("toxic", "poison")], ["spores", notable("Spores", "Throw 1d3 globs at a time.", "die", { die: 3 })], ["pot2", pct("toxic", "poison")]],
  [["thaste1", HASTE()], ["stinktrail", notable("Stink Trail", "You leave a path of poison behind you as you walk.", "paw")], ["tdmg1", DMG()]],
  [["twide1", AREA()], ["corrode", notable("Corrode", "Enemies standing in poison take 30% more damage from everything.", "skull")], ["twide2", AREA()]],
  [["pot3", pct("toxic", "poison")], ["bloom", notable("Toxic Bloom", "Puddles burst when they dry up, dealing 5× damage.", "burst")], ["contagion", notable("Contagion", "Enemies that die in poison leave a puddle behind.", "bubbles")]],
  [["tfur1", HP()], ["antidote", FUR("Antidote")], ["tears", PICK()]],
  [["thaste2", HASTE()], ["bog", notable("Bog", "Puddles slow enemies by 40%.", "drop")], ["miasma", notable("Miasma", "A cloud of poison follows you, hurting anything close.", "cloud")]],
], [pct("toxic", "poison"), HASTE(), AREA(), DMG(), HP(), AREA()], [
  [2, "plague", keystone("Plague Bearer", "Puddles are 60% bigger and last twice as long, but you throw globs 40% slower.", "skull")],
  [4, "acidblood", keystone("Acid Blood", "Getting hit splashes a huge puddle around you, but you take 15% more damage.", "drop")],
]);

core("moon", "Moon", ["moon", notable("Moon Orbs", "Three little moons circle you, bonking enemies away, and one beams at a nearby enemy every 2 seconds.", "moon")], [
  [["glow1", pct("moon", "moon")], ["full", notable("Full Moon", "Adds one big moon: triple damage and heavy knockback.", "moon")], ["glow2", pct("moon", "moon")]],
  [["mhaste1", HASTE()], ["lunar", notable("Lunar Cycle", "Every 30 seconds the full moon rises for 8 seconds: +40% damage and +20% speed.", "eclipse")], ["were", notable("Werebunny", "Under the full moon, enemies that touch you take 5× fireball damage and can't hurt you.", "paw")]],
  [["mwide1", AREA()], ["kick", notable("Crater Kick", "Moons knock enemies twice as far and stun them for a moment.", "burst")], ["glow3", pct("moon", "moon")]],
  [["glow4", pct("moon", "moon")], ["constellation", notable("Constellation", "1d4 extra moons, rerolled every 8 seconds.", "die", { die: 4 })], ["mdmg1", DMG()]],
  [["mfur1", HP()], ["moonfur", FUR("Moonlit Fur")], ["mears", PICK()]],
  [["mhaste2", HASTE()], ["tides", notable("Tides", "Moons spin 40% faster.", "waves")], ["beam", notable("Moonbeam", "Every moon beams, and more often.", "spark")]],
], [pct("moon", "moon"), HASTE(), AREA(), DMG(), HP(), HASTE()], [
  [1, "bloodmoon", keystone("Blood Moon", "Moons deal double damage, but you have 25 less max health.", "moon", { stats: { hp: -25 } })],
  [3, "gravmoon", keystone("Gravity Moon", "Moons pull nearby enemies toward you, but deal 30% less damage.", "orbit")],
]);

// ---------- Regions ----------
// Small node shapes, laid out pointing away from the middle of the star.
// Each entry is [x out, y side, parent index].
const SHAPES: Record<number, [number, number, number][]> = {
  1: [[0, 0, -1]],
  2: [[0, 0, -1], [1.4, 0, 0]],
  3: [[0, 0, -1], [1.3, -1, 0], [1.3, 1, 0]],
  4: [[0, 0, -1], [1.3, -1, 0], [1.3, 1, 0], [2.6, 0, 1]],
  5: [[0, 0, -1], [1.3, -1.1, 0], [2.6, -1.5, 1], [1.3, 1.1, 0], [2.6, 1.5, 3]],
  6: [[0, 0, -1], [1.3, -1.1, 0], [2.6, -1.5, 1], [1.3, 1.1, 0], [2.6, 1.5, 3], [3.6, 0, 2]],
};
const placed: { region: string; anchor: [number, number]; ids: string[] }[] = [];

/** Adds a region at polar position (deg, r). Its first node is the free entry. */
function region(id: string, name: string, needs: ScrollId[], deg: number, r: number, list: [string, Spec][]) {
  REGIONS.set(id, { id, name, needs, color: SCROLLS[needs[needs.length - 1]].color });
  const [ax, ay] = polar(deg, r);
  const len = Math.hypot(ax, ay) || 1;
  const ox = r ? ax / len : 1;
  const oy = r ? ay / len : 0;
  const shape = SHAPES[list.length];
  list.forEach(([nid, sp], i) => {
    const [u, v, parent] = shape[i];
    put(nid, i === 0 ? { ...sp, kind: "entry" } : sp, id, ax + ox * u - oy * v, ay + oy * u + ox * v);
    if (parent >= 0) link(nid, list[parent][0]);
  });
  placed.push({ region: id, anchor: [ax, ay], ids: list.map((l) => l[0]) });
}
const mid = (a: number, b: number) => {
  const x = Math.cos(a * D) + Math.cos(b * D);
  const y = Math.sin(a * D) + Math.sin(b * D);
  return Math.atan2(y, x) / D;
};

// Where two neighboring elements meet
region("frostfire", "Frostfire", ["fire", "frost"], mid(-90, -18), 13, [
  ["thermal", entry("Thermal Shock", "Fire deals double damage to chilled enemies.", "shatter")],
  ["steam", notable("Steam Burst", "When ice hits a burning enemy it bursts in steam, hurting everything nearby.", "cloud")],
]);
region("thundersnow", "Thundersnow", ["frost", "storm"], mid(-18, 54), 13, [
  ["supercon", entry("Superconductor", "Lightning jumps one extra time off every chilled enemy it hits.", "chain")],
  ["hail", notable("Hailstorm", "Every 2 seconds hail falls on 3 random enemies, hurting and chilling them.", "cloud")],
]);
region("acidrain", "Acid Rain", ["storm", "toxic"], mid(54, 126), 13, [
  ["acid", entry("Acid Rain", "Lightning that strikes a poisoned enemy splashes a fresh puddle under it.", "drop")],
  ["electro", notable("Electrolysis", "Lightning deals 50% more damage to poisoned enemies.", "bolt")],
]);
region("moonshrooms", "Moonshrooms", ["toxic", "moon"], mid(126, 198), 13, [
  ["moonshroom", entry("Moonshrooms", "Each moon drips a poison puddle every 2 seconds.", "drop")],
  ["lunacy", notable("Lunacy", "Under the full moon, enemies in poison get dizzy.", "eclipse")],
]);
region("harvest", "Harvest Moon", ["moon", "fire"], mid(198, 270), 13, [
  ["harvest", entry("Harvest Moon", "Moons set what they bonk on fire.", "moon")],
  ["embermoon", notable("Ember Moons", "1 in 4 moon hits launches a fireball.", "flame")],
]);
// Across the middle of the star
region("plasma", "Plasma", ["fire", "storm"], -18, 5, [
  ["plasma", entry("Plasma", "Lightning sets enemies on fire.", "flame")],
  ["ball", notable("Ball Lightning", "Fireballs zap a nearby enemy when they hit.", "spark")],
]);
region("blackice", "Black Ice", ["frost", "toxic"], 54, 5, [
  ["blackice", entry("Black Ice", "Puddles chill enemies, and chilled enemies take 50% more poison damage.", "crystal")],
  ["frostbite", notable("Frostbite", "Chilled enemies standing in poison freeze solid.", "flake")],
]);
region("charged", "Charged Moons", ["storm", "moon"], 126, 5, [
  ["chargedmoons", entry("Charged Moons", "Every moon hit zaps a nearby enemy for 60%.", "bolt")],
  ["ion", notable("Ion Orbit", "Moons spin 30% faster and stun what they hit.", "orbit")],
]);
region("fumes", "Fumes", ["fire", "toxic"], 198, 5, [
  ["fumes", entry("Fumes", "Poison puddles set enemies on fire.", "flame")],
  ["gasleak", notable("Gas Leak", "Fireballs that hit a poisoned enemy explode.", "burst")],
]);
region("aurora", "Aurora", ["frost", "moon"], -90, 5, [
  ["moonfrost", entry("Moonfrost", "Moons chill enemies and hit chilled enemies 50% harder.", "moon")],
  ["aurora", notable("Aurora", "Every 20 seconds the sky lights up: you heal 15% and every enemy on screen is chilled.", "stars")],
]);
region("avatar", "Elemental Avatar", ["fire", "frost", "storm", "toxic", "moon"], 0, 0, [
  ["avatar", entry("Elemental Avatar", "+15% damage for every element you carry, and every spell recharges 25% faster.", "stars")],
]);

// Fire's own branches, out past the fire core
region("meteor", "Cinder Rain", ["meteor"], -64, 24, [
  ["meteor", entry("Meteor", "Every 3.5 seconds a meteor crashes down on a random nearby enemy.", "meteor")],
  ["rock", pct("meteor", "meteor")],
  ["shower", notable("Meteor Shower", "1d3 meteors fall each time.", "die", { die: 3 })],
  ["crater", AREA()],
  ["scorched", notable("Scorched Earth", "Meteors leave burning ground behind.", "flame")],
]);
region("totem", "Flame Totem", ["totem"], -81, 25, [
  ["totem", entry("Flame Totem", "Every 9 seconds you plant a totem that shoots fireballs for 8 seconds.", "totem")],
  ["carve1", pct("totem", "totem")],
  ["twin", notable("Twin Totems", "Plant two totems at a time.", "totem")],
  ["carve2", pct("totem", "totem")],
  ["totemNova", notable("Totem Nova", "Totems burst into a ring of fire when they crumble.", "burst")],
]);
region("verdant", "Verdant Flame", ["verdant"], -99, 25, [
  ["verdant", entry("Verdant Flame", "Your fire turns green. Burns deal 30% more, and when a burning enemy dies its fire jumps to a neighbor.", "greenfire", { stats: { burn: 0.3 } })],
  ["smoke1", small("Bitter Smoke", "+25% burn damage.", { burn: 0.25 }, "flame")],
  ["witchfire", notable("Witchfire", "Burning enemies leave green fire on the ground when they die.", "drop")],
  ["smoke2", small("Bitter Smoke", "+25% burn damage.", { burn: 0.25 }, "flame")],
  ["everburn", notable("Everburn", "Burns last twice as long and hit 50% harder.", "greenfire", { stats: { burn: 0.5 } })],
]);
region("suns", "Little Suns", ["suns"], -116, 24, [
  ["suns", entry("Little Suns", "Two little suns circle you, burning anything they touch.", "sun")],
  ["core1", pct("sun", "sun")],
  ["flare", notable("Solar Flare", "Two more suns.", "sun")],
  ["core2", pct("sun", "sun")],
  ["supernova", notable("Supernova", "Every 6 seconds the suns swing far out and back.", "orbit")],
]);
// Fire branches meeting other magic
region("comet", "Comets", ["frost", "meteor"], -42, 26, [
  ["comet", entry("Comets", "Meteors freeze what they hit for 1 second.", "flake")],
  ["icecrater", notable("Ice Crater", "Meteors leave icy ground that chills.", "crystal")],
]);
region("thunderfall", "Thunderfall", ["meteor", "storm"], -27, 29, [
  ["thunderfall", entry("Thunderfall", "Every meteor that lands calls lightning that chains to 3 more enemies.", "bolt")],
  ["ionrock", notable("Ion Rock", "Meteors stun what they hit for 1 second.", "spark")],
]);
region("tempest", "Weather Witch", ["frost", "storm", "suns"], -8, 25, [
  ["weather", entry("Weather Witch", "Every 15 seconds the weather turns: a blizzard chills everything, a thunderstorm rains lightning, or a heatwave sets everything on fire.", "cloud")],
  ["eye", notable("Eye of the Storm", "Weather lasts twice as long.", "orbit")],
]);
region("solararc", "Solar Arc", ["storm", "suns"], 12, 27, [
  ["solararc", entry("Solar Arc", "Every sun hit zaps a nearby enemy for 60%.", "spark")],
]);
region("eclipse", "Eclipse", ["suns", "moon"], -140, 25, [
  ["eclipse", entry("Eclipse", "Every 20 seconds darkness falls for 3 seconds and every enemy on screen gets dizzy.", "eclipse")],
  ["corona", notable("Corona", "Suns and moons deal triple damage during an eclipse.", "sun")],
]);
region("rotgarden", "Rot Garden", ["toxic", "verdant"], 160, 26, [
  ["rot", entry("Rot Garden", "Poison puddles also set enemies on green fire.", "greenfire")],
  ["compost", notable("Compost", "Enemies that die in poison sometimes drop a carrot.", "carrot")],
]);
region("wicker", "Wicker Totems", ["verdant", "totem"], -90, 30, [
  ["wicker", entry("Wicker Totems", "Your totems walk toward enemies, burning everything they touch.", "totem")],
  ["effigy", notable("Burning Effigy", "Crumbling totems leave a ring of green fire.", "greenfire")],
]);
region("tesla", "Tesla Totems", ["totem", "storm"], 36, 27, [
  ["tesla", entry("Tesla Totems", "Your totems also shoot chain lightning.", "bolt")],
  ["fence", notable("Lightning Fence", "Lightning arcs between your totems, zapping anything that crosses.", "chain")],
]);

// Support magic
region("charm", "Charm", ["charm"], 62, 28, [
  ["charm", entry("Heart Charm", "Every 12 seconds you charm the toughest nearby enemy for 8 seconds. It fights for you, then poofs.", "heart")],
  ["crush", notable("Crush", "Charmed enemies hit three times as hard.", "heart")],
  ["twohearts", notable("Two Hearts", "Charm two enemies at once.", "heart")],
  ["lovebomb", notable("Love Bomb", "Charmed enemies burst into hearts when the charm ends, hurting nearby enemies and healing you a little.", "burst")],
]);
region("dizzy", "Dizzy Dust", ["dizzy"], 84, 28, [
  ["dust", entry("Dizzy Dust", "Every 8 seconds a puff of dust makes nearby enemies dizzy. Dizzy enemies wander, can't hurt you, and bump into their friends.", "swirl")],
  ["spin", notable("Spin Cycle", "Dust every 5 seconds, and dizziness lasts longer.", "swirl")],
  ["clumsy", notable("Clumsy", "Dizzy enemies take 25% more damage.", "skull")],
  ["bonkparty", notable("Bonk Party", "Dizzy enemies bump each other three times as hard.", "burst")],
]);
region("ward", "Bubbles", ["ward"], 106, 28, [
  ["bubble", entry("Bubble Ward", "Every 20 seconds a bubble makes you invulnerable for 3 seconds.", "shield")],
  ["thick", notable("Thick Bubble", "Bubbles last 2 seconds longer and come 4 seconds sooner.", "shield")],
  ["pop", notable("Pop!", "When a bubble pops it knocks back and hurts everything around you.", "burst")],
]);
region("mend", "Mending", ["mend"], 128, 28, [
  ["mend", entry("Moonlight Mend", "Heals 12% of your health every 25 seconds.", "heart")],
  ["bloomheal", small("Blossom", "Healing is 50% stronger.", { heal: 0.5 }, "leaf")],
  ["secondwind", notable("Second Wind", "Once per run, get back up with half your health instead of falling.", "wing")],
]);
region("swift", "Swift", ["swift"], 147, 30, [
  ["swift", entry("Swift Paws", "+15% move speed.", "paw", { stats: { move: 0.15 } })],
  ["zoomies", small("Zoomies", "+15% move speed.", { move: 0.15 }, "paw")],
  ["slipstream", notable("Slipstream", "Gems fly to you from twice as far away.", "stars", { stats: { pickup: 1 } })],
]);

// Niche corners
region("spirit", "Spirits", ["spirit"], 170, 30, [
  ["wisps", entry("Wisp Friends", "1 in 12 enemies you defeat rises as a ghost that fights for you for 6 seconds.", "ghost")],
  ["rest1", small("Restless", "Ghost friends hit 30% harder.", { ghost: 0.3 }, "up")],
  ["legion", notable("Legion", "1 in 6 instead.", "ghost")],
  ["rest2", small("Restless", "Ghost friends hit 30% harder.", { ghost: 0.3 }, "up")],
  ["haunt", notable("Haunt", "Ghost friends burst into dizzy dust when they fade.", "swirl")],
]);
region("burrow", "Burrow", ["burrow"], 192, 30, [
  ["carrots", entry("Carrot Missiles", "Every 2 seconds a carrot rocket flies at an enemy and explodes.", "carrot")],
  ["crunch1", pct("carrot", "carrot")],
  ["hole", notable("Rabbit Hole", "Every 12 seconds you dive underground: safe for 1 second, then you pop up and stun everything nearby.", "paw")],
  ["crunch2", pct("carrot", "carrot")],
  ["golden", keystone("Golden Carrot", "Carrots drop 4× as often and heal twice as much, but you have 25 less max health.", "carrot", { stats: { hp: -25 } })],
]);
region("dice", "Dice", ["dice"], 214, 31, [
  ["loaded", entry("Loaded Dice", "Every die gets 2 more sides.", "die")],
  ["clover", notable("Lucky Clover", "+1 to every die roll, and scrolls, magnets and carrots turn up more often.", "clover")],
  ["jackpot", notable("Jackpot", "Rolling the highest number throws an extra volley and sprays gems.", "stars")],
  ["dice2", HASTE()],
  ["gambler", keystone("Gambler", "Every 15 seconds roll a d20. On a 1 you take 20 damage, on a 20 you gain a skill point, otherwise that many fireballs burst out.", "die")],
]);
region("clock", "Clockwork", ["clock"], 236, 31, [
  ["slow", entry("Slow Time", "Enemies near you move 30% slower.", "hourglass")],
  ["tick1", HASTE()],
  ["stopwatch", notable("Stopwatch", "Every 20 seconds time stops for 2 seconds. Your spells keep going.", "hourglass")],
  ["tick2", HASTE()],
  ["rewind", notable("Rewind", "Once every 90 seconds, a blow that would defeat you rewinds you 3 seconds instead.", "orbit")],
]);
region("mirror", "Mirrors", ["mirror"], 258, 32, [
  ["echo", entry("Echo", "A reflection of you copies your attacks at 50% damage.", "mirror")],
  ["glass1", DMG()],
  ["hall", notable("Hall of Mirrors", "Two more reflections, at 35% damage.", "mirror")],
  ["glass2", DMG()],
  ["reflect", notable("Reflect", "Spores that hit you bounce back at the enemies, 1 time in 2.", "shield")],
]);
region("gravity", "Gravity", ["gravity"], -60, 33, [
  ["hole1", entry("Black Hole", "Every 8 seconds a black hole opens in a crowd, pulls enemies in for 2 seconds, then pops.", "vortex")],
  ["mass1", AREA()],
  ["horizon", notable("Event Horizon", "Black holes are twice as big and pull for 3 seconds.", "vortex")],
  ["mass2", DMG()],
  ["heavy", notable("Heavy Thoughts", "Your Heavy Orbs pull enemies toward them.", "orb")],
]);
region("luckyfoot", "Lucky Foot", ["burrow", "dice"], 203, 36, [
  ["foot", entry("Lucky Foot", "Carrots roll a d6. On a 6 they turn golden: a full heal, and every gem flies to you.", "clover")],
]);
region("witching", "Witching Hour", ["moon", "spirit", "clock"], 180, 37, [
  ["midnight", entry("Witching Hour", "Every 40 seconds midnight strikes: for 6 seconds enemies move at half speed and every defeated enemy rises as a ghost friend.", "eclipse")],
]);
region("singularity", "Singularity", ["gravity", "meteor"], -70, 37, [
  ["singular", entry("Singularity", "Meteors open a small black hole where they land.", "vortex")],
]);
region("cataclysm", "Cataclysm", ["meteor", "gravity", "storm"], -48, 38, [
  ["cataclysm", entry("Cataclysm", "Every 30 seconds a giant meteor crashes onto the biggest crowd for 10× meteor damage.", "meteor")],
]);
region("paradox", "Paradox", ["clock", "mirror", "gravity", "dice"], 240, 38, [
  ["unravel", entry("Unravel Reality", "Every 25 seconds roll a d20. 1: every enemy heals. 2–10: time stops for 3 seconds. 11–19: three black holes open. 20: everything on screen takes 9999 damage.", "swirl")],
]);

// Each region's entry joins the nearest node of the regions whose scrolls it needs
for (const p of placed) {
  const r = REGIONS.get(p.region)!;
  const e = byId.get(p.ids[0])!;
  for (const need of r.needs) {
    let best: TreeNode | null = null;
    let bd = 7.5;
    for (const n of nodes) {
      if (n.region === p.region) continue;
      const nr = REGIONS.get(n.region)!;
      if (!nr.needs.includes(need) || nr.needs.length > r.needs.length) continue;
      const d = Math.hypot(n.x - e.x, n.y - e.y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) link(e.id, best.id);
  }
  // Islands still join their nearest neighbor, so every region sits on a path
  if (!p.ids.some((id) => byId.get(id)!.links.some((l) => byId.get(l)!.region !== p.region))) {
    let best: TreeNode | null = null;
    let bd = Infinity;
    for (const n of nodes) {
      if (n.region === p.region) continue;
      const d = Math.hypot(n.x - e.x, n.y - e.y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) link(e.id, best.id);
  }
}

export const TREE: TreeNode[] = nodes;
export const NODE = byId;

/** Core node ids the game checks for. */
export const N = {
  inferno: "inferno", scatter: "scatter", firestorm: "firestorm", blast: "blast", fireRing: "fireRing", ignite: "ignite",
  hotPaws: "hotPaws", wildfire: "wildfire", heavyOrb: "heavyOrb", phoenix: "phoenix", patient: "patient", ember: "ember",
} as const;

/** The first node of a region (free when it opens). */
export const entryOf = (region: string) => nodes.find((n) => n.region === region && (n.kind === "entry" || n.kind === "start"))!.id;

/** The regions a scroll would open, given the scrolls you already have. */
export function opensWith(id: ScrollId, owned: Set<ScrollId>) {
  const have = new Set([...owned, id]);
  return [...REGIONS.values()].filter((r) => r.needs.includes(id) && r.needs.every((n) => have.has(n)));
}
