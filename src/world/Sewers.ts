import type { District } from '../creatures/Data';
import { Rng } from '../util/rng';
import type { CityLayout } from './CityLayout';

/**
 * The sewer labyrinth (engine-free, unit-tested). Under each built-up district lies a maze of
 * 3 m tunnels on a block grid: open blocks are tunnel, closed blocks are solid wall. It's carved
 * by recursive backtracking, then some walls are knocked through so there are loops (a labyrinth,
 * not one long corridor), then chambers, halls (big open rooms), a hub and dead ends are marked.
 * Manholes connect open blocks to the street above; hazards sit in tunnels away from manholes and
 * the rooms; props (barrels, crates, pipes, burning drums) line the rooms, dead ends and tunnels.
 * People live at the hub and in camps out in the halls.
 */

export const SEWER = {
  /** Block size (m) and rooms per side; the grid is 2N+1 blocks square. */
  block: 3,
  rooms: 24,
  floor: -40,
  /** The deeper levels: floor heights and maze size (rooms per side), one each under every district. */
  levels: [
    { floor: -40, rooms: 24 },
    { floor: -56, rooms: 16 },
    { floor: -72, rooms: 12 },
  ],
  /** Tunnel height (m). */
  height: 4,
  loopRate: 0.3,
  chambers: 6,
  /** Big 5x5-block open rooms (wild Streetmon gather there; some are camps). */
  halls: 8,
  /** Pools: cistern halls (deep water to swim), channels (water with a current), sludge (toxic, waist deep). */
  cisternDepth: 1.9,
  channelDepth: 1.45,
  sludgeDepth: 0.85,
  /** The pool's surface sits this far below the tunnel floor. */
  poolDrop: 0.3,
  /** Caches (lockboxes in dead ends): per level. */
  caches: [4, 5, 6],
  manholes: 6,
  /** Props per room size, and loose ones along straight tunnels per maze. */
  propsPerHall: 7,
  propsPerChamber: 3,
  propsPerHub: 6,
  tunnelProps: 26,
  deadEndPropChance: 0.5,
  /** Share of wild spawns placed in open rooms (halls and chambers) rather than any tunnel. */
  roomSpawnShare: 0.6,
  /** Hazards per district. */
  sludge: 18,
  vents: 10,
  channels: 6,
  darkZones: 4,
  sludgeDps: 4,
  ventDps: 10,
  ventCycle: 6,
  ventActive: 1.5,
  channelPush: 3.5,
  /** Darkness: the flashlight flickers within this many blocks of a dark zone's centre. */
  darkRadius: 3,
  /** Search timer runs this much faster underground. */
  searchMult: 2,
} as const;

export type PropKind = 'barrel' | 'drumFire' | 'crate' | 'crateStack' | 'pallet' | 'pipes' | 'tires' | 'bedroll';

/** Footprint radius (m) of each prop, for colliders and creature steering. */
export const PROP_RADIUS: Record<PropKind, number> = {
  barrel: 0.36,
  drumFire: 0.4,
  crate: 0.5,
  crateStack: 0.62,
  pallet: 0.65,
  pipes: 0.45,
  tires: 0.48,
  bedroll: 0.5,
};

export interface SewerProp {
  kind: PropKind;
  x: number;
  z: number;
  /** Yaw (radians). */
  rot: number;
  /** Footprint radius (m). */
  r: number;
  /** Walk-over props (pallets, bedrolls) don't block. */
  solid: boolean;
}

export interface Room {
  kind: 'hub' | 'chamber' | 'hall';
  i: number;
  j: number;
  /** Half-size in blocks (the room spans i-r..i+r). */
  r: number;
}

export type Hazard = { kind: 'sludge' } | { kind: 'vent'; phase: number } | { kind: 'channel'; dx: number; dz: number };

/** A sunken block of water (or sludge): its depth below the tunnel floor's pool surface. */
export interface Pool {
  depth: number;
  toxic: boolean;
}

/** A lockbox of loot in a dead end; `tier` grows with depth (better loot). */
export interface Cache {
  id: string;
  i: number;
  j: number;
  x: number;
  z: number;
  tier: number;
}

export interface Manhole {
  id: string;
  /** Street position (top) and the tunnel block below. */
  x: number;
  z: number;
  i: number;
  j: number;
}

export interface Maze {
  district: District;
  /** World x/z of block (0,0)'s corner. */
  x0: number;
  z0: number;
  /** Blocks per side (2N+1). */
  size: number;
  /** open[i][j]: i along x, j along z. */
  open: boolean[][];
  hub: { i: number; j: number; r: number };
  chambers: Array<{ i: number; j: number }>;
  /** Big open rooms, nearest the hub first (by walking distance). */
  halls: Array<{ i: number; j: number }>;
  /** Hub, chambers and halls together (for spawning and props). */
  rooms: Room[];
  /** Camps where people live away from the hub: halls nearest the hub first. */
  camps: Array<{ i: number; j: number }>;
  props: SewerProp[];
  deadEnds: Array<{ i: number; j: number }>;
  manholes: Manhole[];
  hazards: Map<string, Hazard>;
  dark: Array<{ i: number; j: number }>;
  /** 1 = the sewers under the street, 2 and 3 the deep drains below; the floor's height. */
  level: number;
  floor: number;
  /** Sunken water by block (cisterns, channels, sludge). */
  pools: Map<string, Pool>;
  caches: Cache[];
}

export const key = (i: number, j: number): string => `${i},${j}`;

/** Carves one maze (pure; the same seed always gives the same maze). */
export function carveMaze(seed: number, N: number = SEWER.rooms, loopRate: number = SEWER.loopRate): { open: boolean[][]; size: number } {
  const rng = new Rng(seed);
  const size = 2 * N + 1;
  const open = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const seen = Array.from({ length: N }, () => new Array<boolean>(N).fill(false));
  const stack: Array<[number, number]> = [[0, 0]];
  seen[0][0] = true;
  open[1][1] = true;
  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (stack.length) {
    const [ci, cj] = stack[stack.length - 1];
    const nb = dirs.map(([di, dj]) => [ci + di, cj + dj] as [number, number]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen[a][b]);
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [ni, nj] = nb[Math.floor(rng.next() * nb.length)];
    seen[ni][nj] = true;
    open[2 * ni + 1][2 * nj + 1] = true;
    open[ci + ni + 1][cj + nj + 1] = true; // the wall block between them
    stack.push([ni, nj]);
  }
  // Knock through some of the remaining walls between two rooms for loops.
  for (let i = 1; i < size - 1; i++)
    for (let j = 1; j < size - 1; j++) {
      if (open[i][j]) continue;
      const betweenX = i % 2 === 0 && j % 2 === 1;
      const betweenZ = i % 2 === 1 && j % 2 === 0;
      if ((betweenX || betweenZ) && rng.next() < loopRate) open[i][j] = true;
    }
  return { open, size };
}

/** All open blocks reachable from the first open block (for the connectivity test). */
export function reachableCount(open: boolean[][]): { reached: number; open: number } {
  const size = open.length;
  let total = 0;
  let start: [number, number] | null = null;
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++)
      if (open[i][j]) {
        total++;
        start ??= [i, j];
      }
  if (!start) return { reached: 0, open: 0 };
  const seen = new Set<string>([key(...start)]);
  const q: Array<[number, number]> = [start];
  while (q.length) {
    const [i, j] = q.pop()!;
    for (const [a, b] of [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
    ] as Array<[number, number]>) {
      if (a < 0 || b < 0 || a >= size || b >= size || !open[a][b] || seen.has(key(a, b))) continue;
      seen.add(key(a, b));
      q.push([a, b]);
    }
  }
  return { reached: seen.size, open: total };
}

const openNeighbours = (open: boolean[][], i: number, j: number): number =>
  [open[i + 1]?.[j], open[i - 1]?.[j], open[i]?.[j + 1], open[i]?.[j - 1]].filter(Boolean).length;

/**
 * Builds the sewers for a city: one maze per built-up district, centred under it, with
 * manholes on open pavement above tunnels. `streetOk(x, z)` says whether a manhole can sit there.
 */
export function planSewers(layout: CityLayout, seed: number, centres: Array<{ district: District; x: number; z: number }>, streetOk: (x: number, z: number) => boolean): Maze[] {
  void layout;
  return centres.map((c, idx) => makeMaze(c, idx, seed, 1, streetOk));
}

/**
 * The deep drains: levels 2 and 3 under every district's sewer, smaller mazes further down with
 * more water, more sludge, more caches and no way up but the shafts (Game links them).
 */
export function planDeepSewers(seed: number, top: readonly Maze[]): Maze[] {
  const out: Maze[] = [];
  top.forEach((t, idx) => {
    const W = t.size * SEWER.block;
    const c = { district: t.district, x: t.x0 + W / 2, z: t.z0 + W / 2 };
    for (let level = 2; level <= SEWER.levels.length; level++) out.push(makeMaze(c, idx, seed + level * 7717, level, () => false));
  });
  return out;
}

function makeMaze(c: { district: District; x: number; z: number }, idx: number, seed: number, level: number, streetOk: (x: number, z: number) => boolean): Maze {
    const L = SEWER.levels[level - 1];
    const N = L.rooms;
    const rng = new Rng(seed * 31 + idx * 977);
    const { open, size } = carveMaze(seed + idx * 101, N, SEWER.loopRate + (level - 1) * 0.05);
    const B = SEWER.block;
    const x0 = c.x - (size * B) / 2;
    const z0 = c.z - (size * B) / 2;
    // Hub: a 5x5-block room in the middle.
    const mid = Math.floor(size / 2) | 1;
    const hub = { i: mid, j: mid, r: 2 };
    for (let i = mid - 2; i <= mid + 2; i++) for (let j = mid - 2; j <= mid + 2; j++) open[i][j] = true;
    // Chambers: 3x3 rooms at random room centres away from the hub.
    const chambers: Array<{ i: number; j: number }> = [];
    for (let tries = 0; chambers.length < (level === 1 ? SEWER.chambers : 3) && tries < 200; tries++) {
      const i = 2 * Math.floor(rng.next() * (N - 2)) + 3;
      const j = 2 * Math.floor(rng.next() * (N - 2)) + 3;
      if (i + 1 >= size - 1 || j + 1 >= size - 1) continue;
      if (Math.abs(i - mid) < 7 && Math.abs(j - mid) < 7) continue;
      if (chambers.some((ch) => Math.abs(ch.i - i) < 6 && Math.abs(ch.j - j) < 6)) continue;
      chambers.push({ i, j });
      for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) open[a][b] = true;
    }
    // Halls: 5x5-block open rooms (their own random stream, so chambers and the carve stay put).
    const hrng = new Rng(seed * 53 + idx * 331);
    const hallsRaw: Array<{ i: number; j: number }> = [];
    for (let tries = 0; hallsRaw.length < (level === 1 ? SEWER.halls : level === 2 ? 4 : 3) && tries < 400; tries++) {
      const i = 2 * Math.floor(hrng.next() * (N - 4)) + 5;
      const j = 2 * Math.floor(hrng.next() * (N - 4)) + 5;
      if (i + 2 >= size - 1 || j + 2 >= size - 1) continue;
      if (Math.abs(i - mid) < (level === 1 ? 8 : 6) && Math.abs(j - mid) < (level === 1 ? 8 : 6)) continue;
      if (chambers.some((ch) => Math.abs(ch.i - i) < 6 && Math.abs(ch.j - j) < 6)) continue;
      if (hallsRaw.some((h) => Math.abs(h.i - i) < 9 && Math.abs(h.j - j) < 9)) continue;
      hallsRaw.push({ i, j });
      for (let a = i - 2; a <= i + 2; a++) for (let b = j - 2; b <= j + 2; b++) open[a][b] = true;
    }
    // Nearest the hub first, by walking distance.
    const fromHub = bfsDistances(open, hub.i, hub.j);
    const halls = [...hallsRaw].sort((a, b) => (fromHub.get(key(a.i, a.j)) ?? 1e9) - (fromHub.get(key(b.i, b.j)) ?? 1e9));
    const rooms: Room[] = [{ kind: 'hub', i: hub.i, j: hub.j, r: 2 }, ...chambers.map((c) => ({ kind: 'chamber' as const, i: c.i, j: c.j, r: 1 })), ...halls.map((h) => ({ kind: 'hall' as const, i: h.i, j: h.j, r: 2 }))];
    const inRoom = (i: number, j: number): boolean => (Math.abs(i - hub.i) <= hub.r + 1 && Math.abs(j - hub.j) <= hub.r + 1) || chambers.some((ch) => Math.abs(ch.i - i) <= 1 && Math.abs(ch.j - j) <= 1) || halls.some((h) => Math.abs(h.i - i) <= 2 && Math.abs(h.j - j) <= 2);
    const deadEnds: Array<{ i: number; j: number }> = [];
    for (let i = 1; i < size - 1; i++) for (let j = 1; j < size - 1; j++) if (open[i][j] && openNeighbours(open, i, j) === 1 && !inRoom(i, j)) deadEnds.push({ i, j });
    // Manholes: open room blocks whose street spot above is open pavement, spread apart.
    const manholes: Manhole[] = [];
    const cand: Array<{ i: number; j: number; x: number; z: number }> = [];
    for (let i = 1; i < size - 1; i += 2)
      for (let j = 1; j < size - 1; j += 2) {
        if (!open[i][j] || inRoom(i, j)) continue;
        const x = x0 + (i + 0.5) * B;
        const z = z0 + (j + 0.5) * B;
        if (streetOk(x, z)) cand.push({ i, j, x, z });
      }
    for (const ccc of shuffle(cand, rng)) {
      if (manholes.length >= (level === 1 ? SEWER.manholes : 0)) break;
      if (manholes.some((m) => Math.hypot(m.x - ccc.x, m.z - ccc.z) < 30)) continue;
      manholes.push({ id: `mh-${c.district}-${manholes.length}`, ...ccc });
    }
    // Hazards in plain tunnel blocks, not by manholes, rooms or each other.
    const hazards = new Map<string, Hazard>();
    const nearManhole = (i: number, j: number): boolean => manholes.some((m) => Math.abs(m.i - i) + Math.abs(m.j - j) < 4);
    const tunnels: Array<{ i: number; j: number }> = [];
    for (let i = 1; i < size - 1; i++) for (let j = 1; j < size - 1; j++) if (open[i][j] && !inRoom(i, j) && !nearManhole(i, j)) tunnels.push({ i, j });
    const free = shuffle(tunnels, rng);
    const take = (): { i: number; j: number } | null => {
      while (free.length) {
        const t = free.pop()!;
        if (hazards.has(key(t.i, t.j)) || [...hazards.keys()].some((k) => {
          const [a, b] = k.split(',').map(Number);
          return Math.abs(a - t.i) + Math.abs(b - t.j) < 3;
        }))
          continue;
        return t;
      }
      return null;
    };
    const scale = level === 1 ? 1 : 0.55;
    for (let n = 0; n < Math.round(SEWER.sludge * scale * (level === 3 ? 1.5 : 1)); n++) {
      const t = take();
      if (t) hazards.set(key(t.i, t.j), { kind: 'sludge' });
    }
    for (let n = 0; n < Math.round(SEWER.vents * scale); n++) {
      const t = take();
      if (t) hazards.set(key(t.i, t.j), { kind: 'vent', phase: rng.next() * SEWER.ventCycle });
    }
    // Channels: straight runs of 4+ tunnel blocks; the current flows along the run.
    let made = 0;
    for (const t of shuffle(tunnels, rng)) {
      if (made >= SEWER.channels + (level - 1) * 2) break;
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
      ] as Array<[number, number]>) {
        const run: Array<[number, number]> = [];
        for (let s = 0; s < 6; s++) {
          const a = t.i + dx * s;
          const b = t.j + dz * s;
          if (!open[a]?.[b] || inRoom(a, b) || hazards.has(key(a, b)) || nearManhole(a, b)) break;
          run.push([a, b]);
        }
        if (run.length >= 4) {
          const dir = rng.next() < 0.5 ? 1 : -1;
          for (const [a, b] of run) hazards.set(key(a, b), { kind: 'channel', dx: dx * dir, dz: dz * dir });
          made++;
          break;
        }
      }
    }
    const dark = shuffle(tunnels, rng)
      .filter((t) => !hazards.has(key(t.i, t.j)))
      .slice(0, SEWER.darkZones);
    // Camps spread through the maze: the hall nearest the hub, then each next one as far as
    // possible from the hub and the camps already chosen.
    const camps: Array<{ i: number; j: number }> = halls.slice(0, 1);
    while (camps.length < Math.min(3, halls.length)) {
      let best: { i: number; j: number } | null = null;
      let bestD = -1;
      for (const h of halls) {
        if (camps.includes(h)) continue;
        const d = Math.min(Math.hypot(h.i - hub.i, h.j - hub.j), ...camps.map((c) => Math.hypot(h.i - c.i, h.j - c.j)));
        if (d > bestD) {
          bestD = d;
          best = h;
        }
      }
      if (!best) break;
      camps.push(best);
    }
    // Nobody camps in the deep drains.
    if (level > 1) camps.length = 0;
    // Water: channel runs and sludge blocks sink into pools, and the halls nobody camps in become
    // cisterns (a deep pool in the middle with a walkway round it).
    const pools = new Map<string, Pool>();
    for (const [k, h] of hazards) {
      if (h.kind === 'channel') pools.set(k, { depth: SEWER.channelDepth, toxic: false });
      else if (h.kind === 'sludge') pools.set(k, { depth: SEWER.sludgeDepth + (level - 1) * 0.35, toxic: true });
    }
    const cisterns = halls.filter((h) => !camps.includes(h)).slice(0, level === 1 ? 3 : 2);
    for (const h of cisterns) for (let a = h.i - 1; a <= h.i + 1; a++) for (let b = h.j - 1; b <= h.j + 1; b++) pools.set(key(a, b), { depth: SEWER.cisternDepth + (level - 1) * 0.3, toxic: false });
    // Caches: lockboxes in the dead ends furthest from the hub.
    const byDist = [...deadEnds].filter((d) => !hazards.has(key(d.i, d.j))).sort((a, b) => (fromHub.get(key(b.i, b.j)) ?? 0) - (fromHub.get(key(a.i, a.j)) ?? 0));
    const caches: Cache[] = [];
    for (const d of byDist) {
      if (caches.length >= SEWER.caches[level - 1]) break;
      if (caches.some((o) => Math.abs(o.i - d.i) + Math.abs(o.j - d.j) < 8)) continue;
      const ctr = { x: x0 + (d.i + 0.5) * B, z: z0 + (d.j + 0.5) * B };
      caches.push({ id: `cache-${c.district}-${level}-${caches.length}`, i: d.i, j: d.j, x: ctr.x, z: ctr.z, tier: level });
    }
    // Few dead ends (the lower levels loop a lot): tuck the rest into corners far from the hub.
    if (caches.length < SEWER.caches[level - 1]) {
      const corners: Array<{ i: number; j: number }> = [];
      for (let i = 1; i < size - 1; i++)
        for (let j = 1; j < size - 1; j++) {
          if (!open[i][j] || pools.has(key(i, j)) || hazards.has(key(i, j))) continue;
          const wallsX = (open[i - 1][j] ? 0 : 1) + (open[i + 1][j] ? 0 : 1);
          const wallsZ = (open[i][j - 1] ? 0 : 1) + (open[i][j + 1] ? 0 : 1);
          if (wallsX >= 1 && wallsZ >= 1) corners.push({ i, j });
        }
      corners.sort((a, b) => (fromHub.get(key(b.i, b.j)) ?? 0) - (fromHub.get(key(a.i, a.j)) ?? 0));
      for (const d of corners) {
        if (caches.length >= SEWER.caches[level - 1]) break;
        if (caches.some((o) => Math.abs(o.i - d.i) + Math.abs(o.j - d.j) < 6)) continue;
        caches.push({ id: `cache-${c.district}-${level}-${caches.length}`, i: d.i, j: d.j, x: x0 + (d.i + 0.5) * B, z: z0 + (d.j + 0.5) * B, tier: level });
      }
    }
    const props = placeProps({ open, size, x0, z0, rooms, camps, deadEnds: deadEnds.filter((d) => !caches.some((o) => o.i === d.i && o.j === d.j)), manholes, hazards }, new Rng(seed * 7919 + idx * 613));
    const floor = L.floor;
    return { district: c.district, x0, z0, size, open, hub, chambers, halls, rooms, camps, props, deadEnds, manholes, hazards, dark, level, floor, pools, caches };
}

/** The pool under a point (null: dry tunnel or outside the maze). */
export function poolAt(m: Maze, x: number, z: number): Pool | null {
  const b = blockAt(m, x, z);
  return b ? (m.pools.get(key(b.i, b.j)) ?? null) : null;
}

/**
 * Nearest dry tunnel edge from a point in a pool: how far, which way, and a spot just past it to
 * climb out to (null: no dry neighbour block; keep swimming along).
 */
export function poolEdge(m: Maze, x: number, z: number): { d: number; nx: number; nz: number; outX: number; outZ: number } | null {
  const b = blockAt(m, x, z);
  if (!b) return null;
  const B = SEWER.block;
  let best: { d: number; nx: number; nz: number; outX: number; outZ: number } | null = null;
  for (const [di, dj] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as Array<[number, number]>) {
    const a = b.i + di;
    const c = b.j + dj;
    if (!m.open[a]?.[c] || m.pools.has(key(a, c))) continue;
    // Distance from the point to the shared face of the two blocks.
    const faceX = m.x0 + (b.i + (di > 0 ? 1 : 0)) * B;
    const faceZ = m.z0 + (b.j + (dj > 0 ? 1 : 0)) * B;
    const d = di !== 0 ? Math.abs(faceX - x) : Math.abs(faceZ - z);
    if (!best || d < best.d) best = { d, nx: di, nz: dj, outX: di !== 0 ? faceX + di * 0.7 : x, outZ: dj !== 0 ? faceZ + dj * 0.7 : z };
  }
  return best;
}

/** Block under a world point, or null outside this maze. */
export function blockAt(m: Maze, x: number, z: number): { i: number; j: number } | null {
  const i = Math.floor((x - m.x0) / SEWER.block);
  const j = Math.floor((z - m.z0) / SEWER.block);
  if (i < 0 || j < 0 || i >= m.size || j >= m.size) return null;
  return { i, j };
}

/** Centre of a block in world space. */
export function blockCentre(m: Maze, i: number, j: number): { x: number; z: number } {
  return { x: m.x0 + (i + 0.5) * SEWER.block, z: m.z0 + (j + 0.5) * SEWER.block };
}

/** Is a vent blowing right now? */
export function ventActive(h: { phase: number }, t: number): boolean {
  return (t + h.phase) % SEWER.ventCycle < SEWER.ventActive;
}

/**
 * Walls merged into long boxes: runs of closed blocks along x in each row (for colliders and
 * meshes). Returns [i0, i1, j] runs, inclusive.
 */
export function wallRuns(open: boolean[][]): Array<[number, number, number]> {
  const size = open.length;
  const out: Array<[number, number, number]> = [];
  for (let j = 0; j < size; j++) {
    let i = 0;
    while (i < size) {
      if (open[i][j]) {
        i++;
        continue;
      }
      const s = i;
      while (i < size && !open[i][j]) i++;
      out.push([s, i - 1, j]);
    }
  }
  return out;
}

/** Walking distance (blocks) from (i0, j0) to every open block. */
export function bfsDistances(open: boolean[][], i0: number, j0: number): Map<string, number> {
  const d = new Map<string, number>([[key(i0, j0), 0]]);
  const q: Array<[number, number]> = [[i0, j0]];
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h];
    const n = d.get(key(i, j))!;
    for (const [a, b] of [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
    ] as Array<[number, number]>) {
      if (!open[a]?.[b] || d.has(key(a, b))) continue;
      d.set(key(a, b), n + 1);
      q.push([a, b]);
    }
  }
  return d;
}

/**
 * Props: around the inside walls of the rooms (never in a doorway, the middle stays clear), a
 * burning drum, bedrolls and crates at each camp, junk at some dead ends, and barrels against
 * the walls of straight tunnels (a 3 m tunnel keeps 2 m clear).
 */
function placeProps(
  m: { open: boolean[][]; size: number; x0: number; z0: number; rooms: Room[]; camps: Array<{ i: number; j: number }>; deadEnds: Array<{ i: number; j: number }>; manholes: Manhole[]; hazards: Map<string, Hazard> },
  rng: Rng,
): SewerProp[] {
  const B = SEWER.block;
  const out: SewerProp[] = [];
  const used = new Set<string>();
  const centre = (i: number, j: number): { x: number; z: number } => ({ x: m.x0 + (i + 0.5) * B, z: m.z0 + (j + 0.5) * B });
  const blocked = (i: number, j: number): boolean => used.has(key(i, j)) || m.hazards.has(key(i, j)) || m.manholes.some((h) => Math.abs(h.i - i) + Math.abs(h.j - j) < 2);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)];
  const add = (kind: PropKind, i: number, j: number, ox: number, oz: number, rot = rng.next() * Math.PI * 2): void => {
    const c = centre(i, j);
    out.push({ kind, x: c.x + ox, z: c.z + oz, rot, r: PROP_RADIUS[kind], solid: kind !== 'pallet' && kind !== 'bedroll' });
    used.add(key(i, j));
  };
  const isCamp = (r: Room): boolean => m.camps.some((c) => c.i === r.i && c.j === r.j);
  for (const room of m.rooms) {
    // Border blocks of the room whose outward neighbour is a wall (not a doorway).
    const border: Array<{ i: number; j: number; ox: number; oz: number }> = [];
    for (let i = room.i - room.r; i <= room.i + room.r; i++)
      for (let j = room.j - room.r; j <= room.j + room.r; j++) {
        const edgeX = i === room.i - room.r ? -1 : i === room.i + room.r ? 1 : 0;
        const edgeZ = j === room.j - room.r ? -1 : j === room.j + room.r ? 1 : 0;
        if (!edgeX && !edgeZ) continue;
        if (edgeX && m.open[i + edgeX]?.[j]) continue;
        if (edgeZ && m.open[i]?.[j + edgeZ]) continue;
        // Doorways also open beside a border block: keep the blocks next to a doorway clear too.
        const nearDoor = [-1, 1].some((s) => (edgeX ? m.open[i + edgeX]?.[j + s] : m.open[i + s]?.[j + edgeZ]));
        if (nearDoor) continue;
        border.push({ i, j, ox: edgeX * B * 0.3, oz: edgeZ * B * 0.3 });
      }
    const n = room.kind === 'hall' ? SEWER.propsPerHall : room.kind === 'chamber' ? SEWER.propsPerChamber : SEWER.propsPerHub;
    const kinds: PropKind[] = room.kind === 'hub' ? ['crate', 'crateStack', 'barrel', 'pallet'] : ['barrel', 'barrel', 'crate', 'crateStack', 'pipes', 'tires', 'pallet'];
    let placed = 0;
    for (const b of shuffle(border, rng)) {
      if (placed >= n) break;
      if (blocked(b.i, b.j)) continue;
      const kind = pick(kinds);
      // Pipes lie along the wall.
      const rot = kind === 'pipes' ? (b.ox ? Math.PI / 2 : 0) : rng.next() * Math.PI * 2;
      add(kind, b.i, b.j, b.ox, b.oz, rot);
      placed++;
    }
    if (isCamp(room)) {
      // A camp: a fire in a drum just off centre, bedrolls round it.
      add('drumFire', room.i, room.j, B * 0.25, -B * 0.25, 0);
      add('bedroll', room.i - 1, room.j, 0, 0, Math.PI / 2);
      add('bedroll', room.i, room.j + 1, 0, 0, 0);
    }
  }
  // Dead ends: junk piled against the far wall.
  for (const d of m.deadEnds) {
    if (rng.next() > SEWER.deadEndPropChance || blocked(d.i, d.j)) continue;
    const away = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].find(([a, b]) => m.open[d.i + a]?.[d.j + b]);
    if (!away) continue;
    add(pick<PropKind>(['barrel', 'crate', 'tires', 'crateStack']), d.i, d.j, -away[0] * B * 0.3, -away[1] * B * 0.3);
  }
  // Straight tunnels: a barrel or tyres against one wall.
  const straight: Array<{ i: number; j: number; side: [number, number] }> = [];
  const inAnyRoom = (i: number, j: number): boolean => m.rooms.some((r) => Math.abs(r.i - i) <= r.r + 1 && Math.abs(r.j - j) <= r.r + 1);
  for (let i = 1; i < m.size - 1; i++)
    for (let j = 1; j < m.size - 1; j++) {
      if (!m.open[i][j] || inAnyRoom(i, j)) continue;
      const ew = m.open[i + 1][j] && m.open[i - 1][j] && !m.open[i][j + 1] && !m.open[i][j - 1];
      const ns = m.open[i][j + 1] && m.open[i][j - 1] && !m.open[i + 1][j] && !m.open[i - 1][j];
      if (ew) straight.push({ i, j, side: [0, rng.next() < 0.5 ? 1 : -1] });
      else if (ns) straight.push({ i, j, side: [rng.next() < 0.5 ? 1 : -1, 0] });
    }
  let t = 0;
  for (const s of shuffle(straight, rng)) {
    if (t >= SEWER.tunnelProps) break;
    if (blocked(s.i, s.j) || [...used].some((k) => {
      const [a, b] = k.split(',').map(Number);
      return Math.abs(a - s.i) + Math.abs(b - s.j) < 4;
    }))
      continue;
    add(rng.next() < 0.75 ? 'barrel' : 'tires', s.i, s.j, s.side[0] * B * 0.33, s.side[1] * B * 0.33);
    t++;
  }
  return out;
}

/** Is a solid prop within `pad` of this point? */
export function propAt(m: Pick<Maze, 'props'>, x: number, z: number, pad = 0): SewerProp | null {
  for (const p of m.props) if (p.solid && Math.hypot(p.x - x, p.z - z) < p.r + pad) return p;
  return null;
}

function shuffle<T>(a: readonly T[], rng: Rng): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
