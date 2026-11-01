import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CAR_DURABILITY, WORLD } from '../config';
import { audio } from '../audio/Audio';
import type { Effects } from '../fx/Effects';
import type { CityLayout } from '../world/CityLayout';
import type { ModelLibrary } from '../assets/ModelLibrary';
import { Car } from './Car';
import { chassisRestHeight } from './CarModel';
import { randomSpec, type VehicleSpec } from './specs';

export interface VehicleEvents {
  /** A car blew up at (x, y, z). */
  onExplosion(x: number, y: number, z: number, radius: number): void;
  /** A crash happened; `byPlayerCar` when the player's car was involved. */
  onCrash(strength: number, byPlayerCar: boolean): void;
}

const CRASH_THRESHOLD = CAR_DURABILITY.crashThreshold;
const CRASH_DAMAGE = 55;

/**
 * Keeps parked cars spawned around the player (streaming from the layout's parking spots),
 * runs every car's physics hooks, turns crashes into damage, and handles fire and explosions.
 */
export class VehicleManager {
  readonly cars: Car[] = [];
  /** The player's tuned rides: never streamed out. */
  readonly owned = new Set<Car>();
  private readonly spotCar = new Map<number, Car>();
  private readonly carSpot = new Map<Car, number>();
  private streamTimer = 0;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
    private readonly layout: CityLayout,
    private readonly effects: Effects,
    private readonly events: VehicleEvents,
    private readonly models: ModelLibrary | null = null,
  ) {}

  spawn(spec: VehicleSpec, x: number, z: number, heading: number, color?: string): Car {
    const c = color ?? spec.colors[Math.floor(Math.random() * spec.colors.length)];
    const car = new Car(this.world, spec, x, z, heading, c);
    // Swap in a supplied glTF body if there is one for this model.
    const m = this.models?.vehicleModel(spec.id, spec.length, -chassisRestHeight(spec));
    if (m) {
      car.visual.body.visible = false;
      car.visual.root.add(m.object);
      if (m.hideWheels) for (const w of car.visual.wheels) w.pivot.visible = false;
    }
    this.scene.add(car.visual.root);
    this.cars.push(car);
    return car;
  }

  /** The car a physics collider belongs to (bullet hits), if any. */
  carByCollider(collider: { handle: number }): Car | null {
    for (const c of this.cars) if (!c.disposed && c.collider.handle === collider.handle) return c;
    return null;
  }

  remove(car: Car): void {
    if (car.disposed) return;
    this.owned.delete(car);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    const spot = this.carSpot.get(car);
    if (spot !== undefined) {
      this.spotCar.delete(spot);
      this.carSpot.delete(car);
    }
    car.dispose(this.scene);
  }

  /** Fills parking spots near `focus`; removes abandoned cars far away. `keep` is never removed. */
  stream(dt: number, focus: THREE.Vector3, camera: THREE.Camera, keep: Car | null, force = false): void {
    this.streamTimer -= dt;
    if (this.streamTimer > 0 && !force) return;
    this.streamTimer = 0.4;
    const R = WORLD.carStreamRadius;

    // Despawn: far away and not the player's car. Cars that left their spot free it.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      // Player and AI-driven cars are managed elsewhere (traffic streams its own).
      if (car === keep || car.driver !== null || this.owned.has(car)) continue;
      const p = car.position;
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      const spot = this.carSpot.get(car);
      if (spot !== undefined) {
        const sp = this.layout.parking[spot];
        if (Math.hypot(sp.x - p.x, sp.z - p.z) > 3) {
          this.spotCar.delete(spot);
          this.carSpot.delete(car);
        }
      }
      if (d > R + 40) this.remove(car);
    }

    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    let parked = 0;
    for (const car of this.cars) if (car.driver === null) parked++;

    const spots = this.layout.parking;
    // A few cars per pass (the pass repeats every 0.4 s): spawning a dozen at once after a long
    // drive was a 25 ms frame. `force` (a load, a teleport) still fills everything.
    let budget = force ? Infinity : 3;
    for (let i = 0; i < spots.length && parked < WORLD.maxParkedCars && budget > 0; i++) {
      if (this.spotCar.has(i)) continue;
      const s = spots[i];
      const d = Math.hypot(s.x - focus.x, s.z - focus.z);
      if (d > R) continue;
      // Don't pop cars into view: only spawn out of sight or well away from the camera.
      this.tmp.set(s.x, 1, s.z);
      if (!force && d < 90 && this.frustum.containsPoint(this.tmp)) continue;
      if (this.cars.some((c) => Math.hypot(c.position.x - s.x, c.position.z - s.z) < 6)) continue;
      const car = this.spawn(randomSpec(), s.x, s.z, s.heading);
      budget--;
      this.spotCar.set(i, car);
      this.carSpot.set(car, i);
      parked++;
    }
  }

  prePhysics(dt: number): void {
    for (const car of this.cars) car.prePhysics(dt);
  }

  postPhysics(dt: number, _listener?: THREE.Vector3): void {
    for (const car of this.cars) {
      if (car.sleeping && car.driver === null) continue;
      car.postPhysics(dt);
      if (car.impact > CRASH_THRESHOLD) {
        const strength = car.impact;
        car.lastImpactAt = performance.now();
        car.damage((strength - CRASH_THRESHOLD) * CRASH_DAMAGE * (1500 / car.spec.mass) ** 0.5);
        const p = car.position;
        audio.crash((strength - CRASH_THRESHOLD) / 10, p);
        this.effects.sparks(p.x + (Math.random() - 0.5) * 2, p.y + 0.3, p.z + (Math.random() - 0.5) * 2, Math.min(30, Math.round(strength * 3)));
        this.events.onCrash(strength, car.driver === 'player');
      }
      car.impact = 0;
    }
  }

  /** Per-frame: interpolated rendering, tyre marks/smoke, damage smoke, fire and explosions. */
  frame(dt: number, alpha: number, listener: THREE.Vector3): void {
    for (const car of this.cars) {
      car.render(alpha, dt);
      // Shadows only from cars near the camera: beyond ~70 m a car's shadow is a few pixels, and
      // each one costs shadow-pass draw calls.
      const cp = car.position;
      car.setShadows(Math.abs(cp.x - listener.x) + Math.abs(cp.z - listener.z) < 95);
      if (car.destroyed) {
        car.destroyedTimer += dt;
        if (car.destroyedTimer < 25 && Math.random() < dt * 6) {
          this.effects.engineSmoke(car.position.x, car.position.y + 0.8, car.position.z, 1);
        }
        continue;
      }
      // Tyre marks and smoke when the rear steps out or the wheels lock under braking.
      const slip = Math.abs(car.rearSlip);
      const lockup = car.braking && Math.abs(car.speed) > 12;
      if ((slip > 3.5 && Math.abs(car.speed) > 4) || lockup || (car.input.handbrake && Math.abs(car.speed) > 6 && car.driver)) {
        for (const side of [-1, 1]) {
          car.visual.wheels[side < 0 ? 2 : 3].pivot.getWorldPosition(this.tmp);
          const y = this.tmp.y - car.spec.wheelRadius;
          this.effects.skid(this.tmp.x, y, this.tmp.z, car.heading);
          // Smoke thickens with sideways speed; a held drift pours it out.
          if (slip > 3) {
            const n = car.drifting ? 2 : 1;
            for (let k = 0; k < n; k++) if (Math.random() < (car.drifting ? 0.9 : 0.55)) this.effects.tyreSmoke(this.tmp.x, y, this.tmp.z, Math.min(1, slip / 8));
          }
        }
      }
      // Engine smoke as damage builds up, then fire, then the bang.
      const h = car.health01;
      if (h < 0.4 || car.burning) {
        this.tmp2.set(car.spec.length * 0.38, car.spec.height * 0.2, 0).applyQuaternion(car.quaternion).add(car.position);
        if (Math.random() < dt * (car.burning ? 30 : 4 + (0.4 - h) * 30)) this.effects.engineSmoke(this.tmp2.x, this.tmp2.y, this.tmp2.z, car.burning ? 1 : 0.4 - h);
        if (car.burning) {
          for (let k = 0; k < 2; k++) this.effects.fire(this.tmp2.x, this.tmp2.y, this.tmp2.z);
          car.burnTimer -= dt;
          if (car.burnTimer <= 0) this.explode(car, listener);
        }
      }
    }
  }

  explode(car: Car, _listener?: THREE.Vector3): void {
    if (car.destroyed) return;
    const p = car.position.clone();
    car.markDestroyed();
    this.effects.explosion(p.x, p.y, p.z);
    audio.explosion(p);
    // Throw the wreck up and spin it, shove and damage everything nearby.
    const m = car.spec.mass;
    car.body.applyImpulse({ x: (Math.random() - 0.5) * m * 2, y: m * 6, z: (Math.random() - 0.5) * m * 2 }, true);
    car.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 3, y: (Math.random() - 0.5) * m, z: (Math.random() - 0.5) * m * 3 }, true);
    const radius = 12;
    for (const other of this.cars) {
      if (other === car) continue;
      const d = other.position.distanceTo(p);
      if (d > radius) continue;
      const k = 1 - d / radius;
      const dir = this.tmp.subVectors(other.position, p).normalize();
      const om = other.spec.mass;
      other.body.applyImpulse({ x: dir.x * om * 9 * k, y: om * 4 * k, z: dir.z * om * 9 * k }, true);
      other.damage(other.spec.health * 0.9 * k, 'explosive');
    }
    this.events.onExplosion(p.x, p.y, p.z, radius);
  }

  /**
   * Nearest car the player can get into: distance from the point to the car's footprint (oriented box).
   */
  nearestEnterable(pos: THREE.Vector3, range: number): Car | null {
    let best: Car | null = null;
    let bestD = range;
    for (const car of this.cars) {
      if (car.destroyed || car.disposed || car.driver === 'player') continue;
      const d = this.distanceToFootprint(car, pos);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  distanceToFootprint(car: Car, pos: THREE.Vector3): number {
    const inv = this.tmp2.copy(pos).sub(car.position).applyQuaternion(car.quaternion.clone().invert());
    const dx = Math.max(0, Math.abs(inv.x) - car.spec.length / 2);
    const dz = Math.max(0, Math.abs(inv.z) - car.spec.width / 2);
    const dy = Math.max(0, Math.abs(inv.y) - car.spec.height);
    return Math.hypot(dx, dz, dy);
  }
}
