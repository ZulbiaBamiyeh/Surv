export const DIE_FACES = [3, 4, 6, 8, 10, 12, 20];

/** Picks a die type using relative weights, e.g. { 6: 20, 20: 1 }. */
export function pickDie(weights: Record<number, number>, rand: () => number = Math.random): number {
  const entries = Object.entries(weights).map(([k, v]) => [Number(k), v] as const);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let r = rand() * total;
  for (const [faces, w] of entries) {
    r -= w;
    if (r < 0) return faces;
  }
  return entries[entries.length - 1][0];
}

export function rollDie(faces: number, rand: () => number = Math.random): number {
  return 1 + Math.floor(rand() * faces);
}

/** Bigger dice take more backpack space. */
export function dieSize(faces: number): { w: number; h: number } {
  if (faces >= 20) return { w: 2, h: 2 };
  if (faces >= 12) return { w: 2, h: 1 };
  return { w: 1, h: 1 };
}
