import { CFG, EnemyKind } from "./config";
import { pickDie } from "./dice";
import { Bag, fireballStats, makeDie, makeScroll } from "./inventory";

export interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  /** Knockback velocity, which decays quickly. */
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
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  pierce: number;
  hit: Enemy[];
  dead: boolean;
}

export interface Gem {
  x: number;
  y: number;
  value: number;
  magnet: boolean;
  sp: number;
  dead: boolean;
}

export interface DiePickup {
  x: number;
  y: number;
  faces: number;
  magnet: boolean;
  sp: number;
  /** Seconds before it can be picked up again (after "bag full"). */
  wait: number;
  dead: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface DamageNumber {
  x: number;
  y: number;
  value: number;
  t: number;
  big: boolean;
}

export interface GameEvents {
  toast(msg: string, kind?: "good" | "warn" | "gold"): void;
  bagChanged(): void;
  gameOver(): void;
}

const HASH_CELL = 24;
const hashKey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);

function compact<T extends { dead: boolean }>(arr: T[]) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
  arr.length = j;
}

export class Game {
  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  over = false;
  hitstop = 0;
  shake = 0;
  viewW = CFG.minViewW;
  viewH = CFG.minViewH;
  /** Movement input, length 0..1. */
  input = { x: 0, y: 0 };

  player = { x: 0, y: 0, vx: 0, vy: 0, hp: CFG.player.maxHp, maxHp: CFG.player.maxHp, inv: 0, moving: false };
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  gems: Gem[] = [];
  dice: DiePickup[] = [];
  parts: Particle[] = [];
  nums: DamageNumber[] = [];
  bag = new Bag();

  private castT = 0.4;
  private spawnAcc = 0;
  private nextKing = CFG.spawn.kingFirst;
  private hash = new Map<number, Enemy[]>();
  private pool: Enemy[][] = [];

  constructor(private events: GameEvents) {
    this.bag.add(makeScroll());
    this.bag.add(makeDie(CFG.dice.starting));
  }

  get xpNeeded() {
    return CFG.xp.base + CFG.xp.perLevel * (this.level - 1);
  }

  get stats() {
    return fireballStats(this.bag.scroll, this.level);
  }

  step(dt: number) {
    if (this.over) return;
    this.shake = Math.max(0, this.shake - 24 * dt);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time += dt;
    this.updatePlayer(dt);
    this.spawn(dt);
    this.buildHash();
    this.updateEnemies(dt);
    this.cast(dt);
    this.updateShots(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    compact(this.enemies);
    compact(this.shots);
    compact(this.gems);
    compact(this.dice);
  }

  // ---------- Player ----------

  private updatePlayer(dt: number) {
    const p = this.player;
    const c = CFG.player;
    const tx = this.input.x * c.speed;
    const ty = this.input.y * c.speed;
    const moving = tx !== 0 || ty !== 0;
    const dx = tx - p.vx;
    const dy = ty - p.vy;
    const len = Math.hypot(dx, dy);
    const maxStep = (moving ? c.accel : c.friction) * dt;
    if (len <= maxStep) {
      p.vx = tx;
      p.vy = ty;
    } else {
      p.vx += (dx / len) * maxStep;
      p.vy += (dy / len) * maxStep;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.moving = moving;
    p.inv = Math.max(0, p.inv - dt);
  }

  private hurt(amount: number) {
    const p = this.player;
    p.hp -= amount;
    p.inv = CFG.player.iframes;
    this.shake = 3;
    this.hitstop = 0.05;
    this.burst(p.x, p.y - 6, "#ff3d4a", 8, 60);
    if (p.hp <= 0) {
      p.hp = 0;
      this.over = true;
      this.burst(p.x, p.y - 6, "#3d7dff", 24, 90);
      this.events.gameOver();
    }
  }

  // ---------- Spawning ----------

  private spawn(dt: number) {
    const s = CFG.spawn;
    const rate = Math.min(s.maxRate, s.startRate + (s.ratePerMin * this.time) / 60);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length < s.maxEnemies) this.spawnEnemy(this.pickKind());
    }
    if (this.time >= this.nextKing) {
      this.nextKing += s.kingEvery;
      this.spawnEnemy("king");
      this.events.toast("A King Slime appeared! It's carrying a die.", "gold");
    }
  }

  private pickKind(): EnemyKind {
    const s = CFG.spawn;
    const bat = this.time > s.batsAfter ? 4 : 0;
    const skel = this.time > s.skeletonsAfter ? 2 + this.time / 60 : 0;
    let r = Math.random() * (6 + bat + skel);
    if ((r -= 6) < 0) return "slime";
    if ((r -= bat) < 0) return "bat";
    return "skel";
  }

  private ringPoint(): { x: number; y: number } {
    const a = Math.random() * Math.PI * 2;
    const d = Math.hypot(this.viewW, this.viewH) / 2 + 16;
    return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
  }

  spawnEnemy(kind: EnemyKind) {
    const t = CFG.enemies[kind];
    const hpScale = 1 + (CFG.spawn.hpPerMin * this.time) / 60;
    const { x, y } = this.ringPoint();
    const hp = t.hp * hpScale;
    this.enemies.push({
      kind, x, y, kx: 0, ky: 0, hp, maxHp: hp, r: t.radius, speed: t.speed * (0.9 + Math.random() * 0.2),
      damage: t.damage, xp: t.xp, flash: 0, phase: Math.random() * 10, dead: false,
    });
  }

  // ---------- Enemies ----------

  private buildHash() {
    for (const arr of this.hash.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.hash.clear();
    for (const e of this.enemies) {
      const k = hashKey(Math.floor(e.x / HASH_CELL), Math.floor(e.y / HASH_CELL));
      let a = this.hash.get(k);
      if (!a) {
        a = this.pool.pop() ?? [];
        this.hash.set(k, a);
      }
      a.push(e);
    }
  }

  private forNear(x: number, y: number, fn: (e: Enemy) => void) {
    const cx = Math.floor(x / HASH_CELL);
    const cy = Math.floor(y / HASH_CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const a = this.hash.get(hashKey(cx + dx, cy + dy));
        if (a) for (let i = 0; i < a.length; i++) fn(a[i]);
      }
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    const decay = Math.exp(-9 * dt);
    const farAway = Math.hypot(this.viewW, this.viewH) * 0.75 + 60;
    for (const e of this.enemies) {
      if (e.dead) continue;
      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      e.x += (dx * e.speed + e.kx) * dt;
      e.y += (dy * e.speed + e.ky) * dt;
      e.kx *= decay;
      e.ky *= decay;
      e.flash = Math.max(0, e.flash - dt);

      // Soft separation so the horde spreads out instead of stacking.
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

      // Enemies left far behind get moved back near the player.
      if (d > farAway && e.kind !== "king") {
        const pt = this.ringPoint();
        e.x = pt.x;
        e.y = pt.y;
      }

      if (d < e.r + CFG.player.radius && p.inv <= 0 && !this.over) this.hurt(e.damage);
    }
  }

  // ---------- Fireball ----------

  private cast(dt: number) {
    this.castT -= dt;
    if (this.castT > 0) return;
    const p = this.player;
    const fb = CFG.fireball;
    let best: Enemy | null = null;
    let bestD = fb.range * fb.range;
    for (const e of this.enemies) {
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) {
      this.castT = 0.05;
      return;
    }
    const st = this.stats;
    const ox = p.x;
    const oy = p.y - 7;
    const aim = Math.atan2(best.y - oy, best.x - ox);
    const n = st.count;
    const spread = (fb.spreadDeg * Math.PI) / 180;
    const fanWidth = (n - 1) * spread;
    const ring = fanWidth >= (fb.fullCircleDeg * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? aim : ring ? aim + (i * Math.PI * 2) / n : aim - fanWidth / 2 + i * spread;
      this.shots.push({
        x: ox, y: oy, vx: Math.cos(a) * fb.speed, vy: Math.sin(a) * fb.speed, life: fb.life,
        damage: st.damage, pierce: fb.pierce, hit: [], dead: false,
      });
    }
    this.burst(ox + Math.cos(aim) * 6, oy + Math.sin(aim) * 6, "#ffe63d", 3, 30);
    this.castT += st.cooldown;
  }

  private updateShots(dt: number) {
    const fb = CFG.fireball;
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) {
        s.dead = true;
        continue;
      }
      if (Math.random() < dt * 40)
        this.parts.push({
          x: s.x, y: s.y, vx: -s.vx * 0.05 + (Math.random() - 0.5) * 10, vy: -s.vy * 0.05 + (Math.random() - 0.5) * 10,
          life: 0.25, max: 0.25, color: Math.random() < 0.5 ? "#ff7a1a" : "#ffe63d", size: 1,
        });
      this.forNear(s.x, s.y, (e) => {
        if (s.dead || e.dead || s.hit.includes(e)) return;
        const rs = e.r + fb.radius;
        if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > rs * rs) return;
        s.hit.push(e);
        this.damage(e, s.damage, s.vx, s.vy);
        this.burst(s.x, s.y, "#ff7a1a", 4, 50);
        if (s.pierce-- <= 0) s.dead = true;
      });
    }
  }

  private damage(e: Enemy, amount: number, dirX: number, dirY: number) {
    e.hp -= amount;
    e.flash = 0.1;
    const len = Math.hypot(dirX, dirY) || 1;
    const kb = CFG.fireball.knockback * (e.kind === "king" ? 0.15 : 1);
    e.kx += (dirX / len) * kb;
    e.ky += (dirY / len) * kb;
    this.nums.push({ x: e.x, y: e.y - e.r - 6, value: Math.max(1, Math.round(amount)), t: 0, big: e.kind === "king" });
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Enemy) {
    e.dead = true;
    this.kills++;
    const color = CFG.enemies[e.kind].color;
    if (e.kind === "king") {
      this.burst(e.x, e.y, color, 30, 110);
      this.shake = 4;
      this.hitstop = 0.08;
      for (let i = 0; i < 8; i++) this.dropGem(e.x + (Math.random() - 0.5) * 24, e.y + (Math.random() - 0.5) * 24, 5);
      this.dropDie(e.x, e.y, pickDie(CFG.dice.kingWeights));
      return;
    }
    this.burst(e.x, e.y, color, 8, 70);
    this.dropGem(e.x, e.y, e.xp);
    if (Math.random() < CFG.dice.dropChance) this.dropDie(e.x, e.y, pickDie(CFG.dice.weights));
  }

  // ---------- Pickups ----------

  private dropGem(x: number, y: number, value: number) {
    this.gems.push({ x, y, value, magnet: false, sp: 0, dead: false });
  }

  dropDie(x: number, y: number, faces: number) {
    this.dice.push({ x, y, faces, magnet: false, sp: 0, wait: 0, dead: false });
  }

  private pull(o: { x: number; y: number; magnet: boolean; sp: number }, dt: number): boolean {
    const p = this.player;
    const dx = p.x - o.x;
    const dy = p.y - 4 - o.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!o.magnet && d < CFG.player.pickupRadius) o.magnet = true;
    if (!o.magnet) return false;
    o.sp = Math.max(o.sp + 500 * dt, 60);
    const step = Math.min(d, o.sp * dt);
    o.x += (dx / d) * step;
    o.y += (dy / d) * step;
    return d < 6;
  }

  private updatePickups(dt: number) {
    for (const g of this.gems) {
      if (this.pull(g, dt)) {
        g.dead = true;
        this.gainXp(g.value);
      }
    }
    for (const d of this.dice) {
      if (d.wait > 0) {
        d.wait -= dt;
        d.magnet = false;
        d.sp = 0;
        continue;
      }
      if (this.pull(d, dt)) {
        if (this.bag.add(makeDie(d.faces))) {
          d.dead = true;
          this.burst(d.x, d.y, "#ffd23d", 12, 60);
          this.events.toast(`Picked up a d${d.faces}! Open your bag to roll it.`, "gold");
          this.events.bagChanged();
        } else {
          d.wait = 3;
          this.events.toast("Your bag is full! Make space to grab that die.", "warn");
        }
      }
    }
  }

  private gainXp(v: number) {
    this.xp += v;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      const p = this.player;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        this.parts.push({ x: p.x, y: p.y - 6, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: 0.4, max: 0.4, color: "#3df0ff", size: 2 });
      }
      this.events.toast(`Level ${this.level}! Fireball damage +${Math.round(CFG.fireball.damagePerLevel * 100)}%`, "good");
    }
  }

  // ---------- Effects ----------

  burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const life = 0.25 + Math.random() * 0.25;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: Math.random() < 0.3 ? 2 : 1 });
    }
  }

  private updateFx(dt: number) {
    const drag = Math.exp(-5 * dt);
    let j = 0;
    for (const pt of this.parts) {
      pt.life -= dt;
      if (pt.life <= 0) continue;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= drag;
      pt.vy *= drag;
      this.parts[j++] = pt;
    }
    this.parts.length = j;
    if (this.parts.length > 1500) this.parts.splice(0, this.parts.length - 1500);
    j = 0;
    for (const n of this.nums) {
      n.t += dt;
      if (n.t < 0.7) this.nums[j++] = n;
    }
    this.nums.length = j;
  }
}
