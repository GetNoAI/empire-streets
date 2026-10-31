import type { Biome } from '../creatures/Data';
import type { Building, CityLayout, Rect } from './CityLayout';

/**
 * Which world layer a point is in: the street, a rooftop, or the sewers far below. Every system
 * that cares (spawning, police, music, the HUD, lighting) asks this one service. The geometry
 * lookup is engine-free and unit-tested; `current` is the player's layer, changed only through
 * the game's `transition()`.
 */

export const LAYERS = {
  /** Anything below this height is the sewer layer (m). The maze floor sits at -40. */
  sewerCeiling: -15,
  sewerFloor: -40,
  /** Standing within this much of a roof's top counts as being on the roof (m). */
  roofTolerance: 1.2,
  /** Only roofs at least this high count (low kiosks and the like are street furniture). */
  minRoofHeight: 6,
  /** Spatial grid cell for the building lookup (m). */
  cell: 32,
} as const;

const inRect = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

export interface RoofHit {
  building: Building | null;
  /** Height of the roof surface here (the setback tower's roof where there is one). */
  top: number;
  /** The rect of that roof surface. */
  rect: Rect;
}

export class WorldLayers {
  current: Biome = 'street';
  private readonly grid = new Map<string, Building[]>();
  /** Extra roof surfaces that aren't buildings (parking-garage decks). */
  private readonly extra: Array<{ rect: Rect; top: number }> = [];

  constructor(private readonly layout: CityLayout) {
    for (const b of layout.buildings) {
      const r = b.rect;
      for (let gx = Math.floor(r.x0 / LAYERS.cell); gx <= Math.floor(r.x1 / LAYERS.cell); gx++)
        for (let gz = Math.floor(r.z0 / LAYERS.cell); gz <= Math.floor(r.z1 / LAYERS.cell); gz++) {
          const k = `${gx},${gz}`;
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(b);
        }
    }
  }

  /** Adds a roof surface that isn't a building (a garage deck). */
  addRoof(rect: Rect, top: number): void {
    this.extra.push({ rect, top });
  }

  /** The building whose footprint contains a point, if any. */
  buildingAt(x: number, z: number): Building | null {
    const list = this.grid.get(`${Math.floor(x / LAYERS.cell)},${Math.floor(z / LAYERS.cell)}`);
    if (!list) return null;
    for (const b of list) if (inRect(b.rect, x, z)) return b;
    return null;
  }

  /** The roof surface above a point, if any. */
  roofAt(x: number, z: number): RoofHit | null {
    for (const e of this.extra) if (inRect(e.rect, x, z)) return { building: null, top: e.top, rect: e.rect };
    const b = this.buildingAt(x, z);
    if (!b || b.height < LAYERS.minRoofHeight) return null;
    if (b.setback && inRect(b.setback.rect, x, z)) return { building: b, top: b.height + b.setback.height, rect: b.setback.rect };
    return { building: b, top: b.height, rect: b.rect };
  }

  /** Layer of a point in the world. */
  layerAt(x: number, y: number, z: number): Biome {
    if (y < LAYERS.sewerCeiling) return 'sewer';
    const roof = this.roofAt(x, z);
    if (roof && y > roof.top - LAYERS.roofTolerance) return 'roof';
    return 'street';
  }

  get buildingCount(): number {
    return this.layout.buildings.length;
  }
}

/** Short HUD label for a layer. */
export function layerLabel(b: Biome): string {
  return b === 'roof' ? 'Rooftops' : b === 'sewer' ? 'Sewers' : '';
}
