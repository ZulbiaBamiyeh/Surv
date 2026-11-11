import {
  ALL_SCROLLS, ALL_SUPPORTS, NODE, REGIONS, RegionDef, SCROLLS, START, SUPPORT_SLOTS, ScrollId, Stats, SupportId, TREE, TreeNode, ZERO_STATS,
} from "./content";

export type NodeState = "taken" | "available" | "locked" | "sealed";

export interface OwnedSupport {
  id: SupportId;
  level: number;
}

/** A found scroll, offered when you pick one up. */
export type ScrollOffer = { type: "scroll"; id: ScrollId } | { type: "support"; id: SupportId };

/** Your spell tree, the branches you've unsealed, your support scrolls and unspent points. */
export class Book {
  points = 0;
  taken = new Set<string>([START]);
  /** Scrolls you have found. You start with the Fire Scroll. */
  scrolls = new Set<ScrollId>(["fire"]);
  unsealed = new Set<string>();
  supports: (OwnedSupport | null)[] = Array(SUPPORT_SLOTS).fill(null);
  /** Bumped on every change so cached stats know to refresh. */
  version = 0;
  private cache: { v: number; stats: Stats } = { v: -1, stats: ZERO_STATS };

  has(id: string) {
    return this.taken.has(id);
  }

  get spent() {
    // Entry nodes come free with their scroll
    return [...this.taken].filter((id) => NODE.get(id)!.kind !== "start" && NODE.get(id)!.kind !== "entry").length;
  }

  state(n: TreeNode): NodeState {
    if (this.taken.has(n.id)) return "taken";
    if (n.region && !this.unsealed.has(n.region)) return "sealed";
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

  /**
   * Gives a node back. Only allowed if everything else you own still connects to the
   * middle (or to an unsealed branch's free entry node).
   */
  canRefund(n: TreeNode) {
    if (!this.taken.has(n.id) || n.kind === "start" || n.kind === "entry") return false;
    const roots = [START, ...[...this.unsealed].map((r) => entryOf(r))];
    const seen = new Set<string>();
    const stack = roots.filter((r) => this.taken.has(r));
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
      // The first node comes free
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

  // ---------- Supports ----------
  support(id: SupportId): number {
    return this.supports.find((s) => s?.id === id)?.level ?? 0;
  }

  /** Adds a support scroll to a free slot or levels it up. Returns false if both slots are full. */
  addSupport(id: SupportId, replace = -1): boolean {
    const own = this.supports.find((s) => s?.id === id);
    if (own) {
      own.level = Math.min(3, own.level + 1);
    } else {
      const slot = replace >= 0 ? replace : this.supports.findIndex((s) => !s);
      if (slot < 0) return false;
      this.supports[slot] = { id, level: 1 };
    }
    this.version++;
    return true;
  }

  /** Two or three scrolls to choose from when you find one. */
  offers(n = 2): ScrollOffer[] {
    const pool: ScrollOffer[] = [
      ...ALL_SCROLLS.filter((id) => !this.scrolls.has(id)).map((id) => ({ type: "scroll", id }) as ScrollOffer),
      ...ALL_SUPPORTS.filter((id) => this.support(id) < 3).map((id) => ({ type: "support", id }) as ScrollOffer),
    ];
    // Spell scrolls are what make a run, so they turn up more often; niche ones are rare
    const weight = (o: ScrollOffer) =>
      o.type === "scroll" ? (SCROLLS[o.id].niche ? 0.55 : 1.6) : this.support(o.id) > 0 ? 1.1 : 0.9;
    const out: ScrollOffer[] = [];
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

/** The free first node of a region. */
const entries = new Map<string, string>();
for (const n of TREE) if (n.kind === "entry" && n.region) entries.set(n.region, n.id);
export const entryOf = (region: string) => entries.get(region)!;

