import type { Box, HeistInteriorPlan } from './HeistInterior';

/**
 * The police coming into a heist building. Once you have stars and you're inside, officers come
 * in through the front door after a short delay (more of them, and sooner, at higher levels) and
 * hunt you through the rooms; they path round the counters, desks and walls on a grid of the
 * floor. Close enough and they grab you (the usual arrest bar); from three stars they shoot when
 * they can see you.
 *
 * Engine-free: the game owns the officers' bodies (scripted peds) and hands them in as plain
 * {x, z, heading, speed} objects; this moves them and says who's grabbing.
 */
export const RAID = {
  /** Seconds after you're wanted (and inside) before the first officers come in. */
  delay: 7,
  /** Faster at higher levels: seconds off the delay per star over one. */
  delayPerStar: 1.2,
  /** Officers in the first wave, plus this many per star; and a cap. */
  first: 2,
  perStar: 1,
  max: 6,
  /** Another officer every this many seconds while you're still inside (up to the cap). */
  every: 9,
  /** Officer running speed inside (m/s); grab range; shooting from this many stars, in range. */
  speed: 4.3,
  grab: 1.25,
  shootStars: 3,
  shootRange: 16,
  /** Grid cell (m) and how far from cover an officer's centre keeps. */
  cell: 0.5,
  clearance: 0.3,
} as const;

export interface RaidCop {
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Seconds until the next shot. */
  shootCd: number;
}

export interface RaidStep {
  /** An officer is in grabbing range of the player. */
  grabbing: boolean;
  /** Officers who fire this frame (they have a clear line, from RAID.shootStars). */
  firing: RaidCop[];
  /** New officers to put in the world at these spots (the game makes the bodies). */
  spawn: Array<{ x: number; z: number; heading: number }>;
  /** Any officer can see the player (keeps the wanted level from cooling). */
  sees: boolean;
}

/** A walkable grid over the room: true where an officer can stand. */
export class RaidGrid {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly open: Uint8Array;
  private dist: Int32Array;
  private goalCell = -1;

  constructor(plan: HeistInteriorPlan, private readonly cell = RAID.cell) {
    const boxes: Box[] = [...plan.walls, ...plan.cover, ...(plan.vaultDoor ? [plan.vaultDoor] : [])];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const b of plan.walls) {
      minX = Math.min(minX, b.x - b.hx);
      maxX = Math.max(maxX, b.x + b.hx);
      minZ = Math.min(minZ, b.z - b.hz);
      maxZ = Math.max(maxZ, b.z + b.hz);
    }
    this.x0 = minX;
    this.z0 = minZ;
    this.nx = Math.max(1, Math.ceil((maxX - minX) / cell));
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    this.open = new Uint8Array(this.nx * this.nz);
    this.dist = new Int32Array(this.nx * this.nz).fill(-1);
    const c = RAID.clearance;
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const x = minX + (i + 0.5) * cell;
        const z = minZ + (j + 0.5) * cell;
        const hit = boxes.some((b) => Math.abs(x - b.x) < b.hx + c && Math.abs(z - b.z) < b.hz + c);
        this.open[j * this.nx + i] = hit ? 0 : 1;
      }
    // The room is closed: the vault door counts as a wall (its box) until it's open; the
    // officers won't follow you into the strong room anyway (you're cornered at the door).
  }

  index(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  centre(k: number): { x: number; z: number } {
    return { x: this.x0 + ((k % this.nx) + 0.5) * this.cell, z: this.z0 + (Math.floor(k / this.nx) + 0.5) * this.cell };
  }

  /** Nearest open cell to a point (searching outwards a little). */
  nearestOpen(x: number, z: number): number {
    const k = this.index(x, z);
    if (k >= 0 && this.open[k]) return k;
    let best = -1;
    let bd = Infinity;
    for (let r = 1; r < 6 && best < 0; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const kk = this.index(x + di * this.cell, z + dj * this.cell);
          if (kk < 0 || !this.open[kk]) continue;
          const c = this.centre(kk);
          const d = Math.hypot(c.x - x, c.z - z);
          if (d < bd) {
            bd = d;
            best = kk;
          }
        }
    return best;
  }

  /** Breadth-first distances to the goal (recomputed only when the goal changes cell). */
  setGoal(x: number, z: number): void {
    const g = this.nearestOpen(x, z);
    if (g === this.goalCell) return;
    this.goalCell = g;
    this.dist.fill(-1);
    if (g < 0) return;
    const q = new Int32Array(this.nx * this.nz);
    let head = 0;
    let tail = 0;
    q[tail++] = g;
    this.dist[g] = 0;
    while (head < tail) {
      const k = q[head++];
      const i = k % this.nx;
      const j = (k - i) / this.nx;
      const d = this.dist[k] + 1;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
        const kk = jj * this.nx + ii;
        if (!this.open[kk] || this.dist[kk] >= 0) continue;
        // No cutting corners diagonally.
        if (di && dj && (!this.open[j * this.nx + ii] || !this.open[jj * this.nx + i])) continue;
        this.dist[kk] = d;
        q[tail++] = kk;
      }
    }
  }

  /** Where to head next from (x, z) towards the goal: the neighbouring cell closest to it. */
  next(x: number, z: number): { x: number; z: number } | null {
    const k = this.nearestOpen(x, z);
    if (k < 0 || this.dist[k] < 0) return null;
    if (this.dist[k] === 0) return this.centre(k);
    const i = k % this.nx;
    const j = (k - i) / this.nx;
    let best = k;
    let bd = this.dist[k];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
        const kk = jj * this.nx + ii;
        if (this.open[kk] && this.dist[kk] >= 0 && this.dist[kk] < bd) {
          if (di && dj && (!this.open[j * this.nx + ii] || !this.open[jj * this.nx + i])) continue;
          bd = this.dist[kk];
          best = kk;
        }
      }
    return this.centre(best);
  }

  /** Can an officer stand here? */
  walkable(x: number, z: number): boolean {
    const k = this.index(x, z);
    return k >= 0 && this.open[k] === 1;
  }
}

/** The raid on one building. */
export class HeistRaid {
  readonly cops: RaidCop[] = [];
  private clock = 0;
  private wantedFor = 0;
  private sinceLast = 0;
  readonly grid: RaidGrid;

  constructor(readonly plan: HeistInteriorPlan) {
    this.grid = new RaidGrid(plan);
  }

  /** Officers come in once you've been wanted (inside) for long enough. */
  get started(): boolean {
    return this.cops.length > 0;
  }

  /**
   * One frame. `sight(ax, az, bx, bz)` says whether there's a clear line between two points
   * (at standing height); `stars` is the wanted level.
   */
  update(dt: number, s: { stars: number; px: number; pz: number; onFoot: boolean; dead: boolean; sight: (ax: number, az: number, bx: number, bz: number) => boolean }): RaidStep {
    const out: RaidStep = { grabbing: false, firing: [], spawn: [], sees: false };
    this.clock += dt;
    if (s.stars <= 0 && this.cops.length === 0) {
      this.wantedFor = 0;
      return out;
    }
    if (s.stars > 0) this.wantedFor += dt;
    const delay = Math.max(2.5, RAID.delay - (s.stars - 1) * RAID.delayPerStar);
    const want = Math.min(RAID.max, RAID.first + (s.stars - 1) * RAID.perStar);
    if (s.stars > 0 && this.wantedFor >= delay) {
      this.sinceLast += dt;
      const firstWave = this.cops.length === 0;
      if (firstWave || (this.cops.length < want && this.sinceLast >= RAID.every)) {
        const n = firstWave ? want : 1;
        const e = this.plan.exit;
        const facing = this.plan.spawn.facing;
        for (let i = 0; i < n; i++) {
          // Fan out just inside the door.
          const side = (i - (n - 1) / 2) * 0.9;
          const sx = e.x + Math.cos(facing) * (0.6 + Math.floor(i / 3) * 0.8) + Math.sin(facing) * side;
          const sz = e.z - Math.sin(facing) * (0.6 + Math.floor(i / 3) * 0.8) + Math.cos(facing) * side;
          const k = this.grid.nearestOpen(sx, sz);
          const c = k >= 0 ? this.grid.centre(k) : { x: e.x, z: e.z };
          out.spawn.push({ x: c.x, z: c.z, heading: facing });
        }
        this.sinceLast = 0;
      }
    }
    if (s.dead) {
      for (const c of this.cops) c.speed = 0;
      return out;
    }
    this.grid.setGoal(s.px, s.pz);
    for (const c of this.cops) {
      const d = Math.hypot(s.px - c.x, s.pz - c.z);
      const clear = d < 30 && s.sight(c.x, c.z, s.px, s.pz);
      if (clear) out.sees = true;
      // Armed response: hold back and fire when there's a line, otherwise close in.
      const shooting = s.stars >= RAID.shootStars && clear && d < RAID.shootRange;
      c.shootCd -= dt;
      if (shooting && d > 6) {
        c.speed = 0;
        c.heading = Math.atan2(-(s.pz - c.z), s.px - c.x);
        if (c.shootCd <= 0) {
          c.shootCd = 0.8 + Math.random() * 0.7;
          out.firing.push(c);
        }
        continue;
      }
      if (d < RAID.grab && s.onFoot) {
        c.speed = 0;
        c.heading = Math.atan2(-(s.pz - c.z), s.px - c.x);
        out.grabbing = true;
        continue;
      }
      // Straight at you when there's a clear run, else along the grid.
      const to = clear && d < 6 ? { x: s.px, z: s.pz } : this.grid.next(c.x, c.z);
      if (!to) {
        c.speed = 0;
        continue;
      }
      const dx = to.x - c.x;
      const dz = to.z - c.z;
      const dd = Math.hypot(dx, dz);
      if (dd < 1e-3) continue;
      const st = Math.min(dd, RAID.speed * dt);
      const nx = c.x + (dx / dd) * st;
      const nz = c.z + (dz / dd) * st;
      if (this.grid.walkable(nx, nz) || !this.grid.walkable(c.x, c.z)) {
        c.x = nx;
        c.z = nz;
      }
      c.speed = st / Math.max(dt, 1e-4);
      const want2 = Math.atan2(-dz, dx);
      let dh = want2 - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += dh * Math.min(1, dt * 10);
    }
    // Officers don't stand in one another.
    for (let i = 0; i < this.cops.length; i++)
      for (let j = i + 1; j < this.cops.length; j++) {
        const a = this.cops[i];
        const b = this.cops[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 0.6) {
          const push = (0.6 - d) / 2;
          const ax = a.x - (dx / d) * push;
          const az = a.z - (dz / d) * push;
          const bx = b.x + (dx / d) * push;
          const bz = b.z + (dz / d) * push;
          if (this.grid.walkable(ax, az)) {
            a.x = ax;
            a.z = az;
          }
          if (this.grid.walkable(bx, bz)) {
            b.x = bx;
            b.z = bz;
          }
        }
      }
    return out;
  }

  /** Adds an officer the game has made a body for. */
  add(x: number, z: number, heading: number): RaidCop {
    const c: RaidCop = { x, z, heading, speed: 0, shootCd: 1 + Math.random() };
    this.cops.push(c);
    return c;
  }

  remove(c: RaidCop): void {
    const i = this.cops.indexOf(c);
    if (i >= 0) this.cops.splice(i, 1);
  }
}
