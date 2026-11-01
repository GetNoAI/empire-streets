import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, PLAYER, groups } from '../config';
import { damp, wrapAngle } from '../util/math';
import type { Car } from '../vehicles/Car';
import { Humanoid, type CharacterModel } from './Humanoid';
import { POND, wadeFactor, type WaterState } from '../world/Pond';
import { Dodge, ROLL, type DamageKind, type DodgeKind } from './Roll';

/** Water under a point (the pond, the sewer pools): its surface height and its depth there. */
export type WaterProbe = (x: number, z: number) => { surface: number; depth: number; toxic?: boolean } | null;

/** Kinematic capsule driven by Rapier's character controller: walls, steps, slopes and curbs. */
export class Player {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  model: CharacterModel;
  health: number = PLAYER.maxHealth;
  vehicle: Car | null = null;
  dead = false;
  /** Facing angle about +Y (0 = +X). */
  facing = 0;
  /** Carrying something heavy (heist loot): speed multiplier on foot, and whether sprinting is possible. */
  speedMult = 1;
  canSprint = true;
  grounded = true;
  /** When set (aiming), the player faces this heading instead of where they walk. */
  facingOverride: number | null = null;
  readonly velocity = new THREE.Vector3();
  /** Knock-back velocity from being hit, decays over time. */
  private readonly knock = new THREE.Vector3();
  private knockedDown = 0;
  private readonly prevPos = new THREE.Vector3();
  private readonly curPos = new THREE.Vector3();
  private planarSpeed = 0;
  /** Thrown by a jump pad: no air control until landing, so the arc lands where it was aimed. */
  private launched = false;
  private wasGrounded = true;
  /** Downward speed at the last touchdown (m/s), for fall damage; read and cleared by the game. */
  landingSpeed = 0;
  /** Extra movement this step (m/s), e.g. a sewer current; cleared after each step. */
  readonly push = new THREE.Vector3();
  /** Water (set by the game: the pond, the sewer pools): wading slows you, deep water and you swim. */
  water: WaterProbe | null = null;
  /** The water you're in is toxic (sewer sludge): the game takes health for it. */
  inToxic = false;
  waterState: WaterState = 'dry';
  /** Water at your feet (m) while wading or swimming. */
  waterDepth = 0;
  /** Downward speed (m/s) when you last hit the water: read and cleared by the game (a splash). */
  splash = 0;
  private swimClock = 0;
  private readonly world: RAPIER.World;
  /** Climbing over (or up onto) something: an arc from `from` to `to` over `dur` seconds. */
  private mantle: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; peak: number } | null = null;
  /** Read and cleared by the game (a grunt, a tutorial tick). */
  mantled = false;
  /** Rolls and dives (Roll.ts): stamina, i-frames. */
  readonly dodge = new Dodge();
  /** A hit that the i-frames ate (read and cleared by the game for a "dodged" flash). */
  dodgedHit = false;

  constructor(
    world: RAPIER.World,
    x: number,
    y: number,
    z: number,
    model?: CharacterModel | null,
  ) {
    this.world = world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + PLAYER.halfHeight + PLAYER.radius, z));
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius).setCollisionGroups(groups(GROUP.PLAYER, GROUP.WORLD | GROUP.CAR | GROUP.PED)),
      this.body,
    );
    this.controller = world.createCharacterController(0.02);
    this.controller.enableAutostep(0.4, 0.15, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(85);
    this.model = model ?? new Humanoid({ skin: '#c58c64', hair: '#1d140e', top: '#2b3e57', legs: '#2b2b30', shoes: '#151515', scale: 1 });
    this.readBody();
    this.prevPos.copy(this.curPos);
  }

  get position(): THREE.Vector3 {
    return this.curPos;
  }

  get feet(): THREE.Vector3 {
    return new THREE.Vector3(this.curPos.x, this.curPos.y - PLAYER.halfHeight - PLAYER.radius, this.curPos.z);
  }

  get onFoot(): boolean {
    return !this.vehicle && !this.dead;
  }

  get swimming(): boolean {
    return this.waterState === 'swimming' && !this.vehicle;
  }

  get isKnockedDown(): boolean {
    return this.knockedDown > 0;
  }

  /**
   * One physics step of walking. `moveX/moveZ` is the desired direction in world space (length <= 1).
   */
  step(dt: number, moveX: number, moveZ: number, sprint: boolean, walk: boolean, jump: boolean): void {
    this.prevPos.copy(this.curPos);
    const len = Math.hypot(moveX, moveZ);
    // Mid-climb: follow the arc, nothing else.
    if (this.mantle) {
      const m = this.mantle;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const e = k * k * (3 - 2 * k);
      const x = m.from.x + (m.to.x - m.from.x) * e;
      const z = m.from.z + (m.to.z - m.from.z) * e;
      // Up first (hands on top), then over.
      const yUp = m.from.y + (m.peak - m.from.y) * Math.min(1, k / 0.55);
      const y = k < 0.55 ? yUp : m.peak + (m.to.y - m.peak) * ((k - 0.55) / 0.45);
      this.body.setNextKinematicTranslation({ x, y, z });
      this.curPos.set(x, y, z);
      this.planarSpeed = 2;
      this.grounded = false;
      if (k >= 1) {
        this.mantle = null;
        this.velocity.set(0, 0, 0);
        this.wasGrounded = false;
      }
      return;
    }
    this.dodge.update(dt);
    const dg = this.dodge.active;
    if (dg) {
      // Rolling: along the roll at its own speed (walls still stop you), gravity as normal.
      const sp = this.dodge.speed();
      this.velocity.x = dg.dirX * sp;
      this.velocity.z = dg.dirZ * sp;
      this.velocity.y -= 9.81 * dt;
      const mvD = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
      this.controller.computeColliderMovement(this.collider, mvD, undefined, groups(0xffff, GROUP.WORLD | GROUP.CAR));
      const mv = this.controller.computedMovement();
      this.grounded = this.controller.computedGrounded();
      if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
      const t0 = this.body.translation();
      this.body.setNextKinematicTranslation({ x: t0.x + mv.x, y: t0.y + mv.y, z: t0.z + mv.z });
      this.curPos.set(t0.x + mv.x, t0.y + mv.y, t0.z + mv.z);
      this.planarSpeed = Math.hypot(mv.x, mv.z) / dt;
      this.wasGrounded = this.grounded;
      if (this.facingOverride !== null) this.facing = wrapAngle(this.facing + wrapAngle(this.facingOverride - this.facing) * damp(30, dt));
      return;
    }
    // Jumping into something waist- to head-high: climb it (a wall, a car, crates, a container).
    if (jump && this.grounded && len > 0.3 && !this.dead && this.knockedDown <= 0 && this.waterState === 'dry' && !this.vehicle && this.tryMantle(moveX / len, moveZ / len)) return;
    // Water: wading over the shelf, swimming once it's deep (with a little hysteresis at the drop).
    const feetY = this.curPos.y - PLAYER.halfHeight - PLAYER.radius;
    const wasState = this.waterState;
    const wtr = this.water?.(this.curPos.x, this.curPos.z) ?? null;
    let surface: number = POND.surface;
    if (wtr && feetY < wtr.surface - 0.05) {
      surface = wtr.surface;
      const deep = wtr.depth;
      const swim = wasState === 'swimming' ? deep > POND.swimDepth - 0.15 : deep >= POND.swimDepth && feetY < surface - 0.7;
      this.waterState = swim ? 'swimming' : 'wading';
      this.waterDepth = surface - feetY;
      this.inToxic = !!wtr.toxic;
    } else {
      this.waterState = 'dry';
      this.waterDepth = 0;
      this.inToxic = false;
    }
    if (wasState === 'dry' && this.waterState !== 'dry' && this.velocity.y < -1.5) this.splash = -this.velocity.y;
    const swimming = this.waterState === 'swimming';
    const out = this.dead || this.knockedDown > 0;
    // Sprinting (and fast swimming) burns stamina while you're actually moving.
    const sprinting = !out && !walk && len > 0.1 && this.dodge.sprint(sprint && (swimming || this.canSprint) && !this.dodge.active, dt);
    const base = out ? 0 : swimming ? (sprinting ? POND.swimSprint : POND.swimSpeed) : walk ? PLAYER.walkSpeed : sprinting ? PLAYER.sprintSpeed : PLAYER.jogSpeed;
    const speed = base * this.speedMult * (this.waterState === 'wading' ? wadeFactor(this.waterDepth) : 1) * (this.dodge.winded > 0 ? ROLL.winded.speed : 1);
    const tx = len > 0.01 ? (moveX / Math.max(1, len)) * speed : 0;
    const tz = len > 0.01 ? (moveZ / Math.max(1, len)) * speed : 0;
    // Quick but not instant acceleration on the ground; little air control (none after a jump pad).
    const accel = swimming ? 3.5 : this.grounded ? 14 : 2.5;
    if (!this.launched) {
      this.velocity.x += (tx - this.velocity.x) * damp(accel, dt);
      this.velocity.z += (tz - this.velocity.z) * damp(accel, dt);
    }
    if (swimming) {
      // Float: the water holds you with your head out, bobbing on the waves; a fall in slows fast.
      this.swimClock += dt;
      const target = surface - POND.floatDepth;
      const want = Math.max(-2.5, Math.min(1.6, (target - feetY) * 3));
      this.velocity.y += (want - this.velocity.y) * damp(5, dt);
    } else {
      if (this.grounded && jump && this.knockedDown <= 0 && !this.dead && this.waterDepth < 0.8) this.velocity.y = PLAYER.jumpSpeed;
      this.velocity.y -= 9.81 * dt;
      // Water slows a fall into it.
      if (this.waterState === 'wading' && this.velocity.y < 0) this.velocity.y *= 1 - damp(3, dt);
    }

    this.knock.multiplyScalar(1 - damp(this.grounded ? 5 : 0.5, dt));
    if (this.knockedDown > 0) this.knockedDown -= dt;

    const desired = {
      x: (this.velocity.x + this.knock.x + this.push.x) * dt,
      y: (this.velocity.y + this.knock.y) * dt,
      z: (this.velocity.z + this.knock.z + this.push.z) * dt,
    };
    this.push.set(0, 0, 0);
    this.controller.computeColliderMovement(this.collider, desired, undefined, groups(0xffff, GROUP.WORLD | GROUP.CAR));
    const mv = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded() && !swimming;
    if (this.grounded && !this.wasGrounded && this.velocity.y < 0) {
      this.landingSpeed = -this.velocity.y;
      this.launched = false;
    }
    this.wasGrounded = this.grounded;
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (this.knock.y > 0 && this.grounded) this.knock.y = 0;
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    this.curPos.set(t.x + mv.x, t.y + mv.y, t.z + mv.z);

    this.planarSpeed = Math.hypot(mv.x, mv.z) / dt;
    if (this.facingOverride !== null && this.knockedDown <= 0 && !this.dead) {
      this.facing = wrapAngle(this.facing + wrapAngle(this.facingOverride - this.facing) * damp(30, dt));
    } else if (len > 0.05 && this.knockedDown <= 0 && !this.dead) {
      const target = Math.atan2(-moveZ, moveX);
      this.facing = wrapAngle(this.facing + wrapAngle(target - this.facing) * damp(PLAYER.turnRate, dt));
    }
  }

  /**
   * Looks for a ledge in front: something solid at waist height with its top between 0.5 m and
   * 2.3 m above your feet and room to stand (or crouch past) on top. Starts the climb if so.
   */
  private tryMantle(fx: number, fz: number): boolean {
    const feet = this.curPos.y - PLAYER.halfHeight - PLAYER.radius;
    const g = groups(0xffff, GROUP.WORLD | GROUP.CAR);
    const o = { x: this.curPos.x, y: feet + 0.6, z: this.curPos.z };
    const hit = this.world.castRay(new RAPIER.Ray(o, { x: fx, y: 0, z: fz }), 1.1, true, undefined, g, this.collider);
    if (!hit) return false;
    const reach = hit.timeOfImpact;
    // Find the top: a ray straight down just beyond the face.
    const px = this.curPos.x + fx * (reach + 0.45);
    const pz = this.curPos.z + fz * (reach + 0.45);
    const top = this.world.castRay(new RAPIER.Ray({ x: px, y: feet + 2.6, z: pz }, { x: 0, y: -1, z: 0 }), 2.6, true, undefined, g, this.collider);
    if (!top) return false;
    const topY = feet + 2.6 - top.timeOfImpact;
    const h = topY - feet;
    if (h < 0.5 || h > 2.3) return false;
    // Room above the top for the capsule (or we'd climb into a ceiling).
    const head = this.world.castRay(new RAPIER.Ray({ x: px, y: topY + 0.05, z: pz }, { x: 0, y: 1, z: 0 }), 1.8, true, undefined, g, this.collider);
    if (head) return false;
    // Thin (a barrier, a low wall): vault over to the far side if there's floor; else stand on top.
    const far = this.world.castRay(new RAPIER.Ray({ x: px + fx * 0.9, y: topY + 0.3, z: pz + fz * 0.9 }, { x: 0, y: -1, z: 0 }), h + 0.6, true, undefined, g, this.collider);
    const vault = h < 1.3 && !!far && topY + 0.3 - far.timeOfImpact < topY - 0.4;
    const centre = PLAYER.halfHeight + PLAYER.radius;
    const toX = vault ? px + fx * 1.1 : px + fx * 0.15;
    const toZ = vault ? pz + fz * 1.1 : pz + fz * 0.15;
    const toY = (vault && far ? topY + 0.3 - far.timeOfImpact : topY) + centre + 0.02;
    this.mantle = { t: 0, dur: 0.32 + h * 0.18, from: this.curPos.clone(), to: new THREE.Vector3(toX, toY, toZ), peak: topY + centre + 0.15 };
    this.mantled = true;
    this.facing = Math.atan2(-fz, fx);
    return true;
  }

  /**
   * Roll (or dive, with a gun up) toward (dirX, dirZ): needs to be on your feet, on the ground, not
   * swimming, carrying loot or already busy. Returns false if it didn't happen (no stamina, winded...).
   */
  tryDodge(kind: DodgeKind, dirX: number, dirZ: number): boolean {
    if (this.dead || this.vehicle || this.knockedDown > 0 || this.mantle || !this.grounded || this.waterState !== 'dry' || this.speedMult < 1) return false;
    let len = Math.hypot(dirX, dirZ);
    if (len < 0.2) {
      // No direction held: roll the way you're facing.
      dirX = Math.cos(this.facing);
      dirZ = -Math.sin(this.facing);
      len = 1;
    }
    if (!this.dodge.start(kind, dirX / len, dirZ / len)) return false;
    // A roll turns you; a dive keeps your aim.
    if (kind === 'roll') this.facing = Math.atan2(-dirZ / len, dirX / len);
    return true;
  }

  get rolling(): boolean {
    return !!this.dodge.active;
  }

  get climbing(): boolean {
    return !!this.mantle;
  }

  /** Launched by a jump pad: this velocity, with no air control until landing. */
  launch(vx: number, vy: number, vz: number): void {
    this.velocity.set(vx, vy, vz);
    this.knock.set(0, 0, 0);
    this.launched = true;
    this.grounded = false;
    this.wasGrounded = false;
  }

  get isLaunched(): boolean {
    return this.launched;
  }

  /** Thrown by a car or a blast. */
  knockBack(vx: number, vy: number, vz: number, downTime: number): void {
    this.knock.set(vx, vy, vz);
    this.velocity.set(0, 0, 0);
    this.knockedDown = Math.max(this.knockedDown, downTime);
  }

  /** Returns true if this killed the player. */
  /** `kind`: 'hit' (gunfire, blows, bites, cars: the i-frames dodge these), 'blast' (half), 'env' (never). */
  takeDamage(amount: number, kind: DamageKind = 'hit'): boolean {
    if (this.dead || amount <= 0) return false;
    const f = this.dodge.damageFactor(kind);
    if (f < 1) {
      if (f === 0) this.dodgedHit = true;
      amount *= f;
      if (amount <= 0) return false;
    }
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  teleport(x: number, y: number, z: number): void {
    this.mantle = null;
    const cy = y + PLAYER.halfHeight + PLAYER.radius;
    this.body.setTranslation({ x, y: cy, z }, true);
    this.body.setNextKinematicTranslation({ x, y: cy, z });
    this.curPos.set(x, cy, z);
    this.prevPos.copy(this.curPos);
    this.velocity.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.launched = false;
    this.landingSpeed = 0;
  }

  setCollisionEnabled(on: boolean): void {
    this.collider.setEnabled(on);
  }

  private readBody(): void {
    const t = this.body.translation();
    this.curPos.set(t.x, t.y, t.z);
  }

  /**
   * Swaps the figure (the wardrobe): the new one takes the old one's place and pose in the scene,
   * and the old one is thrown away (whatever it held is let go first, so it can be held again).
   */
  setModel(m: CharacterModel): void {
    const old = this.model;
    const r = old.root;
    old.hold?.(null);
    m.root.position.copy(r.position);
    m.root.rotation.copy(r.rotation);
    const parent = r.parent;
    parent?.remove(r);
    parent?.add(m.root);
    if (this.vehicle) m.sit();
    this.model = m;
    r.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat.dispose();
    });
  }

  /** Interpolated render. When seated in a car the model is parented to the car instead. */
  render(alpha: number, dt: number): void {
    if (this.vehicle) return;
    const m = this.model.root;
    m.position.lerpVectors(this.prevPos, this.curPos, alpha);
    m.position.y -= PLAYER.halfHeight + PLAYER.radius;
    m.rotation.y = this.facing;
    if (this.dead || this.knockedDown > 0) {
      this.model.lieDown();
    } else {
      this.model.standUp();
      if (this.waterState === 'swimming' && this.model.swim) {
        // Lying forward in the water when moving, upright treading water when still.
        const lean = this.model.swim(dt, this.planarSpeed);
        const fx = Math.cos(this.facing);
        const fz = -Math.sin(this.facing);
        m.position.x -= fx * 0.8 * lean;
        m.position.z -= fz * 0.8 * lean;
        m.position.y += 0.85 * lean;
      } else this.model.update(dt, this.planarSpeed, this.dodge.active ? false : this.grounded || this.waterState === 'wading');
    }
    this.tumble(m);
  }

  /** The roll (a forward somersault about the body's middle) or the dive (flat out, then up). */
  private tumble(m: THREE.Object3D): void {
    const a = this.dodge.active;
    if (!a || this.dead) {
      m.rotation.x = 0;
      m.rotation.z = 0;
      m.scale.y = 1;
      return;
    }
    // Which way relative to the body: forward/back (pitch) and sideways (lean).
    const rel = Math.atan2(-a.dirZ, a.dirX) - this.facing;
    const fwd = Math.cos(rel);
    const side = Math.sin(rel);
    const k = Math.min(1, a.t / a.dur);
    let ang: number;
    let lift = 0;
    if (a.kind === 'roll') {
      ang = -k * Math.PI * 2;
      m.scale.y = 1 - 0.42 * Math.sin(k * Math.PI);
      lift = 0.15 * Math.sin(k * Math.PI);
    } else {
      // Launch flat over the first part, slide down, lie, push back up during the recovery.
      const up = a.t > a.dur ? Math.min(1, (a.t - a.dur) / ROLL.dive.recover) : 0;
      ang = -(Math.PI / 2.2) * (k < 0.25 ? k / 0.25 : 1) * (1 - up);
      lift = (k < 0.6 ? Math.sin((k / 0.6) * Math.PI) * 0.55 : 0) + 0.25 * (1 - up) * Math.min(1, k * 4);
      m.scale.y = 1;
    }
    // The tucked body's middle (it shrinks as it curls up).
    const c = 0.9 * m.scale.y * 0.62;
    m.rotation.z = ang * fwd;
    m.rotation.x = -ang * side;
    // Keep the body's middle on the arc rather than spinning about the feet.
    const s = Math.sin(ang);
    const cs = Math.cos(ang);
    const fx = Math.cos(this.facing);
    const fz = -Math.sin(this.facing);
    m.position.x += fx * c * s * fwd;
    m.position.z += fz * c * s * fwd;
    m.position.y += c * (1 - cs) + lift;
  }
}
