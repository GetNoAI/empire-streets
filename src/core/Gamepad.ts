import type { Input } from './Input';

/**
 * The unified input layer for controllers. Keyboard, mouse, touch and gamepad all end up in the
 * same `Input`, so the game reads one set of actions whatever you hold:
 *
 *  - `padFrame` (engine-free, unit-tested) turns a gamepad's buttons and sticks into those
 *    actions for the current context: on foot, driving, a real-time fight, the city map, or a
 *    menu. Each context has its own button map (PAD_MAPS), so A is jump on foot and the handbrake
 *    in a car, the triggers fire and aim on foot and are an analogue throttle and brake in a car.
 *  - `PadInput` polls the browser's gamepads each frame, applies that to `Input` (held keys, the
 *    move stick, look deltas, the analogue pedals, mouse buttons) and, in menus, moves a focus
 *    ring between the on-screen buttons (d-pad or left stick; A clicks, B backs out).
 *  - It also remembers which device you used last, so prompts can show pad buttons (`padGlyph`).
 *
 * Standard mapping (Xbox names): 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start,
 * 10 left stick click, 11 right stick click, 12-15 d-pad up, down, left, right.
 */

export type PadContext = 'foot' | 'car' | 'battle' | 'map' | 'ui';

export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export const PAD = {
  /** Stick dead zone and trigger threshold. */
  dead: 0.2,
  trigger: 0.08,
  /** On foot, the left stick tilted less than this (after the dead zone) crouches. */
  crouchTilt: 0.4,
  /** Right stick at full tilt turns the camera this many mouse pixels a second. */
  look: 820,
  /** Menus: hold a direction to repeat (first after `delay`, then every `repeat` seconds). */
  delay: 0.36,
  repeat: 0.14,
} as const;

/** Key codes, plus 'MouseL' / 'MouseR' (the mouse buttons) and 'WheelUp' / 'WheelDown' (weapon cycling). */
export type PadCode = string;

/** Button index -> key code, per context. `heist` swaps the d-pad sides to the crew's abilities. */
export const PAD_MAPS: Record<Exclude<PadContext, 'ui'>, Partial<Record<number, PadCode>>> = {
  foot: {
    [BTN.A]: 'Space',
    [BTN.B]: 'KeyB',
    [BTN.X]: 'KeyE',
    // Y rolls on foot (dives with a gun up); X still gets you into cars.
    [BTN.Y]: 'KeyZ',
    [BTN.LB]: 'KeyT',
    [BTN.RB]: 'KeyC',
    [BTN.LT]: 'MouseR',
    [BTN.RT]: 'MouseL',
    [BTN.BACK]: 'KeyM',
    [BTN.START]: 'Escape',
    [BTN.LS]: 'ShiftLeft',
    [BTN.RS]: 'KeyV',
    [BTN.UP]: 'KeyI',
    [BTN.DOWN]: 'KeyR',
    [BTN.LEFT]: 'WheelUp',
    [BTN.RIGHT]: 'WheelDown',
  },
  car: {
    [BTN.A]: 'Space',
    [BTN.B]: 'KeyX',
    [BTN.X]: 'KeyR',
    [BTN.Y]: 'KeyF',
    [BTN.LB]: 'KeyT',
    [BTN.RB]: 'ShiftLeft',
    [BTN.BACK]: 'KeyM',
    [BTN.START]: 'Escape',
    [BTN.LS]: 'KeyH',
    [BTN.RS]: 'KeyV',
    [BTN.UP]: 'KeyY',
    [BTN.DOWN]: 'KeyG',
    [BTN.LEFT]: 'Backspace',
    [BTN.RIGHT]: 'KeyE',
  },
  battle: {
    [BTN.A]: 'Digit1',
    [BTN.X]: 'Digit2',
    [BTN.Y]: 'Digit3',
    [BTN.B]: 'Digit4',
    [BTN.RB]: 'Digit5',
    [BTN.LB]: 'KeyC',
    [BTN.LT]: 'MouseR',
    [BTN.RT]: 'MouseL',
    [BTN.START]: 'Escape',
    [BTN.LS]: 'ShiftLeft',
    [BTN.UP]: 'KeyT',
    [BTN.DOWN]: 'KeyX',
    [BTN.LEFT]: 'WheelUp',
    [BTN.RIGHT]: 'WheelDown',
  },
  map: {
    [BTN.B]: 'Escape',
    [BTN.BACK]: 'KeyM',
    [BTN.START]: 'Escape',
    [BTN.X]: 'KeyC',
    [BTN.LB]: 'KeyQ',
    [BTN.RB]: 'KeyE',
  },
};

/** During a heist the d-pad's sides are the crew's abilities: Z (Hacker) and X (Smoke). */
const HEIST_OVERRIDES: Partial<Record<Exclude<PadContext, 'ui'>, Partial<Record<number, PadCode>>>> = {
  foot: { [BTN.LEFT]: 'KeyZ', [BTN.RIGHT]: 'KeyX' },
  car: { [BTN.LEFT]: 'KeyZ' },
};

export interface PadSnapshot {
  /** Button values 0..1 (triggers are analogue). */
  buttons: readonly number[];
  axes: readonly number[];
}

export interface PadFrame {
  /** Codes held, and the ones that went down this frame. */
  hold: Set<string>;
  press: string[];
  /** Left stick (x right, y forward), null when centred. */
  move: { x: number; y: number } | null;
  /** Right stick, -1..1 each way (y down = positive, like the mouse). */
  look: { x: number; y: number };
  /** Driving: analogue throttle (RT) and brake (LT), 0..1. */
  throttle: number;
  brake: number;
  /** Menu directions pressed this frame (with auto-repeat applied by the caller). */
  dirs: { up: boolean; down: boolean; left: boolean; right: boolean };
  /** Anything at all touched (for "last device used"). */
  active: boolean;
}

/** Dead zone with the range rescaled, so a small push still starts at zero. */
export function deadzone(v: number, dz = PAD.dead): number {
  const a = Math.abs(v);
  return a < dz ? 0 : Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

/** Radial dead zone for a stick (keeps diagonals round). */
export function stick(x: number, y: number, dz = PAD.dead): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * k, y: y * k };
}

/**
 * One frame of a pad: what's held and pressed in `ctx`, given the buttons held last frame
 * (`prev`, updated in place).
 */
export function padFrame(s: PadSnapshot, prev: boolean[], ctx: PadContext, o: { heist?: boolean } = {}): PadFrame {
  const val = (i: number): number => s.buttons[i] ?? 0;
  const down = (i: number): boolean => val(i) > (i === BTN.LT || i === BTN.RT ? PAD.trigger : 0.5);
  const edge = (i: number): boolean => down(i) && !prev[i];
  const out: PadFrame = { hold: new Set(), press: [], move: null, look: { x: 0, y: 0 }, throttle: 0, brake: 0, dirs: { up: false, down: false, left: false, right: false }, active: false };
  const n = Math.max(16, s.buttons.length);
  for (let i = 0; i < n; i++) if (down(i)) out.active = true;
  const ls = stick(s.axes[0] ?? 0, s.axes[1] ?? 0);
  const rs = stick(s.axes[2] ?? 0, s.axes[3] ?? 0);
  if (ls.x || ls.y || rs.x || rs.y) out.active = true;
  if (ctx === 'ui') {
    out.dirs = { up: edge(BTN.UP), down: edge(BTN.DOWN), left: edge(BTN.LEFT), right: edge(BTN.RIGHT) };
    if (edge(BTN.A)) out.press.push('Enter');
    if (edge(BTN.B) || edge(BTN.START)) out.press.push('Escape');
    out.move = ls.x || ls.y ? { x: ls.x, y: -ls.y } : null;
    out.look = rs;
  } else {
    const map = { ...PAD_MAPS[ctx], ...(o.heist ? HEIST_OVERRIDES[ctx] : {}) };
    for (const [k, code] of Object.entries(map)) {
      const i = Number(k);
      if (!code) continue;
      if (down(i)) out.hold.add(code);
      if (edge(i)) out.press.push(code);
    }
    // Stick y is up = -1 on a pad; the game's forward is +1.
    if (ctx === 'car') {
      // Steer with the left stick; the pedals are the triggers.
      out.move = ls.x ? { x: ls.x, y: 0 } : null;
      out.throttle = Math.max(0, (val(BTN.RT) - PAD.trigger) / (1 - PAD.trigger));
      out.brake = Math.max(0, (val(BTN.LT) - PAD.trigger) / (1 - PAD.trigger));
    } else {
      out.move = ls.x || ls.y ? { x: ls.x, y: -ls.y } : null;
      // On foot a light tilt of the stick is a crouch (like Alt, or a light push on a phone).
      const m = Math.hypot(ls.x, ls.y);
      if (ctx === 'foot' && m > 0 && m < PAD.crouchTilt) out.hold.add('AltLeft');
    }
    // A gentle curve on the right stick: fine aim near the centre, quick turns at full tilt.
    out.look = { x: Math.sign(rs.x) * rs.x * rs.x, y: Math.sign(rs.y) * rs.y * rs.y };
  }
  for (let i = 0; i < n; i++) prev[i] = down(i);
  return out;
}

/** What to show in a prompt for a key, when you're on a pad: the button that does it there. */
export function padGlyph(code: string, ctx: PadContext, o: { heist?: boolean } = {}): string | null {
  if (ctx === 'ui') return null;
  const map = { ...PAD_MAPS[ctx], ...(o.heist ? HEIST_OVERRIDES[ctx] : {}) };
  const names = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];
  for (const [k, c] of Object.entries(map)) if (c === code) return names[Number(k)] ?? null;
  return null;
}

/** "E  Get in the Sedan" -> "X  Get in the Sedan" on a pad (prompts start with the key, then two spaces). */
export function padPrompt(prompt: string, ctx: PadContext, o: { heist?: boolean } = {}): string {
  const m = /^([A-Z0-9]{1,9})( {2}|\s\/)/.exec(prompt);
  if (!m) return prompt;
  const code = /^[A-Z]$/.test(m[1]) ? `Key${m[1]}` : m[1] === 'Esc' ? 'Escape' : /^[0-9]$/.test(m[1]) ? `Digit${m[1]}` : m[1];
  const g = padGlyph(code, ctx, o);
  return g ? `${g}${prompt.slice(m[1].length)}` : prompt;
}

// ------------------------------------------------------------------ the browser side

export class PadInput {
  private prev: boolean[] = [];
  private ctx: PadContext = 'ui';
  private heist = false;
  private connected = false;
  private focused: HTMLElement | null = null;
  private held: { dir: keyof PadFrame['dirs'] | null; t: number } = { dir: null, t: 0 };
  private mouseL = false;
  private mouseR = false;
  /** The sticks right now (-1..1, y down), for the quick-select wheel. */
  stickNow: { x: number; y: number } = { x: 0, y: 0 };
  lookNow: { x: number; y: number } = { x: 0, y: 0 };

  constructor(private readonly input: Input) {
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', () => {
      this.connected = true;
    });
  }

  get context(): PadContext {
    return this.ctx;
  }

  get inHeist(): boolean {
    return this.heist;
  }

  /** The first connected pad, if any. */
  private pad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  }

  /** Every frame, before the game reads Input. */
  update(dt: number, ctx: PadContext, o: { heist?: boolean } = {}): void {
    const inp = this.input;
    // Last frame's pad state comes off first.
    inp.padHeld.clear();
    inp.pad = null;
    inp.throttle = 0;
    inp.brake = 0;
    const gp = this.pad();
    if (!gp) {
      if (this.mouseL) inp.mouseLeft = inp.mouseDown = this.mouseL = false;
      if (this.mouseR) inp.mouseRight = this.mouseR = false;
      this.clearFocus();
      return;
    }
    this.connected = true;
    if (ctx !== this.ctx && ctx !== 'ui') this.clearFocus();
    this.ctx = ctx;
    this.heist = !!o.heist;
    const f = padFrame({ buttons: gp.buttons.map((b) => b.value || (b.pressed ? 1 : 0)), axes: gp.axes }, this.prev, ctx, o);
    if (f.active) inp.device = 'pad';
    this.stickNow = f.move ? { x: f.move.x, y: -f.move.y } : { x: 0, y: 0 };
    this.lookNow = stick(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
    if (ctx === 'ui') {
      this.menu(dt, f);
      return;
    }
    for (const c of f.hold) {
      if (c === 'MouseL' || c === 'MouseR' || c.startsWith('Wheel')) continue;
      inp.padHeld.add(c);
    }
    for (const c of f.press) {
      if (c === 'WheelUp') inp.wheel -= 1;
      else if (c === 'WheelDown') inp.wheel += 1;
      else if (c !== 'MouseL' && c !== 'MouseR') inp.press(c);
    }
    const l = f.hold.has('MouseL');
    if (l !== this.mouseL) inp.mouseLeft = inp.mouseDown = this.mouseL = l;
    const r = f.hold.has('MouseR');
    if (r !== this.mouseR) inp.mouseRight = this.mouseR = r;
    inp.pad = f.move;
    inp.throttle = f.throttle;
    inp.brake = f.brake;
    inp.padLookDX += f.look.x * PAD.look * dt;
    inp.padLookDY += f.look.y * PAD.look * dt;
  }

  get hasPad(): boolean {
    return this.connected && !!this.pad();
  }

  // ---- menus: a focus ring over the visible buttons

  private menu(dt: number, f: PadFrame): void {
    if (this.mouseL) this.input.mouseLeft = this.input.mouseDown = this.mouseL = false;
    if (this.mouseR) this.input.mouseRight = this.mouseR = false;
    // The left stick works like the d-pad (with repeat), and holding either repeats.
    const m = f.move;
    const stickDir: keyof PadFrame['dirs'] | null = m && Math.hypot(m.x, m.y) > 0.6 ? (Math.abs(m.x) > Math.abs(m.y) ? (m.x > 0 ? 'right' : 'left') : m.y > 0 ? 'down' : 'up') : null;
    const dpad = (Object.keys(f.dirs) as Array<keyof PadFrame['dirs']>).find((k) => f.dirs[k]) ?? null;
    let go: keyof PadFrame['dirs'] | null = null;
    const heldDir = dpad ?? stickDir ?? (this.held.dir && this.dirStillHeld(this.held.dir) ? this.held.dir : null);
    if (heldDir !== this.held.dir) {
      this.held = { dir: heldDir, t: 0 };
      go = heldDir;
    } else if (heldDir) {
      this.held.t += dt;
      if (this.held.t > PAD.delay) {
        this.held.t -= PAD.repeat;
        go = heldDir;
      }
    }
    if (go) this.move(go);
    for (const c of f.press) {
      if (c === 'Enter') {
        const el = this.valid(this.focused) ? this.focused : this.first();
        if (el) {
          this.setFocus(el);
          el.click();
        } else this.key('Enter');
      } else if (c === 'Escape') this.key('Escape');
    }
    // Right stick scrolls whatever's under the focus ring (long lists).
    if (f.look.y && this.focused) {
      const sc = scrollParent(this.focused);
      if (sc) sc.scrollTop += f.look.y * 900 * dt;
    }
  }

  private dirStillHeld(dir: keyof PadFrame['dirs']): boolean {
    const gp = this.pad();
    if (!gp) return false;
    const i = { up: BTN.UP, down: BTN.DOWN, left: BTN.LEFT, right: BTN.RIGHT }[dir];
    return !!gp.buttons[i]?.pressed;
  }

  /** A key event for the menus that listen for keys themselves (Esc to close, Enter to confirm). */
  private key(code: string): void {
    this.input.press(code);
    const k = code === 'Escape' ? 'Escape' : code === 'Enter' ? 'Enter' : code;
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: k, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: k, bubbles: true }));
  }

  private candidates(): HTMLElement[] {
    const els = Array.from(document.querySelectorAll<HTMLElement>('button, [data-nav], a[href], input[type="range"], select'));
    return els.filter((el) => this.valid(el));
  }

  private valid(el: HTMLElement | null): el is HTMLElement {
    if (!el || !el.isConnected) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    if (el.closest('.touch')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || Number(cs.opacity) === 0) return false;
    // Not covered by something else (an open panel over the HUD, a dialog over a menu).
    const x = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  }

  private first(): HTMLElement | null {
    const c = this.candidates();
    c.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    return c[0] ?? null;
  }

  private move(dir: keyof PadFrame['dirs']): void {
    const cur = this.valid(this.focused) ? this.focused : null;
    if (!cur) {
      const f = this.first();
      if (f) this.setFocus(f);
      return;
    }
    // A slider takes left/right itself.
    if (cur instanceof HTMLInputElement && cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      if (dir === 'left') cur.stepDown();
      else cur.stepUp();
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const pick = nearestInDirection(
      centre(cur.getBoundingClientRect()),
      this.candidates()
        .filter((e) => e !== cur)
        .map((e) => ({ e, c: centre(e.getBoundingClientRect()) })),
      dir,
    );
    if (pick) this.setFocus(pick);
  }

  private setFocus(el: HTMLElement): void {
    if (this.focused && this.focused !== el) this.focused.classList.remove('pad-focus');
    this.focused = el;
    el.classList.add('pad-focus');
    try {
      el.focus({ preventScroll: false });
    } catch {
      /* not focusable */
    }
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    // Hover styles and hover-driven panels (move details) follow the ring.
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  }

  private clearFocus(): void {
    this.focused?.classList.remove('pad-focus');
    this.focused = null;
  }
}

function centre(r: DOMRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** The candidate best placed in a direction from `from` (closest along it, penalising sideways drift). */
export function nearestInDirection<T>(from: { x: number; y: number }, cands: ReadonlyArray<{ e: T; c: { x: number; y: number } }>, dir: 'up' | 'down' | 'left' | 'right'): T | null {
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  let best: T | null = null;
  let bestScore = Infinity;
  for (const { e, c } of cands) {
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const along = dx * d[0] + dy * d[1];
    if (along < 4) continue;
    const side = Math.abs(dx * d[1] - dy * d[0]);
    const score = along + side * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const cs = getComputedStyle(p);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}
