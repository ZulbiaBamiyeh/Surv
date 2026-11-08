// Every spell scroll and its skill tree. All trees share one shape so they read the same
// on a small screen:
//
//   tier 0  root            (learned when you pick the scroll up)
//   tier 1  form A | form B           pick one
//   tier 2  power (3 ranks)
//   tier 3  impact A | impact B       pick one
//   tier 4  haste (3 ranks)
//   tier 5  capstone A | capstone B   pick one
//   tier 6  mastery (no rank limit)
//
// Nodes marked with a die roll it on every cast, so bigger dice mean bigger swings.

export type ScrollId = "fire" | "frost" | "storm" | "moon" | "toxic" | "light";

export interface TreeNode {
  id: string;
  name: string;
  desc: string;
  tier: number;
  /** 0 = left, 1 = middle, 2 = right. */
  col: number;
  ranks: number;
  /** Rolls a die of this size on every cast. */
  die?: number;
}

export interface ScrollDef {
  id: ScrollId;
  name: string;
  short: string;
  desc: string;
  color: string;
  support?: boolean;
  nodes: TreeNode[];
}

const tree = (prefix: string, n: [string, string, string?][]): TreeNode[] => {
  const shape: [number, number, number][] = [
    [0, 1, 1], [1, 0, 1], [1, 2, 1], [2, 1, 3], [3, 0, 1], [3, 2, 1], [4, 1, 3], [5, 0, 1], [5, 2, 1],
  ];
  const keys = ["root", "formA", "formB", "power", "impactA", "impactB", "haste", "capA", "capB"];
  const nodes = n.map(([name, desc], i) => {
    const [tier, col, ranks] = shape[i];
    return { id: `${prefix}.${keys[i]}`, name, desc, tier, col, ranks };
  });
  // A bottomless sink, so spare points always make you stronger
  nodes.push({
    id: `${prefix}.mastery`, name: "Mastery", tier: 6, col: 1, ranks: 99,
    desc: prefix === "light" ? "All light magic is 6% stronger and comes 4% sooner per rank." : "+8% damage and 3% faster casting per rank. No limit.",
  });
  return nodes;
};

export const SCROLLS: Record<ScrollId, ScrollDef> = {
  fire: {
    id: "fire", name: "Fire Scroll", short: "Fire", color: "#ff8a3a",
    desc: "Fireballs that seek out the nearest enemy.",
    nodes: tree("fire", [
      ["Fireball", "Shoots a fireball at the nearest enemy."],
      ["Scatter", "Fires 1d4 fireballs each cast, each 30% weaker."],
      ["Heavy Orb", "One big, slow orb that passes through everything. 2.5× damage, casts 60% slower."],
      ["Kindling", "+30% damage per rank."],
      ["Blast", "Fireballs explode when they hit, hurting everything nearby for 60%."],
      ["Ignite", "Hits set enemies on fire, burning for 30% of the hit every second."],
      ["Quick Hands", "Casts 10% faster per rank."],
      ["Firestorm", "Every 4th cast also bursts a ring of 8 fireballs."],
      ["Phoenix", "Fireballs home in on enemies and bounce to a second target."],
    ]),
  },
  frost: {
    id: "frost", name: "Frost Scroll", short: "Frost", color: "#8fd8ff",
    desc: "Rings of ice that chill and slow.",
    nodes: tree("frost", [
      ["Frost Nova", "A ring of ice bursts out around you, chilling enemies."],
      ["Ripples", "Each cast sends out 1d3 waves."],
      ["Glacier", "A 50% bigger ring that freezes enemies solid for 1 second."],
      ["Bitter Cold", "+30% damage per rank."],
      ["Shatter", "Chilled enemies take 40% more damage from everything."],
      ["Icicles", "Each burst also fires 6 icicles outward."],
      ["Winter Rhythm", "Casts 10% faster per rank."],
      ["Blizzard", "A freezing storm follows you, chilling and hurting anything close."],
      ["Absolute Zero", "Every 3rd cast freezes every enemy on screen for 1.5 seconds."],
    ]),
  },
  storm: {
    id: "storm", name: "Storm Scroll", short: "Storm", color: "#ffe46a",
    desc: "Lightning that leaps from enemy to enemy.",
    nodes: tree("storm", [
      ["Zap Chain", "Lightning strikes an enemy, then jumps to 2 more."],
      ["Forked", "Jumps 1d6 + 1 times each cast."],
      ["Thunderbolt", "Only one jump, but 2.5× damage and a short stun."],
      ["Charge", "+30% damage per rank."],
      ["Static", "Every hit leaves a spark that zaps another enemy for 50%."],
      ["Overload", "Enemies killed by lightning explode."],
      ["Quickening", "Casts 10% faster per rank."],
      ["Storm Call", "Lightning strikes a random nearby enemy every second."],
      ["Endless Arc", "Chains reach 60% farther and grow 15% stronger with every jump."],
    ]),
  },
  moon: {
    id: "moon", name: "Moon Scroll", short: "Moon", color: "#fff2b0",
    desc: "Little moons that circle you and bonk enemies away.",
    nodes: tree("moon", [
      ["Moon Orbs", "Two little moons circle you, bonking enemies."],
      ["Constellation", "1d4 + 1 moons, rerolled every 8 seconds."],
      ["Full Moon", "One big moon: 3× damage and heavy knockback."],
      ["Moonglow", "+30% damage per rank."],
      ["Wide Orbit", "Moons circle 50% farther out."],
      ["Moonburn", "Moons set enemies on fire."],
      ["Tides", "Moons spin 12% faster per rank."],
      ["Eclipse", "Every 6 seconds the moons fly out wide and sweep back in."],
      ["Twin Rings", "A second ring of moons circles the other way."],
    ]),
  },
  toxic: {
    id: "toxic", name: "Toxic Scroll", short: "Toxic", color: "#9ae04a",
    desc: "Poison puddles that eat away at anything standing in them.",
    nodes: tree("toxic", [
      ["Stink Puddle", "Leaves a poison puddle where you stand."],
      ["Spores", "Drops 1d3 puddles around you each cast."],
      ["Bog", "80% bigger puddles that slow enemies down."],
      ["Potency", "+30% damage per rank."],
      ["Corrode", "Enemies in poison take 30% more damage from everything."],
      ["Contagion", "Enemies that die in poison leave a puddle behind."],
      ["Seep", "Casts 10% faster per rank."],
      ["Plague Trail", "You leave a trail of poison wherever you walk."],
      ["Toxic Bloom", "Puddles burst when they dry up, dealing 5× damage."],
    ]),
  },
  light: {
    id: "light", name: "Light Scroll", short: "Light", color: "#ffd0f0", support: true,
    desc: "Support magic: healing, shields and luck. Deals no damage.",
    nodes: tree("light", [
      ["Moonlight", "Heals 10% of your health every 30 seconds."],
      ["Ward", "A bubble makes you invulnerable for 3 seconds, every 20 seconds."],
      ["Regrowth", "Slowly regain 1 health every second."],
      ["Blessing", "+30% healing and +1 second of ward per rank."],
      ["Swift Paws", "+20% move speed."],
      ["Starlight", "Pick up gems from twice as far away."],
      ["Devotion", "All light magic comes 12% sooner per rank."],
      ["Second Life", "Once per run, come back with half health instead of falling."],
      ["Lucky Star", "+1 to every die roll, and scrolls drop more often."],
    ]),
  },
};

// Dice live on the form nodes
SCROLLS.fire.nodes[1].die = 4;
SCROLLS.frost.nodes[1].die = 3;
SCROLLS.storm.nodes[1].die = 6;
SCROLLS.moon.nodes[1].die = 4;
SCROLLS.toxic.nodes[1].die = 3;

export const ALL_SCROLLS = Object.keys(SCROLLS) as ScrollId[];
export const SLOTS = 3;
/** Each empty slot makes your attack scrolls this much stronger. */
export const EMPTY_SLOT_BONUS = 0.15;

/** Which nodes exclude each other (the two options on the same choice tier). */
export function rival(node: TreeNode, def: ScrollDef): TreeNode | undefined {
  if (node.ranks > 1 || node.tier === 0) return undefined;
  return def.nodes.find((n) => n.tier === node.tier && n.id !== node.id);
}
