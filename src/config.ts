// Every number that shapes how the game feels or balances lives here.
// Tweak freely while playtesting.

export type EnemyKind = "slime" | "bat" | "skel" | "king";

export const CFG = {
  /** Simulation step in seconds. Game logic runs at a fixed rate regardless of frame rate. */
  tick: 1 / 120,
  /** Roughly how many art pixels fit across the screen's shorter side. */
  viewShortSide: 240,

  player: {
    speed: 100,
    /** High acceleration and friction keep movement snappy rather than floaty. */
    accel: 1500,
    friction: 1800,
    maxHp: 100,
    radius: 6,
    /** Invulnerability after being hit, in seconds. */
    iframes: 0.7,
    /** Health regained per second. */
    regen: 0.4,
    pickupRadius: 38,
  },

  /** Each pip in a Speed socket makes that scroll cast this much faster (0.08 = 8%). */
  speedPerPip: 0.08,
  /** Small damage bonus for every level gained. Most power comes from items. */
  levelDamage: 0.03,

  fireball: {
    speed: 235,
    life: 1.0,
    radius: 4,
    /** How many enemies one fireball can pass through before vanishing. */
    pierce: 1,
    knockback: 80,
    /** Degrees between fireballs in a volley. Volleys wider than fullCircleDeg become a ring. */
    spreadDeg: 14,
    fullCircleDeg: 300,
    /** Only casts when an enemy is within this distance. */
    range: 220,
  },

  /** Burn from Ember Rings lasts this long; chill from Frost Nova slows by chillSlow for chillTime. */
  burnTime: 3,
  chillTime: 2.5,
  chillSlow: 0.5,

  /** Survive this many seconds to win the run. */
  runLength: 900,

  /** Level-up choices offered. */
  offers: 3,

  enemies: {
    slime: { hp: 10, speed: 36, damage: 8, radius: 8, xp: 1, color: "#ff83c0" },
    bat: { hp: 6, speed: 62, damage: 5, radius: 6, xp: 1, color: "#9658d4" },
    skel: { hp: 32, speed: 29, damage: 12, radius: 7, xp: 3, color: "#d4d2e2" },
    king: { hp: 240, speed: 26, damage: 20, radius: 17, xp: 0, color: "#ffd640" },
  } satisfies Record<EnemyKind, { hp: number; speed: number; damage: number; radius: number; xp: number; color: string }>,

  spawn: {
    /** Enemies per second at the start. */
    startRate: 0.8,
    /** Extra enemies per second added each minute. */
    ratePerMin: 1.5,
    /** Spawn rate also grows with minutes squared, so the early game is calm and the late game is not. */
    ratePerMin2: 0.2,
    maxRate: 28,
    maxEnemies: 520,
    /** Enemy HP is multiplied by this every minute (1.3 means about 2.9x at 4:00, 14x at 10:00, 51x at 15:00). */
    hpGrowth: 1.3,
    /** Enemy contact damage grows by this much per minute. */
    damagePerMin: 0.1,
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
    /** Extra XP per level squared, so later levels slow down. */
    perLevel2: 0.18,
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
