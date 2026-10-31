import { typeInfo, type TypeId } from '../creatures/Data';
import type { CreatureIcons } from './CreatureIcons';
import type { CrewCandidate, CrewMember, HeistConfig, HeistRole, HeistTarget } from '../systems/heistManager.js';

/**
 * The heist planning board: the job (payout, security, getaway), the crew roles it needs or can
 * use, who's in each, and your Streetmon to pick from (with why a role won't take some). Keys:
 * 1-4 pick a role, Enter starts the job, Esc walks away.
 */

export interface HeistMenuContext {
  target: HeistTarget;
  config: HeistConfig;
  security: number;
  escapeStars: number;
  heat: number;
  crew(): Partial<Record<HeistRole, CrewMember>>;
  candidates(): Array<CrewCandidate & { shiny: boolean }>;
  fit(role: HeistRole, id: string): { ok: boolean; reason: string; skill: number };
  assign(role: HeistRole, id: string): { ok: boolean; reason: string };
  unassign(role: HeistRole): void;
  validate(): { ok: boolean; missing: HeistRole[]; problems: string[]; bonus: number };
  launch(): { ok: boolean; reason: string };
  onClose(launched: boolean): void;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const badge = (t: string): string => {
  try {
    const i = typeInfo(t as TypeId);
    return `<span class="tbadge" style="background:${i.color}">${i.name}</span>`;
  } catch {
    return `<span class="tbadge">${esc(t)}</span>`;
  }
};
const stars = (n: number, of = 5): string => '★'.repeat(n) + '<i>' + '★'.repeat(Math.max(0, of - n)) + '</i>';
const money = (n: number): string => `$${n.toLocaleString('en-US')}`;

export class HeistMenu {
  private readonly el: HTMLDivElement;
  private ctx: HeistMenuContext | null = null;
  private sel: HeistRole | null = null;
  private note = '';

  constructor(
    parent: HTMLElement,
    private readonly icons: CreatureIcons,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay team heist-board';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!b || !this.ctx || (b as HTMLButtonElement).disabled) return;
      const act = b.dataset['act'];
      if (act === 'close') return this.close(false);
      if (act === 'launch') return this.tryLaunch();
      if (act === 'role') this.sel = b.dataset['role'] as HeistRole;
      else if (act === 'pick' && this.sel) {
        const r = this.ctx.assign(this.sel, b.dataset['id']!);
        this.note = r.ok ? '' : r.reason;
      } else if (act === 'drop') this.ctx.unassign(b.dataset['role'] as HeistRole);
      this.render();
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  open(ctx: HeistMenuContext): void {
    this.ctx = ctx;
    this.note = '';
    const roles = this.roles();
    this.sel = roles.find((r) => r.required && !ctx.crew()[r.role])?.role ?? roles[0]?.role ?? null;
    this.el.style.display = 'flex';
    this.render();
  }

  close(launched: boolean): void {
    if (!this.isOpen) return;
    this.el.style.display = 'none';
    const c = this.ctx;
    this.ctx = null;
    c?.onClose(launched);
  }

  key(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'Escape') {
      this.close(false);
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      this.tryLaunch();
      return true;
    }
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    const roles = this.roles();
    if (n >= 0 && roles[n]) {
      this.sel = roles[n].role;
      this.render();
      return true;
    }
    return false;
  }

  private tryLaunch(): void {
    const c = this.ctx;
    if (!c) return;
    const r = c.launch();
    if (r.ok) this.close(true);
    else {
      this.note = r.reason;
      this.render();
    }
  }

  private roles(): Array<{ role: HeistRole; required: boolean }> {
    const t = this.ctx?.target;
    if (!t) return [];
    return [...t.roles.required.map((role) => ({ role, required: true })), ...t.roles.optional.map((role) => ({ role, required: false }))];
  }

  private render(): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.target;
    const crew = c.crew();
    const v = c.validate();
    const R = c.config.roles;
    const roleCard = (r: { role: HeistRole; required: boolean }, i: number): string => {
      const m = crew[r.role];
      const spec = R[r.role];
      const ab = spec.ability;
      const extra =
        r.role === 'hauler' && m
          ? `<div class="hs-skill">Carries up to <b>${m.capacity} kg</b> (${Math.floor(m.capacity / t.loot.kgPerBag)} of ${t.loot.bags} bags)</div>`
          : m
            ? `<div class="hs-skill">Skill <b>${Math.round(m.skill * 100)}%</b>${ab?.label ? ` · <kbd>${esc(ab.label)}</kbd>` : ''}</div>`
            : '';
      return `<button class="cs-slot hs-role ${this.sel === r.role ? 'sel' : ''} ${r.required ? 'req' : ''}" data-act="role" data-role="${r.role}">
        <div class="cs-slot-head"><kbd>${i + 1}</kbd> <b>${esc(spec.name)}</b> <span class="hs-tag">${r.required ? 'required' : 'optional'}</span>
          <span class="cs-accepts">${spec.accepts.types.map(badge).join('')}</span></div>
        <div class="hs-desc">${esc(spec.description)}</div>
        ${
          m
            ? `<div class="cs-mon">${this.icons.img(m.speciesId, false, 'cicon')}<div><b>${esc(m.name ?? m.speciesId)}</b> Lv ${m.level} ${m.types.map(badge).join('')}${extra}</div><span class="btn small cs-remove" data-act="drop" data-role="${r.role}">Remove</span></div>`
            : `<div class="cs-empty">${r.required ? 'Needed' : 'Empty'}</div>`
        }
      </button>`;
    };
    const used = new Set(Object.values(crew).map((m) => m!.id));
    const list = this.sel
      ? c
          .candidates()
          .map((m) => {
            const f = c.fit(this.sel!, m.id);
            const inUse = used.has(m.id) && crew[this.sel!]?.id !== m.id;
            const can = f.ok && !inUse;
            return `<div class="tm-row cs-cand ${can ? '' : 'no'}">${this.icons.img(m.speciesId, m.shiny, 'cicon')}
              <div class="cs-cand-info"><b>${esc(m.name ?? m.speciesId)}</b> Lv ${m.level} ${m.types.map(badge).join('')}
              ${can ? `<span class="cs-where">skill ${Math.round(f.skill * 100)}%</span>` : `<div class="cs-why">${esc(inUse ? 'Already in the crew' : f.reason)}</div>`}</div>
              <button class="btn small" data-act="pick" data-id="${m.id}" ${can ? '' : 'disabled'}>Pick</button></div>`;
          })
          .join('')
      : '';
    const crewN = Object.keys(crew).length;
    const status = v.ok
      ? `<span class="hs-ok">Crew ready${v.bonus ? ` · optional roles +${Math.round(v.bonus * 100)}% take` : ''}</span>`
      : `<span class="hs-bad">${esc(v.missing.length ? `Missing: ${v.missing.map((r) => R[r].name).join(', ')}` : v.problems[0] ?? '')}</span>`;
    this.el.innerHTML = `
      <div class="tm-panel cs-panel hs-panel">
        <div class="tm-head">
          <div class="tm-sname">HEIST: ${esc(t.name.toUpperCase())}</div>
          <div class="tm-bag">${esc(t.description)}</div>
          <button class="btn small" data-act="close">Walk away (Esc)</button>
        </div>
        <div class="hs-facts">
          <div><span>Take</span><b>${money(t.payoutPool.min)}–${money(t.payoutPool.max)}</b></div>
          <div><span>Loot</span><b>${t.loot.bags} bags × ${t.loot.kgPerBag} kg</b></div>
          <div><span>Security</span><b class="hs-stars">${stars(c.security)}</b></div>
          <div><span>Getaway</span><b class="hs-stars">${stars(c.escapeStars)}</b></div>
          <div><span>Setup</span><b>${t.setupCost ? money(t.setupCost) : 'free'}</b></div>
          ${t.timeLimitSeconds ? `<div><span>Window</span><b>${Math.round(t.timeLimitSeconds / 60)} min</b></div>` : ''}
          ${c.heat > 1 ? `<div><span>Heat</span><b>${Math.round(c.heat)}</b></div>` : ''}
        </div>
        ${this.note ? `<div class="tm-hint">${esc(this.note)}</div>` : ''}
        <div class="cs-body">
          <div class="cs-slots">${this.roles().map(roleCard).join('')}
            <div class="hs-launch">${status}<div class="hs-crewn">Crew ${crewN}/${c.config.maxCrew}</div>
              <button class="btn" data-act="launch" ${v.ok ? '' : 'disabled'}>Start the job (Enter)</button></div>
          </div>
          <div class="cs-list"><div class="cs-list-head">${this.sel ? `Pick a <b>${esc(R[this.sel].name)}</b>` : ''}</div>${list || '<div class="cs-empty">No Streetmon with you.</div>'}</div>
        </div>
      </div>`;
  }
}
