import type * as THREE from 'three';
import type { Kit } from './Kit';

/**
 * The three legendaries (raids, see legendaries.json). Built like every other species (model
 * space, feet at y = 0, facing +Z, scaled to the species' height by Kit.build), but heavier in
 * silhouette and with more glow so they read from a block away:
 *
 *  - Gridlock (Concrete/Grind): a hunched titan of crushed car shells stacked on pillar legs, a
 *    traffic-signal head and a spine of hazard-striped barriers; headlights for knuckles.
 *  - Blackout (Wire/Smoke): a floating substation wraith: a transformer-drum torso in a smoke
 *    shroud, pylon arms trailing cables, insulator-stack crown and a ring of neon glow.
 *  - Undertow (Sludge/Bass): a low sewer leviathan: a riveted drum-tank body on four stubby legs,
 *    a speaker-grille maw, pipe tendrils on its back and a dripping sludge mane.
 */

const PI = Math.PI;
const TAU = PI * 2;
const loop01 = (t: number, dur: number, cycles = 1): number => ((t / dur) * cycles) % 1;

export const LEGEND_FLOATING = new Set(['blackout']);

export const LEGEND_BUILDERS: Record<string, (k: Kit) => void> = {
  gridlock: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 1.0, 0);
    k.node('head', 'body', 0, 2.05, 0.35);
    // A car shell: body, cabin, two wheels on the near side.
    const shell = (node: string, x: number, y: number, z: number, ry: number, rz: number, col: string, s = 1): void => {
      k.box(node, 0.9 * s, 0.26 * s, 0.46 * s, col, { x, y, z, ry, rz });
      k.box(node, 0.5 * s, 0.18 * s, 0.4 * s, c.secondary, { x: x - Math.cos(ry) * 0.05 * s, y: y + 0.2 * s, z: z + Math.sin(ry) * 0.05 * s, ry, rz });
    };
    // Pillar legs with crushed-bumper feet.
    k.mirror((s, side) => {
      k.node(`leg_${side}`, 'body', s * 0.42, 0.95, 0);
      k.box(`leg_${side}`, 0.36, 0.95, 0.42, c.primary, { x: s * 0.44, y: 0.5 });
      k.box(`leg_${side}`, 0.5, 0.12, 0.62, c.secondary, { x: s * 0.44, y: 0.06, z: 0.06 });
      k.box(`leg_${side}`, 0.38, 0.08, 0.44, c.accent, { x: s * 0.44, y: 0.66 }); // hazard band
      // Arms: long, knuckles dragging, a headlight in each fist.
      k.node(`arm_${side}`, 'body', s * 0.8, 1.82, 0.1);
      k.box(`arm_${side}`, 0.3, 0.62, 0.34, c.primary, { x: s * 0.9, y: 1.5, z: 0.12, rz: s * 0.12 });
      k.box(`arm_${side}`, 0.26, 0.5, 0.3, c.secondary, { x: s * 0.98, y: 0.98, z: 0.18 });
      k.box(`arm_${side}`, 0.4, 0.34, 0.42, c.primary, { x: s * 1.0, y: 0.62, z: 0.2 });
      k.cylinder(`arm_${side}`, 0.09, 0.09, 0.05, c.accent, { x: s * 1.0, y: 0.62, z: 0.43, rx: PI / 2, mat: 'glow' }, 10);
      // Shoulder: a wrecked car door.
      k.slab(`arm_${side}`, 0.5, 0.08, 0.5, c.accent, { x: s * 0.86, y: 1.92, z: 0.08, rz: s * 0.35 });
    });
    // Torso: a stack of crushed cars, offset like a pile-up.
    shell('body', 0, 1.1, 0.02, 0, 0.05, '#8a2b22', 1.05);
    shell('body', 0.06, 1.42, -0.03, 0.3, -0.06, '#2b4f7a', 1.0);
    shell('body', -0.05, 1.72, 0.04, -0.2, 0.08, '#c9b23a', 0.95);
    k.box('body', 0.95, 0.12, 0.56, c.secondary, { y: 0.92 }); // chassis rail pelvis
    // Spine of barriers on the back.
    for (let i = 0; i < 4; i++) {
      k.box('body', 0.5 - i * 0.06, 0.16, 0.08, i % 2 ? c.white : c.accent, { y: 1.05 + i * 0.28, z: -0.38 - i * 0.03, rx: -0.25 });
    }
    // Head: a traffic signal housing, three lights, a visor brim each.
    k.box('head', 0.38, 0.62, 0.32, '#1c1d20', { y: 2.2, z: 0.36 });
    // Red is the eye colour and amber the accent, so shiny variants recolour them (and the glow
    // materials stay within the draw budget).
    const lights: Array<[THREE.Color | string, number]> = [
      [c.eye, 2.4],
      [c.accent, 2.2],
      ['#2bff7a', 2.0],
    ];
    for (const [col, y] of lights) {
      k.cylinder('head', 0.085, 0.085, 0.04, col, { y, z: 0.53, rx: PI / 2, mat: 'glow' }, 10);
      k.box('head', 0.22, 0.03, 0.1, '#1c1d20', { y: y + 0.1, z: 0.56 });
    }
    k.addEyes('head', 'glow', { y: 2.4, z: 0.53, spacing: 0.26, size: 0.03 });
    // The signal lights cycle while it idles, and all flare red when it attacks.
    k.motion('head', (clip, t, dur) => {
      const f = clip === 'attack' ? 6 : 1.5;
      return { rot: [0, Math.sin((t / dur) * TAU) * (clip === 'idle' ? 0.12 : 0.05), 0], scale: 1 + (clip === 'attack' ? 0.06 : 0.02) * Math.max(0, Math.sin((t / dur) * TAU * f)) };
    });
  },

  blackout: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 1.3, 0);
    k.node('head', 'body', 0, 2.55, 0);
    // Smoke shroud (translucent) hanging from the torso: stacked, widening skirts.
    for (let i = 0; i < 3; i++) k.cone('body', 0.55 + i * 0.16, 0.6, c.secondary, { y: 1.2 - i * 0.38, rx: PI, mat: 'glass' }, 10);
    // Transformer drum torso with cooling fins and a warning plate.
    k.cylinder('body', 0.42, 0.46, 0.8, c.primary, { y: 1.75 }, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      k.box('body', 0.05, 0.6, 0.2, c.secondary, { x: Math.sin(a) * 0.48, y: 1.75, z: Math.cos(a) * 0.48, ry: a });
    }
    k.box('body', 0.22, 0.16, 0.02, '#ffd800', { y: 1.9, z: 0.465 });
    k.box('body', 0.03, 0.1, 0.022, '#141416', { y: 1.9, z: 0.468, rz: 0.5 }); // lightning mark
    // Neon halo around the waist.
    k.torus('body', 0.62, 0.035, c.accent, { y: 1.42, rx: PI / 2, mat: 'glow' }, 18);
    // Pylon arms: lattice of thin struts ending in cable claws.
    k.mirror((s, side) => {
      k.node(`arm_${side}`, 'body', s * 0.5, 2.0, 0);
      k.box(`arm_${side}`, 0.7, 0.08, 0.08, c.secondary, { x: s * 0.82, y: 2.02 });
      k.box(`arm_${side}`, 0.08, 0.9, 0.08, c.secondary, { x: s * 1.15, y: 1.6 });
      k.box(`arm_${side}`, 0.6, 0.05, 0.05, c.secondary, { x: s * 0.92, y: 1.8, rz: s * 0.7 });
      for (let j = 0; j < 3; j++) k.cylinder(`arm_${side}`, 0.012, 0.02, 0.5, '#0c0c10', { x: s * (1.1 + j * 0.06), y: 0.95, z: (j - 1) * 0.07, rz: s * (0.1 + j * 0.15) }, 5);
      k.sphere(`arm_${side}`, 0.08, c.accent, { x: s * 1.15, y: 1.12, mat: 'glow' }, 8);
    });
    // Head: an insulator stack crown over a hollow, glowing face.
    k.sphere('head', 0.3, c.primary, { y: 2.5, sy: 0.9 }, 10);
    k.box('head', 0.36, 0.1, 0.06, '#000000', { y: 2.48, z: 0.27 });
    k.addEyes('head', 'glow', { y: 2.49, z: 0.29, spacing: 0.18, size: 0.04 });
    for (let i = 0; i < 4; i++) k.cylinder('head', 0.11 - i * 0.015, 0.11 - i * 0.015, 0.06, i % 2 ? c.secondary : '#d8d2c8', { y: 2.78 + i * 0.09 }, 10);
    k.sphere('head', 0.05, c.eye, { y: 3.18, mat: 'glow' }, 8);
    k.motion('body', (clip, t, dur) => {
      const flick = clip === 'attack' ? 0.1 : 0.03;
      return { pos: [0, Math.sin((t / dur) * TAU) * 0.08, 0], rot: [0, loop01(t, dur) * (clip === 'idle' ? 0.2 : 0) - 0.1, Math.sin((t / dur) * TAU * 3) * flick] };
    });
  },

  undertow: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.9, 0);
    k.node('head', 'body', 0, 1.25, 0.95);
    // Drum-tank body lying along Z with rivet bands.
    k.cylinder('body', 0.72, 0.72, 2.0, c.primary, { y: 1.15, z: -0.1, rx: PI / 2 }, 10);
    for (const z of [-0.85, 0.65]) k.torus('body', 0.73, 0.04, c.secondary, { y: 1.15, z }, 10);
    // Sludge mane dripping over the back (translucent green).
    for (let i = 0; i < 4; i++) {
      const z = 0.5 - i * 0.4;
      k.sphere('body', 0.3 - i * 0.02, '#6fb43a', { x: 0, y: 1.78, z, sx: 1.4, sy: 0.6, mat: 'glass' }, 6);
      k.cone('body', 0.07, 0.35, '#6fb43a', { x: (i % 2 ? 0.45 : -0.45), y: 1.45, z, rx: PI, mat: 'glass' }, 6);
    }
    // Pipe tendrils on its back, bent forward, valves glowing.
    k.mirror((s) => {
      k.cylinder('body', 0.07, 0.07, 0.8, c.secondary, { x: s * 0.4, y: 2.0, z: -0.6, rx: 0.5, rz: -s * 0.3 }, 8);
      k.torus('body', 0.09, 0.025, c.accent, { x: s * 0.52, y: 2.36, z: -0.4, mat: 'glow' }, 8);
    });
    // Four stubby legs.
    k.mirror((s, side) => {
      for (const [zz, tag] of [
        [0.55, 'f'],
        [-0.75, 'b'],
      ] as const) {
        const n = tag === 'f' ? `leg_${side}` : `leg_${side}2`;
        if (!k.has(n)) k.node(n, 'body', s * 0.55, 0.55, zz);
        k.box(n, 0.32, 0.55, 0.36, c.secondary, { x: s * 0.58, y: 0.28, z: zz });
        k.box(n, 0.4, 0.1, 0.46, c.primary, { x: s * 0.58, y: 0.05, z: zz + 0.05 });
      }
    });
    // Head: a squat speaker-grille maw with a glowing woofer and lantern eyes.
    k.box('head', 0.9, 0.7, 0.5, c.primary, { y: 1.2, z: 1.05 });
    k.cylinder('head', 0.27, 0.27, 0.05, '#0d0f12', { y: 1.13, z: 1.31, rx: PI / 2 }, 10);
    k.torus('head', 0.2, 0.03, c.accent, { y: 1.13, z: 1.34, mat: 'glow' }, 10);
    k.torus('head', 0.11, 0.025, c.accent, { y: 1.13, z: 1.35, mat: 'glow' }, 8);
    k.addEyes('head', 'glow', { y: 1.48, z: 1.31, spacing: 0.5, size: 0.06 });
    // Jaw plates.
    k.mirror((s) => k.slab('head', 0.3, 0.08, 0.44, c.secondary, { x: s * 0.32, y: 0.84, z: 1.1, rz: s * 0.2 }));
    k.motion('head', (clip, t, dur) => {
      const f = clip === 'attack' ? 5 : 1;
      const amp = clip === 'attack' ? 0.18 : 0.05;
      return { rot: [-amp * Math.max(0, Math.sin((t / dur) * TAU * f)), 0, 0], scale: 1 + 0.03 * Math.sin((t / dur) * TAU * 2) };
    });
  },
};
