// Headless playtest: a simple bot plays full runs so balance can be measured.
// Run with: npm run sim -- [runs] [maxMinutes] [maxScrolls]
import { SCROLLS } from "../src/content";
import { Game } from "../src/game";

const runs = Number(process.argv[2] ?? 8);
const maxMin = Number(process.argv[3] ?? 16);
/** How many scroll slots the bot fills; fewer means it keeps the empty-slot bonus. */
const maxScrolls = Number(process.argv[4] ?? 3);
const TICK = 1 / 60;

/** Kites away from nearby enemies, drifts toward gems and scrolls, circles when crowded. */
function steer(g: Game) {
  const p = g.player;
  let ax = 0;
  let ay = 0;
  for (const e of g.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 110 * 110 || d2 === 0) continue;
    const w = (e.kind === "king" ? 3 : 1) / d2;
    ax += dx * w;
    ay += dy * w;
  }
  let best: { x: number; y: number } | null = null;
  let bd = 160 * 160;
  for (const gm of g.gems) {
    const d = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2;
    if (d < bd) {
      bd = d;
      best = gm;
    }
  }
  for (const l of g.loot) best = l;
  const threat = Math.hypot(ax, ay);
  let x = ax / (threat || 1);
  let y = ay / (threat || 1);
  if (best && threat < 0.02) {
    x = best.x - p.x;
    y = best.y - p.y;
  }
  x += Math.cos(g.time * 0.4) * 0.35;
  y += Math.sin(g.time * 0.4) * 0.35;
  const len = Math.hypot(x, y) || 1;
  g.input.x = x / len;
  g.input.y = y / len;
}

/** Spends points: ranks in Power first, then whatever else is open, picking forks at random. */
function spend(g: Game) {
  const b = g.book;
  while (b.points > 0) {
    const opts = b.options();
    if (!opts.length) break;
    const power = opts.filter((o) => o.node.id.endsWith(".power") && !SCROLLS[o.s.id].support);
    const pick = power.length && Math.random() < 0.5 ? power[0] : opts[Math.floor(Math.random() * opts.length)];
    b.learn(pick.s, pick.node);
  }
}

function takeScroll(g: Game) {
  const b = g.book;
  while (g.pendingScrolls > 0) {
    g.pendingScrolls--;
    const slot = b.firstEmpty();
    if (slot < 0 || b.owned.length >= maxScrolls) continue;
    const pool = b.missing();
    if (pool.length) b.put(slot, pool[Math.floor(Math.random() * pool.length)]);
  }
}

const results: number[] = [];
let wins = 0;
for (let r = 0; r < runs; r++) {
  const g = new Game({ toast() {}, levelUp() {}, scrollFound() {}, gameOver() {} });
  let steps = 0;
  while (!g.over && g.time < maxMin * 60) {
    if (steps++ % 6 === 0) steer(g);
    takeScroll(g);
    spend(g);
    g.step(TICK);
  }
  results.push(g.time);
  if (g.won) wins++;
  const build = g.book.owned.map((s) => `${s.id}:${s.spent}`).join(" ");
  const m = Math.floor(g.time / 60);
  const sec = Math.floor(g.time % 60);
  console.log(`run ${r + 1}: ${m}:${String(sec).padStart(2, "0")}  level ${g.level}  kills ${g.kills}${g.won ? "  WON" : ""}  [${build}]`);
}
const avg = results.reduce((a, t) => a + t, 0) / results.length;
console.log(`average ${Math.floor(avg / 60)}:${String(Math.floor(avg % 60)).padStart(2, "0")}, wins ${wins}/${runs}`);
