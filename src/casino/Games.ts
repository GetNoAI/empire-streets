/**
 * The casino's games (engine-free, unit-tested): slots, blackjack, European roulette and Jacks or
 * Better video poker, with real rules and paytables. Everything takes a `rand` so tests can stack
 * the deck. Money is plain dollars; the UI (src/ui/CasinoMenu.ts) moves the stakes in and out.
 */

export type Rand = () => number;

export const CASINO = {
  /** Table limits ($). */
  minBet: 5,
  maxBet: 5000,
  /** Slot reel symbols, weights and three-of-a-kind payouts (x the bet). */
  slots: [
    { sym: 'CHERRY', weight: 30, pay3: 6 },
    { sym: 'LEMON', weight: 26, pay3: 8 },
    { sym: 'BELL', weight: 18, pay3: 14 },
    { sym: 'BAR', weight: 12, pay3: 25 },
    { sym: 'SEVEN', weight: 6, pay3: 60 },
    { sym: 'STAR', weight: 3, pay3: 200 },
  ],
  /** Two cherries anywhere on the line pay this. */
  cherryPair: 2,
} as const;

// ------------------------------------------------------------------ slots

export type SlotSym = (typeof CASINO.slots)[number]['sym'];

export function spinReel(rand: Rand): SlotSym {
  const total = CASINO.slots.reduce((s, x) => s + x.weight, 0);
  let r = rand() * total;
  for (const s of CASINO.slots) {
    r -= s.weight;
    if (r < 0) return s.sym;
  }
  return CASINO.slots[0].sym;
}

/** Payout multiplier for a line of three. */
export function slotPayout(line: readonly SlotSym[]): number {
  if (line[0] === line[1] && line[1] === line[2]) return CASINO.slots.find((s) => s.sym === line[0])!.pay3;
  if (line.filter((s) => s === 'CHERRY').length === 2) return CASINO.cherryPair;
  return 0;
}

export function spinSlots(rand: Rand): { line: SlotSym[]; mult: number } {
  const line = [spinReel(rand), spinReel(rand), spinReel(rand)];
  return { line, mult: slotPayout(line) };
}

/** Expected return per $1 (the house edge is 1 minus this). */
export function slotsReturn(): number {
  const total = CASINO.slots.reduce((s, x) => s + x.weight, 0);
  const p = (sym: SlotSym): number => CASINO.slots.find((s) => s.sym === sym)!.weight / total;
  let ev = 0;
  for (const s of CASINO.slots) ev += p(s.sym) ** 3 * s.pay3;
  const c = p('CHERRY');
  ev += 3 * c * c * (1 - c) * CASINO.cherryPair;
  return ev;
}

// ------------------------------------------------------------------ cards

export interface Card {
  /** 2..14 (11 J, 12 Q, 13 K, 14 A). */
  rank: number;
  suit: 0 | 1 | 2 | 3;
}

export const SUITS = ['♠', '♥', '♦', '♣'] as const;

export function cardText(c: Card): string {
  const r = c.rank <= 10 ? String(c.rank) : ['J', 'Q', 'K', 'A'][c.rank - 11];
  return `${r}${SUITS[c.suit]}`;
}

export function newDeck(decks = 1): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) out.push({ rank: r, suit: s as Card['suit'] });
  return out;
}

export function shuffle<T>(a: T[], rand: Rand): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ------------------------------------------------------------------ blackjack

/** Best total of a hand (aces count 11 unless that busts) and whether it's soft. */
export function handValue(hand: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 14) {
      aces++;
      total += 11;
    } else total += Math.min(10, c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (h: readonly Card[]): boolean => h.length === 2 && handValue(h).total === 21;

export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export class Blackjack {
  readonly shoe: Card[];
  player: Card[] = [];
  dealer: Card[] = [];
  bet = 0;
  done = false;
  outcome: BlackjackOutcome | null = null;
  doubled = false;

  constructor(private readonly rand: Rand, shoe?: Card[]) {
    this.shoe = shoe ?? shuffle(newDeck(4), rand);
  }

  private draw(): Card {
    if (!this.shoe.length) this.shoe.push(...shuffle(newDeck(4), this.rand));
    return this.shoe.pop()!;
  }

  deal(bet: number): void {
    this.bet = bet;
    this.done = false;
    this.outcome = null;
    this.doubled = false;
    this.player = [this.draw(), this.draw()];
    this.dealer = [this.draw(), this.draw()];
    if (isBlackjack(this.player) || isBlackjack(this.dealer)) this.settle();
  }

  hit(): void {
    if (this.done) return;
    this.player.push(this.draw());
    if (handValue(this.player).total > 21) this.settle();
  }

  /** Doubles the bet, takes exactly one card, then stands (two-card hands only). */
  double(): void {
    if (this.done || this.player.length !== 2) return;
    this.bet *= 2;
    this.doubled = true;
    this.player.push(this.draw());
    this.stand();
  }

  stand(): void {
    if (this.done) return;
    // Dealer draws to 17 and stands on all 17s.
    if (handValue(this.player).total <= 21) while (handValue(this.dealer).total < 17) this.dealer.push(this.draw());
    this.settle();
  }

  private settle(): void {
    this.done = true;
    const p = handValue(this.player).total;
    const d = handValue(this.dealer).total;
    if (isBlackjack(this.player)) this.outcome = isBlackjack(this.dealer) ? 'push' : 'blackjack';
    else if (isBlackjack(this.dealer)) this.outcome = 'lose';
    else if (p > 21) this.outcome = 'bust';
    else if (d > 21 || p > d) this.outcome = 'win';
    else if (p === d) this.outcome = 'push';
    else this.outcome = 'lose';
  }

  /** What comes back to the player for the stake (0 on a loss, the stake on a push). */
  returned(): number {
    switch (this.outcome) {
      case 'blackjack':
        return Math.floor(this.bet * 2.5);
      case 'win':
        return this.bet * 2;
      case 'push':
        return this.bet;
      default:
        return 0;
    }
  }
}

// ------------------------------------------------------------------ roulette (European, one zero)

export const RED_NUMBERS: ReadonlySet<number> = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteBet =
  | { kind: 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' }
  | { kind: 'dozen'; n: 1 | 2 | 3 }
  | { kind: 'number'; n: number };

export function spinRoulette(rand: Rand): number {
  return Math.floor(rand() * 37);
}

/** Total returned for a $1 stake on this bet (0 when it loses): evens 2, dozens 3, a number 36. */
export function rouletteReturn(bet: RouletteBet, n: number): number {
  if (bet.kind === 'number') return bet.n === n ? 36 : 0;
  if (n === 0) return 0;
  switch (bet.kind) {
    case 'red':
      return RED_NUMBERS.has(n) ? 2 : 0;
    case 'black':
      return RED_NUMBERS.has(n) ? 0 : 2;
    case 'odd':
      return n % 2 === 1 ? 2 : 0;
    case 'even':
      return n % 2 === 0 ? 2 : 0;
    case 'low':
      return n <= 18 ? 2 : 0;
    case 'high':
      return n >= 19 ? 2 : 0;
    case 'dozen':
      return Math.ceil(n / 12) === bet.n ? 3 : 0;
  }
}

// ------------------------------------------------------------------ video poker (Jacks or Better)

export type PokerHand = 'royalFlush' | 'straightFlush' | 'fourKind' | 'fullHouse' | 'flush' | 'straight' | 'threeKind' | 'twoPair' | 'jacksOrBetter' | 'nothing';

/** 9/6 Jacks or Better paytable (x the bet). */
export const POKER_PAYS: Record<PokerHand, number> = { royalFlush: 250, straightFlush: 50, fourKind: 25, fullHouse: 9, flush: 6, straight: 4, threeKind: 3, twoPair: 2, jacksOrBetter: 1, nothing: 0 };

export const POKER_NAMES: Record<PokerHand, string> = { royalFlush: 'Royal Flush', straightFlush: 'Straight Flush', fourKind: 'Four of a Kind', fullHouse: 'Full House', flush: 'Flush', straight: 'Straight', threeKind: 'Three of a Kind', twoPair: 'Two Pair', jacksOrBetter: 'Jacks or Better', nothing: 'Nothing' };

export function evaluatePoker(hand: readonly Card[]): PokerHand {
  const ranks = hand.map((c) => c.rank).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = hand.every((c) => c.suit === hand[0].suit);
  const unique = counts.size === 5;
  const wheel = ranks.join() === '2,3,4,5,14';
  const straight = unique && (ranks[4] - ranks[0] === 4 || wheel);
  if (straight && flush) return ranks[0] === 10 ? 'royalFlush' : 'straightFlush';
  if (groups[0] === 4) return 'fourKind';
  if (groups[0] === 3 && groups[1] === 2) return 'fullHouse';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0] === 3) return 'threeKind';
  if (groups[0] === 2 && groups[1] === 2) return 'twoPair';
  if (groups[0] === 2 && [...counts.entries()].some(([r, n]) => n === 2 && r >= 11)) return 'jacksOrBetter';
  return 'nothing';
}

export class VideoPoker {
  private deck: Card[] = [];
  hand: Card[] = [];
  held = [false, false, false, false, false];
  bet = 0;
  /** 'deal' waiting for holds, then 'done' after the draw. */
  phase: 'idle' | 'deal' | 'done' = 'idle';
  result: PokerHand | null = null;

  constructor(private readonly rand: Rand) {}

  deal(bet: number, deck?: Card[]): void {
    this.deck = deck ?? shuffle(newDeck(1), this.rand);
    this.bet = bet;
    this.hand = this.deck.splice(0, 5);
    this.held = [false, false, false, false, false];
    this.phase = 'deal';
    this.result = null;
  }

  toggle(i: number): void {
    if (this.phase === 'deal') this.held[i] = !this.held[i];
  }

  draw(): void {
    if (this.phase !== 'deal') return;
    this.hand = this.hand.map((c, i) => (this.held[i] ? c : this.deck.shift()!));
    this.phase = 'done';
    this.result = evaluatePoker(this.hand);
  }

  returned(): number {
    return this.result ? this.bet * POKER_PAYS[this.result] : 0;
  }
}
