/**
 * Wall queries for creature movement (engine-free, unit-tested).
 *
 * A `WallGrid` answers "is there a wall here?" from a sampler (the street's building map, a roof's
 * ground, a sewer maze) and caches the answers in chunks of a fine grid: the spatial partition all
 * creatures share, so a dozen fleeing Streetmon casting a dozen rays each costs a few thousand
 * array reads a frame, not thousands of geometry tests. Rays walk the grid cell by cell (DDA) and
 * report the wall's surface normal. Small moving obstacles (race barricades, cones) are circles in
 * a bucket grid (`CircleIndex`), rebuilt each frame.
 *
 * On top of that: a swept-circle check (`sweep`, three parallel rays the width of the creature),
 * velocity clamping along a wall (`clampToWall`), a sliding move that never ends inside a wall
 * (`moveWithCollision`), and a soft push away from nearby walls (`wallRepulsion`).
 *
 * Coordinates are world metres on the ground plane (x, z).
 */

export interface RayHit {
  /** Something was hit within the distance asked for. */
  hit: boolean;
  /** Distance along the ray to the hit (the full distance when nothing was hit). */
  dist: number;
  /** Outward surface normal at the hit (unit; 0,0 when nothing was hit). */
  nx: number;
  nz: number;
  /** The ray started inside a wall. */
  inside?: boolean;
}

export type SolidSampler = (x: number, z: number) => boolean;

export const WALLS = {
  /** Grid resolution (m). Building edges are found to within this. */
  cell: 0.25,
  /** Cells per chunk side (chunks are allocated as creatures go near them). */
  chunk: 32,
  /** Kept back from walls when a move is clamped (m). */
  skin: 0.04,
} as const;

const NONE: RayHit = { hit: false, dist: 0, nx: 0, nz: 0 };

/** Lazily filled, chunked occupancy grid over a sampler. */
export class WallGrid {
  private readonly chunks = new Map<number, Uint8Array>();
  /** Lookups and sampler calls since the last `resetStats` (to check the cache is doing its job). */
  readonly stats = { lookups: 0, samples: 0, chunks: 0 };

  constructor(
    private readonly sample: SolidSampler,
    readonly cell: number = WALLS.cell,
    private readonly chunk: number = WALLS.chunk,
  ) {}

  /** Is cell (i, j) solid? Samples its centre the first time it's asked. */
  solidCell(i: number, j: number): boolean {
    this.stats.lookups++;
    const C = this.chunk;
    const ci = Math.floor(i / C);
    const cj = Math.floor(j / C);
    const key = (ci + 32768) * 65536 + (cj + 32768);
    let arr = this.chunks.get(key);
    if (!arr) {
      arr = new Uint8Array(C * C);
      this.chunks.set(key, arr);
      this.stats.chunks++;
    }
    const k = (i - ci * C) * C + (j - cj * C);
    let v = arr[k];
    if (v === 0) {
      this.stats.samples++;
      v = this.sample((i + 0.5) * this.cell, (j + 0.5) * this.cell) ? 2 : 1;
      arr[k] = v;
    }
    return v === 2;
  }

  solid(x: number, z: number): boolean {
    return this.solidCell(Math.floor(x / this.cell), Math.floor(z / this.cell));
  }

  resetStats(): void {
    this.stats.lookups = 0;
    this.stats.samples = 0;
  }

  /**
   * Walks the grid from (ox, oz) along unit direction (dx, dz) for up to `max` metres and returns
   * the first wall cell's face (distance and outward normal).
   */
  raycast(ox: number, oz: number, dx: number, dz: number, max: number): RayHit {
    const c = this.cell;
    let i = Math.floor(ox / c);
    let j = Math.floor(oz / c);
    if (this.solidCell(i, j)) {
      const n = this.escapeNormal(ox, oz);
      return { hit: true, dist: 0, nx: n.x, nz: n.z, inside: true };
    }
    const stepI = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepJ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tDeltaX = stepI !== 0 ? c / Math.abs(dx) : Infinity;
    const tDeltaZ = stepJ !== 0 ? c / Math.abs(dz) : Infinity;
    let tMaxX = stepI > 0 ? ((i + 1) * c - ox) / dx : stepI < 0 ? (i * c - ox) / dx : Infinity;
    let tMaxZ = stepJ > 0 ? ((j + 1) * c - oz) / dz : stepJ < 0 ? (j * c - oz) / dz : Infinity;
    for (let guard = 0; guard < 4096; guard++) {
      let t: number;
      let nx = 0;
      let nz = 0;
      if (tMaxX < tMaxZ) {
        t = tMaxX;
        i += stepI;
        tMaxX += tDeltaX;
        nx = -stepI;
      } else {
        t = tMaxZ;
        j += stepJ;
        tMaxZ += tDeltaZ;
        nz = -stepJ;
      }
      if (t > max) break;
      if (this.solidCell(i, j)) return { hit: true, dist: t, nx, nz };
    }
    return { hit: false, dist: max, nx: 0, nz: 0 };
  }

  /** Inside a wall: which way is out (toward the nearest free cell, searched in rings). */
  escapeNormal(x: number, z: number): { x: number; z: number; dist: number } {
    const c = this.cell;
    const i0 = Math.floor(x / c);
    const j0 = Math.floor(z / c);
    for (let r = 1; r <= 12; r++) {
      let bx = 0;
      let bz = 0;
      let bd = Infinity;
      for (let di = -r; di <= r; di++)
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.solidCell(i0 + di, j0 + dj)) continue;
          const cx = (i0 + di + 0.5) * c - x;
          const cz = (j0 + dj + 0.5) * c - z;
          const d = Math.hypot(cx, cz);
          if (d < bd) {
            bd = d;
            bx = cx;
            bz = cz;
          }
        }
      if (bd < Infinity) return { x: bx / (bd || 1), z: bz / (bd || 1), dist: bd };
    }
    return { x: 0, z: 0, dist: Infinity };
  }
}

/** Round obstacles that move or come and go (race props), bucketed for quick ray tests. */
export class CircleIndex {
  private readonly buckets = new Map<number, Array<{ x: number; z: number; r: number }>>();
  count = 0;

  constructor(private readonly bucket = 6) {}

  clear(): void {
    this.buckets.clear();
    this.count = 0;
  }

  add(x: number, z: number, r: number): void {
    const b = this.bucket;
    const c = { x, z, r };
    for (let i = Math.floor((x - r) / b); i <= Math.floor((x + r) / b); i++)
      for (let j = Math.floor((z - r) / b); j <= Math.floor((z + r) / b); j++) {
        const key = (i + 32768) * 65536 + (j + 32768);
        let list = this.buckets.get(key);
        if (!list) this.buckets.set(key, (list = []));
        list.push(c);
      }
    this.count++;
  }

  /** Nearest circle hit along a ray (unit direction), or null. */
  raycast(ox: number, oz: number, dx: number, dz: number, max: number): RayHit | null {
    if (!this.count) return null;
    const b = this.bucket;
    let best: RayHit | null = null;
    const seen = new Set<object>();
    // Visit the buckets along the ray (a few at most for probe lengths).
    const steps = Math.ceil(max / (b * 0.5)) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(max, (s * max) / steps);
      const key = (Math.floor((ox + dx * t) / b) + 32768) * 65536 + (Math.floor((oz + dz * t) / b) + 32768);
      const list = this.buckets.get(key);
      if (!list) continue;
      for (const c of list) {
        if (seen.has(c)) continue;
        seen.add(c);
        const h = rayCircle(ox, oz, dx, dz, c.x, c.z, c.r, max);
        if (h && (!best || h.dist < best.dist)) best = h;
      }
    }
    return best;
  }
}

/** Ray vs circle: entry distance and outward normal, or null. */
export function rayCircle(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number, max: number): RayHit | null {
  const fx = ox - cx;
  const fz = oz - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) {
    // Starting inside it: push straight out.
    const d = Math.hypot(fx, fz) || 1;
    return { hit: true, dist: 0, nx: fx / d, nz: fz / d, inside: true };
  }
  const bq = fx * dx + fz * dz;
  if (bq > 0) return null;
  const disc = bq * bq - c;
  if (disc < 0) return null;
  const t = -bq - Math.sqrt(disc);
  if (t < 0 || t > max) return null;
  const hx = ox + dx * t - cx;
  const hz = oz + dz * t - cz;
  return { hit: true, dist: t, nx: hx / r, nz: hz / r };
}

/** Walls plus round obstacles: what creature movement asks. */
export class ObstacleField {
  readonly circles = new CircleIndex();
  /** Rays cast this frame (for profiling). */
  rays = 0;

  constructor(public grid: WallGrid) {}

  /** First wall or obstacle along a ray (unit direction). */
  ray(ox: number, oz: number, dx: number, dz: number, max: number): RayHit {
    this.rays++;
    const a = this.grid.raycast(ox, oz, dx, dz, max);
    const b = this.circles.raycast(ox, oz, dx, dz, a.hit ? a.dist : max);
    return b && (!a.hit || b.dist < a.dist) ? b : a;
  }

  /**
   * A circle of `radius` swept along a ray: three parallel rays (centre and both sides). Returns
   * how far the circle's front can go before touching something, and that surface's normal.
   */
  sweep(ox: number, oz: number, dx: number, dz: number, max: number, radius: number): RayHit {
    const len = max + radius;
    const px = -dz * radius * 0.9;
    const pz = dx * radius * 0.9;
    let best = this.ray(ox, oz, dx, dz, len);
    for (const s of [1, -1]) {
      const h = this.ray(ox + px * s, oz + pz * s, dx, dz, len);
      if (h.hit && (!best.hit || h.dist < best.dist)) best = h;
    }
    if (!best.hit) return { hit: false, dist: max, nx: 0, nz: 0 };
    return { hit: true, dist: Math.max(0, best.dist - radius), nx: best.nx, nz: best.nz, inside: best.inside };
  }

  /** Is this point (with a body radius) clear of walls? */
  clear(x: number, z: number, radius = 0): boolean {
    if (this.grid.solid(x, z)) return false;
    if (radius <= 0) return true;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (this.grid.solid(x + Math.cos(a) * radius, z + Math.sin(a) * radius)) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------- vector helpers

/**
 * Removes the part of a velocity that pushes into a wall (normal pointing out of the wall). What's
 * left slides along it. Velocity moving away from the wall is left alone.
 */
export function clampToWall(vx: number, vz: number, nx: number, nz: number): { x: number; z: number } {
  const into = vx * nx + vz * nz;
  if (into >= 0) return { x: vx, z: vz };
  return { x: vx - nx * into, z: vz - nz * into };
}

/** Clamps a vector's length. */
export function clampLength(x: number, z: number, max: number): { x: number; z: number } {
  const l = Math.hypot(x, z);
  if (l <= max || l === 0) return { x, z };
  return { x: (x / l) * max, z: (z / l) * max };
}

export interface MoveResult {
  x: number;
  z: number;
  /** Velocity after clamping against what it ran into. */
  vx: number;
  vz: number;
  /** Touched a wall (or obstacle) this move. */
  hit: boolean;
  /** Normal of the last thing touched. */
  nx: number;
  nz: number;
  /** Started inside a wall and was pushed out. */
  depenetrated: boolean;
}

/**
 * Moves a circle by velocity * dt without letting it cross into a wall: it advances to just short
 * of the surface, the velocity is clamped along the wall, and the rest of the move slides (up to
 * three bounces, so corners work). A body found inside a wall is pushed out first.
 */
export function moveWithCollision(field: ObstacleField, x: number, z: number, vx: number, vz: number, dt: number, radius: number): MoveResult {
  let px = x;
  let pz = z;
  let depenetrated = false;
  if (field.grid.solid(px, pz)) {
    const e = field.grid.escapeNormal(px, pz);
    if (e.dist < Infinity) {
      px += e.x * (e.dist + field.grid.cell * 0.5);
      pz += e.z * (e.dist + field.grid.cell * 0.5);
      depenetrated = true;
    }
  }
  let left = dt;
  let hit = false;
  let nx = 0;
  let nz = 0;
  for (let iter = 0; iter < 3 && left > 1e-5; iter++) {
    const speed = Math.hypot(vx, vz);
    if (speed < 1e-4) break;
    const dx = vx / speed;
    const dz = vz / speed;
    const want = speed * left;
    const h = field.sweep(px, pz, dx, dz, want, radius);
    if (!h.hit || h.dist >= want) {
      px += dx * want;
      pz += dz * want;
      break;
    }
    const go = Math.max(0, h.dist - WALLS.skin);
    px += dx * go;
    pz += dz * go;
    left *= 1 - go / want;
    hit = true;
    nx = h.nx;
    nz = h.nz;
    const c = clampToWall(vx, vz, nx, nz);
    // Head-on (nothing left to slide with): stop.
    if (Math.hypot(c.x, c.z) < speed * 0.02) {
      vx = 0;
      vz = 0;
      break;
    }
    vx = c.x;
    vz = c.z;
  }
  return { x: px, z: pz, vx, vz, hit, nx, nz, depenetrated };
}

export interface Repulsion {
  /** Push away from nearby walls (sum of normals weighted by closeness; length 0..1). */
  x: number;
  z: number;
  /** Clearance to the nearest wall from the body's surface (m), up to `buffer`. */
  nearest: number;
}

/**
 * A soft push out of the wall buffer: rays all round, each wall closer than `buffer` (from the
 * body's surface) adds its normal weighted by how deep into the buffer it is (smooth, squared).
 */
export function wallRepulsion(field: ObstacleField, x: number, z: number, radius: number, buffer: number, rays = 8): Repulsion {
  let fx = 0;
  let fz = 0;
  let nearest = buffer;
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const h = field.ray(x, z, dx, dz, radius + buffer);
    if (!h.hit) continue;
    const gap = Math.max(0, h.dist - radius);
    nearest = Math.min(nearest, gap);
    const k01 = 1 - gap / buffer;
    const w = k01 * k01;
    // Use the surface normal; fall back to "away from the ray" if it's degenerate.
    const nx = h.nx || -dx;
    const nz = h.nz || -dz;
    fx += nx * w;
    fz += nz * w;
  }
  const c = clampLength(fx, fz, 1);
  return { x: c.x, z: c.z, nearest };
}

export { NONE as NO_HIT };
