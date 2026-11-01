import * as THREE from 'three';
import { Rng } from '../util/rng';
import { withSurface } from '../render/Surfaces';
import type { CityLayout } from './CityLayout';

/**
 * The small mess of a real street (no colliders, one draw call each): bin bags piled at the
 * kerb for collection, litter on the pavements and in the gutters (paper, cups, flattened
 * boxes), storm-drain grates at the block corners and a few manhole covers in the road.
 * Everything is instanced and placed deterministically from the layout seed, keeping clear of
 * the street furniture it's given.
 */

export interface ClutterCounts {
  bags: number;
  litter: number;
  grates: number;
  covers: number;
}

export function buildStreetClutter(layout: CityLayout, curbY: number, avoid: Array<{ x: number; z: number }>, density = 1): { group: THREE.Group; counts: ClutterCounts } {
  const group = new THREE.Group();
  group.name = 'clutter';
  const rng = new Rng(layout.seed + 4711);
  const grid = new Map<string, Array<{ x: number; z: number }>>();
  const key = (x: number, z: number): string => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
  for (const a of avoid) {
    const k = key(a.x, a.z);
    const l = grid.get(k);
    if (l) l.push(a);
    else grid.set(k, [a]);
  }
  const free = (x: number, z: number, r = 1.6): boolean => {
    const cx = Math.floor(x / 6);
    const cz = Math.floor(z / 6);
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cz - 1; j <= cz + 1; j++) for (const p of grid.get(`${i},${j}`) ?? []) if (Math.hypot(p.x - x, p.z - z) < r) return false;
    return true;
  };

  // ---- bin bags: lumpy, black, a little glossy; two or three to a pile at the kerb.
  const bags: THREE.Matrix4[] = [];
  const litter: Array<{ m: THREE.Matrix4; c: THREE.Color }> = [];
  const grates: THREE.Matrix4[] = [];
  const covers: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (x: number, y: number, z: number, rot: number, sx: number, sy: number, sz: number): THREE.Matrix4 => {
    q.setFromAxisAngle(up, rot);
    return m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)).clone();
  };
  for (const b of layout.blocks) {
    for (const side of [0, 1] as const) {
      const z = side === 0 ? b.z0 + 0.75 : b.z1 - 0.75;
      for (let x = b.x0 + 12; x < b.x1 - 12; x += 17) {
        if (!rng.chance(0.42 * density)) continue;
        const px = x + rng.range(-3, 3);
        if (!free(px, z, 2.2)) continue;
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) {
          const s = rng.range(0.34, 0.5);
          bags.push(place(px + rng.range(-0.5, 0.5) + i * 0.55, curbY + s * 0.7, z + rng.range(-0.25, 0.25), rng.range(0, Math.PI * 2), s, s * rng.range(0.75, 0.95), s * rng.range(0.85, 1.15)));
        }
      }
      // Litter along the pavement and in the gutter.
      for (let x = b.x0 + 3; x < b.x1 - 3; x += 4) {
        if (!rng.chance(0.55 * density)) continue;
        const gutter = rng.chance(0.4);
        const lz = gutter ? (side === 0 ? b.z0 - 0.5 : b.z1 + 0.5) : z + rng.range(-0.7, 1.4);
        const lx = x + rng.range(-1.5, 1.5);
        if (!free(lx, lz, 0.8)) continue;
        const s = rng.range(0.12, 0.3);
        const tone = rng.range(0.55, 0.95);
        const paper = rng.chance(0.7);
        litter.push({ m: place(lx, gutter ? 0.004 : curbY + 0.004, lz, rng.range(0, Math.PI * 2), s, 1, s * rng.range(0.6, 1.4)), c: paper ? new THREE.Color(tone, tone * 0.97, tone * 0.9) : new THREE.Color(0.55 + rng.range(0, 0.3), 0.35, 0.2) });
      }
      // A storm drain near each corner.
      for (const cx of [b.x0 + 2.2, b.x1 - 2.2]) {
        const gz = side === 0 ? b.z0 - 0.45 : b.z1 + 0.45;
        grates.push(place(cx, 0.006, gz, 0, 1, 1, 1));
      }
    }
  }
  // Manhole covers in the road, mid-lane, every so often.
  for (const road of layout.roads) {
    const alongX = road.kind === 'street';
    for (let s = road.from + 25; s < road.to - 25; s += 60 + rng.range(0, 30)) {
      const c = road.center + (rng.chance(0.5) ? 2.2 : -2.2);
      const [x, z] = alongX ? [s, c] : [c, s];
      covers.push(place(x, 0.006, z, rng.range(0, Math.PI * 2), 1, 1, 1));
    }
  }

  const bagGeo = new THREE.IcosahedronGeometry(1, 1);
  jitter(bagGeo, 0.16, 7);
  bagGeo.scale(1.05, 0.8, 1);
  const bagMesh = instanced(bagGeo, withSurface(new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.45, flatShading: true }), 'plastic'), bags);
  bagMesh.castShadow = true;
  group.add(bagMesh);

  const litterGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const litterMesh = instanced(litterGeo, withSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'paper'), litter.map((l) => l.m));
  const col = new THREE.Color();
  litter.forEach((l, i) => litterMesh.setColorAt(i, col.copy(l.c)));
  if (litterMesh.instanceColor) litterMesh.instanceColor.needsUpdate = true;
  group.add(litterMesh);

  const grateMesh = instanced(grateGeometry(), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.7, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), grates);
  group.add(grateMesh);

  const coverMesh = instanced(coverGeometry(), withSurface(new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.6, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 'rust'), covers);
  group.add(coverMesh);

  return { group, counts: { bags: bags.length, litter: litter.length, grates: grates.length, covers: covers.length } };
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = mats.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Pushes each vertex in or out along its normal by a seeded amount (lumps). */
function jitter(g: THREE.BufferGeometry, amount: number, seed: number): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let f = seen.get(k);
    if (f === undefined) {
      let h = (seed * 2654435761 + seen.size * 1597334677) >>> 0;
      h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
      f = 1 + ((h / 4294967296) * 2 - 1) * amount;
      seen.set(k, f);
    }
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
}

/** A storm-drain grate: a frame with five slots, lying flat. */
function grateGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const frame = new THREE.BoxGeometry(0.9, 0.02, 0.5);
  parts.push(frame.translate(0, 0, 0));
  for (let i = 0; i < 5; i++) parts.push(new THREE.BoxGeometry(0.1, 0.03, 0.42).translate(-0.32 + i * 0.16, 0.012, 0));
  return merge(parts);
}

/** A round manhole cover with a raised rim. */
function coverGeometry(): THREE.BufferGeometry {
  return merge([new THREE.CylinderGeometry(0.42, 0.42, 0.02, 20), new THREE.TorusGeometry(0.4, 0.02, 6, 20).rotateX(Math.PI / 2).translate(0, 0.012, 0)]);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g0 of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
    uv.push(...(g.getAttribute('uv').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/** Faceted, lumpy tree canopy (two overlapping crowns) with per-vertex colour variation. */
export function canopyGeometry(seed: number): THREE.BufferGeometry {
  const a = new THREE.IcosahedronGeometry(2.3, 1);
  jitter(a, 0.14, seed);
  a.translate(0, 4.6, 0);
  const b = new THREE.IcosahedronGeometry(1.7, 1);
  jitter(b, 0.16, seed + 3);
  b.translate(0.9, 5.4, -0.6);
  const c = new THREE.IcosahedronGeometry(1.5, 1);
  jitter(c, 0.16, seed + 5);
  c.translate(-0.8, 3.9, 0.7);
  const g = merge([a, b, c]);
  g.computeVertexNormals();
  // Flat facets: each triangle gets its own normal, and a shade of its own.
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 3) {
    p0.fromBufferAttribute(pos, i);
    p1.fromBufferAttribute(pos, i + 1);
    p2.fromBufferAttribute(pos, i + 2);
    n.subVectors(p1, p0).cross(p2.clone().sub(p0)).normalize();
    let h = ((i + seed * 97) * 2654435761) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    const shade = 0.82 + (h / 4294967296) * 0.36;
    for (let k = 0; k < 3; k++) {
      nor.setXYZ(i + k, n.x, n.y, n.z);
      col[(i + k) * 3] = shade;
      col[(i + k) * 3 + 1] = shade;
      col[(i + k) * 3 + 2] = shade;
    }
  }
  nor.needsUpdate = true;
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
