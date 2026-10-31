/**
 * Every Streetmon has its own cry, made up from what it is (engine-free, unit-tested; Audio.cry
 * plays it):
 *
 *  - size sets the pitch: a 0.4 m Gutterat squeaks, a 3.6 m Gridlock bellows;
 *  - its type sets the voice: Gun barks (square, sharp attack), Concrete grumbles (saw through a
 *    low filter, gravel noise), Grind chitters (fast vibrato), Smoke wheezes (breath noise), Bass
 *    throbs (sine with a wobble and a sub), Wire buzzes (FM), Sludge gurgles (wobbling pitch,
 *    wet noise);
 *  - its id seeds the rest, so no two are alike: how many syllables, the pitch contour of each
 *    (rising, falling, a chirp, a yelp), lengths, vibrato, formant, detune;
 *  - evolutions keep their family's voice (same line seed) but deeper and longer; legendaries add
 *    a sub layer and an echo.
 */

export type CryWave = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface CrySyllable {
  /** Start (s), length (s), and pitch at start / peak / end as multiples of the base pitch. */
  at: number;
  dur: number;
  p0: number;
  p1: number;
  p2: number;
  /** Peak loudness 0..1. */
  amp: number;
}

export interface CryParams {
  base: number;
  wave: CryWave;
  /** Second oscillator detune (cents) and mix. */
  detune: number;
  mix2: number;
  /** Vibrato rate (Hz) and depth (fraction of pitch). */
  vibRate: number;
  vibDepth: number;
  /** Frequency modulation (Wire): modulator ratio and index (0 = none). */
  fmRatio: number;
  fmIndex: number;
  /** Formant (band-pass) centre as a multiple of the base pitch, and its Q. */
  formant: number;
  q: number;
  /** Noise mixed in (0..1) and its filter centre (Hz). */
  noise: number;
  noiseFreq: number;
  /** A sub-octave sine (0..1), and an echo (feedback 0..1, delay s). */
  sub: number;
  echo: number;
  echoDelay: number;
  syllables: CrySyllable[];
  /** Total length (s). */
  length: number;
}

export interface CrySpecies {
  id: string;
  types: readonly string[];
  stage?: number;
  line?: string;
  legendary?: boolean;
  model: { height: number };
}

/** A small seeded random (mulberry32) from a string. */
export function seeded(s: string): () => number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VOICE: Record<string, Partial<CryParams> & { wave: CryWave }> = {
  gun: { wave: 'square', vibRate: 0, vibDepth: 0, noise: 0.15, noiseFreq: 2600, formant: 2.2, q: 2.5 },
  concrete: { wave: 'sawtooth', vibRate: 5, vibDepth: 0.02, noise: 0.35, noiseFreq: 420, formant: 1.6, q: 1.2 },
  grind: { wave: 'triangle', vibRate: 24, vibDepth: 0.09, noise: 0.08, noiseFreq: 3200, formant: 2.6, q: 3 },
  smoke: { wave: 'sine', vibRate: 3, vibDepth: 0.03, noise: 0.6, noiseFreq: 1500, formant: 2, q: 0.9 },
  bass: { wave: 'sine', vibRate: 7, vibDepth: 0.06, noise: 0.05, noiseFreq: 200, formant: 1.2, q: 1, sub: 0.6 },
  wire: { wave: 'square', vibRate: 11, vibDepth: 0.03, noise: 0.12, noiseFreq: 5200, formant: 3, q: 4, fmRatio: 2.01, fmIndex: 1.2 },
  sludge: { wave: 'sine', vibRate: 9, vibDepth: 0.12, noise: 0.4, noiseFreq: 650, formant: 1.4, q: 2.2 },
};

/** The cry for a species (pure, deterministic). */
export function cryParams(sp: CrySpecies): CryParams {
  const r = seeded(sp.id);
  // The family shares a seed for the shape of the cry; each species varies it.
  const fam = seeded(sp.line ?? sp.id);
  const t0 = sp.types[0] ?? 'concrete';
  const t1 = sp.types[1];
  const v = VOICE[t0] ?? VOICE['concrete'];
  const v2 = t1 ? VOICE[t1] : undefined;
  const h = Math.max(0.2, sp.model.height);
  const stage = sp.stage ?? 1;
  // Pitch from size: ~1150 Hz at 0.3 m down to ~130 Hz at 4 m.
  const base = Math.max(70, Math.min(1400, (520 / Math.pow(h, 0.85)) * (0.85 + r() * 0.3)));
  const n = 1 + Math.floor(fam() * 3) + (stage >= 3 ? 1 : 0);
  const sylLen = (0.12 + h * 0.06 + fam() * 0.12) * (1 + (stage - 1) * 0.15) * (sp.legendary ? 1.6 : 1);
  const shapes = [
    [1, 1.25, 0.95], // rise and fall
    [1.2, 1.05, 0.7], // falling
    [0.85, 1, 1.3], // rising (a question)
    [1, 1.6, 0.8], // yelp
    [1.3, 0.9, 1.1], // dip
  ];
  const syllables: CrySyllable[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const s = shapes[Math.floor(fam() * shapes.length)];
    const k = 1 + (r() - 0.5) * 0.2;
    const last = i === n - 1;
    const dur = sylLen * (last ? 1.4 : 0.8 + r() * 0.4);
    syllables.push({ at, dur, p0: s[0] * k, p1: s[1] * k, p2: s[2] * k * (last ? 0.92 : 1), amp: last ? 1 : 0.75 + r() * 0.2 });
    at += dur + 0.02 + r() * 0.06;
  }
  const length = at;
  const mixNum = (a: number | undefined, b: number | undefined, d: number): number => (a ?? d) * (b === undefined ? 1 : 0.6) + (b ?? 0) * 0.4;
  return {
    base,
    wave: v.wave,
    detune: 6 + r() * 18,
    mix2: 0.35 + r() * 0.3,
    vibRate: mixNum(v.vibRate, v2?.vibRate, 0) * (0.8 + r() * 0.4),
    vibDepth: mixNum(v.vibDepth, v2?.vibDepth, 0),
    fmRatio: v.fmRatio ?? v2?.fmRatio ?? 0,
    fmIndex: (v.fmIndex ?? 0) + (v2?.fmIndex ?? 0) * 0.6,
    formant: (v.formant ?? 2) * (0.85 + r() * 0.3),
    q: v.q ?? 1.5,
    noise: Math.min(0.8, mixNum(v.noise, v2?.noise, 0.1)),
    noiseFreq: v.noiseFreq ?? 1000,
    sub: Math.min(1, (v.sub ?? 0) + (v2?.sub ?? 0) * 0.5 + (h > 2 ? 0.3 : 0) + (sp.legendary ? 0.5 : 0)),
    echo: sp.legendary ? 0.45 : h > 1.6 ? 0.15 : 0,
    echoDelay: sp.legendary ? 0.21 : 0.12,
    syllables,
    length,
  };
}
