import { CFG } from "./config";
import type { ConId } from "./sky";

// What the game remembers between visits. Storage can be missing or blocked (private
// windows, some embeds), so every read and write is guarded and the game works without it.

export interface Save {
  /** Highest night unlocked (1 to 5). */
  night: number;
  /** Best time survived on each night, in seconds. */
  best: Record<number, number>;
  wins: number;
  runs: number;
  /** Constellations found at least once. */
  seen: ConId[];
  sfx: boolean;
  music: boolean;
  shake: boolean;
}

const KEY = "bunny-wizard-2";
const fresh = (): Save => ({ night: 1, best: {}, wins: 0, runs: 0, seen: [], sfx: true, music: true, shake: true });

export function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    /* no storage */
  }
  return fresh();
}

export function store(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* no storage */
  }
}

/** Records the end of a run. Returns true if it set a new best time for that night. */
export function record(s: Save, night: number, time: number, won: boolean, found: ConId[]): boolean {
  s.runs++;
  const t = Math.min(time, CFG.nightLength);
  const isBest = t > (s.best[night] ?? 0);
  if (isBest) s.best[night] = t;
  if (won) {
    s.wins++;
    s.night = Math.min(CFG.night.max, Math.max(s.night, night + 1));
  }
  for (const c of found) if (c !== "moon" && !s.seen.includes(c)) s.seen.push(c);
  store(s);
  return isBest;
}
