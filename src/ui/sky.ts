import { figureURL, glyphURL } from "../art/glyphs";
import { CONS, ConId, LIGHT_CAP, STAR, STARS, Sky, Star } from "../sky";

// The sky screen: your whole skill tree on one screen, no scrolling.
// It also runs the two special moments: choosing a constellation, and watching it appear.

const KIND_LABEL: Record<Star["kind"], string> = { gate: "First star · free", star: "", bright: "Bright star" };

export class SkyScreen {
  readonly root: HTMLElement;
  isOpen = false;
  /** True while the player is choosing a constellation (the sheet can't be closed). */
  picking = false;
  private selected: Star | null = null;
  private undo: Star[] = [];
  private headline = "";
  private els: { title: HTMLElement; sub: HTMLElement; map: HTMLElement; detail: HTMLElement; done: HTMLButtonElement; undo: HTMLButtonElement; light: HTMLButtonElement; pick: HTMLElement; banner: HTMLElement };

  constructor(private sky: () => Sky, private onClose: () => void, private sfx: (name: "tap" | "light" | "discover") => void) {
    this.root = document.createElement("div");
    this.root.className = "sheet sky-sheet";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="sheet-panel" role="dialog" aria-label="The night sky">
        <header class="sheet-head">
          <div><h2 class="sky-title">The night sky</h2><span class="sky-sub"></span></div>
          <button class="icon-btn close" type="button" aria-label="Close">✕</button>
        </header>
        <div class="sky-wrap"><div class="sky-map"><div class="sky-inner"></div></div><div class="sky-banner" hidden></div></div>
        <div class="detail"></div>
        <div class="sky-actions">
          <button class="btn ghost undo" type="button">Undo</button>
          <button class="btn done" type="button">Back to the night</button>
          <button class="btn light" type="button">Light it</button>
        </div>
        <div class="pick" hidden></div>
      </div>`;
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.els = { title: q(".sky-title"), sub: q(".sky-sub"), map: q(".sky-inner"), detail: q(".detail"), done: q(".done"), undo: q(".undo"), light: q(".light"), pick: q(".pick"), banner: q(".sky-banner") };
    q<HTMLButtonElement>(".close").addEventListener("click", () => this.close());
    this.els.done.addEventListener("click", () => this.close());
    this.els.light.addEventListener("click", () => this.lightSelected());
    this.els.undo.addEventListener("click", () => {
      const s = this.undo.pop();
      if (!s) return;
      this.sky().unlight(s);
      this.selected = s;
      this.sfx("tap");
      this.render();
    });
  }

  /** Opens the sky. `reveal` plays the "a constellation appears" animation for that constellation. */
  open(headline = "", reveal?: ConId) {
    this.headline = headline;
    this.isOpen = true;
    this.root.hidden = false;
    this.undo = [];
    const sky = this.sky();
    const open = sky.options();
    if (reveal) this.selected = STAR.get(reveal)!;
    else if (!this.selected || sky.points > 0 || sky.state(this.selected) === "hidden") this.selected = open[0] ?? STAR.get("moon")!;
    this.render(reveal);
    if (reveal) {
      const c = CONS[reveal];
      this.els.banner.hidden = false;
      this.els.banner.style.setProperty("--c", c.color);
      this.els.banner.innerHTML = `<b>${c.name}</b><span>${c.spell} learned</span>`;
      setTimeout(() => (this.els.banner.hidden = true), 2600);
    } else this.els.banner.hidden = true;
  }

  private close() {
    if (this.picking) return;
    this.isOpen = false;
    this.root.hidden = true;
    this.onClose();
  }

  /** Force-closes without telling anyone (used when a run ends or restarts). */
  hide() {
    this.isOpen = false;
    this.picking = false;
    this.root.hidden = true;
    this.els.pick.hidden = true;
  }

  /** Shows a choice of constellations over the sky. */
  pick(offers: ConId[], title: string, sub: string, onPick: (c: ConId) => void) {
    this.isOpen = true;
    this.picking = true;
    this.root.hidden = false;
    this.els.banner.hidden = true;
    this.render();
    const el = this.els.pick;
    el.hidden = false;
    el.innerHTML = `<h2>${title}</h2><p>${sub}</p><div class="offers"></div>`;
    const list = el.querySelector(".offers")!;
    for (const id of offers) {
      const c = CONS[id];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "offer";
      card.style.setProperty("--c", c.color);
      card.innerHTML = `
        <span class="o-fig"><img src="${figureURL(id, c.color)}" alt="" class="px"></span>
        <span class="o-text"><b>${c.name}</b><em>${c.spell}</em><span>${STAR.get(id)!.desc}</span></span>`;
      card.addEventListener("click", () => {
        el.hidden = true;
        this.picking = false;
        onPick(id);
      });
      list.appendChild(card);
    }
  }

  private render(reveal?: ConId) {
    const sky = this.sky();
    if (!this.selected || sky.state(this.selected) === "hidden") this.selected = STAR.get("moon")!;
    this.els.title.textContent = this.headline || "The night sky";
    const left = LIGHT_CAP - sky.spent;
    this.els.sub.innerHTML =
      sky.points > 0
        ? `<b>${sky.points}</b> star${sky.points > 1 ? "s" : ""} to light · ${sky.spent} of ${LIGHT_CAP} lit`
        : left > 0
          ? `${sky.spent} of ${LIGHT_CAP} stars lit · gather stardust for more`
          : `All ${LIGHT_CAP} stars lit. This is your sky tonight.`;
    this.els.sub.classList.toggle("has", sky.points > 0);
    this.els.undo.hidden = this.undo.length === 0;

    // Figures and names, lines, then the stars themselves
    let html = "";
    for (const c of Object.values(CONS)) {
      const found = sky.found.includes(c.id);
      const [col, row] = c.cell;
      const cls = `${found ? "found" : ""}${reveal === c.id ? " reveal" : ""}`;
      html += `<img class="fig px ${cls}" src="${figureURL(c.id, c.color)}" alt="" style="left:${(col / 3) * 100}%;top:${(row / 3) * 100}%">`;
      if (c.id !== "moon") {
        // The name sits in a free corner of the cell: out past one wing, away from the Moon
        const len = Math.hypot(1 - col, 1 - row);
        const ix = (1 - col) / len;
        const iy = (1 - row) / len;
        const spot = (side: number) => ({ x: col + 0.5 - ix * 0.4 - iy * side, y: row + 0.5 - iy * 0.4 + ix * side });
        const [p1, p2] = [spot(0.42), spot(-0.42)];
        const at = Math.abs(p1.x - col - 0.5) <= Math.abs(p2.x - col - 0.5) ? p1 : p2;
        html += `<span class="cname ${cls}" style="left:${(at.x / 3) * 100}%;top:${(at.y / 3) * 100}%;--c:${c.color}">${found ? c.name.replace("The ", "") : "?"}</span>`;
      }
    }
    html += `<svg class="lines" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">`;
    const seen = new Set<string>();
    for (const s of STARS)
      for (const l of s.links) {
        const key = s.id < l ? s.id + l : l + s.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const o = STAR.get(l)!;
        const found = sky.found.includes(s.con);
        const lit = sky.has(s.id) && sky.has(o.id);
        html += `<line x1="${s.x * 100}" y1="${s.y * 100}" x2="${o.x * 100}" y2="${o.y * 100}" pathLength="1" class="${found ? (lit ? "lit" : "found") : ""}${reveal === s.con ? " reveal" : ""}" style="--c:${CONS[s.con].color}"/>`;
      }
    html += `</svg>`;
    this.els.map.innerHTML = html;
    let order = 0;
    for (const s of STARS) {
      const st = sky.state(s);
      const c = CONS[s.con];
      const el = document.createElement("button");
      el.type = "button";
      el.className = `star ${s.kind} ${st}${sky.canLight(s) ? " can" : ""}${s === this.selected ? " sel" : ""}${reveal === s.con ? " reveal" : ""}`;
      el.style.cssText = `left:${(s.x / 3) * 100}%;top:${(s.y / 3) * 100}%;--c:${c.color};--d:${reveal === s.con ? 0.25 + order++ * 0.22 : 0}s`;
      el.disabled = st === "hidden";
      el.setAttribute("aria-label", st === "hidden" ? "A hidden star" : `${s.name}, ${st}`);
      if (st !== "hidden") {
        el.innerHTML = `<img src="${glyphURL(s.icon, st === "lit" ? c.color : st === "open" ? "#ffffff" : "#8a86b8", 2)}" alt="" class="px">`;
        el.addEventListener("click", () => {
          this.selected = s;
          this.sfx("tap");
          this.render();
        });
      }
      this.els.map.appendChild(el);
    }
    this.renderDetail();
  }

  private renderDetail() {
    const sky = this.sky();
    const s = this.selected!;
    const c = CONS[s.con];
    const st = sky.state(s);
    const can = sky.canLight(s);
    let note = "";
    if (st === "dim") note = "Light a star next to this one first.";
    else if (st === "open" && sky.points <= 0) note = sky.earned >= LIGHT_CAP ? `You've lit all ${LIGHT_CAP} of tonight's stars.` : "Gather stardust to earn a star.";
    const kind = st === "lit" && s.kind !== "gate" ? "Lit" : KIND_LABEL[s.kind];
    this.els.detail.innerHTML = `
      <div class="d-head"><img src="${glyphURL(s.icon, c.color, 3)}" alt="" class="px"><b>${s.name}</b><em style="--c:${c.color}">${c.name}</em>${kind ? `<small>${kind}</small>` : ""}</div>
      <p>${s.desc}</p>
      ${note ? `<p class="d-note">${note}</p>` : ""}`;
    // The main button lights the selected star when it can; otherwise it takes you back
    this.els.light.hidden = !can;
    this.els.done.classList.toggle("ghost", can);
    this.els.done.textContent = can ? "Back" : sky.points > 0 && sky.options().length ? "Save for later" : "Back to the night";
  }

  private lightSelected() {
    const sky = this.sky();
    const s = this.selected!;
    if (!sky.light(s)) return;
    this.undo.push(s);
    this.sfx("light");
    // Move on to the next open star, staying in the same constellation if possible
    const open = sky.options();
    if (sky.points > 0 && open.length) this.selected = open.find((o) => o.con === s.con) ?? open[0];
    this.render();
    [...this.els.map.querySelectorAll<HTMLElement>(".star.lit")].find((e) => e.getAttribute("aria-label")?.startsWith(s.name + ","))?.classList.add("pop");
  }
}
