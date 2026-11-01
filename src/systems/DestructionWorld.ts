import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { audio } from '../audio/Audio';
import { GROUP, groups } from '../config';
import destructiblesConfig from '../config/destructibles.json';
import type { Decals } from '../fx/Decals';
import type { Effects } from '../fx/Effects';
import { withSurface } from '../render/Surfaces';
import type { Car } from '../vehicles/Car';
import type { StaticProp } from '../world/CityBuilder';
import type { CityLayout } from '../world/CityLayout';
import { planStreetProps, type SmallPropKind } from '../world/StreetProps';
import { DestructionManager, type DestructibleConfig, type Prop } from './destruction.js';

/**
 * Destructible street props in the world (rules in destruction.js).
 *
 * Takes over the city's lamps, hydrants and trees (CityBuilder hands them over with their instance
 * slots and colliders) and adds trash cans, newspaper boxes, benches and mailboxes along the
 * sidewalks. When one breaks, its instances are hidden, its collider is switched off and a few
 * debris pieces take its place with a physics push: lamp posts topple, hydrants pop their tops and
 * gush water, trees fall, cans spill litter, boxes burst into paper. Debris collides with the
 * ground, buildings and cars (not you, so you don't trip on it), settles, then shrinks away; there's
 * a hard cap on pieces. Repairs (destruction.js) bring props back out of sight.
 *
 * Fast cars snap props off before they reach them (checked each physics step), losing a little
 * speed, so a breakaway lamp post doesn't stop a car dead.
 */

const CURB = 0.15;
export const DESTRUCTIBLES = destructiblesConfig as unknown as DestructibleConfig;
const DEBRIS_GROUPS = groups(GROUP.PED, GROUP.WORLD | GROUP.CAR | GROUP.PED);
const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

export interface DestructionDeps {
  scene: THREE.Scene;
  world: RAPIER.World;
  effects: Effects;
  decals: Decals;
  layout: CityLayout;
  cityProps: StaticProp[];
  /** Entrances (doors, ladders, manholes, the Chop Shop lift): benches and bins stay off them. */
  keepClear?: Array<{ x: number; z: number; r: number }>;
  /** Is a point on screen (repairs wait until it isn't)? */
  inView(x: number, y: number, z: number): boolean;
  listener(): THREE.Vector3;
}

interface Entry {
  parts: Array<{ mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 }>;
  collider: RAPIER.Collider;
}

interface Debris {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  age: number;
  life: number;
  scale: number;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const IDENTITY = new THREE.Matrix4();

export class DestructionWorld {
  readonly manager: DestructionManager;
  /** Collider streaming (Game): broken props are held off through it, so streaming can't turn them back on. */
  colliderControl: { hold(c: RAPIER.Collider): void; release(c: RAPIER.Collider): void } | null = null;
  private readonly entries: Entry[] = [];
  private readonly byCollider = new Map<number, number>();
  private readonly debris: Debris[] = [];
  private readonly geysers: Array<{ x: number; z: number; t: number; sound: number }> = [];
  private readonly group = new THREE.Group();
  private readonly mats: Record<string, THREE.Material> = {};
  private readonly geos: Record<string, THREE.BufferGeometry> = {};
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();

  constructor(private readonly d: DestructionDeps) {
    this.group.name = 'street-props';
    d.scene.add(this.group);
    // Entrances count as occupied: a ring of points round each (the planner keeps 2.2 m from points).
    const ring = (d.keepClear ?? []).flatMap((k) => [{ x: k.x, z: k.z }, ...[0, 1, 2, 3, 4, 5].map((i) => ({ x: k.x + Math.cos((i * Math.PI) / 3) * k.r * 0.7, z: k.z + Math.sin((i * Math.PI) / 3) * k.r * 0.7 }))]);
    const small = planStreetProps(d.layout, [...d.cityProps.map((p) => ({ x: p.x, z: p.z })), ...ring]);
    const smallBuilt = this.buildSmall(small);
    const all: Array<{ kind: string; x: number; z: number; rot: number; s: number; entry: Entry }> = [];
    for (const p of d.cityProps) {
      const parts = p.parts.map((pt) => {
        const matrix = new THREE.Matrix4();
        pt.mesh.getMatrixAt(pt.index, matrix);
        return { mesh: pt.mesh, index: pt.index, matrix };
      });
      all.push({ kind: p.kind, x: p.x, z: p.z, rot: p.rot, s: p.s, entry: { parts, collider: p.collider } });
    }
    all.push(...smallBuilt);
    this.manager = new DestructionManager({ config: DESTRUCTIBLES, props: all.map((a) => ({ kind: a.kind, x: a.x, z: a.z, rot: a.rot, s: a.s })) });
    for (const a of all) {
      this.byCollider.set(a.entry.collider.handle, this.entries.length);
      this.entries.push(a.entry);
    }
    this.manager.on('break', (e) => this.onBreak(e.prop, e.dirX, e.dirZ, e.speed));
    this.manager.on('repair', (e) => this.onRepair(e.prop));
  }

  // ------------------------------------------------------------------ building the small props

  private mat(key: string, make: () => THREE.Material): THREE.Material {
    return (this.mats[key] ??= make());
  }

  private geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    return (this.geos[key] ??= make());
  }

  private smallGeo(kind: SmallPropKind): THREE.BufferGeometry[] {
    switch (kind) {
      case 'trashCan':
        return [
          this.geo('can', () => new THREE.CylinderGeometry(0.27, 0.24, 0.9, 12).translate(0, 0.45, 0)),
          this.geo('canLid', () => new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12).translate(0, 0.93, 0)),
        ];
      case 'newsBox':
        return [
          this.geo('news', () =>
            mergeGeometries([new THREE.BoxGeometry(0.5, 0.75, 0.42).translate(0, 0.62, 0).toNonIndexed(), new THREE.BoxGeometry(0.06, 0.3, 0.06).translate(-0.18, 0.15, 0).toNonIndexed(), new THREE.BoxGeometry(0.06, 0.3, 0.06).translate(0.18, 0.15, 0).toNonIndexed()], false)!,
          ),
          this.geo('newsWin', () => new THREE.PlaneGeometry(0.36, 0.26).translate(0, 0.78, 0.215)),
        ];
      case 'bench':
        return [
          this.geo('benchWood', () =>
            mergeGeometries([new THREE.BoxGeometry(1.6, 0.06, 0.42).translate(0, 0.46, 0).toNonIndexed(), new THREE.BoxGeometry(1.6, 0.34, 0.05).translate(0, 0.72, -0.2).rotateX(0).toNonIndexed()], false)!,
          ),
          this.geo('benchIron', () =>
            mergeGeometries(
              [-0.68, 0.68].flatMap((x) => [new THREE.BoxGeometry(0.06, 0.46, 0.4).translate(x, 0.23, 0).toNonIndexed(), new THREE.BoxGeometry(0.05, 0.4, 0.05).translate(x, 0.68, -0.2).toNonIndexed()]),
              false,
            )!,
          ),
        ];
      case 'mailbox':
        return [
          this.geo('mail', () =>
            mergeGeometries(
              [
                new THREE.BoxGeometry(0.48, 0.62, 0.42).translate(0, 0.72, 0).toNonIndexed(),
                new THREE.CylinderGeometry(0.24, 0.24, 0.42, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.03, 0).toNonIndexed(),
                ...[-0.18, 0.18].map((x) => new THREE.BoxGeometry(0.06, 0.42, 0.06).translate(x, 0.21, 0).toNonIndexed()),
              ],
              false,
            )!,
          ),
          this.geo('mailSlot', () => new THREE.BoxGeometry(0.3, 0.04, 0.02).translate(0, 0.92, 0.215)),
        ];
    }
  }

  private smallMats(kind: SmallPropKind): THREE.Material[] {
    switch (kind) {
      case 'trashCan':
        return [this.mat('canGreen', () => withSurface(new THREE.MeshStandardMaterial({ color: 0x2f4a36, roughness: 0.6, metalness: 0.5 }), 'paintedMetal')), this.mat('canLid', () => withSurface(new THREE.MeshStandardMaterial({ color: 0x24362a, roughness: 0.6, metalness: 0.5 }), 'paintedMetal'))];
      case 'newsBox':
        return [this.mat('newsBody', () => withSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), 'plastic')), this.mat('newsWin', () => new THREE.MeshStandardMaterial({ color: 0xd8e2e8, roughness: 0.15, metalness: 0.1 }))];
      case 'bench':
        return [this.mat('benchWood', () => withSurface(new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.85 }), 'wood')), this.mat('benchIron', () => withSurface(new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.6 }), 'paintedMetal'))];
      case 'mailbox':
        return [this.mat('mailBlue', () => withSurface(new THREE.MeshStandardMaterial({ color: 0x1f4fa8, roughness: 0.55, metalness: 0.3 }), 'paintedMetal')), this.mat('mailSlot', () => new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.4 }))];
    }
  }

  private buildSmall(list: ReturnType<typeof planStreetProps>): Array<{ kind: string; x: number; z: number; rot: number; s: number; entry: Entry }> {
    const out: Array<{ kind: string; x: number; z: number; rot: number; s: number; entry: Entry }> = [];
    const byKind = new Map<SmallPropKind, typeof list>();
    for (const p of list) {
      const l = byKind.get(p.kind);
      if (l) l.push(p);
      else byKind.set(p.kind, [p]);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const newsColors = [0xc8262e, 0x1f6fd0, 0xf2c230, 0x2e9c4a, 0xe8e8e8].map((c) => new THREE.Color(c));
    for (const [kind, items] of byKind) {
      const geos = this.smallGeo(kind);
      const mats = this.smallMats(kind);
      const meshes = geos.map((g, i) => {
        const mesh = new THREE.InstancedMesh(g, mats[i], items.length);
        mesh.castShadow = i === 0;
        mesh.receiveShadow = true;
        mesh.name = `prop-${kind}-${i}`;
        return mesh;
      });
      items.forEach((it, idx) => {
        q.setFromAxisAngle(up, it.rot);
        m.compose(new THREE.Vector3(it.x, CURB, it.z), q, one);
        for (const mesh of meshes) mesh.setMatrixAt(idx, m);
        if (kind === 'newsBox') meshes[0].setColorAt(idx, newsColors[idx % newsColors.length]);
        const def = DESTRUCTIBLES.kinds[kind];
        const desc =
          kind === 'bench'
            ? RAPIER.ColliderDesc.cuboid(0.8, 0.45, 0.22).setRotation(q).setTranslation(it.x, CURB + 0.45, it.z)
            : RAPIER.ColliderDesc.cylinder(0.5, def.radius * 0.85).setTranslation(it.x, CURB + 0.5, it.z);
        const collider = this.d.world.createCollider(desc.setCollisionGroups(WORLD_GROUPS));
        out.push({ kind, x: it.x, z: it.z, rot: it.rot, s: 1, entry: { parts: meshes.map((mesh) => ({ mesh, index: idx, matrix: m.clone() })), collider } });
      });
      for (const mesh of meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.group.add(mesh);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ queries

  /** An intact prop in the way within `r` of (x, z) (battles, standing room). */
  blocksAt(x: number, z: number, r: number): boolean {
    return this.manager.blocksAt(x, z, r);
  }

  /** The prop a collider belongs to (a bullet hit), if any. */
  propOf(handle: number): Prop | null {
    const i = this.byCollider.get(handle);
    return i === undefined ? null : this.manager.props[i];
  }

  // ------------------------------------------------------------------ damage in

  /** Before each physics step: fast cars snap off what's in front of them. */
  sweepCars(cars: Car[], h: number): void {
    for (const car of cars) {
      if (car.disposed || car.destroyed) continue;
      const lv = car.body.linvel();
      const sp = Math.hypot(lv.x, lv.z);
      if (sp < 2.5) continue;
      const p = car.position;
      if (p.y > 3) continue; // on a ramp or a garage deck
      const r = this.manager.carSweep({ x: p.x, z: p.z, vx: lv.x, vz: lv.z, halfWidth: car.spec.width / 2 + 0.1, ahead: 2.4 + sp * h * 3 });
      if (!r.broken.length) continue;
      car.body.setLinvel({ x: lv.x * r.slow, y: lv.y, z: lv.z * r.slow }, true);
      if (r.carDamage > 0) car.damage(r.carDamage);
      car.lastImpactAt = performance.now();
      audio.crash(Math.min(1, sp / 25) * 0.6, p);
    }
  }

  /** A bullet hit a collider: if it's a prop, it takes the damage. Returns true if it was one. */
  bullet(handle: number, damage: number, at: THREE.Vector3, dirX: number, dirZ: number): boolean {
    const p = this.propOf(handle);
    if (!p) return false;
    this.manager.hit(p, damage, 'bullet', { dirX, dirZ, speed: 4 });
    const metal = DESTRUCTIBLES.kinds[p.kind].material !== 'wood';
    if (metal) this.d.effects.sparks(at.x, at.y, at.z, 5);
    else this.d.effects.burst({ x: at.x, y: at.y, z: at.z, count: 5, r: 0.45, g: 0.32, b: 0.2, speed: 2.5, up: 1, life: 0.6, size0: 0.08, size1: 0.05, additive: false, lift: -9 });
    audio.bulletHit(metal, at);
    return true;
  }

  // ------------------------------------------------------------------ breaking and repairing

  private onBreak(p: Prop, dirX: number, dirZ: number, speed: number): void {
    const e = this.entries[p.id];
    for (const part of e.parts) {
      part.mesh.setMatrixAt(part.index, HIDDEN);
      part.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.colliderControl) this.colliderControl.hold(e.collider);
    else e.collider.setEnabled(false);
    const def = DESTRUCTIBLES.kinds[p.kind];
    const mat = DESTRUCTIBLES.materials[def.material];
    const dist = this.d.listener().distanceTo(this.tmpV.set(p.x, 1, p.z));
    audio.sfx(`sfx_break_${mat.sound}`, { x: p.x, y: 1, z: p.z });
    const push = Math.max(3, Math.min(14, speed * 0.6));
    const dx = dirX || Math.cos(p.rot);
    const dz = dirZ || Math.sin(p.rot);
    const near = dist < 140;
    switch (def.debris) {
      case 'pole':
        this.spawnPole(p, dx, dz, push);
        if (near) this.d.effects.sparks(p.x, CURB + 0.4, p.z, 14);
        break;
      case 'hydrant':
        this.spawnPiece(e.parts[0], p.x, CURB + 0.4, p.z, p.rot, RAPIER.ColliderDesc.cylinder(0.37, 0.19), { x: dx * 2, y: 7, z: dz * 2 }, 6, -0.375);
        this.geysers.push({ x: p.x, z: p.z, t: def.geyserSeconds ?? 12, sound: 0 });
        break;
      case 'tree':
        this.spawnTree(p, e, dx, dz, push);
        if (near) this.d.effects.burst({ x: p.x, y: CURB + 4.5 * p.s, z: p.z, count: 30, r: 0.25, g: 0.42, b: 0.16, speed: 3, up: 1, life: 2.2, size0: 0.18, size1: 0.12, alpha: 0.9, additive: false, drag: 1.6, lift: -2.5, jitter: 3 });
        break;
      case 'can':
        this.spawnPiece(e.parts[0], p.x, CURB + 0.45, p.z, p.rot, RAPIER.ColliderDesc.cylinder(0.45, 0.27), { x: dx * push, y: 3, z: dz * push }, 8, -0.45);
        this.spawnPiece(e.parts[1], p.x, CURB + 0.95, p.z, p.rot, RAPIER.ColliderDesc.cylinder(0.03, 0.3), { x: dx * push * 1.2, y: 5, z: dz * push * 1.2 }, 10, -0.93);
        if (near) this.d.effects.burst({ x: p.x, y: CURB + 0.6, z: p.z, count: 16, r: 0.85, g: 0.83, b: 0.78, speed: 3, up: 2, life: 1.6, size0: 0.14, size1: 0.1, additive: false, drag: 1.5, lift: -3, vx: dx * 2, vz: dz * 2 });
        break;
      case 'box':
        this.spawnPiece(e.parts[0], p.x, CURB + 0.6, p.z, p.rot, RAPIER.ColliderDesc.cuboid(0.25, 0.5, 0.21), { x: dx * push, y: 3.5, z: dz * push }, 7, -0.6);
        if (near) this.d.effects.burst({ x: p.x, y: CURB + 0.8, z: p.z, count: 22, r: 0.95, g: 0.94, b: 0.9, speed: 3.5, up: 3, life: 2.6, size0: 0.16, size1: 0.12, additive: false, drag: 2.2, lift: -1.2, vx: dx * 2, vz: dz * 2 });
        break;
      case 'bench': {
        const wood = e.parts[0];
        this.spawnPiece(wood, p.x, CURB + 0.5, p.z, p.rot, RAPIER.ColliderDesc.cuboid(0.8, 0.2, 0.22), { x: dx * push, y: 3, z: dz * push }, 5, -0.5);
        if (near) this.d.effects.burst({ x: p.x, y: CURB + 0.5, z: p.z, count: 12, r: 0.48, g: 0.34, b: 0.21, speed: 3, up: 2, life: 1, size0: 0.1, size1: 0.06, additive: false, lift: -9 });
        break;
      }
    }
    if (near) this.d.effects.burst({ x: p.x, y: CURB + 0.2, z: p.z, count: 10, r: 0.6, g: 0.57, b: 0.52, speed: 1.6, up: 0.6, life: 1.1, size0: 0.4, size1: 1.4, alpha: 0.4, additive: false, drag: 2, flat: true });
  }

  private onRepair(p: Prop): void {
    const e = this.entries[p.id];
    for (const part of e.parts) {
      part.mesh.setMatrixAt(part.index, part.matrix);
      part.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.colliderControl) this.colliderControl.release(e.collider);
    else e.collider.setEnabled(true);
  }

  /** A lamp post toppling: the pole, arm and head as one body, pushed over at the base. */
  private spawnPole(p: Prop, dx: number, dz: number, push: number): void {
    const e = this.entries[p.id];
    const g = new THREE.Group();
    for (const part of e.parts) {
      const m = this.piece(part);
      m.rotation.y = p.rot;
      m.position.y = -3.75;
      g.add(m);
    }
    this.addDebris(g, p.x, CURB + 3.75, p.z, RAPIER.ColliderDesc.cuboid(0.12, 3.75, 0.12).setDensity(60), { x: dx * push * 0.35, y: 0.5, z: dz * push * 0.35 }, { x: dz * 1.6, y: 0, z: -dx * 1.6 });
  }

  /** A tree falling: trunk and canopy together. */
  private spawnTree(p: Prop, e: Entry, dx: number, dz: number, push: number): void {
    const g = new THREE.Group();
    for (const part of e.parts) {
      const m = this.piece(part);
      m.position.y = -1.6;
      m.rotation.y = p.rot;
      g.add(m);
    }
    g.scale.setScalar(p.s);
    this.addDebris(g, p.x, CURB + 1.6 * p.s, p.z, RAPIER.ColliderDesc.cuboid(0.25 * p.s, 1.6 * p.s, 0.25 * p.s).setDensity(80), { x: dx * push * 0.25, y: 0.3, z: dz * push * 0.25 }, { x: dz * 1.1, y: 0, z: -dx * 1.1 }, p.s);
  }

  /**
   * A debris copy of one prop part. It's a one-instance InstancedMesh on purpose: the same shader as
   * the props themselves (instancing, instance colour), so the first break doesn't compile new
   * shader variants mid-game (that was a 200 ms freeze on the first explosion).
   */
  private piece(part: Entry['parts'][number]): THREE.InstancedMesh {
    const src = part.mesh;
    const m = new THREE.InstancedMesh(src.geometry, src.material, 1);
    m.setMatrixAt(0, IDENTITY);
    if (src.instanceColor) {
      src.getColorAt(part.index, this.tmpC);
      m.setColorAt(0, this.tmpC);
    }
    m.castShadow = true;
    m.frustumCulled = false;
    return m;
  }

  private spawnPiece(part: Entry['parts'][number], x: number, y: number, z: number, rot: number, col: RAPIER.ColliderDesc, vel: { x: number; y: number; z: number }, spin: number, yOffset: number): void {
    const g = new THREE.Group();
    const m = this.piece(part);
    m.position.y = yOffset;
    m.rotation.y = rot;
    g.add(m);
    this.addDebris(g, x, y, z, col.setDensity(30), vel, { x: (Math.random() - 0.5) * spin, y: (Math.random() - 0.5) * spin, z: (Math.random() - 0.5) * spin });
  }

  private addDebris(mesh: THREE.Object3D, x: number, y: number, z: number, col: RAPIER.ColliderDesc, vel: { x: number; y: number; z: number }, angvel: { x: number; y: number; z: number }, scale = 1): void {
    const S = DESTRUCTIBLES.settings;
    while (this.debris.length >= S.maxDebris) this.removeDebris(this.debris.shift()!);
    const body = this.d.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinvel(vel.x, vel.y, vel.z).setAngvel(angvel).setCanSleep(true));
    this.d.world.createCollider(col.setFriction(0.8).setRestitution(0.15).setCollisionGroups(DEBRIS_GROUPS), body);
    mesh.position.set(x, y, z);
    this.d.scene.add(mesh);
    const [lo, hi] = S.debrisLife;
    this.debris.push({ body, mesh, age: 0, life: lo + Math.random() * (hi - lo), scale });
  }

  private removeDebris(dbr: Debris): void {
    dbr.mesh.removeFromParent();
    // Free the pieces' instance buffers (the geometry and materials are the props' own, shared).
    dbr.mesh.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
    this.d.world.removeRigidBody(dbr.body);
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number, player: THREE.Vector3): void {
    const S = DESTRUCTIBLES.settings;
    // Debris follows its body, then shrinks away at the end of its life.
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const dbr = this.debris[i];
      dbr.age += dt;
      const t = dbr.body.translation();
      const r = dbr.body.rotation();
      dbr.mesh.position.set(t.x, t.y, t.z);
      dbr.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      const left = dbr.life - dbr.age;
      if (left < S.debrisFade) dbr.mesh.scale.setScalar(dbr.scale * Math.max(0.01, left / S.debrisFade));
      // Fell through the world (or out to sea): gone.
      if (left <= 0 || t.y < -20) {
        this.removeDebris(dbr);
        this.debris.splice(i, 1);
      }
    }
    // Broken hydrants gush.
    for (let i = this.geysers.length - 1; i >= 0; i--) {
      const g = this.geysers[i];
      g.t -= dt;
      if (g.t <= 0) {
        this.geysers.splice(i, 1);
        continue;
      }
      const d = Math.hypot(g.x - player.x, g.z - player.z);
      if (d > 120) continue;
      const k = Math.min(1, g.t / 3);
      this.d.effects.burst({ x: g.x, y: CURB + 0.3, z: g.z, count: 3, r: 0.75, g: 0.85, b: 0.95, speed: 0.8, up: 9 * k, life: 1.3, size0: 0.25, size1: 0.6, alpha: 0.55, additive: false, drag: 0.3, lift: -9 });
      this.d.effects.burst({ x: g.x, y: CURB + 0.1, z: g.z, count: 1, r: 0.85, g: 0.9, b: 0.95, speed: 1.5, life: 1.8, size0: 0.6, size1: 2.2, alpha: 0.18, additive: false, drag: 1.2, flat: true });
      g.sound -= dt;
      if (g.sound <= 0 && d < 50) {
        g.sound = 1.1;
        audio.sfx('sfx_geyser', { x: g.x, y: CURB, z: g.z });
      }
    }
    this.manager.update(dt, { x: player.x, z: player.z, visible: (x, z) => this.d.inView(x, 2, z) });
  }
}
