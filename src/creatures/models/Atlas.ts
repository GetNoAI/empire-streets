/**
 * The shared Streetmon texture atlas (engine-free, deterministic): three 512 x 512 RGBA images
 * every creature model samples with the same UVs.
 *
 *   color  (sRGB)   a tone multiplier on top of the vertex colours (palette x baked crevice AO):
 *                   bottom-to-top / along-the-length gradients, edge wear, rust, grime, glow cores
 *   normal (linear) tangent-space micro detail (OpenGL / glTF convention, +Y up in the image):
 *                   panel lines and rivets, armour seams, vent grills, fabric weave, concrete pits
 *   orm    (linear) channel-packed glTF occlusion (R), roughness (G), metalness (B)
 *
 * Layout: an 8 x 8 grid of 64 px cells. The column is the SURFACE class (metal, armour, ...),
 * the row the STYLE (how the colour varies over the part). A part maps each of its faces onto a
 * whole cell (with a 4 px inset so mipmaps don't bleed between neighbours), so a gradient cell
 * runs from the part's bottom to its top, and the detail scales with the part.
 *
 * Because the colour atlas multiplies the vertex colours instead of replacing them, one atlas
 * serves every species, every palette and every shiny variant.
 */

export const ATLAS = {
  size: 512,
  cells: 8,
  cell: 64,
  /** Pixels kept clear at each cell edge (edge values are extended into it). */
  inset: 4,
  files: { color: 'atlas/streetmon_color.png', normal: 'atlas/streetmon_normal.png', orm: 'atlas/streetmon_orm.png' },
} as const;

/** Surface classes (atlas columns). */
export const SURFACES = ['metal', 'armor', 'gloss', 'vent', 'fabric', 'concrete', 'rubber', 'glow'] as const;
export type SurfaceClass = (typeof SURFACES)[number];

/** Colour styles (atlas rows). */
export const STYLES = ['vgrad', 'vstrong', 'hgrad', 'flat', 'wear', 'rust', 'grime', 'core'] as const;
export type CellStyle = (typeof STYLES)[number];

/**
 * Roughness / metalness per class (the ORM atlas holds these; materials use factor 1).
 * High-gloss surfaces (metals, visors, glowing cores): roughness 0.15-0.30, metalness 0.8-0.9.
 * Matte surfaces (concrete, cloth, rubber): roughness 0.75-0.90, metalness 0.
 */
export const SURFACE_PBR: Record<SurfaceClass, { roughness: number; metalness: number; matte: boolean }> = {
  metal: { roughness: 0.22, metalness: 0.88, matte: false },
  armor: { roughness: 0.28, metalness: 0.82, matte: false },
  gloss: { roughness: 0.16, metalness: 0.85, matte: false },
  vent: { roughness: 0.3, metalness: 0.8, matte: false },
  fabric: { roughness: 0.88, metalness: 0, matte: true },
  concrete: { roughness: 0.9, metalness: 0, matte: true },
  rubber: { roughness: 0.78, metalness: 0, matte: true },
  glow: { roughness: 0.2, metalness: 0.8, matte: false },
};

/** Normal-map strength (height units -> slope). */
const NORMAL_STRENGTH = 2.2;

// ---------------------------------------------------------------------------- UV lookup

/**
 * UV inside a cell. `s` runs left to right, `t` from the bottom of the part (0) to its top (1);
 * returned in glTF convention (v = 0 at the top of the image).
 */
export function cellUV(surface: SurfaceClass, style: CellStyle, s: number, t: number): [number, number] {
  const col = SURFACES.indexOf(surface);
  const row = STYLES.indexOf(style);
  const inner = ATLAS.cell - 2 * ATLAS.inset;
  const cs = Math.min(1, Math.max(0, s));
  const ct = Math.min(1, Math.max(0, t));
  const px = col * ATLAS.cell + ATLAS.inset + cs * inner;
  const py = row * ATLAS.cell + ATLAS.inset + (1 - ct) * inner;
  return [px / ATLAS.size, py / ATLAS.size];
}

/** Which cell a UV falls in (for tests and tooling). */
export function cellAt(u: number, v: number): { surface: SurfaceClass; style: CellStyle } {
  const col = Math.min(ATLAS.cells - 1, Math.floor(u * ATLAS.cells));
  const row = Math.min(ATLAS.cells - 1, Math.floor(v * ATLAS.cells));
  return { surface: SURFACES[col], style: STYLES[row] };
}

// ---------------------------------------------------------------------------- noise

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number, oct = 3): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise(x * f, y * f, seed + i * 17);
    amp *= 0.5;
    f *= 2;
  }
  return v / (1 - 0.5 ** oct);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** A groove of half-width w at distance d (1 at the centre, 0 outside). */
const groove = (d: number, w: number): number => 1 - smooth(0, w, Math.abs(d));
/** A round bump of radius r at distance d. */
const bump = (d: number, r: number): number => (d < r ? Math.sqrt(1 - (d / r) ** 2) : 0);

// ---------------------------------------------------------------------------- cell content

interface Texel {
  /** Linear tone multiplier (RGB). */
  tone: [number, number, number];
  /** Height for the normal map (arbitrary units, ~0..1). */
  height: number;
  ao: number;
  roughness: number;
  metalness: number;
}

/** Surface detail height and how much of it is a crevice (for AO), by class. s, t in 0..1; px = pixel coords inside the atlas. */
function detail(surface: SurfaceClass, s: number, t: number, px: number, py: number): { h: number; crevice: number } {
  switch (surface) {
    case 'metal': {
      // Panel lines: a frame and a centre seam; rivets in the corners and along the seam.
      const frame = Math.max(groove(s - 0.07, 0.02), groove(s - 0.93, 0.02), groove(t - 0.07, 0.02), groove(t - 0.93, 0.02));
      const seam = groove(s - 0.5, 0.018);
      let rivet = 0;
      for (const [rx, ry] of [
        [0.15, 0.15],
        [0.85, 0.15],
        [0.15, 0.85],
        [0.85, 0.85],
        [0.5, 0.3],
        [0.5, 0.7],
      ])
        rivet = Math.max(rivet, bump(Math.hypot(s - rx, t - ry), 0.045));
      const brushed = (vnoise(px * 0.15, py * 2.2, 3) - 0.5) * 0.04;
      const g = Math.max(frame, seam);
      return { h: 0.5 - 0.5 * g + 0.45 * rivet + brushed, crevice: g };
    }
    case 'armor': {
      // Plating seams across the plate, a raised lip at its border, bolts at the seam ends.
      const seams = Math.max(groove(t - 0.34, 0.022), groove(t - 0.67, 0.022));
      const edge = Math.min(s, 1 - s, t, 1 - t);
      const lip = smooth(0.0, 0.08, edge);
      let bolt = 0;
      for (const ty of [0.34, 0.67]) for (const sx of [0.1, 0.9]) bolt = Math.max(bolt, bump(Math.hypot(s - sx, t - ty), 0.05));
      return { h: 0.3 + 0.35 * lip - 0.4 * seams + 0.35 * bolt, crevice: seams };
    }
    case 'vent': {
      // Grill: angled louvres in a frame.
      const inside = s > 0.12 && s < 0.88 && t > 0.14 && t < 0.86;
      const frame = Math.max(groove(s - 0.12, 0.02), groove(s - 0.88, 0.02), groove(t - 0.14, 0.02), groove(t - 0.86, 0.02));
      if (!inside) return { h: 0.6 - 0.5 * frame, crevice: frame };
      const k = ((t - 0.14) / 0.72) * 7;
      const f = k - Math.floor(k);
      const louvre = f < 0.75 ? f / 0.75 : (1 - f) / 0.25; // sawtooth
      return { h: 0.15 + 0.5 * louvre, crevice: f > 0.75 ? 0.9 : 0.25 };
    }
    case 'fabric': {
      // Basket weave with stitched seams along the border.
      const n = 12;
      const cx = Math.floor(s * n);
      const cy = Math.floor(t * n);
      const fx = s * n - cx;
      const fy = t * n - cy;
      const over = (cx + cy) % 2 === 0;
      const thread = over ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
      const edge = Math.min(s, 1 - s, t, 1 - t);
      const stitch = edge < 0.07 && edge > 0.045 ? 0.5 + 0.5 * Math.sin(((s + t) * 60) % (2 * Math.PI)) : 0;
      return { h: 0.35 + 0.3 * thread - 0.2 * stitch, crevice: (1 - thread) * 0.6 };
    }
    case 'concrete': {
      const n = fbm(px * 0.12, py * 0.12, 11, 4);
      const pit = hash(Math.floor(px / 3), Math.floor(py / 3), 29) > 0.965 ? 1 : 0;
      return { h: 0.4 + 0.35 * n - 0.4 * pit, crevice: pit * 0.8 + (1 - n) * 0.2 };
    }
    case 'rubber': {
      const n = fbm(px * 0.08, py * 0.08, 41, 2);
      return { h: 0.5 + 0.08 * n, crevice: 0 };
    }
    case 'glow': {
      // Faint scan lines.
      return { h: 0.5 + 0.03 * Math.sin(py * 1.6), crevice: 0 };
    }
    default:
      return { h: 0.5, crevice: 0 };
  }
}

/** Tone multiplier for a class, independent of style (fine variation baked into the material). */
function classTone(surface: SurfaceClass, px: number, py: number, crevice: number): number {
  const darkGroove = 1 - 0.25 * crevice;
  switch (surface) {
    case 'metal':
      return darkGroove * (0.97 + 0.03 * vnoise(px * 0.1, py * 1.5, 7));
    case 'concrete':
      return darkGroove * (0.9 + 0.1 * fbm(px * 0.2, py * 0.2, 13, 3));
    case 'fabric':
      return darkGroove * (0.95 + 0.05 * vnoise(px * 0.5, py * 0.5, 19));
    case 'vent':
      return 1 - 0.45 * crevice;
    default:
      return darkGroove;
  }
}

function texel(surface: SurfaceClass, style: CellStyle, s: number, t: number, px: number, py: number): Texel {
  const pbr = SURFACE_PBR[surface];
  const d = detail(surface, s, t, px, py);
  let h = d.h;
  let tone: [number, number, number];
  let rough = pbr.roughness;
  let metal = pbr.metalness;
  // Ambient contact ramp: each part a little darker at its base.
  let ao = lerp(0.8, 1, smooth(0, 0.6, t)) * (1 - 0.35 * d.crevice);
  const ct = classTone(surface, px, py, d.crevice);
  switch (style) {
    case 'vgrad': {
      const g = lerp(0.74, 1, smooth(0, 1, t));
      tone = [g, g, g];
      break;
    }
    case 'vstrong': {
      const g = lerp(0.58, 1, t);
      tone = [g, g, g];
      break;
    }
    case 'hgrad': {
      const g = lerp(0.76, 1, s);
      tone = [g, g, g];
      break;
    }
    case 'flat':
      tone = [0.94, 0.94, 0.94];
      break;
    case 'wear': {
      // Exposed corners: full brightness (lighter than the surrounding gradient), worn smooth,
      // with fine scratches.
      const scratch = groove((s * 0.8 + t * 0.35 + vnoise(px * 0.05, py * 0.05, 5) * 0.2) * 9 % 1 - 0.5, 0.04) * (hash(Math.floor(s * 9 + t * 4), 3, 61) > 0.5 ? 1 : 0);
      const g = 1 - 0.12 * scratch;
      tone = [g, g, g * 1.0];
      h -= 0.15 * scratch;
      rough = pbr.matte ? Math.min(0.9, rough) : Math.max(0.15, rough - 0.06);
      metal = pbr.matte ? metal : Math.min(0.9, metal + 0.04);
      ao = Math.min(1, ao + 0.1);
      break;
    }
    case 'rust': {
      // Rust blooms on exposed corners: orange-brown patches, pitted and rough.
      const n = fbm(px * 0.09, py * 0.09, 23, 4);
      const patch = smooth(0.38, 0.62, n);
      tone = [lerp(0.85, 0.92, patch), lerp(0.85, 0.5, patch), lerp(0.85, 0.3, patch)];
      h += 0.25 * patch * (fbm(px * 0.5, py * 0.5, 31, 2) - 0.5);
      rough = lerp(rough, 0.85, patch);
      metal = lerp(metal, 0.15, patch);
      break;
    }
    case 'grime': {
      // Lower areas: dirt and splash marks, darker toward the ground.
      const n = fbm(px * 0.07, py * 0.07, 37, 4);
      const dirt = lerp(0.45, 0.75, n) * lerp(0.82, 1, t);
      tone = [dirt * 1.04, dirt, dirt * 0.9];
      h += 0.1 * (n - 0.5);
      rough = Math.min(0.9, rough + 0.2);
      metal *= 0.5;
      ao *= lerp(0.7, 0.95, t);
      break;
    }
    case 'core': {
      // Glow parts: bright centre fading to the rim.
      const r = Math.hypot(s - 0.5, t - 0.5) / 0.7071;
      const g = lerp(1, 0.72, r * r);
      tone = [g, g, g];
      ao = 1;
      break;
    }
  }
  return { tone: [clamp01(tone[0] * ct), clamp01(tone[1] * ct), clamp01(tone[2] * ct)], height: h, ao: clamp01(ao), roughness: clamp01(rough), metalness: clamp01(metal) };
}

// ---------------------------------------------------------------------------- images

export interface AtlasImages {
  size: number;
  /** RGBA, sRGB-encoded tone multipliers. */
  color: Uint8Array;
  /** RGBA, tangent-space normals. */
  normal: Uint8Array;
  /** RGBA: R occlusion, G roughness, B metalness (linear). */
  orm: Uint8Array;
}

const toSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const byte = (v: number): number => Math.round(clamp01(v) * 255);

let cached: AtlasImages | null = null;

/** Generates (once) the three atlas images. */
export function atlasImages(): AtlasImages {
  if (cached) return cached;
  const N = ATLAS.size;
  const inner = ATLAS.cell - 2 * ATLAS.inset;
  const color = new Uint8Array(N * N * 4);
  const normal = new Uint8Array(N * N * 4);
  const orm = new Uint8Array(N * N * 4);
  const height = new Float32Array(N * N);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const col = Math.floor(px / ATLAS.cell);
      const row = Math.floor(py / ATLAS.cell);
      // Cell-local coordinates; the inset margin repeats the edge values.
      const s = clamp01((px - col * ATLAS.cell - ATLAS.inset + 0.5) / inner);
      const t = 1 - clamp01((py - row * ATLAS.cell - ATLAS.inset + 0.5) / inner);
      const tx = texel(SURFACES[col], STYLES[row], s, t, px, py);
      const i = (py * N + px) * 4;
      color[i] = byte(toSrgb(tx.tone[0]));
      color[i + 1] = byte(toSrgb(tx.tone[1]));
      color[i + 2] = byte(toSrgb(tx.tone[2]));
      color[i + 3] = 255;
      orm[i] = byte(tx.ao);
      orm[i + 1] = byte(tx.roughness);
      orm[i + 2] = byte(tx.metalness);
      orm[i + 3] = 255;
      height[py * N + px] = tx.height;
    }
  }
  // Normals from the height field (central differences inside each cell; flat in the margins).
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const cx0 = Math.floor(px / ATLAS.cell) * ATLAS.cell;
      const cy0 = Math.floor(py / ATLAS.cell) * ATLAS.cell;
      const lx = px - cx0;
      const ly = py - cy0;
      const i = (py * N + px) * 4;
      let nx = 0;
      let ny = 0;
      if (lx > ATLAS.inset && lx < ATLAS.cell - ATLAS.inset - 1 && ly > ATLAS.inset && ly < ATLAS.cell - ATLAS.inset - 1) {
        const hL = height[py * N + px - 1];
        const hR = height[py * N + px + 1];
        const hU = height[(py - 1) * N + px];
        const hD = height[(py + 1) * N + px];
        nx = -(hR - hL) * 0.5 * NORMAL_STRENGTH;
        ny = -(hU - hD) * 0.5 * NORMAL_STRENGTH; // +Y = up in the image
      }
      const len = Math.hypot(nx, ny, 1);
      normal[i] = byte((nx / len) * 0.5 + 0.5);
      normal[i + 1] = byte((ny / len) * 0.5 + 0.5);
      normal[i + 2] = byte((1 / len) * 0.5 + 0.5);
      normal[i + 3] = 255;
    }
  }
  cached = { size: N, color, normal, orm };
  return cached;
}
