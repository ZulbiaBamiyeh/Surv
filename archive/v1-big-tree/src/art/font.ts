import { OUTLINE } from "./palette";

// A chunky 4x6 digit font for damage numbers, drawn with a 1px outline.
const GLYPHS: Record<string, string[]> = {
  "0": [".##.", "#..#", "#.##", "##.#", "#..#", ".##."],
  "1": [".#..", "##..", ".#..", ".#..", ".#..", "###."],
  "2": [".##.", "#..#", "..#.", ".#..", "#...", "####"],
  "3": ["###.", "...#", ".##.", "...#", "...#", "###."],
  "4": ["#..#", "#..#", "####", "...#", "...#", "...#"],
  "5": ["####", "#...", "###.", "...#", "...#", "###."],
  "6": [".##.", "#...", "###.", "#..#", "#..#", ".##."],
  "7": ["####", "...#", "..#.", ".#..", ".#..", ".#.."],
  "8": [".##.", "#..#", ".##.", "#..#", "#..#", ".##."],
  "9": [".##.", "#..#", "#..#", ".###", "...#", ".##."],
};

const cache = new Map<string, HTMLCanvasElement>();

export function numberSprite(text: string, color: string, shade: string): HTMLCanvasElement {
  const key = text + color;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = text.length * 5 + 2;
  c.height = 8;
  const x = c.getContext("2d")!;
  const plot = (ox: number, oy: number, fill: (row: number) => string) => {
    [...text].forEach((ch, k) => {
      const g = GLYPHS[ch];
      if (!g) return;
      g.forEach((row, j) => {
        x.fillStyle = fill(j);
        for (let i = 0; i < 4; i++) if (row[i] === "#") x.fillRect(1 + k * 5 + i + ox, 1 + j + oy, 1, 1);
      });
    });
  };
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1], [0, 2], [1, 2]])
    plot(ox, oy, () => OUTLINE);
  // Lighter top rows, darker bottom rows, for a little shine
  plot(0, 0, (row) => (row >= 4 ? shade : color));
  if (cache.size > 800) cache.clear();
  cache.set(key, c);
  return c;
}
