import { Book } from "./book";
import { CFG, EnemyKind } from "./config";
import { ELEMENTS, N, ScrollId, Stats } from "./content";

export type Sfx =
  | "shoot" | "ring" | "ice" | "zap" | "plop" | "meteor" | "hit" | "pop" | "gem" | "level" | "hurt" | "pickup" | "magnet"
  | "chest" | "danger" | "wave" | "spit" | "charge" | "heal" | "charm" | "dizzy" | "totem" | "ward" | "unseal"
  | "stop" | "dice" | "hole" | "dig" | "rewind";

type El = "fire" | "frost" | "storm" | "toxic" | "moon" | "none";

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
  burnGreen: boolean;
  chillT: number;
  freezeT: number;
  stunT: number;
  /** Seconds since this enemy last stood in poison. */
  poisonT: number;
  dizzyT: number;
  /** While above zero this enemy fights for you (Heart Charm, ghost friends). */
  charmT: number;
  /** Share of a victim's max health a friendly bump deals, and who gets the credit. */
  allyHit: number;
  allySrc: string;
  /** Hit cooldowns. */
  bumpT: number;
  sunT: number;
  moonT: number;
  zapT: number;
  stormHit: boolean;
  /** Cooldowns for Deep Freeze and walking through trails. */
  freezeCd: number;
  trailT: number;
  /** Golden elites are much tougher and drop a treasure chest. */
  elite: boolean;
  /** Behavior state for boars (0 chase, 1 wind up, 2 charge, 3 rest) and shooters. */
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
  kind: "fire" | "orb" | "snow" | "carrot" | "spore" | "shard" | "glob";
  src: string;
  el: El;
  green: boolean;
  homing: boolean;
  bounces: number;
}

export type Theme = "fire" | "green" | "ice" | "toxic" | "steam" | "dirt" | "void";
/** An expanding ring. */
export interface Nova { x: number; y: number; t: number; r: number; damage: number; src: string; el: El; theme: Theme; chill: number; stun: number; hit: Set<Enemy>; dead: boolean; }
/** A patch of ground that hurts: fire trails, poison puddles, icy craters. */
export interface Flames { x: number; y: number; r: number; t: number; dur: number; tick: number; damage: number; theme: Theme; src: string; bloom: boolean; dead: boolean; }
export interface Meteor { x: number; y: number; t: number; fall: number; r: number; damage: number; kind: "rock" | "hail" | "giant"; dead: boolean; }
export interface Totem { kind: "fire" | "snow"; x: number; y: number; t: number; dur: number; castT: number; zapT: number; stompT: number; hp: number; maxHp: number; dead: boolean; }
/** A path of fire or poison left behind as you walk. */
export interface Trail { theme: Theme; src: string; pts: { x: number; y: number; t: number }[]; }
export interface BlackHole { x: number; y: number; t: number; dur: number; r: number; damage: number; tick: number; dead: boolean; }
export interface Bolt { pts: [number, number][]; t: number; dead: boolean; }
/** An enemy projectile (mushroom spores). */
export interface Spit { x: number; y: number; vx: number; vy: number; life: number; damage: number; dead: boolean; }
export interface Gem { x: number; y: number; value: number; magnet: boolean; sp: number; dead: boolean; }
export type PickupKind = "scroll" | "magnet" | "carrot" | "chest";
export interface Loot { kind: PickupKind; x: number; y: number; magnet: boolean; sp: number; dead: boolean; t: number; }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; rise?: number; }
export interface Effect { kind: "poof" | "spark" | "ring" | "heal" | "blast" | "dust" | "heart" | "flash"; x: number; y: number; t: number; dur: number; scale: number; color?: string; }
export interface DamageNumber { x: number; y: number; value: number; t: number; style: "hit" | "big" | "burn" | "green" | "heal" | "max" | "ice" | "zap" | "toxic"; }
export type Weather = "" | "blizzard" | "thunder" | "heat";

export interface GameEvents {
  levelUp(): void;
  scrollFound(): void;
  gameOver(): void;
  toast(msg: string, kind?: "good" | "warn" | "gold" | "danger"): void;
  /** You survived the full run; the game waits until you choose to stop or keep going. */
  victory?(): void;
  /** A treasure chest gave you a skill point. */
  treasure?(): void;
  sfx?(name: Sfx, pitch?: number): void;
}

const HASH = 32;
const hk = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
const NOVA_TIME = 0.35;

function compact<T extends { dead: boolean }>(arr: T[]) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
  arr.length = j;
}

/** Timers for everything that fires on its own schedule. */
const TIMERS = {
  cast: 0.4, ring: 1, trail: 0, meteor: 2, totem: 1, frost: 1.5, pals: 3, zap: 1, call: 1, toxic: 1.5, hail: 2, eclipse: 20,
  lunar: 22, aurora: 20, weather: 6, carrot: 1, hole: 12, gambler: 15, stopwatch: 20, blackhole: 4, midnight: 40,
  cataclysm: 30, paradox: 25, moondrip: 2, acid: 0, rewind: 0, history: 0, jackpot: 0,
  shard: 0.4, charm: 4, dust: 3, mend: 8, bubble: 3, beam: 3, constel: 0, rod: 12, miasma: 0, trailTox: 0,
};
type TimerId = keyof typeof TIMERS;

export class Game {
  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  over = false;
  won = false;
  /** True once you chose to keep playing past the end of the run. */
  endless = false;
  /** Waiting for the player to choose after surviving the run. */
  victoryPending = false;
  /** Index into CFG.danger for the current danger tier. */
  dangerIdx = 0;
  /** What hit you last (shown when you fall). */
  lastHitBy = "";
  hitstop = 0;
  shake = 0;
  viewW = 240;
  viewH = 400;
  input = { x: 0, y: 0 };

  player = {
    x: 0, y: 0, vx: 0, vy: 0, hp: CFG.player.maxHp, maxHp: CFG.player.maxHp,
    inv: 0, moving: false, face: 1, walkT: 0, ward: 0,
    /** Seconds left underground (Rabbit Hole). */
    under: 0,
    revived: false,
  };
  book: Book;
  trails: Trail[] = [];
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  novas: Nova[] = [];
  flames: Flames[] = [];
  meteors: Meteor[] = [];
  totems: Totem[] = [];
  holes: BlackHole[] = [];
  bolts: Bolt[] = [];
  gems: Gem[] = [];
  loot: Loot[] = [];
  spits: Spit[] = [];
  /** Damage dealt by each source this run. */
  dealt = new Map<string, number>();
  parts: Particle[] = [];
  fx: Effect[] = [];
  nums: DamageNumber[] = [];
  /** Orbiters and reflections, refreshed every step for drawing. */
  suns: { x: number; y: number }[] = [];
  moons: { x: number; y: number; big: boolean }[] = [];
  echoes: { x: number; y: number }[] = [];
  /** Screen-wide states. */
  timeStop = 0;
  dark = 0;
  midnight = 0;
  weather: Weather = "";
  weatherT = 0;
  fullMoon = false;
  /** Scrolls waiting to be offered after a pickup. */
  pendingScrolls = 0;

  private spawnAcc = 0;
  private nextKing = CFG.spawn.kingFirst;
  private hash = new Map<number, Enemy[]>();
  private pool: Enemy[][] = [];
  private nextWave = 0;
  private waveCycle = 0;
  private magnetT = CFG.pickups.magnetEvery * 0.6;
  private mergeI = 0;
  private casts = 0;
  private sunAngle = 0;
  private moonAngle = 0;
  private novaT = 6;
  private T: Record<TimerId, number> = { ...TIMERS };
  private zaps = 0;
  private extraMoons = 0;
  private prevWard = 0;
  private hpBonus = 0;
  private history: { x: number; y: number; hp: number }[] = [];
  /** What is dealing damage right now, for the damage summary. */
  private src = "Fireball";
  private el: El = "fire";

  constructor(private events: GameEvents, start: ScrollId = "fire") {
    this.book = new Book(start);
  }

  get xpNeeded() {
    const l = this.level - 1;
    return Math.round(CFG.xp.base + CFG.xp.perLevel * l + CFG.xp.perLevel2 * l * l);
  }

  get stats(): Stats {
    return this.book.stats;
  }
  has(id: string) {
    return this.book.has(id);
  }
  /** On-screen rectangle check, for screen-wide effects. */
  private onScreen(e: Enemy) {
    return Math.abs(e.x - this.player.x) < this.viewW / 2 + 10 && Math.abs(e.y - this.player.y) < this.viewH / 2 + 10;
  }

  get moveMul() {
    return Math.max(0.5, 1 + this.stats.move) * (this.fullMoon ? 1.2 : 1);
  }
  get pickupMul() {
    return 1 + this.stats.pickup;
  }
  get luck() {
    return this.has("clover") ? 1 : 0;
  }
  get dropMul() {
    return this.has("clover") ? 1.6 : 1;
  }

  /** Real die size: Loaded Dice adds two sides. */
  die(sides: number) {
    return sides + (this.has("loaded") ? 2 : 0);
  }
  /** Rolls a die. Lucky Clover adds one; Patient Flame always rolls the highest. */
  roll(sides: number) {
    const s = this.die(sides);
    if (this.has(N.patient)) return s;
    return Math.min(s, 1 + Math.floor(Math.random() * s) + this.luck);
  }
  /** Shows a max roll, and Jackpot pays out. */
  private maxRoll(sides: number) {
    const p = this.player;
    this.nums.push({ x: p.x, y: p.y - 44, value: this.die(sides), t: 0, style: "max" });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.parts.push({ x: p.x, y: p.y - 30, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.4, max: 0.4, color: "#ffe46a", size: 2 });
    }
    if (this.has("jackpot") && this.T.jackpot <= 0) {
      this.T.jackpot = 3;
      this.sfx("dice");
      for (let i = 0; i < 4; i++) {
        this.fireball(p.x, p.y - 14, Math.random() * Math.PI * 2, this.fireballDamage, "Jackpot");
        if (i < 2) this.dropGem(p.x + (Math.random() - 0.5) * 50, p.y + (Math.random() - 0.5) * 50, 1);
      }
    }
  }

  sfx(name: Sfx, pitch?: number) {
    this.events.sfx?.(name, pitch);
  }

  // ---------- Shared spell numbers ----------
  /** Damage multiplier for everything you cast. */
  get power() {
    const elements = ELEMENTS.filter((e) => this.book.scrolls.has(e)).length;
    return (1 + this.stats.dmg) * (1 + CFG.levelDamage * (this.level - 1)) * (this.has(N.inferno) ? 1.6 : 1) *
      (this.fullMoon ? 1.4 : 1) * (this.has("avatar") ? 1 + 0.15 * elements : 1);
  }
  /** Cooldown multiplier. */
  get cd() {
    return 1 / (1 + this.stats.haste) / (this.has("avatar") ? 1.25 : 1);
  }
  get areaMul() {
    return 1 + this.stats.area;
  }
  get burnMul() {
    return (1 + this.stats.burn) * (this.has(N.wildfire) ? 2 : 1) * (this.has(N.ember) ? 3 : 1);
  }
  get burnTime() {
    return CFG.burnTime * (this.has("everburn") ? 2 : 1);
  }
  get green() {
    return this.has("verdant");
  }
  get fireballDamage() {
    return 12 * this.power * (this.has(N.scatter) ? 0.7 : 1) * (this.has(N.heavyOrb) ? 2.5 : 1) * (this.has(N.wildfire) ? 0.75 : 1) * (this.has(N.patient) ? 2 : 1);
  }
  get fireballCooldown() {
    return 0.7 * this.cd * (this.has(N.heavyOrb) ? 1.6 : 1) * (this.has(N.patient) ? 1.4 : 1);
  }
  get ringDamage() { return 10 * this.power; }
  get meteorDamage() { return 30 * this.power * (1 + this.stats.meteor); }
  get sunDamage() { return 8 * this.power * (1 + this.stats.sun) * (this.dark > 0 && this.has("corona") ? 3 : 1); }
  get totemDamage() { return 10 * this.power * (1 + this.stats.totem); }
  get frostDamage() { return 11 * this.power * (1 + this.stats.frost) * (this.has("permafrost") ? 0.6 : 1); }
  get shardDamage() { return this.frostDamage * 1.25; }
  get stormDamage() { return 12 * this.power * (1 + this.stats.storm) * (this.has("rod") ? 1.8 : 1) * (this.has("conductor") ? 0.7 : 1); }
  get toxicDamage() { return 8 * this.power * (1 + this.stats.toxic); }
  get moonDamage() {
    return 12 * this.power * (1 + this.stats.moon) * (this.dark > 0 && this.has("corona") ? 3 : 1) * (this.has("bloodmoon") ? 2 : 1) * (this.has("gravmoon") ? 0.7 : 1);
  }
  get puddleSize() { return 22 * this.areaMul * (this.has("plague") ? 1.6 : 1); }
  get carrotDamage() { return 16 * this.power * (1 + this.stats.carrot); }

  /** Numbers shown at the top of the spellbook, as [label, value] pairs. */
  spellStats(): [string, string][] {
    const n = (v: number) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1));
    const out: [string, string][] = [];
    if (this.has("fireball")) out.push(["Fireball", (this.has(N.ember) ? "0" : n(this.fireballDamage)) + (this.has(N.scatter) ? ` ×1d${this.die(4)}` : "")]);
    if (this.has("shard")) out.push(["Ice Shard", n(this.shardDamage) + (this.has("fan") ? " ×3" : "")]);
    if (this.has("storm")) out.push(["Lightning", n(this.stormDamage) + (this.has("forked") ? ` ×1d${this.die(6)}+1` : " ×4")]);
    if (this.has("toxic")) out.push(["Poison", n(this.toxicDamage) + "/½s" + (this.has("spores") ? ` ×1d${this.die(3)}` : "")]);
    if (this.has("moon")) out.push(["Moons", `${n(this.moonDamage)} ×${3 + (this.has("full") ? 1 : 0)}${this.has("constellation") ? `+1d${this.die(4)}` : ""}`]);
    const burns = this.has(N.ignite) || this.has("suns") || this.has("rot") || this.has("plasma") || this.has("harvest") || this.has("fumes");
    if (burns) out.push(["Burn", `${Math.round(20 * this.burnMul)}%/s`]);
    if (this.has(N.fireRing)) out.push(["Fire Ring", n(this.ringDamage)]);
    if (this.has("frost")) out.push(["Frost Nova", n(this.frostDamage) + (this.has("ripples") ? ` ×1d${this.die(3)}` : "")]);
    if (this.has("meteor")) out.push(["Meteor", n(this.meteorDamage) + (this.has("shower") ? ` ×1d${this.die(3)}` : "")]);
    if (this.has("suns")) out.push(["Suns", `${n(this.sunDamage)} ×${this.has("flare") ? 4 : 2}`]);
    if (this.has("totem")) out.push(["Totem", n(this.totemDamage) + (this.has("twin") ? " ×2" : "")]);
    if (this.has("carrots")) out.push(["Carrots", n(this.carrotDamage)]);
    out.push(["Cast speed", `+${Math.round((1 / this.cd - 1) * 100)}%`]);
    if (this.stats.area) out.push(["Area", `+${Math.round(this.stats.area * 100)}%`]);
    out.push(["Health", String(Math.round(Math.max(20, CFG.player.maxHp + this.stats.hp)))]);
    if (this.moveMul !== 1) out.push(["Speed", `${this.moveMul > 1 ? "+" : ""}${Math.round((this.moveMul - 1) * 100)}%`]);
    return out;
  }

  // ---------- Main step ----------
  step(dt: number) {
    if (this.over || this.victoryPending) return;
    this.shake = Math.max(0, this.shake - 24 * dt);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time += dt;
    if (this.time >= CFG.runLength && !this.won) {
      this.won = true;
      if (this.events.victory) {
        this.victoryPending = true;
        this.events.victory();
      } else {
        this.over = true;
        this.events.gameOver();
      }
      return;
    }
    for (const k in this.T) this.T[k as TimerId] -= dt;
    this.timeStop = Math.max(0, this.timeStop - dt);
    this.dark = Math.max(0, this.dark - dt);
    this.midnight = Math.max(0, this.midnight - dt);
    this.updateDanger();
    this.updatePlayer(dt);
    if (!this.timeStop) this.spawn(dt);
    this.buildHash();
    this.updateEnemies(dt);
    this.updateSpits(dt);
    this.updateSupports();
    this.updateSpells(dt);
    this.updateWorldMagic(dt);
    this.updateShots(dt);
    this.updateNovas(dt);
    this.updateFlames(dt);
    this.updateMeteors(dt);
    this.updateHoles(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    compact(this.enemies);
    compact(this.shots);
    compact(this.novas);
    compact(this.flames);
    compact(this.meteors);
    compact(this.totems);
    compact(this.holes);
    compact(this.bolts);
    compact(this.gems);
    compact(this.loot);
    compact(this.spits);
  }

  /** Ends a run that was won and then paused at the victory screen. */
  endRun() {
    this.victoryPending = false;
    this.over = true;
    this.events.gameOver();
  }

  keepGoing() {
    this.victoryPending = false;
    this.endless = true;
  }

  // ---------- Danger tiers ----------
  private updateDanger() {
    const tiers = CFG.danger;
    while (this.dangerIdx + 1 < tiers.length && this.time >= tiers[this.dangerIdx + 1].at) {
      this.dangerIdx++;
      const t = tiers[this.dangerIdx];
      const prev = tiers[this.dangerIdx - 1];
      if (t.note) this.events.toast(t.name !== prev.name ? `Danger: ${t.name}! ${t.note}` : t.note, "danger");
      if (t.name !== prev.name) this.sfx("danger");
    }
  }

  get danger() {
    return CFG.danger[this.dangerIdx];
  }

  // ---------- Player ----------
  private updatePlayer(dt: number) {
    const p = this.player;
    const c = CFG.player;
    // Health nodes raise max health and heal by the same amount
    const bonus = this.stats.hp;
    if (bonus !== this.hpBonus) {
      p.maxHp = Math.max(20, c.maxHp + bonus);
      if (bonus > this.hpBonus) p.hp += bonus - this.hpBonus;
      p.hp = Math.min(p.hp, p.maxHp);
      this.hpBonus = bonus;
    }
    const speed = c.speed * this.moveMul;
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
    p.ward = Math.max(0, p.ward - dt);
    p.hp = Math.min(p.maxHp, p.hp + (c.regen + this.stats.regen) * dt);
    // Rabbit Hole: pop back up with a stunning thump
    if (p.under > 0) {
      p.under -= dt;
      if (p.under <= 0) {
        this.nova(p.x, p.y - 4, 50 * this.areaMul, this.carrotDamage * 0.6, "Rabbit Hole", "none", "dirt", { stun: 1.2 });
        this.shake = 2;
        this.sfx("dig", 1.4);
      }
    }
    // Remember the last few seconds for Rewind
    if (this.has("rewind") && this.T.history <= 0) {
      this.T.history = 0.25;
      this.history.push({ x: p.x, y: p.y, hp: p.hp });
      if (this.history.length > 12) this.history.shift();
    }
  }

  private get safe() {
    const p = this.player;
    return p.inv > 0 || p.ward > 0 || p.under > 0 || this.over;
  }

  private hurt(amount: number, by = "") {
    const p = this.player;
    this.lastHitBy = by;
    p.hp -= amount * (this.has(N.inferno) ? 1.3 : 1) * (this.has("acidblood") ? 1.15 : 1);
    if (this.has("acidblood")) this.puddle(p.x, p.y, 50 * this.areaMul, 4, this.toxicDamage * 1.5, "Acid Blood");
    p.inv = CFG.player.iframes;
    this.shake = 3;
    this.sfx("hurt");
    this.hitstop = 0.05;
    this.burst(p.x, p.y - 12, "#ff3d4a", 10, 70);
    if (p.hp > 0) return;
    if (this.has("rewind") && this.T.rewind <= 0 && this.history.length) {
      // Rewind: back to where you were 3 seconds ago
      const h = this.history[0];
      this.T.rewind = 90;
      this.effect("flash", 0, 0, 1, 0.5, "#e8d8a0");
      p.x = h.x;
      p.y = h.y;
      p.hp = Math.max(h.hp, p.maxHp * 0.3);
      p.inv = 1.5;
      this.history.length = 0;
      this.sfx("rewind");
      this.events.toast("Rewind! You get another try.", "gold");
      return;
    }
    if (this.has("secondwind") && !p.revived) {
      p.revived = true;
      p.hp = p.maxHp / 2;
      p.inv = 2;
      this.effect("ring", p.x, p.y - 12, 3, 0.7);
      this.events.toast("Second Wind! You got back up.", "gold");
      return;
    }
    p.hp = 0;
    this.over = true;
    this.effect("poof", p.x, p.y - 12, 1.6, 0.6);
    this.events.gameOver();
  }

  // ---------- Support magic ----------
  private updateSupports() {
    const p = this.player;
    const T = this.T;
    if (this.has("dust") && T.dust <= 0) {
      const t = this.nearest(p.x, p.y, 140);
      if (t) {
        T.dust = this.has("spin") ? 5 : 8;
        this.dust(t.x, t.y, 55 * this.areaMul, this.has("spin") ? 4 : 3);
      } else T.dust = 0.5;
    }
    if (this.has("charm") && T.charm <= 0) {
      T.charm = 12;
      for (let i = 0; i < (this.has("twohearts") ? 2 : 1); i++) {
        let best: Enemy | null = null;
        for (const e of this.enemies)
          if (!e.dead && e.kind !== "king" && !e.elite && e.charmT <= 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 130 * 130 && (!best || e.hp > best.hp)) best = e;
        if (!best) break;
        this.befriend(best, 8, this.has("crush") ? 0.18 : 0.06, "Heart Charm");
        this.effect("heart", best.x, best.y - best.r * 2, 1, 0.8);
        this.sfx("charm");
      }
    }
    if (this.has("mend") && T.mend <= 0) {
      T.mend = 25;
      if (p.hp < p.maxHp) this.heal(p.maxHp * 0.12);
      else T.mend = 1;
    }
    if (this.has("bubble") && T.bubble <= 0) {
      T.bubble = this.has("thick") ? 16 : 20;
      p.ward = this.has("thick") ? 5 : 3;
      this.effect("ring", p.x, p.y - 12, 1.2, 0.4);
      this.sfx("ward");
    }
    // Pop! when a bubble ends
    if (this.prevWard > 0 && p.ward <= 0 && this.has("pop")) {
      this.nova(p.x, p.y - 8, 60 * this.areaMul, 20 * this.power, "Pop!", "none", "steam", {});
      this.sfx("ring", 1.6);
    }
    this.prevWard = p.ward;
  }

  private heal(amount: number) {
    const p = this.player;
    const v = Math.round(Math.min(p.maxHp - p.hp, amount * (1 + this.stats.heal)));
    if (v <= 0) return;
    p.hp += v;
    this.nums.push({ x: p.x, y: p.y - 40, value: v, t: 0, style: "heal" });
    this.effect("heal", p.x, p.y - 12, 1, 0.8);
    this.sfx("heal");
    for (let i = 0; i < 14; i++)
      this.parts.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y - Math.random() * 26, vx: 0, vy: 0, life: 0.8, max: 0.8, color: i % 2 ? "#fff2b0" : "#ffffff", size: 2, rise: 30 });
  }

  /** A puff of dizzy dust. */
  private dust(x: number, y: number, r: number, dur: number) {
    this.effect("dust", x, y - 6, r / 50, 0.7);
    this.forNear(x, y, (e) => {
      if (!e.dead && e.kind !== "king" && e.charmT <= 0 && (e.x - x) ** 2 + (e.y - y) ** 2 < r * r) this.dizzy(e, dur);
    }, Math.ceil(r / HASH));
    this.sfx("dizzy");
  }
  private dizzy(e: Enemy, dur: number) {
    e.dizzyT = Math.max(e.dizzyT, dur);
    const a = Math.random() * Math.PI * 2;
    e.dirX = Math.cos(a);
    e.dirY = Math.sin(a);
  }

  /** Makes an enemy fight for you for a while. */
  private befriend(e: Enemy, dur: number, hit: number, src: string) {
    e.charmT = dur;
    e.dizzyT = 0;
    e.allyHit = hit;
    e.allySrc = src;
  }

  // ---------- Spawning ----------
  private spawn(dt: number) {
    const s = CFG.spawn;
    const m = this.time / 60;
    // In overtime the cap keeps rising
    const cap = s.maxRate * (this.time > CFG.runLength ? 1 + (m - CFG.runLength / 60) * 0.12 : 1);
    const rate = Math.min(cap, s.startRate + s.ratePerMin * m + s.ratePerMin2 * m * m);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length < s.maxEnemies) {
        const e = this.spawnEnemy(this.pickKind());
        const eliteP = this.time < s.elitesAfter ? 0 : s.eliteChance + s.eliteChancePerMin * (m - s.elitesAfter / 60);
        if (Math.random() < eliteP) this.makeElite(e);
      }
    }
    if (this.time >= this.nextKing) {
      this.nextKing += s.kingEvery;
      this.spawnEnemy("king");
      this.events.toast("A King Slime appeared! It carries a scroll.", "gold");
    }
    this.updateWaves();
  }

  private updateWaves() {
    const list = CFG.waves;
    const w = list[this.nextWave];
    const at = w.at + this.waveCycle * CFG.waveEvery * list.length;
    if (this.time < at) return;
    this.nextWave++;
    if (this.nextWave >= list.length) {
      this.nextWave = 0;
      this.waveCycle++;
    }
    const count = Math.round(w.count * (1 + 0.25 * this.waveCycle));
    const r = Math.hypot(this.viewW, this.viewH) / 2 + 12;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.spawnEnemy(w.kind, this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r);
    }
    this.events.toast(w.msg, "danger");
    this.sfx("wave");
  }

  private pickKind(): EnemyKind {
    const weights = this.danger.weights;
    let total = 0;
    for (const k in weights) total += weights[k as EnemyKind]!;
    let r = Math.random() * total;
    for (const k in weights) if ((r -= weights[k as EnemyKind]!) < 0) return k as EnemyKind;
    return "slime";
  }

  private ringPoint() {
    const a = Math.random() * Math.PI * 2;
    const d = Math.hypot(this.viewW, this.viewH) / 2 + 16;
    return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
  }

  spawnEnemy(kind: EnemyKind, x?: number, y?: number): Enemy {
    const t = CFG.enemies[kind];
    const min = this.time / 60;
    // Health grows every minute, and faster still in the late game
    const hp = t.hp * CFG.spawn.hpGrowth ** min * CFG.spawn.lateGrowth ** Math.max(0, min - CFG.spawn.lateAfter) * (kind === "king" ? 1 + min * 0.5 : 1);
    if (x === undefined || y === undefined) ({ x, y } = this.ringPoint());
    const e: Enemy = {
      kind, x, y, kx: 0, ky: 0, hp, maxHp: hp, r: t.radius, speed: t.speed * (0.9 + Math.random() * 0.2),
      damage: t.damage * (1 + CFG.spawn.damagePerMin * min), xp: t.xp, flash: 0, phase: Math.random() * 10, dead: false,
      burnT: 0, burnDps: 0, burnShown: 0, burnGreen: false, chillT: 0, freezeT: 0, stunT: 0, poisonT: 9, dizzyT: 0,
      charmT: 0, allyHit: 0, allySrc: "", bumpT: 0, sunT: 0, moonT: 0, zapT: 0, stormHit: false, freezeCd: 0, trailT: 0,
      elite: false, ai: 0, aiT: 1 + Math.random() * 2, dirX: 0, dirY: 0,
    };
    this.enemies.push(e);
    return e;
  }

  private makeElite(e: Enemy) {
    e.elite = true;
    e.hp = e.maxHp = e.maxHp * CFG.spawn.eliteHp;
    e.damage *= 1.4;
    e.speed *= 1.1;
    e.xp *= 5;
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

  private updateEnemies(dt: number) {
    const p = this.player;
    const decay = Math.exp(-9 * dt);
    const far = Math.hypot(this.viewW, this.viewH) * 0.75 + 60;
    const slowAura = this.has("slow");
    const were = this.has("were") && this.fullMoon;
    const lunacy = this.has("lunacy") && this.fullMoon;
    const snowmen = this.totems.filter((t) => t.kind === "snow");
    for (const e of this.enemies) {
      if (e.dead) continue;
      let tx = p.x;
      let ty = p.y;
      // Snowmen pull enemies' attention
      let pal: Totem | null = null;
      for (const s of snowmen)
        if ((s.x - e.x) ** 2 + (s.y - e.y) ** 2 < 70 * 70) {
          pal = s;
          tx = s.x;
          ty = s.y;
          break;
        }
      let dx = tx - e.x;
      let dy = ty - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const dp = pal ? Math.hypot(p.x - e.x, p.y - e.y) : d;
      dx /= d;
      dy /= d;
      let mx = dx;
      let my = dy;
      let sp = e.speed;
      const frozen = this.timeStop > 0 || e.freezeT > 0 || e.stunT > 0;
      e.poisonT += dt;
      e.bumpT -= dt;
      e.sunT -= dt;
      e.moonT -= dt;
      e.zapT -= dt;
      e.freezeCd -= dt;
      e.trailT -= dt;
      e.flash = Math.max(0, e.flash - dt);
      if (!frozen) {
        e.aiT -= dt;
        e.chillT = Math.max(0, e.chillT - dt);
      }
      e.freezeT = Math.max(0, e.freezeT - dt);
      e.stunT = Math.max(0, e.stunT - dt);
      if (lunacy && e.poisonT < 0.6 && e.charmT <= 0) this.dizzy(e, 1);
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
          sp = Math.max(e.speed, 40) * 1.3;
        } else sp = 0;
        if (Math.random() < dt * 4) this.parts.push({ x: e.x, y: e.y - e.r * 2, vx: 0, vy: 0, life: 0.6, max: 0.6, color: e.allySrc === "Heart Charm" ? "#ff80c0" : "#c8f0ff", size: 2, rise: 20 });
        if (e.charmT <= 0) {
          if (this.has("haunt") && e.allySrc === "Ghost friends") this.dust(e.x, e.y, 40, 2);
          if (this.has("lovebomb") && e.allySrc === "Heart Charm") {
            this.nova(e.x, e.y - 6, 50 * this.areaMul, 25 * this.power, "Love Bomb", "none", "steam", {});
            for (let i = 0; i < 6; i++) this.effect("heart", e.x + (Math.random() - 0.5) * 30, e.y - 10 - Math.random() * 20, 1, 0.8);
            this.heal(3);
          }
          e.xp = e.allySrc === "Heart Charm" ? e.xp : 0;
          this.kill(e);
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
      } else if (e.kind === "ghost") {
        // Weaves side to side as it comes
        const w = Math.sin(this.time * 3 + e.phase) * 0.8;
        mx = dx - dy * w;
        my = dy + dx * w;
      } else if (e.kind === "shroom" && !pal) {
        // Hangs back at spitting range and lobs spores
        const want = d > 96 ? 1 : d < 70 ? -0.8 : 0;
        const side = Math.sin(e.phase) > 0 ? 0.4 : -0.4;
        mx = dx * want - dy * side;
        my = dy * want + dx * side;
        if (e.aiT <= 0 && d < 160 && !frozen) {
          e.aiT = 2.6 + Math.random() * 1.2;
          const a = Math.atan2(p.y - 10 - (e.y - 8), p.x - e.x);
          this.spits.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * 78, vy: Math.sin(a) * 78, life: 3, damage: e.damage, dead: false });
          e.flash = 0.06;
          this.sfx("spit");
        }
      } else if (e.kind === "boar") {
        if (e.ai === 0 && e.aiT <= 0 && d < 125) {
          e.ai = 1;
          e.aiT = 0.7;
          this.sfx("charge");
        } else if (e.ai === 1) {
          sp = 0;
          e.dirX = dx;
          e.dirY = dy;
          if (e.aiT <= 0) {
            e.ai = 2;
            e.aiT = 0.6;
          }
        } else if (e.ai === 2) {
          mx = e.dirX;
          my = e.dirY;
          sp = 250;
          if (e.aiT <= 0) {
            e.ai = 3;
            e.aiT = 0.8;
          }
        } else if (e.ai === 3) {
          sp *= 0.3;
          if (e.aiT <= 0) {
            e.ai = 0;
            e.aiT = 1.6 + Math.random();
          }
        }
      }
      let slow = frozen ? 0 : e.chillT > 0 ? 1 - CFG.chillSlow : 1;
      if (e.charmT <= 0) {
        if (slowAura && dp < 70) slow *= 0.7;
        if (this.midnight > 0) slow *= 0.5;
        if (e.poisonT < 0.6 && this.has("bog")) slow *= 0.6;
      }
      e.x += (mx * sp * slow + (this.timeStop ? 0 : e.kx)) * dt;
      e.y += (my * sp * slow + (this.timeStop ? 0 : e.ky)) * dt;
      e.kx *= decay;
      e.ky *= decay;
      if (e.burnT > 0) {
        e.burnT -= dt;
        const dmg = Math.min(e.hp, e.burnDps * dt);
        e.hp -= dmg;
        e.burnShown += dmg;
        if (Math.random() < dt * 12)
          this.parts.push({ x: e.x + (Math.random() - 0.5) * e.r * 1.4, y: e.y - Math.random() * e.r * 1.6, vx: 0, vy: 0, life: 0.4, max: 0.4, color: e.burnGreen ? (Math.random() < 0.5 ? "#a8f060" : "#3fae3a") : Math.random() < 0.5 ? "#ffa424" : "#f05a1a", size: 1, rise: 24 });
        this.credit("Burning", dmg);
        if (e.burnShown >= 4 || (e.burnT <= 0 && e.burnShown >= 1)) {
          this.nums.push({ x: e.x + 4, y: e.y - e.r * 2, value: Math.round(e.burnShown), t: 0, style: e.burnGreen ? "green" : "burn" });
          e.burnShown = 0;
        }
        if (e.hp <= 0) {
          this.kill(e);
          continue;
        }
      }
      const friendly = e.charmT > 0;
      const bumping = friendly || e.dizzyT > 0;
      if (e.kind !== "ghost" || bumping) this.forNear(e.x, e.y, (o) => {
        if (o === e || o.dead || (o.kind === "ghost" && !bumping)) return;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const rs = e.r + o.r;
        const dd = ox * ox + oy * oy;
        if (dd >= rs * rs || dd === 0) return;
        // Friends and dizzy enemies hurt whatever they bump into
        if (bumping && o.bumpT <= 0 && o.charmT <= 0) {
          o.bumpT = 0.5;
          this.src = friendly ? e.allySrc : "Dizzy Dust";
          this.el = "none";
          const hit = friendly ? o.maxHp * e.allyHit * (e.allySrc === "Ghost friends" ? 1 + this.stats.ghost : 1) + e.damage : (o.maxHp * 0.05 + 2) * (this.has("bonkparty") ? 3 : 1);
          this.damage(o, hit, -ox, -oy, { kb: 0.6 });
        }
        const dist = Math.sqrt(dd);
        const push = ((rs - dist) / dist) * (o.kind === "king" || o.kind === "golem" ? 0.5 : e.kind === "golem" ? 0.1 : 0.25);
        e.x += ox * push;
        e.y += oy * push;
      });
      // Enemies chew on snowmen they reach
      if (pal && !friendly && !frozen && e.bumpT <= 0 && d < e.r + 8) {
        e.bumpT = 0.5;
        pal.hp -= e.damage;
      }
      if (dp > far && e.kind !== "king" && !e.elite && !friendly) {
        const pt = this.ringPoint();
        e.x = pt.x;
        e.y = pt.y;
      }
      if (dp < e.r + CFG.player.radius && !bumping && !frozen && !this.over) {
        if (were) {
          if (e.bumpT <= 0) {
            e.bumpT = 0.5;
            this.src = "Werebunny";
            this.el = "moon";
            this.damage(e, this.fireballDamage * 5, e.x - p.x, e.y - p.y, { kb: 2.5 });
          }
        } else if (!this.safe) this.hurt(e.damage, e.elite ? "elite " + e.kind : e.kind);
      }
    }
  }

  private updateSpits(dt: number) {
    if (this.timeStop) return;
    const p = this.player;
    for (const s of this.spits) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) s.dead = true;
      else if ((s.x - p.x) ** 2 + (s.y - (p.y - 10)) ** 2 < 8 * 8 && p.under <= 0) {
        s.dead = true;
        if (this.has("reflect") && Math.random() < 0.5) {
          this.shots.push({ x: s.x, y: s.y, vx: -s.vx * 2, vy: -s.vy * 2, life: 1.5, damage: this.fireballDamage * 3, r: 4, pierce: 2, hit: [], dead: false, kind: "spore", src: "Reflect", el: "none", green: false, homing: true, bounces: 0 });
          this.effect("ring", p.x, p.y - 12, 0.6, 0.25);
          continue;
        }
        this.burst(s.x, s.y, "#c8f080", 6, 50);
        if (!this.safe) this.hurt(s.damage, "spore");
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

  private randomEnemy(x: number, y: number, range: number): Enemy | null {
    const near: Enemy[] = [];
    for (const e of this.enemies) if (!e.dead && e.charmT <= 0 && (e.x - x) ** 2 + (e.y - y) ** 2 < range * range) near.push(e);
    return near.length ? near[Math.floor(Math.random() * near.length)] : null;
  }

  /** The enemy with the most neighbors, from a sample. */
  private crowd(range: number): Enemy | null {
    const p = this.player;
    let best: Enemy | null = null;
    let bestN = -1;
    for (let i = 0; i < 24; i++) {
      const e = this.randomEnemy(p.x, p.y, range);
      if (!e) return null;
      let n = 0;
      this.forNear(e.x, e.y, (o) => {
        if (!o.dead && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 50 * 50) n++;
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
    // Spells leave from the crescent moon on the staff
    const ox = p.x + 9 * p.face;
    const oy = p.y - 24;

    // Reflections stand around you and copy your fireballs
    const mirrors = this.has("echo") ? (this.has("hall") ? 3 : 1) : 0;
    this.echoes.length = 0;
    for (let i = 0; i < mirrors; i++) {
      const a = this.time * 0.7 + (i * Math.PI * 2) / mirrors + Math.PI;
      this.echoes.push({ x: p.x + Math.cos(a) * 26, y: p.y + Math.sin(a) * 16 });
    }

    // Fireball
    if (this.has("fireball") && T.cast <= 0) {
      const target = this.nearest(ox, oy, CFG.fireball.range);
      if (target) {
        this.casts++;
        let n = 1;
        if (this.has(N.scatter)) {
          n = this.roll(4);
          if (n === this.die(4)) this.maxRoll(4);
        }
        const dmg = this.has(N.ember) ? 0.01 : this.fireballDamage;
        const volley = (x: number, y: number, mul: number, src: string) => {
          const t = x === ox ? target : this.nearest(x, y, CFG.fireball.range) ?? target;
          const aim = Math.atan2(t.y - t.r - y, t.x - x);
          for (let i = 0; i < n; i++) this.fireball(x, y, aim - ((n - 1) * 0.24) / 2 + i * 0.24, dmg * mul, src);
          return aim;
        };
        const aim = volley(ox, oy, 1, "Fireball");
        this.echoes.forEach((e, i) => volley(e.x, e.y - 20, i === 0 ? 0.5 : 0.35, "Reflections"));
        if (this.has(N.firestorm) && this.casts % 4 === 0)
          for (let i = 0; i < 8; i++) this.fireball(ox, oy, (i / 8) * Math.PI * 2, dmg, "Fireball");
        this.burst(ox + Math.cos(aim) * 6, oy + Math.sin(aim) * 6, this.green ? "#c8f080" : "#ffe46a", 3, 30);
        this.sfx("shoot", this.has(N.heavyOrb) ? 0.6 : 1);
        T.cast = this.fireballCooldown;
      } else T.cast = 0.1;
    }

    // Fire Ring
    if (this.has(N.fireRing) && T.ring <= 0) {
      const r = 50 * this.areaMul;
      if (this.nearest(p.x, p.y, r * 1.4)) {
        T.ring = 3 * this.cd;
        this.nova(p.x, p.y - 6, r, this.ringDamage, "Fire Ring", "fire", this.green ? "green" : "fire", {});
        this.sfx("ring");
      } else T.ring = 0.2;
    }

    // Ice Shard
    if (this.has("shard") && T.shard <= 0) {
      const target = this.nearest(ox, oy, 210);
      if (target) {
        T.shard = 0.7 * this.cd;
        const volley = (x: number, y: number, mul: number, src: string) => {
          const t = x === ox ? target : this.nearest(x, y, 210) ?? target;
          const aim = Math.atan2(t.y - t.r - y, t.x - x);
          const spread = this.has("fan") ? [-0.28, 0, 0.28] : [0];
          for (const d of spread)
            this.shots.push({ x, y, vx: Math.cos(aim + d) * 230, vy: Math.sin(aim + d) * 230, life: 1, damage: this.shardDamage * mul, r: 3, pierce: 3, hit: [], dead: false, kind: "shard", src, el: "frost", green: false, homing: false, bounces: 0 });
        };
        volley(ox, oy, 1, "Ice Shard");
        this.echoes.forEach((e, i) => volley(e.x, e.y - 20, i === 0 ? 0.5 : 0.35, "Reflections"));
        this.sfx("ice", 1.4);
      } else T.shard = 0.1;
    }

    // Paths of fire and poison behind you
    this.updateTrails(dt);
    if (this.has("miasma") && T.miasma <= 0) {
      T.miasma = 0.5;
      const r = 40 * this.areaMul;
      this.src = "Miasma";
      this.el = "toxic";
      this.forNear(p.x, p.y, (e) => {
        if (e.dead || e.charmT > 0 || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r * r) return;
        e.poisonT = 0;
        this.damage(e, this.toxicDamage * 0.8, 0, 0, { kb: 0 });
      }, Math.ceil(r / HASH));
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r;
        this.parts.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, vx: 0, vy: 0, life: 0.8, max: 0.8, color: Math.random() < 0.5 ? "#7ad040" : "#3f8a2a", size: 2, rise: 8 });
      }
    }

    // Meteors
    if (this.has("meteor") && T.meteor <= 0) {
      const n = this.has("shower") ? this.roll(3) : 1;
      let fell = 0;
      for (let i = 0; i < n; i++) {
        const t = this.randomEnemy(p.x, p.y, 170);
        if (!t) break;
        fell++;
        this.meteors.push({ x: t.x, y: t.y, t: 0, fall: 0.65 + i * 0.12, r: 30 * this.areaMul, damage: this.meteorDamage, kind: "rock", dead: false });
      }
      if (this.has("shower") && n === this.die(3) && fell) this.maxRoll(3);
      T.meteor = fell ? 3.5 * this.cd : 0.3;
    }

    // Little Suns and Moon Orbs
    if (this.has("suns")) this.updateSuns(dt);
    else this.suns.length = 0;
    if (this.has("moon")) this.updateMoons(dt);
    else this.moons.length = 0;

    // Totems and snowmen
    this.updateTotems(dt);

    // Frost Nova
    if (this.has("frost") && T.frost <= 0) {
      const r = 52 * this.areaMul;
      if (this.nearest(p.x, p.y, r * 1.5)) {
        T.frost = 3 * this.cd;
        const waves = this.has("ripples") ? this.roll(3) : 1;
        if (this.has("ripples") && waves === this.die(3)) this.maxRoll(3);
        for (let i = 0; i < waves; i++)
          this.novas.push({ x: p.x, y: p.y - 6, t: -i * 0.22, r: r * (1 + i * 0.18), damage: this.frostDamage, src: "Frost Nova", el: "frost", theme: "ice", chill: CFG.chillTime, stun: 0, hit: new Set(), dead: false });
        this.sfx("ice");
      } else T.frost = 0.2;
    }
    if (this.has("pals") && T.pals <= 0) {
      T.pals = 10 * this.cd;
      const a = Math.random() * Math.PI * 2;
      const yeti = this.has("yeti");
      const hp = 50 * 1.2 ** (this.time / 60) * (yeti ? 2.5 : 1);
      this.totems.push({ kind: "snow", x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 20, t: 0, dur: 10, castT: 0.4, zapT: 1, stompT: 1, hp, maxHp: hp, dead: false });
      this.effect("poof", p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 20 - 8, 1.2, 0.4);
    }

    // Lightning
    if (this.has("storm") && T.zap <= 0) {
      const first = this.nearest(p.x, p.y, 200);
      if (first) {
        T.zap = 1 * this.cd;
        let jumps = 3;
        if (this.has("forked")) {
          const r = this.roll(6);
          jumps = r + 1;
          if (r === this.die(6)) this.maxRoll(6);
        }
        // Thunderbolt: every 5th zap is a big one
        const big = this.has("thunderbolt") && ++this.zaps % 5 === 0;
        this.chain(ox, oy, first, jumps, this.stormDamage * (big ? 4 : 1), big ? "Thunderbolt" : "Lightning", big ? 1 : 0);
        if (big) this.shake = Math.max(this.shake, 2);
        this.sfx("zap");
      } else T.zap = 0.1;
    }
    if (this.has("call") && T.call <= 0) {
      T.call = 1;
      const e = this.randomEnemy(p.x, p.y, 160);
      if (e) this.strike(e, this.stormDamage * 0.75, "Storm Call");
    }

    // Poison globs, lobbed onto enemies
    if (this.has("toxic") && T.toxic <= 0) {
      const first = this.nearest(p.x, p.y, 180);
      if (first) {
        T.toxic = 1.2 * this.cd * (this.has("plague") ? 1.4 : 1);
        const n = this.has("spores") ? this.roll(3) : 1;
        if (this.has("spores") && n === this.die(3)) this.maxRoll(3);
        const lob = (x: number, y: number, t: Enemy, src: string) => {
          const d = Math.hypot(t.x - x, t.y - y) || 1;
          const sp = 160;
          this.shots.push({ x, y, vx: ((t.x - x) / d) * sp, vy: ((t.y - y) / d) * sp, life: d / sp, damage: this.toxicDamage, r: 3, pierce: 99, hit: [], dead: false, kind: "glob", src, el: "toxic", green: false, homing: false, bounces: 0 });
        };
        for (let i = 0; i < n; i++) lob(ox, oy, i === 0 ? first : this.randomEnemy(p.x, p.y, 180) ?? first, "Poison");
        this.echoes.forEach((e) => {
          const t = this.nearest(e.x, e.y, 180);
          if (t) lob(e.x, e.y - 20, t, "Reflections");
        });
        this.sfx("plop");
      } else T.toxic = 0.2;
    }

    // Carrot rockets
    if (this.has("carrots") && T.carrot <= 0) {
      const t = this.nearest(p.x, p.y, 200);
      if (t) {
        T.carrot = 2 * this.cd;
        const a = Math.atan2(t.y - t.r - (p.y - 14), t.x - p.x) + (Math.random() - 0.5) * 1.2;
        this.shots.push({ x: p.x, y: p.y - 14, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, life: 2, damage: this.carrotDamage, r: 4, pierce: 0, hit: [], dead: false, kind: "carrot", src: "Carrots", el: "none", green: false, homing: true, bounces: 0 });
      } else T.carrot = 0.2;
    }
    if (this.has("hole") && T.hole <= 0 && this.nearest(p.x, p.y, 80)) {
      T.hole = 12 * this.cd;
      p.under = 1;
      this.burst(p.x, p.y, "#9c7656", 16, 70);
      this.sfx("dig");
    }

    // Black holes
    if (this.has("hole1") && T.blackhole <= 0) {
      const t = this.crowd(170);
      if (t) {
        T.blackhole = 8 * this.cd;
        this.blackHole(t.x, t.y, 1);
      } else T.blackhole = 0.5;
    }
  }

  /** Hot Paws and Stink Trail: a path that follows you and hurts anything that crosses it. */
  private updateTrails(dt: number) {
    const p = this.player;
    const want: [boolean, Theme, string, number][] = [
      [this.has(N.hotPaws), this.green ? "green" : "fire", "Hot Paws", 3 * this.power * (1 + this.stats.burn * 0.5)],
      [this.has("stinktrail"), "toxic", "Stink Trail", this.toxicDamage * 0.7],
    ];
    for (const [on, theme, src, dmg] of want) {
      let tr = this.trails.find((t) => t.src === src);
      if (!on) {
        if (tr) this.trails.splice(this.trails.indexOf(tr), 1);
        continue;
      }
      if (!tr) this.trails.push((tr = { theme, src, pts: [] }));
      tr.theme = theme;
      const last = tr.pts[tr.pts.length - 1];
      if (p.under <= 0 && (!last || (last.x - p.x) ** 2 + (last.y - p.y) ** 2 > 36)) tr.pts.push({ x: p.x, y: p.y, t: this.time });
      while (tr.pts.length && this.time - tr.pts[0].t > 2.5) tr.pts.shift();
      if (tr.pts.length > 80) tr.pts.shift();
      this.src = src;
      this.el = theme === "toxic" ? "toxic" : "fire";
      const w = 7 * Math.sqrt(this.areaMul);
      for (let i = 0; i < tr.pts.length; i += 2) {
        const pt = tr.pts[i];
        this.forNear(pt.x, pt.y, (e) => {
          if (e.dead || e.charmT > 0 || e.trailT > 0 || (e.x - pt.x) ** 2 + (e.y - pt.y) ** 2 > (w + e.r) ** 2) return;
          e.trailT = 0.5;
          if (theme === "toxic") e.poisonT = 0;
          this.damage(e, dmg, 0, 0, { kb: 0, burn: theme === "toxic" ? 0 : dmg * 0.3 });
        });
      }
    }
    void dt;
  }

  private fireball(x: number, y: number, a: number, damage: number, src: string) {
    const orb = this.has(N.heavyOrb);
    const phoenix = this.has(N.phoenix);
    const v = orb ? 120 : 235;
    this.shots.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: orb ? 2.2 : 1, damage, r: orb ? 9 : 4, pierce: orb ? 99 : 1,
      hit: [], dead: false, kind: orb ? "orb" : "fire", src, el: "fire", green: this.green, homing: phoenix, bounces: phoenix ? 1 : 0,
    });
  }

  private nova(x: number, y: number, r: number, damage: number, src: string, el: El, theme: Theme, o: { chill?: number; stun?: number }) {
    this.novas.push({ x, y, t: 0, r, damage, src, el, theme, chill: o.chill ?? 0, stun: o.stun ?? 0, hit: new Set(), dead: false });
  }

  private ground(x: number, y: number, r: number, dur: number, damage: number, theme: Theme, src: string, bloom = false) {
    // A new patch on top of a recent one of the same kind just refreshes it
    const f = this.flames;
    for (let i = f.length - 1; i >= Math.max(0, f.length - 30); i--) {
      const o = f[i];
      if (o.theme === theme && o.src === src && (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r * 0.6) ** 2) {
        o.t = Math.min(o.t, o.dur * 0.1);
        o.damage = Math.max(o.damage, damage);
        return;
      }
    }
    if (f.length > 140) return;
    f.push({ x, y, r, t: 0, dur, tick: 0, damage, theme, src, bloom, dead: false });
  }

  private puddle(x: number, y: number, r: number, dur: number, damage: number, src: string) {
    this.ground(x, y, r, dur * (this.has("plague") ? 2 : 1), damage, "toxic", src, this.has("bloom"));
  }

  private blackHole(x: number, y: number, scale: number) {
    const big = this.has("horizon") ? 2 : 1;
    this.holes.push({ x, y, t: 0, dur: (big > 1 ? 3 : 2) * Math.min(1, scale + 0.3), r: 50 * this.areaMul * big * scale, damage: 25 * this.power * scale, tick: 0, dead: false });
    this.sfx("hole");
  }

  /** A lightning chain starting from (x, y). */
  private chain(x: number, y: number, first: Enemy, jumps: number, dmg: number, src: string, stun = 0) {
    const hit = new Set<Enemy>();
    const pts: [number, number][] = [[x, y]];
    let cur: Enemy | null = first;
    let bonus = 0;
    const reach = this.has("conductor") ? 400 : 75 * (this.has("arc") ? 1.6 : 1);
    for (let i = 0; i <= jumps && cur; i++) {
      hit.add(cur);
      if (this.has("supercon") && cur.chillT > 0 && bonus < 5) {
        bonus++;
        jumps++;
      }
      pts.push([cur.x, cur.y - cur.r]);
      this.src = src;
      this.el = "storm";
      this.damage(cur, dmg, cur.x - pts[pts.length - 2][0], cur.y - pts[pts.length - 2][1], { kb: 1, storm: true, stun });
      this.effect("spark", cur.x, cur.y - cur.r, 1, 0.16);
      if (this.has("static")) {
        const o = this.nearest(cur.x, cur.y, 50, hit);
        if (o) {
          this.bolts.push({ pts: [[cur.x, cur.y - cur.r], [o.x, o.y - o.r]], t: 0.05, dead: false });
          this.src = "Static";
          this.damage(o, dmg * 0.4, 0, 0, { kb: 0.2 });
          this.src = src;
        }
      }
      if (this.has("arc")) dmg *= 1.15;
      cur = this.nearest(cur.x, cur.y, reach, hit);
    }
    this.bolts.push({ pts, t: 0, dead: false });
  }

  /** Lightning from the sky onto one enemy. */
  private strike(e: Enemy, dmg: number, src: string) {
    this.bolts.push({ pts: [[e.x + 6, e.y - 120], [e.x, e.y - e.r]], t: 0, dead: false });
    this.src = src;
    this.el = "storm";
    this.damage(e, dmg, 0, 0, { storm: true, kb: 0.2 });
  }

  private updateSuns(dt: number) {
    const p = this.player;
    const count = this.has("flare") ? 4 : 2;
    this.sunAngle += 3 * dt;
    let radius = 30 * Math.sqrt(this.areaMul);
    if (this.has("supernova")) {
      this.novaT -= dt;
      if (this.novaT <= 0) this.novaT = 6;
      if (this.novaT < 1.2) radius *= 1 + Math.sin((this.novaT / 1.2) * Math.PI) * 2.5;
    }
    this.suns.length = 0;
    const dmg = this.sunDamage;
    for (let i = 0; i < count; i++) {
      const a = this.sunAngle + (i * Math.PI * 2) / count;
      const x = p.x + Math.cos(a) * radius;
      const y = p.y - 10 + Math.sin(a) * radius * 0.85;
      this.suns.push({ x, y });
      this.forNear(x, y, (e) => {
        if (e.dead || e.sunT > 0 || e.charmT > 0) return;
        const rs = e.r + 6;
        if ((e.x - x) ** 2 + (e.y - e.r - y) ** 2 > rs * rs) return;
        e.sunT = 0.45;
        this.src = "Little Suns";
        this.el = "fire";
        this.damage(e, dmg, e.x - p.x, e.y - p.y, { kb: 1.2, burn: dmg * 0.15 });
        this.effect("spark", x, y, 1, 0.16);
        if (this.has("solararc")) {
          const o = this.nearest(e.x, e.y, 60, new Set([e]));
          if (o) {
            this.bolts.push({ pts: [[x, y], [o.x, o.y - o.r]], t: 0.05, dead: false });
            this.src = "Solar Arc";
            this.el = "storm";
            this.damage(o, dmg * 0.6, 0, 0, { kb: 0.2, storm: true });
          }
        }
      });
    }
  }

  private updateMoons(dt: number) {
    const p = this.player;
    const T = this.T;
    this.moonAngle -= 3.4 * dt * (this.has("tides") ? 1.4 : 1) * (this.has("ion") ? 1.3 : 1);
    // The ring of moons slowly breathes in and out, sweeping a wide area
    const radius = 34 * Math.sqrt(this.areaMul) * (1 + 0.5 * Math.sin(this.time * 1.4));
    // Constellation rerolls a handful of extra moons every 8 seconds
    if (this.has("constellation")) {
      if (T.constel <= 0) {
        T.constel = 8;
        this.extraMoons = this.roll(4);
        if (this.extraMoons === this.die(4)) this.maxRoll(4);
      }
    } else this.extraMoons = 0;
    const count = 3 + this.extraMoons + (this.has("full") ? 1 : 0);
    const list: { a: number; big: boolean }[] = [];
    for (let i = 0; i < count; i++) list.push({ a: (i * Math.PI * 2) / count, big: this.has("full") && i === count - 1 });
    const drip = this.has("moonshroom") && T.moondrip <= 0;
    if (drip) T.moondrip = 2;
    // One moon beams at a nearby enemy every 2 seconds; Moonbeam makes every moon do it, faster
    const beam = T.beam <= 0;
    if (beam) T.beam = (this.has("beam") ? 1.5 : 2) * this.cd;
    const frost = this.has("moonfrost");
    const kick = this.has("kick");
    // Gravity Moon: tug nearby enemies toward you
    if (this.has("gravmoon"))
      this.forNear(p.x, p.y, (e) => {
        if (e.dead || e.charmT > 0 || e.kind === "king") return;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 90 && d > radius * 0.8) {
          e.x += (dx / d) * 40 * dt;
          e.y += (dy / d) * 40 * dt;
        }
      }, 3);
    this.moons.length = 0;
    for (const m of list) {
      const a = this.moonAngle + m.a;
      const x = p.x + Math.cos(a) * radius;
      const y = p.y - 10 + Math.sin(a) * radius * 0.85;
      this.moons.push({ x, y, big: m.big });
      if (drip) this.puddle(x, y + 10, 14, 3, this.toxicDamage * 0.7, "Moonshrooms");
      if (beam && (this.has("beam") || m === list[0])) {
        const t = this.nearest(x, y, 120);
        if (t) {
          this.bolts.push({ pts: [[x, y], [t.x, t.y - t.r]], t: 0.02, dead: false });
          this.src = "Moonbeam";
          this.el = "moon";
          this.damage(t, this.moonDamage, t.x - x, t.y - y, { kb: 0.4 });
        }
      }
      const reach = m.big ? 10 : 6;
      this.forNear(x, y, (e) => {
        if (e.dead || e.moonT > 0 || e.charmT > 0) return;
        const rs = e.r + reach;
        if ((e.x - x) ** 2 + (e.y - e.r - y) ** 2 > rs * rs) return;
        e.moonT = 0.4;
        this.src = "Moon Orbs";
        this.el = "moon";
        const dmg = this.moonDamage * (m.big ? 3 : 1) * (frost && e.chillT > 0 ? 1.5 : 1);
        if (frost) e.chillT = Math.max(e.chillT, 1.5);
        this.damage(e, dmg, e.x - p.x, e.y - p.y, {
          kb: (m.big ? 3 : 1.6) * (kick ? 2 : 1), stun: kick || this.has("ion") ? 0.3 : 0, burn: this.has("harvest") ? dmg * 0.25 : 0,
        });
        this.effect("spark", x, y, 1, 0.16);
        if (this.has("chargedmoons")) {
          const o = this.nearest(e.x, e.y, 60, new Set([e]));
          if (o) {
            this.bolts.push({ pts: [[x, y], [o.x, o.y - o.r]], t: 0.05, dead: false });
            this.src = "Charged Moons";
            this.damage(o, dmg * 0.6, 0, 0, { kb: 0.2, storm: true });
          }
        }
        if (this.has("embermoon") && Math.random() < 0.25) {
          const t = this.nearest(x, y, 200, new Set([e]));
          if (t) this.fireball(x, y, Math.atan2(t.y - t.r - y, t.x - x), 14 * this.power, "Ember Moons");
        }
      });
    }
  }

  private updateTotems(dt: number) {
    const p = this.player;
    const T = this.T;
    if (this.has("totem") && T.totem <= 0) {
      T.totem = 9 * this.cd;
      const n = this.has("twin") ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        this.totems.push({ kind: "fire", x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 12, t: 0, dur: 8, castT: 0.3, zapT: 0.6, stompT: 0, hp: 1, maxHp: 1, dead: false });
      }
      this.sfx("totem");
    }
    const fires = this.totems.filter((t) => t.kind === "fire");
    for (const t of this.totems) {
      t.t += dt;
      t.castT -= dt;
      t.zapT -= dt;
      t.stompT -= dt;
      if (t.kind === "fire") {
        if (this.has("wicker")) {
          // Wicker totems wander toward enemies and burn what they touch
          const e = this.nearest(t.x, t.y, 160);
          if (e) {
            const d = Math.hypot(e.x - t.x, e.y - t.y) || 1;
            if (d > 10) {
              t.x += ((e.x - t.x) / d) * 30 * dt;
              t.y += ((e.y - t.y) / d) * 30 * dt;
            }
          }
          if (t.stompT <= 0) {
            t.stompT = 0.5;
            this.src = "Wicker Totems";
            this.el = "fire";
            this.forNear(t.x, t.y, (o) => {
              if (!o.dead && o.charmT <= 0 && (o.x - t.x) ** 2 + (o.y - t.y) ** 2 < 18 * 18) this.damage(o, this.totemDamage * 0.5, o.x - t.x, o.y - t.y, { kb: 0.4, burn: this.totemDamage * 0.4 });
            });
          }
        }
        if (t.castT <= 0) {
          const e = this.nearest(t.x, t.y - 18, 180);
          t.castT = e ? 0.8 * this.cd : 0.15;
          if (e) this.fireball(t.x, t.y - 18, Math.atan2(e.y - e.r - (t.y - 18), e.x - t.x), this.totemDamage, "Totems");
        }
        if (this.has("tesla") && t.zapT <= 0) {
          const e = this.nearest(t.x, t.y - 18, 150);
          t.zapT = e ? 1.2 * this.cd : 0.2;
          if (e) this.chain(t.x, t.y - 20, e, 2, this.stormDamage * (1 + this.stats.totem), "Tesla Totems");
        }
      } else {
        // Snowmen throw snowballs; yetis stomp
        if (t.castT <= 0) {
          const e = this.nearest(t.x, t.y - 12, 140);
          t.castT = e ? 1 * this.cd : 0.2;
          if (e) {
            const a = Math.atan2(e.y - e.r - (t.y - 12), e.x - t.x);
            this.shots.push({ x: t.x, y: t.y - 12, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: 1, damage: this.frostDamage * 0.7, r: 3, pierce: 0, hit: [], dead: false, kind: "snow", src: "Snow Pals", el: "frost", green: false, homing: false, bounces: 0 });
          }
        }
        if (this.has("yeti") && t.stompT <= 0) {
          t.stompT = 2;
          this.nova(t.x, t.y - 4, 40 * this.areaMul, this.frostDamage * 1.4, "Snow Pals", "frost", "ice", { chill: 2 });
        }
      }
      if (t.t >= t.dur || t.hp <= 0) {
        t.dead = true;
        this.effect("poof", t.x, t.y - 10, 1.2, 0.5);
        if (t.kind === "fire") {
          if (this.has("totemNova")) this.nova(t.x, t.y - 6, 60 * this.areaMul, this.totemDamage * 2, "Totems", "fire", this.green ? "green" : "fire", {});
          if (this.has("effigy"))
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              this.ground(t.x + Math.cos(a) * 30, t.y + Math.sin(a) * 22, 14, 4, 3 * this.power * this.burnMul, "green", "Burning Effigy");
            }
        }
      }
    }
    // Lightning Fence between fire totems
    if (this.has("fence") && fires.length > 1)
      for (let i = 0; i < fires.length; i++) {
        const a = fires[i];
        const b = fires[(i + 1) % fires.length];
        if (fires.length === 2 && i === 1) break;
        if (Math.random() < dt * 20) this.bolts.push({ pts: [[a.x, a.y - 20], [b.x, b.y - 20]], t: 0.12, dead: false });
        const lx = b.x - a.x;
        const ly = b.y - a.y;
        const len2 = lx * lx + ly * ly || 1;
        this.src = "Lightning Fence";
        this.el = "storm";
        for (const e of this.enemies) {
          if (e.dead || e.charmT > 0 || e.zapT > 0) continue;
          const k = Math.max(0, Math.min(1, ((e.x - a.x) * lx + (e.y - a.y) * ly) / len2));
          if ((a.x + lx * k - e.x) ** 2 + (a.y + ly * k - e.y) ** 2 > (e.r + 5) ** 2) continue;
          e.zapT = 0.5;
          this.damage(e, this.stormDamage * 0.7, 0, 0, { kb: 0.3, storm: true });
        }
      }
  }

  /** Big, screen-wide magic on long timers. */
  private updateWorldMagic(dt: number) {
    const p = this.player;
    const T = this.T;
    // Lunar Cycle: the full moon is up for the first 8 seconds of every 30
    if (this.has("lunar")) {
      if (T.lunar <= 0) {
        T.lunar = 30;
        this.events.toast("The full moon rises!", "gold");
      }
      this.fullMoon = T.lunar > 22;
    } else this.fullMoon = false;
    if (this.has("eclipse") && T.eclipse <= 0) {
      T.eclipse = 20;
      this.dark = 3;
      for (const e of this.enemies) if (!e.dead && e.charmT <= 0 && e.kind !== "king" && this.onScreen(e)) this.dizzy(e, 3);
      this.sfx("dizzy", 0.6);
    }
    if (this.has("aurora") && T.aurora <= 0) {
      T.aurora = 20;
      this.effect("flash", 0, 0, 1, 1.2, "#80ffd0");
      this.heal(p.maxHp * 0.15);
      for (const e of this.enemies) if (!e.dead && this.onScreen(e)) e.chillT = Math.max(e.chillT, 3);
    }
    if (this.has("hail") && T.hail <= 0) {
      T.hail = 2 * this.cd;
      for (let i = 0; i < 3; i++) {
        const e = this.randomEnemy(p.x, p.y, 170);
        if (e) this.meteors.push({ x: e.x, y: e.y, t: 0, fall: 0.35 + i * 0.1, r: 16 * this.areaMul, damage: this.frostDamage, kind: "hail", dead: false });
      }
    }
    // Weather Witch
    if (this.has("weather")) {
      if (T.weather <= 0) {
        T.weather = 15;
        const kinds: Weather[] = ["blizzard", "thunder", "heat"];
        this.weather = kinds[Math.floor(Math.random() * 3)];
        this.weatherT = this.has("eye") ? 12 : 6;
        this.events.toast(this.weather === "blizzard" ? "A blizzard blows in!" : this.weather === "thunder" ? "A thunderstorm!" : "A heatwave!", "good");
      }
      this.weatherT -= dt;
      if (this.weatherT <= 0) this.weather = "";
      if (this.weather && Math.random() < dt * (this.weather === "thunder" ? 4 : 2)) {
        for (const e of this.enemies) {
          if (e.dead || e.charmT > 0 || !this.onScreen(e)) continue;
          if (this.weather === "blizzard") {
            e.chillT = Math.max(e.chillT, 1);
            if (Math.random() < 0.3) {
              this.src = "Weather";
              this.el = "frost";
              this.damage(e, this.frostDamage * 0.3, 0, 0, { kb: 0 });
            }
          } else if (this.weather === "heat") this.ignite(e, 4 * this.power * this.burnMul);
        }
        if (this.weather === "thunder") {
          const e = this.randomEnemy(p.x, p.y, 200);
          if (e) this.strike(e, this.stormDamage, "Weather");
        }
      }
    } else this.weather = "";
    // Lightning Rod: now and then the sky hits you too
    if (this.has("rod") && T.rod <= 0) {
      T.rod = 12;
      this.bolts.push({ pts: [[p.x + 6, p.y - 130], [p.x, p.y - 14]], t: 0, dead: false });
      this.sfx("zap", 0.7);
      if (!this.safe) this.hurt(6, "lightning rod");
    }
    // Gambler
    if (this.has("gambler") && T.gambler <= 0) {
      T.gambler = 15;
      const r = Math.min(20, 1 + Math.floor(Math.random() * 20) + this.luck);
      this.nums.push({ x: p.x, y: p.y - 50, value: r, t: 0, style: "max" });
      this.sfx("dice");
      if (r === 1) {
        this.events.toast("Gambler rolled a 1. Ouch!", "warn");
        if (!this.safe) this.hurt(20, "bad luck");
      } else if (r === 20) {
        this.book.points++;
        this.events.toast("Gambler rolled a 20! +1 skill point.", "gold");
        this.events.treasure?.();
      } else for (let i = 0; i < r; i++) this.fireball(p.x, p.y - 14, (i / r) * Math.PI * 2, this.fireballDamage, "Gambler");
    }
    if (this.has("stopwatch") && T.stopwatch <= 0) {
      T.stopwatch = 20;
      this.timeStop = 2;
      this.sfx("stop");
    }
    if (this.has("midnight") && T.midnight <= 0) {
      T.midnight = 40;
      this.midnight = 6;
      this.events.toast("Midnight strikes!", "gold");
      this.sfx("stop", 0.5);
    }
    if (this.has("cataclysm") && T.cataclysm <= 0) {
      const e = this.crowd(180);
      if (e) {
        T.cataclysm = 30;
        this.blackHole(e.x, e.y, 1.2);
        this.meteors.push({ x: e.x, y: e.y, t: 0, fall: 1.6, r: 70 * this.areaMul, damage: this.meteorDamage * 10, kind: "giant", dead: false });
        this.events.toast("Cataclysm!", "gold");
      } else T.cataclysm = 1;
    }
    if (this.has("unravel") && T.paradox <= 0) {
      T.paradox = 25;
      const r = 1 + Math.floor(Math.random() * 20);
      this.nums.push({ x: p.x, y: p.y - 50, value: r, t: 0, style: "max" });
      this.sfx("dice", 0.7);
      if (r === 1) {
        for (const e of this.enemies) e.hp = e.maxHp;
        this.events.toast("Reality frowns: every enemy healed.", "warn");
      } else if (r <= 10) {
        this.timeStop = 3;
        this.sfx("stop");
        this.events.toast("Reality pauses.", "good");
      } else if (r <= 19) {
        for (let i = 0; i < 3; i++) {
          const e = this.randomEnemy(p.x, p.y, 180);
          if (e) this.blackHole(e.x, e.y, 1);
        }
        this.events.toast("Reality tears open.", "good");
      } else {
        this.effect("flash", 0, 0, 1, 0.8, "#ffffff");
        this.src = "Unravel Reality";
        this.el = "none";
        for (const e of this.enemies) if (!e.dead && e.charmT <= 0 && this.onScreen(e)) this.damage(e, 9999, 0, 0, { kb: 0 });
        this.events.toast("Reality unravels!", "gold");
      }
    }
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      this.src = s.src;
      this.el = s.el;
      if (s.homing) {
        const t = this.nearest(s.x, s.y, 140, new Set(s.hit));
        if (t) {
          const sp = Math.hypot(s.vx, s.vy);
          const want = Math.atan2(t.y - t.r - s.y, t.x - s.x);
          const cur = Math.atan2(s.vy, s.vx);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const a = cur + Math.max(-6 * dt, Math.min(6 * dt, d));
          s.vx = Math.cos(a) * sp;
          s.vy = Math.sin(a) * sp;
        }
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) {
        s.dead = true;
        if (s.kind === "glob") {
          // Splat: a hit on everything it lands on, then a puddle
          const r = this.puddleSize;
          this.src = s.src;
          this.el = "toxic";
          this.forNear(s.x, s.y, (e) => {
            if (!e.dead && e.charmT <= 0 && ((e.x - s.x) / r) ** 2 + ((e.y - s.y) / (r * 0.7)) ** 2 <= 1) this.damage(e, s.damage * 1.5, e.x - s.x, e.y - s.y, { kb: 0.8 });
          }, Math.ceil(r / HASH));
          this.puddle(s.x, s.y, r, 4, s.damage, s.src);
          this.burst(s.x, s.y, "#9ae04a", 8, 60);
        }
        continue;
      }
      // Heavy Thoughts: orbs drag enemies along
      if (s.kind === "orb" && this.has("heavy"))
        this.forNear(s.x, s.y, (e) => {
          if (e.dead || e.charmT > 0) return;
          const dx = s.x - e.x;
          const dy = s.y - e.y;
          const d = Math.hypot(dx, dy);
          if (d < 50 && d > 1) {
            e.kx += (dx / d) * 300 * dt;
            e.ky += (dy / d) * 300 * dt;
          }
        }, 2);
      if (Math.random() < dt * 40) {
        const c = s.kind === "snow" ? "#ffffff" : s.kind === "carrot" ? "#ffb060" : s.kind === "spore" ? "#c8f080" : s.green ? (Math.random() < 0.5 ? "#7ad040" : "#d8ff90") : Math.random() < 0.5 ? "#ff7a1a" : "#ffe63d";
        this.parts.push({ x: s.x, y: s.y, vx: -s.vx * 0.05 + (Math.random() - 0.5) * 10, vy: -s.vy * 0.05 + (Math.random() - 0.5) * 10, life: 0.25, max: 0.25, color: c, size: s.kind === "orb" ? 2 : 1 });
      }
      if (s.kind === "glob") continue;
      this.forNear(s.x, s.y, (e) => {
        if (s.dead || e.dead || e.charmT > 0 || s.hit.includes(e)) return;
        const rs = e.r + s.r;
        if ((e.x - s.x) ** 2 + (e.y - e.r * 0.8 - s.y) ** 2 > rs * rs) return;
        s.hit.push(e);
        this.src = s.src;
        this.el = s.el;
        const fire = s.kind === "fire" || s.kind === "orb";
        const poisoned = e.poisonT < 0.6;
        this.damage(e, s.damage, s.vx, s.vy, { burn: fire && this.has(N.ignite) ? Math.max(s.damage, 14 * this.power) * 0.2 : 0, chill: s.kind === "snow" || s.kind === "shard" ? 1.5 : 0 });
        this.effect("spark", s.x, s.y, 1, 0.16);
        // Ball Lightning: fireballs zap a neighbor
        if (fire && this.has("ball")) {
          const o = this.nearest(s.x, s.y, 60, new Set([e]));
          if (o) {
            this.bolts.push({ pts: [[s.x, s.y], [o.x, o.y - o.r]], t: 0.05, dead: false });
            this.src = "Ball Lightning";
            this.el = "storm";
            this.damage(o, Math.max(s.damage, 14 * this.power) * 0.4, 0, 0, { kb: 0.2, storm: true });
            this.src = s.src;
            this.el = s.el;
          }
        }
        const boom = (fire && (this.has(N.blast) || (poisoned && this.has("gasleak")))) || s.kind === "carrot";
        if (boom) {
          const r = (s.kind === "carrot" ? 24 : 26) * this.areaMul;
          this.effect("blast", s.x, s.y, this.areaMul, 0.3, s.kind === "carrot" ? "#ffb060" : undefined);
          this.forNear(s.x, s.y, (o) => {
            if (o === e || o.dead || o.charmT > 0 || (o.x - s.x) ** 2 + (o.y - s.y) ** 2 > r * r) return;
            this.damage(o, s.damage * 0.6, o.x - s.x, o.y - s.y, { kb: 0.6 });
          }, 2);
        }
        if (s.bounces > 0) {
          s.bounces--;
          const next = this.nearest(s.x, s.y, 120, new Set(s.hit));
          if (next) {
            const sp = Math.hypot(s.vx, s.vy);
            const a = Math.atan2(next.y - next.r - s.y, next.x - s.x);
            s.vx = Math.cos(a) * sp;
            s.vy = Math.sin(a) * sp;
            s.life = Math.max(s.life, 0.6);
            return;
          }
        }
        if (s.pierce-- <= 0) s.dead = true;
      }, s.kind === "orb" ? 2 : 1);
    }
  }

  private updateNovas(dt: number) {
    for (const n of this.novas) {
      n.t += dt;
      const r = n.r * Math.min(1, n.t / NOVA_TIME);
      this.forNear(n.x, n.y, (e) => {
        if (e.dead || e.charmT > 0 || n.hit.has(e)) return;
        if ((e.x - n.x) ** 2 + (e.y - e.r - n.y) ** 2 > (r + e.r) ** 2) return;
        n.hit.add(e);
        this.src = n.src;
        this.el = n.el;
        // Steam Burst: ice on a burning enemy
        if (n.el === "frost" && e.burnT > 0 && this.has("steam")) {
          e.burnT = 0;
          this.effect("blast", e.x, e.y - e.r, 1.1, 0.35, "#e8f4ff");
          this.forNear(e.x, e.y, (o) => {
            if (o !== e && !o.dead && o.charmT <= 0 && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 32 * 32) {
              this.src = "Steam Burst";
              this.el = "none";
              this.damage(o, n.damage * 1.5, o.x - e.x, o.y - e.y, { kb: 0.8 });
            }
          });
          this.src = n.src;
          this.el = n.el;
        }
        this.damage(e, n.damage, e.x - n.x, e.y - n.y, { kb: 1, chill: n.chill, stun: n.stun, burn: n.el === "fire" && this.has(N.ignite) ? n.damage * 0.3 : 0 });
      }, Math.ceil(n.r / HASH));
      if (n.t >= NOVA_TIME + 0.25) n.dead = true;
    }
  }

  private updateFlames(dt: number) {
    const rot = this.has("rot");
    for (const f of this.flames) {
      f.t += dt;
      f.tick -= dt;
      if (f.t >= f.dur) {
        f.dead = true;
        if (f.bloom) {
          this.effect("blast", f.x, f.y, f.r / 22, 0.35, "#9ae04a");
          this.src = "Toxic Bloom";
          this.el = "toxic";
          this.forNear(f.x, f.y, (e) => {
            if (!e.dead && e.charmT <= 0 && ((e.x - f.x) / f.r) ** 2 + ((e.y - f.y) / (f.r * 0.7)) ** 2 <= 1.4) this.damage(e, f.damage * 5, 0, 0, { kb: 0.5 });
          }, Math.ceil(f.r / HASH) + 1);
        }
        continue;
      }
      const toxic = f.theme === "toxic";
      const inside = (e: Enemy) => !e.dead && e.charmT <= 0 && ((e.x - f.x) / f.r) ** 2 + ((e.y - f.y) / (f.r * 0.7)) ** 2 <= 1;
      if (toxic) this.forNear(f.x, f.y, (e) => inside(e) && (e.poisonT = 0), Math.ceil(f.r / HASH));
      if (f.tick > 0) continue;
      f.tick = 0.5;
      this.src = f.src;
      this.el = toxic ? "toxic" : f.theme === "ice" ? "frost" : "fire";
      const blackice = toxic && this.has("blackice");
      const frostbite = toxic && this.has("frostbite");
      const fumes = toxic && this.has("fumes");
      this.forNear(f.x, f.y, (e) => {
        if (!inside(e)) return;
        if (f.theme === "ice") e.chillT = Math.max(e.chillT, 1.5);
        if (frostbite && e.chillT > 0 && e.freezeCd <= 0) {
          e.freezeT = Math.max(e.freezeT, 1);
          e.freezeCd = 3;
        }
        if (blackice) e.chillT = Math.max(e.chillT, 0.8);
        const burn = toxic ? (rot || fumes ? f.damage * 0.4 : 0) : f.theme === "ice" ? 0 : f.damage * 0.3;
        if (toxic && rot) e.burnGreen = true;
        this.damage(e, f.damage, 0, 0, { kb: 0, burn });
      }, Math.ceil(f.r / HASH));
    }
  }

  private updateMeteors(dt: number) {
    for (const m of this.meteors) {
      m.t += dt;
      if (m.t < m.fall) continue;
      m.dead = true;
      const hail = m.kind === "hail";
      this.src = hail ? "Hailstorm" : m.kind === "giant" ? "Cataclysm" : "Meteors";
      this.el = hail ? "frost" : "fire";
      this.effect("blast", m.x, m.y - 4, (m.r / 26) * 1.1, hail ? 0.25 : 0.4, hail ? "#cfefff" : undefined);
      this.burst(m.x, m.y - 4, hail ? "#ffffff" : "#ffa424", hail ? 6 : 16, hail ? 50 : 110);
      this.shake = Math.max(this.shake, hail ? 0.5 : m.kind === "giant" ? 6 : 1.5);
      this.sfx(hail ? "ice" : "meteor", m.kind === "giant" ? 0.5 : hail ? 1.5 : 1);
      const freeze = !hail && this.has("comet");
      const stun = !hail && this.has("ion");
      this.forNear(m.x, m.y, (e) => {
        if (e.dead || e.charmT > 0 || (e.x - m.x) ** 2 + ((e.y - m.y) / 0.8) ** 2 > m.r * m.r) return;
        this.damage(e, m.damage, e.x - m.x, e.y - m.y, {
          kb: hail ? 0.3 : 1.4, chill: hail ? 2 : 0, freeze: freeze ? 1 : 0, stun: stun ? 1 : 0,
          burn: !hail && this.has(N.ignite) ? m.damage * 0.3 : 0,
        });
      }, Math.ceil(m.r / HASH) + 1);
      if (hail) continue;
      if (this.has("scorched")) this.ground(m.x, m.y, 22 * this.areaMul, 3, 4 * this.power * (1 + this.stats.meteor), this.green ? "green" : "fire", "Meteors");
      if (this.has("icecrater")) this.ground(m.x, m.y, 26 * this.areaMul, 4, this.frostDamage * 0.3, "ice", "Ice Crater");
      if (this.has("singular") && m.kind === "rock") this.blackHole(m.x, m.y, 0.6);
      if (this.has("thunderfall")) {
        const e = this.nearest(m.x, m.y, 80);
        if (e) this.chain(m.x, m.y - 30, e, 3, this.stormDamage, "Thunderfall");
      }
    }
  }

  private updateHoles(dt: number) {
    for (const h of this.holes) {
      h.t += dt;
      h.tick -= dt;
      const reach = h.r * 1.6;
      this.forNear(h.x, h.y, (e) => {
        if (e.dead || e.charmT > 0 || e.kind === "king") return;
        const dx = h.x - e.x;
        const dy = h.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > reach || d < 2) return;
        const pull = (e.kind === "golem" || e.elite ? 60 : 140) * (1 - d / reach + 0.3);
        e.x += (dx / d) * pull * dt;
        e.y += (dy / d) * pull * dt;
      }, Math.ceil(reach / HASH));
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        this.parts.push({ x: h.x + Math.cos(a) * reach * 0.8, y: h.y + Math.sin(a) * reach * 0.6, vx: -Math.cos(a) * reach * 1.5, vy: -Math.sin(a) * reach, life: 0.5, max: 0.5, color: Math.random() < 0.5 ? "#a070ff" : "#3a1d5c", size: 1 });
      }
      if (h.t >= h.dur) {
        h.dead = true;
        this.src = "Black Holes";
        this.el = "none";
        this.effect("blast", h.x, h.y, h.r / 26, 0.4, "#a070ff");
        this.shake = Math.max(this.shake, 2);
        this.forNear(h.x, h.y, (e) => {
          if (!e.dead && e.charmT <= 0 && (e.x - h.x) ** 2 + (e.y - h.y) ** 2 < h.r * h.r) this.damage(e, h.damage, e.x - h.x, e.y - h.y, { kb: 2 });
        }, Math.ceil(h.r / HASH) + 1);
      }
    }
  }

  // ---------- Damage ----------
  private credit(src: string, amount: number) {
    this.dealt.set(src, (this.dealt.get(src) ?? 0) + amount);
  }

  private damage(
    e: Enemy, amount: number, dirX: number, dirY: number,
    o: { kb?: number; burn?: number; chill?: number; freeze?: number; stun?: number; storm?: boolean } = {},
  ) {
    const chilled = e.chillT > 0 || e.freezeT > 0;
    const poisoned = e.poisonT < 0.6;
    if (chilled && this.has("shatter")) amount *= 1.4;
    if (poisoned && this.has("corrode")) amount *= 1.3;
    if (this.el === "fire" && chilled && this.has("thermal")) amount *= 2;
    if (o.storm && poisoned && this.has("electro")) amount *= 1.5;
    if (e.dizzyT > 0 && this.has("clumsy")) amount *= 1.25;
    if (e.freezeT > 0 && this.has("glacialheart")) amount *= 3;
    if (this.el === "toxic" && chilled && this.has("blackice")) amount *= 1.5;
    // Deep Freeze: frost on a chilled enemy freezes it
    if (this.el === "frost" && e.chillT > 0 && this.has("deepfreeze") && e.freezeCd <= 0) {
      o.freeze = Math.max(o.freeze ?? 0, 0.8);
      e.freezeCd = 3;
    }
    if (o.chill && this.has("permafrost")) o.chill *= 10;
    if (o.storm) {
      e.stormHit = true;
      if (this.has("plasma")) o.burn = Math.max(o.burn ?? 0, amount * 0.3);
      if (poisoned && this.has("acid") && this.T.acid <= 0) {
        this.T.acid = 0.4;
        this.puddle(e.x, e.y, 20 * this.areaMul, 3, this.toxicDamage, "Acid Rain");
      }
    } else e.stormHit = false;
    this.credit(this.src, Math.min(amount, Math.max(0, e.hp)));
    e.hp -= amount;
    e.flash = 0.1;
    if (o.burn) this.ignite(e, o.burn * this.burnMul);
    if (o.chill) e.chillT = Math.max(e.chillT, o.chill);
    if (o.freeze) e.freezeT = Math.max(e.freezeT, o.freeze);
    if (o.stun) e.stunT = Math.max(e.stunT, o.stun);
    const len = Math.hypot(dirX, dirY) || 1;
    const kb = 80 * (o.kb ?? 1) * (e.kind === "king" ? 0.15 : e.kind === "golem" ? 0.25 : e.elite ? 0.4 : e.kind === "boar" && e.ai === 2 ? 0.2 : 1);
    e.kx += (dirX / len) * kb;
    e.ky += (dirY / len) * kb;
    if (amount >= 1) {
      const style = e.kind === "king" || e.elite ? "big" : this.el === "frost" ? "ice" : this.el === "storm" ? "zap" : this.el === "toxic" ? "toxic" : "hit";
      this.nums.push({ x: e.x, y: e.y - e.r * 2 - 4, value: Math.round(amount), t: 0, style });
      this.sfx("hit");
    }
    if (e.hp <= 0 && !e.dead) this.kill(e);
  }

  private ignite(e: Enemy, dps: number) {
    e.burnT = this.burnTime;
    e.burnDps = Math.max(e.burnDps, dps);
    e.burnGreen = e.burnGreen || this.green;
  }

  private kill(e: Enemy) {
    e.dead = true;
    const ally = e.charmT > 0;
    if (!ally) this.kills++;
    const color = CFG.enemies[e.kind].color;
    // Overload: lightning kills explode
    if (e.stormHit && this.has("overload")) {
      e.stormHit = false;
      const prev = [this.src, this.el] as const;
      this.src = "Overload";
      this.el = "storm";
      this.effect("blast", e.x, e.y - e.r, 1.2, 0.3, "#ffe46a");
      this.forNear(e.x, e.y, (o) => {
        if (!o.dead && o.charmT <= 0 && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 30 * 30) this.damage(o, this.stormDamage * 0.7, o.x - e.x, o.y - e.y);
      });
      [this.src, this.el] = prev;
    }
    // Wildfire and Verdant Flame: the fire jumps to neighbors
    if (e.burnT > 0) {
      const jumps = (this.has(N.wildfire) ? 2 : 0) + (this.has("verdant") ? 1 : 0);
      if (jumps) {
        const skip = new Set([e]);
        for (let i = 0; i < jumps; i++) {
          const o = this.nearest(e.x, e.y, 50, skip);
          if (!o) break;
          skip.add(o);
          o.burnT = this.burnTime;
          o.burnDps = Math.max(o.burnDps, e.burnDps);
          o.burnGreen = e.burnGreen;
          this.parts.push({ x: e.x, y: e.y - e.r, vx: (o.x - e.x) * 3, vy: (o.y - e.y) * 3, life: 0.3, max: 0.3, color: e.burnGreen ? "#a8f060" : "#ffa424", size: 2 });
        }
      }
      if (this.has("witchfire") && Math.random() < 0.5) this.ground(e.x, e.y, 16 * this.areaMul, 2.5, 1.5 * this.power * (1 + this.stats.burn), "green", "Witchfire");
    }
    if (e.poisonT < 0.6 && this.has("compost") && Math.random() < 0.03) this.drop("carrot", e.x, e.y);
    if (e.poisonT < 0.6 && this.has("contagion") && Math.random() < 0.25) this.puddle(e.x, e.y, this.puddleSize * 0.6, 2, this.toxicDamage * 0.6, "Contagion");
    this.sfx("pop", e.kind === "king" || e.elite || e.kind === "golem" ? 0.5 : 1);
    if (e.kind === "king" || e.elite) {
      this.burst(e.x, e.y - 12, e.elite ? "#ffd640" : color, 40, 130);
      this.effect("poof", e.x, e.y - 14, e.kind === "king" ? 2.4 : 1.6, 0.6);
      this.shake = 4;
      this.hitstop = 0.08;
      const n = e.kind === "king" ? 8 : 4;
      for (let i = 0; i < n; i++) this.dropGem(e.x + (Math.random() - 0.5) * 24, e.y + (Math.random() - 0.5) * 24, e.kind === "king" ? 5 : Math.max(5, Math.round(e.xp / n)));
      this.drop(e.kind === "king" ? "scroll" : "chest", e.x, e.y);
      if (e.kind === "king") return;
    } else {
      this.burst(e.x, e.y - e.r, ally ? "#ff80c0" : color, 10, 80);
      this.effect("poof", e.x, e.y - e.r, e.kind === "skel" || e.kind === "golem" || e.kind === "jelly" ? 1.1 : 0.9, 0.42);
      if (e.xp > 0) this.dropGem(e.x, e.y, e.xp);
    }
    if (ally) return;
    // Jellies split into two slimes
    if (e.kind === "jelly")
      for (const side of [-1, 1]) {
        const k = this.spawnEnemy("slime", e.x + side * 6, e.y);
        k.kx = side * 90;
      }
    // Spirits: some of the fallen rise as ghost friends
    const rise = this.midnight > 0 ? 1 : this.has("wisps") ? (this.has("legion") ? 1 / 6 : 1 / 12) : 0;
    if (rise && Math.random() < rise) {
      const g = this.spawnEnemy("ghost", e.x, e.y);
      g.xp = 0;
      this.befriend(g, 6, 0.04, "Ghost friends");
    }
    const pk = CFG.pickups;
    const carrots = this.has("golden") ? 4 : 1;
    if (Math.random() < CFG.scrollDropChance * this.dropMul) this.drop("scroll", e.x, e.y);
    else if (this.magnetT <= 0) {
      this.magnetT = (pk.magnetEvery * (0.8 + Math.random() * 0.4)) / this.dropMul;
      this.drop("magnet", e.x, e.y);
    } else if (Math.random() < (this.player.hp < this.player.maxHp * 0.4 ? pk.carrotChanceHurt : pk.carrotChance) * this.dropMul * carrots) this.drop("carrot", e.x, e.y);
  }

  private drop(kind: PickupKind, x: number, y: number) {
    this.loot.push({ kind, x, y, magnet: false, sp: 0, dead: false, t: 0 });
  }

  /** Adds an XP gem; past the cap, gems fold into existing ones far from the player instead. */
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

  // ---------- Pickups ----------
  private pull(o: { x: number; y: number; magnet: boolean; sp: number }, dt: number, reach = 1) {
    const p = this.player;
    const dx = p.x - o.x;
    const dy = p.y - 10 - o.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!o.magnet && d < CFG.player.pickupRadius * this.pickupMul * reach) o.magnet = true;
    if (!o.magnet) return false;
    o.sp = Math.max(o.sp + 500 * dt, 60);
    const step = Math.min(d, o.sp * dt);
    o.x += (dx / d) * step;
    o.y += (dy / d) * step;
    return d < 7;
  }

  private magnetAll() {
    for (const g of this.gems) {
      g.magnet = true;
      g.sp = Math.max(g.sp, 140);
    }
    this.effect("ring", this.player.x, this.player.y - 12, 4, 0.6);
    this.sfx("magnet");
  }

  private updatePickups(dt: number) {
    this.magnetT -= dt;
    for (const g of this.gems)
      if (this.pull(g, dt)) {
        g.dead = true;
        this.gainXp(g.value);
        this.sfx("gem");
      }
    const p = this.player;
    for (const l of this.loot) {
      l.t += dt;
      // Scrolls and chests come to you from much farther away
      if (!this.pull(l, dt, l.kind === "scroll" || l.kind === "chest" ? 3.5 : 1)) continue;
      l.dead = true;
      this.effect("ring", p.x, p.y - 12, 1.4, 0.5);
      if (l.kind === "scroll") {
        this.pendingScrolls++;
        this.sfx("pickup");
        this.events.scrollFound();
      } else if (l.kind === "magnet") {
        this.magnetAll();
        this.events.toast("Magnet! Every gem comes to you.", "good");
      } else if (l.kind === "carrot") {
        const gold = this.has("foot") && this.roll(6) >= 6;
        if (gold) {
          this.heal(p.maxHp);
          this.magnetAll();
          this.events.toast("A golden carrot!", "gold");
        } else this.heal(CFG.pickups.carrotHeal * (this.has("golden") ? 2 : 1));
      } else {
        this.book.points++;
        this.burst(p.x, p.y - 14, "#ffd640", 30, 120);
        this.sfx("chest");
        this.events.toast("Treasure chest! +1 skill point.", "gold");
        this.events.treasure?.();
      }
    }
  }

  private gainXp(v: number) {
    this.xp += v;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.book.points++;
      this.sfx("level");
      const p = this.player;
      this.effect("ring", p.x, p.y - 12, 1.6, 0.5);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        this.parts.push({ x: p.x, y: p.y - 12, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.45, max: 0.45, color: i % 2 ? "#8a92ee" : "#ffffff", size: 2 });
      }
      this.events.levelUp();
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
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    k = 0;
    for (const n of this.nums) {
      n.t += dt;
      if (n.t < 0.7) this.nums[k++] = n;
    }
    this.nums.length = k;
    if (this.nums.length > 120) this.nums.splice(0, this.nums.length - 120);
  }
}
