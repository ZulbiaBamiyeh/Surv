// The bunny's spell tree and the scrolls you can find.
//
// One big passive-style tree. You start on Fireball in the middle; every level gives a
// point to take a node next to one you already have. Small nodes are stat bumps, named
// "notables" change how your magic works, and "keystones" are big with a catch.
//
// Most of the tree is sealed. Each region opens when you have collected the scrolls it
// needs: one scroll for an element's own region, two or more for the places where
// elements meet, and rare "niche" scrolls for the strange corners. When a region opens,
// its first node comes free, so every find changes your build on the spot.
//
// Support scrolls are separate from the tree. You can carry two; finding one again levels it up.

export type ScrollId =
  | "fire" | "meteor" | "suns" | "verdant" | "totem"
  | "frost" | "storm" | "toxic" | "moon"
  | "spirit" | "burrow" | "dice" | "clock" | "mirror" | "gravity";
export type SupportId = "confuse" | "charm" | "moonlight" | "ward" | "swift" | "clover";
export type NodeKind = "start" | "small" | "notable" | "keystone" | "entry";

/** Everything a node can add. Fractions are additive, so two +10% nodes make +20%. */
export interface Stats {
  dmg: number; haste: number; burn: number; area: number; hp: number; regen: number; move: number; pickup: number;
  meteor: number; sun: number; totem: number; frost: number; storm: number; toxic: number; moon: number; carrot: number; ghost: number;
}
export const ZERO_STATS: Stats = {
  dmg: 0, haste: 0, burn: 0, area: 0, hp: 0, regen: 0, move: 0, pickup: 0,
  meteor: 0, sun: 0, totem: 0, frost: 0, storm: 0, toxic: 0, moon: 0, carrot: 0, ghost: 0,
};

export interface TreeNode {
  id: string;
  name: string;
  desc: string;
  kind: NodeKind;
  /** Position in tree units (the start is at 0, 0). */
  x: number;
  y: number;
  links: string[];
  region?: string;
  stats?: Partial<Stats>;
  /** Rolls a die of this size on every cast. */
  die?: number;
  icon: string;
}

export interface ScrollDef {
  id: ScrollId;
  name: string;
  short: string;
  color: string;
  /** Niche scrolls are rarer and open the strange corners of the tree. */
  niche?: boolean;
}

export const SCROLLS: Record<ScrollId, ScrollDef> = {
  fire: { id: "fire", name: "Fire Scroll", short: "Fire", color: "#ff8a3a" },
  meteor: { id: "meteor", name: "Meteor Scroll", short: "Meteor", color: "#ff6a3a" },
  suns: { id: "suns", name: "Sun Scroll", short: "Sun", color: "#ffd640" },
  verdant: { id: "verdant", name: "Green Flame Scroll", short: "Green Flame", color: "#7ae04a" },
  totem: { id: "totem", name: "Totem Scroll", short: "Totem", color: "#e0a060" },
  frost: { id: "frost", name: "Frost Scroll", short: "Frost", color: "#8fd8ff" },
  storm: { id: "storm", name: "Storm Scroll", short: "Storm", color: "#ffe46a" },
  toxic: { id: "toxic", name: "Toxic Scroll", short: "Toxic", color: "#9ae04a" },
  moon: { id: "moon", name: "Moon Scroll", short: "Moon", color: "#fff2b0" },
  spirit: { id: "spirit", name: "Spirit Scroll", short: "Spirit", color: "#c8f0ff", niche: true },
  burrow: { id: "burrow", name: "Burrow Scroll", short: "Burrow", color: "#ff9a3a", niche: true },
  dice: { id: "dice", name: "Dice Scroll", short: "Dice", color: "#ffffff", niche: true },
  clock: { id: "clock", name: "Clock Scroll", short: "Clock", color: "#d8b070", niche: true },
  mirror: { id: "mirror", name: "Mirror Scroll", short: "Mirror", color: "#b8e0ff", niche: true },
  gravity: { id: "gravity", name: "Gravity Scroll", short: "Gravity", color: "#a070ff", niche: true },
};

export interface RegionDef {
  id: string;
  name: string;
  needs: ScrollId[];
  color: string;
}

export interface SupportDef {
  id: SupportId;
  name: string;
  color: string;
  /** What each level does, from level 1 to 3. */
  levels: [string, string, string];
}

export const SUPPORTS: Record<SupportId, SupportDef> = {
  confuse: {
    id: "confuse", name: "Dizzy Dust", color: "#c8a0ff",
    levels: [
      "Every 9 seconds, a puff of dust makes nearby enemies dizzy for 3 seconds. Dizzy enemies wander, can't hurt you, and bump into their friends.",
      "Every 7 seconds, and dizziness lasts 4 seconds.",
      "Every 5 seconds, a bigger puff, and dizzy enemies take 25% more damage.",
    ],
  },
  charm: {
    id: "charm", name: "Heart Charm", color: "#ff80c0",
    levels: [
      "Every 12 seconds, charms the toughest nearby enemy for 8 seconds. It fights for you, then poofs.",
      "Every 10 seconds, and charmed enemies hit three times as hard.",
      "Charms two enemies at once, for 10 seconds.",
    ],
  },
  moonlight: {
    id: "moonlight", name: "Moonlight", color: "#fff2b0",
    levels: ["Heals 12% of your health every 25 seconds.", "Heals 16% every 20 seconds.", "Heals 20% every 15 seconds."],
  },
  ward: {
    id: "ward", name: "Bubble Ward", color: "#8ae8ff",
    levels: ["A bubble makes you invulnerable for 3 seconds, every 20 seconds.", "4 seconds, every 17 seconds.", "5 seconds, every 14 seconds."],
  },
  swift: {
    id: "swift", name: "Swift Paws", color: "#ffd0f0",
    levels: ["+15% move speed.", "+25% move speed.", "+35% move speed, and gems fly to you from farther away."],
  },
  clover: {
    id: "clover", name: "Lucky Clover", color: "#7ad040",
    levels: ["+1 to every die roll.", "Also pick up gems from 50% farther away.", "Also find scrolls, magnets and carrots more often."],
  },
};

export const ALL_SCROLLS = Object.keys(SCROLLS) as ScrollId[];
export const ALL_SUPPORTS = Object.keys(SUPPORTS) as SupportId[];
export const SUPPORT_SLOTS = 2;
export const START = "start";
export const ELEMENTS: ScrollId[] = ["fire", "frost", "storm", "toxic", "moon"];

// ---------- Building the tree ----------

const nodes: TreeNode[] = [];
const byId = new Map<string, TreeNode>();
export const REGIONS = new Map<string, RegionDef>();
const D = Math.PI / 180;
const polar = (deg: number, r: number) => ({ x: +(Math.cos(deg * D) * r).toFixed(2), y: +(Math.sin(deg * D) * r).toFixed(2) });

type Spec = Omit<TreeNode, "id" | "x" | "y" | "links">;

function add(id: string, sp: Spec, deg: number, r: number, ...linksTo: string[]) {
  const node: TreeNode = { ...sp, id, links: [], ...polar(deg, r) };
  nodes.push(node);
  byId.set(id, node);
  for (const l of linksTo) link(id, l);
  return id;
}
function link(a: string, b: string) {
  const na = byId.get(a)!;
  const nb = byId.get(b)!;
  if (!na.links.includes(b)) na.links.push(b);
  if (!nb.links.includes(a)) nb.links.push(a);
}

const small = (name: string, desc: string, stats: Partial<Stats>, icon: string): Spec => ({ name, desc, kind: "small", stats, icon });
const notable = (name: string, desc: string, icon: string, extra: Partial<Spec> = {}): Spec => ({ name, desc, kind: "notable", icon, ...extra });
const keystone = (name: string, desc: string, icon: string): Spec => ({ name, desc, kind: "keystone", icon });
const DMG = () => small("Kindle", "+12% damage.", { dmg: 0.12 }, "up");
const HASTE = () => small("Quick Paws", "Cast 8% faster.", { haste: 0.08 }, "hourglass");
const AREA = () => small("Wide Heat", "+15% area.", { area: 0.15 }, "ring");
const BURN = () => small("Smolder", "+20% burn damage.", { burn: 0.2 }, "flame");
const pct = (stat: keyof Stats, what: string, icon = "up") => small(`${what[0].toUpperCase()}${what.slice(1)}`, `+30% ${what} damage.`, { [stat]: 0.3 }, icon);

// ---------- The middle: fire, always open ----------
add(START, { name: "Fireball", desc: "Shoots a fireball at the nearest enemy. Every path starts here.", kind: "start", icon: "flame" }, 0, 0);

const SPOKES: Record<string, [number, Spec[]]> = {
  pow: [270, [DMG(), DMG(), notable("Kindling", "+30% damage.", "up", { stats: { dmg: 0.3 } }), DMG(),
    keystone("Inferno Heart", "+60% damage, but you take 30% more damage.", "skull")]],
  sca: [330, [HASTE(), notable("Scatter", "Each cast throws 1d4 fireballs, each 30% weaker.", "die", { die: 4 }), DMG(),
    notable("Firestorm", "Every 4th cast also bursts a ring of 8 fireballs.", "burst")]],
  bla: [30, [AREA(), notable("Blast", "Fireballs explode when they hit, hurting everything nearby for 60%.", "burst"), AREA(),
    notable("Fire Ring", "Every 3 seconds a ring of fire bursts out around you.", "ring")]],
  brn: [90, [BURN(), notable("Ignite", "Hits set enemies on fire, burning for 20% of the hit every second.", "flame"), BURN(),
    notable("Hot Paws", "You leave a trail of fire wherever you walk.", "paw"),
    keystone("Wildfire", "When a burning enemy dies its fire jumps to 2 neighbors. Burns deal double, but hits deal 25% less.", "skull")]],
  bod: [150, [small("Thick Fur", "+12 max health.", { hp: 12 }, "heart"), small("Hop", "+6% move speed.", { move: 0.06 }, "paw"),
    notable("Cozy Coat", "+30 max health and regain 1 health every second.", "shield", { stats: { hp: 30, regen: 1 } }),
    small("Long Ears", "Pick up gems from 20% farther away.", { pickup: 0.2 }, "stars")]],
  orb: [210, [HASTE(), notable("Heavy Orb", "Your fireball becomes a big, slow orb that passes through everything. 2.5× damage, casts 60% slower.", "orb"), HASTE(),
    notable("Phoenix", "Fireballs home in on enemies and bounce to a second target.", "wing")]],
};
for (const [key, [deg, specs]] of Object.entries(SPOKES))
  specs.forEach((sp, i) => add(`${key}${i}`, sp, deg, 1.35 * (i + 1), i === 0 ? START : `${key}${i - 1}`));

// A ring between the spokes so you can cut across
const ring = ["pow2", "sca2", "bla2", "brn2", "bod2", "orb2"];
const ringSpecs = [HASTE(), DMG(), AREA(), BURN(), small("Fluff", "+8 max health.", { hp: 8 }, "heart"), DMG()];
ring.forEach((id, i) => add(`ring${i}`, ringSpecs[i], 300 + i * 60, 3.9, id, ring[(i + 1) % 6]));
add("patient", keystone("Patient Flame", "Fireballs cast 40% slower but deal double damage, and dice always roll their highest.", "hourglass"), 240, 5.4, "ring5");
add("ember", keystone("Ember Heart", "Burns deal triple damage, but fireball hits deal none.", "flame"), 180, 5.4, "ring4");

// ---------- Regions ----------
/** Adds a region: `list` is [id, spec, deg, r, ...links]; the first entry is the free entry node. */
function region(id: string, name: string, needs: ScrollId[], list: [string, Spec, number, number, ...string[]][]) {
  REGIONS.set(id, { id, name, needs, color: SCROLLS[needs[needs.length - 1]].color });
  list.forEach(([nid, sp, deg, r, ...links], i) => add(nid, { ...sp, kind: i === 0 ? "entry" : sp.kind, region: id }, deg, r, ...links));
}
const E = (name: string, desc: string, icon: string, stats?: Partial<Stats>): Spec => ({ name, desc, kind: "entry", icon, stats });

// Fire's own branches, at the ends of the spokes
region("meteor", "Cinder Rain", ["meteor"], [
  ["meteor", E("Meteor", "Every 3.5 seconds a meteor crashes down on a random nearby enemy.", "meteor"), 330, 6.6, "sca3"],
  ["rock", pct("meteor", "meteor"), 322, 7.9, "meteor"],
  ["shower", notable("Meteor Shower", "1d3 meteors fall each time.", "die", { die: 3 }), 320, 9.2, "rock"],
  ["crater", AREA(), 338, 7.9, "meteor"],
  ["scorched", notable("Scorched Earth", "Meteors leave burning ground behind.", "flame"), 340, 9.2, "crater"],
]);
region("suns", "Little Suns", ["suns"], [
  ["suns", E("Little Suns", "Two little suns circle you, burning anything they touch.", "sun"), 30, 6.6, "bla3"],
  ["core1", pct("sun", "sun"), 22, 7.9, "suns"],
  ["flare", notable("Solar Flare", "Two more suns.", "sun"), 20, 9.2, "core1"],
  ["core2", pct("sun", "sun"), 38, 7.9, "suns"],
  ["supernova", notable("Supernova", "Every 6 seconds the suns swing far out and back.", "orbit"), 40, 9.2, "core2"],
]);
region("verdant", "Verdant Flame", ["verdant"], [
  ["verdant", E("Verdant Flame", "Your fire turns green. Burns deal 30% more, and when a burning enemy dies its fire jumps to a neighbor.", "greenfire", { burn: 0.3 }), 150, 6.6, "bod3"],
  ["smoke1", small("Bitter Smoke", "+25% burn damage.", { burn: 0.25 }, "flame"), 142, 7.9, "verdant"],
  ["witchfire", notable("Witchfire", "Burning enemies leave green fire on the ground when they die.", "drop"), 140, 9.2, "smoke1"],
  ["smoke2", small("Bitter Smoke", "+25% burn damage.", { burn: 0.25 }, "flame"), 158, 7.9, "verdant"],
  ["everburn", notable("Everburn", "Burns last twice as long and hit 50% harder.", "greenfire", { stats: { burn: 0.5 } }), 160, 9.2, "smoke2"],
]);
region("totem", "Flame Totem", ["totem"], [
  ["totem", E("Flame Totem", "Every 9 seconds you plant a totem that shoots fireballs for 8 seconds.", "totem"), 210, 6.6, "orb3"],
  ["carve1", pct("totem", "totem"), 202, 7.9, "totem"],
  ["twin", notable("Twin Totems", "Plant two totems at a time.", "totem"), 200, 9.2, "carve1"],
  ["carve2", pct("totem", "totem"), 218, 7.9, "totem"],
  ["totemNova", notable("Totem Nova", "Totems burst into a ring of fire when they crumble.", "burst"), 220, 9.2, "carve2"],
]);

// The other elements, reached from the ring
add("toFrost", HASTE(), 300, 5.25, "ring0");
add("toStorm", DMG(), 0, 5.25, "ring1");
add("toMoon", AREA(), 60, 5.25, "ring2");
add("toToxic", DMG(), 120, 5.25, "ring3");
region("frost", "Frost", ["frost"], [
  ["frost", E("Frost Nova", "Every 3 seconds a ring of ice bursts around you, chilling enemies so they move at half speed.", "flake"), 300, 6.6, "toFrost"],
  ["cold1", pct("frost", "frost"), 292, 7.9, "frost"],
  ["shatter", notable("Shatter", "Chilled enemies take 40% more damage from everything.", "shatter"), 290, 9.2, "cold1"],
  ["cold2", pct("frost", "frost"), 308, 7.9, "frost"],
  ["pals", notable("Snow Pals", "Every 10 seconds you build a snowman. It throws chilly snowballs, and nearby enemies go for it instead of you.", "snowman"), 310, 9.2, "cold2"],
  ["yeti", notable("Yeti", "Your snowmen grow into yetis: tougher, and they stomp the ground every 2 seconds.", "skull"), 303, 10.3, "pals"],
]);
region("storm", "Storm", ["storm"], [
  ["storm", E("Zap Chain", "Every 1.4 seconds lightning strikes an enemy and jumps to 2 more.", "bolt"), 0, 6.6, "toStorm"],
  ["charge1", pct("storm", "lightning"), 352, 7.9, "storm"],
  ["forked", notable("Forked", "Lightning jumps 1d6 + 1 times.", "die", { die: 6 }), 350, 9.2, "charge1"],
  ["charge2", pct("storm", "lightning"), 8, 7.9, "storm"],
  ["call", notable("Storm Call", "Lightning strikes a random nearby enemy every second.", "cloud"), 10, 9.2, "charge2"],
  ["overload", notable("Overload", "Enemies killed by lightning explode.", "burst"), 3, 10.3, "call"],
]);
region("moon", "Moon", ["moon"], [
  ["moon", E("Moon Orbs", "Two little moons circle you, bonking enemies away.", "moon"), 60, 6.6, "toMoon"],
  ["glow1", pct("moon", "moon"), 52, 7.9, "moon"],
  ["full", notable("Full Moon", "Adds one big moon: triple damage and heavy knockback.", "moon"), 50, 9.2, "glow1"],
  ["glow2", pct("moon", "moon"), 68, 7.9, "moon"],
  ["lunar", notable("Lunar Cycle", "Every 30 seconds the full moon rises for 8 seconds: +40% damage and +20% speed.", "eclipse"), 70, 9.2, "glow2"],
  ["were", keystone("Werebunny", "Under the full moon, enemies that touch you take 5× fireball damage and can't hurt you.", "paw"), 63, 10.3, "lunar"],
]);
region("toxic", "Toxic", ["toxic"], [
  ["toxic", E("Stink Puddle", "Every 2.6 seconds you leave a poison puddle where you stand.", "drop"), 120, 6.6, "toToxic"],
  ["pot1", pct("toxic", "poison"), 112, 7.9, "toxic"],
  ["spores", notable("Spores", "Drop 1d3 puddles around you each time.", "die", { die: 3 }), 110, 9.2, "pot1"],
  ["pot2", pct("toxic", "poison"), 128, 7.9, "toxic"],
  ["corrode", notable("Corrode", "Enemies standing in poison take 30% more damage from everything.", "skull"), 130, 9.2, "pot2"],
  ["bloom", notable("Toxic Bloom", "Puddles burst when they dry up, dealing 5× damage.", "burst"), 123, 10.3, "corrode"],
]);

// Where two elements meet
region("frostfire", "Frostfire", ["fire", "frost"], [
  ["thermal", E("Thermal Shock", "Fire deals double damage to chilled enemies.", "shatter"), 284, 10.9, "shatter"],
  ["steam", notable("Steam Burst", "When ice hits a burning enemy it bursts in steam, hurting everything nearby.", "cloud"), 283, 12.1, "thermal"],
]);
region("comet", "Comets", ["frost", "meteor"], [
  ["comet", E("Comets", "Meteors freeze what they hit for 1 second.", "flake"), 315, 10.9, "pals", "shower"],
  ["icecrater", notable("Ice Crater", "Meteors leave icy ground that chills.", "crystal"), 315, 12.1, "comet"],
]);
region("thunderfall", "Thunderfall", ["meteor", "storm"], [
  ["thunderfall", E("Thunderfall", "Every meteor that lands calls lightning that chains to 3 more enemies.", "bolt"), 345, 10.9, "scorched", "forked"],
  ["ion", notable("Ion Rock", "Meteors stun what they hit for 1 second.", "spark"), 345, 12.1, "thunderfall"],
]);
region("plasma", "Plasma", ["storm", "suns"], [
  ["plasma", E("Plasma", "Lightning sets enemies on fire.", "flame"), 15, 10.9, "call", "flare"],
  ["solararc", notable("Solar Arc", "Every sun hit zaps a nearby enemy for 60%.", "spark"), 15, 12.1, "plasma"],
]);
region("eclipse", "Eclipse", ["suns", "moon"], [
  ["eclipse", E("Eclipse", "Every 20 seconds darkness falls for 3 seconds and every enemy on screen gets dizzy.", "eclipse"), 45, 10.9, "supernova", "full"],
  ["corona", notable("Corona", "Suns and moons deal triple damage during an eclipse.", "sun"), 45, 12.1, "eclipse"],
]);
region("lunatic", "Moonshrooms", ["moon", "toxic"], [
  ["moonshroom", E("Moonshrooms", "Each moon drips a poison puddle every 2 seconds.", "drop"), 90, 10.9, "lunar", "spores"],
  ["lunacy", notable("Lunacy", "Under the full moon, enemies in poison get dizzy.", "eclipse"), 90, 12.1, "moonshroom"],
]);
region("rotgarden", "Rot Garden", ["toxic", "verdant"], [
  ["rot", E("Rot Garden", "Poison puddles also set enemies on green fire.", "greenfire"), 135, 10.9, "bloom", "witchfire"],
  ["compost", notable("Compost", "Enemies that die in poison sometimes drop a carrot.", "carrot"), 135, 12.1, "rot"],
]);
region("wicker", "Wicker Totems", ["verdant", "totem"], [
  ["wicker", E("Wicker Totems", "Your totems walk toward enemies, burning everything they touch.", "totem"), 180, 10.9, "everburn", "twin"],
  ["effigy", notable("Burning Effigy", "Crumbling totems leave a ring of green fire.", "greenfire"), 180, 12.1, "wicker"],
]);
region("thundersnow", "Thundersnow", ["frost", "storm"], [
  ["supercon", E("Superconductor", "Lightning jumps one extra time off every chilled enemy it hits.", "chain"), 330, 13.4, "icecrater", "ion"],
  ["hail", notable("Hailstorm", "Every 2 seconds hail falls on 3 random enemies, hurting and chilling them.", "cloud"), 330, 14.6, "supercon"],
]);
region("aurora", "Aurora", ["frost", "moon"], [
  ["moonfrost", E("Moonfrost", "Moons chill enemies and hit chilled enemies 50% harder.", "moon"), 0, 13.6, "solararc"],
  ["aurora", notable("Aurora", "Every 20 seconds the sky lights up: you heal 15% and every enemy on screen is chilled.", "stars"), 0, 14.8, "moonfrost"],
]);
region("acidrain", "Acid Rain", ["storm", "toxic"], [
  ["acid", E("Acid Rain", "Lightning that strikes a poisoned enemy splashes a fresh puddle under it.", "drop"), 60, 13.4, "corona"],
  ["electro", notable("Electrolysis", "Lightning deals 50% more damage to poisoned enemies.", "bolt"), 60, 14.6, "acid"],
]);
region("tesla", "Tesla Totems", ["totem", "storm"], [
  ["tesla", E("Tesla Totems", "Your totems also shoot chain lightning.", "bolt"), 264, 13.4, "steam"],
  ["fence", notable("Lightning Fence", "Lightning arcs between your totems, zapping anything that crosses.", "chain"), 264, 14.6, "tesla"],
]);
// Three or four scrolls
region("tempest", "Weather Witch", ["frost", "storm", "suns"], [
  ["weather", E("Weather Witch", "Every 15 seconds the weather turns: a blizzard chills everything, a thunderstorm rains lightning, or a heatwave sets everything on fire.", "cloud"), 340, 16, "hail"],
  ["eye", notable("Eye of the Storm", "Weather lasts twice as long.", "orbit"), 340, 17.2, "weather"],
]);
region("avatar", "Elemental Avatar", ["frost", "storm", "toxic", "moon"], [
  ["avatar", E("Elemental Avatar", "+15% damage for every element scroll you carry: Fire, Frost, Storm, Toxic and Moon.", "stars"), 30, 13.6, "solararc", "corona"],
  ["overflow", notable("Overflow", "Every spell recharges 25% faster.", "hourglass"), 30, 14.8, "avatar"],
]);

// ---------- Niche corners ----------
region("spirit", "Spirits", ["spirit"], [
  ["wisps", E("Wisp Friends", "1 in 12 enemies you defeat rises as a ghost that fights for you for 6 seconds.", "ghost"), 145, 14, "compost"],
  ["rest1", small("Restless", "Ghost friends hit 30% harder.", { ghost: 0.3 }, "up"), 141, 15.3, "wisps"],
  ["legion", notable("Legion", "1 in 6 instead.", "ghost"), 139, 16.6, "rest1"],
  ["rest2", small("Restless", "Ghost friends hit 30% harder.", { ghost: 0.3 }, "up"), 149, 15.3, "wisps"],
  ["haunt", notable("Haunt", "Ghost friends burst into dizzy dust when they fade.", "swirl"), 151, 16.6, "rest2"],
]);
region("burrow", "Burrow", ["burrow"], [
  ["carrots", E("Carrot Missiles", "Every 2 seconds a carrot rocket flies at an enemy and explodes.", "carrot"), 172, 14, "effigy"],
  ["crunch1", pct("carrot", "carrot"), 168, 15.3, "carrots"],
  ["hole", notable("Rabbit Hole", "Every 12 seconds you dive underground: safe for 1 second, then you pop up and stun everything nearby.", "paw"), 166, 16.6, "crunch1"],
  ["crunch2", pct("carrot", "carrot"), 176, 15.3, "carrots"],
  ["golden", keystone("Golden Carrot", "Carrots drop 4× as often and heal twice as much, but you have 25 less max health.", "carrot"), 178, 16.6, "crunch2"],
]);
region("dice", "Dice", ["dice"], [
  ["loaded", E("Loaded Dice", "Every die gets 2 more sides.", "die"), 199, 14],
  ["dice1", DMG(), 195, 15.3, "loaded"],
  ["jackpot", notable("Jackpot", "Rolling the highest number throws an extra volley and sprays 5 gems.", "stars"), 193, 16.6, "dice1"],
  ["dice2", HASTE(), 203, 15.3, "loaded"],
  ["gambler", keystone("Gambler", "Every 15 seconds roll a d20. On a 1 you take 20 damage, on a 20 you gain a skill point, otherwise that many fireballs burst out.", "die"), 205, 16.6, "dice2"],
]);
region("clock", "Clockwork", ["clock"], [
  ["slow", E("Slow Time", "Enemies near you move 30% slower.", "hourglass"), 226, 14],
  ["tick1", HASTE(), 222, 15.3, "slow"],
  ["stopwatch", notable("Stopwatch", "Every 20 seconds time stops for 2 seconds. Your spells keep going.", "hourglass"), 220, 16.6, "tick1"],
  ["tick2", HASTE(), 230, 15.3, "slow"],
  ["rewind", notable("Rewind", "Once every 90 seconds, a blow that would defeat you rewinds you 3 seconds instead.", "orbit"), 232, 16.6, "tick2"],
]);
region("mirror", "Mirrors", ["mirror"], [
  ["echo", E("Echo", "A reflection of you copies your fireballs at 50% damage.", "mirror"), 253, 14, "tesla"],
  ["glass1", DMG(), 249, 15.3, "echo"],
  ["hall", notable("Hall of Mirrors", "Two more reflections, at 35% damage.", "mirror"), 247, 16.6, "glass1"],
  ["glass2", DMG(), 257, 15.3, "echo"],
  ["reflect", notable("Reflect", "Spores that hit you bounce back at the enemies, 1 time in 2.", "shield"), 259, 16.6, "glass2"],
]);
region("gravity", "Gravity", ["gravity"], [
  ["hole1", E("Black Hole", "Every 8 seconds a black hole opens in a crowd, pulls enemies in for 2 seconds, then pops.", "vortex"), 298, 15.4],
  ["mass1", AREA(), 292, 16.7, "hole1"],
  ["horizon", notable("Event Horizon", "Black holes are twice as big and pull for 3 seconds.", "vortex"), 290, 18, "mass1"],
  ["mass2", DMG(), 304, 16.7, "hole1"],
  ["heavy", notable("Heavy Thoughts", "Your Heavy Orbs pull enemies toward them.", "orb"), 306, 18, "mass2"],
]);
region("luckyfoot", "Lucky Foot", ["burrow", "dice"], [
  ["foot", E("Lucky Foot", "Carrots roll a d6. On a 6 they turn golden: a full heal, and every gem flies to you.", "clover"), 186, 17.6, "golden", "jackpot"],
]);
region("witching", "Witching Hour", ["moon", "spirit", "clock"], [
  ["midnight", E("Witching Hour", "Every 40 seconds midnight strikes: for 6 seconds enemies move at half speed and every defeated enemy rises as a ghost friend.", "eclipse"), 128, 16, "legion"],
]);
region("singularity", "Singularity", ["gravity", "meteor"], [
  ["singular", E("Singularity", "Meteors open a small black hole where they land.", "vortex"), 318, 17.6, "heavy"],
]);
region("cataclysm", "Cataclysm", ["meteor", "gravity", "storm"], [
  ["cataclysm", E("Cataclysm", "Every 30 seconds a giant meteor crashes onto the biggest crowd for 10× meteor damage.", "meteor"), 330, 19.2, "singular"],
]);
region("paradox", "Paradox", ["clock", "mirror", "gravity", "dice"], [
  ["unravel", E("Unravel Reality", "Every 25 seconds roll a d20. 1: every enemy heals. 2–10: time stops for 3 seconds. 11–19: three black holes open. 20: everything on screen takes 9999 damage.", "swirl"), 240, 18.2, "rewind", "hall"],
]);

// Golden Carrot's catch
byId.get("golden")!.stats = { hp: -25 };

export const TREE: TreeNode[] = nodes;
export const NODE = byId;

/** Core node ids the game checks for. Region nodes are checked by their own ids. */
export const N = {
  inferno: "pow4", scatter: "sca1", firestorm: "sca3", blast: "bla1", fireRing: "bla3", ignite: "brn1", hotPaws: "brn3",
  wildfire: "brn4", heavyOrb: "orb1", phoenix: "orb3", patient: "patient", ember: "ember",
} as const;

/** The regions a scroll would open, given the scrolls you already have. */
export function opensWith(id: ScrollId, owned: Set<ScrollId>) {
  const have = new Set([...owned, id]);
  return [...REGIONS.values()].filter((r) => r.needs.includes(id) && r.needs.every((n) => have.has(n)));
}
