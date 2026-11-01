/**
 * Dual reputation (engine-free, unit-tested). Two standings that pull against each other:
 *
 *  - **Street Cred**: how the underworld sees you. Races, fights, beating gang members, big wins at
 *    the casino and (some) crimes earn it. It opens the bigger races, gets you black-market prices
 *    and makes gangs think twice before starting on you.
 *  - **Civic Standing** (-100..100): how ordinary people and the police see you. Helping people,
 *    finishing jobs for them and taking gangs off the street raise it; crimes, hurting passers-by
 *    and wanted levels lower it. High: shopkeepers give you a discount, witnesses look the other
 *    way for small things, the police are slower to escalate. Low: prices go up, people report you
 *    and keep their distance.
 *
 * The game keeps the numbers; this decides what they change.
 */

export const REP = {
  civicMin: -100,
  civicMax: 100,
  /** What things are worth, per event: [street, civic]. */
  events: {
    crime: [1, -2],
    pedKilled: [0, -6],
    copHurt: [2, -5],
    gangBeaten: [2, 2],
    gangBossBeaten: [10, 10],
    hideoutCleared: [15, 15],
    questDone: [0, 4],
    tip: [0, 1],
    jackpot: [1, 0],
    trainerBeaten: [1, 0],
    gangArrestHelped: [0, 3],
  } as Record<string, [number, number]>,
} as const;

export type RepEvent = keyof typeof REP.events;

export function clampCivic(v: number): number {
  return Math.max(REP.civicMin, Math.min(REP.civicMax, Math.round(v)));
}

export interface CivicTier {
  name: string;
  /** Price multiplier at ordinary shops (clinics, delis, the diner). */
  prices: number;
  /** Multiplier on the heat a civilian-witnessed crime adds (witnesses reporting you). */
  witness: number;
  /** How people greet you: a word for speech and bubbles. */
  mood: 'beloved' | 'liked' | 'neutral' | 'wary' | 'feared';
}

export function civicTier(civic: number): CivicTier {
  if (civic >= 60) return { name: 'Local Hero', prices: 0.85, witness: 0.5, mood: 'beloved' };
  if (civic >= 25) return { name: 'Good Neighbour', prices: 0.92, witness: 0.75, mood: 'liked' };
  if (civic > -25) return { name: 'Nobody Special', prices: 1, witness: 1, mood: 'neutral' };
  if (civic > -60) return { name: 'Trouble', prices: 1.1, witness: 1.25, mood: 'wary' };
  return { name: 'Public Enemy', prices: 1.25, witness: 1.5, mood: 'feared' };
}

export interface StreetTier {
  name: string;
  /** Black-market price multiplier. */
  market: number;
  /** Gangs on the street pick fights with you only below this standing (see gangHostile). */
  respected: boolean;
}

export function streetTier(cred: number): StreetTier {
  if (cred >= 150) return { name: 'Legend', market: 0.8, respected: true };
  if (cred >= 60) return { name: 'Known', market: 0.9, respected: true };
  if (cred >= 20) return { name: 'Up and Coming', market: 1, respected: false };
  return { name: 'Nobody', market: 1, respected: false };
}

/** Applies an event to both standings; returns the new values. */
export function applyRep(street: number, civic: number, ev: RepEvent, times = 1): { street: number; civic: number } {
  const [s, c] = REP.events[ev] ?? [0, 0];
  return { street: Math.max(0, street + s * times), civic: clampCivic(civic + c * times) };
}

/** One line for the HUD and the pause screen. */
export function repLine(street: number, civic: number): string {
  return `Street Cred ${street} (${streetTier(street).name}) · Civic ${civic > 0 ? '+' : ''}${civic} (${civicTier(civic).name})`;
}
