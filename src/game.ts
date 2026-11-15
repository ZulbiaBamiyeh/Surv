import { CFG, EnemyKind } from "./config";
import { ConId, Sky } from "./sky";

export type Sfx =
  | "bolt" | "flame" | "frost" | "zap" | "plop" | "pool" | "burst" | "hit" | "pop" | "gem" | "level" | "hurt" | "magnet"
  | "heal" | "charm" | "dice" | "wave" | "spit" | "charge" | "boss" | "bossDown" | "starfall" | "starLand" | "discover"
  | "dawn" | "over" | "tap" | "light";

export type El = "moon" | "fire" | "frost" | "storm" | "poison" | "none";

export interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  kx: number;
  ky: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  damage: number;
  xp: number;
  flash: number;
  phase: number;
  dead: boolean;
  burnT: number;
  burnDps: number;
  burnShown: number;
  chillT: number;
  freezeT: number;
  stunT: number;
  /** Seconds since this enemy last stood in poison. */
  poisonT: number;
  /** Seconds left of extra damage from a whirlpool. */
  wetT: number;
  dizzyT: number;
  /** While above zero this enemy fights for you. */
  charmT: number;
  /** Cooldowns between repeated hits from the same kind of thing. */
  bumpT: number;
  mothT: number;
  dustT: number;
  pathT: number;
  /** Golden elites are much tougher and drop a carrot. */
  elite: boolean;
  /** Index into CFG.bosses, or -1. */
  boss: number;
  /** Behavior state for boars (0 chase, 1 wind up, 2 charge, 3 rest), shooters and bosses. */
  ai: number;
  aiT: number;
  dirX: number;
  dirY: number;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  r: number;
  pierce: number;
  hit: Enemy[];
  dead: boolean;
  kind: "bolt" | "flame" | "icicle" | "glob";
  src: string;
}

export type RingTheme = "ice" | "fire" | "star" | "heart" | "water";
export interface Ring { x: number; y: number; t: number; r: number; damage: number; src: string; el: El; theme: RingTheme; chill: number; freeze: number; stun: number; kb: number; burn: number; hit: Set<Enemy>; dead: boolean; }
export interface Puddle { x: number; y: number; r: number; t: number; dur: number; tick: number; damage: number; dead: boolean; }
export interface Pool { x: number; y: number; t: number; dur: number; r: number; damage: number; dead: boolean; }
export interface Bolt { pts: [number, number][]; t: number; dead: boolean; beam?: boolean; }
/** An enemy projectile (mushroom spores, boss slams). */
export interface Spit { x: number; y: number; vx: number; vy: number; life: number; damage: number; dead: boolean; }
export interface Gem { x: number; y: number; value: number; magnet: boolean; sp: number; dead: boolean; }
export type PickupKind = "magnet" | "carrot" | "feast" | "star";
export interface Loot { kind: PickupKind; x: number; y: number; magnet: boolean; sp: number; dead: boolean; t: number; }
/** A star on its way down from the sky. */
export interface Starfall { x: number; y: number; t: number; dur: number; dead: boolean; }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; rise?: number; }
export interface Effect { kind: "poof" | "spark" | "ring" | "blast" | "heart" | "flash"; x: number; y: number; t: number; dur: number; scale: number; color?: string; }
export interface DamageNumber { x: number; y: number; value: number; t: number; style: El | "crit" | "heal" | "roll" | "big"; }

export interface GameEvents {
  /** A new star point was earned. */
  levelUp(): void;
  /** You touched a fallen star: time to choose a constellation. */
  starTouched(): void;
  gameOver(): void;
  /** Dawn broke: you made it through the night. */
  victory(): void;
  toast(msg: string, kind?: "good" | "warn" | "gold" | "danger"): void;
  sfx?(name: Sfx, pitch?: number): void;
}

const HASH = 32;
const hk = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
const RING_TIME = 0.35;

function compact<T extends { dead: boolean }>(arr: T[]) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
  arr.length = j;
}

/** Timers for everything that fires on its own schedule (seconds until the next one). */
const TIMERS = { bolt: 0.4, fox: 1, ring: 1.2, zap: 0.8, cloud: 1, bog: 0.8, pool: 2.5, charm: 3, roll: 6, beam: 1, magnet: CFG.pickups.magnetEvery * 0.6 };
type TimerId = keyof typeof TIMERS;

export class Game {
  time = 0;
  kills = 0;
  /** Stars earned + 1. */
  level = 1;
  xp = 0;
  over = false;
  won = false;
  lastHitBy = "";
  hitstop = 0;
  shake = 0;
  viewW = 240;
  viewH = 400;
  input = { x: 0, y: 0 };

  player = {
    x: 0, y: 0, vx: 0, vy: 0, hp: CFG.player.maxHp, maxHp: CFG.player.maxHp,
    inv: 0, moving: false, face: 1, walkT: 0, lives: 1,
  };
  sky = new Sky();
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  rings: Ring[] = [];
  puddles: Puddle[] = [];
  pools: Pool[] = [];
  bolts: Bolt[] = [];
  gems: Gem[] = [];
  loot: Loot[] = [];
  spits: Spit[] = [];
  starfalls: Starfall[] = [];
  /** Fire Path: where you've walked lately. */
  path: { x: number; y: number; t: number }[] = [];
  /** Damage dealt by each spell tonight. */
  dealt = new Map<string, number>();
  parts: Particle[] = [];
  fx: Effect[] = [];
  nums: DamageNumber[] = [];
  /** Moth positions, refreshed every step for drawing. */
  moths: { x: number; y: number }[] = [];
  /** The boss on the field, if any. */
  boss: Enemy | null = null;
  /** Fallen stars you've touched and not yet chosen a constellation for. */
  pendingStars = 0;

  private spawnAcc = 0;
  private hash = new Map<number, Enemy[]>();
  private pool: Enemy[][] = [];
  private phase = 0;
  private nextWave = 0;
  private nextBoss = 0;
  private nextStar = 0;
  private mergeI = 0;
  private rings3 = 0;
  private mothAngle = 0;
  private fur = false;
  private chain = 0;
  private T: Record<TimerId, number> = { ...TIMERS };

  constructor(private events: GameEvents, readonly night = 1, start?: ConId) {
    if (start) this.sky.discover(start);
  }

  // ---------- Small helpers ----------
  has(id: string) {
    return this.sky.has(id);
  }
  sfx(name: Sfx, pitch?: number) {
    this.events.sfx?.(name, pitch);
  }
  /** Damage multiplier for every spell. */
  get power() {
    return this.has("bright") ? 1.25 : 1;
  }
  /** Cooldown multiplier for every spell. */
  get cd() {
    return this.has("quick") ? 1 / 1.2 : 1;
  }
  get xpNeeded() {
    const l = this.level - 1;
    return Math.round(CFG.xp.base + CFG.xp.perLevel * l + CFG.xp.perLevel2 * l * l);
  }
  private get nightHp() {
    return 1 + CFG.night.hp * (this.night - 1);
  }
  private onScreen(e: { x: number; y: number }) {
    return Math.abs(e.x - this.player.x) < this.viewW / 2 + 8 && Math.abs(e.y - this.player.y) < this.viewH / 2 + 8;
  }
  /** Rolls a die; Loaded Dice rolls twice and keeps the better one. */
  private roll(sides: number) {
    const one = () => 1 + Math.floor(Math.random() * sides);
    return this.has("loaded") ? Math.max(one(), one()) : one();
  }

  // ---------- Main step ----------
  step(dt: number) {
    if (this.over || this.won) return;
    this.shake = Math.max(0, this.shake - 24 * dt);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time += dt;
    if (this.time >= CFG.nightLength) return this.dawn();
    for (const k in this.T) this.T[k as TimerId] -= dt;
    this.updatePlayer(dt);
    this.spawn(dt);
    this.buildHash();
    this.updateEnemies(dt);
    this.updateSpits(dt);
    this.updateSpells(dt);
    this.updateShots(dt);
    this.updateRings(dt);
    this.updatePuddles(dt);
    this.updatePools(dt);
    this.updateStarfalls(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    compact(this.enemies);
    compact(this.shots);
    compact(this.rings);
    compact(this.puddles);
    compact(this.pools);
    compact(this.bolts);
    compact(this.gems);
    compact(this.loot);
    compact(this.spits);
    compact(this.starfalls);
    if (this.boss?.dead) this.boss = null;
  }

  /** Dawn: the night is over and everything left melts away. */
  private dawn() {
    this.won = true;
    for (const e of this.enemies) {
      e.dead = true;
      this.effect("poof", e.x, e.y - e.r, 1, 0.5);
    }
    this.enemies.length = 0;
    this.spits.length = 0;
    this.boss = null;
    this.effect("flash", 0, 0, 1, 1.5, "#fff2b0");
    this.sfx("dawn");
    this.events.victory();
  }

  // ---------- Player ----------
  private updatePlayer(dt: number) {
    const p = this.player;
    const c = CFG.player;
    // Thick Fur: more health, and heal by the same amount when you take it
    if (this.has("fur") !== this.fur) {
      this.fur = this.has("fur");
      p.maxHp = c.maxHp + (this.fur ? 30 : 0);
      p.hp = Math.min(p.maxHp, p.hp + (this.fur ? 30 : 0));
    }
    const speed = c.speed * (this.has("hop") ? 1.15 : 1);
    const tx = this.input.x * speed;
    const ty = this.input.y * speed;
    const moving = tx !== 0 || ty !== 0;
    const dx = tx - p.vx;
    const dy = ty - p.vy;
    const len = Math.hypot(dx, dy);
    const step = (moving ? c.accel : c.friction) * dt;
    if (len <= step) {
      p.vx = tx;
      p.vy = ty;
    } else {
      p.vx += (dx / len) * step;
      p.vy += (dy / len) * step;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.moving = moving;
    if (this.input.x !== 0) p.face = this.input.x > 0 ? 1 : -1;
    if (moving) p.walkT += dt;
    p.inv = Math.max(0, p.inv - dt);
    p.hp = Math.min(p.maxHp, p.hp + c.regen * dt);
  }

  private hurt(amount: number, by: string) {
    const p = this.player;
    if (p.inv > 0 || this.over) return;
    this.lastHitBy = by;
    p.hp -= amount;
    p.inv = CFG.player.iframes;
    this.shake = 3;
    this.hitstop = 0.05;
    this.sfx("hurt");
    this.burst(p.x, p.y - 12, "#ff3d4a", 10, 70);
    if (p.hp > 0) return;
    if (this.has("ninelives") && p.lives > 0) {
      // Nine Lives: back on your paws, with a shove to clear some room
      p.lives--;
      p.hp = p.maxHp / 2;
      p.inv = 2;
      this.ring(p.x, p.y - 8, 80, 30 * this.power, "Nine Lives", "none", "heart", { kb: 3 });
      this.events.toast("Nine Lives! You got back up.", "gold");
      this.sfx("heal");
      return;
    }
    p.hp = 0;
    this.over = true;
    this.effect("poof", p.x, p.y - 12, 1.6, 0.6);
    this.sfx("over");
    this.events.gameOver();
  }

  heal(amount: number) {
    const p = this.player;
    const v = Math.round(Math.min(p.maxHp - p.hp, amount));
    if (v <= 0) return;
    p.hp += v;
    this.nums.push({ x: p.x, y: p.y - 40, value: v, t: 0, style: "heal" });
    for (let i = 0; i < 12; i++)
      this.parts.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y - Math.random() * 26, vx: 0, vy: 0, life: 0.8, max: 0.8, color: i % 2 ? "#ffd0f0" : "#ffffff", size: 2, rise: 30 });
  }

  /** A new constellation joins your sky: its spell, a little healing, and a burst of starlight. */
  discover(c: ConId) {
    const p = this.player;
    this.sky.discover(c);
    this.heal(p.maxHp * 0.15);
    this.ring(p.x, p.y - 8, 90, 25 * this.power, "Starburst", "none", "star", { kb: 2.5 });
    this.effect("flash", 0, 0, 1, 0.6, "#fff2b0");
    p.inv = Math.max(p.inv, 1.2);
    // Let the new spell show itself off right away
    for (const k of ["fox", "ring", "zap", "bog", "pool", "charm"] as TimerId[]) this.T[k] = Math.min(this.T[k], 0.4);
    this.sfx("discover");
  }

  // ---------- Spawning ----------
  private spawn(dt: number) {
    const s = CFG.spawn;
    const m = this.time / 60;
    while (this.phase + 1 < CFG.phases.length && this.time >= CFG.phases[this.phase + 1].at) this.phase++;
    const rate = Math.min(s.maxRate, s.startRate + s.ratePerMin * m + s.ratePerMin2 * m * m) * (1 + CFG.night.rate * (this.night - 1));
    // Things calm down a little while a boss is up
    this.spawnAcc += rate * dt * (this.boss ? 0.6 : 1);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= s.maxEnemies) continue;
      const e = this.spawnEnemy(this.pickKind());
      const eliteP = this.time < s.elitesAfter ? 0 : s.eliteChance + s.eliteChancePerMin * (m - s.elitesAfter / 60);
      if (Math.random() < eliteP) {
        e.elite = true;
        e.hp = e.maxHp = e.maxHp * s.eliteHp;
        e.damage *= 1.4;
        e.speed *= 1.1;
      }
    }
    // Waves
    const w = CFG.waves[this.nextWave];
    if (w && this.time >= w.at) {
      this.nextWave++;
      const r = Math.hypot(this.viewW, this.viewH) / 2 + 12;
      for (let i = 0; i < w.count; i++) {
        const a = (i / w.count) * Math.PI * 2;
        this.spawnEnemy(w.kind, this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r);
      }
      this.events.toast(w.msg, "danger");
      this.sfx("wave");
    }
    // Bosses
    const b = CFG.bosses[this.nextBoss];
    if (b && this.time >= b.at) {
      const e = this.spawnEnemy("king");
      e.boss = this.nextBoss++;
      e.hp = e.maxHp = b.hp * s.hpGrowth ** m * this.nightHp;
      e.damage *= 1 + e.boss * 0.4;
      e.aiT = b.slamEvery;
      this.boss = e;
      this.events.toast(`${b.name} is here!`, "danger");
      this.sfx("boss");
    }
    // Falling stars
    if (this.nextStar < CFG.starfalls.length && this.time >= CFG.starfalls[this.nextStar]) {
      this.nextStar++;
      const a = Math.random() * Math.PI * 2;
      const d = 110 + Math.random() * 40;
      this.starfalls.push({ x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d * 0.8, t: 0, dur: 1.5, dead: false });
      this.events.toast("A star is falling!", "gold");
      this.sfx("starfall");
    }
  }

  private pickKind(): EnemyKind {
    const weights = CFG.phases[this.phase].weights;
    let total = 0;
    for (const k in weights) total += weights[k as EnemyKind]!;
    let r = Math.random() * total;
    for (const k in weights) if ((r -= weights[k as EnemyKind]!) < 0) return k as EnemyKind;
    return "slime";
  }

  private edgePoint() {
    const a = Math.random() * Math.PI * 2;
    const d = Math.hypot(this.viewW, this.viewH) / 2 + 16;
    return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
  }

  spawnEnemy(kind: EnemyKind, x?: number, y?: number): Enemy {
    const t = CFG.enemies[kind];
    const min = this.time / 60;
    const hp = t.hp * CFG.spawn.hpGrowth ** min * this.nightHp;
    if (x === undefined || y === undefined) ({ x, y } = this.edgePoint());
    const e: Enemy = {
      kind, x, y, kx: 0, ky: 0, hp, maxHp: hp, r: t.radius, speed: t.speed * (0.9 + Math.random() * 0.2),
      damage: t.damage * (1 + CFG.spawn.damagePerMin * min) * (1 + CFG.night.damage * (this.night - 1)),
      xp: t.xp, flash: 0, phase: Math.random() * 10, dead: false,
      burnT: 0, burnDps: 0, burnShown: 0, chillT: 0, freezeT: 0, stunT: 0, poisonT: 9, wetT: 0, dizzyT: 0, charmT: 0,
      bumpT: 0, mothT: 0, dustT: 0, pathT: 0, elite: false, boss: -1, ai: 0, aiT: 1 + Math.random() * 2, dirX: 0, dirY: 0,
    };
    this.enemies.push(e);
    return e;
  }

  // ---------- Enemies ----------
  private buildHash() {
    for (const a of this.hash.values()) {
      a.length = 0;
      this.pool.push(a);
    }
    this.hash.clear();
    for (const e of this.enemies) {
      const k = hk(Math.floor(e.x / HASH), Math.floor(e.y / HASH));
      let a = this.hash.get(k);
      if (!a) this.hash.set(k, (a = this.pool.pop() ?? []));
      a.push(e);
    }
  }

  forNear(x: number, y: number, fn: (e: Enemy) => void, reach = 1) {
    const cx = Math.floor(x / HASH);
    const cy = Math.floor(y / HASH);
    for (let dx = -reach; dx <= reach; dx++)
      for (let dy = -reach; dy <= reach; dy++) {
        const a = this.hash.get(hk(cx + dx, cy + dy));
        if (a) for (let i = 0; i < a.length; i++) fn(a[i]);
      }
  }

  /** Runs `fn` on every living enemy (not a friend) inside a circle. */
  private inCircle(x: number, y: number, r: number, fn: (e: Enemy) => void) {
    this.forNear(x, y, (e) => {
      if (!e.dead && e.charmT <= 0 && (e.x - x) ** 2 + (e.y - y) ** 2 <= (r + e.r * 0.5) ** 2) fn(e);
    }, Math.ceil(r / HASH));
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    const decay = Math.exp(-9 * dt);
    const far = Math.hypot(this.viewW, this.viewH) * 0.75 + 60;
    const chillSlow = this.has("winter") ? 0.4 : 0.6;
    const sticky = this.has("sticky");
    for (const e of this.enemies) {
      if (e.dead) continue;
      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      let mx = dx;
      let my = dy;
      let sp = e.speed;
      const held = e.freezeT > 0 || e.stunT > 0;
      e.poisonT += dt;
      e.bumpT -= dt;
      e.mothT -= dt;
      e.dustT -= dt;
      e.pathT -= dt;
      e.wetT -= dt;
      e.flash = Math.max(0, e.flash - dt);
      e.chillT = Math.max(0, e.chillT - dt);
      e.freezeT = Math.max(0, e.freezeT - dt);
      e.stunT = Math.max(0, e.stunT - dt);
      if (!held) e.aiT -= dt;
      if (e.charmT > 0) {
        // Friends hunt the nearest enemy instead of you
        e.charmT -= dt;
        const t = this.nearest(e.x, e.y, 160);
        if (t) {
          const ux = t.x - e.x;
          const uy = t.y - e.y;
          const ud = Math.hypot(ux, uy) || 1;
          mx = ux / ud;
          my = uy / ud;
          sp = Math.max(e.speed, 40) * (this.has("crush") ? 1.6 : 1.3);
        } else sp = 0;
        if (Math.random() < dt * 4) this.parts.push({ x: e.x, y: e.y - e.r * 2, vx: 0, vy: 0, life: 0.6, max: 0.6, color: "#ff80c0", size: 2, rise: 20 });
        if (e.charmT <= 0) {
          if (this.has("heartbreak")) {
            this.ring(e.x, e.y - 6, 45, 20 * this.power, "Heartbreak", "none", "heart", { kb: 1 });
            this.heal(3);
          }
          this.kill(e, "none");
          continue;
        }
      } else if (e.dizzyT > 0) {
        e.dizzyT -= dt;
        mx = e.dirX;
        my = e.dirY;
        sp *= 0.6;
        if (Math.random() < dt * 2) {
          const a = Math.random() * Math.PI * 2;
          e.dirX = Math.cos(a);
          e.dirY = Math.sin(a);
        }
      } else if (e.boss >= 0) {
        // Bosses slam the ground: a ring of spores and a few slimes
        const b = CFG.bosses[e.boss];
        if (e.aiT <= 0 && !held) {
          e.aiT = b.slamEvery;
          e.flash = 0.12;
          this.shake = Math.max(this.shake, 2.5);
          this.effect("ring", e.x, e.y - 6, 1.6, 0.4, "#ffd640");
          const off = Math.random() * Math.PI;
          for (let i = 0; i < b.bullets; i++) {
            const a = off + (i / b.bullets) * Math.PI * 2;
            this.spits.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * 62, vy: Math.sin(a) * 62, life: 4, damage: e.damage * 0.6, dead: false });
          }
          for (let i = 0; i < b.adds; i++) this.spawnEnemy(e.boss ? "jelly" : "slime", e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30);
          this.sfx("burst", 0.6);
        }
        // A little hop in its step
        sp *= 0.6 + Math.abs(Math.sin(this.time * 3)) * 1.2;
      } else if (e.kind === "ghost") {
        // Weaves side to side as it comes
        const w = Math.sin(this.time * 3 + e.phase) * 0.8;
        mx = dx - dy * w;
        my = dy + dx * w;
      } else if (e.kind === "shroom") {
        // Hangs back at spitting range and lobs spores
        const want = d > 96 ? 1 : d < 70 ? -0.8 : 0;
        const side = Math.sin(e.phase) > 0 ? 0.4 : -0.4;
        mx = dx * want - dy * side;
        my = dy * want + dx * side;
        if (e.aiT <= 0 && d < 150 && !held) {
          e.aiT = 2.8 + Math.random() * 1.2;
          const a = Math.atan2(p.y - 10 - (e.y - 8), p.x - e.x);
          this.spits.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * 72, vy: Math.sin(a) * 72, life: 3, damage: e.damage, dead: false });
          e.flash = 0.06;
          this.sfx("spit");
        }
      } else if (e.kind === "boar") {
        if (e.ai === 0 && e.aiT <= 0 && d < 120) {
          e.ai = 1;
          e.aiT = 0.75;
          this.sfx("charge");
        } else if (e.ai === 1) {
          sp = 0;
          e.dirX = dx;
          e.dirY = dy;
          if (e.aiT <= 0) {
            e.ai = 2;
            e.aiT = 0.55;
          }
        } else if (e.ai === 2) {
          mx = e.dirX;
          my = e.dirY;
          sp = 240;
          if (e.aiT <= 0) {
            e.ai = 3;
            e.aiT = 0.9;
          }
        } else if (e.ai === 3) {
          sp *= 0.3;
          if (e.aiT <= 0) {
            e.ai = 0;
            e.aiT = 1.8 + Math.random();
          }
        }
      }
      let slow = held ? 0 : e.chillT > 0 ? chillSlow : 1;
      if (sticky && e.poisonT < 0.8 && e.charmT <= 0) slow *= 0.6;
      e.x += (mx * sp * slow + e.kx) * dt;
      e.y += (my * sp * slow + e.ky) * dt;
      e.kx *= decay;
      e.ky *= decay;
      // Burning
      if (e.burnT > 0) {
        e.burnT -= dt;
        const dmg = Math.min(e.hp, e.burnDps * dt);
        e.hp -= dmg;
        e.burnShown += dmg;
        this.credit("Burning", dmg);
        if (Math.random() < dt * 12)
          this.parts.push({ x: e.x + (Math.random() - 0.5) * e.r * 1.4, y: e.y - Math.random() * e.r * 1.6, vx: 0, vy: 0, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? "#ffa424" : "#f05a1a", size: 1, rise: 24 });
        if (e.burnShown >= 5 || (e.burnT <= 0 && e.burnShown >= 1)) {
          this.nums.push({ x: e.x + 4, y: e.y - e.r * 2, value: Math.round(e.burnShown), t: 0, style: "fire" });
          e.burnShown = 0;
        }
        if (e.hp <= 0) {
          this.kill(e, "fire");
          continue;
        }
      }
      const friendly = e.charmT > 0;
      const bumping = friendly || e.dizzyT > 0;
      if (e.kind !== "ghost" || bumping)
        this.forNear(e.x, e.y, (o) => {
          if (o === e || o.dead || (o.kind === "ghost" && !bumping)) return;
          const ox = e.x - o.x;
          const oy = e.y - o.y;
          const rs = e.r + o.r;
          const dd = ox * ox + oy * oy;
          if (dd >= rs * rs || dd === 0) return;
          // Friends and dizzy enemies hurt whatever they bump into
          if (bumping && o.bumpT <= 0 && o.charmT <= 0) {
            o.bumpT = 0.5;
            const amount = friendly ? (o.maxHp * 0.04 + 6 * this.power) * (this.has("crush") ? 3 : 1) : o.maxHp * 0.04 + 3 * this.power;
            this.hit(o, o.boss >= 0 ? Math.min(amount, 40 * this.power) : amount, "none", friendly ? "Charm" : "Moth Dust", { dx: -ox, dy: -oy, kb: 0.6, noCrit: true });
          }
          const dist = Math.sqrt(dd);
          const heavy = o.kind === "king" || o.kind === "golem";
          const push = ((rs - dist) / dist) * (heavy ? 0.5 : e.kind === "golem" || e.kind === "king" ? 0.08 : 0.25);
          e.x += ox * push;
          e.y += oy * push;
        });
      if (d > far && e.boss < 0 && !e.elite && !friendly) {
        const pt = this.edgePoint();
        e.x = pt.x;
        e.y = pt.y;
      }
      if (d < e.r + CFG.player.radius && !bumping && !held) this.hurt(e.damage, e.boss >= 0 ? CFG.bosses[e.boss].name : e.elite ? "golden " + NAMES[e.kind] : NAMES[e.kind]);
    }
  }

  private updateSpits(dt: number) {
    const p = this.player;
    for (const s of this.spits) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) s.dead = true;
      else if ((s.x - p.x) ** 2 + (s.y - (p.y - 10)) ** 2 < 7 * 7) {
        s.dead = true;
        this.burst(s.x, s.y, "#d8a0ff", 6, 50);
        this.hurt(s.damage, "spore");
      }
    }
  }

  // ---------- Targeting ----------
  /** The closest enemy that isn't on your side. */
  nearest(x: number, y: number, range: number, skip?: Set<Enemy>): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (e.dead || e.charmT > 0 || skip?.has(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private randomEnemy(range: number, screen = false): Enemy | null {
    const p = this.player;
    const near: Enemy[] = [];
    for (const e of this.enemies)
      if (!e.dead && e.charmT <= 0 && (screen ? this.onScreen(e) : (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < range * range)) near.push(e);
    return near.length ? near[Math.floor(Math.random() * near.length)] : null;
  }

  /** An enemy in the thick of a crowd, from a small sample. */
  private crowd(range: number, skip?: Enemy): Enemy | null {
    let best: Enemy | null = null;
    let bestN = -1;
    for (let i = 0; i < 10; i++) {
      const e = this.randomEnemy(range);
      if (!e) return null;
      if (e === skip) continue;
      let n = 0;
      this.forNear(e.x, e.y, (o) => {
        if (!o.dead && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 45 * 45) n++;
      });
      if (n > bestN) {
        bestN = n;
        best = e;
      }
    }
    return best;
  }

  // ---------- Your spells ----------
  private updateSpells(dt: number) {
    const p = this.player;
    const T = this.T;
    const P = this.power;
    // Spells leave from the crescent moon on the staff
    const ox = p.x + 9 * p.face;
    const oy = p.y - 24;

    // The Moon: Moonbolt. The Hare rolls a die for how many.
    if (T.bolt <= 0) {
      const target = this.nearest(ox, oy, 200);
      if (target) {
        T.bolt = 0.6 * this.cd;
        let n = 1;
        if (this.has("hare")) {
          n = this.roll(3);
          if (n === 3) {
            this.nums.push({ x: p.x, y: p.y - 44, value: 3, t: 0, style: "roll" });
            if (this.has("jackpot")) for (let i = 0; i < 8; i++) this.moonbolt(p.x, p.y - 14, (i / 8) * Math.PI * 2);
          }
        }
        if (this.has("twin")) n++;
        const aim = Math.atan2(target.y - target.r - oy, target.x - ox);
        for (let i = 0; i < n; i++) this.moonbolt(ox, oy, aim + (i - (n - 1) / 2) * 0.16);
        this.sfx("bolt");
      } else T.bolt = 0.1;
    }

    // The Fox: Foxfire, a fan of flames
    if (this.has("fox") && T.fox <= 0) {
      const target = this.nearest(p.x, p.y, 110);
      if (target) {
        T.fox = 2.5 * this.cd;
        const n = this.has("tails") ? 5 : 3;
        const aim = Math.atan2(target.y - target.r - (p.y - 14), target.x - p.x);
        for (let i = 0; i < n; i++) {
          const a = aim + (i - (n - 1) / 2) * 0.26;
          this.shots.push({ x: p.x, y: p.y - 14, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, life: 0.62, damage: 9 * P, r: 5, pierce: 99, hit: [], dead: false, kind: "flame", src: "Foxfire" });
        }
        this.sfx("flame");
      } else T.fox = 0.15;
    }
    if (this.has("firepath")) this.updatePath();
    else this.path.length = 0;

    // The Stag: Frost Ring
    if (this.has("stag") && T.ring <= 0) {
      const r = 50 * (this.has("winter") ? 1.4 : 1);
      if (this.nearest(p.x, p.y, r * 1.5)) {
        T.ring = 3 * this.cd;
        const freeze = this.has("freeze") && ++this.rings3 % 3 === 0;
        this.ring(p.x, p.y - 6, r, 14 * P, "Frost Ring", "frost", "ice", { chill: CFG.chillTime, freeze: freeze ? 2 : 0, kb: 1.2 });
        if (this.has("icicles"))
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + this.rings3 * 0.4;
            this.shots.push({ x: p.x, y: p.y - 10, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, life: 0.7, damage: 8 * P, r: 3, pierce: 2, hit: [], dead: false, kind: "icicle", src: "Icicles" });
          }
        if (freeze) this.effect("flash", 0, 0, 1, 0.4, "#bfe8ff");
        this.sfx("frost");
      } else T.ring = 0.2;
    }

    // The Owl: Chain Lightning
    if (this.has("owl") && T.zap <= 0) {
      const first = this.nearest(p.x, p.y, 200);
      if (first) {
        T.zap = 2 * this.cd;
        this.lightning(ox, oy, first, 3 + (this.has("forked") ? 3 : 0), 16 * P, "Lightning");
        this.sfx("zap");
      } else T.zap = 0.15;
    }
    if (this.has("cloud") && T.cloud <= 0) {
      T.cloud = 1 * this.cd;
      const e = this.randomEnemy(0, true);
      if (e) {
        this.bolts.push({ pts: [[e.x + 6, e.y - 120], [e.x, e.y - e.r]], t: 0, dead: false });
        this.hit(e, 13 * P, "storm", "Storm Cloud", { kb: 0.3, stun: this.has("static") ? 0.5 : 0 });
        this.sfx("zap", 1.4);
      }
    }

    // The Toad: Bog Bubble
    if (this.has("toad") && T.bog <= 0) {
      const t = this.crowd(170);
      if (t) {
        T.bog = 2 * this.cd;
        const d = Math.hypot(t.x - p.x, t.y - p.y) || 1;
        const sp = 170;
        this.shots.push({ x: p.x, y: p.y, vx: ((t.x - p.x) / d) * sp, vy: ((t.y - p.y) / d) * sp, life: d / sp, damage: 8 * P, r: 3, pierce: 99, hit: [], dead: false, kind: "glob", src: "Bog Bubble" });
        this.sfx("plop");
      } else T.bog = 0.2;
    }

    // The Moth: Moon Moths
    if (this.has("moth")) this.updateMoths(dt);
    else this.moths.length = 0;

    // The Whale: Whirlpool
    if (this.has("whale") && T.pool <= 0) {
      const t = this.crowd(170);
      if (t) {
        T.pool = 7 * this.cd;
        const r = 46 * (this.has("undertow") ? 1.4 : 1);
        const make = (x: number, y: number) => this.pools.push({ x, y, t: 0, dur: 2.5, r, damage: 22 * P * (this.has("leviathan") ? 3 : 1), dead: false });
        make(t.x, t.y);
        if (this.has("tides")) {
          const u = this.crowd(170, t);
          if (u && (u.x - t.x) ** 2 + (u.y - t.y) ** 2 > r * r) make(u.x, u.y);
          else make(t.x + (Math.random() < 0.5 ? -1 : 1) * r * 1.6, t.y + (Math.random() - 0.5) * r);
        }
        this.sfx("pool");
      } else T.pool = 0.5;
    }

    // The Cat: Charm
    if (this.has("cat") && T.charm <= 0) {
      let got = 0;
      for (let i = 0; i < (this.has("twohearts") ? 2 : 1); i++) {
        let best: Enemy | null = null;
        for (const e of this.enemies)
          if (!e.dead && e.boss < 0 && !e.elite && e.charmT <= 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 130 * 130 && (!best || e.hp > best.hp)) best = e;
        if (!best) break;
        best.charmT = 8;
        best.dizzyT = 0;
        this.effect("heart", best.x, best.y - best.r * 2, 1, 0.8);
        got++;
      }
      T.charm = got ? 9 * this.cd : 0.5;
      if (got) this.sfx("charm");
    }

    // The Hare: High Roller
    if (this.has("roller") && T.roll <= 0) {
      T.roll = 12;
      const r = this.roll(20);
      this.nums.push({ x: p.x, y: p.y - 50, value: r, t: 0, style: "roll" });
      this.sfx("dice");
      if (r === 1) {
        this.events.toast("High Roller rolled a 1. Ouch!", "warn");
        p.inv = 0;
        this.hurt(15, "bad roll");
      } else if (r === 20) {
        this.events.toast("High Roller rolled a 20!", "gold");
        this.effect("flash", 0, 0, 1, 0.8, "#ffffff");
        this.shake = 5;
        for (const e of this.enemies) if (!e.dead && e.charmT <= 0 && this.onScreen(e)) this.hit(e, 150 * P, "moon", "High Roller", { kb: 2, noCrit: true });
        this.heal(p.maxHp);
      } else for (let i = 0; i < r; i++) this.moonbolt(p.x, p.y - 14, (i / r) * Math.PI * 2 + this.time, "High Roller");
    }
  }

  private moonbolt(x: number, y: number, a: number, src = "Moonbolt") {
    this.shots.push({ x, y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, life: 0.85, damage: 12 * this.power, r: 4, pierce: 0, hit: [], dead: false, kind: "bolt", src });
  }

  private ring(x: number, y: number, r: number, damage: number, src: string, el: El, theme: RingTheme, o: { chill?: number; freeze?: number; stun?: number; kb?: number; burn?: number }) {
    this.rings.push({ x, y, t: 0, r, damage, src, el, theme, chill: o.chill ?? 0, freeze: o.freeze ?? 0, stun: o.stun ?? 0, kb: o.kb ?? 1, burn: o.burn ?? 0, hit: new Set(), dead: false });
  }

  private puddle(x: number, y: number, r: number, dur: number, damage: number) {
    // A new puddle on top of a fresh one just tops it up
    for (let i = this.puddles.length - 1; i >= Math.max(0, this.puddles.length - 20); i--) {
      const o = this.puddles[i];
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < (o.r * 0.5) ** 2 && o.r >= r) {
        o.t = Math.min(o.t, o.dur * 0.2);
        return;
      }
    }
    if (this.puddles.length < 70) this.puddles.push({ x, y, r, t: 0, dur, tick: 0, damage, dead: false });
  }

  /** Lightning that starts at (x, y), strikes `first` and jumps on from there. */
  private lightning(x: number, y: number, first: Enemy, jumps: number, dmg: number, src: string) {
    const seen = new Set<Enemy>();
    const pts: [number, number][] = [[x, y]];
    let cur: Enemy | null = first;
    for (let i = 0; i <= jumps && cur; i++) {
      seen.add(cur);
      pts.push([cur.x, cur.y - cur.r]);
      const from = pts[pts.length - 2];
      this.hit(cur, dmg, "storm", src, { dx: cur.x - from[0], dy: cur.y - from[1], kb: 0.6, stun: this.has("static") ? 0.5 : 0 });
      this.effect("spark", cur.x, cur.y - cur.r, 1, 0.16);
      cur = this.nearest(cur.x, cur.y, 70, seen);
    }
    this.bolts.push({ pts, t: 0, dead: false });
  }

  /** Fire Path: a line of fire that follows you and burns anything that crosses it. */
  private updatePath() {
    const p = this.player;
    const pts = this.path;
    const last = pts[pts.length - 1];
    if (!last || (last.x - p.x) ** 2 + (last.y - p.y) ** 2 > 36) pts.push({ x: p.x, y: p.y, t: this.time });
    while (pts.length && this.time - pts[0].t > 2.5) pts.shift();
    if (pts.length > 80) pts.shift();
    const dmg = 5 * this.power;
    for (let i = 0; i < pts.length; i += 2) {
      const pt = pts[i];
      this.forNear(pt.x, pt.y, (e) => {
        if (e.dead || e.charmT > 0 || e.pathT > 0 || (e.x - pt.x) ** 2 + (e.y - pt.y) ** 2 > (7 + e.r) ** 2) return;
        e.pathT = 0.5;
        this.hit(e, dmg, "fire", "Fire Path", { kb: 0, burn: 4 });
      });
    }
  }

  private updateMoths(dt: number) {
    const p = this.player;
    const P = this.power;
    const flutter = this.has("flutter");
    const count = 2 + (this.has("swarm") ? 2 : 0);
    this.mothAngle += 3 * (flutter ? 1.4 : 1) * dt;
    // The circle breathes in and out, so the moths sweep an area instead of a line
    const radius = (flutter ? 40 : 32) * (1 + (flutter ? 0.5 : 0.35) * Math.sin(this.time * 1.5));
    const beam = this.has("beam") && this.T.beam <= 0;
    if (beam) this.T.beam = 1 * this.cd;
    this.moths.length = 0;
    for (let i = 0; i < count; i++) {
      const a = this.mothAngle + (i * Math.PI * 2) / count;
      const x = p.x + Math.cos(a) * radius;
      const y = p.y - 10 + Math.sin(a) * radius * 0.85;
      this.moths.push({ x, y });
      if (beam) {
        const t = this.nearest(x, y, 110);
        if (t) {
          this.bolts.push({ pts: [[x, y], [t.x, t.y - t.r]], t: 0.04, dead: false, beam: true });
          this.hit(t, 9 * P, "moon", "Moonbeam", { dx: t.x - x, dy: t.y - y, kb: 0.4 });
        }
      }
      this.forNear(x, y, (e) => {
        if (e.dead || e.mothT > 0 || e.charmT > 0) return;
        const rs = e.r + 6;
        if ((e.x - x) ** 2 + (e.y - e.r - y) ** 2 > rs * rs) return;
        e.mothT = 0.5;
        this.hit(e, 11 * P, "moon", "Moon Moths", { dx: e.x - p.x, dy: e.y - p.y, kb: 1.4 });
        this.effect("spark", x, y, 1, 0.16);
        if (this.has("dust") && e.dustT <= 0 && e.boss < 0 && !e.dead) {
          e.dustT = 6;
          e.dizzyT = 2;
          const d = Math.random() * Math.PI * 2;
          e.dirX = Math.cos(d);
          e.dirY = Math.sin(d);
        }
      });
    }
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) {
        s.dead = true;
        if (s.kind === "glob") {
          // Splat: a hit on everything it lands on, then a puddle
          const big = this.has("bigbog");
          const r = 22 * (big ? 1.5 : 1);
          this.inCircle(s.x, s.y, r, (e) => {
            e.poisonT = 0;
            this.hit(e, s.damage, "poison", "Bog Bubble", { dx: e.x - s.x, dy: e.y - s.y, kb: 0.6 });
          });
          this.puddle(s.x, s.y, r, big ? 6 : 4, 4 * this.power);
          this.burst(s.x, s.y, "#9ae04a", 8, 60);
        }
        continue;
      }
      if (s.kind === "glob") continue;
      if (Math.random() < dt * 40) {
        const c = s.kind === "flame" ? (Math.random() < 0.5 ? "#ff7a1a" : "#ffe63d") : s.kind === "icicle" ? "#cfefff" : Math.random() < 0.5 ? "#fff2b0" : "#ffffff";
        this.parts.push({ x: s.x, y: s.y, vx: -s.vx * 0.05 + (Math.random() - 0.5) * 10, vy: -s.vy * 0.05 + (Math.random() - 0.5) * 10, life: 0.25, max: 0.25, color: c, size: 1 });
      }
      this.forNear(s.x, s.y, (e) => {
        if (s.dead || e.dead || e.charmT > 0 || s.hit.includes(e)) return;
        const rs = e.r + s.r;
        if ((e.x - s.x) ** 2 + (e.y - e.r * 0.8 - s.y) ** 2 > rs * rs) return;
        s.hit.push(e);
        if (s.kind === "flame") this.hit(e, s.damage, "fire", s.src, { dx: s.vx, dy: s.vy, kb: 0.5, burn: 4 });
        else if (s.kind === "icicle") this.hit(e, s.damage, "frost", s.src, { dx: s.vx, dy: s.vy, kb: 0.5, chill: CFG.chillTime });
        else this.hit(e, s.damage, "moon", s.src, { dx: s.vx, dy: s.vy });
        this.effect("spark", s.x, s.y, 1, 0.16);
        if (s.pierce-- <= 0) s.dead = true;
      });
    }
  }

  private updateRings(dt: number) {
    for (const n of this.rings) {
      n.t += dt;
      const r = n.r * Math.min(1, n.t / RING_TIME);
      this.inCircle(n.x, n.y + 6, r, (e) => {
        if (n.hit.has(e)) return;
        n.hit.add(e);
        this.hit(e, n.damage, n.el, n.src, { dx: e.x - n.x, dy: e.y - n.y, kb: n.kb, chill: n.chill, freeze: n.freeze, stun: n.stun, burn: n.burn });
      });
      if (n.t >= RING_TIME + 0.25) n.dead = true;
    }
  }

  private updatePuddles(dt: number) {
    for (const f of this.puddles) {
      f.t += dt;
      f.tick -= dt;
      if (f.t >= f.dur) {
        f.dead = true;
        continue;
      }
      const tick = f.tick <= 0;
      if (tick) f.tick = 0.5;
      this.forNear(f.x, f.y, (e) => {
        if (e.dead || e.charmT > 0 || ((e.x - f.x) / f.r) ** 2 + ((e.y - f.y) / (f.r * 0.7)) ** 2 > 1) return;
        e.poisonT = 0;
        if (tick) this.hit(e, f.damage, "poison", "Bog Bubble", { kb: 0, noCrit: true });
      }, Math.ceil(f.r / HASH));
    }
  }

  private updatePools(dt: number) {
    const strong = this.has("undertow");
    for (const h of this.pools) {
      h.t += dt;
      const reach = h.r * 1.5;
      this.forNear(h.x, h.y, (e) => {
        if (e.dead || e.charmT > 0) return;
        const dx = h.x - e.x;
        const dy = h.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > reach) return;
        e.wetT = 0.3;
        if (e.boss >= 0 || d < 3) return;
        const pull = (e.kind === "golem" || e.elite ? 0.4 : 1) * (strong ? 170 : 115) * (1.2 - d / reach);
        // Swirl inward
        e.x += ((dx / d) * pull - (dy / d) * pull * 0.35) * dt;
        e.y += ((dy / d) * pull + (dx / d) * pull * 0.35) * dt;
      }, Math.ceil(reach / HASH));
      if (h.t >= h.dur) {
        h.dead = true;
        this.effect("blast", h.x, h.y, h.r / 26, 0.4, "#8fd8ff");
        this.shake = Math.max(this.shake, 2);
        this.sfx("burst");
        const stun = this.has("leviathan") ? 1.5 : 0;
        this.inCircle(h.x, h.y, h.r, (e) => this.hit(e, h.damage, "frost", "Whirlpool", { dx: e.x - h.x, dy: e.y - h.y, kb: 1.6, stun }));
      }
    }
  }

  // ---------- Damage ----------
  private credit(src: string, amount: number) {
    this.dealt.set(src, (this.dealt.get(src) ?? 0) + amount);
  }

  private hit(
    e: Enemy, amount: number, el: El, src: string,
    o: { dx?: number; dy?: number; kb?: number; burn?: number; chill?: number; freeze?: number; stun?: number; noCrit?: boolean } = {},
  ) {
    if (e.dead) return;
    if ((e.chillT > 0 || e.freezeT > 0) && this.has("shatter")) amount *= 1.3;
    if (e.poisonT < 0.8 && this.has("corrode")) amount *= 1.25;
    if (e.wetT > 0 && this.has("deep")) amount *= 1.4;
    const crit = !o.noCrit && this.has("lucky") && Math.random() < 0.2;
    if (crit) amount *= 2;
    this.credit(src, Math.min(amount, Math.max(0, e.hp)));
    e.hp -= amount;
    e.flash = 0.1;
    const tough = e.boss >= 0 ? 0.3 : 1;
    if (o.burn) {
      e.burnT = CFG.burnTime;
      e.burnDps = Math.max(e.burnDps, o.burn * this.power * (this.has("kindle") ? 2 : 1));
    }
    if (o.chill) e.chillT = Math.max(e.chillT, o.chill);
    if (o.freeze) e.freezeT = Math.max(e.freezeT, o.freeze * tough);
    if (o.stun) e.stunT = Math.max(e.stunT, o.stun * tough);
    const dx = o.dx ?? 0;
    const dy = o.dy ?? 0;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const kb = 80 * (o.kb ?? 1) * (e.boss >= 0 ? 0.08 : e.kind === "golem" ? 0.25 : e.elite ? 0.4 : e.kind === "boar" && e.ai === 2 ? 0.2 : 1);
      e.kx += (dx / len) * kb;
      e.ky += (dy / len) * kb;
    }
    if (amount >= 1) {
      this.nums.push({ x: e.x, y: e.y - e.r * 2 - 4, value: Math.round(amount), t: 0, style: crit ? "crit" : e.boss >= 0 ? "big" : el });
      this.sfx("hit");
    }
    if (e.hp <= 0) this.kill(e, el);
  }

  private kill(e: Enemy, el: El) {
    if (e.dead) return;
    e.dead = true;
    const ally = e.charmT > 0;
    if (!ally) this.kills++;
    const P = this.power;
    this.chain++;
    if (this.chain < 12) {
      // Wildfire: burning enemies go up, and take their neighbors with them
      if (e.burnT > 0 && this.has("wildfire")) {
        this.effect("blast", e.x, e.y - e.r, 1.1, 0.3);
        this.inCircle(e.x, e.y, 30, (o) => this.hit(o, 8 * P, "fire", "Wildfire", { dx: o.x - e.x, dy: o.y - e.y, kb: 0.6, burn: 4 }));
      }
      // Overload: lightning kills spark onto neighbors
      if (el === "storm" && this.has("overload")) {
        const seen = new Set([e]);
        for (let i = 0; i < 3; i++) {
          const o = this.nearest(e.x, e.y, 55, seen);
          if (!o) break;
          seen.add(o);
          this.bolts.push({ pts: [[e.x, e.y - e.r], [o.x, o.y - o.r]], t: 0.05, dead: false });
          this.hit(o, 12 * P, "storm", "Overload", { kb: 0.3, stun: this.has("static") ? 0.5 : 0 });
        }
      }
    }
    this.chain--;
    // Plague: the poisoned leave a puddle
    if (e.poisonT < 0.8 && this.has("plague")) this.puddle(e.x, e.y, 15, 2.5, 3 * P);
    this.sfx("pop", e.boss >= 0 || e.elite || e.kind === "golem" ? 0.5 : 1);
    const color = CFG.enemies[e.kind].color;
    if (e.boss >= 0) {
      this.burst(e.x, e.y - 12, color, 50, 150);
      this.effect("poof", e.x, e.y - 14, 2.6, 0.7);
      this.shake = 6;
      this.hitstop = 0.12;
      for (let i = 0; i < 14; i++) this.dropGem(e.x + (Math.random() - 0.5) * 40, e.y + (Math.random() - 0.5) * 40, 3);
      this.drop("feast", e.x, e.y);
      this.events.toast(`${CFG.bosses[e.boss].name} is down!`, "gold");
      this.sfx("bossDown");
      return;
    }
    if (e.elite) {
      this.burst(e.x, e.y - 12, "#ffd640", 30, 120);
      this.effect("poof", e.x, e.y - 12, 1.5, 0.5);
      this.shake = Math.max(this.shake, 3);
      for (let i = 0; i < 5; i++) this.dropGem(e.x + (Math.random() - 0.5) * 24, e.y + (Math.random() - 0.5) * 24, 3);
      this.drop("carrot", e.x, e.y);
    } else {
      this.burst(e.x, e.y - e.r, ally ? "#ff80c0" : color, 9, 80);
      this.effect("poof", e.x, e.y - e.r, e.kind === "skel" || e.kind === "golem" || e.kind === "jelly" ? 1.1 : 0.9, 0.42);
      this.dropGem(e.x, e.y, e.xp);
    }
    if (ally) return;
    // Jellies split into two slimes
    if (e.kind === "jelly")
      for (const side of [-1, 1]) {
        const k = this.spawnEnemy("slime", e.x + side * 6, e.y);
        k.kx = side * 90;
      }
    const pk = CFG.pickups;
    if (this.T.magnet <= 0) {
      this.T.magnet = pk.magnetEvery * (0.8 + Math.random() * 0.4);
      this.drop("magnet", e.x, e.y);
    } else if (Math.random() < (this.player.hp < this.player.maxHp * 0.4 ? pk.carrotChanceHurt : pk.carrotChance)) this.drop("carrot", e.x, e.y);
  }

  private drop(kind: PickupKind, x: number, y: number) {
    this.loot.push({ kind, x, y, magnet: false, sp: 0, dead: false, t: 0 });
  }

  /** Adds stardust; past the cap, new pieces fold into ones far from the player instead. */
  private dropGem(x: number, y: number, value: number) {
    const g = this.gems;
    if (g.length >= CFG.pickups.maxGems) {
      const p = this.player;
      for (let tries = 0; tries < 8; tries++) {
        const o = g[this.mergeI++ % g.length];
        if (!o.magnet && (o.x - p.x) ** 2 + (o.y - p.y) ** 2 > 150 * 150) {
          o.value += value;
          return;
        }
      }
    }
    g.push({ x, y, value, magnet: false, sp: 0, dead: false });
  }

  // ---------- Falling stars and pickups ----------
  private updateStarfalls(dt: number) {
    for (const s of this.starfalls) {
      s.t += dt;
      if (s.t < s.dur) continue;
      s.dead = true;
      this.drop("star", s.x, s.y);
      this.effect("ring", s.x, s.y - 4, 2.2, 0.6, "#fff2b0");
      this.effect("blast", s.x, s.y - 4, 1.4, 0.4, "#fff2b0");
      this.burst(s.x, s.y - 4, "#fff2b0", 24, 130);
      this.shake = Math.max(this.shake, 3);
      // The landing clears a little room
      this.inCircle(s.x, s.y, 40, (e) => this.hit(e, 20 * this.power, "none", "Starburst", { dx: e.x - s.x, dy: e.y - s.y, kb: 2 }));
      this.sfx("starLand");
    }
  }

  private pull(o: { x: number; y: number; magnet: boolean; sp: number }, dt: number, reach: number) {
    const p = this.player;
    const dx = p.x - o.x;
    const dy = p.y - 10 - o.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!o.magnet && d < reach) o.magnet = true;
    if (!o.magnet) return false;
    o.sp = Math.max(o.sp + 500 * dt, 60);
    const step = Math.min(d, o.sp * dt);
    o.x += (dx / d) * step;
    o.y += (dy / d) * step;
    return d < 7;
  }

  private updatePickups(dt: number) {
    const p = this.player;
    const reach = CFG.player.pickupRadius * (this.has("ears") ? 2 : 1);
    for (const g of this.gems)
      if (this.pull(g, dt, reach)) {
        g.dead = true;
        this.gainXp(g.value);
        this.sfx("gem");
      }
    for (const l of this.loot) {
      l.t += dt;
      // Fallen stars wait for you to walk right up to them
      if (!this.pull(l, dt, l.kind === "star" ? 20 : reach)) continue;
      l.dead = true;
      if (l.kind === "star") {
        this.pendingStars++;
        this.events.starTouched();
      } else if (l.kind === "magnet") {
        for (const g of this.gems) {
          g.magnet = true;
          g.sp = Math.max(g.sp, 140);
        }
        this.effect("ring", p.x, p.y - 12, 4, 0.6);
        this.sfx("magnet");
      } else {
        this.heal(l.kind === "feast" ? p.maxHp : CFG.pickups.carrotHeal);
        this.sfx("heal");
      }
    }
  }

  private gainXp(v: number) {
    this.xp += v;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      if (this.sky.earn()) {
        this.level++;
        const p = this.player;
        this.effect("ring", p.x, p.y - 12, 1.6, 0.5);
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          this.parts.push({ x: p.x, y: p.y - 12, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.45, max: 0.45, color: i % 2 ? "#fff2b0" : "#ffffff", size: 2 });
        }
        this.sfx("level");
        this.events.levelUp();
      } else {
        // Every star point is earned: spare stardust mends you instead
        this.heal(CFG.xp.overflowHeal);
      }
    }
  }

  // ---------- Effects ----------
  effect(kind: Effect["kind"], x: number, y: number, scale: number, dur: number, color?: string) {
    this.fx.push({ kind, x, y, t: 0, dur, scale, color });
  }

  burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const life = 0.25 + Math.random() * 0.25;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: Math.random() < 0.3 ? 2 : 1 });
    }
  }

  private updateFx(dt: number) {
    let k = 0;
    for (const f of this.fx) {
      f.t += dt;
      if (f.t < f.dur) this.fx[k++] = f;
    }
    this.fx.length = k;
    for (const b of this.bolts) {
      b.t += dt;
      if (b.t > 0.2) b.dead = true;
    }
    const drag = Math.exp(-5 * dt);
    k = 0;
    for (const pt of this.parts) {
      pt.life -= dt;
      if (pt.life <= 0) continue;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt - (pt.rise ?? 0) * dt;
      pt.vx *= drag;
      pt.vy *= drag;
      this.parts[k++] = pt;
    }
    this.parts.length = k;
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
    k = 0;
    for (const n of this.nums) {
      n.t += dt;
      if (n.t < 0.7) this.nums[k++] = n;
    }
    this.nums.length = k;
    if (this.nums.length > 90) this.nums.splice(0, this.nums.length - 90);
  }
}

/** Names for the end screen ("Bonked by a ..."). */
const NAMES: Record<EnemyKind, string> = {
  slime: "slime", bat: "bat", skel: "skeleton", ghost: "ghost", shroom: "mushroom", jelly: "jelly", boar: "boar", golem: "golem", king: "King Slime",
};
