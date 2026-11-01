/**
 * Keyboard + mouse (pointer lock) state, plus what the on-screen controls (src/mobile/Touch.ts)
 * and gamepads (src/core/Gamepad.ts) feed in: every device ends up as the same key codes, sticks
 * and look deltas, so the game reads one set of actions. Key names are KeyboardEvent.code values.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseDown = false;
  /** Left / right mouse buttons. */
  mouseLeft = false;
  mouseRight = false;
  /** Wheel notches this frame (+ = down/next). */
  wheel = 0;
  private lastMouseMove = 0;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.isTrusted) this.device = 'keyboard';
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (document.pointerLockElement !== this.target) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      if (e.movementX || e.movementY) this.device = 'keyboard';
      this.lastMouseMove = performance.now();
    });
    window.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      if (e.button === 0) this.mouseLeft = true;
      if (e.button === 2) this.mouseRight = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseDown = false;
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener(
      'wheel',
      (e) => {
        if (document.pointerLockElement === this.target) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    window.addEventListener('blur', () => {
      this.mouseLeft = false;
      this.mouseRight = false;
    });
  }

  /** Mouse position in the window (for hovering when the pointer isn't locked). */
  mouseX = -1;
  mouseY = -1;

  // ---- touch (the on-screen controls, src/mobile/Touch.ts, feed these)

  /** Key codes held by on-screen buttons. */
  readonly virtual = new Set<string>();
  /** Analogue sticks: x (-1 left .. 1 right, the A/D axis) and y (-1 back .. 1 forward, the S/W axis). */
  stick: { x: number; y: number } | null = null;
  /** The right half of the screen dragged (camera look), added to the mouse deltas each frame. */
  touchLookDX = 0;
  touchLookDY = 0;
  /** True while any on-screen control is in use (keeps the pointer-lock logic out of the way). */
  touch = false;

  // ---- gamepad (src/core/Gamepad.ts feeds these every frame)

  /** Key codes held by pad buttons. */
  readonly padHeld = new Set<string>();
  /** The pad's left stick (same axes as `stick`), null when centred. */
  pad: { x: number; y: number } | null = null;
  /** Right stick look this frame, in mouse pixels. */
  padLookDX = 0;
  padLookDY = 0;
  /** Analogue pedals (the triggers when driving), 0..1. */
  throttle = 0;
  brake = 0;
  /** What you used last: prompts show pad buttons after a pad, keys after the keyboard. */
  device: 'keyboard' | 'pad' | 'touch' = 'keyboard';

  /** An on-screen button press (counts once, like a key press). */
  press(code: string): void {
    this.pressed.add(code);
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c) || this.virtual.has(c) || this.padHeld.has(c));
  }

  /** True once per key press. */
  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  axis(neg: string[], pos: string[]): number {
    const digital = (this.isDown(...pos) ? 1 : 0) - (this.isDown(...neg) ? 1 : 0);
    // The sticks (touch or pad, whichever is pushed further) stand in for A/D (x) and S/W (y) wherever those keys are read.
    const st = this.stick && this.pad ? (Math.hypot(this.stick.x, this.stick.y) >= Math.hypot(this.pad.x, this.pad.y) ? this.stick : this.pad) : (this.stick ?? this.pad);
    if (st) {
      if (neg.includes('KeyA') && pos.includes('KeyD')) return digital || st.x;
      if (neg.includes('KeyS') && pos.includes('KeyW')) return digital || st.y;
    }
    return digital;
  }

  /** Milliseconds since the mouse last moved the camera. */
  get mouseIdleMs(): number {
    return performance.now() - this.lastMouseMove;
  }

  get pointerLocked(): boolean {
    // On a touch screen there's no pointer to lock: the game treats it as locked (no pause on a lost lock).
    return this.touch || document.pointerLockElement === this.target;
  }

  requestPointerLock(): void {
    if (this.touch) return;
    const req = this.target.requestPointerLock as unknown as (() => Promise<void> | void) | undefined;
    try {
      const r = req?.call(this.target);
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
    } catch {
      /* Some browsers refuse pointer lock outside a user gesture; the next click retries. */
    }
  }

  /** The camera deltas this frame: the mouse (pointer locked) plus any touch look. */
  takeLook(): { dx: number; dy: number } {
    const dx = this.mouseDX + this.touchLookDX + this.padLookDX;
    const dy = this.mouseDY + this.touchLookDY + this.padLookDY;
    this.touchLookDX = 0;
    this.touchLookDY = 0;
    this.padLookDX = 0;
    this.padLookDY = 0;
    return { dx, dy };
  }

  /** Call once at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.touchLookDX = 0;
    this.touchLookDY = 0;
    this.padLookDX = 0;
    this.padLookDY = 0;
    this.wheel = 0;
  }
}
