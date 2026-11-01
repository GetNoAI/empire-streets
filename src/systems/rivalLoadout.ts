import { abilityTuning, computeStats, modFor, type SlotName, type StreetmonInfo, type TuningConfig, type VehicleStats } from './vehicleTuning.js';
import type { UpgradeLevels } from '../vehicles/Performance';

/**
 * Rival racers' Streetmon (engine-free, unit-tested). Racers in a street race ride with Streetmon
 * slotted in their cars, under the same Chop Shop rules as yours (the slot decides which types fit
 * and which ability they bring), and an ability "brain" decides when to use them.
 *
 * All of it scales with the race's difficulty tier (the higher of the track's league division and
 * yours, 1 Rookie .. 5 Apex):
 *  - how many racers are armed, how many slots each fills, and how strong their Streetmon are;
 *  - which abilities appear (Rookies only get the smokescreen, the backfire and the radar; the
 *    bass horn joins in the Street division, spike strips from Pro);
 *  - how much of the stat boost from their slots they get;
 *  - how quickly they react, how often they take an opening, and how long their cooldowns are.
 */

export interface RivalTier {
  tier: number;
  name: string;
  /** Share of the racers with Streetmon aboard. */
  armedShare: number;
  /** Slots filled per armed racer [min, max]. */
  slots: [number, number];
  level: [number, number];
  /** Prefer evolved Streetmon (stage) at this tier. */
  stage: number;
  abilities: readonly string[];
  /** Fraction of the slot's stat changes they get (1 = the full Chop Shop effect, like yours). */
  statShare: number;
  cooldownMult: number;
  /** Seconds an opening must last before they act on it. */
  reaction: number;
  /** Chance they take an opening when it comes (else they wait a moment and look again). */
  eagerness: number;
}

export const RIVAL_TIERS: readonly RivalTier[] = [
  { tier: 1, name: 'Rookie', armedShare: 0.34, slots: [1, 1], level: [6, 12], stage: 1, abilities: ['nitrousSmokescreen', 'exhaustBackfire', 'earlyWarningRadar'], statShare: 0.4, cooldownMult: 1.6, reaction: 1.4, eagerness: 0.45 },
  { tier: 2, name: 'Street', armedShare: 0.67, slots: [1, 1], level: [12, 22], stage: 1, abilities: ['nitrousSmokescreen', 'exhaustBackfire', 'earlyWarningRadar', 'sonicBassHorn'], statShare: 0.6, cooldownMult: 1.35, reaction: 1, eagerness: 0.6 },
  { tier: 3, name: 'Pro', armedShare: 1, slots: [1, 2], level: [22, 34], stage: 2, abilities: ['nitrousSmokescreen', 'exhaustBackfire', 'earlyWarningRadar', 'sonicBassHorn', 'spikeStripDispenser'], statShare: 0.8, cooldownMult: 1.15, reaction: 0.7, eagerness: 0.75 },
  { tier: 4, name: 'Elite', armedShare: 1, slots: [2, 2], level: [34, 46], stage: 2, abilities: ['nitrousSmokescreen', 'exhaustBackfire', 'earlyWarningRadar', 'sonicBassHorn', 'spikeStripDispenser'], statShare: 0.9, cooldownMult: 1, reaction: 0.45, eagerness: 0.9 },
  { tier: 5, name: 'Apex', armedShare: 1, slots: [2, 3], level: [46, 60], stage: 3, abilities: ['nitrousSmokescreen', 'exhaustBackfire', 'earlyWarningRadar', 'sonicBassHorn', 'spikeStripDispenser'], statShare: 1, cooldownMult: 0.85, reaction: 0.25, eagerness: 1 },
];

export function tierInfo(tier: number): RivalTier {
  return RIVAL_TIERS[Math.max(1, Math.min(5, Math.round(tier))) - 1];
}

/** A race's tier: the higher of the track's league division and yours (1..5). */
export function raceTier(trackRank: number | null | undefined, playerRank: number | null | undefined): number {
  return Math.max(1, Math.min(5, Math.max(trackRank ?? 1, playerRank ?? 1)));
}

export interface RivalSpecies {
  id: string;
  name?: string;
  types: readonly string[];
  stage: number;
  legendary?: boolean;
}

export interface RivalSlot {
  slot: SlotName;
  speciesId: string;
  name: string;
  level: number;
  info: StreetmonInfo;
  /** The ability it brings (null: none), its cooldown (after the tier's multiplier) and power. */
  ability: string | null;
  cooldown: number;
  power: number;
}

export interface RivalLoadout {
  driver: string;
  tier: number;
  slots: RivalSlot[];
  /** Stat multipliers for the car (already scaled by the tier's statShare). */
  multipliers: Partial<Record<keyof VehicleStats, number>>;
}

export interface RivalDriver {
  name: string;
  /** Types this racer likes to run (races.json `streetmon`). */
  streetmon?: readonly string[];
}

const SLOTS: readonly SlotName[] = ['engineBay', 'trunk', 'roofRack'];

/**
 * Loadouts for a race's NPC drivers. `statsOf` gives a species' stats at a level. Deterministic
 * for a given `rng`.
 */
export function rivalLoadouts(
  drivers: readonly RivalDriver[],
  tier: number,
  o: { config: TuningConfig; species: readonly RivalSpecies[]; statsOf: (speciesId: string, level: number) => StreetmonInfo['stats']; rng: () => number },
): RivalLoadout[] {
  const T = tierInfo(tier);
  const rng = o.rng;
  const pool = o.species.filter((s) => !s.legendary);
  const armed = Math.round(drivers.length * T.armedShare);
  // Which drivers are armed: a random subset of the right size.
  const order = drivers.map((_, i) => i).sort(() => rng() - 0.5);
  const armedSet = new Set(order.slice(0, armed));
  return drivers.map((d, di) => {
    const out: RivalLoadout = { driver: d.name, tier: T.tier, slots: [], multipliers: {} };
    if (!armedSet.has(di)) return out;
    const want = T.slots[0] + Math.floor(rng() * (T.slots[1] - T.slots[0] + 1));
    const slots = [...SLOTS].sort(() => rng() - 0.5);
    for (const slot of slots) {
      if (out.slots.length >= want) break;
      const level = T.level[0] + Math.floor(rng() * (T.level[1] - T.level[0] + 1));
      // Everything that fits this slot with an ability this tier allows.
      const fits = pool
        .map((sp) => {
          const info: StreetmonInfo = { id: `rival-${di}-${slot}`, speciesId: sp.id, name: sp.name, types: [...sp.types], level, stats: o.statsOf(sp.id, level) };
          const m = modFor(o.config, slot, info);
          return m ? { sp, info, ability: m.mod.ability ?? null } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x && (!x.ability || T.abilities.includes(x.ability)));
      if (!fits.length) continue;
      // Favour the driver's types and the tier's stage.
      const fav = new Set(d.streetmon ?? []);
      const score = (x: (typeof fits)[number]): number => (x.sp.types.some((t) => fav.has(t)) ? 3 : 0) + (x.sp.stage === T.stage ? 2 : x.sp.stage < T.stage ? 1 : 0) + rng() * 1.5;
      fits.sort((a, b) => score(b) - score(a));
      const pick = fits[0];
      const ab = pick.ability ? o.config.abilities[pick.ability] : null;
      const tune = ab ? abilityTuning(o.config, ab, pick.info) : { cooldown: 0, power: 1 };
      out.slots.push({ slot, speciesId: pick.sp.id, name: pick.sp.name ?? pick.sp.id, level, info: pick.info, ability: pick.ability, cooldown: tune.cooldown * T.cooldownMult, power: tune.power });
    }
    if (out.slots.length) {
      const base: VehicleStats = { topSpeed: 1, acceleration: 1, durability: 1, mass: 1, grip: 1, steering: 1, radarRange: 0 };
      const st = computeStats(o.config, base, Object.fromEntries(out.slots.map((s) => [s.slot, s.info])));
      for (const k of ['topSpeed', 'acceleration', 'grip', 'steering', 'durability', 'mass'] as const) out.multipliers[k] = 1 + (st.multipliers[k] - 1) * T.statShare;
    }
    return out;
  });
}

/** What a rival sees of the race around it, each frame. */
export interface RivalView {
  /** Its speed (m/s). */
  speed: number;
  /** Distance to you (m), whether you're behind it (in its rear half), and how far off its line. */
  playerDist: number;
  playerBehind: boolean;
  playerLateral: number;
  /** The road ahead is straight for a good way. */
  straight: boolean;
}

/**
 * When a rival uses its abilities: an opening has to last `reaction` seconds, then it takes it
 * with probability `eagerness` (or looks again in a couple of seconds). Openings:
 *  - Nitrous Smokescreen: you're close behind (smoke in your face), or it's chasing you on a
 *    straight (the speed boost);
 *  - Exhaust Backfire: you're alongside or bumping it;
 *  - Sonic Bass Horn: you're within the horn's reach;
 *  - Spike Strips: you're behind it, in line, not too close and not too far;
 *  - the radar is passive.
 */
export class RivalBrain {
  private readonly cd = new Map<SlotName, number>();
  private readonly seen = new Map<SlotName, number>();
  private readonly snooze = new Map<SlotName, number>();

  constructor(
    readonly loadout: RivalLoadout,
    private readonly rng: () => number,
  ) {
    // Nobody fires the moment the lights go green.
    for (const s of loadout.slots) this.cd.set(s.slot, 3 + rng() * 4);
  }

  /** The slots to fire this frame. */
  update(dt: number, v: RivalView): RivalSlot[] {
    const T = tierInfo(this.loadout.tier);
    const out: RivalSlot[] = [];
    for (const s of this.loadout.slots) {
      if (!s.ability || s.ability === 'earlyWarningRadar') continue;
      const cd = (this.cd.get(s.slot) ?? 0) - dt;
      this.cd.set(s.slot, cd);
      const sn = (this.snooze.get(s.slot) ?? 0) - dt;
      this.snooze.set(s.slot, sn);
      if (cd > 0 || sn > 0) continue;
      if (!opening(s.ability, v)) {
        this.seen.set(s.slot, 0);
        continue;
      }
      const t = (this.seen.get(s.slot) ?? 0) + dt;
      this.seen.set(s.slot, t);
      if (t < T.reaction) continue;
      this.seen.set(s.slot, 0);
      if (this.rng() > T.eagerness) {
        this.snooze.set(s.slot, 2);
        continue;
      }
      this.cd.set(s.slot, s.cooldown);
      out.push(s);
    }
    return out;
  }

  /** Seconds until a slot is ready (for tests and the HUD). */
  cooldownLeft(slot: SlotName): number {
    return Math.max(0, this.cd.get(slot) ?? 0);
  }
}

export function opening(ability: string, v: RivalView): boolean {
  switch (ability) {
    case 'nitrousSmokescreen':
      return v.speed > 8 && ((v.playerBehind && v.playerDist > 5 && v.playerDist < 40) || (!v.playerBehind && v.playerDist < 70 && v.straight));
    case 'exhaustBackfire':
      return v.speed > 4 && v.playerDist < 6.5;
    case 'sonicBassHorn':
      return v.playerDist < 9;
    case 'spikeStripDispenser':
      return v.speed > 10 && v.playerBehind && v.playerDist > 10 && v.playerDist < 50 && Math.abs(v.playerLateral) < 4;
    default:
      return false;
  }
}

/**
 * The bolt-on parts a rival's car gets at a tier (Performance.ts upgrades): rookies run stock,
 * apex racers close to maxed. Random within the tier's range so a grid isn't identical.
 */
export function rivalUpgrades(tier: number, rng: () => number): UpgradeLevels {
  const T = Math.max(1, Math.min(5, Math.round(tier)));
  const lo = [0, 0, 0, 1, 2, 2][T];
  const hi = [0, 0, 1, 2, 3, 3][T];
  const pick = (): number => lo + Math.floor(rng() * (hi - lo + 1));
  return { engine: pick(), tyres: pick(), brakes: pick(), suspension: pick(), nitrous: T >= 3 ? pick() : 0, weight: pick(), armor: 0 };
}
