import * as THREE from 'three';
import type { CityLayout } from './CityLayout';
import { withSurface } from '../render/Surfaces';

/**
 * Weapon stashes on the street (layout engine-free and tested; the meshes below). Guns no longer
 * lie around in the open: they come from Hardline Arms, quest rewards, the sewer caches and these
 * stashes, hidden down the back alleys (a duffel behind a dumpster, a locked crate). The better
 * ones are locked: a Lockpick Set opens them. Each opens once (saved with the other caches).
 */

export interface StreetCache {
  id: string;
  x: number;
  z: number;
  /** Behind a padlock: needs a Lockpick Set. */
  locked: boolean;
  weapon: string;
  rounds: number;
  cash: number;
}

/** What's in them, from the basic to the best (locked ones get the good stuff). */
const CONTENTS: Array<{ weapon: string; rounds: number; locked: boolean }> = [
  { weapon: 'bat', rounds: 0, locked: false },
  { weapon: 'knife', rounds: 0, locked: false },
  { weapon: 'pistol', rounds: 36, locked: false },
  { weapon: 'molotov', rounds: 3, locked: false },
  { weapon: 'revolver', rounds: 18, locked: false },
  { weapon: 'pistol', rounds: 24, locked: false },
  { weapon: 'shotgun', rounds: 16, locked: true },
  { weapon: 'smg', rounds: 60, locked: true },
  { weapon: 'rifle', rounds: 60, locked: true },
  { weapon: 'sniper', rounds: 10, locked: true },
];

/** One stash per alley (spread round the city), up to the list above. */
export function planStreetCaches(layout: CityLayout): StreetCache[] {
  const alleys = [...(layout.alleys ?? [])].sort((a, b) => a.x * 0.37 + a.z * 0.11 - (b.x * 0.37 + b.z * 0.11));
  const out: StreetCache[] = [];
  const n = Math.min(alleys.length, CONTENTS.length);
  for (let k = 0; k < n; k++) {
    // Fewer alleys than stashes: spread the contents so the good (padlocked) ones are still in.
    const a = alleys[n > 1 ? Math.round((k * (alleys.length - 1)) / (n - 1)) : 0];
    const r = a.rect;
    // Tucked against one side, a third of the way down.
    const long = r.x1 - r.x0 > r.z1 - r.z0;
    const x = long ? r.x0 + (r.x1 - r.x0) * 0.33 : r.x0 + 0.7;
    const z = long ? r.z0 + 0.7 : r.z0 + (r.z1 - r.z0) * 0.33;
    const c = CONTENTS[n > 1 ? Math.round((k * (CONTENTS.length - 1)) / (n - 1)) : 0];
    out.push({ id: `street-cache-${k}`, x, z, locked: c.locked, weapon: c.weapon, rounds: c.rounds, cash: 40 + k * 25 });
  }
  return out;
}

export interface StreetCacheView {
  root: THREE.Group;
  setOpen(id: string, open: boolean): void;
}

export function buildStreetCaches(list: readonly StreetCache[], groundY: (x: number, z: number) => number): StreetCacheView {
  const root = new THREE.Group();
  root.name = 'street-caches';
  const duffel = withSurface(new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.95 }), 'fabric');
  const crate = withSurface(new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.7, metalness: 0.4 }), 'paintedMetal');
  const lockM = new THREE.MeshStandardMaterial({ color: 0xd4a531, metalness: 0.9, roughness: 0.3 });
  const items = new Map<string, THREE.Group>();
  for (const c of list) {
    const g = new THREE.Group();
    g.position.set(c.x, groundY(c.x, c.z), c.z);
    if (c.locked) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.6), crate);
      body.position.y = 0.25;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.62), crate);
      lid.position.y = 0.54;
      lid.name = 'lid';
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), lockM);
      lock.position.set(0, 0.42, 0.32);
      lock.name = 'lock';
      g.add(body, lid, lock);
    } else {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 10).rotateZ(Math.PI / 2), duffel);
      bag.position.y = 0.22;
      bag.name = 'lid';
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 4, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      strap.position.set(0, 0.42, 0);
      g.add(bag, strap);
    }
    for (const m of g.children) m.castShadow = true;
    root.add(g);
    items.set(c.id, g);
  }
  return {
    root,
    setOpen(id, open) {
      const g = items.get(id);
      if (!g) return;
      const lid = g.getObjectByName('lid');
      const lock = g.getObjectByName('lock');
      if (lid) {
        lid.rotation.z = open ? 1.2 : 0;
        lid.position.x = open ? -0.4 : 0;
        lid.scale.setScalar(open ? 0.85 : 1);
      }
      if (lock) lock.visible = !open;
    },
  };
}
