import { WEAPONS, isRanged, weapon, type WeaponSpec } from './WeaponTypes';

/** Ammo state of one owned weapon. Melee weapons have no ammo. */
export interface OwnedWeapon {
  id: string;
  mag: number;
  reserve: number;
}

export type FireResult =
  /** A shot/swing/throw happened. */
  | 'fired'
  /** Still cycling (fire rate, bolt, mid-reload). */
  | 'busy'
  /** Magazine empty: a reload started (or nothing left). */
  | 'empty';

/**
 * The player's weapons and ammo (engine-free, unit-tested). Times advance through `update(dt)`.
 * Shotguns reload shell by shell and can fire mid-reload; rifles/pistols reload the whole magazine.
 */
export class Inventory {
  readonly owned: OwnedWeapon[] = [{ id: 'fists', mag: 0, reserve: 0 }];
  currentId = 'fists';
  previousId = 'fists';
  /** Seconds until the weapon can fire again. */
  cooldown = 0;
  /** Seconds left of the current reload step (0 = not reloading). */
  reloading = 0;
  /** Extra spread (degrees) from sustained fire; decays when you stop. */
  bloom = 0;
  /** Trigger state last frame, so semi-automatic weapons fire once per press. */
  private triggerHeld = false;

  get current(): WeaponSpec {
    return weapon(this.currentId);
  }

  get currentAmmo(): OwnedWeapon {
    return this.get(this.currentId)!;
  }

  get(id: string): OwnedWeapon | undefined {
    return this.owned.find((o) => o.id === id);
  }

  has(id: string): boolean {
    return !!this.get(id);
  }

  get isReloading(): boolean {
    return this.reloading > 0;
  }

  /** Adds a weapon (or its ammo if already owned). Returns the rounds actually added. */
  give(id: string, rounds?: number): number {
    const w = weapon(id);
    let o = this.get(id);
    if (!isRanged(w)) {
      if (!o) this.owned.push({ id, mag: 0, reserve: 0 });
      return 0;
    }
    const add = rounds ?? w.startReserve ?? 0;
    if (!o) {
      // New weapon arrives with a full magazine taken from the given rounds where possible.
      const mag = Math.min(w.magSize!, add);
      o = { id, mag, reserve: 0 };
      this.owned.push(o);
      o.reserve = Math.min(w.reserveMax!, add - mag);
      this.sort();
      return add;
    }
    const before = o.reserve;
    o.reserve = Math.min(w.reserveMax!, o.reserve + add);
    return o.reserve - before;
  }

  /** Removes a weapon entirely (dropped, confiscated). Fists can't be removed. */
  take(id: string): OwnedWeapon | null {
    if (id === 'fists') return null;
    const i = this.owned.findIndex((o) => o.id === id);
    if (i < 0) return null;
    const [o] = this.owned.splice(i, 1);
    if (this.currentId === id) this.select('fists');
    return o;
  }

  /** Room for more ammo of a weapon. */
  ammoSpace(id: string): number {
    const w = weapon(id);
    const o = this.get(id);
    if (!o || !isRanged(w)) return 0;
    return w.reserveMax! - o.reserve;
  }

  private sort(): void {
    this.owned.sort((a, b) => weapon(a.id).slot - weapon(b.id).slot || WEAPONS.indexOf(weapon(a.id)) - WEAPONS.indexOf(weapon(b.id)));
  }

  select(id: string): boolean {
    if (!this.has(id) || id === this.currentId) return false;
    this.previousId = this.currentId;
    this.currentId = id;
    this.reloading = 0;
    this.bloom = 0;
    // Drawing a weapon takes a moment.
    this.cooldown = Math.max(this.cooldown, 0.25);
    return true;
  }

  /** Next/previous owned weapon (mouse wheel). */
  cycle(dir: 1 | -1): void {
    const i = this.owned.findIndex((o) => o.id === this.currentId);
    const n = this.owned.length;
    this.select(this.owned[(i + dir + n) % n].id);
  }

  /** Hotkey: slot number; pressing again cycles weapons that share the slot. */
  selectSlot(slot: number): void {
    const inSlot = this.owned.filter((o) => weapon(o.id).slot === slot);
    if (inSlot.length === 0) return;
    const i = inSlot.findIndex((o) => o.id === this.currentId);
    this.select(inSlot[(i + 1) % inSlot.length].id);
  }

  swapToPrevious(): void {
    if (this.has(this.previousId)) this.select(this.previousId);
  }

  /** Starts a reload if it makes sense. */
  reload(): boolean {
    const w = this.current;
    const o = this.currentAmmo;
    if (!isRanged(w) || this.reloading > 0 || o.reserve <= 0 || o.mag >= w.magSize!) return false;
    this.reloading = w.reloadTime ?? 0.6;
    return true;
  }

  /**
   * Trigger handling. `held` is the trigger state this frame; semi-automatic weapons fire once per
   * press. Returns what happened; the caller performs the actual shot when 'fired'.
   */
  trigger(held: boolean): FireResult {
    const w = this.current;
    const pressed = held && !this.triggerHeld;
    this.triggerHeld = held;
    if (!held) return 'busy';
    const auto = w.automatic === true || w.kind === 'melee';
    if (!auto && !pressed) return 'busy';
    if (this.cooldown > 0) return 'busy';
    if (!isRanged(w)) {
      this.cooldown = w.fireInterval;
      return 'fired';
    }
    const o = this.currentAmmo;
    if (this.reloading > 0) {
      // Shotguns can interrupt a shell-by-shell reload to fire.
      if (w.reloadPerRound && o.mag > 0) this.reloading = 0;
      else return 'busy';
    }
    if (o.mag <= 0) {
      this.reload();
      return 'empty';
    }
    o.mag -= 1;
    this.cooldown = w.fireInterval;
    this.bloom = Math.min(this.bloom + (w.bloomPerShot ?? 0), (w.spread ?? 0) * 2.5);
    // Running dry: start the reload automatically after the last shot.
    if (o.mag === 0 && o.reserve > 0) this.reloading = (w.reloadTime ?? 0.6) + w.fireInterval * 0.5;
    if (o.mag === 0 && o.reserve === 0 && w.kind === 'throw') this.take(w.id);
    return 'fired';
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 6);
    if (this.reloading <= 0) return;
    this.reloading -= dt;
    if (this.reloading > 0) return;
    const w = this.current;
    const o = this.get(this.currentId);
    if (!o || !isRanged(w)) {
      this.reloading = 0;
      return;
    }
    if (w.reloadPerRound) {
      // One shell in; keep going until full or out.
      if (o.reserve > 0 && o.mag < w.magSize!) {
        o.mag += 1;
        o.reserve -= 1;
      }
      this.reloading = o.mag < w.magSize! && o.reserve > 0 ? (w.reloadTime ?? 0.6) : 0;
    } else {
      const n = Math.min(w.magSize! - o.mag, o.reserve);
      o.mag += n;
      o.reserve -= n;
      this.reloading = 0;
    }
  }

  /** Current spread half-angle in degrees. */
  spread(aiming: boolean, moving: boolean): number {
    const w = this.current;
    if (!isRanged(w)) return 0;
    const base = aiming ? (w.aimSpread ?? w.spread ?? 0) : (w.spread ?? 0);
    return base * (moving ? 1.6 : 1) + this.bloom;
  }

  /** For saving. */
  serialize(): { owned: OwnedWeapon[]; current: string } {
    return { owned: this.owned.map((o) => ({ ...o })), current: this.currentId };
  }

  load(data: { owned: OwnedWeapon[]; current: string }): void {
    this.owned.length = 0;
    for (const o of data.owned) if (WEAPONS.some((w) => w.id === o.id)) this.owned.push({ ...o });
    if (!this.has('fists')) this.owned.unshift({ id: 'fists', mag: 0, reserve: 0 });
    this.sort();
    this.currentId = this.has(data.current) ? data.current : 'fists';
    this.reloading = 0;
    this.cooldown = 0;
  }

  /** Busted: police keep everything but your fists. */
  confiscateAll(): void {
    for (const o of [...this.owned]) if (o.id !== 'fists') this.take(o.id);
    this.currentId = 'fists';
  }
}
