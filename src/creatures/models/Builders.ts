import * as THREE from 'three';
import { ROOF_BUILDERS, ROOF_FLOATING } from './RoofBuilders';
import { SEWER_BUILDERS } from './SewerBuilders';
import { LEGEND_BUILDERS, LEGEND_FLOATING } from './LegendBuilders';
import { NEW_BUILDERS, NEW_FLOATING } from './NewBuilders';
import { POND_BUILDERS, POND_FLOATING } from './PondBuilders';
import type { Palette, SpeciesSpec } from '../Data';
import { Kit, shinyPalette, type BuiltModel, type Pose, type Style } from './Kit';
import { surfaceFor } from './Polish';

/**
 * Procedural low-poly models for every species. Each builder lays out parts in model space
 * (feet at y = 0, facing +Z) on named rig nodes; Kit.build() scales to the species' height,
 * merges by material and makes the clips. Per-type look: Gun angular/metal/orange, Concrete
 * blocky/matte/grey, Grind lean/bright with clock and money motifs, Smoke soft/translucent,
 * Bass round with glowing neon.
 *
 * Surfaces come from the species' types via Polish.surfaceFor: which texture-atlas surface class
 * (metal, armour, fabric, concrete, gloss, rubber, vent) each palette colour becomes, plus the edge
 * bevel; a builder can override a part with `surface`. TYPE_MOTION below only carries the
 * per-type animation energy and translucency.
 */

const PI = Math.PI;
const TAU = PI * 2;

type Builder = (k: Kit) => void;

const TYPE_MOTION: Record<string, Partial<Style>> = {
  grind: { energy: 1.2 },
  smoke: { glassOpacity: 0.55 },
  wire: { energy: 1.6 },
  sludge: { glassOpacity: 0.8 },
};

/** A looping value 0..1 over the clip (for spinning/rising things that must loop cleanly). */
const loop01 = (t: number, dur: number, cycles = 1): number => ((t / dur) * cycles) % 1;

// ------------------------------------------------------------------ GUN

/** Strapback line: hooded biped growing into an armoured case. */
function hooded(k: Kit, stage: 1 | 2 | 3): void {
  const c = k.c;
  const broad = stage === 1 ? 1 : stage === 2 ? 1.25 : 1.55;
  const hipY = 0.32 + (stage - 1) * 0.04;
  k.node('body', 'root', 0, hipY + 0.1, 0);
  k.node('head', 'body', 0, 0.66 + (stage - 1) * 0.05, 0);
  k.mirror((s, side) => {
    k.node(`arm_${side}`, 'body', s * 0.21 * broad, 0.6 + (stage - 1) * 0.03, 0);
    k.node(`leg_${side}`, 'body', s * 0.09 * broad, hipY, 0);
    // Legs and feet.
    k.box(`leg_${side}`, 0.1 * broad, hipY - 0.03, 0.12, c.secondary, { x: s * 0.09 * broad, y: (hipY - 0.03) / 2 + 0.03, surface: 'fabric' });
    k.box(`leg_${side}`, 0.12 * broad, 0.06, 0.18, c.dark, { x: s * 0.09 * broad, y: 0.03, z: 0.03 });
    // Arms; stage 3 gets heavy gauntlets.
    const ax = s * 0.22 * broad;
    k.box(`arm_${side}`, 0.08 * broad, 0.24, 0.09, c.primary, { x: ax, y: 0.5 + (stage - 1) * 0.02 });
    if (stage === 3) {
      k.box(`arm_${side}`, 0.16, 0.16, 0.16, c.primary, { x: ax, y: 0.36 });
      k.box(`arm_${side}`, 0.17, 0.04, 0.17, c.accent, { x: ax, y: 0.42 });
    } else {
      k.box(`arm_${side}`, 0.095 * broad, 0.035, 0.1, c.accent, { x: ax, y: 0.4 }); // orange tape band
      k.sphere(`arm_${side}`, 0.05 * broad, c.secondary, { x: ax, y: 0.35 }, 6);
    }
    // Shoulder plates (stage 2 metal, stage 3 concrete slabs).
    if (stage === 2) k.slab(`arm_${side}`, 0.14, 0.05, 0.14, c.primary, { x: ax, y: 0.64, rz: s * 0.25 });
    if (stage === 3) k.slab(`arm_${side}`, 0.24, 0.1, 0.22, c.secondary, { x: s * 0.3, y: 0.68, rz: s * 0.15 });
    // Hip holster pouches.
    if (stage >= 2) k.box('body', 0.07, 0.12, 0.12, stage === 3 ? c.secondary : c.secondary, { x: s * 0.19 * broad, y: hipY + 0.02, z: 0.02 });
  });
  // Torso.
  if (stage < 3) {
    k.box('body', 0.34 * broad, 0.3, 0.22 * (stage === 2 ? 1.15 : 1), c.primary, { y: 0.48, surface: 'fabric' }); // hoodie
    // Ribbed chest plate: stacked flat boxes.
    for (let i = 0; i < 3; i++) k.box('body', 0.27 * broad, 0.045, 0.04, c.secondary, { y: 0.42 + i * 0.065, z: 0.12 * (stage === 2 ? 1.15 : 1) });
  } else {
    // Case-like torso with a latch and a handle.
    k.box('body', 0.56, 0.42, 0.3, c.primary, { y: 0.52 });
    k.box('body', 0.57, 0.02, 0.31, c.dark, { y: 0.52 }); // seam
    k.box('body', 0.08, 0.07, 0.03, c.accent, { y: 0.55, z: 0.16 }); // latch
    k.box('body', 0.03, 0.05, 0.03, c.accent, { x: -0.18, y: 0.52, z: 0.16 });
    k.box('body', 0.03, 0.05, 0.03, c.accent, { x: 0.18, y: 0.52, z: 0.16 });
  }
  // Hood (taller each stage) over a dark, deep-set face with glowing slits; a thick brim frames it.
  const hy = 0.74 + (stage - 1) * 0.05;
  const hr = 0.15 * (stage === 3 ? 1.15 : 1);
  k.sphere('head', hr, c.primary, { y: hy + 0.01, z: -0.03, sx: 1.24, sy: 1.16 + (stage - 1) * 0.14, sz: 1.2, surface: 'fabric' }, 8);
  k.sphere('head', 0.11, c.dark, { y: hy - 0.02, z: 0.06, sz: 0.75 }, 8);
  k.torus('head', 0.115, 0.022, c.primary.clone().multiplyScalar(0.9), { y: hy - 0.005, z: 0.1, sy: 1.12, surface: 'fabric' }, 10, Math.PI * 1.25);
  if (stage >= 2) k.cone('head', 0.1, 0.14, c.primary, { y: hy + 0.17 + (stage - 2) * 0.03, z: -0.05, rx: -0.4 }, 6);
  k.addEyes('head', 'slit', { y: hy, z: 0.155, spacing: 0.1, size: 0.05 });
}

const BUILDERS: Record<string, Builder> = {
  strapback: (k) => hooded(k, 1),
  holster: (k) => hooded(k, 2),
  hardcase: (k) => hooded(k, 3),

  slugger: (k) => {
    const c = k.c; // primary brass, secondary black
    k.node('body', 'root', 0, 0.42, 0);
    k.node('head', 'body', 0, 0.5, 0.36);
    k.node('tail', 'body', 0, 0.48, -0.36);
    k.box('body', 0.42, 0.28, 0.66, c.secondary, { y: 0.44 });
    k.slab('body', 0.36, 0.06, 0.5, c.primary, { y: 0.6 }); // brass spine plate
    k.mirror((s, side) => {
      for (const [fb, z] of [['F', 0.22], ['B', -0.22]] as const) {
        const n = k.node(`leg_${fb}${side}`, 'body', s * 0.15, 0.32, z);
        k.box(n, 0.1, 0.3, 0.11, c.secondary, { x: s * 0.15, y: 0.16, z });
        k.box(n, 0.12, 0.04, 0.14, c.primary, { x: s * 0.15, y: 0.02, z: z + 0.02 });
      }
      // Revolver cylinders on the shoulders: brass drum with six dark chambers.
      const cx = s * 0.26;
      k.cylinder('body', 0.13, 0.13, 0.1, c.primary, { x: cx, y: 0.55, z: 0.18, rz: PI / 2 }, 10);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        k.cylinder('body', 0.025, 0.025, 0.105, c.dark, { x: cx + s * 0.003, y: 0.55 + Math.cos(a) * 0.075, z: 0.18 + Math.sin(a) * 0.075, rz: PI / 2 }, 5);
      }
      k.cylinder('body', 0.03, 0.03, 0.12, c.secondary, { x: cx, y: 0.55, z: 0.18, rz: PI / 2 }, 6);
    });
    // Head: angular black muzzle with brass jaw.
    k.box('head', 0.3, 0.22, 0.26, c.secondary, { y: 0.56, z: 0.44 });
    k.box('head', 0.22, 0.1, 0.18, c.primary, { y: 0.48, z: 0.6 });
    k.cone('head', 0.05, 0.1, c.secondary, { x: 0.1, y: 0.7, z: 0.4 }, 4);
    k.cone('head', 0.05, 0.1, c.secondary, { x: -0.1, y: 0.7, z: 0.4 }, 4);
    k.addEyes('head', 'slit', { y: 0.59, z: 0.575, spacing: 0.15, size: 0.05 });
    k.cylinder('tail', 0.035, 0.02, 0.3, c.primary, { y: 0.52, z: -0.5, rx: -1.0 }, 5);
  },

  longshot: (k) => heron(k, false),
  overwatch: (k) => heron(k, true),

  // ------------------------------------------------------------------ CONCRETE

  cinderblock: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.36, 0);
    k.node('head', 'body', 0, 0.68, 0);
    const block = (node: string, w: number, h: number, d: number, x: number, y: number, z: number, holes = 2): void => {
      k.box(node, w, h, d, c.primary, { x, y, z });
      // Hollow cores read as dark recesses on the front face.
      for (let i = 0; i < holes; i++) {
        const hx = x + (holes === 1 ? 0 : (i - (holes - 1) / 2) * (w / holes));
        k.box(node, (w / holes) * 0.55, h * 0.55, 0.02, c.dark, { x: hx, y, z: z + d / 2 + 0.003 });
      }
    };
    k.mirror((s, side) => {
      k.node(`leg_${side}`, 'body', s * 0.11, 0.24, 0);
      block(`leg_${side}`, 0.16, 0.22, 0.18, s * 0.11, 0.11, 0, 1);
      k.node(`arm_${side}`, 'body', s * 0.27, 0.56, 0);
      block(`arm_${side}`, 0.13, 0.26, 0.15, s * 0.3, 0.45, 0, 1);
    });
    block('body', 0.38, 0.17, 0.24, 0, 0.32, 0); // pelvis block
    block('body', 0.44, 0.2, 0.26, 0, 0.5, 0); // chest block
    block('head', 0.26, 0.16, 0.22, 0, 0.71, 0, 0);
    k.box('head', 0.2, 0.03, 0.02, c.accent, { y: 0.66, z: 0.115 }); // rust streak mouth
    k.addEyes('head', 'glow', { y: 0.73, z: 0.11, spacing: 0.1, size: 0.025 });
    // Three rebar spikes on the back, rusted.
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.12;
      k.cylinder('body', 0.015, 0.015, 0.3, c.secondary, { x, y: 0.62, z: -0.16, rx: -0.5, rz: x * 1.5 }, 5);
      k.cone('body', 0.022, 0.05, c.accent, { x: x * 1.15, y: 0.76, z: -0.24, rx: -0.5 }, 5);
    }
  },

  overpass: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 1.2, 0);
    k.node('head', 'body', 0, 1.62, 0.2);
    k.mirror((s, side) => {
      // Pillar legs.
      k.node(`leg_${side}`, 'body', s * 0.4, 1.0, 0);
      k.box(`leg_${side}`, 0.26, 1.0, 0.32, c.primary, { x: s * 0.4, y: 0.5 });
      k.box(`leg_${side}`, 0.34, 0.1, 0.4, c.secondary, { x: s * 0.4, y: 0.05 });
      k.box(`leg_${side}`, 0.27, 0.08, 0.33, c.accent, { x: s * 0.4, y: 0.62 }); // rust band
      // Short arms from the deck ends.
      k.node(`arm_${side}`, 'body', s * 0.62, 1.35, 0);
      k.box(`arm_${side}`, 0.18, 0.5, 0.2, c.primary, { x: s * 0.66, y: 1.12 });
      k.box(`arm_${side}`, 0.22, 0.14, 0.24, c.secondary, { x: s * 0.66, y: 0.84 });
    });
    // Arch span between the pillars and the deck on top.
    k.torus('body', 0.27, 0.08, c.primary, { y: 1.0 }, 10, PI);
    k.box('body', 1.3, 0.22, 0.46, c.primary, { y: 1.35 });
    k.box('body', 1.32, 0.04, 0.48, c.secondary, { y: 1.47 }); // road surface
    k.box('body', 0.4, 0.012, 0.05, '#e8d24a', { y: 1.495, z: 0.0 }); // lane mark
    k.box('head', 0.38, 0.24, 0.3, c.primary, { y: 1.62, z: 0.24 });
    k.addEyes('head', 'glow', { y: 1.64, z: 0.39, spacing: 0.16, size: 0.035 });
    // Rebar crown.
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.35;
      k.cylinder('head', 0.014, 0.014, 0.22, c.accent, { x: Math.sin(a) * 0.14, y: 1.82, z: 0.24, rz: -a * 0.8 }, 5);
    }
  },

  curbstone: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.25, 0);
    k.node('head', 'body', 0, 0.22, 0.3);
    k.node('tail', 'body', 0, 0.2, -0.32);
    k.sphere('body', 0.24, c.secondary, { y: 0.24, sz: 1.35, sy: 0.85 }, 8);
    // Six kerb-segment plates arching over the back, one with a yellow painted stripe.
    for (let i = 0; i < 6; i++) {
      const a = -0.95 + (i / 5) * 1.9;
      const y = 0.25 + Math.cos(a) * 0.22;
      const z = Math.sin(a) * 0.3;
      // Separate kerb segments with visible joints between them.
      k.slab('body', 0.44 - Math.abs(a) * 0.05, 0.07, 0.085, i % 2 ? c.primary : c.primary.clone().multiplyScalar(0.88), { y, z, rx: a });
      if (i === 2) k.box('body', 0.445, 0.075, 0.035, c.accent, { y, z, rx: a });
    }
    k.mirror((s, side) => {
      for (const [fb, z] of [['F', 0.17], ['B', -0.17]] as const) {
        const n = k.node(`leg_${fb}${side}`, 'body', s * 0.14, 0.12, z);
        k.box(n, 0.07, 0.12, 0.08, c.secondary, { x: s * 0.14, y: 0.06, z });
      }
    });
    k.cone('head', 0.08, 0.2, c.secondary, { y: 0.2, z: 0.4, rx: PI / 2 }, 6);
    k.cone('head', 0.03, 0.08, c.secondary, { x: 0.05, y: 0.29, z: 0.32 }, 4);
    k.cone('head', 0.03, 0.08, c.secondary, { x: -0.05, y: 0.29, z: 0.32 }, 4);
    k.addEyes('head', 'round', { y: 0.24, z: 0.37, spacing: 0.08, size: 0.018 });
    k.cone('tail', 0.04, 0.22, c.secondary, { y: 0.16, z: -0.42, rx: -PI / 2 - 0.3 }, 5);
    // Curled-ball idle: tuck head, legs and tail, roll the body up.
    k.extraClips.push({ name: 'idle_curled', duration: 2, loop: true });
    const curled = (n: string): ((clip: string, t: number, dur: number, H: number) => Pose | null) => (clip, t, dur, H) => {
      if (clip !== 'idle_curled') return null;
      const b = 0.02 * Math.sin((t / dur) * TAU);
      if (n === 'body') return { rot: [-0.5 + b, 0, 0], pos: [0, -H * 0.05, 0], scale: [1, 1.05, 0.85] };
      if (n === 'head') return { pos: [0, -0.04, -0.12], scale: 0.4 };
      if (n === 'tail') return { pos: [0, 0.06, 0.1], scale: 0.4 };
      return { scale: 0.2 };
    };
    for (const n of ['body', 'head', 'tail', 'leg_FL', 'leg_FR', 'leg_BL', 'leg_BR']) {
      const def = defaultPassthrough(k, n);
      k.motion(n, (clip, t, dur, H) => curled(n)(clip, t, dur, H) ?? def(clip, t, dur, H));
    }
  },

  rebarb: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.3, 0);
    k.node('head', 'body', 0, 0.3, 0.26);
    k.sphere('body', 0.25, c.primary, { y: 0.3, sz: 1.25, sy: 0.85 }, 8);
    // 22 steel rods fanned out of the back with red-oxide tips.
    const n = 22;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const yaw = (u - 0.5) * 2.4 + (i % 2 ? 0.12 : -0.12);
      const pitch = 0.15 + (i % 3) * 0.22;
      const dir = new THREE.Vector3(Math.sin(yaw) * 0.8, Math.sin(pitch) + 0.35, -Math.cos(yaw) * Math.cos(pitch) - 0.6).normalize();
      const base = new THREE.Vector3(0, 0.33, -0.05).addScaledVector(dir, 0.17);
      const len = 0.2 + (i % 4) * 0.035;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const e = new THREE.Euler().setFromQuaternion(q);
      const mid = base.clone().addScaledVector(dir, len / 2);
      const tip = base.clone().addScaledVector(dir, len);
      k.cylinder('body', 0.01, 0.014, len, c.secondary, { x: mid.x, y: mid.y, z: mid.z, rx: e.x, ry: e.y, rz: e.z }, 4);
      k.cone('body', 0.016, 0.05, c.accent, { x: tip.x, y: tip.y, z: tip.z, rx: e.x, ry: e.y, rz: e.z }, 4);
    }
    k.mirror((s, side) => {
      for (const [fb, z] of [['F', 0.15], ['B', -0.15]] as const) {
        const ln = k.node(`leg_${fb}${side}`, 'body', s * 0.15, 0.14, z);
        k.box(ln, 0.07, 0.14, 0.08, c.secondary, { x: s * 0.15, y: 0.07, z });
      }
    });
    k.cone('head', 0.09, 0.18, c.secondary, { y: 0.28, z: 0.4, rx: PI / 2 }, 6);
    k.sphere('head', 0.025, c.accent, { y: 0.28, z: 0.5 }, 5);
    k.addEyes('head', 'glow', { y: 0.34, z: 0.35, spacing: 0.1, size: 0.02 });
  },

  // ------------------------------------------------------------------ GRIND

  doubleshift: (k) => runner(k, false),
  overtime: (k) => runner(k, true),

  hustlepup: (k) => {
    const c = k.c; // mustard, brown pack
    k.node('body', 'root', 0, 0.3, 0);
    k.node('head', 'body', 0, 0.38, 0.22);
    k.node('tail', 'body', 0, 0.36, -0.2);
    k.node('pack', 'body', 0, 0.42, -0.02);
    k.node('ear_L', 'head', 0.07, 0.52, 0.26);
    k.node('ear_R', 'head', -0.07, 0.52, 0.26);
    k.box('body', 0.2, 0.17, 0.42, c.primary, { y: 0.3 });
    k.mirror((s, side) => {
      for (const [fb, z] of [['F', 0.14], ['B', -0.14]] as const) {
        const n = k.node(`leg_${fb}${side}`, 'body', s * 0.07, 0.22, z);
        k.box(n, 0.06, 0.22, 0.06, c.primary, { x: s * 0.07, y: 0.11, z });
        k.box(n, 0.07, 0.03, 0.08, c.secondary, { x: s * 0.07, y: 0.015, z: z + 0.01 });
      }
    });
    // Head and snout.
    k.box('head', 0.18, 0.16, 0.17, c.primary, { y: 0.44, z: 0.26 });
    k.box('head', 0.1, 0.08, 0.1, '#efe0b8', { y: 0.4, z: 0.38 });
    k.sphere('head', 0.025, c.dark, { y: 0.43, z: 0.43 }, 5);
    k.addEyes('head', 'round', { y: 0.47, z: 0.34, spacing: 0.09, size: 0.02 });
    // One ear up, one floppy.
    k.cone('ear_L', 0.04, 0.1, c.secondary, { x: 0.07, y: 0.57, z: 0.25 }, 4);
    k.box('ear_R', 0.06, 0.12, 0.03, c.secondary, { x: -0.1, y: 0.47, z: 0.25, rz: -0.4 });
    // Oversized stuffed backpack with straps and a pocket.
    k.box('pack', 0.3, 0.3, 0.26, c.secondary, { y: 0.55, z: -0.04 });
    k.box('pack', 0.31, 0.06, 0.27, '#5a3b22', { y: 0.68, z: -0.04 });
    k.box('pack', 0.18, 0.12, 0.05, c.accent, { y: 0.5, z: -0.19 });
    k.sphere('pack', 0.1, '#cfc2a3', { y: 0.73, z: -0.06, sy: 0.6 }, 6); // rolled bedroll on top
    k.mirror((s) => k.box('pack', 0.03, 0.04, 0.3, '#3c2a1a', { x: s * 0.11, y: 0.39, z: 0.02 }));
    k.cylinder('tail', 0.025, 0.015, 0.18, c.primary, { y: 0.42, z: -0.26, rx: -0.7 }, 5);
    k.motion('tail', (clip, t, dur) => {
      if (clip === 'faint') return null;
      const f = clip === 'attack' || clip === 'hurt' ? 1 : clip === 'walk' ? 4 : 6;
      return { rot: [0, 0.6 * Math.sin((t / dur) * TAU * f), 0] };
    });
    k.motion('ear_R', (clip, t, dur) => (clip === 'faint' ? null : { rot: [0, 0, -0.25 * Math.sin((t / dur) * TAU * (clip === 'walk' ? 2 : 1))] }));
    k.motion('pack', (clip, t, dur, H) => (clip === 'walk' ? { pos: [0, H * 0.02 * Math.abs(Math.sin((t / dur) * TAU)), 0], rot: [0.05 * Math.sin((t / dur) * TAU * 2), 0, 0] } : null));
  },

  cashew: (k) => {
    const c = k.c; // gold, green
    k.node('body', 'root', 0, 0.2, 0);
    k.node('head', 'body', 0, 0.32, 0.06);
    k.node('tail_0', 'body', 0, 0.16, -0.14);
    k.node('tail_1', 'tail_0', 0, 0.3, -0.22);
    k.node('tail_2', 'tail_1', 0, 0.44, -0.14);
    k.sphere('body', 0.13, c.secondary, { y: 0.19, sy: 1.15 }, 8);
    k.sphere('body', 0.08, '#d7e8b8', { y: 0.18, z: 0.08, sz: 0.6 }, 6); // belly
    k.sphere('head', 0.11, c.secondary, { y: 0.36, z: 0.06 }, 8);
    // Coin-stuffed cheeks.
    k.mirror((s) => {
      k.sphere('head', 0.07, c.secondary, { x: s * 0.09, y: 0.32, z: 0.1 }, 6);
      for (let i = 0; i < 2; i++) k.cylinder('head', 0.03, 0.03, 0.008, c.primary, { x: s * (0.13 + i * 0.01), y: 0.34 - i * 0.04, z: 0.13, rz: PI / 2 - s * 0.5, rx: 0.3 }, 8);
      k.cone('head', 0.03, 0.07, c.secondary, { x: s * 0.06, y: 0.47, z: 0.04 }, 4);
    });
    k.addEyes('head', 'round', { y: 0.39, z: 0.15, spacing: 0.08, size: 0.022 });
    k.cylinder('head', 0.04, 0.04, 0.01, c.primary, { y: 0.29, z: 0.17, rx: PI / 2 }, 8); // coin held in the mouth
    k.mirror((s, side) => {
      const n = k.node(`leg_${side}`, 'body', s * 0.06, 0.08, 0);
      k.sphere(n, 0.05, c.secondary, { x: s * 0.07, y: 0.05, z: 0.02, sz: 1.4 }, 6);
      k.node(`arm_${side}`, 'body', s * 0.07, 0.24, 0.08);
      k.box(`arm_${side}`, 0.03, 0.08, 0.03, c.secondary, { x: s * 0.06, y: 0.2, z: 0.11 });
    });
    // Curled bushy tail: three big puffs curling up and over.
    k.sphere('tail_0', 0.09, c.secondary, { y: 0.2, z: -0.18 }, 7);
    k.sphere('tail_1', 0.11, c.secondary, { y: 0.34, z: -0.22 }, 7);
    k.sphere('tail_2', 0.1, c.primary, { y: 0.47, z: -0.13 }, 7);
  },

  // ------------------------------------------------------------------ SMOKE

  exhaustfume: (k) => cloud(k, false),
  backfire: (k) => cloud(k, true),

  hazeling: (k) => {
    const c = k.c; // lavender, teal
    const g = { mat: 'glass' as const };
    k.node('body', 'root', 0, 0.3, 0);
    k.node('head', 'body', 0, 0.42, 0.22);
    k.capsule('body', 0.11, 0.26, c.primary, { ...g, y: 0.3, rx: PI / 2 });
    k.mirror((s, side) => {
      for (const [fb, z] of [['F', 0.12], ['B', -0.12]] as const) {
        const n = k.node(`leg_${fb}${side}`, 'body', s * 0.07, 0.22, z);
        k.cylinder(n, 0.025, 0.02, 0.22, c.primary, { ...g, x: s * 0.07, y: 0.11, z }, 5);
      }
      k.cone('head', 0.045, 0.12, c.primary, { ...g, x: s * 0.06, y: 0.56, z: 0.2 }, 4);
    });
    k.sphere('head', 0.1, c.primary, { ...g, y: 0.45, z: 0.24 }, 7);
    k.cone('head', 0.06, 0.14, c.primary, { ...g, y: 0.42, z: 0.36, rx: PI / 2 }, 5);
    k.addEyes('head', 'glow', { y: 0.47, z: 0.31, spacing: 0.08, size: 0.018 });
    // Three tails ending in hookah-style smoke rings.
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.55;
      const n = k.node(`tail_${i}`, 'body', 0, 0.32, -0.18);
      const tx = Math.sin(a) * 0.2;
      k.capsule(n, 0.04, 0.2, c.primary, { ...g, x: tx * 0.5, y: 0.42, z: -0.28, rx: -0.8, rz: -a * 0.6 });
      k.torus(n, 0.06, 0.018, c.secondary, { x: tx, y: 0.52, z: -0.38, rx: -0.4, ry: a }, 10);
    }
  },

  flue: (k) => {
    const c = k.c; // charcoal, ember
    k.node('body', 'root', 0, 0.55, 0);
    k.node('head', 'body', 0, 1.0, 0.12);
    k.node('tail_0', 'body', 0, 0.45, -0.2);
    k.node('tail_1', 'tail_0', 0, 0.25, -0.42);
    // Upright lizard torso.
    k.capsule('body', 0.15, 0.4, c.primary, { y: 0.68, z: 0.02, rx: 0.15 });
    k.box('body', 0.18, 0.4, 0.05, c.secondary, { y: 0.66, z: 0.15, rx: 0.15 }); // scaly belly
    // Brick chimney on the back with an ember glow at the top.
    k.box('body', 0.2, 0.42, 0.2, '#6d3a2c', { y: 0.92, z: -0.22 });
    for (let i = 0; i < 4; i++) k.box('body', 0.205, 0.015, 0.205, '#3e2219', { y: 0.76 + i * 0.1, z: -0.22 });
    k.box('body', 0.24, 0.05, 0.24, c.secondary, { y: 1.15, z: -0.22 });
    k.box('body', 0.12, 0.02, 0.12, c.accent, { y: 1.17, z: -0.22, mat: 'glow' });
    k.sphere('head', 0.12, c.primary, { y: 1.04, z: 0.14, sz: 1.3 }, 7);
    k.box('head', 0.16, 0.05, 0.16, c.secondary, { y: 0.98, z: 0.24 });
    k.addEyes('head', 'glow', { y: 1.08, z: 0.2, spacing: 0.14, size: 0.022 });
    k.mirror((s, side) => {
      k.node(`leg_${side}`, 'body', s * 0.1, 0.45, 0);
      k.box(`leg_${side}`, 0.09, 0.45, 0.11, c.primary, { x: s * 0.11, y: 0.23 });
      k.box(`leg_${side}`, 0.12, 0.04, 0.18, c.secondary, { x: s * 0.11, y: 0.02, z: 0.04 });
      k.node(`arm_${side}`, 'body', s * 0.16, 0.82, 0.06);
      k.box(`arm_${side}`, 0.06, 0.24, 0.07, c.primary, { x: s * 0.19, y: 0.7, z: 0.08, rz: s * 0.15 });
    });
    k.cone('tail_0', 0.1, 0.4, c.primary, { y: 0.32, z: -0.34, rx: -2.0 }, 6);
    k.cone('tail_1', 0.05, 0.3, c.primary, { y: 0.18, z: -0.56, rx: -1.8 }, 5);
    // Soot puffs that rise out of the chimney and loop.
    for (let i = 0; i < 3; i++) {
      const n = k.node(`puff_${i}`, 'root', 0, 1.25, -0.22);
      k.sphere(n, 0.08, '#4a4a50', { y: 1.25, z: -0.22, mat: 'glass' }, 6);
      k.motion(n, (clip, t, dur, H) => {
        if (clip === 'faint') return { scale: Math.max(0.01, 1 - t / dur) };
        const u = loop01(t + (i / 3) * dur, dur, dur >= 1.5 ? 1 : 1);
        return { pos: [0.05 * Math.sin(u * TAU + i), u * H * 0.35, -0.04 * u], scale: 0.4 + u * 1.2 };
      });
    }
  },

  // ------------------------------------------------------------------ BASS

  subsonic: (k) => speaker(k, false),
  woofer: (k) => speaker(k, true),

  streetlamp: (k) => {
    const c = k.c; // navy, yellow
    k.node('body', 'root', 0, 0.5, 0);
    k.node('head', 'body', 0, 0.86, 0.03);
    k.cylinder('body', 0.035, 0.05, 0.72, c.primary, { y: 0.42 }, 6); // lamp-post body
    k.cylinder('body', 0.09, 0.11, 0.07, c.primary, { y: 0.04 }, 8); // base
    for (let i = 0; i < 3; i++) k.torus('body', 0.045, 0.01, c.secondary, { y: 0.25 + i * 0.2, rx: PI / 2 }, 8);
    // Lamp housing and glowing bulb head.
    k.cone('head', 0.12, 0.09, c.primary, { y: 0.97, z: 0.04 }, 8);
    k.sphere('head', 0.07, c.accent, { y: 0.88, z: 0.04, mat: 'glow' }, 8);
    k.mirror((s, side) => {
      k.cylinder('head', 0.006, 0.006, 0.14, c.primary, { x: s * 0.05, y: 1.06, z: 0.06, rz: -s * 0.4 }, 4); // antennae
      const n = k.node(`wing_${side}`, 'body', s * 0.04, 0.62, -0.02);
      // Flat wings: navy panels with yellow spots.
      k.box(n, 0.32, 0.26, 0.012, c.primary, { x: s * 0.2, y: 0.66, z: -0.03, rz: s * 0.25 });
      k.box(n, 0.24, 0.16, 0.012, c.secondary, { x: s * 0.18, y: 0.48, z: -0.03, rz: -s * 0.2 });
      k.cylinder(n, 0.035, 0.035, 0.014, c.accent, { x: s * 0.24, y: 0.68, z: -0.022, rx: PI / 2 }, 8);
      k.cylinder(n, 0.022, 0.022, 0.014, c.accent, { x: s * 0.2, y: 0.48, z: -0.022, rx: PI / 2 }, 8);
    });
  },

  wirewhip: (k) => {
    const c = k.c; // black, magenta
    const top = 1.15;
    k.node('body', 'root', 0, top, 0);
    // Short power-line segment with insulators.
    k.cylinder('body', 0.015, 0.015, 0.7, '#2a2a2e', { y: top, rz: PI / 2 }, 6);
    k.mirror((s) => k.cylinder('body', 0.03, 0.03, 0.06, '#8fa3b0', { x: s * 0.3, y: top + 0.03 }, 6));
    // Twelve segments following a sine path down from the line.
    const N = 12;
    for (let i = 0; i < N; i++) {
      const y = top - 0.06 - i * 0.085;
      const n = k.node(`seg_${i}`, 'body', 0, y, 0);
      const r = i === N - 1 ? 0.07 : 0.045 + Math.sin((i / N) * PI) * 0.02;
      k.sphere(n, r, i % 3 === 0 ? c.secondary : c.primary, { y }, 7);
      if (i % 3 === 1) k.torus(n, r * 0.9, 0.008, c.accent, { y, rx: PI / 2, mat: 'glow' }, 8);
      k.motion(n, (clip, t, dur, H) => {
        const ph = (t / dur) * TAU;
        const amp = (i / N) * H * (clip === 'attack' ? 0.18 : clip === 'walk' ? 0.12 : 0.07);
        const w = clip === 'attack' ? 2 : 1;
        if (clip === 'faint') return { pos: [Math.sin(i * 0.5) * 0.02, -(t / dur) * (i / N) * H * 0.05, 0] };
        if (clip === 'attack') return { pos: [0, 0, Math.sin(Math.PI * Math.min(1, t / (dur * 0.6))) * (i / N) * H * 0.3] };
        return { pos: [amp * Math.sin(ph * w - i * 0.55), 0, amp * 0.4 * Math.cos(ph * w - i * 0.55)] };
      });
    }
    k.addEyes(`seg_${N - 1}`, 'glow', { y: top - 0.06 - (N - 1) * 0.085, z: 0.055, spacing: 0.07, size: 0.014 });
    // Crackling spark sprites.
    for (let i = 0; i < 4; i++) {
      const y = top - 0.15 - i * 0.24;
      const n = k.node(`spark_${i}`, `seg_${Math.min(N - 1, 1 + i * 3)}`, 0.07 * (i % 2 ? 1 : -1), y, 0.02);
      k.sphere(n, 0.022, c.accent, { x: 0.07 * (i % 2 ? 1 : -1), y, z: 0.02, mat: 'glow' }, 4);
      k.motion(n, (_clip, t, dur) => ({ scale: Math.max(0.05, Math.sin((t / dur) * TAU * 3 + i * 1.7)) * 1.3 }));
    }
    // The line itself sways a little; no default body bob (it's hanging).
    k.motion('body', (clip, t, dur) => {
      const ph = (t / dur) * TAU;
      if (clip === 'faint') return { rot: [0, 0, 0.15 * Math.min(1, t / dur)] };
      if (clip === 'hurt') return { rot: [0, 0, 0.1 * Math.sin(Math.PI * Math.min(1, t / dur))] };
      if (clip === 'evolve_glow') return { scale: 1 + 0.05 * Math.sin(ph * 2) };
      return { rot: [0, 0, 0.03 * Math.sin(ph)] };
    });
  },
};

/** Default motion for a node (used when composing a custom motion with the default). */
function defaultPassthrough(_k: Kit, _n: string): (clip: string, t: number, dur: number, H: number) => Pose | null {
  return () => null;
}

// ------------------------------------------------------------------ shared body plans

function heron(k: Kit, evolved: boolean): void {
  const c = k.c; // olive, white
  const legH = evolved ? 0.55 : 0.45;
  k.node('body', 'root', 0, legH + 0.1, 0);
  k.node('neck', 'body', 0, legH + 0.18, 0.12);
  k.node('head', 'neck', 0, legH + (evolved ? 0.62 : 0.5), 0.2);
  k.sphere('body', 0.16, c.primary, { y: legH + 0.12, sz: 1.5, sy: 0.9 }, 8);
  k.sphere('body', 0.12, c.secondary, { y: legH + 0.07, z: 0.06, sz: 1.3, sy: 0.7 }, 7);
  // Legs: two thin legs, or a tripod stance when evolved.
  const legs: Array<[string, number, number, number]> = evolved
    ? [['leg_L', 0.12, 0.1, 0.25], ['leg_R', -0.12, 0.1, -0.25], ['leg_B', 0, -0.16, 0]]
    : [['leg_L', 0.06, 0, 0], ['leg_R', -0.06, 0, 0]];
  for (const [n, x, z, splay] of legs) {
    k.node(n, 'body', x * 0.6, legH, z * 0.5);
    k.cylinder(n, 0.014, 0.014, legH, c.secondary, { x: x * 0.8, y: legH / 2, z: z * 0.8, rz: -splay * 0.25, rx: z * 0.6 }, 5);
    k.box(n, 0.06, 0.012, 0.09, c.secondary, { x: x * 1.05, y: 0.006, z: z * 1.15 + 0.02 });
  }
  // Neck of stacked cylinders.
  const segs = evolved ? 6 : 5;
  const neckLen = evolved ? 0.5 : 0.38;
  for (let i = 0; i < segs; i++) {
    const y = legH + 0.2 + (i + 0.5) * (neckLen / segs);
    k.cylinder('neck', 0.035 - i * 0.002, 0.04 - i * 0.002, neckLen / segs + 0.005, i % 2 ? c.secondary : c.primary, { y, z: 0.12 + i * 0.012 }, 6);
  }
  const hy = legH + (evolved ? 0.72 : 0.6);
  k.sphere('head', 0.07, c.secondary, { y: hy, z: 0.2, sz: 1.2 }, 7);
  if (evolved) {
    // Long barrel beak.
    k.cylinder('head', 0.018, 0.022, 0.42, '#2d3033', { y: hy - 0.01, z: 0.45, rx: PI / 2 }, 6);
    k.cylinder('head', 0.026, 0.026, 0.04, '#2d3033', { y: hy - 0.01, z: 0.65, rx: PI / 2 }, 6);
  } else {
    k.cone('head', 0.03, 0.2, '#c9a13b', { y: hy - 0.01, z: 0.36, rx: PI / 2 }, 5);
  }
  // Scope eye: a torus with a glowing lens (extends on attack when evolved).
  const scope = k.node('scope', 'head', 0.06, hy + 0.02, 0.24);
  k.cylinder(scope, 0.03, 0.03, evolved ? 0.14 : 0.06, '#2d3033', { x: 0.065, y: hy + 0.02, z: evolved ? 0.27 : 0.24, rx: PI / 2 }, 8);
  k.torus(scope, 0.032, 0.008, c.accent, { x: 0.065, y: hy + 0.02, z: evolved ? 0.345 : 0.272 }, 10);
  k.sphere(scope, 0.022, c.eye, { x: 0.065, y: hy + 0.02, z: evolved ? 0.345 : 0.272, sz: 0.4, mat: 'glow' }, 6);
  k.sphere('head', 0.012, c.dark, { x: -0.06, y: hy + 0.02, z: 0.25 }, 5);
  if (evolved) {
    k.motion(scope, (clip, t, dur, H) => {
      const ext = clip === 'attack' ? Math.sin(PI * Math.min(1, t / (dur * 0.7))) : clip === 'idle' ? 0.3 + 0.3 * Math.sin((t / dur) * TAU) : 0;
      return { pos: [0, 0, ext * H * 0.06] };
    });
  }
  // Folded wings and tail feathers.
  k.mirror((s, side) => {
    const n = k.node(`wing_${side}`, 'body', s * 0.13, legH + 0.18, 0.02);
    k.box(n, 0.04, 0.12, 0.34, c.primary, { x: s * 0.15, y: legH + 0.13, z: -0.04, rx: 0.15 });
  });
  k.box('body', 0.12, 0.03, 0.16, c.secondary, { y: legH + 0.12, z: -0.27, rx: 0.3 });
  k.motion('neck', (clip, t, dur) => {
    const ph = (t / dur) * TAU;
    if (clip === 'attack') return { rot: [0.5 * Math.sin(PI * Math.min(1, t / (dur * 0.6))), 0, 0] };
    if (clip === 'faint') return { rot: [0.8 * Math.min(1, t / dur), 0, 0] };
    return { rot: [0.06 * Math.sin(ph), 0.1 * Math.sin(ph * 0.5), 0] };
  });
  // Wings stay folded except a little rustle (and a flap when hurt).
  k.mirror((s, side) =>
    k.motion(`wing_${side}`, (clip, t, dur) => {
      if (clip === 'hurt' || clip === 'attack') return { rot: [0, 0, s * 0.6 * Math.sin(PI * Math.min(1, t / dur))] };
      return { rot: [0, 0, s * 0.03 * Math.sin((t / dur) * TAU)] };
    }),
  );
}

/** Double Shift / Overtime: wiry runner with clock faces. */
function runner(k: Kit, evolved: boolean): void {
  const c = k.c; // teal, cream
  const legH = evolved ? 0.5 : 0.36;
  k.node('body', 'root', 0, legH + 0.05, 0);
  k.node('head', 'body', 0, legH + (evolved ? 0.5 : 0.42), 0);
  k.capsule('body', evolved ? 0.13 : 0.11, evolved ? 0.26 : 0.2, c.primary, { y: legH + (evolved ? 0.24 : 0.2) });
  // Clock face on the belly (and back when evolved) with moving hands.
  const faces: Array<[number, number]> = evolved ? [[1, 0], [-1, 1]] : [[1, 0]];
  const cy = legH + (evolved ? 0.24 : 0.2);
  const r0 = evolved ? 0.13 : 0.11;
  for (const [dir, idx] of faces) {
    const z = dir * (r0 + 0.005);
    k.cylinder('body', r0 * 0.85, r0 * 0.85, 0.02, c.secondary, { y: cy, z, rx: PI / 2 }, 12);
    k.torus('body', r0 * 0.86, 0.012, c.accent, { y: cy, z: z + dir * 0.006, ry: dir < 0 ? PI : 0 }, 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      k.box('body', 0.012, 0.03, 0.01, c.accent, { x: Math.sin(a) * r0 * 0.68, y: cy + Math.cos(a) * r0 * 0.68, z: z + dir * 0.012, rz: -a });
    }
    const hand = k.node(`clock_hand_${idx}`, 'body', 0, cy, z);
    k.box(hand, 0.012, r0 * 0.65, 0.008, c.dark, { y: cy + r0 * 0.3, z: z + dir * 0.016 });
    const hour = k.node(`clock_hour_${idx}`, 'body', 0, cy, z);
    k.box(hour, 0.016, r0 * 0.42, 0.008, c.dark, { y: cy + r0 * 0.2, z: z + dir * 0.02 });
    // Minute hand does a full turn per clip, hour hand a twelfth.
    k.motion(hand, (_clip, t, dur) => ({ rot: [0, 0, -dir * loop01(t, dur) * TAU] }));
    k.motion(hour, (_clip, t, dur) => ({ rot: [0, 0, -dir * loop01(t, dur) * (TAU / 12)] }));
  }
  const hy = legH + (evolved ? 0.6 : 0.5);
  k.sphere('head', evolved ? 0.1 : 0.09, c.secondary, { y: hy, sy: 1.1 }, 8);
  k.cone('head', 0.03, 0.1, c.primary, { y: hy + 0.11, z: -0.02, rx: -0.5 }, 4); // cowlick
  k.addEyes('head', 'round', { y: hy + 0.01, z: 0.075, spacing: 0.07, size: 0.02 });
  if (evolved) k.torus('head', 0.095, 0.02, c.accent, { y: hy + 0.05, rx: PI / 2 }, 12); // sweatband
  k.mirror((s, side) => {
    k.node(`leg_${side}`, 'body', s * 0.06, legH, 0);
    k.cylinder(`leg_${side}`, 0.022, 0.018, legH, c.primary, { x: s * 0.06, y: legH / 2 }, 5);
    k.box(`leg_${side}`, 0.06, 0.035, 0.12, c.secondary, { x: s * 0.06, y: 0.018, z: 0.03 }); // sneakers
    k.node(`arm_${side}`, 'body', s * (r0 + 0.02), cy + 0.1, 0);
    k.cylinder(`arm_${side}`, 0.016, 0.014, evolved ? 0.32 : 0.24, c.primary, { x: s * (r0 + 0.03), y: cy - 0.03, rz: s * 0.15 }, 5);
    k.sphere(`arm_${side}`, 0.025, c.secondary, { x: s * (r0 + 0.05), y: cy - (evolved ? 0.19 : 0.15) }, 5);
  });
}

/** Exhaust Fume / Backfire: floating translucent cloud with tailpipes. */
function cloud(k: Kit, evolved: boolean): void {
  const c = k.c;
  const g = { mat: 'glass' as const };
  const cy = evolved ? 0.75 : 0.45;
  k.node('body', 'root', 0, cy, 0);
  k.node('head', 'body', 0, cy + 0.1, 0.1);
  const n = evolved ? 8 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = (evolved ? 0.24 : 0.17) * (0.8 + 0.3 * ((i * 37) % 7) / 7);
    k.sphere('body', r, i % 2 ? c.primary : c.secondary, { ...g, x: Math.cos(a) * r * 0.9, y: cy + Math.sin(a * 2) * r * 0.35, z: Math.sin(a) * r * 0.6 }, 8);
  }
  k.sphere('body', evolved ? 0.3 : 0.21, c.primary, { ...g, y: cy + 0.06 }, 8);
  // Tail-pipe mouth(s).
  const pipes = evolved ? [-0.14, 0.14] : [0];
  for (const x of pipes) {
    k.cylinder('head', 0.045, 0.045, 0.16, c.accent, { x, y: cy - 0.05, z: (evolved ? 0.3 : 0.2) + 0.03, rx: PI / 2 }, 8);
    k.torus('head', 0.045, 0.012, '#555559', { x, y: cy - 0.05, z: (evolved ? 0.3 : 0.2) + 0.11 }, 8);
  }
  k.addEyes('head', 'glow', { y: cy + 0.12, z: evolved ? 0.27 : 0.19, spacing: evolved ? 0.16 : 0.12, size: 0.025 });
  if (evolved) {
    // Ember flare puff that flashes on attack.
    const f = k.node('flare', 'head', 0, cy - 0.05, 0.45, 0.001);
    k.sphere(f, 0.1, c.eye, { y: cy - 0.05, z: 0.45, mat: 'glow' }, 6);
    k.motion(f, (clip, t, dur) => {
      if (clip !== 'attack') return { scale: 0.001 };
      const u = t / dur;
      return { scale: u < 0.45 ? 0.001 + Math.sin((u / 0.45) * PI) * 0.8 : 0.001 };
    });
  }
}

/** Subsonic / Woofer: round speaker beasts with pulsing neon rings. */
function speaker(k: Kit, evolved: boolean): void {
  const c = k.c;
  const R = evolved ? 0.42 : 0.3;
  const cy = R + 0.12;
  k.node('body', 'root', 0, cy, 0);
  k.node('head', 'body', 0, cy + R * 0.85, 0.05);
  k.sphere('body', R, c.primary, { y: cy }, evolved ? 9 : 10);
  // Speaker cones: concentric glowing rings around a dark cone.
  const cones: Array<[number, number, number, number]> = evolved
    ? [[0, cy, R * 0.9, 1], [R * 0.85, cy + R * 0.45, R * 0.45, 0.55], [-R * 0.85, cy + R * 0.45, R * 0.45, 0.55]]
    : [[0, cy, R * 0.9, 1]];
  cones.forEach(([x, y, z, s], i) => {
    const node = k.node(`rings_${i}`, 'body', x, y, z);
    const yaw = x === 0 ? 0 : Math.sign(x) * 0.9;
    const off = (d: number): { x: number; z: number } => ({ x: x + Math.sin(yaw) * d, z: z + Math.cos(yaw) * d });
    const p0 = off(0);
    k.cylinder('body', R * 0.5 * s, R * 0.5 * s, 0.05, c.secondary, { x: p0.x, y, z: p0.z, rx: PI / 2, ry: yaw }, 12);
    const p1 = off(0.04);
    k.cone('body', R * 0.38 * s, R * 0.25 * s, c.dark, { x: p1.x, y, z: p1.z, rx: -PI / 2, ry: yaw }, 10);
    const rings = i === 0 ? 3 : 2;
    for (let j = 0; j < rings; j++) {
      const p = off(0.035 + j * 0.008);
      const rr = rings === 3 ? 0.18 + j * 0.13 : 0.25 + j * 0.2;
      k.torus(node, R * rr * s, 0.012 * (evolved ? 1.4 : 1), c.accent, { x: p.x, y, z: p.z, ry: yaw, mat: 'glow' }, evolved ? 10 : 14);
    }
    k.motion(node, (clip, t, dur) => {
      const f = clip === 'idle' ? 4 : clip === 'attack' ? 6 : 2;
      const amp = clip === 'attack' ? 0.18 : 0.07;
      return { scale: 1 + amp * Math.max(0, Math.sin((t / dur) * TAU * f)) };
    });
  });
  // Cone eyes on top.
  k.addEyes('head', 'cone', { y: cy + R * 0.85, z: R * 0.3, spacing: R * 0.6, size: R * 0.12 });
  k.mirror((s, side) => {
    k.node(`leg_${side}`, 'body', s * R * 0.5, cy - R * 0.6, 0);
    k.box(`leg_${side}`, R * 0.35, cy - R * 0.55, R * 0.4, c.secondary, { x: s * R * 0.55, y: (cy - R * 0.55) / 2 });
    if (evolved) {
      k.node(`arm_${side}`, 'body', s * R * 0.95, cy + R * 0.1, 0);
      k.box(`arm_${side}`, R * 0.22, R * 0.6, R * 0.25, c.secondary, { x: s * R * 1.05, y: cy - R * 0.15 });
    }
  });
  if (evolved) {
    // Bass-wave ring emitter on the back.
    const e = k.node('emitter', 'body', 0, cy + R * 0.2, -R * 0.95);
    k.cylinder(e, 0.04, 0.04, 0.2, c.secondary, { y: cy + R * 0.2, z: -R * 0.95, rx: PI / 2 }, 6);
    k.torus(e, R * 0.45, 0.025, c.accent, { y: cy + R * 0.2, z: -R * 1.08, mat: 'glow' }, 16);
    k.torus(e, R * 0.3, 0.02, c.accent, { y: cy + R * 0.2, z: -R * 1.1, mat: 'glow' }, 14);
    k.motion(e, (clip, t, dur) => ({ rot: [0, 0, loop01(t, dur) * TAU], scale: 1 + (clip === 'attack' ? 0.3 : 0.08) * Math.max(0, Math.sin((t / dur) * TAU * 2)) }));
  }
}

// ------------------------------------------------------------------ entry points

// Rooftop and sewer species live in their own files.
Object.assign(BUILDERS, ROOF_BUILDERS, SEWER_BUILDERS, LEGEND_BUILDERS, NEW_BUILDERS, POND_BUILDERS);

export function hasBuilder(id: string): boolean {
  return id in BUILDERS;
}

/** Builds a species' model (or its shiny variant). */
export function buildCreatureModel(spec: SpeciesSpec, shiny = false): BuiltModel {
  const build = BUILDERS[spec.id];
  if (!build) throw new Error(`No model builder for species "${spec.id}"`);
  const palette: Palette = shiny ? shinyPalette(spec.model.palette) : spec.model.palette;
  const primaryType = spec.types[0];
  const style: Partial<Style> = { ...surfaceFor(spec.types), ...TYPE_MOTION[primaryType], flavour: primaryType, flavour2: spec.types[1] };
  if (spec.id === 'exhaustfume' || spec.id === 'backfire' || spec.id === 'streetlamp' || ROOF_FLOATING.has(spec.id) || LEGEND_FLOATING.has(spec.id) || NEW_FLOATING.has(spec.id) || POND_FLOATING.has(spec.id)) style.floating = true;
  if (spec.id === 'hazeling') style.glassOpacity = 0.7;
  if (spec.id === 'overtime') style.energy = 1.4;
  const kit = new Kit(shiny ? `${spec.id}_shiny` : spec.id, palette, style);
  build(kit);
  return kit.build(spec.model.height);
}
