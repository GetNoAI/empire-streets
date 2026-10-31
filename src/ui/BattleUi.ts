import type { Battle, Combatant } from '../creatures/BattleEngine';
import { magazine, maxHp, type Creature, displayName } from '../creatures/Creature';
import { move, species, typeInfo, type MoveSpec, type TypeId } from '../creatures/Data';
import type { CreatureIcons } from './CreatureIcons';

/**
 * Battle screen (DOM over the 3D scene): foe and player cards with type badges, HP bars, ammo
 * and status; the message box; and the action menus (Fight / Team / Bag / Run). In real-time
 * mode it shows a compact move bar with hotkeys and cooldown fill instead of menus.
 */

export type MenuChoice =
  | { kind: 'move'; moveId: string }
  | { kind: 'item'; itemId: string }
  | { kind: 'switch'; index: number }
  | { kind: 'bag' }
  | { kind: 'run' };

const badge = (t: TypeId): string => `<span class="tbadge" style="background:${typeInfo(t).color}">${typeInfo(t).name}</span>`;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class BattleUi {
  private readonly root: HTMLDivElement;
  private readonly foes: HTMLDivElement;
  private readonly mine: HTMLDivElement;
  private readonly msg: HTMLDivElement;
  private readonly menu: HTMLDivElement;
  private readonly rtBar: HTMLDivElement;
  private battle: Battle | null = null;
  /** HP shown on the bars (animated toward the real value as events play). */
  readonly shownHp = new Map<Combatant, number>();
  private onChoice: ((c: MenuChoice) => void) | null = null;
  private menuMode: 'none' | 'main' | 'fight' | 'team' | 'forced' | 'bag' | 'learn' = 'none';
  private learnCb: ((slot: number) => void) | null = null;
  private learnMove = '';
  private learnCreature: Creature | null = null;
  private bagItems: Array<{ id: string; name: string; count: number; chance: number }> = [];
  realtime = false;

  constructor(
    parent: HTMLElement,
    private readonly icons?: CreatureIcons,
  ) {
    const div = (cls: string): HTMLDivElement => {
      const d = document.createElement('div');
      d.className = cls;
      return d;
    };
    this.root = div('battle');
    this.foes = div('b-side b-foes');
    this.mine = div('b-side b-mine');
    const bottom = div('b-bottom');
    this.msg = div('b-msg');
    this.menu = div('b-menu');
    bottom.append(this.msg, this.menu);
    this.rtBar = div('b-rt');
    this.root.append(this.foes, this.mine, bottom, this.rtBar);
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    this.menu.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn || btn.disabled) return;
      this.click(btn.dataset['act'] ?? '', btn.dataset['arg'] ?? '');
    });
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  get awaiting(): boolean {
    return this.menuMode !== 'none';
  }

  show(b: Battle, realtime: boolean): void {
    this.battle = b;
    this.realtime = realtime;
    this.shownHp.clear();
    for (const s of b.sides) for (const c of s.active) this.shownHp.set(c, c.creature.hp);
    this.root.classList.toggle('realtime', realtime);
    this.root.style.display = 'block';
    this.msg.textContent = '';
    this.hideMenu();
    this.render();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.battle = null;
    this.hideMenu();
  }

  message(text: string): void {
    if (this.realtime) {
      // Real-time: a short rolling log.
      const line = document.createElement('div');
      line.textContent = text;
      this.msg.appendChild(line);
      while (this.msg.childElementCount > 4) this.msg.firstElementChild!.remove();
    } else this.msg.textContent = text;
  }

  // ------------------------------------------------------------------ cards

  render(): void {
    const b = this.battle;
    if (!b) return;
    this.foes.innerHTML = b.sides[1].active.map((c) => this.card(c, false)).join('') + this.sideFx(1);
    this.mine.innerHTML = b.sides[0].active.map((c) => this.card(c, true)).join('') + this.sideFx(0);
  }

  private sideFx(side: 0 | 1): string {
    const s = this.battle!.sides[side];
    const tags: string[] = [];
    if (s.cloud > 0) tags.push(`<span class="b-tag smoke">Smoke ${s.cloud}</span>`);
    if (s.glass) tags.push(`<span class="b-tag glass">Broken glass</span>`);
    return tags.length ? `<div class="b-tags">${tags.join('')}</div>` : '';
  }

  private card(c: Combatant, mine: boolean): string {
    const cr = c.creature;
    const sp = species(cr.speciesId);
    const mx = maxHp(cr);
    const hp = Math.max(0, Math.round(this.shownHp.get(c) ?? cr.hp));
    const frac = hp / mx;
    const col = frac > 0.5 ? '#4cd964' : frac > 0.2 ? '#ffcc00' : '#ff3b30';
    const mag = magazine(cr);
    const ammo = mag > 0 ? `<div class="b-ammo">${Array.from({ length: mag }, (_, i) => `<i class="${i < cr.ammo ? 'full' : ''}"></i>`).join('')}</div>` : '';
    const stages = (['attack', 'defense', 'speed', 'accuracy', 'evasion'] as const)
      .filter((k) => c.stages[k] !== 0)
      .map((k) => `<span class="b-stage ${c.stages[k] > 0 ? 'up' : 'down'}">${k.slice(0, 3).toUpperCase()} ${c.stages[k] > 0 ? '+' : ''}${c.stages[k]}</span>`)
      .join('');
    const status = cr.status === 'choking' ? '<span class="b-status">CHOKING</span>' : '';
    const icon = sp.human ? '' : this.icons?.img(cr.speciesId, cr.shiny, 'b-icon') ?? '';
    const extra = `${c.ally ? 'ally' : ''} ${sp.legendary ? 'boss' : ''}`;
    return `<div class="b-card ${mine ? 'mine' : 'foe'} ${hp <= 0 ? 'fainted' : ''} ${extra}">
      ${icon}
      ${sp.legendary ? '<div class="b-boss">LEGENDARY</div>' : c.ally ? '<div class="b-ally">ALLY</div>' : ''}
      <div class="b-name">${esc(displayName(cr))}${cr.shiny ? ' <span class="shiny">★</span>' : ''} <span class="b-lv">Lv ${cr.level}</span></div>
      <div class="b-types">${sp.types.map(badge).join('')}${status}</div>
      <div class="b-hp"><div class="b-hpfill" style="width:${(frac * 100).toFixed(1)}%;background:${col}"></div></div>
      ${mine && !c.ally ? `<div class="b-hptext">${hp} / ${mx}</div>` : ''}
      ${ammo}
      ${stages ? `<div class="b-stages">${stages}</div>` : ''}
    </div>`;
  }

  // ------------------------------------------------------------------ menus

  /** Asks the player for an action for `c`. `forced`: a fainted creature must be replaced. */
  ask(c: Combatant, forced: boolean, cb: (choice: MenuChoice) => void): void {
    this.onChoice = cb;
    this.current = c;
    this.menuMode = forced ? 'forced' : 'main';
    if (!forced) this.message(`What will ${displayName(c.creature)} do?`);
    else this.message('Choose who to send out next.');
    this.drawMenu();
  }

  private current: Combatant | null = null;

  /** Shows the capture items with their catch chances. */
  askBag(c: Combatant, items: Array<{ id: string; name: string; count: number; chance: number }>, cb: (choice: MenuChoice) => void): void {
    this.onChoice = cb;
    this.current = c;
    this.bagItems = items;
    this.menuMode = 'bag';
    this.message('Throw something?');
    this.drawMenu();
  }

  /** After a battle, the real-time layout switches to the menu layout for prompts. */
  setRealtime(on: boolean): void {
    this.realtime = on;
    this.root.classList.toggle('realtime', on);
    if (!on) this.rtBar.innerHTML = '';
  }

  /** "X wants to learn Y but knows 4 moves": pick one to forget (slot) or -1 to skip. */
  askLearn(c: Creature, moveId: string, cb: (slot: number) => void): void {
    this.learnCb = cb;
    this.learnMove = moveId;
    this.learnCreature = c;
    this.menuMode = 'learn';
    const m = move(moveId);
    this.message(`${displayName(c)} wants to learn ${m.name}, but already knows 4 moves. Forget one?`);
    this.drawMenu();
  }

  hideMenu(): void {
    this.menuMode = 'none';
    this.menu.innerHTML = '';
    this.menu.style.display = 'none';
  }

  private drawMenu(): void {
    const b = this.battle!;
    const c = this.current!;
    this.menu.style.display = 'grid';
    if (this.menuMode === 'main') {
      const canSwitch = b.sides[0].members.some((m) => m.hp > 0 && !b.sides[0].active.some((a) => a.creature === m));
      this.menu.className = 'b-menu main';
      this.menu.innerHTML = `
        <button class="bbtn fight" data-act="fight"><b>Fight</b><small>1</small></button>
        <button class="bbtn team" data-act="team" ${canSwitch ? '' : 'disabled'}><b>Team</b><small>2</small></button>
        <button class="bbtn bag" data-act="bag" ${b.opts.wild ? '' : 'disabled'}><b>Bag</b><small>3</small></button>
        <button class="bbtn run" data-act="run" ${b.opts.canRun ? '' : 'disabled'}><b>Run</b><small>4</small></button>`;
    } else if (this.menuMode === 'learn') {
      const c = this.learnCreature!;
      const nm = move(this.learnMove);
      this.menu.className = 'b-menu fight';
      this.menu.innerHTML =
        c.moves
          .map((id, i) => {
            const m = move(id);
            const locked = id === 'reload' && species(c.speciesId).types.includes('gun');
            return `<button class="bbtn move" data-act="forget" data-arg="${i}" ${locked ? 'disabled' : ''} style="--tc:${typeInfo(m.type).color}"><b>Forget ${esc(m.name)}</b><small>${badge(m.type)} ${m.power ? `Pow ${m.power}` : 'Status'}${locked ? ' · Gun types must keep Reload' : ''}</small><kbd>${i + 1}</kbd></button>`;
          })
          .join('') +
        `<button class="bbtn back" data-act="forget" data-arg="-1"><b>Don't learn ${esc(nm.name)}</b><small>${badge(nm.type)} ${nm.power ? `Pow ${nm.power}` : 'Status'} · ${esc(nm.description ?? '')}</small><kbd>5</kbd></button>`;
    } else if (this.menuMode === 'bag') {
      this.menu.className = 'b-menu fight';
      this.menu.innerHTML =
        (this.bagItems.length
          ? this.bagItems
              .map(
                (it, i) => `<button class="bbtn move" data-act="item" data-arg="${it.id}" style="--tc:#ffd23f"><b>${esc(it.name)} <span class="b-lv">x${it.count}</span></b>
                <small>Catch chance about ${Math.round(it.chance * 100)}%</small><kbd>${i + 1}</kbd></button>`,
              )
              .join('')
          : `<div class="b-empty">No capture items. Buy Cuffs, Crates and Nets at a Corner Clinic.</div>`) +
        `<button class="bbtn back" data-act="back"><b>Back</b><small>Esc</small></button>`;
    } else if (this.menuMode === 'fight') {
      this.menu.className = 'b-menu fight';
      this.menu.innerHTML =
        b
          .options(c)
          .map((o, i) => this.moveButton(o.move, o.usable, o.reason, i + 1, c))
          .join('') + `<button class="bbtn back" data-act="back"><b>Back</b><small>Esc</small></button>`;
    } else {
      this.menu.className = 'b-menu team';
      this.menu.innerHTML =
        b.sides[0].members
          .map((m, i) => {
            const out = b.sides[0].active.some((a) => a.creature === m);
            const dis = m.hp <= 0 || out;
            return `<button class="bbtn member" data-act="switch" data-arg="${i}" ${dis ? 'disabled' : ''}>
              <b>${esc(displayName(m))} <span class="b-lv">Lv ${m.level}</span></b>
              <small>${species(m.speciesId).types.map(badge).join('')} ${m.hp}/${maxHp(m)}${out ? ' · out' : m.hp <= 0 ? ' · fainted' : ''}</small></button>`;
          })
          .join('') + (this.menuMode === 'team' ? `<button class="bbtn back" data-act="back"><b>Back</b><small>Esc</small></button>` : '');
    }
  }

  private moveButton(m: MoveSpec, usable: boolean, reason: string | undefined, n: number, c: Combatant): string {
    const t = typeInfo(m.type);
    const meta: string[] = [];
    if (m.power > 0) meta.push(`Pow ${m.power}`);
    else meta.push('Status');
    meta.push(m.accuracy === null ? 'Never misses' : `Acc ${m.accuracy}`);
    if (m.ammo && species(c.creature.speciesId).types.includes('gun')) meta.push(`${m.ammo} rd`);
    if (m.target === 'allFoes') meta.push('All foes');
    return `<button class="bbtn move" data-act="move" data-arg="${m.id}" ${usable ? '' : 'disabled'} title="${esc(m.description ?? '')}" style="--tc:${t.color}">
      <b>${esc(m.name)}</b><small>${badge(m.type)} ${meta.join(' · ')}${reason ? ` · ${reason}` : ''}</small><kbd>${n}</kbd></button>`;
  }

  private click(act: string, arg: string): void {
    const done = (ch: MenuChoice): void => {
      const cb = this.onChoice;
      this.hideMenu();
      this.onChoice = null;
      cb?.(ch);
    };
    if (act === 'fight') {
      this.menuMode = 'fight';
      this.drawMenu();
    } else if (act === 'team') {
      this.menuMode = 'team';
      this.drawMenu();
    } else if (act === 'back') {
      this.menuMode = 'main';
      this.drawMenu();
    } else if (act === 'move') done({ kind: 'move', moveId: arg });
    else if (act === 'switch') done({ kind: 'switch', index: Number(arg) });
    else if (act === 'bag') done({ kind: 'bag' });
    else if (act === 'item') done({ kind: 'item', itemId: arg });
    else if (act === 'forget') {
      const cb = this.learnCb;
      this.learnCb = null;
      this.hideMenu();
      cb?.(Number(arg));
    }
    else if (act === 'run') done({ kind: 'run' });
  }

  /** Keyboard shortcuts for the menus (1-4, Esc). Returns true if the key was used. */
  key(code: string): boolean {
    if (this.menuMode === 'none') return false;
    const n = code.startsWith('Digit') ? Number(code.slice(5)) : 0;
    const buttons = [...this.menu.querySelectorAll('button')];
    if (code === 'Escape' && (this.menuMode === 'fight' || this.menuMode === 'team' || this.menuMode === 'bag')) {
      this.click('back', '');
      return true;
    }
    if (n >= 1 && n <= buttons.length) {
      const btn = buttons[n - 1];
      if (!btn.disabled) this.click(btn.dataset['act'] ?? '', btn.dataset['arg'] ?? '');
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ real-time bar

  /** Real-time: move hotkeys with cooldown fill (`ready` 0..1) and the queued move highlighted. */
  renderRealtime(c: Combatant | null, ready: number, queued: string | null, commandKeys = true): void {
    if (!c || !this.battle) {
      this.rtBar.innerHTML = '';
      return;
    }
    const opts = this.battle.options(c);
    this.rtBar.classList.toggle('weapons', !commandKeys);
    this.rtBar.innerHTML =
      `<div class="b-rt-ready"><div style="width:${(ready * 100).toFixed(0)}%"></div></div>` +
      opts
        .map(
          (o, i) => `<div class="b-rt-move ${o.usable ? '' : 'off'} ${queued === o.move.id ? 'queued' : ''}" style="--tc:${typeInfo(o.move.type).color}">
          <kbd>${commandKeys ? i + 1 : '·'}</kbd><b>${esc(o.move.name)}</b><small>${o.reason ?? (o.move.power > 0 ? `Pow ${o.move.power}` : 'Status')}</small></div>`,
        )
        .join('') +
      `<div class="b-rt-keys ${commandKeys ? 'cmd' : 'wpn'}" title="T switches the number keys"><kbd>T</kbd><b>${commandKeys ? 'Commands' : 'Weapons'}</b></div>` +
      `<div class="b-rt-hint">${commandKeys ? '5 swap' : 'T for commands'}${this.battle.opts.wild ? ' · C catch' : ''}${this.battle.opts.canRun ? ' · X flee' : ''} · LMB shoot</div>`;
  }

  static creatureLabel(cr: Creature): string {
    return `${displayName(cr)} Lv ${cr.level}`;
  }
}
