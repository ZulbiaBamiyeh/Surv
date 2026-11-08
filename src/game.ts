import { Book, OwnedScroll } from "./book";
import { CFG, EnemyKind } from "./config";
import { SCROLLS, ScrollId } from "./content";

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
  /** Seconds since this enemy was last standing in poison. */
  poisonT: number;
  moonT: number;
  stormHit: boolean;
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
  kind: "fire" | "orb" | "icicle";
  blast: boolean;
  ignite: boolean;
  homing: boolean;
  bounces: number;
}

export interface Nova { x: number; y: number; t: number; r: number; damage: number; freeze: boolean; hit: Set<Enemy>; dead: boolean; }
export interface Bolt { pts: [number, number][]; t: number; dead: boolean; sky?: boolean; }
export interface Puddle { x: number; y: number; r: number; t: number; dur: number; tick: number; damage: number; slow: boolean; bloom: boolean; dead: boolean; }
export interface Gem { x: number; y: number; value: number; magnet: boolean; sp: number; dead: boolean; }
export interface Loot { x: number; y: number; magnet: boolean; sp: number; dead: boolean; t: number; }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; rise?: number; }
export interface Effect { kind: "poof" | "spark" | "ring" | "heal" | "blast" | "freeze"; x: number; y: number; t: number; dur: number; scale: number; }
export interface DamageNumber { x: number; y: number; value: number; t: number; style: "hit" | "big" | "burn" | "heal" | "max"; }

export interface GameEvents {
  levelUp(): void;
  scrollFound(): void;
  gameOver(): void;
  toast(msg: string, kind?: "good" | "warn" | "gold"): void;
}

const HASH = 32;
const hk = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
const NOVA_TIME = 0.35;

function compact<T extends { dead: boolean }>(arr: T[]) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
  arr.length = j;
}

interface SpellState { castT: number; casts: number; moons: number; rerollT: number; eclipseT: number; callT: number; trailT: number; }

export class Game {
  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  over = false;
  won = false;
  hitstop = 0;
  shake = 0;
  viewW = 240;
  viewH = 400;
  input = { x: 0, y: 0 };

  player = {
    x: 0, y: 0, vx: 0, vy: 0, hp: CFG.player.maxHp, maxHp: CFG.player.maxHp,
    inv: 0, moving: false, face: 1, walkT: 0, ward: 0, revived: false,
  };
  book = new Book("fire");
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  novas: Nova[] = [];
  bolts: Bolt[] = [];
  puddles: Puddle[] = [];
  gems: Gem[] = [];
  loot: Loot[] = [];
  parts: Particle[] = [];
  fx: Effect[] = [];
  nums: DamageNumber[] = [];
  /** Moon positions and size, refreshed every step for drawing. */
  moons: { x: number; y: number; big: boolean }[] = [];
  /** Radius of the Blizzard aura, 0 when inactive. */
  blizzard = 0;
  /** Scrolls waiting to be offered after a pickup. */
  pendingScrolls = 0;

  private st = new Map<ScrollId, SpellState>();
  private moonAngle = 0;
  private spawnAcc = 0;
  private nextKing = CFG.spawn.kingFirst;
  private hash = new Map<number, Enemy[]>();
  private pool: Enemy[][] = [];
  private lightT = { heal: 8, ward: 4 };

  constructor(private events: GameEvents) {}

  get xpNeeded() {
    const l = this.level - 1;
    return Math.round(CFG.xp.base + CFG.xp.perLevel * l + CFG.xp.perLevel2 * l * l);
  }

  // ---------- Light scroll (support) ----------
  private get light() {
    return this.book.find("light");
  }
  get moveMul() {
    return this.book.has(this.light, "impactA") ? 1.2 : 1;
  }
  get pickupMul() {
    return this.book.has(this.light, "impactB") ? 2 : 1;
  }
  get luck() {
    return this.book.has(this.light, "capB") ? 1 : 0;
  }

  /** Rolls a die, with Lucky Star adding one (capped at the die's max). */
  roll(sides: number) {
    return Math.min(sides, 1 + Math.floor(Math.random() * sides) + this.luck);
  }

  private spellState(id: ScrollId): SpellState {
    let s = this.st.get(id);
    if (!s) this.st.set(id, (s = { castT: 0.4, casts: 0, moons: 2, rerollT: 0, eclipseT: 6, callT: 1, trailT: 0 }));
    return s;
  }

  step(dt: number) {
    if (this.over) return;
    this.shake = Math.max(0, this.shake - 24 * dt);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time += dt;
    if (this.time >= CFG.runLength) {
      this.won = this.over = true;
      this.events.gameOver();
      return;
    }
    this.updatePlayer(dt);
    this.spawn(dt);
    this.buildHash();
    this.updateEnemies(dt);
    this.updateLight(dt);
    for (const s of this.book.owned) if (!SCROLLS[s.id].support) this.updateSpell(s, dt);
    if (!this.book.find("moon")) this.moons.length = 0;
    this.updateShots(dt);
    this.updateNovas(dt);
    this.updatePuddles(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    compact(this.enemies);
    compact(this.shots);
    compact(this.novas);
    compact(this.bolts);
    compact(this.puddles);
    compact(this.gems);
    compact(this.loot);
  }

  // ---------- Player ----------
  private updatePlayer(dt: number) {
    const p = this.player;
    const c = CFG.player;
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
    p.hp = Math.min(p.maxHp, p.hp + c.regen * dt + (this.book.has(this.light, "formB") ? dt : 0));
  }

  private hurt(amount: number) {
    const p = this.player;
    p.hp -= amount;
    p.inv = CFG.player.iframes;
    this.shake = 3;
    this.hitstop = 0.05;
    this.burst(p.x, p.y - 12, "#ff3d4a", 10, 70);
    if (p.hp > 0) return;
    if (this.book.has(this.light, "capA") && !p.revived) {
      p.revived = true;
      p.hp = p.maxHp / 2;
      p.inv = 2;
      this.effect("ring", p.x, p.y - 12, 3, 0.7);
      this.events.toast("Second Life! You got back up.", "gold");
      return;
    }
    p.hp = 0;
    this.over = true;
    this.effect("poof", p.x, p.y - 12, 1.6, 0.6);
    this.events.gameOver();
  }

  private updateLight(dt: number) {
    const s = this.light;
    if (!s) return;
    const b = this.book;
    const p = this.player;
    const sooner = (1 - 0.12 * b.rank(s, "haste")) / (1 + 0.04 * b.rank(s, "mastery"));
    const bless = b.rank(s, "power") + b.rank(s, "mastery") * 0.2;
    this.lightT.heal -= dt;
    if (this.lightT.heal <= 0) {
      this.lightT.heal = 30 * sooner;
      if (p.hp < p.maxHp) {
        const amount = Math.round(p.maxHp * 0.1 * (1 + 0.3 * bless));
        p.hp = Math.min(p.maxHp, p.hp + amount);
        this.nums.push({ x: p.x, y: p.y - 40, value: amount, t: 0, style: "heal" });
        this.effect("heal", p.x, p.y - 12, 1, 0.8);
        for (let i = 0; i < 14; i++)
          this.parts.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y - Math.random() * 26, vx: 0, vy: 0, life: 0.8, max: 0.8, color: i % 2 ? "#ffd0f0" : "#ffffff", size: 2, rise: 30 });
      }
    }
    if (b.has(s, "formA")) {
      this.lightT.ward -= dt;
      if (this.lightT.ward <= 0) {
        this.lightT.ward = 20 * sooner;
        p.ward = 3 + bless;
        this.effect("ring", p.x, p.y - 12, 1.2, 0.4);
      }
    }
  }

  // ---------- Spawning ----------
  private spawn(dt: number) {
    const s = CFG.spawn;
    const m = this.time / 60;
    const rate = Math.min(s.maxRate, s.startRate + s.ratePerMin * m + s.ratePerMin2 * m * m);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length < s.maxEnemies) this.spawnEnemy(this.pickKind());
    }
    if (this.time >= this.nextKing) {
      this.nextKing += s.kingEvery;
      this.spawnEnemy("king");
      this.events.toast("A King Slime appeared! It carries a scroll.", "gold");
    }
  }

  private pickKind(): EnemyKind {
    const s = CFG.spawn;
    const bat = this.time > s.batsAfter ? 4 : 0;
    const skel = this.time > s.skeletonsAfter ? 1.5 + this.time / 90 : 0;
    let r = Math.random() * (6 + bat + skel);
    if ((r -= 6) < 0) return "slime";
    if ((r -= bat) < 0) return "bat";
    return "skel";
  }

  private ringPoint() {
    const a = Math.random() * Math.PI * 2;
    const d = Math.hypot(this.viewW, this.viewH) / 2 + 16;
    return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
  }

  spawnEnemy(kind: EnemyKind) {
    const t = CFG.enemies[kind];
    const min = this.time / 60;
    const hp = t.hp * CFG.spawn.hpGrowth ** min * (kind === "king" ? 1 + min * 0.5 : 1);
    const { x, y } = this.ringPoint();
    this.enemies.push({
      kind, x, y, kx: 0, ky: 0, hp, maxHp: hp, r: t.radius, speed: t.speed * (0.9 + Math.random() * 0.2),
      damage: t.damage * (1 + CFG.spawn.damagePerMin * min), xp: t.xp, flash: 0, phase: Math.random() * 10, dead: false,
      burnT: 0, burnDps: 0, burnShown: 0, chillT: 0, freezeT: 0, stunT: 0, poisonT: 9, moonT: 0, stormHit: false,
    });
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
    const bog = this.book.has(this.book.find("toxic"), "formB");
    for (const e of this.enemies) {
      if (e.dead) continue;
      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      e.poisonT += dt;
      let slow = e.chillT > 0 ? 1 - CFG.chillSlow : 1;
      if (bog && e.poisonT < 0.6) slow *= 0.7;
      if (e.freezeT > 0 || e.stunT > 0) slow = 0;
      e.x += (dx * e.speed * slow + e.kx) * dt;
      e.y += (dy * e.speed * slow + e.ky) * dt;
      e.kx *= decay;
      e.ky *= decay;
      e.flash = Math.max(0, e.flash - dt);
      e.chillT = Math.max(0, e.chillT - dt);
      e.freezeT = Math.max(0, e.freezeT - dt);
      e.stunT = Math.max(0, e.stunT - dt);
      e.moonT = Math.max(0, e.moonT - dt);
      if (e.burnT > 0) {
        e.burnT -= dt;
        const dmg = e.burnDps * dt;
        e.hp -= dmg;
        e.burnShown += dmg;
        if (Math.random() < dt * 12)
          this.parts.push({ x: e.x + (Math.random() - 0.5) * e.r * 1.4, y: e.y - Math.random() * e.r * 1.6, vx: 0, vy: 0, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? "#ffa424" : "#f05a1a", size: 1, rise: 24 });
        if (e.burnShown >= 4 || (e.burnT <= 0 && e.burnShown >= 1)) {
          this.nums.push({ x: e.x + 4, y: e.y - e.r * 2, value: Math.round(e.burnShown), t: 0, style: "burn" });
          e.burnShown = 0;
        }
        if (e.hp <= 0) {
          this.kill(e);
          continue;
        }
      }
      this.forNear(e.x, e.y, (o) => {
        if (o === e || o.dead) return;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const rs = e.r + o.r;
        const dd = ox * ox + oy * oy;
        if (dd >= rs * rs || dd === 0) return;
        const dist = Math.sqrt(dd);
        const push = ((rs - dist) / dist) * (o.kind === "king" ? 0.5 : 0.25);
        e.x += ox * push;
        e.y += oy * push;
      });
      if (d > far && e.kind !== "king") {
        const pt = this.ringPoint();
        e.x = pt.x;
        e.y = pt.y;
      }
      if (d < e.r + CFG.player.radius && p.inv <= 0 && p.ward <= 0 && e.freezeT <= 0 && !this.over) this.hurt(e.damage);
    }
  }

  // ---------- Spells ----------
  private nearest(x: number, y: number, range: number, skip?: Set<Enemy>, toughest = false): Enemy | null {
    let best: Enemy | null = null;
    let bestV = toughest ? -1 : range * range;
    for (const e of this.enemies) {
      if (e.dead || skip?.has(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d > range * range) continue;
      if (toughest ? e.hp > bestV : d < bestV) {
        bestV = toughest ? e.hp : d;
        best = e;
      }
    }
    return best;
  }

  /** Damage multiplier shared by all attack scrolls: Power ranks and empty slots. */
  private power(s: OwnedScroll) {
    const b = this.book;
    return (1 + 0.3 * b.rank(s, "power")) * (1 + 0.08 * b.rank(s, "mastery")) * b.emptyBonus * (1 + CFG.levelDamage * (this.level - 1));
  }

  private haste(s: OwnedScroll) {
    return (1 - 0.1 * this.book.rank(s, "haste")) / (1 + 0.03 * this.book.rank(s, "mastery"));
  }

  private updateSpell(s: OwnedScroll, dt: number) {
    const st = this.spellState(s.id);
    if (s.id === "moon") return this.updateMoons(s, st, dt);
    if (s.id === "toxic" && this.book.has(s, "capA")) {
      st.trailT -= dt;
      if (st.trailT <= 0 && this.player.moving) {
        st.trailT = 0.35;
        this.puddles.push({ x: this.player.x, y: this.player.y, r: 14, t: 0, dur: 2.5, tick: 0, damage: 3 * this.power(s), slow: false, bloom: false, dead: false });
      }
    }
    if (s.id === "frost" && this.book.has(s, "capA")) this.updateBlizzard(s, dt);
    else if (s.id === "frost") this.blizzard = 0;
    if (s.id === "storm" && this.book.has(s, "capA")) {
      st.callT -= dt;
      if (st.callT <= 0) {
        st.callT = 1;
        const e = this.nearest(this.player.x, this.player.y, 160);
        if (e) {
          this.bolts.push({ pts: [[e.x + 6, e.y - 120], [e.x, e.y - e.r]], t: 0, dead: false, sky: true });
          this.damage(e, 9 * this.power(s), 0, 0, { storm: s });
        }
      }
    }
    st.castT -= dt;
    if (st.castT > 0) return;
    const cast = this.cast(s, st);
    st.castT = cast > 0 ? cast : 0.1;
  }

  /** Casts a spell; returns the cooldown to wait, or 0 if there was nothing to cast at. */
  private cast(s: OwnedScroll, st: SpellState): number {
    const p = this.player;
    const b = this.book;
    const pw = this.power(s);
    const hs = this.haste(s);
    // Spells leave from the crescent moon on the staff
    const ox = p.x + 9 * p.face;
    const oy = p.y - 24;
    switch (s.id) {
      case "fire": {
        const orb = b.has(s, "formB");
        const target = this.nearest(ox, oy, CFG.fireball.range);
        if (!target) return 0;
        st.casts++;
        let n = 1;
        let dmg = 14 * pw;
        if (b.has(s, "formA")) {
          n = this.roll(4);
          dmg *= 0.7;
          if (n === 4) this.maxRoll(p.x, p.y, 4);
        }
        if (orb) dmg *= 2.5;
        const aim = Math.atan2(target.y - target.r - oy, target.x - ox);
        const spread = 0.24;
        const fire = (a: number) =>
          this.shots.push({
            x: ox, y: oy, vx: Math.cos(a) * (orb ? 120 : 235), vy: Math.sin(a) * (orb ? 120 : 235), life: orb ? 2.2 : 1,
            damage: dmg, r: orb ? 9 : 4, pierce: orb ? 99 : 1, hit: [], dead: false, kind: orb ? "orb" : "fire",
            blast: b.has(s, "impactA"), ignite: b.has(s, "impactB"), homing: b.has(s, "capB"), bounces: b.has(s, "capB") ? 1 : 0,
          });
        for (let i = 0; i < n; i++) fire(aim - ((n - 1) * spread) / 2 + i * spread);
        if (b.has(s, "capA") && st.casts % 4 === 0) for (let i = 0; i < 8; i++) fire((i / 8) * Math.PI * 2);
        this.burst(ox + Math.cos(aim) * 6, oy + Math.sin(aim) * 6, "#ffe46a", 3, 30);
        return 0.7 * hs * (orb ? 1.6 : 1);
      }
      case "frost": {
        const glacier = b.has(s, "formB");
        const area = 52 * (glacier ? 1.5 : 1);
        if (!this.nearest(p.x, p.y, area * 1.5)) return 0;
        st.casts++;
        const waves = b.has(s, "formA") ? this.roll(3) : 1;
        if (waves === 3) this.maxRoll(p.x, p.y, 3);
        for (let i = 0; i < waves; i++)
          this.novas.push({ x: p.x, y: p.y - 6, t: -i * 0.22, r: area * (1 + i * 0.18), damage: 11 * pw, freeze: glacier, hit: new Set(), dead: false });
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          this.parts.push({ x: p.x, y: p.y - 6, vx: Math.cos(a) * area * 2.6, vy: Math.sin(a) * area * 2, life: 0.35, max: 0.35, color: i % 2 ? "#ffffff" : "#8fd8ff", size: 2 });
        }
        if (b.has(s, "impactB"))
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + st.casts * 0.4;
            this.shots.push({ x: p.x, y: p.y - 10, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 0.9, damage: 5 * pw, r: 3, pierce: 2, hit: [], dead: false, kind: "icicle", blast: false, ignite: false, homing: false, bounces: 0 });
          }
        if (b.has(s, "capB") && st.casts % 3 === 0) {
          for (const e of this.enemies) e.freezeT = Math.max(e.freezeT, 1.5);
          this.effect("freeze", p.x, p.y, 1, 0.6);
          this.events.toast("Absolute Zero!", "good");
        }
        return 3 * hs;
      }
      case "storm": {
        const bolt = b.has(s, "formB");
        const endless = b.has(s, "capB");
        const first = this.nearest(p.x, p.y, 200);
        if (!first) return 0;
        let jumps = 2;
        if (b.has(s, "formA")) {
          const r = this.roll(6);
          jumps = r + 1;
          if (r === 6) this.maxRoll(p.x, p.y, 6);
        }
        if (bolt) jumps = 1;
        const hit = new Set<Enemy>();
        const pts: [number, number][] = [[ox, oy]];
        let cur: Enemy | null = first;
        let dmg = 12 * pw * (bolt ? 2.5 : 1);
        for (let i = 0; i <= jumps && cur; i++) {
          hit.add(cur);
          pts.push([cur.x, cur.y - cur.r]);
          this.damage(cur, dmg, cur.x - pts[pts.length - 2][0], cur.y - pts[pts.length - 2][1], { kb: 0.4, storm: s, stun: bolt ? 0.5 : 0 });
          this.effect("spark", cur.x, cur.y - cur.r, 1, 0.16);
          if (b.has(s, "impactA")) {
            const extra = this.nearest(cur.x, cur.y, 60, hit);
            if (extra) {
              this.bolts.push({ pts: [[cur.x, cur.y - cur.r], [extra.x, extra.y - extra.r]], t: 0.05, dead: false });
              this.damage(extra, dmg * 0.5, 0, 0, { storm: s });
            }
          }
          if (endless) dmg *= 1.15;
          cur = this.nearest(cur.x, cur.y, 75 * (endless ? 1.6 : 1), hit);
        }
        this.bolts.push({ pts, t: 0, dead: false });
        return 1.4 * hs;
      }
      case "toxic": {
        if (!this.nearest(p.x, p.y, 170)) return 0;
        const bog = b.has(s, "formB");
        const n = b.has(s, "formA") ? this.roll(3) : 1;
        if (n === 3 && b.has(s, "formA")) this.maxRoll(p.x, p.y, 3);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = i === 0 ? 0 : 30 + Math.random() * 40;
          this.puddles.push({
            x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.8, r: 22 * (bog ? 1.8 : 1), t: 0, dur: 4, tick: 0,
            damage: 6 * pw, slow: bog, bloom: b.has(s, "capB"), dead: false,
          });
        }
        return 2.6 * hs;
      }
    }
    return 0;
  }

  private maxRoll(x: number, y: number, sides: number) {
    this.nums.push({ x, y: y - 44, value: sides, t: 0, style: "max" });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.parts.push({ x, y: y - 30, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.4, max: 0.4, color: "#ffe46a", size: 2 });
    }
  }

  private updateMoons(s: OwnedScroll, st: SpellState, dt: number) {
    const b = this.book;
    const p = this.player;
    const big = b.has(s, "formB");
    if (b.has(s, "formA")) {
      st.rerollT -= dt;
      if (st.rerollT <= 0) {
        st.rerollT = 8;
        const r = this.roll(4);
        st.moons = r + 1;
        if (r === 4) this.maxRoll(p.x, p.y, 4);
      }
    } else st.moons = big ? 1 : 2;
    const spin = 3.2 * (1 + 0.12 * b.rank(s, "haste"));
    this.moonAngle += spin * dt;
    let radius = 32 * (b.has(s, "impactA") ? 1.5 : 1) * (big ? 1.2 : 1);
    if (b.has(s, "capA")) {
      st.eclipseT -= dt;
      if (st.eclipseT <= 0) st.eclipseT = 6;
      if (st.eclipseT < 1.2) radius *= 1 + Math.sin((st.eclipseT / 1.2) * Math.PI) * 2.5;
    }
    this.moons.length = 0;
    const dmg = 9 * this.power(s) * (big ? 3 : 1);
    const rings = b.has(s, "capB") ? 2 : 1;
    for (let ring = 0; ring < rings; ring++) {
      const n = Math.max(1, st.moons);
      const dir = ring === 0 ? 1 : -1;
      const rr = ring === 0 ? radius : radius * 0.62;
      for (let i = 0; i < n; i++) {
        const a = dir * this.moonAngle + (i * Math.PI * 2) / n;
        const x = p.x + Math.cos(a) * rr;
        const y = p.y - 10 + Math.sin(a) * rr * 0.85;
        this.moons.push({ x, y, big });
        const reach = big ? 10 : 6;
        this.forNear(x, y, (e) => {
          if (e.dead || e.moonT > 0) return;
          const rs = e.r + reach;
          if ((e.x - x) ** 2 + (e.y - e.r - y) ** 2 > rs * rs) return;
          e.moonT = 0.5 / (1 + 0.12 * b.rank(s, "haste"));
          this.damage(e, dmg, e.x - p.x, e.y - p.y, { kb: big ? 3 : 1.6, burn: b.has(s, "impactB") ? dmg * 0.4 : 0 });
          this.effect("spark", x, y, 1, 0.16);
        });
      }
    }
  }

  private updateBlizzard(s: OwnedScroll, dt: number) {
    const p = this.player;
    this.blizzard = 48;
    const dmg = 3 * this.power(s) * dt;
    this.forNear(p.x, p.y, (e) => {
      if (e.dead || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > this.blizzard ** 2) return;
      e.chillT = Math.max(e.chillT, 0.4);
      e.hp -= dmg;
      if (e.hp <= 0) this.kill(e);
    }, 2);
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * this.blizzard;
      this.parts.push({ x: p.x + Math.cos(a) * r, y: p.y - 8 + Math.sin(a) * r * 0.8, vx: 30, vy: 20, life: 0.6, max: 0.6, color: "#ffffff", size: 1 });
    }
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
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
        continue;
      }
      if (s.kind !== "icicle" && Math.random() < dt * 40)
        this.parts.push({ x: s.x, y: s.y, vx: -s.vx * 0.05 + (Math.random() - 0.5) * 10, vy: -s.vy * 0.05 + (Math.random() - 0.5) * 10, life: 0.25, max: 0.25, color: Math.random() < 0.5 ? "#ff7a1a" : "#ffe63d", size: s.kind === "orb" ? 2 : 1 });
      this.forNear(s.x, s.y, (e) => {
        if (s.dead || e.dead || s.hit.includes(e)) return;
        const rs = e.r + s.r;
        if ((e.x - s.x) ** 2 + (e.y - e.r * 0.8 - s.y) ** 2 > rs * rs) return;
        s.hit.push(e);
        this.damage(e, s.damage, s.vx, s.vy, { burn: s.ignite ? s.damage * 0.3 : 0, chill: s.kind === "icicle" ? 1.5 : 0 });
        this.effect("spark", s.x, s.y, 1, 0.16);
        if (s.blast) {
          this.effect("blast", s.x, s.y, 1, 0.3);
          this.forNear(s.x, s.y, (o) => {
            if (o === e || o.dead || (o.x - s.x) ** 2 + (o.y - s.y) ** 2 > 26 * 26) return;
            this.damage(o, s.damage * 0.6, o.x - s.x, o.y - s.y, { kb: 0.6 });
          });
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
      if (n.t < 0) continue;
      const r = n.r * Math.min(1, n.t / NOVA_TIME);
      this.forNear(n.x, n.y, (e) => {
        if (e.dead || n.hit.has(e)) return;
        if ((e.x - n.x) ** 2 + (e.y - e.r - n.y) ** 2 > (r + e.r) ** 2) return;
        n.hit.add(e);
        this.damage(e, n.damage, e.x - n.x, e.y - n.y, { kb: 0.7, chill: CFG.chillTime, freeze: n.freeze ? 1 : 0 });
      }, Math.ceil(n.r / HASH));
      if (n.t >= NOVA_TIME + 0.25) n.dead = true;
    }
    for (const b of this.bolts) {
      b.t += dt;
      if (b.t > 0.2) b.dead = true;
    }
  }

  private updatePuddles(dt: number) {
    for (const pd of this.puddles) {
      pd.t += dt;
      pd.tick -= dt;
      if (pd.t >= pd.dur) {
        pd.dead = true;
        if (pd.bloom) {
          this.effect("blast", pd.x, pd.y, pd.r / 22, 0.35);
          this.forNear(pd.x, pd.y, (e) => {
            if (!e.dead && ((e.x - pd.x) / pd.r) ** 2 + ((e.y - pd.y) / (pd.r * 0.7)) ** 2 <= 1.4) this.damage(e, pd.damage * 5, 0, 0, { kb: 0.5 });
          }, Math.ceil(pd.r / HASH) + 1);
        }
        continue;
      }
      this.forNear(pd.x, pd.y, (e) => {
        if (e.dead || ((e.x - pd.x) / pd.r) ** 2 + ((e.y - pd.y) / (pd.r * 0.7)) ** 2 > 1) return;
        e.poisonT = 0;
        if (pd.tick <= 0) this.damage(e, pd.damage, 0, 0, { kb: 0 });
      }, Math.ceil(pd.r / HASH));
      if (pd.tick <= 0) pd.tick = 0.5;
    }
  }

  // ---------- Damage ----------
  private damage(
    e: Enemy, amount: number, dirX: number, dirY: number,
    o: { kb?: number; burn?: number; chill?: number; freeze?: number; stun?: number; storm?: OwnedScroll } = {},
  ) {
    const b = this.book;
    if (e.chillT > 0 && b.has(b.find("frost"), "impactA")) amount *= 1.4;
    if (e.poisonT < 0.6 && b.has(b.find("toxic"), "impactA")) amount *= 1.3;
    e.hp -= amount;
    e.flash = 0.1;
    if (o.burn) {
      e.burnT = CFG.burnTime;
      e.burnDps = Math.max(e.burnDps, o.burn);
    }
    if (o.chill) e.chillT = Math.max(e.chillT, o.chill);
    if (o.freeze) e.freezeT = Math.max(e.freezeT, o.freeze);
    if (o.stun) e.stunT = Math.max(e.stunT, o.stun);
    e.stormHit = !!o.storm;
    const len = Math.hypot(dirX, dirY) || 1;
    const kb = 80 * (o.kb ?? 1) * (e.kind === "king" ? 0.15 : 1);
    e.kx += (dirX / len) * kb;
    e.ky += (dirY / len) * kb;
    this.nums.push({ x: e.x, y: e.y - e.r * 2 - 4, value: Math.max(1, Math.round(amount)), t: 0, style: e.kind === "king" ? "big" : "hit" });
    if (e.hp <= 0 && !e.dead) this.kill(e);
  }

  private kill(e: Enemy) {
    e.dead = true;
    this.kills++;
    const b = this.book;
    const color = CFG.enemies[e.kind].color;
    // Overload: lightning kills explode
    if (e.stormHit && b.has(b.find("storm"), "impactB")) {
      this.effect("blast", e.x, e.y - e.r, 1.2, 0.3);
      this.forNear(e.x, e.y, (o) => {
        if (!o.dead && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 30 * 30) this.damage(o, 8 * this.power(b.find("storm")!), o.x - e.x, o.y - e.y);
      });
    }
    // Contagion: poisoned enemies leave a puddle
    const toxic = b.find("toxic");
    if (e.poisonT < 0.6 && b.has(toxic, "impactB"))
      this.puddles.push({ x: e.x, y: e.y, r: 16, t: 0, dur: 2.5, tick: 0.2, damage: 3 * this.power(toxic!), slow: false, bloom: false, dead: false });
    if (e.kind === "king") {
      this.burst(e.x, e.y - 12, color, 40, 130);
      this.effect("poof", e.x, e.y - 14, 2.4, 0.6);
      this.shake = 4;
      this.hitstop = 0.08;
      for (let i = 0; i < 8; i++) this.gems.push({ x: e.x + (Math.random() - 0.5) * 24, y: e.y + (Math.random() - 0.5) * 24, value: 5, magnet: false, sp: 0, dead: false });
      this.loot.push({ x: e.x, y: e.y, magnet: false, sp: 0, dead: false, t: 0 });
      return;
    }
    this.burst(e.x, e.y - e.r, color, 10, 80);
    this.effect("poof", e.x, e.y - e.r, e.kind === "skel" ? 1.1 : 0.9, 0.42);
    this.gems.push({ x: e.x, y: e.y, value: e.xp, magnet: false, sp: 0, dead: false });
    if (Math.random() < CFG.scrollDropChance * (1 + this.luck)) this.loot.push({ x: e.x, y: e.y, magnet: false, sp: 0, dead: false, t: 0 });
  }

  // ---------- Pickups ----------
  private pull(o: { x: number; y: number; magnet: boolean; sp: number }, dt: number) {
    const p = this.player;
    const dx = p.x - o.x;
    const dy = p.y - 10 - o.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!o.magnet && d < CFG.player.pickupRadius * this.pickupMul) o.magnet = true;
    if (!o.magnet) return false;
    o.sp = Math.max(o.sp + 500 * dt, 60);
    const step = Math.min(d, o.sp * dt);
    o.x += (dx / d) * step;
    o.y += (dy / d) * step;
    return d < 7;
  }

  private updatePickups(dt: number) {
    for (const g of this.gems)
      if (this.pull(g, dt)) {
        g.dead = true;
        this.gainXp(g.value);
      }
    for (const l of this.loot) {
      l.t += dt;
      if (this.pull(l, dt)) {
        l.dead = true;
        this.pendingScrolls++;
        this.effect("ring", this.player.x, this.player.y - 12, 1.4, 0.5);
        this.events.scrollFound();
      }
    }
  }

  private gainXp(v: number) {
    this.xp += v;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.book.points++;
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
  effect(kind: Effect["kind"], x: number, y: number, scale: number, dur: number) {
    this.fx.push({ kind, x, y, t: 0, dur, scale });
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
    if (this.parts.length > 1500) this.parts.splice(0, this.parts.length - 1500);
    k = 0;
    for (const n of this.nums) {
      n.t += dt;
      if (n.t < 0.7) this.nums[k++] = n;
    }
    this.nums.length = k;
    if (this.nums.length > 200) this.nums.splice(0, this.nums.length - 200);
  }
}
