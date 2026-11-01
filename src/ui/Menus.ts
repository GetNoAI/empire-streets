/**
 * Title screen and pause menu (plain DOM over the canvas).
 *
 * Both are laid out the way most console games do it: a column of big menu items on the left,
 * and a panel on the right for whatever's picked (Settings with tabs, a Controls reference in
 * cards, Tips, Save & load). Arrow keys / W-S move along the column, → or Enter opens a panel,
 * ← or Esc goes back; ← → on a setting changes it. A pad's focus ring works over the buttons.
 */

type Row = [keys: string, what: string];
interface Group {
  name: string;
  rows: Row[];
}

/** The keyboard reference, by group. Keys: `A / B` are alternatives; `(...)` is a note. */
export const KEYBOARD: Group[] = [
  {
    name: 'On foot',
    rows: [
      ['W A S D', 'Move (camera-relative)'],
      ['Shift / Alt', 'Sprint / crouch'],
      ['Space', 'Jump'],
      ['Z', 'Dodge roll; aiming a gun: a dive you can shoot through'],
      ['Mouse', 'Look around'],
      ['E / F', 'Get in / out, carjack, enter a shop'],
    ],
  },
  {
    name: 'Weapons',
    rows: [
      ['Right mouse', 'Aim (sniper: scope)'],
      ['Left mouse', 'Fire / swing / throw'],
      ['R', 'Reload'],
      ['1-8 / Wheel / Q', 'Weapon slot / cycle / last weapon'],
      ['Tab (hold)', 'Weapon wheel'],
      ['T (hold)', 'Quick-select wheel'],
    ],
  },
  {
    name: 'Streetmon',
    rows: [
      ['B', 'Battle a wild Streetmon next to you'],
      ['G', 'Summon / recall your lead (it fights wild ones nearby on its own)'],
      ['C / V', 'Throw a capture item / switch item'],
      ['I', 'Team (party and stash)'],
      ['N', 'Dex'],
      ['1-4 / Mouse', 'Battle menus or moves'],
      ['5 / X', 'Real-time: swap / flee'],
      ['T', 'Real-time: keys switch moves and weapons'],
      ['Space', 'Turn-based: speed up the text'],
      ['B (evolving)', 'Stop the evolution'],
    ],
  },
  {
    name: 'Driving',
    rows: [
      ['W / S', 'Throttle / brake, reverse'],
      ['A / D', 'Steer'],
      ['Space', 'Handbrake'],
      ['H', 'Horn'],
      ['R', 'Flip the car upright'],
      ['V', 'Camera: chase, far, hood'],
      ['G', 'Siren (police car)'],
      ['E (on the lift)', 'Lower the car into the Chop Shop'],
      ['Y / Backspace', 'Take a race / turn it down or quit'],
    ],
  },
  {
    name: 'Story and the street',
    rows: [
      ['E (by an M)', 'Talk: jobs from the story (answer with 1-4)'],
      ['E (by a boss)', 'Challenge them'],
      ['J', 'Track the next active job'],
      ['E (by a crate)', 'Open a supply drop'],
      ['B (when bitten)', 'Fight back (or run and hide to lose it)'],
    ],
  },
  {
    name: 'Heists',
    rows: [
      ['E', 'Plan the job / breach / grab a bag'],
      ['Z / X', 'Hacker jam / smoke out the guards'],
      ['Backspace', 'Walk away from the job'],
    ],
  },
  {
    name: 'General',
    rows: [
      ['M', 'City map (click to set a waypoint)'],
      ['Esc / P', 'Pause'],
      ['K', 'Mute'],
    ],
  },
];

/** The same reference for a phone or tablet (shown in place of the keyboard cards on touch). */
export const TOUCH: Group[] = [
  {
    name: 'On foot',
    rows: [
      ['Left side', 'Touch and drag: the stick. Push all the way out to sprint (RUN locks it on)'],
      ['Right side', 'Drag to look around'],
      ['Green pill', "Does what's in front of you: get in, talk, go in, open, climb"],
      ['JUMP / ROLL', 'Jump / dodge roll (aiming a gun: a dive)'],
      ['FIRE / AIM', 'Shoot or swing / aim (tap to hold)'],
      ['FIGHT / THROW', 'Battle the Streetmon next to you / throw a capture item'],
      ['WPN / RELOAD', 'Next weapon / reload'],
      ['TEAM / MAP / QUICK', 'Your team · the city map · quick-select wheel'],
    ],
  },
  {
    name: 'Driving',
    rows: [
      ['GAS / BRAKE', 'Throttle (or the stick) / brake and reverse'],
      ['HAND / NOS / HORN', 'Handbrake / nitrous / horn'],
      ['CAM / FLIP / OUT', 'Camera / flip upright / get out'],
      ['RACE', 'Take a race offer'],
    ],
  },
  {
    name: 'Battles (real-time)',
    rows: [
      ['Move bar', 'Tap a move; it fires when the bar fills'],
      ['SWAP / FLEE / CUFF', 'Swap / run / throw a capture item'],
      ['SHOOT / AIM / T', 'Your own weapon too; T switches the bar'],
    ],
  },
  {
    name: 'General',
    rows: [
      ['II', 'Pause'],
      ['Conversations, shops', 'Tap the choices'],
    ],
  },
];

const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** `Shift / Alt` → two keycaps; `E (by an M)` → a keycap and a note. */
export function keycaps(keys: string): string {
  return keys
    .split(' / ')
    .map((k) => {
      const m = /^(.*?)\s*\((.*)\)$/.exec(k);
      const cap = (m ? m[1] : k).trim();
      return `<kbd>${esc(cap)}</kbd>${m ? `<small>${esc(m[2])}</small>` : ''}`;
    })
    .join('<i>/</i>');
}

export interface MenuHandlers {
  onPlay: () => void;
  onResume: () => void;
  onToggleSound: () => boolean;
  soundOn?: () => boolean;
  onToggleShadows: () => boolean;
  shadowsOn?: () => boolean;
  onToggleBattleMode?: () => string;
  battleModeLabel?: () => string;
  onContinue?: () => void;
  onSave?: () => string;
  onExport?: () => void;
  onImport?: (text: string) => string;
  /** Tutorial tips on/off; returns the new state. */
  onToggleTips?: () => boolean;
  tipsOn?: () => boolean;
  /** Every tip by category (for the replay list). */
  tutorials?: () => Array<{ id: string; name: string; tutorials: Array<{ id: string; title: string; seen: boolean }> }>;
  onReplayTutorial?: (id: string) => void;
  /** Plays the opening cinematic again (from the pause menu). */
  onWatchIntro?: () => void;
  /** Opens the wardrobe (character look). */
  onWardrobe?: () => void;
  /** Options (look speed, invert, volumes, HUD size...): cycles one (back with `dir` -1) and returns its new label. */
  onCycleOption?: (key: string, dir?: number) => string;
  optionLabel?: (key: string) => string;
  /** One line about the game in progress (the pause menu's header). */
  summary?: () => string;
  /** Saves and goes back to the title screen. */
  onQuit?: () => void;
}

type Panel = 'settings' | 'controls' | 'tips' | 'save' | null;
type SettingsTab = 'gameplay' | 'audio' | 'display' | 'input';

interface Setting {
  id: string;
  label: string;
  hint: string;
  value: () => string;
  /** Changes it (dir: +1 next, -1 back); returns the new value. */
  change: (dir: number) => string;
}

/** Title screen and pause menu. */
export class Menus {
  private readonly title: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly loading: HTMLDivElement;
  private hasSave = false;
  private readonly panelOf = new Map<HTMLElement, Panel>();
  private tab: SettingsTab = 'gameplay';
  /** Controls panel: the touch reference instead of the keyboard (null: whichever this device is). */
  private controlsTouchPick: boolean | null = null;
  private get controlsTouch(): boolean {
    return this.controlsTouchPick ?? document.body.classList.contains('touch');
  }

  constructor(
    parent: HTMLElement,
    private readonly h: MenuHandlers,
  ) {
    this.loading = document.createElement('div');
    this.loading.className = 'overlay loading';
    this.loading.innerHTML = `<div class="logo">EMPIRE <span>STREETS</span></div><div class="sub" id="load-msg">Building the city…</div>`;
    parent.appendChild(this.loading);

    this.title = document.createElement('div');
    this.title.className = 'overlay mm title';
    this.title.style.display = 'none';
    this.title.innerHTML = `
      <div class="mm-side">
        <div class="mm-brand"><div class="logo">EMPIRE <span>STREETS</span></div><div class="sub">An open city. Take any car. Go anywhere.</div></div>
        <nav class="mm-nav">
          <button class="mm-item primary" data-act="continue" style="display:none"><span>Continue</span><small class="save-info"></small></button>
          <button class="mm-item" data-act="play"><span>Play</span></button>
          <button class="mm-item" data-panel="settings"><span>Settings</span></button>
          <button class="mm-item" data-panel="controls"><span>Controls</span></button>
        </nav>
        <div class="credit">All art, models and sound generated in code.</div>
      </div>
      <section class="mm-panel" hidden></section>`;
    parent.appendChild(this.title);

    this.pause = document.createElement('div');
    this.pause.className = 'overlay mm pause';
    this.pause.style.display = 'none';
    this.pause.innerHTML = `
      <div class="mm-side">
        <div class="mm-brand"><div class="logo small">PAUSED</div><div class="mm-summary"></div></div>
        <nav class="mm-nav">
          <button class="mm-item primary" data-act="resume"><span>Resume</span></button>
          <button class="mm-item" data-panel="settings"><span>Settings</span></button>
          <button class="mm-item" data-panel="controls"><span>Controls</span></button>
          <button class="mm-item" data-panel="tips"><span>Tips &amp; tutorials</span></button>
          <button class="mm-item" data-act="wardrobe"><span>Character</span></button>
          <button class="mm-item" data-panel="save"><span>Save &amp; load</span></button>
          <button class="mm-item quit" data-act="quit"><span>Quit to title</span></button>
        </nav>
        <div class="mm-hint"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> open · <kbd>Esc</kbd> back</div>
      </div>
      <section class="mm-panel" hidden></section>
      <input type="file" accept="application/json,.json,.esave" style="display:none" />`;
    parent.appendChild(this.pause);

    for (const root of [this.title, this.pause]) {
      this.panelOf.set(root, null);
      root.addEventListener('click', (e) => this.click(root, e));
    }
    const file = this.pause.querySelector('input[type=file]') as HTMLInputElement;
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      void f.text().then((t) => {
        this.note(this.h.onImport?.(t) ?? '');
        file.value = '';
      });
    });
    window.addEventListener('keydown', (e) => this.keydown(e));
  }

  // ------------------------------------------------------------------ clicks and keys

  private click(root: HTMLElement, e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const h = this.h;
    if (btn.dataset['panel']) return this.open(root, btn.dataset['panel'] as Panel);
    const act = btn.dataset['act'];
    if (act === 'play') {
      // Starting over when there's a save takes a second click.
      if (this.hasSave && btn.dataset['confirm'] !== '1') {
        btn.dataset['confirm'] = '1';
        this.label(btn, 'Start over? Again to confirm');
        return;
      }
      h.onPlay();
    } else if (act === 'continue') h.onContinue?.();
    else if (act === 'resume') h.onResume();
    else if (act === 'wardrobe') h.onWardrobe?.();
    else if (act === 'save') this.note(h.onSave?.() ?? '');
    else if (act === 'export') h.onExport?.();
    else if (act === 'import') (this.pause.querySelector('input[type=file]') as HTMLInputElement).click();
    else if (act === 'intro') h.onWatchIntro?.();
    else if (act === 'replay' && btn.dataset['arg']) h.onReplayTutorial?.(btn.dataset['arg']);
    else if (act === 'tab') {
      this.tab = btn.dataset['arg'] as SettingsTab;
      this.render(root, 'settings');
      (root.querySelector(`.mm-tabs [data-arg=${this.tab}]`) as HTMLElement | null)?.focus();
    } else if (act === 'ctab') {
      this.controlsTouchPick = btn.dataset['arg'] === 'touch';
      this.render(root, 'controls');
    } else if (act === 'set') this.change(btn, (e.target as HTMLElement).closest('.dec') ? -1 : 1);
    else if (act === 'close') this.back();
    else if (act === 'quit') {
      if (btn.dataset['confirm'] !== '1') {
        btn.dataset['confirm'] = '1';
        this.label(btn, 'Quit? The game saves first');
        window.setTimeout(() => {
          btn.dataset['confirm'] = '0';
          this.label(btn, 'Quit to title');
        }, 4000);
        return;
      }
      h.onQuit?.();
    }
  }

  private label(btn: HTMLElement, text: string): void {
    const s = btn.querySelector('span');
    if (s) s.textContent = text;
    else btn.textContent = text;
  }

  private get active(): HTMLElement | null {
    if (this.pause.style.display !== 'none') return this.pause;
    if (this.title.style.display !== 'none') return this.title;
    return null;
  }

  /** Arrow keys over the menu (the pad has its own focus ring; this is for the keyboard). */
  private keydown(e: KeyboardEvent): void {
    const root = this.active;
    if (!root || e.repeat && !/Arrow|Key[WS]/.test(e.code)) return;
    // Other overlays on top (the wardrobe, a dialog): leave them be.
    if (!root.contains(document.activeElement) && document.activeElement && document.activeElement !== document.body) return;
    const focus = document.activeElement as HTMLElement | null;
    const inPanel = !!focus && !!focus.closest('.mm-panel');
    const list = (sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)].filter((b) => b.offsetParent !== null);
    const nav = list('.mm-nav .mm-item');
    // In a panel: the tab strip counts as one stop (its chosen tab; ← → switch tabs), then the rows.
    const items = inPanel ? list('.mm-panel .mm-focusable').filter((b) => !/^c?tab$/.test(b.dataset['act'] ?? '') || b.classList.contains('on') || b === focus) : nav;
    const i = focus ? items.indexOf(focus) : -1;
    const go = (el: HTMLElement | undefined): void => {
      if (!el) return;
      el.focus();
      el.scrollIntoView({ block: 'nearest' });
      e.preventDefault();
    };
    switch (e.code) {
      case 'ArrowDown':
      case 'KeyS':
        return go(items[(i + 1 + items.length) % items.length] ?? items[0]);
      case 'ArrowUp':
      case 'KeyW':
        return go(items[(i - 1 + items.length) % items.length] ?? items[0]);
      case 'ArrowRight':
      case 'KeyD':
        if (inPanel && focus?.dataset['act'] === 'set') {
          this.change(focus, 1);
          e.preventDefault();
        } else if (inPanel && (focus?.dataset['act'] === 'tab' || focus?.dataset['act'] === 'ctab')) this.stepTab(root, 1, focus.dataset['act']);
        else if (!inPanel && focus?.dataset['panel']) {
          this.open(root, focus.dataset['panel'] as Panel);
          go(list('.mm-panel .mm-focusable')[0]);
        }
        return;
      case 'ArrowLeft':
      case 'KeyA':
        if (inPanel && focus?.dataset['act'] === 'set') {
          this.change(focus, -1);
          e.preventDefault();
        } else if (inPanel && (focus?.dataset['act'] === 'tab' || focus?.dataset['act'] === 'ctab')) this.stepTab(root, -1, focus.dataset['act']);
        else if (inPanel) {
          go(nav.find((b) => b.classList.contains('on')) ?? nav[0]);
        }
        return;
      case 'Enter':
      case 'NumpadEnter':
        if (focus && root.contains(focus) && focus.tagName === 'BUTTON') {
          const wasPanel = focus.dataset['panel'];
          focus.click();
          if (wasPanel) go(list('.mm-panel .mm-focusable')[0]);
          e.preventDefault();
        } else go(nav[0]);
        return;
    }
  }

  private stepTab(root: HTMLElement, dir: number, kind = 'tab'): void {
    if (kind === 'ctab') {
      this.controlsTouchPick = !this.controlsTouch;
      this.render(root, 'controls');
      (root.querySelector('.mm-tabs .on') as HTMLElement | null)?.focus();
      return;
    }
    const tabs: SettingsTab[] = ['gameplay', 'audio', 'display', 'input'];
    this.tab = tabs[(tabs.indexOf(this.tab) + dir + tabs.length) % tabs.length];
    this.render(root, 'settings');
    (root.querySelector(`.mm-tabs [data-arg=${this.tab}]`) as HTMLElement | null)?.focus();
  }

  /**
   * Esc in a menu: closes the open panel (true), or false when there's nothing to close (the
   * pause menu then resumes).
   */
  back(): boolean {
    const root = this.active;
    if (!root || !this.panelOf.get(root)) return false;
    const was = this.panelOf.get(root);
    this.open(root, null);
    (root.querySelector(`.mm-nav [data-panel=${was}]`) as HTMLElement | null)?.focus();
    return true;
  }

  // ------------------------------------------------------------------ panels

  private open(root: HTMLElement, panel: Panel): void {
    if (this.panelOf.get(root) === panel && panel) panel = null;
    this.panelOf.set(root, panel);
    for (const b of root.querySelectorAll<HTMLElement>('.mm-nav .mm-item')) b.classList.toggle('on', !!panel && b.dataset['panel'] === panel);
    root.classList.toggle('has-panel', !!panel);
    this.render(root, panel);
  }

  private render(root: HTMLElement, panel: Panel): void {
    const box = root.querySelector('.mm-panel') as HTMLElement;
    box.hidden = !panel;
    if (!panel) {
      box.innerHTML = '';
      return;
    }
    const head = (t: string): string => `<header><h2>${t}</h2><button class="mm-x" data-act="close" title="Back (Esc)">✕</button></header>`;
    if (panel === 'settings') {
      const tabs: Array<[SettingsTab, string]> = [
        ['gameplay', 'Gameplay'],
        ['audio', 'Audio'],
        ['display', 'Display'],
        ['input', 'Controls'],
      ];
      box.innerHTML = `${head('Settings')}
        <div class="mm-tabs">${tabs.map(([id, name]) => `<button class="mm-focusable ${id === this.tab ? 'on' : ''}" data-act="tab" data-arg="${id}">${name}</button>`).join('')}</div>
        <div class="mm-rows">${this.settings(this.tab)
          .map(
            (s) => `<button class="mm-row mm-focusable" data-act="set" data-arg="${s.id}">
              <span class="mm-row-l"><b>${esc(s.label)}</b><small>${esc(s.hint)}</small></span>
              <span class="mm-val"><i class="dec">‹</i><em>${esc(s.value())}</em><i class="inc">›</i></span>
            </button>`,
          )
          .join('')}</div>`;
    } else if (panel === 'controls') {
      const groups = this.controlsTouch ? TOUCH : KEYBOARD;
      box.innerHTML = `${head('Controls')}
        <div class="mm-tabs">
          <button class="mm-focusable ${this.controlsTouch ? '' : 'on'}" data-act="ctab" data-arg="kb">Keyboard &amp; mouse</button>
          <button class="mm-focusable ${this.controlsTouch ? 'on' : ''}" data-act="ctab" data-arg="touch">Touch</button>
        </div>
        <div class="mm-cards">${groups
          .map((g) => `<div class="mm-card"><h3>${esc(g.name)}</h3>${g.rows.map(([k, w]) => `<div class="mm-key"><span class="caps">${keycaps(k)}</span><span>${esc(w)}</span></div>`).join('')}</div>`)
          .join('')}</div>
        <p class="mm-foot">A gamepad works too: the button prompts on screen change to match it.</p>`;
    } else if (panel === 'tips') {
      const cats = this.h.tutorials?.() ?? [];
      const on = this.h.tipsOn?.() !== false;
      box.innerHTML = `${head('Tips &amp; tutorials')}
        <div class="mm-rows">
          <button class="mm-row mm-focusable" data-act="set" data-arg="tips"><span class="mm-row-l"><b>Tips</b><small>Short how-to cards when something new comes up</small></span><span class="mm-val"><i class="dec">‹</i><em>${on ? 'On' : 'Off'}</em><i class="inc">›</i></span></button>
          <button class="mm-row mm-focusable" data-act="intro"><span class="mm-row-l"><b>Watch the intro</b><small>The opening cinematic again</small></span><span class="mm-val"><em>▶</em></span></button>
        </div>
        <div class="tut-list open">${cats
          .filter((c) => c.tutorials.length)
          .map((c) => `<h4>${esc(c.name)}</h4><div class="tl-row">${c.tutorials.map((t) => `<button data-act="replay" data-arg="${esc(t.id)}" class="mm-focusable ${t.seen ? '' : 'unseen'}">${esc(t.title)}</button>`).join('')}</div>`)
          .join('')}<div class="tl-note">Pick a tip to see it again. Dashed ones haven't come up in your game yet.</div></div>`;
    } else if (panel === 'save') {
      box.innerHTML = `${head('Save &amp; load')}
        <div class="mm-rows">
          <button class="mm-row mm-focusable" data-act="save"><span class="mm-row-l"><b>Save game</b><small>The game also saves itself every so often and at milestones</small></span><span class="mm-val"><em>💾</em></span></button>
          <button class="mm-row mm-focusable" data-act="export"><span class="mm-row-l"><b>Export save</b><small>Download your save as a file (a backup, or to move it to another device)</small></span><span class="mm-val"><em>⬇</em></span></button>
          <button class="mm-row mm-focusable" data-act="import"><span class="mm-row-l"><b>Import save</b><small>Load a save file you exported</small></span><span class="mm-val"><em>⬆</em></span></button>
        </div>
        <div class="save-note"></div>`;
    }
  }

  private change(btn: HTMLElement, dir: number): void {
    const id = btn.dataset['arg'];
    if (!id) return;
    let v: string;
    if (id === 'tips') v = this.h.onToggleTips?.() ? 'On' : 'Off';
    else {
      const s = this.settings(this.tab).find((x) => x.id === id) ?? (['gameplay', 'audio', 'display', 'input'] as SettingsTab[]).flatMap((t) => this.settings(t)).find((x) => x.id === id);
      if (!s) return;
      v = s.change(dir);
    }
    const em = btn.querySelector('.mm-val em');
    if (em) em.textContent = v;
    btn.classList.remove('bump');
    void btn.offsetWidth;
    btn.classList.add('bump');
  }

  private settings(tab: SettingsTab): Setting[] {
    const h = this.h;
    const after = (label: string): string => {
      const i = label.lastIndexOf(': ');
      const v = i >= 0 ? label.slice(i + 2) : label;
      return v.charAt(0).toUpperCase() + v.slice(1);
    };
    const opt = (key: string, label: string, hint: string): Setting => ({
      id: key,
      label,
      hint,
      value: () => after(h.optionLabel?.(key) ?? ''),
      change: (dir) => {
        if (!h.onCycleOption) return '';
        return after(h.onCycleOption(key, dir));
      },
    });
    const flip = (id: string, label: string, hint: string, get: () => boolean, set: () => boolean): Setting => ({ id, label, hint, value: () => (get() ? 'On' : 'Off'), change: () => (set() ? 'On' : 'Off') });
    switch (tab) {
      case 'gameplay':
        return [
          {
            id: 'battle',
            label: 'Battles',
            hint: 'Turn-based menus, or real-time moves on a cooldown',
            value: () => h.battleModeLabel?.() ?? 'Turn-based',
            change: () => h.onToggleBattleMode?.() ?? '',
          },
          opt('petFights', 'Streetmon fights on its own', 'Your lead, out with you (G), takes on wild ones nearby'),
          flip('tips', 'Tips', 'Short how-to cards when something new comes up', () => h.tipsOn?.() !== false, () => h.onToggleTips?.() ?? true),
        ];
      case 'audio':
        return [
          flip('sound', 'Sound', 'Everything on or off (K)', () => h.soundOn?.() ?? true, h.onToggleSound),
          opt('music', 'Music', 'Radio, chase and battle music'),
          opt('effects', 'Effects', 'Engines, crowds, battle sounds'),
        ];
      case 'display':
        return [
          flip('shadows', 'Shadows', 'Off is faster on slower machines', () => h.shadowsOn?.() ?? true, h.onToggleShadows),
          opt('hudSize', 'HUD size', 'The HUD, battle bars, tips and prompts'),
        ];
      case 'input':
        return [opt('lookSpeed', 'Look speed', 'Mouse, touch and stick'), opt('invertY', 'Invert look', 'Push forward to look down')];
    }
  }

  // ------------------------------------------------------------------ outside

  /** Keeps the Tips setting in step (a save loaded with tips off). */
  setTipsLabel(on: boolean): void {
    for (const b of document.querySelectorAll('.mm [data-act=set][data-arg=tips] .mm-val em')) b.textContent = on ? 'On' : 'Off';
  }

  /** Title screen: show Continue with a summary of the save (null = no save). */
  setSaveInfo(summary: string | null): void {
    this.hasSave = summary !== null;
    const info = this.title.querySelector('.save-info') as HTMLElement;
    const cont = this.title.querySelector('[data-act=continue]') as HTMLButtonElement;
    const play = this.title.querySelector('[data-act=play]') as HTMLButtonElement;
    info.textContent = summary ?? '';
    cont.style.display = summary ? '' : 'none';
    this.label(play, summary ? 'New game' : 'Play');
    play.classList.toggle('primary', !summary);
    play.dataset['confirm'] = '';
  }

  private note(text: string): void {
    const el = this.pause.querySelector('.save-note') as HTMLDivElement | null;
    if (el) el.textContent = text;
  }

  setLoadingMessage(msg: string): void {
    const el = this.loading.querySelector('#load-msg');
    if (el) el.textContent = msg;
  }

  showTitle(): void {
    this.loading.style.display = 'none';
    this.title.style.display = 'flex';
    this.open(this.title, null);
  }

  hideTitle(): void {
    this.title.style.display = 'none';
  }

  showPause(on: boolean): void {
    this.pause.style.display = on ? 'flex' : 'none';
    if (on) {
      this.open(this.pause, null);
      const s = this.pause.querySelector('.mm-summary') as HTMLElement;
      s.textContent = this.h.summary?.() ?? '';
      (this.pause.querySelector('[data-act=resume]') as HTMLElement | null)?.focus({ preventScroll: true });
    }
  }
}
