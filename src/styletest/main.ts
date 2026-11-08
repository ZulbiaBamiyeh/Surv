import * as THREE from "three";
import { noise } from "../art/world";
import "./style.css";
import { Traveler } from "./traveler";

// A style test for the clean-line illustration look: flat toon shading, ink outlines
// from an edge-detection pass, hand-drawn strokes on the ground, and colors that
// fade into a pale sky with distance.

const INK = new THREE.Color(0x2a221e);
const SKY_TOP = new THREE.Color(0xbfd2d6);
const HAZE = new THREE.Color(0xdfe3d8);
const PAL = {
  forest: 0x55704a,
  meadow: 0x6e8a58,
  dirt: 0x6e5444,
  dirtLight: 0x7e6250,
  path: 0xa58c6c,
  rock: 0x8c857a,
  rockDark: 0x6e675e,
  mountain: 0x8a9a84,
  water: 0x4a5a6e,
  sand: 0xc4b48e,
};

// ---------- Renderer ----------
const app = document.getElementById("app")!;
const canvas = document.createElement("canvas");
app.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
const dpr = Math.min(2, window.devicePixelRatio || 1);
renderer.setPixelRatio(dpr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HAZE, 50, 520);
scene.background = SKY_TOP;
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 1500);

scene.add(new THREE.HemisphereLight(0xf4f0e4, 0x8a8070, 0.72));
const sun = new THREE.DirectionalLight(0xfff6e8, 0.55);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.5, 0.75, 0.42).normalize();

// Toon gradient: three flat tones
const grad = new THREE.DataTexture(new Uint8Array([175, 175, 175, 255, 220, 220, 220, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

const toon = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: grad });

/** Toon material with hand-drawn dashes and hatching on the surface. */
function strokeMaterial(params: THREE.MeshToonMaterialParameters, strength = 1) {
  const m = new THREE.MeshToonMaterial({ gradientMap: grad, ...params });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.inkColor = { value: INK };
    sh.uniforms.strokeStrength = { value: strength };
    sh.uniforms.sunDir = { value: SUN_DIR };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vW;\nvarying vec3 vWN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 inkColor; uniform float strokeStrength; uniform vec3 sunDir;
        varying vec3 vW; varying vec3 vWN;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float strokes(vec3 w, vec3 n, float shade, float viewDist){
          float slope = clamp(1.0 - n.y, 0.0, 1.0);
          vec2 g = n.xz;
          vec2 contour = length(g) > 0.08 ? normalize(vec2(-g.y, g.x)) : vec2(1.0, 0.0);
          float cell = 1.15;
          vec2 p = w.xz / cell;
          vec2 ip = floor(p);
          float width = max(0.018, fwidth(p.x) * 0.7);
          float m = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 c = ip + vec2(float(i), float(j));
            float density = 0.06 + slope * 0.9 + (1.0 - shade) * 0.25;
            if (h21(c) > density) continue;
            vec2 o = c + vec2(h21(c + 3.1), h21(c + 7.7));
            float a = (h21(c + 1.3) - 0.5) * 0.5;
            vec2 dir = vec2(contour.x * cos(a) - contour.y * sin(a), contour.x * sin(a) + contour.y * cos(a));
            float len = 0.12 + h21(c + 5.2) * 0.35;
            vec2 d = p - o;
            float t = clamp(dot(d, dir), -len, len);
            float dist = length(d - dir * t);
            m = max(m, 1.0 - smoothstep(width * 0.6, width * 1.4, dist));
          }
          return m * (1.0 - smoothstep(25.0, 90.0, viewDist));
        }`,
      )
      .replace(
        "#include <fog_fragment>",
        `{
          vec3 n = normalize(vWN);
          float shade = clamp(dot(n, sunDir) * 0.5 + 0.5, 0.0, 1.0);
          float viewDist = length(vW - cameraPosition);
          float s = strokes(vW, n, shade, viewDist) * strokeStrength;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, inkColor, s * 0.55);
        }
        #include <fog_fragment>`,
      );
  };
  return m;
}

// ---------- Terrain ----------
const SIZE = 640;
const RES = 320;
// A winding path across the hills toward a ridge
const pathPts = [
  new THREE.Vector2(20, 80), new THREE.Vector2(38, 50), new THREE.Vector2(50, 20), new THREE.Vector2(44, -10),
  new THREE.Vector2(62, -38), new THREE.Vector2(92, -50), new THREE.Vector2(112, -80), new THREE.Vector2(108, -118),
];
const pathCurve = new THREE.SplineCurve(pathPts);
const pathSamples = pathCurve.getSpacedPoints(400);

function distToPath(x: number, z: number) {
  let best = 1e9;
  for (const p of pathSamples) {
    const d = (p.x - x) ** 2 + (p.y - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function fbm(x: number, z: number, scale: number, seed: number, oct = 4) {
  let v = 0;
  let a = 0.5;
  let s = scale;
  for (let i = 0; i < oct; i++) {
    v += noise(x, z, s, seed + i) * a;
    a *= 0.5;
    s *= 0.5;
  }
  return v / (1 - 0.5 ** oct);
}

function rawHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  // Rolling foreground hills
  let h = fbm(x, z, 70, 1) * 22 - 4;
  // A valley with a lake off to the west
  const valley = Math.exp(-(((x + 70) / 55) ** 2) - ((z - 10) / 90) ** 2);
  h -= valley * 26;
  // A rising ridge to the east where the path climbs
  h += Math.max(0, (x - 20) / 60) ** 1.4 * 18 * (0.6 + fbm(x, z, 40, 9) * 0.6);
  // Escarpments: steep steps that become rock cliffs
  const esc = fbm(x, z, 45, 21);
  h += smooth(0.48, 0.53, esc) * 9;
  // Distant mountain ring
  const ring = smooth(170, 300, r);
  h += ring * (40 + fbm(x, z, 90, 31) * 80);
  return h;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const heights = new Float32Array((RES + 1) * (RES + 1));
const pathK = new Float32Array((RES + 1) * (RES + 1));
for (let j = 0; j <= RES; j++)
  for (let i = 0; i <= RES; i++) {
    const x = (i / RES - 0.5) * SIZE;
    const z = (j / RES - 0.5) * SIZE;
    let h = rawHeight(x, z);
    const d = Math.abs(x) < 140 && Math.abs(z) < 180 ? distToPath(x, z) : 1e9;
    const k = 1 - smooth(1.6, 4.5, d);
    if (k > 0) {
      // Flatten a shelf for the path by averaging nearby heights
      const avg = (rawHeight(x + 3, z) + rawHeight(x - 3, z) + rawHeight(x, z + 3) + rawHeight(x, z - 3)) / 4;
      h = h * (1 - k * 0.8) + avg * k * 0.8 - k * 0.25;
    }
    heights[j * (RES + 1) + i] = h;
    pathK[j * (RES + 1) + i] = k;
  }

function heightAt(x: number, z: number) {
  const fx = (x / SIZE + 0.5) * RES;
  const fz = (z / SIZE + 0.5) * RES;
  const i = Math.max(0, Math.min(RES - 1, Math.floor(fx)));
  const j = Math.max(0, Math.min(RES - 1, Math.floor(fz)));
  const tx = fx - i;
  const tz = fz - j;
  const h = (a: number, b: number) => heights[b * (RES + 1) + a];
  return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz;
}

const WATER_Y = -14;
{
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const slope = 1 - nrm.getY(i);
    const n = noise(x + 300, z + 300, 18, 4);
    const r = Math.hypot(x, z);
    // Lowlands are forest green, the hills are bare earth with grassy patches
    if (y < WATER_Y + 1.2) c.setHex(PAL.sand);
    else if (y < -9 + n * 6) c.setHex(PAL.forest);
    else if (n > 0.62) c.setHex(PAL.meadow);
    else c.setHex(n > 0.4 ? PAL.dirtLight : PAL.dirt);
    if (r > 170) c.lerp(tmp.setHex(PAL.mountain), smooth(170, 260, r));
    if (slope > 0.32) c.lerp(tmp.setHex(slope > 0.5 ? PAL.rockDark : PAL.rock), smooth(0.32, 0.45, slope));
    c.lerp(tmp.setHex(PAL.path), pathK[i] * 0.95);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(geo, strokeMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), toon(PAL.water));
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  scene.add(water);
}

// ---------- Trees, shrubs and rocks ----------
/** An irregular, slightly bumpy blob for tree crowns. */
function lumpy(r: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (noise(v.x * 40 + seed * 10, v.y * 40 + v.z * 23, 9, seed) - 0.5) * 0.35;
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}
{
  const dummy = new THREE.Object3D();
  const treeM: THREE.Matrix4[] = [];
  const shrubM: THREE.Matrix4[] = [];
  const rockM: THREE.Matrix4[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 9000; k++) {
    const x = (rnd() - 0.5) * 360;
    const z = (rnd() - 0.5) * 360;
    const y = heightAt(x, z);
    if (y < WATER_Y + 1) continue;
    if (distToPath(x, z) < 4) continue;
    const n = noise(x + 300, z + 300, 18, 4);
    const forest = y < -9 + n * 6;
    const r = rnd();
    if (forest && r < 0.55) {
      dummy.position.set(x, y, z);
      const s = 1.6 + rnd() * 1.4;
      dummy.scale.set(s, s * (1 + rnd() * 0.5), s);
      dummy.rotation.set(0, rnd() * 6, 0);
      dummy.updateMatrix();
      treeM.push(dummy.matrix.clone());
    } else if (!forest && r < 0.05) {
      dummy.position.set(x, y, z);
      const s = 0.5 + rnd() * 0.6;
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, rnd() * 6, 0);
      dummy.updateMatrix();
      shrubM.push(dummy.matrix.clone());
    } else if (!forest && r < 0.075) {
      dummy.position.set(x, y + 0.1, z);
      const s = 0.3 + rnd() * 0.9;
      dummy.scale.set(s * 1.3, s * 0.6, s);
      dummy.rotation.set(rnd() * 0.3, rnd() * 6, rnd() * 0.3);
      dummy.updateMatrix();
      rockM.push(dummy.matrix.clone());
    }
  }
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  // Forest trees: a rounded crown on a short trunk
  inst(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6).translate(0, 0.6, 0), toon(0x5a4232), treeM);
  inst(lumpy(1, 1).scale(1, 1.25, 1).translate(0, 2, 0), toon(0x4a6a42), treeM);
  // Lone shrubs with a crooked stem
  const shrub = lumpy(0.9, 2).scale(1.2, 0.9, 1).translate(0.3, 2.2, 0);
  inst(new THREE.CylinderGeometry(0.06, 0.1, 2.2, 5).translate(0, 1.1, 0).rotateZ(-0.12), toon(0x5a4232), shrubM);
  inst(shrub, toon(0x6a8a5a), shrubM);
  inst(new THREE.DodecahedronGeometry(1, 0), toon(0x9a9284), rockM);
}

// ---------- Clouds: flat cream shapes with drawn outlines ----------
function cloudTexture(seed: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const x = c.getContext("2d")!;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const px = 70 + (i / 8) * 370 + (rnd() - 0.5) * 30;
    const r = 30 + rnd() * 45 * Math.sin((i / 8) * Math.PI) + 15;
    puffs.push([px, 190 - r * 0.8 - rnd() * 20, r]);
  }
  const draw = (pad: number, fill: string) => {
    x.fillStyle = fill;
    for (const [px, py, r] of puffs) {
      x.beginPath();
      x.arc(px, py, r + pad, 0, Math.PI * 2);
      x.fill();
    }
    x.fillRect(70 - pad, 160 - pad, 380 + pad * 2, 30 + pad * 2);
  };
  draw(3, "#2a221e");
  draw(0, "#f3f1e8");
  // A few inner curls
  x.strokeStyle = "rgba(42,34,30,0.7)";
  x.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const [px, py, r] = puffs[1 + Math.floor(rnd() * 7)];
    x.beginPath();
    x.arc(px + r * 0.2, py + r * 0.3, r * 0.45, Math.PI * 1.1, Math.PI * 1.7);
    x.stroke();
  }
  // Flat bottom edge
  x.fillStyle = "#f3f1e8";
  x.clearRect(0, 192, 512, 64);
  x.fillStyle = "#2a221e";
  x.fillRect(66, 189, 388, 3);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
const clouds: THREE.Sprite[] = [];
for (let i = 0; i < 9; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(11 + i * 17), fog: false, depthWrite: false, transparent: true }));
  const a = (i / 9) * Math.PI * 2 + 0.3;
  const d = 380 + (i % 3) * 60;
  sp.position.set(Math.cos(a) * d, 90 + (i % 4) * 25, Math.sin(a) * d);
  const w = 160 + (i % 3) * 60;
  sp.scale.set(w, w / 2, 1);
  sp.layers.set(1);
  scene.add(sp);
  clouds.push(sp);
}

// ---------- The traveler ----------
const traveler = new Traveler(toon);
scene.add(traveler.root);
let pathT = 0.08;

// ---------- Post-processing: ink outlines from depth and normals ----------
const colorRT = new THREE.WebGLRenderTarget(16, 16);
colorRT.depthTexture = new THREE.DepthTexture(16, 16);
colorRT.depthTexture.type = THREE.UnsignedIntType;
const normalRT = new THREE.WebGLRenderTarget(16, 16);
const normalMat = new THREE.MeshNormalMaterial();
const post = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: colorRT.texture },
    tDepth: { value: colorRT.depthTexture },
    tNormal: { value: normalRT.texture },
    res: { value: new THREE.Vector2(16, 16) },
    near: { value: camera.near },
    far: { value: camera.far },
    ink: { value: INK },
    px: { value: dpr },
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `
    #include <packing>
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tNormal;
    uniform vec2 res; uniform float near; uniform float far; uniform vec3 ink; uniform float px;
    varying vec2 vUv;
    float viewZ(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
    vec3 nrm(vec2 uv){ return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 e = px / res;
      float d0 = viewZ(vUv);
      float dl = viewZ(vUv - vec2(e.x, 0.0)), dr = viewZ(vUv + vec2(e.x, 0.0));
      float dd = viewZ(vUv - vec2(0.0, e.y)), du = viewZ(vUv + vec2(0.0, e.y));
      // Inverse depth is linear across flat surfaces, so its second difference finds real breaks
      float i0 = 1.0 / d0;
      float lap = abs(1.0 / dl + 1.0 / dr + 1.0 / dd + 1.0 / du - 4.0 * i0) / i0;
      float depthEdge = smoothstep(0.012, 0.03, lap);
      vec3 n0 = nrm(vUv);
      float nd = max(max(1.0 - dot(n0, nrm(vUv - vec2(e.x, 0.0))), 1.0 - dot(n0, nrm(vUv + vec2(e.x, 0.0)))),
                     max(1.0 - dot(n0, nrm(vUv - vec2(0.0, e.y))), 1.0 - dot(n0, nrm(vUv + vec2(0.0, e.y)))));
      float normalEdge = smoothstep(0.18, 0.35, nd);
      float edge = max(depthEdge, normalEdge);
      // Lines fade into the haze with distance, like the far hills in an illustration
      edge *= mix(1.0, 0.35, smoothstep(60.0, 450.0, d0));
      vec3 c = texture2D(tColor, vUv).rgb;
      c = mix(c, ink, edge * 0.9);
      // A little paper grain
      c += (h21(gl_FragCoord.xy) - 0.5) * 0.025;
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ---------- Camera ----------
let camYaw = 1.35;
let camPitch = 0.2;
let camDist = 12;
let dragId = -1;
let lx = 0;
let ly = 0;
canvas.addEventListener("pointerdown", (e) => {
  dragId = e.pointerId;
  lx = e.clientX;
  ly = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== dragId) return;
  camYaw -= (e.clientX - lx) * 0.005;
  camPitch = Math.max(0.02, Math.min(1.2, camPitch + (e.clientY - ly) * 0.004));
  lx = e.clientX;
  ly = e.clientY;
});
canvas.addEventListener("pointerup", () => (dragId = -1));
canvas.addEventListener("wheel", (e) => {
  camDist = Math.max(4, Math.min(80, camDist * (1 + Math.sign(e.deltaY) * 0.1)));
  e.preventDefault();
}, { passive: false });
let walking = true;
addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    walking = !walking;
    e.preventDefault();
  }
});

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  colorRT.setSize(w * dpr, h * dpr);
  normalRT.setSize(w * dpr, h * dpr);
  post.uniforms.res.value.set(w * dpr, h * dpr);
}
addEventListener("resize", resize);
resize();

// ---------- Loop ----------
let last = performance.now();
let time = 0;
const look = new THREE.Vector3();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  const speed = walking ? 1.5 : 0;
  pathT = (pathT + (speed * dt) / pathCurve.getLength()) % 1;
  const p = pathCurve.getPointAt(pathT);
  const ahead = pathCurve.getPointAt(Math.min(1, pathT + 0.002));
  const y = heightAt(p.x, p.y);
  traveler.root.position.set(p.x, y, p.y);
  traveler.root.rotation.y = Math.atan2(ahead.x - p.x, ahead.y - p.y);
  traveler.update(dt, speed, time);

  look.set(p.x, y + 1.3, p.y);
  camera.position.set(
    p.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
    y + 1.3 + Math.sin(camPitch) * camDist + 1,
    p.y + Math.cos(camYaw) * Math.cos(camPitch) * camDist,
  );
  const ground = heightAt(camera.position.x, camera.position.z) + 1;
  if (camera.position.y < ground) camera.position.y = ground;
  camera.lookAt(look);
  sun.position.copy(look).addScaledVector(SUN_DIR, 120);
  sun.target.position.copy(look);

  // Color pass with clouds, then a normals pass without them, then ink
  camera.layers.enableAll();
  renderer.setRenderTarget(colorRT);
  renderer.render(scene, camera);
  camera.layers.set(0);
  scene.overrideMaterial = normalMat;
  const bg = scene.background;
  scene.background = new THREE.Color(0x8080ff);
  renderer.setRenderTarget(normalRT);
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  scene.background = bg;
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, {
  __style: {
    set(o: { yaw?: number; pitch?: number; dist?: number; t?: number; walk?: boolean }) {
      if (o.yaw !== undefined) camYaw = o.yaw;
      if (o.pitch !== undefined) camPitch = o.pitch;
      if (o.dist !== undefined) camDist = o.dist;
      if (o.t !== undefined) pathT = o.t;
      if (o.walk !== undefined) walking = o.walk;
    },
  },
});
