/**
 * The Gutter Kings (engine-free, unit-tested): a real gang, armed and hostile, with Streetmon of
 * their own. The rules here, the bodies and the hideout in src/systems/GangWorld.ts.
 *
 *  - Their **turf** on the street: crews of three or four on a few corners in Downtown and Uptown,
 *    in red. They only show up once the story brings them in (or once you're strong enough that
 *    the city takes notice), never in your first hours: an early-game player doesn't stumble into
 *    an armed gang.
 *  - Their **hideout**: under the deepest drains of Downtown, behind a steel door with a red crown
 *    sprayed on it. It takes the courier's key.
 *  - **Fights** are both at once: the closest member sets his Streetmon on yours (a real-time
 *    battle) while the rest shoot from cover; you can fight their Streetmon, shoot back, or both.
 *  - On the street the **police** come for them: a squad arrives after a fight starts, trades fire
 *    with them and cuffs whoever goes down. Shooting at the police yourself is still a crime.
 *  - The **quest line**, "Kings of the Gutter", from Detective Alvarez: a tip, breaking up a corner,
 *    running down the courier, getting into the hideout, and the King himself.
 */

export const GANG = {
  name: 'Gutter Kings',
  /** Their colours (a red hoodie, black jeans) so you can tell them from a passer-by. */
  top: '#a3121f',
  legs: '#141416',
  /** Your best Streetmon's level before the story (and the gangs) come to you. */
  unlockLevel: 14,
  /** After the King falls, leftover crews still turn up, for players at least this strong. */
  remnantLevel: 22,
  /** Members notice you this close (m), or when you fire nearby / hurt one. */
  noticeRange: 15,
  /** They try to keep this far from you while shooting. */
  fightRange: [6, 13] as [number, number],
  /** Seconds between shots per member (a range), and damage per hit. */
  shotEvery: [1.4, 2.6] as [number, number],
  damage: 5,
  /** Melee members (bats) hit this hard, this close. */
  melee: { damage: 13, reach: 1.6, every: 1.1 },
  health: 100,
  /** Police on the street: they show up this long after a gang fight starts (s). */
  policeAfter: 9,
  policeSquad: 3,
  copDamage: 22,
  /** Street Cred at which gangs on the street leave you alone (unless you start it). */
  respectCred: 60,
} as const;

export type GangStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const QUEST = {
  id: 'kings-of-the-gutter',
  name: 'Kings of the Gutter',
  giver: 'Detective Alvarez',
  steps: [
    '',
    'Meet Detective Alvarez outside the Midtown precinct.',
    'Break up the Gutter Kings corner in Downtown (beat 4 of them).',
    'Run down the Gutter Kings courier and take his key.',
    'Find the crowned door in the deepest drains under Downtown and get into the hideout.',
    'Take down King Rook in his hideout.',
    'Done: the Gutter Kings are broken.',
  ],
  rewards: { cash: 6000, weapon: 'smg', items: [['rabbitFoot', 1], ['medkit', 3]] as Array<[string, number]> },
} as const;

/** Story state, saved. */
export interface GangState {
  stage: GangStage;
  /** Members beaten for the corner step. */
  cornerBeaten: number;
  hasKey: boolean;
  bossBeaten: boolean;
  /** Total members taken down (for the stats). */
  beaten: number;
  /** Hideout lockers opened. */
  lockers: string[];
}

export function newGangState(): GangState {
  return { stage: 0, cornerBeaten: 0, hasKey: false, bossBeaten: false, beaten: 0, lockers: [] };
}

export function parseGangState(raw: unknown): GangState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  return {
    stage: n(o['stage'], 0, 0, 6) as GangStage,
    cornerBeaten: n(o['cornerBeaten'], 0, 0, 99),
    hasKey: o['hasKey'] === true,
    bossBeaten: o['bossBeaten'] === true,
    beaten: n(o['beaten'], 0, 0, 1e6),
    lockers: Array.isArray(o['lockers']) ? (o['lockers'] as unknown[]).filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,30}$/.test(x)).slice(0, 50) : [],
  };
}

/** The story reaches you: Alvarez calls once your best Streetmon is strong enough. */
export function questUnlocked(bestLevel: number): boolean {
  return bestLevel >= GANG.unlockLevel;
}

/** Are there crews on the street right now? (Only while the story has them out, or leftovers later.) */
export function streetCrewsActive(s: GangState, bestLevel: number): boolean {
  if (s.stage >= 2 && s.stage <= 5) return true;
  return s.stage === 6 && bestLevel >= GANG.remnantLevel;
}

/** Do street crews start on you? Not if your Street Cred has earned their respect (unless you started it). */
export function hostileOnSight(s: GangState, streetCred: number, provoked: boolean): boolean {
  if (provoked) return true;
  if (s.stage >= 2 && s.stage <= 5) return true;
  return streetCred < GANG.respectCred;
}

/** Advances the story for an event; returns the new stage and what to tell the player (or ''). */
export function gangEvent(s: GangState, ev: 'metAlvarez' | 'memberBeaten' | 'courierBeaten' | 'enteredHideout' | 'bossBeaten', where: 'street' | 'hideout' = 'street'): string {
  switch (ev) {
    case 'metAlvarez':
      if (s.stage === 1) {
        s.stage = 2;
        return 'New job: break up the Gutter Kings corner in Downtown.';
      }
      return '';
    case 'memberBeaten':
      s.beaten++;
      if (s.stage === 2 && where === 'street') {
        s.cornerBeaten++;
        if (s.cornerBeaten >= 4) {
          s.stage = 3;
          return 'The corner is broken. Word is a courier is running their takings: find him.';
        }
        return `Gutter Kings down: ${s.cornerBeaten}/4`;
      }
      return '';
    case 'courierBeaten':
      if (s.stage === 3) {
        s.stage = 4;
        s.hasKey = true;
        return "You take the courier's key: heavy, old, a crown stamped on it. The hideout is under Downtown, in the deepest drains.";
      }
      return '';
    case 'enteredHideout':
      if (s.stage === 4) {
        s.stage = 5;
        return 'You are in. King Rook is somewhere at the back.';
      }
      return '';
    case 'bossBeaten':
      s.bossBeaten = true;
      if (s.stage <= 5) {
        s.stage = 6;
        return 'King Rook is finished. The Gutter Kings are broken.';
      }
      return '';
  }
}

// ------------------------------------------------------------------ fighting

/** Chance a gang member's shot hits you at this distance (moving and driving make it harder). */
export function gangHitChance(dist: number, playerMoving: boolean, inCar: boolean): number {
  const base = dist < 4 ? 0.6 : dist < 9 ? 0.42 : dist < 16 ? 0.28 : dist < 26 ? 0.14 : 0.05;
  return base * (playerMoving ? 0.7 : 1) * (inCar ? 0.6 : 1);
}

/**
 * Where a member wants to stand in a firefight: on the line to you, inside the fight range, and a
 * little to one side (each member its own way) so they spread out instead of queueing.
 */
export function fightSpot(me: { x: number; z: number }, target: { x: number; z: number }, side: number, range: [number, number] = GANG.fightRange): { x: number; z: number } {
  const dx = me.x - target.x;
  const dz = me.z - target.z;
  const d = Math.hypot(dx, dz) || 1;
  const want = Math.max(range[0], Math.min(range[1], d));
  const ang = Math.atan2(dz, dx) + side * 0.35;
  return { x: target.x + Math.cos(ang) * want, z: target.z + Math.sin(ang) * want };
}

// ------------------------------------------------------------------ the crews and their Streetmon

/** Street Streetmon the gang keeps (tough and mean), and how strong, by how far the story is. */
export const ROSTER = ['gutterat', 'clogger', 'cinderblock', 'slugger', 'rebarb', 'subsonic', 'holster', 'drainling'] as const;

export function memberLevel(stage: number, bestLevel: number, i: number): number {
  const base = stage <= 2 ? 15 : stage === 3 ? 19 : stage <= 5 ? 26 : Math.max(22, bestLevel - 2);
  return base + (i % 3);
}

export const MEMBER_NAMES = ['Knuckles', 'Spider', 'Lil Dime', 'Boots', 'Rico', 'Shade', 'Tank', 'Mouse', 'Vinnie', 'Dutch', 'Smalls', 'Juno'];

/** King Rook's team: three, the last his favourite. */
export const BOSS = {
  name: 'King Rook',
  team: [
    ['clogger', 33],
    ['holster', 34],
    ['ratking', 37],
  ] as Array<[string, number]>,
  intro: '"You came all the way down here to die in my house? Fine. Rook\'s court is in session."',
  win: 'Rook spits blood. "...The crown was always rented anyway."',
  lose: '"Throw them in the channel. Let the rats have the rest."',
};

// ------------------------------------------------------------------ the hideout's layout

export interface HideoutLayout {
  /** Room size (x, z) and ceiling height. */
  w: number;
  d: number;
  h: number;
  /** Where you come in (by the door) and where the door is. */
  entry: { x: number; z: number };
  /** Cover: crates, barricades of pallets and sandbags, an old car. */
  cover: Array<{ kind: 'crate' | 'barricade' | 'car' | 'sandbags'; x: number; z: number; rot: number }>;
  guards: Array<{ x: number; z: number; weapon: 'pistol' | 'smg' | 'bat' }>;
  boss: { x: number; z: number };
  /** Lockers with loot (ids are stable for the save). */
  lockers: Array<{ id: string; x: number; z: number; loot: 'cash' | 'weapon' | 'items' }>;
  /** A throne of tyres and a crown painted behind it. */
  throne: { x: number; z: number };
}

/** The hideout, relative to its centre (deterministic: the same every game). */
export function hideoutLayout(): HideoutLayout {
  const w = 40;
  const d = 30;
  return {
    w,
    d,
    h: 6,
    entry: { x: 0, z: -d / 2 + 2 },
    cover: [
      { kind: 'barricade', x: -6, z: -8, rot: 0 },
      { kind: 'barricade', x: 6, z: -8, rot: 0 },
      { kind: 'crate', x: -12, z: -4, rot: 0.3 },
      { kind: 'crate', x: 12, z: -3, rot: -0.2 },
      { kind: 'sandbags', x: 0, z: -2, rot: 0 },
      { kind: 'car', x: -9, z: 4, rot: 0.6 },
      { kind: 'crate', x: 9, z: 5, rot: 0.1 },
      { kind: 'barricade', x: -3, z: 8, rot: 0 },
      { kind: 'barricade', x: 4, z: 8, rot: 0 },
      { kind: 'crate', x: 15, z: 10, rot: 0.4 },
      { kind: 'crate', x: -15, z: 10, rot: -0.3 },
    ],
    guards: [
      { x: -8, z: -5, weapon: 'pistol' },
      { x: 8, z: -5, weapon: 'smg' },
      { x: -2, z: 1, weapon: 'bat' },
      { x: -11, z: 7, weapon: 'pistol' },
      { x: 11, z: 8, weapon: 'pistol' },
      { x: 2, z: 11, weapon: 'smg' },
    ],
    boss: { x: 0, z: 12.5 },
    lockers: [
      { id: 'gk-locker-1', x: -18, z: -12, loot: 'cash' },
      { id: 'gk-locker-2', x: 18, z: -12, loot: 'items' },
      { id: 'gk-locker-3', x: -18, z: 13, loot: 'weapon' },
      { id: 'gk-locker-4', x: 18, z: 13, loot: 'cash' },
    ],
    throne: { x: 0, z: 13.8 },
  };
}

/** What a hideout locker holds. */
export function lockerLoot(kind: 'cash' | 'weapon' | 'items', i: number): { cash: number; weapon?: [string, number]; items: Array<[string, number]> } {
  if (kind === 'cash') return { cash: 1500 + i * 700, items: [] };
  if (kind === 'weapon') return { cash: 200, weapon: ['shotgun', 24], items: [] };
  return { cash: 300, items: [['medkit', 2], ['smellingSalts', 1], ['burner', 1]] };
}
