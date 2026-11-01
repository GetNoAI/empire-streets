import * as THREE from 'three';
import type { CityLayout, Rect } from './CityLayout';
import { districtAt } from '../creatures/SpawnRules';
import type { District } from '../creatures/Data';

/**
 * Safehouses: a front door in each district you can call home. The first, round the corner from
 * Mama Rust's, is yours from the start; the others are bought. Walk up on foot and press E:
 *
 *  - the game saves (a safehouse is the one place an autosave is guaranteed);
 *  - you're patched up and your team is rested (no clinic fee);
 *  - you can sleep: to the morning, or to the evening when the night spawns are out;
 *  - wasted or busted, you come back at the last one you used instead of the clinic.
 *
 * You can't go in with the police after you (lose them first). Planning is engine-free (unit
 * tested): one door per district, on a block face with a building flush to the pavement, away
 * from the clinics, shops, the Chop Shop, the dealership and each other. The Waterfront one is
 * on a block's outer face, looking across the promenade to the river.
 */

export interface SafehouseSpot {
  id: string;
  name: string;
  district: District;
  /** Door, on the pavement in front of the facade; the facade point behind it; the way the door faces (out to the street). */
  x: number;
  z: number;
  fx: number;
  fz: number;
  nx: number;
  nz: number;
  price: number;
  /** Owned from the start. */
  starter: boolean;
}

export const SAFEHOUSE = {
  /** How close (m) on foot to go in. */
  useRadius: 2.6,
  /** Hours to sleep to: the morning, or the evening. */
  wakeMorning: 7,
  wakeEvening: 20,
} as const;

/** One per district; the one in the district where a new game starts (round the corner from Mama's) is the free starter. */
const PLAN: ReadonlyArray<{ id: string; name: string; starterName: string; district: District; price: number }> = [
  { id: 'uptown', name: 'Uptown Brownstone', starterName: 'Rust Row Walk-up', district: 'uptown', price: 6000 },
  { id: 'midtown', name: 'Midtown Studio', starterName: 'Rust Row Walk-up', district: 'midtown', price: 8000 },
  { id: 'downtown', name: 'Downtown Loft', starterName: 'Rust Row Walk-up', district: 'downtown', price: 15000 },
  { id: 'waterfront', name: 'Pier 9 Container Flat', starterName: 'Pier 9 Container Flat', district: 'waterfront', price: 9000 },
];

export interface SafehouseState {
  owned: string[];
  /** The one you last went into (where you come back after being wasted or busted). */
  last: string | null;
  /** Times you've used each. */
  visits: Record<string, number>;
}

export function newSafehouseState(spots: readonly SafehouseSpot[]): SafehouseState {
  const starter = spots.filter((s) => s.starter).map((s) => s.id);
  return { owned: starter, last: starter[0] ?? null, visits: {} };
}

/** Cleans a saved state (unknown ids dropped; the starter is always owned). */
export function sanitizeSafehouses(raw: unknown, spots: readonly SafehouseSpot[]): SafehouseState {
  const out = newSafehouseState(spots);
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<SafehouseState>;
  const ids = new Set(spots.map((s) => s.id));
  if (Array.isArray(r.owned)) for (const id of r.owned) if (typeof id === 'string' && ids.has(id) && !out.owned.includes(id)) out.owned.push(id);
  if (typeof r.last === 'string' && out.owned.includes(r.last)) out.last = r.last;
  if (r.visits && typeof r.visits === 'object') {
    for (const [k, v] of Object.entries(r.visits)) if (ids.has(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) out.visits[k] = Math.floor(v);
  }
  return out;
}

/**
 * One door per district in PLAN. `avoid`: doors and sites to keep 45 m from. The starter goes as
 * close as it can to `near` (Mama's street, where a new game starts); the rest near the middle
 * of their district.
 */
export function planSafehouses(layout: CityLayout, avoid: ReadonlyArray<{ x: number; z: number }>, near: { x: number; z: number }): SafehouseSpot[] {
  const out: SafehouseSpot[] = [];
  const alleys: Rect[] = (layout.alleys ?? []).map((a) => a.rect);
  const garages: Rect[] = (layout.garages ?? []).map((g) => g.rect);
  const home = districtAt(layout, near.x, near.z);
  // The starter first (it gets the spot nearest Mama's), then the rest.
  const plan = [...PLAN].sort((a, b) => (b.district === home ? 1 : 0) - (a.district === home ? 1 : 0)).map((p) => (p.district === home ? { ...p, name: p.starterName, price: 0, starter: true } : { ...p, starter: false }));
  for (const p of plan) {
    // Candidate doors: on each face of each block, the middle and a third of the way along.
    const cands: Array<Omit<SafehouseSpot, 'id' | 'name' | 'district' | 'price' | 'starter'>> = [];
    for (const b of layout.blocks) {
      const faces: Array<{ nx: number; nz: number; len: number; at: (f: number) => { x: number; z: number; fx: number; fz: number }; flush: (o: Rect, x: number, z: number) => boolean }> = [
        { nx: 0, nz: -1, len: b.x1 - b.x0, at: (f) => ({ x: b.x0 + (b.x1 - b.x0) * f, z: b.z0 + 2.2, fx: b.x0 + (b.x1 - b.x0) * f, fz: b.z0 + 4.5 }), flush: (o, x) => x > o.x0 + 3 && x < o.x1 - 3 && Math.abs(o.z0 - (b.z0 + 4.5)) < 0.6 },
        { nx: 0, nz: 1, len: b.x1 - b.x0, at: (f) => ({ x: b.x0 + (b.x1 - b.x0) * f, z: b.z1 - 2.2, fx: b.x0 + (b.x1 - b.x0) * f, fz: b.z1 - 4.5 }), flush: (o, x) => x > o.x0 + 3 && x < o.x1 - 3 && Math.abs(o.z1 - (b.z1 - 4.5)) < 0.6 },
        { nx: -1, nz: 0, len: b.z1 - b.z0, at: (f) => ({ x: b.x0 + 2.2, z: b.z0 + (b.z1 - b.z0) * f, fx: b.x0 + 4.5, fz: b.z0 + (b.z1 - b.z0) * f }), flush: (o, _x, z) => z > o.z0 + 3 && z < o.z1 - 3 && Math.abs(o.x0 - (b.x0 + 4.5)) < 0.6 },
        { nx: 1, nz: 0, len: b.z1 - b.z0, at: (f) => ({ x: b.x1 - 2.2, z: b.z0 + (b.z1 - b.z0) * f, fx: b.x1 - 4.5, fz: b.z0 + (b.z1 - b.z0) * f }), flush: (o, _x, z) => z > o.z0 + 3 && z < o.z1 - 3 && Math.abs(o.x1 - (b.x1 - 4.5)) < 0.6 },
      ];
      for (const face of faces) {
        if (face.len < 30) continue;
        for (const f of [0.5, 0.3, 0.7]) {
          const d = face.at(f);
          const { x, z } = d;
          // The Waterfront door looks out over the promenade: the road in front of it is Waterfront.
          const where = p.district === 'waterfront' ? districtAt(layout, x + face.nx * 16, z + face.nz * 16) : districtAt(layout, x, z);
          if (where !== p.district) continue;
          if (p.district !== 'waterfront' && districtAt(layout, x + face.nx * 16, z + face.nz * 16) === 'waterfront') continue;
          if (!layout.buildings.some((o) => face.flush(o.rect, x, z))) continue;
          if (alleys.some((a) => x > a.x0 - 6 && x < a.x1 + 6 && z > a.z0 - 6 && z < a.z1 + 6)) continue;
          if (garages.some((g) => x > g.x0 - 6 && x < g.x1 + 6 && z > g.z0 - 6 && z < g.z1 + 6)) continue;
          if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < 45)) continue;
          if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 150)) continue;
          cands.push({ ...d, nx: face.nx, nz: face.nz });
        }
      }
    }
    if (!cands.length) continue;
    let target = near;
    if (!p.starter) {
      // The middle of the district (the average of its candidate doors).
      target = { x: cands.reduce((s, c) => s + c.x, 0) / cands.length, z: cands.reduce((s, c) => s + c.z, 0) / cands.length };
    }
    cands.sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z));
    const c = cands[0];
    out.push({ id: p.id, name: p.name, district: p.district, ...c, price: p.price, starter: !!p.starter });
  }
  return out;
}

/** Hours from `hour` to the next `wake` (sleeping at least an hour). */
export function sleepHours(hour: number, wake: number): number {
  const h = (((wake - hour) % 24) + 24) % 24;
  return h < 1 ? h + 24 : h;
}

// ------------------------------------------------------------------ the doors

export interface SafehouseView {
  root: THREE.Group;
  /** Owned doors glow green, the ones for sale show a red sign. */
  setOwned(owned: readonly string[]): void;
}

export function buildSafehouses(spots: readonly SafehouseSpot[]): SafehouseView {
  const root = new THREE.Group();
  root.name = 'safehouses';
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.8 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x5b1f1a, roughness: 0.6, metalness: 0.1 });
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.95 });
  const ownedLamp = new THREE.MeshBasicMaterial({ color: 0x5dff8a });
  const saleLamp = new THREE.MeshBasicMaterial({ color: 0xff5040 });
  const doors: Array<{ id: string; lamp: THREE.Mesh; sale: THREE.Mesh; light: THREE.PointLight }> = [];
  const saleTex = makeSaleSign();
  for (const s of spots) {
    const g = new THREE.Group();
    g.position.set(s.fx, 0, s.fz);
    // Local -Z is out of the wall, onto the pavement.
    g.rotation.y = Math.atan2(-s.nx, -s.nz);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.9, 0.18), frameMat);
    frame.position.set(0, 0.15 + 1.45, -0.06);
    g.add(frame);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.55, 0.08), doorMat);
    door.position.set(0, 0.15 + 1.3, -0.17);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.9, roughness: 0.3 }));
    knob.position.set(0.55, 0.15 + 1.2, -0.23);
    g.add(knob);
    for (let i = 0; i < 2; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.45 - i * 0.2), stepMat);
      step.position.set(0, 0.15 + 0.06 + i * 0.12, -0.35 + i * 0.1);
      g.add(step);
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.12), ownedLamp);
    lamp.position.set(-1.25, 0.15 + 2.4, -0.2);
    g.add(lamp);
    const light = new THREE.PointLight(0x5dff8a, 0.8, 7, 2);
    light.position.set(-1.25, 0.15 + 2.3, -0.8);
    g.add(light);
    const sale = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.55), new THREE.MeshBasicMaterial({ map: saleTex, transparent: true }));
    sale.position.set(0, 0.15 + 3.25, -0.2);
    sale.rotation.y = Math.PI;
    g.add(sale);
    root.add(g);
    doors.push({ id: s.id, lamp, sale, light });
  }
  return {
    root,
    setOwned(owned) {
      for (const d of doors) {
        const own = owned.includes(d.id);
        d.lamp.material = own ? ownedLamp : saleLamp;
        d.light.color.set(own ? 0x5dff8a : 0xff5040);
        d.light.intensity = own ? 0.8 : 0.35;
        d.sale.visible = !own;
      }
    },
  };
}

function makeSaleSign(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 108;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 0, 256, 108);
  ctx.strokeStyle = '#c0281e';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 100);
  ctx.fillStyle = '#c0281e';
  ctx.font = 'bold 44px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FOR SALE', 128, 56);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
