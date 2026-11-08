import * as THREE from "three";

// A slender traveler in the clean-line illustration style: about seven heads tall,
// a red cape, a bedroll on her pack and a long walking staff. Flat toon shading;
// the ink outlines come from the edge-detection pass, not from the model.

const C = {
  skin: 0xf2d2b4,
  hair: 0xe6c98a,
  shirt: 0xf0e6d6,
  vest: 0x8a5a3a,
  pants: 0x5a4e6a,
  boots: 0x6a4632,
  cape: 0xd0482e,
  capeInner: 0xa83a28,
  pack: 0x8a5a3a,
  bedroll: 0xf4ecd8,
  staff: 0x7a5a3e,
  belt: 0x4a3428,
};

export class Traveler {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private legs: THREE.Group[] = [];
  private shins: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private cape!: THREE.Mesh;
  private capeBase!: Float32Array;
  private phase = 0;

  constructor(private mat: (color: number) => THREE.Material) {
    this.build();
  }

  private mesh(geo: THREE.BufferGeometry, color: number, parent: THREE.Object3D, pos: [number, number, number], rot?: [number, number, number]) {
    const m = new THREE.Mesh(geo, this.mat(color));
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  private build() {
    this.root.add(this.hips);
    this.hips.position.y = 0.92;

    // Legs: thigh and shin on separate pivots so the knee bends
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.09, 0, 0);
      this.hips.add(thigh);
      this.mesh(new THREE.CapsuleGeometry(0.075, 0.32, 6, 12), C.pants, thigh, [0, -0.22, 0]);
      const shin = new THREE.Group();
      shin.position.set(0, -0.44, 0);
      thigh.add(shin);
      this.mesh(new THREE.CapsuleGeometry(0.065, 0.24, 6, 12), C.pants, shin, [0, -0.15, 0]);
      this.mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.2, 12), C.boots, shin, [0, -0.32, 0]);
      this.mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10), C.boots, shin, [0, -0.43, 0.06], [Math.PI / 2, 0, 0]);
      this.legs.push(thigh);
      this.shins.push(shin);
    }

    // Torso: shirt, vest and belt
    this.hips.add(this.torso);
    this.mesh(new THREE.CapsuleGeometry(0.13, 0.32, 6, 14).scale(1, 1, 0.75), C.shirt, this.torso, [0, 0.26, 0]);
    this.mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.06, 14).scale(1, 1, 0.8), C.belt, this.torso, [0, 0.06, 0]);
    this.mesh(new THREE.CapsuleGeometry(0.11, 0.08, 4, 12).scale(1, 1, 0.8), C.pants, this.torso, [0, -0.02, 0]);
    // Strap across the chest
    this.mesh(new THREE.BoxGeometry(0.04, 0.42, 0.02), C.vest, this.torso, [0.02, 0.3, 0.1], [0, 0, 0.6]);

    // Pack with a bedroll
    this.mesh(new THREE.BoxGeometry(0.24, 0.3, 0.12), C.pack, this.torso, [0, 0.3, -0.16]);
    this.mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.3, 14), C.bedroll, this.torso, [0, 0.5, -0.17], [0, 0, Math.PI / 2]);

    // Neck and head with a messy bun
    this.mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), C.skin, this.torso, [0, 0.55, 0]);
    const head = new THREE.Group();
    head.position.set(0, 0.68, 0.01);
    this.torso.add(head);
    this.mesh(new THREE.SphereGeometry(0.11, 16, 12).scale(0.92, 1.05, 1), C.skin, head, [0, 0, 0]);
    this.mesh(new THREE.SphereGeometry(0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.05, 1.02), C.hair, head, [0, 0.01, -0.01]);
    this.mesh(new THREE.SphereGeometry(0.06, 12, 10), C.hair, head, [0, 0.1, -0.08]);
    this.mesh(new THREE.ConeGeometry(0.012, 0.12, 6), C.staff, head, [0.03, 0.17, -0.09], [0.3, 0, -0.3]);

    // Arms: the right holds a staff
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.17, 0.45, 0);
      this.torso.add(arm);
      this.mesh(new THREE.CapsuleGeometry(0.05, 0.24, 5, 10), C.shirt, arm, [0, -0.15, 0]);
      this.mesh(new THREE.CapsuleGeometry(0.04, 0.18, 5, 10), C.skin, arm, [0, -0.38, 0.02]);
      this.arms.push(arm);
    }
    const staff = new THREE.Group();
    staff.position.set(0, -0.48, 0.03);
    this.arms[1].add(staff);
    this.mesh(new THREE.CylinderGeometry(0.015, 0.018, 1.7, 8), C.staff, staff, [0, 0.1, 0]);
    this.mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI * 1.3), C.staff, staff, [0.03, 0.97, 0], [0, 0, -0.6]);

    // Cape: a curved sheet hanging from the shoulders, bent each frame to flutter
    const capeGeo = new THREE.PlaneGeometry(0.42, 0.95, 6, 10);
    capeGeo.translate(0, -0.47, 0);
    const pos = capeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, -Math.cos((x / 0.21) * 1.2) * 0.09);
    }
    this.capeBase = Float32Array.from(pos.array as Float32Array);
    const capeMat = this.mat(C.cape) as THREE.MeshToonMaterial;
    capeMat.side = THREE.DoubleSide;
    this.cape = new THREE.Mesh(capeGeo, capeMat);
    this.cape.position.set(0, 0.55, -0.1);
    this.cape.castShadow = true;
    this.torso.add(this.cape);
  }

  update(dt: number, speed: number, t: number) {
    const walk = Math.min(1, speed / 1.6);
    this.phase += dt * speed * 3.4;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    this.legs[0].rotation.x = s * 0.55 * walk;
    this.legs[1].rotation.x = -s * 0.55 * walk;
    this.shins[0].rotation.x = Math.max(0, -c) * 0.8 * walk;
    this.shins[1].rotation.x = Math.max(0, c) * 0.8 * walk;
    this.arms[0].rotation.x = -s * 0.4 * walk;
    this.arms[1].rotation.x = s * 0.15 * walk - 0.15;
    this.hips.position.y = 0.92 + Math.abs(c) * 0.035 * walk;
    this.torso.rotation.x = 0.06 * walk;
    this.torso.rotation.y = s * 0.06 * walk;

    // Cape flutter: a travelling wave that grows toward the hem and with speed
    const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.capeBase[i * 3];
      const by = this.capeBase[i * 3 + 1];
      const bz = this.capeBase[i * 3 + 2];
      const k = -by / 0.95;
      const wave = Math.sin(t * 3.2 - k * 4 + bx * 3) * 0.04 * k + Math.sin(t * 1.3 + bx) * 0.02 * k;
      pos.setZ(i, bz - k * k * (0.08 + walk * 0.22) + wave);
      pos.setX(i, bx + Math.sin(t * 2.1 + k * 3) * 0.015 * k);
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }
}
