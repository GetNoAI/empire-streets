/**
 * Where a battle is staged (engine-free, unit-tested).
 *
 * A battle stands the player at `origin`, their Streetmon a couple of metres ahead and the foe
 * further along `dir`, with the camera off to one side. In a narrow street that line can run
 * straight into a building, a parked car or a lamp post, and the creatures end up inside them.
 * `chooseArena` tries the natural line first (towards the foe), then turns it (and, if it must,
 * shifts it a little and tightens it) until every mark, the gap between the two sides, the camera
 * and its view of the fight are clear. The first candidate that's fully clear wins; otherwise the
 * one with the fewest problems.
 *
 * `clear(x, z)` is the caller's test for "a creature can stand here": the right floor for the layer,
 * not inside a building, not on a car or a prop.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export const ARENA = {
  /** Distance along the line: the player's Streetmon, the foe (normal and compact). */
  near: 2.0,
  far: 6.6,
  farCompact: 5.0,
  /** The player's Streetmon steps a little to the side so the player can see past it. */
  lateral: 0.9,
  /** Extra creatures on a side (doubles, raid allies) stand this far apart. */
  spread: 1.6,
  /** Clearance checked around each mark (m). */
  body: 0.55,
  /** Camera: out to the side, back along the line, and how much of its view must be clear. */
  camSide: 5.8,
  camBack: 2.6,
  /** Turns tried, in order of preference (degrees from the natural line). */
  turns: [0, 25, -25, 50, -50, 75, -75, 105, -105, 135, -135, 180],
  /** Small shifts of the whole arena tried when no turn works (m). */
  shifts: [1.5, 3],
} as const;

export interface Arena {
  origin: Vec2;
  dir: Vec2;
  right: Vec2;
  /** Which side the camera sits (+1 / -1 along `right`). */
  camSide: 1 | -1;
  /** Distance to the foe's mark. */
  far: number;
  /** Problems left (0 = everything clear). */
  problems: number;
  /** How far the line was turned from the natural one (degrees) and the origin moved (m). */
  turned: number;
  shifted: number;
}

/** A mark on the field: side 0 = the player's, side 1 = the foe's; slot 0 is the lead. */
export function spotOf(a: Pick<Arena, 'origin' | 'dir' | 'right' | 'camSide' | 'far'>, side: 0 | 1, slot: number): Vec2 {
  const along = side === 0 ? ARENA.near : a.far;
  const lateral = side === 0 ? ARENA.lateral : 0;
  // Slots fan out alternately either side of the lead: 0, +1, -1, +2...
  const fan = slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * Math.ceil(slot / 2) * ARENA.spread;
  const off = (lateral + fan * (side === 0 ? 1 : -1)) * -a.camSide;
  return { x: a.origin.x + a.dir.x * along + a.right.x * off, z: a.origin.z + a.dir.z * along + a.right.z * off };
}

/** The turn-based camera's spot and the point it looks at. */
export function cameraOf(a: Pick<Arena, 'origin' | 'dir' | 'right' | 'camSide' | 'far'>): { pos: Vec2; look: Vec2 } {
  const midAlong = (ARENA.near + a.far) / 2 - 0.5;
  const look = { x: a.origin.x + a.dir.x * midAlong, z: a.origin.z + a.dir.z * midAlong };
  const pos = {
    x: look.x + a.right.x * ARENA.camSide * a.camSide - a.dir.x * ARENA.camBack,
    z: look.z + a.right.z * ARENA.camSide * a.camSide - a.dir.z * ARENA.camBack,
  };
  return { pos, look };
}

function rotate(v: Vec2, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.z * s, z: v.x * s + v.z * c };
}

/** Is a straight line clear (sampled every 0.5 m, ends excluded)? Returns the number of blocked samples. */
function blockedAlong(clear: (x: number, z: number) => boolean, a: Vec2, b: Vec2): number {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.floor(d / 0.5));
  let bad = 0;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (!clear(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) bad++;
  }
  return bad;
}

/** Problems with a mark: its centre and four points round its body. */
function blockedAt(clear: (x: number, z: number) => boolean, p: Vec2): number {
  if (!clear(p.x, p.z)) return 3;
  const r = ARENA.body;
  let bad = 0;
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (!clear(p.x + dx, p.z + dz)) bad++;
  return bad;
}

/** Scores one layout; lower is better (0 = perfect). */
export function arenaProblems(a: Omit<Arena, 'problems' | 'turned' | 'shifted'>, clear: (x: number, z: number) => boolean, slots: [number, number] = [1, 1]): number {
  let p = 0;
  const mine: Vec2[] = [];
  const theirs: Vec2[] = [];
  for (let i = 0; i < slots[0]; i++) mine.push(spotOf(a, 0, i));
  for (let i = 0; i < slots[1]; i++) theirs.push(spotOf(a, 1, i));
  for (const s of [...mine, ...theirs]) p += blockedAt(clear, s) * 4;
  // Moves fly (and melee lunges run) between the two leads.
  p += blockedAlong(clear, mine[0], theirs[0]) * 2;
  // Every extra mark needs a clear line to the opposing lead as well.
  for (const s of mine.slice(1)) p += blockedAlong(clear, s, theirs[0]);
  for (const s of theirs.slice(1)) p += blockedAlong(clear, s, mine[0]);
  // The camera: standing somewhere open, with a clear view of the middle of the fight.
  const cam = cameraOf(a);
  if (!clear(cam.pos.x, cam.pos.z)) p += 2;
  p += Math.min(4, blockedAlong(clear, cam.pos, cam.look));
  return p;
}

/**
 * Picks the battle layout. `player` stands at the origin; `foe` gives the natural direction.
 * `slots` = creatures out per side (raids put allies on the player's side).
 */
export function chooseArena(o: { player: Vec2; foe: Vec2; clear: (x: number, z: number) => boolean; slots?: [number, number] }): Arena {
  const slots = o.slots ?? [1, 1];
  let base = { x: o.foe.x - o.player.x, z: o.foe.z - o.player.z };
  const len = Math.hypot(base.x, base.z);
  base = len < 0.1 ? { x: 0, z: 1 } : { x: base.x / len, z: base.z / len };
  let best: Arena | null = null;
  const consider = (origin: Vec2, deg: number, far: number, shifted: number): boolean => {
    const dir = rotate(base, deg);
    const right = { x: dir.z, z: -dir.x };
    for (const camSide of [1, -1] as const) {
      const a = { origin, dir, right, camSide, far };
      const problems = arenaProblems(a, o.clear, slots);
      // Prefer the natural line: a turned, shifted or tightened arena only wins on fewer problems.
      const cost = problems * 100 + Math.abs(deg) * 0.2 + shifted * 6 + (far < ARENA.far ? 5 : 0) + (camSide === 1 ? 0 : 0.1);
      const bestCost = best ? best.problems * 100 + Math.abs(best.turned) * 0.2 + best.shifted * 6 + (best.far < ARENA.far ? 5 : 0) + (best.camSide === 1 ? 0 : 0.1) : Infinity;
      if (cost < bestCost) best = { ...a, problems, turned: deg, shifted };
      if (problems === 0) return true;
    }
    return false;
  };
  // 1. Turn the line in place; 2. the same, tighter; 3. shift the whole arena a little.
  for (const far of [ARENA.far, ARENA.farCompact]) {
    for (const deg of ARENA.turns) if (consider(o.player, deg, far, 0)) return best!;
  }
  for (const shift of ARENA.shifts) {
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const origin = { x: o.player.x + Math.cos(ang) * shift, z: o.player.z + Math.sin(ang) * shift };
      if (!o.clear(origin.x, origin.z)) continue;
      for (const far of [ARENA.far, ARENA.farCompact]) for (const deg of ARENA.turns) if (consider(origin, deg, far, shift)) return best!;
    }
  }
  return best!;
}

/**
 * The nearest clear spot to (x, z) within `maxR` (rings of 8 samples every 0.5 m), or null.
 * Used to settle anything that ends up inside a wall (a knocked-back creature, a lunge).
 */
export function nearestClear(x: number, z: number, clear: (x: number, z: number) => boolean, maxR = 4): Vec2 | null {
  if (clear(x, z)) return { x, z };
  for (let r = 0.5; r <= maxR; r += 0.5) {
    const n = Math.max(8, Math.round(r * 8));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (clear(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}
