// Headless playtest: a simple bot plays full runs so balance can be measured.
// Run with: npm run sim -- [runs] [maxMinutes] [style]
//   style "random": takes any open node; "notable" (default): heads for named nodes.
import { ELEMENTS, NODE, TREE } from "../src/content";
import { Game } from "../src/game";

const runs = Number(process.argv[2] ?? 8);
const maxMin = Number(process.argv[3] ?? 16);
const style = process.argv[4] ?? "notable";
/** Pass "endless" to keep playing past the end of the run. */
const endless = process.argv[5] === "endless";
const TICK = 1 / 60;

/** Kites away from nearby enemies, drifts toward gems and scrolls, sidesteps spores. */
function steer(g: Game) {
  const p = g.player;
  let ax = 0;
  let ay = 0;
  for (const e of g.enemies) {
    if (e.charmT > 0) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 110 * 110 || d2 === 0) continue;
    const w = (e.kind === "king" || e.elite ? 3 : e.kind === "boar" && e.ai > 0 ? 4 : 1) / d2;
    ax += dx * w;
    ay += dy * w;
  }
  for (const sp of g.spits) {
    const dx = p.x - sp.x;
    const dy = p.y - 10 - sp.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 60 * 60) continue;
    ax += ((-sp.vy / 78) * 1.5) / Math.sqrt(d2 + 1);
    ay += ((sp.vx / 78) * 1.5) / Math.sqrt(d2 + 1);
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

/** Spends points. The "notable" bot walks toward the nearest named node, like a player with a plan. */
function spend(g: Game) {
  const b = g.book;
  while (b.points > 0) {
    const opts = b.options();
    if (!opts.length) break;
    let pick = opts[Math.floor(Math.random() * opts.length)];
    if (style !== "random") {
      const big = opts.filter((n) => n.kind !== "small");
      if (big.length) pick = big[Math.floor(Math.random() * big.length)];
      else {
        // Step toward the closest notable that isn't taken yet
        const goals = TREE.filter((n) => n.kind !== "small" && b.state(n) !== "taken" && b.state(n) !== "sealed");
        let bestD = Infinity;
        for (const o of opts)
          for (const goal of goals) {
            const d = Math.hypot(o.x - goal.x, o.y - goal.y);
            if (d < bestD) {
              bestD = d;
              pick = o;
            }
          }
      }
    }
    b.take(pick);
  }
}

function takeScroll(g: Game) {
  const b = g.book;
  while (g.pendingScrolls > 0) {
    g.pendingScrolls--;
    const offers = b.offers(3);
    if (!offers.length) b.points++;
    else b.addScroll(offers[0]);
  }
}

const results: number[] = [];
const dealt = new Map<string, number>();
const overtime: number[] = [];
let wins = 0;
for (let r = 0; r < runs; r++) {
  const start = ELEMENTS[r % ELEMENTS.length];
  const g: Game = new Game({ toast() {}, levelUp() {}, scrollFound() {}, gameOver() {}, ...(endless ? { victory: () => g.keepGoing() } : {}) }, start);
  let steps = 0;
  while (!g.over && g.time < maxMin * 60) {
    if (steps++ % 6 === 0) steer(g);
    takeScroll(g);
    spend(g);
    g.step(TICK);
  }
  results.push(g.time);
  if (g.won) wins++;
  for (const [k, v] of g.dealt) dealt.set(k, (dealt.get(k) ?? 0) + v);
  if (endless && g.won) overtime.push(g.time - 900);
  const notables = [...g.book.taken].map((id) => NODE.get(id)!).filter((n) => n.kind !== "small" && n.kind !== "start").length;
  const m = Math.floor(g.time / 60);
  const sec = Math.floor(g.time % 60);
  console.log(
    `run ${r + 1} ${start.padEnd(5)}: ${m}:${String(sec).padStart(2, "0")}  level ${g.level}  kills ${g.kills}${g.won ? "  WON" : "  by " + g.lastHitBy}` +
      `  scrolls [${[...g.book.scrolls].join(" ")}]  regions ${g.book.unsealed.size}  named nodes ${notables}`,
  );
}
const byEl = new Map<string, number[]>();
results.forEach((t, i) => {
  const el = ELEMENTS[i % ELEMENTS.length];
  byEl.set(el, [...(byEl.get(el) ?? []), t]);
});
console.log("by element:", [...byEl].map(([el, ts]) => `${el} ${Math.floor(ts.reduce((a, b) => a + b, 0) / ts.length / 60)}:${String(Math.floor((ts.reduce((a, b) => a + b, 0) / ts.length) % 60)).padStart(2, "0")}`).join(", "));
const avg = results.reduce((a, t) => a + t, 0) / results.length;
console.log(`average ${Math.floor(avg / 60)}:${String(Math.floor(avg % 60)).padStart(2, "0")}, wins ${wins}/${runs}`);
if (endless) console.log("overtime survived:", overtime.map((t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`).join(" "));
const total = [...dealt.values()].reduce((a, v) => a + v, 0) || 1;
console.log("damage share:", [...dealt].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join(", "));
