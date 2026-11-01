import * as THREE from 'three';
import { audio } from '../audio/Audio';
import type { SpawnSystem } from '../creatures/SpawnSystem';
import type { Effects } from '../fx/Effects';
import type { PedestrianSystem } from '../peds/PedestrianSystem';
import type { PoliceSystem } from '../police/PoliceSystem';
import type { TankSystem } from '../police/Tank';
import type { Car } from '../vehicles/Car';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { AbilityConfig, AbilityPayload } from './vehicleTuning.js';
import { withSurface } from '../render/Surfaces';

/**
 * What tuning abilities do in the world (the engine side of vehicleTuning.js): the Nitrous
 * Smokescreen's smoke trail (which police and tanks can't see through), Exhaust Backfire and Sonic
 * Bass Horn shockwaves, spike strips that pop tyres, and the Early Warning Radar's markers.
 */

export interface TuningWorldDeps {
  scene: THREE.Scene;
  effects: Effects;
  vehicles: VehicleManager;
  police: PoliceSystem;
  tanks: TankSystem;
  peds: PedestrianSystem;
  spawns: SpawnSystem;
  /** Camera position, for sound distance. */
  listener(): THREE.Vector3;
  shake(amount: number): void;
  /** The car the player is driving (your own spike strips never pop it; a rival's slows it). */
  playerCar(): Car | null;
  /** One of a race's NPC racers (a spike strip gives them a slow leak, not a wreck). */
  isRacer?(car: Car): boolean;
}

export interface RadarSources {
  manholes: Array<{ x: number; z: number }>;
  access: Array<{ x: number; z: number; kind: 'fireEscape' | 'elevator' }>;
  garages: Array<{ x: number; z: number }>;
  hiddenPads: Array<{ x: number; z: number }>;
}

interface Puff {
  x: number;
  y: number;
  z: number;
  r: number;
  age: number;
  life: number;
}

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  radius: number;
  on: boolean;
}

interface Hazard {
  kind: 'spikeStrip' | 'oilSlick';
  x: number;
  z: number;
  /** Unit direction of travel when dropped; the strip lies across it. */
  dx: number;
  dz: number;
  length: number;
  width: number;
  left: number;
  owner: Car;
  params: Record<string, number | string>;
  mesh: THREE.Object3D;
}

const MAX_PUFFS = 110;

export class TuningWorld {
  private readonly puffs: Puff[] = [];
  private readonly puffMesh: THREE.InstancedMesh;
  private readonly rings: Ring[] = [];
  readonly hazards: Hazard[] = [];
  private readonly trails = new Map<Car, { left: number; next: number; params: Record<string, number | string>; power: number }>();
  private blindCheck = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  /** You drove over a rival's hazard (the HUD says so). */
  onPlayerHit: ((what: 'spikeStrip') => void) | null = null;

  constructor(private readonly d: TuningWorldDeps) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 1, transparent: true, opacity: 0.72, depthWrite: false });
    this.puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat, MAX_PUFFS);
    this.puffMesh.count = 0;
    this.puffMesh.frustumCulled = false;
    this.puffMesh.renderOrder = 2;
    d.scene.add(this.puffMesh);
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      mesh.rotation.x = Math.PI / 2;
      mesh.visible = false;
      d.scene.add(mesh);
      this.rings.push({ mesh, t: 0, dur: 0.45, radius: 1, on: false });
    }
  }

  // ------------------------------------------------------------------ abilities

  /** Runs an ability for a car. Returns false if it couldn't fire (the cooldown isn't spent). */
  trigger(car: Car, ab: AbilityPayload, ctx: { strength?: number } = {}): boolean {
    if (car.disposed || car.destroyed) return false;
    const P = ab.params as Record<string, number>;
    switch (ab.id) {
      case 'nitrousSmokescreen':
        this.trails.set(car, { left: ab.duration ?? 5, next: 0, params: ab.params, power: ab.power });
        this.flame(car, 2.2);
        audio.sfx(ab.sfx ?? '', car.position);
        return true;
      case 'exhaustBackfire':
        this.shockwave(car, P.radius * ab.power, P.impulse * ab.power * Math.min(1.5, 0.6 + (ctx.strength ?? 6) / 12), P.damage, P.staggerSeconds, 0, 0, 0xff8a2a);
        this.flame(car, 3.2);
        audio.sfx(ab.sfx ?? '', car.position);
        this.d.shake(0.05);
        return true;
      case 'sonicBassHorn':
        this.shockwave(car, P.radius * ab.power, P.impulse * ab.power, 0, P.staggerSeconds, P.lift, P.flipMaxMass, 0xb26bff, P.flipTorque, P.pedKnock);
        audio.sfx(ab.sfx ?? '', car.position);
        this.d.shake(0.07);
        return true;
      case 'spikeStripDispenser':
        if (Math.abs(car.speed) < 1) return false; // nowhere to drop it behind a parked car
        this.dropHazard(car, ab);
        audio.sfx(ab.sfx ?? '', car.position);
        return true;
      default:
        return true;
    }
  }

  /** A timed ability ran out. */
  end(car: Car, ab: AbilityConfig & { id: string }): void {
    if (ab.id === 'nitrousSmokescreen') this.trails.delete(car);
  }

  /** Is the straight line from a to b hidden by smoke? (Police and tank sight.) */
  sightBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    if (!this.puffs.length) return false;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-6) return false;
    for (const p of this.puffs) {
      if (p.age < 0.15) continue;
      const r = this.puffRadius(p) * 0.85;
      let t = ((p.x - ax) * dx + (p.y - ay) * dy + (p.z - az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + dx * t - p.x;
      const cy = ay + dy * t - p.y;
      const cz = az + dz * t - p.z;
      if (cx * cx + cy * cy + cz * cz < r * r) return true;
    }
    return false;
  }

  /** Is a point inside the smoke? */
  inSmoke(x: number, y: number, z: number): boolean {
    return this.puffs.some((p) => p.age > 0.15 && (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2 < this.puffRadius(p) ** 2);
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number): void {
    // Smoke trails behind cars with Nitrous Smokescreen running.
    for (const [car, t] of [...this.trails]) {
      if (car.disposed || car.destroyed) {
        this.trails.delete(car);
        continue;
      }
      t.left -= dt;
      t.next -= dt;
      if (t.next <= 0) {
        t.next = Number(t.params.puffEvery ?? 0.1);
        const f = car.forward(this.v);
        const back = car.spec.length / 2 + 1.2;
        this.addPuff(car.position.x - f.x * back + (Math.random() - 0.5), 1.3 + Math.random() * 0.6, car.position.z - f.z * back + (Math.random() - 0.5), Number(t.params.puffRadius ?? 2.8) * t.power, Number(t.params.puffLife ?? 7));
        if (Math.random() < 0.5) this.flame(car, 1.3);
      }
      if (t.left <= 0) this.trails.delete(car);
    }
    // Age the smoke.
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) this.puffs.splice(i, 1);
    }
    // Police cars that drive into the smoke are blinded.
    this.blindCheck -= dt;
    if (this.blindCheck <= 0 && this.puffs.length) {
      this.blindCheck = 0.2;
      const hit: Car[] = [];
      for (const c of this.d.police.unitCars()) {
        if (c.disposed) continue;
        const p = c.position;
        if (this.puffs.some((q) => q.age > 0.15 && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < (this.puffRadius(q) + 1.2) ** 2)) hit.push(c);
      }
      if (hit.length) this.d.police.daze(hit, 3.5);
    }
    this.drawPuffs();
    // Shockwave rings.
    for (const r of this.rings) {
      if (!r.on) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.mesh.scale.setScalar(Math.max(0.01, r.radius * (0.15 + 0.85 * k)));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      if (k >= 1) {
        r.on = false;
        r.mesh.visible = false;
      }
    }
    this.updateHazards(dt);
  }

  // ------------------------------------------------------------------ radar

  /**
   * Early Warning Radar: minimap markers for roadblocks, tanks, your spike strips and hidden ways
   * in, within `range` of you, and a warning line for the nearest threat.
   */
  radar(x: number, z: number, heading: number, range: number, src: RadarSources): { markers: Array<{ x: number; z: number; color: string; size: number }>; warning: string } {
    const out: Array<{ x: number; z: number; color: string; size: number }> = [];
    const within = (p: { x: number; z: number }): boolean => Math.hypot(p.x - x, p.z - z) < range;
    for (const m of src.manholes) if (within(m)) out.push({ x: m.x, z: m.z, color: '#c9d3d8', size: 6 });
    for (const a of src.access) if (within(a)) out.push({ x: a.x, z: a.z, color: a.kind === 'elevator' ? '#5ab8ff' : '#2fbf9f', size: 6 });
    for (const g of src.garages) if (within(g)) out.push({ x: g.x, z: g.z, color: '#d8b13a', size: 7 });
    for (const h of src.hiddenPads) if (within(h)) out.push({ x: h.x, z: h.z, color: '#b26bff', size: 6 });
    for (const h of this.hazards) if (within(h)) out.push({ x: h.x, z: h.z, color: '#ff9a2a', size: 7 });
    const threats: Array<{ x: number; z: number; what: string }> = [];
    for (const r of this.d.police.roadblocks()) threats.push({ ...r, what: 'ROADBLOCK' });
    for (const t of this.d.tanks.tanks) if (t.alive) threats.push({ x: t.x, z: t.z, what: 'TANK' });
    let warning = '';
    let best = Infinity;
    const fx = Math.cos(heading);
    const fz = -Math.sin(heading);
    for (const t of threats) {
      const dd = Math.hypot(t.x - x, t.z - z);
      if (dd > range) continue;
      out.push({ x: t.x, z: t.z, color: t.what === 'TANK' ? '#7a0f0f' : '#ff2a2a', size: t.what === 'TANK' ? 12 : 10 });
      const ahead = ((t.x - x) * fx + (t.z - z) * fz) / Math.max(1, dd) > Math.cos((70 * Math.PI) / 180);
      if (dd < best) {
        best = dd;
        warning = `${t.what} ${Math.round(dd / 10) * 10} m ${ahead ? 'AHEAD' : 'NEARBY'}`;
      }
    }
    return { markers: out, warning };
  }

  /**
   * A cloud of smoke at a point (heist crowd control): puffs scattered over `radius` that last
   * `life` seconds. Blocks police and tank sight like the Nitrous Smokescreen.
   */
  smokeCloud(x: number, y: number, z: number, radius: number, life: number, puffs = 18): void {
    for (let i = 0; i < puffs; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      this.addPuff(x + Math.cos(a) * r, y + 0.6 + Math.random() * 1.2, z + Math.sin(a) * r, 2.2 + Math.random() * 1.2, life * (0.7 + Math.random() * 0.3));
    }
  }

  // ------------------------------------------------------------------ internals

  private puffRadius(p: Puff): number {
    const k = p.age / p.life;
    // Billows out quickly, thins away at the end.
    return p.r * (0.55 + 0.6 * Math.min(1, p.age / 0.8)) * (k > 0.8 ? (1 - k) / 0.2 : 1);
  }

  private addPuff(x: number, y: number, z: number, r: number, life: number): void {
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    this.puffs.push({ x, y, z, r, age: 0, life });
  }

  private drawPuffs(): void {
    const n = Math.min(MAX_PUFFS, this.puffs.length);
    for (let i = 0; i < n; i++) {
      const p = this.puffs[i];
      const r = this.puffRadius(p);
      this.m.compose(this.v.set(p.x, p.y + p.age * 0.15, p.z), this.q.identity(), this.s.set(r, r * 0.8, r));
      this.puffMesh.setMatrixAt(i, this.m);
    }
    this.puffMesh.count = n;
    this.puffMesh.instanceMatrix.needsUpdate = true;
  }

  /** Exhaust flame at the back of a car. */
  private flame(car: Car, scale: number): void {
    const f = car.forward(this.tmp);
    const back = car.spec.length / 2 + 0.2;
    this.d.effects.muzzle(car.position.x - f.x * back, car.position.y + 0.1, car.position.z - f.z * back, scale);
  }

  private ring(x: number, y: number, z: number, radius: number, color: number): void {
    const r = this.rings.find((q) => !q.on) ?? this.rings[0];
    r.on = true;
    r.t = 0;
    r.radius = radius;
    r.mesh.position.set(x, y, z);
    r.mesh.visible = true;
    (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  /**
   * Shoves every car, person and wild Streetmon within `radius` away from `car`. Light police
   * cars can be flipped (when `flipMaxMass` > 0); police crews are staggered.
   */
  private shockwave(car: Car, radius: number, impulse: number, damage: number, stagger: number, lift: number, flipMaxMass: number, color: number, flipTorque = 0, pedKnock = 0): void {
    const c = car.position;
    this.ring(c.x, c.y + 0.4, c.z, radius, color);
    const policeCars = new Set(this.d.police.unitCars());
    const dazed: Car[] = [];
    for (const o of this.d.vehicles.cars) {
      if (o === car || o.disposed) continue;
      const dx = o.position.x - c.x;
      const dz = o.position.z - c.z;
      const dd = Math.hypot(dx, dz);
      if (dd > radius || dd < 0.01) continue;
      // Falls off with distance, but anything inside the ring still gets a real shove.
      const k = Math.max(0.3, 1 - dd / radius);
      const nx = dx / dd;
      const nz = dz / dd;
      const m = o.spec.mass;
      o.wake();
      o.body.applyImpulse({ x: nx * m * impulse * k, y: m * (lift || 1.2) * k, z: nz * m * impulse * k }, true);
      const isPolice = policeCars.has(o) || o.spec.style === 'police';
      if (flipMaxMass > 0 && isPolice && m <= flipMaxMass) {
        // Roll it over sideways, away from the blast: spin about its own long axis, with a hop.
        const f = o.forward(this.v).setY(0).normalize();
        // Rolling about +f moves the roof toward f x up (the car's right side).
        const rx = -f.z;
        const rz = f.x;
        const sgn = rx * nx + rz * nz >= 0 ? 1 : -1;
        const spin = flipTorque * 3.4 * Math.max(0.7, k);
        const lv = o.body.linvel();
        o.body.setLinvel({ x: lv.x, y: Math.max(lv.y, 5.5 * Math.max(0.7, k)), z: lv.z }, true);
        o.body.setAngvel({ x: f.x * spin * sgn, y: 0, z: f.z * spin * sgn }, true);
        o.tumbleFor = 1.6;
      }
      if (damage > 0) o.damage(damage * k, 'explosive');
      if (policeCars.has(o)) dazed.push(o);
    }
    if (dazed.length && stagger > 0) this.d.police.daze(dazed, stagger);
    // People get knocked off their feet (and everyone else runs).
    if (pedKnock > 0) {
      for (const p of this.d.peds.peds) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const dd = Math.hypot(dx, dz);
        if (dd > radius || p.state === 'dead') continue;
        this.d.peds.damage(p, 1, dx / (dd || 1), dz / (dd || 1), pedKnock);
      }
      this.d.peds.alarm(c.x, c.z, radius * 3);
    }
    for (const w of this.d.spawns.wild) {
      const dx = w.x - c.x;
      const dz = w.z - c.z;
      const dd = Math.hypot(dx, dz);
      if (dd > radius || w.removed) continue;
      const k = 1 - dd / radius;
      this.d.spawns.knockBack(w, (dx / (dd || 1)) * 7 * k, 3 * k, (dz / (dd || 1)) * 7 * k, c.x, c.z);
    }
  }

  private dropHazard(car: Car, ab: AbilityPayload): void {
    const P = ab.params as Record<string, number | string>;
    const max = Number(P.maxActive ?? 3);
    while (this.hazards.filter((h) => h.owner === car).length >= max) {
      const old = this.hazards.find((h) => h.owner === car)!;
      this.removeHazard(old);
    }
    const f = car.forward(this.tmp).setY(0).normalize();
    const back = car.spec.length / 2 + Number(P.behind ?? 4);
    const x = car.position.x - f.x * back;
    const z = car.position.z - f.z * back;
    const kind = P.hazard === 'oilSlick' ? 'oilSlick' : 'spikeStrip';
    const length = Number(P.length ?? 7);
    const width = Number(P.width ?? 1.6);
    const mesh = kind === 'spikeStrip' ? spikeStripMesh(length, width) : oilMesh(length, width);
    mesh.position.set(x, groundAt(x, z), z);
    mesh.rotation.y = Math.atan2(-f.z, f.x);
    this.d.scene.add(mesh);
    this.hazards.push({ kind, x, z, dx: f.x, dz: f.z, length, width, left: Number(P.life ?? 25), owner: car, params: P, mesh });
  }

  private removeHazard(h: Hazard): void {
    this.d.scene.remove(h.mesh);
    h.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.hazards.splice(this.hazards.indexOf(h), 1);
  }

  private updateHazards(dt: number): void {
    const mine = this.d.playerCar();
    for (const h of [...this.hazards]) {
      h.left -= dt;
      if (h.left <= 0) {
        this.removeHazard(h);
        continue;
      }
      const ownerIsMine = h.owner === mine;
      for (const c of this.d.vehicles.cars) {
        if (c === h.owner || c.disposed || c.destroyed) continue;
        if (c === mine && ownerIsMine) continue;
        const rx = c.position.x - h.x;
        const rz = c.position.z - h.z;
        if (Math.abs(rx) > 8 || Math.abs(rz) > 8) continue;
        const along = rx * h.dx + rz * h.dz;
        const across = rx * -h.dz + rz * h.dx;
        if (Math.abs(along) > h.width / 2 + c.spec.length * 0.35 || Math.abs(across) > h.length / 2 + c.spec.width * 0.3) continue;
        if (h.kind === 'spikeStrip') {
          if (c.tyresPopped) continue;
          // In a race (you or a racer): a slow leak for a few seconds, not a race-ending wreck.
          if (c === mine || this.d.isRacer?.(c)) {
            if (c.flatFor > 0) continue;
            c.flatFor = Number(h.params.raceFlatSeconds ?? 4.5);
            this.d.effects.sparks(c.position.x, 0.3, c.position.z, 16);
            audio.sfx('sfx_tyre_pop', c.position);
            if (c === mine) this.onPlayerHit?.('spikeStrip');
            continue;
          }
          c.tyresPopped = true;
          this.d.effects.sparks(c.position.x, 0.3, c.position.z, 16);
          audio.sfx('sfx_tyre_pop', c.position);
          this.d.police.daze([c], Number(h.params.staggerSeconds ?? 1.2));
        } else {
          c.slipFor = Math.max(c.slipFor, Number(h.params.seconds ?? 3));
        }
      }
    }
  }
}

/** Street surface height (cars only drive on the road, which is at 0). */
function groundAt(_x: number, _z: number): number {
  return 0.02;
}

function spikeStripMesh(length: number, width: number): THREE.Object3D {
  const g = new THREE.Group();
  // The strip lies across the direction of travel (local Z), spikes along its top.
  const base = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.05, length), withSurface(new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.7, metalness: 0.5 }), 'paintedMetal'));
  base.position.y = 0.025;
  g.add(base);
  const spike = new THREE.ConeGeometry(0.05, 0.16, 4);
  const mat = withSurface(new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.9, roughness: 0.3 }), 'bareMetal');
  const n = Math.floor(length / 0.35);
  const inst = new THREE.InstancedMesh(spike, mat, n * 2);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++)
    for (const s of [-1, 1]) {
      m.makeTranslation(s * width * 0.12, 0.13, -length / 2 + (i + 0.5) * (length / n));
      inst.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m);
    }
  g.add(inst);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(width * 0.52, 0.055, 0.25), withSurface(new THREE.MeshStandardMaterial({ color: 0xffd23f }), 'paintedMetal'));
  for (const z of [-length / 2 + 0.2, length / 2 - 0.2]) {
    const s = stripe.clone();
    s.position.set(0, 0.03, z);
    g.add(s);
  }
  return g;
}

function oilMesh(length: number, width: number): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.05, metalness: 0.8 }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(width * 1.5, length / 2, 1);
  return m;
}
