import { OUTLINE, RAMPS, Ramp } from "./palette";
import { Painter, Sprite, lightOf } from "./painter";

const TAU = Math.PI * 2;
const WHITE = "#ffffff";

/** Cute shiny eye: 2x2 (or 2x3) with a highlight in the top-left corner. */
function eye(p: Painter, x: number, y: number, tall = false, color = OUTLINE) {
  p.dot(x, y, WHITE);
  p.dot(x + 1, y, color);
  p.dot(x, y + 1, color);
  p.dot(x + 1, y + 1, color);
  if (tall) {
    p.dot(x, y + 2, color);
    p.dot(x + 1, y + 2, color);
  }
}

// ---------- Hero: a little wizard ----------

export function heroFrame(phase: number, walking: boolean): Sprite {
  const p = new Painter(28, 34);
  const t = phase * TAU;
  const swing = walking ? Math.sin(t) : 0;
  const by = walking ? (Math.abs(Math.sin(t)) > 0.6 ? 1 : 0) : phase >= 0.5 ? 1 : 0;
  const R = RAMPS;
  const cx = 13;

  // Feet
  const lift = (s: number) => (walking && s > 0.3 ? 1 : 0);
  p.ellipsoid(cx - 2.2 + swing * 2, 31.6 - lift(Math.cos(t)), 2.3, 1.5, R.leather, { bias: -0.1 });
  p.ellipsoid(cx + 2.2 - swing * 2, 31.6 - lift(-Math.cos(t)), 2.3, 1.5, R.leather);

  // Back arm
  p.ellipsoid(cx - 4.8, 24.6 + by - swing * 0.6, 2, 2.9, R.robe, { bias: -0.15 });

  // Robe, flaring toward the hem, with a gold trim
  const y0 = 20.5 + by;
  const y1 = 31.2;
  const hem = (x: number) => 30.9 + 0.45 * Math.sin(x * 1.1 + t * 2);
  const rad = (y: number) => 4 + ((y - y0) / (y1 - y0)) * 3.4;
  p.column(y0, y1, () => cx, rad, R.robe, { clip: (x, y) => y <= hem(x), bias: -0.02 });
  p.column(y0, y1, () => cx, rad, R.gold, { clip: (x, y) => y <= hem(x) && y > hem(x) - 1.1 });
  // A center seam and soft folds
  for (let y = Math.ceil(y0 + 2); y < 30; y++) p.nudge(cx, y, -1);
  for (let y = 27; y < 30; y++) p.nudge(cx - 3, y, -1);

  // Staff with a glowing orb
  p.rod(22.5, 17 + by, 22.5, 32.6, 0.95, R.wood);
  p.ellipsoid(22.5, 15 + by, 2.6, 2.6, R.magic, { spec: 0.88, sep: 0.25 });
  p.dot(21, 17 + by, R.gold[3], R.gold);
  p.dot(24, 17 + by, R.gold[2], R.gold);

  // Front arm and hand gripping the staff
  p.ellipsoid(cx + 4.6, 24.2 + by + swing * 0.6, 2.1, 2.9, R.robe, { sep: 0.16 });
  p.ellipsoid(21.2, 26.2 + by + swing * 0.6, 1.7, 1.6, R.skin, { sep: 0.2, bias: 0.08, floor: 0.45 });

  // Hair behind the head frames the face, then the head, then bangs
  p.ellipsoid(cx, 16 + by, 7.6, 6.2, R.hair, { bias: -0.05 });
  p.ellipsoid(cx + 0.6, 17 + by, 6.4, 5.8, R.skin, { sep: 0.12, bias: 0.14, floor: 0.5 });
  p.ellipsoid(cx, 12.6 + by, 6.8, 2.1, R.hair, { sep: 0.15 });

  // Hat brim, casting a soft shadow
  p.ellipsoid(cx, 11 + by, 10.2, 2.4, R.hat, { sep: 0.2, bias: 0.02 });
  // Hat cone, its tip flopping backward
  const top = by;
  const bot = 10.6 + by;
  const s = (y: number) => Math.max(0, Math.min(1, (y - top) / (bot - top)));
  const cc = (y: number) => cx + 5.6 * (1 - s(y)) ** 2;
  const cr = (y: number) => 0.6 + 5.6 * s(y) ** 0.85;
  p.column(top, bot, cc, cr, R.hat, { tilt: -0.35 });
  p.column(8.5 + by, 10.1 + by, cc, (y) => cr(y) + 0.2, R.gold, { tilt: -0.3 });
  // Star on the hat
  const sx = 12;
  const sy = 5 + by;
  p.dot(sx, sy - 1, R.gold[4], R.gold);
  p.dot(sx - 1, sy, R.gold[3], R.gold);
  p.dot(sx, sy, R.gold[4], R.gold);
  p.dot(sx + 1, sy, R.gold[3], R.gold);
  p.dot(sx, sy + 1, R.gold[2], R.gold);

  // Face
  eye(p, 12, 16 + by, true);
  eye(p, 16, 16 + by, true);
  p.dot(10, 19 + by, R.blush[1]);
  p.dot(11, 19 + by, R.blush[2]);
  p.dot(18, 19 + by, R.blush[1]);
  p.dot(15, 19 + by, R.skin[1]);
  return p.bake();
}

// ---------- Slime ----------

export function slimeFrame(phase: number, ramp: Ramp = RAMPS.slime, size = 1): Sprite {
  const W = Math.round(20 * size);
  const H = Math.round(17 * size);
  const p = new Painter(W, H);
  const sq = Math.sin(phase * TAU);
  const rx = 8.4 * size * (1 + 0.12 * sq);
  const ry = 6.6 * size * (1 - 0.12 * sq);
  const cx = W / 2;
  const floor = H - 1.2;
  const cy = floor - ry * 0.82;
  p.ellipsoid(cx, cy, rx, ry, ramp, { spec: 0.95, clip: (_x, y) => y <= floor });
  // A lighter core makes the body look squishy and see-through.
  p.fill(
    (x, y) => ((x - cx - rx * 0.12) / (rx * 0.55)) ** 2 + ((y - cy - ry * 0.25) / (ry * 0.42)) ** 2 <= 1,
    ramp,
    (x, y) => lightOf((x - cx) / rx, (y - cy) / ry, 0.8) + 0.12,
  );
  // Darker base where it touches the ground
  for (let x = 0; x < W; x++) p.nudge(x, Math.floor(floor) - 0, -1);
  // Glossy highlight
  const hx = Math.round(cx - rx * 0.55);
  const hy = Math.round(cy - ry * 0.5);
  p.dot(hx, hy, WHITE);
  p.dot(hx + 1, hy, WHITE);
  p.dot(hx, hy + 1, ramp[4]);
  p.dot(hx + 2, hy - 1, ramp[4]);
  // Face
  const ey = Math.round(cy - ry * 0.05);
  const gap = Math.round(3 * size);
  eye(p, Math.round(cx) - gap - 1, ey, true);
  eye(p, Math.round(cx) + gap - 1, ey, true);
  const my = ey + Math.round(3 * size);
  p.dot(Math.round(cx) - 1, my, OUTLINE);
  p.dot(Math.round(cx), my + 1, OUTLINE);
  p.dot(Math.round(cx) + 1, my, OUTLINE);
  p.dot(Math.round(cx) - gap - 2, my, ramp[4]);
  p.dot(Math.round(cx) + gap + 1, my, ramp[4]);
  return p.bake();
}

export function kingFrame(phase: number): Sprite {
  const W = 40;
  const H = 38;
  const p = new Painter(W, H);
  const R = RAMPS;
  const sq = Math.sin(phase * TAU);
  const rx = 17 * (1 + 0.1 * sq);
  const ry = 12.5 * (1 - 0.1 * sq);
  const cx = W / 2;
  const floor = H - 1.2;
  const cy = floor - ry * 0.84;
  p.ellipsoid(cx, cy, rx, ry, R.king, { spec: 0.95, clip: (_x, y) => y <= floor });
  p.fill(
    (x, y) => ((x - cx - rx * 0.12) / (rx * 0.55)) ** 2 + ((y - cy - ry * 0.25) / (ry * 0.42)) ** 2 <= 1,
    R.king,
    (x, y) => lightOf((x - cx) / rx, (y - cy) / ry, 0.8) + 0.12,
  );
  for (let x = 0; x < W; x++) p.nudge(x, Math.floor(floor), -1);
  const hx = Math.round(cx - rx * 0.55);
  const hy = Math.round(cy - ry * 0.5);
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [3, -1], [-1, 2]]) p.dot(hx + dx, hy + dy, WHITE);
  // Crown
  const top = Math.round(cy - ry) + 1;
  const crown: [number, number][] = [
    [cx - 8, top + 1], [cx - 8, top - 6], [cx - 5, top - 3], [cx - 2.5, top - 8], [cx, top - 4],
    [cx + 2.5, top - 8], [cx + 5, top - 3], [cx + 8, top - 6], [cx + 8, top + 1],
  ];
  p.fill(
    (x, y) => {
      let inside = false;
      for (let i = 0, j = crown.length - 1; i < crown.length; j = i++) {
        const [xi, yi] = crown[i];
        const [xj, yj] = crown[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    },
    R.gold,
    (x) => lightOf((x - cx) / 9, -0.3, Math.sqrt(Math.max(0, 1 - ((x - cx) / 9) ** 2))),
    { sep: 0.3 },
  );
  p.column(top - 1, top + 1, () => cx, () => 8.4, R.gold, { tilt: 0.1 });
  p.ellipsoid(cx, top - 1.5, 1.4, 1.4, R.red, { spec: 0.8 });
  p.ellipsoid(cx - 5, top - 0.8, 1, 1, R.magic, { spec: 0.8 });
  p.ellipsoid(cx + 5, top - 0.8, 1, 1, R.magic, { spec: 0.8 });
  // Face: grumpy royal eyebrows
  const ey = Math.round(cy - 1);
  eye(p, Math.round(cx) - 7, ey, true);
  eye(p, Math.round(cx) + 5, ey, true);
  for (let i = 0; i < 3; i++) {
    p.dot(Math.round(cx) - 8 + i, ey - 2 + (i === 2 ? 1 : 0), OUTLINE);
    p.dot(Math.round(cx) + 7 - i, ey - 2 + (i === 2 ? 1 : 0), OUTLINE);
  }
  const my = ey + 6;
  for (let i = -2; i <= 2; i++) p.dot(Math.round(cx) + i, my + (Math.abs(i) === 2 ? -1 : 0), OUTLINE);
  p.dot(Math.round(cx) - 10, my - 1, R.blush[1]);
  p.dot(Math.round(cx) - 11, my - 1, R.blush[1]);
  p.dot(Math.round(cx) + 9, my - 1, R.blush[1]);
  p.dot(Math.round(cx) + 10, my - 1, R.blush[1]);
  return p.bake();
}

// ---------- Bat ----------

export function batFrame(phase: number): Sprite {
  const p = new Painter(28, 18);
  const R = RAMPS;
  const a = Math.sin(phase * TAU); // 1 = wings up, -1 = wings down
  const cx = 14;
  const cy = 9 + a * 0.6;
  for (const side of [-1, 1]) {
    const sx = cx + side * 3;
    const tipX = cx + side * 13;
    const tipY = cy - 1 - a * 6;
    const pts: [number, number][] = [
      [sx, cy - 2],
      [cx + side * 7, cy - 3 - a * 4],
      [tipX, tipY],
      [cx + side * 11, cy + 2 - a * 2.5],
      [cx + side * 9, cy + 1.5 - a * 1.5],
      [cx + side * 7, cy + 3.5 - a * 1.2],
      [cx + side * 5, cy + 2],
      [sx, cy + 2],
    ];
    p.poly(pts, R.wing, side < 0 ? 0.72 : 0.5, { sep: 0 });
    p.rod(sx, cy - 2, cx + side * 7, cy - 3 - a * 4, 0.6, R.bat, { bias: -0.1 });
    p.rod(cx + side * 7, cy - 3 - a * 4, tipX, tipY, 0.5, R.bat, { bias: -0.1 });
  }
  // Ears
  p.poly([[cx - 4, cy - 2], [cx - 3.5, cy - 7], [cx - 1, cy - 3]], R.bat, 0.7);
  p.poly([[cx + 1, cy - 3], [cx + 3.5, cy - 7], [cx + 4, cy - 2]], R.bat, 0.45);
  p.ellipsoid(cx, cy, 4.2, 3.8, R.bat, { spec: 0.93, sep: 0.2 });
  const ey = Math.round(cy - 1);
  p.dot(cx - 2, ey, "#fff2a0");
  p.dot(cx - 3, ey, "#ffc83d");
  p.dot(cx + 1, ey, "#fff2a0");
  p.dot(cx + 2, ey, "#ffc83d");
  p.dot(cx - 1, ey + 2, WHITE);
  p.dot(cx + 1, ey + 2, WHITE);
  return p.bake();
}

// ---------- Skeleton ----------

export function skeletonFrame(phase: number): Sprite {
  const p = new Painter(20, 30);
  const R = RAMPS;
  const t = phase * TAU;
  const step = Math.sin(t);
  const by = Math.abs(step) > 0.6 ? 1 : 0;
  const cx = 10;
  // Legs and feet
  p.rod(cx - 2, 20 + by, cx - 2.5 + step * 2, 27.5, 0.9, R.bone, { bias: -0.1 });
  p.rod(cx + 2, 20 + by, cx + 2.5 - step * 2, 27.5, 0.9, R.bone);
  p.ellipsoid(cx - 3 + step * 2, 28.2, 1.8, 1.1, R.bone, { bias: -0.1 });
  p.ellipsoid(cx + 3 - step * 2, 28.2, 1.8, 1.1, R.bone);
  // Back arm
  p.rod(cx - 4, 13.5 + by, cx - 5.5 - step * 1.5, 19.5 + by, 0.8, R.bone, { bias: -0.15 });
  // Pelvis, spine and ribs
  p.ellipsoid(cx, 20 + by, 3.4, 1.6, R.bone, { sep: 0.2 });
  p.rod(cx, 13 + by, cx, 20 + by, 0.9, R.bone);
  p.ellipsoid(cx, 15.5 + by, 4.2, 3.2, R.bone, { sep: 0.25 });
  for (let x = cx - 3; x <= cx + 3; x++) {
    if (x === cx || x === cx - 1) continue;
    p.nudge(x, 15 + by, -2);
    p.nudge(x, 17 + by, -2);
  }
  // Front arm, holding a little bone club
  p.rod(cx + 4, 13.5 + by, cx + 5.5 + step * 1.5, 19 + by, 0.8, R.bone, { sep: 0.15 });
  p.rod(cx + 5.5 + step * 1.5, 19 + by, cx + 8 + step * 1.5, 13 + by, 0.9, R.bone, { sep: 0.2 });
  p.ellipsoid(cx + 8 + step * 1.5, 12.5 + by, 1.5, 1.3, R.bone);
  // Skull and jaw
  p.ellipsoid(cx, 11.4 + by, 3.4, 1.8, R.bone, { sep: 0.3 });
  p.ellipsoid(cx, 7 + by, 5.6, 5, R.bone, { sep: 0.35, spec: 0.95 });
  for (let x = cx - 2; x <= cx + 2; x += 2) p.dot(x, 11 + by, R.bone[1]);
  // Eye sockets with glowing pupils
  for (const ex of [cx - 3, cx + 1]) {
    p.dot(ex, 7 + by, R.shadowEye[0]);
    p.dot(ex + 1, 7 + by, R.shadowEye[0]);
    p.dot(ex, 8 + by, R.shadowEye[0]);
    p.dot(ex + 1, 8 + by, R.shadowEye[1]);
    p.dot(ex, 6 + by, R.bone[1]);
    p.dot(ex + 1, 6 + by, R.bone[1]);
  }
  p.dot(cx - 2, 8 + by, "#ff5a3a");
  p.dot(cx + 2, 8 + by, "#ff5a3a");
  p.dot(cx, 9 + by, R.bone[1]);
  return p.bake();
}
