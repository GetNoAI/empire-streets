import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { withSurface } from '../render/Surfaces';
import type { District } from '../creatures/Data';
import { districtAt } from '../creatures/SpawnRules';
import type { CityLayout, Rect } from './CityLayout';

/**
 * Buildings you can walk into: corner delis, a diner, offices, a laundromat, an arcade and a pawn
 * shop, each behind a lit door on a facade with its name over it. Press E at the door and you're
 * inside (the city fades out while you are: the rooms are built well below the street, under
 * their own doors, so the minimap and the address stay right).
 *
 * Inside: a furnished room with its own lights, the people who work there and a customer or two
 * to talk to (src/npc/Talk.ts), and something to do (buy supplies at the deli, eat at the diner,
 * change clothes at the laundromat, sell items at the pawn shop, pick up tips at the office).
 * E at the exit door takes you back out onto the pavement.
 *
 * `planInteriors` is engine-free (tested); `buildInterior` makes one room.
 */

export type InteriorKind = 'deli' | 'diner' | 'office' | 'laundromat' | 'arcade' | 'pawn' | 'casino';

export interface InteriorSpot {
  id: string;
  kind: InteriorKind;
  name: string;
  district: District;
  /** The door on the pavement, the facade behind it, and which way the door faces (out to the street). */
  x: number;
  z: number;
  fx: number;
  fz: number;
  nx: number;
  nz: number;
}

export const INTERIOR = {
  /** Rooms are built this far down, under their doors. */
  floorY: -120,
  height: 3.6,
  useRadius: 2.2,
  /** Room size per kind (width along x, depth along z). */
  size: { deli: [12, 9], diner: [16, 10], office: [20, 14], laundromat: [12, 8], arcade: [14, 10], pawn: [10, 8], casino: [34, 24] } as Record<InteriorKind, [number, number]>,
  /** Ceiling height per kind (the casino's is grand). */
  heights: { casino: 6 } as Partial<Record<InteriorKind, number>>,
};

const PLAN: ReadonlyArray<{ kind: InteriorKind; name: string; district?: District }> = [
  { kind: 'deli', name: "Sal's Corner Deli", district: 'uptown' },
  { kind: 'deli', name: 'Lucky 24 Bodega', district: 'downtown' },
  { kind: 'diner', name: 'The Night Owl Diner', district: 'midtown' },
  { kind: 'office', name: 'Halvorsen & Pike Insurance', district: 'midtown' },
  { kind: 'office', name: 'Brightline Logistics', district: 'downtown' },
  { kind: 'laundromat', name: 'Suds City Laundromat', district: 'uptown' },
  { kind: 'arcade', name: 'Pixel Palace Arcade', district: 'downtown' },
  { kind: 'pawn', name: 'Goldie’s Pawn & Loan', district: 'midtown' },
  { kind: 'casino', name: 'The Empire Royale Casino', district: 'midtown' },
];

/**
 * One door per entry in PLAN, on a building face in its district, away from `avoid` (other doors:
 * shops, clinics, safehouses, the Chop Shop) and 60 m from each other (the rooms below don't overlap).
 */
export function planInteriors(layout: CityLayout, avoid: ReadonlyArray<{ x: number; z: number }>): InteriorSpot[] {
  const out: InteriorSpot[] = [];
  const alleys: Rect[] = (layout.alleys ?? []).map((a) => a.rect);
  const garages: Rect[] = (layout.garages ?? []).map((g) => g.rect);
  PLAN.forEach((p, idx) => {
    let best: (InteriorSpot & { score: number }) | null = null;
    for (const b of layout.blocks) {
      const faces = [
        { nx: 0, nz: 1, len: b.x1 - b.x0, at: (f: number) => ({ x: b.x0 + (b.x1 - b.x0) * f, z: b.z1 - 2.2, fx: b.x0 + (b.x1 - b.x0) * f, fz: b.z1 - 4.5 }), flush: (o: Rect, x: number) => x > o.x0 + 3 && x < o.x1 - 3 && Math.abs(o.z1 - (b.z1 - 4.5)) < 0.6 },
        { nx: 0, nz: -1, len: b.x1 - b.x0, at: (f: number) => ({ x: b.x0 + (b.x1 - b.x0) * f, z: b.z0 + 2.2, fx: b.x0 + (b.x1 - b.x0) * f, fz: b.z0 + 4.5 }), flush: (o: Rect, x: number) => x > o.x0 + 3 && x < o.x1 - 3 && Math.abs(o.z0 - (b.z0 + 4.5)) < 0.6 },
        { nx: 1, nz: 0, len: b.z1 - b.z0, at: (f: number) => ({ x: b.x1 - 2.2, z: b.z0 + (b.z1 - b.z0) * f, fx: b.x1 - 4.5, fz: b.z0 + (b.z1 - b.z0) * f }), flush: (o: Rect, _x: number, z: number) => z > o.z0 + 3 && z < o.z1 - 3 && Math.abs(o.x1 - (b.x1 - 4.5)) < 0.6 },
        { nx: -1, nz: 0, len: b.z1 - b.z0, at: (f: number) => ({ x: b.x0 + 2.2, z: b.z0 + (b.z1 - b.z0) * f, fx: b.x0 + 4.5, fz: b.z0 + (b.z1 - b.z0) * f }), flush: (o: Rect, _x: number, z: number) => z > o.z0 + 3 && z < o.z1 - 3 && Math.abs(o.x0 - (b.x0 + 4.5)) < 0.6 },
      ];
      for (const face of faces) {
        if (face.len < 30) continue;
        for (const f of [0.38, 0.62, 0.2, 0.8]) {
          const d = face.at(f);
          if (p.district && districtAt(layout, d.x, d.z) !== p.district) continue;
          if (!layout.buildings.some((o) => face.flush(o.rect, d.x, d.z))) continue;
          if (alleys.some((a) => d.x > a.x0 - 6 && d.x < a.x1 + 6 && d.z > a.z0 - 6 && d.z < a.z1 + 6)) continue;
          if (garages.some((g) => d.x > g.x0 - 6 && d.x < g.x1 + 6 && d.z > g.z0 - 6 && d.z < g.z1 + 6)) continue;
          if (avoid.some((a) => Math.hypot(a.x - d.x, a.z - d.z) < 18)) continue;
          if (out.some((o) => Math.hypot(o.x - d.x, o.z - d.z) < 60)) continue;
          // Spread through the district: a stable pseudo-random preference per entry.
          const score = Math.abs(Math.sin(d.x * 0.013 + d.z * 0.021 + idx * 1.7));
          if (!best || score > best.score) best = { id: `in-${idx}`, kind: p.kind, name: p.name, district: districtAt(layout, d.x, d.z), ...d, nx: face.nx, nz: face.nz, score };
        }
      }
    }
    if (best) {
      const { score: _s, ...spot } = best;
      void _s;
      out.push(spot);
    }
  });
  return out;
}

// ------------------------------------------------------------------ the rooms

export interface InteriorRoom {
  spot: InteriorSpot;
  root: THREE.Group;
  /** Where you appear inside (by the exit), and the exit door. */
  spawn: { x: number; y: number; z: number };
  exit: { x: number; z: number };
  /** Where people stand inside: [role, x, z, facing]. */
  people: Array<{ role: string; x: number; z: number; heading: number }>;
  /** Points of interest: what E does there (Game decides). */
  spots: Array<{ kind: 'counter' | 'booth' | 'washer' | 'cabinet' | 'board' | 'cooler' | 'slots' | 'blackjack' | 'roulette' | 'poker' | 'bar'; x: number; z: number; label: string }>;
  /** Animated rooms (the casino's lights and wheel), while you're inside. */
  update?: (t: number) => void;
}

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

export function buildInterior(spot: InteriorSpot, world: RAPIER.World): InteriorRoom {
  const [W, D] = INTERIOR.size[spot.kind];
  const H = INTERIOR.heights[spot.kind] ?? INTERIOR.height;
  const Y = INTERIOR.floorY;
  // The room sits under its door; the exit is on the -z wall.
  const cx = spot.x;
  const cz = spot.z;
  const root = new THREE.Group();
  root.name = `interior-${spot.id}`;
  root.visible = false;
  const x0 = cx - W / 2;
  const z0 = cz - D / 2;
  const palette = {
    deli: { floor: ['#d9d4c7', '#3a3a3a'], wall: 0xe8dcc0, trim: 0x2f6f4a },
    diner: { floor: ['#e8e1d2', '#b7322b'], wall: 0xf2e6c9, trim: 0xb7322b },
    office: { floor: ['#5d6670', '#56606a'], wall: 0xdfe3e6, trim: 0x2b4a6f },
    laundromat: { floor: ['#cfe4ee', '#9fc4d8'], wall: 0xeef6f8, trim: 0x2f8fb1 },
    arcade: { floor: ['#1a1030', '#2a1450'], wall: 0x1c1430, trim: 0xff3fa4 },
    pawn: { floor: ['#6b5a44', '#5e4f3c'], wall: 0xcbb994, trim: 0xd4a531 },
    casino: { floor: ['#5a0f1e', '#4a0c18'], wall: 0x3a0f1c, trim: 0xd4a531 },
  }[spot.kind];
  const mat = (color: number | string, rough = 0.8, metal = 0.05, surface: Parameters<typeof withSurface>[1] = 'paintedMetal'): THREE.MeshStandardMaterial => withSurface(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), surface);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0, solid = false): THREE.Mesh => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
    if (solid) {
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const hx = (bb.max.x - bb.min.x) / 2;
      const hz = (bb.max.z - bb.min.z) / 2;
      const c = Math.abs(Math.cos(ry));
      const s = Math.abs(Math.sin(ry));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx * c + hz * s, (bb.max.y - bb.min.y) / 2, hx * s + hz * c)
          .setTranslation(x, y + (bb.max.y + bb.min.y) / 2, z)
          .setCollisionGroups(WORLD_GROUPS),
      );
    }
    return mesh;
  };
  const boxG = (w: number, h: number, d: number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return g;
  };
  // ---- shell: floor tiles, walls, ceiling with light panels
  const floorTex = spot.kind === 'casino' ? carpet() : checker(palette.floor[0], palette.floor[1]);
  floorTex.repeat.set(spot.kind === 'casino' ? W / 4 : W / 1.2, spot.kind === 'casino' ? D / 4 : D / 1.2);
  add(boxG(W, 0.2, D), withSurface(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.05 }), 'concrete'), cx, Y - 0.2, cz, 0, true);
  add(boxG(W, 0.2, D), mat(spot.kind === 'casino' ? 0x2a0a12 : 0xf4f4f0, 0.9), cx, Y + H, cz, 0, true);
  const wallM = mat(palette.wall, 0.9, 0, 'concrete');
  add(boxG(W + 0.4, H, 0.2), wallM, cx, Y, z0 - 0.1, 0, true);
  add(boxG(W + 0.4, H, 0.2), wallM, cx, Y, z0 + D + 0.1, 0, true);
  add(boxG(0.2, H, D), wallM, x0 - 0.1, Y, cz, 0, true);
  add(boxG(0.2, H, D), wallM, x0 + W + 0.1, Y, cz, 0, true);
  // Skirting and a trim stripe in the house colour.
  const trimM = mat(palette.trim, 0.6);
  add(boxG(W, 0.25, 0.04), trimM, cx, Y + 1.0, z0 + D - 0.02);
  add(boxG(0.04, 0.25, D), trimM, x0 + 0.02, Y + 1.0, cz);
  add(boxG(0.04, 0.25, D), trimM, x0 + W - 0.02, Y + 1.0, cz);
  const panelM = new THREE.MeshBasicMaterial({ color: spot.kind === 'arcade' ? 0xb07aff : 0xfff6e0 });
  if (spot.kind !== 'casino') for (let x = x0 + 2.5; x < x0 + W - 1; x += 4) for (let z = z0 + 2; z < z0 + D - 1; z += 3.5) add(boxG(1.2, 0.04, 0.6), panelM, x, Y + H - 0.04, z);
  // Lights: a soft fill and two lamps (only drawn while you're in here: the room is hidden otherwise).
  const hemi = new THREE.HemisphereLight(spot.kind === 'arcade' ? 0x8a6aff : 0xfff2dc, 0x5a5048, spot.kind === 'arcade' ? 0.9 : 1.6);
  hemi.position.set(cx, Y + H, cz);
  root.add(hemi);
  for (const dx of spot.kind === 'casino' ? [] : [-W / 4, W / 4]) {
    const l = new THREE.PointLight(spot.kind === 'arcade' ? 0xff5ad0 : 0xffe6c0, spot.kind === 'arcade' ? 18 : 14, Math.max(W, D) * 1.2, 1.6);
    l.position.set(cx + dx, Y + H - 0.4, cz);
    root.add(l);
  }
  // ---- the exit: a door in the -z wall with a lit sign over it
  const exit = { x: cx, z: z0 + 0.3 };
  add(boxG(1.4, 2.3, 0.08), mat(0x5a4632, 0.6, 0.1, 'wood'), cx, Y, z0 + 0.02);
  add(boxG(0.7, 0.22, 0.05), new THREE.MeshBasicMaterial({ color: 0x3bff6a }), cx, Y + 2.55, z0 + 0.05);
  const spawn = { x: cx, y: Y + 0.05, z: z0 + 1.6 };
  const people: InteriorRoom['people'] = [];
  const spots: InteriorRoom['spots'] = [];
  const counterM = mat(palette.trim, 0.5, 0.2);
  const topM = mat(0xd8d2c4, 0.3, 0.1, 'concrete');
  let update: InteriorRoom['update'];
  // ---- furniture by kind
  switch (spot.kind) {
    case 'deli':
    case 'pawn': {
      // Counter across the back, shelves down both sides, a cooler.
      add(boxG(W * 0.5, 1.0, 0.8), counterM, cx, Y, z0 + D - 2.2, 0, true);
      add(boxG(W * 0.5 + 0.1, 0.05, 0.9), topM, cx, Y + 1.0, z0 + D - 2.2);
      add(boxG(0.45, 0.35, 0.4), mat(0x222222, 0.4, 0.4), cx + 1.2, Y + 1.05, z0 + D - 2.2); // till
      people.push({ role: spot.kind === 'deli' ? 'clerk' : 'pawnbroker', x: cx, z: z0 + D - 1.2, heading: -Math.PI / 2 });
      spots.push({ kind: 'counter', x: cx, z: z0 + D - 3.2, label: spot.kind === 'deli' ? 'Buy supplies' : 'Sell to Goldie' });
      for (const side of [-1, 1]) {
        const sx = cx + side * (W / 2 - 0.5);
        add(boxG(0.8, 2.0, D - 4), mat(0x8a8f94, 0.6, 0.5), sx, Y, cz - 0.5, 0, true);
        for (let row = 0; row < 4; row++)
          for (let k = 0; k < Math.floor((D - 4.5) / 0.5); k++) {
            const hue = (k * 47 + row * 91 + (side > 0 ? 30 : 0)) % 360;
            const c = new THREE.Color().setHSL(hue / 360, spot.kind === 'pawn' ? 0.2 : 0.6, spot.kind === 'pawn' ? 0.35 : 0.5);
            add(boxG(0.3, 0.32, 0.36), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }), sx - side * 0.15, Y + 0.25 + row * 0.45, z0 + 2.4 + k * 0.5);
          }
      }
      if (spot.kind === 'deli') {
        add(boxG(1.6, 2.0, 0.8), mat(0xdfe8ec, 0.2, 0.6), x0 + 1.4, Y, z0 + D - 0.6, 0, true);
        add(boxG(1.5, 1.6, 0.02), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x5ab0e0, emissiveIntensity: 0.6, transparent: true, opacity: 0.6 }), x0 + 1.4, Y + 0.3, z0 + D - 1.02);
        spots.push({ kind: 'cooler', x: x0 + 1.4, z: z0 + D - 1.8, label: 'Grab a cold drink ($3)' });
      } else {
        // Glass display case of oddities in the middle.
        add(boxG(2.2, 0.9, 0.9), mat(0x3a2c1e, 0.7, 0.1, 'wood'), cx, Y, cz, 0, true);
        add(boxG(2.2, 0.35, 0.9), new THREE.MeshStandardMaterial({ color: 0xcfe6ef, transparent: true, opacity: 0.35, roughness: 0.05 }), cx, Y + 0.9, cz);
      }
      people.push({ role: 'customer', x: cx - 2.2, z: cz + 0.4, heading: Math.PI / 2 });
      break;
    }
    case 'diner': {
      // Long counter with stools on one side, booths along the other.
      add(boxG(W * 0.55, 1.05, 0.7), counterM, cx + W * 0.15, Y, z0 + D - 2.4, 0, true);
      add(boxG(W * 0.55 + 0.1, 0.06, 0.85), topM, cx + W * 0.15, Y + 1.05, z0 + D - 2.4);
      for (let k = 0; k < 6; k++) {
        const sx = cx + W * 0.15 - W * 0.25 + k * (W * 0.5 / 5);
        add(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12).translate(0, 0.75, 0), mat(0xb7322b, 0.5), sx, Y, z0 + D - 3.3);
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6).translate(0, 0.375, 0), mat(0xc0c4c8, 0.3, 0.8), sx, Y, z0 + D - 3.3);
      }
      people.push({ role: 'cook', x: cx + W * 0.15, z: z0 + D - 1.2, heading: -Math.PI / 2 });
      people.push({ role: 'waitress', x: cx - 2, z: cz - 0.5, heading: 0 });
      spots.push({ kind: 'counter', x: cx + W * 0.15, z: z0 + D - 3.6, label: 'Order a meal ($15, heals you)' });
      for (let k = 0; k < 3; k++) {
        const bx = x0 + 1.4;
        const bz = z0 + 2.6 + k * 2.4;
        add(boxG(1.2, 0.75, 0.9), mat(0xd9d2c0, 0.4), bx + 0.6, Y, bz, 0, true);
        for (const s2 of [-1, 1]) add(boxG(1.4, 1.1, 0.5), mat(0xb7322b, 0.5, 0, 'fabric'), bx + 0.5, Y, bz + s2 * 0.75, 0, true);
        if (k === 1) {
          people.push({ role: 'regular', x: bx + 0.2, z: bz - 0.4, heading: 0 });
          spots.push({ kind: 'booth', x: bx + 1.6, z: bz, label: 'Sit down' });
        }
      }
      // A jukebox in the corner.
      add(boxG(1.0, 1.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a3a8a, emissive: 0xff7ad0, emissiveIntensity: 0.6, roughness: 0.4 }), x0 + W - 1, Y, z0 + 1.0, 0, true);
      break;
    }
    case 'office': {
      // Reception desk by the door, then rows of desks with monitors, a meeting room glass wall.
      add(boxG(3.2, 1.1, 0.9), counterM, cx, Y, z0 + 3, 0, true);
      people.push({ role: 'receptionist', x: cx, z: z0 + 3.8, heading: -Math.PI / 2 });
      spots.push({ kind: 'board', x: x0 + 1.3, z: z0 + 3, label: 'Read the notice board' });
      add(boxG(0.1, 1.4, 2.2), mat(0x7a5530, 0.8, 0, 'wood'), x0 + 0.3, Y + 0.6, z0 + 3);
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 4; col++) {
          const dx = x0 + 3 + col * 3.6;
          const dz = z0 + 6.4 + row * 2.4;
          if (dz > z0 + D - 1.5) continue;
          add(boxG(1.6, 0.75, 0.8), mat(0xe0dccf, 0.6, 0, 'wood'), dx, Y, dz, 0, true);
          add(boxG(0.55, 0.38, 0.04), new THREE.MeshStandardMaterial({ color: 0x111418, emissive: 0x5ab8ff, emissiveIntensity: 0.5 }), dx, Y + 0.8, dz - 0.15);
          add(boxG(0.5, 0.5, 0.5), mat(0x2b2f36, 0.7, 0, 'fabric'), dx, Y, dz + 0.65);
          if ((row + col) % 3 === 0) people.push({ role: 'worker', x: dx, z: dz + 0.75, heading: Math.PI / 2 });
        }
      add(boxG(0.08, 2.6, D * 0.4), new THREE.MeshStandardMaterial({ color: 0xbfe0ee, transparent: true, opacity: 0.3, roughness: 0.05 }), x0 + W - 4, Y, z0 + D - D * 0.2);
      add(boxG(2.4, 0.75, 1.2), mat(0x3a2c1e, 0.6, 0, 'wood'), x0 + W - 2, Y, z0 + D - 2.6, 0, true);
      people.push({ role: 'manager', x: x0 + W - 2, z: z0 + D - 1.4, heading: -Math.PI / 2 });
      // Water cooler.
      add(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 10).translate(0, 0.55, 0), mat(0xe8eef2, 0.4), x0 + 1.0, Y, z0 + D - 1.0, 0, true);
      add(new THREE.CylinderGeometry(0.16, 0.16, 0.45, 10).translate(0, 1.32, 0), new THREE.MeshStandardMaterial({ color: 0x7ac0ff, transparent: true, opacity: 0.7 }), x0 + 1.0, Y, z0 + D - 1.0);
      break;
    }
    case 'laundromat': {
      // Two rows of washers (round doors), dryers stacked on the back wall, a folding table.
      for (const row of [-1, 1])
        for (let k = 0; k < 5; k++) {
          const wx = x0 + 2.2 + k * 1.6;
          const wz = cz + row * 1.6;
          add(boxG(0.9, 1.0, 0.85), mat(0xf4f6f7, 0.35, 0.3), wx, Y, wz, 0, true);
          const door = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x8fb8cc, transparent: true, opacity: 0.6, roughness: 0.05 }));
          door.rotation.x = Math.PI / 2;
          door.position.set(wx, Y + 0.55, wz + row * 0.45);
          root.add(door);
        }
      for (let k = 0; k < 6; k++) for (const lvl of [0, 1]) add(boxG(0.9, 0.85, 0.8), mat(0xdfe3e6, 0.4, 0.3), x0 + 1.5 + k * 1.5, Y + lvl * 0.9, z0 + D - 0.5);
      add(boxG(2.4, 0.9, 1.0), mat(0xc9b28a, 0.7, 0, 'wood'), x0 + W - 1.8, Y, cz, 0, true);
      people.push({ role: 'attendant', x: x0 + W - 1.8, z: cz + 1.0, heading: Math.PI });
      people.push({ role: 'customer', x: x0 + 3.0, z: cz, heading: 0 });
      spots.push({ kind: 'washer', x: x0 + W - 1.8, z: cz - 1.2, label: 'Change clothes' });
      break;
    }
    case 'arcade': {
      // Rows of glowing cabinets, a prize counter.
      for (const row of [-1, 1])
        for (let k = 0; k < 5; k++) {
          const ax = x0 + 2 + k * 2.2;
          const az = cz + row * 2.2;
          add(boxG(0.9, 1.9, 0.8), mat(0x15121f, 0.5, 0.2), ax, Y, az, row > 0 ? Math.PI : 0, true);
          const hue = (k * 67 + (row > 0 ? 180 : 0)) % 360;
          add(boxG(0.7, 0.55, 0.04), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color().setHSL(hue / 360, 0.9, 0.55), emissiveIntensity: 1.4 }), ax, Y + 1.2, az - row * -0.42 * -1);
        }
      add(boxG(3, 1.0, 0.8), counterM, x0 + W - 2.5, Y, z0 + D - 1.6, 0, true);
      people.push({ role: 'attendant', x: x0 + W - 2.5, z: z0 + D - 0.8, heading: -Math.PI / 2 });
      people.push({ role: 'gamer', x: x0 + 4.2, z: cz - 1.4, heading: Math.PI / 2 });
      spots.push({ kind: 'cabinet', x: x0 + 2, z: cz - 1.2, label: 'Play Streetmon Racer ($1)' });
      break;
    }
    case 'casino':
      update = buildCasino({ root, add, boxG, mat, x0, z0, W, D, H, Y, cx, cz, people, spots });
      break;
  }
  return { spot, root, spawn, exit, people, spots, update };
}

type Adder = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry?: number, solid?: boolean) => THREE.Mesh;

/**
 * The Empire Royale: a grand red-and-gold floor. Banks of slot machines with flickering screens
 * down both sides, blackjack tables and a roulette wheel (it turns) at the back, video poker by the
 * bar, a cashier's cage, chandeliers, marble columns, a crowd at every table. Returns the animator.
 */
function buildCasino(o: {
  root: THREE.Group;
  add: Adder;
  boxG: (w: number, h: number, d: number) => THREE.BufferGeometry;
  mat: (color: number | string, rough?: number, metal?: number, surface?: Parameters<typeof withSurface>[1]) => THREE.MeshStandardMaterial;
  x0: number;
  z0: number;
  W: number;
  D: number;
  H: number;
  Y: number;
  cx: number;
  cz: number;
  people: InteriorRoom['people'];
  spots: InteriorRoom['spots'];
}): (t: number) => void {
  const { root, add, boxG, mat, x0, z0, W, D, H, Y, cx, people, spots } = o;
  const gold = mat(0xd4a531, 0.3, 0.85);
  const felt = new THREE.MeshStandardMaterial({ color: 0x0f6b3a, roughness: 0.95 });
  const wood = mat(0x3b1f12, 0.5, 0.1, 'wood');
  const blinkers: Array<{ m: THREE.MeshStandardMaterial; phase: number; speed: number; base: number }> = [];
  // Warm, bright, busy light: a big fill and chandeliers (point lights) over the floor.
  const fill = new THREE.HemisphereLight(0xffe2b8, 0x5a1a22, 1.1);
  fill.position.set(cx, Y + H, o.cz);
  root.add(fill);
  const chand: THREE.PointLight[] = [];
  for (const [fx, fz] of [
    [-0.28, 0.3],
    [0.28, 0.3],
    [-0.28, 0.72],
    [0.28, 0.72],
  ]) {
    const lx = cx + fx * W;
    const lz = z0 + fz * D;
    const l = new THREE.PointLight(0xffd9a0, 26, 22, 1.5);
    l.position.set(lx, Y + H - 1.4, lz);
    root.add(l);
    chand.push(l);
    // The chandelier itself: a gold ring of glowing drops.
    add(new THREE.TorusGeometry(0.9, 0.06, 6, 18).rotateX(Math.PI / 2), gold, lx, Y + H - 1.2, lz);
    const glow = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffd58a, emissiveIntensity: 1.6 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      add(new THREE.SphereGeometry(0.09, 8, 6), glow, lx + Math.cos(a) * 0.9, Y + H - 1.45, lz + Math.sin(a) * 0.9);
    }
    add(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6).translate(0, 0.6, 0), gold, lx, Y + H - 1.2, lz);
  }
  // Wall panels: gold pilasters and a running light strip near the ceiling.
  const strip = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb347, emissiveIntensity: 1.2 });
  blinkers.push({ m: strip, phase: 0, speed: 1.3, base: 1.0 });
  for (const zz of [z0 + 0.12, z0 + D - 0.12]) add(boxG(W - 0.5, 0.08, 0.06), strip, cx, Y + H - 0.4, zz);
  for (const xx of [x0 + 0.12, x0 + W - 0.12]) add(boxG(0.06, 0.08, D - 0.5), strip, xx, Y + H - 0.4, o.cz);
  for (let x = x0 + 3; x < x0 + W - 1; x += 4.2) for (const zz of [z0 + 0.15, z0 + D - 0.15]) add(boxG(0.3, H, 0.12), gold, x, Y, zz);
  // Marble columns down the middle.
  const marble = mat(0xefe8df, 0.25, 0.1, 'concrete');
  for (const fx of [-0.18, 0.18]) for (const fz of [0.35, 0.65]) add(new THREE.CylinderGeometry(0.42, 0.48, H, 16).translate(0, H / 2, 0), marble, cx + fx * W, Y, z0 + fz * D, 0, true);
  // ---- slot banks down both long sides
  const reelHue = [0, 45, 200, 280, 130, 330];
  for (const side of [-1, 1]) {
    const sx = side < 0 ? x0 + 1.0 : x0 + W - 1.0;
    for (let k = 0; k < 9; k++) {
      const sz = z0 + 4 + k * 1.35;
      if (sz > z0 + D - 6) break;
      add(boxG(0.95, 1.65, 0.9), mat(0x1a1a24, 0.4, 0.5), sx, Y, sz, 0, true);
      add(boxG(0.98, 0.22, 0.93), gold, sx, Y + 1.65, sz);
      const scr = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color().setHSL(reelHue[(k + (side > 0 ? 3 : 0)) % 6] / 360, 0.85, 0.55), emissiveIntensity: 1.2 });
      blinkers.push({ m: scr, phase: k * 0.7 + side, speed: 3 + (k % 3), base: 1.0 });
      add(boxG(0.04, 0.5, 0.7), scr, sx - side * 0.49, Y + 1.0, sz);
      // A topper light that flashes.
      const top = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: k % 2 ? 0xff3b4a : 0xffd23f, emissiveIntensity: 1.5 });
      blinkers.push({ m: top, phase: k * 1.3, speed: 6, base: 0.6 });
      add(new THREE.SphereGeometry(0.12, 10, 8), top, sx, Y + 2.0, sz);
      // Stool.
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10).translate(0, 0.7, 0), mat(0x7a1020, 0.6, 0, 'fabric'), sx - side * 0.95, Y, sz);
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6).translate(0, 0.35, 0), gold, sx - side * 0.95, Y, sz);
      if (k % 2 === 0) people.push({ role: 'gambler', x: sx - side * 0.95, z: sz, heading: side < 0 ? Math.PI : 0 });
      if (k === 2) spots.push({ kind: 'slots', x: sx - side * 1.4, z: sz + 0.7, label: 'Play the slots' });
    }
  }
  // A coffered ceiling: gold beams in a grid with warm light in each coffer.
  for (let x = x0 + 4; x < x0 + W - 1; x += 4) add(boxG(0.25, 0.3, D - 0.4), gold, x, Y + H - 0.3, o.cz);
  for (let z = z0 + 4; z < z0 + D - 1; z += 4) add(boxG(W - 0.4, 0.3, 0.25), gold, cx, Y + H - 0.3, z);
  const cofferM = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc070, emissiveIntensity: 0.55 });
  for (let x = x0 + 2; x < x0 + W - 1; x += 4) for (let z = z0 + 2; z < z0 + D - 1; z += 4) add(boxG(2.6, 0.02, 2.6), cofferM, x, Y + H - 0.06, z);
  // Sconces down the walls.
  const sconce = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc070, emissiveIntensity: 1.4 });
  for (let x = x0 + 5; x < x0 + W - 2; x += 4.2) for (const zz of [z0 + 0.3, z0 + D - 0.3]) add(new THREE.SphereGeometry(0.16, 8, 6), sconce, x, Y + 2.6, zz);
  // Slot islands in the middle of the floor: back-to-back machines, a crowd on the stools.
  for (const [ix, iz] of [
    [cx - W * 0.15, z0 + D * 0.3],
    [cx + W * 0.08, z0 + D * 0.3],
  ]) {
    for (let k = 0; k < 4; k++)
      for (const face of [-1, 1]) {
        const mx = ix - 2.1 + k * 1.4;
        const mz = iz + face * 0.5;
        add(boxG(1.0, 1.6, 0.9), mat(0x1a1a24, 0.4, 0.5), mx, Y, mz, 0, true);
        add(boxG(1.02, 0.2, 0.92), gold, mx, Y + 1.6, mz);
        const scr = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color().setHSL(((k * 70 + (face > 0 ? 160 : 0)) % 360) / 360, 0.85, 0.55), emissiveIntensity: 1.2 });
        blinkers.push({ m: scr, phase: k + face, speed: 3.5 + k * 0.5, base: 1.0 });
        add(boxG(0.7, 0.5, 0.04), scr, mx, Y + 0.95, mz + face * 0.47);
        if ((k + (face > 0 ? 1 : 0)) % 2 === 0) people.push({ role: 'gambler', x: mx, z: mz + face * 1.05, heading: face > 0 ? -Math.PI / 2 : Math.PI / 2 });
      }
    const top = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3fa4, emissiveIntensity: 1.6 });
    blinkers.push({ m: top, phase: ix, speed: 2, base: 1.0 });
    add(boxG(5.8, 0.35, 0.12), top, ix, Y + 2.2, iz);
  }
  // ---- blackjack tables (semicircles of green felt with a dealer behind)
  const bj = (tx: number, tz: number): void => {
    add(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 24, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.86, 0), felt, tx, Y, tz);
    add(new THREE.CylinderGeometry(1.6, 1.6, 0.86, 24, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.43, 0), wood, tx, Y, tz, 0, true);
    add(new THREE.TorusGeometry(1.55, 0.06, 6, 24, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI), wood, tx, Y + 0.92, tz);
    people.push({ role: 'dealer', x: tx, z: tz + 0.45, heading: -Math.PI / 2 });
    people.push({ role: 'gambler', x: tx - 1.1, z: tz - 1.2, heading: Math.PI / 2 - 0.5 });
    people.push({ role: 'gambler', x: tx + 1.1, z: tz - 1.2, heading: Math.PI / 2 + 0.5 });
    // Chips stacks.
    for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(0.05, 0.05, 0.08 + (k % 3) * 0.04, 10).translate(0, 0.96, 0), new THREE.MeshStandardMaterial({ color: [0xd33, 0x22a, 0x111, 0x2a2, 0xeee][k] }), tx - 0.4 + k * 0.2, Y, tz + 0.15);
    spots.push({ kind: 'blackjack', x: tx, z: tz - 1.5, label: 'Sit down at blackjack' });
  };
  bj(cx - W * 0.28, z0 + D - 4.5);
  bj(cx + W * 0.06, z0 + D - 4.5);
  // ---- roulette: a long table with the wheel that turns
  const rx = cx + W * 0.3;
  const rz = z0 + D * 0.5;
  add(boxG(1.8, 0.85, 3.6), wood, rx, Y, rz, 0, true);
  add(boxG(1.6, 0.04, 3.4), felt, rx, Y + 0.85, rz);
  const wheel = new THREE.Group();
  wheel.position.set(rx, Y + 0.9, rz + 1.1);
  root.add(wheel);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.55, 0.12, 37), wood);
  wheel.add(bowl);
  const pockets = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.13, 37), new THREE.MeshStandardMaterial({ map: rouletteTexture(), roughness: 0.4 }));
  wheel.add(pockets);
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 10), gold);
  hub.position.y = 0.15;
  wheel.add(hub);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
  root.add(ball);
  people.push({ role: 'croupier', x: rx + 1.25, z: rz, heading: Math.PI });
  people.push({ role: 'gambler', x: rx - 1.25, z: rz - 0.6, heading: 0 });
  people.push({ role: 'gambler', x: rx - 1.25, z: rz + 0.8, heading: 0 });
  spots.push({ kind: 'roulette', x: rx - 1.3, z: rz + 0.1, label: 'Place a bet at roulette' });
  // ---- the bar with video poker machines along its front
  const bx = cx - W * 0.3;
  const bz = z0 + D * 0.42;
  add(boxG(1.0, 1.1, 6), wood, bx, Y, bz, 0, true);
  add(boxG(1.1, 0.06, 6.1), mat(0x1b1b1b, 0.2, 0.3, 'concrete'), bx, Y + 1.1, bz);
  for (let k = 0; k < 7; k++) add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: [0x6a2, 0x962, 0xc84, 0x37a, 0xa22, 0x5a5, 0xddd][k], transparent: true, opacity: 0.8 }), bx - 0.6 + (k % 2) * 0.1, Y + 0.15 + Math.floor(k / 2) * 0.4, bz - 2.5 + k * 0.8);
  add(boxG(0.4, 2.4, 6), wood, bx - 1.6, Y, bz, 0, true);
  people.push({ role: 'bartender', x: bx - 0.9, z: bz, heading: 0 });
  spots.push({ kind: 'bar', x: bx + 1.0, z: bz - 1.2, label: 'Order a drink ($8)' });
  for (let k = 0; k < 3; k++) {
    const pz = bz - 1.6 + k * 1.6;
    add(boxG(0.6, 1.2, 0.5), mat(0x101018, 0.4, 0.5), bx + 0.8, Y + 1.1, pz);
    const scr = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3a6bff, emissiveIntensity: 1.0 });
    blinkers.push({ m: scr, phase: k, speed: 1.5, base: 0.9 });
    add(boxG(0.04, 0.4, 0.4), scr, bx + 1.11, Y + 1.5, pz);
  }
  spots.push({ kind: 'poker', x: bx + 1.4, z: bz + 0.8, label: 'Play video poker' });
  // ---- a cashier's cage and the host by the door
  add(boxG(4, 1.2, 0.8), gold, cx + W * 0.32, Y, z0 + 2.2, 0, true);
  for (let k = 0; k < 9; k++) add(boxG(0.03, 1.2, 0.03), gold, cx + W * 0.32 - 1.9 + k * 0.48, Y + 1.2, z0 + 2.2);
  people.push({ role: 'security', x: cx + 2.2, z: z0 + 1.8, heading: Math.PI / 2 });
  people.push({ role: 'host', x: cx - 2.4, z: z0 + 2.8, heading: Math.PI / 2 });
  people.push({ role: 'gambler', x: cx - 4, z: z0 + D * 0.5, heading: 0.3 });
  people.push({ role: 'gambler', x: cx + 3, z: z0 + D * 0.62, heading: 2.2 });
  // ---- the animator: blinking screens and lights, the wheel turning with its ball, chandeliers breathing
  return (t: number) => {
    for (const b of blinkers) b.m.emissiveIntensity = b.base + 0.55 * Math.max(0, Math.sin(t * b.speed + b.phase));
    wheel.rotation.y = t * 1.6;
    const a = -t * 3.1;
    ball.position.set(rx + Math.cos(a) * 0.58, Y + 0.99, rz + 1.1 + Math.sin(a) * 0.58);
    for (const [i, l] of chand.entries()) l.intensity = 24 + Math.sin(t * 0.8 + i) * 2;
  };
}

function carpet(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5a0f1e';
  g.fillRect(0, 0, 128, 128);
  // A gaudy casino pattern: gold diamonds and blue-green swirls.
  g.strokeStyle = '#c9952a';
  g.lineWidth = 3;
  for (const [x, y] of [
    [32, 32],
    [96, 96],
  ]) {
    g.beginPath();
    g.moveTo(x, y - 22);
    g.lineTo(x + 22, y);
    g.lineTo(x, y + 22);
    g.lineTo(x - 22, y);
    g.closePath();
    g.stroke();
  }
  g.strokeStyle = '#1f6f6a';
  g.lineWidth = 4;
  for (const [x, y] of [
    [96, 32],
    [32, 96],
  ]) {
    g.beginPath();
    g.arc(x, y, 16, 0, Math.PI * 1.6);
    g.stroke();
  }
  g.fillStyle = '#e8c35a';
  for (const [x, y] of [
    [32, 32],
    [96, 96],
  ])
    g.fillRect(x - 3, y - 3, 6, 6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rouletteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const order = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  for (let i = 0; i < 37; i++) {
    const a0 = (i / 37) * Math.PI * 2;
    const a1 = ((i + 1) / 37) * Math.PI * 2;
    g.beginPath();
    g.moveTo(128, 128);
    g.arc(128, 128, 126, a0, a1);
    g.closePath();
    g.fillStyle = order[i] === 0 ? '#1a8a3a' : red.has(order[i]) ? '#b31b1b' : '#111';
    g.fill();
  }
  g.fillStyle = '#6a3a1a';
  g.beginPath();
  g.arc(128, 128, 70, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checker(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = a;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = b;
  g.fillRect(0, 0, 32, 32);
  g.fillRect(32, 32, 32, 32);
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ------------------------------------------------------------------ the doors outside

export interface InteriorDoors {
  root: THREE.Group;
}

/** Lit doors on the facades: a glass door, a sign with the name, an OPEN neon. */
export function buildInteriorDoors(spots: readonly InteriorSpot[]): InteriorDoors {
  const root = new THREE.Group();
  root.name = 'interior-doors';
  for (const s of spots) {
    const g = new THREE.Group();
    g.position.set(s.fx, 0.15, s.fz);
    g.rotation.y = Math.atan2(s.nx, s.nz);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.8, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.6, roughness: 0.4 }));
    frame.position.set(0, 1.4, 0.06);
    g.add(frame);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 0.04), new THREE.MeshStandardMaterial({ color: 0xffe2a6, emissive: 0xffc070, emissiveIntensity: 0.55, roughness: 0.1, transparent: true, opacity: 0.85 }));
    glass.position.set(0, 1.25, 0.15);
    g.add(glass);
    const grand = s.kind === 'casino';
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(grand ? 8 : 4.2, grand ? 1.5 : 0.8), new THREE.MeshBasicMaterial({ map: signTexture(s.name, s.kind), transparent: true }));
    sign.position.set(0, grand ? 4.2 : 3.35, grand ? 1.9 : 0.2);
    g.add(sign);
    if (grand) {
      // A gold canopy over the door on brass poles, lined with bulbs (the casino's marquee).
      const gold = new THREE.MeshStandardMaterial({ color: 0xd4a531, metalness: 0.85, roughness: 0.3 });
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.3, 3.6), gold);
      canopy.position.set(0, 3.35, 1.8);
      g.add(canopy);
      for (const px of [-3.9, 3.9]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.35, 8), gold);
        pole.position.set(px, 1.67, 3.4);
        g.add(pole);
      }
      const bulb = new THREE.MeshBasicMaterial({ color: 0xfff1b8 });
      for (let k = 0; k < 24; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), bulb);
        b.position.set(-4 + (k / 23) * 8, 3.18, 3.62);
        g.add(b);
      }
      // A red carpet out to the kerb.
      const rug = new THREE.Mesh(new THREE.BoxGeometry(2, 0.02, 3.6), new THREE.MeshStandardMaterial({ color: 0x8a0f1e, roughness: 0.9 }));
      rug.position.set(0, 0.01, 1.9);
      g.add(rug);
    }
    const open = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.36), new THREE.MeshBasicMaterial({ map: openTexture(), transparent: true }));
    open.position.set(1.65, 1.9, 0.18);
    g.add(open);
    root.add(g);
  }
  return { root };
}

function signTexture(name: string, kind: InteriorKind): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  const bg = { deli: '#1f5a3a', diner: '#b7322b', office: '#203a5a', laundromat: '#2f8fb1', arcade: '#2a0f4a', pawn: '#5a4214', casino: '#2a0510' }[kind];
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#f4efe6';
  g.lineWidth = 5;
  g.strokeRect(4, 4, 504, 88);
  g.fillStyle = kind === 'arcade' ? '#ff7ad0' : kind === 'casino' ? '#ffd56a' : '#f4efe6';
  g.font = 'bold 40px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name.toUpperCase().slice(0, 28), 256, 50, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let openTex: THREE.CanvasTexture | null = null;
function openTexture(): THREE.CanvasTexture {
  if (openTex) return openTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 52;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ff3b4a';
  g.lineWidth = 4;
  g.shadowColor = '#ff3b4a';
  g.shadowBlur = 8;
  g.strokeRect(6, 6, 116, 40);
  g.fillStyle = '#ff5a68';
  g.font = 'bold 28px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('OPEN', 64, 27);
  openTex = new THREE.CanvasTexture(c);
  openTex.colorSpace = THREE.SRGBColorSpace;
  return openTex;
}
