import type { Pose } from './Kit';

/**
 * The default motion library for every Streetmon rig (engine-free, unit-tested). Kit samples it at
 * CLIP_FPS into the model's animation clips; builders can still override or add to any node.
 *
 * Principles it follows:
 *  - Anticipation, action, follow-through: every attack winds up, strikes fast (with a little
 *    overshoot), holds, and settles back.
 *  - Overlap: things further from the body lag behind it (forearms and shins behind the upper
 *    limb, the head behind the body, each tail segment behind the one before, wing tips, ears,
 *    antennae), so motion ripples outward instead of every part moving at once.
 *  - Arcs and counter-motion: a strike twists the body one way and swings the tail the other; the
 *    head counter-rotates to stay on target; arms swing opposite the legs in a walk.
 *  - Squash and stretch on landings, slams, recoil and buffs.
 *  - Different moves, different extremities: a strike swipes with the lead arm (a quadruped rears
 *    and claws, a jawed one bites, a long-tailed one whips), a slam brings both arms down, a shot
 *    braces and recoils, a throw winds up overhead, a blast curls in then flings everything out,
 *    a power-up gathers then flexes, a taunt points and shakes its head.
 *  - Type flavour: which extremities move most and how (FLAVOUR below).
 *
 * Conventions (model faces +Z, Y up): rot x > 0 tips the body/head forward and swings a hanging
 * limb back; arm/leg "forward" is rot x < 0. Elbows bend with rot x < 0 on `*_lo`, knees with
 * rot x > 0. A left limb (`_L`) swings outward with rot z > 0, a right one with rot z < 0. Wings
 * rise with side * rot z > 0. Tails raise with rot x > 0 and swish with rot y. Jaws open with
 * rot x > 0.
 */

export const CLIP_FPS = 30;

export type AttackStyle = 'strike' | 'slam' | 'shoot' | 'throw' | 'blast' | 'power' | 'taunt';
export const ATTACK_STYLES: readonly AttackStyle[] = ['strike', 'slam', 'shoot', 'throw', 'blast', 'power', 'taunt'];

/**
 * Timing of each attack clip, as fractions of its duration: wind-up ends at `w`, the strike takes
 * `s`, it holds for `h`, then recovers to rest by the end. `release` (seconds) is when the move
 * leaves the Streetmon (projectile launched, lunge lands): the game times effects to it.
 */
export const ATTACK_CLIPS: Record<AttackStyle, { duration: number; w: number; s: number; h: number; release: number }> = {
  strike: { duration: 0.8, w: 0.3, s: 0.12, h: 0.16, release: 0.29 },
  slam: { duration: 1.0, w: 0.4, s: 0.1, h: 0.18, release: 0.45 },
  shoot: { duration: 0.7, w: 0.24, s: 0.06, h: 0.3, release: 0.19 },
  throw: { duration: 0.9, w: 0.38, s: 0.12, h: 0.1, release: 0.4 },
  blast: { duration: 1.0, w: 0.35, s: 0.1, h: 0.25, release: 0.4 },
  power: { duration: 1.1, w: 0.3, s: 0.15, h: 0.3, release: 0.41 },
  taunt: { duration: 1.0, w: 0.15, s: 0.1, h: 0.5, release: 0.2 },
};

/** Which attack clip suits a move effect style (MoveFx plan style). */
export function attackStyleFor(fxStyle: string, melee = false): AttackStyle {
  switch (fxStyle) {
    case 'slam':
      return 'slam';
    case 'dash':
      return 'strike';
    case 'shot':
    case 'spray':
    case 'ricochet':
    case 'bolt':
    case 'beam':
      return 'shoot';
    case 'lob':
    case 'drop':
    case 'orb':
      return 'throw';
    case 'blast':
    case 'wave':
    case 'cloud':
    case 'splash':
      return 'blast';
    case 'buff':
    case 'heal':
    case 'veil':
    case 'glass':
    case 'reload':
      return 'power';
    case 'debuff':
      return 'taunt';
    default:
      return melee ? 'strike' : 'shoot';
  }
}

export type Flavour = 'gun' | 'concrete' | 'grind' | 'smoke' | 'bass' | 'wire' | 'sludge';

/** Groups of extremities a flavour can weight. */
export type PartGroup = 'body' | 'head' | 'arms' | 'legs' | 'tail' | 'wings' | 'extras';

/**
 * How each type moves, and which extremities do the most:
 *  - Gun: crisp and snappy; the arms (aim, recoil) lead, the tail stays tidy.
 *  - Concrete: heavy; the body and legs lead (stomps, slams, weight shifts), little flailing,
 *    almost no overshoot, big squash on impact.
 *  - Grind: quick and twitchy; arms and tail busy, a nervous jitter in the wind-ups.
 *  - Smoke: floaty; long trailing tails, wings and puffs, overlap doubled.
 *  - Bass: rhythmic; the body pulses and bounces, speaker rings and heads bob on the beat.
 *  - Wire: crackling; antennae, cable segments and sparks whip hardest, constant jitter.
 *  - Sludge: wobbly; the most squash and stretch, heads and tails jiggle after every move.
 */
export const FLAVOUR: Record<Flavour, { amp: Record<PartGroup, number>; snap: number; lag: number; jitter: number; squash: number; overshoot: number }> = {
  gun: { amp: { body: 0.9, head: 0.8, arms: 1.25, legs: 0.9, tail: 0.6, wings: 0.9, extras: 1 }, snap: 1.35, lag: 0.8, jitter: 0, squash: 0.8, overshoot: 1.3 },
  concrete: { amp: { body: 1.3, head: 0.7, arms: 1, legs: 1.25, tail: 0.6, wings: 0.8, extras: 0.8 }, snap: 0.8, lag: 1, jitter: 0, squash: 1.4, overshoot: 0.4 },
  grind: { amp: { body: 1, head: 1.1, arms: 1.2, legs: 1.1, tail: 1.3, wings: 1, extras: 1.1 }, snap: 1.2, lag: 0.9, jitter: 0.04, squash: 1, overshoot: 1.2 },
  smoke: { amp: { body: 1.1, head: 0.9, arms: 0.8, legs: 0.8, tail: 1.5, wings: 1.3, extras: 1.4 }, snap: 0.75, lag: 2, jitter: 0, squash: 1.1, overshoot: 0.8 },
  bass: { amp: { body: 1.3, head: 1.2, arms: 0.9, legs: 1, tail: 1, wings: 1, extras: 1.5 }, snap: 1, lag: 1, jitter: 0, squash: 1.3, overshoot: 1 },
  wire: { amp: { body: 0.9, head: 1, arms: 1, legs: 0.9, tail: 1.3, wings: 1.1, extras: 1.6 }, snap: 1.25, lag: 1.1, jitter: 0.06, squash: 0.9, overshoot: 1.1 },
  sludge: { amp: { body: 1.4, head: 1.1, arms: 0.9, legs: 0.9, tail: 1.2, wings: 1, extras: 1.2 }, snap: 0.85, lag: 1.4, jitter: 0, squash: 1.7, overshoot: 0.9 },
};

/** What the rig has, so a move uses the extremities the Streetmon actually has. */
export interface RigInfo {
  arms: boolean;
  /** Four (or more) legs. */
  quad: boolean;
  legs: boolean;
  tailSegs: number;
  wings: boolean;
  jaw: boolean;
  neck: boolean;
}

export interface MotionCtx {
  H: number;
  energy: number;
  floating: boolean;
  /** Primary type flavour, and the secondary one (half weight), if any. */
  flavour: Flavour;
  flavour2?: Flavour;
  rig: RigInfo;
  /** The body pivot's rest height (m), for faint. */
  restBodyY: number;
}

export function rigInfo(nodes: Iterable<string>): RigInfo {
  const n = [...nodes];
  const tailSegs = n.filter((x) => /^tail(_\d+)?$/.test(x) || x === 'tail_lo').length;
  return {
    arms: n.includes('arm_L') || n.includes('arm_R'),
    quad: n.includes('leg_FL') || n.includes('leg_BL'),
    legs: n.some((x) => /^leg_/.test(x)),
    tailSegs,
    wings: n.includes('wing_L') || n.includes('wing_R'),
    jaw: n.includes('jaw'),
    neck: n.includes('neck'),
  };
}

// ------------------------------------------------------------------ curves

const TAU = Math.PI * 2;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const easeInQuad = (x: number): number => clamp01(x) ** 2;
const easeInOut = (x: number): number => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
/** 0 -> 1 with an overshoot of about 10% * k. */
const easeOutBack = (x: number, k = 1): number => {
  const t = clamp01(x);
  const c1 = 1.70158 * k;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** The phases of an attack at `u` (0..1 of the clip). */
export interface AttackPhase {
  /** Wind-up: rises to 1 by the end of the wind-up, drops through the strike. */
  w: number;
  /** The hit: snaps to 1 (overshooting) in the strike, holds, recovers to 0. */
  h: number;
  /** Held: eases in over the wind-up, stays through the hold, recovers. (Aims, guards, stances.) */
  held: number;
  /** A short sharp kick at the strike, gone by the end of the hold (recoil, impact). */
  kick: number;
}

export function attackPhase(style: AttackStyle, u: number, snap = 1, overshoot = 1): AttackPhase {
  const T = ATTACK_CLIPS[style];
  const s = T.s / snap;
  const w = T.w;
  const end = w + s + T.h;
  const x = clamp01(u);
  let wv: number;
  if (x < w) wv = easeInOut(x / w);
  else if (x < w + s) wv = 1 - easeInQuad((x - w) / s);
  else wv = 0;
  let hv: number;
  if (x < w) hv = 0;
  else if (x < w + s) hv = easeOutBack((x - w) / s, overshoot);
  else if (x < end) hv = 1;
  else hv = 1 - easeInOut((x - end) / Math.max(1e-3, 1 - end));
  let held: number;
  if (x < end) held = smooth(x / Math.max(1e-3, w));
  else held = 1 - easeInOut((x - end) / Math.max(1e-3, 1 - end));
  const kick = x < w ? 0 : Math.exp(-((x - w) / Math.max(0.04, T.h * 0.45)) * 3) * smooth((x - w) / Math.max(1e-3, s * 0.5));
  return { w: wv, h: hv, held, kick };
}

/** An impulse for hurt: fast rise, a slight rebound, decays by the end. */
function impulse(u: number): number {
  const x = clamp01(u);
  if (x < 0.15) return easeOutBack(x / 0.15, 0.6);
  return Math.max(0, 1 - easeInOut((x - 0.15) / 0.85)) * (1 + 0.08 * Math.sin((x - 0.15) * 18));
}

// ------------------------------------------------------------------ helpers

function groupOf(name: string): PartGroup {
  if (name === 'body' || name === 'root') return 'body';
  if (name === 'head' || name === 'neck' || name === 'jaw' || name.startsWith('ear_')) return 'head';
  if (name.startsWith('arm_')) return 'arms';
  if (name.startsWith('leg_')) return 'legs';
  if (name.startsWith('tail')) return 'tail';
  if (name.startsWith('wing_')) return 'wings';
  return 'extras';
}

function ampFor(c: MotionCtx, g: PartGroup): number {
  const a = FLAVOUR[c.flavour].amp[g];
  const b = c.flavour2 ? FLAVOUR[c.flavour2].amp[g] : a;
  return (a * 2 + b) / 3;
}

function flavourNum(c: MotionCtx, k: 'snap' | 'lag' | 'jitter' | 'squash' | 'overshoot'): number {
  const a = FLAVOUR[c.flavour][k];
  const b = c.flavour2 ? FLAVOUR[c.flavour2][k] : a;
  return (a * 2 + b) / 3;
}

/** Index of a chain segment (tail_2 -> 2; tail_lo -> 1; ant_3 -> 3). */
function segIndex(name: string): number {
  if (name.endsWith('_lo') || name.endsWith('_tip')) return 1;
  const m = /_(\d+)$/.exec(name);
  return m ? Number(m[1]) : 0;
}

/** Overlap: how far behind the body a node runs (fraction of the clip). */
function lagOf(name: string, c: MotionCtx): number {
  const k = flavourNum(c, 'lag');
  let l = 0;
  if (name.endsWith('_lo')) l = 0.035;
  else if (name.endsWith('_tip')) l = 0.05;
  else if (name === 'head') l = 0.02;
  else if (name === 'jaw') l = 0.03;
  else if (name.startsWith('ear_')) l = 0.06;
  else if (name.startsWith('tail')) l = 0.03 * (segIndex(name) + 1);
  else if (name.startsWith('ant_') || name.startsWith('seg_') || name.startsWith('spark_')) l = 0.03 * (segIndex(name) + 1);
  else if (name.startsWith('puff_') || name.startsWith('spore_') || name.startsWith('cap_') || name.startsWith('rings_')) l = 0.025 * (segIndex(name) + 1);
  return l * k;
}

const sideOf = (name: string): number => {
  const base = name.replace(/_(lo|tip)$/, '');
  if (/_(L|FL|BL|ML|L2)$/.test(base)) return 1;
  if (/_(R|FR|BR|MR|R2)$/.test(base)) return -1;
  return 0;
};

function scalePose(p: Pose | null, k: number): Pose | null {
  if (!p || k === 1) return p;
  const out: Pose = {};
  if (p.rot) out.rot = [p.rot[0] * k, p.rot[1] * k, p.rot[2] * k];
  if (p.pos) out.pos = [p.pos[0] * k, p.pos[1] * k, p.pos[2] * k];
  if (p.scale !== undefined) out.scale = typeof p.scale === 'number' ? 1 + (p.scale - 1) * k : [1 + (p.scale[0] - 1) * k, 1 + (p.scale[1] - 1) * k, 1 + (p.scale[2] - 1) * k];
  return out;
}

/** Adds pose b onto a (rotations and offsets add, scales multiply). */
export function addPose(a: Pose | null, b: Pose | null, kb = 1): Pose | null {
  if (!b) return a;
  if (!a) return scalePose(b, kb);
  const sb = scalePose(b, kb)!;
  const r = (x?: [number, number, number], y?: [number, number, number]): [number, number, number] | undefined => (x || y ? [(x?.[0] ?? 0) + (y?.[0] ?? 0), (x?.[1] ?? 0) + (y?.[1] ?? 0), (x?.[2] ?? 0) + (y?.[2] ?? 0)] : undefined);
  const s3 = (s: Pose['scale']): [number, number, number] => (s === undefined ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : s);
  const out: Pose = {};
  const rot = r(a.rot, sb.rot);
  const pos = r(a.pos, sb.pos);
  if (rot) out.rot = rot;
  if (pos) out.pos = pos;
  if (a.scale !== undefined || sb.scale !== undefined) {
    const x = s3(a.scale);
    const y = s3(sb.scale);
    out.scale = [x[0] * y[0], x[1] * y[1], x[2] * y[2]];
  }
  return out;
}

const sq = (k: number, sx: number, sy: number): [number, number, number] => [1 + sx * k, 1 + sy * k, 1 + sx * k];

// ------------------------------------------------------------------ the library

/**
 * The default pose of `name` in `clip` at time t (0..dur), or null for "rest". Unknown nodes get
 * gentle secondary motion so nothing on a rig is ever frozen.
 */
export function defaultPose(name: string, clip: string, t: number, dur: number, c: MotionCtx): Pose | null {
  if (name === 'root' || name === 'aura') return null;
  const g = groupOf(name);
  const amp = ampFor(c, g) * c.energy;
  let p: Pose | null;
  if (clip === 'idle' || clip === 'idle_curled') p = idle(name, t, dur, c);
  else if (clip === 'walk') p = walk(name, t, dur, c);
  else if (clip === 'hurt') p = hurt(name, t, dur, c);
  else if (clip === 'faint') return faint(name, t, dur, c);
  else if (clip === 'evolve_glow') return evolveGlow(name, t, dur, c);
  else if (clip === 'attack') p = attack('strike', name, t, dur, c);
  else if (clip.startsWith('attack_')) p = attack(clip.slice(7) as AttackStyle, name, t, dur, c);
  else p = null;
  return scalePose(p, amp);
}

function idle(name: string, t: number, dur: number, c: MotionCtx): Pose | null {
  const H = c.H;
  const ph = (t / dur) * TAU;
  const u = t / dur;
  const s = sideOf(name);
  const lag = lagOf(name, c) * TAU;
  if (name === 'body') {
    if (c.floating) return { pos: [H * 0.01 * Math.sin(ph + 0.5), H * 0.06 * Math.sin(ph), 0], rot: [0.04 * Math.sin(ph * 2 + 1), 0, 0.05 * Math.sin(ph + 1)] };
    // Breathing and a slow weight shift side to side.
    return { pos: [H * 0.008 * Math.sin(ph), H * 0.012 * Math.sin(ph * 2), 0], rot: [0.02 * Math.sin(ph * 2 + 0.4), 0, 0.03 * Math.sin(ph)], scale: [1 - 0.008 * Math.sin(ph * 2), 1 + 0.025 * Math.sin(ph * 2), 1 + 0.01 * Math.sin(ph * 2)] };
  }
  if (name === 'head') {
    // Looks around and holds the look (a shaped sine), with a breath nod and a tilt.
    const look = Math.sign(Math.sin(ph)) * Math.abs(Math.sin(ph)) ** 0.45;
    return { rot: [0.05 * Math.sin(ph * 2 + 0.6), 0.2 * look, 0.05 * Math.sin(ph + 1.2)] };
  }
  if (name === 'neck') return { rot: [0.04 * Math.sin(ph * 2 + 0.3), 0.08 * Math.sin(ph), 0] };
  if (name === 'jaw') return { rot: [0.05 * Math.max(0, Math.sin(ph * 2 - 0.5)), 0, 0] };
  if (name.startsWith('ear_')) {
    const twitch = Math.exp(-(((u - (s > 0 ? 0.3 : 0.72)) / 0.025) ** 2));
    return { rot: [-0.35 * twitch + 0.04 * Math.sin(ph * 2 - lag), 0, s * 0.15 * twitch] };
  }
  if (name.startsWith('arm_')) {
    if (name.endsWith('_lo')) return { rot: [-0.18 - 0.06 * Math.sin(ph * 2 - lag), 0, 0] };
    return { rot: [0.06 * Math.sin(ph + (s > 0 ? 0 : 1)), 0, s * (0.09 + 0.03 * Math.sin(ph * 2))] };
  }
  if (name.startsWith('leg_')) {
    if (c.floating) return { rot: [0.12 * Math.sin(ph - lag), 0, 0] };
    if (name.endsWith('_lo')) return { rot: [0.03 + 0.025 * Math.sin(ph * 2), 0, 0] };
    return { rot: [-0.015 * Math.sin(ph * 2), 0, s * 0.01 * Math.sin(ph)] };
  }
  if (name.startsWith('tail')) {
    const i = segIndex(name);
    return { rot: [0.08 * Math.sin(ph * 2 - lag), 0.22 * Math.sin(ph - lag) * (1 + i * 0.15), 0] };
  }
  if (name.startsWith('wing_')) {
    const k = c.floating ? 4 : 2;
    const tip = name.endsWith('_tip');
    const a = c.floating ? 0.45 : 0.08;
    return { rot: [0, 0, s * (tip ? a * 0.6 : a) * Math.sin(ph * k - lag)] };
  }
  return extras(name, ph, lag, c, 0.6);
}

function walk(name: string, t: number, dur: number, c: MotionCtx): Pose | null {
  const H = c.H;
  const ph = (t / dur) * TAU;
  const s = sideOf(name);
  const lag = lagOf(name, c) * TAU;
  const bounce = (1 - Math.cos(ph * 2)) / 2;
  if (name === 'body') {
    if (c.floating) return { pos: [0, H * 0.05 * Math.sin(ph), 0], rot: [0.15, 0.04 * Math.sin(ph), 0.07 * Math.sin(ph)] };
    if (c.rig.quad) return { pos: [0, H * 0.03 * bounce, 0], rot: [0.03 + 0.04 * Math.sin(ph * 2), 0.05 * Math.sin(ph), 0.04 * Math.sin(ph)] };
    return { pos: [H * 0.012 * Math.sin(ph), H * 0.035 * bounce, 0], rot: [0.07, 0.07 * Math.sin(ph), 0.05 * Math.sin(ph)], scale: [1, 1 + 0.02 * Math.sin(ph * 2 - 0.6), 1] };
  }
  if (name === 'head') return { rot: [0.05 * Math.sin(ph * 2 + 0.8), -0.06 * Math.sin(ph), -0.03 * Math.sin(ph)] };
  if (name === 'neck') return { rot: [0.12 * Math.sin(ph * 2), 0, 0] };
  if (name === 'jaw') return null;
  if (name.startsWith('ear_')) return { rot: [-0.12 * Math.sin(ph * 2 - 1), 0, s * 0.05 * Math.sin(ph * 2 - 1.3)] };
  if (name.startsWith('leg_')) {
    if (c.floating) return { rot: [0.25 * Math.sin(ph - lag), 0, 0] };
    const base = name.replace(/_lo$/, '');
    // Diagonal pairs for quadrupeds (FL+BR, FR+BL), alternating for bipeds, a ripple for more.
    let phase = 0;
    if (base === 'leg_FR' || base === 'leg_BL' || base === 'leg_R' || base === 'leg_R2') phase = Math.PI;
    if (base.startsWith('leg_M')) phase = base.endsWith('L') ? Math.PI / 2 : -Math.PI / 2;
    if (base === 'leg_B') phase = Math.PI / 2;
    if (base === 'leg_L2' || base === 'leg_R2') phase += Math.PI / 2;
    const a = ph + phase;
    if (name.endsWith('_lo')) {
      // Knee: folds through the swing (thigh moving forward), a little give at the contact.
      return { rot: [0.75 * Math.max(0, Math.cos(a - 0.35)) ** 1.4 + 0.1 * Math.max(0, -Math.sin(a)), 0, 0] };
    }
    return { rot: [-0.5 * Math.sin(a), 0, 0] };
  }
  if (name.startsWith('arm_')) {
    // Opposite to the leg on the same side.
    const a = ph + (s > 0 ? 0 : Math.PI);
    if (name.endsWith('_lo')) return { rot: [-0.25 - 0.4 * Math.max(0, -Math.sin(a - 0.3)), 0, 0] };
    return { rot: [0.5 * Math.sin(a), 0, s * 0.1] };
  }
  if (name.startsWith('tail')) {
    const i = segIndex(name);
    return { rot: [0.06 * Math.sin(ph * 2 - lag), 0.3 * Math.sin(ph - lag) * (1 + i * 0.12), 0] };
  }
  if (name.startsWith('wing_')) {
    const tip = name.endsWith('_tip');
    if (c.floating) return { rot: [0, 0, s * (tip ? 0.35 : 0.6) * Math.sin(ph * 3 - lag)] };
    return { rot: [0, 0, s * (0.12 + (tip ? 0.12 : 0.18) * Math.sin(ph * 2 - lag))] };
  }
  return extras(name, ph * 2, lag, c, 1);
}

/** Bits with no motion of their own (rings, caps, spores, puffs, antennae, cable segments...). */
function extras(name: string, ph: number, lag: number, c: MotionCtx, k: number): Pose | null {
  const i = segIndex(name);
  if (name.startsWith('ant_')) return { rot: [0.12 * k * Math.sin(ph - lag), 0, 0.1 * k * Math.sin(ph * 0.5 - lag + i)] };
  // A stacked cable: each segment bends a little, so the chain curls like a whip.
  if (name.startsWith('seg_')) return { rot: [0.07 * k * Math.sin(ph - lag), 0, 0.06 * k * Math.sin(ph * 0.5 - lag)] };
  if (name.startsWith('spark_')) return { scale: 1 + 0.2 * k * Math.max(0, Math.sin(ph * 3 - lag)) };
  if (name.startsWith('rings_') || name === 'emitter') return { scale: 1 + 0.05 * k * Math.sin(ph * 2 - lag) };
  if (name.startsWith('cap_') || name.startsWith('puff_') || name.startsWith('spore_')) return { pos: [0, c.H * 0.012 * k * Math.sin(ph - lag), 0], scale: 1 + 0.04 * k * Math.sin(ph - lag) };
  return null;
}

function hurt(name: string, t: number, dur: number, c: MotionCtx): Pose | null {
  const H = c.H;
  const u = t / dur;
  const s = sideOf(name);
  const P = impulse(u - lagOf(name, c) * 1.5);
  if (name === 'body') {
    const q = flavourNum(c, 'squash');
    return { pos: [0, 0, -H * 0.07 * P], rot: [-0.3 * P, 0, 0.12 * P], scale: sq(P * q, 0.06, -0.08) };
  }
  if (name === 'head') return { rot: [-0.45 * P, 0.15 * P, 0] };
  if (name === 'neck') return { rot: [-0.3 * P, 0, 0] };
  if (name === 'jaw') return { rot: [0.4 * P, 0, 0] };
  if (name.startsWith('ear_')) return { rot: [-0.6 * P, 0, 0] };
  if (name.startsWith('arm_')) {
    if (name.endsWith('_lo')) return { rot: [-0.6 * P, 0, 0] };
    return { rot: [-0.6 * P, 0, s * 0.6 * P] };
  }
  if (name.startsWith('leg_')) {
    if (c.floating) return { rot: [0.5 * P, 0, 0] };
    if (name.endsWith('_lo')) return { rot: [0.35 * P, 0, 0] };
    return { rot: [(s >= 0 ? 0.2 : -0.1) * P, 0, s * 0.1 * P] };
  }
  if (name.startsWith('tail')) return { rot: [0.5 * P, 0.2 * P * Math.sin(u * 30), 0] };
  if (name.startsWith('wing_')) return { rot: [0, 0, s * 0.7 * P] };
  return extras(name, u * TAU * 3, 0, c, 1.5 * P);
}

function faint(name: string, t: number, dur: number, c: MotionCtx): Pose | null {
  const H = c.H;
  const u = clamp01(t / dur);
  const s = sideOf(name);
  // Knees buckle first (0-0.35), then it topples (0.3-0.75), then a small bounce as it lands.
  const buckle = smooth(u / 0.35);
  const fallRaw = easeInQuad((u - 0.3) / 0.45);
  const land = u > 0.75 ? Math.sin(((u - 0.75) / 0.25) * Math.PI) * 0.08 * (1 - (u - 0.75) / 0.25) : 0;
  const fall = clamp01(fallRaw) - land;
  const lagged = clamp01(easeInQuad((u - 0.3 - lagOf(name, c) * 2) / 0.45));
  if (name === 'body') {
    if (c.floating) return { pos: [0, -H * 0.25 * fall, 0], rot: [0.3 * fall, 0, 1.2 * fall] };
    const drop = c.restBodyY - H * 0.22;
    return { pos: [0, -drop * fall - H * 0.05 * buckle * (1 - fall), 0], rot: [0.1 * buckle * (1 - fall), 0, 1.45 * fall], scale: [1, 1 - 0.1 * fall, 1] };
  }
  if (name === 'head') return { rot: [0.25 * buckle + 0.35 * lagged, 0, 0.15 * lagged] };
  if (name === 'neck') return { rot: [0.3 * lagged, 0, 0] };
  if (name === 'jaw') return { rot: [0.3 * lagged, 0, 0] };
  if (name.startsWith('ear_')) return { rot: [-0.7 * lagged, 0, 0] };
  if (name.startsWith('arm_')) {
    if (name.endsWith('_lo')) return { rot: [-0.25 * buckle + 0.2 * lagged, 0, 0] };
    return { rot: [0.15 * buckle, 0, s * 0.6 * lagged] };
  }
  if (name.startsWith('leg_')) {
    if (c.floating) return { rot: [0.4 * fall, 0, 0] };
    if (name.endsWith('_lo')) return { rot: [0.9 * buckle * (1 - 0.6 * fall), 0, 0] };
    return { rot: [-0.45 * buckle * (1 - 0.5 * fall), 0, 0.3 * fall * (s || 1)] };
  }
  if (name.startsWith('tail')) return { rot: [-0.35 * lagged, 0.1 * lagged, 0] };
  if (name.startsWith('wing_')) return { rot: [0, 0, -s * 0.9 * lagged] };
  return null;
}

function evolveGlow(name: string, t: number, dur: number, c: MotionCtx): Pose | null {
  const H = c.H;
  const ph = (t / dur) * TAU;
  const s = sideOf(name);
  if (name === 'body') return { pos: [0, H * 0.04 * Math.sin(ph), 0], scale: 1 + 0.06 * Math.sin(ph * 2) };
  if (name === 'head') return { rot: [-0.15 + 0.05 * Math.sin(ph), 0, 0] };
  if (name.startsWith('arm_') && !name.endsWith('_lo')) return { rot: [-0.3, 0, s * (0.5 + 0.1 * Math.sin(ph * 2))] };
  if (name.startsWith('wing_')) return { rot: [0, 0, s * 0.55 * Math.sin(ph * 2 - lagOf(name, c) * TAU)] };
  if (name.startsWith('tail')) return { rot: [0.3, 0.3 * Math.sin(ph - lagOf(name, c) * TAU), 0] };
  return null;
}

// ------------------------------------------------------------------ attacks

function attack(style: AttackStyle, name: string, t: number, dur: number, c: MotionCtx): Pose | null {
  if (!(style in ATTACK_CLIPS)) style = 'strike';
  const p = attackPose(style, name, t, dur, c);
  // No limbs at all (a floating puff, a lamp): the body has to sell the whole move.
  return name === 'body' && !c.rig.arms && !c.rig.legs ? scalePose(p, 1.6) : p;
}

function attackPose(style: AttackStyle, name: string, t: number, dur: number, c: MotionCtx): Pose | null {
  const H = c.H;
  const lag = lagOf(name, c);
  const u = t / dur;
  const A = attackPhase(style, u - lag, flavourNum(c, 'snap'), flavourNum(c, 'overshoot'));
  const s = sideOf(name);
  const rig = c.rig;
  const q = flavourNum(c, 'squash');
  // A nervous jitter in the wind-up (Grind, Wire).
  const jit = flavourNum(c, 'jitter') * Math.sin(u * dur * TAU * 13 + segIndex(name)) * Math.max(A.w, A.held * 0.5);
  const lo = name.endsWith('_lo');
  const tip = name.endsWith('_tip');
  const W = A.w;
  const Hh = A.h;
  const K = A.kick;
  const held = A.held;
  // Long-tailed quadrupeds whip with the tail; jawed ones bite; others rear and claw.
  const tailWhip = !rig.arms && !rig.jaw && rig.tailSegs >= 3;
  const bite = !rig.arms && rig.jaw;
  // The lead (right) arm does the work; the left one guards or helps.
  const lead = s < 0;

  switch (style) {
    case 'strike': {
      if (name === 'body') {
        if (rig.arms || c.floating || !rig.legs)
          return { pos: [0, -H * 0.03 * W, H * (-0.05 * W + 0.16 * Hh)], rot: [-0.15 * W + 0.35 * Hh + jit, 0.35 * W - 0.45 * Hh, 0], scale: sq(K * q, 0.03, -0.04) };
        if (tailWhip) return { pos: [0, -H * 0.02 * W, H * 0.04 * Hh], rot: [0.08 * W, -0.35 * W + 0.55 * Hh, 0.1 * Hh], scale: sq(K * q, 0.03, -0.03) };
        return { pos: [0, H * 0.05 * W, H * (-0.04 * W + 0.15 * Hh)], rot: [-0.35 * W + 0.3 * Hh + jit, 0, 0], scale: sq(K * q, 0.04, -0.05) };
      }
      if (name === 'head') return { rot: [-0.15 * W + (bite ? 0.35 : 0.25) * Hh, -0.25 * W + 0.3 * Hh, 0] };
      if (name === 'neck') return { rot: [-0.25 * W + 0.5 * Hh, 0, 0] };
      if (name === 'jaw') return { rot: [0.25 * W + (bite ? 0.7 : 0.4) * Hh - 0.6 * K * (bite ? 1 : 0), 0, 0] };
      if (name.startsWith('ear_')) return { rot: [-0.5 * Math.max(W, Hh), 0, 0] };
      if (name.startsWith('arm_')) {
        if (lead) return lo ? { rot: [-1.3 * W - 0.1 * Hh, 0, 0] } : { rot: [0.9 * W - 1.6 * Hh + jit, 0, s * (0.6 * W - 0.25 * Hh)] };
        return lo ? { rot: [-0.6 - 0.3 * W, 0, 0] } : { rot: [-0.5 * W + 0.55 * Hh, 0, s * 0.25 * W] };
      }
      if (name.startsWith('leg_')) {
        if (c.floating) return { rot: [0.3 * W - 0.2 * Hh, 0, 0] };
        if (rig.quad) {
          const front = /_F[LR]/.test(name);
          if (tailWhip) return lo ? { rot: [0.3 * W, 0, 0] } : { rot: [0.1 * W, 0, s * 0.12 * W] };
          if (front) return lo ? { rot: [0.8 * W - 0.2 * Hh, 0, 0] } : { rot: [-0.9 * W + 0.5 * Hh, 0, 0] };
          return lo ? { rot: [0.5 * W + 0.1 * Hh, 0, 0] } : { rot: [0.3 * W - 0.2 * Hh, 0, 0] };
        }
        // Step in with the left, push off the right.
        if (lo) return { rot: [0.4 * W + (s > 0 ? 0.25 : 0.1) * Hh, 0, 0] };
        return { rot: [s > 0 ? -0.45 * Hh : 0.35 * Hh, 0, 0] };
      }
      if (name.startsWith('tail')) {
        if (tailWhip) return { rot: [0.2 * W, (-0.6 * W + 0.9 * Hh) * (1 + segIndex(name) * 0.06), 0] };
        return { rot: [0.2 * W, -0.5 * W + 0.7 * Hh, 0] };
      }
      if (name.startsWith('wing_')) return { rot: [0, 0, s * ((tip ? 0.5 : 0.8) * W - 0.3 * Hh)] };
      return extras(name, u * TAU * 2, 0, c, 1 + Hh);
    }

    case 'slam': {
      if (name === 'body') {
        if (c.floating) return { pos: [0, H * (0.12 * W - 0.12 * Hh), 0], rot: [-0.25 * W + 0.4 * Hh, 0, 0], scale: sq(Hh * q, 0.1, -0.12) };
        return {
          pos: [0, H * (0.12 * W - 0.08 * Hh), H * 0.04 * Hh],
          rot: [-0.25 * W + 0.4 * Hh + jit, 0, 0],
          scale: [1 - 0.04 * W + 0.1 * Hh * q, 1 + 0.08 * W - 0.12 * Hh * q, 1 - 0.04 * W + 0.1 * Hh * q],
        };
      }
      if (name === 'head') return { rot: [-0.4 * W + 0.5 * Hh, 0, 0] };
      if (name === 'neck') return { rot: [-0.4 * W + 0.6 * Hh, 0, 0] };
      if (name === 'jaw') return { rot: [0.35 * W + 0.1 * Hh, 0, 0] };
      if (name.startsWith('ear_')) return { rot: [-0.3 * W + 0.35 * Hh, 0, 0] };
      if (name.startsWith('arm_')) return lo ? { rot: [-0.8 * W - 0.1 * Hh, 0, 0] } : { rot: [-2.7 * W - 0.5 * Hh + jit, 0, s * 0.2 * W] };
      if (name.startsWith('leg_')) {
        if (c.floating) return { rot: [-0.3 * W + 0.4 * Hh, 0, 0] };
        if (rig.quad) {
          const front = /_F[LR]/.test(name);
          if (front) return lo ? { rot: [0.9 * W - 0.1 * Hh, 0, 0] } : { rot: [-1.2 * W + 0.35 * Hh, 0, s * 0.15 * Hh] };
          return lo ? { rot: [0.8 * W + 0.4 * Hh, 0, 0] } : { rot: [0.4 * W - 0.2 * Hh, 0, 0] };
        }
        return lo ? { rot: [0.7 * Hh, 0, 0] } : { rot: [0.05 * W - 0.35 * Hh, 0, s * 0.12 * Hh] };
      }
      if (name.startsWith('tail')) return { rot: [0.6 * W - 0.35 * Hh, 0, 0] };
      if (name.startsWith('wing_')) return { rot: [0, 0, s * (1.0 * W - 0.5 * Hh)] };
      return extras(name, u * TAU * 2, 0, c, 1 + 2 * K);
    }

    case 'shoot': {
      // Gun types fire twice (a double tap).
      const tap2 = c.flavour === 'gun' ? Math.exp(-(((u - lag - (ATTACK_CLIPS.shoot.w + 0.16)) / 0.035) ** 2)) * 0.7 : 0;
      const R = K + tap2;
      // No arms: the whole body is the gun (crouch, aim with the head, a big kick back).
      const bodyGun = !rig.arms;
      if (name === 'body')
        return bodyGun
          ? { pos: [0, -H * 0.05 * held, -H * 0.12 * R], rot: [0.12 * held - 0.32 * R + jit, 0, 0], scale: sq(R * q, -0.04, 0.06) }
          : { pos: [0, -H * 0.02 * held, -H * 0.07 * R], rot: [0.06 * held - 0.18 * R + jit, 0, 0], scale: sq(R * q, -0.02, 0.03) };
      if (name === 'head') return { rot: [(bodyGun ? 0.2 : 0.1) * held - (bodyGun ? 0.45 : 0.25) * R, 0, 0] };
      if (name === 'neck') return { rot: [0.25 * held - 0.3 * R, 0, 0] };
      if (name === 'jaw') return { rot: [(rig.arms ? 0.1 : 0.55) * R + 0.1 * held, 0, 0] };
      if (name.startsWith('ear_')) return { rot: [-0.4 * held, 0, 0] };
      if (name.startsWith('arm_')) {
        if (lead) return lo ? { rot: [-0.5 * W * (1 - held) - 0.12 * held, 0, 0] } : { rot: [-1.45 * held - 0.35 * R + jit, 0, -0.05 * held] };
        return lo ? { rot: [-0.65 * held, 0, 0] } : { rot: [-1.15 * held - 0.2 * R, 0, -s * 0.35 * held] };
      }
      if (name.startsWith('leg_')) {
        if (c.floating) return { rot: [0.2 * held + 0.3 * R, 0, 0] };
        if (rig.quad) {
          // Splayed and braced, the front legs taking the kick.
          const front = /_F[LR]/.test(name);
          return lo ? { rot: [0.35 * held + (front ? 0.3 : 0.1) * R, 0, 0] } : { rot: [(front ? -0.3 : 0.35) * held + (front ? -0.25 : 0) * R, 0, s * 0.22 * held] };
        }
        // A wide braced stance.
        return lo ? { rot: [0.25 * held, 0, 0] } : { rot: [(s > 0 ? -0.2 : 0.2) * held, 0, s * 0.15 * held] };
      }
      if (name.startsWith('tail')) return { rot: [0.15 * held + 0.3 * R, 0.25 * R * Math.sin(u * 40), 0] };
      if (name.startsWith('wing_')) return { rot: [0, 0, s * (-0.25 * held + 0.45 * R)] };
      if (name.startsWith('rings_') || name === 'emitter') return { pos: [0, 0, H * 0.04 * R], scale: 1 + 0.3 * R };
      if (name === 'scope' || name === 'flare' || name === 'mast') return { pos: [0, 0, H * 0.03 * held], scale: 1 + 0.15 * R };
      return extras(name, u * TAU * 3, 0, c, 1 + 2 * R);
    }

    case 'throw': {
      if (name === 'body') return { pos: [0, -H * 0.02 * W, H * 0.06 * Hh], rot: [-0.2 * W + 0.35 * Hh + jit, 0.5 * W - 0.45 * Hh, 0], scale: sq(K * q, 0.03, -0.03) };
      if (name === 'head') return { rot: [(rig.arms ? -0.1 : -0.5) * W + (rig.arms ? 0.2 : 0.6) * Hh, -0.3 * W + 0.3 * Hh, 0] };
      if (name === 'neck') return { rot: [-0.5 * W + 0.6 * Hh, 0, 0] };
      if (name === 'jaw') return { rot: [0.15 * W + 0.55 * K, 0, 0] };
      if (name.startsWith('ear_')) return { rot: [-0.45 * W + 0.2 * Hh, 0, 0] };
      if (name.startsWith('arm_')) {
        if (lead) return lo ? { rot: [-1.6 * W - 0.05 * Hh, 0, 0] } : { rot: [-3.0 * W - 0.6 * Hh + jit, 0, s * 0.15 * W] };
        // The other arm points at the target, then swings back.
        return lo ? { rot: [-0.2 * W - 0.5 * Hh, 0, 0] } : { rot: [-1.3 * W + 0.6 * Hh, 0, s * 0.1 * W] };
      }
      if (name.startsWith('leg_')) {
        if (c.floating) return { rot: [0.3 * W - 0.2 * Hh, 0, 0] };
        if (rig.quad) {
          const front = /_F[LR]/.test(name);
          return lo ? { rot: [(front ? 0.5 : 0.3) * W, 0, 0] } : { rot: [(front ? -0.5 : 0.2) * W + (front ? 0.3 : -0.1) * Hh, 0, 0] };
        }
        if (lo) return { rot: [0.3 * W + 0.2 * Hh, 0, 0] };
        return { rot: [s > 0 ? -0.15 * W - 0.4 * Hh : 0.1 * W + 0.35 * Hh, 0, 0] };
      }
      if (name.startsWith('tail')) return { rot: [0.15 * W, -0.5 * W + 0.6 * Hh, 0] };
      if (name.startsWith('wing_')) return { rot: [0, 0, s * ((tip ? 0.7 : 0.9) * W - 0.4 * Hh)] };
      return extras(name, u * TAU * 2, 0, c, 1 + Hh);
    }

    case 'blast': {
      const shake = Math.sin(u * dur * TAU * 22) * 0.03 * Hh;
      if (name === 'body') return { pos: [0, -H * 0.04 * W, 0], rot: [0.3 * W - 0.3 * Hh + jit, shake, shake], scale: [1 - 0.06 * W * q + 0.06 * Hh * q, 1 - 0.05 * W * q + 0.1 * Hh * q, 1 - 0.06 * W * q + 0.06 * Hh * q] };
      if (name === 'head') return { rot: [0.4 * W - 0.55 * Hh, 0, 0] };
      if (name === 'neck') return { rot: [0.35 * W - 0.45 * Hh, 0, 0] };
      if (name === 'jaw') return { rot: [0.85 * Hh, 0, 0] };
      if (name.startsWith('ear_')) return { rot: [-0.6 * W + 0.25 * Hh, 0, 0] };
      if (name.startsWith('arm_')) return lo ? { rot: [-1.4 * W - 0.1 * Hh, 0, 0] } : { rot: [-0.7 * W - 0.3 * Hh, 0, s * (-0.5 * W + 1.4 * Hh)] };
      if (name.startsWith('leg_')) {
        if (c.floating) return { rot: [0.5 * W - 0.3 * Hh, 0, 0] };
        if (rig.quad) return lo ? { rot: [0.4 * W, 0, 0] } : { rot: [0.1 * W, 0, s * 0.3 * Hh] };
        return lo ? { rot: [0.35 * W + 0.1 * Hh, 0, 0] } : { rot: [-0.1 * W, 0, s * 0.25 * Hh] };
      }
      if (name.startsWith('tail')) return { rot: [-0.3 * W + 0.6 * Hh, 0.3 * Hh * Math.sin(u * 18 - segIndex(name)), 0] };
      if (name.startsWith('wing_')) return { rot: [0, 0, s * (-0.6 * W + 1.2 * Hh + 0.12 * Hh * Math.sin(u * 40))] };
      if (name.startsWith('rings_') || name.startsWith('cap_') || name.startsWith('spore_') || name.startsWith('puff_') || name === 'emitter' || name === 'glow')
        return { pos: [0, H * 0.03 * Hh, 0], scale: 1 - 0.1 * W + 0.35 * Hh };
      return extras(name, u * TAU * 3, 0, c, 1 + 2 * Hh);
    }

    case 'power': {
      const pump = Math.max(0, Math.sin((u - ATTACK_CLIPS.power.w - ATTACK_CLIPS.power.s) * TAU * 3)) * Hh;
      if (name === 'body') return { pos: [0, H * (-0.06 * W + 0.05 * Hh + 0.02 * pump), 0], rot: [0.15 * W - 0.12 * Hh, 0, 0], scale: [1 + 0.05 * W * q + 0.03 * pump, 1 - 0.07 * W * q + 0.06 * Hh + 0.03 * pump, 1 + 0.05 * W * q] };
      if (name === 'head') return { rot: [0.3 * W - 0.3 * Hh, 0.08 * pump, 0] };
      if (name === 'neck') return { rot: [0.25 * W - 0.35 * Hh, 0, 0] };
      if (name === 'jaw') return { rot: [0.2 * pump, 0, 0] };
      if (name.startsWith('ear_')) return { rot: [-0.3 * W + 0.3 * Hh, 0, 0] };
      if (name.startsWith('arm_')) return lo ? { rot: [-0.4 * W - 1.8 * Hh - 0.25 * pump, 0, 0] } : { rot: [0.2 * W - 0.3 * Hh, 0, s * (0.15 * W + 1.35 * Hh)] };
      if (name.startsWith('leg_')) {
        if (c.floating) return { rot: [0.3 * W - 0.2 * Hh, 0, 0] };
        if (rig.quad) {
          const front = /_F[LR]/.test(name);
          return lo ? { rot: [0.4 * W + (front ? 0.4 * pump : 0), 0, 0] } : { rot: [(front ? -0.5 * pump : 0.15 * W), 0, s * 0.1 * Hh] };
        }
        return lo ? { rot: [0.5 * W + 0.1 * pump, 0, 0] } : { rot: [-0.25 * W, 0, s * 0.12 * Hh] };
      }
      if (name.startsWith('tail')) return { rot: [0.5 * Hh - 0.2 * W, 0.3 * Hh * Math.sin(u * 25 - segIndex(name) * 0.8), 0] };
      if (name.startsWith('wing_')) return { rot: [0, 0, s * (-0.4 * W + 0.9 * Hh * Math.max(0, Math.sin(u * 22 - (tip ? 0.8 : 0))))] };
      return extras(name, u * TAU * 3, 0, c, 1 + 2 * Hh);
    }

    case 'taunt': {
      const wag = Math.sin((u - lag) * TAU * 4);
      if (name === 'body') return { pos: [0, H * 0.02 * Math.abs(wag) * held, H * 0.03 * held], rot: [0.2 * held, 0.1 * wag * held, 0], scale: sq(Math.abs(wag) * held * q * 0.4, 0.03, -0.03) };
      if (name === 'head') return { rot: [0.05 * held, 0.35 * wag * held, 0.18 * held] };
      if (name === 'neck') return { rot: [0.2 * held, 0.2 * wag * held, 0] };
      if (name === 'jaw') return { rot: [0.3 * Math.max(0, Math.sin(u * dur * TAU * 9)) * held, 0, 0] };
      if (name.startsWith('ear_')) return { rot: [-0.5 * held, 0, s * 0.2 * wag * held] };
      if (name.startsWith('arm_')) {
        // The lead arm points and wags; the other goes on the hip.
        if (lead) return lo ? { rot: [(-0.1 - 0.4 * (0.5 + 0.5 * wag)) * held, 0, 0] } : { rot: [-1.4 * held, 0, 0] };
        return lo ? { rot: [-1.6 * held, 0, 0] } : { rot: [0.15 * held, 0, s * 0.5 * held] };
      }
      if (name.startsWith('leg_')) {
        if (c.floating) return { rot: [0.2 * wag * held, 0, 0] };
        if (rig.quad && /_FR/.test(name)) return lo ? { rot: [0.5 * Math.max(0, wag) * held, 0, 0] } : { rot: [-0.5 * Math.max(0, wag) * held, 0, 0] };
        return lo ? { rot: [0.15 * held, 0, 0] } : { rot: [0, 0, s * 0.08 * held] };
      }
      if (name.startsWith('tail')) return { rot: [0.25 * held, 0.6 * wag * held, 0] };
      if (name.startsWith('wing_')) return { rot: [0, 0, s * 0.35 * Math.abs(wag) * held] };
      return extras(name, u * TAU * 4, 0, c, 1 + held);
    }
  }
  return null;
}
