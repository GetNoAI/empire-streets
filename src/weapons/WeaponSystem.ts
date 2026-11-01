import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { audio } from '../audio/Audio';
import type { CameraRig } from '../camera/CameraRig';
import { GROUP, groups } from '../config';
import type { Effects } from '../fx/Effects';
import type { Ped, PedestrianSystem } from '../peds/PedestrianSystem';
import type { ArmPose } from '../player/Humanoid';
import type { Player } from '../player/Player';
import { Rng } from '../util/rng';
import type { Car } from '../vehicles/Car';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { CityLayout } from '../world/CityLayout';
import { Inventory } from './Inventory';
import { makeCashModel, makeWeaponModel } from './WeaponModels';
import { WEAPONS, isRanged, weapon, type WeaponSpec } from './WeaponTypes';

const RAY_GROUPS = groups(0xffff, GROUP.WORLD | GROUP.CAR);
const DEG = Math.PI / 180;
const TWO_HANDED = new Set(['shotgun', 'rifle', 'sniper']);

export interface WeaponEvents {
  /** A gun went off (or a Molotov smashed): `radius` is how far it's heard. */
  onNoise(x: number, z: number, radius: number, weaponId: string): void;
  /** The player hurt someone. `melee` attacks are silent. */
  onPedDamaged(ped: Ped, killed: boolean, weaponId: string, melee: boolean): void;
  /** The player was hurt by gunfire or fire. */
  onPlayerDamaged(amount: number, fromX: number, fromZ: number, cause: string): void;
  /** Picked something up (for HUD toasts). */
  onPickup(text: string): void;
  onMoney(amount: number): void;
  /** Shot landed on a person or car (for the HUD hit marker). */
  onHitMarker(kill: boolean): void;
  /** A shot hit the static world (`normal` faces out). Return true if something there took it. */
  onWorldHit?(colliderHandle: number, damage: number, at: THREE.Vector3, normal: { x: number; y: number; z: number }, dir: THREE.Vector3): boolean;
}

export interface FireInput {
  aiming: boolean;
  trigger: boolean;
  reload: boolean;
  moving: boolean;
  /** On foot and able to use weapons. */
  active: boolean;
}

interface Thrown {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number;
}

interface FireZone {
  x: number;
  y: number;
  z: number;
  r: number;
  until: number;
  dps: number;
  light: THREE.PointLight;
  byPlayer: boolean;
}

interface Pickup {
  kind: 'weapon' | 'cash';
  id: string;
  rounds: number;
  amount: number;
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  /** World pickups come back after being collected; drops expire. */
  permanent: boolean;
  respawnAt: number;
  expiresAt: number;
  active: boolean;
  spin: number;
}

/**
 * Everything that fires: the player's guns, melee and throwables, police gunfire, fire zones from
 * Molotovs, and weapon/cash pickups lying in the street.
 */
/** A Streetmon the player's weapons can hit (wild creatures, foes in a real-time skirmish). */
export interface CreatureTarget {
  x: number;
  y: number;
  z: number;
  height: number;
  /** Applies weapon damage; returns true if it knocked the creature out. */
  hit(damage: number, dirX: number, dirZ: number, melee: boolean): boolean;
  /** A foe in the battle you're fighting: shots get a wider aim assist. */
  assist?: boolean;
}

/** Aim assist for shots at Streetmon (degrees either side, horizontally): they're small and low. */
const ASSIST_DEG = { foe: 7, wild: 3.5 } as const;

export class WeaponSystem {
  /** Supplies the creatures that can be hit this frame (set by the game). */
  creatureTargets: (() => CreatureTarget[]) | null = null;
  /** Armoured targets (police tanks): bullets barely scratch them, fire burns them. */
  armour: { hit(colliderHandle: number, damage: number, at: THREE.Vector3): boolean; burn(x: number, z: number, r: number, amount: number): void } | null = null;
  readonly inventory = new Inventory();
  private readonly held = new Map<string, THREE.Group>();
  private heldId = '';
  private swing = 0;
  private swingKind: 'melee' | 'throw' | null = null;
  private meleePending = 0;
  private lastShotAt = -10;
  private time = 0;
  private readonly thrown: Thrown[] = [];
  private readonly fires: FireZone[] = [];
  /**
   * Fire lights, made once and kept in the scene (dark when unused): adding or removing a light
   * changes every lit material's shader, which recompiled the whole scene each time a Molotov
   * landed or burned out (a visible hitch).
   */
  private readonly fireLights: THREE.PointLight[];
  private readonly pickups: Pickup[] = [];
  private readonly tmpO = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();
  private readonly tmpV = new THREE.Vector3();
  private wasReloading = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
    private readonly rig: CameraRig,
    private readonly player: Player,
    private readonly peds: PedestrianSystem,
    private readonly vehicles: VehicleManager,
    private readonly effects: Effects,
    private readonly events: WeaponEvents,
  ) {
    this.fireLights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xff8a3a, 0, 14, 2);
      scene.add(l);
      return l;
    });
  }

  get current(): WeaponSpec {
    return this.inventory.current;
  }

  /** Recently fired or aiming: arms up. */
  private armsUp(aiming: boolean): boolean {
    return aiming || this.time - this.lastShotAt < 1.2;
  }

  // ------------------------------------------------------------------ player weapons

  update(dt: number, input: FireInput): void {
    this.time += dt;
    const inv = this.inventory;
    inv.update(dt);
    if (this.wasReloading && !inv.isReloading) audio.reload();
    this.wasReloading = inv.isReloading;

    this.updateHeldModel(input.active);
    if (input.active) {
      if (input.reload && inv.reload()) audio.reload();
      const res = inv.trigger(input.trigger);
      if (res === 'fired') this.fire(input);
      else if (res === 'empty') audio.dryFire();
    } else {
      inv.trigger(false);
    }

    // Melee swings land a moment into the animation.
    if (this.meleePending > 0) {
      this.meleePending -= dt;
      if (this.meleePending <= 0) this.meleeHit();
    }
    if (this.swingKind) {
      this.swing += dt / 0.35;
      if (this.swing >= 1) {
        this.swing = 0;
        this.swingKind = null;
      }
    }
    // Arm pose.
    const m = this.player.model;
    if (m.setArms) {
      const w = inv.current;
      let pose: ArmPose = 'none';
      if (!input.active) pose = 'none';
      else if (this.swingKind) pose = this.swingKind;
      else if (isRanged(w) && w.kind === 'hitscan') {
        // Aiming (or just fired): raised; otherwise carried at the low ready / across the hip.
        if (this.armsUp(input.aiming)) pose = TWO_HANDED.has(w.id) ? 'twohand' : 'onehand';
        else pose = TWO_HANDED.has(w.id) ? 'carry' : 'lowready';
      }
      m.setArms(pose, this.swing);
    }

    this.updateThrown(dt);
    this.updateFires(dt);
  }

  /** The player's figure was swapped: put the weapon back in the new hand on the next update. */
  refreshHeld(): void {
    this.heldId = '\u0000';
  }

  private updateHeldModel(active: boolean): void {
    const id = active ? this.inventory.currentId : '';
    if (id === this.heldId) return;
    this.heldId = id;
    if (!this.player.model.hold) return;
    if (!id || id === 'fists') {
      this.player.model.hold(null);
      return;
    }
    let g = this.held.get(id);
    if (!g) {
      g = makeWeaponModel(id);
      this.held.set(id, g);
    }
    this.player.model.hold(g);
  }

  /** Muzzle position: chest height, ahead of and slightly right of the player. */
  private muzzle(out: THREE.Vector3): THREE.Vector3 {
    const p = this.player.feet;
    const h = this.player.facing;
    const fwd = TWO_HANDED.has(this.inventory.currentId) ? 0.85 : 0.55;
    return out.set(p.x + Math.cos(h) * fwd + Math.sin(h) * 0.2, p.y + 1.42, p.z - Math.sin(h) * fwd + Math.cos(h) * 0.2);
  }

  /**
   * Where the crosshair points: the first thing along the camera ray past the player, or a point at
   * maximum range.
   */
  aimPoint(range: number, out: THREE.Vector3): THREE.Vector3 {
    const o = this.tmpO;
    const d = this.tmpD;
    this.rig.aimRay(o, d);
    // Start the ray level with the player so things between the camera and the player are ignored.
    const pp = this.player.position;
    const skip = Math.max(0, (pp.x - o.x) * d.x + (pp.y - o.y) * d.y + (pp.z - o.z) * d.z);
    o.addScaledVector(d, skip);
    let t = range;
    const hit = this.world.castRay(new RAPIER.Ray(o, d), range, true, undefined, RAY_GROUPS, undefined, this.player.vehicle?.body);
    if (hit) t = Math.min(t, hit.timeOfImpact);
    const ph = this.peds.rayHit(o.x, o.y, o.z, d.x, d.y, d.z, t);
    if (ph) t = ph.t;
    return out.copy(o).addScaledVector(d, t);
  }

  private fire(input: FireInput): void {
    const w = this.inventory.current;
    this.lastShotAt = this.time;
    // Firing turns you to face the crosshair (handled by the game via facingOverride).
    if (w.kind === 'melee') {
      this.swingKind = 'melee';
      this.swing = 0;
      this.meleePending = 0.12;
      return;
    }
    if (w.kind === 'throw') {
      this.swingKind = 'throw';
      this.swing = 0.3;
      this.throwMolotov(w);
      return;
    }
    const m = this.muzzle(new THREE.Vector3());
    const target = this.aimPoint(w.range!, new THREE.Vector3());
    const base = this.tmpV.subVectors(target, m).normalize();
    const spread = this.inventory.spread(input.aiming, input.moving) * DEG;
    let anyHit = false;
    let anyKill = false;
    for (let i = 0; i < (w.pellets ?? 1); i++) {
      const dir = coneSample(base, spread);
      const r = this.traceShot(m, dir, w);
      if (r.hit) anyHit = true;
      if (r.kill) anyKill = true;
    }
    if (anyHit) this.events.onHitMarker(anyKill);
    this.effects.muzzle(m.x, m.y, m.z, w.pellets && w.pellets > 1 ? 1.6 : TWO_HANDED.has(w.id) ? 1.3 : 1);
    audio.gunshot(w.id, 0);
    this.rig.kick((w.recoil ?? 0) * DEG * (input.aiming ? 0.6 : 1));
    this.events.onNoise(m.x, m.z, w.noiseRadius, w.id);
  }

  /** One bullet or pellet. */
  private traceShot(from: THREE.Vector3, dir: THREE.Vector3, w: WeaponSpec): { hit: boolean; kill: boolean } {
    const range = w.range!;
    const ray = new RAPIER.Ray(from, dir);
    const wh = this.world.castRayAndGetNormal(ray, range, true, undefined, RAY_GROUPS, undefined, this.player.vehicle?.body);
    const tWorld = wh ? wh.timeOfImpact : range;
    const ph = this.peds.rayHit(from.x, from.y, from.z, dir.x, dir.y, dir.z, tWorld);
    const ch = this.rayCreature(from, dir, ph ? ph.t : tWorld);
    if (ch) {
      const end = this.tmpO.copy(from).addScaledVector(dir, ch.t);
      this.effects.tracer(from.x, from.y, from.z, end.x, end.y, end.z);
      const fall = ch.t <= (w.falloffStart ?? range) ? 1 : Math.max(0.35, 1 - ((ch.t - w.falloffStart!) / Math.max(1, range - w.falloffStart!)) * 0.65);
      const ko = ch.target.hit(w.damage * fall, dir.x, dir.z, false);
      this.effects.impact(end.x, end.y, end.z, false);
      this.effects.sparks(end.x, end.y, end.z, 4);
      audio.bulletHit(false, end);
      return { hit: true, kill: ko };
    }
    const t = ph ? ph.t : tWorld;
    const end = this.tmpO.copy(from).addScaledVector(dir, t);
    this.effects.tracer(from.x, from.y, from.z, end.x, end.y, end.z);
    const fall = t <= (w.falloffStart ?? range) ? 1 : Math.max(0.35, 1 - ((t - w.falloffStart!) / Math.max(1, range - w.falloffStart!)) * 0.65);
    if (ph) {
      const dmg = w.damage * fall * (ph.headshot ? 2.5 : 1);
      const killed = this.peds.damage(ph.ped, dmg, dir.x, dir.z, w.knockback ?? 1);
      this.effects.blood(end.x, end.y, end.z, dir.x, dir.z, ph.headshot ? 14 : 8);
      this.events.onPedDamaged(ph.ped, killed, w.id, false);
      return { hit: true, kill: killed };
    }
    if (wh) {
      if (this.armour?.hit(wh.collider.handle, w.damage * fall, end)) {
        this.effects.sparks(end.x, end.y, end.z, 10);
        audio.bulletHit(true, end);
        return { hit: true, kill: false };
      }
      const car = this.vehicles.carByCollider(wh.collider);
      if (car) {
        this.shootCar(car, w.damage * fall, end, dir, w.knockback ?? 1);
        this.effects.impact(end.x, end.y, end.z, true);
        audio.bulletHit(true, end);
        return { hit: true, kill: false };
      }
      if (this.events.onWorldHit?.(wh.collider.handle, w.damage * fall, end, wh.normal, dir)) return { hit: false, kill: false };
      this.effects.impact(end.x, end.y, end.z, false);
      audio.bulletHit(false, end);
    }
    return { hit: false, kill: false };
  }

  /** Nearest creature along a ray (each treated as a sphere around its middle). */
  private rayCreature(o: THREE.Vector3, d: THREE.Vector3, maxT: number): { t: number; target: CreatureTarget } | null {
    const list = this.creatureTargets?.() ?? [];
    let best: { t: number; target: CreatureTarget } | null = null;
    for (const c of list) {
      const r = Math.max(0.35, c.height * 0.5);
      const cx = c.x - o.x;
      const cy = c.y + c.height * 0.5 - o.y;
      const cz = c.z - o.z;
      const tc = cx * d.x + cy * d.y + cz * d.z;
      if (tc < 0) continue;
      const d2 = cx * cx + cy * cy + cz * cz - tc * tc;
      if (d2 > r * r) continue;
      if (d2 <= r * r) {
        const t = tc - Math.sqrt(r * r - d2);
        if (t < maxT && (!best || t < best.t)) best = { t: Math.max(0, t), target: c };
        continue;
      }
    }
    if (best) return best;
    // Aim assist: a Streetmon is knee-high and the crosshair sits at shoulder height, so a shot
    // that's on target sideways counts (within a few degrees, and not wildly above or below).
    const dh = Math.hypot(d.x, d.z);
    if (dh < 0.3) return null;
    for (const c of list) {
      const cx = c.x - o.x;
      const cz = c.z - o.z;
      const hd = Math.hypot(cx, cz);
      if (hd < 0.3) continue;
      const cos = (cx * d.x + cz * d.z) / (hd * dh);
      const cone = Math.cos(((c.assist ? ASSIST_DEG.foe : ASSIST_DEG.wild) * Math.PI) / 180);
      if (cos < cone) continue;
      const t = hd / dh;
      if (t >= maxT) continue;
      const rayY = o.y + d.y * t;
      if (Math.abs(rayY - (c.y + c.height * 0.5)) > Math.max(1.8, c.height)) continue;
      if (!best || t < best.t) best = { t, target: c };
    }
    return best;
  }

  private shootCar(car: Car, dmg: number, at: THREE.Vector3, dir: THREE.Vector3, knock: number): void {
    // Cars soak a lot of rounds; enough of them light the fuel.
    car.damage(dmg * 1.6, 'bullet');
    car.wake();
    const imp = knock * 60;
    car.body.applyImpulseAtPoint({ x: dir.x * imp, y: 0, z: dir.z * imp }, { x: at.x, y: at.y, z: at.z }, true);
  }

  private meleeHit(): void {
    const w = this.inventory.current;
    if (w.kind !== 'melee') return;
    const p = this.player.feet;
    const h = this.player.facing;
    const fx = Math.cos(h);
    const fz = -Math.sin(h);
    const reach = w.range!;
    const halfArc = (w.arc! * DEG) / 2;
    let best: Ped | null = null;
    let bestD = Infinity;
    for (const q of this.peds.peds) {
      if (q.state === 'dead') continue;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + 0.35 || Math.abs(q.y - p.y) > 1.2) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / Math.max(d, 1e-3))));
      if (ang > halfArc && d > 0.6) continue;
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    // Creatures in the arc (closer than any person) take the hit instead.
    for (const c of this.creatureTargets?.() ?? []) {
      const dx = c.x - p.x;
      const dz = c.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + 0.6 || d >= bestD) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / Math.max(d, 1e-3))));
      if (ang > halfArc && d > 0.8) continue;
      const ko = c.hit(w.damage, fx, fz, true);
      if (w.id === 'knife') this.effects.blood(c.x, c.y + c.height * 0.5, c.z, fx, fz, 6);
      audio.swing(true);
      this.events.onHitMarker(ko);
      return;
    }
    if (best) {
      const killed = this.peds.damage(best, w.damage, fx, fz, w.knockback ?? 1);
      if (w.id === 'knife') this.effects.blood(best.x, best.y + 1.2, best.z, fx, fz, 10);
      audio.swing(true);
      this.events.onPedDamaged(best, killed, w.id, true);
      this.events.onHitMarker(killed);
      return;
    }
    // Hitting a car dents it a little.
    for (const c of this.vehicles.cars) {
      if (this.vehicles.distanceToFootprint(c, this.tmpO.set(p.x + fx * 1.2, p.y + 1, p.z + fz * 1.2)) < 0.4) {
        c.damage(w.damage * 0.5);
        this.effects.sparks(p.x + fx * 1.2, p.y + 1, p.z + fz * 1.2, 4);
        audio.swing(true);
        return;
      }
    }
    audio.swing(false);
  }

  // ------------------------------------------------------------------ Molotovs and fire

  private throwMolotov(w: WeaponSpec): void {
    const m = this.muzzle(new THREE.Vector3());
    m.y += 0.3;
    const target = this.aimPoint(60, new THREE.Vector3());
    const dir = this.tmpV.subVectors(target, m);
    const flat = Math.hypot(dir.x, dir.z);
    // Aim the arc: horizontal speed from throwSpeed, vertical to land near the target.
    const speed = w.throwSpeed!;
    const tFlight = Math.max(0.3, flat / speed);
    const vx = (dir.x / Math.max(flat, 1e-3)) * Math.min(speed, flat / tFlight);
    const vz = (dir.z / Math.max(flat, 1e-3)) * Math.min(speed, flat / tFlight);
    const vy = Math.min(12, dir.y / tFlight + 0.5 * 9.81 * tFlight);
    const mesh = makeWeaponModel('molotov');
    mesh.position.copy(m);
    this.scene.add(mesh);
    this.thrown.push({ mesh, pos: m.clone(), vel: new THREE.Vector3(vx, vy, vz), spin: (Math.random() - 0.5) * 12 });
  }

  private updateThrown(dt: number): void {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i];
      t.vel.y -= 9.81 * dt;
      const step = this.tmpV.copy(t.vel).multiplyScalar(dt);
      const len = step.length();
      const hit = len > 0 ? this.world.castRay(new RAPIER.Ray(t.pos, this.tmpD.copy(step).divideScalar(len)), len, true, undefined, RAY_GROUPS) : null;
      const ph = this.peds.rayHit(t.pos.x, t.pos.y, t.pos.z, step.x / len, step.y / len, step.z / len, hit ? hit.timeOfImpact : len);
      if (hit || ph || t.pos.y < -1) {
        const at = hit || ph ? t.pos.clone().addScaledVector(this.tmpD.copy(step).divideScalar(len), ph ? ph.t : hit!.timeOfImpact) : t.pos.clone();
        this.scene.remove(t.mesh);
        this.thrown.splice(i, 1);
        this.ignite(at, true);
        continue;
      }
      t.pos.add(step);
      t.mesh.position.copy(t.pos);
      t.mesh.rotation.z += t.spin * dt;
      if (Math.random() < 0.6) this.effects.fire(t.pos.x, t.pos.y, t.pos.z);
    }
  }

  /** Starts a fire zone on the ground below `at`. */
  ignite(at: THREE.Vector3, byPlayer: boolean): void {
    const w = weapon('molotov');
    // Find the ground under the impact point.
    const down = this.world.castRay(new RAPIER.Ray({ x: at.x, y: at.y + 0.5, z: at.z }, { x: 0, y: -1, z: 0 }), 6, true, undefined, groups(0xffff, GROUP.WORLD));
    const y = down ? at.y + 0.5 - down.timeOfImpact : Math.max(0, at.y);
    // A free one, or the one on the oldest fire.
    const light = this.fireLights.find((l) => !this.fires.some((f) => f.light === l)) ?? this.fires[0].light;
    light.intensity = 60;
    light.position.set(at.x, y + 1, at.z);
    this.fires.push({ x: at.x, y, z: at.z, r: w.fireRadius!, until: this.time + w.fireDuration!, dps: w.damage, light, byPlayer });
    audio.molotov(at);
    this.events.onNoise(at.x, at.z, w.noiseRadius, 'molotov');
    this.peds.alarm(at.x, at.z, w.fireRadius! + 12);
  }

  private updateFires(dt: number): void {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      const left = f.until - this.time;
      if (left <= 0) {
        if (!this.fires.some((o) => o !== f && o.light === f.light)) f.light.intensity = 0;
        this.fires.splice(i, 1);
        continue;
      }
      const k = Math.min(1, left / 2);
      f.light.intensity = (50 + Math.random() * 25) * k;
      // Flames across the burning area.
      const n = Math.ceil(10 * dt * 60 * k * 0.25);
      for (let j = 0; j < n; j++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * f.r;
        this.effects.fire(f.x + Math.cos(a) * r, f.y + 0.1, f.z + Math.sin(a) * r);
      }
      if (Math.random() < dt * 6) this.effects.engineSmoke(f.x, f.y + 1.5, f.z, 0.6);
      // Burn creatures standing in it.
      if (f.byPlayer) for (const c of this.creatureTargets?.() ?? []) if (Math.hypot(c.x - f.x, c.z - f.z) < f.r) c.hit(f.dps * dt * 1.5, c.x - f.x, c.z - f.z, false);
      // Burn whoever stands in it.
      for (const q of this.peds.peds) {
        if (q.state === 'dead') continue;
        if (Math.hypot(q.x - f.x, q.z - f.z) > f.r || Math.abs(q.y - f.y) > 1.5) continue;
        const killed = this.peds.damage(q, f.dps * dt * 1.5, q.x - f.x, q.z - f.z, 0);
        if (f.byPlayer && (killed || Math.random() < dt)) this.events.onPedDamaged(q, killed, 'molotov', false);
        if (Math.random() < dt * 20) this.effects.fire(q.x, q.y + 1, q.z);
      }
      const pp = this.player.feet;
      if (!this.player.vehicle && !this.player.dead && Math.hypot(pp.x - f.x, pp.z - f.z) < f.r && Math.abs(pp.y - f.y) < 1.5) {
        this.events.onPlayerDamaged(f.dps * dt, f.x, f.z, 'Burned');
      }
      for (const c of this.vehicles.cars) {
        if (Math.hypot(c.position.x - f.x, c.position.z - f.z) < f.r + c.spec.length / 2) c.damage(f.dps * dt * 4, 'fire');
      }
      this.armour?.burn(f.x, f.z, f.r, f.dps * dt * 4);
    }
  }

  // ------------------------------------------------------------------ NPC gunfire

  /**
   * An NPC (police) fires a pistol at a target point. `hitChance` decides whether the round connects;
   * misses go wide. Returns true on a hit.
   */
  /** A blast or a shock from the environment: every Streetmon in reach takes it (falling off with distance). */
  creatureBlast(x: number, z: number, r: number, damage: number): void {
    for (const c of this.creatureTargets?.() ?? []) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < r) c.hit(damage * (1 - d / r), c.x - x, c.z - z, false);
    }
  }

  npcFire(from: THREE.Vector3, target: THREE.Vector3, hitChance: number): boolean {
    const hit = Math.random() < hitChance;
    const end = target.clone();
    if (!hit) {
      end.x += (Math.random() - 0.5) * 3;
      end.y += (Math.random() - 0.2) * 1.5;
      end.z += (Math.random() - 0.5) * 3;
    }
    // Rounds stop at walls and cars on the way.
    const dir = this.tmpD.subVectors(end, from);
    const len = dir.length();
    dir.divideScalar(len);
    const wh = this.world.castRay(new RAPIER.Ray(from, dir), len, true, undefined, RAY_GROUPS, undefined, this.player.vehicle?.body);
    const t = wh ? wh.timeOfImpact : len;
    const stop = from.clone().addScaledVector(dir, t);
    this.effects.tracer(from.x, from.y, from.z, stop.x, stop.y, stop.z);
    this.effects.muzzle(from.x, from.y, from.z, 0.8);
    audio.gunshot('npc', from);
    if (wh) {
      this.effects.impact(stop.x, stop.y, stop.z, !!this.vehicles.carByCollider(wh.collider));
      return false;
    }
    return hit;
  }

  // ------------------------------------------------------------------ pickups

  /** Scatters the configured number of each weapon on random sidewalks. */
  placeWorldPickups(layout: CityLayout, seed = 4242): void {
    const rng = new Rng(seed);
    for (const w of WEAPONS) {
      for (let i = 0; i < (w.pickupCount ?? 0); i++) {
        const b = layout.blocks[rng.int(0, layout.blocks.length - 1)];
        const inset = 1.7;
        const edge = rng.int(0, 3);
        const u = rng.range(0.15, 0.85);
        const x = edge === 0 || edge === 2 ? b.x0 + (b.x1 - b.x0) * u : edge === 1 ? b.x1 - inset : b.x0 + inset;
        const z = edge === 1 || edge === 3 ? b.z0 + (b.z1 - b.z0) * u : edge === 0 ? b.z0 + inset : b.z1 - inset;
        this.addPickup('weapon', w.id, isRanged(w) ? w.startReserve ?? 0 : 0, 0, x, 0.15, z, true);
      }
    }
    // (No cash lying about in the streets any more: money comes from jobs, races, heists and fights.)
  }

  private addPickup(kind: 'weapon' | 'cash', id: string, rounds: number, amount: number, x: number, y: number, z: number, permanent: boolean): void {
    const mesh = new THREE.Group();
    const model = kind === 'cash' ? makeCashModel() : makeWeaponModel(id);
    model.scale.setScalar(kind === 'cash' ? 2 : 1.6);
    // Centre the model on the spin axis.
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.sub(c);
    mesh.add(model);
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.45, 24),
      new THREE.MeshBasicMaterial({ color: kind === 'cash' ? 0x7dff8a : 0xffc84a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.45;
    mesh.add(glow);
    mesh.position.set(x, y + 0.5, z);
    this.scene.add(mesh);
    this.pickups.push({ kind, id, rounds, amount, mesh, x, y, z, permanent, respawnAt: 0, expiresAt: permanent ? Infinity : this.time + 60, active: true, spin: Math.random() * 6 });
  }

  /** Something dropped by a person (a cop's pistol, cash). */
  drop(kind: 'weapon' | 'cash', id: string, roundsOrAmount: number, x: number, y: number, z: number): void {
    // Nobody drops cash in the street (people, police and gang members alike).
    if (kind === 'cash') return;
    else this.addPickup('weapon', id, roundsOrAmount, 0, x, y, z, false);
  }

  updatePickups(dt: number, canCollect: boolean): void {
    const p = this.player.feet;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      if (!k.active) {
        if (k.permanent && this.time >= k.respawnAt) {
          k.active = true;
          k.mesh.visible = true;
        }
        continue;
      }
      if (this.time > k.expiresAt) {
        this.scene.remove(k.mesh);
        this.pickups.splice(i, 1);
        continue;
      }
      k.spin += dt * 2;
      k.mesh.rotation.y = k.spin;
      k.mesh.position.y = k.y + 0.5 + Math.sin(k.spin * 1.5) * 0.08;
      if (!canCollect || Math.hypot(p.x - k.x, p.z - k.z) > 1.3 || Math.abs(p.y - k.y) > 1.5) continue;
      if (!this.collect(k)) continue;
      if (k.permanent) {
        k.active = false;
        k.mesh.visible = false;
        k.respawnAt = this.time + 90;
      } else {
        this.scene.remove(k.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  private collect(k: Pickup): boolean {
    if (k.kind === 'cash') {
      this.events.onMoney(k.amount);
      audio.cash();
      return true;
    }
    const w = weapon(k.id);
    const inv = this.inventory;
    const had = inv.has(k.id);
    if (had && (!isRanged(w) || inv.ammoSpace(k.id) <= 0)) return false;
    const added = inv.give(k.id, k.rounds);
    audio.reload();
    this.events.onPickup(had ? `+${added} ${w.name} ammo` : `Picked up ${w.name}`);
    // Grabbing your first gun puts it in your hand.
    if (!had && (inv.currentId === 'fists' || weapon(inv.currentId).kind === 'melee') && isRanged(w)) inv.select(k.id);
    return true;
  }

  /** Pickup positions (for the minimap). */
  pickupMarkers(): Array<{ x: number; z: number; kind: 'weapon' | 'cash' }> {
    return this.pickups.filter((k) => k.active).map((k) => ({ x: k.x, z: k.z, kind: k.kind }));
  }

  /** Everything that's currently burning (police and peds avoid it, HUD shows it). */
  get activeFires(): readonly { x: number; z: number; r: number }[] {
    return this.fires;
  }

  /** Spread of the crosshair in degrees, for the HUD. */
  crosshairSpread(aiming: boolean, moving: boolean): number {
    return this.inventory.spread(aiming, moving);
  }

  clearProjectiles(): void {
    for (const t of this.thrown) this.scene.remove(t.mesh);
    this.thrown.length = 0;
  }
}

/** Random direction within a cone of half-angle `spread` around `dir` (uniform over the disc). */
function coneSample(dir: THREE.Vector3, spread: number): THREE.Vector3 {
  if (spread <= 0) return dir.clone();
  const up = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, up).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u);
  const r = Math.tan(spread) * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  return dir
    .clone()
    .addScaledVector(u, Math.cos(a) * r)
    .addScaledVector(v, Math.sin(a) * r)
    .normalize();
}
