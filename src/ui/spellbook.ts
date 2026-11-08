import { Art, spriteURL } from "../art";
import type { Book, OwnedScroll } from "../book";
import { EMPTY_SLOT_BONUS, SCROLLS, ScrollId, TreeNode } from "../content";

// The spellbook: one tab per scroll slot, the selected scroll's skill tree, and a
// details drawer with a Learn button. Built for thumbs first.

export class Spellbook {
  readonly root: HTMLElement;
  isOpen = false;
  private tab = 0;
  private selected: TreeNode | null = null;
  private icons = new Map<ScrollId, string>();
  private headline = "";
  private els: {
    title: HTMLElement; points: HTMLElement; tabs: HTMLElement; tree: HTMLElement; svg: SVGSVGElement;
    detail: HTMLElement; done: HTMLButtonElement;
  };

  constructor(art: Art, private book: () => Book, private onClose: () => void) {
    for (const [id, s] of art.scrolls) this.icons.set(id, spriteURL(s, 4));
    this.root = document.createElement("div");
    this.root.className = "sheet book-sheet";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="sheet-panel" role="dialog" aria-label="Spellbook">
        <header class="sheet-head">
          <div><h2 class="book-title">Spellbook</h2><span class="book-points"></span></div>
          <button class="icon-btn close" type="button" aria-label="Close spellbook">✕</button>
        </header>
        <nav class="tabs" role="tablist"></nav>
        <div class="tree-wrap"><div class="tree"><svg class="links" aria-hidden="true"></svg></div></div>
        <div class="detail"></div>
        <button class="btn done" type="button">Back to the fight</button>
      </div>`;
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.els = {
      title: q(".book-title"), points: q(".book-points"), tabs: q(".tabs"), tree: q(".tree"), svg: q(".links"),
      detail: q(".detail"), done: q(".done"),
    };
    q<HTMLButtonElement>(".close").addEventListener("click", () => this.onClose());
    this.els.done.addEventListener("click", () => this.onClose());
    addEventListener("resize", () => this.isOpen && this.drawLinks());
  }

  open(headline = "") {
    this.headline = headline;
    this.isOpen = true;
    this.root.hidden = false;
    const b = this.book();
    // Jump to a scroll that has something to learn
    if (!b.slots[this.tab] || (b.points > 0 && !this.hasOptions(this.tab))) {
      const i = b.slots.findIndex((s, k) => s && this.hasOptions(k));
      this.tab = i >= 0 ? i : b.slots.findIndex((s) => s);
    }
    this.selected = null;
    this.render();
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
  }

  private hasOptions(slot: number) {
    const b = this.book();
    const s = b.slots[slot];
    return !!s && SCROLLS[s.id].nodes.some((n) => b.state(s, n) === "available" || (b.state(s, n) === "learned" && (s.ranks[n.id] ?? 0) < n.ranks));
  }

  render() {
    const b = this.book();
    this.els.title.textContent = this.headline || "Spellbook";
    this.els.points.textContent = b.points > 0 ? `${b.points} point${b.points > 1 ? "s" : ""} to spend` : "No points to spend";
    this.els.points.classList.toggle("has", b.points > 0);
    this.els.done.textContent = b.points > 0 ? "Save points for later" : "Back to the fight";

    // Tabs
    this.els.tabs.replaceChildren(
      ...b.slots.map((s, i) => {
        const t = document.createElement("button");
        t.type = "button";
        t.className = "tab" + (i === this.tab ? " on" : "") + (s ? "" : " empty");
        t.setAttribute("role", "tab");
        if (s) {
          const def = SCROLLS[s.id];
          t.innerHTML = `<img src="${this.icons.get(s.id)}" alt="" class="px"><span>${def.short}</span><small>${s.spent} pts</small>${b.points > 0 && this.hasOptions(i) ? '<i class="dot"></i>' : ""}`;
          t.addEventListener("click", () => {
            this.tab = i;
            this.selected = null;
            this.render();
          });
        } else {
          t.innerHTML = `<span>Empty slot</span><small>+${Math.round(EMPTY_SLOT_BONUS * 100)}% damage</small>`;
          t.disabled = true;
        }
        return t;
      }),
    );

    const s = b.slots[this.tab];
    if (!s) return;
    const def = SCROLLS[s.id];
    if (!this.selected) this.selected = def.nodes.find((n) => b.canLearn(s, n)) ?? def.nodes[0];

    // Tree: 3 columns, 6 tiers
    const nodes = def.nodes.map((n) => {
      const st = b.state(s, n);
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.id = n.id;
      const learnable = b.canLearn(s, n);
      el.className = `node ${st}${learnable ? " can" : ""}${n === this.selected ? " sel" : ""}${n.ranks > 1 ? " rank" : ""}${n.tier === 5 ? " cap" : ""}`;
      el.style.gridColumn = String(n.col + 1);
      el.style.gridRow = String(n.tier + 1);
      el.style.setProperty("--c", def.color);
      const r = s.ranks[n.id] ?? 0;
      const pips = n.ranks > 9 ? `<span class="pips">Rank ${r}</span>` : n.ranks > 1 ? `<span class="pips">${"●".repeat(r)}${"○".repeat(n.ranks - r)}</span>` : "";
      el.innerHTML = `<span class="nm">${n.name}</span>${n.die ? `<span class="die">d${n.die}</span>` : ""}${pips}`;
      el.setAttribute("aria-label", `${n.name}, ${st}`);
      el.addEventListener("click", () => {
        this.selected = n;
        this.render();
      });
      return el;
    });
    this.els.tree.replaceChildren(this.els.svg, ...nodes);
    this.drawLinks();
    this.renderDetail(s);
  }

  private renderDetail(s: OwnedScroll) {
    const b = this.book();
    const n = this.selected!;
    const st = b.state(s, n);
    const r = s.ranks[n.id] ?? 0;
    const can = b.canLearn(s, n);
    let note = "";
    if (st === "closed") note = "Closed off: you picked the other option on this tier.";
    else if (st === "locked") note = "Learn something on the tier above first.";
    else if (st === "maxed" || (st === "learned" && n.ranks === 1)) note = "Learned.";
    else if (b.points <= 0) note = "Level up to earn a point.";
    this.els.detail.innerHTML = `
      <div class="d-head"><b>${n.name}</b>${n.ranks > 9 ? `<span class="d-rank">Rank ${r}</span>` : n.ranks > 1 ? `<span class="d-rank">Rank ${r} / ${n.ranks}</span>` : ""}${n.die ? `<span class="die">Rolls a d${n.die}</span>` : ""}</div>
      <p>${n.desc}</p>
      ${note ? `<p class="d-note">${note}</p>` : ""}
      <button class="btn learn" type="button" ${can ? "" : "disabled"}>${can ? (r > 0 ? "Add a rank · 1 point" : "Learn · 1 point") : "Learn"}</button>`;
    this.els.detail.querySelector(".learn")!.addEventListener("click", () => {
      if (b.learn(s, n)) {
        this.root.querySelector(`[data-id="${n.id}"]`)?.classList.add("pop");
        // Move the selection on to the next thing worth learning
        const next = SCROLLS[s.id].nodes.find((m) => b.canLearn(s, m));
        if (next && (s.ranks[n.id] ?? 0) >= n.ranks) this.selected = next;
        this.render();
        this.root.querySelector(`[data-id="${n.id}"]`)?.classList.add("pop");
      }
    });
  }

  /** Lines between tiers: every node connects to the nodes on the tier above it. */
  private drawLinks() {
    const s = this.book().slots[this.tab];
    if (!s) return;
    const def = SCROLLS[s.id];
    const box = this.els.tree.getBoundingClientRect();
    const b = this.book();
    let html = "";
    for (const n of def.nodes) {
      if (n.tier === 0) continue;
      const a = this.els.tree.querySelector(`[data-id="${n.id}"]`)?.getBoundingClientRect();
      if (!a) continue;
      for (const m of def.nodes.filter((x) => x.tier === n.tier - 1)) {
        const c = this.els.tree.querySelector(`[data-id="${m.id}"]`)?.getBoundingClientRect();
        if (!c) continue;
        const lit = (s.ranks[m.id] ?? 0) > 0 && (s.ranks[n.id] ?? 0) > 0;
        const open = (s.ranks[m.id] ?? 0) > 0 && b.state(s, n) === "available";
        const x1 = c.left + c.width / 2 - box.left;
        const y1 = c.bottom - box.top;
        const x2 = a.left + a.width / 2 - box.left;
        const y2 = a.top - box.top;
        const my = (y1 + y2) / 2;
        html += `<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" class="${lit ? "lit" : open ? "open" : ""}" style="--c:${def.color}"/>`;
      }
    }
    this.els.svg.innerHTML = html;
  }
}

/** The "you found a scroll" picker, including choosing a slot to replace when full. */
export class ScrollOffer {
  readonly root: HTMLElement;
  isOpen = false;
  private icons = new Map<ScrollId, string>();

  constructor(art: Art, private book: () => Book, private onDone: (msg: string) => void) {
    for (const [id, s] of art.scrolls) this.icons.set(id, spriteURL(s, 5));
    this.root = document.createElement("div");
    this.root.className = "sheet offer-sheet";
    this.root.hidden = true;
  }

  open() {
    const b = this.book();
    const pool = b.missing().sort(() => Math.random() - 0.5).slice(0, 2);
    this.isOpen = true;
    this.root.hidden = false;
    if (!pool.length) {
      b.points += 1;
      this.finish("You know every scroll already, so you gained a skill point instead.");
      return;
    }
    this.root.innerHTML = `
      <div class="sheet-panel short" role="dialog" aria-label="You found a scroll">
        <header class="sheet-head"><div><h2>You found a scroll!</h2><span class="book-points">Choose one to learn</span></div></header>
        <div class="offers"></div>
        <button class="btn ghost skip" type="button">Leave it</button>
      </div>`;
    const list = this.root.querySelector(".offers")!;
    for (const id of pool) {
      const def = SCROLLS[id];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "offer";
      card.style.setProperty("--c", def.color);
      card.innerHTML = `<img src="${this.icons.get(id)}" alt="" class="px"><span class="o-text"><b>${def.name}</b><span>${def.desc}</span>${def.support ? '<em>Support</em>' : ""}</span>`;
      card.addEventListener("click", () => this.take(id));
      list.appendChild(card);
    }
    this.root.querySelector(".skip")!.addEventListener("click", () => this.finish(""));
  }

  private take(id: ScrollId) {
    const b = this.book();
    const slot = b.firstEmpty();
    if (slot >= 0) {
      b.put(slot, id);
      this.finish(`${SCROLLS[id].name} added. Spend points in its tree!`);
      return;
    }
    // Full: choose a scroll to replace
    const panel = this.root.querySelector(".sheet-panel")!;
    panel.innerHTML = `
      <header class="sheet-head"><div><h2>Your slots are full</h2><span class="book-points">Replace a scroll with the ${SCROLLS[id].name}. You get half its points back.</span></div></header>
      <div class="offers"></div>
      <button class="btn ghost skip" type="button">Keep my scrolls</button>`;
    const list = panel.querySelector(".offers")!;
    b.slots.forEach((s, i) => {
      if (!s) return;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "offer";
      card.style.setProperty("--c", SCROLLS[s.id].color);
      card.innerHTML = `<img src="${this.icons.get(s.id)}" alt="" class="px"><span class="o-text"><b>Replace ${SCROLLS[s.id].name}</b><span>${s.spent} points spent · ${Math.floor(s.spent / 2)} back</span></span>`;
      card.addEventListener("click", () => {
        const refund = b.put(i, id);
        this.finish(`${SCROLLS[id].name} learned${refund ? `, ${refund} point${refund > 1 ? "s" : ""} back` : ""}.`);
      });
      list.appendChild(card);
    });
    panel.querySelector(".skip")!.addEventListener("click", () => this.finish(""));
  }

  private finish(msg: string) {
    this.isOpen = false;
    this.root.hidden = true;
    this.onDone(msg);
  }
}
