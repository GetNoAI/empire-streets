import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { Humanoid } from '../player/Humanoid';
import { randomLook } from '../peds/CrowdRenderer';
import type { RoadGraph, Dir, Point } from '../traffic/RoadGraph';
import { DIR_HEADING } from '../traffic/RoadGraph';
import type { TrafficSystem } from '../traffic/TrafficSystem';
import type { Car } from '../vehicles/Car';
import { getSpec } from '../vehicles/specs';
import type { VehicleManager } from '../vehicles/VehicleManager';
import type { CoursePoint, GridSlot, PropDef, PropHandle, RaceConfig, RaceState, RaceTrack, RacerDriver } from './streetRaceManager.js';
import { withSurface } from '../render/Surfaces';

/**
 * The engine side of street races (streetRaceManager.js runs the rules): track props with real
 * physics (knock-over cones, barricades and tyre stacks, solid ramps, boost pads), checkpoint
 * beams and ground rings, the NPC racers' driving, and the organisers waiting at each start line.
 */

export interface RaceWorldDeps {
  scene: THREE.Scene;
  world: RAPIER.World;
  vehicles: VehicleManager;
  traffic: TrafficSystem;
  graph: RoadGraph;
  config: RaceConfig;
  /** The car the player is driving. */
  playerCar(): Car | null;
  /** Smoke from a Nitrous Smokescreen at this point? (racers driving into it are blinded) */
  inSmoke(x: number, y: number, z: number): boolean;
  /** Is a point on screen (racers only teleport out of trouble when you can't see it). */
  visible(x: number, z: number): boolean;
}

/** Loose props: members of the PED group so car chassis hit them but wheel rays ignore them. */
const PROP_GROUPS = groups(GROUP.PED, GROUP.WORLD | GROUP.CAR | GROUP.PLAYER | GROUP.PED);
const RAMP_GROUPS = groups(GROUP.WORLD, 0xffff);

interface Loose {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  /** Footprint for creature steering: radius, and half-length along its long axis (barricades). */
  r: number;
  half: number;
}

interface Pad {
  x: number;
  z: number;
  fx: number;
  fz: number;
  half: number;
  halfW: number;
  mesh: THREE.Mesh;
}

interface Racer {
  id: string;
  car: Car;
  driver: RacerDriver;
  path: Array<Point & { vmax: number }>;
  /** Index into path of the next waypoint. */
  wp: number;
  lane: number;
  stuckFor: number;
  /** Reversing attempts in a row; after a few, it's put back on the line (out of sight). */
  stuckCount: number;
  reverseFor: number;
  reverseSteer: number;
  blindFor: number;
  progress: number;
  wobble: number;
}

const mats = {
  cone: withSurface(new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.6 }), 'plastic'),
  white: withSurface(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }), 'plastic'),
  barricade: withSurface(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }), 'plastic'),
  barStripe: withSurface(new THREE.MeshStandardMaterial({ color: 0xe0301e, roughness: 0.5 }), 'plastic'),
  tyre: withSurface(new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.95 }), 'rubber'),
  ramp: withSurface(new THREE.MeshStandardMaterial({ color: 0x5b6068, roughness: 0.8, metalness: 0.3 }), 'paintedMetal'),
  rampEdge: withSurface(new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 }), 'paintedMetal'),
};

/** Chevrons for the boost pads (drawn once). */
function padTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#062a3a';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#21e6ff';
  for (let i = 0; i < 3; i++) {
    const y = 18 + i * 38;
    g.beginPath();
    g.moveTo(8, y + 22);
    g.lineTo(32, y);
    g.lineTo(56, y + 22);
    g.lineTo(56, y + 34);
    g.lineTo(32, y + 12);
    g.lineTo(8, y + 34);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A checkered band for the finish ring. */
function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      g.fillRect(i * 8, j * 8, 8, 8);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class RaceWorld {
  private readonly loose: Loose[] = [];
  private readonly pads: Pad[] = [];
  /** Ramps on the course (racers steer around them: a jump at full speed wrecks an AI car). */
  private readonly ramps: Array<{ x: number; z: number; rot: number; len: number; w: number }> = [];
  private readonly racers: Racer[] = [];
  private readonly boosting = new Map<Car, number>();
  private readonly organizers: Array<{ track: RaceTrack; model: Humanoid | null; flag: THREE.Object3D | null; t: number }> = [];
  private padTex: THREE.CanvasTexture | null = null;
  private checkerTex: THREE.CanvasTexture | null = null;
  private time = 0;
  private readonly markerMeshes = new Set<THREE.Object3D>();
  private readonly tmp = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly invQ = new THREE.Quaternion();

  constructor(private readonly d: RaceWorldDeps) {
    for (const t of d.config.tracks) if (t.organizer) this.organizers.push({ track: t, model: null, flag: null, t: Math.random() * 10 });
  }

  // ------------------------------------------------------------------ props

  /** Spawns one obstacle (or checkpoint marker) and returns its handle. */
  spawnProp(def: PropDef, _track: RaceTrack): PropHandle {
    switch (def.type) {
      case 'cones':
      case 'barricade':
      case 'tireStack':
        return this.spawnLoose(def.type, def.x, def.z, def.rotationY, 'count' in def ? (def.count ?? 1) : 1, 'spacing' in def ? (def.spacing ?? 3) : 3);
      case 'ramp':
        return this.spawnRamp(def.x, def.z, def.rotationY);
      case 'boostPad':
        return this.spawnPad(def.x, def.z, def.rotationY);
      case 'checkpointMarker':
      case 'finishMarker':
        return this.spawnMarker(def.x, def.z, def.radius, def.type === 'finishMarker');
    }
  }

  /** Knock-over props in a line along `rot` (cones, barricades, tyre stacks). */
  private spawnLoose(type: 'cones' | 'barricade' | 'tireStack', x: number, z: number, rot: number, count: number, spacing: number): PropHandle {
    const P = this.d.config.props ?? {};
    const fx = Math.cos(rot);
    const fz = -Math.sin(rot);
    const mine: Loose[] = [];
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    for (let i = 0; i < count; i++) {
      const s = (i - (count - 1) / 2) * spacing;
      const px = x + fx * s;
      const pz = z + fz * s;
      let mesh: THREE.Object3D;
      let col: RAPIER.ColliderDesc;
      let y: number;
      if (type === 'cones') {
        const c = P['cones'] ?? { radius: 0.22, height: 0.75, mass: 3 };
        const g = new THREE.Group();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(c.radius, c.height, 12), mats.cone);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(c.radius * 0.55, c.radius * 0.72, c.height * 0.16, 12), mats.white);
        band.position.y = 0.05;
        const base = new THREE.Mesh(new THREE.BoxGeometry(c.radius * 2.4, 0.04, c.radius * 2.4), mats.cone);
        base.position.y = -c.height / 2 + 0.02;
        g.add(cone, band, base);
        mesh = g;
        y = c.height / 2;
        col = RAPIER.ColliderDesc.cone(c.height / 2, c.radius).setMass(c.mass);
      } else if (type === 'barricade') {
        const c = P['barricade'] ?? { size: [2.4, 1.1, 0.45], mass: 90 };
        const [l, h, w] = c.size as number[];
        const g = new THREE.Group();
        const board = new THREE.Mesh(new THREE.BoxGeometry(l, h * 0.35, w * 0.3), mats.barricade);
        board.position.y = h * 0.25;
        g.add(board);
        for (let k = 0; k < 4; k++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(l * 0.1, h * 0.36, w * 0.32), mats.barStripe);
          st.position.set(-l * 0.36 + k * l * 0.24, h * 0.25, 0);
          g.add(st);
        }
        for (const sx of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, w), mats.barricade);
          leg.position.set(sx * l * 0.42, 0, 0);
          g.add(leg);
        }
        mesh = g;
        y = h / 2;
        col = RAPIER.ColliderDesc.cuboid(l / 2, h / 2, w / 2).setMass(c.mass);
      } else {
        const c = P['tireStack'] ?? { radius: 0.65, height: 1.3, mass: 60 };
        const g = new THREE.Group();
        const n = 4;
        for (let k = 0; k < n; k++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(c.radius * 0.72, c.radius * 0.28, 8, 16), k % 2 ? mats.tyre : mats.tyre);
          t.rotation.x = Math.PI / 2;
          t.position.y = -c.height / 2 + (k + 0.5) * (c.height / n);
          g.add(t);
        }
        const band = new THREE.Mesh(new THREE.CylinderGeometry(c.radius * 1.01, c.radius * 1.01, c.height * 0.2, 16, 1, true), mats.barStripe);
        g.add(band);
        mesh = g;
        y = c.height / 2;
        col = RAPIER.ColliderDesc.cylinder(c.height / 2, c.radius).setMass(c.mass);
      }
      mesh.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      const body = this.d.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(px, y + 0.02, pz).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.4).setAngularDamping(0.6).setCanSleep(true),
      );
      this.d.world.createCollider(col.setFriction(0.8).setRestitution(0.1).setCollisionGroups(PROP_GROUPS), body);
      body.sleep();
      mesh.position.set(px, y, pz);
      mesh.quaternion.copy(q);
      this.d.scene.add(mesh);
      const l: Loose = { body, mesh, r: type === 'cones' ? 0.3 : type === 'barricade' ? 0.35 : 0.7, half: type === 'barricade' ? 1.1 : 0 };
      mine.push(l);
      this.loose.push(l);
    }
    return {
      dispose: () => {
        for (const l of mine) {
          l.mesh.removeFromParent();
          this.disposeMesh(l.mesh);
          this.d.world.removeRigidBody(l.body);
          const i = this.loose.indexOf(l);
          if (i >= 0) this.loose.splice(i, 1);
        }
        mine.length = 0;
      },
    };
  }

  /** A solid wedge rising along `rot`. */
  private spawnRamp(x: number, z: number, rot: number): PropHandle {
    const c = this.d.config.props?.['ramp'] ?? { length: 7, width: 3.2, height: 1.3 };
    const L = c.length / 2;
    const W = c.width / 2;
    const H = c.height;
    // Local: +x along travel (low end at -L), +z across.
    const v = [-L, 0, -W, -L, 0, W, L, 0, -W, L, 0, W, L, H, -W, L, H, W];
    const body = this.d.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.01, z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot)));
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(v));
    if (desc) this.d.world.createCollider(desc.setFriction(1).setCollisionGroups(RAMP_GROUPS), body);
    // Mesh: a triangular prism.
    const shape = new THREE.Shape();
    shape.moveTo(-L, 0);
    shape.lineTo(L, 0);
    shape.lineTo(L, H);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: W * 2, bevelEnabled: false });
    geo.translate(0, 0, -W);
    const g = new THREE.Group();
    const wedge = new THREE.Mesh(geo, mats.ramp);
    wedge.castShadow = true;
    wedge.receiveShadow = true;
    g.add(wedge);
    // Yellow edge stripes along the sides of the slope.
    const slope = Math.hypot(2 * L, H);
    for (const sz of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.05, 0.25), mats.rampEdge);
      stripe.position.set(0, H / 2 + 0.03, sz * (W - 0.15));
      stripe.rotation.z = Math.atan2(H, 2 * L);
      g.add(stripe);
    }
    g.position.set(x, 0.01, z);
    g.rotation.y = rot;
    this.d.scene.add(g);
    const spot = { x, z, rot, len: c.length, w: c.width };
    this.ramps.push(spot);
    return {
      dispose: () => {
        const i = this.ramps.indexOf(spot);
        if (i >= 0) this.ramps.splice(i, 1);
        g.removeFromParent();
        this.disposeMesh(g);
        this.d.world.removeRigidBody(body);
      },
    };
  }

  /** A glowing pad: drive over it for a burst of speed. */
  private spawnPad(x: number, z: number, rot: number): PropHandle {
    const c = this.d.config.props?.['boostPad'] ?? { length: 6, width: 2.8 };
    this.padTex ??= padTexture();
    const mat = new THREE.MeshBasicMaterial({ map: this.padTex, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.length), mat);
    mesh.rotation.x = -Math.PI / 2;
    // Plane's +Y (up the texture) is the travel direction.
    const g = new THREE.Group();
    g.add(mesh);
    g.position.set(x, 0.05, z);
    g.rotation.y = rot - Math.PI / 2;
    g.renderOrder = 1;
    this.d.scene.add(g);
    const pad: Pad = { x, z, fx: Math.cos(rot), fz: -Math.sin(rot), half: c.length / 2, halfW: c.width / 2 + 0.6, mesh };
    this.pads.push(pad);
    return {
      dispose: () => {
        g.removeFromParent();
        mesh.geometry.dispose();
        mat.dispose();
        const i = this.pads.indexOf(pad);
        if (i >= 0) this.pads.splice(i, 1);
      },
    };
  }

  /** A checkpoint: a tall beam of light and a ring on the road. */
  private spawnMarker(x: number, z: number, radius: number, finish: boolean): PropHandle {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 90, 16, 1, true), beamMat);
    beam.position.y = 45;
    const ringR = Math.min(radius * 0.7, 9.5);
    this.checkerTex ??= checkerTexture();
    const ringMat = finish
      ? new THREE.MeshBasicMaterial({ map: this.checkerTex, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 })
      : new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(ringR - 0.9, ringR, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    // A floating chevron at head height so you can see it over traffic.
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 4), arrowMat);
    arrow.rotation.x = Math.PI;
    arrow.position.y = 7;
    g.add(beam, ring, arrow);
    g.position.set(x, 0, z);
    g.visible = false;
    g.userData['race'] = { beam, ring, arrow, finish, state: 'hidden' };
    this.d.scene.add(g);
    this.markerMeshes.add(g);
    return {
      setState: (s) => {
        g.visible = s !== 'hidden';
        g.userData['race'].state = s;
        const cur = s === 'current';
        const color = finish && cur ? 0xffffff : cur ? 0xffd23f : 0xbfc8d6;
        beamMat.color.setHex(color);
        beamMat.opacity = cur ? 0.45 : 0.14;
        arrowMat.color.setHex(color);
        arrow.visible = cur;
        if (!finish) ringMat.color.setHex(color);
        ringMat.opacity = cur ? 0.85 : 0.35;
      },
      dispose: () => {
        g.removeFromParent();
        this.markerMeshes.delete(g);
        this.disposeMesh(g, true);
      },
    };
  }

  private disposeMesh(o: THREE.Object3D, materials = false): void {
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (materials) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat.dispose();
    });
  }

  // ------------------------------------------------------------------ racers

  /** NPC racers on their grid slots, each with a path through the course on its own lane. */
  spawnRacers(track: RaceTrack, slots: GridSlot[], drivers: RacerDriver[], course: CoursePoint[]): string[] {
    this.removeRacers();
    const G = this.d.graph;
    // The node chain: from the start line through every checkpoint (laps included).
    const arrive0 = this.dirFromHeading(track.start.heading);
    // From the junction just past the start line, through every checkpoint.
    const firstNode = G.nodeAhead(track.start.x, track.start.z, arrive0);
    const chain: number[] = [firstNode.id];
    const b0 = G.nearestNode(course[0].x, course[0].z).id;
    if (b0 !== firstNode.id) chain.push(...G.route(firstNode.id, b0).slice(1));
    for (let i = 1; i < course.length; i++) {
      const a = chain[chain.length - 1];
      const b = G.nearestNode(course[i].x, course[i].z).id;
      const r = a === b ? [a] : G.route(a, b);
      chain.push(...r.slice(1));
    }
    const arrive = this.dirFromHeading(track.start.heading);
    return slots.map((slot, i) => {
      const drv = drivers[i];
      let spec;
      try {
        spec = getSpec(drv.vehicle);
      } catch {
        spec = getSpec('sports');
      }
      const car = this.d.vehicles.spawn(spec, slot.x, slot.z, slot.heading, drv.color);
      car.driver = 'ai';
      // Race-prepped: roll cage and reinforced panels, so one bad crash doesn't end their race.
      car.mods.armor = 4;
      this.d.vehicles.owned.add(car);
      const lane = i % 2;
      const top = car.topSpeed;
      const path = G.routeWaypoints(chain, arrive, lane, top, 13 + 5 * drv.skill);
      const r: Racer = { id: `racer-${i}-${Math.floor(Math.random() * 1e6).toString(36)}`, car, driver: drv, path, wp: 0, lane, stuckFor: 0, stuckCount: 0, reverseFor: 0, reverseSteer: 0, blindFor: 0, progress: 0, wobble: Math.random() * 10 };
      this.racers.push(r);
      return r.id;
    });
  }

  private dirFromHeading(h: number): Dir {
    let best: Dir = 0;
    let bd = Infinity;
    for (const d of [0, 1, 2, 3] as Dir[]) {
      const diff = Math.abs(Math.atan2(Math.sin(h - DIR_HEADING[d]), Math.cos(h - DIR_HEADING[d])));
      if (diff < bd) {
        bd = diff;
        best = d;
      }
    }
    return best;
  }

  /**
   * Race props as circles for creature steering (barricades and ramps as a row of circles along
   * their length). Knocked-over props report where they ended up.
   */
  obstacleCircles(out: Array<{ x: number; z: number; r: number }> = []): Array<{ x: number; z: number; r: number }> {
    for (const l of this.loose) {
      const p = l.body.translation();
      if (p.y < -5) continue;
      if (l.half > 0) {
        const q = l.body.rotation();
        // Long axis = local +x rotated by the body's yaw.
        const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
        const fx = Math.cos(yaw);
        const fz = -Math.sin(yaw);
        for (const s of [-1, 0, 1]) out.push({ x: p.x + fx * l.half * s * 0.8, z: p.z + fz * l.half * s * 0.8, r: l.r + 0.25 });
      } else out.push({ x: p.x, z: p.z, r: l.r });
    }
    for (const rp of this.ramps) {
      const fx = Math.cos(rp.rot);
      const fz = -Math.sin(rp.rot);
      const n = Math.ceil(rp.len / rp.w) + 1;
      for (let k = 0; k < n; k++) {
        const t = (k / (n - 1) - 0.5) * (rp.len - rp.w * 0.5);
        out.push({ x: rp.x + fx * t, z: rp.z + fz * t, r: rp.w * 0.55 });
      }
    }
    return out;
  }

  /** One of this race's NPC racers? (you can't jack them mid-race) */
  isRacer(car: Car): boolean {
    return this.racers.some((r) => r.car === car);
  }

  racerPosition(id: string): { x: number; z: number } | null {
    const r = this.racers.find((x) => x.id === id);
    if (!r || r.car.disposed) return null;
    return { x: r.car.position.x, z: r.car.position.z };
  }

  /** Every racer car, for the minimap. */
  racerCars(): Car[] {
    return this.racers.filter((r) => !r.car.disposed).map((r) => r.car);
  }

  /** Race over: racers you can see drive off as traffic, the rest vanish. */
  removeRacers(): void {
    for (const r of this.racers) {
      const car = r.car;
      this.d.vehicles.owned.delete(car);
      this.boosting.delete(car);
      car.mods.armor = 1;
      if (car.disposed || car.driver === 'player') continue;
      if (car.destroyed || !this.d.visible(car.position.x, car.position.z)) {
        this.d.vehicles.remove(car);
        continue;
      }
      car.driver = null;
      car.input.throttle = 0;
      car.input.brake = 0;
      car.input.steer = 0;
      this.d.traffic.adopt(car, randomLook(), false);
    }
    this.racers.length = 0;
    this.racing = false;
  }

  /** Drives the racers. During the countdown they sit on the brakes. */
  /** Racers are on the move (not lined up for the countdown). */
  private racing = false;

  updateRacers(dt: number, info: { state: RaceState; progress: Map<string, number> }): void {
    this.racing = info.state === 'RACING';
    const playerProg = info.progress.get('player') ?? 0;
    const cu = this.d.config.racers?.catchUp ?? {};
    for (const r of this.racers) {
      const car = r.car;
      if (car.disposed || car.destroyed || car.driver === 'player') continue;
      if (info.state !== 'RACING') {
        // On the line: handbrake only (the brake pedal reverses a stopped car).
        car.input.throttle = 0;
        car.input.brake = 0;
        car.input.steer = 0;
        car.input.handbrake = true;
        continue;
      }
      car.input.handbrake = false;
      r.progress = info.progress.get(r.id) ?? 0;
      // Rubber band: a little faster when far behind you, a touch slower when far ahead.
      const gap = r.progress - playerProg;
      const band = gap < -(cu.behindGap ?? 2) ? cu.behindBoost ?? 1.06 : gap > (cu.aheadGap ?? 2) ? cu.aheadSlow ?? 0.95 : 1;
      this.drive(r, dt, r.driver.skill * band);
    }
  }

  private drive(r: Racer, dt: number, pace: number): void {
    const car = r.car;
    const pos = car.position;
    const v = car.speed;
    const f = car.forward(this.fwd);
    // Flipped: back on the wheels.
    if (car.flippedTime > 2) {
      car.flipUpright();
      return;
    }
    // Drop waypoints we've reached or passed.
    while (r.wp < r.path.length) {
      const w = r.path[r.wp];
      const dx = w.x - pos.x;
      const dz = w.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4 || (dx * f.x + dz * f.z < 0 && dist < 25)) r.wp++;
      else break;
    }
    // Cut a corner or got shoved along: jump to a nearer waypoint a little further on.
    r.wp = this.nearestAhead(r, pos.x, pos.z).i;
    if (r.wp >= r.path.length) {
      // Finished: roll to a stop.
      car.input.throttle = 0;
      car.input.brake = Math.abs(v) > 1 ? 1 : 0;
      car.input.steer = 0;
      return;
    }
    // Blinded by smoke: lift and wander.
    if (this.d.inSmoke(pos.x, pos.y + 1, pos.z)) r.blindFor = 1.6;
    if (r.blindFor > 0) r.blindFor -= dt;
    // Stuck: reverse out.
    if (r.reverseFor > 0) {
      r.reverseFor -= dt;
      car.input.throttle = 0;
      car.input.brake = 1;
      car.input.steer = r.reverseSteer;
      return;
    }
    r.stuckFor = Math.abs(v) < 1.2 ? r.stuckFor + dt : 0;
    if (r.stuckFor > 2.2) {
      r.stuckFor = 0;
      r.reverseFor = 1.3;
      r.reverseSteer = Math.random() < 0.5 ? -1 : 1;
      r.stuckCount++;
    } else if (Math.abs(v) > 8) r.stuckCount = 0;
    // Lookahead target.
    const look = Math.min(26, Math.max(7, 6 + Math.abs(v) * 0.55));
    let target: Point = r.path[r.path.length - 1];
    let acc = 0;
    let px = pos.x;
    let pz = pos.z;
    for (let i = r.wp; i < r.path.length; i++) {
      const w = r.path[i];
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
    // Swerve around slower cars in the way (including you).
    this.invQ.copy(car.quaternion).invert();
    let blockGap = Infinity;
    let blockSide = 0;
    for (const c of this.d.vehicles.cars) {
      if (c === car) continue;
      const dx = c.position.x - pos.x;
      const dz = c.position.z - pos.z;
      const scan = Math.max(30, Math.abs(v) * 1.8);
      if (dx * dx + dz * dz > scan * scan) continue;
      const local = this.tmp.set(dx, 0, dz).applyQuaternion(this.invQ);
      if (local.x < 0 || Math.abs(local.z) > 2.6) continue;
      if (c.speed > v - 2 && local.x > 6) continue;
      const g = local.x - car.spec.length / 2 - c.spec.length / 2;
      if (g < blockGap) {
        blockGap = g;
        blockSide = local.z >= 0 ? -1 : 1;
      }
    }
    let rampAhead = false;
    for (const rp of this.ramps) {
      const local = this.tmp.set(rp.x - pos.x, 0, rp.z - pos.z).applyQuaternion(this.invQ);
      if (local.x < 0 || local.x > 50 || Math.abs(local.z) > 3.4) continue;
      const g = local.x - car.spec.length / 2 - 4;
      if (g < blockGap) {
        blockGap = Math.max(0.5, g);
        blockSide = local.z >= 0 ? -1 : 1;
        rampAhead = true;
      }
    }
    if (blockGap < Math.max(20, Math.abs(v) * 0.9)) {
      const off = 3.4 * blockSide;
      target = { x: target.x - f.z * off, z: target.z + f.x * off };
    }
    const tx = target.x - pos.x;
    const tz = target.z - pos.z;
    let alpha = Math.atan2(-tz, tx) - car.heading;
    while (alpha > Math.PI) alpha -= Math.PI * 2;
    while (alpha < -Math.PI) alpha += Math.PI * 2;
    const Ld = Math.max(1, Math.hypot(tx, tz));
    const delta = Math.atan2(2 * car.spec.wheelBase * Math.sin(alpha), Ld);
    let steer = Math.max(-1, Math.min(1, -delta / car.maxSteerAt(v)));
    if (r.blindFor > 0) steer = Math.max(-1, Math.min(1, steer + Math.sin(this.time * 5 + r.wobble) * 0.6));
    car.input.steer = steer;
    // Speed: corner limits ahead, braking at ~6.5 m/s².
    let vTarget = car.topSpeed * pace;
    acc = 0;
    px = pos.x;
    pz = pos.z;
    for (let i = r.wp; i < r.path.length && acc < 90; i++) {
      const w = r.path[i];
      acc += Math.hypot(w.x - px, w.z - pz);
      px = w.x;
      pz = w.z;
      vTarget = Math.min(vTarget, Math.sqrt(w.vmax * pace * w.vmax * pace + 2 * 6.5 * acc));
    }
    if (r.blindFor > 0) vTarget *= 0.55;
    // Something slow in the way: brake for it (enough to stop short of it at ~7 m/s²).
    if (blockGap < 60 && !rampAhead) vTarget = Math.min(vTarget, Math.max(4, Math.sqrt(2 * 7 * Math.max(0, blockGap - 4)) + 3));
    const err = vTarget - v;
    car.input.throttle = err > 0 ? Math.min(1, err * 0.5 + 0.35) : 0;
    car.input.brake = err < -1.5 ? Math.min(1, -err * 0.25) : 0;
  }

  /** The nearest of the next few waypoints (index and distance). */
  private nearestAhead(r: Racer, x: number, z: number): { i: number; d: number } {
    let i = r.wp;
    let d = r.wp < r.path.length ? Math.hypot(r.path[r.wp].x - x, r.path[r.wp].z - z) : Infinity;
    for (let k = r.wp + 1; k < Math.min(r.path.length, r.wp + 12); k++) {
      const dk = Math.hypot(r.path[k].x - x, r.path[k].z - z);
      if (dk < d - 1) {
        d = dk;
        i = k;
      }
    }
    return { i, d };
  }

  /** Puts a racer that's stuck out of sight back on its racing line. */
  private recover(): void {
    for (const r of this.racers) {
      const car = r.car;
      if (car.disposed || car.destroyed || r.wp >= r.path.length) continue;
      const near = this.nearestAhead(r, car.position.x, car.position.z);
      r.wp = near.i;
      const w = r.path[r.wp];
      const lost = near.d > 60 || r.stuckCount >= 3;
      if (!lost || this.d.visible(car.position.x, car.position.z) || this.d.visible(w.x, w.z)) continue;
      const nxt = r.path[Math.min(r.wp + 1, r.path.length - 1)];
      const h = Math.atan2(-(nxt.z - w.z), nxt.x - w.x);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h);
      car.body.setTranslation({ x: w.x, y: 0.9, z: w.z }, true);
      car.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      car.setInitialVelocity(Math.cos(h) * 10, -Math.sin(h) * 10);
      car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      r.stuckFor = 0;
      r.stuckCount = 0;
      r.reverseFor = 0;
    }
  }

  // ------------------------------------------------------------------ per frame

  /** Props follow their bodies, boost pads fire, beams pulse, organisers idle. */
  update(dt: number, player: THREE.Vector3, organizersOn: (t: RaceTrack) => boolean): void {
    this.time += dt;
    for (const l of this.loose) {
      if (l.body.isSleeping()) continue;
      const p = l.body.translation();
      const q = l.body.rotation();
      l.mesh.position.set(p.x, p.y, p.z);
      l.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      // Knocked off the map: stop simulating it.
      if (p.y < -20) l.body.sleep();
    }
    // Boost pads: any car rolling over one along its arrows.
    const P = this.d.config.props?.['boostPad'] ?? { boost: 10, seconds: 1.2 };
    if (this.pads.length) {
      for (const car of this.d.vehicles.cars) {
        if (car.disposed || car.destroyed) continue;
        for (const pad of this.pads) {
          const dx = car.position.x - pad.x;
          const dz = car.position.z - pad.z;
          const along = dx * pad.fx + dz * pad.fz;
          const across = Math.abs(dx * pad.fz - dz * pad.fx);
          if (Math.abs(along) > pad.half || across > pad.halfW || car.position.y > 2) continue;
          const f = car.forward(this.fwd);
          if (f.x * pad.fx + f.z * pad.fz < 0.5 || car.speed < 2) continue;
          if (!this.boosting.has(car)) this.boosting.set(car, P.seconds);
        }
      }
    }
    for (const [car, left] of [...this.boosting]) {
      if (car.disposed || left <= 0) {
        this.boosting.delete(car);
        continue;
      }
      this.boosting.set(car, left - dt);
      if (car.speed > car.topSpeed * 1.4) continue;
      const f = car.forward(this.fwd);
      const m = car.body.mass();
      const dv = (P.boost / P.seconds) * dt;
      car.body.applyImpulse({ x: f.x * m * dv, y: 0, z: f.z * m * dv }, true);
      // Not a crash.
      car.setInitialVelocity(car.body.linvel().x, car.body.linvel().z);
    }
    for (const pad of this.pads) (pad.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.2 * Math.sin(this.time * 8);
    for (const g of this.markerMeshes) {
      const u = g.userData['race'];
      if (!g.visible) continue;
      u.arrow.position.y = 7 + Math.sin(this.time * 3) * 0.6;
      u.arrow.rotation.y = this.time * 1.5;
      if (u.finish) (u.ring.material as THREE.MeshBasicMaterial).map!.offset.x = this.time * 0.2;
    }
    if (this.racing && Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.recover();
    this.updateOrganizers(dt, player, organizersOn);
  }

  /** Organisers: a racer with a flag by a parked car, near each start line. */
  private updateOrganizers(dt: number, player: THREE.Vector3, on: (t: RaceTrack) => boolean): void {
    for (const o of this.organizers) {
      const t = o.track;
      const org = t.organizer!;
      const d = Math.hypot(org.x - player.x, org.z - player.z);
      const want = d < 140 && on(t);
      if (want && !o.model) {
        const m = new Humanoid({ skin: '#8d5a3b', hair: '#111111', top: '#1b1b1f', legs: '#2c3e66', shoes: '#f2f2f2', scale: 1 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6), mats.white);
        pole.position.set(0.32, 1.55, 0.15);
        this.checkerTex ??= checkerTexture();
        const flagTex = this.checkerTex.clone();
        flagTex.repeat.set(1, 3);
        flagTex.needsUpdate = true;
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }));
        flag.position.set(0.32, 2.05, 0.5);
        flag.rotation.y = Math.PI / 2;
        m.root.add(pole, flag);
        // A neon sign on a stand so you can spot them from the road.
        const sign = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3fa4 }));
        sign.position.set(-1.6, 2.6, 0);
        sign.rotation.y = Math.PI / 2;
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), mats.ramp);
        stand.position.set(-1.6, 1.2, 0);
        m.root.add(sign, stand);
        m.root.traverse((x) => {
          if ((x as THREE.Mesh).isMesh) x.castShadow = true;
        });
        this.d.scene.add(m.root);
        o.model = m;
        o.flag = flag;
      } else if (!want && o.model) {
        o.model.root.removeFromParent();
        o.model = null;
        o.flag = null;
      }
      if (!o.model) continue;
      o.t += dt;
      // Face the road; wave the flag at you when you're close.
      const face = Math.atan2(-(t.start.z - org.z), t.start.x - org.x);
      o.model.root.position.set(org.x, 0.15, org.z);
      o.model.root.rotation.y = d < 30 ? Math.atan2(-(player.z - org.z), player.x - org.x) : face;
      o.model.update(dt, 0, true);
      if (o.flag) o.flag.rotation.x = Math.sin(o.t * (d < 30 ? 9 : 2)) * 0.5;
    }
  }

  /** Removes everything (leaving the game). */
  clear(): void {
    this.removeRacers();
  }
}
