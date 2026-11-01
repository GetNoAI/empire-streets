import type { Input } from '../core/Input';

/**
 * On-screen controls for phones and tablets. Everything goes through the same Input the keyboard
 * uses, so the game needs no touch-specific code:
 *
 *  - a stick on the left (where you first touch) moves you on foot and steers the car;
 *  - dragging anywhere on the right looks around (the mouse);
 *  - buttons on the right for what the situation needs: on foot (jump, sprint, interact, fight,
 *    fire, aim, map), in a car (gas, brake, handbrake, horn, nitrous, out, map), in a battle the
 *    game's own menus are tapped directly;
 *  - a pause button top right;
 *  - a context button that names what E (or whichever key) would do right here ("Go into Sal's
 *    Corner Deli", "Climb out", "Open the vault box"): the game passes its prompt every frame;
 *  - pushing the stick all the way breaks into a sprint (no button needed), and buttons buzz
 *    lightly under the thumb where the phone allows it.
 *
 * `setMode` picks which buttons show; the game calls it every frame with what the player is doing.
 */

export type TouchMode = 'foot' | 'car' | 'battle' | 'menu' | 'hidden';

interface Btn {
  el: HTMLButtonElement;
  code: string;
  /** Hold: key held while touched. Tap: a key press on touch. Toggle: flips each tap. Mouse: a mouse button. */
  kind: 'hold' | 'tap' | 'toggle' | 'mouseL' | 'mouseR';
  modes: TouchMode[];
  cls: string;
  on?: boolean;
  /** Hidden by the game for now (a button for something that isn't on offer). */
  hidden?: boolean;
}

const LOOK_SPEED = 2.2;
/** Stick pushed this far (0..1) on foot and you sprint. */
const SPRINT_PUSH = 0.94;

/** Which key a prompt's first word stands for (the HUD prompts read "E  Get in the Sedan"). */
const PROMPT_KEYS: Record<string, string> = { E: 'KeyE', B: 'KeyB', C: 'KeyC', F: 'KeyF', R: 'KeyR', Space: 'Space', Y: 'KeyY' };

/** What a keyboard key is on the touch screen, for tips written with keys ("{E}", "{Shift}"). */
const TOUCH_KEYS: Record<string, string> = {
  W: 'the stick', A: 'the stick', S: 'the stick', D: 'the stick',
  Mouse: 'a drag on the right', Shift: 'the stick pushed all the way', Alt: 'a light push on the stick',
  Space: 'JUMP', E: 'the green button', F: 'the green button', B: 'FIGHT', C: 'THROW', Q: 'WPN', Tab: 'WPN',
  M: 'MAP', I: 'TEAM', T: 'QUICK', H: 'HORN', V: 'CAM', Y: 'Y', R: 'RELOAD / FLIP', LMB: 'FIRE', RMB: 'AIM',
  Esc: 'II', Enter: 'the button', Z: 'ROLL', X: 'FLEE', '5': 'SWAP',
  '1': 'a move', '2': 'a move', '3': 'a move', '4': 'a move', '8': 'WPN',
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

  constructor(
    parent: HTMLElement,
    private readonly input: Input,
    private readonly onPause: () => void,
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
    pause.textContent = 'II';
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
      this.input.touch = true;
      this.input.device = 'touch';
      this.input.press(this.ctx.code);
      this.ctxBtn.classList.add('down');
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.ctxBtn.addEventListener(ev, () => this.ctxBtn.classList.remove('down'));
    this.el.appendChild(this.ctxBtn);
    // Buttons: [label, code, kind, modes, class]
    const defs: Array<[string, string, Btn['kind'], TouchMode[], string]> = [
      ['GAS', 'KeyW', 'hold', ['car'], 'gas'],
      ['BRAKE', 'KeyS', 'hold', ['car'], 'brake'],
      ['HAND', 'Space', 'hold', ['car'], 'hb'],
      ['NOS', 'ShiftLeft', 'hold', ['car'], 'nos'],
      ['HORN', 'KeyH', 'hold', ['car'], 'horn'],
      ['OUT', 'KeyF', 'tap', ['car'], 'out'],
      ['CAM', 'KeyV', 'tap', ['car'], 'cam'],
      ['RACE', 'KeyY', 'tap', ['car'], 'yes'],
      ['JUMP', 'Space', 'tap', ['foot'], 'jump'],
      ['RUN', 'ShiftLeft', 'toggle', ['foot'], 'run'],
      ['USE', 'KeyE', 'tap', ['foot'], 'use'],
      ['FIGHT', 'KeyB', 'tap', ['foot'], 'fight'],
      ['FIRE', 'MouseL', 'mouseL', ['foot'], 'fire'],
      ['AIM', 'MouseR', 'mouseR', ['foot'], 'aim'],
      ['THROW', 'KeyC', 'tap', ['foot'], 'throw'],
      ['TEAM', 'KeyI', 'tap', ['foot', 'car'], 'team'],
      ['QUICK', 'KeyT', 'hold', ['foot', 'car'], 'quick'],
      ['MAP', 'KeyM', 'tap', ['foot', 'car'], 'map'],
      ['WPN', 'KeyQ', 'tap', ['foot'], 'wpn'],
      ['RELOAD', 'KeyR', 'tap', ['foot'], 'reload'],
      ['ROLL', 'KeyZ', 'tap', ['foot'], 'roll'],
      ['FLIP', 'KeyR', 'tap', ['car'], 'reload'],
      ['SHOOT', 'MouseL', 'mouseL', ['battle'], 'fire'],
      ['AIM', 'MouseR', 'mouseR', ['battle'], 'aim'],
      ['SWAP', 'Digit5', 'tap', ['battle'], 'swap'],
      ['FLEE', 'KeyX', 'tap', ['battle'], 'flee'],
      ['CUFF', 'KeyC', 'tap', ['battle'], 'cuff'],
      ['T', 'KeyT', 'tap', ['battle'], 'tkeys'],
    ];
    for (const [label, code, kind, modes, cls] of defs) {
      const b = document.createElement('button');
      b.className = `touch-btn tb-${cls}`;
      b.textContent = label;
      const btn: Btn = { el: b, code, kind, modes, cls, hidden: cls === 'yes' };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.touch = true;
        this.input.device = 'touch';
        this.buzz();
        b.classList.add('down');
        if (kind === 'hold') this.input.virtual.add(code);
        else if (kind === 'tap') this.input.press(code);
        else if (kind === 'toggle') {
          btn.on = !btn.on;
          if (btn.on) this.input.virtual.add(code);
          else this.input.virtual.delete(code);
          b.classList.toggle('on', !!btn.on);
        } else if (kind === 'mouseL') this.input.mouseLeft = this.input.mouseDown = true;
        else if (kind === 'mouseR') {
          btn.on = !btn.on;
          this.input.mouseRight = !!btn.on;
          b.classList.toggle('on', !!btn.on);
        }
      });
      const up = (e: Event): void => {
        e.preventDefault();
        b.classList.remove('down');
        if (kind === 'hold') this.input.virtual.delete(code);
        else if (kind === 'mouseL') this.input.mouseLeft = this.input.mouseDown = false;
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      this.el.appendChild(b);
      this.buttons.push(btn);
    }
    // The stick and the look area: the empty parts of the overlay.
    this.el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      this.input.touch = true;
      const left = e.clientX < window.innerWidth * 0.42;
      if (left && this.stickId === null && this.mode !== 'battle') {
        this.stickId = e.pointerId;
        this.stickOrigin = { x: e.clientX, y: e.clientY };
        this.stickEl.style.display = 'block';
        this.stickEl.style.left = `${e.clientX - this.radius}px`;
        this.stickEl.style.top = `${e.clientY - this.radius}px`;
        this.input.stick = { x: 0, y: 0 };
        this.capture(e.pointerId);
      } else if (this.lookId === null) {
        this.lookId = e.pointerId;
        this.lookLast = { x: e.clientX, y: e.clientY };
        this.capture(e.pointerId);
      }
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.stickOrigin.x;
        let dy = e.clientY - this.stickOrigin.y;
        const d = Math.hypot(dx, dy);
        if (d > this.radius) {
          dx *= this.radius / d;
          dy *= this.radius / d;
        }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        const dead = 0.12;
        const nx = dx / this.radius;
        const ny = -dy / this.radius;
        const shape = (v: number): number => (Math.abs(v) < dead ? 0 : Math.sign(v) * ((Math.abs(v) - dead) / (1 - dead)));
        this.input.stick = { x: shape(nx), y: shape(ny) };
        // On foot, the stick pushed right out is a sprint (unless RUN is already toggled on).
        if (this.mode === 'foot') {
          const full = Math.hypot(nx, ny) >= SPRINT_PUSH;
          const toggled = this.buttons.some((b) => b.kind === 'toggle' && b.code === 'ShiftLeft' && b.on);
          if (full && !this.autoSprint && !toggled) this.input.virtual.add('ShiftLeft');
          if (!full && this.autoSprint && !toggled) this.input.virtual.delete('ShiftLeft');
          this.autoSprint = full;
          // A light push is a quiet walk (wild Streetmon notice you less), like holding Alt.
          const m = Math.hypot(nx, ny);
          if (m > 0.15 && m < 0.5) this.input.virtual.add('AltLeft');
          else this.input.virtual.delete('AltLeft');
        }
        // In a car the stick's forward half is the gas too (a thumb's natural push).
        if (this.mode === 'car') {
          if (ny > 0.5) this.input.virtual.add('KeyW');
          else this.input.virtual.delete('KeyW');
        }
      } else if (e.pointerId === this.lookId) {
        this.input.touchLookDX += (e.clientX - this.lookLast.x) * LOOK_SPEED;
        this.input.touchLookDY += (e.clientY - this.lookLast.y) * LOOK_SPEED;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.stickEl.style.display = 'none';
        this.knob.style.transform = '';
        this.input.stick = null;
        if (this.autoSprint && !this.buttons.some((b) => b.kind === 'toggle' && b.code === 'ShiftLeft' && b.on)) this.input.virtual.delete('ShiftLeft');
        this.autoSprint = false;
        this.input.virtual.delete('AltLeft');
        if (this.mode === 'car' && !this.buttons.some((b) => b.code === 'KeyW' && b.el.classList.contains('down'))) this.input.virtual.delete('KeyW');
      } else if (e.pointerId === this.lookId) this.lookId = null;
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    parent.appendChild(this.el);
    this.setMode('hidden');
  }

  private capture(id: number): void {
    try {
      this.el.setPointerCapture(id);
    } catch {
      /* a pointer that's already gone */
    }
  }

  /** Shows or hides one button by its class (RACE only while a race is on offer, say). */
  setButtonShown(cls: string, on: boolean): void {
    for (const b of this.buttons) {
      if (b.cls !== cls) continue;
      if (b.hidden === !on) return;
      b.hidden = !on;
      b.el.style.display = !b.hidden && b.modes.includes(this.mode) ? '' : 'none';
    }
  }

  /** The game's current prompt (or ''): shown as the context button while on foot or driving. */
  setContext(prompt: string): void {
    const c = this.mode === 'foot' || this.mode === 'car' ? contextFromPrompt(prompt) : null;
    if (c?.code === this.ctx?.code && c?.label === this.ctx?.label) return;
    this.ctx = c;
    this.ctxBtn.style.display = c ? '' : 'none';
    document.body.classList.toggle('has-ctx', !!c);
    if (c) this.ctxBtn.textContent = c.label;
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
        if (b.kind === 'toggle' && b.on) {
          b.on = false;
          this.input.virtual.delete(b.code);
          b.el.classList.remove('on');
        }
        if (b.kind === 'mouseL') this.input.mouseLeft = this.input.mouseDown = false;
        if (b.kind === 'mouseR' && b.on) {
          b.on = false;
          this.input.mouseRight = false;
          b.el.classList.remove('on');
        }
      }
      b.el.style.display = b.modes.includes(mode) && !b.hidden ? '' : 'none';
    }
    if (mode !== 'car') this.input.virtual.delete('KeyW');
    if (mode !== 'foot') {
      this.input.virtual.delete('AltLeft');
      if (this.autoSprint && !this.buttons.some((b) => b.kind === 'toggle' && b.code === 'ShiftLeft' && b.on)) this.input.virtual.delete('ShiftLeft');
      this.autoSprint = false;
    }
    this.mode = mode;
    this.el.classList.toggle('hidden', mode === 'hidden' || mode === 'menu');
    this.el.classList.toggle('battle', mode === 'battle');
    this.el.classList.toggle('car', mode === 'car');
    // In a battle the stick isn't needed and would cover the move bar: the overlay only takes
    // the look drag and its own buttons.
    this.el.classList.toggle('passthrough', mode === 'battle');
  }
}
