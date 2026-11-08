// Headless playtest: a simple bot plays full runs so balance can be measured.
// Run with: npm run sim -- [runs] [maxMinutes]
import { SCROLLS } from "../src/content";
import { rollDie } from "../src/dice";
import { Game } from "../src/game";
import { Item, ScrollItem, makeNumber } from "../src/inventory";

const runs = Number(process.argv[2] ?? 8);
const maxMin = Number(process.argv[3] ?? 15);
const TICK = 1 / 60;

type Bot = (g: Game) => void;

/** Picks level-up rewards: new attack scrolls first, then merges, then gear. */
function choose(g: Game, offers: Item[]): Item {
  const owned = new Set(g.bag.items.map((i) => (i.kind === "scroll" || i.kind === "gear" ? i.def : "")));
  const score = (it: Item) => {
    if (it.kind === "scroll") return SCROLLS[it.def].utility ? 2 : owned.has(it.def) ? 4 : 6;
    if (it.kind === "gear") return owned.has(it.def) ? 3 : 2.5;
    return 0;
  };
  return offers.slice().sort((a, b) => score(b) - score(a))[0];
}

/** Merges matching items and rolls dice into the best scroll's sockets. */
function tidy(g: Game) {
  const bag = g.bag;
  let merged = true;
  while (merged) {
    merged = false;
    for (const a of bag.items)
      for (const b of bag.items)
        if ((a.kind === "scroll" || a.kind === "gear") && (b.kind === "scroll" || b.kind === "gear") && bag.canMerge(a, b)) {
          for (const n of bag.merge(a, b)) bag.add(n);
          merged = true;
          break;
        }
  }
  for (const d of bag.items.filter((i) => i.kind === "die")) {
    if (d.kind !== "die") continue;
    bag.remove(d);
    bag.add(makeNumber(rollDie(d.faces), d.faces));
  }
  const attack = bag.scrolls.filter((s) => !SCROLLS[s.def].utility).sort((a, b) => b.tier - a.tier);
  for (const n of bag.items.filter((i) => i.kind === "number")) {
    if (n.kind !== "number") continue;
    let best: ScrollItem | null = null;
    let key: "count" | "speed" = "count";
    for (const s of attack)
      for (const k of ["count", "speed"] as const) {
        const cur = s.sockets[k]?.value ?? 0;
        if (n.value > cur && (!best || cur < (best.sockets[key]?.value ?? 0))) {
          best = s;
          key = k;
        }
      }
    bag.remove(n);
    if (best) {
      const old = best.sockets[key];
      best.sockets[key] = n;
      if (old) bag.add(old);
    }
  }
  // Drop leftover numbers so they do not clog the bag
  for (const n of bag.items.filter((i) => i.kind === "number")) bag.remove(n);
  g.refreshLoadout();
}

/** Kites: moves away from nearby enemies, drifts toward gems, circles when crowded. */
const kiter: Bot = (g) => {
  const p = g.player;
  let ax = 0;
  let ay = 0;
  for (const e of g.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 110 * 110 || d2 === 0) continue;
    const w = 1 / d2;
    ax += dx * w * (e.kind === "king" ? 3 : 1);
    ay += dy * w * (e.kind === "king" ? 3 : 1);
  }
  let best = null as null | { x: number; y: number };
  let bd = 160 * 160;
  for (const gm of g.gems) {
    const d = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2;
    if (d < bd) {
      bd = d;
      best = gm;
    }
  }
  for (const d of g.dice) best = d;
  const threat = Math.hypot(ax, ay);
  let x = ax / (threat || 1);
  let y = ay / (threat || 1);
  if (best && threat < 0.02) {
    x = best.x - p.x;
    y = best.y - p.y;
  }
  // Strafe sideways a bit so the bot does not run in a straight line forever
  const t = g.time * 0.4;
  x += Math.cos(t) * 0.35;
  y += Math.sin(t) * 0.35;
  const len = Math.hypot(x, y) || 1;
  g.input.x = x / len;
  g.input.y = y / len;
};

const results: { t: number; level: number; kills: number; dice: number }[] = [];
for (let r = 0; r < runs; r++) {
  const events = { toast() {}, bagChanged() {}, gameOver() {} };
  const g = new Game(events);
  const hooks = g as unknown as { autoPlay?: (g: Game) => void };
  let steps = 0;
  while (!g.over && g.time < maxMin * 60) {
    if (steps++ % 6 === 0) kiter(g);
    hooks.autoPlay?.(g);
    while (g.pendingLevels > 0) {
      g.grant(choose(g, g.rollOffers()));
      if (g.bag.pending) g.bag.pending = null;
      tidy(g);
    }
    if (steps % 120 === 0) tidy(g);
    g.step(TICK);
  }
  results.push({ t: g.time, level: g.level, kills: g.kills, dice: 0 });
  const build = g.bag.items.filter((i) => i.kind === "scroll" || i.kind === "gear").map((i) => (i.kind === "scroll" || i.kind === "gear" ? `${i.def}${i.tier > 1 ? i.tier : ""}` : "")).join(" ");
  const m = Math.floor(g.time / 60);
  const s = Math.floor(g.time % 60);
  console.log(`run ${r + 1}: ${m}:${String(s).padStart(2, "0")}  level ${g.level}  kills ${g.kills}${g.won ? "  WON" : g.over ? "" : "  (time limit)"}  [${build}]`);
}
const avg = results.reduce((a, r) => a + r.t, 0) / results.length;
console.log(`average survival ${Math.floor(avg / 60)}:${String(Math.floor(avg % 60)).padStart(2, "0")}`);
