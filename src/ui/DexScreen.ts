import { playCry } from '../creatures/CreatureCry';
import { ALL_SPECIES, BIOMES, TYPE_IDS, item, move, species, typeInfo, type Biome, type SpeciesSpec, type TypeId } from '../creatures/Data';
import { completion, dexBiomes, dexEntry, dexState, evolutionLine, filterDex, reached, stageOf, typeMatrix, type DexFilter, type DexProgress } from '../creatures/Dex';
import type { CreatureIcons } from './CreatureIcons';

/**
 * The Streetmondex: every species in one of four states.
 * - Unseen: a silhouette and a vague hint of where it lives.
 * - Seen: picture, name, types, category, habitat hints and where you first saw one.
 * - Captured: lore, base stats, height, weight, catch rate, type matrix, evolution stage.
 * - Evolved (you evolved one yourself): the evolution line with a check on each step you own.
 * Filters by biome, type and state; completion counters overall and per biome.
 */

const badge = (t: TypeId): string => `<span class="tbadge" style="background:${typeInfo(t).color}">${typeInfo(t).name}</span>`;
const no = (s: SpeciesSpec): string => `#${String(s.dex).padStart(3, '0')}`;
const BIOME_NAMES: Record<Biome, string> = { street: 'Street', roof: 'Rooftops', sewer: 'Sewers', pond: 'Pond' };
const STATE_LABEL = { seen: 'Seen', captured: 'Captured', evolved: 'Evolved', missing: 'Not captured' } as const;
const mult = (m: number): string => (m === 0 ? '0' : m === 0.5 ? '½' : m === 0.25 ? '¼' : `${m}`);
const cls = (good: boolean, bad: boolean): string => (good ? 'up' : bad ? 'down' : '');

export interface DexData extends DexProgress {
  firstSeen: Record<string, { biome: Biome; district: string; at: number }>;
}

export class DexScreen {
  private readonly el: HTMLDivElement;
  private sel = '';
  private onClose: (() => void) | null = null;
  private data: DexData = { seen: new Set(), caught: new Set(), evolved: new Set(), firstSeen: {} };
  private filter: Required<DexFilter> = { biome: 'all', type: 'all', state: 'all' };

  constructor(
    parent: HTMLElement,
    private readonly icons: CreatureIcons,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay team dex';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!b) return;
      const act = b.dataset['act'];
      if (act === 'close') return this.close();
      if (act === 'cry') return playCry(b.dataset['id']!);
      if (act === 'pick') this.sel = b.dataset['id']!;
      else if (act === 'biome') this.filter.biome = b.dataset['v'] as Biome | 'all';
      else if (act === 'type') this.filter.type = b.dataset['v'] as TypeId | 'all';
      else if (act === 'state') this.filter.state = b.dataset['v'] as Required<DexFilter>['state'];
      else return;
      this.render();
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  open(data: DexData, onClose: () => void): void {
    this.data = data;
    this.onClose = onClose;
    if (!this.sel) this.sel = ALL_SPECIES().find((s) => data.seen.has(s.id))?.id ?? ALL_SPECIES()[0].id;
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

  /** The species listed with the current filters. */
  visible(): SpeciesSpec[] {
    return filterDex(ALL_SPECIES(), this.filter, this.data);
  }

  setFilter(f: DexFilter): void {
    Object.assign(this.filter, f);
    if (this.isOpen) this.render();
  }

  key(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'Escape' || code === 'KeyN') {
      this.close();
      return true;
    }
    const list = this.visible();
    const i = Math.max(0, list.findIndex((s) => s.id === this.sel));
    if (list.length && (code === 'ArrowDown' || code === 'ArrowRight' || code === 'KeyS' || code === 'KeyD')) this.sel = list[Math.min(list.length - 1, i + 1)].id;
    else if (list.length && (code === 'ArrowUp' || code === 'ArrowLeft' || code === 'KeyW' || code === 'KeyA')) this.sel = list[Math.max(0, i - 1)].id;
    else if (code === 'KeyB') {
      const opts = ['all', ...BIOMES] as const;
      this.filter.biome = opts[(opts.indexOf(this.filter.biome) + 1) % opts.length];
    } else return false;
    this.render();
    return true;
  }

  private chip(act: string, v: string, label: string, on: boolean, style = ''): string {
    return `<button class="dex-chip ${on ? 'on' : ''}" data-act="${act}" data-v="${v}"${style ? ` style="${style}"` : ''}>${label}</button>`;
  }

  private render(): void {
    const all = ALL_SPECIES();
    const list = this.visible();
    if (list.length && !list.some((s) => s.id === this.sel)) this.sel = list[0].id;
    const c = completion(all, this.data);
    const cells = list
      .map((s) => {
        const st = dexState(s.id, this.data);
        const mark = st === 'evolved' ? '<span class="dex-mark ev" title="Evolved">★</span>' : st === 'captured' ? '<span class="dex-mark" title="Captured">●</span>' : st === 'seen' ? '<span class="dex-mark seen" title="Seen">○</span>' : '';
        return `<button class="dex-cell ${this.sel === s.id ? 'sel' : ''} ${st === 'unseen' ? 'unseen' : ''}" data-act="pick" data-id="${s.id}">
          ${this.icons.img(s.id, false, 'dex-icon')}
          <span class="dex-no">${no(s)}</span>
          <span class="dex-name">${st === 'unseen' ? '???' : s.name}</span>
          ${mark}
        </button>`;
      })
      .join('');
    const f = this.filter;
    const biomeChips = this.chip('biome', 'all', 'All places', f.biome === 'all') + BIOMES.map((b) => this.chip('biome', b, `${BIOME_NAMES[b]} <i>${c[b].captured}/${c[b].total}</i>`, f.biome === b)).join('');
    const typeChips = this.chip('type', 'all', 'All types', f.type === 'all') + TYPE_IDS.map((t) => this.chip('type', t, typeInfo(t).name, f.type === t, f.type === t ? `background:${typeInfo(t).color}` : `border-color:${typeInfo(t).color}`)).join('');
    const stateChips = this.chip('state', 'all', 'Any state', f.state === 'all') + (['seen', 'captured', 'evolved', 'missing'] as const).map((s) => this.chip('state', s, STATE_LABEL[s], f.state === s)).join('');
    this.el.innerHTML = `
      <div class="tm-panel">
        <div class="tm-head">
          <div class="tm-sname">STREETMONDEX</div>
          <div class="tm-bag">Seen ${c.all.seen}/${c.all.total} · Captured ${c.all.captured}/${c.all.total} · Evolved ${c.all.evolved}</div>
          <button class="btn small" data-act="close">Close (N)</button>
        </div>
        <div class="dex-filters">
          <div class="dex-row">${biomeChips}</div>
          <div class="dex-row">${typeChips}</div>
          <div class="dex-row">${stateChips}</div>
        </div>
        <div class="tm-body">
          <div class="dex-grid">${cells || '<div class="dex-info">Nothing matches these filters.</div>'}</div>
          <div class="tm-sum">${list.length ? this.detail(species(this.sel)) : ''}</div>
        </div>
      </div>`;
  }

  private detail(s: SpeciesSpec): string {
    const st = dexState(s.id, this.data);
    const entry = dexEntry(s.id);
    if (st === 'unseen') {
      const phrase: Record<Biome, string> = { street: 'on the streets', roof: 'up on the rooftops', sewer: 'down in the sewers', pond: 'in the Central Green pond' };
      const where = dexBiomes(s).map((b) => phrase[b]);
      return `<div class="dex-unknown">${this.icons.img(s.id, false, 'cicon big dex-sil')}<p>${no(s)} ???</p>
        <p class="tm-desc">Not seen yet. ${where.length ? `Word is it turns up ${where.join(' or ')}.` : 'Nobody has seen one in the wild.'}</p></div>`;
    }
    const hints = entry.habitatHints.map((h) => `<li>${h.text}</li>`).join('');
    const fs = this.data.firstSeen[s.id];
    const firstSeen = fs
      ? `<div class="dex-info"><b>First seen:</b> ${BIOME_NAMES[fs.biome]}${fs.district ? `, ${fs.district.charAt(0).toUpperCase() + fs.district.slice(1)}` : ''}${fs.at ? `, ${new Date(fs.at).toLocaleDateString()}` : ''}</div>`
      : '';
    const head = `
      <div class="tm-sum-head">${this.icons.img(s.id, false, 'cicon big')}
        <div><div class="tm-sname">${s.name} <button class="btn small dex-cry" data-act="cry" data-id="${s.id}" title="Play its cry">▶ Cry</button> <span class="dex-state ${st}">${st === 'evolved' ? '★ Evolved' : st === 'captured' ? '● Captured' : '○ Seen'}</span></div>
        <div>${no(s)} · ${s.types.map(badge).join('')} · ${entry.category}</div>
        <div class="tm-desc">${s.description}</div></div></div>
      <div class="dex-info"><b>Habitat:</b><ul class="dex-hints">${hints}</ul></div>${firstSeen}`;
    if (!reached(st, 'captured')) return `${head}<div class="dex-info">Catch one to record its stats, lore and weaknesses.</div>`;

    const stat = (k: 'hp' | 'attack' | 'defense' | 'speed' | 'loud', l: string): string =>
      `<div class="tm-stat"><span>${l}</span><b>${s.base[k]}</b><i style="width:${Math.min(100, (s.base[k] / 130) * 100)}%"></i></div>`;
    const { stage, of } = stageOf(s.id);
    const sig = s.learnset.map(([, m]) => move(m)).filter((m) => m.signature);
    const matrix = typeMatrix(s.types)
      .map(
        (r) =>
          `<div class="dex-mx-col"><span class="tbadge" style="background:${typeInfo(r.type).color}">${typeInfo(r.type).name.slice(0, 4)}</span>` +
          `<b class="${cls(r.attack > 1, r.attack < 1)}">${mult(r.attack)}</b><b class="${cls(r.defend < 1, r.defend > 1)}">${mult(r.defend)}</b></div>`,
      )
      .join('');
    const evo = s.evolution
      .map((e) => {
        const to = this.data.seen.has(e.to) ? species(e.to).name : '???';
        if (e.method === 'level') return `Evolves into ${to} at Lv ${e.level}.`;
        if (e.method === 'item') return `Evolves into ${to} with a ${item(e.item).name}.`;
        return `Evolves into ${to} levelling up from Lv ${e.minLevel}${e.timeOfDay ? ` at ${e.timeOfDay}` : ''}${e.district ? ` in ${e.district}` : ''}.`;
      })
      .join(' ');
    const line = evolutionLine(s.id);
    const chain =
      line.length > 1
        ? `<div class="dex-chain">${line
            .map((stg) =>
              stg
                .map((id) => {
                  const own = this.data.caught.has(id);
                  const name = this.data.seen.has(id) ? species(id).name : '???';
                  return `<span class="dex-step ${id === s.id ? 'me' : ''} ${own ? 'own' : ''}">${own ? '✓ ' : ''}${name}</span>`;
                })
                .join(' / '),
            )
            .join('<span class="dex-arrow">→</span>')}</div>`
        : '';
    const kg = s.model.weightKg;
    return `${head}
      <div class="dex-lore">${entry.lore.map((l) => `<p>${l}</p>`).join('')}</div>
      <div class="dex-info"><b>Height:</b> ${s.model.height} m · <b>Weight:</b> ${kg !== undefined ? `${kg} kg` : '?'} · <b>Catch rate:</b> ${s.catchRate}${s.ammo ? ` · <b>Magazine:</b> ${s.ammo}` : ''}</div>
      <div class="tm-stats">${stat('hp', 'HP')}${stat('attack', 'Attack')}${stat('defense', 'Defense')}${stat('speed', 'Speed')}${stat('loud', 'Loud')}</div>
      <div class="dex-info"><b>Type matrix</b> <span class="dex-mx-key">top: its attacks against that type · bottom: that type's attacks against it</span></div>
      <div class="dex-mx">${matrix}</div>
      <div class="dex-info"><b>Stage ${stage} of ${of}.</b> ${evo}</div>
      ${line.length > 1 ? (st === 'evolved' ? chain : `${chain}<div class="dex-info dim">Evolve one yourself to mark it Evolved.</div>`) : ''}
      ${sig.length ? `<div class="dex-info"><b>Signature:</b> ${sig.map((m) => m.name).join(', ')}</div>` : ''}`;
  }
}
