import type { Kit } from './Kit';

/**
 * The Central Green pond's Streetmon (dex 52-56). Each is modelled around its waterline at
 * y = 0 (hulls, bellies and paddling feet below it), then lifted by `LIFT` so the model's feet are
 * at 0 like every other species; the game sinks it back by `model.sink` (the lift's share of the
 * height, in creatures.json) when it's on the water. All of them bob (floating).
 */

const PI = Math.PI;
const TAU = PI * 2;

export const POND_FLOATING = new Set(['quackpack', 'pedalswan', 'koinfish', 'wishmaw', 'snapcase']);

/** How far below the waterline each model reaches (model units, before scaling). */
const LIFT: Record<string, number> = { quackpack: 0.1, pedalswan: 0.17, koinfish: 0.13, wishmaw: 0.3, snapcase: 0.13 };

type Opts = { y?: number } & Record<string, unknown>;

/** The kit with every height raised by `dy` (node pivots, part positions and eyes). */
function lifted(k: Kit, dy: number): Kit {
  const up = (o?: Opts): Opts => ({ ...(o ?? {}), y: (o?.y ?? 0) + dy });
  // Where each method takes its options (the argument index).
  const at: Record<string, number> = { box: 5, slab: 5, sphere: 3, cylinder: 5, cone: 4, torus: 4, capsule: 4, addEmissive: 3, addEyes: 2 };
  return new Proxy(k, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== 'function') return v;
      if (prop === 'node') return (name: string, parent: string, x: number, y: number, z: number, rs?: number) => target.node(name, parent, x, y + dy, z, rs);
      const i = at[prop as string];
      if (i === undefined) return v.bind(target);
      return (...args: unknown[]) => {
        const a = [...args];
        a[i] = up(a[i] as Opts);
        return (v as (...x: unknown[]) => unknown).apply(target, a);
      };
    },
  });
}

/** A paddling cycle for a foot or fin (faster when swimming). */
const paddle = (phase: number, amp: number) => (clip: string, t: number, dur: number) => {
  if (clip === 'faint') return { rot: [0.6 * Math.min(1, t / dur), 0, 0] as [number, number, number] };
  const a = clip === 'walk' ? amp : clip === 'attack' ? amp * 1.4 : amp * 0.35;
  return { rot: [a * Math.sin((t / dur) * TAU * (clip === 'walk' ? 2 : 1) + phase), 0, 0] as [number, number, number] };
};

/** A tail or fin that sweeps side to side. */
const sweep = (amp: number, phase = 0) => (clip: string, t: number, dur: number) => {
  if (clip === 'faint') return { rot: [0, 0.4 * Math.min(1, t / dur), 0] as [number, number, number] };
  const a = clip === 'walk' ? amp : clip === 'attack' ? amp * 1.5 : amp * 0.4;
  return { rot: [0, a * Math.sin((t / dur) * TAU * (clip === 'walk' ? 2 : 1) + phase), 0] as [number, number, number] };
};

const RAW: Record<string, (k: Kit) => void> = {
  /** A rubber duck patched with bottle caps, a bread-bag backpack on its back. */
  quackpack: (k) => {
    const c = k.c; // yellow, bag white, beak orange, eye
    k.node('body', 'root', 0, 0.1, 0);
    k.node('head', 'body', 0, 0.26, 0.1);
    k.sphere('body', 0.17, c.primary, { y: 0.07, sz: 1.25, sy: 0.75, surface: 'gloss' }, 12);
    // Tail flick.
    k.cone('body', 0.07, 0.12, c.primary, { y: 0.14, z: -0.2, rx: -1.1, surface: 'gloss' }, 8);
    // Bread-bag backpack, tied with a red twist tie.
    k.sphere('body', 0.09, c.secondary, { y: 0.17, z: -0.05, sx: 1.2, sy: 0.7, sz: 1.1, surface: 'fabric', mat: 'glass' }, 8);
    k.box('body', 0.2, 0.02, 0.025, c.accent, { y: 0.2, z: 0.02 });
    // Bottle caps stuck on its flanks.
    k.mirror((s) => {
      for (let i = 0; i < 3; i++) k.cylinder('body', 0.028, 0.028, 0.012, i === 1 ? '#3a8fd6' : '#d33b2c', { x: s * 0.16, y: 0.06 + (i % 2) * 0.04, z: -0.04 + i * 0.06, rz: PI / 2 - s * 0.2 }, 8);
    });
    // Little wings.
    k.mirror((s, side) => {
      const w = k.node(`wing_${side}`, 'body', s * 0.12, 0.12, 0);
      k.slab(w, 0.04, 0.09, 0.16, c.primary, { x: s * 0.15, y: 0.11, z: -0.02, rz: s * 0.4, surface: 'gloss' });
    });
    // Head, beak, eyes.
    k.sphere('head', 0.1, c.primary, { y: 0.27, z: 0.13, surface: 'gloss' }, 10);
    const beak = k.node('beak', 'head', 0, 0.25, 0.22);
    k.box(beak, 0.09, 0.035, 0.09, c.accent, { y: 0.255, z: 0.25, surface: 'gloss' });
    k.box(beak, 0.08, 0.02, 0.08, c.accent, { y: 0.232, z: 0.245, surface: 'gloss' });
    k.motion(beak, (clip, t, dur) => (clip === 'attack' || clip === 'idle' ? { rot: [-0.25 * Math.max(0, Math.sin((t / dur) * TAU * (clip === 'attack' ? 3 : 1))), 0, 0] } : { rot: [0, 0, 0] }));
    k.addEyes('head', 'round', { y: 0.3, z: 0.215, spacing: 0.1, size: 0.025 });
    // Webbed feet paddling under the water.
    k.mirror((s, side) => {
      const n = k.node(`leg_${side}`, 'body', s * 0.06, 0.0, 0);
      k.box(n, 0.025, 0.08, 0.025, c.accent, { x: s * 0.06, y: -0.04 });
      k.slab(n, 0.08, 0.012, 0.09, c.accent, { x: s * 0.06, y: -0.085, z: 0.03 });
      k.motion(n, paddle(s > 0 ? 0 : PI, 0.6));
    });
  },

  /** A swan pedal boat with a sound system: white hull, S-neck, speaker cones, a paddle wheel. */
  pedalswan: (k) => {
    const c = k.c; // hull white, speakers black, neon pink, eye
    k.node('body', 'root', 0, 0.2, 0);
    // Hull: a rounded boat shape riding low, with a rubbing strake.
    k.sphere('body', 0.42, c.primary, { y: 0.1, sz: 1.5, sy: 0.55, surface: 'gloss' }, 14);
    k.box('body', 0.86, 0.12, 1.1, c.primary, { y: 0.02, surface: 'gloss' });
    k.torus('body', 0.43, 0.025, c.accent, { y: 0.17, sz: 1.45, rx: PI / 2, mat: 'glow' }, 24);
    // The seat well.
    k.box('body', 0.5, 0.06, 0.4, c.secondary, { y: 0.25, z: -0.08 });
    // Raised wing panels with feathers.
    k.mirror((s, side) => {
      const w = k.node(`wing_${side}`, 'body', s * 0.38, 0.28, -0.05);
      k.slab(w, 0.06, 0.32, 0.6, c.primary, { x: s * 0.42, y: 0.38, z: -0.08, rz: s * 0.3, surface: 'gloss' });
      for (let i = 0; i < 4; i++) k.slab(w, 0.05, 0.08, 0.14, c.primary, { x: s * (0.47 + i * 0.02), y: 0.5 + i * 0.03, z: -0.32 - i * 0.05, rz: s * 0.45, rx: 0.3 });
      // A speaker cone in each side.
      k.cylinder('body', 0.12, 0.12, 0.05, c.secondary, { x: s * 0.44, y: 0.12, z: 0.2, rz: PI / 2 }, 14);
      k.cone('body', 0.09, 0.05, c.dark, { x: s * 0.47, y: 0.12, z: 0.2, rz: -s * PI / 2 }, 12);
      k.sphere('body', 0.03, c.accent, { x: s * 0.49, y: 0.12, z: 0.2, mat: 'glow' }, 6);
    });
    // The S-shaped neck up front and the head.
    let parent = 'body';
    const neck = [
      [0, 0.32, 0.5, 0.4],
      [0, 0.5, 0.56, 0.1],
      [0, 0.68, 0.52, -0.3],
      [0, 0.84, 0.46, -0.1],
    ];
    neck.forEach(([x, y, z, rx], i) => {
      const n = k.node(i === neck.length - 1 ? 'head' : `neck_${i}`, parent, x, y - 0.06, z);
      k.cylinder(n, 0.07 - i * 0.008, 0.08 - i * 0.008, 0.22, c.primary, { x, y, z, rx, surface: 'gloss' }, 10);
      parent = n;
    });
    k.sphere('head', 0.1, c.primary, { y: 0.98, z: 0.5, sz: 1.3, surface: 'gloss' }, 10);
    k.cone('head', 0.05, 0.16, c.accent, { y: 0.96, z: 0.66, rx: PI / 2, surface: 'gloss' }, 8);
    k.box('head', 0.06, 0.06, 0.05, c.dark, { y: 1.0, z: 0.6 });
    k.addEyes('head', 'glow', { y: 1.01, z: 0.58, spacing: 0.13, size: 0.025 });
    k.motion('head', (clip, t, dur) => {
      if (clip === 'attack') return { rot: [0.5 * Math.sin(PI * Math.min(1, t / (dur * 0.6))), 0, 0] };
      if (clip === 'faint') return { rot: [0.9 * Math.min(1, t / dur), 0, 0] };
      return { rot: [0.06 * Math.sin((t / dur) * TAU), 0.15 * Math.sin((t / dur) * TAU * 0.5), 0] };
    });
    // Paddle wheel at the stern, turning.
    const wheel = k.node('paddle', 'body', 0, 0.06, -0.62);
    k.cylinder(wheel, 0.03, 0.03, 0.4, c.secondary, { y: 0.06, z: -0.62, rz: PI / 2 }, 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      k.box(wheel, 0.34, 0.2, 0.03, c.accent, { y: 0.06 + Math.sin(a) * 0.12, z: -0.62 + Math.cos(a) * 0.12, rx: a });
    }
    k.motion(wheel, (clip, t, dur) => ({ rot: [(clip === 'walk' ? 2 : clip === 'faint' ? 0 : 0.5) * (t / dur) * TAU, 0, 0] }));
  },

  /** A koi with coins for scales: mostly under the water, the dorsal fin and coins showing. */
  koinfish: (k) => {
    const c = k.c; // orange, white blotches, gold coins, eye
    k.node('body', 'root', 0, 0, 0);
    k.node('head', 'body', 0, 0, 0.18);
    k.sphere('body', 0.12, c.primary, { y: -0.03, sz: 2.2, sy: 0.8, surface: 'gloss' }, 12);
    k.sphere('body', 0.09, c.secondary, { x: 0.03, y: 0.0, z: 0.08, sz: 1.4, sy: 0.5, surface: 'gloss' }, 8);
    // Coin scales along the back, catching the light.
    for (let i = 0; i < 7; i++) {
      const z = 0.16 - i * 0.055;
      for (const s of [-1, 1]) k.cylinder('body', 0.024, 0.024, 0.006, i % 3 === 0 ? '#c9ccd2' : c.accent, { x: s * 0.05, y: 0.045 - Math.abs(z) * 0.08, z, rz: s * 0.6, surface: 'metal' }, 8);
    }
    // Dorsal fin above the water: a thin swept triangle.
    k.cone('body', 0.07, 0.1, c.primary, { y: 0.075, z: -0.03, sx: 0.12, sz: 1.5, rx: -0.35 }, 4);
    // Pectoral fins.
    k.mirror((s, side) => {
      const f = k.node(`fin_${side}`, 'body', s * 0.08, -0.04, 0.1);
      k.slab(f, 0.09, 0.008, 0.06, c.secondary, { x: s * 0.12, y: -0.05, z: 0.1, rz: s * 0.3 });
      k.motion(f, paddle(s > 0 ? 0 : PI, 0.5));
    });
    // Tail.
    const tail = k.node('tail', 'body', 0, -0.02, -0.22);
    // A forked tail fin.
    k.slab(tail, 0.012, 0.11, 0.08, c.primary, { y: 0.02, z: -0.33, rx: -0.65 });
    k.slab(tail, 0.012, 0.11, 0.08, c.secondary, { y: -0.06, z: -0.33, rx: 0.65 });
    k.motion(tail, sweep(0.5));
    // Head: blunt nose, whiskers, eyes just above the waterline.
    k.sphere('head', 0.085, c.primary, { y: -0.01, z: 0.27, sz: 1.1, surface: 'gloss' }, 10);
    k.mirror((s) => k.cylinder('head', 0.006, 0.004, 0.09, c.secondary, { x: s * 0.04, y: -0.04, z: 0.36, rx: 1.2, rz: s * 0.5 }, 4));
    k.torus('head', 0.025, 0.008, c.accent, { y: -0.02, z: 0.355, surface: 'metal' }, 10);
    k.addEyes('head', 'round', { y: 0.025, z: 0.32, spacing: 0.11, size: 0.018 });
  },

  /** A koi the size of a rowboat, its mouth a ring of fountain stone with coins glowing inside. */
  wishmaw: (k) => {
    const c = k.c; // gold, bronze, water-blue glow, eye
    k.node('body', 'root', 0, 0, 0);
    k.node('head', 'body', 0, 0.02, 0.32);
    k.sphere('body', 0.24, c.primary, { y: -0.05, sz: 2.1, sy: 0.75, surface: 'metal' }, 14);
    // Overlapping coin plates down the back.
    for (let i = 0; i < 9; i++) {
      const z = 0.32 - i * 0.075;
      for (const s of [-1, 0, 1]) k.cylinder('body', 0.045, 0.045, 0.01, i % 2 ? c.secondary : c.primary, { x: s * 0.1, y: 0.1 - Math.abs(z) * 0.12 - Math.abs(s) * 0.03, z, rz: s * 0.5, rx: -0.15, surface: 'metal' }, 10);
    }
    // A tall swept dorsal fin with a glowing tip.
    k.cone('body', 0.16, 0.22, c.secondary, { y: 0.19, z: -0.06, sx: 0.12, sz: 1.6, rx: -0.4 }, 4);
    k.sphere('body', 0.02, c.accent, { y: 0.29, z: -0.12, mat: 'glow' }, 5);
    k.mirror((s, side) => {
      const f = k.node(`fin_${side}`, 'body', s * 0.18, -0.08, 0.2);
      k.slab(f, 0.2, 0.012, 0.12, c.secondary, { x: s * 0.27, y: -0.09, z: 0.2, rz: s * 0.25 });
      k.motion(f, paddle(s > 0 ? 0 : PI, 0.4));
    });
    const tail = k.node('tail', 'body', 0, -0.03, -0.45);
    // A big forked tail, its tips lit.
    k.slab(tail, 0.02, 0.24, 0.14, c.primary, { y: 0.06, z: -0.6, rx: -0.65, surface: 'metal' });
    k.slab(tail, 0.02, 0.24, 0.14, c.primary, { y: -0.12, z: -0.6, rx: 0.65, surface: 'metal' });
    k.sphere(tail, 0.022, c.accent, { y: 0.15, z: -0.68, mat: 'glow' }, 5);
    k.motion(tail, sweep(0.4));
    // Head with a fountain-stone mouth ring and coins inside.
    k.sphere('head', 0.16, c.primary, { y: 0.0, z: 0.42, sz: 1.1, surface: 'metal' }, 12);
    const jaw = k.node('jaw', 'head', 0, -0.02, 0.52);
    k.torus(jaw, 0.1, 0.035, '#b9b4a8', { y: -0.01, z: 0.56, surface: 'concrete' }, 14);
    k.cylinder(jaw, 0.08, 0.08, 0.02, c.dark, { y: -0.01, z: 0.55, rx: PI / 2 }, 12);
    for (let i = 0; i < 4; i++) k.cylinder(jaw, 0.02, 0.02, 0.006, c.accent, { x: -0.03 + i * 0.02, y: -0.03 + (i % 2) * 0.02, z: 0.555, rx: PI / 2, mat: 'glow' }, 8);
    k.motion(jaw, (clip, t, dur) => (clip === 'attack' ? { scale: 1 + 0.25 * Math.sin(PI * Math.min(1, t / (dur * 0.6))) } : { scale: 1 + 0.03 * Math.sin((t / dur) * TAU) }));
    k.mirror((s) => k.cylinder('head', 0.012, 0.006, 0.2, c.secondary, { x: s * 0.09, y: -0.07, z: 0.55, rx: 1.0, rz: s * 0.6 }, 4));
    k.addEyes('head', 'glow', { y: 0.08, z: 0.5, spacing: 0.2, size: 0.03 });
  },

  /** A snapping turtle with a cracked concrete shell, a beak that bites, and flipper legs. */
  snapcase: (k) => {
    const c = k.c; // concrete grey, green skin, pale plates, red eye
    k.node('body', 'root', 0, 0.02, 0);
    k.node('head', 'body', 0, 0.02, 0.24);
    // Shell: a concrete dome with slab plates and a rebar stub.
    k.sphere('body', 0.26, c.primary, { y: 0.02, sy: 0.55, sz: 1.15, surface: 'concrete' }, 12);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      k.slab('body', 0.12, 0.04, 0.12, c.secondary === c.primary ? c.dark : c.primary, { x: Math.sin(a) * 0.11, y: 0.13, z: Math.cos(a) * 0.13, rx: Math.cos(a) * 0.35, rz: -Math.sin(a) * 0.35, surface: 'concrete' });
    }
    k.slab('body', 0.12, 0.05, 0.12, c.primary, { y: 0.16, surface: 'concrete' });
    k.box('body', 0.07, 0.015, 0.035, c.accent, { x: 0.05, y: 0.19, z: -0.05 }); // a date stamp
    k.cylinder('body', 0.012, 0.012, 0.12, '#8a5a3a', { x: -0.12, y: 0.17, z: -0.1, rz: 0.6, surface: 'metal' }, 5);
    k.slab('body', 0.44, 0.03, 0.5, c.accent, { y: -0.08 }); // plastron
    // Flippers.
    k.mirror((s, side) => {
      for (const [fb, z] of [['F', 0.15], ['B', -0.17]] as const) {
        const n = k.node(`leg_${fb}${side}`, 'body', s * 0.2, -0.04, z);
        k.slab(n, 0.16, 0.03, 0.08, c.secondary, { x: s * 0.3, y: -0.06, z, rz: s * 0.2, ry: s * (fb === 'F' ? 0.4 : -0.3) });
        k.motion(n, paddle((s > 0 ? 0 : PI) + (fb === 'F' ? 0 : PI / 2), 0.5));
      }
    });
    // Tail.
    const tail = k.node('tail', 'body', 0, -0.02, -0.28);
    k.cone(tail, 0.03, 0.12, c.secondary, { y: -0.02, z: -0.34, rx: -PI / 2 }, 6);
    k.motion(tail, sweep(0.3));
    // Head on a thick neck, a hooked beak.
    k.cylinder('head', 0.06, 0.07, 0.14, c.secondary, { y: 0.02, z: 0.3, rx: PI / 2 - 0.3 }, 8);
    k.sphere('head', 0.075, c.secondary, { y: 0.06, z: 0.38, sz: 1.2 }, 10);
    const jaw = k.node('jaw', 'head', 0, 0.03, 0.42);
    k.cone(jaw, 0.04, 0.07, c.dark, { y: 0.03, z: 0.47, rx: PI / 2 + 0.4 }, 6);
    k.motion(jaw, (clip, t, dur) => (clip === 'attack' ? { rot: [0.6 * Math.sin(PI * Math.min(1, t / (dur * 0.4))), 0, 0] } : { rot: [0.04 * Math.sin((t / dur) * TAU), 0, 0] }));
    k.box('head', 0.07, 0.025, 0.05, c.dark, { y: 0.08, z: 0.46 });
    k.addEyes('head', 'slit', { y: 0.09, z: 0.44, spacing: 0.08, size: 0.018 });
    k.motion('head', (clip, t, dur) => {
      if (clip === 'attack') return { pos: [0, 0, 0.08 * Math.sin(PI * Math.min(1, t / (dur * 0.4)))] };
      if (clip === 'faint') return { rot: [0.5 * Math.min(1, t / dur), 0, 0] };
      return { rot: [0, 0.2 * Math.sin((t / dur) * TAU * 0.5), 0] };
    });
  },
};

export const POND_BUILDERS: Record<string, (k: Kit) => void> = Object.fromEntries(Object.entries(RAW).map(([id, b]) => [id, (k: Kit) => b(lifted(k, LIFT[id] ?? 0))]));
