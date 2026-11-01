import type { NpcSpec } from './Quests';
import type { District } from '../creatures/Data';

/**
 * The people who drift through the sewers besides the Under-Station community (npcs.json): a few
 * in every tunnel system on every level, each with a name, a look and something to say about
 * where they are. Deterministic from the key, so the same tunnel always has the same people.
 */

const FIRST = ['Lenny', 'Marta', 'Bones', 'Jojo', 'Rita', 'Silas', 'Duchess', 'Tank', 'Wren', 'Moss', 'Ike', 'Cora', 'Flick', 'Nell', 'Grub', 'Vic'];
const TOPS = ['#4a5340', '#5b3b2e', '#2f3d4f', '#6b5b3a', '#3e2f4a', '#46504f', '#704030', '#3a4a3a'];
const LEGS = ['#2a2620', '#34302a', '#22252b', '#3b3226'];
const HAIR = ['#1b1410', '#3a2618', '#7a7a7a', '#5e3b22', '#a77b48'];

const LINES: Record<number, string[]> = {
  1: [
    "Keep to the walkways. The channels'll carry you off if you slip.",
    'Steam grates blow every few seconds. Wait for the gap, then go.',
    "Folks at the hub trade supplies. Tell 'em I sent you. They won't care, but tell 'em.",
    "Lockboxes turn up in the dead ends. Somebody's always stashing something down here.",
    'Cops never come down. That cuts both ways.',
  ],
  2: [
    "Second level's older brick. Older things living in it too.",
    'I heard there are guns in the vault boxes deeper down. Never been brave enough to look.',
    "Your light's the only light past here. Keep it pointed where you're going.",
    "Shafts go down, ladders come up. Don't lose track of which is which.",
  ],
  3: [
    "You shouldn't be this deep. Everything down here wants a piece of you.",
    "The Drainlings don't let go once they've got your scent. Keep moving.",
    "There's a door with a crown on it somewhere on this level. Don't knock.",
    "The vault boxes down here are sealed for a reason. Worth it, though.",
  ],
};

/** A sewer drifter: `key` picks them (the same key, the same person). */
export function sewerDweller(key: string, district: District, level: number): NpcSpec {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pick = <T>(a: readonly T[], salt: number): T => a[(((h >>> salt) ^ Math.imul(h, salt + 1)) >>> 0) % a.length];
  const lines = LINES[Math.max(1, Math.min(3, level))];
  const build: 'm' | 'f' = h & 1 ? 'f' : 'm';
  return {
    id: `dweller-${key}`,
    name: pick(FIRST, 3),
    home: district,
    spot: 0,
    role: 'talk',
    look: { top: pick(TOPS, 5), legs: pick(LEGS, 7), hair: pick(HAIR, 9), build, hairStyle: build === 'f' ? 'long' : h & 2 ? 'short' : 'bald' },
    dialogue: {
      start: 'hi',
      nodes: {
        hi: { text: pick(lines, 11), choices: [['Anything else?', 'more'], ['Take care.', 'end']] },
        more: { text: pick(lines, 13), choices: [['Thanks.', 'end']] },
      },
    },
  } as NpcSpec;
}
