import * as THREE from 'three';
import { SURFACE_TUNING, TILE_PX, surfaceTile, type SurfaceKind } from './SurfaceGen';

export type { SurfaceKind } from './SurfaceGen';

/**
 * Surface detail for any MeshStandardMaterial / MeshPhysicalMaterial, without UVs.
 *
 * `withSurface(material, kind)` patches the material's shader (onBeforeCompile) to sample the
 * kind's tileable detail tile (SurfaceGen.ts) by triplanar projection in the mesh's own space
 * (so the detail sticks to moving cars, skinned people and instanced props), and to:
 *   - vary the albedo (tone) and darken cavities (grooves, mortar, pores),
 *   - vary the roughness (scuffs, polish, stains),
 *   - perturb the normal from the tile's height (bump from screen-space derivatives: works on
 *     any geometry, skinned or instanced, with no tangents or UVs),
 * all fading out with distance so far-away surfaces don't shimmer. The material keeps its own
 * colour, maps, roughness and metalness; the detail modulates them.
 *
 * All patched materials share one shader program per material type (the kind only changes
 * uniforms), so this adds three texture reads per pixel, not new programs per kind.
 */

const textures = new Map<SurfaceKind, THREE.DataTexture>();
const surfaceUniforms = new WeakMap<THREE.Material, Record<string, THREE.IUniform>>();

/** Neutral tile (no detail) shown until a kind's tile has been generated. */
function neutral(): Uint8Array<ArrayBuffer> {
  const d = new Uint8Array(TILE_PX * TILE_PX * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 128;
    d[i + 1] = 128;
    d[i + 2] = 255;
    d[i + 3] = 128;
  }
  return d;
}

const pending: SurfaceKind[] = [];
let pumping = false;

/** Generates queued tiles one per idle slot (about 50 ms each) so startup isn't held up. */
function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = (): void => {
    const kind = pending.shift();
    if (!kind) {
      pumping = false;
      return;
    }
    const t = textures.get(kind)!;
    (t.image.data as Uint8Array).set(surfaceTile(kind));
    t.needsUpdate = true;
    const w = globalThis as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(step, { timeout: 200 });
    else setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

export function surfaceTexture(kind: SurfaceKind): THREE.DataTexture {
  let t = textures.get(kind);
  if (!t) {
    const browser = typeof window !== 'undefined';
    t = new THREE.DataTexture(browser ? neutral() : new Uint8Array(surfaceTile(kind)), TILE_PX, TILE_PX, THREE.RGBAFormat, THREE.UnsignedByteType);
    if (browser) {
      pending.push(kind);
      pump();
    }
    t.name = `surface_${kind}`;
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    textures.set(kind, t);
  }
  return t;
}

export interface SurfaceOptions {
  /** Tile size in metres (default: the kind's). */
  tile?: number;
  /** Multipliers on the kind's strengths. */
  tone?: number;
  rough?: number;
  cavity?: number;
  bump?: number;
  /** Fade the detail out between these camera distances (metres). */
  fade?: [number, number];
  /**
   * Breaks up tiling in the material's own maps (map, normal, roughness, metalness), for big
   * flat surfaces (roads, pavements, roofs): each map lookup blends between two randomly shifted
   * copies of the tile, the shift changing smoothly every few tiles. `step` snaps the shifts to
   * a grid (UV units per axis, 0 = free) so slab joints and roof seams stay lined up.
   */
  antiTile?: { step?: [number, number] };
  /** Large, soft light/dark patches in world space (0..~0.15): weathering that never repeats. */
  macro?: number;
}

/** Global strength (e.g. a graphics setting): 0 turns all surface detail off. */
export const SURFACE_DETAIL = { strength: 1, /** Anti-tiling lookups (two reads per map): off on phones. */ antiTile: true };

const VERT_DECL = /* glsl */ `
uniform float uSurfTile;
varying vec3 vSurfP;
varying vec3 vSurfN;
`;
const VERT_BODY = /* glsl */ `
{
  vec3 sp = position;
  vec3 sn = normal;
  #ifdef USE_INSTANCING
    sp = ( instanceMatrix * vec4( sp, 1.0 ) ).xyz;
    sn = mat3( instanceMatrix ) * sn;
  #endif
  vSurfP = sp / uSurfTile;
  vSurfN = sn;
}
`;
const FRAG_DECL = /* glsl */ `
uniform sampler2D uSurfMap;
uniform float uSurfTile;
uniform vec4 uSurfVary; // anti-tiling on, step u, step v, macro amount
float surfHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float surfNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( surfHash( i ), surfHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( surfHash( i + vec2( 0.0, 1.0 ) ), surfHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
vec2 surfShift( float i ) {
  vec2 o = sin( vec2( 3.0, 7.0 ) * i ) * 2.0;
  if ( uSurfVary.y > 0.0 ) o.x = floor( o.x / uSurfVary.y + 0.5 ) * uSurfVary.y;
  if ( uSurfVary.z > 0.0 ) o.y = floor( o.y / uSurfVary.z + 0.5 ) * uSurfVary.z;
  return o;
}
// A texture lookup without visible repeats (after Inigo Quilez, "texture repetition", method 3).
vec4 surfTex( sampler2D s, vec2 uv ) {
  if ( uSurfVary.x < 0.5 ) return texture2D( s, uv );
  float k = surfNoise( uv * 0.45 ) * 7.0;
  float ia = floor( k );
  float f = smoothstep( 0.25, 0.75, fract( k ) );
  vec2 dx = dFdx( uv );
  vec2 dy = dFdy( uv );
  vec4 a = textureGrad( s, uv + surfShift( ia ), dx, dy );
  vec4 b = textureGrad( s, uv + surfShift( ia + 1.0 ), dx, dy );
  return mix( a, b, f );
}
uniform vec4 uSurfAmt; // tone, rough, cavity, bump
uniform vec2 uSurfFade;
varying vec3 vSurfP;
varying vec3 vSurfN;
vec4 surfSample( vec3 p, vec3 n ) {
  vec3 w = pow( abs( normalize( n ) ), vec3( 4.0 ) );
  w /= ( w.x + w.y + w.z + 1e-5 );
  return texture2D( uSurfMap, p.zy ) * w.x + texture2D( uSurfMap, p.xz ) * w.y + texture2D( uSurfMap, p.xy ) * w.z;
}
vec3 surfPerturb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir ) {
  vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
  vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
  vec3 R1 = cross( vSigmaY, surf_norm );
  vec3 R2 = cross( surf_norm, vSigmaX );
  float fDet = dot( vSigmaX, R1 ) * faceDir;
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( fDet ) * surf_norm - vGrad );
}
`;

/** A three.js chunk with its own map lookups going through surfTex (anti-tiling). */
function untiled(chunk: string, sampler: string, uv: string): string {
  const src = (THREE.ShaderChunk as unknown as Record<string, string>)[chunk];
  const from = `texture2D( ${sampler}, ${uv} )`;
  return src.includes(from) ? src.split(from).join(`surfTex( ${sampler}, ${uv} )`) : `#include <${chunk}>`;
}

function patch(shader: THREE.WebGLProgramParametersWithUniforms, u: Record<string, THREE.IUniform>): void {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
  shader.fragmentShader = FRAG_DECL + shader.fragmentShader
    .replace(
      '#include <map_fragment>',
      `${untiled('map_fragment', 'map', 'vMapUv')}
      {
        // Soft weathering patches in world space (never repeat).
        vec3 surfW = vSurfP * uSurfTile;
        float surfM = surfNoise( surfW.xz / 23.0 + surfW.y / 31.0 ) * 0.65 + surfNoise( surfW.xz / 6.5 + surfW.y / 9.0 + 17.0 ) * 0.35;
        diffuseColor.rgb *= 1.0 + ( surfM - 0.5 ) * 2.0 * uSurfVary.w;
      }
      vec4 surfD = surfSample( vSurfP, vSurfN );
      float surfFade = 1.0 - smoothstep( uSurfFade.x, uSurfFade.y, length( vViewPosition ) );
      diffuseColor.rgb *= mix( 1.0, ( 1.0 + ( surfD.r - 0.5 ) * 2.0 * uSurfAmt.x ) * mix( 1.0, surfD.b, uSurfAmt.z ), surfFade );`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp( roughnessFactor * mix( 1.0, 0.5 + surfD.g, uSurfAmt.y * surfFade ), 0.03, 1.0 );`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        vec2 surfDH = vec2( dFdx( surfD.a ), dFdy( surfD.a ) ) * uSurfAmt.w * surfFade;
        normal = surfPerturb( - vViewPosition, normal, surfDH, faceDirection );
      }`,
    )
    // The material's own maps without repeats (after the surface hooks above are in place).
    .replace('#include <roughnessmap_fragment>', untiled('roughnessmap_fragment', 'roughnessMap', 'vRoughnessMapUv'))
    .replace('#include <metalnessmap_fragment>', untiled('metalnessmap_fragment', 'metalnessMap', 'vMetalnessMapUv'))
    .replace('#include <normal_fragment_maps>', untiled('normal_fragment_maps', 'normalMap', 'vNormalMapUv'));
}

/**
 * Adds surface detail of `kind` to a material (returns the same material). Calling it again
 * changes the kind/tuning. Glowing, transparent glass-like materials are better left alone.
 */
export function withSurface<T extends THREE.MeshStandardMaterial>(mat: T, kind: SurfaceKind, o: SurfaceOptions = {}): T {
  const t = SURFACE_TUNING[kind];
  const k = SURFACE_DETAIL.strength;
  const uniforms: Record<string, THREE.IUniform> = {
    uSurfMap: { value: surfaceTexture(kind) },
    uSurfTile: { value: o.tile ?? t.tile },
    uSurfAmt: { value: new THREE.Vector4(t.tone * (o.tone ?? 1) * k, t.rough * (o.rough ?? 1) * k, t.cavity * (o.cavity ?? 1) * k, t.bump * (o.bump ?? 1) * k) },
    uSurfFade: { value: new THREE.Vector2(...(o.fade ?? [25, 70])) },
    uSurfVary: { value: new THREE.Vector4(o.antiTile && SURFACE_DETAIL.antiTile ? 1 : 0, o.antiTile?.step?.[0] ?? 0, o.antiTile?.step?.[1] ?? 0, (o.macro ?? 0) * k) },
  };
  mat.userData.surface = { kind, options: o }; // (plain data: userData is JSON-copied on clone)
  surfaceUniforms.set(mat, uniforms);
  mat.onBeforeCompile = (shader) => patch(shader, uniforms);
  // Same program for every kind (only uniforms differ), separate from unpatched materials.
  mat.customProgramCacheKey = () => 'surface-v2';
  mat.needsUpdate = true;
  return mat;
}

/** Copies the surface of `from` onto `to` (for materials rebuilt from a template, e.g. crowds). */
export function copySurface<T extends THREE.MeshStandardMaterial>(to: T, from: THREE.Material): T {
  const s = from.userData?.surface as { kind: SurfaceKind; options: SurfaceOptions } | undefined;
  return s ? withSurface(to, s.kind, s.options) : to;
}

/** The surface kind a material was given, if any. */
export function surfaceOf(mat: THREE.Material): SurfaceKind | null {
  return (mat.userData?.surface?.kind as SurfaceKind | undefined) ?? null;
}
