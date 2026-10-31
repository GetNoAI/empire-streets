/** Keyboard + mouse (pointer lock) state. Key names are KeyboardEvent.code values. */
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

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** True once per key press. */
  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  axis(neg: string[], pos: string[]): number {
    return (this.isDown(...pos) ? 1 : 0) - (this.isDown(...neg) ? 1 : 0);
  }

  /** Milliseconds since the mouse last moved the camera. */
  get mouseIdleMs(): number {
    return performance.now() - this.lastMouseMove;
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.target;
  }

  requestPointerLock(): void {
    const req = this.target.requestPointerLock as unknown as (() => Promise<void> | void) | undefined;
    try {
      const r = req?.call(this.target);
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
    } catch {
      /* Some browsers refuse pointer lock outside a user gesture; the next click retries. */
    }
  }

  /** Call once at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
