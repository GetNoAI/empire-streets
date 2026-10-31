import { LEVEL_CAP, magazine, maxHp, stats, xpForLevel, displayName, type Creature } from '../creatures/Creature';
import { DATA, move, species, typeInfo, type TypeId } from '../creatures/Data';
import { itemEvolution } from '../creatures/Progression';
import { PARTY_SIZE, type Party } from '../creatures/Party';
import type { Bag } from '../creatures/Bag';
import type { CreatureIcons } from './CreatureIcons';

/**
 * Team screen: party of 6 and the stash, with a summary of the selected creature (stats, XP,
 * moves, ammo, where it was caught) and actions: make lead, move to/from the stash, swap places.
 */

const badge = (t: TypeId): string => `<span class="tbadge" style="background:${typeInfo(t).color}">${typeInfo(t).name}</span>`;

export class TeamScreen {
  private readonly el: HTMLDivElement;
  private tab: 'party' | 'stash' = 'party';
  private sel: { where: 'party' | 'stash'; i: number } = { where: 'party', i: 0 };
  /** Picking a second creature to swap with. */
  private swapFrom: { where: 'party' | 'stash'; i: number } | null = null;
  private onClose: (() => void) | null = null;
  /** A line under the header (why a field item can't be used here). */
  private note = '';

  constructor(
    parent: HTMLElement,
    private readonly party: Party,
    private readonly bag: Bag,
    private readonly icons: CreatureIcons,
    /** Use an evolution item on a creature (evolves into `to`). */
    private readonly onUseItem?: (c: Creature, itemId: string, to: string) => void,
    /** Use a field item (the Escape Rope). Returns a note to show if it can't be used now, or null when it was used. */
    private readonly onUseField?: (itemId: string) => string | null,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay team';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const f = t.closest('[data-field]') as HTMLButtonElement | null;
      if (f && !f.disabled) {
        const note = this.onUseField?.(f.dataset['field']!) ?? null;
        if (note === null) this.close();
        else {
          this.note = note;
          this.render();
        }
        return;
      }
      const b = t.closest('[data-act]') as HTMLElement | null;
      if (!b || (b as HTMLButtonElement).disabled) return;
      this.act(b.dataset['act']!, b.dataset['where'] as 'party' | 'stash' | undefined, Number(b.dataset['i'] ?? -1));
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  open(onClose: () => void): void {
    this.onClose = onClose;
    this.tab = 'party';
    this.note = '';
    this.sel = { where: 'party', i: 0 };
    this.swapFrom = null;
    this.el.style.display = 'flex';
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.style.display = 'none';
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  private list(where: 'party' | 'stash'): Creature[] {
    return where === 'party' ? this.party.members : this.party.stash;
  }

  private act(a: string, where: 'party' | 'stash' | undefined, i: number): void {
    const p = this.party;
    switch (a) {
      case 'close':
        this.close();
        return;
      case 'tab':
        this.tab = where ?? 'party';
        if (this.list(this.tab).length) this.sel = { where: this.tab, i: 0 };
        break;
      case 'pick':
        if (where === undefined) break;
        if (this.swapFrom) {
          const f = this.swapFrom;
          this.swapFrom = null;
          if (f.where === 'party' && where === 'party') p.swap(f.i, i);
          else if (f.where === 'party' && where === 'stash') p.swapWithStash(f.i, i);
          else if (f.where === 'stash' && where === 'party') p.swapWithStash(i, f.i);
          this.sel = { where, i };
        } else this.sel = { where, i };
        break;
      case 'lead':
        if (this.sel.where === 'party') {
          p.makeLead(this.sel.i);
          this.sel = { where: 'party', i: 0 };
        }
        break;
      case 'stash':
        if (this.sel.where === 'party' && p.toStash(this.sel.i)) this.sel = { where: 'party', i: Math.min(this.sel.i, p.members.length - 1) };
        break;
      case 'unstash':
        if (this.sel.where === 'stash' && p.fromStash(this.sel.i)) this.sel = { where: 'party', i: p.members.length - 1 };
        break;
      case 'swap':
        this.swapFrom = { ...this.sel };
        break;
      case 'cancel':
        this.swapFrom = null;
        break;
      case 'use': {
        const c = this.list(this.sel.where)[this.sel.i];
        const itemId = (this.el.querySelector(`[data-act="use"][data-i="${i}"]`) as HTMLElement | null)?.dataset['item'];
        const evo = c && itemId ? itemEvolution(c, itemId) : null;
        if (c && itemId && evo && this.onUseItem) {
          this.onUseItem(c, itemId, evo.to);
          return;
        }
        break;
      }
    }
    this.render();
  }

  key(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'Escape' || code === 'KeyI') {
      if (this.swapFrom) this.act('cancel', undefined, -1);
      else this.close();
      return true;
    }
    const n = code.startsWith('Digit') ? Number(code.slice(5)) : 0;
    if (n >= 1 && n <= 6 && this.list(this.tab)[n - 1]) {
      this.act('pick', this.tab, n - 1);
      return true;
    }
    return false;
  }

  private render(): void {
    const p = this.party;
    const items = this.bag.captures().map((e) => `${e.item.name} x${e.count}`).join(' · ') || 'No capture items';
    const field = [...DATA.items.values()]
      .filter((it) => it.kind === 'field' && this.bag.count(it.id) > 0)
      .map((it) => `<button class="btn small" data-field="${it.id}" title="${it.description}">Use ${it.name} (${this.bag.count(it.id)})</button>`)
      .join('');
    const rows = (where: 'party' | 'stash'): string => {
      const l = this.list(where);
      if (!l.length) return `<div class="tm-empty">${where === 'party' ? 'No Streetmon yet.' : 'The stash is empty. Creatures you catch with a full party go here.'}</div>`;
      return l
        .map((c, i) => {
          const mx = maxHp(c);
          const f = c.hp / mx;
          const sel = this.sel.where === where && this.sel.i === i;
          const swap = this.swapFrom && this.swapFrom.where === where && this.swapFrom.i === i;
          return `<button class="tm-row ${sel ? 'sel' : ''} ${swap ? 'swapfrom' : ''} ${c.hp <= 0 ? 'fainted' : ''}" data-act="pick" data-where="${where}" data-i="${i}">
            ${this.icons.img(c.speciesId, c.shiny)}
            <div class="tm-info"><div class="tm-name">${displayName(c)}${c.shiny ? ' <span class="shiny">★</span>' : ''}${where === 'party' && i === 0 ? ' <span class="tm-lead">LEAD</span>' : ''} <span class="b-lv">Lv ${c.level}</span></div>
            <div>${species(c.speciesId).types.map(badge).join('')}</div>
            <div class="b-hp"><div class="b-hpfill" style="width:${(f * 100).toFixed(0)}%;background:${f > 0.5 ? '#4cd964' : f > 0.2 ? '#ffcc00' : '#ff3b30'}"></div></div>
            <div class="tm-hp">${c.hp}/${mx}${c.status === 'choking' ? ' · choking' : ''}</div></div>
            ${where === 'party' ? `<kbd>${i + 1}</kbd>` : ''}</button>`;
        })
        .join('');
    };
    const c = this.list(this.sel.where)[this.sel.i] ?? null;
    this.el.innerHTML = `
      <div class="tm-panel">
        <div class="tm-head">
          <div class="tm-tabs">
            <button class="tm-tab ${this.tab === 'party' ? 'on' : ''}" data-act="tab" data-where="party">Party ${p.members.length}/${PARTY_SIZE}</button>
            <button class="tm-tab ${this.tab === 'stash' ? 'on' : ''}" data-act="tab" data-where="stash">Stash ${p.stash.length}</button>
          </div>
          <div class="tm-bag">${items}</div>
          ${field}
          <button class="btn small" data-act="close">Close (I)</button>
        </div>
        ${this.note ? `<div class="tm-hint">${this.note}</div>` : ''}
        ${this.swapFrom ? `<div class="tm-hint">Pick who to swap ${displayName(this.list(this.swapFrom.where)[this.swapFrom.i])} with (party or stash). <button class="btn small" data-act="cancel">Cancel</button></div>` : ''}
        <div class="tm-body">
          <div class="tm-list">${rows(this.tab)}</div>
          <div class="tm-sum">${c ? this.summary(c) : ''}</div>
        </div>
      </div>`;
  }

  private summary(c: Creature): string {
    const sp = species(c.speciesId);
    const st = stats(c);
    const next = c.level >= LEVEL_CAP ? null : xpForLevel(sp.growth, c.level + 1);
    const cur = xpForLevel(sp.growth, c.level);
    const xpFrac = next === null ? 1 : (c.xp - cur) / Math.max(1, next - cur);
    const statRow = (k: 'hp' | 'attack' | 'defense' | 'speed' | 'loud', label: string): string =>
      `<div class="tm-stat"><span>${label}</span><b>${k === 'hp' ? `${c.hp}/${st.hp}` : st[k]}</b><i style="width:${Math.min(100, (sp.base[k] / 130) * 100)}%"></i></div>`;
    const mag = magazine(c);
    const p = this.party;
    const inParty = this.sel.where === 'party';
    return `
      <div class="tm-sum-head">${this.icons.img(c.speciesId, c.shiny, 'cicon big')}
        <div><div class="tm-sname">${displayName(c)}${c.shiny ? ' <span class="shiny">★ shiny</span>' : ''}</div>
        <div>#${String(sp.dex).padStart(3, '0')} ${sp.name} · Lv ${c.level} · ${sp.types.map(badge).join('')}</div>
        <div class="tm-desc">${sp.description}</div></div></div>
      <div class="tm-xp"><span>XP ${c.xp}${next !== null ? ` / ${next}` : ' (max level)'}</span><div class="b-hp"><div class="b-hpfill" style="width:${(xpFrac * 100).toFixed(0)}%;background:#59b6ff"></div></div></div>
      <div class="tm-stats">${statRow('hp', 'HP')}${statRow('attack', 'Attack')}${statRow('defense', 'Defense')}${statRow('speed', 'Speed')}${statRow('loud', 'Loud')}</div>
      ${mag ? `<div class="tm-ammo">Ammo ${c.ammo}/${mag}</div>` : ''}
      <div class="tm-moves">${c.moves
        .map((id) => {
          const m = move(id);
          return `<div class="tm-move" style="--tc:${typeInfo(m.type).color}"><b>${m.name}</b> ${badge(m.type)}<small>${m.power ? `Pow ${m.power}` : 'Status'} · ${m.accuracy === null ? 'never misses' : `Acc ${m.accuracy}`}${m.ammo ? ` · ${m.ammo} rd` : ''}${m.target === 'allFoes' ? ' · all foes' : ''}</small>${m.description ? `<p>${m.description}</p>` : ''}</div>`;
        })
        .join('')}</div>
      ${c.origin ? `<div class="tm-origin">Caught in ${c.origin.district} at Lv ${c.origin.level}.</div>` : ''}
      <div class="tm-actions">
        ${inParty ? `<button class="btn small" data-act="lead" ${this.sel.i === 0 ? 'disabled' : ''}>Make lead</button>` : ''}
        ${inParty ? `<button class="btn small" data-act="stash" ${p.members.length <= 1 ? 'disabled' : ''}>Move to stash</button>` : `<button class="btn small" data-act="unstash" ${p.members.length >= PARTY_SIZE ? 'disabled' : ''}>Move to party</button>`}
        <button class="btn small" data-act="swap">Swap with…</button>
        ${[...this.bag.counts.keys()]
          .filter((id) => DATA.items.get(id)?.kind === 'evolution' && itemEvolution(c, id))
          .map((id, k) => `<button class="btn small primary" data-act="use" data-i="${k}" data-item="${id}">Use ${DATA.items.get(id)!.name} (evolves into ${species(itemEvolution(c, id)!.to).name})</button>`)
          .join('')}
      </div>`;
  }
}
