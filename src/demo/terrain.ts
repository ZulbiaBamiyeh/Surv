import * as THREE from "three";
import { noise } from "../art/world";

// A big terraced island: tall cliffs you jump up one step at a time, deep ravines to
// leap across, and a mountain in the middle with a view from the top.

export const N = 104; // cells per side
export const CELL = 2; // world units per cell
export const STEP = 1.25; // height of one terrace step
export const WATER_Y = 0.55 * STEP;
const HALF = (N * CELL) / 2;

export const PAL = {
  sand: 0xf6d28a,
  grass: [0x9ad65a, 0x84cc4e, 0x6cbc46],
  forest: [0x4fa040, 0x3c8c40],
  rock: [0xb0a8bc, 0x9a92ac],
  snow: 0xfafaff,
  strata: [0xd0905a, 0xb87a4e, 0xa86a4a, 0x8a7c9a, 0x7a6e8a],
  water: 0x48b0e8,
  leaf: [0x3c9a44, 0x5ab84e, 0x2f7a3e],
  trunk: 0x8a5232,
};

export class Terrain {
  readonly levels = new Int16Array(N * N);
  readonly group = new THREE.Group();
  spawn = new THREE.Vector3();
  peak = new THREE.Vector3();

  constructor(seed = 3) {
    this.generate(seed);
  }

  level(cx: number, cz: number): number {
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return -4;
    return this.levels[cz * N + cx];
  }

  /** Height of the ground at a world position (top of that cell's column). */
  heightAt(x: number, z: number): number {
    const cx = Math.floor((x + HALF) / CELL);
    const cz = Math.floor((z + HALF) / CELL);
    return this.level(cx, cz) * STEP;
  }

  cellCenter(cx: number, cz: number) {
    return new THREE.Vector3(cx * CELL - HALF + CELL / 2, this.level(cx, cz) * STEP, cz * CELL - HALF + CELL / 2);
  }

  private generate(seed: number) {
    let best = -1;
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const u = (x - N / 2) / (N / 2);
        const v = (z - N / 2) / (N / 2);
        const d = Math.hypot(u, v);
        const island = Math.max(0, 1 - d ** 2.2);
        const hills = noise(x, z, 26, seed) * 0.65 + noise(x, z, 9, seed + 1) * 0.35;
        const peak = Math.max(0, 1 - Math.hypot(u + 0.12, v + 0.18) / 0.48);
        let h = island * (1.5 + hills * 5) + peak ** 1.6 * 11 + noise(x, z, 6, seed + 2) * peak * 2.5;
        // Ravines: narrow canyons cutting through the hills
        const r = Math.abs(noise(x, z, 40, seed + 5) - 0.5);
        if (r < 0.022 && island > 0.25 && peak < 0.35) h = Math.min(h, 0.3);
        let L = island < 0.04 ? -2 : Math.max(0, Math.floor(h));
        if (island < 0.1 && L > 0) L = Math.min(L, 1);
        this.levels[z * N + x] = L;
        if (L > best) {
          best = L;
          this.peak = this.cellCenter(x, z);
        }
      }
    // Spawn on a broad, mid-height terrace south of the mountain
    let bestD = 1e9;
    for (let z = 6; z < N - 6; z++)
      for (let x = 6; x < N - 6; x++) {
        const L = this.level(x, z);
        if (L < 2 || L > 4) continue;
        let flat = true;
        for (let dz = -2; dz <= 2 && flat; dz++) for (let dx = -2; dx <= 2; dx++) if (this.level(x + dx, z + dz) !== L) flat = false;
        if (!flat) continue;
        const dd = Math.hypot(x - N / 2, z - (N / 2 + 18));
        if (dd < bestD) {
          bestD = dd;
          this.spawn = this.cellCenter(x, z);
        }
      }
  }

  topColor(L: number, rnd: number): THREE.Color {
    const c = new THREE.Color();
    if (L <= 0) c.setHex(PAL.sand);
    else if (L <= 4) c.setHex(PAL.grass[(L + (rnd < 0.3 ? 1 : 0)) % 3]);
    else if (L <= 7) c.setHex(PAL.forest[rnd < 0.5 ? 0 : 1]);
    else if (L <= 11) c.setHex(PAL.rock[rnd < 0.5 ? 0 : 1]);
    else c.setHex(PAL.snow);
    return c.multiplyScalar(0.95 + rnd * 0.1);
  }

  /** Ground color that drifts in big soft patches across the world. */
  topColorAt(L: number, wx: number, wz: number): THREE.Color {
    const n = noise(wx + 500, wz + 500, 14, 11) * 0.7 + noise(wx + 500, wz + 500, 5, 12) * 0.3;
    const mix = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, k)));
    if (L <= 0) return mix(PAL.sand, 0xe8c070, n);
    if (L <= 4) return n < 0.5 ? mix(PAL.grass[0], PAL.grass[1], n * 2) : mix(PAL.grass[1], PAL.grass[2], (n - 0.5) * 2);
    if (L <= 7) return mix(PAL.forest[0], PAL.forest[1], n * 1.3 - 0.15);
    if (L <= 11) return mix(PAL.rock[0], PAL.rock[1], n);
    return mix(PAL.snow, 0xd8e4f8, n * 0.8);
  }

  private quadColors(pos: number[], col: number[], a: number[], b: number[], c: number[], d: number[], cs: THREE.Color[]) {
    const verts = [a, b, c, a, c, d];
    const colors = [cs[0], cs[1], cs[2], cs[0], cs[2], cs[3]];
    verts.forEach((p, i) => {
      pos.push(p[0], p[1], p[2]);
      col.push(colors[i].r, colors[i].g, colors[i].b);
    });
  }

  wallColor(band: number, depth: number): THREE.Color {
    const c = new THREE.Color(band >= 8 ? PAL.strata[3 + (band % 2)] : PAL.strata[band % 3]);
    return c.multiplyScalar(0.92 - Math.min(0.25, depth * 0.04));
  }

  /** Builds the terrain mesh, ink outlines, water, trees, rocks and grass. */
  build(makeMat: (opts: THREE.MeshLambertMaterialParameters) => THREE.Material, outline: THREE.Material) {
    const pos: number[] = [];
    const col: number[] = [];
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => {
      for (const p of [a, b, c, a, c, d]) {
        pos.push(p[0], p[1], p[2]);
        col.push(color.r, color.g, color.b);
      }
    };
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const L = this.level(x, z);
        if (L < -1) continue;
        const y = L * STEP;
        const x0 = x * CELL - HALF;
        const x1 = x0 + CELL;
        const z0 = z * CELL - HALF;
        const z1 = z0 + CELL;
        // Top colors blend smoothly between corners; the foot of a cliff is shaded darker
        let ao = 1;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.level(x + dx, z + dz) > L) ao = 0.82;
        const corner = (wx: number, wz: number) => this.topColorAt(L, wx, wz).multiplyScalar(ao);
        this.quadColors(pos, col, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [corner(x0, z0), corner(x0, z1), corner(x1, z1), corner(x1, z0)]);
        const sides: [number, number, number[], number[]][] = [
          [0, 1, [x0, z1], [x1, z1]],
          [0, -1, [x1, z0], [x0, z0]],
          [1, 0, [x1, z1], [x1, z0]],
          [-1, 0, [x0, z0], [x0, z1]],
        ];
        for (const [dx, dz, a, b] of sides) {
          const nL = Math.max(-2, this.level(x + dx, z + dz));
          if (nL >= L) continue;
          // One band per terrace step, so cliff faces show rock strata
          for (let k = L; k > nL; k--) {
            const yt = k * STEP;
            const yb = (k - 1) * STEP;
            quad([a[0], yt, a[1]], [a[0], yb, a[1]], [b[0], yb, b[1]], [b[0], yt, b[1]], this.wallColor(k, L - k));
          }
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, makeMat({ vertexColors: true }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.group.add(mesh);
    this.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 35), outline));

    // Water
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(N * CELL * 3, N * CELL * 3),
      makeMat({ color: PAL.water, transparent: true, opacity: 0.85 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.receiveShadow = true;
    this.group.add(water);

    this.scatter(makeMat, rnd);
  }

  private scatter(makeMat: (opts: THREE.MeshLambertMaterialParameters) => THREE.Material, rnd: () => number) {
    const dummy = new THREE.Object3D();
    const trees: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const tufts: THREE.Matrix4[] = [];
    for (let z = 1; z < N - 1; z++)
      for (let x = 1; x < N - 1; x++) {
        const L = this.level(x, z);
        if (L < 1) continue;
        const c = this.cellCenter(x, z);
        if (c.distanceTo(this.spawn) < 5) continue;
        const r = rnd();
        if (L >= 2 && L <= 8 && r < (L >= 5 ? 0.16 : 0.06)) {
          dummy.position.set(c.x + (rnd() - 0.5) * 1.2, c.y, c.z + (rnd() - 0.5) * 1.2);
          const s = 0.8 + rnd() * 0.7;
          dummy.scale.set(s, s * (0.9 + rnd() * 0.4), s);
          dummy.rotation.set(0, rnd() * 6, 0);
          dummy.updateMatrix();
          trees.push(dummy.matrix.clone());
        } else if (L >= 6 && r < 0.12) {
          dummy.position.set(c.x + (rnd() - 0.5), c.y + 0.2, c.z + (rnd() - 0.5));
          const s = 0.5 + rnd() * 0.9;
          dummy.scale.set(s, s * 0.7, s);
          dummy.rotation.set(rnd(), rnd() * 6, rnd());
          dummy.updateMatrix();
          rocks.push(dummy.matrix.clone());
        }
        if (L >= 1 && L <= 7)
          for (let k = 0; k < 3; k++)
            if (rnd() < 0.45) {
              dummy.position.set(c.x + (rnd() - 0.5) * CELL * 0.9, c.y, c.z + (rnd() - 0.5) * CELL * 0.9);
              dummy.scale.set(1, 0.7 + rnd() * 0.7, 1);
              dummy.rotation.set(0, rnd() * 6, 0);
              dummy.updateMatrix();
              tufts.push(dummy.matrix.clone());
            }
      }
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mx, i) => m.setMatrixAt(i, mx));
      m.castShadow = shadow;
      m.receiveShadow = true;
      this.group.add(m);
    };
    // Trees: a trunk and two stacked leafy blobs
    const trunk = new THREE.CylinderGeometry(0.16, 0.24, 1.4, 6).translate(0, 0.7, 0);
    const crownA = new THREE.IcosahedronGeometry(1.05, 0).translate(0, 1.9, 0);
    const crownB = new THREE.IcosahedronGeometry(0.75, 0).translate(0.15, 2.75, 0.1);
    inst(trunk, makeMat({ color: PAL.trunk }), trees);
    inst(crownA, makeMat({ color: PAL.leaf[0] }), trees);
    inst(crownB, makeMat({ color: PAL.leaf[1] }), trees);
    inst(new THREE.DodecahedronGeometry(0.7, 0), makeMat({ color: PAL.rock[1] }), rocks);
    inst(new THREE.ConeGeometry(0.12, 0.45, 3).translate(0, 0.22, 0), makeMat({ color: PAL.grass[2] }), tufts, false);
  }
}
