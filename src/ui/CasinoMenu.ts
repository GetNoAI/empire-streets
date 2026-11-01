import { CASINO, Blackjack, POKER_NAMES, POKER_PAYS, RED_NUMBERS, VideoPoker, cardText, handValue, rouletteReturn, spinRoulette, spinSlots, type Card, type RouletteBet, type SlotSym } from '../casino/Games';

/**
 * The casino's tables (the rules are src/casino/Games.ts): one overlay that shows the game you sat
 * down at. Stakes come off your cash when you bet and winnings go straight back on.
 */

export type CasinoGame = 'slots' | 'blackjack' | 'roulette' | 'poker';

export interface CasinoContext {
  game: CasinoGame;
  money: () => number;
  /** Takes the stake (false if you can't cover it). */
  spend: (n: number) => boolean;
  earn: (n: number) => void;
  onClose: () => void;
  /** Big wins (for a cheer and a toast in the room). */
  onWin?: (amount: number, what: string) => void;
}

const SLOT_ICON: Record<SlotSym, string> = { CHERRY: '🍒', LEMON: '🍋', BELL: '🔔', BAR: '▬', SEVEN: '7', STAR: '★' };
const BETS = [10, 50, 100, 500, 1000];

export class CasinoMenu {
  private readonly el: HTMLDivElement;
  private ctx: CasinoContext | null = null;
  private bet = 50;
  private note = '';
  private reels: SlotSym[] = ['SEVEN', 'BAR', 'CHERRY'];
  private spinning = 0;
  private bj: Blackjack | null = null;
  private vp: VideoPoker | null = null;
  private rBet: RouletteBet = { kind: 'red' };
  private rLast: number | null = null;
  private rHistory: number[] = [];

  constructor(parent: HTMLElement, private readonly rand: () => number = Math.random) {
    this.el = document.createElement('div');
    this.el.className = 'overlay shop casino';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b || b.disabled || !this.ctx) return;
      this.act(b.dataset['act'] ?? '', b.dataset['v'] ?? '');
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  open(ctx: CasinoContext): void {
    this.ctx = ctx;
    this.note = '';
    this.bj = null;
    this.vp = null;
    this.bet = Math.min(this.bet, Math.max(CASINO.minBet, ctx.money()));
    this.render();
    this.el.style.display = 'flex';
  }

  close(): void {
    if (!this.ctx) return;
    // A hand in progress: the stake stays on the table (it's lost), as at a real casino.
    this.el.style.display = 'none';
    const c = this.ctx;
    this.ctx = null;
    c.onClose();
  }

  private win(amount: number, what: string): void {
    const c = this.ctx!;
    if (amount > 0) c.earn(amount);
    if (amount >= this.bet * 10) c.onWin?.(amount, what);
  }

  private act(a: string, v: string): void {
    const c = this.ctx!;
    switch (a) {
      case 'close':
        this.close();
        return;
      case 'bet':
        this.bet = Number(v);
        break;
      case 'spin': {
        if (this.spinning) return;
        if (!c.spend(this.bet)) {
          this.note = "You can't cover that bet.";
          break;
        }
        const r = spinSlots(this.rand);
        this.spinning = 1;
        let ticks = 0;
        const roll = (): void => {
          ticks++;
          this.reels = ticks < 14 ? [r.line[0], r.line[1], r.line[2]].map((s, i) => (ticks < 6 + i * 4 ? CASINO.slots[Math.floor(this.rand() * CASINO.slots.length)].sym : s)) : r.line;
          if (ticks < 14) window.setTimeout(roll, 70);
          else {
            this.spinning = 0;
            const won = this.bet * r.mult;
            this.note = won > 0 ? `${r.line.map((s) => SLOT_ICON[s]).join(' ')}  pays $${won.toLocaleString('en-US')}!` : 'No luck. Again?';
            this.win(won, 'the slots');
          }
          this.render();
        };
        roll();
        return;
      }
      case 'deal':
        if (c.game === 'blackjack') {
          if (this.bj && !this.bj.done) return;
          if (!c.spend(this.bet)) {
            this.note = "You can't cover that bet.";
            break;
          }
          this.bj = this.bj ?? new Blackjack(this.rand);
          this.bj.deal(this.bet);
          this.note = '';
          if (this.bj.done) this.settleBlackjack();
        } else if (c.game === 'poker') {
          if (this.vp && this.vp.phase === 'deal') return;
          if (!c.spend(this.bet)) {
            this.note = "You can't cover that bet.";
            break;
          }
          this.vp = this.vp ?? new VideoPoker(this.rand);
          this.vp.deal(this.bet);
          this.note = 'Pick the cards to hold, then Draw.';
        }
        break;
      case 'hit':
        this.bj?.hit();
        if (this.bj?.done) this.settleBlackjack();
        break;
      case 'stand':
        this.bj?.stand();
        if (this.bj?.done) this.settleBlackjack();
        break;
      case 'double':
        if (this.bj && !this.bj.done && this.bj.player.length === 2) {
          if (!c.spend(this.bj.bet)) {
            this.note = "You can't cover the double.";
            break;
          }
          this.bj.double();
          this.settleBlackjack();
        }
        break;
      case 'hold':
        this.vp?.toggle(Number(v));
        break;
      case 'draw':
        if (this.vp?.phase === 'deal') {
          this.vp.draw();
          const won = this.vp.returned();
          this.note = this.vp.result === 'nothing' ? 'Nothing. Deal again?' : `${POKER_NAMES[this.vp.result!]}: $${won.toLocaleString('en-US')}`;
          this.win(won, POKER_NAMES[this.vp.result!]);
        }
        break;
      case 'rbet':
        this.rBet = JSON.parse(v) as RouletteBet;
        break;
      case 'rspin': {
        if (this.spinning) return;
        if (!c.spend(this.bet)) {
          this.note = "You can't cover that bet.";
          break;
        }
        const n = spinRoulette(this.rand);
        this.spinning = 1;
        let ticks = 0;
        const roll = (): void => {
          ticks++;
          this.rLast = ticks < 18 ? Math.floor(this.rand() * 37) : n;
          if (ticks < 18) window.setTimeout(roll, 50 + ticks * 8);
          else {
            this.spinning = 0;
            this.rHistory = [n, ...this.rHistory].slice(0, 10);
            const won = this.bet * rouletteReturn(this.rBet, n);
            this.note = `${n} ${n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black'}. ${won > 0 ? `You win $${won.toLocaleString('en-US')}!` : 'The house takes it.'}`;
            this.win(won, `roulette (${n})`);
          }
          this.render();
        };
        roll();
        return;
      }
    }
    this.render();
  }

  private settleBlackjack(): void {
    const b = this.bj!;
    const back = b.returned();
    const msg = { blackjack: 'Blackjack! Pays 3 to 2.', win: 'You win.', push: 'Push: your stake back.', lose: 'Dealer wins.', bust: 'Bust.' }[b.outcome!];
    this.note = `${msg}${back > 0 ? ` $${back.toLocaleString('en-US')} back.` : ''}`;
    this.win(back, 'blackjack');
  }

  private cards(cs: readonly Card[], hideSecond = false): string {
    return cs.map((c, i) => (hideSecond && i === 1 ? '<span class="pc back"></span>' : `<span class="pc ${c.suit === 1 || c.suit === 2 ? 'red' : ''}">${cardText(c)}</span>`)).join('');
  }

  private render(): void {
    const c = this.ctx;
    if (!c) return;
    const money = c.money();
    const busy = !!this.spinning || (c.game === 'blackjack' && !!this.bj && !this.bj.done) || (c.game === 'poker' && this.vp?.phase === 'deal');
    const bets = BETS.map((b) => `<button class="btn small ${b === this.bet ? 'primary' : ''}" data-act="bet" data-v="${b}" ${busy || b > CASINO.maxBet ? 'disabled' : ''}>$${b}</button>`).join('');
    let body = '';
    const title = { slots: 'Lucky Seven Slots', blackjack: 'Blackjack', roulette: 'Roulette', poker: 'Jacks or Better' }[c.game];
    if (c.game === 'slots') {
      body = `<div class="cas-reels ${this.spinning ? 'spin' : ''}">${this.reels.map((s) => `<div class="cas-reel">${SLOT_ICON[s]}</div>`).join('')}</div>
        <div class="cas-pay">${CASINO.slots
          .slice()
          .reverse()
          .map((s) => `${SLOT_ICON[s.sym]}×3 pays ${s.pay3}`)
          .join(' · ')} · two 🍒 pay 2</div>
        <button class="btn primary big" data-act="spin" ${this.spinning || money < this.bet ? 'disabled' : ''}>Pull the lever ($${this.bet})</button>`;
    } else if (c.game === 'blackjack') {
      const b = this.bj;
      const live = !!b && !b.done;
      body = b
        ? `<div class="cas-hand"><div class="cas-who">Dealer ${live ? '' : `(${handValue(b.dealer).total})`}</div><div class="cas-cards">${this.cards(b.dealer, live)}</div></div>
           <div class="cas-hand"><div class="cas-who">You (${handValue(b.player).total})${b.doubled ? ' · doubled' : ''}</div><div class="cas-cards">${this.cards(b.player)}</div></div>`
        : '<div class="cas-hand"><div class="cas-who">Dealer stands on 17 · Blackjack pays 3:2 · Double on any two cards</div></div>';
      body += live
        ? `<div class="cas-row"><button class="btn primary" data-act="hit">Hit</button><button class="btn" data-act="stand">Stand</button><button class="btn" data-act="double" ${b!.player.length !== 2 || money < b!.bet ? 'disabled' : ''}>Double</button></div>`
        : `<button class="btn primary big" data-act="deal" ${money < this.bet ? 'disabled' : ''}>Deal ($${this.bet})</button>`;
    } else if (c.game === 'roulette') {
      const opt = (label: string, bet: RouletteBet, cls = ''): string => `<button class="btn small ${cls} ${JSON.stringify(bet) === JSON.stringify(this.rBet) ? 'primary' : ''}" data-act="rbet" data-v='${JSON.stringify(bet)}' ${this.spinning ? 'disabled' : ''}>${label}</button>`;
      const n = this.rLast;
      body = `<div class="cas-wheel ${this.spinning ? 'spin' : ''}"><span class="cas-ball ${n === null ? '' : n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black'}">${n ?? '–'}</span></div>
        <div class="cas-hist">${this.rHistory.map((h) => `<span class="${h === 0 ? 'green' : RED_NUMBERS.has(h) ? 'red' : 'black'}">${h}</span>`).join('')}</div>
        <div class="cas-row">${opt('Red', { kind: 'red' }, 'rr')}${opt('Black', { kind: 'black' }, 'rb')}${opt('Odd', { kind: 'odd' })}${opt('Even', { kind: 'even' })}${opt('1–18', { kind: 'low' })}${opt('19–36', { kind: 'high' })}</div>
        <div class="cas-row">${opt('1st 12', { kind: 'dozen', n: 1 })}${opt('2nd 12', { kind: 'dozen', n: 2 })}${opt('3rd 12', { kind: 'dozen', n: 3 })}${opt('Zero (35:1)', { kind: 'number', n: 0 })}${opt('Lucky 7 (35:1)', { kind: 'number', n: 7 })}${opt('17 (35:1)', { kind: 'number', n: 17 })}</div>
        <button class="btn primary big" data-act="rspin" ${this.spinning || money < this.bet ? 'disabled' : ''}>Spin ($${this.bet})</button>`;
    } else {
      const vp = this.vp;
      const live = vp?.phase === 'deal';
      body = vp
        ? `<div class="cas-poker">${vp.hand.map((card, i) => `<button class="pcbtn ${vp.held[i] ? 'held' : ''}" data-act="hold" data-v="${i}" ${live ? '' : 'disabled'}>${this.cards([card])}<small>${vp.held[i] ? 'HELD' : live ? 'hold' : ''}</small></button>`).join('')}</div>`
        : '';
      body += `<div class="cas-pay">${Object.entries(POKER_PAYS)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${POKER_NAMES[k as keyof typeof POKER_NAMES]} ${v}`)
        .join(' · ')}</div>`;
      body += live ? '<button class="btn primary big" data-act="draw">Draw</button>' : `<button class="btn primary big" data-act="deal" ${money < this.bet ? 'disabled' : ''}>Deal ($${this.bet})</button>`;
    }
    this.el.innerHTML = `
      <div class="shop-panel cas-panel">
        <div class="shop-title cas-title">${title.toUpperCase()}</div>
        <div class="shop-money">Cash: $${money.toLocaleString('en-US')}</div>
        <div class="cas-row cas-bets">Bet: ${bets}</div>
        ${this.note ? `<div class="shop-note">${this.note}</div>` : ''}
        ${body}
        <button class="btn" data-act="close" ${busy && c.game !== 'blackjack' && c.game !== 'poker' ? 'disabled' : ''}>Leave the table (Esc)</button>
      </div>`;
  }
}
