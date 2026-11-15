import "./style.css";
import { spriteURL } from "./art";
import { glyphURL } from "./art/glyphs";
import { CFG } from "./config";
import { Game, GameEvents } from "./game";
import { Joystick, Renderer } from "./render";
import { load, record, store } from "./save";
import { Sound } from "./sfx";
import { ALL_CONS, CONS, ConId, LIGHT_CAP, STAR } from "./sky";
import { SkyScreen } from "./ui/sky";

const app = document.getElementById("app")!;
app.innerHTML = `
  <canvas id="game" aria-label="Game"></canvas>
  <div class="hud" hidden>
    <div class="xp"><div class="xp-fill"></div></div>
    <div class="hud-row">
      <div class="hp"><i></i><span></span></div>
      <div class="clock"><span class="timer">0:00</span><div class="night-bar"><i></i><b>☾</b><u>☀</u></div></div>
      <button class="icon-btn pause-btn" type="button" aria-label="Pause">Ⅱ</button>
    </div>
    <div class="cons"></div>
    <div class="boss" hidden><span></span><div><i></i></div></div>
  </div>
  <button class="sky-btn" type="button" aria-label="Open the night sky" hidden><span>✦</span><b class="badge" hidden></b><small></small></button>
  <div class="toasts" aria-live="polite"></div>
  <div class="hint" hidden></div>

  <div class="sheet title-sheet">
    <div class="title-panel">
      <div class="title-sky"></div>
      <h1>Bunny<br>Wizard</h1>
      <p class="tagline">Light up the night sky. Make it to dawn.</p>
      <img class="title-bunny px" alt="">
      <div class="night-pick">
        <button class="icon-btn prev" type="button" aria-label="Easier night">‹</button>
        <div><b class="night-name"></b><small class="night-best"></small></div>
        <button class="icon-btn next" type="button" aria-label="Harder night">›</button>
      </div>
      <button class="btn play" type="button">Play</button>
      <div class="toggles"></div>
      <p class="how"><span class="keys-only"><b>WASD</b> or arrow keys to move.</span><span class="touch-only"><b>Drag anywhere</b> to move.</span> Your spells cast themselves. Gather stardust, light stars, and chase the stars that fall.</p>
      <p class="record"></p>
    </div>
  </div>

  <div class="sheet pause-sheet" hidden>
    <div class="sheet-panel short">
      <h2>Paused</h2>
      <button class="btn resume" type="button">Keep going</button>
      <button class="btn ghost to-sky" type="button">Look at the sky</button>
      <div class="toggles"></div>
      <button class="btn ghost quit" type="button">Give up this night</button>
    </div>
  </div>

  <div class="sheet end-sheet" hidden>
    <div class="sheet-panel short">
      <h2 class="end-title"></h2>
      <p class="end-stats"></p>
      <div class="end-cons"></div>
      <div class="dmg"></div>
      <p class="end-note"></p>
      <div class="end-btns">
        <button class="btn again" type="button">Play again</button>
        <button class="btn ghost menu" type="button">Menu</button>
      </div>
    </div>
  </div>`;

const $ = <T extends Element>(s: string) => app.querySelector(s) as T;
const canvas = $<HTMLCanvasElement>("#game");
const ctx = canvas.getContext("2d", { alpha: false })!;
const hud = $<HTMLElement>(".hud");
const skyBtn = $<HTMLButtonElement>(".sky-btn");
const toastsEl = $<HTMLElement>(".toasts");
const hint = $<HTMLElement>(".hint");
const titleEl = $<HTMLElement>(".title-sheet");
const pauseEl = $<HTMLElement>(".pause-sheet");
const endEl = $<HTMLElement>(".end-sheet");

const save = load();
const sound = new Sound();
sound.sfxOn = save.sfx;
sound.musicOn = save.music;
const renderer = new Renderer();
renderer.shakeOn = save.shake;

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

function toast(msg: string, kind?: "good" | "warn" | "gold" | "danger") {
  if (!msg) return;
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  toastsEl.append(el);
  while (toastsEl.children.length > 2) toastsEl.firstElementChild!.remove();
  setTimeout(() => el.classList.add("out"), 2400);
  setTimeout(() => el.remove(), 2800);
}

// ---------- The run ----------
type Mode = "title" | "play" | "end";
let mode: Mode = "title";
let night = save.night;
let pendingSky = "";
let lastHp = CFG.player.maxHp;

const events: GameEvents = {
  toast,
  levelUp: () => (pendingSky = "A new star!"),
  starTouched: () => {},
  sfx: (n, p) => sound.play(n, p),
  victory: () => setTimeout(() => showEnd(), 1600),
  gameOver: () => setTimeout(() => showEnd(), 900),
};

// A quiet game behind the title screen, so there is something pretty to look at
let game = new Game({ ...events, toast() {}, sfx() {}, victory() {}, gameOver() {} }, 1);

const sky = new SkyScreen(
  () => game.sky,
  () => renderCons(),
  (n) => sound.play(n),
);
app.append(sky.root);

function startRun() {
  mode = "play";
  titleEl.hidden = true;
  endEl.hidden = true;
  pauseEl.hidden = true;
  sky.hide();
  pendingSky = "";
  const offers = [...ALL_CONS].sort(() => Math.random() - 0.5).slice(0, 3);
  // The sky needs a game to read from while you choose
  game = new Game(events, night);
  resize();
  hud.hidden = false;
  skyBtn.hidden = false;
  renderCons();
  sky.pick(offers, "Choose your first constellation", "It joins the Moon in your sky. Falling stars will bring more.", (c: ConId) => {
    game = new Game(events, night, c);
    resize();
    lastHp = game.player.hp;
    renderCons();
    sound.play("discover");
    sound.setPlaying(true);
    sky.open(`${CONS[c].name} rises`, c);
    showHint();
  });
}

function showHint() {
  hint.hidden = false;
  hint.classList.remove("out");
  hint.innerHTML = `<span class="keys-only"><b>WASD</b> or arrows to move.</span><span class="touch-only"><b>Drag anywhere</b> to move.</span> Gather the stardust enemies drop.`;
}

function toMenu() {
  mode = "title";
  sky.hide();
  endEl.hidden = true;
  pauseEl.hidden = true;
  hud.hidden = true;
  skyBtn.hidden = true;
  hint.hidden = true;
  sound.setPlaying(false);
  game = new Game({ ...events, toast() {}, sfx() {}, victory() {}, gameOver() {} }, 1);
  resize();
  renderTitle();
  titleEl.hidden = false;
}

function showEnd() {
  if (mode !== "play") return;
  mode = "end";
  sky.hide();
  pauseEl.hidden = true;
  sound.setPlaying(false);
  const g = game;
  const wasLocked = save.night <= night;
  const best = record(save, night, g.time, g.won, g.sky.found);
  $<HTMLElement>(".end-title").textContent = g.won ? "Dawn!" : "Bonked!";
  $<HTMLElement>(".end-stats").textContent = g.won
    ? `You made it through night ${night} with ${g.sky.spent} stars lit and ${g.kills} enemies banished.`
    : `You lasted ${fmt(g.time)} of night ${night}, lit ${g.sky.spent} stars and banished ${g.kills} enemies.${g.lastHitBy ? ` Bonked by a ${g.lastHitBy}.` : ""}`;
  $<HTMLElement>(".end-cons").innerHTML = g.sky.found
    .slice(1)
    .map((c) => `<span style="--c:${CONS[c].color}"><img src="${glyphURL(STAR.get(c)!.icon, CONS[c].color, 2)}" alt="" class="px">${CONS[c].name}</span>`)
    .join("");
  const total = [...g.dealt.values()].reduce((a, v) => a + v, 0) || 1;
  $<HTMLElement>(".dmg").innerHTML = [...g.dealt]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `<div><span>${k}</span><i style="width:${Math.max(2, (v / total) * 100)}%"></i><b>${Math.round((v / total) * 100)}%</b></div>`)
    .join("");
  $<HTMLElement>(".end-note").textContent =
    g.won && wasLocked && night < CFG.night.max ? `Night ${night + 1} is unlocked: tougher enemies, same sky.` : best && !g.won ? "That's your best time on this night." : "";
  if (g.won && wasLocked && night < CFG.night.max) night++;
  endEl.hidden = false;
}

// ---------- Title ----------
const NIGHT_NAMES = ["", "A quiet night", "A restless night", "A long night", "A wild night", "The longest night"];
function renderTitle() {
  night = Math.max(1, Math.min(night, save.night));
  $<HTMLElement>(".night-name").textContent = `Night ${night}`;
  const b = save.best[night];
  $<HTMLElement>(".night-best").textContent = `${NIGHT_NAMES[night]}${b ? ` · best ${b >= CFG.nightLength ? "dawn" : fmt(b)}` : ""}`;
  $<HTMLButtonElement>(".prev").disabled = night <= 1;
  $<HTMLButtonElement>(".next").disabled = night >= save.night;
  $<HTMLElement>(".record").textContent = save.runs
    ? `${save.wins} dawn${save.wins === 1 ? "" : "s"} in ${save.runs} night${save.runs === 1 ? "" : "s"} · ${save.seen.length} of ${ALL_CONS.length} constellations found`
    : "";
  renderToggles();
}
$<HTMLButtonElement>(".prev").addEventListener("click", () => {
  night--;
  sound.play("tap");
  renderTitle();
});
$<HTMLButtonElement>(".next").addEventListener("click", () => {
  night++;
  sound.play("tap");
  renderTitle();
});
$<HTMLButtonElement>(".play").addEventListener("click", startRun);
$<HTMLImageElement>(".title-bunny").src = spriteURL(renderer.art.heroIdle[0], 4);
// A few stars behind the title
$<HTMLElement>(".title-sky").innerHTML = Array.from({ length: 40 }, (_, i) => {
  const x = (i * 61.8) % 100;
  const y = (i * 38.2 + (i % 7) * 9) % 100;
  return `<i style="left:${x}%;top:${y}%;animation-delay:${(i % 9) * 0.4}s;${i % 5 === 0 ? "width:3px;height:3px" : ""}"></i>`;
}).join("");

function renderToggles() {
  const items: [string, boolean, () => void][] = [
    ["Sound", save.sfx, () => (sound.sfxOn = save.sfx = !save.sfx)],
    ["Music", save.music, () => {
      sound.musicOn = save.music = !save.music;
      sound.setPlaying(mode === "play");
    }],
    ["Shake", save.shake, () => (renderer.shakeOn = save.shake = !save.shake)],
  ];
  for (const host of app.querySelectorAll<HTMLElement>(".toggles")) {
    host.replaceChildren(
      ...items.map(([label, on, flip]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "toggle" + (on ? " on" : "");
        b.setAttribute("aria-pressed", String(on));
        b.textContent = label;
        b.addEventListener("click", () => {
          flip();
          store(save);
          sound.play("tap");
          renderToggles();
        });
        return b;
      }),
    );
  }
}

// ---------- Pause and end buttons ----------
function pause() {
  if (mode !== "play" || sky.isOpen || game.over || game.won) return;
  keys.clear();
  joy.active = false;
  renderToggles();
  pauseEl.hidden = false;
  sound.setPlaying(false);
}
function resume() {
  pauseEl.hidden = true;
  if (mode === "play") sound.setPlaying(true);
}
$<HTMLButtonElement>(".pause-btn").addEventListener("click", pause);
$<HTMLButtonElement>(".resume").addEventListener("click", resume);
$<HTMLButtonElement>(".to-sky").addEventListener("click", () => {
  resume();
  openSky();
});
$<HTMLButtonElement>(".quit").addEventListener("click", toMenu);
$<HTMLButtonElement>(".again").addEventListener("click", startRun);
$<HTMLButtonElement>(".menu").addEventListener("click", toMenu);

function openSky(headline = "") {
  if (mode !== "play" || game.over || game.won || sky.isOpen || !pauseEl.hidden) return;
  keys.clear();
  joy.active = false;
  sky.open(headline);
}
skyBtn.addEventListener("click", () => openSky());

// ---------- HUD ----------
const xpFill = $<HTMLElement>(".xp-fill");
const hpBar = $<HTMLElement>(".hp i");
const hpText = $<HTMLElement>(".hp span");
const timerEl = $<HTMLElement>(".timer");
const nightFill = $<HTMLElement>(".night-bar i");
const nightMoon = $<HTMLElement>(".night-bar b");
const badge = $<HTMLElement>(".badge");
const skyCount = $<HTMLElement>(".sky-btn small");
const consEl = $<HTMLElement>(".cons");
const bossEl = $<HTMLElement>(".boss");
const bossName = $<HTMLElement>(".boss span");
const bossFill = $<HTMLElement>(".boss i");

function renderCons() {
  consEl.innerHTML = game.sky.found
    .slice(1)
    .map((c) => `<img src="${glyphURL(STAR.get(c)!.icon, CONS[c].color, 2)}" alt="${CONS[c].name}" class="px" style="--c:${CONS[c].color}">`)
    .join("");
}

let hudKey = "";
let consVersion = -1;
function updateHud() {
  const g = game;
  const p = g.player;
  if (g.sky.version !== consVersion) {
    consVersion = g.sky.version;
    renderCons();
  }
  if (g.boss) {
    bossEl.hidden = false;
    bossName.textContent = CFG.bosses[g.boss.boss].name;
    bossFill.style.width = Math.max(0, (g.boss.hp / g.boss.maxHp) * 100) + "%";
  } else bossEl.hidden = true;
  const sec = Math.floor(g.time);
  const key = `${sec}|${g.level}|${Math.ceil(p.hp)}|${p.maxHp}|${Math.round((g.xp / g.xpNeeded) * 50)}|${g.sky.points}|${g.sky.spent}`;
  if (key === hudKey) return;
  hudKey = key;
  const capped = g.sky.earned >= LIGHT_CAP;
  xpFill.style.width = Math.min(100, (g.xp / g.xpNeeded) * 100) + "%";
  xpFill.classList.toggle("capped", capped);
  hpBar.style.width = (p.hp / p.maxHp) * 100 + "%";
  hpText.textContent = String(Math.ceil(p.hp));
  timerEl.textContent = fmt(Math.max(0, CFG.nightLength - sec));
  const k = Math.min(1, g.time / CFG.nightLength);
  nightFill.style.width = k * 100 + "%";
  nightMoon.style.left = k * 100 + "%";
  badge.hidden = g.sky.points === 0;
  badge.textContent = String(g.sky.points);
  skyCount.textContent = `${g.sky.spent}/${LIGHT_CAP}`;
}

// ---------- Input: keyboard and a floating thumb stick ----------
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  if (mode === "title" && (e.code === "Enter" || e.code === "Space")) return startRun();
  if (mode !== "play") return;
  if (e.code === "Tab" || e.code === "KeyE") {
    e.preventDefault();
    if (!sky.isOpen) openSky();
    return;
  }
  if (e.code === "Escape" || e.code === "KeyP") {
    if (!pauseEl.hidden) resume();
    else pause();
    return;
  }
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
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
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

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
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
const paused = () => mode !== "play" || sky.isOpen || !pauseEl.hidden || game.over || game.won;

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === "play") {
    readInput();
    if (!paused()) {
      if (game.pendingStars > 0) {
        // A fallen star: choose a constellation, then watch it appear
        game.pendingStars--;
        keys.clear();
        joy.active = false;
        const offers = game.sky.offers(2);
        if (offers.length)
          sky.pick(offers, "A star fell for you!", "Choose a constellation to add to your sky.", (c: ConId) => {
            game.discover(c);
            sky.open(`${CONS[c].name} rises`, c);
          });
      } else if (pendingSky && game.sky.points > 0 && game.sky.options().length) {
        const h = pendingSky;
        pendingSky = "";
        openSky(h);
      } else {
        pendingSky = "";
        acc += dt;
        while (acc >= CFG.tick) {
          game.step(CFG.tick);
          acc -= CFG.tick;
        }
        if (game.player.hp < lastHp - 0.5) buzz(30);
        lastHp = game.player.hp;
        sound.intensity = Math.min(1, game.time / CFG.nightLength);
        if (!hint.hidden && game.time > 6) hint.classList.add("out");
      }
    } else acc = 0;
    updateHud();
  } else if (mode === "title") {
    // Let the meadow drift by behind the title
    game.player.x += dt * 8;
  }
  renderer.draw(ctx, game, scale, now / 1000, joy);
  requestAnimationFrame(frame);
}
renderTitle();
requestAnimationFrame(frame);

Object.assign(window, { __game: () => game, __start: startRun });
