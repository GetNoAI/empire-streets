import { isRanged, weapon } from '../weapons/WeaponTypes';
import type { Inventory } from '../weapons/Inventory';

const SLOT_NAMES = ['Unarmed', 'Melee', 'Handguns', 'Shotguns', 'SMGs', 'Rifles', 'Sniper', 'Thrown'];
const SLOT_COUNT = SLOT_NAMES.length;

/**
 * Weapon HUD: current weapon and ammo, cash, crosshair (opens up with spread), hit markers,
 * the sniper scope, and the hold-Tab weapon wheel.
 */
export class WeaponHud {
  private readonly panel: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly ammo: HTMLDivElement;
  private readonly reloadBar: HTMLDivElement;
  private readonly money: HTMLDivElement;
  private readonly cross: HTMLDivElement;
  private readonly hit: HTMLDivElement;
  private readonly scope: HTMLDivElement;
  private readonly wheel: HTMLDivElement;
  private readonly wheelSlots: HTMLDivElement[] = [];
  private readonly wheelLabel: HTMLDivElement;
  private hitUntil = 0;
  private moneyShown = -1;
  private wheelX = 0;
  private wheelY = 0;
  /** Slot highlighted on the open wheel (-1 = none). */
  wheelSlot = -1;

  constructor(parent: HTMLElement) {
    const div = (cls: string): HTMLDivElement => {
      const d = document.createElement('div');
      d.className = cls;
      return d;
    };
    this.panel = div('weapon-panel');
    this.name = div('weapon-name');
    this.ammo = div('weapon-ammo');
    const rw = div('bar-wrap reload-wrap');
    this.reloadBar = div('bar reload');
    rw.appendChild(this.reloadBar);
    this.panel.append(this.name, this.ammo, rw);
    this.money = div('money');
    this.cross = div('crosshair');
    for (const side of ['t', 'b', 'l', 'r']) this.cross.appendChild(div(`ch ch-${side}`));
    this.cross.appendChild(div('ch-dot'));
    this.hit = div('hitmarker');
    this.scope = div('scope');
    this.wheel = div('wheel');
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = div('wheel-slot');
      const a = (i / SLOT_COUNT) * Math.PI * 2 - Math.PI / 2;
      s.style.left = `${50 + Math.cos(a) * 36}%`;
      s.style.top = `${50 + Math.sin(a) * 36}%`;
      this.wheel.appendChild(s);
      this.wheelSlots.push(s);
    }
    this.wheelLabel = div('wheel-label');
    this.wheel.appendChild(this.wheelLabel);
    parent.append(this.panel, this.money, this.cross, this.hit, this.scope, this.wheel);
  }

  hitMarker(kill: boolean): void {
    this.hit.className = kill ? 'hitmarker kill' : 'hitmarker';
    this.hitUntil = performance.now() + (kill ? 300 : 140);
  }

  update(s: {
    inv: Inventory;
    onFoot: boolean;
    aiming: boolean;
    spreadDeg: number;
    fovDeg: number;
    money: number;
    scoped: boolean;
  }): void {
    const w = s.inv.current;
    const o = s.inv.currentAmmo;
    this.panel.style.opacity = s.onFoot ? '1' : '0';
    this.name.textContent = w.name;
    if (isRanged(w)) {
      this.ammo.innerHTML = `<b>${o.mag}</b> / ${o.reserve}`;
    } else this.ammo.textContent = '';
    const reloading = s.inv.isReloading;
    this.reloadBar.parentElement!.style.visibility = reloading ? 'visible' : 'hidden';
    if (reloading) {
      const total = w.reloadTime ?? 1;
      this.reloadBar.style.width = `${Math.max(0, Math.min(100, (1 - s.inv.reloading / total) * 100))}%`;
    }
    if (s.money !== this.moneyShown) {
      this.money.textContent = `$${s.money.toLocaleString('en-US')}`;
      this.moneyShown = s.money;
    }
    // Crosshair gap matches the actual spread cone on screen.
    const showCross = s.onFoot && isRanged(w) && w.kind === 'hitscan' && !s.scoped;
    this.cross.style.display = showCross ? 'block' : 'none';
    if (showCross) {
      const px = (Math.tan((s.spreadDeg * Math.PI) / 180) / Math.tan((s.fovDeg * Math.PI) / 360)) * (window.innerHeight / 2);
      this.cross.style.setProperty('--gap', `${Math.max(3, Math.min(80, px)).toFixed(1)}px`);
      this.cross.style.opacity = s.aiming ? '1' : '0.65';
    }
    this.scope.style.display = s.scoped ? 'block' : 'none';
    this.hit.style.opacity = performance.now() < this.hitUntil ? '1' : '0';
  }

  // ------------------------------------------------------------------ weapon wheel

  get wheelOpen(): boolean {
    return this.wheel.style.display === 'block';
  }

  openWheel(inv: Inventory): void {
    this.wheel.style.display = 'block';
    this.wheelX = 0;
    this.wheelY = 0;
    this.wheelSlot = weapon(inv.currentId).slot;
    this.renderWheel(inv);
  }

  /** Mouse movement steers the selection. */
  moveWheel(dx: number, dy: number, inv: Inventory): void {
    this.wheelX = Math.max(-120, Math.min(120, this.wheelX + dx));
    this.wheelY = Math.max(-120, Math.min(120, this.wheelY + dy));
    if (Math.hypot(this.wheelX, this.wheelY) > 30) {
      const a = Math.atan2(this.wheelY, this.wheelX) + Math.PI / 2;
      this.wheelSlot = ((Math.round((a / (Math.PI * 2)) * SLOT_COUNT) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    }
    this.renderWheel(inv);
  }

  /** Closes the wheel; returns the slot chosen. */
  closeWheel(): number {
    this.wheel.style.display = 'none';
    return this.wheelSlot;
  }

  private renderWheel(inv: Inventory): void {
    this.wheelSlots.forEach((el, i) => {
      const owned = inv.owned.filter((o) => weapon(o.id).slot === i);
      const pick = owned.find((o) => o.id === inv.currentId) ?? owned[0];
      el.className = `wheel-slot${i === this.wheelSlot ? ' sel' : ''}${owned.length ? '' : ' empty'}`;
      if (!pick) el.innerHTML = `<div class="ws-name">${SLOT_NAMES[i]}</div>`;
      else {
        const w = weapon(pick.id);
        el.innerHTML = `<div class="ws-name">${w.name}</div>${isRanged(w) ? `<div class="ws-ammo">${pick.mag + pick.reserve}</div>` : ''}${owned.length > 1 ? `<div class="ws-more">+${owned.length - 1}</div>` : ''}`;
      }
    });
    const sel = inv.owned.filter((o) => weapon(o.id).slot === this.wheelSlot);
    this.wheelLabel.textContent = sel.length ? weapon((sel.find((o) => o.id === inv.currentId) ?? sel[0]).id).name : SLOT_NAMES[this.wheelSlot] ?? '';
  }
}

