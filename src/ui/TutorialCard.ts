import type { TutorialManager, TutorialView } from '../systems/tutorialManager.js';
import { touchParts } from '../mobile/Touch';

/**
 * The tutorial card: a panel on the right with the tip's title, its steps (practice steps tick
 * off as you do them) and how to close it. Sits above the HUD, battles, menus and the city map.
 * Enter closes it while you're playing; the button works whenever the mouse is free.
 */
export class TutorialCard {
  readonly el: HTMLDivElement;
  private shown: string | null = null;

  constructor(parent: HTMLElement, private readonly tut: TutorialManager) {
    this.el = document.createElement('div');
    this.el.className = 'tut-card';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act=close]')) this.tut.dismiss();
    });
    tut.on('show', (v) => this.render(v, true));
    tut.on('step', (v) => this.render(v, false));
    tut.on('hide', () => this.hide());
    tut.on('close', (e) => {
      if (e.id === this.shown) this.hide();
    });
  }

  private tick = 0;
  private top = -1;

  /**
   * Where the card sits: on the street, on the right below the job tracker; in a battle, under
   * the foe's panel; over a menu, at the bottom (and Enter, which menus use, isn't offered).
   */
  setMode(mode: 'play' | 'battle' | 'menu' | 'none'): void {
    this.el.classList.toggle('in-battle', mode === 'battle');
    this.el.classList.toggle('in-menu', mode === 'menu');
    if (mode !== 'play' || !this.shown || ++this.tick % 15 !== 1) return;
    // Clear of the job tracker and the party bar on the right (they grow and shrink).
    let top = Math.round(window.innerHeight * 0.34);
    for (const el of document.querySelectorAll<HTMLElement>('.quest-panel, .party-bar')) {
      if (getComputedStyle(el).display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.right > window.innerWidth - 360) top = Math.max(top, Math.round(r.bottom + 10));
    }
    // ...but never pushed off the bottom.
    top = Math.min(top, Math.max(16, window.innerHeight - this.el.offsetHeight - 16));
    if (top !== this.top) {
      this.top = top;
      this.el.style.setProperty('--tut-top', `${top}px`);
    }
  }

  private render(v: TutorialView | null, fresh: boolean): void {
    if (!v) return;
    this.shown = v.id;
    const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const steps = v.steps
      .map((s) => {
        // On a touch screen the keys read as the buttons and gestures that do the same.
        const parts = document.body.classList.contains('touch') ? (s.touchParts ?? touchParts(s.parts)) : s.parts;
        const body = parts.map((p) => (typeof p === 'string' ? esc(p) : 'touch' in p && p.touch ? `<b class="tkey">${esc(p.key)}</b>` : `<kbd>${esc(p.key)}</kbd>`)).join('');
        const mark = s.practice ? `<i class="tut-check${s.done ? ' on' : ''}" aria-label="${s.done ? 'done' : 'to do'}"></i>` : '<i class="tut-dot"></i>';
        return `<li class="${s.practice ? 'practice' : ''}${s.done ? ' done' : ''}">${mark}<span>${body}</span></li>`;
      })
      .join('');
    const progress = v.practice && !v.replay ? `<span class="tut-progress">${v.practiced}/${v.practice}</span>` : '';
    // Practice left to do: "Skip" (a replay from the pause menu is just for reading: "Got it").
    const todo = v.practice > 0 && v.practiced < v.practice && !v.replay;
    this.el.innerHTML = `
      <div class="tut-head"><span class="tut-cat">${esc(v.category)}${v.replay ? ' · replay' : ''}</span>${progress}<button class="tut-x" data-act="close" aria-label="Close tip">×</button></div>
      <div class="tut-title">${esc(v.title)}</div>
      ${v.intro ? `<div class="tut-intro">${esc(v.intro)}</div>` : ''}
      <ul class="tut-steps">${steps}</ul>
      <div class="tut-foot"><span>${todo ? 'Try them: they tick off as you go' : ''}</span><button class="tut-ok" data-act="close"><kbd class="keyonly">Enter</kbd> ${todo ? 'Skip' : 'Got it'}</button></div>`;
    if (fresh) {
      this.el.classList.remove('out');
      this.el.classList.add('on');
      // Replay the slide-in.
      this.el.classList.remove('pop');
      void this.el.offsetWidth;
      this.el.classList.add('pop');
    }
  }

  private hide(): void {
    this.shown = null;
    this.el.classList.remove('on', 'pop');
  }
}
