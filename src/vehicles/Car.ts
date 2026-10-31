import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CAR_DURABILITY, GROUP, carDamageTaken, groups, type CarDamageKind } from '../config';
import { clamp, damp } from '../util/math';
import { buildCarVisual, chassisHalfExtents, chassisRestHeight, type CarVisual } from './CarModel';
import type { VehicleSpec } from './specs';
import { DRIFT, DriftState, counterSteer, driftBoost, rearGrip, slipAngle, yawAssist } from './Drift';

export interface CarInput {
  throttle: number;
  brake: number;
  /** -1 left .. 1 right */
  steer: number;
  handbrake: boolean;
  /** Hold the car still with all four brakes (a driver waiting, a roadblock). */
  park?: boolean;
}

export type Driver = 'player' | 'ai' | 'police' | null;

/** Wheels only ray-cast against the world and other cars, never people. */
const WHEEL_RAY_GROUPS = groups(0xffff, GROUP.WORLD | GROUP.CAR);
const CHASSIS_GROUPS = groups(GROUP.CAR, GROUP.WORLD | GROUP.CAR | GROUP.PED);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A rigid-body car on Rapier's ray-cast vehicle controller: real suspension, tyre friction,
 * weight transfer and collisions. Forward is local +X.
 */
export class Car {
  readonly spec: VehicleSpec;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  readonly visual: CarVisual;
  readonly input: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  driver: Driver = null;
  health: number;
  burning = false;
  burnTimer = 0;
  destroyed = false;
  destroyedTimer = 0;
  /** Signed forward speed (m/s). */
  speed = 0;
  /** Lateral (sideways) speed at the rear axle, for skid marks and tyre squeal. */
  rearSlip = 0;
  braking = false;
  /** Strongest crash this step (m/s of sudden velocity change), read and cleared by the manager. */
  impact = 0;
  /** Seconds the car has been upside down. */
  flippedTime = 0;
  sirenOn = false;
  /** Removed from the world: the physics body no longer exists and nothing may touch it. */
  disposed = false;
  /** performance.now() of the last crash above the damage threshold. */
  lastImpactAt = 0;
  /** Slip angle (radians, + = sliding to the car's left) and drift state, player-driven cars only. */
  slip = 0;
  readonly drift = new DriftState();
  /**
   * Per-car tuning on top of the shared spec (Chop Shop mods, nitrous, flat tyres). Multipliers;
   * `armor` divides incoming damage.
   */
  readonly mods = { speed: 1, accel: 1, grip: 1, steer: 1, armor: 1 };
  /** Tyres popped by a spike strip: little grip, half speed, until the car is gone. */
  tyresPopped = false;
  /** Seconds left on an oil slick (low grip). */
  slipFor = 0;
  /** Seconds the anti-roll bars are off (thrown by a shockwave, so it can roll over). */
  tumbleFor = 0;
  /** Stable id once the car is someone's tuned ride. */
  tuneId: string | null = null;
  /** Paint colour (kept so a tuned ride respawns looking the same). */
  readonly color: string;
  private prevSlip = 0;
  private steerAngle = 0;
  private readonly prevVel = new THREE.Vector3();
  private readonly world: RAPIER.World;
  // Interpolation between physics steps for smooth rendering at any refresh rate.
  private readonly prevPos = new THREE.Vector3();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly curPos = new THREE.Vector3();
  private readonly curQuat = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private sirenPhase = 0;

  constructor(world: RAPIER.World, spec: VehicleSpec, x: number, z: number, heading: number, color: string, groundY = 0) {
    this.world = world;
    this.spec = spec;
    this.color = color;
    this.health = spec.health;
    const y = groundY + chassisRestHeight(spec) + 0.05;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, heading);
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.02)
        .setAngularDamping(0.5)
        .setCcdEnabled(true),
    );
    const [hx, hy, hz] = chassisHalfExtents(spec);
    // Box inertia, with the centre of mass pulled down toward the axles for stability.
    const m = spec.mass;
    const ix = (m / 12) * ((2 * hy) ** 2 + (2 * hz) ** 2);
    const iy = (m / 12) * ((2 * hx) ** 2 + (2 * hz) ** 2);
    const iz = (m / 12) * ((2 * hx) ** 2 + (2 * hy) ** 2);
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setMassProperties(m, { x: 0, y: -hy * 0.9, z: 0 }, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 })
        .setFriction(0.35)
        .setRestitution(0.08)
        .setCollisionGroups(CHASSIS_GROUPS),
      this.body,
    );

    this.controller = world.createVehicleController(this.body);
    const restY = chassisRestHeight(spec);
    const sag = 9.81 / (4 * spec.suspensionStiffness);
    // Connection point height so the wheel sits on the ground at rest.
    const connY = spec.wheelRadius + spec.suspensionRest - sag - restY;
    const wheelX = [spec.wheelBase / 2, spec.wheelBase / 2, -spec.wheelBase / 2, -spec.wheelBase / 2];
    const wheelZ = [-spec.track / 2, spec.track / 2, -spec.track / 2, spec.track / 2];
    for (let i = 0; i < 4; i++) {
      this.controller.addWheel(
        { x: wheelX[i], y: connY, z: wheelZ[i] },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: 1 },
        spec.suspensionRest,
        spec.wheelRadius,
      );
      this.controller.setWheelSuspensionStiffness(i, spec.suspensionStiffness);
      this.controller.setWheelSuspensionCompression(i, spec.dampingCompression);
      this.controller.setWheelSuspensionRelaxation(i, spec.dampingRelaxation);
      this.controller.setWheelMaxSuspensionTravel(i, spec.suspensionTravel);
      this.controller.setWheelMaxSuspensionForce(i, spec.mass * 40);
      this.controller.setWheelFrictionSlip(i, spec.grip);
    }

    this.visual = buildCarVisual(spec, color);
    this.readBody();
    this.prevPos.copy(this.curPos);
    this.prevQuat.copy(this.curQuat);
    this.render(1);
  }

  get position(): THREE.Vector3 {
    return this.curPos;
  }

  get quaternion(): THREE.Quaternion {
    return this.curQuat;
  }

  /** World-space forward direction (+X local). */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(1, 0, 0).applyQuaternion(this.curQuat);
  }

  /** Heading angle about +Y (0 = facing +X). */
  get heading(): number {
    const f = this.forward(this.tmpV);
    return Math.atan2(-f.z, f.x);
  }

  /** True while the player is holding a drift. */
  get drifting(): boolean {
    return this.drift.drifting;
  }

  get sleeping(): boolean {
    return this.body.isSleeping();
  }

  wake(): void {
    if (!this.disposed) this.body.wakeUp();
  }

  /** Steering lock available at a given speed (radians). */
  maxSteerAt(v: number): number {
    const k = clamp(Math.abs(v) / 32, 0, 1);
    return this.spec.maxSteer * this.mods.steer * (1 - (1 - this.spec.highSpeedSteer) * k);
  }

  /** Top speed after mods and flat tyres (m/s). */
  get topSpeed(): number {
    return this.spec.maxSpeed * this.mods.speed * (this.tyresPopped ? 0.5 : 1);
  }

  /** Tyre grip after mods, flat tyres and oil. */
  private gripScale(): number {
    return this.mods.grip * (this.tyresPopped ? 0.45 : 1) * (this.slipFor > 0 ? 0.35 : 1);
  }

  /**
   * Changes the car's mass (heavier armour, roof racks). Keeps the shape of the inertia so it
   * handles the same, just heavier.
   */
  setMass(mass: number): void {
    if (this.disposed) return;
    const [hx, hy, hz] = chassisHalfExtents(this.spec);
    const ix = (mass / 12) * ((2 * hy) ** 2 + (2 * hz) ** 2);
    const iy = (mass / 12) * ((2 * hx) ** 2 + (2 * hz) ** 2);
    const iz = (mass / 12) * ((2 * hx) ** 2 + (2 * hy) ** 2);
    this.collider.setMassProperties(mass, { x: 0, y: -hy * 0.9, z: 0 }, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 });
    // Apply now rather than at the next step, so stats read back right away.
    this.body.recomputeMassPropertiesFromColliders();
    this.body.wakeUp();
  }

  /** Controls → wheel forces, then the vehicle controller's suspension/friction solve. Call before world.step. */
  prePhysics(dt: number): void {
    const s = this.spec;
    const c = this.controller;
    const active = this.driver !== null && !this.destroyed;
    if (!active && this.body.isSleeping()) return;

    this.speed = c.currentVehicleSpeed();
    const v = this.speed;
    const inp = this.input;
    if (this.slipFor > 0) this.slipFor -= dt;
    if (this.tumbleFor > 0) this.tumbleFor -= dt;
    const gripK = this.gripScale();
    const maxSpeed = this.topSpeed;
    const engineForce = s.engineForce * this.mods.accel * (this.tyresPopped ? 0.7 : 1);

    // Drift model: only for the player. AI and police cars keep the plain grip model so they never spin out.
    const playerDriven = this.driver === 'player' && active;
    if (playerDriven) {
      const lv = this.body.linvel();
      const f = this.forward(this.tmpV);
      this.prevSlip = this.slip;
      this.slip = v > 0 ? slipAngle(f.x, f.z, lv.x, lv.z) : 0;
      this.drift.update({ dt, speed: v, beta: this.slip, handbrake: inp.handbrake, throttle: inp.throttle, drive: s.drive });
    } else if (this.drift.drifting || this.slip !== 0) {
      this.drift.reset();
      this.slip = 0;
    }
    const drifting = this.drift.drifting;

    // Speed-sensitive steering: full lock when slow, much less at speed. Positive wheel steering turns left.
    // In a drift some lock is always kept, and counter-steer is added towards the slide.
    let maxSteer = this.maxSteerAt(v);
    if (drifting) maxSteer = Math.max(maxSteer, s.maxSteer * DRIFT.driftSteerFloor);
    let target = active ? -inp.steer * maxSteer : 0;
    if (drifting) target = Math.max(-s.maxSteer * this.mods.steer, Math.min(s.maxSteer * this.mods.steer, target + counterSteer(this.slip, s.counterSteerAssist ?? DRIFT.counterSteerAssist, s.maxSteer * this.mods.steer)));
    this.steerAngle += (target - this.steerAngle) * damp(inp.steer === 0 ? 7 : 5, dt);

    let engine = 0;
    // Parked cars (and drivers told to hold still) keep the brakes on.
    let brake = active && !inp.park ? 0 : s.brakeForce * 0.7;
    this.braking = false;
    if (active && !inp.park) {
      if (inp.throttle > 0) {
        if (v < -1) {
          brake = s.brakeForce * inp.throttle;
          this.braking = true;
        } else {
          const t = clamp(v / maxSpeed, 0, 1);
          engine = engineForce * inp.throttle * (1 - t * t);
        }
      }
      if (inp.brake > 0) {
        if (v > 1) {
          brake = s.brakeForce * inp.brake;
          this.braking = true;
        } else if (v > -s.reverseSpeed) {
          engine = -engineForce * 0.45 * inp.brake;
        }
      }
      if (inp.throttle === 0 && inp.brake === 0) brake = s.brakeForce * 0.06; // engine braking / rolling resistance
    }

    const driven = s.drive === 'fwd' ? [0, 1] : s.drive === 'rwd' ? [2, 3] : [0, 1, 2, 3];
    // AWD cars go rear-biased in a drift so the throttle can hold the angle.
    const share = (i: number): number => {
      if (!driven.includes(i)) return 0;
      if (s.drive === 'awd' && drifting) return i < 2 ? (1 - DRIFT.awdRearBias) / 2 : DRIFT.awdRearBias / 2;
      return 1 / driven.length;
    };
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      c.setWheelSteering(i, front ? this.steerAngle : 0);
      c.setWheelEngineForce(i, engine * share(i));
      let b = brake;
      let grip = s.grip;
      if (active && inp.handbrake && !front) {
        b = Math.max(b, s.brakeForce * 1.4);
        grip = s.handbrakeGrip;
      } else if (playerDriven && !front) grip = rearGrip(s, this.slip, drifting, false);
      c.setWheelBrake(i, b);
      c.setWheelFrictionSlip(i, grip * gripK);
    }

    // Aerodynamic downforce keeps fast cars planted.
    this.body.resetForces(true);
    this.body.resetTorques(true);
    const down = 0.0012 * s.mass * v * v;
    if (down > 1) this.body.addForce({ x: 0, y: -down, z: 0 }, true);
    this.antiRoll();
    // Shape the slide: hold the angle the player asks for and catch spins.
    if (playerDriven && drifting) {
      const r2 = (s.wheelBase / 2) ** 2 + (s.length / 4) ** 2;
      const dBeta = (this.slip - this.prevSlip) / Math.max(dt, 1e-3);
      const acc = yawAssist(this.slip, dBeta, inp.steer, inp.throttle);
      this.body.addTorque({ x: 0, y: acc * s.mass * r2, z: 0 }, true);
      // Like rear-wheel thrust: along the nose, which points into the turn, so it keeps speed and tightens the arc.
      const push = driftBoost(this.slip, inp.throttle);
      if (push > 0 && v < maxSpeed * 0.8) {
        const f = this.forward(this.tmpV);
        const fl = Math.hypot(f.x, f.z) || 1;
        this.body.addForce({ x: (f.x / fl) * push * s.mass, y: 0, z: (f.z / fl) * push * s.mass }, true);
      }
    }
    // Stop the snap-back when a drift ends.
    if (playerDriven && this.drift.exitDamp > 0) {
      const w = this.body.angvel();
      const r2 = (s.wheelBase / 2) ** 2;
      this.body.addTorque({ x: 0, y: -w.y * s.mass * r2 * (s.yawDamping ?? DRIFT.yawDamping), z: 0 }, true);
    }

    c.updateVehicle(dt, undefined, WHEEL_RAY_GROUPS);
  }

  /**
   * Anti-roll bars: while at least two wheels touch the ground, a torque resists body roll and pitch
   * (spring toward level + damping). Airborne or tumbling cars get none, so big hits still flip them.
   */
  private antiRoll(): void {
    if (this.tumbleFor > 0) return;
    let contacts = 0;
    for (let i = 0; i < 4; i++) if (this.controller.wheelIsInContact(i)) contacts++;
    if (contacts < 2) return;
    const r = this.body.rotation();
    const up = this.tmpV.set(0, 1, 0).applyQuaternion(this.tmpQ.set(r.x, r.y, r.z, r.w));
    if (up.y < 0.5) return;
    const m = this.spec.mass;
    const k = m * 9;
    const c = m * 1.6;
    const w = this.body.angvel();
    // up x worldUp points along the axis that rotates the car back to level.
    const tx = -up.z * k - w.x * c;
    const tz = up.x * k - w.z * c;
    this.body.addTorque({ x: tx, y: 0, z: tz }, true);
  }

  /** After world.step: crash detection, flip tracking, interpolation snapshot. */
  postPhysics(dt: number): void {
    this.prevPos.copy(this.curPos);
    this.prevQuat.copy(this.curQuat);
    this.readBody();
    const lv = this.body.linvel();
    const dvx = lv.x - this.prevVel.x;
    const dvy = lv.y - this.prevVel.y;
    const dvz = lv.z - this.prevVel.z;
    // Gravity alone changes vy by g*dt per step; ignore that part.
    const dv = Math.hypot(dvx, dvy + 9.81 * dt, dvz);
    if (dv > this.impact) this.impact = dv;
    this.prevVel.set(lv.x, lv.y, lv.z);

    // Sideways velocity at the rear axle.
    const av = this.body.angvel();
    const right = this.tmpV.set(0, 0, 1).applyQuaternion(this.curQuat);
    const rx = -this.spec.wheelBase / 2;
    const f = new THREE.Vector3(1, 0, 0).applyQuaternion(this.curQuat).multiplyScalar(rx);
    // v_point = v + w x r
    const px = lv.x + (av.y * f.z - av.z * f.y);
    const py = lv.y + (av.z * f.x - av.x * f.z);
    const pz = lv.z + (av.x * f.y - av.y * f.x);
    this.rearSlip = px * right.x + py * right.y + pz * right.z;

    const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(this.curQuat).y;
    this.flippedTime = upY < 0.3 && this.body.linvel().y ** 2 + lv.x * lv.x + lv.z * lv.z < 4 ? this.flippedTime + dt : 0;
  }

  /** Starts the car already moving (spawning into traffic) without registering a crash. */
  setInitialVelocity(vx: number, vz: number): void {
    this.body.setLinvel({ x: vx, y: 0, z: vz }, true);
    this.prevVel.set(vx, 0, vz);
  }

  /** Puts the car back on its wheels (player-requested when stuck on its roof or side). */
  flipUpright(): void {
    const h = this.heading;
    const p = this.body.translation();
    const q = new THREE.Quaternion().setFromAxisAngle(UP, h);
    this.body.setTranslation({ x: p.x, y: p.y + 1.2, z: p.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevVel.set(0, 0, 0);
    this.flippedTime = 0;
  }

  private readBody(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.curPos.set(t.x, t.y, t.z);
    this.curQuat.set(r.x, r.y, r.z, r.w);
  }

  /** Writes the interpolated transform and wheel poses into the scene graph. */
  render(alpha: number, dt = 0): void {
    const root = this.visual.root;
    root.position.lerpVectors(this.prevPos, this.curPos, alpha);
    root.quaternion.slerpQuaternions(this.prevQuat, this.curQuat, alpha);
    const c = this.controller;
    for (let i = 0; i < 4; i++) {
      const w = this.visual.wheels[i];
      const conn = c.wheelChassisConnectionPointCs(i);
      const len = c.wheelSuspensionLength(i) ?? this.spec.suspensionRest;
      if (conn) w.pivot.position.set(conn.x, conn.y - len, conn.z);
      w.pivot.rotation.y = c.wheelSteering(i) ?? 0;
      w.spinner.rotation.z = -(c.wheelRotation(i) ?? 0);
    }
    const tailGlow = this.braking ? 2.2 : this.driver ? 0.5 : 0.15;
    this.visual.tail.emissiveIntensity = tailGlow;
    this.visual.head.emissiveIntensity = this.driver && !this.destroyed ? 1.2 : 0.2;
    const lb = this.visual.lightbar;
    if (lb) {
      this.sirenPhase += dt;
      const on = this.sirenOn && !this.destroyed;
      const flash = Math.floor(this.sirenPhase * 6) % 2 === 0;
      lb.red.emissiveIntensity = on ? (flash ? 6 : 0.2) : 0.2;
      lb.blue.emissiveIntensity = on ? (flash ? 0.2 : 6) : 0.2;
    }
  }

  /** Applies damage (scaled by kind: CAR_DURABILITY); returns true the moment the car catches fire. */
  damage(amount: number, kind: CarDamageKind = 'impact'): boolean {
    if (this.destroyed || amount <= 0) return false;
    this.health -= carDamageTaken(amount, kind, this.mods.armor);
    if (this.health <= 0 && !this.burning) {
      this.health = 0;
      this.burning = true;
      this.burnTimer = CAR_DURABILITY.burnSeconds;
      return true;
    }
    return false;
  }

  get health01(): number {
    return clamp(this.health / this.spec.health, 0, 1);
  }

  private shadows: boolean | null = null;
  private shadowMeshes: THREE.Object3D[] | null = null;

  /** Turns the car's shadow on or off (VehicleManager: only near the camera). */
  setShadows(on: boolean): void {
    if (on === this.shadows) return;
    this.shadows = on;
    if (!this.shadowMeshes) {
      // The parts that cast at all (set when the model was built), remembered once.
      this.shadowMeshes = [];
      this.visual.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.castShadow) this.shadowMeshes!.push(o);
      });
    }
    for (const m of this.shadowMeshes) m.castShadow = on;
  }

  /** Burned-out shell: charred paint, no lights, no driving. */
  markDestroyed(): void {
    this.destroyed = true;
    this.burning = false;
    this.driver = null;
    this.sirenOn = false;
    this.visual.paint.color.set(0x1b1a19);
    this.visual.paint.roughness = 0.9;
    this.visual.paint.clearcoat = 0;
    this.visual.paint.metalness = 0.1;
  }

  dispose(scene: THREE.Scene): void {
    if (this.disposed) return;
    this.disposed = true;
    this.driver = null;
    scene.remove(this.visual.root);
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
    this.visual.paint.dispose();
    this.visual.tail.dispose();
    this.visual.head.dispose();
  }
}
