import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { withSurface } from '../render/Surfaces';

/**
 * The environment as a weapon (logic engine-free and tested at the bottom; meshes here):
 *
 *  - **Fuel drums** (red, hazard-striped) stand in alleys, on the docks, on gang corners and in the
 *    hideout. Shoot one (or set it alight) and it blows: everyone near is thrown, cars burn, and
 *    the drum next to it goes too.
 *  - **Transformer boxes** on the pavement. Shoot one and it arcs: a shock that drops everyone
 *    close by (twice as far on wet ground, in the rain). It recharges after a while.
 *
 * Both work on gang members, police, passers-by, wild Streetmon and you.
 */

export const HAZARD = {
  drum: { hp: 40, radius: 6.5, damage: 120, chain: 4.5 },
  transformer: { hp: 60, radius: 4, wetRadius: 8, damage: 45, stun: 4, recharge: 40 },
} as const;

export type HazardKind = 'drum' | 'transformer';

export interface HazardSpot {
  kind: HazardKind;
  x: number;
  y: number;
  z: number;
}

interface Hazard extends HazardSpot {
  hp: number;
  /** Drums: gone. Transformers: recharging until this time. */
  spent: boolean;
  until: number;
  mesh: THREE.Object3D;
  handle: number;
}

/** Shock radius for a transformer (water carries it). */
export function shockRadius(wet: number): number {
  return HAZARD.transformer.radius + (HAZARD.transformer.wetRadius - HAZARD.transformer.radius) * Math.max(0, Math.min(1, wet));
}

/** Damage at a distance from a blast centre (full at the centre, none at the edge). */
export function blastFalloff(d: number, radius: number, damage: number): number {
  return d >= radius ? 0 : damage * (1 - d / radius) ** 1.2;
}

/** Which drums a blast sets off in turn (indices), nearest first. */
export function chainFrom(spots: ReadonlyArray<{ x: number; z: number; spent?: boolean }>, x: number, z: number, reach: number): number[] {
  return spots
    .map((s, i) => ({ i, d: Math.hypot(s.x - x, s.z - z), s }))
    .filter((o) => !o.s.spent && o.d > 0.01 && o.d < reach)
    .sort((a, b) => a.d - b.d)
    .map((o) => o.i);
}

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

export interface HazardDeps {
  scene: THREE.Scene;
  world: RAPIER.World;
  /** A drum went up (the game handles damage to everyone, cars, effects, noise). */
  blast(x: number, y: number, z: number, radius: number, damage: number): void;
  /** A transformer arced. */
  shock(x: number, y: number, z: number, radius: number, damage: number, stun: number): void;
  wet(): number;
  time(): number;
}

export class EnvHazards {
  private readonly list: Hazard[] = [];
  private readonly byHandle = new Map<number, Hazard>();
  private readonly drumM = withSurface(new THREE.MeshStandardMaterial({ color: 0xb3181f, roughness: 0.5, metalness: 0.5 }), 'paintedMetal');
  private readonly stripeM = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6 });
  private readonly boxM = withSurface(new THREE.MeshStandardMaterial({ color: 0x3f5a46, roughness: 0.6, metalness: 0.4 }), 'paintedMetal');
  private readonly sparkM = new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

  constructor(private readonly d: HazardDeps) {}

  add(spots: readonly HazardSpot[], parent: THREE.Object3D = this.d.scene): void {
    for (const s of spots) {
      const g = new THREE.Group();
      g.position.set(s.x, s.y, s.z);
      let coll: RAPIER.ColliderDesc;
      if (s.kind === 'drum') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.92, 14), this.drumM);
        body.position.y = 0.46;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.14, 14, 1, true), this.stripeM);
        band.position.y = 0.6;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), this.stripeM);
        cap.position.set(0.15, 0.94, 0);
        g.add(body, band, cap);
        coll = RAPIER.ColliderDesc.cylinder(0.46, 0.33).setTranslation(s.x, s.y + 0.46, s.z);
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.3, 0.6), this.boxM);
        body.position.y = 0.65;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.35), new THREE.MeshBasicMaterial({ map: dangerSign(), transparent: true }));
        sign.position.set(0, 0.85, 0.31);
        const arc = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), this.sparkM.clone());
        arc.position.y = 1.0;
        arc.name = 'arc';
        g.add(body, sign, arc);
        coll = RAPIER.ColliderDesc.cuboid(0.5, 0.65, 0.3).setTranslation(s.x, s.y + 0.65, s.z);
      }
      for (const c of g.children) c.castShadow = true;
      parent.add(g);
      const collider = this.d.world.createCollider(coll.setCollisionGroups(WORLD_GROUPS));
      const h: Hazard = { ...s, hp: s.kind === 'drum' ? HAZARD.drum.hp : HAZARD.transformer.hp, spent: false, until: 0, mesh: g, handle: collider.handle };
      this.list.push(h);
      this.byHandle.set(collider.handle, h);
    }
  }

  /** A bullet hit a collider: true if it was one of ours (and it took the damage). */
  bullet(handle: number, damage: number): boolean {
    const h = this.byHandle.get(handle);
    if (!h) return false;
    if (h.spent) return true;
    h.hp -= damage;
    if (h.hp <= 0) this.trigger(h);
    return true;
  }

  /** Fire or a blast nearby sets drums off. */
  heat(x: number, z: number, r: number): void {
    for (const i of chainFrom(this.list.filter((h) => h.kind === 'drum'), x, z, r)) {
      const h = this.list.filter((q) => q.kind === 'drum')[i];
      if (h && !h.spent) window.setTimeout(() => this.trigger(h), 120 + Math.random() * 250);
    }
  }

  private trigger(h: Hazard): void {
    if (h.spent) return;
    if (h.kind === 'drum') {
      h.spent = true;
      h.mesh.visible = false;
      this.d.blast(h.x, h.y + 0.5, h.z, HAZARD.drum.radius, HAZARD.drum.damage);
      this.heat(h.x, h.z, HAZARD.drum.chain);
    } else {
      h.spent = true;
      h.until = this.d.time() + HAZARD.transformer.recharge;
      const arc = h.mesh.getObjectByName('arc') as THREE.Mesh | undefined;
      if (arc) (arc.material as THREE.MeshBasicMaterial).opacity = 0.9;
      this.d.shock(h.x, h.y + 0.5, h.z, shockRadius(this.d.wet()), HAZARD.transformer.damage, HAZARD.transformer.stun);
    }
  }

  update(dt: number): void {
    const t = this.d.time();
    for (const h of this.list) {
      if (h.kind !== 'transformer') continue;
      const arc = h.mesh.getObjectByName('arc') as THREE.Mesh | undefined;
      const m = arc?.material as THREE.MeshBasicMaterial | undefined;
      if (m && m.opacity > 0) m.opacity = Math.max(0, m.opacity - dt * 1.5);
      if (h.spent && t >= h.until) {
        h.spent = false;
        h.hp = HAZARD.transformer.hp;
      }
      // A recharged box hums: a faint flicker now and then.
      if (!h.spent && m && Math.random() < dt * 0.3) m.opacity = 0.25;
    }
  }
}

let signTex: THREE.CanvasTexture | null = null;
function dangerSign(): THREE.CanvasTexture {
  if (signTex) return signTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 56;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.moveTo(32, 2);
  g.lineTo(62, 54);
  g.lineTo(2, 54);
  g.closePath();
  g.fill();
  g.strokeStyle = '#111';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#111';
  g.beginPath();
  g.moveTo(36, 14);
  g.lineTo(24, 34);
  g.lineTo(32, 34);
  g.lineTo(26, 48);
  g.lineTo(40, 28);
  g.lineTo(32, 28);
  g.closePath();
  g.fill();
  signTex = new THREE.CanvasTexture(c);
  signTex.colorSpace = THREE.SRGBColorSpace;
  return signTex;
}
