import type { PoliceBlip } from '../police/Vision';
import type { CityLayout } from '../world/CityLayout';

/** DOM overlay: minimap, health, speedometer, location, prompts, toasts and big messages. */
export class Hud {
  readonly el: HTMLDivElement;
  private readonly mapCanvas: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly mapImage: HTMLCanvasElement;
  private readonly health: HTMLDivElement;
  private readonly speedo: HTMLDivElement;
  private readonly nitroEl: HTMLDivElement;
  private readonly speedVal: HTMLDivElement;
  private readonly gearVal: HTMLDivElement;
  private readonly vehicleBar: HTMLDivElement;
  private readonly location: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly toastBox: HTMLDivElement;
  private readonly big: HTMLDivElement;
  private readonly fps: HTMLDivElement;
  private readonly starsEl: HTMLDivElement;
  private readonly starEls: HTMLSpanElement[] = [];
  private readonly arrestWrap: HTMLDivElement;
  private readonly arrestBar: HTMLDivElement;
  private blips: PoliceBlip[] = [];
  private markers: Array<{ x: number; z: number; color: string; size: number; letter?: string }> = [];
  /** Minimap radius in metres (the Early Warning Radar widens it). */
  private radarRange = 105;
  static readonly BASE_RADAR = 105;
  private abilitiesEl!: HTMLDivElement;
  private radarWarnEl!: HTMLDivElement;
  private abilitiesKey = '';
  /** Underground: the maze to draw instead of the street map. */
  private sewer: { x0: number; z0: number; size: number; block: number; open: boolean[][] } | null = null;
  private search: { x: number; z: number; r: number } | null = null;
  /** Street race overlay on the minimap: the racing line, the next checkpoints and the rivals. */
  private race: { line: Array<{ x: number; z: number }>; next: { x: number; z: number; finish: boolean } | null; after: { x: number; z: number } | null; racers: Array<{ x: number; z: number }> } | null = null;
  private racePanel!: HTMLDivElement;
  private raceKey = '';
  private heistPanel!: HTMLDivElement;
  private eventPanel!: HTMLDivElement;
  private hurt!: HTMLDivElement;
  private questPanel!: HTMLDivElement;
  private questKey = '';
  private hurtTimer = 0;
  private eventKey = '';
  /** Waypoint from the city map: the route and the pin. */
  private waypoint: { path: Array<{ x: number; z: number }>; at: { x: number; z: number } } | null = null;
  private heistKey = '';
  private readonly mapScale: number;
  private readonly layout: CityLayout;
  private bigUntil = 0;
  private lastText: Record<string, string> = {};

  constructor(parent: HTMLElement, layout: CityLayout) {
    this.layout = layout;
    this.el = div('hud');
    parent.appendChild(this.el);

    const mapWrap = div('minimap');
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 220;
    this.mapCanvas.height = 220;
    mapWrap.appendChild(this.mapCanvas);
    this.mapCtx = this.mapCanvas.getContext('2d')!;
    const bars = div('bars');
    this.health = div('bar health');
    this.vehicleBar = div('bar vehicle');
    bars.append(wrapBar(this.health), wrapBar(this.vehicleBar));
    mapWrap.appendChild(bars);
    this.el.appendChild(mapWrap);

    this.speedo = div('speedo');
    this.speedVal = div('speed-val');
    this.gearVal = div('gear-val');
    const unit = div('speed-unit');
    unit.textContent = 'KM/H';
    this.speedo.append(this.speedVal, unit, this.gearVal);
    this.nitroEl = div('nitro');
    this.nitroEl.innerHTML = '<span>NOS</span><div class="nitro-bar"><i></i></div>';
    this.nitroEl.style.display = 'none';
    this.speedo.appendChild(this.nitroEl);
    this.el.appendChild(this.speedo);

    this.location = div('location');
    this.prompt = div('prompt');
    this.toastBox = div('toasts');
    this.big = div('big');
    this.fps = div('fps');
    this.starsEl = div('stars');
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      this.starsEl.appendChild(s);
      this.starEls.push(s);
    }
    this.arrestWrap = div('arrest');
    this.arrestBar = div('arrest-bar');
    const arrestLabel = div('arrest-label');
    arrestLabel.textContent = 'BEING ARRESTED: get away!';
    this.arrestWrap.append(arrestLabel, wrapBar(this.arrestBar));
    this.el.append(this.location, this.prompt, this.toastBox, this.big, this.fps, this.starsEl, this.arrestWrap);
    this.abilitiesEl = div('tune-abilities');
    this.radarWarnEl = div('radar-warn');
    this.el.append(this.abilitiesEl, this.radarWarnEl);
    this.racePanel = div('race-panel');
    this.heistPanel = div('heist-panel');
    this.eventPanel = div('event-panel');
    this.hurt = div('hurt-flash');
    this.questPanel = div('quest-panel');
    this.el.append(this.racePanel, this.heistPanel, this.eventPanel, this.questPanel, this.hurt);

    // Pre-rendered map: 1 px = mapScale metres.
    this.mapScale = 1.2;
    const L = layout.land;
    const pad = 400;
    const w = Math.ceil((L.x1 - L.x0 + pad * 2) / this.mapScale);
    const h = Math.ceil((L.z1 - L.z0 + pad * 2) / this.mapScale);
    this.mapImage = document.createElement('canvas');
    this.mapImage.width = w;
    this.mapImage.height = h;
    const ctx = this.mapImage.getContext('2d')!;
    const X = (x: number): number => (x - L.x0 + pad) / this.mapScale;
    const Z = (z: number): number => (z - L.z0 + pad) / this.mapScale;
    const rect = (r: { x0: number; z0: number; x1: number; z1: number }, color: string): void => {
      ctx.fillStyle = color;
      ctx.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) / this.mapScale, (r.z1 - r.z0) / this.mapScale);
    };
    ctx.fillStyle = '#284a61';
    ctx.fillRect(0, 0, w, h);
    rect(L, '#4b4f55');
    for (const b of layout.blocks) rect(b, '#9a9a94');
    for (const b of layout.buildings) rect(b.rect, '#6d6f73');
    rect(layout.park, '#4f7a3a');
    rect(layout.parkLake, '#3a6782');
    for (const d of layout.docks ?? []) rect(d, '#8a7458');
  }

  private setText(key: string, el: HTMLElement, text: string): void {
    if (this.lastText[key] === text) return;
    this.lastText[key] = text;
    el.textContent = text;
  }

  /** The nitrous gauge under the speedometer (null hides it). */
  setNitro(n: { charge01: number; active: boolean } | null): void {
    const want = n ? 'flex' : 'none';
    if (this.nitroEl.style.display !== want) this.nitroEl.style.display = want;
    if (!n) return;
    const bar = this.nitroEl.querySelector('i') as HTMLElement;
    bar.style.width = `${Math.round(n.charge01 * 100)}%`;
    this.nitroEl.classList.toggle('active', n.active);
  }

  /** Minimap radius in metres. */
  setRadarRange(m: number): void {
    this.radarRange = Math.max(40, m);
  }

  /** Early Warning Radar alert line (empty hides it). */
  setRadarWarning(text: string): void {
    this.radarWarnEl.style.display = text ? 'block' : 'none';
    this.setText('radarWarn', this.radarWarnEl, text ? `⚠ ${text}` : '');
  }

  /**
   * Tuned-car abilities: name, key and a cooldown bar (cooldown01: 1 = just used, 0 = ready;
   * active01: time left of a running ability). Null hides the panel.
   */
  setAbilities(rows: Array<{ name: string; key: string; cooldown01: number; active01: number; passive: boolean }> | null): void {
    if (!rows || !rows.length) {
      this.abilitiesEl.style.display = 'none';
      this.abilitiesKey = '';
      return;
    }
    this.abilitiesEl.style.display = 'flex';
    const key = rows.map((r) => r.name).join('|');
    if (key !== this.abilitiesKey) {
      this.abilitiesKey = key;
      this.abilitiesEl.innerHTML = rows
        .map((r) => `<div class="tune-ab ${r.passive ? 'passive' : ''}"><div class="tune-ab-name">${r.key ? `<kbd>${r.key}</kbd> ` : ''}${r.name}</div><div class="tune-ab-bar"><i></i></div></div>`)
        .join('');
    }
    const els = this.abilitiesEl.children;
    rows.forEach((r, i) => {
      const el = els[i] as HTMLDivElement | undefined;
      if (!el) return;
      const bar = el.querySelector('i') as HTMLElement;
      const fill = r.passive ? 1 : r.active01 > 0 ? r.active01 : 1 - r.cooldown01;
      bar.style.width = `${Math.round(fill * 100)}%`;
      el.classList.toggle('ready', !r.passive && r.cooldown01 === 0);
      el.classList.toggle('active', r.active01 > 0);
    });
  }

  /** Race overlay for the minimap (null when there's no race). */
  setRaceMap(r: Hud['race']): void {
    this.race = r;
  }

  /** The race panel (position, checkpoint, lap, time) as HTML, or null to hide it. */
  setRacePanel(html: string | null): void {
    const key = html ?? '';
    if (key === this.raceKey) return;
    this.raceKey = key;
    this.racePanel.style.display = html ? 'block' : 'none';
    if (html) this.racePanel.innerHTML = html;
  }

  /** The waypoint route for the minimap (null clears it). */
  setWaypoint(w: { path: Array<{ x: number; z: number }>; at: { x: number; z: number } } | null): void {
    this.waypoint = w;
  }

  /** The heist panel (objective, meters, loot, crew) as HTML, or null to hide it. */
  setHeistPanel(html: string | null): void {
    const key = html ?? '';
    if (key === this.heistKey) return;
    this.heistKey = key;
    this.heistPanel.style.display = html ? 'block' : 'none';
    if (html) this.heistPanel.innerHTML = html;
  }

  /** Street event panel (null hides it); `lower` moves it below a race or heist panel. */
  /** The campaign tracker (top right): act, job, current objective. Null hides it. */
  setQuestPanel(html: string | null, boss = false): void {
    const key = `${boss ? 1 : 0}${html ?? ''}`;
    if (key === this.questKey) return;
    this.questKey = key;
    this.questPanel.style.display = html ? 'block' : 'none';
    this.questPanel.classList.toggle('boss', boss);
    if (html) this.questPanel.innerHTML = html;
  }

  /** A red flash at the screen edges (bitten, hit). `strength` 0-1. */
  hurtFlash(strength = 0.6): void {
    const el = this.hurt;
    el.style.transition = 'none';
    el.style.opacity = String(0.25 + 0.6 * Math.max(0, Math.min(1, strength)));
    clearTimeout(this.hurtTimer);
    this.hurtTimer = window.setTimeout(() => {
      el.style.transition = 'opacity 0.45s ease-out';
      el.style.opacity = '0';
    }, 60);
  }

  setEventPanel(html: string | null, lower = false): void {
    const key = `${lower ? 1 : 0}${html ?? ''}`;
    if (key === this.eventKey) return;
    this.eventKey = key;
    this.eventPanel.style.display = html ? 'block' : 'none';
    this.eventPanel.classList.toggle('lower', lower);
    if (html) this.eventPanel.innerHTML = html;
  }

  setVisible(on: boolean): void {
    this.el.style.display = on ? 'block' : 'none';
  }

  update(state: {
    health01: number;
    inCar: boolean;
    speedKmh: number;
    gear: number;
    /** Driver is backing up (brake held while rolling backwards). */
    reversing: boolean;
    vehicleHealth01: number;
    x: number;
    z: number;
    /** Heading of the camera view, for a heading-up map. */
    viewHeading: number;
    /** Heading of the player or car arrow. */
    heading: number;
    prompt: string;
    fps: number;
    /** "Rooftops" / "Sewers" (empty on the street). */
    layer?: string;
    stars: number;
    /** Stars blink while police search for you out of sight. */
    searching: boolean;
    arrest01: number;
    blips: PoliceBlip[];
    search: { x: number; z: number; r: number } | null;
    /** Static map markers (shops, pickups): square icons. */
    markers?: Array<{ x: number; z: number; color: string; size: number; letter?: string }>;
  }): void {
    // (Panels come and go: re-check where toasts start a few times a second.)
    if (++this.layoutTick % 15 === 0 && this.toastBox.childElementCount) this.layoutToasts();
    this.blips = state.blips;
    this.markers = state.markers ?? [];
    this.search = state.search;
    const blinkOff = state.searching && Math.floor(performance.now() / 350) % 2 === 0;
    this.starEls.forEach((s, i) => {
      const lit = i < state.stars;
      s.className = lit ? (blinkOff ? 'lit dim' : 'lit') : '';
    });
    this.arrestWrap.style.opacity = state.arrest01 > 0 ? '1' : '0';
    this.arrestBar.style.width = `${(state.arrest01 * 100).toFixed(0)}%`;
    this.health.style.width = `${(state.health01 * 100).toFixed(1)}%`;
    this.vehicleBar.parentElement!.style.visibility = state.inCar ? 'visible' : 'hidden';
    this.vehicleBar.style.width = `${(state.vehicleHealth01 * 100).toFixed(1)}%`;
    this.speedo.style.opacity = state.inCar ? '1' : '0';
    this.setText('speed', this.speedVal, String(Math.round(Math.abs(state.speedKmh))));
    this.setText('gear', this.gearVal, state.reversing ? 'R' : `${state.gear}`);
    this.setText('loc', this.location, state.layer ? `${state.layer} · ${this.locationName(state.x, state.z)}` : this.locationName(state.x, state.z));
    this.setText('prompt', this.prompt, state.prompt);
    this.prompt.style.opacity = state.prompt ? '1' : '0';
    this.setText('fps', this.fps, `${Math.round(state.fps)} fps`);
    if (performance.now() > this.bigUntil) this.big.style.opacity = '0';
    this.drawMap(state.x, state.z, state.viewHeading, state.heading);
  }

  /** Shows a sewer maze on the minimap (null = back to the streets). */
  setSewerMap(m: { x0: number; z0: number; size: number; open: boolean[][] } | null, block = 3): void {
    this.sewer = m ? { ...m, block } : null;
  }

  /** "5th Ave & 42nd St" style address from the nearest avenue and street. */
  locationName(x: number, z: number): string {
    const L = this.layout;
    if (x > L.park.x0 && x < L.park.x1 && z > L.park.z0 && z < L.park.z1) return 'Central Green';
    if ((L.docks ?? []).some((d) => x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1)) return x < 0 ? 'West Ave Docks' : 'East Ave Docks';
    if (x < L.land.x0 || x > L.land.x1 || z < L.land.z0 || z > L.land.z1) return 'River';
    let ave = L.roads.filter((r) => r.kind === 'ave')[0];
    let st = L.roads.filter((r) => r.kind === 'street')[0];
    let da = Infinity;
    let ds = Infinity;
    for (const r of L.roads) {
      if (r.kind === 'ave' && Math.abs(r.center - x) < da) {
        da = Math.abs(r.center - x);
        ave = r;
      } else if (r.kind === 'street' && Math.abs(r.center - z) < ds) {
        ds = Math.abs(r.center - z);
        st = r;
      }
    }
    return `${ave.name} & ${st.name}`;
  }

  private drawMap(x: number, z: number, viewHeading: number, heading: number): void {
    const ctx = this.mapCtx;
    const S = this.mapCanvas.width;
    const L = this.layout.land;
    const pad = 400;
    const px = (x - L.x0 + pad) / this.mapScale;
    const pz = (z - L.z0 + pad) / this.mapScale;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#284a61';
    ctx.fillRect(0, 0, S, S);
    // Heading-up: rotate so the camera's view direction points up the screen.
    ctx.translate(S / 2, S / 2);
    ctx.rotate(viewHeading - Math.PI / 2);
    // Default radius ~105 m; the Early Warning Radar zooms out to show more.
    const zoom = ((S / 2) * this.mapScale) / this.radarRange;
    ctx.scale(zoom, zoom);
    // Search area and police blips, in the same (rotated, zoomed) map space.
    const mx = (wx: number): number => (wx - L.x0 + pad) / this.mapScale - px;
    const mz = (wz: number): number => (wz - L.z0 + pad) / this.mapScale - pz;
    const sw = this.sewer;
    if (sw) {
      // Underground: dark, with the tunnels near you drawn in.
      ctx.fillStyle = '#111512';
      ctx.fillRect(-S, -S, S * 2, S * 2);
      ctx.fillStyle = '#5d6b5a';
      const bi = Math.floor((x - sw.x0) / sw.block);
      const bj = Math.floor((z - sw.z0) / sw.block);
      const R = 26;
      const w = sw.block / this.mapScale + 0.15;
      for (let i = Math.max(0, bi - R); i < Math.min(sw.size, bi + R); i++)
        for (let j = Math.max(0, bj - R); j < Math.min(sw.size, bj + R); j++)
          if (sw.open[i][j]) ctx.fillRect(mx(sw.x0 + i * sw.block), mz(sw.z0 + j * sw.block), w, w);
    } else ctx.drawImage(this.mapImage, -px, -pz);
    if (this.search) {
      const pulse = 0.25 + 0.15 * Math.sin(performance.now() / 300);
      ctx.fillStyle = `rgba(80,140,255,${pulse})`;
      ctx.strokeStyle = 'rgba(120,170,255,0.8)';
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.arc(mx(this.search.x), mz(this.search.z), this.search.r / this.mapScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const wp = this.waypoint;
    if (wp && !this.sewer) {
      if (wp.path.length > 1) {
        ctx.strokeStyle = 'rgba(255,210,63,0.85)';
        ctx.lineWidth = 3 / zoom;
        ctx.setLineDash([8 / zoom, 5 / zoom]);
        ctx.beginPath();
        wp.path.forEach((q, i) => (i ? ctx.lineTo(mx(q.x), mz(q.z)) : ctx.moveTo(mx(q.x), mz(q.z))));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // The pin, kept on the edge when it's off the map.
      const edge = (S / 2 - 12) / zoom;
      let a = mx(wp.at.x);
      let b = mz(wp.at.z);
      const d = Math.hypot(a, b);
      if (d > edge) {
        a = (a / d) * edge;
        b = (b / d) * edge;
      }
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(a, b, 6 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const race = this.race;
    if (race) {
      // The racing line ahead, then rivals and the next checkpoints (clamped to the map edge).
      if (race.line.length > 1) {
        ctx.strokeStyle = 'rgba(255,210,63,0.75)';
        ctx.lineWidth = 3.5 / zoom;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        race.line.forEach((q, i) => (i ? ctx.lineTo(mx(q.x), mz(q.z)) : ctx.moveTo(mx(q.x), mz(q.z))));
        ctx.stroke();
      }
      const edge = (S / 2 - 12) / zoom;
      const clampPt = (q: { x: number; z: number }): [number, number, boolean] => {
        const a = mx(q.x);
        const b = mz(q.z);
        const d = Math.hypot(a, b);
        return d > edge ? [(a / d) * edge, (b / d) * edge, true] : [a, b, false];
      };
      if (race.after) {
        const [a, b] = clampPt(race.after);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(a, b, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const o of race.racers) {
        ctx.fillStyle = '#ff7a1a';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.2 / zoom;
        ctx.beginPath();
        ctx.arc(mx(o.x), mz(o.z), 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (race.next) {
        const [a, b, clamped] = clampPt(race.next);
        const pulse = 1 + 0.15 * Math.sin(performance.now() / 160);
        ctx.fillStyle = race.next.finish ? '#ffffff' : '#ffd23f';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.arc(a, b, ((clamped ? 6 : 8) * pulse) / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (race.next.finish) {
          ctx.fillStyle = '#000';
          const q = 3 / zoom;
          ctx.fillRect(a - q, b - q, q, q);
          ctx.fillRect(a, b, q, q);
        }
      }
    }
    const markEdge = (S / 2 - 12) / zoom;
    for (const m of this.markers) {
      ctx.fillStyle = m.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.2 / zoom;
      const s = m.size / zoom;
      if (m.letter) {
        // Mission markers: a disc with a letter (M = a job on offer), kept on the map's edge when
        // it's further away so you can always find the story.
        let a = mx(m.x);
        let b = mz(m.z);
        const d = Math.hypot(a, b);
        const far = d > markEdge;
        if (far) {
          a = (a / d) * markEdge;
          b = (b / d) * markEdge;
        }
        const r = far ? s * 0.4 : s / 2;
        ctx.beginPath();
        ctx.arc(a, b, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.translate(a, b);
        // Keep the letter upright whatever the map's rotation.
        const t = ctx.getTransform();
        ctx.rotate(-Math.atan2(t.b, t.a));
        ctx.fillStyle = '#111';
        ctx.font = `900 ${r * 1.44}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.letter, 0, r * 0.08);
        ctx.restore();
        continue;
      }
      ctx.fillRect(mx(m.x) - s / 2, mz(m.z) - s / 2, s, s);
      ctx.strokeRect(mx(m.x) - s / 2, mz(m.z) - s / 2, s, s);
    }
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    // Vision cones first (under the dots): where each officer and cruiser is looking, out to its
    // sight range; red when it can see you.
    for (const b of this.blips) {
      if (!b.vision || b.heading === undefined) continue;
      const bx = mx(b.x);
      const bz = mz(b.z);
      const r = b.vision.range / this.mapScale;
      const a = -b.heading;
      const g = ctx.createRadialGradient(bx, bz, 0, bx, bz, r);
      const col = b.sees ? '255,60,60' : '120,170,255';
      g.addColorStop(0, `rgba(${col},${b.sees ? 0.45 : 0.3})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx, bz);
      ctx.arc(bx, bz, r, a - b.vision.half, a + b.vision.half);
      ctx.closePath();
      ctx.fill();
      // The short all-round range they'd notice you in anyway.
      ctx.strokeStyle = `rgba(${col},0.35)`;
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.arc(bx, bz, b.vision.near / this.mapScale, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const b of this.blips) {
      ctx.fillStyle = flash ? '#ff2a2a' : '#2a5cff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(mx(b.x), mz(b.z), 4.5 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Player arrow relative to the view direction.
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-(heading - viewHeading));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North marker.
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(viewHeading - Math.PI / 2);
    ctx.fillStyle = '#f3b712';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -S / 2 + 16);
    ctx.restore();
  }

  /**
   * Keeps toasts clear of the panels in the top-left corner (race, heist, street event): they
   * start below whichever of those is showing.
   */
  layoutToasts(): void {
    let top = 28;
    for (const el of document.querySelectorAll<HTMLElement>('.race-panel, .heist-panel, .event-panel')) {
      if (getComputedStyle(el).display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.left < 300) top = Math.max(top, Math.round(r.bottom + 10));
    }
    if (top !== this.toastTop) {
      this.toastTop = top;
      this.toastBox.style.top = `${top}px`;
    }
  }
  private toastTop = 28;
  private layoutTick = 0;

  toast(text: string, ms = 2500): void {
    this.layoutToasts();
    const t = div('toast');
    t.textContent = text;
    this.toastBox.appendChild(t);
    window.setTimeout(() => t.classList.add('out'), ms);
    window.setTimeout(() => t.remove(), ms + 600);
  }

  /** The autosave indicator: a spinning disc and what triggered it, bottom right, for a couple of seconds. */
  saved(note: string): void {
    if (!this.savedEl) {
      this.savedEl = div('autosave');
      this.el.appendChild(this.savedEl);
    }
    const el = this.savedEl;
    el.innerHTML = `<i></i><span>Autosaved</span><em></em>`;
    el.querySelector('em')!.textContent = note;
    el.classList.remove('out');
    el.classList.add('on');
    window.clearTimeout(this.savedTimer);
    this.savedTimer = window.setTimeout(() => el.classList.add('out'), 2600);
  }
  private savedEl: HTMLDivElement | null = null;
  private savedTimer = 0;

  /** A neighbourhood's name card, low on the screen as you cross into it (fades on its own). */
  showDistrict(name: string, tagline: string): void {
    if (!this.districtEl) {
      this.districtEl = div('district-card');
      this.el.appendChild(this.districtEl);
    }
    const el = this.districtEl;
    el.innerHTML = `<div class="dc-name">${name}</div><div class="dc-tag">${tagline}</div>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  private districtEl: HTMLDivElement | null = null;

  showBig(text: string, color: string, ms: number): void {
    this.big.textContent = text;
    this.big.style.color = color;
    this.big.style.opacity = '1';
    this.bigUntil = performance.now() + ms;
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function wrapBar(inner: HTMLDivElement): HTMLDivElement {
  const w = div('bar-wrap');
  w.appendChild(inner);
  return w;
}
