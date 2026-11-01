import * as THREE from 'three';

/**
 * Conversations as a speech bubble over the speaker's head: who's talking, what they say, and
 * up to four numbered answers inside the bubble (press 1-4 or click; Esc leaves). The bubble
 * follows the speaker on screen and keeps inside the edges; with nobody to hang it on (a sign, a
 * safehouse door) it sits low in the middle of the screen.
 *
 * `anchor` is asked for a point when a conversation opens (the game finds the nearest person).
 */
export class DialogueBox {
  private readonly el: HTMLDivElement;
  private choose: ((i: number) => void) | null = null;
  private onClose: (() => void) | null = null;
  private count = 0;
  private at: (() => { x: number; y: number; z: number } | null) | null = null;
  private readonly tmp = new THREE.Vector3();
  /** Where the speaker's head is (asked when a conversation opens). */
  anchor: (() => (() => { x: number; y: number; z: number } | null) | null) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dialogue';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-i]') as HTMLButtonElement | null;
      if (b) this.choose?.(Number(b.dataset['i']));
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  /** Shows a line and its answers. `onClose` runs when the conversation ends (any way). */
  show(speaker: string, text: string, choices: string[], choose: (i: number) => void, onClose: () => void, note = ''): void {
    const opening = !this.isOpen;
    this.choose = choose;
    this.onClose = onClose;
    this.count = choices.length;
    if (opening) this.at = this.anchor?.() ?? null;
    const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    this.el.innerHTML = `
      <div class="dlg-name">${esc(speaker)}${note ? `<span>${esc(note)}</span>` : ''}</div>
      <div class="dlg-text">${esc(text).replace(/\n/g, '<br>')}</div>
      <div class="dlg-choices">${choices.map((c, i) => `<button data-i="${i}"><kbd>${i + 1}</kbd><span>${esc(c)}</span></button>`).join('')}</div>`;
    this.el.classList.toggle('floating', !!this.at);
    if (!this.at) this.el.style.transform = '';
    this.el.style.display = 'block';
    if (!opening) {
      this.el.classList.remove('next');
      void this.el.offsetWidth;
      this.el.classList.add('next');
    }
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.style.display = 'none';
    this.at = null;
    const cb = this.onClose;
    this.onClose = null;
    this.choose = null;
    cb?.();
  }

  /** Every frame: keeps the bubble over the speaker's head. */
  update(camera: THREE.Camera, width: number, height: number): void {
    if (!this.isOpen || !this.at) return;
    const p = this.at();
    const v = p ? this.tmp.set(p.x, p.y + 0.35, p.z).project(camera) : null;
    if (!v || v.z > 1) {
      this.el.classList.remove('floating');
      this.el.style.transform = '';
      return;
    }
    this.el.classList.add('floating');
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const x = (v.x * 0.5 + 0.5) * width;
    const y = (-v.y * 0.5 + 0.5) * height;
    // Keep it on screen; the tail points at the head where it can.
    const left = Math.min(Math.max(12, x - w / 2), width - w - 12);
    const top = Math.min(Math.max(12, y - h - 16), height - h - 12);
    const tail = Math.max(18, Math.min(w - 18, x - left));
    this.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    this.el.style.setProperty('--tail', `${Math.round(tail)}px`);
  }

  /** Keyboard: 1-4 pick an answer, Esc leaves. Returns true if the key was used. */
  key(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'Escape') {
      this.close();
      return true;
    }
    const n = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : 0;
    if (n >= 1 && n <= this.count) {
      this.choose?.(n - 1);
      return true;
    }
    return false;
  }
}
