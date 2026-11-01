import type { District } from '../creatures/Data';
import { districtAt } from '../creatures/SpawnRules';
import { Rng } from '../util/rng';
import { CITY, type Building, type CityLayout, type Rect } from './CityLayout';

/**
 * Back alleys: narrow service lanes cut through a few city blocks, street to street, between two
 * of the block's row buildings. The city generator fills every block edge to edge, so this runs
 * once after `generateLayout` (like the parking-garage planner) and splits the buildings the lane
 * runs through; everything built from the layout afterwards (meshes, colliders, the walk map,
 * rooftops) sees the gap. Deterministic for a given layout and seed.
 *
 * Blocks near hand-placed locations (heist sites, race starts, drop-offs, NPCs: `avoid`) and the
 * player's start are left alone.
 */

export interface Alley {
  id: string;
  /** The lane's floor (raised block level), street to street. */
  rect: Rect;
  /** Centre of the lane. */
  x: number;
  z: number;
  district: District;
}

export const ALLEYS = {
  /** Alleys per built-up district. */
  perDistrict: 2,
  /** Lane width (m). */
  width: 6,
  /** Keep this far (m) from any avoided point. */
  clearance: 45,
  /** Building slivers narrower than this after the cut are dropped (m). */
  minPiece: 6,
  seed: 4157,
} as const;

const cxOf = (r: Rect): number => (r.x0 + r.x1) / 2;
const czOf = (r: Rect): number => (r.z0 + r.z1) / 2;

/** Distance from a point to a rectangle (0 inside). */
function rectDist(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

/**
 * Cuts the alleys into `layout.buildings` and records them on `layout.alleys`. Returns them.
 */
export function planAlleys(layout: CityLayout, avoid: ReadonlyArray<{ x: number; z: number }> = [], seed: number = ALLEYS.seed): Alley[] {
  const rng = new Rng(seed);
  const sw = CITY.sidewalk;
  const keepAway = [...avoid, layout.playerSpawn];
  const byDistrict = new Map<District, Array<{ block: Rect; x: number }>>();
  for (const block of layout.blocks) {
    const d = districtAt(layout, cxOf(block), czOf(block));
    if (d === 'park') continue;
    if (keepAway.some((p) => rectDist(block, p.x, p.z) < ALLEYS.clearance)) continue;
    // Where to cut: a building edge in the block's middle stretch (between the corner towers), so
    // the lane runs along an existing party wall and leaves whole buildings either side.
    const inner: Rect = { x0: block.x0 + sw, x1: block.x1 - sw, z0: block.z0 + sw, z1: block.z1 - sw };
    const rowEdges = layout.buildings
      .filter((b) => b.rect.z0 >= inner.z0 - 0.1 && b.rect.z1 <= inner.z1 + 0.1 && b.rect.x0 >= inner.x0 - 0.1 && b.rect.x1 <= inner.x1 + 0.1 && !b.setback)
      .flatMap((b) => [b.rect.x0, b.rect.x1])
      .filter((x) => x > inner.x0 + 40 && x < inner.x1 - 40);
    if (!rowEdges.length) continue;
    const mid = cxOf(inner);
    rowEdges.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    let list = byDistrict.get(d);
    if (!list) byDistrict.set(d, (list = []));
    list.push({ block, x: rowEdges[0] });
  }
  const alleys: Alley[] = [];
  for (const [district, list] of [...byDistrict.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const pool = [...list];
    for (let k = 0; k < ALLEYS.perDistrict && pool.length; k++) {
      const pick = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
      // Not two alleys in neighbouring blocks.
      for (let i = pool.length - 1; i >= 0; i--) if (rectDist(pool[i].block, cxOf(pick.block), czOf(pick.block)) < 80) pool.splice(i, 1);
      const half = ALLEYS.width / 2;
      const rect: Rect = { x0: pick.x - half, x1: pick.x + half, z0: pick.block.z0 + sw, z1: pick.block.z1 - sw };
      cut(layout, rect);
      alleys.push({ id: `alley-${district}-${k + 1}`, rect, x: pick.x, z: czOf(rect), district });
    }
  }
  layout.alleys = alleys;
  return alleys;
}

/** Splits every building the lane runs through; slivers are dropped. */
function cut(layout: CityLayout, lane: Rect): void {
  const out: Building[] = [];
  for (const b of layout.buildings) {
    const r = b.rect;
    const hits = r.x0 < lane.x1 && r.x1 > lane.x0 && r.z0 < lane.z1 && r.z1 > lane.z0;
    if (!hits) {
      out.push(b);
      continue;
    }
    for (const [x0, x1] of [
      [r.x0, Math.min(r.x1, lane.x0)],
      [Math.max(r.x0, lane.x1), r.x1],
    ] as const) {
      if (x1 - x0 < ALLEYS.minPiece) continue;
      out.push({ ...b, rect: { ...r, x0, x1 }, setback: null, spire: 0 });
    }
  }
  layout.buildings.splice(0, layout.buildings.length, ...out);
}

/**
 * Points the alleys must stay clear of: everything hand-placed in the heist and race configs
 * (facades, breach points, lock-ups, planning spots, race organizers).
 */
export function alleyAvoidPoints(heists: unknown, races: { tracks?: Array<{ organizer?: { x: number; z: number } }> }): Array<{ x: number; z: number }> {
  const pts: Array<{ x: number; z: number }> = [];
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    if (typeof r.x === 'number' && typeof r.z === 'number') pts.push({ x: r.x, z: r.z });
    for (const v of Object.values(r)) walk(v);
  };
  walk(heists);
  for (const t of races.tracks ?? []) if (t.organizer) pts.push({ x: t.organizer.x, z: t.organizer.z });
  return pts;
}

