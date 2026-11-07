// Every number that shapes how the game feels or balances lives here.
// Tweak freely while playtesting.

export type EnemyKind = "slime" | "bat" | "skel" | "king";

export const CFG = {
  /** Simulation step in seconds. Game logic runs at a fixed rate regardless of frame rate. */
  tick: 1 / 120,
  /** Minimum game view in art pixels. The view grows to fill wider screens. */
  minViewW: 320,
  minViewH: 180,

  player: {
    speed: 82,
    /** High acceleration and friction keep movement snappy rather than floaty. */
    accel: 1500,
    friction: 1800,
    maxHp: 100,
    radius: 5,
    /** Invulnerability after being hit, in seconds. */
    iframes: 0.6,
    pickupRadius: 30,
  },

  fireball: {
    cooldown: 0.8,
    damage: 10,
    speed: 200,
    life: 1.0,
    radius: 3,
    /** How many enemies one fireball can pass through before vanishing. */
    pierce: 1,
    knockback: 80,
    /** Degrees between fireballs in a volley. Volleys wider than fullCircleDeg become a ring. */
    spreadDeg: 14,
    fullCircleDeg: 300,
    /** Only casts when an enemy is within this distance. */
    range: 180,
    /** Each pip in the Speed socket makes casting this much faster (0.08 = 8%). */
    speedPerPip: 0.08,
    /** Damage bonus per level gained. */
    damagePerLevel: 0.1,
  },

  enemies: {
    slime: { hp: 10, speed: 30, damage: 8, radius: 5, xp: 1, color: "#ff8ad8" },
    bat: { hp: 6, speed: 52, damage: 5, radius: 4, xp: 1, color: "#b05aff" },
    skel: { hp: 32, speed: 24, damage: 12, radius: 5, xp: 3, color: "#ffffff" },
    king: { hp: 240, speed: 22, damage: 20, radius: 10, xp: 0, color: "#ffd23d" },
  } satisfies Record<EnemyKind, { hp: number; speed: number; damage: number; radius: number; xp: number; color: string }>,

  spawn: {
    /** Enemies per second at the start. */
    startRate: 0.8,
    /** Extra enemies per second added each minute. */
    ratePerMin: 3,
    maxRate: 20,
    maxEnemies: 450,
    /** Enemy HP multiplier grows by this much per minute. */
    hpPerMin: 0.35,
    batsAfter: 20,
    skeletonsAfter: 60,
    /** Seconds until the first King Slime, then the gap between them. Kings always drop a die. */
    kingFirst: 30,
    kingEvery: 45,
  },

  xp: {
    /** XP needed for level 2; each further level needs perLevel more. */
    base: 5,
    perLevel: 4,
  },

  dice: {
    /** Chance that a normal enemy drops a die when it dies. */
    dropChance: 0.003,
    /** Relative odds of each die type from normal enemies. */
    weights: { 3: 30, 4: 25, 6: 22, 8: 12, 10: 7, 12: 3, 20: 1 } as Record<number, number>,
    /** Relative odds from King Slimes. */
    kingWeights: { 3: 4, 4: 8, 6: 24, 8: 26, 10: 18, 12: 12, 20: 8 } as Record<number, number>,
    /** The die you start with, so you can try the mechanic straight away. */
    starting: 6,
  },

  bag: { cols: 6, rows: 4 },
};
