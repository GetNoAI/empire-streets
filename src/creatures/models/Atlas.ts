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
 * Layout: an 8 x 8 grid of cells (64 px at the 512 base size; the shipped PNGs are 2048 px, so a
 * cell is 256 px and a part's side gets 240 px of detail across it). The column is the SURFACE class (metal, armour, ...),
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
  /** The size the PNGs in public/creatures/atlas are written at (scripts/build-creatures.ts). */
  shipSize: 2048,
  /** The phone build loads a smaller copy (CreatureModels swaps the file names). */
  phoneSize: 1024,
  phoneSuffix: '_1k',
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

/** Normal-map strength (height units -> slope), at the 512 base size; scaled with resolution. */
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

/** Ridged noise (creases and cracks: sharp dark lines). */
function ridge(x: number, y: number, seed: number, oct = 3): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * (1 - Math.abs(vnoise(x * f, y * f, seed + i * 23) * 2 - 1));
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

/**
 * Where a texel is: cell-local s, t (0..1), and noise coordinates in 512-atlas pixels (x, y:
 * fractional at higher resolutions, so features keep their size and only get sharper) plus the
 * resolution scale k (1 at 512, 4 at 2048) for the finest grain.
 */
interface At {
  s: number;
  t: number;
  x: number;
  y: number;
  k: number;
}

/** Rivet / bolt positions per class: the rust streaks start under these. */
const RIVETS: Partial<Record<SurfaceClass, Array<[number, number]>>> = {
  metal: [
    [0.15, 0.15],
    [0.85, 0.15],
    [0.15, 0.85],
    [0.85, 0.85],
    [0.5, 0.3],
    [0.5, 0.7],
  ],
  armor: [
    [0.1, 0.34],
    [0.9, 0.34],
    [0.1, 0.67],
    [0.9, 0.67],
  ],
  vent: [
    [0.12, 0.14],
    [0.88, 0.14],
    [0.12, 0.86],
    [0.88, 0.86],
  ],
};

/** Surface detail height and how much of it is a crevice (for AO), by class. */
function detail(surface: SurfaceClass, a: At): { h: number; crevice: number } {
  const { s, t, x, y, k } = a;
  switch (surface) {
    case 'metal': {
      // Panel lines: a frame and a centre seam; rivets in the corners and along the seam; a brushed
      // grain, and a couple of soft dents.
      const frame = Math.max(groove(s - 0.07, 0.02), groove(s - 0.93, 0.02), groove(t - 0.07, 0.02), groove(t - 0.93, 0.02));
      const seam = groove(s - 0.5, 0.018);
      let rivet = 0;
      for (const [rx, ry] of RIVETS.metal!) rivet = Math.max(rivet, bump(Math.hypot(s - rx, t - ry), 0.045));
      const brushed = (vnoise(x * 0.15, y * 2.2, 3) - 0.5) * 0.04 + (vnoise(x * 0.4 * k, y * 6 * k, 4) - 0.5) * 0.012;
      let dent = 0;
      for (const [dx, dy, dr] of [
        [0.3, 0.55, 0.1],
        [0.72, 0.42, 0.08],
      ])
        dent = Math.max(dent, bump(Math.hypot(s - dx, t - dy), dr));
      const g = Math.max(frame, seam);
      return { h: 0.5 - 0.5 * g + 0.45 * rivet + brushed - 0.12 * dent * dent, crevice: g };
    }
    case 'armor': {
      // Plating seams across the plate, a raised lip at its border, bolts at the seam ends, a
      // hammered surface.
      const seams = Math.max(groove(t - 0.34, 0.022), groove(t - 0.67, 0.022));
      const edge = Math.min(s, 1 - s, t, 1 - t);
      const lip = smooth(0.0, 0.08, edge);
      let bolt = 0;
      for (const [sx, ty] of RIVETS.armor!) bolt = Math.max(bolt, bump(Math.hypot(s - sx, t - ty), 0.05));
      const hammered = (fbm(x * 0.35, y * 0.35, 47, 3) - 0.5) * 0.08;
      return { h: 0.3 + 0.35 * lip - 0.4 * seams + 0.35 * bolt + hammered, crevice: seams };
    }
    case 'gloss': {
      // Smooth: the faintest ripple so reflections aren't dead flat.
      return { h: 0.5 + 0.01 * (vnoise(x * 0.3, y * 0.3, 53) - 0.5), crevice: 0 };
    }
    case 'vent': {
      // Grill: angled louvres in a frame.
      const inside = s > 0.12 && s < 0.88 && t > 0.14 && t < 0.86;
      const frame = Math.max(groove(s - 0.12, 0.02), groove(s - 0.88, 0.02), groove(t - 0.14, 0.02), groove(t - 0.86, 0.02));
      if (!inside) return { h: 0.6 - 0.5 * frame, crevice: frame };
      const kk = ((t - 0.14) / 0.72) * 7;
      const f = kk - Math.floor(kk);
      const louvre = f < 0.75 ? f / 0.75 : (1 - f) / 0.25; // sawtooth
      return { h: 0.15 + 0.5 * louvre, crevice: f > 0.75 ? 0.9 : 0.25 };
    }
    case 'fabric': {
      // Basket weave with a fibre grain in each thread and stitched seams along the border.
      const n = 12;
      const cx = Math.floor(s * n);
      const cy = Math.floor(t * n);
      const fx = s * n - cx;
      const fy = t * n - cy;
      const over = (cx + cy) % 2 === 0;
      const thread = over ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
      const fibre = over ? Math.sin(fx * Math.PI * 7) : Math.sin(fy * Math.PI * 7);
      const edge = Math.min(s, 1 - s, t, 1 - t);
      const stitch = edge < 0.07 && edge > 0.045 ? 0.5 + 0.5 * Math.sin(((s + t) * 60) % (2 * Math.PI)) : 0;
      const fuzz = (vnoise(x * 1.3 * k, y * 1.3 * k, 59) - 0.5) * 0.06;
      return { h: 0.35 + 0.3 * thread + 0.04 * fibre * thread - 0.2 * stitch + fuzz, crevice: (1 - thread) * 0.6 };
    }
    case 'concrete': {
      // Pocked and pitted: aggregate grain, air pockets, hairline cracks.
      const n = fbm(x * 0.12, y * 0.12, 11, 4);
      const grain = (fbm(x * 0.6 * k, y * 0.6 * k, 12, 2) - 0.5) * 0.12;
      // Air pockets: round, one in about three 5 px cells, each its own size.
      let pit = 0;
      const gx = Math.floor(x / 5);
      const gy = Math.floor(y / 5);
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const cx = gx + i;
          const cy = gy + j;
          if (hash(cx, cy, 29) > 0.24) continue;
          const px0 = (cx + 0.2 + 0.6 * hash(cx, cy, 33)) * 5;
          const py0 = (cy + 0.2 + 0.6 * hash(cx, cy, 34)) * 5;
          pit = Math.max(pit, bump(Math.hypot(x - px0, y - py0), 0.5 + 1.3 * hash(cx, cy, 35)));
        }
      const pore = smooth(0.8, 0.92, vnoise(x * 1.1 * k, y * 1.1 * k, 30));
      const crack = smooth(0.84, 0.95, ridge(x * 0.05, y * 0.05, 31, 3)) * smooth(0.3, 0.55, fbm(x * 0.03, y * 0.03, 32, 2));
      return { h: 0.4 + 0.35 * n + grain - 0.45 * pit - 0.2 * pore - 0.35 * crack, crevice: pit * 0.9 + pore * 0.5 + crack * 0.9 + (1 - n) * 0.2 };
    }
    case 'rubber': {
      const n = fbm(x * 0.08, y * 0.08, 41, 2);
      const grain = (vnoise(x * 0.8 * k, y * 0.8 * k, 42) - 0.5) * 0.04;
      return { h: 0.5 + 0.08 * n + grain, crevice: 0 };
    }
    case 'glow': {
      // Faint scan lines.
      return { h: 0.5 + 0.03 * Math.sin(y * 1.6), crevice: 0 };
    }
    default:
      return { h: 0.5, crevice: 0 };
  }
}

/** Tone multiplier for a class, independent of style (fine variation baked into the material). */
function classTone(surface: SurfaceClass, a: At, crevice: number): number {
  const { x, y, k } = a;
  const darkGroove = 1 - 0.25 * crevice;
  switch (surface) {
    case 'metal':
      return darkGroove * (0.96 + 0.04 * vnoise(x * 0.1, y * 1.5, 7)) * (0.985 + 0.015 * vnoise(x * 0.5 * k, y * 4 * k, 8));
    case 'armor':
      return darkGroove * (0.95 + 0.05 * fbm(x * 0.3, y * 0.3, 9, 2));
    case 'concrete':
      return darkGroove * (0.86 + 0.14 * fbm(x * 0.2, y * 0.2, 13, 3)) * (0.95 + 0.05 * vnoise(x * 0.7 * k, y * 0.7 * k, 14));
    case 'fabric':
      return darkGroove * (0.94 + 0.06 * vnoise(x * 0.5, y * 0.5, 19)) * (0.97 + 0.03 * vnoise(x * 1.5 * k, y * 1.5 * k, 20));
    case 'vent':
      return 1 - 0.45 * crevice;
    case 'rubber':
      return darkGroove * (0.95 + 0.05 * fbm(x * 0.25, y * 0.25, 43, 2));
    default:
      return darkGroove;
  }
}

/** How hard the weathering hits, by style (the 'rust' and 'grime' cells are the heavy ones). */
const WEATHER: Record<CellStyle, { chip: number; rust: number; grime: number; scratch: number }> = {
  vgrad: { chip: 0.55, rust: 0.35, grime: 0.3, scratch: 0.5 },
  vstrong: { chip: 0.6, rust: 0.4, grime: 0.35, scratch: 0.5 },
  hgrad: { chip: 0.5, rust: 0.3, grime: 0.3, scratch: 0.5 },
  flat: { chip: 0.35, rust: 0.2, grime: 0.2, scratch: 0.3 },
  wear: { chip: 1, rust: 0.25, grime: 0.15, scratch: 0.9 },
  rust: { chip: 0.5, rust: 1, grime: 0.4, scratch: 0.4 },
  grime: { chip: 0.3, rust: 0.5, grime: 1, scratch: 0.3 },
  core: { chip: 0, rust: 0, grime: 0, scratch: 0 },
};

/**
 * Weathering on top of a class's base texel: chipped edges (bare metal showing, concrete
 * crumbling), rust streaks running down from rivets and seams, dust and grime settling toward
 * the ground, fine scratches. Returns the texel changed in place.
 */
function weather(surface: SurfaceClass, style: CellStyle, a: At, tx: Texel, baseCrevice: number): void {
  const w = WEATHER[style];
  if (surface === 'glow' || style === 'core') return;
  const { s, t, x, y, k } = a;
  const pbr = SURFACE_PBR[surface];
  const metalLike = surface === 'metal' || surface === 'armor' || surface === 'vent' || surface === 'gloss';
  const edge = Math.min(s, 1 - s, t, 1 - t);
  // --- chipped / worn edges: a ragged band along the part's border.
  const rag = fbm(x * 0.45, y * 0.45, 71, 3);
  const chipBand = smooth(0.13, 0.0, edge + (rag - 0.5) * 0.1) * smooth(0.25, 0.7, fbm(x * 0.2, y * 0.2, 72, 2));
  const chip = chipBand * w.chip;
  if (chip > 0) {
    if (metalLike) {
      // Paint gone, bare metal: lighter, a little glossier.
      tx.tone[0] = lerp(tx.tone[0], Math.min(1, tx.tone[0] * 1.25 + 0.1), chip);
      tx.tone[1] = lerp(tx.tone[1], Math.min(1, tx.tone[1] * 1.25 + 0.1), chip);
      tx.tone[2] = lerp(tx.tone[2], Math.min(1, tx.tone[2] * 1.2 + 0.1), chip);
      tx.roughness = lerp(tx.roughness, Math.max(0.12, tx.roughness - 0.08), chip);
      tx.metalness = lerp(tx.metalness, Math.min(0.95, tx.metalness + 0.06), chip);
      tx.height -= 0.06 * chip;
    } else if (surface === 'concrete') {
      // Crumbled corners: darker, rougher, lower.
      const m = chip * 0.8;
      tx.tone[0] *= 1 - 0.2 * m;
      tx.tone[1] *= 1 - 0.2 * m;
      tx.tone[2] *= 1 - 0.18 * m;
      tx.height -= 0.2 * m;
      tx.ao *= 1 - 0.2 * m;
    } else if (surface === 'fabric') {
      // Frayed, faded hems.
      tx.tone[0] = lerp(tx.tone[0], Math.min(1, tx.tone[0] * 1.08 + 0.03), chip * 0.7);
      tx.tone[1] = lerp(tx.tone[1], Math.min(1, tx.tone[1] * 1.08 + 0.03), chip * 0.7);
      tx.tone[2] = lerp(tx.tone[2], Math.min(1, tx.tone[2] * 1.08 + 0.03), chip * 0.7);
    } else if (surface === 'rubber') {
      tx.tone[0] = lerp(tx.tone[0], tx.tone[0] * 0.85, chip * 0.6);
      tx.tone[1] = lerp(tx.tone[1], tx.tone[1] * 0.85, chip * 0.6);
      tx.tone[2] = lerp(tx.tone[2], tx.tone[2] * 0.85, chip * 0.6);
      tx.roughness = Math.min(0.95, tx.roughness + 0.1 * chip);
    }
  }
  // --- rust: streaks below rivets and seams, blooms in the crevices (metals only).
  if (metalLike && surface !== 'gloss' && w.rust > 0) {
    let streak = 0;
    for (const [rx, ry] of RIVETS[surface] ?? []) {
      const below = ry - t; // positive below the rivet
      if (below < 0 || below > 0.5) continue;
      const wobble = (fbm(x * 0.3, y * 0.3, 73, 2) - 0.5) * 0.05;
      const width = 0.02 + 0.05 * below;
      const line = groove(s - rx + wobble, width);
      streak = Math.max(streak, line * smooth(0.5, 0.02, below) * smooth(0.25, 0.6, fbm(y * 0.5, x * 0.1, 74, 2)));
    }
    const bloom = smooth(0.52, 0.72, fbm(x * 0.09, y * 0.09, 23, 4));
    const creviceRust = baseCrevice * smooth(0.3, 0.65, fbm(x * 0.4, y * 0.4, 75, 2));
    // Rust creeps up from the bottom edge, where water sits.
    const foot = smooth(0.14, 0.0, t + (fbm(x * 0.5, y * 0.5, 77, 2) - 0.5) * 0.1) * smooth(0.35, 0.7, fbm(x * 0.15, y * 0.15, 78, 2));
    const r = clamp01((streak * 0.95 + creviceRust + foot * 0.8) * w.rust + bloom * (style === 'rust' ? 1 : 0.18 * w.rust));
    if (r > 0.01) {
      const pitted = fbm(x * 0.5 * k, y * 0.5 * k, 76, 2);
      const dark = 0.55 + 0.35 * pitted;
      tx.tone[0] = lerp(tx.tone[0], 0.62 * dark + 0.3, r);
      tx.tone[1] = lerp(tx.tone[1], 0.34 * dark + 0.12, r);
      tx.tone[2] = lerp(tx.tone[2], 0.2 * dark + 0.04, r);
      tx.roughness = lerp(tx.roughness, 0.88, r);
      tx.metalness = lerp(tx.metalness, 0.12, r);
      tx.height += 0.12 * r * (pitted - 0.5);
      tx.ao *= 1 - 0.1 * r;
    }
  }
  // --- dust and grime: settles low on the part and in the texture's low spots, with drips.
  if (w.grime > 0) {
    const low = smooth(0.55, 0.0, t);
    const splash = fbm(x * 0.07, y * 0.07, 37, 4);
    const drip = groove(((s * 7 + fbm(y * 0.15, x * 0.05, 78, 2) * 1.5) % 1) - 0.5, 0.06) * smooth(0.4, 0.8, fbm(x * 0.25, y * 0.02, 79, 2)) * smooth(0.9, 0.3, t);
    const speck = smooth(0.82, 0.95, vnoise(x * 1.1 * k, y * 1.1 * k, 80)) * 0.5;
    const g = clamp01((low * (0.35 + 0.5 * splash) + drip * 0.5 + speck * 0.25) * w.grime + (style === 'grime' ? 0.25 * splash : 0));
    if (g > 0.01) {
      const dirt = 0.42 + 0.2 * splash;
      tx.tone[0] = lerp(tx.tone[0], tx.tone[0] * dirt * 1.08, g);
      tx.tone[1] = lerp(tx.tone[1], tx.tone[1] * dirt, g);
      tx.tone[2] = lerp(tx.tone[2], tx.tone[2] * dirt * 0.9, g);
      tx.roughness = lerp(tx.roughness, Math.min(0.95, tx.roughness + 0.35), g);
      tx.metalness = lerp(tx.metalness, tx.metalness * 0.4, g);
      tx.ao *= 1 - 0.15 * g;
    }
  }
  // --- scratches: thin bright lines on hard surfaces (and dark ones on cloth).
  if (w.scratch > 0) {
    let sc = 0;
    for (let i = 0; i < 3; i++) {
      const ang = 0.3 + i * 1.1;
      const d = ((s * Math.cos(ang) + t * Math.sin(ang)) * (7 + i * 3) + vnoise(x * 0.04, y * 0.04, 81 + i) * 0.4) % 1;
      const line = groove(d - 0.5, 0.012 + 0.004 * i);
      const on = smooth(0.55, 0.75, fbm(x * 0.12, y * 0.12, 85 + i, 2));
      sc = Math.max(sc, line * on);
    }
    sc *= w.scratch * (surface === 'gloss' ? 0.3 : 1);
    if (sc > 0.01) {
      if (metalLike) {
        tx.tone[0] = lerp(tx.tone[0], Math.min(1, tx.tone[0] * 1.15 + 0.08), sc);
        tx.tone[1] = lerp(tx.tone[1], Math.min(1, tx.tone[1] * 1.15 + 0.08), sc);
        tx.tone[2] = lerp(tx.tone[2], Math.min(1, tx.tone[2] * 1.12 + 0.08), sc);
        tx.height -= 0.05 * sc;
      } else if (surface === 'concrete') {
        tx.tone[0] *= 1 - 0.15 * sc;
        tx.tone[1] *= 1 - 0.15 * sc;
        tx.tone[2] *= 1 - 0.15 * sc;
        tx.height -= 0.08 * sc;
      }
    }
  }
  void pbr;
}

function texel(surface: SurfaceClass, style: CellStyle, a: At): Texel {
  const { s, t, x, y, k } = a;
  const pbr = SURFACE_PBR[surface];
  const d = detail(surface, a);
  let h = d.h;
  let tone: [number, number, number];
  let rough = pbr.roughness;
  let metal = pbr.metalness;
  // Ambient contact ramp: each part a little darker at its base.
  let ao = lerp(0.8, 1, smooth(0, 0.6, t)) * (1 - 0.35 * d.crevice);
  const ct = classTone(surface, a, d.crevice);
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
      const scratch = groove((((s * 0.8 + t * 0.35 + vnoise(x * 0.05, y * 0.05, 5) * 0.2) * 9) % 1) - 0.5, 0.04) * (hash(Math.floor(s * 9 + t * 4), 3, 61) > 0.5 ? 1 : 0);
      const g = 1 - 0.12 * scratch;
      tone = [g, g, g * 1.0];
      h -= 0.15 * scratch;
      rough = pbr.matte ? Math.min(0.9, rough) : Math.max(0.15, rough - 0.06);
      metal = pbr.matte ? metal : Math.min(0.9, metal + 0.04);
      ao = Math.min(1, ao + 0.1);
      break;
    }
    case 'rust': {
      // Rust blooms on exposed corners: orange-brown patches, pitted and rough (the weathering
      // pass adds the streaks and the pitting).
      const n = fbm(x * 0.09, y * 0.09, 23, 4);
      const patch = smooth(0.38, 0.62, n);
      tone = [lerp(0.85, 0.92, patch), lerp(0.85, 0.5, patch), lerp(0.85, 0.3, patch)];
      h += 0.25 * patch * (fbm(x * 0.5, y * 0.5, 31, 2) - 0.5);
      rough = lerp(rough, 0.85, patch);
      metal = lerp(metal, 0.15, patch);
      break;
    }
    case 'grime': {
      // Lower areas: dirt and splash marks, darker toward the ground.
      const n = fbm(x * 0.07, y * 0.07, 37, 4);
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
  const tx: Texel = { tone: [tone[0] * ct, tone[1] * ct, tone[2] * ct], height: h, ao, roughness: rough, metalness: metal };
  weather(surface, style, a, tx, d.crevice);
  void k;
  return { tone: [clamp01(tx.tone[0]), clamp01(tx.tone[1]), clamp01(tx.tone[2])], height: tx.height, ao: clamp01(tx.ao), roughness: clamp01(tx.roughness), metalness: clamp01(tx.metalness) };
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

const cached = new Map<number, AtlasImages>();

/**
 * Generates (once per size) the three atlas images. The default is the 512 base size (quick:
 * the in-game icons and the tests); the build writes the shipped 2048 and 1024 copies.
 */
export function atlasImages(size: number = ATLAS.size): AtlasImages {
  const hit = cached.get(size);
  if (hit) return hit;
  const N = size;
  const k = N / ATLAS.size;
  const cell = ATLAS.cell * k;
  const inset = ATLAS.inset * k;
  const inner = cell - 2 * inset;
  const color = new Uint8Array(N * N * 4);
  const normal = new Uint8Array(N * N * 4);
  const orm = new Uint8Array(N * N * 4);
  const height = new Float32Array(N * N);
  const a: At = { s: 0, t: 0, x: 0, y: 0, k };
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const col = Math.floor(px / cell);
      const row = Math.floor(py / cell);
      // Cell-local coordinates; the inset margin repeats the edge values.
      a.s = clamp01((px - col * cell - inset + 0.5) / inner);
      a.t = 1 - clamp01((py - row * cell - inset + 0.5) / inner);
      a.x = px / k;
      a.y = py / k;
      const tx = texel(SURFACES[col], STYLES[row], a);
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
  // The slope scales with resolution so a feature's bump reads the same at every size.
  const strength = NORMAL_STRENGTH * k;
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const cx0 = Math.floor(px / cell) * cell;
      const cy0 = Math.floor(py / cell) * cell;
      const lx = px - cx0;
      const ly = py - cy0;
      const i = (py * N + px) * 4;
      let nx = 0;
      let ny = 0;
      if (lx > inset && lx < cell - inset - 1 && ly > inset && ly < cell - inset - 1) {
        const hL = height[py * N + px - 1];
        const hR = height[py * N + px + 1];
        const hU = height[(py - 1) * N + px];
        const hD = height[(py + 1) * N + px];
        nx = -(hR - hL) * 0.5 * strength;
        ny = -(hU - hD) * 0.5 * strength; // +Y = up in the image
      }
      const len = Math.hypot(nx, ny, 1);
      normal[i] = byte((nx / len) * 0.5 + 0.5);
      normal[i + 1] = byte((ny / len) * 0.5 + 0.5);
      normal[i + 2] = byte((1 / len) * 0.5 + 0.5);
      normal[i + 3] = 255;
    }
  }
  const out = { size: N, color, normal, orm };
  cached.set(size, out);
  return out;
}
