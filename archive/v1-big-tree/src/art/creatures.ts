import { OUTLINE, RAMPS, Ramp } from "./palette";
import { Painter, Sprite, lightOf } from "./painter";

// The later enemies, and your helpers (totems, snowmen, yetis).

const TAU = Math.PI * 2;
const WHITE = "#ffffff";

const GHOST: Ramp = ["#4a5a8a", "#7f9ccc", "#b8d8f4", "#e4f6ff", "#ffffff"];
const CAP: Ramp = ["#3a0f1e", "#7a1a2a", "#c42a36", "#f05a4a", "#ff9a80"];
const STEM: Ramp = ["#5a4038", "#9c7c66", "#d8c0a0", "#f4e4c8", "#fff8e8"];
const BOAR: Ramp = ["#2a1610", "#5a3020", "#8c5034", "#b8784a", "#dca070"];
const TUSK: Ramp = ["#6a6050", "#b8b0a0", "#ece4d4", "#ffffff"];
const MOSS: Ramp = ["#0f2a14", "#1e5a24", "#3a9a2a", "#7ad040", "#c8f080"];
const SNOW: Ramp = ["#5a6a8a", "#9cb0d0", "#d4e4f4", "#f4faff", "#ffffff"];
const YETI_FACE: Ramp = ["#1e2a5a", "#3a5aa0", "#6a90d8", "#a0c4f4", "#d8ecff"];
const JELLY: Ramp = ["#0f2244", "#164c86", "#2490d0", "#50d2ff", "#c8f6ff"];

export { JELLY };

/** A wisp of a ghost with a wavy tail. Translucency comes from the renderer. */
export function ghostFrame(phase: number): Sprite {
  const p = new Painter(18, 22);
  const t = phase * TAU;
  const cx = 9;
  const bob = Math.round(Math.sin(t));
  // Body: a dome on a tapering, wavy skirt
  p.fill(
    (x, y) => {
      const yy = y - bob;
      if (yy < 2 || yy > 19) return false;
      if (yy <= 9) return (x - cx) ** 2 / 36 + (yy - 9) ** 2 / 49 <= 1;
      const k = (yy - 9) / 10;
      const w = 6 * (1 - k * 0.35) + Math.sin(yy * 0.9 + t * 2) * 0.8;
      const wave = Math.sin((x - cx) * 1.6 + t * 3) * 1.4;
      return Math.abs(x - cx - Math.sin(yy * 0.4 + t) * 1.2) <= w && yy < 17.5 + wave;
    },
    GHOST,
    (x, y) => {
      const u = (x - cx) / 6;
      const v = (y - bob - 7) / 8;
      return lightOf(u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v * 0.5)), { spec: 0.96 });
    },
  );
  // Big soft eyes and a little "o" mouth
  for (const ex of [cx - 3, cx + 2]) {
    p.dot(ex, 8 + bob, OUTLINE);
    p.dot(ex + 1, 8 + bob, OUTLINE);
    p.dot(ex, 9 + bob, OUTLINE);
    p.dot(ex + 1, 9 + bob, "#2a3a6a");
    p.dot(ex, 8 + bob, "#4a5a8a");
  }
  p.dot(cx, 12 + bob, "#4a5a8a");
  p.dot(cx - 5, 11 + bob, "#ffc0d8");
  p.dot(cx + 5, 11 + bob, "#ffc0d8");
  return p.bake();
}

/** A walking toadstool that spits spores. */
export function shroomFrame(phase: number, spit = false): Sprite {
  const p = new Painter(20, 22);
  const t = phase * TAU;
  const cx = 10;
  const step = Math.sin(t);
  const sq = spit ? 1.5 : 0;
  // Little feet
  p.ellipsoid(cx - 3 + step, 20.5, 2, 1.2, STEM, { bias: -0.1 });
  p.ellipsoid(cx + 3 - step, 20.5, 2, 1.2, STEM);
  // Stem with a face
  p.column(11 + sq, 20, () => cx, (y) => 3.6 + (y - 11) * 0.12, STEM, { tilt: -0.1 });
  // Cap: a wide dome with white spots
  const cy = 9.5 + sq * 0.5;
  p.fill(
    (x, y) => y <= cy + 1.6 && ((x - cx) / (9 - sq * 0.3)) ** 2 + ((y - cy) / (7 - sq)) ** 2 <= 1,
    CAP,
    (x, y) => {
      const u = (x - cx) / 9;
      const v = (y - cy) / 7;
      return lightOf(u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v)), { spec: 0.95 });
    },
    { sep: 0.3 },
  );
  for (const [sx, sy, r] of [[cx - 4, cy - 3, 1.4], [cx + 2, cy - 4.5, 1.2], [cx + 5, cy - 1, 1], [cx - 1, cy - 1, 0.9]] as const)
    p.ellipsoid(sx, sy, r, r, STEM, { bias: 0.3 });
  // Rim shadow and face
  for (let x = cx - 7; x <= cx + 7; x++) p.nudge(x, Math.floor(cy + 1.6), -1);
  p.dot(cx - 2, 14 + sq, OUTLINE);
  p.dot(cx + 1, 14 + sq, OUTLINE);
  p.dot(cx - 2, 15 + sq, OUTLINE);
  p.dot(cx + 1, 15 + sq, OUTLINE);
  if (spit) {
    p.dot(cx - 1, 17 + sq, OUTLINE);
    p.dot(cx, 17 + sq, OUTLINE);
  } else p.dot(cx - 1, 17, "#9c7c66");
  return p.bake();
}

/** A stocky boar seen from the side. `stamp` lifts the front for the wind-up. */
export function boarFrame(phase: number, stamp = false): Sprite {
  const p = new Painter(28, 20);
  const t = phase * TAU;
  const step = Math.sin(t);
  const lift = stamp ? Math.max(0, Math.sin(t * 2)) * 2 : 0;
  // Legs
  const leg = (x: number, s: number, back: boolean) => p.rod(x, 12, x + s * 1.5, 18.5 - (back ? 0 : lift * 0.5), 1.2, BOAR, { bias: back ? -0.15 : 0 });
  leg(7, -step, true);
  leg(19, step, true);
  // Body and a bristly back
  p.ellipsoid(13, 10.5 - lift * 0.3, 9.5, 6, BOAR, { spec: 0.96, sep: 0.2 });
  for (let x = 6; x <= 18; x += 2) p.dot(x, 4.5 + Math.abs(x - 12) * 0.12 - lift * 0.3, BOAR[0]);
  leg(9, step, false);
  leg(17, -step, false);
  // Head, snout and tusk
  const hy = 11 - lift;
  p.ellipsoid(22.5, hy, 4.5, 4, BOAR, { sep: 0.25 });
  p.ellipsoid(26, hy + 1.2, 1.8, 1.8, ["#5a2c34", "#9a4c3c", "#d27a6a", "#f2a6a0"], { sep: 0.2 });
  p.rod(24.5, hy + 2.4, 26.4, hy - 0.4, 0.6, TUSK);
  p.ellipsoid(20.5, hy - 3.6, 1.4, 1.8, BOAR, { bias: -0.05 });
  p.dot(23, hy - 1, OUTLINE);
  p.dot(23, hy - 2, "#ff5a3a");
  p.dot(26, hy + 1, "#3a1010");
  // Little curly tail
  p.dot(3, 8, BOAR[1]);
  p.dot(2, 7, BOAR[1]);
  p.dot(3, 6, BOAR[1]);
  return p.bake();
}

/** A mossy stone golem. */
export function golemFrame(phase: number): Sprite {
  const p = new Painter(28, 32);
  const t = phase * TAU;
  const step = Math.sin(t);
  const by = Math.abs(step) > 0.6 ? 1 : 0;
  const S = RAMPS.stone;
  // Legs
  p.ellipsoid(9 + step * 1.5, 28, 3.6, 3.2, S, { bias: -0.1 });
  p.ellipsoid(19 - step * 1.5, 28, 3.6, 3.2, S);
  // Back arm
  p.ellipsoid(4, 18 + by + step, 3.4, 5, S, { bias: -0.18 });
  // Body: a big boulder
  p.ellipsoid(14, 17 + by, 9.5, 9, S, { spec: 0.97, sep: 0.3 });
  // Cracks
  for (const [x, y] of [[11, 14], [12, 15], [12, 16], [17, 20], [18, 21], [16, 21]]) p.nudge(x, y + by, -2);
  // Moss on top
  p.fill((x, y) => ((x - 14) / 8.5) ** 2 + ((y - 10 - by) / 3.2) ** 2 <= 1 && y < 11.5 + by + Math.sin(x * 1.7) * 1.2, MOSS, (x) => 0.55 + ((14 - x) / 8.5) * 0.3);
  // Head nub with glowing eyes
  p.ellipsoid(14, 7 + by, 5, 4, S, { sep: 0.3 });
  p.fill((x, y) => ((x - 14) / 5) ** 2 + ((y - 4.5 - by) / 1.8) ** 2 <= 1, MOSS, () => 0.7);
  p.dot(12, 7 + by, "#7ae8ff");
  p.dot(16, 7 + by, "#7ae8ff");
  p.dot(12, 8 + by, "#2a90c0");
  p.dot(16, 8 + by, "#2a90c0");
  // Front arm
  p.ellipsoid(24, 18 + by - step, 3.6, 5.2, S, { sep: 0.25 });
  return p.bake();
}

// ---------- Helpers ----------

/** A carved wooden totem with a flame on top. Wicker totems are woven and burn green. */
export function totemFrame(phase: number, wicker = false): Sprite {
  const p = new Painter(16, 30);
  const R = RAMPS;
  const W: Ramp = wicker ? ["#3a2a10", "#6e5020", "#a07a38", "#d0a858", "#f0d890"] : R.wood;
  // Pole with two carved faces
  p.column(9, 28, () => 8, (y) => (y > 25 ? 4.5 : 3.6), W, { tilt: -0.1 });
  if (wicker) for (let y = 10; y < 28; y += 2) for (let x = 5; x <= 11; x += 2) p.nudge(x + (y % 4 === 0 ? 1 : 0), y, -1);
  for (const fy of [13, 21]) {
    p.dot(6, fy, OUTLINE);
    p.dot(10, fy, OUTLINE);
    p.dot(6, fy - 1, W[0]);
    p.dot(10, fy - 1, W[0]);
    for (let x = 6; x <= 10; x++) p.dot(x, fy + 3, x === 6 || x === 10 ? W[1] : OUTLINE);
  }
  // Little wings at the top
  p.poly([[4, 10], [0.5, 7], [4, 12]], W, 0.7);
  p.poly([[12, 10], [15.5, 7], [12, 12]], W, 0.4);
  // Flame bowl
  p.ellipsoid(8, 9, 4.5, 1.6, R.gold, { sep: 0.2 });
  const fire = wicker ? ["#0f2a14", "#2a7a2a", "#5ac040", "#a8f060", "#e0ffb0", "#ffffff"] : R.fire;
  const flick = Math.sin(phase * TAU) * 0.8;
  p.glow(
    (x, y) => {
      const dy = y - 7;
      const w = dy > 0 ? 3 : 3 * (1 + dy / 6.5);
      return Math.abs(x - 8 - flick * (1 + dy / 6.5) * -0.5) <= w && dy > -6.5 && dy < 1;
    },
    fire,
    (x, y) => 1 - Math.hypot((x - 8) * 0.8, (y - 6) * 0.6) / 4,
  );
  return p.bake();
}

/** A snowman with a scarf and a carrot nose. */
export function snowmanFrame(phase: number): Sprite {
  const p = new Painter(18, 24);
  const wob = Math.sin(phase * TAU) * 0.5;
  p.ellipsoid(9, 17.5, 6.5, 5.6, SNOW, { spec: 0.95 });
  p.ellipsoid(9 + wob, 9, 4.6, 4.2, SNOW, { spec: 0.95, sep: 0.25 });
  // Stick arms
  p.rod(3.5, 14, 0.5, 10.5 + wob, 0.5, RAMPS.wood);
  p.rod(14.5, 14, 17.5, 11 - wob, 0.5, RAMPS.wood);
  // Scarf
  p.column(12.2, 13.8, () => 9 + wob * 0.5, () => 4.2, RAMPS.red, { tilt: 0 });
  p.rod(11, 13.5, 12.5, 17.5, 0.9, RAMPS.red);
  // Coal eyes, carrot nose, buttons
  p.dot(7 + wob, 8, OUTLINE);
  p.dot(10 + wob, 8, OUTLINE);
  p.dot(9 + wob, 10, "#ff8a3a");
  p.dot(10 + wob, 10, "#f05a1a");
  p.dot(9, 16, OUTLINE);
  p.dot(9, 19, OUTLINE);
  // A small top hat
  p.column(1.5, 5, () => 9 + wob, () => 2.6, ["#140d1c", "#2a1a3a", "#3e2a56", "#5a4078"], { tilt: -0.2 });
  p.ellipsoid(9 + wob, 5, 4.2, 0.9, ["#140d1c", "#2a1a3a", "#3e2a56", "#5a4078"]);
  return p.bake();
}

/** A big friendly yeti that stomps. */
export function yetiFrame(phase: number): Sprite {
  const p = new Painter(26, 28);
  const t = phase * TAU;
  const stomp = Math.max(0, Math.sin(t)) * 1.5;
  p.ellipsoid(8, 25.5, 3.5, 2.2, SNOW, { bias: -0.1 });
  p.ellipsoid(18, 25.5 - stomp, 3.5, 2.2, SNOW);
  p.ellipsoid(3.5, 15, 3.2, 6, SNOW, { bias: -0.15 });
  p.ellipsoid(13, 15, 9, 10, SNOW, { spec: 0.96, sep: 0.2 });
  // Shaggy fur edge
  for (let y = 8; y < 24; y += 3) {
    p.nudge(5, y, -1);
    p.nudge(21, y + 1, -1);
  }
  p.ellipsoid(22.5, 15, 3.2, 6, SNOW, { sep: 0.2 });
  // Face
  p.ellipsoid(13, 10, 5, 4, YETI_FACE, { sep: 0.3 });
  p.dot(11, 9, WHITE);
  p.dot(15, 9, WHITE);
  p.dot(11, 10, OUTLINE);
  p.dot(15, 10, OUTLINE);
  for (let x = 11; x <= 15; x++) p.dot(x, 12, x === 11 || x === 15 ? YETI_FACE[1] : OUTLINE);
  p.dot(12, 13, WHITE);
  p.dot(14, 13, WHITE);
  return p.bake();
}
