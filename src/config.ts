// Every number that shapes how the game feels or balances lives here.
// Spell numbers live in game.ts next to each spell; star text lives in sky.ts.

export type EnemyKind = "slime" | "bat" | "skel" | "ghost" | "shroom" | "jelly" | "boar" | "golem" | "king";

export const CFG = {
  /** Simulation step in seconds. Game logic runs at a fixed rate regardless of frame rate. */
  tick: 1 / 120,
  /** About how many art pixels fit across the screen's shorter side (lower = more zoomed in). */
  viewShortSide: 230,
  /** A night lasts this many seconds. Reach the end and dawn breaks. */
  nightLength: 600,

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
    pickupRadius: 40,
  },

  /** Chill lasts this long. */
  chillTime: 3,
  burnTime: 3,

  enemies: {
    slime: { hp: 10, speed: 34, damage: 8, radius: 8, xp: 1, color: "#ff83c0" },
    bat: { hp: 6, speed: 58, damage: 5, radius: 6, xp: 1, color: "#9658d4" },
    skel: { hp: 28, speed: 28, damage: 12, radius: 7, xp: 2, color: "#d4d2e2" },
    /** Fast and weaving; drifts through the crowd. */
    ghost: { hp: 8, speed: 64, damage: 6, radius: 6, xp: 1, color: "#c8f0ff" },
    /** Keeps its distance and spits spores. */
    shroom: { hp: 20, speed: 30, damage: 8, radius: 7, xp: 2, color: "#f05a4a" },
    /** A big slime that splits in two when it pops. */
    jelly: { hp: 36, speed: 26, damage: 12, radius: 10, xp: 2, color: "#50d2ff" },
    /** Stops, stamps its hooves, then charges in a straight line. */
    boar: { hp: 40, speed: 30, damage: 16, radius: 8, xp: 3, color: "#d0806a" },
    /** Slow, heavy and hard to push around. */
    golem: { hp: 110, speed: 19, damage: 22, radius: 10, xp: 5, color: "#9a9cb0" },
    /** The boss. Its health is set by `bosses` below. */
    king: { hp: 1, speed: 24, damage: 20, radius: 17, xp: 0, color: "#ffd640" },
  } satisfies Record<EnemyKind, { hp: number; speed: number; damage: number; radius: number; xp: number; color: string }>,

  spawn: {
    /** Enemies per second: start + perMin × minutes + perMin2 × minutes². */
    startRate: 0.9,
    ratePerMin: 1.05,
    ratePerMin2: 0.07,
    maxRate: 12.5,
    maxEnemies: 380,
    /** Enemy health is multiplied by this every minute. */
    hpGrowth: 1.11,
    /** Enemy contact damage grows by this much per minute. */
    damagePerMin: 0.09,
    /** Golden elites: tougher, and they drop a carrot and a pile of stardust. */
    elitesAfter: 90,
    eliteChance: 0.005,
    eliteChancePerMin: 0.0025,
    eliteHp: 6,
  },

  /** Which enemies appear when. `weights` are relative spawn weights from `at` seconds on. */
  phases: [
    { at: 0, weights: { slime: 1 } },
    { at: 30, weights: { slime: 6, bat: 4 } },
    { at: 90, weights: { slime: 6, bat: 4, skel: 2.5 } },
    { at: 150, weights: { slime: 5, bat: 4, skel: 3, ghost: 3 } },
    { at: 210, weights: { slime: 4, bat: 3, skel: 3, ghost: 3, shroom: 1.5 } },
    { at: 270, weights: { slime: 3, bat: 3, skel: 3.5, ghost: 3, shroom: 2, jelly: 2 } },
    { at: 330, weights: { slime: 2, bat: 3, skel: 3.5, ghost: 3, shroom: 2, jelly: 2, boar: 1.5 } },
    { at: 420, weights: { bat: 3, skel: 4, ghost: 3, shroom: 2.5, jelly: 2.5, boar: 2, golem: 1 } },
    { at: 510, weights: { bat: 3, skel: 4, ghost: 4, shroom: 2.5, jelly: 3, boar: 2.5, golem: 2 } },
  ] as { at: number; weights: Partial<Record<EnemyKind, number>> }[],

  /** Horde waves: a ring of enemies closes in on you at these times (seconds). */
  waves: [
    { at: 120, kind: "bat", count: 22, msg: "A bat swarm!" },
    { at: 195, kind: "slime", count: 28, msg: "Slimes surround you!" },
    { at: 330, kind: "ghost", count: 26, msg: "A ring of ghosts!" },
    { at: 430, kind: "skel", count: 28, msg: "The skeleton wall!" },
    { at: 560, kind: "boar", count: 14, msg: "The last dark hour!" },
  ] as { at: number; kind: EnemyKind; count: number; msg: string }[],

  /** Bosses: big King Slimes that slam the ground. `hp` is before the per-minute growth. */
  bosses: [
    { at: 255, name: "King Slime", hp: 1800, slamEvery: 4, bullets: 8, adds: 3 },
    { at: 495, name: "Slime Emperor", hp: 5000, slamEvery: 3.2, bullets: 10, adds: 3 },
  ],

  /** Falling stars land at these times. Each one reveals a constellation. */
  starfalls: [60, 165, 285, 405],

  pickups: {
    /** A magnet drops from a kill this often (seconds, randomized a little). */
    magnetEvery: 70,
    /** Chance per kill to drop a carrot; higher while you are hurt. */
    carrotChance: 0.004,
    carrotChanceHurt: 0.03,
    carrotHeal: 25,
    /** Stardust past this count merges into bigger pieces so the game stays fast. */
    maxGems: 320,
  },

  xp: {
    /** Stardust needed for the next star: base + perLevel × level + perLevel2 × level². */
    base: 5,
    perLevel: 5,
    perLevel2: 1.6,
    /** Once every star point is earned, a full bar heals this much instead. */
    overflowHeal: 8,
  },

  /** Harder nights: each night after the first multiplies these. */
  night: {
    max: 5,
    hp: 0.4,
    rate: 0.1,
    damage: 0.18,
  },
};
