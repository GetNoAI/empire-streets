/**
 * Background music: one track at a time, chosen from what's going on (`pickTrack`), switched by a
 * `MusicDirector` (engine-free, unit-tested) that makes the changes smooth:
 *
 *  - Equal-power crossfades: the outgoing track's volume follows cos, the incoming one sin, so the
 *    overall loudness doesn't dip in the middle of a change.
 *  - Fade times that suit the change: into something more intense quickly (a battle starts now),
 *    back down to something calmer slowly (the fight's over, let it breathe), out of a cinematic
 *    slowest of all.
 *  - Hysteresis: going up switches at once; going down only once the calmer situation has held
 *    for a moment, so a wanted level flickering 2-1-2 or a battle ending into another doesn't
 *    ping-pong between tracks.
 *  - No gaps: a track that hasn't loaded yet doesn't start its fade until it can play (the old
 *    one keeps going meanwhile), within a time limit.
 *  - Event tracks start from the top, unless you were only away from them briefly (then they pick
 *    up where they faded out); the free-roam and sewer tracks always resume.
 *  - Pause ducking and the sewer muffling glide rather than jump.
 *
 * The Music class plays it all on HTMLAudioElements.
 */

/** Free-roam music per part of the city (the zone music brief; scripts/make-zone-tracks.py). */
export const ZONES = ['harlow-heights', 'sutton-row', 'hells-galley', 'glass-district', 'canal-yards', 'old-battery', 'central-green', 'waterfront', 'rooftops', 'sewer-deep', 'gutter-kings-hideout', 'shops', 'arcade'] as const;
export type ZoneId = (typeof ZONES)[number];
export type ZoneTrack = `zone:${ZoneId}`;

export type TrackId = 'overworld' | 'sewer' | 'casino' | 'wildBattle' | 'chase' | 'policeBattle' | 'npcBattle' | 'race' | 'heist' | 'boss' | 'legendary' | 'intro' | 'cinematic' | ZoneTrack;

/** Neighbourhood ids (world/Districts.ts) to their zone tracks. */
export const HOOD_ZONE: Record<string, ZoneId> = {
  harlow: 'harlow-heights',
  sutton: 'sutton-row',
  galley: 'hells-galley',
  glass: 'glass-district',
  canal: 'canal-yards',
  battery: 'old-battery',
  green: 'central-green',
  waterfront: 'waterfront',
};

const FILES: Record<TrackId, string> = {
  ...(Object.fromEntries(ZONES.map((z) => [`zone:${z}`, `zone-${z}.mp3`])) as Record<ZoneTrack, string>),
  overworld: 'transit-after-midnight.mp3',
  sewer: 'dragging-through-concrete.mp3',
  // Inside the Empire Royale (generated for the game: scripts/make-casino-track.py).
  casino: 'high-roller-lounge.mp3',
  wildBattle: 'kinetic-overdrive.mp3',
  chase: 'blue-and-red.mp3',
  policeBattle: 'asphalt-on-fire.mp3',
  npcBattle: 'concrete-crown.mp3',
  race: 'one-sixty-on-the-dash.mp3',
  heist: 'zero-hour-extraction.mp3',
  boss: 'bow-to-the-crown.mp3',
  // Taking on a legendary (the raid battle).
  legendary: 'leash-the-beast.mp3',
  // The opening cinematic, and the high-octane ones (acts, bosses, legendaries).
  intro: 'glass-and-steel.mp3',
  cinematic: 'apex-of-the-chain.mp3',
};

/** Tracks that always pick up where they left off (the rest restart unless you were only away briefly). */
const RESUMES: ReadonlySet<TrackId> = new Set<TrackId>(['overworld', 'sewer', 'casino', ...ZONES.map((z) => `zone:${z}` as ZoneTrack)]);

/** How intense each track is: switching up is immediate, switching down waits a moment. */
export const INTENSITY: Record<TrackId, number> = {
  ...(Object.fromEntries(ZONES.map((z) => [`zone:${z}`, z === 'gutter-kings-hideout' ? 0.5 : 0])) as Record<ZoneTrack, number>),
  overworld: 0,
  sewer: 0,
  casino: 0.5,
  chase: 2,
  race: 3,
  heist: 3,
  npcBattle: 4,
  wildBattle: 4,
  policeBattle: 5,
  boss: 6,
  legendary: 6.5,
  intro: 7,
  cinematic: 7,
};

export const MUSIC = {
  volume: 0.42,
  /** Crossfade times (s): to a more intense track, to a calmer one, into and out of a cinematic. */
  fadeUp: 0.9,
  fadeDown: 2.6,
  fadeIntoCinematic: 1.4,
  fadeOutOfCinematic: 3.2,
  /** A calmer track must be wanted this long before the switch (s). */
  settleDown: 1.8,
  /** Longest wait for a track to load before fading anyway (s). */
  loadWait: 2.5,
  /** An event track faded out less than this long ago resumes instead of restarting (s). */
  resumeWithin: 20,
  /** Volume multiplier while the pause menu is open, and how fast ducking glides (s). */
  pausedDuck: 0.4,
  duckGlide: 0.35,
};

export interface MusicSituation {
  battle: 'wild' | 'person' | 'trainer' | 'npc' | 'police' | 'boss' | 'raid' | null;
  /** A legendary is rampaging nearby (raids). */
  raid?: boolean;
  stars: number;
  chasing: boolean;
  /** A heist is on (planning excluded: from the breach to the getaway). */
  heist?: boolean;
  /** A street race is on (countdown or racing). */
  race?: boolean;
  /** Underground. */
  sewer?: boolean;
  /** Inside a building: the casino and the arcade have their own music, other rooms the shop radio. */
  indoors?: 'casino' | 'arcade' | 'room' | null;
  /** Where you are, for the free-roam music: a neighbourhood id (Districts.ts), 'roof', or null. */
  zone?: string | null;
  /** Down in the deep drains (sewer levels 2-3). */
  deep?: boolean;
  /** In the Gutter Kings' hideout. */
  hideout?: boolean;
  /** A cinematic with its own music is playing: the opening, or a high-octane one. */
  cinematic?: 'intro' | 'action' | null;
}

/**
 * Which track fits the situation (pure, unit-tested). A cinematic with music wins; then battles;
 * then a heist (its getaway has its own chase), a race (its stars are temporary), a police chase
 * (from 2 stars until the heat is gone), the sewers, and the overworld.
 */
export function pickTrack(s: MusicSituation): TrackId {
  if (s.cinematic === 'intro') return 'intro';
  if (s.cinematic === 'action') return 'cinematic';
  if (s.battle === 'raid') return 'legendary';
  if (s.battle === 'boss') return 'boss';
  if (s.battle === 'police') return 'policeBattle';
  if (s.battle === 'npc' || s.battle === 'trainer') return 'npcBattle';
  if (s.battle) return 'wildBattle';
  if (s.raid) return 'boss';
  if (s.heist) return 'heist';
  if (s.race) return 'race';
  if (s.stars >= 2 || (s.chasing && s.stars > 0)) return 'chase';
  if (s.indoors === 'casino') return 'casino';
  if (s.indoors === 'arcade') return 'zone:arcade';
  if (s.indoors === 'room') return 'zone:shops';
  if (s.hideout) return 'zone:gutter-kings-hideout';
  if (s.sewer) return s.deep ? 'zone:sewer-deep' : 'sewer';
  if (s.zone === 'roof') return 'zone:rooftops';
  const z = s.zone ? HOOD_ZONE[s.zone] : undefined;
  return z ? `zone:${z}` : 'overworld';
}

const isCine = (id: TrackId | null): boolean => id === 'intro' || id === 'cinematic';

/** The crossfade time for a change from `from` to `to`. */
export function fadeFor(from: TrackId | null, to: TrackId): number {
  if (from === null) return MUSIC.fadeUp;
  if (isCine(from) && !isCine(to)) return MUSIC.fadeOutOfCinematic;
  if (isCine(to)) return MUSIC.fadeIntoCinematic;
  return INTENSITY[to] >= INTENSITY[from] ? MUSIC.fadeUp : MUSIC.fadeDown;
}

/**
 * The switching logic, with no audio in it: what's wanted, what's playing, every track's fade
 * level (0..1, moved linearly) and the volume that gives (equal-power: sin of the level).
 */
export class MusicDirector {
  /** The track faded (or fading) in. */
  current: TrackId | null = null;
  /** A track waiting to load before its fade starts. */
  pending: TrackId | null = null;
  readonly level = new Map<TrackId, number>();
  /** Seconds since each track was last audible (for resume-or-restart). */
  readonly silentFor = new Map<TrackId, number>();
  private fade = MUSIC.fadeUp;
  private wanted: TrackId | null = null;
  private wantedFor = 0;
  private waited = 0;

  /**
   * What the situation asks for, every frame. Returns the track that should start playing now
   * (and whether from the top), if any.
   */
  request(id: TrackId, dt: number, ready: (id: TrackId) => boolean): { start: TrackId; restart: boolean } | null {
    if (id !== this.wanted) {
      this.wanted = id;
      this.wantedFor = 0;
    } else this.wantedFor += dt;
    const cur = this.pending ?? this.current;
    if (id === cur) {
      this.waited += dt;
      return this.pending ? this.tryStart(ready) : null;
    }
    // Calmer: wait until it has been asked for steadily (a cinematic ending switches at once).
    const down = cur !== null && !isCine(cur) && INTENSITY[id] < INTENSITY[cur];
    if (down && this.wantedFor < MUSIC.settleDown) return null;
    this.pending = id;
    this.waited = 0;
    this.fade = fadeFor(this.current, id);
    return this.tryStart(ready);
  }

  private tryStart(ready: (id: TrackId) => boolean): { start: TrackId; restart: boolean } | null {
    const id = this.pending!;
    if (!ready(id) && this.waited < MUSIC.loadWait) return null;
    this.pending = null;
    this.current = id;
    const audible = (this.level.get(id) ?? 0) > 0.001;
    const away = this.silentFor.get(id) ?? Infinity;
    const restart = !RESUMES.has(id) && !audible && away > MUSIC.resumeWithin;
    return { start: id, restart };
  }

  /** Moves the fades on; returns each track's volume factor (0..1, before the master volume). */
  update(dt: number, ids: readonly TrackId[]): Map<TrackId, number> {
    const out = new Map<TrackId, number>();
    const step = dt / Math.max(0.05, this.fade);
    for (const id of ids) {
      let l = this.level.get(id) ?? 0;
      l = id === this.current ? Math.min(1, l + step) : Math.max(0, l - step);
      this.level.set(id, l);
      const v = Math.sin((l * Math.PI) / 2);
      this.silentFor.set(id, v > 0.001 ? 0 : (this.silentFor.get(id) ?? Infinity) + dt);
      out.set(id, v);
    }
    return out;
  }
}

export class Music {
  private readonly tracks = new Map<TrackId, HTMLAudioElement>();
  private readonly ids: TrackId[];
  readonly director = new MusicDirector();
  private unlocked = false;
  private enabled = true;
  private duck = 1;
  private duckTarget = 1;
  /** Volume multiplier for where you are (muffled underground). */
  private place = 1;
  private placeTarget = 1;
  private lastRequest: TrackId | null = null;

  constructor(base = import.meta.env.BASE_URL) {
    for (const [id, file] of Object.entries(FILES) as [TrackId, string][]) {
      const a = new Audio();
      a.loop = true;
      // The everyday tracks load up front; the rest when first needed (see preload).
      a.preload = id === 'overworld' || id === 'sewer' ? 'auto' : 'none';
      a.dataset['src'] = `${base}music/${file}`;
      if (a.preload === 'auto') a.src = a.dataset['src'];
      a.volume = 0;
      this.tracks.set(id, a);
    }
    this.ids = [...this.tracks.keys()];
  }

  /** Call from a user gesture (browsers block autoplay until then). */
  unlock(): void {
    this.unlocked = true;
    for (const [id, a] of this.tracks) if ((this.director.level.get(id) ?? 0) > 0 || id === this.director.current) this.ensurePlaying(a);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Music volume from the options (0..1 of the default level). */
  userVolume = 1;

  /** Muffles the music in the sewers (1 = normal); glides there. */
  setPlaceVolume(v: number): void {
    this.placeTarget = Math.max(0, Math.min(1, v));
  }

  setPaused(paused: boolean): void {
    this.duckTarget = paused ? MUSIC.pausedDuck : 1;
  }

  /** Starts loading a track ahead of time (a cinematic about to play). */
  preload(id: TrackId): void {
    const a = this.tracks.get(id)!;
    if (!a.src) {
      a.src = a.dataset['src'] ?? '';
      a.preload = 'auto';
      a.load();
    }
  }

  /** What the situation wants this frame (the director decides when to actually switch). */
  play(id: TrackId): void {
    this.lastRequest = id;
  }

  private ensurePlaying(a: HTMLAudioElement): void {
    if (!this.unlocked) return;
    if (a.paused) void a.play().catch(() => undefined);
  }

  update(dt: number): void {
    if (this.lastRequest) {
      // Asking for a track loads it, so it's ready by the time its fade can start.
      this.preload(this.lastRequest);
      const s = this.director.request(this.lastRequest, dt, (id) => (this.tracks.get(id)?.readyState ?? 0) >= 3);
      if (s) {
        const a = this.tracks.get(s.start)!;
        if (s.restart && a.readyState > 0) a.currentTime = 0;
        this.ensurePlaying(a);
      }
    }
    const k = 1 - Math.exp(-dt / MUSIC.duckGlide);
    this.duck += (this.duckTarget - this.duck) * k;
    this.place += (this.placeTarget - this.place) * k;
    const master = this.enabled ? MUSIC.volume * this.userVolume * this.duck * this.place : 0;
    const vols = this.director.update(dt, this.ids);
    for (const [id, a] of this.tracks) {
      const v = vols.get(id) ?? 0;
      a.volume = Math.max(0, Math.min(1, v * master));
      if (v <= 0 && !a.paused) a.pause();
      else if (v > 0 && a.paused) this.ensurePlaying(a);
    }
  }
}
