import type { TypeId } from '../creatures/Data';

/**
 * Weather (engine-free, unit-tested): clear skies, cloud, rain, thunderstorms, fog and the odd
 * snowfall, each lasting a few game hours and easing into the next. It isn't just a look: it
 * changes the living city.
 *
 *  - **Roads** get slick in rain and snow: less grip for every car (yours, traffic, the police).
 *  - **The police** see less far in rain, storms and fog: easier to lose a tail.
 *  - **People** thin out in bad weather (they head indoors) and say so in their chatter.
 *  - **Wild Streetmon** change: Sludge types come out in the rain, Wire types in storms, Smoke
 *    types in fog, Concrete and Grind types prefer it dry.
 *  - **The pond and the grass**: wind in the grass, rain on the water.
 */

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';

export interface WeatherParams {
  /** 0..1 each, blended between the current and the next weather. */
  cloud: number;
  rain: number;
  snow: number;
  fog: number;
  wind: number;
  /** Lightning flashes are possible (storms). */
  lightning: number;
  /** Roads wet (lags behind the rain: they dry slowly). */
  wet: number;
}

const BASE: Record<WeatherKind, Omit<WeatherParams, 'wet'>> = {
  clear: { cloud: 0.05, rain: 0, snow: 0, fog: 0, wind: 0.25, lightning: 0 },
  cloudy: { cloud: 0.6, rain: 0, snow: 0, fog: 0.1, wind: 0.45, lightning: 0 },
  rain: { cloud: 0.85, rain: 0.7, snow: 0, fog: 0.25, wind: 0.6, lightning: 0 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0.35, wind: 1, lightning: 1 },
  fog: { cloud: 0.5, rain: 0, snow: 0, fog: 1, wind: 0.1, lightning: 0 },
  snow: { cloud: 0.8, rain: 0, snow: 0.8, fog: 0.3, wind: 0.4, lightning: 0 },
};

/** What tends to follow what (weights). */
const NEXT: Record<WeatherKind, Partial<Record<WeatherKind, number>>> = {
  clear: { clear: 3, cloudy: 3, fog: 1 },
  cloudy: { clear: 2, cloudy: 1, rain: 3, fog: 1, snow: 0.4 },
  rain: { cloudy: 2, rain: 1, storm: 1.5, clear: 1 },
  storm: { rain: 3, cloudy: 1 },
  fog: { clear: 2, cloudy: 2 },
  snow: { cloudy: 2, clear: 1 },
};

export const WEATHER = {
  /** Each weather lasts this many game hours (a range). */
  hours: [2.5, 6] as [number, number],
  /** Blending into the next takes this many game hours. */
  blend: 0.75,
  /** Roads dry at this rate per game hour once the rain stops (and wet at 4x that). */
  dryPerHour: 0.5,
  names: { clear: 'Clear', cloudy: 'Overcast', rain: 'Rain', storm: 'Thunderstorm', fog: 'Fog', snow: 'Snow' } as Record<WeatherKind, string>,
};

export class Weather {
  kind: WeatherKind = 'clear';
  next: WeatherKind = 'clear';
  /** Game hours left before the change starts. */
  hoursLeft: number;
  /** 0..1 through the blend to `next`. */
  blend = 0;
  wet = 0;
  /** A lightning flash: 1 when it strikes, fading fast (for the sky and the thunder). */
  flash = 0;
  private flashCd = 0;

  constructor(private readonly rand: () => number = Math.random, start: WeatherKind = 'clear') {
    this.kind = start;
    this.next = start;
    this.hoursLeft = this.span();
  }

  private span(): number {
    return WEATHER.hours[0] + this.rand() * (WEATHER.hours[1] - WEATHER.hours[0]);
  }

  private pickNext(): WeatherKind {
    const opts = Object.entries(NEXT[this.kind]) as Array<[WeatherKind, number]>;
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let r = this.rand() * total;
    for (const [k, w] of opts) {
      r -= w;
      if (r < 0) return k;
    }
    return opts[0][0];
  }

  /** Advances by `hours` of game time (and `dt` real seconds for the lightning). Returns true when the weather turns. */
  update(hours: number, dt: number): boolean {
    let turned = false;
    if (this.blend > 0 || this.hoursLeft <= 0) {
      if (this.blend === 0) this.next = this.pickNext();
      this.blend = Math.min(1, this.blend + hours / WEATHER.blend);
      if (this.blend >= 1) {
        turned = this.kind !== this.next;
        this.kind = this.next;
        this.blend = 0;
        this.hoursLeft = this.span();
      }
    } else this.hoursLeft -= hours;
    const p = this.params();
    // Wet roads follow the rain (and snow melt), drying slowly.
    const target = Math.max(p.rain, p.snow * 0.6);
    this.wet += (target > this.wet ? Math.min(target - this.wet, hours * WEATHER.dryPerHour * 4) : -Math.min(this.wet - target, hours * WEATHER.dryPerHour));
    // Lightning.
    this.flash = Math.max(0, this.flash - dt * 4);
    this.flashCd -= dt;
    if (p.lightning > 0.5 && this.flashCd <= 0) {
      this.flashCd = 4 + this.rand() * 14;
      this.flash = 1;
    }
    return turned;
  }

  /** Force a weather (debug, or a scripted moment). */
  set(kind: WeatherKind): void {
    this.kind = kind;
    this.next = kind;
    this.blend = 0;
    this.hoursLeft = this.span();
    this.wet = Math.max(BASE[kind].rain, BASE[kind].snow * 0.6);
  }

  params(): WeatherParams {
    const a = BASE[this.kind];
    const b = BASE[this.next];
    const t = this.blend * this.blend * (3 - 2 * this.blend);
    const mix = (k: keyof typeof a): number => a[k] + (b[k] - a[k]) * t;
    return { cloud: mix('cloud'), rain: mix('rain'), snow: mix('snow'), fog: mix('fog'), wind: mix('wind'), lightning: mix('lightning'), wet: this.wet };
  }

  /** The weather people would say it is (the dominant one). */
  get label(): string {
    return WEATHER.names[this.blend > 0.5 ? this.next : this.kind];
  }

  get dominant(): WeatherKind {
    return this.blend > 0.5 ? this.next : this.kind;
  }

  serialize(): { kind: WeatherKind; hoursLeft: number; wet: number } {
    return { kind: this.kind, hoursLeft: this.hoursLeft, wet: this.wet };
  }

  load(o: unknown): void {
    const r = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
    const k = r['kind'];
    if (typeof k === 'string' && k in BASE) {
      this.kind = k as WeatherKind;
      this.next = this.kind;
      this.blend = 0;
    }
    if (typeof r['hoursLeft'] === 'number' && r['hoursLeft'] > 0 && r['hoursLeft'] < 24) this.hoursLeft = r['hoursLeft'];
    if (typeof r['wet'] === 'number') this.wet = Math.max(0, Math.min(1, r['wet']));
  }
}

/** What the weather does to the world (see the module comment). */
export interface WeatherEffects {
  /** Tyre grip multiplier for every car. */
  grip: number;
  /** Police (and gang) sight range multiplier. */
  vision: number;
  /** Share of the usual crowd out on the street. */
  crowd: number;
  /** Spawn weight multiplier per Streetmon type. */
  types: Partial<Record<TypeId, number>>;
}

export function weatherEffects(p: WeatherParams): WeatherEffects {
  return {
    grip: 1 - p.wet * 0.22 - p.snow * 0.18,
    vision: Math.max(0.45, 1 - p.fog * 0.45 - p.rain * 0.2),
    crowd: Math.max(0.35, 1 - p.rain * 0.45 - p.snow * 0.3 - (p.lightning > 0.5 ? 0.15 : 0)),
    types: {
      sludge: 1 + p.rain * 1.5,
      wire: 1 + p.lightning * 2 + p.rain * 0.3,
      smoke: 1 + p.fog * 1.5 - p.rain * 0.4,
      concrete: 1 - p.rain * 0.3,
      grind: 1 - p.rain * 0.3 + p.snow * 0.3,
      bass: 1 - p.fog * 0.2,
    },
  };
}
