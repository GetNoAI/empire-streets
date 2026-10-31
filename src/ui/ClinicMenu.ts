import { DATA } from '../creatures/Data';
import { CLINIC_NAME } from '../creatures/Clinics';
import type { Bag } from '../creatures/Bag';

export interface ClinicContext {
  bag: Bag;
  money: () => number;
  spend: (n: number) => boolean;
  /** Heal fee (0 = nothing to heal), and the heal action. Leave out for a shop with no healing. */
  healFee?: () => number;
  heal?: () => string;
  onClose: () => void;
  onTeam: () => void;
  /** A different counter: its own title and stock (item id + price) instead of the clinic's. */
  title?: string;
  stock?: Array<{ id: string; price: number }>;
  /** Capture items aren't sold yet: the reason shown instead (Mama Rust hands out the first cuffs). */
  captureLocked?: string;
}

/** Corner Clinic counter: heal the team, buy Cuffs, Crates and Nets. */
export class ClinicMenu {
  private readonly el: HTMLDivElement;
  private ctx: ClinicContext | null = null;
  private note = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'overlay shop clinic';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b || b.disabled || !this.ctx) return;
      const act = b.dataset['act'];
      const c = this.ctx;
      if (act === 'close') {
        this.close();
        return;
      } else if (act === 'heal' && c.heal) this.note = c.heal();
      else if (act === 'team') {
        this.close();
        c.onTeam();
        return;
      } else if (act === 'buy') {
        const it = this.stock().find((i) => i.id === b.dataset['id']);
        const n = Number(b.dataset['n'] ?? 1);
        if (it && c.spend(it.price * n)) {
          c.bag.add(it.id, n);
          this.note = `Bought ${n} ${it.name}${n > 1 ? 's' : ''}.`;
        }
      }
      this.render();
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  open(ctx: ClinicContext): void {
    this.ctx = ctx;
    this.note = '';
    this.render();
    this.el.style.display = 'flex';
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.style.display = 'none';
    const c = this.ctx;
    this.ctx = null;
    c?.onClose();
  }

  /** What's for sale here, at this counter's prices. */
  private stock(): Array<{ id: string; name: string; description: string; kind: string; price: number }> {
    const c = this.ctx!;
    const all = c.stock ? c.stock.map((s) => ({ ...DATA.items.get(s.id)!, price: s.price })) : [...DATA.items.values()].filter((it) => it.price > 0);
    return c.captureLocked ? all.filter((it) => it.kind !== 'capture') : all;
  }

  private render(): void {
    const c = this.ctx!;
    const money = c.money();
    const fee = c.healFee ? c.healFee() : -1;
    const rows = this.stock()
      .map(
        (it) => `<tr><td class="wname">${it.name}<div class="idesc">${it.description}</div></td><td><span class="ammo">have ${c.bag.count(it.id)}</span></td>
        <td><button class="btn small" data-act="buy" data-id="${it.id}" data-n="1" ${money < it.price ? 'disabled' : ''}>1 for $${it.price}</button></td>
        <td>${it.kind === 'capture' ? `<button class="btn small" data-act="buy" data-id="${it.id}" data-n="5" ${money < it.price * 5 ? 'disabled' : ''}>5 for $${it.price * 5}</button>` : ''}</td></tr>`,
      )
      .join('');
    this.el.innerHTML = `
      <div class="shop-panel">
        <div class="shop-title clinic-title">${(c.title ?? CLINIC_NAME).toUpperCase()}</div>
        <div class="shop-money">Cash: $${money.toLocaleString('en-US')}</div>
        ${
          fee >= 0
            ? `<div class="clinic-heal">
          <button class="btn primary" data-act="heal" ${fee <= 0 ? 'disabled' : ''}>${fee > 0 ? `Heal your team ($${fee})` : 'Your team is healthy'}</button>
          <button class="btn" data-act="team">Team</button>
        </div>`
            : ''
        }
        ${this.note ? `<div class="shop-note">${this.note}</div>` : ''}
        ${c.captureLocked ? `<div class="shop-note">${c.captureLocked}</div>` : ''}
        <table class="shop-table">${rows}</table>
        <button class="btn" data-act="close">Leave (Esc)</button>
      </div>`;
  }
}
