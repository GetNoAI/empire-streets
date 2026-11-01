import * as THREE from 'three';
import type { Car } from './Car';
import { slotMount, type MountSlot } from './CarModel';
import type { CreatureInstance, CreatureModels } from '../creatures/CreatureModels';
import type { AttackStyle } from '../creatures/models/Motion';
import { withSurface } from '../render/Surfaces';

/**
 * Slotted Streetmon you can see: each one rides in its car's slot, partly inside the body:
 *
 *  - Engine Bay: up through a ring cut in the hood, facing the road, the bottom half hidden in the
 *    engine;
 *  - Trunk: out of the open boot (or tailgate), looking back at whoever's behind;
 *  - Roof Rack: sitting up in a rack on the roof, keeping lookout (it scans side to side).
 *
 * They're the real models with their own animation: they idle, sway with the car (leaning back as
 * it accelerates, forward under braking, out of the turns), and play an attack when their ability
 * fires (a blast for the smokescreen and the bass horn, a shot for the backfire, a throw for the
 * spike strips). Used for your tuned rides and for rival racers' loadouts.
 */

export interface RiderSpec {
  slot: MountSlot;
  speciesId: string;
  shiny: boolean;
}

/** The attack each tuning ability plays on its rider. */
export const ABILITY_STYLE: Record<string, AttackStyle> = {
  nitrousSmokescreen: 'blast',
  exhaustBackfire: 'shoot',
  sonicBassHorn: 'blast',
  spikeStripDispenser: 'throw',
  earlyWarningRadar: 'taunt',
};

interface Mount {
  spec: RiderSpec;
  /** Leans with the car. */
  pivot: THREE.Group;
  /** Faces the right way, scaled and sunk into the body. */
  holder: THREE.Group;
  inst: CreatureInstance | null;
  dressing: THREE.Object3D | null;
  idleAt: number;
  acc: number;
  gone: boolean;
}

interface Ride {
  car: Car;
  key: string;
  mounts: Mount[];
  vx: number;
  vz: number;
  pitch: number;
  roll: number;
  vp: number;
  vr: number;
  t: number;
}

let mats: { hole: THREE.Material; rim: THREE.Material; rack: THREE.Material } | null = null;
const geos: Partial<Record<'hole' | 'rim' | 'bar' | 'post', THREE.BufferGeometry>> = {};

function materials(): NonNullable<typeof mats> {
  mats ??= {
    hole: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }),
    rim: withSurface(new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.25, metalness: 1 }), 'chrome'),
    rack: withSurface(new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6, metalness: 0.6 }), 'paintedMetal'),
  };
  return mats;
}

export class StreetmonRiders {
  private readonly rides = new Map<Car, Ride>();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();

  constructor(private readonly models: CreatureModels) {}

  /** Sets who rides in a car (an empty list: nobody). Cheap when nothing changed. */
  set(car: Car, riders: readonly RiderSpec[]): void {
    const key = riders
      .map((r) => `${r.slot}:${r.speciesId}:${r.shiny ? 1 : 0}`)
      .sort()
      .join('|');
    const cur = this.rides.get(car);
    if (cur?.key === key) return;
    if (cur) this.clear(car);
    if (!riders.length || car.disposed) return;
    const ride: Ride = { car, key, mounts: [], vx: 0, vz: 0, pitch: 0, roll: 0, vp: 0, vr: 0, t: Math.random() * 10 };
    for (const r of riders) ride.mounts.push(this.mount(car, r));
    this.rides.set(car, ride);
  }

  /** Every car with riders. */
  cars(): Car[] {
    return [...this.rides.keys()];
  }

  clear(car: Car): void {
    const ride = this.rides.get(car);
    if (!ride) return;
    for (const m of ride.mounts) {
      m.gone = true;
      m.inst?.dispose();
      m.pivot.removeFromParent();
    }
    this.rides.delete(car);
  }

  /** An ability fired: its rider acts it out. */
  react(car: Car | null | undefined, slot: string, style: AttackStyle): void {
    const ride = car ? this.rides.get(car) : null;
    const m = ride?.mounts.find((x) => x.spec.slot === slot);
    if (!m?.inst) return;
    const a = m.inst.attack(style);
    m.idleAt = ride!.t + a.duration;
  }

  /** Per frame: the riders lean with their cars and animate (less often further away). */
  update(dt: number, camera: THREE.Vector3): void {
    for (const [car, ride] of [...this.rides]) {
      if (car.disposed || car.destroyed) {
        this.clear(car);
        continue;
      }
      ride.t += dt;
      // The car's acceleration in its own frame: lean back when it speeds up, forward when it
      // brakes, out of the turns (a sprung lean, so it overshoots and settles).
      const lv = car.body.linvel();
      const ax = dt > 0 ? (lv.x - ride.vx) / dt : 0;
      const az = dt > 0 ? (lv.z - ride.vz) / dt : 0;
      ride.vx = lv.x;
      ride.vz = lv.z;
      this.q.copy(car.visual.root.quaternion).invert();
      const a = this.v.set(ax, 0, az).applyQuaternion(this.q);
      const clampA = (x: number): number => Math.max(-25, Math.min(25, x));
      const tp = clampA(a.x) * 0.018;
      const tr = -clampA(a.z) * 0.02;
      const k = 60;
      const c = 9;
      ride.vp += (k * (tp - ride.pitch) - c * ride.vp) * dt;
      ride.vr += (k * (tr - ride.roll) - c * ride.vr) * dt;
      ride.pitch += ride.vp * dt;
      ride.roll += ride.vr * dt;
      const dist = car.visual.root.position.distanceTo(camera);
      for (const m of ride.mounts) {
        m.pivot.rotation.set(Math.max(-0.35, Math.min(0.35, ride.roll)), 0, Math.max(-0.3, Math.min(0.3, ride.pitch)));
        if (m.spec.slot === 'roofRack') m.holder.rotation.y = Math.PI / 2 + 0.55 * Math.sin(ride.t * 0.7) * Math.abs(Math.sin(ride.t * 0.23));
        const inst = m.inst;
        if (!inst) continue;
        if (m.idleAt > 0 && ride.t >= m.idleAt) {
          inst.play('idle', 0.2);
          m.idleAt = 0;
        }
        if (dist > 150) continue;
        m.acc += dt;
        if (dist < 35 || m.acc >= 1 / 15) {
          inst.mixer.update(m.acc);
          m.acc = 0;
        }
      }
    }
  }

  // ------------------------------------------------------------------ building

  private mount(car: Car, r: RiderSpec): Mount {
    const M = slotMount(car.spec, r.slot);
    const pivot = new THREE.Group();
    pivot.name = `rider-${r.slot}`;
    pivot.position.set(M.x, M.y, 0);
    const holder = new THREE.Group();
    holder.rotation.y = M.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    pivot.add(holder);
    car.visual.root.add(pivot);
    const m: Mount = { spec: r, pivot, holder, inst: null, dressing: null, idleAt: 0, acc: 0, gone: false };
    void this.models.instance(r.speciesId, r.shiny).then((inst) => {
      if (m.gone) {
        inst.dispose();
        return;
      }
      m.inst = inst;
      inst.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inst.root);
      // Floating ones hover above their origin: size and sink by what's actually there.
      const bh = Math.max(0.1, box.max.y - Math.max(0, box.min.y));
      const bw = Math.max(0.1, box.max.x - box.min.x);
      const bd = Math.max(0.1, box.max.z - box.min.z);
      // As tall as the slot allows, but no wider than the car or longer than the deck.
      const s = Math.max(0.12, Math.min(M.height / bh, M.width / bw, Math.max(1.0, M.len * 1.6) / bd));
      inst.root.position.set(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);
      holder.scale.setScalar(s);
      holder.position.y = -(Math.max(0, box.min.y) + M.sink * bh) * s;
      holder.add(inst.root);
      inst.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      inst.play('idle', 0);
      m.dressing = dressing(r.slot, M, bw * s, bd * s);
      if (m.dressing) pivot.add(m.dressing);
    });
    return m;
  }
}

/** The hole it comes out of (a dark opening with a chrome rim) or the roof rack it sits in. */
function dressing(slot: MountSlot, M: ReturnType<typeof slotMount>, w: number, d: number): THREE.Object3D | null {
  const mt = materials();
  const g = new THREE.Group();
  if (slot === 'roofRack') {
    geos.bar ??= new THREE.BoxGeometry(1, 0.04, 0.04);
    geos.post ??= new THREE.BoxGeometry(0.04, 0.08, 0.04);
    const len = Math.max(0.6, M.len * 0.92);
    const half = Math.min(M.width / 2 - 0.06, Math.max(0.3, w * 0.6));
    for (const z of [-half, half]) {
      const rail = new THREE.Mesh(geos.bar, mt.rack);
      rail.scale.set(len, 1, 1);
      rail.position.set(0, 0.09, z);
      g.add(rail);
      for (const x of [-len / 2 + 0.05, len / 2 - 0.05]) {
        const post = new THREE.Mesh(geos.post, mt.rack);
        post.position.set(x, 0.04, z);
        g.add(post);
      }
    }
    for (const x of [-len / 2 + 0.05, 0, len / 2 - 0.05]) {
      const cross = new THREE.Mesh(geos.bar, mt.rack);
      cross.scale.set(half * 2, 1, 1);
      cross.rotation.y = Math.PI / 2;
      cross.position.set(x, 0.1, 0);
      g.add(cross);
    }
  } else {
    geos.hole ??= new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    geos.rim ??= new THREE.TorusGeometry(1, 0.06, 6, 28).rotateX(Math.PI / 2);
    const rx = Math.min(Math.max(0.25, M.len * 0.5), Math.max(0.2, d * 0.6));
    const rz = Math.min(M.width / 2, Math.max(0.2, w * 0.6));
    const hole = new THREE.Mesh(geos.hole, mt.hole);
    hole.scale.set(rx, 1, rz);
    hole.position.y = 0.015;
    const rim = new THREE.Mesh(geos.rim, mt.rim);
    rim.scale.set(rx, 1, rz);
    rim.position.y = 0.03;
    g.add(hole, rim);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}
