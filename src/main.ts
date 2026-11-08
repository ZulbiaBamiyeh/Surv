import "./style.css";
import { BackpackUI } from "./backpack";
import { CFG } from "./config";
import { pickDie } from "./dice";
import { spriteURL } from "./art";
import { GEAR, SCROLLS } from "./content";
import { Item, itemName, makeDie, makeGear, makeScroll } from "./inventory";
import { Game } from "./game";
import { Joystick, Renderer } from "./render";

const app = document.getElementById("app")!;
app.innerHTML = `
  <canvas id="game" aria-label="Game"></canvas>
  <div class="topbar">
    <div class="xp"><div class="xp-fill"></div></div>
    <div class="topbar-row">
      <span class="chip level">LV <b>1</b></span>
      <span class="timer">0:00</span>
      <span class="chip kills"><i aria-hidden="true"></i><b>0</b></span>
    </div>
  </div>
  <div class="hud">
    <button class="btn bag-btn" type="button" aria-label="Open backpack">
      Bag <kbd>Tab</kbd><span class="badge" hidden></span>
    </button>
  </div>
  <div class="toasts" aria-live="polite"></div>
  <div class="intro panel">
    <span class="keys-only"><b>Move</b> with WASD or the arrow keys.
    Fireball casts by itself. You start with a <b>d6</b>: press <kbd>Tab</kbd> to open your bag and roll it.</span>
    <span class="touch-only"><b>Drag</b> anywhere to move. Fireball casts by itself.
    You start with a <b>d6</b>: tap <b>Bag</b> to roll it.</span>
  </div>
  <div class="overlay levelup-overlay" hidden>
    <div class="panel levelup-panel" role="dialog" aria-label="Level up">
      <h2>Level <span class="lv"></span>!</h2>
      <p class="sub">Choose one for your bag.</p>
      <div class="offers"></div>
    </div>
  </div>
  <div class="overlay over-overlay" hidden>
    <div class="panel over-panel">
      <h2>Bonked!</h2>
      <p class="over-stats"></p>
      <button class="btn retry-btn" type="button">Try again <kbd>R</kbd></button>
    </div>
  </div>`;

const canvas = app.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d", { alpha: false })!;
const toastsEl = app.querySelector<HTMLElement>(".toasts")!;
const badge = app.querySelector<HTMLElement>(".badge")!;
const intro = app.querySelector<HTMLElement>(".intro")!;
const overEl = app.querySelector<HTMLElement>(".over-overlay")!;
const overStats = app.querySelector<HTMLElement>(".over-stats")!;
const levelEl2 = app.querySelector<HTMLElement>(".levelup-overlay")!;
const offersEl = app.querySelector<HTMLElement>(".offers")!;
const xpFill = app.querySelector<HTMLElement>(".xp-fill")!;
const levelEl = app.querySelector<HTMLElement>(".level b")!;
const timerEl = app.querySelector<HTMLElement>(".timer")!;
const killsEl = app.querySelector<HTMLElement>(".kills b")!;
let hudCache = "";
function updateHud() {
  const sec = Math.floor(game.time);
  const xp = Math.round((game.xp / game.xpNeeded) * 200);
  const key = `${sec}|${game.level}|${game.kills}|${xp}`;
  if (key === hudCache) return;
  hudCache = key;
  xpFill.style.width = xp / 2 + "%";
  levelEl.textContent = String(game.level);
  timerEl.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  killsEl.textContent = String(game.kills);
}

// ---------- Toasts ----------

function toast(msg: string, kind?: "good" | "warn" | "gold") {
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  toastsEl.append(el);
  while (toastsEl.children.length > 3) toastsEl.firstElementChild!.remove();
  window.setTimeout(() => el.classList.add("out"), 2600);
  window.setTimeout(() => el.remove(), 3000);
}

// ---------- Game setup ----------

const events = {
  toast,
  bagChanged: () => updateBadge(),
  levelUp: () => {},
  gameOver: () => {
    const t = game.time;
    overEl.querySelector("h2")!.textContent = game.won ? "You survived!" : "Bonked!";
    overStats.textContent = game.won
      ? `You made it through all ${Math.round(CFG.runLength / 60)} minutes at level ${game.level}, bonking ${game.kills} enemies.`
      : `You lasted ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}, reached level ${game.level} and bonked ${game.kills} enemies.`;
    window.setTimeout(() => (overEl.hidden = false), 600);
  },
};

let game = new Game(events);
const renderer = new Renderer();
const bag = new BackpackUI(renderer.art, game, toast, () => updateBadge(), () => toggleBag(false));
app.appendChild(bag.root);
app.querySelector<HTMLElement>(".kills i")!.style.backgroundImage = `url(${spriteURL(renderer.art.slime[0], 2)})`;

// ---------- Level-up choices ----------

let levelOpen = false;
let offers: Item[] = [];
function showLevelUp() {
  levelOpen = true;
  keys.clear();
  offers = game.rollOffers();
  levelEl2.querySelector(".lv")!.textContent = String(game.level - game.pendingLevels + 1);
  const owned = game.bag.items;
  offersEl.replaceChildren(
    ...offers.map((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "offer";
      if (it.kind !== "scroll" && it.kind !== "gear") return b;
      const isScroll = it.kind === "scroll";
      const def = isScroll ? SCROLLS[it.def] : GEAR[it.def];
      const tag = isScroll ? (SCROLLS[it.def].utility ? "Utility scroll" : "Spell scroll") : GEAR[it.def].adjacent ? "Gear · Touching" : "Gear";
      const match = owned.find((o) => (o.kind === "scroll" || o.kind === "gear") && o.def === it.def);
      const img = isScroll ? renderer.art.scrolls.get(it.def)! : renderer.art.gear.get(it.def)!;
      b.innerHTML = `
        <span class="offer-key">${i + 1}</span>
        <img src="${spriteURL(img, 4)}" alt="" class="px">
        <span class="offer-tag">${tag}</span>
        <b class="offer-name">${def.name}</b>
        <span class="offer-desc">${def.desc}</span>
        ${match ? `<span class="offer-merge">Merges with your ${def.name}</span>` : '<span class="offer-new">New!</span>'}`;
      b.addEventListener("click", () => pickOffer(i));
      return b;
    }),
  );
  levelEl2.hidden = false;
  (offersEl.firstElementChild as HTMLElement | null)?.focus();
}

function pickOffer(i: number) {
  const it = offers[i];
  if (!it || !levelOpen) return;
  levelOpen = false;
  levelEl2.hidden = true;
  const result = game.grant(it);
  const name = itemName(it);
  if (result === "merged") toast(`${name} merged into a stronger tier!`, "gold");
  else if (result === "placed") toast(`${name} added to your bag.`, "good");
  else {
    toast(`Your bag is full. Make room for ${name}.`, "warn");
    toggleBag(true);
  }
  updateBadge();
}

function updateBadge() {
  const n = game.bag.unrolledDice + (game.bag.pending && game.bag.pending.kind !== "die" ? 1 : 0);
  badge.hidden = n === 0;
  badge.textContent = String(n);
}
updateBadge();

function toggleBag(open = !bag.isOpen) {
  if (game.over || levelOpen) return;
  if (open) bag.open();
  else bag.close();
  keys.clear();
}

function restart() {
  levelOpen = false;
  levelEl2.hidden = true;
  game = new Game(events);
  bag.game = game;
  overEl.hidden = true;
  updateBadge();
  resize();
}

app.querySelector(".bag-btn")!.addEventListener("click", () => toggleBag());
app.querySelector(".retry-btn")!.addEventListener("click", restart);

// ---------- Input ----------

const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  if (e.code === "Tab" || e.code === "KeyB" || e.code === "KeyI") {
    e.preventDefault();
    toggleBag();
    return;
  }
  if (levelOpen && ["Digit1", "Digit2", "Digit3"].includes(e.code)) return pickOffer(Number(e.code.slice(5)) - 1);
  if (levelOpen) return;
  if (e.code === "Escape" && bag.isOpen) return toggleBag(false);
  if (e.code === "KeyR" && game.over) return restart();
  // Prototype cheat: drop a random die next to the player.
  if (e.code === "KeyG" && !bag.isOpen && !game.over) {
    game.dropDie(game.player.x + 18, game.player.y, pickDie(CFG.dice.kingWeights));
    return;
  }
  if (e.code.startsWith("Arrow")) e.preventDefault();
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

const joy: Joystick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
let joyId = -1;
let scale = 1;
const toArt = (e: PointerEvent) => ({
  x: (e.clientX * (window.devicePixelRatio || 1)) / scale,
  y: (e.clientY * (window.devicePixelRatio || 1)) / scale,
});
canvas.addEventListener("pointerdown", (e) => {
  if (bag.isOpen || game.over || levelOpen) return;
  joyId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  const p = toArt(e);
  Object.assign(joy, { active: true, ox: p.x, oy: p.y, x: p.x, y: p.y });
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== joyId || !joy.active) return;
  const p = toArt(e);
  const dx = p.x - joy.ox;
  const dy = p.y - joy.oy;
  const d = Math.hypot(dx, dy);
  const max = 18;
  joy.x = joy.ox + (d > max ? (dx / d) * max : dx);
  joy.y = joy.oy + (d > max ? (dy / d) * max : dy);
});
const endJoy = (e: PointerEvent) => {
  if (e.pointerId !== joyId) return;
  joy.active = false;
  joyId = -1;
};
canvas.addEventListener("pointerup", endJoy);
canvas.addEventListener("pointercancel", endJoy);

function readInput() {
  let x = 0;
  let y = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  if (x === 0 && y === 0 && joy.active) {
    x = (joy.x - joy.ox) / 18;
    y = (joy.y - joy.oy) / 18;
    if (Math.hypot(x, y) < 0.2) x = y = 0;
  }
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  game.input.x = x;
  game.input.y = y;
}

// ---------- Sizing ----------

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(window.innerWidth * dpr);
  const H = Math.round(window.innerHeight * dpr);
  // A whole-number scale picked from the screen's shorter side, so phones held
  // upright zoom in as much as landscape screens do.
  scale = Math.max(1, Math.floor(Math.min(W, H) / CFG.viewShortSide));
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  document.documentElement.style.setProperty("--u", scale / dpr + "px");
  game.viewW = W / scale;
  game.viewH = H / scale;
}
window.addEventListener("resize", resize);
resize();

// ---------- Main loop ----------

let last = performance.now();
let acc = 0;
let introHidden = false;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  readInput();
  if (!bag.isOpen && !levelOpen && !game.over && game.pendingLevels > 0) showLevelUp();
  if (!bag.isOpen && !levelOpen && !game.over) {
    acc += dt;
    while (acc >= CFG.tick) {
      game.step(CFG.tick);
      acc -= CFG.tick;
    }
  } else {
    acc = 0;
  }
  if (!introHidden && (game.time > 12 || bag.isOpen)) {
    introHidden = true;
    intro.classList.add("out");
  }
  renderer.draw(ctx, game, scale, now / 1000, joy);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for automated testing in the browser console.
Object.assign(window, { __game: () => game, __dev: { makeScroll, makeGear, makeDie } });
