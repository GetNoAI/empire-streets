import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { ModelLibrary } from '../assets/ModelLibrary';
import { audio } from '../audio/Audio';
import { SpatialAudio, type EngineSource, type SirenSource } from '../audio/Spatial';
import { CameraRig } from '../camera/CameraRig';
import { cycleOption, loadOptions, optionLabel, saveOptions, type Options } from './Options';
import { BATTLE, CAMERA, GRAPHICS, GROUP, PHYSICS, PLAYER, WORLD, groups } from '../config';
import { Effects } from '../fx/Effects';
import { copLook } from '../peds/CrowdRenderer';
import { PedestrianSystem, type Ped } from '../peds/PedestrianSystem';
import { PoliceSystem } from '../police/PoliceSystem';
import { STAR_HEAT, Wanted, type Crime } from '../police/Wanted';
import { CreatureModels } from '../creatures/CreatureModels';
import { SpawnSystem, type WildCreature } from '../creatures/SpawnSystem';
import { BattleController, type BattleResult } from '../creatures/BattleController';
import { Clinics, CLINIC_NAME, clinicSpots } from '../creatures/Clinics';
import { Party } from '../creatures/Party';
import { createCreature, magazine, displayName, maxHp as maxHpOf, xpForLevel } from '../creatures/Creature';
import { DATA, TYPE_IDS, layerOfBiome, species, typeInfo } from '../creatures/Data';
import { BattleUi } from '../ui/BattleUi';
import { Bag } from '../creatures/Bag';
import { CatchVisuals } from '../creatures/CatchVisuals';
import { rollCatch, catchChance, type CatchRoll } from '../creatures/Catching';
import { pityMessage, recordThrow, softBonus } from '../creatures/Pity';
import { item as itemSpec, type CaptureItem } from '../creatures/Data';
import { CreatureIcons } from '../ui/CreatureIcons';
import { TeamScreen } from '../ui/TeamScreen';
import { DEFAULT_SEWER_SEED, SAVE_VERSION, creatureToJson, describeSave, loadSave, type SaveData } from './SaveSystem';
import { saves, unpackSave } from './SaveManager';
import { PadInput, padPrompt, type PadContext } from './Gamepad';
import { QuickWheel, type WheelEntry } from '../ui/QuickWheel';
import { POND, bankPoint, carLift, depthAt as depthAtLake, inLake, nearestEdge, nearestWater, newCarWater, stepCarWater, submersion, waterPoint, waveY, type CarWater } from '../world/Pond';
import type { PondView } from '../world/PondView';
import type { DocksView } from '../world/Docks';
import { INTERIOR, buildInterior, buildInteriorDoors, planInteriors, type InteriorRoom, type InteriorSpot } from '../world/Interiors';
import { interiorTalk, streetTalk, type TalkAction, type TalkContext, type TalkTree } from '../npc/Talk';
import { randomLook, weatheredLook } from '../peds/CrowdRenderer';
import { SAFEHOUSE, buildSafehouses, newSafehouseState, planSafehouses, sanitizeSafehouses, sleepHours, type SafehouseSpot, type SafehouseState, type SafehouseView } from '../world/Safehouses';
import { dexEntries } from '../creatures/Dex';
import { PartyBar } from '../ui/PartyBar';
import { DexScreen } from '../ui/DexScreen';
import { ClinicMenu } from '../ui/ClinicMenu';
import { EvolutionScene } from '../creatures/EvolutionScene';
import { BENCH_SHARE, gainXp, xpYield, type ProgressEvent } from '../creatures/Progression';
import { applyHeal, effectsLine, newEffects, spawnModifiers, tickEffects } from '../items/Items';
import { waterLift, waterRide } from '../creatures/WaterBattle';
import { CasinoMenu, type CasinoGame } from '../ui/CasinoMenu';
import { Bubbles } from '../ui/Bubbles';
import { ROLL } from '../player/Roll';
import { Weather, weatherEffects } from '../world/Weather';
import { Precipitation } from '../fx/Precipitation';
import { FLORA_WIND } from '../world/ParkFlora';
import { NeighbourhoodTracker, localLook, neighbourhoodAt, type Neighbourhood } from '../world/Districts';
import { chatterGap, roomChatter, sewerChatter, streetChatter } from '../npc/Chatter';
import { EnvHazards, type HazardSpot } from '../systems/Hazards';
import { CAR_WEATHER } from '../vehicles/Car';
import { VISION } from '../police/Vision';
import { GangWorld, type GangMember } from '../systems/GangWorld';
import { parseGangState } from '../gangs/Gangs';
import { applyRep, civicTier, clampCivic, repLine, type RepEvent } from '../systems/Reputation';
import { buildStreetCaches, planStreetCaches, type StreetCache, type StreetCacheView } from '../world/StreetCaches';
import { catchSituation } from '../creatures/Catching';
import { districtAt } from '../creatures/SpawnRules';
import type { Battle } from '../creatures/BattleEngine';
import { TrainerSystem, type Trainer } from '../creatures/Trainers';
import { Follower } from '../creatures/Follower';
import { Music, pickTrack } from '../audio/Music';
import { DamageNumbers } from '../fx/DamageNumbers';
import { LAYERS, WorldLayers, layerLabel } from '../world/WorldLayers';
import { ROOFS, planGarages, planRooftops, type Access, type JumpPad, type KeepClear, type RooftopPlan, type Stash } from '../world/Rooftops';
import { buildRooftops, type RooftopView } from '../world/RooftopView';
import { Humanoid } from '../player/Humanoid';
import { SEWER, blockAt, blockCentre, key as blockKey, planDeepSewers, planSewers, poolAt, poolEdge, propAt, ventActive, type Cache, type Maze, type Manhole } from '../world/Sewers';
import { buildSewers, type SewerView, type ShaftMark } from '../world/SewerView';
import { COMMUNITY, advanceQuest, canStart, currentStep, marketStock, openingNode, quest as questSpec, startQuest, type NpcSpec } from '../npc/Quests';
import { DialogueBox } from '../ui/DialogueBox';
import { TankSystem, type Tank, type TankTarget } from '../police/Tank';
import { CHOP_SHOP, buildChopShop, planChopShop, type ChopShopSpot } from '../world/ChopShop';
import { DEALERSHIP, buildDealership, planDealership, type DealershipSpot } from '../world/Dealership';
import { GarageMenu } from '../ui/GarageMenu';
import { platform } from '../mobile/Platform';
import { ASSIST, assistTurn, pickAssist, type AssistTarget } from '../mobile/AimAssist';
import { TouchControls } from '../mobile/Touch';
import { VEHICLES } from '../vehicles/specs';
import { MAX_LEVEL, NO_UPGRADES, classOf, performanceIndex, sanitizeUpgrades, upgradeEffect, upgradePrice, type CarClass, type UpgradeLevels, type UpgradePart } from '../vehicles/Performance';
import { MODE_NAMES, modeOf } from '../systems/streetRaceManager.js';
import { ChopShopMenu } from '../ui/ChopShopMenu';
import { VehicleTuningManager, type SlotName, type StreetmonInfo } from '../systems/vehicleTuning.js';
import { TuningWorld } from '../systems/TuningWorld';
import { StreetRaceManager, type GridSlot, type RaceHud } from '../systems/streetRaceManager.js';
import { RaceWorld } from '../systems/RaceWorld';
import { FleeDebug } from '../creatures/FleeDebug';
import { HeistManager, roleFit, type CrewCandidate, type HeistHud, type HeistRole } from '../systems/heistManager.js';
import { HeistWorld } from '../systems/HeistWorld';
import { StreetEventManager, type EventHud, type StreetEventConfig } from '../systems/streetEventManager.js';
import { EventWorld } from '../systems/EventWorld';
import streetEventsConfig from '../config/street_events.json';
import { alleyAvoidPoints, planAlleys } from '../world/Alleys';
import { HeistMenu } from '../ui/HeistMenu';
import heistsConfig from '../config/heists.json';
import { MapOverlay, type MapConfig, type MapMarker } from '../ui/MapOverlay';
import mapIconsConfig from '../config/map_icons.json';
import racesConfig from '../config/races.json';
import livingWorldConfig from '../config/living_world.json';
import campaignConfig from '../config/campaign_quests.json';
import leagueConfig from '../config/racing_league.json';
import { raceTier, rivalLoadouts, tierInfo, type RivalLoadout, type RivalSlot } from '../systems/rivalLoadout';
import { QuestManager, validateCampaign, validateLeague, type Blueprint, type CampaignConfig, type Dialogue, type LeagueConfig, type QuestContext } from '../systems/questManager.js';
import { CampaignWorld } from '../systems/CampaignWorld';
import cinematicsConfig from '../config/cinematics.json';
import { cinematicFor, validateCinematics, type Anchor, type CinematicConfig, type CinematicDef } from '../systems/cinematics.js';
import { CinematicView } from '../cinematics/CinematicView';
import { WardrobeMenu } from '../ui/WardrobeMenu';
import { WaypointGuide, trimRoute } from '../fx/WaypointGuide';
import { StoryCard } from '../ui/StoryCard';
import { DEFAULT_LOOK, sanitizeLook, toHumanoidLook, type PlayerLook } from '../player/playerLook';
import { LivingWorld, type LivingWorldConfig } from '../systems/LivingWorld';
import { TutorialManager, validateTutorials, type TutorialConfig } from '../systems/tutorialManager.js';
import tutorialsConfig from '../config/tutorials.json';
import { TutorialCard } from '../ui/TutorialCard';
import { Decals } from '../fx/Decals';
import { MoveFx } from '../fx/MoveFx';
import { DESTRUCTIBLES, DestructionWorld } from '../systems/DestructionWorld';
import { RaidWorld } from '../systems/RaidWorld';
import { ColliderStreamer, type StreamCollider } from '../world/ColliderStreamer';
import { ResolutionScaler } from '../render/ResolutionScaler';
import { calcStats } from '../creatures/Creature';
import { TANK_SPEC } from '../vehicles/specs';
import type { CreatureInstance } from '../creatures/CreatureModels';
import type { Biome } from '../creatures/Data';
import { IMPACT, carCircleContact, defaultWeightKg, resolveImpact, weightClassOf } from '../vehicles/CreatureImpacts';
import { CreatureTooltip, type Inspectable } from '../ui/CreatureTooltip';
import { pickSpecies, spawnTable } from '../creatures/SpawnRules';
import type { CreatureTarget } from '../weapons/WeaponSystem';
import type { Creature } from '../creatures/Creature';
import { DAY, clockText, phaseAt } from '../world/DayCycle';
import { WeaponHud } from '../ui/WeaponHud';
import { SHOP_NAME, ShopMenu, Shops, shopSpots } from '../weapons/Shops';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { isRanged, weapon } from '../weapons/WeaponTypes';
import { RoadGraph } from '../traffic/RoadGraph';
import { SignalView } from '../traffic/SignalView';
import { Signals } from '../traffic/Signals';
import { TrafficSystem } from '../traffic/TrafficSystem';
import { Player } from '../player/Player';
import { Hud } from '../ui/Hud';
import { Menus } from '../ui/Menus';
import { clamp, wrapAngle } from '../util/math';
import { Car } from '../vehicles/Car';
import { chassisRestHeight } from '../vehicles/CarModel';
import { getSpec, type VehicleSpec } from '../vehicles/specs';
import { VehicleManager } from '../vehicles/VehicleManager';
import { ABILITY_STYLE, StreetmonRiders, type RiderSpec } from '../vehicles/StreetmonRiders';
import { buildCity, type StaticProp } from '../world/CityBuilder';
import { CITY, generateLayout, rectContains, type CityLayout } from '../world/CityLayout';
import { Environment } from '../world/Environment';
import { Input } from './Input';
import { SelectiveBloom } from '../render/SelectiveBloom';
import { withSurface } from '../render/Surfaces';

type State = 'loading' | 'title' | 'playing' | 'paused' | 'shop' | 'starter' | 'menu' | 'cinematic';

const EXIT_RAY_GROUPS = groups(0xffff, GROUP.WORLD | GROUP.CAR);
/** The Act 1 opener: Mama Rust hands over cuffs and the starter pick. */
const STARTER_QUEST = 'a1-welcome';
/** Weapon damage to a legendary Streetmon (on top of the usual 40%): they're built like tanks. */
const LEGEND_WEAPON_DAMAGE = 0.2;
/** How far up the avenue (north of Mama's street) a new game starts (m). */
const NEW_GAME_WALK = 46;
/** The quest that hands you your first car (the Rustbucket, at the Chop Shop kerb). */
const FIRST_CAR_QUEST = 'a1-grease-monkey';

/** Owns the renderer, the physics world and every system, and runs the fixed-step loop. */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: Input;
  /** Gamepads, mapped onto the same Input per context (src/core/Gamepad.ts). */
  private padIn!: PadInput;
  /** Hold T / LB: switch your lead Streetmon or throw a capture item (src/ui/QuickWheel.ts). */
  private quickWheel!: QuickWheel;
  private readonly menus: Menus;
  private state: State = 'loading';
  private world!: RAPIER.World;
  private layout!: CityLayout;
  private env!: Environment;
  private effects!: Effects;
  private vehicles!: VehicleManager;
  private player!: Player;
  private rig!: CameraRig;
  private hud!: Hud;
  private graph!: RoadGraph;
  private signals!: Signals;
  private signalView!: SignalView;
  private traffic!: TrafficSystem;
  private peds!: PedestrianSystem;
  private wanted = new Wanted();
  private police!: PoliceSystem;
  /** Underground Chop Shop: Streetmon vehicle tuning. */
  private chopSpot!: ChopShopSpot;
  /** Entrances and furniture other things keep clear of (fire escapes, elevators, doors, lift, alleys). */
  private keepClear: KeepClear[] = [];
  private chopView!: ReturnType<typeof buildChopShop>;
  private dealerSpot!: DealershipSpot;
  private dealerView!: ReturnType<typeof buildDealership>;
  private garageMenu!: GarageMenu;
  /** On-screen controls (phones and tablets). */
  private touchUi: TouchControls | null = null;
  /** The showroom's display cars (parked in its bays; replaced when one goes missing). */
  private readonly displayCars = new Set<Car>();
  private displayCheck = 0;
  private chopMenu!: ChopShopMenu;
  private tuning!: VehicleTuningManager;
  private tuneWorld!: TuningWorld;
  /** Slotted Streetmon you can see riding in their cars (yours and rival racers'). */
  private riders!: StreetmonRiders;
  private ridersCheck = 0;
  /** Tuned rides by id, and the Streetmon slotted into them (out of the party while they ride). */
  private readonly rides = new Map<string, Car>();
  private readonly garageMon = new Map<string, Creature>();
  private chopLift = 0;
  private chopCar: Car | null = null;
  /** Pop-up street races (rules) and their props, racers and organisers (world). */
  private races!: StreetRaceManager;
  private raceWorld!: RaceWorld;
  /** Countdown: the player's car is held on the line. */
  private raceHold = false;
  /** Busted or wasted mid-race: where to come back (the grid, back in a car). */
  private raceRespawn: { slot: GridSlot; spec: string; color: string } | null = null;
  /** The car you started the race in (to give you one like it after a respawn). */
  private raceCar: { spec: string; color: string } | null = null;
  /** The racing line, one polyline per checkpoint (for the minimap). */
  private raceLegs: Array<Array<{ x: number; z: number }>> = [];
  private readonly raceFrustum = new THREE.Frustum();
  /** Creature steering debug lines (F8, or ?fleeDebug in the URL). */
  private fleeDebug!: FleeDebug;
  /** Heists: the rules (heistManager.js), the 3D side and the planning board. */
  private heists!: HeistManager;
  private heistWorld!: HeistWorld;
  /** Street events: armored trucks, turf outbreaks, supply drops (see setupStreetEvents). */
  streetEvents!: StreetEventManager;
  eventWorld!: EventWorld;
  /** Upgrade-chip level applied to each car's mods (so it's applied once per car). */
  /** Upgrade chips and campaign blueprints applied to each car (multipliers on its mods). */
  /** The campaign: quests, story flags, the racing league (see setupCampaign). */
  quests!: QuestManager;
  campaignWorld!: CampaignWorld;
  /** Cinematics: the view, the ones this save has seen, and the ones waiting for a quiet moment. */
  private cine!: CinematicView;
  private cineSeen = new Set<string>();
  private cineQueue: Array<{ def: CinematicDef; vars: Record<string, string>; key: string; until: number; then?: () => void }> = [];
  private cineThen: (() => void) | null = null;
  /** The boss a boss-intro cinematic is about. */
  private cineBoss: string | null = null;
  private cineAlpha = 1;
  /** In-world guidance to the waypoint, and its name on the compass. */
  private guide!: WaypointGuide;
  private waypointName = '';
  private waypointNamed = false;
  /** A waypoint you placed (story guidance leaves it alone), or one the story placed. */
  private waypointManual = false;
  private waypointAuto = false;
  /** The junctions the current route starts and ends at (to keep it steady between refreshes). */
  private routeEnds: { a: number; b: number; to: { x: number; z: number } } | null = null;
  private story!: StoryCard;
  /** Mama's Rustbucket (Act I). */
  private firstCar: Car | null = null;
  private firstCarCheck = 0;
  /** The player's look (the wardrobe), and the wardrobe camera's angle round you. */
  private playerLook: PlayerLook = { ...DEFAULT_LOOK };
  private wardrobe!: WardrobeMenu;
  private wardrobeYaw = 0;
  /** Streetmon move effects and sounds (battles, the street's own fights, raids). */
  moveFx!: MoveFx;
  /** Destructible street props (lamps, hydrants, trees, cans, boxes, benches, mailboxes). */
  destruction?: DestructionWorld;
  decals!: Decals;
  /** Legendary raids (rare events and the sewer quest). */
  raidWorld!: RaidWorld;
  /** The battle mode was picked in the pause menu (saved, so the real-time default doesn't override it). */
  private battleModeChosen = false;
  /** Real-time battles: number keys command your Streetmon (true) or pick weapons (false). T toggles. */
  private numKeysCommand = true;
  /** Small static colliders near you only (the physics step costs per enabled collider). */
  private readonly colliderStream = new ColliderStreamer();
  /** Dynamic resolution: steps the pixel ratio down while the GPU can't keep up. */
  private resScale: ResolutionScaler | null = null;
  private frameCpu = 0;
  private cityProps: StaticProp[] = [];
  /** Camera shake: amount (0-1, decays) and the offset applied last frame. */
  private shakeAmt = 0;
  private readonly shakeOff = new THREE.Vector3();
  /** Tutorials: a tip card the first time each mechanic comes up (see setupTutorials). */
  tut!: TutorialManager;
  private tutCard!: TutorialCard;
  private tutScan = 0;
  private tutWasBattle = false;
  private tutWasCar: Car | null = null;
  private tutWaypoint: unknown = null;
  /** The boss being fought in the current battle. */
  private campaignBattle: string | null = null;
  /** The last event result, shown in the panel for a few seconds. */
  private eventResult: { html: string; cls: string; until: number } | null = null;
  private heistMenu!: HeistMenu;
  /** Smoke from a heist crew: bystanders inside can't report crimes until it clears. */
  private smokeZone: { x: number; z: number; r: number; until: number } | null = null;
  private alarmBellT = 0;
  /** The full-screen city map (M). */
  private cityMap!: MapOverlay;
  private readonly raceMat = new THREE.Matrix4();
  /** 5-star police tanks. */
  private tanks!: TankSystem;
  private readonly tankFrustum = new THREE.Frustum();
  private readonly tankPv = new THREE.Matrix4();
  private readonly tmp2 = new THREE.Vector3();
  private tankBumpAt = 0;
  private speedingCd = 0;
  private weapons!: WeaponSystem;
  private shops!: Shops;
  private shopMenu!: ShopMenu;
  private weaponHud!: WeaponHud;
  money = 500;
  /** Streetmon models (loaded on demand). */
  readonly creatureModels = new CreatureModels();
  /** HDR render with selective bloom on glowing creature parts (null if it couldn't be set up). */
  bloom: SelectiveBloom | null = null;
  /** Wild Streetmon. */
  spawns!: SpawnSystem;
  /** In-game clock (hours, 0-24). */
  hour = DAY.startHour;
  /** In-game seconds since start (for cooldowns). */
  gameTime = 0;
  /** Pepper Musk, Pheromone Bait, the Rabbit's Foot: seconds left on each. */
  private itemFx = newEffects();
  private rollQueued = false;
  private rollNoteAt = -99;
  private staminaEl: HTMLDivElement | null = null;
  private casinoMenu!: CasinoMenu;
  bubbles!: Bubbles;
  readonly weather = new Weather();
  private precip: Precipitation | null = null;
  private readonly hood = new NeighbourhoodTracker();
  private hoodNow: Neighbourhood | null = null;
  private chatterIn = 2;
  hazards!: EnvHazards;
  /** The police's sight ranges before the weather shortens them. */
  private readonly visionBase = { car: VISION.car.range, foot: VISION.foot.range, patrol: VISION.patrol.range };
  private crowdBase = { peds: 0, cars: 0 };
  gangs!: GangWorld;
  /** Civic standing (-100..100): the second half of your reputation (Street Cred is the other). */
  civic = 0;
  private streetCaches: StreetCache[] = [];
  private streetCacheView: StreetCacheView | null = null;
  /** Deep-level warnings: the level you were warned about and when (press again to go anyway). */
  private deepWarned: { level: number; at: number } | null = null;
  /** The current battle is on water (the pond, a sewer pool, off the docks): see water battles. */
  private battleInWater = false;
  /** The last car you drove (for the Repair Kit). */
  private lastDriven: Car | null = null;
  private clockEl!: HTMLDivElement;
  /** The player's Streetmon. */
  readonly party = new Party();
  battles!: BattleController;
  private battleUi!: BattleUi;
  clinics!: Clinics;
  /** Player can't act until this time (blacking out). */
  private lockedUntil = 0;
  private starterEl: HTMLDivElement | null = null;
  readonly bag = new Bag();
  catcher!: CatchVisuals;
  /** 3D sound (src/audio/Spatial.ts): made on the first click, null before. */
  spatial: SpatialAudio | null = null;
  /** The Central Green pond: waves and ripples (PondView.ts), and each car's state in it (Pond.ts). */
  private pond!: PondView;
  private docks!: DocksView;
  private readonly carWater = new WeakMap<Car, CarWater>();
  private readonly floodTold = new WeakSet<Car>();
  private strokeClock = 0;
  readonly icons = new CreatureIcons();
  private team!: TeamScreen;
  private partyBar!: PartyBar;
  private dexScreen!: DexScreen;
  private seenTimer = 0;
  /** Seconds played (saved). */
  private playTime = 0;
  private autosaveTimer = 45;
  private saveDirty = false;
  /** What asked for the next autosave (shown with the indicator); null: a routine save. */
  private autosaveNote: string | null = null;
  private lastSaveAt = -999;
  private safeSpots: SafehouseSpot[] = [];
  private safeView!: SafehouseView;
  private safehouses: SafehouseState = { owned: [], last: null, visits: {} };
  /** Buildings you can walk into (doors outside, rooms far below), and the one you're in. */
  private interiorSpots: InteriorSpot[] = [];
  private rooms: InteriorRoom[] = [];
  private roomPeople: Array<{ room: InteriorRoom; role: string; model: Humanoid; seed: number }> = [];
  private interior: InteriorRoom | null = null;
  /** How many times you've spoken to someone (by id), so they remember you. */
  private talked = new Map<string, number>();
  private clinicMenu!: ClinicMenu;
  private captureEl!: HTMLDivElement;
  /** Streetmon dex: species seen and caught. */
  readonly dex = {
    seen: new Set<string>(),
    caught: new Set<string>(),
    /** Species you've evolved yourself (the form before and the form after). */
    evolved: new Set<string>(),
    firstSeen: {} as SaveData['dex']['firstSeen'],
  };
  /** Save state for systems still being built (layers, pity, stashes, quests, sewers); carried through saves. */
  progress: Pick<SaveData, 'layer' | 'pity' | 'stashesOpened' | 'quests' | 'reputation' | 'manholesFound' | 'sewerSeed' | 'streetCred'> = {
    layer: 'street',
    pity: { fails: 0, sameTarget: null },
    stashesOpened: [],
    quests: {},
    reputation: 0,
    manholesFound: [],
    sewerSeed: DEFAULT_SEWER_SEED,
    streetCred: 0,
  };
  /** An overworld capture throw is in flight. */
  private throwing = false;
  evolution!: EvolutionScene;
  /** Evolutions waiting to play (after a battle, or from an item). */
  private readonly evoQueue: Array<{ creature: Creature; to: string; item?: string }> = [];
  private readonly evoLook = new THREE.Vector3();
  trainers!: TrainerSystem;
  /** You've used your Streetmon in a crime while wanted: police send tranquilliser units. */
  creatureCrime = false;
  /** Creatures that took part in crimes (confiscated if you're busted). */
  private readonly crimeCreatures = new Set<Creature>();
  /** Confiscated creatures waiting at the precinct impound. */
  readonly impound: Creature[] = [];
  private impoundSpot = { x: 0, z: 0 };
  private sedatedUntil = 0;
  /** Tranquilliser darts taken this chase: enough of them and you go down (busted). */
  private tranqHits = 0;
  follower!: Follower;
  readonly music = new Music();
  /** Player options (look speed, inverted look, volumes, HUD size), kept outside the save. */
  private options: Options = loadOptions();
  /** Street, rooftops or sewers: where the player is. */
  layers!: WorldLayers;
  /** A move between layers in progress (climb, ride, drop): fade out, move, fade in. */
  private trans: { to: Biome; x: number; y: number; z: number; t: number; dur: number; moved: boolean; label: string; done?: () => void } | null = null;
  private fadeEl!: HTMLDivElement;
  /** Rooftops: walkable roofs, access points, garages, jump pads, stashes. */
  roofPlan!: RooftopPlan;
  private roofView!: RooftopView;
  /** The last jump pad launch, for the safety net if you miss the landing. */
  private lastPad: { pad: JumpPad; at: number } | null = null;
  /** The Skyline Trader on a Midtown roof: evolution items for less than the clinic. */
  private roofTrader: { x: number; y: number; z: number; heading: number; model: Humanoid | null } | null = null;
  /** The sewer labyrinth: one maze under each built-up district. */
  mazes: Maze[] = [];
  /** The deep drains (levels 2 and 3 under each district), and the shafts between levels. */
  deepMazes: Maze[] = [];
  private shafts: Array<{ from: { x: number; z: number; floor: number }; to: { x: number; z: number; floor: number }; level: number; district: string }> = [];
  private sewerView!: SewerView;
  private cityRoot!: THREE.Object3D;
  private flashlight!: THREE.SpotLight;
  private lantern!: THREE.PointLight;
  private hazardToastAt = 0;
  private surfaceFar = 0;
  /** Camps out in the sewer halls where people live (wild Streetmon keep away). */
  private readonly sewerCamps: Array<{ x: number; z: number; district: string }> = [];
  /** Sewer community: people in the hubs, conversations and quests. */
  private dialogue!: DialogueBox;
  private people: Array<{ spec: NpcSpec; x: number; y: number; z: number; heading: number; model: Humanoid | null }> = [];
  private questEscort: { questId: string; inst: CreatureInstance | null; loading: boolean; x: number; z: number; following: boolean } | null = null;
  private questPickup: { questId: string; step: number; mesh: THREE.Mesh } | null = null;
  private questBattle: string | null = null;
  private questBattleCd = 0;
  /** Quest steps to advance a moment later (after a catch's own message). */
  private questLater: Array<{ id: string; at: number }> = [];
  private objectiveEl!: HTMLDivElement;
  /** In-game days passed (the black market's stock changes daily). */
  private dayCount = 0;
  /** Chase music keeps going from 2 stars until the heat is gone. */
  private chaseMusic = false;
  private tooltip!: CreatureTooltip;
  private dmgNums!: DamageNumbers;
  /** NPC hunters and chatter, wild territory fights and packs, the AI radius (see setupLivingWorld). */
  living!: LivingWorld;
  /** Last time a wild Streetmon bite was announced. */
  private biteToastAt = 0;
  /** One chance per chase to fight your way out of an arrest. */
  private arrestBattleUsed = false;
  /** A random person walking over to challenge you. */
  private challenger: { ped: Ped; name: string; team: Creature[]; bubble: THREE.Sprite } | null = null;
  private challengeTimer = 40;
  /** Creatures shown with gang trainers (for the hover health bar). */
  private readonly trainerPetInfo = new Map<string, Creature>();
  private lastPhase = '';
  private readonly battleLook = new THREE.Vector3();
  private aiming = false;
  private gunfireCd = 0;
  /** Last time each person's injury was reported (one report per person per few seconds). */
  private readonly reported = new WeakMap<object, number>();
  private ramCd = 0;
  /** Sidewalk outside the precinct, where you're released after an arrest. */
  private precinct = { x: 0, z: 0 };
  private readonly clock = new THREE.Clock();
  private accumulator = 0;
  private jumpQueued = false;
  private hitCooldown = 0;
  private respawnAt = 0;
  private respawnPoint: { x: number; z: number } = { x: 0, z: 0 };
  /** Mama's welcome was accepted: show the starter pick when her conversation closes. */
  private pendingStarter = false;
  /** Cars the player has already been charged for taking. */
  private readonly stolen = new WeakSet<Car>();
  private fps = 60;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly container: HTMLElement) {
    dexEntries(); // validate the Streetmondex text against the species list at startup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GRAPHICS.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(CAMERA.baseFov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
    if (GRAPHICS.bloom.enabled && platform.bloom) {
      try {
        this.bloom = new SelectiveBloom(this.renderer, this.scene, this.camera, GRAPHICS.bloom);
        // Off switch for slow machines: localStorage['es.bloom'] = '0'.
        try {
          if (localStorage.getItem('es.bloom') === '0') this.bloom.enabled = false;
        } catch {
          /* storage blocked: keep the default */
        }
      } catch (e) {
        console.warn('Bloom unavailable, rendering without it', e);
        this.bloom = null;
      }
    }
    this.input = new Input(this.renderer.domElement);
    this.padIn = new PadInput(this.input);
    if (platform.touch) {
      this.input.touch = true;
      document.body.classList.add('touch');
      this.touchUi = new TouchControls(container, this.input, () => {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      });
    }
    this.menus = new Menus(container, {
      onPlay: () => this.start('new'),
      onContinue: () => this.start('continue'),
      onSave: () => (this.saveGame() ? 'Game saved.' : "Couldn't save: browser storage is blocked. Use Export save instead."),
      onExport: () => this.exportSave(),
      onImport: (text) => this.importSave(text),
      onResume: () => this.resume(),
      onToggleSound: () => {
        audio.setEnabled(!audio.on);
        return audio.on;
      },
      onToggleShadows: () => this.toggleShadows(),
      onToggleBattleMode: () => {
        if (!this.battles?.active) {
          BATTLE.mode = BATTLE.mode === 'turn' ? 'realtime' : 'turn';
          this.battleModeChosen = true;
        }
        return BATTLE.mode === 'turn' ? 'Turn-based' : 'Real-time';
      },
      battleModeLabel: () => (BATTLE.mode === 'turn' ? 'Turn-based' : 'Real-time'),
      onToggleTips: () => {
        this.saveDirty = true;
        return this.tut.setEnabled(!this.tut.enabled);
      },
      tipsOn: () => this.tut?.enabled ?? true,
      tutorials: () => this.tut.list(),
      onReplayTutorial: (id) => this.tut.replay(id),
      onWardrobe: () => {
        if (this.state !== 'paused') return;
        this.menus.showPause(false);
        this.state = 'playing';
        const p = this.player;
        if (p.vehicle || p.dead || this.battles.active || this.evolution.active || !!this.trans || this.heists.active || this.races.active) {
          this.hud.toast('Step out of the car, and finish any fight, race or job, to change your look.', 3500);
          this.clock.getDelta();
          return;
        }
        this.openWardrobe(false);
      },
      onWatchIntro: () => {
        const d = (cinematicsConfig as unknown as CinematicConfig).cinematics.find((c) => c.id === 'intro');
        if (!d || this.state !== 'paused') return;
        this.menus.showPause(false);
        this.state = 'playing';
        this.playCinematic(d, {}, 'intro');
      },
      optionLabel: (k) => optionLabel(this.options, k as keyof Options),
      onCycleOption: (k) => {
        this.options = cycleOption(this.options, k as keyof Options);
        saveOptions(this.options);
        this.applyOptions();
        return optionLabel(this.options, k as keyof Options);
      },
      onQuit: () => {
        this.autosave();
        window.location.reload();
      },
    });
    this.applyOptions();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.pointerLocked && this.state === 'playing' && !this.battles?.locksPlayer && !this.evolution?.active && !this.cityMap?.isOpen) this.pause();
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.pointerLocked && !this.battles?.locksPlayer && !this.evolution?.active && !this.cityMap?.isOpen) this.input.requestPointerLock();
    });
  }

  async init(): Promise<void> {
    const t0 = performance.now();
    this.menus.setLoadingMessage('Starting physics…');
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.step;

    this.menus.setLoadingMessage('Laying out the streets…');
    await nextFrame();
    this.layout = generateLayout();
    // Back alleys cut through a few blocks (street events use them), clear of hand-placed spots.
    planAlleys(this.layout, alleyAvoidPoints(heistsConfig, racesConfig as never));
    // Parking garages replace a pair of lots per district before the city is built.
    const garages = planGarages(this.layout);
    this.layout.garages = garages;
    // The Chop Shop's lift goes in a Midtown kerb lane (parked cars cleared around it).
    this.chopSpot = planChopShop(this.layout);
    // Mama Rust stands outside her shop, whichever kerb the city plan gave it (her spot in the
    // campaign config is only a fallback): on the pavement beside the roll-up door, facing the
    // street. Everything that points at her (the new-game walk, the guide, the chop-shop
    // cinematic's "car at the kerb") then agrees with where the lift is.
    {
      const mama = (campaignConfig as unknown as CampaignConfig).npcs.find((n) => n.id === 'rust');
      const cs = this.chopSpot;
      if (mama) {
        mama.at = { x: cs.x + 7.5, z: cs.doorZ - cs.side * 1.7 };
        mama.heading = cs.side > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    // Empire Motors: a showroom front in a Downtown kerb lane, well away from the Chop Shop.
    this.dealerSpot = planDealership(this.layout, [this.chopSpot]);
    // Safehouses: a front door in each district (the Midtown one round the corner from Mama's is yours).
    this.safeSpots = planSafehouses(
      this.layout,
      [
        { x: this.chopSpot.x, z: this.chopSpot.z },
        { x: this.chopSpot.x, z: this.chopSpot.doorZ },
        { x: this.dealerSpot.x, z: this.dealerSpot.doorZ },
        ...clinicSpots(this.layout).map((c) => c.door),
        ...shopSpots(this.layout).map((c) => c.door),
      ],
      this.layout.playerSpawn,
    );
    this.safehouses = newSafehouseState(this.safeSpots);
    this.interiorSpots = planInteriors(this.layout, [
      { x: this.chopSpot.x, z: this.chopSpot.doorZ },
      { x: this.dealerSpot.x, z: this.dealerSpot.doorZ },
      ...clinicSpots(this.layout).map((c) => c.door),
      ...shopSpots(this.layout).map((c) => c.door),
      ...this.safeSpots.map((h) => ({ x: h.x, z: h.z })),
    ]);
    this.layout.clearFronts = [{ x: this.dealerSpot.x, z: this.dealerSpot.doorZ, r: 16 }, ...this.safeSpots.map((s) => ({ x: s.x, z: s.z, r: 4 })), ...this.interiorSpots.map((s) => ({ x: s.x, z: s.z, r: 4 }))];
    const city = buildCity(this.layout, this.world);
    this.cityProps = city.props;
    this.pond = city.pond;
    this.docks = city.docks;
    // Entrances never overlap: fire escapes and elevator doors keep clear of street furniture,
    // shop and clinic doors and the Chop Shop; manholes and small props keep clear of all of those.
    const keep: KeepClear[] = [
      ...city.props.map((p) => ({ x: p.x, z: p.z, r: p.kind === 'parkTree' ? 0 : 1.2 })).filter((k) => k.r > 0),
      ...clinicSpots(this.layout).map((c) => ({ x: c.door.x, z: c.door.z, r: 3.5 })),
      ...shopSpots(this.layout).map((c) => ({ x: c.door.x, z: c.door.z, r: 3.5 })),
      { x: this.chopSpot.x, z: this.chopSpot.z, r: 5 },
      ...this.chopSpot.bays.map((b) => ({ x: b.x, z: b.z, r: 4 })),
      { x: this.chopSpot.x, z: this.chopSpot.doorZ, r: 4 },
      { x: this.dealerSpot.x, z: this.dealerSpot.z, r: 5 },
      ...[...this.dealerSpot.bays, this.dealerSpot.delivery].map((b) => ({ x: b.x, z: b.z, r: 4 })),
      { x: this.dealerSpot.x, z: this.dealerSpot.doorZ, r: 10 },
      ...this.safeSpots.map((s) => ({ x: s.x, z: s.z, r: 4 })),
      ...this.interiorSpots.map((s) => ({ x: s.x, z: s.z, r: 4 })),
      ...alleyAvoidPoints(heistsConfig, racesConfig as never).map((p) => ({ ...p, r: 2.5 })),
    ];
    this.roofPlan = planRooftops(this.layout, garages, undefined, keep);
    this.keepClear = [
      ...keep,
      ...this.roofPlan.access.map((a) => ({ x: a.street.x, z: a.street.z, r: 2.6 })),
      ...(this.layout.alleys ?? []).flatMap((a) => [
        { x: a.rect.x0, z: (a.rect.z0 + a.rect.z1) / 2, r: 3 },
        { x: a.rect.x1, z: (a.rect.z0 + a.rect.z1) / 2, r: 3 },
        { x: (a.rect.x0 + a.rect.x1) / 2, z: a.rect.z0, r: 3 },
        { x: (a.rect.x0 + a.rect.x1) / 2, z: a.rect.z1, r: 3 },
      ]),
    ];
    this.roofView = buildRooftops(this.roofPlan, this.world);
    this.scene.add(this.roofView.root);
    this.chopView = buildChopShop(this.chopSpot);
    this.scene.add(this.chopView.root);
    this.dealerView = buildDealership(this.dealerSpot);
    this.scene.add(this.dealerView.root);
    this.scene.add(buildInteriorDoors(this.interiorSpots).root);
    for (const sp of this.interiorSpots) {
      const room = buildInterior(sp, this.world);
      this.rooms.push(room);
      this.scene.add(room.root);
      room.people.forEach((pp, k) => {
        let seed = 0;
        for (const ch of `${sp.id}:${k}`) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
        let rs = seed || 1;
        const look = randomLook(() => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296));
        const model = new Humanoid(look);
        model.root.position.set(pp.x, INTERIOR.floorY, pp.z);
        model.root.rotation.y = pp.heading;
        room.root.add(model.root);
        this.roomPeople.push({ room, role: pp.role, model, seed });
      });
    }
    this.safeView = buildSafehouses(this.safeSpots);
    this.safeView.setOwned(this.safehouses.owned);
    this.scene.add(this.safeView.root);
    // Sewers: a maze centred under each built-up district, manholes on open pavement above.
    {
      const probe = new WorldLayers(this.layout);
      const centres = (['uptown', 'midtown', 'downtown'] as const)
        .map((d) => {
          const rs = this.roofPlan.roofs.filter((r) => r.district === d && r.kind !== 'podium');
          if (!rs.length) return null;
          return { district: d, x: rs.reduce((a, r) => a + (r.rect.x0 + r.rect.x1) / 2, 0) / rs.length, z: rs.reduce((a, r) => a + (r.rect.z0 + r.rect.z1) / 2, 0) / rs.length };
        })
        .filter((c): c is { district: 'uptown' | 'midtown' | 'downtown'; x: number; z: number } => !!c);
      const L = this.layout;
      const streetOk = (x: number, z: number): boolean =>
        x > L.land.x0 + 5 && x < L.land.x1 - 5 && z > L.land.z0 + 5 && z < L.land.z1 - 5 && !probe.buildingAt(x, z) &&
        // Garages with a margin round the ramp foot, parked cars, and every other entrance.
        !(L.garages ?? []).some((g) => x >= g.rect.x0 - 6 && x <= g.rect.x1 + 6 && z >= g.rect.z0 - 3 && z <= g.rect.z1 + 3) &&
        !(x > L.parkLake.x0 && x < L.parkLake.x1 && z > L.parkLake.z0 && z < L.parkLake.z1) &&
        this.keepClear.every((k) => Math.hypot(k.x - x, k.z - z) >= k.r + 1.4) &&
        L.parking.every((s) => Math.hypot(s.x - x, s.z - z) >= 3.2);
      this.mazes = planSewers(this.layout, DEFAULT_SEWER_SEED, centres, streetOk);
      this.deepMazes = planDeepSewers(DEFAULT_SEWER_SEED, this.mazes);
      this.linkShafts();
      // Covers sit on the surface: sidewalks, the park and the promenade are on a 0.15 m curb.
      const inR = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
      const outer = (x: number, z: number): boolean => x < L.aveX[0] - CITY.aveWidth / 2 || x > L.aveX[L.aveX.length - 1] + CITY.aveWidth / 2 || z < L.streetZ[0] - CITY.streetWidth / 2 || z > L.streetZ[L.streetZ.length - 1] + CITY.streetWidth / 2;
      const marks: ShaftMark[] = this.shafts.flatMap((sh) => [
        { x: sh.from.x, z: sh.from.z, floor: sh.from.floor, down: true },
        { x: sh.to.x, z: sh.to.z, floor: sh.to.floor, down: false },
      ]);
      this.sewerView = buildSewers([...this.mazes, ...this.deepMazes], this.world, (x, z) => (inR(L.park, x, z) || outer(x, z) || L.blocks.some((b) => inR(b, x, z)) ? 0.15 : 0), marks);
      this.scene.add(this.sewerView.under, this.sewerView.covers);
    }
    // People living in the sewers: even spots round the hub, odd ones at camps out in the halls
    // (the nearest halls to the hub, each with a fire in a drum).
    for (const n of COMMUNITY.npcs) {
      const m = this.mazes.find((z) => z.district === n.home);
      if (!m) continue;
      const camp = n.spot % 2 === 1 ? m.camps[(n.spot - 1) / 2] : undefined;
      if (camp) {
        const c = blockCentre(m, camp.i, camp.j);
        const x = c.x - SEWER.block * 0.55;
        const z = c.z + SEWER.block * 0.45;
        // Facing the fire (at +0.25 B, -0.25 B from the hall centre).
        const fx = c.x + SEWER.block * 0.25;
        const fz = c.z - SEWER.block * 0.25;
        this.people.push({ spec: n, x, y: SEWER.floor, z, heading: Math.atan2(-(fz - z), fx - x), model: null });
        this.sewerCamps.push({ x: c.x, z: c.z, district: m.district });
        continue;
      }
      const c = blockCentre(m, m.hub.i, m.hub.j);
      const a = (n.spot / 8) * Math.PI * 2;
      const x = c.x + Math.cos(a) * 5;
      const z = c.z + Math.sin(a) * 5;
      this.people.push({ spec: n, x, y: SEWER.floor, z, heading: Math.atan2(-(c.z - z), c.x - x), model: null });
    }
    this.flashlight = new THREE.SpotLight(0xfff1d6, 0, 26, 0.5, 0.45, 1.2);
    this.lantern = new THREE.PointLight(0xffe2b0, 0, 7, 1.6);
    this.scene.add(this.flashlight, this.flashlight.target, this.lantern);
    this.scene.add(city.root);
    this.cityRoot = city.root;
    this.env = new Environment(this.scene, this.renderer, this.layout);
    city.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && !Array.isArray(m) && m.name === 'lampHead') this.env.lampMaterial = m;
    });
    this.env.setTime(this.hour);
    this.graph = new RoadGraph(this.layout);
    this.signals = new Signals(this.graph);
    this.signalView = new SignalView(city.signals, this.graph, this.signals);
    this.effects = new Effects(this.scene);

    this.menus.setLoadingMessage('Loading models…');
    const models = new ModelLibrary();
    await models.load((m) => this.menus.setLoadingMessage(m));

    this.vehicles = new VehicleManager(
      this.scene,
      this.world,
      this.layout,
      this.effects,
      {
        onExplosion: (x, y, z, r) => this.onExplosion(x, y, z, r),
        onCrash: (s, mine) => {
          if (mine) {
            const tid = this.player.vehicle?.tuneId;
            if (tid) this.tuning?.notifyCollision(tid, { strength: s });
            this.rig.shake(Math.min(0.03, s * 0.003));
            if (s > 6) this.peds?.alarm(this.focus().x, this.focus().z, 16);
            this.checkRam();
          }
        },
      },
      models,
    );

    // A new game starts round the corner from Mama Rust's Chop Shop, on the sidewalk of the
    // avenue west of it, half a block up: a couple of minutes' walk with a corner (a waypoint and the
    // guide point the way). Not in the park (aggressive Streetmon live there). A loaded save moves
    // you anyway. No car: Mama gives you your first.
    const mama = (campaignConfig as unknown as CampaignConfig).npcs.find((n) => n.id === 'rust');
    const ave = Math.max(...this.layout.aveX.filter((x) => x < (mama?.at.x ?? 0)));
    const sp = mama ? { x: ave + CITY.aveWidth / 2 + 2, z: mama.at.z - NEW_GAME_WALK } : this.layout.playerSpawn;
    this.player = new Player(this.world, sp.x, 0.15, sp.z, models.playerModel() ?? new Humanoid(toHumanoidLook(this.playerLook)));
    this.player.water = (x, z) => this.waterAt(x, z);
    this.scene.add(this.player.model.root);
    // Facing down the avenue towards Mama's street (not into the wall beside you).
    const look = mama ? { x: sp.x, z: mama.at.z } : { x: sp.x + 1, z: sp.z };
    this.player.facing = Math.atan2(-(look.z - sp.z), look.x - sp.x);

    this.peds = new PedestrianSystem(this.scene, this.layout, this.graph, this.signals, this.vehicles, {
      onPedHit: (ped, byPlayer, killed) => this.onPedHit(ped, byPlayer, killed),
      onPedDied: (ped) => this.onPedDied(ped),
    });
    this.traffic = new TrafficSystem(this.graph, this.signals, this.vehicles, {
      onDriverExit: (car, look, tx, tz) => {
        // Step out on the driver's side and run.
        const side = this.tmp.set(-0.2, 0, -(car.spec.width / 2 + 0.6)).applyQuaternion(car.quaternion).add(car.position);
        this.peds.spawnFleeing(side.x, side.z, look, tx, tz);
      },
    });
    // Phones keep a thinner crowd and less traffic (the platform's share of the desktop numbers).
    if (platform.crowd < 1) {
      this.peds.maxPeds = Math.round(this.peds.maxPeds * platform.crowd);
      this.traffic.maxCars = Math.round(this.traffic.maxCars * platform.crowd);
    }
    this.police = new PoliceSystem(this.world, this.graph, this.vehicles, this.traffic, this.peds, this.wanted, {
      onBusted: () => this.onArrested(),
      onOfficerFire: (o, chance) => this.onOfficerFire(o, chance),
    });
    this.precinct = this.findPrecinct();
    this.peds.populate(this.player.position);
    this.traffic.populate(this.player.position, this.camera);

    this.rig = new CameraRig(this.camera, this.world);
    this.weapons = new WeaponSystem(this.scene, this.world, this.rig, this.player, this.peds, this.vehicles, this.effects, {
      onNoise: (x, z, r, id) => this.onNoise(x, z, r, id),
      onPedDamaged: (ped, killed, id, melee) => this.onPedDamaged(ped, killed, id, melee),
      onPlayerDamaged: (amount, _x, _z, cause) => {
        if (this.player.takeDamage(amount)) this.kill(cause);
      },
      onPickup: (text) => this.hud.toast(text, 1800),
      onMoney: (n) => {
        this.money += n;
        this.hud.toast(`+$${n}`, 1200);
      },
      onHitMarker: (kill) => this.weaponHud.hitMarker(kill),
      // Shots into the world: street props take the damage, anything else gets a bullet hole.
      onWorldHit: (handle, damage, at, normal, dir) => {
        if (this.hazards?.bullet(handle, damage)) return true;
        if (this.destruction?.bullet(handle, damage, at, dir.x, dir.z)) return true;
        this.decals?.add('bullet', at, normal, 0.16 + Math.random() * 0.06);
        return false;
      },
    });
    this.weapons.placeWorldPickups(this.layout);
    this.tanks = new TankSystem(this.scene, this.world, this.layout, this.effects, {
      focus: () => this.focus(),
      target: () => this.tankTarget(),
      inView: (x, y, z) => this.tankFrustum.containsPoint(this.tmp.set(x, y, z)) && this.camera.position.distanceTo(this.tmp) < 400,
      shellExploded: (x, y, z, src) => this.tankShellBlast(x, y, z, src),
      fired: (x, y, z) => {
        const d = this.camera.position.distanceTo(this.tmp.set(x, y, z));
        audio.explosion({ x, y, z });
        this.rig.shake(clamp(0.05 * (1 - d / 90), 0, 0.05));
      },
      crush: (t, dt) => this.tankCrush(t, dt),
      destroyed: (t) => this.tankDestroyed(t),
    });
    this.traffic.extraObstacles = () =>
      this.tanks.tanks.map((t) => ({ x: t.x, y: 1, z: t.z, halfLen: TANK_SPEC.size[2] / 2, halfW: TANK_SPEC.size[0] / 2, vx: t.forwardX * t.v, vz: t.forwardZ * t.v }));
    this.weapons.armour = {
      hit: (handle, dmg) => {
        const t = this.tanks.byCollider(handle);
        if (!t) return false;
        this.tanks.damage(t, dmg, 'bullet');
        return true;
      },
      burn: (x, z, r, amount) => this.tanks.burn(x, z, r, amount),
    };
    this.spawns = new SpawnSystem(this.scene, this.layout, this.peds, this.vehicles, this.creatureModels, {
      onEngage: (w) => this.onWildEngage(w),
      onShinyNearby: (w) => this.hud.toast(`Something sparkles nearby... a shiny ${w.spec.name}!`, 3500),
      onSpawned: (w) => this.living?.onSpawned(w),
      onAttackPlayer: (w, dmg) => this.onWildBite(w, dmg),
      onGiveUp: (w, why) => {
        if (Math.hypot(w.x - this.focus().x, w.z - this.focus().z) < 60) this.hud.toast(why === 'hidden' ? `The ${w.spec.name} lost track of you.` : `The ${w.spec.name} gave up the chase.`, 2200);
      },
    });
    this.spawns.capScale = Math.max(0.6, platform.crowd);
    this.clinics = new Clinics(this.scene, this.layout);
    this.trainers = new TrainerSystem(
      this.scene,
      this.layout,
      this.creatureModels,
      (x, z) => !this.peds.blocked(x, z) && this.peds.groundY(x, z) > 0.1,
      (x, z) => this.peds.groundY(x, z),
      { onChallenge: (t) => this.onTrainerChallenge(t) },
      (spec) => this.roofSpotNear(this.layout.aveX[spec.ave], this.layout.streetZ[spec.street]),
    );
    this.roofTrader = this.placeRoofTrader();
    this.shops = new Shops(this.scene, this.layout);
    this.hud = new Hud(this.container, this.layout);
    this.hud.setVisible(false);
    this.weaponHud = new WeaponHud(this.hud.el);
    this.quickWheel = new QuickWheel(this.hud.el, (e) => this.quickPick(e));
    this.clockEl = document.createElement('div');
    this.clockEl.className = 'clock';
    this.hud.el.appendChild(this.clockEl);
    this.shopMenu = new ShopMenu(this.container);
    this.battleUi = new BattleUi(this.container, this.icons);
    this.battleUi.onPickMove = (k) => this.input.press(`Digit${k + 1}`);
    this.partyBar = new PartyBar(this.hud.el, this.icons);
    this.dexScreen = new DexScreen(this.container, this.icons);
    this.catcher = new CatchVisuals(this.scene, this.effects);
    this.follower = new Follower(this.scene, this.creatureModels, (x, z) => this.groundAt(x, z), (x, z) => this.blockedAt(x, z));
    this.tooltip = new CreatureTooltip(this.container);
    this.dmgNums = new DamageNumbers(this.container);
    this.moveFx = new MoveFx({
      scene: this.scene,
      effects: this.effects,
      groundY: (x, z) => this.groundAt(x, z),
      listener: () => this.camera.position,
      shake: (a) => this.shakeCamera(a),
      // Moves landing at street level knock over what's around them (legendary ones wreck it).
      landed: (at, plan) => {
        if (at.y < -2 || at.y > 4 || !this.destruction) return;
        this.destruction.manager.move(at.x, at.z, plan.power, plan.aoe, plan.wreck);
        if (plan.wreck) this.decals.ground('crack', at.x, this.groundAt(at.x, at.z), at.z, 3 + plan.scale * 2);
      },
    });
    this.decals = new Decals(this.scene, DESTRUCTIBLES.settings.decals);
    this.destruction = new DestructionWorld({
      scene: this.scene,
      world: this.world,
      effects: this.effects,
      decals: this.decals,
      layout: this.layout,
      cityProps: this.cityProps,
      keepClear: [...this.keepClear, ...this.mazes.flatMap((m) => m.manholes.map((h) => ({ x: h.x, z: h.z, r: 1.5 })))],
      inView: (x, y, z) => this.tankFrustum.containsPoint(this.tmp.set(x, y, z)),
      listener: () => this.camera.position,
    });
    this.dialogue = new DialogueBox(this.container);
    this.objectiveEl = document.createElement('div');
    this.objectiveEl.className = 'objective';
    this.container.appendChild(this.objectiveEl);
    this.layers = new WorldLayers(this.layout);
    for (const g of this.roofPlan.garages) {
      this.layers.addRoof(g.deckRect, g.deck);
      this.layers.addRoof(g.landing, g.deck);
    }
    // Rooftop ground for wild Streetmon: any roof surface; spawns on reachable roofs near you.
    this.spawns.layers.roof = {
      ground: (x, z) => this.layers.roofAt(x, z)?.top ?? null,
      spawnPoint: (pl, rand) => {
        const near = this.roofPlan.roofs.filter((r) => this.roofPlan.reachable.has(r.id) && Math.hypot((r.rect.x0 + r.rect.x1) / 2 - pl.x, (r.rect.z0 + r.rect.z1) / 2 - pl.z) < 60);
        if (!near.length) return null;
        const r = near[Math.floor(rand() * near.length)];
        const x = r.rect.x0 + 1.5 + rand() * Math.max(0.1, r.rect.x1 - r.rect.x0 - 3);
        const z = r.rect.z0 + 1.5 + rand() * Math.max(0.1, r.rect.z1 - r.rect.z0 - 3);
        return { x, y: r.top, z, district: r.district };
      },
    };
    for (const id of this.progress.stashesOpened) this.roofView.setStashOpen(id, true);
    // The pond: water-dwelling Streetmon float on it and spawn while you're near the Central Green.
    const lake = this.layout.parkLake;
    this.spawns.layers.pond = {
      ground: (x, z) => (inLake(lake, x, z, 0.8) ? POND.surface - 0.06 : null),
      spawnPoint: (pl, rand) => {
        const cx = (lake.x0 + lake.x1) / 2;
        const cz = (lake.z0 + lake.z1) / 2;
        if (Math.hypot(pl.x - cx, pl.z - cz) > 190) return null;
        const p = waterPoint(lake, rand, 5);
        return { x: p.x, y: POND.surface - 0.06, z: p.z, district: 'park' };
      },
      nearest: (x, z) => nearestWater(lake, x, z, 2.5),
    };
    this.spawns.layers.sewer = {
      ground: (x, z) => {
        const m = this.mazeAt(x, z);
        const b = m && blockAt(m, x, z);
        if (!b || !m!.open[b.i][b.j]) return null;
        // The hub and the camps are home to people: wild Streetmon keep out. Props are solid.
        const h = blockCentre(m!, m!.hub.i, m!.hub.j);
        if (Math.hypot(h.x - x, h.z - z) < 9) return null;
        if (this.sewerCamps.some((c) => Math.hypot(c.x - x, c.z - z) < 7)) return null;
        if (m!.pools.has(blockKey(b!.i, b!.j))) return null;
        return propAt(m!, x, z, 0.1) ? null : m!.floor;
      },
      spawnPoint: (pl, rand) => {
        const m = this.mazeAt(pl.x, pl.z, pl.y);
        if (!m) return null;
        // Most spawns are in the open rooms (halls and chambers) within reach, the rest anywhere.
        if (rand() < SEWER.roomSpawnShare) {
          const rooms = m.rooms.filter((r) => {
            if (r.kind === 'hub') return false;
            const c = blockCentre(m, r.i, r.j);
            const d = Math.hypot(c.x - pl.x, c.z - pl.z);
            return d > 12 && d < 55 && !this.sewerCamps.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < 1);
          });
          if (rooms.length) {
            const r = rooms[Math.floor(rand() * rooms.length)];
            const i = r.i + Math.round((rand() * 2 - 1) * r.r);
            const j = r.j + Math.round((rand() * 2 - 1) * r.r);
            const c = blockCentre(m, i, j);
            if (m.open[i]?.[j] && !m.hazards.has(blockKey(i, j)) && !m.pools.has(blockKey(i, j)) && !propAt(m, c.x, c.z, 0.6) && Math.hypot(c.x - pl.x, c.z - pl.z) > 10) return { x: c.x, y: m.floor, z: c.z, district: m.district, level: m.level };
          }
        }
        for (let t = 0; t < 12; t++) {
          const a = rand() * Math.PI * 2;
          const d = 12 + rand() * 28;
          const b = blockAt(m, pl.x + Math.cos(a) * d, pl.z + Math.sin(a) * d);
          if (b && m.open[b.i][b.j] && !m.hazards.has(blockKey(b.i, b.j)) && !m.pools.has(blockKey(b.i, b.j))) {
            const c = blockCentre(m, b.i, b.j);
            const h = blockCentre(m, m.hub.i, m.hub.j);
            if (Math.hypot(h.x - c.x, h.z - c.z) < 12) continue;
            if (this.sewerCamps.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < 9) || propAt(m, c.x, c.z, 0.6)) continue;
            return { x: c.x, y: m.floor, z: c.z, district: m.district, level: m.level };
          }
        }
        return null;
      },
    };
    this.setupTuning();
    this.setupRaces();
    this.setupCreatureSteering();
    this.setupHeists();
    this.setupStreetEvents();
    this.setupLivingWorld();
    this.setupRaids();
    this.setupGangs();
    this.setupHazards();
    this.precip = new Precipitation(this.scene, platform.touch ? 1000 : 2400);
    this.peds.styleAt = (x, z, look) => localLook(neighbourhoodAt(this.layout, x, z), look, Math.random);
    this.setupColliderStreaming();
    this.setupCampaign();
    this.setupCityMap();
    this.setupTutorials();
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'layer-fade';
    this.container.appendChild(this.fadeEl);
    this.cine = new CinematicView(this.container);
    this.wardrobe = new WardrobeMenu(this.container);
    this.guide = new WaypointGuide(this.scene, this.container);
    this.story = new StoryCard(this.container);
    this.weapons.creatureTargets = () => this.creatureTargets();
    this.team = new TeamScreen(this.container, this.party, this.bag, this.icons, (c, itemId, to) => this.useEvolutionItem(c, itemId, to), (id, target) => this.useFieldItem(id, target));
    this.evolution = new EvolutionScene(this.container, this.scene, this.creatureModels, this.effects, (x, z) => this.groundAt(x, z));
    this.clinicMenu = new ClinicMenu(this.container);
    this.casinoMenu = new CasinoMenu(this.container);
    this.captureEl = document.createElement('div');
    this.captureEl.className = 'capture-hud';
    this.hud.el.appendChild(this.captureEl);
    this.battles = new BattleController({
      scene: this.scene,
      models: this.creatureModels,
      effects: this.effects,
      ui: this.battleUi,
      input: this.input,
      groundY: (x, z) => this.groundAt(x, z),
      walkable: (x, z) => !this.peds.blocked(x, z),
      clear: (x, z) => this.battleClear(x, z),
      water: {
        active: () => this.battleInWater,
        lift: (c, t) => waterLift(waterRide(c.speciesId), species(c.speciesId).model.height, t),
        raft: (c) => waterRide(c.speciesId) === 'raft',
      },
      moveFx: this.moveFx,
      dmgNums: this.dmgNums,
      onNoise: (x, z, r, side, user) => this.onBattleNoise(x, z, r, side, user),
      onPersonDown: (ped) => this.onPersonDown(ped),
      onEnd: (r) => this.onBattleEnd(r),
      catcher: this.catcher,
      bagItems: (t) => this.bag.captures().map((e) => ({ id: e.item.id, name: e.item.name, count: e.count, chance: Math.min(1, catchChance(t.creature, e.item, true) + softBonus(this.progress.pity, this.catchUid(t.creature))) })),
      useCapture: (id, t) => {
        const it = itemSpec(id) as CaptureItem;
        if (!this.bag.take(id)) return null;
        this.lawSeesThrow();
        return this.pityRoll(t.creature, it, true);
      },
      throwOrigin: () => this.player.position.clone().setY(this.player.position.y + 0.6),
      quickCapture: () => this.bag.currentCapture()?.id ?? null,
      quickCaptureOdds: (t) => {
        const it = this.bag.currentCapture();
        return it ? Math.min(1, catchChance(t.creature, it, true) + softBonus(this.progress.pity, this.catchUid(t.creature))) : null;
      },
      award: (b, outcome) => this.award(b, outcome),
    });
    this.onResize();

    // Let parked cars settle on their suspension before anyone sees them.
    this.vehicles.stream(0, this.player.position, this.camera, null, true);
    for (let i = 0; i < 90; i++) {
      this.vehicles.prePhysics(PHYSICS.step);
      this.world.step();
      this.vehicles.postPhysics(PHYSICS.step, this.player.position);
    }

    // The save store: localStorage plus IndexedDB (the newest good copy of the two wins).
    await saves.init();
    this.state = 'title';
    console.info(`[game] ready in ${Math.round(performance.now() - t0)} ms`);
    this.menus.setSaveInfo(this.savedSummary());
    this.menus.showTitle();
    this.renderer.setAnimationLoop(() => this.frame());
    // Save when the tab is hidden or closed.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.autosave();
    });
    window.addEventListener('pagehide', () => this.autosave());
  }

  private start(mode: 'new' | 'continue' = 'new'): void {
    if (this.state !== 'title') return;
    if (mode === 'continue') {
      const text = saves.read();
      if (saves.info.recovered) window.setTimeout(() => this.hud.toast('Your last save was damaged: loaded the backup.', 6000), 1800);
      if (text) {
        try {
          const { data, warnings } = loadSave(text);
          this.applySave(data);
          if (warnings.length) window.setTimeout(() => this.hud.toast(`Save repaired: ${warnings.slice(0, 3).join('; ')}${warnings.length > 3 ? '…' : ''}`, 6000), 1500);
        } catch (e) {
          window.setTimeout(() => this.hud.toast(`Couldn't load the save: ${(e as Error).message}`, 5000), 1000);
        }
      }
    }
    audio.unlock();
    this.ensureSpatial();
    audio.ui();
    this.music.unlock();
    this.menus.hideTitle();
    this.hud.setVisible(true);
    this.state = 'playing';
    this.input.requestPointerLock();
    this.rig.yaw = this.player.facing + Math.PI;
    this.clock.getDelta();
    if (mode === 'continue') this.hud.toast('Welcome back.', 2500);
    else {
      // A new game starts the tips over (keeping whether they're on), then the opening cinematic.
      this.tut.load({ enabled: this.tut.enabled, seen: [], performed: [] });
      this.cineSeen.clear();
      // Make your character first, then the opening (its theme loads meanwhile).
      this.music.preload('intro');
      this.openWardrobe(true, () => {
        const intro = cinematicFor(cinematicsConfig as unknown as CinematicConfig, { newGame: true }, this.cineSeen);
        if (intro) this.playCinematic(intro, {}, intro.id, () => this.afterIntro());
        else this.afterIntro();
      });
    }
  }

  // ------------------------------------------------------------------ the wardrobe

  /** Opens the wardrobe: the camera turns to face you, every change shows on the figure. */
  private openWardrobe(newGame: boolean, then?: () => void): void {
    this.state = 'menu';
    this.aiming = false;
    if (this.input.pointerLocked) document.exitPointerLock();
    this.hud.setVisible(false);
    audio.silenceCar();
    this.wardrobeYaw = 25;
    // Nobody standing frozen beside you in the mirror.
    this.peds.clearAround(this.player.position.x, this.player.position.z, 9);
    const finish = (): void => {
      this.hud.setVisible(true);
      this.closeMenu();
      then?.();
    };
    this.wardrobe.open({
      look: this.playerLook,
      newGame,
      onChange: (l) => this.applyLook(l),
      onDone: (l) => {
        this.applyLook(l);
        this.saveDirty = true;
        finish();
      },
      onCancel: () => finish(),
      onTurn: (deg) => (this.wardrobeYaw += deg),
    });
  }

  /** Rebuilds the player's figure from a look. */
  private applyLook(l: PlayerLook): void {
    this.playerLook = { ...l };
    this.player.setModel(new Humanoid(toHumanoidLook(l)));
    this.weapons.refreshHeld();
  }

  /** The wardrobe camera: in front of you (turnable), with you left of centre beside the panel. */
  private wardrobeCamera(dt: number): void {
    const p = this.player.model.root.position;
    const s = this.playerLook.scale;
    const a = this.player.facing + (this.wardrobeYaw * Math.PI) / 180;
    // Facing (cos a, -sin a); the camera stands out in front, 3.3 m away at chest height.
    const fx = Math.cos(a);
    const fz = -Math.sin(a);
    const narrow = window.innerWidth < 700;
    const dist = narrow ? 3.7 : 3.3;
    const want = this.tmp.set(p.x + fx * dist, p.y + 1.25 * s, p.z + fz * dist);
    // Shift the look point to the camera's right so you stand left of the panel (or above the sheet).
    const rx = -fz;
    const rz = fx;
    const side = narrow ? 0 : -0.75;
    const look = new THREE.Vector3(p.x + rx * side, p.y + (narrow ? 0.4 : 0.95) * s, p.z + rz * side);
    const k = 1 - Math.exp(-dt * 6);
    this.camera.position.lerp(want, k);
    this.camera.lookAt(look);
  }

  /** After the opening (watched or skipped): Mama Rust is right there. */
  private afterIntro(): void {
    this.guide.hide();
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    this.hud.setVisible(false);
    this.story.show(
      'THE NIGHT BUS',
      [
        'You came to Empire City with $500, a duffel bag and one name: <b>Mama Rust</b>.',
        "In this town <b>Streetmon</b> run everything. They power the cars, guard the crews and ride with the cops. Without one, you're nobody.",
        'Mama runs the <b>Underground Chop Shop</b>, just round the corner from here. She owed your father a favour. Time to collect.',
        'Follow the <b style="color:#ffd23f">yellow arrows</b> to her shop.',
      ],
      () => {
        this.hud.setVisible(true);
        this.closeMenu();
        // The camera behind you, looking the way you face.
        this.rig.yaw = this.player.facing + Math.PI;
        const n = this.quests.npc('rust');
        if (n) this.setNamedWaypoint(n.at.x, n.at.z, 'Mama Rust');
        this.hud.toast('Walk to Mama Rust (follow the arrows) and press E to talk.', 6000);
        this.tut.fire('newGame');
      },
      "Let's go",
    );
  }

  // ------------------------------------------------------------------ cinematics

  /**
   * Cinematics (cinematics.json; rules in systems/cinematics.js, world side in CinematicView):
   * the opening on a new game, an act starting, a quest that moves the story on, a District Boss
   * stepping up, a legendary turning up. While one plays the player is frozen, the HUD hidden and
   * the city goes on around the camera; Space, Enter or Esc skips it.
   */
  private playCinematic(def: CinematicDef, vars: Record<string, string>, key: string, then?: () => void): void {
    this.cineSeen.add(key);
    if (def.music) this.music.preload(def.music === 'intro' ? 'intro' : 'cinematic');
    this.saveDirty = true;
    this.state = 'cinematic';
    this.aiming = false;
    this.hud.setVisible(false);
    audio.silenceCar();
    this.cineThen = then ?? null;
    const p = this.player;
    // You're not in the shot (a boss intro would otherwise have you standing in front of them).
    p.model.root.visible = false;
    this.cine.play(def, cinematicsConfig as unknown as CinematicConfig, {
      scene: this.scene,
      camera: this.camera,
      models: this.creatureModels,
      groundAt: (x, z) => this.peds.groundY(x, z),
      anchor: (name) => this.cineAnchor(name),
      worldCars: () => this.vehicles.cars.filter((c) => !c.disposed && c !== p.vehicle),
      shake: (a) => this.shakeCamera(a),
    }, vars);
  }

  /** Queues a cinematic for a game event (it plays at the next quiet moment). Returns whether one was queued. */
  private queueCinematic(ev: Record<string, string | true>, vars: Record<string, string> = {}, then?: () => void, ttl = 120): boolean {
    const C = cinematicsConfig as unknown as CinematicConfig;
    const [k, v] = Object.entries(ev)[0];
    const def = cinematicFor(C, ev, this.cineSeen);
    if (!def) return false;
    // Generic ones (a boss, a legendary) play once per target.
    const key = def.once === false ? `${def.id}:${v}` : def.id;
    if (this.cineSeen.has(key) || this.cineQueue.some((q) => q.key === key)) return false;
    void k;
    this.cineQueue.push({ def, vars, key, until: this.gameTime + ttl, then });
    // Load its music while it waits for a quiet moment.
    if (def.music) this.music.preload(def.music === 'intro' ? 'intro' : 'cinematic');
    return true;
  }

  /** Plays the next queued cinematic when nothing else has the player's attention. */
  private updateCinematicQueue(): void {
    if (!this.cineQueue.length || this.state !== 'playing') return;
    this.cineQueue = this.cineQueue.filter((q) => q.until > this.gameTime);
    const p = this.player;
    const busy = p.dead || !!this.trans || this.battles.active || this.evolution.active || this.throwing || this.dialogue.isOpen || this.cityMap.isOpen || !!this.races?.active || !!this.heists?.active || this.layers.current !== 'street';
    if (busy) return;
    const q = this.cineQueue.shift();
    if (q) this.playCinematic(q.def, q.vars, q.key, q.then);
  }

  /** While a cinematic plays: the city runs around what the camera's looking at, the player waits. */
  private cineTick(dt: number): void {
    if (this.input.wasPressed('Space', 'Enter', 'Escape', 'NumpadEnter')) this.cine.skip();
    const f = this.cine.focus;
    this.colliderStream.update(dt, f.x, f.z);
    this.signals.update(dt);
    this.traffic.update(dt, f, this.camera, this.peds.obstacles(), null);
    this.accumulator += dt;
    let steps = 0;
    const car = this.player.vehicle;
    if (car) {
      car.input.throttle = 0;
      car.input.steer = 0;
      car.input.brake = 1;
      car.input.handbrake = true;
    }
    while (this.accumulator >= PHYSICS.step && steps < PHYSICS.maxSubSteps) {
      this.vehicles.prePhysics(PHYSICS.step);
      this.world.step();
      this.vehicles.postPhysics(PHYSICS.step, this.camera.position);
      this.accumulator -= PHYSICS.step;
      steps++;
    }
    if (steps === PHYSICS.maxSubSteps) this.accumulator = 0;
    this.cineAlpha = this.accumulator / PHYSICS.step;
    this.vehicles.stream(dt, f, this.camera, this.player.vehicle);
    this.peds.update(dt, f, this.camera, null);
    this.living.update(dt);
    for (const w of this.spawns.wild) if (w.inst && Math.hypot(w.x - f.x, w.z - f.z) < 70) w.inst.mixer.update(dt);
    this.raidWorld.applySize();
    if (this.cine.update(dt) === 'end' || !this.cine.active) this.endCinematic();
  }

  private endCinematic(): void {
    if (this.state !== 'cinematic') return;
    this.state = 'playing';
    this.hud.setVisible(true);
    this.cineBoss = null;
    const p = this.player;
    p.model.root.visible = true;
    this.rig.yaw = (p.vehicle ? p.vehicle.heading : p.facing) + Math.PI;
    this.clock.getDelta();
    if (!this.input.pointerLocked) this.input.requestPointerLock();
    const then = this.cineThen;
    this.cineThen = null;
    then?.();
  }

  /** Where a cinematic's anchor is right now (config anchors, or the game's own). */
  private cineAnchor(name: string): Anchor | null {
    const C = cinematicsConfig as unknown as CinematicConfig;
    const fixed = C.anchors[name];
    if (fixed) return { x: fixed[0], z: fixed[1] };
    const p = this.focus();
    switch (name) {
      case 'player':
        return { x: p.x, z: p.z, heading: this.player.facing };
      case 'mama': {
        const n = this.quests.npc('rust');
        return n ? { x: n.at.x, z: n.at.z, heading: n.heading ?? 0 } : null;
      }
      case 'chop':
        return { x: this.chopSpot.x, z: this.chopSpot.z, heading: this.chopSpot.heading };
      case 'bank': {
        const t = this.heists.targets.find((x) => x.id === 'first-empire-vault') ?? this.heists.targets[0];
        return t ? { x: t.location.plan.x, z: t.location.plan.z } : null;
      }
      case 'raid': {
        const b = this.raidWorld.boss;
        return b ? { x: b.x, z: b.z, y: b.y, heading: b.heading } : { x: p.x, z: p.z };
      }
      case 'boss': {
        const b = this.cineBoss ? this.quests.boss(this.cineBoss) : null;
        return b ? { x: b.at.x, z: b.at.z, heading: b.heading ?? 0 } : null;
      }
    }
    return null;
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.menus.showPause(true);
    audio.silenceCar();
    this.spatial?.hush();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    audio.unlock();
    this.ensureSpatial();
    this.menus.showPause(false);
    this.state = 'playing';
    this.input.requestPointerLock();
    this.clock.getDelta();
  }

  private toggleShadows(): boolean {
    const on = !this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
    });
    return on;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const maxPr = Math.min(window.devicePixelRatio, GRAPHICS.maxPixelRatio, platform.maxPixelRatio);
    if (!this.resScale || this.resScale.max !== maxPr) this.resScale = new ResolutionScaler(maxPr);
    this.renderer.setPixelRatio(this.resScale.scale);
    this.renderer.setSize(w, h);
    this.bloom?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.effects?.setViewportHeight(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  // ------------------------------------------------------------------ loop

  private frame(): void {
    const t0 = performance.now();
    this.frameBody();
    this.frameCpu = performance.now() - t0;
  }

  private frameBody(): void {
    const raw = this.clock.getDelta();
    // The quick-select wheel slows time while it's open.
    const dt = Math.min(raw, 0.1) * (this.quickWheel?.isOpen && this.state === 'playing' ? 0.3 : 1) * (this.state === 'playing' && this.player ? this.player.dodge.timeScale(this.aiming) : 1);
    this.padIn.update(Math.min(raw, 0.1), this.padContext(), { heist: !!this.heists?.active });
    // Dynamic resolution (judged on the previous frame's CPU share).
    if (this.state === 'playing' && this.resScale) {
      const q = this.resScale.frame(raw, this.frameCpu / 1000);
      if (q !== null) {
        this.env.setShadowSize(q.shadow);
        this.onResize();
      }
    }
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05;
    let alpha = 1;
    this.updateMusic(dt);
    if (this.state === 'playing') this.updateLayer(dt);

    if (this.state === 'shop' && this.input.wasPressed('Escape', 'KeyE')) this.shopMenu.close();
    if (this.state === 'starter') this.starterKeys();
    // Creature icons not made yet: one a frame on the title and starter screens (~70 ms each).
    if (this.state === 'title' || this.state === 'starter') this.icons.warmStep();
    if (this.state === 'menu') this.menuKeys();
    if (this.state === 'cinematic') this.cineTick(dt);
    else this.cine.update(dt);
    if (this.state !== 'playing') this.guide.hide();
    if (this.state === 'paused' && this.input.wasPressed('Escape', 'KeyP')) {
      this.resume();
      // Consume the key so the gameplay input below doesn't immediately pause again.
      this.input.endFrame();
    }
    if (this.state === 'playing') {
      this.handleFrameInput(dt);
      const sf = this.focus();
      this.colliderStream.update(dt, sf.x, sf.z);
      this.signals.update(dt);
      this.traffic.update(dt, this.focus(), this.camera, this.peds.obstacles(), this.player.onFoot ? this.player.position : null);
      this.updateLaw(dt);
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= PHYSICS.step && steps < PHYSICS.maxSubSteps) {
        this.physicsStep(PHYSICS.step);
        this.accumulator -= PHYSICS.step;
        steps++;
      }
      if (steps === PHYSICS.maxSubSteps) this.accumulator = 0;
      alpha = this.accumulator / PHYSICS.step;
      this.vehicles.stream(dt, this.focus(), this.camera, this.player.vehicle);
      this.updateWeapons(dt);
      this.updateWorldClock(dt);
      this.battles.update(dt, this.player.position);
      this.catcher.update(dt);
      this.evolution.update(dt);
      const p0 = this.player;
      // Gang trainers live on the street and the rooftops: none of them can see you in the sewers.
      this.trainers.update(dt, p0.position, p0.onFoot && !p0.dead && !this.battles.active && !this.evolution.active && !this.throwing && this.party.canFight && this.wanted.stars === 0 && !this.trans && this.layers.current !== 'sewer', p0.vehicle ? p0.vehicle.position.y : p0.feet.y);
      this.updateRoofTrader(dt);
      this.checkPoliceBreakUp();
      this.follower.update(dt, p0.vehicle ? p0.vehicle.position : p0.position, p0.facing, this.party.lead, !!p0.vehicle || this.battles.active || this.evolution.active || p0.dead || this.heists.active);
      this.updateChallenger(dt);
      this.clinics.update(dt);
      this.updateTuning(dt);
      this.updateRaces(dt);
      this.updateHeists(dt);
      this.updateStreetEvents(dt);
      this.updateCampaign(dt);
      this.updateCinematicQueue();
      if ((this.firstCarCheck -= dt) <= 0) {
        this.firstCarCheck = 1;
        this.keepFirstCar();
        this.autoGuide();
      }
      this.updateCityMap(dt);
      if (this.player.dead && performance.now() > this.respawnAt) this.respawn();
    }

    const listener = this.camera.position;
    if (this.state === 'cinematic') alpha = this.cineAlpha;
    this.vehicles.frame(this.state === 'playing' || this.state === 'cinematic' ? dt : 0, alpha, listener);
    this.player.render(alpha, this.state === 'playing' ? dt : 0);
    if (this.state === 'playing') {
      this.peds.update(dt, this.focus(), this.camera, this.player.vehicle);
      if (this.player.onFoot) this.peds.separateFrom(this.player.position.x, this.player.position.z, 0.65);
      this.living.update(dt);
      this.raidWorld.update(dt);
      this.gangs.update(dt);
    }
    if (this.state === 'playing') {
      this.updateNeighbourhood(dt);
      this.updateChatter(dt);
      this.hazards?.update(dt);
    }
    this.precip?.update(this.state === 'playing' ? dt : 0, this.camera.position, this.weather.params().rain, this.weather.params().snow, this.weather.params().wind, this.layers.current === 'sewer' || !!this.interior);
    this.bubbles.update(this.state === 'playing' ? dt : 0, this.camera, this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight);
    this.signalView.update(dt);
    this.shops?.update(dt);
    const seated = [...this.traffic.seated(), ...this.police.seated(), ...(this.eventWorld?.seated() ?? [])];
    this.peds.render(this.state === 'cinematic' ? seated.filter((x) => !this.cine.hides(x.car.visual)) : seated);
    this.updateCamera(dt);
    this.env.update(dt, this.focus(), this.camera);
    this.effects.update(this.state === 'playing' ? dt : 0);
    this.moveFx.update(this.state === 'playing' ? dt : 0);
    this.pond.update(this.gameTime, this.state === 'playing' ? dt : 0);
    this.docks.update(this.gameTime);
    if (this.state === 'playing') this.updateRoomPeople(dt);
    this.interior?.update?.(this.gameTime);
    if (this.state === 'playing') this.pondPlayer(dt);
    if (this.state === 'playing') this.destruction?.update(dt, this.focus());
    if (this.state === 'playing') this.updateHudAndAudio(dt);
    if (this.bloom) this.bloom.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
    if (this.tut) this.updateTutorials(dt);
    this.input.endFrame();
  }

  private focus(): THREE.Vector3 {
    return this.player.vehicle ? this.player.vehicle.position : this.player.position;
  }

  private handleFrameInput(dt = 1 / 60): void {
    const inp = this.input;
    const p = this.player;
    if (inp.wasPressed('KeyK')) audio.setEnabled(!audio.on);
    // The city map (M, or Back on a pad): while it's open, keys drive the map.
    if (this.cityMap.isOpen) {
      for (const code of ['Escape', 'KeyM', 'KeyC', 'Backspace', 'Delete', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract']) if (inp.wasPressed(code)) this.cityMap.key(code);
      return;
    }
    if (inp.wasPressed('KeyM') && !this.battles.locksPlayer && !this.evolution.active) {
      if (this.input.pointerLocked) document.exitPointerLock();
      this.cityMap.open();
      return;
    }
    if (inp.wasPressed('F8')) {
      this.fleeDebug.setEnabled(!this.fleeDebug.enabled);
      this.spawns.debugFlee = this.fleeDebug.enabled;
      this.hud.toast(`Creature steering debug ${this.fleeDebug.enabled ? 'on' : 'off'}`, 1500);
    }
    if (this.battles.locksPlayer) {
      // Turn-based battle: keys drive the menus; Esc backs out of a sub-menu before it pauses.
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Escape'])
        if (inp.wasPressed(code) && this.battles.key(code)) return;
      if (inp.wasPressed('Escape', 'KeyP')) this.pause();
      return;
    }
    if (this.evolution.active) {
      for (const code of ['KeyB', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) if (inp.wasPressed(code)) this.evolution.key(code);
      return;
    }
    if (performance.now() < this.lockedUntil || this.trans) return;
    // With pointer lock the browser consumes Esc and pointerlockchange pauses; without it, pause here.
    if (inp.wasPressed('Escape', 'KeyP')) {
      if (this.input.pointerLocked) document.exitPointerLock();
      else this.pause();
      return;
    }
    if (inp.wasPressed('Space') && p.onFoot) this.jumpQueued = true;
    // Roll (Z): a dive instead while aiming a gun. (During a heist Z is the crew's ability.)
    if (inp.wasPressed('KeyZ') && p.onFoot && !this.heists?.active) this.rollQueued = true;
    // T: the number keys switch between commanding your Streetmon and picking weapons (real-time battles).
    if (inp.wasPressed('KeyT')) {
      if (this.battles.active && this.battles.mode === 'realtime') {
        this.numKeysCommand = !this.numKeysCommand;
        this.hud.toast(this.numKeysCommand ? 'Number keys: Streetmon commands (1-4 moves, 5 swap)' : 'Number keys: weapons (T to command your Streetmon again)', 2000);
        this.tut?.action('toggleKeys');
      }
    }
    this.quickWheelInput();
    this.battles.commandKeys = this.numKeysCommand;
    const atShop = p.onFoot ? this.shops.shopAt(p.position.x, p.position.z) : null;
    if (atShop && inp.wasPressed('KeyE', 'KeyF')) {
      this.openShop();
      return;
    }
    const atClinic = p.onFoot ? this.clinics.clinicAt(p.position.x, p.position.z) : null;
    if (atClinic && inp.wasPressed('KeyE', 'KeyF')) {
      this.openClinic();
      return;
    }
    if (this.atDealer() && inp.wasPressed('KeyE', 'KeyF')) {
      this.openDealer();
      return;
    }
    const home = this.atSafehouse();
    if (home && inp.wasPressed('KeyE', 'KeyF')) {
      this.openSafehouse(home);
      return;
    }
    const inside = this.interiorUse();
    if (inside && inp.wasPressed('KeyE', 'KeyF')) {
      inside.act();
      return;
    }
    if (inp.wasPressed('KeyI') && !this.battles.active) {
      this.openTeam();
      return;
    }
    if (inp.wasPressed('KeyN') && !this.battles.active) {
      this.openDex();
      return;
    }
    if (p.onFoot && inp.wasPressed('KeyG') && !this.battles.active) this.toggleFollower();
    if (p.onFoot && !this.battles.active && inp.wasPressed('KeyV')) {
      const it = this.bag.cycleCapture();
      this.hud.toast(it ? `Throwing: ${it.name}` : 'No capture items', 1200);
    }
    if (p.onFoot && !this.battles.active && !this.throwing && inp.wasPressed('KeyC')) {
      if (p.swimming) this.hud.toast("You can't throw while you're swimming: get to the bank.", 1800);
      else this.overworldThrow();
    }
    // Challenge a wild creature you've walked up to.
    if (p.onFoot && !this.battles.active && !this.evolution.active && inp.wasPressed('KeyB')) {
      const w = this.spawns.nearest(p.position, 7);
      if (this.raidWorld.canEngage()) this.startRaidBattle();
      else if (w && this.raidWorld.isBoss(w)) this.hud.toast(this.raidWorld.active?.status === 'subdued' ? "It's subdued! Throw a capture item (C)." : 'Get closer to take it on.', 1800);
      else if (w) this.startWildBattle(w);
      else {
        const ped = this.nearestPerson(4.5);
        if (ped) this.sicOnPerson(ped);
      }
    }
    if (p.onFoot && inp.wasPressed('KeyE', 'KeyF') && this.impound.length && Math.hypot(p.position.x - this.impoundSpot.x, p.position.z - this.impoundSpot.z) < 2) {
      this.retrieveImpound();
      return;
    }
    if (p.onFoot && !this.battles.locksPlayer && !p.swimming && !this.interior) this.weaponInput();
    if (p.onFoot && !this.battles.active && inp.wasPressed('KeyE', 'KeyF')) {
      const use = this.roofUse();
      if (use) {
        use.act();
        return;
      }
    }
    // E on the Chop Shop lift lowers the car into the shop (F still gets out).
    if (p.vehicle && inp.wasPressed('KeyE') && this.atChopLift(p.vehicle)) {
      this.openChopShop(p.vehicle);
      return;
    }
    // Heists: Z (Hacker) and X (Smoke) abilities, E at the planning spot / breach point / a loot bag,
    // Backspace walks away from the job.
    if (this.heistKeys(p)) return;
    // Street events: E next to a supply crate starts prying it open.
    if (p.onFoot && !p.dead && inp.wasPressed('KeyE', 'KeyF') && this.eventWorld.interact()) return;
    // The campaign: E next to a mission giver (M) or a boss.
    if (p.onFoot && !p.dead && inp.wasPressed('KeyE') && this.campaignTalk()) return;
    // Street races: Y takes an offer, Backspace turns it down or quits a race.
    if (inp.wasPressed('KeyY') && this.races.state === 'PROMPT' && !this.races.offer?.accepted) {
      if (this.races.accept()) this.hud.toast(`Get to the start line of the ${this.races.offer?.track.name}. Stop on the line to start.`, 3500);
      return;
    }
    if (inp.wasPressed('Backspace') && (this.races.state === 'PROMPT' || this.races.active)) {
      const racing = this.races.active;
      this.races.abort();
      this.hud.toast(racing ? 'You pulled out of the race.' : 'Race declined.', 2000);
      return;
    }
    if (inp.wasPressed('KeyE', 'KeyF') && !p.dead) {
      if (p.vehicle) this.exitVehicle();
      else if (p.swimming) this.hud.toast('Swim to the edge to climb out (Space).', 1600);
      else {
        const car = this.interior ? null : this.enterableCar();
        if (car) this.enterVehicle(car);
        else if (!this.interior) {
          // Nobody's car to get into: stop the passer-by next to you for a word.
          const ped = this.nearestPerson(2.2);
          if (ped && ped.role === 'civ' && this.wanted.stars < 3) this.talkToPed(ped);
        }
      }
    }
    const car = p.vehicle;
    if (car) {
      if (inp.wasPressed('KeyR') && (car.flippedTime > 0.8 || Math.abs(car.speed) < 2)) {
        const up = this.tmp.set(0, 1, 0).applyQuaternion(car.quaternion).y;
        if (up < 0.6) car.flipUpright();
      }
      if (inp.wasPressed('KeyG') && (car.spec.style === 'police' || car.spec.style === 'ambulance')) car.sirenOn = !car.sirenOn;
      if (inp.wasPressed('KeyV')) this.hud.toast(`Camera: ${{ chase: 'chase', far: 'far chase', hood: 'bonnet' }[this.rig.cycleCarView()]}`, 1200);
      // Nitrous (a bought part): hold Shift (RB on a pad).
      car.boost = car.nitro.capacity > 0 && inp.isDown('ShiftLeft', 'ShiftRight');
      // A tuned car's abilities (keys and gamepad); the Sonic Bass Horn takes over the horn.
      const tid = car.tuneId;
      if (tid && this.tuning.isTuned(tid)) {
        // Pad buttons arrive as their keys (src/core/Gamepad.ts), so no raw gamepad here.
        this.tuning.handleInput(tid, { isDown: (code) => inp.isDown(code), gamepad: null });
      }
      audio.setHorn(inp.isDown('KeyH') && !(tid && this.tuning.hasAbility(tid, 'sonicBassHorn')));
    }
    if (!this.weaponHud.wheelOpen && !this.quickWheel.isOpen) {
      const scoped = this.aiming && !!this.weapons.current.zoomFov;
      const look = inp.takeLook();
      this.rig.addMouse(look.dx, look.dy, !!car, scoped ? 0.25 : this.aiming ? 0.7 : 1);
      if (platform.touch && !car) this.touchAimAssist(dt);
    }
  }

  /** Phones: while aiming or firing a gun, ease the view onto the target nearest the crosshair. */
  private touchAimAssist(dt: number): void {
    const p = this.player;
    if (!p.onFoot || !isRanged(this.weapons.current) || !(this.aiming || this.input.mouseLeft) || this.battles.active) return;
    const heading = wrapAngle(this.rig.yaw + Math.PI);
    const targets: AssistTarget[] = [];
    for (const q of this.peds.peds) {
      if (q.state === 'dead' || q.state === 'down' || q.state === 'fly') continue;
      if (Math.abs(q.x - p.position.x) > ASSIST.range || Math.abs(q.z - p.position.z) > ASSIST.range) continue;
      targets.push({ x: q.x, z: q.z, threat: q.role === 'cop' && this.wanted.stars > 0 });
    }
    const pick = pickAssist({ x: p.position.x, z: p.position.z, heading }, targets);
    if (pick) this.rig.yaw = wrapAngle(this.rig.yaw + assistTurn(pick.delta, dt, this.aiming));
  }

  // ------------------------------------------------------------------ weapons

  private weaponInput(): void {
    const inp = this.input;
    const inv = this.weapons.inventory;
    const hud = this.weaponHud;
    // Hold Tab for the weapon wheel; mouse picks, release selects.
    if (inp.isDown('Tab')) {
      if (!hud.wheelOpen) hud.openWheel(inv);
      else hud.moveWheel(inp.mouseDX, inp.mouseDY, inv);
    } else if (hud.wheelOpen) {
      const slot = hud.closeWheel();
      const inSlot = inv.owned.filter((o) => weapon(o.id).slot === slot);
      const pick = inSlot.find((o) => o.id === inv.currentId) ?? inSlot[0];
      if (pick) inv.select(pick.id);
    }
    const digits = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
    // In a real-time skirmish the number keys command your Streetmon, unless T switched them to weapons.
    if (!this.battles.active || !this.numKeysCommand)
      digits.forEach((code, slot) => {
        if (inp.wasPressed(code)) inv.selectSlot(slot);
      });
    if (inp.wasPressed('KeyQ')) inv.swapToPrevious();
    if (inp.wheel !== 0 && !hud.wheelOpen) inv.cycle(inp.wheel > 0 ? 1 : -1);
    this.aiming = inp.mouseRight && !hud.wheelOpen;
    // Aiming or attacking turns you toward the crosshair; otherwise you face where you walk.
    const attacking = inp.mouseLeft && !hud.wheelOpen;
    this.player.facingOverride = this.aiming || attacking ? this.rig.viewHeading : null;
  }

  private updateWeapons(dt: number): void {
    const p = this.player;
    const inp = this.input;
    this.gunfireCd -= dt;
    // No shooting mid-roll; a dive is for shooting (until you land and get up).
    const tumbling = !!p.dodge.active && (p.dodge.active.kind === 'roll' || p.dodge.recovering);
    const active = p.onFoot && !p.isKnockedDown && !p.swimming && !this.interior && !this.battles.locksPlayer && !this.evolution.active && !this.throwing && !tumbling;
    if (!active) {
      this.aiming = false;
      p.facingOverride = null;
      if (this.weaponHud.wheelOpen) this.weaponHud.closeWheel();
    }
    this.weapons.update(dt, {
      aiming: this.aiming,
      trigger: active && inp.mouseLeft && !this.weaponHud.wheelOpen,
      reload: active && inp.wasPressed('KeyR'),
      moving: Math.hypot(p.velocity.x, p.velocity.z) > 0.5,
      active,
    });
    this.weapons.updatePickups(dt, p.onFoot);
  }

  // ------------------------------------------------------------------ day/night and wild creatures

  private updateWorldClock(dt: number): void {
    this.gameTime += dt;
    this.playTime += dt;
    this.autosaveTimer -= dt;
    // Routine saves every 45 s, changes at most every 4 s (packing a save takes a few ms), milestones at once.
    const due = this.autosaveTimer <= 0 || (this.saveDirty && (!!this.autosaveNote || this.gameTime - this.lastSaveAt > 4));
    if (due && !this.battles.active && !this.evolution.active && !this.throwing && !this.player.dead) {
      this.autosaveTimer = 45;
      this.saveDirty = false;
      this.autosave();
    }
    const before = this.hour;
    this.hour = (this.hour + dt * DAY.hoursPerSecond) % 24;
    if (this.hour < before) this.dayCount++;
    this.env.setTime(this.hour);
    if (this.weather.update(dt * DAY.hoursPerSecond, dt)) {
      const w = this.weather.dominant;
      this.hud.toast(w === 'rain' ? 'It starts to rain: roads get slick, Sludge types come out.' : w === 'storm' ? 'A thunderstorm rolls in: Wire types love it. Watch the roads.' : w === 'fog' ? 'Fog comes in off the river: the police can\'t see as far.' : w === 'snow' ? 'Snow! Slippery roads.' : w === 'clear' ? 'The sky clears.' : 'The clouds roll in.', 3200);
      this.saveDirty = true;
    }
    this.applyWeather(dt);
    // Skylights glow after dusk until dawn.
    const h = this.hour;
    this.roofView.setNight(h >= 19 || h < 5.5 ? 1 : h >= 17.5 ? (h - 17.5) / 1.5 : h < 7 ? (7 - h) / 1.5 : 0);
    const phase = phaseAt(this.hour);
    if (phase !== this.lastPhase) {
      if (this.lastPhase) this.hud.toast(phase === 'night' ? 'Night falls: rarer Streetmon come out' : phase === 'day' ? 'Morning' : 'The light is changing', 2500);
      this.lastPhase = phase;
    }
    this.clockEl.textContent = `${clockText(this.hour)}  ${phase === 'day' ? 'Day' : phase === 'dusk' ? 'Dusk' : 'Night'} · ${this.weather.label}`;
    const cap = this.bag.currentCapture();
    const fxLine = effectsLine(this.itemFx);
    const capText = (this.party.members.length ? (cap ? `${cap.name} x${this.bag.count(cap.id)}${platform.touch ? '  ·  THROW' : '  ·  C throw  V switch'}` : 'No capture items') : '') + (fxLine ? `\n${fxLine}` : '');
    if (this.captureEl.textContent !== capText) this.captureEl.textContent = capText;
    this.partyBar.update(this.party, !this.battles.locksPlayer);
    const mouse = this.input.pointerLocked ? null : this.input.mouseX >= 0 ? { x: this.input.mouseX, y: this.input.mouseY } : null;
    this.dmgNums.update(dt, this.camera);
    if (this.battles.locksPlayer && !mouse) this.tooltip.hide();
    else this.tooltip.update(this.camera, mouse, this.inspectables());
    // Anything you can spot (minimap range) counts as seen in the dex.
    this.seenTimer -= dt;
    if (this.seenTimer <= 0) {
      this.seenTimer = 0.5;
      const pp = this.player.position;
      for (const w of this.spawns.wild) if (!w.removed && !w.inPod && Math.hypot(w.x - pp.x, w.z - pp.z) < 30) this.markSeen(w.spec.id);
    }
    const p = this.player;
    const inp = this.input;
    if (this.wanted.stars === 0 && !this.wanted.searching) {
      this.creatureCrime = false;
      this.crimeCreatures.clear();
      this.tranqHits = 0;
      this.arrestBattleUsed = false;
    }
    const moving = Math.hypot(p.velocity.x, p.velocity.z) > 0.5;
    const stealth = p.vehicle ? 'car' : !moving || inp.isDown('AltLeft', 'AltRight') ? 'walk' : inp.isDown('ShiftLeft', 'ShiftRight') ? 'sprint' : 'normal';
    tickEffects(this.itemFx, dt);
    const lead = this.party.lead;
    Object.assign(this.spawns, spawnModifiers(this.itemFx, lead?.level ?? 0));
    this.spawns.actsDone = this.quests ? this.quests.actsCompleted.size : 0;
    this.spawns.strongest = this.party.members.reduce((m, c) => Math.max(m, c.level), 0);
    catchSituation.night = phase === 'night' || this.hour < 6 || this.hour >= 20;
    catchSituation.water = p.waterState !== 'dry' || (this.battles.active && this.battleInWater);
    catchSituation.leadLevel = lead?.level ?? 0;
    this.spawns.update(dt, {
      player: this.focus(),
      stealth,
      inCar: !!p.vehicle,
      camera: this.camera,
      time: phase,
      now: this.gameTime,
      busy: p.dead || this.state !== 'playing' || !!this.trans || this.battles.active || !!this.interior || !!this.gangs?.inHideout,
      biome: this.layers.current,
      playerY: p.vehicle ? p.vehicle.position.y : p.feet.y,
    });
    this.fleeDebug.update(this.spawns.wild, this.focus());
  }

  /** An aggressive wild creature squares up to the player. (Battles are wired in the next step.) */
  private onWildEngage(w: WildCreature): void {
    if (this.battles.active || this.evolution.active || this.player.vehicle || this.player.dead) {
      this.spawns.release(w, 20, this.gameTime);
      return;
    }
    if (!this.party.canFight) {
      this.hud.toast(`A wild ${w.spec.name} squares up... but you have no Streetmon able to fight! Run!`, 3000);
      this.spawns.release(w, 30, this.gameTime);
      return;
    }
    this.startWildBattle(w);
  }

  // ------------------------------------------------------------------ battles

  startWildBattle(w: WildCreature): void {
    if (this.battles.active || this.evolution.active || !this.party.canFight || w.creature.hp <= 0) return;
    // In the water (or the foe is): the fight stays on the water. Your Streetmon swim, hover or
    // ride a life raft (see waterRide); you tread water.
    const p0 = this.player;
    this.battleInWater = !this.interior && (p0.waterState !== 'dry' || w.biome === 'pond' || !!this.waterAt(w.x, w.z));
    // Whatever was going on with it (an NPC hunt, a territory fight, a chase) is over.
    this.living?.onPlayerBattle(w);
    w.chase = undefined;
    w.state = 'engaged';
    w.pinned = true;
    this.aiming = false;
    const toFoe = Math.atan2(-(w.z - this.player.position.z), w.x - this.player.position.x);
    this.battles.mode = BATTLE.mode;
    // Turn-based: stand and face the fight. Real-time: you stay free to move; the camera swings round to the fight.
    if (BATTLE.mode === 'turn') this.player.facingOverride = toFoe;
    else this.rig.yaw = toFoe - Math.PI;
    if (BATTLE.mode === 'turn' && this.input.pointerLocked) document.exitPointerLock();
    this.battleLook.copy(this.player.position);
    this.markSeen(w.spec.id);
    this.battles.startWild(this.party, w, this.player.position);
    if (BATTLE.mode === 'turn') this.hud.setVisible(false);
  }

  private onBattleNoise(x: number, z: number, r: number, side: 0 | 1, user: Creature): void {
    this.peds.alarm(x, z, r * 0.5);
    this.spawns.scare(x, z, r * 0.5, true);
    // Your Gun-type firing in front of the police is a crime.
    if (side === 0 && this.police.anyWithin(x, z, 45)) {
      this.reportCrime('gunfire', x, z, 'cop');
      this.markCreatureCrime(user);
    }
  }

  private onBattleEnd(r: BattleResult): void {
    this.saveDirty = true;
    this.battleInWater = false;
    this.numKeysCommand = true; // the next battle starts with the number keys on commands
    this.hud.setVisible(true);
    this.player.facingOverride = null;
    const w = r.wild;
    if (w) w.pinned = false;
    if (r.kind === 'raid') {
      if (w) w.state = 'idle';
      this.raidWorld.battleEnded(r.outcome);
      if (r.outcome === 'lose') this.blackOut();
      else if (r.outcome === 'win') this.tut.fire('raidSubdued');
    } else if (r.kind === 'police') {
      if (r.outcome === 'win') {
        const p = this.player.position;
        this.police.resetArrest();
        const n = this.police.stunOfficers(p.x, p.z, 30, 6);
        this.hud.toast(`You fought free!${n ? ` ${n} officer${n > 1 ? 's' : ''} knocked down.` : ''} Run!`, 3500);
      } else {
        this.busted();
        this.party.healAll(magazine);
      }
    } else if (r.kind === 'npc' && this.campaignBattle) {
      const id = this.campaignBattle;
      this.campaignBattle = null;
      const b = this.quests.boss(id);
      const won = r.outcome === 'win';
      if (b) this.hud.toast(`${b.name}: "${won ? b.win : b.lose}"`, 5000);
      this.quests.notify({ type: 'boss', boss: id, won }, this.questCtx());
      if (won) this.hud.showBig('BOSS DEFEATED', '#4be37a', 3000);
      else if (r.outcome === 'lose') this.blackOut();
    } else if (r.kind === 'npc' && this.questBattle) {
      const id = this.questBattle;
      this.questBattle = null;
      this.questBattleCd = 10;
      if (r.outcome === 'win') this.advance(id);
      else if (r.outcome === 'lose') this.blackOut();
    } else if (r.kind === 'npc' && this.gangs.engaged) {
      const won = r.outcome === 'win';
      this.gangs.battleEnded(won);
      if (r.outcome === 'lose') this.blackOut();
    } else if (r.kind === 'npc') {
      const c = this.npcPending;
      this.npcPending = null;
      if (c && c.ped.state === 'cop' && c.ped.role === 'civ') c.ped.state = 'walk';
      if (r.outcome === 'win') {
        const prize = 40 + Math.floor(Math.random() * 30) + (c ? c.team.reduce((a, t) => a + t.level, 0) * 4 : 0);
        this.money += prize;
        audio.cash();
        this.hud.toast(`${c?.name ?? 'They'}: "Good fight!"  (+$${prize})`, 3000);
      } else if (r.outcome === 'lose') this.blackOut();
    } else if (r.trainer) {
      const t = r.trainer;
      if (r.outcome === 'win') {
        this.money += t.spec.reward;
        audio.cash();
        this.trainers.markBeaten(t);
        this.hud.toast(`${t.spec.name}: "${t.spec.lose}"  (+$${t.spec.reward})`, 4500);
      } else {
        this.trainers.release(t, 90);
        if (r.outcome === 'lose') this.blackOut();
      }
    } else if (r.ped) {
      const ped = r.ped;
      if (ped.state === 'cop' && ped.role === 'civ') this.peds.flee(ped, this.player.position.x, this.player.position.z);
      if (r.outcome === 'lose') this.blackOut();
    } else if (r.outcome === 'caught' && w) {
      this.spawns.remove(w);
      this.addCaught(w.creature, w.district);
    } else if (r.outcome === 'win') {
      if (w) this.spawns.remove(w);
      const cash = w ? BATTLE.wildWinPerLevel * w.creature.level : 0;
      this.money += cash;
      this.hud.toast(`You won! The wild ${w?.spec.name ?? 'creature'} limps away.${cash ? ` (+$${cash})` : ''}`, 3000);
    } else if (r.outcome === 'ran' || r.outcome === 'aborted') {
      if (w) this.spawns.release(w, 30, this.gameTime);
    } else if (r.outcome === 'lose') {
      if (w) this.spawns.release(w, 60, this.gameTime);
      this.blackOut();
    }
    this.evoQueue.push(...r.evolutions);
    if (this.evoQueue.length) window.setTimeout(() => this.nextEvolution(), 600);
    else if (this.state === 'playing' && !this.input.pointerLocked) this.input.requestPointerLock();
  }

  // ------------------------------------------------------------------ levelling and evolution

  /** XP for every foe beaten (or caught), split between the creatures that fought it. */
  private award(b: Battle, outcome: string): ProgressEvent[] {
    const out: ProgressEvent[] = [];
    const ctx = { timeOfDay: phaseAt(this.hour), district: districtAt(this.layout, this.player.position.x, this.player.position.z) };
    const beaten = [...b.defeated];
    if (outcome === 'caught') {
      const caught = b.sides[1].active.find((a) => !b.defeated.some((d) => d.creature === a.creature));
      if (caught) beaten.push({ creature: caught.creature, by: b.sides[0].active.filter((a) => !a.ally).map((a) => a.creature) });
    }
    const trainer = !b.opts.wild;
    for (const d of beaten) {
      const who = d.by.filter((c) => c.hp > 0 && this.party.members.includes(c));
      if (!who.length) continue;
      for (const c of who) out.push(...gainXp(c, Math.max(1, Math.floor(xpYield(d.creature, c.level, trainer) / who.length)), ctx));
      // The rest of the team (conscious, didn't fight) gets a share too: one line for all of them.
      const bench = this.party.members.filter((c) => c.hp > 0 && !who.includes(c));
      let total = 0;
      const benchEv: ProgressEvent[] = [];
      for (const c of bench) {
        const ev = gainXp(c, Math.max(1, Math.floor(xpYield(d.creature, c.level, trainer) * BENCH_SHARE)), ctx);
        for (const e of ev) {
          if (e.kind === 'xp') total += e.amount;
          else benchEv.push(e);
        }
      }
      if (total > 0) out.push({ kind: 'teamXp', creature: bench[0], count: bench.length, amount: total }, ...benchEv);
    }
    return out;
  }

  private nextEvolution(): void {
    if (this.evolution.active || this.battles.active) return;
    const e = this.evoQueue.shift();
    if (!e) {
      if (this.state === 'playing' && !this.input.pointerLocked) this.input.requestPointerLock();
      return;
    }
    if (!this.party.members.includes(e.creature) && !this.party.stash.includes(e.creature)) return this.nextEvolution();
    if (this.input.pointerLocked) document.exitPointerLock();
    this.hud.setVisible(false);
    const facing = this.clearDirection();
    this.evoLook.copy(this.player.position);
    const fromId = e.creature.speciesId;
    this.tut.fire('evolution');
    this.evolution.start(e.creature, e.to, this.player.position.clone(), facing, (evolved) => {
      this.hud.setVisible(true);
      this.saveDirty = true;
      if (evolved) {
        if (e.item) this.bag.take(e.item);
        this.dex.evolved.add(fromId);
        this.dex.evolved.add(e.to);
        this.markSeen(e.to);
        const isNew = !this.dex.caught.has(e.to);
        this.dex.caught.add(e.to);
        if (isNew) this.hud.toast('New dex entry!', 2000);
      }
      this.nextEvolution();
    });
  }

  /** A direction from the player with open sidewalk and no cars, for staging scenes. */
  private clearDirection(): THREE.Vector3 {
    const p = this.player.position;
    const cam = new THREE.Vector3();
    this.camera.getWorldDirection(cam);
    const base = Math.atan2(cam.z, cam.x);
    const carNear = (x: number, z: number): boolean => this.vehicles.cars.some((c) => !c.disposed && Math.hypot(c.position.x - x, c.position.z - z) < 3.2);
    const ok = (x: number, z: number): boolean => !this.peds.blocked(x, z) && this.peds.groundY(x, z) > 0.1 && !carNear(x, z);
    for (let i = 0; i < 12; i++) {
      const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
      const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const right = new THREE.Vector3(d.z, 0, -d.x);
      const sx = p.x + d.x * 2.6;
      const sz = p.z + d.z * 2.6;
      const cx = p.x + right.x * 1.6 - d.x * 0.6;
      const cz = p.z + right.z * 1.6 - d.z * 0.6;
      if (ok(sx, sz) && ok(p.x + d.x * 1.3, p.z + d.z * 1.3) && !this.peds.blocked(cx, cz) && !carNear(cx, cz)) return d;
    }
    return cam.setY(0).normalize();
  }

  /** Team screen: use an evolution item on a creature. */
  private useEvolutionItem(c: Creature, itemId: string, to: string): void {
    this.team.close();
    this.evoQueue.push({ creature: c, to, item: itemId });
    window.setTimeout(() => this.nextEvolution(), 300);
  }

  /** Lost a fight with no creature left standing: busted if the police want you, otherwise you come round at a clinic. */
  private blackOut(): void {
    if (this.wanted.stars > 0) {
      this.hud.toast('Your Streetmon are down and the police are on you...', 2500);
      this.busted();
      this.party.healAll(magazine);
      return;
    }
    this.hud.showBig('BLACKED OUT', '#8f7cff', 3000);
    this.tut.fire('blackout');
    this.lockedUntil = performance.now() + 3000;
    window.setTimeout(() => {
      const c = this.clinics.nearest(this.player.position.x, this.player.position.z);
      this.player.teleport(c.x, 0.3, c.z + 1.2);
      this.party.healAll(magazine);
      const fee = Math.min(this.money, BATTLE.blackoutFee);
      this.money -= fee;
      this.hud.toast(`You came round at the ${CLINIC_NAME}. Your Streetmon were patched up${fee ? ` ($${fee})` : ''}.`, 4000);
    }, 2600);
  }

  private clinicFee(): number {
    return BATTLE.clinicFee.base + BATTLE.clinicFee.perFainted * this.party.fainted;
  }

  private useClinic(): string {
    if (!this.party.members.length) return 'No Streetmon? Come back when you have one.';
    if (!this.party.hurt) return 'Your Streetmon are already in good shape.';
    const fee = this.clinicFee();
    const paid = Math.min(this.money, fee);
    this.money -= paid;
    this.party.healAll(magazine);
    audio.cash();
    return paid < fee ? `Healed. You were short, so they took what you had ($${paid}).` : `Your team is fully healed and reloaded ($${fee}).`;
  }

  // ------------------------------------------------------------------ catching, team, clinic

  /** A caught creature joins the party (or the stash if the party is full). */
  private addCaught(c: Creature, district: string): void {
    for (const q of COMMUNITY.quests) {
      const st = currentStep(this.progress.quests, q.id);
      if (st?.type === 'catch' && st.species === c.speciesId && !this.questLater.some((x) => x.id === q.id)) this.questLater.push({ id: q.id, at: this.gameTime + 1.2 });
    }
    c.status = 'none';
    c.origin = { district, level: c.level, at: Date.now() };
    if (district !== 'legendary') this.quests?.notify({ type: 'catch', species: c.speciesId, types: [...species(c.speciesId).types], level: c.level, district }, this.questCtx());
    const where = this.party.add(c);
    this.saveDirty = true;
    this.markSeen(c.speciesId);
    const isNew = !this.dex.caught.has(c.speciesId);
    this.dex.caught.add(c.speciesId);
    this.autosaveFor(isNew ? `New Streetmon: ${species(c.speciesId).name}` : `Caught ${displayName(c)}`);
    this.hud.toast(`${displayName(c)} ${where === 'party' ? 'joined your party' : 'went to the stash (party full)'}!${isNew ? ' New dex entry.' : ''}`, 3500);
    this.tut.fire('caught');
    if (where !== 'party') this.tut.fire('stashed');
  }

  /** The police don't like you throwing things around when they're after you. */
  private lawSeesThrow(): void {
    const p = this.player.position;
    if (this.wanted.stars > 0 && this.police.anyWithin(p.x, p.z, 45)) this.reportCrime('throwing', p.x, p.z, 'cop');
  }

  /** C on foot: throw the selected capture item at the wild creature you're facing. */
  /** Which pad map applies right now (src/core/Gamepad.ts). */
  private padContext(): PadContext {
    if (this.state !== 'playing') return 'ui';
    if (this.cityMap?.isOpen) return 'map';
    if (this.battles?.locksPlayer || this.evolution?.active || this.dialogue?.isOpen) return 'ui';
    if (this.battles?.active) return 'battle';
    return this.player?.vehicle ? 'car' : 'foot';
  }

  /** Hold T (LB on a pad) for the quick-select wheel; let go to pick. Not in fights. */
  private quickWheelInput(): void {
    const inp = this.input;
    const p = this.player;
    const can = !this.battles.active && !this.evolution.active && !p.dead && !this.throwing && !this.weaponHud.wheelOpen;
    const held = inp.isDown('KeyT') && can;
    const W = this.quickWheel;
    if (held && !W.isOpen) {
      W.open(this.quickEntries());
      this.tut?.action('quickWheel');
    } else if (W.isOpen && held) {
      W.pointBy(inp.mouseDX, inp.mouseDY);
      const r = this.padIn.lookNow;
      const t = inp.stick;
      if (Math.hypot(r.x, r.y) > 0.5) W.pointAt(r.x, r.y);
      else if (t && Math.hypot(t.x, t.y) > 0.5) W.pointAt(t.x, -t.y);
    } else if (W.isOpen) {
      W.close(!can);
    }
  }

  private quickEntries(): WheelEntry[] {
    const out: WheelEntry[] = this.party.members.map((c, i) => ({
      kind: 'mon' as const,
      key: String(i),
      label: displayName(c),
      sub: c.hp <= 0 ? `Fainted · Lv ${c.level}` : `Lv ${c.level} · ${c.hp}/${maxHpOf(c)} HP`,
      icon: this.icons.img(c.speciesId, !!c.shiny, 'qw-img'),
      disabled: c.hp <= 0,
      current: i === 0,
    }));
    const sel = this.bag.currentCapture()?.id;
    for (const e of this.bag.captures()) out.push({ kind: 'item', key: e.item.id, label: e.item.name, sub: `×${e.count}${e.item.id === sel ? ' · selected' : ''}`, icon: `<span class="qw-emoji">${captureGlyph(e.item.id)}</span>`, current: e.item.id === sel });
    return out;
  }

  private quickPick(e: WheelEntry): void {
    if (e.kind === 'mon') {
      const i = Number(e.key);
      const c = this.party.members[i];
      if (!c || i === 0) return;
      this.party.makeLead(i);
      this.saveDirty = true;
      audio.ui();
      this.hud.toast(`${displayName(c)} takes the lead.`, 1600);
      return;
    }
    this.bag.selectedCapture = e.key;
    if (this.player.dead || this.throwing || this.battles.active) return;
    this.overworldThrow();
  }

  /**
   * Throws the selected capture item at the wild Streetmon in front of you. From a car (the
   * quick-select wheel) it goes out of the window at the nearest one, wider and further.
   */
  private overworldThrow(): void {
    const it = this.bag.currentCapture();
    if (!it) {
      this.hud.toast('No capture items. Buy Cuffs, Crates or Nets at a Corner Clinic.', 2500);
      return;
    }
    const car = this.player.vehicle;
    const p = car ? car.position.clone().setY(car.position.y + 0.8) : this.player.position;
    const vh = this.rig.viewHeading;
    const fx = Math.cos(vh);
    const fz = -Math.sin(vh);
    const reach = car ? 26 : 16;
    const cone = car ? 1.25 : 0.45;
    let best: WildCreature | null = null;
    let bestScore = Infinity;
    for (const w of this.spawns.wild) {
      if (w.removed || w.pinned) continue;
      const dx = w.x - p.x;
      const dz = w.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / Math.max(0.01, d))));
      if (ang > cone && d > (car ? 6 : 3)) continue;
      const score = d + ang * 10;
      if (score < bestScore) {
        bestScore = score;
        best = w;
      }
    }
    if (!best || !best.inst) {
      this.hud.toast(car ? 'No wild Streetmon close enough to throw at.' : 'No wild Streetmon in front of you to throw at.', 1800);
      return;
    }
    const w = best;
    if ((w.alt ?? 0) > 3.5) {
      this.hud.toast(`The ${w.spec.name} is flying too high to reach. Get close and quiet and it'll come down.`, 2200);
      return;
    }
    const raidMult = this.raidWorld.catchMultiplier(w);
    if (raidMult === 0) {
      this.hud.toast(`${w.spec.name} is far too strong to catch now. Beat it first (B)!`, 2500);
      return;
    }
    this.bag.take(it.id);
    this.lawSeesThrow();
    this.markSeen(w.spec.id);
    const roll = this.pityRoll(w.creature, it, false, raidMult > 1 ? catchChance(w.creature, it, false) * (raidMult - 1) : 0);
    w.pinned = true;
    this.throwing = true;
    if (!car) this.player.facingOverride = Math.atan2(-(w.z - p.z), w.x - p.x);
    this.catcher.play(
      it.id,
      p.clone().setY(p.y + 0.6),
      { pos: new THREE.Vector3(w.x, w.y + (w.alt ?? 0), w.z), height: w.spec.model.height, root: w.inst?.root ?? null },
      w.y,
      roll,
      (caught) => {
        this.throwing = false;
        this.player.facingOverride = null;
        w.pinned = false;
        if (caught && this.raidWorld.isBoss(w)) {
          const c = this.raidWorld.caught(w);
          if (c) this.addCaught(c, w.district);
        } else if (caught) {
          this.hud.toast(`Gotcha! The wild ${w.spec.name} was caught!`, 2500);
          this.spawns.remove(w);
          this.addCaught(w.creature, w.district);
        } else if (this.raidWorld.isBoss(w)) {
          this.hud.toast(`${w.spec.name} shrugged it off!${roll.note ? ` ${roll.note}` : ' Throw again, quick!'}`, 2200);
        } else if (w.temperament === 'aggro' && this.party.canFight && !this.player.vehicle) {
          this.hud.toast(`The ${w.spec.name} broke free, and it's angry!${roll.note ? ` ${roll.note}` : ''}`, roll.note ? 4000 : 2200);
          this.startWildBattle(w);
        } else {
          this.hud.toast(`The ${w.spec.name} broke free and ran!${roll.note ? ` ${roll.note}` : ''}`, roll.note ? 4000 : 2200);
          this.spawns.startle(w, p.x, p.z);
        }
      },
    );
  }

  /** Marks a species seen, remembering where and when it was first seen. */
  private markSeen(id: string): void {
    if (this.dex.seen.has(id)) return;
    this.dex.seen.add(id);
    const p = this.player.position;
    const biome = this.layers.current;
    const district = biome === 'sewer' ? (this.mazeAt(p.x, p.z)?.district ?? '') : districtAt(this.layout, p.x, p.z);
    this.dex.firstSeen[id] = { biome, district, at: Date.now() };
  }

  /** Pity id of a creature: wild ones by their spawn id. */
  private catchUid(c: Creature): string {
    const w = this.spawns.wild.find((x) => x.creature === c);
    return w ? `w-${w.id}` : `c-${c.speciesId}-${c.level}`;
  }

  /** Rolls a throw with soft pity, then pays out any pity compensation. */
  private pityRoll(c: Creature, it: CaptureItem, inBattle: boolean, extra = 0): CatchRoll {
    const uid = this.catchUid(c);
    const roll = rollCatch(c, it, inBattle, Math.random, softBonus(this.progress.pity, uid) + extra);
    const o = recordThrow(this.progress.pity, uid, it.id, c.level, roll.caught);
    this.progress.pity = o.state;
    if (o.refund) this.bag.add(o.refund, 1);
    if (o.bonus) this.bag.add(o.bonus, 1);
    if (o.cash) this.money += o.cash;
    const note = pityMessage(o, (id) => itemSpec(id).name);
    if (note) roll.note = note;
    this.saveDirty = true;
    return roll;
  }

  private openTeam(): void {
    if (!this.party.members.length) {
      this.hud.toast('You have no Streetmon yet.', 1500);
      return;
    }
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    audio.silenceCar();
    this.team.open(() => this.closeMenu());
  }

  private openClinic(): void {
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    // The clinic sells the everyday things; the black market, the deli and the garage the rest.
    const elsewhere = new Set(['proteinShake', 'rabbitFoot', 'burner', 'repairKit', 'lockpick']);
    this.clinicMenu.open({
      captureLocked: this.captureLock(),
      stock: [...DATA.items.values()].filter((it) => it.price > 0 && !elsewhere.has(it.id)).map((it) => ({ id: it.id, price: it.price })),
      bag: this.bag,
      money: () => this.money,
      spend: (n) => {
        if (this.money < n) return false;
        this.money -= n;
        audio.cash();
        return true;
      },
      healFee: () => (this.party.members.length && this.party.hurt ? this.clinicFee() : 0),
      heal: () => this.useClinic(),
      onClose: () => this.closeMenu(),
      onTeam: () => this.openTeam(),
    });
  }

  /** Before Mama Rust's welcome nobody sells you cuffs: she hands out the first ones. */
  private captureLock(): string | undefined {
    const s = this.quests?.status(STARTER_QUEST);
    return s === 'available' || s === 'locked' ? 'Cuffs? Not for walk-ins. Go see Mama Rust at the Chop Shop first.' : undefined;
  }

  private openDex(): void {
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    audio.silenceCar();
    this.dexScreen.open(this.dex, () => this.closeMenu());
  }

  // ------------------------------------------------------------------ saving

  private buildSave(): SaveData {
    const p = this.player.position;
    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      money: this.money,
      hour: this.hour,
      // Saved inside a building: you load up at its door.
      player: this.player.dead ? null : this.interior ? { x: this.interior.spot.x, z: this.interior.spot.z, y: 0.15 } : { x: p.x, z: p.z, y: p.y },
      weapons: this.weapons.inventory.serialize(),
      bag: this.bag.serialize(),
      party: this.party.members.map(creatureToJson),
      stash: this.party.stash.map(creatureToJson),
      impound: this.impound.map(creatureToJson),
      dex: { seen: [...this.dex.seen], caught: [...this.dex.caught], evolved: [...this.dex.evolved], firstSeen: { ...this.dex.firstSeen } },
      trainersBeaten: [...this.trainers.beaten],
      battleMode: BATTLE.mode,
      battleModeChosen: this.battleModeChosen,
      playTime: this.playTime,
      ...structuredClone(this.progress),
      garage: this.garageSave(),
      raceRecords: this.races.serialize().records,
      safehouses: structuredClone(this.safehouses),
      heists: this.heists.serialize(),
      streetEvents: this.streetEvents.serialize(),
      campaign: this.quests.serialize(),
      tutorials: this.tut.serialize(),
      raids: this.raidWorld.raids.save(),
      cinematics: [...this.cineSeen],
      look: { ...this.playerLook },
      world: { civic: this.civic, gangs: structuredClone(this.gangs.state), weather: this.weather.serialize() },
      map: { waypoint: this.cityMap.waypoint ? { ...this.cityMap.waypoint } : null, hidden: [...this.cityMap.hidden] },
    };
  }

  private applySave(d: SaveData): void {
    this.money = d.money;
    this.safehouses = sanitizeSafehouses(d.safehouses, this.safeSpots);
    this.safeView?.setOwned(this.safehouses.owned);
    this.raidWorld?.reset(d.raids);
    // Older saves: the intro and the acts they've reached count as seen.
    this.cineSeen = new Set(d.cinematics ?? ['intro', ...(d.campaign?.acts ?? [])]);
    // Your look (older saves: the default figure).
    this.applyLook(sanitizeLook(d.look) ?? DEFAULT_LOOK);
    this.hour = d.hour;
    this.env.setTime(this.hour);
    this.playTime = d.playTime;
    this.weapons.inventory.load(d.weapons);
    this.bag.load(d.bag);
    this.party.members.length = 0;
    this.party.stash.length = 0;
    this.party.members.push(...d.party);
    this.party.stash.push(...d.stash);
    if (!this.party.members.length && this.party.stash.length) this.party.members.push(this.party.stash.shift()!);
    this.impound.length = 0;
    this.impound.push(...d.impound);
    if (this.impound.length) this.placeImpound();
    this.dex.seen.clear();
    this.dex.caught.clear();
    for (const s of d.dex.seen) this.dex.seen.add(s);
    for (const s of d.dex.caught) this.dex.caught.add(s);
    this.dex.evolved.clear();
    for (const s of d.dex.evolved) this.dex.evolved.add(s);
    this.dex.firstSeen = { ...d.dex.firstSeen };
    this.progress = structuredClone({ layer: d.layer, pity: d.pity, stashesOpened: d.stashesOpened, quests: d.quests, reputation: d.reputation, manholesFound: d.manholesFound, sewerSeed: d.sewerSeed, streetCred: d.streetCred });
    if (this.races) {
      if (this.races.active) this.races.abort();
      this.races.load({ streetCred: d.streetCred, records: d.raceRecords ?? {} });
    }
    if (this.heists) {
      if (this.heists.active || this.heists.state === 'PLANNING') this.heists.abandon();
      this.heists.load(d.heists);
    }
    if (this.streetEvents) this.streetEvents.load(d.streetEvents);
    if (this.quests) {
      this.quests.load(d.campaign);
      // Saves from before Mama's welcome existed already have a team: that opener is done.
      const st = this.quests.status(STARTER_QUEST);
      if (this.party.members.length + this.party.stash.length > 0 && (st === 'available' || st === 'locked')) this.quests.markCompleted(STARTER_QUEST);
      this.campaignWorld?.clear();
    }
    if (this.tut) this.loadTutorials(d);
    if (this.cityMap) {
      this.cityMap.setHidden(d.map.hidden);
      this.cityMap.setWaypoint(d.map.waypoint);
    }
    for (const st of this.roofPlan.stashes) this.roofView.setStashOpen(st.id, this.progress.stashesOpened.includes(st.id));
    for (const m of [...this.mazes, ...this.deepMazes]) for (const c of m.caches) this.sewerView?.setCacheOpen(c.id, this.progress.stashesOpened.includes(c.id));
    for (const c of this.streetCaches) this.streetCacheView?.setOpen(c.id, this.progress.stashesOpened.includes(c.id));
    const wsave = (d.world && typeof d.world === 'object' ? d.world : {}) as Record<string, unknown>;
    this.civic = typeof wsave['civic'] === 'number' ? clampCivic(wsave['civic']) : 0;
    this.gangs?.load(parseGangState(wsave['gangs']));
    this.weather.load(wsave['weather']);
    this.trainers.beaten.clear();
    for (const t of d.trainersBeaten) this.trainers.beaten.add(t);
    this.garageLoad(d.garage);
    // Real-time is the default now; a save keeps turn-based only if you chose it.
    this.battleModeChosen = !!d.battleModeChosen;
    BATTLE.mode = d.battleModeChosen ? d.battleMode : 'realtime';
    const L = this.layout.land;
    const pl = d.player;
    const roof = pl && d.layer === 'roof' && pl.y !== undefined ? this.layers.roofAt(pl.x, pl.z) : null;
    const maze = pl && d.layer === 'sewer' ? this.mazeAt(pl.x, pl.z) : null;
    if (pl && maze) {
      // Saved underground: back in that tunnel (or at the nearest ladder if the spot isn't open).
      const b = blockAt(maze, pl.x, pl.z);
      const near = maze.manholes.reduce((a, h) => (Math.hypot(h.x - pl.x, h.z - pl.z) < Math.hypot(a.x - pl.x, a.z - pl.z) ? h : a));
      const spot = b && maze.open[b.i][b.j] ? { x: pl.x, z: pl.z } : blockCentre(maze, near.i, near.j);
      this.player.teleport(spot.x, SEWER.floor + 0.05, spot.z);
      this.setLayer('sewer');
    } else if (pl && roof && Math.abs(roof.top - pl.y!) < 2) {
      // Saved on a rooftop: back on that roof.
      this.player.teleport(pl.x, roof.top + 0.3, pl.z);
      this.setLayer('roof');
    } else if (pl && pl.x > L.x0 && pl.x < L.x1 && pl.z > L.z0 && pl.z < L.z1 && !this.peds.blocked(pl.x, pl.z)) {
      this.player.teleport(pl.x, this.peds.groundY(pl.x, pl.z) + 0.3, pl.z);
      this.setLayer('street');
    } else this.setLayer('street');
  }

  /** Writes the save; returns false if storage isn't available. */
  saveGame(): boolean {
    if (this.state === 'title' || this.state === 'loading') return false;
    this.lastSaveAt = this.gameTime;
    return saves.write(JSON.stringify(this.buildSave()));
  }

  /** Pushes the options to the camera, the audio and the HUD (and the menus' CSS scale). */
  private applyOptions(): void {
    const o = this.options;
    if (this.rig) {
      this.rig.lookSpeed = o.lookSpeed;
      this.rig.invertY = o.invertY;
    }
    audio.setVolume(o.effects);
    this.music.userVolume = o.music;
    document.documentElement.style.setProperty('--hud-scale', String(o.hudSize));
  }

  private autosave(): void {
    if (this.state === 'title' || this.state === 'loading' || !this.party.members.length && !this.party.stash.length && !this.impound.length) return;
    const ok = this.saveGame();
    if (ok && this.autosaveNote) this.hud.saved(this.autosaveNote);
    this.autosaveNote = null;
  }

  /**
   * An autosave for a milestone (a safehouse, a heist pulled off, a race won, a new Streetmon):
   * made as soon as nothing's in the way (not mid-battle or mid-throw) and shown with the
   * indicator.
   */
  private autosaveFor(note: string): void {
    this.autosaveNote = this.autosaveNote && this.autosaveNote !== note ? `${this.autosaveNote}, ${note}` : note;
    this.saveDirty = true;
  }

  private savedSummary(): string | null {
    const text = saves.read();
    if (!text) return null;
    try {
      return describeSave(loadSave(text).data);
    } catch {
      return null;
    }
  }

  private exportSave(): void {
    // A compressed save file (base64, so it survives email and copy-paste); Import reads it and plain JSON.
    const blob = new Blob([saves.exportText(JSON.stringify(this.buildSave()))], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `empire-streets-${new Date().toISOString().slice(0, 10)}.esave`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  private importSave(text: string): string {
    if (this.battles.active || this.evolution.active) return 'Finish the fight first.';
    try {
      const { data, warnings } = loadSave(unpackSave(text).text);
      this.applySave(data);
      this.saveGame();
      return `Save imported.${warnings.length ? ` Repaired: ${warnings.slice(0, 3).join('; ')}` : ''}`;
    } catch (e) {
      return (e as Error).message;
    }
  }

  private closeMenu(): void {
    if (this.team.isOpen || this.clinicMenu.isOpen || this.casinoMenu?.isOpen || this.dexScreen.isOpen || this.dialogue.isOpen || this.chopMenu.isOpen || this.garageMenu?.isOpen || this.heistMenu?.isOpen || this.wardrobe?.isOpen || this.story?.isOpen) return;
    this.state = 'playing';
    // The key that closed the menu mustn't also act in the game (N would reopen the dex).
    this.input.endFrame();
    this.clock.getDelta();
    this.input.requestPointerLock();
  }

  private menuKeys(): void {
    const inp = this.input;
    for (const code of ['Escape', 'Space', 'KeyI', 'KeyE', 'KeyN', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Enter', 'NumpadEnter']) {
      if (!inp.wasPressed(code)) continue;
      if (this.story.isOpen) this.story.key(code);
      else if (this.wardrobe.isOpen) this.wardrobe.key(code);
      else if (this.heistMenu.isOpen) this.heistMenu.key(code);
      else if (this.garageMenu.isOpen) this.garageMenu.key(code);
      else if (this.chopMenu.isOpen) this.chopMenu.key(code);
      else if (this.dialogue.isOpen) this.dialogue.key(code);
      else if (this.dexScreen.isOpen) this.dexScreen.key(code);
      else if (this.team.isOpen) this.team.key(code);
      else if (this.clinicMenu.isOpen && (code === 'Escape' || code === 'KeyE')) this.clinicMenu.close();
    }
  }

  // ------------------------------------------------------------------ people, police and gangs

  /** Closest person (passer-by or officer on foot) still standing. */
  private nearestPerson(maxD: number): Ped | null {
    const p = this.player.position;
    let best: Ped | null = null;
    let bd = maxD;
    for (const q of this.peds.peds) {
      if (q.state === 'dead' || q.state === 'down' || q.state === 'fly') continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  private markCreatureCrime(c: Creature | null): void {
    if (c && this.party.members.includes(c)) this.crimeCreatures.add(c);
    if (!this.creatureCrime) {
      this.creatureCrime = true;
      if (this.wanted.stars > 0) window.setTimeout(() => this.hud.toast('Police animal control is on the way: tranquilliser darts, and they confiscate Streetmon.', 4000), 800);
    }
  }

  /** B next to a person: your lead creature goes for them. Most run; some fight back; officers always do. */
  private sicOnPerson(ped: Ped): void {
    const lead = this.party.lead;
    if (!lead || this.battles.active) return;
    const at = this.tmp.set(ped.x, ped.y, ped.z);
    const cop = ped.role === 'cop';
    if (ped.role === 'gang') {
      this.peds.damage(ped, 30, ped.x - this.player.position.x, ped.z - this.player.position.z, 3);
      this.hud.toast(`${displayName(lead)} goes for the Gutter King!`, 1600);
      return;
    }
    if (cop) this.reportCrime('hitCop', at.x, at.z, 'cop');
    else this.crime('creatureAttack', at.clone(), 'civ');
    this.markCreatureCrime(lead);
    const level = (n: number): number => Math.max(2, Math.min(100, Math.round(n)));
    let person: Creature | null = null;
    if (cop) person = createCreature(this.wanted.stars >= 2 ? 'tranqofficer' : 'officer', level(lead.level + 2 + this.wanted.stars * 2));
    else if (Math.random() < 0.35) person = createCreature(Math.random() < 0.5 ? 'tough' : 'civilian', level(lead.level + (Math.random() * 4 - 2)));
    if (!person) {
      // They run for it.
      this.peds.damage(ped, 8, ped.x - this.player.position.x, ped.z - this.player.position.z, 2);
      this.peds.flee(ped, this.player.position.x, this.player.position.z);
      this.effects.impact(ped.x, ped.y + 1, ped.z, false);
      this.hud.toast(`${displayName(lead)} went for them. They ran off screaming.`, 2500);
      return;
    }
    this.aiming = false;
    this.player.facingOverride = Math.atan2(-(ped.z - this.player.position.z), ped.x - this.player.position.x);
    this.battles.mode = BATTLE.mode;
    if (BATTLE.mode === 'turn') {
      if (this.input.pointerLocked) document.exitPointerLock();
      this.hud.setVisible(false);
    }
    this.battleLook.copy(this.player.position);
    this.battles.startVsPerson(this.party, ped, person, this.player.position);
  }

  /** A person you fought went down: they drop what they had and stay down for a bit. */
  private onPersonDown(ped: Ped): void {
    ped.state = 'down';
    ped.timer = 7;
    ped.threatX = this.player.position.x;
    ped.threatZ = this.player.position.z;
    if (ped.role !== 'cop' && Math.random() < 0.6) this.weapons.drop('cash', 'cash', 10 + Math.floor(Math.random() * 50), ped.x + 0.5, ped.y, ped.z);
    if (ped.role === 'cop') this.reportCrime('hitCop', ped.x, ped.z, 'cop');
  }

  private onTrainerChallenge(t: Trainer): void {
    if (this.battles.active || this.evolution.active || !this.party.canFight || this.player.vehicle) {
      this.trainers.release(t, 20);
      return;
    }
    this.aiming = false;
    this.tut.fire('trainerChallenge');
    this.player.facingOverride = Math.atan2(-(t.z - this.player.position.z), t.x - this.player.position.x);
    this.battles.mode = BATTLE.mode;
    if (BATTLE.mode === 'turn') {
      if (this.input.pointerLocked) document.exitPointerLock();
      this.hud.setVisible(false);
    }
    this.battleLook.copy(this.player.position);
    this.battles.startTrainer(this.party, t, this.trainers.teamFor(t), this.player.position);
  }

  /** Police arriving at a fight while you're wanted break it up. */
  private checkPoliceBreakUp(): void {
    if (!this.battles.active || this.battles.kind === 'police' || this.wanted.stars === 0) return;
    const p = this.player.position;
    if (this.police.anyWithin(p.x, p.z, 16)) {
      this.battles.abort();
      this.hud.toast('"Police! Break it up!"', 2500);
    }
  }

  /** Tranquilliser dart from an animal-control officer: slows you and knocks your lead creature down. */
  private tranqShot(o: Ped, chance: number): void {
    const p = this.player;
    const from = new THREE.Vector3(o.x, o.y + 1.45, o.z);
    const target = p.position.clone().setY(p.position.y + 0.3);
    if (!this.weapons.npcFire(from, target, Math.min(0.6, chance + 0.12))) return;
    this.sedatedUntil = performance.now() + 3500;
    this.tranqHits++;
    if (this.tranqHits >= 4) {
      this.tranqHits = 0;
      this.hud.toast('Too many darts... you go down hard.', 2500);
      this.busted();
      return;
    }
    const lead = this.party.lead;
    if (lead) {
      const dmg = Math.ceil(maxHpOf(lead) * 0.25);
      lead.hp = Math.max(0, lead.hp - dmg);
      this.hud.toast(lead.hp > 0 ? `Tranquilliser dart! You're slowed and ${displayName(lead)} is getting drowsy.` : `Tranquilliser dart! ${displayName(lead)} is out cold.`, 2200);
    } else this.hud.toast("Tranquilliser dart! You're slowed down.", 1800);
  }

  /** Busted after using Streetmon in crimes: those creatures are taken to the precinct impound. */
  private confiscateCreatures(): void {
    if (!this.creatureCrime) return;
    const taken = this.party.members.filter((c) => this.crimeCreatures.has(c));
    if (!taken.length && this.party.lead) taken.push(this.party.lead);
    for (const c of taken) {
      this.party.members.splice(this.party.members.indexOf(c), 1);
      this.impound.push(c);
    }
    this.creatureCrime = false;
    this.crimeCreatures.clear();
    if (taken.length) this.tut.fire('impound');
    if (taken.length) window.setTimeout(() => this.hud.toast(`Animal control confiscated ${taken.map((c) => displayName(c)).join(', ')}. Get them back at the precinct impound ($150 each).`, 6000), 1600);
    this.placeImpound();
  }

  private placeImpound(): void {
    const pr = this.precinct;
    for (let r = 3; r < 14; r++)
      for (let a = 0; a < 8; a++) {
        const x = pr.x + Math.cos((a / 8) * Math.PI * 2) * r;
        const z = pr.z + Math.sin((a / 8) * Math.PI * 2) * r;
        if (!this.peds.blocked(x, z) && this.peds.groundY(x, z) > 0.1) {
          this.impoundSpot = { x, z };
          return;
        }
      }
    this.impoundSpot = { x: pr.x + 3, z: pr.z };
  }

  private retrieveImpound(): void {
    const fee = 150;
    let got = 0;
    while (this.impound.length && this.money >= fee) {
      const c = this.impound.shift()!;
      this.money -= fee;
      this.party.add(c);
      got++;
    }
    if (got) {
      audio.cash();
      this.hud.toast(`Got ${got} Streetmon back from the impound ($${got * fee}).${this.impound.length ? ` ${this.impound.length} still held: come back with more cash.` : ''}`, 3500);
    } else this.hud.toast(`The impound wants $${fee} per Streetmon.`, 2500);
  }

  // ------------------------------------------------------------------ follower, hover, attacking creatures

  private updateMusic(dt: number): void {
    const stars = this.wanted.stars;
    if (stars >= 2) this.chaseMusic = true;
    else if (stars === 0) this.chaseMusic = false;
    if (this.state !== 'title')
      this.music.play(
        pickTrack({
          // District Boss fights get their own track.
          battle: this.battles.active ? (this.campaignBattle ? 'boss' : this.battles.kind) : null,
          stars,
          chasing: this.chaseMusic,
          // Heist music from the moment you're on the job (not while planning).
          heist: !!this.heists?.active && this.heists.state !== 'SETUP',
          race: !!this.races?.active,
          sewer: this.layers?.current === 'sewer',
          indoors: this.interior ? (this.interior.spot.kind === 'casino' ? 'casino' : 'room') : null,
          raid: this.raidWorld?.loud,
          cinematic: this.state === 'cinematic' ? this.cine.music : null,
        }),
      );
    this.music.setEnabled(audio.on);
    this.music.setPaused(this.state === 'paused');
    this.music.setPlaceVolume(1);
    this.music.update(dt);
  }

  private toggleFollower(): void {
    if (this.follower.summoned) {
      this.follower.recall();
      this.hud.toast('Recalled.', 1200);
      return;
    }
    const lead = this.party.lead;
    if (!lead) {
      this.hud.toast('No Streetmon able to come out.', 1500);
      return;
    }
    this.follower.summon(lead, this.player.position);
    this.hud.toast(`${displayName(lead)}, come on out! (G to recall)`, 1800);
  }

  /** Every Streetmon you could hover over: wild ones, yours, gang trainers' and the battlefield. */
  private inspectables(): Inspectable[] {
    const out: Inspectable[] = [];
    for (const w of this.spawns.wild) {
      if (w.removed || !w.inst || w.pinned) continue;
      out.push({ creature: w.creature, x: w.x, y: w.y + (w.alt ?? 0), z: w.z, height: w.spec.model.height, owner: 'Wild' });
    }
    if (this.follower.summoned && this.follower.visible && this.follower.creature)
      out.push({ creature: this.follower.creature, x: this.follower.x, y: this.follower.y, z: this.follower.z, height: this.follower.height, owner: 'Yours' });
    for (const t of this.trainers.trainers) {
      const pet = (t as unknown as { pet: { root: THREE.Object3D } | null }).pet;
      if (!pet || !pet.root.visible) continue;
      let c = this.trainerPetInfo.get(t.spec.id);
      if (!c) {
        c = createCreature(t.spec.team[0][0], t.spec.team[0][1]);
        this.trainerPetInfo.set(t.spec.id, c);
      }
      const pp = pet.root.position;
      out.push({ creature: c, x: pp.x, y: pp.y, z: pp.z, height: species(c.speciesId).model.height, owner: `${t.spec.name}'s` });
    }
    const owner = this.battles.kind === 'wild' ? 'Wild' : this.battles.kind === 'police' ? 'Police' : this.battles.battle?.sides[1].name ? `${this.battles.battle.sides[1].name}'s` : 'Foe';
    for (const v of this.battles.allViews()) out.push({ creature: v.c.creature, x: v.x, y: v.y, z: v.z, height: v.height, owner: v.c.side === 0 ? 'Yours' : owner });
    return out;
  }

  /** What your weapons can hit: wild creatures outside battles, and the foe in a real-time skirmish. */
  private creatureTargets(): CreatureTarget[] {
    const out: CreatureTarget[] = [];
    // Guns and fists hurt Streetmon at 40% (Concrete 30%); legendaries shrug most of it off (x0.2).
    const scale = (dmg: number, c: Creature): number => {
      const sp = species(c.speciesId);
      return dmg * 0.4 * (sp.types.includes('concrete') ? 0.75 : 1) * (sp.legendary ? LEGEND_WEAPON_DAMAGE : 1);
    };
    const pp = this.player.position;
    for (const w of this.spawns.wild) {
      if (w.removed || w.pinned || w.state === 'fainted' || !w.inst) continue;
      out.push({
        x: w.x,
        y: w.y + (w.alt ?? 0),
        z: w.z,
        height: w.spec.model.height * (w.sizeScale ?? 1),
        hit: (dmg) => {
          const hp0 = w.creature.hp;
          const ko = this.spawns.hurt(w, scale(dmg, w.creature), pp.x, pp.z);
          if (hp0 > w.creature.hp) this.dmgNums.spawn(w.x, w.y + w.spec.model.height + 0.2, w.z, hp0 - w.creature.hp, ko ? 'crit' : 'hit');
          this.markSeen(w.spec.id);
          if (ko) this.hud.toast(`The wild ${w.spec.name} was knocked out and limps away.`, 2200);
          return ko;
        },
      });
    }
    for (const t of this.battles.foeTargets()) {
      out.push({
        x: t.x,
        y: t.y,
        z: t.z,
        height: t.height,
        assist: true,
        hit: (dmg) => {
          const before = t.c.creature.hp;
          const amount = Math.max(1, Math.round(scale(dmg, t.c.creature)));
          this.battles.playerAttack(t.c, amount);
          this.dmgNums.spawn(t.x, t.y + t.height + 0.2, t.z, Math.min(before, amount), amount >= before ? 'crit' : 'hit');
          return before > 0 && t.c.creature.hp <= 0;
        },
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ world layers

  /**
   * Moves the player to another layer (a fire-escape climb, an elevator, a manhole): input locks,
   * the screen fades out, the player is moved and the layer switched (lighting, fog, music,
   * spawns), then it fades back in. Every layer change by teleport goes through here, so a battle
   * starting mid-climb or a follower left behind can't happen. Returns false if it can't start now.
   */
  transition(to: Biome, at: { x: number; y: number; z: number }, opts: { seconds?: number; label?: string; done?: () => void } = {}): boolean {
    const p = this.player;
    if (this.trans || p.dead || p.vehicle || this.battles.active || this.evolution.active || this.throwing || this.state !== 'playing') return false;
    const dur = Math.max(0.4, opts.seconds ?? 1.2);
    this.trans = { to, x: at.x, y: at.y, z: at.z, t: 0, dur, moved: false, label: opts.label ?? '', done: opts.done };
    this.aiming = false;
    if (this.challenger) this.endChallenger(true);
    return true;
  }

  get transitioning(): boolean {
    return !!this.trans;
  }

  private updateLayer(dt: number): void {
    this.roofView.update(this.gameTime);
    this.updateSewer(dt);
    this.updateCommunity(dt);
    this.manholeHint();
    const tr = this.trans;
    if (tr) {
      tr.t += dt;
      const half = tr.dur / 2;
      // Fade to black over the first half, move at the midpoint, fade back in.
      const a = tr.t < half ? tr.t / half : Math.max(0, 1 - (tr.t - half) / half);
      this.fadeEl.style.opacity = a.toFixed(3);
      if (!tr.moved && tr.t >= half) {
        tr.moved = true;
        this.player.teleport(tr.x, tr.y, tr.z);
        this.setLayer(tr.to);
        if (tr.label) this.hud.toast(tr.label, 1800);
      }
      if (tr.t >= tr.dur) {
        this.fadeEl.style.opacity = '0';
        this.trans = null;
        tr.done?.();
      }
      return;
    }
    // Walking off a roof, driving up a garage ramp, falling: the layer follows where you are.
    const pos = this.player.vehicle ? this.player.vehicle.position : this.player.position;
    const now = this.layers.layerAt(pos.x, pos.y, pos.z);
    if (now !== this.layers.current) this.setLayer(now);
  }

  /**
   * Can a battling Streetmon stand here? The player's layer has floor here (street: not in a
   * building or the water; rooftops and sewers: within a step of the player's level), and no car
   * or street prop is in the way.
   */
  battleClear(x: number, z: number): boolean {
    const b = this.layers.current;
    const py = this.player.position.y;
    // On the water any open water will do (and the bank too).
    if (this.battleInWater && this.waterAt(x, z)) return !this.vehicles.cars.some((c) => !c.disposed && Math.hypot(c.position.x - x, c.position.z - z) < 2.6);
    if (b === 'street') {
      if (this.peds.blocked(x, z)) return false;
    } else {
      const g = this.spawns.layers[b]?.ground(x, z, py);
      if (g === null || g === undefined || Math.abs(g - (this.player.feet?.y ?? py)) > 0.6) return false;
    }
    for (const c of this.vehicles.cars) {
      if (c.disposed) continue;
      const dx = c.position.x - x;
      const dz = c.position.z - z;
      if (dx * dx + dz * dz < 2.6 * 2.6 && Math.abs(c.position.y - py) < 3) return false;
    }
    if (this.destruction?.blocksAt(x, z, 0.5)) return false;
    return true;
  }

  /** Ground height where scenes stand (battles, evolutions, the follower) in the player's layer. */
  groundAt(x: number, z: number): number {
    const b = this.layers.current;
    if (this.battleInWater) {
      const w = this.waterAt(x, z);
      if (w) return w.surface;
    }
    if (b === 'street') return this.peds.groundY(x, z);
    const g = this.spawns.layers[b]?.ground(x, z, this.player.position.y);
    // Off the edge of this roof or chamber: stay level with the player rather than drop to the street.
    return g ?? this.player.position.y - 0.05;
  }

  /** Walls and drops in the player's layer. */
  blockedAt(x: number, z: number): boolean {
    const b = this.layers.current;
    if (b === 'street') return this.peds.blocked(x, z);
    return (this.spawns.layers[b]?.ground(x, z, this.player.position.y) ?? null) === null;
  }

  /** Applies a layer: lighting and fog, music, and the save state. Spawning follows on its own. */
  private setLayer(b: Biome): void {
    this.layers.current = b;
    this.progress.layer = b;
    this.env.setLayer(b === 'pond' ? 'street' : b);
    this.env.setTime(this.hour);
    const under = b === 'sewer';
    this.sewerView.under.visible = under;
    this.cityRoot.visible = !under;
    this.roofView.root.visible = !under;
    this.hud.setSewerMap(under ? this.mazeAt(this.player.position.x, this.player.position.z) : null);
    // Underground: no sun shadows to draw, and nothing to see past the tunnels.
    this.renderer.shadowMap.autoUpdate = !under;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.surfaceFar === 0) this.surfaceFar = this.camera.far;
    this.camera.far = under ? 70 : this.surfaceFar;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ rooftops

  /** The nearest car you can get into, at your own height (not one parked under the roof you're on). */
  private enterableCar(): ReturnType<VehicleManager['nearestEnterable']> {
    const p = this.player;
    const car = this.vehicles.nearestEnterable(p.position, PLAYER.enterRange);
    return car && Math.abs(car.position.y - p.position.y) < 3 && !this.raceWorld?.isRacer(car) ? car : null;
  }

  /** What E does here on the rooftops (fire escape, elevator, stash), if anything. */
  private roofUse(): { label: string; act: () => void } | null {
    const p = this.player;
    if (!p.onFoot || this.trans) return null;
    const gu = this.gangs?.use();
    if (gu) return gu;
    const sc = this.streetCacheUse();
    if (sc) return sc;
    const pos = p.position;
    const feetY = p.feet.y;
    const R = ROOFS.useRadius;
    const close = (q: { x: number; y: number; z: number }): boolean => Math.hypot(q.x - pos.x, q.z - pos.z) < R && Math.abs(q.y - feetY) < 1.6;
    if (this.layers.current === 'sewer') {
      for (const n of this.people) if (Math.hypot(n.x - pos.x, n.z - pos.z) < 1.9) return { label: `Talk to ${n.spec.name}`, act: () => this.talkTo(n.spec) };
      const pk = this.questPickup;
      if (pk && Math.hypot(pk.mesh.position.x - pos.x, pk.mesh.position.z - pos.z) < 1.7) return { label: `Pick up the ${currentStep(this.progress.quests, pk.questId)?.item ?? 'item'}`, act: () => this.collectPickup() };
    }
    const mh = this.manholeNear();
    if (mh) return mh;
    const su = this.sewerUse();
    if (su) return su;
    for (const a of this.roofPlan.access) {
      if (close(a.street)) return { label: a.kind === 'elevator' ? 'Take the elevator to the roof' : 'Climb the fire escape', act: () => this.useAccess(a, 'up') };
      if (close(a.roof)) return { label: a.kind === 'elevator' ? 'Take the elevator down' : 'Climb down the fire escape', act: () => this.useAccess(a, 'down') };
    }
    const tr = this.roofTrader;
    if (tr && this.layers.current === 'roof' && close({ x: tr.x, y: tr.y, z: tr.z })) return { label: 'Skyline Trader: evolution items', act: () => this.openRoofTrader() };
    if (this.layers.current === 'roof') {
      for (const s of this.roofPlan.stashes) {
        if (this.progress.stashesOpened.includes(s.id)) continue;
        if (close(s)) return { label: s.secret ? 'Open the hidden stash' : 'Open the stash', act: () => this.openStash(s) };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ sewers

  /** Minimap marker for the tracked quest's target place. */
  private questMarkers(): Array<{ x: number; z: number; color: string; size: number }> {
    const tq = this.trackedQuest();
    if (!tq) return [];
    if (tq.step.type === 'talk') {
      const n = this.people.find((x) => x.spec.id === tq.step.npc);
      return n ? [{ x: n.x, z: n.z, color: '#ffd23f', size: 8 }] : [];
    }
    if (!tq.step.place) return [];
    const pc = this.placeCentre(questSpec(tq.id).district, tq.step.place);
    return pc ? [{ x: pc.x, z: pc.z, color: '#ffd23f', size: 8 }] : [];
  }

  /** The maze under a point, if any. */
  /** The maze under a point, on the level nearest height `y` (default: where you are). */
  mazeAt(x: number, z: number, y: number = this.player?.position.y ?? SEWER.floor): Maze | null {
    let best: Maze | null = null;
    for (const m of this.deepMazes.length ? [...this.mazes, ...this.deepMazes] : this.mazes) {
      const W = m.size * SEWER.block;
      if (!(x >= m.x0 && x < m.x0 + W && z >= m.z0 && z < m.z0 + W)) continue;
      if (!best || Math.abs(m.floor - y) < Math.abs(best.floor - y)) best = m;
    }
    return best;
  }

  /**
   * Shafts down: in each district, from the dead end furthest from the hub on one level to the
   * nearest dry block of the level below (and the ladder back up).
   */
  private linkShafts(): void {
    this.shafts = [];
    for (const top of this.mazes) {
      const chain = [top, ...this.deepMazes.filter((d) => d.district === top.district).sort((a, b) => a.level - b.level)];
      for (let n = 0; n < chain.length - 1; n++) {
        const a = chain[n];
        const b = chain[n + 1];
        const hub = blockCentre(a, a.hub.i, a.hub.j);
        const ends = a.deadEnds.filter((d) => !a.caches.some((c) => c.i === d.i && c.j === d.j) && !a.hazards.has(blockKey(d.i, d.j)) && !a.manholes.some((h) => Math.abs(h.i - d.i) + Math.abs(h.j - d.j) < 3));
        const far = (p: { x: number; z: number }, q: { x: number; z: number }): number => Math.hypot(q.x - hub.x, q.z - hub.z) - Math.hypot(p.x - hub.x, p.z - hub.z);
        let from = ends.map((d) => blockCentre(a, d.i, d.j)).sort(far)[0];
        if (!from) {
          // No spare dead end on this level: any quiet dry tunnel block well away from the hub.
          const spare: Array<{ x: number; z: number }> = [];
          for (let i = 1; i < a.size - 1; i++)
            for (let j = 1; j < a.size - 1; j++) {
              const k = blockKey(i, j);
              if (!a.open[i][j] || a.pools.has(k) || a.hazards.has(k) || a.caches.some((c) => c.i === i && c.j === j) || a.manholes.some((h) => Math.abs(h.i - i) + Math.abs(h.j - j) < 3)) continue;
              const c = blockCentre(a, i, j);
              if (!propAt(a, c.x, c.z, 0.8) && !this.shafts.some((s) => Math.hypot(s.to.x - c.x, s.to.z - c.z) < 6)) spare.push(c);
            }
          from = spare.sort(far)[0];
        }
        if (!from) continue;
        let to: { x: number; z: number } | null = null;
        let bd = Infinity;
        for (let i = 1; i < b.size - 1; i++)
          for (let j = 1; j < b.size - 1; j++) {
            if (!b.open[i][j] || b.pools.has(blockKey(i, j)) || b.hazards.has(blockKey(i, j))) continue;
            const c = blockCentre(b, i, j);
            if (propAt(b, c.x, c.z, 0.8) || b.caches.some((k) => k.i === i && k.j === j)) continue;
            const d = Math.hypot(c.x - from.x, c.z - from.z);
            if (d < bd) {
              bd = d;
              to = c;
            }
          }
        if (to) this.shafts.push({ from: { ...from, floor: a.floor }, to: { ...to, floor: b.floor }, level: b.level, district: a.district });
      }
    }
  }

  /** Water under a point: the pond, or a pool in the sewer level you're on. */
  private waterAt(x: number, z: number): { surface: number; depth: number; toxic?: boolean } | null {
    if (inLake(this.layout.parkLake, x, z)) {
      const lk = this.layout.parkLake;
      return { surface: waveY(x, z, this.gameTime), depth: Math.max(0, depthAtLake(lk, x, z)) };
    }
    if (this.layers?.current !== 'sewer') return null;
    const m = this.mazeAt(x, z);
    const pool = m && poolAt(m, x, z);
    if (!m || !pool) return null;
    // Rooms and the gang hideout are built far below the mazes: no pools down there.
    const feet = this.player?.feet?.y ?? m.floor;
    if (this.interior || feet < m.floor - 5) return null;
    return { surface: m.floor - SEWER.poolDrop, depth: pool.depth, toxic: pool.toxic };
  }

  /** Where to climb out of the water you're in: how far the edge is, which way, and the spot past it. */
  private waterEdge(x: number, z: number): { d: number; nx: number; nz: number; outX: number; outZ: number; outY: number } | null {
    if (inLake(this.layout.parkLake, x, z)) {
      const e = nearestEdge(this.layout.parkLake, x, z);
      const b = bankPoint(this.layout.parkLake, x, z);
      return { d: e.d, nx: e.nx, nz: e.nz, outX: b.x, outZ: b.z, outY: 0.2 };
    }
    const m = this.mazeAt(x, z);
    const e = m && poolEdge(m, x, z);
    return e && m ? { ...e, outY: m.floor + 0.05 } : null;
  }

  /** E next to a shaft (down a level, or the ladder back up) or a cache. */
  private sewerUse(): { label: string; act: () => void } | null {
    if (this.layers.current !== 'sewer') return null;
    const p = this.player.position;
    const feet = this.player.feet.y;
    for (const sh of this.shafts) {
      if (Math.abs(feet - sh.from.floor) < 2 && Math.hypot(sh.from.x - p.x, sh.from.z - p.z) < 1.6)
        return { label: `Climb down to the deep drains (level ${sh.level})`, act: () => this.useShaft(sh, 'down') };
      if (Math.abs(feet - sh.to.floor) < 2 && Math.hypot(sh.to.x - p.x, sh.to.z + 0.9 - p.z) < 1.8)
        return { label: `Climb back up to level ${sh.level - 1}`, act: () => this.useShaft(sh, 'up') };
    }
    for (const m of [...this.mazes, ...this.deepMazes]) {
      if (Math.abs(feet - m.floor) > 2) continue;
      for (const c of m.caches) {
        if (this.progress.stashesOpened.includes(c.id)) continue;
        if (Math.hypot(c.x - p.x, c.z - p.z) < 1.8) return { label: `Open the ${c.tier >= 3 ? 'sealed vault box' : c.tier === 2 ? 'drain lockbox' : 'lockbox'}`, act: () => this.openCache(c) };
      }
    }
    return null;
  }

  private useShaft(sh: (typeof this.shafts)[number], dir: 'up' | 'down'): void {
    // Too green for the deep levels: a warning first (press again to go anyway).
    if (dir === 'down') {
      const need = sh.level === 2 ? 15 : 28;
      const best = Math.max(0, ...this.party.members.map((c) => c.level));
      if (best < need && !(this.deepWarned && this.deepWarned.level === sh.level && this.gameTime - this.deepWarned.at < 6)) {
        this.deepWarned = { level: sh.level, at: this.gameTime };
        this.hud.toast(`Something big moves down there. Streetmon on level ${sh.level} are around Lv ${sh.level === 2 ? '25-40' : '40-60'}; yours are Lv ${best}. Press E again to go down anyway.`, 5000);
        return;
      }
      this.deepWarned = null;
    }
    const t = dir === 'down' ? sh.to : sh.from;
    const label = dir === 'down' ? (sh.level === 2 ? 'The deep drains' : 'The old cisterns') : sh.level - 1 === 1 ? 'The sewers' : 'The deep drains';
    const ok = this.transition('sewer', { x: t.x, y: t.floor + 0.05, z: dir === 'down' ? t.z + 0.4 : t.z + 1.2 }, { seconds: 1.6, label });
    if (ok) {
      if (dir === 'down' && !this.progress.stashesOpened.includes(`depth:${sh.district}:${sh.level}`)) {
        this.progress.stashesOpened.push(`depth:${sh.district}:${sh.level}`);
        window.setTimeout(() => this.hud.toast(sh.level === 2 ? 'Deeper down: rarer Streetmon, and stronger. There are caches to find.' : 'The bottom level. Only the toughest Streetmon live this deep.', 4500), 1800);
      }
      window.setTimeout(() => this.hud.setSewerMap(this.mazeAt(t.x, t.z, t.floor)), 900);
    }
  }

  /** A cache: cash and items, better the deeper it is. */
  private openCache(c: Cache): void {
    if (this.progress.stashesOpened.includes(c.id)) return;
    this.progress.stashesOpened.push(c.id);
    this.sewerView.setCacheOpen(c.id, true);
    let seed = 0;
    for (const ch of c.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const r = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const cash = [0, 150, 600, 1600][c.tier] + Math.floor(r() * [0, 250, 700, 1500][c.tier]);
    this.money += cash;
    const items: Array<[string, number]> =
      c.tier === 1 ? [[r() < 0.5 ? 'cuffs' : 'crate', 2]] : c.tier === 2 ? [['net', 2], [r() < 0.5 ? 'cage' : 'lure', 1]] : [['capturePod', 1], ['cage', 2]];
    if (c.tier >= 2 && r() < (c.tier === 3 ? 0.8 : 0.35)) items.push([r() < 0.5 ? 'steelCase' : 'sparkPlug', 1]);
    for (const [id, n] of items) if (DATA.items.has(id)) this.bag.add(id, n);
    audio.cash();
    audio.door();
    this.hud.toast(`Cache: $${cash.toLocaleString('en-US')} and ${items.filter(([id]) => DATA.items.has(id)).map(([id, n]) => `${n} x ${itemSpec(id).name}`).join(', ')}.`, 4500);
    this.saveDirty = true;
  }

  /** E at a manhole: down from the street, up the ladder from below. */
  /** The first time you walk up to a manhole, say what it's for. */
  private manholeHintShown = false;
  private manholeHint(): void {
    if (this.manholeHintShown || this.layers.current !== 'street' || !this.player.onFoot || this.progress.manholesFound.length) return;
    const p = this.player.position;
    for (const m of this.mazes)
      for (const h of m.manholes)
        if (Math.hypot(h.x - p.x, h.z - p.z) < 8) {
          // With tips on, the tip card does this (it comes back if it couldn't show).
          if (this.tut.enabled) {
            this.tut.fire('nearManhole');
            return;
          }
          this.manholeHintShown = true;
          this.hud.toast('A manhole. Stand on the cover and press E to climb down into the sewers.', 5000);
          return;
        }
  }

  private manholeNear(): { label: string; act: () => void } | null {
    const p = this.player;
    const pos = p.position;
    const feet = p.feet.y;
    for (const m of this.mazes)
      for (const h of m.manholes) {
        if (this.layers.current !== 'sewer' && feet < 1.5 && Math.hypot(h.x - pos.x, h.z - pos.z) < 1.4) return { label: 'Climb down the manhole', act: () => this.useManhole(m, h, 'down') };
        if (this.layers.current === 'sewer' && Math.abs(feet - m.floor) < 2) {
          const c = blockCentre(m, h.i, h.j);
          if (Math.hypot(c.x - pos.x, c.z - SEWER.block * 0.3 - pos.z) < 1.6) return { label: 'Climb the ladder to the street', act: () => this.useManhole(m, h, 'up') };
        }
      }
    return null;
  }

  private useManhole(m: Maze, h: Manhole, dir: 'up' | 'down'): void {
    if (dir === 'down') {
      const c = blockCentre(m, h.i, h.j);
      const ok = this.transition('sewer', { x: c.x, y: SEWER.floor + 0.05, z: c.z }, { seconds: 1.6, label: 'The sewers' });
      if (ok && !this.progress.manholesFound.includes(h.id)) this.progress.manholesFound.push(h.id);
    } else {
      // Step off the cover onto the pavement.
      const off = [
        [1.2, 0],
        [-1.2, 0],
        [0, 1.2],
        [0, -1.2],
      ].find(([dx, dz]) => !this.peds.blocked(h.x + dx, h.z + dz)) ?? [0, 0];
      this.transition('street', { x: h.x + off[0], y: this.peds.groundY(h.x + off[0], h.z + off[1]) + 0.05, z: h.z + off[1] }, { seconds: 1.6 });
    }
    this.saveDirty = true;
  }

  /**
   * A field item from the team screen. The Escape Rope: underground, up and out at the nearest
   * manhole (onto the pavement beside it). Returns why it can't be used, or null when it was.
   */
  /**
   * Heal and field items from the team screen. null: used, close the screen; "✓ …": used, stay
   * open with the note; anything else: why not.
   */
  private useItem(id: string, target: Creature | null): string | null {
    if (!DATA.items.has(id)) return null;
    const it = itemSpec(id);
    if (this.bag.count(id) <= 0) return `No ${it.name} left.`;
    const p = this.player;
    const used = (note: string, close = false): string | null => {
      this.bag.take(id);
      this.saveDirty = true;
      if (close) {
        this.hud.toast(note, 2600);
        return null;
      }
      return `✓ ${note}`;
    };
    if (it.kind === 'heal') {
      if (this.battles.active) return 'Not in the middle of a fight.';
      const r = applyHeal(it, target, this.party.members, (c) => displayName(c));
      if (!r.ok) return r.note;
      audio.ui();
      return used(r.note);
    }
    if (typeof it['playerHeal'] === 'number') {
      if (p.health >= PLAYER.maxHealth) return "You're not hurt.";
      p.health = Math.min(PLAYER.maxHealth, p.health + (it['playerHeal'] as number));
      return used('You patch yourself up.');
    }
    if (typeof it['repel'] === 'number') {
      if (!this.party.lead) return 'You need a lead Streetmon for the musk to mean anything.';
      this.itemFx.repel = it['repel'] as number;
      return used(`Wild Streetmon below Lv ${this.party.lead.level} keep their distance for a while.`, true);
    }
    if (typeof it['attract'] === 'number') {
      this.itemFx.attract = it['attract'] as number;
      return used('The bait is out. Expect company.', true);
    }
    if (typeof it['lucky'] === 'number') {
      this.itemFx.lucky = it['lucky'] as number;
      return used('You squeeze the rabbit\'s foot. Feeling lucky.', true);
    }
    if (typeof it['levelUp'] === 'number') {
      if (!target) return 'Pick a Streetmon first.';
      if (target.level >= 100) return `${displayName(target)} can't get any stronger.`;
      const sp = species(target.speciesId);
      const need = xpForLevel(sp.growth, target.level + 1) - target.xp;
      const ev = gainXp(target, Math.max(1, need), { timeOfDay: phaseAt(this.hour), district: districtAt(this.layout, p.position.x, p.position.z) });
      for (const e of ev) if (e.kind === 'evolve') this.evoQueue.push({ creature: e.creature, to: e.to });
      return used(`${displayName(target)} downs the shake and grows to Lv ${target.level}!`);
    }
    if (typeof it['wantedDown'] === 'number') {
      const w = this.wanted;
      if (w.stars === 0) return "Nobody's looking for you.";
      if (w.stars >= 5) return 'At five stars nobody picks up.';
      w.stars -= 1;
      w.heat = w.stars > 0 ? STAR_HEAT[w.stars - 1] : 0;
      w.unseenFor = 0;
      return used('A favour called in. One star off.', true);
    }
    if (it['repair']) {
      const car = p.vehicle ?? this.lastDriven;
      if (!car || car.disposed || car.destroyed) return 'No car to fix.';
      if (!p.vehicle && Math.hypot(car.position.x - p.position.x, car.position.z - p.position.z) > 6) return 'Get next to the car first.';
      if (car.health >= car.spec.health && !car.tyresPopped) return "It's running fine.";
      car.health = car.spec.health;
      car.tyresPopped = false;
      car.flatFor = 0;
      return used(`The ${car.spec.name} is good as new.`, true);
    }
    if (id === 'lockpick') return 'Use it at a locked box.';
    return null;
  }

  private useFieldItem(id: string, target: Creature | null = null): string | null {
    if (id !== 'escapeRope') return this.useItem(id, target);
    if (this.layers.current !== 'sewer') return 'The Escape Rope only works underground.';
    const p = this.player;
    if (p.dead || this.battles.active || this.evolution.active || this.trans) return "You can't use that right now.";
    if (this.bag.count(id) <= 0) return 'No Escape Ropes left.';
    const all = this.mazes.flatMap((m) => m.manholes);
    if (!all.length) return 'No way up from here.';
    const h = all.reduce((a, b) => (Math.hypot(b.x - p.position.x, b.z - p.position.z) < Math.hypot(a.x - p.position.x, a.z - p.position.z) ? b : a));
    const off = [
      [1.2, 0],
      [-1.2, 0],
      [0, 1.2],
      [0, -1.2],
    ].find(([dx, dz]) => !this.peds.blocked(h.x + dx, h.z + dz)) ?? [0, 0];
    // The team screen closes first (the transition needs the game running).
    this.state = 'playing';
    const ok = this.transition('street', { x: h.x + off[0], y: this.peds.groundY(h.x + off[0], h.z + off[1]) + 0.05, z: h.z + off[1] }, { seconds: 2, label: 'You climb out into the daylight.' });
    if (!ok) {
      this.state = 'menu';
      return "You can't use that right now.";
    }
    this.bag.take(id);
    audio.ui();
    if (!this.progress.manholesFound.includes(h.id)) this.progress.manholesFound.push(h.id);
    this.saveDirty = true;
    return null;
  }

  /** Underground hazards under your feet, each physics step. */
  private sewerHazards(h: number): void {
    const p = this.player;
    const m = this.mazeAt(p.position.x, p.position.z);
    const b = m && blockAt(m, p.position.x, p.position.z);
    if (!m || !b) return;
    const hz = m.hazards.get(blockKey(b.i, b.j));
    if (!hz) return;
    const now = this.gameTime;
    const warn = (msg: string): void => {
      if (now - this.hazardToastAt > 4) {
        this.hazardToastAt = now;
        this.hud.toast(msg, 1800);
      }
    };
    if (hz.kind === 'sludge') {
      // Toxic sludge: wading eats your health, going under it eats it faster.
      p.takeDamage(SEWER.sludgeDps * h * (p.swimming ? 2.2 : p.waterState === 'wading' ? 1.4 : 1), 'env');
      this.sedatedUntil = Math.max(this.sedatedUntil, performance.now() + 250);
      warn('Toxic sludge! Get out of it.');
    } else if (hz.kind === 'vent' && ventActive(hz, now)) {
      p.takeDamage(SEWER.ventDps * h, 'env');
      if (p.velocity.y <= 0) p.velocity.y = 3.2;
      warn('Scalding steam!');
    } else if (hz.kind === 'channel') {
      p.push.x += hz.dx * SEWER.channelPush;
      p.push.z += hz.dz * SEWER.channelPush;
    }
    if (p.dead || p.health <= 0) this.kill('Overcome in the sewers');
  }

  /** Flashlight, lantern glow, flicker in the dark zones, vents. */
  private updateSewer(dt: number): void {
    const under = this.layers.current === 'sewer' && !this.interior;
    this.sewerView.update(this.gameTime, (m, k) => {
      const hz = m.hazards.get(k);
      return !!hz && hz.kind === 'vent' && ventActive(hz, this.gameTime);
    }, { x: this.player.position.x, y: this.player.feet?.y ?? this.player.position.y, z: this.player.position.z });
    if (!under) {
      this.flashlight.intensity = 0;
      this.lantern.intensity = 0;
      return;
    }
    const cam = this.camera;
    const dir = cam.getWorldDirection(this.tmp);
    const p = this.player.position;
    this.flashlight.position.set(p.x, p.y + 0.6, p.z);
    this.flashlight.target.position.set(p.x + dir.x * 10, p.y + 0.3 + dir.y * 10, p.z + dir.z * 10);
    this.lantern.position.set(p.x, p.y + 0.9, p.z);
    // Near a dark zone the torch stutters.
    const m = this.mazeAt(p.x, p.z);
    const b = m && blockAt(m, p.x, p.z);
    const nearDark = !!m && !!b && m.dark.some((d) => Math.abs(d.i - b.i) + Math.abs(d.j - b.j) <= SEWER.darkRadius);
    const flick = nearDark ? (Math.sin(this.gameTime * 37) > 0.2 && Math.random() > 0.15 ? 1 : 0.08) : 1;
    this.flashlight.intensity = 60 * flick;
    this.lantern.intensity = (nearDark ? 0.4 : 3) * (0.9 + 0.1 * Math.sin(this.gameTime * 7));
    void dt;
  }

  // ------------------------------------------------------------------ sewer community and quests

  /** World centre of a quest place (hub, chamber:N, deadEnd:N) in a district's maze. */
  private placeCentre(district: string, place: string): { x: number; z: number; m: Maze } | null {
    const m = this.mazes.find((z) => z.district === district);
    if (!m) return null;
    const [kind, nStr] = place.split(':');
    const n = Number(nStr ?? 0);
    const b = kind === 'hub' ? m.hub : kind === 'chamber' ? m.chambers[n % m.chambers.length] : m.deadEnds[n % m.deadEnds.length];
    const c = blockCentre(m, b.i, b.j);
    return { ...c, m };
  }

  private talkTo(n: NpcSpec): void {
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    this.showNode(n, openingNode(n, this.progress.quests));
  }

  /** Shows a dialogue node, running its action first (start or hand in a quest, shop, rest). */
  private showNode(n: NpcSpec, id: string): void {
    const node = n.dialogue.nodes[id];
    let text = node.text;
    let choices = node.choices;
    const act = node.do ?? '';
    if (act.startsWith('startQuest:')) {
      const q = questSpec(act.slice(11));
      const can = canStart(this.progress.quests, q, this.progress.reputation);
      if (can.ok) {
        this.progress.quests = startQuest(this.progress.quests, q.id);
        for (const [it, k] of q.start?.items ?? []) this.bag.add(it, k);
        this.hud.toast(`New quest: ${q.name}`, 2500);
        this.saveDirty = true;
      } else if (!this.progress.quests[q.id]) {
        text = `Come back when the folks down here trust you more. (Reputation ${this.progress.reputation} of ${q.requiresReputation})`;
        choices = [['All right.', 'end']];
      }
    } else if (act.startsWith('turnIn:')) {
      const qid = act.slice(7);
      const st = currentStep(this.progress.quests, qid);
      if (st?.type === 'talk' && st.npc === n.id) this.advance(qid);
    } else if (act === 'shop') {
      this.dialogue.close();
      this.openMarket(n);
      return;
    } else if (act === 'rest') {
      if (this.money >= 40) {
        this.money -= 40;
        this.party.healAll(magazine);
        audio.cash();
        this.saveDirty = true;
      } else {
        text = "You're short, love. Come back with forty.";
      }
    }
    this.dialogue.show(
      n.name,
      text,
      choices.map(([label]) => label),
      (i) => {
        const next = choices[i]?.[1] ?? 'end';
        if (next === 'end') this.dialogue.close();
        else this.showNode(n, next);
      },
      () => this.closeMenu(),
      n.role === 'market' ? `Reputation ${this.progress.reputation}` : '',
    );
  }

  private openMarket(n: NpcSpec): void {
    this.state = 'menu';
    this.clinicMenu.open({
      captureLocked: this.captureLock(),
      title: `${n.name}: black market`,
      // The rope is always on the counter down here.
      stock: [...marketStock(this.dayCount, this.progress.reputation), { id: 'escapeRope', price: 300 }],
      bag: this.bag,
      money: () => this.money,
      spend: (amount) => {
        if (this.money < amount) return false;
        this.money -= amount;
        this.saveDirty = true;
        audio.cash();
        return true;
      },
      onClose: () => this.closeMenu(),
      onTeam: () => this.openTeam(),
    });
  }

  /** Next step of a quest; rewards when it's finished. */
  private advance(id: string): void {
    const q = questSpec(id);
    const r = advanceQuest(this.progress.quests, id);
    this.progress.quests = r.state;
    this.saveDirty = true;
    if (!r.finished) {
      const st = currentStep(this.progress.quests, id);
      if (st) this.hud.toast(`${q.name}: ${st.text}`, 3000);
      return;
    }
    const got: string[] = [];
    if (q.rewards.cash) {
      this.money += q.rewards.cash;
      got.push(`$${q.rewards.cash}`);
    }
    for (const [it, k] of q.rewards.items ?? []) {
      this.bag.add(it, k);
      got.push(`${k} ${itemSpec(it).name}`);
    }
    if (q.rewards.reputation) {
      this.progress.reputation += q.rewards.reputation;
      got.push(`+${q.rewards.reputation} reputation`);
    }
    audio.cash();
    this.hud.toast(`Quest complete: ${q.name} (${got.join(', ')})`, 4000);
  }

  /** The quest step to show and point at: the one in the maze you're in, else the latest. */
  private trackedQuest(): { id: string; step: NonNullable<ReturnType<typeof currentStep>> } | null {
    const active = COMMUNITY.quests.filter((q) => currentStep(this.progress.quests, q.id));
    if (!active.length) return null;
    const here = this.mazeAt(this.player.position.x, this.player.position.z)?.district;
    const q = active.find((x) => x.district === here) ?? active[active.length - 1];
    return { id: q.id, step: currentStep(this.progress.quests, q.id)! };
  }

  private updateCommunity(dt: number): void {
    const p = this.player;
    const pos = p.position;
    const under = this.layers.current === 'sewer';
    this.questBattleCd = Math.max(0, this.questBattleCd - dt);
    for (const l of this.questLater.filter((x) => this.gameTime >= x.at)) {
      this.questLater.splice(this.questLater.indexOf(l), 1);
      this.advance(l.id);
    }
    // People: stream models in when you're down in their maze.
    for (const n of this.people) {
      const near = under && Math.hypot(n.x - pos.x, n.z - pos.z) < 70;
      if (near && !n.model) {
        const skin = ['#8d5a3b', '#e0b48f', '#c08a5c', '#6b4530'][n.spec.id.length % 4];
        // Sewer folk live rough: faded, grimy, layered (their own colours under the dirt).
        let rs = [...n.spec.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
        const rnd = (): number => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
        const m = new Humanoid(weatheredLook({ skin, shoes: '#2a2620', scale: n.spec.look.build === 'f' ? 0.96 : 1, ...n.spec.look }, rnd));
        this.scene.add(m.root);
        n.model = m;
      } else if (!near && n.model) {
        n.model.root.removeFromParent();
        n.model = null;
      }
      if (!n.model) continue;
      const d = Math.hypot(n.x - pos.x, n.z - pos.z);
      if (d < 8) n.heading += (Math.atan2(-(pos.z - n.z), pos.x - n.x) - n.heading) * Math.min(1, dt * 3);
      n.model.root.position.set(n.x, n.y, n.z);
      n.model.root.rotation.y = n.heading;
      n.model.update(dt, 0, true);
    }
    // Objective line and its target.
    const tq = this.trackedQuest();
    this.objectiveEl.style.display = tq && this.state === 'playing' && (this.races?.state ?? 'IDLE') === 'IDLE' ? 'block' : 'none';
    if (tq) this.objectiveEl.innerHTML = `<b>${questSpec(tq.id).name}</b>${tq.step.text}`;
    // Quest steps that happen in the world.
    for (const q of COMMUNITY.quests) {
      const st = currentStep(this.progress.quests, q.id);
      if (!st || !st.place) continue;
      const pc = this.placeCentre(q.district, st.place);
      if (!pc) continue;
      const inMaze = under && this.mazeAt(pos.x, pos.z) === pc.m;
      const dPlace = Math.hypot(pc.x - pos.x, pc.z - pos.z);
      if (st.type === 'reach' && inMaze && dPlace < 4) this.advance(q.id);
      else if (st.type === 'collect') this.updatePickup(q.id, pc, inMaze);
      else if (st.type === 'battle' && inMaze && dPlace < 6 && !this.battles.active && this.questBattleCd <= 0 && !this.questBattle && this.party.canFight && !this.trans) {
        this.questBattle = q.id;
        const team = st.team!.map(([sp, lvl]) => createCreature(sp, lvl));
        this.startTeamBattle({ kind: 'npc', name: st.name ?? 'Feral pack', intro: `${st.name ?? 'Feral Streetmon'}! They won't let you pass.`, team, foePos: new THREE.Vector3(pc.x, SEWER.floor, pc.z), canRun: true });
      } else if (st.type === 'escort') this.updateEscort(q.id, st.species!, pc, inMaze, dt);
      else if (st.type === 'raid' && inMaze && dPlace < 16 && !this.battles.active && !this.raidWorld.active && !this.trans) {
        // Wakes the legendary in the chamber (it can be retried after a short cooldown if it gets away).
        this.raidWorld.trigger(st.legendary!, { x: pc.x, y: SEWER.floor, z: pc.z, biome: 'sewer' }, q.id);
      }
    }
  }

  private updatePickup(questId: string, pc: { x: number; z: number }, inMaze: boolean): void {
    const step = this.progress.quests[questId]?.step ?? 0;
    if (this.questPickup && (this.questPickup.questId !== questId || this.questPickup.step !== step)) {
      this.questPickup.mesh.removeFromParent();
      this.questPickup = null;
    }
    if (!inMaze) return;
    if (!this.questPickup) {
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 1.4 }));
      mesh.position.set(pc.x, SEWER.floor + 0.8, pc.z);
      this.scene.add(mesh);
      this.questPickup = { questId, step, mesh };
    }
    this.questPickup.mesh.rotation.y += 0.03;
    this.questPickup.mesh.position.y = SEWER.floor + 0.8 + Math.sin(this.gameTime * 3) * 0.1;
  }

  private collectPickup(): void {
    const pk = this.questPickup;
    if (!pk) return;
    pk.mesh.removeFromParent();
    this.questPickup = null;
    audio.cash();
    this.advance(pk.questId);
  }

  /** A lost Streetmon waits at the place; once you reach it, it follows you to the destination. */
  private updateEscort(questId: string, species: string, pc: { x: number; z: number; m: Maze }, inMaze: boolean, dt: number): void {
    let e = this.questEscort;
    if (e && e.questId !== questId) {
      e.inst?.dispose();
      e = this.questEscort = null;
    }
    if (!e) e = this.questEscort = { questId, inst: null, loading: false, x: pc.x, z: pc.z, following: false };
    if (!inMaze) {
      if (e.inst) e.inst.root.visible = false;
      return;
    }
    if (!e.inst && !e.loading) {
      e.loading = true;
      void this.creatureModels.instance(species).then((inst) => {
        if (this.questEscort !== e) return inst.dispose();
        e!.inst = inst;
        e!.loading = false;
        this.scene.add(inst.root);
      });
    }
    const pos = this.player.position;
    if (!e.following && Math.hypot(e.x - pos.x, e.z - pos.z) < 2.5) {
      e.following = true;
      this.hud.toast('It sniffs your hand and starts following you.', 2500);
    }
    let speed = 0;
    if (e.following) {
      const dx = pos.x - e.x;
      const dz = pos.z - e.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.6) {
        speed = Math.min(6, d * 2);
        e.x += (dx / d) * speed * dt;
        e.z += (dz / d) * speed * dt;
      }
      if (d > 15) {
        e.x = pos.x - dx / d;
        e.z = pos.z - dz / d;
      }
    }
    if (e.inst) {
      e.inst.root.visible = true;
      e.inst.root.position.set(e.x, SEWER.floor, e.z);
      if (speed > 0) e.inst.root.rotation.y = Math.atan2(pos.x - e.x, pos.z - e.z);
      e.inst.play(speed > 0.3 ? 'walk' : 'idle');
      e.inst.mixer.update(dt);
    }
    // Home: the destination (the hub).
    const st = currentStep(this.progress.quests, questId);
    const to = st?.to ? this.placeCentre(questSpec(questId).district, st.to) : null;
    if (e.following && to && Math.hypot(to.x - e.x, to.z - e.z) < 6) {
      e.inst?.dispose();
      this.questEscort = null;
      this.advance(questId);
    }
  }

  /** A spot in the middle of the reachable low roof nearest a point (rooftop trainers). */
  private roofSpotNear(x: number, z: number): { x: number; y: number; z: number } | null {
    let best: RooftopPlan['roofs'][number] | null = null;
    let bd = Infinity;
    for (const r of this.roofPlan.roofs) {
      if (r.kind !== 'roof' || !this.roofPlan.reachable.has(r.id) || Math.min(r.rect.x1 - r.rect.x0, r.rect.z1 - r.rect.z0) < 10) continue;
      const d = Math.hypot((r.rect.x0 + r.rect.x1) / 2 - x, (r.rect.z0 + r.rect.z1) / 2 - z);
      // Keep clear of jump pads and stashes.
      const busy = this.roofPlan.pads.some((p) => p.fromRoof === r.id || p.toRoof === r.id) || this.roofPlan.stashes.some((st) => st.roofId === r.id);
      if (!busy && d < bd) {
        bd = d;
        best = r;
      }
    }
    return best ? { x: (best.rect.x0 + best.rect.x1) / 2, y: best.top, z: (best.rect.z0 + best.rect.z1) / 2 } : null;
  }

  /** The trader stands a few steps from the top of a Midtown fire escape. */
  private placeRoofTrader(): { x: number; y: number; z: number; heading: number; model: Humanoid | null } | null {
    const mids = this.roofPlan.access.filter((a) => a.kind === 'fireEscape' && a.district === 'midtown');
    if (!mids.length) return null;
    const cx = mids.reduce((s, a) => s + a.roof.x, 0) / mids.length;
    const cz = mids.reduce((s, a) => s + a.roof.z, 0) / mids.length;
    const a = mids.reduce((b, m) => (Math.hypot(m.roof.x - cx, m.roof.z - cz) < Math.hypot(b.roof.x - cx, b.roof.z - cz) ? m : b));
    const r = this.roofPlan.roofs[a.roofId].rect;
    const mx = (r.x0 + r.x1) / 2;
    const mz = (r.z0 + r.z1) / 2;
    const dx = mx - a.roof.x;
    const dz = mz - a.roof.z;
    const len = Math.hypot(dx, dz) || 1;
    const step = Math.min(3, len * 0.6);
    const x = a.roof.x + (dx / len) * step;
    const z = a.roof.z + (dz / len) * step;
    return { x, y: a.roof.y, z, heading: Math.atan2(-(a.roof.z - z), a.roof.x - x), model: null };
  }

  private updateRoofTrader(dt: number): void {
    const t = this.roofTrader;
    if (!t) return;
    const p = this.player.position;
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d < 120 && !t.model) {
      const m = new Humanoid({ skin: '#c99a6e', hair: '#d8d8d8', top: '#3aa6d9', legs: '#2a2d33', shoes: '#151515', scale: 1 });
      // A hi-vis vest and a crate of goods.
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.3), withSurface(new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6 }), 'fabric'));
      vest.position.set(0, 1.25, 0);
      m.root.add(vest);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), withSurface(new THREE.MeshStandardMaterial({ color: 0x3d4a6b, roughness: 0.6 }), 'paintedMetal'));
      crate.position.set(0.9, 0.35, 0.3);
      m.root.add(crate);
      m.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.scene.add(m.root);
      t.model = m;
    } else if (d > 150 && t.model) {
      t.model.root.removeFromParent();
      t.model = null;
    }
    if (!t.model) return;
    if (d < 12 && Math.abs(this.player.feet.y - t.y) < 3) t.heading += (Math.atan2(-(p.z - t.z), p.x - t.x) - t.heading) * Math.min(1, dt * 3);
    t.model.root.position.set(t.x, t.y, t.z);
    t.model.root.rotation.y = t.heading;
    t.model.update(dt, 0, true);
  }

  private openRoofTrader(): void {
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    this.clinicMenu.open({
      captureLocked: this.captureLock(),
      title: 'Skyline Trader',
      stock: [
        { id: 'sparkPlug', price: 1200 },
        { id: 'steelCase', price: 2000 },
        { id: 'crate', price: 240 },
      ],
      bag: this.bag,
      money: () => this.money,
      spend: (n) => {
        if (this.money < n) return false;
        this.money -= n;
        this.saveDirty = true;
        audio.cash();
        return true;
      },
      onClose: () => this.closeMenu(),
      onTeam: () => this.openTeam(),
    });
  }

  private useAccess(a: Access, dir: 'up' | 'down'): void {
    const to = dir === 'up' ? a.roof : a.street;
    const lift = a.kind === 'elevator';
    const ok = this.transition(dir === 'up' ? 'roof' : 'street', { x: to.x, y: to.y + 0.05, z: to.z }, {
      seconds: lift ? 3 : 2.5,
      label: lift ? (dir === 'up' ? 'Roof' : 'Ground floor') : '',
    });
    if (ok) {
      if (lift) audio.door();
      this.saveDirty = true;
    }
  }

  private openStash(s: Stash): void {
    if (this.progress.stashesOpened.includes(s.id)) return;
    this.progress.stashesOpened.push(s.id);
    this.roofView.setStashOpen(s.id, true);
    const got: string[] = [];
    for (const [what, n] of s.loot) {
      if (what === 'cash') {
        this.money += n;
        got.push(`$${n}`);
      } else {
        this.bag.add(what, n);
        const name = itemSpec(what).name;
        got.push(name.endsWith('s') ? (n === 1 ? `a pair of ${name}` : `${n} pairs of ${name}`) : `${n} ${name}${n > 1 ? 's' : ''}`);
      }
    }
    audio.cash();
    this.hud.toast(`${s.secret ? 'Hidden stash' : 'Stash'}: ${got.join(', ')}`, 3000);
    this.saveDirty = true;
  }

  /** Stepping onto a jump pad launches you onto the neighbouring roof. */
  private checkJumpPads(): void {
    const p = this.player;
    if (this.layers.current !== 'roof' || p.isLaunched) return;
    const pos = p.position;
    const feetY = p.feet.y;
    for (const pad of this.roofPlan.pads) {
      if (Math.hypot(pad.x - pos.x, pad.z - pos.z) > (pad.hidden ? 0.75 : 1.0) || Math.abs(pad.y - feetY) > 0.6) continue;
      // Start the arc from the pad centre so it lands where it was aimed.
      p.teleport(pad.x, pad.y + 0.02, pad.z);
      p.launch(pad.vx, pad.vy, pad.vz);
      this.lastPad = { pad, at: this.gameTime };
      audio.door();
      if (pad.hidden) this.hud.toast('A hidden jump!', 1500);
      return;
    }
  }

  /**
   * Hard landings hurt: from about 9 m up, worse the faster you land; from about 35 m it kills.
   * A jump pad that misses its roof puts you back on the pad instead.
   */
  /** Out of the pond onto the grass past the rim. `quick`: no fuss (a fight's starting). */
  private climbOut(quick = false): void {
    const p = this.player;
    const e = this.waterEdge(p.position.x, p.position.z);
    if (!e) return;
    this.pond.ripple(p.position.x, p.position.z, 1.6);
    this.splashFx(p.position.x, p.position.z, 0.6);
    p.teleport(e.outX, e.outY, e.outZ);
    if (!quick) audio.sfx('sfx_climb', 0);
  }

  /** Droplets and ripples where something hits the water (`size` 0.5 a stroke .. 3 a car). */
  private splashFx(x: number, z: number, size: number): void {
    const y = POND.surface + 0.05;
    this.effects.burst({ x, y, z, count: Math.round(8 + size * 12), r: 0.85, g: 0.93, b: 1, speed: 1.6 + size * 1.4, up: 2.5 + size * 2, life: 0.8 + size * 0.15, size0: 0.07 + size * 0.03, size1: 0.03, additive: false, lift: -9 });
    this.effects.burst({ x, y, z, count: Math.round(2 + size * 2), r: 0.9, g: 0.95, b: 1, speed: 0.6 + size * 0.4, up: 0.2, life: 1.2, size0: 0.4 * size, size1: 1.2 * size, alpha: 0.35, additive: false, drag: 1.5, flat: true });
    this.pond.ripple(x, z, 0.8 + size * 1.4);
  }

  /** Every frame: splashes and strokes for you in the pond. */
  private pondPlayer(dt: number): void {
    const p = this.player;
    if (p.splash > 0) {
      const k = Math.min(3, p.splash / 3.5);
      this.splashFx(p.position.x, p.position.z, 0.6 + k);
      audio.sfx(k > 1.2 ? 'sfx_splash_big' : 'sfx_splash', p.position);
      p.splash = 0;
      this.tut?.action('swim');
    }
    if (p.onFoot && p.waterState !== 'dry') {
      const moving = Math.hypot(p.velocity.x, p.velocity.z) > 0.4;
      this.strokeClock -= dt;
      if (this.strokeClock <= 0) {
        this.strokeClock = p.swimming ? (moving ? 0.55 : 1.4) : moving ? 0.45 : 2;
        this.pond.ripple(p.position.x, p.position.z, p.swimming ? 1.1 : 0.7);
        if (moving) {
          audio.sfx(p.swimming ? 'sfx_swim' : 'sfx_wade', p.position);
          if (p.swimming) this.effects.burst({ x: p.position.x, y: POND.surface + 0.05, z: p.position.z, count: 4, r: 0.85, g: 0.93, b: 1, speed: 1.2, up: 1.6, life: 0.6, size0: 0.06, size1: 0.03, additive: false, lift: -9 });
        }
      }
    }
  }

  /**
   * Cars in the pond, every physics step: buoyancy at the corners of the underside (so it lists
   * and noses down as it should), water drag, and flooding: it floats a few seconds, the engine
   * drowns once the water's over it, and it settles on the bed. A sunk car is gone once you're
   * well away (a car you own is towed to the Chop Shop).
   */
  private pondCars(h: number): void {
    const L = this.layout.parkLake;
    for (const c of [...this.vehicles.cars]) {
      if (c.disposed) continue;
      const pos = c.position;
      let w = this.carWater.get(c);
      if (!inLake(L, pos.x, pos.z, -4)) {
        if (w) stepCarWater(w, 0, h);
        continue;
      }
      if (!w) {
        w = newCarWater();
        this.carWater.set(c, w);
      }
      const q = c.quaternion;
      const hx = c.spec.length / 2 - 0.15;
      const hz = c.spec.width / 2 - 0.1;
      const hy = (c.spec.height * 0.62 - c.spec.clearance) / 2;
      const pts = [
        [hx, -hy, hz],
        [hx, -hy, -hz],
        [-hx, -hy, hz],
        [-hx, -hy, -hz],
        [0, -hy, 0],
      ].map(([x, y, z]) => this.tmp.set(x, y, z).applyQuaternion(q).add(pos).clone());
      const inside = pts.map((p) => inLake(L, p.x, p.z));
      const sub = submersion(
        pts.map((p, i) => (inside[i] ? p.y : 99)),
        c.spec.height,
        waveY(pos.x, pos.z, this.gameTime),
      );
      const wasDry = w.wetFor === 0;
      stepCarWater(w, sub.avg, h);
      if (sub.avg <= 0) continue;
      const lv = c.body.linvel();
      const speed = Math.hypot(lv.x, lv.y, lv.z);
      if (wasDry && sub.avg > 0.02 && speed > 2) {
        const k = Math.min(3, 1 + speed / 6);
        this.splashFx(pos.x, pos.z, k);
        audio.sfx('sfx_splash_big', pos);
        if (c === this.player.vehicle) this.hud.toast("You're in the pond!", 2000);
      }
      const mass = c.body.mass();
      const lift = carLift(w);
      pts.forEach((p, i) => {
        const s = sub.each[i];
        if (s <= 0) return;
        c.body.applyImpulseAtPoint({ x: 0, y: (mass * 9.81 * lift * s * h) / pts.length, z: 0 }, { x: p.x, y: p.y, z: p.z }, true);
      });
      const a = sub.avg;
      c.body.applyImpulse({ x: -lv.x * mass * POND.dragH * a * h, y: -lv.y * mass * POND.dragV * a * h, z: -lv.z * mass * POND.dragH * a * h }, true);
      const av = c.body.angvel();
      const k = Math.max(0, 1 - POND.dragSpin * a * h);
      c.body.setAngvel({ x: av.x * k, y: av.y * k, z: av.z * k }, true);
      if (w.stalled && c === this.player.vehicle && !this.floodTold.has(c)) {
        this.floodTold.add(c);
        this.hud.toast("The engine's flooded. Get out (F) and swim for it!", 3500);
      }
      if (w.stalled && c.driver && c.driver !== 'player') c.driver = null;
      // Sunk and abandoned: gone once you're away from it.
      if (w.flood >= 1 && c !== this.player.vehicle && Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z) > 35) this.vehicles.remove(c);
    }
  }

  private checkFall(): void {
    const p = this.player;
    const lp = this.lastPad;
    if (lp && this.gameTime - lp.at < lp.pad.flight + 1.5 && p.feet.y < lp.pad.y - 3) {
      p.teleport(lp.pad.x - (lp.pad.vx / Math.hypot(lp.pad.vx, lp.pad.vz)) * 1.6, lp.pad.y + 0.05, lp.pad.z - (lp.pad.vz / Math.hypot(lp.pad.vx, lp.pad.vz)) * 1.6);
      this.lastPad = null;
      this.hud.toast('Missed! Try again.', 1500);
      return;
    }
    if (lp && this.gameTime - lp.at > lp.pad.flight + 1.5) this.lastPad = null;
    const v = p.landingSpeed;
    if (v <= 0) return;
    p.landingSpeed = 0;
    if (v < 13) return;
    if (v >= 26) {
      this.kill('You fell from a roof');
      return;
    }
    p.takeDamage((v - 13) * 9, 'env');
    this.rig.shake(0.02);
    audio.crash(Math.min(1, (v - 13) / 13), 0);
  }

  // ------------------------------------------------------------------ cars hitting Streetmon

  /**
   * Cars against Streetmon, every physics step: each moving car near the player is tested against
   * nearby wild Streetmon (and, for your car, the foe in a real-time battle). Your own follower is
   * never hit. Damage scales with speed, the car's weight class and the creature's weight.
   */
  private carCreatureImpacts(): void {
    const p = this.player;
    const centre = p.vehicle ? p.vehicle.position : p.position;
    const now = performance.now();
    for (const car of this.vehicles.cars) {
      if (car.disposed || car.destroyed) continue;
      const cp = car.position;
      if (Math.hypot(cp.x - centre.x, cp.z - centre.z) > IMPACT.range) continue;
      const lv = car.body.linvel();
      if (Math.hypot(lv.x, lv.z) < IMPACT.activeSpeed) continue;
      const mine = car === p.vehicle;
      const halfL = car.spec.length / 2;
      const halfW = car.spec.width / 2;
      const h = car.heading;
      const cls = weightClassOf(car.spec.mass);
      for (const w of this.spawns.wild) {
        if (w.removed || w.pinned || w.inPod || w.state === 'fainted' || w.creature.hp <= 0 || !w.inst) continue;
        if ((w.hitCooldownUntil ?? 0) > now) continue;
        if (w.y + (w.alt ?? 0) > cp.y + 1.5 || w.y < cp.y - 3) continue; // over the roof (or flying), or another layer below
        const r = Math.max(0.3, w.spec.model.height * 0.4);
        if (Math.abs(w.x - cp.x) > halfL + r + 0.5 || Math.abs(w.z - cp.z) > halfL + r + 0.5) continue;
        const hit = carCircleContact(cp.x, cp.z, h, halfL, halfW, w.x, w.z, r);
        if (!hit) continue;
        const sp = w.spec;
        const res = resolveImpact({
          carVx: lv.x,
          carVz: lv.z,
          nx: hit.nx,
          nz: hit.nz,
          carMass: car.spec.mass,
          cls,
          weightKg: sp.model.weightKg ?? defaultWeightKg(sp.model.height, sp.types),
          heavyType: sp.types.includes('concrete'),
          hp: w.creature.hp,
          maxHp: maxHpOf(w.creature),
        });
        if (!res) continue;
        w.hitCooldownUntil = now + IMPACT.cooldown * 1000;
        if (w.boss) {
          // A raid legendary doesn't budge: the car crumples and bounces off.
          const sp2 = Math.hypot(lv.x, lv.z);
          car.body.setLinvel({ x: -hit.nx * sp2 * 0.25, y: lv.y + 1.5, z: -hit.nz * sp2 * 0.25 }, true);
          car.damage(60 + sp2 * 12);
          car.lastImpactAt = now;
          this.effects.impact(w.x, w.y + w.spec.model.height * 0.3, w.z, true);
          audio.crash(Math.min(1, sp2 / 20), cp);
          if (mine) this.shakeCamera(Math.min(1, sp2 / 25));
          continue;
        }
        // Out of the car's footprint, then the hit.
        w.x += hit.nx * hit.depth;
        w.z += hit.nz * hit.depth;
        if (res.damage > 0) {
          w.creature.hp = Math.max(0, w.creature.hp - res.damage);
          this.dmgNums.spawn(w.x, w.y + sp.model.height + 0.3, w.z, res.damage, res.crit || w.creature.hp <= 0 ? 'crit' : 'hit');
        }
        this.spawns.knockBack(w, res.vx, res.vy, res.vz, cp.x, cp.z);
        this.markSeen(sp.id);
        car.body.setLinvel({ x: lv.x * (1 - res.carSlow), y: lv.y, z: lv.z * (1 - res.carSlow) }, true);
        if (res.carDamage > 0) car.damage(res.carDamage);
        this.effects.impact(w.x, w.y + sp.model.height * 0.5, w.z, false);
        audio.crash(Math.min(1, 0.15 + res.damage / 60), cp);
        if (mine && w.creature.hp <= 0) this.hud.toast(`You knocked out the wild ${sp.name}.`, 2000);
      }
      // Real-time battles: your car can hit the foe.
      if (mine && this.battles.active && this.battles.mode === 'realtime') {
        for (const t of this.battles.foeTargets()) {
          const c = t.c.creature;
          if (c.hp <= 0) continue;
          const key = t.c as unknown as { carHitAt?: number };
          if ((key.carHitAt ?? 0) > now) continue;
          const r = Math.max(0.3, t.height * 0.4);
          const hit = carCircleContact(cp.x, cp.z, h, halfL, halfW, t.x, t.z, r);
          if (!hit) continue;
          const sp = species(c.speciesId);
          const res = resolveImpact({ carVx: lv.x, carVz: lv.z, nx: hit.nx, nz: hit.nz, carMass: car.spec.mass, cls, weightKg: sp.model.weightKg ?? defaultWeightKg(sp.model.height, sp.types), heavyType: sp.types.includes('concrete'), hp: c.hp, maxHp: maxHpOf(c) });
          if (!res || res.damage <= 0) continue;
          key.carHitAt = now + IMPACT.cooldown * 1000;
          const before = c.hp;
          this.battles.playerAttack(t.c, res.damage);
          this.dmgNums.spawn(t.x, t.y + t.height + 0.3, t.z, Math.min(before, res.damage), res.damage >= before ? 'crit' : 'hit');
          car.body.setLinvel({ x: lv.x * (1 - res.carSlow), y: lv.y, z: lv.z * (1 - res.carSlow) }, true);
          if (res.carDamage > 0) car.damage(res.carDamage);
          this.effects.impact(t.x, t.y + t.height * 0.5, t.z, false);
          audio.crash(Math.min(1, 0.15 + res.damage / 60), 0);
        }
      }
    }
  }

  // ------------------------------------------------------------------ arrest battles and random challengers

  /** The police grab you: half the time (once per chase) an officer's Streetmon gives you a chance to fight free. */
  private onArrested(): void {
    if (this.races?.active) {
      this.raceFailOut('busted');
      return;
    }
    if (!this.arrestBattleUsed && !this.battles.active && !this.evolution.active && this.party.canFight && Math.random() < 0.5) {
      this.arrestBattleUsed = true;
      if (this.player.vehicle) this.exitVehicle();
      const p = this.player.position;
      const officer = this.police.nearestOfficer(p.x, p.z, 30);
      const lead = this.party.lead!;
      const lvl = (d: number): number => Math.max(3, Math.min(100, Math.round(lead.level + this.wanted.stars - 1 + d)));
      const roster = ['slugger', 'cinderblock', 'rebarb', 'hustlepup', 'holster', 'overpass'];
      const n = this.wanted.stars >= 4 ? 2 : 1;
      const team: Creature[] = [];
      for (let i = 0; i < n; i++) team.push(createCreature(roster[Math.floor(Math.random() * roster.length)], lvl(i - 1)));
      const at = officer ? new THREE.Vector3(officer.x, 0, officer.z) : p.clone().add(new THREE.Vector3(4, 0, 0));
      this.startTeamBattle({ kind: 'police', name: 'Officer', intro: '"K-9 unit! Get him!" The police set their Streetmon on you. Win and you can run for it.', team, foePos: at, canRun: false });
      return;
    }
    this.busted();
  }

  private startTeamBattle(o: { kind: 'npc' | 'police'; name: string; intro: string; team: Creature[]; foePos: THREE.Vector3; canRun: boolean; ped?: Ped }): void {
    this.aiming = false;
    this.player.facingOverride = Math.atan2(-(o.foePos.z - this.player.position.z), o.foePos.x - this.player.position.x);
    this.battles.mode = BATTLE.mode;
    if (BATTLE.mode === 'turn') {
      if (this.input.pointerLocked) document.exitPointerLock();
      this.hud.setVisible(false);
    }
    this.battleLook.copy(this.player.position);
    this.battles.setPlayer(this.player.position);
    this.battles.startTeam(this.party, o);
  }

  /** Every so often someone in the street walks over and challenges you. */
  private updateChallenger(dt: number): void {
    const p = this.player;
    // Passers-by on the street only challenge you on the street (not up on a roof or down in the sewers).
    const free = p.onFoot && !p.dead && !this.battles.active && !this.evolution.active && !this.throwing && this.party.canFight && this.wanted.stars === 0 && this.state === 'playing' && this.layers.current === 'street';
    const ch = this.challenger;
    if (ch) {
      const ped = ch.ped;
      const d = Math.hypot(ped.x - p.position.x, ped.z - p.position.z);
      if (!free || ped.state === 'dead' || ped.state === 'down' || ped.state === 'fly' || d > 40) {
        this.endChallenger(true);
        return;
      }
      // Walk over (the ped's own logic is paused with the 'cop' state).
      ped.state = 'cop';
      ped.heading = Math.atan2(-(p.position.z - ped.z), p.position.x - ped.x);
      if (d > 2.4) {
        const sp = 2.4 * dt;
        ped.x += ((p.position.x - ped.x) / d) * sp;
        ped.z += ((p.position.z - ped.z) / d) * sp;
        ped.speed = 2.4;
      } else {
        ped.speed = 0;
        const c = ch;
        this.endChallenger(false);
        this.startTeamBattle({ kind: 'npc', name: c.name, intro: `${c.name}: "${pick(NPC_LINES)}"`, team: c.team, foePos: new THREE.Vector3(c.ped.x, 0, c.ped.z), canRun: true, ped: c.ped });
        this.npcPending = c;
        return;
      }
      ch.bubble.position.set(ped.x, ped.y + 2.25, ped.z);
      return;
    }
    if (!free) return;
    this.challengeTimer -= dt;
    if (this.challengeTimer > 0) return;
    this.challengeTimer = 50 + Math.random() * 70;
    const lead = this.party.lead!;
    // Someone nearby who's just walking along.
    const cands = this.peds.peds.filter((q) => q.role === 'civ' && q.state === 'walk' && Math.hypot(q.x - p.position.x, q.z - p.position.z) > 8 && Math.hypot(q.x - p.position.x, q.z - p.position.z) < 28);
    if (!cands.length) return;
    const ped = cands[Math.floor(Math.random() * cands.length)];
    const district = districtAt(this.layout, ped.x, ped.z);
    const table = spawnTable(district, phaseAt(this.hour));
    const n = 1 + Math.floor(Math.random() * Math.min(3, 1 + lead.level / 10));
    const team: Creature[] = [];
    for (let i = 0; i < n && table.length; i++) {
      const sp = table[Math.floor(Math.random() * table.length)].spec;
      team.push(createCreature(sp.id, Math.max(2, Math.min(100, lead.level - 2 + Math.floor(Math.random() * 4)))));
    }
    if (!team.length) return;
    this.challenger = { ped, name: pick(NPC_NAMES), team, bubble: makeBubble() };
    this.scene.add(this.challenger.bubble);
    this.hud.toast('Someone wants to battle you!', 2000);
  }

  private npcPending: { ped: Ped; name: string; team: Creature[] } | null = null;

  private endChallenger(release: boolean): void {
    const ch = this.challenger;
    if (!ch) return;
    ch.bubble.removeFromParent();
    if (release && ch.ped.state === 'cop' && ch.ped.role === 'civ') ch.ped.state = 'walk';
    this.challenger = null;
  }

  // ------------------------------------------------------------------ starter

  private showStarterPicker(): void {
    this.state = 'starter';
    if (this.input.pointerLocked) document.exitPointerLock();
    const el = document.createElement('div');
    el.className = 'overlay starter';
    const cards = BATTLE.starters
      .map((id, i) => {
        const sp = species(id);
        const t = sp.types.map((ty) => `<span class="tbadge" style="background:${typeInfo(ty).color}">${typeInfo(ty).name}</span>`).join('');
        const st = (['hp', 'attack', 'defense', 'speed'] as const)
          .map((k) => `<div class="st"><span>${k === 'hp' ? 'HP' : k[0].toUpperCase() + k.slice(1)}</span><i style="width:${Math.min(100, sp.base[k])}%"></i></div>`)
          .join('');
        return `<button class="starter-card" data-id="${id}"><kbd>${i + 1}</kbd><div class="sc-name">${sp.name}</div><div class="sc-types">${t}</div><div class="sc-desc">${sp.description}</div><div class="sc-stats">${st}</div></button>`;
      })
      .join('');
    el.innerHTML = `<div class="logo small">PICK YOUR FIRST STREETMON</div>
      <div class="sub">Mama Rust: "Take your pick, kid." Concrete beats Gun, Gun beats Bass, Bass beats Concrete.</div>
      <div class="starter-row">${cards}</div>`;
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button.starter-card') as HTMLButtonElement | null;
      if (b) this.chooseStarter(b.dataset['id']!);
    });
    this.container.appendChild(el);
    this.starterEl = el;
  }

  private starterKeys(): void {
    BATTLE.starters.forEach((id, i) => {
      if (this.input.wasPressed(`Digit${i + 1}`)) this.chooseStarter(id);
    });
  }

  chooseStarter(id: string): void {
    if (this.party.members.length) return;
    const c = createCreature(id, BATTLE.starterLevel);
    c.origin = { district: 'a gift', level: c.level, at: Date.now() };
    this.party.add(c);
    this.saveDirty = true;
    this.markSeen(id);
    this.dex.caught.add(id);
    for (const [itemId, n] of BATTLE.starterItems) this.bag.add(itemId, n);
    this.starterEl?.remove();
    this.starterEl = null;
    this.state = 'playing';
    this.clock.getDelta();
    this.input.requestPointerLock();
    this.hud.toast(`${displayName(c)} joined you. Find a wild Streetmon, weaken it with ${displayName(c)} (B to battle), cuff it and bring it to Mama.`, 7000);
  }

  private openShop(): void {
    this.state = 'shop';
    this.aiming = false;
    this.player.facingOverride = null;
    if (this.input.pointerLocked) document.exitPointerLock();
    audio.silenceCar();
    this.shopMenu.open({
      inventory: this.weapons.inventory,
      money: () => this.money,
      spend: (n) => {
        if (this.money < n) return false;
        this.money -= n;
        audio.cash();
        return true;
      },
      refusal: () => (this.wanted.stars > 0 ? 'The owner won\'t serve you while the police are after you.' : null),
      onClose: () => {
        this.state = 'playing';
        this.clock.getDelta();
        this.input.requestPointerLock();
      },
      onBought: (t) => this.hud.toast(t, 1800),
    });
  }

  /** Gunfire (and Molotovs) are heard: people panic, police who hear it respond. */
  private onNoise(x: number, z: number, radius: number, weaponId: string): void {
    this.peds.alarm(x, z, Math.min(radius * 0.5, 55));
    this.spawns.scare(x, z, radius * 0.6, weaponId !== 'molotov');
    if (this.gunfireCd > 0) return;
    let w: 'cop' | 'civ' | 'none' = 'none';
    if (this.police.anyWithin(x, z, radius)) w = 'cop';
    else if (this.peds.witnesses(x, z, radius * 0.6) > 0) w = 'civ';
    if (w === 'none') return;
    this.gunfireCd = 3;
    this.reportCrime(weaponId === 'molotov' ? 'arson' : 'gunfire', x, z, w);
  }

  /** The player hurt someone with a weapon. Gunshots are loud; melee only counts if someone sees it. */
  private onPedDamaged(ped: Ped, killed: boolean, weaponId: string, melee: boolean): void {
    const now = performance.now();
    const last = this.reported.get(ped) ?? -1e9;
    if (!killed && now - last < 4000) return;
    this.reported.set(ped, now);
    const at = this.tmp.set(ped.x, ped.y, ped.z);
    // Gutter Kings started it (or you're putting a stop to them): not a crime people report.
    if (ped.role === 'gang') return;
    const cop = ped.role === 'cop';
    const kind: Crime = cop ? (killed ? 'killCop' : 'hitCop') : killed ? 'killPed' : 'hitPed';
    // A surviving victim reports it; an officer is a police witness.
    if (cop) this.reportCrime(kind, at.x, at.z, 'cop');
    else this.crime(kind, at, killed && melee ? null : 'civ');
    void weaponId;
  }

  private reportCrime(kind: Crime, x: number, z: number, witness: 'cop' | 'civ' | 'none'): void {
    // Nobody up top sees or hears what happens in the sewers: no stars down there.
    if (this.layers.current === 'sewer') return;
    const before = this.wanted.stars;
    // Witnesses who like you look the other way for small things; ones who don't, call it in.
    const added = this.wanted.report(kind, x, z, witness === 'civ' && Math.random() > civicTier(this.civic).witness ? 'none' : witness);
    if (added > 0) this.repEvent(kind === 'killPed' ? 'pedKilled' : kind === 'killCop' || kind === 'hitCop' ? 'copHurt' : 'crime');
    if (this.wanted.stars > before) {
      audio.wantedUp();
      if (before === 0) this.hud.toast(witness === 'cop' ? 'The police saw that' : 'Someone called the police', 2500);
    }
  }

  /** Bodies drop what they carried. */
  private onPedDied(ped: Ped): void {
    const off = (): number => (Math.random() - 0.5) * 1.2;
    if (ped.role === 'cop') {
      // Guns come from shops, stashes and jobs: a fallen officer leaves ammo only if you carry a pistol already.
      if (this.weapons.inventory.has('pistol')) this.weapons.drop('weapon', 'pistol', 12 + Math.floor(Math.random() * 13), ped.x + off(), ped.y, ped.z + off());
      this.weapons.drop('cash', 'cash', 20 + Math.floor(Math.random() * 60), ped.x + off(), ped.y, ped.z + off());
    } else if (Math.random() < 0.55) {
      this.weapons.drop('cash', 'cash', 5 + Math.floor(Math.random() * 55), ped.x + off(), ped.y, ped.z + off());
    }
  }

  /** A police officer shoots at the player (in a car, the car takes most of it). */
  private onOfficerFire(o: Ped, chance: number): void {
    const p = this.player;
    if (p.dead) return;
    if (this.creatureCrime && p.onFoot) {
      this.tranqShot(o, chance);
      return;
    }
    const from = new THREE.Vector3(o.x, o.y + 1.45, o.z);
    const car = p.vehicle;
    const target = car ? car.position.clone().setY(car.position.y + 0.4) : p.position.clone().setY(p.position.y + 0.3);
    if (!this.weapons.npcFire(from, target, chance)) return;
    if (car) {
      car.damage(28, 'bullet');
      if (Math.random() < 0.15 && p.takeDamage(6)) this.kill('Shot by police');
    } else {
      this.effects.blood(target.x, target.y + 0.4, target.z, target.x - from.x, target.z - from.z, 6);
      if (p.takeDamage(9)) this.kill('Shot by police');
    }
  }

  private physicsStep(h: number): void {
    const p = this.player;
    const inp = this.input;
    const car = p.vehicle;
    if (car) {
      // Keys are all or nothing; a pad's triggers are analogue.
      car.input.throttle = Math.max(inp.isDown('KeyW', 'ArrowUp') ? 1 : 0, inp.throttle);
      car.input.brake = Math.max(inp.isDown('KeyS', 'ArrowDown') ? 1 : 0, inp.brake);
      car.input.steer = inp.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
      car.input.handbrake = inp.isDown('Space');
      // A drowned engine: nothing happens when you put your foot down.
      if (this.carWater.get(car)?.stalled) {
        car.input.throttle = 0;
        car.input.brake = Math.min(car.input.brake, 0.3);
      }
      // On the start line during the countdown (or busted/wasted mid-race, or reading the map): held.
      if (this.raceHold || p.dead || this.cityMap.isOpen) {
        car.input.throttle = 0;
        car.input.brake = 0;
        car.input.handbrake = true;
      }
    } else {
      const frozen = this.battles.locksPlayer || this.evolution.active || performance.now() < this.lockedUntil || !!this.trans || this.cityMap.isOpen;
      const slow = performance.now() < this.sedatedUntil ? 0.45 : 1;
      const fwd = frozen ? 0 : inp.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']) * slow;
      const strafe = frozen ? 0 : inp.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']) * slow;
      const b = this.rig.groundBasis();
      const mx = b.fx * fwd + b.rx * strafe;
      const mz = b.fz * fwd + b.rz * strafe;
      // In the pond: at the edge, heading out (or jumping) climbs onto the bank.
      if (!frozen && p.waterState !== 'dry' && !p.dead) {
        const e = this.waterEdge(p.position.x, p.position.z);
        const m = Math.hypot(mx, mz);
        if (e && e.d <= POND.climbReach && (this.jumpQueued || (m > 0.2 && (mx * e.nx + mz * e.nz) / m > 0.45))) this.climbOut();
      }
      if (this.rollQueued && !frozen && !this.interiorBlocksRoll()) this.startDodge(mx, mz);
      this.rollQueued = false;
      p.step(h, mx, mz, slow === 1 && inp.isDown('ShiftLeft', 'ShiftRight') && p.dodge.winded <= 0, inp.isDown('AltLeft', 'AltRight') || slow < 1, this.jumpQueued);
      this.jumpQueued = false;
    }
    this.pondCars(h);

    if (p.onFoot && !this.trans) this.checkJumpPads();
    this.vehicles.prePhysics(h);
    this.destruction?.sweepCars(this.vehicles.cars, h);
    this.world.step();
    this.vehicles.postPhysics(h, this.camera.position);
    this.carCreatureImpacts();

    if (this.hitCooldown > 0) this.hitCooldown -= h;
    if (p.onFoot) this.checkRunOver();
    if (p.onFoot) this.checkFall();
    if (p.onFoot && this.layers.current === 'sewer' && !this.trans && !this.interior) this.sewerHazards(h);

    // Into the river: car or player.
    const fy = car ? car.position.y : p.position.y;
    const floor = this.interior ? INTERIOR.floorY - 10 : this.gangs?.inHideout || this.gangs?.entering ? -115 : this.layers.current === 'sewer' && !car ? SEWER.levels[SEWER.levels.length - 1].floor - 15 : WORLD.fallDeathY;
    if (!p.dead && !this.trans && fy < floor) {
      if (car) car.markDestroyed();
      this.kill('You fell into the river');
    }
  }

  /** Cars are dynamic bodies and the player is kinematic, so hits are detected here. */
  private checkRunOver(): void {
    if (this.hitCooldown > 0) return;
    const p = this.player;
    for (const car of this.vehicles.cars) {
      const lv = car.body.linvel();
      const speed = Math.hypot(lv.x, lv.z);
      if (speed < 3) continue;
      if (this.vehicles.distanceToFootprint(car, p.position) > PLAYER.radius + 0.25) continue;
      // Only count it if the car is moving toward the player.
      const toP = this.tmp.set(p.position.x - car.position.x, 0, p.position.z - car.position.z).normalize();
      const closing = lv.x * toP.x + lv.z * toP.z;
      if (closing < 2) continue;
      this.hitCooldown = 1;
      // Rolled clear: the car goes past (the i-frames take it).
      if (p.dodge.invulnerable) {
        p.dodgedHit = true;
        break;
      }
      audio.thud();
      p.knockBack(lv.x * 0.7 + toP.x * 2, 2 + closing * 0.25, lv.z * 0.7 + toP.z * 2, 2.2);
      if (p.takeDamage(closing * 4.5)) this.kill('Run over');
      break;
    }
  }

  private onExplosion(x: number, y: number, z: number, radius: number, playerDamage = 140, fromTank = false): void {
    this.peds.alarm(x, z, 45);
    // Wild Streetmon nearby scatter (whole packs at once) and ambient fights break up.
    this.living?.explosion(x, z, radius);
    // Street furniture in the blast goes over; the road is left scorched.
    if (y > -2 && y < 5) {
      this.destruction?.manager.explosion(x, z, radius);
      this.decals?.ground('scorch', x, this.groundAt(x, z), z, Math.min(9, radius * 0.6));
    }
    // Car explosions (and molotovs, via the fire) are what hurts a tank.
    if (!fromTank) this.tanks.blast(x, z, radius, TANK_SPEC.carExplosionDamage);
    // Blame the player for wrecks they were just crashing into.
    const mine = this.player.vehicle;
    if (mine && performance.now() - mine.lastImpactAt < 8000 && this.focus().distanceTo(this.tmp.set(x, y, z)) < 30) {
      this.crime('explosion', this.tmp.set(x, y, z));
    }
    const d = this.camera.position.distanceTo(this.tmp.set(x, y, z));
    this.rig.shake(clamp(0.08 * (1 - d / 120), 0, 0.08));
    const p = this.player;
    if (p.dead) return;
    if (p.vehicle && p.vehicle.destroyed) {
      this.kill('Your car exploded');
      return;
    }
    if (!p.vehicle) {
      const pd = p.position.distanceTo(this.tmp.set(x, y, z));
      if (pd < radius) {
        const k = 1 - pd / radius;
        const dir = this.tmp.set(p.position.x - x, 0, p.position.z - z).normalize();
        p.knockBack(dir.x * 12 * k, 5 * k, dir.z * 12 * k, 2.5);
        if (p.takeDamage(playerDamage * k, 'blast')) this.kill(fromTank ? 'Hit by a tank shell' : 'Caught in an explosion');
      }
    }
  }

  // ------------------------------------------------------------------ Underground Chop Shop

  /** Builds the tuning manager, its world effects and the Chop Shop screen. */
  private setupTuning(): void {
    this.tuneWorld = new TuningWorld({
      scene: this.scene,
      effects: this.effects,
      vehicles: this.vehicles,
      police: this.police,
      tanks: this.tanks,
      peds: this.peds,
      spawns: this.spawns,
      listener: () => this.camera.position,
      shake: (a) => this.rig.shake(a),
      playerCar: () => this.player.vehicle,
      isRacer: (c) => this.raceWorld?.isRacer(c) ?? false,
    });
    this.tuneWorld.onPlayerHit = () => this.hud.toast('Spike strip! Slow puncture: you will lose speed for a few seconds.', 2500);
    const blocked = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => this.tuneWorld.sightBlocked(ax, ay, az, bx, by, bz);
    this.police.sightBlocked = blocked;
    this.tanks.sightBlocked = blocked;
    this.tuning = new VehicleTuningManager({
      adapter: {
        getStreetmon: (id) => this.streetmonInfo(id),
        takeStreetmon: (id) => this.takeForGarage(id),
        returnStreetmon: (id) => this.returnFromGarage(id),
        getBaseStats: (vid) => {
          // The car as built (bought parts included): the Streetmon tune goes on top of that.
          const car = this.rides.get(vid);
          const s = car?.spec ?? getSpec('taxi');
          const e = upgradeEffect(car?.upgrades);
          return { topSpeed: s.maxSpeed * e.topSpeed, acceleration: (s.engineForce * e.acceleration) / (s.mass * e.mass), durability: s.health * e.durability, mass: s.mass * e.mass, grip: s.grip * e.grip, steering: e.steering, radarRange: 105 };
        },
        applyStats: (vid, st) => {
          const car = this.rides.get(vid);
          if (!car) return;
          const m = st.multipliers;
          car.setLayer('tune', { speed: m.topSpeed, accel: m.acceleration, grip: m.grip, steer: m.steering, armor: m.durability });
          car.tuneMass = m.mass;
          car.refreshMass();
        },
        triggerAbility: (vid, ab, ctx) => {
          const car = this.rides.get(vid);
          return !!car && this.tuneWorld.trigger(car, ab, ctx as { strength?: number });
        },
        endAbility: (vid, ab) => {
          const car = this.rides.get(vid);
          if (car) this.tuneWorld.end(car, ab);
        },
      },
    });
    this.chopMenu = new ChopShopMenu(this.container, this.icons);
    this.garageMenu = new GarageMenu(this.container);
    this.riders = new StreetmonRiders(this.creatureModels);
    this.tuning.on('abilityStarted', (e: { vehicleId: string; abilityId: string; slot: string }) => this.riders.react(this.rides.get(e.vehicleId), e.slot, ABILITY_STYLE[e.abilityId] ?? 'blast'));
  }

  /** Who rides in one of your tuned cars (for the riders on its bodywork). */
  private ridersOf(id: string): RiderSpec[] {
    return this.tuning
      .getSlots(id)
      .filter((s) => s.streetmon)
      .map((s) => ({ slot: s.slot, speciesId: s.streetmon!.speciesId, shiny: !!this.findCreature(s.streetmon!.id)?.shiny }));
  }

  /** On a road (the avenues and streets), rather than a block, park or pavement. */
  private onRoad(x: number, z: number): boolean {
    for (const r of this.layout.roads) {
      const c = r.kind === 'ave' ? x : z;
      const along = r.kind === 'ave' ? z : x;
      if (Math.abs(c - r.center) <= r.width / 2 + 0.5 && along >= r.from && along <= r.to) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ Empire Motors and your cars

  // ------------------------------------------------------------------ interiors and talk

  /** What E does here: a building's door outside, or inside its exit, its people and its counters. */
  private interiorUse(): { label: string; act: () => void } | null {
    const p = this.player;
    if (!p.onFoot || p.dead || this.trans) return null;
    const pos = p.position;
    const room = this.interior;
    if (!room) {
      if (this.layers.current !== 'street' || pos.y > 3) return null;
      for (const r of this.rooms) {
        if (Math.hypot(r.spot.x - pos.x, r.spot.z - pos.z) < INTERIOR.useRadius) return { label: `Go into ${r.spot.name}`, act: () => this.enterRoom(r) };
      }
      return null;
    }
    if (Math.hypot(room.exit.x - pos.x, room.exit.z - pos.z) < 1.6) return { label: 'Leave', act: () => this.leaveRoom() };
    // The nearest thing wins, with a bias to the room's spots: a dealer stands at the table, and
    // "Play blackjack" is what you came for, not a chat with them.
    let person: { d: number; pp: { room: InteriorRoom; role: string; model: Humanoid; seed: number } } | null = null;
    for (const pp of this.roomPeople) {
      if (pp.room !== room) continue;
      const m = pp.model.root.position;
      const d = Math.hypot(m.x - pos.x, m.z - pos.z);
      if (d < 1.9 && (!person || d < person.d)) person = { d, pp };
    }
    let spot: { d: number; sp: InteriorRoom['spots'][number] } | null = null;
    for (const sp of room.spots) {
      const d = Math.hypot(sp.x - pos.x, sp.z - pos.z);
      if (d < 1.6 && (!spot || d < spot.d)) spot = { d, sp };
    }
    if (spot && (!person || spot.d < person.d + 0.6)) {
      const sp = spot.sp;
      return { label: sp.label, act: () => this.roomSpot(sp.kind) };
    }
    if (person) {
      const pp = person.pp;
      return { label: `Talk`, act: () => this.talkInRoom(pp) };
    }
    return null;
  }

  private enterRoom(r: InteriorRoom): void {
    if (this.wanted.stars > 0) {
      this.hud.toast("They lock the door when they see the cops behind you. Lose them first.", 2800);
      return;
    }
    const ok = this.transition('sewer', r.spawn, {
      seconds: 1.0,
      label: r.spot.name,
      done: () => {
        this.sewerView.under.visible = false;
        this.flashlight.intensity = 0;
        this.lantern.intensity = 0;
      },
    });
    if (!ok) return;
    audio.door();
    this.interior = r;
    for (const x of this.rooms) x.root.visible = x === r;
    this.spawns.enabled = false;
    this.aiming = false;
  }

  private leaveRoom(): void {
    const r = this.interior;
    if (!r) return;
    const s = r.spot;
    const ok = this.transition('street', { x: s.x + s.nx * 1.2, y: 0.2, z: s.z + s.nz * 1.2 }, {
      seconds: 1.0,
      done: () => {
        this.interior = null;
        r.root.visible = false;
        this.spawns.enabled = true;
      },
    });
    if (ok) {
      audio.door();
      this.player.facing = Math.atan2(-s.nz, s.nx);
    }
  }

  /** Every frame inside: the people there breathe and look about. */
  private updateRoomPeople(dt: number): void {
    const r = this.interior;
    if (!r) return;
    for (const pp of this.roomPeople) if (pp.room === r) pp.model.update(dt, 0, true);
  }

  private talkContext(metKey: string): TalkContext {
    const p = this.player.position;
    const near = <T extends { x: number; z: number }>(xs: readonly T[]): T | undefined => [...xs].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const forSale = near(this.safeSpots.filter((h) => !this.safehouses.owned.includes(h.id)));
    const lead = this.party.lead;
    const lk = this.layout.parkLake;
    const deli = near(this.interiorSpots.filter((s) => s.kind === 'deli'));
    const diner = near(this.interiorSpots.filter((s) => s.kind === 'diner'));
    const docks = this.layout.docks?.length ? { name: p.x < 0 ? 'the West Ave Docks' : 'the East Ave Docks', x: p.x < 0 ? this.layout.land.x0 + 4 : this.layout.land.x1 - 4, z: p.x < 0 ? -232 : 80 } : undefined;
    return {
      hour: this.hour,
      district: districtAt(this.layout, p.x, p.z),
      wanted: this.wanted.stars,
      money: this.money,
      lead: lead ? { name: displayName(lead), species: species(lead.speciesId).name, level: lead.level } : null,
      places: {
        safehouseForSale: forSale ? { name: forSale.name, price: forSale.price, x: forSale.x, z: forSale.z } : undefined,
        clinic: near(this.clinics.clinics),
        deli: deli ? { name: deli.name, x: deli.x, z: deli.z } : undefined,
        diner: diner ? { name: diner.name, x: diner.x, z: diner.z } : undefined,
        docks,
        pond: { x: (lk.x0 + lk.x1) / 2, z: (lk.z0 + lk.z1) / 2 },
        chopShop: { x: this.chopSpot.x, z: this.chopSpot.z },
      },
      race: this.races.eligibleTracks?.()[0]?.name,
      deepVisited: this.progress.stashesOpened.some((id) => id.startsWith('depth:')),
      met: this.talked.get(metKey) ?? 0,
    };
  }

  private talkToPed(ped: Ped): void {
    const idx = this.peds.peds.indexOf(ped);
    const key = `ped:${idx}`;
    const tree = streetTalk(idx * 977 + 13, this.talkContext(key));
    this.talked.set(key, (this.talked.get(key) ?? 0) + 1);
    // They stop and face you.
    ped.heading = Math.atan2(-(this.player.position.z - ped.z), this.player.position.x - ped.x);
    this.runTalk(tree);
  }

  private talkInRoom(pp: { room: InteriorRoom; role: string; model: Humanoid; seed: number }): void {
    const key = `room:${pp.room.spot.id}:${pp.role}:${pp.seed}`;
    const tree = interiorTalk(pp.role, { name: pp.room.spot.name, kind: pp.room.spot.kind }, pp.seed, this.talkContext(key));
    this.talked.set(key, (this.talked.get(key) ?? 0) + 1);
    const pos = this.player.position;
    pp.model.root.rotation.y = Math.atan2(-(pos.z - pp.model.root.position.z), pos.x - pp.model.root.position.x);
    this.runTalk(tree);
  }

  /** Shows a conversation page by page; choices move on and may do something. */
  private runTalk(tree: TalkTree): void {
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    const show = (id: string): void => {
      const n = tree.nodes[id];
      if (!n) {
        this.dialogue.close();
        return;
      }
      this.dialogue.show(
        tree.speaker,
        n.text,
        n.choices.map((c) => c.label),
        (i) => {
          const c = n.choices[i];
          if (!c) return;
          const keepOpen = c.action ? this.talkAction(c.action) : true;
          if (c.next === 'end' || !keepOpen) this.dialogue.close();
          else show(c.next);
        },
        () => {
          if (this.state === 'menu' && !this.clinicMenu.isOpen && !this.casinoMenu.isOpen && !this.wardrobe?.isOpen) this.closeMenu();
        },
      );
    };
    show(tree.start);
  }

  /** Does a conversation's action. Returns false when it opened something else (the dialogue closes). */
  private talkAction(a: TalkAction): boolean {
    switch (a.kind) {
      case 'waypoint':
        this.cityMap.setWaypoint({ x: a.x, z: a.z });
        this.hud.toast(`Waypoint set: ${a.label}`, 2200);
        return true;
      case 'shop':
        this.dialogue.close();
        this.openDeli();
        return false;
      case 'eat':
        if (this.money < 15) {
          this.hud.toast("You can't afford it.", 1800);
          return true;
        }
        this.money -= 15;
        this.player.health = PLAYER.maxHealth;
        audio.cash();
        this.hud.toast('Hot food. Back to full health.', 2200);
        return true;
      case 'drink':
        if (this.money < 3) return true;
        this.money -= 3;
        this.player.health = Math.min(PLAYER.maxHealth, this.player.health + 15);
        audio.cash();
        return true;
      case 'casino':
        this.openCasino(a.game);
        return false;
      case 'tip':
        if (this.money >= a.money) {
          this.money -= a.money;
          audio.cash();
        }
        return true;
      case 'wardrobe':
        this.dialogue.close();
        this.state = 'menu';
        this.openWardrobe(false);
        return false;
      case 'sell':
        this.dialogue.close();
        this.openPawn();
        return false;
      case 'play':
        this.playArcade();
        return true;
    }
    return true;
  }

  /** A point of interest in a room (the counter, a booth, a washer, a cabinet, the notice board, the cooler). */
  private roomSpot(kind: InteriorRoom['spots'][number]['kind']): void {
    switch (kind) {
      case 'counter':
        if (this.interior?.spot.kind === 'diner') this.talkAction({ kind: 'eat' });
        else if (this.interior?.spot.kind === 'pawn') this.openPawn();
        else this.openDeli();
        break;
      case 'cooler':
        if (this.money < 3) this.hud.toast('$3 for a drink. You\'re short.', 1800);
        else {
          this.talkAction({ kind: 'drink' });
          this.hud.toast('Ice cold. +15 health.', 1800);
        }
        break;
      case 'booth':
        this.player.health = Math.min(PLAYER.maxHealth, this.player.health + 5);
        this.hud.toast('You take the weight off your feet for a minute.', 2000);
        break;
      case 'washer':
        this.state = 'menu';
        this.openWardrobe(false);
        break;
      case 'cabinet':
        this.playArcade();
        break;
      case 'slots':
      case 'blackjack':
      case 'roulette':
      case 'poker':
        this.openCasino(kind);
        break;
      case 'bar':
        if (this.money < 8) this.hud.toast("Eight bucks a drink. You're short.", 1800);
        else {
          this.money -= 8;
          this.player.health = Math.min(PLAYER.maxHealth, this.player.health + 20);
          audio.cash();
          this.hud.toast(['A Lucky Strike, on the rocks. +20 health.', 'Something blue with an umbrella in it. +20 health.', 'Lou slides you a soda water. "On the house." It isn\'t. +20 health.'][Math.floor(this.gameTime) % 3], 2400);
        }
        break;
      case 'board':
        this.hud.toast(
          [
            'NOTICE: Streetmon must not be fed in the break room. This means you, Devon.',
            'Claims: flood damage from the Central Green pond is NOT covered. Do not drive into the pond.',
            'Safety bulletin: deep drain access is restricted. Contractors report "very large" Streetmon below level 2.',
            'Lost: one Hustlepup, answers to "Biscuit". Last seen near the Chop Shop.',
          ][Math.floor(this.gameTime / 7) % 4],
          5000,
        );
        break;
    }
  }

  /** A seat at one of the Empire Royale's games (src/ui/CasinoMenu.ts). */
  private openCasino(game: CasinoGame): void {
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    this.casinoMenu.open({
      game,
      money: () => this.money,
      spend: (n) => {
        if (this.money < n) return false;
        this.money -= n;
        this.saveDirty = true;
        audio.ui();
        return true;
      },
      earn: (n) => {
        this.money += n;
        this.saveDirty = true;
        audio.cash();
      },
      onWin: (amount, what) => {
        this.hud.toast(`The room cheers: $${amount.toLocaleString('en-US')} on ${what}!`, 3000);
        this.repEvent('jackpot', Math.min(6, Math.floor(amount / 2000) + 1));
      },
      onClose: () => this.closeMenu(),
    });
  }

  /** The deli's shelves: capture items, an escape rope, at street prices. */
  private openDeli(): void {
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    this.clinicMenu.open({
      captureLocked: this.captureLock(),
      title: this.interior?.spot.name ?? 'Corner deli',
      stock: [
        { id: 'cuffs', price: 60 },
        { id: 'crate', price: 140 },
        { id: 'net', price: 260 },
        { id: 'lure', price: 180 },
        { id: 'escapeRope', price: 320 },
        { id: 'streetSnack', price: 50 },
        { id: 'energyDrink', price: 170 },
        { id: 'firstAid', price: 110 },
        { id: 'repairKit', price: 380 },
        { id: 'lockpick', price: 330 },
      ].filter((x) => DATA.items.has(x.id)),
      bag: this.bag,
      money: () => this.money,
      spend: (amount) => {
        if (this.money < amount) return false;
        this.money -= amount;
        this.saveDirty = true;
        audio.cash();
        return true;
      },
      onClose: () => this.closeMenu(),
      onTeam: () => this.openTeam(),
    });
  }

  /** Goldie buys your spare items at half what they cost. */
  private openPawn(): void {
    const owned = [...this.bag.counts.entries()].filter(([id, n]) => n > 0 && DATA.items.has(id) && (itemSpec(id).price ?? 0) > 0);
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    if (!owned.length) {
      this.dialogue.show('Goldie', "You've got nothing I want, sweetheart. Come back with something shiny.", ['Fair enough.'], () => this.dialogue.close(), () => this.closeMenu());
      return;
    }
    const show = (): void => {
      const list = [...this.bag.counts.entries()].filter(([id, n]) => n > 0 && DATA.items.has(id) && (itemSpec(id).price ?? 0) > 0).slice(0, 3);
      const offer = (id: string): number => Math.max(5, Math.round((itemSpec(id).price ?? 0) * 0.5));
      this.dialogue.show(
        'Goldie',
        list.length ? 'Half what you paid, cash on the counter. Take it or leave it.' : 'That\'s everything. Pleasure doing business.',
        [...list.map(([id, n]) => `Sell a ${itemSpec(id).name} for $${offer(id)} (you have ${n})`), 'Done'],
        (i) => {
          const e = list[i];
          if (!e) return this.dialogue.close();
          if (this.bag.take(e[0])) {
            this.money += offer(e[0]);
            audio.cash();
            this.saveDirty = true;
          }
          show();
        },
        () => this.closeMenu(),
        `$${this.money.toLocaleString('en-US')}`,
      );
    };
    show();
  }

  /** A dollar in the racer cabinet: a short race against the high score. */
  private playArcade(): void {
    if (this.money < 1) {
      this.hud.toast('No change. It takes a dollar.', 1800);
      return;
    }
    this.money -= 1;
    const lap = 41 + Math.random() * 12;
    const best = 43.2;
    if (lap < best) {
      this.money += 20;
      this.hud.toast(`${lap.toFixed(2)} s! A new high score on the Streetmon Racer: the machine pays out $20.`, 3500);
    } else this.hud.toast(`${lap.toFixed(2)} s. The high score ("RUST", ${best} s) stands.`, 3000);
    audio.ui();
  }

  /** The safehouse door you're standing at (on foot, street level), if any. */
  private atSafehouse(): SafehouseSpot | null {
    const p = this.player;
    if (!p.onFoot || p.dead || this.layers.current !== 'street' || p.position.y > 3) return null;
    for (const h of this.safeSpots) if (Math.hypot(p.position.x - h.x, p.position.z - h.z) < SAFEHOUSE.useRadius) return h;
    return null;
  }

  /** E at a safehouse door: buy it, or go in (save, rest, sleep). */
  private openSafehouse(h: SafehouseSpot): void {
    if (this.battles.active || this.races.active || this.heists.active) {
      this.hud.toast('Not now: finish what you started first.', 2500);
      return;
    }
    if (!this.safehouses.owned.includes(h.id)) {
      const price = h.price;
      this.state = 'menu';
      if (this.input.pointerLocked) document.exitPointerLock();
      const offer = (note = ''): void =>
        this.dialogue.show(
          h.name,
          `${note}For sale: a quiet place to call home in ${h.district[0].toUpperCase()}${h.district.slice(1)}. Go in to save, patch yourself up, rest your team and sleep. Get wasted and you'll wake up here. $${price.toLocaleString('en-US')}.`,
          [`Buy it ($${price.toLocaleString('en-US')})`, 'Leave'],
          (i) => {
            if (i !== 0) return this.dialogue.close();
            if (this.money < price) return offer(`You're $${(price - this.money).toLocaleString('en-US')} short. `);
            this.money -= price;
            this.safehouses.owned.push(h.id);
            this.safeView.setOwned(this.safehouses.owned);
            audio.cash();
            this.hud.showBig('SAFEHOUSE BOUGHT', '#5dff8a', 2600);
            this.dialogue.close();
            this.enterSafehouse(h);
          },
          () => this.closeMenu(),
          `$${this.money.toLocaleString('en-US')}`,
        );
      offer();
      return;
    }
    this.enterSafehouse(h);
  }

  private enterSafehouse(h: SafehouseSpot): void {
    if (this.wanted.stars > 0) {
      this.hud.toast("Lose the cops first: you can't lead them to your door.", 3000);
      return;
    }
    audio.door();
    this.player.health = PLAYER.maxHealth;
    this.party.healAll(magazine);
    this.safehouses.last = h.id;
    this.safehouses.visits[h.id] = (this.safehouses.visits[h.id] ?? 0) + 1;
    this.autosaveNote = h.name;
    this.autosave();
    this.saveDirty = false;
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    const fmt = (hr: number): string => `${String(Math.floor(hr)).padStart(2, '0')}:00`;
    this.dialogue.show(
      h.name,
      "Home. You're patched up, the team's rested, and the game is saved.",
      [`Sleep till morning (${fmt(SAFEHOUSE.wakeMorning)})`, `Sleep till evening (${fmt(SAFEHOUSE.wakeEvening)})`, 'Head back out'],
      (i) => {
        if (i < 2) this.sleepTo(i === 0 ? SAFEHOUSE.wakeMorning : SAFEHOUSE.wakeEvening);
        this.dialogue.close();
      },
      () => this.closeMenu(),
      `Visits ${this.safehouses.visits[h.id]}`,
    );
  }

  /** Sleeps through to `wake` o'clock (a new day if it passes midnight), then saves again. */
  private sleepTo(wake: number): void {
    const h = sleepHours(this.hour, wake);
    const next = this.hour + h;
    if (next >= 24) this.dayCount += Math.floor(next / 24);
    this.hour = next % 24;
    this.env.setTime(this.hour);
    this.hud.toast(`You slept ${Math.round(h)} h.`, 2500);
    this.autosaveNote = 'Slept';
    this.autosave();
  }

  private atDealer(): boolean {
    const p = this.player;
    if (!p.onFoot || p.dead || this.layers.current !== 'street') return false;
    const s = this.dealerSpot;
    return Math.hypot(p.position.x - s.x, p.position.z - s.doorZ) < DEALERSHIP.useRadius;
  }

  /** Performance class of a car as it is now (parts included). */
  private carClassOf(car: Car): { cls: CarClass; index: number } {
    const e = upgradeEffect(car.upgrades);
    const index = performanceIndex(car.spec, { topSpeed: e.topSpeed, acceleration: e.acceleration, grip: e.grip, mass: e.mass });
    return { cls: classOf(index), index };
  }

  /** What the showroom pays for a car: 60% of its price and the parts on it. */
  private carValue(car: Car): number {
    let v = car.paid || car.spec.price;
    const u = car.upgrades ?? NO_UPGRADES;
    for (const part of Object.keys(u) as UpgradePart[]) for (let l = 0; l < u[part]; l++) v += upgradePrice(part, l, car.spec.price);
    return Math.round((v * DEALERSHIP.sellShare) / 50) * 50;
  }

  /** Makes a car one of yours: it never despawns, it's saved, and the Chop Shop knows it. */
  private adopt(car: Car, paid: number): string {
    if (!car.tuneId) car.tuneId = `ride-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    car.bought = true;
    car.paid = paid;
    this.rides.set(car.tuneId, car);
    this.tuning.registerVehicle(car.tuneId);
    this.vehicles.owned.add(car);
    this.saveDirty = true;
    return car.tuneId;
  }

  private openDealer(): void {
    if (this.state !== 'playing') return;
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    audio.door();
    const S = this.dealerSpot;
    const est = (spec: VehicleSpec): number => {
      // 0-100 estimate from the engine's pull with the drag-off taper the car model uses.
      let v = 0;
      let t = 0;
      while (v < 27.8 && t < 60) {
        const k = Math.min(1, v / spec.maxSpeed);
        v += ((spec.engineForce * (1 - k * k)) / spec.mass) * 0.05;
        t += 0.05;
      }
      return t;
    };
    this.garageMenu.openDealer({
      money: () => this.money,
      forSale: () =>
        VEHICLES.filter((v) => v.price > 0 && v.id !== 'beater')
          .sort((a, b) => a.price - b.price)
          .map((v) => {
            const index = performanceIndex(v);
            return { id: v.id, name: v.name, blurb: v.blurb ?? '', cls: classOf(index), index, topSpeedKmh: Math.round(v.maxSpeed * 3.6), zeroToHundred: est(v), drive: v.drive, seats: v.style === 'bus' ? 30 : v.style === 'limo' ? 8 : v.style === 'van' || v.style === 'ambulance' || v.style === 'pickup' ? 3 : v.style === 'sports' || v.style === 'supercar' ? 2 : 5, price: v.price, colors: v.colors };
          }),
      owned: () =>
        [...this.rides.values()]
          .filter((c) => !c.disposed && !c.destroyed && (c.bought || this.tuning.isTuned(c.tuneId ?? '')))
          .map((c) => ({ id: c.tuneId!, name: c.spec.name, cls: this.carClassOf(c).cls, color: c.color, value: this.carValue(c), here: Math.hypot(c.position.x - S.x, c.position.z - S.z) < 40 && c !== this.player.vehicle, upgrades: Object.values(c.upgrades ?? NO_UPGRADES).reduce((a, b) => a + b, 0) })),
      buy: (id, color) => {
        const spec = getSpec(id);
        if (this.money < spec.price) return { ok: false, reason: `You need $${spec.price.toLocaleString('en-US')}.` };
        const d = S.delivery;
        if (this.vehicles.cars.some((c) => !c.disposed && Math.hypot(c.position.x - d.x, c.position.z - d.z) < 5)) return { ok: false, reason: 'The delivery bay is blocked. Move the car out of it first.' };
        this.money -= spec.price;
        audio.cash();
        const car = this.vehicles.spawn(spec, d.x, d.z, d.heading, color);
        this.adopt(car, spec.price);
        this.tut.fire('boughtCar');
        return { ok: true };
      },
      sell: (id) => {
        const car = this.rides.get(id);
        if (!car || car.disposed) return { ok: false, reason: "That car isn't here." };
        if (car === this.player.vehicle) return { ok: false, reason: 'Get out of it first.' };
        const cash = this.carValue(car);
        const back = this.tuning.removeVehicle(id);
        this.rides.delete(id);
        this.vehicles.owned.delete(car);
        this.riders.set(car, []);
        this.vehicles.remove(car);
        this.money += cash;
        audio.cash();
        if (back.length) this.hud.toast(`${back.map((b) => (this.findCreature(b) ? displayName(this.findCreature(b)!) : 'Your Streetmon')).join(', ')} came back to your team.`, 3500);
        this.saveDirty = true;
        return { ok: true, cash };
      },
      onClose: () => this.closeMenu(),
    });
  }

  /** The showroom keeps a couple of cars on display out front; stolen ones are replaced. */
  private updateDisplayCars(dt: number): void {
    this.displayCheck -= dt;
    if (this.displayCheck > 0) return;
    this.displayCheck = 2;
    const S = this.dealerSpot;
    for (const c of [...this.displayCars]) if (c.disposed || c.driver || Math.hypot(c.position.x - S.x, c.position.z - S.z) > 30) this.displayCars.delete(c);
    const p = this.focus();
    if (Math.hypot(p.x - S.x, p.z - S.z) > 160 || Math.hypot(p.x - S.x, p.z - S.z) < 25) return;
    const picks = VEHICLES.filter((v) => v.price >= 20000 && v.style !== 'bus');
    for (const b of S.bays) {
      if (this.vehicles.cars.some((c) => !c.disposed && Math.hypot(c.position.x - b.x, c.position.z - b.z) < 5)) continue;
      const spec = picks[Math.floor(Math.random() * picks.length)];
      const car = this.vehicles.spawn(spec, b.x, b.z, b.heading, spec.colors[Math.floor(Math.random() * spec.colors.length)]);
      car.input.park = true;
      this.vehicles.owned.add(car);
      this.displayCars.add(car);
    }
  }

  /** Puts a wrecked car of yours in a Chop Shop bay, barely running, with its parts and paint. */
  private towToShop(old: Car): boolean {
    const s = this.chopSpot;
    const dir = s.side > 0 ? 1 : -1;
    const bays = [...s.bays, ...[3, 4, 5].map((k) => ({ x: s.x - dir * k * 7.5, z: s.z, heading: s.heading }))];
    const bay = bays.find((b) => !this.vehicles.cars.some((c) => !c.disposed && c !== old && Math.hypot(c.position.x - b.x, c.position.z - b.z) < 5));
    if (!bay) return false;
    const car = this.vehicles.spawn(old.spec, bay.x, bay.z, bay.heading, old.color);
    car.setUpgrades(old.upgrades);
    car.health = Math.max(1, old.spec.health * 0.15);
    car.tyresPopped = false;
    car.input.park = true;
    this.adopt(car, old.paid);
    return true;
  }

  /** Parts and body shop for the car on the lift (from the Chop Shop screen). */
  private openParts(car: Car): void {
    const id = car.tuneId!;
    const levels = (): UpgradeLevels => ({ ...(car.upgrades ?? NO_UPGRADES) });
    const stockIndex = performanceIndex(car.spec);
    this.garageMenu.openParts({
      carName: car.spec.name,
      cls: () => this.carClassOf(car).cls,
      index: () => this.carClassOf(car).index,
      money: () => this.money,
      levels,
      price: (part) => upgradePrice(part, levels()[part], car.spec.price || 8000),
      buy: (part) => {
        const lv = levels();
        if (lv[part] >= MAX_LEVEL) return { ok: false, reason: 'Already maxed.' };
        const price = upgradePrice(part, lv[part], car.spec.price || 8000);
        if (this.money < price) return { ok: false, reason: `You need $${price.toLocaleString('en-US')}.` };
        this.money -= price;
        audio.cash();
        lv[part]++;
        car.setUpgrades(lv);
        if (!car.bought) this.adopt(car, car.spec.price);
        // The Streetmon tune is a multiplier on the built car: recompute from the new base.
        this.tuning.recalculate(car.tuneId!);
        this.saveDirty = true;
        return { ok: true };
      },
      health: () => {
        const missing = car.spec.health - car.health;
        return { hp: car.health, max: car.spec.health, cost: missing > 1 ? Math.max(50, Math.round(((missing / car.spec.health) * (car.spec.price || 8000) * 0.12) / 10) * 10) : 0 };
      },
      repair: () => {
        const missing = car.spec.health - car.health;
        const cost = Math.max(50, Math.round(((missing / car.spec.health) * (car.spec.price || 8000) * 0.12) / 10) * 10);
        if (this.money < cost) return { ok: false, reason: `You need $${cost}.` };
        this.money -= cost;
        audio.cash();
        car.health = car.spec.health;
        car.tyresPopped = false;
        car.flatFor = 0;
        return { ok: true };
      },
      colors: [...new Set([...car.spec.colors, '#ff3fa4', '#21e6ff', '#ffd23f', '#111111', '#f2f2f2', '#6a2cff'])],
      color: () => car.color,
      resprayCost: Math.max(100, Math.round((car.spec.price || 8000) * 0.02)),
      respray: (color) => {
        const cost = Math.max(100, Math.round((car.spec.price || 8000) * 0.02));
        if (color === car.color) return { ok: false, reason: "It's already that colour." };
        if (this.money < cost) return { ok: false, reason: `You need $${cost}.` };
        this.money -= cost;
        audio.cash();
        car.respray(color);
        return { ok: true };
      },
      stats: () => {
        const e = upgradeEffect(car.upgrades);
        const sp = car.spec;
        return [
          ['Performance index', `${Math.round(stockIndex)} (${classOf(stockIndex)})`, `${Math.round(this.carClassOf(car).index)} (${this.carClassOf(car).cls})`],
          ['Top speed', `${Math.round(sp.maxSpeed * 3.6)} km/h`, `${Math.round(sp.maxSpeed * e.topSpeed * 3.6)} km/h`],
          ['Pull', `${(sp.engineForce / sp.mass).toFixed(1)} m/s²`, `${((sp.engineForce * e.acceleration) / (sp.mass * e.mass)).toFixed(1)} m/s²`],
          ['Grip', sp.grip.toFixed(2), (sp.grip * e.grip).toFixed(2)],
          ['Brakes', '100%', `${Math.round(e.brakes * 100)}%`],
          ['Steering', '100%', `${Math.round(e.steering * 100)}%`],
          ['Weight', `${Math.round(sp.mass)} kg`, `${Math.round(sp.mass * e.mass)} kg`],
          ['Durability', `${sp.health} HP`, `${Math.round(sp.health * e.durability)} HP`],
          ['Nitrous', 'none', e.nitrous ? `${e.nitrous} s` : 'none'],
        ];
      },
      onClose: () => {
        // Back to the Chop Shop screen (it re-reads the car).
        if (this.chopCar && this.rides.has(id)) this.openChopMenu(this.chopCar);
        else this.closeMenu();
      },
    });
  }

  /** A Streetmon wherever it is (party, stash or riding in a car), as the tuning system sees it. */
  private findCreature(id: string): Creature | null {
    return this.party.members.find((c) => c.uid === id) ?? this.party.stash.find((c) => c.uid === id) ?? this.garageMon.get(id) ?? null;
  }

  private streetmonInfo(id: string): StreetmonInfo | null {
    const c = this.findCreature(id);
    if (!c) return null;
    const sp = species(c.speciesId);
    return { id: c.uid, speciesId: c.speciesId, name: displayName(c), types: [...sp.types], level: c.level, stats: calcStats(sp, c.level, c.ivs) };
  }

  /** Slotting: the Streetmon leaves the party or stash and rides in the car. */
  private takeForGarage(id: string): true | string {
    const pi = this.party.members.findIndex((c) => c.uid === id);
    if (pi >= 0) {
      if (this.party.members.length <= 1) return 'Keep at least one Streetmon in your party.';
      const [c] = this.party.members.splice(pi, 1);
      if (this.follower.summoned) this.follower.recall();
      this.garageMon.set(id, c);
    } else {
      const si = this.party.stash.findIndex((c) => c.uid === id);
      if (si < 0) return 'That Streetmon is not with you.';
      const [c] = this.party.stash.splice(si, 1);
      this.garageMon.set(id, c);
    }
    this.saveDirty = true;
    return true;
  }

  /** Unslotting (or a wrecked car): back to the party, or the stash if it's full. */
  private returnFromGarage(id: string): void {
    const c = this.garageMon.get(id);
    if (!c) return;
    this.garageMon.delete(id);
    this.party.add(c);
    this.saveDirty = true;
  }

  /** Stopped on the Chop Shop's lift? */
  private atChopLift(car: Car): boolean {
    const s = this.chopSpot;
    return !this.trans && Math.hypot(car.position.x - s.x, car.position.z - s.z) < CHOP_SHOP.useRadius && Math.abs(car.speed) < CHOP_SHOP.maxSpeed && car.position.y < 2;
  }

  private openChopShop(car: Car): void {
    if (this.heists.active) {
      this.hud.toast('Not with a job on.', 2000);
      return;
    }
    if (this.races.active) {
      this.hud.toast('Not in the middle of a race!', 2000);
      return;
    }
    if (this.wanted.stars > 0) {
      this.hud.toast("The crew won't open the doors with the cops on your tail. Lose them first.", 3000);
      return;
    }
    if (car.destroyed || this.state !== 'playing') return;
    // The car becomes a ride the shop keeps track of (until it leaves with nothing installed).
    if (!car.tuneId) {
      car.tuneId = `ride-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    }
    this.rides.set(car.tuneId, car);
    this.tuning.registerVehicle(car.tuneId);
    this.chopCar = car;
    car.input.throttle = 0;
    car.input.brake = 1;
    this.state = 'menu';
    this.tut.fire('chopShopOpen');
    if (this.input.pointerLocked) document.exitPointerLock();
    audio.silenceCar();
    audio.door();
    this.fadeEl.style.transition = 'opacity 0.6s';
    this.fadeEl.style.opacity = '1';
    this.chopLift = 1;
    window.setTimeout(() => {
      this.openChopMenu(car);
      this.fadeEl.style.opacity = '0';
    }, 650);
  }

  private openChopMenu(car: Car): void {
    const id = car.tuneId!;
    this.chopMenu.open({
      carName: car.spec.name,
      slots: () => this.tuning.getSlots(id),
      stats: () => this.tuning.getVehicleStats(id),
      candidates: () =>
        [...this.party.members.map((c) => [c, 'party'] as const), ...this.party.stash.map((c) => [c, 'stash'] as const)].map(([c, where]) => ({ ...this.streetmonInfo(c.uid)!, where, shiny: c.shiny })),
      canSlot: (slot: SlotName, mid: string) => this.tuning.canSlot(slot, mid),
      slot: (slot: SlotName, mid: string) => this.tuning.slotStreetmon(id, slot, mid),
      unslot: (slot: SlotName) => this.tuning.unslotStreetmon(id, slot),
      onParts: () => {
        this.chopMenu.close(false);
        this.openParts(car);
      },
      onClose: () => this.closeChopShop(),
    });
  }

  private closeChopShop(): void {
    const car = this.chopCar;
    this.chopCar = null;
    this.chopLift = 0;
    this.fadeEl.style.opacity = '0';
    if (car?.tuneId) {
      if (this.tuning.isTuned(car.tuneId) || car.bought) {
        this.vehicles.owned.add(car);
        const n = this.tuning.abilities(car.tuneId).length;
        if (this.tuning.isTuned(car.tuneId)) this.hud.toast(`Tuned! ${n ? 'Your Streetmon ride along: see the panel above the speedometer.' : ''}`, 3500);
      } else {
        // Nothing installed: it's just a car again.
        this.tuning.removeVehicle(car.tuneId);
        this.rides.delete(car.tuneId);
        this.vehicles.owned.delete(car);
        car.tuneId = null;
      }
    }
    this.saveDirty = true;
    this.closeMenu();
  }

  /** Per frame: cooldowns, ability effects, wrecked rides, the HUD panel and radar. */
  private updateTuning(dt: number): void {
    this.tuning.update(dt);
    this.tuneWorld.update(dt);
    // Your tuned rides show who's in them (within sight; far-off ones let their models go).
    this.ridersCheck -= dt;
    if (this.ridersCheck <= 0) {
      this.ridersCheck = 0.25;
      const cam = this.camera.position;
      for (const [id, car] of this.rides) {
        if (car.disposed || car.destroyed) continue;
        this.riders.set(car, car.position.distanceTo(cam) < 220 && this.layers.current !== 'sewer' ? this.ridersOf(id) : []);
      }
      for (const car of this.riders.cars()) if (!this.rides.has(car.tuneId ?? '') && !this.raceWorld.isRacer(car)) this.riders.set(car, []);
    }
    this.riders.update(dt, this.camera.position);
    this.dealerView.update(this.gameTime);
    this.updateDisplayCars(dt);
    // The surface under every driven car: grass and dirt have less grip (rally cars keep most).
    for (const c of this.vehicles.cars) {
      if (c.disposed || !c.driver) continue;
      const off = c.position.y < 3 && rectContains(this.layout.park, c.position.x, c.position.z) && !this.onRoad(c.position.x, c.position.z);
      c.surfaceGrip = off ? c.spec.offroad ?? 0.7 : 1;
    }
    const mine = this.player.vehicle;
    this.hud.setNitro(mine && mine.nitro.capacity > 0 ? { charge01: mine.nitro.fraction, active: mine.nitro.active } : null);
    if (mine?.nitro.active && Math.random() < 0.6) {
      const f = mine.forward(this.tmp);
      const back = mine.spec.length / 2 + 0.1;
      this.effects.muzzle(mine.position.x - f.x * back, mine.position.y + 0.05, mine.position.z - f.z * back, 1.1);
    }
    this.chopView.update(this.gameTime, this.chopLift);
    // A wrecked (or lost) ride gives its Streetmon back.
    for (const [id, car] of [...this.rides]) {
      if (car === this.chopCar) continue;
      if (car.destroyed || car.disposed) {
        const back = this.tuning.removeVehicle(id);
        this.rides.delete(id);
        this.vehicles.owned.delete(car);
        this.riders.set(car, []);
        const who = back.map((b) => (this.findCreature(b) ? displayName(this.findCreature(b)!) : 'Your Streetmon')).join(', ');
        if (car.bought) {
          // A car you own is towed to the Chop Shop: it comes back wrecked (repair it there).
          const w = this.towToShop(car);
          this.hud.toast(`Your ${car.spec.name} was wrecked and towed to the Chop Shop${w ? '' : ' (it will be there once a bay is free)'}.${back.length ? ` ${who} made it back to your team.` : ''}`, 5000);
        } else if (back.length) this.hud.toast(`Your tuned ${car.spec.name} is wrecked. ${who} made it back to your team.`, 4500);
      }
    }
    const car = this.player.vehicle;
    const tid = car?.tuneId;
    if (tid && this.tuning.isTuned(tid)) {
      const rows = this.tuning.abilities(tid).map((a) => ({ name: a.name, key: a.input?.label ?? (a.trigger === 'collision' ? 'crash' : ''), cooldown01: a.cooldown01, active01: a.active01, passive: a.trigger === 'passive' }));
      this.hud.setAbilities(rows);
      this.hud.setRadarRange(this.tuning.getVehicleStats(tid).final.radarRange);
    } else {
      this.hud.setAbilities(null);
      this.hud.setRadarRange(105);
      this.hud.setRadarWarning('');
    }
  }

  /** Minimap: the Chop Shop, your rides, and (with Early Warning Radar) everything it picks up. */
  private tuningMarkers(): Array<{ x: number; z: number; color: string; size: number }> {
    if (this.layers.current === 'sewer') return [];
    const out = [
      { x: this.chopSpot.x, z: this.chopSpot.z, color: '#ff3fa4', size: 10 },
      { x: this.dealerSpot.x, z: this.dealerSpot.doorZ, color: '#21e6ff', size: 10 },
      ...this.safeSpots.filter((h) => this.safehouses.owned.includes(h.id)).map((h) => ({ x: h.x, z: h.z, color: '#5dff8a', size: 8 })),
    ];
    for (const car of this.rides.values()) if (car !== this.player.vehicle && !car.disposed && this.tuning.isTuned(car.tuneId ?? '')) out.push({ x: car.position.x, z: car.position.z, color: '#ffd6f0', size: 7 });
    const car = this.player.vehicle;
    const tid = car?.tuneId;
    if (car && tid && this.tuning.hasAbility(tid, 'earlyWarningRadar')) {
      const r = this.tuneWorld.radar(car.position.x, car.position.z, car.heading, this.tuning.getVehicleStats(tid).final.radarRange, {
        manholes: this.mazes.flatMap((m) => m.manholes),
        access: this.roofPlan.access.map((a) => ({ x: a.street.x, z: a.street.z, kind: a.kind })),
        garages: this.roofPlan.garages.map((g) => ({ x: g.footX, z: (g.lane.z0 + g.lane.z1) / 2 })),
        hiddenPads: this.roofPlan.pads.filter((p) => p.hidden).map((p) => ({ x: p.x, z: p.z })),
      });
      this.hud.setRadarWarning(r.warning);
      out.push(...r.markers);
    } else this.hud.setRadarWarning('');
    return out;
  }

  private garageSave(): SaveData['garage'] {
    const saved = this.tuning.serialize();
    const rides: SaveData['garage']['rides'] = [];
    for (const [id, car] of this.rides) {
      if (!car || car.destroyed || car.disposed) continue;
      const slots = saved.vehicles[id] ?? { engineBay: null, trunk: null, roofRack: null };
      // Not tuned and not bought (someone's car on the lift): it isn't yours to keep.
      if (!car.bought && !Object.values(slots).some(Boolean)) continue;
      const p = car.position;
      const onStreet = p.y < 3 && p.y > -1;
      rides.push({
        id,
        spec: car.spec.id,
        color: car.color,
        slots: { ...slots },
        upgrades: car.upgrades ? { ...car.upgrades } : undefined,
        paid: car.paid || undefined,
        health: Math.round(car.health),
        at: onStreet ? { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, heading: Math.round(car.heading * 100) / 100 } : undefined,
      });
    }
    return { rides, streetmon: [...this.garageMon.values()].map(creatureToJson) };
  }

  /** Brings tuned rides back (parked in the bays by the Chop Shop) with their Streetmon. */
  private garageLoad(g: SaveData['garage']): void {
    for (const car of this.rides.values()) {
      this.vehicles.owned.delete(car);
      this.riders.set(car, []);
      // The cars from before the load go (a save imported mid-game would otherwise double them).
      if (!car.disposed && car !== this.player.vehicle) this.vehicles.remove(car);
    }
    this.rides.clear();
    this.garageMon.clear();
    for (const c of g.streetmon) this.garageMon.set(c.uid, c);
    const s = this.chopSpot;
    const dir = s.side > 0 ? 1 : -1;
    g.rides.forEach((r, i) => {
      const bay = s.bays[i] ?? { x: s.x - dir * (i + 1) * 7.5, z: s.z, heading: s.heading };
      // Where it was left, unless something is parked there now; else a Chop Shop bay.
      const at = r.at && !this.vehicles.cars.some((c) => !c.disposed && Math.hypot(c.position.x - r.at!.x, c.position.z - r.at!.z) < 4) ? r.at : bay;
      for (const c of [...this.vehicles.cars]) if (!c.disposed && !c.driver && Math.hypot(c.position.x - at.x, c.position.z - at.z) < 5) this.vehicles.remove(c);
      const car = this.vehicles.spawn(getSpec(r.spec), at.x, at.z, at.heading, r.color);
      car.tuneId = r.id;
      car.bought = !!r.paid;
      car.paid = r.paid ?? 0;
      if (r.upgrades) car.setUpgrades(sanitizeUpgrades(r.upgrades));
      if (r.health !== undefined) car.health = Math.max(1, Math.min(car.spec.health, r.health));
      this.rides.set(r.id, car);
      this.vehicles.owned.add(car);
    });
    this.tuning.load({ vehicles: Object.fromEntries(g.rides.map((r) => [r.id, r.slots])) });
    // Streetmon that ended up in no car go back to the team.
    const slotted = new Set(this.tuning.slottedIds());
    for (const id of [...this.garageMon.keys()]) if (!slotted.has(id)) this.returnFromGarage(id);
  }

  // ------------------------------------------------------------------ heists

  /** A party Streetmon as the heist rules see it (null if it's not in the party). */
  private crewInfo(id: string): CrewCandidate | null {
    const c = this.party.members.find((m) => m.uid === id);
    if (!c) return null;
    const sp = species(c.speciesId);
    return {
      id: c.uid,
      speciesId: c.speciesId,
      name: displayName(c),
      types: [...sp.types],
      level: c.level,
      stats: calcStats(sp, c.level, c.ivs),
      weightKg: sp.model.weightKg ?? defaultWeightKg(sp.model.height, sp.types),
      hp: c.hp,
    };
  }

  /** Builds the heist rules, the 3D side and the planning board. */
  private setupHeists(): void {
    this.heistWorld = new HeistWorld({
      scene: this.scene,
      world: this.world,
      effects: this.effects,
      vehicles: this.vehicles,
      models: this.creatureModels,
      tune: this.tuneWorld,
      config: heistsConfig as never,
      groundY: (x, z) => this.peds.groundY(x, z),
      blocked: (x, z) => this.peds.blocked(x, z),
      listener: () => this.camera.position,
    });
    this.heistMenu = new HeistMenu(this.container, this.icons);
    const hw = this.heistWorld;
    this.heists = new HeistManager({
      config: heistsConfig as never,
      adapter: {
        getStreetmon: (id) => this.crewInfo(id),
        getMoney: () => this.money,
        spend: (n) => {
          if (this.money < n) return false;
          this.money -= n;
          return true;
        },
        earn: (n) => void (this.money += n),
        getStars: () => this.wanted.stars,
        raiseWanted: (stars) => this.raiseWantedTo(stars),
        deploy: (t, crew) => {
          const creatures: Partial<Record<HeistRole, Creature>> = {};
          for (const [role, m] of Object.entries(crew)) {
            const c = this.party.members.find((x) => x.uid === m.id);
            if (c) creatures[role as HeistRole] = c;
          }
          if (this.follower.summoned) this.follower.recall();
          hw.deploy(t, creatures);
          hw.summonCrew(this.player.vehicle ? this.player.vehicle.position : this.player.position);
        },
        soundAlarm: () => {
          hw.alarm();
          this.alarmBellT = 0;
          this.peds.alarm(this.focus().x, this.focus().z, 40);
        },
        setCameras: (_t, on) => hw.setCameras(on),
        smokeScene: (_t, x, z, r, seconds) => {
          this.smokeZone = { x, z, r: Math.max(r, 18), until: this.gameTime + seconds };
          return hw.smoke(x, z, r, seconds);
        },
        breachStarted: (_t, i) => hw.breachStarted(i),
        breachDone: (_t, i, bags) => hw.breachDone(i, bags),
        lootTaken: (_t, bag) => {
          hw.lootTaken(bag);
          this.hud.toast(`Bag: $${bag.value.toLocaleString('en-US')} (${bag.kg} kg) — ${bag.carrier === 'hauler' ? 'your Hauler has it' : 'on your back'}`, 2200);
        },
        escapeStarted: (_t, _stars, drops) => {
          hw.escapeStarted(drops);
          this.chaseMusic = true;
        },
        cleanup: () => {
          hw.cleanupJob();
          this.player.speedMult = 1;
          this.player.canSprint = true;
          this.smokeZone = null;
        },
        notify: (text, ms) => this.hud.toast(text, ms),
        showBig: (text, color, ms) => this.hud.showBig(text, color, ms),
      },
    });
    this.heists.on('resolved', (r) => {
      this.saveDirty = true;
      if (r.ok) {
        this.autosaveFor('Heist complete');
        this.hud.showBig('SCORE!', '#4be37a', 3200);
        const parts = [`$${r.cash.toLocaleString('en-US')}`];
        if (r.spoiled) parts.push(`$${r.spoiled.toLocaleString('en-US')} lost to dye packs`);
        if (r.bonus) parts.push(`crew bonus $${r.bonus.toLocaleString('en-US')}`);
        this.hud.toast(`${r.target.name}: ${parts.join(', ')}.`, 6000);
      } else if (r.reason !== 'busted' && r.reason !== 'wasted') {
        this.hud.showBig('JOB OFF', '#d32f2f', 2500);
      }
    });
    this.heists.on('state', (e) => {
      if (e.to === 'INFILTRATION') this.hud.toast('On the job. Stay out of sight of the guards and cameras.', 3500);
    });
  }

  // ------------------------------------------------------------------ wanted level

  /** Raises the Wanted Level to at least `stars` (heists, street events). No stars in the sewers. */
  private raiseWantedTo(stars: number): void {
    const s = Math.max(1, Math.min(5, stars));
    // No stars gained in the sewers (the police can't see down there).
    if (this.wanted.stars >= s || this.layers.current === 'sewer') return;
    this.wanted.heat = Math.max(this.wanted.heat, STAR_HEAT[s - 1] + 0.5);
    this.wanted.stars = s;
    this.wanted.rose = true;
    this.wanted.unseenFor = 0;
    const f = this.focus();
    this.wanted.lastKnown = { x: f.x, z: f.z };
    audio.wantedUp();
  }

  // ------------------------------------------------------------------ living world

  /**
   * The living world: NPC Streetmon hunters and street chatter, wild territory fights and packs,
   * fleeing from cars and blasts, and the AI radius. In a game loop:
   *
   *   const living = new LivingWorld({ scene, camera, effects, dmgNums, peds, spawns, vehicles, models,
   *     layout, makePod, placeName, player, enabled, now, time, lore }, livingWorldConfig);
   *   spawns.events.onSpawned = (w) => living.onSpawned(w);      // packs
   *   onExplosion = (x, z, r) => living.explosion(x, z, r);      // scatter, break up fights
   *   startWildBattle = (w) => living.onPlayerBattle(w);         // you take over a creature
   *   // every frame, after the crowd and the wild Streetmon have moved:
   *   living.update(dt);
   */
  private setupLivingWorld(): void {
    const races = racesConfig as unknown as { tracks: Array<{ name: string }>; racers: { pool: Array<{ name: string }> } };
    this.living = new LivingWorld(
      {
        scene: this.scene,
        camera: this.camera,
        effects: this.effects,
        dmgNums: this.dmgNums,
        moveFx: this.moveFx,
        clear: (x, z) => !(this.destruction?.blocksAt(x, z, 0.5) ?? false),
        peds: this.peds,
        spawns: this.spawns,
        vehicles: this.vehicles,
        models: this.creatureModels,
        layout: this.layout,
        makePod: (id) => this.catcher.makeItem(id),
        placeName: (x, z) => this.hud.locationName(x, z),
        player: () => {
          const p = this.player;
          const f = this.focus();
          return { x: f.x, y: p.vehicle ? p.vehicle.position.y : p.feet.y, z: f.z, inCar: !!p.vehicle, layer: this.layers.current };
        },
        enabled: () => this.state === 'playing' && !this.player.dead && !this.battles.locksPlayer && !this.races.active && !this.heists.active,
        now: () => this.gameTime,
        time: () => phaseAt(this.hour),
        lore: {
          tracks: races.tracks.map((t) => t.name),
          racers: races.racers.pool.map((r) => r.name.replace(/"[^"]*" /, '')),
          crews: ((leagueConfig as unknown as LeagueConfig).crews ?? []).filter((c) => c.id !== 'tactical' && c.id !== 'commission').map((c) => c.name),
        },
      },
      livingWorldConfig as unknown as LivingWorldConfig,
    );
  }

  /**
   * Static collider streaming (ColliderStreamer): only the small static colliders near you stay in
   * the physics step. Run after everything's built (city, props, roofs, sewers, garages).
   */
  private setupColliderStreaming(): void {
    const byHandle = new Map<number, StreamCollider>();
    const world = this.world;
    world.forEachCollider((c: RAPIER.Collider) => {
      if (c.parent() || !c.isEnabled() || c.isSensor()) return;
      const sh = c.shape as unknown as { halfExtents?: { x: number; y: number; z: number }; radius?: number; halfHeight?: number };
      const ext = sh.halfExtents ? Math.max(sh.halfExtents.x, sh.halfExtents.z) : sh.radius ?? Infinity;
      // Streamed: posts, trees and street furniture (cylinders), kerbs, low walls and parapets.
      // Always on: the ground and the water (huge), and the buildings (tall boxes), which police
      // sight lines and long rifle shots need even far away.
      const tall = sh.halfExtents ? sh.halfExtents.y > 3 : false;
      if (!(ext < 30) || tall) return;
      const t = c.translation();
      const handle = c.handle;
      const sc: StreamCollider = {
        x: t.x,
        z: t.z,
        setEnabled: (on) => world.getCollider(handle)?.setEnabled(on),
        alive: () => !!world.getCollider(handle),
      };
      byHandle.set(handle, sc);
      this.colliderStream.add(sc);
    });
    if (this.destruction)
      this.destruction.colliderControl = {
        hold: (c) => {
          const sc = byHandle.get(c.handle);
          if (sc) this.colliderStream.hold(sc);
          else c.setEnabled(false);
        },
        release: (c) => {
          const sc = byHandle.get(c.handle);
          if (sc) this.colliderStream.release(sc);
          else c.setEnabled(true);
        },
      };
    const f = this.focus();
    this.colliderStream.refresh(f.x, f.z);
  }

  /** What the weather does each frame: the sky and light, grip, sight, the crowd, wild Streetmon, the grass. */
  private wetMats: { ground: THREE.MeshStandardMaterial | null; sidewalk: THREE.MeshStandardMaterial | null; markings: THREE.MeshStandardMaterial | null } | null = null;

  private applyWeather(dt: number): void {
    const w = this.weather.params();
    const fx = weatherEffects(w);
    const n = this.hoodNow;
    this.env.applyAtmosphere({ cloud: w.cloud, fog: w.fog, rain: w.rain, flash: this.weather.flash, tint: n?.tint ?? 0xffffff, haze: n?.haze ?? 0 });
    CAR_WEATHER.grip = fx.grip;
    VISION.car.range = this.visionBase.car * fx.vision;
    VISION.foot.range = this.visionBase.foot * fx.vision;
    VISION.patrol.range = this.visionBase.patrol * fx.vision;
    if (!this.crowdBase.peds) this.crowdBase = { peds: this.peds.maxPeds, cars: this.traffic.maxCars };
    this.peds.maxPeds = Math.max(8, Math.round(this.crowdBase.peds * fx.crowd));
    this.spawns.typeBoost = fx.types;
    FLORA_WIND.time.value += dt * (1 + w.wind * 1.5);
    FLORA_WIND.strength.value = 0.25 + w.wind * 0.9;
    // Wet streets: the asphalt goes dark and glossy (it reflects the sky and the lamps), the
    // pavement less so, and the paint on the markings sheens up.
    if (!this.wetMats) {
      const find = (name: string): THREE.MeshStandardMaterial | null => (this.cityRoot?.getObjectByName(name) as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | null;
      this.wetMats = { ground: find('ground'), sidewalk: find('sidewalk'), markings: find('markings') };
    }
    const wet = w.wet;
    const wm = this.wetMats;
    if (wm.ground) {
      wm.ground.roughness = 1 - 0.6 * wet;
      wm.ground.color.setScalar(1 - 0.55 * wet);
    }
    if (wm.sidewalk) {
      wm.sidewalk.roughness = 1 - 0.35 * wet;
      wm.sidewalk.color.setScalar(1 - 0.35 * wet);
    }
    if (wm.markings) wm.markings.roughness = 0.7 - 0.45 * wet;
    // Thunder follows the flash (further storms rumble later and softer).
    if (this.weather.flash === 1 && this.layers.current !== 'sewer') window.setTimeout(() => audio.explosion?.({ x: this.camera.position.x + 400, y: 200, z: this.camera.position.z + 300 }), 700 + Math.random() * 1500);
  }

  /** Crossing into a named neighbourhood: its name on screen, its light, its people. */
  private updateNeighbourhood(dt: number): void {
    if (this.layers.current !== 'street' && this.layers.current !== 'roof') return;
    const f = this.focus();
    const n = this.hood.update(neighbourhoodAt(this.layout, f.x, f.z), dt);
    if (!n) return;
    const first = this.hoodNow === null;
    this.hoodNow = n;
    if (!first || this.gameTime > 3) this.hud.showDistrict(n.name, n.tagline);
  }

  /** People say things as you pass (speech bubbles), now and then. */
  private updateChatter(dt: number): void {
    this.chatterIn -= dt;
    if (this.chatterIn > 0 || this.battles.locksPlayer) return;
    const seed = Math.floor(Math.random() * 1e6);
    const pos = this.player.position;
    const head = (x: () => number, y: () => number, z: () => number) => () => ({ x: x(), y: y(), z: z() });
    if (this.interior) {
      const ppl = this.roomPeople.filter((pp) => pp.room === this.interior && Math.hypot(pp.model.root.position.x - pos.x, pp.model.root.position.z - pos.z) < 18);
      this.chatterIn = chatterGap(this.interior.spot.kind === 'casino' ? 'casino' : 'room', seed);
      const pp = ppl[seed % Math.max(1, ppl.length)];
      const line = pp ? roomChatter(pp.role, seed) : '';
      if (pp && line) this.bubbles.say(`room-${pp.role}-${pp.seed}`, head(() => pp.model.root.position.x, () => pp.model.root.position.y + 2.05, () => pp.model.root.position.z), line, pp.role === 'gambler' && /!/.test(line) ? 'shout' : 'say');
      // The casino floor rings.
      if (this.interior.spot.kind === 'casino' && seed % 4 === 0) audio.ui();
      return;
    }
    if (this.layers.current === 'sewer') {
      this.chatterIn = chatterGap('sewer', seed);
      const n = this.people.find((q) => q.model && Math.hypot(q.x - pos.x, q.z - pos.z) < 16);
      if (n) this.bubbles.say(`sewer-${n.spec.id}`, () => ({ x: n.x, y: n.y + 2.05, z: n.z }), sewerChatter(seed), 'say');
      return;
    }
    this.chatterIn = chatterGap('street', seed);
    const near = this.peds.peds.filter((q) => q.role === 'civ' && (q.state === 'walk' || q.state === 'wait') && Math.hypot(q.x - pos.x, q.z - pos.z) < 22);
    if (!near.length) return;
    const q = near[seed % near.length];
    const d = Math.hypot(q.x - pos.x, q.z - pos.z);
    const line = streetChatter(seed, {
      hour: this.hour,
      weather: this.weather.dominant,
      mood: civicTier(this.civic).mood,
      wanted: this.wanted.stars,
      district: this.hoodNow?.name ?? '',
      districtLine: this.hoodNow ? this.hoodNow.lines[seed % this.hoodNow.lines.length] : undefined,
      near: d < 5,
      gangFight: !!this.gangs?.fighting,
    });
    if (line) this.bubbles.say(`ped-${this.peds.peds.indexOf(q)}`, () => (q.state === 'dead' ? null : { x: q.x, y: q.y + 2.05, z: q.z }), line, this.gangs?.fighting ? 'shout' : 'say');
  }

  /** Fuel drums and transformer boxes: where they stand, and what they do when they go. */
  private setupHazards(): void {
    this.hazards = new EnvHazards({
      scene: this.scene,
      world: this.world,
      wet: () => this.weather.params().wet,
      time: () => this.gameTime,
      blast: (x, y, z, r, dmg) => {
        this.effects.explosion(x, y, z);
        audio.explosion({ x, y, z });
        for (const q of this.peds.peds) {
          if (q.state === 'dead' || Math.abs(q.y - y) > 4) continue;
          const d = Math.hypot(q.x - x, q.z - z);
          if (d < r) this.peds.damage(q, dmg * (1 - d / r), q.x - x, q.z - z, 9 * (1 - d / r) + 3);
        }
        for (const c of this.vehicles.cars) if (!c.disposed && Math.hypot(c.position.x - x, c.position.z - z) < r) c.damage(dmg * 2, 'explosive');
        this.weapons.creatureBlast?.(x, z, r, dmg);
        this.onExplosion(x, y, z, r, dmg);
        this.crime('explosion', this.tmp.set(x, y, z));
      },
      shock: (x, y, z, r, dmg, stun) => {
        this.effects.sparks(x, y + 0.6, z, 30);
        audio.bulletHit(true, { x, y, z });
        for (const q of this.peds.peds) {
          if (q.state === 'dead' || Math.abs(q.y - y) > 3) continue;
          const d = Math.hypot(q.x - x, q.z - z);
          if (d >= r) continue;
          this.peds.damage(q, dmg * (1 - d / (r * 1.4)), q.x - x, q.z - z, 0);
          if ((q.state as string) !== 'dead') {
            q.state = 'down';
            q.timer = stun;
          }
        }
        this.weapons.creatureBlast?.(x, z, r, dmg * 0.6);
        const p = this.player;
        if (!p.vehicle && Math.hypot(p.position.x - x, p.position.z - z) < r && Math.abs(p.feet.y - y) < 2) {
          p.knockBack(0, 1, 0, stun * 0.5);
          if (p.takeDamage(dmg * 0.5, 'env')) this.kill('Electrocuted');
        }
        if (this.weather.params().wet > 0.3) this.hud.toast('The wet street carries the charge!', 1600);
      },
    });
    const spots: HazardSpot[] = [];
    // Drums: in the alleys (by the dumpsters), on the docks, on the gang corners.
    for (const a of this.layout.alleys ?? []) {
      const r = a.rect;
      const long = r.x1 - r.x0 > r.z1 - r.z0;
      spots.push({ kind: 'drum', x: long ? r.x0 + (r.x1 - r.x0) * 0.7 : r.x1 - 0.6, y: this.peds.groundY(long ? r.x0 + (r.x1 - r.x0) * 0.7 : r.x1 - 0.6, long ? r.z1 - 0.6 : r.z0 + (r.z1 - r.z0) * 0.7), z: long ? r.z1 - 0.6 : r.z0 + (r.z1 - r.z0) * 0.7 });
    }
    for (const t of this.gangs.turfs) for (const [dx, dz] of [[3.2, 1.2], [-2.6, 2.2]] as Array<[number, number]>) if (!this.peds.blocked(t.x + dx, t.z + dz)) spots.push({ kind: 'drum', x: t.x + dx, y: this.peds.groundY(t.x + dx, t.z + dz), z: t.z + dz });
    // Transformer boxes: one on a sidewalk every few blocks.
    this.layout.blocks.forEach((b, i) => {
      if (i % 7 !== 3) return;
      const x = b.x0 + 1.0;
      const z = (b.z0 + b.z1) / 2 + 3;
      if (!this.peds.blocked(x, z) && !this.layout.buildings.some((bb) => x > bb.rect.x0 - 0.5 && x < bb.rect.x1 + 0.5 && z > bb.rect.z0 - 0.5 && z < bb.rect.z1 + 0.5)) spots.push({ kind: 'transformer', x, y: this.peds.groundY(x, z), z });
    });
    this.hazards.add(spots, this.cityRoot);
    this.gangs.addHazards = (h, parent) => this.hazards.add(h, parent);
  }

  /** Rolls in a shop or office would only knock the furniture over: in rooms you can't roll. */
  private interiorBlocksRoll(): boolean {
    return !!this.interior && this.interior.spot.kind !== 'casino';
  }

  /** Roll or (with a gun up) dive toward the way you're pushing. */
  private startDodge(mx: number, mz: number): void {
    const p = this.player;
    const gun = this.aiming && isRanged(this.weapons.current);
    const kind = gun ? 'dive' : 'roll';
    if (p.tryDodge(kind, mx, mz)) {
      audio.sfx(gun ? 'sfx_dive' : 'sfx_roll', p.position);
      this.tut.fire('rolled');
      return;
    }
    // Why not (once in a while, not on every press).
    if (this.gameTime - this.rollNoteAt > 2.5 && p.onFoot && !p.rolling) {
      this.rollNoteAt = this.gameTime;
      if (p.dodge.winded > 0 || p.dodge.stamina < 10) this.hud.toast('Winded: catch your breath first.', 1200);
    }
  }

  /** Stamina bar under the health bar: shows when you've used some, flashes when a hit is dodged. */
  private updateStaminaHud(): void {
    const p = this.player;
    if (!this.staminaEl) {
      this.staminaEl = document.createElement('div');
      this.staminaEl.className = 'stamina';
      this.staminaEl.innerHTML = '<div class="st-fill"></div><span class="st-label">DODGED</span>';
      this.hud.el.appendChild(this.staminaEl);
    }
    const el = this.staminaEl;
    const st = p.dodge.stamina / 100;
    const show = p.onFoot && (st < 0.999 || p.dodge.winded > 0);
    el.style.opacity = show ? '1' : '0';
    (el.firstElementChild as HTMLDivElement).style.width = `${(st * 100).toFixed(1)}%`;
    el.classList.toggle('winded', p.dodge.winded > 0);
    if (p.dodgedHit) {
      p.dodgedHit = false;
      el.classList.remove('dodged');
      void el.offsetWidth;
      el.classList.add('dodged');
      el.style.opacity = '1';
    }
  }

  /** The Gutter Kings, speech bubbles, the street weapon stashes. */
  private setupGangs(): void {
    this.bubbles = new Bubbles(this.container);
    this.gangs = new GangWorld({
      scene: this.scene,
      world: this.world,
      peds: this.peds,
      weapons: this.weapons,
      effects: this.effects,
      layout: this.layout,
      bubbles: this.bubbles,
      player: () => {
        const p = this.player;
        const at = p.vehicle ? p.vehicle.position : p.position;
        return { x: at.x, y: at.y, z: at.z, feetY: p.vehicle ? at.y : p.feet.y, moving: Math.hypot(p.velocity.x, p.velocity.z) > 1 || !!p.vehicle, inCar: !!p.vehicle, dead: p.dead, onFoot: p.onFoot };
      },
      layer: () => this.layers.current,
      hurtPlayer: (amount, cause, fx, fz) => {
        const p = this.player;
        if (p.vehicle) {
          p.vehicle.damage(amount * 2.5, 'bullet');
          return;
        }
        this.effects.blood(p.position.x, p.position.y + 0.7, p.position.z, p.position.x - fx, p.position.z - fz, 5);
        if (p.takeDamage(amount)) this.kill(cause);
      },
      copFiresAtPlayer: (cop) => this.onOfficerFire(cop, 0.35),
      bestLevel: () => Math.max(0, ...this.party.members.map((c) => c.level)),
      streetCred: () => this.races?.streetCred ?? 0,
      wanted: () => this.wanted.stars,
      toast: (t, ms) => this.hud.toast(t, ms ?? 3000),
      big: (t, c) => this.hud.showBig(t, c, 2600),
      startBattle: (m, intro) => this.startGangBattle(m, intro),
      battleActive: () => this.battles.active,
      battleTurnBased: () => this.battles.mode === 'turn',
      rep: (ev) => this.repEvent(ev),
      reward: (cash, items, weapon) => {
        const got: string[] = [];
        if (cash > 0) {
          this.money += cash;
          got.push(`$${cash.toLocaleString('en-US')}`);
          audio.cash();
        }
        for (const [id, n] of items) {
          if (!DATA.items.has(id)) continue;
          this.bag.add(id, n);
          got.push(`${n} x ${itemSpec(id).name}`);
        }
        if (weapon) {
          this.weapons.inventory.give(weapon[0], weapon[1]);
          got.push(`a ${weapon[0].toUpperCase()}`);
        }
        this.saveDirty = true;
        return got.length ? `You get ${got.join(', ')}.` : '';
      },
      transition: (to, label) => this.transition('sewer', to, { seconds: 1.4, label }),
      dirty: () => {
        this.saveDirty = true;
      },
    });
    // The crowned door: a quiet dead end on Downtown's deepest level.
    const deep = this.deepMazes.find((m) => m.district === 'downtown' && m.level === 3) ?? this.deepMazes.find((m) => m.level === 3);
    if (deep) {
      const used = (i: number, j: number): boolean => deep.caches.some((c) => c.i === i && c.j === j) || this.shafts.some((s) => Math.hypot(s.to.x - blockCentre(deep, i, j).x, s.to.z - blockCentre(deep, i, j).z) < 4 || Math.hypot(s.from.x - blockCentre(deep, i, j).x, s.from.z - blockCentre(deep, i, j).z) < 4);
      let ends = deep.deadEnds.filter((d) => !used(d.i, d.j) && !deep.pools.has(blockKey(d.i, d.j)));
      if (!ends.length) {
        // No spare dead end: any quiet tunnel block with a blank wall to put the door in.
        ends = [];
        for (let i = 1; i < deep.size - 1; i++)
          for (let j = 1; j < deep.size - 1; j++) {
            if (!deep.open[i][j] || used(i, j) || deep.pools.has(blockKey(i, j)) || deep.hazards.has(blockKey(i, j))) continue;
            const walls = [deep.open[i + 1][j], deep.open[i - 1][j], deep.open[i][j + 1], deep.open[i][j - 1]].filter((o) => !o).length;
            if (walls >= 2 && !propAt(deep, blockCentre(deep, i, j).x, blockCentre(deep, i, j).z, 1.2)) ends.push({ i, j });
          }
      }
      const hub = blockCentre(deep, deep.hub.i, deep.hub.j);
      const e = ends.sort((a, b) => Math.hypot(blockCentre(deep, b.i, b.j).x - hub.x, blockCentre(deep, b.i, b.j).z - hub.z) - Math.hypot(blockCentre(deep, a.i, a.j).x - hub.x, blockCentre(deep, a.i, a.j).z - hub.z))[0];
      if (e) {
        const c = blockCentre(deep, e.i, e.j);
        // The wall opposite the dead end's one opening.
        const dirs: Array<[number, number]> = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        // Face the door out of a wall, toward an open neighbour (the opposite side if that's solid).
        const openDir = dirs.find(([di, dj]) => deep.open[e.i + di]?.[e.j + dj] && !deep.open[e.i - di]?.[e.j - dj]) ?? dirs.find(([di, dj]) => !deep.open[e.i - di]?.[e.j - dj]) ?? [1, 0];
        const wall: [number, number] = [-openDir[0], -openDir[1]];
        this.gangs.placeDoor({ x: c.x + wall[0] * (SEWER.block / 2 - 0.08), y: deep.floor, z: c.z + wall[1] * (SEWER.block / 2 - 0.08), nx: openDir[0], nz: openDir[1] });
      }
    }
    // Weapon stashes down the alleys.
    this.streetCaches = planStreetCaches(this.layout);
    this.streetCacheView = buildStreetCaches(this.streetCaches, (x, z) => this.peds.groundY(x, z));
    this.cityRoot.add(this.streetCacheView.root);
  }

  /** A weapon stash down an alley: search it (or pick the padlock). */
  private streetCacheUse(): { label: string; act: () => void } | null {
    if (this.layers.current !== 'street' || this.interior) return null;
    const p = this.player.position;
    const c = this.streetCaches.find((k) => Math.hypot(k.x - p.x, k.z - p.z) < 1.8 && !this.progress.stashesOpened.includes(k.id));
    if (!c) return null;
    if (c.locked && this.bag.count('lockpick') <= 0) return { label: 'A padlocked crate (needs a Lockpick Set)', act: () => this.hud.toast('Padlocked. A Lockpick Set would do it: the deli and the black market sell them.', 2600) };
    return {
      label: c.locked ? 'Pick the padlock' : 'Search the duffel bag',
      act: () => {
        if (c.locked) this.bag.take('lockpick');
        this.progress.stashesOpened.push(c.id);
        this.streetCacheView?.setOpen(c.id, true);
        this.weapons.inventory.give(c.weapon, c.rounds);
        this.money += c.cash;
        audio.cash();
        this.hud.toast(`Stash: a ${c.weapon.toUpperCase()}${c.rounds ? ` with ${c.rounds} rounds` : ''} and $${c.cash}.`, 3200);
        this.saveDirty = true;
      },
    };
  }

  /** A Gutter King sets his Streetmon on yours: always real time, so the shooting carries on round you. */
  private startGangBattle(m: GangMember, intro: string): boolean {
    const p = this.player;
    if (this.battles.active || this.evolution.active || !this.party.canFight || !p.onFoot || p.dead || this.trans) return false;
    this.aiming = false;
    this.battles.mode = 'realtime';
    this.rig.yaw = Math.atan2(-(m.ped.z - p.position.z), m.ped.x - p.position.x) - Math.PI;
    this.battleLook.copy(p.position);
    this.battles.setPlayer(p.position);
    this.battles.startTeam(this.party, { kind: 'npc', name: m.name, intro, team: m.team, foePos: new THREE.Vector3(m.ped.x, 0, m.ped.z), canRun: !m.boss, ped: m.ped });
    return true;
  }

  /** Reputation: Street Cred (shared with the racing league) and Civic standing move together. */
  repEvent(ev: RepEvent, times = 1): void {
    const before = civicTier(this.civic).name;
    const r = applyRep(this.races?.streetCred ?? 0, this.civic, ev, times);
    if (this.races) {
      this.races.streetCred = r.street;
      this.progress.streetCred = r.street;
    }
    this.civic = r.civic;
    const after = civicTier(this.civic).name;
    if (after !== before) this.hud.toast(`People see you differently now: ${after}.`, 3000);
    this.saveDirty = true;
  }

  /** Legendary raids: the world side, wired to the game. */
  private setupRaids(): void {
    this.raidWorld = new RaidWorld({
      scene: this.scene,
      container: this.container,
      spawns: this.spawns,
      models: this.creatureModels,
      peds: this.peds,
      vehicles: this.vehicles,
      effects: this.effects,
      moveFx: this.moveFx,
      dmgNums: this.dmgNums,
      decals: this.decals,
      destruction: this.destruction,
      groundAt: (x, z) => this.groundAt(x, z),
      clear: (x, z) => this.battleClear(x, z),
      player: () => {
        const p = this.player;
        const pos = p.vehicle ? p.vehicle.position : p.position;
        const layer = this.layers.current;
        const district = (layer === 'sewer' ? this.mazeAt(pos.x, pos.z)?.district : districtAt(this.layout, pos.x, pos.z)) ?? 'midtown';
        return { pos, onFoot: p.onFoot, layer, district: district as never, time: phaseAt(this.hour), inCar: !!p.vehicle };
      },
      partyLevel: () => Math.max(1, ...this.party.members.map((m) => m.level)),
      busy: () => this.state !== 'playing' || this.player.dead || this.battles.active || !!this.races?.active || !!this.heists?.active || !!this.trans,
      hurtPlayer: (amount, dx, dz, cause) => {
        const p = this.player;
        if (p.dead || p.vehicle) return;
        p.knockBack(dx * 9, 5, dz * 9, 2.2);
        if (p.takeDamage(amount)) this.kill(cause);
      },
      toast: (t, ms) => this.hud.toast(t, ms),
      big: (t, c, ms) => this.hud.showBig(t, c, ms),
      questDone: (id) => {
        const st = currentStep(this.progress.quests, id);
        if (st?.type === 'raid') this.advance(id);
      },
      listener: () => this.camera.position,
      shake: (a) => this.shakeCamera(a),
    });
    // Tips: the first raid, its battle and the catch window.
    const r = this.raidWorld.raids;
    const origUpdate = r.update.bind(r);
    r.update = (dt, ctx) => {
      const ev = origUpdate(dt, ctx);
      for (const e of ev) {
        if (e.type === 'omen') this.tut.fire('raidOmen');
        if (e.type === 'arrive') {
          this.tut.fire('raidArrive');
          const def = r.def(e.id);
          this.queueCinematic({ raidArrive: e.id }, { name: species(def.species).name.toUpperCase() }, undefined, 8);
        }
      }
      return ev;
    };
  }

  /** Walks up to a rampaging legendary and takes it on, with the trainers who came to help. */
  private startRaidBattle(): void {
    if (this.battles.active || this.evolution.active || !this.party.canFight) return;
    const e = this.raidWorld.engage();
    if (!e) return;
    const w = e.boss;
    w.state = 'engaged';
    w.pinned = true;
    this.aiming = false;
    this.battles.mode = BATTLE.mode;
    const toFoe = Math.atan2(-(w.z - this.player.position.z), w.x - this.player.position.x);
    if (BATTLE.mode === 'turn') {
      this.player.facingOverride = toFoe;
      if (this.input.pointerLocked) document.exitPointerLock();
    } else this.rig.yaw = toFoe - Math.PI;
    this.battleLook.copy(this.player.position);
    this.markSeen(w.spec.id);
    // Pull the camera back for the big foe (less in the tunnels, and under the ceiling).
    const under = this.layers.current === 'sewer';
    this.battles.startRaid(this.party, w, e.allies, this.player.position, { foeActions: e.foeActions, foeDamage: e.foeDamage, intro: e.intro, camZoom: under ? 1.35 : 1.8 * Math.sqrt(w.sizeScale ?? 1), camMaxHeight: under ? SEWER.height - 0.5 : undefined });
    if (BATTLE.mode === 'turn') this.hud.setVisible(false);
    this.tut.fire('raidBattle');
  }

  /** An aggressive wild Streetmon bit / hit the player. */
  private onWildBite(w: WildCreature, dmg: number): void {
    const p = this.player;
    if (p.dead || p.vehicle) return;
    this.tut.fire('bitten');
    const dx = p.position.x - w.x;
    const dz = p.position.z - w.z;
    const d = Math.hypot(dx, dz) || 1;
    const k = this.living.cfg.aggro.knockBack;
    p.knockBack((dx / d) * k, 1.2, (dz / d) * k, 0);
    audio.swing(true);
    this.hud.hurtFlash(Math.min(1, dmg / 12));
    this.dmgNums.spawn(p.position.x, p.position.y + 1.2, p.position.z, dmg, 'hit');
    if (performance.now() - this.biteToastAt > 12000) {
      this.biteToastAt = performance.now();
      this.hud.toast(`A wild ${w.spec.name} is attacking you! Run, hide, or press B to battle it.`, 3500);
    }
    if (p.takeDamage(dmg)) this.kill(`Mauled by a wild ${w.spec.name}`);
  }

  // ------------------------------------------------------------------ campaign

  /**
   * The campaign (USRL story) and the racing league. In a game loop:
   *
   *   const quests = new QuestManager({ campaign, league, adapter: { earn, money, spend, addStreetCred,
   *     addItem, unlockBlueprint, giveStreetmon, setWanted, notify } });
   *   // what happens in the game:
   *   races.on('resolved', (r) => quests.notify({ type: 'race', track: r.track.id, place: r.place, night }));
   *   heists.on('resolved', (r) => quests.notify({ type: 'heist', target: r.target.id, ok: r.ok }));
   *   onCaught = (c) => quests.notify({ type: 'catch', species, types, level, district });
   *   onBossBattleEnd = (won) => quests.notify({ type: 'boss', boss, won });
   *   onBusted = () => quests.notify({ type: 'busted' });
   *   races.on('accepted', ...) -> quests.raceRules(track.id): entry fee, open tracks, police
   *   // every frame:
   *   quests.update(dt, { x, z, layer, inVehicle, streetCred, stars, night, tunedSlots });
   *   campaignWorld.update(dt, quests.markers(where));   // givers, bosses, beacon
   *   // E next to someone: quests.talk(npcId) -> dialogue -> quests.choose(d, i)
   */
  private setupCampaign(): void {
    const C = campaignConfig as unknown as CampaignConfig;
    const LG = leagueConfig as unknown as LeagueConfig;
    const tracks = this.races.config.tracks.map((t) => t.id as string);
    validateCampaign(C, { species: (id) => DATA.species.has(id), items: (id) => DATA.items.has(id), tracks, heists: this.heists.targets.map((t) => t.id), types: TYPE_IDS });
    validateLeague(LG, { tracks, bosses: C.bosses.map((b) => b.id) });
    validateCinematics(cinematicsConfig as unknown as CinematicConfig, {
      anchors: ['player', 'mama', 'chop', 'bank', 'raid', 'boss'],
      species: (id) => DATA.species.has(id),
      specs: (id) => ['taxi', 'sedan', 'suv', 'sports', 'police', 'van', 'beater'].includes(id),
      quests: (id) => C.quests.some((q) => q.id === id),
      acts: (id) => C.acts.some((a) => a.id === id),
    });
    this.quests = new QuestManager({
      campaign: C,
      league: LG,
      adapter: {
        earn: (n) => {
          this.money += n;
          audio.cash();
        },
        money: () => this.money,
        spend: (n) => {
          if (this.money < n) return false;
          this.money -= n;
          audio.cash();
          return true;
        },
        addStreetCred: (n) => {
          this.races.streetCred += n;
          this.progress.streetCred = this.races.streetCred;
        },
        addItem: (id, n) => this.bag.add(id, n),
        itemName: (id) => DATA.items.get(id)?.name ?? id,
        unlockBlueprint: (b: Blueprint) => window.setTimeout(() => this.hud.toast(`Blueprint unlocked: ${b.name}. ${b.description}`, 5000), 1800),
        giveStreetmon: (l) => {
          const c = createCreature(l.species, l.level, Math.random, { shiny: !!l.shiny });
          c.nickname = l.nickname;
          this.addCaught(c, 'legendary');
          window.setTimeout(() => {
            this.hud.showBig('LEGENDARY!', '#ffd23f', 3500);
            this.hud.toast(`${l.nickname} (${species(l.species).name}, Lv ${l.level}) joined you. ${l.description}`, 6000);
          }, 1200);
        },
        setWanted: (stars) => this.raiseWantedTo(stars),
        notify: (text, ms) => this.hud.toast(text, ms),
        onAccept: (q) => {
          if (q.onAccept?.chooseStarter && !this.party.members.length) this.pendingStarter = true;
          if (q.onAccept?.items?.length) audio.ui();
        },
      },
    });
    const Q = this.quests;
    const roman = ['', 'I', 'II', 'III', 'IV', 'V'];
    Q.on('actStarted', (e) => {
      const toast = (): void => this.hud.toast(`Act ${roman[e.act.number] ?? e.act.number}: ${e.act.title}. ${e.act.summary}`, 7000);
      // With a cinematic the act card is its first caption; the summary follows it.
      if (this.queueCinematic({ actStarted: e.act.id }, {}, toast)) return;
      this.hud.showBig(`ACT ${roman[e.act.number] ?? e.act.number}`, '#ffd23f', 3500);
      toast();
    });
    Q.on('actCompleted', (e) => window.setTimeout(() => this.hud.showBig(`ACT ${roman[e.act.number] ?? e.act.number} COMPLETE`, '#4be37a', 4000), 600));
    Q.on('completed', (e) => {
      this.queueCinematic({ questCompleted: e.quest.id });
      this.saveDirty = true;
      this.hud.showBig('JOB DONE', '#4be37a', 2600);
      if (e.rewards.length) this.hud.toast(`${e.quest.title}: ${e.rewards.join(', ')}.`, 5000);
    });
    Q.on('failed', (e) => {
      this.saveDirty = true;
      if (e.reason !== 'abandoned') this.hud.showBig('JOB FAILED', '#d32f2f', 2600);
    });
    Q.on('objective', (e) => {
      this.saveDirty = true;
      if ((e.index ?? 0) > 0) this.hud.toast(e.objective.text, 3000);
    });
    // New work: say who has it (once per batch, so a finished job unlocking two doesn't spam).
    let offers: string[] = [];
    Q.on('offer', (e) => {
      const who = Q.npc(e.quest.giver)?.name ?? e.quest.giver;
      if (!offers.length)
        window.setTimeout(() => {
          const names = [...new Set(offers)];
          offers = [];
          this.hud.toast(`${names.join(' and ')} ${names.length > 1 ? 'have' : 'has'} work for you. Look for the yellow M on your map.`, 6000);
        }, 2500);
      offers.push(who);
    });
    Q.on('rank', (e) => {
      if (e.promoted) {
        this.hud.showBig('PROMOTED!', '#ffd23f', 3000);
        this.hud.toast(`Promoted to the ${e.division.name}. League entry fee $${e.division.entryFee}, prize money x${e.division.payoutMult}.`, 5000);
      }
    });
    this.campaignWorld = new CampaignWorld({
      scene: this.scene,
      quests: Q,
      groundY: (x, z) => this.peds.groundY(x, z),
      player: () => {
        const f = this.focus();
        return { x: f.x, z: f.z, onFoot: this.player.onFoot && !this.player.dead, layer: this.layers.current };
      },
    });
    // League rules on races: open tracks, entry fees, police for story races.
    this.races.on('accepted', (e) => {
      const rules = Q.raceRules(e.track.id, this.questCtx());
      if (!rules.open) {
        this.races.decline();
        this.hud.toast(`${e.track.name} is a ${rules.needs?.name ?? 'higher'} race (USRL). ${this.leagueMissingText()}`, 4500);
        this.tut.fire('raceLocked');
        return;
      }
      if (rules.fee > 0) {
        if (this.money < rules.fee) {
          this.races.decline();
          this.hud.toast(`USRL entry fee: $${rules.fee} (${rules.division.name}). You can't cover it.`, 4000);
          return;
        }
        this.money -= rules.fee;
        this.hud.toast(`USRL entry fee paid: $${rules.fee} (${rules.division.name}).`, 2500);
      }
      if (rules.nightOnly && phaseAt(this.hour) !== 'night') this.hud.toast('This one only counts for the job after dark.', 3000);
    });
    this.races.on('go', () => {
      const t = this.races.race?.track;
      const rules = t ? Q.raceRules(t.id, this.questCtx()) : null;
      if (rules?.police && (!rules.nightOnly || phaseAt(this.hour) === 'night')) {
        this.raiseWantedTo(rules.police);
        this.hud.toast(`The police are waiting on the route. ${'★'.repeat(rules.police)}`, 3000);
      }
    });
    this.races.on('resolved', (r) => {
      const rules = Q.raceRules(r.track.id, this.questCtx());
      if (r.place !== null && r.cash > 0 && rules.payoutMult > 1) {
        const extra = Math.round(r.cash * (rules.payoutMult - 1));
        this.money += extra;
        window.setTimeout(() => this.hud.toast(`USRL ${rules.division.name} bonus: +$${extra}.`, 3000), 1500);
      }
      Q.notify({ type: 'race', track: r.track.id, place: r.place, night: phaseAt(this.hour) === 'night' }, this.questCtx());
    });
    this.heists.on('resolved', (r) => Q.notify({ type: 'heist', target: r.target.id, ok: !!r.ok }, this.questCtx()));
  }

  /** What the quest manager needs to know about the player this frame. */
  // ------------------------------------------------------------------ tutorials

  /**
   * Tutorials (tutorials.json, tutorialManager.js): the game reports situations (scanned a few
   * times a second: a car within reach, a wild Streetmon close by, a manhole, a heist board...),
   * events (a battle starts, wanted, busted, an evolution...) and the practice actions you do;
   * the campaign asks for the tips its objectives need (`tutorial` on an objective). The card is
   * TutorialCard; the pause menu turns tips off and replays any of them.
   */
  private setupTutorials(): void {
    const C = tutorialsConfig as unknown as TutorialConfig;
    validateTutorials(C, { events: C.events, actions: C.actions });
    for (const q of this.quests.campaign.quests)
      for (const o of q.objectives)
        if (o.tutorial && !C.tutorials.some((t) => t.id === o.tutorial)) throw new Error(`campaign: ${q.id}/${o.id} asks for an unknown tutorial (${o.tutorial})`);
    this.tut = new TutorialManager({ config: C });
    this.tutCard = new TutorialCard(this.container, this.tut);
    const T = this.tut;
    const Q = this.quests;
    Q.on('offer', () => T.fire('questOffer'));
    Q.on('started', (e) => {
      if (e.quest.id === FIRST_CAR_QUEST) this.giveFirstCar(true);
      T.fire('questStarted');
      this.queueCinematic({ questStarted: e.quest.id });
    });
    // The story teaches what its next job needs, as the job asks for it.
    Q.on('objective', (e) => {
      if (e.objective.tutorial) T.request(e.objective.tutorial);
    });
    this.races.on('offer', () => T.fire('raceOffer'));
    this.races.on('go', () => T.fire('raceGo'));
    this.heists.on('state', (e) => {
      if (e.to === 'PLANNING') T.fire('heistPlanning');
      else if (e.to === 'INFILTRATION') T.fire('heistInfiltration');
    });
    this.heists.on('loot', () => T.fire('heistLoot'));
  }

  /** Tips from a save; a save from before tutorials existed skips the ones its player clearly knows. */
  private loadTutorials(d: SaveData): void {
    if (d.tutorials) this.tut.load(d.tutorials);
    else {
      this.tut.load({ enabled: true, seen: [], performed: [] });
      this.tut.markSeen(['basics', 'cars', 'driving', 'map', 'talking', 'jobs']);
      if (this.dex.caught.size > 1) this.tut.markSeen(['wild-streetmon', 'battle-turn', 'battle-realtime', 'catching', 'team']);
    }
    this.menus.setTipsLabel(this.tut.enabled);
  }

  /** Each frame: the card's context, Enter to close it, practice actions, and (4x a second) situations. */
  private updateTutorials(dt: number): void {
    const T = this.tut;
    const p = this.player;
    const inp = this.input;
    const battle = !!this.battles?.active || !!this.evolution?.active;
    const where: 'play' | 'battle' | 'menu' | 'none' =
      this.state === 'playing' ? (p.dead || this.trans ? 'none' : battle ? 'battle' : 'play') : this.state === 'menu' || this.state === 'shop' || this.state === 'paused' ? 'menu' : 'none';
    this.tutCard.setMode(where);
    if (T.current && (where === 'play' || where === 'battle') && inp.wasPressed('Enter', 'NumpadEnter')) T.dismiss();
    T.update(dt, { where });
    if (this.state !== 'playing') return;

    // Moments: a battle starting, getting in and out of cars, the map, a waypoint.
    const inBattle = !!this.battles.active;
    if (inBattle && !this.tutWasBattle) {
      T.action('battle');
      T.fire('battleStart', { mode: this.battles.mode, kind: this.battles.kind });
      if (this.battles.kind === 'police') T.fire('arrestBattle');
    }
    this.tutWasBattle = inBattle;
    const car = p.vehicle;
    if (car !== this.tutWasCar) {
      T.action(car ? 'enterCar' : 'exitCar');
      this.tutWasCar = car;
    }
    if (this.cityMap.isOpen && !T.performed.has('map')) {
      T.action('map');
      T.fire('mapOpened');
    }
    const wp = this.cityMap.waypoint;
    if (wp && wp !== this.tutWaypoint) T.action('waypoint');
    this.tutWaypoint = wp;

    // Practice actions (what the keys are doing this frame).
    if (!p.dead && !battle && !this.cityMap.isOpen) {
      if (car) {
        if (inp.isDown('KeyW', 'ArrowUp')) T.action('throttle');
        if (inp.isDown('KeyS', 'ArrowDown')) T.action('brake');
        if (inp.isDown('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight')) T.action('steer');
        if (inp.isDown('Space')) T.action('handbrake');
        if (inp.isDown('KeyH')) T.action('horn');
        if (inp.wasPressed('KeyR') && car.flippedTime > 0.8) T.action('flip');
        if (inp.wasPressed('KeyG') && car.spec.style === 'police') T.action('siren');
      } else {
        const moving = Math.hypot(p.velocity.x, p.velocity.z) > 0.5;
        if (inp.isDown('KeyW', 'KeyA', 'KeyS', 'KeyD') && moving) T.action('move');
        if (Math.abs(inp.mouseDX) + Math.abs(inp.mouseDY) > 3) T.action('look');
        if (moving && inp.isDown('ShiftLeft', 'ShiftRight')) T.action('sprint');
        if (moving && inp.isDown('AltLeft', 'AltRight')) T.action('walk');
        if (inp.wasPressed('Space')) T.action('jump');
        if (inp.mouseRight) T.action('aim');
        if (inp.mouseLeft && this.weapons.inventory.owned.length > 1) T.action('fire');
        if (inp.wasPressed('KeyR')) T.action('reload');
        if (inp.wasPressed('Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'KeyQ') || inp.wheel !== 0) T.action('weaponSwitch');
        if (inp.isDown('Tab')) T.action('weaponWheel');
        if (inp.wasPressed('KeyC')) T.action('throw');
        if (inp.wasPressed('KeyV')) T.action('switchItem');
        if (inp.wasPressed('KeyG')) T.action('summon');
      }
      if (inp.wasPressed('KeyI')) T.action('team');
      if (inp.wasPressed('KeyN')) T.action('dex');
      if (inp.wasPressed('KeyJ')) T.action('track');
    }

    // Situations, a few times a second.
    this.tutScan -= dt;
    if (this.tutScan > 0 || p.dead || this.trans) return;
    this.tutScan = 0.25;
    const pos = this.focus();
    if (inBattle) {
      // A wild foe at half health or less: time to catch it.
      const foe = this.battles.kind === 'wild' ? this.battles.battle?.sides[1].active[0]?.creature : null;
      if (foe && foe.hp > 0 && foe.hp <= maxHpOf(foe) * 0.5) T.fire('foeWeak', { mode: this.battles.mode });
      return;
    }
    if (this.evolution.active) return;
    const layer = this.layers.current;
    if (layer === 'sewer') T.fire('inSewer');
    else if (layer === 'roof') T.fire('onRoof');
    if (p.onFoot) {
      if (this.enterableCar()) T.fire('nearCar');
      if (this.party.canFight && this.spawns.nearest(p.position, 18)) T.fire('nearWild');
      if (this.party.canFight && this.party.lead && this.nearestPerson(4.5)) T.fire('nearPerson');
      if (this.clinics.clinicAt(p.position.x, p.position.z)) T.fire('nearClinic');
      if (this.shops.shopAt(p.position.x, p.position.z)) T.fire('nearShop');
      if (layer === 'street' && /fire escape|elevator/i.test(this.roofUse()?.label ?? '')) T.fire('nearRoofAccess');
      if (this.heistPrompt().startsWith('E  Plan')) T.fire('heistNear');
      const fig = layer === 'street' ? this.campaignWorld.within(14) : null;
      if (fig) T.fire(fig.kind === 'boss' ? 'nearBoss' : 'nearGiver');
    } else if (car) {
      T.fire('inCar');
      if (car.spec.style === 'police') T.fire('inPoliceCar');
      if (car.tuneId && this.tuning.isTuned(car.tuneId)) T.fire('inTunedCar');
      if (car.flippedTime > 1.5) T.fire('carFlipped');
      if (layer === 'street' && Math.hypot(this.chopSpot.x - pos.x, this.chopSpot.z - pos.z) < 35) T.fire('nearChopLift');
    }
    if (this.party.hurt && this.party.members.length) T.fire('partyHurt');
    if (this.weapons.inventory.owned.length > 1) T.fire('weaponOwned');
    if (this.wanted.stars > 0) T.fire('wanted', { stars: this.wanted.stars });
    if (phaseAt(this.hour) === 'night') T.fire('night');
    if (layer === 'street') {
      const scene = this.living.sceneNear(pos.x, pos.z, 30);
      if (scene) T.fire(scene === 'hunter' ? 'nearHunter' : 'nearDuel');
      if (this.streetEvents.markers().some((m) => Math.hypot(m.x - pos.x, m.z - pos.z) < 150)) T.fire('eventNear');
    }
    T.fire('playTime', { minutes: this.playTime / 60 });
  }

  private questCtx(): QuestContext {
    const f = this.focus();
    let tuned = 0;
    for (const vid of this.rides.keys()) tuned = Math.max(tuned, this.tuning.getSlots(vid).filter((x) => x.streetmonId).length);
    return { x: f.x, z: f.z, layer: this.layers.current, inVehicle: !!this.player.vehicle, streetCred: this.races.streetCred, stars: this.wanted.stars, night: phaseAt(this.hour) === 'night', tunedSlots: tuned, time: this.gameTime };
  }

  private leagueMissingText(): string {
    const nx = this.quests.nextDivision(this.questCtx());
    return nx ? `Next: ${nx.division.name} (${nx.missing.join(', ') || 'ready'}).` : '';
  }

  private updateCampaign(dt: number): void {
    const Q = this.quests;
    const ctx = this.questCtx();
    Q.update(dt, ctx);
    const markers = Q.markers((ref) => this.campaignWhere(ref), ctx);
    this.campaignWorld.update(dt, markers, this.battles.active);
    if (this.input.wasPressed('KeyJ') && Q.cycleTracked()) this.hud.toast(`Tracking: ${Q.quest(Q.tracked!)?.title}`, 1800);
    // Tracker.
    const h = Q.hud();
    const gangLine = this.gangs?.stepText() ?? '';
    // (On a phone the job panel shares the top-left corner with the foe's battle bar.)
    if (!h || this.battles.locksPlayer || (platform.touch && this.battles.active)) {
      if (gangLine && !this.battles.locksPlayer) {
        const [title, obj] = gangLine.split(': ');
        this.hud.setQuestPanel(`<div class="qp-act">Detective Alvarez</div><div class="qp-title">${title}</div><div class="qp-obj">${obj}</div><div class="qp-league">${repLine(this.races.streetCred, this.civic)}</div>`, false);
      } else this.hud.setQuestPanel(null);
      return;
    }
    const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const timer = h.timeLeft !== null ? `<div class="qp-row"><span>Time left</span><span class="${h.timeLeft < 20 ? 'qp-low' : ''}">${Math.floor(h.timeLeft / 60)}:${String(Math.floor(h.timeLeft % 60)).padStart(2, '0')}</span></div>` : '';
    const div = Q.divisionFor(ctx);
    this.hud.setQuestPanel(
      `<div class="qp-act">${esc(h.act)}</div><div class="qp-title">${esc(h.title)}</div>` +
        `<div class="qp-obj">${esc(h.objective)}${h.count ? ` (${h.count})` : ''}</div>` +
        `<div class="qp-row"><span>Step ${h.step} of ${h.steps}</span><span>${Q.activeQuests.size > 1 ? 'J: next job' : ''}</span></div>` +
        timer +
        (gangLine ? `<div class="qp-obj qp-side">${esc(gangLine)}</div>` : '') +
        `<div class="qp-league">USRL ${esc(div.name)} · ${esc(repLine(this.races.streetCred, this.civic))}</div>`,
      h.boss,
    );
  }

  /** Positions for quest markers: people, bosses, race organizers, heist planning spots, the Chop Shop. */
  private campaignWhere(ref: string): { x: number; z: number } | null {
    const [kind, id] = ref.split(':');
    if (kind === 'npc' || kind === 'boss') return this.campaignWorld.where(ref);
    if (kind === 'race') {
      const t = this.races.track(id);
      return t?.organizer ? { x: t.organizer.x, z: t.organizer.z } : null;
    }
    if (kind === 'heist') {
      const t = this.heists.targets.find((x) => x.id === id);
      return t ? { x: t.location.plan.x, z: t.location.plan.z } : null;
    }
    if (kind === 'chopshop') return { x: this.chopSpot.x, z: this.chopSpot.z };
    return null;
  }

  /** E next to a mission giver or a boss. Returns true if it used the key. */
  private campaignTalk(): boolean {
    const n = this.campaignWorld.nearby();
    if (!n || this.battles.active || this.dialogue.isOpen) return false;
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    if (n.kind === 'boss') {
      const b = this.quests.boss(n.id);
      const def = b ? cinematicFor(cinematicsConfig as unknown as CinematicConfig, { bossIntro: n.id }, this.cineSeen) : null;
      const key = def ? (def.once === false ? `${def.id}:${n.id}` : def.id) : '';
      if (b && def && !this.cineSeen.has(key)) {
        this.state = 'playing';
        this.cineBoss = n.id;
        this.playCinematic(def, { name: b.name.toUpperCase(), title: b.title }, key, () => {
          this.state = 'menu';
          if (this.input.pointerLocked) document.exitPointerLock();
          this.showBossIntro(n.id);
        });
        return true;
      }
      this.showBossIntro(n.id);
      return true;
    }
    // Accepted Mama's welcome but never picked (an old save, a reload mid-pick): straight to the pick.
    if (this.quests.status(STARTER_QUEST) === 'active' && !this.party.members.length && n.id === 'rust') {
      this.closeMenu();
      this.showStarterPicker();
      return true;
    }
    const d = this.quests.talk(n.id, this.questCtx());
    if (!d) {
      this.closeMenu();
      return false;
    }
    this.tut.action('talk');
    this.showCampaignLine(d);
    return true;
  }

  private showCampaignLine(d: Dialogue): void {
    const act = this.quests.act(this.quests.quest(d.quest)?.act ?? '');
    this.dialogue.show(
      d.speaker,
      d.text,
      d.choices.map(([label]) => label),
      (i) => {
        const r = this.quests.choose(d, i, this.questCtx());
        if (r.next) this.showCampaignLine(r.next);
        else {
          this.dialogue.close();
          this.afterCampaignLine();
        }
      },
      () => this.closeMenu(),
      act ? `Act ${act.number}: ${act.title}` : '',
    );
  }

  /**
   * Your first car: Mama's Rustbucket at the kerb in front of the Chop Shop, nose towards the lift.
   * Given when Grease Monkey starts, and put back while that job is on if it's gone (wrecked,
   * towed by the streaming, a reload).
   */
  private giveFirstCar(announce: boolean): void {
    const c = this.firstCar;
    if (c && !c.disposed && !c.destroyed) return;
    const s = this.chopSpot;
    const x = s.x + Math.cos(s.heading) * 10;
    const z = s.z - Math.sin(s.heading) * 10;
    // Anything parked there makes room.
    for (const o of [...this.vehicles.cars]) if (o !== this.player.vehicle && o.driver === null && !this.vehicles.owned.has(o) && Math.hypot(o.position.x - x, o.position.z - z) < 4) this.vehicles.remove(o);
    const car = this.vehicles.spawn(getSpec('beater'), x, z, s.heading + Math.PI, '#7d817a');
    this.vehicles.owned.add(car);
    this.firstCar = car;
    if (announce) window.setTimeout(() => this.hud.toast("Mama: \"Your first ride's at the kerb. The grey Rustbucket. It's a heap. Let's make it fly.\"", 6000), 400);
  }

  /**
   * Story guidance: unless you've placed your own waypoint, it points at what the tracked job
   * wants next (the objective, the boss, or whoever to go back to), or at whoever has the next job.
   */
  private autoGuide(): void {
    if (this.waypointManual || this.layers.current !== 'street') return;
    const ms = this.quests.markers((ref) => this.campaignWhere(ref));
    const tracked = this.quests.tracked;
    const pick =
      ms.find((m) => m.tracked && m.kind !== 'giver') ??
      ms.find((m) => m.tracked) ??
      (tracked ? null : ms.find((m) => m.kind === 'giver'));
    const p = this.focus();
    const cur = this.cityMap.waypoint;
    if (!pick) {
      if (cur && this.waypointAuto) {
        this.waypointAuto = false;
        this.cityMap.setWaypoint(null);
      }
      return;
    }
    // Already there (it was just reached), or already pointing at it.
    if (Math.hypot(pick.x - p.x, pick.z - p.z) < 12) return;
    if (cur && Math.hypot(cur.x - pick.x, cur.z - pick.z) < 3) return;
    let name = pick.label ?? '';
    if (pick.kind === 'giver') name = name.split(':')[0];
    if (name.length > 38) name = `${name.slice(0, 36)}…`;
    this.setNamedWaypoint(pick.x, pick.z, name);
    this.waypointAuto = true;
  }

  /** While Grease Monkey is on: the Rustbucket is there when you come back for it. */
  private keepFirstCar(): void {
    if (this.quests.status(FIRST_CAR_QUEST) !== 'active') return;
    const c = this.firstCar;
    if (c && !c.disposed && !c.destroyed) return;
    const p = this.focus();
    if (Math.hypot(p.x - this.chopSpot.x, p.z - this.chopSpot.z) < 220 && !this.player.vehicle) this.giveFirstCar(false);
  }

  /** After a campaign conversation closes: whatever its quest asked for on accepting. */
  private afterCampaignLine(): void {
    if (this.pendingStarter) {
      this.pendingStarter = false;
      if (!this.party.members.length) this.showStarterPicker();
    }
  }

  private showBossIntro(bossId: string): void {
    const b = this.quests.boss(bossId);
    if (!b) return;
    const fit = this.party.canFight;
    // Scouting: what they're bringing, so you can pick your team (and come back better prepared).
    const scout = b.team.map(([sp, lv]) => `${species(sp).name} Lv ${lv} (${species(sp).types.map((t) => typeInfo(t).name).join('/')})`).join(', ');
    const able = this.party.members.filter((m) => m.hp > 0).length;
    const note = `Their team: ${scout}. You have ${able} able to fight${able < b.team.length ? ': catch another, or bring one back from the stash or out of a car first' : ''}.`;
    this.dialogue.show(
      b.name,
      fit ? `${b.intro}\n\n${note}` : `${b.intro}\n\n(You have no Streetmon able to fight. Heal up at a clinic first.)`,
      fit ? ['Fight!', 'Not yet.'] : ['Leave.'],
      (i) => {
        this.dialogue.close();
        if (i === 0 && fit) this.startBossBattle(bossId);
      },
      () => this.closeMenu(),
      b.title,
    );
  }

  private startBossBattle(bossId: string): void {
    const b = this.quests.boss(bossId);
    if (!b || this.battles.active) return;
    const team = b.team.map(([sp, lv]) => createCreature(sp, lv));
    this.campaignBattle = bossId;
    this.startTeamBattle({ kind: 'npc', name: b.name, intro: `${b.name}: "${b.intro}"`, team, foePos: new THREE.Vector3(b.at.x, 0, b.at.z), canRun: false });
  }

  // ------------------------------------------------------------------ street events

  /**
   * Street events: the manager (schedule, lifecycle, police hooks, rewards) and the world side
   * (trucks, swarms, drops, cleanup). The integration in short:
   *
   *   const world = new EventWorld({ scene, effects, vehicles, graph, peds, spawns, follower, police, ... });
   *   const events = new StreetEventManager({ config, adapter: {
   *     spawn: (i) => world.spawn(i), tick: (i, dt) => world.tick(i, dt), cleanup: (i) => world.cleanup(i),
   *     raiseWanted: (stars) => raiseWantedTo(stars), earn, addItem, addStreetCred, notify } });
   *   // every frame in free roam:
   *   const hud = events.update(dt, { x, z, layer, streetCred, busy });
   */
  private setupStreetEvents(): void {
    this.eventWorld = new EventWorld({
      scene: this.scene,
      effects: this.effects,
      vehicles: this.vehicles,
      graph: this.graph,
      peds: this.peds,
      spawns: this.spawns,
      follower: this.follower,
      police: this.police,
      groundY: (x, z) => this.peds.groundY(x, z),
      blocked: (x, z) => this.peds.blocked(x, z),
      player: () => {
        const p = this.player;
        return { pos: p.vehicle ? p.vehicle.position : p.feet, vehicle: p.vehicle, layer: this.layers.current, dead: p.dead };
      },
      partyLevel: () => this.party.lead?.level ?? 5,
      pickSpecies: (district, types) => {
        const table = spawnTable(district, phaseAt(this.hour), 'street').filter((o) => !types.length || o.spec.types.some((t) => types.includes(t)));
        return pickSpecies(table.length ? table : spawnTable(district, phaseAt(this.hour), 'street'), Math.random());
      },
      damagePlayer: (amount, cause) => {
        if (this.player.vehicle) this.player.vehicle.damage(amount * 2.5);
        else if (this.player.takeDamage(amount)) this.kill(cause);
      },
      earn: (n) => {
        this.money += n;
        this.hud.toast(`+$${n.toLocaleString('en-US')}`, 900);
      },
      listener: () => this.camera.position,
    });
    const world = this.eventWorld;
    this.streetEvents = new StreetEventManager({
      config: streetEventsConfig as unknown as StreetEventConfig,
      adapter: {
        spawn: (inst) => world.spawn(inst),
        tick: (inst, dt) => world.tick(inst, dt),
        cleanup: (inst) => world.cleanup(inst),
        raiseWanted: (stars) => this.raiseWantedTo(stars),
        earn: (n) => void (this.money += n),
        addItem: (id, n) => this.bag.add(id, n),
        addStreetCred: (n) => {
          this.races.streetCred += n;
          this.progress.streetCred = this.races.streetCred;
        },
        chipsChanged: (n) => this.hud.toast(`Upgrade chip installed: ${n} of ${this.streetEvents.config.upgradeChips?.max ?? 5}. Every car you drive is faster and tougher.`, 4500),
        notify: (text, ms) => this.hud.toast(text, ms),
      },
    });
    this.streetEvents.on('state', (e) => {
      if (e.to === 'ACTIVE' && e.inst.type === 'airdrop') this.hud.toast('The crate is down. Get to the smoke!', 2500);
    });
    this.streetEvents.on('engaged', (inst) => {
      if (inst.def.policeStarsOnTrigger > 0) this.hud.toast(`${inst.def.name}: the police are on their way.`, 2500);
    });
    this.streetEvents.on('resolved', (r) => {
      this.saveDirty = true;
      const name = r.inst.def.name;
      const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
      if (r.ok && r.reward) {
        const rw = r.reward;
        const parts: string[] = [];
        if (r.inst.earned) parts.push(`$${r.inst.earned.toLocaleString('en-US')} grabbed`);
        if (rw.cash) parts.push(`+$${rw.cash.toLocaleString('en-US')}`);
        for (const it of rw.items) parts.push(`${it.count} x ${itemSpec(it.id)?.name ?? it.id}`);
        if (rw.chips) parts.push(`${rw.chips} upgrade chip${rw.chips > 1 ? 's' : ''}`);
        if (rw.streetCred) parts.push(`+${rw.streetCred} Street Cred`);
        if (rw.regionalCred) parts.push(`+${rw.regionalCred} ${rw.district} cred`);
        this.hud.showBig('EVENT CLEARED', '#4be37a', 2600);
        this.hud.toast(`${name}: ${parts.join(', ')}.`, 6000);
        this.eventResult = { html: `<div class="ep-name"><span>${esc(name)}</span></div><div class="ep-obj">Cleared</div>${parts.map((x) => `<div class="ep-row"><span>${esc(x)}</span></div>`).join('')}`, cls: 'ok', until: this.gameTime + 7 };
      } else {
        this.hud.toast(`${name}: ${r.reason ?? 'over'}.`, 4000);
        this.eventResult = { html: `<div class="ep-name"><span>${esc(name)}</span></div><div class="ep-obj">${esc(r.reason ?? 'Over')}</div>`, cls: 'off', until: this.gameTime + 5 };
      }
    });
  }

  private updateStreetEvents(dt: number): void {
    const p = this.player;
    const pos = this.focus();
    // (Street events wait until Mama's welcome is done: the first minutes are for learning to
    // walk, talk and catch, not a timed outbreak panel 600 m away.)
    const busy =
      this.state !== 'playing' ||
      p.dead ||
      this.quests.status(STARTER_QUEST) !== 'done' ||
      this.battles.active ||
      this.evolution.active ||
      this.heists.active ||
      this.heists.state === 'PLANNING' ||
      this.races.active ||
      this.races.state === 'PROMPT' ||
      this.wanted.stars >= 3;
    const hud = this.streetEvents.update(dt, {
      x: pos.x,
      z: pos.z,
      layer: this.layers.current,
      district: districtAt(this.layout, pos.x, pos.z),
      streetCred: this.races.streetCred,
      busy,
    });
    this.applyCarBonuses();
    this.renderEventHud(hud);
  }

  /**
   * Upgrade chips (street events) and campaign blueprints: every car the player drives gets them,
   * as multipliers on its mods (applied once per car; re-applied after a re-tune).
   */
  private applyCarBonuses(): void {
    const car = this.player.vehicle;
    if (!car) return;
    const n = this.streetEvents.chips;
    const per = this.streetEvents.config.upgradeChips?.perChip ?? { topSpeed: 0.03, acceleration: 0.05, durability: 0.1 };
    const want = { speed: 1 + per.topSpeed * n, accel: 1 + per.acceleration * n, grip: 1, steer: 1, armor: 1 + per.durability * n };
    for (const id of this.quests?.blueprints ?? []) {
      const m = this.quests.blueprint(id)?.modifiers ?? {};
      want.speed *= m.topSpeed ?? 1;
      want.accel *= m.acceleration ?? 1;
      want.grip *= m.grip ?? 1;
      want.steer *= m.steering ?? 1;
      want.armor *= m.durability ?? 1;
    }
    const had = car.layer('bonus');
    if (had && (Object.keys(want) as Array<keyof typeof want>).every((k) => Math.abs(want[k] - (had[k] ?? 1)) < 1e-9)) return;
    car.setLayer('bonus', want);
  }

  private renderEventHud(list: EventHud[]): void {
    const lower = this.races.active || this.races.state === 'PROMPT' || this.heists.active;
    const h = list.find((e) => e.state === 'ACTIVE' || e.state === 'SPAWNING');
    if (!h) {
      if (this.eventResult && this.eventResult.until > this.gameTime) this.hud.setEventPanel(this.eventResult.html, lower);
      else {
        this.eventResult = null;
        this.hud.setEventPanel(null);
      }
      return;
    }
    const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const pos = this.focus();
    const dist = Math.round(Math.hypot(h.x - pos.x, h.z - pos.z));
    const where = h.layer === 'roof' ? 'rooftop' : h.layer === 'alley' ? 'alley' : h.district;
    const stars = h.stars ? `<span class="ep-stars">${'★'.repeat(h.stars)}</span>` : '';
    this.hud.setEventPanel(
      `<div class="ep-name"><span>${esc(h.name)}</span>${stars}</div>` +
        `<div class="ep-obj">${esc(h.objective || '...')}</div>` +
        `<div class="ep-row"><span>Distance</span><span>${dist} m · ${esc(where)}</span></div>` +
        `<div class="ep-row"><span>Time left</span><span class="${h.timeLeft < 30 ? 'ep-low' : ''}">${Math.floor(h.timeLeft / 60)}:${String(Math.floor(h.timeLeft % 60)).padStart(2, '0')}</span></div>` +
        `<div class="ep-bar"><i style="width:${Math.round(Math.min(1, h.progress) * 100)}%"></i></div>`,
      lower,
    );
  }

  /** Minimap dots for live events. */
  /** Minimap: M for a job on offer, ! for the objective (red for a boss). */
  private campaignMinimap(): Array<{ x: number; z: number; color: string; size: number; letter?: string }> {
    if (this.layers.current === 'sewer') return [];
    return this.quests.markers((ref) => this.campaignWhere(ref)).map((m) => ({ x: m.x, z: m.z, color: m.color, size: m.tracked || m.kind === 'giver' ? 15 : 12, letter: m.kind === 'giver' ? 'M' : '!' }));
  }

  private eventMarkers(): Array<{ x: number; z: number; color: string; size: number }> {
    if (!this.streetEvents || this.layers.current === 'sewer') return [];
    const col = { armoredTruck: '#ff4b3a', turfOutbreak: '#ff4b3a', airdrop: '#ff9a1a' } as const;
    return this.streetEvents.markers().map((m) => ({ x: m.x, z: m.z, color: col[m.type], size: 12 }));
  }

  /** Opens the planning board for a job. */
  private openHeistPlan(id: string): void {
    if (this.races.active || this.races.state === 'PROMPT') {
      this.hud.toast('Not in the middle of a race.', 2000);
      return;
    }
    const r = this.heists.plan(id);
    if (!r.ok) {
      this.hud.toast(r.reason, 3000);
      return;
    }
    const job = this.heists.job!;
    const t = job.target;
    this.state = 'menu';
    if (this.input.pointerLocked) document.exitPointerLock();
    this.heistMenu.open({
      target: t,
      config: this.heists.config,
      security: job.security,
      escapeStars: Math.min(5, t.escape.stars + Math.floor(this.heists.heat / this.heists.config.heatRules.starsPerHeat)),
      heat: this.heists.heat,
      crew: () => this.heists.job?.crew ?? {},
      candidates: () => this.party.members.map((c) => ({ ...this.crewInfo(c.uid)!, shiny: c.shiny })),
      fit: (role, mid) => {
        const info = this.crewInfo(mid);
        return info ? roleFit(this.heists.config, role, info) : { ok: false, reason: 'Not in your party', skill: 0 };
      },
      assign: (role, mid) => {
        const info = this.crewInfo(mid);
        return info ? this.heists.assign(role, info) : { ok: false, reason: 'Not in your party' };
      },
      unassign: (role) => void this.heists.unassign(role),
      validate: () => this.heists.validateCrew(),
      launch: () => this.heists.launch(),
      onClose: (launched) => {
        if (!launched) this.heists.cancel();
        else this.hud.toast(`${t.name}: the crew's with you. ${t.roles.required.includes('hacker') ? 'Jam the alarm (Z) before you hit the vault. ' : ''}${t.roles.required.includes('smoke') ? 'Smoke the guards (X) before you start. ' : ''}`, 5000);
        this.closeMenu();
      },
    });
  }

  /** Heist keys. Returns true when a key was used. */
  private heistKeys(p: Player): boolean {
    const inp = this.input;
    const H = this.heists;
    const pos = this.focus();
    const ctx = { x: pos.x, z: pos.z, inVehicle: !!p.vehicle, stars: this.wanted.stars };
    if (H.active) {
      const R = H.config.roles;
      const tunedSpikes = !!p.vehicle?.tuneId && this.tuning.hasAbility(p.vehicle.tuneId, 'spikeStripDispenser');
      void R;
      if (inp.wasPressed('KeyZ')) {
        const r = H.useAbility('hacker', ctx);
        if (!r.ok) this.hud.toast(r.reason, 1800);
        return true;
      }
      if (inp.wasPressed('KeyX') && !tunedSpikes) {
        const r = H.useAbility('smoke', ctx);
        if (!r.ok) this.hud.toast(r.reason, 1800);
        return true;
      }
      if (p.onFoot && inp.wasPressed('KeyE')) {
        const bag = this.heistWorld.nearLoot(pos.x, pos.z);
        if (bag >= 0) {
          const r = H.takeLoot(bag);
          if (!r.ok) this.hud.toast(r.reason, 1800);
          return true;
        }
        const bp = this.heistWorld.nearBreach(pos.x, pos.z);
        if (bp >= 0 && H.job && !H.job.breach[bp].done) {
          const r = H.startBreach(bp, { ...ctx, nearBreach: bp, guardsAwake: this.heistWorld.guardsAwake() });
          if (!r.ok) this.hud.toast(r.reason, 2200);
          return true;
        }
      }
      if (inp.wasPressed('Backspace')) {
        H.abandon();
        this.hud.toast('You walked away from the job.', 2000);
        return true;
      }
      return false;
    }
    if (p.onFoot && inp.wasPressed('KeyE') && H.state === 'IDLE') {
      const t = this.heistWorld.planSpotAt(pos.x, pos.z);
      if (t) {
        this.openHeistPlan(t.id);
        return true;
      }
    }
    return false;
  }

  /** Per frame: what the world sees, the rules, the 3D side, the panel and the load you carry. */
  private updateHeists(dt: number): void {
    const p = this.player;
    const H = this.heists;
    const car = p.vehicle;
    const pos = this.focus();
    const W = this.heistWorld;
    let hud: HeistHud;
    if (H.active) {
      hud = H.update(dt, {
        x: pos.x,
        z: pos.z,
        inVehicle: !!car,
        stars: this.wanted.stars,
        seenBy: this.layers.current === 'street' ? W.seenBy(pos.x, pos.y, pos.z, !!car) : 0,
        nearBreach: car ? -1 : W.nearBreach(pos.x, pos.z),
        nearLoot: car ? -1 : W.nearLoot(pos.x, pos.z),
        atDropOff: W.atDropOff(pos.x, pos.z, car ? Math.abs(car.speed) : Math.hypot(p.velocity.x, p.velocity.z)),
        guardsAwake: W.guardsAwake(),
        dead: p.dead,
      });
      if (H.job && H.job.breaching < 0) W.breachStopped();
      // The alarm bell rings for a while.
      if (H.job?.alarm && H.state !== 'ESCAPE') {
        this.alarmBellT -= dt;
        if (this.alarmBellT <= 0) {
          this.alarmBellT = 0.75;
          const c = H.centre(H.job.target);
          audio.sfx('sfx_alarm_bell', { x: c.x, y: 2, z: c.z });
        }
      }
    } else hud = H.update(dt, { x: pos.x, z: pos.z, inVehicle: !!car, stars: this.wanted.stars, dead: p.dead });
    // What you carry slows you on foot (not in a car).
    const carried = H.job ? H.carried() : { bags: 0, playerKg: 0, haulerKg: 0, value: 0 };
    const enc = H.encumbrance();
    p.speedMult = car ? 1 : enc.speedMult;
    p.canSprint = car ? true : enc.canSprint;
    W.update(dt, {
      state: H.state,
      player: car ? car.position : p.position,
      facing: car ? car.heading : p.facing,
      hide: !!car || this.battles.active || p.dead || this.layers.current !== 'street',
      playerBags: H.job ? H.job.bags.filter((b) => b.carrier === 'player').length : 0,
      haulerBags: H.job ? H.job.bags.filter((b) => b.carrier === 'hauler').length : 0,
      playerModel: p.model.root,
      cooldowns: H.cooldowns,
    });
    void carried;
    this.renderHeistHud(hud);
  }

  private renderHeistHud(h: HeistHud): void {
    const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
    if (h.state === 'RESOLVED' && h.result) {
      const r = h.result;
      this.hud.setHeistPanel(
        `<div class="hp-name">${esc(r.target.name)}</div><div class="hp-obj">${r.ok ? `Score: ${money(r.cash)}` : { busted: 'Busted: the loot is gone', wasted: 'Wasted: the loot is gone', time: 'Too slow: the job is off', abandoned: 'You walked away' }[r.reason] ?? 'Job off'}</div>` +
          (r.ok && r.spoiled ? `<div class="hp-row"><span>Dye packs</span><span>-${money(r.spoiled)}</span></div>` : '') +
          `<div class="hp-row"><span>Heat</span><span>${r.heat}</span></div>`,
      );
      return;
    }
    if (!h.target || h.state === 'IDLE' || h.state === 'PLANNING') {
      this.hud.setHeistPanel(null);
      return;
    }
    const bar = (v: number, col: string): string => `<div class="hp-bar"><i style="width:${Math.round(Math.min(1, v) * 100)}%;background:${col}"></i></div>`;
    const rows: string[] = [];
    if (h.state !== 'ESCAPE') {
      if (h.alarm) rows.push('<div class="hp-row hp-alarm"><span>ALARM</span><span>police on the way</span></div>');
      else {
        rows.push(`<div class="hp-row"><span>Suspicion</span><span>${Math.round((h.suspicion ?? 0) * 100)}%</span></div>${bar(h.suspicion ?? 0, '#ff9a3a')}`);
        rows.push(`<div class="hp-row"><span>Noise</span><span>${Math.round((h.noise ?? 0) * 100)}%</span></div>${bar(h.noise ?? 0, '#ff5b5b')}`);
      }
      if ((h.breaching ?? -1) >= 0) rows.push(`<div class="hp-row"><span>Breach</span><span>${Math.round((h.breach?.[h.breaching!] ?? 0) * 100)}%</span></div>${bar(h.breach?.[h.breaching!] ?? 0, '#4be37a')}`);
      if (h.timeLeft !== null && h.timeLeft !== undefined) rows.push(`<div class="hp-row"><span>Truck leaves</span><span class="${h.timeLeft < 30 ? 'hp-alarm' : ''}">${Math.ceil(h.timeLeft)} s</span></div>`);
    } else {
      rows.push(`<div class="hp-row"><span>Getaway</span><span>${'★'.repeat(h.escapeStars ?? 0)}</span></div>`);
      const pos = this.focus();
      for (const d of h.dropOffs ?? []) rows.push(`<div class="hp-row"><span>${esc(d.name)}</span><span>${Math.round(Math.hypot(d.x - pos.x, d.z - pos.z))} m</span></div>`);
    }
    const c = h.carried!;
    const total = h.bags?.length ?? 0;
    rows.push(`<div class="hp-row"><span>Loot</span><span>${c.bags}/${total} bags · ${money(c.value)}</span></div>`);
    if (c.playerKg > 0) rows.push(`<div class="hp-row"><span>On your back</span><span>${c.playerKg} kg · ${Math.round(h.encumbrance!.speedMult * 100)}% speed${h.encumbrance!.canSprint ? '' : ', no sprint'}</span></div>`);
    if (c.haulerKg > 0) rows.push(`<div class="hp-row"><span>Hauler</span><span>${c.haulerKg} kg</span></div>`);
    const crew = (h.crew ?? [])
      .map((m) => {
        const st = !m.ok ? '<span class="off">out</span>' : m.active > 0 ? `${Math.ceil(m.active)} s` : m.cooldown > 0 ? `${Math.ceil(m.cooldown)} s` : m.key && m.key.length <= 2 ? `<kbd>${esc(m.key)}</kbd>` : 'ready';
        return `<div><span>${esc(m.roleName)}: ${esc(m.name)}</span><span>${st}</span></div>`;
      })
      .join('');
    this.hud.setHeistPanel(`<div class="hp-name">${esc(h.target.name)}</div><div class="hp-obj">${esc(h.objective ?? '')}</div>${rows.join('')}<div class="hp-crew">${crew}</div>`);
  }

  private heistPrompt(): string {
    const p = this.player;
    if (!this.heists || !p.onFoot) {
      if (this.heists?.state === 'ESCAPE' && this.wanted.stars > 0 && p.vehicle) {
        const pos = this.focus();
        if (this.heistWorld.activeDropOffs.some((id) => {
          const d = this.heists.dropOff(id)!;
          return Math.hypot(d.x - pos.x, d.z - pos.z) < 30;
        }))
          return 'Lose the cops before you pull into the lock-up';
      }
      return '';
    }
    const pos = p.position;
    const H = this.heists;
    if (H.active) {
      const bag = this.heistWorld.nearLoot(pos.x, pos.z);
      if (bag >= 0 && H.job) {
        const b = H.job.bags[bag];
        return `E  Grab the bag ($${b.value.toLocaleString('en-US')}, ${b.kg} kg)`;
      }
      const bp = this.heistWorld.nearBreach(pos.x, pos.z);
      if (bp >= 0 && H.job && !H.job.breach[bp].done) {
        if (H.job.breaching === bp) return 'Breaching… stay here';
        const mode = H.job.target.breach.mode;
        return mode === 'smash' ? 'E  Smash the case' : mode === 'truck' ? 'E  Cut the doors open' : 'E  Breach the vault';
      }
      return '';
    }
    const t = H.state === 'IDLE' ? this.heistWorld.planSpotAt(pos.x, pos.z) : null;
    if (t) {
      const a = H.availability(t.id);
      return a.ok ? `E  Plan the job: ${t.name}` : a.reason;
    }
    return '';
  }

  /** Minimap: job planning spots (purple), lock-ups on the getaway (green), the vault and the bags. */
  private heistMarkers(): Array<{ x: number; z: number; color: string; size: number }> {
    if (this.layers.current !== 'street' || !this.heists) return [];
    const H = this.heists;
    const out: Array<{ x: number; z: number; color: string; size: number }> = [];
    if (!H.active) {
      for (const t of H.targets) if (!H.cooldowns[t.id]) out.push({ x: t.location.plan.x, z: t.location.plan.z, color: '#b07cff', size: 10 });
      return out;
    }
    const j = H.job!;
    if (H.state === 'ESCAPE') {
      for (const id of this.heistWorld.activeDropOffs) {
        const d = H.dropOff(id)!;
        out.push({ x: d.x, z: d.z, color: '#4be37a', size: 12 });
      }
    } else {
      j.target.location.breachPoints.forEach((b, i) => !j.breach[i].done && out.push({ x: b.x, z: b.z, color: '#ffd23f', size: 8 }));
      j.bags.forEach((b) => b.available && !b.taken && out.push({ x: j.target.location.loot[b.index].x, z: j.target.location.loot[b.index].z, color: '#7dff8a', size: 6 }));
    }
    return out;
  }

  // ------------------------------------------------------------------ the city map

  private setupCityMap(): void {
    this.cityMap = new MapOverlay(this.container, this.layout, mapIconsConfig as MapConfig, {
      route: (from, to) => this.mapRoute(from, to),
      placeName: (x, z) => this.hud.locationName(x, z),
      onWaypoint: (wp) => {
        this.saveDirty = true;
        // You placed this one yourself (the story's own guidance steps aside until it's cleared).
        this.waypointManual = !!wp && !this.waypointNamed;
        // A named waypoint (set by the game: "Mama Rust") keeps its name; one you click is the street.
        if (wp && !this.waypointNamed) this.waypointName = this.hud.locationName(wp.x, wp.z);
        this.waypointNamed = false;
        if (wp) this.hud.toast(`Waypoint set: ${this.waypointName}`, 1800);
      },
      onLayers: () => void (this.saveDirty = true),
      onClose: () => {
        this.input.endFrame();
        if (this.state === 'playing') this.input.requestPointerLock();
      },
    });
  }

  /** A route along the roads: to the nearest junction, junction to junction, then to the point. */
  private mapRoute(from: { x: number; z: number }, to: { x: number; z: number }): Array<{ x: number; z: number }> {
    if (this.layers.current !== 'street') return [{ x: from.x, z: from.z }, to];
    const G = this.graph;
    // Each end joins the road network along the road it's on (never diagonally across a block):
    // the nearest stretch of road between two junctions, and how far along it each end is.
    const sa = this.roadStretch(from.x, from.z);
    const sb = this.roadStretch(to.x, to.z);
    // Both on the same stretch: straight along it.
    if (sa.a === sb.a && sa.b === sb.b && sa.d < 25 && sb.d < 25) return [{ x: from.x, z: from.z }, to];
    const tripLen = (ids: number[], ca: number, cb: number): number => {
      let len = ca + cb;
      for (let i = 1; i < ids.length; i++) len += Math.hypot(G.node(ids[i]).x - G.node(ids[i - 1]).x, G.node(ids[i]).z - G.node(ids[i - 1]).z);
      return len;
    };
    const ends = (s: { a: number; b: number; t: number; L: number; d: number }) => [
      { id: s.a, cost: s.t * s.L + s.d },
      { id: s.b, cost: (1 - s.t) * s.L + s.d },
    ];
    let best: number[] | null = null;
    let bestLen = Infinity;
    const lenOf = new Map<string, number>();
    for (const a of ends(sa))
      for (const b of ends(sb)) {
        const ids = a.id === b.id ? [a.id] : G.route(a.id, b.id);
        if (!ids.length) continue;
        const len = tripLen(ids, a.cost, b.cost);
        lenOf.set(`${a.id}>${b.id}`, len);
        if (len < bestLen) {
          bestLen = len;
          best = ids;
        }
      }
    if (!best) return [{ x: from.x, z: from.z }, to];
    // Hysteresis: two ways round that are about as long mustn't swap back and forth as you move
    // (the arrows would flip). Keep the last choice unless the new one is clearly shorter.
    const prev = this.routeEnds;
    if (prev && prev.to.x === to.x && prev.to.z === to.z && (prev.a !== best[0] || prev.b !== best[best.length - 1])) {
      const len = lenOf.get(`${prev.a}>${prev.b}`);
      if (len !== undefined && len < bestLen + Math.max(15, bestLen * 0.06)) best = prev.a === prev.b ? [prev.a] : G.route(prev.a, prev.b);
    }
    this.routeEnds = { a: best[0], b: best[best.length - 1], to: { x: to.x, z: to.z } };
    return trimRoute({ x: from.x, z: from.z }, best.map((id) => ({ x: G.node(id).x, z: G.node(id).z })), to);
  }

  /** The stretch of road (between two linked junctions) nearest a point, and where along it the point is. */
  private roadStretch(x: number, z: number): { a: number; b: number; t: number; L: number; d: number } {
    const G = this.graph;
    let best = { a: 0, b: 0, t: 0, L: 1, d: Infinity };
    for (const n of G.nodes)
      for (const m of n.next) {
        if (m < 0 || m < n.id) continue;
        const o = G.node(m);
        const dx = o.x - n.x;
        const dz = o.z - n.z;
        const L = Math.hypot(dx, dz) || 1;
        const t = Math.max(0, Math.min(1, ((x - n.x) * dx + (z - n.z) * dz) / (L * L)));
        const d = Math.hypot(n.x + dx * t - x, n.z + dz * t - z);
        if (d < best.d) best = { a: n.id, b: m, t, L, d };
      }
    return best;
  }

  private updateCityMap(dt: number): void {
    const p = this.player;
    const car = p.vehicle;
    const pos = this.focus();
    const inp = this.input;
    const open = this.cityMap.isOpen;
    const pan = open
      ? { x: inp.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']), z: inp.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']), zoom: inp.axis(['KeyQ'], ['KeyE']) }
      : { x: 0, z: 0, zoom: 0 };
    const arrived = this.cityMap.update(dt, { x: pos.x, z: pos.z, heading: car ? car.heading : p.facing }, open ? this.mapMarkers() : [], pan);
    if (arrived) this.hud.toast('You have arrived.', 1800);
    const wp = this.cityMap.waypoint;
    this.hud.setWaypoint(wp ? { path: this.cityMap.path, at: wp } : null);
    // In the world: chevrons on the road, a beam over the spot, a compass at the top.
    this.guide.update(dt, {
      path: this.cityMap.path,
      target: wp,
      name: this.waypointName,
      at: pos,
      camera: this.camera,
      driving: !!car,
      groundAt: (x, z) => this.peds.groundY(x, z),
      show: this.state === 'playing' && !open && this.layers.current === 'street' && !this.battles.active && !this.evolution.active && !p.dead,
    });
  }

  /** Sets a waypoint from the game (a quest target, Mama Rust) with a name for the compass. */
  private setNamedWaypoint(x: number, z: number, name: string): void {
    this.waypointNamed = true;
    this.waypointName = name;
    this.cityMap.setWaypoint({ x, z });
    this.waypointNamed = false;
  }

  /** Everything the city map can show, from the live game. */
  private mapMarkers(): MapMarker[] {
    const out: MapMarker[] = [];
    if (this.layers.current === 'street') {
      for (const b of this.police.blips()) out.push({ icon: 'cop', x: b.x, z: b.z });
      for (const rb of this.police.roadblocks()) out.push({ icon: 'roadblock', x: rb.x, z: rb.z });
      for (const t of this.tanks.tanks) out.push({ icon: 'tank', x: t.x, z: t.z });
    }
    if (this.wanted.stars > 0) {
      const s = this.wanted.searching ? 40 + this.wanted.searchProgress * 120 : 60;
      out.push({ icon: 'wanted', x: this.wanted.lastKnown.x, z: this.wanted.lastKnown.z, r: s });
    }
    for (const w of this.spawns.wild) {
      // (One in a trainer's pod is invisible: no dot for it.)
      if (w.removed || w.inPod || layerOfBiome(w.biome) !== (this.layers.current ?? 'street')) continue;
      out.push(w.creature.shiny ? { icon: 'streetmonShiny', x: w.x, z: w.z } : { icon: 'streetmon', x: w.x, z: w.z, color: typeInfo(w.spec.types[0]).color });
    }
    const kindIcon: Record<string, string> = { bankVault: 'heistBankVault', armoredTruck: 'heistArmoredTruck', jewelryStore: 'heistJewelryStore', checkCashing: 'heistCheckCashing' };
    for (const t of this.heists.targets) if (!this.heists.cooldowns[t.id]) out.push({ icon: kindIcon[t.kind] ?? 'heistBankVault', x: t.location.plan.x, z: t.location.plan.z, label: t.name });
    for (const d of this.heists.config.dropOffs) out.push({ icon: 'lockup', x: d.x, z: d.z, label: d.name });
    for (const m of this.mazes) for (const h of m.manholes) out.push({ icon: 'manhole', x: h.x, z: h.z });
    for (const a of this.roofPlan.access) out.push({ icon: a.kind === 'fireEscape' ? 'fireEscape' : 'elevator', x: a.street.x, z: a.street.z });
    for (const g of this.roofPlan.garages) out.push({ icon: 'garage', x: g.footX, z: (g.lane.z0 + g.lane.z1) / 2 });
    out.push({ icon: 'chopShop', x: this.chopSpot.x, z: this.chopSpot.z, label: 'Chop Shop' });
    out.push({ icon: 'dealership', x: this.dealerSpot.x, z: this.dealerSpot.doorZ, label: 'Empire Motors' });
    for (const h of this.safeSpots) {
      const own = this.safehouses.owned.includes(h.id);
      out.push({ icon: own ? 'safehouse' : 'safehouseForSale', x: h.x, z: h.z, label: own ? h.name : `${h.name} ($${h.price.toLocaleString('en-US')})` });
    }
    for (const t of this.races.config.tracks)
      if (t.organizer) out.push({ icon: (t.minStreetCred ?? 0) <= this.races.streetCred ? 'raceOrganizer' : 'raceLocked', x: t.organizer.x, z: t.organizer.z, label: t.name });
    for (const c of this.clinics.clinics) out.push({ icon: 'clinic', x: c.x, z: c.z });
    for (const s of this.shops.shops) out.push({ icon: 'shop', x: s.x, z: s.z });
    const evIcon = { armoredTruck: 'eventTruck', turfOutbreak: 'eventOutbreak', airdrop: 'eventDrop' } as const;
    for (const m of this.streetEvents.markers()) out.push({ icon: evIcon[m.type], x: m.x, z: m.z, label: m.label });
    const mIcon = { giver: 'missionGiver', objective: 'missionObjective', boundary: 'missionObjective', boss: 'missionBoss' } as const;
    for (const m of this.quests.markers((ref) => this.campaignWhere(ref))) out.push({ icon: mIcon[m.kind], x: m.x, z: m.z, label: m.label });
    const raid = this.raidWorld.mapIcon();
    if (raid) out.push({ icon: 'missionBoss', x: raid.x, z: raid.z, label: `${raid.label} (legendary)` });
    return out;
  }

  // ------------------------------------------------------------------ street races

  /**
   * Wild Streetmon steering: besides buildings (the spatial wall grid in SpawnSystem), they steer
   * round parked and stopped cars, roadblocks and race props. F8 toggles the debug rays.
   */
  private setupCreatureSteering(): void {
    const circles: Array<{ x: number; z: number; r: number }> = [];
    this.spawns.obstacles = () => {
      circles.length = 0;
      const f = this.focus();
      for (const c of this.vehicles.cars) {
        if (c.disposed || c.destroyed || Math.abs(c.speed) > 2) continue;
        const cx = c.position.x;
        const cz = c.position.z;
        if (Math.abs(cx - f.x) > 80 || Math.abs(cz - f.z) > 80 || c.position.y > 3) continue;
        // A car is two circles along its length.
        const h = c.heading;
        const off = c.spec.length * 0.25;
        const r = c.spec.width * 0.55;
        circles.push({ x: cx + Math.cos(h) * off, z: cz - Math.sin(h) * off, r }, { x: cx - Math.cos(h) * off, z: cz + Math.sin(h) * off, r });
      }
      return this.raceWorld.obstacleCircles(circles);
    };
    this.fleeDebug = new FleeDebug(this.scene);
    try {
      if (new URLSearchParams(window.location.search).has('fleeDebug')) this.fleeDebug.setEnabled(true);
    } catch {
      /* no URL */
    }
  }

  /**
   * Rival racers' Streetmon for a race, scaled by its tier (the higher of the track's USRL division
   * and yours); the HUD lists who's running what.
   */
  private rivalLoadoutsFor(trackId: string, drivers: Array<{ name: string; streetmon?: string[] }>): RivalLoadout[] {
    const div = this.quests.divisionFor(this.questCtx());
    const owner = (leagueConfig.divisions as Array<{ rank: number; tracks?: string[] }>).find((d) => (d.tracks ?? []).includes(trackId));
    const tier = raceTier(owner?.rank ?? 1, div?.rank ?? 1);
    const ivs = { hp: 15, attack: 15, defense: 15, speed: 15, loud: 15 };
    const out = rivalLoadouts(drivers, tier, {
      config: this.tuning.config,
      species: [...DATA.species.values()].filter((sp) => !sp.human).map((sp) => ({ id: sp.id, name: sp.name, types: sp.types, stage: sp.stage, legendary: !!sp.legendary })),
      statsOf: (id, level) => calcStats(species(id), level, ivs),
      rng: Math.random,
    });
    const armed = out.filter((l) => l.slots.length);
    const short = (n: string): string => n.replace(/"[^"]*" /, '').split(' ')[0];
    const ab = (id: string | null): string => (id ? this.tuning.config.abilities[id]?.name ?? id : 'no ability');
    if (armed.length)
      window.setTimeout(
        () => this.hud.toast(`${tierInfo(tier).name} race: ${armed.map((l) => `${short(l.driver)} runs ${l.slots.map((x) => `${x.name} (${ab(x.ability)})`).join(' + ')}`).join('; ')}.`, 6000),
        400,
      );
    return out;
  }

  private rivalToastAt = 0;

  /** A rival's Streetmon uses its ability (the same effects as yours). */
  private fireRivalAbility(car: Car, s: RivalSlot, driver: string): void {
    if (!s.ability) return;
    const cfg = this.tuning.config.abilities[s.ability];
    if (!cfg) return;
    const ok = this.tuneWorld.trigger(car, { ...cfg, id: s.ability, slot: s.slot, power: s.power, streetmon: s.info } as never, { strength: Math.abs(car.speed) * 0.6 });
    if (!ok) return;
    this.riders.react(car, s.slot, ABILITY_STYLE[s.ability] ?? 'blast');
    const near = this.player.vehicle ? car.position.distanceTo(this.player.vehicle.position) < 80 : false;
    if (near && this.gameTime > this.rivalToastAt) {
      this.rivalToastAt = this.gameTime + 4;
      this.hud.toast(`${driver.replace(/"[^"]*" /, '')}'s ${s.name}: ${cfg.name}!`, 2200);
    }
  }

  /** Builds the race manager (rules, from streetRaceManager.js) and its world side (RaceWorld). */
  private setupRaces(): void {
    this.raceWorld = new RaceWorld({
      scene: this.scene,
      world: this.world,
      vehicles: this.vehicles,
      traffic: this.traffic,
      graph: this.graph,
      config: racesConfig as never,
      playerCar: () => this.player.vehicle,
      inSmoke: (x, y, z) => this.tuneWorld.inSmoke(x, y, z),
      visible: (x, z) => this.raceVisible(x, z),
      rivals: {
        loadouts: (track, drivers) => this.rivalLoadoutsFor(track.id, drivers),
        fire: (car, slot, driver) => this.fireRivalAbility(car, slot, driver),
        riders: (car, list) => this.riders.set(car, list),
      },
    });
    const rw = this.raceWorld;
    this.races = new StreetRaceManager({
      config: racesConfig as never,
      adapter: {
        spawnProp: (def, track) => rw.spawnProp(def, track),
        spawnRacers: (track, slots, drivers, course) => {
          this.clearGrid(slots);
          return rw.spawnRacers(track, slots, drivers, course);
        },
        updateRacers: (dt, info) => rw.updateRacers(dt, info),
        racerPosition: (id) => rw.racerPosition(id),
        removeRacers: () => rw.removeRacers(),
        removeRacer: (id) => rw.removeRacer(id),
        carClass: () => (this.player.vehicle ? this.carClassOf(this.player.vehicle).cls : null),
        placePlayer: (slot) => {
          const car = this.player.vehicle;
          if (!car) return false;
          this.clearGrid([slot], car);
          this.placeCarAt(car, slot);
          return true;
        },
        holdPlayer: (hold) => void (this.raceHold = hold),
        getMoney: () => this.money,
        spend: (n) => {
          if (this.money < n) return false;
          this.money -= n;
          return true;
        },
        earn: (n) => void (this.money += n),
        getWanted: () => ({ stars: this.wanted.stars, heat: this.wanted.heat }),
        restoreWanted: (snap) => {
          // Every chaser from the race stands down; the level goes back to what it was before.
          this.police.reset();
          this.tanks.clearAll();
          this.wanted.clear();
          if (snap.stars > 0) {
            this.wanted.heat = snap.heat;
            this.wanted.stars = snap.stars;
            const p = this.focus();
            this.wanted.lastKnown = { x: p.x, z: p.z };
          }
          this.arrestBattleUsed = false;
        },
        respawnAt: (slot) => {
          const rc = this.raceCar ?? { spec: 'sports', color: '#c41e3a' };
          this.raceRespawn = { slot, spec: rc.spec, color: rc.color };
        },
        notify: (text, ms) => this.hud.toast(text, ms),
        showBig: (text, color, ms) => this.hud.showBig(text, color, ms),
      },
    });
    this.races.load({ streetCred: this.progress.streetCred });
    this.races.on('countdown', (e) => {
      if (e.n !== 3 && e.n !== (racesConfig.rules?.countdownSeconds ?? 3)) {
        audio.sfx('sfx_race_beep', 0);
        return;
      }
      const car = this.player.vehicle;
      if (car) this.raceCar = { spec: car.spec.id, color: car.color };
      this.raceLegs = this.buildRaceLegs();
      audio.sfx('sfx_race_beep', 0);
    });
    this.races.on('go', () => audio.sfx('sfx_race_go', 0));
    this.races.on('lap', (e: { lap: number; time: number; best: number }) => {
      const r = this.races.race;
      if (!r || r.track.laps < 2) return;
      const rec = this.races.records[r.track.id]?.bestLap;
      this.hud.toast(`Lap ${e.lap}: ${this.raceClock(e.time)}${rec !== undefined && e.time < rec ? ' · new best lap!' : ''}`, 2200);
    });
    this.races.on('knockout', (e: { name: string; player: boolean; lap: number }) => {
      this.hud.showBig(e.player ? 'KNOCKED OUT' : `${e.name.replace(/"[^"]*" /, '')} OUT`, e.player ? '#d32f2f' : '#ffb36b', 1600);
      audio.sfx('sfx_checkpoint', 0);
    });
    this.races.on('checkpoint', (e) => {
      audio.sfx('sfx_checkpoint', 0);
      if (e.index < e.total && this.races.race && this.races.race.track.laps > 1) {
        const n = this.races.race.track.checkpointPositions.length;
        if (e.index % n === 0) this.hud.showBig(e.index / n + 1 === this.races.race.track.laps ? 'FINAL LAP' : `LAP ${e.index / n + 1}`, '#ffd23f', 1400);
      }
    });
    this.races.on('resolved', (r) => {
      this.raceHold = false;
      this.progress.streetCred = this.races.streetCred;
      this.saveDirty = true;
      const ord = (n: number): string => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
      if (r.place === 1) this.autosaveFor('Race won');
      if (r.place !== null) {
        this.hud.showBig(r.place === 1 ? 'YOU WIN!' : `${ord(r.place)} PLACE`, r.place === 1 ? '#4be37a' : r.place <= 3 ? '#ffd23f' : '#aab3c0', 3500);
        const bits = [r.cash ? `+$${r.cash}` : 'no prize', r.cred ? `+${r.cred} Street Cred` : ''].filter(Boolean).join(', ');
        this.hud.toast(`${r.track.name}: ${ord(r.place)} in ${this.raceClock(r.time)} (${bits}).`, 5000);
        const nowOpen = this.races.eligibleTracks().filter((t) => (t.minStreetCred ?? 0) > this.races.streetCred - r.cred);
        if (nowOpen.length) window.setTimeout(() => this.hud.toast(`New race unlocked: ${nowOpen.map((t) => t.name).join(', ')}.`, 4000), 2500);
      } else {
        const why: Record<string, string> = { time: 'Out of time.', abandoned: 'You left your car.', lost: 'You went way off the course.', quit: 'You pulled out.', busted: 'Busted.', wasted: 'Wasted.', knockedOut: 'Knocked out: last across the line at the end of the lap.' };
        if (r.reason !== 'busted' && r.reason !== 'wasted') this.hud.showBig('RACE OVER', '#d32f2f', 3000);
        this.hud.toast(`${why[r.reason] ?? 'Race over.'} No prize, and the heat from the race is gone.`, 4000);
      }
      if (this.player.vehicle && !this.rides.has(this.player.vehicle.tuneId ?? '')) this.vehicles.owned.delete(this.player.vehicle);
    });
  }

  /** Clears traffic and parked cars off the grid before lining up. */
  private clearGrid(slots: GridSlot[], keep: Car | null = this.player.vehicle): void {
    for (const c of [...this.vehicles.cars]) {
      if (c === keep || c.driver === 'player' || this.raceWorld.isRacer(c) || this.police.isUnitCar(c) || this.rides.has(c.tuneId ?? '')) continue;
      if (!slots.some((s) => Math.hypot(c.position.x - s.x, c.position.z - s.z) < 9)) continue;
      if (this.traffic.isAi(c)) this.traffic.release(c);
      this.vehicles.remove(c);
    }
  }

  /** Puts a car on a grid slot, stopped, without it counting as a crash. */
  private placeCarAt(car: Car, slot: GridSlot): void {
    // (A car the streamer already took away has no physics body left to move.)
    if (car.disposed) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.heading);
    car.body.setTranslation({ x: slot.x, y: chassisRestHeight(car.spec) + 0.15, z: slot.z }, true);
    car.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    car.setInitialVelocity(0, 0);
    car.wake();
  }

  /** On screen? (racers only get put back on the line when you can't see it happen) */
  private raceVisible(x: number, z: number): boolean {
    this.raceMat.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.raceFrustum.setFromProjectionMatrix(this.raceMat);
    return this.raceFrustum.containsPoint(this.tmp.set(x, 1, z)) && this.camera.position.distanceTo(this.tmp) < 220;
  }

  /** Busted or wasted mid-race: no fine, no confiscation, no bill. The race fails and you're put back on the grid. */
  private raceFailOut(kind: 'busted' | 'wasted', reason?: string): void {
    this.battles?.abort();
    const p = this.player;
    if (kind === 'busted') this.races.notifyBusted();
    else this.races.notifyWasted();
    p.dead = true;
    if (kind === 'wasted') p.health = 0;
    this.respawnAt = performance.now() + 3200;
    this.hud.showBig(kind === 'busted' ? 'BUSTED' : 'WASTED', kind === 'busted' ? '#4f8cff' : '#d32f2f', 3000);
    if (reason) this.hud.toast(reason, 3000);
    if (kind === 'busted') audio.busted();
    else audio.wasted();
    audio.silenceCar();
  }

  /** Back on the starting grid in your car (or one just like it if yours is wrecked). */
  private raceRespawnNow(): void {
    const r = this.raceRespawn!;
    this.raceRespawn = null;
    const p = this.player;
    let car = p.vehicle;
    if (car && (car.destroyed || car.disposed || car.burning)) {
      car.driver = null;
      p.vehicle = null;
      car.visual.root.remove(p.model.root);
      this.scene.add(p.model.root);
      car = null;
    }
    p.health = PLAYER.maxHealth;
    p.dead = false;
    p.model.standUp();
    this.respawnAt = 0;
    this.clearGrid([r.slot], car);
    if (car) this.placeCarAt(car, r.slot);
    else {
      p.setCollisionEnabled(true);
      p.teleport(r.slot.x, 0.2, r.slot.z);
      let spec;
      try {
        spec = getSpec(r.spec);
      } catch {
        spec = getSpec('sports');
      }
      const fresh = this.vehicles.spawn(spec, r.slot.x, r.slot.z, r.slot.heading, r.color);
      this.stolen.add(fresh);
      this.enterVehicle(fresh);
    }
    // The Wanted Level was already set back to its pre-race level when the race ended.
    this.police.reset();
    this.tanks.clearAll();
    this.hud.toast('Back at the start line.', 2500);
  }

  /** The racing line, leg by leg, along the roads (for the minimap). */
  private buildRaceLegs(): Array<Array<{ x: number; z: number }>> {
    const r = this.races.race;
    if (!r) return [];
    const G = this.graph;
    const legs: Array<Array<{ x: number; z: number }>> = [];
    let prev = G.nearestNode(r.track.start.x, r.track.start.z).id;
    for (const c of r.course) {
      const n = G.nearestNode(c.x, c.z).id;
      const ids = prev === n ? [n] : G.route(prev, n);
      legs.push(ids.map((id) => ({ x: G.node(id).x, z: G.node(id).z })));
      prev = n;
    }
    return legs;
  }

  private raceClock(t: number): string {
    const m = Math.floor(t / 60);
    return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
  }

  /** Per frame: offers, the countdown and race, props and racers, the panel and minimap. */
  private updateRaces(dt: number): void {
    const p = this.player;
    const car = p.vehicle;
    const pos = this.focus();
    const freeRoam = !this.battles.active && !this.evolution.active && this.layers.current === 'street' && !this.trans && !p.dead && !this.chopCar && pos.y < 6 && this.heists.state === 'IDLE';
    const hud = this.races.update(dt, { inVehicle: !!car && !car.destroyed, x: pos.x, z: pos.z, speed: car ? Math.abs(car.speed) : 0, freeRoam, dead: p.dead, driftAngle: car ? (car.slip * 180) / Math.PI : 0 });
    this.raceWorld.update(dt, pos, () => this.layers.current === 'street');
    this.renderRaceHud(hud);
  }

  private renderRaceHud(h: RaceHud): void {
    const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    if (h.state === 'PROMPT') {
      const t = h.track;
      const d = Math.round(Math.hypot(t.start.x - this.focus().x, t.start.z - this.focus().z));
      if (!h.accepted) {
        const mode = modeOf(t);
        const solo = mode === 'timeTrial' || mode === 'drift';
        const medals = t.medals ? (mode === 'timeTrial' ? `Gold ${this.raceClock(t.medals.gold)} · Silver ${this.raceClock(t.medals.silver)} · Bronze ${this.raceClock(t.medals.bronze)}` : `Gold ${t.medals.gold} · Silver ${t.medals.silver} · Bronze ${t.medals.bronze} pts`) : '';
        const rec = h.record;
        const recText = rec ? (mode === 'drift' ? (rec.score !== undefined ? `Your best: ${rec.score} pts` : '') : rec.best !== undefined ? `Your best: ${this.raceClock(rec.best)}` : '') : '';
        const mine = this.player.vehicle ? this.carClassOf(this.player.vehicle).cls : null;
        this.hud.setRacePanel(
          `<div class="rp-name">${this.races.offer?.source === 'organizer' ? 'Street race' : 'Street race nearby'} · ${MODE_NAMES[mode]}</div><div class="rp-offer"><b>${esc(t.name)}</b>${t.maxClass ? ` <span class="rp-class">Class ${t.maxClass}${mine ? ` (yours: ${mine})` : ''}</span>` : ''}<br>$${t.entryFee} to enter · $${t.payouts.first} / $${t.payouts.second} / $${t.payouts.third}${solo ? ' (gold / silver / bronze)' : ''}<br>${t.laps > 1 ? `${t.laps} laps · ` : ''}${d} m away${medals ? `<br><small>${medals}</small>` : ''}${recText ? `<br><small>${recText}</small>` : ''}<br><kbd>Y</kbd> race &nbsp; <kbd>Backspace</kbd> no thanks</div>` +
            (h.expires01 < 1 ? `<div class="rp-bar"><i style="width:${Math.round(h.expires01 * 100)}%"></i></div>` : ''),
        );
      } else
        this.hud.setRacePanel(`<div class="rp-name">${esc(t.name)}</div><div class="rp-offer">Get to the start line and stop<br><b>${d} m</b> · ${Math.ceil(this.races.offer?.reachIn ?? 0)} s<br><kbd>Backspace</kbd> cancel</div>`);
      this.hud.setRaceMap({ line: [], next: { x: t.start.x, z: t.start.z, finish: false }, after: null, racers: [] });
      return;
    }
    if (h.state === 'COUNTDOWN' || h.state === 'RACING') {
      const st = this.races.standings();
      const list = st
        .slice(0, 4)
        .map((x, i) => `<div class="${x.player ? 'me' : ''}"><span>${i + 1}.</span><span>${esc(x.name)}</span></div>`)
        .join('');
      const low = h.timeLeft < 20;
      const solo = h.mode === 'timeTrial' || h.mode === 'drift';
      let head = `<div class="rp-pos">${h.place}<small>/${h.alive}</small></div>`;
      let extra = '';
      if (h.mode === 'timeTrial' && h.medals) {
        const next = h.time <= h.medals.gold ? ['Gold', h.medals.gold] : h.time <= h.medals.silver ? ['Silver', h.medals.silver] : h.time <= h.medals.bronze ? ['Bronze', h.medals.bronze] : null;
        head = `<div class="rp-pos rp-medal">${next ? next[0] : 'No medal'}</div>`;
        extra = next ? `<div class="rp-row"><span>${next[0]} until</span><span>${this.raceClock(next[1] as number)}</span></div>` : '';
        if (h.record?.best !== undefined) extra += `<div class="rp-row"><span>Your best</span><span>${this.raceClock(h.record.best)}</span></div>`;
      } else if (h.mode === 'drift' && h.medals) {
        const medal = h.score >= h.medals.gold ? 'Gold' : h.score >= h.medals.silver ? 'Silver' : h.score >= h.medals.bronze ? 'Bronze' : null;
        head = `<div class="rp-pos">${h.score}<small> pts${medal ? ` · ${medal}` : ''}</small></div>`;
        extra = `<div class="rp-row"><span>Chain</span><span class="${h.chain > 0.3 ? 'rp-hot' : ''}">x${(1 + Math.min(3, h.chain / 2)).toFixed(1)}</span></div><div class="rp-row"><span>Next medal</span><span>${h.score < h.medals.bronze ? h.medals.bronze : h.score < h.medals.silver ? h.medals.silver : h.score < h.medals.gold ? h.medals.gold : 'all yours'}</span></div>`;
      }
      if (h.laps > 1) extra += `<div class="rp-row"><span>Lap time</span><span>${this.raceClock(h.lapTime)}${h.bestLap !== null ? ` <small>best ${this.raceClock(h.bestLap)}</small>` : ''}</span></div>`;
      if (h.mode === 'knockout' && h.out.length) extra += `<div class="rp-row"><span>Out</span><span>${esc(h.out.map((n) => n.replace(/"[^"]*" /, '').split(' ')[0]).join(', '))}</span></div>`;
      this.hud.setRacePanel(
        `<div class="rp-name">${esc(h.track.name)} · ${MODE_NAMES[h.mode]}</div>
        ${head}
        <div class="rp-row"><span>Checkpoint</span><span>${h.checkpoint}/${h.totalCheckpoints}</span></div>
        ${h.laps > 1 ? `<div class="rp-row"><span>Lap</span><span>${h.lap}/${h.laps}</span></div>` : ''}
        <div class="rp-row"><span>Time</span><span>${this.raceClock(h.time)}</span></div>
        <div class="rp-row"><span>Left</span><span class="${low ? 'rp-low' : ''}">${Math.ceil(h.timeLeft)} s</span></div>
        ${extra}
        ${h.outOfCar > 0 ? `<div class="rp-row rp-low"><span>Back in a car!</span><span>${Math.ceil(15 - h.outOfCar)} s</span></div>` : ''}
        ${solo ? '' : `<div class="rp-list">${list}</div>`}`,
      );
      const r = this.races.race!;
      const idx = r.racers[0].passed;
      const f = this.focus();
      const line = [{ x: f.x, z: f.z }, ...(this.raceLegs[idx] ?? []).slice(1), ...(this.raceLegs[idx + 1] ?? []).slice(1), ...(this.raceLegs[idx + 2] ?? []).slice(1)];
      this.hud.setRaceMap({ line, next: h.next ? { x: h.next.x, z: h.next.z, finish: h.finishNext } : null, after: h.after, racers: h.racers });
      return;
    }
    if (h.state === 'RESOLVED') {
      const r = h.result;
      const solo = r.mode === 'timeTrial' || r.mode === 'drift';
      const medal = solo && r.place !== null ? ['', 'Gold!', 'Silver', 'Bronze', 'No medal'][Math.min(4, r.place)] : null;
      const headline = r.place === null ? '<b>Race over</b>' : solo ? `<b>${medal}</b>` : `<b>${r.place === 1 ? 'Winner!' : `Finished ${r.place}${r.place === 2 ? 'nd' : r.place === 3 ? 'rd' : 'th'}`}</b>`;
      const detail = r.mode === 'drift' ? `${r.score} pts` : `in ${this.raceClock(r.time)}`;
      this.hud.setRacePanel(
        `<div class="rp-name">${esc(r.track.name)} · ${MODE_NAMES[r.mode]}</div><div class="rp-offer">${headline} ${r.reason === 'finished' ? detail : ''}${r.reason === 'knockedOut' ? ' (knocked out)' : ''}<br>${r.cash ? `+$${r.cash}` : 'No prize'}${r.cred ? ` · +${r.cred} Street Cred` : ''}${r.newRecord ? '<br><b class="rp-hot">New record!</b>' : ''}${r.bestLap !== null && r.track.laps > 1 ? `<br>Best lap ${this.raceClock(r.bestLap)}` : ''}<br>Street Cred: ${this.races.streetCred}</div>`,
      );
      this.hud.setRaceMap(null);
      return;
    }
    this.hud.setRacePanel(null);
    this.hud.setRaceMap(null);
  }

  /** What the prompt line says about races. */
  private racePrompt(): string {
    const s = this.races.state;
    if (s === 'PROMPT' && !this.races.offer?.accepted) return `Y  Race ${this.races.offer?.track.name} ($${this.races.offer?.track.entryFee})`;
    if (s === 'RACING' && this.player.vehicle?.flippedTime && this.player.vehicle.flippedTime > 1.5) return 'R  Flip the car';
    return '';
  }

  /** Minimap: organisers at the start lines (dim if you need more Street Cred). */
  private raceMarkers(): Array<{ x: number; z: number; color: string; size: number }> {
    if (this.layers.current === 'sewer' || this.races.active) return [];
    return this.races.config.tracks
      .filter((t) => t.organizer)
      .map((t) => ({ x: t.organizer!.x, z: t.organizer!.z, color: (t.minStreetCred ?? 0) <= this.races.streetCred ? '#ff7a1a' : '#7a5a44', size: 9 }));
  }

  // ------------------------------------------------------------------ police tanks

  /** What the tanks aim at, or null to ignore you. */
  private tankTarget(): TankTarget | null {
    const p = this.player;
    if (p.dead || this.layers.current === 'sewer') return null;
    const f = this.focus();
    const car = p.vehicle;
    const lv = car ? car.body.linvel() : p.velocity;
    // Fairness: no shots during a police Streetmon battle, or at someone tucked into a doorway.
    const hold = (this.battles.active && this.battles.kind === 'police') || (!car && this.inDoorway(f.x, f.z));
    return { x: f.x, y: car ? f.y - 0.5 : p.feet.y, z: f.z, vx: lv.x, vz: lv.z, hold };
  }

  /** On foot right against a building front (a doorway). */
  private inDoorway(x: number, z: number): boolean {
    const r = 1.1;
    return [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ].some(([dx, dz]) => this.layers.buildingAt(x + dx, z + dz) !== null);
  }

  /** A tank shell goes off: cars, you, tanks, wild Streetmon and people nearby. */
  private tankShellBlast(x: number, y: number, z: number, source: Tank | null): void {
    const S = TANK_SPEC.turret.shell;
    const r = S.radius;
    this.effects.explosion(x, y, z);
    this.living?.explosion(x, z, r);
    audio.explosion({ x, y, z });
    for (const c of this.vehicles.cars) {
      if (c.destroyed) continue;
      const d = Math.max(0, c.position.distanceTo(this.tmp.set(x, y, z)) - c.spec.width / 2);
      if (d > r) continue;
      const k = 1 - d / r;
      const dir = this.tmp.subVectors(c.position, this.tmp2.set(x, y, z)).setY(0).normalize();
      const m = c.spec.mass;
      c.wake();
      c.body.applyImpulse({ x: dir.x * m * 6 * k, y: m * 3 * k, z: dir.z * m * 6 * k }, true);
      c.damage(S.carDamage * k, 'explosive');
    }
    this.tanks.blast(x, z, r, S.carDamage, source);
    for (const w of this.spawns.wild) {
      if (w.removed || w.creature.hp <= 0) continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d > r) continue;
      const k = 1 - d / r;
      const dmg = Math.max(1, Math.round(S.creaturePct * maxHpOf(w.creature) * k));
      w.creature.hp = Math.max(0, w.creature.hp - dmg);
      this.dmgNums.spawn(w.x, w.y + w.spec.model.height + 0.3, w.z, dmg, w.creature.hp <= 0 ? 'crit' : 'hit');
      const nx = (w.x - x) / (d || 1);
      const nz = (w.z - z) / (d || 1);
      this.spawns.knockBack(w, nx * 9 * k, 4 * k, nz * 9 * k, x, z);
    }
    for (const q of this.peds.peds) {
      const d = Math.hypot(q.x - x, q.z - z);
      if (d > r) continue;
      const k = 1 - d / r;
      this.peds.damage(q, 160 * k, q.x - x, q.z - z, 3 + 6 * k);
    }
    this.onExplosion(x, y, z, r, S.playerDamage, true);
  }

  /** The hull ploughs through whatever is in front of it. */
  private tankCrush(t: Tank, dt: number): void {
    const C = TANK_SPEC.crush;
    const [W, , L] = TANK_SPEC.size;
    const halfL = L / 2 + 0.2;
    const halfW = W / 2 + 0.2;
    const fx = t.forwardX;
    const fz = t.forwardZ;
    const front = (nx: number, nz: number): boolean => nx * fx + nz * fz > 0.35;
    // Cars: shoved by the hull (physics), crunched while in front; parked ones are flattened.
    for (const c of this.vehicles.cars) {
      if (c.destroyed || Math.hypot(c.position.x - t.x, c.position.z - t.z) > halfL + c.spec.length) continue;
      const cf = c.forward(this.tmp);
      let hit = null;
      for (const s of [-0.35, 0, 0.35]) {
        hit = carCircleContact(t.x, t.z, t.h, halfL, halfW, c.position.x + cf.x * c.spec.length * s, c.position.z + cf.z * c.spec.length * s, c.spec.width / 2);
        if (hit) break;
      }
      if (!hit || !front(hit.nx, hit.nz)) continue;
      c.wake();
      const parked = c.driver === null && c !== this.player.vehicle && !this.stolen.has(c);
      if (parked) {
        // Flattened into a wreck (no fireball under the tank).
        c.health = 0;
        c.markDestroyed();
        this.effects.sparks(c.position.x, c.position.y + 0.6, c.position.z, 14);
        audio.crash(1, c.position);
      } else c.damage(C.carDps * dt);
    }
    // Wild Streetmon: a crush hit and knocked aside.
    const now = performance.now();
    const v = (C.creatureImpactKmh / 3.6) * 1;
    for (const w of this.spawns.wild) {
      if (w.removed || w.pinned || w.y + (w.alt ?? 0) > 1.5 || (w.hitCooldownUntil ?? 0) > now) continue;
      const rr = Math.max(0.3, w.spec.model.height * 0.4);
      const hit = carCircleContact(t.x, t.z, t.h, halfL, halfW, w.x, w.z, rr);
      if (!hit) continue;
      const sp = w.spec;
      const res = resolveImpact({ carVx: fx * v, carVz: fz * v, nx: hit.nx, nz: hit.nz, carMass: TANK_SPEC.mass, cls: 'armoured', weightKg: sp.model.weightKg ?? defaultWeightKg(sp.model.height, sp.types), heavyType: sp.types.includes('concrete'), hp: w.creature.hp, maxHp: maxHpOf(w.creature) });
      w.x += hit.nx * hit.depth;
      w.z += hit.nz * hit.depth;
      w.hitCooldownUntil = now + IMPACT.cooldown * 1000;
      if (!res) continue;
      if (res.damage > 0) {
        w.creature.hp = Math.max(0, w.creature.hp - res.damage);
        this.dmgNums.spawn(w.x, w.y + sp.model.height + 0.3, w.z, res.damage, res.crit || w.creature.hp <= 0 ? 'crit' : 'hit');
      }
      // Aside rather than ahead.
      const side = hit.nx * -fz + hit.nz * fx >= 0 ? 1 : -1;
      this.spawns.knockBack(w, -fz * side * 6 + fx * 2, res.vy, fx * side * 6 + fz * 2, t.x, t.z);
      this.markSeen(sp.id);
    }
    // People.
    for (const q of this.peds.peds) {
      if (q.state === 'dead') continue;
      const hit = carCircleContact(t.x, t.z, t.h, halfL, halfW, q.x, q.z, 0.35);
      if (hit && front(hit.nx, hit.nz)) this.peds.damage(q, 400, hit.nx, hit.nz, 7);
    }
    // You, on foot: pushed out of the way and bruised.
    const p = this.player;
    if (!p.vehicle && !p.dead && p.feet.y < 1.5 && now > this.tankBumpAt) {
      const hit = carCircleContact(t.x, t.z, t.h, halfL, halfW, p.position.x, p.position.z, 0.4);
      if (hit) {
        this.tankBumpAt = now + 1000;
        const side = hit.nx * -fz + hit.nz * fx >= 0 ? 1 : -1;
        p.knockBack(-fz * side * 7 + hit.nx * 2, 3, fx * side * 7 + hit.nz * 2, 1.2);
        if (p.takeDamage(C.playerDamage, 'env')) this.kill('Crushed by a tank');
      }
    }
  }

  private tankDestroyed(t: Tank): void {
    const rx = -t.forwardZ;
    const rz = t.forwardX;
    const side = Math.hypot(this.focus().x - (t.x + rx * 4), this.focus().z - (t.z + rz * 4)) < Math.hypot(this.focus().x - (t.x - rx * 4), this.focus().z - (t.z - rz * 4)) ? 1 : -1;
    this.weapons.drop('weapon', 'rifle', 120, t.x + rx * 4 * side, 0.15, t.z + rz * 4 * side);
    this.weapons.drop('weapon', 'molotov', 3, t.x + rx * 4 * side + t.forwardX * 1.5, 0.15, t.z + rz * 4 * side + t.forwardZ * 1.5);
    audio.explosion({ x: t.x, y: 1.5, z: t.z });
    this.hud.toast('Tank destroyed! It dropped its weapons.', 3500);
    this.crime('killCop', this.tmp.set(t.x, 1, t.z));
  }

  // ------------------------------------------------------------------ vehicles

  private enterVehicle(car: Car): void {
    const p = this.player;
    if (car.disposed || car.destroyed) return;
    this.lastDriven = car;
    car.input.park = false;
    this.displayCars.delete(car);
    const isPolice = car.spec.style === 'police';
    if (isPolice && (this.traffic.isAi(car) || this.police.isUnitCar(car))) {
      // Taking a police car with officers in it: they jump out and come after you.
      const look = this.traffic.isAi(car) ? this.traffic.release(car) : null;
      this.police.onCarStolen(car, look ? [look, copLook()] : null);
      this.crime('stealPolice', car.position);
    } else if (this.traffic.isAi(car)) {
      // Carjacking: drag the driver out; they run off.
      const look = this.traffic.release(car);
      if (look) {
        const side = this.tmp.set(-0.2, 0, -(car.spec.width / 2 + 1.2)).applyQuaternion(car.quaternion).add(car.position);
        this.peds.spawnFleeing(side.x, side.z, look, p.position.x, p.position.z);
      }
      // The victim reports it even if nobody else sees.
      this.crime('carjack', car.position, 'civ');
    } else if (!car.destroyed && car.driver === null && !this.stolen.has(car)) {
      this.crime(isPolice ? 'stealPolice' : 'steal', car.position);
    }
    this.stolen.add(car);
    p.vehicle = car;
    car.driver = 'player';
    car.wake();
    p.setCollisionEnabled(false);
    // Ride along visibly in the driver's seat.
    const model = p.model.root;
    this.scene.remove(model);
    car.visual.root.add(model);
    model.position.copy(car.visual.seat);
    model.rotation.set(0, 0, 0);
    p.model.sit();
    audio.door();
    this.hud.toast(car.spec.name, 1800);
  }

  private exitVehicle(): void {
    const p = this.player;
    const car = p.vehicle;
    if (!car) return;
    car.visual.body.visible = true;
    car.boost = false;
    const spot = this.findExitSpot(car);
    if (!spot) {
      this.hud.toast('No room to get out', 1200);
      return;
    }
    const fast = Math.abs(car.speed) > 9;
    car.driver = null;
    car.input.throttle = 0;
    car.input.brake = 0;
    car.input.steer = 0;
    car.input.handbrake = false;
    car.sirenOn = false;
    p.vehicle = null;
    const model = p.model.root;
    car.visual.root.remove(model);
    this.scene.add(model);
    p.setCollisionEnabled(true);
    p.teleport(spot.x, spot.y, spot.z);
    p.facing = car.heading;
    audio.door();
    audio.silenceCar();
    audio.setHorn(false);
    if (fast) {
      // Bailing out at speed: tumble and get hurt.
      const lv = car.body.linvel();
      p.knockBack(lv.x * 0.6, 1.5, lv.z * 0.6, 1.8);
      if (p.takeDamage(Math.abs(car.speed) * 1.5, 'env')) this.kill('Bailed out too fast');
    }
  }

  /** Driver side (left, local -Z) first, then right, then behind; each checked with a ray from the cabin. */
  private findExitSpot(car: Car): THREE.Vector3 | null {
    const w = car.spec.width / 2 + 0.55;
    const l = car.spec.length / 2 + 0.6;
    const candidates = [new THREE.Vector3(-0.2, 0, -w), new THREE.Vector3(-0.2, 0, w), new THREE.Vector3(-l, 0, 0), new THREE.Vector3(l, 0, 0)];
    const origin = car.position;
    const groundY = Math.max(0, origin.y - chassisRestHeight(car.spec)) + 0.05;
    for (const c of candidates) {
      const target = c.applyQuaternion(car.quaternion).add(origin);
      target.y = groundY + 0.9;
      const dir = new THREE.Vector3(target.x - origin.x, target.y - origin.y, target.z - origin.z);
      const len = dir.length();
      dir.divideScalar(len);
      const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
      const hit = this.world.castRay(ray, len + PLAYER.radius, true, undefined, EXIT_RAY_GROUPS, undefined, car.body);
      if (hit) continue;
      return new THREE.Vector3(target.x, groundY + 0.1, target.z);
    }
    return null;
  }

  // ------------------------------------------------------------------ death

  private kill(reason: string): void {
    if (!this.player.dead) this.heists?.notifyWasted();
    if (!this.player.dead) this.quests?.notify({ type: 'wasted' });
    if (this.races?.active && !this.player.dead) {
      this.raceFailOut('wasted', reason);
      return;
    }
    this.battles?.abort();
    const p = this.player;
    p.dodge.reset();
    if (!p.dead) {
      p.health = 0;
      p.dead = true;
    }
    if (this.respawnAt > performance.now()) return;
    this.respawnAt = performance.now() + 4500;
    // Back at the last safehouse you used (or the start of the game).
    const home = this.safeSpots.find((h) => h.id === this.safehouses.last && this.safehouses.owned.includes(h.id));
    this.respawnPoint = home ? { x: home.x, z: home.z } : this.layout.playerSpawn;
    const fee = Math.min(this.money, 100);
    this.money -= fee;
    if (fee > 0) window.setTimeout(() => this.hud.toast(`Hospital bill: $${fee}`, 3000), 1500);
    this.hud.showBig('WASTED', '#d32f2f', 4200);
    this.tut.fire('wasted');
    this.hud.toast(reason, 4000);
    audio.wasted();
    audio.silenceCar();
  }

  private respawn(): void {
    if (this.raceRespawn) {
      this.raceRespawnNow();
      return;
    }
    const p = this.player;
    if (p.vehicle) {
      const car = p.vehicle;
      car.driver = null;
      p.vehicle = null;
      car.visual.root.remove(p.model.root);
      this.scene.add(p.model.root);
    }
    p.setCollisionEnabled(true);
    const sp = this.respawnPoint;
    p.teleport(sp.x, 0.2, sp.z);
    this.wanted.clear();
    this.police.reset();
    this.tanks.clearAll();
    p.health = PLAYER.maxHealth;
    p.dead = false;
    p.model.standUp();
    this.respawnAt = 0;
    this.hud.toast(this.respawnPoint === this.precinct ? 'Released from the precinct' : 'Back on your feet', 2500);
  }

  // ------------------------------------------------------------------ law

  /**
   * Reports a crime. Witnesses decide whether it counts: police who can see the spot, else any
   * bystander within 40 m. `minWitness` forces at least that level (a carjack victim always reports).
   */
  private crime(kind: Crime, at: THREE.Vector3, minWitness: 'civ' | null = null): void {
    // No stars from anything done in the sewers.
    if (this.layers.current === 'sewer' || at.y < LAYERS.sewerFloor + 10) return;
    let w: 'cop' | 'civ' | 'none' = 'none';
    // Heist smoke: nobody inside it sees a thing to report.
    const sz = this.smokeZone;
    const smoked = !!sz && this.gameTime < sz.until && Math.hypot(at.x - sz.x, at.z - sz.z) < sz.r;
    if (this.police.canSee(at.x, at.y, at.z)) w = 'cop';
    else if (!smoked && (minWitness || this.peds.witnesses(at.x, at.z, 40) > 0)) w = 'civ';
    // Gunfire and explosions near a job make noise.
    if ((kind === 'gunfire' || kind === 'explosion') && this.heists?.job) {
      const c = this.heists.centre(this.heists.job.target);
      if (Math.hypot(c.x - at.x, c.z - at.z) < this.heists.job.target.location.radius * 1.5) this.heists.reportNoise(kind);
    }
    // Shooting back at the Gutter Kings in a gang fight isn't what the police are there for.
    if (kind === 'gunfire' && this.gangs?.fighting) return;
    if (w === 'civ' && Math.random() > civicTier(this.civic).witness) w = 'none';
    const before = this.wanted.stars;
    if (this.wanted.report(kind, at.x, at.z, w) > 0 && kind !== 'gunfire') this.repEvent(kind === 'killPed' ? 'pedKilled' : kind === 'killCop' || kind === 'hitCop' ? 'copHurt' : 'crime');
    if (this.wanted.stars > before) {
      audio.wantedUp();
      if (before === 0) this.hud.toast(w === 'cop' ? 'The police saw that' : 'Someone called the police', 2500);
    }
  }

  private onPedHit(ped: Ped, byPlayer: boolean, killed: boolean): void {
    if (!byPlayer || ped.role === 'gang') return;
    const at = this.tmp.set(ped.x, ped.y, ped.z);
    if (ped.role === 'cop') this.crime(killed ? 'killCop' : 'hitCop', at, 'civ');
    else this.crime(killed ? 'killPed' : 'hitPed', at, killed ? null : 'civ');
  }

  /** The player's car hit a police car: their fault if they were driving into it harder. */
  private checkRam(): void {
    const mine = this.player.vehicle;
    if (!mine || this.ramCd > 0) return;
    for (const c of this.vehicles.cars) {
      if (c === mine || c.spec.style !== 'police' || c.destroyed) continue;
      if (this.vehicles.distanceToFootprint(c, mine.position) > mine.spec.length / 2 + 1.2) continue;
      const toCop = this.tmp.subVectors(c.position, mine.position).setY(0).normalize();
      const a = mine.body.linvel();
      const b = c.body.linvel();
      const mineIn = a.x * toCop.x + a.z * toCop.z;
      const copIn = -(b.x * toCop.x + b.z * toCop.z);
      if (mineIn > 3 && mineIn >= copIn) {
        this.ramCd = 2;
        this.crime('ramPolice', c.position);
      }
      return;
    }
  }

  private updateLaw(dt: number): void {
    const p = this.player;
    const car = p.vehicle;
    this.speedingCd -= dt;
    this.ramCd -= dt;
    const focus = this.focus();
    let vx = 0;
    let vz = 0;
    if (car) {
      const lv = car.body.linvel();
      vx = lv.x;
      vz = lv.z;
    } else {
      vx = p.velocity.x;
      vz = p.velocity.z;
    }
    if (!p.dead && this.layers.current === 'sewer') {
      // No police underground, and the trail goes cold twice as fast.
      this.wanted.update(dt * SEWER.searchMult, false, focus.x, focus.z);
    } else if (!p.dead && !(this.battles.active && this.battles.kind === 'police')) {
      const armed = (p.onFoot && isRanged(this.weapons.current)) || this.creatureCrime;
      const arrestBefore = this.police.arrestRaw;
      this.police.update(dt, { pos: focus, vx, vz, car: car, onFoot: p.onFoot, armed }, this.camera);
      // Rolling doesn't shake off an officer mid-arrest (it holds while you roll), and a winded
      // player is easier to cuff.
      if (p.onFoot && arrestBefore > 0) {
        const now = this.police.arrestRaw;
        if (p.rolling && now < arrestBefore) this.police.arrestRaw = arrestBefore;
        else if (p.dodge.winded > 0 && now > arrestBefore) this.police.arrestRaw = arrestBefore + (now - arrestBefore) * ROLL.windedArrest;
      }
      this.wanted.update(dt, this.police.seen || this.tanks.seesPlayer, focus.x, focus.z);
    }
    this.camera.updateMatrixWorld();
    this.tankPv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.tankFrustum.setFromProjectionMatrix(this.tankPv);
    this.tanks.update(dt, p.dead ? 0 : this.wanted.stars);
    // Speeding past a patrol car (over ~100 km/h) earns the first star.
    if (car && this.wanted.stars === 0 && this.speedingCd <= 0 && Math.abs(car.speed) > 28) {
      this.speedingCd = 1;
      if (this.police.canSee(focus.x, focus.y, focus.z)) {
        this.speedingCd = 15;
        this.crime('speeding', focus);
      }
    }
  }

  private busted(): void {
    // A heist ends there: the loot is gone (then the usual arrest).
    this.heists?.notifyBusted();
    this.quests?.notify({ type: 'busted' });
    if (this.races?.active) {
      this.raceFailOut('busted');
      return;
    }
    this.battles?.abort();
    this.confiscateCreatures();
    const p = this.player;
    if (p.dead || this.respawnAt > performance.now()) return;
    p.dead = true;
    if (p.vehicle) {
      // Dragged out of the car.
      const car = p.vehicle;
      car.driver = null;
      car.input.throttle = 0;
      car.input.brake = 0;
      car.input.steer = 0;
      car.input.handbrake = false;
      p.vehicle = null;
      car.visual.root.remove(p.model.root);
      this.scene.add(p.model.root);
      const spot = this.findExitSpot(car) ?? car.position.clone();
      p.teleport(spot.x, Math.max(0, spot.y), spot.z);
    }
    p.setCollisionEnabled(false);
    this.respawnAt = performance.now() + 4000;
    this.respawnPoint = this.precinct;
    // Arrested: weapons confiscated, a fine on top.
    const fine = Math.floor(this.money * 0.1);
    this.money -= fine;
    const hadWeapons = this.weapons.inventory.owned.length > 1;
    this.weapons.inventory.confiscateAll();
    window.setTimeout(() => this.hud.toast(`${hadWeapons ? 'Weapons confiscated. ' : ''}Fine: $${fine}`, 3000), 1500);
    this.hud.showBig('BUSTED', '#4f8cff', 3800);
    this.tut.fire('busted');
    audio.busted();
    audio.silenceCar();
  }

  /** A sidewalk spot on a downtown block, standing in for the precinct house. */
  private findPrecinct(): { x: number; z: number } {
    const L = this.layout;
    const tx = L.aveX[4];
    const tz = L.streetZ[16];
    let best = L.blocks[0];
    let bestD = Infinity;
    for (const b of L.blocks) {
      const d = Math.hypot((b.x0 + b.x1) / 2 - tx, (b.z0 + b.z1) / 2 - tz);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return { x: (best.x0 + best.x1) / 2, z: best.z0 + 1.6 };
  }

  // ------------------------------------------------------------------ camera, HUD, audio

  /** Shakes the camera (0-1); bigger shakes override smaller ones, then it settles. */
  shakeCamera(amount: number): void {
    this.shakeAmt = Math.min(1, Math.max(this.shakeAmt, amount));
  }

  private updateCamera(dt: number): void {
    this.camera.position.sub(this.shakeOff);
    this.shakeOff.set(0, 0, 0);
    this.updateCameraPose(dt);
    // Never under the pond's surface (the camera rides just above the waves).
    const cp = this.camera.position;
    if (inLake(this.layout.parkLake, cp.x, cp.z, -0.6)) cp.y = Math.max(cp.y, waveY(cp.x, cp.z, this.gameTime) + 0.35);
    if (this.shakeAmt > 0.001 && this.state !== 'paused') {
      const a = this.shakeAmt * this.shakeAmt * 0.35;
      this.shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      this.camera.position.add(this.shakeOff);
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    }
  }

  private updateCameraPose(dt: number): void {
    if (this.state === 'title' || this.state === 'loading') {
      this.rig.updateOrbit(dt, new THREE.Vector3(0, 40, this.layout.streetZ[11]), 520, 210);
      return;
    }
    if (this.state === 'paused' || this.state === 'cinematic') return;
    if (this.wardrobe.isOpen) {
      this.wardrobeCamera(dt);
      return;
    }
    const p = this.player;
    if (this.evolution.active) {
      const pos = new THREE.Vector3();
      const look = new THREE.Vector3();
      this.evolution.cameraPose(pos, look);
      const k = 1 - Math.exp(-dt * 3);
      this.camera.position.lerp(pos, k);
      this.evoLook.lerp(look, k);
      this.camera.lookAt(this.evoLook);
      return;
    }
    if (this.battles.locksPlayer) {
      const pos = new THREE.Vector3();
      const look = new THREE.Vector3();
      this.battles.cameraPose(pos, look);
      const k = 1 - Math.exp(-dt * 4);
      this.camera.position.lerp(pos, k);
      this.battleLook.lerp(look, k);
      this.camera.lookAt(this.battleLook);
      return;
    }
    if (p.vehicle) {
      const v = p.vehicle;
      this.rig.updateCar(dt, v.visual.root.position, v.heading, v.speed, this.input.mouseIdleMs, { length: v.spec.length, height: v.spec.height, quaternion: v.visual.root.quaternion });
      // In the bonnet view the car's own body would fill the screen.
      const hide = this.rig.carView === 'hood';
      if (v.visual.body.visible === hide) v.visual.body.visible = !hide;
    } else {
      const w = this.weapons.current;
      this.rig.updateFoot(dt, p.model.root.position.clone().setY(p.model.root.position.y + 0.85), this.aiming && isRanged(w), w.zoomFov ?? 0);
    }
  }

  private updateHudAndAudio(dt: number): void {
    const p = this.player;
    const car = p.vehicle;
    if (this.touchUi) this.touchUi.setMode(this.state !== 'playing' ? (this.state === 'paused' ? 'menu' : 'hidden') : this.battles.locksPlayer ? 'battle' : car ? 'car' : 'foot');
    const focus = this.focus();
    const cam = this.camera;
    const look = cam.getWorldDirection(this.tmp);
    const viewHeading = Math.atan2(-look.z, look.x);
    let prompt = '';
    const heistPrompt = this.battles.active ? '' : this.heistPrompt();
    const eventPrompt = this.battles.active ? null : this.eventWorld.prompt() ?? this.campaignWorld?.prompt();
    if (this.battles.active) {
      prompt = '';
    } else if (heistPrompt) {
      prompt = heistPrompt;
    } else if (eventPrompt) {
      prompt = eventPrompt;
    } else if (p.onFoot && this.clinics.clinicAt(p.position.x, p.position.z)) {
      prompt = `E  ${CLINIC_NAME}${this.party.hurt ? `: heal ($${this.clinicFee()}), capture items` : ': capture items'}`;
    } else if (p.onFoot && this.impound.length && Math.hypot(p.position.x - this.impoundSpot.x, p.position.z - this.impoundSpot.z) < 2) {
      prompt = `E  Impound lot: get back ${this.impound.length} Streetmon ($${this.impound.length * 150})`;
    } else if (p.onFoot && this.party.canFight && this.spawns.nearest(p.position, 7)) {
      const w = this.spawns.nearest(p.position, 7)!;
      const raid = this.raidWorld.isBoss(w) ? this.raidWorld.active?.status : null;
      prompt =
        raid === 'subdued'
          ? `C  Throw a capture item at ${w.spec.name}!`
          : raid
            ? `B  Fight ${w.spec.name} (legendary, Lv ${w.creature.level}) with the trainers`
            : `B  Battle the wild ${w.spec.name} (Lv ${w.creature.level})`;
    } else if (p.onFoot && !this.interior && this.wanted.stars < 3 && this.nearestPerson(2.2)?.role === 'civ' && !this.enterableCar()) {
      prompt = this.party.canFight && this.party.lead ? `E  Talk   ·   B  Set ${displayName(this.party.lead)} on them` : 'E  Talk';
    } else if (p.onFoot && this.party.canFight && this.party.lead && this.nearestPerson(4.5)) {
      const ped = this.nearestPerson(4.5)!;
      prompt = `B  Set ${displayName(this.party.lead)} on ${ped.role === 'cop' ? 'the officer' : 'this person'} (a crime)`;
    } else if (this.atDealer()) {
      prompt = 'E  Empire Motors: buy and sell cars';
    } else if (this.atSafehouse()) {
      const h = this.atSafehouse()!;
      prompt = this.safehouses.owned.includes(h.id) ? `E  ${h.name}: save, rest, sleep` : `E  ${h.name}: for sale, $${h.price.toLocaleString('en-US')}`;
    } else if (p.onFoot && this.shops.shopAt(p.position.x, p.position.z)) {
      prompt = `E  ${SHOP_NAME}`;
    } else if (p.onFoot && this.roofUse()) {
      prompt = `E  ${this.roofUse()!.label}`;
    } else if (p.onFoot && this.interiorUse()) {
      prompt = `E  ${this.interiorUse()!.label}`;
    } else if (p.onFoot && p.waterState !== 'dry') {
      const e = this.waterEdge(p.position.x, p.position.z);
      prompt = e && e.d < POND.climbReach + 0.6 ? 'Space  Climb out' : p.swimming ? 'Shift  Swim faster' : '';
    } else if (car && this.carWater.get(car)?.stalled) {
      prompt = "F  Get out: the engine's flooded";
    } else if (p.onFoot) {
      const near = this.enterableCar();
      if (near) {
        const occupied = this.traffic.isAi(near) || (this.police.isUnitCar(near) && near.driver === 'police');
        prompt = near.spec.style === 'police' && occupied ? 'E  Steal the police car' : occupied ? `E  Carjack the ${near.spec.name}` : `E  Get in ${near.spec.name}`;
      }
    } else if (car && car.flippedTime > 1.5) {
      prompt = 'R  Flip the car';
    } else if (car && this.racePrompt()) {
      prompt = this.racePrompt();
    } else if (car && this.atChopLift(car) && !this.races.active) {
      prompt = this.wanted.stars > 0 ? "The Chop Shop won't open while the cops are on you" : 'E  Lower into the Underground Chop Shop';
    }
    if (this.touchUi) {
      this.touchUi.setContext(prompt);
      this.touchUi.setButtonShown('yes', this.races.state === 'PROMPT' && !this.races.offer?.accepted);
    }
    this.updateStaminaHud();
    this.hud.update({
      health01: p.health / PLAYER.maxHealth,
      inCar: !!car,
      speedKmh: car ? car.speed * 3.6 : 0,
      gear: audio.currentGear,
      reversing: !!car && car.speed < -0.5 && car.input.brake > 0,
      vehicleHealth01: car ? car.health01 : 1,
      x: focus.x,
      z: focus.z,
      layer: this.interior ? this.interior.spot.name : layerLabel(this.layers.current),
      viewHeading,
      heading: car ? car.heading : p.facing,
      prompt: this.input.device === 'pad' ? padPrompt(prompt, this.padIn.context, { heist: this.padIn.inHeist }) : prompt,
      fps: this.fps,
      stars: this.wanted.stars,
      searching: this.wanted.searching,
      arrest01: this.police.arrestProgress / 1.1,
      blips: this.police.blips(),
      search: this.wanted.searching
        ? { x: this.wanted.lastKnown.x, z: this.wanted.lastKnown.z, r: 40 + this.wanted.searchProgress * 120 }
        : null,
      markers: [
        ...this.spawns.markers(p.position),
        ...this.raidWorld.markers(),
        ...this.gangs.markers(),
        ...this.eventMarkers(),
        ...this.campaignMinimap(),
        ...this.questMarkers(),
        ...this.tuningMarkers(),
        ...this.raceMarkers(),
        ...this.heistMarkers(),
        // Underground the street landmarks are hidden; only creatures and ladders show.
        ...(this.layers.current === 'sewer' ? [] : [
        ...this.clinics.clinics.map((c) => ({ x: c.x, z: c.z, color: '#4be37a', size: 9 })),
        ...this.trainers.markers(p.position),
        ...(this.impound.length ? [{ x: this.impoundSpot.x, z: this.impoundSpot.z, color: '#b07cff', size: 9 }] : []),
        ...this.shops.shops.map((s) => ({ x: s.x, z: s.z, color: '#ffb02e', size: 9 })),
        ]),
        // Manholes you've used (all of them while you're underground, as ladders).
        // Manholes: ladders underground; on the street the ones you've used, and any within 90 m.
        ...this.mazes.flatMap((m) =>
          m.manholes
            .filter((h) => this.layers.current === 'sewer' || this.progress.manholesFound.includes(h.id) || Math.hypot(h.x - this.player.position.x, h.z - this.player.position.z) < 90)
            .map((h) => ({ x: h.x, z: h.z, color: this.layers.current === 'sewer' || this.progress.manholesFound.includes(h.id) ? '#c9d3d8' : '#7f8a90', size: 6 })),
        ),
        ...this.weapons.pickupMarkers().map((k) => ({ x: k.x, z: k.z, color: k.kind === 'cash' ? '#7dff8a' : '#ffe680', size: 4 })),
      ],
    });
    const scoped = this.aiming && p.onFoot && !!this.weapons.current.zoomFov;
    this.weaponHud.update({
      inv: this.weapons.inventory,
      onFoot: p.onFoot,
      aiming: this.aiming,
      spreadDeg: this.weapons.crosshairSpread(this.aiming, Math.hypot(p.velocity.x, p.velocity.z) > 0.5),
      fovDeg: this.camera.fov,
      money: this.money,
      scoped,
    });
    if (car && !p.dead) {
      audio.updateCar(true, car.speed, car.spec.maxSpeed, car.input.throttle, car.spec.gears, car.rearSlip, dt);
    } else {
      audio.updateCar(false, 0, 1, 0, 1, 0, dt);
      if (p.onFoot && p.grounded) audio.footstep(Math.hypot(p.velocity.x, p.velocity.z));
    }
    if (this.spatial) {
      // 3D: engines and squeal for the AI cars around you, sirens on the police units.
      const engines: EngineSource[] = [];
      const sirens: SirenSource[] = [];
      for (const c of this.vehicles.cars) {
        if (c.destroyed || c.disposed) continue;
        if (c.sirenOn) sirens.push({ key: c, position: c.position });
        if (c === car || !c.driver) continue;
        engines.push({ key: c, position: c.position, speed: c.speed, maxSpeed: c.spec.maxSpeed, gears: c.spec.gears, throttle: Math.max(0, c.input.throttle), slip: c.rearSlip, pitch: clamp((1500 / c.spec.mass) ** 0.22, 0.72, 1.25) });
      }
      this.spatial.update(dt, engines, sirens);
    } else {
      let sirenDist = 1;
      let sirenOn = false;
      for (const c of this.vehicles.cars) {
        if (!c.sirenOn) continue;
        sirenOn = true;
        sirenDist = Math.min(sirenDist, c.position.distanceTo(cam.position) / 300);
      }
      audio.updateSiren(sirenOn, dt, clamp(sirenDist, 0, 1));
    }
  }

  /** The 3D sound layer, made once the audio engine exists (after the first click). */
  private ensureSpatial(): void {
    if (this.spatial || !audio.context) return;
    try {
      this.spatial = new SpatialAudio(this.camera, { hrtf: !platform.touch, engines: platform.touch ? 3 : 5, oneShots: platform.touch ? 12 : 20 });
      audio.setSpatial(this.spatial);
    } catch (e) {
      console.warn('3D audio unavailable', e);
    }
  }
}

/** Yields to the browser so the loading text can paint. A timer (not rAF) so loading also finishes in a background tab. */
function nextFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 16));
}

const NPC_NAMES = ['Marcus', 'Jen', 'Luis', 'Tasha', 'Omar', 'Keisha', 'Danny', 'Priya', 'Vinnie', 'Rosa', 'Theo', 'Ama', 'Giuseppe', 'Hana', 'Rudy', 'Zoe'];
const NPC_LINES = [
  "Nice Streetmon. Mine's better.",
  'You look like you need a beating. Battle!',
  "I've got ten minutes before my shift. Let's go.",
  'Hey! You! Streetmon battle, right now.',
  "My cousin says I'm the best on this block. Prove him wrong.",
  'Lunch money says I win.',
];

function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

/** A "!" sprite over someone who's about to challenge you. */
function makeBubble(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#59b6ff';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.setScalar(0.55);
  return s;
}

/** A little picture for a capture item on the quick-select wheel. */
function captureGlyph(id: string): string {
  const g: Record<string, string> = { cuffs: '⛓️', crate: '📦', net: '🕸️', lure: '🪝', cage: '🧰', capturePod: '🟣' };
  return g[id] ?? '🎯';
}
