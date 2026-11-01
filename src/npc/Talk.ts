/**
 * Conversations with the people of Empire City (engine-free, unit-tested): passers-by you stop on
 * the street, and the people who work in (and hang around) the shops, the diner, the offices.
 *
 * Every conversation is built from what's going on: the time of day, the district, whether the
 * cops are after you, your lead Streetmon, your money, and real things in the world (a safehouse
 * for sale nearby, the deep drains, the pond, the docks, races you can enter). People open
 * differently depending on who they are and the hour; you pick what to ask (directions, a rumour,
 * advice, or just goodbye), and the answers point at places that exist, with a waypoint if you
 * want one. The Game turns a TalkTree into DialogueBox pages and carries out the actions.
 */

import type { District } from '../creatures/Data';

export interface TalkContext {
  /** 0..24 */
  hour: number;
  district: District | string;
  wanted: number;
  money: number;
  /** Your lead Streetmon's name and species (null: no team yet). */
  lead: { name: string; species: string; level: number } | null;
  /** Things in the world to talk about (each optional). */
  places: {
    safehouseForSale?: { name: string; price: number; x: number; z: number };
    clinic?: { x: number; z: number };
    deli?: { name: string; x: number; z: number };
    diner?: { name: string; x: number; z: number };
    docks?: { name: string; x: number; z: number };
    pond?: { x: number; z: number };
    chopShop?: { x: number; z: number };
  };
  /** The next race you could enter, a heist that's open, the League boss still to beat. */
  race?: string;
  /** Has the player been down to the deep drains, and found a cache? */
  deepVisited: boolean;
  /** Times you've already spoken to this person. */
  met: number;
}

/** What a choice does besides moving on: set a waypoint, open a shop, heal, etc. */
export type TalkAction =
  | { kind: 'waypoint'; x: number; z: number; label: string }
  | { kind: 'shop' }
  | { kind: 'eat' }
  | { kind: 'wardrobe' }
  | { kind: 'sell' }
  | { kind: 'play' }
  | { kind: 'drink' }
  | { kind: 'tip'; money: number }
  | { kind: 'casino'; game: 'slots' | 'blackjack' | 'roulette' | 'poker' };

export interface TalkChoice {
  label: string;
  next: string | 'end';
  action?: TalkAction;
}

export interface TalkNode {
  text: string;
  choices: TalkChoice[];
}

export interface TalkTree {
  speaker: string;
  start: string;
  nodes: Record<string, TalkNode>;
}

/** A small seeded picker so the same person says the same kind of thing. */
function picker(seed: number): <T>(xs: readonly T[]) => T {
  let s = seed >>> 0 || 1;
  return <T,>(xs: readonly T[]): T => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return xs[s % xs.length];
  };
}

const districtName = (d: string): string => ({ uptown: 'Uptown', midtown: 'Midtown', downtown: 'Downtown', park: 'the Central Green', waterfront: 'the Waterfront' } as Record<string, string>)[d] ?? 'the city';

function timeOfDay(h: number): 'morning' | 'day' | 'evening' | 'night' {
  return h >= 5 && h < 11 ? 'morning' : h < 17 ? 'day' : h < 21 ? 'evening' : 'night';
}

const FIRST_NAMES = ['Dana', 'Marcus', 'Rosa', 'Theo', 'Imani', 'Viktor', 'June', 'Ezra', 'Paloma', 'Sid', 'Ming', 'Carla', 'Owen', 'Bea', 'Luis', 'Nadia'];

/** A passer-by stopped on the street. `seed`: the person (same seed, same personality). */
export function streetTalk(seed: number, ctx: TalkContext): TalkTree {
  const pick = picker(seed * 7 + 3);
  const name = pick(FIRST_NAMES);
  const tod = timeOfDay(ctx.hour);
  const where = districtName(String(ctx.district));
  const mood = pick(['busy', 'chatty', 'wary', 'friendly'] as const);
  const lead = ctx.lead;
  const openers: string[] = [];
  if (ctx.wanted > 0) openers.push(pick(["Whoa, keep walking. I don't need the cops thinking we're friends.", "You've got sirens following you around, you know that? Make it quick.", "Listen, I didn't see you. Whatever it is, I didn't see you."]));
  else if (ctx.met > 0) openers.push(pick(['You again! Still finding your way around?', "Back for more advice? I'm flattered.", 'Hey, it\'s you. How\'s the city treating you?']));
  else if (mood === 'busy') openers.push(pick(["I've got about thirty seconds, what do you need?", 'Walk with me, I\'m late.', 'Sorry, in a hurry. What is it?']));
  else if (mood === 'wary') openers.push(pick(["You're not selling something, are you?", 'Do I know you?', "If this is about the parking ticket, it wasn't me."]));
  else openers.push(
    tod === 'morning'
      ? pick(['Morning! Coffee hasn\'t kicked in yet, go easy on me.', 'Early start for you too, huh?'])
      : tod === 'night'
        ? pick(['Out late, aren\'t you? Best time for the rare Streetmon, they say.', 'Night owl? Me too. City\'s different after dark.'])
        : tod === 'evening'
          ? pick(['Evening. Nice light this time of day, isn\'t it?', 'Heading home, finally. What\'s up?'])
          : pick([`Hey there. Lovely day in ${where}.`, 'Hi! You look like you\'re new around here.']),
  );
  if (lead && ctx.wanted === 0 && pick([true, false, false])) openers.push(pick([`Is that a ${lead.species}? Lv ${lead.level}? Not bad at all.`, lead.name !== lead.species ? `${lead.name}, huh? Cute name for a ${lead.species}.` : `You should give that ${lead.species} a name. They like it, you know.`, `My kid would lose it if they saw your ${lead.species}.`]));
  const nodes: Record<string, TalkNode> = {};
  const start = 'start';
  const choices: TalkChoice[] = [];
  // ---- directions: the most useful place for you right now
  const dirs: TalkChoice[] = [];
  const P = ctx.places;
  if (P.safehouseForSale && ctx.money >= P.safehouseForSale.price * 0.5)
    dirs.push({ label: 'Know anywhere to live round here?', next: 'home', action: { kind: 'waypoint', x: P.safehouseForSale.x, z: P.safehouseForSale.z, label: P.safehouseForSale.name } });
  if (P.clinic) dirs.push({ label: 'Where can I patch up my Streetmon?', next: 'clinic', action: { kind: 'waypoint', x: P.clinic.x, z: P.clinic.z, label: 'Corner Clinic' } });
  if (P.diner) dirs.push({ label: 'Anywhere decent to eat?', next: 'eat', action: { kind: 'waypoint', x: P.diner.x, z: P.diner.z, label: P.diner.name } });
  if (dirs.length) choices.push(pick(dirs));
  if (P.safehouseForSale) nodes.home = { text: `There's a place going on the market, the ${P.safehouseForSale.name}. $${P.safehouseForSale.price.toLocaleString('en-US')}, which is a steal for ${districtName(String(ctx.district))}. Somewhere to crash, keep your head down, sleep off a bad night. I'll point you.`, choices: [{ label: 'Thanks.', next: 'end' }] };
  if (P.clinic) nodes.clinic = { text: pick(['Corner Clinic, the green cross. They\'ll fix your team up for forty bucks, and they sell cuffs and crates.', 'Look for the green cross sign. Nurse there has seen worse than whatever you\'ve got.']), choices: [{ label: 'Appreciate it.', next: 'end' }] };
  if (P.diner) nodes.eat = { text: `${P.diner.name}. Open all night, pie's terrible, coffee's worse, and I go there every single day. You'll feel better after a plate, trust me.`, choices: [{ label: 'Sold.', next: 'end' }] };
  // ---- a rumour: true things you might not know
  const rumours: string[] = [];
  if (!ctx.deepVisited) rumours.push('There\'s levels under the sewers. Old drains, cisterns. Folks say the Streetmon down there are twice the size, and there\'s lockboxes nobody\'s cracked since the seventies.');
  else rumours.push('You\'ve been down in the deep drains? Then you know. The further down, the meaner they get. Bring cages, not cuffs.');
  if (P.pond) rumours.push('Feed the ducks at the Central Green pond? They\'re not ducks. Quackpacks. And at night something big and gold circles the middle. Swims right under the rowboats.');
  if (P.docks) rumours.push(`Dock workers down at ${P.docks.name} say the river birds steal sandwiches and then fly up past the cranes. Gullgrifters. Watch the sky, they come down if you're patient.`);
  rumours.push('Look up sometime. There\'s Streetmon riding the wind over the rooftops. Come down if you keep still, they say.');
  if (ctx.race) rumours.push(`There's a race on: the ${ctx.race}. Big money if you've got the car for it. Mama Rust's crew will sort your engine out.`);
  rumours.push('Somebody\'s been sneaking around the rooftops leaving crates of gear. Fire escapes get you up there, elevators too if you know which doors.');
  const rumour = pick(rumours);
  choices.push({ label: pick(['Heard anything interesting?', 'What\'s the word on the street?', 'Any gossip?']), next: 'rumour' });
  nodes.rumour = { text: rumour, choices: [{ label: pick(['Huh. Thanks.', 'I\'ll look into it.', 'Sounds like trouble. My kind.']), next: 'end' }] };
  // ---- advice
  const advice = [
    'Wear them down before you throw anything. Full health, the pod bounces right off.',
    'Nights are when the rare ones come out. Uptown\'s quieter, Downtown\'s rougher.',
    'If the cops are on you, break line of sight. Duck behind a building, they lose you. They can\'t see behind them for nothing.',
    'Hold T and you can switch your lead or throw a pod without stopping. Saved my bacon more than once.',
    'Safehouses save your life. Literally. Get wasted and you wake up at the last one you slept in.',
    'Don\'t drive into the pond. I did. The car is still down there.',
  ];
  choices.push({ label: pick(['Any advice for someone new?', 'Got any tips?', 'What should I know about this city?']), next: 'advice' });
  nodes.advice = { text: pick(advice), choices: [{ label: 'Good to know.', next: 'end' }] };
  choices.push({ label: pick(['Never mind.', 'See you around.', 'Take care.']), next: 'end' });
  nodes[start] = { text: openers.join(' '), choices: choices.slice(0, 4) };
  return { speaker: name, start, nodes };
}

/** People inside a shop, the diner, an office: their role and the place's kind decide the talk. */
export function interiorTalk(role: string, place: { name: string; kind: string }, seed: number, ctx: TalkContext): TalkTree {
  const pick = picker(seed * 13 + role.length);
  const tod = timeOfDay(ctx.hour);
  const lead = ctx.lead;
  const N: Record<string, TalkNode> = {};
  const end: TalkChoice = { label: pick(['Thanks.', 'See you.', 'Bye.']), next: 'end' };
  const speaker = ({
    clerk: 'Sal',
    pawnbroker: 'Goldie',
    cook: 'Hector',
    waitress: 'Marge',
    regular: 'Old Benny',
    receptionist: 'Priya',
    worker: pick(['Tom from Accounts', 'Leah, Claims', 'Devon, IT']),
    manager: 'Ms. Halvorsen',
    attendant: pick(['Kim', 'Jojo', 'Ade']),
    customer: pick(['A customer', 'A regular', 'Someone browsing']),
    gamer: 'Kid on the cabinet',
    dealer: pick(['Dealer Ruth', 'Dealer Marcus', 'Dealer Ying']),
    croupier: 'Croupier Étienne',
    bartender: 'Lou behind the bar',
    gambler: pick(['A gambler', 'A high roller', 'A tourist', 'A regular at the tables']),
    security: 'Casino security',
    host: 'Vivienne, the host',
  } as Record<string, string>)[role] ?? 'Someone';
  switch (role) {
    case 'clerk':
      N.start = {
        text: ctx.met ? pick(['Back again! Stock up while you can, the delivery truck got stuck behind a Curbstone this morning.', 'My favourite customer. Don\'t tell the others.']) : tod === 'night' ? "Twenty-four hours, three hundred sixty-five days. What can I get you?" : `Welcome to ${place.name}. Cuffs, crates, nets, snacks, lottery tickets. No refunds on the tickets.`,
        choices: [{ label: 'Let me see what you\'ve got.', next: 'end', action: { kind: 'shop' } }, { label: 'How\'s business?', next: 'biz' }, end],
      };
      N.biz = { text: pick(['Up since everybody started hunting Streetmon. Down since a Gutterat moved into my storeroom. Net, about even.', 'You know what sells? Nets. Since the pond filled up with Quackpacks, I can\'t keep them on the shelf.']), choices: [{ label: 'Let me see the shelves.', next: 'end', action: { kind: 'shop' } }, end] };
      break;
    case 'pawnbroker':
      N.start = {
        text: ctx.met ? 'Back with more treasures? Let\'s see.' : 'Goldie\'s Pawn and Loan. I buy what you don\'t need and I don\'t ask where it came from. Within reason.',
        choices: [{ label: 'I\'ve got some things to sell.', next: 'end', action: { kind: 'sell' } }, { label: 'Seen anything strange come through?', next: 'odd' }, end],
      };
      N.odd = { text: 'Kid brought in a lockbox last week. Old city stamp on it, from the drains under the sewers. Empty, but the lock was the good kind. Somebody\'s been down there opening them. Maybe you should beat them to it.', choices: [{ label: 'Maybe I will.', next: 'end' }] };
      break;
    case 'cook':
      N.start = { text: pick(['Order\'s up when it\'s up. You eating or watching?', 'Hey. Hungry? Special\'s the meatloaf. It\'s always the meatloaf.']), choices: [{ label: 'A plate of whatever\'s hot. ($15)', next: 'end', action: { kind: 'eat' } }, { label: 'Busy night?', next: 'busy' }, end] };
      N.busy = { text: 'League night. Every racer in town comes in after the sprints to argue about who cut the corner. Then they leave without tipping.', choices: [{ label: 'Here, for your trouble. ($10)', next: 'thanks', action: { kind: 'tip', money: 10 } }, end] };
      N.thanks = { text: 'Huh. A tipper. I\'ll put extra gravy on your next one.', choices: [end] };
      break;
    case 'waitress':
      N.start = {
        text: tod === 'night' ? 'Coffee, hon? You look like you need it. Sit anywhere, the booths by the window are warmest.' : 'Hi, sweetie. Table for one? Or are you meeting someone?',
        choices: [{ label: 'Something to eat, please. ($15)', next: 'end', action: { kind: 'eat' } }, { label: 'Who\'s the old guy in the booth?', next: 'benny' }, end],
      };
      N.benny = { text: 'That\'s Benny. Drove a cab for forty years, knows every alley in the city. Buy him a coffee and he\'ll tell you about all of them.', choices: [{ label: 'I might.', next: 'end' }] };
      break;
    case 'regular':
      N.start = { text: ctx.met ? 'Back again, kid? Sit, sit.' : 'Forty years in a cab. Forty. You want to know this city, you sit down and you listen.', choices: [{ label: 'Tell me about the city.', next: 'city' }, { label: 'Know any shortcuts?', next: 'short' }, end] };
      N.city = { text: 'Uptown\'s money, Midtown\'s work, Downtown\'s trouble, and the Waterfront\'s where all three go to make deals they don\'t want anyone to see. Dockside Dutch runs the docks. Nobody crosses Dutch.', choices: [{ label: 'Who\'s Dutch?', next: 'dutch' }, end] };
      N.dutch = { text: 'District boss. Owns the League pass for the Waterfront. You want to race with the big boys, you go through Dutch. Bring your best team, kid.', choices: [end] };
      N.short = { text: 'The back alleys cut through half the blocks. And the sewers, if you don\'t mind the smell. Manholes all over. Every one of them leads somewhere.', choices: [end] };
      break;
    case 'receptionist':
      N.start = { text: `${place.name}, how can I help you? Do you have an appointment?`, choices: [{ label: 'Just looking around.', next: 'look' }, { label: 'What do you do here?', next: 'what' }, end] };
      N.look = { text: 'Sure. The notice board\'s by the door. Please don\'t feed anything to the Streetmon in the break room, someone keeps doing it.', choices: [end] };
      N.what = {
        text: place.kind === 'office' && place.name.includes('Insurance') ? 'Insurance. Mostly Streetmon damage these days. A Curbcrusher went through a showroom last month. The claims are... creative.' : 'Logistics. Trucks, containers, the docks. If it moves in this city, we\'ve got a spreadsheet about it.',
        choices: [end],
      };
      break;
    case 'worker':
      N.start = { text: pick(['Please tell me you\'re from IT.', 'Is it five o\'clock yet? No? Great.', 'Don\'t mind me, I\'m pretending to work.']), choices: [{ label: 'Rough day?', next: 'rough' }, end] };
      N.rough = { text: pick(['My Hustlepup ate my lunch again. I don\'t even know how he got into the fridge.', 'Third armored truck this month. Somebody keeps hitting them and we keep insuring them. Not my problem, technically.', 'I race on weekends. Here I\'m a spreadsheet person. It\'s fine. Everything\'s fine.']), choices: [end] };
      break;
    case 'manager':
      N.start = { text: 'Halvorsen. I run this floor. You don\'t look like a client, so you\'re either lost or looking for work.', choices: [{ label: 'Looking for work.', next: 'work' }, { label: 'Lost.', next: 'end' }] };
      N.work = { text: 'Not that kind of work, I suspect. But a word of advice: the city pays well for what it doesn\'t want to know about. The heist crews hang round the lockups by the river. I didn\'t tell you that.', choices: [end] };
      break;
    case 'attendant':
      N.start =
        place.kind === 'laundromat'
          ? { text: 'Machines take quarters, the change machine eats them. Need to freshen up? There\'s a changing room in the back.', choices: [{ label: 'I could use a change of clothes.', next: 'end', action: { kind: 'wardrobe' } }, end] }
          : { text: 'Tokens at the counter. The racer cabinet\'s the popular one, the high score\'s been the same for six years.', choices: [{ label: 'Give me a go on the racer. ($1)', next: 'end', action: { kind: 'play' } }, end] };
      break;
    case 'gamer':
      N.start = { text: pick(['Shh. Shh. Final lap.', 'You want next? You\'ll lose. Everybody loses.']), choices: [{ label: 'Who holds the high score?', next: 'score' }, end] };
      N.score = { text: 'Some guy called "RUST". Every machine. I think it\'s the same person who runs the Chop Shop, but nobody believes me.', choices: [end] };
      break;
    case 'dealer':
      N.start = { text: pick(['Table minimum is five. Have a seat, the shoe is fresh.', 'Dealer stands on all seventeens. Good luck to you.', ctx.met ? 'Back for another hand? The cards remember you.' : 'Place your bet whenever you\'re ready.']), choices: [{ label: 'Deal me in.', next: 'end', action: { kind: 'casino', game: 'blackjack' } }, { label: 'Any tips?', next: 'tip' }, end] };
      N.tip = { text: pick(['Stand on twelve against a six. Always double eleven. Never take insurance. Never.', 'Off the record? The house always wins. On the record, you look lucky.']), choices: [{ label: 'Deal me in.', next: 'end', action: { kind: 'casino', game: 'blackjack' } }, end] };
      break;
    case 'croupier':
      N.start = { text: 'Faites vos jeux. Red, black, the dozens, or a single number if you feel brave. One zero only, monsieur, we are civilised here.', choices: [{ label: 'Let\'s spin.', next: 'end', action: { kind: 'casino', game: 'roulette' } }, end] };
      break;
    case 'bartender':
      N.start = { text: pick(['What\'ll it be? House special is the Lucky Strike, tastes like a jackpot and a headache.', 'Winning or drowning sorrows? Same price either way.']), choices: [{ label: 'Something cold. ($8)', next: 'drink', action: { kind: 'drink' } }, { label: 'Hear anything interesting?', next: 'gossip' }, end] };
      N.drink = { text: 'On the house if you hit a jackpot. Otherwise eight bucks.', choices: [end] };
      N.gossip = {
        text: pick([
          'Guys in red bandanas come in Fridays, cash out a lot of small bills. The Gutter Kings. They run things under the city, way down in the old cisterns. Don\'t go asking about them.',
          'Somebody won forty grand on the Star machine last month. Bought a hovercraft. Crashed it in the pond the same night.',
          'The cops raided a gang hideout under Midtown last year. Came back up with nothing but wet boots.',
        ]),
        choices: [end],
      };
      break;
    case 'gambler':
      N.start = {
        text: pick(['Shh, it\'s about to hit. I can feel it.', 'Down three hundred. Up two. Down five. It\'s fine. It\'s fine.', 'You play the Seven machine on the end, it\'s hot tonight.', 'My Streetmon\'s lucky. I rub its head before every hand. It bites me. Still lucky.']),
        choices: [{ label: 'Good luck.', next: 'end' }],
      };
      break;
    case 'security':
      N.start = { text: pick(['Keep it friendly. No Streetmon on the tables.', 'Holster stays holstered in here. We have rules.', 'You win big, you tip the staff. That\'s also a rule. Unofficially.']), choices: [end] };
      break;
    case 'host':
      N.start = {
        text: ctx.met ? 'Welcome back! The tables have missed you.' : `Welcome to ${place.name}! Slots on the floor, blackjack and roulette at the back, video poker by the bar. Chips are cash here, darling: bet what you like, five to five thousand.`,
        choices: [{ label: 'Where\'s the best odds?', next: 'odds' }, end],
      };
      N.odds = { text: 'Blackjack, if you play it right. Video poker isn\'t bad either. The slots are for fun. Roulette is for romance.', choices: [end] };
      break;
    default:
      N.start = {
        text: lead ? pick([`Is that a ${lead.species} with you? I\'ve only ever seen them on the news.`, 'Don\'t mind me, just browsing.']) : pick(['Don\'t mind me, just browsing.', 'Busy in here today.']),
        choices: [end],
      };
  }
  return { speaker, start: 'start', nodes: N };
}
