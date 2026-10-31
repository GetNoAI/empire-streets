import { Rng } from '../util/rng';
import type { CityLayout } from './CityLayout';

/**
 * Where the smaller street furniture goes (engine-free, deterministic, unit-tested): trash cans,
 * newspaper boxes, benches and mailboxes along the kerb side of each block's long sidewalks.
 * Newspaper boxes and mailboxes gather towards corners, cans and benches mid-block. Nothing goes
 * on a corner (crossings), in front of a garage ramp, or within 2.2 m of a lamp, hydrant or tree.
 */

export type SmallPropKind = 'trashCan' | 'newsBox' | 'bench' | 'mailbox';

export interface PropPlacement {
  kind: SmallPropKind;
  x: number;
  z: number;
  /** Heading: the prop's front faces the road. */
  rot: number;
}

export const STREET_PROPS = {
  /** Distance from the kerb (m). */
  inset: 1.05,
  /** Spacing of candidate spots along a sidewalk (m), and the clear zone at each corner. */
  step: 21,
  corner: 9,
  /** Chance a candidate spot gets something. */
  fill: 0.6,
  /** Keep this far from existing furniture (m). */
  clearance: 2.2,
} as const;

export function planStreetProps(layout: CityLayout, avoid: Array<{ x: number; z: number }>, seed = layout.seed + 913): PropPlacement[] {
  const rng = new Rng(seed);
  const S = STREET_PROPS;
  const out: PropPlacement[] = [];
  // A coarse grid of what's already on the pavements.
  const grid = new Map<string, Array<{ x: number; z: number }>>();
  const key = (x: number, z: number): string => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
  const put = (p: { x: number; z: number }): void => {
    const k = key(p.x, p.z);
    const l = grid.get(k);
    if (l) l.push(p);
    else grid.set(k, [p]);
  };
  for (const a of avoid) put(a);
  const free = (x: number, z: number): boolean => {
    const cx = Math.floor(x / 6);
    const cz = Math.floor(z / 6);
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cz - 1; j <= cz + 1; j++) for (const p of grid.get(`${i},${j}`) ?? []) if (Math.hypot(p.x - x, p.z - z) < S.clearance) return false;
    return true;
  };
  const garageEntry = (x: number, z: number): boolean =>
    (layout.garages ?? []).some((g) => {
      const r = g.rect;
      const faceZ = Math.abs(z - r.z0) < Math.abs(z - r.z1) ? r.z0 : r.z1;
      return x > r.x0 - 34 && x < r.x0 + 14 && Math.abs(z - faceZ) < 8 && (z < r.z0 || z > r.z1);
    });
  for (const b of layout.blocks) {
    for (const side of [0, 1] as const) {
      const z = side === 0 ? b.z0 + S.inset : b.z1 - S.inset;
      // Facing the road: north edge faces -z, south edge +z (rot about Y, front = +Z local).
      const rot = side === 0 ? Math.PI : 0;
      const first = b.x0 + S.corner;
      const last = b.x1 - S.corner;
      for (let x = first; x <= last; x += S.step) {
        if (!rng.chance(S.fill)) continue;
        const nearCorner = x - first < S.step || last - x < S.step;
        const r = rng.next();
        const kind: SmallPropKind = nearCorner ? (r < 0.45 ? 'newsBox' : r < 0.75 ? 'mailbox' : 'trashCan') : r < 0.55 ? 'trashCan' : r < 0.85 ? 'bench' : 'newsBox';
        const px = x + rng.range(-2, 2);
        if (!free(px, z) || garageEntry(px, z)) continue;
        const p = { kind, x: px, z, rot };
        out.push(p);
        put(p);
      }
    }
  }
  return out;
}
