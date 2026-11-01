import * as THREE from 'three';
import { audio } from '../audio/Audio';
import type { Biome, District, SpeciesSpec } from '../creatures/Data';
import type { Follower } from '../creatures/Follower';
import type { SpawnSystem, WildCreature } from '../creatures/SpawnSystem';
import type { Effects } from '../fx/Effects';
import { randomLook } from '../peds/CrowdRenderer';
import type { Ped, PedestrianSystem } from '../peds/PedestrianSystem';
import type { HumanoidLook } from '../player/Humanoid';
import type { PoliceSystem } from '../police/PoliceSystem';
import { markBloom } from '../render/SelectiveBloom';
import { withSurface } from '../render/Surfaces';
import { DIR_HEADING, type Point, type RoadGraph } from '../traffic/RoadGraph';
import type { Car } from '../vehicles/Car';
import { getSpec } from '../vehicles/specs';
import type { VehicleManager } from '../vehicles/VehicleManager';
import { makeSoftParticle } from '../world/Textures';

/**
 * The world side of street events (see streetEventManager.js): builds each event's props, NPCs
 * and vehicles, runs them every frame, reports progress to the manager, and removes every last
 * piece at cleanup.
 *
 *   armoredTruck  An armored van (extra plating, an amber beacon, heavy armour multiplier) drives
 *                 a road route from one bank depot to another with guards aboard. Ramming,
 *                 explosions, tuned-car abilities or your summoned Streetmon (it goes for the truck
 *                 when you're on foot nearby) wear it down; at `disableAt` health it grinds to a
 *                 halt, the rear doors burst and cash bundles spill out, and the guards bail out
 *                 shooting. Destroying it outright scorches some of the cash. If it reaches the
 *                 destination depot, it's gone.
 *   turfOutbreak  A pulsing red quarantine ring and a swarm of aggressive wild Streetmon (from the
 *                 district's own spawn table, a few levels above your team). They fight you on
 *                 sight; knock out, catch or scare off every one before the police lockdown.
 *   airdrop       A crate on a parachute falls onto the zone with a smoke flare burning beside it.
 *                 Scavengers run in from the surrounding streets and pry it open if you let them;
 *                 a police unit parked on it confiscates it; a rival crew arrives at the ETA. Walk
 *                 up and hold E to open it first.
 */

export interface EventWorldDeps {
  scene: THREE.Scene;
  effects: Effects;
  vehicles: VehicleManager;
  graph: RoadGraph;
  peds: PedestrianSystem;
  spawns: SpawnSystem;
  follower: Follower;
  police: PoliceSystem;
  groundY(x: number, z: number): number;
  blocked(x: number, z: number): boolean;
  player(): { pos: THREE.Vector3; vehicle: Car | null; layer: Biome; dead: boolean };
  partyLevel(): number;
  pickSpecies(district: District, types: readonly string[]): SpeciesSpec | null;
  damagePlayer(amount: number, cause: string): void;
  earn(n: number): void;
  listener(): THREE.Vector3;
}

/** What the manager passes in (see streetEventManager.js). */
export interface EventInstance {
  uid: number;
  id: string;
  type: 'armoredTruck' | 'turfOutbreak' | 'airdrop';
  // The event definition from street_events.json.
  def: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  zone: { id: string; x: number; y?: number; z: number; district: string; layer?: string; halfLength?: number };
  destination: { id: string; x: number; z: number } | null;
  state: string;
  stateTime: number;
  seed: number;
  outcome: string | null;
}

export interface TickResult {
  phase?: 'spawning' | 'active';
  pos?: { x: number; z: number };
  progress?: number;
  objective?: string;
  engaged?: boolean;
  outcome?: 'completed' | 'failed' | null;
  reason?: string;
  earned?: number;
}

interface Bundle {
  mesh: THREE.Object3D;
  value: number;
  taken: boolean;
  phase: number;
}

interface Scripted {
  ped: Ped;
  /** Fire / punch cooldown. */
  cd: number;
  startHealth: number;
}

interface TruckEvt {
  kind: 'truck';
  car: Car;
  path: Array<Point & { vmax: number }>;
  wp: number;
  stuck: number;
  reverseFor: number;
  reverseSteer: number;
  startHealth: number;
  extras: THREE.Object3D[];
  beacon: THREE.Mesh;
  doors: THREE.Group;
  guardLooks: HumanoidLook[];
  guards: Scripted[];
  bundles: Bundle[];
  disabledAt: number | null;
  earned: number;
  engaged: boolean;
  arrived: boolean;
  streetmonOn: boolean;
}

interface OutbreakEvt {
  kind: 'outbreak';
  ring: THREE.Mesh;
  creatures: WildCreature[];
  total: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  engaged: boolean;
}

interface Particle {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
}

interface DropEvt {
  kind: 'drop';
  x: number;
  y: number;
  z: number;
  layer: Biome;
  crate: THREE.Group;
  lid: THREE.Object3D;
  chute: THREE.Group;
  flare: THREE.Mesh;
  smoke: Particle[];
  smokeColor: THREE.Color;
  landed: boolean;
  fallT: number;
  chuteT: number;
  scavengers: Scripted[];
  scavLeft: number;
  pryT: number;
  pryBy: Scripted | null;
  copT: number;
  openT: number;
  opening: boolean;
  opened: boolean;
  engaged: boolean;
}

type Handle = TruckEvt | OutbreakEvt | DropEvt;

const GUARD_LOOK = (rand: () => number): HumanoidLook => ({ ...randomLook(rand), top: '#2c3b55', legs: '#1b2230', shoes: '#111111', hair: '#1a1a1a', skirt: false });
const SCAV_LOOK = (rand: () => number): HumanoidLook => ({ ...randomLook(rand), top: rand() < 0.5 ? '#6b1f1f' : '#2f2f2f', legs: '#24262b', skirt: false });

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const range = (r: number[], rand: () => number): number => r[0] + (r[1] - r[0]) * rand();
const rangeInt = (r: number[], rand: () => number): number => Math.floor(r[0] + (r[1] - r[0] + 1) * rand());
const clock = (s: number): string => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export class EventWorld {
  private readonly handles = new Map<number, Handle>();
  private readonly tmp = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly invQ = new THREE.Quaternion();
  private readonly mats = {
    plate: withSurface(new THREE.MeshStandardMaterial({ color: 0x5b6157, roughness: 0.45, metalness: 0.7 }), 'paintedMetal'),
    beacon: new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xff9000, emissiveIntensity: 3.2 }),
    door: withSurface(new THREE.MeshStandardMaterial({ color: 0x4a5246, roughness: 0.5, metalness: 0.6 }), 'paintedMetal'),
    cash: withSurface(new THREE.MeshStandardMaterial({ color: 0x4f8a45, roughness: 0.8 }), 'paper'),
    band: withSurface(new THREE.MeshStandardMaterial({ color: 0xe6dcb5, roughness: 0.7 }), 'paper'),
    ring: new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    crateMil: withSurface(new THREE.MeshStandardMaterial({ color: 0x4b5a35, roughness: 0.6, metalness: 0.4 }), 'paintedMetal'),
    crateGang: withSurface(new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.55, metalness: 0.5 }), 'paintedMetal'),
    strap: withSurface(new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.85 }), 'fabric'),
    canopy: withSurface(new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9, side: THREE.DoubleSide }), 'fabric'),
    line: new THREE.MeshBasicMaterial({ color: 0x333333 }),
  };
  private readonly geo = {
    bundle: new THREE.BoxGeometry(0.32, 0.12, 0.18),
    band: new THREE.BoxGeometry(0.06, 0.125, 0.185),
  };
  private particleTex: THREE.Texture | null = null;
  private time = 0;

  constructor(private readonly d: EventWorldDeps) {}

  // ------------------------------------------------------------------ adapter: spawn / tick / cleanup

  /** Builds an event in the world. False if it can't (no route, nowhere to stand). */
  spawn(inst: EventInstance): boolean {
    const h = inst.type === 'armoredTruck' ? this.spawnTruck(inst) : inst.type === 'turfOutbreak' ? this.spawnOutbreak(inst) : this.spawnDrop(inst);
    if (!h) return false;
    this.handles.set(inst.uid, h);
    return true;
  }

  tick(inst: EventInstance, dt: number): TickResult {
    const h = this.handles.get(inst.uid);
    if (!h) return { outcome: 'failed', reason: 'lost' };
    this.time += dt / Math.max(1, this.handles.size);
    // After the event is decided: keep things ticking (cash still collectable, smoke still rising).
    const over = inst.state === 'COMPLETED' || inst.state === 'EXPIRED';
    if (h.kind === 'truck') return this.tickTruck(inst, h, dt, over);
    if (h.kind === 'outbreak') return this.tickOutbreak(inst, h, dt, over);
    return this.tickDrop(inst, h, dt, over);
  }

  /** Removes everything an event put into the world. */
  cleanup(inst: EventInstance): void {
    const h = this.handles.get(inst.uid);
    if (!h) return;
    this.handles.delete(inst.uid);
    if (h.kind === 'truck') {
      for (const b of h.bundles) this.d.scene.remove(b.mesh);
      for (const g of h.guards) this.d.peds.removePed(g.ped);
      for (const e of h.extras) e.removeFromParent();
      if (h.streetmonOn) this.releaseFollower();
      const p = this.d.player();
      // The player drove off in it: it's theirs now, otherwise the wreck goes.
      if (p.vehicle === h.car) this.d.vehicles.owned.delete(h.car);
      else this.d.vehicles.remove(h.car);
    } else if (h.kind === 'outbreak') {
      this.d.scene.remove(h.ring);
      h.ring.geometry.dispose();
      for (const w of h.creatures) {
        w.eventTag = undefined;
        // Mid-battle ones finish their fight; the rest slip away.
        if (!w.removed && w.state !== 'engaged' && !w.pinned) this.d.spawns.remove(w);
      }
    } else {
      this.d.scene.remove(h.crate, h.chute, h.flare);
      for (const p of h.smoke) {
        this.d.scene.remove(p.sprite);
        p.sprite.material.dispose();
      }
      for (const s of h.scavengers) this.d.peds.removePed(s.ped);
    }
  }

  /** Drivers to draw in the armored trucks (guards in uniform). */
  seated(): Array<{ car: Car; look: HumanoidLook; passenger?: boolean }> {
    const out: Array<{ car: Car; look: HumanoidLook; passenger?: boolean }> = [];
    for (const h of this.handles.values()) {
      if (h.kind !== 'truck' || h.disabledAt !== null || h.car.destroyed || this.d.player().vehicle === h.car) continue;
      out.push({ car: h.car, look: h.guardLooks[0] });
      if (h.guardLooks[1]) out.push({ car: h.car, look: h.guardLooks[1], passenger: true });
    }
    return out;
  }

  /** The truck an event drives (so the game can keep traffic and streaming off it). */
  isEventCar(car: Car): boolean {
    for (const h of this.handles.values()) if (h.kind === 'truck' && h.car === car) return true;
    return false;
  }

  /** On-screen prompt for the player (or null). */
  prompt(): string | null {
    const h = this.nearCrate();
    if (!h) return null;
    return h.opening ? 'Opening the crate... stay close' : 'E  Open the supply crate';
  }

  /** E pressed on foot: start opening a crate in reach. True if it used the key. */
  interact(): boolean {
    const h = this.nearCrate();
    if (!h || h.opening) return false;
    h.opening = true;
    h.engaged = true;
    audio.door();
    return true;
  }

  private nearCrate(): DropEvt | null {
    const p = this.d.player();
    if (p.vehicle || p.dead) return null;
    for (const h of this.handles.values()) {
      if (h.kind !== 'drop' || !h.landed || h.opened) continue;
      if (Math.hypot(p.pos.x - h.x, p.pos.z - h.z) < 2.4 && Math.abs(p.pos.y - h.y) < 2.2) return h;
    }
    return null;
  }

  // ------------------------------------------------------------------ armored truck

  private spawnTruck(inst: EventInstance): TruckEvt | null {
    const G = this.d.graph;
    const T = inst.def.truck;
    const rand = rng(inst.seed);
    const dest = inst.destination;
    if (!dest) return null;
    const start = G.nearestNode(inst.zone.x, inst.zone.z);
    const end = G.nearestNode(dest.x, dest.z);
    const route = G.route(start.id, end.id);
    if (route.length < 3) return null;
    const d0 = G.dirBetween(route[0], route[1]);
    if (d0 === -1) return null;
    const n1 = G.node(route[1]);
    const segLen = Math.hypot(n1.x - start.x, n1.z - start.z);
    const p0 = G.lanePoint(n1, d0, 0, -Math.min(45, segLen * 0.55));
    const spec = getSpec(T.vehicle);
    // Not on top of another car.
    if (this.d.vehicles.cars.some((c) => Math.hypot(c.position.x - p0.x, c.position.z - p0.z) < 7)) return null;
    const car = this.d.vehicles.spawn(spec, p0.x, p0.z, DIR_HEADING[d0], T.color);
    car.driver = 'ai';
    car.setLayer('event', { armor: T.armor });
    car.setMass(spec.mass * (T.massMult ?? 1));
    this.d.vehicles.owned.add(car);
    const path = G.routeWaypoints(route.slice(1), d0, 0, car.topSpeed, 9);
    // Armour plating along the sides, a roof beacon, rear doors that burst open.
    const extras: THREE.Object3D[] = [];
    const L = spec.length;
    const W = spec.width;
    const H = spec.height;
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(L * 0.62, H * 0.42, 0.06), this.mats.plate);
      plate.position.set(-L * 0.06, H * 0.55, (s * W) / 2 + s * 0.03);
      plate.castShadow = true;
      car.visual.body.add(plate);
      extras.push(plate);
    }
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10), this.mats.beacon);
    beacon.position.set(-L * 0.05, H + 0.1, 0);
    markBloom(beacon);
    car.visual.body.add(beacon);
    extras.push(beacon);
    const doors = new THREE.Group();
    doors.position.set(-L / 2 - 0.02, H * 0.55, 0);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.z = (s * W) / 2;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, H * 0.7, W / 2 - 0.04), this.mats.door);
      door.position.z = (-s * (W / 2 - 0.04)) / 2;
      pivot.add(door);
      pivot.userData.side = s;
      doors.add(pivot);
    }
    car.visual.body.add(doors);
    extras.push(doors);
    return {
      kind: 'truck',
      car,
      path,
      wp: 0,
      stuck: 0,
      reverseFor: 0,
      reverseSteer: 1,
      startHealth: car.health,
      extras,
      beacon,
      doors,
      guardLooks: Array.from({ length: Math.max(1, T.guards) }, () => GUARD_LOOK(rand)),
      guards: [],
      bundles: [],
      disabledAt: null,
      earned: 0,
      engaged: false,
      arrived: false,
      streetmonOn: false,
    };
  }

  private tickTruck(inst: EventInstance, h: TruckEvt, dt: number, over: boolean): TickResult {
    const T = inst.def.truck;
    const car = h.car;
    const p = this.d.player();
    const pos = car.position;
    // Beacon blinks; rear doors swing once it's been cracked open.
    (this.mats.beacon as THREE.MeshStandardMaterial).emissiveIntensity = h.disabledAt === null ? (Math.sin(this.time * 9) > 0 ? 3.4 : 0.4) : 0.3;
    if (h.disabledAt !== null) for (const pv of h.doors.children) pv.rotation.y = THREE.MathUtils.lerp(pv.rotation.y, (pv.userData.side as number) * 1.7, Math.min(1, dt * 5));
    // Damage taken = the player's doing (ramming, explosions, abilities, Streetmon).
    if (!h.engaged && car.health < h.startHealth * 0.97) h.engaged = true;
    const disabled = h.disabledAt !== null;
    if (!disabled && (car.destroyed || car.health01 <= T.disableAt)) this.disableTruck(inst, h);
    // Driving (or sitting dead in the road).
    if (h.disabledAt === null && !over && p.vehicle !== car) this.driveTruck(h, dt, h.engaged ? T.fleePace : T.cruisePace);
    else if (p.vehicle !== car && !car.destroyed) {
      car.input.throttle = 0;
      car.input.brake = 1;
      car.input.steer = 0;
    }
    // Your Streetmon goes for it when you're on foot nearby.
    this.streetmonAttack(h, T.streetmonDps ?? 20, dt, over);
    // Guards: keep firing at you while they're up.
    for (const g of h.guards) this.guardAI(g, T, dt);
    if (h.guards.some((g) => g.ped.health < g.startHealth)) h.engaged = true;
    // Cash bundles.
    const total = h.bundles.length;
    h.earned += this.collect(h.bundles, dt);
    const left = h.bundles.filter((b) => !b.taken).length;
    if (over) return { pos: { x: pos.x, z: pos.z }, earned: h.earned };
    // Made it to the vault.
    if (h.disabledAt === null && h.wp >= h.path.length) return { outcome: 'failed', reason: 'The truck made it to the vault' };
    if (h.disabledAt === null) {
      const k = THREE.MathUtils.clamp(1 - (car.health01 - T.disableAt) / (1 - T.disableAt), 0, 1);
      return { phase: 'active', pos: { x: pos.x, z: pos.z }, progress: k, objective: `Stop the armored truck (${Math.round(k * 100)}%)`, engaged: h.engaged };
    }
    const since = inst.stateTime - h.disabledAt;
    const window = T.collectSeconds ?? 70;
    const res: TickResult = {
      phase: 'active',
      pos: { x: pos.x, z: pos.z },
      progress: total ? (total - left) / total : 1,
      objective: `Grab the cash: ${total - left}/${total} bundles · $${h.earned.toLocaleString('en-US')} · ${clock(window - since)}`,
      engaged: true,
      earned: h.earned,
    };
    if (left === 0) res.outcome = 'completed';
    else if (since >= window) {
      if (h.earned > 0) res.outcome = 'completed';
      else {
        res.outcome = 'failed';
        res.reason = 'The cash was lost';
      }
    }
    return res;
  }

  private disableTruck(inst: EventInstance, h: TruckEvt): void {
    const T = inst.def.truck;
    const rand = rng(inst.seed + 99);
    const car = h.car;
    h.disabledAt = inst.stateTime;
    h.engaged = true;
    car.input.throttle = 0;
    car.input.brake = 1;
    const pos = car.position.clone();
    const f = car.forward(this.fwd).clone().setY(0).normalize();
    const side = new THREE.Vector3(-f.z, 0, f.x);
    const burnt = car.destroyed;
    // Cash spills out of the back (scattered and partly burnt if it blew up).
    const n = rangeInt(T.bundles, rand);
    const rear = pos.clone().addScaledVector(f, -(car.spec.length / 2 + 0.6));
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 8; tries++) {
        const a = rand() * Math.PI * 2;
        const r = (burnt ? 2 : 0.8) + rand() * (burnt ? 6 : 3.2);
        const x = rear.x + Math.cos(a) * r;
        const z = rear.z + Math.sin(a) * r;
        if (this.d.blocked(x, z) && tries < 7) continue;
        const value = Math.round((range(T.bundleValue, rand) * (burnt && rand() < 0.5 ? 0.5 : 1)) / 10) * 10;
        h.bundles.push(this.makeBundle(x, this.d.groundY(x, z), z, value));
        break;
      }
    }
    this.d.effects.sparks(rear.x, rear.y + 1, rear.z, 24);
    audio.crash(0.6, rear);
    // The guards bail out, guns drawn.
    if (!burnt)
      h.guardLooks.forEach((look, i) => {
        const s = i % 2 ? 1 : -1;
        const gp = pos.clone().addScaledVector(side, s * (car.spec.width / 2 + 0.9)).addScaledVector(f, (i >> 1) * -1.5);
        const ped = this.d.peds.spawnOfficer(gp.x, gp.z, look, car.heading);
        ped.health = T.guardHealth ?? 110;
        ped.y = this.d.groundY(gp.x, gp.z);
        h.guards.push({ ped, cd: 0.8 + i * 0.4, startHealth: ped.health });
      });
    h.guardLooks.length = 0;
  }

  /** Pure pursuit along the route (the race AI's driving, without ramps). */
  private driveTruck(h: TruckEvt, dt: number, pace: number): void {
    const car = h.car;
    const pos = car.position;
    const v = car.speed;
    const f = car.forward(this.fwd);
    if (car.flippedTime > 2) {
      car.flipUpright();
      return;
    }
    while (h.wp < h.path.length) {
      const w = h.path[h.wp];
      const dx = w.x - pos.x;
      const dz = w.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4 || (dx * f.x + dz * f.z < 0 && dist < 25)) h.wp++;
      else break;
    }
    if (h.wp >= h.path.length) {
      car.input.throttle = 0;
      car.input.brake = 1;
      car.input.steer = 0;
      return;
    }
    if (h.reverseFor > 0) {
      h.reverseFor -= dt;
      car.input.throttle = 0;
      car.input.brake = 1;
      car.input.steer = h.reverseSteer;
      return;
    }
    h.stuck = Math.abs(v) < 1 ? h.stuck + dt : 0;
    if (h.stuck > 2.5) {
      h.stuck = 0;
      h.reverseFor = 1.4;
      h.reverseSteer = -h.reverseSteer;
    }
    const look = Math.min(24, Math.max(7, 6 + Math.abs(v) * 0.55));
    let target: Point = h.path[h.path.length - 1];
    let acc = 0;
    let px = pos.x;
    let pz = pos.z;
    for (let i = h.wp; i < h.path.length; i++) {
      const w = h.path[i];
      const seg = Math.hypot(w.x - px, w.z - pz);
      if (acc + seg >= look) {
        const t = (look - acc) / Math.max(seg, 1e-3);
        target = { x: px + (w.x - px) * t, z: pz + (w.z - pz) * t };
        break;
      }
      acc += seg;
      px = w.x;
      pz = w.z;
    }
    // Brake for whatever's in front (it doesn't stop for you if you're in its way and it's fleeing).
    this.invQ.copy(car.quaternion).invert();
    let gap = Infinity;
    for (const c of this.d.vehicles.cars) {
      if (c === car) continue;
      const dx = c.position.x - pos.x;
      const dz = c.position.z - pos.z;
      if (dx * dx + dz * dz > 40 * 40) continue;
      const local = this.tmp.set(dx, 0, dz).applyQuaternion(this.invQ);
      if (local.x < 0 || Math.abs(local.z) > 2.4) continue;
      gap = Math.min(gap, local.x - car.spec.length / 2 - c.spec.length / 2);
    }
    const tx = target.x - pos.x;
    const tz = target.z - pos.z;
    let alpha = Math.atan2(-tz, tx) - car.heading;
    while (alpha > Math.PI) alpha -= Math.PI * 2;
    while (alpha < -Math.PI) alpha += Math.PI * 2;
    const Ld = Math.max(1, Math.hypot(tx, tz));
    const delta = Math.atan2(2 * car.spec.wheelBase * Math.sin(alpha), Ld);
    car.input.steer = Math.max(-1, Math.min(1, -delta / car.maxSteerAt(v)));
    let vTarget = car.topSpeed * pace;
    acc = 0;
    px = pos.x;
    pz = pos.z;
    for (let i = h.wp; i < h.path.length && acc < 80; i++) {
      const w = h.path[i];
      acc += Math.hypot(w.x - px, w.z - pz);
      px = w.x;
      pz = w.z;
      vTarget = Math.min(vTarget, Math.sqrt(w.vmax * w.vmax * pace + 2 * 5.5 * acc));
    }
    if (gap < 50 && pace < 0.7) vTarget = Math.min(vTarget, Math.max(0, Math.sqrt(2 * 6 * Math.max(0, gap - 3))));
    const err = vTarget - v;
    car.input.throttle = err > 0 ? Math.min(1, err * 0.5 + 0.3) : 0;
    car.input.brake = err < -1.5 ? Math.min(1, -err * 0.25) : 0;
  }

  /** Your summoned Streetmon tears into the truck when you're on foot near it. */
  private streetmonAttack(h: TruckEvt, dps: number, dt: number, over: boolean): void {
    const f = this.d.follower;
    const p = this.d.player();
    const car = h.car;
    const want = !over && f.summoned && !p.vehicle && !car.destroyed && h.disabledAt === null && car.position.distanceTo(p.pos) < 30 && (f.goal === null || h.streetmonOn);
    if (!want) {
      if (h.streetmonOn) this.releaseFollower();
      h.streetmonOn = false;
      return;
    }
    h.streetmonOn = true;
    // Go for the nearest side of the truck.
    const fw = car.forward(this.fwd);
    const s = (f.x - car.position.x) * -fw.z + (f.z - car.position.z) * fw.x >= 0 ? 1 : -1;
    const gx = car.position.x - fw.z * s * (car.spec.width / 2 + 0.7);
    const gz = car.position.z + fw.x * s * (car.spec.width / 2 + 0.7);
    f.goal = { x: gx, z: gz };
    const close = Math.hypot(f.x - gx, f.z - gz) < 2.2 && Math.abs(car.speed) < 6;
    f.work = close;
    if (close) {
      car.damage(dps * dt * car.mods.armor); // claws and teeth ignore the plating... mostly
      h.engaged = true;
      if (Math.random() < dt * 6) this.d.effects.sparks(gx, car.position.y + 0.8, gz, 3);
    }
  }

  private releaseFollower(): void {
    this.d.follower.goal = null;
    this.d.follower.work = false;
  }

  private guardAI(g: Scripted, T: { guardDamage?: number; guardRange?: number; guardFireEvery?: number }, dt: number): void {
    const ped = g.ped;
    if (ped.state !== 'cop' || !this.d.peds.peds.includes(ped)) return;
    const p = this.d.player();
    if (p.dead) return;
    const dx = p.pos.x - ped.x;
    const dz = p.pos.z - ped.z;
    const dist = Math.hypot(dx, dz);
    const range = T.guardRange ?? 24;
    if (dist > range * 1.6) return;
    ped.heading = Math.atan2(-dz, dx);
    if (dist > range * 0.7) this.d.peds.moveToward(ped, dt, p.pos.x, p.pos.z, 3.4);
    else ped.speed = 0;
    g.cd -= dt;
    if (g.cd <= 0 && dist < range) {
      g.cd = (T.guardFireEvery ?? 1.3) * (0.8 + Math.random() * 0.4);
      const mx = ped.x + Math.cos(ped.heading) * 0.5;
      const mz = ped.z - Math.sin(ped.heading) * 0.5;
      this.d.effects.muzzle(mx, ped.y + 1.35, mz, 0.7);
      this.d.effects.tracer(mx, ped.y + 1.35, mz, p.pos.x, p.pos.y + 1, p.pos.z);
      audio.gunshot('pistol', { x: ped.x, y: ped.y + 1.3, z: ped.z });
      // Harder to hit you at range or in a car.
      const chance = (p.vehicle ? 0.25 : 0.4) * (1 - dist / (range * 1.4));
      if (Math.random() < chance) this.d.damagePlayer(T.guardDamage ?? 6, 'Shot by an armored-car guard');
    }
  }

  private makeBundle(x: number, y: number, z: number, value: number): Bundle {
    const g = new THREE.Group();
    const cash = new THREE.Mesh(this.geo.bundle, this.mats.cash);
    const band = new THREE.Mesh(this.geo.band, this.mats.band);
    cash.castShadow = true;
    g.add(cash, band);
    g.position.set(x, y + 0.3, z);
    this.d.scene.add(g);
    return { mesh: g, value, taken: false, phase: Math.random() * 6 };
  }

  /** Spins the bundles and picks up the ones you touch. Returns the cash picked up. */
  private collect(bundles: Bundle[], dt: number): number {
    const p = this.d.player();
    let got = 0;
    for (const b of bundles) {
      if (b.taken) continue;
      b.phase += dt;
      b.mesh.rotation.y += dt * 2;
      b.mesh.position.y += Math.sin(b.phase * 3) * dt * 0.08;
      const r = p.vehicle ? 3 : 1.5;
      if (!p.dead && Math.hypot(p.pos.x - b.mesh.position.x, p.pos.z - b.mesh.position.z) < r && Math.abs(p.pos.y - b.mesh.position.y) < 2.2) {
        b.taken = true;
        this.d.scene.remove(b.mesh);
        got += b.value;
        this.d.earn(b.value);
        audio.cash();
      }
    }
    return got;
  }

  // ------------------------------------------------------------------ turf outbreak

  private spawnOutbreak(inst: EventInstance): OutbreakEvt | null {
    const S = inst.def.swarm;
    const rand = rng(inst.seed);
    const z0 = inst.zone;
    const y = this.d.groundY(z0.x, z0.z);
    const n = rangeInt(S.count, rand);
    const radius = S.radius as number;
    const alley = z0.layer === 'alley';
    const creatures: WildCreature[] = [];
    const level = this.d.partyLevel();
    for (let i = 0; i < n; i++) {
      const spec = this.d.pickSpecies(z0.district as District, S.types ?? []);
      if (!spec) continue;
      for (let tries = 0; tries < 12; tries++) {
        // Alleys are long and narrow: spread along them.
        const x = alley ? z0.x + (rand() - 0.5) * 3 : z0.x + (rand() - 0.5) * 2 * radius;
        const z = alley ? z0.z + (rand() - 0.5) * 2 * Math.min(radius * 2, (z0.halfLength ?? 18) - 2) : z0.z + (rand() - 0.5) * 2 * radius;
        if (this.d.blocked(x, z) || Math.abs(this.d.groundY(x, z) - y) > 0.4) continue;
        const lv = Math.max(2, Math.min(60, level + rangeInt(S.levelOffset, rand)));
        const w = this.d.spawns.spawn(spec, lv, x, z, z0.district as District, false, 'street');
        w.temperament = 'aggro';
        w.eventTag = inst.uid;
        creatures.push(w);
        break;
      }
    }
    if (!creatures.length) return null;
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.5, radius, 64), this.mats.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(z0.x, y + 0.06, z0.z);
    if (alley) ring.scale.set(0.35, (z0.halfLength ?? 18) / radius, 1);
    ring.renderOrder = 2;
    this.d.scene.add(ring);
    return { kind: 'outbreak', ring, creatures, total: creatures.length, x: z0.x, y, z: z0.z, radius, engaged: false };
  }

  private tickOutbreak(inst: EventInstance, h: OutbreakEvt, _dt: number, over: boolean): TickResult {
    (h.ring.material as THREE.MeshBasicMaterial).opacity = over ? Math.max(0, 0.55 - inst.stateTime * 0.1) : 0.35 + 0.25 * Math.sin(this.time * 3);
    // Knocked out, caught or scared off all count as cleared.
    const alive = h.creatures.filter((w) => !w.removed && w.creature.hp > 0 && this.d.spawns.wild.includes(w));
    // Swarm creatures never wander out of the hot zone for long.
    for (const w of alive) {
      w.homeX = h.x;
      w.homeZ = h.z;
    }
    const p = this.d.player();
    if (Math.hypot(p.pos.x - h.x, p.pos.z - h.z) < h.radius + 12) h.engaged = true;
    if (over) return {};
    const lock = inst.def.lockdownSeconds - inst.stateTime;
    const cleared = h.total - alive.length;
    const res: TickResult = {
      phase: 'active',
      pos: { x: h.x, z: h.z },
      progress: cleared / h.total,
      objective: `Clear the outbreak: ${alive.length} of ${h.total} left · lockdown in ${clock(lock)}`,
      engaged: h.engaged,
    };
    if (!alive.length) res.outcome = 'completed';
    else if (lock <= 0) {
      res.outcome = 'failed';
      res.reason = 'Police locked the area down';
    }
    return res;
  }

  // ------------------------------------------------------------------ airdrop

  private spawnDrop(inst: EventInstance): DropEvt | null {
    const D = inst.def.drop;
    const z0 = inst.zone;
    const layer: Biome = z0.layer === 'roof' ? 'roof' : 'street';
    const y = layer === 'roof' && typeof z0.y === 'number' ? z0.y : this.d.groundY(z0.x, z0.z);
    const military = inst.id.includes('military') || layer === 'roof';
    // Crate with straps and a lid that flips open.
    const crate = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.75, 0.9), military ? this.mats.crateMil : this.mats.crateGang);
    body.position.y = 0.375;
    body.castShadow = true;
    body.receiveShadow = true;
    crate.add(body);
    for (const sx of [-0.35, 0.35]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.93), this.mats.strap);
      strap.position.set(sx, 0.38, 0);
      crate.add(strap);
    }
    const lid = new THREE.Group();
    lid.position.set(0, 0.75, -0.45);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.1, 0.92), military ? this.mats.crateMil : this.mats.crateGang);
    lidMesh.position.set(0, 0.05, 0.45);
    lidMesh.castShadow = true;
    lid.add(lidMesh);
    crate.add(lid);
    crate.position.set(z0.x, y + 60, z0.z);
    this.d.scene.add(crate);
    // Parachute: a canopy and four lines.
    const chute = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.canopy);
    canopy.scale.y = 0.55;
    canopy.position.y = 4.2;
    chute.add(canopy);
    for (const [lx, lz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const a = new THREE.Vector3(lx * 0.55, 0.8, lz * 0.4);
      const b = new THREE.Vector3(lx * 1.7, 4.2, lz * 1.7);
      const len = a.distanceTo(b);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 4), this.mats.line);
      line.position.copy(a).add(b).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      chute.add(line);
    }
    chute.position.copy(crate.position);
    this.d.scene.add(chute);
    // Flare: a burning stick next to the landing spot (it glows and blooms) and a smoke column.
    const flare = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: D.flareColor, emissive: D.flareColor, emissiveIntensity: 4 }),
    );
    flare.position.set(z0.x + 1.2, y + 0.15, z0.z + 0.6);
    flare.rotation.z = 0.5;
    markBloom(flare);
    this.d.scene.add(flare);
    this.particleTex ??= makeSoftParticle();
    return {
      kind: 'drop',
      x: z0.x,
      y,
      z: z0.z,
      layer,
      crate,
      lid,
      chute,
      flare,
      smoke: [],
      smokeColor: new THREE.Color(D.flareColor),
      landed: false,
      fallT: 0,
      chuteT: 0,
      scavengers: [],
      scavLeft: D.scavengers,
      pryT: 0,
      pryBy: null,
      copT: 0,
      openT: 0,
      opening: false,
      opened: false,
      engaged: false,
    };
  }

  private tickDrop(inst: EventInstance, h: DropEvt, dt: number, over: boolean): TickResult {
    const D = inst.def.drop;
    this.smoke(h, dt, over);
    // Falling: drifts down under the canopy.
    if (!h.landed) {
      h.fallT += dt;
      const k = Math.min(1, h.fallT / D.fallSeconds);
      const sway = Math.sin(h.fallT * 1.3) * (1 - k) * 2;
      h.crate.position.set(h.x + sway, h.y + 60 * (1 - k), h.z + Math.cos(h.fallT) * (1 - k));
      h.crate.rotation.z = Math.sin(h.fallT * 1.3) * 0.12 * (1 - k);
      h.chute.position.copy(h.crate.position);
      h.chute.rotation.z = h.crate.rotation.z;
      if (k >= 1) {
        h.landed = true;
        h.crate.rotation.set(0, 0.4, 0);
        audio.thud();
        this.d.effects.tyreSmoke(h.x, h.y + 0.2, h.z, 1);
        if (h.layer === 'street') this.spawnScavengers(inst, h);
      }
      return { phase: 'spawning', pos: { x: h.x, z: h.z }, progress: 0, objective: `Supply crate coming down... ${Math.ceil(D.fallSeconds - h.fallT)}s` };
    }
    // The canopy collapses and drifts off, then it's gone.
    if (h.chute.visible) {
      h.chuteT += dt;
      h.chute.scale.y = Math.max(0.05, 1 - h.chuteT * 0.6);
      h.chute.position.x += dt * 1.5;
      h.chute.position.y = Math.max(h.y - 1, h.chute.position.y - dt * 1.5);
      if (h.chuteT > 3) h.chute.visible = false;
    }
    if (h.opened) h.lid.rotation.x = THREE.MathUtils.lerp(h.lid.rotation.x, -1.9, Math.min(1, dt * 6));
    if (over) return {};
    const p = this.d.player();
    const sameLayer = Math.abs(p.pos.y - h.y) < (h.layer === 'roof' ? 2.5 : 4);
    const near = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
    if (sameLayer && near < D.engageRadius) h.engaged = true;
    // Opening: hold your ground next to it.
    if (h.opening) {
      if (near < 2.8 && sameLayer && !p.dead && !p.vehicle) h.openT += dt;
      else {
        h.opening = false;
        h.openT = 0;
      }
      if (h.openT >= D.openSeconds) {
        h.opened = true;
        audio.cash();
        this.d.effects.sparks(h.x, h.y + 0.9, h.z, 16);
        return { outcome: 'completed', progress: 1, objective: 'Crate opened!', engaged: true };
      }
    }
    // Scavengers: run in and pry it open.
    let scavObjective = '';
    for (const s of h.scavengers) {
      if (s.ped.health < s.startHealth) h.engaged = true;
      if (!this.d.peds.peds.includes(s.ped) || s.ped.state === 'dead' || s.ped.state === 'fly' || s.ped.state === 'down') {
        if (h.pryBy === s) {
          h.pryBy = null;
          h.pryT = 0;
        }
        continue;
      }
      // Back under our control after a shove.
      if (s.ped.state !== 'cop') s.ped.state = 'cop';
      const d = this.d.peds.moveToward(s.ped, dt, h.x, h.z, h.pryBy && h.pryBy !== s ? 2 : 4.6);
      // A swing at you if you're in their way.
      s.cd -= dt;
      const dp = Math.hypot(p.pos.x - s.ped.x, p.pos.z - s.ped.z);
      if (dp < 1.4 && !p.vehicle && s.cd <= 0) {
        s.cd = 1.2;
        this.d.damagePlayer(5, 'Beaten by scavengers');
        audio.swing(true);
      }
      if (d < 1.8 && !h.pryBy) h.pryBy = s;
    }
    if (h.pryBy) {
      h.pryT += dt;
      scavObjective = ` · scavengers prying it open ${Math.round((h.pryT / D.scavengerPrySeconds) * 100)}%`;
      if (h.pryT >= D.scavengerPrySeconds) return { outcome: 'failed', reason: 'Scavengers got the crate' };
    }
    // Police parked on it: confiscated.
    if (h.layer === 'street' && this.d.police.anyWithin(h.x, h.z, 9)) {
      h.copT += dt;
      if (h.copT >= D.policeConfiscateSeconds) return { outcome: 'failed', reason: 'The police confiscated the crate' };
    } else h.copT = Math.max(0, h.copT - dt);
    // The rival crew's ETA.
    const eta = D.rivalEtaSeconds - (inst.stateTime - D.fallSeconds);
    if (eta <= 0) return { outcome: 'failed', reason: 'A rival crew got there first' };
    const alive = h.scavengers.filter((s) => this.d.peds.peds.includes(s.ped) && s.ped.state !== 'dead').length;
    return {
      phase: 'active',
      pos: { x: h.x, z: h.z },
      progress: h.opening ? h.openT / D.openSeconds : 0,
      objective: h.opening
        ? `Opening the crate... ${Math.round((h.openT / D.openSeconds) * 100)}%`
        : `Reach the crate${h.layer === 'roof' ? ' on the roof' : ''} and open it (E)${alive ? ` · ${alive} scavenger${alive > 1 ? 's' : ''}` : ''} · rivals in ${clock(eta)}${scavObjective}`,
      engaged: h.engaged,
    };
  }

  /** Nothing solid on the straight line between two points (sampled every metre; ends excluded). */
  private clearRun(x0: number, z0: number, x1: number, z1: number): boolean {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
    for (let k = 1; k < n - 1; k++) {
      const t = k / n;
      if (this.d.blocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  private spawnScavengers(inst: EventInstance, h: DropEvt): void {
    const D = inst.def.drop;
    const rand = rng(inst.seed + 7);
    for (let i = 0; i < D.scavengers; i++) {
      // They run straight at the crate (local steering only), so they must start with a clear run
      // to it: random bearings first, then along the streets (the four axes), then closer in.
      for (let tries = 0; tries < 40; tries++) {
        const near = tries >= 32 ? 0.5 : 1;
        const a = tries < 24 ? rand() * Math.PI * 2 : ((tries % 4) * Math.PI) / 2;
        const r = range(D.scavengerSpawnDistance, rand) * near;
        // Alleys: come in from either end of the lane.
        const alley = inst.zone.layer === 'alley';
        const x = alley ? h.x + (rand() - 0.5) * 4 : h.x + Math.cos(a) * r;
        const z = alley ? h.z + (i % 2 ? 1 : -1) * ((inst.zone.halfLength ?? 20) + 4 + rand() * 15) : h.z + Math.sin(a) * r;
        if (this.d.blocked(x, z) || this.d.groundY(x, z) < -0.5 || !this.clearRun(x, z, h.x, h.z)) continue;
        const ped = this.d.peds.spawnOfficer(x, z, SCAV_LOOK(rand), Math.atan2(-(h.z - z), h.x - x));
        // Civilians to the law (hurting them is a crime like any other), scripted by us.
        ped.role = 'civ';
        ped.pinned = true; // the ped streamer would drop far-off civilians
        ped.health = 90;
        ped.y = this.d.groundY(x, z);
        h.scavengers.push({ ped, cd: 0, startHealth: ped.health });
        break;
      }
    }
  }

  /** The flare's smoke column. */
  private smoke(h: DropEvt, dt: number, over: boolean): void {
    const tex = this.particleTex!;
    if (!over && h.smoke.length < 70 && Math.random() < dt * 14) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: h.smokeColor.clone().lerp(new THREE.Color(1, 1, 1), 0.25), transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(h.flare.position);
      this.d.scene.add(sprite);
      h.smoke.push({ sprite, age: 0, life: 7 + Math.random() * 4, vx: (Math.random() - 0.5) * 0.6 + 0.5, vy: 3 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.6 });
    }
    for (let i = h.smoke.length - 1; i >= 0; i--) {
      const p = h.smoke[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this.d.scene.remove(p.sprite);
        p.sprite.material.dispose();
        h.smoke.splice(i, 1);
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt * (1 - k * 0.6);
      p.sprite.position.z += p.vz * dt;
      const s = 0.8 + k * 6;
      p.sprite.scale.set(s, s, s);
      p.sprite.material.opacity = Math.min(1, k * 6) * (1 - k) * 0.75;
    }
    (h.flare.material as THREE.MeshStandardMaterial).emissiveIntensity = over ? 0.5 : 3.5 + Math.sin(this.time * 23) * 0.8;
  }
}
