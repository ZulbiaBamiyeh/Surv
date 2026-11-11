import { Art, SCROLL_GLYPH, spriteURL } from "../art";
import { glyphURL } from "../art/glyphs";
import type { Book, ScrollOffer as Offer } from "../book";
import { entryOf } from "../book";
import {
  NODE, REGIONS, RegionDef, SCROLLS, START, SUPPORTS, ScrollId, SupportId, TREE, TreeNode, opensWith,
} from "../content";
import type { Game } from "../game";

// The spellbook: one big tree you can drag around and pinch to zoom, with a details
// drawer and a Learn button. Built for thumbs first.

const U = 48; // pixels per tree unit at zoom 1
const HALF = 21; // the tree spans about ±21 units
const SIZE: Record<TreeNode["kind"], number> = { small: 26, notable: 40, keystone: 48, entry: 42, start: 46 };
const KIND_LABEL: Record<TreeNode["kind"], string> = { small: "", notable: "Notable", keystone: "Keystone", entry: "Free with its scrolls", start: "Your first spell" };

const px = (n: TreeNode) => ({ x: (n.x + HALF) * U, y: (n.y + HALF) * U });
const needsText = (r: RegionDef) => r.needs.map((n) => SCROLLS[n].short).join(" + ");
const colorOf = (n: TreeNode) => (n.region ? REGIONS.get(n.region)!.color : n.kind === "keystone" ? "#ff6a8a" : "#ffb04a");

export class Spellbook {
  readonly root: HTMLElement;
  isOpen = false;
  private selected: TreeNode | null = null;
  private headline = "";
  private history: TreeNode[] = [];
  private view = { x: 0, y: 0, z: 1 };
  private icons = new Map<string, string>();
  private els: {
    title: HTMLElement; points: HTMLElement; stats: HTMLElement; viewport: HTMLElement; world: HTMLElement; svg: SVGSVGElement;
    nodes: HTMLElement; detail: HTMLElement; done: HTMLButtonElement; undo: HTMLButtonElement; mute: HTMLButtonElement;
  };

  constructor(private game: () => Game, private onClose: () => void, private onMute: () => boolean) {
    this.root = document.createElement("div");
    this.root.className = "sheet book-sheet";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="sheet-panel" role="dialog" aria-label="Spellbook">
        <header class="sheet-head">
          <div><h2 class="book-title">Spellbook</h2><span class="book-points"></span></div>
          <div class="head-btns">
            <button class="icon-btn mute" type="button" aria-label="Sound on or off">♪</button>
            <button class="icon-btn close" type="button" aria-label="Close spellbook">✕</button>
          </div>
        </header>
        <div class="stat-strip"></div>
        <div class="tree-view">
          <div class="tree-world">
            <svg class="links" aria-hidden="true"></svg>
            <div class="tree-nodes"></div>
          </div>
          <div class="zoom">
            <button class="icon-btn" type="button" data-z="in" aria-label="Zoom in">+</button>
            <button class="icon-btn" type="button" data-z="out" aria-label="Zoom out">−</button>
            <button class="icon-btn" type="button" data-z="home" aria-label="Back to the middle">◎</button>
          </div>
        </div>
        <div class="detail"></div>
        <div class="book-actions">
          <button class="btn ghost undo" type="button">Undo</button>
          <button class="btn done" type="button">Back to the fight</button>
        </div>
      </div>`;
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.els = {
      title: q(".book-title"), points: q(".book-points"), stats: q(".stat-strip"), viewport: q(".tree-view"), world: q(".tree-world"),
      svg: q(".links"), nodes: q(".tree-nodes"), detail: q(".detail"), done: q(".done"), undo: q(".undo"), mute: q(".mute"),
    };
    const W = HALF * 2 * U;
    this.els.world.style.width = this.els.world.style.height = W + "px";
    this.els.svg.setAttribute("viewBox", `0 0 ${W} ${W}`);
    this.els.svg.setAttribute("width", String(W));
    this.els.svg.setAttribute("height", String(W));
    q<HTMLButtonElement>(".close").addEventListener("click", () => this.onClose());
    this.els.done.addEventListener("click", () => this.onClose());
    this.els.undo.addEventListener("click", () => this.undo());
    this.els.mute.addEventListener("click", () => this.els.mute.classList.toggle("off", !this.onMute()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-z]").forEach((b) =>
      b.addEventListener("click", () => {
        const z = b.dataset.z;
        if (z === "home") this.focus(NODE.get(START)!, 1);
        else this.zoomAt(z === "in" ? 1.3 : 1 / 1.3);
      }),
    );
    this.setupPan();
    addEventListener("resize", () => this.isOpen && this.applyView());
  }

  private get book(): Book {
    return this.game().book;
  }

  private icon(name: string, color: string, scale = 3) {
    const key = name + color + scale;
    let u = this.icons.get(key);
    if (!u) this.icons.set(key, (u = glyphURL(name, color, scale)));
    return u;
  }

  open(headline = "") {
    this.headline = headline;
    this.isOpen = true;
    this.root.hidden = false;
    this.history = [];
    const b = this.book;
    // Start on something worth learning
    if (!this.selected || b.points > 0) this.selected = this.suggest() ?? this.selected ?? NODE.get(START)!;
    this.render();
    requestAnimationFrame(() => this.focus(this.selected!, this.view.z || 1));
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
  }

  /** The open node closest to the middle, preferring named ones. */
  private suggest(): TreeNode | null {
    const opts = this.book.options();
    if (!opts.length) return null;
    return opts.sort((a, b) => Number(a.kind === "small") - Number(b.kind === "small") || Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
  }

  private undo() {
    const n = this.history.pop();
    if (n && this.book.refund(n)) {
      this.selected = n;
      this.render();
    }
  }

  render() {
    const b = this.book;
    const g = this.game();
    this.els.title.textContent = this.headline || "Spellbook";
    this.els.points.textContent = b.points > 0 ? `${b.points} point${b.points > 1 ? "s" : ""} to spend` : "No points to spend";
    this.els.points.classList.toggle("has", b.points > 0);
    this.els.done.textContent = b.points > 0 ? "Save points for later" : "Back to the fight";
    this.els.undo.hidden = this.history.length === 0;
    this.els.stats.innerHTML = g
      .spellStats()
      .map(([k, v]) => `<span><small>${k}</small><b>${v}</b></span>`)
      .join("");

    // Region halos and labels, then links, all in one SVG layer
    let svg = "";
    for (const r of REGIONS.values()) {
      const ns = TREE.filter((n) => n.region === r.id);
      const cx = ns.reduce((a, n) => a + px(n).x, 0) / ns.length;
      const cy = ns.reduce((a, n) => a + px(n).y, 0) / ns.length;
      const rad = Math.max(...ns.map((n) => Math.hypot(px(n).x - cx, px(n).y - cy))) + U * 0.9;
      const open = b.unsealed.has(r.id);
      svg += `<circle cx="${cx}" cy="${cy}" r="${rad}" class="halo${open ? " open" : ""}" style="--c:${r.color}"/>`;
      // Label on the outside of the region
      const len = Math.hypot(cx - HALF * U, cy - HALF * U) || 1;
      const lx = cx + ((cx - HALF * U) / len) * (rad + 10);
      const ly = cy + ((cy - HALF * U) / len) * (rad + 10);
      svg += `<text x="${lx}" y="${ly}" class="rlabel${open ? " open" : ""}" style="--c:${r.color}">${r.name}</text>`;
      if (!open) svg += `<text x="${lx}" y="${ly + 15}" class="rneeds">${needsText(r)}</text>`;
    }
    const seen = new Set<string>();
    for (const n of TREE)
      for (const l of n.links) {
        const key = n.id < l ? n.id + l : l + n.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const m = NODE.get(l)!;
        const a = px(n);
        const c = px(m);
        const ta = b.has(n.id);
        const tc = b.has(m.id);
        const sa = b.state(n);
        const sc = b.state(m);
        const cls = ta && tc ? "lit" : (ta && sc === "available") || (tc && sa === "available") ? "open" : sa === "sealed" || sc === "sealed" ? "sealed" : "";
        const col = ta && tc ? colorOf(n.region ? n : m) : "";
        svg += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" class="${cls}"${col ? ` style="--c:${col}"` : ""}/>`;
      }
    this.els.svg.innerHTML = svg;

    // Nodes
    const frag = document.createDocumentFragment();
    for (const n of TREE) {
      const st = b.state(n);
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.id = n.id;
      const can = b.canTake(n);
      el.className = `tnode ${n.kind} ${st}${can ? " can" : ""}${n === this.selected ? " sel" : ""}`;
      const size = SIZE[n.kind];
      const { x, y } = px(n);
      el.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;--c:${colorOf(n)}`;
      const iconName = n.icon === "die" ? "die" : n.icon;
      el.innerHTML = `<img src="${this.icon(iconName, st === "sealed" ? "#6a6690" : colorOf(n), n.kind === "small" ? 2 : 3)}" alt="" class="px">${n.die ? `<i class="die">d${this.game().die(n.die)}</i>` : ""}`;
      el.setAttribute("aria-label", `${n.name}, ${st}`);
      if (n.kind !== "small") {
        const lab = document.createElement("span");
        lab.className = "tlabel";
        lab.textContent = n.name;
        el.append(lab);
      }
      el.addEventListener("click", () => {
        if (this.dragged) return;
        this.selected = n;
        this.render();
      });
      frag.append(el);
    }
    this.els.nodes.replaceChildren(frag);
    this.renderDetail();
  }

  private renderDetail() {
    const b = this.book;
    const n = this.selected!;
    const st = b.state(n);
    const can = b.canTake(n);
    let note = "";
    const region = n.region ? REGIONS.get(n.region)! : null;
    if (st === "sealed" && region) {
      const have = region.needs.map((s) => `<span class="${b.scrolls.has(s) ? "got" : ""}">${SCROLLS[s].short}</span>`).join(" + ");
      note = `Sealed. Opens when you carry: ${have}`;
    } else if (st === "locked") note = "Take a node next to this one first.";
    else if (st === "taken") note = n.kind === "entry" ? "Yours. It came free with its scrolls." : "Yours.";
    else if (b.points <= 0) note = "Level up to earn a point.";
    // Preview: what the numbers become if you take it
    let preview = "";
    if (can) {
      const g = this.game();
      const before = new Map(g.spellStats());
      b.taken.add(n.id);
      b.version++;
      const after = g.spellStats();
      b.taken.delete(n.id);
      b.version++;
      preview = after
        .filter(([k, v]) => before.get(k) !== v)
        .map(([k, v]) => `<span>${k} <s>${before.get(k) ?? "–"}</s> → <b>${v}</b></span>`)
        .join("");
    }
    const kind = KIND_LABEL[n.kind];
    this.els.detail.innerHTML = `
      <div class="d-head"><img src="${this.icon(n.icon, colorOf(n), 3)}" alt="" class="px"><b>${n.name}</b>${kind ? `<em style="--c:${colorOf(n)}">${kind}</em>` : ""}${region ? `<em class="reg" style="--c:${region.color}">${region.name}</em>` : ""}</div>
      <p>${n.desc}</p>
      ${preview ? `<p class="d-preview">${preview}</p>` : ""}
      ${note ? `<p class="d-note">${note}</p>` : ""}
      <button class="btn learn" type="button" ${can ? "" : "disabled"}>${can ? "Take it · 1 point" : st === "taken" ? "Taken" : "Take it"}</button>`;
    this.els.detail.querySelector(".learn")!.addEventListener("click", () => {
      if (!b.take(n)) return;
      this.history.push(n);
      // Move on to the next sensible node
      const next = n.links.map((l) => NODE.get(l)!).find((m) => b.canTake(m)) ?? this.suggest();
      if (next && b.points > 0) this.selected = next;
      this.render();
      this.els.nodes.querySelector(`[data-id="${n.id}"]`)?.classList.add("pop");
    });
  }

  // ---------- Pan and zoom ----------
  private dragged = false;

  private applyView() {
    const v = this.view;
    this.els.world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  }

  /** Centers a node in the view. */
  focus(n: TreeNode, z = this.view.z) {
    const box = this.els.viewport.getBoundingClientRect();
    const { x, y } = px(n);
    this.view = { z, x: box.width / 2 - x * z, y: box.height / 2 - y * z };
    this.applyView();
  }

  private zoomAt(k: number, cx?: number, cy?: number) {
    const box = this.els.viewport.getBoundingClientRect();
    const v = this.view;
    const z = Math.max(0.3, Math.min(2.2, v.z * k));
    const ax = cx ?? box.width / 2;
    const ay = cy ?? box.height / 2;
    v.x = ax - ((ax - v.x) * z) / v.z;
    v.y = ay - ((ay - v.y) * z) / v.z;
    v.z = z;
    this.applyView();
  }

  private setupPan() {
    const vp = this.els.viewport;
    const ptrs = new Map<number, { x: number; y: number }>();
    let start = { x: 0, y: 0 };
    let pinch = 0;
    vp.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".zoom")) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) {
        start = { x: e.clientX, y: e.clientY };
        this.dragged = false;
      }
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    vp.addEventListener("pointermove", (e) => {
      const prev = ptrs.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      ptrs.set(e.pointerId, cur);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const box = vp.getBoundingClientRect();
        if (pinch > 0) this.zoomAt(d / pinch, (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top);
        pinch = d;
        this.dragged = true;
        return;
      }
      if (!this.dragged && Math.hypot(cur.x - start.x, cur.y - start.y) < 8) return;
      if (!this.dragged) vp.setPointerCapture(e.pointerId);
      this.dragged = true;
      this.view.x += cur.x - prev.x;
      this.view.y += cur.y - prev.y;
      this.applyView();
    });
    const end = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = 0;
      // Let the click that ends a drag be ignored, then reset
      if (ptrs.size === 0) setTimeout(() => (this.dragged = false), 0);
    };
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);
    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      const box = vp.getBoundingClientRect();
      this.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - box.left, e.clientY - box.top);
    }, { passive: false });
  }
}

/** The "you found a scroll" picker, including choosing a support slot to replace. */
export class ScrollOffer {
  readonly root: HTMLElement;
  isOpen = false;
  private icons = new Map<string, string>();

  constructor(art: Art, private book: () => Book, private onDone: (msg: string, opened: RegionDef[]) => void) {
    for (const [id, s] of art.scrolls) this.icons.set(id, spriteURL(s, 3));
    this.root = document.createElement("div");
    this.root.className = "sheet offer-sheet";
    this.root.hidden = true;
  }

  open() {
    const b = this.book();
    const offers = b.offers(3);
    this.isOpen = true;
    this.root.hidden = false;
    if (!offers.length) {
      b.points += 1;
      this.finish("You have every scroll, so you gained a skill point instead.", []);
      return;
    }
    this.root.innerHTML = `
      <div class="sheet-panel short" role="dialog" aria-label="You found a scroll">
        <header class="sheet-head"><div><h2>You found a scroll!</h2><span class="book-points">Choose one</span></div></header>
        <div class="offers"></div>
        <button class="btn ghost skip" type="button">Leave it</button>
      </div>`;
    const list = this.root.querySelector(".offers")!;
    for (const o of offers) list.appendChild(this.card(o));
    this.root.querySelector(".skip")!.addEventListener("click", () => this.finish("", []));
  }

  private card(o: Offer) {
    const b = this.book();
    const card = document.createElement("button");
    card.type = "button";
    card.className = "offer";
    let title = "";
    let body = "";
    let tag = "";
    if (o.type === "scroll") {
      const def = SCROLLS[o.id];
      card.style.setProperty("--c", def.color);
      title = def.name;
      const opens = opensWith(o.id, b.scrolls);
      const later = [...REGIONS.values()].filter((r) => r.needs.includes(o.id) && !opens.includes(r)).slice(0, 3);
      const main = opens.find((r) => r.needs.length === 1) ?? opens[0];
      const more = opens.filter((r) => r !== main);
      body = main
        ? `Opens <b>${main.name}</b>: ${NODE.get(entryOf(main.id))!.desc}${more.length ? ` <b>Also opens ${more.map((r) => r.name).join(", ")}!</b>` : ""}`
        : "Opens nothing yet on its own.";
      if (later.length) body += `<small>Later, with ${later.map((r) => `${r.needs.filter((n) => n !== o.id && !b.scrolls.has(n)).map((n) => SCROLLS[n].short).join(" + ")}: ${r.name}`).join(" · ")}</small>`;
      tag = def.niche ? "<em class='niche'>Rare</em>" : "";
    } else {
      const def = SUPPORTS[o.id];
      const lv = b.support(o.id);
      card.style.setProperty("--c", def.color);
      title = lv ? `${def.name} · level ${lv + 1}` : def.name;
      body = def.levels[lv];
      tag = "<em>Support</em>";
    }
    card.innerHTML = `<img src="${this.icons.get(o.id)}" alt="" class="px"><span class="o-text"><b>${title}</b><span>${body}</span>${tag}</span>`;
    card.addEventListener("click", () => this.take(o));
    return card;
  }

  private take(o: Offer) {
    const b = this.book();
    if (o.type === "scroll") {
      const opened = b.addScroll(o.id);
      this.finish(opened.length ? `${opened.map((r) => r.name).join(" and ")} unsealed!` : `${SCROLLS[o.id].name} added.`, opened);
      return;
    }
    if (b.addSupport(o.id)) {
      this.finish(`${SUPPORTS[o.id].name} ${b.support(o.id) > 1 ? `is now level ${b.support(o.id)}` : "added"}.`, []);
      return;
    }
    // Both support slots are full: choose one to swap out
    const panel = this.root.querySelector(".sheet-panel")!;
    panel.innerHTML = `
      <header class="sheet-head"><div><h2>Both support slots are full</h2><span class="book-points">Swap one out for ${SUPPORTS[o.id].name}.</span></div></header>
      <div class="offers"></div>
      <button class="btn ghost skip" type="button">Keep what I have</button>`;
    const list = panel.querySelector(".offers")!;
    b.supports.forEach((s, i) => {
      if (!s) return;
      const def = SUPPORTS[s.id];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "offer";
      card.style.setProperty("--c", def.color);
      card.innerHTML = `<img src="${this.icons.get(s.id)}" alt="" class="px"><span class="o-text"><b>Swap out ${def.name}</b><span>Level ${s.level}</span></span>`;
      card.addEventListener("click", () => {
        b.addSupport(o.id, i);
        this.finish(`${SUPPORTS[o.id].name} added.`, []);
      });
      list.appendChild(card);
    });
    panel.querySelector(".skip")!.addEventListener("click", () => this.finish("", []));
  }

  private finish(msg: string, opened: RegionDef[]) {
    this.isOpen = false;
    this.root.hidden = true;
    this.onDone(msg, opened);
  }
}

export const scrollGlyph = (id: ScrollId | SupportId) => SCROLL_GLYPH[id];
