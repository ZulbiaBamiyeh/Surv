import { ALL_SCROLLS, NODE, REGIONS, RegionDef, SCROLLS, ScrollId, Stats, TREE, TreeNode, ZERO_STATS, entryOf } from "./content";

export type NodeState = "taken" | "available" | "locked" | "sealed";

/** Your spell tree, the scrolls you carry, and unspent points. */
export class Book {
  points = 0;
  taken = new Set<string>();
  scrolls = new Set<ScrollId>();
  unsealed = new Set<string>();
  /** Bumped on every change so cached stats know to refresh. */
  version = 0;
  private cache: { v: number; stats: Stats } = { v: -1, stats: ZERO_STATS };

  constructor(readonly start: ScrollId) {
    this.addScroll(start);
  }

  has(id: string) {
    return this.taken.has(id);
  }

  state(n: TreeNode): NodeState {
    if (this.taken.has(n.id)) return "taken";
    if (!this.unsealed.has(n.region)) return "sealed";
    return n.links.some((l) => this.taken.has(l)) ? "available" : "locked";
  }

  canTake(n: TreeNode) {
    return this.points > 0 && this.state(n) === "available";
  }

  take(n: TreeNode): boolean {
    if (!this.canTake(n)) return false;
    this.taken.add(n.id);
    this.points--;
    this.version++;
    return true;
  }

  /** Gives a node back, if everything else you own still connects to a region's free first node. */
  canRefund(n: TreeNode) {
    if (!this.taken.has(n.id) || n.kind === "start" || n.kind === "entry") return false;
    const seen = new Set<string>();
    const stack = [...this.unsealed].map(entryOf);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || id === n.id) continue;
      seen.add(id);
      for (const l of NODE.get(id)!.links) if (this.taken.has(l) && !seen.has(l)) stack.push(l);
    }
    return seen.size === this.taken.size - 1;
  }

  refund(n: TreeNode): boolean {
    if (!this.canRefund(n)) return false;
    this.taken.delete(n.id);
    this.points++;
    this.version++;
    return true;
  }

  /** Adds a found scroll and opens every region it completes. Returns the regions it opened. */
  addScroll(id: ScrollId): RegionDef[] {
    this.scrolls.add(id);
    const opened: RegionDef[] = [];
    for (const r of REGIONS.values()) {
      if (this.unsealed.has(r.id) || !r.needs.every((n) => this.scrolls.has(n))) continue;
      this.unsealed.add(r.id);
      this.taken.add(entryOf(r.id));
      opened.push(r);
    }
    this.version++;
    return opened;
  }

  get stats(): Stats {
    if (this.cache.v === this.version) return this.cache.stats;
    const s = { ...ZERO_STATS };
    for (const id of this.taken) {
      const st = NODE.get(id)!.stats;
      if (st) for (const k in st) s[k as keyof Stats] += st[k as keyof Stats]!;
    }
    this.cache = { v: this.version, stats: s };
    return s;
  }

  /** Three scrolls you don't have yet, weighted so element and branch scrolls are commoner than niche ones. */
  offers(n = 3): ScrollId[] {
    const pool = ALL_SCROLLS.filter((id) => !this.scrolls.has(id));
    const weight = (id: ScrollId) => ({ element: 1.5, branch: 1.3, support: 1, niche: 0.55 })[SCROLLS[id].kind];
    const out: ScrollId[] = [];
    while (out.length < n && pool.length) {
      let r = Math.random() * pool.reduce((a, o) => a + weight(o), 0);
      const i = pool.findIndex((o) => (r -= weight(o)) < 0);
      out.push(...pool.splice(i < 0 ? 0 : i, 1));
    }
    return out;
  }

  /** Every node a point could go into right now. */
  options(): TreeNode[] {
    return TREE.filter((n) => this.state(n) === "available");
  }
}
