import * as THREE from 'three';
import { withSurface } from '../render/Surfaces';

export interface HumanoidLook {
  skin: string;
  hair: string;
  top: string;
  legs: string;
  shoes: string;
  /** Overall height scale (1 = 1.8 m). */
  scale: number;
  /** Body shape: 'f' is a feminine figure (narrower shoulders and waist, fuller hips, a bust). */
  build?: 'm' | 'f';
  /** Hair: short (default), long (down past the shoulders), bun, ponytail or bald. */
  hairStyle?: 'short' | 'long' | 'bun' | 'ponytail' | 'bald';
  /** A skirt (in the `legs` colour; the shins are bare). */
  skirt?: boolean;
  /** An apron over the front (colour), for the Mamas and anyone else who cooks or fixes engines. */
  apron?: string;
  /** Headwear and its colour, shades, an open jacket (its colour), facial hair. */
  hat?: 'none' | 'cap' | 'beanie' | 'fedora';
  hatColor?: string;
  glasses?: boolean;
  jacket?: string;
  facialHair?: 'none' | 'moustache' | 'goatee' | 'beard';
  /**
   * What they're wearing over the top (`outer` colour, or the `jacket` colour, or a shade of the
   * top): a hoodie (hood up or down), a zipped jacket with a collar and cuffs, a long coat with
   * lapels, a suit jacket with a tie, a patrol uniform (duty belt, badge, radio, peaked cap) or
   * tactical kit (helmet with a visor, plate vest, knee pads). The crowd carries every one of
   * these as the same instanced parts and hides what a person isn't wearing.
   */
  outfit?: 'tee' | 'hoodie' | 'jacket' | 'coat' | 'suit' | 'uniform' | 'swat';
  outer?: string;
  /** Hoodie: hood up over the head. */
  hood?: boolean;
  /** Something carried: a backpack, a duffel bag over the shoulder, a briefcase in the left hand. */
  bag?: 'none' | 'backpack' | 'duffel' | 'briefcase';
  bagColor?: string;
}

/**
 * Body parts by what colours them: the five of the figure itself, then the layers over it (the
 * outer garment, black webbing and kit, headwear, a bag) and the eyes.
 */
export type BodyRole = 'skin' | 'hair' | 'top' | 'legs' | 'shoes' | 'outer' | 'gear' | 'hat' | 'bag' | 'eyes';
export const BODY_ROLES: readonly BodyRole[] = ['skin', 'hair', 'top', 'legs', 'shoes', 'outer', 'gear', 'hat', 'bag', 'eyes'];

/** The optional pieces a figure can wear (each mesh of one is tagged `userData.part`). */
export type BodyPart =
  | 'hoodDown'
  | 'hoodUp'
  | 'pocket'
  | 'jacket'
  | 'collar'
  | 'coat'
  | 'lapels'
  | 'tie'
  | 'belt'
  | 'badge'
  | 'radio'
  | 'policeCap'
  | 'helmet'
  | 'visor'
  | 'vest'
  | 'pads'
  | 'cap'
  | 'beanie'
  | 'fedora'
  | 'glasses'
  | 'backpack'
  | 'duffel'
  | 'briefcase'
  | 'moustache'
  | 'goatee'
  | 'beard'
  | 'hairShort'
  | 'hairLong'
  | 'hairBun'
  | 'hairTail'
  | 'skirt'
  | 'apron';

/** The colour each role takes for a look (the layers derive theirs from the figure's). */
export function roleColor(look: HumanoidLook, role: BodyRole): string {
  switch (role) {
    case 'outer':
      return look.outer ?? look.jacket ?? shade(look.top, 0.78);
    case 'gear':
      return look.outfit === 'swat' ? '#1b2130' : '#16171b';
    case 'hat':
      return look.hatColor ?? (look.outfit === 'uniform' ? '#161c2e' : look.outfit === 'swat' ? '#232a3a' : look.outer ?? look.jacket ?? shade(look.top, 0.78));
    case 'bag':
      return look.bagColor ?? '#2a2b2f';
    case 'eyes':
      return '#1a1612';
    default:
      return look[role];
  }
}

/** Which optional parts a look wears. */
export function partsFor(look: HumanoidLook): Set<BodyPart> {
  const p = new Set<BodyPart>();
  const fem = look.build === 'f';
  const style = look.hairStyle ?? (fem ? 'long' : 'short');
  const outfit = look.outfit ?? (look.jacket ? 'jacket' : 'tee');
  const hoodUp = outfit === 'hoodie' && !!look.hood;
  if (style !== 'bald' && !hoodUp && outfit !== 'swat') p.add(style === 'short' ? 'hairShort' : style === 'long' ? 'hairLong' : style === 'bun' ? 'hairBun' : 'hairTail');
  if (style === 'long' && !hoodUp) p.add('hairLong');
  if (style === 'bun') p.add('hairBun');
  if (style === 'ponytail') p.add('hairTail');
  if (look.skirt) p.add('skirt');
  if (look.apron) p.add('apron');
  switch (outfit) {
    case 'hoodie':
      p.add(hoodUp ? 'hoodUp' : 'hoodDown');
      p.add('pocket');
      p.add('jacket');
      break;
    case 'jacket':
      p.add('jacket');
      p.add('collar');
      break;
    case 'coat':
      p.add('coat');
      p.add('lapels');
      break;
    case 'suit':
      p.add('coat');
      p.add('lapels');
      p.add('tie');
      break;
    case 'uniform':
      p.add('belt');
      p.add('badge');
      p.add('radio');
      p.add('policeCap');
      break;
    case 'swat':
      p.add('helmet');
      p.add('visor');
      p.add('vest');
      p.add('pads');
      p.add('belt');
      break;
    default:
      break;
  }
  const hat = look.hat ?? 'none';
  if (hat !== 'none' && !hoodUp && outfit !== 'swat' && outfit !== 'uniform') p.add(hat);
  if (look.glasses) p.add('glasses');
  if (look.bag && look.bag !== 'none') p.add(look.bag);
  if (look.facialHair && look.facialHair !== 'none') p.add(look.facialHair);
  return p;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((1 << 24) | (c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1)}`;
}

type Limb = { upper: THREE.Group; lower: THREE.Group };

/** What the game needs from a character model (procedural or glTF). Models face +X, origin at the feet. */
/**
 * Arm poses for what's in the hand: aiming a pistol (`onehand`) or a long gun (`twohand`, the left
 * hand on the handguard), carrying them while not aiming (`lowready`: pistol held low and forward;
 * `carry`: long gun across the body at the hip, both hands on it), and melee and throw swings.
 */
export type ArmPose = 'none' | 'onehand' | 'twohand' | 'lowready' | 'carry' | 'melee' | 'throw';

/**
 * Stride cycles per second at a ground speed (m/s): about 1.3 walking, 1.7 jogging and 2.1
 * sprinting (two steps a cycle), a natural cadence for the figure's leg length. Shared with the
 * crowd so everyone walks at the same pace.
 */
export function gaitFrequency(speed: number): number {
  return 0.9 + Math.min(9, Math.max(0, speed)) * 0.17;
}

export interface CharacterModel {
  readonly root: THREE.Object3D;
  update(dt: number, speed: number, grounded: boolean): void;
  sit(): void;
  lieDown(): void;
  standUp(): void;
  /** Puts an object in the right hand (null to empty it). Optional for imported models. */
  hold?(item: THREE.Object3D | null): void;
  /** Arm pose for weapons; `swing` 0..1 drives melee/throw swings. */
  setArms?(pose: ArmPose, swing: number): void;
  /** Swimming: front crawl when moving, treading water when still. Returns how far it leans forward (0..1). */
  swim?(dt: number, speed: number): number;
}

/**
 * Jointed low-poly person with a procedural walk/run cycle. Faces +X so it shares the cars' convention.
 * Origin is at the feet. Every mesh is tagged with `userData.role` (what colours it) and, for the
 * optional pieces, `userData.part`, so a crowd renderer can reuse the geometry with per-person
 * colours and hide the pieces a person isn't wearing.
 */
export class Humanoid implements CharacterModel {
  readonly root = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armL: Limb;
  private readonly armR: Limb;
  private readonly legL: Limb;
  private readonly legR: Limb;
  private phase = 0;
  private blend = 0;
  private arms: ArmPose = 'none';
  private swing = 0;
  private readonly handSocket = new THREE.Group();

  /**
   * `lowDetail`: fewer segments on the round parts (the crowd: people are a few dozen pixels tall,
   * and every part is drawn for every person, twice with shadows). `allParts`: build every optional
   * piece whether the look wears it or not (the crowd's template rig hides them per person).
   */
  constructor(look: HumanoidLook, o: { lowDetail?: boolean; allParts?: boolean } = {}) {
    const lo = !!o.lowDetail;
    const seg = lo ? 8 : 16;
    const wear = partsFor(look);
    const want = (part: BodyPart): boolean => !!o.allParts || wear.has(part);
    const surf: Record<BodyRole, Parameters<typeof withSurface>[1]> = { skin: 'skin', hair: 'hair', top: 'fabric', legs: 'fabric', shoes: 'leather', outer: 'fabric', gear: 'leather', hat: 'fabric', bag: 'fabric', eyes: 'plastic' };
    const rough: Record<BodyRole, number> = { skin: 0.62, hair: 0.9, top: 0.85, legs: 0.85, shoes: 0.55, outer: 0.8, gear: 0.5, hat: 0.85, bag: 0.8, eyes: 0.25 };
    const mats = {} as Record<BodyRole, THREE.MeshStandardMaterial>;
    for (const r of BODY_ROLES) mats[r] = withSurface(new THREE.MeshStandardMaterial({ color: roleColor(look, r), roughness: rough[r], side: r === 'outer' || r === 'hat' ? THREE.DoubleSide : THREE.FrontSide }), surf[r]);
    const mesh = (g: THREE.BufferGeometry, role: BodyRole, part?: BodyPart): THREE.Mesh => {
      const m = new THREE.Mesh(g, mats[role]);
      m.castShadow = true;
      m.userData['role'] = role;
      if (part) m.userData['part'] = part;
      this.meshes.push(m);
      return m;
    };
    /** An optional piece: built when the look wears it (or always, for the template). */
    const piece = (part: BodyPart, parent: THREE.Object3D, g: THREE.BufferGeometry, role: BodyRole): THREE.Mesh | null => {
      if (!want(part)) return null;
      const m = mesh(g, role, part);
      parent.add(m);
      return m;
    };
    const capsule = (r: number, len: number, role: BodyRole): THREE.Mesh => {
      const g = new THREE.CapsuleGeometry(r, len, lo ? 2 : 4, lo ? 6 : 10);
      g.translate(0, -len / 2 - r, 0);
      return mesh(g, role);
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

    this.root.add(this.hips);
    this.hips.position.y = 0.95;
    this.hips.add(this.torso);
    const fem = look.build === 'f';
    const wide = fem ? 0.68 : 0.75;
    const deep = fem ? 0.98 : 1.15;

    // ---- torso: chest, a hint of shoulders, pelvis.
    const chestG = new THREE.CapsuleGeometry(0.19, 0.36, lo ? 2 : 4, lo ? 8 : 12);
    chestG.scale(wide, 1, deep);
    chestG.translate(0, 0.33, 0);
    this.torso.add(mesh(chestG, 'top'));
    for (const sgn of [-1, 1]) {
      const sh = new THREE.SphereGeometry(fem ? 0.07 : 0.085, lo ? 6 : 10, lo ? 4 : 8);
      sh.scale(1, 0.8, 1);
      sh.translate(0, 0.6, sgn * (fem ? 0.2 : 0.235));
      this.torso.add(mesh(sh, 'top'));
    }
    if (fem) {
      const bustG = new THREE.SphereGeometry(0.1, lo ? 6 : 10, lo ? 4 : 8);
      bustG.scale(0.55, 0.62, 1.55);
      bustG.translate(0.085, 0.44, 0);
      this.torso.add(mesh(bustG, 'top'));
    }
    const pelvisG = new THREE.CapsuleGeometry(0.16, 0.08, lo ? 2 : 4, lo ? 6 : 10);
    pelvisG.scale(fem ? 0.9 : 0.8, 1, fem ? 1.28 : 1.1);
    pelvisG.translate(0, 0.02, 0);
    this.torso.add(mesh(pelvisG, 'legs'));
    // A trouser waistband / belt line.
    this.torso.add(mesh(new THREE.CylinderGeometry(0.17 * (fem ? 0.9 : 0.8) * 1.02, 0.17 * (fem ? 0.9 : 0.8) * 1.02, 0.035, seg).scale(1, 1, fem ? 1.28 : 1.1).translate(0, 0.085, 0), 'gear'));
    {
      const skirtG = new THREE.CylinderGeometry(0.19, 0.3, 0.46, lo ? 8 : 14, 1, true);
      skirtG.translate(0, -0.18, 0);
      const sk = piece('skirt', this.torso, skirtG, 'legs');
      if (sk) sk.material = withSurface(new THREE.MeshStandardMaterial({ color: look.legs, roughness: 0.85, side: THREE.DoubleSide }), 'fabric');
    }
    piece('apron', this.torso, box(0.02, 0.62, fem ? 0.3 : 0.34, fem ? 0.135 : 0.15, 0.05, 0).rotateZ(-0.06), 'outer');

    // ---- head: skull, neck, nose, ears, eyes with brows, a mouth.
    this.torso.add(this.head);
    this.head.position.y = 0.72;
    const skullG = new THREE.SphereGeometry(0.115, lo ? 8 : 16, lo ? 6 : 12);
    skullG.scale(1, 1.12, 0.95);
    skullG.translate(0, 0.1, 0);
    const jawG = new THREE.SphereGeometry(0.1, lo ? 8 : 12, lo ? 5 : 8);
    jawG.scale(1, 0.75, 0.9);
    jawG.translate(0.012, 0.04, 0);
    const neckG = new THREE.CylinderGeometry(0.05, 0.06, 0.12, lo ? 5 : 8);
    neckG.translate(0, -0.02, 0);
    const noseG = new THREE.BoxGeometry(0.04, 0.05, 0.03);
    noseG.translate(0.115, 0.09, 0);
    this.head.add(mesh(skullG, 'skin'), mesh(jawG, 'skin'), mesh(neckG, 'skin'), mesh(noseG, 'skin'));
    for (const sgn of [-1, 1]) {
      const ear = new THREE.SphereGeometry(0.022, lo ? 5 : 8, lo ? 4 : 6);
      ear.scale(0.6, 1, 0.5);
      ear.translate(0.0, 0.1, sgn * 0.112);
      this.head.add(mesh(ear, 'skin'));
      const eye = new THREE.SphereGeometry(0.014, lo ? 5 : 8, lo ? 4 : 6);
      eye.scale(0.5, 1, 1);
      eye.translate(0.108, 0.115, sgn * 0.04);
      this.head.add(mesh(eye, 'eyes'));
      this.head.add(mesh(box(0.012, 0.01, 0.045, 0.105, 0.145, sgn * 0.042), 'hair'));
    }
    this.head.add(mesh(box(0.01, 0.008, 0.045, 0.112, 0.045, 0), 'eyes'));
    // Hair styles (one of these shows; a hood or a helmet covers them).
    const hairG = new THREE.SphereGeometry(0.122, lo ? 8 : 16, lo ? 5 : 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hairG.rotateZ(0.25);
    hairG.translate(-0.012, 0.13, 0);
    piece('hairShort', this.head, hairG, 'hair');
    {
      const back = new THREE.CapsuleGeometry(0.105, 0.2, lo ? 2 : 3, lo ? 6 : 10);
      back.scale(0.62, 1, 1.12);
      back.translate(-0.07, -0.02, 0);
      const top = new THREE.SphereGeometry(0.122, lo ? 8 : 16, lo ? 5 : 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
      top.rotateZ(0.25);
      top.translate(-0.012, 0.13, 0);
      piece('hairLong', this.head, mergeGeo([back, top]), 'hair');
    }
    {
      const bun = new THREE.SphereGeometry(0.062, lo ? 6 : 10, lo ? 4 : 8);
      bun.translate(-0.09, 0.2, 0);
      const top = new THREE.SphereGeometry(0.122, lo ? 8 : 16, lo ? 5 : 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
      top.rotateZ(0.25);
      top.translate(-0.012, 0.13, 0);
      piece('hairBun', this.head, mergeGeo([bun, top]), 'hair');
    }
    {
      const tail = new THREE.CapsuleGeometry(0.035, 0.2, lo ? 2 : 3, lo ? 5 : 8);
      tail.rotateZ(-0.35);
      tail.translate(-0.15, 0.04, 0);
      const top = new THREE.SphereGeometry(0.122, lo ? 8 : 16, lo ? 5 : 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
      top.rotateZ(0.25);
      top.translate(-0.012, 0.13, 0);
      piece('hairTail', this.head, mergeGeo([tail, top]), 'hair');
    }
    piece('moustache', this.head, box(0.02, 0.018, 0.075, 0.12, 0.062, 0), 'hair');
    piece('goatee', this.head, mergeGeo([box(0.03, 0.05, 0.05, 0.108, 0.008, 0), box(0.02, 0.018, 0.07, 0.12, 0.062, 0)]), 'hair');
    {
      const b = new THREE.SphereGeometry(0.12, seg, 6, Math.PI / 2, Math.PI, Math.PI * 0.63, Math.PI * 0.32);
      b.scale(1.02, 1.15, 0.98);
      b.translate(0.002, 0.1, 0);
      piece('beard', this.head, b, 'hair');
    }
    piece('glasses', this.head, box(0.018, 0.034, 0.2, 0.117, 0.125, 0), 'gear');

    // ---- limbs.
    const limb = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, l1: number, l2: number, r1: BodyRole, r2: BodyRole, end?: THREE.Mesh): Limb => {
      const upper = new THREE.Group();
      upper.position.set(x, y, z);
      upper.add(capsule(r, l1, r1));
      const lower = new THREE.Group();
      lower.position.y = -l1 - r * 2;
      lower.add(capsule(r * 0.85, l2, r2));
      if (end) {
        end.position.y = -l2 - r * 1.7;
        lower.add(end);
      }
      upper.add(lower);
      parent.add(upper);
      return { upper, lower };
    };
    const hand = (): THREE.Mesh => {
      const g = new THREE.SphereGeometry(0.045, lo ? 5 : 8, lo ? 4 : 6);
      g.scale(0.8, 1.15, 0.9);
      return mesh(g, 'skin');
    };
    const sh = fem ? 0.215 : 0.25;
    const armR = fem ? 0.047 : 0.055;
    this.armL = limb(this.torso, 0, 0.58, -sh, armR, 0.22, 0.2, 'top', 'skin', hand());
    this.armR = limb(this.torso, 0, 0.58, sh, armR, 0.22, 0.2, 'top', 'skin', hand());
    // Sleeves: the lower arm is bare only in a tee; everything else covers it, with a cuff.
    const outfit = look.outfit ?? (look.jacket ? 'jacket' : 'tee');
    const sleeved = outfit !== 'tee';
    for (const arm of [this.armL, this.armR]) {
      const upperM = arm.upper.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
      const lowerM = arm.lower.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
      if (sleeved) {
        if (outfit !== 'uniform') upperM.material = mats.outer;
        const cuffG = new THREE.CapsuleGeometry(armR * 0.9, 0.15, lo ? 2 : 3, lo ? 6 : 10);
        cuffG.translate(0, -0.075 - armR * 0.9, 0);
        const cuff = mesh(cuffG, outfit === 'uniform' ? 'top' : 'outer', outfit === 'uniform' ? undefined : 'jacket');
        if (outfit === 'uniform') cuff.userData['part'] = undefined;
        arm.lower.add(cuff);
        void lowerM;
      }
      if (outfit === 'swat') {
        const glove = new THREE.SphereGeometry(0.05, lo ? 5 : 8, lo ? 4 : 6);
        glove.scale(0.85, 1.15, 0.95);
        glove.translate(0, -0.2 - armR * 1.7, 0);
        piece('vest', arm.lower, glove, 'gear');
      }
    }
    const shoe = (): THREE.Mesh => {
      const g = mergeGeo([box(0.24, 0.07, 0.1, 0.05, 0.01, 0), new THREE.SphereGeometry(0.05, lo ? 6 : 8, lo ? 4 : 6).scale(1.2, 0.75, 1).translate(0.15, 0.0, 0)]);
      const m = mesh(g, 'shoes');
      // A sole under it.
      const sole = mesh(box(0.27, 0.025, 0.11, 0.065, -0.04, 0), 'gear');
      m.add(sole);
      return m;
    };
    const shin: BodyRole = look.skirt ? 'skin' : 'legs';
    const legR = fem ? 0.068 : 0.075;
    this.legL = limb(this.hips, 0, -0.02, -0.1, legR, 0.33, 0.33, 'legs', shin, shoe());
    this.legR = limb(this.hips, 0, -0.02, 0.1, legR, 0.33, 0.33, 'legs', shin, shoe());
    // Knee pads (tactical kit).
    for (const leg of [this.legL, this.legR]) {
      const pad = new THREE.SphereGeometry(legR * 1.15, lo ? 6 : 10, lo ? 4 : 8);
      pad.scale(1, 0.9, 1);
      pad.translate(legR * 0.35, 0.0, 0);
      piece('pads', leg.lower, pad, 'gear');
    }
    this.handSocket.position.set(0, -0.2 - 0.055 * 1.7, 0);
    this.handSocket.rotation.z = -Math.PI / 2;
    this.armR.lower.add(this.handSocket);
    this.handSocket.position.y = -0.2 - armR * 1.7;

    // ---- layers over the top: hoodie, jacket, coat, suit, uniform kit, tactical kit.
    const cw = fem ? 0.138 : 0.152;
    const cd = fem ? 0.192 : 0.222;
    const gap = fem ? 0.9 : 0.7;
    {
      // An open-fronted shell over the chest (the gap faces +X) and a yoke over the shoulders.
      const shell = new THREE.CylinderGeometry(1, 1.04, 0.58, seg, 1, true, Math.PI / 2 + gap / 2, Math.PI * 2 - gap);
      shell.scale(cw, 1, cd);
      shell.translate(0, 0.36, 0);
      const yoke = new THREE.SphereGeometry(1, seg, 4, Math.PI + gap / 2, Math.PI * 2 - gap, 0, Math.PI / 2);
      yoke.scale(cw, 0.09, cd);
      yoke.translate(0, 0.65, 0);
      // Zip edges either side of the gap.
      const zipL = box(0.03, 0.56, 0.012, cw * 0.98 * Math.cos(gap / 2) + 0.01, 0.36, cd * Math.sin(gap / 2) * 0.98);
      const zipR = box(0.03, 0.56, 0.012, cw * 0.98 * Math.cos(gap / 2) + 0.01, 0.36, -cd * Math.sin(gap / 2) * 0.98);
      piece('jacket', this.torso, mergeGeo([shell, yoke, zipL, zipR]), 'outer');
    }
    // A stand-up collar.
    piece('collar', this.torso, new THREE.CylinderGeometry(0.075, 0.085, 0.06, seg, 1, true, Math.PI / 2 + 0.5, Math.PI * 2 - 1).translate(0, 0.71, 0), 'outer');
    // A hoodie's hood: down (a roll round the back of the neck) or up (over the head, open at the face).
    {
      const roll = new THREE.TorusGeometry(0.1, 0.045, lo ? 5 : 8, seg, Math.PI * 1.3);
      roll.rotateX(Math.PI / 2);
      roll.rotateY(Math.PI * 0.85);
      roll.translate(-0.03, 0.69, 0);
      piece('hoodDown', this.torso, roll, 'outer');
      const up = new THREE.SphereGeometry(0.15, seg, lo ? 8 : 12, Math.PI * 0.62, Math.PI * 1.76, 0, Math.PI * 0.78);
      up.scale(1, 1.08, 1);
      up.translate(-0.015, 0.1, 0);
      piece('hoodUp', this.head, up, 'outer');
      // Kangaroo pocket.
      piece('pocket', this.torso, box(0.03, 0.14, cd * 1.3, cw * 1.02, 0.2, 0), 'outer');
    }
    // A long coat: the shell carries on down to the knee, flaring a little, with lapels.
    {
      const shell = new THREE.CylinderGeometry(1, 1.25, 1.0, seg, 1, true, Math.PI / 2 + gap / 2, Math.PI * 2 - gap);
      shell.scale(cw * 1.05, 1, cd * 1.05);
      shell.translate(0, 0.15, 0);
      const yoke = new THREE.SphereGeometry(1, seg, 4, Math.PI + gap / 2, Math.PI * 2 - gap, 0, Math.PI / 2);
      yoke.scale(cw * 1.05, 0.09, cd * 1.05);
      yoke.translate(0, 0.65, 0);
      piece('coat', this.torso, mergeGeo([shell, yoke]), 'outer');
      const lapL = box(0.02, 0.26, 0.07, cw * 0.9, 0.5, 0.06).rotateY(0.5);
      const lapR = box(0.02, 0.26, 0.07, cw * 0.9, 0.5, -0.06).rotateY(-0.5);
      piece('lapels', this.torso, mergeGeo([lapL, lapR]), 'outer');
      piece('tie', this.torso, box(0.012, 0.3, 0.05, cw * 1.03, 0.45, 0), 'gear');
    }
    // Patrol uniform: duty belt with pouches, a badge, a radio on the chest, a peaked cap.
    {
      const belt = new THREE.CylinderGeometry(cw * 1.08, cw * 1.08, 0.05, seg);
      belt.scale(1, 1, cd / cw);
      belt.translate(0, 0.09, 0);
      const pouchL = box(0.06, 0.07, 0.05, cw * 0.8, 0.08, cd * 0.8);
      const pouchR = box(0.06, 0.07, 0.05, cw * 0.8, 0.08, -cd * 0.8);
      const holster = box(0.05, 0.12, 0.04, 0.02, 0.03, cd * 1.05);
      piece('belt', this.torso, mergeGeo([belt, pouchL, pouchR, holster]), 'gear');
      const badge = piece('badge', this.torso, box(0.012, 0.035, 0.03, cw * 1.02, 0.5, -0.07), 'gear');
      if (badge) badge.material = new THREE.MeshStandardMaterial({ color: 0xd8b44a, roughness: 0.35, metalness: 0.9 });
      piece('radio', this.torso, box(0.03, 0.06, 0.035, cw * 1.0, 0.52, 0.09), 'gear');
      const crown = new THREE.CylinderGeometry(0.12, 0.125, 0.07, seg);
      crown.translate(-0.01, 0.21, 0);
      const peak = box(0.11, 0.012, 0.17, 0.15, 0.19, 0);
      piece('policeCap', this.head, mergeGeo([crown, peak]), 'hat');
    }
    // Tactical kit: helmet with a visor, a plate vest with pouches.
    {
      const dome = new THREE.SphereGeometry(0.14, seg, lo ? 6 : 10, 0, Math.PI * 2, 0, Math.PI * 0.58);
      dome.scale(1, 1.05, 1);
      dome.translate(-0.005, 0.1, 0);
      piece('helmet', this.head, dome, 'hat');
      const visor = piece('visor', this.head, box(0.03, 0.06, 0.2, 0.125, 0.125, 0), 'gear');
      if (visor) visor.material = new THREE.MeshStandardMaterial({ color: 0x4a6a8a, roughness: 0.1, metalness: 0.6 });
      const plate = box(cw * 2.1, 0.36, cd * 2.05, 0, 0.4, 0);
      const pouchA = box(0.05, 0.08, 0.06, cw * 1.05, 0.33, 0.06);
      const pouchB = box(0.05, 0.08, 0.06, cw * 1.05, 0.33, -0.06);
      const pouchC = box(0.05, 0.08, 0.06, cw * 1.05, 0.45, 0);
      piece('vest', this.torso, mergeGeo([plate, pouchA, pouchB, pouchC]), 'gear');
    }
    // Headwear.
    {
      const dome = new THREE.SphereGeometry(0.132, seg, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
      dome.scale(1, 0.85, 0.98);
      dome.translate(-0.005, 0.15, 0);
      piece('cap', this.head, mergeGeo([dome, box(0.13, 0.014, 0.19, 0.16, 0.152, 0)]), 'hat');
      const beanie = new THREE.SphereGeometry(0.13, seg, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
      beanie.scale(1, 1.25, 0.98);
      beanie.translate(-0.008, 0.165, 0);
      piece('beanie', this.head, beanie, 'hat');
      piece('fedora', this.head, mergeGeo([new THREE.CylinderGeometry(0.095, 0.112, 0.11, seg).translate(-0.005, 0.27, 0), new THREE.CylinderGeometry(0.2, 0.2, 0.012, seg).translate(-0.005, 0.215, 0)]), 'hat');
    }
    // Bags.
    {
      const pack = box(0.12, 0.3, 0.24, -cw - 0.07, 0.4, 0);
      const strapL = box(0.03, 0.3, 0.03, 0.0, 0.5, cd * 0.7).rotateZ(0.0);
      const strapR = box(0.03, 0.3, 0.03, 0.0, 0.5, -cd * 0.7);
      piece('backpack', this.torso, mergeGeo([pack, strapL, strapR]), 'bag');
      const duffel = new THREE.CapsuleGeometry(0.1, 0.26, lo ? 2 : 4, lo ? 6 : 10);
      duffel.rotateX(Math.PI / 2);
      duffel.translate(-0.08, 0.08, cd + 0.09);
      const strap = box(0.025, 0.55, 0.02, -0.02, 0.4, cd * 0.9).rotateX(-0.45);
      piece('duffel', this.torso, mergeGeo([duffel, strap]), 'bag');
      const caseG = box(0.1, 0.28, 0.36, 0.0, -0.3 - armR * 1.7 - 0.16, 0);
      piece('briefcase', this.armL.lower, caseG, 'bag');
    }
    this.root.scale.setScalar(look.scale);
  }

  /** 0..1 how far to crouch (eased towards it each update). */
  crouch = 0;
  private crouchK = 0;

  /** Advances the gait and poses the rig. speed in m/s; grounded=false gives a mid-air pose. */
  update(dt: number, speed: number, grounded: boolean): void {
    this.crouchK += ((grounded ? this.crouch : 0) - this.crouchK) * Math.min(1, dt * 10);
    const moving = Math.min(1, speed / 1.5);
    this.blend += (moving - this.blend) * Math.min(1, dt * 8);
    const freq = gaitFrequency(speed);
    // Standing still the phase creeps on (breathing, weight shifts, glances).
    this.phase += dt * freq * Math.PI * 2 * (speed > 0.05 ? 1 : 0.12);
    this.pose(this.phase, this.blend, speed, grounded);
    this.applyArms();
  }

  hold(item: THREE.Object3D | null): void {
    this.handSocket.clear();
    if (item) this.handSocket.add(item);
  }

  setArms(pose: ArmPose, swing: number): void {
    this.arms = pose;
    this.swing = swing;
  }

  /**
   * Overrides the arm swing from the gait with a weapon pose. Rotation about Z raises an arm
   * forward. The hand socket turns with the pose so the gun sits in the palm the right way: along
   * the forearm when it's raised to aim, angled forward and down at the low ready, level across
   * the body when carried.
   */
  private applyArms(): void {
    const s = this.swing;
    const sock = this.handSocket;
    sock.rotation.set(0, 0, -Math.PI / 2);
    switch (this.arms) {
      case 'lowready':
        // Pistol held low, elbow soft, muzzle forward and down; the other arm swings as usual.
        this.armR.upper.rotation.set(0.1, 0, 0.35);
        this.armR.lower.rotation.set(0, 0, 0.55);
        sock.rotation.set(0, 0, -0.55);
        break;
      case 'carry':
        // Long gun at the hip pointing ahead: right hand on the grip, left on the handguard.
        this.armR.upper.rotation.set(0.05, 0, 0.25);
        this.armR.lower.rotation.set(0, 0, 1.25);
        sock.rotation.set(0.1, 0, -1.45);
        this.armL.upper.rotation.set(-0.45, 0, 0.55);
        this.armL.lower.rotation.set(0, 0, 1.0);
        break;
      case 'onehand':
        this.armR.upper.rotation.set(0.12, 0, 1.45);
        this.armR.lower.rotation.set(0, 0, 0.1);
        break;
      case 'twohand':
        // Stock in the shoulder: the right hand on the grip under the cheek, the left arm reaching
        // across to the handguard.
        this.armR.upper.rotation.set(0.15, 0, 1.3);
        this.armR.lower.rotation.set(0, 0, 0.35);
        this.armL.upper.rotation.set(-0.62, 0, 1.3);
        this.armL.lower.rotation.set(0, 0, 0.3);
        break;
      case 'melee':
        // Wind up behind the shoulder, then swing through in front.
        this.armR.upper.rotation.set(0.2 + s * 0.6, 0, s < 0.3 ? 2.6 - s * 2 : 2.0 - (s - 0.3) * 2.6);
        this.armR.lower.rotation.set(0, 0, 0.6 * (1 - s));
        break;
      case 'throw':
        this.armR.upper.rotation.set(0.1, 0, s < 0.4 ? 2.4 + s : 2.8 - (s - 0.4) * 3);
        this.armR.lower.rotation.set(0, 0, 0.8 * (1 - s));
        break;
      default:
        break;
    }
  }

  /**
   * Deterministic pose from gait phase and blend (0 = standing, 1 = full stride). Rotation about local Z
   * swings limbs forward/back along +X (the facing direction).
   */
  pose(phase: number, blend: number, speed: number, grounded: boolean): void {
    // Everything the gait below may have moved goes back to neutral first.
    this.hips.position.z = 0;
    this.hips.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    if (!grounded) {
      this.legL.upper.rotation.set(0, 0, 0.6);
      this.legL.lower.rotation.set(0, 0, -1.0);
      this.legR.upper.rotation.set(0, 0, -0.2);
      this.legR.lower.rotation.set(0, 0, -0.4);
      this.armL.upper.rotation.set(-0.4, 0, 0);
      this.armR.upper.rotation.set(0.4, 0, 0);
      this.armL.lower.rotation.set(0, 0, 0.3);
      this.armR.lower.rotation.set(0, 0, 0.3);
      this.hips.position.y = 0.95;
      this.torso.rotation.set(0, 0, 0);
      return;
    }
    const run = Math.min(1, Math.max(0, (speed - 3) / 3));
    // Longer strides at a slower cadence (the feet keep up with the ground).
    const swing = (0.55 + run * 0.45) * blend;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const idle = 1 - blend;
    // Legs: the thigh swings; the knee folds from toe-off through mid-swing (peaking just after
    // the leg starts forward), straightens for the heel strike, and gives a little as it lands.
    const knee = (ph: number): number => -(Math.max(0, Math.cos(ph + Math.PI / 4)) ** 1.5 * (1.0 + run * 0.7) + 0.12 * Math.max(0, Math.sin(ph - Math.PI / 2))) * blend;
    this.legL.upper.rotation.set(0, 0, s * swing);
    this.legR.upper.rotation.set(0, 0, -s * swing);
    this.legL.lower.rotation.set(0, 0, knee(phase));
    this.legR.lower.rotation.set(0, 0, knee(phase + Math.PI));
    // Arms opposite the legs, the elbow bending more as the arm comes forward; a slow sway at rest.
    const sway = 0.035 * idle * Math.sin(phase * 0.5);
    this.armL.upper.rotation.set(-0.08 - 0.02 * idle, 0, -s * swing * 0.9 + sway);
    this.armR.upper.rotation.set(0.08 + 0.02 * idle, 0, s * swing * 0.9 + sway * 0.8);
    this.armL.lower.rotation.set(0, 0, (0.25 + run * 0.9 + 0.35 * Math.max(0, -s)) * blend + 0.12 * idle);
    this.armR.lower.rotation.set(0, 0, (0.25 + run * 0.9 + 0.35 * Math.max(0, s)) * blend + 0.12 * idle);
    // Hips: bob twice a stride, shift over the standing leg, turn with the forward leg; the
    // shoulders counter-turn and the head turns back so the gaze stays steady.
    this.hips.position.y = 0.95 - Math.abs(c) * 0.04 * blend * (1 + run) - 0.008 * idle * (1 + Math.sin(phase));
    this.hips.position.z = -0.022 * blend * (1 - run * 0.5) * c + 0.014 * idle * Math.sin(phase * 0.5);
    this.hips.rotation.set(0.025 * idle * Math.sin(phase * 0.5) - 0.03 * blend * c, 0.1 * blend * s, 0);
    this.torso.rotation.set(0.03 * blend * c, -0.18 * blend * s, -0.12 * run * blend - 0.03 * blend + 0.015 * idle * Math.sin(phase));
    // Standing: looks around now and then (the gait phase creeps on slowly at rest).
    this.head.rotation.set(0, 0.08 * blend * s + 0.25 * idle * Math.sin(phase * 0.23) ** 3, 0.03 * blend * Math.sin(phase * 2 + 0.5) - 0.02 * idle * Math.sin(phase * 0.37));
    const k = this.crouchK;
    if (k > 0.01) {
      // Crouched: knees well bent, hips dropped, body leaning in, short creeping steps; the
      // head comes back up so they keep looking ahead.
      const stp = s * swing * 0.55;
      this.legL.upper.rotation.z = this.legL.upper.rotation.z * (1 - k) + (1.0 + stp) * k;
      this.legR.upper.rotation.z = this.legR.upper.rotation.z * (1 - k) + (1.0 - stp) * k;
      this.legL.lower.rotation.z = this.legL.lower.rotation.z * (1 - k) + (-1.65 + 0.25 * Math.max(0, s) * blend) * k;
      this.legR.lower.rotation.z = this.legR.lower.rotation.z * (1 - k) + (-1.65 + 0.25 * Math.max(0, -s) * blend) * k;
      this.hips.position.y -= 0.3 * k;
      this.torso.rotation.z -= 0.55 * k;
      this.head.rotation.z += 0.42 * k;
      this.armL.lower.rotation.z += 0.4 * k;
      this.armR.lower.rotation.z += 0.4 * k;
    }
  }

  private swimLean = 0;

  /**
   * Swimming. Moving: front crawl, lying forward (tilted about the feet; the caller shifts the
   * figure back so the body sits along the surface), arms windmilling in turn, a flutter kick,
   * head up. Still: upright, treading water, sculling with the hands.
   */
  swim(dt: number, speed: number): number {
    const moving = Math.min(1, speed / 1.2);
    this.swimLean += (moving - this.swimLean) * Math.min(1, dt * 3);
    const L = this.swimLean;
    // A steady crawl: about two-thirds of a stroke a second at full speed (it was three times that).
    this.phase += dt * (0.55 + speed * 0.28) * Math.PI;
    const p = this.phase;
    this.root.rotation.z = -1.3 * L;
    this.blend = 0;
    this.hips.position.set(0, 0.95, 0);
    this.hips.rotation.set(0, 0.12 * L * Math.sin(p), 0);
    this.torso.rotation.set(0.2 * L * Math.sin(p), 0, 0);
    this.head.rotation.set(0, 0, 0.95 * L);
    // Crawl: each arm goes all the way round, half a turn apart; treading: small sculling circles.
    const crawlL = p % (Math.PI * 2);
    const crawlR = (p + Math.PI) % (Math.PI * 2);
    const tread = 0.5 + 0.25 * Math.sin(p * 2);
    this.armL.upper.rotation.set(-0.15 - 0.5 * (1 - L) + 0.4 * (1 - L) * Math.sin(p * 2), 0, L * crawlL + (1 - L) * tread);
    this.armR.upper.rotation.set(0.15 + 0.5 * (1 - L) - 0.4 * (1 - L) * Math.sin(p * 2), 0, L * crawlR + (1 - L) * tread);
    this.armL.lower.rotation.set(0, 0, 0.3 + 0.3 * Math.max(0, Math.sin(crawlL)));
    this.armR.lower.rotation.set(0, 0, 0.3 + 0.3 * Math.max(0, Math.sin(crawlR)));
    // Flutter kick (moving) or slow egg-beater (still).
    const kick = L * 0.3 * Math.sin(p * 3) + (1 - L) * 0.35 * Math.sin(p * 1.5);
    this.legL.upper.rotation.set(0, 0, kick);
    this.legR.upper.rotation.set(0, 0, -kick);
    this.legL.lower.rotation.set(0, 0, -0.25 - (1 - L) * 0.5 * Math.max(0, Math.sin(p * 1.5)));
    this.legR.lower.rotation.set(0, 0, -0.25 - (1 - L) * 0.5 * Math.max(0, -Math.sin(p * 1.5)));
    return L;
  }

  /** Seated driving pose: pelvis on the seat cushion, hands forward on the wheel. */
  sit(): void {
    this.blend = 0;
    this.hips.position.z = 0;
    this.hips.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.root.rotation.z = 0;
    this.legL.upper.rotation.set(0, 0, 1.45);
    this.legR.upper.rotation.set(0, 0, 1.45);
    this.legL.lower.rotation.set(0, 0, -1.35);
    this.legR.lower.rotation.set(0, 0, -1.35);
    this.armL.upper.rotation.set(0, 0, 1.0);
    this.armR.upper.rotation.set(0, 0, 1.0);
    this.armL.lower.rotation.set(0, 0, 0.5);
    this.armR.lower.rotation.set(0, 0, 0.5);
    this.hips.position.y = 0.08;
    this.torso.rotation.set(0, 0, 0.1);
  }

  /** Flat on the ground (dead or knocked down). */
  lieDown(): void {
    this.root.rotation.z = Math.PI / 2;
  }

  standUp(): void {
    this.root.rotation.z = 0;
  }
}

/** Merges non-indexed copies of a few geometries into one (same vertex layout). */
function mergeGeo(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g0 of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
    const u = g.getAttribute('uv');
    if (u) uv.push(...(u.array as Float32Array));
    else for (let i = 0; i < g.getAttribute('position').count; i++) uv.push(0, 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
