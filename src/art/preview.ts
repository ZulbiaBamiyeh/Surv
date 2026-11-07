// Dev-only sprite sheet: open /art-preview.html on the dev server to inspect the art up close.
import { batFrame, heroFrame, kingFrame, skeletonFrame, slimeFrame } from "./characters";
import { dieSprite, fireballFrame, gemSprite, poofFrames, scrollSprite } from "./items";
import type { Sprite } from "./painter";
import { RAMPS } from "./palette";
import { groundChunk, makePropKit } from "./world";

const kit = makePropKit();
const rows: Sprite[][] = [
  [0, 1, 2, 3].map((i) => heroFrame(i / 4, false)).concat([0, 1, 2, 3, 4, 5].map((i) => heroFrame(i / 6, true))),
  [0, 1, 2, 3, 4, 5].map((i) => slimeFrame(i / 6)).concat([0, 1, 2].map((i) => kingFrame(i / 3))),
  [0, 1, 2, 3].map((i) => batFrame(i / 4)).concat([0, 1, 2, 3].map((i) => skeletonFrame(i / 4))),
  [gemSprite(RAMPS.gemBlue), gemSprite(RAMPS.gemPink, 1.3), scrollSprite(), ...[3, 4, 6, 8, 10, 12, 20].map(dieSprite)],
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => fireballFrame((i / 8) * Math.PI * 2, i % 3)).concat(poofFrames()),
  [...kit.trees, ...kit.bushes].map((p) => p.sprite),
  [...kit.rocks, ...kit.mushrooms, kit.stump, ...kit.grass].map((p) => p.sprite),
];

const Z = Number(new URLSearchParams(location.search).get("z") ?? 5);
const c = document.getElementById("c") as HTMLCanvasElement;
const pad = 4;
const ground = groundChunk(0, 0);
const width = Math.max(...rows.map((r) => r.reduce((a, s) => a + s.w + pad, pad)));
const height = rows.reduce((a, r) => a + Math.max(...r.map((s) => s.h)) + pad, pad);
c.width = (width + 260) * Z;
c.height = Math.max(height, 260) * Z;
const x = c.getContext("2d")!;
x.imageSmoothingEnabled = false;
x.scale(Z, Z);
x.drawImage(ground, width, 0);
let y = pad;
for (const r of rows) {
  let xx = pad;
  for (const s of r) {
    x.drawImage(s.n, xx, y);
    xx += s.w + pad;
  }
  y += Math.max(...r.map((s) => s.h)) + pad;
}
