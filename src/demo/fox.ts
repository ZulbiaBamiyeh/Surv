import * as THREE from "three";

// A fox mage built from simple shapes: a floppy pointed hat, a poncho, a satchel,
// a staff and a big swishy tail. Every part gets an ink outline (an inverted shell).

type MatFn = (color: number) => THREE.Material;

const C = {
  fur: 0xe8823a,
  cream: 0xfff0d8,
  dark: 0x2a1e2a,
  hat: 0xc42a36,
  hatBand: 0xffc83d,
  poncho: 0xd8343e,
  ponchoTrim: 0xffc83d,
  shirt: 0x3a2434,
  pants: 0x4a3238,
  boots: 0x6a4030,
  leather: 0x9a6a3a,
  wood: 0xb0743e,
  gem: 0x46d6f0,
  book: 0x3a8a4a,
};

export class Fox {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private tail = new THREE.Group();
  private hatTip = new THREE.Group();
  private head = new THREE.Group();
  private ponchoMesh!: THREE.Mesh;
  private phase = 0;
  readonly staffTip = new THREE.Object3D();

  constructor(private mat: MatFn, private outlineMat: THREE.Material) {
    this.build();
  }

  private part(geo: THREE.BufferGeometry, color: number, parent: THREE.Object3D, pos: [number, number, number], rot?: [number, number, number], outline = 0.035) {
    const m = new THREE.Mesh(geo, this.mat(color));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    parent.add(m);
    if (outline > 0) {
      // Inverted hull: a slightly larger copy showing only its back faces, in ink.
      const o = new THREE.Mesh(geo, this.outlineMat);
      const s = 1 + outline / Math.max(0.05, this.radiusOf(geo));
      o.scale.set(s, s, s);
      m.add(o);
    }
    return m;
  }

  private radiusOf(geo: THREE.BufferGeometry) {
    geo.computeBoundingSphere();
    return geo.boundingSphere!.radius;
  }

  private build() {
    const r = this.root;
    r.add(this.body);
    this.body.position.y = 0.6;

    // Legs: thigh and boot on a hip pivot
    for (const [leg, x] of [[this.legL, 0.13], [this.legR, -0.13]] as [THREE.Group, number][]) {
      leg.position.set(x, 0, 0);
      this.body.add(leg);
      this.part(new THREE.CylinderGeometry(0.11, 0.095, 0.34, 16), C.pants, leg, [0, -0.17, 0]);
      this.part(new THREE.CylinderGeometry(0.115, 0.13, 0.2, 16), C.boots, leg, [0, -0.38, 0]);
      this.part(new THREE.SphereGeometry(0.13, 16, 12).scale(1, 0.6, 1.5), C.boots, leg, [0, -0.47, 0.06]);
    }

    // Tail: a big curved brush with a cream tip
    this.tail.position.set(0, 0.05, -0.18);
    this.body.add(this.tail);
    const tailGeo = new THREE.SphereGeometry(0.2, 16, 12).scale(1, 1, 2.1);
    this.part(tailGeo, C.fur, this.tail, [0, 0.12, -0.36], [0.5, 0, 0]);
    this.part(new THREE.SphereGeometry(0.13, 16, 12).scale(1, 1, 1.4), C.cream, this.tail, [0, 0.36, -0.7], [0.9, 0, 0], 0.03);

    // Torso, poncho and satchel
    this.part(new THREE.CylinderGeometry(0.17, 0.2, 0.42, 16), C.shirt, this.body, [0, 0.22, 0]);
    this.ponchoMesh = this.part(new THREE.ConeGeometry(0.42, 0.55, 18, 1, true), C.poncho, this.body, [0, 0.36, 0]);
    (this.ponchoMesh.material as THREE.Material).side = THREE.DoubleSide;
    this.part(new THREE.TorusGeometry(0.3, 0.025, 8, 28), C.ponchoTrim, this.body, [0, 0.1, 0], [Math.PI / 2, 0, 0], 0);
    this.part(new THREE.BoxGeometry(0.2, 0.18, 0.1), C.leather, this.body, [-0.24, 0.02, 0.1], [0, 0.4, 0.15]);
    this.part(new THREE.SphereGeometry(0.035, 16, 12), C.hatBand, this.body, [0, 0.42, 0.25], undefined, 0);

    // Arms: the right holds a staff, the left a little spellbook
    for (const [arm, x] of [[this.armL, 0.24], [this.armR, -0.24]] as [THREE.Group, number][]) {
      arm.position.set(x, 0.48, 0);
      this.body.add(arm);
      this.part(new THREE.CylinderGeometry(0.055, 0.05, 0.36, 16), C.poncho, arm, [0, -0.18, 0]);
      this.part(new THREE.SphereGeometry(0.065, 16, 12), C.cream, arm, [0, -0.38, 0], undefined, 0.025);
    }
    this.part(new THREE.BoxGeometry(0.16, 0.2, 0.06), C.book, this.armL, [0.02, -0.42, 0.08], [0.2, 0, 0]);
    const staff = new THREE.Group();
    staff.position.set(0, -0.38, 0.02);
    this.armR.add(staff);
    this.part(new THREE.CylinderGeometry(0.03, 0.035, 1.5, 16), C.wood, staff, [0, 0.25, 0]);
    this.part(new THREE.TorusGeometry(0.09, 0.025, 8, 28), C.wood, staff, [0, 1.02, 0], undefined, 0);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: C.gem }));
    gem.position.set(0, 1.02, 0);
    staff.add(gem);
    gem.add(this.staffTip);

    // Head
    this.head.position.set(0, 0.68, 0.02);
    this.body.add(this.head);
    this.part(new THREE.SphereGeometry(0.24, 18, 14).scale(1, 0.92, 0.95), C.fur, this.head, [0, 0, 0]);
    this.part(new THREE.SphereGeometry(0.15, 16, 12).scale(1.1, 0.8, 0.9), C.cream, this.head, [0, -0.07, 0.12], undefined, 0);
    this.part(new THREE.ConeGeometry(0.1, 0.2, 14), C.fur, this.head, [0, -0.04, 0.27], [Math.PI / 2, 0, 0], 0.02);
    this.part(new THREE.SphereGeometry(0.035, 16, 12), C.dark, this.head, [0, -0.04, 0.38], undefined, 0);
    for (const x of [-0.09, 0.09]) {
      const eye = this.part(new THREE.SphereGeometry(0.038, 16, 12).scale(0.8, 1.2, 0.6), C.dark, this.head, [x, 0.04, 0.2], undefined, 0);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(0.012, 0.015, 0.02);
      eye.add(glint);
    }
    for (const x of [-1, 1]) {
      this.part(new THREE.ConeGeometry(0.07, 0.16, 12), C.cream, this.head, [x * 0.22, -0.09, 0.04], [0, 0, x * 1.9], 0.015);
      this.part(new THREE.ConeGeometry(0.05, 0.12, 12), C.cream, this.head, [x * 0.21, -0.02, 0.02], [0, 0, x * 1.6], 0.015);
    }
    this.part(new THREE.TorusGeometry(0.17, 0.06, 10, 24), C.cream, this.body, [0, 0.55, 0.01], [Math.PI / 2, 0, 0], 0.02);
    for (const x of [-0.15, 0.15]) {
      const ear = this.part(new THREE.ConeGeometry(0.08, 0.2, 12), C.fur, this.head, [x, 0.2, -0.02], [0, 0, -x * 1.6], 0.02);
      this.part(new THREE.ConeGeometry(0.035, 0.07, 12), C.dark, ear, [0, 0.07, 0], undefined, 0);
    }

    // Hat: a wide brim and a cone whose tip flops backward
    const hat = new THREE.Group();
    hat.position.set(0, 0.17, -0.02);
    hat.rotation.x = -0.12;
    this.head.add(hat);
    this.part(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 28), C.hat, hat, [0, 0, 0], undefined, 0.025);
    this.part(new THREE.CylinderGeometry(0.205, 0.215, 0.06, 24), C.hatBand, hat, [0, 0.04, 0], undefined, 0);
    this.part(new THREE.CylinderGeometry(0.1, 0.21, 0.32, 20), C.hat, hat, [0, 0.2, 0], undefined, 0.025);
    this.hatTip.position.set(0, 0.36, 0);
    hat.add(this.hatTip);
    this.part(new THREE.ConeGeometry(0.1, 0.34, 18), C.hat, this.hatTip, [0, 0.15, -0.04], [-0.5, 0, 0], 0.025);
  }

  /**
   * Animates the fox. `speed` is horizontal speed, `air` is true while jumping or falling,
   * `dash` is true during a dash.
   */
  update(dt: number, speed: number, air: boolean, dash: boolean, vy: number, t: number) {
    const run = Math.min(1, speed / 7);
    this.phase += dt * (4 + speed * 1.6);
    const s = Math.sin(this.phase);
    const swing = air ? 0 : run;

    this.legL.rotation.x = s * 0.9 * swing + (air ? -0.7 : 0);
    this.legR.rotation.x = -s * 0.9 * swing + (air ? 0.3 : 0);
    this.armL.rotation.x = -s * 0.6 * swing + (air ? -1.2 : 0) - (dash ? 0.6 : 0);
    this.armR.rotation.x = s * 0.4 * swing + (air ? -0.6 : 0.15) - (dash ? 1.1 : 0);
    this.armL.rotation.z = air ? 0.6 : 0.1;
    this.armR.rotation.z = air ? -0.4 : -0.1;

    const bob = air ? 0 : Math.abs(Math.cos(this.phase)) * 0.06 * run + Math.sin(t * 2.4) * 0.012 * (1 - run);
    this.body.position.y = 0.6 + bob;
    this.body.rotation.x = run * 0.18 + (dash ? 0.45 : 0) + (air ? Math.max(-0.2, Math.min(0.3, -vy * 0.03)) : 0);
    this.head.rotation.x = -this.body.rotation.x * 0.5;

    // Floppy bits lag behind the motion
    this.tail.rotation.x = 0.2 + run * 0.5 + (air ? Math.max(-0.4, Math.min(0.6, vy * 0.05)) : 0) + (dash ? 0.7 : 0);
    this.tail.rotation.y = Math.sin(this.phase * 0.5 + 0.5) * (0.25 + 0.2 * (1 - run));
    this.hatTip.rotation.x = -0.2 - run * 0.4 - (dash ? 0.5 : 0) + Math.sin(this.phase * 2) * 0.08 * run;
    this.hatTip.rotation.z = Math.sin(t * 1.7) * 0.08;
    const flare = 1 + run * 0.12 + (air ? 0.15 : 0);
    this.ponchoMesh.scale.set(flare, 1, flare);
  }
}
