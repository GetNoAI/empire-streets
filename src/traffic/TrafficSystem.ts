import * as THREE from 'three';
import { audio } from '../audio/Audio';
import type { Ped } from '../peds/PedestrianSystem';
import { copLook, randomLook } from '../peds/CrowdRenderer';
import type { HumanoidLook } from '../player/Humanoid';
import { clamp } from '../util/math';
import type { Car } from '../vehicles/Car';
import { VEHICLES, getSpec, type VehicleSpec } from '../vehicles/specs';
import type { VehicleManager } from '../vehicles/VehicleManager';
import { DIR_HEADING, DX, DZ, axisOf, opposite, turnLeft, turnRight, type Dir, type Node, type Point, type RoadGraph } from './RoadGraph';
import type { Signals } from './Signals';

interface Waypoint extends Point {
  /** Speed limit at this point (m/s). */
  vmax: number;
  /** Set on the stop-line point of an approach. */
  stop?: { node: number; dir: Dir; exit: Dir };
}

interface Driver {
  car: Car;
  look: HumanoidLook;
  /** A patrol car: two officers, handed to the police system when you're wanted. */
  police: boolean;
  path: Waypoint[];
  /** Planning cursor: next node to plan a turn at, arriving in `dir` on `lane`. */
  planNode: number;
  planDir: Dir;
  planLane: number;
  cruise: number;
  stuck: number;
  honkCd: number;
  shaken: number;
  /** Time spent with nowhere to go (for despawning gridlocked cars). */
  blockedFor: number;
  /** Light showing when the car last crossed a stop line (debugging / tests). */
  lastStopPass: { node: number; light: string; t: number } | null;
}

export interface TrafficEvents {
  /** A driver left their car (crash, fire, or carjacked). */
  onDriverExit(car: Car, look: HumanoidLook, threatX: number, threatZ: number): void;
}

/** Traffic models only: no police in ordinary traffic. */
const TRAFFIC_SPECS: readonly VehicleSpec[] = VEHICLES.filter((v) => v.id !== 'police');
const TURN_SPEED = 6.5;

/**
 * AI drivers on the same physics cars as the player. They follow lanes, plan turns at junctions,
 * keep their distance, stop at red lights and for pedestrians, yield before turning left, react to
 * crashes, and stream in and out around the player.
 */
export class TrafficSystem {
  readonly drivers: Driver[] = [];
  private readonly byCar = new Map<Car, Driver>();
  private spawnTimer = 0;
  private readonly segs: ReturnType<RoadGraph['segments']>;
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly invQ = new THREE.Quaternion();
  private readonly listener = new THREE.Vector3();
  maxCars = 26;
  radius = 230;
  /** Patrol cars kept in ordinary traffic. */
  maxPatrols = 2;

  constructor(
    private readonly graph: RoadGraph,
    private readonly signals: Signals,
    private readonly vehicles: VehicleManager,
    private readonly events: TrafficEvents,
  ) {
    this.segs = graph.segments();
  }

  isAi(car: Car): boolean {
    return this.byCar.has(car);
  }

  lookOf(car: Car): HumanoidLook | null {
    return this.byCar.get(car)?.look ?? null;
  }

  /** Seated drivers (and patrol partners) for rendering. */
  seated(): Array<{ car: Car; look: HumanoidLook; passenger?: boolean }> {
    const out: Array<{ car: Car; look: HumanoidLook; passenger?: boolean }> = [];
    for (const d of this.drivers) {
      out.push({ car: d.car, look: d.look });
      if (d.police) out.push({ car: d.car, look: d.look, passenger: true });
    }
    return out;
  }

  /** Patrol cars currently in traffic. */
  patrols(): Car[] {
    return this.drivers.filter((d) => d.police).map((d) => d.car);
  }

  /**
   * Takes over an existing car as an ordinary (law-abiding) driver from wherever it is,
   * e.g. police going back on patrol once you've lost them.
   */
  adopt(car: Car, look: HumanoidLook, police: boolean): void {
    if (this.byCar.has(car)) return;
    const h = car.heading;
    // Snap the heading to the nearest road direction.
    const dirs: Dir[] = [0, 1, 2, 3];
    let dir: Dir = 0;
    let best = Infinity;
    for (const d of dirs) {
      let a = h - DIR_HEADING[d];
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) < best) {
        best = Math.abs(a);
        dir = d;
      }
    }
    const node = this.graph.nodeAhead(car.position.x, car.position.z, dir);
    car.driver = 'ai';
    car.sirenOn = false;
    car.input.park = false;
    const drv: Driver = {
      car,
      look,
      police,
      path: [],
      planNode: node.id,
      planDir: dir,
      planLane: 0,
      cruise: 11 + Math.random() * 3,
      stuck: 0,
      honkCd: 0,
      shaken: 0,
      blockedFor: 0,
      lastStopPass: null,
    };
    this.drivers.push(drv);
    this.byCar.set(car, drv);
    this.plan(drv);
  }

  /** Detach the AI driver (carjacking): returns their look so a pedestrian can take over. */
  release(car: Car): HumanoidLook | null {
    const d = this.byCar.get(car);
    if (!d) return null;
    this.byCar.delete(car);
    this.drivers.splice(this.drivers.indexOf(d), 1);
    car.driver = null;
    car.input.throttle = 0;
    car.input.brake = 0;
    car.input.steer = 0;
    return d.look;
  }

  // ------------------------------------------------------------------ spawning & planning

  /** Initial fill: spawns ignore the timer (camera checks still apply). */
  populate(focus: THREE.Vector3, camera: THREE.Camera): void {
    for (let i = 0; i < 12 && this.drivers.length < this.maxCars; i++) {
      this.spawnTimer = 0;
      this.stream(0, focus, camera);
    }
  }

  private stream(dt: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.5;
    for (let k = this.drivers.length - 1; k >= 0; k--) {
      const d = this.drivers[k];
      const p = d.car.position;
      const dist = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (dist > this.radius + 40 || (d.blockedFor > 30 && dist > 80) || d.car.destroyed) this.despawn(d);
    }
    if (this.drivers.length >= this.maxCars) return;
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    for (let tries = 0; tries < 8 && this.drivers.length < this.maxCars; tries++) {
      const seg = this.segs[Math.floor(Math.random() * this.segs.length)];
      const lo = this.graph.junctionHalf(seg.d) + 6;
      const hi = seg.length - this.graph.stopDistance(seg.d) - 8;
      if (hi <= lo) continue;
      const s = lo + Math.random() * (hi - lo);
      const p = this.graph.lanePoint(seg.from, seg.d, seg.lane, s);
      const dist = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (dist < 60 || dist > this.radius) continue;
      if (dist < 130 && this.frustum.containsPoint(this.tmp.set(p.x, 1, p.z))) continue;
      if (this.vehicles.cars.some((c) => Math.hypot(c.position.x - p.x, c.position.z - p.z) < 10)) continue;
      const patrol = this.patrolsAllowed && this.drivers.filter((d) => d.police).length < this.maxPatrols && Math.random() < 0.2;
      this.spawnAt(seg.from, seg.d, seg.lane, p, 9, patrol);
    }
  }

  /** Turned off while you're wanted: the police system brings its own units. */
  patrolsAllowed = true;

  private spawnAt(from: Node, d: Dir, lane: number, p: Point, initialSpeed = 9, police = false): Driver {
    const spec = police ? getSpec('police') : TRAFFIC_SPECS[weightedIndex(TRAFFIC_SPECS)];
    const car = this.vehicles.spawn(spec, p.x, p.z, DIR_HEADING[d]);
    car.driver = 'ai';
    const f = this.fwd.set(DX[d], 0, DZ[d]);
    car.setInitialVelocity(f.x * initialSpeed, f.z * initialSpeed);
    const drv: Driver = {
      car,
      look: police ? copLook() : randomLook(),
      police,
      path: [],
      planNode: from.next[d],
      planDir: d,
      planLane: lane,
      cruise: 11 + Math.random() * 3,
      stuck: 0,
      honkCd: 0,
      shaken: 0,
      blockedFor: 0,
      lastStopPass: null,
    };
    this.drivers.push(drv);
    this.byCar.set(car, drv);
    this.plan(drv);
    return drv;
  }

  private despawn(d: Driver): void {
    this.byCar.delete(d.car);
    this.drivers.splice(this.drivers.indexOf(d), 1);
    this.vehicles.remove(d.car);
  }

  /** Extends the path until it reaches at least ~70 m ahead. */
  private plan(d: Driver): void {
    let guard = 0;
    while (this.pathLength(d) < 70 && guard++ < 6) {
      const node = this.graph.node(d.planNode);
      const from = d.planDir;
      const exits = this.graph.exits(node, from);
      if (exits.length === 0) return;
      // Mostly straight on, sometimes a turn.
      const weights = exits.map((e) => (e === from ? 3 : e === turnRight(from) ? 1.2 : e === turnLeft(from) ? 0.9 : 0.2));
      const exit = exits[pickWeighted(weights)];
      const laneA = this.graph.laneBeforeTurn(from, exit, d.planLane);
      const laneB = this.graph.laneAfterTurn(from, exit, laneA);
      const stopPt = this.graph.lanePoint(node, from, laneA, -this.graph.stopDistance(from));
      // Approach on the lane needed for the turn (lane changes happen smoothly via pure pursuit).
      const approach = this.graph.lanePoint(node, from, laneA, -this.graph.stopDistance(from) - 18);
      d.path.push({ ...approach, vmax: d.cruise });
      d.path.push({ ...stopPt, vmax: exit === from ? d.cruise : TURN_SPEED, stop: { node: node.id, dir: from, exit } });
      const turn = this.graph.turnPath(node, from, laneA, exit, laneB);
      const vTurn = exit === from ? d.cruise : exit === opposite(from) ? 4 : TURN_SPEED;
      for (const p of turn) d.path.push({ ...p, vmax: vTurn });
      d.planNode = node.next[exit];
      d.planDir = exit;
      d.planLane = laneB;
      if (d.planNode < 0) return;
    }
  }

  private pathLength(d: Driver): number {
    const p = d.car.position;
    let len = 0;
    let px = p.x;
    let pz = p.z;
    for (const w of d.path) {
      len += Math.hypot(w.x - px, w.z - pz);
      px = w.x;
      pz = w.z;
    }
    return len;
  }

  // ------------------------------------------------------------------ driving

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera, peds: Ped[], playerPos: THREE.Vector3 | null): void {
    this.listener.copy(camera.position);
    this.stream(dt, focus, camera);
    for (const d of [...this.drivers]) {
      const car = d.car;
      if (car.driver !== 'ai') {
        // Taken over (player) or abandoned elsewhere.
        this.byCar.delete(car);
        this.drivers.splice(this.drivers.indexOf(d), 1);
        continue;
      }
      this.reactToDamage(d, dt);
      if (!this.byCar.has(car)) continue;
      this.drive(d, dt, peds, playerPos);
    }
  }

  private reactToDamage(d: Driver, dt: number): void {
    const car = d.car;
    if (car.lastImpactAt > 0 && performance.now() - car.lastImpactAt < dt * 1000 + 20) {
      d.shaken = 2.5;
      if (d.honkCd <= 0) {
        audio.honk(car.position.distanceTo(this.listener));
        d.honkCd = 2;
      }
    }
    // A wrecked or burning car gets abandoned.
    if (car.burning || car.health01 < 0.3 || car.flippedTime > 2) {
      const look = this.release(car);
      if (look) {
        const p = car.position;
        this.events.onDriverExit(car, look, p.x, p.z);
      }
    }
  }

  private drive(d: Driver, dt: number, peds: Ped[], playerPos: THREE.Vector3 | null): void {
    const car = d.car;
    const pos = car.position;
    const f = car.forward(this.fwd);
    const v = car.speed;
    d.honkCd -= dt;
    if (d.shaken > 0) d.shaken -= dt;

    // Drop waypoints we've passed.
    while (d.path.length > 0) {
      const w = d.path[0];
      const dx = w.x - pos.x;
      const dz = w.z - pos.z;
      const ahead = dx * f.x + dz * f.z;
      // Stop-line points are only dropped once actually crossed, so nobody creeps over on red.
      // (A stop line counts as crossed when the front bumper reaches it.)
      const passed = w.stop
        ? ahead < car.spec.length / 2 && Math.hypot(dx, dz) < 12
        : Math.hypot(dx, dz) < 3 || (ahead < 0 && Math.hypot(dx, dz) < 10);
      if (passed) {
        if (w.stop) d.lastStopPass = { node: w.stop.node, light: this.signals.light(w.stop.node, axisOf(w.stop.dir)), t: performance.now() };
        d.path.shift();
      } else break;
    }
    if (d.planNode >= 0) this.plan(d);
    if (d.path.length === 0) {
      car.input.throttle = 0;
      car.input.brake = 1;
      d.blockedFor += dt;
      return;
    }

    // ---- steering: pure pursuit on the path
    const look = clamp(5 + Math.abs(v) * 0.55, 6, 16);
    let target = d.path[d.path.length - 1] as Point;
    let acc = 0;
    let px = pos.x;
    let pz = pos.z;
    for (const w of d.path) {
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
    const tx = target.x - pos.x;
    const tz = target.z - pos.z;
    const heading = car.heading;
    const targetHeading = Math.atan2(-tz, tx);
    let alpha = targetHeading - heading;
    while (alpha > Math.PI) alpha -= Math.PI * 2;
    while (alpha < -Math.PI) alpha += Math.PI * 2;
    const Ld = Math.max(1, Math.hypot(tx, tz));
    const delta = Math.atan2(2 * car.spec.wheelBase * Math.sin(alpha), Ld); // positive = left
    car.input.steer = clamp(-delta / car.maxSteerAt(v), -1, 1);

    // ---- speed planning
    let vTarget = d.cruise;
    // Upcoming speed limits (corners), braking at ~2.5 m/s^2.
    acc = 0;
    px = pos.x;
    pz = pos.z;
    let stopBlocked = false;
    // Deceleration we must achieve to stop in time (m/s^2), from lights and obstacles.
    let needDecel = 0;
    for (const w of d.path) {
      acc += Math.hypot(w.x - px, w.z - pz);
      px = w.x;
      pz = w.z;
      if (acc > 80) break;
      vTarget = Math.min(vTarget, Math.sqrt(w.vmax * w.vmax + 2 * 2.5 * Math.max(0, acc - 4)));
      if (w.stop && !stopBlocked) {
        // Distance from the front bumper to the line, leaving a 1 m margin.
        const toLine = acc - car.spec.length / 2 - 1;
        if (this.mustStop(w.stop, toLine, v)) {
          stopBlocked = true;
          vTarget = Math.min(vTarget, Math.sqrt(2 * 3.2 * Math.max(0, toLine)));
          if (toLine < 0.4) vTarget = 0;
          if (v > 0.5) needDecel = Math.max(needDecel, (v * v) / (2 * Math.max(0.4, toLine)));
        }
      }
    }

    // Car / pedestrian / player ahead.
    const gap = this.obstacleAhead(car, peds, playerPos);
    if (gap) {
      const safe = 3 + Math.abs(v) * 0.9;
      const vFollow = gap.speed + (gap.gap - safe) * 0.6;
      const vStop = Math.sqrt(2 * 4.5 * Math.max(0, gap.gap - 2.5));
      vTarget = Math.min(vTarget, Math.max(0, Math.min(vFollow, vStop)));
      if (gap.gap < 2.5) vTarget = 0;
      const closing = v - gap.speed;
      if (closing > 0.5) needDecel = Math.max(needDecel, (closing * closing) / (2 * Math.max(0.4, gap.gap - 2)));
    }
    if (d.shaken > 0) vTarget = Math.min(vTarget, 0);
    // Let emergency vehicles through: slow right down when a siren is close behind.
    if (this.sirenBehind(car)) vTarget = Math.min(vTarget, 2.5);

    // ---- pedals: feed-forward braking when a stop is needed (full brakes give ~7.5 m/s^2), else a P controller.
    const err = vTarget - v;
    if (needDecel > 1.2 && v > 0.3) {
      car.input.throttle = 0;
      car.input.brake = clamp(needDecel / 6.5 + 0.1, 0.15, 1);
    } else if (err > 0.3) {
      car.input.throttle = clamp(err * 0.35, 0, 1);
      car.input.brake = 0;
    } else if (err < -0.6 || vTarget < 0.2) {
      car.input.throttle = 0;
      car.input.brake = vTarget < 0.2 && Math.abs(v) < 0.6 ? 0.25 : clamp(-err * 0.6, 0.15, 1);
      // Brake input reverses once stopped; hold still instead.
      if (Math.abs(v) < 0.3) car.input.brake = 0;
    } else {
      car.input.throttle = 0;
      car.input.brake = 0;
    }
    car.input.handbrake = vTarget < 0.2 && Math.abs(v) < 0.5;

    // Patience: honk at whatever is in the way.
    if (gap && gap.gap < 8 && Math.abs(v) < 0.5 && !stopBlocked) {
      d.stuck += dt;
      if (d.stuck > 3 && d.honkCd <= 0 && gap.isPlayerOrPed) {
        audio.honk(pos.distanceTo(this.listener));
        d.honkCd = 3 + Math.random() * 3;
      }
    } else d.stuck = 0;
    d.blockedFor = Math.abs(v) < 0.3 && !stopBlocked ? d.blockedFor + dt : 0;
  }

  private sirenBehind(car: Car): boolean {
    const pos = car.position;
    for (const c of this.vehicles.cars) {
      if (!c.sirenOn || c === car) continue;
      const dx = c.position.x - pos.x;
      const dz = c.position.z - pos.z;
      if (dx * dx + dz * dz > 1600) continue;
      this.invQ.copy(car.quaternion).invert();
      const local = this.tmp.set(dx, 0, dz).applyQuaternion(this.invQ);
      if (local.x < -2 && local.x > -35 && Math.abs(local.z) < 5) return true;
    }
    return false;
  }

  /** Red (or a yellow we can still stop for), or a left turn with oncoming traffic. */
  private mustStop(stop: { node: number; dir: Dir; exit: Dir }, dist: number, v: number): boolean {
    const light = this.signals.light(stop.node, axisOf(stop.dir));
    // Already over the line when it went red: clear the junction rather than stopping in it.
    if (light === 'red') return dist > -0.8;
    if (light === 'yellow') return dist > (v * v) / (2 * 5) + 2;
    if (stop.exit === turnLeft(stop.dir)) {
      // Yield to oncoming traffic.
      const n = this.graph.node(stop.node);
      const oncoming = opposite(stop.dir);
      for (const c of this.vehicles.cars) {
        const lv = c.body.linvel();
        const sp = Math.hypot(lv.x, lv.z);
        if (sp < 2) continue;
        const dx = c.position.x - n.x;
        const dz = c.position.z - n.z;
        // Approaching the junction from ahead of us, travelling in the oncoming direction.
        const towards = -(dx * DX[oncoming] + dz * DZ[oncoming]);
        const movingOncoming = (lv.x * DX[oncoming] + lv.z * DZ[oncoming]) / sp > 0.7;
        if (movingOncoming && towards > -8 && towards < 45 && Math.abs(dx * DZ[oncoming] - dz * DX[oncoming]) < 12) return dist < 8;
      }
    }
    return false;
  }

  /** Nearest thing in our lane ahead (within ~45 m): distance between bumpers and its speed along our heading. */
  /** Other things traffic must not drive into (police tanks). */
  extraObstacles: (() => Array<{ x: number; y: number; z: number; halfLen: number; halfW: number; vx: number; vz: number }>) | null = null;

  private obstacleAhead(car: Car, peds: Ped[], playerPos: THREE.Vector3 | null): { gap: number; speed: number; isPlayerOrPed: boolean } | null {
    const pos = car.position;
    this.invQ.copy(car.quaternion).invert();
    const f = car.forward(this.fwd);
    const half = car.spec.length / 2;
    let best: { gap: number; speed: number; isPlayerOrPed: boolean } | null = null;
    const consider = (x: number, y: number, z: number, halfLen: number, halfW: number, speedAlong: number, special: boolean): void => {
      const local = this.tmp.set(x - pos.x, y - pos.y, z - pos.z).applyQuaternion(this.invQ);
      if (local.x <= 0 || local.x > 45) return;
      // Widen the corridor toward where we're steering.
      const steerShift = -car.input.steer * clamp(local.x * 0.08, 0, 2.5);
      if (Math.abs(local.z - steerShift) > 1.3 + halfW) return;
      if (Math.abs(local.y) > 3) return;
      const gap = local.x - half - halfLen;
      if (!best || gap < best.gap) best = { gap, speed: speedAlong, isPlayerOrPed: special };
    };
    for (const c of this.vehicles.cars) {
      if (c === car) continue;
      const dx = c.position.x - pos.x;
      const dz = c.position.z - pos.z;
      if (dx * dx + dz * dz > 2500) continue;
      const lv = c.body.linvel();
      consider(c.position.x, c.position.y, c.position.z, c.spec.length / 2, c.spec.width / 2, lv.x * f.x + lv.z * f.z, c.driver === 'player');
    }
    for (const p of peds) {
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      if (dx * dx + dz * dz > 2500) continue;
      consider(p.x, p.y + 0.9, p.z, 0.3, 0.4, 0, true);
    }
    if (playerPos) consider(playerPos.x, playerPos.y, playerPos.z, 0.3, 0.4, 0, true);
    for (const o of this.extraObstacles?.() ?? []) {
      if ((o.x - pos.x) ** 2 + (o.z - pos.z) ** 2 > 2500) continue;
      consider(o.x, o.y, o.z, o.halfLen, o.halfW, o.vx * f.x + o.vz * f.z, false);
    }
    return best;
  }

  clear(): void {
    for (const d of [...this.drivers]) this.despawn(d);
  }
}

function weightedIndex(specs: readonly VehicleSpec[]): number {
  // NYC traffic: lots of cabs.
  const w = specs.map((s) => (s.id === 'taxi' ? 0.45 : s.spawnWeight));
  return pickWeighted(w);
}

function pickWeighted(w: number[]): number {
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}
