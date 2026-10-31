import * as THREE from 'three';

/**
 * Overhead UI in the 3D world: speech bubbles and health bars.
 *
 * Both are canvas-drawn sprites (2D in 3D) that follow an anchor (a person's head, a creature's
 * back), are hidden by buildings like anything else, and fade with distance from the camera.
 * Bubbles also fade in and out over their lifetime, and only the nearest few are shown at once.
 */

export type Anchor = () => { x: number; y: number; z: number } | null;

export interface BubbleOptions {
  fadeNear: number;
  fadeFar: number;
  maxVisible: number;
  fadeSeconds: number;
  maxChars: number;
}

export type BubbleStyle = 'talk' | 'shout';

interface Bubble {
  key: string;
  anchor: Anchor;
  sprite: THREE.Sprite;
  age: number;
  life: number;
  text: string;
}

/** Metres per canvas pixel for overhead sprites. */
const PX = 0.0058;

/** Splits text into lines of at most `max` characters (at spaces where possible). */
export function wrapText(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class SpeechBubbles {
  private readonly bubbles = new Map<string, Bubble>();
  private readonly textures = new Map<string, { tex: THREE.CanvasTexture; w: number; h: number; used: number }>();
  private readonly tmp = new THREE.Vector3();
  private tick = 0;

  constructor(
    private readonly scene: THREE.Scene,
    readonly opts: BubbleOptions,
  ) {}

  get count(): number {
    return this.bubbles.size;
  }

  /** Visible bubbles' text (tests, debugging). */
  texts(): string[] {
    return [...this.bubbles.values()].filter((b) => b.sprite.visible && (b.sprite.material as THREE.SpriteMaterial).opacity > 0.05).map((b) => b.text);
  }

  /** Shows `text` over `anchor` for `seconds` (replaces that key's current bubble). */
  say(key: string | number, anchor: Anchor, text: string, seconds: number, style: BubbleStyle = 'talk'): void {
    const k = String(key);
    this.remove(k);
    const t = this.texture(text, style);
    const mat = new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    sprite.scale.set(t.w * PX, t.h * PX, 1);
    sprite.renderOrder = 20;
    sprite.name = 'speech-bubble';
    this.scene.add(sprite);
    this.bubbles.set(k, { key: k, anchor, sprite, age: 0, life: Math.max(0.5, seconds), text });
  }

  remove(key: string | number): void {
    const b = this.bubbles.get(String(key));
    if (!b) return;
    b.sprite.removeFromParent();
    (b.sprite.material as THREE.SpriteMaterial).dispose();
    this.bubbles.delete(b.key);
  }

  clear(): void {
    for (const k of [...this.bubbles.keys()]) this.remove(k);
  }

  update(dt: number, camera: THREE.Camera): void {
    const O = this.opts;
    const cam = camera.getWorldPosition(this.tmp);
    const live: Array<{ b: Bubble; d: number }> = [];
    for (const b of [...this.bubbles.values()]) {
      b.age += dt;
      const at = b.anchor();
      if (!at || b.age >= b.life) {
        this.remove(b.key);
        continue;
      }
      b.sprite.position.set(at.x, at.y, at.z);
      live.push({ b, d: Math.hypot(at.x - cam.x, at.y - cam.y, at.z - cam.z) });
    }
    live.sort((a, c) => a.d - c.d);
    live.forEach(({ b, d }, i) => {
      const lifeA = Math.min(1, b.age / O.fadeSeconds, (b.life - b.age) / O.fadeSeconds);
      const distA = 1 - THREE.MathUtils.clamp((d - O.fadeNear) / Math.max(1, O.fadeFar - O.fadeNear), 0, 1);
      const a = Math.max(0, lifeA) * distA;
      const m = b.sprite.material as THREE.SpriteMaterial;
      m.opacity = a;
      b.sprite.visible = a > 0.01 && i < O.maxVisible;
    });
    // Drop textures nobody has used for a while.
    if (++this.tick % 300 === 0 && this.textures.size > 48) {
      const inUse = new Set([...this.bubbles.values()].map((b) => (b.sprite.material as THREE.SpriteMaterial).map));
      for (const [k, t] of this.textures) if (!inUse.has(t.tex) && this.tick - t.used > 600) {
        t.tex.dispose();
        this.textures.delete(k);
      }
    }
  }

  private texture(text: string, style: BubbleStyle): { tex: THREE.CanvasTexture; w: number; h: number; used: number } {
    const key = `${style}|${text}`;
    const hit = this.textures.get(key);
    if (hit) {
      hit.used = this.tick;
      return hit;
    }
    const lines = wrapText(text, this.opts.maxChars);
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const font = `600 30px "Segoe UI", system-ui, sans-serif`;
    ctx.font = font;
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const pad = 18;
    const lineH = 36;
    const tail = 18;
    const w = Math.ceil(textW + pad * 2);
    const bodyH = lines.length * lineH + pad * 1.4;
    c.width = w + 8;
    c.height = Math.ceil(bodyH + tail + 8);
    ctx.font = font;
    const bg = style === 'shout' ? '#ffe45c' : '#ffffff';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, 6, 6, w, bodyH, 16);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.strokeStyle = '#1b1d22';
    ctx.lineWidth = 3;
    roundRect(ctx, 3, 3, w, bodyH, 16);
    ctx.fill();
    ctx.stroke();
    // Tail.
    const cx = c.width / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 12, bodyH + 1);
    ctx.lineTo(cx, bodyH + tail);
    ctx.lineTo(cx + 12, bodyH + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = bg;
    ctx.fillRect(cx - 10, bodyH - 3, 20, 6);
    ctx.fillStyle = '#16181d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, cx, 3 + pad * 0.7 + lineH * (i + 0.5)));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const entry = { tex, w: c.width, h: c.height, used: this.tick };
    this.textures.set(key, entry);
    return entry;
  }
}

interface Bar {
  key: string;
  anchor: Anchor;
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  drawn: string;
}

/** HP bars over creatures in ambient fights: level, a coloured bar, fading with distance. */
export class HealthBars {
  private readonly bars = new Map<string, Bar>();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly fade: { near: number; far: number },
  ) {}

  get count(): number {
    return this.bars.size;
  }

  /** Shows / updates a bar (redraws only when the numbers change). */
  set(key: string | number, anchor: Anchor, hp: number, maxHp: number, level: number, accent = '#59b6ff'): void {
    const k = String(key);
    let b = this.bars.get(k);
    if (!b) {
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 44;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sprite.center.set(0.5, 0);
      sprite.scale.set(canvas.width * PX, canvas.height * PX, 1);
      sprite.renderOrder = 19;
      sprite.name = 'health-bar';
      this.scene.add(sprite);
      b = { key: k, anchor, sprite, canvas, tex, drawn: '' };
      this.bars.set(k, b);
    }
    b.anchor = anchor;
    const frac = THREE.MathUtils.clamp(hp / Math.max(1, maxHp), 0, 1);
    const sig = `${Math.round(frac * 60)}|${level}|${accent}`;
    if (sig === b.drawn) return;
    b.drawn = sig;
    const ctx = b.canvas.getContext('2d')!;
    const W = b.canvas.width;
    const H = b.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(12,14,18,0.82)';
    roundRect(ctx, 2, 2, W - 4, H - 4, 10);
    ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, 2, 2, 8, H - 4, 4);
    ctx.fill();
    ctx.font = '700 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#e8ecf2';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Lv ${level}`, 16, H / 2 + 1);
    const x0 = 76;
    const bw = W - x0 - 12;
    ctx.fillStyle = '#2a2f38';
    roundRect(ctx, x0, H / 2 - 7, bw, 14, 7);
    ctx.fill();
    ctx.fillStyle = frac > 0.5 ? '#46d36b' : frac > 0.2 ? '#f2c230' : '#ef4b3c';
    if (frac > 0) {
      roundRect(ctx, x0, H / 2 - 7, Math.max(10, bw * frac), 14, 7);
      ctx.fill();
    }
    b.tex.needsUpdate = true;
  }

  remove(key: string | number): void {
    const b = this.bars.get(String(key));
    if (!b) return;
    b.sprite.removeFromParent();
    (b.sprite.material as THREE.SpriteMaterial).dispose();
    b.tex.dispose();
    this.bars.delete(b.key);
  }

  clear(): void {
    for (const k of [...this.bars.keys()]) this.remove(k);
  }

  update(camera: THREE.Camera): void {
    const cam = camera.getWorldPosition(this.tmp);
    for (const b of [...this.bars.values()]) {
      const at = b.anchor();
      if (!at) {
        this.remove(b.key);
        continue;
      }
      b.sprite.position.set(at.x, at.y, at.z);
      const d = Math.hypot(at.x - cam.x, at.y - cam.y, at.z - cam.z);
      const a = 1 - THREE.MathUtils.clamp((d - this.fade.near) / Math.max(1, this.fade.far - this.fade.near), 0, 1);
      (b.sprite.material as THREE.SpriteMaterial).opacity = a;
      b.sprite.visible = a > 0.01;
    }
  }
}
