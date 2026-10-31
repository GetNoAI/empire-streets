import * as THREE from 'three';
import { Humanoid, type BodyRole, type HumanoidLook } from '../player/Humanoid';
import { copySurface } from '../render/Surfaces';

export type CrowdPose = 'walk' | 'sit' | 'lie' | 'air';

/**
 * Draws many people with one InstancedMesh per body part. A single template rig is posed for each
 * person and its part matrices are copied into the instance buffers, so the whole crowd costs
 * about 17 draw calls regardless of size.
 */
interface Rig {
  template: Humanoid;
  parts: Array<{ node: THREE.Mesh; role: BodyRole; inst: THREE.InstancedMesh }>;
  count: number;
}

/** Which body a look uses: men, women in skirts, women in trousers (each is its own instanced rig). */
type RigKey = 'm' | 'fs' | 'fp';
const rigKey = (look: HumanoidLook): RigKey => (look.build === 'f' ? (look.skirt ? 'fs' : 'fp') : 'm');

export class CrowdRenderer {
  private readonly rigs: Record<RigKey, Rig>;
  private readonly rootMatrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly lie = new THREE.Matrix4().makeRotationZ(Math.PI / 2);

  constructor(
    scene: THREE.Scene,
    private readonly capacity: number,
  ) {
    const W = '#ffffff';
    const base = { skin: W, hair: W, top: W, legs: W, shoes: W, scale: 1 };
    this.rigs = {
      m: this.makeRig(scene, { ...base }),
      fs: this.makeRig(scene, { ...base, build: 'f', skirt: true, hairStyle: 'long' }),
      fp: this.makeRig(scene, { ...base, build: 'f', hairStyle: 'ponytail' }),
    };
  }

  private makeRig(scene: THREE.Scene, look: HumanoidLook): Rig {
    const template = new Humanoid(look, { lowDetail: true });
    template.root.matrixAutoUpdate = false;
    const mats = new Map<BodyRole, THREE.MeshStandardMaterial>();
    const parts: Rig['parts'] = [];
    for (const node of template.meshes) {
      const role = node.userData['role'] as BodyRole;
      let mat = mats.get(role);
      if (!mat) {
        const src = node.material as THREE.MeshStandardMaterial;
        // Same surface detail (skin, fabric, leather, hair) as the template it's copied from.
        mat = copySurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: src.roughness, side: src.side }), src);
        mats.set(role, mat);
      }
      const inst = new THREE.InstancedMesh(node.geometry, mat, this.capacity);
      inst.count = 0;
      inst.castShadow = true;
      inst.receiveShadow = false;
      inst.frustumCulled = false;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Allocate per-instance colour.
      inst.setColorAt(0, this.color.set(0xffffff));
      scene.add(inst);
      parts.push({ node, role, inst });
    }
    return { template, parts, count: 0 };
  }

  begin(): void {
    for (const r of Object.values(this.rigs)) r.count = 0;
  }

  /**
   * Adds one person. `x, y, z, heading` place the feet; `parent` (optional) is a world matrix the
   * figure is attached to (e.g. a car), in which case x/y/z/heading are local to it.
   */
  add(x: number, y: number, z: number, heading: number, look: HumanoidLook, pose: CrowdPose, phase = 0, blend = 0, speed = 0, parent?: THREE.Matrix4): void {
    const rig = this.rigs[rigKey(look)];
    if (rig.count >= this.capacity) return;
    const t = rig.template;
    if (pose === 'sit') t.sit();
    else t.pose(phase, blend, speed, pose !== 'air');
    const s = look.scale;
    this.rootMatrix.makeRotationY(heading);
    if (pose === 'lie') this.rootMatrix.multiply(this.lie);
    this.rootMatrix.scale(this.tmpScale(s));
    this.rootMatrix.setPosition(x, y, z);
    if (parent) this.rootMatrix.premultiply(parent);
    t.root.matrix.copy(this.rootMatrix);
    t.root.updateMatrixWorld(true);
    const i = rig.count++;
    for (const p of rig.parts) {
      p.inst.setMatrixAt(i, p.node.matrixWorld);
      p.inst.setColorAt(i, this.color.set(look[p.role]));
    }
  }

  private readonly scaleV = new THREE.Vector3();
  private tmpScale(s: number): THREE.Vector3 {
    return this.scaleV.set(s, s, s);
  }

  end(): void {
    for (const r of Object.values(this.rigs))
      for (const p of r.parts) {
        p.inst.count = r.count;
        p.inst.instanceMatrix.needsUpdate = true;
        if (p.inst.instanceColor) p.inst.instanceColor.needsUpdate = true;
      }
  }
}

const SKIN = ['#f1c9a5', '#e0ac7d', '#c68e5f', '#a26b42', '#7d4a2b', '#5a3420'];
const HAIR = ['#1b1410', '#3a2618', '#5e3b22', '#a77b48', '#d9c08c', '#7a7a7a', '#2a2a2a'];
const TOPS = ['#2b3e57', '#7d1f22', '#e2e2dc', '#1f1f22', '#3d5b3a', '#c78a2a', '#5a4a7a', '#8a8f96', '#b74e2f', '#204a7a', '#d9b8a0'];
const LEGS = ['#22252b', '#2f3d5c', '#4a4038', '#1a1a1a', '#6b6f75', '#3b3226'];
const SHOES = ['#151515', '#3b2a1c', '#e8e8e8', '#5a5a5a'];

/** NYPD-style dark navy uniform with a random face. */
export function copLook(rand: () => number = Math.random): HumanoidLook {
  const base = randomLook(rand);
  // Uniform trousers for everyone; officers who are women wear their hair up.
  return { ...base, top: '#1c2a4a', legs: '#18223a', shoes: '#0d0d0d', hair: '#141414', skirt: false, hairStyle: base.build === 'f' ? 'bun' : 'short' };
}

const SKIRTS = ['#7d1f22', '#22252b', '#204a7a', '#5a4a7a', '#c78a2a', '#3d5b3a', '#6b6f75'];

/** A random passer-by: about half are women (some in skirts), a little shorter on average. */
export function randomLook(rand: () => number = Math.random): HumanoidLook {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
  const look: HumanoidLook = { skin: pick(SKIN), hair: pick(HAIR), top: pick(TOPS), legs: pick(LEGS), shoes: pick(SHOES), scale: 0.92 + rand() * 0.14 };
  if (rand() < 0.48) {
    look.build = 'f';
    look.scale *= 0.95;
    look.skirt = rand() < 0.5;
    look.hairStyle = look.skirt ? 'long' : 'ponytail';
    if (look.skirt) look.legs = pick(SKIRTS);
  }
  return look;
}
