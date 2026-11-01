import { FLIGHT } from './SpawnRules';
import { species, speciesBiomes } from './Data';

/**
 * How a Streetmon takes part in a fight on the water (engine-free, unit-tested): pond and sludge
 * species swim (low in the water), flyers hover over it, and everything else rides an orange life
 * raft. `waterLift` is its height above the surface, bobbing gently.
 */

export type WaterRide = 'swim' | 'fly' | 'raft';

export function waterRide(speciesId: string): WaterRide {
  const sp = species(speciesId);
  if (FLIGHT[speciesId]) return 'fly';
  if (speciesBiomes(sp).includes('pond') || sp.types.includes('sludge')) return 'swim';
  return 'raft';
}

export function waterLift(ride: WaterRide, height: number, t: number): number {
  switch (ride) {
    case 'fly':
      return 1.2 + Math.min(0.8, height * 0.3) + Math.sin(t * 2.4) * 0.18;
    case 'swim':
      return -Math.min(0.6, height * 0.35) + Math.sin(t * 1.6) * 0.04;
    default:
      // The raft's floor sits a little above the water; it bobs with the swell.
      return 0.12 + Math.sin(t * 1.4) * 0.05;
  }
}
