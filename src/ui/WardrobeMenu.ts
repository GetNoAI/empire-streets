import { LOOK_OPTIONS, OUTFITS, randomPlayerLook, sanitizeLook, type PlayerLook } from '../player/playerLook';

/**
 * The wardrobe: a panel down the right of the screen (a sheet along the bottom on narrow ones)
 * while the camera looks at you. Every change shows on the figure straight away.
 */
export interface WardrobeContext {
  look: PlayerLook;
  /** A new game: "Let's go" instead of Done, and no Cancel. */
  newGame: boolean;
  onChange(look: PlayerLook): void;
  onDone(look: PlayerLook): void;
  onCancel(): void;
  /** Turns the camera round the figure (degrees). */
  onTurn(deg: number): void;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class WardrobeMenu {
  private readonly el: HTMLDivElement;
  private ctx: WardrobeContext | null = null;
  private look: PlayerLook | null = null;
  private start: PlayerLook | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'wardrobe';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b || !this.ctx || !this.look) return;
      const k = b.dataset['k'];
      const v = b.dataset['v'] ?? '';
      if (b.dataset['act'] === 'done') this.done();
      else if (b.dataset['act'] === 'cancel') this.cancel();
      else if (b.dataset['act'] === 'random') this.set(randomPlayerLook());
      else if (b.dataset['act'] === 'reset' && this.start) this.set(this.start);
      else if (b.dataset['act'] === 'turn') this.ctx.onTurn(Number(v));
      else if (b.dataset['act'] === 'outfit') {
        const o = OUTFITS.find((x) => x.id === v);
        if (o) this.set({ ...this.look, ...o.look, jacket: o.look.jacket });
      } else if (k) {
        const next: Record<string, unknown> = { ...this.look };
        if (k === 'jacket' && v === '') delete next['jacket'];
        else if (k === 'skirt' || k === 'glasses') next[k] = v === '1';
        else next[k] = v;
        this.set(sanitizeLook(next)!);
      }
    });
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset['k'] === 'scale' && this.look) this.set({ ...this.look, scale: Number(t.value) / 100 }, false);
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  open(ctx: WardrobeContext): void {
    this.ctx = ctx;
    this.look = { ...ctx.look };
    this.start = { ...ctx.look };
    this.render();
    this.el.style.display = 'flex';
  }

  /** Keys while open: Enter done, Esc cancel (or done on a new game), A/D or arrows turn. */
  key(code: string): void {
    if (!this.ctx) return;
    if (code === 'Enter' || code === 'NumpadEnter') this.done();
    else if (code === 'Escape') {
      if (this.ctx.newGame) this.done();
      else this.cancel();
    } else if (code === 'KeyA' || code === 'ArrowLeft') this.ctx.onTurn(-30);
    else if (code === 'KeyD' || code === 'ArrowRight') this.ctx.onTurn(30);
  }

  private set(l: PlayerLook, rerender = true): void {
    this.look = l;
    this.ctx?.onChange(l);
    if (rerender) this.render();
  }

  private done(): void {
    const c = this.ctx;
    const l = this.look;
    this.close();
    if (c && l) c.onDone(l);
  }

  private cancel(): void {
    const c = this.ctx;
    const s = this.start;
    this.close();
    if (c && s) {
      c.onChange(s);
      c.onCancel();
    }
  }

  private close(): void {
    this.el.style.display = 'none';
    this.ctx = null;
  }

  private render(): void {
    const L = this.look!;
    const c = this.ctx!;
    const O = LOOK_OPTIONS;
    const btns = (k: string, list: ReadonlyArray<readonly [string, string]>, cur: string): string =>
      list.map(([v, label]) => `<button class="wd-opt${cur === v ? ' on' : ''}" data-k="${k}" data-v="${v}">${esc(label)}</button>`).join('');
    const sw = (k: string, list: readonly string[], cur: string | undefined, none = false): string =>
      (none ? `<button class="wd-sw none${!cur ? ' on' : ''}" data-k="${k}" data-v="" title="None" aria-label="None">✕</button>` : '') +
      list.map((v) => `<button class="wd-sw${cur === v ? ' on' : ''}" data-k="${k}" data-v="${v}" style="background:${v}" aria-label="${v}"></button>`).join('');
    const row = (label: string, inner: string): string => `<div class="wd-row"><div class="wd-label">${label}</div><div class="wd-ctl">${inner}</div></div>`;
    this.el.innerHTML = `<div class="wd-panel">
      <div class="wd-title">${c.newGame ? 'WHO ARE YOU?' : 'WARDROBE'}</div>
      <div class="wd-sub">${c.newGame ? 'Make your character. You can change it any time from the pause menu.' : 'Changes show straight away.'}</div>
      <div class="wd-outfits">${OUTFITS.map((o) => `<button class="wd-opt" data-act="outfit" data-v="${o.id}">${esc(o.name)}</button>`).join('')}<button class="wd-opt" data-act="random">Random</button></div>
      <div class="wd-sec">Body</div>
      ${row('Build', btns('build', O.build, L.build))}
      ${row('Height', `<input type="range" min="${O.scale[0] * 100}" max="${O.scale[1] * 100}" value="${Math.round(L.scale * 100)}" data-k="scale" aria-label="Height" /><span class="wd-val">${Math.round(180 * L.scale)} cm</span>`)}
      ${row('Skin', sw('skin', O.skin, L.skin))}
      <div class="wd-sec">Hair</div>
      ${row('Style', btns('hairStyle', O.hairStyle, L.hairStyle))}
      ${row('Colour', sw('hair', O.hair, L.hair))}
      ${row('Face', btns('facialHair', O.facialHair, L.facialHair))}
      <div class="wd-sec">Clothes</div>
      ${row('Top', sw('top', O.cloth, L.top))}
      ${row('Jacket', sw('jacket', O.cloth, L.jacket, true))}
      ${row('Bottoms', btns('skirt', [['0', 'Trousers'], ['1', 'Skirt']], L.skirt ? '1' : '0') + '<br>' + sw('legs', O.cloth, L.legs))}
      ${row('Shoes', sw('shoes', O.shoes, L.shoes))}
      <div class="wd-sec">Extras</div>
      ${row('Hat', btns('hat', O.hat, L.hat) + (L.hat !== 'none' ? '<br>' + sw('hatColor', O.cloth, L.hatColor) : ''))}
      ${row('Shades', btns('glasses', [['0', 'No'], ['1', 'Yes']], L.glasses ? '1' : '0'))}
      <div class="wd-foot">
        <button class="wd-opt" data-act="turn" data-v="-45" aria-label="Turn left">⟲</button>
        <button class="wd-opt" data-act="turn" data-v="45" aria-label="Turn right">⟳</button>
        ${c.newGame ? '' : '<button class="btn" data-act="cancel">Cancel (Esc)</button>'}
        ${c.newGame ? '' : '<button class="btn" data-act="reset">Undo all</button>'}
        <button class="btn primary" data-act="done">${c.newGame ? "Let's go (Enter)" : 'Done (Enter)'}</button>
      </div>
    </div>`;
  }
}
