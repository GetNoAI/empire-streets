/**
 * A story card: a title and a few lines that fade in one after another over a dimmed screen, then
 * a Continue button (Enter / Space / click). Used after the opening cinematic to say why you're
 * here; any later beat can use it too.
 */
export class StoryCard {
  private readonly el: HTMLDivElement;
  private onDone: (() => void) | null = null;
  private shownAt = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'story';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.close();
    });
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  show(title: string, lines: string[], onDone: () => void, button = 'Continue'): void {
    this.onDone = onDone;
    this.shownAt = performance.now();
    const step = 1.1;
    this.el.innerHTML = `<div class="story-panel">
      <div class="story-title">${title}</div>
      ${lines.map((l, i) => `<p style="animation-delay:${(0.5 + i * step).toFixed(2)}s">${l}</p>`).join('')}
      <button class="btn primary story-go" style="animation-delay:${(0.6 + lines.length * step).toFixed(2)}s">${button} (Enter)</button>
    </div>`;
    this.el.style.display = 'flex';
  }

  /** Enter or Space continues (not in the first moment, so a held key doesn't skip it). */
  key(code: string): void {
    if (!this.isOpen || performance.now() - this.shownAt < 600) return;
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'Escape') this.close();
  }

  private close(): void {
    if (!this.isOpen) return;
    this.el.style.display = 'none';
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }
}
