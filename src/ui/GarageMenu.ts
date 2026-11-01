import { CLASS_COLORS, MAX_LEVEL, UPGRADE_INFO, UPGRADE_PARTS, type CarClass, type UpgradeLevels, type UpgradePart } from '../vehicles/Performance';

/**
 * Two screens on one panel:
 *  - the showroom (Empire Motors): every car for sale with its class, numbers and price, and
 *    your own cars to sell back;
 *  - parts and repairs (the Chop Shop lift): bolt-on upgrades for the car on the lift, a repair
 *    bill, and a respray.
 * Esc leaves.
 */

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export interface CarListing {
  id: string;
  name: string;
  blurb: string;
  cls: CarClass;
  index: number;
  topSpeedKmh: number;
  /** 0-100 km/h in seconds (estimated). */
  zeroToHundred: number;
  drive: string;
  seats: number;
  price: number;
  colors: string[];
}

export interface OwnedListing {
  id: string;
  name: string;
  cls: CarClass;
  color: string;
  /** Sell-back value. */
  value: number;
  /** Parked here (sellable now). */
  here: boolean;
  upgrades: number;
}

export interface DealerContext {
  money(): number;
  forSale(): CarListing[];
  owned(): OwnedListing[];
  buy(specId: string, color: string): { ok: boolean; reason?: string };
  sell(id: string): { ok: boolean; reason?: string; cash?: number };
  onClose(): void;
}

export interface PartsContext {
  carName: string;
  cls(): CarClass;
  index(): number;
  money(): number;
  levels(): UpgradeLevels;
  price(part: UpgradePart): number;
  buy(part: UpgradePart): { ok: boolean; reason?: string };
  /** Health now, the maximum, and what a repair costs (0: nothing to fix). */
  health(): { hp: number; max: number; cost: number };
  repair(): { ok: boolean; reason?: string };
  colors: string[];
  color(): string;
  respray(color: string): { ok: boolean; reason?: string };
  resprayCost: number;
  /** Lines for the stats table (label, stock, now). */
  stats(): Array<[string, string, string]>;
  onClose(): void;
}

export class GarageMenu {
  private readonly el: HTMLDivElement;
  private dealer: DealerContext | null = null;
  private parts: PartsContext | null = null;
  private note = '';
  private sel = 0;
  private tab: 'buy' | 'sell' = 'buy';
  private color = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'overlay team chop garage';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!b || (b as HTMLButtonElement).disabled) return;
      const act = b.dataset['act'];
      if (act === 'close') return this.close();
      if (act === 'tab') {
        this.tab = b.dataset['tab'] as 'buy' | 'sell';
        this.sel = 0;
        this.color = 0;
      } else if (act === 'pick') {
        this.sel = Number(b.dataset['i']);
        this.color = 0;
      } else if (act === 'color') this.color = Number(b.dataset['i']);
      else if (act === 'buy' && this.dealer) {
        const car = this.dealer.forSale()[this.sel];
        if (car) {
          const r = this.dealer.buy(car.id, car.colors[this.color % car.colors.length]);
          this.note = r.ok ? `${car.name} is yours. It's waiting in the delivery bay.` : r.reason ?? '';
        }
      } else if (act === 'sell' && this.dealer) {
        const r = this.dealer.sell(b.dataset['id']!);
        this.note = r.ok ? `Sold for ${money(r.cash ?? 0)}.` : r.reason ?? '';
      } else if (act === 'part' && this.parts) {
        const r = this.parts.buy(b.dataset['part'] as UpgradePart);
        this.note = r.ok ? 'Fitted.' : r.reason ?? '';
      } else if (act === 'repair' && this.parts) {
        const r = this.parts.repair();
        this.note = r.ok ? 'Good as new.' : r.reason ?? '';
      } else if (act === 'respray' && this.parts) {
        const r = this.parts.respray(b.dataset['color']!);
        this.note = r.ok ? 'Fresh paint.' : r.reason ?? '';
      }
      this.render();
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  openDealer(ctx: DealerContext): void {
    this.dealer = ctx;
    this.parts = null;
    this.tab = 'buy';
    this.sel = 0;
    this.color = 0;
    this.note = '';
    this.el.style.display = 'flex';
    this.render();
  }

  openParts(ctx: PartsContext): void {
    this.parts = ctx;
    this.dealer = null;
    this.note = '';
    this.el.style.display = 'flex';
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.style.display = 'none';
    const d = this.dealer;
    const p = this.parts;
    this.dealer = null;
    this.parts = null;
    d?.onClose();
    p?.onClose();
  }

  key(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'Escape') {
      this.close();
      return true;
    }
    const n = /^Digit(\d)$/.exec(code);
    if (n && this.dealer && this.tab === 'buy') {
      const i = Number(n[1]) - 1;
      if (i >= 0 && i < this.dealer.forSale().length) {
        this.sel = i;
        this.color = 0;
        this.render();
      }
      return true;
    }
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      if (this.dealer && this.tab === 'buy') {
        const car = this.dealer.forSale()[this.sel];
        if (car) this.color = (this.color + (code === 'ArrowRight' ? 1 : car.colors.length - 1)) % car.colors.length;
        this.render();
      }
      return true;
    }
    if (code === 'Enter' && this.dealer && this.tab === 'buy') {
      const car = this.dealer.forSale()[this.sel];
      if (car) {
        const r = this.dealer.buy(car.id, car.colors[this.color % car.colors.length]);
        this.note = r.ok ? `${car.name} is yours. It's waiting in the delivery bay.` : r.reason ?? '';
        this.render();
      }
      return true;
    }
    return false;
  }

  private cls(c: CarClass): string {
    return `<span class="car-class" style="background:${CLASS_COLORS[c]}">${c}</span>`;
  }

  private render(): void {
    if (this.dealer) this.renderDealer(this.dealer);
    else if (this.parts) this.renderParts(this.parts);
  }

  private renderDealer(d: DealerContext): void {
    const cars = d.forSale();
    const sel = cars[Math.min(this.sel, cars.length - 1)];
    const cash = d.money();
    let body = '';
    if (this.tab === 'buy' && sel) {
      const list = cars
        .map(
          (c, i) =>
            `<button class="gm-row ${i === this.sel ? 'sel' : ''}" data-act="pick" data-i="${i}"><kbd>${i + 1}</kbd> ${this.cls(c.cls)} <b>${esc(c.name)}</b><span class="gm-price ${c.price > cash ? 'no' : ''}">${money(c.price)}</span></button>`,
        )
        .join('');
      const swatches = sel.colors.map((col, i) => `<button class="gm-swatch ${i === this.color % sel.colors.length ? 'sel' : ''}" data-act="color" data-i="${i}" style="background:${col}" title="${col}"></button>`).join('');
      const can = sel.price <= cash;
      body = `<div class="gm-body">
        <div class="gm-list">${list}</div>
        <div class="gm-detail">
          <div class="gm-title">${this.cls(sel.cls)} <b>${esc(sel.name)}</b> <span class="gm-pi">PI ${Math.round(sel.index)}</span></div>
          <p class="gm-blurb">${esc(sel.blurb)}</p>
          <table class="cs-stats">
            <tr><td>Top speed</td><td>${sel.topSpeedKmh} km/h</td></tr>
            <tr><td>0-100 km/h</td><td>${sel.zeroToHundred.toFixed(1)} s</td></tr>
            <tr><td>Drive</td><td>${sel.drive.toUpperCase()}</td></tr>
            <tr><td>Seats</td><td>${sel.seats}</td></tr>
          </table>
          <div class="gm-colors">Colour: ${swatches} <small>&larr; &rarr;</small></div>
          <button class="btn primary" data-act="buy" ${can ? '' : 'disabled'}>Buy for ${money(sel.price)} (Enter)</button>
          ${can ? '' : `<div class="cs-why">You have ${money(cash)}.</div>`}
        </div>
      </div>`;
    } else {
      const own = d.owned();
      body = `<div class="gm-body"><div class="gm-list wide">${
        own.length
          ? own
              .map(
                (o) =>
                  `<div class="gm-row static">${this.cls(o.cls)} <span class="gm-swatch tiny" style="background:${o.color}"></span><b>${esc(o.name)}</b>${o.upgrades ? ` <small>${o.upgrades} parts</small>` : ''}<span class="gm-price">${money(o.value)}</span>
                   <button class="btn small" data-act="sell" data-id="${esc(o.id)}" ${o.here ? '' : 'disabled'} title="${o.here ? '' : 'Bring it here to sell it'}">Sell</button></div>`,
              )
              .join('')
          : '<div class="cs-empty">You own no cars. Buy one, or keep one at the Chop Shop.</div>'
      }</div><div class="gm-detail"><p class="gm-blurb">We pay ${Math.round(60)}% of what a car and its parts cost new. Park it in a bay out front to sell it; the Streetmon riding in it go back to your team.</p></div></div>`;
    }
    this.el.innerHTML = `
      <div class="tm-panel cs-panel">
        <div class="tm-head">
          <div class="tm-sname">EMPIRE MOTORS</div>
          <div class="tm-bag">Cash: <b>${money(cash)}</b></div>
          <div class="gm-tabs"><button class="btn small ${this.tab === 'buy' ? 'primary' : ''}" data-act="tab" data-tab="buy">Showroom</button><button class="btn small ${this.tab === 'sell' ? 'primary' : ''}" data-act="tab" data-tab="sell">Sell a car</button></div>
          <button class="btn small" data-act="close">Leave (Esc)</button>
        </div>
        ${this.note ? `<div class="tm-hint">${esc(this.note)}</div>` : ''}
        ${body}
      </div>`;
  }

  private renderParts(p: PartsContext): void {
    const lv = p.levels();
    const cash = p.money();
    const h = p.health();
    const rows = UPGRADE_PARTS.map((part) => {
      const info = UPGRADE_INFO[part];
      const l = lv[part];
      const price = p.price(part);
      const next = l < MAX_LEVEL ? info.levels[l] : null;
      const pips = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
      return `<div class="gm-part"><div><b>${info.name}</b> <span class="gm-pips">${pips}</span><div class="gm-blurb small">${esc(info.blurb)}${l > 0 ? ` <i>Fitted: ${esc(info.levels[l - 1])}.</i>` : ''}</div></div>
        ${next ? `<button class="btn small" data-act="part" data-part="${part}" ${price <= cash ? '' : 'disabled'}>${esc(next)} · ${money(price)}</button>` : '<span class="gm-max">Maxed</span>'}</div>`;
    }).join('');
    const stats = p
      .stats()
      .map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td class="${b !== c ? 'up' : ''}">${esc(c)}</td></tr>`)
      .join('');
    const swatches = p.colors.map((col) => `<button class="gm-swatch ${col === p.color() ? 'sel' : ''}" data-act="respray" data-color="${col}" style="background:${col}" title="Respray ${col}"></button>`).join('');
    this.el.innerHTML = `
      <div class="tm-panel cs-panel">
        <div class="tm-head">
          <div class="tm-sname">PARTS &amp; BODY SHOP</div>
          <div class="tm-bag">${this.cls(p.cls())} <b>${esc(p.carName)}</b> · PI ${Math.round(p.index())} · Cash <b>${money(cash)}</b></div>
          <button class="btn small" data-act="close">Back (Esc)</button>
        </div>
        ${this.note ? `<div class="tm-hint">${esc(this.note)}</div>` : ''}
        <div class="gm-body">
          <div class="gm-list wide">${rows}</div>
          <div class="gm-detail">
            <table class="cs-stats"><tr><th></th><th>Stock</th><th>Now</th></tr>${stats}</table>
            <div class="gm-repair"><b>Bodywork</b> ${Math.round((h.hp / h.max) * 100)}%
              ${h.cost > 0 ? `<button class="btn small" data-act="repair" ${h.cost <= cash ? '' : 'disabled'}>Repair · ${money(h.cost)}</button>` : '<span class="gm-max">No damage</span>'}</div>
            <div class="gm-colors">Respray (${money(p.resprayCost)}): ${swatches}</div>
          </div>
        </div>
      </div>`;
  }
}
