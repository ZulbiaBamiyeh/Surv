import { ALL_SCROLLS, EMPTY_SLOT_BONUS, SCROLLS, SLOTS, ScrollId, TreeNode, rival } from "./content";

export interface OwnedScroll {
  id: ScrollId;
  ranks: Record<string, number>;
  spent: number;
}

export type NodeState = "learned" | "maxed" | "available" | "locked" | "closed";

/** Your scrolls, their skill trees and your unspent points. */
export class Book {
  slots: (OwnedScroll | null)[] = Array(SLOTS).fill(null);
  points = 0;

  constructor(start: ScrollId) {
    this.put(0, start);
  }

  get owned(): OwnedScroll[] {
    return this.slots.filter((s): s is OwnedScroll => !!s);
  }

  find(id: ScrollId) {
    return this.owned.find((s) => s.id === id);
  }

  rank(s: OwnedScroll | undefined, key: string): number {
    return s ? s.ranks[`${s.id}.${key}`] ?? 0 : 0;
  }

  has(s: OwnedScroll | undefined, key: string): boolean {
    return this.rank(s, key) > 0;
  }

  /** Empty slots power up attack scrolls. A support scroll still fills its slot. */
  get emptyBonus(): number {
    return 1 + EMPTY_SLOT_BONUS * this.slots.filter((s) => !s).length;
  }

  put(slot: number, id: ScrollId): number {
    const old = this.slots[slot];
    const refund = old ? Math.floor(old.spent / 2) : 0;
    this.slots[slot] = { id, ranks: { [`${id}.root`]: 1 }, spent: 0 };
    this.points += refund;
    return refund;
  }

  firstEmpty(): number {
    return this.slots.findIndex((s) => !s);
  }

  /** Scrolls you do not have yet, for loot. */
  missing(): ScrollId[] {
    return ALL_SCROLLS.filter((id) => !this.find(id));
  }

  state(s: OwnedScroll, node: TreeNode): NodeState {
    const def = SCROLLS[s.id];
    const r = s.ranks[node.id] ?? 0;
    if (r >= node.ranks) return r > 0 && node.ranks > 1 ? "maxed" : "learned";
    const rv = rival(node, def);
    if (rv && (s.ranks[rv.id] ?? 0) > 0) return "closed";
    const prev = def.nodes.filter((n) => n.tier === node.tier - 1);
    const unlocked = node.tier === 0 || prev.some((n) => (s.ranks[n.id] ?? 0) > 0);
    if (!unlocked) return "locked";
    return r > 0 ? "learned" : "available";
  }

  /** True if one more point can go into this node right now. */
  canLearn(s: OwnedScroll, node: TreeNode): boolean {
    const st = this.state(s, node);
    return this.points > 0 && (st === "available" || (st === "learned" && (s.ranks[node.id] ?? 0) < node.ranks));
  }

  learn(s: OwnedScroll, node: TreeNode): boolean {
    if (!this.canLearn(s, node)) return false;
    s.ranks[node.id] = (s.ranks[node.id] ?? 0) + 1;
    s.spent++;
    this.points--;
    return true;
  }

  /** Every node a point could go into right now, across all scrolls. */
  options(): { s: OwnedScroll; node: TreeNode }[] {
    const out: { s: OwnedScroll; node: TreeNode }[] = [];
    const saved = this.points;
    this.points = Math.max(1, this.points);
    for (const s of this.owned) for (const node of SCROLLS[s.id].nodes) if (this.canLearn(s, node)) out.push({ s, node });
    this.points = saved;
    return out;
  }
}
