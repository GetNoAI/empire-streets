import * as THREE from 'three';
import type { Facade } from './CityLayout';
import { Rng } from '../util/rng';

/**
 * Procedural textures drawn on canvases at startup. Facade textures cover a fixed patch of wall
 * (FACADE_TILE_W x FACADE_TILE_H metres) so building UVs can be computed in world units.
 *
 * The big city surfaces (facades, asphalt, sidewalks, grass, roofs) are full PBR sets: colour,
 * a normal map from the surface relief (mortar joints, recessed windows and proud sills, aggregate,
 * slab joints, gravel) and a packed roughness (G) / metalness (B) map so glass reflects while
 * brick and concrete stay matte.
 */

export const FACADE_TILE_W = 16; // 4 window bays of 4 m
export const FACADE_TILE_H = 14.4; // 4 floors of 3.6 m

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, amount: number, alpha: number): void {
  for (let i = 0; i < amount; i++) {
    const v = rng.int(0, 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rng.int(0, w - 1), rng.int(0, h - 1), rng.int(1, 3), rng.int(1, 3));
  }
}

interface FacadeStyle {
  wall: string;
  window: string;
  windowLit: string;
  frame: string;
  /** Window size as fraction of the bay/floor cell. */
  winW: number;
  winH: number;
  curtain: boolean;
  roughness: number;
  metalness: number;
}

const STYLES: Record<Facade, FacadeStyle> = {
  glass: { wall: '#6f8ba3', window: '#3e5f7c', windowLit: '#9fb9cc', frame: '#2b3a46', winW: 0.92, winH: 0.86, curtain: true, roughness: 0.12, metalness: 0.55 },
  darkglass: { wall: '#2c3640', window: '#1c242c', windowLit: '#56687a', frame: '#11161b', winW: 0.94, winH: 0.88, curtain: true, roughness: 0.1, metalness: 0.65 },
  brick: { wall: '#7d4a3b', window: '#1f2a33', windowLit: '#e8d7a8', frame: '#cfc6b6', winW: 0.42, winH: 0.55, curtain: false, roughness: 0.9, metalness: 0 },
  brownstone: { wall: '#5f4337', window: '#1d252c', windowLit: '#f0dca8', frame: '#3e2a20', winW: 0.4, winH: 0.6, curtain: false, roughness: 0.92, metalness: 0 },
  limestone: { wall: '#b8ad98', window: '#28333d', windowLit: '#efe2bd', frame: '#948a76', winW: 0.5, winH: 0.6, curtain: false, roughness: 0.85, metalness: 0 },
  concrete: { wall: '#8e8e8a', window: '#2a3440', windowLit: '#d8dfe4', frame: '#66665f', winW: 0.7, winH: 0.55, curtain: false, roughness: 0.88, metalness: 0 },
};

export interface FacadeSet {
  map: THREE.CanvasTexture;
  /** Tangent-space normals from the facade's relief (mortar, recessed windows, sills). */
  normalMap: THREE.Texture;
  /** Packed G roughness / B metalness (glass glossy, brick rough); use with factors 1. */
  ormMap: THREE.Texture;
  roughness: number;
  metalness: number;
}

/** A full PBR set for a tiling city surface. */
export interface SurfaceSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.Texture;
  ormMap: THREE.Texture;
}

/**
 * Normal map from a height canvas (luminance = height), wrapping at the edges so tiling stays
 * seamless. `strength` is the slope scale (pixels of height per pixel).
 */
function heightToNormal(h: HTMLCanvasElement, strength: number): THREE.DataTexture {
  const w = h.width;
  const hh = h.height;
  const src = h.getContext('2d')!.getImageData(0, 0, w, hh).data;
  const H = (x: number, y: number): number => src[(((y + hh) % hh) * w + ((x + w) % w)) * 4] / 255;
  const out = new Uint8Array(w * hh * 4);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel.
      const dx = H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1);
      const dy = H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1);
      // Canvas y grows downward; normal-map +Y is up in the image (OpenGL convention).
      const nx = -dx * strength;
      const ny = dy * strength;
      const len = Math.hypot(nx, ny, 1);
      // Rows stored bottom-up: matches the canvas colour maps (CanvasTexture flips on upload).
      const i = ((hh - 1 - y) * w + x) * 4;
      out[i] = Math.round((nx / len * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(out, w, hh, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.flipY = false;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Height and roughness/metalness canvases derived from a colour canvas's luminance. */
function derive(c: HTMLCanvasElement, fn: (l: number, x: number, y: number) => { h: number; r: number; m: number }): [HTMLCanvasElement, HTMLCanvasElement] {
  const w = c.width;
  const h = c.height;
  const src = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [hc, hctx] = canvas(w, h);
  const [oc, octx] = canvas(w, h);
  const hi = hctx.createImageData(w, h);
  const oi = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = (0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]) / 255;
      const v = fn(l, x, y);
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = Math.round(Math.min(1, Math.max(0, v.h)) * 255);
      hi.data[i + 3] = 255;
      oi.data[i] = 255;
      oi.data[i + 1] = Math.round(Math.min(1, Math.max(0, v.r)) * 255);
      oi.data[i + 2] = Math.round(Math.min(1, Math.max(0, v.m)) * 255);
      oi.data[i + 3] = 255;
    }
  }
  hctx.putImageData(hi, 0, 0);
  octx.putImageData(oi, 0, 0);
  return [hc, oc];
}

const grey = (v: number): string => `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`;
/** ORM colour: R occlusion 1, G roughness, B metalness. */
const ormColor = (rough: number, metal: number): string => `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;

export function makeFacade(kind: Facade, seed: number): FacadeSet {
  const S = STYLES[kind];
  // Drawn in a 512-unit space onto a 1024 px canvas (the weathering pass below works at full res).
  const W = 512;
  const H = 512;
  const PX = 1024;
  const [c, ctx] = canvas(PX, PX);
  // Relief and surface layers drawn alongside the colour.
  const [hc, hctx] = canvas(PX, PX);
  const [oc, octx] = canvas(PX, PX);
  for (const k of [ctx, hctx, octx]) k.scale(PX / W, PX / H);
  const rng = new Rng(seed);
  /** Fills a rect on all three layers: colour, height (0..1), roughness/metalness. */
  const fill = (x: number, y: number, w: number, h: number, color: string | CanvasGradient, height: number, rough: number, metal: number): void => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    hctx.fillStyle = grey(height);
    hctx.fillRect(x, y, w, h);
    octx.fillStyle = ormColor(rough, metal);
    octx.fillRect(x, y, w, h);
  };
  const wallRough = S.curtain ? 0.35 : S.roughness;
  const wallMetal = S.curtain ? S.metalness : 0;
  fill(0, 0, W, H, S.wall, 0.6, wallRough, wallMetal);
  if (kind === 'brick' || kind === 'brownstone') {
    // Brick courses: recessed mortar joints, each brick a slightly different shade.
    for (let y = 0; y < H; y += 6) {
      for (let x = (y / 6) % 2 === 0 ? 0 : 7; x < W + 14; x += 14) {
        // Each brick its own shade; one in twelve is a burnt dark one or a pale one.
        const odd = rng.chance(0.08);
        const k = odd ? (rng.chance(0.5) ? -0.22 : 0.14) : rng.range(-0.08, 0.08);
        ctx.fillStyle = k > 0 ? `rgba(255,225,200,${k})` : `rgba(10,5,5,${-k})`;
        ctx.fillRect(x - 14, y, 13, 5);
        hctx.fillStyle = grey(0.62 + rng.range(-0.03, 0.03));
        hctx.fillRect(x - 14, y, 13, 5);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    hctx.fillStyle = grey(0.38);
    for (let y = 0; y < H; y += 6) {
      ctx.fillRect(0, y + 5, W, 1);
      hctx.fillRect(0, y + 5, W, 1);
    }
    for (let y = 0; y < H; y += 6)
      for (let x = (y / 6) % 2 === 0 ? 0 : 7; x < W; x += 14) {
        ctx.fillRect(x + 13, y, 1, 6);
        hctx.fillRect(x + 13, y, 1, 6);
      }
  } else if (kind === 'limestone' || kind === 'concrete') {
    // Stone courses / concrete panel joints.
    const step = kind === 'limestone' ? 32 : 64;
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    hctx.fillStyle = grey(0.4);
    for (let y = 0; y < H; y += step) {
      ctx.fillRect(0, y, W, 2);
      hctx.fillRect(0, y, W, 2);
    }
    for (let x = 0; x < W; x += step * 2) {
      ctx.fillRect(x, 0, 2, H);
      hctx.fillRect(x, 0, 2, H);
    }
  }
  noise(ctx, W, H, rng, 6000, 0.05);
  // Weathering: streaks running down from the sills, darker toward the bottom of each tile.
  const grime = ctx.createLinearGradient(0, 0, 0, H);
  grime.addColorStop(0, 'rgba(0,0,0,0)');
  grime.addColorStop(1, 'rgba(20,18,15,0.12)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, W, H);

  const bays = 4;
  const floors = 4;
  const cw = W / bays;
  const ch = H / floors;
  for (let f = 0; f < floors; f++) {
    for (let b = 0; b < bays; b++) {
      const ww = cw * S.winW;
      const wh = ch * S.winH;
      const x = b * cw + (cw - ww) / 2;
      const y = f * ch + (ch - wh) * 0.45;
      if (S.curtain) {
        const g = ctx.createLinearGradient(x, y, x + ww, y + wh);
        g.addColorStop(0, S.windowLit);
        g.addColorStop(0.55, S.window);
        g.addColorStop(1, rng.chance(0.3) ? S.windowLit : S.window);
        // Glass: smooth and reflective, a hair behind the mullions.
        fill(x, y, ww, wh, g, 0.5, 0.05, 0.6);
        fill(x - 3, y - 3, ww + 6, 3, S.frame, 0.75, 0.35, 0.85);
        fill(x - 3, y, 3, wh, S.frame, 0.75, 0.35, 0.85);
      } else {
        // Lintel + sill stand proud of the wall.
        fill(x - 5, y - 7, ww + 10, 7, S.frame, 0.85, Math.min(0.9, S.roughness), 0);
        fill(x - 3, y + wh, ww + 6, 6, S.frame, 0.9, Math.min(0.9, S.roughness), 0);
        // Rain streak under the sill.
        ctx.fillStyle = 'rgba(25,22,18,0.10)';
        ctx.fillRect(x + ww * 0.2, y + wh + 6, ww * 0.6, ch * 0.35);
        const lit = rng.chance(0.12);
        const g = ctx.createLinearGradient(x, y, x, y + wh);
        g.addColorStop(0, lit ? S.windowLit : '#3c4b58');
        g.addColorStop(1, lit ? S.windowLit : S.window);
        // Window glass, set back in the wall: glossy, a little reflective.
        fill(x, y, ww, wh, g, 0.15, 0.04, 0.35);
        // Mullions and a blind or two.
        fill(x + ww / 2 - 2, y, 4, wh, S.frame, 0.35, 0.5, 0);
        fill(x, y + wh * 0.45, ww, 3, S.frame, 0.35, 0.5, 0);
        if (rng.chance(0.3)) {
          const bh = wh * rng.range(0.2, 0.6);
          ctx.fillStyle = 'rgba(230,220,200,0.6)';
          ctx.fillRect(x, y, ww, bh);
          octx.fillStyle = ormColor(0.85, 0);
          octx.fillRect(x, y, ww, bh);
        }
        // A window air conditioner in the lower pane, now and then: a grey box standing proud, with a
        // grille and a drip stain beneath it.
        if (rng.chance(0.22)) {
          const aw = ww * 0.42;
          const ah = wh * 0.3;
          const ax = x + ww * 0.29;
          const ay = y + wh - ah;
          fill(ax, ay, aw, ah, '#8d8f8c', 0.98, 0.6, 0.35);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          for (let k = 2; k < ah - 2; k += 3) ctx.fillRect(ax + 3, ay + k, aw - 6, 1);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(ax, ay + ah, aw, 2);
          ctx.fillStyle = 'rgba(20,18,15,0.14)';
          ctx.fillRect(ax + aw * 0.3, ay + ah + 8, aw * 0.4, ch * 0.3);
        }
      }
    }
  }
  // Street-level grime and soot at full resolution: a dirt band up the bottom of the tile,
  // long rain streaks running down from the sills, soot pooling under the cornice line.
  for (const k of [ctx, hctx, octx]) k.setTransform(1, 0, 0, 1, 0, 0);
  const img = ctx.getImageData(0, 0, PX, PX);
  const oimg = octx.getImageData(0, 0, PX, PX);
  const d = img.data;
  const od = oimg.data;
  for (let y = 0; y < PX; y++) {
    const v = (y + 0.5) / PX;
    for (let x = 0; x < PX; x++) {
      const u = (x + 0.5) / PX;
      const i = (y * PX + x) * 4;
      // Rain streaks: vertical, broken, denser below the sills (every floor is ch tall).
      const floorV = (v * floors) % 1;
      const streak = sm(0.55, 0.9, pnoise(u * 180, v * 3, 180, seed * 7 + 1)) * sm(0.45, 0.75, floorV) * sm(0.3, 0.7, pfbm(u, v, 6, seed * 7 + 2, 2));
      // Dirt band: the bottom fifth of the tile (the ground floor on the lowest tile).
      const band = sm(0.74, 1, v) * (0.5 + 0.5 * pfbm(u, v, 5, seed * 7 + 3, 3));
      // Soot under the top edge and a general mottle.
      const soot = sm(0.08, 0, v) * 0.5;
      const mottle = (pfbm(u, v, 4, seed * 7 + 4, 3) - 0.5) * 0.1;
      const dark = Math.min(0.55, 0.22 * streak + 0.3 * band + soot) + mottle;
      const f = 1 - dark;
      d[i] = Math.max(0, Math.min(255, d[i] * f * (1 - 0.1 * dark)));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * f * (1 - 0.14 * dark)));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * f * (1 - 0.18 * dark)));
      // Grime is matte.
      od[i + 1] = Math.min(255, od[i + 1] + Math.max(0, dark) * 110);
    }
  }
  ctx.putImageData(img, 0, 0);
  octx.putImageData(oimg, 0, 0);
  return { map: toTexture(c), normalMap: heightToNormal(hc, 3.5), ormMap: toTexture(oc, false), roughness: 1, metalness: 1 };
}

// ---------------------------------------------------------------------------- pixel noise

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Periodic value noise on a `period`-cell lattice (so the texture tiles). */
function pnoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const m = (v: number): number => ((v % period) + period) % period;
  const a = hash2(m(ix), m(iy), seed);
  const b = hash2(m(ix + 1), m(iy), seed);
  const c = hash2(m(ix), m(iy + 1), seed);
  const d = hash2(m(ix + 1), m(iy + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tiling fbm: u, v in 0..1 across the tile; `cells` lattice cells across it at the first octave. */
function pfbm(u: number, v: number, cells: number, seed: number, oct = 4): number {
  let out = 0;
  let amp = 0.5;
  let f = cells;
  for (let i = 0; i < oct; i++) {
    out += amp * pnoise(u * f, v * f, f, seed + i * 31);
    amp *= 0.5;
    f *= 2;
  }
  return out / (1 - 0.5 ** oct);
}

/** Tiling ridged noise (cracks: thin sharp lines where it peaks). */
function pridge(u: number, v: number, cells: number, seed: number, oct = 3): number {
  let out = 0;
  let amp = 0.5;
  let f = cells;
  for (let i = 0; i < oct; i++) {
    out += amp * (1 - Math.abs(pnoise(u * f, v * f, f, seed + i * 37) * 2 - 1));
    amp *= 0.5;
    f *= 2;
  }
  return out / (1 - 0.5 ** oct);
}

const sm = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** One texel of a generated surface: linear colour, relief height and roughness. */
interface Px {
  r: number;
  g: number;
  b: number;
  h: number;
  rough: number;
  metal: number;
}

/** Builds a full tiling PBR set from a per-texel function (colour written sRGB-ish by the canvas). */
function generate(size: number, fn: (u: number, v: number, x: number, y: number) => Px, normalStrength: number): SurfaceSet {
  const [c, ctx] = canvas(size, size);
  const [hc, hctx] = canvas(size, size);
  const [oc, octx] = canvas(size, size);
  const ci = ctx.createImageData(size, size);
  const hi = hctx.createImageData(size, size);
  const oi = octx.createImageData(size, size);
  const b = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = fn((x + 0.5) / size, (y + 0.5) / size, x, y);
      const i = (y * size + x) * 4;
      ci.data[i] = b(p.r);
      ci.data[i + 1] = b(p.g);
      ci.data[i + 2] = b(p.b);
      ci.data[i + 3] = 255;
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = b(p.h);
      hi.data[i + 3] = 255;
      oi.data[i] = 255;
      oi.data[i + 1] = b(p.rough);
      oi.data[i + 2] = b(p.metal);
      oi.data[i + 3] = 255;
    }
  }
  ctx.putImageData(ci, 0, 0);
  hctx.putImageData(hi, 0, 0);
  octx.putImageData(oi, 0, 0);
  return { map: toTexture(c), normalMap: heightToNormal(hc, normalStrength), ormMap: toTexture(oc, false) };
}

// ---------------------------------------------------------------------------- ground

/**
 * Asphalt, a 10 m tile at 1024 px: a mottled dark grey with aggregate showing through, tar-sealed
 * crack lines (dark and glossy), hairline cracks, a few square repair patches, oil stains and the
 * damp low spots that stay dark long after rain.
 */
export function makeAsphalt(): SurfaceSet {
  const N = 1024;
  return generate(
    N,
    (u, v, x, y) => {
      // Large-scale mottling (worn lanes, repaved strips) and a fine grain.
      const mottle = pfbm(u, v, 3, 1, 4);
      const grain = pfbm(u, v, 96, 2, 3);
      const stone = sm(0.78, 0.98, pnoise(u * 400, v * 400, 400, 3)); // exposed aggregate
      let l = 0.19 + 0.08 * mottle + 0.05 * (grain - 0.5) + 0.09 * stone;
      let h = 0.45 + 0.1 * (grain - 0.5) + 0.12 * stone;
      let rough = 0.78 + 0.1 * (grain - 0.5) + 0.08 * stone - 0.08 * mottle;
      // Tar snakes: meandering sealed cracks, dark and glossy.
      const tar = sm(0.9, 0.97, pridge(u, v, 5, 4, 3)) * sm(0.3, 0.5, pfbm(u, v, 2, 5, 2));
      l = mix(l, 0.08, tar);
      h -= 0.1 * tar;
      rough = mix(rough, 0.3, tar);
      // Hairline cracks: thin, dark, rough-edged.
      const crack = sm(0.93, 0.985, pridge(u, v, 11, 6, 3)) * sm(0.45, 0.6, pfbm(u, v, 3, 7, 2));
      l = mix(l, 0.06, crack);
      h -= 0.3 * crack;
      // Repair patches: a few rectangles of newer, darker (or older, paler) asphalt with a crisp edge.
      let patch = 0;
      let patchTone = 0;
      for (let i = 0; i < 2; i++) {
        const px0 = hash2(i, 1, 8) * 0.8;
        const py0 = hash2(i, 2, 8) * 0.8;
        const pw = 0.1 + hash2(i, 3, 8) * 0.2;
        const ph = 0.08 + hash2(i, 4, 8) * 0.14;
        if (u > px0 && u < px0 + pw && v > py0 && v < py0 + ph) {
          patch = 1;
          patchTone = hash2(i, 5, 8) > 0.5 ? -0.025 : 0.02;
          const e = Math.min(u - px0, px0 + pw - u, v - py0, py0 + ph - v);
          // A sealed seam round the edge.
          if (e < 0.004) {
            l -= 0.04;
            h -= 0.12;
            rough -= 0.2;
          }
        }
      }
      if (patch) {
        l += patchTone;
        rough += patchTone > 0 ? 0.03 : -0.03;
      }
      // Oil and damp: soft dark blotches that also go glossy.
      const damp = sm(0.6, 0.85, pfbm(u, v, 4, 9, 4));
      l = mix(l, l * 0.55, damp);
      rough = mix(rough, 0.35, damp);
      // Tyre-polished strips along the tile (lanes run both ways across the city, so keep it faint).
      const polish = sm(0.5, 0.75, pnoise(u * 2 + 0.3, v * 0.5, 2, 10)) * 0.5;
      rough -= 0.06 * polish;
      l += 0.015 * polish;
      void x;
      void y;
      // A slightly cool, desaturated grey.
      return { r: l * 0.97, g: l, b: l * 1.06, h, rough, metal: 0 };
    },
    2.4,
  );
}

/**
 * Sidewalk, a 3 m tile at 1024 px: four 1.5 m slabs with bevelled joints, each its own shade,
 * with hairline cracks, dark stains, gum spots and the grime that collects in the joints.
 */
export function makeSidewalk(): SurfaceSet {
  const N = 1024;
  return generate(
    N,
    (u, v) => {
      const sx = u * 2;
      const sz = v * 2;
      const slabX = Math.floor(sx);
      const slabZ = Math.floor(sz);
      const fx = sx - slabX;
      const fz = sz - slabZ;
      const edge = Math.min(fx, 1 - fx, fz, 1 - fz);
      // Slab tone, with a broomed finish (faint stripes) and a fine grain.
      const slab = hash2(slabX, slabZ, 11) - 0.5;
      const grain = pfbm(u, v, 128, 12, 3);
      const broom = 0.02 * Math.sin(u * N * 0.9 + pnoise(u * 8, v * 8, 8, 13) * 3);
      let l = 0.5 + 0.06 * slab + 0.07 * (grain - 0.5) + broom + 0.05 * (pfbm(u, v, 2, 14, 3) - 0.5);
      let h = 0.6 + 0.08 * (grain - 0.5);
      let rough = 0.82 + 0.08 * (grain - 0.5);
      // Joints: a bevel into a dark groove.
      const groove = sm(0.012, 0.0, edge);
      const bevel = sm(0.035, 0.012, edge);
      h -= 0.35 * groove + 0.15 * bevel;
      l = mix(l, 0.16, groove * 0.9);
      l -= 0.05 * bevel;
      // Hairline cracks across some slabs.
      const crack = sm(0.94, 0.99, pridge(u, v, 9, 15, 3)) * (hash2(slabX, slabZ, 16) > 0.45 ? 1 : 0);
      l = mix(l, 0.18, crack);
      h -= 0.25 * crack;
      // Stains, gum and grime.
      const stain = sm(0.62, 0.9, pfbm(u, v, 5, 17, 4));
      l = mix(l, l * 0.72, stain);
      rough = mix(rough, 0.9, stain);
      const gum = sm(0.985, 1, pnoise(u * 90, v * 90, 90, 18));
      l = mix(l, 0.12, gum);
      h += 0.1 * gum;
      rough = mix(rough, 0.5, gum);
      const grime = sm(0.08, 0.0, edge) * 0.5;
      l -= 0.08 * grime;
      // A warm, slightly yellowed concrete.
      return { r: l * 1.03, g: l, b: l * 0.92, h, rough, metal: 0 };
    },
    2.6,
  );
}

/**
 * Worn paint for the road markings: an alpha mask on a 2 m tile. The paint has flaked along
 * cracks and tyre tracks, so the asphalt shows through, and what's left is scuffed.
 */
export function makeMarkingWear(): { alphaMap: THREE.CanvasTexture; map: THREE.CanvasTexture } {
  const N = 512;
  const [ac, actx] = canvas(N, N);
  const [cc, cctx] = canvas(N, N);
  const ai = actx.createImageData(N, N);
  const ci = cctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N;
      const v = (y + 0.5) / N;
      // Flaking follows the asphalt's cracks and the worn wheel tracks.
      const flake = sm(0.55, 0.8, pfbm(u, v, 6, 21, 4)) * sm(0.3, 0.8, pfbm(u, v, 2, 22, 2));
      const crack = sm(0.9, 0.98, pridge(u, v, 8, 23, 3));
      const alpha = Math.max(0, 1 - flake * 0.95 - crack * 0.8 - 0.08 * pfbm(u, v, 64, 24, 2));
      const scuff = 0.86 + 0.14 * pfbm(u, v, 48, 25, 3) - 0.1 * sm(0.5, 0.9, pfbm(u, v, 4, 26, 3));
      const i = (y * N + x) * 4;
      ai.data[i] = ai.data[i + 1] = ai.data[i + 2] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
      ai.data[i + 3] = 255;
      ci.data[i] = ci.data[i + 1] = ci.data[i + 2] = Math.round(Math.min(1, Math.max(0, scuff)) * 255);
      ci.data[i + 3] = 255;
    }
  }
  actx.putImageData(ai, 0, 0);
  cctx.putImageData(ci, 0, 0);
  const alphaMap = toTexture(ac, false);
  const map = toTexture(cc);
  alphaMap.repeat.set(0.5, 0.5);
  map.repeat.set(0.5, 0.5);
  return { alphaMap, map };
}

export function makeGrass(): SurfaceSet {
  const [c, ctx] = canvas(256, 256);
  const rng = new Rng(13);
  ctx.fillStyle = '#4b6b33';
  ctx.fillRect(0, 0, 256, 256);
  // Patchy: drier and lusher areas.
  for (let i = 0; i < 14; i++) {
    const x = rng.int(0, 255);
    const y = rng.int(0, 255);
    const r = rng.int(20, 60);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dry = rng.chance(0.5);
    g.addColorStop(0, dry ? 'rgba(140,130,70,0.22)' : 'rgba(30,70,20,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 12000; i++) {
    const g = rng.int(80, 140);
    ctx.fillStyle = `rgba(${g - 40},${g},${g - 60},0.35)`;
    ctx.fillRect(rng.int(0, 255), rng.int(0, 255), 1, rng.int(1, 4));
  }
  const [hc, oc] = derive(c, (l) => ({ h: l * 2.4, r: 0.92, m: 0 }));
  return { map: toTexture(c), normalMap: heightToNormal(hc, 3), ormMap: toTexture(oc, false) };
}

/** Roof: tar paper with gravel ballast, seams, and the dirt that pools along them. */
export function makeRoof(): SurfaceSet {
  return generate(
    512,
    (u, v) => {
      const gravel = sm(0.7, 0.95, pnoise(u * 160, v * 160, 160, 41));
      const grain = pfbm(u, v, 64, 42, 3);
      const seam = sm(0.012, 0.0, Math.abs(((v * 4) % 1) - 0.5) - 0.48) ;
      const pool = sm(0.6, 0.85, pfbm(u, v, 3, 43, 3));
      let l = 0.24 + 0.06 * (grain - 0.5) + 0.22 * gravel - 0.08 * pool;
      let h = 0.4 + 0.5 * gravel + 0.05 * (grain - 0.5) - 0.3 * seam;
      l = mix(l, 0.1, seam);
      return { r: l, g: l, b: l * 0.96, h, rough: 0.9 - 0.3 * pool, metal: 0 };
    },
    2.5,
  );
}

export function makeTaxiSign(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 64);
  ctx.fillStyle = '#f7f3e0';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 44px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', 128, 34);
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function makePoliceDecal(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = '#1d3f8f';
  ctx.fillRect(0, 70, 512, 22);
  ctx.fillStyle = '#1d3f8f';
  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POLICE', 256, 38);
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft round sprite for smoke and dust particles. */
export function makeSoftParticle(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
