import { typeInfo, type TypeId } from '../creatures/Data';
import type { CreatureIcons } from './CreatureIcons';
import type { ComputedStats, SlotName, SlotView, StreetmonInfo, VehicleStats } from '../systems/vehicleTuning.js';

/**
 * The Underground Chop Shop screen: your car's three mod slots, what's in them, the Streetmon you
 * could install (party and stash, with why a slot won't take some), and the car's stats before and
 * after. Keys: 1-3 pick a slot, Esc leaves.
 */

export interface ChopShopContext {
  carName: string;
  slots(): SlotView[];
  stats(): ComputedStats;
  /** Every Streetmon you could install, from party and stash. */
  candidates(): Array<StreetmonInfo & { where: 'party' | 'stash'; shiny: boolean }>;
  canSlot(slot: SlotName, id: string): { ok: boolean; reason?: string };
  slot(slot: SlotName, id: string): { ok: boolean; reason?: string };
  unslot(slot: SlotName): { ok: boolean; reason?: string };
  onClose(): void;
}

const badge = (t: string): string => {
  try {
    const i = typeInfo(t as TypeId);
    return `<span class="tbadge" style="background:${i.color}">${i.name}</span>`;
  } catch {
    return `<span class="tbadge">${t}</span>`;
  }
};
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const STAT_ROWS: Array<{ key: keyof VehicleStats; label: string; fmt(v: number): string }> = [
  { key: 'topSpeed', label: 'Top speed', fmt: (v) => `${Math.round(v * 3.6)} km/h` },
  { key: 'acceleration', label: 'Acceleration', fmt: (v) => `${v.toFixed(1)} m/s²` },
  { key: 'durability', label: 'Durability', fmt: (v) => `${Math.round(v)} HP` },
  { key: 'mass', label: 'Weight', fmt: (v) => `${Math.round(v)} kg` },
  { key: 'grip', label: 'Grip', fmt: (v) => v.toFixed(2) },
  { key: 'steering', label: 'Steering', fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'radarRange', label: 'Radar', fmt: (v) => `${Math.round(v)} m` },
];

export class ChopShopMenu {
  private readonly el: HTMLDivElement;
  private ctx: ChopShopContext | null = null;
  private sel: SlotName = 'engineBay';
  private note = '';

  constructor(
    parent: HTMLElement,
    private readonly icons: CreatureIcons,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay team chop';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!b || !this.ctx || (b as HTMLButtonElement).disabled) return;
      const act = b.dataset['act'];
      if (act === 'close') return this.close();
      if (act === 'slot') this.sel = b.dataset['slot'] as SlotName;
      else if (act === 'install') {
        const r = this.ctx.slot(this.sel, b.dataset['id']!);
        this.note = r.ok ? 'Installed.' : r.reason ?? 'That did not work.';
      } else if (act === 'remove') {
        const r = this.ctx.unslot(b.dataset['slot'] as SlotName);
        this.note = r.ok ? 'Taken out and back with your team.' : r.reason ?? '';
      }
      this.render();
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  open(ctx: ChopShopContext): void {
    this.ctx = ctx;
    this.note = '';
    this.el.style.display = 'flex';
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.style.display = 'none';
    const c = this.ctx;
    this.ctx = null;
    c?.onClose();
  }

  key(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'Escape') {
      this.close();
      return true;
    }
    const map: Record<string, SlotName> = { Digit1: 'engineBay', Digit2: 'trunk', Digit3: 'roofRack' };
    if (map[code]) {
      this.sel = map[code];
      this.render();
      return true;
    }
    return false;
  }

  private render(): void {
    const c = this.ctx;
    if (!c) return;
    const slots = c.slots();
    const stats = c.stats();
    const slotCard = (s: SlotView, i: number): string => {
      const mon = s.streetmon;
      const accepts = [...(s.accepts.types ?? []).map(badge), s.accepts.species?.length ? '<span class="tbadge aerial">Flying</span>' : ''].join('');
      const mods = Object.entries(s.modifiers)
        .map(([k, v]) => (k === 'radarRange' ? `+${v} m radar` : `${(v as number) >= 1 ? '+' : ''}${Math.round(((v as number) - 1) * 100)}% ${STAT_ROWS.find((r) => r.key === k)?.label.toLowerCase() ?? k}`))
        .join(', ');
      const ab = s.ability;
      return `<button class="cs-slot ${this.sel === s.slot ? 'sel' : ''}" data-act="slot" data-slot="${s.slot}">
        <div class="cs-slot-head"><kbd>${i + 1}</kbd> <b>${s.label}</b> <span class="cs-accepts">${accepts}</span></div>
        ${
          mon
            ? `<div class="cs-mon">${this.icons.img(mon.speciesId, false, 'cicon')}<div><b>${esc(mon.name ?? mon.speciesId)}</b> Lv ${mon.level} ${mon.types.map(badge).join('')}
                 <div class="cs-mods">${esc(mods)}</div></div><span class="btn small cs-remove" data-act="remove" data-slot="${s.slot}">Remove</span></div>
               ${ab ? `<div class="cs-ability"><b>${esc(ab.name)}</b>${ab.input ? ` <kbd>${ab.input.label}</kbd>` : ab.trigger === 'collision' ? ' <i>on crashes</i>' : ' <i>always on</i>'}${ab.trigger !== 'passive' ? ` · ${ab.cooldown.toFixed(1)} s cooldown` : ''}<div>${esc(ab.description)}</div></div>` : ''}
`
            : '<div class="cs-empty">Empty</div>'
        }
      </button>`;
    };
    const cands = c.candidates();
    const list = cands
      .map((m) => {
        const can = c.canSlot(this.sel, m.id);
        return `<div class="tm-row cs-cand ${can.ok ? '' : 'no'}">${this.icons.img(m.speciesId, m.shiny, 'cicon')}
          <div class="cs-cand-info"><b>${esc(m.name ?? m.speciesId)}</b> Lv ${m.level} ${m.types.map(badge).join('')} <span class="cs-where">${m.where}</span>
          ${can.ok ? '' : `<div class="cs-why">${esc(can.reason ?? '')}</div>`}</div>
          <button class="btn small" data-act="install" data-id="${m.id}" ${can.ok ? '' : 'disabled'}>Install</button></div>`;
      })
      .join('');
    const rows = STAT_ROWS.map((r) => {
      const b = stats.base[r.key];
      const f = stats.final[r.key];
      const diff = Math.abs(f - b) > 1e-6;
      const better = r.key === 'mass' ? f < b : f > b;
      return `<tr><td>${r.label}</td><td>${r.fmt(b)}</td><td class="${diff ? (better ? 'up' : 'down') : ''}">${r.fmt(f)}</td></tr>`;
    }).join('');
    const selLabel = slots.find((s) => s.slot === this.sel)?.label ?? '';
    this.el.innerHTML = `
      <div class="tm-panel cs-panel">
        <div class="tm-head">
          <div class="tm-sname">UNDERGROUND CHOP SHOP</div>
          <div class="tm-bag">${esc(c.carName)}: slot Streetmon into the car. They ride along until you take them out.</div>
          <button class="btn small" data-act="close">Drive out (Esc)</button>
        </div>
        ${this.note ? `<div class="tm-hint">${esc(this.note)}</div>` : ''}
        <div class="cs-body">
          <div class="cs-slots">${slots.map(slotCard).join('')}
            <table class="cs-stats"><tr><th></th><th>Stock</th><th>Tuned</th></tr>${rows}</table>
          </div>
          <div class="cs-list"><div class="cs-list-head">Install in the <b>${selLabel}</b></div>${list || '<div class="cs-empty">No Streetmon with you.</div>'}</div>
        </div>
      </div>`;
  }
}
