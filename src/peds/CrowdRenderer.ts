import * as THREE from 'three';
import { Humanoid, partsFor, roleColor, type BodyPart, type BodyRole, type HumanoidLook } from '../player/Humanoid';
import { copySurface } from '../render/Surfaces';

export type CrowdPose = 'walk' | 'sit' | 'lie' | 'air';

/**
 * Draws many people with one InstancedMesh per body part. A single template rig is posed for each
 * person and its part matrices are copied into the instance buffers. Each part keeps its own
 * instance count (only the people wearing it), and a part nobody on screen is wearing isn't drawn
 * at all, so the draw calls follow what's actually worn rather than every optional piece of every
 * body. Only the parts big enough to show in the shadow map cast shadows.
 */
interface Rig {
  template: Humanoid;
  parts: Array<{ node: THREE.Mesh; role: BodyRole; part: BodyPart | null; inst: THREE.InstancedMesh; n: number }>;
  count: number;
}

/** Small pieces that never show in a 12 cm-a-texel shadow map: no shadow pass for them. */
const NO_SHADOW = new Set<string>(['eyes', 'glasses', 'badge', 'visor', 'radio', 'tie', 'pocket', 'collar', 'lapels', 'moustache', 'goatee', 'belt', 'pads', 'briefcase']);
const castsShadow = (role: BodyRole, part: BodyPart | null, tris: number): boolean => !NO_SHADOW.has(part ?? role) && tris >= 30;

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
    // The template carries every optional piece (hoods, coats, kit, bags); a person's unworn
    // pieces are collapsed to nothing in the instance buffer.
    const template = new Humanoid(look, { lowDetail: true, allParts: true });
    template.root.matrixAutoUpdate = false;
    const mats = new Map<BodyRole, THREE.MeshStandardMaterial>();
    const parts: Rig['parts'] = [];
    for (const node of template.meshes) {
      const role = node.userData['role'] as BodyRole;
      const part = (node.userData['part'] as BodyPart | undefined) ?? null;
      const src = node.material as THREE.MeshStandardMaterial;
      // Same surface detail (skin, fabric, leather, hair) as the template it's copied from; the
      // badge and the visor keep their own metal / glass materials.
      const own = part === 'badge' || part === 'visor';
      let mat = own ? undefined : mats.get(role);
      if (!mat) {
        mat = own ? src.clone() : copySurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: src.roughness, side: src.side }), src);
        if (!own) mats.set(role, mat);
      }
      const inst = new THREE.InstancedMesh(node.geometry, mat, this.capacity);
      inst.count = 0;
      const g = node.geometry;
      inst.castShadow = castsShadow(role, part, (g.index ? g.index.count : g.attributes['position'].count) / 3);
      inst.receiveShadow = false;
      inst.frustumCulled = false;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Allocate per-instance colour.
      inst.setColorAt(0, this.color.set(0xffffff));
      scene.add(inst);
      inst.visible = false;
      parts.push({ node, role, part, inst, n: 0 });
    }
    return { template, parts, count: 0 };
  }

  begin(): void {
    for (const r of Object.values(this.rigs)) {
      r.count = 0;
      for (const p of r.parts) p.n = 0;
    }
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
    rig.count++;
    const wear = partsFor(look);
    for (const p of rig.parts) {
      if (p.part && !wear.has(p.part)) continue;
      const i = p.n++;
      p.inst.setMatrixAt(i, p.node.matrixWorld);
      p.inst.setColorAt(i, this.colorOf(p.part === 'badge' || p.part === 'visor' ? '#ffffff' : roleColor(look, p.role)));
    }
  }

  /** Parsed colours by CSS string (parsing '#rrggbb' for every part of every person adds up). */
  private readonly colors = new Map<string, THREE.Color>();
  private colorOf(css: string): THREE.Color {
    let c = this.colors.get(css);
    if (!c) this.colors.set(css, (c = new THREE.Color(css)));
    return c;
  }

  private readonly scaleV = new THREE.Vector3();
  private tmpScale(s: number): THREE.Vector3 {
    return this.scaleV.set(s, s, s);
  }

  end(): void {
    for (const r of Object.values(this.rigs))
      for (const p of r.parts) {
        p.inst.count = p.n;
        p.inst.visible = p.n > 0;
        if (p.n === 0) continue;
        p.inst.instanceMatrix.clearUpdateRanges();
        p.inst.instanceMatrix.addUpdateRange(0, p.n * 16);
        p.inst.instanceMatrix.needsUpdate = true;
        if (p.inst.instanceColor) {
          p.inst.instanceColor.clearUpdateRanges();
          p.inst.instanceColor.addUpdateRange(0, p.n * 3);
          p.inst.instanceColor.needsUpdate = true;
        }
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
  return { ...base, top: '#1c2a4a', legs: '#18223a', shoes: '#0d0d0d', hair: '#141414', skirt: false, hairStyle: base.build === 'f' ? 'bun' : 'short', outfit: 'uniform', bag: 'none', hat: 'none' };
}

/** Tactical unit: helmet and visor, plate vest, knee pads, everything dark navy. */
export function swatLook(rand: () => number = Math.random): HumanoidLook {
  const base = randomLook(rand);
  return { ...base, top: '#1a2236', legs: '#161c2c', shoes: '#0d0d0d', hair: '#141414', skirt: false, hairStyle: 'short', outfit: 'swat', bag: 'none', hat: 'none', scale: 1.0 + rand() * 0.06 };
}

const SKIRTS = ['#7d1f22', '#22252b', '#204a7a', '#5a4a7a', '#c78a2a', '#3d5b3a', '#6b6f75'];
const OUTERS = ['#23262c', '#2f3a4a', '#4a3b2e', '#1d1f24', '#3b4a3a', '#5a4c3f', '#2a2f3a', '#6b4a2a', '#2b2b2b', '#394452'];
const BAGS = ['#2a2b2f', '#3a3a3f', '#4a3f32', '#23323f'];

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
  // Layers: most people wear something over the top in this city (hoodies, jackets, long coats,
  // the odd suit), and about a third carry something.
  const r = rand();
  look.outfit = r < 0.2 ? 'tee' : r < 0.45 ? 'hoodie' : r < 0.75 ? 'jacket' : r < 0.92 ? 'coat' : 'suit';
  if (look.outfit !== 'tee') look.outer = look.outfit === 'suit' ? pick(['#1d1f24', '#2a2f3a', '#3a3a3f']) : pick(OUTERS);
  if (look.outfit === 'hoodie') look.hood = rand() < 0.35;
  const b = rand();
  look.bag = b < 0.18 ? 'backpack' : b < 0.28 ? 'duffel' : look.outfit === 'suit' && b < 0.6 ? 'briefcase' : 'none';
  look.bagColor = pick(BAGS);
  if (look.outfit !== 'hoodie' || !look.hood) {
    const h = rand();
    look.hat = h < 0.12 ? 'cap' : h < 0.2 ? 'beanie' : 'none';
    look.hatColor = pick(['#1c1c22', '#3a2a22', '#2a3a4a', '#5a1f1f', '#2c2c2c']);
  }
  return look;
}

/** Mixes a hex colour towards grime (a grey-brown) by `k` (0..1). */
export function grime(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const [gr, gg, gb] = [74, 66, 54];
  const mix = (a: number, c: number): number => Math.round(a + (c - a) * k);
  return `#${((1 << 24) | (mix(r, gr) << 16) | (mix(g, gg) << 8) | mix(b, gb)).toString(16).slice(1)}`;
}

const COATS = ['#3b3426', '#2f3328', '#4a3a2a', '#25282c', '#5a4a3a', '#3a2f2a'];
const BEANIES = ['#4a2a22', '#2a3a4a', '#3a3a30', '#5a1f1f', '#2c2c2c'];

/**
 * Someone who lives rough in the sewers: everything faded and grimy, a heavy old coat, a beanie or
 * a battered cap, a beard on most of the men, greying hair, shoes worn to the colour of the floor.
 */
export function weatheredLook(base: Partial<HumanoidLook>, rand: () => number = Math.random): HumanoidLook {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
  const b = { ...randomLook(rand), ...base } as HumanoidLook;
  const k = 0.45 + rand() * 0.25;
  const look: HumanoidLook = {
    ...b,
    top: grime(b.top, k),
    legs: grime(b.legs, k),
    shoes: grime(b.shoes, 0.7),
    hair: rand() < 0.45 ? '#8a8680' : grime(b.hair, 0.3),
    jacket: rand() < 0.8 ? pick(COATS) : undefined,
    outfit: rand() < 0.6 ? 'coat' : 'hoodie',
    hood: rand() < 0.3,
    bag: rand() < 0.3 ? 'backpack' : 'none',
    hat: rand() < 0.6 ? (rand() < 0.75 ? 'beanie' : 'cap') : 'none',
    hatColor: grime(pick(BEANIES), 0.3),
    // Slightly stooped and smaller-looking: a touch shorter.
    scale: (b.scale ?? 1) * 0.97,
  };
  if (look.build !== 'f') look.facialHair = rand() < 0.75 ? (rand() < 0.7 ? 'beard' : 'goatee') : 'none';
  if (look.skirt) look.legs = grime(b.legs, 0.6);
  return look;
}
