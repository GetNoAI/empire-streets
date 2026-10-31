const CONTROLS = `
<table class="controls">
  <tr><th colspan="2">On foot</th></tr>
  <tr><td>W A S D</td><td>Move (camera-relative)</td></tr>
  <tr><td>Shift / Alt</td><td>Sprint / walk</td></tr>
  <tr><td>Space</td><td>Jump</td></tr>
  <tr><td>Mouse</td><td>Look around</td></tr>
  <tr><td>E or F</td><td>Get in / out of a car, carjack, enter a shop</td></tr>
  <tr><th colspan="2">Weapons</th></tr>
  <tr><td>Right mouse</td><td>Aim (sniper: scope)</td></tr>
  <tr><td>Left mouse</td><td>Fire / swing / throw</td></tr>
  <tr><td>R</td><td>Reload</td></tr>
  <tr><td>1-8 / wheel / Q</td><td>Weapon slot / cycle / last weapon</td></tr>
  <tr><td>Hold Tab</td><td>Weapon wheel</td></tr>
  <tr><th colspan="2">Streetmon</th></tr>
  <tr><td>B</td><td>Battle a wild Streetmon next to you (or set your lead on a person: a crime)</td></tr>
  <tr><td>1-4 / mouse</td><td>Battle menus (turn-based) or moves (real-time)</td></tr>
  <tr><td>5 / X</td><td>Real-time: swap creature / flee</td></tr>
  <tr><td>Space</td><td>Turn-based: speed up the battle text</td></tr>
  <tr><td>C / V</td><td>Throw a capture item / switch item</td></tr>
  <tr><td>G</td><td>Summon / recall your lead (on foot)</td></tr>
  <tr><td>Mouse over</td><td>Streetmon health bar</td></tr>
  <tr><td>I</td><td>Team (party and stash)</td></tr>
  <tr><td>N</td><td>Dex</td></tr>
  <tr><td>B (evolving)</td><td>Stop the evolution</td></tr>
  <tr><th colspan="2">Driving</th></tr>
  <tr><td>W / S</td><td>Throttle / brake, reverse</td></tr>
  <tr><td>A / D</td><td>Steer</td></tr>
  <tr><td>Space</td><td>Handbrake</td></tr>
  <tr><td>H</td><td>Horn</td></tr>
  <tr><td>R</td><td>Flip the car upright</td></tr>
  <tr><td>G</td><td>Siren (police car)</td></tr>
  <tr><td>E (on the lift)</td><td>Lower the car into the Chop Shop (tuning)</td></tr>
  <tr><td>Y / Backspace</td><td>Take a race offer / turn it down or quit</td></tr>
  <tr><th colspan="2">Story and the street</th></tr>
  <tr><td>E (by an M)</td><td>Talk: jobs from the USRL story (answer with 1-4)</td></tr>
  <tr><td>E (by a boss)</td><td>Challenge them</td></tr>
  <tr><td>J</td><td>Track the next active job</td></tr>
  <tr><td>E (by a crate)</td><td>Open a supply drop (street events)</td></tr>
  <tr><td>B (when bitten)</td><td>Battle an aggressive Streetmon (or run / hide to lose it)</td></tr>
  <tr><th colspan="2">Heists</th></tr>
  <tr><td>E</td><td>Plan the job / breach / grab a bag</td></tr>
  <tr><td>Z / X</td><td>Hacker jam / Smoke out the guards</td></tr>
  <tr><td>Backspace</td><td>Walk away from the job</td></tr>
  <tr><th colspan="2">General</th></tr>
  <tr><td>M</td><td>City map (click to set a waypoint)</td></tr>
  <tr><td>Esc / P</td><td>Pause</td></tr>
  <tr><td>K</td><td>Mute</td></tr>
</table>`;

/** Title screen and pause menu (plain DOM over the canvas). */
export class Menus {
  private readonly title: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly loading: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    handlers: {
      onPlay: () => void;
      onResume: () => void;
      onToggleSound: () => boolean;
      onToggleShadows: () => boolean;
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
    },
  ) {
    this.loading = document.createElement('div');
    this.loading.className = 'overlay loading';
    this.loading.innerHTML = `<div class="logo">EMPIRE <span>STREETS</span></div><div class="sub" id="load-msg">Building the city…</div>`;
    parent.appendChild(this.loading);

    this.title = document.createElement('div');
    this.title.className = 'overlay title';
    this.title.style.display = 'none';
    this.title.innerHTML = `
      <div class="logo">EMPIRE <span>STREETS</span></div>
      <div class="sub">An open city. Take any car. Go anywhere.</div>
      <div class="save-info" style="display:none"></div>
      <div class="title-buttons">
        <button class="btn primary" data-act="continue" style="display:none">Continue</button>
        <button class="btn primary" data-act="play">Play</button>
      </div>
      ${CONTROLS}
      <div class="credit">All art, models and sound generated in code. Drop your own .glb models into public/models to upgrade the look.</div>`;
    parent.appendChild(this.title);

    this.pause = document.createElement('div');
    this.pause.className = 'overlay pause';
    this.pause.style.display = 'none';
    this.pause.innerHTML = `
      <div class="logo small">PAUSED</div>
      <button class="btn primary" data-act="resume">Resume</button>
      <button class="btn" data-act="sound">Sound: on</button>
      <button class="btn" data-act="shadows">Shadows: on</button>
      <button class="btn" data-act="battle">Battles: ${handlers.battleModeLabel?.() ?? 'Turn-based'}</button>
      <div class="pause-tips">
        <button class="btn" data-act="tips">Tips: ${handlers.tipsOn?.() === false ? 'off' : 'on'}</button>
        <button class="btn" data-act="tutorials">Tutorials</button>
        <button class="btn" data-act="intro">Watch intro</button>
        <button class="btn" data-act="wardrobe">Character</button>
      </div>
      <div class="tut-list"></div>
      <div class="pause-save">
        <button class="btn" data-act="save">Save game</button>
        <button class="btn" data-act="export">Export save</button>
        <button class="btn" data-act="import">Import save</button>
        <input type="file" accept="application/json,.json" style="display:none" />
      </div>
      <div class="save-note"></div>
      ${CONTROLS}`;
    parent.appendChild(this.pause);

    const bind = (root: HTMLElement): void => {
      root.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (!btn) return;
        const act = btn.dataset['act'];
        if (act === 'play') {
          // Starting over when there's a save takes a second click.
          if (this.hasSave && btn.dataset['confirm'] !== '1') {
            btn.dataset['confirm'] = '1';
            btn.textContent = 'Start over? Click again (your save will be replaced)';
            return;
          }
          handlers.onPlay();
        } else if (act === 'continue') handlers.onContinue?.();
        else if (act === 'save') this.note(handlers.onSave?.() ?? '');
        else if (act === 'export') handlers.onExport?.();
        else if (act === 'import') (this.pause.querySelector('input[type=file]') as HTMLInputElement).click();
        else if (act === 'resume') handlers.onResume();
        else if (act === 'sound') btn.textContent = `Sound: ${handlers.onToggleSound() ? 'on' : 'off'}`;
        else if (act === 'shadows') btn.textContent = `Shadows: ${handlers.onToggleShadows() ? 'on' : 'off'}`;
        else if (act === 'battle' && handlers.onToggleBattleMode) btn.textContent = `Battles: ${handlers.onToggleBattleMode()}`;
        else if (act === 'tips' && handlers.onToggleTips) btn.textContent = `Tips: ${handlers.onToggleTips() ? 'on' : 'off'}`;
        else if (act === 'tutorials') this.toggleTutorialList(handlers);
        else if (act === 'replay' && btn.dataset['arg']) handlers.onReplayTutorial?.(btn.dataset['arg']);
        else if (act === 'intro') handlers.onWatchIntro?.();
        else if (act === 'wardrobe') handlers.onWardrobe?.();
      });
    };
    bind(this.title);
    bind(this.pause);
    const file = this.pause.querySelector('input[type=file]') as HTMLInputElement;
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      void f.text().then((t) => {
        this.note(handlers.onImport?.(t) ?? '');
        file.value = '';
      });
    });
  }

  private hasSave = false;

  /** The pause menu's list of tips: seen ones solid, the rest dashed; click to show one. */
  private toggleTutorialList(handlers: { tutorials?: () => Array<{ id: string; name: string; tutorials: Array<{ id: string; title: string; seen: boolean }> }> }): void {
    const box = this.pause.querySelector('.tut-list') as HTMLDivElement;
    if (box.classList.toggle('open')) {
      const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
      const cats = handlers.tutorials?.() ?? [];
      box.innerHTML =
        cats
          .filter((c) => c.tutorials.length)
          .map((c) => `<h4>${esc(c.name)}</h4><div class="tl-row">${c.tutorials.map((t) => `<button data-act="replay" data-arg="${esc(t.id)}" class="${t.seen ? '' : 'unseen'}">${esc(t.title)}</button>`).join('')}</div>`)
          .join('') + '<div class="tl-note">Click a tip to show it. Dashed ones haven\'t come up in your game yet.</div>';
    }
  }

  /** Keeps the pause menu's Tips button in step (a save loaded with tips off). */
  setTipsLabel(on: boolean): void {
    const b = this.pause.querySelector('[data-act=tips]');
    if (b) b.textContent = `Tips: ${on ? 'on' : 'off'}`;
  }

  /** Title screen: show Continue with a summary of the save (null = no save). */
  setSaveInfo(summary: string | null): void {
    this.hasSave = summary !== null;
    const info = this.title.querySelector('.save-info') as HTMLDivElement;
    const cont = this.title.querySelector('[data-act=continue]') as HTMLButtonElement;
    const play = this.title.querySelector('[data-act=play]') as HTMLButtonElement;
    info.style.display = summary ? 'block' : 'none';
    info.textContent = summary ? `Saved game: ${summary}` : '';
    cont.style.display = summary ? 'inline-block' : 'none';
    play.textContent = summary ? 'New game' : 'Play';
    play.classList.toggle('primary', !summary);
    play.dataset['confirm'] = '';
  }

  private note(text: string): void {
    const el = this.pause.querySelector('.save-note') as HTMLDivElement;
    el.textContent = text;
  }

  setLoadingMessage(msg: string): void {
    const el = this.loading.querySelector('#load-msg');
    if (el) el.textContent = msg;
  }

  showTitle(): void {
    this.loading.style.display = 'none';
    this.title.style.display = 'flex';
  }

  hideTitle(): void {
    this.title.style.display = 'none';
  }

  showPause(on: boolean): void {
    this.pause.style.display = on ? 'flex' : 'none';
    if (!on) this.pause.querySelector('.tut-list')?.classList.remove('open');
  }

  showError(msg: string): void {
    this.loading.style.display = 'flex';
    this.setLoadingMessage(msg);
  }
}
