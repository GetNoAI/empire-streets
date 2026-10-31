import { Rng } from '../util/rng';

/**
 * Engine-independent description of an NYC-style island: north-south avenues, east-west streets,
 * a large central park, waterfront promenades and building lots. Units are metres.
 * Axes: +X east, +Z south (so north is -Z), Y up.
 */

export type Facade = 'glass' | 'darkglass' | 'brick' | 'brownstone' | 'limestone' | 'concrete';
export const FACADES: readonly Facade[] = ['glass', 'darkglass', 'brick', 'brownstone', 'limestone', 'concrete'];

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Building {
  /** Footprint (axis-aligned). */
  rect: Rect;
  height: number;
  facade: Facade;
  /** Optional narrower tower stacked on top. */
  setback: { rect: Rect; height: number } | null;
  spire: number;
  waterTower: boolean;
}

export interface Road {
  /** 'ave' runs north-south (along Z), 'street' runs east-west (along X). */
  kind: 'ave' | 'street';
  /** Centre-line coordinate (x for avenues, z for streets). */
  center: number;
  width: number;
  /** Extent along the road's direction. */
  from: number;
  to: number;
  /** Lanes per direction. */
  lanes: number;
  name: string;
}

export interface ParkingSpot {
  x: number;
  z: number;
  /** Heading in radians, 0 = facing +X (east); rotation is about +Y using three.js convention. */
  heading: number;
}

export interface CityLayout {
  seed: number;
  /** Island bounds (land). Water surrounds it. */
  land: Rect;
  aveX: number[];
  streetZ: number[];
  roads: Road[];
  /** Raised sidewalk/block footprints (one per block, includes the building area). */
  blocks: Rect[];
  park: Rect;
  parkLake: Rect;
  buildings: Building[];
  parking: ParkingSpot[];
  playerSpawn: { x: number; z: number };
  /** Promenade strip between outer roads and the water. */
  promenade: number;
  /** Parking garages that replaced pairs of buildings (set by the rooftop planner before building). */
  garages?: Array<{ rect: Rect }>;
  /** Back alleys cut through some blocks (set by planAlleys before building). */
  alleys?: Array<{ id: string; rect: Rect; x: number; z: number; district: string }>;
}

export const CITY = {
  numAves: 7,
  numStreets: 20,
  aveSpacing: 150,
  streetSpacing: 62,
  aveWidth: 22,
  streetWidth: 13,
  sidewalk: 4.5,
  promenade: 14,
  /** Avenue / street index ranges [start, end) covered by the park. */
  parkAves: [2, 4] as const,
  parkStreets: [6, 13] as const,
} as const;

const AVE_NAMES = ['West Ave', '10th Ave', '8th Ave', '6th Ave', '5th Ave', '3rd Ave', 'East Ave'];

export function generateLayout(seed = 1903): CityLayout {
  const rng = new Rng(seed);
  const aveX: number[] = [];
  const streetZ: number[] = [];
  for (let i = 0; i < CITY.numAves; i++) aveX.push((i - (CITY.numAves - 1) / 2) * CITY.aveSpacing);
  for (let j = 0; j < CITY.numStreets; j++) streetZ.push((j - (CITY.numStreets - 1) / 2) * CITY.streetSpacing);

  const ax0 = aveX[0];
  const ax1 = aveX[aveX.length - 1];
  const sz0 = streetZ[0];
  const sz1 = streetZ[streetZ.length - 1];
  const land: Rect = {
    x0: ax0 - CITY.aveWidth / 2 - CITY.promenade,
    x1: ax1 + CITY.aveWidth / 2 + CITY.promenade,
    z0: sz0 - CITY.streetWidth / 2 - CITY.promenade,
    z1: sz1 + CITY.streetWidth / 2 + CITY.promenade,
  };

  const [pa0, pa1] = CITY.parkAves;
  const [ps0, ps1] = CITY.parkStreets;
  const park: Rect = {
    x0: aveX[pa0] + CITY.aveWidth / 2,
    x1: aveX[pa1 + 1] - CITY.aveWidth / 2,
    z0: streetZ[ps0] + CITY.streetWidth / 2,
    z1: streetZ[ps1 + 1] - CITY.streetWidth / 2,
  };
  const pw = park.x1 - park.x0;
  const pd = park.z1 - park.z0;
  const parkLake: Rect = {
    x0: park.x0 + pw * 0.3,
    x1: park.x0 + pw * 0.62,
    z0: park.z0 + pd * 0.55,
    z1: park.z0 + pd * 0.8,
  };

  // Roads: avenues run the full length except where they would cross the park.
  const roads: Road[] = [];
  aveX.forEach((x, i) => {
    const name = AVE_NAMES[i] ?? `Ave ${i}`;
    const crossesPark = i > pa0 && i <= pa1;
    const full: [number, number] = [sz0 - CITY.streetWidth / 2, sz1 + CITY.streetWidth / 2];
    const pieces: Array<[number, number]> = crossesPark ? [[full[0], park.z0], [park.z1, full[1]]] : [full];
    for (const [from, to] of pieces) {
      roads.push({ kind: 'ave', center: x, width: CITY.aveWidth, from, to, lanes: 2, name });
    }
  });
  streetZ.forEach((z, j) => {
    const name = `${ordinal(j * 4 + 14)} St`;
    const crossesPark = j > ps0 && j <= ps1;
    const full: [number, number] = [ax0 - CITY.aveWidth / 2, ax1 + CITY.aveWidth / 2];
    const pieces: Array<[number, number]> = crossesPark ? [[full[0], park.x0], [park.x1, full[1]]] : [full];
    for (const [from, to] of pieces) {
      roads.push({ kind: 'street', center: z, width: CITY.streetWidth, from, to, lanes: 1, name });
    }
  });

  // Blocks and buildings.
  const blocks: Rect[] = [];
  const buildings: Building[] = [];
  const inPark = (i: number, j: number): boolean => i >= pa0 && i <= pa1 && j >= ps0 && j <= ps1;
  for (let i = 0; i < aveX.length - 1; i++) {
    for (let j = 0; j < streetZ.length - 1; j++) {
      if (inPark(i, j)) continue;
      const b: Rect = {
        x0: aveX[i] + CITY.aveWidth / 2,
        x1: aveX[i + 1] - CITY.aveWidth / 2,
        z0: streetZ[j] + CITY.streetWidth / 2,
        z1: streetZ[j + 1] - CITY.streetWidth / 2,
      };
      blocks.push(b);
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      fillBlock(b, density(cx, cz, land), rng, buildings);
    }
  }

  const parking = placeParking(roads, aveX, streetZ, park, rng);

  // Spawn on the sidewalk near the middle of town, next to a parking spot.
  let spawn = { x: 0, z: 0 };
  let bestD = Infinity;
  for (const p of parking) {
    const d = Math.hypot(p.x - aveX[1] * 0.2, p.z - streetZ[4]);
    if (d < bestD) {
      bestD = d;
      spawn = { x: p.x, z: p.z };
    }
  }
  // Step from the parking lane onto the nearest sidewalk.
  spawn = nearestSidewalkPoint(spawn.x, spawn.z, blocks);

  return {
    seed,
    land,
    aveX,
    streetZ,
    roads,
    blocks,
    park,
    parkLake,
    buildings,
    parking,
    playerSpawn: spawn,
    promenade: CITY.promenade,
  };
}

function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** 0..1 building density: a midtown peak, a downtown peak in the south, lower uptown. */
function density(x: number, z: number, land: Rect): number {
  const h = land.z1 - land.z0;
  const midtown = Math.exp(-(((z - (land.z0 + h * 0.62)) / (h * 0.14)) ** 2));
  const downtown = Math.exp(-(((z - (land.z1 - h * 0.08)) / (h * 0.09)) ** 2));
  const centre = Math.exp(-((x / ((land.x1 - land.x0) * 0.45)) ** 2));
  return Math.min(1, 0.18 + 0.82 * Math.max(midtown, downtown * 1.05) * (0.6 + 0.4 * centre));
}

/**
 * NYC pattern: towers on the avenue ends of a block, rows of narrow brownstones/tenements in the middle.
 * Every lot is pulled in from the block edge by the sidewalk width.
 */
function fillBlock(b: Rect, dens: number, rng: Rng, out: Building[]): void {
  const sw = CITY.sidewalk;
  const x0 = b.x0 + sw;
  const x1 = b.x1 - sw;
  const z0 = b.z0 + sw;
  const z1 = b.z1 - sw;
  const depth = z1 - z0;
  const endW = 22 + rng.range(0, 12);

  const tower = (r: Rect): void => {
    const tall = rng.chance(dens);
    const height = tall ? 40 + dens * rng.range(60, 210) : rng.range(18, 34);
    const facade: Facade = tall
      ? rng.pick(['glass', 'darkglass', 'limestone', 'concrete', 'glass'] as const)
      : rng.pick(['brick', 'limestone', 'concrete'] as const);
    let setback: Building['setback'] = null;
    let spire = 0;
    if (tall && height > 90 && rng.chance(0.55)) {
      const inset = Math.min(r.x1 - r.x0, r.z1 - r.z0) * rng.range(0.15, 0.25);
      setback = {
        rect: { x0: r.x0 + inset, x1: r.x1 - inset, z0: r.z0 + inset, z1: r.z1 - inset },
        height: height * rng.range(0.25, 0.5),
      };
      if (rng.chance(0.35)) spire = rng.range(10, 40);
    }
    out.push({ rect: r, height, facade, setback, spire, waterTower: !tall && rng.chance(0.5) });
  };

  tower({ x0, x1: x0 + endW, z0, z1 });
  tower({ x0: x1 - endW, x1, z0, z1 });

  // Middle: two rows (north- and south-facing) of narrow buildings, grouped into short runs.
  const mx0 = x0 + endW;
  const mx1 = x1 - endW;
  for (const [rz0, rz1] of [
    [z0, z0 + depth / 2],
    [z0 + depth / 2, z1],
  ] as const) {
    let x = mx0;
    while (x < mx1 - 4) {
      const w = Math.min(mx1 - x, rng.range(14, 32));
      const midrise = rng.chance(dens * 0.6);
      const height = midrise ? rng.range(28, 25 + dens * 70) : rng.range(12, 20);
      const facade: Facade = midrise ? rng.pick(['brick', 'limestone', 'concrete'] as const) : rng.pick(['brownstone', 'brick', 'brownstone'] as const);
      out.push({ rect: { x0: x, x1: x + w, z0: rz0, z1: rz1 }, height, facade, setback: null, spire: 0, waterTower: rng.chance(0.35) });
      x += w;
    }
  }
}

function placeParking(roads: Road[], aveX: number[], streetZ: number[], park: Rect, rng: Rng): ParkingSpot[] {
  const out: ParkingSpot[] = [];
  const clearOfJunctions = (along: number, crossings: number[], half: number): boolean =>
    crossings.every((c) => Math.abs(along - c) > half + 9);
  for (const r of roads) {
    const offset = r.width / 2 - 1.3;
    const crossings = r.kind === 'ave' ? streetZ : aveX;
    const crossHalf = r.kind === 'ave' ? CITY.streetWidth / 2 : CITY.aveWidth / 2;
    for (let s = r.from + 8; s < r.to - 8; s += 6.5) {
      if (!clearOfJunctions(s, crossings, crossHalf)) continue;
      for (const side of [-1, 1]) {
        if (!rng.chance(0.16)) continue;
        if (r.kind === 'ave') {
          const x = r.center + side * offset;
          if (x > park.x0 - 2 && x < park.x1 + 2 && s > park.z0 && s < park.z1) continue;
          // Right-hand traffic: the east side heads north (-Z), the west side heads south (+Z).
          out.push({ x, z: s, heading: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
        } else {
          const z = r.center + side * offset;
          // South side (+Z) heads east (+X), north side heads west.
          out.push({ x: s, z, heading: side > 0 ? 0 : Math.PI });
        }
      }
    }
  }
  return out;
}

function nearestSidewalkPoint(x: number, z: number, blocks: Rect[]): { x: number; z: number } {
  let best = { x, z };
  let bestD = Infinity;
  for (const b of blocks) {
    const px = Math.max(b.x0 + 1.5, Math.min(b.x1 - 1.5, x));
    const pz = Math.max(b.z0 + 1.5, Math.min(b.z1 - 1.5, z));
    const d = Math.hypot(px - x, pz - z);
    if (d < bestD) {
      bestD = d;
      best = { x: px, z: pz };
    }
  }
  return best;
}

export function rectContains(r: Rect, x: number, z: number, pad = 0): boolean {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}
