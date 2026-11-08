import { Art, dieColor, spriteURL } from "./art";
import { CFG } from "./config";
import { GEAR, MAX_TIER, SCROLLS } from "./content";
import { rollDie } from "./dice";
import type { Game } from "./game";
import { DieItem, GearItem, Item, NumberItem, ScrollItem, SocketKey, SpellStats, itemName, makeNumber } from "./inventory";

type From = { type: "grid" } | { type: "pending" } | { type: "socket"; key: SocketKey };

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

const ROMAN = ["", "I", "II", "III"];

export class BackpackUI {
  readonly root: HTMLElement;
  isOpen = false;
  private grid: HTMLElement;
  private layer: HTMLElement;
  private ghost: HTMLElement;
  private trash: HTMLElement;
  private tray: HTMLElement;
  private detail: HTMLElement;
  private drag: Drag | null = null;
  private rolling = new Set<number>();
  private img = new Map<string, string>();
  private justRolled: number | null = null;
  private selected: Item | null = null;

  constructor(
    art: Art,
    public game: Game,
    private toast: (msg: string, kind?: "good" | "warn" | "gold") => void,
    private onChange: () => void,
    private onClose: () => void,
  ) {
    for (const [id, spr] of art.scrolls) this.img.set(id, spriteURL(spr, 4));
    for (const [id, spr] of art.gear) this.img.set(id, spriteURL(spr, 4));
    for (const [faces, spr] of art.dice) this.img.set("d" + faces, spriteURL(spr, 5));
    const cols = CFG.bag.cols;
    const rows = CFG.bag.rows;
    this.root = document.createElement("div");
    this.root.className = "overlay bag-overlay";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="panel bag-panel" role="dialog" aria-label="Backpack">
        <div class="bag-left">
          <div class="panel-head"><h2>Backpack</h2><span class="paused">Paused</span></div>
          <div class="tray" hidden>
            <span class="tray-label">New item. Drag it into your bag:</span>
            <div class="tray-slot"></div>
          </div>
          <div class="bag-grid" style="--cols:${cols};--rows:${rows}">
            ${'<div class="cell"></div>'.repeat(cols * rows)}
            <div class="drop-ghost" hidden></div>
            <div class="bag-items"></div>
          </div>
          <div class="trash">Drop here to throw away</div>
        </div>
        <div class="bag-right">
          <div class="detail"></div>
          <ul class="help">
            <li><b>Tap</b> an item to see what it does. <b>Tap a die</b> to roll it.</li>
            <li><b>Drag a number</b> onto a scroll or its sockets.</li>
            <li><b>Drag two matching items together</b> to merge them into a stronger tier.</li>
            <li>Gear marked <b>Touching</b> only boosts scrolls right next to it.</li>
          </ul>
        </div>
      </div>
      <button class="btn close-btn" type="button">Back to the fight <kbd>Tab</kbd></button>`;
    this.grid = this.root.querySelector(".bag-grid")!;
    this.layer = this.root.querySelector(".bag-items")!;
    this.ghost = this.root.querySelector(".drop-ghost")!;
    this.trash = this.root.querySelector(".trash")!;
    this.tray = this.root.querySelector(".tray")!;
    this.detail = this.root.querySelector(".detail")!;
    this.root.querySelector(".close-btn")!.addEventListener("click", () => this.onClose());
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e));
    window.addEventListener("pointercancel", () => this.cancelDrag());
  }

  open() {
    this.isOpen = true;
    this.root.hidden = false;
    const bag = this.game.bag;
    if (bag.pending) this.selected = bag.pending;
    else if (!this.selected || !bag.items.includes(this.selected)) this.selected = bag.scrolls[0] ?? null;
    this.render();
  }

  close() {
    this.cancelDrag();
    this.isOpen = false;
    this.root.hidden = true;
    if (this.game.bag.pending) this.toast(`Your ${itemName(this.game.bag.pending)} is waiting in your bag's tray.`, "warn");
  }

  render() {
    const bag = this.game.bag;
    if (this.selected && !bag.items.includes(this.selected) && bag.pending !== this.selected) this.selected = bag.scrolls[0] ?? null;
    const linked = this.linkedTo(this.selected);
    this.layer.replaceChildren(
      ...bag.items.map((it) => {
        const el = this.itemEl(it, { type: "grid" });
        if (it === this.selected) el.classList.add("selected");
        if (linked.has(it)) el.classList.add("linked");
        return el;
      }),
    );
    const slot = this.tray.querySelector(".tray-slot")!;
    if (bag.pending) {
      const el = this.itemEl(bag.pending, { type: "pending" });
      el.style.width = `calc(var(--cell) * ${bag.pending.w})`;
      el.style.height = `calc(var(--cell) * ${bag.pending.h})`;
      slot.replaceChildren(el);
      this.tray.hidden = false;
    } else {
      slot.replaceChildren();
      this.tray.hidden = true;
    }
    this.renderDetail();
  }

  /** Items that the selected item boosts or is boosted by. */
  private linkedTo(it: Item | null): Set<Item> {
    const out = new Set<Item>();
    if (!it || (it.kind !== "scroll" && it.kind !== "gear")) return out;
    const bag = this.game.bag;
    if (!bag.items.includes(it)) return out;
    if (it.kind === "scroll") {
      for (const g of bag.gear) if (GEAR[g.def].adjacent && bag.touching(it, g)) out.add(g);
    } else if (GEAR[it.def].adjacent) {
      for (const s of bag.scrolls) if (bag.touching(it, s)) out.add(s);
    }
    return out;
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
    if (it.kind === "scroll" || it.kind === "gear") {
      const name = itemName(it);
      const touching = it.kind === "gear" && GEAR[it.def].adjacent;
      el.innerHTML = `<img src="${this.img.get(it.def)}" alt="" class="px">${it.tier > 1 ? `<span class="tier t${it.tier}">${ROMAN[it.tier]}</span>` : ""}${touching ? '<span class="touch-dot" title="Boosts touching scrolls"></span>' : ""}`;
      el.title = name;
      el.setAttribute("aria-label", `${name}, tier ${it.tier}`);
    } else if (it.kind === "die") {
      el.style.setProperty("--die", dieColor(it.faces));
      el.innerHTML = `<img src="${this.img.get("d" + it.faces)}" alt="" class="px"><span class="label">d${it.faces}</span><span class="roll-num" hidden></span>`;
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

  // ---------- Detail panel ----------

  private renderDetail() {
    const it = this.selected;
    if (!it || it.kind === "die" || it.kind === "number") {
      this.detail.innerHTML = `<div class="card"><p class="muted">Tap a scroll or piece of gear to see what it does.</p></div>`;
      return;
    }
    if (it.kind === "gear") return this.renderGear(it);
    this.renderScroll(it);
  }

  private tierLine(tier: number) {
    return `<span class="stars" aria-label="Tier ${tier} of ${MAX_TIER}">${"★".repeat(tier)}<i>${"★".repeat(MAX_TIER - tier)}</i></span>`;
  }

  private renderGear(g: GearItem) {
    const def = GEAR[g.def];
    const bag = this.game.bag;
    let where = "Works from anywhere in your bag.";
    if (def.adjacent) {
      const n = bag.items.includes(g) ? bag.scrolls.filter((s) => bag.touching(g, s)).length : 0;
      where = n ? `Touching ${n} scroll${n > 1 ? "s" : ""} right now.` : "Not touching any scrolls yet. Move it next to one.";
    }
    this.detail.innerHTML = `
      <div class="card">
        <div class="card-head"><img src="${this.img.get(g.def)}" alt="" class="px icon"><div><h3>${def.name}</h3>${this.tierLine(g.tier)}</div></div>
        <p>${def.desc}</p>
        <p class="${def.adjacent ? "where" : "muted"}">${where}</p>
      </div>`;
  }

  private renderScroll(s: ScrollItem) {
    const def = SCROLLS[s.def];
    const st = this.game.loadout.spells.find((x) => x.item === s);
    const sockets = (["count", "speed"] as SocketKey[])
      .map((key) => {
        const label = key === "count" ? "Count" : "Speed";
        const help = key === "count" ? def.countLabel : s.def === "orbit" ? "Spins 8% faster per pip" : "Casts 8% faster per pip";
        return `<div class="socket" data-socket="${key}"><span class="socket-label">${label}</span><div class="socket-slot" data-slot="${key}"></div><span class="socket-help">${help}</span></div>`;
      })
      .join("");
    const rows = st ? statRows(st) : [["Status", "Place it in your bag to use it"]];
    this.detail.innerHTML = `
      <div class="card">
        <div class="card-head"><img src="${this.img.get(s.def)}" alt="" class="px icon tall"><div><h3>${def.name}</h3>${this.tierLine(s.tier)}</div></div>
        <p>${def.desc}</p>
        <div class="sockets">${sockets}</div>
        <dl class="stats">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
        ${st?.boosts.length ? `<p class="where">Boosted by ${[...new Set(st.boosts)].join(", ")}</p>` : ""}
      </div>`;
    for (const key of ["count", "speed"] as SocketKey[]) {
      const slot = this.detail.querySelector(`[data-slot="${key}"]`)!;
      const n = s.sockets[key];
      if (n) slot.appendChild(this.itemEl(n, { type: "socket", key }));
      else slot.innerHTML = `<span class="empty">–</span>`;
    }
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
      if (d.item.kind === "number") this.detail.querySelector(".sockets")?.classList.add("drop-ready");
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
      px: Math.floor((e.clientX - g.left) / cell),
      py: Math.floor((e.clientY - g.top) / cell),
      inside: e.clientX >= g.left && e.clientX <= g.right && e.clientY >= g.top && e.clientY <= g.bottom,
    };
  }

  private itemAtCell(x: number, y: number, ignore?: Item): Item | undefined {
    return this.game.bag.items.find((it) => it !== ignore && x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h);
  }

  private updateGhost(e: PointerEvent) {
    const d = this.drag!;
    const c = this.cellUnder(e, d);
    this.layer.querySelectorAll(".merge-target").forEach((el) => el.classList.remove("merge-target"));
    if (!c.inside) {
      this.ghost.hidden = true;
      return;
    }
    const under = this.itemAtCell(c.px, c.py, d.item);
    if (under && (this.game.bag.canMerge(d.item, under) || (d.item.kind === "number" && under.kind === "scroll"))) {
      const idx = this.game.bag.items.indexOf(under);
      this.layer.children[idx]?.classList.add("merge-target");
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
    this.trash.classList.remove("drop-ready");
    if (!d.moved) {
      if (d.item.kind === "die") this.roll(d.item);
      else {
        this.selected = d.item.kind === "number" ? this.selected : d.item;
        if (d.item.kind === "number") this.toast("Drag this number onto a scroll.");
        this.render();
      }
      return;
    }
    d.el.remove();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const socketEl = target?.closest<HTMLElement>("[data-socket]");
    const c = this.cellUnder(e, d);
    const under = c.inside ? this.itemAtCell(c.px, c.py, d.item) : undefined;
    if (socketEl && d.item.kind === "number" && this.selected?.kind === "scroll") {
      this.slot(d.item, d.from, this.selected, socketEl.dataset.socket as SocketKey);
    } else if (target?.closest(".trash")) {
      this.discard(d.item, d.from);
    } else if (under && d.item.kind === "number" && under.kind === "scroll") {
      const key: SocketKey = !under.sockets.count ? "count" : !under.sockets.speed ? "speed" : "count";
      this.slot(d.item, d.from, under, key);
      this.selected = under;
    } else if (under && (d.item.kind === "scroll" || d.item.kind === "gear") && (under.kind === "scroll" || under.kind === "gear") && this.game.bag.canMerge(d.item, under)) {
      this.mergeInto(d.item, under);
    } else if (c.inside) {
      this.moveToGrid(d.item, d.from, c.x, c.y);
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

  private detachFrom(item: Item, from: From) {
    const bag = this.game.bag;
    if (from.type === "socket" && this.selected?.kind === "scroll") this.selected.sockets[from.key] = null;
    else if (from.type === "pending") bag.pending = null;
    else bag.remove(item);
  }

  private moveToGrid(item: Item, from: From, x: number, y: number) {
    const bag = this.game.bag;
    if (!bag.fits(item.w, item.h, x, y, item)) return;
    if (from.type === "socket" && this.selected?.kind === "scroll") this.selected.sockets[from.key] = null;
    bag.placeAt(item, x, y);
  }

  private mergeInto(src: ScrollItem | GearItem, dst: ScrollItem | GearItem) {
    const bag = this.game.bag;
    if (bag.pending === src) bag.pending = null;
    const loose = bag.merge(src, dst);
    let lost = 0;
    for (const n of loose) if (!bag.add(n)) lost++;
    this.selected = dst;
    this.toast(`${itemName(dst)} merged to tier ${ROMAN[dst.tier]}!`, "gold");
    if (lost) this.toast("No room for a socketed number, so it was thrown away.", "warn");
  }

  private slot(item: NumberItem, from: From, scroll: ScrollItem, key: SocketKey) {
    const bag = this.game.bag;
    const old = scroll.sockets[key];
    if (old === item) return;
    if (from.type === "socket" && this.selected === scroll) {
      scroll.sockets[from.key] = old;
      scroll.sockets[key] = item;
    } else {
      this.detachFrom(item, from);
      scroll.sockets[key] = item;
      if (old && !bag.add(old)) this.toast(`No room for the old ${old.value}, so it was thrown away.`, "warn");
    }
    this.game.refreshLoadout();
    const def = SCROLLS[scroll.def];
    this.toast(key === "count" ? `${def.name}: ${def.countLabel.toLowerCase()} set to ${item.value}.` : `${def.name} speed +${Math.round(item.value * CFG.speedPerPip * 100)}%.`, "good");
  }

  private discard(item: Item, from: From) {
    const bag = this.game.bag;
    if (item.kind === "scroll" && bag.scrolls.filter((s) => !SCROLLS[s.def].utility && s !== item).length === 0 && !SCROLLS[item.def].utility && from.type === "grid") {
      this.toast("You need at least one attack scroll!", "warn");
      return;
    }
    this.detachFrom(item, from);
    if (item.kind === "scroll") for (const n of Object.values(item.sockets)) if (n) bag.add(n);
  }

  private roll(die: DieItem) {
    const bag = this.game.bag;
    const fromTray = bag.pending === die;
    this.rolling.add(die.id);
    this.render();
    const host = fromTray ? this.tray : this.layer;
    const el = host.querySelector<HTMLElement>(".rolling");
    const num = el?.querySelector<HTMLElement>(".roll-num");
    if (num) num.hidden = false;
    const iv = window.setInterval(() => {
      if (num) num.textContent = String(rollDie(die.faces));
    }, 55);
    window.setTimeout(() => {
      window.clearInterval(iv);
      this.rolling.delete(die.id);
      const value = rollDie(die.faces);
      const n = makeNumber(value, die.faces);
      if (fromTray) {
        bag.pending = null;
        if (!bag.add(n)) bag.pending = n;
      } else {
        bag.remove(die);
        bag.placeAt(n, die.x, die.y);
      }
      this.justRolled = n.id;
      if (value === die.faces) this.toast(`MAX ROLL! ${value} on a d${die.faces}!`, "gold");
      else if (value === 1) this.toast(`Ouch, a 1 on a d${die.faces}.`, "warn");
      else this.toast(`Rolled a ${value} on a d${die.faces}.`);
      this.changed();
      this.justRolled = null;
    }, 750);
  }

  private changed() {
    this.game.refreshLoadout();
    if (this.isOpen) this.render();
    this.onChange();
  }
}

function statRows(st: SpellStats): [string, string][] {
  const cd = `${st.cooldown.toFixed(2)}s`;
  const dmg = String(Math.round(st.damage));
  const rows: [string, string][] = [];
  switch (st.item.def) {
    case "fireball":
      rows.push(["Fireballs per cast", String(st.count)], ["Time between casts", cd], ["Damage each", dmg]);
      break;
    case "frost":
      rows.push(["Waves", String(st.count)], ["Time between casts", cd], ["Damage", dmg], ["Size", `${Math.round(st.area)}px`]);
      break;
    case "zap":
      rows.push(["Enemies hit", String(st.count + 1)], ["Time between casts", cd], ["Damage each", dmg]);
      break;
    case "orbit":
      rows.push(["Rocks", String(Math.max(1, st.count))], ["Spin speed", `+${Math.round(st.pips * CFG.speedPerPip * 100)}%`], ["Damage per hit", dmg]);
      break;
    case "puddle":
      rows.push(["Puddles per cast", String(st.count)], ["Time between casts", cd], ["Damage per tick", dmg]);
      break;
    case "ward":
      rows.push(["Bubble lasts", `${(3 + st.count * 0.5).toFixed(1)}s`], ["Every", cd]);
      break;
    case "mend":
      rows.push(["Heals", `${Math.round((0.12 + st.count * 0.03) * 100)}% health`], ["Every", cd]);
      break;
  }
  if (st.burn > 0) rows.push(["Burn", `${st.burn}/s for ${CFG.burnTime}s`]);
  return rows;
}
