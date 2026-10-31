import type { Kit } from './Kit';

/**
 * Rooftop Streetmon (Wire family): pigeons that nest in antennas, moths drawn to neon signs, and
 * satellite-dish turtles. Same low-poly rig and clip set as the street species; front is +Z.
 */

const PI = Math.PI;
const TAU = PI * 2;

/** Rooftail / Antennaroc: a city pigeon that grows a TV-antenna crest and a speaker-cone chest. */
function pigeon(k: Kit, evolved: boolean): void {
  const c = k.c; // slate grey, darker grey, electric accent, eye
  const legH = evolved ? 0.26 : 0.16;
  const bodyY = legH + (evolved ? 0.3 : 0.2);
  k.node('body', 'root', 0, bodyY, 0);
  k.node('head', 'body', 0, bodyY + (evolved ? 0.32 : 0.2), 0.14);
  k.node('tail_0', 'body', 0, bodyY, -0.2);
  const R = evolved ? 0.3 : 0.2;
  k.sphere('body', R, c.primary, { y: bodyY, sz: 1.35, sy: 0.95 }, 8);
  // Iridescent neck band (glows on the evolved form).
  k.torus('body', R * 0.55, R * 0.12, c.accent, { y: bodyY + R * 0.65, z: R * 0.35, rx: PI / 2 - 0.4, mat: evolved ? 'glow' : 'solid' }, 10);
  if (evolved) {
    // Speaker cone in the chest.
    k.cylinder('body', R * 0.45, R * 0.3, 0.06, c.secondary, { y: bodyY - 0.02, z: R * 1.18, rx: PI / 2 }, 10);
    k.sphere('body', R * 0.14, c.accent, { y: bodyY - 0.02, z: R * 1.24, sz: 0.5, mat: 'glow' }, 6);
  }
  const hy = bodyY + (evolved ? 0.38 : 0.25);
  const hr = evolved ? 0.17 : 0.1;
  k.sphere('head', hr, c.primary, { y: hy, z: 0.18 }, 8);
  k.cone('head', hr * 0.35, hr * 0.9, '#c8a27a', { y: hy - 0.01, z: 0.18 + hr * 1.1, rx: PI / 2 }, 5);
  k.addEyes('head', 'round', { y: hy + hr * 0.25, z: 0.18 + hr * 0.75, spacing: hr * 1.1, size: hr * 0.18 });
  // Antenna crest: two (or a full rooftop aerial of five) rods with glowing tips.
  const rods = evolved ? 5 : 2;
  for (let i = 0; i < rods; i++) {
    const a = (i / (rods - 1) - 0.5) * (evolved ? 1.4 : 0.9);
    const len = evolved ? 0.42 + (i % 2) * 0.14 : 0.18;
    const n = k.node(`ant_${i}`, 'head', Math.sin(a) * 0.03, hy + hr * 0.9, 0.16);
    k.cylinder(n, evolved ? 0.016 : 0.01, evolved ? 0.02 : 0.012, len, c.secondary, { x: Math.sin(a) * (0.03 + len * 0.5), y: hy + hr * 0.9 + Math.cos(a) * len * 0.5, z: 0.14, rz: -a }, 4);
    k.sphere(n, evolved ? 0.03 : 0.02, c.accent, { x: Math.sin(a) * (0.03 + len), y: hy + hr * 0.9 + Math.cos(a) * len, z: 0.14, mat: 'glow' }, 4);
    k.motion(n, (clip, t, dur) => {
      if (clip === 'faint') return null;
      const f = clip === 'attack' ? 6 : 2;
      return { rot: [0, 0, 0.12 * Math.sin((t / dur) * TAU * f + i)] };
    });
  }
  if (evolved) {
    // The aerial's crossbars.
    for (let j = 0; j < 2; j++) k.box('head', 0.42 - j * 0.12, 0.018, 0.018, c.secondary, { y: hy + hr * 0.9 + 0.22 + j * 0.12, z: 0.14 });
  }
  // Folded wings; the evolved form holds them half open like a dish.
  k.mirror((s, side) => {
    const n = k.node(`wing_${side}`, 'body', s * R * 0.8, bodyY + R * 0.3, 0);
    const wl = evolved ? 0.62 : 0.36;
    k.box(n, 0.04, R * 1.1, wl, c.secondary, { x: s * R * 0.95, y: bodyY + 0.02, z: -0.05, rz: s * (evolved ? 0.5 : 0.15), rx: 0.15 });
    k.box(n, 0.03, R * 0.5, wl * 0.6, c.accent, { x: s * R * (evolved ? 1.15 : 1.0), y: bodyY - R * 0.2, z: -0.16, rz: s * (evolved ? 0.5 : 0.15), rx: 0.2 });
  });
  k.box('tail_0', R * 0.8, 0.03, R * 1.1, c.secondary, { y: bodyY + 0.02, z: -R * 1.45, rx: 0.25 });
  // Legs.
  k.mirror((s, side) => {
    const n = k.node(`leg_${side}`, 'body', s * R * 0.35, legH, 0.02);
    k.cylinder(n, 0.016, 0.016, legH, '#d07a5a', { x: s * R * 0.35, y: legH / 2, z: 0.02 }, 4);
    k.box(n, 0.08, 0.015, 0.1, '#d07a5a', { x: s * R * 0.35, y: 0.008, z: 0.05 });
  });
  // Head bob as it walks, like a pigeon.
  k.motion('head', (clip, t, dur, H) => {
    const ph = (t / dur) * TAU;
    if (clip === 'walk') return { pos: [0, 0, H * 0.04 * Math.max(0, Math.sin(ph * 2))] };
    if (clip === 'attack') return { pos: [0, -H * 0.03, H * 0.1 * Math.sin(PI * Math.min(1, t / (dur * 0.5)))] };
    if (clip === 'faint') return { rot: [0.6 * Math.min(1, t / dur), 0, 0] };
    return { rot: [0, 0.25 * Math.sin(ph), 0] };
  });
}

/** Neonmoth / Marqueen: a moth with neon-tube wing outlines, growing into a theatre-marquee queen. */
function moth(k: Kit, evolved: boolean): void {
  const c = k.c; // smoky violet, dark, neon accent, eye
  const y0 = evolved ? 0.75 : 0.42;
  k.node('body', 'root', 0, y0, 0);
  k.node('head', 'body', 0, y0 + (evolved ? 0.36 : 0.2), 0.1);
  // Fuzzy smoke-glass body segments.
  const segs = evolved ? 4 : 3;
  for (let i = 0; i < segs; i++) k.sphere('body', (evolved ? 0.13 : 0.085) * (1 - i * 0.12), c.primary, { y: y0 - i * (evolved ? 0.16 : 0.1), z: -i * 0.04, mat: i === 0 ? 'solid' : 'glass' }, 7);
  const hy = y0 + (evolved ? 0.24 : 0.14);
  const hr = evolved ? 0.1 : 0.07;
  k.sphere('head', hr, c.secondary, { y: hy, z: 0.08 }, 7);
  k.addEyes('head', 'glow', { y: hy + 0.01, z: 0.08 + hr * 0.8, spacing: hr * 1.2, size: hr * 0.3 });
  // Feathery antennae.
  k.mirror((s) => k.cylinder('head', 0.008, 0.006, evolved ? 0.3 : 0.18, c.accent, { x: s * 0.05, y: hy + hr + 0.08, z: 0.12, rz: -s * 0.45, rx: 0.4 }, 4));
  if (evolved) {
    // Crown of marquee bulbs.
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 1.6;
      k.sphere('head', 0.025, c.accent, { x: Math.sin(a) * 0.09, y: hy + hr + 0.02 + Math.cos(a) * 0.03, z: 0.05, mat: 'glow' }, 4);
    }
  }
  // Wings: dark panels framed by glowing neon tubes; Marqueen's are lit sign boards dotted with bulbs.
  k.mirror((s, side) => {
    const n = k.node(`wing_${side}`, 'body', s * 0.06, y0 + 0.05, -0.02);
    const W = evolved ? 0.62 : 0.34;
    const Hh = evolved ? 0.48 : 0.26;
    k.box(n, W, Hh, 0.015, evolved ? c.primary : c.secondary, { x: s * (W / 2 + 0.05), y: y0 + Hh * 0.35, z: -0.03, rz: s * 0.2 });
    k.box(n, W * 0.75, Hh * 0.6, 0.015, c.secondary, { x: s * (W * 0.42 + 0.05), y: y0 - Hh * 0.45, z: -0.03, rz: -s * 0.25 });
    // Neon outline (two thin glowing bars along the top and outer edge).
    k.box(n, W, 0.022, 0.03, c.accent, { x: s * (W / 2 + 0.05), y: y0 + Hh * 0.35 + Hh * 0.48, z: -0.025, rz: s * 0.2, mat: 'glow' });
    k.box(n, 0.022, Hh, 0.03, c.accent, { x: s * (W + 0.03), y: y0 + Hh * 0.45, z: -0.025, rz: s * 0.2, mat: 'glow' });
    if (evolved) {
      // Marquee bulbs along the top edge and a lit sign board in the middle.
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 6;
        k.sphere(n, 0.03, c.accent, { x: s * (0.05 + W * u) * Math.cos(0.2), y: y0 + Hh * 0.35 + Hh * 0.42 + W * u * Math.sin(0.2) * 0.5, z: -0.01, mat: 'glow' }, 4);
      }
      k.box(n, W * 0.55, Hh * 0.28, 0.02, c.eye, { x: s * (W / 2 + 0.05), y: y0 + Hh * 0.3, z: -0.015, rz: s * 0.2, mat: 'glow' });
    } else {
      k.cylinder(n, 0.04, 0.04, 0.016, c.accent, { x: s * 0.22, y: y0 + 0.1, z: -0.02, rx: PI / 2, mat: 'glow' }, 8);
    }
  });
  // A flickering glow at the tail, like a sign about to go out.
  const g = k.node('glow', 'body', 0, y0 - segs * 0.1, -0.08);
  k.sphere(g, evolved ? 0.06 : 0.04, c.accent, { y: y0 - (segs - 1) * (evolved ? 0.16 : 0.1) - 0.05, z: -segs * 0.04, mat: 'glow' }, 5);
  k.motion(g, (_clip, t, dur) => ({ scale: 0.6 + 0.4 * Math.abs(Math.sin((t / dur) * TAU * 3)) * (Math.sin((t / dur) * TAU * 7) > -0.7 ? 1 : 0.2) }));
}

/** Dishling / Broadcastle: a satellite-dish turtle that grows into a concrete broadcast tower. */
function dish(k: Kit, evolved: boolean): void {
  const c = k.c; // dish white, concrete grey, signal accent, eye
  const legH = evolved ? 0.32 : 0.12;
  const bodyY = legH + (evolved ? 0.28 : 0.12);
  k.node('body', 'root', 0, bodyY, 0);
  k.node('head', 'body', 0, bodyY, evolved ? 0.42 : 0.26);
  if (evolved) {
    // Concrete base block with a mast and a stack of dishes.
    k.box('body', 0.7, 0.5, 0.8, c.secondary, { y: bodyY });
    k.box('body', 0.74, 0.06, 0.84, '#6f6d68', { y: bodyY + 0.27 });
    const m = k.node('mast', 'body', 0, bodyY + 0.3, 0);
    k.cylinder(m, 0.07, 0.1, 1.0, '#8d9096', { y: bodyY + 0.8 }, 6);
    for (let j = 0; j < 4; j++) k.box(m, 0.3 - j * 0.04, 0.03, 0.03, '#8d9096', { y: bodyY + 0.45 + j * 0.24, ry: j * 0.8 });
    for (let i = 0; i < 3; i++) {
      const y = bodyY + 0.6 + i * 0.28;
      const a = i * 2.1;
      const R = 0.28 - i * 0.04;
      // Dish facing outwards from the mast, tilted up a little, with a feed horn.
      k.cylinder(m, R, R * 0.25, R * 0.45, c.primary, { x: Math.sin(a) * (0.12 + R * 0.2), y, z: Math.cos(a) * (0.12 + R * 0.2), rx: PI / 2 - 0.35, ry: a }, 10);
      k.sphere(m, 0.035, c.accent, { x: Math.sin(a) * (0.12 + R * 0.95), y: y + 0.1, z: Math.cos(a) * (0.12 + R * 0.95), mat: 'glow' }, 4);
    }
    k.sphere(m, 0.05, c.eye, { y: bodyY + 1.33, mat: 'glow' }, 5); // aviation light (eye colour, so the shiny keeps the same draw calls)
    k.motion(m, (clip, t, dur) => {
      if (clip === 'faint') return { rot: [0, 0, 0.3 * Math.min(1, t / dur)] };
      return { rot: [0, (t / dur) * TAU * (clip === 'attack' ? 1 : 0.25), 0] };
    });
  } else {
    // Shell: a satellite dish turned up to the sky, with a feed arm.
    k.cylinder('body', 0.3, 0.06, 0.12, c.primary, { y: bodyY + 0.04 }, 12);
    k.cylinder('body', 0.2, 0.16, 0.1, c.secondary, { y: bodyY - 0.04 }, 10);
    const arm = k.node('arm', 'body', 0, bodyY + 0.08, 0);
    k.cylinder(arm, 0.01, 0.01, 0.26, '#8d9096', { y: bodyY + 0.2, z: 0.05, rx: 0.4 }, 4);
    k.sphere(arm, 0.035, c.accent, { y: bodyY + 0.32, z: 0.1, mat: 'glow' }, 5);
    k.motion(arm, (clip, t, dur) => (clip === 'faint' ? null : { rot: [0, (t / dur) * TAU * (clip === 'attack' ? 2 : 0.5), 0] }));
  }
  // Head on a short neck.
  const hz = evolved ? 0.46 : 0.28;
  const hr = evolved ? 0.14 : 0.08;
  k.sphere('head', hr, evolved ? c.secondary : '#9aa58a', { y: bodyY + (evolved ? 0.05 : 0), z: hz, sz: 1.2 }, 7);
  k.addEyes('head', evolved ? 'glow' : 'round', { y: bodyY + hr * 0.4 + (evolved ? 0.05 : 0), z: hz + hr * 0.85, spacing: hr * 1.1, size: hr * 0.22 });
  k.motion('head', (clip, t, dur, H) => {
    if (clip === 'attack') return { pos: [0, 0, H * 0.05 * Math.sin(PI * Math.min(1, t / (dur * 0.6)))] };
    if (clip === 'hurt') return { pos: [0, 0, -H * 0.04 * Math.sin(PI * Math.min(1, t / dur))] };
    if (clip === 'faint') return { pos: [0, -H * 0.04 * Math.min(1, t / dur), 0] };
    return { rot: [0, 0.2 * Math.sin((t / dur) * TAU), 0] };
  });
  // Four stumpy legs.
  k.mirror((s, side) => {
    for (const [fb, z] of [['F', evolved ? 0.28 : 0.14], ['B', evolved ? -0.28 : -0.14]] as const) {
      const lx = s * (evolved ? 0.32 : 0.17);
      const n = k.node(`leg_${fb}${side}`, 'body', lx, legH, z);
      k.box(n, evolved ? 0.16 : 0.08, legH, evolved ? 0.16 : 0.08, evolved ? '#6f6d68' : '#9aa58a', { x: lx, y: legH / 2, z });
    }
  });
}

export const ROOF_BUILDERS: Record<string, (k: Kit) => void> = {
  rooftail: (k) => pigeon(k, false),
  antennaroc: (k) => pigeon(k, true),
  neonmoth: (k) => moth(k, false),
  marqueen: (k) => moth(k, true),
  dishling: (k) => dish(k, false),
  broadcastle: (k) => dish(k, true),
};

/** Species that hover (no ground contact). */
export const ROOF_FLOATING = new Set(['neonmoth', 'marqueen']);
