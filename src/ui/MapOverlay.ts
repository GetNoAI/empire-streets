import { CITY, type CityLayout } from '../world/CityLayout';

/**
 * The full-screen city map: the whole island at ground level with zoom (wheel, + / -) and pan
 * (drag, WASD / arrows), live markers from map_icons.json (you, cops, the wanted area, Streetmon,
 * heists and lock-ups, sewer grates, rooftop access, the Chop Shop, race organisers, clinics and
 * shops), layer filters, and a waypoint: click to set it, and a route along the roads is drawn here
 * and on the minimap. M (or the gamepad's Select) opens and closes it.
 *
 * View maths is pure (exported, unit-tested); drawing is a 2D canvas over the game.
 */

export interface MapIconSpec {
  sprite: string;
  color: string;
  size: number;
  layer: string;
  rotates?: boolean;
}

export interface MapConfig {
  map: { minZoom: number; maxZoom: number; startZoom: number; panSpeed: number; waypointArrive: number; routeRefresh: number; pauseWhileOpen: boolean };
  layers: Array<{ id: string; label: string; toggle?: boolean; default?: boolean }>;
  sprites: { cell: number; order: string[] };
  icons: Record<string, MapIconSpec>;
  sets: Array<{ icon: string; source: string; match?: Record<string, string>; points?: Array<{ x: number; z: number; label?: string }> }>;
  labels: Array<{ text: string; x: number; z: number; size: number; vertical?: boolean }>;
}

export interface MapMarker {
  icon: string;
  x: number;
  z: number;
  /** Heading (car/player convention: 0 = +X, PI/2 = -Z) for icons that rotate. */
  heading?: number;
  /** Override colour (Streetmon type colour). */
  color?: string;
  /** Radius in metres (wanted area). */
  r?: number;
  label?: string;
}

export interface MapView {
  /** World point at the centre of the screen. */
  cx: number;
  cz: number;
  /** Screen pixels per metre. */
  zoom: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------- pure view maths

export function worldToScreen(v: MapView, x: number, z: number): { sx: number; sy: number } {
  return { sx: v.w / 2 + (x - v.cx) * v.zoom, sy: v.h / 2 + (z - v.cz) * v.zoom };
}

export function screenToWorld(v: MapView, sx: number, sy: number): { x: number; z: number } {
  return { x: v.cx + (sx - v.w / 2) / v.zoom, z: v.cz + (sy - v.h / 2) / v.zoom };
}

/** Zooms by `factor` keeping the world point under (sx, sy) where it is. */
export function zoomAt(v: MapView, sx: number, sy: number, factor: number, min: number, max: number): MapView {
  const before = screenToWorld(v, sx, sy);
  const zoom = Math.max(min, Math.min(max, v.zoom * factor));
  const nv = { ...v, zoom };
  const after = screenToWorld(nv, sx, sy);
  return { ...nv, cx: v.cx + (before.x - after.x), cz: v.cz + (before.z - after.z) };
}

/** Keeps the centre over the island (with a margin of sea). */
export function clampView(v: MapView, land: { x0: number; x1: number; z0: number; z1: number }, margin = 150): MapView {
  return { ...v, cx: Math.max(land.x0 - margin, Math.min(land.x1 + margin, v.cx)), cz: Math.max(land.z0 - margin, Math.min(land.z1 + margin, v.cz)) };
}

/** Which layers are on, given the hidden list (always-on layers can't be hidden). */
export function visibleLayers(cfg: MapConfig, hidden: readonly string[]): Set<string> {
  return new Set(cfg.layers.filter((l) => l.toggle === false || !hidden.includes(l.id)).map((l) => l.id));
}

/** Length of a polyline (m). */
export function pathLength(p: ReadonlyArray<{ x: number; z: number }>): number {
  let d = 0;
  for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
  return d;
}

// ---------------------------------------------------------------------------- icon atlas

type Draw = (g: CanvasRenderingContext2D, s: number) => void;

/** Vector glyphs for the atlas, drawn white on transparent in a unit cell (0..s). */
const GLYPHS: Record<string, Draw> = {
  arrow: (g, s) => {
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.08);
    g.lineTo(s * 0.86, s * 0.9);
    g.lineTo(s * 0.5, s * 0.7);
    g.lineTo(s * 0.14, s * 0.9);
    g.closePath();
    g.fill();
  },
  dot: (g, s) => {
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.32, 0, Math.PI * 2);
    g.fill();
  },
  ring: (g, s) => {
    g.lineWidth = s * 0.12;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
    g.stroke();
  },
  paw: (g, s) => {
    g.beginPath();
    g.ellipse(s * 0.5, s * 0.64, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
    g.fill();
    for (const [x, y] of [
      [0.26, 0.38],
      [0.42, 0.26],
      [0.58, 0.26],
      [0.74, 0.38],
    ]) {
      g.beginPath();
      g.arc(s * x, s * y, s * 0.085, 0, Math.PI * 2);
      g.fill();
    }
  },
  vault: (g, s) => {
    g.lineWidth = s * 0.09;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.12, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      g.beginPath();
      g.moveTo(s / 2 - Math.cos(a) * s * 0.26, s / 2 - Math.sin(a) * s * 0.26);
      g.lineTo(s / 2 + Math.cos(a) * s * 0.26, s / 2 + Math.sin(a) * s * 0.26);
      g.stroke();
    }
  },
  truck: (g, s) => {
    g.fillRect(s * 0.08, s * 0.3, s * 0.56, s * 0.38);
    g.fillRect(s * 0.64, s * 0.42, s * 0.26, s * 0.26);
    for (const x of [0.24, 0.74]) {
      g.beginPath();
      g.arc(s * x, s * 0.74, s * 0.09, 0, Math.PI * 2);
      g.fill();
    }
  },
  gem: (g, s) => {
    g.beginPath();
    g.moveTo(s * 0.2, s * 0.38);
    g.lineTo(s * 0.34, s * 0.2);
    g.lineTo(s * 0.66, s * 0.2);
    g.lineTo(s * 0.8, s * 0.38);
    g.lineTo(s * 0.5, s * 0.84);
    g.closePath();
    g.fill();
  },
  cash: (g, s) => {
    g.fillRect(s * 0.1, s * 0.28, s * 0.8, s * 0.44);
    g.globalCompositeOperation = 'destination-out';
    g.font = `bold ${Math.round(s * 0.38)}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('$', s / 2, s * 0.52);
    g.globalCompositeOperation = 'source-over';
  },
  lock: (g, s) => {
    g.fillRect(s * 0.24, s * 0.45, s * 0.52, s * 0.4);
    g.lineWidth = s * 0.09;
    g.beginPath();
    g.arc(s / 2, s * 0.42, s * 0.17, Math.PI, 0);
    g.stroke();
  },
  grate: (g, s) => {
    g.lineWidth = s * 0.08;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.34, 0, Math.PI * 2);
    g.stroke();
    for (const o of [-0.14, 0, 0.14]) {
      g.beginPath();
      g.moveTo(s * (0.5 + o), s * 0.24);
      g.lineTo(s * (0.5 + o), s * 0.76);
      g.stroke();
    }
  },
  ladder: (g, s) => {
    g.lineWidth = s * 0.08;
    g.beginPath();
    g.moveTo(s * 0.3, s * 0.1);
    g.lineTo(s * 0.3, s * 0.9);
    g.moveTo(s * 0.7, s * 0.1);
    g.lineTo(s * 0.7, s * 0.9);
    for (const y of [0.25, 0.45, 0.65, 0.85]) {
      g.moveTo(s * 0.3, s * y);
      g.lineTo(s * 0.7, s * y);
    }
    g.stroke();
  },
  lift: (g, s) => {
    g.fillRect(s * 0.22, s * 0.12, s * 0.56, s * 0.76);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.24);
    g.lineTo(s * 0.66, s * 0.44);
    g.lineTo(s * 0.34, s * 0.44);
    g.closePath();
    g.moveTo(s * 0.5, s * 0.76);
    g.lineTo(s * 0.66, s * 0.56);
    g.lineTo(s * 0.34, s * 0.56);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
  },
  garage: (g, s) => {
    g.fillRect(s * 0.12, s * 0.12, s * 0.76, s * 0.76);
    g.globalCompositeOperation = 'destination-out';
    g.font = `bold ${Math.round(s * 0.56)}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('P', s / 2, s * 0.54);
    g.globalCompositeOperation = 'source-over';
  },
  wrench: (g, s) => {
    g.lineWidth = s * 0.14;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(s * 0.26, s * 0.76);
    g.lineTo(s * 0.62, s * 0.4);
    g.stroke();
    g.lineWidth = s * 0.1;
    g.beginPath();
    g.arc(s * 0.68, s * 0.32, s * 0.17, Math.PI * 0.95, Math.PI * 2.55);
    g.stroke();
  },
  house: (g, s) => {
    // A house: a roof triangle over a box with a door cut out.
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.12);
    g.lineTo(s * 0.9, s * 0.46);
    g.lineTo(s * 0.1, s * 0.46);
    g.closePath();
    g.fill();
    g.fillRect(s * 0.2, s * 0.44, s * 0.6, s * 0.42);
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(s * 0.42, s * 0.6, s * 0.16, s * 0.26);
    g.globalCompositeOperation = 'source-over';
  },
  car: (g, s) => {
    // A little car seen from the side: body, cabin, two wheels.
    g.fillRect(s * 0.12, s * 0.46, s * 0.76, s * 0.24);
    g.fillRect(s * 0.3, s * 0.3, s * 0.4, s * 0.2);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(s * 0.3, s * 0.72, s * 0.11, 0, Math.PI * 2);
    g.arc(s * 0.7, s * 0.72, s * 0.11, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    g.arc(s * 0.3, s * 0.72, s * 0.08, 0, Math.PI * 2);
    g.arc(s * 0.7, s * 0.72, s * 0.08, 0, Math.PI * 2);
    g.fill();
  },
  flag: (g, s) => {
    g.fillRect(s * 0.2, s * 0.1, s * 0.07, s * 0.82);
    const c = 4;
    const w = (s * 0.56) / c;
    for (let i = 0; i < c; i++)
      for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) g.fillRect(s * 0.27 + i * w, s * 0.12 + j * w, w, w);
    g.lineWidth = s * 0.04;
    g.strokeRect(s * 0.27, s * 0.12, s * 0.56, w * 3);
  },
  cross: (g, s) => {
    g.fillRect(s * 0.38, s * 0.14, s * 0.24, s * 0.72);
    g.fillRect(s * 0.14, s * 0.38, s * 0.72, s * 0.24);
  },
  cart: (g, s) => {
    g.lineWidth = s * 0.08;
    g.beginPath();
    g.moveTo(s * 0.1, s * 0.22);
    g.lineTo(s * 0.24, s * 0.22);
    g.lineTo(s * 0.34, s * 0.64);
    g.lineTo(s * 0.8, s * 0.64);
    g.lineTo(s * 0.86, s * 0.34);
    g.lineTo(s * 0.28, s * 0.34);
    g.stroke();
    for (const x of [0.38, 0.74]) {
      g.beginPath();
      g.arc(s * x, s * 0.8, s * 0.08, 0, Math.PI * 2);
      g.fill();
    }
  },
  pin: (g, s) => {
    g.beginPath();
    g.arc(s / 2, s * 0.36, s * 0.26, Math.PI * 0.85, Math.PI * 2.15);
    g.lineTo(s / 2, s * 0.94);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(s / 2, s * 0.36, s * 0.1, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  },
  tank: (g, s) => {
    g.fillRect(s * 0.12, s * 0.46, s * 0.76, s * 0.3);
    g.fillRect(s * 0.3, s * 0.3, s * 0.36, s * 0.2);
    g.fillRect(s * 0.6, s * 0.36, s * 0.32, s * 0.07);
  },
  bar: (g, s) => {
    g.fillRect(s * 0.08, s * 0.38, s * 0.84, s * 0.24);
    g.globalCompositeOperation = 'destination-out';
    for (const x of [0.22, 0.46, 0.7]) g.fillRect(s * x, s * 0.38, s * 0.1, s * 0.24);
    g.globalCompositeOperation = 'source-over';
  },
  star: (g, s) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? s * 0.42 : s * 0.18;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const x = s / 2 + Math.cos(a) * r;
      const y = s / 2 + Math.sin(a) * r;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  },
  mission: (g, s) => {
    // A disc with an M cut out (mission givers).
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.font = `900 ${Math.round(s * 0.6)}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('M', s / 2, s * 0.53);
    g.globalCompositeOperation = 'source-over';
  },
  skull: (g, s) => {
    g.beginPath();
    g.arc(s / 2, s * 0.42, s * 0.32, 0, Math.PI * 2);
    g.fill();
    g.fillRect(s * 0.3, s * 0.6, s * 0.4, s * 0.24);
    g.globalCompositeOperation = 'destination-out';
    for (const x of [0.37, 0.63]) {
      g.beginPath();
      g.arc(s * x, s * 0.42, s * 0.085, 0, Math.PI * 2);
      g.fill();
    }
    for (const x of [0.4, 0.5, 0.6]) g.fillRect(s * x - s * 0.02, s * 0.7, s * 0.04, s * 0.14);
    g.globalCompositeOperation = 'source-over';
  },
  badge: (g, s) => {
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.1);
    g.lineTo(s * 0.84, s * 0.24);
    g.lineTo(s * 0.78, s * 0.64);
    g.lineTo(s * 0.5, s * 0.9);
    g.lineTo(s * 0.22, s * 0.64);
    g.lineTo(s * 0.16, s * 0.24);
    g.closePath();
    g.fill();
  },
};

/** The atlas: every sprite in one canvas, `cell` px each, in the config's order. */
export function buildIconAtlas(order: readonly string[], cell: number): { canvas: HTMLCanvasElement; index: Map<string, number> } {
  const canvas = document.createElement('canvas');
  canvas.width = cell * order.length;
  canvas.height = cell;
  const g = canvas.getContext('2d')!;
  const index = new Map<string, number>();
  order.forEach((name, i) => {
    index.set(name, i);
    g.save();
    g.translate(i * cell, 0);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    (GLYPHS[name] ?? GLYPHS.dot)(g, cell);
    g.restore();
  });
  return { canvas, index };
}

// ---------------------------------------------------------------------------- the overlay

export interface MapOverlayDeps {
  /** Route along the roads between two points (or a straight line where there are none). */
  route(from: { x: number; z: number }, to: { x: number; z: number }): Array<{ x: number; z: number }>;
  /** Street address of a point (e.g. "5th Ave & 42nd St"). */
  placeName(x: number, z: number): string;
  onWaypoint?(wp: { x: number; z: number } | null): void;
  onLayers?(hidden: string[]): void;
  onClose?(): void;
}

export class MapOverlay {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly side: HTMLDivElement;
  private readonly info: HTMLDivElement;
  private readonly base: HTMLCanvasElement;
  private readonly baseScale = 1.25; // base map px per metre
  private readonly pad = 160;
  private readonly atlas: { canvas: HTMLCanvasElement; index: Map<string, number> };
  private readonly tinted = new Map<string, HTMLCanvasElement>();
  private view: MapView;
  private open_ = false;
  private markers: MapMarker[] = [];
  hidden: string[];
  waypoint: { x: number; z: number } | null = null;
  /** The route to the waypoint (player first). */
  path: Array<{ x: number; z: number }> = [];
  private routeT = 0;
  private drag: { sx: number; sy: number; cx: number; cz: number; moved: boolean } | null = null;
  private hover: { x: number; z: number } | null = null;
  private player = { x: 0, z: 0, heading: 0 };

  constructor(
    parent: HTMLElement,
    private readonly layout: CityLayout,
    readonly cfg: MapConfig,
    private readonly d: MapOverlayDeps,
  ) {
    this.hidden = cfg.layers.filter((l) => l.default === false).map((l) => l.id);
    this.view = { cx: 0, cz: 0, zoom: cfg.map.startZoom, w: 800, h: 600 };
    this.el = document.createElement('div');
    this.el.className = 'city-map';
    this.el.style.display = 'none';
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.side = document.createElement('div');
    this.side.className = 'cm-side';
    this.info = document.createElement('div');
    this.info.className = 'cm-info';
    this.el.append(this.canvas, this.side, this.info);
    parent.appendChild(this.el);
    this.atlas = buildIconAtlas(cfg.sprites.order, cfg.sprites.cell);
    this.base = this.renderBase();
    this.bindPointer();
    this.side.addEventListener('change', (e) => {
      const inp = e.target as HTMLInputElement;
      if (!inp.dataset['layer']) return;
      const id = inp.dataset['layer'];
      this.hidden = inp.checked ? this.hidden.filter((h) => h !== id) : [...this.hidden, id];
      this.d.onLayers?.(this.hidden);
    });
    this.side.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset['act'] === 'clear') this.setWaypoint(null);
      if (b.dataset['act'] === 'centre') this.centreOnPlayer();
      if (b.dataset['act'] === 'close') this.close();
      if (b.dataset['act'] === 'fold') {
        this.el.classList.toggle('folded');
        this.renderSide();
      }
    });
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.open_ = true;
    this.el.style.display = 'block';
    if (window.innerWidth <= 640 && !this.el.dataset['folded']) {
      this.el.classList.add('folded');
      this.el.dataset['folded'] = '1';
    }
    this.resize();
    this.centreOnPlayer();
    this.renderSide();
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.el.style.display = 'none';
    this.drag = null;
    this.d.onClose?.();
  }

  centreOnPlayer(): void {
    this.view = clampView({ ...this.view, cx: this.player.x, cz: this.player.z }, this.layout.land);
  }

  setHidden(h: string[]): void {
    this.hidden = [...h];
    if (this.open_) this.renderSide();
  }

  setWaypoint(wp: { x: number; z: number } | null): void {
    this.waypoint = wp;
    this.path = [];
    this.routeT = 0;
    this.d.onWaypoint?.(wp);
    if (this.open_) this.renderSide();
  }

  /** Layers currently shown. */
  get shown(): Set<string> {
    return visibleLayers(this.cfg, this.hidden);
  }

  /**
   * Each frame: the player (for the route and centring), live markers, and held pan keys.
   * Returns true when the waypoint was reached (and cleared).
   */
  update(dt: number, player: { x: number; z: number; heading: number }, markers: MapMarker[], pan: { x: number; z: number; zoom: number }): boolean {
    this.player = player;
    this.markers = markers;
    let arrived = false;
    if (this.waypoint) {
      if (Math.hypot(this.waypoint.x - player.x, this.waypoint.z - player.z) < this.cfg.map.waypointArrive) {
        this.setWaypoint(null);
        arrived = true;
      } else {
        this.routeT -= dt;
        if (this.routeT <= 0 || !this.path.length) {
          this.routeT = this.cfg.map.routeRefresh;
          this.path = this.d.route(player, this.waypoint);
        } else if (this.path.length) this.path[0] = { x: player.x, z: player.z };
      }
    }
    if (!this.open_) return arrived;
    if (pan.x || pan.z) {
      const k = (this.cfg.map.panSpeed * dt) / this.view.zoom;
      this.view = clampView({ ...this.view, cx: this.view.cx + pan.x * k, cz: this.view.cz + pan.z * k }, this.layout.land);
    }
    if (pan.zoom) this.view = zoomAt(this.view, this.view.w / 2, this.view.h / 2, Math.pow(2, pan.zoom * dt * 1.5), this.cfg.map.minZoom, this.cfg.map.maxZoom);
    this.draw();
    return arrived;
  }

  /** Keys while open (Esc/M close; C centres; Backspace clears the waypoint; +/- zoom). */
  key(code: string): boolean {
    if (!this.open_) return false;
    if (code === 'Escape' || code === 'KeyM') this.close();
    else if (code === 'KeyC') this.centreOnPlayer();
    else if (code === 'Backspace' || code === 'Delete') this.setWaypoint(null);
    else if (code === 'Equal' || code === 'NumpadAdd') this.view = zoomAt(this.view, this.view.w / 2, this.view.h / 2, 1.4, this.cfg.map.minZoom, this.cfg.map.maxZoom);
    else if (code === 'Minus' || code === 'NumpadSubtract') this.view = zoomAt(this.view, this.view.w / 2, this.view.h / 2, 1 / 1.4, this.cfg.map.minZoom, this.cfg.map.maxZoom);
    else return false;
    return true;
  }

  // ------------------------------------------------------------------ pointer

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.view = clampView(zoomAt(this.view, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18, this.cfg.map.minZoom, this.cfg.map.maxZoom), this.layout.land);
    }, { passive: false });
    // Touch: two fingers pinch to zoom (about the point between them); one drags.
    const fingers = new Map<number, { x: number; y: number }>();
    let pinch: number | null = null;
    const spread = (): number => {
      const [a, b] = [...fingers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    c.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        this.setWaypoint(null);
        return;
      }
      c.setPointerCapture(e.pointerId);
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        pinch = spread();
        this.drag = null;
        return;
      }
      this.drag = { sx: e.clientX, sy: e.clientY, cx: this.view.cx, cz: this.view.cz, moved: false };
    });
    const lift = (e: PointerEvent): void => {
      fingers.delete(e.pointerId);
      if (fingers.size < 2) pinch = null;
    };
    c.addEventListener('pointercancel', lift);
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch !== null && fingers.size === 2) {
        const d = spread();
        const [a, b] = [...fingers.values()];
        if (pinch > 0 && d > 0) this.view = clampView(zoomAt(this.view, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinch, this.cfg.map.minZoom, this.cfg.map.maxZoom), this.layout.land);
        pinch = d;
        return;
      }
      this.hover = screenToWorld(this.view, e.clientX - r.left, e.clientY - r.top);
      const dg = this.drag;
      if (!dg) return;
      const dx = e.clientX - dg.sx;
      const dy = e.clientY - dg.sy;
      if (Math.hypot(dx, dy) > 4) dg.moved = true;
      this.view = clampView({ ...this.view, cx: dg.cx - dx / this.view.zoom, cz: dg.cz - dy / this.view.zoom }, this.layout.land);
    });
    c.addEventListener('pointerup', (e) => {
      const wasPinch = pinch !== null || fingers.size > 1;
      lift(e);
      if (wasPinch) {
        this.drag = null;
        return;
      }
      const dg = this.drag;
      this.drag = null;
      if (!dg || dg.moved) return;
      const r = c.getBoundingClientRect();
      const w = screenToWorld(this.view, e.clientX - r.left, e.clientY - r.top);
      const L = this.layout.land;
      if (w.x < L.x0 || w.x > L.x1 || w.z < L.z0 || w.z > L.z1) return;
      // Clicking the waypoint again clears it.
      if (this.waypoint && Math.hypot(w.x - this.waypoint.x, w.z - this.waypoint.z) * this.view.zoom < 14) this.setWaypoint(null);
      else this.setWaypoint(w);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.open_ && this.resize());
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view = { ...this.view, w, h };
  }

  // ------------------------------------------------------------------ drawing

  /** The island pre-rendered once: water, blocks, buildings, park, roads. */
  private renderBase(): HTMLCanvasElement {
    const L = this.layout;
    const S = this.baseScale;
    const pad = this.pad;
    const w = Math.ceil((L.land.x1 - L.land.x0 + pad * 2) * S);
    const h = Math.ceil((L.land.z1 - L.land.z0 + pad * 2) * S);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const X = (x: number): number => (x - L.land.x0 + pad) * S;
    const Z = (z: number): number => (z - L.land.z0 + pad) * S;
    const rect = (r: { x0: number; x1: number; z0: number; z1: number }, col: string): void => {
      g.fillStyle = col;
      g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
    };
    // ---- water: deep in the middle of the rivers, lighter towards the shore, with ripples.
    const sea = g.createLinearGradient(0, 0, w, h);
    sea.addColorStop(0, '#163a52');
    sea.addColorStop(0.5, '#1d4a66');
    sea.addColorStop(1, '#14354b');
    g.fillStyle = sea;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160, 210, 235, 0.06)';
    g.lineWidth = 1;
    for (let y = 6; y < h; y += 11) {
      g.beginPath();
      for (let x = 0; x <= w; x += 12) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 1.6);
      g.stroke();
    }
    // Shallows and the sea wall round the island.
    for (const [grow, col] of [
      [14, 'rgba(70, 140, 170, 0.35)'],
      [6, 'rgba(110, 175, 195, 0.35)'],
    ] as const) {
      g.fillStyle = col;
      g.fillRect(X(L.land.x0) - grow * S, Z(L.land.z0) - grow * S, (L.land.x1 - L.land.x0 + grow * 2) * S, (L.land.z1 - L.land.z0 + grow * 2) * S);
    }
    rect(L.land, '#c9c1ad'); // the promenade edge
    rect({ x0: L.land.x0 + 3, x1: L.land.x1 - 3, z0: L.land.z0 + 3, z1: L.land.z1 - 3 }, '#2e3238'); // asphalt
    // Lane markings first: the blocks and the park cover them where they don't run.
    g.strokeStyle = 'rgba(255, 210, 63, 0.55)';
    g.lineWidth = 1;
    for (const x of L.aveX)
      for (const dx of [-0.6, 0.6]) {
        g.beginPath();
        g.moveTo(X(x + dx), Z(L.land.z0 + 4));
        g.lineTo(X(x + dx), Z(L.land.z1 - 4));
        g.stroke();
      }
    g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    g.setLineDash([4 * S, 5 * S]);
    for (const z of L.streetZ) {
      g.beginPath();
      g.moveTo(X(L.land.x0 + 4), Z(z));
      g.lineTo(X(L.land.x1 - 4), Z(z));
      g.stroke();
    }
    g.setLineDash([]);
    // ---- blocks: pavement tinted by district, building footprints shaded by height with a
    // soft drop shadow (sun from the north-west), so the skyline reads.
    const tint = (x: number, z: number): string => {
      const f = (z - L.land.z0) / (L.land.z1 - L.land.z0);
      const edge = Math.min(x - L.land.x0, L.land.x1 - x, z - L.land.z0, L.land.z1 - z);
      if (edge < CITY.promenade + 12) return '#9fb2ad'; // waterfront
      if (f < 0.42) return '#b3a998'; // uptown
      if (f < 0.78) return '#a3a6ab'; // midtown
      return '#9aa3b4'; // downtown
    };
    for (const b of L.blocks) rect(b, tint((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2));
    // Park: lawn, a darker border of trees, the lake with a bank, and a ring path.
    const P = L.park;
    rect({ x0: P.x0 - 2, x1: P.x1 + 2, z0: P.z0 - 2, z1: P.z1 + 2 }, '#c9c1ad');
    rect(P, '#4f8a3f');
    g.save();
    g.beginPath();
    g.rect(X(P.x0), Z(P.z0), (P.x1 - P.x0) * S, (P.z1 - P.z0) * S);
    g.clip();
    // Tree clumps (deterministic speckle).
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 520; i++) {
      const x = P.x0 + rnd() * (P.x1 - P.x0);
      const z = P.z0 + rnd() * (P.z1 - P.z0);
      const inLake = x > L.parkLake.x0 - 4 && x < L.parkLake.x1 + 4 && z > L.parkLake.z0 - 4 && z < L.parkLake.z1 + 4;
      if (inLake) continue;
      g.fillStyle = rnd() < 0.5 ? 'rgba(40, 92, 38, 0.75)' : 'rgba(62, 118, 48, 0.75)';
      g.beginPath();
      g.arc(X(x), Z(z), (2.2 + rnd() * 2.8) * S, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(225, 214, 180, 0.7)';
    g.lineWidth = 2.2 * S;
    g.strokeRect(X(P.x0 + 14), Z(P.z0 + 14), (P.x1 - P.x0 - 28) * S, (P.z1 - P.z0 - 28) * S);
    g.restore();
    const lk = L.parkLake;
    rect({ x0: lk.x0 - 3, x1: lk.x1 + 3, z0: lk.z0 - 3, z1: lk.z1 + 3 }, '#8fa27a');
    const lake = g.createRadialGradient(X((lk.x0 + lk.x1) / 2), Z((lk.z0 + lk.z1) / 2), 4, X((lk.x0 + lk.x1) / 2), Z((lk.z0 + lk.z1) / 2), (lk.x1 - lk.x0) * S * 0.7);
    lake.addColorStop(0, '#2a6a8c');
    lake.addColorStop(1, '#3f8aa8');
    g.fillStyle = lake;
    g.fillRect(X(lk.x0), Z(lk.z0), (lk.x1 - lk.x0) * S, (lk.z1 - lk.z0) * S);
    // The docks: timber piers out into the rivers.
    for (const d of L.docks ?? []) rect(d, '#8a7458');
    // Buildings: shadow first, then the roof, lighter the taller it is, with a lit north-west edge.
    const maxH = Math.max(...L.buildings.map((b) => b.height));
    g.fillStyle = 'rgba(10, 12, 16, 0.28)';
    for (const b of L.buildings) {
      const off = Math.min(9, 1.5 + b.height * 0.04) * S;
      g.fillRect(X(b.rect.x0) + off, Z(b.rect.z0) + off, (b.rect.x1 - b.rect.x0) * S, (b.rect.z1 - b.rect.z0) * S);
    }
    for (const b of L.buildings) {
      const k = Math.min(1, b.height / maxH);
      const l = Math.round(78 + k * 70);
      g.fillStyle = `rgb(${l - 6}, ${l - 2}, ${l + 6})`;
      g.fillRect(X(b.rect.x0), Z(b.rect.z0), (b.rect.x1 - b.rect.x0) * S, (b.rect.z1 - b.rect.z0) * S);
      g.fillStyle = 'rgba(255, 255, 255, 0.18)';
      g.fillRect(X(b.rect.x0), Z(b.rect.z0), (b.rect.x1 - b.rect.x0) * S, 1.2 * S);
      g.fillRect(X(b.rect.x0), Z(b.rect.z0), 1.2 * S, (b.rect.z1 - b.rect.z0) * S);
      if (b.setback) {
        const r = b.setback.rect;
        g.fillStyle = 'rgba(255, 255, 255, 0.12)';
        g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S);
      }
    }
    for (const g2 of L.garages ?? []) rect(g2.rect, '#7a6a8f');
    // Kerb lines along every block, and lane dashes: yellow double lines on the avenues, white
    // dashes on the streets.
    g.strokeStyle = 'rgba(230, 226, 214, 0.55)';
    g.lineWidth = Math.max(1, 0.6 * S);
    for (const b of L.blocks) g.strokeRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * S, (b.z1 - b.z0) * S);
    void CITY;
    return c;
  }

  private sprite(name: string, color: string): HTMLCanvasElement {
    const key = `${name}|${color}`;
    let c = this.tinted.get(key);
    if (c) return c;
    const cell = this.cfg.sprites.cell;
    c = document.createElement('canvas');
    c.width = cell;
    c.height = cell;
    const g = c.getContext('2d')!;
    const i = this.atlas.index.get(name) ?? 0;
    // Dark outline: the glyph in black, offset all round, then the colour on top.
    for (const [ox, oy] of [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ]) g.drawImage(this.atlas.canvas, i * cell, 0, cell, cell, ox, oy, cell, cell);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#0b0d12';
    g.fillRect(0, 0, cell, cell);
    g.globalCompositeOperation = 'source-over';
    const tint = document.createElement('canvas');
    tint.width = cell;
    tint.height = cell;
    const tg = tint.getContext('2d')!;
    tg.drawImage(this.atlas.canvas, i * cell, 0, cell, cell, 0, 0, cell, cell);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = color;
    tg.fillRect(0, 0, cell, cell);
    g.drawImage(tint, 0, 0);
    this.tinted.set(key, c);
    return c;
  }

  private draw(): void {
    const g = this.ctx;
    const v = this.view;
    const L = this.layout;
    g.fillStyle = '#1d3d52';
    g.fillRect(0, 0, v.w, v.h);
    // Base map.
    const tl = worldToScreen(v, L.land.x0 - this.pad, L.land.z0 - this.pad);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.base, tl.sx, tl.sy, this.base.width * (v.zoom / this.baseScale), this.base.height * (v.zoom / this.baseScale));
    // Street names when zoomed in.
    if (v.zoom > 1.1) this.drawStreetNames();
    // Area labels.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const lb of this.cfg.labels) {
      const p = worldToScreen(v, lb.x, lb.z);
      g.save();
      g.translate(p.sx, p.sy);
      if (lb.vertical) g.rotate(-Math.PI / 2);
      g.font = `900 ${Math.round(lb.size * Math.min(1.4, Math.max(0.7, v.zoom)))}px sans-serif`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(12, 15, 21, 0.35)';
      g.strokeText(lb.text, 0, 0);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText(lb.text, 0, 0);
      g.restore();
    }
    const shown = this.shown;
    // Wanted area first (under the icons).
    for (const m of this.markers) {
      const spec = this.cfg.icons[m.icon];
      if (!spec || !shown.has(spec.layer) || !m.r) continue;
      const p = worldToScreen(v, m.x, m.z);
      g.fillStyle = 'rgba(80,140,255,0.22)';
      g.strokeStyle = 'rgba(120,170,255,0.8)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.sx, p.sy, m.r * v.zoom, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // The route to the waypoint.
    if (this.path.length > 1) {
      const lw = Math.max(3, Math.min(8, v.zoom * 4));
      const trace = (): void => {
        g.beginPath();
        this.path.forEach((q, i) => {
          const p = worldToScreen(v, q.x, q.z);
          if (i) g.lineTo(p.sx, p.sy);
          else g.moveTo(p.sx, p.sy);
        });
        g.stroke();
      };
      g.lineJoin = 'round';
      g.lineCap = 'round';
      // A dark casing, a glowing body, and dashes that march towards the waypoint.
      g.strokeStyle = 'rgba(12, 15, 21, 0.75)';
      g.lineWidth = lw + 4;
      trace();
      g.strokeStyle = 'rgba(255, 210, 63, 0.95)';
      g.lineWidth = lw;
      trace();
      g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      g.lineWidth = Math.max(1.5, lw * 0.35);
      g.setLineDash([lw * 1.2, lw * 2.2]);
      g.lineDashOffset = -((performance.now() / 40) % (lw * 3.4));
      trace();
      g.setLineDash([]);
      g.lineDashOffset = 0;
    }
    // Icons, small ones first so the important ones sit on top.
    const list = this.markers.filter((m) => {
      const spec = this.cfg.icons[m.icon];
      return spec && spec.size > 0 && shown.has(spec.layer) && !m.r;
    });
    list.sort((a, b) => this.cfg.icons[a.icon].size - this.cfg.icons[b.icon].size);
    const scale = Math.max(0.7, Math.min(1.3, 0.75 + v.zoom * 0.25));
    for (const m of list) {
      const spec = this.cfg.icons[m.icon];
      const p = worldToScreen(v, m.x, m.z);
      if (p.sx < -30 || p.sy < -30 || p.sx > v.w + 30 || p.sy > v.h + 30) continue;
      const s = spec.size * scale;
      const img = this.sprite(spec.sprite, m.color ?? (spec.color === 'type' ? '#ffffff' : spec.color));
      g.save();
      g.translate(p.sx, p.sy);
      // Rotating icons point up the screen at heading PI/2 (north).
      if (spec.rotates && m.heading !== undefined) g.rotate(Math.PI / 2 - m.heading);
      g.drawImage(img, -s / 2, spec.sprite === 'pin' ? -s : -s / 2, s, s);
      g.restore();
      if (m.label && v.zoom > 1.6) {
        g.font = '600 11px sans-serif';
        g.fillStyle = '#fff';
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.lineWidth = 3;
        g.strokeText(m.label, p.sx, p.sy + s * 0.75);
        g.fillText(m.label, p.sx, p.sy + s * 0.75);
      }
    }
    // Waypoint pin and the player on top.
    if (this.waypoint) {
      const spec = this.cfg.icons['waypoint'];
      const p = worldToScreen(v, this.waypoint.x, this.waypoint.z);
      const s = spec.size;
      g.drawImage(this.sprite(spec.sprite, spec.color), p.sx - s / 2, p.sy - s, s, s);
    }
    {
      const spec = this.cfg.icons['player'];
      const p = worldToScreen(v, this.player.x, this.player.z);
      const s = spec.size;
      g.save();
      g.translate(p.sx, p.sy);
      g.rotate(Math.PI / 2 - this.player.heading);
      g.drawImage(this.sprite(spec.sprite, spec.color), -s / 2, -s / 2, s, s);
      g.restore();
    }
    // A soft vignette and a compass rose (north is up: low z).
    const vg = g.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.35, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5, 10, 18, 0.45)');
    g.fillStyle = vg;
    g.fillRect(0, 0, v.w, v.h);
    {
      const cx = v.w - 54;
      const cy = 64;
      g.save();
      g.translate(cx, cy);
      g.fillStyle = 'rgba(12, 15, 21, 0.7)';
      g.beginPath();
      g.arc(0, 0, 30, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      g.lineWidth = 1.5;
      g.stroke();
      for (const [ang, col] of [
        [0, '#ff4b3a'],
        [Math.PI, '#e6e9ee'],
      ] as const) {
        g.save();
        g.rotate(ang);
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, -22);
        g.lineTo(7, 0);
        g.lineTo(-7, 0);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.fillStyle = '#fff';
      g.font = '800 11px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', 0, -38);
      g.restore();
    }
    // Info line: where the cursor is, how far the waypoint is.
    const parts: string[] = [];
    if (this.hover) parts.push(this.d.placeName(this.hover.x, this.hover.z));
    if (this.waypoint && this.path.length > 1) parts.push(`Waypoint ${Math.round(pathLength(this.path))} m by road`);
    this.info.textContent = parts.join('  ·  ');
  }

  private drawStreetNames(): void {
    const g = this.ctx;
    const v = this.view;
    const L = this.layout;
    g.font = '600 11px sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const x of L.aveX) {
      const name = this.d.placeName(x, L.streetZ[0]).split(' & ')[0];
      for (let k = 0; k < L.streetZ.length - 1; k += 3) {
        const z = (L.streetZ[k] + L.streetZ[k + 1]) / 2;
        const p = worldToScreen(v, x, z);
        if (p.sx < 0 || p.sx > v.w || p.sy < 0 || p.sy > v.h) continue;
        g.save();
        g.translate(p.sx, p.sy);
        g.rotate(-Math.PI / 2);
        g.fillText(name, 0, 0);
        g.restore();
      }
    }
    for (const z of L.streetZ) {
      const name = this.d.placeName(L.aveX[0], z).split(' & ')[1] ?? '';
      for (let k = 0; k < L.aveX.length - 1; k += 2) {
        const x = (L.aveX[k] + L.aveX[k + 1]) / 2;
        const p = worldToScreen(v, x, z);
        if (p.sx < 0 || p.sx > v.w || p.sy < 0 || p.sy > v.h) continue;
        g.fillText(name, p.sx, p.sy);
      }
    }
  }

  private renderSide(): void {
    const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const shown = this.shown;
    // A legend icon per layer: the first icon on that layer.
    const iconFor = (layer: string): string => {
      const e = Object.entries(this.cfg.icons).find(([, s]) => s.layer === layer);
      if (!e) return '';
      const s = e[1];
      return `<img src="${this.sprite(s.sprite, s.color === 'type' ? '#9be37a' : s.color).toDataURL()}" alt="">`;
    };
    this.side.innerHTML = `
      <div class="cm-title">CITY MAP <button class="btn small cm-fold" data-act="fold">${this.el.classList.contains('folded') ? 'Layers ▸' : 'Hide ▾'}</button></div>
      <div class="cm-layers">${this.cfg.layers
        .filter((l) => l.toggle !== false)
        .map((l) => `<label>${iconFor(l.id)}<input type="checkbox" data-layer="${l.id}" ${shown.has(l.id) ? 'checked' : ''}> ${esc(l.label)}</label>`)
        .join('')}</div>
      <div class="cm-wp">${this.waypoint ? `Waypoint: ${esc(this.d.placeName(this.waypoint.x, this.waypoint.z))} <button class="btn small" data-act="clear">Clear</button>` : 'Click the map to set a waypoint.'}</div>
      <div class="cm-help">Drag or WASD to pan · wheel, pinch or +/- to zoom · tap/click for a waypoint · C centre · right-click clears · M or Esc closes</div>
      <div class="cm-btns"><button class="btn small" data-act="centre">Centre on me</button><button class="btn small" data-act="close">Close (M)</button></div>`;
  }
}
