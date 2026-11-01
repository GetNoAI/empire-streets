/**
 * Which kind of device this is, and the settings that follow from it. A phone or tablet (touch
 * screen, coarse pointer, or `?touch=1` in the address) gets the on-screen controls and a lighter
 * graphics profile; the Android app (Capacitor / the WebView wrapper) is detected the same way.
 */

export interface Platform {
  touch: boolean;
  /** Running inside the Android app's WebView (see android/). */
  android: boolean;
  /** Pixel-ratio cap and the lowest the resolution scaler may go. */
  maxPixelRatio: number;
  minScale: number;
  /** Shadow map size to start on. */
  shadow: number;
  /** Selective bloom on glowing parts (costs a full-screen pass). */
  bloom: boolean;
  /** Draw distance for the world fog, metres. */
  farFog: number;
  /** How many wild Streetmon and parked cars to keep around, as a share of the desktop numbers. */
  crowd: number;
}

export function detectPlatform(ua = navigator.userAgent, params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)): Platform {
  const forced = params.get('touch');
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const touchPoints = (navigator.maxTouchPoints ?? 0) > 0;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const android = /Android/i.test(ua) && (/; wv\)/.test(ua) || /EmpireStreets/.test(ua));
  const touch = forced === '1' ? true : forced === '0' ? false : android || (touchPoints && (coarse || mobileUa));
  if (!touch) return { touch: false, android: false, maxPixelRatio: 2, minScale: 0.875, shadow: 2048, bloom: true, farFog: 2600, crowd: 1 };
  // Phones: fewer pixels, softer shadows, no bloom, a shorter horizon, a thinner crowd.
  const weak = (navigator.hardwareConcurrency ?? 4) <= 4 || ((navigator as { deviceMemory?: number }).deviceMemory ?? 4) <= 3;
  return { touch: true, android, maxPixelRatio: weak ? 1 : 1.25, minScale: 0.5, shadow: weak ? 512 : 1024, bloom: !weak, farFog: weak ? 900 : 1400, crowd: weak ? 0.5 : 0.7 };
}

export const platform: Platform = typeof navigator === 'undefined' || typeof document === 'undefined' ? { touch: false, android: false, maxPixelRatio: 2, minScale: 0.875, shadow: 2048, bloom: true, farFog: 2600, crowd: 1 } : detectPlatform();
