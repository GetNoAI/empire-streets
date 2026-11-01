import type { Input } from '../core/Input';
import { icon, iconFor, type IconName } from './Icons';

/**
 * On-screen controls for phones and tablets. Everything goes through the same Input the keyboard
 * uses, plus a few gestures the game answers itself:
 *
 *  - a stick on the left (where you first touch) moves you on foot and drives the car: pushed
 *    forward it's the gas, pulled back the brake and reverse, sideways the steering; pushed all
 *    the way on foot you sprint, pushed a little you crouch;
 *  - dragging anywhere on the right looks around;
 *  - **tapping the world** is how you interact: tap a person, a wild Streetmon, a car or a spot on
 *    the ground and you walk over and do the natural thing (talk, battle, get in); where there's a
 *    choice, a few icons pop up over it. Tap yourself for your team, your Streetmon and the Dex,
 *    your car for the way out, the horn and the camera; the minimap opens the map, the team bar
 *    the quick wheel, the weapon panel switches weapons (`onTap` / `onLongPress` hand the screen
 *    point to the game, which knows what's there);
 *  - only a few buttons, each an icon: jump (swipe it to roll), attack, and aim and reload while
 *    you hold a gun; handbrake and nitrous in the car; the battle ones in a battle; a pause button;
 *  - an action button whose icon shows what E (or whichever key) would do right here: a door
 *    for "Go into...", a speech bubble for "Talk", a ladder for "Climb out" (the game passes its
 *    prompt every frame);
 *  - buttons buzz lightly under the thumb where the phone allows it.
 *
 * `setMode` picks which buttons show; the game calls it every frame with what the player is doing.
 */

export type TouchMode = 'foot' | 'car' | 'battle' | 'menu' | 'hidden';

interface Btn {
  el: HTMLButtonElement;
  code: string;
  /** Hold: key held while touched. Tap: a key press on touch. Mouse: a mouse button. Jump: tap jumps, a swipe rolls. */
  kind: 'hold' | 'tap' | 'mouseL' | 'mouseR' | 'jump';
  modes: TouchMode[];
  cls: string;
  on?: boolean;
  /** Hidden by the game for now (a button for something that isn't on offer). */
  hidden?: boolean;
}

/** One of the icons that pop up over something you tapped. */
export interface TouchChoice {
  icon: IconName;
  label: string;
  run: () => void;
}

export interface TouchHooks {
  /** A short tap with no drag at (x, y): the game does whatever is there. True if it used it. */
  tap(x: number, y: number): boolean;
  /** A press held still for a moment. True if it used it. */
  longPress(x: number, y: number): boolean;
}

const LOOK_SPEED = 2.2;
/** Stick pushed this far (0..1) on foot and you sprint. */
const SPRINT_PUSH = 0.94;
/** A tap: released within this long (ms), moved less than this (px). A long press: held this long. */
export const GESTURE = { tapMs: 320, tapMove: 14, longMs: 520, swipe: 30 } as const;

/** Which key a prompt's first word stands for (the HUD prompts read "E  Get in the Sedan"). */
const PROMPT_KEYS: Record<string, string> = { E: 'KeyE', B: 'KeyB', C: 'KeyC', F: 'KeyF', R: 'KeyR', Space: 'Space', Y: 'KeyY' };

/** What a keyboard key is on the touch screen, for tips written with keys ("{E}", "{Shift}"). */
const TOUCH_KEYS: Record<string, string> = {
  W: 'the stick', A: 'the stick', S: 'the stick', D: 'the stick',
  Mouse: 'a drag on the right', Shift: 'the stick pushed all the way', Alt: 'a light push on the stick',
  Space: 'the jump button', E: 'the action button', F: 'the action button', Y: 'the action button', B: 'a tap on it',
  C: 'your team bar, then an item', V: 'your team bar', Q: 'a tap on your weapon', Tab: 'a tap on your weapon', '8': 'a tap on your weapon',
  M: 'a tap on the minimap', I: 'a tap on yourself', N: 'a tap on yourself', G: 'a tap on yourself', Backspace: 'a tap on yourself',
  T: 'the keys button', H: 'a tap on your car', R: 'the reload button', LMB: 'the attack button', RMB: 'the aim button',
  Esc: 'the pause button', Enter: 'the button', Z: 'a swipe on the jump button', X: 'the flee button', '5': 'the swap button',
  '1': 'a move', '2': 'a move', '3': 'a move', '4': 'a move',
};

/**
 * A tip's parts (text and {key} caps) for the touch screen: keys become the button or gesture that
 * does it, and repeats collapse ("{W} {A} {S} {D}" is just "the stick"). Keys with no touch
 * control stay as keys.
 */
export function touchParts(parts: ReadonlyArray<string | { key: string }>): Array<string | { key: string; touch?: boolean }> {
  const out: Array<string | { key: string; touch?: boolean }> = [];
  for (const p of parts) {
    if (typeof p === 'string') {
      out.push(p);
      continue;
    }
    const label = TOUCH_KEYS[p.key];
    if (!label) {
      out.push(p);
      continue;
    }
    // Same label as the last key with only spaces (or "to") between: drop this one.
    let k = out.length - 1;
    while (k >= 0 && typeof out[k] === 'string' && /^\s*(to|or|,)?\s*$/.test(out[k] as string)) k--;
    const prev = out[k];
    if (k >= 0 && typeof prev !== 'string' && prev.touch && prev.key === label) {
      out.length = k + 1;
      continue;
    }
    out.push({ key: label, touch: true });
  }
  return out;
}

/** A HUD prompt as a context button: the key it presses and a short label, or null. */
export function contextFromPrompt(prompt: string): { code: string; label: string } | null {
  const m = /^(\S+)\s+(.+)$/.exec(prompt.trim());
  if (!m || !PROMPT_KEYS[m[1]]) return null;
  // Only the first action ("E  Talk   ·   B  Set Lefty on them" is a Talk button).
  let label = m[2].split(/\s+·\s+/)[0].replace(/\s+/g, ' ').trim();
  // Keep it to a thumb's width: cut at a colon or comma, then at a word.
  const cut = label.search(/[:(,]/);
  if (cut > 6) label = label.slice(0, cut).trim();
  if (label.length > 26) label = `${label.slice(0, 25).replace(/\s+\S*$/, '')}…`;
  return { code: PROMPT_KEYS[m[1]], label };
}

/** The buttons: icon, key, kind, modes, class, what it's for (read out by screen readers). */
const BUTTONS: Array<[IconName, string, Btn['kind'], TouchMode[], string, string]> = [
  ['handbrake', 'Space', 'hold', ['car'], 'hb', 'Handbrake'],
  ['nos', 'ShiftLeft', 'hold', ['car'], 'nos', 'Nitrous'],
  ['jump', 'Space', 'jump', ['foot'], 'jump', 'Jump (swipe to roll)'],
  ['fist', 'MouseL', 'mouseL', ['foot'], 'fire', 'Attack'],
  ['aim', 'MouseR', 'mouseR', ['foot'], 'aim', 'Aim'],
  ['reload', 'KeyR', 'tap', ['foot'], 'reload', 'Reload'],
  ['keys', 'KeyZ', 'tap', ['foot', 'car'], 'jam', 'Jam the cameras'],
  ['mask', 'KeyX', 'tap', ['foot', 'car'], 'smoke', 'Smoke the guards'],
  ['fire', 'MouseL', 'mouseL', ['battle'], 'fire', 'Shoot'],
  ['aim', 'MouseR', 'mouseR', ['battle'], 'aim', 'Aim'],
  // (On foot too, for a real-time battle, where you keep moving.)
  ['swap', 'Digit5', 'tap', ['battle', 'foot'], 'swap', 'Swap Streetmon'],
  ['flee', 'KeyX', 'tap', ['battle', 'foot'], 'flee', 'Flee'],
  ['capture', 'KeyC', 'tap', ['battle', 'foot'], 'cuff', 'Throw a capture item'],
  ['keys', 'KeyT', 'tap', ['battle', 'foot'], 'tkeys', 'Number keys: moves or weapons'],
];
/** Buttons that only show when the game says so (aim and reload with a gun, nitrous on a car that has it...). */
const SOMETIMES = new Set(['aim', 'reload', 'nos', 'jam', 'smoke', 'swap', 'flee', 'cuff', 'tkeys']);

export class TouchControls {
  readonly el: HTMLDivElement;
  private readonly stickEl: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly buttons: Btn[] = [];
  private mode: TouchMode = 'hidden';
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private readonly radius = 48;
  private readonly ctxBtn: HTMLButtonElement;
  private ctx: { code: string; label: string } | null = null;
  private autoSprint = false;
  /** Where and when each finger came down (for taps and long presses). */
  private readonly downs = new Map<number, { x: number; y: number; t: number; moved: boolean; long: boolean; timer: number }>();
  private readonly choiceEl: HTMLDivElement;
  private choiceTimer = 0;
  /** The move wheel (real-time battles): your Streetmon's moves round the attack button. */
  private readonly movesEl: HTMLDivElement;
  private readonly readyEl: HTMLDivElement;
  private movesKey = '';

  constructor(
    parent: HTMLElement,
    private readonly input: Input,
    private readonly onPause: () => void,
    private readonly hooks: TouchHooks = { tap: () => false, longPress: () => false },
  ) {
    this.el = document.createElement('div');
    this.el.className = 'touch';
    this.stickEl = document.createElement('div');
    this.stickEl.className = 'touch-stick';
    this.knob = document.createElement('div');
    this.knob.className = 'touch-knob';
    this.stickEl.appendChild(this.knob);
    this.stickEl.style.display = 'none';
    this.el.appendChild(this.stickEl);
    const pause = document.createElement('button');
    pause.className = 'touch-btn touch-pause';
    pause.innerHTML = icon('pause');
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onPause();
    });
    this.el.appendChild(pause);
    this.ctxBtn = document.createElement('button');
    this.ctxBtn.className = 'touch-btn tb-ctx';
    this.ctxBtn.style.display = 'none';
    this.ctxBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.ctx) return;
      this.buzz();
      this.touched();
      this.input.press(this.ctx.code);
      this.ctxBtn.classList.add('down');
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.ctxBtn.addEventListener(ev, () => this.ctxBtn.classList.remove('down'));
    this.el.appendChild(this.ctxBtn);
    this.choiceEl = document.createElement('div');
    this.choiceEl.className = 'tchoices';
    this.choiceEl.style.display = 'none';
    this.el.appendChild(this.choiceEl);
    this.readyEl = document.createElement('div');
    this.readyEl.className = 'tm-ready';
    this.el.appendChild(this.readyEl);
    this.movesEl = document.createElement('div');
    this.movesEl.className = 'tmoves';
    this.el.appendChild(this.movesEl);
    for (const [ic, code, kind, modes, cls, label] of BUTTONS) this.addButton(ic, code, kind, modes, cls, label);

    // The stick, the look area and taps on the world: the empty parts of the overlay.
    this.el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      this.touched();
      this.hideChoices();
      const id = e.pointerId;
      const left = e.clientX < window.innerWidth * 0.42;
      const stick = left && this.stickId === null && this.mode !== 'battle';
      // A long press (not on the stick: a thumb resting there is just standing still).
      const timer = stick
        ? 0
        : window.setTimeout(() => {
            const d = this.downs.get(id);
            if (!d || d.moved) return;
            d.long = this.hooks.longPress(d.x, d.y);
            if (d.long) this.buzz();
          }, GESTURE.longMs);
      this.downs.set(id, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, long: false, timer });
      if (stick) {
        this.stickId = id;
        this.stickOrigin = { x: e.clientX, y: e.clientY };
        this.stickEl.style.display = 'block';
        this.stickEl.style.left = `${e.clientX - this.radius}px`;
        this.stickEl.style.top = `${e.clientY - this.radius}px`;
        this.input.stick = { x: 0, y: 0 };
        this.capture(id);
      } else if (this.lookId === null) {
        this.lookId = id;
        this.lookLast = { x: e.clientX, y: e.clientY };
        this.capture(id);
      }
    });
    this.el.addEventListener('pointermove', (e) => {
      const d = this.downs.get(e.pointerId);
      if (d && !d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > GESTURE.tapMove) d.moved = true;
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.stickOrigin.x;
        let dy = e.clientY - this.stickOrigin.y;
        const dd = Math.hypot(dx, dy);
        if (dd > this.radius) {
          dx *= this.radius / dd;
          dy *= this.radius / dd;
        }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        const dead = 0.12;
        const nx = dx / this.radius;
        const ny = -dy / this.radius;
        const shape = (v: number): number => (Math.abs(v) < dead ? 0 : Math.sign(v) * ((Math.abs(v) - dead) / (1 - dead)));
        this.input.stick = { x: shape(nx), y: shape(ny) };
        const m = Math.hypot(nx, ny);
        if (this.mode === 'foot') {
          // Pushed right out: sprint. Pushed a little: crouch (quiet and low), like holding Alt.
          const full = m >= SPRINT_PUSH;
          if (full && !this.autoSprint) this.input.virtual.add('ShiftLeft');
          if (!full && this.autoSprint) this.input.virtual.delete('ShiftLeft');
          this.autoSprint = full;
          if (m > 0.15 && m < 0.5) this.input.virtual.add('AltLeft');
          else this.input.virtual.delete('AltLeft');
        }
        // In a car: forward is the gas, back the brake (and reverse), sideways steers.
        if (this.mode === 'car') {
          this.setKey('KeyW', ny > 0.35);
          this.setKey('KeyS', ny < -0.35);
        }
      } else if (e.pointerId === this.lookId) {
        this.input.touchLookDX += (e.clientX - this.lookLast.x) * LOOK_SPEED;
        this.input.touchLookDY += (e.clientY - this.lookLast.y) * LOOK_SPEED;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    });
    const end = (e: PointerEvent): void => {
      const d = this.downs.get(e.pointerId);
      if (d) {
        window.clearTimeout(d.timer);
        this.downs.delete(e.pointerId);
      }
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.stickEl.style.display = 'none';
        this.knob.style.transform = '';
        this.input.stick = null;
        if (this.autoSprint) this.input.virtual.delete('ShiftLeft');
        this.autoSprint = false;
        this.input.virtual.delete('AltLeft');
        if (this.mode === 'car') {
          this.setKey('KeyW', false);
          this.setKey('KeyS', false);
        }
      } else if (e.pointerId === this.lookId) this.lookId = null;
      // A quick touch that didn't drag: a tap on whatever's there.
      if (d && e.type === 'pointerup' && !d.moved && !d.long && performance.now() - d.t < GESTURE.tapMs) {
        if (this.hooks.tap(e.clientX, e.clientY)) this.buzz();
      }
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    parent.appendChild(this.el);
    this.setMode('hidden');
  }

  private addButton(ic: IconName, code: string, kind: Btn['kind'], modes: TouchMode[], cls: string, label: string): void {
    const b = document.createElement('button');
    b.className = `touch-btn tb-${cls}`;
    b.innerHTML = icon(ic);
    b.setAttribute('aria-label', label);
    b.title = label;
    const btn: Btn = { el: b, code, kind, modes, cls, hidden: SOMETIMES.has(cls) };
    let start: { x: number; y: number; swiped: boolean } | null = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.touched();
      this.hideChoices();
      this.buzz();
      b.classList.add('down');
      if (kind === 'hold') this.input.virtual.add(code);
      else if (kind === 'tap') this.input.press(code);
      else if (kind === 'mouseL') this.input.mouseLeft = this.input.mouseDown = true;
      else if (kind === 'mouseR') {
        btn.on = !btn.on;
        this.input.mouseRight = !!btn.on;
        b.classList.toggle('on', !!btn.on);
      } else if (kind === 'jump') {
        start = { x: e.clientX, y: e.clientY, swiped: false };
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          /* gone */
        }
      }
    });
    if (kind === 'jump')
      b.addEventListener('pointermove', (e) => {
        // A swipe off the jump button is a roll (in the direction you're moving).
        if (!start || start.swiped || Math.hypot(e.clientX - start.x, e.clientY - start.y) < GESTURE.swipe) return;
        start.swiped = true;
        this.input.press('TouchRoll');
        this.buzz();
      });
    const up = (e: Event): void => {
      e.preventDefault();
      b.classList.remove('down');
      if (kind === 'hold') this.input.virtual.delete(code);
      else if (kind === 'mouseL') this.input.mouseLeft = this.input.mouseDown = false;
      else if (kind === 'jump' && start) {
        if (!start.swiped && e.type === 'pointerup') this.input.press(code);
        start = null;
      }
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    if (kind !== 'jump') b.addEventListener('pointerleave', up);
    this.el.appendChild(b);
    this.buttons.push(btn);
  }

  private touched(): void {
    this.input.touch = true;
    this.input.device = 'touch';
  }

  private setKey(code: string, on: boolean): void {
    if (on) this.input.virtual.add(code);
    else this.input.virtual.delete(code);
  }

  private capture(id: number): void {
    try {
      this.el.setPointerCapture(id);
    } catch {
      /* a pointer that's already gone */
    }
  }

  /** Shows or hides one button by its class (aim and reload only with a gun, say). */
  setButtonShown(cls: string, on: boolean): void {
    for (const b of this.buttons) {
      if (b.cls !== cls) continue;
      if (b.hidden === !on) continue;
      b.hidden = !on;
      b.el.style.display = !b.hidden && b.modes.includes(this.mode) ? '' : 'none';
      // Hidden while held: let go of it.
      if (b.hidden) {
        if (b.kind === 'hold') this.input.virtual.delete(b.code);
        if (b.kind === 'mouseR' && b.on) {
          b.on = false;
          this.input.mouseRight = false;
          b.el.classList.remove('on');
        }
      }
    }
  }

  /** Swaps a button's icon (the attack button is a fist with fists, a crosshair with a gun). */
  setButtonIcon(cls: string, ic: IconName): void {
    for (const b of this.buttons) if (b.cls === cls && b.el.dataset['icon'] !== ic && b.modes.includes('foot')) {
      b.el.dataset['icon'] = ic;
      b.el.innerHTML = icon(ic);
    }
  }

  /** The game's current prompt (or ''): shown as the action button (an icon) on foot or driving. */
  setContext(prompt: string): void {
    const c = this.mode === 'foot' || this.mode === 'car' ? contextFromPrompt(prompt) : null;
    if (c?.code === this.ctx?.code && c?.label === this.ctx?.label) return;
    this.ctx = c;
    this.ctxBtn.style.display = c ? '' : 'none';
    document.body.classList.toggle('has-ctx', !!c);
    if (c) {
      this.ctxBtn.innerHTML = icon(iconFor(c.label, c.code));
      this.ctxBtn.setAttribute('aria-label', c.label);
      this.ctxBtn.title = c.label;
    }
  }

  /**
   * A few icons in a ring round a point on the screen (over the thing you tapped): tap one to do
   * it. They go away after a few seconds, or when you touch anything else.
   */
  showChoices(x: number, y: number, choices: TouchChoice[]): void {
    this.choiceEl.innerHTML = '';
    const n = choices.length;
    const R = n <= 1 ? 0 : 52;
    choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'tchoice';
      b.innerHTML = icon(c.icon);
      b.setAttribute('aria-label', c.label);
      b.title = c.label;
      // Fanned over the top: -150 deg .. -30 deg.
      const a = n <= 1 ? -Math.PI / 2 : -Math.PI * (5 / 6) + ((Math.PI * 2) / 3) * (i / (n - 1));
      b.style.left = `${Math.cos(a) * R}px`;
      b.style.top = `${Math.sin(a) * R}px`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.buzz();
        this.hideChoices();
        c.run();
      });
      this.choiceEl.appendChild(b);
    });
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.choiceEl.style.left = `${Math.max(70, Math.min(W - 70, x))}px`;
    this.choiceEl.style.top = `${Math.max(90, Math.min(H - 40, y))}px`;
    this.choiceEl.style.display = 'block';
    window.clearTimeout(this.choiceTimer);
    this.choiceTimer = window.setTimeout(() => this.hideChoices(), 4000);
  }

  hideChoices(): void {
    if (this.choiceEl.style.display === 'none') return;
    this.choiceEl.style.display = 'none';
    window.clearTimeout(this.choiceTimer);
  }

  /**
   * The move wheel for a real-time battle (null: none): up to four big buttons in an arc round
   * the attack button, each in its move's type colour with its name, tapped to use the move.
   * A ring round the attack button fills as your Streetmon gets ready to act, and the moves
   * pulse when it is. Replaces the row of moves along the bottom of the screen.
   */
  setMoves(rt: { moves: ReadonlyArray<{ name: string; color: string; usable: boolean; queued: boolean; info: string }>; ready: number; commandKeys: boolean } | null): void {
    const on = !!rt && rt.commandKeys && rt.moves.length > 0 && this.mode !== 'menu' && this.mode !== 'hidden';
    this.el.classList.toggle('rt', on);
    document.body.classList.toggle('rt-battle', on);
    if (!on || !rt) {
      if (this.movesKey) {
        this.movesEl.innerHTML = '';
        this.movesKey = '';
      }
      return;
    }
    const ready = rt.ready >= 0.999;
    this.readyEl.style.setProperty('--ready', String(Math.max(0, Math.min(1, rt.ready))));
    this.el.classList.toggle('rt-ready', ready);
    const key = rt.moves.map((m) => `${m.name}|${m.usable ? 1 : 0}|${m.queued ? 1 : 0}|${m.info}`).join(';');
    if (key === this.movesKey) return;
    const fresh = !this.movesKey;
    this.movesKey = key;
    this.movesEl.innerHTML = '';
    const n = rt.moves.length;
    // From straight left of the attack button round to straight above it.
    const R = 112;
    rt.moves.forEach((m, i) => {
      const a = Math.PI + (n === 1 ? Math.PI / 4 : (Math.PI / 2) * (i / (n - 1)));
      const b = document.createElement('button');
      b.className = `tm-move${m.usable ? '' : ' off'}${m.queued ? ' queued' : ''}${fresh ? ' pop' : ''}${m.name.length > 10 ? ' long' : ''}`;
      b.style.setProperty('--tc', m.color);
      b.style.setProperty('--dx', `${Math.round(Math.cos(a) * R)}px`);
      b.style.setProperty('--dy', `${Math.round(Math.sin(a) * R)}px`);
      b.style.animationDelay = fresh ? `${i * 60}ms` : '';
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b')!.textContent = m.name;
      b.querySelector('small')!.textContent = m.info;
      b.setAttribute('aria-label', `${m.name} (${m.info})`);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touched();
        this.buzz();
        this.input.press(`Digit${i + 1}`);
        b.classList.add('down');
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('down'));
      this.movesEl.appendChild(b);
    });
  }

  /** A short tick under the thumb (Android; ignored where vibration isn't available). */
  private buzz(): void {
    try {
      navigator.vibrate?.(8);
    } catch {
      /* not allowed here */
    }
  }

  setMode(mode: TouchMode): void {
    if (mode === this.mode) return;
    // Leaving a mode drops anything held.
    for (const b of this.buttons) {
      if (!b.modes.includes(mode)) {
        if (b.kind === 'hold') this.input.virtual.delete(b.code);
        if (b.kind === 'mouseL') this.input.mouseLeft = this.input.mouseDown = false;
        if (b.kind === 'mouseR' && b.on) {
          b.on = false;
          this.input.mouseRight = false;
          b.el.classList.remove('on');
        }
      }
      b.el.style.display = b.modes.includes(mode) && !b.hidden ? '' : 'none';
    }
    if (mode !== 'car') {
      this.input.virtual.delete('KeyW');
      this.input.virtual.delete('KeyS');
    }
    if (mode !== 'foot') {
      this.input.virtual.delete('AltLeft');
      if (this.autoSprint) this.input.virtual.delete('ShiftLeft');
      this.autoSprint = false;
    }
    this.hideChoices();
    this.mode = mode;
    this.el.classList.toggle('hidden', mode === 'hidden' || mode === 'menu');
    this.el.classList.toggle('battle', mode === 'battle');
    this.el.classList.toggle('car', mode === 'car');
    document.body.classList.toggle('in-car', mode === 'car');
    // In a battle the stick isn't needed and would cover the move bar: the overlay only takes
    // the look drag and its own buttons.
    this.el.classList.toggle('passthrough', mode === 'battle');
  }
}
