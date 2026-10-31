/**
 * Tileable surface detail for every material in the game (engine-free, deterministic).
 *
 * Each kind is one seamless RGBA tile, packed for the triplanar material patch (Surfaces.ts):
 *   R  tone      0.5 = unchanged; lighter/darker variation (stains, grain, per-brick colour)
 *   G  roughness 0.5 = unchanged; scales the material's roughness (scuffs, polish, damp)
 *   B  cavity    1 = open; lower in grooves, mortar, pores and pits (darkens albedo)
 *   A  height    0..1; turned into surface normals with screen-space derivatives (bump)
 *
 * All noise is periodic so tiles repeat without seams.
 */

export const SURFACE_KINDS = [
  'concrete',
  'asphalt',
  'brick',
  'stone',
  'gravel',
  'paintedMetal',
  'bareMetal',
  'rust',
  'chrome',
  'carPaint',
  'rubber',
  'plastic',
  'fabric',
  'leather',
  'skin',
  'hair',
  'wood',
  'bark',
  'foliage',
  'paper',
] as const;
export type SurfaceKind = (typeof SURFACE_KINDS)[number];

/** How a kind is applied: tile size in metres and strengths (tone, roughness, cavity, bump). */
export interface SurfaceTuning {
  tile: number;
  tone: number;
  rough: number;
  cavity: number;
  bump: number;
}

export const SURFACE_TUNING: Record<SurfaceKind, SurfaceTuning> = {
  concrete: { tile: 1.6, tone: 0.55, rough: 0.5, cavity: 0.6, bump: 1.2 },
  asphalt: { tile: 1.2, tone: 0.5, rough: 0.4, cavity: 0.6, bump: 1.4 },
  brick: { tile: 0.9, tone: 0.6, rough: 0.4, cavity: 0.8, bump: 2.2 },
  stone: { tile: 1.4, tone: 0.55, rough: 0.4, cavity: 0.6, bump: 1.4 },
  gravel: { tile: 0.7, tone: 0.6, rough: 0.3, cavity: 0.8, bump: 2.4 },
  paintedMetal: { tile: 0.8, tone: 0.45, rough: 0.7, cavity: 0.5, bump: 0.6 },
  bareMetal: { tile: 0.5, tone: 0.3, rough: 0.8, cavity: 0.3, bump: 0.35 },
  rust: { tile: 0.8, tone: 0.7, rough: 0.5, cavity: 0.7, bump: 1.6 },
  chrome: { tile: 0.6, tone: 0.1, rough: 0.6, cavity: 0.1, bump: 0.08 },
  carPaint: { tile: 0.35, tone: 0.06, rough: 0.5, cavity: 0.05, bump: 0.12 },
  rubber: { tile: 0.25, tone: 0.3, rough: 0.3, cavity: 0.4, bump: 0.8 },
  plastic: { tile: 0.3, tone: 0.18, rough: 0.5, cavity: 0.2, bump: 0.25 },
  fabric: { tile: 0.12, tone: 0.45, rough: 0.2, cavity: 0.6, bump: 1.4 },
  leather: { tile: 0.2, tone: 0.35, rough: 0.6, cavity: 0.5, bump: 0.9 },
  skin: { tile: 0.12, tone: 0.18, rough: 0.6, cavity: 0.25, bump: 0.35 },
  hair: { tile: 0.08, tone: 0.5, rough: 0.4, cavity: 0.5, bump: 1.0 },
  wood: { tile: 0.9, tone: 0.6, rough: 0.4, cavity: 0.5, bump: 0.8 },
  bark: { tile: 0.6, tone: 0.7, rough: 0.2, cavity: 0.8, bump: 2.6 },
  foliage: { tile: 0.8, tone: 0.75, rough: 0.3, cavity: 0.7, bump: 1.6 },
  paper: { tile: 0.15, tone: 0.25, rough: 0.3, cavity: 0.2, bump: 0.4 },
};

export const TILE_PX = 256;

// ---------------------------------------------------------------------------- periodic noise

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Value noise on a grid of `px` x `py` cells that wraps at the tile edge. u, v in [0, 1). */
function pnoise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(mod(ix, px), mod(iy, py), seed);
  const b = hash(mod(ix + 1, px), mod(iy, py), seed);
  const c = hash(mod(ix, px), mod(iy + 1, py), seed);
  const d = hash(mod(ix + 1, px), mod(iy + 1, py), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Periodic fBm: base frequency f (cells per tile), doubling each octave. */
function pfbm(u: number, v: number, f: number, oct: number, seed: number, fy = f): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * pnoise(u, v, f << i, fy << i, seed + i * 31);
    norm += amp;
    amp *= 0.5;
  }
  return s / norm;
}

/** Periodic Worley: distance to the nearest and second-nearest feature point, and its cell id. */
function pworley(u: number, v: number, n: number, seed: number): { d1: number; d2: number; id: number } {
  const x = u * n;
  const y = v * n;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = mod(ix + i, n);
      const cy = mod(iy + j, n);
      const fx = ix + i + hash(cx, cy, seed);
      const fy = iy + j + hash(cx, cy, seed + 7);
      const d = Math.hypot(x - fx, y - fy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(cx, cy, seed + 13);
      } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

interface Px {
  tone: number;
  rough: number;
  cavity: number;
  h: number;
}

// ---------------------------------------------------------------------------- kinds

/** Running-bond masonry: `cols` units across, `rows` courses, mortar joint `m` (in course heights). */
function masonry(u: number, v: number, cols: number, rows: number, m: number, seed: number): { mortar: number; id: number } {
  const row = Math.floor(v * rows);
  const cu = u * cols + (row % 2 ? 0.5 : 0);
  const col = Math.floor(cu);
  const fu = cu - col;
  const fv = v * rows - row;
  // Distance to the nearest joint, in course heights (a unit is rows/cols courses wide).
  const d = Math.min(Math.min(fv, 1 - fv), Math.min(fu, 1 - fu) * (rows / cols));
  const mortar = 1 - smooth(m * 0.35, m * 0.5, d);
  return { mortar, id: hash(mod(col, cols), row, seed) };
}

const GEN: Record<SurfaceKind, (u: number, v: number) => Px> = {
  concrete: (u, v) => {
    const n = pfbm(u, v, 4, 5, 11);
    const fine = pfbm(u, v, 32, 2, 12);
    const pit = hash(Math.floor(u * 160), Math.floor(v * 160), 13) > 0.985 ? 1 : 0;
    const stain = smooth(0.55, 0.8, pfbm(u, v, 2, 3, 14));
    return { tone: 0.5 + (n - 0.5) * 0.5 - stain * 0.12 - pit * 0.15, rough: 0.5 + (fine - 0.5) * 0.4 - stain * 0.1, cavity: 1 - pit * 0.6, h: 0.5 + (fine - 0.5) * 0.4 - pit * 0.5 };
  },
  asphalt: (u, v) => {
    const w = pworley(u, v, 48, 21);
    const agg = smooth(0.35, 0.05, w.d1);
    const n = pfbm(u, v, 6, 4, 22);
    const tar = smooth(0.6, 0.75, pfbm(u, v, 3, 3, 23));
    return { tone: 0.5 + (w.id - 0.5) * 0.35 * agg + (n - 0.5) * 0.3 - tar * 0.15, rough: 0.5 + (agg - 0.5) * 0.3 - tar * 0.25, cavity: 1 - (1 - agg) * 0.35, h: agg * 0.7 + n * 0.3 };
  },
  brick: (u, v) => {
    const b = masonry(u, v, 4, 13, 0.18, 31);
    const n = pfbm(u, v, 16, 3, 32);
    const chip = smooth(0.82, 0.9, pfbm(u, v, 24, 2, 33));
    const tone = b.mortar > 0.5 ? 0.62 + (n - 0.5) * 0.1 : 0.5 + (b.id - 0.5) * 0.35 + (n - 0.5) * 0.2 - chip * 0.08;
    return { tone, rough: 0.5 + b.mortar * 0.2 + (n - 0.5) * 0.2, cavity: 1 - b.mortar * 0.55 - chip * 0.2, h: 0.75 - b.mortar * 0.6 + (n - 0.5) * 0.15 - chip * 0.2 };
  },
  stone: (u, v) => {
    const n = pfbm(u, v, 3, 5, 41);
    const sp = hash(Math.floor(u * 200), Math.floor(v * 200), 42);
    const vein = smooth(0.02, 0, Math.abs(pfbm(u, v, 2, 4, 43) - 0.5)) * 0.6;
    return { tone: 0.5 + (n - 0.5) * 0.4 + (sp - 0.5) * 0.12 - vein * 0.15, rough: 0.5 + (sp - 0.5) * 0.2, cavity: 1 - vein * 0.4, h: 0.5 + (n - 0.5) * 0.5 - vein * 0.3 };
  },
  gravel: (u, v) => {
    const w = pworley(u, v, 22, 51);
    const dome = clamp01(1 - w.d1 / Math.max(0.2, (w.d1 + w.d2) * 0.5));
    const gap = smooth(0.12, 0.0, w.d2 - w.d1);
    return { tone: 0.5 + (w.id - 0.5) * 0.6 - gap * 0.2, rough: 0.5 + (w.id - 0.5) * 0.3, cavity: 1 - gap * 0.7, h: Math.sqrt(dome) * 0.9 - gap * 0.2 };
  },
  paintedMetal: (u, v) => {
    const peel = pfbm(u, v, 48, 2, 61);
    const chips = smooth(0.74, 0.78, pfbm(u, v, 6, 4, 62));
    const grime = smooth(0.4, 0.8, pfbm(u, v, 3, 3, 63));
    const scratch = smooth(0.006, 0, Math.abs(pfbm(u, v, 8, 1, 64, 1) - 0.5)) * 0.8;
    return {
      tone: 0.5 - chips * 0.18 + scratch * 0.15 - grime * 0.1,
      rough: 0.5 + chips * 0.35 + grime * 0.15 - scratch * 0.2,
      cavity: 1 - chips * 0.3,
      h: 0.6 + (peel - 0.5) * 0.12 - chips * 0.25 - scratch * 0.1,
    };
  },
  bareMetal: (u, v) => {
    const brush = pfbm(u, v, 2, 4, 71, 96); // streaks along u
    const smudge = pfbm(u, v, 4, 3, 72);
    return { tone: 0.5 + (brush - 0.5) * 0.25 - smooth(0.6, 0.85, smudge) * 0.1, rough: 0.5 + (brush - 0.5) * 0.5 + smooth(0.6, 0.85, smudge) * 0.25, cavity: 1, h: 0.5 + (brush - 0.5) * 0.3 };
  },
  rust: (u, v) => {
    const n = pfbm(u, v, 5, 5, 81);
    const flake = smooth(0.45, 0.6, n);
    const pits = pworley(u, v, 40, 82);
    const pit = smooth(0.25, 0.05, pits.d1) * (pits.id > 0.6 ? 1 : 0);
    return { tone: 0.5 + (n - 0.5) * 0.5 - flake * 0.12 - pit * 0.15, rough: 0.5 + flake * 0.25, cavity: 1 - pit * 0.5 - flake * 0.15, h: 0.4 + flake * 0.35 - pit * 0.35 + (pfbm(u, v, 32, 2, 83) - 0.5) * 0.2 };
  },
  chrome: (u, v) => {
    const smudge = smooth(0.55, 0.8, pfbm(u, v, 3, 4, 91));
    return { tone: 0.5 - smudge * 0.05, rough: 0.5 + smudge * 0.6, cavity: 1, h: 0.5 + (pfbm(u, v, 64, 1, 92) - 0.5) * 0.05 };
  },
  carPaint: (u, v) => {
    const peel = pfbm(u, v, 40, 3, 101);
    const swirl = smooth(0.6, 0.9, pfbm(u, v, 4, 3, 102));
    return { tone: 0.5 + (peel - 0.5) * 0.04, rough: 0.5 + swirl * 0.25, cavity: 1, h: 0.5 + (peel - 0.5) * 0.5 };
  },
  rubber: (u, v) => {
    const n = pfbm(u, v, 64, 2, 111);
    const wear = smooth(0.55, 0.8, pfbm(u, v, 4, 3, 112));
    return { tone: 0.5 + (n - 0.5) * 0.15 + wear * 0.12, rough: 0.5 + (n - 0.5) * 0.2 - wear * 0.1, cavity: 1, h: 0.5 + (n - 0.5) * 0.6 };
  },
  plastic: (u, v) => {
    const n = pfbm(u, v, 48, 2, 121);
    const scuff = smooth(0.62, 0.85, pfbm(u, v, 5, 3, 122));
    return { tone: 0.5 + (n - 0.5) * 0.08 + scuff * 0.08, rough: 0.5 + scuff * 0.35, cavity: 1, h: 0.5 + (n - 0.5) * 0.3 };
  },
  fabric: (u, v) => {
    const n = 32;
    const cx = Math.floor(u * n);
    const cy = Math.floor(v * n);
    const fx = u * n - cx;
    const fy = v * n - cy;
    const over = (cx + cy) % 2 === 0;
    const thread = over ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
    const fiber = pfbm(u, v, 128, 1, 131);
    const fade = pfbm(u, v, 3, 3, 132);
    return { tone: 0.5 + (thread - 0.5) * 0.25 + (fiber - 0.5) * 0.15 + (fade - 0.5) * 0.2, rough: 0.5 + (fiber - 0.5) * 0.2, cavity: 0.65 + 0.35 * thread, h: 0.3 + thread * 0.6 + (fiber - 0.5) * 0.1 };
  },
  leather: (u, v) => {
    const w = pworley(u, v, 30, 141);
    const crease = smooth(0.08, 0.0, w.d2 - w.d1);
    const n = pfbm(u, v, 6, 3, 142);
    return { tone: 0.5 + (n - 0.5) * 0.3 - crease * 0.15, rough: 0.5 + (n - 0.5) * 0.3 + crease * 0.2, cavity: 1 - crease * 0.5, h: 0.6 - crease * 0.5 + (n - 0.5) * 0.1 };
  },
  skin: (u, v) => {
    const pore = pworley(u, v, 60, 151);
    const p = smooth(0.18, 0.0, pore.d1) * (pore.id > 0.45 ? 1 : 0);
    const mottle = pfbm(u, v, 4, 4, 152);
    return { tone: 0.5 + (mottle - 0.5) * 0.25 - p * 0.05, rough: 0.5 + (mottle - 0.5) * 0.3 + p * 0.2, cavity: 1 - p * 0.3, h: 0.6 - p * 0.4 + (pfbm(u, v, 24, 2, 153) - 0.5) * 0.15 };
  },
  hair: (u, v) => {
    const strands = pfbm(u, v, 1, 3, 161, 128); // along v
    const clump = pfbm(u, v, 2, 3, 162, 12);
    return { tone: 0.5 + (strands - 0.5) * 0.6 + (clump - 0.5) * 0.25, rough: 0.5 + (strands - 0.5) * 0.4, cavity: 0.7 + 0.3 * strands, h: strands * 0.8 + clump * 0.2 };
  },
  wood: (u, v) => {
    const warp = pfbm(u, v, 2, 3, 171, 8);
    const rings = 0.5 + 0.5 * Math.sin((u * 14 + warp * 3) * Math.PI * 2);
    const fibre = pfbm(u, v, 1, 3, 172, 96);
    const knot = smooth(0.12, 0.0, pworley(u, v, 3, 173).d1);
    return { tone: 0.5 + (rings - 0.5) * 0.3 + (fibre - 0.5) * 0.2 - knot * 0.25, rough: 0.5 + (fibre - 0.5) * 0.3, cavity: 0.8 + 0.2 * fibre - knot * 0.2, h: 0.5 + (rings - 0.5) * 0.15 + (fibre - 0.5) * 0.4 - knot * 0.2 };
  },
  bark: (u, v) => {
    const r = pfbm(u, v, 6, 4, 181, 2); // long vertical plates
    const ridge = 1 - Math.abs(r - 0.5) * 2;
    const crack = smooth(0.25, 0.05, ridge);
    const moss = smooth(0.62, 0.78, pfbm(u, v, 3, 3, 182));
    return { tone: 0.5 + (ridge - 0.5) * 0.4 - crack * 0.2 + moss * 0.05, rough: 0.5 + crack * 0.2, cavity: 1 - crack * 0.6, h: ridge * 0.8 + (pfbm(u, v, 24, 2, 183) - 0.5) * 0.2 };
  },
  foliage: (u, v) => {
    const w = pworley(u, v, 14, 191);
    const leaf = clamp01(1 - w.d1 * 1.4);
    const gap = smooth(0.15, 0.0, w.d2 - w.d1);
    return { tone: 0.5 + (w.id - 0.5) * 0.5 + (leaf - 0.5) * 0.25 - gap * 0.25, rough: 0.5 + (w.id - 0.5) * 0.3, cavity: 1 - gap * 0.6, h: leaf * 0.8 - gap * 0.3 };
  },
  paper: (u, v) => {
    const fibre = pfbm(u, v, 96, 2, 201);
    const crease = smooth(0.01, 0, Math.abs(pfbm(u, v, 3, 2, 202) - 0.5)) * 0.6;
    return { tone: 0.5 + (fibre - 0.5) * 0.12 - crease * 0.1, rough: 0.5 + (fibre - 0.5) * 0.15, cavity: 1 - crease * 0.3, h: 0.5 + (fibre - 0.5) * 0.25 - crease * 0.3 };
  },
};

const cache = new Map<SurfaceKind, Uint8Array>();

/** The packed RGBA tile for a kind (TILE_PX square, generated once). */
export function surfaceTile(kind: SurfaceKind): Uint8Array {
  let out = cache.get(kind);
  if (out) return out;
  const N = TILE_PX;
  out = new Uint8Array(N * N * 4);
  const gen = GEN[kind];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = gen((x + 0.5) / N, (y + 0.5) / N);
      const i = (y * N + x) * 4;
      out[i] = Math.round(clamp01(p.tone) * 255);
      out[i + 1] = Math.round(clamp01(p.rough) * 255);
      out[i + 2] = Math.round(clamp01(p.cavity) * 255);
      out[i + 3] = Math.round(clamp01(p.h) * 255);
    }
  }
  cache.set(kind, out);
  return out;
}
