export type Vec3 = [number, number, number];

export interface ShotActor {
  kind: 'creature' | 'car';
  /** Creature: species id (and shiny). */
  species?: string;
  shiny?: boolean;
  /** Creature clip while standing (walk plays while it moves). */
  clip?: string;
  scale?: number;
  /** Car: spec id, paint, and police lights. */
  spec?: string;
  color?: string;
  siren?: boolean;
  /** Offsets [x, z] from the anchor; it moves from `from` to `to` over the shot. */
  from: [number, number];
  to?: [number, number];
  /** Seconds into the shot before it sets off, and how long before the end it arrives. */
  delay?: number;
  stopEarly?: number;
  /** Facing (degrees, 0 = +X) when it doesn't move. */
  headingDeg?: number;
}

export interface Shot {
  anchor?: string;
  seconds: number;
  /** Camera offsets from the anchor at the start and the end (or `orbit`). */
  cam?: [Vec3, Vec3];
  orbit?: { radius: number; height: number; fromDeg: number; toDeg: number };
  look: [Vec3, Vec3];
  ease?: 'linear' | 'in' | 'out' | 'inOut';
  /** Turn the offsets by the anchor's heading. */
  orient?: boolean;
  /** Fade up from black over this many seconds. */
  fade?: number;
  caption?: string;
  sub?: string;
  /** When the caption starts fading in (s). */
  captionAt?: number;
  actors?: ShotActor[];
  /** Camera shake at the start of the shot (0-1), and a sound effect. */
  shake?: number;
  sound?: string;
}

export interface CinematicDef {
  id: string;
  title?: string;
  /** Default anchor for its shots. */
  anchor?: string;
  /** What plays it (one key). Without one it only plays when asked for by id. */
  trigger?: CinematicTrigger;
  /** Plays once per save (default true; the generic boss and raid ones set false). */
  once?: boolean;
  /** Space / Enter / Esc skips it (default true). */
  skippable?: boolean;
  /** Its own background music: 'intro' (the opening theme) or 'action' (high-octane). Without: the game's music carries on. */
  music?: 'intro' | 'action';
  shots: Shot[];
}

export interface CinematicConfig {
  version: number;
  _comment?: string;
  settings: { letterbox: number; captionFade: number; fadeSeconds: number };
  anchors: Record<string, [number, number]>;
  cinematics: CinematicDef[];
}

export interface Anchor {
  x: number;
  z: number;
  y?: number;
  heading?: number;
}

export type CinematicEvent = { type: 'shot'; index: number } | { type: 'shotEnd'; index: number } | { type: 'end'; skipped: boolean };

export type CinematicTrigger =
  | { newGame: true }
  | { actStarted: string }
  | { questStarted: string }
  | { questCompleted: string }
  | { bossIntro: true | string }
  | { raidArrive: true | string };

export const TRIGGERS: readonly ['newGame', 'actStarted', 'questStarted', 'questCompleted', 'bossIntro', 'raidArrive'];
export function cinematicFor(c: CinematicConfig, ev: Record<string, string | true>, seen: Set<string>): CinematicDef | null;
export const MUSIC_CUES: readonly ['intro', 'action'];
export const EASES: readonly ['linear', 'in', 'out', 'inOut'];
export function ease(kind: string, u: number): number;
export function validateCinematics(
  c: CinematicConfig,
  known?: { anchors?: string[]; species?: (id: string) => boolean; specs?: (id: string) => boolean; quests?: (id: string) => boolean; acts?: (id: string) => boolean },
): true;

export class CinematicPlayer {
  constructor(def: CinematicDef, settings: CinematicConfig['settings']);
  readonly def: CinematicDef;
  index: number;
  t: number;
  started: boolean;
  done: boolean;
  skipped: boolean;
  readonly shot: Shot;
  readonly anchor: string;
  readonly skippable: boolean;
  readonly duration: number;
  readonly progress: number;
  readonly u: number;
  update(dt: number): CinematicEvent[];
  skip(): CinematicEvent[];
  pose(a: Anchor): { cam: Vec3; look: Vec3 };
  caption(): { text: string; sub: string; alpha: number };
  black(): number;
  actorPose(actor: ShotActor, a: Anchor): { x: number; z: number; heading: number; moving: boolean };
}
