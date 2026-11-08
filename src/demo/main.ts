import * as THREE from "three";
import "./demo.css";
import { Fox } from "./fox";
import { CELL, N, STEP, Terrain, WATER_Y } from "./terrain";

// ---------- Tuning (all the numbers that shape how movement feels) ----------
const TUNE = {
  runSpeed: 7.5,
  accel: 60,
  friction: 50,
  airControl: 0.55,
  jumpSpeed: 8,
  gravity: 22,
  dashSpeed: 19,
  dashTime: 0.18,
  dashCooldown: 0.8,
  /** Falls longer than this many units hurt. */
  safeFall: 3.4,
  fallDamagePerUnit: 9,
  /** You can walk up ledges this tall without jumping. */
  stepUp: 0.35,
  radius: 0.35,
  camDistance: 9,
  camHeight: 4.2,
};

// ---------- Renderer with the Ink Dither Fine look ----------
const app = document.getElementById("app")!;
const canvas = document.createElement("canvas");
app.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(1);

const SKY_TOP = new THREE.Color(0x6cc4f0);
const SKY_HORIZON = new THREE.Color(0xd8eef4);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY_HORIZON, 40, 150);
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 400);

// Sky dome with a vertical gradient
scene.add(
  new THREE.Mesh(
    new THREE.SphereGeometry(300, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float k = clamp(normalize(vP).y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, k), 1.0); }",
    }),
  ),
);

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a6a, 0.5));
const sun = new THREE.DirectionalLight(0xfff4e0, 0.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const mat = (opts: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(opts);
const colorMat = (color: number) => new THREE.MeshLambertMaterial({ color });
const inkLine = new THREE.LineBasicMaterial({ color: 0x1a1426 });
const inkShell = new THREE.MeshBasicMaterial({ color: 0x1a1426, side: THREE.BackSide });

// Post-processing: ordered dithering that keeps the palette's hues
const target = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
target.depthBuffer = true;
const post = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: target.texture }, res: { value: new THREE.Vector2(16, 16) }, levels: { value: 6 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float levels; varying vec2 vUv;
    float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float b4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float L = levels - 1.0;
      c = floor(c * L + 0.5 + (b4(vUv * res) - 0.5)) / L;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
  depthTest: false,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ---------- World ----------
const terrain = new Terrain();
terrain.build(mat, inkLine);
scene.add(terrain.group);

// Drifting clouds, mostly below the summit so climbing feels high
const clouds: THREE.Group[] = [];
{
  const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + Math.random() * 1.6, 0), cm);
      b.position.set(k * 2.4 - 5, Math.random() * 0.8, Math.random() * 2);
      c.add(b);
    }
    c.position.set((Math.random() - 0.5) * 220, 9 + Math.random() * 7, (Math.random() - 0.5) * 220);
    scene.add(c);
    clouds.push(c);
  }
}

// ---------- The fox ----------
const fox = new Fox(colorMat, inkShell);
fox.root.scale.setScalar(1.25);
scene.add(fox.root);
const player = {
  pos: terrain.spawn.clone(),
  vel: new THREE.Vector3(),
  facing: 0,
  onGround: true,
  fallStart: terrain.spawn.y,
  dashT: 0,
  dashCd: 0,
  hp: 100,
  maxHp: 100,
  inv: 0,
  kills: 0,
  bestAlt: 0,
};
const blobShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.42, 12),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
);
blobShadow.rotation.x = -Math.PI / 2;
scene.add(blobShadow);

// ---------- Slimes ----------
interface Slime { mesh: THREE.Group; body: THREE.Mesh; pos: THREE.Vector3; vy: number; hp: number; hop: number; flash: number; kb: THREE.Vector3; }
const slimes: Slime[] = [];
const slimeGeo = new THREE.SphereGeometry(0.45, 10, 8);
const eyeGeo = new THREE.SphereGeometry(0.06, 5, 4);
const eyeMat = colorMat(0x1a1426);
function spawnSlime(near: THREE.Vector3) {
  for (let tries = 0; tries < 20; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 14 + Math.random() * 14;
    const x = near.x + Math.cos(a) * d;
    const z = near.z + Math.sin(a) * d;
    const y = terrain.heightAt(x, z);
    if (y <= WATER_Y) continue;
    const g = new THREE.Group();
    const color = Math.random() < 0.25 ? 0x9ad65a : 0xff83c0;
    const body = new THREE.Mesh(slimeGeo, new THREE.MeshLambertMaterial({ color, emissive: 0x000000 }));
    body.position.y = 0.4;
    body.castShadow = true;
    const shell = new THREE.Mesh(slimeGeo, inkShell);
    shell.scale.setScalar(1.08);
    body.add(shell);
    for (const ex of [-0.15, 0.15]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(ex, 0.08, 0.4);
      body.add(e);
    }
    g.add(body);
    scene.add(g);
    slimes.push({ mesh: g, body, pos: new THREE.Vector3(x, y, z), vy: 0, hp: 3, hop: Math.random() * 6, flash: 0, kb: new THREE.Vector3() });
    return;
  }
}
for (let i = 0; i < 22; i++) spawnSlime(player.pos);

// ---------- Fireballs and effects ----------
interface Shot { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; target: Slime | null; }
const shots: Shot[] = [];
const fireGeo = new THREE.IcosahedronGeometry(0.22, 1);
const fireMat = new THREE.MeshBasicMaterial({ color: 0xffb040 });
const glowTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,230,140,1)");
  g.addColorStop(0.35, "rgba(255,150,50,0.55)");
  g.addColorStop(1, "rgba(255,90,20,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
// A fixed pool of lights (adding lights at runtime would stall while shaders recompile)
const fireLights = [0, 1, 2].map(() => {
  const l = new THREE.PointLight(0xff8a30, 0, 4.5);
  scene.add(l);
  return l;
});
interface Puff { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number; }
const puffs: Puff[] = [];
const puffGeo = new THREE.IcosahedronGeometry(0.18, 0);
function burst(at: THREE.Vector3, color: number, n: number, speed: number) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(at);
    scene.add(m);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
    puffs.push({ mesh: m, vel: v, life: 0.5, max: 0.5 });
  }
}

// ---------- HUD ----------
const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML = `
  <div class="bars">
    <div class="hp"><i></i><span></span></div>
    <div class="dash"><i></i><span>Dash</span></div>
  </div>
  <div class="alt"><b>0</b> m <small>altitude</small></div>
  <div class="kills"><b>0</b> slimes</div>
  <div class="help">
    <span class="keys-only"><b>WASD</b> move · <b>Space</b> jump · <b>Shift</b> dash · <b>drag</b> or <b>Q/E</b> to turn the camera</span>
    <span class="touch-only">Left side: move · Right side: turn camera</span>
    · Climb to the summit for the view
  </div>
  <div class="touch-btns"><button class="tb jump" type="button">Jump</button><button class="tb dashb" type="button">Dash</button></div>`;
app.appendChild(hud);
const hpBar = hud.querySelector<HTMLElement>(".hp i")!;
const hpText = hud.querySelector<HTMLElement>(".hp span")!;
const dashBar = hud.querySelector<HTMLElement>(".dash i")!;
const altEl = hud.querySelector<HTMLElement>(".alt b")!;
const killsEl = hud.querySelector<HTMLElement>(".kills b")!;
const floaters: { el: HTMLElement; pos: THREE.Vector3; t: number }[] = [];
function floatText(text: string, at: THREE.Vector3, cls: string) {
  const el = document.createElement("div");
  el.className = "float " + cls;
  el.textContent = text;
  app.appendChild(el);
  floaters.push({ el, pos: at.clone(), t: 0 });
}

// ---------- Input ----------
const keys = new Set<string>();
let jumpQueued = 0;
let dashQueued = 0;
let camYaw = 0;
let camPitch = 0.38;
addEventListener("keydown", (e) => {
  if (e.code === "Space") { jumpQueued = 0.12; e.preventDefault(); }
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") dashQueued = 0.12;
  if (e.code.startsWith("Arrow")) e.preventDefault();
  keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
let dragId = -1;
let lastX = 0;
let lastY = 0;
const stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
canvas.addEventListener("pointerdown", (e) => {
  const touch = e.pointerType === "touch";
  if (touch && e.clientX < innerWidth / 2 && stick.id < 0) {
    Object.assign(stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
  } else if (dragId < 0) {
    dragId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === stick.id) {
    const dx = e.clientX - stick.ox;
    const dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    const k = Math.min(1, d / 50) / (d || 1);
    stick.x = dx * k;
    stick.y = dy * k;
  } else if (e.pointerId === dragId) {
    camYaw -= (e.clientX - lastX) * 0.006;
    camPitch = Math.max(0.12, Math.min(1.1, camPitch + (e.clientY - lastY) * 0.004));
    lastX = e.clientX;
    lastY = e.clientY;
  }
});
const endPointer = (e: PointerEvent) => {
  if (e.pointerId === stick.id) stick.id = -1;
  if (e.pointerId === dragId) dragId = -1;
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
hud.querySelector(".jump")!.addEventListener("pointerdown", (e) => { e.preventDefault(); jumpQueued = 0.12; });
hud.querySelector(".dashb")!.addEventListener("pointerdown", (e) => { e.preventDefault(); dashQueued = 0.12; });

// ---------- Movement against terraced ground ----------
function groundUnder(x: number, z: number) {
  const r = TUNE.radius;
  return Math.max(terrain.heightAt(x - r, z - r), terrain.heightAt(x + r, z - r), terrain.heightAt(x - r, z + r), terrain.heightAt(x + r, z + r));
}
function blocked(x: number, z: number, y: number) {
  return groundUnder(x, z) > y + TUNE.stepUp;
}

function respawn() {
  player.pos.copy(terrain.spawn);
  player.vel.set(0, 0, 0);
  player.hp = player.maxHp;
  player.fallStart = player.pos.y;
  floatText("Respawned", player.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), "info");
}

function hurt(amount: number, cls = "dmg") {
  player.hp = Math.max(0, player.hp - amount);
  player.inv = 0.8;
  floatText(String(Math.round(amount)), player.pos.clone().add(new THREE.Vector3(0, 2, 0)), cls);
  shake = 0.35;
  if (player.hp <= 0) respawn();
}

let shake = 0;
let castT = 0.5;
const tmp = new THREE.Vector3();

function step(dt: number, t: number) {
  // Input relative to the camera
  let ix = 0;
  let iz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) iz -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) iz += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
  if (stick.id >= 0) {
    ix = stick.x;
    iz = stick.y;
  }
  if (keys.has("KeyQ")) camYaw += dt * 2.2;
  if (keys.has("KeyE")) camYaw -= dt * 2.2;
  const len = Math.hypot(ix, iz);
  if (len > 1) {
    ix /= len;
    iz /= len;
  }
  const sin = Math.sin(camYaw);
  const cos = Math.cos(camYaw);
  const wx = ix * cos + iz * sin;
  const wz = -ix * sin + iz * cos;

  const p = player;
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.inv = Math.max(0, p.inv - dt);
  jumpQueued = Math.max(0, jumpQueued - dt);
  dashQueued = Math.max(0, dashQueued - dt);

  if (dashQueued > 0 && p.dashCd <= 0) {
    dashQueued = 0;
    p.dashT = TUNE.dashTime;
    p.dashCd = TUNE.dashCooldown;
    const dx = Math.hypot(wx, wz) > 0.1 ? wx : Math.sin(p.facing);
    const dz = Math.hypot(wx, wz) > 0.1 ? wz : Math.cos(p.facing);
    const dl = Math.hypot(dx, dz) || 1;
    p.vel.x = (dx / dl) * TUNE.dashSpeed;
    p.vel.z = (dz / dl) * TUNE.dashSpeed;
    if (p.vel.y < 0) p.vel.y = 0; // a dash in the air holds you up briefly
    burst(p.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 0x9ae8ff, 6, 3);
  }

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vel.y = Math.max(p.vel.y - TUNE.gravity * dt * 0.3, -2);
  } else {
    // Snappy acceleration toward the target velocity
    const control = p.onGround ? 1 : TUNE.airControl;
    const tx = wx * TUNE.runSpeed;
    const tz = wz * TUNE.runSpeed;
    const moving = Math.hypot(wx, wz) > 0.05;
    const rate = (moving ? TUNE.accel : TUNE.friction) * control * dt;
    const dx = tx - p.vel.x;
    const dz = tz - p.vel.z;
    const d = Math.hypot(dx, dz);
    if (d <= rate) {
      p.vel.x = tx;
      p.vel.z = tz;
    } else {
      p.vel.x += (dx / d) * rate;
      p.vel.z += (dz / d) * rate;
    }
    p.vel.y -= TUNE.gravity * dt;
  }

  if (jumpQueued > 0 && p.onGround) {
    jumpQueued = 0;
    p.vel.y = TUNE.jumpSpeed;
    p.onGround = false;
    p.fallStart = p.pos.y;
  }

  // Move one axis at a time so cliffs block cleanly
  const nx = p.pos.x + p.vel.x * dt;
  if (!blocked(nx, p.pos.z, p.pos.y)) p.pos.x = nx;
  else p.vel.x = 0;
  const nz = p.pos.z + p.vel.z * dt;
  if (!blocked(p.pos.x, nz, p.pos.y)) p.pos.z = nz;
  else p.vel.z = 0;
  p.pos.y += p.vel.y * dt;

  const g = groundUnder(p.pos.x, p.pos.z);
  const wasGround = p.onGround;
  if (p.pos.y <= g) {
    if (!wasGround) {
      const fell = p.fallStart - g;
      if (fell > TUNE.safeFall) hurt((fell - TUNE.safeFall) * TUNE.fallDamagePerUnit, "fall");
      burst(new THREE.Vector3(p.pos.x, g + 0.1, p.pos.z), 0xe8dcc0, fell > 2 ? 8 : 3, 2.5);
    }
    p.pos.y = g;
    p.vel.y = 0;
    p.onGround = true;
  } else if (p.pos.y > g + 0.05) {
    if (wasGround) p.fallStart = p.pos.y;
    p.onGround = false;
    p.fallStart = Math.max(p.fallStart, p.pos.y);
  }
  if (p.pos.y < WATER_Y - 0.4) {
    hurt(15, "fall");
    p.pos.copy(terrain.spawn);
    p.vel.set(0, 0, 0);
  }
  // Keep inside the island
  const lim = (N * CELL) / 2 - 2;
  p.pos.x = Math.max(-lim, Math.min(lim, p.pos.x));
  p.pos.z = Math.max(-lim, Math.min(lim, p.pos.z));

  const hs = Math.hypot(p.vel.x, p.vel.z);
  if (hs > 0.5) {
    const want = Math.atan2(p.vel.x, p.vel.z);
    let diff = want - p.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.facing += diff * Math.min(1, dt * 14);
  }
  fox.root.position.copy(p.pos);
  fox.root.rotation.y = p.facing;
  fox.root.visible = !(p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0);
  fox.update(dt, p.dashT > 0 ? 0 : hs, !p.onGround, p.dashT > 0, p.vel.y, t);
  blobShadow.position.set(p.pos.x, g + 0.03, p.pos.z);
  const lift = Math.max(0, p.pos.y - g);
  blobShadow.scale.setScalar(Math.max(0.4, 1 - lift * 0.12));
  p.bestAlt = Math.max(p.bestAlt, p.pos.y);

  // Slimes hop toward the player; they can hop up one step at a time
  for (const s of slimes) {
    s.hop += dt * 2.2;
    s.flash = Math.max(0, s.flash - dt);
    const to = tmp.copy(p.pos).sub(s.pos);
    to.y = 0;
    const d = to.length();
    const ground = terrain.heightAt(s.pos.x, s.pos.z);
    const airborne = s.pos.y > ground + 0.01;
    if (!airborne && Math.sin(s.hop) > 0.95 && d < 30) s.vy = 4.5;
    if (airborne || s.vy > 0) {
      to.normalize().multiplyScalar(3.2 * dt);
      const nx2 = s.pos.x + to.x + s.kb.x * dt;
      const nz2 = s.pos.z + to.z + s.kb.z * dt;
      if (terrain.heightAt(nx2, nz2) <= s.pos.y + 0.2) {
        s.pos.x = nx2;
        s.pos.z = nz2;
      }
    }
    s.kb.multiplyScalar(Math.exp(-6 * dt));
    s.vy -= TUNE.gravity * dt;
    s.pos.y += s.vy * dt;
    const gy = terrain.heightAt(s.pos.x, s.pos.z);
    if (s.pos.y <= gy) {
      s.pos.y = gy;
      s.vy = 0;
    }
    s.mesh.position.copy(s.pos);
    s.mesh.rotation.y = Math.atan2(p.pos.x - s.pos.x, p.pos.z - s.pos.z);
    const sq = airborne ? 0.9 : 1 + Math.max(0, Math.sin(s.hop) * -0.15);
    s.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    (s.body.material as THREE.MeshLambertMaterial).emissive.setHex(s.flash > 0 ? 0xffffff : 0x000000);
    if (d < 0.8 && Math.abs(s.pos.y - p.pos.y) < 1 && p.inv <= 0 && p.dashT <= 0) {
      hurt(8);
      p.vel.add(new THREE.Vector3(-to.x, 0, -to.z).normalize().multiplyScalar(6));
    }
    if (d > 60) {
      scene.remove(s.mesh);
      s.hp = 0;
    }
  }
  for (let i = slimes.length - 1; i >= 0; i--) if (slimes[i].hp <= 0) slimes.splice(i, 1);
  while (slimes.length < 22) spawnSlime(p.pos);

  // Auto-cast a fireball at the nearest slime
  castT -= dt;
  if (castT <= 0) {
    let best: Slime | null = null;
    let bd = 20;
    for (const s of slimes) {
      const d = s.pos.distanceTo(p.pos);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best) {
      castT = 0.55;
      const from = new THREE.Vector3();
      fox.staffTip.getWorldPosition(from);
      const m = new THREE.Mesh(fireGeo, fireMat);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(0.95, 0.95, 1);
      m.add(glow);
      m.position.copy(from);
      scene.add(m);
      const vel = best.pos.clone().add(new THREE.Vector3(0, 0.4, 0)).sub(from).normalize().multiplyScalar(18);
      shots.push({ mesh: m, vel, life: 1.5, target: best });
    } else castT = 0.1;
  }
  for (const sh of shots) {
    sh.life -= dt;
    if (sh.target && sh.target.hp > 0) {
      const want = sh.target.pos.clone().add(new THREE.Vector3(0, 0.4, 0)).sub(sh.mesh.position).normalize().multiplyScalar(18);
      sh.vel.lerp(want, Math.min(1, dt * 6));
    }
    sh.mesh.position.addScaledVector(sh.vel, dt);
    sh.mesh.rotation.x += dt * 10;
    for (const s of slimes) {
      if (s.hp <= 0) continue;
      if (sh.mesh.position.distanceTo(tmp.copy(s.pos).add(new THREE.Vector3(0, 0.4, 0))) < 0.65) {
        s.hp -= 1;
        s.flash = 0.08;
        s.kb.copy(sh.vel).setY(0).normalize().multiplyScalar(7);
        burst(sh.mesh.position.clone(), 0xffa424, 5, 3);
        sh.life = 0;
        if (s.hp <= 0) {
          p.kills++;
          burst(s.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xff83c0, 12, 4);
          scene.remove(s.mesh);
        }
        break;
      }
    }
    if (terrain.heightAt(sh.mesh.position.x, sh.mesh.position.z) > sh.mesh.position.y) sh.life = 0;
  }
  for (let i = shots.length - 1; i >= 0; i--)
    if (shots[i].life <= 0) {
      scene.remove(shots[i].mesh);
      shots.splice(i, 1);
    }
  fireLights.forEach((l, i) => {
    const sh = shots[i];
    l.intensity = sh ? 0.9 : 0;
    if (sh) l.position.copy(sh.mesh.position);
  });

  for (const pf of puffs) {
    pf.life -= dt;
    pf.vel.y -= 9 * dt;
    pf.mesh.position.addScaledVector(pf.vel, dt);
    const k = pf.life / pf.max;
    pf.mesh.scale.setScalar(Math.max(0.05, k));
    (pf.mesh.material as THREE.MeshBasicMaterial).opacity = k;
  }
  for (let i = puffs.length - 1; i >= 0; i--)
    if (puffs[i].life <= 0) {
      scene.remove(puffs[i].mesh);
      puffs.splice(i, 1);
    }

  clouds.forEach((c, i) => (c.position.x = ((c.position.x + dt * (0.6 + (i % 3) * 0.3) + 110) % 220) - 110));
}

// ---------- Camera: behind the fox, pulling back and up as you climb ----------
const camPos = new THREE.Vector3();
let camInit = false;
function updateCamera(dt: number) {
  const p = player.pos;
  const altitude = Math.max(0, p.y - 2 * STEP);
  const dist = TUNE.camDistance + altitude * 0.45;
  const pitch = camPitch + altitude * 0.008;
  const focus = new THREE.Vector3(p.x, p.y + 1.3, p.z);
  const want = new THREE.Vector3(
    focus.x + Math.sin(camYaw) * Math.cos(pitch) * dist,
    focus.y + Math.sin(pitch) * dist + TUNE.camHeight * 0.3,
    focus.z + Math.cos(camYaw) * Math.cos(pitch) * dist,
  );
  // Do not let terrain come between the camera and the fox
  for (let k = 1; k <= 10; k++) {
    const q = focus.clone().lerp(want, k / 10);
    const gh = terrain.heightAt(q.x, q.z) + 0.8;
    if (gh > q.y) want.y += gh - q.y;
  }
  if (!camInit) {
    camPos.copy(want);
    camInit = true;
  }
  camPos.lerp(want, 1 - Math.exp(-dt * 12));
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2);
  }
  camera.lookAt(focus);
  // Shadows follow the player
  sun.position.set(p.x - 30, p.y + 50, p.z + 18);
  sun.target.position.copy(p);
  (scene.fog as THREE.Fog).near = 40 + altitude * 1.2;
  (scene.fog as THREE.Fog).far = 150 + altitude * 3;
}

// ---------- Sizing ----------
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  target.setSize(w, h);
  post.uniforms.res.value.set(w, h);
}
addEventListener("resize", resize);
resize();

// ---------- HUD update ----------
function updateHud() {
  const p = player;
  hpBar.style.width = (p.hp / p.maxHp) * 100 + "%";
  hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  dashBar.style.width = (1 - p.dashCd / TUNE.dashCooldown) * 100 + "%";
  altEl.textContent = String(Math.round(Math.max(0, p.pos.y - WATER_Y) * 2));
  killsEl.textContent = String(p.kills);
  for (const f of floaters) {
    f.t += 1 / 60;
    const s = f.pos.clone().add(new THREE.Vector3(0, f.t * 1.5, 0)).project(camera);
    f.el.style.transform = `translate(${(s.x * 0.5 + 0.5) * innerWidth}px, ${(-s.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
    f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.1));
  }
  for (let i = floaters.length - 1; i >= 0; i--)
    if (floaters[i].t > 1.1) {
      floaters[i].el.remove();
      floaters.splice(i, 1);
    }
}

// ---------- Main loop: fixed-rate simulation, render every frame ----------
const TICK = 1 / 120;
let acc = 0;
let last = performance.now();
let time = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= TICK) {
    step(TICK, time);
    time += TICK;
    acc -= TICK;
  }
  updateCamera(dt);
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, { __demo: { player, terrain, TUNE, setYaw: (y: number) => (camYaw = y), setPitch: (v: number) => (camPitch = v) } });
