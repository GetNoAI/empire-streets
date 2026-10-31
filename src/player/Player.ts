import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, PLAYER, groups } from '../config';
import { damp, wrapAngle } from '../util/math';
import type { Car } from '../vehicles/Car';
import { Humanoid, type CharacterModel } from './Humanoid';

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

  constructor(
    world: RAPIER.World,
    x: number,
    y: number,
    z: number,
    model?: CharacterModel | null,
  ) {
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

  get isKnockedDown(): boolean {
    return this.knockedDown > 0;
  }

  /**
   * One physics step of walking. `moveX/moveZ` is the desired direction in world space (length <= 1).
   */
  step(dt: number, moveX: number, moveZ: number, sprint: boolean, walk: boolean, jump: boolean): void {
    this.prevPos.copy(this.curPos);
    const len = Math.hypot(moveX, moveZ);
    const base = this.dead || this.knockedDown > 0 ? 0 : walk ? PLAYER.walkSpeed : sprint && this.canSprint ? PLAYER.sprintSpeed : PLAYER.jogSpeed;
    const speed = base * this.speedMult;
    const tx = len > 0.01 ? (moveX / Math.max(1, len)) * speed : 0;
    const tz = len > 0.01 ? (moveZ / Math.max(1, len)) * speed : 0;
    // Quick but not instant acceleration on the ground; little air control (none after a jump pad).
    const accel = this.grounded ? 14 : 2.5;
    if (!this.launched) {
      this.velocity.x += (tx - this.velocity.x) * damp(accel, dt);
      this.velocity.z += (tz - this.velocity.z) * damp(accel, dt);
    }
    if (this.grounded && jump && this.knockedDown <= 0 && !this.dead) this.velocity.y = PLAYER.jumpSpeed;
    this.velocity.y -= 9.81 * dt;

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
    this.grounded = this.controller.computedGrounded();
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
  takeDamage(amount: number): boolean {
    if (this.dead || amount <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  teleport(x: number, y: number, z: number): void {
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
      this.model.update(dt, this.planarSpeed, this.grounded);
    }
  }
}
