import type { TimeOfDay } from '../creatures/Data';

/**
 * Game clock and day/night lighting curve (engine-free, unit-tested).
 * One in-game hour passes per real minute by default, so a full day takes 24 minutes.
 */

export const DAY = {
  /** In-game hours per real second. */
  hoursPerSecond: 1 / 60,
  startHour: 16.5,
  /** Phase boundaries (hours). Dawn counts as dusk. */
  dawnStart: 5,
  dayStart: 7,
  duskStart: 17.5,
  nightStart: 20.5,
};

export function phaseAt(hour: number): TimeOfDay {
  const h = ((hour % 24) + 24) % 24;
  if (h >= DAY.dayStart && h < DAY.duskStart) return 'day';
  if ((h >= DAY.duskStart && h < DAY.nightStart) || (h >= DAY.dawnStart && h < DAY.dayStart)) return 'dusk';
  return 'night';
}

export function clockText(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Sun elevation in degrees: peaks at 13:00, sets around 19:00, below the horizon at night. */
export function sunElevationDeg(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return 62 * Math.sin((Math.PI * (h - 6.6)) / 12.8);
}

/** Sun azimuth in degrees (three.js spherical theta): rises in the east, sets in the west. */
export function sunAzimuthDeg(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return 110 + (h - 6) * 16;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Lighting {
  /** 0 = full night, 1 = full day. */
  daylight: number;
  /** 0..1 how golden the light is (low sun). */
  golden: number;
  sunIntensity: number;
  hemiIntensity: number;
  envIntensity: number;
  lampIntensity: number;
  exposure: number;
}

export function lightingAt(hour: number): Lighting {
  const el = sunElevationDeg(hour);
  const daylight = smooth(-8, 12, el);
  const golden = daylight > 0 ? 1 - smooth(8, 30, el) : 0;
  const lerp = (a: number, b: number): number => a + (b - a) * daylight;
  return {
    daylight,
    golden,
    sunIntensity: lerp(0.45, 3.2),
    hemiIntensity: lerp(0.32, 0.9),
    envIntensity: lerp(0.1, 0.55),
    lampIntensity: lerp(2.6, 0.4),
    exposure: lerp(1.25, 0.9),
  };
}
