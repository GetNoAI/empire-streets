/**
 * Static collider streaming (engine-free core; the game passes Rapier colliders through a small
 * adapter, the tests pass fakes).
 *
 * Rapier's step costs time for every enabled collider, static ones included: about 1.5 ms per
 * thousand in the browser build. The city has ~6,900 static colliders (buildings, kerbs, lamps,
 * trees, street furniture, roof and sewer walls), but only the ones around you ever touch anything
 * that matters. So small static colliders are bucketed in a grid and only the cells within
 * `radius` of the focus (you, or your car) stay enabled; cells drop out again past
 * `radius + hysteresis` so walking back and forth across a boundary doesn't thrash. Big ones (the
 * ground, the water, long walls) are never touched. Traffic beyond the radius keeps to its lanes
 * on the ground, which stays on.
 *
 * Other systems can hold a collider off for their own reasons (a broken street prop): `hold`
 * keeps it disabled whatever its cell is doing, and `release` lets it follow its cell again.
 */

export interface StreamCollider {
  readonly x: number;
  readonly z: number;
  setEnabled(on: boolean): void;
  /** Still in the physics world (removed colliders are skipped). */
  alive(): boolean;
}

export const STREAM = {
  cell: 40,
  radius: 150,
  hysteresis: 35,
  /** Re-check when the focus has moved this far (m) or this long has passed (s). */
  moveStep: 10,
  maxInterval: 0.75,
} as const;

interface Cell {
  cx: number;
  cz: number;
  items: StreamCollider[];
  on: boolean;
}

export class ColliderStreamer {
  private readonly cells = new Map<string, Cell>();
  private readonly held = new Set<StreamCollider>();
  private lastX = Infinity;
  private lastZ = Infinity;
  private since = Infinity;
  /** Colliders switched on / off by the last update (for the tests and the profiler). */
  readonly stats = { colliders: 0, enabled: 0, toggled: 0 };

  constructor(private readonly o: { cell: number; radius: number; hysteresis: number; moveStep: number; maxInterval: number } = STREAM) {}

  /** Adds a collider (enabled, as everything starts). */
  add(c: StreamCollider): void {
    const cx = Math.floor(c.x / this.o.cell);
    const cz = Math.floor(c.z / this.o.cell);
    const k = `${cx},${cz}`;
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = { cx, cz, items: [], on: true }));
    cell.items.push(c);
    this.stats.colliders++;
    this.stats.enabled++;
  }

  /** Keeps a collider disabled regardless of its cell. */
  hold(c: StreamCollider): void {
    this.held.add(c);
    c.setEnabled(false);
  }

  /** Lets a held collider follow its cell again. */
  release(c: StreamCollider): void {
    if (!this.held.delete(c)) return;
    const cell = this.cells.get(`${Math.floor(c.x / this.o.cell)},${Math.floor(c.z / this.o.cell)}`);
    if (!cell || cell.on) c.setEnabled(true);
  }

  isOn(x: number, z: number): boolean {
    return this.cells.get(`${Math.floor(x / this.o.cell)},${Math.floor(z / this.o.cell)}`)?.on ?? true;
  }

  /** Call every frame with the focus point; does real work only now and then. */
  update(dt: number, x: number, z: number, force = false): void {
    this.since += dt;
    if (!force && Math.hypot(x - this.lastX, z - this.lastZ) < this.o.moveStep && this.since < this.o.maxInterval) return;
    this.lastX = x;
    this.lastZ = z;
    this.since = 0;
    const C = this.o.cell;
    let toggled = 0;
    let enabled = 0;
    for (const cell of this.cells.values()) {
      // Distance from the focus to the nearest point of the cell.
      const dx = Math.max(cell.cx * C - x, 0, x - (cell.cx + 1) * C);
      const dz = Math.max(cell.cz * C - z, 0, z - (cell.cz + 1) * C);
      const d = Math.hypot(dx, dz);
      const want = cell.on ? d <= this.o.radius + this.o.hysteresis : d <= this.o.radius;
      if (want !== cell.on) {
        cell.on = want;
        for (const c of cell.items) {
          if (!c.alive() || (want && this.held.has(c))) continue;
          c.setEnabled(want);
          toggled++;
        }
      }
      if (cell.on) enabled += cell.items.length;
    }
    this.stats.toggled = toggled;
    this.stats.enabled = enabled;
  }

  /** Everything back on (before a teleport far away, so nothing's missing for a frame). */
  refresh(x: number, z: number): void {
    this.update(0, x, z, true);
  }
}
