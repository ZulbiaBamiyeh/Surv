// Every number that shapes how the game feels or balances lives here.
// Spell numbers live in game.ts next to each spell; tree text lives in content.ts.

export type EnemyKind = "slime" | "bat" | "skel" | "king";

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
    pickupRadius: 36,
  },

  /** Small damage bonus for every level gained. Most power comes from skill trees. */
  levelDamage: 0.02,

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
  scrollDropChance: 0.0015,

  enemies: {
    slime: { hp: 10, speed: 34, damage: 8, radius: 8, xp: 1, color: "#ff83c0" },
    bat: { hp: 6, speed: 58, damage: 5, radius: 6, xp: 1, color: "#9658d4" },
    skel: { hp: 32, speed: 28, damage: 12, radius: 7, xp: 3, color: "#d4d2e2" },
    king: { hp: 240, speed: 25, damage: 20, radius: 17, xp: 0, color: "#ffd640" },
  } satisfies Record<EnemyKind, { hp: number; speed: number; damage: number; radius: number; xp: number; color: string }>,

  spawn: {
    /** Enemies per second at the start. */
    startRate: 0.7,
    /** Extra enemies per second added each minute. */
    ratePerMin: 1.2,
    /** Spawn rate also grows with minutes squared, so the early game is calm and the late game is not. */
    ratePerMin2: 0.17,
    maxRate: 26,
    maxEnemies: 480,
    /** Enemy HP is multiplied by this every minute (1.27 means about 2.6x at 4:00, 11x at 10:00, 36x at 15:00). */
    hpGrowth: 1.27,
    /** Enemy contact damage grows by this much per minute. */
    damagePerMin: 0.1,
    batsAfter: 20,
    skeletonsAfter: 60,
    /** Seconds until the first King Slime, then the gap between them. Kings always drop a scroll. */
    kingFirst: 40,
    kingEvery: 60,
  },

  xp: {
    /** XP needed for level 2; each further level needs perLevel more. */
    base: 4,
    perLevel: 3,
    /** Extra XP per level squared, so later levels slow down. */
    perLevel2: 0.18,
  },
};
