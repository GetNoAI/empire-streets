import type { Kit } from './Kit';

/**
 * Sewer Streetmon (Sludge family): rats with a bottle-cap king, flushed alligators grown into
 * concrete, and walking mould. Same low-poly rig and clips as the rest; front is +Z.
 */

const PI = Math.PI;
const TAU = PI * 2;

/** Gutterat / Ratking: a sewer rat, or a big rat king with a bottle-cap crown and a knot of tails. */
function rat(k: Kit, evolved: boolean): void {
  const c = k.c; // grey-brown, dark, sludge accent, red eye
  const S = evolved ? 1.9 : 1;
  const legH = 0.08 * S;
  const bodyY = legH + 0.1 * S;
  k.node('body', 'root', 0, bodyY, 0);
  k.node('head', 'body', 0, bodyY + 0.02 * S, 0.2 * S);
  k.sphere('body', 0.13 * S, c.primary, { y: bodyY, sz: 1.6, sy: 0.85 }, 8);
  // Sludge drips on the back.
  for (let i = 0; i < 3; i++) k.sphere('body', 0.03 * S, c.accent, { x: (i - 1) * 0.05 * S, y: bodyY + 0.1 * S, z: (i - 1) * 0.06 * S, sy: 0.6, mat: 'glow' }, 5);
  // Head: pointed snout, round ears.
  k.cone('head', 0.08 * S, 0.2 * S, c.primary, { y: bodyY + 0.03 * S, z: 0.28 * S, rx: PI / 2 }, 7);
  k.sphere('head', 0.025 * S, '#d98c8c', { y: bodyY + 0.03 * S, z: 0.38 * S }, 5);
  k.mirror((s) => k.cylinder('head', 0.045 * S, 0.045 * S, 0.012 * S, '#c48b8b', { x: s * 0.06 * S, y: bodyY + 0.1 * S, z: 0.2 * S, rx: PI / 2 }, 8));
  k.addEyes('head', 'glow', { y: bodyY + 0.07 * S, z: 0.27 * S, spacing: 0.07 * S, size: 0.014 * S });
  if (evolved) {
    // Bottle-cap crown.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      k.cylinder('head', 0.025 * S, 0.025 * S, 0.012 * S, i % 2 ? '#d8b23a' : '#c23b3b', { x: Math.sin(a) * 0.05 * S, y: bodyY + 0.15 * S, z: 0.2 * S + Math.cos(a) * 0.05 * S, rz: 0.4 * Math.sin(a), rx: 0.4 * Math.cos(a) }, 8);
    }
    // A second, smaller rat riding on its back, part of the court.
    const r2 = k.node('rider', 'body', 0, bodyY + 0.14 * S, -0.06 * S);
    k.sphere(r2, 0.05 * S, c.secondary, { y: bodyY + 0.16 * S, z: -0.05 * S, sz: 1.4 }, 6);
    k.cone(r2, 0.03 * S, 0.07 * S, c.secondary, { y: bodyY + 0.17 * S, z: 0.04 * S, rx: PI / 2 }, 5);
    k.motion(r2, (clip, t, dur) => (clip === 'faint' ? null : { rot: [0, 0.4 * Math.sin((t / dur) * TAU * 2), 0] }));
  }
  // Legs.
  k.mirror((s, side) => {
    for (const [fb, z] of [['F', 0.1], ['B', -0.1]] as const) {
      const n = k.node(`leg_${fb}${side}`, 'body', s * 0.07 * S, legH, z * S);
      k.box(n, 0.035 * S, legH + 0.04 * S, 0.04 * S, '#c48b8b', { x: s * 0.07 * S, y: (legH + 0.04 * S) / 2, z: z * S });
    }
  });
  // Long segmented tail (several, knotted together, for the king).
  const tails = evolved ? 3 : 1;
  for (let t = 0; t < tails; t++) {
    let parent = 'body';
    for (let i = 0; i < 4; i++) {
      const z = -(0.2 + i * 0.09) * S;
      const x = (t - (tails - 1) / 2) * 0.04 * S * (i + 1) * 0.5;
      const n = k.node(`tail_${t * 4 + i}`, parent, x, bodyY - 0.02 * S, z);
      k.cylinder(n, 0.012 * S * (1 - i * 0.15), 0.016 * S * (1 - i * 0.15), 0.1 * S, '#c48b8b', { x, y: bodyY - 0.02 * S - i * 0.01 * S, z: z - 0.04 * S, rx: PI / 2 + 0.15 }, 4);
      parent = n;
    }
  }
}

/** Drainling / Sewergator: a flushed alligator; the evolved one has concrete plates for scales. */
function gator(k: Kit, evolved: boolean): void {
  const c = k.c; // green, belly, accent, eye
  const S = evolved ? 2.4 : 1;
  const legH = 0.06 * S;
  const bodyY = legH + 0.08 * S;
  k.node('body', 'root', 0, bodyY, 0);
  k.node('head', 'body', 0, bodyY, 0.3 * S);
  k.box('body', 0.22 * S, 0.12 * S, 0.5 * S, c.primary, { y: bodyY });
  k.box('body', 0.18 * S, 0.03 * S, 0.44 * S, c.secondary, { y: bodyY - 0.06 * S });
  // Back ridges, or concrete slabs.
  for (let i = 0; i < 5; i++) {
    const z = (0.18 - i * 0.09) * S;
    if (evolved) k.slab('body', 0.18 * S, 0.05 * S, 0.07 * S, c.secondary, { y: bodyY + 0.08 * S, z, rz: (i % 2 ? 1 : -1) * 0.08 });
    else k.cone('body', 0.025 * S, 0.05 * S, c.secondary, { y: bodyY + 0.08 * S, z }, 4);
  }
  // Long snout with teeth.
  k.box('head', 0.16 * S, 0.08 * S, 0.24 * S, c.primary, { y: bodyY + 0.01 * S, z: 0.42 * S });
  const jaw = k.node('jaw', 'head', 0, bodyY - 0.03 * S, 0.32 * S);
  k.box(jaw, 0.15 * S, 0.035 * S, 0.22 * S, c.secondary, { y: bodyY - 0.045 * S, z: 0.42 * S });
  k.mirror((s) => {
    for (let i = 0; i < 3; i++) k.cone('head', 0.008 * S, 0.025 * S, '#f2f2ee', { x: s * 0.07 * S, y: bodyY - 0.035 * S, z: (0.36 + i * 0.07) * S, rx: PI }, 3);
  });
  k.addEyes('head', 'round', { y: bodyY + 0.07 * S, z: 0.34 * S, spacing: 0.1 * S, size: 0.02 * S });
  k.motion(jaw, (clip, t, dur) => {
    if (clip === 'attack') return { rot: [0.5 * Math.sin(PI * Math.min(1, t / (dur * 0.5))), 0, 0] };
    if (clip === 'faint') return { rot: [0.3 * Math.min(1, t / dur), 0, 0] };
    return { rot: [0.06 + 0.04 * Math.sin((t / dur) * TAU), 0, 0] };
  });
  // Sprawled legs.
  k.mirror((s, side) => {
    for (const [fb, z] of [['F', 0.17], ['B', -0.17]] as const) {
      const n = k.node(`leg_${fb}${side}`, 'body', s * 0.12 * S, legH, z * S);
      k.box(n, 0.08 * S, legH + 0.04 * S, 0.07 * S, c.primary, { x: s * 0.14 * S, y: (legH + 0.04 * S) / 2, z: z * S });
    }
  });
  // Tail in segments.
  let parent = 'body';
  for (let i = 0; i < 4; i++) {
    const z = -(0.28 + i * 0.12) * S;
    const n = k.node(`tail_${i}`, parent, 0, bodyY, z + 0.06 * S);
    k.box(n, (0.16 - i * 0.03) * S, (0.09 - i * 0.015) * S, 0.13 * S, c.primary, { y: bodyY - i * 0.008 * S, z });
    parent = n;
  }
  if (!evolved) k.sphere('body', 0.03 * S, c.accent, { x: 0.06 * S, y: bodyY + 0.07 * S, z: -0.1 * S, mat: 'glow' }, 5);
}

/** Mildew / Moldmother: a shuffling cluster of mushroom caps; the evolved one glows with spores. */
function mold(k: Kit, evolved: boolean): void {
  const c = k.c; // cap tan, stem violet, spore accent, eye
  const S = evolved ? 2.6 : 1;
  k.node('body', 'root', 0, 0.1 * S, 0);
  k.sphere('body', 0.12 * S, c.secondary, { y: 0.08 * S, sy: 0.6 }, 8);
  const caps = evolved ? 6 : 4;
  for (let i = 0; i < caps; i++) {
    const a = (i / caps) * TAU + 0.3;
    const r = i === 0 ? 0 : 0.08 * S;
    const h = (i === 0 ? 0.2 : 0.11 + (i % 2) * 0.04) * S;
    const cr = (i === 0 ? 0.11 : 0.06 + (i % 3) * 0.01) * S;
    const n = k.node(`cap_${i}`, 'body', Math.sin(a) * r, 0.1 * S, Math.cos(a) * r);
    k.cylinder(n, 0.02 * S, 0.028 * S, h, c.secondary, { x: Math.sin(a) * r, y: 0.1 * S + h / 2, z: Math.cos(a) * r }, 6);
    k.sphere(n, cr, c.primary, { x: Math.sin(a) * r, y: 0.1 * S + h, z: Math.cos(a) * r, sy: 0.55, mat: evolved && i % 2 === 0 ? 'glass' : 'solid' }, 8);
    k.sphere(n, cr * 0.25, c.accent, { x: Math.sin(a) * r + cr * 0.4, y: 0.1 * S + h + cr * 0.3, z: Math.cos(a) * r, mat: 'glow' }, 4);
    k.motion(n, (clip, t, dur) => {
      if (clip === 'faint') return { rot: [0, 0, 0.5 * Math.min(1, t / dur) * (i % 2 ? 1 : -1)] };
      const amp = clip === 'attack' ? 0.25 : clip === 'walk' ? 0.12 : 0.05;
      return { rot: [amp * Math.sin((t / dur) * TAU + i), 0, amp * Math.cos((t / dur) * TAU + i * 1.3)] };
    });
  }
  k.addEyes('body', 'round', { y: 0.12 * S, z: 0.1 * S, spacing: 0.07 * S, size: 0.016 * S });
  // Root-feet that shuffle.
  k.mirror((s, side) => {
    const n = k.node(`leg_${side}`, 'body', s * 0.06 * S, 0.06 * S, 0);
    k.box(n, 0.05 * S, 0.06 * S, 0.08 * S, c.secondary, { x: s * 0.06 * S, y: 0.03 * S });
  });
  if (evolved) {
    // A halo of drifting spores.
    for (let i = 0; i < 5; i++) {
      const n = k.node(`spore_${i}`, 'body', 0, 0.5 * S, 0);
      const a = (i / 5) * TAU;
      k.sphere(n, 0.018 * S, c.accent, { x: Math.sin(a) * 0.18 * S, y: 0.42 * S + (i % 2) * 0.06 * S, z: Math.cos(a) * 0.18 * S, mat: 'glow' }, 4);
      k.motion(n, (_clip, t, dur) => ({ rot: [0, (t / dur) * TAU * 0.5, 0], scale: 0.7 + 0.3 * Math.sin((t / dur) * TAU * 2 + i) }));
    }
  }
}

export const SEWER_BUILDERS: Record<string, (k: Kit) => void> = {
  gutterat: (k) => rat(k, false),
  ratking: (k) => rat(k, true),
  drainling: (k) => gator(k, false),
  sewergator: (k) => gator(k, true),
  mildew: (k) => mold(k, false),
  moldmother: (k) => mold(k, true),
};
