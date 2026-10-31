import { LEVEL_CAP, magazine, maxHp, xpForLevel, displayName } from '../creatures/Creature';
import { species, typeInfo } from '../creatures/Data';
import type { Party } from '../creatures/Party';
import type { CreatureIcons } from './CreatureIcons';

/**
 * Always-on party bar (right side, under the cash and clock): each creature's portrait, level,
 * HP bar, XP bar, status and, for Gun types, an ammo counter. The lead is highlighted.
 */
export class PartyBar {
  private readonly el: HTMLDivElement;
  private last = '';

  constructor(
    parent: HTMLElement,
    private readonly icons: CreatureIcons,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'party-bar';
    parent.appendChild(this.el);
  }

  update(party: Party, visible: boolean): void {
    if (!visible || !party.members.length) {
      if (this.last !== '') {
        this.el.innerHTML = '';
        this.last = '';
      }
      return;
    }
    // Rebuild only when something shown changed.
    const key = party.members.map((c) => `${c.uid}|${c.speciesId}|${c.level}|${c.hp}|${c.xp}|${c.ammo}|${c.status}`).join(';');
    if (key === this.last) return;
    this.last = key;
    this.el.innerHTML = party.members
      .map((c, i) => {
        const sp = species(c.speciesId);
        const mx = maxHp(c);
        const f = c.hp / mx;
        const lo = xpForLevel(sp.growth, c.level);
        const hi = c.level >= LEVEL_CAP ? lo + 1 : xpForLevel(sp.growth, c.level + 1);
        const xf = c.level >= LEVEL_CAP ? 1 : (c.xp - lo) / Math.max(1, hi - lo);
        const mag = magazine(c);
        const t = typeInfo(sp.types[0]);
        return `<div class="pb-row ${i === 0 ? 'lead' : ''} ${c.hp <= 0 ? 'fainted' : ''}" style="--tc:${t.color}">
          ${this.icons.img(c.speciesId, c.shiny, 'pb-icon')}
          <div class="pb-main">
            <div class="pb-name">${displayName(c)}<span>Lv ${c.level}</span>${c.status === 'choking' ? '<em>CHK</em>' : ''}</div>
            <div class="pb-hp"><i style="width:${(f * 100).toFixed(0)}%;background:${f > 0.5 ? '#4cd964' : f > 0.2 ? '#ffcc00' : '#ff3b30'}"></i></div>
            <div class="pb-xp"><i style="width:${(xf * 100).toFixed(0)}%"></i></div>
          </div>
          ${mag ? `<div class="pb-ammo" title="Ammo">${c.ammo}<small>/${mag}</small></div>` : ''}
        </div>`;
      })
      .join('');
  }
}
