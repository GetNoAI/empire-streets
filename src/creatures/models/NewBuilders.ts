import type { Kit } from './Kit';

/**
 * The fourteen Streetmon added in the expansion (dex 38-51): nine evolutions of species that
 * used to stop at one stage, three new street lines from the Waterfront and Midtown, and a sewer
 * dweller. Same conventions as Builders.ts: model space, feet at y = 0, facing +Z, scaled to the
 * species' height by Kit.build; glowing parts use the eye or accent colour so the draw count
 * stays within budget.
 */

const PI = Math.PI;
const TAU = PI * 2;

/** Four short legs at the corners of a body (quadrupeds). */
function legs4(k: Kit, w: number, z: number, h: number, thick: number, color: Parameters<Kit['box']>[4], foot?: Parameters<Kit['box']>[4]): void {
  k.mirror((s, side) => {
    for (const [fb, zz] of [
      ['F', z],
      ['B', -z],
    ] as const) {
      const n = k.node(`leg_${fb}${side}`, 'body', s * w, h, zz);
      k.box(n, thick, h, thick * 1.1, color, { x: s * w, y: h / 2, z: zz });
      if (foot) k.box(n, thick * 1.2, h * 0.18, thick * 1.4, foot, { x: s * w, y: h * 0.09, z: zz + thick * 0.15 });
    }
  });
}

/** Two legs (bipeds). */
function legs2(k: Kit, w: number, h: number, thick: number, color: Parameters<Kit['box']>[4], foot: Parameters<Kit['box']>[4]): void {
  k.mirror((s, side) => {
    const n = k.node(`leg_${side}`, 'body', s * w, h, 0);
    k.box(n, thick, h, thick, color, { x: s * w, y: h / 2 });
    k.box(n, thick * 1.25, h * 0.16, thick * 1.6, foot, { x: s * w, y: h * 0.08, z: thick * 0.25 });
  });
}

export const NEW_FLOATING = new Set(['fogbank']);

export const NEW_BUILDERS: Record<string, (k: Kit) => void> = {
  // ------------------------------------------------------------------ evolutions

  /** Curbstone grown into a kerb-plated tank with a hazard-striped ram. */
  curbcrusher: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.42, 0);
    k.node('head', 'body', 0, 0.42, 0.45);
    k.sphere('body', 0.36, c.secondary, { y: 0.42, sz: 1.4, sy: 0.8 }, 9);
    for (let i = 0; i < 7; i++) {
      const a = -1.05 + (i / 6) * 2.1;
      k.slab('body', 0.66, 0.1, 0.12, i % 2 ? c.primary : c.secondary, { y: 0.42 + Math.cos(a) * 0.32, z: Math.sin(a) * 0.45, rx: a });
    }
    k.box('body', 0.67, 0.11, 0.05, c.accent, { y: 0.74, z: 0.0 });
    legs4(k, 0.22, 0.26, 0.24, 0.13, c.secondary, c.dark);
    // Ram: a slab of kerb with yellow-black hazard bars.
    k.box('head', 0.44, 0.24, 0.12, c.primary, { y: 0.4, z: 0.7 });
    for (let i = 0; i < 4; i++) k.box('head', 0.08, 0.25, 0.125, i % 2 ? c.dark : c.accent, { x: -0.15 + i * 0.1, y: 0.4, z: 0.7, rz: 0.4 });
    k.cone('head', 0.12, 0.22, c.secondary, { y: 0.44, z: 0.56, rx: PI / 2 }, 6);
    k.addEyes('head', 'slit', { y: 0.52, z: 0.62, spacing: 0.2, size: 0.03 });
  },

  /** Cashew grown fat on the take: a jackpot squirrel with a slot-machine belly. */
  jackpot: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.3, 0);
    k.node('head', 'body', 0, 0.55, 0.05);
    k.node('tail_0', 'body', 0, 0.26, -0.2);
    k.node('tail_1', 'tail_0', 0, 0.5, -0.3);
    k.sphere('body', 0.2, c.secondary, { y: 0.3, sy: 1.15 }, 9);
    // Slot window on the belly: three reels.
    k.box('body', 0.22, 0.12, 0.04, c.dark, { y: 0.32, z: 0.18 });
    for (let i = 0; i < 3; i++) k.box('body', 0.055, 0.08, 0.02, c.accent, { x: -0.07 + i * 0.07, y: 0.32, z: 0.2, mat: 'glow' });
    k.sphere('head', 0.15, c.secondary, { y: 0.6, z: 0.06 }, 9);
    k.mirror((s, side) => {
      k.sphere('head', 0.08, c.secondary, { x: s * 0.12, y: 0.55, z: 0.1 }, 6);
      k.cone('head', 0.04, 0.1, c.secondary, { x: s * 0.08, y: 0.76, z: 0.03 }, 4);
      const n = k.node(`leg_${side}`, 'body', s * 0.09, 0.12, 0);
      k.sphere(n, 0.07, c.secondary, { x: s * 0.1, y: 0.07, z: 0.03, sz: 1.4 }, 6);
      k.node(`arm_${side}`, 'body', s * 0.12, 0.4, 0.1);
      k.box(`arm_${side}`, 0.04, 0.12, 0.04, c.secondary, { x: s * 0.13, y: 0.34, z: 0.14 });
      // A coin in each paw.
      k.cylinder(`arm_${side}`, 0.045, 0.045, 0.012, c.primary, { x: s * 0.14, y: 0.27, z: 0.18, rx: PI / 2 }, 10);
    });
    k.addEyes('head', 'round', { y: 0.64, z: 0.18, spacing: 0.11, size: 0.03 });
    // Gold-tipped tail.
    k.sphere('tail_0', 0.13, c.secondary, { y: 0.32, z: -0.26 }, 7);
    k.sphere('tail_1', 0.15, c.primary, { y: 0.54, z: -0.3 }, 7);
  },

  /** Hazeling grown into a rolling fog bank with a lantern heart. */
  fogbank: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.6, 0);
    k.node('head', 'body', 0, 0.85, 0.12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      k.sphere('body', 0.24, c.primary, { x: Math.cos(a) * 0.3, y: 0.55 + (i % 2) * 0.1, z: Math.sin(a) * 0.25, mat: 'glass' }, 7);
    }
    k.sphere('body', 0.32, c.secondary, { y: 0.62, mat: 'glass' }, 8);
    k.sphere('body', 0.1, c.eye, { y: 0.6, mat: 'glow' }, 8); // the lantern heart
    k.sphere('head', 0.22, c.primary, { y: 0.92, z: 0.12, mat: 'glass' }, 8);
    k.addEyes('head', 'glow', { y: 0.95, z: 0.32, spacing: 0.14, size: 0.035 });
    // Trailing wisps.
    k.mirror((s, side) => {
      const n = k.node(`arm_${side}`, 'body', s * 0.4, 0.6, 0);
      k.cone(n, 0.1, 0.4, c.primary, { x: s * 0.52, y: 0.42, rz: s * 0.5, mat: 'glass' }, 6);
    });
    k.motion('body', (clip, t, dur) => ({ rot: [0, ((t / dur) % 1) * TAU * (clip === 'idle' ? 0.25 : 0), 0], scale: 1 + 0.04 * Math.sin((t / dur) * TAU * 2) }));
  },

  /** Streetlamp grown into a stadium floodlight moth. */
  floodlight: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.7, 0);
    k.node('head', 'body', 0, 1.25, 0.05);
    k.cylinder('body', 0.05, 0.08, 1.0, c.primary, { y: 0.55 }, 6);
    k.cylinder('body', 0.14, 0.18, 0.08, c.primary, { y: 0.05 }, 8);
    for (let i = 0; i < 4; i++) k.torus('body', 0.07, 0.014, c.secondary, { y: 0.25 + i * 0.2, rx: PI / 2 }, 8);
    // A bank of four lamps for a head.
    k.box('head', 0.4, 0.28, 0.12, c.primary, { y: 1.3, z: 0.05 });
    for (let i = 0; i < 4; i++) k.cylinder('head', 0.065, 0.065, 0.03, c.accent, { x: i % 2 ? 0.1 : -0.1, y: 1.24 + Math.floor(i / 2) * 0.13, z: 0.12, rx: PI / 2, mat: 'glow' }, 10);
    k.mirror((s, side) => {
      const n = k.node(`wing_${side}`, 'body', s * 0.06, 0.9, -0.02);
      k.box(n, 0.5, 0.36, 0.014, c.primary, { x: s * 0.3, y: 0.95, z: -0.04, rz: s * 0.3 });
      k.box(n, 0.38, 0.22, 0.014, c.secondary, { x: s * 0.26, y: 0.68, z: -0.04, rz: -s * 0.2 });
      k.cylinder(n, 0.05, 0.05, 0.016, c.accent, { x: s * 0.36, y: 0.98, z: -0.03, rx: PI / 2, mat: 'glow' }, 8);
      k.cylinder('head', 0.008, 0.008, 0.2, c.primary, { x: s * 0.12, y: 1.52, z: 0.05, rz: -s * 0.35 }, 4);
    });
    k.addEyes('head', 'glow', { y: 1.42, z: 0.12, spacing: 0.14, size: 0.025 });
  },

  /** Rebarb grown into a walking roadblock bristling with rebar barrels. */
  barricade: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.55, 0);
    k.node('head', 'body', 0, 1.0, 0.12);
    // Jersey-barrier torso.
    k.box('body', 0.62, 0.5, 0.32, c.primary, { y: 0.72 });
    k.box('body', 0.7, 0.12, 0.4, c.primary, { y: 0.44 });
    k.box('body', 0.63, 0.06, 0.33, c.accent, { y: 0.88 });
    // Rebar gun barrels across the back.
    for (let i = 0; i < 5; i++) k.cylinder('body', 0.025, 0.025, 0.55, c.secondary, { x: -0.24 + i * 0.12, y: 1.0, z: -0.12, rx: -0.45 }, 6);
    legs2(k, 0.18, 0.4, 0.15, c.secondary, c.dark);
    k.mirror((s, side) => {
      k.node(`arm_${side}`, 'body', s * 0.36, 0.9, 0);
      k.box(`arm_${side}`, 0.14, 0.38, 0.16, c.primary, { x: s * 0.42, y: 0.7 });
      k.cylinder(`arm_${side}`, 0.03, 0.03, 0.28, c.secondary, { x: s * 0.42, y: 0.48, z: 0.12, rx: PI / 2 }, 6);
    });
    k.box('head', 0.3, 0.2, 0.22, c.secondary, { y: 1.06, z: 0.12 });
    k.addEyes('head', 'slit', { y: 1.08, z: 0.24, spacing: 0.12, size: 0.03 });
  },

  /** Slugger grown into a hulking slugger with a double-barrel bat. */
  bigshot: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.55, 0);
    k.node('head', 'body', 0, 1.05, 0.05);
    k.sphere('body', 0.34, c.primary, { y: 0.72, sy: 1.1 }, 9);
    k.box('body', 0.5, 0.08, 0.36, c.secondary, { y: 0.52 }); // belt
    k.box('body', 0.08, 0.06, 0.04, c.accent, { y: 0.52, z: 0.19 }); // buckle
    legs2(k, 0.16, 0.42, 0.14, c.secondary, c.dark);
    k.mirror((s, side) => {
      k.node(`arm_${side}`, 'body', s * 0.36, 0.92, 0);
      k.sphere(`arm_${side}`, 0.12, c.primary, { x: s * 0.42, y: 0.9 }, 7);
      k.box(`arm_${side}`, 0.12, 0.34, 0.12, c.primary, { x: s * 0.46, y: 0.68 });
    });
    // The bat: two barrels taped together, held in the right hand.
    for (const dz of [-0.035, 0.035]) k.cylinder('arm_R', 0.04, 0.05, 0.7, c.secondary, { x: -0.5, y: 0.75, z: 0.25 + dz, rx: 1.1 }, 8);
    k.box('arm_R', 0.12, 0.05, 0.12, c.accent, { x: -0.5, y: 0.6, z: 0.15, rx: 1.1 });
    k.sphere('head', 0.17, c.primary, { y: 1.12, z: 0.06 }, 9);
    k.box('head', 0.36, 0.05, 0.3, c.secondary, { y: 1.24, z: 0.1 }); // cap brim
    k.addEyes('head', 'slit', { y: 1.12, z: 0.2, spacing: 0.12, size: 0.03 });
  },

  /** Flue grown into a factory smokestack on brick legs. */
  smokestack: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.5, 0);
    k.node('head', 'body', 0, 1.5, 0);
    k.cylinder('body', 0.22, 0.32, 1.3, c.primary, { y: 0.95 }, 10);
    for (let i = 0; i < 4; i++) k.torus('body', 0.25 + i * 0.02, 0.025, c.secondary, { y: 1.4 - i * 0.3, rx: PI / 2 }, 12);
    k.box('body', 0.5, 0.3, 0.5, c.secondary, { y: 0.35 }); // brick base
    legs4(k, 0.18, 0.18, 0.2, 0.12, c.secondary, c.dark);
    // The mouth glows orange with the fire inside.
    k.cylinder('head', 0.2, 0.22, 0.12, c.dark, { y: 1.62 }, 10);
    k.cylinder('head', 0.17, 0.17, 0.02, c.accent, { y: 1.67, mat: 'glow' }, 10);
    k.addEyes('head', 'glow', { y: 1.4, z: 0.25, spacing: 0.16, size: 0.04 });
    k.mirror((s, side) => {
      k.node(`arm_${side}`, 'body', s * 0.28, 1.1, 0);
      k.cylinder(`arm_${side}`, 0.05, 0.05, 0.4, c.secondary, { x: s * 0.42, y: 1.0, rz: s * 0.8 }, 6);
    });
  },

  /** Wirewhip grown into a live high-voltage line snake, crackling end to end. */
  livewire: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.3, 0);
    k.node('head', 'body', 0, 1.0, 0.3);
    // Coiled cable body rising in an S.
    const n = 9;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const x = Math.sin(f * PI * 2) * 0.25;
      const y = 0.1 + f * 0.85;
      const z = -0.25 + f * 0.5;
      k.sphere('body', 0.11 - f * 0.03, i % 3 === 0 ? c.secondary : c.primary, { x, y, z }, 7);
      if (i % 3 === 1) k.torus('body', 0.1, 0.015, c.accent, { x, y, z, rx: PI / 2, mat: 'glow' }, 8);
    }
    // Insulator head with plug prongs.
    k.cylinder('head', 0.1, 0.13, 0.24, c.secondary, { y: 1.05, z: 0.32, rx: PI / 2 - 0.4 }, 8);
    k.mirror((s) => k.box('head', 0.025, 0.025, 0.14, c.accent, { x: s * 0.04, y: 1.12, z: 0.48, rx: -0.4, mat: 'glow' }));
    k.addEyes('head', 'glow', { y: 1.12, z: 0.36, spacing: 0.1, size: 0.025 });
    k.motion('body', (clip, t, dur) => ({ rot: [0, 0.2 * Math.sin((t / dur) * TAU * (clip === 'attack' ? 4 : 1)), 0] }));
  },

  /** Hustlepup grown into a courier hound with a messenger bag and goggles. */
  hustlehound: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.45, 0);
    k.node('head', 'body', 0, 0.62, 0.36);
    k.node('tail', 'body', 0, 0.55, -0.32);
    k.box('body', 0.3, 0.26, 0.66, c.primary, { y: 0.48 });
    legs4(k, 0.11, 0.24, 0.36, 0.09, c.primary, c.secondary);
    k.box('head', 0.26, 0.22, 0.26, c.primary, { y: 0.68, z: 0.42 });
    k.box('head', 0.15, 0.11, 0.15, '#efe0b8', { y: 0.63, z: 0.58 });
    k.sphere('head', 0.035, c.dark, { y: 0.66, z: 0.66 }, 5);
    // Goggles pushed up on the head.
    k.mirror((s) => k.cylinder('head', 0.045, 0.045, 0.03, c.accent, { x: s * 0.06, y: 0.82, z: 0.48, rx: 0.6 }, 8));
    k.box('head', 0.24, 0.025, 0.03, c.dark, { y: 0.82, z: 0.46 });
    k.addEyes('head', 'round', { y: 0.72, z: 0.55, spacing: 0.13, size: 0.028 });
    k.mirror((s) => k.cone('head', 0.06, 0.15, c.secondary, { x: s * 0.1, y: 0.84, z: 0.36 }, 4));
    // Messenger bag across the back with a strap.
    k.box('body', 0.36, 0.22, 0.3, c.secondary, { y: 0.68, z: -0.08 });
    k.box('body', 0.37, 0.05, 0.31, c.accent, { y: 0.78, z: -0.08 });
    k.box('body', 0.04, 0.04, 0.6, '#3c2a1a', { x: 0.13, y: 0.62, z: 0.08, rx: 0.2 });
    k.cylinder('tail', 0.035, 0.02, 0.26, c.primary, { y: 0.62, z: -0.42, rx: -0.8 }, 5);
    k.motion('tail', (clip, t, dur) => (clip === 'faint' ? null : { rot: [0, 0.6 * Math.sin((t / dur) * TAU * (clip === 'walk' ? 4 : 6)), 0] }));
  },

  // ------------------------------------------------------------------ new lines

  /** A spray-can gremlin: graffiti and paint drips. */
  tagling: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.2, 0);
    k.node('head', 'body', 0, 0.55, 0.02);
    k.cylinder('body', 0.12, 0.12, 0.4, c.primary, { y: 0.36 }, 10);
    k.box('body', 0.25, 0.14, 0.02, c.accent, { y: 0.36, z: 0.12 }); // label
    k.box('body', 0.12, 0.05, 0.021, c.secondary, { y: 0.34, z: 0.131 });
    k.cone('head', 0.12, 0.08, c.secondary, { y: 0.6 }, 10); // shoulder
    k.cylinder('head', 0.035, 0.035, 0.06, c.dark, { y: 0.67 }, 6); // nozzle
    k.addEyes('head', 'round', { y: 0.47, z: 0.11, spacing: 0.08, size: 0.025 });
    // Paint drips down the can.
    for (let i = 0; i < 4; i++) k.cylinder('body', 0.014, 0.008, 0.08 + i * 0.03, c.accent, { x: -0.08 + i * 0.05, y: 0.24 - i * 0.01, z: 0.115 }, 4);
    legs2(k, 0.06, 0.18, 0.06, c.secondary, c.dark);
    k.mirror((s, side) => {
      k.node(`arm_${side}`, 'body', s * 0.13, 0.42, 0);
      k.box(`arm_${side}`, 0.04, 0.16, 0.04, c.secondary, { x: s * 0.16, y: 0.36 });
    });
  },

  /** A mural come alive: a paint-splashed artist with a neon halo brush. */
  muralist: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.5, 0);
    k.node('head', 'body', 0, 1.1, 0.03);
    k.cylinder('body', 0.2, 0.26, 0.6, c.primary, { y: 0.78 }, 10);
    // Paint splats over the body.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      k.sphere('body', 0.06, i % 2 ? c.accent : c.secondary, { x: Math.cos(a) * 0.22, y: 0.7 + (i % 3) * 0.1, z: Math.sin(a) * 0.22, sz: 0.4 }, 6);
    }
    legs2(k, 0.12, 0.48, 0.1, c.secondary, c.dark);
    k.sphere('head', 0.18, c.primary, { y: 1.18, z: 0.03 }, 9);
    k.cylinder('head', 0.2, 0.2, 0.06, c.secondary, { y: 1.33, z: 0.02, rz: 0.2 }, 10); // beret
    k.torus('head', 0.24, 0.014, c.eye, { y: 1.45, rx: PI / 2, mat: 'glow' }, 18); // neon halo
    k.addEyes('head', 'glow', { y: 1.2, z: 0.18, spacing: 0.12, size: 0.03 });
    k.mirror((s, side) => {
      k.node(`arm_${side}`, 'body', s * 0.24, 1.0, 0);
      k.box(`arm_${side}`, 0.08, 0.36, 0.08, c.primary, { x: s * 0.28, y: 0.82 });
    });
    // A long brush with a glowing tip.
    k.cylinder('arm_R', 0.02, 0.02, 0.6, c.secondary, { x: -0.3, y: 0.75, z: 0.2, rx: 1.0 }, 6);
    k.sphere('arm_R', 0.05, c.eye, { x: -0.3, y: 0.92, z: 0.45, mat: 'glow' }, 6);
  },

  /** A dock bollard that walks: squat iron post with a rope collar. */
  bollard: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.2, 0);
    k.node('head', 'body', 0, 0.62, 0.02);
    k.cylinder('body', 0.2, 0.24, 0.42, c.primary, { y: 0.38 }, 12);
    k.cylinder('body', 0.28, 0.28, 0.06, c.primary, { y: 0.6 }, 12); // cap lip
    k.sphere('head', 0.2, c.primary, { y: 0.65, sy: 0.6 }, 10);
    // Mooring rope coiled around the neck.
    for (let i = 0; i < 2; i++) k.torus('body', 0.23, 0.035, c.accent, { y: 0.45 + i * 0.06, rx: PI / 2 }, 12);
    k.addEyes('head', 'round', { y: 0.62, z: 0.18, spacing: 0.12, size: 0.03 });
    // Rust streaks.
    for (let i = 0; i < 3; i++) k.box('body', 0.04, 0.2, 0.02, c.secondary, { x: -0.08 + i * 0.08, y: 0.35, z: 0.215 });
    legs2(k, 0.12, 0.18, 0.1, c.primary, c.dark);
  },

  /** A seagull hustler in a stolen flat cap, with chips in its beak. */
  gullgrifter: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.3, 0);
    k.node('head', 'body', 0, 0.62, 0.15);
    k.node('tail', 'body', 0, 0.4, -0.25);
    k.sphere('body', 0.2, c.primary, { y: 0.42, sz: 1.4 }, 9);
    k.sphere('body', 0.14, c.white, { y: 0.38, z: 0.1, sz: 1.2 }, 7);
    k.sphere('head', 0.13, c.primary, { y: 0.66, z: 0.18 }, 9);
    k.cone('head', 0.04, 0.16, c.accent, { y: 0.64, z: 0.36, rx: PI / 2 }, 6); // beak
    k.box('head', 0.08, 0.02, 0.05, '#f2d16b', { y: 0.62, z: 0.42 }); // a chip
    k.cylinder('head', 0.14, 0.14, 0.05, c.secondary, { y: 0.78, z: 0.16 }, 10); // flat cap
    k.box('head', 0.16, 0.02, 0.1, c.secondary, { y: 0.76, z: 0.29 });
    k.addEyes('head', 'round', { y: 0.7, z: 0.28, spacing: 0.12, size: 0.022 });
    k.mirror((s, side) => {
      const n = k.node(`wing_${side}`, 'body', s * 0.16, 0.5, 0);
      k.box(n, 0.04, 0.16, 0.4, c.secondary, { x: s * 0.2, y: 0.46, z: -0.05, rz: s * 0.2 });
      const l = k.node(`leg_${side}`, 'body', s * 0.07, 0.24, 0.02);
      k.cylinder(l, 0.015, 0.015, 0.22, c.accent, { x: s * 0.07, y: 0.12, z: 0.02 }, 4);
      k.box(l, 0.07, 0.015, 0.09, c.accent, { x: s * 0.07, y: 0.01, z: 0.05 });
    });
    k.cone('tail', 0.08, 0.16, c.secondary, { y: 0.42, z: -0.35, rx: -PI / 2 }, 4);
  },

  /** A sewer clog: a ball of grease, wipes and lost things, packed hard as concrete. */
  clogger: (k) => {
    const c = k.c;
    k.node('body', 'root', 0, 0.35, 0);
    k.node('head', 'body', 0, 0.65, 0.2);
    k.sphere('body', 0.42, c.primary, { y: 0.45 }, 10);
    // Lumps and lost junk stuck in it.
    const junk: Array<[number, number, number, number]> = [
      [0.3, 0.6, 0.15, 0.1],
      [-0.28, 0.4, 0.2, 0.12],
      [0.1, 0.25, -0.35, 0.11],
      [-0.2, 0.75, -0.2, 0.09],
    ];
    for (const [x, y, z, r] of junk) k.sphere('body', r, c.secondary, { x, y, z }, 6);
    k.box('body', 0.18, 0.06, 0.12, c.accent, { x: 0.25, y: 0.3, z: 0.3, ry: 0.5 }); // a lost phone
    k.torus('body', 0.08, 0.02, c.white, { x: -0.3, y: 0.55, z: 0.28, ry: 0.8 }, 10); // a lost ring
    k.addEyes('head', 'glow', { y: 0.66, z: 0.38, spacing: 0.16, size: 0.04 });
    k.box('head', 0.2, 0.04, 0.03, c.dark, { y: 0.52, z: 0.42 }); // mouth
    legs4(k, 0.2, 0.25, 0.14, 0.12, c.secondary);
  },
};
