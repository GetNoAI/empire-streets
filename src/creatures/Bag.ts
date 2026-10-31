import { DATA, captureItems, type CaptureItem } from './Data';

/** The player's items (capture items, evolution items) with counts. Engine-free. */
export class Bag {
  readonly counts = new Map<string, number>();
  /** Capture item thrown with C in the street. */
  selectedCapture = 'cuffs';

  count(id: string): number {
    return this.counts.get(id) ?? 0;
  }

  add(id: string, n = 1): void {
    if (!DATA.items.has(id)) throw new Error(`unknown item "${id}"`);
    this.counts.set(id, this.count(id) + n);
  }

  /** Uses one; returns false if there are none. */
  take(id: string): boolean {
    const n = this.count(id);
    if (n <= 0) return false;
    if (n === 1) this.counts.delete(id);
    else this.counts.set(id, n - 1);
    return true;
  }

  /** Capture items you have, in config order. */
  captures(): Array<{ item: CaptureItem; count: number }> {
    return captureItems()
      .map((item) => ({ item, count: this.count(item.id) }))
      .filter((e) => e.count > 0);
  }

  /** The selected capture item, or the first one you have. */
  currentCapture(): CaptureItem | null {
    const list = this.captures();
    return (list.find((e) => e.item.id === this.selectedCapture) ?? list[0])?.item ?? null;
  }

  cycleCapture(): CaptureItem | null {
    const list = this.captures();
    if (!list.length) return null;
    const i = list.findIndex((e) => e.item.id === this.selectedCapture);
    this.selectedCapture = list[(i + 1) % list.length].item.id;
    return list[(i + 1) % list.length].item;
  }

  serialize(): { counts: Record<string, number>; selected: string } {
    return { counts: Object.fromEntries(this.counts), selected: this.selectedCapture };
  }

  load(d: { counts: Record<string, number>; selected?: string }): void {
    this.counts.clear();
    for (const [k, v] of Object.entries(d.counts ?? {})) if (DATA.items.has(k) && v > 0) this.counts.set(k, Math.floor(v));
    if (d.selected) this.selectedCapture = d.selected;
  }
}
