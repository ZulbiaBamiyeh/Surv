// Pixel art defined as character maps. '.' is empty; every other character is a palette key.
// Outlines are generated automatically around each sprite.

export const OUTLINE = "#1b1b2a";

export const PAL: Record<string, string> = {
  h: "#3d7dff", H: "#2850c8", // hat
  b: "#ffd23d", B: "#d89a1a", // gold accents
  s: "#ffd9b8", S: "#f0a98a", // skin
  e: "#1b1b2a", w: "#ffffff", c: "#ff7aa2", // eyes, highlight, cheeks
  r: "#ff5a4a", R: "#c83a3a", d: "#5a3a2a", // robe, boots
  g: "#ff8ad8", G: "#d050a8", // slime
  k: "#ffffff", K: "#bcbcd8", // bone
  p: "#b05aff", P: "#7a32c8", // bat
  x: "#3df0ff", X: "#1aa0e0", // xp gem
  f: "#ff7a1a", F: "#ffe63d", // fire
  y: "#fff3c8", Y: "#e0b870", L: "#8a5a3a", // paper
  z: "#1b1b2a", // die pips
};

export const ROWS = {
  hero: [
    "......hh....",
    ".....hhH....",
    "....hhbhH...",
    "....hhhhH...",
    "...hhhhhHH..",
    "..hhhhhhhHH.",
    ".HHHHHHHHHHH",
    "..ssssssss..",
    "..ssessess..",
    "..ssessess..",
    "..cssssssc..",
    "...rrrrrr...",
    "..rrbrrrRR..",
    "..rrrrrrRR..",
    "..rRrrrrRR..",
    "...dd..dd...",
  ],
  slime: [
    "...gggg...",
    ".ggggwwgg.",
    ".gggggwgg.",
    "gggegggegg",
    "gggegggegg",
    "gcggggggcg",
    "gGggggggGg",
    ".GGGGGGGG.",
  ],
  skel: [
    "..kkkkk..",
    ".kkkkkkK.",
    ".kwekweK.",
    ".keekeeK.",
    ".kkkkkkK.",
    "..kekek..",
    "...kKk...",
    ".kkkKkkk.",
    "k.kekek.k",
    "k.kkKkk.k",
    "...kKk...",
    "..k...k..",
    ".kK...Kk.",
  ],
  batA: [
    "p.........p",
    "pp.p...p.pp",
    "pPPpppppPPp",
    ".pPpepepPp.",
    "...ppppp...",
    "....w.w....",
  ],
  batB: [
    "...........",
    "...p...p...",
    "..ppppppp..",
    ".pPpepepPp.",
    "pPPpppppPPp",
    "pp..w.w..pp",
  ],
  gem: ["..x..", ".xwx.", "xxwxx", "xxxXX", ".xXX.", "..X.."],
  fire: ["..ff..", ".fFFf.", "fFwwFf", ".fFFf.", "..ff.."],
  fire2: ["..ff..", ".fFFf.", "fFFwFf", ".fFwFf", "..ff.."],
  crown: ["b..b..b", "bb.b.bb", "bbbbbbb", "bBbBbBb"],
  scroll: [
    "YyyyyyyyyY",
    "YyyyyyyyyY",
    ".yyyyyyyy.",
    ".yy.ff.yy.",
    ".yyfFFfyy.",
    ".yyfwFfyy.",
    ".yyyffyyy.",
    ".yyyyyyyy.",
    ".yLLLLLLy.",
    ".yyyyyyyy.",
    "YyyyyyyyyY",
    "YyyyyyyyyY",
  ],
  dieTri: [
    "....q....",
    "...qqq...",
    "...qqq...",
    "..qqzqq..",
    "..qqqqQ..",
    ".qqqqqqQ.",
    ".qzqqqzQ.",
    "qQQQQQQQQ",
  ],
  dieSq: [
    ".qqqqqqq.",
    "qqqqqqqqQ",
    "qzqqqqqzQ",
    "qqqqqqqqQ",
    "qqqqzqqqQ",
    "qqqqqqqqQ",
    "qzqqqqqzQ",
    "qqqqqqqqQ",
    ".QQQQQQQ.",
  ],
  dieDia: [
    "....q....",
    "...qqq...",
    "..qqqqq..",
    ".qqqzqqQ.",
    "qqqqqqqQQ",
    ".qqqqqQQ.",
    "..qqqQQ..",
    "...qQQ...",
    "....Q....",
  ],
  dieHex: [
    "..qqqqq..",
    ".qqqqqqq.",
    "qqqqzqqqQ",
    "qqqzqzqqQ",
    "qqzqqqzqQ",
    "qzzzzzzzQ",
    "qqqqqqqQQ",
    ".qqqqQQQ.",
    "..QQQQQ..",
  ],
};

export interface Sprite {
  /** Normal look. */
  n: HTMLCanvasElement;
  /** All-white look used for hit flashes. */
  f: HTMLCanvasElement;
  w: number;
  h: number;
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function makeSprite(rows: string[], over: Record<string, string> = {}): Sprite {
  const h = rows.length;
  const w = rows[0].length;
  const col = (ch: string) => over[ch] ?? PAL[ch] ?? "#ff00ff";
  const filled = (i: number, j: number) => j >= 0 && j < h && i >= 0 && i < w && rows[j][i] !== ".";
  const build = (flash: boolean) => {
    const c = document.createElement("canvas");
    c.width = w + 2;
    c.height = h + 2;
    const x = c.getContext("2d")!;
    x.fillStyle = OUTLINE;
    for (let j = -1; j <= h; j++)
      for (let i = -1; i <= w; i++) {
        if (filled(i, j)) continue;
        if (filled(i - 1, j) || filled(i + 1, j) || filled(i, j - 1) || filled(i, j + 1)) x.fillRect(i + 1, j + 1, 1, 1);
      }
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (!filled(i, j)) continue;
        x.fillStyle = flash ? "#ffffff" : col(rows[j][i]);
        x.fillRect(i + 1, j + 1, 1, 1);
      }
    return c;
  };
  return { n: build(false), f: build(true), w: w + 2, h: h + 2 };
}

// ---------- Dice ----------

const DIE_LOOK: Record<number, { rows: string[]; color: string }> = {
  3: { rows: ROWS.dieTri, color: "#8fe388" },
  4: { rows: ROWS.dieTri, color: "#3df0ff" },
  6: { rows: ROWS.dieSq, color: "#ffffff" },
  8: { rows: ROWS.dieDia, color: "#ff8ad8" },
  10: { rows: ROWS.dieDia, color: "#b05aff" },
  12: { rows: ROWS.dieHex, color: "#ff9a3a" },
  20: { rows: ROWS.dieHex, color: "#ffd23d" },
};

export const dieColor = (faces: number) => DIE_LOOK[faces]?.color ?? "#ffffff";

const dieCache = new Map<number, Sprite>();
export function dieSprite(faces: number): Sprite {
  let s = dieCache.get(faces);
  if (!s) {
    const look = DIE_LOOK[faces] ?? DIE_LOOK[6];
    s = makeSprite(look.rows, { q: look.color, Q: shade(look.color, 0.72) });
    dieCache.set(faces, s);
  }
  return s;
}

/** A sprite scaled up as an image URL, for use in the HTML interface. */
export function spriteURL(s: Sprite, scale: number): string {
  const c = document.createElement("canvas");
  c.width = s.w * scale;
  c.height = s.h * scale;
  const x = c.getContext("2d")!;
  x.imageSmoothingEnabled = false;
  x.drawImage(s.n, 0, 0, c.width, c.height);
  return c.toDataURL();
}

// ---------- Tiny pixel font (3x5) ----------

const GLYPHS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111",
  "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001111", ":": "000010000010000", L: "100100100100111",
  V: "101101101101010", "+": "000010111010000", "!": "010010010000010", x: "000101010101000",
};

const textCache = new Map<string, HTMLCanvasElement>();

/** Text rendered with a 1px outline, cached by content and colors. */
export function textSprite(str: string, color: string, outline: string = OUTLINE): HTMLCanvasElement {
  const key = str + "|" + color + "|" + outline;
  let c = textCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = str.length * 4 + 1;
  c.height = 7;
  const x = c.getContext("2d")!;
  const plot = (ox: number, oy: number, fill: string) => {
    x.fillStyle = fill;
    for (let k = 0; k < str.length; k++) {
      const g = GLYPHS[str[k]];
      if (!g) continue;
      for (let p = 0; p < 15; p++) if (g[p] === "1") x.fillRect(1 + k * 4 + (p % 3) + ox, 1 + ((p / 3) | 0) + oy, 1, 1);
    }
  };
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) plot(ox, oy, outline);
  plot(0, 0, color);
  if (textCache.size > 600) textCache.clear();
  textCache.set(key, c);
  return c;
}
