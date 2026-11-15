// Headless playtest: a simple bot plays whole nights so balance can be measured.
// Run with: npm run sim -- [runs] [night] [start]
//   start: a constellation id to always start with (default: cycles through all eight)
import { CFG } from "../src/config";
import { Game } from "../src/game";
import { ALL_CONS, ConId } from "../src/sky";

const runs = Number(process.argv[2] ?? 16);
const night = Number(process.argv[3] ?? 1);
const fixed = process.argv[4] as ConId | undefined;
const TICK = 1 / 60;

/**
 * Steers like a careful player: tries 16 directions, imagines where it and the enemies would be
 * half a second later, and picks the safest one that still heads toward something it wants.
 */
function steer(g: Game) {
  const p = g.player;
  const speed = 92;
  const look = 0.55;
  const near = g.enemies.filter((e) => e.charmT <= 0 && e.dizzyT <= 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 150 * 150);
  // What to walk toward: a fallen star, food when hurt, otherwise the nearest stardust
  let goal: { x: number; y: number } | undefined = g.loot.find((l) => l.kind === "star");
  let pull = 1.2;
  if (!goal && p.hp < p.maxHp * 0.6) goal = g.loot.find((l) => l.kind === "carrot" || l.kind === "feast");
  if (!goal) {
    pull = 0.6;
    let gd = 170 * 170;
    for (const gm of g.gems) {
      const d = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2;
      if (d < gd) {
        gd = d;
        goal = gm;
      }
    }
  }
  let gx = 0;
  let gy = 0;
  if (goal) {
    const d = Math.hypot(goal.x - p.x, goal.y - p.y) || 1;
    gx = (goal.x - p.x) / d;
    gy = (goal.y - p.y) / d;
  }
  let best = -Infinity;
  let bx = 0;
  let by = 0;
  for (let k = 0; k < 17; k++) {
    const a = (k / 16) * Math.PI * 2;
    const dx = k === 16 ? 0 : Math.cos(a);
    const dy = k === 16 ? 0 : Math.sin(a);
    const px = p.x + dx * speed * look;
    const py = p.y + dy * speed * look;
    let danger = 0;
    for (const e of near) {
      // Enemies close in on where you are now; charging boars keep their line
      const ed = Math.hypot(p.x - e.x, p.y - e.y) || 1;
      const charging = e.kind === "boar" && e.ai === 2;
      const es = charging ? 240 : e.kind === "boar" && e.ai === 1 ? 0 : e.speed;
      const ex = e.x + (charging ? e.dirX : (p.x - e.x) / ed) * es * look;
      const ey = e.y + (charging ? e.dirY : (p.y - e.y) / ed) * es * look;
      const d2 = (px - ex) ** 2 + (py - ey) ** 2;
      const reach = e.r + 14;
      danger += ((e.boss >= 0 ? 3 : e.elite ? 2 : 1) * reach * reach) / (d2 + 40);
    }
    for (const sp of g.spits) {
      const sx = sp.x + sp.vx * look;
      const sy = sp.y + sp.vy * look;
      const d2 = (px - sx) ** 2 + (py - 10 - sy) ** 2;
      if (d2 < 60 * 60) danger += 300 / (d2 + 30);
    }
    const score = -danger + (dx * gx + dy * gy) * pull;
    if (score > best) {
      best = score;
      bx = dx;
      by = dy;
    }
  }
  g.input.x = bx;
  g.input.y = by;
}

/** Spends points on a random open star. */
function spend(g: Game) {
  const s = g.sky;
  while (s.points > 0) {
    const opts = s.options();
    if (!opts.length) break;
    s.light(opts[Math.floor(Math.random() * opts.length)]);
  }
}

const times: number[] = [];
const byStart = new Map<string, number[]>();
const dealt = new Map<string, number>();
const levelAt = new Map<number, number[]>();
const dpsAt = new Map<number, number[]>();
const crowdAt = new Map<number, number[]>();
let wins = 0;
for (let r = 0; r < runs; r++) {
  const start = fixed ?? ALL_CONS[r % ALL_CONS.length];
  const g: Game = new Game(
    {
      toast() {},
      levelUp() {},
      starTouched() {},
      gameOver() {},
      victory() {},
    },
    night,
    start,
  );
  let steps = 0;
  let nextMark = 60;
  let lastTotal = 0;
  while (!g.over && !g.won) {
    if (steps++ % 6 === 0) steer(g);
    while (g.pendingStars > 0) {
      g.pendingStars--;
      const o = g.sky.offers(2);
      if (o.length) g.discover(o[Math.floor(Math.random() * o.length)]);
    }
    spend(g);
    g.step(TICK);
    if (g.time >= nextMark) {
      levelAt.set(nextMark, [...(levelAt.get(nextMark) ?? []), g.level]);
      const total = [...g.dealt.values()].reduce((x, y) => x + y, 0);
      dpsAt.set(nextMark, [...(dpsAt.get(nextMark) ?? []), (total - lastTotal) / 60]);
      crowdAt.set(nextMark, [...(crowdAt.get(nextMark) ?? []), g.enemies.length]);
      lastTotal = total;
      nextMark += 60;
    }
  }
  times.push(g.time);
  byStart.set(start, [...(byStart.get(start) ?? []), g.time]);
  if (g.won) wins++;
  for (const [k, v] of g.dealt) dealt.set(k, (dealt.get(k) ?? 0) + v);
  const m = Math.floor(g.time / 60);
  const sec = Math.floor(g.time % 60);
  console.log(
    `run ${String(r + 1).padStart(2)} ${start.padEnd(5)}: ${m}:${String(sec).padStart(2, "0")}  stars ${g.sky.earned}/${g.sky.spent}  kills ${g.kills}` +
      `${g.won ? "  DAWN" : "  by " + g.lastHitBy}  [${g.sky.found.slice(1).join(" ")}]`,
  );
}
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`\nnight ${night}: average ${fmt(avg(times))} of ${fmt(CFG.nightLength)}, reached dawn ${wins}/${runs}`);
console.log("by first constellation:", [...byStart].map(([k, v]) => `${k} ${fmt(avg(v))}`).join(", "));
console.log("stars earned by minute:", [...levelAt].map(([t, v]) => `${t / 60}m:${(avg(v) - 1).toFixed(1)}`).join(" "));
console.log("damage per second by minute:", [...dpsAt].map(([t, v]) => `${t / 60}m:${Math.round(avg(v))}`).join(" "));
console.log("enemies alive by minute:", [...crowdAt].map(([t, v]) => `${t / 60}m:${Math.round(avg(v))}`).join(" "));
const total = [...dealt.values()].reduce((a, v) => a + v, 0) || 1;
console.log("damage share:", [...dealt].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join(", "));
