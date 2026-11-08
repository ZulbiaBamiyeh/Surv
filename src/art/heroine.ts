import { OUTLINE, RAMPS, Ramp } from "./palette";
import { Painter, Sprite, lightOf } from "./painter";

// A nimble young fire mage: slim proportions, a ponytail and short cape that react
// to movement, and a light wand instead of a big staff.

const TAU = Math.PI * 2;

const CAPE: Ramp = ["#0e1e2e", "#143e4e", "#1e6a72", "#30a0a0", "#7ad8c8"];
const TUNIC: Ramp = ["#3a2a2a", "#8a6a5a", "#d0b090", "#f0dcc0", "#fff4e4"];
const LEGS: Ramp = ["#120e22", "#24203e", "#3a3660", "#56548a", "#8a88b8"];

export type HeroinePose = "idle" | "run" | "dash";

export function heroineFrame(phase: number, pose: HeroinePose): Sprite {
  const W = 34;
  const H = 44;
  const p = new Painter(W, H);
  const R = RAMPS;
  const t = phase * TAU;
  const run = pose === "run";
  const dash = pose === "dash";

  // Body motion: a forward lean when moving, a bob in the run cycle, breathing when idle
  const lean = dash ? 4 : run ? 1.5 : 0;
  const bob = run ? (Math.abs(Math.cos(t)) > 0.7 ? 1 : 0) : dash ? 1 : phase >= 0.5 ? 1 : 0;
  const cx = 15;
  const hipY = 26 + bob;
  const hipX = cx;
  const top = (y: number) => lean * (1 - (y - 6) / (hipY - 6)); // lean grows toward the head

  // ---------- Legs ----------
  const ground = 41.5;
  const leg = (side: number) => {
    // side: +1 front leg, -1 back leg
    let fx: number;
    let fy = ground;
    let kx: number;
    let ky: number;
    if (dash) {
      fx = hipX + side * 7;
      fy = side > 0 ? ground - 2 : ground - 1;
      kx = hipX + side * 4;
      ky = hipY + 6;
    } else if (run) {
      const s = Math.sin(t) * side;
      const lift = Math.max(0, Math.cos(t) * side);
      fx = hipX + s * 7;
      fy = ground - lift * 4;
      kx = hipX + s * 3 + lift * 3.5;
      ky = hipY + 8 - lift * 2.5;
    } else {
      fx = hipX + side * 2;
      kx = hipX + side * 1.6;
      ky = hipY + 8;
    }
    const o = side < 0 ? { bias: -0.15 } : {};
    p.rod(hipX + side * 1.2, hipY, kx, ky, 1.5, LEGS, o);
    p.rod(kx, ky, fx, fy - 1, 1.35, LEGS, o);
    // Boot
    p.rod(kx + (fx - kx) * 0.45, ky + (fy - ky) * 0.45, fx, fy - 1, 1.6, R.leather, { ...o, sep: 0.15 });
    p.ellipsoid(fx + 1, fy - 0.3, 2.2, 1.2, R.leather, o);
  };
  leg(-1);

  // ---------- Cape, flowing behind ----------
  const flow = dash ? 9 : run ? 4 + Math.sin(t * 2) * 1.2 : 1 + Math.sin(t) * 0.6;
  const lift = dash ? 7 : run ? 2.5 + Math.sin(t * 2 + 1) : 0;
  const sx = cx - 2.5 + top(17);
  p.poly(
    [
      [sx + 1, 16.5 + bob],
      [sx - 2.5, 18 + bob],
      [sx - 3 - flow * 0.6, 22 + bob - lift * 0.4],
      [sx - 4 - flow * 1.1, 27.5 + bob - lift],
      [sx - 1.5 - flow * 0.8, 28.5 + bob - lift * 0.8],
      [sx + 0.5 - flow * 0.4, 27 + bob - lift * 0.5],
      [sx + 2.5, 24 + bob],
    ],
    CAPE,
    0.45,
  );

  // ---------- Ponytail, swinging behind the head ----------
  const hx = cx + 0.5 + top(10);
  const hy = 10.5 + bob;
  const tailSwing = dash ? 6 : run ? 3 + Math.sin(t * 2) * 1.5 : Math.sin(t) * 0.8;
  const tailLift = dash ? 5 : run ? 2 + Math.cos(t * 2) : 0;
  const t0x = hx - 4.4;
  const t0y = hy - 1.2;
  const t1x = t0x - 1.2 - tailSwing * 0.7;
  const t1y = t0y + 4.5 - tailLift * 0.7;
  const t2x = t1x - 0.8 - tailSwing * 0.7;
  const t2y = t1y + 4.5 - tailLift * 0.9;
  p.rod(t0x, t0y, t1x, t1y, 1.8, R.hair, { bias: -0.05 });
  p.rod(t1x, t1y, t2x, t2y, 1.3, R.hair, { bias: -0.08 });
  p.ellipsoid(t2x, t2y + 0.4, 0.9, 1.2, R.hair, { bias: -0.1 });

  // ---------- Back arm ----------
  const armSwing = run ? Math.sin(t) * 4 : dash ? -4 : 0;
  const shY = 18 + bob;
  p.rod(cx - 2 + top(18), shY, cx - 2.5 + armSwing + top(22), shY + 5.5, 1.1, TUNIC, { bias: -0.2 });
  p.ellipsoid(cx - 2.5 + armSwing + top(22), shY + 6.2, 1.1, 1.1, R.skin, { bias: -0.15 });

  // ---------- Torso: fitted tunic with a belt and a short skirt ----------
  p.fill(
    (x, y) => {
      const yy = y - bob;
      if (yy < 16.5 || yy > 28) return false;
      const c = cx + top(y);
      const w = yy < 22.5 ? 2.7 + (yy - 16.5) * 0.04 : 2.9 + (yy - 22.5) * 0.5;
      return Math.abs(x - c) <= w;
    },
    TUNIC,
    (x, y) => {
      const c = cx + top(y);
      const u = Math.max(-1, Math.min(1, (x - c) / 4));
      return lightOf(u, -0.2, Math.sqrt(1 - u * u), { bias: 0.05 });
    },
  );
  for (let x = -3; x <= 3; x++) p.dot(Math.round(cx + top(22) + x), 22 + bob, x === 1 ? R.gold[3] : R.leather[2], R.leather);
  // Hood resting on the shoulders
  p.ellipsoid(cx - 1.5 + top(16), 16.5 + bob, 3.6, 1.7, CAPE, { sep: 0.2 });

  // ---------- Front leg (over the skirt) ----------
  leg(1);

  // ---------- Head ----------
  p.ellipsoid(hx - 0.8, hy - 0.9, 4.8, 4.6, R.hair, { bias: -0.02 });
  p.ellipsoid(hx + 0.9, hy + 0.8, 4, 4.3, R.skin, { sep: 0.12, bias: 0.14, floor: 0.5 });
  // Bangs swept to the side, and a lock framing the face
  p.ellipsoid(hx + 0.4, hy - 3.3, 4.9, 2.1, R.hair, { sep: 0.12 });
  p.rod(hx + 3.8, hy - 2, hx + 4.2, hy + 2.5, 0.9, R.hair, { bias: 0.05 });
  p.dot(Math.round(t0x + 0.5), Math.round(t0y), R.gold[3], R.gold); // hair tie

  // Face, looking right: determined eyes, a little blush
  const ex = Math.round(hx + 1);
  const ey = Math.round(hy);
  for (const dx of [0, 3]) {
    p.dot(ex + dx, ey, "#ffffff");
    p.dot(ex + dx, ey + 1, OUTLINE);
    p.dot(ex + dx + 1, ey, OUTLINE);
    p.dot(ex + dx + 1, ey + 1, OUTLINE);
  }
  p.dot(ex - 1, ey - 1, R.hair[1]);
  p.dot(ex + 4, ey - 1, R.hair[1]);
  p.dot(ex - 1, ey + 2, R.blush[1]);
  p.dot(ex + 3, ey + 3, R.skin[1]);

  // ---------- Front arm with a glowing wand ----------
  const fa = run ? -Math.sin(t) * 3.5 : dash ? 4 : 1;
  const hand = { x: cx + 3.5 + fa + top(22), y: shY + 5 - (dash ? 2 : 0) };
  p.rod(cx + 2 + top(18), shY, hand.x, hand.y, 1.15, TUNIC, { sep: 0.15 });
  p.ellipsoid(hand.x + 0.3, hand.y + 0.4, 1.2, 1.2, R.skin, { floor: 0.45 });
  const wx = hand.x + (dash ? 5.5 : 4);
  const wy = hand.y - (dash ? 1 : 3.5);
  p.rod(hand.x + 0.6, hand.y, wx, wy, 0.6, R.wood);
  p.ellipsoid(wx + 0.5, wy - 0.5, 1.5, 1.5, R.fire, { spec: 0.7 });
  return p.bake();
}
