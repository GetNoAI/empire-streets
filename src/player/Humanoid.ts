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
  /** Player-only extras (the wardrobe): headwear and its colour, shades, an open jacket, facial hair. */
  hat?: 'none' | 'cap' | 'beanie' | 'fedora';
  hatColor?: string;
  glasses?: boolean;
  jacket?: string;
  facialHair?: 'none' | 'moustache' | 'goatee' | 'beard';
}

export type BodyRole = 'skin' | 'hair' | 'top' | 'legs' | 'shoes';

type Limb = { upper: THREE.Group; lower: THREE.Group };

/** What the game needs from a character model (procedural or glTF). Models face +X, origin at the feet. */
export type ArmPose = 'none' | 'onehand' | 'twohand' | 'melee' | 'throw';

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
}

/**
 * Jointed low-poly person with a procedural walk/run cycle. Faces +X so it shares the cars' convention.
 * Origin is at the feet. Every mesh is tagged with `userData.role` so a crowd renderer can reuse the
 * geometry with per-person colours.
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
   * and every part is drawn for every person, twice with shadows).
   */
  constructor(look: HumanoidLook, o: { lowDetail?: boolean } = {}) {
    const lo = !!o.lowDetail;
    const mats: Record<BodyRole, THREE.MeshStandardMaterial> = {
      skin: withSurface(new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.6 }), 'skin'),
      top: withSurface(new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.8 }), 'fabric'),
      legs: withSurface(new THREE.MeshStandardMaterial({ color: look.legs, roughness: 0.8 }), 'fabric'),
      shoes: withSurface(new THREE.MeshStandardMaterial({ color: look.shoes, roughness: 0.5 }), 'leather'),
      hair: withSurface(new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.9 }), 'hair'),
    };
    const mesh = (g: THREE.BufferGeometry, role: BodyRole): THREE.Mesh => {
      const m = new THREE.Mesh(g, mats[role]);
      m.castShadow = true;
      m.userData['role'] = role;
      this.meshes.push(m);
      return m;
    };
    const capsule = (r: number, len: number, role: BodyRole): THREE.Mesh => {
      const g = new THREE.CapsuleGeometry(r, len, lo ? 2 : 4, lo ? 6 : 10);
      g.translate(0, -len / 2 - r, 0);
      return mesh(g, role);
    };

    this.root.add(this.hips);
    this.hips.position.y = 0.95;
    this.hips.add(this.torso);
    const fem = look.build === 'f';
    const style = look.hairStyle ?? (fem ? 'long' : 'short');

    const chestG = new THREE.CapsuleGeometry(0.19, 0.36, lo ? 2 : 4, lo ? 8 : 12);
    // Feminine: narrower across the shoulders and in at the waist.
    chestG.scale(fem ? 0.68 : 0.75, 1, fem ? 0.98 : 1.15);
    chestG.translate(0, 0.33, 0);
    this.torso.add(mesh(chestG, 'top'));
    if (fem) {
      // A modest bust, part of the top.
      const bustG = new THREE.SphereGeometry(0.1, lo ? 6 : 10, lo ? 4 : 8);
      bustG.scale(0.55, 0.62, 1.55);
      bustG.translate(0.085, 0.44, 0);
      this.torso.add(mesh(bustG, 'top'));
    }
    const pelvisG = new THREE.CapsuleGeometry(0.16, 0.08, lo ? 2 : 4, lo ? 6 : 10);
    // Fuller hips.
    pelvisG.scale(fem ? 0.9 : 0.8, 1, fem ? 1.28 : 1.1);
    pelvisG.translate(0, 0.02, 0);
    this.torso.add(mesh(pelvisG, 'legs'));
    if (look.skirt) {
      // Flared from the waist to just above the knee; it rides with the hips, the legs swing under it.
      const skirtG = new THREE.CylinderGeometry(0.19, 0.3, 0.46, lo ? 8 : 14, 1, true);
      skirtG.translate(0, -0.18, 0);
      const sk = mesh(skirtG, 'legs');
      (sk.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      this.torso.add(sk);
    }
    if (look.apron) {
      const apronMat = withSurface(new THREE.MeshStandardMaterial({ color: look.apron, roughness: 0.85 }), 'fabric');
      const ap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.62, fem ? 0.3 : 0.34), apronMat);
      ap.position.set(fem ? 0.135 : 0.15, 0.05, 0);
      ap.rotation.z = -0.06;
      ap.castShadow = true;
      this.torso.add(ap);
    }

    this.torso.add(this.head);
    this.head.position.y = 0.72;
    const skullG = new THREE.SphereGeometry(0.115, lo ? 8 : 16, lo ? 6 : 12);
    skullG.scale(1, 1.12, 0.95);
    skullG.translate(0, 0.1, 0);
    const hairG = new THREE.SphereGeometry(0.122, lo ? 8 : 16, lo ? 5 : 12, 0, Math.PI * 2, 0, Math.PI * (style === 'short' || style === 'bald' ? 0.55 : 0.62));
    hairG.rotateZ(0.25);
    hairG.translate(-0.012, 0.13, 0);
    const hairParts: THREE.BufferGeometry[] = [];
    if (style === 'long') {
      // Down the back to the shoulder blades, and framing the face.
      const back = new THREE.CapsuleGeometry(0.105, 0.2, lo ? 2 : 3, lo ? 6 : 10);
      back.scale(0.62, 1, 1.12);
      back.translate(-0.07, -0.02, 0);
      hairParts.push(back);
    } else if (style === 'bun') {
      const bun = new THREE.SphereGeometry(0.062, lo ? 6 : 10, lo ? 4 : 8);
      bun.translate(-0.09, 0.2, 0);
      hairParts.push(bun);
    } else if (style === 'ponytail') {
      const tail = new THREE.CapsuleGeometry(0.035, 0.2, lo ? 2 : 3, lo ? 5 : 8);
      tail.rotateZ(-0.35);
      tail.translate(-0.15, 0.04, 0);
      hairParts.push(tail);
    }
    const neckG = new THREE.CylinderGeometry(0.05, 0.06, 0.12, lo ? 5 : 8);
    neckG.translate(0, -0.02, 0);
    const noseG = new THREE.BoxGeometry(0.04, 0.05, 0.03);
    noseG.translate(0.115, 0.09, 0);
    this.head.add(mesh(skullG, 'skin'), mesh(neckG, 'skin'), mesh(noseG, 'skin'));
    if (style !== 'bald') this.head.add(mesh(hairG, 'hair'));
    for (const hp of hairParts) this.head.add(mesh(hp, 'hair'));

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
    const hand = (): THREE.Mesh => mesh(new THREE.SphereGeometry(0.045, lo ? 5 : 8, lo ? 4 : 6), 'skin');
    const sh = fem ? 0.215 : 0.25;
    const armR = fem ? 0.047 : 0.055;
    this.armL = limb(this.torso, 0, 0.58, -sh, armR, 0.22, 0.2, 'top', 'skin', hand());
    this.armR = limb(this.torso, 0, 0.58, sh, armR, 0.22, 0.2, 'top', 'skin', hand());
    const shoe = (): THREE.Mesh => {
      const g = new THREE.BoxGeometry(0.26, 0.09, 0.11);
      g.translate(0.06, 0, 0);
      return mesh(g, 'shoes');
    };
    // With a skirt the shins are bare.
    const shin: BodyRole = look.skirt ? 'skin' : 'legs';
    const legR = fem ? 0.068 : 0.075;
    this.legL = limb(this.hips, 0, -0.02, -0.1, legR, 0.33, 0.33, 'legs', shin, shoe());
    this.legR = limb(this.hips, 0, -0.02, 0.1, legR, 0.33, 0.33, 'legs', shin, shoe());
    // Grip point at the right hand; held items point along the forearm's "down" (-Y), rotated to face +X.
    this.handSocket.position.set(0, -0.2 - 0.055 * 1.7, 0);
    this.handSocket.rotation.z = -Math.PI / 2;
    this.armR.lower.add(this.handSocket);
    this.handSocket.position.y = -0.2 - armR * 1.7;
    this.addExtras(look, fem, lo);
    this.root.scale.setScalar(look.scale);
  }

  /**
   * The wardrobe's extras. They have their own materials and aren't in `meshes` (the crowd renderer
   * copies only the role-tagged body), so only the player ever has them.
   */
  private addExtras(look: HumanoidLook, fem: boolean, lo: boolean): void {
    const seg = lo ? 8 : 16;
    const part = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D): THREE.Mesh => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = true;
      parent.add(x);
      return x;
    };
    if (look.jacket) {
      const jm = withSurface(new THREE.MeshStandardMaterial({ color: look.jacket, roughness: 0.7, side: THREE.DoubleSide }), 'fabric');
      // An open-fronted shell over the chest (the gap faces +X, the front), and the upper sleeves.
      const gap = fem ? 0.9 : 0.7;
      const shell = new THREE.CylinderGeometry(1, 1.04, 0.58, seg, 1, true, Math.PI / 2 + gap / 2, Math.PI * 2 - gap);
      shell.scale(fem ? 0.138 : 0.152, 1, fem ? 0.192 : 0.222);
      shell.translate(0, 0.36, 0);
      part(shell, jm, this.torso);
      // (Sphere phi: +X is at phi = PI.)
      const yoke = new THREE.SphereGeometry(1, seg, 4, Math.PI + gap / 2, Math.PI * 2 - gap, 0, Math.PI / 2);
      yoke.scale(fem ? 0.138 : 0.152, 0.09, fem ? 0.192 : 0.222);
      yoke.translate(0, 0.65, 0);
      part(yoke, jm, this.torso);
      for (const arm of [this.armL, this.armR]) {
        const sleeve = arm.upper.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
        if (sleeve) sleeve.material = jm;
      }
    }
    const darkHair = withSurface(new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.95 }), 'hair');
    switch (look.facialHair) {
      case 'moustache':
        part(new THREE.BoxGeometry(0.02, 0.018, 0.075).translate(0.12, 0.062, 0), darkHair, this.head);
        break;
      case 'goatee':
        part(new THREE.BoxGeometry(0.03, 0.05, 0.05).translate(0.108, 0.008, 0), darkHair, this.head);
        part(new THREE.BoxGeometry(0.02, 0.018, 0.07).translate(0.12, 0.062, 0), darkHair, this.head);
        break;
      case 'beard': {
        const b = new THREE.SphereGeometry(0.12, seg, 6, Math.PI / 2, Math.PI, Math.PI * 0.63, Math.PI * 0.32);
        b.scale(1.02, 1.15, 0.98);
        b.translate(0.002, 0.1, 0);
        part(b, darkHair, this.head);
        break;
      }
      default:
        break;
    }
    if (look.glasses) {
      const gm = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.15, metalness: 0.6 });
      part(new THREE.BoxGeometry(0.018, 0.034, 0.2).translate(0.117, 0.125, 0), gm, this.head);
    }
    const hat = look.hat ?? 'none';
    if (hat !== 'none') {
      const hm = withSurface(new THREE.MeshStandardMaterial({ color: look.hatColor ?? '#1c1c22', roughness: 0.8 }), 'fabric');
      if (hat === 'cap') {
        const dome = new THREE.SphereGeometry(0.132, seg, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
        dome.scale(1, 0.85, 0.98);
        dome.translate(-0.005, 0.15, 0);
        part(dome, hm, this.head);
        part(new THREE.BoxGeometry(0.13, 0.014, 0.19).translate(0.16, 0.152, 0), hm, this.head);
      } else if (hat === 'beanie') {
        const dome = new THREE.SphereGeometry(0.13, seg, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
        dome.scale(1, 1.25, 0.98);
        dome.translate(-0.008, 0.165, 0);
        part(dome, hm, this.head);
      } else {
        part(new THREE.CylinderGeometry(0.095, 0.112, 0.11, seg).translate(-0.005, 0.27, 0), hm, this.head);
        part(new THREE.CylinderGeometry(0.2, 0.2, 0.012, seg).translate(-0.005, 0.215, 0), hm, this.head);
      }
    }
  }

  /** Advances the gait and poses the rig. speed in m/s; grounded=false gives a mid-air pose. */
  update(dt: number, speed: number, grounded: boolean): void {
    const moving = Math.min(1, speed / 1.5);
    this.blend += (moving - this.blend) * Math.min(1, dt * 8);
    const freq = 1.6 + speed * 0.55;
    if (speed > 0.05) this.phase += dt * freq * Math.PI * 2;
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

  /** Overrides the arm swing from the gait with a weapon pose. Rotation about Z raises an arm forward. */
  private applyArms(): void {
    const s = this.swing;
    switch (this.arms) {
      case 'onehand':
        this.armR.upper.rotation.set(0.12, 0, 1.45);
        this.armR.lower.rotation.set(0, 0, 0.1);
        break;
      case 'twohand':
        this.armR.upper.rotation.set(0.15, 0, 1.35);
        this.armR.lower.rotation.set(0, 0, 0.25);
        this.armL.upper.rotation.set(-0.55, 0, 1.25);
        this.armL.lower.rotation.set(0, 0, 0.55);
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
    const swing = (0.5 + run * 0.35) * blend;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    this.legL.upper.rotation.set(0, 0, s * swing);
    this.legR.upper.rotation.set(0, 0, -s * swing);
    this.legL.lower.rotation.set(0, 0, -Math.max(0, -c) * (0.9 + run * 0.6) * blend);
    this.legR.lower.rotation.set(0, 0, -Math.max(0, c) * (0.9 + run * 0.6) * blend);
    this.armL.upper.rotation.set(-0.08, 0, -s * swing * 0.9);
    this.armR.upper.rotation.set(0.08, 0, s * swing * 0.9);
    this.armL.lower.rotation.set(0, 0, (0.25 + run * 0.9) * blend);
    this.armR.lower.rotation.set(0, 0, (0.25 + run * 0.9) * blend);
    this.hips.position.y = 0.95 - Math.abs(c) * 0.04 * blend * (1 + run);
    this.torso.rotation.set(0, 0, -0.12 * run * blend);
  }

  /** Seated driving pose: pelvis on the seat cushion, hands forward on the wheel. */
  sit(): void {
    this.blend = 0;
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
