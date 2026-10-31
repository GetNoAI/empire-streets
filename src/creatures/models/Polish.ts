import * as THREE from 'three';
import type { SurfaceClass } from './Atlas';

/**
 * Visual polish for the procedural Streetmon models (engine-free apart from three.js maths):
 *
 *  - Chamfered primitives: boxes and cylinders with a narrow bevel on every edge, so flat-shaded
 *    low-poly parts catch a rim of light along their edges instead of reading as flat cards.
 *  - Procedural vertex shading: a vertical gradient per part (darker at its base, lighter on top)
 *    and across the whole model (darker at the feet), and simulated crevice ambient occlusion:
 *    vertices inside or close to another part (where a limb joins the body, under an armour plate,
 *    behind a chest plate) are darkened.
 *  - Surface presets per type (which atlas surface class each palette colour uses; roughness and
 *    metalness live in the atlas, see Atlas.ts) and emissive presets with a pulse the game plays
 *    at run time (stored in the material's glTF extras).
 */

// ---------------------------------------------------------------------------- chamfered primitives

/** Flips any triangle that faces into a convex shape centred on the origin (outward winding). */
function outward(pos: number[]): void {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.set(pos[i], pos[i + 1], pos[i + 2]);
    b.set(pos[i + 3], pos[i + 4], pos[i + 5]);
    c.set(pos[i + 6], pos[i + 7], pos[i + 8]);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (n.dot(centroid) < 0) {
      // Swap b and c.
      for (let k = 0; k < 3; k++) {
        const t = pos[i + 3 + k];
        pos[i + 3 + k] = pos[i + 6 + k];
        pos[i + 6 + k] = t;
      }
    }
  }
}

/**
 * A box w x h x d with every edge chamfered by `c` (44 triangles: 6 faces, 12 edge strips,
 * 8 corner triangles). Centred on the origin.
 */
export function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  const cc = Math.min(c, ...half.map((v) => v * 0.9));
  // Point on face `axis` (sign of each axis from the corner) of corner s.
  const P = (axis: number, s: [number, number, number]): number[] => [0, 1, 2].map((k) => (k === axis ? s[k] * half[k] : s[k] * (half[k] - cc)));
  const pos: number[] = [];
  const tri = (p: number[], q: number[], r: number[]): void => void pos.push(...p, ...q, ...r);
  const quad = (p: number[], q: number[], r: number[], s: number[]): void => {
    tri(p, q, r);
    tri(p, r, s);
  };
  const S = (a: number, sa: number, b: number, sb: number, e: number, se: number): [number, number, number] => {
    const s: [number, number, number] = [0, 0, 0];
    s[a] = sa;
    s[b] = sb;
    s[e] = se;
    return s;
  };
  // Main faces.
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3;
    const e = (a + 2) % 3;
    for (const sa of [-1, 1]) quad(P(a, S(a, sa, b, -1, e, -1)), P(a, S(a, sa, b, 1, e, -1)), P(a, S(a, sa, b, 1, e, 1)), P(a, S(a, sa, b, -1, e, 1)));
  }
  // Edge strips: each pair of axes, each sign combination, running along the third axis.
  for (const [a, b] of [
    [0, 1],
    [1, 2],
    [2, 0],
  ]) {
    const e = 3 - a - b;
    for (const sa of [-1, 1])
      for (const sb of [-1, 1]) quad(P(a, S(a, sa, b, sb, e, -1)), P(a, S(a, sa, b, sb, e, 1)), P(b, S(a, sa, b, sb, e, 1)), P(b, S(a, sa, b, sb, e, -1)));
  }
  // Corners.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) tri(P(0, [sx, sy, sz]), P(1, [sx, sy, sz]), P(2, [sx, sy, sz]));
  outward(pos);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/**
 * An upright cylinder (or frustum, or cone) with chamfered rims: a lathe of the profile
 * centre -> chamfered bottom rim -> side -> chamfered top rim -> centre.
 */
export function chamferCylinder(rTop: number, rBot: number, h: number, c: number, segs: number): THREE.BufferGeometry {
  const hh = h / 2;
  const cc = Math.min(c, hh * 0.45, Math.max(rTop, rBot) * 0.45);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -hh)];
  if (rBot > cc * 1.2) pts.push(new THREE.Vector2(rBot - cc, -hh), new THREE.Vector2(rBot, -hh + cc));
  else pts.push(new THREE.Vector2(Math.max(rBot, 1e-4), -hh));
  if (rTop > cc * 1.2) pts.push(new THREE.Vector2(rTop, hh - cc), new THREE.Vector2(rTop - cc, hh));
  else pts.push(new THREE.Vector2(Math.max(rTop, 1e-4), hh));
  pts.push(new THREE.Vector2(0, hh));
  const lathe = new THREE.LatheGeometry(pts, segs);
  const g = lathe.toNonIndexed();
  const a = g.getAttribute('position');
  const pos = Array.from(a.array as Float32Array);
  outward(pos);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

/** Non-degenerate triangles in a geometry (what the merged mesh will actually keep). */
export function countTriangles(geo: THREE.BufferGeometry): number {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const a = g.getAttribute('position');
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i + 2 < a.count; i += 3) {
    va.fromBufferAttribute(a, i);
    vb.fromBufferAttribute(a, i + 1);
    vc.fromBufferAttribute(a, i + 2);
    if (vb.sub(va).cross(vc.sub(va)).lengthSq() >= 1e-14) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------- vertex shading

/** An oriented box standing in for a part when estimating occlusion. */
export interface Proxy {
  /** Model space -> the part's local space. */
  inv: THREE.Matrix4;
  /** The part's local bounds. */
  box: THREE.Box3;
  /** Local -> model length scale (cube root of the matrix determinant). */
  scale: number;
  /** The part this proxy belongs to (a part doesn't occlude itself). */
  id: number;
}

export const SHADE = {
  /** Per-part vertical gradient: now done by the texture atlas (gradient cells), so neutral here. */
  partBase: 1,
  partTop: 1,
  /** Whole-model gradient: factor at the feet and at the top of the head. */
  modelBase: 0.86,
  modelTop: 1.04,
  /** Crevice AO: reach (fraction of model height), strength, and the darkest it gets. */
  aoReach: 0.07,
  aoStrength: 0.42,
  aoMin: 0.55,
  /** Overhang test: points this far above a vertex (fraction of height) inside another part darken it. */
  overhang: [0.05, 0.12],
  overhangWeight: [0.45, 0.25],
} as const;

const tmpL = new THREE.Vector3();

/** Distance (model units) from a point to a proxy's box; 0 inside. */
export function proxyDistance(p: THREE.Vector3, q: Proxy): number {
  tmpL.copy(p).applyMatrix4(q.inv);
  const b = q.box;
  const dx = Math.max(b.min.x - tmpL.x, 0, tmpL.x - b.max.x);
  const dy = Math.max(b.min.y - tmpL.y, 0, tmpL.y - b.max.y);
  const dz = Math.max(b.min.z - tmpL.z, 0, tmpL.z - b.max.z);
  return Math.hypot(dx, dy, dz) * q.scale;
}

/**
 * Ambient factor for a vertex (1 = open, lower = occluded): how deep it sits in or near other
 * parts, and whether parts overhang it.
 */
export function crevice(p: THREE.Vector3, self: number, proxies: readonly Proxy[], H: number): number {
  const reach = SHADE.aoReach * H;
  let occ = 0;
  const up = new THREE.Vector3();
  for (const q of proxies) {
    if (q.id === self) continue;
    const d = proxyDistance(p, q);
    if (d < reach) occ += 1 - d / reach;
    else {
      for (let k = 0; k < SHADE.overhang.length; k++) {
        up.copy(p).setY(p.y + SHADE.overhang[k] * H);
        if (proxyDistance(up, q) === 0) {
          occ += SHADE.overhangWeight[k];
          break;
        }
      }
    }
    if (occ >= 1.6) break;
  }
  return Math.max(SHADE.aoMin, 1 - SHADE.aoStrength * Math.min(1, occ));
}

/** Gradient factor for a vertex at height y in a part spanning [y0, y1], in a model H tall. */
export function gradient(y: number, y0: number, y1: number, H: number): number {
  const tp = y1 - y0 > 1e-6 ? (y - y0) / (y1 - y0) : 0.5;
  const tm = Math.min(1, Math.max(0, y / Math.max(H, 1e-6)));
  return (SHADE.partBase + (SHADE.partTop - SHADE.partBase) * tp) * (SHADE.modelBase + (SHADE.modelTop - SHADE.modelBase) * tm);
}

// ---------------------------------------------------------------------------- surfaces

/** Palette roles a part's colour comes from. */
export type Role = 'primary' | 'secondary' | 'accent' | 'dark' | 'white' | 'eye';

export interface SurfacePreset {
  /** Edge chamfer as a fraction of a part's smallest dimension. */
  bevel: number;
  /** Atlas surface class (see Atlas.ts SURFACE_PBR for roughness/metalness) per palette role. */
  surfaces: Record<Role, SurfaceClass>;
}

/**
 * Per type: which atlas surface each palette colour becomes. Gun: machined metal and armour;
 * Concrete: matte stone with painted-steel accents; Grind: armour plates and metal; Smoke: cloth;
 * Bass: glossy vinyl with rubber surrounds and vent grills; Wire: metal and vents; Sludge: wet
 * gloss over rubber. The glowing parts are always 'glow'.
 */
export const SURFACES: Record<string, SurfacePreset> = {
  gun: { bevel: 0.08, surfaces: { primary: 'metal', secondary: 'armor', accent: 'gloss', dark: 'rubber', white: 'gloss', eye: 'glow' } },
  concrete: { bevel: 0.14, surfaces: { primary: 'concrete', secondary: 'concrete', accent: 'armor', dark: 'rubber', white: 'concrete', eye: 'glow' } },
  grind: { bevel: 0.1, surfaces: { primary: 'armor', secondary: 'metal', accent: 'gloss', dark: 'rubber', white: 'gloss', eye: 'glow' } },
  smoke: { bevel: 0.16, surfaces: { primary: 'fabric', secondary: 'fabric', accent: 'metal', dark: 'rubber', white: 'fabric', eye: 'glow' } },
  bass: { bevel: 0.16, surfaces: { primary: 'gloss', secondary: 'rubber', accent: 'metal', dark: 'vent', white: 'gloss', eye: 'glow' } },
  wire: { bevel: 0.1, surfaces: { primary: 'metal', secondary: 'vent', accent: 'gloss', dark: 'rubber', white: 'gloss', eye: 'glow' } },
  sludge: { bevel: 0.15, surfaces: { primary: 'gloss', secondary: 'rubber', accent: 'metal', dark: 'rubber', white: 'gloss', eye: 'glow' } },
};

/** Surfaces for a species: the primary type's classes; the bevel blends 70/30 for dual types. */
export function surfaceFor(types: readonly string[]): SurfacePreset {
  const a = SURFACES[types[0]] ?? SURFACES.concrete;
  const b = types[1] ? SURFACES[types[1]] : undefined;
  return { bevel: b ? +(a.bevel * 0.7 + b.bevel * 0.3).toFixed(3) : a.bevel, surfaces: { ...a.surfaces } };
}

/**
 * Emissive accents, strength 3.0 or more so the bloom pass picks them up: eyes burn brightest
 * and steadiest; cores and power lines pulse (never dipping below 3.0).
 */
export const GLOW = {
  eye: { intensity: 3.6, pulseHz: 0.35, amount: 0.08 },
  accent: { intensity: 3.4, pulseHz: 0.9, amount: 0.11 },
} as const;
