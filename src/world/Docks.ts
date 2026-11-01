import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { withSurface } from '../render/Surfaces';
import type { CityLayout, Rect } from './CityLayout';

/**
 * The docks on both rivers: the West Ave docks (Foreman Pike's yard, Dockside Dutch's turf) and
 * the East Ave docks. Each is a timber pier on pilings running out over the river from a gap in
 * the promenade railing, with a wide T-head where a gantry crane stands over stacked shipping
 * containers, bollards with mooring lines out to the boats tied up alongside (a tug and a fishing
 * boat, scenery for now: they bob on the swell but don't go anywhere), pallets and crates at the
 * root, and lamps. Walkable, railed, and on the maps.
 *
 * `planDocks` is engine-free (tested); `buildDocks` makes the meshes and colliders.
 */

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);
const DECK = 0.15;
const RIVER = -1.4;

export interface DockPlan {
  id: string;
  name: string;
  /** Which bank: -1 the west (Hudson) side, +1 the east side. */
  side: -1 | 1;
  /** Where the pier meets the land, and the pier (walkway) and its T-head. */
  z: number;
  edgeX: number;
  pier: Rect;
  head: Rect;
  /** Gaps to leave in the promenade railing. */
  opening: { x: number; z0: number; z1: number };
  /** Moored boats: kind, centre and heading. */
  boats: Array<{ kind: 'tug' | 'fishing'; x: number; z: number; heading: number }>;
}

export const DOCKS = {
  pierLength: 34,
  pierWidth: 8,
  headLength: 14,
  headWidth: 30,
};

export function planDocks(layout: CityLayout): DockPlan[] {
  const L = layout.land;
  const make = (id: string, name: string, side: -1 | 1, z: number): DockPlan => {
    const edgeX = side < 0 ? L.x0 : L.x1;
    const w = DOCKS.pierWidth / 2;
    const out = (d: number): number => edgeX + side * d;
    const pier: Rect = side < 0 ? { x0: out(DOCKS.pierLength), x1: edgeX, z0: z - w, z1: z + w } : { x0: edgeX, x1: out(DOCKS.pierLength), z0: z - w, z1: z + w };
    const hx0 = out(DOCKS.pierLength);
    const hx1 = out(DOCKS.pierLength + DOCKS.headLength);
    const head: Rect = { x0: Math.min(hx0, hx1), x1: Math.max(hx0, hx1), z0: z - DOCKS.headWidth / 2, z1: z + DOCKS.headWidth / 2 };
    return {
      id,
      name,
      side,
      z,
      edgeX,
      pier,
      head,
      opening: { x: edgeX, z0: z - w, z1: z + w },
      boats: [
        // A tug tied up on the far face of the T-head, a fishing boat along the pier.
        { kind: 'tug', x: out(DOCKS.pierLength + DOCKS.headLength + 4.2), z: z + 2, heading: Math.PI / 2 },
        { kind: 'fishing', x: (pier.x0 + pier.x1) / 2 + side * 6, z: z + w + 3.6, heading: side < 0 ? Math.PI : 0 },
      ],
    };
  };
  return [make('west-ave-docks', 'West Ave Docks', -1, -232), make('east-ave-docks', 'East Ave Docks', 1, 80)];
}

/** The whole walkable dock area as rectangles (pier and head), for maps and "on the dock" checks. */
export function dockRects(d: DockPlan): Rect[] {
  return [d.pier, d.head];
}

// ------------------------------------------------------------------ building

export interface DocksView {
  root: THREE.Group;
  update(t: number): void;
}

export function buildDocks(plans: readonly DockPlan[], world: RAPIER.World): DocksView {
  const root = new THREE.Group();
  root.name = 'docks';
  const planks = withSurface(new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.92 }), 'wood');
  const timber = withSurface(new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 }), 'wood');
  const steel = withSurface(new THREE.MeshStandardMaterial({ color: 0x2f3436, roughness: 0.5, metalness: 0.7 }), 'paintedMetal');
  const yellow = withSurface(new THREE.MeshStandardMaterial({ color: 0xe0a91c, roughness: 0.55, metalness: 0.4 }), 'paintedMetal');
  const rope = new THREE.MeshStandardMaterial({ color: 0xc9b28a, roughness: 1 });
  const boats: Array<{ g: THREE.Group; x: number; z: number; h: number; ph: number }> = [];
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root, ry = 0): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const solid = (r: Rect, y0: number, y1: number): void => {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid((r.x1 - r.x0) / 2, (y1 - y0) / 2, (r.z1 - r.z0) / 2)
        .setTranslation((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2)
        .setFriction(0.8)
        .setCollisionGroups(WORLD_GROUPS),
    );
  };
  const pileGeo = new THREE.CylinderGeometry(0.22, 0.25, 3.6, 8);
  pileGeo.translate(0, DECK - 0.35 - 1.8, 0);
  const piles: THREE.Vector3[] = [];
  const containerMats = [0xb8352c, 0x2f6fb1, 0x2f8f5b, 0xd9a12c, 0x6a6f74].map((c) => withSurface(new THREE.MeshStandardMaterial({ color: c, map: ribTexture(), roughness: 0.65, metalness: 0.35 }), 'paintedMetal'));

  for (const d of plans) {
    const s = d.side;
    // ---- decks: planks on a timber frame, solid to walk and drive on
    for (const r of dockRects(d)) {
      const w = r.x1 - r.x0;
      const l = r.z1 - r.z0;
      const deck = box(w, 0.3, l, planks, (r.x0 + r.x1) / 2, DECK - 0.15, (r.z0 + r.z1) / 2);
      const tex = (deck.material as THREE.MeshStandardMaterial).map;
      if (tex) tex.repeat.set(1, 1);
      box(w, 0.25, 0.3, timber, (r.x0 + r.x1) / 2, DECK - 0.42, r.z0 + 0.15);
      box(w, 0.25, 0.3, timber, (r.x0 + r.x1) / 2, DECK - 0.42, r.z1 - 0.15);
      solid(r, DECK - 0.5, DECK);
      for (let x = r.x0 + 1; x < r.x1; x += 4) for (const z of [r.z0 + 0.4, r.z1 - 0.4, (r.z0 + r.z1) / 2]) piles.push(new THREE.Vector3(x, 0, z));
    }
    // ---- railings: along the pier and round the head, open where the boats tie up
    const rail = (ax: number, az: number, bx: number, bz: number): void => {
      const len = Math.hypot(bx - ax, bz - az);
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      for (const y of [0.5, 1.0]) box(alongX ? len : 0.07, 0.07, alongX ? 0.07 : len, steel, (ax + bx) / 2, DECK + y, (az + bz) / 2);
      const n = Math.max(1, Math.floor(len / 2.5));
      for (let i = 0; i <= n; i++) box(0.09, 1.05, 0.09, steel, ax + ((bx - ax) * i) / n, DECK + 0.52, az + ((bz - az) * i) / n);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(alongX ? len / 2 : 0.12, 0.75, alongX ? 0.12 : len / 2)
          .setTranslation((ax + bx) / 2, DECK + 0.75, (az + bz) / 2)
          .setCollisionGroups(WORLD_GROUPS),
      );
    };
    const p = d.pier;
    const h = d.head;
    const nearX = s < 0 ? p.x1 : p.x0;
    const farX = s < 0 ? p.x0 : p.x1;
    rail(nearX, p.z0, farX, p.z0);
    // The fishing boat's side of the pier: a gap for the gangway.
    const gap0 = (p.x0 + p.x1) / 2 - 4;
    const gap1 = (p.x0 + p.x1) / 2 + 4;
    rail(p.x0, p.z1, gap0, p.z1);
    rail(gap1, p.z1, p.x1, p.z1);
    const hNear = s < 0 ? h.x1 : h.x0;
    const hFar = s < 0 ? h.x0 : h.x1;
    rail(hNear, h.z0, hNear, p.z0);
    rail(hNear, p.z1, hNear, h.z1);
    rail(hNear, h.z0, hFar, h.z0);
    rail(hNear, h.z1, hFar, h.z1);
    rail(hFar, h.z0, hFar, d.z - 2);
    rail(hFar, d.z + 6, hFar, h.z1);
    // ---- bollards with mooring lines to the boats
    const bollard = (x: number, z: number): void => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 10), steel);
      b.position.set(x, DECK + 0.27, z);
      b.castShadow = true;
      root.add(b);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 10), steel);
      cap.position.set(x, DECK + 0.58, z);
      root.add(cap);
    };
    const line = (ax: number, az: number, bx: number, bz: number, by: number): void => {
      const a = new THREE.Vector3(ax, DECK + 0.5, az);
      const b = new THREE.Vector3(bx, by, bz);
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 5), rope);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      root.add(m);
    };
    for (let i = 0; i < 4; i++) bollard(nearX + s * (6 + i * 8), p.z1 - 0.5);
    for (const dz of [-4, 2, 8]) bollard(hFar - s * 0.6, d.z + dz);
    // ---- the gantry crane over the T-head and the containers under it
    const cx = (h.x0 + h.x1) / 2;
    const legH = 14;
    for (const dz of [-11, 11]) for (const dx of [-5.5, 5.5]) box(0.6, legH, 0.6, yellow, cx + dx, DECK + legH / 2, d.z + dz);
    for (const dz of [-11, 11]) box(12, 0.8, 0.8, yellow, cx, DECK + legH, d.z + dz);
    for (const dx of [-5.5, 5.5]) box(0.9, 1.1, 24, yellow, cx + dx, DECK + legH + 0.9, d.z);
    box(3, 2.4, 2.6, yellow, cx, DECK + legH + 2.5, d.z + 3); // the cab
    box(2.4, 0.15, 2.5, steel, cx, DECK + legH - 2.2, d.z - 4); // spreader
    for (const dx of [-0.8, 0.8]) box(0.05, 2.0, 0.05, steel, cx + dx, DECK + legH - 1.1, d.z - 4);
    for (const dx of [-5.5, 5.5]) solid({ x0: cx + dx - 0.3, x1: cx + dx + 0.3, z0: d.z - 11.3, z1: d.z - 10.7 }, DECK, DECK + legH);
    for (const dx of [-5.5, 5.5]) solid({ x0: cx + dx - 0.3, x1: cx + dx + 0.3, z0: d.z + 10.7, z1: d.z + 11.3 }, DECK, DECK + legH);
    const stacks: Array<[number, number, number]> = [
      [-2.6, -8, 2],
      [2.6, -8, 1],
      [-2.6, 6, 3],
      [2.6, 6, 2],
    ];
    let k = s < 0 ? 0 : 2;
    for (const [dx, dz, n] of stacks) {
      for (let i = 0; i < n; i++) {
        const c = box(2.44, 2.59, 6.06, containerMats[k++ % containerMats.length], cx + dx, DECK + 1.3 + i * 2.6, d.z + dz);
        c.rotation.y = (i % 2 ? 0.02 : -0.015) * s;
      }
      solid({ x0: cx + dx - 1.22, x1: cx + dx + 1.22, z0: d.z + dz - 3.03, z1: d.z + dz + 3.03 }, DECK, DECK + n * 2.6);
    }
    // ---- pallets and crates by the pier root, a lamp at each corner of the head
    for (let i = 0; i < 5; i++) {
      const x = nearX + s * (2.5 + (i % 3) * 1.4);
      const z = p.z0 + 1 + Math.floor(i / 3) * 1.4;
      box(1.1, 0.14, 1.1, timber, x, DECK + 0.07, z);
      if (i % 2 === 0) box(0.9, 0.8, 0.9, planks, x, DECK + 0.55, z);
    }
    for (const [lx, lz] of [
      [hNear, h.z0 + 0.6],
      [hNear, h.z1 - 0.6],
      [hFar, h.z0 + 0.6],
      [hFar, h.z1 - 0.6],
    ]) {
      box(0.12, 5, 0.12, steel, lx - s * 0.5, DECK + 2.5, lz);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe2a6 }));
      lamp.position.set(lx - s * 0.5, DECK + 5, lz);
      root.add(lamp);
    }
    // ---- boats
    for (const b of d.boats) {
      const g = b.kind === 'tug' ? tug(steel) : fishingBoat(timber);
      g.position.set(b.x, RIVER, b.z);
      g.rotation.y = b.heading;
      root.add(g);
      boats.push({ g, x: b.x, z: b.z, h: b.heading, ph: b.x * 0.13 + b.z * 0.07 });
      // Lines from the boat's bow and stern to the nearest bollards.
      const dirX = Math.cos(b.heading);
      const dirZ = -Math.sin(b.heading);
      for (const e of [-1, 1]) {
        const bx = b.x + dirX * e * (b.kind === 'tug' ? 4 : 3.2);
        const bz = b.z + dirZ * e * (b.kind === 'tug' ? 4 : 3.2);
        const tx = b.kind === 'tug' ? hFar - s * 0.6 : bx;
        const tz = b.kind === 'tug' ? bz : p.z1 - 0.5;
        line(tx, tz, bx, bz, RIVER + 1.6);
      }
    }
  }
  const pilesMesh = new THREE.InstancedMesh(pileGeo, timber, piles.length);
  const m4 = new THREE.Matrix4();
  piles.forEach((p, i) => pilesMesh.setMatrixAt(i, m4.makeTranslation(p.x, 0, p.z)));
  pilesMesh.castShadow = true;
  root.add(pilesMesh);

  return {
    root,
    update(t) {
      // The boats ride the river swell: heave, a little roll and pitch.
      for (const b of boats) {
        b.g.position.y = RIVER + 0.12 * Math.sin(t * 0.8 + b.ph);
        b.g.rotation.set(0.03 * Math.sin(t * 0.6 + b.ph), b.h, 0.04 * Math.sin(t * 0.7 + b.ph * 1.7));
      }
    },
  };
}

/** A harbour tug: black hull, red boot-top, white wheelhouse, a funnel and tyre fenders. */
function tug(steel: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const hullMat = withSurface(new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.6, metalness: 0.3 }), 'paintedMetal');
  const red = withSurface(new THREE.MeshStandardMaterial({ color: 0x9b2a22, roughness: 0.6 }), 'paintedMetal');
  const white = withSurface(new THREE.MeshStandardMaterial({ color: 0xe9e7e0, roughness: 0.5 }), 'paintedMetal');
  const add = (m: THREE.Mesh): THREE.Mesh => {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const hull = new THREE.Shape();
  hull.moveTo(-4.5, -1.6);
  hull.lineTo(3.2, -1.6);
  hull.quadraticCurveTo(5.2, -1.4, 5.4, 0);
  hull.quadraticCurveTo(5.2, 1.4, 3.2, 1.6);
  hull.lineTo(-4.5, 1.6);
  hull.lineTo(-4.5, -1.6);
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 2.2, bevelEnabled: false });
  hg.rotateX(-Math.PI / 2);
  hg.translate(0, -1.1, 0);
  add(new THREE.Mesh(hg, hullMat));
  const boot = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.25, 3.25), red);
  boot.position.set(0.3, -0.05, 0);
  add(boot);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.4), white);
  cabin.position.set(-0.5, 2.0, 0);
  add(cabin);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 2.6), white);
  bridge.position.set(0.0, 3.35, 0);
  add(bridge);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.45, 2.65), new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.1, metalness: 0.5 }));
  glass.position.set(0.0, 3.45, 0);
  add(glass);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 2.2, 10), red);
  funnel.position.set(-2.3, 3.0, 0);
  add(funnel);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.3, 10), hullMat);
  band.position.set(-2.3, 3.9, 0);
  add(band);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), steel);
  mast.position.set(0.0, 5.0, 0);
  add(mast);
  // Tyre fenders along both sides.
  const tyre = new THREE.TorusGeometry(0.32, 0.12, 6, 12);
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(tyre, hullMat);
    t.position.set(-3.5 + i * 1.7, 0.6, side * 1.68);
    add(t);
  }
  return g;
}

/** A small wooden fishing boat: a white hull, a wheelhouse, a mast with a boom and nets. */
function fishingBoat(timber: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const hullMat = withSurface(new THREE.MeshStandardMaterial({ color: 0xe6e2d6, roughness: 0.7 }), 'paintedMetal');
  const blue = withSurface(new THREE.MeshStandardMaterial({ color: 0x2c5f8a, roughness: 0.6 }), 'paintedMetal');
  const add = (m: THREE.Mesh): THREE.Mesh => {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const hull = new THREE.Shape();
  hull.moveTo(-3.4, -1.2);
  hull.lineTo(2.2, -1.2);
  hull.quadraticCurveTo(3.9, -0.8, 4.1, 0);
  hull.quadraticCurveTo(3.9, 0.8, 2.2, 1.2);
  hull.lineTo(-3.4, 1.2);
  hull.lineTo(-3.4, -1.2);
  const hg = new THREE.ExtrudeGeometry(hull, { depth: 1.6, bevelEnabled: false });
  hg.rotateX(-Math.PI / 2);
  hg.translate(0, -0.7, 0);
  add(new THREE.Mesh(hg, hullMat));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.2, 2.45), blue);
  stripe.position.set(0.3, 0.75, 0);
  add(stripe);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.08, 2.2), timber);
  deck.position.set(0.3, 0.9, 0);
  add(deck);
  const house = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 1.6), hullMat);
  house.position.set(0.9, 1.7, 0);
  add(house);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.8), blue);
  roof.position.set(0.9, 2.5, 0);
  add(roof);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 4, 6), timber);
  mast.position.set(-1.0, 2.9, 0);
  add(mast);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), timber);
  boom.rotation.z = 1.1;
  boom.position.set(-2.0, 2.6, 0);
  add(boom);
  const net = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshStandardMaterial({ color: 0x5f7a4a, roughness: 1, wireframe: true }));
  net.scale.set(1.3, 0.6, 1);
  net.position.set(-2.4, 1.2, 0.2);
  add(net);
  return g;
}

function plankTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 16; i++) {
    const v = 92 + ((i * 37) % 23);
    g.fillStyle = `rgb(${v + 20},${v},${v - 22})`;
    g.fillRect(0, i * 16, 256, 15);
    g.fillStyle = 'rgba(30,20,10,0.6)';
    g.fillRect(0, i * 16 + 15, 256, 1);
    g.fillRect(((i * 97) % 200) + 20, i * 16, 1, 15);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The corrugated sides of a shipping container (a greyscale ribbing the paint colour tints). */
function ribTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 128; x += 8) {
    const grd = g.createLinearGradient(x, 0, x + 8, 0);
    grd.addColorStop(0, '#d0d0d0');
    grd.addColorStop(0.5, '#ffffff');
    grd.addColorStop(1, '#a8a8a8');
    g.fillStyle = grd;
    g.fillRect(x, 0, 8, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
