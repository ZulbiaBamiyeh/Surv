import "./style.css";
import { spriteURL } from "./art";
import { CFG } from "./config";
import { SCROLLS } from "./content";
import { Game } from "./game";
import { Joystick, Renderer } from "./render";
import { ScrollOffer, Spellbook } from "./ui/spellbook";

const app = document.getElementById("app")!;
app.innerHTML = `
  <canvas id="game" aria-label="Game"></canvas>
  <div class="hud">
    <div class="xp"><div class="xp-fill"></div></div>
    <div class="hud-row">
      <div class="hp"><i></i><span></span></div>
      <span class="timer">0:00</span>
      <span class="lvl">Lv <b>1</b></span>
    </div>
    <div class="slots"></div>
  </div>
  <button class="book-btn" type="button" aria-label="Open spellbook"><span class="book-ico"></span><span class="badge" hidden></span></button>
  <div class="toasts" aria-live="polite"></div>
  <div class="intro">
    <span class="keys-only"><b>WASD</b> or arrows to move. Spells cast themselves.</span>
    <span class="touch-only"><b>Drag anywhere</b> to move. Spells cast themselves.</span>
    <span>Level up to earn points for your scroll's skill tree.</span>
  </div>
  <div class="sheet over-sheet" hidden>
    <div class="sheet-panel short">
      <h2 class="over-title">Bonked!</h2>
      <p class="over-stats"></p>
      <button class="btn retry" type="button">Play again</button>
    </div>
  </div>`;

const $ = <T extends Element>(s: string) => app.querySelector(s) as T;
const canvas = $<HTMLCanvasElement>("#game");
const ctx = canvas.getContext("2d", { alpha: false })!;
const toastsEl = $<HTMLElement>(".toasts");
const intro = $<HTMLElement>(".intro");
const overEl = $<HTMLElement>(".over-sheet");

function toast(msg: string, kind?: "good" | "warn" | "gold") {
  if (!msg) return;
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  toastsEl.append(el);
  while (toastsEl.children.length > 2) toastsEl.firstElementChild!.remove();
  setTimeout(() => el.classList.add("out"), 2400);
  setTimeout(() => el.remove(), 2800);
}

// ---------- Game and UI ----------
let pendingLevelUp = false;
const events = {
  toast,
  levelUp: () => {
    pendingLevelUp = true;
  },
  scrollFound: () => {},
  gameOver: () => {
    const t = Math.floor(game.time);
    $<HTMLElement>(".over-title").textContent = game.won ? "You survived!" : "Bonked!";
    $<HTMLElement>(".over-stats").textContent = game.won
      ? `All ${Math.round(CFG.runLength / 60)} minutes, level ${game.level}, ${game.kills} enemies banished.`
      : `You lasted ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}, reached level ${game.level} and banished ${game.kills} enemies.`;
    setTimeout(() => (overEl.hidden = false), 700);
  },
};

let game = new Game(events);
const renderer = new Renderer();
const book = new Spellbook(renderer.art, () => game.book, () => closeBook());
const offer = new ScrollOffer(renderer.art, () => game.book, (msg) => {
  toast(msg, "gold");
  renderSlots();
  if (game.book.points > 0) openBook("Spend your points");
});
app.append(book.root, offer.root);

function openBook(headline = "") {
  if (game.over || offer.isOpen) return;
  keys.clear();
  joy.active = false;
  book.open(headline);
}
function closeBook() {
  book.close();
  renderSlots();
}
$<HTMLButtonElement>(".book-btn").addEventListener("click", () => (book.isOpen ? closeBook() : openBook()));
$<HTMLButtonElement>(".retry").addEventListener("click", restart);

function restart() {
  game = new Game(events);
  overEl.hidden = true;
  pendingLevelUp = false;
  book.close();
  resize();
  renderSlots();
}

// ---------- HUD ----------
const xpFill = $<HTMLElement>(".xp-fill");
const hpBar = $<HTMLElement>(".hp i");
const hpText = $<HTMLElement>(".hp span");
const timerEl = $<HTMLElement>(".timer");
const lvlEl = $<HTMLElement>(".lvl b");
const badge = $<HTMLElement>(".badge");
const slotsEl = $<HTMLElement>(".slots");
const slotIcons = new Map([...renderer.art.scrolls].map(([id, s]) => [id, spriteURL(s, 3)]));
$<HTMLElement>(".book-ico").style.backgroundImage = `url(${spriteURL(renderer.art.scrolls.get("light")!, 3)})`;

function renderSlots() {
  slotsEl.replaceChildren(
    ...game.book.slots.map((s) => {
      const el = document.createElement("span");
      el.className = "slot" + (s ? "" : " empty");
      if (s) {
        el.style.setProperty("--c", SCROLLS[s.id].color);
        el.innerHTML = `<img src="${slotIcons.get(s.id)}" alt="${SCROLLS[s.id].name}" class="px"><b>${s.spent}</b>`;
      } else el.innerHTML = `<small>+15%</small>`;
      return el;
    }),
  );
}
renderSlots();

let hudKey = "";
function updateHud() {
  const p = game.player;
  const sec = Math.floor(game.time);
  const key = `${sec}|${game.level}|${Math.ceil(p.hp)}|${Math.round((game.xp / game.xpNeeded) * 100)}|${game.book.points}`;
  if (key === hudKey) return;
  hudKey = key;
  xpFill.style.width = Math.min(100, (game.xp / game.xpNeeded) * 100) + "%";
  hpBar.style.width = (p.hp / p.maxHp) * 100 + "%";
  hpText.textContent = String(Math.ceil(p.hp));
  timerEl.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
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
  if (hidden && !game.over && !book.isOpen) openBook("Paused");
});
const paused = () => book.isOpen || offer.isOpen || game.over || hidden;

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
    } else if (pendingLevelUp && game.book.points > 0) {
      pendingLevelUp = false;
      openBook(`Level ${game.level}!`);
    } else {
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

Object.assign(window, { __game: () => game });
