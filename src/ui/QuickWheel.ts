/**
 * The quick-select wheel (hold T, or LB on a pad): your team round the top half, your capture
 * items round the bottom. Point at one (mouse, right stick, or tap/click it) and let go:
 *
 *  - a Streetmon becomes your lead (the one at your side and first into a fight);
 *  - a capture item is thrown straight away at the nearest wild Streetmon, from the car too, so
 *    you can bag one mid-chase.
 *
 * Time slows while it's open (the game scales its clock). `wheelLayout` and `wheelPick` are
 * engine-free (unit-tested); the class is the DOM.
 */

export interface WheelEntry {
  kind: 'mon' | 'item';
  /** Party index for a Streetmon, item id for a capture item. */
  key: string;
  label: string;
  sub: string;
  /** Icon markup (an <img> or an emoji span). */
  icon: string;
  /** Greyed out (fainted, or the current lead). */
  disabled?: boolean;
  current?: boolean;
}

/**
 * Angles for the entries, radians in screen space (0 = right, PI/2 = down): Streetmon spread
 * over the top half, items over the bottom half (either side takes the whole wheel when the
 * other is empty).
 */
export function wheelLayout(nMon: number, nItem: number): number[] {
  const spread = (n: number, from: number, to: number): number[] => (n === 1 ? [(from + to) / 2] : Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1)));
  if (!nItem) return spread(nMon, -Math.PI * 0.5 - (Math.PI * (nMon - 1)) / Math.max(1, nMon), -Math.PI * 0.5 + (Math.PI * (nMon - 1)) / Math.max(1, nMon));
  if (!nMon) return spread(nItem, Math.PI * 0.5 - (Math.PI * (nItem - 1)) / Math.max(1, nItem), Math.PI * 0.5 + (Math.PI * (nItem - 1)) / Math.max(1, nItem));
  // Top: -153°..-27°; bottom: 27°..153° (left to right along the top, right to left along the bottom), a clear gap at each side.
  return [...spread(nMon, -Math.PI * 0.85, -Math.PI * 0.15), ...spread(nItem, Math.PI * 0.15, Math.PI * 0.85).reverse()];
}

/** The entry nearest the direction (vx, vy), or -1 if the pointer is near the middle. */
export function wheelPick(angles: readonly number[], vx: number, vy: number, minR = 0.35): number {
  if (!angles.length || Math.hypot(vx, vy) < minR) return -1;
  const a = Math.atan2(vy, vx);
  let best = -1;
  let bestD = Infinity;
  angles.forEach((b, i) => {
    const d = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Wheel radius (px) so neighbouring slots (86 px) don't overlap: wider for a full team. */
export function wheelRadius(angles: readonly number[]): number {
  let gap = Math.PI;
  for (let i = 0; i < angles.length; i++)
    for (let j = i + 1; j < angles.length; j++) gap = Math.min(gap, Math.abs(Math.atan2(Math.sin(angles[i] - angles[j]), Math.cos(angles[i] - angles[j]))));
  return Math.round(Math.max(140, Math.min(240, 50 / Math.sin(gap / 2))));
}

export class QuickWheel {
  private readonly el: HTMLDivElement;
  private readonly centre: HTMLDivElement;
  private entries: WheelEntry[] = [];
  private angles: number[] = [];
  private buttons: HTMLButtonElement[] = [];
  private sel = -1;
  private px = 0;
  private py = 0;
  private picked: WheelEntry | null = null;

  constructor(
    parent: HTMLElement,
    private readonly onPick: (e: WheelEntry) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'qwheel';
    this.el.style.display = 'none';
    this.centre = document.createElement('div');
    this.centre.className = 'qw-centre';
    this.el.appendChild(this.centre);
    parent.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  open(entries: WheelEntry[]): void {
    this.entries = entries;
    this.angles = wheelLayout(entries.filter((e) => e.kind === 'mon').length, entries.filter((e) => e.kind === 'item').length);
    this.sel = -1;
    this.px = this.py = 0;
    this.picked = null;
    for (const b of this.buttons) b.remove();
    const RADIUS = wheelRadius(this.angles);
    const size = RADIUS * 2 + 120;
    this.el.style.width = this.el.style.height = `${size}px`;
    this.el.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    this.buttons = entries.map((e, i) => {
      const b = document.createElement('button');
      b.className = `qw-slot qw-${e.kind}${e.disabled ? ' off' : ''}${e.current ? ' cur' : ''}`;
      b.innerHTML = `<span class="qw-icon">${e.icon}</span><span class="qw-label"></span><span class="qw-sub"></span>`;
      b.querySelector('.qw-label')!.textContent = e.label;
      b.querySelector('.qw-sub')!.textContent = e.sub;
      const a = this.angles[i];
      b.style.left = `calc(50% + ${Math.cos(a) * RADIUS}px)`;
      b.style.top = `calc(50% + ${Math.sin(a) * RADIUS}px)`;
      b.addEventListener('pointerenter', () => this.select(i));
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.select(i);
        this.finish();
      });
      this.el.appendChild(b);
      return b;
    });
    this.el.style.display = 'block';
    this.render();
  }

  /** Mouse movement (pixels) steers the pick. */
  pointBy(dx: number, dy: number): void {
    this.px = Math.max(-120, Math.min(120, this.px + dx));
    this.py = Math.max(-120, Math.min(120, this.py + dy));
    const i = wheelPick(this.angles, this.px / 120, this.py / 120);
    if (i >= 0) this.select(i);
  }

  /** A stick (x, y in -1..1, y down) points straight at a slot. */
  pointAt(x: number, y: number): void {
    const i = wheelPick(this.angles, x, y, 0.5);
    if (i >= 0) this.select(i);
  }

  private select(i: number): void {
    if (i === this.sel) return;
    this.sel = i;
    this.render();
  }

  private render(): void {
    this.buttons.forEach((b, i) => b.classList.toggle('sel', i === this.sel));
    const e = this.entries[this.sel];
    this.centre.innerHTML = e
      ? `<b></b><span></span>`
      : `<b>${this.entries.length ? 'Quick select' : 'Nothing to pick'}</b><span>${this.entries.length ? 'Point at one, let go' : 'No team or capture items'}</span>`;
    if (e) {
      this.centre.querySelector('b')!.textContent = e.kind === 'mon' ? (e.current ? `${e.label} (lead)` : `Lead with ${e.label}`) : `Throw ${e.label}`;
      this.centre.querySelector('span')!.textContent = e.sub;
    }
  }

  /**
   * A tap on the screen while the wheel is open (touch: the overlay sits above it): picks the slot
   * under the finger, or closes the wheel if the tap missed them all.
   */
  pickAt(x: number, y: number): void {
    const i = this.buttons.findIndex((b) => {
      const r = b.getBoundingClientRect();
      return x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6;
    });
    if (i < 0) {
      this.hide();
      return;
    }
    this.select(i);
    this.finish();
  }

  /** Clicked or tapped: pick now. */
  private finish(): void {
    const e = this.entries[this.sel];
    this.hide();
    if (e && !e.disabled) {
      this.picked = e;
      this.onPick(e);
    }
  }

  /** Let go of the key: picks what's pointed at (null: nothing, or cancelled). */
  close(cancel = false): WheelEntry | null {
    if (!this.isOpen) return this.picked;
    const e = cancel ? null : this.entries[this.sel];
    this.hide();
    if (e && !e.disabled) {
      this.onPick(e);
      return e;
    }
    return null;
  }

  private hide(): void {
    this.el.style.display = 'none';
  }
}
