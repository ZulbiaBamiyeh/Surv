import { CFG } from "./config";
import { rollDie } from "./dice";
import type { Game } from "./game";
import { DieItem, Item, NumberItem, SocketKey, makeNumber } from "./inventory";
import { Art, dieColor, spriteURL } from "./art";

type From = { type: "grid" } | { type: "socket"; key: SocketKey };

interface Drag {
  item: Item;
  from: From;
  el: HTMLElement;
  offX: number;
  offY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

const SOCKETS: { key: SocketKey; label: string; help: string }[] = [
  { key: "count", label: "Count", help: "Fireballs per cast" },
  { key: "speed", label: "Speed", help: `+${Math.round(CFG.fireball.speedPerPip * 100)}% cast speed per pip` },
];

export class BackpackUI {
  readonly root: HTMLElement;
  isOpen = false;
  private grid: HTMLElement;
  private layer: HTMLElement;
  private ghost: HTMLElement;
  private trash: HTMLElement;
  private sockets: HTMLElement;
  private stats: HTMLElement;
  private drag: Drag | null = null;
  private rolling = new Set<number>();
  private scrollImg: string;
  private dieImg = new Map<number, string>();
  private justRolled: number | null = null;

  constructor(
    art: Art,
    public game: Game,
    private toast: (msg: string, kind?: "good" | "warn" | "gold") => void,
    private onChange: () => void,
    private onClose: () => void,
  ) {
    this.scrollImg = spriteURL(art.scroll, 6);
    for (const [faces, spr] of art.dice) this.dieImg.set(faces, spriteURL(spr, 5));
    const cols = CFG.bag.cols;
    const rows = CFG.bag.rows;
    this.root = document.createElement("div");
    this.root.className = "overlay bag-overlay";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="panel bag-panel" role="dialog" aria-label="Backpack">
        <div class="bag-left">
          <div class="panel-head"><h2>Backpack</h2><span class="paused">Paused</span></div>
          <div class="bag-grid" style="--cols:${cols};--rows:${rows}">
            ${'<div class="cell"></div>'.repeat(cols * rows)}
            <div class="drop-ghost" hidden></div>
            <div class="bag-items"></div>
          </div>
          <div class="trash">Drop here to throw away</div>
        </div>
        <div class="bag-right">
          <div class="scroll-card">
            <div class="scroll-head">
              <img src="${this.scrollImg}" alt="" class="px" width="66" height="78">
              <div><h3>Fireball</h3><p>Shoots at the nearest enemy all by itself.</p></div>
            </div>
            <div class="sockets"></div>
            <dl class="stats"></dl>
          </div>
          <ul class="help">
            <li><b>Tap a die</b> to roll it. It turns into a number.</li>
            <li><b>Drag a number</b> onto a socket. Putting a new number in a socket sends the old one back to your bag.</li>
            <li>Bigger dice take up more space.</li>
          </ul>
        </div>
      </div>
      <button class="btn close-btn" type="button">Back to the fight <kbd>Tab</kbd></button>`;
    this.grid = this.root.querySelector(".bag-grid")!;
    this.layer = this.root.querySelector(".bag-items")!;
    this.ghost = this.root.querySelector(".drop-ghost")!;
    this.trash = this.root.querySelector(".trash")!;
    this.sockets = this.root.querySelector(".sockets")!;
    this.stats = this.root.querySelector(".stats")!;
    this.root.querySelector(".close-btn")!.addEventListener("click", () => this.onClose());
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e));
    window.addEventListener("pointercancel", () => this.cancelDrag());
  }

  open() {
    this.isOpen = true;
    this.root.hidden = false;
    this.render();
  }

  close() {
    this.cancelDrag();
    this.isOpen = false;
    this.root.hidden = true;
  }

  render() {
    const bag = this.game.bag;
    this.layer.replaceChildren(...bag.items.map((it) => this.itemEl(it, { type: "grid" })));
    const scroll = bag.scroll;
    this.sockets.replaceChildren(
      ...SOCKETS.map(({ key, label, help }) => {
        const wrap = document.createElement("div");
        wrap.className = "socket";
        wrap.dataset.socket = key;
        const slot = document.createElement("div");
        slot.className = "socket-slot";
        const n = scroll.sockets[key];
        if (n) slot.appendChild(this.itemEl(n, { type: "socket", key }));
        else slot.innerHTML = `<span class="empty">${key === "count" ? "1" : "0"}</span>`;
        wrap.innerHTML = `<span class="socket-label">${label}</span>`;
        wrap.appendChild(slot);
        wrap.insertAdjacentHTML("beforeend", `<span class="socket-help">${help}</span>`);
        return wrap;
      }),
    );
    const st = this.game.stats;
    this.stats.innerHTML = `
      <div><dt>Fireballs per cast</dt><dd>${st.count}</dd></div>
      <div><dt>Time between casts</dt><dd>${st.cooldown.toFixed(2)}s</dd></div>
      <div><dt>Damage each</dt><dd>${Math.round(st.damage)}</dd></div>`;
  }

  private itemEl(it: Item, from: From): HTMLElement {
    const el = document.createElement("div");
    el.className = `item item-${it.kind}`;
    if (from.type === "grid") {
      el.style.left = `calc(var(--cell) * ${it.x})`;
      el.style.top = `calc(var(--cell) * ${it.y})`;
      el.style.width = `calc(var(--cell) * ${it.w})`;
      el.style.height = `calc(var(--cell) * ${it.h})`;
    }
    if (it.kind === "scroll") {
      el.innerHTML = `<img src="${this.scrollImg}" alt="" class="px"><span class="label">Fireball</span>`;
      el.title = "Fireball scroll";
    } else if (it.kind === "die") {
      el.style.setProperty("--die", dieColor(it.faces));
      el.innerHTML = `<img src="${this.dieImg.get(it.faces)}" alt="" class="px"><span class="label">d${it.faces}</span><span class="roll-num" hidden></span>`;
      el.title = `d${it.faces}: tap to roll 1 to ${it.faces}`;
      el.setAttribute("aria-label", `d${it.faces} die, tap to roll`);
      if (this.rolling.has(it.id)) el.classList.add("rolling");
    } else {
      el.style.setProperty("--die", dieColor(it.faces));
      el.innerHTML = `<span class="num">${it.value}</span><span class="sub">d${it.faces}</span>`;
      el.title = `${it.value}, rolled on a d${it.faces}`;
      if (it.value === it.faces && it.faces > 3) el.classList.add("max");
      if (this.justRolled === it.id) el.classList.add("pop");
    }
    el.addEventListener("pointerdown", (e) => this.onDown(e, it, from, el));
    return el;
  }

  // ---------- Dragging ----------

  private onDown(e: PointerEvent, item: Item, from: From, el: HTMLElement) {
    if (this.rolling.has(item.id) || e.button > 0) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    this.drag = { item, from, el, offX: e.clientX - r.left, offY: e.clientY - r.top, startX: e.clientX, startY: e.clientY, moved: false };
  }

  private onMove(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
      d.moved = true;
      const r = d.el.getBoundingClientRect();
      d.el.classList.add("dragging");
      d.el.style.width = r.width + "px";
      d.el.style.height = r.height + "px";
      document.body.appendChild(d.el);
      if (d.item.kind === "number") this.sockets.classList.add("drop-ready");
      this.trash.classList.add("drop-ready");
    }
    d.el.style.left = e.clientX - d.offX + "px";
    d.el.style.top = e.clientY - d.offY + "px";
    this.updateGhost(e);
  }

  private cellUnder(e: PointerEvent, d: Drag) {
    const g = this.grid.getBoundingClientRect();
    const cell = g.width / CFG.bag.cols;
    return {
      x: Math.round((e.clientX - d.offX - g.left) / cell),
      y: Math.round((e.clientY - d.offY - g.top) / cell),
      inside: e.clientX >= g.left && e.clientX <= g.right && e.clientY >= g.top && e.clientY <= g.bottom,
    };
  }

  private updateGhost(e: PointerEvent) {
    const d = this.drag!;
    const c = this.cellUnder(e, d);
    if (!c.inside) {
      this.ghost.hidden = true;
      return;
    }
    const ok = this.game.bag.fits(d.item.w, d.item.h, c.x, c.y, d.item);
    Object.assign(this.ghost.style, {
      left: `calc(var(--cell) * ${c.x})`, top: `calc(var(--cell) * ${c.y})`,
      width: `calc(var(--cell) * ${d.item.w})`, height: `calc(var(--cell) * ${d.item.h})`,
    });
    this.ghost.classList.toggle("bad", !ok);
    this.ghost.hidden = false;
  }

  private onUp(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.ghost.hidden = true;
    this.sockets.classList.remove("drop-ready");
    this.trash.classList.remove("drop-ready");
    if (!d.moved) {
      if (d.item.kind === "die") this.roll(d.item);
      else if (d.item.kind === "number") this.toast("Drag this number onto one of Fireball's sockets.");
      return;
    }
    d.el.remove();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const socketEl = target?.closest<HTMLElement>("[data-socket]");
    if (socketEl && d.item.kind === "number") {
      this.slot(d.item, d.from, socketEl.dataset.socket as SocketKey);
    } else if (target?.closest(".trash")) {
      this.discard(d.item, d.from);
    } else {
      const c = this.cellUnder(e, d);
      if (c.inside) this.moveToGrid(d.item, d.from, c.x, c.y);
    }
    this.changed();
  }

  private cancelDrag() {
    if (!this.drag) return;
    this.drag.el.remove();
    this.drag = null;
    this.ghost.hidden = true;
    if (this.isOpen) this.render();
  }

  // ---------- Actions ----------

  private moveToGrid(item: Item, from: From, x: number, y: number) {
    const bag = this.game.bag;
    if (!bag.fits(item.w, item.h, x, y, item)) return;
    if (from.type === "socket") bag.scroll.sockets[from.key] = null;
    bag.placeAt(item, x, y);
  }

  private slot(item: NumberItem, from: From, key: SocketKey) {
    const bag = this.game.bag;
    const scroll = bag.scroll;
    const old = scroll.sockets[key];
    if (old === item) return;
    if (from.type === "socket") {
      // Moving between sockets swaps them.
      scroll.sockets[from.key] = old;
      scroll.sockets[key] = item;
    } else {
      bag.remove(item);
      scroll.sockets[key] = item;
      if (old && !bag.add(old)) this.toast(`No room for the old ${old.value}, so it was thrown away.`, "warn");
    }
    const st = this.game.stats;
    this.toast(
      key === "count" ? (st.count === 1 ? "Fireball shoots 1 at a time." : `Fireball now shoots ${st.count} at once!`) : `Fireball now casts every ${st.cooldown.toFixed(2)}s!`,
      "good",
    );
  }

  private discard(item: Item, from: From) {
    if (item.kind === "scroll") {
      this.toast("You need your Fireball scroll!", "warn");
      return;
    }
    if (from.type === "socket") this.game.bag.scroll.sockets[from.key] = null;
    else this.game.bag.remove(item);
  }

  private roll(die: DieItem) {
    this.rolling.add(die.id);
    this.render();
    const el = [...this.layer.children].find((c) => c.classList.contains("rolling")) as HTMLElement | undefined;
    const num = el?.querySelector<HTMLElement>(".roll-num");
    if (num) num.hidden = false;
    const iv = window.setInterval(() => {
      if (num) num.textContent = String(rollDie(die.faces));
    }, 55);
    window.setTimeout(() => {
      window.clearInterval(iv);
      this.rolling.delete(die.id);
      const value = rollDie(die.faces);
      const bag = this.game.bag;
      bag.remove(die);
      const n = makeNumber(value, die.faces);
      bag.placeAt(n, die.x, die.y);
      this.justRolled = n.id;
      if (value === die.faces) this.toast(`MAX ROLL! ${value} on a d${die.faces}!`, "gold");
      else if (value === 1) this.toast(`Ouch, a 1 on a d${die.faces}.`, "warn");
      else this.toast(`Rolled a ${value} on a d${die.faces}.`);
      this.changed();
      this.justRolled = null;
    }, 750);
  }

  private changed() {
    if (this.isOpen) this.render();
    this.onChange();
  }
}
