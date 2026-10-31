/**
 * Conversation panel along the bottom of the screen: who's talking, what they say, and up to four
 * numbered answers (click, or press 1-4; Esc leaves).
 */
export class DialogueBox {
  private readonly el: HTMLDivElement;
  private choose: ((i: number) => void) | null = null;
  private onClose: (() => void) | null = null;
  private count = 0;

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
    this.choose = choose;
    this.onClose = onClose;
    this.count = choices.length;
    const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    this.el.innerHTML = `
      <div class="dlg-name">${esc(speaker)}${note ? `<span>${esc(note)}</span>` : ''}</div>
      <div class="dlg-text">${esc(text)}</div>
      <div class="dlg-choices">${choices.map((c, i) => `<button class="btn" data-i="${i}"><kbd>${i + 1}</kbd> ${esc(c)}</button>`).join('')}</div>`;
    this.el.style.display = 'block';
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.style.display = 'none';
    const cb = this.onClose;
    this.onClose = null;
    this.choose = null;
    cb?.();
  }

  /** Keyboard: 1-4 pick an answer, Esc leaves. Returns true if the key was used. */
  key(code: string): boolean {
    if (!this.isOpen) return false;
    if (code === 'Escape') {
      this.close();
      return true;
    }
    const n = code.startsWith('Digit') ? Number(code.slice(5)) : 0;
    if (n >= 1 && n <= this.count) {
      this.choose?.(n - 1);
      return true;
    }
    return false;
  }
}
