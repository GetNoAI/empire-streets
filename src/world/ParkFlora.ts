import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GROUP, groups } from '../config';
import { withSurface } from '../render/Surfaces';
import type { Rect } from './CityLayout';

/**
 * The Central Green, fleshed out: meadows of tall grass that sway in the wind (more in a storm),
 * flower beds along the paths and wildflowers in the grass, hedges and shrubs, pines among the
 * broadleaf trees, and benches by the paths. All instanced (a handful of draw calls for thousands
 * of tufts); the sway is in the vertex shader, driven by `FLORA_WIND`.
 */

const WORLD_GROUPS = groups(GROUP.WORLD, 0xffff);

/** Wind for the grass and flowers: time and strength (the weather turns it up). */
export const FLORA_WIND = { time: { value: 0 }, strength: { value: 0.35 } };

/** Small seeded random. */
class R {
  constructor(private s: number) {}
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
}

/** Sways the top of each instance (by height) with the wind; leaves the roots planted. */
function swaying<T extends THREE.Material>(mat: T, height: number): T {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindT = FLORA_WIND.time;
    sh.uniforms.uWindS = FLORA_WIND.strength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindT;\nuniform float uWindS;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float k = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.0);
          float ph = ip.x * 0.37 + ip.z * 0.23;
          float gust = sin(uWindT * 1.7 + ph) * 0.6 + sin(uWindT * 3.1 + ph * 1.9) * 0.4;
          transformed.x += gust * uWindS * k * k * 0.45;
          transformed.z += cos(uWindT * 1.3 + ph) * uWindS * k * k * 0.25;
        }`,
      );
  };
  return mat;
}

/** A tuft of grass blades (tapered triangles), with a colour gradient from root to tip. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7;
    const r = 0.06 + (b % 3) * 0.05;
    const h = 0.75 + ((b * 37) % 10) * 0.07;
    const lean = 0.12 + (b % 2) * 0.1;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const w = 0.035;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    const tx = bx + Math.cos(a) * lean;
    const tz = bz + Math.sin(a) * lean;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    col.push(0.16, 0.26, 0.09, 0.16, 0.26, 0.09, 0.55, 0.65, 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A flower: a stem and a five-petal head (the head is coloured per instance). */
function flowerGeometry(): { stem: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.42, 4);
  stem.translate(0, 0.21, 0);
  const head = new THREE.CircleGeometry(0.075, 5);
  head.rotateX(-Math.PI / 2);
  head.translate(0, 0.43, 0);
  const centre = new THREE.SphereGeometry(0.025, 6, 4);
  centre.translate(0, 0.44, 0);
  return { stem, head };
}

export interface ParkFloraOptions {
  park: Rect;
  lake: Rect;
  paths: readonly Rect[];
  baseY: number;
  /** Where trees already stand (keep the new ones clear). */
  trees: ReadonlyArray<{ x: number; z: number }>;
  /** Grass tuft count (phones get fewer). */
  density?: number;
}

export function buildParkFlora(o: ParkFloraOptions, world: RAPIER.World, seed = 4711): THREE.Group {
  const root = new THREE.Group();
  root.name = 'park-flora';
  const rng = new R(seed);
  const { park, lake, paths, baseY } = o;
  const onPath = (x: number, z: number, m = 0.6): boolean => paths.some((r) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);
  const inLake = (x: number, z: number, m = 1.5): boolean => x > lake.x0 - m && x < lake.x1 + m && z > lake.z0 - m && z < lake.z1 + m;
  const nearTree = (x: number, z: number, r: number): boolean => o.trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < r * r);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  // ---- meadows of tall grass: clumped (patches), thicker by the lake shore
  const N = Math.round((o.density ?? 1) * 9000);
  const tuft = new THREE.InstancedMesh(tuftGeometry(), swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 1.2), N);
  const patches = Array.from({ length: 70 }, () => ({ x: rng.range(park.x0 + 6, park.x1 - 6), z: rng.range(park.z0 + 6, park.z1 - 6), r: rng.range(6, 16) }));
  let n = 0;
  for (let tries = 0; n < N && tries < N * 4; tries++) {
    let x: number;
    let z: number;
    if (rng.next() < 0.75) {
      const p = patches[Math.floor(rng.next() * patches.length)];
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * p.r;
      x = p.x + Math.cos(a) * d;
      z = p.z + Math.sin(a) * d;
    } else {
      // The lake shore.
      const side = Math.floor(rng.next() * 4);
      const t = rng.next();
      x = side < 2 ? lake.x0 + (lake.x1 - lake.x0) * t : side === 2 ? lake.x0 - rng.range(1.8, 5) : lake.x1 + rng.range(1.8, 5);
      z = side < 2 ? (side === 0 ? lake.z0 - rng.range(1.8, 5) : lake.z1 + rng.range(1.8, 5)) : lake.z0 + (lake.z1 - lake.z0) * t;
    }
    if (x < park.x0 + 2 || x > park.x1 - 2 || z < park.z0 + 2 || z > park.z1 - 2) continue;
    if (onPath(x, z) || inLake(x, z) || nearTree(x, z, 0.8)) continue;
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    const h = rng.range(0.7, 1.5);
    m.compose(v.set(x, baseY, z), q, s.set(rng.range(0.8, 1.3), h, rng.range(0.8, 1.3)));
    tuft.setMatrixAt(n, m);
    col.setHSL(rng.range(0.2, 0.28), rng.range(0.35, 0.55), rng.range(0.42, 0.62));
    tuft.setColorAt(n, col);
    n++;
  }
  tuft.count = n;
  tuft.receiveShadow = true;
  root.add(tuft);

  // ---- flowers: beds along the paths and wildflowers in the meadows
  const palette = ['#e8364a', '#ffd23f', '#f2f2f2', '#b05ad8', '#ff8a3a', '#ff7ab0', '#5aa0ff'];
  const { stem, head } = flowerGeometry();
  const FN = Math.round((o.density ?? 1) * 2600);
  const stems = new THREE.InstancedMesh(stem, swaying(new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.9 }), 0.45), FN);
  const heads = new THREE.InstancedMesh(head, swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }), 0.45), FN);
  let fn = 0;
  const plant = (x: number, z: number, c: string): void => {
    if (fn >= FN) return;
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    m.compose(v.set(x, baseY, z), q, s.setScalar(rng.range(0.8, 1.3)));
    stems.setMatrixAt(fn, m);
    heads.setMatrixAt(fn, m);
    heads.setColorAt(fn, col.set(c));
    fn++;
  };
  // Beds: strips beside each path, a colour per bed in drifts.
  const beds: Rect[] = [];
  for (const p of paths) {
    const long = p.x1 - p.x0 > p.z1 - p.z0;
    for (let k = 0; k < 6; k++) {
      const t = rng.range(0.08, 0.85);
      const len = rng.range(5, 9);
      const side = rng.next() < 0.5 ? -1 : 1;
      const r: Rect = long
        ? { x0: p.x0 + (p.x1 - p.x0) * t, x1: p.x0 + (p.x1 - p.x0) * t + len, z0: side < 0 ? p.z0 - 2.6 : p.z1 + 0.8, z1: side < 0 ? p.z0 - 0.8 : p.z1 + 2.6 }
        : { x0: side < 0 ? p.x0 - 2.6 : p.x1 + 0.8, x1: side < 0 ? p.x0 - 0.8 : p.x1 + 2.6, z0: p.z0 + (p.z1 - p.z0) * t, z1: p.z0 + (p.z1 - p.z0) * t + len };
      if (inLake((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 3) || r.x0 < park.x0 + 1 || r.x1 > park.x1 - 1 || r.z0 < park.z0 + 1 || r.z1 > park.z1 - 1) continue;
      beds.push(r);
    }
  }
  const soil = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 1), withSurface(new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }), 'gravel'), beds.length);
  beds.forEach((r, i) => {
    m.compose(v.set((r.x0 + r.x1) / 2, baseY + 0.02, (r.z0 + r.z1) / 2), q.identity(), s.set(r.x1 - r.x0, 1, r.z1 - r.z0));
    soil.setMatrixAt(i, m);
    const c1 = palette[Math.floor(rng.next() * palette.length)];
    const c2 = palette[Math.floor(rng.next() * palette.length)];
    const area = (r.x1 - r.x0) * (r.z1 - r.z0);
    for (let k = 0; k < area * 9; k++) {
      const x = rng.range(r.x0 + 0.1, r.x1 - 0.1);
      const z = rng.range(r.z0 + 0.1, r.z1 - 0.1);
      plant(x, z, (x - r.x0) / (r.x1 - r.x0) + rng.range(-0.2, 0.2) < 0.5 ? c1 : c2);
    }
  });
  soil.receiveShadow = true;
  root.add(soil);
  // Wildflowers in the meadows.
  for (let tries = 0; fn < FN && tries < 20000; tries++) {
    const p = patches[Math.floor(rng.next() * patches.length)];
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * p.r;
    const x = p.x + Math.cos(a) * d;
    const z = p.z + Math.sin(a) * d;
    if (x < park.x0 + 2 || x > park.x1 - 2 || z < park.z0 + 2 || z > park.z1 - 2 || onPath(x, z) || inLake(x, z) || nearTree(x, z, 0.7)) continue;
    plant(x, z, palette[(Math.floor(p.x) + Math.floor(rng.next() * 3)) % palette.length]);
  }
  stems.count = fn;
  heads.count = fn;
  root.add(stems, heads);

  // ---- hedges and shrubs along the paths, pines among the trees
  const shrubs: Array<{ x: number; z: number; s: number }> = [];
  for (const p of paths)
    for (let k = 0; k < 10; k++) {
      const long = p.x1 - p.x0 > p.z1 - p.z0;
      const t = rng.next();
      const side = rng.next() < 0.5 ? -1 : 1;
      const x = long ? p.x0 + (p.x1 - p.x0) * t : side < 0 ? p.x0 - 1.2 : p.x1 + 1.2;
      const z = long ? (side < 0 ? p.z0 - 1.2 : p.z1 + 1.2) : p.z0 + (p.z1 - p.z0) * t;
      if (inLake(x, z, 2) || nearTree(x, z, 2) || beds.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) continue;
      shrubs.push({ x, z, s: rng.range(0.7, 1.3) });
    }
  const shrubGeo = new THREE.IcosahedronGeometry(0.9, 1);
  shrubGeo.scale(1.2, 0.75, 1.2);
  shrubGeo.translate(0, 0.55, 0);
  const shrubM = new THREE.InstancedMesh(shrubGeo, withSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), 'foliage'), Math.max(1, shrubs.length));
  shrubs.forEach((b, i) => {
    q.setFromAxisAngle(up, rng.range(0, 6));
    m.compose(v.set(b.x, baseY, b.z), q, s.setScalar(b.s));
    shrubM.setMatrixAt(i, m);
    shrubM.setColorAt(i, col.setHSL(rng.range(0.24, 0.33), 0.45, rng.range(0.2, 0.3)));
  });
  shrubM.count = shrubs.length;
  shrubM.castShadow = shrubM.receiveShadow = true;
  root.add(shrubM);
  const pines: Array<{ x: number; z: number; s: number }> = [];
  for (let tries = 0; pines.length < 60 && tries < 2000; tries++) {
    const x = rng.range(park.x0 + 5, park.x1 - 5);
    const z = rng.range(park.z0 + 5, park.z1 - 5);
    if (onPath(x, z, 3) || inLake(x, z, 5) || nearTree(x, z, 5) || pines.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 36)) continue;
    pines.push({ x, z, s: rng.range(0.9, 1.5) });
  }
  const pineTrunk = new THREE.CylinderGeometry(0.14, 0.24, 2, 6);
  pineTrunk.translate(0, 1, 0);
  const pineTop = new THREE.ConeGeometry(1.7, 5.2, 8, 3);
  pineTop.translate(0, 4.2, 0);
  const pt = new THREE.InstancedMesh(pineTrunk, withSurface(new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 }), 'bark'), Math.max(1, pines.length));
  const pc = new THREE.InstancedMesh(pineTop, withSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), 'foliage'), Math.max(1, pines.length));
  pines.forEach((p, i) => {
    m.compose(v.set(p.x, baseY, p.z), q.setFromAxisAngle(up, rng.range(0, 6)), s.setScalar(p.s));
    pt.setMatrixAt(i, m);
    pc.setMatrixAt(i, m);
    pc.setColorAt(i, col.setHSL(rng.range(0.3, 0.38), 0.45, rng.range(0.16, 0.24)));
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.0 * p.s, 0.22 * p.s).setTranslation(p.x, baseY + 1.0 * p.s, p.z).setCollisionGroups(WORLD_GROUPS));
  });
  pt.count = pc.count = pines.length;
  for (const mm of [pt, pc]) mm.castShadow = mm.receiveShadow = true;
  root.add(pt, pc);

  // ---- benches along the loop
  const benchM = withSurface(new THREE.MeshStandardMaterial({ color: 0x5a3e24, roughness: 0.8 }), 'wood');
  const ironM = new THREE.MeshStandardMaterial({ color: 0x1e2226, metalness: 0.6, roughness: 0.5 });
  for (const p of paths.slice(0, 4)) {
    const long = p.x1 - p.x0 > p.z1 - p.z0;
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      const x = long ? p.x0 + (p.x1 - p.x0) * t : p.x1 + 0.9;
      const z = long ? p.z1 + 0.9 : p.z0 + (p.z1 - p.z0) * t;
      if (inLake(x, z, 2) || beds.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) continue;
      const b = new THREE.Group();
      b.position.set(x, baseY, z);
      b.rotation.y = long ? 0 : Math.PI / 2;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), benchM);
      seat.position.y = 0.45;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.05), benchM);
      back.position.set(0, 0.72, 0.22);
      b.add(seat, back);
      for (const lx of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.45), ironM);
        leg.position.set(lx, 0.22, 0);
        b.add(leg);
      }
      for (const c of b.children) c.castShadow = true;
      root.add(b);
    }
  }
  return root;
}
