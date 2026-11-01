import * as THREE from 'three';
import { audio } from '../audio/Audio';
import type { RoadGraph, Axis } from '../traffic/RoadGraph';
import type { Signals } from '../traffic/Signals';
import { gaitFrequency, type HumanoidLook } from '../player/Humanoid';
import { damp, wrapAngle } from '../util/math';
import type { Car } from '../vehicles/Car';
import type { VehicleManager } from '../vehicles/VehicleManager';
import { CITY, rectContains, type CityLayout, type Rect } from '../world/CityLayout';
import { CrowdRenderer, randomLook } from './CrowdRenderer';

/**
 * 'cop' = moved by the police system (an officer on foot); 'script' = a civilian borrowed by
 * another system (an NPC hunt, a conversation): still a civilian (witnesses, panics, can be hit).
 */
type State = 'walk' | 'wait' | 'cross' | 'flee' | 'return' | 'fly' | 'down' | 'dead' | 'cop' | 'script';

/** Corners of a block's walking loop: 0 NW, 1 NE, 2 SE, 3 SW. */
type Corner = 0 | 1 | 2 | 3;

export interface Ped {
  role: 'civ' | 'cop' | 'gang';
  health: number;
  /** Standing on this floor rather than the street (the gang hideout, a sewer level). */
  floorY?: number;
  /** Seconds until an armed officer may fire again (police use). */
  shootCd: number;
  x: number;
  y: number;
  z: number;
  /** Scripted by a system (event scavengers...): never streamed out while alive. */
  pinned?: boolean;
  /** Who borrowed them while in the 'script' state ('hunt:<id>', 'talk'). */
  ctrl?: string | null;
  heading: number;
  speed: number;
  look: HumanoidLook;
  phase: number;
  blend: number;
  state: State;
  block: number;
  inset: number;
  corner: Corner;
  /** Where the ped is walking to (corner, crossing end, or flee point). */
  tx: number;
  tz: number;
  crossTo: { block: number; corner: Corner } | null;
  waitNode: number;
  waitAxis: Axis;
  walkSpeed: number;
  timer: number;
  vx: number;
  vy: number;
  vz: number;
  threatX: number;
  threatZ: number;
  /** Seconds since death, for clean-up. */
  deadFor: number;
}

export interface PedEvents {
  /** A car hit a pedestrian. */
  onPedHit(ped: Ped, byPlayer: boolean, killed: boolean): void;
  /** Someone died (any cause): drops are spawned from here. */
  onPedDied?(ped: Ped): void;
}

export interface PedRayHit {
  ped: Ped;
  /** Distance along the ray. */
  t: number;
  headshot: boolean;
}

const CORNER_OUT: Record<Corner, [number, number]> = { 0: [0, 3], 1: [0, 1], 2: [2, 1], 3: [2, 3] }; // outward dirs (N,E,S,W = 0..3)
const CORNER_NEXT: Record<Corner, [Corner, Corner]> = { 0: [1, 3], 1: [0, 2], 2: [1, 3], 3: [2, 0] };

/**
 * Pedestrians walk loops around block sidewalks, wait for the walk signal and cross at crosswalks,
 * scatter from danger, get hit by cars, and are streamed in around the player out of sight.
 */
export class PedestrianSystem {
  readonly peds: Ped[] = [];
  readonly crowd: CrowdRenderer;
  private readonly blockIJ: Array<{ i: number; j: number }>;
  private readonly blockAt = new Map<string, number>();
  private readonly buildingGrid = new Map<string, Rect[]>();
  private spawnTimer = 0;
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  private readonly invQ = new THREE.Quaternion();
  maxPeds = 55;
  radius = 120;
  /** Level of detail: beyond `activeRadius` people are moved every `liteEvery` frames, without car checks. */
  readonly lod = { activeRadius: 80, liteEvery: 3 };
  /** Last update: people in each tier. */
  readonly tiers = { active: 0, lite: 0 };
  private frameNo = 0;

  constructor(
    scene: THREE.Scene,
    private readonly layout: CityLayout,
    private readonly graph: RoadGraph,
    private readonly signals: Signals,
    private readonly vehicles: VehicleManager,
    private readonly events: PedEvents,
  ) {
    this.crowd = new CrowdRenderer(scene, 160);
    const L = layout;
    this.blockIJ = L.blocks.map((b) => {
      const i = L.aveX.findIndex((x) => Math.abs(x + CITY.aveWidth / 2 - b.x0) < 0.5);
      const j = L.streetZ.findIndex((z) => Math.abs(z + CITY.streetWidth / 2 - b.z0) < 0.5);
      return { i, j };
    });
    this.blockIJ.forEach((ij, k) => this.blockAt.set(`${ij.i},${ij.j}`, k));
    // Buildings and parking garages are both solid for people on foot.
    for (const rect of [...L.buildings.map((b) => b.rect), ...(L.garages ?? []).map((g) => g.rect)]) {
      for (let gx = Math.floor(rect.x0 / 20); gx <= Math.floor(rect.x1 / 20); gx++) {
        for (let gz = Math.floor(rect.z0 / 20); gz <= Math.floor(rect.z1 / 20); gz++) {
          const key = `${gx},${gz}`;
          let list = this.buildingGrid.get(key);
          if (!list) this.buildingGrid.set(key, (list = []));
          list.push(rect);
        }
      }
    }
  }

  // ------------------------------------------------------------------ geometry helpers

  private loopRect(block: number, inset: number): Rect {
    const b = this.layout.blocks[block];
    return { x0: b.x0 + inset, x1: b.x1 - inset, z0: b.z0 + inset, z1: b.z1 - inset };
  }

  private cornerPoint(block: number, inset: number, c: Corner): { x: number; z: number } {
    const r = this.loopRect(block, inset);
    return { x: c === 0 || c === 3 ? r.x0 : r.x1, z: c === 0 || c === 1 ? r.z0 : r.z1 };
  }

  /** Blocked for walking: inside a building, the park lake, or off the island. */
  blocked(x: number, z: number): boolean {
    const L = this.layout;
    if (!rectContains(L.land, x, z, -1.2)) return true;
    if (rectContains(L.parkLake, x, z, 0.8)) return true;
    const list = this.buildingGrid.get(`${Math.floor(x / 20)},${Math.floor(z / 20)}`);
    if (list) for (const r of list) if (rectContains(r, x, z, 0.35)) return true;
    return false;
  }

  /** Ground height: raised kerb level on sidewalks, the park and promenades; 0 on the road. */
  groundY(x: number, z: number): number {
    const L = this.layout;
    if (rectContains(L.park, x, z)) return 0.15;
    const outer =
      x < L.aveX[0] - CITY.aveWidth / 2 ||
      x > L.aveX[L.aveX.length - 1] + CITY.aveWidth / 2 ||
      z < L.streetZ[0] - CITY.streetWidth / 2 ||
      z > L.streetZ[L.streetZ.length - 1] + CITY.streetWidth / 2;
    if (outer) return 0.15;
    const i = this.blockIndexAt(x, z);
    return i >= 0 ? 0.15 : 0;
  }

  private blockIndexAt(x: number, z: number): number {
    const L = this.layout;
    let i = -1;
    for (let k = 0; k < L.aveX.length - 1; k++) if (x > L.aveX[k] && x < L.aveX[k + 1]) i = k;
    let j = -1;
    for (let k = 0; k < L.streetZ.length - 1; k++) if (z > L.streetZ[k] && z < L.streetZ[k + 1]) j = k;
    const b = this.blockAt.get(`${i},${j}`);
    if (b === undefined) return -1;
    return rectContains(L.blocks[b], x, z) ? b : -1;
  }

  private nodeAtCorner(block: number, c: Corner): number {
    const { i, j } = this.blockIJ[block];
    const ni = c === 1 || c === 2 ? i + 1 : i;
    const nj = c === 2 || c === 3 ? j + 1 : j;
    return this.graph.nodeAt(ni, nj)?.id ?? -1;
  }

  private neighbour(block: number, dir: number): number {
    const { i, j } = this.blockIJ[block];
    const di = dir === 1 ? 1 : dir === 3 ? -1 : 0;
    const dj = dir === 2 ? 1 : dir === 0 ? -1 : 0;
    return this.blockAt.get(`${i + di},${j + dj}`) ?? -1;
  }

  // ------------------------------------------------------------------ spawning

  private makePed(look: HumanoidLook, x: number, z: number): Ped {
    return {
      role: 'civ',
      health: 100,
      shootCd: 0,
      x,
      y: this.groundY(x, z),
      z,
      heading: Math.random() * Math.PI * 2,
      speed: 0,
      look,
      phase: Math.random() * 10,
      blend: 0,
      state: 'walk',
      block: -1,
      inset: 1.4 + Math.random() * 1.8,
      corner: 0,
      tx: x,
      tz: z,
      crossTo: null,
      waitNode: -1,
      waitAxis: 'ave',
      walkSpeed: 1.15 + Math.random() * 0.5,
      timer: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      threatX: 0,
      threatZ: 0,
      deadFor: 0,
    };
  }

  private spawnOnBlock(block: number): Ped {
    const ped = this.makePed(randomLook(), 0, 0);
    ped.block = block;
    const from = Math.floor(Math.random() * 4) as Corner;
    const to = CORNER_NEXT[from][Math.random() < 0.5 ? 0 : 1];
    const a = this.cornerPoint(block, ped.inset, from);
    const b = this.cornerPoint(block, ped.inset, to);
    const t = Math.random();
    ped.x = a.x + (b.x - a.x) * t;
    ped.z = a.z + (b.z - a.z) * t;
    ped.y = 0.15;
    ped.corner = to;
    ped.tx = b.x;
    ped.tz = b.z;
    ped.heading = Math.atan2(-(b.z - a.z), b.x - a.x);
    // Each neighbourhood dresses its own way (set by the game: Districts.ts).
    if (this.styleAt) ped.look = this.styleAt(ped.x, ped.z, ped.look);
    this.peds.push(ped);
    return ped;
  }

  /** Restyles a new passer-by for where they spawned (neighbourhood fashions). */
  styleAt: ((x: number, z: number, look: HumanoidLook) => HumanoidLook) | null = null;

  /** A driver bailing out or being dragged from a car: runs away from the threat. */
  spawnFleeing(x: number, z: number, look: HumanoidLook, threatX: number, threatZ: number): Ped {
    const ped = this.makePed(look, x, z);
    this.peds.push(ped);
    this.flee(ped, threatX, threatZ);
    return ped;
  }

  private stream(dt: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.35;
    for (let k = this.peds.length - 1; k >= 0; k--) {
      const p = this.peds[k];
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      const dead = p.state === 'dead';
      if ((p.role === 'cop' || p.pinned || p.state === 'script') && !dead) continue;
      if (d > this.radius + 40 || (dead && p.deadFor > 60) || (dead && p.deadFor > 25 && d > 50)) this.peds.splice(k, 1);
    }
    if (this.peds.length >= this.maxPeds) return;
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const near = this.blocksNear(focus);
    if (near.length === 0) return;
    for (let tries = 0; tries < 8 && this.peds.length < this.maxPeds; tries++) {
      const k = near[Math.floor(Math.random() * near.length)];
      const ped = this.spawnOnBlock(k);
      const pd = Math.hypot(ped.x - focus.x, ped.z - focus.z);
      // Never pop someone into view nearby.
      if (pd < 25 || (pd < 70 && this.frustum.containsPoint(this.tmp.set(ped.x, 1, ped.z)))) this.peds.pop();
    }
  }

  /** Initial population around the player. */
  populate(focus: THREE.Vector3): void {
    const near = this.blocksNear(focus);
    for (let tries = 0; tries < 400 && near.length && this.peds.length < this.maxPeds; tries++) {
      const ped = this.spawnOnBlock(near[Math.floor(Math.random() * near.length)]);
      if (Math.hypot(ped.x - focus.x, ped.z - focus.z) > this.radius) this.peds.pop();
    }
  }

  /** Blocks with any part of their sidewalk within the streaming radius. */
  private blocksNear(focus: THREE.Vector3): number[] {
    const out: number[] = [];
    this.layout.blocks.forEach((b, k) => {
      const cx = Math.max(b.x0, Math.min(b.x1, focus.x));
      const cz = Math.max(b.z0, Math.min(b.z1, focus.z));
      if (Math.hypot(cx - focus.x, cz - focus.z) < this.radius - 10) out.push(k);
    });
    return out;
  }

  // ------------------------------------------------------------------ behaviour

  /** Everyone near (x, z) panics and runs. */
  /**
   * Removes the civilians standing within `radius` of a point (the wardrobe: the world freezes while
   * it's open, and a frozen stranger beside you makes it unclear who you're dressing). Officers,
   * scripted and pinned people stay.
   */
  clearAround(x: number, z: number, radius: number): number {
    let n = 0;
    for (let k = this.peds.length - 1; k >= 0; k--) {
      const p = this.peds[k];
      if (p.role === 'cop' || p.pinned || p.state === 'script' || p.state === 'dead') continue;
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        this.peds.splice(k, 1);
        n++;
      }
    }
    return n;
  }

  alarm(x: number, z: number, radius: number): void {
    for (const p of this.peds) {
      if (p.state === 'dead' || p.state === 'fly' || p.state === 'down' || p.role === 'cop' || p.role === 'gang') continue;
      if (Math.hypot(p.x - x, p.z - z) < radius) this.flee(p, x, z);
    }
  }

  flee(p: Ped, tx: number, tz: number): void {
    p.state = 'flee';
    p.timer = 5 + Math.random() * 4;
    p.threatX = tx;
    p.threatZ = tz;
    p.crossTo = null;
  }

  private chooseAtCorner(p: Ped): void {
    // Direction of the leg just walked, to prefer carrying straight on.
    const options: Array<{ kind: 'edge' | 'cross'; to: Corner; dir: number; w: number }> = [];
    for (const c of CORNER_NEXT[p.corner]) options.push({ kind: 'edge', to: c, dir: -1, w: 1 });
    for (const dir of CORNER_OUT[p.corner]) {
      const nb = this.neighbour(p.block, dir);
      const node = this.nodeAtCorner(p.block, p.corner);
      if (nb < 0 || node < 0) continue;
      // Landing corner on the neighbour: mirror across the road.
      const flipZ = dir === 0 || dir === 2;
      const map: Record<Corner, Corner> = flipZ ? { 0: 3, 1: 2, 2: 1, 3: 0 } : { 0: 1, 1: 0, 2: 3, 3: 2 };
      options.push({ kind: 'cross', to: map[p.corner], dir, w: 0.9 });
    }
    const total = options.reduce((s, o) => s + o.w, 0);
    let r = Math.random() * total;
    let pick = options[0];
    for (const o of options) {
      r -= o.w;
      if (r <= 0) {
        pick = o;
        break;
      }
    }
    if (pick.kind === 'edge') {
      const pt = this.cornerPoint(p.block, p.inset, pick.to);
      p.corner = pick.to;
      p.tx = pt.x;
      p.tz = pt.z;
      p.state = 'walk';
    } else {
      const nb = this.neighbour(p.block, pick.dir);
      const node = this.nodeAtCorner(p.block, p.corner);
      p.crossTo = { block: nb, corner: pick.to };
      p.waitNode = node;
      // Walking north/south crosses a street; east/west crosses an avenue.
      p.waitAxis = pick.dir === 0 || pick.dir === 2 ? 'street' : 'ave';
      p.state = 'wait';
      p.timer = 0;
    }
  }

  private steer(p: Ped, dt: number, tx: number, tz: number, speed: number): number {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    const target = Math.atan2(-dz, dx);
    p.heading = wrapAngle(p.heading + wrapAngle(target - p.heading) * damp(8, dt));
    const step = Math.min(d, speed * dt);
    const nx = p.x + (dx / d) * step;
    const nz = p.z + (dz / d) * step;
    if (!this.blocked(nx, nz)) {
      p.x = nx;
      p.z = nz;
    }
    p.speed = step / Math.max(dt, 1e-4);
    return d;
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera, playerCar: Car | null): void {
    this.stream(dt, focus, camera);
    const cars = this.vehicles.cars;
    this.frameNo++;
    this.tiers.active = 0;
    this.tiers.lite = 0;
    const every = Math.max(1, this.lod.liteEvery);
    const fullDt = dt;

    for (let k = 0; k < this.peds.length; k++) {
      const p = this.peds[k];
      // Far from the player: a cheaper tick every few frames (no car checks).
      const far = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 > this.lod.activeRadius ** 2 && p.state !== 'fly';
      if (far) {
        this.tiers.lite++;
        if ((this.frameNo + k) % every !== 0) continue;
        dt = fullDt * every;
      } else {
        this.tiers.active++;
        dt = fullDt;
      }
      switch (p.state) {
        case 'walk': {
          const d = this.steer(p, dt, p.tx, p.tz, p.walkSpeed);
          if (d < 0.25) this.chooseAtCorner(p);
          break;
        }
        case 'wait': {
          p.speed = 0;
          p.timer += dt;
          if (this.signals.walk(p.waitNode, p.waitAxis) || p.timer > 40) {
            const c = p.crossTo!;
            const pt = this.cornerPoint(c.block, p.inset, c.corner);
            p.tx = pt.x;
            p.tz = pt.z;
            p.state = 'cross';
          }
          break;
        }
        case 'cross': {
          const d = this.steer(p, dt, p.tx, p.tz, p.walkSpeed * 1.15);
          if (d < 0.3 && p.crossTo) {
            p.block = p.crossTo.block;
            p.corner = p.crossTo.corner;
            p.crossTo = null;
            this.chooseAtCorner(p);
            // Don't immediately cross back.
            // chooseAtCorner may have changed the state (TypeScript can't see that).
            if ((p.state as State) === 'wait') {
              const pt = this.cornerPoint(p.block, p.inset, CORNER_NEXT[p.corner][0]);
              p.corner = CORNER_NEXT[p.corner][0];
              p.tx = pt.x;
              p.tz = pt.z;
              p.crossTo = null;
              p.state = 'walk';
            }
          }
          break;
        }
        case 'flee': {
          p.timer -= dt;
          let ax = p.x - p.threatX;
          let az = p.z - p.threatZ;
          const l = Math.hypot(ax, az) || 1;
          ax /= l;
          az /= l;
          // Run away; if a wall is in the way, try veering left or right.
          let moved = false;
          for (const turn of [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
            const c = Math.cos(turn);
            const s = Math.sin(turn);
            const dx = ax * c - az * s;
            const dz = ax * s + az * c;
            if (!this.blocked(p.x + dx * 1.2, p.z + dz * 1.2)) {
              this.steer(p, dt, p.x + dx * 3, p.z + dz * 3, 5.2);
              moved = true;
              break;
            }
          }
          if (!moved) p.speed = 0;
          if (p.timer <= 0) this.startReturn(p);
          break;
        }
        case 'return': {
          const d = this.steer(p, dt, p.tx, p.tz, p.walkSpeed);
          if (d < 0.3) this.chooseAtCorner(p);
          break;
        }
        case 'fly': {
          p.vy -= 9.81 * dt;
          const nx = p.x + p.vx * dt;
          const nz = p.z + p.vz * dt;
          if (!this.blocked(nx, nz)) {
            p.x = nx;
            p.z = nz;
          } else {
            p.vx *= -0.3;
            p.vz *= -0.3;
          }
          p.y += p.vy * dt;
          const gy = p.floorY ?? this.groundY(p.x, p.z);
          if (p.y <= gy) {
            p.y = gy;
            p.vx *= 0.35;
            p.vz *= 0.35;
            p.vy = 0;
            if (Math.hypot(p.vx, p.vz) < 0.5) {
              if (p.timer < 0) this.markDead(p);
              else p.state = 'down';
            }
          }
          break;
        }
        case 'down': {
          p.speed = 0;
          p.timer -= dt;
          if (p.timer <= 0) {
            if (p.role === 'cop') p.state = 'cop';
            else if (p.role === 'gang') p.state = 'script';
            else this.flee(p, p.threatX, p.threatZ);
          }
          break;
        }
        case 'cop':
        case 'script':
          break;
        case 'dead':
          p.deadFor += dt;
          p.speed = 0;
          break;
      }
      if (p.state !== 'fly') p.y += ((p.floorY ?? this.groundY(p.x, p.z)) - p.y) * damp(20, dt);

      // Gait.
      const moving = Math.min(1, p.speed / 1.2);
      p.blend += (moving - p.blend) * Math.min(1, dt * 8);
      p.phase += dt * gaitFrequency(p.speed) * Math.PI * 2 * (p.speed > 0.05 ? 1 : 0.12);

      if (!far && p.state !== 'dead' && p.state !== 'fly' && p.state !== 'down' && p.floorY === undefined) this.checkCars(p, cars, playerCar);
    }
  }

  /** Being run over, or jumping out of the way of a car mounting the sidewalk. */
  private checkCars(p: Ped, cars: readonly Car[], playerCar: Car | null): void {
    for (const car of cars) {
      const lv = car.body.linvel();
      const speed = Math.hypot(lv.x, lv.z);
      if (speed < 1.5) continue;
      const dx = p.x - car.position.x;
      const dz = p.z - car.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 144) continue;
      this.invQ.copy(car.quaternion).invert();
      const local = this.tmp.set(dx, p.y + 0.9 - car.position.y, dz).applyQuaternion(this.invQ);
      const ex = Math.max(0, Math.abs(local.x) - car.spec.length / 2);
      const ez = Math.max(0, Math.abs(local.z) - car.spec.width / 2);
      const dist = Math.hypot(ex, ez);
      const closing = (lv.x * dx + lv.z * dz) / Math.max(0.01, Math.sqrt(d2));
      if (dist < 0.4 && closing > 1) {
        const killed = closing > 7;
        p.state = 'fly';
        p.timer = killed ? -1 : 3;
        p.vx = lv.x * 0.85 + (dx / Math.sqrt(d2)) * 1.5;
        p.vz = lv.z * 0.85 + (dz / Math.sqrt(d2)) * 1.5;
        p.vy = 2 + closing * 0.25;
        p.threatX = car.position.x;
        p.threatZ = car.position.z;
        audio.thud();
        this.events.onPedHit(p, car === playerCar, killed);
        this.alarm(p.x, p.z, 18);
        return;
      }
      // Dodge a fast car heading for them (typically the player on the sidewalk).
      if (speed > 4 && dist < 6 && local.x > 0 && closing > 3 && p.y > 0.1 && p.role === 'civ') {
        this.flee(p, car.position.x, car.position.z);
        return;
      }
    }
  }

  /** Hands a borrowed ('script') civilian back to the crowd: they head back to their walk. */
  resume(p: Ped): void {
    p.ctrl = null;
    if (p.state === 'dead' || p.state === 'fly' || p.state === 'down') return;
    this.startReturn(p);
  }

  private startReturn(p: Ped): void {
    // Head for the nearest block's walking loop.
    const L = this.layout;
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < L.blocks.length; k++) {
      const b = L.blocks[k];
      const cx = Math.max(b.x0, Math.min(b.x1, p.x));
      const cz = Math.max(b.z0, Math.min(b.z1, p.z));
      const d = Math.hypot(cx - p.x, cz - p.z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best < 0) return;
    p.block = best;
    let bc: Corner = 0;
    let bd = Infinity;
    for (const c of [0, 1, 2, 3] as Corner[]) {
      const pt = this.cornerPoint(best, p.inset, c);
      const d = Math.hypot(pt.x - p.x, pt.z - p.z);
      if (d < bd) {
        bd = d;
        bc = c;
      }
    }
    const pt = this.cornerPoint(best, p.inset, bc);
    p.corner = bc;
    p.tx = pt.x;
    p.tz = pt.z;
    p.state = 'return';
  }

  /** Positions of standing pedestrians, for drivers to brake for. */
  obstacles(): Ped[] {
    return this.peds.filter((p) => p.state !== 'dead');
  }

  /** Nudge pedestrians out of the walking player's way. */
  separateFrom(x: number, z: number, radius: number): void {
    for (const p of this.peds) {
      if (p.state === 'dead' || p.state === 'fly') continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < radius) {
        const push = radius - d;
        const nx = p.x + (dx / d) * push;
        const nz = p.z + (dz / d) * push;
        if (!this.blocked(nx, nz)) {
          p.x = nx;
          p.z = nz;
        }
      }
    }
  }

  /** Adds a scripted person (a gang member, an officer at a gang fight): moved by its own system. */
  spawnScripted(x: number, z: number, look: HumanoidLook, heading: number, role: Ped['role'], ctrl: string, floorY?: number): Ped {
    const p = this.makePed(look, x, z);
    p.role = role;
    p.state = 'script';
    p.ctrl = ctrl;
    p.pinned = true;
    p.health = role === 'cop' ? 130 : 100;
    p.heading = heading;
    p.walkSpeed = 4.2;
    p.floorY = floorY;
    if (floorY !== undefined) p.y = floorY;
    this.peds.push(p);
    return p;
  }

  /** Adds an officer on foot (controlled by the police system). */
  spawnOfficer(x: number, z: number, look: HumanoidLook, heading: number): Ped {
    const p = this.makePed(look, x, z);
    p.role = 'cop';
    p.state = 'cop';
    p.health = 130;
    p.heading = heading;
    p.walkSpeed = 5.4;
    this.peds.push(p);
    return p;
  }

  private markDead(p: Ped): void {
    if (p.state === 'dead') return;
    p.state = 'dead';
    p.health = 0;
    p.speed = 0;
    this.events.onPedDied?.(p);
  }

  /**
   * Weapon damage. `dirX/dirZ` is the direction the hit travels; `knock` is how hard it shoves
   * (shotguns and bats knock people off their feet). Returns true if this killed them.
   */
  damage(p: Ped, amount: number, dirX: number, dirZ: number, knock: number): boolean {
    if (p.state === 'dead' || amount <= 0) return false;
    p.health -= amount;
    p.threatX = p.x - dirX * 10;
    p.threatZ = p.z - dirZ * 10;
    const len = Math.hypot(dirX, dirZ) || 1;
    if (p.health <= 0) {
      if (knock >= 3) {
        p.state = 'fly';
        p.timer = -1;
        p.vx = (dirX / len) * knock * 0.7;
        p.vz = (dirZ / len) * knock * 0.7;
        p.vy = 1.5;
      } else this.markDead(p);
      return true;
    }
    if (knock >= 6) {
      p.state = 'fly';
      p.timer = 2;
      p.vx = (dirX / len) * knock * 0.6;
      p.vz = (dirZ / len) * knock * 0.6;
      p.vy = 1.5;
    } else if (p.role === 'civ' && p.state !== 'fly' && p.state !== 'down') {
      this.flee(p, p.threatX, p.threatZ);
    }
    return false;
  }

  /**
   * First person hit by a ray (bullets). Standing people are vertical capsules, people on the ground
   * are low spheres. Returns null if nobody is within `maxT`.
   */
  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): PedRayHit | null {
    let best: PedRayHit | null = null;
    for (const p of this.peds) {
      if (p.state === 'dead') continue;
      // Quick reject: distance from the ray to the person's centre column.
      const cx = p.x - ox;
      const cz = p.z - oz;
      const along = cx * dx + cz * dz;
      if (along < -1 || along > maxT + 1) continue;
      let hit: { t: number; y: number } | null;
      if (p.state === 'down' || p.state === 'fly') {
        hit = raySphere(ox, oy, oz, dx, dy, dz, p.x, p.y + 0.3, p.z, 0.5);
      } else {
        hit = rayCapsule(ox, oy, oz, dx, dy, dz, p.x, p.y + 0.3, p.z, p.y + 1.55, 0.3);
      }
      if (!hit || hit.t > maxT) continue;
      if (!best || hit.t < best.t) best = { ped: p, t: hit.t, headshot: hit.y - p.y > 1.48 && p.state !== 'down' };
    }
    return best;
  }

  removePed(p: Ped): void {
    const i = this.peds.indexOf(p);
    if (i >= 0) this.peds.splice(i, 1);
  }

  /**
   * Moves a ped toward (tx, tz) at `speed`, sliding around walls. Returns the remaining distance.
   * Used by the police for officers on foot.
   */
  moveToward(p: Ped, dt: number, tx: number, tz: number, speed: number): number {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) {
      p.speed = 0;
      return d;
    }
    const ux = dx / d;
    const uz = dz / d;
    const step = Math.min(d, speed * dt);
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const vx = ux * c - uz * s;
      const vz = ux * s + uz * c;
      const nx = p.x + vx * step;
      const nz = p.z + vz * step;
      if (this.blocked(nx + vx * 0.3, nz + vz * 0.3)) continue;
      p.x = nx;
      p.z = nz;
      const target = Math.atan2(-vz, vx);
      p.heading = wrapAngle(p.heading + wrapAngle(target - p.heading) * damp(10, dt));
      p.speed = step / Math.max(dt, 1e-4);
      return d;
    }
    p.speed = 0;
    return d;
  }

  /** Civilians within `radius` who could see something happen there. */
  witnesses(x: number, z: number, radius: number): number {
    let n = 0;
    for (const p of this.peds) {
      if (p.role !== 'civ' || p.state === 'dead' || p.state === 'fly' || p.state === 'down') continue;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < radius * radius) n++;
    }
    return n;
  }

  /** Draws the crowd plus any seated drivers. */
  render(drivers: Array<{ car: Car; look: HumanoidLook; passenger?: boolean }>): void {
    const c = this.crowd;
    c.begin();
    for (const p of this.peds) {
      const pose = p.state === 'dead' || p.state === 'down' ? 'lie' : p.state === 'fly' ? 'air' : 'walk';
      c.add(p.x, p.y, p.z, p.heading, p.look, pose, p.phase, p.blend, p.speed);
    }
    for (const d of drivers) {
      const root = d.car.visual.root;
      root.updateMatrixWorld();
      const s = d.car.visual.seat;
      c.add(s.x, s.y, d.passenger ? -s.z : s.z, 0, d.look, 'sit', 0, 0, 0, root.matrixWorld);
    }
    c.end();
  }
}

/** Ray vs sphere: nearest hit distance and hit height, or null. Direction must be normalised. */
function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): { t: number; y: number } | null {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tc = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  if (d2 > r * r) return null;
  const t = tc - Math.sqrt(r * r - d2);
  if (t < 0) return null;
  return { t, y: oy + dy * t };
}

/** Ray vs vertical capsule (axis from y0 to y1 at x/z). */
function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, x: number, y0: number, z: number, y1: number, r: number): { t: number; y: number } | null {
  // Infinite vertical cylinder first (2D circle test in XZ).
  const fx = ox - x;
  const fz = oz - z;
  const a = dx * dx + dz * dz;
  if (a > 1e-8) {
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t >= 0) {
        const y = oy + dy * t;
        if (y >= y0 && y <= y1) return { t, y };
      }
    }
  }
  // End caps (spheres).
  const top = raySphere(ox, oy, oz, dx, dy, dz, x, y1, z, r);
  const bottom = raySphere(ox, oy, oz, dx, dy, dz, x, y0, z, r);
  if (top && bottom) return top.t < bottom.t ? top : bottom;
  return top ?? bottom;
}
