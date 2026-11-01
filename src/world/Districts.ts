import type { District } from '../creatures/Data';
import { districtAt } from '../creatures/SpawnRules';
import type { HumanoidLook } from '../player/Humanoid';
import type { CityLayout } from './CityLayout';

/**
 * Named neighbourhoods (engine-free, unit-tested): each of the city's districts split into places
 * with their own name and feel. Crossing into one puts its name up on screen (the way a city sign
 * would), and each one has:
 *
 *  - a **light** of its own: a gentle colour grade on the ambient light and the haze (the warm
 *    brownstones of Harlow Heights, the cold blue of the Glass District, the sodium orange of the
 *    Canal Yards);
 *  - **people** who dress for it (suits in the Glass District, work gear in the Canal Yards);
 *  - **talk**: the locals' lines about where they live.
 */

export interface Neighbourhood {
  id: string;
  name: string;
  district: District;
  tagline: string;
  /** Colour grade for the ambient light and the haze (multiplied in lightly). */
  tint: number;
  /** How hazy (0..1): thickens the fog a little. */
  haze: number;
  /** Tops and legs the locals wear (one of these colours, most of the time). */
  tops: readonly string[];
  legs: readonly string[];
  /** Locals' lines (speech bubbles). */
  lines: readonly string[];
}

export const NEIGHBOURHOODS: readonly Neighbourhood[] = [
  {
    id: 'harlow',
    name: 'Harlow Heights',
    district: 'uptown',
    tagline: 'Brownstones, stoops and church bells',
    tint: 0xffe2c4,
    haze: 0.1,
    tops: ['#7a4a2a', '#c7a46a', '#3d5b3a', '#8a2f2f', '#e6dcc8'],
    legs: ['#3b3226', '#22252b', '#4a4038'],
    lines: ['Best bagels in the city, right here.', 'Mrs. Okafor on four still waters her stoop plants at six a.m.', 'Church bells again. It\'s Sunday somewhere.'],
  },
  {
    id: 'sutton',
    name: 'Sutton Row',
    district: 'uptown',
    tagline: 'Doormen, dogs in coats and old money',
    tint: 0xe8f0ff,
    haze: 0,
    tops: ['#1f2a44', '#e2e2dc', '#7a6a5a', '#2b3e57', '#c9c2b6'],
    legs: ['#1a1a1a', '#6b6f75', '#2f3d5c'],
    lines: ['Darling, the doorman will get it.', 'My Hustlepup has a better tailor than you.', 'The co-op board will hear about this.'],
  },
  {
    id: 'galley',
    name: "Hell's Galley",
    district: 'midtown',
    tagline: 'Theatres, neon and all-night diners',
    tint: 0xffd4f0,
    haze: 0.15,
    tops: ['#b72f6a', '#1f1f22', '#5a4a7a', '#ff8a3a', '#e2e2dc'],
    legs: ['#1a1a1a', '#22252b', '#5a2a4a'],
    lines: ['Break a leg tonight!', 'Two for one at the Night Owl after the show.', 'I was an understudy once. Long story.'],
  },
  {
    id: 'glass',
    name: 'The Glass District',
    district: 'midtown',
    tagline: 'Towers, lanyards and lunch in twenty minutes',
    tint: 0xd8e8ff,
    haze: 0.05,
    tops: ['#2b3e57', '#e2e2dc', '#1f1f22', '#8a8f96', '#204a7a'],
    legs: ['#22252b', '#1a1a1a', '#6b6f75'],
    lines: ['Can we circle back on that?', 'My badge doesn\'t work on floor forty again.', 'Lunch is a sandwich at my desk. Again.'],
  },
  {
    id: 'canal',
    name: 'Canal Yards',
    district: 'downtown',
    tagline: 'Warehouses, rail yards and Gutter Kings turf',
    tint: 0xffcf9a,
    haze: 0.3,
    tops: ['#4a4a3a', '#7d1f22', '#c78a2a', '#3a3f4a', '#5a4a3a'],
    legs: ['#2f3d5c', '#3b3226', '#1a1a1a'],
    lines: ['Watch yourself round here after dark.', 'They used to make tyres in that building.', 'See red, walk the other way. That\'s the rule.'],
  },
  {
    id: 'battery',
    name: 'Old Battery',
    district: 'downtown',
    tagline: 'Cobblestones, banks and the old harbour forts',
    tint: 0xfff0d0,
    haze: 0.12,
    tops: ['#1f2a44', '#e2e2dc', '#4a3a2a', '#204a7a', '#7a6a5a'],
    legs: ['#22252b', '#1a1a1a', '#4a4038'],
    lines: ['This street\'s older than the country.', 'The market\'s up. Or down. Something happened.', 'Ferry\'s late again.'],
  },
  {
    id: 'green',
    name: 'The Central Green',
    district: 'park',
    tagline: 'Meadows, the pond and room to breathe',
    tint: 0xeaffd8,
    haze: 0.05,
    tops: ['#3d5b3a', '#e2e2dc', '#c78a2a', '#204a7a', '#ff7ab0'],
    legs: ['#2f3d5c', '#6b6f75', '#22252b'],
    lines: ['Don\'t feed the Quackpacks, they get bold.', 'Perfect day for a run.', 'I come here to forget the office exists.'],
  },
  {
    id: 'waterfront',
    name: 'The Waterfront',
    district: 'waterfront',
    tagline: 'The piers, the gulls and the river wind',
    tint: 0xdcecff,
    haze: 0.2,
    tops: ['#204a7a', '#e2e2dc', '#c78a2a', '#3a3f4a', '#8a2f2f'],
    legs: ['#2f3d5c', '#22252b', '#3b3226'],
    lines: ['Gulls stole my hot dog. Again.', 'The tug captain swears she saw a Gullgrifter carry off a cat.', 'Smell that? River.'],
  },
];

const BY_ID = new Map(NEIGHBOURHOODS.map((n) => [n.id, n]));

/** The neighbourhood at a point: the district, split west/east by the island's middle. */
export function neighbourhoodAt(layout: CityLayout, x: number, z: number): Neighbourhood {
  const d = districtAt(layout, x, z);
  const mid = (layout.land.x0 + layout.land.x1) / 2;
  const west = x < mid;
  switch (d) {
    case 'uptown':
      return BY_ID.get(west ? 'harlow' : 'sutton')!;
    case 'midtown':
      return BY_ID.get(west ? 'galley' : 'glass')!;
    case 'downtown':
      return BY_ID.get(west ? 'canal' : 'battery')!;
    case 'park':
      return BY_ID.get('green')!;
    default:
      return BY_ID.get('waterfront')!;
  }
}

/** Dresses a passer-by for the neighbourhood (most locals; a few visitors keep their own look). */
export function localLook(n: Neighbourhood, look: HumanoidLook, rand: () => number): HumanoidLook {
  if (rand() < 0.3) return look;
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
  return { ...look, top: pick(n.tops), legs: look.skirt ? look.legs : pick(n.legs) };
}

/** Tracks which neighbourhood you're in; reports a change (after you've been in it a moment). */
export class NeighbourhoodTracker {
  current: Neighbourhood | null = null;
  private candidate: Neighbourhood | null = null;
  private held = 0;

  /** Returns the new neighbourhood when you've just arrived in one (held `settle` seconds), else null. */
  update(n: Neighbourhood, dt: number, settle = 1.2): Neighbourhood | null {
    if (n === this.current) {
      this.candidate = null;
      this.held = 0;
      return null;
    }
    if (n !== this.candidate) {
      this.candidate = n;
      this.held = 0;
    }
    this.held += dt;
    if (this.held < settle && this.current !== null) return null;
    this.current = n;
    this.candidate = null;
    return n;
  }
}
