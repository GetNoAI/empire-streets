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
  brick: { wall: '#8a4a36', window: '#1f2a33', windowLit: '#e8d7a8', frame: '#d9d2c4', winW: 0.42, winH: 0.55, curtain: false, roughness: 0.9, metalness: 0 },
  brownstone: { wall: '#6b4a3a', window: '#1d252c', windowLit: '#f0dca8', frame: '#3e2a20', winW: 0.4, winH: 0.6, curtain: false, roughness: 0.92, metalness: 0 },
  limestone: { wall: '#c9bea6', window: '#28333d', windowLit: '#efe2bd', frame: '#9e9480', winW: 0.5, winH: 0.6, curtain: false, roughness: 0.85, metalness: 0 },
  concrete: { wall: '#9a9a96', window: '#2a3440', windowLit: '#d8dfe4', frame: '#6e6e6a', winW: 0.7, winH: 0.55, curtain: false, roughness: 0.88, metalness: 0 },
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
  const W = 512;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  // Relief and surface layers drawn alongside the colour.
  const [hc, hctx] = canvas(W, H);
  const [oc, octx] = canvas(W, H);
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
        const k = rng.range(-0.06, 0.06);
        ctx.fillStyle = k > 0 ? `rgba(255,235,220,${k})` : `rgba(0,0,0,${-k})`;
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
      }
    }
  }
  return { map: toTexture(c), normalMap: heightToNormal(hc, 3.5), ormMap: toTexture(oc, false), roughness: 1, metalness: 1 };
}

export function makeAsphalt(): SurfaceSet {
  const [c, ctx] = canvas(512, 512);
  const rng = new Rng(11);
  ctx.fillStyle = '#3b3c3f';
  ctx.fillRect(0, 0, 512, 512);
  noise(ctx, 512, 512, rng, 26000, 0.08);
  // Aggregate: small light stones.
  for (let i = 0; i < 5000; i++) {
    const v = rng.int(95, 150);
    ctx.fillStyle = `rgba(${v},${v - 2},${v - 6},0.5)`;
    ctx.fillRect(rng.int(0, 511), rng.int(0, 511), rng.int(1, 2), rng.int(1, 2));
  }
  // Patches, oil stains and cracks.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(${rng.pick(['20,20,22', '70,70,72'])},0.25)`;
    ctx.fillRect(rng.int(0, 400), rng.int(0, 400), rng.int(40, 140), rng.int(30, 120));
  }
  for (let i = 0; i < 5; i++) {
    const gx = rng.int(40, 470);
    const gy = rng.int(40, 470);
    const r = rng.int(10, 30);
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, 'rgba(10,10,12,0.35)');
    g.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  ctx.strokeStyle = 'rgba(15,15,15,0.4)';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    let x = rng.int(0, 512);
    let y = rng.int(0, 512);
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += rng.int(-30, 30);
      y += rng.int(-30, 30);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Stones stand up, cracks and stains sink; worn smooth where dark (tar), rough on aggregate.
  const [hc, oc] = derive(c, (l) => ({ h: 0.25 + l * 2.2, r: 0.62 + l * 0.9, m: 0 }));
  return { map: toTexture(c), normalMap: heightToNormal(hc, 2.2), ormMap: toTexture(oc, false) };
}

export function makeSidewalk(): SurfaceSet {
  const [c, ctx] = canvas(256, 256);
  const rng = new Rng(12);
  ctx.fillStyle = '#a3a19b';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, rng, 7000, 0.06);
  // Slab-to-slab tone shifts.
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = `rgba(${rng.pick(['0,0,0', '255,250,240'])},${rng.range(0.02, 0.06)})`;
      ctx.fillRect(i * 128, j * 128, 128, 128);
    }
  ctx.fillStyle = 'rgba(60,60,58,0.45)';
  // 1.5 m slabs on a 3 m tile.
  for (let i = 0; i <= 2; i++) {
    ctx.fillRect(0, i * 128 - 1, 256, 2);
    ctx.fillRect(i * 128 - 1, 0, 2, 256);
  }
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(40,40,40,0.18)';
    ctx.beginPath();
    ctx.arc(rng.int(0, 256), rng.int(0, 256), rng.int(2, 6), 0, Math.PI * 2);
    ctx.fill();
  }
  const [hc, oc] = derive(c, (l) => ({ h: l < 0.36 ? 0.1 : 0.55 + (l - 0.6) * 1.5, r: 0.78 + (0.62 - l) * 0.6, m: 0 }));
  return { map: toTexture(c), normalMap: heightToNormal(hc, 2.5), ormMap: toTexture(oc, false) };
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

export function makeRoof(): SurfaceSet {
  const [c, ctx] = canvas(256, 256);
  const rng = new Rng(14);
  ctx.fillStyle = '#4d4c4a';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, rng, 9000, 0.1);
  // Gravel ballast and tar-paper seams.
  for (let i = 0; i < 4000; i++) {
    const v = rng.int(60, 130);
    ctx.fillStyle = `rgba(${v},${v},${v - 4},0.6)`;
    ctx.beginPath();
    ctx.arc(rng.int(0, 255), rng.int(0, 255), rng.range(0.6, 1.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(15,15,15,0.4)';
  for (let y = 0; y < 256; y += 64) ctx.fillRect(0, y, 256, 2);
  const [hc, oc] = derive(c, (l) => ({ h: l * 2, r: 0.9, m: 0 }));
  return { map: toTexture(c), normalMap: heightToNormal(hc, 2.5), ormMap: toTexture(oc, false) };
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
