import * as THREE from 'three';
import { cellUV, type CellStyle, type SurfaceClass } from './Atlas';

/**
 * Geometry passes for the procedural models (three.js maths only):
 *
 *  - mergeCoplanar: re-triangulates flat convex areas made of more triangles than they need
 *    (cylinder and cone caps are fans of n triangles; a convex n-gon needs n - 2).
 *  - Shapes + isInside / cullHidden: drops triangles buried inside another opaque part on the
 *    same rig node (they can never be seen, since parts on one node never move apart).
 *  - unwrapTriangle: atlas UVs per triangle - which cell (surface class x style) and where in it:
 *    faces sample a gradient running from the part's bottom to its top (or along its length),
 *    exposed edges of bevelled parts map to the edge-wear or rust cells, and anything near the
 *    ground to grime.
 *  - triangleTangent: a glTF / MikkTSpace-compatible tangent for a flat triangle.
 */

// ---------------------------------------------------------------------------- shapes

/** The convex shape of a part in its own (untransformed) space, for the hidden-face test. */
export type Shape =
  | { kind: 'box'; hx: number; hy: number; hz: number; c: number }
  | { kind: 'sphere'; r: number; segs: number; rings: number }
  | { kind: 'cylinder'; rTop: number; rBot: number; h: number; c: number; segs: number }
  | { kind: 'other' };

const EPS = 1e-4;

/** True if a point (in the part's own space) is strictly inside the part's actual faceted solid. */
export function isInside(s: Shape, p: THREE.Vector3): boolean {
  switch (s.kind) {
    case 'box':
      // Conservative for chamfered boxes: the box shrunk by the chamfer on every axis.
      return Math.abs(p.x) < s.hx - s.c - EPS && Math.abs(p.y) < s.hy - s.c - EPS && Math.abs(p.z) < s.hz - s.c - EPS;
    case 'sphere': {
      // Inside the inscribed polyhedron: radius shrunk to the facets' closest approach.
      const k = Math.cos(Math.PI / s.segs) * Math.cos(Math.PI / (2 * s.rings));
      return p.length() < s.r * k - EPS;
    }
    case 'cylinder': {
      const hh = s.h / 2 - s.c;
      if (Math.abs(p.y) >= hh - EPS) return false;
      const t = (p.y + s.h / 2) / s.h;
      const r = (s.rBot + (s.rTop - s.rBot) * t) * Math.cos(Math.PI / s.segs) - s.c;
      return Math.hypot(p.x, p.z) < r - EPS;
    }
    default:
      return false;
  }
}

export interface CullPart {
  geo: THREE.BufferGeometry;
  node: string;
  /** Opaque parts hide what's inside them; translucent and glowing ones don't. */
  opaque: boolean;
  /** Parts that may lose hidden triangles (glowing parts are always kept). */
  cullable: boolean;
  shape: Shape;
  /** Builder space -> the part's own space. */
  inv: THREE.Matrix4;
}

/**
 * Removes triangles that lie entirely inside another opaque part on the same node.
 * Returns how many triangles were removed per part (same order as `parts`).
 */
export function cullHidden(parts: CullPart[]): number[] {
  const removed = parts.map(() => 0);
  const local = new THREE.Vector3();
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  parts.forEach((p, pi) => {
    if (!p.cullable) return;
    const occluders = parts.filter((q, qi) => qi !== pi && q.opaque && q.node === p.node && q.shape.kind !== 'other');
    if (!occluders.length) return;
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const a = g.getAttribute('position');
    const keep: number[] = [];
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let k = 0; k < 3; k++) tri[k].fromBufferAttribute(a, i + k);
      const hidden = occluders.some((q) => tri.every((v) => isInside(q.shape, local.copy(v).applyMatrix4(q.inv))));
      if (hidden) removed[pi]++;
      else for (let k = 0; k < 3; k++) keep.push(tri[k].x, tri[k].y, tri[k].z);
    }
    if (removed[pi]) {
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
      p.geo = out;
    }
  });
  return removed;
}

// ---------------------------------------------------------------------------- coplanar merge

/**
 * Replaces each flat, convex patch made of more triangles than it needs with a minimal fan
 * (k - 2 triangles for a k-gon). Returns the new geometry (non-indexed) and how many triangles it saved.
 */
export function mergeCoplanar(geo: THREE.BufferGeometry): { geo: THREE.BufferGeometry; saved: number } {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const a = g.getAttribute('position');
  const verts: THREE.Vector3[] = [];
  const ids = new Map<string, number>();
  const vid = (v: THREE.Vector3): number => {
    const r = (x: number): string => (Math.round(x * 1e5) / 1e5 + 0).toFixed(5); // -0 folded into 0
    const key = `${r(v.x)},${r(v.y)},${r(v.z)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = verts.length;
      verts.push(v.clone());
      ids.set(key, id);
    }
    return id;
  };
  const tris: Array<{ v: [number, number, number]; n: THREE.Vector3; key: string }> = [];
  const t0 = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  for (let i = 0; i + 2 < a.count; i += 3) {
    t0.fromBufferAttribute(a, i);
    t1.fromBufferAttribute(a, i + 1);
    t2.fromBufferAttribute(a, i + 2);
    const n = t1.clone().sub(t0).cross(t2.clone().sub(t0));
    if (n.lengthSq() < 1e-14) continue; // degenerate: dropped here as in the merge
    n.normalize();
    const d = n.dot(t0);
    // (Rounded, and -0 folded into 0, so "-0.000" and "0.000" don't split one plane in two.)
    const q = (v: number, k: number): string => (Math.round(v * k) / k + 0).toFixed(Math.log10(k));
    const key = `${q(n.x, 1000)},${q(n.y, 1000)},${q(n.z, 1000)},${q(d, 10000)}`;
    tris.push({ v: [vid(t0), vid(t1), vid(t2)], n, key });
  }
  const groups = new Map<string, typeof tris>();
  for (const t of tris) {
    if (!groups.has(t.key)) groups.set(t.key, []);
    groups.get(t.key)!.push(t);
  }
  const out: number[] = [];
  let saved = 0;
  const push = (i: number, j: number, k: number): void => {
    for (const id of [i, j, k]) out.push(verts[id].x, verts[id].y, verts[id].z);
  };
  for (const group of groups.values()) {
    const fan = group.length >= 3 ? convexFan(group, verts) : null;
    if (fan && fan.length < group.length) {
      saved += group.length - fan.length;
      for (const [i, j, k] of fan) push(i, j, k);
    } else for (const t of group) push(...t.v);
  }
  const res = new THREE.BufferGeometry();
  res.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return { geo: res, saved };
}

/** If the triangles form one convex polygon (a single boundary loop, no holes), a minimal fan for it. */
function convexFan(group: Array<{ v: [number, number, number]; n: THREE.Vector3 }>, verts: THREE.Vector3[]): Array<[number, number, number]> | null {
  const n = group[0].n;
  const edges = new Map<string, number>();
  const directed = new Map<number, number>();
  for (const t of group) {
    for (let k = 0; k < 3; k++) {
      const a = t.v[k];
      const b = t.v[(k + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const t of group) {
    for (let k = 0; k < 3; k++) {
      const a = t.v[k];
      const b = t.v[(k + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (edges.get(key) === 1) {
        if (directed.has(a)) return null; // not a simple loop
        directed.set(a, b);
      }
    }
  }
  // Walk the boundary loop.
  const start = directed.keys().next().value as number | undefined;
  if (start === undefined) return null;
  const loop: number[] = [start];
  let cur = directed.get(start)!;
  while (cur !== start) {
    if (loop.length > directed.size) return null;
    loop.push(cur);
    const next = directed.get(cur);
    if (next === undefined) return null;
    cur = next;
  }
  if (loop.length !== directed.size) return null; // several loops (holes)
  // (Vertices inside the patch, like a cap fan's centre, can go: the patch is flat, so the
  // boundary alone defines it.)
  // Drop collinear boundary vertices, then check convexity (all turns the same way as the normal).
  const pts = loop.filter((id, i) => {
    const p = verts[loop[(i + loop.length - 1) % loop.length]];
    const q = verts[id];
    const r = verts[loop[(i + 1) % loop.length]];
    return q.clone().sub(p).cross(r.clone().sub(q)).length() > 1e-9;
  });
  if (pts.length < 3) return null;
  for (let i = 0; i < pts.length; i++) {
    const p = verts[pts[i]];
    const q = verts[pts[(i + 1) % pts.length]];
    const r = verts[pts[(i + 2) % pts.length]];
    if (q.clone().sub(p).cross(r.clone().sub(q)).dot(n) <= 0) return null;
  }
  const fan: Array<[number, number, number]> = [];
  for (let i = 1; i + 1 < pts.length; i++) fan.push([pts[0], pts[i], pts[i + 1]]);
  return fan;
}

// ---------------------------------------------------------------------------- unwrap

export interface UnwrapInfo {
  surface: SurfaceClass;
  /** Style for the part's ordinary faces. */
  style: CellStyle;
  /** The part's bounds in model space (its faces' gradient runs across these). */
  box: THREE.Box3;
  /** Model space -> the part's own space, for normals (transpose of the linear part). */
  normalToLocal: THREE.Matrix3;
  /** Which faces are bevel edges: box chamfers or cylinder rims (by the face's own-space normal). */
  edges: 'box' | 'cylinder' | null;
  /** Long horizontal axis for 'hgrad'. */
  long: 'x' | 'z';
  /** Stable per-part seed (rust placement). */
  seed: number;
  /** Model height (grime band). */
  H: number;
}

/** The ordinary-face style for a part from its size and proportions (model space). */
export function partStyle(box: THREE.Box3, H: number, glow: boolean): { style: CellStyle; long: 'x' | 'z' } {
  const s = box.getSize(new THREE.Vector3());
  const long: 'x' | 'z' = s.x >= s.z ? 'x' : 'z';
  if (glow) return { style: 'core', long };
  const maxDim = Math.max(s.x, s.y, s.z);
  if (maxDim < 0.14 * H) return { style: 'flat', long };
  if (Math.max(s.x, s.z) > 2.2 * s.y && Math.max(s.x, s.z) > 0.2 * H) return { style: 'hgrad', long };
  if (maxDim > 0.42 * H) return { style: 'vstrong', long };
  return { style: 'vgrad', long };
}

const RUSTY = new Set<SurfaceClass>(['metal', 'armor', 'vent']);
export const GRIME_BAND = 0.1;

function rand(a: number, b: number): number {
  let h = (a * 2654435761) ^ (b * 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** The cell a triangle samples. */
export function triangleCell(info: UnwrapInfo, n: THREE.Vector3, centroid: THREE.Vector3, tri: number): { surface: SurfaceClass; style: CellStyle; edge: boolean } {
  if (info.style === 'core') return { surface: 'glow', style: 'core', edge: false };
  let edge = false;
  if (info.edges) {
    const ln = n.clone().applyMatrix3(info.normalToLocal).normalize();
    const ax = Math.max(Math.abs(ln.x), Math.abs(ln.y), Math.abs(ln.z));
    edge = info.edges === 'box' ? ax < 0.98 : Math.abs(ln.y) > 0.35 && Math.abs(ln.y) < 0.95;
  }
  if (centroid.y < GRIME_BAND * info.H) return { surface: info.surface, style: 'grime', edge };
  if (edge) return { surface: info.surface, style: RUSTY.has(info.surface) && rand(info.seed, tri) < 0.3 ? 'rust' : 'wear', edge };
  return { surface: info.surface, style: info.style, edge };
}

const fr = (v: number, lo: number, hi: number): number => (hi - lo > 1e-6 ? (v - lo) / (hi - lo) : 0.5);

/** UVs for one triangle's three vertices (model space positions, face normal). */
export function unwrapTriangle(info: UnwrapInfo, v: THREE.Vector3[], n: THREE.Vector3, cell: { surface: SurfaceClass; style: CellStyle }): Array<[number, number]> {
  const b = info.box;
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  return v.map((p) => {
    const fx = fr(p.x, b.min.x, b.max.x);
    const fy = fr(p.y, b.min.y, b.max.y);
    const fz = fr(p.z, b.min.z, b.max.z);
    let s: number;
    let t: number;
    if (cell.style === 'hgrad') {
      s = info.long === 'x' ? fx : fz;
      t = ay > ax && ay > az ? (info.long === 'x' ? fz : fx) : fy;
    } else if (ay >= ax && ay >= az) {
      // Caps: spread across the cell, kept in the top (or bottom) band so the gradient reads right.
      s = b.max.x - b.min.x >= b.max.z - b.min.z ? fx : fz;
      const across = b.max.x - b.min.x >= b.max.z - b.min.z ? fz : fx;
      t = n.y > 0 ? 0.78 + 0.22 * across : 0.22 * across;
    } else if (ax >= az) {
      s = n.x > 0 ? 1 - fz : fz;
      t = fy;
    } else {
      s = n.z > 0 ? fx : 1 - fx;
      t = fy;
    }
    return cellUV(cell.surface, cell.style, s, t);
  });
}

/**
 * Tangent (xyz, w = handedness) for a flat triangle, glTF convention: computed against the
 * flipped v (glTF UVs have v = 0 at the image top), so normal = cross(n, t) * w points toward
 * +Y of the normal map image.
 */
export function triangleTangent(p: THREE.Vector3[], uv: Array<[number, number]>, n: THREE.Vector3): [number, number, number, number] {
  const e1 = p[1].clone().sub(p[0]);
  const e2 = p[2].clone().sub(p[0]);
  const du1 = uv[1][0] - uv[0][0];
  const dv1 = -(uv[1][1] - uv[0][1]);
  const du2 = uv[2][0] - uv[0][0];
  const dv2 = -(uv[2][1] - uv[0][1]);
  const det = du1 * dv2 - du2 * dv1;
  let t: THREE.Vector3;
  let bt: THREE.Vector3;
  if (Math.abs(det) < 1e-12) {
    // UVs collapsed (e.g. a cap mapped to one line): any tangent in the face plane.
    t = Math.abs(n.y) < 0.99 ? new THREE.Vector3(0, 1, 0).cross(n) : new THREE.Vector3(1, 0, 0).cross(n);
    bt = n.clone().cross(t);
  } else {
    const r = 1 / det;
    t = e1.clone().multiplyScalar(dv2).sub(e2.clone().multiplyScalar(dv1)).multiplyScalar(r);
    bt = e2.clone().multiplyScalar(du1).sub(e1.clone().multiplyScalar(du2)).multiplyScalar(r);
  }
  // Gram-Schmidt against the face normal.
  t.sub(n.clone().multiplyScalar(n.dot(t)));
  if (t.lengthSq() < 1e-16) t = Math.abs(n.y) < 0.99 ? new THREE.Vector3(0, 1, 0).cross(n) : new THREE.Vector3(1, 0, 0).cross(n);
  t.normalize();
  const w = n.clone().cross(t).dot(bt) < 0 ? -1 : 1;
  return [t.x, t.y, t.z, w];
}
