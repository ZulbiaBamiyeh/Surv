// Dev-only: open /side-preview.html to inspect the sidescroller sprites up close.
import { catFrame, crawlerFrame, mothFrame, starBolt, wispFrame } from "./art";
import type { Sprite } from "../art/painter";

const rows: (Sprite | HTMLCanvasElement)[][] = [
  [0, 1, 2, 3].map((i) => catFrame("idle", i / 4)).concat([catFrame("idle", 0.95)]),
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => catFrame("run", i / 8)),
  [catFrame("jump", 0), catFrame("fall", 0), catFrame("dash", 0)],
  [
    ...[0, 1, 2, 3].map((i) => wispFrame(i / 4)),
    ...[0, 1, 2, 3].map((i) => mothFrame(i / 4)),
    ...[0, 1].map((i) => crawlerFrame(i / 2)),
    starBolt(0),
    starBolt(1),
  ],
];
const Z = Number(new URLSearchParams(location.search).get("z") ?? 6);
const c = document.getElementById("c") as HTMLCanvasElement;
const img = (s: Sprite | HTMLCanvasElement) => (s instanceof HTMLCanvasElement ? s : s.n);
const pad = 4;
const width = Math.max(...rows.map((r) => r.reduce((a, s) => a + img(s).width + pad, pad)));
const height = rows.reduce((a, r) => a + Math.max(...r.map((s) => img(s).height)) + pad, pad);
c.width = width * Z;
c.height = height * Z;
const x = c.getContext("2d")!;
x.imageSmoothingEnabled = false;
x.scale(Z, Z);
let y = pad;
for (const r of rows) {
  let xx = pad;
  for (const s of r) {
    x.drawImage(img(s), xx, y);
    xx += img(s).width + pad;
  }
  y += Math.max(...r.map((s) => img(s).height)) + pad;
}
