import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CAMERA, GROUP, groups } from '../config';
import { clamp, damp, wrapAngle } from '../util/math';

const RAY_GROUPS = groups(0xffff, GROUP.WORLD);

/**
 * Third-person camera. On foot it orbits the player with the mouse; in a car it chases from behind,
 * pulls back and widens the FOV with speed, and lets the mouse look around before easing back.
 * A ray against the world keeps it from clipping into buildings.
 */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.18;
  private carYawOffset = 0;
  private dist: number = CAMERA.footDistance;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  /** Point the camera orbits; wall checks are made from here (the look point may be inside a wall). */
  private readonly pivot = new THREE.Vector3();
  private shakeT = 0;
  private shakeAmp = 0;
  /** 0 = normal follow cam, 1 = fully over the shoulder (blended). */
  private aimBlend = 0;
  private initialised = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly world: RAPIER.World,
  ) {}

  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = 0.5;
  }

  /** Camera-relative ground axes for walking: forward and right in world XZ. */
  groundBasis(): { fx: number; fz: number; rx: number; rz: number } {
    // The camera looks along -(cos yaw, sin yaw) in our yaw convention (see updateFoot).
    const fx = -Math.cos(this.yaw);
    const fz = Math.sin(this.yaw);
    return { fx, fz, rx: -fz, rz: fx };
  }

  /** Weapon recoil: kicks the view up (radians) and a little sideways. */
  kick(up: number): void {
    this.pitch = clamp(this.pitch - up, -0.6, 1.2);
    this.yaw = wrapAngle(this.yaw + (Math.random() - 0.5) * up * 0.4);
  }

  /** World-space direction through the centre of the screen. */
  aimRay(origin: THREE.Vector3, dir: THREE.Vector3): void {
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(dir);
  }

  addMouse(dx: number, dy: number, inCar: boolean, sensitivityScale = 1): void {
    const s = CAMERA.mouseSensitivity * sensitivityScale;
    if (inCar) {
      this.carYawOffset = wrapAngle(this.carYawOffset - dx * s);
    } else {
      this.yaw = wrapAngle(this.yaw - dx * s);
    }
    this.pitch = clamp(this.pitch + dy * s, -0.6, 1.2);
  }

  /**
   * On foot. Yaw convention: the camera sits at target + (cos yaw, ., -sin yaw) * dist, i.e. yaw is the
   * heading (same convention as cars/player) of the direction from the target to the camera.
   */
  updateFoot(dt: number, target: THREE.Vector3, aiming = false, zoomFov = 0): void {
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * damp(12, dt);
    const a = this.aimBlend;
    const head = new THREE.Vector3(target.x, target.y + CAMERA.footHeight - 0.85 + a * 0.12, target.z);
    // Over the right shoulder when aiming: shift the pivot sideways (perpendicular to the view).
    // Screen-right of the view direction (-cos yaw, sin yaw) is (-sin yaw, -cos yaw).
    const side = 0.62 * a;
    head.x -= Math.sin(this.yaw) * side;
    head.z -= Math.cos(this.yaw) * side;
    this.pivot.copy(head);
    const want = CAMERA.footDistance * (1 - a) + 2.1 * a;
    this.dist += (want - this.dist) * damp(10, dt);
    const dir = new THREE.Vector3(Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.sin(this.yaw) * Math.cos(this.pitch));
    const d = this.clearDistance(head, dir, this.dist);
    this.pos.copy(head).addScaledVector(dir, d);
    // Look past the player along the view direction so the crosshair sits on the target.
    this.look.copy(head).addScaledVector(dir, -10 * a);
    if (a < 0.01) this.look.copy(head);
    const fov = zoomFov > 0 && aiming ? zoomFov : CAMERA.baseFov - 12 * a;
    this.apply(dt, fov, true, zoomFov > 0 && aiming);
  }

  /** Heading (yaw convention of cars/player) the camera is looking along. */
  get viewHeading(): number {
    return wrapAngle(this.yaw + Math.PI);
  }

  /** Chase cam. `heading` is the car's heading, `speed` its forward speed. */
  updateCar(dt: number, target: THREE.Vector3, heading: number, speed: number, mouseIdleMs: number): void {
    if (mouseIdleMs > 1500) this.carYawOffset *= 1 - damp(2.5, dt);
    // Behind the car = heading + PI. Reversing looks forward to see where you're going.
    const behind = heading + Math.PI + this.carYawOffset;
    const desiredYaw = wrapAngle(speed < -3 ? behind + Math.PI : behind);
    this.yaw = wrapAngle(this.yaw + wrapAngle(desiredYaw - this.yaw) * damp(mouseIdleMs > 200 ? 4 : 12, dt));
    const desiredPitch = 0.16 + clamp(Math.abs(speed) / 60, 0, 1) * -0.04;
    if (mouseIdleMs > 1500) this.pitch += (desiredPitch - this.pitch) * damp(2, dt);
    const sp = Math.abs(speed);
    const wantDist = CAMERA.carDistance + clamp(sp / 40, 0, 1) * 2.5;
    this.dist += (wantDist - this.dist) * damp(3, dt);
    const pivot = new THREE.Vector3(target.x, target.y + CAMERA.carHeight * 0.55, target.z);
    this.pivot.copy(pivot);
    const dir = new THREE.Vector3(Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.sin(this.yaw) * Math.cos(this.pitch));
    const d = this.clearDistance(pivot, dir, this.dist);
    this.pos.copy(pivot).addScaledVector(dir, d);
    this.look.copy(pivot).addScaledVector(new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading)), clamp(sp * 0.08, 0, 4));
    this.apply(dt, CAMERA.baseFov + clamp(sp / 50, 0, 1) * CAMERA.maxFovBoost, false);
  }

  /** Free-flying overview used by the title screen. */
  updateOrbit(dt: number, centre: THREE.Vector3, radius: number, height: number): void {
    this.yaw = wrapAngle(this.yaw + dt * 0.04);
    this.pos.set(centre.x + Math.cos(this.yaw) * radius, height, centre.z - Math.sin(this.yaw) * radius);
    this.look.copy(centre);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.initialised = false;
  }

  private clearDistance(origin: THREE.Vector3, dir: THREE.Vector3, want: number): number {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRay(ray, want + 0.3, true, undefined, RAY_GROUPS);
    if (!hit) return want;
    return Math.max(0.6, hit.timeOfImpact - 0.3);
  }

  private apply(dt: number, fov: number, snapPos: boolean, snapFov = false): void {
    const cam = this.camera;
    // A bad frame (non-finite target) would otherwise stick forever through the lerp: snap back.
    const p = cam.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) this.initialised = false;
    if (!Number.isFinite(this.pos.x) || !Number.isFinite(this.pos.y) || !Number.isFinite(this.pos.z)) return;
    if (!this.initialised) {
      cam.position.copy(this.pos);
      this.initialised = true;
    } else if (snapPos) {
      cam.position.lerp(this.pos, damp(25, dt));
    } else {
      cam.position.lerp(this.pos, damp(14, dt));
    }
    // Never let smoothing drag the camera into a wall: re-clamp against the pivot.
    const toCam = new THREE.Vector3().subVectors(cam.position, this.pivot);
    const len = toCam.length();
    if (len > 0.01) {
      toCam.divideScalar(len);
      const d = this.clearDistance(this.pivot, toCam, len);
      if (d < len) cam.position.copy(this.pivot).addScaledVector(toCam, d);
    }
    cam.lookAt(this.look);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * (this.shakeT / 0.5);
      cam.rotation.x += (Math.random() - 0.5) * a;
      cam.rotation.y += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = snapFov ? fov : cam.fov + (fov - cam.fov) * damp(snapPos ? 10 : 3, dt);
      cam.updateProjectionMatrix();
    }
  }
}
