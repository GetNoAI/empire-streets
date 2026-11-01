/**
 * Ambient conversations (engine-free, unit-tested): what people say to each other as you pass,
 * shown as speech bubbles over their heads (src/ui/Bubbles.ts). Nobody talks to themselves: two
 * people stop, turn to each other and have a short exchange (3 to 6 lines, taking turns), and what
 * it's about depends on what's going on: the weather, the time of night, where they live, a gang
 * fight down the block, the police, you.
 *
 * `streetConversation` gives the street's (the living world stops the pair and plays it);
 * `roomConversation` the ones inside (a clerk and a customer, a cook and a waitress, a dealer and
 * a gambler); `sewerConversation` the people living down in the tunnels. Lines alternate A, B, A...
 *
 * A few one-liners remain where one line is the natural thing: people shouting during a gang
 * fight (`streetShout`).
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

type Talk = readonly string[];

// ---------------------------------------------------------------- the street

const WEATHER: Record<ChatterContext['weather'], readonly Talk[]> = {
  clear: [
    ['Look at that sky.', 'First proper sun in a week.', "I'm taking lunch in the park. Don't call me.", 'You say that every time and then you call me.'],
    ['Warm enough for you?', 'I could live like this.', "Give it till Thursday. It'll be sleeting."],
    ['Did you put sunscreen on?', "It's October.", "The sun doesn't know that."],
  ],
  cloudy: [
    ['Think it\'ll rain?', 'My knee says yes.', 'Your knee said yes yesterday.', 'And it rained in Queens. My knee has range.'],
    ['Grey again.', "I like grey. Nobody's expecting anything from you on a grey day."],
  ],
  rain: [
    ["Where's your umbrella?", 'Somewhere on the 6 train, probably.', "That's the third one this month.", 'The 6 train has a very nice collection.'],
    ["This rain's not stopping, is it?", 'Radio says till midnight.', "Great. My shoes aren't going to make it."],
    ['Did you see the Sludge types out by the drains?', 'They love this weather.', "Love it a bit too much. One climbed into my cousin's car."],
    ['Share the awning?', 'Sure. Rough day?', "Rough week. And now I'm wet."],
  ],
  storm: [
    ['Was that lightning?!', 'Right over the river.', "Let's get inside. Now.", 'Right behind you.'],
    ['They shut the subway again?', 'Half of it. Flooded at Canal.', "I'm sleeping at the office then."],
  ],
  fog: [
    ['Can you even see the end of the block?', 'Barely. Something moved down there.', 'A Streetmon?', "Or a guy with a bag. Either way, I'm crossing the street."],
    ['Fog this thick, the gulls fly into windows.', 'Is that true?', 'My aunt swears by it.'],
  ],
  snow: [
    ['Snow! Actual snow!', "Give it an hour. It'll be grey slush.", 'Let me have this.'],
    ["Watch your step, it's like glass by the corner.", 'Thanks. Saw a guy go down there earlier.', 'Did he get up?', 'Eventually. Very dignified about it.'],
  ],
};

const NIGHT: readonly Talk[] = [
  ['You still up?', 'Double shift. You?', "Couldn't sleep. The Streetmon on the fire escape won't stop humming.", 'Throw it a pretzel. Works on mine.'],
  ['Is it safe to walk this late?', "Stick to the lit streets and you're fine.", 'And the dark ones?', "That's where the rare Streetmon are. Your call."],
  ["Night Owl's still open, right?", 'Always. Marge never closes.', "I don't think Marge sleeps.", "Nobody's ever seen her sleep."],
  ['Cab or walk?', "Walk. Cabs won't stop this side of midnight.", 'Then walk me to the corner at least.'],
];

const LIFE: readonly Talk[] = [
  ['Rent went up again.', 'How much?', "Enough that I'm looking at the sewers.", 'I hear the sewers have a waiting list now.'],
  ['You coming to the thing on Friday?', 'What thing?', "Dana's thing. The roof thing.", "Oh, the roof thing. Yeah, if I'm off."],
  ['My boss wants the report by Monday.', "It's Friday night.", 'I know.', 'So your boss can wait. Come get a slice.'],
  ['Did you ever fix your bike?', 'Somebody fixed it for me. Fixed it right onto their own bike rack.', 'Stolen?', 'Stolen.'],
  ["How's your mom?", 'Good. She caught a Hustlepup.', 'Your MOM?', 'She threw a sandwich at it. It just stayed.'],
  ['You hungry?', 'Starving.', 'Halal cart or the deli?', 'Cart. The deli guy still hates me.', 'What did you do?', 'Asked for mayo on a pastrami.'],
  ['Is this the bus stop?', 'Used to be. They moved it two blocks up.', 'When?', 'About a year ago. Nobody told the sign.'],
];

const STREETMON: readonly Talk[] = [
  ['Did you see the size of that Strapback?', 'By the garage? It was huge.', "Somebody's going to catch it.", "Somebody's going to get bitten trying."],
  ['My kid wants a Streetmon for his birthday.', 'Which one?', "Whichever one doesn't eat the furniture.", 'So none of them.'],
  ['They say the rare ones only come out at night.', "That's why the park's full of guys with nets at 2 a.m.", 'And the cops just let them?', 'The cops are the guys with nets.'],
  ['Heard someone caught a shiny on 5th.', 'Sure they did.', 'No, really. Gold all over.', 'My cousin caught a shiny once. Turned out to be a Curbstone in tinfoil.'],
];

const LEAGUE: readonly Talk[] = [
  ['You watch the league race last night?', 'Lost twenty bucks on it.', 'On who?', 'The guy in the green hatchback.', 'The one who hit the hydrant?', 'He was doing so well before the hydrant.'],
  ['Promoter Vex is putting on another street race.', 'Where this time?', 'Somewhere in Downtown. Nobody says till an hour before.', 'Cops are going to love that.'],
];

const DISTRICT: readonly ((d: string, line: string) => Talk)[] = [
  (d, line) => [`How long have you lived in ${d}?`, 'Twenty years.', line, 'Ha. Some things never change.'],
  (d, line) => [line, `That's ${d} for you.`, "Wouldn't live anywhere else, though.", 'Me neither.'],
  (d) => ["They're talking about building a tower here.", `In ${d}? Over my dead body.`, 'Over the bodega, actually.', 'Same thing.'],
];

const WANTED: readonly Talk[] = [
  ['Is that who the cops are after?', "Don't look. Don't look at them.", "I'm not looking.", "You're absolutely looking."],
  ['Sirens again.', 'Somebody had a busy afternoon.', "Let's just go the long way round."],
];

const MOOD: Record<ChatterContext['mood'], readonly Talk[]> = {
  beloved: [
    ["Hey, isn't that...?", 'The one who ran off the Gutter Kings? Yeah!', 'Should we say something?', 'Thanks! For the block!'],
    ["That's them. The Streetmon trainer from the news.", 'They look shorter in person.', 'Everyone does.'],
  ],
  liked: [['Nice Streetmon!', 'Ask them where they caught it.', "I'm not asking, you ask.", "Fine. We won't ask."]],
  neutral: [],
  wary: [["Don't make eye contact.", 'With who?', 'With them. I heard things.', 'Okay, okay. Walking.']],
  feared: [
    ["That's them. Move.", 'Who?', 'Just move. Now.'],
    ['Oh no.', 'What?', "Don't turn around. Just keep walking."],
  ],
};

/** A conversation for two people stopping in the street (lines alternate between them). */
export function streetConversation(seed: number, c: ChatterContext): string[] {
  const s = Math.abs(Math.floor(seed));
  if (c.wanted >= 2 && s % 3 === 0) return [...pick(WANTED, s >> 2)];
  if (c.near && MOOD[c.mood].length && s % 4 === 0) return [...pick(MOOD[c.mood], s >> 3)];
  const r = s % 12;
  if (r < 3 && WEATHER[c.weather].length) return [...pick(WEATHER[c.weather], s >> 2)];
  if (r < 5 && (c.hour >= 21 || c.hour < 5)) return [...pick(NIGHT, s >> 3)];
  if (r === 5 && c.district && c.districtLine) return [...pick(DISTRICT, s >> 4)(c.district, c.districtLine)];
  if (r < 8) return [...pick(STREETMON, s >> 2)];
  if (r === 8) return [...pick(LEAGUE, s >> 3)];
  return [...pick(LIFE, s >> 1)];
}

const GANG: readonly string[] = ['Was that gunfire?!', 'The Kings again... everybody inside!', 'Get down! Get down!', 'Somebody call 911!'];

/** One-liners that are shouts, not talk: a gang fight breaking out down the block. */
export function streetShout(seed: number): string {
  return pick(GANG, seed);
}

// ---------------------------------------------------------------- inside

/** Pairs of roles that talk inside, and what they say (A is the first role). */
const ROOM_TALK: ReadonlyArray<{ a: string; b: string; talks: readonly Talk[] }> = [
  {
    a: 'clerk',
    b: 'customer',
    talks: [
      ['Next!', 'Turkey on rye, and do you have the spicy mustard?', 'Ran out Tuesday.', 'Then surprise me.', 'Turkey on rye, no surprises. Six fifty.'],
      ['Find everything okay?', 'Where do you keep the batteries?', 'Behind me. AA or AAA?', "Whichever my Streetmon didn't eat."],
      ['That all?', 'And a lottery ticket.', 'Feeling lucky?', 'Feeling broke. Same thing, really.'],
      ['How much for the watch?', "That's a real gold Haverford. Four hundred.", "It says 'Havreford'.", 'Two hundred.'],
    ],
  },
  {
    a: 'waitress',
    b: 'regular',
    talks: [
      ['The usual, hon?', 'You know it.', 'Eggs over easy, rye toast, coffee black.', 'And a slice of the pie.', 'You never get the pie.', "It's been a week, Marge."],
      ['Refill?', 'Please. Long night.', 'Work?', "Worse. My cousin's wedding."],
    ],
  },
  {
    a: 'cook',
    b: 'waitress',
    talks: [
      ["Order up! Who's the meatloaf?", 'Booth four.', 'Booth four had meatloaf yesterday.', 'Booth four has meatloaf every day.'],
      ["We're out of hash browns.", "Don't tell table six.", 'What do I tell table six?', "Tell them it's a new menu."],
    ],
  },
  {
    a: 'attendant',
    b: 'customer',
    talks: [
      ["Machine three's broken, use five.", 'Five ate my quarters last week.', "Five eats everybody's quarters. It's still better than three."],
      ['You left a sock in the dryer.', 'One sock?', 'One sock.', 'Where does the other one go? Every time!'],
    ],
  },
  {
    a: 'gamer',
    b: 'gamer',
    talks: [
      ['Watch this. Final lap.', 'You always crash on the final lap.', 'Not this time. Not this... no. NO.', 'Every time.'],
      ['Who holds the high score on this one?', 'Some kid called ZZZ.', "I've been trying to beat ZZZ for a year.", 'Everybody has.'],
    ],
  },
  {
    a: 'worker',
    b: 'worker',
    talks: [
      ['Did you get the memo?', 'About the printer?', 'About the printer.', "I'll believe it when it prints."],
      ['Is it five yet?', "It's two fifteen.", 'It feels like five.', 'It always feels like five.'],
    ],
  },
  {
    a: 'dealer',
    b: 'gambler',
    talks: [
      ['Place your bets.', 'All on black.', 'All of it?', "All of it. I'm due.", 'Twenty-three. Red.', '...I was due for red.'],
      ['Dealer shows six.', 'Hit me.', 'Fourteen... seventeen. Stand?', 'Hit me again.', 'Twenty-four. Bust.', "Shuffle faster, my luck's about to turn."],
    ],
  },
  {
    a: 'croupier',
    b: 'gambler',
    talks: [['Faites vos jeux.', 'What does that mean?', 'Place your bets, sir.', 'Then why not say that?', 'Rien ne va plus.']],
  },
  {
    a: 'bartender',
    b: 'gambler',
    talks: [
      ["What'll it be?", 'Something that tastes like winning.', 'We have something that tastes like losing slower.', 'Make it a double.'],
      ['Easy there, champ.', "I'm celebrating!", 'Celebrating what?', "I'm about to win."],
    ],
  },
  {
    a: 'host',
    b: 'security',
    talks: [['Big crowd tonight.', 'Keep an eye on the guy at table four.', 'The lucky one?', "Nobody's that lucky."]],
  },
];

/** A conversation between two people in a room (by their roles), or null if they have nothing to say. */
export function roomConversation(roleA: string, roleB: string, seed: number): { first: 'a' | 'b'; lines: string[] } | null {
  const s = Math.abs(Math.floor(seed));
  const fits = ROOM_TALK.filter((t) => (t.a === roleA && t.b === roleB) || (t.a === roleB && t.b === roleA));
  if (!fits.length) return null;
  const t = pick(fits, s);
  return { first: t.a === roleA ? 'a' : 'b', lines: [...pick(t.talks, s >> 2)] };
}

// ---------------------------------------------------------------- the sewers

const SEWER_TALK: readonly Talk[] = [
  ["Fire's warm. Sit a while.", "Can't. Rats got into the stash again.", 'The big ones?', 'Is there another kind down here?'],
  ['You hear that dripping?', 'Never stops.', 'I used to hate it.', 'And now?', "Now I can't sleep without it."],
  ['Somebody went down to level three yesterday.', 'Alone?', 'Alone.', 'Did they come back?', 'Ask me tomorrow.'],
  ['Topside folks walked through again.', 'Lost?', "They're always lost. Pointed them at the ladder.", "Next time charge 'em a toll."],
  ['Mind the sludge by the junction.', "It's darker than it used to be.", "That's what worries me."],
];

export function sewerConversation(seed: number): string[] {
  return [...pick(SEWER_TALK, seed)];
}

/** Seconds until people near you start another conversation (busier places talk more). */
export function chatterGap(place: 'street' | 'casino' | 'room' | 'sewer', seed: number): number {
  const base = place === 'casino' ? 7 : place === 'room' ? 12 : place === 'sewer' ? 16 : 9;
  return base * (0.7 + ((seed % 100) / 100) * 0.7);
}

/** Every street conversation (tests). */
export function allStreetTalks(): Talk[] {
  return [...Object.values(WEATHER).flat(), ...NIGHT, ...LIFE, ...STREETMON, ...LEAGUE, ...WANTED, ...Object.values(MOOD).flat()];
}
