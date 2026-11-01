/**
 * Line icons for the touch controls (24 x 24, drawn with `currentColor`), so the on-screen buttons
 * show what they do instead of a word. `iconFor` picks one for a context prompt ("Get in the
 * Sedan" is a car door, "Talk" a speech bubble, "Climb out" a ladder...).
 */

const P = (d: string): string => `<path d="${d}"/>`;

export const ICONS = {
  jump: P('M12 20V5') + P('M6 11l6-6 6 6') + P('M5 21h14'),
  roll: P('M20 12a8 8 0 1 1-3-6.2') + P('M20 3v5h-5'),
  fist: P('M7 11V7a2 2 0 0 1 4 0v3') + P('M11 9V6a2 2 0 0 1 4 0v4') + P('M15 9a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a2 2 0 0 1 4 0'),
  fire: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/>' + P('M12 2v4M12 18v4M2 12h4M18 12h4'),
  aim: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>' + P('M12 3v3M12 18v3M3 12h3M18 12h3'),
  reload: P('M4 12a8 8 0 0 1 14-5.3L20 9') + P('M20 4v5h-5') + P('M20 12a8 8 0 0 1-14 5.3L4 15') + P('M4 20v-5h5'),
  nos: P('M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-7z'),
  handbrake: '<circle cx="12" cy="12" r="9"/>' + P('M10 17V7h3a3 3 0 0 1 0 6h-3'),
  pause: P('M9 5v14M15 5v14'),
  door: P('M6 21V4h10v17') + P('M3 21h18') + '<circle cx="13" cy="12.5" r="1"/>',
  enter: P('M14 4h5v16h-5') + P('M3 12h11') + P('M10 8l4 4-4 4'),
  exit: P('M10 4H5v16h5') + P('M10 12h11') + P('M17 8l4 4-4 4'),
  talk: P('M4 5h16v11H9l-5 4z') + P('M8 9h8M8 12h5'),
  battle: P('M4 4l9 9M4 4v4M4 4h4') + P('M20 4l-9 9M20 4v4M20 4h-4') + P('M7 17l-3 3M17 17l3 3M9 15l-3-3M15 15l3-3'),
  capture: '<circle cx="12" cy="12" r="9"/>' + P('M3 12h6M15 12h6') + '<circle cx="12" cy="12" r="3"/>',
  team: '<circle cx="9" cy="8" r="3"/>' + P('M3 20a6 6 0 0 1 12 0') + '<circle cx="17" cy="9" r="2.5"/>' + P('M15 14a5 5 0 0 1 6 5'),
  paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/>' + P('M8 18c0-3 2-6 4-6s4 3 4 6c0 2-2 2-4 1-2 1-4 1-4-1z'),
  map: P('M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z') + P('M9 4v14M15 6v14'),
  horn: P('M3 10v4h4l6 4V6L7 10z') + P('M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12'),
  camera: P('M4 8h4l2-3h4l2 3h4v11H4z') + '<circle cx="12" cy="13" r="3.5"/>',
  flag: P('M5 21V4') + P('M5 4h12l-3 4 3 4H5'),
  flip: P('M4 14a8 8 0 0 0 15 2') + P('M20 10A8 8 0 0 0 5 8') + P('M5 3v5h5M19 21v-5h-5'),
  swap: P('M4 8h14l-4-4M20 16H6l4 4'),
  flee: '<circle cx="14" cy="4.5" r="2"/>' + P('M7 21l3-6 3 2v4M13 17l-2-6 4-3 2 3h3M11 11l-4 1-2 3'),
  cuff: '<circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/>' + P('M9 9a3 3 0 0 1 6 0M7 11V9M17 11V9'),
  keys: '<rect x="3" y="6" width="18" height="12" rx="2"/>' + P('M7 10h2M11 10h2M15 10h2M8 14h8'),
  hand: P('M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5a1.5 1.5 0 0 1 3 0v8M8 13l-2-2a1.5 1.5 0 0 0-2 2l4 5a6 6 0 0 0 5 3 5 5 0 0 0 4-5v-3'),
  ladder: P('M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10'),
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>' + P('M6 9v6M18 9v6'),
  shop: P('M5 8h14l-1 13H6z') + P('M9 8a3 3 0 0 1 6 0'),
  heal: '<rect x="3" y="3" width="18" height="18" rx="4"/>' + P('M12 7v10M7 12h10'),
  car: P('M3 16v-4l2-5h14l2 5v4z') + P('M3 12h18') + '<circle cx="7" cy="16.5" r="2"/><circle cx="17" cy="16.5" r="2"/>',
  bed: P('M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3') + '<circle cx="7" cy="10.5" r="1.5"/>',
  down: P('M12 4v14M6 12l6 6 6-6') + P('M4 21h16'),
  swim: P('M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5') + '<circle cx="16" cy="7" r="2"/>' + P('M4 14l5-5 3 2 4-2'),
  mask: P('M3 8c3-2 15-2 18 0 0 6-3 10-6 10-1 0-2-2-3-2s-2 2-3 2c-3 0-6-4-6-10z') + P('M7 11h3M14 11h3'),
  star: P('M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'),
  box: P('M3 8l9-5 9 5v8l-9 5-9-5z') + P('M3 8l9 5 9-5M12 13v8'),
  wrench: P('M15 4a4 4 0 0 0-4 6l-7 7 3 3 7-7a4 4 0 0 0 6-4l-3 3-3-1-1-3z'),
  info: '<circle cx="12" cy="12" r="9"/>' + P('M12 11v6M12 7.5v.5'),
} as const;

export type IconName = keyof typeof ICONS;

/** An icon as inline SVG markup. */
export function icon(name: IconName): string {
  return `<svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

/** Picks the icon for a context prompt from what it says it does (and the key it would press). */
export function iconFor(label: string, code = ''): IconName {
  const l = label.toLowerCase();
  const rules: Array<[RegExp, IconName]> = [
    [/^battle|^fight|set .* on|duel|challenge/, 'battle'],
    [/throw|capture/, 'capture'],
    [/talk|ask|chat/, 'talk'],
    [/heal|clinic/, 'heal'],
    [/climb|ladder|roof/, 'ladder'],
    [/swim/, 'swim'],
    [/flip/, 'flip'],
    [/race/, 'flag'],
    [/get in|carjack|steal|drive/, 'car'],
    [/get out|leave|climb out|exit/, 'exit'],
    [/lower|go down|descend|sewer|manhole/, 'down'],
    [/go into|enter|go in|door|inside/, 'enter'],
    [/save|rest|sleep|safehouse/, 'bed'],
    [/buy|sell|shop|store|deli|motors|for sale|market/, 'shop'],
    [/vault|breach|loot|bag|heist|crack|smash/, 'mask'],
    [/tune|garage|repair|chop|upgrade/, 'wrench'],
    [/open|cache|stash|box|crate/, 'box'],
    [/pick|take|grab|collect|get back|impound/, 'hand'],
    [/\$|cash|pay|bet|casino/, 'cash'],
  ];
  for (const [re, name] of rules) if (re.test(l)) return name;
  if (code === 'KeyB') return 'battle';
  if (code === 'KeyC') return 'capture';
  if (code === 'Space') return 'jump';
  if (code === 'KeyF') return 'exit';
  if (code === 'KeyY') return 'flag';
  if (code === 'KeyR') return 'flip';
  return 'hand';
}
