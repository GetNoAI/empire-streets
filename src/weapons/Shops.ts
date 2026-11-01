import * as THREE from 'three';
import type { CityLayout, Rect } from '../world/CityLayout';
import type { Inventory } from './Inventory';
import { WEAPONS, isRanged, type WeaponSpec } from './WeaponTypes';
import { withSurface } from '../render/Surfaces';

export const SHOP_NAME = 'Hardline Arms';

export interface Shop {
  x: number;
  z: number;
  /** Direction the storefront faces (unit vector in XZ). */
  nx: number;
  nz: number;
}

/**
 * Gun shops on three blocks (near the start, midtown, downtown): a lit sign on the facade and a
 * glowing marker on the sidewalk at the door.
 */
export class Shops {
  readonly shops: Shop[] = [];
  private readonly markers: THREE.Mesh[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, layout: CityLayout) {
    const signTex = makeSignTexture();
    for (const { x, facadeZ, door } of shopSpots(layout)) {
      const shop: Shop = door;
      this.shops.push(shop);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(6, 1.1, 0.25),
        [
          withSurface(new THREE.MeshStandardMaterial({ color: 0x111111 }), 'paintedMetal'),
          withSurface(new THREE.MeshStandardMaterial({ color: 0x111111 }), 'paintedMetal'),
          withSurface(new THREE.MeshStandardMaterial({ color: 0x111111 }), 'paintedMetal'),
          withSurface(new THREE.MeshStandardMaterial({ color: 0x111111 }), 'paintedMetal'),
          new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.9 }),
          withSurface(new THREE.MeshStandardMaterial({ color: 0x111111 }), 'paintedMetal'),
        ],
      );
      sign.position.set(x, 3.6, facadeZ + 0.2);
      scene.add(sign);
      // Shopfront: dark glass and a door frame.
      const front = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.1, metalness: 0.5 }));
      front.position.set(x, 1.45, facadeZ + 0.06);
      scene.add(front);
      // An orange awning and a lit doorway, so the entrance reads from down the street.
      const awning = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.14, 1.5), withSurface(new THREE.MeshStandardMaterial({ color: 0xc8641e, roughness: 0.8 }), 'fabric'));
      awning.position.set(x, 2.95, facadeZ + 0.78);
      awning.rotation.x = 0.12;
      awning.castShadow = true;
      scene.add(awning);
      const doorway = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.35, 0.08), new THREE.MeshStandardMaterial({ color: 0xffe2bd, emissive: 0xffa040, emissiveIntensity: 0.5, roughness: 0.2 }));
      doorway.position.set(x, 1.33, facadeZ + 0.12);
      scene.add(doorway);
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.85, 32),
        new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(shop.x, 0.17, shop.z);
      scene.add(marker);
      this.markers.push(marker);
    }
  }

  update(dt: number): void {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 3) * 0.08;
    for (const m of this.markers) m.scale.set(s, s, s);
  }

  /** The shop whose door the point is at, if any. */
  shopAt(x: number, z: number): Shop | null {
    for (const s of this.shops) if (Math.hypot(s.x - x, s.z - z) < 1.6) return s;
    return null;
  }
}

/** Where the gun shops go (pure: other planners keep their entrances clear of these doors). */
export function shopSpots(L: CityLayout): Array<{ x: number; facadeZ: number; door: Shop }> {
  const targets = [
    { x: L.playerSpawn.x + 60, z: L.playerSpawn.z + 40 },
    { x: L.aveX[4], z: L.streetZ[4] },
    { x: L.aveX[1], z: L.streetZ[17] },
  ];
  return targets.map((t) => {
    const b = nearestBlock(L.blocks, t.x, t.z);
    // South face of the block, middle of the long side.
    const x = (b.x0 + b.x1) / 2;
    return { x, facadeZ: b.z1 - 4.5, door: { x, z: b.z1 - 2.2, nx: 0, nz: 1 } };
  });
}

function nearestBlock(blocks: Rect[], x: number, z: number): Rect {
  let best = blocks[0];
  let bestD = Infinity;
  for (const b of blocks) {
    const d = Math.hypot((b.x0 + b.x1) / 2 - x, (b.z0 + b.z1) / 2 - z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function makeSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = '#ffb02e';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 84);
  ctx.fillStyle = '#ffb02e';
  ctx.font = 'bold 52px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SHOP_NAME.toUpperCase(), 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ shop menu

export interface ShopContext {
  inventory: Inventory;
  money: () => number;
  spend: (amount: number) => boolean;
  /** Reason the shop won't serve you right now (wanted), or null. */
  refusal: () => string | null;
  onClose: () => void;
  onBought: (text: string) => void;
}

/** DOM menu listing weapons and ammo with prices. */
export class ShopMenu {
  private readonly el: HTMLDivElement;
  private ctx: ShopContext | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'overlay shop';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn || !this.ctx) return;
      const act = btn.dataset['act'];
      const id = btn.dataset['id'] ?? '';
      if (act === 'close') this.close();
      else if (act === 'buy') this.buy(id, false);
      else if (act === 'ammo') this.buy(id, true);
    });
  }

  open(ctx: ShopContext): void {
    this.ctx = ctx;
    this.render();
    this.el.style.display = 'flex';
  }

  close(): void {
    this.el.style.display = 'none';
    const c = this.ctx;
    this.ctx = null;
    c?.onClose();
  }

  private buy(id: string, ammo: boolean): void {
    const c = this.ctx!;
    const w = WEAPONS.find((x) => x.id === id);
    if (!w || c.refusal()) return;
    const inv = c.inventory;
    if (ammo) {
      if (!inv.has(id) || inv.ammoSpace(id) <= 0) return;
      if (!c.spend(w.ammoPrice!)) return;
      inv.give(id, w.ammoPack!);
      c.onBought(`${w.name}: +${w.ammoPack} rounds`);
    } else {
      if (inv.has(id)) return;
      if (!c.spend(w.price)) return;
      inv.give(id);
      inv.select(id);
      c.onBought(`Bought ${w.name}`);
    }
    this.render();
  }

  private render(): void {
    const c = this.ctx!;
    const inv = c.inventory;
    const refusal = c.refusal();
    const money = c.money();
    const row = (w: WeaponSpec): string => {
      const owned = inv.has(w.id);
      const o = inv.get(w.id);
      const ammoInfo = owned && isRanged(w) ? `<span class="ammo">${o!.mag} / ${o!.reserve}</span>` : '';
      const buyBtn = owned
        ? `<button class="btn small" disabled>Owned</button>`
        : `<button class="btn small" data-act="buy" data-id="${w.id}" ${money < w.price || refusal ? 'disabled' : ''}>$${w.price}</button>`;
      const ammoBtn =
        isRanged(w) && w.ammoPrice
          ? `<button class="btn small" data-act="ammo" data-id="${w.id}" ${!owned || inv.ammoSpace(w.id) <= 0 || money < w.ammoPrice || refusal ? 'disabled' : ''}>+${w.ammoPack} for $${w.ammoPrice}</button>`
          : '';
      return `<tr><td class="wname">${w.name}</td><td>${ammoInfo}</td><td>${buyBtn}</td><td>${ammoBtn}</td></tr>`;
    };
    this.el.innerHTML = `
      <div class="shop-panel">
        <div class="shop-title">${SHOP_NAME.toUpperCase()}</div>
        <div class="shop-money">Cash: $${money.toLocaleString('en-US')}</div>
        ${refusal ? `<div class="shop-refusal">${refusal}</div>` : ''}
        <table class="shop-table">${WEAPONS.filter((w) => w.price > 0).map(row).join('')}</table>
        <button class="btn primary" data-act="close">Leave (Esc)</button>
      </div>`;
  }
}
