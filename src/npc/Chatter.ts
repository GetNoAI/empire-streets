/**
 * Ambient chatter (engine-free, unit-tested): the short lines people say to themselves and each
 * other as you pass, shown as speech bubbles over their heads (src/ui/Bubbles.ts) instead of a
 * dialogue box. What they say depends on who they are and what's going on: the weather, the time,
 * your reputation, a gang fight down the block, the casino floor.
 */

export interface ChatterContext {
  hour: number;
  weather: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';
  /** How people see you (Reputation.civicTier mood). */
  mood: 'beloved' | 'liked' | 'neutral' | 'wary' | 'feared';
  wanted: number;
  /** The district's name and character (Districts.ts). */
  district: string;
  /** A short line about the district, said by locals now and then. */
  districtLine?: string;
  /** The player is right next to them. */
  near: boolean;
  gangFight: boolean;
}

const pick = <T,>(a: readonly T[], seed: number): T => a[Math.abs(Math.floor(seed)) % a.length];

const STREET: readonly string[] = [
  'Has anyone seen my bus?',
  "I'm telling you, the Quackpacks in the pond bite.",
  'Rent went up again.',
  'Did you catch the league race last night?',
  "My cousin swears he saw a Ratking the size of a car.",
  'Coffee. I need coffee.',
  'They still haven\'t fixed that streetlight.',
  'Ugh, my phone\'s dead.',
  'Is it Tuesday? It feels like a Tuesday.',
  'Somebody parked in front of the hydrant again.',
  'Ten bucks says it\'s gonna be a Strapback.',
  'I heard the casino\'s Star machine paid out.',
];

const WEATHER: Record<ChatterContext['weather'], readonly string[]> = {
  clear: ['Beautiful day.', 'Finally, some sun.', 'Not a cloud in the sky.'],
  cloudy: ['Looks like rain later.', 'Grey again.'],
  rain: ['Of course I forgot my umbrella.', 'This rain, ugh!', 'Mind the puddles!', 'The Sludge types love this weather.'],
  storm: ['Get inside, it\'s nasty out!', 'Was that lightning?!', 'The subway\'s going to flood again.'],
  fog: ["Can't see my own hand.", 'Spooky out here.', 'Fog this thick, anything could be out there.'],
  snow: ['Snow! In this city!', 'Watch your step, it\'s slick.', 'My Streetmon hates the cold.'],
};

const MOOD: Record<ChatterContext['mood'], readonly string[]> = {
  beloved: ['Hey, it\'s you! Thanks for everything.', 'That\'s the one who took on the Gutter Kings!', 'Hi! Big fan!'],
  liked: ['Oh hey, how\'s it going?', 'Morning, neighbour.', 'Nice Streetmon!'],
  neutral: [],
  wary: ['Don\'t make eye contact.', 'Keep walking...', 'I don\'t want any trouble.'],
  feared: ['That\'s them. Run!', 'Oh no, oh no.', 'Somebody call the cops!'],
};

const WANTED: readonly string[] = ['Is that who the cops are after?', 'I didn\'t see nothing.', 'Sirens again...', 'Get down!'];
const GANG: readonly string[] = ['Was that gunfire?!', 'The Kings again...', 'Everybody get inside!', 'Call 911!'];

const NIGHT: readonly string[] = ['Long shift.', 'City never sleeps, huh?', 'Should\'ve taken a cab.', 'Is it safe out this late?'];

/** A line for a passer-by (or '' for silence). */
export function streetChatter(seed: number, c: ChatterContext): string {
  if (c.gangFight) return pick(GANG, seed);
  if (c.wanted >= 2 && seed % 3 === 0) return pick(WANTED, seed);
  if (c.near && MOOD[c.mood].length && seed % 2 === 0) return pick(MOOD[c.mood], seed >> 1);
  const r = seed % 10;
  if (r < 3) return pick(WEATHER[c.weather], seed >> 2);
  if (r === 3 && c.districtLine) return c.districtLine;
  if (r < 6 && (c.hour >= 21 || c.hour < 5)) return pick(NIGHT, seed >> 3);
  return pick(STREET, seed >> 1);
}

const ROOMS: Record<string, readonly string[]> = {
  gambler: ['Come on, sevens!', 'Daddy needs a new pair of shoes!', 'Hit me. HIT ME.', 'One more spin.', 'I\'m due. I\'m SO due.', 'Red! Red! Red!', 'Yes! YES!', 'Aw, come on!'],
  dealer: ['Place your bets.', 'Dealer has seventeen.', 'Insurance? No? Good call.', 'Shuffle up.'],
  croupier: ['Faites vos jeux.', 'Rien ne va plus!', 'Twenty-nine, black.', 'No more bets.'],
  bartender: ['What\'ll it be?', 'Another round?', 'Easy there, champ.'],
  security: ['Keep it moving.', 'No Streetmon on the tables.'],
  host: ['Welcome to the Empire Royale!', 'Good luck tonight!'],
  clerk: ['Next!', 'Cash or card?'],
  cook: ['Order up!', 'Who ordered the meatloaf?'],
  waitress: ['Refill, hon?', 'Be right with you.'],
  regular: ['Same as always.', 'This booth\'s mine, you know.'],
  worker: ['Is it five yet?', 'Did you get the memo?', 'The printer\'s jammed again.'],
  gamer: ['Final lap!', 'No no no no!', 'New high score!'],
  attendant: ['Machine three\'s broken.', 'Tokens at the counter.'],
  customer: ['Hmm, which one...', 'Do they have this in blue?'],
};

/** A line for someone inside a building, by role (or '' for silence). */
export function roomChatter(role: string, seed: number): string {
  const lines = ROOMS[role];
  return lines ? pick(lines, seed) : '';
}

const SEWER: readonly string[] = ['Mind the sludge.', 'Fire\'s warm. Sit a while.', 'Rats got into the stash again.', 'You hear that dripping? Never stops.', 'Topside folks...', 'Don\'t go down to level three alone.'];

export function sewerChatter(seed: number): string {
  return pick(SEWER, seed);
}

/** Seconds until someone near you says something (busier places talk more). */
export function chatterGap(place: 'street' | 'casino' | 'room' | 'sewer', seed: number): number {
  const base = place === 'casino' ? 1.6 : place === 'room' ? 5 : place === 'sewer' ? 7 : 3.5;
  return base * (0.6 + ((seed % 100) / 100) * 0.9);
}
