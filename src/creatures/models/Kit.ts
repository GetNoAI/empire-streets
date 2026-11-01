import * as THREE from 'three';
import type { Palette } from '../Data';
import { GLOW, chamferBox, chamferCylinder, countTriangles, crevice, gradient, type Proxy, type Role } from './Polish';
import type { CellStyle, SurfaceClass } from './Atlas';
import { atlasTextures } from './AtlasTextures';
import { cullHidden, mergeCoplanar, partStyle, triangleCell, triangleTangent, unwrapTriangle, type CullPart, type Shape, type UnwrapInfo } from './Unwrap';
import { ATTACK_CLIPS, ATTACK_STYLES, CLIP_FPS, addPose, defaultPose, rigInfo, type Flavour, type MotionCtx } from './Motion';

/**
 * Model kit for the procedural Streetmon models.
 *
 * Builders add primitives (box, sphere, cylinder, cone, torus, capsule) to named rig nodes
 * ("root > body > head, arm_L, ..."). `build()` then:
 *  - scales everything so the model is exactly the species' height (origin at the feet, facing +Z, Y up),
 *  - bevels boxes and cylinders (chamfered edges catch rim light), adds joint and eye-socket detail,
 *    and keeps the model inside its triangle budget by dropping the least visible polish first,
 *  - dissolves redundant geometry (over-triangulated flat caps, faces buried inside other parts),
 *  - bakes flat (faceted) normals and per-vertex colours (palette, ground gradient, crevice AO),
 *  - unwraps every triangle onto the shared texture atlas (Atlas.ts): a surface class per part
 *    (metal, armour, fabric, concrete, ...) and a style per face (gradient, edge wear, rust, grime),
 *    with tangents for the shared normal map,
 *  - textures every material with the atlas: colour, normal, and packed AO/roughness/metalness,
 *  - articulates the limbs: every arm, leg, wing and single-piece tail gets a second joint
 *    (elbow, knee, wing tip, tail tip: `<node>_lo` / `<node>_tip`); parts past the joint move to it
 *    and parts across it are sliced at the joint and soft-skinned to both bones, so they bend,
 *  - merges all parts into ONE mesh per material (solid / translucent / each glow colour / aura),
 *    skinned to the node bones (weight 1 to its node, blended across joints), so every node can be
 *    animated while the model stays at a handful of draw calls,
 *  - generates the animation clips at CLIP_FPS (idle, walk, attack, hurt, faint, evolve_glow, and
 *    one attack per style: attack_strike, _slam, _shoot, _throw, _blast, _power, _taunt) from the
 *    motion library (Motion.ts) plus any builder overrides.
 */

export type MatKind = 'solid' | 'glass' | 'glow';

export interface PartOpts {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** solid (default), glass (translucent), glow (emissive, uses `color` as the light colour). */
  mat?: MatKind;
  /** Edge chamfer for boxes and cylinders: a fraction of the smallest dimension (default: the type's), or false. */
  bevel?: number | false;
  /** Atlas surface class (default: from the species' types and the part's palette colour). */
  surface?: SurfaceClass;
}

interface Part {
  geo: THREE.BufferGeometry;
  color: THREE.Color;
  node: string;
  mat: MatKind;
  /** The part's transform (builder space) and the bounds of its untransformed shape (for AO). */
  m: THREE.Matrix4;
  local: THREE.Box3;
  /** For bevelled parts: the plain (un-chamfered) version, used if the model runs over budget. */
  plain?: THREE.BufferGeometry;
  /** Optional polish (joint caps, eye sockets): dropped first if over budget. */
  extra?: boolean;
  /** Rough size (for picking which polish to drop first). */
  size: number;
  /** Convex shape in its own space (hidden-face culling). */
  shape: Shape;
  /** Which faces are bevel edges while the chamfered geometry is used. */
  edges: 'box' | 'cylinder' | null;
  /** Explicit atlas surface (else from the style's role map). */
  surface?: SurfaceClass;
  /** Spans a joint: vertices blend from `node` to `node2` along the limb (see planJoints()). */
  joint?: Joint;
  /** Before it was sliced at its joint (put back if the joint slices would break the budget). */
  unsliced?: { geo: THREE.BufferGeometry; plain?: THREE.BufferGeometry };
}

/** A limb joint: t = (v - origin) . axis / len; weight on the far bone ramps over t0..t1. */
interface Joint {
  node2: string;
  origin: THREE.Vector3;
  axis: THREE.Vector3;
  len: number;
  t0: number;
  t1: number;
}

interface NodeDef {
  name: string;
  parent: string | null;
  /** Pivot in model space (builder units until build() rescales). */
  pivot: THREE.Vector3;
  /** Rest scale (the aura starts collapsed). */
  restScale: number;
}

/** Per-bone animation offsets at time t (seconds) within a clip. */
export interface Pose {
  rot?: [number, number, number];
  pos?: [number, number, number];
  scale?: number | [number, number, number];
}

export type ClipName = 'idle' | 'walk' | 'attack' | 'hurt' | 'faint' | 'evolve_glow' | `attack_${(typeof ATTACK_STYLES)[number]}`;
export const CLIPS: Array<{ name: ClipName; duration: number; loop: boolean }> = [
  { name: 'idle', duration: 2, loop: true },
  { name: 'walk', duration: 1, loop: true },
  // The all-purpose attack (overworld bites, followers at work); battles use the styled ones.
  { name: 'attack', duration: 0.6, loop: false },
  { name: 'hurt', duration: 0.45, loop: false },
  { name: 'faint', duration: 1.1, loop: false },
  { name: 'evolve_glow', duration: 1, loop: true },
  ...ATTACK_STYLES.map((st) => ({ name: `attack_${st}` as ClipName, duration: ATTACK_CLIPS[st].duration, loop: false })),
];

/** Custom motion for a node: return offsets for a clip at time t (0..duration), or null for the default. */
export type Motion = (clip: ClipName | string, t: number, dur: number, H: number) => Pose | null;

export interface BuiltModel {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  triangles: number;
  drawCalls: number;
  height: number;
  bbox: THREE.Box3;
  nodes: string[];
  /** What the geometry passes did: bevelled parts kept, parts reverted to plain, polish parts cut,
   *  triangles saved by merging flat caps and by dropping hidden faces. */
  polish: PolishReport;
  /** Surface classes used per palette role, and the edge bevel. */
  surface: { classes: Record<Role, SurfaceClass>; bevel: number };
  /** Triangles per atlas style (how much gradient, wear, rust, grime ... the model uses). */
  cells: Partial<Record<CellStyle, number>>;
}

export interface PolishReport {
  bevelled: number;
  plain: number;
  extrasDropped: number;
  coplanarSaved: number;
  hiddenCulled: number;
}

export interface Style {
  /** Gun: metallic; Concrete: matte; etc. */
  roughness: number;
  metalness: number;
  /** Opacity of translucent parts. */
  glassOpacity: number;
  /** Floating creature (no legs): bigger idle bob, no leg swing. */
  floating: boolean;
  /** Animation amplitude multiplier. */
  energy: number;
  /** Edge chamfer, fraction of a part's smallest dimension (0 = none). */
  bevel: number;
  /** Atlas surface class for each palette role (from the species' types). */
  surfaces: Record<Role, SurfaceClass>;
  /** How it moves (its types): see Motion.ts FLAVOUR. */
  flavour: Flavour;
  flavour2?: Flavour;
}

const DEFAULT_SURFACES: Record<Role, SurfaceClass> = { primary: 'armor', secondary: 'metal', accent: 'gloss', dark: 'rubber', white: 'gloss', eye: 'glow' };

/** Triangle budget for the parts (the evolve aura adds 80 on top; the cap per model is 1,500). */
export const POLISH = {
  triBudget: 1410,
  /** Parts thinner than this (builder units) aren't worth a bevel. */
  minBevelSize: 0.035,
  /** Chest broadening (the body's biggest part, across). */
  chest: 1.07,
  /** Spikes: narrower and longer. */
  spikeRadius: 0.86,
  spikeLength: 1.15,
  /** Speaker rings and hoops: thicker tube. */
  ringTube: 1.22,
} as const;

const TAU = Math.PI * 2;

export class Kit {
  readonly parts: Part[] = [];
  readonly nodes = new Map<string, NodeDef>();
  readonly motions = new Map<string, Motion>();
  /** Builder-specific extra clips (e.g. Curbstone's curled-up idle). */
  readonly extraClips: Array<{ name: string; duration: number; loop: boolean }> = [];
  readonly style: Style;
  readonly c: { primary: THREE.Color; secondary: THREE.Color; accent: THREE.Color; eye: THREE.Color; dark: THREE.Color; white: THREE.Color };

  constructor(
    readonly id: string,
    readonly palette: Palette,
    style: Partial<Style> = {},
  ) {
    this.style = { roughness: 0.7, metalness: 0.05, glassOpacity: 0.6, floating: false, energy: 1, bevel: 0.12, surfaces: DEFAULT_SURFACES, flavour: 'concrete', ...style };
    this.c = {
      primary: new THREE.Color(palette.primary),
      secondary: new THREE.Color(palette.secondary),
      accent: new THREE.Color(palette.accent),
      eye: new THREE.Color(palette.eye),
      dark: new THREE.Color('#141416'),
      white: new THREE.Color('#f2f2ee'),
    };
    this.nodes.set('root', { name: 'root', parent: null, pivot: new THREE.Vector3(), restScale: 1 });
  }

  // ------------------------------------------------------------------ rig

  /** Declares a rig node with its pivot (model space). */
  node(name: string, parent: string, x: number, y: number, z: number, restScale = 1): string {
    if (!this.nodes.has(parent)) throw new Error(`${this.id}: parent node "${parent}" not declared before "${name}"`);
    this.nodes.set(name, { name, parent, pivot: new THREE.Vector3(x, y, z), restScale });
    return name;
  }

  has(name: string): boolean {
    return this.nodes.has(name);
  }

  /** Custom animation for a node (overrides/extends the default motion by name). */
  motion(node: string, m: Motion): void {
    this.motions.set(node, m);
  }

  // ------------------------------------------------------------------ primitives

  private add(
    geo: THREE.BufferGeometry,
    color: THREE.Color | string,
    node: string,
    o: PartOpts,
    plain?: THREE.BufferGeometry,
    extra = false,
    shape: Shape = { kind: 'other' },
    edges: 'box' | 'cylinder' | null = null,
  ): void {
    if (!this.nodes.has(node)) throw new Error(`${this.id}: node "${node}" not declared`);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(o.x ?? 0, o.y ?? 0, o.z ?? 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)),
      new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1),
    );
    geo.computeBoundingBox();
    const local = geo.boundingBox!.clone();
    const sz = local.getSize(new THREE.Vector3());
    const size = sz.x * Math.abs(o.sx ?? 1) * sz.y * Math.abs(o.sy ?? 1) * sz.z * Math.abs(o.sz ?? 1);
    geo.applyMatrix4(m);
    plain?.applyMatrix4(m);
    this.parts.push({ geo, plain, color: typeof color === 'string' ? new THREE.Color(color) : color.clone(), node, mat: o.mat ?? 'solid', m, local, size, extra, shape, edges: plain ? edges : null, surface: o.surface });
  }

  /** Chamfer size for a part with smallest dimension `minDim` (0 = no bevel). */
  private chamfer(minDim: number, o: PartOpts): number {
    if (o.bevel === false || o.mat === 'glow') return 0;
    const f = o.bevel ?? this.style.bevel;
    if (f <= 0 || minDim < POLISH.minBevelSize) return 0;
    return f * minDim;
  }

  box(node: string, w: number, h: number, d: number, color: THREE.Color | string, o: PartOpts = {}): void {
    const c = this.chamfer(Math.min(w, h, d), o);
    const shape: Shape = { kind: 'box', hx: w / 2, hy: h / 2, hz: d / 2, c };
    if (c > 0) this.add(chamferBox(w, h, d, c), color, node, o, new THREE.BoxGeometry(w, h, d), false, shape, 'box');
    else this.add(new THREE.BoxGeometry(w, h, d), color, node, o, undefined, false, shape);
  }

  /** An armour plate or slab: a box with a heavier chamfer. */
  slab(node: string, w: number, h: number, d: number, color: THREE.Color | string, o: PartOpts = {}): void {
    this.box(node, w, h, d, color, { bevel: Math.max(0.2, (o.bevel || 0) as number, this.style.bevel * 1.6), surface: 'armor', ...o });
  }

  sphere(node: string, r: number, color: THREE.Color | string, o: PartOpts = {}, segs = 8): void {
    const rings = Math.max(4, Math.round(segs * 0.75));
    this.add(new THREE.SphereGeometry(r, segs, rings), color, node, o, undefined, false, { kind: 'sphere', r, segs, rings });
  }

  /** Upright cylinder (along Y), centred on its position. */
  cylinder(node: string, rTop: number, rBot: number, h: number, color: THREE.Color | string, o: PartOpts = {}, segs = 8): void {
    const c = this.chamfer(Math.min(h, 2 * Math.max(rTop, rBot)), o);
    const shape: Shape = { kind: 'cylinder', rTop, rBot, h, c, segs };
    if (c > 0 && Math.max(rTop, rBot) > POLISH.minBevelSize) this.add(chamferCylinder(rTop, rBot, h, c, segs), color, node, o, new THREE.CylinderGeometry(rTop, rBot, h, segs), false, shape, 'cylinder');
    else this.add(new THREE.CylinderGeometry(rTop, rBot, h, segs), color, node, o, undefined, false, { ...shape, c: 0 });
  }

  /** Cones (spikes, horns, beaks): solid ones are made a little sharper and longer. */
  cone(node: string, r: number, h: number, color: THREE.Color | string, o: PartOpts = {}, segs = 8): void {
    const sharp = (o.mat ?? 'solid') === 'solid';
    const rr = sharp ? r * POLISH.spikeRadius : r;
    const hh = sharp ? h * POLISH.spikeLength : h;
    // Keep the cone's base where it was: lengthen toward the tip (+Y before rotation).
    const geo = new THREE.ConeGeometry(rr, hh, segs);
    if (sharp) geo.translate(0, (hh - h) / 2, 0);
    // Spikes and horns read as armour unless a builder says otherwise.
    this.add(geo, color, node, sharp && !o.surface ? { ...o, surface: 'armor' } : o);
  }

  /** Torus in the XY plane (faces +Z) unless rotated. Solid rings get a thicker, deeper tube. */
  torus(node: string, R: number, r: number, color: THREE.Color | string, o: PartOpts = {}, segs = 12, arc = Math.PI * 2): void {
    const tube = (o.mat ?? 'solid') === 'solid' ? r * POLISH.ringTube : r;
    this.add(new THREE.TorusGeometry(R, tube, 5, segs, arc), color, node, o);
  }

  capsule(node: string, r: number, len: number, color: THREE.Color | string, o: PartOpts = {}): void {
    this.add(new THREE.CapsuleGeometry(r, len, 2, 8), color, node, o);
  }

  /** Runs `fn` for the left (+1, "L") and right (-1, "R") side: symmetric limbs. */
  mirror(fn: (s: 1 | -1, side: 'L' | 'R') => void): void {
    fn(1, 'L');
    fn(-1, 'R');
  }

  /** Eyes on a node. `slit`: glowing bars; `round`: white + dark pupil; `glow`: glowing balls; `cone`: glowing cones. */
  addEyes(node: string, style: 'slit' | 'round' | 'glow' | 'cone', at: { y: number; z: number; spacing: number; size: number; x?: number }): void {
    this.mirror((s) => {
      const x = (at.x ?? 0) + (s * at.spacing) / 2;
      // A dark recess behind each eye: deeper-set eyes read better at a distance.
      const socket = new THREE.SphereGeometry(at.size * (style === 'slit' ? 1.05 : 1.3), 6, 4);
      this.add(socket, this.c.dark, node, { x, y: at.y, z: at.z - at.size * 0.42, sx: style === 'slit' ? 1.7 : 1, sy: style === 'slit' ? 0.75 : 1, sz: 0.55, rz: style === 'slit' ? -s * 0.15 : 0 }, undefined, true);
      if (style === 'slit') this.box(node, at.size * 1.6, at.size * 0.45, at.size * 0.3, this.c.eye, { x, y: at.y, z: at.z, rz: -s * 0.15, mat: 'glow' });
      else if (style === 'round') {
        this.sphere(node, at.size, this.c.white, { x, y: at.y, z: at.z }, 8);
        this.sphere(node, at.size * 0.5, this.c.dark, { x, y: at.y, z: at.z + at.size * 0.7 }, 6);
        // A small emissive catchlight in the eye colour, so cartoon eyes glint and pulse too.
        this.add(new THREE.SphereGeometry(at.size * 0.2, 4, 3), this.c.eye, node, { x: x + s * at.size * 0.15, y: at.y + at.size * 0.18, z: at.z + at.size * 0.98, mat: 'glow' });
      } else if (style === 'glow') this.sphere(node, at.size, this.c.eye, { x, y: at.y, z: at.z, mat: 'glow' }, 6);
      else this.cone(node, at.size, at.size * 1.6, this.c.eye, { x, y: at.y, z: at.z, rx: Math.PI / 2, mat: 'glow' }, 6);
    });
  }

  // ------------------------------------------------------------------ build

  /**
   * Proportion polish applied to every builder: a broader chest (the body's biggest part) and
   * thicker joints (a cap at each limb's pivot, coloured like the limb, a shade darker).
   */
  private proportions(): void {
    const body = this.parts.filter((p) => p.node === 'body' && p.mat === 'solid').sort((a, b) => b.size - a.size)[0];
    if (body) {
      const c = new THREE.Box3().setFromBufferAttribute(body.geo.getAttribute('position') as THREE.BufferAttribute).getCenter(new THREE.Vector3());
      const widen = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeScale(POLISH.chest, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
      body.geo.applyMatrix4(widen);
      body.plain?.applyMatrix4(widen);
      body.m.premultiply(widen);
    }
    for (const n of this.nodes.values()) {
      if (!/^(arm|leg)_/.test(n.name)) continue;
      const parts = this.parts.filter((p) => p.node === n.name && p.mat === 'solid' && !p.extra);
      if (!parts.length) continue;
      // The part nearest the pivot sets the joint's size and colour.
      let best = parts[0];
      let bestD = Infinity;
      const tmp = new THREE.Vector3();
      for (const p of parts) {
        const bb = new THREE.Box3().setFromBufferAttribute(p.geo.getAttribute('position') as THREE.BufferAttribute);
        const d = bb.distanceToPoint(n.pivot);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
        void tmp;
      }
      const bb = new THREE.Box3().setFromBufferAttribute(best.geo.getAttribute('position') as THREE.BufferAttribute);
      const sz = bb.getSize(new THREE.Vector3());
      const r = Math.min(sz.x, sz.z, sz.y) * 0.62;
      if (r < 0.02 || bestD > r * 2) continue;
      const col = best.color.clone().multiplyScalar(0.82);
      this.add(new THREE.SphereGeometry(r, 6, 4), col, n.name, { x: n.pivot.x, y: n.pivot.y, z: n.pivot.z }, undefined, true);
    }
  }

  /**
   * Keeps the parts inside the triangle budget: first un-bevels the smallest bevelled parts, then
   * drops the optional polish (joint caps, eye sockets), then un-bevels the rest.
   */
  private fitBudget(): { triangles: number; bevelled: number; plain: number; extrasDropped: number } {
    const tris = (p: Part): number => countTriangles(p.geo);
    let total = this.parts.reduce((a, p) => a + tris(p), 0);
    let plainN = 0;
    let dropped = 0;
    const bevelled = this.parts.filter((p) => p.plain).sort((a, b) => a.size - b.size);
    // Pass 1: small bevelled parts (up to the smallest 60%).
    const smallCut = Math.floor(bevelled.length * 0.6);
    for (let i = 0; i < smallCut && total > POLISH.triBudget; i++) {
      const p = bevelled[i];
      total -= tris(p) - countTriangles(p.plain!);
      p.geo = p.plain!;
      p.plain = undefined;
      plainN++;
    }
    // Pass 2: optional polish, smallest first.
    const extras = this.parts.filter((p) => p.extra).sort((a, b) => a.size - b.size);
    for (const p of extras) {
      if (total <= POLISH.triBudget) break;
      total -= tris(p);
      this.parts.splice(this.parts.indexOf(p), 1);
      dropped++;
    }
    // Pass 3: the remaining bevels.
    for (const p of bevelled) {
      if (total <= POLISH.triBudget) break;
      if (!p.plain) continue;
      total -= tris(p) - countTriangles(p.plain);
      p.geo = p.plain;
      p.plain = undefined;
      plainN++;
    }
    return { triangles: total, bevelled: this.parts.filter((p) => p.plain).length, plain: plainN, extrasDropped: dropped };
  }

  /**
   * Dissolves redundant geometry before the budget is fitted: flat caps made of more triangles
   * than they need are re-fanned, and triangles buried inside another opaque part on the same rig
   * node (which can never be seen) are dropped. Both the bevelled and the plain version of each
   * part are processed, so the budget fitter sees the real costs.
   */
  private dissolve(): { coplanarSaved: number; hiddenCulled: number } {
    let coplanarSaved = 0;
    for (const p of this.parts) {
      const a = mergeCoplanar(p.geo);
      p.geo = a.geo;
      coplanarSaved += a.saved;
      if (p.plain) {
        const b = mergeCoplanar(p.plain);
        p.plain = b.geo;
      }
    }
    const occluder = (p: Part): Omit<CullPart, 'geo' | 'cullable'> => ({ node: p.node, opaque: p.mat === 'solid', shape: p.shape, inv: p.m.clone().invert() });
    const live: CullPart[] = this.parts.map((p) => ({ ...occluder(p), geo: p.geo, cullable: p.mat !== 'glow' }));
    const removed = cullHidden(live);
    live.forEach((c, i) => (this.parts[i].geo = c.geo));
    const alt: CullPart[] = this.parts.map((p) => ({ ...occluder(p), geo: p.plain ?? p.geo, cullable: !!p.plain && p.mat !== 'glow' }));
    cullHidden(alt);
    alt.forEach((c, i) => {
      if (this.parts[i].plain) this.parts[i].plain = c.geo;
    });
    return { coplanarSaved, hiddenCulled: removed.reduce((x, y) => x + y, 0) };
  }

  /** What the last build did (for the build log). */
  polishReport: PolishReport = { bevelled: 0, plain: 0, extrasDropped: 0, coplanarSaved: 0, hiddenCulled: 0 };

  /** The palette role a colour comes from (builders pass palette colours, sometimes shaded). */
  private role(c: THREE.Color): Role {
    let best: Role = 'primary';
    let bestD = Infinity;
    for (const r of ['primary', 'secondary', 'accent', 'dark', 'white', 'eye'] as const) {
      const p = this.c[r];
      // Compare chroma direction and lightness separately: a darkened primary is still primary.
      const d = (c.r - p.r) ** 2 + (c.g - p.g) ** 2 + (c.b - p.b) ** 2;
      const pl = p.r + p.g + p.b;
      const cl = c.r + c.g + c.b;
      const k = pl > 1e-3 ? cl / pl : 1;
      const dScaled = (c.r - p.r * k) ** 2 + (c.g - p.g * k) ** 2 + (c.b - p.b * k) ** 2 + 0.05 * (1 - Math.min(1, k)) ** 2;
      const dd = Math.min(d, dScaled);
      if (dd < bestD) {
        bestD = dd;
        best = r;
      }
    }
    return best;
  }

  private surfaceOf(p: Part): SurfaceClass {
    if (p.mat === 'glow') return 'glow';
    return p.surface ?? this.style.surfaces[this.role(p.color)];
  }

  // ------------------------------------------------------------------ articulation

  /**
   * Gives every limb a second joint: arms an elbow (`arm_L_lo`), legs a knee (`leg_FL_lo`), wings
   * a tip (`wing_L_tip`) and a one-piece tail a tip (`tail_lo`), halfway from the pivot to the
   * limb's far end. Parts entirely past the joint (hands, feet, paws, claws, wing tips) move to the
   * new bone; parts across it are marked to be sliced at the joint and blended (sliceJoints()), so
   * a one-piece leg bends at the knee instead of swinging like a plank.
   */
  private planJoints(): void {
    const parents = new Set([...this.nodes.values()].map((n) => n.parent));
    const tmp = new THREE.Vector3();
    for (const n of [...this.nodes.values()]) {
      const limb = /^(arm|leg)_[A-Z0-9]+$/.test(n.name);
      const wing = /^wing_[LR]$/.test(n.name);
      const tail = n.name === 'tail';
      if ((!limb && !wing && !tail) || parents.has(n.name)) continue;
      const parts = this.parts.filter((p) => p.node === n.name);
      if (!parts.length) continue;
      // The far end: the vertex furthest from the pivot.
      let far = 0;
      const tipPt = new THREE.Vector3();
      for (const p of parts) {
        const a = p.geo.getAttribute('position');
        for (let i = 0; i < a.count; i++) {
          tmp.fromBufferAttribute(a, i);
          const d = tmp.distanceToSquared(n.pivot);
          if (d > far) {
            far = d;
            tipPt.copy(tmp);
          }
        }
      }
      const len = Math.sqrt(far);
      if (len < 0.04) continue;
      const axis = tipPt.clone().sub(n.pivot).normalize();
      const tj = wing ? 0.55 : 0.5;
      const child = `${n.name}${wing ? '_tip' : '_lo'}`;
      this.nodes.set(child, { name: child, parent: n.name, pivot: n.pivot.clone().addScaledVector(axis, len * tj), restScale: 1 });
      const band = 0.08;
      for (const p of parts) {
        let t0 = Infinity;
        let t1 = -Infinity;
        for (const g of [p.geo, p.plain]) {
          if (!g) continue;
          const a = g.getAttribute('position');
          for (let i = 0; i < a.count; i++) {
            const t = tmp.fromBufferAttribute(a, i).sub(n.pivot).dot(axis) / len;
            if (t < t0) t0 = t;
            if (t > t1) t1 = t;
          }
        }
        if (t0 >= tj - band) p.node = child;
        else if (t1 > tj + band) p.joint = { node2: child, origin: n.pivot.clone(), axis, len, t0: tj - 0.16, t1: tj + 0.16 };
      }
    }
  }

  /** Slices every joint-spanning part at its joint, so the bend has vertices to bend at. */
  private sliceJoints(): void {
    for (const p of this.parts) {
      if (!p.joint) continue;
      const j = p.joint;
      const d = ((j.t0 + j.t1) / 2) * j.len;
      p.unsliced = { geo: p.geo, plain: p.plain };
      p.geo = slicePlane(p.geo, j.origin, j.axis, d);
      if (p.plain) p.plain = slicePlane(p.plain, j.origin, j.axis, d);
    }
  }

  build(targetHeight: number): BuiltModel {
    this.proportions();
    this.planJoints();
    const dissolved = this.dissolve();
    this.sliceJoints();
    const fit = this.fitBudget();
    // Still over (a big model with lots of polish already cut): un-slice the joints, smallest
    // part first. They still bend (the blend weights stay), with fewer vertices to bend at.
    let total = this.parts.reduce((a, p) => a + countTriangles(p.geo), 0);
    for (const p of this.parts.filter((x) => x.unsliced).sort((a, b) => a.size - b.size)) {
      if (total <= POLISH.triBudget) break;
      const before = countTriangles(p.geo);
      const back = p.plain === undefined || p.geo === p.plain ? p.unsliced!.plain ?? p.unsliced!.geo : p.unsliced!.geo;
      p.geo = back;
      if (p.plain) p.plain = p.unsliced!.plain;
      total -= before - countTriangles(p.geo);
    }
    this.polishReport = { ...fit, ...dissolved };
    // The evolve_glow aura: a glowing shell around the body, collapsed at rest.
    const bodyPivot = this.nodes.get('body')?.pivot ?? new THREE.Vector3(0, 0.5, 0);
    // Uniform scale so the model is exactly targetHeight tall.
    const box = new THREE.Box3();
    for (const p of this.parts) {
      p.geo.computeBoundingBox();
      box.union(p.geo.boundingBox!);
    }
    const k = targetHeight / Math.max(1e-3, box.max.y - Math.min(0, box.min.y));
    const S = new THREE.Matrix4().makeScale(k, k, k);
    for (const p of this.parts) {
      p.geo.applyMatrix4(S);
      p.m.premultiply(S);
      if (!p.plain) p.edges = null; // reverted to plain: no bevel edges left to wear
      if (p.joint) {
        p.joint.origin.multiplyScalar(k);
        p.joint.len *= k;
      }
    }
    for (const n of this.nodes.values()) n.pivot.multiplyScalar(k);
    const H = targetHeight;
    // Aura node and shell (after scaling so the size is in metres).
    const auraR = H * 0.55;
    this.nodes.set('aura', { name: 'aura', parent: 'root', pivot: new THREE.Vector3(0, H * 0.5, 0), restScale: 0.001 });
    const aura = new THREE.IcosahedronGeometry(auraR, 1);
    aura.translate(0, H * 0.5, 0);
    void bodyPivot;

    // Bones.
    const order = [...this.nodes.keys()];
    const index = new Map(order.map((n, i) => [n, i]));
    const bones = new Map<string, THREE.Bone>();
    for (const n of order) {
      const def = this.nodes.get(n)!;
      const b = new THREE.Bone();
      b.name = n;
      const parentPivot = def.parent ? this.nodes.get(def.parent)!.pivot : new THREE.Vector3();
      b.position.copy(def.pivot).sub(parentPivot);
      b.scale.setScalar(def.restScale);
      bones.set(n, b);
    }
    for (const n of order) {
      const def = this.nodes.get(n)!;
      if (def.parent) bones.get(def.parent)!.add(bones.get(n)!);
    }
    const rootBone = bones.get('root')!;
    rootBone.updateMatrixWorld(true);

    // Merge parts by material.
    const groups = new Map<string, { kind: MatKind; color?: THREE.Color; parts: Part[] }>();
    for (const p of this.parts) {
      const key = p.mat === 'glow' ? `glow:${p.color.getHexString()}` : p.mat;
      if (!groups.has(key)) groups.set(key, { kind: p.mat, color: p.mat === 'glow' ? p.color : undefined, parts: [] });
      groups.get(key)!.parts.push(p);
    }
    const group = new THREE.Group();
    group.name = this.id;
    group.add(rootBone);
    // Bind-time: bones at rest. For the aura we need a collapsed rest pose but an un-collapsed bind,
    // so bind with all scales at 1, then collapse.
    for (const b of bones.values()) b.scale.setScalar(1);
    rootBone.updateMatrixWorld(true);
    const skeletonBones = order.map((n) => bones.get(n)!);
    const skeleton = new THREE.Skeleton(skeletonBones);
    let triangles = 0;
    const meshes: THREE.SkinnedMesh[] = [];
    // Occlusion proxies: every solid and translucent part as an oriented box.
    const proxies: Proxy[] = [];
    this.parts.forEach((p, i) => {
      if (p.mat === 'glow') return;
      const det = Math.abs(p.m.determinant());
      if (det < 1e-12) return;
      proxies.push({ inv: p.m.clone().invert(), box: p.local, scale: Math.cbrt(det), id: i });
    });
    const partId = new Map(this.parts.map((p, i) => [p, i]));
    // Atlas unwrap info per part (model space, after scaling).
    const unwrap = new Map<Part, UnwrapInfo>();
    this.parts.forEach((p, i) => {
      p.geo.computeBoundingBox();
      const pbox = p.geo.boundingBox!.clone();
      const ps = partStyle(pbox, H, p.mat === 'glow');
      unwrap.set(p, {
        surface: this.surfaceOf(p),
        style: ps.style,
        long: ps.long,
        box: pbox,
        normalToLocal: new THREE.Matrix3().setFromMatrix4(p.m).transpose(),
        edges: p.edges,
        seed: i + 1,
        H,
      });
    });
    const cells: Partial<Record<CellStyle, number>> = {};
    const makeMesh = (name: string, parts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color; node: string; mat?: MatKind; src?: Part; joint?: Joint }>, mat: THREE.Material, textured = true): void => {
      const geo = mergeFlat(
        parts.map((p) => ({
          geo: p.geo,
          color: p.color,
          bone: index.get(p.node)!,
          joint: (p.src ?? (p as Part)).joint ? { j: (p.src ?? (p as Part)).joint!, bone2: index.get((p.src ?? (p as Part)).joint!.node2)! } : null,
          // Solid parts get the ground gradient + crevice AO; translucent ones the gradient only; glow none.
          shade: p.mat === 'glow' || !p.mat ? null : { self: partId.get(p as Part) ?? -1, ao: p.mat === 'solid' },
          unwrap: textured ? unwrap.get(p.src ?? (p as Part)) ?? null : null,
        })),
        proxies,
        H,
        textured,
        cells,
      );
      triangles += geo.getAttribute('position').count / 3;
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.name = `${this.id}_${name}`;
      mesh.castShadow = true;
      group.add(mesh);
      mesh.bind(skeleton, new THREE.Matrix4());
      meshes.push(mesh);
    };
    const st = this.style;
    const T = atlasTextures();
    // Every surface reads the shared atlas: colour (tone x vertex colour), the micro-detail
    // normal map, and the packed ORM map (R occlusion, G roughness, B metalness; factors 1).
    const atlasMaps = { map: T.color, normalMap: T.normal, aoMap: T.orm, roughnessMap: T.orm, metalnessMap: T.orm, roughness: 1, metalness: 1 };
    let glowN = 0;
    for (const [key, g] of groups) {
      if (g.kind === 'solid') {
        makeMesh('body', g.parts, new THREE.MeshStandardMaterial({ name: `${this.id}_solid`, vertexColors: true, ...atlasMaps }));
      } else if (g.kind === 'glass') {
        makeMesh(
          'haze',
          g.parts,
          new THREE.MeshStandardMaterial({ name: `${this.id}_glass`, vertexColors: true, ...atlasMaps, transparent: true, opacity: st.glassOpacity, depthWrite: false }),
        );
      } else {
        const c = g.color!;
        // Eyes burn steady and bright; other accents (cores, rings, power lines) pulse harder.
        const isEye = c.getHex() === this.c.eye.getHex();
        const preset = isEye ? GLOW.eye : GLOW.accent;
        const gm = new THREE.MeshStandardMaterial({
          name: `${this.id}_glow_${key.slice(5)}`,
          color: c,
          emissive: c,
          emissiveMap: T.color, // the atlas glow-core cell: bright centre, softer rim
          emissiveIntensity: preset.intensity,
          ...atlasMaps,
        });
        // The game reads this (glTF extras) and pulses emissiveIntensity around the base value.
        gm.userData = { pulse: { hz: preset.pulseHz, amount: preset.amount, base: preset.intensity } };
        makeMesh(
          `glow${glowN++}`,
          g.parts.map((p) => ({ ...p, mat: 'glow' as MatKind, color: new THREE.Color(1, 1, 1), src: p })),
          gm,
        );
      }
    }
    // Aura mesh.
    const auraColor = this.c.eye.clone().lerp(new THREE.Color(1, 1, 1), 0.5);
    makeMesh(
      'aura',
      [{ geo: aura, color: new THREE.Color(1, 1, 1), node: 'aura', mat: 'glow' }],
      new THREE.MeshStandardMaterial({ name: `${this.id}_aura`, color: auraColor, emissive: auraColor, emissiveIntensity: 1.5, transparent: true, opacity: 0.35, depthWrite: false }),
      false,
    );
    // Rest pose (aura collapsed).
    for (const n of order) bones.get(n)!.scale.setScalar(this.nodes.get(n)!.restScale);
    rootBone.updateMatrixWorld(true);

    const bbox = new THREE.Box3();
    for (const m of meshes) {
      if (m.name.endsWith('_aura')) continue;
      m.geometry.computeBoundingBox();
      bbox.union(m.geometry.boundingBox!);
    }
    return {
      root: group,
      clips: this.makeClips(H, bones),
      triangles,
      drawCalls: meshes.length,
      height: H,
      bbox,
      nodes: order,
      polish: { ...this.polishReport },
      surface: { classes: { ...this.style.surfaces }, bevel: this.style.bevel },
      cells,
    };
  }

  // ------------------------------------------------------------------ animation

  private makeClips(H: number, bones: Map<string, THREE.Bone>): THREE.AnimationClip[] {
    const fps = CLIP_FPS;
    const out: THREE.AnimationClip[] = [];
    this.mctx = {
      H,
      energy: this.style.energy,
      floating: this.style.floating,
      flavour: this.style.flavour,
      flavour2: this.style.flavour2,
      rig: rigInfo(bones.keys()),
      restBodyY: this.nodes.get('body')?.pivot.y ?? H * 0.4,
    };
    for (const clip of [...CLIPS, ...this.extraClips]) {
      const frames = Math.round(clip.duration * fps);
      const tracks: THREE.KeyframeTrack[] = [];
      for (const [name, bone] of bones) {
        const restPos = bone.position.clone();
        const restScale = this.nodes.get(name)!.restScale;
        const times: number[] = [];
        const q: number[] = [];
        const pv: number[] = [];
        const sv: number[] = [];
        let anyRot = false;
        let anyPos = false;
        let anyScale = false;
        for (let f = 0; f <= frames; f++) {
          const t = (f / frames) * clip.duration;
          times.push(t);
          const pose = this.pose(name, clip.name, t, clip.duration, H) ?? {};
          const r = pose.rot ?? [0, 0, 0];
          const p = pose.pos ?? [0, 0, 0];
          const s = pose.scale === undefined ? [1, 1, 1] : typeof pose.scale === 'number' ? [pose.scale, pose.scale, pose.scale] : pose.scale;
          if (pose.rot) anyRot = true;
          if (pose.pos) anyPos = true;
          if (pose.scale !== undefined) anyScale = true;
          const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
          q.push(qq.x, qq.y, qq.z, qq.w);
          pv.push(restPos.x + p[0], restPos.y + p[1], restPos.z + p[2]);
          const base = name === 'aura' && clip.name !== 'evolve_glow' ? restScale : 1;
          sv.push(s[0] * base, s[1] * base, s[2] * base);
        }
        // Only keep tracks that actually move (or that must reset a pose another clip changes).
        const varies = (arr: number[], n: number): boolean => {
          for (let i = n; i < arr.length; i++) if (Math.abs(arr[i] - arr[i % n]) > 1e-5) return true;
          return false;
        };
        const offRest = (arr: number[], rest: number[]): boolean => arr.slice(0, rest.length).some((v, i) => Math.abs(v - rest[i]) > 1e-5);
        // Keys a straight line between their neighbours already gives are dropped (sampled at
        // CLIP_FPS, then thinned: the motion is the same, the files much smaller).
        if (anyRot && (varies(q, 4) || offRest(q, [0, 0, 0, 1]))) {
          const r = thinKeys(times, q, 4, 0.0012);
          tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, r.times, r.values));
        }
        if (anyPos && (varies(pv, 3) || offRest(pv, [restPos.x, restPos.y, restPos.z]))) {
          const r = thinKeys(times, pv, 3, H * 0.0008);
          tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, r.times, r.values));
        }
        if (anyScale && (varies(sv, 3) || offRest(sv, [restScale, restScale, restScale]))) {
          const r = thinKeys(times, sv, 3, 0.0015);
          tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, r.times, r.values));
        }
      }
      out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
    }
    return out;
  }

  private mctx: MotionCtx | null = null;

  /**
   * A node's pose: the motion library's default (Motion.ts), unless the builder gave the node its
   * own motion. Builder motions win for the everyday clips (idle, walk, hurt, faint, evolve) and
   * the all-purpose attack; on the styled attacks they're added on top of the library's motion
   * (at half strength), so a species keeps its quirks without losing the move's shape.
   */
  private pose(name: string, clip: ClipName | string, t: number, dur: number, H: number): Pose | null {
    const custom = this.motions.get(name);
    const ctx = this.mctx!;
    if (name === 'aura') {
      if (clip !== 'evolve_glow') return { scale: 1 };
      return { scale: 1 + 0.12 * Math.sin((t / dur) * TAU) };
    }
    if (name === 'root') {
      if (clip === 'evolve_glow') return { rot: [0, (t / dur) * TAU, 0], scale: 1 + 0.05 * Math.sin((t / dur) * TAU * 2) };
      return custom?.(clip, t, dur, H) ?? null;
    }
    const styled = clip.startsWith('attack_');
    if (custom) {
      const cp = custom(styled ? 'attack' : clip, t, dur, H);
      if (cp && !styled) return cp;
      if (cp && styled) return addPose(defaultPose(name, clip, t, dur, ctx), cp, 0.5);
    }
    return defaultPose(name, clip, t, dur, ctx);
  }
}

/**
 * Merges parts into one non-indexed geometry with flat normals, vertex colours and rigid skin weights.
 */
function mergeFlat(
  parts: Array<{ geo: THREE.BufferGeometry; color: THREE.Color; bone: number; joint: { j: Joint; bone2: number } | null; shade: { self: number; ao: boolean } | null; unwrap: UnwrapInfo | null }>,
  proxies: readonly Proxy[],
  H: number,
  textured: boolean,
  cells: Partial<Record<CellStyle, number>>,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const tans: number[] = [];
  let tri = 0;
  const col: number[] = [];
  const skinI: number[] = [];
  const skinW: number[] = [];
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const a = g.getAttribute('position');
    g.computeBoundingBox();
    const y0 = g.boundingBox!.min.y;
    const y1 = g.boundingBox!.max.y;
    // Shade each distinct vertex once (corners are shared by several triangles).
    const cache = new Map<string, number>();
    const shadeOf = (v: THREE.Vector3): number => {
      if (!p.shade) return 1;
      const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
      let f = cache.get(key);
      if (f === undefined) {
        f = gradient(v.y, y0, y1, H) * (p.shade.ao ? crevice(v, p.shade.self, proxies, H) : 1);
        cache.set(key, f);
      }
      return f;
    };
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    for (let i = 0; i + 2 < a.count; i += 3) {
      va.fromBufferAttribute(a, i);
      vb.fromBufferAttribute(a, i + 1);
      vc.fromBufferAttribute(a, i + 2);
      // Drop degenerate triangles (cone tips, sphere poles): they have no area and no normal.
      const fn = vb.clone().sub(va).cross(vc.clone().sub(va));
      if (fn.lengthSq() < 1e-14) continue;
      if (textured) {
        fn.normalize();
        const vs = [va.clone(), vb.clone(), vc.clone()];
        let uv: Array<[number, number]> = [
          [0, 0],
          [0, 0],
          [0, 0],
        ];
        if (p.unwrap) {
          const centroid = va.clone().add(vb).add(vc).multiplyScalar(1 / 3);
          const cell = triangleCell(p.unwrap, fn, centroid, tri);
          cells[cell.style] = (cells[cell.style] ?? 0) + 1;
          uv = unwrapTriangle(p.unwrap, vs, fn, cell);
        }
        const t4 = triangleTangent(vs, uv, fn);
        for (let k = 0; k < 3; k++) {
          uvs.push(uv[k][0], uv[k][1]);
          tans.push(t4[0], t4[1], t4[2], t4[3]);
        }
      }
      tri++;
      for (const v of [va, vb, vc]) {
        pos.push(v.x, v.y, v.z);
        const f = shadeOf(v);
        col.push(Math.min(1, p.color.r * f), Math.min(1, p.color.g * f), Math.min(1, p.color.b * f));
        if (p.joint) {
          const J = p.joint.j;
          const tt = (v.x - J.origin.x) * J.axis.x + (v.y - J.origin.y) * J.axis.y + (v.z - J.origin.z) * J.axis.z;
          const x = Math.min(1, Math.max(0, (tt / J.len - J.t0) / (J.t1 - J.t0)));
          const w = x * x * (3 - 2 * x);
          if (w <= 1e-4) {
            skinI.push(p.bone, 0, 0, 0);
            skinW.push(1, 0, 0, 0);
          } else if (w >= 1 - 1e-4) {
            skinI.push(p.joint.bone2, 0, 0, 0);
            skinW.push(1, 0, 0, 0);
          } else {
            skinI.push(p.bone, p.joint.bone2, 0, 0);
            skinW.push(1 - w, w, 0, 0);
          }
        } else {
          skinI.push(p.bone, 0, 0, 0);
          skinW.push(1, 0, 0, 0);
        }
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
  if (textured) {
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    out.setAttribute('tangent', new THREE.Float32BufferAttribute(tans, 4));
  }
  out.computeVertexNormals(); // non-indexed: each face gets its own normal = flat shading
  return out;
}

/** Shiny palette: hue rotated; near-greys get a tint so they visibly change too. */
export function shinyPalette(p: Palette): Palette {
  const shift = (hex: string, dh: number): string => {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    if (hsl.s < 0.12) {
      hsl.s = 0.3;
      hsl.h = 0.58; // cold steel blue
    } else hsl.h = (hsl.h + dh) % 1;
    c.setHSL(hsl.h, hsl.s, hsl.l);
    return `#${c.getHexString()}`;
  };
  return { primary: shift(p.primary, 0.42), secondary: shift(p.secondary, 0.42), accent: shift(p.accent, 0.5), eye: shift(p.eye, 0.5) };
}

/**
 * Cuts a mesh along the plane dot(v - origin, axis) = d: triangles across it are split (in
 * winding order) so the cut is a ring of real vertices. Returns position-only, non-indexed.
 */
export function slicePlane(geo: THREE.BufferGeometry, origin: THREE.Vector3, axis: THREE.Vector3, d: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const a = g.getAttribute('position');
  const out: number[] = [];
  const P: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const sd = (v: THREE.Vector3): number => (v.x - origin.x) * axis.x + (v.y - origin.y) * axis.y + (v.z - origin.z) * axis.z - d;
  const eps = 1e-6;
  const clip = (poly: THREE.Vector3[], keepAbove: boolean): THREE.Vector3[] => {
    const res: THREE.Vector3[] = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i];
      const B = poly[(i + 1) % poly.length];
      const da = sd(A) * (keepAbove ? 1 : -1);
      const db = sd(B) * (keepAbove ? 1 : -1);
      if (da >= -eps) res.push(A);
      if ((da > eps && db < -eps) || (da < -eps && db > eps)) res.push(A.clone().lerp(B, da / (da - db)));
    }
    return res;
  };
  const fan = (poly: THREE.Vector3[]): void => {
    for (let i = 1; i + 1 < poly.length; i++) for (const v of [poly[0], poly[i], poly[i + 1]]) out.push(v.x, v.y, v.z);
  };
  for (let i = 0; i + 2 < a.count; i += 3) {
    for (let k = 0; k < 3; k++) P[k].fromBufferAttribute(a, i + k);
    const s0 = sd(P[0]);
    const s1 = sd(P[1]);
    const s2 = sd(P[2]);
    const above = s0 > eps || s1 > eps || s2 > eps;
    const below = s0 < -eps || s1 < -eps || s2 < -eps;
    if (!(above && below)) {
      fan(P);
      continue;
    }
    const tri = P.map((v) => v.clone());
    fan(clip(tri, true));
    fan(clip(tri, false));
  }
  const res = new THREE.BufferGeometry();
  res.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return res;
}

/**
 * Drops keys that linear interpolation between the kept keys reproduces within `tol` (per
 * component). The first and last keys always stay, so loops still close.
 */
export function thinKeys(times: number[], values: number[], n: number, tol: number): { times: number[]; values: number[] } {
  const N = times.length;
  if (N <= 2) return { times, values };
  const keep = [0];
  let a = 0;
  const fits = (from: number, to: number): boolean => {
    for (let i = from + 1; i < to; i++) {
      const f = (times[i] - times[from]) / (times[to] - times[from]);
      for (let c = 0; c < n; c++) {
        const v = values[from * n + c] + (values[to * n + c] - values[from * n + c]) * f;
        if (Math.abs(v - values[i * n + c]) > tol) return false;
      }
    }
    return true;
  };
  for (let i = 2; i < N; i++) {
    if (!fits(a, i)) {
      keep.push(i - 1);
      a = i - 1;
    }
  }
  keep.push(N - 1);
  return { times: keep.map((i) => times[i]), values: keep.flatMap((i) => values.slice(i * n, i * n + n)) };
}
