import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { copLook, swatLook } from '../peds/CrowdRenderer';
import type { Ped, PedestrianSystem } from '../peds/PedestrianSystem';
import type { HumanoidLook } from '../player/Humanoid';
import { DIR_HEADING, DX, DZ, axisOf, opposite, type Dir, type Point, type RoadGraph } from '../traffic/RoadGraph';
import type { TrafficSystem } from '../traffic/TrafficSystem';
import { clamp } from '../util/math';
import type { Car } from '../vehicles/Car';
import { getSpec } from '../vehicles/specs';
import type { VehicleManager } from '../vehicles/VehicleManager';
import { rule, unitsFor } from './Escalation';
import { segmentsInRing } from './spawnRing';
import type { Wanted } from './Wanted';
import { VISION, inVision, type PoliceBlip } from './Vision';

type Mode = 'respond' | 'pursue' | 'deploy' | 'onfoot' | 'roadblock';

interface Waypoint extends Point {
  vmax: number;
}

interface Unit {
  car: Car;
  /** Officers seated in the car (driver first). */
  crew: HumanoidLook[];
  /** Officers out of the car. */
  officers: Ped[];
  mode: Mode;
  route: Waypoint[];
  replanIn: number;
  /** This unit can see the player right now. */
  sees: boolean;
  losIn: number;
  stuckFor: number;
  /** Seconds left of following the road route only (after getting stuck on the direct line). */
  routeLock: number;
  reverseFor: number;
  reverseSteer: number;
  /** For roadblocks: where it stands and which way the player was coming. */
  block?: { x: number; z: number; dir: Dir; until: number };
  /** Seconds the driver is blinded or staggered (smoke, shockwaves): can't see you, loses control. */
  dazedFor?: number;
}

export interface PlayerInfo {
  /** Player position (the car's when driving). */
  pos: THREE.Vector3;
  vx: number;
  vz: number;
  /** Player's car, or null on foot. */
  car: Car | null;
  /** On foot and able to be grabbed (not dead). */
  onFoot: boolean;
  /** Has a gun out. */
  armed: boolean;
}

export interface PoliceEvents {
  onBusted(): void;
  /** An officer fires at the player; the game resolves the shot. */
  onOfficerFire(officer: Ped, hitChance: number): void;
}

const LOS_GROUPS = groups(0xffff, GROUP.WORLD);

/**
 * Police response. Patrol cars live in ordinary traffic; once you're wanted they (and fresh units
 * spawned out of sight) route to you along the road network, switch to direct pursuit when they can
 * see you, ram you from 3 stars, put officers on foot to arrest you when you stop, set up roadblocks
 * from 4 stars, and search your last known position when they lose you.
 */
export class PoliceSystem {
  readonly units: Unit[] = [];
  private spawnIn = 0;
  private roadblockIn = 8;
  private arrest = 0;
  private time = 0;
  private playerStill = 0;
  /** True when any officer saw the player on the last check. */
  seen = false;
  /** Things officers can't see through (the Nitrous Smokescreen's trail). */
  sightBlocked: ((ax: number, ay: number, az: number, bx: number, by: number, bz: number) => boolean) | null = null;
  private readonly segs: ReturnType<RoadGraph['segments']>;
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly invQ = new THREE.Quaternion();

  constructor(
    private readonly world: RAPIER.World,
    private readonly graph: RoadGraph,
    private readonly vehicles: VehicleManager,
    private readonly traffic: TrafficSystem,
    private readonly peds: PedestrianSystem,
    private readonly wanted: Wanted,
    private readonly events: PoliceEvents,
  ) {
    this.segs = graph.segments();
  }

  /** Cancels an arrest in progress (the player fought their way out). */
  resetArrest(): void {
    this.arrest = 0;
  }

  /** Officers on foot near a point are knocked off their feet for a few seconds. */
  stunOfficers(x: number, z: number, r: number, seconds: number): number {
    let n = 0;
    for (const u of this.units)
      for (const o of u.officers) {
        if (o.state !== 'cop' || Math.hypot(o.x - x, o.z - z) > r) continue;
        o.state = 'down';
        o.timer = seconds;
        n++;
      }
    return n;
  }

  /** Nearest officer on foot (for the arrest battle). */
  nearestOfficer(x: number, z: number, r: number): Ped | null {
    let best: Ped | null = null;
    let bd = r;
    for (const u of this.units)
      for (const o of u.officers) {
        const d = Math.hypot(o.x - x, o.z - z);
        if (o.state === 'cop' && d < bd) {
          bd = d;
          best = o;
        }
      }
    return best;
  }

  /** The raw arrest timer (1.1 = busted): the game holds it while you roll, speeds it while you're winded. */
  get arrestRaw(): number {
    return this.arrest;
  }

  set arrestRaw(v: number) {
    this.arrest = Math.max(0, v);
    if (this.arrest >= 1.1) {
      this.arrest = 0;
      this.events.onBusted();
    }
  }

  /** 0..1 progress of an arrest in progress (for the HUD). */
  get arrestProgress(): number {
    return clamp(this.arrest, 0, 1);
  }

  /**
   * Blinds or staggers the crews of police cars: they lose sight of you and their grip on the
   * wheel for a few seconds. Returns how many units were hit.
   */
  daze(cars: Iterable<Car>, seconds: number): number {
    let n = 0;
    for (const car of cars)
      for (const u of this.units)
        if (u.car === car && u.crew.length > 0) {
          u.dazedFor = Math.max(u.dazedFor ?? 0, seconds);
          u.sees = false;
          n++;
        }
    return n;
  }

  /** Police units' cars (including parked roadblocks). */
  unitCars(): Car[] {
    return this.units.map((u) => u.car);
  }

  /** Roadblocks standing right now (for the radar). */
  roadblocks(): Array<{ x: number; z: number }> {
    const out: Array<{ x: number; z: number }> = [];
    for (const u of this.units) if (u.mode === 'roadblock' && u.block && !out.some((o) => o.x === u.block!.x && o.z === u.block!.z)) out.push({ x: u.block.x, z: u.block.z });
    return out;
  }

  isUnitCar(car: Car): boolean {
    return this.units.some((u) => u.car === car);
  }

  /** Seated officers for rendering. */
  seated(): Array<{ car: Car; look: HumanoidLook; passenger?: boolean }> {
    const out: Array<{ car: Car; look: HumanoidLook; passenger?: boolean }> = [];
    for (const u of this.units) {
      if (u.car.destroyed) continue;
      u.crew.forEach((look, i) => out.push({ car: u.car, look, passenger: i > 0 }));
    }
    return out;
  }

  /** Police car positions for the minimap. */
  /** Minimap blips: each unit and patrol with its vision cone (lit when it can see you). Officers out of their car get their own. */
  blips(): PoliceBlip[] {
    const out: PoliceBlip[] = [];
    for (const u of this.units) {
      if (u.car.destroyed) continue;
      const crewed = u.crew.length > 0 && (u.dazedFor ?? 0) <= 0;
      out.push({ x: u.car.position.x, z: u.car.position.z, heading: u.car.heading, vision: crewed ? VISION.car : undefined, sees: u.sees });
      for (const o of u.officers) if (o.state === 'cop') out.push({ x: o.x, z: o.z, heading: o.heading, vision: VISION.foot, sees: u.sees });
    }
    for (const c of this.traffic.patrols()) out.push({ x: c.position.x, z: c.position.z, heading: c.heading, vision: VISION.patrol });
    return out;
  }

  // ------------------------------------------------------------------ sight

  /** Clear line of sight between two points (buildings and walls block it). */
  private los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.5) return true;
    if (this.sightBlocked?.(ax, ay, az, bx, by, bz)) return false;
    const ray = new RAPIER.Ray({ x: ax, y: ay, z: az }, { x: dx / d, y: dy / d, z: dz / d });
    return this.world.castRay(ray, d - 0.5, true, undefined, LOS_GROUPS) === null;
  }

  /** Is any police officer (car or on foot, including patrols) within `r` of the point? Used for hearing gunfire. */
  anyWithin(x: number, z: number, r: number): boolean {
    for (const u of this.units) {
      if (!u.car.destroyed && u.crew.length > 0 && Math.hypot(u.car.position.x - x, u.car.position.z - z) < r) return true;
      for (const o of u.officers) if (o.state === 'cop' && Math.hypot(o.x - x, o.z - z) < r) return true;
    }
    for (const c of this.traffic.patrols()) if (Math.hypot(c.position.x - x, c.position.z - z) < r) return true;
    return false;
  }

  /** Could any police officer (units, patrols, officers on foot) see the point right now? */
  canSee(x: number, y: number, z: number): boolean {
    for (const u of this.units) {
      const c = u.car;
      if (!c.destroyed && u.crew.length > 0) {
        if (inVision(VISION.car, c.position.x, c.position.z, c.heading, x, z) && this.los(c.position.x, c.position.y + 0.8, c.position.z, x, y + 1, z)) return true;
      }
      for (const o of u.officers) {
        if (o.state !== 'cop') continue;
        if (inVision(VISION.foot, o.x, o.z, o.heading, x, z) && this.los(o.x, o.y + 1.6, o.z, x, y + 1, z)) return true;
      }
    }
    for (const c of this.traffic.patrols()) {
      if (inVision(VISION.patrol, c.position.x, c.position.z, c.heading, x, z) && this.los(c.position.x, c.position.y + 0.8, c.position.z, x, y + 1, z)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ main update

  update(dt: number, player: PlayerInfo, camera: THREE.Camera): void {
    this.time += dt;
    const stars = this.wanted.stars;
    const p = player.pos;
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);

    // How long the player has been (nearly) stationary.
    const pSpeed = Math.hypot(player.vx, player.vz);
    this.playerStill = pSpeed < 1.5 ? this.playerStill + dt : 0;

    this.traffic.patrolsAllowed = stars === 0;
    if (stars > 0) {
      // Patrol cars nearby join the chase.
      for (const car of this.traffic.patrols()) {
        if (car.position.distanceTo(p) > 260) continue;
        const look = this.traffic.release(car);
        if (look) this.addUnit(car, [look, copLook()], 'respond');
      }
      this.spawnIn -= dt;
      const active = this.units.filter((u) => u.mode !== 'roadblock' && !u.car.destroyed).length;
      if (active < unitsFor(stars) && this.spawnIn <= 0) {
        this.spawnIn = 1.2;
        this.spawnUnit(player);
      }
      this.roadblockIn -= dt;
      const every = rule(stars)?.roadblockEvery ?? 0;
      if (every > 0 && this.roadblockIn <= 0 && player.car && pSpeed > 8) {
        this.roadblockIn = every;
        if (!this.units.some((u) => u.mode === 'roadblock')) this.placeRoadblock(player);
      }
    }

    // Sight: staggered line-of-sight checks.
    let seen = false;
    for (const u of this.units) {
      u.losIn -= dt;
      if (u.losIn <= 0) {
        u.losIn = 0.25;
        u.sees = this.unitSees(u, p);
      }
      if (u.sees) seen = true;
    }
    if (!seen && stars > 0) {
      // Patrols still in traffic (rare once wanted) count too.
      for (const c of this.traffic.patrols()) {
        if (inVision(VISION.patrol, c.position.x, c.position.z, c.heading, p.x, p.z) && this.los(c.position.x, c.position.y + 0.8, c.position.z, p.x, p.y + 1, p.z)) seen = true;
      }
    }
    this.seen = seen;

    // Arrest progress: a grab on foot is quick; dragging someone out of a car takes longer,
    // leaving time to floor it.
    let grab: 'foot' | 'car' | null = null;
    for (const u of [...this.units]) {
      const g = this.updateUnit(u, dt, player, stars);
      if (g === 'foot' || (g === 'car' && grab === null)) grab = g;
    }
    // (At one or two stars an officer takes a moment longer to get the cuffs on, so there's time
    // to see "BEING ARRESTED" and roll out of reach; from three stars they're quick about it.)
    const footRate = stars >= 3 ? 1 : 0.65;
    this.arrest = grab ? this.arrest + dt * (grab === 'car' ? 0.55 : footRate) : Math.max(0, this.arrest - dt * 2);
    if (this.arrest >= 1.1) {
      this.arrest = 0;
      this.events.onBusted();
    }
  }

  private unitSees(u: Unit, p: THREE.Vector3): boolean {
    if ((u.dazedFor ?? 0) > 0) return false;
    const c = u.car;
    if (!c.destroyed && u.crew.length > 0) {
      // A unit already on your tail keeps you in sight within its full range (they're watching you, not the road).
      const v = u.sees ? { ...VISION.car, half: Math.PI } : VISION.car;
      if (inVision(v, c.position.x, c.position.z, c.heading, p.x, p.z) && this.los(c.position.x, c.position.y + 0.8, c.position.z, p.x, p.y + 1, p.z)) return true;
    }
    for (const o of u.officers) {
      if (o.state !== 'cop') continue;
      const v = u.sees ? { ...VISION.foot, half: Math.PI } : VISION.foot;
      if (inVision(v, o.x, o.z, o.heading, p.x, p.z) && this.los(o.x, o.y + 1.6, o.z, p.x, p.y + 1, p.z)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ spawning

  private addUnit(car: Car, crew: HumanoidLook[], mode: Mode): Unit {
    car.driver = 'police';
    car.sirenOn = true;
    car.input.park = mode === 'roadblock';
    const u: Unit = { car, crew, officers: [], mode, route: [], replanIn: 0, sees: false, losIn: Math.random() * 0.25, stuckFor: 0, routeLock: 0, reverseFor: 0, reverseSteer: 0 };
    this.units.push(u);
    return u;
  }

  /**
   * A fresh unit on a road out of sight, heading toward the player. Dispatch knows roughly where you
   * are, so units come in around your current position, biased ahead of where you're driving.
   */
  private spawnUnit(player: PlayerInfo): void {
    const speed = Math.hypot(player.vx, player.vz);
    const lead = clamp(speed * 3, 0, 90);
    const target = speed > 1 ? { x: player.pos.x + (player.vx / speed) * lead, z: player.pos.z + (player.vz / speed) * lead } : { x: player.pos.x, z: player.pos.z };
    // Low wanted levels: the nearest precinct cars respond; higher levels bring units from further out.
    const [near, far] = this.wanted.stars <= 2 ? [90, 170] : [110, 230];
    // Only roads that pass through that ring (a random road anywhere in the city rarely does, which
    // made the response time a lottery).
    const ring = segmentsInRing(this.segs, target, near, far);
    const pool = ring.length ? ring : this.segs;
    for (let tries = 0; tries < 20; tries++) {
      const seg = pool[Math.floor(Math.random() * pool.length)];
      const lo = this.graph.junctionHalf(seg.d) + 6;
      const hi = seg.length - this.graph.stopDistance(seg.d) - 8;
      if (hi <= lo) continue;
      const s = lo + Math.random() * (hi - lo);
      const pt = this.graph.lanePoint(seg.from, seg.d, seg.lane, s);
      const d = Math.hypot(pt.x - target.x, pt.z - target.z);
      const dp = Math.hypot(pt.x - player.pos.x, pt.z - player.pos.z);
      if (d < near || d > far || dp < 80) continue;
      if (dp < 170 && this.frustum.containsPoint(this.tmp.set(pt.x, 1.5, pt.z))) continue;
      if (this.vehicles.cars.some((c) => Math.hypot(c.position.x - pt.x, c.position.z - pt.z) < 9)) continue;
      // Prefer roads heading toward the target.
      const toward = (target.x - pt.x) * DX[seg.d] + (target.z - pt.z) * DZ[seg.d];
      if (toward < 0 && tries < 14) continue;
      const car = this.vehicles.spawn(getSpec('police'), pt.x, pt.z, DIR_HEADING[seg.d]);
      car.setInitialVelocity(DX[seg.d] * 12, DZ[seg.d] * 12);
      // From four stars the tactical unit turns out: helmets, visors and plate vests.
      const officer = (): ReturnType<typeof copLook> => (this.wanted.stars >= 4 ? swatLook() : copLook());
      this.addUnit(car, [officer(), officer()], 'respond');
      return;
    }
  }

  /** Two or three cars across the road ahead of the player, with an officer behind each. */
  private placeRoadblock(player: PlayerInfo): void {
    const vx = player.vx;
    const vz = player.vz;
    let dir: Dir = 0;
    let best = -Infinity;
    for (const d of [0, 1, 2, 3] as Dir[]) {
      const dot = vx * DX[d] + vz * DZ[d];
      if (dot > best) {
        best = dot;
        dir = d;
      }
    }
    let n = this.graph.nodeAhead(player.pos.x, player.pos.z, dir);
    let dist = (n.x - player.pos.x) * DX[dir] + (n.z - player.pos.z) * DZ[dir];
    while (dist < 120 && n.next[dir] >= 0) {
      n = this.graph.node(n.next[dir]);
      dist = (n.x - player.pos.x) * DX[dir] + (n.z - player.pos.z) * DZ[dir];
    }
    if (dist < 80 || n.next[opposite(dir)] < 0) return;
    const back = this.graph.junctionHalf(dir) + 9;
    const cx = n.x - DX[dir] * back;
    const cz = n.z - DZ[dir] * back;
    const offsets = axisOf(dir) === 'ave' ? [-6.6, 0, 6.6] : [-3.3, 3.3];
    const rx = -DZ[dir];
    const rz = DX[dir];
    for (const o of offsets) {
      const x = cx + rx * o;
      const z = cz + rz * o;
      if (this.vehicles.cars.some((c) => Math.hypot(c.position.x - x, c.position.z - z) < 5)) continue;
      const heading = DIR_HEADING[dir] + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      const car = this.vehicles.spawn(getSpec('police'), x, z, heading);
      const u = this.addUnit(car, [], 'roadblock');
      u.block = { x: cx, z: cz, dir, until: this.time + 60 };
      // Officer stands behind the car (further along the player's direction of travel).
      const ox = x + DX[dir] * 3.2;
      const oz = z + DZ[dir] * 3.2;
      if (!this.peds.blocked(ox, oz)) u.officers.push(this.peds.spawnOfficer(ox, oz, this.wanted.stars >= 4 ? swatLook() : copLook(), DIR_HEADING[opposite(dir)]));
    }
  }

  // ------------------------------------------------------------------ per unit

  /** Returns how an officer of this unit is restraining the player this frame, if at all. */
  private updateUnit(u: Unit, dt: number, player: PlayerInfo, stars: number): 'foot' | 'car' | null {
    const car = u.car;
    const p = player.pos;
    // Lost the car: wrecked, despawned, or stolen by the player.
    const carGone = car.destroyed || !this.vehicles.cars.includes(car) || car.driver === 'player';

    // Officers killed or knocked out of the fight are dropped from the unit.
    u.officers = u.officers.filter((o) => o.state === 'cop' || o.state === 'down' || o.state === 'fly');

    // Crew bail out of a burning or flipped car.
    if (!carGone && u.crew.length > 0 && (car.burning || car.flippedTime > 2.5)) this.deploy(u, true);

    if (stars === 0) {
      this.standDown(u, player, dt);
      return null;
    }

    let restraining: 'foot' | 'car' | null = null;
    if (u.officers.length > 0) restraining = this.updateOfficers(u, dt, player);

    if (carGone || u.crew.length === 0) {
      car.input.throttle = 0;
      car.input.brake = 0;
      car.input.steer = 0;
      if (!carGone) car.input.park = true;
      // Nobody left: forget the unit once everyone is gone.
      if (u.officers.length === 0 && (carGone || u.mode !== 'roadblock')) this.removeUnit(u, false);
      else if (u.mode === 'roadblock' && u.block && this.roadblockDone(u, p)) this.removeUnit(u, true);
      return restraining;
    }

    // Far away and out of sight: recycle.
    const dist = Math.hypot(car.position.x - p.x, car.position.z - p.z);
    if (dist > 330 && !this.frustum.containsPoint(this.tmp.set(car.position.x, 1, car.position.z))) {
      this.removeUnit(u, true);
      return restraining;
    }
    if (car.flippedTime > 1 && !this.frustum.containsPoint(this.tmp.set(car.position.x, 1, car.position.z))) car.flipUpright();

    // Blinded or staggered: the driver can't see you and fights the wheel.
    if ((u.dazedFor ?? 0) > 0) {
      u.dazedFor = (u.dazedFor ?? 0) - dt;
      u.sees = false;
      if (u.mode !== 'roadblock' && u.mode !== 'onfoot') {
        car.input.park = false;
        car.input.throttle = 0.25;
        car.input.brake = Math.abs(car.speed) > 14 ? 0.6 : 0;
        car.input.steer = Math.sin(this.time * 2.6 + car.position.x * 0.1) * 0.8;
        car.input.handbrake = false;
        return restraining;
      }
    }

    // Some officers still on foot: wait for them (the others sit in the car).
    if (u.mode === 'onfoot') {
      car.input.throttle = 0;
      car.input.steer = 0;
      car.input.park = true;
      return restraining;
    }

    // Decide what to do. Someone on foot is approached along the road and the officers do the last
    // stretch on foot; a car that's in sight is chased directly.
    u.routeLock = Math.max(0, u.routeLock - dt);
    const targetStill = player.onFoot || this.playerStill > 1.2;
    const deployRange = player.onFoot ? 40 : 28;
    if (u.mode !== 'deploy' && u.sees && dist < deployRange && targetStill) u.mode = 'deploy';
    else if (u.mode !== 'deploy') u.mode = u.sees && dist < 75 && player.car && u.routeLock === 0 ? 'pursue' : 'respond';

    if (u.mode === 'deploy') {
      this.driveTo(u, dt, p.x, p.z, 6, 8);
      // Stopped, or blocked on the way in: get out and go on foot.
      if ((Math.abs(car.speed) < 1.2 && dist < deployRange + 5) || (u.stuckFor > 0.8 && dist < 60)) this.deploy(u, false);
      else if (!targetStill && dist > 35) u.mode = 'pursue';
      return restraining;
    }
    if (u.mode === 'pursue') this.pursue(u, dt, player, stars, dist);
    else this.respond(u, dt, player);
    return restraining;
  }

  /** Wanted level cleared: units go back on patrol, roadblocks pack up. */
  private standDown(u: Unit, player: PlayerInfo, dt: number): boolean {
    const car = u.car;
    const carGone = car.destroyed || !this.vehicles.cars.includes(car) || car.driver === 'player';
    if (!carGone) car.sirenOn = false;
    // Officers on foot walk back to the car and get in.
    for (const o of [...u.officers]) {
      if (o.state !== 'cop') continue;
      if (carGone) continue;
      const door = this.doorPoint(car, u.crew.length === 0 ? -1 : 1);
      if (this.peds.moveToward(o, dt, door.x, door.z, 2.2) < 1.2) this.board(u, o);
    }
    const visible = this.frustum.containsPoint(this.tmp.set(car.position.x, 1, car.position.z));
    const dist = Math.hypot(car.position.x - player.pos.x, car.position.z - player.pos.z);
    if (carGone) {
      if (u.officers.every((o) => Math.hypot(o.x - player.pos.x, o.z - player.pos.z) > 120)) this.removeUnit(u, false);
      return false;
    }
    if (u.officers.some((o) => o.state === 'cop')) {
      car.input.park = true;
      return false;
    }
    if (u.mode === 'roadblock' || u.crew.length === 0) {
      if (!visible || dist > 180) this.removeUnit(u, true);
      return false;
    }
    // Back to ordinary patrol.
    const crew = u.crew[0];
    this.units.splice(this.units.indexOf(u), 1);
    for (const o of u.officers) this.peds.removePed(o);
    this.traffic.adopt(car, crew, true);
    return false;
  }

  private roadblockDone(u: Unit, p: THREE.Vector3): boolean {
    const b = u.block!;
    const passed = (p.x - b.x) * DX[b.dir] + (p.z - b.z) * DZ[b.dir] > 70;
    const visible = this.frustum.containsPoint(this.tmp.set(u.car.position.x, 1, u.car.position.z));
    return (passed || this.time > b.until || this.wanted.stars < 3) && (!visible || Math.hypot(p.x - b.x, p.z - b.z) > 150);
  }

  private removeUnit(u: Unit, removeCar: boolean): void {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    for (const o of u.officers) if (o.state !== 'dead') this.peds.removePed(o);
    if (removeCar && this.vehicles.cars.includes(u.car) && u.car.driver !== 'player') this.vehicles.remove(u.car);
    else if (u.car.driver === 'police') {
      u.car.driver = null;
      u.car.sirenOn = false;
    }
  }

  /** Crew get out (driver side then passenger side). `panic`: bail regardless of where the player is. */
  private deploy(u: Unit, panic: boolean): void {
    const car = u.car;
    u.crew.forEach((look, i) => {
      const side = i === 0 ? -1 : 1;
      const pt = this.doorPoint(car, side, 0.9);
      if (this.peds.blocked(pt.x, pt.z) && !panic) {
        // Try the other side.
        const alt = this.doorPoint(car, -side, 0.9);
        u.officers.push(this.peds.spawnOfficer(alt.x, alt.z, look, car.heading));
      } else u.officers.push(this.peds.spawnOfficer(pt.x, pt.z, look, car.heading));
    });
    u.crew = [];
    u.mode = 'onfoot';
    car.input.throttle = 0;
    car.input.steer = 0;
    car.input.park = true;
  }

  private board(u: Unit, o: Ped): void {
    this.peds.removePed(o);
    u.officers.splice(u.officers.indexOf(o), 1);
    u.crew.push(o.look);
  }

  /** A point beside the car's driver (-1) or passenger (+1) door. */
  private doorPoint(car: Car, side: number, gap = 0.6): Point {
    const v = this.tmp.set(-0.2, 0, side * (car.spec.width / 2 + gap)).applyQuaternion(car.quaternion).add(car.position);
    return { x: v.x, z: v.z };
  }

  /**
   * Officers on foot: chase and grab the player; if the player drives off they run back to the car.
   * Returns true while one of them has hold of the player.
   */
  private updateOfficers(u: Unit, dt: number, player: PlayerInfo): 'foot' | 'car' | null {
    const p = player.pos;
    const car = u.car;
    const carUsable = !car.destroyed && this.vehicles.cars.includes(car) && car.driver !== 'player' && car.flippedTime === 0 && !car.burning;
    let grabbing: 'foot' | 'car' | null = null;
    const fleeingByCar = player.car !== null && Math.hypot(player.vx, player.vz) > 5;
    // Deadly force: from 3 stars, or 2 if the suspect has a gun out.
    const shooting = this.wanted.stars >= 3 || (this.wanted.stars >= 2 && player.armed);
    for (const o of [...u.officers]) {
      if (o.state !== 'cop') continue;
      const dp = Math.hypot(o.x - p.x, o.z - p.z);
      if (shooting && (player.onFoot || (player.car && this.wanted.stars >= 4)) && dp < 45) {
        // Keep a standoff distance and fire when there's a clear line.
        if (dp > 15) this.peds.moveToward(o, dt, p.x, p.z, o.walkSpeed);
        else o.speed = 0;
        o.heading = Math.atan2(-(p.z - o.z), p.x - o.x);
        o.shootCd -= dt;
        if (o.shootCd <= 0) {
          o.shootCd = 0.7 + Math.random() * 0.7;
          if (this.los(o.x, o.y + 1.5, o.z, p.x, p.y + 1, p.z)) {
            const pSpeed = Math.hypot(player.vx, player.vz);
            const chance = Math.max(0.06, Math.min(0.45, 0.45 - dp * 0.007 - pSpeed * 0.035 - (player.car ? 0.15 : 0)));
            this.events.onOfficerFire(o, chance);
          }
        }
        continue;
      }
      // Stranded far from the action with no car: walk off the scene (removed once out of view).
      if (!carUsable && dp > 80 && !this.frustum.containsPoint(this.tmp.set(o.x, 1, o.z))) {
        this.peds.removePed(o);
        u.officers.splice(u.officers.indexOf(o), 1);
        continue;
      }
      const goBack = u.mode !== 'roadblock' && carUsable && (fleeingByCar || dp > 45);
      if (u.mode === 'roadblock' && dp > 40) {
        o.speed = 0;
        o.heading = Math.atan2(-(p.z - o.z), p.x - o.x);
        continue;
      }
      if (goBack) {
        const door = this.doorPoint(car, u.crew.length === 0 ? -1 : 1);
        if (this.peds.moveToward(o, dt, door.x, door.z, o.walkSpeed) < 1.0) this.board(u, o);
        continue;
      }
      if (player.onFoot) {
        const d = this.peds.moveToward(o, dt, p.x, p.z, dp > 1.1 ? o.walkSpeed : 0);
        if (d < 1.3) grabbing = 'foot';
      } else if (player.car) {
        // Pull the driver out of a stopped car.
        const door = this.doorPoint(player.car, -1, 0.5);
        const d = this.peds.moveToward(o, dt, door.x, door.z, o.walkSpeed);
        if (d < 1.4 && Math.abs(player.car.speed) < 1 && grabbing === null) grabbing = 'car';
      }
    }
    // Everyone back aboard: back to driving.
    if (u.mode === 'onfoot' && u.officers.length === 0 && u.crew.length > 0) {
      u.mode = 'respond';
      car.input.park = false;
      car.sirenOn = true;
    }
    return grabbing;
  }

  // ------------------------------------------------------------------ driving

  /** Route along the road network to the player (or where they were last seen). */
  private respond(u: Unit, dt: number, player: PlayerInfo): void {
    const car = u.car;
    const searching = this.wanted.unseenFor > 2;
    const target = searching ? this.wanted.lastKnown : { x: player.pos.x, z: player.pos.z };
    u.replanIn -= dt;
    if (u.replanIn <= 0 || u.route.length === 0) {
      u.replanIn = 2;
      const dir = this.snapDir(car.heading);
      const start = this.graph.nodeAhead(car.position.x, car.position.z, dir);
      let goal = this.graph.nearestNode(target.x, target.z);
      // Searching and already at the last known spot: sweep the surrounding blocks.
      if (searching && Math.hypot(car.position.x - target.x, car.position.z - target.z) < 40) {
        const near = this.graph.nodes.filter((n) => Math.hypot(n.x - target.x, n.z - target.z) < 180);
        goal = near[Math.floor(Math.random() * near.length)] ?? goal;
      }
      const nodes = this.graph.route(start.id, goal.id);
      u.route = nodes.length ? this.graph.routeWaypoints(nodes, dir, 0, 45, 11) : [];
      if (!searching) u.route.push({ x: target.x, z: target.z, vmax: 18 });
    }
    // Drop passed waypoints.
    const f = car.forward(this.fwd);
    while (u.route.length > 1) {
      const w = u.route[0];
      const dx = w.x - car.position.x;
      const dz = w.z - car.position.z;
      if (Math.hypot(dx, dz) < 4 || (dx * f.x + dz * f.z < 0 && Math.hypot(dx, dz) < 12)) u.route.shift();
      else break;
    }
    this.followPath(u, dt, u.route);
  }

  /** Direct chase when the player is in sight. 3+ stars: aim to hit them. */
  private pursue(u: Unit, dt: number, player: PlayerInfo, stars: number, dist: number): void {
    const car = u.car;
    const v = Math.max(5, Math.abs(car.speed));
    const lead = clamp(dist / v, 0, 1.2);
    const aimX = player.pos.x + player.vx * lead;
    const aimZ = player.pos.z + player.vz * lead;
    const pSpeed = Math.hypot(player.vx, player.vz);
    // Ramming is for cars; someone on foot gets driven up to, not run down.
    const ram = (rule(stars)?.ram ?? false) && player.car !== null;
    const vTarget = ram ? car.topSpeed : clamp(pSpeed + (dist - 9) * 0.8, 0, car.topSpeed);
    this.driveTo(u, dt, aimX, aimZ, vTarget, ram ? 0 : 6);
  }

  /** Steer at a point; brake to stop `stopShort` metres before it. */
  private driveTo(u: Unit, dt: number, x: number, z: number, vMax: number, stopShort: number): void {
    const car = u.car;
    const d = Math.hypot(x - car.position.x, z - car.position.z);
    const vStop = Math.sqrt(2 * 6 * Math.max(0, d - stopShort - car.spec.length / 2));
    this.followPath(u, dt, [{ x, z, vmax: Math.min(vMax, stopShort > 0 ? vStop : vMax) }]);
  }

  /** Pure pursuit with traffic avoidance, aggressive speed control and stuck recovery. */
  private followPath(u: Unit, dt: number, path: Waypoint[]): void {
    const car = u.car;
    car.input.park = false;
    const pos = car.position;
    const v = car.speed;
    if (path.length === 0) {
      car.input.throttle = 0;
      car.input.brake = Math.abs(v) > 1 ? 1 : 0;
      return;
    }

    // Stuck: reverse out with opposite lock.
    if (u.reverseFor > 0) {
      u.reverseFor -= dt;
      car.input.throttle = 0;
      car.input.brake = 1;
      car.input.steer = u.reverseSteer;
      car.input.handbrake = false;
      return;
    }

    // Lookahead target along the path.
    const look = clamp(6 + Math.abs(v) * 0.5, 7, 20);
    let target: Point = path[path.length - 1];
    let acc = 0;
    let px = pos.x;
    let pz = pos.z;
    for (const w of path) {
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

    // Swerve around slower traffic in the way.
    this.invQ.copy(car.quaternion).invert();
    let blockGap = Infinity;
    let blockSide = 0;
    for (const c of this.vehicles.cars) {
      if (c === car || c.driver === 'player') continue;
      const dx = c.position.x - pos.x;
      const dz = c.position.z - pos.z;
      if (dx * dx + dz * dz > 900) continue;
      const local = this.tmp.set(dx, 0, dz).applyQuaternion(this.invQ);
      if (local.x < 0 || Math.abs(local.z) > 2.6) continue;
      const gap = local.x - car.spec.length / 2 - c.spec.length / 2;
      if (gap < blockGap) {
        blockGap = gap;
        blockSide = local.z >= 0 ? -1 : 1;
      }
    }
    if (blockGap < 22) {
      const f = car.forward(this.fwd);
      const off = 3.6 * blockSide; // local +z is the car's right
      target = { x: target.x - f.z * off, z: target.z + f.x * off };
    }

    const tx = target.x - pos.x;
    const tz = target.z - pos.z;
    let alpha = Math.atan2(-tz, tx) - car.heading;
    while (alpha > Math.PI) alpha -= Math.PI * 2;
    while (alpha < -Math.PI) alpha += Math.PI * 2;
    const Ld = Math.max(1, Math.hypot(tx, tz));
    const delta = Math.atan2(2 * car.spec.wheelBase * Math.sin(alpha), Ld);
    car.input.steer = clamp(-delta / car.maxSteerAt(v), -1, 1);

    // Speed: honour upcoming limits (corners) braking at ~4.5 m/s^2.
    let vTarget = car.topSpeed;
    acc = 0;
    px = pos.x;
    pz = pos.z;
    for (const w of path) {
      acc += Math.hypot(w.x - px, w.z - pz);
      px = w.x;
      pz = w.z;
      if (acc > 120) break;
      vTarget = Math.min(vTarget, Math.sqrt(w.vmax * w.vmax + 2 * 4.5 * Math.max(0, acc - 3)));
    }
    // Sharp turn needed right now: slow down.
    if (Math.abs(alpha) > 0.9) vTarget = Math.min(vTarget, 7);
    if (blockGap < 6) vTarget = Math.min(vTarget, 4);

    const err = vTarget - v;
    if (Math.abs(alpha) > 2.4 && Math.abs(v) < 4) {
      // Target is behind: three-point turn by reversing with opposite lock.
      u.reverseFor = 1.2;
      u.reverseSteer = -Math.sign(car.input.steer || 1);
    } else if (err > 0.5) {
      car.input.throttle = clamp(err * 0.4, 0.3, 1);
      car.input.brake = 0;
    } else if (err < -1) {
      car.input.throttle = 0;
      car.input.brake = clamp(-err * 0.25, 0.2, 1);
      if (Math.abs(v) < 0.5) car.input.brake = 0;
    } else {
      car.input.throttle = 0.2;
      car.input.brake = 0;
    }
    car.input.handbrake = false;

    // Stuck detection: trying to go but not moving.
    if (car.input.throttle > 0.25 && Math.abs(v) < 1) u.stuckFor += dt;
    else u.stuckFor = Math.max(0, u.stuckFor - dt);
    if (u.stuckFor > 1.6) {
      u.stuckFor = 0;
      u.reverseFor = 1.4;
      u.reverseSteer = -Math.sign(car.input.steer || (Math.random() - 0.5));
      u.replanIn = 0;
      // The direct line is blocked (parked car, kerb, post): stick to the road for a while.
      u.routeLock = 4;
    }
  }

  private snapDir(heading: number): Dir {
    let best: Dir = 0;
    let bestA = Infinity;
    for (const d of [0, 1, 2, 3] as Dir[]) {
      let a = heading - DIR_HEADING[d];
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) < bestA) {
        bestA = Math.abs(a);
        best = d;
      }
    }
    return best;
  }

  /**
   * The player took a police car. If officers were inside they jump out and give chase on foot.
   * Patrol cars taken from traffic arrive here with their crew.
   */
  onCarStolen(car: Car, crewFromTraffic: HumanoidLook[] | null): void {
    let u = this.units.find((x) => x.car === car);
    if (!u && crewFromTraffic) u = this.addUnit(car, crewFromTraffic, 'respond');
    if (!u) return;
    if (u.crew.length > 0) this.deploy(u, true);
    car.sirenOn = false;
    car.input.park = false;
  }

  /** Busted or wasted: every unit stands down immediately and officers vanish from the scene. */
  reset(): void {
    for (const u of [...this.units]) {
      for (const o of u.officers) this.peds.removePed(o);
      u.officers = [];
      const visible = this.frustum.containsPoint(this.tmp.set(u.car.position.x, 1, u.car.position.z));
      if (u.mode === 'roadblock' || u.crew.length === 0 || !visible) this.removeUnit(u, true);
      else {
        this.units.splice(this.units.indexOf(u), 1);
        if (!u.car.destroyed && this.vehicles.cars.includes(u.car)) this.traffic.adopt(u.car, u.crew[0], true);
      }
    }
    this.arrest = 0;
    this.spawnIn = 0;
    this.roadblockIn = 8;
  }
}
