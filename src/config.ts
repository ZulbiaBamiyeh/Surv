// Every number that shapes how the game feels or balances lives here.
// Spell numbers live in game.ts next to each spell; tree text lives in content.ts.

export type EnemyKind = "slime" | "bat" | "skel" | "king" | "ghost" | "shroom" | "jelly" | "boar" | "golem";

export const CFG = {
  /** Simulation step in seconds. Game logic runs at a fixed rate regardless of frame rate. */
  tick: 1 / 120,
  /** About how many art pixels fit across the screen's shorter side (lower = more zoomed in). */
  viewShortSide: 230,

  player: {
    speed: 92,
    /** High acceleration and friction keep movement snappy rather than floaty. */
    accel: 1500,
    friction: 1800,
    maxHp: 100,
    radius: 6,
    /** Invulnerability after being hit, in seconds. */
    iframes: 0.7,
    /** Health regained per second. */
    regen: 0.4,
    pickupRadius: 42,
  },

  /** Small damage bonus for every level gained. Most power comes from skill trees. */
  levelDamage: 0.01,

  fireball: {
    /** Only casts when an enemy is within this distance. */
    range: 210,
  },

  /** Burning lasts this long; chill slows by chillSlow for chillTime. */
  burnTime: 3,
  chillTime: 2.5,
  chillSlow: 0.5,

  /** Survive this many seconds to win the run. */
  runLength: 900,

  /** Chance that a normal enemy drops a scroll (doubled by Lucky Star). Kings always drop one. */
  scrollDropChance: 0.00008,

  enemies: {
    slime: { hp: 10, speed: 34, damage: 8, radius: 8, xp: 1, color: "#ff83c0" },
    bat: { hp: 6, speed: 58, damage: 5, radius: 6, xp: 1, color: "#9658d4" },
    skel: { hp: 32, speed: 28, damage: 12, radius: 7, xp: 3, color: "#d4d2e2" },
    king: { hp: 240, speed: 25, damage: 20, radius: 17, xp: 0, color: "#ffd640" },
    /** Fast and weaving; drifts through the crowd. */
    ghost: { hp: 7, speed: 66, damage: 6, radius: 6, xp: 1, color: "#c8f0ff" },
    /** Keeps its distance and spits spores. */
    shroom: { hp: 22, speed: 30, damage: 8, radius: 7, xp: 2, color: "#f05a4a" },
    /** A big slime that splits in two when it pops. */
    jelly: { hp: 40, speed: 26, damage: 12, radius: 10, xp: 3, color: "#50d2ff" },
    /** Stops, stamps its hooves, then charges in a straight line. */
    boar: { hp: 45, speed: 30, damage: 16, radius: 8, xp: 3, color: "#d0806a" },
    /** Slow, heavy and hard to push around. */
    golem: { hp: 130, speed: 19, damage: 24, radius: 10, xp: 6, color: "#9a9cb0" },
  } satisfies Record<EnemyKind, { hp: number; speed: number; damage: number; radius: number; xp: number; color: string }>,

  spawn: {
    /** Enemies per second at the start. */
    startRate: 0.7,
    /** Extra enemies per second added each minute. */
    ratePerMin: 1.2,
    /** Spawn rate also grows with minutes squared, so the early game is calm and the late game is not. */
    ratePerMin2: 0.17,
    maxRate: 32,
    maxEnemies: 480,
    /** Enemy HP is multiplied by this every minute (1.27 means about 2.6x at 4:00, 11x at 10:00, 36x at 15:00). */
    hpGrowth: 1.33,
    /** After `lateAfter` minutes, enemy health also multiplies by `lateGrowth` every minute. */
    lateAfter: 8,
    lateGrowth: 1.1,
    /** Enemy contact damage grows by this much per minute. */
    damagePerMin: 0.14,
    /** Elite enemies (stronger, golden, drop a chest) start at this time; chance per spawn grows each minute. */
    elitesAfter: 120,
    eliteChance: 0.004,
    eliteChancePerMin: 0.0018,
    eliteHp: 7,
    /** Seconds until the first King Slime, then the gap between them. Kings always drop a scroll. */
    kingFirst: 40,
    kingEvery: 85,
  },

  /**
   * Danger tiers. Each one starts at `at` seconds, adds enemy types to the mix, and is announced.
   * `weights` are relative spawn weights while that tier is active.
   */
  danger: [
    { at: 0, name: "Calm", color: "#7ad040", weights: { slime: 1 }, note: "" },
    { at: 20, name: "Calm", color: "#7ad040", weights: { slime: 6, bat: 4 }, note: "" },
    { at: 60, name: "Breezy", color: "#b4e04a", weights: { slime: 6, bat: 4, skel: 2.5 }, note: "Skeletons join the party." },
    { at: 150, name: "Tricky", color: "#ffd640", weights: { slime: 5, bat: 4, skel: 3, ghost: 3 }, note: "Ghosts weave through the crowd." },
    { at: 210, name: "Tricky", color: "#ffd640", weights: { slime: 4, bat: 3, skel: 3, ghost: 3, shroom: 1.5 }, note: "Mushrooms spit spores. Dodge them!" },
    { at: 300, name: "Wild", color: "#ffa424", weights: { slime: 3, bat: 3, skel: 3.5, ghost: 3, shroom: 2, jelly: 2 }, note: "Jellies split when they pop." },
    { at: 390, name: "Wild", color: "#ffa424", weights: { slime: 2, bat: 3, skel: 3.5, ghost: 3, shroom: 2, jelly: 2, boar: 1.5 }, note: "Boars charge. Step aside!" },
    { at: 510, name: "Fierce", color: "#ff7a3a", weights: { bat: 3, skel: 4, ghost: 3, shroom: 2.5, jelly: 2.5, boar: 2, golem: 1 }, note: "Golems shrug off knockback." },
    { at: 690, name: "Frantic", color: "#ff4a5e", weights: { bat: 3, skel: 4, ghost: 4, shroom: 3, jelly: 3, boar: 3, golem: 2 }, note: "Everything at once." },
    { at: 900, name: "Overtime", color: "#d050ff", weights: { bat: 3, skel: 4, ghost: 4, shroom: 3, jelly: 3, boar: 3, golem: 3 }, note: "There is no end. Only glory." },
  ] as { at: number; name: string; color: string; weights: Partial<Record<EnemyKind, number>>; note: string }[],

  /** Horde waves: a ring of enemies closes in on you at these times (seconds), then repeats every `waveEvery`. */
  waves: [
    { at: 95, kind: "bat", count: 26, msg: "A bat swarm!" },
    { at: 200, kind: "slime", count: 34, msg: "Slimes surround you!" },
    { at: 285, kind: "ghost", count: 30, msg: "A ghostly ring!" },
    { at: 420, kind: "skel", count: 36, msg: "The skeleton wall!" },
    { at: 560, kind: "boar", count: 14, msg: "Stampede!" },
    { at: 640, kind: "jelly", count: 24, msg: "A jelly flood!" },
  ] as { at: number; kind: EnemyKind; count: number; msg: string }[],
  waveEvery: 130,

  pickups: {
    /** A magnet drops from a kill this often (seconds, randomized a little). */
    magnetEvery: 80,
    /** Chance per kill to drop a carrot; higher while you are hurt. */
    carrotChance: 0.003,
    carrotChanceHurt: 0.02,
    carrotHeal: 30,
    /** Gems past this count merge into bigger ones so the game stays fast. */
    maxGems: 380,
  },

  xp: {
    /** XP needed for level 2; each further level needs perLevel more. */
    base: 4,
    perLevel: 3,
    /** Extra XP per level squared, so later levels slow down. */
    perLevel2: 0.55,
  },
};
