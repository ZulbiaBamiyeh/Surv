import "./style.css";
import { spriteURL } from "./art";
import type { RegionDef } from "./content";
import { CFG } from "./config";
import { SCROLLS, ScrollId } from "./content";
import { Game, GameEvents } from "./game";
import { Joystick, Renderer } from "./render";
import { Sound } from "./sfx";
import { ScrollOffer, Spellbook, StartPicker } from "./ui/spellbook";

const app = document.getElementById("app")!;
app.innerHTML = `
  <canvas id="game" aria-label="Game"></canvas>
  <div class="hud">
    <div class="xp"><div class="xp-fill"></div></div>
    <div class="hud-row">
      <div class="hp"><i></i><span></span></div>
      <div class="mid"><span class="timer">0:00</span><span class="danger"></span></div>
      <span class="lvl">Lv <b>1</b></span>
    </div>
    <div class="kit"><div class="scroll-row"></div></div>
  </div>
  <button class="book-btn" type="button" aria-label="Open spellbook"><span class="book-ico"></span><span class="badge" hidden></span></button>
  <div class="toasts" aria-live="polite"></div>
  <div class="intro">
    <span class="keys-only"><b>WASD</b> or arrows to move. Spells cast themselves.</span>
    <span class="touch-only"><b>Drag anywhere</b> to move. Spells cast themselves.</span>
    <span>Level up to grow your spell tree. King Slimes carry scrolls that unseal new parts of it.</span>
  </div>
  <div class="sheet over-sheet" hidden>
    <div class="sheet-panel short">
      <h2 class="over-title">Bonked!</h2>
      <p class="over-stats"></p>
      <div class="dmg"></div>
      <div class="over-btns"></div>
    </div>
  </div>`;

const $ = <T extends Element>(s: string) => app.querySelector(s) as T;
const canvas = $<HTMLCanvasElement>("#game");
const ctx = canvas.getContext("2d", { alpha: false })!;
const toastsEl = $<HTMLElement>(".toasts");
const intro = $<HTMLElement>(".intro");
const overEl = $<HTMLElement>(".over-sheet");
const sound = new Sound();

function toast(msg: string, kind?: "good" | "warn" | "gold" | "danger") {
  if (!msg) return;
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  toastsEl.append(el);
  while (toastsEl.children.length > 3) toastsEl.firstElementChild!.remove();
  setTimeout(() => el.classList.add("out"), 2600);
  setTimeout(() => el.remove(), 3000);
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// ---------- Game and UI ----------
let pendingBook = "";
const events: GameEvents = {
  toast,
  levelUp: () => (pendingBook = `Level ${game.level}!`),
  treasure: () => (pendingBook ||= "Treasure!"),
  scrollFound: () => {},
  sfx: (n, p) => sound.play(n, p),
  victory: () => showEnd(true),
  gameOver: () => setTimeout(() => showEnd(false), 700),
};

let game = new Game(events);
const renderer = new Renderer();
const book = new Spellbook(() => game, () => closeBook(), () => sound.toggle());
const offer = new ScrollOffer(renderer.art, () => game.book, (msg: string, opened: RegionDef[]) => {
  toast(msg, "gold");
  if (opened.length) sound.play("unseal");
  renderKit();
  if (opened.length || game.book.points > 0) openBook(opened.length ? `${opened[0].name} unsealed!` : "Spend your points");
});
const picker = new StartPicker(renderer.art, (id: ScrollId) => {
  game = new Game(events, id);
  resize();
  renderKit();
  sound.play("unseal");
});
app.append(book.root, offer.root, picker.root);
picker.open();

function openBook(headline = "") {
  if (game.over || offer.isOpen || picker.isOpen || game.victoryPending) return;
  keys.clear();
  joy.active = false;
  book.open(headline);
}
function closeBook() {
  book.close();
  renderKit();
}
$<HTMLButtonElement>(".book-btn").addEventListener("click", () => (book.isOpen ? closeBook() : openBook()));

function showEnd(won: boolean) {
  const t = game.time;
  $<HTMLElement>(".over-title").textContent = game.victoryPending ? "You survived!" : game.won ? "What a run!" : "Bonked!";
  $<HTMLElement>(".over-stats").textContent = game.victoryPending
    ? `All ${fmt(CFG.runLength)}, level ${game.level}, ${game.kills} enemies banished. Keep going? It only gets wilder.`
    : `You lasted ${fmt(t)}${game.endless ? " (overtime!)" : ""}, reached level ${game.level} and banished ${game.kills} enemies.${!won && game.lastHitBy ? ` Bonked by a ${game.lastHitBy}.` : ""}`;
  const total = [...game.dealt.values()].reduce((a, v) => a + v, 0) || 1;
  $<HTMLElement>(".dmg").innerHTML = [...game.dealt]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `<div><span>${k}</span><i style="width:${Math.max(2, (v / total) * 100)}%"></i><b>${Math.round((v / total) * 100)}%</b></div>`)
    .join("");
  const btns = $<HTMLElement>(".over-btns");
  if (game.victoryPending) {
    btns.innerHTML = `<button class="btn keep" type="button">Keep going</button><button class="btn ghost end" type="button">End the run</button>`;
    btns.querySelector(".keep")!.addEventListener("click", () => {
      overEl.hidden = true;
      game.keepGoing();
      toast("Overtime! The danger keeps climbing.", "danger");
    });
    btns.querySelector(".end")!.addEventListener("click", () => game.endRun());
  } else {
    btns.innerHTML = `<button class="btn retry" type="button">Play again</button>`;
    btns.querySelector(".retry")!.addEventListener("click", restart);
  }
  overEl.hidden = false;
}

function restart() {
  overEl.hidden = true;
  pendingBook = "";
  book.close();
  game = new Game(events);
  picker.open();
}

// ---------- HUD ----------
const xpFill = $<HTMLElement>(".xp-fill");
const hpBar = $<HTMLElement>(".hp i");
const hpText = $<HTMLElement>(".hp span");
const timerEl = $<HTMLElement>(".timer");
const dangerEl = $<HTMLElement>(".danger");
const lvlEl = $<HTMLElement>(".lvl b");
const badge = $<HTMLElement>(".badge");
const scrollRow = $<HTMLElement>(".scroll-row");
const icons = new Map([...renderer.art.scrolls].map(([id, s]) => [id, spriteURL(s, 2)]));
$<HTMLElement>(".book-ico").style.backgroundImage = `url(${spriteURL(renderer.art.lootScroll, 3)})`;

function renderKit() {
  const b = game.book;
  scrollRow.innerHTML = [...b.scrolls]
    .map((id) => `<img src="${icons.get(id)}" alt="${SCROLLS[id].name}" title="${SCROLLS[id].name}" class="px" style="--c:${SCROLLS[id].color}">`)
    .join("");
}
renderKit();

let hudKey = "";
let kitVersion = -1;
function updateHud() {
  const p = game.player;
  const sec = Math.floor(game.time);
  const key = `${sec}|${game.level}|${Math.ceil(p.hp)}|${p.maxHp}|${Math.round((game.xp / game.xpNeeded) * 100)}|${game.book.points}|${game.dangerIdx}`;
  if (game.book.version !== kitVersion) {
    kitVersion = game.book.version;
    renderKit();
  }
  if (key === hudKey) return;
  hudKey = key;
  xpFill.style.width = Math.min(100, (game.xp / game.xpNeeded) * 100) + "%";
  hpBar.style.width = (p.hp / p.maxHp) * 100 + "%";
  hpText.textContent = String(Math.ceil(p.hp));
  timerEl.textContent = fmt(sec);
  const d = game.danger;
  dangerEl.textContent = d.name;
  dangerEl.style.setProperty("--c", d.color);
  lvlEl.textContent = String(game.level);
  badge.hidden = game.book.points === 0;
  badge.textContent = String(game.book.points);
}

// ---------- Input: keyboard and a floating thumb stick ----------
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  if (e.code === "Tab" || e.code === "KeyB") {
    e.preventDefault();
    if (book.isOpen) closeBook();
    else openBook();
    return;
  }
  if (e.code === "KeyM") sound.toggle();
  if (e.code === "Escape" && book.isOpen) return closeBook();
  if (e.code.startsWith("Arrow")) e.preventDefault();
  keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

const joy: Joystick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
let joyId = -1;
let scale = 1;
const JOY_R = 26;
const toArt = (e: PointerEvent) => ({ x: (e.clientX * devicePixelRatio) / scale, y: (e.clientY * devicePixelRatio) / scale });
canvas.addEventListener("pointerdown", (e) => {
  if (paused()) return;
  joyId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  const p = toArt(e);
  Object.assign(joy, { active: true, ox: p.x, oy: p.y, x: p.x, y: p.y });
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== joyId || !joy.active) return;
  const p = toArt(e);
  let dx = p.x - joy.ox;
  let dy = p.y - joy.oy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) {
    // The stick's base follows your thumb if you drag past the edge
    joy.ox += (dx / d) * (d - JOY_R);
    joy.oy += (dy / d) * (d - JOY_R);
    dx = p.x - joy.ox;
    dy = p.y - joy.oy;
  }
  joy.x = joy.ox + dx;
  joy.y = joy.oy + dy;
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
    x = (joy.x - joy.ox) / JOY_R;
    y = (joy.y - joy.oy) / JOY_R;
    if (Math.hypot(x, y) < 0.15) x = y = 0;
  }
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  game.input.x = x;
  game.input.y = y;
}

// ---------- Sizing: a whole-number pixel scale from the shorter screen side ----------
function resize() {
  const dpr = devicePixelRatio || 1;
  const W = Math.round(innerWidth * dpr);
  const H = Math.round(innerHeight * dpr);
  scale = Math.max(1, Math.round(Math.min(W, H) / CFG.viewShortSide));
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  game.viewW = W / scale;
  game.viewH = H / scale;
}
addEventListener("resize", resize);
resize();

// ---------- Main loop ----------
let hidden = false;
document.addEventListener("visibilitychange", () => {
  hidden = document.hidden;
  if (hidden && !game.over && !book.isOpen && !offer.isOpen) openBook("Paused");
});
const paused = () => book.isOpen || offer.isOpen || picker.isOpen || game.over || game.victoryPending || hidden;

let last = performance.now();
let acc = 0;
let introDone = false;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  readInput();
  if (!paused()) {
    if (game.pendingScrolls > 0) {
      game.pendingScrolls--;
      keys.clear();
      joy.active = false;
      offer.open();
    } else if (pendingBook && game.book.points > 0) {
      const h = pendingBook;
      pendingBook = "";
      openBook(h);
    } else {
      pendingBook = "";
      acc += dt;
      while (acc >= CFG.tick) {
        game.step(CFG.tick);
        acc -= CFG.tick;
      }
    }
  } else acc = 0;
  if (!introDone && (game.time > 10 || (game.player.moving && game.time > 2))) {
    introDone = true;
    intro.classList.add("out");
  }
  renderer.draw(ctx, game, scale, now / 1000, joy);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, { __game: () => game, __book: () => book });
