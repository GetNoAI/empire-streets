/**
 * Player options (engine-free, unit-tested): look speed, inverted look, music and effects volume
 * and HUD size. Each is a short ladder of values cycled by a pause-menu button, saved in
 * localStorage (`es.opts`) outside the save game, so they stick across new games and imports.
 */

export interface Options {
  /** Mouse / stick look speed as a multiplier (1 = the default). */
  lookSpeed: number;
  /** Push forward to look down. */
  invertY: boolean;
  /** 0..1 */
  music: number;
  /** 0..1 */
  effects: number;
  /** HUD and menus scale (1 = the default). */
  hudSize: number;
  /** Your Streetmon, out walking with you, takes on wild ones nearby by itself. */
  petFights: boolean;
}

export const OPTION_LADDERS: { [K in keyof Options]: ReadonlyArray<Options[K]> } = {
  lookSpeed: [0.6, 0.8, 1, 1.3, 1.6, 2],
  invertY: [false, true],
  music: [1, 0.75, 0.5, 0.25, 0],
  effects: [1, 0.75, 0.5, 0.25, 0],
  hudSize: [1, 1.15, 1.3, 0.85],
  petFights: [true, false],
};

export const DEFAULT_OPTIONS: Options = { lookSpeed: 1, invertY: false, music: 1, effects: 1, hudSize: 1, petFights: true };

export const OPTIONS_KEY = 'es.opts';

/** The next value on an option's ladder (wrapping; `dir` -1 for the one before), from wherever the current one is. */
export function cycleOption<K extends keyof Options>(opts: Options, key: K, dir = 1): Options {
  const ladder = OPTION_LADDERS[key] as ReadonlyArray<Options[K]>;
  const cur = opts[key];
  // Nearest rung (a value edited by hand or from an older build snaps to the ladder).
  let i = 0;
  if (typeof cur === 'number') {
    let best = Infinity;
    ladder.forEach((v, j) => {
      const d = Math.abs((v as number) - cur);
      if (d < best) {
        best = d;
        i = j;
      }
    });
  } else i = Math.max(0, ladder.indexOf(cur));
  const n = ladder.length;
  return { ...opts, [key]: ladder[(((i + (dir < 0 ? -1 : 1)) % n) + n) % n] };
}

/** The pause-menu label for an option. */
export function optionLabel<K extends keyof Options>(opts: Options, key: K): string {
  const v = opts[key];
  switch (key) {
    case 'lookSpeed':
      return `Look speed: ${Math.round((v as number) * 100)}%`;
    case 'invertY':
      return `Invert look: ${v ? 'on' : 'off'}`;
    case 'music':
      return `Music: ${v === 0 ? 'off' : `${Math.round((v as number) * 100)}%`}`;
    case 'effects':
      return `Effects: ${v === 0 ? 'off' : `${Math.round((v as number) * 100)}%`}`;
    case 'hudSize':
      return `HUD size: ${Math.round((v as number) * 100)}%`;
    case 'petFights':
      return `Streetmon fights on its own: ${v ? 'on' : 'off'}`;
  }
  return '';
}

/** Parses a saved options blob, keeping the defaults for anything missing or malformed. */
export function parseOptions(raw: string | null | undefined): Options {
  const out: Options = { ...DEFAULT_OPTIONS };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof Options, unknown>>;
    if (typeof o.lookSpeed === 'number' && o.lookSpeed >= 0.2 && o.lookSpeed <= 4) out.lookSpeed = o.lookSpeed;
    if (typeof o.invertY === 'boolean') out.invertY = o.invertY;
    if (typeof o.music === 'number' && o.music >= 0 && o.music <= 1) out.music = o.music;
    if (typeof o.effects === 'number' && o.effects >= 0 && o.effects <= 1) out.effects = o.effects;
    if (typeof o.hudSize === 'number' && o.hudSize >= 0.5 && o.hudSize <= 2) out.hudSize = o.hudSize;
    if (typeof o.petFights === 'boolean') out.petFights = o.petFights;
  } catch {
    // A bad blob: the defaults.
  }
  return out;
}

export function loadOptions(storage: { getItem(k: string): string | null } | null = typeof localStorage === 'undefined' ? null : localStorage): Options {
  try {
    return parseOptions(storage?.getItem(OPTIONS_KEY));
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(opts: Options, storage: { setItem(k: string, v: string): void } | null = typeof localStorage === 'undefined' ? null : localStorage): void {
  try {
    storage?.setItem(OPTIONS_KEY, JSON.stringify(opts));
  } catch {
    // Private mode, full storage: the option still applies for this session.
  }
}
