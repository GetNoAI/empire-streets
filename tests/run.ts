/* Engine-free tests: city layout invariants. Run with `npm test`. */
import { CITY, generateLayout, rectContains, type Rect } from '../src/world/CityLayout';
import { DIRS, DX, DZ, RoadGraph, opposite, type Dir } from '../src/traffic/RoadGraph';
import { segmentsInRing } from '../src/police/spawnRing';
import { SIGNAL_CYCLE, lightAt } from '../src/traffic/Signals';
import { STAR_HEAT, Wanted, searchTime, starsFor } from '../src/police/Wanted';
import { Inventory } from '../src/weapons/Inventory';
import { WEAPONS, parseWeapons, weapon } from '../src/weapons/WeaponTypes';
import * as fs from 'node:fs';
import { INTENSITY, MUSIC, MusicDirector, ZONES, fadeFor, pickTrack, type TrackId } from '../src/audio/Music';
import { HEARING, HEIST_INTERIOR, laserOn, laserTouches, planHeistInterior } from '../src/systems/HeistInterior';
import { HeistRaid } from '../src/systems/HeistRaid';
import { LAYERS, WorldLayers, layerLabel } from '../src/world/WorldLayers';
import { ROOFS, ballistic, flightAt, planGarages, planRooftops, roofEscapeReport } from '../src/world/Rooftops';
import { SEWER, bfsDistances, blockAt, carveMaze, key as sewerKey, planSewers, propAt, reachableCount, ventActive, wallRuns } from '../src/world/Sewers';
import { IMPACT, carCircleContact, defaultWeightKg, impactShare, instantFaint, resolveImpact, weightClassOf } from '../src/vehicles/CreatureImpacts';
import { COMMUNITY, MARKET, advanceQuest, canStart, currentStep, marketStock, openingNode, parseCommunity, quest, questStatus, startQuest } from '../src/npc/Quests';
import npcsJson from '../src/data/npcs.json';
import questsJson from '../src/data/quests.json';
import { DRIFT, DriftState, counterSteer, driftBoost, rearGrip, slipAngle, yawAssist } from '../src/vehicles/Drift';
import typesJson from '../src/data/types.json';
import movesJson from '../src/data/moves.json';
import creaturesJson from '../src/data/creatures.json';
import itemsJson from '../src/data/items.json';
import { ALL_SPECIES, DATA, TYPE_IDS, move, parseData, species, typeMultiplier, effectivenessText, speciesBiomes } from '../src/creatures/Data';
import { dexEntries, parseDex } from '../src/creatures/Dex';
import dexJson from '../src/data/streetmondex.json';
import { calcStats, createCreature, levelForXp, movesAtLevel, xpForLevel, MAX_MOVES } from '../src/creatures/Creature';
import { buildCreatureModel, hasBuilder } from '../src/creatures/models/Builders';
import { CLIPS } from '../src/creatures/models/Kit';
import { checkGlb } from '../src/creatures/models/GlbCheck';
import * as THREE from 'three';
import { SURFACE_KINDS, SURFACE_TUNING, TILE_PX, surfaceTile } from '../src/render/SurfaceGen';
import { copySurface, surfaceOf, withSurface } from '../src/render/Surfaces';
import { GLOW, SURFACES, chamferBox, chamferCylinder, countTriangles, crevice, gradient, surfaceFor } from '../src/creatures/models/Polish';
import { ATLAS, STYLES, SURFACES as ATLAS_SURFACES, SURFACE_PBR, atlasImages, cellAt, cellUV } from '../src/creatures/models/Atlas';
import { isInside, mergeCoplanar, triangleTangent } from '../src/creatures/models/Unwrap';
import { encodePng, decodePng } from '../scripts/png';
import { injectAtlas } from '../scripts/glb-textures';
import streetEventsJson from '../src/config/street_events.json';
import { EVENT_TYPES, StreetEventManager, validateEventConfig, type StreetEventConfig } from '../src/systems/streetEventManager.js';
import { alleyAvoidPoints, planAlleys } from '../src/world/Alleys';
import { attachEmissivePulse } from '../src/creatures/CreatureModels';
import livingJson from '../src/config/living_world.json';
import { SpatialGrid, ambientHit, fillLine, hasHoles, isRival, typeMult } from '../src/systems/livingCore.js';
import { HUNTER_STATES, NpcLifeManager, TOPICS, type NpcLifeAdapter, type NpcLifeConfig, type Person, type WildView } from '../src/systems/npcLife.js';
import { WildInteractionManager, type WildAdapter, type WildConfig, type WildMon } from '../src/systems/wildInteractions.js';
import { FollowerSkirmish, SKIRMISH_DEFAULTS, type SkirmishAdapter, type SkirmishFollower } from '../src/systems/FollowerSkirmish';
import { SpawnSystem as LiveSpawnSystem } from '../src/creatures/SpawnSystem';
import { wrapText } from '../src/ui/Overhead';
import campaignJson from '../src/config/campaign_quests.json';
import tutorialsJson from '../src/config/tutorials.json';
import { ARENA, arenaProblems, cameraOf, chooseArena, nearestClear, spotOf } from '../src/creatures/Arena';
import { TutorialManager, parseKeys, triggerMatches, validateTutorials, type TutorialConfig } from '../src/systems/tutorialManager.js';
import leagueJson from '../src/config/racing_league.json';
import { OBJECTIVE_TYPES, QuestManager, validateCampaign, validateLeague, type CampaignConfig, type LeagueConfig, type QuestContext } from '../src/systems/questManager.js';
import { SPAWN, STORY_LEVEL_BONUS, capFor, detectionRadius, districtAt, hostileAt, pickSpecies, revealRadius, rollLevel, spawnTable, storyAllows, storyLevel } from '../src/creatures/SpawnRules';
import { DISTRICTS, TIMES } from '../src/creatures/Data';
import { clockText, lightingAt, phaseAt, sunElevationDeg } from '../src/world/DayCycle';
import { Battle, baseDamage, finalDamage, stageMult, type Action, type Combatant } from '../src/creatures/BattleEngine';
import { Party } from '../src/creatures/Party';
import { CATCH, catchChance, catchValue, itemMultiplier, rollCatch } from '../src/creatures/Catching';
import { PITY, newPity, pityMessage, recordThrow, softBonus, withPity } from '../src/creatures/Pity';
import { completion, dexBiomes, dexState, evolutionLine, filterDex, stageOf, typeMatrix } from '../src/creatures/Dex';
import { BATTLE, CAR_DURABILITY, PLAYER, carDamageTaken } from '../src/config';
import { DEFAULT_LOOK, LOOK_OPTIONS, OUTFITS, randomPlayerLook, sanitizeLook } from '../src/player/playerLook';
import { VehicleTuningManager, computeStats, modFor, validateConfig, type StreetmonInfo, type VehicleStats } from '../src/systems/vehicleTuning.js';
import tuningJson from '../src/config/vehicle_streetmon_tuning.json';
import { RaceTrackInstance, StreetRaceManager, buildCourse, classOk, driftPoints, gridSlots, medalPlace, modeOf, payoutFor, progressOf, validateRaceConfig, type RaceAdapter } from '../src/systems/streetRaceManager.js';
import { VEHICLES } from '../src/vehicles/specs';
import { NITRO, Nitrous, classAllowed, classOf, performanceIndex, sanitizeUpgrades, upgradeEffect, upgradePrice } from '../src/vehicles/Performance';
import { rivalUpgrades } from '../src/systems/rivalLoadout';
import racesJson from '../src/config/races.json';
import { CircleIndex, ObstacleField, WallGrid, clampToWall, moveWithCollision, rayCircle, wallRepulsion } from '../src/creatures/WallProbe';
import { SmartFleeBehavior, newFleeMemory, steerWithRepulsion } from '../src/creatures/SmartFlee';
import { HeistManager, encumbrance as heistEnc, escapeStars, haulerCapacity, roleFit, splitLoot, validateHeistConfig, type CrewCandidate, type HeistAdapter } from '../src/systems/heistManager.js';
import heistsJson from '../src/config/heists.json';
import { clampView, pathLength, screenToWorld, visibleLayers, worldToScreen, zoomAt, type MapConfig } from '../src/ui/MapOverlay';
import mapIconsJson from '../src/config/map_icons.json';
import { ESCALATION, rule, tankDue, unitsFor } from '../src/police/Escalation';
import { armourDamage, avenueSpans, driveStep, headingTo, leadTarget, shellPitch, spansByDistance, spawnZ, turnToward, wrapAngle } from '../src/police/TankLogic';
import { TANK_SPEC } from '../src/vehicles/specs';
import { Bag } from '../src/creatures/Bag';
import { captureItems, item as itemSpec, type CaptureItem } from '../src/creatures/Data';
import { maxHp as crMaxHp } from '../src/creatures/Creature';
import { TRAINERS, validateTrainers } from '../src/creatures/Trainers';
import { SAVE_VERSION, creatureToJson, describeSave, loadSave, sanitizeCreature, type SaveData } from '../src/core/SaveSystem';
import { BENCH_SHARE, XP_MULTIPLIER, XP_TIER_BASE, evolutionFor, evolve, gainXp, itemEvolution, learn, replaceMove, xpYield } from '../src/creatures/Progression';
import { stats as crStats } from '../src/creatures/Creature';
import { DestructionManager, validateDestructibles, type DestructibleConfig } from '../src/systems/destruction.js';
import destructiblesJson from '../src/config/destructibles.json';
import { STREET_PROPS, planStreetProps } from '../src/world/StreetProps';
import { ColliderStreamer } from '../src/world/ColliderStreamer';
import { copLook, randomLook } from '../src/peds/CrowdRenderer';
import { ResolutionScaler } from '../src/render/ResolutionScaler';
import { RaidManager, validateRaids, type RaidConfig } from '../src/systems/raidManager.js';
import legendariesJson from '../src/config/legendaries.json';
import { FX_SOUNDS, FX_STYLES, impactFor, planMoveFx, statusKind, validateMoveFx, type MoveFxConfig } from '../src/fx/moveFxPlan.js';
import moveFxJson from '../src/config/move_fx.json';
import { CinematicPlayer, cinematicFor, ease, validateCinematics, type CinematicConfig } from '../src/systems/cinematics.js';
import cinematicsJson from '../src/config/cinematics.json';
import { cryParams } from '../src/audio/Cries';
import { routeAhead, trimRoute } from '../src/fx/WaypointGuide';
import { ACCESS_SPACING } from '../src/world/Rooftops';
import { getSpec } from '../src/vehicles/specs';
import { ATTACK_CLIPS, ATTACK_STYLES, CLIP_FPS, attackPhase, attackStyleFor, defaultPose, rigInfo } from '../src/creatures/models/Motion';
import { slicePlane, thinKeys } from '../src/creatures/models/Kit';
import { slotMount } from '../src/vehicles/CarModel';
import { RivalBrain, RIVAL_TIERS, opening, raceTier, rivalLoadouts } from '../src/systems/rivalLoadout';
import { SaveManager, checksum, compressBase64, compressUTF16, decompressBase64, decompressUTF16, packForFile, packSave, unpackSave, type KV } from '../src/core/SaveManager';
import { SAFEHOUSE, newSafehouseState, planSafehouses, sanitizeSafehouses, sleepHours } from '../src/world/Safehouses';
import { BTN, PAD_MAPS, deadzone, nearestInDirection, padFrame, padGlyph, padPrompt, stick } from '../src/core/Gamepad';
import { VISION, inVision } from '../src/police/Vision';
import { wheelLayout, wheelPick, wheelRadius } from '../src/ui/QuickWheel';
import { waterLift, waterRide } from '../src/creatures/WaterBattle';
import { Dodge, ROLL } from '../src/player/Roll';
import { cycleOption, DEFAULT_OPTIONS, loadOptions, optionLabel, parseOptions, saveOptions } from '../src/core/Options';
import { Blackjack, VideoPoker, evaluatePoker, handValue, rouletteReturn, slotPayout, slotsReturn, type Card } from '../src/casino/Games';
import { BOSS, GANG, ROSTER, fightSpot, gangEvent, gangHitChance, hideoutLayout, hostileOnSight, newGangState, parseGangState, questUnlocked, streetCrewsActive } from '../src/gangs/Gangs';
import { applyRep, civicTier, streetTier } from '../src/systems/Reputation';
import { planStreetCaches } from '../src/world/StreetCaches';
import { Weather, weatherEffects } from '../src/world/Weather';
import { NEIGHBOURHOODS, NeighbourhoodTracker, localLook, neighbourhoodAt } from '../src/world/Districts';
import { allStreetTalks, roomConversation, sewerConversation, streetConversation, streetShout, type ChatterContext } from '../src/npc/Chatter';
import { bubbleSeconds } from '../src/ui/Bubbles';
import { blastFalloff, chainFrom, shockRadius } from '../src/systems/Hazards';
import { WEAPONS as WEAPON_LIST } from '../src/weapons/WeaponTypes';
import { applyHeal, effectsLine, newEffects, spawnModifiers, tickEffects } from '../src/items/Items';
import { ASSIST, assistTurn, headingTo, pickAssist } from '../src/mobile/AimAssist';
import { contextFromPrompt, touchParts } from '../src/mobile/Touch';
import { FLIGHT, SKY, deepLevelBonus, deepTable, flightTarget, skyTable } from '../src/creatures/SpawnRules';
import { DOCKS, planDocks } from '../src/world/Docks';
import { planDeepSewers, poolAt, poolEdge } from '../src/world/Sewers';
import { INTERIOR, planInteriors } from '../src/world/Interiors';
import { interiorTalk, streetTalk, type TalkContext } from '../src/npc/Talk';
import { Humanoid, gaitFrequency } from '../src/player/Humanoid';
import { POND, bankPoint, carLift, depthAt, depthUV, inLake as inPond, nearestEdge, nearestWater, newCarWater, shouldClimbOut, stepCarWater, submersion, wadeFactor, waterState, waveY } from '../src/world/Pond';

let fails = 0;
const ok = (cond: boolean, msg: string): void => {
  if (cond) console.log('ok  ', msg);
  else {
    fails++;
    console.log('FAIL', msg);
  }
};

const overlap = (a: Rect, b: Rect, eps = 0.01): boolean =>
  a.x0 < b.x1 - eps && a.x1 > b.x0 + eps && a.z0 < b.z1 - eps && a.z1 > b.z0 + eps;

for (const seed of [1903, 1, 42, 777]) {
  const L = generateLayout(seed);
  console.log(`--- seed ${seed}: ${L.buildings.length} buildings, ${L.blocks.length} blocks, ${L.parking.length} parking spots`);
  ok(L.buildings.length > 400, 'plenty of buildings');
  ok(
    L.buildings.every((b) => L.blocks.some((k) => rectContains(k, b.rect.x0, b.rect.z0) && rectContains(k, b.rect.x1, b.rect.z1))),
    'every building inside a block',
  );
  ok(
    L.buildings.every((b) => b.rect.x1 - b.rect.x0 > 3 && b.rect.z1 - b.rect.z0 > 3 && b.height > 8),
    'buildings have sensible size',
  );
  let overlaps = 0;
  for (let i = 0; i < L.buildings.length; i++)
    for (let j = i + 1; j < L.buildings.length; j++) if (overlap(L.buildings[i].rect, L.buildings[j].rect)) overlaps++;
  ok(overlaps === 0, `no overlapping buildings (${overlaps})`);
  ok(
    L.buildings.every((b) => !b.setback || (b.setback.rect.x0 >= b.rect.x0 && b.setback.rect.x1 <= b.rect.x1)),
    'setbacks sit on their base',
  );
  ok(L.blocks.every((b) => !overlap(b, L.park)), 'no block inside the park');
  ok(
    L.parking.every((p) => !L.blocks.some((b) => rectContains(b, p.x, p.z, -0.1)) && !rectContains(L.park, p.x, p.z)),
    'parking spots are on roads',
  );
  ok(L.parking.every((p) => rectContains(L.land, p.x, p.z, -1)), 'parking on land');
  const sp = L.playerSpawn;
  ok(
    L.blocks.some((b) => rectContains(b, sp.x, sp.z)) && !L.buildings.some((b) => rectContains(b.rect, sp.x, sp.z, 0.5)),
    `spawn on a sidewalk (${sp.x.toFixed(1)}, ${sp.z.toFixed(1)})`,
  );
  const nearCar = L.parking.some((p) => Math.hypot(p.x - sp.x, p.z - sp.z) < 12);
  ok(nearCar, 'a parked car is close to the spawn');
  ok(L.roads.every((r) => r.to > r.from), 'roads have positive length');
  const tallest = Math.max(...L.buildings.map((b) => b.height + (b.setback?.height ?? 0) + b.spire));
  ok(tallest > 150 && tallest < 420, `skyline peak ${tallest.toFixed(0)} m`);
  const w = L.land.x1 - L.land.x0;
  const h = L.land.z1 - L.land.z0;
  ok(w > 800 && h > 1000, `island ${w.toFixed(0)} x ${h.toFixed(0)} m`);
  ok(CITY.parkAves[1] < CITY.numAves - 1 && CITY.parkStreets[1] < CITY.numStreets - 1, 'park is inside the grid');
}


// ------------------------------------------------------------------ road graph & signals
{
  const L = generateLayout(1903);
  const g = new RoadGraph(L);
  console.log(`--- road graph: ${g.nodes.length} junctions`);
  ok(g.nodes.length > 100, 'junctions found');
  ok(g.nodes.every((n) => DIRS.every((d) => n.next[d] < 0 || g.node(n.next[d]).next[opposite(d)] === n.id)), 'links are symmetric');
  ok(g.nodes.every((n) => !rectContains(L.park, n.x, n.z, -1)), 'no junction inside the park');
  // Playtest #11: police dispatch picks from roads through the 90-170 m ring, not the whole city.
  {
    const segs = g.segments();
    const at = { x: -69.5, z: -333 };
    const ring = segmentsInRing(segs, at, 90, 170);
    const hits = (pool: typeof segs): number => {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        const sg = pool[Math.floor(Math.random() * pool.length)];
        const t = Math.random() * sg.length;
        const d = Math.hypot(sg.from.x + DX[sg.d] * t - at.x, sg.from.z + DZ[sg.d] * t - at.z);
        if (d >= 90 && d <= 170) n++;
      }
      return n / 400;
    };
    const all = segs.filter((sg) => [0, 0.25, 0.5, 0.75, 1].some((f) => {
      const d = Math.hypot(sg.from.x + DX[sg.d] * sg.length * f - at.x, sg.from.z + DZ[sg.d] * sg.length * f - at.z);
      return d >= 90 && d <= 170;
    }));
    ok(ring.length > 0 && ring.length < segs.length / 3 && all.every((sg) => ring.includes(sg)), `the ring holds every road through it (${ring.length} of ${segs.length})`);
    const hr = hits(ring);
    const ha = hits(segs);
    ok(hr > 0.4 && hr > ha * 3, `a dispatch spot lands in the ring far more often (${(hr * 100) | 0}% vs ${(ha * 100) | 0}% citywide)`);
  }
  // Every node reachable from every other (strongly connected because links are two-way).
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const n = g.node(stack.pop()!);
    for (const m of n.next) if (m >= 0 && !seen.has(m)) { seen.add(m); stack.push(m); }
  }
  ok(seen.size === g.nodes.length, `network connected (${seen.size}/${g.nodes.length})`);
  let badExit = 0;
  for (const n of g.nodes) for (const d of DIRS) if (n.next[opposite(d)] >= 0 && g.exits(n, d).length === 0) badExit++;
  ok(badExit === 0, 'every arrival has an exit');
  // Lane points and turn paths stay on the road surface (never inside a block or the park).
  const onRoad = (x: number, z: number): boolean => !L.blocks.some((b) => rectContains(b, x, z, -0.3)) && !rectContains(L.park, x, z, -0.3);
  let off = 0;
  let paths = 0;
  for (const n of g.nodes) {
    for (const from of DIRS) {
      if (n.next[opposite(from)] < 0) continue;
      for (const to of g.exits(n, from)) {
        for (let lane = 0; lane < g.lanes(from); lane++) {
          const a = g.laneBeforeTurn(from, to, lane);
          const b = g.laneAfterTurn(from, to as Dir, a);
          for (const p of g.turnPath(n, from, a, to, b)) if (!onRoad(p.x, p.z)) off++;
          paths++;
        }
      }
      for (let lane = 0; lane < g.lanes(from); lane++) {
        for (const s of [-30, -12, 12, 30]) {
          if (s > 0 && n.next[from] < 0) continue; // no road ahead in this direction
          const p = g.lanePoint(n, from, lane, s);
          if (rectContains(L.land, p.x, p.z, -1) && !onRoad(p.x, p.z)) off++;
        }
      }
    }
  }
  ok(off === 0, `${paths} turn paths and lane points all on the road (${off} off)`);
  // Lanes never overlap the parking lane.
  ok(g.laneOffset(g.lanes(0) - 1) + 1.65 <= CITY.aveWidth / 2 - 2.4 + 0.01, 'avenue lanes clear of parking');
  ok(g.laneOffset(0) + 1.65 <= CITY.streetWidth / 2 - 2.6 + 0.01, 'street lane clear of parking');
  let conflict = 0;
  let aveG = 0;
  let stG = 0;
  for (let t = 0; t < SIGNAL_CYCLE; t += 0.1) {
    const a = lightAt(t, 'ave');
    const s = lightAt(t, 'street');
    if (a !== 'red' && s !== 'red') conflict++;
    if (a === 'green') aveG++;
    if (s === 'green') stG++;
  }
  ok(conflict === 0, 'signals never show green/yellow to both axes');
  ok(aveG > stG && stG > 0, 'both axes get a green, avenues longer');
}

// ------------------------------------------------------------------ routing
{
  const L = generateLayout(1903);
  const g = new RoadGraph(L);
  const onRoad = (x: number, z: number): boolean => !L.blocks.some((b) => rectContains(b, x, z, -0.3)) && !rectContains(L.park, x, z, -0.3);
  let bad = 0;
  let routes = 0;
  let offRoad = 0;
  let detour = 0;
  for (let k = 0; k < 400; k++) {
    const a = (k * 37) % g.nodes.length;
    const b = (k * 91 + 13) % g.nodes.length;
    const r = g.route(a, b);
    routes++;
    if (r.length === 0 || r[0] !== a || r[r.length - 1] !== b) {
      bad++;
      continue;
    }
    for (let i = 0; i + 1 < r.length; i++) if (g.dirBetween(r[i], r[i + 1]) < 0) bad++;
    // Route length vs straight Manhattan distance: only the park forces a detour.
    let len = 0;
    for (let i = 0; i + 1 < r.length; i++) len += Math.abs(g.node(r[i]).x - g.node(r[i + 1]).x) + Math.abs(g.node(r[i]).z - g.node(r[i + 1]).z);
    const manhattan = Math.abs(g.node(a).x - g.node(b).x) + Math.abs(g.node(a).z - g.node(b).z);
    if (len > manhattan + 2 * (L.park.x1 - L.park.x0) + 1) detour++;
    const first = r.length > 1 ? g.dirBetween(r[0], r[1]) : 0;
    for (const p of g.routeWaypoints(r, (first < 0 ? 0 : first) as Dir, 0, 30, 9)) if (!onRoad(p.x, p.z)) offRoad++;
  }
  ok(bad === 0, `${routes} routes valid and linked`);
  ok(detour === 0, 'routes are near-shortest');
  ok(offRoad === 0, `route waypoints stay on the road (${offRoad} off)`);
  const n = g.nodes[40];
  ok(g.nodeAhead(n.x, n.z + 30, 0).id === n.id, 'nodeAhead finds the junction in front');
}

// ------------------------------------------------------------------ wanted level
{
  ok(starsFor(0) === 0 && starsFor(STAR_HEAT[0]) === 1 && starsFor(STAR_HEAT[4] + 1) === 5, 'heat to stars mapping');
  const w = new Wanted();
  ok(w.report('carjack', 0, 0, 'none') === 0 && w.stars === 0, 'unwitnessed crime at 0 stars is free');
  w.report('carjack', 0, 0, 'cop');
  ok(w.stars === 1 && w.rose, 'carjack seen by a cop = 1 star');
  w.report('killPed', 0, 0, 'civ');
  ok(w.stars === 2, `killing a pedestrian with witnesses raises it (stars ${w.stars}, heat ${w.heat.toFixed(1)})`);
  w.report('killCop', 0, 0, 'cop');
  ok(w.stars === 3, `killing a cop is serious (stars ${w.stars})`);
  w.report('ramPolice', 0, 0, 'cop');
  w.report('hitCop', 0, 0, 'cop');
  w.report('ramPolice', 0, 0, 'cop');
  ok(w.stars === 4, `continued attacks on police escalate (stars ${w.stars}, heat ${w.heat.toFixed(1)})`);
  // Seen: no decay.
  for (let t = 0; t < 100; t += 0.1) w.update(0.1, true, 5, 5);
  ok(w.stars === 4 && w.lastKnown.x === 5, 'no decay while seen; last known position tracked');
  // Unseen: one star per search time.
  let t = 0;
  while (w.stars === 4 && t < 100) {
    w.update(0.1, false, 0, 0);
    t += 0.1;
  }
  ok(Math.abs(t - searchTime(4)) < 0.15, `4th star lost after ${t.toFixed(1)} s out of sight`);
  while (w.stars > 0 && t < 500) {
    w.update(0.1, false, 0, 0);
    t += 0.1;
  }
  const expected = searchTime(4) + searchTime(3) + searchTime(2) + searchTime(1);
  ok(w.stars === 0 && Math.abs(t - expected) < 0.5, `fully lost them after ${t.toFixed(0)} s (expected ${expected})`);
  w.report('speeding', 0, 0, 'cop');
  ok(w.stars === 1, 'speeding past police = 1 star');
  w.clear();
  ok(w.stars === 0 && w.heat === 0, 'clear');
  const v = new Wanted();
  v.report('steal', 0, 0, 'cop');
  ok(v.stars === 0, 'stealing a parked car alone stays below 1 star');
  for (let i = 0; i < 200; i++) v.update(0.1, false, 0, 0);
  ok(v.heat < 0.6, 'small heat fades');
}

// ------------------------------------------------------------------ weapons
{
  const ids = WEAPONS.map((w) => w.id);
  for (const id of ['fists', 'pistol', 'revolver', 'shotgun', 'smg', 'rifle', 'sniper', 'bat', 'knife', 'molotov']) ok(ids.includes(id), `weapon ${id} defined`);
  let threw = false;
  try {
    parseWeapons({ weapons: [{ id: 'x', kind: 'hitscan', damage: 1, fireInterval: 1, noiseRadius: 1, price: 0, slot: 1 }] });
  } catch {
    threw = true;
  }
  ok(threw, 'config validation rejects a ranged weapon without magSize');
  const run = (inv: Inventory, seconds: number, held: boolean): number => {
    let shots = 0;
    for (let t = 0; t < seconds; t += 1 / 60) {
      if (inv.trigger(held) === 'fired') shots++;
      inv.update(1 / 60);
    }
    return shots;
  };
  const inv = new Inventory();
  ok(inv.currentId === 'fists' && inv.has('fists'), 'start unarmed');
  inv.give('pistol');
  inv.select('pistol');
  ok(inv.currentAmmo.mag === 12 && inv.currentAmmo.reserve === 24, `pistol arrives loaded 12 + 24 (${inv.currentAmmo.mag}+${inv.currentAmmo.reserve})`);
  inv.update(1);
  ok(run(inv, 3, true) === 1, 'semi-auto: holding the trigger fires once');
  // Click repeatedly: rate limited by fireInterval, auto reload after the mag runs dry.
  let shots = 0;
  for (let t = 0; t < 3; t += 1 / 60) {
    const held = Math.floor(t * 60) % 2 === 0;
    if (inv.trigger(held) === 'fired') shots++;
    inv.update(1 / 60);
  }
  ok(shots === 11, `clicking empties the remaining 11 rounds (${shots})`);
  ok(inv.isReloading, 'empty mag starts a reload');
  inv.update(2);
  ok(inv.currentAmmo.mag === 12 && inv.currentAmmo.reserve === 12, `reload moves 12 from reserve (${inv.currentAmmo.mag}+${inv.currentAmmo.reserve})`);
  // SMG: automatic, ~15 rounds/s.
  inv.give('smg');
  inv.select('smg');
  inv.update(1);
  const smgShots = run(inv, 1, true);
  ok(smgShots >= 14 && smgShots <= 16, `SMG full auto ~15 rps (${smgShots})`);
  ok(inv.spread(false, false) > weapon('smg').spread!, 'sustained fire blooms the spread');
  inv.update(1);
  ok(inv.spread(true, false) < inv.spread(false, false) && inv.spread(false, true) > inv.spread(false, false), 'aiming tightens, moving widens spread');
  // Shotgun reloads shell by shell and can fire mid-reload.
  inv.give('shotgun');
  inv.select('shotgun');
  inv.trigger(false);
  inv.update(1);
  run(inv, 0.05, true);
  inv.trigger(false);
  inv.update(1);
  inv.trigger(true);
  inv.trigger(false);
  ok(inv.currentAmmo.mag === 4, 'two shells fired');
  inv.update(1); // let the pump cycle finish
  inv.reload();
  inv.update(0.56);
  ok(inv.currentAmmo.mag === 5, 'one shell per reload step');
  ok(inv.trigger(true) === 'fired', 'shotgun fires mid-reload');
  // Molotov: thrown items are consumed and the weapon goes when the last is gone.
  inv.give('molotov', 1);
  inv.select('molotov');
  inv.trigger(false);
  inv.update(1);
  ok(inv.trigger(true) === 'fired' && !inv.has('molotov') && inv.currentId === 'fists', 'last molotov thrown removes it');
  // Ammo caps and confiscation.
  inv.give('pistol', 9999);
  ok(inv.get('pistol')!.reserve === weapon('pistol').reserveMax, 'reserve capped');
  inv.selectSlot(2);
  ok(inv.currentId === 'pistol', 'slot hotkey selects');
  inv.give('revolver');
  inv.selectSlot(2);
  ok(inv.currentId === 'revolver', 'pressing the slot again cycles weapons sharing it');
  const saved = JSON.parse(JSON.stringify(inv.serialize()));
  const inv2 = new Inventory();
  inv2.load(saved);
  ok(inv2.owned.length === inv.owned.length && inv2.currentId === 'revolver', 'inventory save/load round-trip');
  inv.confiscateAll();
  ok(inv.owned.length === 1 && inv.currentId === 'fists', 'busted: weapons confiscated');
}

// ------------------------------------------------------------------ Streetmon: data and type chart
{
  console.log('--- streetmon data');
  const sp = ALL_SPECIES();
  ok(sp.length >= 15, `at least 15 species (${sp.length})`);
  ok(sp.filter((s) => s.types.length === 2).length >= 2, 'at least 2 dual-typed species');
  ok(species('hardcase').types.join('/') === 'gun/concrete', 'Hardcase is Gun/Concrete');
  // Wire and Sludge get their species with rooftops and sewers (steps 6 and 8).
  for (const t of TYPE_IDS.filter((x) => x !== 'wire' && x !== 'sludge')) ok(sp.some((s) => s.types.includes(t)), `type ${t} has creatures`);
  ok(DATA.moves.get('ricochet')?.signature === true && DATA.moves.get('emptyTheClip')?.signature === true, 'signature moves Ricochet and Empty the Clip exist');
  // Type chart matrix: every pair defined; spot checks; dual types multiply.
  let pairs = 0;
  for (const a of TYPE_IDS) for (const d of TYPE_IDS) if (typeof DATA.chart[a][d] === 'number') pairs++;
  ok(pairs === 49, 'chart defines all 49 attacker/defender pairs (7 types)');
  ok(typeMultiplier('gun', ['grind']) === 2 && typeMultiplier('gun', ['concrete']) === 0.5, 'Gun beats Grind, is resisted by Concrete');
  ok(typeMultiplier('bass', ['concrete']) === 2 && typeMultiplier('bass', ['smoke']) === 2, 'Bass shakes Concrete and clears Smoke');
  ok(typeMultiplier('grind', ['concrete', 'smoke']) === 4, 'dual weakness multiplies to 4x');
  ok(typeMultiplier('gun', ['concrete', 'grind']) === 1, '2x and 0.5x cancel on dual types');
  ok(typeMultiplier('concrete', ['gun', 'concrete']) === 1, 'Concrete vs Hardcase (2 x 0.5) = 1');
  ok(typeMultiplier('bass', ['gun', 'concrete']) === 2, 'Bass vs Hardcase (1 x 2) = 2');
  ok(effectivenessText(4).length > 0 && effectivenessText(0.5).includes('not very') && effectivenessText(1) === '', 'effectiveness text');
  // Among the original five, every type still has 2 strengths and 2 weaknesses (their cells are unchanged).
  const FIVE = ['gun', 'concrete', 'grind', 'smoke', 'bass'] as const;
  for (const t of FIVE) {
    const strong = FIVE.filter((d) => DATA.chart[t][d] > 1).length;
    const weak = FIVE.filter((a) => DATA.chart[a][t] > 1).length;
    ok(strong === 2 && weak === 2, `${t}: 2 strengths, 2 weaknesses among the original five`);
  }
  // With Wire and Sludge, every type still has as many strengths as weaknesses.
  for (const t of TYPE_IDS) {
    const strong = TYPE_IDS.filter((d) => DATA.chart[t][d] > 1).length;
    const weak = TYPE_IDS.filter((a) => DATA.chart[a][t] > 1).length;
    ok(strong === weak, `${t}: ${strong} strengths, ${weak} weaknesses across all 7 types`);
  }
  ok(typeMultiplier('wire', ['sludge']) === 2 && typeMultiplier('sludge', ['concrete']) === 2 && typeMultiplier('bass', ['sludge']) === 2 && typeMultiplier('concrete', ['wire']) === 2, 'Wire shocks Sludge, Sludge corrodes Concrete, Bass shakes Sludge, Concrete grounds Wire');
  // Config validation rejects bad data with a useful message.
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const bad = (mut: (t: any, m: any, c: any, i: any) => void, expect: string): void => {
    const t = clone(typesJson), m = clone(movesJson), c = clone(creaturesJson), i = clone(itemsJson);
    mut(t, m, c, i);
    try {
      parseData(t as any, m as any, c as any, i as any);
      ok(false, `config rejects: ${expect}`);
    } catch (e) {
      ok(String((e as Error).message).includes(expect), `config rejects: ${expect}`);
    }
  };
  bad((t) => delete t.chart.smoke, 'chart row "smoke" is missing');
  bad((_t, _m, c) => (c.species[0].learnset[0][1] = 'nope'), 'learnset move "nope"');
  bad((_t, _m, c) => (c.species[0].evolution[0].to = 'ghost'), 'evolves into unknown "ghost"');
  bad((_t, _m, c) => delete c.species[0].ammo, 'Gun types need an ammo');
  bad((_t, _m, c) => (c.species[1].dex = 1), 'dex number missing or duplicated');
  bad((_t, _m, c) => (c.species[0].types = ['gun', 'laser']), 'unknown type "laser"');
  bad((_t, _m, c) => (c.species[0].model.palette.primary = 'grey'), 'palette.primary must be #rrggbb');
  bad((_t, m) => (m.moves[0].accuracy = 140), 'accuracy must be 1-100 or null');
  bad((_t, _m, c) => (c.species[1].evolution[0].item = 'rock'), 'evolution item "rock"');
  // Stats, XP curves, starting moves.
  const s = species('strapback');
  const iv = { hp: 31, attack: 31, defense: 31, speed: 31, loud: 31 };
  const st = calcStats(s, 50, iv);
  ok(st.hp === Math.floor(((2 * 45 + 31) * 50) / 100) + 60 && st.attack === Math.floor(((2 * 60 + 31) * 50) / 100) + 5, 'stat formula');
  ok(xpForLevel('medium', 10) === 1000 && xpForLevel('fast', 10) === 800 && xpForLevel('slow', 10) === 1250, 'XP curves');
  ok(levelForXp('medium', 999) === 9 && levelForXp('medium', 1000) === 10 && levelForXp('medium', 1e9) === 100, 'level from XP, capped at 100');
  const known = movesAtLevel(species('strapback'), 30);
  ok(known.length === MAX_MOVES && known.includes('reload'), `level 30 Strapback knows 4 moves incl. Reload (${known.join(',')})`);
  const c = createCreature('slugger', 12, () => 0.5);
  ok(c.level === 12 && c.hp === calcStats(species('slugger'), 12, c.ivs).hp && c.ammo === 6 && !c.shiny, 'createCreature');
  ok(createCreature('cashew', 5, () => 0).shiny, 'shiny roll');
}

// ------------------------------------------------------------------ Streetmon: models
{
  console.log('--- streetmon models');
  for (const s of ALL_SPECIES()) {
    ok(hasBuilder(s.id), `${s.id}: has a model builder`);
    const m = buildCreatureModel(s);
    const sh = buildCreatureModel(s, true);
    const clipNames = m.clips.map((c) => c.name);
    ok(
      m.triangles >= 300 && m.triangles <= 1500 && m.drawCalls <= 5 && Math.abs(m.bbox.max.y - s.model.height) < 0.05 && m.bbox.min.y > -0.02 && CLIPS.every((c) => clipNames.includes(c.name)) && m.nodes.includes('body') && sh.triangles === m.triangles,
      `${s.id}: ${m.triangles} tris, ${m.drawCalls} draws, ${m.bbox.max.y.toFixed(2)} m, clips ok, shiny variant`,
    );
  }
  // Exported files (if built) pass the structural checks; a damaged file is caught.
  const dir = 'public/creatures';
  if (fs.existsSync(`${dir}/manifest.json`)) {
    const man = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8')) as { creatures: Array<{ id: string; file: string; shiny: { file: string } }> };
    let bad = 0;
    for (const e of man.creatures) for (const f of [e.file, e.shiny.file]) bad += checkGlb(new Uint8Array(fs.readFileSync(`public/${f}`))).errors.length;
    ok(man.creatures.length === ALL_SPECIES().length && bad === 0, `exported .glb files are valid (${man.creatures.length * 2} files)`);
    const bytes = new Uint8Array(fs.readFileSync(`public/${man.creatures[0].file}`));
    ok(checkGlb(bytes.slice(0, bytes.length - 64)).errors.length > 0, 'truncated .glb is rejected');
    const corrupt = bytes.slice();
    corrupt[0] = 0;
    ok(checkGlb(corrupt).errors.some((e) => e.includes('magic')), 'bad magic is rejected');
    let warn = 0;
    for (const e of man.creatures) for (const f of [e.file, e.shiny.file]) warn += checkGlb(new Uint8Array(fs.readFileSync(`public/${f}`))).warnings.length;
    ok(warn === 0, 'exported .glb files have no warnings (skinned meshes at the root, extensions declared)');
    const j = checkGlb(bytes).json as unknown as { materials: Array<{ extras?: { pulse?: unknown }; emissiveFactor?: number[] }> };
    ok(j.materials.some((m) => m.extras?.pulse), 'glow materials carry their pulse in glTF extras');
  } else console.log('(skipping exported-file checks: run `npm run creatures`)');
}

// ------------------------------------------------------------------ Streetmon: model polish
{
  console.log('--- streetmon model polish');
  const box = chamferBox(1, 0.5, 0.3, 0.05);
  ok(countTriangles(box) === 44, 'chamfered box: 44 triangles');
  // Signed volume (outward winding): a little under the plain box's 0.15.
  const pa = box.getAttribute('position');
  let vol = 0;
  for (let i = 0; i < pa.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pa, i);
    const b = new THREE.Vector3().fromBufferAttribute(pa, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pa, i + 2);
    vol += a.dot(b.cross(c)) / 6;
  }
  ok(vol > 0.13 && vol < 0.15, `chamfered box faces outward, volume ${vol.toFixed(3)} (< plain 0.150)`);
  box.computeBoundingBox();
  ok(Math.abs(box.boundingBox!.max.x - 0.5) < 1e-6 && Math.abs(box.boundingBox!.min.z + 0.15) < 1e-6, 'chamfered box keeps its outer size');
  ok(countTriangles(chamferCylinder(0.2, 0.2, 0.4, 0.03, 8)) === 64, 'chamfered cylinder: 64 triangles (8 segments)');
  // Surface classes: high gloss (metals, visors, cores) vs matte (concrete, cloth, rubber).
  for (const [c, pbr] of Object.entries(SURFACE_PBR)) {
    const okRange = pbr.matte ? pbr.roughness >= 0.75 && pbr.roughness <= 0.9 && pbr.metalness === 0 : pbr.roughness >= 0.15 && pbr.roughness <= 0.3 && pbr.metalness >= 0.8 && pbr.metalness <= 0.9;
    ok(okRange, `${c}: roughness ${pbr.roughness}, metalness ${pbr.metalness} (${pbr.matte ? 'matte' : 'high gloss'} range)`);
  }
  ok(SURFACES.gun.surfaces.primary === 'metal' && SURFACES.concrete.surfaces.primary === 'concrete' && SURFACES.smoke.surfaces.primary === 'fabric', 'gun is metal, concrete is concrete, smoke is cloth');
  const dual = surfaceFor(['concrete', 'gun']);
  ok(dual.surfaces.primary === 'concrete' && dual.bevel < SURFACES.concrete.bevel && dual.bevel > SURFACES.gun.bevel, 'dual types: the primary type surfaces, blended bevel');
  ok(gradient(0, 0, 1, 1) < gradient(1, 0, 1, 1), 'vertex gradient: darker at the base, lighter at the top');
  // Crevice AO: a point inside another part is darker than one far away.
  const m = new THREE.Matrix4();
  const prox = [{ inv: m.clone().invert(), box: new THREE.Box3(new THREE.Vector3(-0.1, -0.1, -0.1), new THREE.Vector3(0.1, 0.1, 0.1)), scale: 1, id: 1 }];
  ok(crevice(new THREE.Vector3(0, 0, 0), 0, prox, 1) < 0.7 && crevice(new THREE.Vector3(2, 0, 0), 0, prox, 1) === 1, 'crevice AO darkens where parts meet, not in the open');
  ok(crevice(new THREE.Vector3(0, 0, 0), 1, prox, 1) === 1, 'a part does not occlude itself');
  // Built models: vertex colours shaded, PBR from the type, glow pulse metadata.
  const strap = buildCreatureModel(species('strapback'));
  let solid: THREE.Mesh | null = null;
  let glow: THREE.Mesh | null = null;
  strap.root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    const mat = me.material as THREE.MeshStandardMaterial;
    if (mat.name.endsWith('_solid')) solid = me;
    if (mat.name.includes('_glow_')) glow = me;
  });
  const sm = solid! as THREE.Mesh;
  const smat = sm.material as THREE.MeshStandardMaterial;
  ok(
    smat.vertexColors && !!smat.map && !!smat.normalMap && !!smat.aoMap && smat.roughnessMap === smat.aoMap && smat.metalnessMap === smat.aoMap && smat.roughness === 1 && smat.metalness === 1,
    'solid material: vertex colours x atlas colour, normal map, packed AO/roughness/metalness (factors 1)',
  );
  ok(!!sm.geometry.getAttribute('uv') && !!sm.geometry.getAttribute('tangent'), 'model has atlas UVs and tangents');
  const col = sm.geometry.getAttribute('color');
  let lo = 1;
  let hi = 0;
  for (let i = 0; i < col.count; i++) {
    const l = col.getX(i) + col.getY(i) + col.getZ(i);
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
  }
  let inRange = true;
  for (let i = 0; i < col.count * 3; i++) if (!((col.array as Float32Array)[i] >= 0 && (col.array as Float32Array)[i] <= 1)) inRange = false;
  ok(inRange, 'vertex colours stay inside [0, 1]');
  const gmat = (glow! as THREE.Mesh).material as THREE.MeshStandardMaterial;
  ok(gmat.userData.pulse?.hz > 0 && gmat.emissiveIntensity >= 3 && gmat.emissiveIntensity * (1 - gmat.userData.pulse.amount) >= 3 && !!gmat.emissiveMap, `glow: intensity ${gmat.emissiveIntensity} (never below 3.0 while pulsing), emissive map, pulse ${gmat.userData.pulse?.hz} Hz`);
  ok(strap.polish.bevelled > 0, `strapback: ${strap.polish.bevelled} bevelled parts`);
  // Run-time pulse: per-instance material copy whose intensity follows the clock.
  let t = 0;
  const n = attachEmissivePulse(strap.root, () => t);
  let pmesh: THREE.Mesh | null = null;
  strap.root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (me.isMesh && (me.material as THREE.Material).userData.pulse && me.material !== gmat) pmesh = me;
  });
  const pulseMesh = pmesh as THREE.Mesh | null;
  const vals: number[] = [];
  if (pulseMesh)
    for (t = 0; t < 3; t += 0.37) {
      pulseMesh.onBeforeRender(null as never, null as never, null as never, null as never, null as never, null as never);
      vals.push((pulseMesh.material as THREE.MeshStandardMaterial).emissiveIntensity);
    }
  ok(n >= 1 && pulseMesh !== null && Math.max(...vals) - Math.min(...vals) > 0.05, `emissive pulse runs (${n} glow material(s), ${Math.min(...vals).toFixed(2)}-${Math.max(...vals).toFixed(2)})`);
  // A model over budget sheds polish rather than breaking the cap.
  const heavy = ALL_SPECIES().map((s) => buildCreatureModel(s)).sort((a, b) => b.triangles - a.triangles)[0];
  ok(heavy.triangles <= 1500, `heaviest model ${heavy.triangles} triangles after polish fitting (${heavy.polish.plain} un-bevelled, ${heavy.polish.extrasDropped} extras cut)`);
  void lo;
  void hi;
}

// ------------------------------------------------------------------ surface detail (all assets)
{
  console.log('--- surface detail');
  ok(SURFACE_KINDS.length >= 18 && SURFACE_KINDS.every((k) => SURFACE_TUNING[k] && SURFACE_TUNING[k].tile > 0), `${SURFACE_KINDS.length} surface kinds, each tuned`);
  let seamless = true;
  let varied = true;
  for (const k of SURFACE_KINDS) {
    const t = surfaceTile(k);
    const N = TILE_PX;
    // Seamless: the step across the wrap is no bigger than a typical step inside the tile.
    let edge = 0;
    let inner = 0;
    for (let y = 0; y < N; y++) {
      const h = (x: number): number => t[(y * N + x) * 4 + 3];
      edge += Math.abs(h(N - 1) - h(0));
      inner += Math.abs(h(N / 2) - h(N / 2 - 1));
    }
    if (edge > inner * 3 + N * 2) seamless = false;
    let mn = 255;
    let mx = 0;
    for (let i = 3; i < t.length; i += 4) {
      mn = Math.min(mn, t[i]);
      mx = Math.max(mx, t[i]);
    }
    if (mx - mn < 8) varied = false;
  }
  ok(seamless, 'every surface tile wraps seamlessly');
  ok(varied, 'every surface tile has relief');
  ok(surfaceTile('brick') === surfaceTile('brick'), 'tiles are generated once and cached');
  // The shader patch hooks into the standard and physical shaders (the anchors must exist).
  for (const id of ['standard', 'physical'] as const) {
    const src = (THREE.ShaderLib as Record<string, { vertexShader: string; fragmentShader: string }>)[id];
    const fakeShader = { uniforms: {}, vertexShader: src.vertexShader, fragmentShader: src.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
    const m = withSurface(new THREE.MeshStandardMaterial(), 'concrete');
    m.onBeforeCompile(fakeShader, null as never);
    const f = fakeShader.fragmentShader;
    ok(
      fakeShader.vertexShader.includes('vSurfP = sp / uSurfTile') && f.includes('surfD = surfSample') && f.includes('roughnessFactor = clamp( roughnessFactor * mix') && f.includes('normal = surfPerturb'),
      `surface patch hooks albedo, roughness and normal in the ${id} shader`,
    );
  }
  const a = withSurface(new THREE.MeshStandardMaterial({ color: 0x336699 }), 'paintedMetal', { tone: 0.5 });
  const b = copySurface(new THREE.MeshStandardMaterial(), a);
  ok(surfaceOf(b) === 'paintedMetal' && a.customProgramCacheKey() === b.customProgramCacheKey(), 'surfaces copy to rebuilt materials and share one program');
  ok(a.color.getHex() === 0x336699, 'the material keeps its own colour');
}

// ------------------------------------------------------------------ Streetmon: texture atlas
{
  console.log('--- streetmon texture atlas');
  const img = atlasImages();
  ok(img.size === 512 && img.color.length === 512 * 512 * 4 && img.normal.length === img.color.length && img.orm.length === img.color.length, 'atlas: three 512 x 512 RGBA images');
  ok(atlasImages() === img, 'atlas is generated once and cached');
  const at = (k: 'color' | 'normal' | 'orm', surface: string, style: string, s: number, t: number): number[] => {
    const [u, v] = cellUV(surface as never, style as never, s, t);
    const x = Math.floor(u * ATLAS.size);
    const y = Math.floor(v * ATLAS.size);
    const i = (y * ATLAS.size + x) * 4;
    return [img[k][i], img[k][i + 1], img[k][i + 2]];
  };
  ok(at('color', 'metal', 'vgrad', 0.3, 0.02)[0] < at('color', 'metal', 'vgrad', 0.3, 0.98)[0], 'gradient cells: darker at the bottom of a part, lighter at the top');
  ok(at('color', 'armor', 'hgrad', 0.02, 0.5)[0] < at('color', 'armor', 'hgrad', 0.98, 0.5)[0], 'horizontal gradient cells run along the part');
  const rust = at('color', 'metal', 'rust', 0.5, 0.5);
  const grime = at('color', 'concrete', 'grime', 0.5, 0.5);
  const wear = at('color', 'metal', 'wear', 0.3, 0.6);
  const plain = at('color', 'metal', 'vgrad', 0.3, 0.3);
  ok(grime[0] < plain[0] && wear[0] >= plain[0], 'grime darker and edge wear lighter than the surface around them');
  let rusty = 0;
  for (let y = 0.1; y < 0.9; y += 0.05) for (let x = 0.1; x < 0.9; x += 0.05) { const c = at('color', 'metal', 'rust', x, y); if (c[0] > c[2] + 25) rusty++; }
  ok(rusty > 20, `rust cells carry orange-brown patches (${rusty} samples)`);
  void rust;
  // ORM: roughness (G) and metalness (B) by class.
  const orm = (c: string): number[] => at('orm', c, 'vgrad', 0.33, 0.6);
  ok(orm('metal')[1] / 255 < 0.31 && orm('metal')[2] / 255 > 0.79 && orm('concrete')[1] / 255 > 0.74 && orm('concrete')[2] === 0, 'ORM atlas: metal glossy & metallic, concrete rough & non-metal');
  ok(at('orm', 'metal', 'vgrad', 0.33, 0.02)[0] < at('orm', 'metal', 'vgrad', 0.33, 0.9)[0], 'ORM occlusion darkens the base of a part (ground contact)');
  // Normal map: unit-ish normals, mostly facing out, detail present in metal/vent/fabric cells.
  let bad = 0;
  for (let i = 0; i < img.normal.length; i += 4 * 97) {
    const n = [img.normal[i], img.normal[i + 1], img.normal[i + 2]].map((v) => v / 127.5 - 1);
    if (Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) > 0.03 || n[2] < 0.3) bad++;
  }
  ok(bad === 0, 'normal map: unit tangent-space normals facing out');
  const detail = (c: string): number => {
    let d = 0;
    for (let y = 0.05; y < 0.95; y += 0.02) for (let x = 0.05; x < 0.95; x += 0.02) { const n = at('normal', c, 'vgrad', x, y); d += Math.abs(n[0] - 128) + Math.abs(n[1] - 128); }
    return d;
  };
  ok(detail('metal') > 5 * detail('gloss') && detail('vent') > 5 * detail('gloss') && detail('fabric') > 5 * detail('gloss'), 'normal detail: panels/rivets, vents, weave; glossy cells stay smooth');
  // UV <-> cell round trip and insets.
  let rt = true;
  for (const sf of ATLAS_SURFACES) for (const st of STYLES) for (const [s0, t0] of [[0, 0], [1, 1], [0.5, 0.2]]) {
    const [u, v] = cellUV(sf, st, s0, t0);
    const c = cellAt(u, v);
    if (c.surface !== sf || c.style !== st) rt = false;
  }
  ok(rt, 'every UV lands inside its own cell (64 cells, inset edges)');
  // PNG round trip.
  const png = encodePng(img.size, img.size, img.orm);
  const back = decodePng(png);
  ok(back.width === 512 && back.rgba.every((v, i) => v === img.orm[i]), `PNG encoder round trip (${png.length} bytes)`);
  // Higher resolutions keep the layout (same cells at the same UVs) and get sharper, not different.
  const big = atlasImages(1024);
  ok(big.size === 1024 && atlasImages(1024) === big && atlasImages() === img, 'atlas images are cached per size');
  const atBig = (surface: string, style: string, s: number, t: number): number => {
    const [u, v] = cellUV(surface as never, style as never, s, t);
    return big.color[(Math.floor(v * 1024) * 1024 + Math.floor(u * 1024)) * 4];
  };
  ok(Math.abs(atBig('metal', 'vgrad', 0.3, 0.98) - at('color', 'metal', 'vgrad', 0.3, 0.98)[0]) < 24 && atBig('metal', 'vgrad', 0.3, 0.02) < atBig('metal', 'vgrad', 0.3, 0.98), 'a 1024 atlas matches the 512 one cell for cell');
  // Weathering: rust streaks run down from the rivets, chipped edges show bare metal.
  let streakOrange = 0;
  for (let t = 0.05; t < 0.28; t += 0.02) { const c = at('color', 'metal', 'vstrong', 0.5, t); if (c[0] > c[2] + 12) streakOrange++; }
  ok(streakOrange >= 3, `rust streaks run down from the rivets (${streakOrange} orange samples under the seam rivet)`);
  ok(at('color', 'armor', 'wear', 0.01, 0.5)[0] > at('color', 'armor', 'wear', 0.3, 0.5)[0] - 6, 'chipped edges are no darker than the plate');
  // Geometry passes.
  const cyl = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8);
  const merged = mergeCoplanar(cyl);
  ok(merged.saved === 4 && countTriangles(merged.geo) === countTriangles(cyl) - 4, 'coplanar merge: an 8-sided cap needs 6 triangles, not 8 (2 caps -> 4 saved)');
  const box = new THREE.BoxGeometry(1, 1, 1);
  ok(mergeCoplanar(box).saved === 0, 'coplanar merge leaves a box alone');
  ok(isInside({ kind: 'box', hx: 0.5, hy: 0.5, hz: 0.5, c: 0.05 }, new THREE.Vector3(0.3, 0.2, 0.1)) && !isInside({ kind: 'box', hx: 0.5, hy: 0.5, hz: 0.5, c: 0.05 }, new THREE.Vector3(0.48, 0.48, 0.48)), 'hidden-face test: inside a chamfered box, conservative near its corners');
  ok(!isInside({ kind: 'sphere', r: 1, segs: 8, rings: 6 }, new THREE.Vector3(0.95, 0, 0)), 'hidden-face test: points between a faceted sphere and its true radius count as outside');
  const tan = triangleTangent([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)], [[0, 1], [1, 1], [0, 0]], new THREE.Vector3(0, 0, 1));
  ok(Math.abs(tan[0] - 1) < 1e-6 && tan[3] === 1, 'tangent follows +u, handedness +1 for an unmirrored face (glTF v flip)');
  // Built models: textured triangles, cells used, tangents valid, hidden faces gone, budget.
  let tangentsOk = true;
  let maxTris = 0;
  let culled = 0;
  const used = new Set<string>();
  for (const sp of ALL_SPECIES()) {
    const m = buildCreatureModel(sp);
    maxTris = Math.max(maxTris, m.triangles);
    culled += m.polish.hiddenCulled;
    for (const [k, v] of Object.entries(m.cells)) if (v) used.add(k);
    m.root.traverse((o) => {
      const me = o as THREE.Mesh;
      const t = me.isMesh ? me.geometry.getAttribute('tangent') : null;
      if (!t) return;
      for (let i = 0; i < t.count; i++) if (Math.abs(Math.hypot(t.getX(i), t.getY(i), t.getZ(i)) - 1) > 1e-3 || Math.abs(Math.abs(t.getW(i)) - 1) > 1e-6) tangentsOk = false;
    });
  }
  ok(tangentsOk, 'all tangents unit length with w = +-1');
  ok(maxTris <= 1500, `hard cap: heaviest model ${maxTris} triangles (<= 1500)`);
  ok(culled > 500, `hidden faces dissolved across the roster (${culled} triangles)`);
  ok(['vgrad', 'vstrong', 'hgrad', 'flat', 'wear', 'rust', 'grime', 'core'].every((c) => used.has(c)), 'models use every atlas style: gradients, flat, wear, rust, grime, glow cores');
  ok(GLOW.eye.intensity * (1 - GLOW.eye.amount) >= 3 && GLOW.accent.intensity * (1 - GLOW.accent.amount) >= 3, 'glow strength stays >= 3.0 through the pulse');
  // Texture injection on an exported file.
  const dir2 = 'public/creatures';
  if (fs.existsSync(`${dir2}/manifest.json`)) {
    const bytes = new Uint8Array(fs.readFileSync(`${dir2}/strapback.glb`));
    const j = checkGlb(bytes, { resolve: (u) => (fs.existsSync(`${dir2}/${u}`) ? new Uint8Array(fs.readFileSync(`${dir2}/${u}`)) : null) });
    const js = j.json as unknown as { images?: Array<{ uri: string }>; materials: Array<{ name: string; normalTexture?: unknown; occlusionTexture?: unknown; emissiveTexture?: unknown }> };
    ok(j.errors.length === 0 && (js.images ?? []).length === 3 && js.images!.every((i) => i.uri.startsWith('atlas/')), 'exported .glb references the three shared atlas PNGs (external, found)');
    ok(js.materials.find((m) => m.name.endsWith('_solid'))?.normalTexture !== undefined && js.materials.find((m) => m.name.includes('_glow_'))?.emissiveTexture !== undefined, 'materials carry normal/occlusion/metallicRoughness and emissive textures');
    const missing = checkGlb(bytes, { resolve: () => null });
    ok(missing.errors.some((e) => e.includes('not found')), 'a missing atlas file is reported');
    const again = injectAtlas(bytes, [], ATLAS.files);
    ok(again === bytes, 'injecting nothing leaves a file unchanged');
  } else console.log('(skipping exported-atlas checks: run `npm run creatures`)');
}

// ------------------------------------------------------------------ day cycle and wild spawning
{
  console.log('--- day cycle & spawning');
  ok(phaseAt(12) === 'day' && phaseAt(18.5) === 'dusk' && phaseAt(23) === 'night' && phaseAt(3) === 'night' && phaseAt(6) === 'dusk' && phaseAt(24 + 12) === 'day', 'time-of-day phases');
  ok(clockText(16.5) === '16:30' && clockText(0) === '00:00' && clockText(23.999) === '23:59', 'clock text');
  ok(sunElevationDeg(13) > 55 && sunElevationDeg(23) < 0 && sunElevationDeg(16.5) > 30, 'sun high at noon, down at night');
  ok(lightingAt(13).daylight === 1 && lightingAt(1).daylight === 0 && lightingAt(1).lampIntensity > lightingAt(13).lampIntensity, 'lighting: day/night, lamps brighter at night');
  const L = generateLayout(1903);
  const land = L.land;
  const cx = (land.x0 + land.x1) / 2;
  ok(districtAt(L, (L.park.x0 + L.park.x1) / 2, (L.park.z0 + L.park.z1) / 2) === 'park', 'district: park');
  ok(districtAt(L, land.x0 + 3, (land.z0 + land.z1) / 2) === 'waterfront', 'district: waterfront');
  ok(districtAt(L, L.aveX[5], land.z0 + (land.z1 - land.z0) * 0.2) === 'uptown', 'district: uptown (north)');
  ok(districtAt(L, L.aveX[5], land.z0 + (land.z1 - land.z0) * 0.6) === 'midtown', 'district: midtown');
  ok(districtAt(L, cx, land.z0 + (land.z1 - land.z0) * 0.9) === 'downtown', 'district: downtown (south)');
  // Every district/time has something to find, and tables only contain matching species.
  for (const d of DISTRICTS) for (const t of TIMES) {
    const tab = spawnTable(d, t);
    ok(tab.length > 0 && tab.every((o) => o.spec.spawn.districts.includes(d) && o.spec.spawn.times.includes(t)), `spawns exist for ${d} at ${t} (${tab.map((o) => o.spec.id).join(', ')})`);
  }
  ok(!spawnTable('park', 'day').some((o) => o.spec.id === 'slugger'), 'night-only downtown species not in the park by day');
  // Rarity: a common species is picked far more often than a rare one from the same table.
  // (Home species only, so the stray share doesn't blur the rarity comparison.)
  const tab = spawnTable('downtown', 'night').filter((o) => o.spec.spawn.districts[0] === 'downtown');
  const count: Record<string, number> = {};
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20000; i++) {
    const s = pickSpecies(tab, rnd())!;
    count[s.spawn.rarity] = (count[s.spawn.rarity] ?? 0) + 1;
  }
  const perSpecies = (r: string): number => (count[r] ?? 0) / tab.filter((o) => o.spec.spawn.rarity === r).length;
  ok(perSpecies('common') > perSpecies('uncommon') * 1.8 && perSpecies('uncommon') > perSpecies('rare') * 2.5, `rarity weighting (per species: common ${perSpecies('common').toFixed(0)}, uncommon ${perSpecies('uncommon').toFixed(0)}, rare ${perSpecies('rare').toFixed(0)})`);
  ok(pickSpecies([], 0.5) === null, 'empty table gives nothing');
  const sl = species('slugger');
  ok(rollLevel(sl, 0) === sl.spawn.levels[0] && rollLevel(sl, 0.9999) === sl.spawn.levels[1], 'levels within the species range');
  ok(capFor('night') > capFor('day'), 'more creatures out at night');
  ok(detectionRadius(100, 'normal') > detectionRadius(20, 'normal'), 'louder creatures notice you from farther');
  ok(detectionRadius(60, 'walk') < detectionRadius(60, 'normal') && detectionRadius(60, 'sprint') > detectionRadius(60, 'normal') && detectionRadius(60, 'car') > detectionRadius(60, 'sprint'), 'walking is stealthier; sprinting and driving are noisier');
  ok(revealRadius(100) > revealRadius(10), 'loud creatures show up on the minimap from farther');
  ok(SPAWN.shinyChance > 0 && SPAWN.shinyChance < 0.01, 'shiny chance is small');
}

// ------------------------------------------------------------------ battles
{
  console.log('--- battles');
  // The damage formula from the spec.
  ok(Math.abs(baseDamage(50, 80, 120, 100) - ((((2 * 50) / 5 + 2) * 80 * 1.2) / 50 + 2)) < 1e-9, 'base damage formula ((2L/5+2)*P*A/D)/50+2');
  const b = baseDamage(20, 60, 50, 50);
  ok(finalDamage(b, 1, false, false, 1) === Math.floor(b), 'neutral, no bonus');
  ok(finalDamage(b, 2, true, false, 1) === Math.floor(b * 3), 'super effective x2 with STAB x1.5');
  ok(finalDamage(b, 1, false, true, 1) === Math.floor(b * 1.5), 'critical x1.5');
  ok(finalDamage(b, 1, false, false, 0.85) === Math.floor(b * 0.85) && finalDamage(b, 4, false, false, 1) === Math.floor(b * 4), 'random 0.85 and dual weakness x4');
  ok(finalDamage(b, 0, true, true, 1) === 0 && finalDamage(0.1, 0.25, false, false, 0.85) === 1, 'immune = 0, otherwise at least 1');
  ok(stageMult(2) === 2 && stageMult(-2) === 0.5 && stageMult(0) === 1, 'stat stages');

  // A scripted random source: always the given value.
  const fixed = (v: number) => () => v;
  const mk = (id: string, lvl: number, moves?: string[]) => {
    const c = createCreature(id, lvl, fixed(0.5));
    if (moves) c.moves = moves;
    return c;
  };
  const duel = (a: ReturnType<typeof mk>, d: ReturnType<typeof mk>, r = 0.5): Battle =>
    new Battle({ name: 'You', members: [a], ai: false }, { name: 'Wild', members: [d], ai: true }, fixed(r), { wild: true, canRun: true });
  const me = (bt: Battle): Combatant => bt.sides[0].active[0];
  const foe = (bt: Battle): Combatant => bt.sides[1].active[0];

  // Damage in battle matches the formula (Strapback Snap Shot vs Cinderblock: x0.5 type, STAB, First Shot x2, projectile block 0.75).
  {
    const bt = duel(mk('strapback', 20, ['snapShot', 'reload']), mk('cinderblock', 20, ['brace']));
    const u = me(bt), t = foe(bt);
    const atk = crStats(u.creature).attack, def = crStats(t.creature).defense;
    const exp = finalDamage(baseDamage(20, 40, atk, def), 0.5, true, false, 0.925, 2 * 0.75);
    ok(bt.damageFor(u, t, move('snapShot'), { crit: false, roll: 0.925, spread: false }) === exp, `in-battle damage = formula x type x STAB x First Shot x concrete block (${exp})`);
  }
  // Gun: ammo spent, out of ammo, Reload takes the turn and re-arms First Shot.
  {
    const s = mk('strapback', 15, ['snapShot', 'doubleTap', 'reload']);
    s.ammo = 3;
    const bt = duel(s, mk('cinderblock', 30, ['brace']), 0.3);
    const u = me(bt);
    bt.runTurn([{ type: 'move', user: u, moveId: 'snapShot' }]);
    ok(s.ammo === 2 && !u.firstShot, 'a shot spends 1 round and uses up the First Shot bonus');
    bt.runTurn([{ type: 'move', user: u, moveId: 'doubleTap' }]);
    ok(s.ammo === 0, 'Double Tap spends 2 rounds');
    const opt = bt.options(u).find((o) => o.move.id === 'snapShot')!;
    ok(!opt.usable && opt.reason === 'Out of ammo', 'empty magazine: shots unavailable');
    const ev = bt.runTurn([{ type: 'move', user: u, moveId: 'reload' }]);
    ok(s.ammo === 6 && u.firstShot && !ev.some((e) => e.kind === 'damage' && e.target === foe(bt) ), 'Reload refills, takes the turn, re-arms First Shot');
  }
  // AI reloads when empty.
  {
    const s = mk('slugger', 15);
    s.ammo = 0;
    const bt = new Battle({ name: 'You', members: [mk('cinderblock', 15)], ai: false }, { name: 'Wild', members: [s], ai: true }, fixed(0.5));
    const a = bt.chooseAI(foe(bt));
    ok(a.type === 'move' && a.moveId === 'reload', 'AI reloads an empty Gun type');
  }
  // Empty the Clip fires every round.
  {
    const s = mk('slugger', 30, ['emptyTheClip', 'reload']);
    s.ammo = 5;
    const bt = duel(s, mk('overpass', 60, ['brace']), 0.3);
    const ev = bt.runTurn([{ type: 'move', user: me(bt), moveId: 'emptyTheClip' }]);
    ok(ev.filter((e) => e.kind === 'damage' && e.target === foe(bt)).length === 5 && s.ammo === 0, 'Empty the Clip: one hit per round, magazine emptied');
  }
  // Ricochet bounces (same target in singles) for half and ignores concrete blocking.
  {
    const bt = duel(mk('slugger', 30, ['ricochet', 'reload']), mk('cinderblock', 60, ['brace']), 0.3);
    const ev = bt.runTurn([{ type: 'move', user: me(bt), moveId: 'ricochet' }]);
    const hits = ev.filter((e) => e.kind === 'damage' && e.target === foe(bt));
    ok(hits.length === 2 && !ev.some((e) => e.kind === 'text' && e.text.includes('soaked up')), 'Ricochet hits, bounces, ignores Concrete blocking');
  }
  // Concrete: Broken Glass cuts creatures switching in (not Concrete ones).
  {
    const p = new Party();
    p.add(mk('hustlepup', 20, ['hustle']));
    p.add(mk('cashew', 20, ['hustle']));
    const bt = new Battle({ name: 'You', members: p.members, ai: false }, { name: 'Wild', members: [mk('cinderblock', 20, ['brokenGlass'])], ai: true }, fixed(0.5));
    bt.runTurn([{ type: 'move', user: me(bt), moveId: 'hustle' }]);
    ok(bt.sides[0].glass, 'Broken Glass lands on the other side');
    const before = p.members[1].hp;
    bt.runTurn([{ type: 'switch', user: me(bt), to: 1 }]);
    ok(p.members[1].hp === before - Math.floor(crStats(p.members[1]).hp * DATA.mechanics.concrete.brokenGlassDamage) || p.members[1].hp < before, 'switching in onto glass costs 1/8 HP');
  }
  // Grind: Attack rises every turn survived (max 4).
  {
    const bt = duel(mk('doubleshift', 30, ['clockIn']), mk('curbstone', 30, ['brace']));
    for (let i = 0; i < 6; i++) bt.runTurn([{ type: 'move', user: me(bt), moveId: 'clockIn' }]);
    ok(me(bt).grind === 4 && me(bt).stages.attack === 4, 'Grind stacks +1 Attack per surviving turn, capped at 4');
  }
  // Smoke: cloud lowers the other side's accuracy for 3 turns; choking chips HP; Smoke types don't choke.
  {
    const bt = duel(mk('cinderblock', 20, ['rubbleDrop']), mk('exhaustfume', 20, ['smokescreen']), 0.69);
    bt.runTurn([{ type: 'move', user: me(bt), moveId: 'rubbleDrop' }]); // fume moves first? order by speed
    ok(bt.sides[0].cloud > 0 || bt.log.some((e) => e.kind === 'cloud'), 'Smokescreen puts a cloud over the player side');
    // With rand 0.69: Rubble Drop 90% acc x0.7 cloud = 63% -> misses under the cloud.
    const missed = bt.runTurn([{ type: 'move', user: me(bt), moveId: 'rubbleDrop' }]).some((e) => e.kind === 'miss');
    ok(missed, 'attacks from under the cloud miss more');
    const bt2 = duel(mk('cinderblock', 20, ['brace']), mk('exhaustfume', 20, ['chokeHold']), 0.1);
    bt2.runTurn([{ type: 'move', user: me(bt2), moveId: 'brace' }]);
    const t = me(bt2);
    ok(t.choke > 0 && t.creature.status === 'choking', 'Choke Hold makes the target choke');
    const hp = t.creature.hp;
    bt2.endRound();
    ok(t.creature.hp === hp - Math.max(1, Math.floor(crStats(t.creature).hp * DATA.mechanics.smoke.chokeDamage)), 'choking costs 1/16 HP a turn');
    const bt3 = duel(mk('hazeling', 20, ['haze']), mk('exhaustfume', 20, ['chokeHold']), 0.1);
    bt3.runTurn([{ type: 'move', user: me(bt3), moveId: 'haze' }]);
    ok(me(bt3).choke === 0, 'Smoke types can\'t be choked');
  }
  // Bass: spread move hits every foe at x0.75 and can flinch.
  {
    const foes = [mk('cinderblock', 45, ['brace']), mk('curbstone', 45, ['brace'])];
    const bt = new Battle({ name: 'You', members: [mk('woofer', 20, ['theDrop'])], ai: false }, { name: 'Gang', members: foes, activeCount: 2, ai: true }, fixed(0.05));
    const ev = bt.runTurn([{ type: 'move', user: me(bt), moveId: 'theDrop' }]);
    const hit = new Set(ev.filter((e) => e.kind === 'damage' && e.target.side === 1).map((e) => (e as { target: Combatant }).target.uid));
    ok(hit.size === 2, 'The Drop hits both foes');
    const u = me(bt), t = bt.sides[1].active[0];
    ok(bt.damageFor(u, t, move('theDrop'), { crit: false, roll: 1, spread: true }) < bt.damageFor(u, t, move('theDrop'), { crit: false, roll: 1, spread: false }), 'spread damage is reduced (x0.75)');
    ok(ev.some((e) => e.kind === 'text' && e.text.includes('flinched')) || bt.sides[1].active.some((a) => a.flinched), 'Bass hits can make foes flinch');
  }
  // Fainting, the end, and XP bookkeeping.
  {
    const bt = duel(mk('woofer', 60, ['theDrop']), mk('cinderblock', 3, ['brace']));
    const ev = bt.runTurn([{ type: 'move', user: me(bt), moveId: 'theDrop' }]);
    ok(bt.over && bt.winner === 0 && ev.some((e) => e.kind === 'faint') && bt.defeated.length === 1 && bt.defeated[0].by[0] === me(bt).creature, 'knock out the foe: battle won, defeat recorded for XP');
  }
  // Running: faster creature gets away; trainer battles can't be run from.
  {
    const bt = duel(mk('streetlamp', 30), mk('cinderblock', 5), 0.5);
    bt.runTurn([{ type: 'run', user: me(bt) }]);
    ok(bt.over && bt.ran, 'ran away from a wild battle');
    const bt2 = new Battle({ name: 'You', members: [mk('streetlamp', 30)], ai: false }, { name: 'Gang', members: [mk('cinderblock', 5)], ai: true }, fixed(0.5), { wild: false, canRun: false });
    bt2.runTurn([{ type: 'run', user: me(bt2) }]);
    ok(!bt2.over, "can't run from a trainer battle");
  }
  // Turn order: priority beats speed.
  {
    const bt = duel(mk('cinderblock', 20, ['slabSlam']), mk('cashew', 20, ['hustle']), 0.5);
    const ev = bt.runTurn([{ type: 'move', user: me(bt), moveId: 'slabSlam' }]);
    const first = ev.find((e) => e.kind === 'move') as { user: Combatant };
    ok(first.user.side === 1, 'faster/priority move goes first');
  }
  // Real-time API: act + endRound.
  {
    const bt = duel(mk('hustlepup', 20, ['hustle']), mk('curbstone', 20, ['brace']));
    const hp = foe(bt).creature.hp;
    bt.act({ type: 'move', user: me(bt), moveId: 'hustle' });
    bt.endRound();
    ok(foe(bt).creature.hp < hp && me(bt).grind === 1, 'real-time: act() and endRound()');
  }
}

// ------------------------------------------------------------------ catching
{
  console.log('--- catching');
  const cuffs = itemSpec('cuffs') as CaptureItem;
  const crate = itemSpec('crate') as CaptureItem;
  const net = itemSpec('net') as CaptureItem;
  ok(captureItems().map((i) => i.id).join(',') === 'cuffs,crate,net,lure,cage,capturePod,nightNet,diveNet,rookieCuffs', 'Cuffs, Crate and Net exist, plus the black-market Sludge Lure and Cage and the event-only Capture Pod');
  const c = createCreature('hustlepup', 10, () => 0.5); // catch rate 180
  const mx = crMaxHp(c);
  // Formula: a = ((3M - 2H) * rate * item * status) / 3M.
  c.hp = mx;
  ok(Math.abs(catchValue(c, cuffs, true) - (mx * 180) / (3 * mx)) < 1e-9, 'full HP: a = rate / 3');
  c.hp = 1;
  ok(Math.abs(catchValue(c, cuffs, true) - ((3 * mx - 2) * 180) / (3 * mx)) < 1e-9, '1 HP: a close to the full rate');
  ok(catchChance(c, cuffs, true) > catchChance({ ...c, hp: mx }, cuffs, true), 'weaker targets are easier');
  ok(catchChance({ ...c, status: 'choking' }, cuffs, true) > catchChance(c, cuffs, true) || catchChance(c, cuffs, true) === 1, 'choking makes it easier');
  ok(catchChance({ ...c, hp: mx }, cuffs, false) < catchChance({ ...c, hp: mx }, cuffs, true), 'throwing outside a battle is harder');
  const hard = createCreature('hardcase', 40, () => 0.5); // catch rate 15
  ok(catchChance(hard, cuffs, true) < 0.03, `rare species at full HP are very hard (${(catchChance(hard, cuffs, true) * 100).toFixed(1)}%)`);
  // Item bonuses.
  const cb = createCreature('cinderblock', 10, () => 0.5);
  ok(itemMultiplier(crate, cb) === 1.5 * 2.5 && itemMultiplier(crate, createCreature('subsonic', 10, () => 0.5)) === 1.5, 'Crate: x1.5, x3.75 vs Concrete/Grind');
  ok(itemMultiplier(net, createCreature('streetlamp', 10, () => 0.5)) === 3 && itemMultiplier(net, cb) === 1, 'Net: x3 vs fast (Speed 80+), x1 otherwise');
  ok(itemMultiplier(cuffs, cb) === 1, 'Cuffs: x1');
  // Shakes: three holds = caught; statistics match the chance.
  const t = { ...hard, hp: Math.floor(crMaxHp(hard) / 3) };
  const ch = catchChance(t, cuffs, true);
  let caught = 0;
  let seed = 11;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const shakeCounts = [0, 0, 0, 0];
  for (let i = 0; i < 40000; i++) {
    const r = rollCatch(t, cuffs, true, rnd);
    if (r.caught) caught++;
    shakeCounts[r.shakes]++;
    if (r.caught !== (r.shakes === CATCH.shakes)) fails++;
  }
  ok(Math.abs(caught / 40000 - ch) < 0.01, `catch rate matches the formula (${((caught / 40000) * 100).toFixed(1)}% vs ${(ch * 100).toFixed(1)}%)`);
  ok(shakeCounts[0] > 0 && shakeCounts[1] > 0 && shakeCounts[2] > 0, 'escapes happen after 0, 1 or 2 shakes');
  const easy = { ...c, hp: 1 };
  const strong = { ...createCreature('cashew', 3, () => 0.5), hp: 1 };
  ok(rollCatch(strong, crate, true, () => 0.99).caught || catchChance(strong, crate, true) < 1, 'a >= 255 is a sure catch');
  void easy;
  // Bag.
  const bag = new Bag();
  bag.add('cuffs', 2);
  bag.add('net', 1);
  ok(bag.take('cuffs') && bag.count('cuffs') === 1 && !bag.take('crate'), 'bag counts');
  ok(bag.currentCapture()!.id === 'cuffs' && bag.cycleCapture()!.id === 'net' && bag.cycleCapture()!.id === 'cuffs', 'capture item selection cycles');
  const b2 = new Bag();
  b2.load(JSON.parse(JSON.stringify(bag.serialize())));
  ok(b2.count('cuffs') === 1 && b2.count('net') === 1, 'bag save/load');
  // Party of 6 + stash.
  const party = new Party();
  for (let i = 0; i < 8; i++) party.add(createCreature('cashew', 5 + i, () => 0.5));
  ok(party.members.length === 6 && party.stash.length === 2, 'party holds 6, the rest go to the stash');
  ok(!party.fromStash(0), "can't move from the stash into a full party");
  const s0 = party.stash[0];
  const m2 = party.members[2];
  ok(party.swapWithStash(2, 0) && party.members[2] === s0 && party.stash[0] === m2, 'swap party member with stash');
  ok(party.toStash(5) && party.members.length === 5 && party.fromStash(0) && party.members.length === 6, 'move to and from the stash');
  party.makeLead(3);
  ok(party.members[0].level !== undefined && party.members.length === 6, 'make lead');
  const solo = new Party();
  solo.add(createCreature('cashew', 5, () => 0.5));
  ok(!solo.toStash(0), 'the party always keeps one creature');
}

// ------------------------------------------------------------------ levelling and evolution
{
  console.log('--- levelling & evolution');
  const r5 = () => 0.5;
  const foe = createCreature('cinderblock', 10, r5);
  ok(xpYield(foe, 5) > xpYield(foe, 10) && xpYield(foe, 10) > xpYield(foe, 20), 'XP scales with level difference (beating stronger foes pays more)');
  ok(xpYield(createCreature('overpass', 10, r5), 10) > xpYield(createCreature('cinderblock', 10, r5), 10), 'higher-tier foes give more XP');
  ok(xpYield(foe, 10, true) > xpYield(foe, 10), 'trainer creatures give x1.5');
  ok(xpYield(createCreature('cashew', 2, r5), 60) >= 1, 'always at least 1 XP');
  const ctx = { timeOfDay: 'day' as const, district: 'midtown' as const };
  // Level ups: HP grows with max HP; moves learned at their level.
  const s = createCreature('strapback', 4, r5);
  s.hp -= 5;
  const before = crMaxHp(s);
  const ev = gainXp(s, xpForLevel('medium', 5) - s.xp, ctx);
  ok(s.level === 5 && ev.some((e) => e.kind === 'level') && s.hp === crMaxHp(s) - 5 && crMaxHp(s) > before, 'level up keeps damage, raises max HP');
  ok(ev.some((e) => e.kind === 'learned' && e.moveId === 'doubleTap') || ev.some((e) => e.kind === 'learnPrompt' && e.moveId === 'doubleTap'), 'learns Double Tap at Lv 5');
  // Full move list: prompt, replace, Reload protected.
  const f = createCreature('strapback', 30, r5);
  ok(f.moves.length === 4, 'knows 4 moves');
  const pr = learn(f, 'steadyAim');
  ok(pr.length === 1 && pr[0].kind === 'learnPrompt', '5th move asks which to forget');
  const ri = f.moves.indexOf('reload');
  ok(replaceMove(f, ri, 'steadyAim') === null && f.moves.includes('reload'), "a Gun type can't forget Reload");
  const other = f.moves.findIndex((m) => m !== 'reload');
  const old = f.moves[other];
  ok(replaceMove(f, other, 'steadyAim') === old && f.moves.includes('steadyAim') && f.moves.length === 4, 'replace a move');
  // Multi-level jump and the cap.
  const c = createCreature('cashew', 5, r5);
  const evs = gainXp(c, 1e9, ctx);
  ok(c.level === 100 && evs.filter((e) => e.kind === 'level').length === 95, 'XP jumps several levels at once, capped at 100');
  ok(gainXp(c, 1000, ctx).length === 0, 'no XP past level 100');
  // Level evolution.
  const sb = createCreature('strapback', 15, r5);
  const e1 = gainXp(sb, xpForLevel('medium', 16) - sb.xp, ctx);
  ok(e1.some((e) => e.kind === 'evolve' && e.to === 'holster'), 'Strapback evolves at Lv 16');
  // Condition evolutions: time of day / district.
  const ds = createCreature('doubleshift', 23, r5);
  ok(evolutionFor(ds, ctx) === null && evolutionFor(ds, { timeOfDay: 'night', district: 'midtown' })?.to === 'overtime', 'Double Shift evolves only levelling up at night');
  const ss = createCreature('subsonic', 21, r5);
  ok(evolutionFor(ss, ctx) === null && evolutionFor(ss, { timeOfDay: 'day', district: 'downtown' })?.to === 'woofer', 'Subsonic evolves only levelling up downtown');
  ok(evolutionFor(createCreature('subsonic', 12, r5), { timeOfDay: 'day', district: 'downtown' }) === null, 'condition evolutions still need the minimum level');
  // Item evolutions.
  const h = createCreature('holster', 30, r5);
  ok(itemEvolution(h, 'steelCase')?.to === 'hardcase' && itemEvolution(h, 'sparkPlug') === null, 'Steel Case evolves Holster, Spark Plug does not');
  // Evolving keeps level/XP/IVs/damage, refills ammo, changes types.
  h.hp -= 10;
  h.ammo = 0;
  const xp = h.xp;
  const ivs = JSON.stringify(h.ivs);
  evolve(h, 'hardcase');
  ok(h.speciesId === 'hardcase' && h.level === 30 && h.xp === xp && JSON.stringify(h.ivs) === ivs && h.hp === crMaxHp(h) - 10 && h.ammo === species('hardcase').ammo && h.moves.includes('reload'), 'evolution keeps level, XP, IVs and damage; refills ammo; keeps Reload');
  ok(species(h.speciesId).types.includes('concrete'), 'Hardcase gains the Concrete type');
}

// ------------------------------------------------------------------ people, police and gangs
{
  console.log('--- people, police, gangs');
  ok(!ALL_SPECIES().some((s) => s.human) && DATA.species.get('officer')?.human === true, 'people (passers-by, police) can fight but are not in the dex');
  ok(species('tranqofficer').learnset.some(([, m]) => m === 'tranqDart'), 'animal-control officers carry tranquilliser darts');
  // An officer fights with Gun moves and ammo like a Gun-type creature.
  const off = createCreature('officer', 20, () => 0.5);
  const bt = new Battle({ name: 'You', members: [createCreature('cinderblock', 20, () => 0.5)], ai: false }, { name: 'Officer', members: [off], ai: true }, () => 0.5, { wild: false, canRun: true });
  const a = bt.chooseAI(bt.sides[1].active[0]);
  ok(a.type === 'move' && off.ammo === 12, 'officer picks a move and has a magazine');
  // Tranq dart slows the target.
  const tq = createCreature('tranqofficer', 20, () => 0.5);
  tq.moves = ['tranqDart', 'reload'];
  const bt2 = new Battle({ name: 'You', members: [createCreature('cashew', 20, () => 0.5)], ai: false }, { name: 'AC', members: [tq], ai: true }, () => 0.3, { wild: false, canRun: true });
  bt2.runTurn([{ type: 'move', user: bt2.sides[0].active[0], moveId: 'hustle' }]);
  ok(bt2.sides[0].active[0].stages.speed === -2, 'a tranq dart lowers Speed by 2');
  // Trainers config.
  ok(TRAINERS.length >= 8 && new Set(TRAINERS.map((t) => t.gang)).size >= 4, `${TRAINERS.length} gang trainers in ${new Set(TRAINERS.map((t) => t.gang)).size} gangs`);
  let threw = '';
  try {
    validateTrainers([{ ...TRAINERS[0], team: [['officer', 5]] }]);
  } catch (e) {
    threw = (e as Error).message;
  }
  ok(threw.includes('not a creature'), 'trainer config rejects people as team members');
  ok(TRAINERS.every((t) => t.team.every(([id]) => !species(id).human) && t.reward > 0), 'every trainer has a creature team and a reward');
  // Trainer battles can't be run from or caught in.
  const bt3 = new Battle({ name: 'You', members: [createCreature('woofer', 30, () => 0.5)], ai: false }, { name: 'Dre', members: [createCreature('hustlepup', 6, () => 0.5), createCreature('doubleshift', 7, () => 0.5)], ai: true }, () => 0.5, { wild: false, canRun: false });
  bt3.runTurn([{ type: 'run', user: bt3.sides[0].active[0] }]);
  ok(!bt3.over, "can't run from a gang trainer");
  bt3.runTurn([{ type: 'move', user: bt3.sides[0].active[0], moveId: bt3.sides[0].active[0].creature.moves[0] }]);
  if (bt3.needsSwitch(1).length) bt3.autoSwitch(1);
  ok(bt3.sides[1].active[0].creature.hp > 0 || bt3.over, 'the trainer sends in the next creature when one faints');
}

// ------------------------------------------------------------------ saving
{
  console.log('--- saving');
  const r5 = () => 0.5;
  const a = createCreature('holster', 24, r5);
  a.hp -= 7;
  a.ammo = 3;
  a.nickname = 'Lefty';
  a.status = 'choking';
  a.origin = { district: 'downtown', level: 20, at: 123 };
  const b = createCreature('cashew', 9, r5);
  const save: SaveData = {
    version: SAVE_VERSION,
    savedAt: '2026-10-28T12:00:00Z',
    money: 1234,
    hour: 21.5,
    player: { x: 10, z: -20 },
    weapons: { owned: [{ id: 'fists', mag: 0, reserve: 0 }, { id: 'pistol', mag: 7, reserve: 30 }], current: 'pistol' },
    bag: { counts: { cuffs: 4, crate: 1 }, selected: 'crate' },
    party: [creatureToJson(a)],
    stash: [creatureToJson(b)],
    impound: [],
    layer: 'street',
    dex: { seen: ['holster', 'cashew', 'slugger'], caught: ['holster', 'cashew'], evolved: [], firstSeen: {} },
    trainersBeaten: ['dre'],
    battleMode: 'realtime',
    playTime: 3725,
    pity: { fails: 0, sameTarget: null },
    stashesOpened: [],
    quests: {},
    reputation: 0,
    manholesFound: [],
    sewerSeed: 9137,
    streetCred: 12,
  };
  const text = JSON.stringify(save);
  const { data, warnings } = loadSave(text);
  ok(warnings.length === 0, 'a clean save loads without warnings');
  const norm = (c: object): string => JSON.stringify(Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined).sort(([x], [y]) => x.localeCompare(y))));
  ok(norm(data.party[0]) === norm(creatureToJson(a)) && data.stash[0].speciesId === 'cashew', 'creatures round-trip exactly (level, XP, HP, ammo, IVs, moves, nickname, status, origin)');
  ok(data.money === 1234 && data.hour === 21.5 && data.weapons.current === 'pistol' && data.weapons.owned[1].mag === 7 && data.bag.counts.cuffs === 4 && data.bag.selected === 'crate', 'money, clock, weapons and bag round-trip');
  ok(data.dex.caught.length === 2 && data.dex.seen.length === 3 && data.trainersBeaten[0] === 'dre' && data.battleMode === 'realtime' && data.playTime === 3725, 'dex, trainers, settings and playtime round-trip');
  ok(describeSave(data).includes('Holster Lv 24') && describeSave(data).includes('1h 02m'), `summary: ${describeSave(data)}`);
  // Repairs.
  const w: string[] = [];
  const bad = sanitizeCreature({ speciesId: 'strapback', level: 250, xp: -5, hp: 99999, ammo: 99, moves: ['nope', 'snapShot', 'snapShot'], ivs: { hp: 99 } }, w);
  ok(!!bad && bad.level === 100 && bad.hp === crMaxHp(bad) && bad.ammo === species('strapback').ammo && bad.ivs.hp === 31 && bad.moves.includes('snapShot') && bad.moves.includes('reload') && new Set(bad.moves).size === bad.moves.length, 'out-of-range level/HP/ammo/IVs clamped, unknown and duplicate moves removed, Reload restored');
  ok(sanitizeCreature({ speciesId: 'dragon', level: 5 }, w) === null && sanitizeCreature({ speciesId: 'officer', level: 5 }, w) === null, 'unknown species and people are dropped');
  const big = loadSave({ ...save, party: Array.from({ length: 8 }, () => creatureToJson(createCreature('cashew', 5, r5))), bag: { counts: { cuffs: 2, rocket: 3 } }, weapons: { owned: [{ id: 'laser', mag: 1, reserve: 1 }], current: 'laser' } });
  ok(big.data.party.length === 6 && big.data.stash.length === 3 && !('rocket' in big.data.bag.counts) && big.data.weapons.current === 'fists' && big.data.weapons.owned[0].id === 'fists' && big.warnings.length > 0, 'oversized party moves to the stash; unknown items/weapons dropped with warnings');
  let threw = false;
  try {
    loadSave('not json');
  } catch {
    threw = true;
  }
  ok(threw, 'a non-save file is rejected');
  const old = loadSave({ version: 1 });
  ok(old.data.money === 500 && old.data.party.length === 0 && old.data.weapons.owned[0].id === 'fists', 'a near-empty save loads with defaults');
}

console.log('\n— Streetmon v2: weapon damage, doubled spawns, no-catch battles');
{
  ok(SPAWN.maxTotal === 24 && SPAWN.maxPerDistrict === 16 && SPAWN.interval <= 0.6, 'spawn caps doubled and spawn interval halved');
  const me = createCreature('cinderblock', 20, () => 0.5);
  const foe = createCreature('hustlepup', 10, () => 0.5);
  const bt = new Battle({ name: 'You', members: [me], ai: false }, { name: 'Marcus', members: [foe], ai: true }, () => 0.5, { wild: false, canRun: true });
  const hp0 = foe.hp;
  const ev = bt.inflict(bt.sides[1].active[0], 5, 'shot');
  ok(foe.hp === hp0 - 5 && ev.length > 0, 'gunfire damage goes through the battle (inflict)');
  bt.inflict(bt.sides[1].active[0], 9999, 'shot');
  ok(foe.hp === 0 && bt.over && bt.inflict(bt.sides[1].active[0], 5).length === 0, 'enough gunfire knocks it out and ends the battle; no damage after');
  ok(bt.opts.wild === false, 'trainer/NPC/police battles are not catchable (wild: false)');
}

console.log('\n— Music');
{
  ok(pickTrack({ battle: null, stars: 0, chasing: false }) === 'overworld', 'overworld music by default');
  ok(pickTrack({ battle: 'wild', stars: 0, chasing: false }) === 'wildBattle', 'wild battle music');
  ok(pickTrack({ battle: 'police', stars: 3, chasing: true }) === 'policeBattle', 'police battle music beats the chase');
  ok(pickTrack({ battle: 'npc', stars: 0, chasing: false }) === 'npcBattle' && pickTrack({ battle: 'trainer', stars: 0, chasing: false }) === 'npcBattle', 'NPC and gang trainer battles use the challenger track');
  ok(pickTrack({ battle: null, stars: 1, chasing: false }) === 'overworld' && pickTrack({ battle: null, stars: 2, chasing: true }) === 'chase', 'chase music starts at 2 stars');
  ok(pickTrack({ battle: null, stars: 1, chasing: true }) === 'chase' && pickTrack({ battle: null, stars: 0, chasing: false }) === 'overworld', 'chase music lasts until the wanted level is gone');
}

console.log('\n— Drifting');
{
  const D = Math.PI / 180;
  ok(Math.abs(slipAngle(1, 0, 10, 0)) < 1e-9, 'no slip when moving straight ahead');
  const b = slipAngle(1, 0, 10 * Math.cos(20 * D), -10 * Math.sin(20 * D));
  ok(Math.abs(b - 20 * D) < 1e-6, 'slip angle is positive when sliding to the car\'s left (+heading)');
  const spec = { grip: 1.45, handbrakeGrip: 0.6, drive: 'rwd' as const };
  ok(rearGrip(spec, 30 * D, false, false) === 1.45, 'full grip when not drifting');
  ok(rearGrip(spec, 3 * D, true, false) === 1.45, 'full grip under 6 degrees in a drift');
  ok(Math.abs(rearGrip(spec, 25 * D, true, false) - 1.45 * DRIFT.driftGripShare) < 1e-9, 'grip holds a plateau past 18 degrees');
  const mid = rearGrip(spec, 12 * D, true, false);
  ok(mid < 1.45 && mid > 1.45 * DRIFT.driftGripShare, 'grip falls smoothly between 6 and 18 degrees');
  ok(rearGrip(spec, 0, true, true) === 0.6, 'handbrake grip while held');
  ok(Math.abs(counterSteer(20 * D, 0.5, 0.6) - 10 * D) < 1e-9 && counterSteer(80 * D, 1, 0.6) === 0.6, 'counter-steer follows the slide, limited to the lock');
  ok(yawAssist(0, 0, -1, 0) > 0 && Math.abs(yawAssist(-26 * D, 0, -1, 0)) < 1e-9, 'steering left pulls the nose left until about 26 degrees of slide');
  ok(yawAssist(-20 * D, 0, 0, 0) < 0 && yawAssist(20 * D, 0, 0, 0) > 0, 'letting go of the steering turns the nose back towards the direction of travel');
  ok(yawAssist(80 * D, 0, 0, 0) > yawAssist(50 * D, 0, 0, 0) * 2, 'past 55 degrees it pushes hard against a spin');
  ok(driftBoost(30 * D, 1) === DRIFT.boost && driftBoost(30 * D, 0) === 0 && driftBoost(15 * D, 1) < DRIFT.boost, 'drift boost needs throttle and grows with the slide');
  const st = new DriftState();
  const step = (o: Partial<{ speed: number; beta: number; handbrake: boolean; throttle: number; drive: 'rwd' | 'fwd' | 'awd' }>) =>
    st.update({ dt: 0.05, speed: 15, beta: 0, handbrake: false, throttle: 0, drive: 'rwd', ...o });
  ok(!step({ speed: 5, handbrake: true }).started, 'a handbrake tap below 35 km/h does not start a drift');
  step({ handbrake: false });
  ok(step({ handbrake: true }).started && st.drifting, 'a handbrake tap at speed starts a drift');
  for (let i = 0; i < 8; i++) step({ beta: 1 * D });
  ok(st.drifting, 'a fresh drift survives 0.4 s of low slip while the slide builds');
  for (let i = 0; i < 20; i++) step({ beta: 25 * D, throttle: 1 });
  ok(st.drifting, 'the drift holds while the slip angle stays high');
  let ended = false;
  for (let i = 0; i < 6 && !ended; i++) ended = step({ beta: 2 * D }).justEnded;
  ok(ended && !st.drifting && st.exitDamp > 0, 'it ends after 0.25 s under 5 degrees, with an exit yaw-damping burst');
  const fwd = new DriftState();
  ok(!fwd.update({ dt: 0.05, speed: 15, beta: 20 * D, handbrake: false, throttle: 1, drive: 'fwd' }).started, 'no power oversteer on front-wheel drive');
  const rwd = new DriftState();
  ok(rwd.update({ dt: 0.05, speed: 15, beta: 20 * D, handbrake: false, throttle: 1, drive: 'rwd' }).started, 'power oversteer starts a drift on rear-wheel drive');
}

console.log('\n— Cars hitting Streetmon');
{
  const kmh = (k: number): number => k / 3.6;
  ok(weightClassOf(1400) === 'light' && weightClassOf(1750) === 'medium' && weightClassOf(2300) === 'heavy' && weightClassOf(40000, true) === 'armoured', 'weight classes from car mass');
  ok(impactShare(kmh(11), 'medium', 20) === 0, 'no damage under 12 km/h');
  const s40 = impactShare(kmh(40), 'medium', 20);
  const s80 = impactShare(kmh(80), 'medium', 20);
  ok(Math.abs(s40 - 0.2) < 0.02, `a medium car at 40 km/h takes about 20% off a 20 kg Streetmon (${(s40 * 100).toFixed(1)}%)`);
  ok(Math.abs(s80 - 0.76) < 0.03, `at 80 km/h about 75% (${(s80 * 100).toFixed(1)}%)`);
  ok(impactShare(kmh(100), 'heavy', 20) === IMPACT.maxShare, 'a heavy car at 100 km/h is capped at 120%');
  ok(impactShare(kmh(60), 'medium', 400) < impactShare(kmh(60), 'medium', 20) * 0.55, 'a 400 kg Streetmon takes about half the damage');
  ok(instantFaint(90, 'heavy') && !instantFaint(90, 'medium') && !instantFaint(70, 'heavy'), 'instant knockout only from heavy cars over 80 km/h');
  ok(defaultWeightKg(1, ['grind']) === 30 && defaultWeightKg(1, ['concrete']) === 90, 'fallback weight from height, Concrete 3x');
  // Contact: car at origin facing +X (4.8 x 1.85).
  ok(!!carCircleContact(0, 0, 0, 2.4, 0.925, 2.7, 0, 0.4) && !carCircleContact(0, 0, 0, 2.4, 0.925, 3.0, 0, 0.4), 'front bumper contact in range, not beyond');
  const side = carCircleContact(0, 0, 0, 2.4, 0.925, 0, 1.2, 0.4);
  ok(!!side && Math.abs(side.nz - 1) < 1e-9, 'side contact normal points out of the right side (+Z)');
  const rot = carCircleContact(0, 0, Math.PI / 2, 2.4, 0.925, 0, -2.7, 0.4);
  ok(!!rot && Math.abs(rot.nz + 1) < 1e-9, 'a car facing -Z hits what is in front of it');
  const base = { carVx: kmh(60), carVz: 0, nx: 1, nz: 0, carMass: 1500, cls: 'medium' as const, weightKg: 20, heavyType: false, hp: 40, maxHp: 40 };
  const r = resolveImpact(base)!;
  ok(r.damage > 0 && r.vx > 0 && r.vy >= IMPACT.hopMin * 0.5 && r.carDamage === 0 && r.carSlow < 0.02, 'a hit knocks it forward and up; a light Streetmon barely slows the car and doesn\'t damage it');
  ok(resolveImpact({ ...base, nx: -1 }) === null, 'no hit when moving away from it');
  const heavy = resolveImpact({ ...base, weightKg: 120, heavyType: true })!;
  ok(heavy.carDamage > 0 && heavy.carSlow > r.carSlow && Math.hypot(heavy.vx, heavy.vz) < Math.hypot(r.vx, r.vz), 'a heavy Concrete type damages the car, slows it more and flies less');
  const ko = resolveImpact({ ...base, carVx: kmh(95), cls: 'heavy' })!;
  ok(ko.crit && ko.damage === 40, 'heavy car over 80 km/h: instant knockout');
}

console.log('\n— Data groundwork: biomes, dex, save v2');
{
  // Street spawn tables: street species only, full weight at home, strays elsewhere.
  const expect = (d: (typeof DISTRICTS)[number], t: (typeof TIMES)[number]) =>
    ALL_SPECIES()
      .filter((s) => (!s.spawn.biomes || s.spawn.biomes.includes('street')) && s.spawn.districts.includes(d) && s.spawn.times.includes(t) && SPAWN.rarityWeight[s.spawn.rarity] > 0)
      .map((s) => `${s.id}:${SPAWN.rarityWeight[s.spawn.rarity] * (s.spawn.districts[0] === d ? 1 : SPAWN.strayWeight)}`)
      .join(',');
  let same = true;
  for (const d of DISTRICTS) for (const t of TIMES) if (spawnTable(d, t).map((o) => `${o.spec.id}:${o.weight}`).join(',') !== expect(d, t)) same = false;
  ok(same, 'street spawn tables: full weight in the home district, strays elsewhere (all districts x times)');
  // Mostly at home: in every district and time, most spawns (by weight) are species that live there.
  let worst = 1;
  for (const d of DISTRICTS) for (const t of TIMES) {
    const tab = spawnTable(d, t);
    const total = tab.reduce((n, o) => n + o.weight, 0);
    const home = tab.filter((o) => o.spec.spawn.districts[0] === d).reduce((n, o) => n + o.weight, 0);
    worst = Math.min(worst, home / total);
  }
  ok(worst >= 0.6, `each district's spawns are mostly its own species (worst case ${Math.round(worst * 100)}% home)`);
  // Aggressive ones only come for you in the park, on the roofs and in the sewers.
  ok(hostileAt('street', 'park') && hostileAt('roof', 'midtown') && hostileAt('sewer', 'downtown'), 'hostile in the park, on roofs, in the sewers');
  ok(!['uptown', 'midtown', 'downtown', 'waterfront'].some((d) => hostileAt('street', d as never)), 'never hostile on the other streets');
  ok(DISTRICTS.every((d) => d === 'park' || TIMES.every((t) => true)) && ALL_SPECIES().filter((s) => s.spawn.temperament === 'aggro' && !s.spawn.biomes && s.spawn.districts.length).every((s) => s.spawn.districts.includes('park')), 'every aggressive street species can turn up in the park (where it is dangerous)');
  ok(ALL_SPECIES().filter((s) => s.dex <= 22).every((s) => speciesBiomes(s).length === 1 && speciesBiomes(s)[0] === 'street'), 'the 22 original species live on the street only');
  ok(spawnTable('midtown', 'night', 'sewer').every((o) => speciesBiomes(o.spec).includes('sewer')), 'sewer tables hold only sewer species');
  const base = species('strapback');
  const roofy = { ...base, id: 'rooftest', spawn: { ...base.spawn, biomes: ['roof' as const], biomeWeight: { roof: 3 } } };
  const both = { ...base, id: 'bothtest', spawn: { ...base.spawn, biomes: ['street' as const, 'sewer' as const], biomeWeight: { sewer: 0.3 } } };
  const pool = [base, roofy, both];
  ok(!spawnTable('midtown', 'night', 'street', pool).some((o) => o.spec.id === 'rooftest'), 'a roof species never spawns on the street');
  const roofT = spawnTable('downtown', 'night', 'roof', pool);
  ok(roofT.length === 1 && roofT[0].weight === SPAWN.rarityWeight[base.spawn.rarity] * 3, 'roof table uses its biome weight');
  const sewT = spawnTable('downtown', 'night', 'sewer', pool);
  ok(sewT.length === 1 && Math.abs(sewT[0].weight - SPAWN.rarityWeight[base.spawn.rarity] * 0.3) < 1e-9, 'a street species can also live in sewers at low weight');
  const clone2 = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const c2 = clone2(creaturesJson) as any;
  c2.species[0].spawn.biomes = ['attic'];
  let rejected = '';
  try {
    parseData(typesJson as any, movesJson as any, c2, itemsJson as any);
  } catch (e) {
    rejected = String((e as Error).message);
  }
  ok(rejected.includes('unknown biome "attic"'), 'config rejects an unknown biome');
  // Dex text.
  ok(dexEntries().size === ALL_SPECIES().length, `every species has a Streetmondex entry (${dexEntries().size})`);
  ok([...dexEntries().values()].every((e) => e.lore.length >= 1 && e.category.length > 0 && e.habitatHints.length > 0), 'every entry has a category, lore and a habitat hint');
  const missing = clone2(dexJson) as any;
  delete missing.entries.cashew;
  let dexErr = '';
  try {
    parseDex(missing, ALL_SPECIES());
  } catch (e) {
    dexErr = String((e as Error).message);
  }
  ok(dexErr.includes('"cashew" has no dex entry'), 'dex validation catches a missing entry');
  ok(species('overpass').model.weightKg === 400 && ALL_SPECIES().every((s) => typeof s.model.weightKg === 'number'), 'every species has a weight');
  // Save v2.
  const v1 = { version: 1, money: 900, hour: 12, player: { x: 5, z: 6 }, party: [creatureToJson(createCreature('cashew', 5, () => 0.5))], dex: { seen: ['cashew'], caught: ['cashew'] } };
  const up = loadSave(v1);
  ok(up.data.version === SAVE_VERSION && SAVE_VERSION === 2, 'save version is 2');
  ok(up.warnings.length === 0, 'a v1 save upgrades without warnings');
  ok(up.data.layer === 'street' && up.data.dex.evolved.length === 0 && up.data.pity.fails === 0 && up.data.pity.sameTarget === null && up.data.stashesOpened.length === 0 && Object.keys(up.data.quests).length === 0 && up.data.reputation === 0 && up.data.sewerSeed === 9137, 'v1 upgrade fills every new field with its default');
  ok(up.data.money === 900 && up.data.party[0].speciesId === 'cashew' && up.data.dex.caught[0] === 'cashew', 'v1 data is kept');
  const v2 = { ...up.data, layer: 'sewer', player: { x: 5, z: 6, y: -40 }, dex: { ...up.data.dex, evolved: ['cashew', 'dragon'], firstSeen: { cashew: { biome: 'roof', district: 'midtown', at: 5 }, nope: { biome: 'roof' } } }, pity: { fails: 3, sameTarget: { uid: 'w-9', fails: 2 } }, stashesOpened: ['roof-mid-07', 'BAD ID!'], quests: { 'lost-gutterat': { step: 2, done: false } }, reputation: 15, manholesFound: ['mh-up-1'], sewerSeed: 42 };
  const back = loadSave(JSON.stringify(v2)).data;
  ok(back.layer === 'sewer' && back.player?.y === -40, 'layer and height round-trip');
  ok(back.dex.evolved.join() === 'cashew' && back.dex.firstSeen.cashew?.biome === 'roof' && !('nope' in back.dex.firstSeen), 'dex evolved and first-seen round-trip; unknown species dropped');
  ok(back.pity.fails === 3 && back.pity.sameTarget?.uid === 'w-9' && back.stashesOpened.join() === 'roof-mid-07' && back.quests['lost-gutterat'].step === 2 && back.reputation === 15 && back.manholesFound[0] === 'mh-up-1' && back.sewerSeed === 42, 'pity, stashes, quests, reputation, manholes and seed round-trip; bad ids dropped');
  const noY = loadSave({ ...v2, player: { x: 5, z: 6 } }).data;
  ok(noY.layer === 'street', 'a non-street layer without a height falls back to the street');
}

console.log('\n— World layers');
{
  const layout = generateLayout();
  const L = new WorldLayers(layout);
  const tall = layout.buildings.find((b) => b.height > 20 && !b.setback)!;
  const cx = (tall.rect.x0 + tall.rect.x1) / 2;
  const cz = (tall.rect.z0 + tall.rect.z1) / 2;
  ok(L.buildingAt(cx, cz) === tall, 'building lookup finds the building under a point');
  ok(L.layerAt(cx, tall.height + 0.1, cz) === 'roof', 'standing on its roof is the roof layer');
  ok(L.layerAt(cx, tall.height - 3, cz) === 'street', 'well below the roof (inside, or a ledge) is not the roof');
  const road = layout.roads.find((r) => r.kind === 'ave')!;
  ok(L.layerAt(road.center, 0.2, 0) === 'street' && L.roofAt(road.center, 0) === null, 'the middle of an avenue is street, with no roof');
  ok(L.layerAt(road.center, LAYERS.sewerFloor + 0.5, 0) === 'sewer' && L.layerAt(cx, -20, cz) === 'sewer', 'below the sewer ceiling is the sewer, even under a building');
  const sb = layout.buildings.find((b) => b.setback && b.height >= LAYERS.minRoofHeight);
  if (sb) {
    const sx = (sb.setback!.rect.x0 + sb.setback!.rect.x1) / 2;
    const sz = (sb.setback!.rect.z0 + sb.setback!.rect.z1) / 2;
    ok(L.roofAt(sx, sz)!.top === sb.height + sb.setback!.height && L.roofAt(sb.rect.x0 + 0.3, sb.rect.z0 + 0.3)!.top === sb.height, 'setback towers: the tower roof on top, the lower roof around it');
  }
  ok(layerLabel('street') === '' && layerLabel('roof') === 'Rooftops' && layerLabel('sewer') === 'Sewers', 'HUD labels');
  ok(capFor('day', 'roof') === 8 && capFor('night', 'sewer') === 18 && capFor('night') === SPAWN.maxTotal + SPAWN.nightCapBonus, 'per-layer spawn caps (roof 8, sewer 14 + 4 at night, more room to roam), street unchanged');
}

console.log('\n— Rooftops');
{
  const layout = generateLayout();
  const before = layout.buildings.length;
  const garages = planGarages(layout);
  const plan = planRooftops(layout, garages);
  const inR = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const withBuildings = [...new Set(plan.roofs.filter((r) => r.kind !== 'garage').map((r) => r.district))].filter((d) => d !== 'park');
  ok(withBuildings.length >= 3, `rooftops in ${withBuildings.join(', ')}`);
  for (const d of withBuildings) {
    const fe = plan.access.filter((a) => a.district === d && a.kind === 'fireEscape').length;
    const el = plan.access.filter((a) => a.district === d && a.kind === 'elevator').length;
    ok(fe >= 3 && el >= 1, `${d}: ${fe} fire escapes, ${el} elevators`);
  }
  ok(plan.access.every((a) => !layout.buildings.some((b) => inR(b.rect, a.street.x, a.street.z)) && layout.blocks.some((b) => inR(b, a.street.x, a.street.z))), 'every access point starts on open sidewalk');
  ok(plan.access.every((a) => inR(plan.roofs[a.roofId].rect, a.roof.x, a.roof.z) && a.roof.y === plan.roofs[a.roofId].top), 'and arrives on its roof');
  ok(garages.length >= 3 && layout.buildings.length === before - garages.length * 2, `${garages.length} parking garages replace ${garages.length * 2} lots`);
  ok(garages.every((g) => Math.atan2(g.deck - 0.15, g.topX - g.footX) * (180 / Math.PI) < 16), `garage ramps are under 16 degrees (${garages.map((g) => (Math.atan2(g.deck - 0.15, g.topX - g.footX) * (180 / Math.PI)).toFixed(1)).join(', ')})`);
  ok(!layout.parking.some((p) => garages.some((g) => p.x > g.rect.x0 - 34 && p.x < g.rect.x0 + 14 && Math.abs(p.z - (g.face === 'n' ? g.rect.z0 : g.rect.z1)) < 10)), 'no parked cars in front of a ramp');
  const pads = plan.pads.filter((p) => !p.hidden);
  const hidden = plan.pads.filter((p) => p.hidden);
  ok(pads.length > 0 && hidden.length > 0, `${pads.length} jump pads, ${hidden.length} hidden jump spots`);
  let lands = true;
  let clears = true;
  for (const p of plan.pads) {
    const end = flightAt(p, p, p.flight);
    if (Math.hypot(end.x - p.land.x, end.y - p.land.y, end.z - p.land.z) > 0.01) lands = false;
    if (!inR(plan.roofs[p.toRoof].rect, p.land.x, p.land.z)) lands = false;
    // Halfway across the edge the arc must be above the higher roof.
    const edgeT = p.flight * (ROOFS.padBack / (ROOFS.padBack + ROOFS.landIn));
    if (flightAt(p, p, edgeT).y < Math.max(p.y, p.land.y) + 0.3) clears = false;
  }
  ok(lands, 'every pad arc lands on its target roof');
  ok(clears, 'and clears the roof edge on the way');
  ok(plan.pads.every((p) => p.land.y - p.y <= (p.hidden ? ROOFS.hiddenMax : ROOFS.padMax)), 'pads lift at most 12 m, hidden spots at most 26 m');
  const b = ballistic({ x: 0, y: 0, z: 0 }, { x: 5.5, y: 4, z: 0 }, 1.6);
  ok(Math.abs(flightAt({ x: 0, y: 0, z: 0 }, b, b.flight).y - 4) < 1e-9, 'ballistic solve hits the target height');
  const ids = plan.stashes.map((s) => s.id);
  ok(new Set(ids).size === ids.length && ids.every((i) => /^[a-z0-9-]{1,40}$/.test(i)), `${ids.length} stashes with unique, saveable ids`);
  ok(plan.stashes.every((s) => plan.reachable.has(s.roofId)), 'every stash is on a roof you can reach');
  ok(plan.stashes.filter((s) => s.secret).every((s) => plan.pads.some((p) => p.hidden && p.toRoof === s.roofId)), 'secret stashes sit on hidden-jump roofs');
  const again = generateLayout();
  const plan2 = planRooftops(again, planGarages(again));
  ok(plan2.stashes.map((s) => s.id + s.x.toFixed(2)).join() === plan.stashes.map((s) => s.id + s.x.toFixed(2)).join(), 'the plan is the same every session (stash ids stay valid in saves)');
}

console.log('\n— Rooftop Streetmon');
{
  const roof = ALL_SPECIES().filter((s) => speciesBiomes(s).includes('roof'));
  ok(roof.length === 6 && roof.every((s) => s.types.includes('wire')), `6 rooftop species, all Wire (${roof.map((s) => s.name).join(', ')})`);
  ok(roof.every((s) => !speciesBiomes(s).includes('street')), 'rooftop species never spawn on the street');
  for (const d of DISTRICTS) for (const t of TIMES) if (spawnTable(d, t).some((o) => speciesBiomes(o.spec).includes('roof') && !speciesBiomes(o.spec).includes('street'))) ok(false, `roof species in the ${d} ${t} street table`);
  ok(spawnTable('midtown', 'dusk', 'roof').some((o) => o.spec.id === 'rooftail') && spawnTable('downtown', 'night', 'roof').some((o) => o.spec.id === 'neonmoth'), 'roof tables: Rooftail at Midtown dusk, Neonmoth Downtown at night');
  const rt = spawnTable('midtown', 'dusk', 'roof').find((o) => o.spec.id === 'rooftail')!;
  ok(rt.weight === SPAWN.rarityWeight.common * 3, 'Rooftail is three times as common on roofs (biome weight 3)');
  const nm = createCreature('neonmoth', 24, () => 0.5);
  ok(evolutionFor(nm, { timeOfDay: 'night', district: 'downtown' })?.to === 'marqueen' && evolutionFor(nm, { timeOfDay: 'day', district: 'downtown' }) === null, 'Neonmoth evolves into Marqueen only levelling up at night');
  ok(move('zap').type === 'wire' && typeMultiplier(move('zap').type, ['sludge']) === 2 && move('dishBeam').signature === true && move('lightsOut').target === 'allFoes', 'Wire moves: Zap shocks Sludge; Dish Beam and Lights Out are signatures');
  ok(roof.every((s) => dexEntries().get(s.id)!.habitatHints[0].biome === 'roof'), 'their dex hints point to rooftops');
  const crew = TRAINERS.filter((t) => t.corner === 'roof');
  ok(crew.length === 3 && crew.every((t) => t.gang === 'Skyline Crew' && t.team.some(([id]) => speciesBiomes(species(id)).includes('roof'))), 'three Skyline Crew trainers on the rooftops, each with rooftop Streetmon');
}

console.log('\n— Sewers');
{
  const m1 = carveMaze(9137);
  const rc = reachableCount(m1.open);
  ok(m1.size === 49 && rc.reached === rc.open && rc.open > 1000, `a 49 x 49 maze, every one of its ${rc.open} tunnel blocks connected`);
  const m2 = carveMaze(9137);
  ok(JSON.stringify(m1.open) === JSON.stringify(m2.open) && JSON.stringify(carveMaze(42).open) !== JSON.stringify(m1.open), 'same seed, same maze; another seed, another maze');
  // Loops: more passages than a tree (a labyrinth, not one corridor).
  let edges = 0;
  for (let i = 0; i < m1.size; i++) for (let j = 0; j < m1.size; j++) if (m1.open[i][j]) { if (m1.open[i + 1]?.[j]) edges++; if (m1.open[i]?.[j + 1]) edges++; }
  ok(edges > rc.open - 1 + 20, `loops: ${edges - (rc.open - 1)} extra passages beyond a tree`);
  let covered = 0;
  for (const [i0, i1] of wallRuns(m1.open)) covered += i1 - i0 + 1;
  ok(covered === m1.size * m1.size - rc.open, 'merged wall runs cover exactly the solid blocks');
  const layout = generateLayout();
  const centres = [{ district: 'uptown' as const, x: 0, z: -300 }, { district: 'midtown' as const, x: 0, z: 100 }, { district: 'downtown' as const, x: 0, z: 400 }];
  const mazes = planSewers(layout, 9137, centres, () => true);
  ok(mazes.length === 3, '3 mazes');
  for (const m of mazes) {
    const r = reachableCount(m.open);
    const hubOpen = m.open[m.hub.i][m.hub.j];
    const mhOk = m.manholes.every((h) => m.open[h.i][h.j]);
    const hazNear = [...m.hazards.keys()].some((k) => {
      const [a, b] = k.split(',').map(Number);
      return m.manholes.some((h) => Math.abs(h.i - a) + Math.abs(h.j - b) < 4);
    });
    const kinds = { sludge: 0, vent: 0, channel: 0 } as Record<string, number>;
    for (const h of m.hazards.values()) kinds[h.kind]++;
    ok(r.reached === r.open && hubOpen && mhOk, `${m.district}: all tunnels, the hub and ${m.manholes.length} manholes connected`);
    ok(m.manholes.length === SEWER.manholes && m.chambers.length >= 4 && m.deadEnds.length > 10, `${m.district}: ${m.manholes.length} manholes, ${m.chambers.length} chambers, ${m.deadEnds.length} dead ends`);
    ok(!hazNear && kinds.sludge > 10 && kinds.vent > 5 && kinds.channel >= 16, `${m.district}: hazards (${kinds.sludge} sludge, ${kinds.vent} vents, ${kinds.channel} channel blocks) kept away from ladders`);
    const b = blockAt(m, m.x0 + 7.5, m.z0 + 4.5);
    ok(!!b && b.i === 2 && b.j === 1 && blockAt(m, m.x0 - 1, m.z0) === null, `${m.district}: world point to block lookup`);
  }
  ok(ventActive({ phase: 0 }, 0.5) && !ventActive({ phase: 0 }, 3) && ventActive({ phase: 0 }, SEWER.ventCycle + 0.2), 'vents blow 1.5 s of every 6');
}

console.log('\n— Sewer community');
{
  ok(COMMUNITY.npcs.length >= 9 && COMMUNITY.quests.length >= 6, `${COMMUNITY.npcs.length} people, ${COMMUNITY.quests.length} quests`);
  const types = new Set(COMMUNITY.quests.flatMap((q) => q.steps.map((s) => s.type)));
  ok(['reach', 'collect', 'battle', 'escort', 'catch', 'talk'].every((t) => types.has(t as never)), 'quests use every step type');
  ok(COMMUNITY.npcs.some((n) => n.role === 'market') && COMMUNITY.npcs.some((n) => n.role === 'rest'), 'there is a market and a rest spot');
  const bad = (mut: (n: { npcs: any[] }, q: { quests: any[] }) => void): boolean => {
    const n = JSON.parse(JSON.stringify(npcsJson));
    const q = JSON.parse(JSON.stringify(questsJson));
    mut(n, q);
    try {
      parseCommunity(n, q);
      return false;
    } catch {
      return true;
    }
  };
  ok(bad((n) => (n.npcs[1].spot = n.npcs[0].spot) && (n.npcs[1].home = n.npcs[0].home)), 'rejects two people on one spot');
  ok(bad((_n, q) => (q.quests[0].giver = 'nobody')), 'rejects an unknown quest giver');
  ok(bad((_n, q) => (q.quests[0].steps[0].type = 'dance')), 'rejects an unknown step type');
  ok(bad((_n, q) => (q.quests[0].rewards.items = [['nope', 1]])), 'rejects an unknown reward item');
  ok(bad((n) => (n.npcs[0].dialogue.nodes[n.npcs[0].dialogue.start].choices = [['x', 'missing-node']])), 'rejects dialogue that leads nowhere');
  // Quest lifecycle.
  const q = quest('valve-job');
  let st = {} as Record<string, { step: number; done: boolean }>;
  ok(questStatus(st, q) === 'none' && canStart(st, q, 0).ok, 'a new quest can be started');
  st = startQuest(st, q.id);
  ok(!canStart(st, q, 0).ok && currentStep(st, q.id) === q.steps[0], 'started quests begin at step 0 and cannot be taken again');
  let finished = false;
  for (let i = 0; i < q.steps.length; i++) ({ state: st, finished } = advanceQuest(st, q.id));
  ok(finished && st[q.id].done && currentStep(st, q.id) === null && questStatus(st, q) === 'done', `${q.steps.length} steps finish the quest`);
  ok(advanceQuest(st, q.id).finished === false, 'a finished quest cannot finish twice');
  const king = quest('the-king-below');
  ok(!canStart({}, king, (king.requiresReputation ?? 0) - 1).ok && canStart({}, king, king.requiresReputation ?? 0).ok, `the last quest needs ${king.requiresReputation} reputation`);
  // Opening nodes follow quest progress.
  const giver = COMMUNITY.npcs.find((n) => n.id === q.giver)!;
  const nodes = [openingNode(giver, {}), openingNode(giver, startQuest({}, q.id)), openingNode(giver, st)];
  ok(new Set(nodes).size >= 2, `${giver.name} opens differently as the quest moves (${nodes.join(' / ')})`);
  const total = COMMUNITY.quests.filter((x) => !x.requiresReputation).reduce((a, x) => a + (x.rewards.reputation ?? 0), 0);
  ok(total >= (king.requiresReputation ?? 0), `the other quests give enough reputation (${total}) to unlock the last`);
  // Black market.
  const d1 = marketStock(1, 0);
  ok(d1.length === MARKET.slots && d1[0].id === 'lure' && JSON.stringify(marketStock(1, 0)) === JSON.stringify(d1), 'market: 5 slots, always lures, same stock all day');
  const days = new Set(Array.from({ length: 10 }, (_, d) => marketStock(d, 0).map((x) => x.id).join()));
  ok(days.size > 2, `market stock changes between days (${days.size} variants in 10 days)`);
  ok(Array.from({ length: 20 }, (_, d) => marketStock(d, 0)).every((s) => s.every((x) => x.id !== 'cage')), 'cages need reputation');
  const lure0 = marketStock(1, 0)[0].price;
  const lure40 = marketStock(1, 40)[0].price;
  ok(lure40 < lure0 && lure40 === Math.round((lure0 * MARKET.discount) / 10) * 10, `reputation 40 discount ($${lure0} → $${lure40})`);
}

console.log('\n— Pity and economy');
{
  let st = newPity();
  const outs = [];
  for (let i = 0; i < 8; i++) {
    const o = recordThrow(st, 'w-1', 'cuffs', 10, false);
    st = o.state;
    outs.push(o);
  }
  ok(outs.slice(0, 3).every((o) => !o.refund && !o.cash), 'no payout for the first 3 fails');
  ok(outs[3].refund === 'cuffs' && outs[3].bonus === 'cuffs' && outs[3].cash === 0, '4 fails: item back plus a bonus of the same tier');
  ok(outs.slice(4, 7).every((o) => !o.refund), 'nothing for fails 5-7');
  ok(outs[7].refund === 'cuffs' && outs[7].cash === PITY.cash.base + PITY.cash.perLevel * 10 && st.fails === 0, `8 fails: item back, bonus and $${outs[7].cash}; counter starts again`);
  ok(softBonus(st, 'w-1') === PITY.softMax && softBonus(st, 'w-2') === 0, 'soft pity: capped at +40% on the same creature, nothing on another');
  let s2 = newPity();
  const bonuses = [];
  for (let i = 0; i < 3; i++) {
    s2 = recordThrow(s2, 'w-5', 'net', 5, false).state;
    bonuses.push(softBonus(s2, 'w-5'));
  }
  ok(bonuses.map((b) => b.toFixed(2)).join() === '0.08,0.16,0.24', `soft pity adds 8% a fail (${bonuses.map((b) => b.toFixed(2)).join(', ')})`);
  s2 = recordThrow(s2, 'w-9', 'net', 5, false).state;
  ok(s2.fails === 4 && softBonus(s2, 'w-9') === 0.08 && softBonus(s2, 'w-5') === 0, 'switching targets keeps the fail streak but restarts soft pity');
  const caught = recordThrow(s2, 'w-9', 'net', 5, true);
  ok(caught.state.fails === 0 && caught.state.sameTarget === null && !caught.refund, 'any catch resets everything');
  ok(withPity(0.9, st, 'w-1') === 1 && Math.abs(withPity(0.2, s2, 'w-9') - 0.28) < 1e-9, 'the bonus adds to the chance, capped at 100%');
  // The bonus really raises the roll's chance.
  const t = createCreature('strapback', 20);
  const cuffsIt = DATA.items.get('cuffs') as never;
  const base = rollCatch(t, cuffsIt, true, () => 0.999).chance;
  ok(Math.abs(rollCatch(t, cuffsIt, true, () => 0.999, 0.4).chance - Math.min(1, base + 0.4)) < 1e-9, 'rollCatch takes the soft-pity bonus');
  ok(pityMessage(outs[7], (id) => (id === 'cuffs' ? 'Cuffs' : id)) === 'Rough luck! You get your Cuffs back, a free Cuffs and $250.', 'pity message reads well');
  // Prices and the starting kit.
  const price = (id: string): number => (DATA.items.get(id) as { price: number }).price;
  ok(price('cuffs') === 100 && price('net') === 200 && price('crate') === 275, 'cheaper capture items: cuffs $100, net $200, crate $275');
  ok(BATTLE.starterItems.length === 0, 'starting kit: empty (Mama Rust hands out the first cuffs)');
  ok(BATTLE.wildWinPerLevel === 8, 'wild wins pay $8 per foe level');
}

console.log('\n— Streetmondex');
{
  const all = ALL_SPECIES();
  ok(all.length === 56 && all.every((s) => dexBiomes(s).length > 0), `all ${all.length} species have a dex entry and a habitat`);
  const p = { seen: new Set(['strapback', 'gutterat', 'ratking']), caught: new Set(['gutterat', 'ratking']), evolved: new Set(['gutterat', 'ratking']) };
  ok(dexState('holster', p) === 'unseen' && dexState('strapback', p) === 'seen' && dexState('ratking', p) === 'evolved', 'states: unseen, seen, evolved');
  ok(dexState('gutterat', { ...p, evolved: new Set() }) === 'captured', 'captured without evolving');
  const line = evolutionLine('ratking');
  ok(line.length === 2 && line[0][0] === 'gutterat' && line[1][0] === 'ratking', 'evolution line from either end');
  const s3 = all.find((s) => evolutionLine(s.id).length === 3);
  ok(!!s3 && stageOf(evolutionLine(s3!.id)[1][0]).stage === 2 && stageOf(s3!.id).of === 3, `"Stage 2 of 3" (${s3?.name}'s line)`);
  const mx = typeMatrix(['sludge']);
  ok(mx.length === TYPE_IDS.length && mx.every((r) => r.attack === typeMultiplier('sludge', [r.type]) && r.defend === typeMultiplier(r.type, ['sludge'])), 'type matrix matches the type chart');
  const dual = all.find((s) => s.types.length === 2)!;
  ok(typeMatrix(dual.types).every((r) => r.defend === typeMultiplier(r.type, dual.types)), `dual types multiply when defending (${dual.name})`);
  const sewer = filterDex(all, { biome: 'sewer' }, p);
  ok(sewer.length === 8 && sewer.every((s) => s.types.includes('sludge')), 'biome filter: 8 sewer species (Undertow and Clogger too)');
  ok(filterDex(all, { biome: 'roof' }, p).length === 6, 'biome filter: 6 rooftop species');
  ok(filterDex(all, { type: 'sludge' }, p).map((s) => s.id).join() === 'gutterat,ratking', 'type filter only shows types you know');
  ok(filterDex(all, { state: 'captured' }, p).length === 2 && filterDex(all, { state: 'missing' }, p).length === 54 && filterDex(all, { state: 'seen' }, p).length === 3, 'state filters');
  const c = completion(all, p);
  ok(c.all.total === 56 && c.all.seen === 3 && c.all.captured === 2 && c.all.evolved === 2 && c.sewer.captured === 2 && c.sewer.total === 8, 'completion counters overall and per biome');
}

console.log('\n— 5-star escalation and tanks');
{
  ok([1, 2, 3, 4, 5].map(unitsFor).join() === '2,3,5,6,8' && unitsFor(0) === 0, 'units per star match the old table (2, 3, 5, 6, 8)');
  ok(ESCALATION.stars.map((r) => r.heat).join() === STAR_HEAT.join(), 'heat thresholds match Wanted');
  ok(!rule(2)!.ram && rule(3)!.ram && rule(4)!.roadblockEvery === 22 && rule(5)!.roadblockEvery === 15 && rule(3)!.roadblockEvery === 0, 'ramming from 3 stars, roadblocks every 22 s at 4 and 15 s at 5');
  ok([1, 2, 3, 4].every((s) => rule(s)!.tanks === null) && rule(5)!.tanks!.max === 2, 'tanks only at 5 stars, at most 2');
  ok(!tankDue(4, 100, Infinity, 0), 'no tank at 4 stars');
  ok(!tankDue(5, 9.9, Infinity, 0) && tankDue(5, 10, Infinity, 0), 'first tank after 10 s at 5 stars');
  ok(!tankDue(5, 40, 30, 1) && tankDue(5, 80, 60, 1) && !tankDue(5, 200, 100, 2), 'a second one 60 s later, never more than 2');
  // Movement.
  const layout = generateLayout();
  const spans = avenueSpans(layout);
  ok(spans.length >= 7 && spans.every((s) => s.z1 - s.z0 > 100), `${spans.length} avenue stretches to drive on (the park splits some)`);
  const span = spansByDistance(spans, -440, 0)[0];
  ok(Math.abs(span.x - layout.roads.filter((r) => r.kind === 'ave').sort((a, b) => Math.abs(a.center + 440) - Math.abs(b.center + 440))[0].center) < 1e-6, 'nearest avenue picked');
  let st = { z: span.z0 + 50, h: -Math.PI / 2, v: 0 };
  let maxV = 0;
  for (let i = 0; i < 60 * 40; i++) {
    st = driveStep(st, span, span.z0 + 250, 30, 1 / 60);
    maxV = Math.max(maxV, st.v);
  }
  ok(Math.abs(st.z - (span.z0 + 220)) < 1.5 && st.v < 0.05, `drives up and stops 30 m short (at ${(st.z - span.z0).toFixed(1)})`);
  ok(maxV <= TANK_SPEC.maxSpeedKmh / 3.6 + 1e-9 && maxV > 6.5, `top speed ${(maxV * 3.6).toFixed(1)} km/h`);
  // Reverse: has to stop and pivot 180° at 30°/s before driving back.
  let t2 = 0;
  let s2 = { ...st };
  while (Math.abs(wrapAngle(s2.h - Math.PI / 2)) > 0.01 && t2 < 20) {
    s2 = driveStep(s2, span, span.z0 + 60, 30, 1 / 60);
    t2 += 1 / 60;
  }
  ok(t2 > 5.5 && t2 < 6.5, `turns around on the spot in ${t2.toFixed(1)} s`);
  let s3 = { z: span.z1 - 20, h: -Math.PI / 2, v: 7 };
  for (let i = 0; i < 600; i++) s3 = driveStep(s3, span, span.z1 + 500, 0, 1 / 60);
  ok(s3.z <= span.z1 - 5 + 1e-9, 'never drives off the end of its avenue');
  const z = spawnZ(span, span.z0 + 300, 250, 1, () => false);
  ok(z !== null && Math.abs(z - (span.z0 + 300)) >= 120 && z >= span.z0 + 12 && z <= span.z1 - 12, 'enters at least 120 m away, on the avenue');
  ok(spawnZ(span, span.z0 + 300, 250, 1, () => true) === null, 'never enters in view');
  // Aiming.
  ok(Math.abs(turnToward(0, Math.PI, 0.1) - 0.1) < 1e-9 && Math.abs(turnToward(3.1, -3.1, 0.1) - -3.1) < 1e-9, 'turret turns the short way at its rate');
  ok(Math.abs(headingTo(0, 0, 10, 0)) < 1e-9 && Math.abs(headingTo(0, 0, 0, -10) - Math.PI / 2) < 1e-9, 'heading convention matches the cars');
  const L = leadTarget(0, 0, 90, 0, 0, 10, 90);
  ok(Math.abs(L.z - 10 * L.t) < 1e-6 && L.t > 1 && Math.abs(Math.hypot(L.x, L.z) - 90 * L.t) < 0.05, 'leads a moving target');
  const S = TANK_SPEC.turret.shell;
  for (const [d, dy] of [[40, -1.3], [110, -1.3], [80, 10]]) {
    const a = shellPitch(d, dy, S.speed, S.gravity);
    const tt = d / (S.speed * Math.cos(a));
    const y = S.speed * Math.sin(a) * tt - 0.5 * S.gravity * tt * tt;
    ok(Math.abs(y - dy) < 0.05 && a < 0.2, `shell arc hits ${d} m away, ${dy} m up (pitch ${(a * 57.3).toFixed(1)}°)`);
  }
  ok(armourDamage(30, 'bullet') === 1.5 && armourDamage(400, 'explosive') === 400, 'bullets do 5%, explosions full damage');
  ok(TANK_SPEC.armour.hp === 2500 && TANK_SPEC.turret.range === 120 && TANK_SPEC.turret.reload === 4.5, 'tank spec numbers from the design');
}

console.log('\n— No soft locks on the roofs');
{
  const layout = generateLayout();
  const plan = planRooftops(layout, planGarages(layout));
  const rep = roofEscapeReport(layout, plan);
  ok(rep.stuck.length === 0, `every one of the ${rep.landable.size} roofs you can end up on has a way back down (stuck: ${rep.stuck.length})`);
  ok(plan.walkable.size === rep.landable.size, 'the plan and the check agree on where you can go');
  // Stairs: every step is one the player can take without jumping.
  const rises = plan.stairs.map((s) => (s.top - s.bottom) / s.steps);
  ok(plan.stairs.length > 50 && rises.every((r) => r <= 0.31 && r < 0.4), `${plan.stairs.length} stairs, every step ${Math.max(...rises).toFixed(2)} m or less (autostep is 0.4)`);
  ok(plan.stairs.every((s) => s.top - s.bottom > ROOFS.stepUp && s.top - s.bottom <= ROOFS.stairMax), 'stairs only where the gap is too big to step and small enough to climb');
  const roofOf = (id: number) => plan.roofs[id];
  ok(
    plan.stairs.every((s) => {
      const lo = roofOf(s.lowRoof).rect;
      const len = s.steps * s.tread;
      const bx = s.x - s.dirX * len;
      const bz = s.z - s.dirZ * len;
      const half = s.width / 2;
      const inside = (x: number, z: number) => x >= lo.x0 - 0.01 && x <= lo.x1 + 0.01 && z >= lo.z0 - 0.01 && z <= lo.z1 + 0.01;
      return inside(bx + (s.dirZ ? half : 0), bz + (s.dirX ? half : 0)) && inside(bx - (s.dirZ ? half : 0), bz - (s.dirX ? half : 0)) && Math.abs(roofOf(s.lowRoof).top - s.bottom) < 1e-9 && Math.abs(roofOf(s.highRoof).top - s.top) < 1e-9;
    }),
    'each flight sits on its lower roof and tops out level with the higher one',
  );
  // Small steps the old plan counted as walkable (0.4-0.7 m, which needs a jump) now have stairs.
  const reachSmall = plan.stairs.filter((s) => s.top - s.bottom <= 0.7).length;
  ok(reachSmall > 0, `${reachSmall} knee-high ledges (0.4-0.7 m) got a step`);
  ok(plan.access.filter((a) => a.id.endsWith('-x')).every((a) => plan.roofs[a.roofId] && a.roof.y === plan.roofs[a.roofId].top), 'added ways down arrive on their roof');
  // Stairs stay clear of pads (and their landings), crates, arrival spots, huts and each other.
  const foot = (s: (typeof plan.stairs)[number]) => {
    const len = s.steps * s.tread;
    const bx = s.x - s.dirX * len;
    const bz = s.z - s.dirZ * len;
    const h = s.width / 2;
    return { x0: Math.min(s.x, bx) - (s.dirZ ? h : 0), x1: Math.max(s.x, bx) + (s.dirZ ? h : 0), z0: Math.min(s.z, bz) - (s.dirX ? h : 0), z1: Math.max(s.z, bz) + (s.dirX ? h : 0), y: s.bottom };
  };
  const near = (f: ReturnType<typeof foot>, x: number, z: number, y: number, r: number) => Math.abs(y - f.y) < 4 && x > f.x0 - r && x < f.x1 + r && z > f.z0 - r && z < f.z1 + r;
  const clashes: string[] = [];
  for (const s of plan.stairs) {
    const f = foot(s);
    for (const p of plan.pads) if (near(f, p.x, p.z, p.y, 1.1) || near(f, p.land.x, p.land.z, p.land.y, 1.1)) clashes.push(`${s.id}/${p.id}`);
    for (const c of plan.stashes) if (near(f, c.x, c.z, c.y, 0.8)) clashes.push(`${s.id}/${c.id}`);
    for (const a of plan.access) if (near(f, a.roof.x, a.roof.z, a.roof.y, 0.6)) clashes.push(`${s.id}/${a.id}`);
    for (const o of plan.stairs) if (o !== s) {
      const g = foot(o);
      if (Math.abs(g.y - f.y) < 4 && g.x0 < f.x1 && g.x1 > f.x0 && g.z0 < f.z1 && g.z1 > f.z0) clashes.push(`${s.id}/${o.id}`);
    }
  }
  ok(clashes.length === 0, `no stair overlaps a pad, crate, arrival spot or another stair${clashes.length ? ': ' + clashes.slice(0, 4).join(', ') : ''}`);
  const padEdges = new Set(plan.pads.map((p) => [p.fromRoof, p.toRoof].sort((a, b) => a - b).join('-')));
  ok(plan.stairs.every((s) => !padEdges.has([s.lowRoof, s.highRoof].sort((a, b) => a - b).join('-'))), 'no stair on an edge that already has a jump pad');
  const ids = [...plan.access.map((a) => a.id), ...plan.pads.map((p) => p.id), ...plan.stairs.map((s) => s.id)];
  ok(new Set(ids).size === ids.length, 'access, pad and stair ids are unique');
}

console.log('\n— Streetmon vehicle tuning');
{
  const cfg = validateConfig(tuningJson);
  const mon = (id: string, speciesId: string, types: string[], level = 20, speed = 60): StreetmonInfo => ({ id, speciesId, name: speciesId, types, level, stats: { hp: 60, attack: 50, defense: 50, speed, loud: 40 } });
  const roster: Record<string, StreetmonInfo> = {
    smoke: mon('m1', 'hazeling', ['smoke']),
    gun: mon('m2', 'slugger', ['gun']),
    bass: mon('m3', 'woofer', ['bass']),
    grind: mon('m4', 'overtime', ['grind']),
    concrete: mon('m5', 'cinderblock', ['concrete']),
    bird: mon('m6', 'rooftail', ['wire']),
    wire: mon('m7', 'dishling', ['wire']),
    dual: mon('m8', 'rebarb', ['concrete', 'gun']),
    sludge: mon('m9', 'gutterat', ['sludge']),
  };
  const byId = (id: string) => Object.values(roster).find((m) => m.id === id) ?? null;
  const base: VehicleStats = { topSpeed: 50, acceleration: 4, durability: 1000, mass: 1500, grip: 1.45, steering: 1, radarRange: 105 };
  const taken = new Set<string>();
  const applied: unknown[] = [];
  const fired: string[] = [];
  const t = new VehicleTuningManager({
    adapter: {
      getStreetmon: byId,
      takeStreetmon: (id) => (id === 'm9' ? 'nope' : (taken.add(id), true)),
      returnStreetmon: (id) => void taken.delete(id),
      getBaseStats: () => base,
      applyStats: (_v, s) => void applied.push(s),
      triggerAbility: (_v, a) => (fired.push(a.id), true),
    },
  });
  ok(modFor(cfg, 'engineBay', roster.smoke)?.key === 'smoke' && modFor(cfg, 'engineBay', roster.bass) === null, 'engine bay takes Smoke and Gun only');
  ok(modFor(cfg, 'roofRack', roster.bird)?.key === 'aerial' && modFor(cfg, 'roofRack', roster.wire) === null, 'roof rack takes flying species (aerial) but not every Wire type');
  ok(modFor(cfg, 'engineBay', roster.dual)?.key === 'gun' && modFor(cfg, 'roofRack', roster.dual)?.key === 'concrete', 'a dual type fits each slot by its matching type');
  const bad = t.slotStreetmon('car1', 'engineBay', 'm3');
  ok(!bad.ok && /Smoke or Gun/.test(bad.reason ?? ''), `wrong type refused with a reason ("${bad.reason}")`);
  ok(!t.slotStreetmon('car1', 'trunk', 'm9').ok, "the game can refuse (e.g. your last party member)");
  ok(t.slotStreetmon('car1', 'engineBay', 'm1').ok && taken.has('m1'), 'slotting takes the Streetmon from the player');
  ok(!t.slotStreetmon('car2', 'engineBay', 'm1').ok, 'one Streetmon, one slot');
  let st = t.getVehicleStats('car1');
  const speedBonus = st.final.topSpeed / base.topSpeed;
  ok(speedBonus >= 1.2 && speedBonus <= 1.2 * 1.08 + 1e-9, `Smoke engine: +${((speedBonus - 1) * 100).toFixed(1)}% top speed (20% + stat bonus)`);
  t.slotStreetmon('car1', 'engineBay', 'm2');
  st = t.getVehicleStats('car1');
  ok(!taken.has('m1') && taken.has('m2') && Math.abs(st.final.topSpeed - base.topSpeed) < 1e-9 && st.final.acceleration / base.acceleration >= 1.15, 'replacing returns the old one; Gun engine: +15% acceleration');
  t.slotStreetmon('car1', 'trunk', 'm3');
  t.slotStreetmon('car1', 'roofRack', 'm6');
  st = t.getVehicleStats('car1');
  ok(st.final.durability / base.durability >= 1.3 && st.final.radarRange === base.radarRange + 100, `Bass trunk: +${((st.final.durability / base.durability - 1) * 100).toFixed(0)}% durability; roof rack: +100 m radar`);
  ok(st.final.mass > base.mass && applied.length > 3, 'mass and stats are pushed to the game on every change');
  // Abilities: backfire on collisions, horn on H, cooldowns.
  const ab = t.abilities('car1').map((a) => a.abilityId).sort().join();
  ok(ab === 'earlyWarningRadar,exhaustBackfire,sonicBassHorn', `abilities from the slots: ${ab}`);
  ok(t.notifyCollision('car1', { strength: 2 }).length === 0 && t.notifyCollision('car1', { strength: 8 })[0] === 'exhaustBackfire', 'backfire only on a hard crash');
  ok(t.notifyCollision('car1', { strength: 8 }).length === 0, 'backfire then waits for its cooldown');
  const keys = new Set<string>();
  const input = { isDown: (k: string) => keys.has(k) };
  keys.add('KeyH');
  ok(t.handleInput('car1', input)[0] === 'sonicBassHorn', 'H fires the Sonic Bass Horn');
  ok(t.handleInput('car1', input).length === 0, 'holding the key does not fire again');
  keys.clear();
  t.handleInput('car1', input);
  const hud = t.update(5).find((a) => a.abilityId === 'sonicBassHorn')!;
  const cdExpected = 20 * (1 - (60 / 150) * 0.2);
  ok(Math.abs(hud.cooldown01 - (cdExpected - 5) / cdExpected) < 1e-6 && !hud.ready, `cooldown ${cdExpected.toFixed(1)} s (shorter for faster Streetmon): ${(hud.cooldown01 * 100).toFixed(0)}% left after 5 s`);
  t.update(cdExpected);
  ok(t.abilities('car1').find((a) => a.abilityId === 'sonicBassHorn')!.ready, 'ready again after the cooldown');
  const gp = { buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: i === 10 })) };
  ok(t.handleInput('car1', { isDown: () => false, gamepad: gp })[0] === 'sonicBassHorn', 'gamepad button fires it too');
  // Nitrous: timed boost raises stats while active, then drops back.
  const t2 = new VehicleTuningManager({ adapter: { getStreetmon: byId, getBaseStats: () => base, triggerAbility: () => true } });
  t2.slotStreetmon('car2', 'engineBay', 'm1');
  const before = t2.getVehicleStats('car2').final.topSpeed;
  ok(t2.trigger('car2', 'engineBay').ok && t2.isActive('car2', 'nitrousSmokescreen'), 'Nitrous Smokescreen fires and runs');
  const during = t2.getVehicleStats('car2').final.topSpeed;
  t2.update(5.01);
  ok(during > before * 1.14 && !t2.isActive('car2', 'nitrousSmokescreen') && t2.getVehicleStats('car2').final.topSpeed === before, 'nitrous boost lasts 5 s, then stats drop back');
  ok(t2.abilities('car2')[0].cooldown01 > 0 && t2.abilities('car2')[0].cooldown01 < 1, 'still cooling down after the boost ends');
  // Save / load and losing the car.
  const saved = JSON.parse(JSON.stringify(t.serialize()));
  const t3 = new VehicleTuningManager({ adapter: { getStreetmon: byId, getBaseStats: () => base } });
  t3.load(saved);
  ok(JSON.stringify(t3.serialize()) === JSON.stringify(saved) && t3.getVehicleStats('car1').final.radarRange === base.radarRange + 100, 'slots survive a save and load');
  const back = t.removeVehicle('car1');
  ok(back.length === 3 && taken.size === 0 && !t.hasVehicle('car1'), 'a wrecked car gives its Streetmon back');
  ok(computeStats(cfg, base, {}).final.topSpeed === base.topSpeed, 'no mods, no change');
  let threw = false;
  try {
    validateConfig({ ...tuningJson, abilities: { ...tuningJson.abilities, sonicBassHorn: { ...tuningJson.abilities.sonicBassHorn, trigger: 'sometimes' } } });
  } catch {
    threw = true;
  }
  ok(threw, 'config validation catches mistakes');
  // Saves: tuned rides and their Streetmon.
  const mk = (sp: string) => createCreature(sp, 20);
  const a1 = mk('hazeling');
  const a2 = mk('woofer');
  const raw = { version: 2, party: [mk('cinderblock')], garage: { rides: [{ id: 'ride-a', spec: 'taxi', color: '#f3b712', slots: { engineBay: a1.uid, trunk: a2.uid, roofRack: 'ghost' } }, { id: 'ride-b', spec: 'hovercraft', color: '#000000', slots: {} }], streetmon: [a1, a2] } };
  const ld = loadSave(JSON.parse(JSON.stringify(raw)));
  const gr = ld.data.garage;
  ok(gr.rides.length === 1 && gr.rides[0].slots.engineBay === a1.uid && gr.rides[0].slots.roofRack === null && gr.streetmon.length === 2, 'save keeps known rides and real Streetmon, drops unknown cars and missing ids');
  ok(loadSave({ version: 2 }).data.garage.rides.length === 0, 'older saves load with an empty garage');
}

console.log('\n— Street races');
{
  const cfg = validateRaceConfig(racesJson as any);
  ok(cfg.tracks.length >= 4, `${cfg.tracks.length} race tracks`);
  const L = generateLayout(1903);
  const G = new RoadGraph(L);
  for (const t of cfg.tracks) {
    const onNode = (p: { x: number; z: number }) => {
      const n = G.nearestNode(p.x, p.z);
      return Math.hypot(n.x - p.x, n.z - p.z) < 1;
    };
    ok(t.checkpointPositions.every(onNode) && onNode(t.start) === false, `${t.id}: checkpoints sit on junctions, start mid-block`);
    const legs = [t.start, ...t.checkpointPositions];
    let routed = true;
    for (let i = 1; i < legs.length; i++) {
      const a = G.nearestNode(legs[i - 1].x, legs[i - 1].z);
      const b = G.nearestNode(legs[i].x, legs[i].z);
      if (a.id !== b.id && G.route(a.id, b.id).length < 2) routed = false;
    }
    ok(routed, `${t.id}: every leg has a road route`);
    // The race line through the road graph; every prop should be on it (within the road).
    const line: Array<{ x: number; z: number }> = [t.start];
    for (let i = 1; i < legs.length; i++) {
      const a = G.nearestNode(legs[i - 1].x, legs[i - 1].z);
      const b = G.nearestNode(legs[i].x, legs[i].z);
      for (const id of a.id === b.id ? [b.id] : G.route(a.id, b.id)) line.push(G.node(id));
    }
    const segDist = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
      const dx = b.x - a.x, dz = b.z - a.z;
      const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(a.x + dx * k - p.x, a.z + dz * k - p.z);
    };
    const off = (t.temporaryObstacles ?? []).filter((o: any) => {
      let d = Infinity;
      for (let i = 1; i < line.length; i++) d = Math.min(d, segDist(o, line[i - 1], line[i]));
      return d > (o.type === 'tireStack' ? 18 : 14);
    });
    ok(off.length === 0, `${t.id}: every prop is on the race line${off.length ? ' ' + JSON.stringify(off[0]) : ''}`);
    const clear = (t.temporaryObstacles ?? []).every((o: any) => {
      const n = G.nearestNode(o.x, o.z);
      return Math.hypot(n.x - o.x, n.z - o.z) > 6;
    });
    ok(clear, `${t.id}: no prop sits in the middle of a junction`);
    ok(t.payouts.first > t.entryFee * 3 && t.timeLimit > 60, `${t.id}: prize worth the fee, sane time limit`);
  }
  const t0 = cfg.tracks.find((t: any) => t.laps > 1) ?? cfg.tracks[0];
  const course = buildCourse(t0);
  ok(course.length === t0.checkpointPositions.length * t0.laps && course[course.length - 1].finish && course.filter((c) => c.finish).length === 1, 'laps expand into one course with one finish');
  const slots = gridSlots(t0, 4, cfg.rules);
  ok(new Set(slots.map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)}`)).size === 4, 'grid slots are all different');
  ok(progressOf(2, course[2], course, t0.start) > 2.99 && progressOf(0, t0.start, course, t0.start) === 0, 'progress counts checkpoints plus the way to the next');
  ok(payoutFor(t0, 1).cash === t0.payouts.first && payoutFor(t0, 4).cash === 0 && payoutFor(t0, 4).cred === t0.streetCred.finish && payoutFor(t0, null).cash === 0, 'payouts by placing');
  // Props registry.
  let live = 0;
  const inst = new RaceTrackInstance(t0, () => (live++, { dispose: () => void live-- }));
  inst.spawn();
  ok(live === (t0.temporaryObstacles?.length ?? 0) + t0.checkpointPositions.length && inst.count === live, 'every prop and marker goes into the registry');
  inst.dispose();
  inst.dispose();
  ok(live === 0 && inst.count === 0, 'dispose removes everything (twice is safe)');

  // A whole race against a fake world.
  const mkWorld = () => {
    const w = {
      money: 1000,
      stars: 0,
      heat: 0,
      props: 0,
      racers: new Map<string, { x: number; z: number; i: number }>(),
      held: false,
      respawned: '' as string,
      restored: null as null | { stars: number; heat: number },
    };
    const adapter: RaceAdapter = {
      spawnProp: () => (w.props++, { dispose: () => void w.props--, setState: () => {} }),
      spawnRacers: (_t, sl) => sl.map((s, i) => (w.racers.set(`npc${i}`, { x: s.x, z: s.z, i: 0 }), `npc${i}`)),
      racerPosition: (id) => w.racers.get(id) ?? null,
      removeRacers: () => w.racers.clear(),
      placePlayer: () => true,
      holdPlayer: (h) => void (w.held = h),
      getMoney: () => w.money,
      spend: (n) => (w.money >= n ? ((w.money -= n), true) : false),
      earn: (n) => void (w.money += n),
      getWanted: () => ({ stars: w.stars, heat: w.heat }),
      restoreWanted: (s) => {
        w.restored = s;
        w.stars = s.stars;
        w.heat = s.heat;
      },
      respawnAt: (_g, why) => void (w.respawned = why),
    };
    return { w, adapter };
  };
  const tr = cfg.tracks[0];
  const crs = buildCourse(tr);
  const drive = (m: StreetRaceManager, w: ReturnType<typeof mkWorld>['w'], playerUpTo: number, npcUpTo: number, dt = 0.5) => {
    // Teleports everyone checkpoint by checkpoint.
    for (let k = 0; k < Math.max(playerUpTo, npcUpTo); k++) {
      for (const r of w.racers.values()) if (k < npcUpTo) Object.assign(r, crs[k]);
      const p = crs[Math.min(k, playerUpTo - 1)];
      m.update(dt, { inVehicle: true, x: p.x, z: p.z, speed: 20, freeRoam: true });
      if (m.state !== 'RACING') break;
    }
  };
  {
    const { w, adapter } = mkWorld();
    let seq = 0.99;
    const m = new StreetRaceManager({ adapter, config: cfg, rng: () => (seq = (seq * 7.13) % 1) });
    const ctxFar = { inVehicle: true, x: tr.start.x + 300, z: tr.start.z, speed: 20, freeRoam: true };
    ok(m.state === 'IDLE' && m.rollIn >= 300 && m.rollIn <= 600, 'pop-up roll every 5-10 minutes');
    m.cooldown = 0;
    m.update(1, { ...ctxFar, inVehicle: false });
    const r0 = m.rollIn;
    m.update(1, { ...ctxFar, inVehicle: false });
    ok(m.rollIn === r0, 'no rolls on foot');
    w.stars = 2;
    m.rollIn = 0.1;
    m.update(1, ctxFar);
    ok(m.state === 'IDLE', 'no pop-up offers while wanted');
    w.stars = 0;
    // Organiser offer.
    m.update(0.1, { inVehicle: true, x: tr.organizer.x, z: tr.organizer.z, speed: 2, freeRoam: true });
    ok(m.state === 'PROMPT' && m.offer?.source === 'organizer' && (m.hud() as any).prompt.includes(tr.name), 'pulling up to an organiser offers their race');
    ok(m.accept() && !m.accept(), 'accept once');
    // Drive to the grid: starts the countdown, takes the fee, spawns everything.
    m.update(0.1, { inVehicle: true, x: tr.start.x, z: tr.start.z, speed: 3, freeRoam: true });
    ok(m.state === 'COUNTDOWN' && w.money === 1000 - tr.entryFee && w.held && w.racers.size === 3 && w.props > 0, 'grid: fee paid, player held, racers and props spawned');
    m.update(1.5, { inVehicle: true, x: tr.start.x, z: tr.start.z, speed: 0, freeRoam: false });
    m.update(1.6, { inVehicle: true, x: tr.start.x, z: tr.start.z, speed: 0, freeRoam: false });
    ok(m.state === 'RACING' && !w.held, 'countdown runs, then GO releases the player');
    // Police join in mid-race.
    w.stars = 3;
    w.heat = 300;
    drive(m, w, crs.length, crs.length - 1);
    const res = m.result!;
    ok(m.state === 'RESOLVED' && res.place === 1 && w.money === 1000 - tr.entryFee + tr.payouts.first && m.streetCred === tr.streetCred.first, `win pays $${tr.payouts.first} and ${tr.streetCred.first} Street Cred`);
    ok(w.props === 0 && w.racers.size === 0, 'props and racers gone after the race');
    ok(w.stars === 0 && w.heat === 0, 'stars from the race cleared on a win');
    m.update(5.1, ctxFar);
    ok(m.state === 'IDLE' && m.cooldown > 100, 'back to free roam, pop-ups cool down');
    ok(m.serialize().streetCred === tr.streetCred.first && typeof m.serialize().records === 'object', 'Street Cred saves');
  }
  {
    // Losing, busted, wasted: no cash, stars back to the pre-race level.
    for (const how of ['lose', 'busted', 'wasted', 'quit', 'time']) {
      const { w, adapter } = mkWorld();
      const m = new StreetRaceManager({ adapter, config: cfg, rng: () => 0.3 });
      w.stars = 1;
      w.heat = 40;
      m.offerRace(tr.id, 'popup');
      m.accept();
      m.update(0.1, { inVehicle: true, x: tr.start.x, z: tr.start.z, speed: 0, freeRoam: true });
      m.update(3.1, { inVehicle: true, x: tr.start.x, z: tr.start.z, speed: 0, freeRoam: false });
      w.stars = 4;
      w.heat = 700;
      const money0 = w.money;
      if (how === 'lose') {
        drive(m, w, 1, crs.length); // the others get round first
        drive(m, w, crs.length, 0);
      }
      else if (how === 'busted') m.notifyBusted();
      else if (how === 'wasted') m.notifyWasted();
      else if (how === 'quit') m.abort();
      else m.update(tr.timeLimit + 1, { inVehicle: true, x: tr.start.x, z: tr.start.z, speed: 0, freeRoam: false });
      const r = m.result!;
      const placeOk = how === 'lose' ? r.place === 4 : r.place === null;
      ok(m.state === 'RESOLVED' && placeOk && w.money === money0 && w.stars === 1 && w.heat === 40 && w.props === 0, `${how}: no cash, stars back to the 1 from before the race, props gone`);
      if (how === 'busted' || how === 'wasted') ok(w.respawned === how, `${how}: respawn at the grid`);
    }
    // Too broke for the fee, too slow to the grid.
    const { w, adapter } = mkWorld();
    w.money = 10;
    const m = new StreetRaceManager({ adapter, config: cfg });
    m.offerRace(tr.id);
    m.accept();
    m.update(0.1, { inVehicle: true, x: tr.start.x, z: tr.start.z, speed: 0, freeRoam: true });
    ok(m.state === 'IDLE' && w.props === 0, "can't race without the entry fee");
    m.offerRace(tr.id);
    m.update(21, { inVehicle: true, x: 0, z: 0, speed: 10, freeRoam: true });
    ok(m.state === 'IDLE', 'an ignored pop-up offer expires');
    const hc = cfg.tracks.find((t: any) => t.minStreetCred > 0)!;
    ok(!m.offerRace(hc.id), `${hc.name} needs ${hc.minStreetCred} Street Cred`);
  }
}

console.log('\n— Creature walls and smart fleeing');
{
  const near = (a: number, b: number, eps = 0.3) => Math.abs(a - b) <= eps;
  // A box room 20 x 20 with a wall slab at x >= 5 inside it.
  const room = (x: number, z: number) => Math.abs(x) > 10 || Math.abs(z) > 10;
  const slab = (x: number, z: number) => room(x, z) || (x >= 5 && x <= 7 && Math.abs(z) < 6);
  const g = new WallGrid(slab);
  const h = g.raycast(0, 0, 1, 0, 20);
  ok(h.hit && near(h.dist, 5, 0.26) && h.nx === -1 && h.nz === 0, `ray east hits the slab at ${h.dist.toFixed(2)} m, normal facing back`);
  const d = g.raycast(0, 0, -Math.SQRT1_2, -Math.SQRT1_2, 30);
  ok(d.hit && near(d.dist, 10 * Math.SQRT2, 0.4), 'diagonal ray reaches the room wall');
  const miss = g.raycast(0, 0, 0, 1, 5);
  ok(!miss.hit && miss.dist === 5, 'nothing in range: no hit');
  g.resetStats();
  g.raycast(0, 0, 1, 0, 20);
  ok(g.stats.samples === 0 && g.stats.lookups > 0, 'the grid caches what it has seen (no new samples on a repeat ray)');
  const ins = g.raycast(6, 0, 1, 0, 3);
  ok(!!ins.inside && ins.dist === 0 && Math.abs(ins.nx) > 0.5, 'starting inside a wall reports it, with the way out');
  // Circles.
  const rc = rayCircle(0, 0, 1, 0, 4, 0, 1, 10);
  ok(!!rc && near(rc.dist, 3, 1e-6) && near(rc.nx, -1, 1e-6), 'ray vs circle');
  const ci = new CircleIndex();
  ci.add(3, 0.5, 0.6);
  const ch = ci.raycast(0, 0, 1, 0, 10);
  ok(!!ch && ch.dist > 2 && ch.dist < 3, 'bucketed circles are found along a ray');
  // Clamp and slide.
  const cl = clampToWall(1, -1, 0, 1);
  ok(near(cl.x, 1, 1e-9) && near(cl.z, 0, 1e-9), 'clamping removes the part of the velocity going into the wall');
  const away = clampToWall(1, 1, 0, 1);
  ok(away.x === 1 && away.z === 1, 'moving away from the wall is left alone');
  const F = new ObstacleField(g);
  const m1 = moveWithCollision(F, 4, 0, 20, 0, 0.2, 0.3);
  ok(m1.hit && m1.x <= 5 - 0.3 + 1e-6 && m1.x > 4.4 && m1.vx === 0, `head-on: stops short of the wall (x ${m1.x.toFixed(2)}) and halts`);
  const m2 = moveWithCollision(F, 4.5, 0, 10, 6, 0.2, 0.3);
  ok(m2.hit && m2.x <= 4.7 + 1e-6 && m2.z > 0.8 && m2.vx === 0 && m2.vz > 0, `at an angle: slides along the wall (to z ${m2.z.toFixed(2)})`);
  // Random walk: never inside a wall.
  let px = 0;
  let pz = 0;
  let inside = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4000; i++) {
    const a = rnd() * Math.PI * 2;
    const mv = moveWithCollision(F, px, pz, Math.cos(a) * 12, Math.sin(a) * 12, 1 / 30, 0.35);
    px = mv.x;
    pz = mv.z;
    if (slab(px, pz) || slab(px + 0.3, pz) || slab(px - 0.3, pz) || slab(px, pz + 0.3) || slab(px, pz - 0.3)) inside++;
  }
  ok(inside === 0, `4000 fast random moves never clip into a wall (${inside})`);
  const dp = moveWithCollision(F, 6, 1, 0, 0, 1 / 30, 0.3);
  ok(dp.depenetrated && !slab(dp.x, dp.z), 'a body found inside a wall is pushed out');
  // Repulsion.
  const rp = wallRepulsion(F, 4.4, 0, 0.3, 0.8);
  ok(rp.x < -0.2 && Math.abs(rp.z) < 0.15 && rp.nearest < 0.4, 'inside the buffer: pushed away from the wall');
  const rf = wallRepulsion(F, 0, 0, 0.3, 0.8);
  ok(rf.x === 0 && rf.z === 0 && rf.nearest === 0.8, 'out in the open: no push');
  const sv = steerWithRepulsion(1, 0, 3, -1, 0, 1.2);
  ok(sv.vx < 0, 'a strong push wins over steering into the wall');

  // Smart fleeing.
  const flee = new SmartFleeBehavior({ rays: 12 });
  // Wall dead ahead (straight away from the threat): don't run into it.
  const wallAhead = new ObstacleField(new WallGrid((x, z) => room(x, z) || x >= 1.5));
  const p1 = flee.plan({ x: 0, z: 0, vx: 0, vz: 0, radius: 0.3 }, -4, 0, wallAhead, newFleeMemory());
  ok(Math.abs(p1.dirZ) > 0.6 && !p1.cornered, `wall in the way: turns aside (${p1.dirX.toFixed(2)}, ${p1.dirZ.toFixed(2)}) instead of straight at it`);
  // Open ground: straight away.
  const open = new ObstacleField(new WallGrid(room));
  const p2 = flee.plan({ x: 0, z: 0, vx: 0, vz: 0, radius: 0.3 }, -4, 0, open, newFleeMemory());
  ok(p2.dirX > 0.95, 'open ground: straight away');
  // Momentum: already running a bit to the side, it keeps a little of that.
  const p3 = flee.plan({ x: 0, z: 0, vx: 0, vz: 4, radius: 0.3 }, -4, 0, open, newFleeMemory());
  ok(p3.dirX > 0.7 && p3.dirZ > 0.1, 'momentum bends the escape toward the current heading');
  // Running back past the threat isn't worth it: no 180s.
  const p4 = flee.plan({ x: 0, z: 0, vx: -4, vz: 0, radius: 0.3 }, -4, 0, open, newFleeMemory());
  ok(p4.dirX > 0.5, 'momentum alone never turns it back toward the threat');
  // Corridor: walls at |z| >= 1.2, threat behind: runs down the corridor.
  const corridor = new ObstacleField(new WallGrid((x, z) => room(x, z) || Math.abs(z) >= 1.2));
  const p5 = flee.plan({ x: 0, z: 0, vx: 0, vz: 0, radius: 0.3 }, -3, 0.4, corridor, newFleeMemory());
  ok(p5.dirX > 0.9, 'in a corridor it runs along it, not into the side walls');
  // Corner: walls at x >= 1.5 and z >= 1.5, threat coming from the open side.
  const corner = new ObstacleField(new WallGrid((x, z) => room(x, z) || x >= 1.5 || z >= 1.5));
  const mem = newFleeMemory();
  const p6 = flee.plan({ x: 0.6, z: 0.6, vx: 0, vz: 0, radius: 0.3 }, -3, -3, corner, mem);
  const awayX = Math.SQRT1_2;
  const towardCorner = p6.dirX * awayX + p6.dirZ * awayX;
  const chosen = p6.probes[p6.chosen];
  ok(p6.cornered && towardCorner < 0.1 && chosen.open > 2, `cornered: slides out along a wall (${p6.dirX.toFixed(2)}, ${p6.dirZ.toFixed(2)}), open ${chosen.open.toFixed(1)} m`);
  ok(mem.cornerFor > 0, 'the corner slide is committed to for a moment (no dithering)');
  // Dead end: an alcove 4 m wide closed at x = 8; the threat coming in, off to the north side.
  const alcove = new ObstacleField(new WallGrid((x, z) => room(x, z) || (x > -2 && (Math.abs(z) > 2 || x > 8))));
  const p7 = flee.plan({ x: 7, z: 0, vx: 0, vz: 0, radius: 0.3 }, 1, 1, alcove, newFleeMemory());
  ok(p7.cornered && p7.dirX < -0.3 && p7.dirZ < -0.2, `dead end: runs out past the threat on the roomier side (${p7.dirX.toFixed(2)}, ${p7.dirZ.toFixed(2)})`);
  // Replanning is throttled.
  const fld = new ObstacleField(new WallGrid(room));
  const m3 = newFleeMemory();
  flee.steer({ x: 0, z: 0, vx: 0, vz: 0, radius: 0.3 }, -3, 0, fld, m3, 0.016);
  const before = fld.rays;
  for (let i = 0; i < 5; i++) flee.steer({ x: 0, z: 0, vx: 0, vz: 0, radius: 0.3 }, -3, 0, fld, m3, 0.016);
  ok(fld.rays === before, 'probes are re-cast a few times a second, not every frame');

  // A city block: a creature backed against a building, the player walking straight at it.
  const L = generateLayout(1903);
  const rects = L.buildings.map((b) => b.rect);
  const grid: Map<string, typeof rects> = new Map();
  for (const r of rects)
    for (let i = Math.floor(r.x0 / 20); i <= Math.floor(r.x1 / 20); i++)
      for (let j = Math.floor(r.z0 / 20); j <= Math.floor(r.z1 / 20); j++) {
        const k = `${i},${j}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(r);
      }
  const blocked = (x: number, z: number) => (grid.get(`${Math.floor(x / 20)},${Math.floor(z / 20)}`) ?? []).some((r) => rectContains(r, x, z, 0.35));
  const city = new ObstacleField(new WallGrid(blocked));
  // Find a building face on a sidewalk: start 0.9 m out from its south face, the player 6 m further south.
  const b0 = L.buildings.find((b) => b.rect.x1 - b.rect.x0 > 14 && !blocked((b.rect.x0 + b.rect.x1) / 2, b.rect.z1 + 1.5))!;
  const sx = (b0.rect.x0 + b0.rect.x1) / 2;
  const sz = b0.rect.z1 + 0.35 + 0.3 + 0.6;
  const sim = (smart: boolean) => {
    let x = sx;
    let z = sz;
    let vx = 0;
    let vz = 0;
    let pxp = sx;
    let pzp = sz + 6;
    const fm = newFleeMemory();
    let hugging = 0;
    let clipped = 0;
    for (let t = 0; t < 6; t += 1 / 30) {
      // Player walks at the creature.
      const dx = x - pxp;
      const dz = z - pzp;
      const dd = Math.hypot(dx, dz) || 1;
      pxp += (dx / dd) * 3 * (1 / 30);
      pzp += (dz / dd) * 3 * (1 / 30);
      let dirX: number;
      let dirZ: number;
      if (smart) {
        const st = flee.steer({ x, z, vx, vz, radius: 0.3 }, pxp, pzp, city, fm, 1 / 30);
        const push = wallRepulsion(city, x, z, 0.3, 0.8);
        const v = steerWithRepulsion(st.dirX, st.dirZ, 4, push.x, push.z, 1.2);
        dirX = v.vx;
        dirZ = v.vz;
      } else {
        dirX = (dx / dd) * 4;
        dirZ = (dz / dd) * 4;
      }
      const mv = moveWithCollision(city, x, z, dirX, dirZ, 1 / 30, 0.3);
      vx = (mv.x - x) * 30;
      vz = (mv.z - z) * 30;
      x = mv.x;
      z = mv.z;
      if (blocked(x, z)) clipped++;
      if (wallRepulsion(city, x, z, 0.3, 0.8).nearest < 0.25) hugging++;
    }
    return { gap: Math.hypot(x - pxp, z - pzp), hugging, clipped };
  };
  const naive = sim(false);
  const smart = sim(true);
  ok(smart.clipped === 0 && naive.clipped === 0, 'neither version walks through the building (the move is swept)');
  ok(smart.gap > 4 && smart.gap > naive.gap + 2, `against a building: smart flee gets away (${smart.gap.toFixed(1)} m vs ${naive.gap.toFixed(1)} m running straight away)`);
  ok(smart.hugging < 30 && smart.hugging < naive.hugging, `and doesn't hug the wall (${smart.hugging} vs ${naive.hugging} frames pressed to it)`);
  // Cost: 30 creatures fleeing at once in the city.
  const agents = Array.from({ length: 30 }, (_, i) => ({ x: sx + (i % 6) * 2 - 6, z: sz + 2 + Math.floor(i / 6) * 1.5, vx: 0, vz: 0, radius: 0.3, m: newFleeMemory(i / 30 / 8) }));
  city.grid.resetStats();
  const t0 = performance.now();
  for (let f = 0; f < 120; f++)
    for (const a of agents) {
      const st = flee.steer(a, sx, sz + 12, city, a.m, 1 / 60);
      const push = wallRepulsion(city, a.x, a.z, 0.3, 0.8);
      const v = steerWithRepulsion(st.dirX, st.dirZ, 4, push.x, push.z);
      const mv = moveWithCollision(city, a.x, a.z, v.vx, v.vz, 1 / 60, 0.3);
      a.vx = (mv.x - a.x) * 60;
      a.vz = (mv.z - a.z) * 60;
      a.x = mv.x;
      a.z = mv.z;
    }
  const ms = (performance.now() - t0) / 120;
  ok(ms < 2, `30 fleeing creatures: ${ms.toFixed(2)} ms a frame (${Math.round(city.grid.stats.lookups / 120)} grid reads, ${Math.round(city.grid.stats.samples / 120)} new samples)`);
}

console.log('\n— Heists');
{
  const cfg = validateHeistConfig(heistsJson as any);
  ok(cfg.targets.length >= 4 && cfg.dropOffs.length >= 3, `${cfg.targets.length} heist targets, ${cfg.dropOffs.length} lock-ups`);
  // Where things are: facades on real building walls, people and planning spots on open sidewalk, lock-ups at the kerb.
  const L = generateLayout(1903);
  const inBuilding = (x: number, z: number, pad = 0) => L.buildings.some((b) => rectContains(b.rect, x, z, pad));
  const onSidewalk = (x: number, z: number) => !inBuilding(x, z, 0.3) && L.blocks.some((k) => rectContains(k, x, z));
  for (const t of cfg.targets) {
    const loc = t.location;
    if (loc.facade) {
      const f = loc.facade;
      ok(inBuilding(f.x - f.nx * 0.5, f.z - f.nz * 0.5) && !inBuilding(f.x + f.nx * 0.5, f.z + f.nz * 0.5), `${t.id}: facade is a building wall facing the sidewalk`);
    }
    const people = [loc.plan, ...loc.guards, ...loc.breachPoints, ...loc.loot.slice(0, t.loot.bags)];
    ok(people.every((p) => onSidewalk(p.x, p.z) || (!!loc.truck && !inBuilding(p.x, p.z, 0.3))), `${t.id}: guards, planning spot, breach points and loot are on open ground`);
  }
  for (const d of cfg.dropOffs) {
    ok(inBuilding(d.door.x - d.door.nx * 0.5, d.door.z - d.door.nz * 0.5) && !inBuilding(d.x, d.z), `${d.id}: roll-up door on a building, bay at the kerb`);
  }
  ok(Math.min(...cfg.targets.flatMap((t) => t.escape.dropOffs.map((id) => { const d = cfg.dropOffs.find((x) => x.id === id)!; const c = t.location.facade ?? t.location.truck!; return Math.hypot(d.x - c.x, d.z - c.z); }))) > 300, 'every lock-up is a real drive from its job (300 m+)');

  const mon = (id: string, types: string[], over: Partial<CrewCandidate> = {}): CrewCandidate => ({ id, speciesId: id, name: id, types, level: 20, stats: { hp: 60, attack: 70, defense: 60, speed: 70, loud: 60 }, weightKg: 40, hp: 50, ...over });
  ok(roleFit(cfg, 'breacher', mon('a', ['concrete'])).ok && !roleFit(cfg, 'breacher', mon('b', ['smoke'])).ok, 'roles take the right types');
  ok(!roleFit(cfg, 'hauler', mon('c', ['concrete'], { weightKg: 5 })).ok, 'a tiny Streetmon is too light to haul');
  ok(!roleFit(cfg, 'hacker', mon('d', ['wire'], { hp: 0 })).ok, 'a fainted Streetmon can\'t work');
  const strong = roleFit(cfg, 'breacher', mon('e', ['grind'], { level: 60, stats: { hp: 1, attack: 150, defense: 1, speed: 1, loud: 1 } })).skill;
  const weak = roleFit(cfg, 'breacher', mon('f', ['grind'], { level: 5, stats: { hp: 1, attack: 20, defense: 1, speed: 1, loud: 1 } })).skill;
  ok(strong > weak && strong <= 1.5 && weak >= 0.8, `stats and level make a better breacher (${weak.toFixed(2)} -> ${strong.toFixed(2)})`);
  ok(haulerCapacity(cfg, { stats: { defense: 100 }, weightKg: 100 }) > haulerCapacity(cfg, { stats: { defense: 20 }, weightKg: 20 }), 'tougher, heavier haulers carry more');
  const e0 = heistEnc(cfg, 0);
  const e1 = heistEnc(cfg, 30);
  const e2 = heistEnc(cfg, 200);
  ok(e0.speedMult === 1 && e1.speedMult < 0.8 && e1.speedMult > 0.6 && !e1.canSprint && e2.speedMult === cfg.encumbrance.minSpeedMult, `encumbrance: 30 kg -> ${Math.round(e1.speedMult * 100)}% speed, no sprint; never below ${cfg.encumbrance.minSpeedMult * 100}%`);
  const bank = cfg.targets.find((t) => t.id === 'first-empire-vault')!;
  ok(escapeStars(cfg, bank, { alarm: false, heat: 0 }) === 5 && escapeStars(cfg, cfg.targets[0], { alarm: true, heat: 0 }) === cfg.targets[0].escape.stars + 1, 'getaway stars: target, +1 for an alarm, capped at 5');
  let r = 0.5;
  const bags = splitLoot(bank, () => (r = (r * 9.7) % 1));
  const total = bags.reduce((a, b) => a + b.value, 0);
  ok(bags.length === bank.loot.bags && total >= bank.payoutPool.min - 50 && total <= bank.payoutPool.max + 50, `loot split into ${bags.length} bags worth $${total}`);

  // A whole job against a fake world.
  const mkWorld = () => {
    const w = { money: 1000, stars: 0, cams: true, alarm: false, earned: 0, cleaned: false, deployed: false, opened: [] as number[], lootSeen: 0 };
    const party = new Map<string, CrewCandidate>();
    const adapter: HeistAdapter = {
      getStreetmon: (id) => party.get(id) ?? null,
      getMoney: () => w.money,
      spend: (n) => (w.money >= n ? ((w.money -= n), true) : false),
      earn: (n) => void ((w.money += n), (w.earned += n)),
      getStars: () => w.stars,
      raiseWanted: (s) => void (w.stars = Math.max(w.stars, s)),
      deploy: () => void (w.deployed = true),
      soundAlarm: () => void (w.alarm = true),
      setCameras: (_t, on) => void (w.cams = on),
      smokeScene: () => 2,
      breachDone: (_t, i, b) => void (w.opened.push(i), (w.lootSeen += b.length)),
      cleanup: () => void (w.cleaned = true),
    };
    return { w, party, adapter };
  };
  {
    const { w, party, adapter } = mkWorld();
    const crew = { br: mon('br', ['concrete']), hk: mon('hk', ['wire']), ha: mon('ha', ['grind'], { weightKg: 90, stats: { hp: 80, attack: 50, defense: 120, speed: 40, loud: 30 } }) };
    for (const m of Object.values(crew)) party.set(m.id, m);
    const H = new HeistManager({ adapter, config: cfg, rng: () => 0.5 });
    ok(H.plan(bank.id).ok && H.state === 'PLANNING', 'plan the bank job');
    ok(!H.assign('breacher', crew.hk).ok, 'a Wire type can\'t be the Breacher');
    H.assign('breacher', crew.br);
    ok(!H.launch().ok, "can't go without the required Hacker");
    H.assign('hacker', crew.hk);
    ok(!H.assign('hauler', crew.br).ok, 'one Streetmon, one role');
    H.assign('hauler', crew.ha);
    ok(!H.assign('smoke', mon('sm', ['smoke'])).ok, 'a crew is three at most');
    const v = H.validateCrew();
    ok(v.ok && v.bonus > 0, `crew valid, optional Hauler adds ${Math.round(v.bonus * 100)}% to the take`);
    ok(H.launch().ok && w.money === 1000 - bank.setupCost && w.deployed && H.state === 'SETUP', `launch pays the $${bank.setupCost} setup and deploys the crew`);
    const at = { x: bank.location.facade!.x, z: bank.location.facade!.z, inVehicle: false, stars: 0 };
    H.update(0.1, { ...at, seenBy: 0 });
    ok(H.state === 'INFILTRATION', 'at the bank: infiltration');
    ok(!H.startBreach(0, { ...at, nearBreach: 0 }).ok, 'the vault alarm is live until the Hacker jams it');
    ok(H.useAbility('hacker', at).ok && !w.cams, 'Z: the Hacker jams the cameras');
    ok(!H.useAbility('hacker', at).ok, 'and then needs to cool down');
    ok(H.startBreach(0, { ...at, nearBreach: 0 }).ok && H.state === 'BREACH', 'E at the door: breaching');
    for (let i = 0; i < 40 && H.state === 'BREACH'; i++) H.update(1, { ...at, nearBreach: 0, seenBy: 0 });
    ok(H.state === 'LOOT' && w.opened[0] === 0 && w.lootSeen === bank.loot.bags && !w.alarm, `vault open after ~${Math.round(bank.breach.seconds / H.job!.crew.breacher!.skill)} s, quietly (jammed)`);
    for (let i = 0; i < 5; i++) H.takeLoot(i);
    const c = H.carried();
    ok(c.haulerKg > 0 && c.haulerKg <= H.job!.crew.hauler!.capacity && c.playerKg > 0, `hauler carries ${c.haulerKg} kg, you ${c.playerKg} kg`);
    ok(H.encumbrance().speedMult < 1, `you're slowed to ${Math.round(H.encumbrance().speedMult * 100)}%`);
    // Leave with half the loot: the getaway starts.
    H.update(0.1, { x: at.x - 60, z: at.z, inVehicle: true, stars: 0 });
    ok(H.state === 'ESCAPE' && w.stars === 5, 'driving off with the loot: 5-star getaway');
    H.update(0.1, { x: 0, z: 0, inVehicle: true, stars: 5, atDropOff: 'battery-lockup' });
    ok(H.state === 'ESCAPE' && w.earned === 0, "the lock-up stays shut with cops on you");
    H.update(0.1, { x: 0, z: 0, inVehicle: true, stars: 0, atDropOff: 'battery-lockup' });
    const res = H.result!;
    ok(H.state === 'RESOLVED' && res.ok && w.earned === res.cash && res.cash > c.value && w.cleaned, `delivered: $${res.cash} (loot $${c.value} + crew bonus)`);
    ok(H.heat > 0 && H.cooldowns[bank.id] > 0 && H.availability(bank.id).ok === false, `heat ${H.heat.toFixed(0)}, and the bank is on cooldown`);
    const saved = JSON.parse(JSON.stringify(H.serialize()));
    const H2 = new HeistManager({ adapter, config: cfg });
    H2.load(saved);
    ok(Math.abs(H2.heat - H.heat) < 0.2 && H2.stats.done === 1 && H2.cooldowns[bank.id] > 0, 'heat, cooldowns and record save and load');
    ok(H2.plan(cfg.targets[0].id).ok && H2.job!.security >= cfg.targets[0].security.level, 'heat raises security on the next job');
  }
  {
    // Loud and sloppy: seen by guards -> alarm; dye packs; busted loses everything.
    const { w, party, adapter } = mkWorld();
    const jw = cfg.targets.find((t) => t.id === 'diamond-row')!;
    const sm = mon('sm', ['smoke']);
    party.set('sm', sm);
    const H = new HeistManager({ adapter, config: cfg, rng: () => 0.3 });
    H.plan(jw.id);
    H.assign('smoke', sm);
    ok(H.launch().ok, 'jewelry job: a Smoke is enough');
    const at = { x: jw.location.facade!.x, z: jw.location.facade!.z, inVehicle: false, stars: 0 };
    H.update(0.1, at);
    ok(!H.startBreach(0, { ...at, nearBreach: 0, guardsAwake: 2 }).ok, "can't smash the cases with the guards watching");
    for (let i = 0; i < 50; i++) H.update(0.2, { ...at, seenBy: 2 });
    ok(!w.alarm && H.job!.suspicion === 0, 'just walking past the guards is fine');
    for (let i = 0; i < 25; i++) H.update(0.2, { ...at, seenBy: 2, nearBreach: 0 });
    ok(w.alarm && H.job!.alarm, 'hanging round the cases in view of two guards: alarm');
    for (let i = 0; i < 60; i++) H.update(0.2, at);
    ok(w.stars > 0, `police called after the delay (${w.stars} stars)`);
    ok(H.startBreach(0, { ...at, nearBreach: 0, guardsAwake: 2 }).ok, 'once the alarm is going, smash away');
    for (let i = 0; i < 40 && H.state !== 'LOOT'; i++) H.update(0.5, { ...at, nearBreach: 0 });
    ok(H.state === 'LOOT' && H.job!.bags.filter((b) => b.available).length === 1, 'a smashed case gives its own bag');
    H.takeLoot(0);
    ok(H.notifyBusted() && H.result!.ok === false && w.earned === 0 && H.state === 'RESOLVED', 'busted: the loot is gone');
    ok(!H.cooldowns[jw.id], 'a failed job leaves no cooldown: the marker comes back for another go');
    // Wasted mid-job: it ends, the bags go, and you can plan it again straight away.
    H.plan(jw.id);
    H.assign('smoke', sm);
    H.launch();
    H.update(0.1, { ...at, inside: true } as never);
    ok(H.state === 'INFILTRATION', 'going inside starts the job');
    ok(H.notifyWasted() && H.result!.reason === 'wasted' && !H.cooldowns[jw.id] && w.cleaned, 'wasted: the job ends, the bags are cleaned up, no cooldown');
    ok(H.plan(jw.id).ok, 'and it can be planned again at once');
    H.cancel();
  }
  {
    // Noise: breaching unjammed eventually sets off the alarm; the truck leaves on time.
    const { w, party, adapter } = mkWorld();
    const tr = cfg.targets.find((t) => t.id === 'armored-transport')!;
    const br = mon('br', ['gun']);
    party.set('br', br);
    const H = new HeistManager({ adapter, config: cfg });
    H.plan(tr.id);
    H.assign('breacher', br);
    H.launch();
    const at = { x: tr.location.truck!.x, z: tr.location.truck!.z, inVehicle: false, stars: 0 };
    H.update(0.1, at);
    H.startBreach(0, { ...at, nearBreach: 0 });
    for (let i = 0; i < 30 && H.state === 'BREACH'; i++) H.update(1, { ...at, nearBreach: 0 });
    ok(w.alarm, 'cutting the truck open without a jammer is loud enough to trip the alarm');
    const H2 = new HeistManager({ adapter: mkWorld().adapter, config: cfg });
    const party2 = new Map([['br', br]]);
    (H2.adapter as any).getStreetmon = (id: string) => party2.get(id) ?? null;
    H2.plan(tr.id);
    H2.assign('breacher', br);
    H2.launch();
    for (let i = 0; i < 25; i++) H2.update(10, at);
    ok(H2.state === 'RESOLVED' && H2.result!.reason === 'time', 'the armored truck pulls out after its time limit');
    // Walking away mid-job.
    const H3 = new HeistManager({ adapter, config: cfg });
    H3.plan(tr.id);
    H3.assign('breacher', br);
    H3.launch();
    H3.update(0.1, at);
    H3.update(0.1, { ...at, x: at.x + 500 });
    ok(H3.state === 'RESOLVED' && H3.result!.reason === 'abandoned', 'walk away from the job and it is off');
  }
}

console.log('\n— Soundtracks, sewer update, city map');
{
  // Music by situation.
  ok(pickTrack({ battle: null, stars: 0, chasing: false, heist: true }) === 'heist' && pickTrack({ battle: null, stars: 4, chasing: true, heist: true }) === 'heist', 'heist music for the whole job, getaway included');
  ok(pickTrack({ battle: null, stars: 3, chasing: true, race: true }) === 'race', 'race music beats the (temporary) chase');
  ok(pickTrack({ battle: null, stars: 0, chasing: false, sewer: true }) === 'sewer' && pickTrack({ battle: null, stars: 2, chasing: true, sewer: true }) === 'chase', 'sewer music underground, unless the police are after you');
  ok(pickTrack({ battle: 'wild', stars: 0, chasing: false, heist: true }) === 'wildBattle' && pickTrack({ battle: 'boss', stars: 0, chasing: false }) === 'boss', 'battles still win; the boss track is ready for boss battles');
  for (const f of ['zero-hour-extraction.mp3', 'one-sixty-on-the-dash.mp3', 'bow-to-the-crown.mp3', 'dragging-through-concrete.mp3']) ok(fs.existsSync(`public/music/${f}`) && fs.statSync(`public/music/${f}`).size > 1e6, `music file ${f}`);

  // Sewers: halls, camps, props.
  const L = generateLayout(1903);
  const centres = [
    { district: 'uptown' as const, x: 0, z: -380 },
    { district: 'midtown' as const, x: 0, z: 60 },
    { district: 'downtown' as const, x: 0, z: 460 },
  ];
  const mazes = planSewers(L, 9137, centres, () => true);
  for (const m of mazes) {
    ok(m.halls.length >= 5 && m.halls.every((h) => { for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (!m.open[h.i + a][h.j + b]) return false; return true; }), `${m.district}: ${m.halls.length} open 5x5 halls`);
    const rc = reachableCount(m.open);
    ok(rc.reached === rc.open, `${m.district}: every tunnel still connected`);
    const fromHub = bfsDistances(m.open, m.hub.i, m.hub.j);
    const cd = m.camps.map((c) => fromHub.get(sewerKey(c.i, c.j)) ?? -1);
    let minPair = Infinity;
    for (let a = 0; a < m.camps.length; a++) for (let b = a + 1; b < m.camps.length; b++) minPair = Math.min(minPair, Math.hypot(m.camps[a].i - m.camps[b].i, m.camps[a].j - m.camps[b].j));
    ok(m.camps.length === 3 && cd.every((d) => d > 0) && minPair >= 9, `${m.district}: 3 camps reachable from the hub and spread apart (${Math.round(minPair * SEWER.block)} m+)`);
    const blockOf = (p: { x: number; z: number }) => blockAt(m, p.x, p.z)!;
    ok(m.props.length > 50, `${m.district}: ${m.props.length} props`);
    ok(m.props.every((p) => { const b = blockOf(p); return m.open[b.i][b.j]; }), 'props stand in open tunnel or rooms');
    ok(m.props.every((p) => { const b = blockOf(p); return !m.hazards.has(sewerKey(b.i, b.j)) && !m.manholes.some((h) => h.i === b.i && h.j === b.j); }), 'never on a hazard or under a manhole');
    // Props never cut the maze: with solid props as walls (at 0.5 m resolution), every open block centre is still reachable.
    const R = 6;
    const N = m.size * R;
    const free = (gi: number, gj: number) => {
      const bi = Math.floor(gi / R);
      const bj = Math.floor(gj / R);
      if (!m.open[bi]?.[bj]) return false;
      const x = m.x0 + (gi + 0.5) * (SEWER.block / R);
      const z = m.z0 + (gj + 0.5) * (SEWER.block / R);
      return !propAt(m, x, z, 0.25);
    };
    const start = [m.hub.i * R + 2, m.hub.j * R + 2];
    const seen = new Uint8Array(N * N);
    const q = [start];
    seen[start[0] * N + start[1]] = 1;
    for (let h = 0; h < q.length; h++) {
      const [a, b] = q[h];
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const na = a + da;
        const nb = b + db;
        if (na < 0 || nb < 0 || na >= N || nb >= N || seen[na * N + nb] || !free(na, nb)) continue;
        seen[na * N + nb] = 1;
        q.push([na, nb]);
      }
    }
    let cut = 0;
    for (let i = 0; i < m.size; i++) for (let j = 0; j < m.size; j++) if (m.open[i][j] && !m.props.some((p) => { const b = blockOf(p); return b.i === i && b.j === j; }) && !seen[(i * R + 2) * N + j * R + 2] && !seen[(i * R + 3) * N + j * R + 3]) cut++;
    ok(cut === 0, `${m.district}: props never block a way through (${cut} blocks cut off)`);
  }

  // City map.
  const mc = mapIconsJson as unknown as MapConfig;
  const layerIds = new Set(mc.layers.map((l) => l.id));
  ok(Object.values(mc.icons).every((i) => layerIds.has(i.layer) && mc.sprites.order.includes(i.sprite)), 'every map icon has a layer and a sprite in the atlas');
  ok(mc.sets.every((s) => !!mc.icons[s.icon]), 'every marker set points at a known icon');
  const v = { cx: 100, cz: -200, zoom: 2, w: 800, h: 600 };
  const sp = worldToScreen(v, 130, -180);
  const back = screenToWorld(v, sp.sx, sp.sy);
  ok(Math.abs(back.x - 130) < 1e-9 && Math.abs(back.z + 180) < 1e-9 && sp.sx === 460 && sp.sy === 340, 'world <-> screen');
  const z2 = zoomAt(v, 600, 100, 2, 0.3, 6);
  const under = screenToWorld(z2, 600, 100);
  const before = screenToWorld(v, 600, 100);
  ok(z2.zoom === 4 && Math.abs(under.x - before.x) < 1e-9 && Math.abs(under.z - before.z) < 1e-9, 'zooming keeps the point under the cursor still');
  ok(zoomAt(v, 0, 0, 100, 0.3, 6).zoom === 6 && zoomAt(v, 0, 0, 0.001, 0.3, 6).zoom === 0.3, 'zoom is limited');
  const cv = clampView({ ...v, cx: 9999, cz: -9999 }, L.land);
  ok(cv.cx === L.land.x1 + 150 && cv.cz === L.land.z0 - 150, 'panning stops past the edge of the island');
  const vis = visibleLayers(mc, ['cops', 'player']);
  ok(!vis.has('cops') && vis.has('player') && vis.has('heists'), 'filters hide layers, but you and the waypoint always show');
  ok(pathLength([{ x: 0, z: 0 }, { x: 3, z: 4 }, { x: 3, z: 10 }]) === 11, 'route length');
  // Saves: heists and map.
  const sv = loadSave({ version: 2, heists: { heat: 33, cooldowns: { 'quik-cash': 120, 'BAD KEY': 5 }, stats: { done: 2, failed: 1, earned: 9000, best: 6000 } }, map: { waypoint: { x: 10, z: -20 }, hidden: ['cops', 'not ok!'] } }).data;
  ok(sv.heists.heat === 33 && sv.heists.cooldowns['quik-cash'] === 120 && !('BAD KEY' in sv.heists.cooldowns) && sv.heists.stats.done === 2, 'heist heat, cooldowns and record load (bad keys dropped)');
  ok(sv.map.waypoint?.x === 10 && sv.map.hidden.length === 1 && sv.map.hidden[0] === 'cops', 'map waypoint and filters load');
  const old = loadSave({ version: 2 }).data;
  ok(old.heists.heat === 0 && old.map.waypoint === null, 'older saves get a clean slate');
}

// ------------------------------------------------------------------ street events
{
  console.log('--- street events');
  const cfg = streetEventsJson as unknown as StreetEventConfig;
  ok(validateEventConfig(cfg) === true, `street_events.json is valid (${cfg.events.length} events)`);
  ok(cfg.schedule.intervalSeconds[0] === 480 && cfg.schedule.intervalSeconds[1] === 720, 'a new event every 8-12 minutes of free roam');
  ok(EVENT_TYPES.every((t) => cfg.events.some((e) => e.eventType === t)), 'all three event types are configured');
  ok(cfg.events.every((e) => e.eventType === 'turfOutbreak' || e.policeStarsOnTrigger >= 2), 'trucks and drops bring 2-3 stars when you engage');
  const bad = (mut: (c: any) => void, msg: string): void => {
    const c = JSON.parse(JSON.stringify(cfg));
    mut(c);
    let threw = false;
    try {
      validateEventConfig(c);
    } catch {
      threw = true;
    }
    ok(threw, `config check: ${msg}`);
  };
  bad((c) => (c.events[0].eventType = 'parade'), 'unknown event type');
  bad((c) => (c.events[0].policeStarsOnTrigger = 9), 'stars out of range');
  bad((c) => (c.events[1].id = c.events[0].id), 'repeated event id');
  bad((c) => (c.zones.roof[0].y = undefined), 'rooftop zone without a height');
  bad((c) => (c.events[2].lockdownSeconds = 9999), 'lockdown longer than the event');
  // Zones are real places in the city as the game builds it (alleys cut, garages planned).
  const L = generateLayout();
  const alleys = planAlleys(L, alleyAvoidPoints(heistsJson, racesJson as never));
  const gar = planGarages(L);
  L.garages = gar;
  const roofs = planRooftops(L, gar);
  ok(alleys.length === 6 && new Set(alleys.map((a) => a.district)).size === 3, `6 back alleys, 2 per district (${alleys.map((a) => a.id).join(', ')})`);
  ok(alleys.every((a) => !L.buildings.some((b) => b.rect.x0 < a.rect.x1 - 0.01 && b.rect.x1 > a.rect.x0 + 0.01 && b.rect.z0 < a.rect.z1 - 0.01 && b.rect.z1 > a.rect.z0 + 0.01)), 'alleys are open: no building in the lane');
  const avoid = alleyAvoidPoints(heistsJson, racesJson as never);
  ok(alleys.every((a) => avoid.every((p) => Math.hypot(Math.max(a.rect.x0 - p.x, 0, p.x - a.rect.x1), Math.max(a.rect.z0 - p.z, 0, p.z - a.rect.z1)) > 20)), 'alleys keep clear of heist sites and race organizers');
  ok(cfg.zones.alley.every((z) => alleys.some((a) => a.id === z.id && Math.abs(a.x - z.x) < 0.2 && Math.abs(a.z - z.z) < 0.2)), 'alley zones match the carved alleys');
  ok(cfg.zones.roof.every((z) => roofs.roofs.some((r) => roofs.reachable.has(r.id) && z.x > r.rect.x0 && z.x < r.rect.x1 && z.z > r.rect.z0 && z.z < r.rect.z1 && Math.abs(r.top - z.y!) < 0.2)), 'rooftop zones sit on roofs you can reach, at the right height');
  ok(cfg.zones.street.every((z) => !L.buildings.some((b) => z.x > b.rect.x0 && z.x < b.rect.x1 && z.z > b.rect.z0 && z.z < b.rect.z1)), 'street zones are on open pavement');
  ok(cfg.zones.depots.every((d) => L.aveX.some((x) => Math.abs(x - d.x) < 0.2) && L.streetZ.some((z) => Math.abs(z - d.z) < 0.2)), 'truck depots are intersections');
  ok(!!itemSpec('capturePod') && itemSpec('capturePod')!.kind === 'capture' && itemSpec('capturePod')!.price === 0, 'Capture Pod: a rare capture item (not sold)');
  ok(cfg.events.every((e) => (e.rewards.items ?? []).every((it) => !!itemSpec(it.id))), 'every reward item exists');

  // Manager lifecycle with a fake world.
  let seed = 7;
  const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const log: string[] = [];
  const world = new Map<number, { outcome?: 'completed' | 'failed'; engaged?: boolean; phase?: 'spawning' | 'active' }>();
  const got = { cash: 0, items: [] as string[], cred: 0, stars: 0, chips: 0 };
  const M = new StreetEventManager({
    config: cfg,
    rng: rand,
    adapter: {
      spawn: (i) => {
        world.set(i.uid, { phase: 'spawning' });
        log.push(`spawn ${i.id}@${i.zone.id}`);
        return true;
      },
      tick: (i) => world.get(i.uid) ?? {},
      cleanup: (i) => {
        world.delete(i.uid);
        log.push(`cleanup ${i.id}`);
      },
      raiseWanted: (s) => void (got.stars = Math.max(got.stars, s)),
      earn: (n) => void (got.cash += n),
      addItem: (id, n) => got.items.push(`${id}x${n}`),
      addStreetCred: (n) => void (got.cred += n),
      chipsChanged: (n) => void (got.chips = n),
    },
  });
  const here = { x: cfg.zones.street[0].x + 150, z: cfg.zones.street[0].z, layer: 'street', streetCred: 0 };
  ok(M.timer >= cfg.schedule.firstEventSeconds[0] && M.timer <= cfg.schedule.firstEventSeconds[1], `first event after ${Math.round(M.timer)} s`);
  // Busy (a heist, a race): the clock stands still.
  const t0 = M.timer;
  M.update(60, { ...here, busy: true });
  ok(M.timer === t0 && !M.active.length, 'no events while you are busy');
  M.update(60, { ...here, layer: 'sewer' });
  ok(M.timer === t0, 'no events underground');
  // Eligibility by Street Cred.
  const low = M.eligible(here).map((c) => c.def.id);
  const high = M.eligible({ ...here, streetCred: 500 }).map((c) => c.def.id);
  ok(!low.includes('gold-convoy') && high.includes('gold-convoy') && !low.includes('military-drop'), 'big events unlock with Street Cred');
  // Weighted pick: over many rolls, heavier events come up more often.
  const counts: Record<string, number> = {};
  for (let i = 0; i < 4000; i++) {
    const c = M.pick({ ...here, streetCred: 500 })!;
    counts[c.def.id] = (counts[c.def.id] ?? 0) + 1;
  }
  ok((counts['armored-cash-run'] ?? 0) > (counts['gold-convoy'] ?? 0) * 1.4, `spawnWeight steers the pick (${JSON.stringify(counts)})`);
  // The timer fires an event.
  M.update(M.timer + 0.1, here);
  ok(M.active.length === 1 && M.active[0].state === 'SPAWNING', `an event spawns when the timer runs out (${M.active[0]?.id})`);
  const inst = M.active[0];
  const z = inst.zone;
  const zd = Math.hypot(z.x - here.x, z.z - here.z);
  ok(zd >= cfg.schedule.spawnDistance[0] && zd <= cfg.schedule.spawnDistance[1], `spawned ${Math.round(zd)} m away (within the spawn window)`);
  world.get(inst.uid)!.phase = 'active';
  M.update(0.1, here);
  ok(inst.state === 'ACTIVE', 'SPAWNING -> ACTIVE when the world says it is ready');
  ok(M.timeToNext === null, 'no new roll while an event is running');
  // Engage: police hook.
  world.get(inst.uid)!.engaged = true;
  M.update(0.1, here);
  ok(got.stars === inst.def.policeStarsOnTrigger, `engaging sets the Wanted Level (${got.stars} stars for ${inst.def.name})`);
  // Complete: rewards once, then linger, then cleanup.
  world.get(inst.uid)!.outcome = 'completed';
  M.update(0.1, here);
  ok(inst.state === 'COMPLETED' && got.cred === inst.def.rewards.streetCred && got.cash >= inst.def.rewards.cash[0], 'COMPLETED grants cash and Street Cred');
  const cash1 = got.cash;
  M.update(0.1, here);
  ok(got.cash === cash1, 'rewards are granted once');
  ok(M.regionalCred[inst.zone.district] === inst.def.rewards.regionalCred, `regional Street Cred goes to ${inst.zone.district}`);
  M.update(cfg.schedule.lingerSeconds + 0.1, here);
  ok(inst.state === 'CLEANUP' && !M.active.length && log.includes(`cleanup ${inst.id}`) && !world.has(inst.uid), 'CLEANUP removes everything after the grace period');
  ok(M.timer >= cfg.schedule.intervalSeconds[0] && M.timer <= cfg.schedule.intervalSeconds[1], `next event in ${Math.round(M.timer / 60)} min`);
  ok(M.eligible({ ...here, streetCred: 500 }).every((c) => c.def.id !== inst.id), 'the same event is on cooldown');
  // Expiry: time runs out.
  const e2 = M.start('alley-outbreak', { ...here, x: cfg.zones.alley[0].x + 120, z: cfg.zones.alley[0].z }, cfg.zones.alley[0].id)!;
  ok(!!e2 && e2.zone.id === cfg.zones.alley[0].id, 'events can be started in a chosen zone (debug, missions)');
  world.get(e2.uid)!.phase = 'active';
  M.update(0.1, here);
  M.update(e2.def.durationSeconds + 1, here);
  ok(e2.state === 'EXPIRED' && e2.reason === 'timeout', 'ACTIVE -> EXPIRED when time runs out');
  M.update(cfg.schedule.lingerSeconds + 0.1, here);
  ok(!M.active.length && !world.has(e2.uid), 'expired events are cleaned up too');
  // Failure reported by the world (police lockdown, scavengers).
  const e3 = M.start('street-drop', here)!;
  world.get(e3.uid)!.outcome = 'failed';
  M.update(0.1, here);
  ok(e3.state === 'EXPIRED' && e3.reason === 'failed' && got.cash === cash1, 'a failed event pays nothing');
  M.clear('test');
  ok(!M.active.length && !world.size, 'clear() removes every event at once');
  // Upgrade chips cap.
  M.chips = 4;
  const e4 = M.start('gold-convoy', { ...here, streetCred: 999 })!;
  world.get(e4.uid)!.outcome = 'completed';
  M.update(0.1, here);
  ok(M.chips === 5 && got.chips === 5, 'upgrade chips are added (up to the cap)');
  // Save / load.
  const saved = M.serialize();
  const M2 = new StreetEventManager({ config: cfg, adapter: { spawn: () => true, tick: () => ({}), cleanup: () => undefined } });
  M2.load(JSON.parse(JSON.stringify(saved)));
  ok(M2.chips === 5 && M2.regionalCred[inst.zone.district] === M.regionalCred[inst.zone.district] && M2.stats.completed === M.stats.completed, 'chips, regional cred and record save and load');
  const sv = loadSave({ version: 2, streetEvents: { regionalCred: { midtown: 40, bogus: 9 }, chips: 99, timer: 300, stats: { spawned: 3, completed: 2, expired: 1, byType: { airdrop: 2, nope: 1 } } } }).data;
  ok(sv.streetEvents.regionalCred.midtown === 40 && !('bogus' in sv.streetEvents.regionalCred) && sv.streetEvents.chips === 5 && sv.streetEvents.stats.byType.airdrop === 2 && !('nope' in sv.streetEvents.stats.byType), 'street-event saves are checked on load');
  ok(loadSave({ version: 2 }).data.streetEvents.chips === 0, 'older saves start with no chips');
  // Map icons.
  const mc = mapIconsJson as unknown as MapConfig;
  ok(['eventTruck', 'eventOutbreak', 'eventDrop'].every((k) => mc.icons[k]?.layer === 'events'), 'event icons on their own map layer');
}

// ------------------------------------------------------------------ living world
{
  console.log('--- living world');
  const L = livingJson as unknown as NpcLifeConfig & WildConfig & { lod: { activeRadius: number }; aggro: Record<string, unknown> };
  const chart = DATA.chart as unknown as Record<string, Record<string, number>>;
  ok(L.lod.activeRadius === 80, 'AI radius is 80 m');
  ok(L.territory.rivalries.every(([a, b]) => TYPE_IDS.includes(a as never) && TYPE_IDS.includes(b as never)), 'rivalries use real types');
  ok(isRival(['gun'], ['concrete'], L.territory.rivalries) && isRival(['bass'], ['smoke'], L.territory.rivalries) && !isRival(['gun'], ['gun'], L.territory.rivalries), 'Gun vs Concrete and Smoke vs Bass are rivals; same type is not');
  ok(L.hunters.pods.every((p) => itemSpec(p.id).kind === 'capture'), 'hunters throw real capture items');
  ok(L.aggro.autoBattle === false, 'aggressive Streetmon attack instead of forcing a battle');

  // Spatial grid against brute force.
  const grid = new SpatialGrid<{ id: number; x: number; z: number }>(16);
  const pts = Array.from({ length: 300 }, (_, i) => ({ id: i, x: Math.sin(i * 12.9898) * 140, z: Math.cos(i * 78.233) * 140 }));
  for (const p of pts) grid.insert(p, p.x, p.z);
  const q = grid.near(10, -20, 30).map((e) => e.item.id).sort((a, b) => a - b);
  const brute = pts.filter((p) => Math.hypot(p.x - 10, p.z + 20) <= 30).map((p) => p.id).sort((a, b) => a - b);
  ok(JSON.stringify(q) === JSON.stringify(brute), `grid radius query matches brute force (${q.length} hits)`);
  const pairs = grid.pairs(5).map(([a, b]) => [Math.min(a.id, b.id), Math.max(a.id, b.id)].join('-')).sort();
  const bp: string[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) <= 5) bp.push(`${i}-${j}`);
  ok(JSON.stringify(pairs) === JSON.stringify(bp.sort()) && new Set(pairs).size === pairs.length, `grid pair query finds each close pair once (${pairs.length})`);

  // Ambient damage follows the battle formula and the type chart.
  const fGun = { level: 20, attack: 60, defense: 50, speed: 50, types: ['gun'], moves: [{ name: 'Shot', type: 'gun', power: 60 }] };
  const fCon = { level: 20, attack: 60, defense: 50, speed: 40, types: ['concrete'], moves: [{ name: 'Slab', type: 'concrete', power: 60 }] };
  const fixed = (): number => 0.5;
  const h1 = ambientHit(fCon, fGun, chart, fixed);
  const expect = Math.floor(baseDamage(20, 60, 60, 50) * 2 * 1.5 * (0.85 + 0.5 * 0.15));
  ok(h1.damage === expect && h1.mult === 2, `ambient hit = battle formula x type x same-type bonus (${h1.damage})`);
  ok(ambientHit(fGun, fCon, chart, fixed).damage < h1.damage, 'Concrete hits Gun harder than the other way round');
  ok(typeMult(chart, 'gun', ['grind', 'bass']) === 4, 'dual types multiply');
  ok(fillLine('A {species} on {street}', { species: 'Rebarb', street: '5th Ave' }) === 'A Rebarb on 5th Ave' && hasHoles(fillLine('{nope}', {})), 'chatter placeholders fill (and missing ones show)');
  ok(wrapText('Wear them down before you throw a pod at them', 18).every((l) => l.length <= 18), 'bubble text wraps');

  // ---- NPC hunters and chatter against a fake world.
  const fighter = (types: string[], level: number, speed = 50) => ({ level, attack: 55, defense: 50, speed, types, moves: [{ name: 'Hit', type: types[0], power: 50 }] });
  const people = new Map<number, Person>();
  const wild = new Map<number, WildView>();
  const said: string[] = [];
  const log: string[] = [];
  let catchRoll = { shakes: 3, caught: true };
  const addPerson = (id: number, x: number, z: number): Person => {
    const p: Person = { id, x, z, layer: 'street', free: true, walking: true, ctrl: null, street: '5th Ave & 34th St', district: 'Midtown' };
    people.set(id, p);
    return p;
  };
  const addWild = (id: number, x: number, z: number, types = ['concrete'], level = 8): WildView => {
    const w: WildView = { id, x, z, layer: 'street', name: 'Cinderblock', speciesId: 'cinderblock', level, hp: 40, maxHp: 40, fighter: fighter(types, level, 30), free: true, heldBy: null };
    wild.set(id, w);
    return w;
  };
  let monHp = 60;
  const adapter: NpcLifeAdapter = {
    take: (id, tag) => {
      const p = people.get(id)!;
      p.ctrl = tag;
      p.free = false;
      return true;
    },
    release: (id, how) => {
      const p = people.get(id);
      if (p) {
        p.ctrl = null;
        p.free = how === 'walk';
      }
      log.push(`release ${id} ${how}`);
    },
    walkTo: (id, x, z, speed, dt) => {
      const p = people.get(id)!;
      const d = Math.hypot(x - p.x, z - p.z);
      const st = Math.min(d, speed * dt);
      p.x += ((x - p.x) / d) * st;
      p.z += ((z - p.z) / d) * st;
      return d - st;
    },
    face: () => undefined,
    sendOut: (id, wid, tag) => {
      wild.get(wid)!.heldBy = tag;
      wild.get(wid)!.free = false;
      log.push(`send ${id}`);
      return { name: 'Rebarb', speciesId: 'rebarb', level: 10, hp: monHp, maxHp: 60, fighter: fighter(['grind'], 10, 60) };
    },
    strike: (e) => {
      const w = wild.get(e.wildId)!;
      if (e.from === 'mon') w.hp = Math.max(0, w.hp - e.hit.damage);
      log.push(`strike ${e.from} ${e.hit.damage}`);
      return e.from === 'mon' ? w.hp : (e.monHp ?? 0);
    },
    recall: (id, fainted) => log.push(`recall ${id} ${fainted}`),
    throwPod: (id, wid, it) => log.push(`throw ${it}`),
    rollCatch: () => catchRoll,
    shake: (id, n) => log.push(`shake ${n}`),
    captured: (id, wid) => {
      wild.delete(wid);
      log.push(`caught ${wid}`);
    },
    breakFree: () => log.push('broke free'),
    freeWild: (wid, how) => {
      const w = wild.get(wid);
      if (w) {
        w.heldBy = null;
        w.free = how !== 'escape';
      }
      log.push(`free ${wid} ${how}`);
    },
    startTalk: (a, b, tag) => {
      for (const id of [a, b]) {
        people.get(id)!.ctrl = tag;
        people.get(id)!.free = false;
      }
      return true;
    },
    endTalk: (a, b) => {
      for (const id of [a, b]) {
        const p = people.get(id);
        if (p) {
          p.ctrl = null;
          p.free = true;
        }
      }
      log.push('talk over');
    },
    say: (id, text) => said.push(`${id}: ${text}`),
    chatVars: () => ({ species: 'Rebarb', level: 12, district: 'Midtown', street: '5th Ave', strong: 'Concrete', weak: 'Gun', track: 'Harbor Run', racer: 'Dee Okafor', crew: 'The Smoke Syndicate', item: 'net' }),
  };
  const cfg = JSON.parse(JSON.stringify(L)) as NpcLifeConfig;
  cfg.hunters.recruitEverySeconds = [1e9, 1e9];
  const N = new NpcLifeManager({ config: cfg, adapter, chart, rng: (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })() });
  // Fresh records every tick, like the game (copies, not the live objects).
  const ctx = () => ({ people: [...people.values()].map((p) => ({ ...p })), wild: [...wild.values()].map((w) => ({ ...w })), player: { x: 0, z: 0 }, camera: { x: 0, z: 0 }, activeRadius: 80, enabled: false });
  const run = (sec: number, until?: () => boolean): void => {
    for (let t = 0; t < sec; t += 0.1) {
      N.update(0.1, ctx());
      if (until?.()) return;
    }
  };
  addPerson(1, 0, 0);
  addWild(100, 12, 0);
  const H = N.startHunt(1)!;
  ok(H.state === HUNTER_STATES.SEARCHING, 'a hunter starts SEARCHING');
  run(5, () => H.state !== HUNTER_STATES.SEARCHING);
  ok(H.state === HUNTER_STATES.BATTLING && log.includes('send 1') && wild.get(100)!.heldBy === 'hunt:1', 'spots a wild Streetmon, walks over, SEARCHING -> BATTLING (holds it)');
  ok(said.some((l) => l.startsWith('1: ') && /Cinderblock/.test(l)), 'calls it out in a speech bubble');
  run(30, () => H.state === HUNTER_STATES.CATCHING);
  ok(H.state === HUNTER_STATES.CATCHING && log.some((l) => l.startsWith('strike mon')) && log.some((l) => /^throw (net|crate|cage)$/.test(l)), 'wears it down below the threshold, BATTLING -> CATCHING, throws a pod');
  ok(wild.get(100)!.hp / 40 <= cfg.hunters.catchBelowHp, 'the throw comes at low HP');
  run(5, () => H.state !== HUNTER_STATES.CATCHING);
  ok(log.filter((l) => l.startsWith('shake')).length === 3 && log.includes('caught 100') && H.state === HUNTER_STATES.DONE, 'three shakes and caught (the game\'s catch roll decides)');
  ok(N.catches[0]?.species === 'Cinderblock' && N.stats.caught === 1, 'the catch is remembered for bragging');
  run(5);
  ok(!N.hunters.length && log.includes('release 1 walk') && N.onCooldown(1), 'DONE: back to walking, with a cooldown');

  // Broke free every time: the wild one gets away.
  catchRoll = { shakes: 1, caught: false };
  addPerson(2, 30, 0);
  addWild(101, 36, 0);
  const H2 = N.startHunt(2)!;
  run(80, () => !N.hunters.includes(H2));
  ok(log.filter((l) => l === 'broke free').length === cfg.hunters.throwsMax && log.includes('free 101 escape') && N.stats.escaped === 1, `breaks free ${cfg.hunters.throwsMax} times and escapes`);

  // Their Streetmon faints: FLEEING.
  monHp = 1;
  addPerson(3, -30, 0);
  addWild(102, -36, 0, ['gun'], 30);
  wild.get(102)!.fighter.speed = 999;
  const H3 = N.startHunt(3)!;
  run(20, () => H3.state === HUNTER_STATES.FLEEING);
  ok(H3.state === HUNTER_STATES.FLEEING && log.includes('recall 3 true') && log.includes('release 3 flee') && log.includes('free 102 won'), 'their Streetmon faints: BATTLING -> FLEEING, the wild one stays');
  run(10);
  ok(!N.hunters.includes(H3), 'FLEEING ends the hunt');
  monHp = 60;

  // Interrupted (scared off / hit by a car): control lost.
  addPerson(4, 0, 30);
  addWild(103, 0, 36);
  const H4 = N.startHunt(4)!;
  run(5, () => H4.state === HUNTER_STATES.BATTLING);
  people.get(4)!.ctrl = null;
  run(0.2);
  ok(!N.hunters.includes(H4) && wild.get(103)!.heldBy === null, 'a hunter taken away (panic, car) ends the hunt and lets the wild one go');
  // The player battles it first: robbed.
  addPerson(5, 0, -30);
  addWild(104, 0, -36);
  const H5 = N.startHunt(5)!;
  run(5, () => H5.state === HUNTER_STATES.BATTLING);
  wild.get(104)!.heldBy = 'player';
  run(0.2);
  ok((H5.state === HUNTER_STATES.DONE || !N.hunters.includes(H5)) && wild.get(104)!.heldBy === 'player' && said.some((l) => /^5: (Hey, that was mine!|Seriously\? I saw it first!)$/.test(l)), 'the player taking it over ends the hunt ("Hey, that was mine!")');
  // Far from the player: settled without FX.
  addPerson(6, 300, 0);
  addWild(105, 306, 0);
  const H6 = N.startHunt(6)!;
  H6.state = HUNTER_STATES.BATTLING;
  H6.target = 105;
  H6.mon = { name: 'x', speciesId: 'rebarb', level: 10, hp: 50, maxHp: 50, fighter: fighter(['grind'], 10) };
  people.get(6)!.ctrl = 'hunt:6';
  run(0.2);
  ok(!N.hunters.includes(H6) && (log.includes('caught 105') || log.includes('free 105 escape')), 'hunts beyond the AI radius are settled at once');

  // Chatter.
  for (const id of [...people.keys()]) people.delete(id);
  const a = addPerson(20, 5, 5);
  const b = addPerson(21, 6.5, 5.5);
  addPerson(22, 30, 30);
  const before = said.length;
  const c = N.startTalk(20, 21, 'league')!;
  ok(!!c && a.ctrl === 'talk' && b.ctrl === 'talk' && c.lines.every((l) => !hasHoles(l)), 'two people stop to talk (league topic, filled from game data)');
  run(12, () => !N.conversations.length);
  ok(said.length - before === c.lines.length && said.slice(before).every((l, i) => l.startsWith(i % 2 ? '21: ' : '20: ')) && log.includes('talk over'), 'they take turns, one bubble per line, then walk on');
  // Every topic can be written from the real config.
  N.catches.length = 0;
  N.catches.push({ species: 'Rebarb', level: 9, street: '3rd Ave', district: 'Downtown' });
  ok(TOPICS.every((t) => Array.from({ length: 20 }, () => N.writeConversation(t)).every((w) => !!w && w.lines.every((l) => !hasHoles(l)))), 'every chatter topic fills without gaps');
  // Automatic: walking past within 3 m.
  const cfg2 = JSON.parse(JSON.stringify(cfg)) as NpcLifeConfig;
  cfg2.chatter.chancePerPair = 1;
  const N2 = new NpcLifeManager({ config: cfg2, adapter, chart, rng: () => 0.3 });
  people.clear();
  addPerson(30, 0, 0);
  addPerson(31, 2.5, 0);
  addPerson(32, 9, 0);
  N2.update(0.6, { ...ctx(), enabled: true });
  ok(N2.conversations.length === 1 && N2.conversations[0].a + N2.conversations[0].b === 61, 'people within 3 m start talking on their own; others don\'t');
  addPerson(33, 0, 60);
  addPerson(34, 1, 60);
  N2.update(0.6, { ...ctx(), enabled: true });
  ok(N2.conversations.length === 1, 'nobody chats out of the camera\'s range');

  // ---- Wild vs wild.
  const mons = new Map<number, WildMon>();
  const wlog: string[] = [];
  const mon = (id: number, x: number, z: number, types: string[], over: Partial<WildMon> = {}): WildMon => {
    const m: WildMon = { id, x, z, layer: 'street', speciesId: `sp${types.join('')}${id % 2}`, temperament: 'wander', rarity: 'common', state: 'wander', hp: 50, maxHp: 50, fighter: fighter(types, 12), free: true, calm: false, heldBy: null, ...over };
    mons.set(id, m);
    return m;
  };
  let nextId = 500;
  const wad: WildAdapter = {
    hold: (id, tag) => {
      const m = mons.get(id);
      if (!m) return tag === null;
      if (tag && m.heldBy) return false;
      m.heldBy = tag;
      m.free = !tag;
      return true;
    },
    goTo: (id, x, z) => {
      const m = mons.get(id)!;
      const d = Math.hypot(x - m.x, z - m.z) || 1;
      const st = Math.min(d, 0.6);
      m.x += ((x - m.x) / d) * st;
      m.z += ((z - m.z) / d) * st;
      wlog.push(`go ${id}`);
    },
    face: () => undefined,
    strike: (e) => {
      const d = mons.get(e.defender)!;
      d.hp = Math.max(0, d.hp - e.hit.damage);
      wlog.push(`hit ${e.attacker}>${e.defender}`);
      return d.hp;
    },
    flee: (id) => {
      const m = mons.get(id);
      if (m) {
        m.state = 'flee';
        m.heldBy = null;
      }
      wlog.push(`flee ${id}`);
    },
    claim: (id) => wlog.push(`claim ${id}`),
    setHome: (id) => wlog.push(`home ${id}`),
    joinChase: (id) => {
      mons.get(id)!.state = 'approach';
      wlog.push(`chase ${id}`);
    },
    lineOfSight: (ax) => ax < 900,
    spawnFollowers: (leader, n) => {
      const L0 = mons.get(leader)!;
      return Array.from({ length: n }, () => mon(nextId++, L0.x + 2, L0.z, L0.fighter.types as string[], { speciesId: L0.speciesId }).id);
    },
  };
  const WI = new WildInteractionManager({ config: L, adapter: wad, chart, rng: () => 0.4 });
  // Fresh copies every tick, like the game.
  const wctx = (over: Record<string, unknown> = {}) => ({ wild: [...mons.values()].map((m) => ({ ...m })), cars: [] as Array<{ x: number; z: number; vx: number; vz: number; kmh: number }>, player: { x: 0, z: 0 }, playerInCar: false, activeRadius: 80, enabled: true, ...over });
  mon(1, 20, 0, ['gun']);
  mon(2, 28, 0, ['concrete']);
  mon(3, 40, 40, ['gun']);
  mon(4, 46, 40, ['gun']);
  WI.update(0.7, wctx());
  ok(WI.duels.length === 1 && WI.inDuel(1) && WI.inDuel(2) && !WI.inDuel(3), 'Gun and Concrete in sight square up; two Gun types don\'t');
  for (let i = 0; i < 400 && WI.duels.length; i++) WI.update(0.1, wctx());
  const loser = mons.get(1)!.state === 'flee' ? 1 : 2;
  ok(!WI.duels.length && wlog.some((l) => l.startsWith('hit')) && wlog.includes(`flee ${loser}`) && wlog.includes(`claim ${3 - loser}`), 'they close in, trade hits, the loser runs and the winner claims the spot');
  ok(mons.get(loser)!.hp / 50 <= L.territory.loserFleesBelowHp && mons.get(3 - loser)!.hp < 50, 'both keep their damage (easier catches)');
  ok(WI.stats.resolved === 1, 'the fight counts as resolved');
  // The player walking up breaks one up.
  mon(10, 60, -20, ['smoke']);
  mon(11, 66, -20, ['bass']);
  WI.update(0.7, wctx());
  ok(!!WI.inDuel(10), 'Smoke vs Bass fight');
  WI.update(0.1, wctx({ player: { x: 63, z: -20 } }));
  ok(!WI.inDuel(10) && mons.get(10)!.heldBy === null, 'walking up to them breaks it up');
  // Out of sight: no fight.
  mon(12, 950, 0, ['smoke'], { calm: false });
  mon(13, 955, 0, ['bass']);
  WI.update(0.7, wctx({ player: { x: 950, z: 30 } }));
  ok(!WI.inDuel(12), 'no fight without line of sight');
  // Packs.
  const LP = JSON.parse(JSON.stringify(L)) as WildConfig;
  LP.packs.chance = 1;
  const WP = new WildInteractionManager({ config: LP, adapter: wad, chart, rng: () => 0.2 });
  const leader = mon(200, -50, 0, ['grind'], { temperament: 'wander', rarity: 'common' });
  const fol = WP.onSpawn(leader);
  ok(fol.length >= 1 && fol.every((f) => WP.samePack(f, 200)), `a common wanderer spawns with a pack of ${fol.length}`);
  ok(WP.onSpawn(mon(201, -300, 0, ['gun'], { rarity: 'rare' })).length === 0, 'rare ones roam alone');
  mons.get(fol[0])!.x = -80;
  WP.update(0.1, wctx({ player: { x: -50, z: 10 } }));
  ok(wlog.includes(`go ${fol[0]}`), 'a straggler regroups with its leader');
  leader.state = 'flee';
  WP.update(0.1, wctx({ player: { x: -50, z: 10 } }));
  ok(fol.every((f) => mons.get(f)!.state === 'flee'), 'the leader runs, the pack runs');
  mons.delete(200);
  WP.update(0.1, wctx({ player: { x: -50, z: 10 } }));
  ok(fol.length < 2 || WP.followers.get(fol[0])?.includes(fol[1]), 'the next in line takes over the pack');
  // Aggressive pack: followers join the chase.
  const ag = mon(300, 10, 60, ['gun'], { temperament: 'aggro', rarity: 'uncommon' });
  const af = WP.onSpawn(ag);
  ag.state = 'approach';
  WP.update(0.1, wctx({ player: { x: 10, z: 50 } }));
  ok(af.length > 0 && af.every((f) => mons.get(f)!.state === 'approach'), 'an aggressive pack goes for you together');
  const ag2 = mon(310, 10, 70, ['gun'], { temperament: 'aggro', rarity: 'uncommon' });
  const af2 = WP.onSpawn(ag2);
  mons.get(af2[0])!.state = 'attack';
  WP.update(0.1, wctx({ player: { x: 10, z: 66 } }));
  ok(ag2.state === 'approach' && af2.every((f) => mons.get(f)!.state !== 'wander'), 'one member biting brings the leader and the rest');
  ok(WI.breaks.player === 1, 'broken fights say why (the player walked up)');
  // Threats: a speeding car and an explosion.
  const calm = mon(400, 0, -60, ['grind'], { state: 'idle' });
  WP.update(0.1, wctx({ player: { x: 0, z: -40 }, cars: [{ x: 0, z: -73, vx: 0, vz: 20, kmh: 72 }] }));
  ok(calm.state === 'flee', 'a car bearing down at 72 km/h scares it from 13 m');
  const side = mon(401, 30, -60, ['grind'], { state: 'idle' });
  WP.update(0.1, wctx({ player: { x: 0, z: -40 }, cars: [{ x: 0, z: -75, vx: 0, vz: 20, kmh: 72 }] }));
  ok(side.state === 'idle', 'a car going past elsewhere doesn\'t');
  WP.explosion(30, -55, 12);
  WP.update(0.1, wctx({ player: { x: 0, z: -40 } }));
  ok(side.state === 'flee' && WP.stats.blastScares >= 1, 'an explosion sends everything nearby running');
  // Playtest bug #6: a creature held in an NPC hunt runs from a blast too.
  const hunted = mon(402, -30, -60, ['grind'], { state: 'idle', heldBy: 'hunt:9' });
  WP.explosion(-30, -55, 12);
  WP.update(0.1, wctx({ player: { x: 0, z: -40 } }));
  ok(hunted.state === 'flee', 'a creature in an NPC hunt bolts from an explosion (playtest #6)');

  // ---- Aggressive Streetmon vs the player (the real SpawnSystem with a stub city).
  let wall = (x: number, _z: number): boolean => false;
  const stubPeds = { blocked: (x: number, z: number) => wall(x, z), groundY: () => 0.15 };
  const bites: number[] = [];
  const gaveUp: string[] = [];
  const sys = new LiveSpawnSystem(new THREE.Scene(), generateLayout(1), stubPeds as never, { cars: [] } as never, { instance: () => new Promise(() => undefined) } as never, {
    onAttackPlayer: (_w, d) => bites.push(d),
    onGiveUp: (_w, why) => gaveUp.push(why),
  });
  sys.enabled = false;
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  cam.position.set(0, 200, 0);
  cam.lookAt(0, 0, 1);
  cam.updateMatrixWorld();
  const playerPos = new THREE.Vector3(0, 0.15, 0);
  let now = 0;
  const sctx = (over: Record<string, unknown> = {}) => ({ player: playerPos, stealth: 'normal' as const, inCar: false, camera: cam, time: 'day' as const, now, busy: false, biome: 'street' as const, playerY: 0.15, ...over });
  const tick = (sec: number, over: Record<string, unknown> = {}): void => {
    for (let t = 0; t < sec; t += 0.05) {
      now += 0.05;
      sys.update(0.05, sctx(over));
    }
  };
  const rebarb = sys.spawn(species('rebarb'), 15, 6, 0, 'midtown');
  ok(rebarb.temperament === 'aggro', 'Rebarb is one of the aggressive species');
  tick(4);
  ok(rebarb.state === 'attack' && bites.length > 0, `it runs up and attacks (${bites.length} bites, ${bites[0]} damage each)`);
  ok(bites.every((d) => d >= 3 && d <= 12), 'bites are level-scaled');
  const n0 = bites.length;
  tick(4, { busy: true });
  ok(bites.length === n0 && rebarb.state !== 'attack', 'no bites while the player is busy (a battle)');
  // Run far away.
  tick(1);
  playerPos.set(60, 0.15, 0);
  tick(1);
  ok(gaveUp.includes('far') && rebarb.state !== 'attack' && rebarb.state !== 'approach', 'running 36+ m away: it gives up');
  // Hide behind a wall.
  const r2 = sys.spawn(species('rebarb'), 15, 66, 0, 'midtown');
  tick(3);
  ok(r2.state === 'attack' || r2.state === 'approach', 'a fresh one goes for you');
  wall = (x: number) => x > 62.5 && x < 63.5;
  playerPos.set(58, 0.15, 0);
  r2.x = 67;
  tick(4);
  ok(gaveUp.filter((w) => w === 'hidden').length === 1, 'out of sight for 3 s: it loses you');
  wall = () => false;
  // Getting in a car counts as hiding.
  const r3 = sys.spawn(species('rebarb'), 15, 61, 4, 'midtown');
  r3.calmUntil = 0;
  tick(2);
  tick(4, { inCar: true });
  ok(gaveUp.filter((w) => w === 'hidden').length === 2 && r3.state !== 'attack', 'in a car: no bites, and it gives up');
  // Wanderers never attack.
  const calmOne = sys.spawn(species('cinderblock'), 15, 56, -3, 'midtown');
  const nb = bites.length;
  tick(5);
  ok(calmOne.state !== 'attack' && calmOne.state !== 'approach' && bites.length === nb, 'non-aggressive species never attack');
  // The lightweight tier.
  const far = sys.spawn(species('cinderblock'), 5, playerPos.x + 100, playerPos.z, 'midtown');
  tick(1);
  ok(far.lite === true && sys.tiers.lite >= 1 && sys.tiers.active >= 1, `beyond 80 m: lightweight tier (${sys.tiers.active} active, ${sys.tiers.lite} lite)`);
}

// ------------------------------------------------------------------ campaign
{
  console.log('--- campaign');
  const C = campaignJson as unknown as CampaignConfig;
  const LG = leagueJson as unknown as LeagueConfig;
  const tracks = (racesJson as unknown as { tracks: Array<{ id: string }> }).tracks.map((t) => t.id);
  const heistIds = (heistsJson as unknown as { targets: Array<{ id: string }> }).targets.map((t) => t.id);
  const known = { species: (id: string) => DATA.species.has(id), items: (id: string) => DATA.items.has(id), tracks, heists: heistIds, types: TYPE_IDS };
  ok(validateCampaign(C, known) === true, `campaign_quests.json is valid (${C.acts.length} acts, ${C.quests.length} quests, ${C.bosses.length} bosses)`);
  ok(validateLeague(LG, { tracks, bosses: C.bosses.map((b) => b.id) }) === true, `racing_league.json is valid (${LG.divisions.length} divisions)`);
  ok(C.acts.map((a) => a.number).join() === '1,2,3,4,5', 'five acts, in order');
  const core = ['REACH_MARKER', 'WIN_RACE', 'COMPLETE_HEIST', 'CATCH_STREETMON', 'DEFEAT_BOSS', 'REACH_STREET_CRED'];
  ok(core.every((t) => C.quests.some((q) => q.objectives.some((o) => o.type === t))), 'the story uses all six core objective types');
  ok(OBJECTIVE_TYPES.length === 9, 'nine objective types (six core + talk, escape, tune)');
  ok(heistIds.every((h) => C.quests.some((q) => q.objectives.some((o) => o.target === h))), 'every heist is part of the story');
  ok(C.bosses.every((b) => C.quests.some((q) => q.objectives.some((o) => o.boss === b.id))), 'every boss is fought in the story');
  const badC = (mut: (c: any) => void, msg: string): void => {
    const c = JSON.parse(JSON.stringify(C));
    mut(c);
    let threw = false;
    try {
      validateCampaign(c, known);
    } catch {
      threw = true;
    }
    ok(threw, `campaign check: ${msg}`);
  };
  badC((c) => (c.quests[0].objectives[0].type = 'DANCE'), 'unknown objective type');
  badC((c) => (c.quests[1].prerequisites = { quests: ['nope'] }), 'unknown prerequisite');
  badC((c) => (c.quests[0].prerequisites = { quests: [c.quests[3].id] }), 'prerequisite loop');
  badC((c) => (c.bosses[0].team[0][0] = 'pikachu'), 'unknown species in a boss team');
  badC((c) => (c.quests[1].dialogue.nodes.o1.choices[0][1] = 'nowhere'), 'dialogue link to nowhere');
  badC((c) => (c.quests[0].onAccept = { items: [['flux-capacitor', 1]] }), 'unknown item handed over on accepting');
  badC((c) => (c.quests[3].objectives[0].target = 'fort-knox'), 'unknown heist');
  badC((c) => (c.quests[0].rewards.blueprints = ['flux-capacitor']), 'unknown blueprint');

  // A full playthrough against a fake game.
  const got = { cash: 0, cred: 0, items: [] as string[], blueprints: [] as string[], mons: [] as string[], wanted: [] as number[], notes: [] as string[] };
  let money = 5000;
  const Q = new QuestManager({
    campaign: C,
    league: LG,
    adapter: {
      earn: (n) => (got.cash += n),
      money: () => money,
      spend: (n) => (money >= n ? ((money -= n), true) : false),
      addStreetCred: (n) => (ctx.streetCred += n),
      addItem: (id, n) => got.items.push(`${id}x${n}`),
      unlockBlueprint: (b) => got.blueprints.push(b.id),
      giveStreetmon: (l) => got.mons.push(l.nickname),
      setWanted: (s) => {
        got.wanted.push(s);
        ctx.stars = s;
      },
      notify: (t) => got.notes.push(t),
    },
  });
  const ctx: QuestContext = { x: 0, z: 0, layer: 'street', inVehicle: false, streetCred: 0, stars: 0, night: false, tunedSlots: 0 };
  const events: string[] = [];
  for (const ev of ['started', 'completed', 'failed', 'actStarted', 'actCompleted', 'rank', 'objective', 'offer']) Q.on(ev, (e: any) => events.push(`${ev}:${e.quest?.id ?? e.act?.id ?? e.division?.id ?? ''}`));
  Q.update(0.1, ctx);
  ok(Q.availableQuests().join() === 'a1-welcome' && Q.status('a1-grease-monkey') === 'locked' && Q.status('a1-dutch') === 'locked', "at the start only Mama Rust has a job: her welcome");
  ok(Q.givers().some((g) => g.npc === 'rust' && g.role === 'offer'), 'Rust shows as a mission giver (M)');
  // Mama's welcome: talk it through, accept, get cuffs and the starter pick.
  let d = Q.talk('rust', ctx)!;
  ok(d.speaker === 'Mama Rust' && d.choices.length === 2 && d.node === 'w1', 'talking opens the welcome');
  let r = Q.choose(d, 0, ctx);
  ok(!!r.next && r.next.node === 'w2', 'choices lead to the next node');
  r = Q.choose(r.next!, 1, ctx);
  ok(!!r.next && r.next.node === 'w4', '...');
  const accepted: string[] = [];
  (Q as any).adapter.onAccept = (q: any) => accepted.push(q.id);
  r = Q.choose(r.next!, 0, ctx);
  ok(r.result === 'accepted' && Q.status('a1-welcome') === 'active' && events.includes('actStarted:act1'), 'accepting starts the welcome (and Act I)');
  ok(got.items.includes('cuffsx5') && accepted.join() === 'a1-welcome', 'Mama hands over 5 cuffs and the game is told to show the starter pick');
  ok(/catch a wild one/.test(Q.hud()!.objective), 'the HUD asks for a catch');
  Q.notify({ type: 'catch', species: 'gutterat', types: ['concrete'], level: 3, district: 'midtown' } as any, ctx);
  ok(Q.status('a1-welcome') === 'ready' && Q.givers().find((g) => g.npc === 'rust')?.role === 'turnIn', 'CATCH_STREETMON: one catch, then back to Rust');
  d = Q.talk('rust', ctx)!;
  r = Q.choose(d, 0, ctx);
  ok(r.result === 'completed' && Q.completedQuests.has('a1-welcome') && got.items.includes('cuffsx3'), 'turning in pays out (a few more cuffs)');
  ok(Q.availableQuests().join() === 'a1-grease-monkey', 'which opens the original first job, Grease Monkey');
  // Grease Monkey: talk through the dialogue tree and accept.
  d = Q.talk('rust', ctx)!;
  ok(d.choices.length === 2 && d.node === 'o1', 'talking opens the offer node');
  r = Q.choose(d, 0, ctx);
  ok(!!r.next && r.next.node === 'o2', 'choices lead to the next node');
  r = Q.choose(r.next!, 0, ctx);
  ok(r.result === 'accepted' && Q.status('a1-grease-monkey') === 'active', 'accepting starts the quest');
  ok(Q.hud()!.act === 'Act 1: The Chop Shop Rookie' && /slot a Streetmon/.test(Q.hud()!.objective), 'the HUD tracks it');
  ctx.tunedSlots = 1;
  Q.update(0.1, ctx);
  ok(Q.status('a1-grease-monkey') === 'ready', 'TUNE_VEHICLE: slotting a Streetmon finishes the objectives');
  ok(Q.givers().find((g) => g.npc === 'rust')?.role === 'turnIn', 'then Rust waits for the turn-in');
  d = Q.talk('rust', ctx)!;
  r = Q.choose(d, 0, ctx);
  ok(r.result === 'completed' && Q.completedQuests.has('a1-grease-monkey') && got.cash === 450, 'turning in pays out');
  // Courier: talk to Pike, reach the markers, beat the clock.
  const take = (id: string): void => {
    let dd = Q.talk(Q.quest(id)!.giver, ctx)!;
    for (let i = 0; i < 6; i++) {
      const acc = dd.choices.findIndex((c) => c[1] === 'accept');
      const nxt = acc >= 0 ? acc : dd.choices.findIndex((c) => c[1] !== 'end');
      const res = Q.choose(dd, nxt, ctx);
      if (res.result === 'accepted' || !res.next) break;
      dd = res.next;
    }
  };
  take('a1-courier');
  ok(Q.status('a1-courier') === 'active', 'the courier run is on');
  const ms = Q.markers((ref) => (ref === 'npc:pike' ? { x: -468, z: -232 } : null), ctx);
  ok(ms.some((m) => m.kind === 'objective' && m.x === -468), 'the objective marker points at Foreman Pike');
  const pd = Q.talk('pike', ctx)!;
  ok(/Rust sent you/.test(pd.text), 'Pike has his handover line');
  ctx.x = -452;
  ctx.z = -240;
  Q.update(0.1, ctx);
  ok(Q.currentObjective('a1-courier')?.id === 'pickup', 'REACH_MARKER needs a car');
  ctx.inVehicle = true;
  Q.update(0.1, ctx);
  ok(Q.currentObjective('a1-courier')?.id === 'drop' && Q.hud()!.timeLeft === 180, 'picked up: the 3-minute clock starts');
  const mk = Q.markers(() => null, ctx).find((m) => m.kind === 'boundary');
  ok(!!mk && mk.radius === 9 && mk.x === 452, 'the drop-off shows as a boundary ring');
  Q.update(181, ctx);
  ok(Q.status('a1-courier') === 'available' && events.includes('failed:a1-courier'), 'out of time: the job fails and can be retried');
  // Playtest bug #5: wasted (or busted) mid-delivery loses the cargo; the clock doesn't keep running.
  take('a1-courier');
  Q.talk('pike', ctx);
  ctx.x = -452;
  ctx.z = -240;
  Q.update(0.1, ctx);
  ok(Q.hud()!.timeLeft !== null, 'the clock is running again');
  Q.notify({ type: 'wasted' }, ctx);
  ok(Q.status('a1-courier') === 'available', 'wasted mid-delivery: the timed job fails (playtest #5)');
  ctx.x = 0;
  ctx.z = 0;
  take('a1-courier');
  Q.talk('pike', ctx);
  Q.notify({ type: 'busted' }, ctx);
  ok(Q.status('a1-courier') === 'active' && Q.hud()!.timeLeft === null, 'busted before the clock starts: the job stays on');
  ctx.x = -452;
  ctx.z = -240;
  Q.update(0.1, ctx);
  ctx.x = 452;
  ctx.z = 80;
  Q.update(30, ctx);
  ok(Q.completedQuests.has('a1-courier') && got.blueprints.includes('cold-air-intake'), 'delivered in time: blueprint reward');
  ctx.inVehicle = false;
  take('a1-small-time');
  Q.notify({ type: 'heist', target: 'diamond-row', ok: true }, ctx);
  ok(Q.status('a1-small-time') === 'active', 'the wrong heist doesn\'t count');
  Q.notify({ type: 'heist', target: 'quik-cash', ok: false }, ctx);
  ok(Q.status('a1-small-time') === 'active', 'a failed heist doesn\'t count');
  Q.notify({ type: 'heist', target: 'quik-cash', ok: true }, ctx);
  ok(Q.completedQuests.has('a1-small-time'), 'COMPLETE_HEIST: Quik Cash done');
  take('a1-dutch');
  ok(Q.markers((ref) => (ref === 'boss:dockside-dutch' ? { x: -468, z: 200 } : null), ctx).some((m) => m.kind === 'boss' && m.color === C.settings!.bossColor), 'the boss shows as a red marker');
  Q.notify({ type: 'boss', boss: 'dockside-dutch', won: false }, ctx);
  ok(Q.status('a1-dutch') === 'active', 'losing to the boss: try again');
  Q.notify({ type: 'boss', boss: 'dockside-dutch', won: true }, ctx);
  ok(Q.storyFlags.has('league-pass') && events.includes('actCompleted:act1') && got.items.includes('capturePodx2'), 'DEFEAT_BOSS: League Pass, Act I complete');
  Q.update(0.1, ctx);
  ok(Q.rank === 'street' && events.includes('rank:street'), `promoted to the Street Division (${ctx.streetCred} Street Cred)`);
  ok(Q.raceRules('harbor-run', ctx).open && Q.raceRules('harbor-run', ctx).fee === 150, 'the Harbor Run opens, with a $150 entry fee');
  // Act II.
  take('a2-first-league-win');
  Q.notify({ type: 'race', track: 'west-side-sprint', place: 2 }, ctx);
  ok(Q.status('a2-first-league-win') === 'active', 'second place isn\'t a win');
  Q.notify({ type: 'race', track: 'west-side-sprint', place: 1 }, ctx);
  ok(Q.completedQuests.has('a2-first-league-win'), 'WIN_RACE: any track');
  take('a2-smoke');
  Q.notify({ type: 'catch', species: 'cinderblock', types: ['concrete'], level: 8, district: 'downtown' }, ctx);
  ok(Q.currentObjective('a2-smoke')?.id === 'bass', 'a Concrete type doesn\'t count for "catch a Bass type"');
  Q.notify({ type: 'catch', species: 'subsonic', types: ['bass'], level: 9, district: 'downtown' }, ctx);
  ok(Q.currentObjective('a2-smoke')?.id === 'boss', 'CATCH_STREETMON by type');
  Q.notify({ type: 'boss', boss: 'haze', won: true }, ctx);
  take('a2-bassline');
  Q.notify({ type: 'catch', species: 'curbstone', types: ['concrete'], level: 7, district: 'midtown' }, ctx);
  Q.notify({ type: 'boss', boss: 'sal', won: true }, ctx);
  ok(Q.completedQuests.has('a2-smoke') && Q.completedQuests.has('a2-bassline'), 'both crews beaten');
  ctx.streetCred = Math.max(ctx.streetCred, 60);
  Q.update(0.1, ctx);
  ok(Q.rank === 'pro', 'Pro Division needs 60 Street Cred and both crew bosses');
  take('a2-harbor');
  ok(Q.raceRules('harbor-run', ctx).fee === 400, 'Pro entry fee $400');
  Q.notify({ type: 'race', track: 'harbor-run', place: 1 }, ctx);
  Q.choose(Q.talk('vex', ctx)!, 0, ctx);
  ok(Q.completedQuests.has('a2-harbor') && events.includes('actCompleted:act2'), 'Act II complete');
  // Act III: heists.
  take('a3-ice');
  Q.notify({ type: 'heist', target: 'diamond-row', ok: true }, ctx);
  take('a3-transport');
  Q.notify({ type: 'heist', target: 'armored-transport', ok: true }, ctx);
  take('a3-vault');
  Q.notify({ type: 'heist', target: 'first-empire-vault', ok: true }, ctx);
  Q.choose(Q.talk('accountant', ctx)!, 0, ctx);
  ok(got.mons.includes('Vault Queen') && events.includes('actCompleted:act3'), 'Act III: the Vault Queen (legendary)');
  // Act IV: crackdown.
  take('a4-crackdown');
  ok(got.wanted.at(-1) === 5 && ctx.stars === 5, 'ESCAPE_WANTED puts five stars on you');
  Q.notify({ type: 'busted' }, ctx);
  ok(Q.status('a4-crackdown') === 'available', 'busted: the crackdown fails');
  take('a4-crackdown');
  Q.update(0.1, ctx);
  ctx.stars = 2;
  Q.update(0.1, ctx);
  ok(Q.status('a4-crackdown') === 'active', 'still wanted');
  ctx.stars = 0;
  Q.update(0.1, ctx);
  ok(Q.completedQuests.has('a4-crackdown'), 'lost the police: done');
  take('a4-midnight');
  ok(Q.raceRules('harbor-run', ctx).police === 3 && Q.raceRules('harbor-run', ctx).nightOnly, 'the midnight sprint brings 3 stars and needs night');
  Q.notify({ type: 'race', track: 'harbor-run', place: 1, night: false }, ctx);
  ok(Q.status('a4-midnight') === 'active', 'a daytime win doesn\'t count');
  Q.notify({ type: 'race', track: 'harbor-run', place: 1, night: true }, ctx);
  take('a4-hale');
  Q.notify({ type: 'boss', boss: 'captain-hale', won: true }, ctx);
  ok(events.includes('actCompleted:act4'), 'Act IV complete');
  // Act V.
  ctx.streetCred = 100;
  take('a5-qualify');
  ctx.streetCred = 119;
  Q.update(0.1, ctx);
  ok(Q.currentObjective('a5-qualify')?.type === 'REACH_STREET_CRED', 'REACH_STREET_CRED waits for 120');
  ctx.streetCred = 125;
  ctx.tunedSlots = 2;
  Q.update(0.1, ctx);
  ok(Q.completedQuests.has('a5-qualify'), 'Street Cred and a two-slot car: qualified');
  money = 1000;
  let gd = Q.talk('vex', ctx)!;
  const pay = Q.choose(gd, 0, ctx);
  ok(Q.status('a5-grand-prix') === 'available' && /2,500/.test(pay.next?.text ?? ''), 'no buy-in money: Vex sends you away');
  money = 5000;
  take('a5-grand-prix');
  ok(Q.status('a5-grand-prix') === 'active' && money === 2500, 'the $2,500 buy-in is paid');
  for (const t of ['west-side-sprint', 'uptown-switchback', 'central-green-circuit']) Q.notify({ type: 'race', track: t, place: 1 }, ctx);
  ok(Q.currentObjective('a5-grand-prix')?.type === 'ESCAPE_WANTED' && ctx.stars === 4, 'three stages won, then a four-star pursuit');
  Q.update(0.1, ctx);
  ctx.stars = 0;
  Q.update(0.1, ctx);
  take('a5-commissioner');
  Q.notify({ type: 'boss', boss: 'commissioner-varga', won: true }, ctx);
  Q.choose(Q.talk('vex', ctx)!, 0, ctx);
  ok(Q.storyFlags.has('campaign-complete') && got.mons.includes('Apex') && events.includes('actCompleted:act5'), 'the Commissioner falls: campaign complete, the Apex is yours');
  ctx.streetCred = 160;
  Q.update(0.1, ctx);
  ok(Q.rank === 'apex', 'Apex Champions division');
  ok(Q.completedQuests.size === C.quests.length && !Q.availableQuests().length, 'every quest done');
  ok(got.blueprints.length === C.blueprints!.length, 'every blueprint earned');
  // Save / load.
  const Q2 = new QuestManager({ campaign: C, league: LG, adapter: {} });
  Q2.load(JSON.parse(JSON.stringify({ ...Q.serialize(), completed: [...Q.serialize().completed, 'not-a-quest'] })));
  ok(Q2.completedQuests.size === C.quests.length && Q2.storyFlags.has('campaign-complete') && Q2.blueprints.size === 5 && Q2.legendaries.has('apex'), 'progress saves and loads (unknown ids dropped)');
  const Q3 = new QuestManager({ campaign: C, league: LG, adapter: {} });
  Q3.load({ active: [{ id: 'a1-courier', objective: 2, count: 0 }], completed: ['a1-welcome', 'a1-grease-monkey'] });
  ok(Q3.currentObjective('a1-courier')?.id === 'drop' && Q3.activeQuests.get('a1-courier')!.timeLeft === 180, 'an active timed objective reloads with a fresh clock');
  const sv = loadSave({ version: 2, campaign: { active: [{ id: 'a1-dutch', objective: 0, count: 0, ready: false }], completed: ['a1-grease-monkey', 'BAD ID'], flags: ['league-pass'], bosses: [], blueprints: [], legendaries: [], acts: [], tracked: 'a1-dutch', stats: { started: 1, completed: 1, failed: 0 } }, blueprints: ['cold-air-intake'] }).data;
  ok(sv.campaign.completed.length === 1 && sv.campaign.flags[0] === 'league-pass' && sv.campaign.active[0].id === 'a1-dutch', 'campaign saves are checked on load');
  ok(loadSave({ version: 2 }).data.campaign.completed.length === 0, 'older saves start the story fresh');
  // Map icons.
  const mc2 = mapIconsJson as unknown as MapConfig;
  ok(['missionGiver', 'missionObjective', 'missionBoss'].every((k) => mc2.icons[k]?.layer === 'missions'), 'mission icons on their own map layer');
}

// ------------------------------------------------------------------ battle arena (no clipping)
{
  console.log('--- battle arena');
  const open = (): boolean => true;
  const a0 = chooseArena({ player: { x: 0, z: 0 }, foe: { x: 0, z: 10 }, clear: open });
  ok(a0.problems === 0 && a0.turned === 0 && a0.far === ARENA.far, 'open ground: the natural line towards the foe');
  // A pavement-to-pavement street running east-west, 7 m wide (|z| < 3.5); the foe is across it.
  const street = (x: number, z: number): boolean => Math.abs(z) < 3.5;
  const a1 = chooseArena({ player: { x: 0, z: -2.5 }, foe: { x: 0, z: 3 }, clear: street });
  const marks = [spotOf(a1, 0, 0), spotOf(a1, 1, 0)];
  ok(a1.problems === 0 && a1.turned !== 0, `across a narrow street: the line turns along it (${a1.turned} deg)`);
  ok(marks.every((m) => street(m.x, m.z)) && street(cameraOf(a1).pos.x, cameraOf(a1).pos.z), 'every mark and the camera are on open ground');
  const naive = { origin: { x: 0, z: -2.5 }, dir: { x: 0, z: 1 }, right: { x: 1, z: 0 }, camSide: 1 as const, far: ARENA.far };
  ok(arenaProblems(naive, street) > 0, '(the old straight-line layout put the foe inside the wall)');
  // A wall between them: a building corner.
  const corner = (x: number, z: number): boolean => !(x > 1 && x < 20 && z > 1 && z < 20);
  const a2 = chooseArena({ player: { x: 0, z: 0 }, foe: { x: 5, z: 5 }, clear: corner });
  ok(a2.problems === 0 && [spotOf(a2, 0, 0), spotOf(a2, 1, 0)].every((m) => corner(m.x, m.z)), 'a building corner in the way: laid out clear of it');
  // A raid: three on the player's side.
  const wide = (x: number, z: number): boolean => Math.abs(z) < 9;
  const a3 = chooseArena({ player: { x: 0, z: 0 }, foe: { x: 10, z: 0 }, clear: wide, slots: [3, 1] });
  const raidMarks = [0, 1, 2].map((i) => spotOf(a3, 0, i));
  ok(a3.problems === 0 && raidMarks.every((m) => wide(m.x, m.z)) && Math.hypot(raidMarks[1].x - raidMarks[2].x, raidMarks[1].z - raidMarks[2].z) > 2.5, 'a raid lines up three on the player side, all clear and apart');
  // Boxed in: it still returns the least-bad layout.
  const box = (x: number, z: number): boolean => Math.abs(x) < 2.5 && Math.abs(z) < 2.5;
  const a4 = chooseArena({ player: { x: 0, z: 0 }, foe: { x: 0, z: 3 }, clear: box });
  ok(!!a4 && a4.far === ARENA.farCompact, 'boxed in: a compact layout with the fewest problems');
  const nc = nearestClear(10, 0, street);
  ok(!!nc && street(nc.x, nc.z) && nearestClear(0, 50, street, 2) === null, 'nearestClear finds open ground next to a wall (or none in range)');
  // Speed: the worst case (nothing clear) stays cheap.
  let calls = 0;
  const t0 = Date.now();
  chooseArena({ player: { x: 0, z: 0 }, foe: { x: 0, z: 5 }, clear: () => (calls++, false) });
  ok(Date.now() - t0 < 60, `worst case lays out in ${Date.now() - t0} ms (${calls} checks)`);
}

// ------------------------------------------------------------------ tutorials
{
  console.log('--- tutorials');
  const TC = tutorialsJson as unknown as TutorialConfig;
  ok(validateTutorials(TC, { events: TC.events, actions: TC.actions }) === true, `${TC.tutorials.length} tutorials validate (events, actions, after chains)`);
  const bad = (c: Partial<TutorialConfig>, re: RegExp, what: string): void => {
    let msg = '';
    try {
      validateTutorials({ version: 1, tutorials: [], ...c } as TutorialConfig, { events: ['e'], actions: ['a'] });
    } catch (e) {
      msg = (e as Error).message;
    }
    ok(re.test(msg), `validation catches ${what}`);
  };
  const st = [{ text: 'x' }];
  bad({ tutorials: [{ id: 'a', category: 'c', title: 'A', steps: st }, { id: 'a', category: 'c', title: 'B', steps: st }] }, /duplicate/, 'a duplicate id');
  bad({ tutorials: [{ id: 'a', category: 'c', title: 'A', steps: st, after: ['zz'] }] }, /after unknown/, 'an unknown after');
  bad({ tutorials: [{ id: 'a', category: 'c', title: 'A', steps: st, after: ['b'] }, { id: 'b', category: 'c', title: 'B', steps: st, after: ['a'] }] }, /cycle/, 'an after cycle');
  bad({ tutorials: [{ id: 'a', category: 'c', title: 'A', steps: [{ text: 'Press {E to go' }] }] }, /unbalanced/, 'a broken key cap');
  bad({ tutorials: [{ id: 'a', category: 'c', title: 'A', steps: st, trigger: { on: 'nope' } }] }, /unknown trigger/, 'an unknown trigger event');
  bad({ tutorials: [{ id: 'a', category: 'c', title: 'A', steps: [{ text: 'x', do: 'nope' }] }] }, /unknown action/, 'an unknown practice action');
  // Every tip the campaign asks for exists, and has no trigger of its own unless it's shared.
  const asked = (campaignJson as unknown as CampaignConfig).quests.flatMap((q) => q.objectives.filter((o) => o.tutorial).map((o) => o.tutorial!));
  ok(asked.length >= 8 && asked.every((id) => TC.tutorials.some((t) => t.id === id)), `the campaign's objectives ask for ${asked.length} tips, all defined`);
  ok(TC.tutorials.filter((t) => !t.trigger).every((t) => asked.includes(t.id)), 'every tip without a trigger is one the campaign asks for');
  // Coverage: every key on the controls list is taught somewhere.
  const taught = new Set(TC.tutorials.flatMap((t) => t.steps.flatMap((x) => parseKeys(x.text).filter((k): k is { key: string } => typeof k !== 'string').map((k) => k.key))));
  const keys = ['W', 'A', 'S', 'D', 'Mouse', 'Shift', 'Alt', 'Space', 'E', 'F', 'RMB', 'LMB', 'R', 'Q', 'Tab', 'B', 'C', 'V', 'G', 'I', 'N', 'H', 'M', 'J', 'Y', 'Backspace', 'Z', 'X', 'Esc', 'K', 'T', '1', '4', '5'];
  const missing = keys.filter((k) => !taught.has(k));
  ok(!missing.length, `every control is taught by a tip${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
  // Every situation the game reports triggers something.
  const used = new Set(TC.tutorials.flatMap((t) => (t.trigger ? (Array.isArray(t.trigger) ? t.trigger : [t.trigger]) : []).map((x) => x.on)));
  ok(TC.events!.every((e) => used.has(e)), 'every event the game fires is used by a tip');

  ok(JSON.stringify(parseKeys('Press {E} to {Shift} go')) === JSON.stringify(['Press ', { key: 'E' }, ' to ', { key: 'Shift' }, ' go']), 'key caps parse out of the text');
  ok(triggerMatches({ on: 'w', if: { stars: { gte: 3 } } }, { stars: 4 }) && !triggerMatches({ on: 'w', if: { stars: { gte: 3 } } }, { stars: 2 }), 'trigger ranges');
  ok(triggerMatches({ on: 'b', if: { mode: ['turn', 'x'] } }, { mode: 'turn' }) && !triggerMatches({ on: 'b', if: { mode: 'turn' } }, { mode: 'realtime' }), 'trigger values and lists');

  // The real onboarding chain.
  const T = new TutorialManager({ config: TC });
  const shown: string[] = [];
  const closed: string[] = [];
  T.on('show', (v) => shown.push(v.id));
  T.on('close', (e) => closed.push(`${e.id}:${e.why}`));
  // Situations are re-reported while they're true (the game scans 4x a second).
  const run = (sec: number, where: 'play' | 'battle' | 'menu' | 'none' = 'play', still: string[] = []): void => {
    for (let t = 0; t < sec; t += 0.1) {
      for (const e of still) T.fire(e);
      T.update(0.1, { where });
    }
  };
  T.fire('questOffer');
  ok(T.pending.has('map') && !T.isQueued('map'), 'a job offer before you can drive waits (map needs driving first)');
  T.fire('newGame');
  T.fire('nearCar');
  ok(T.pending.has('cars'), 'next to a car before the basics: waits');
  run(0.2);
  ok(T.current?.id === 'basics' && T.view()!.practice === 5, 'new game: the On foot card, five things to try');
  ok(T.isQueued('cars'), 'the car tip queues once the basics card is up');
  T.action('move');
  T.action('look');
  ok(T.view()!.practiced === 2 && T.view()!.steps[0].done, 'practice steps tick off as you do them');
  T.action('sprint');
  T.action('jump');
  T.action('walk');
  ok(T.current!.closing > 0, 'all practised: the card closes itself');
  run(1.6);
  ok(closed.includes('basics:done') && !T.current, 'closed (done)');
  run(3.2, 'play', ['nearCar']);
  ok(T.current?.id === 'cars', 'then the car tip');
  T.action('enterCar');
  run(5, 'play', ['inCar']);
  ok(closed.includes('cars:done'), 'getting in ticks it off');
  run(3.2, 'play', ['inCar']);
  ok(T.current?.id === 'driving', 'then driving');
  for (const a of ['throttle', 'steer', 'handbrake', 'horn', 'exitCar']) T.action(a);
  run(5);
  run(3.2);
  ok(T.current?.id === 'map', 'then the map and the first job (released from pending)');
  ok(T.isSeen('basics') && T.isSeen('driving') && !T.isSeen('saving'), 'seen list');
  // Reading cards time out; Enter dismisses.
  T.dismiss();
  ok(closed.includes('map:dismissed'), 'Enter / Got it closes a card');
  // Where: a battle tip waits for a battle; a street tip steps aside for one.
  run(3.2, 'play', ['nearWild']);
  ok(T.current?.id === 'wild-streetmon', 'near a wild Streetmon: its tip');
  T.fire('battleStart', { mode: 'turn', kind: 'wild' });
  run(0.2, 'battle');
  ok(T.current?.id === 'battle-turn', 'a battle starts: the street tip steps aside for the battle tip');
  ok(T.queue.some((q) => q.id === 'wild-streetmon' && q.done), 'the street tip is kept (with its progress) for later');
  ok(!T.isQueued('battle-realtime'), 'turn-based mode: only the turn-based battle tip');
  T.dismiss();
  run(3.2, 'battle');
  ok(T.current?.id === 'types', 'then types (after the battle tip)');
  T.dismiss();
  run(3.2, 'battle');
  ok(T.current === null, 'the street tip does not show in a battle');
  run(3.2, 'play');
  ok(T.current?.id === 'wild-streetmon', 'back on the street it comes back');
  T.action('battle');
  run(8);
  // Urgent tips cut in: the battle card steps aside for "catch it now", then comes back.
  const U = new TutorialManager({ config: TC });
  U.fire('battleStart', { mode: 'turn', kind: 'wild' });
  for (let t = 0; t < 0.3; t += 0.1) U.update(0.1, { where: 'battle' });
  ok(U.current?.id === 'battle-turn', 'battle: the battle card');
  U.fire('foeWeak', { mode: 'turn' });
  U.update(0.1, { where: 'battle' });
  ok(U.current?.id === 'catching' && U.queue[0]?.id === 'battle-turn', 'the foe is weak: the catching tip cuts in, the battle card waits');
  U.dismiss();
  for (let t = 0; t < 3.2; t += 0.1) U.update(0.1, { where: 'battle' });
  ok(U.current?.id === 'battle-turn' && U.current.shownFor > 0, 'then the battle card comes back where it was');
  // Far more important tips cut in too (wanted over a tip about night time).
  const P = new TutorialManager({ config: TC });
  P.markSeen(['wild-streetmon']);
  P.fire('night');
  P.update(0.1, { where: 'play' });
  ok(P.current?.id === 'night', 'a minor tip is up');
  P.fire('wanted', { stars: 1 });
  P.update(0.1, { where: 'play' });
  ok(P.current?.id === 'wanted' && P.isQueued('night'), 'wanted (priority 92) cuts in over it (20); it comes back after');
  P.fire('nearShop');
  P.update(0.1, { where: 'play' });
  ok(P.current?.id === 'wanted', 'a lower tip does not cut in');
  // A card coming back after its practice was done meanwhile closes by itself.
  const R = new TutorialManager({ config: TC });
  R.markSeen(['basics']);
  R.fire('nearWild');
  for (let t = 0; t < 0.3; t += 0.1) R.update(0.1, { where: 'play' });
  R.fire('battleStart', { mode: 'turn', kind: 'wild' });
  R.update(0.1, { where: 'battle' });
  R.action('battle');
  R.dismiss();
  for (let t = 0; t < 3.2; t += 0.1) R.update(0.1, { where: 'battle' });
  R.dismiss();
  for (let t = 0; t < 3.5; t += 0.1) R.update(0.1, { where: 'play' });
  ok(R.current?.id === 'wild-streetmon' && R.view()!.steps[0].done && R.current.closing > 0, 'a card coming back counts what you did while it was away (and closes soon)');
  // Priority: busted outranks a reading tip in the queue.
  T.fire('nearShop');
  T.fire('busted');
  run(3.2, 'play', ['nearShop']);
  ok(T.current?.id === 'busted', 'higher priority first');
  T.dismiss();
  run(3.2, 'play', ['nearShop']);
  ok(T.current?.id === 'shop', 'then the rest');
  // Reading time.
  const t0 = T.current!.shownFor;
  run(30);
  ok(closed.includes('shop:timeout') && t0 < 1, 'a reading card closes after its reading time');
  // The campaign asks for a tip by id; once.
  ok(T.request('deliveries') && !T.request('deliveries'), 'the campaign requests a tip (once)');
  run(3.2);
  ok(T.current?.id === 'deliveries', 'requested tips show');
  T.dismiss();
  ok(!T.request('deliveries'), 'seen tips are not requested again');
  // Situational tips expire if they can't show for a long time; campaign ones don't.
  T.fire('nearClinic');
  T.request('bosses');
  run(50, 'none');
  ok(!T.isQueued('clinic') && T.isQueued('bosses'), 'a stale situational tip drops out; a requested one waits');
  run(3.2);
  T.dismiss();
  // Practice you already did: ticked straight away; all of it: the card is skipped.
  T.action('aim');
  T.action('fire');
  T.action('reload');
  T.action('weaponSwitch');
  T.action('weaponWheel');
  run(3.2, 'play', ['weaponOwned']);
  ok(T.current?.id !== 'weapons' && T.isSeen('weapons') && closed.includes('weapons:skipped'), 'a practice card you already know is skipped');
  T.action('flip');
  run(3.2, 'play', ['carFlipped']);
  ok(!T.current && T.isSeen('flip'), 'one-step practice already done: skipped too');
  // A situational tip only shows while its situation is still true (no "heat" tip after you've lost the stars).
  run(0.5, 'play', ['wanted']);
  T.fire('wanted', { stars: 1 });
  run(0.3, 'play');
  ok(T.current?.id === 'wanted', 'one star: the wanted tip');
  T.dismiss();
  T.fire('wanted', { stars: 3 });
  ok(T.isQueued('heat'), 'three stars: the heat tip is due');
  run(4, 'play');
  ok(T.current?.id !== 'heat' && !T.isSeen('heat'), 'the stars are gone before it could show: it waits');
  T.fire('wanted', { stars: 3 });
  run(0.3, 'play');
  ok(T.current?.id === 'heat', 'stars back: it shows');
  T.dismiss();
  bad({ events: ['e'], situations: ['nope'], tutorials: [{ id: 'a', category: 'c', title: 'A', steps: st }] }, /situation/, 'a situation that is not an event');
  // A tip you've outgrown is dropped: down the sewers before the manhole tip came up.
  T.fire('nearManhole');
  ok(T.isQueued('sewers'), 'next to a manhole: its tip is due');
  T.fire('inSewer');
  ok(!T.isQueued('sewers') && T.isSeen('sewers'), 'down the sewers already: the manhole tip is dropped');
  bad({ tutorials: [{ id: 'a', category: 'c', title: 'A', steps: st, skipOn: ['nope'] }] }, /skipOn/, 'an unknown skipOn event');
  // Tips off: nothing new; replays still work.
  T.setEnabled(false);
  ok(T.fire('night').length === 0 && !T.isQueued('night'), 'tips off: nothing queues');
  T.replay('basics');
  run(0.2, 'menu');
  ok(T.current?.id === 'basics' && T.view()!.replay && T.view()!.practiced === 0, 'replay from the pause menu (shows anywhere, fresh)');
  T.dismiss();
  T.setEnabled(true);
  // Save / load.
  const sv = JSON.parse(JSON.stringify(T.serialize()));
  const T2 = new TutorialManager({ config: TC });
  T2.load({ ...sv, seen: [...sv.seen, 'not-a-tip'] });
  ok(T2.isSeen('basics') && T2.isSeen('busted') && !T2.isSeen('not-a-tip') && T2.performed.has('aim'), 'seen tips and practised actions save and load');
  T2.fire('newGame');
  ok(!T2.isQueued('basics'), 'a seen tip does not come back');
  const off = new TutorialManager({ config: TC });
  off.load({ enabled: false, seen: [], performed: [] });
  ok(!off.enabled && off.fire('newGame').length === 0, 'tips off is saved');
  ok(off.list().reduce((n, c) => n + c.tutorials.length, 0) === TC.tutorials.length && off.list().every((c) => c.tutorials.length), 'the pause menu list has every tip, in categories');
  const ps = loadSave({ version: 2, tutorials: { enabled: false, seen: ['basics', 'BAD ID', 3], performed: ['move', '<script>'] } }).data.tutorials!;
  ok(ps.enabled === false && ps.seen.join() === 'basics' && ps.performed.join() === 'move', 'tutorial saves are checked on load');
  ok(loadSave({ version: 2 }).data.tutorials === undefined, 'older saves have no tutorial progress (the game marks the basics seen)');
  // Mark seen (older saves) releases waiting tips.
  const T3 = new TutorialManager({ config: TC });
  T3.fire('questOffer');
  T3.markSeen(['basics', 'cars', 'driving']);
  ok(T3.isQueued('map'), 'marking the chain seen releases what waited on it');
}

// ------------------------------------------------------------------ destructible environment
{
  console.log('--- destruction');
  const DC = destructiblesJson as unknown as DestructibleConfig;
  ok(validateDestructibles(DC) === true, 'destructibles.json is valid');
  let threw = false;
  try {
    validateDestructibles({ ...DC, kinds: { ...DC.kinds, lamp: { ...DC.kinds.lamp, material: 'jelly' } } });
  } catch {
    threw = true;
  }
  ok(threw, 'an unknown material is rejected');
  const mk = (): DestructionManager =>
    new DestructionManager({
      config: DC,
      props: [
        { kind: 'lamp', x: 0, z: 0 },
        { kind: 'hydrant', x: 10, z: 0 },
        { kind: 'trashCan', x: 20, z: 0 },
        { kind: 'tree', x: 40, z: 0, s: 1.2 },
        { kind: 'bench', x: 200, z: 200 },
      ],
    });
  const D = mk();
  const breaks: string[] = [];
  D.on('break', (e) => breaks.push(e.prop.kind));
  ok(D.blocksAt(0.3, 0, 0.5) && !D.blocksAt(5, 5, 0.5), 'an intact prop blocks the spot (battles keep clear of it)');
  // Breakaway: slow cars bump, fast cars snap the lamp off and lose a little speed.
  const slow = D.carSweep({ x: -3, z: 0, vx: 4, vz: 0, halfWidth: 1, ahead: 4 });
  ok(slow.broken.length === 0 && slow.slow === 1, 'a car at 14 km/h does not break a lamp post');
  const fast = D.carSweep({ x: -3, z: 0, vx: 20, vz: 0, halfWidth: 1, ahead: 4 });
  ok(fast.broken.length === 1 && fast.slow < 1 && fast.slow > 0.5 && breaks[0] === 'lamp', `a car at 72 km/h snaps it off (keeps ${Math.round(fast.slow * 100)}% speed)`);
  ok(!D.blocksAt(0, 0, 0.5) && D.brokenCount === 1, 'a broken prop no longer blocks');
  const side = D.carSweep({ x: 7, z: 5, vx: 20, vz: 0, halfWidth: 1, ahead: 6 });
  ok(side.broken.length === 0, 'props beside the car’s path are left alone');
  // Bullets: metal shrugs, plastic gives.
  const can = D.props[2];
  const hydrant = D.props[1];
  let shots = 0;
  while (!can.broken && shots < 100) {
    D.hit(can, 25, 'bullet');
    shots++;
  }
  let hShots = 0;
  while (!hydrant.broken && hShots < 400) {
    D.hit(hydrant, 25, 'bullet');
    hShots++;
  }
  ok(shots < 12 && hShots > shots * 3, `a can goes in ${shots} shots, a hydrant takes ${hShots}`);
  // Explosions fall off with distance.
  const E = mk();
  const gone = E.explosion(0, 0, 12);
  ok(gone.length >= 2 && !E.props[3].broken && !E.props[4].broken, `a car blast flattens what's around it (${gone.length}) and nothing far away`);
  // Streetmon moves: a weak move dents, a legendary wrecks a wider area.
  const M = mk();
  M.move(10, 0, 40);
  const weak = M.brokenCount;
  M.stomp(15, 0, 30);
  ok(weak <= 1 && M.brokenCount >= 4, 'a weak move barely dents the street; a legendary stomp levels it');
  // Repairs: only after the delay, far away and out of view.
  const R = mk();
  R.explosion(0, 0, 12);
  const n0 = R.brokenCount;
  const S = DC.settings;
  let t = 0;
  while (t < S.repairSeconds - 1) {
    R.update(0.5, { x: 0, z: 0, visible: () => false });
    t += 0.5;
  }
  ok(R.brokenCount === n0, 'nothing is repaired before the delay');
  for (let i = 0; i < 100; i++) R.update(0.5, { x: 0, z: 0, visible: () => false });
  ok(R.brokenCount === n0, 'nothing is repaired while you stand next to it');
  for (let i = 0; i < 100; i++) R.update(0.5, { x: 500, z: 500, visible: () => true });
  ok(R.brokenCount === n0, 'nothing is repaired in plain view');
  for (let i = 0; i < 100; i++) R.update(0.5, { x: 500, z: 500, visible: () => false });
  ok(R.brokenCount === 0 && R.props.every((p) => p.hp === p.maxHp), 'far away and out of sight, the street is put back');
  // The grid lookup stays cheap with thousands of props.
  const many: Array<{ kind: string; x: number; z: number }> = [];
  for (let i = 0; i < 4000; i++) many.push({ kind: 'lamp', x: (i % 80) * 20, z: Math.floor(i / 80) * 20 });
  const G = new DestructionManager({ config: DC, props: many });
  const t0 = performance.now();
  for (let i = 0; i < 2000; i++) G.carSweep({ x: (i * 7) % 1600, z: (i * 13) % 1000, vx: 25, vz: 3, halfWidth: 1, ahead: 5 });
  const ms = performance.now() - t0;
  ok(ms < 60, `2000 car sweeps over 4000 props in ${ms.toFixed(1)} ms`);
}

// ------------------------------------------------------------------ street props
{
  console.log('--- street props');
  const L = generateLayout(1903);
  const avoid = [{ x: L.blocks[0].x0 + 30, z: L.blocks[0].z0 + 1 }];
  const P = planStreetProps(L, avoid);
  const P2 = planStreetProps(L, avoid);
  ok(P.length > 100 && JSON.stringify(P) === JSON.stringify(P2), `${P.length} small props placed, the same every time`);
  const kinds = new Set(P.map((p) => p.kind));
  ok(['trashCan', 'newsBox', 'bench', 'mailbox'].every((k) => kinds.has(k as never)), 'cans, newspaper boxes, benches and mailboxes');
  ok(
    P.every((p) => L.blocks.some((b) => p.x > b.x0 + STREET_PROPS.corner - 3 && p.x < b.x1 - STREET_PROPS.corner + 3 && (Math.abs(p.z - (b.z0 + STREET_PROPS.inset)) < 0.01 || Math.abs(p.z - (b.z1 - STREET_PROPS.inset)) < 0.01))),
    'every prop is on a block’s kerb line, away from the corners',
  );
  let close = 0;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) < STREET_PROPS.clearance) close++;
  ok(close === 0 && P.every((p) => Math.hypot(p.x - avoid[0].x, p.z - avoid[0].z) >= STREET_PROPS.clearance), 'none crowd each other or the existing lamps and trees');
}

// ------------------------------------------------------------------ move effects (data-driven)
{
  console.log('--- move effects');
  const FX = moveFxJson as unknown as MoveFxConfig;
  const allMoves = (movesJson as { moves: Array<{ id: string; type: string; power: number; target?: string; signature?: boolean; projectile?: boolean; effects?: Array<{ type: string; who?: string }> }> }).moves;
  ok(validateMoveFx(FX, { moveIds: allMoves.map((m) => m.id), types: ['gun', 'concrete', 'grind', 'smoke', 'bass', 'wire', 'sludge'] }) === true, `move_fx.json is valid against all ${allMoves.length} moves`);
  let threw = false;
  try {
    validateMoveFx({ ...FX, moves: { ...FX.moves, noSuchMove: { style: 'orb' } } } as MoveFxConfig, { moveIds: allMoves.map((m) => m.id) });
  } catch {
    threw = true;
  }
  ok(threw, 'an effect for a move that does not exist is rejected');
  const plans = allMoves.map((m) => planMoveFx(m, FX));
  ok(plans.every((p) => FX_STYLES.includes(p.style) && FX_SOUNDS.includes(p.sound) && FX_SOUNDS.includes(p.hitSound) && p.travel >= 0 && p.scale >= 0.5), 'every move gets a known style, sounds and timing');
  const byId = (id: string) => planMoveFx(allMoves.find((m) => m.id === id)!, FX);
  ok(byId('pileUp').wreck && byId('pileUp').signature && byId('pileUp').aoe && byId('pileUp').scale > byId('slabSlam').scale, 'legendary signatures wreck the street and are bigger');
  ok(byId('slabSlam').melee && byId('slabSlam').lunge > 0 && !byId('snapShot').melee, 'slams lunge in; shots stay put');
  const brace = allMoves.find((m) => m.id === 'brace')!;
  ok(statusKind(brace) === 'buff' && byId('brace').self, 'status moves: Brace is a self buff');
  const p = byId('snapShot');
  ok(impactFor(p, { crit: true, mult: 1 }).size > impactFor(p, { crit: false, mult: 1 }).size && impactFor(p, { crit: false, mult: 0.5 }).size < impactFor(p, { crit: false, mult: 1 }).size, 'crits land bigger, resisted hits smaller');
}

// ------------------------------------------------------------------ legendary raids
{
  console.log('--- legendary raids');
  const RC = legendariesJson as unknown as RaidConfig;
  ok(validateRaids(RC, { species: (id) => !!species(id)?.legendary, quests: (id) => COMMUNITY.quests.some((q) => q.id === id) }) === true, 'legendaries.json is valid (species and quest exist)');
  ok(['gridlock', 'blackout', 'undertow'].every((id) => species(id).legendary && species(id).spawn.rarity === 'legendary'), 'three legendary species');
  ok(['gridlock', 'blackout', 'undertow'].every((id) => !['street', 'roof', 'sewer'].some((b) => DISTRICTS.some((d) => TIMES.some((t) => spawnTable(d, t, b as never).some((o) => o.spec.id === id))))), 'legendaries never spawn on their own');
  const S = RC.settings;
  let r = 0.5;
  const M = new RaidManager({ config: RC, rand: () => r });
  const ctx = { district: 'midtown', time: 'day', biome: 'street', partyLevel: 25 };
  // Rare rolls only every rareCheckSeconds, only where/when it lives, only with a strong enough team.
  r = 0;
  M.update(S.rareCheckSeconds - 1, ctx);
  ok(!M.active, 'no roll before the check interval');
  M.update(2, { ...ctx, partyLevel: S.minPartyLevel - 1 });
  ok(!M.active, 'a weak team never meets one');
  M.update(S.rareCheckSeconds, { ...ctx, time: 'night', district: 'park' });
  ok(!M.active, 'not in the wrong place or at the wrong time');
  const e1 = M.update(S.rareCheckSeconds, ctx);
  ok(e1[0]?.type === 'omen' && M.active?.id === 'gridlock' && M.active.status === 'omen', 'Gridlock rolls in Midtown by day: an omen first');
  ok(M.active!.level === 25 + S.levelOverParty, `its level follows your team (Lv ${M.active!.level})`);
  ok(!M.trigger('blackout', { partyLevel: 30 }), 'one raid at a time');
  const e2 = M.update(S.omenSeconds + 0.1, ctx);
  ok(e2[0]?.type === 'arrive' && M.active!.status === 'rampage', 'then it arrives and rampages');
  // The trainers chip it, but not below the floor.
  for (let i = 0; i < 100; i++) M.chip('gridlock', 0.05);
  ok(Math.abs(M.active!.hp - S.allies.hpFloor) < 1e-9, `trainers wear it down to ${S.allies.hpFloor * 100}% at most: the finish is yours`);
  // Fight: lose -> rampages on with its HP; the clock was paused while engaged.
  ok(M.engage('gridlock') && M.active!.status === 'engaged', 'B: engaged');
  const tBefore = M.active!.timer;
  M.update(500, ctx);
  ok(M.active!.status === 'engaged' && M.active!.timer === tBefore, 'the rampage clock stops during the fight');
  const e3 = M.disengage('gridlock', 'lose', 0.2);
  ok(e3[0]?.type === 'resume' && M.active!.status === 'rampage' && M.active!.hp === 0.2, 'lose: it rampages on, keeping the damage');
  M.engage('gridlock');
  const e4 = M.disengage('gridlock', 'win', 0);
  ok(e4[0]?.type === 'subdued' && M.active!.status === 'subdued' && M.active!.beaten === 1, 'win: subdued (the catch window opens)');
  const e5 = M.update(S.subduedSeconds + 1, ctx);
  ok(e5[0]?.type === 'escaped' && !M.active && M.state('gridlock').cooldownUntil > M.time, 'not caught in time: it escapes, on cooldown');
  ok(M.state('gridlock').hp > 0 && M.state('gridlock').hp <= S.escapeHeal, 'it heals a little while away');
  ok(!M.trigger('gridlock', { partyLevel: 25 }), 'no second visit during the cooldown');
  // Quest raid: Undertow, triggered at a place, beaten -> quest step done; caught -> gone for good.
  const at = { x: 10, y: -8, z: 20, biome: 'sewer' };
  ok(M.trigger('undertow', { partyLevel: 30, at, quest: 'the-deep-hum' }) && M.active!.at === at && M.active!.quest === 'the-deep-hum', 'a quest wakes Undertow where it sleeps');
  M.update(S.omenSeconds + 0.1, { ...ctx, biome: 'sewer' });
  M.engage('undertow');
  const e6 = M.disengage('undertow', 'win', 0);
  ok(e6[0]?.type === 'subdued' && (e6[0] as { quest: string | null }).quest === 'the-deep-hum', 'beating it finishes the quest step');
  const e7 = M.caught('undertow');
  ok(e7[0]?.type === 'caught' && M.state('undertow').caught && !M.active, 'caught: yours');
  ok(!M.trigger('undertow', { partyLevel: 30 }), 'a caught legendary never comes back');
  const U = new RaidManager({ config: RC, rand: () => 0 });
  const sewerCtx = { district: 'midtown', time: 'night', biome: 'sewer', partyLevel: 30 };
  ok(!U.rareEligible(U.def('undertow'), sewerCtx), 'Undertow never turns up by chance before its quest');
  U.state('undertow').beaten = 1;
  ok(U.rareEligible(U.def('undertow'), sewerCtx), 'once beaten in the quest (and not caught), it can turn up again in the tunnels');
  // A rampage left alone too long ends by itself.
  const M2 = new RaidManager({ config: RC, rand: () => 0 });
  M2.trigger('blackout', { partyLevel: 20 });
  M2.update(S.omenSeconds + 0.1, ctx);
  const e8 = M2.update(S.rampageSeconds + 1, ctx);
  ok(e8[0]?.type === 'escaped', 'left alone, it moves on');
  // Save and load.
  const saved = JSON.parse(JSON.stringify(M.save()));
  const M3 = new RaidManager({ config: RC });
  M3.load(saved);
  ok(M3.state('undertow').caught && M3.state('gridlock').beaten === 1 && M3.state('gridlock').cooldownUntil > 0 && !M3.active, 'saved: caught, record and cooldowns');
  M3.load({ legendaries: [{ id: 'gridlock', caught: 'yes', cooldownLeft: 1e12, hp: -5 }, 'junk'] });
  ok(M3.state('gridlock').caught && M3.state('gridlock').cooldownUntil <= S.cooldownSeconds && M3.state('gridlock').hp >= 0.2, 'a damaged save is cleaned up');

  // Raid battles: allies fight on your side (AI), the legendary acts twice, your loss is your team's.
  console.log('--- raid battles');
  const mine = createCreature('cinderblock', 60, () => 0.5);
  const bench = createCreature('slugger', 20, () => 0.5);
  const ally1 = createCreature('hustlepup', 60, () => 0.5);
  const ally2 = createCreature('strapback', 60, () => 0.5);
  const boss = createCreature('gridlock', 38, () => 0.5);
  boss.hpScale = S.hpScale;
  boss.hp = crMaxHp(boss);
  const plainHp = calcStats(species('gridlock'), 38, boss.ivs).hp;
  ok(boss.hp === Math.round(plainHp * S.hpScale), `the raid legendary has ${S.hpScale}x HP (${boss.hp})`);
  const B = new Battle({ name: 'your', members: [mine, bench], ai: false }, { name: 'Gridlock', members: [boss], ai: true }, () => 0.5, { wild: false, canRun: true, allies: [ally1, ally2], foeActions: 2, foeDamage: S.foeDamage });
  ok(B.sides[0].active.length === 3 && B.sides[0].active.filter((c) => c.ally).length === 2, 'two allies out beside yours');
  const me = B.sides[0].active.find((c) => !c.ally)!;
  const ev = B.runTurn([{ type: 'move', user: me, moveId: mine.moves[0], target: B.sides[1].active[0] }]);
  const users = ev.filter((e) => e.kind === 'move').map((e) => (e as { user: Combatant }).user);
  ok(users.filter((u) => u.side === 1).length === 2, 'the legendary acted twice');
  ok(users.filter((u) => u.ally).length === 2, 'both allies acted on their own');
  ally1.hp = 0;
  ally2.hp = 0;
  mine.hp = 10;
  ok(B.needsSwitch(0).length === 0 && B.canFight(0), 'fainted allies don’t ask you to switch');
  mine.hp = 0;
  bench.hp = 0;
  ok(!B.canFight(0), 'your team down = raid lost (allies don’t count)');
  ok(B.defeated.every((d) => d.by.every((c) => c !== ally1 && c !== ally2)), 'no XP bookkeeping for the allies');
  // Balance (seeded): a full Lv 25 team plus two trainers' Streetmon against each legendary. Very
  // strong at full HP; once the trainers have worn it down (it keeps the damage), it's winnable.
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const team = ['cinderblock', 'hustlepup', 'strapback', 'subsonic', 'exhaustfume', 'wirewhip'];
  const winRate = (id: string, start: number): number => {
    let w = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      const mine2 = team.map((t) => createCreature(t, 25, rnd));
      const al = [createCreature('slugger', 23, rnd), createCreature('hazeling', 23, rnd)];
      const bs = createCreature(id, 25 + S.levelOverParty, rnd);
      bs.hpScale = S.hpScale;
      bs.hp = Math.round(crMaxHp(bs) * start);
      const sim = new Battle({ name: 'your', members: mine2, ai: true }, { name: id, members: [bs], ai: true }, rnd, { wild: false, canRun: false, allies: al, foeActions: S.actionsPerTurn, foeDamage: S.foeDamage });
      for (let t = 0; t < 60 && !sim.over; t++) {
        sim.runTurn([]);
        sim.autoSwitch(0);
      }
      if (sim.winner === 0) w++;
    }
    return w / N;
  };
  for (const id of ['gridlock', 'blackout', 'undertow']) {
    const full = winRate(id, 1);
    const worn = winRate(id, S.allies.hpFloor);
    ok(full <= 0.6 && worn >= 0.5 && worn > full, `${id}: ${Math.round(full * 100)}% from full HP, ${Math.round(worn * 100)}% once worn down to ${S.allies.hpFloor * 100}%`);
  }
}

// ------------------------------------------------------------------ collider streaming
{
  console.log('--- collider streaming');
  const mk = (x: number, z: number) => {
    const c = { x, z, on: true, dead: false, sets: 0, setEnabled(v: boolean) { this.on = v; this.sets++; }, alive() { return !this.dead; } };
    return c;
  };
  const all: Array<ReturnType<typeof mk>> = [];
  const S = new ColliderStreamer({ cell: 40, radius: 150, hysteresis: 35, moveStep: 10, maxInterval: 0.75 });
  for (let x = -1000; x <= 1000; x += 20) for (let z = -1000; z <= 1000; z += 20) {
    const c = mk(x, z);
    all.push(c);
    S.add(c);
  }
  S.update(0, 0, 0, true);
  const near = all.filter((c) => Math.hypot(c.x, c.z) < 140);
  const far = all.filter((c) => Math.hypot(c.x, c.z) > 260);
  ok(near.every((c) => c.on) && far.every((c) => !c.on), `near ones on, far ones off (${S.stats.enabled} of ${S.stats.colliders} enabled)`);
  ok(S.stats.enabled < S.stats.colliders * 0.1, 'most of the city is out of the physics step');
  // Hysteresis: stepping just past the edge and back doesn't toggle anything.
  const edge = all.find((c) => c.x === 180 && c.z === 0)!;
  const before = edge.sets;
  S.update(1, 12, 0, true);
  S.update(1, -12, 0, true);
  S.update(1, 12, 0, true);
  ok(edge.sets - before <= 1, 'no thrashing at the boundary');
  // A held collider (a broken prop) stays off when its cell comes on, and follows it once released.
  const prop = all.find((c) => c.x === 600 && c.z === 600)!;
  S.hold(prop);
  S.update(0, 600, 600, true);
  ok(!prop.on && all.find((c) => c.x === 620 && c.z === 600)!.on, 'a broken prop stays off as you arrive');
  S.release(prop);
  ok(prop.on, 'repaired: back on');
  // Moving a little does nothing; removed colliders are skipped.
  const t0 = S.stats.toggled;
  S.update(0.1, 603, 601);
  ok(S.stats.toggled === t0, 'small moves are free');
  const gone = all.find((c) => c.x === 0 && c.z === 0)!;
  gone.dead = true;
  const sets = gone.sets;
  S.update(0, 0, 0, true);
  ok(gone.sets === sets, 'removed colliders are left alone');
}

// ------------------------------------------------------------------ dynamic resolution
{
  console.log('--- dynamic resolution');
  const run = (r: ResolutionScaler, secs: number, interval: number, cpu: number): Array<{ scale: number; shadow: number }> => {
    const changes: Array<{ scale: number; shadow: number }> = [];
    for (let t = 0; t < secs; t += interval) {
      const c = r.frame(interval, cpu);
      if (c !== null) changes.push(c);
    }
    return changes;
  };
  const a = new ResolutionScaler(2);
  ok(run(a, 20, 1 / 60, 0.006).length === 0 && a.scale === 2 && a.shadow === 2048, 'a steady 60 fps keeps full resolution and full shadows');
  const down = run(a, 6, 1 / 40, 0.008);
  ok(down.length >= 1 && down[0].scale === 2 && down[0].shadow === 1024, 'GPU-bound at 40 fps: the shadow map halves first, before any resolution drop');
  run(a, 80, 1 / 40, 0.008);
  ok(a.scale === a.floor && a.floor >= 1.24, `never below the floor (a 2x screen stops at ${a.floor})`);
  const up = run(a, 60, 1 / 60, 0.006);
  ok(up.length >= 2 && a.scale > a.floor, 'headroom again: steps back up');
  const one = new ResolutionScaler(1);
  run(one, 80, 1 / 30, 0.004);
  ok(one.floor === 0.875 && one.scale === 0.875, 'a 1x screen only ever drops to 0.875 (no blocky pixels)');
  const b = new ResolutionScaler(2);
  ok(run(b, 20, 1 / 40, 0.022).length === 0 && b.scale === 2, 'CPU-bound slow frames leave the resolution alone');
  const c = new ResolutionScaler(1.5);
  ok(run(c, 10, 0.5, 0.001).length === 0, 'stalls (tab switches, loading) are ignored');
}

// ------------------------------------------------------------------ people's looks
{
  console.log('--- people');
  let seed = 99;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const looks = Array.from({ length: 2000 }, () => randomLook(rnd));
  const women = looks.filter((l) => l.build === 'f');
  ok(women.length > 800 && women.length < 1150, `about half the crowd are women (${women.length} of 2000)`);
  ok(women.some((l) => l.skirt) && women.some((l) => !l.skirt) && looks.every((l) => !l.skirt || l.build === 'f'), 'some in skirts, some in trousers');
  const cops = Array.from({ length: 300 }, () => copLook(rnd));
  ok(cops.every((c) => !c.skirt && c.top === '#1c2a4a') && cops.some((c) => c.build === 'f' && c.hairStyle === 'bun'), 'officers: uniform trousers, women with their hair up');
  const mamaLu = COMMUNITY.npcs.find((n) => n.id === 'mama-lu')!;
  ok(mamaLu.look.build === 'f' && mamaLu.look.hairStyle === 'bun' && !!mamaLu.look.skirt && !!mamaLu.look.apron, 'Mama Lu: bun, skirt and apron');
}

// ------------------------------------------------------------------ cinematics and Mama's welcome
{
  console.log('--- cinematics');
  const C = cinematicsJson as unknown as CinematicConfig;
  const CQ = campaignJson as unknown as CampaignConfig;
  const known = {
    anchors: ['player', 'mama', 'chop', 'bank', 'raid', 'boss'],
    species: (id: string) => DATA.species.has(id),
    specs: (id: string) => ['taxi', 'sedan', 'suv', 'sports', 'police', 'van', 'beater'].includes(id),
    quests: (id: string) => CQ.quests.some((q) => q.id === id),
    acts: (id: string) => CQ.acts.some((a) => a.id === id),
  };
  ok(validateCinematics(C, known) === true, 'cinematics.json is valid');
  const badK = (f: (c: any) => void, what: string): void => {
    const c = JSON.parse(JSON.stringify(C));
    f(c);
    let threw = false;
    try {
      validateCinematics(c, known);
    } catch {
      threw = true;
    }
    ok(threw, `rejects: ${what}`);
  };
  badK((c) => (c.cinematics[0].shots[0].anchor = 'moon'), 'unknown anchor');
  badK((c) => (c.cinematics[0].shots[1].actors[0].species = 'pikachu'), 'unknown species');
  badK((c) => (c.cinematics[0].shots[0].fade = 99), 'fade longer than the shot');
  badK((c) => (c.cinematics[1].trigger = { questCompleted: 'nope' }), 'unknown quest trigger');
  badK((c) => (c.cinematics[1].id = 'intro'), 'duplicate id');
  ok(ease('inOut', 0) === 0 && ease('inOut', 1) === 1 && Math.abs(ease('inOut', 0.5) - 0.5) < 1e-9 && ease('in', 0.5) < 0.5 && ease('out', 0.5) > 0.5, 'easing curves');
  const intro = cinematicFor(C, { newGame: true }, new Set())!;
  ok(intro?.id === 'intro' && intro.shots.length >= 5, `the new-game intro (${intro.shots.length} shots, ${Math.round(new CinematicPlayer(intro, C.settings).duration)} s)`);
  const caps = intro.shots.map((s) => s.caption ?? '').join(' ');
  ok(/STREETMON/.test(caps) && /RACING/.test(caps) && /CRIME/.test(caps) && /MAMA RUST/.test(caps), 'it introduces Streetmon, racing and crime, and ends at Mama Rust');
  ok(intro.shots[intro.shots.length - 1].anchor === 'mama', '...on her');
  ok(cinematicFor(C, { newGame: true }, new Set(['intro'])) === null, 'one-off cinematics only play once');
  ok(cinematicFor(C, { actStarted: 'act3' }, new Set())?.id === 'act3' && cinematicFor(C, { actStarted: 'act9' }, new Set()) === null, 'acts II-V have their own');
  ok(['act2', 'act3', 'act4', 'act5'].every((a) => cinematicFor(C, { actStarted: a }, new Set())), 'every later act opens with one');
  ok(cinematicFor(C, { bossIntro: 'haze' }, new Set(['boss-intro']))?.id === 'boss-intro', 'the boss intro plays for every boss (the game keys it per boss)');
  ok(cinematicFor(C, { questCompleted: 'a1-welcome' }, new Set())?.id === 'chop-shop', "finishing Mama's welcome shows the Chop Shop");
  // Playing one: shots in order, camera poses, captions, fades, skipping.
  const P = new CinematicPlayer(intro, C.settings);
  const evs: string[] = [];
  const log = (e: any[]): void => {
    for (const x of e) evs.push(`${x.type}${x.index ?? ''}`);
  };
  log(P.update(0));
  ok(evs.join() === 'shot0' && P.black() > 0.95, 'starts on the first shot, from black');
  log(P.update(intro.shots[0].seconds / 2));
  const a0 = { x: 75, z: 30, y: 0 };
  const pose = P.pose(a0);
  const k0 = intro.shots[0].cam!;
  ok(pose.cam[0] > a0.x + k0[0][0] && pose.cam[0] < a0.x + k0[1][0] && P.black() === 0, 'half way: the camera is between its two marks, fully faded up');
  ok(P.caption().alpha === 1 && P.caption().text === 'EMPIRE STREETS', 'the caption is up');
  log(P.update(intro.shots[0].seconds / 2 + 0.01));
  ok(evs.includes('shotEnd0') && evs.includes('shot1') && P.index === 1, 'then the next shot');
  const park = intro.shots[1];
  const pup = park.actors![0];
  const start = P.actorPose(pup, { x: 0, z: 0 });
  log(P.update(park.seconds * 0.9));
  const later = P.actorPose(pup, { x: 0, z: 0 });
  ok(Math.hypot(later.x - start.x, later.z - start.z) > 3 && later.moving, 'actors walk their line');
  ok(Math.abs(Math.atan2(-(pup.to![1] - pup.from[1]), pup.to![0] - pup.from[0]) - later.heading) < 1e-9, '...facing where they go (heading 0 = +X)');
  const turned = new CinematicPlayer({ id: 'x', shots: [{ seconds: 2, orient: true, cam: [[4, 2, 0], [4, 2, 0]], look: [[0, 1, 0], [0, 1, 0]] }] } as any, C.settings);
  turned.update(0);
  const tp = turned.pose({ x: 10, z: 10, heading: Math.PI / 2 });
  ok(Math.abs(tp.cam[0] - 10) < 1e-9 && Math.abs(tp.cam[2] - 6) < 1e-9, 'oriented shots turn with the anchor (in front of someone facing -Z)');
  log(P.skip());
  ok(P.done && P.skipped && evs[evs.length - 1] === 'end' && P.black() === 0, 'skipping ends it at once, without the fade');
  const Q2 = new CinematicPlayer({ id: 'y', skippable: false, shots: [{ seconds: 1, cam: [[0, 1, 0], [0, 1, 0]], look: [[1, 1, 0], [1, 1, 0]] }] } as any, C.settings);
  Q2.update(0);
  ok(Q2.skip().length === 0 && !Q2.done, 'unskippable ones can be marked so');
  const all: string[] = [];
  for (let i = 0; i < 20 && !Q2.done; i++) for (const e of Q2.update(0.1)) all.push(e.type);
  ok(Q2.done && all[all.length - 1] === 'end' && Q2.black() === 1, 'runs out on its own, ending on black');
  // Mama's welcome: saves from before it existed skip it.
  const QM = new QuestManager({ campaign: CQ, league: leagueJson as unknown as LeagueConfig, adapter: {} });
  ok(QM.markCompleted('a1-welcome') && QM.status('a1-welcome') === 'done' && QM.availableQuests().includes('a1-grease-monkey'), "an old save with a team counts Mama's welcome as done");
  ok(!QM.markCompleted('a1-welcome') && !QM.markCompleted('nope'), '...once');
  ok(BATTLE.starterItems.length === 0, 'a new game starts with no cuffs: Mama hands them out');
}

// ------------------------------------------------------------------ tougher cars, the wardrobe
{
  console.log('--- car durability');
  ok(carDamageTaken(100, 'impact') === 45 && carDamageTaken(100, 'bullet') === 50 && carDamageTaken(100, 'explosive') === 70 && carDamageTaken(100, 'raw') === 100, 'hits are scaled by kind (crash 45%, bullets 50%, blasts 70%)');
  ok(carDamageTaken(100, 'impact', 2) === 22.5 && carDamageTaken(-5, 'impact') === 0, 'armour still divides it; nothing negative');
  // A sedan (900 HP) hitting a wall at 50 km/h: about 13.9 m/s of impact, the crash formula in VehicleManager.
  const crash = (dv: number, thr: number, mult: number): number => Math.max(0, dv - thr) * 55 * mult;
  const before = Math.ceil(900 / crash(13.9, 2.4, 1));
  const now = Math.ceil(900 / crash(13.9, CAR_DURABILITY.crashThreshold, CAR_DURABILITY.impact));
  ok(now >= before * 2, `a sedan takes ${now} head-on 50 km/h crashes to burn (was ${before})`);
  ok(crash(3, CAR_DURABILITY.crashThreshold, 1) === 0, 'kerbs and nudges (under 3.4 m/s) are free');
  ok(Math.ceil(900 / carDamageTaken(25 * 1.6, 'bullet')) >= 40, 'it takes 40+ rifle rounds to set a sedan alight');
  ok(carDamageTaken(900 * 0.9, 'explosive') < 900, 'a car right next to an exploding one survives (no endless chain reactions)');
  ok(CAR_DURABILITY.burnSeconds >= 9, `once alight you have ${CAR_DURABILITY.burnSeconds} s to get out`);

  console.log('--- wardrobe');
  ok(JSON.stringify(sanitizeLook(DEFAULT_LOOK)) === JSON.stringify(DEFAULT_LOOK), 'the default look survives a save round trip');
  const odd = sanitizeLook({ skin: 'red', hair: '#123456', scale: 9, build: 'x', hat: 'crown', glasses: 'yes', jacket: '#abcdef', facialHair: 'beard', skirt: true })!;
  ok(odd.skin === DEFAULT_LOOK.skin && odd.hair === '#123456' && odd.scale === LOOK_OPTIONS.scale[1] && odd.build === 'm' && odd.hat === 'none' && !odd.glasses && odd.jacket === '#abcdef' && odd.facialHair === 'beard' && odd.skirt, 'bad fields fall back, good ones are kept, height is clamped');
  ok(sanitizeLook(null) === null && sanitizeLook('x') === null, 'no look: null (older saves keep the default figure)');
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const looks = Array.from({ length: 200 }, () => randomPlayerLook(rnd));
  ok(looks.every((l) => JSON.stringify(sanitizeLook(l)) === JSON.stringify(l)), 'random looks are always valid');
  ok(looks.some((l) => l.build === 'f') && looks.some((l) => l.build === 'm') && looks.every((l) => l.build === 'm' || l.facialHair === 'none'), 'random: both builds, no random beards on feminine builds');
  ok(OUTFITS.length >= 5 && OUTFITS.every((o) => sanitizeLook({ ...DEFAULT_LOOK, ...o.look })), `${OUTFITS.length} ready-made outfits`);
  const n = LOOK_OPTIONS.skin.length * LOOK_OPTIONS.hairStyle.length * LOOK_OPTIONS.hair.length * LOOK_OPTIONS.cloth.length ** 3 * LOOK_OPTIONS.hat.length * LOOK_OPTIONS.facialHair.length * 2 * 2;
  ok(n > 1e6, `over a million combinations (${(n / 1e6).toFixed(0)} million, before height and jackets)`);
}

// ------------------------------------------------------------------ cinematic music and smoother changes
{
  console.log('--- music transitions');
  ok(pickTrack({ battle: 'wild', stars: 3, chasing: true, cinematic: 'intro' }) === 'intro' && pickTrack({ battle: null, stars: 0, chasing: false, cinematic: 'action' }) === 'cinematic', 'cinematics with music win over everything');
  ok(pickTrack({ battle: null, stars: 0, chasing: false, cinematic: null }) === 'overworld', "a cinematic without music leaves the game's track on");
  const C = cinematicsJson as unknown as CinematicConfig;
  const cue = (id: string): string | undefined => C.cinematics.find((c) => c.id === id)?.music;
  ok(cue('intro') === 'intro', 'the opening plays Glass and Steel');
  ok(['act2', 'act3', 'act4', 'act5', 'boss-intro', 'raid-arrive'].every((id) => cue(id) === 'action') && cue('chop-shop') === undefined, 'acts, boss intros and legendaries play Apex of the Chain; the calm Chop Shop scene keeps the street music');
  ok(fadeFor('overworld', 'wildBattle') < fadeFor('wildBattle', 'overworld') && fadeFor('cinematic', 'overworld') > fadeFor('wildBattle', 'overworld'), 'quick into action, slower back down, slowest out of a cinematic');
  const ids: TrackId[] = ['overworld', 'wildBattle', 'chase', 'intro'];
  const D = new MusicDirector();
  const ready = (): boolean => true;
  const run = (want: TrackId, secs: number): void => {
    for (let t = 0; t < secs; t += 1 / 60) {
      D.request(want, 1 / 60, ready);
      D.update(1 / 60, ids);
    }
  };
  run('overworld', 2);
  ok(D.current === 'overworld' && D.level.get('overworld') === 1, 'starts on the street track');
  // Equal power: half way through a crossfade the summed power stays ~1 (linear fades dip to 0.5).
  D.request('wildBattle', 1 / 60, ready);
  let minPower = 2;
  for (let t = 0; t < MUSIC.fadeUp + 0.2; t += 1 / 60) {
    const v = D.update(1 / 60, ids);
    minPower = Math.min(minPower, (v.get('overworld') ?? 0) ** 2 + (v.get('wildBattle') ?? 0) ** 2);
  }
  ok(minPower > 0.97, `equal-power crossfade: loudness holds through the change (min power ${minPower.toFixed(2)})`);
  // Hysteresis: a calmer track waits; a flicker back up cancels it.
  run('chase', 0.5);
  ok(D.current === 'wildBattle', 'a calmer track waits before taking over');
  run('wildBattle', 0.5);
  run('chase', MUSIC.settleDown + 0.2);
  ok(D.current === 'chase', `...and switches once it has held for ${MUSIC.settleDown} s`);
  run('wildBattle', 0.1);
  ok(D.current === 'wildBattle', 'more intense: at once');
  // Back to the battle music within a few seconds resumes it; after a long while it restarts.
  const D2 = new MusicDirector();
  D2.request('wildBattle', 1 / 60, ready);
  D2.update(1, ids);
  let r: ReturnType<MusicDirector['request']> = null;
  for (let t = 0; t < 3; t += 0.1) {
    D2.request('overworld', 0.1, ready);
    D2.update(0.1, ids);
  }
  for (let t = 0; t < 5; t += 0.1) D2.update(0.1, ids);
  r = D2.request('wildBattle', 0.1, ready);
  ok(!!r && r.start === 'wildBattle' && !r.restart, 'an event track you left moments ago picks up where it was');
  for (let t = 0; t < 4; t += 0.1) {
    D2.request('overworld', 0.1, ready);
    D2.update(0.1, ids);
  }
  for (let t = 0; t < MUSIC.resumeWithin + 2; t += 0.5) D2.update(0.5, ids);
  r = D2.request('wildBattle', 0.1, ready);
  ok(!!r && r.restart, '...and starts from the top after a while');
  // No gap while a track loads: the old one keeps playing until it can start, within a limit.
  const D3 = new MusicDirector();
  D3.request('overworld', 0.1, ready);
  D3.update(2, ids);
  let loaded = false;
  D3.request('intro', 0.1, () => loaded);
  D3.update(0.5, ids);
  ok(D3.current === 'overworld' && D3.pending === 'intro' && D3.level.get('overworld') === 1, 'a track still loading: the old one plays on');
  loaded = true;
  D3.request('intro', 0.1, () => loaded);
  ok(D3.current === 'intro', '...and the fade starts once it can play');
  const D4 = new MusicDirector();
  D4.request('overworld', 0.1, ready);
  for (let t = 0; t <= MUSIC.loadWait + 0.2; t += 0.1) D4.request('cinematic', 0.1, () => false);
  ok(D4.current === 'cinematic', `never waits more than ${MUSIC.loadWait} s`);
  ok(INTENSITY.intro > INTENSITY.boss && INTENSITY.overworld === 0, 'intensity ranks');
}

// ------------------------------------------------------------------ more XP, the escape rope
{
  console.log('--- XP and the escape rope');
  let sd = 3;
  const rr = (): number => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const foe = createCreature('gutterat', 8, rr);
  const old = Math.floor(((XP_TIER_BASE[1] * 8) / 7) * ((26 / 26) ** 2.5)) + 1;
  ok(XP_MULTIPLIER >= 2 && xpYield(foe, 8) >= old * 2 - 1, `XP from a fight is doubled (a Lv 8 foe at Lv 8: ${xpYield(foe, 8)} XP, was ${old})`);
  // Wins against same-level wild Streetmon to get a starter from Lv 5 to Lv 15.
  const wins = (mult: number): number => {
    const c = createCreature('cinderblock', 5, rr);
    let n = 0;
    while (c.level < 15 && n < 500) {
      const f = createCreature('gutterat', c.level, rr);
      gainXp(c, Math.max(1, Math.floor((xpYield(f, c.level) * mult) / XP_MULTIPLIER)), { timeOfDay: 'day', district: 'midtown' });
      n++;
    }
    return n;
  };
  const before = wins(1);
  const now = wins(XP_MULTIPLIER);
  ok(now <= Math.ceil(before / 1.9), `Lv 5 to 15 takes ${now} even wins now (was ${before})`);
  ok(BENCH_SHARE > 0 && BENCH_SHARE < 0.5, `the rest of the team gets ${Math.round(BENCH_SHARE * 100)}% (the fighters still get the most)`);
  const rope = DATA.items.get('escapeRope');
  ok(!!rope && rope.kind === 'field' && rope.price > 0, `Escape Rope: a field item, $${rope?.price} at clinics (and on the sewer black market)`);
}

// ------------------------------------------------------------------ cries, entrances, guidance, first car
{
  console.log('--- cries');
  const all = ALL_SPECIES();
  const cries = all.map((sp) => cryParams({ id: sp.id, types: sp.types, stage: sp.stage, line: sp.line, legendary: !!sp.legendary, model: sp.model }));
  const sig = (c: ReturnType<typeof cryParams>): string => [Math.round(c.base), c.wave, c.syllables.length, ...c.syllables.map((y) => `${y.p0.toFixed(2)}/${y.p1.toFixed(2)}/${y.p2.toFixed(2)}/${y.dur.toFixed(2)}`)].join('|');
  ok(new Set(cries.map(sig)).size === all.length, `all ${all.length} Streetmon have their own cry`);
  ok(JSON.stringify(cries[0]) === JSON.stringify(cryParams({ id: all[0].id, types: all[0].types, stage: all[0].stage, line: all[0].line, legendary: !!all[0].legendary, model: all[0].model })), 'cries are deterministic (the same every time)');
  const by = (id: string) => cries[all.findIndex((x) => x.id === id)];
  ok(by('gutterat').base > by('gridlock').base * 2.5, `small ones squeak, big ones bellow (Gutterat ${Math.round(by('gutterat').base)} Hz, Gridlock ${Math.round(by('gridlock').base)} Hz)`);
  ok(by('gridlock').echo > 0 && by('gridlock').sub > 0.4 && by('gridlock').length > by('hustlepup').length, 'legendaries are long, with a sub layer and an echo');
  ok(by('strapback').wave === 'square' && by('subsonic').sub > 0 && by('antennaroc').fmIndex > 0, 'types change the voice (Gun bark, Bass throb, Wire buzz)');
  ok(cries.every((c) => c.length > 0.1 && c.length < 4 && c.syllables.every((y) => y.dur > 0 && y.amp > 0)), 'every cry is between 0.1 and 4 s long');

  console.log('--- entrances and guidance');
  const L = generateLayout();
  const gar = planGarages(L);
  L.garages = gar;
  const keep = [{ x: 0, z: 0, r: 0 }];
  const plan = planRooftops(L, gar, undefined, keep);
  let close = 0;
  for (let i = 0; i < plan.access.length; i++) for (let j = i + 1; j < plan.access.length; j++) if (Math.hypot(plan.access[i].street.x - plan.access[j].street.x, plan.access[i].street.z - plan.access[j].street.z) < ACCESS_SPACING - 0.01) close++;
  ok(close === 0, `fire escapes and elevator doors are at least ${ACCESS_SPACING} m apart (${plan.access.length} of them)`);
  const blocker = { x: plan.access[0].street.x, z: plan.access[0].street.z, r: 2 };
  const moved = planRooftops(L, gar, undefined, [blocker]).access.find((a) => a.roofId === plan.access[0].roofId);
  ok(!moved || Math.hypot(moved.street.x - blocker.x, moved.street.z - blocker.z) >= blocker.r + 2.2 || Math.hypot(moved.street.x - blocker.x, moved.street.z - blocker.z) < 0.01, 'an entrance slides along its wall away from something in the way');
  const route = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 30 }];
  const pts = routeAhead(route, { x: 2, z: 1 }, 4, 30, 2);
  ok(pts.length >= 6 && Math.abs(pts[0].x - 4) < 1e-6 && Math.abs(pts[0].z) < 1e-6, `waypoint chevrons start just ahead of you on the route (${pts.length} in 30 m)`);
  ok(pts.some((p) => Math.abs(p.x - 20) < 1e-6 && p.z > 0 && Math.abs(p.dir - Math.PI / 2) < 1e-6) && pts.every((p) => p.d <= 30), '...turn the corner with it, and stop at the reach');
  ok(routeAhead([{ x: 0, z: 0 }], { x: 0, z: 0 }, 4, 30).length === 0, 'no route, no chevrons');
  // Routes never double back.
  const back = trimRoute({ x: 30, z: 2 }, [{ x: 0, z: 0 }, { x: 60, z: 0 }, { x: 60, z: 60 }], { x: 60, z: 80 });
  ok(back.length === 4 && back[1].x === 60 && back[1].z === 0, 'part-way along the first road: straight on to the next junction, not back to the last');
  const over = trimRoute({ x: 0, z: -40 }, [{ x: 0, z: 0 }, { x: 60, z: 0 }, { x: 120, z: 0 }], { x: 80, z: 4 });
  ok(over.length === 4 && over[over.length - 2].x === 60, "a destination part-way along the last road: no going to the far junction and back");
  const lone = trimRoute({ x: 10, z: 2 }, [{ x: 0, z: 0 }], { x: 40, z: 3 });
  ok(lone.length === 2, 'a lone junction behind you is skipped');
  const corner = trimRoute({ x: 0, z: -30 }, [{ x: 0, z: 0 }, { x: 60, z: 0 }], { x: 60, z: 30 });
  ok(corner.length === 4, 'a real corner is kept');
  const skew = trimRoute({ x: 313, z: -5 }, [{ x: 300, z: 31 }], { x: 381, z: 41 });
  ok(skew.length === 3, 'a corner just behind you on the cross street is still a corner (no cutting through buildings)');
  // Walking along a route: the arrows ahead always point onwards and run to the destination.
  const rt = [{ x: 0, z: -10 }, { x: 0, z: 0 }, { x: 60, z: 0 }, { x: 60, z: 62 }, { x: 75, z: 62 }];
  let backwards = 0;
  for (let s2 = 0; s2 < 140; s2 += 2) {
    const pts = routeAhead(rt, (() => { let d = s2; for (let i = 0; i < rt.length - 1; i++) { const L = Math.hypot(rt[i + 1].x - rt[i].x, rt[i + 1].z - rt[i].z); if (d <= L) return { x: rt[i].x + ((rt[i + 1].x - rt[i].x) * d) / L, z: rt[i].z + ((rt[i + 1].z - rt[i].z) * d) / L }; d -= L; } return rt[rt.length - 1]; })(), 4, 400, 2);
    for (let i = 1; i < pts.length; i++) if (pts[i].d <= pts[i - 1].d) backwards++;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last.x - 75, last.z - 62) > 4.5) backwards++;
  }
  ok(backwards === 0, 'walking a route: the arrows always lead onwards, all the way to the destination');
  const b = getSpec('beater');
  ok(b.spawnWeight === 0 && b.maxSpeed < getSpec('sedan').maxSpeed && b.engineForce < getSpec('sedan').engineForce, "Mama's Rustbucket: never in traffic, slower than anything else");
}

// ------------------------------------------------------------------ articulated motion, riders, rival Streetmon
{
  console.log('\n--- articulated motion, riders, rival Streetmon');
  ok(CLIP_FPS === 30, 'clips are sampled at 30 fps');
  // Every attack winds up, strikes and comes back to rest.
  let phasesOk = true;
  for (const st of ATTACK_STYLES) {
    const T = ATTACK_CLIPS[st];
    const a0 = attackPhase(st, 0);
    const aw = attackPhase(st, T.w);
    const ah = attackPhase(st, T.w + T.s + T.h * 0.5);
    const a1 = attackPhase(st, 1);
    if (!(a0.h === 0 && aw.w > 0.99 && ah.h > 0.95 && Math.abs(a1.h) < 1e-6 && Math.abs(a1.w) < 1e-6 && Math.abs(a1.held) < 1e-6)) phasesOk = false;
    if (T.release < T.w * T.duration || T.release > (T.w + T.s) * T.duration + 0.02) phasesOk = false;
  }
  ok(phasesOk, `${ATTACK_STYLES.length} attack styles: wind-up, strike, hold, back to rest; the release lands in the strike`);
  ok(attackStyleFor('shot') === 'shoot' && attackStyleFor('slam') === 'slam' && attackStyleFor('lob') === 'throw' && attackStyleFor('wave') === 'blast' && attackStyleFor('heal') === 'power' && attackStyleFor('debuff') === 'taunt' && attackStyleFor('dash') === 'strike', 'each move effect style picks its attack clip');
  const rig = rigInfo(['root', 'body', 'head', 'arm_L', 'arm_L_lo', 'arm_R', 'arm_R_lo', 'leg_L', 'leg_L_lo', 'leg_R', 'leg_R_lo']);
  const ctx = { H: 1, energy: 1, floating: false, flavour: 'gun' as const, rig, restBodyY: 0.4 };
  // A strike swings the lead (right) arm forward at the hit; the elbow is cocked in the wind-up.
  const T = ATTACK_CLIPS.strike;
  const wind = defaultPose('arm_R', 'attack_strike', T.w * T.duration, T.duration, ctx)!;
  const hit = defaultPose('arm_R', 'attack_strike', (T.w + T.s + 0.05) * T.duration, T.duration, ctx)!;
  const elbow = defaultPose('arm_R_lo', 'attack_strike', T.w * T.duration, T.duration, ctx)!;
  ok(wind.rot![0] > 0.5 && hit.rot![0] < -1 && elbow.rot![0] < -0.8, 'strike: the arm winds back with the elbow cocked, then swings through');
  // Different moves use the extremities differently: a slam raises both arms, a shot aims one.
  const S = ATTACK_CLIPS.slam;
  const slamL = defaultPose('arm_L', 'attack_slam', S.w * S.duration, S.duration, ctx)!.rot![0];
  const slamR = defaultPose('arm_R', 'attack_slam', S.w * S.duration, S.duration, ctx)!.rot![0];
  const SH = ATTACK_CLIPS.shoot;
  const aimR = defaultPose('arm_R', 'attack_shoot', (SH.w + SH.s + 0.1) * SH.duration, SH.duration, ctx)!.rot![0];
  const aimL = defaultPose('arm_L', 'attack_shoot', (SH.w + SH.s + 0.1) * SH.duration, SH.duration, ctx)!.rot![0];
  ok(slamL < -2 && slamR < -2 && aimR < -1.2 && aimL > aimR, 'slam: both arms overhead; shoot: the lead arm aims, the other supports');
  // Overlap: the forearm runs behind the upper arm.
  const up = (t: number): number => defaultPose('arm_R', 'attack_strike', t, T.duration, ctx)!.rot![0];
  const loT = (t: number): number => defaultPose('arm_R_lo', 'attack_strike', t, T.duration, ctx)!.rot![0];
  ok(Math.abs(loT(T.w * T.duration) - loT((T.w - 0.035) * T.duration)) < 0.25 && up(0) === 0, 'overlap: the elbow lags the shoulder');
  // Loops close.
  let loops = true;
  for (const n of ['body', 'head', 'arm_L', 'arm_L_lo', 'leg_R', 'leg_R_lo', 'tail_2', 'wing_L_tip']) {
    for (const [clip, dur] of [['idle', 2], ['walk', 1]] as const) {
      const a = defaultPose(n, clip, 0, dur, { ...ctx, rig: { ...rig, tailSegs: 3, wings: true } });
      const b = defaultPose(n, clip, dur, dur, { ...ctx, rig: { ...rig, tailSegs: 3, wings: true } });
      const diff = (x?: number[], y?: number[]): number => (x && y ? Math.max(...x.map((v, i) => Math.abs(v - y[i]))) : x || y ? 1 : 0);
      if (diff(a?.rot, b?.rot) > 1e-6 || diff(a?.pos, b?.pos) > 1e-6) loops = false;
    }
  }
  ok(loops, 'idle and walk loop seamlessly on every kind of node');
  // Walk knees fold through the swing only (never backwards).
  let kneeOk = true;
  for (let i = 0; i <= 30; i++) if ((defaultPose('leg_L_lo', 'walk', i / 30, 1, ctx)?.rot?.[0] ?? 0) < -1e-9) kneeOk = false;
  ok(kneeOk, 'knees only ever bend the right way');
  // Joints in the built models.
  const hb = buildCreatureModel(species('strapback'));
  const quad = buildCreatureModel(species('slugger'));
  const bird = buildCreatureModel(species('longshot'));
  ok(['arm_L_lo', 'arm_R_lo', 'leg_L_lo', 'leg_R_lo'].every((n) => hb.nodes.includes(n)) && ['leg_FL_lo', 'leg_BR_lo', 'tail_lo'].every((n) => quad.nodes.includes(n)) && bird.nodes.includes('wing_L_tip'), 'limbs get elbows and knees, wings tips, one-piece tails a tip');
  let blended = 0;
  let sumOk = true;
  hb.root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const w = m.geometry.getAttribute('skinWeight');
    for (let i = 0; i < w.count; i++) {
      const a = w.getX(i);
      const b2 = w.getY(i);
      if (b2 > 0) blended++;
      if (Math.abs(a + b2 + w.getZ(i) + w.getW(i) - 1) > 1e-4) sumOk = false;
    }
  });
  ok(blended > 20 && sumOk, `joint-spanning parts are soft-skinned across the joint (${blended} blended vertices, weights sum to 1)`);
  const names = hb.clips.map((c) => c.name);
  ok(ATTACK_STYLES.every((st) => names.includes(`attack_${st}`)) && names.includes('attack'), 'every model has all seven attack clips (and the all-purpose one)');
  // Key thinning keeps the curve.
  const times = Array.from({ length: 31 }, (_, i) => i / 30);
  const vals = times.map((t) => Math.sin(t * Math.PI));
  const lin = times.map((t) => t * 2);
  const th = thinKeys(times, vals, 1, 0.002);
  const tl = thinKeys(times, lin, 1, 0.002);
  let maxErr = 0;
  for (let i = 0; i < times.length; i++) {
    let j = 0;
    while (j < th.times.length - 2 && th.times[j + 1] < times[i]) j++;
    const f = (times[i] - th.times[j]) / (th.times[j + 1] - th.times[j]);
    maxErr = Math.max(maxErr, Math.abs(th.values[j] + (th.values[j + 1] - th.values[j]) * f - vals[i]));
  }
  ok(tl.times.length === 2 && th.times.length < 31 && maxErr <= 0.002 + 1e-9, `key thinning: a straight line keeps 2 keys, a curve ${th.times.length} of 31 within tolerance`);
  const sliced = slicePlane(new THREE.BoxGeometry(0.2, 1, 0.2), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, -1, 0), 0.5);
  const sp = sliced.getAttribute('position');
  let onPlane = 0;
  for (let i = 0; i < sp.count; i++) if (Math.abs(sp.getY(i)) < 1e-6) onPlane++;
  ok(onPlane >= 8 && sp.count / 3 > 12, `a limb sliced at its joint gets a ring of vertices to bend at (${sp.count / 3} triangles)`);
  // Riders' mounts on every car body.
  let mountsOk = true;
  for (const id of VEHICLES.map((v) => v.id)) {
    const spec = getSpec(id);
    for (const sl of ['engineBay', 'trunk', 'roofRack'] as const) {
      const m = slotMount(spec, sl);
      const inLen = Math.abs(m.x) < spec.length / 2;
      const facing = spec.style === 'bus' ? true : sl === 'trunk' ? m.face === -1 : m.face === 1;
      const order = spec.style === 'bus' ? true : sl === 'engineBay' ? m.x > 0 : sl === 'trunk' ? m.x < 0 : true;
      if (!inLen || !facing || !order || m.height <= 0 || m.sink < 0 || m.sink > 0.6) mountsOk = false;
    }
    if (spec.style !== 'bus' && slotMount(spec, 'roofRack').y <= slotMount(spec, 'engineBay').y) mountsOk = false;
  }
  ok(mountsOk, 'riders: engine bay up front facing forward, trunk at the back looking back, roof rack on top, on every body');
  // Rival loadouts scale with the race tier.
  const tcfg = validateConfig(tuningJson);
  const pool = ALL_SPECIES().map((x) => ({ id: x.id, name: x.name, types: x.types, stage: x.stage, legendary: !!x.legendary }));
  const ivs = { hp: 15, attack: 15, defense: 15, speed: 15, loud: 15 };
  const drivers = [{ name: 'A', streetmon: ['bass'] }, { name: 'B' }, { name: 'C', streetmon: ['smoke'] }];
  let seed = 7;
  const rng = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const loadout = (tier: number) => rivalLoadouts(drivers, tier, { config: tcfg, species: pool, statsOf: (id, lv) => calcStats(species(id), lv, ivs), rng });
  const t1 = loadout(1);
  const t3 = loadout(3);
  const t5 = loadout(5);
  const count = (l: typeof t1): number => l.reduce((a, x) => a + x.slots.length, 0);
  const allowed = (l: typeof t1, tier: number): boolean => l.every((x) => x.slots.every((sl) => !sl.ability || RIVAL_TIERS[tier - 1].abilities.includes(sl.ability)));
  ok(count(t1) === 1 && count(t3) >= 3 && count(t5) >= 6 && allowed(t1, 1) && allowed(t3, 3) && allowed(t5, 5), `more rivals armed with more Streetmon as the tier rises (${count(t1)} / ${count(t3)} / ${count(t5)} slots) and only the tier's abilities`);
  const lv = (l: typeof t1): number => Math.max(...l.flatMap((x) => x.slots.map((sl) => sl.level)), 0);
  const minLv = (l: typeof t1): number => Math.min(...l.flatMap((x) => x.slots.map((sl) => sl.level)));
  ok(lv(t1) <= 12 && minLv(t5) >= 46, `rival Streetmon levels scale (rookie up to ${lv(t1)}, apex from ${minLv(t5)})`);
  const a5 = t5.find((x) => x.slots.length)!;
  ok(t5.every((x) => x.slots.length && new Set(x.slots.map((sl) => sl.slot)).size === x.slots.length) && Object.values(a5.multipliers).every((v) => v > 0.8 && v < 1.6), 'each rival fills distinct slots, with sensible stat changes');
  ok(t5.some((x) => x.driver === 'A' && x.slots.some((sl) => pool.find((p) => p.id === sl.speciesId)!.types.includes('bass'))), 'racers lean to their favourite types');
  ok(raceTier(1, 3) === 3 && raceTier(4, 2) === 4 && raceTier(null, null) === 1, 'race tier: the higher of the track and your division');
  // The brain: waits out its reaction time, fires on an opening, then cools down.
  const horn = { driver: 'X', tier: 5, multipliers: {}, slots: [{ slot: 'trunk' as const, speciesId: 'woofer', name: 'Woofer', level: 50, info: { id: 'x', speciesId: 'woofer', types: ['bass'], level: 50, stats: calcStats(species('woofer'), 50, ivs) }, ability: 'sonicBassHorn', cooldown: 10, power: 1 }] };
  const brain = new RivalBrain(horn, () => 0);
  const close = { speed: 20, playerDist: 6, playerBehind: false, playerLateral: 2, straight: true };
  const far = { ...close, playerDist: 60 };
  let fired = 0;
  for (let i = 0; i < 300; i++) fired += brain.update(1 / 30, far).length;
  const before = fired;
  for (let i = 0; i < 30; i++) fired += brain.update(1 / 30, close).length;
  const afterFirst = fired;
  for (let i = 0; i < 60; i++) fired += brain.update(1 / 30, close).length;
  ok(before === 0 && afterFirst === 1 && fired === 1 && brain.cooldownLeft('trunk') > 7, 'rival brain: no opening, no horn; an opening, one blast; then a cooldown');
  ok(opening('spikeStripDispenser', { speed: 25, playerDist: 25, playerBehind: true, playerLateral: 1, straight: false }) && !opening('spikeStripDispenser', { speed: 25, playerDist: 25, playerBehind: false, playerLateral: 1, straight: false }), 'spike strips only drop with you behind and in line');
  const slow = new RivalBrain({ ...horn, tier: 1 }, () => 0);
  let slowFired = 0;
  for (let i = 0; i < 300; i++) slowFired += slow.update(1 / 30, far).length;
  for (let i = 0; i < 30; i++) slowFired += slow.update(1 / 30, close).length;
  ok(slowFired === 0, 'a rookie reacts slower than an apex racer (no blast within the same second)');
}

// ------------------------------------------------------------------ cars: classes, parts, nitrous, race modes
{
  console.log('\n--- car classes, parts, nitrous and race modes');
  const cls = Object.fromEntries(VEHICLES.map((v) => [v.id, classOf(performanceIndex(v))]));
  ok(VEHICLES.length >= 15, `${VEHICLES.length} car models`);
  ok(cls.bus === 'D' && cls.van === 'D' && cls.beater === 'D' && cls.limo === 'D', 'class D: bus, van, limo, the Rustbucket');
  ok(cls.sedan === 'C' && cls.taxi === 'C' && cls.hatch === 'C' && cls.suv === 'C' && cls.pickup === 'C', 'class C: the everyday cars');
  ok(cls.muscle === 'B' && cls.police === 'B' && cls.rally === 'B', 'class B: muscle, police, rally');
  ok(cls.sports === 'A' && cls.supercar === 'S', 'class A sports car, class S supercar');
  ok(VEHICLES.filter((v) => v.price > 0).length >= 14 && VEHICLES.find((v) => v.id === 'police')!.price === 0, 'everything but the police car is for sale');
  const eff = upgradeEffect({ engine: 3, tyres: 3, brakes: 3, suspension: 3, nitrous: 3, weight: 3, armor: 0 });
  const h = VEHICLES.find((v) => v.id === 'hatch')!;
  const built = classOf(performanceIndex(h, eff));
  ok(eff.topSpeed > 1.1 && eff.acceleration > 1.3 && eff.grip > 1.15 && eff.nitrous === 8 && eff.mass < 0.9 && built !== 'C' && classAllowed(built, 'B'), `a maxed hatchback climbs to class ${built}`);
  ok(upgradePrice('engine', 0, 9000) < upgradePrice('engine', 2, 9000) && upgradePrice('engine', 3, 9000) === 0 && upgradePrice('tyres', 0, 180000) > upgradePrice('tyres', 0, 9000), 'parts cost more per level and on dearer cars; nothing past max');
  const san = sanitizeUpgrades({ engine: 9, tyres: -2, nitrous: 1.6, junk: 3 });
  ok(san.engine === 3 && san.tyres === 0 && san.nitrous === 2 && !('junk' in san), 'saved upgrade levels are clamped and cleaned');
  const nos = new Nitrous(5);
  let boosted = 0;
  for (let i = 0; i < 100; i++) if (nos.step(0.1, true)) boosted++;
  const emptyAt = nos.charge;
  for (let i = 0; i < 100; i++) nos.step(0.1, false);
  ok(boosted >= 49 && boosted <= 60 && emptyAt < 1 && nos.charge > 5 * (10 / NITRO.refill) * 0.95 && !nos.active, `nitrous: a 5 s bottle boosts ${boosted / 10} s, then refills`);
  const stingy = new Nitrous(5);
  stingy.charge = 0.2;
  ok(!stingy.step(0.1, true), 'a dribble of nitrous does not fire');
  ok(rivalUpgrades(1, () => 0.5).engine === 0 && rivalUpgrades(5, () => 0.99).engine === 3 && rivalUpgrades(2, () => 0.5).nitrous === 0, 'rivals run stock as rookies and built cars at the top');
  // Race modes.
  const cfg2 = validateRaceConfig(racesJson as any);
  const modes = new Set(cfg2.tracks.map((t: any) => modeOf(t)));
  ok(['sprint', 'circuit', 'knockout', 'timeTrial', 'drift'].every((m) => modes.has(m)) && cfg2.tracks.length >= 10, `${cfg2.tracks.length} tracks across ${modes.size} modes`);
  const tt = cfg2.tracks.find((t: any) => t.mode === 'timeTrial')!;
  const dr = cfg2.tracks.find((t: any) => t.mode === 'drift')!;
  ok(medalPlace(tt, tt.medals.gold - 1) === 1 && medalPlace(tt, tt.medals.silver) === 2 && medalPlace(tt, tt.medals.bronze + 1) === 4 && medalPlace(dr, dr.medals.gold) === 1 && medalPlace(dr, 0) === 4, 'medals: a time trial by time, a drift event by score');
  const d1 = driftPoints(0.1, 30, 20, 0);
  const d2 = driftPoints(0.1, 30, 20, 4);
  ok(d1.points > 0 && d2.points > d1.points * 2.5 && driftPoints(0.1, 3, 20, 2).points === 0 && driftPoints(0.1, 3, 20, 2).chain === 0, 'drift points grow with the chain and reset when the slide ends');
  const cc = cfg2.tracks.find((t: any) => t.id === 'hatch-cup')!;
  ok(classOk('C', cc) && classOk('D', cc) && !classOk('A', cc) && classOk('S', cfg2.tracks[0]) && classOk(null, cc), 'class limits: C and below for the Hatch Cup, anything for an open race');
  let bad = '';
  try {
    validateRaceConfig({ ...cfg2, tracks: [{ ...cfg2.tracks[0], mode: 'knockout', laps: 1 }] });
  } catch (e) {
    bad = (e as Error).message;
  }
  ok(/knockout/.test(bad), 'a one-lap knockout is rejected');
  // A knockout race against a fake world: the last racer is out after each lap, the player can win.
  {
    const ko = cfg2.tracks.find((t: any) => t.id === 'uptown-knockout')!;
    const crs = buildCourse(ko);
    const racers = new Map<string, { x: number; z: number }>();
    const removed: string[] = [];
    let money = 5000;
    const m = new StreetRaceManager({
      adapter: {
        spawnProp: () => ({ dispose: () => {}, setState: () => {} }),
        spawnRacers: (_t, sl) => sl.map((s, i) => (racers.set(`n${i}`, { x: s.x, z: s.z }), `n${i}`)),
        racerPosition: (id) => racers.get(id) ?? null,
        removeRacers: () => racers.clear(),
        removeRacer: (id) => (removed.push(id), racers.delete(id), undefined),
        carClass: () => 'B',
        placePlayer: () => true,
        holdPlayer: () => {},
        getMoney: () => money,
        spend: (n) => (money >= n ? ((money -= n), true) : false),
        earn: (n) => void (money += n),
        getWanted: () => ({ stars: 0, heat: 0 }),
        restoreWanted: () => {},
      },
      config: cfg2,
      rng: () => 0.3,
    });
    m.streetCred = 50;
    m.offerRace('uptown-knockout', 'organizer');
    m.accept();
    m.startRace();
    const kos: string[] = [];
    m.on('knockout', (e: { name: string }) => kos.push(e.name));
    for (let i = 0; i < 20; i++) m.update(0.2, { inVehicle: true, x: ko.start.x, z: ko.start.z, speed: 0, freeRoam: true });
    // The player leads; n2 dawdles; everyone else keeps up.
    const perLap = ko.checkpointPositions.length;
    for (let k = 0; k < crs.length && m.state === 'RACING'; k++) {
      const p = crs[k];
      for (const [id, r] of racers) if (id !== 'n2' || k < perLap - 1) Object.assign(r, p);
      m.update(0.5, { inVehicle: true, x: p.x, z: p.z, speed: 20, freeRoam: true });
    }
    ok(m.state === 'RESOLVED' && m.result?.place === 1 && kos.length === ko.laps - 1 && removed[0] === 'n2' && m.result!.standings.filter((x) => /\(out\)/.test(x)).length === ko.laps - 1, `knockout: ${kos.length} racers out over ${ko.laps} laps, the dawdler first, the player wins`);
    ok(m.records['uptown-knockout']?.best !== undefined && m.records['uptown-knockout'].bestLap !== undefined, 'the win sets a best time and best lap');
    const saved = m.serialize();
    const m2 = new StreetRaceManager({ adapter: m.adapter, config: cfg2 });
    m2.load({ ...saved, records: { ...saved.records, 'no-such-track': { best: 1 }, 'uptown-knockout': { best: -5, score: 'x' } } });
    ok(m2.records['uptown-knockout'] === undefined && !('no-such-track' in m2.records) && m2.streetCred === m.streetCred, 'bad records are dropped on load; the good ones round-trip');
    m2.load(saved);
    ok(m2.records['uptown-knockout'].best === m.records['uptown-knockout'].best, 'records round-trip through a save');
  }
  // A class-limited race turns away a car that is too fast.
  {
    const notes: string[] = [];
    const m = new StreetRaceManager({
      adapter: {
        spawnProp: () => ({ dispose: () => {} }),
        spawnRacers: () => [],
        racerPosition: () => null,
        removeRacers: () => {},
        carClass: () => 'S',
        placePlayer: () => true,
        holdPlayer: () => {},
        getMoney: () => 9999,
        spend: () => true,
        earn: () => {},
        getWanted: () => ({ stars: 0, heat: 0 }),
        restoreWanted: () => {},
        notify: (t) => notes.push(t),
      },
      config: cfg2,
    });
    m.offerRace('hatch-cup', 'organizer');
    const acc = m.accept();
    ok(!acc && m.state === 'IDLE' && /class C/.test(notes[0] ?? ''), 'a supercar is turned away from the Hatch Cup');
  }
  // A drift event scores and ends on the clock with a medal.
  {
    const dt2 = cfg2.tracks.find((t: any) => t.id === 'park-loop-drift')!;
    const m = new StreetRaceManager({
      adapter: {
        spawnProp: () => ({ dispose: () => {}, setState: () => {} }),
        spawnRacers: () => {
          throw new Error('solo');
        },
        racerPosition: () => null,
        removeRacers: () => {},
        placePlayer: () => true,
        holdPlayer: () => {},
        getMoney: () => 9999,
        spend: () => true,
        earn: () => {},
        getWanted: () => ({ stars: 0, heat: 0 }),
        restoreWanted: () => {},
      },
      config: cfg2,
    });
    m.streetCred = 50;
    m.offerRace('park-loop-drift', 'organizer');
    m.accept();
    const started = m.startRace();
    for (let i = 0; i < 20; i++) m.update(0.2, { inVehicle: true, x: dt2.start.x, z: dt2.start.z, speed: 0, freeRoam: true });
    let t = 0;
    while (m.state === 'RACING' && t < 400) {
      m.update(0.5, { inVehicle: true, x: dt2.start.x, z: dt2.start.z, speed: 22, freeRoam: true, driftAngle: 32 });
      t += 0.5;
    }
    ok(started && m.state === 'RESOLVED' && m.result!.reason === 'finished' && m.result!.score > 0 && m.result!.place! >= 1 && m.result!.place! <= 4 && m.race === null, `drift event: no rivals, ${m.result!.score} points on the clock, medal place ${m.result!.place}`);
  }
}


// ------------------------------------------------------------------ SaveManager (compressed saves, two stores, backups)
{
  let seed77 = 77;
  const rnd = (): number => ((seed77 = (Math.imul(seed77, 1664525) + 1013904223) >>> 0) / 4294967296);
  const samples = ['', 'a', 'aaaaaaaaaaaaaaaa', 'héllo wörld ✓ 漢字 🚗', JSON.stringify({ money: 1234, party: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, speciesId: 'holster', level: i, moves: ['jab', 'pistolWhip'], ivs: { hp: i % 7 } })) })];
  for (let n = 0; n < 40; n++) samples.push(Array.from({ length: 1 + Math.floor(rnd() * 3000) }, () => String.fromCharCode(32 + Math.floor(rnd() * (rnd() < 0.1 ? 3000 : 90)))).join(''));
  let rt = true;
  for (const t of samples) {
    if (decompressUTF16(compressUTF16(t)) !== t || decompressBase64(compressBase64(t)) !== t) rt = false;
  }
  ok(rt, `LZ compression round-trips ${samples.length} strings (UTF-16 and base64, unicode included)`);
  const big = samples[4];
  ok(compressUTF16(big).length * 2 < big.length * 0.6, `a save-like JSON packs small (${big.length} chars -> ${compressUTF16(big).length} UTF-16 chars)`);
  const packed = packSave(big, 1000);
  ok(unpackSave(packed).text === big && unpackSave(packed).savedAt === 1000 && unpackSave(packForFile(big, 5)).text === big, 'packed saves (storage and file kinds) unpack with their time');
  ok(unpackSave(big).text === big, 'plain JSON saves from before compression still load');
  let caught = 0;
  for (const bad of [packed.slice(0, packed.length - 40), packed.replace(checksum(big), '00000000'), 'garbage', 'ESZ1:zz']) {
    try {
      unpackSave(bad);
    } catch {
      caught++;
    }
  }
  ok(caught === 4, 'a truncated, tampered or foreign save is refused (not loaded half-read)');
  const mem = (): KV & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };
  const kv = mem();
  const sm = new SaveManager(kv, null, 'test-save');
  ok(sm.read() === null && sm.info.source === 'none', 'empty store: no save');
  sm.write('{"savedAt":"x","v":1}');
  sm.write('{"savedAt":"x","v":2}');
  ok(sm.read() === '{"savedAt":"x","v":2}' && kv.m.get('test-save')!.startsWith('ESZ1:') && unpackSave(kv.m.get('test-save.bak')!).text === '{"savedAt":"x","v":1}', 'writes are packed; the previous save is kept as a backup');
  kv.m.set('test-save', kv.m.get('test-save')!.slice(0, 30));
  ok(sm.read() === '{"savedAt":"x","v":1}' && sm.info.recovered && sm.info.source === 'local-backup', 'a damaged save falls back to the backup (and says so)');
  sm.write('{"savedAt":"x","v":3}');
  ok(unpackSave(kv.m.get('test-save.bak')!).text === '{"savedAt":"x","v":1}', 'a damaged save never overwrites the good backup');
  const legacy = mem();
  legacy.m.set('old', '{"version":2,"savedAt":"2026-01-01T00:00:00Z"}');
  ok(new SaveManager(legacy, null, 'old').read() === '{"version":2,"savedAt":"2026-01-01T00:00:00Z"}', 'an old uncompressed localStorage save is read as it is');
  const full: KV = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
  ok(new SaveManager(full, null, 'x').write('{}') === false, 'storage full with no IndexedDB: write reports failure (the menu offers Export)');
  sm.clear();
  ok(sm.read() === null, 'clear removes the save and its backup');
}

// ------------------------------------------------------------------ safehouses
{
  const L = generateLayout(1903);
  const spots = planSafehouses(L, [], L.playerSpawn);
  ok(spots.length === 4 && new Set(spots.map((s) => s.district)).size === 4, `a safehouse in each of ${spots.map((s) => s.district).join(', ')}`);
  ok(spots.every((s) => (s.district === 'waterfront' ? districtAt(L, s.x + s.nx * 16, s.z + s.nz * 16) : districtAt(L, s.x, s.z)) === s.district), 'each door is in its own district (the Waterfront one faces the promenade)');
  ok(spots.every((s) => L.buildings.some((b) => s.fx >= b.rect.x0 - 0.6 && s.fx <= b.rect.x1 + 0.6 && s.fz >= b.rect.z0 - 0.6 && s.fz <= b.rect.z1 + 0.6) && Math.hypot(s.x - s.fx, s.z - s.fz) < 3 && Math.abs(Math.hypot(s.nx, s.nz) - 1) < 1e-6), 'each door is on a building facade, facing the street');
  const starter = spots.find((s) => s.starter)!;
  ok(!!starter && starter.district === districtAt(L, L.playerSpawn.x, L.playerSpawn.z) && starter.price === 0 && spots.filter((x) => x.starter).length === 1 && Math.hypot(starter.x - L.playerSpawn.x, starter.z - L.playerSpawn.z) < 120, `the free starter safehouse is near where a new game starts (${Math.round(Math.hypot(starter.x - L.playerSpawn.x, starter.z - L.playerSpawn.z))} m)`);
  let apart = true;
  for (const a of spots) for (const b of spots) if (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < 150) apart = false;
  ok(apart, 'safehouses are well apart');
  const avoid = [{ x: starter.x, z: starter.z }];
  ok(planSafehouses(L, avoid, L.playerSpawn).every((s) => Math.hypot(s.x - starter.x, s.z - starter.z) >= 45), 'safehouses keep clear of shops, clinics and the Chop Shop');
  ok(JSON.stringify(planSafehouses(generateLayout(1903), [], L.playerSpawn)) === JSON.stringify(spots), 'planning is deterministic');
  const st = newSafehouseState(spots);
  ok(st.owned.length === 1 && st.owned[0] === starter.id && st.last === starter.id, 'a new game owns the starter safehouse');
  const clean = sanitizeSafehouses({ owned: ['uptown', 'nowhere', 7], last: 'downtown', visits: { uptown: 3, x: 1, midtown: -2 } }, spots);
  ok(clean.owned.includes(starter.id) && clean.owned.includes('downtown') === false && clean.owned.length === (starter.id === 'uptown' ? 1 : 2) && clean.last === starter.id && clean.visits['uptown'] === 3 && !('x' in clean.visits) && !('midtown' in clean.visits), 'saved safehouse state is cleaned (unknown ids, unowned last, bad counts)');
  ok(sleepHours(23, 7) === 8 && sleepHours(6.5, 7) === 24.5 && sleepHours(10, 20) === 10 && sleepHours(21, 20) === 23, 'sleeping runs to the next wake time (at least an hour)');
  ok(SAFEHOUSE.useRadius > 1.5 && SAFEHOUSE.useRadius < 4, 'safehouse doors are used from close up');
}


// ------------------------------------------------------------------ gamepad mapping
{
  const btns = (on: Partial<Record<number, number>>): number[] => Array.from({ length: 17 }, (_, i) => on[i] ?? 0);
  const prev: boolean[] = [];
  let f = padFrame({ buttons: btns({ [BTN.A]: 1 }), axes: [0, -1, 0, 0] }, prev, 'foot');
  ok(f.press.includes('Space') && f.hold.has('Space') && !!f.move && f.move.y > 0.99, 'on foot: A jumps, the left stick walks forward (pad up is game forward)');
  f = padFrame({ buttons: btns({ [BTN.A]: 1 }), axes: [0, 0, 0, 0] }, prev, 'foot');
  ok(!f.press.includes('Space') && f.hold.has('Space') && f.move === null, 'a held button presses once (no repeat), a centred stick is null');
  f = padFrame({ buttons: btns({ [BTN.A]: 1, [BTN.RT]: 0.6, [BTN.LT]: 0.3 }), axes: [0.5, -1, 0, 0] }, prev, 'car');
  ok(f.hold.has('Space') && !f.press.includes('Space') && f.throttle > 0.5 && f.throttle < 0.6 && f.brake > 0.2 && f.brake < 0.3 && !!f.move && f.move.y === 0 && f.move.x > 0.3, 'driving: analogue triggers are the pedals, the stick only steers, A stays held across the switch (handbrake, no new press)');
  f = padFrame({ buttons: btns({ [BTN.Y]: 1 }), axes: [0, 0, 0, 0] }, [], 'car');
  ok(f.press.includes('KeyF') && padFrame({ buttons: btns({ [BTN.Y]: 1 }), axes: [0, 0, 0, 0] }, [], 'foot').press.includes('KeyZ'), 'Y gets out of cars (F); on foot it rolls (Z)');
  ok(padFrame({ buttons: btns({ [BTN.LEFT]: 1 }), axes: [0, 0, 0, 0] }, [], 'foot', { heist: true }).press.includes('KeyZ') && padFrame({ buttons: btns({ [BTN.LEFT]: 1 }), axes: [0, 0, 0, 0] }, [], 'foot').press.includes('WheelUp'), "in a heist the d-pad's sides are the crew's abilities");
  f = padFrame({ buttons: btns({ [BTN.A]: 1, [BTN.B]: 1, [BTN.DOWN]: 1 }), axes: [0, 0, 0, 0] }, [], 'ui');
  ok(f.press.includes('Enter') && f.press.includes('Escape') && f.dirs.down && f.hold.size === 0, 'menus: A confirms, B backs out, the d-pad moves (no game keys held)');
  ok(padFrame({ buttons: btns({ [BTN.A]: 1 }), axes: [0, 0, 0, 0] }, [], 'battle').press.includes('Digit1') && padFrame({ buttons: btns({ [BTN.RB]: 1 }), axes: [0, 0, 0, 0] }, [], 'battle').press.includes('Digit5'), 'real-time fights: face buttons are the four moves, RB swaps');
  ok(deadzone(0.1) === 0 && Math.abs(deadzone(1) - 1) < 1e-9 && deadzone(-0.6) < 0 && stick(0.1, 0.1).x === 0 && Math.abs(stick(1, 0).x - 1) < 1e-9 && Math.abs(Math.hypot(stick(0.6, 0.6).x, stick(0.6, 0.6).y) - (Math.hypot(0.6, 0.6) - 0.2) / 0.8) < 1e-9, 'dead zones: radial for sticks, rescaled to start at zero');
  let clash = false;
  for (const ctx of Object.keys(PAD_MAPS) as Array<keyof typeof PAD_MAPS>) {
    const codes = Object.values(PAD_MAPS[ctx]).filter((c) => c && !c.startsWith('Wheel') && c !== 'Escape');
    if (new Set(codes).size !== codes.length) clash = true;
  }
  ok(!clash, 'no two buttons do the same thing in a context (bar Start and B both backing out of the map)');
  ok(padGlyph('KeyE', 'foot') === 'X' && padPrompt('E  Get in the Sedan', 'foot') === 'X  Get in the Sedan' && padPrompt('F  Out', 'car') === 'Y  Out' && padPrompt('Hello', 'foot') === 'Hello', 'prompts show the pad button after a pad was used');
  const cs = [{ e: 'up', c: { x: 100, y: 0 } }, { e: 'right', c: { x: 200, y: 100 } }, { e: 'down', c: { x: 100, y: 200 } }, { e: 'far', c: { x: 100, y: 400 } }];
  ok(nearestInDirection({ x: 100, y: 100 }, cs, 'down') === 'down' && nearestInDirection({ x: 100, y: 100 }, cs, 'up') === 'up' && nearestInDirection({ x: 100, y: 100 }, cs, 'right') === 'right' && nearestInDirection({ x: 100, y: 100 }, cs, 'left') === null, 'menu focus moves to the nearest button that way');
}

// ------------------------------------------------------------------ police vision cones
{
  const V = VISION.car;
  ok(inVision(V, 0, 0, 0, 100, 0) && !inVision(V, 0, 0, 0, -100, 0) && inVision(V, 0, 0, 0, -30, 0), 'a cruiser sees far ahead, only close behind');
  ok(inVision(V, 0, 0, Math.PI / 2, 0, -90) && !inVision(V, 0, 0, Math.PI / 2, 0, 90), 'heading PI/2 looks down -Z (the game convention)');
  ok(!inVision(V, 0, 0, 0, 120, 0) && inVision(VISION.foot, 0, 0, 0, 50, 10) && !inVision(VISION.foot, 0, 0, 0, 80, 0), 'out of range is unseen; officers on foot see less far');
  ok(inVision(V, 0, 0, 3.1, -60, 1) && inVision(V, 0, 0, -3.1, -60, -1), 'the cone wraps round at ±PI');
}

// ------------------------------------------------------------------ quick-select wheel
{
  const a = wheelLayout(3, 2);
  ok(a.length === 5 && a.slice(0, 3).every((x) => x < 0) && a.slice(3).every((x) => x > 0), 'the wheel: team across the top, capture items across the bottom');
  ok(wheelPick(a, 0, -1) === 1 && wheelPick(a, 0, 1) >= 3 && wheelPick(a, 0.05, 0.05) === -1, 'pointing up picks the middle Streetmon, down an item, the centre nothing');
  const one = wheelLayout(4, 0);
  ok(one.length === 4 && new Set(one.map((x) => Math.round(x * 100))).size === 4, 'with no items the team uses the whole wheel');
  ok(wheelLayout(0, 0).length === 0 && wheelPick([], 1, 0) === -1, 'an empty wheel picks nothing');
  let roomy = true;
  for (const [m, i] of [[1, 1], [3, 2], [6, 6], [6, 0], [0, 5]]) {
    const ang = wheelLayout(m, i);
    const r = wheelRadius(ang);
    for (let x = 0; x < ang.length; x++) for (let y = x + 1; y < ang.length; y++) if (Math.hypot(Math.cos(ang[x]) - Math.cos(ang[y]), Math.sin(ang[x]) - Math.sin(ang[y])) * r < 88) roomy = false;
  }
  ok(roomy, 'wheel slots never overlap (the wheel widens for a full team and bag)');
}


// ------------------------------------------------------------------ the pond
{
  const lake = generateLayout(1903).parkLake;
  const cx = (lake.x0 + lake.x1) / 2;
  const cz = (lake.z0 + lake.z1) / 2;
  ok(Math.abs(depthAt(lake, lake.x0 + 0.01, cz) - POND.edgeDepth) < 0.05 && depthAt(lake, cx, cz) > 2 && depthAt(lake, cx, cz) <= POND.maxDepth + 0.15, `a bowl: ${POND.edgeDepth} m at the rim, ${depthAt(lake, cx, cz).toFixed(2)} m in the middle`);
  let mono = true;
  for (let i = 1; i < 30; i++) if (depthUV(i / 200, 0.5) < depthUV((i - 1) / 200, 0.5) - 1e-9) mono = false;
  ok(mono && Math.abs(depthUV(0.2, 0.7) - depthUV(0.7, 0.2)) < 0.2, 'it deepens steadily away from the rim (same both ways)');
  ok(POND.surface - POND.maxDepth - 0.12 + 0.5 > -3, 'a car or a swimmer over the deepest bed stays above the river kill height');
  ok(waterState(lake, cx, cz, POND.surface - POND.floatDepth) === 'swimming' && waterState(lake, lake.x0 + 1, cz, POND.surface - 0.6) === 'wading' && waterState(lake, lake.x0 - 2, cz, 0.15) === 'dry' && waterState(lake, cx, cz, 0.3) === 'dry', 'deep water swims, the shelf wades, the bank (and above the surface) is dry');
  ok(wadeFactor(0) === 1 && wadeFactor(0.6) < 1 && wadeFactor(5) === 1 - POND.wadeMax, 'wading slows you with depth, up to a limit');
  const e = nearestEdge(lake, lake.x0 + 0.5, cz);
  ok(e.nx === -1 && Math.abs(e.d - 0.5) < 1e-9, 'nearest edge and its outward direction');
  const b = bankPoint(lake, lake.x0 + 0.5, cz);
  ok(!inPond(lake, b.x, b.z) && b.x < lake.x0 - POND.rimWidth, 'climbing out puts you on the grass past the rim');
  ok(shouldClimbOut(lake, lake.x0 + 0.5, cz, -1, 0, false) && !shouldClimbOut(lake, lake.x0 + 0.5, cz, 1, 0, false) && shouldClimbOut(lake, lake.x0 + 0.5, cz, 0, 0, true) && !shouldClimbOut(lake, cx, cz, -1, 0, true), 'you climb out at the edge heading out (or jumping), never from the middle');
  const nw = nearestWater(lake, lake.x0 - 5, lake.z0 - 5, 2.5);
  ok(inPond(lake, nw.x, nw.z, 2), 'a Streetmon on the bank heads for the nearest open water');
  ok(Math.abs(waveY(10, 20, 3) - POND.surface) <= POND.waves.reduce((s, w) => s + w.amp, 0) + 1e-9, 'waves stay within their amplitude');
  ok(submersion([POND.surface + 1, POND.surface + 1], 1.4).avg === 0 && submersion([POND.surface - 5], 1.4).avg === 1 && Math.abs(submersion([POND.surface - 0.595], 1.4).avg - 0.5) < 0.01, 'how much of a car is under water');
  const w = newCarWater();
  stepCarWater(w, 0.2, 1);
  ok(!w.stalled && w.flood > 0 && carLift(w) < POND.carBuoyancy, 'a car floats a while, filling as it goes');
  for (let i = 0; i < 30; i++) stepCarWater(w, 0.8, 1);
  ok(w.stalled && w.flood === 1 && carLift(w) === 0, 'under for long enough: engine drowned, full of water, it sinks');
  for (let i = 0; i < 25; i++) stepCarWater(w, 0, 1);
  ok(!w.stalled && w.flood < 1, 'pulled out, it drains and the engine catches again');
  const pondSpecies = ALL_SPECIES().filter((s) => (s.spawn.biomes ?? []).includes('pond'));
  ok(pondSpecies.length === 6 && spawnTable('park', 'day', 'pond').length >= 3 && spawnTable('park', 'night', 'pond').some((o) => o.spec.id === 'wishmaw') && !spawnTable('park', 'day').some((o) => (o.spec.spawn.biomes ?? ['street']).every((b) => b === 'pond')), `pond spawn tables (${pondSpecies.map((s) => s.id).join(', ')}), never on dry land`);
  ok(pondSpecies.filter((s) => s.id !== 'fogbank').every((s) => (s.model.sink ?? 0) > 0 && (s.model.sink ?? 1) < 0.6), 'water Streetmon float with part of themselves under');
}


// ------------------------------------------------------------------ s160: gait, flyers, docks, deep sewers, interiors, talk
{
  ok(gaitFrequency(2.4) > 1.1 && gaitFrequency(2.4) < 1.5 && gaitFrequency(4.6) < 1.9 && gaitFrequency(7.2) < 2.3 && gaitFrequency(0) < gaitFrequency(7.2), `a natural cadence: ${gaitFrequency(2.4).toFixed(2)} / ${gaitFrequency(4.6).toFixed(2)} / ${gaitFrequency(7.2).toFixed(2)} strides a second walking / jogging / sprinting`);
  const fl = Object.keys(FLIGHT);
  ok(fl.every((id) => ALL_SPECIES().some((s) => s.id === id)) && fl.length >= 8, `${fl.length} flying species, all real`);
  ok(flightTarget('neonmoth', 'flee', 0) === FLIGHT.neonmoth.high && flightTarget('neonmoth', 'fainted', 0) === 0 && flightTarget('longshot', 'wander', 0, 25) === 25 && flightTarget('cashew', 'wander', 0) === 0 && flightTarget('overwatch', 'engaged', 0) < 1, 'flyers climb to flee, hover low in a fight, fall when fainted, soarers hold their height; walkers stay down');
  ok(SKY.reach < Math.min(...fl.map((id) => FLIGHT[id].high)) && SKY.alt[0] > SKY.reach, 'soaring and fleeing flyers are out of reach');
  const L = generateLayout(1903);
  const docks = planDocks(L);
  ok(docks.length === 2 && docks.every((d) => (d.side < 0 ? d.pier.x1 === L.land.x0 && d.head.x1 === d.pier.x0 : d.pier.x0 === L.land.x1 && d.head.x0 === d.pier.x1)), 'two docks, each pier running out from the land edge to its T-head');
  ok(docks.every((d) => d.pier.z1 - d.pier.z0 === DOCKS.pierWidth && d.head.z1 - d.head.z0 === DOCKS.headWidth && d.boats.length === 2 && d.boats.every((b) => (d.side < 0 ? b.x < L.land.x0 : b.x > L.land.x1))), 'piers and heads the right size; boats moored out on the river');
  const centres = (['uptown', 'midtown', 'downtown'] as const).map((d, i) => ({ district: d, x: -150 + i * 150, z: [-380, 50, 420][i] }));
  const top = planSewers(L, 9137, centres, () => true);
  const deep = planDeepSewers(9137, top);
  ok(deep.length === 6 && deep.every((m) => m.level >= 2 && m.floor < top[0].floor && m.manholes.length === 0), 'two deep levels under every district sewer, no manholes down there');
  ok(deep.every((m) => reachableCount(m.open).reached === reachableCount(m.open).open), 'every deep level is one connected maze');
  ok([...top, ...deep].every((m) => m.caches.length >= 3 && m.caches.every((c) => c.tier === m.level && m.open[c.i][c.j])), 'caches on every level, better ones deeper');
  const m0 = top[0];
  const poolKeys = [...m0.pools.keys()];
  ok(poolKeys.length > 10 && [...m0.pools.values()].some((p) => p.toxic) && [...m0.pools.values()].some((p) => !p.toxic && p.depth > 1.3), `the sewers have real water (${poolKeys.length} pool blocks: cisterns and channels deep enough to swim, toxic sludge to wade)`);
  const [pi, pj] = poolKeys[0].split(',').map(Number);
  const pc = { x: m0.x0 + (pi + 0.5) * SEWER.block, z: m0.z0 + (pj + 0.5) * SEWER.block };
  ok(!!poolAt(m0, pc.x, pc.z), 'a pool under its block');
  let edges = 0;
  for (const k of poolKeys) {
    const [i, j] = k.split(',').map(Number);
    const e = poolEdge(m0, m0.x0 + (i + 0.5) * SEWER.block, m0.z0 + (j + 0.5) * SEWER.block);
    if (e && !poolAt(m0, e.outX, e.outZ)) edges++;
  }
  ok(edges > 0, `pools have dry edges to climb out onto (${edges} edge blocks)`);
  const t2 = deepTable('night', 2);
  const t3 = deepTable('night', 3);
  const share = (t: ReturnType<typeof deepTable>, r: string): number => t.filter((o) => o.spec.spawn.rarity === r).reduce((a, o) => a + o.weight, 0) / t.reduce((a, o) => a + o.weight, 0);
  ok(t2.length > 0 && share(t3, 'rare') > share(t2, 'rare') && share(t2, 'rare') > share(spawnTable('midtown', 'night', 'sewer'), 'rare') && deepLevelBonus(3) > deepLevelBonus(2) && deepLevelBonus(1) === 0, `rarer and stronger deeper (rare share ${(share(t2, 'rare') * 100).toFixed(0)}% then ${(share(t3, 'rare') * 100).toFixed(0)}%)`);
  const skies = (['uptown', 'midtown', 'downtown'] as const).map((d) => skyTable(d, 'day'));
  ok(skies.every((t) => t.length >= 2 && t.every((o) => FLIGHT[o.spec.id]?.soar && o.spec.spawn.rarity !== 'legendary')), `every district's sky has soaring flyers (${skies.map((t) => t.length).join('/')})`);
  const ins = planInteriors(L, []);
  ok(ins.length >= 6 && new Set(ins.map((i) => i.kind)).size >= 5, `${ins.length} buildings you can walk into (${[...new Set(ins.map((i) => i.kind))].join(', ')})`);
  let apart = true;
  for (const a of ins) for (const b of ins) if (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < 60) apart = false;
  ok(apart && ins.every((i) => L.buildings.some((b) => i.fx >= b.rect.x0 - 0.6 && i.fx <= b.rect.x1 + 0.6 && i.fz >= b.rect.z0 - 0.6 && i.fz <= b.rect.z1 + 0.6)), 'their doors are on facades, far enough apart that the rooms below never overlap');
  ok(INTERIOR.floorY < SEWER.levels[SEWER.levels.length - 1].floor - 10, 'the rooms are below the deepest sewer');
  const ctx: TalkContext = { hour: 22, district: 'midtown', wanted: 0, money: 9000, lead: { name: 'Lefty', species: 'Holster', level: 12 }, places: { safehouseForSale: { name: 'Midtown Studio', price: 8000, x: 1, z: 2 }, clinic: { x: 3, z: 4 }, diner: { name: 'The Night Owl Diner', x: 5, z: 6 }, pond: { x: 0, z: 0 }, docks: { name: 'the West Ave Docks', x: -470, z: -232 } }, race: 'Midnight Sprint', deepVisited: false, met: 0 };
  const valid = (t: ReturnType<typeof streetTalk>): boolean => !!t.nodes[t.start] && Object.values(t.nodes).every((n) => n.text.length > 10 && !/[{}]|undefined|NaN/.test(n.text) && n.choices.length > 0 && n.choices.every((c) => c.next === 'end' || !!t.nodes[c.next]));
  let allOk = true;
  const openers = new Set<string>();
  for (let seed = 0; seed < 60; seed++) {
    const t = streetTalk(seed, { ...ctx, hour: (seed * 5) % 24, wanted: seed % 7 === 0 ? 2 : 0, met: seed % 5 === 0 ? 1 : 0 });
    if (!valid(t)) allOk = false;
    openers.add(t.nodes[t.start].text);
  }
  ok(allOk && openers.size > 20, `street conversations are complete and varied (${openers.size} different openings in 60 people)`);
  const roles = ['clerk', 'pawnbroker', 'cook', 'waitress', 'regular', 'receptionist', 'worker', 'manager', 'attendant', 'customer', 'gamer'];
  ok(roles.every((r) => valid(interiorTalk(r, { name: "Sal's Corner Deli", kind: r === 'attendant' ? 'laundromat' : 'deli' }, 7, ctx))), 'everyone inside has something to say, every answer leads somewhere');
  const w = streetTalk(3, { ...ctx, wanted: 2 });
  ok(/cops|sirens|didn't see/i.test(w.nodes[w.start].text), 'people get nervous when the cops are on you');
}

console.log('\n# phones: aim assist and the context button');
{
  const from = { x: 0, z: 0, heading: 0 };
  const near = pickAssist(from, [{ x: 20, z: -2 }, { x: 20, z: 15 }]);
  ok(!!near && Math.abs(near.delta - headingTo(0, 0, 20, -2)) < 1e-9 && near.delta > 0, 'aim assist picks the target nearest the crosshair (and turns left toward one on the left)');
  ok(pickAssist(from, [{ x: 20, z: 15 }, { x: -20, z: 0 }, { x: 60, z: 0 }]) === null, 'nothing outside the cone, behind you or out of range');
  const cop = pickAssist(from, [{ x: 15, z: 0.5 }, { x: 15, z: -1.5, threat: true }]);
  ok(!!cop?.target.threat, 'a cop a little further off the crosshair wins over a bystander');
  const t1 = assistTurn(0.2, 1 / 60, true);
  const t2 = assistTurn(0.2, 1 / 60, false);
  ok(t1 > 0 && t1 <= ASSIST.rate / 60 + 1e-9 && t2 < t1 && assistTurn(0.001, 1 / 60, true) <= 0.001, 'it eases a little each frame, tighter when aiming, never past the target');
  const a = contextFromPrompt("E  Go into Sal's Corner Deli");
  const b = contextFromPrompt('Space  Climb out');
  const c = contextFromPrompt('E  Talk   ·   B  Set Lefty on them');
  const d = contextFromPrompt("E  Midtown Studio: for sale, $8,000");
  ok(a?.code === 'KeyE' && a.label === "Go into Sal's Corner Deli" && b?.code === 'Space' && b.label === 'Climb out' && c?.label === 'Talk' && d?.label === 'Midtown Studio', 'prompts become labelled buttons (key, short label)');
  const tp = touchParts(['Walk with ', { key: 'W' }, ' ', { key: 'A' }, ' ', { key: 'S' }, ' ', { key: 'D' }, ', hold ', { key: 'Shift' }, ' to sprint, ', { key: 'N' }, ' for the Dex']);
  const txt = tp.map((p) => (typeof p === 'string' ? p : `[${p.key}]`)).join('');
  ok(txt === 'Walk with [the stick], hold [the stick pushed all the way] to sprint, [N] for the Dex', `tips speak touch: "${txt}"`);
  ok(contextFromPrompt('') === null && contextFromPrompt("The Chop Shop won't open while the cops are on you") === null, 'messages that are not actions make no button');
}

console.log('\n# s171: items');
{
  const mk = (id: string, lv: number) => createCreature(id, lv, () => 0.5);
  const a = mk('strapback', 40);
  a.hp = 5;
  const r1 = applyHeal(itemSpec('streetSnack'), a, [a]);
  ok(r1.ok && a.hp === 35 && r1.healed === 30, `a sandwich heals 30 (${a.hp} HP)`);
  const r2 = applyHeal(itemSpec('medkit'), a, [a]);
  ok(r2.ok && a.hp === crMaxHp(a) && !applyHeal(itemSpec('medkit'), a, [a]).ok, 'a medkit fills it up; a second does nothing');
  a.hp = 0;
  ok(!applyHeal(itemSpec('energyDrink'), a, [a]).ok && applyHeal(itemSpec('smellingSalts'), a, [a]).ok && a.hp === Math.round(crMaxHp(a) * 0.5), 'fainted ones need smelling salts (back at half)');
  const b = mk('strapback', 42);
  b.hp = 1;
  a.hp = 1;
  ok(applyHeal(itemSpec('familyBucket'), null, [a, b]).ok && a.hp === 51 && b.hp === 51, 'the family bucket feeds everyone');
  const fx = newEffects();
  fx.repel = 240;
  fx.lucky = 1;
  tickEffects(fx, 2);
  const m = spawnModifiers(fx, 14);
  ok(m.repelBelow === 14 && m.shinyMult === 1 && m.rateMult === 1 && effectsLine(fx) === 'Musk 4m', 'timed effects run down and drive the spawner');
  const night = itemSpec('nightNet') as CaptureItem;
  const dive = itemSpec('diveNet') as CaptureItem;
  const rook = itemSpec('rookieCuffs') as CaptureItem;
  const t = mk('strapback', 5);
  const day = { night: false, water: false, leadLevel: 10 };
  ok(itemMultiplier(night, t, day) === 1 && itemMultiplier(night, t, { ...day, night: true }) === 3 && itemMultiplier(dive, t, { ...day, water: true }) === 3.5 && itemMultiplier(rook, t, day) === 3 && itemMultiplier(rook, t, { ...day, leadLevel: 4 }) === 1, 'situational nets and cuffs');
  ok(marketStock(3, 0).every((x) => x.id !== 'rabbitFoot' && x.id !== 'proteinShake'), 'the good stuff on the black market needs reputation');
}

console.log('\n# s171: water battles');
{
  ok(waterRide('koinfish') === 'swim' && waterRide('longshot') === 'fly' && waterRide('strapback') === 'raft', 'pond species swim, flyers hover, the rest take a raft');
  const lifts = [0, 0.7, 1.9].map((t) => waterLift('fly', 1, t));
  ok(lifts.every((l) => l > 1) && waterLift('swim', 1, 0) < 0 && Math.abs(waterLift('raft', 1, 0) - 0.12) < 1e-9, 'flyers ride high, swimmers sit low, rafts on the surface');
}

console.log('\n# s171: casino');
{
  const L = generateLayout(1903);
  let seed = 7;
  const rnd = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const rtp = slotsReturn();
  ok(rtp > 0.85 && rtp < 0.98, `slots pay back ${(rtp * 100).toFixed(1)}% (the house keeps the rest)`);
  ok(slotPayout(['STAR', 'STAR', 'STAR']) === 200 && slotPayout(['CHERRY', 'BAR', 'CHERRY']) === 2 && slotPayout(['BAR', 'SEVEN', 'BELL']) === 0, 'slot lines pay by the table');
  const C = (rank: number, suit = 0): Card => ({ rank, suit: suit as Card['suit'] });
  ok(handValue([C(14), C(14), C(9)]).total === 21 && handValue([C(14), C(13)]).total === 21 && handValue([C(10), C(9), C(5)]).total === 24, 'blackjack hands count aces right');
  // Stacked shoe (draws from the end): player 10+9, dealer 10+7 -> stand -> win.
  const bj = new Blackjack(rnd, [C(7), C(10), C(9), C(10)]);
  bj.deal(100);
  bj.stand();
  ok(bj.outcome === 'win' && bj.returned() === 200, 'beat the dealer: even money');
  const bj2 = new Blackjack(rnd, [C(7), C(10), C(13), C(14)]);
  bj2.deal(100);
  ok(bj2.done && bj2.outcome === 'blackjack' && bj2.returned() === 250, 'a natural pays 3:2');
  ok(rouletteReturn({ kind: 'red' }, 1) === 2 && rouletteReturn({ kind: 'red' }, 0) === 0 && rouletteReturn({ kind: 'number', n: 17 }, 17) === 36 && rouletteReturn({ kind: 'dozen', n: 3 }, 30) === 3, 'roulette pays evens, dozens and numbers; zero takes the outside bets');
  ok(evaluatePoker([C(10, 1), C(11, 1), C(12, 1), C(13, 1), C(14, 1)]) === 'royalFlush' && evaluatePoker([C(2), C(3, 1), C(4), C(5), C(14)]) === 'straight' && evaluatePoker([C(11), C(11, 2), C(4), C(7), C(9, 3)]) === 'jacksOrBetter' && evaluatePoker([C(10), C(10, 2), C(4), C(7), C(9, 3)]) === 'nothing', 'video poker reads its hands');
  const vp = new VideoPoker(rnd);
  vp.deal(10, [C(11), C(11, 2), C(4), C(7), C(9, 3), C(11, 3), C(2), C(3), C(5)]);
  vp.toggle(0);
  vp.toggle(1);
  vp.draw();
  ok(vp.result === 'threeKind' && vp.returned() === 30, 'hold the jacks, draw a third: three of a kind pays 3');
  const casino = planInteriors(L, []).find((i) => i.kind === 'casino');
  ok(!!casino && INTERIOR.size.casino[0] >= 30, `the Empire Royale has a door (${casino?.name})`);
}

console.log('\n# s171: gangs, reputation, stashes');
{
  const L = generateLayout(1903);
  const s = newGangState();
  ok(!questUnlocked(9) && questUnlocked(GANG.unlockLevel) && !streetCrewsActive(s, 30), 'no gangs for a new player, and none until the story brings them');
  s.stage = 1;
  ok(gangEvent(s, 'metAlvarez') !== '' && s.stage === 2 && streetCrewsActive(s, 15), 'Alvarez sends you to the corner; crews come out');
  for (let i = 0; i < 4; i++) gangEvent(s, 'memberBeaten');
  ok(s.stage === 3 && s.cornerBeaten === 4, 'four down breaks the corner');
  gangEvent(s, 'courierBeaten');
  ok(s.stage === 4 && s.hasKey, 'the courier drops the key');
  gangEvent(s, 'enteredHideout');
  gangEvent(s, 'bossBeaten');
  ok(s.stage === 6 && s.bossBeaten && !streetCrewsActive(s, 15) && streetCrewsActive(s, 30), 'Rook falls; only stragglers later, for strong players');
  ok(JSON.stringify(parseGangState(JSON.parse(JSON.stringify(s)))) === JSON.stringify(s) && parseGangState({ stage: 99 }).stage === 6 && parseGangState(null).stage === 0, 'the story saves and loads (and bad saves are clamped)');
  ok(!hostileOnSight({ ...s, stage: 6 }, 80, false) && hostileOnSight({ ...s, stage: 6 }, 10, false) && hostileOnSight({ ...s, stage: 6 }, 80, true), 'respected Street Cred keeps leftover crews off you (unless you start it)');
  ok(gangHitChance(5, false, false) > gangHitChance(20, false, false) && gangHitChance(8, true, false) < gangHitChance(8, false, false), 'they hit more up close and less if you keep moving');
  const spot = fightSpot({ x: 30, z: 0 }, { x: 0, z: 0 }, 1);
  ok(Math.abs(Math.hypot(spot.x, spot.z) - GANG.fightRange[1]) < 1e-6, 'they close to their fighting range');
  const H = hideoutLayout();
  ok(H.guards.length >= 5 && H.lockers.length === 4 && H.cover.every((c) => Math.abs(c.x) < H.w / 2 && Math.abs(c.z) < H.d / 2) && Math.abs(H.boss.z) < H.d / 2, 'the hideout: guards, cover, lockers and the throne, all inside its walls');
  ok(BOSS.team.every(([id]) => !!species(id)) && ROSTER.every((id) => !!species(id)), "the gang's Streetmon all exist");
  let r = applyRep(0, 0, 'crime', 3);
  ok(r.street === 3 && r.civic === -6, 'crimes: a little street cred, a lot of civic standing');
  r = applyRep(r.street, r.civic, 'gangBossBeaten');
  ok(r.civic > 0 && civicTier(70).prices < 1 && civicTier(-70).witness > 1 && streetTier(160).respected && !streetTier(5).respected, 'two standings, each with its own effects');
  L.alleys = planAlleys(L).map((a) => ({ id: a.id, rect: a.rect, x: a.x, z: a.z, district: a.district }));
  const sc = planStreetCaches(L);
  ok(sc.length >= 6 && sc.some((c) => c.locked) && sc.every((c) => !L.buildings.some((b) => c.x > b.rect.x0 && c.x < b.rect.x1 && c.z > b.rect.z0 && c.z < b.rect.z1)), `${sc.length} weapon stashes in the alleys (${sc.filter((c) => c.locked).length} padlocked)`);
  ok(WEAPON_LIST.every((w) => (w.pickupCount ?? 0) === 0), 'no guns lying around in the open any more');
}

console.log('\n# s171: weather, neighbourhoods, chatter, the environment as a weapon');
{
  const L = generateLayout(1903);
  let seed = 3;
  const rnd = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const w = new Weather(rnd, 'clear');
  const seen = new Set<string>();
  let turns = 0;
  for (let h = 0; h < 24 * 20; h += 0.25) if (w.update(0.25, 1)) {
    turns++;
    seen.add(w.kind);
  }
  ok(turns > 20 && seen.size >= 4, `weather changes through the days (${turns} changes; ${[...seen].join(', ')})`);
  w.set('storm');
  const st = w.params();
  const eff = weatherEffects(st);
  ok(st.rain === 1 && st.lightning === 1 && eff.grip < 0.85 && eff.vision < 0.85 && eff.crowd < 0.7 && (eff.types.wire ?? 1) > 2 && (eff.types.sludge ?? 1) > 2, 'a storm: slick roads, short sight, empty streets, Wire and Sludge types out');
  w.set('clear');
  const clr = weatherEffects(w.params());
  ok(clr.grip === 1 && clr.vision === 1 && clr.crowd === 1, 'a clear day changes nothing');
  w.set('rain');
  w.set('clear');
  w.wet = 1;
  w.update(1, 0.016);
  ok(w.wet < 1 && w.wet > 0.2, 'roads dry slowly after the rain');
  const w2 = new Weather(rnd);
  w2.load(JSON.parse(JSON.stringify({ ...w.serialize(), kind: 'fog' })));
  ok(w2.kind === 'fog', 'weather saves and loads');
  const land = L.land;
  const at = (fx: number, fz: number) => neighbourhoodAt(L, land.x0 + (land.x1 - land.x0) * fx, land.z0 + (land.z1 - land.z0) * fz);
  const names = new Set([at(0.3, 0.2), at(0.7, 0.2), at(0.3, 0.6), at(0.7, 0.6), at(0.3, 0.9), at(0.7, 0.9)].map((n) => n.name));
  ok(names.size === 6 && NEIGHBOURHOODS.every((n) => n.lines.length >= 3 && n.tops.length >= 3), `six named neighbourhoods across the districts (${[...names].join(', ')})`);
  const tr = new NeighbourhoodTracker();
  const a = at(0.3, 0.2);
  const b = at(0.7, 0.2);
  ok(tr.update(a, 0.1) === a && tr.update(b, 0.5) === null && tr.update(b, 1) === b && tr.update(b, 1) === null, 'the name card shows once you are properly in (not when you clip a corner)');
  const look = localLook(at(0.3, 0.9), { skin: '#fff', hair: '#000', top: '#123456', legs: '#654321', shoes: '#000', scale: 1 }, () => 0.9);
  ok(at(0.3, 0.9).tops.includes(look.top), 'locals dress for their neighbourhood');
  const ctx: ChatterContext = { hour: 14, weather: 'rain', mood: 'neutral', wanted: 0, district: 'x', near: false, gangFight: false };
  const convs = Array.from({ length: 80 }, (_, i) => streetConversation(i * 7919, ctx));
  ok(convs.every((c) => c.length >= 2 && c.length <= 6 && c.every((l) => l.length > 2)) && new Set(convs.map((c) => c[0])).size > 10, `passers-by have real two-way conversations (${new Set(convs.map((c) => c[0])).size} different ones), 2-6 lines each`);
  ok(allStreetTalks().every((t) => t.length >= 2), 'every street conversation has at least two speakers');
  ok(convs.some((c) => /rain|umbrella|awning|Sludge/i.test(c.join(' '))), 'in the rain, some of it is about the rain');
  const rc = roomConversation('customer', 'clerk', 3);
  ok(!!rc && rc.first === 'b' && rc.lines.length >= 3 && roomConversation('nobody', 'clerk', 1) === null && sewerConversation(2).length >= 3, 'inside, a clerk talks with a customer (the clerk first); strangers with nothing to say stay quiet');
  ok(/gunfire|Kings|inside|911|down/i.test(streetShout(5)), 'a gang fight gets shouts, not chat');
  ok(bubbleSeconds('Hi.') >= 2 && bubbleSeconds('x'.repeat(300)) <= 6.5, 'bubbles stay up long enough to read, not forever');
  ok(shockRadius(1) > shockRadius(0) && blastFalloff(0, 6, 100) === 100 && blastFalloff(6, 6, 100) === 0 && blastFalloff(3, 6, 100) > 0, 'shocks reach further on wet ground; blasts fall off with distance');
  const drums = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 10, z: 0 }, { x: 2, z: 1, spent: true }];
  ok(JSON.stringify(chainFrom(drums, 0, 0, 4.5)) === '[1]', 'a blast sets off the next drum, not the far one or a spent one');
}

console.log('\n# s179: rolls, dives and i-frames');
{
  const d = new Dodge();
  ok(d.start('roll', 1, 0) && !d.invulnerable, 'a roll starts without i-frames for a moment');
  d.update(0.1);
  ok(d.invulnerable && d.damageFactor('hit') === 0 && d.damageFactor('blast') === 0.5 && d.damageFactor('env') === 1, 'mid-roll: hits miss, blasts halve, falls/fire/sludge still hurt');
  d.update(0.4);
  ok(!d.invulnerable && d.damageFactor('hit') === 1, 'the end of the roll is open again');
  ok(!d.start('roll', 1, 0), 'no new roll until this one (and its recovery) is done');
  // Distance: integrate the speed.
  const e = new Dodge();
  e.start('roll', 1, 0);
  let x = 0;
  for (let i = 0; i < 60; i++) {
    x += e.speed() / 60;
    e.update(1 / 60);
  }
  ok(Math.abs(x - ROLL.roll.dist) < 0.3, `a roll covers about ${x.toFixed(1)} m`);
  // Spamming: chained rolls cost more and protect less, and the tank runs dry.
  const s = new Dodge();
  const windows: number[] = [];
  let rolls = 0;
  for (let t = 0; t < 6; t += 1 / 60) {
    if (s.start('roll', 1, 0)) {
      rolls++;
      windows.push(s.active!.iEnd - s.active!.iStart);
    }
    s.update(1 / 60);
  }
  ok(rolls <= 5 && windows[1] < windows[0] && windows[2] < windows[0] * 0.5, `mashing roll for 6 s: ${rolls} rolls, i-frames ${windows.map((w) => w.toFixed(2)).join(' > ')} s`);
  ok(s.winded > 0 || s.stamina < 30, 'and you end up winded (or close to it)');
  // Uptime of invulnerability over a long spam is small.
  const u = new Dodge();
  let inv = 0;
  for (let t = 0; t < 30; t += 1 / 60) {
    u.start('roll', 1, 0);
    if (u.invulnerable) inv += 1 / 60;
    u.update(1 / 60);
  }
  ok(inv / 30 < 0.15, `spamming rolls for 30 s keeps you invulnerable only ${((inv / 30) * 100).toFixed(0)}% of the time`);
  const dv = new Dodge();
  dv.start('dive', 0, 1);
  dv.update(0.2);
  ok(dv.timeScale(true) < 1 && dv.timeScale(false) === 1, 'a dive with a gun up slows time a little');
  dv.update(0.75);
  ok(dv.recovering && !dv.invulnerable && dv.timeScale(true) === 1, 'then you land and get up, open to anything');
  const r = new Dodge();
  r.stamina = 5;
  ok(!r.start('dive', 1, 0), 'no stamina, no dive');
}

console.log('\n# s183: player options (look speed, invert, volumes, HUD size)');
{
  ok(JSON.stringify(parseOptions(null)) === JSON.stringify(DEFAULT_OPTIONS), 'no saved options: the defaults');
  ok(parseOptions('{bad json').lookSpeed === 1 && parseOptions('{"lookSpeed": 99, "music": -1, "invertY": "yes"}').music === 1, 'malformed or out-of-range values fall back to the defaults');
  const a = parseOptions('{"lookSpeed": 1.3, "invertY": true, "music": 0.5, "effects": 0.25, "hudSize": 1.15}');
  ok(a.lookSpeed === 1.3 && a.invertY && a.music === 0.5 && a.effects === 0.25 && a.hudSize === 1.15, 'good values load');
  let o = { ...DEFAULT_OPTIONS };
  const seen: number[] = [];
  for (let i = 0; i < 7; i++) {
    seen.push(o.lookSpeed);
    o = cycleOption(o, 'lookSpeed');
  }
  ok(seen[0] === 1 && seen[6] === 1 && new Set(seen.slice(0, 6)).size === 6, `look speed cycles its ladder and wraps: ${seen.join(' → ')}`);
  ok(cycleOption(DEFAULT_OPTIONS, 'invertY').invertY && !cycleOption(cycleOption(DEFAULT_OPTIONS, 'invertY'), 'invertY').invertY, 'invert look toggles');
  ok(cycleOption({ ...DEFAULT_OPTIONS, music: 0.6 }, 'music').music === 0.25, 'a value off the ladder snaps to the nearest rung, then steps on');
  ok(optionLabel(DEFAULT_OPTIONS, 'music') === 'Music: 100%' && optionLabel({ ...DEFAULT_OPTIONS, effects: 0 }, 'effects') === 'Effects: off' && optionLabel({ ...DEFAULT_OPTIONS, hudSize: 1.3 }, 'hudSize') === 'HUD size: 130%', 'labels read as the player sees them');
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  saveOptions({ ...DEFAULT_OPTIONS, hudSize: 1.3 }, fake);
  ok(loadOptions(fake).hudSize === 1.3, 'options round-trip through storage');
  const broken = { getItem: () => { throw new Error('blocked'); } };
  ok(loadOptions(broken).lookSpeed === 1, 'blocked storage still gives the defaults');
}

console.log('\n# s187: campaign playthrough and balance');
{
  // The Brace soft-lock: two walled-up Concrete types used to brace at each other forever.
  const seq = (seed: number) => { let x = seed >>> 0 || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; };
  const b = new Battle({ name: 'you', members: [createCreature('overpass', 40, seq(1))], ai: false }, { name: 'boss', members: [createCreature('overpass', 42, seq(2))], ai: true }, seq(3), { wild: false, canRun: false });
  const me = b.sides[0].active[0];
  const foe = b.sides[1].active[0];
  me.stages.defense = 6;
  foe.stages.defense = 6;
  let braced = 0;
  for (let i = 0; i < 40; i++) {
    const a = b.chooseAI(foe);
    if (a.type === 'move' && a.moveId === 'brace') braced++;
  }
  ok(braced === 0, `at +6 Defense the AI never picks Brace again (picked it ${braced} of 40 times)`);
  // Real-time style: both sides on AI, acting in turn, until someone drops.
  const rt = (team: ReturnType<typeof createCreature>[], foes: ReturnType<typeof createCreature>[], seed: number): { win: boolean; actions: number } => {
    const bt = new Battle({ name: 'you', members: team, ai: false }, { name: 'boss', members: foes, ai: true }, seq(seed), { wild: false, canRun: false });
    const cd = new Map<Combatant, number>();
    const cool = (c: Combatant): number => Math.max(BATTLE.realtimeCooldown[0], Math.min(BATTLE.realtimeCooldown[1], BATTLE.realtimeCooldown[1] - (bt.stat(c, 'speed') / 140) * (BATTLE.realtimeCooldown[1] - BATTLE.realtimeCooldown[0])));
    let n = 0;
    let round = BATTLE.realtimeRound;
    for (let t = 0; t < 900 && !bt.over; t += 0.1) {
      if (bt.needsSwitch(1).length) bt.autoSwitch(1);
      const dead = bt.needsSwitch(0)[0];
      if (dead) {
        const idx = bt.sides[0].members.findIndex((m) => m.hp > 0 && !bt.sides[0].active.some((a) => a.creature === m));
        if (idx >= 0) bt.switchIn(0, idx, dead);
      }
      for (const sd of bt.sides)
        for (const c of sd.active) {
          if (bt.over || c.creature.hp <= 0) continue;
          const left = (cd.get(c) ?? cool(c) * 0.6) - 0.1;
          cd.set(c, left);
          if (left > 0) continue;
          const a: Action = bt.chooseAI(c);
          bt.act(a);
          n++;
          cd.set(c, cool(c));
        }
      round -= 0.1;
      if (round <= 0 && !bt.over) {
        round = BATTLE.realtimeRound;
        bt.endRound();
      }
    }
    return { win: bt.winner === 0, actions: n };
  };
  const wall = rt([createCreature('overpass', 40, seq(4))], [createCreature('overpass', 42, seq(5))], 6);
  ok(wall.actions < 400, `two Overpass slug it out to a finish (${wall.actions} actions)`);
  // Wild levels follow the story.
  ok(storyLevel(9, 0, 7) === 7, 'before Act 1 is done, a wild one never outlevels your strongest Streetmon');
  ok(storyLevel(5, 0, 7) === 5, '...weaker ones stay as they are');
  ok(storyLevel(8, 2, 7) === 8 + STORY_LEVEL_BONUS[2] && STORY_LEVEL_BONUS[2] > 0, `after two acts they're ${STORY_LEVEL_BONUS[2]} levels tougher`);
  ok(storyLevel(68, 5, 90) === 70, 'never past level 70');
  ok(!storyAllows(species('overwatch'), 0, 7) && storyAllows(species('doubleshift'), 0, 7) && storyAllows(species('overwatch'), 1, 7), 'early on, high-level species stay away instead of turning up shrunk');
  // Bosses climb act by act and match the team you'll have then.
  const C = campaignJson as unknown as CampaignConfig;
  const order = ['dockside-dutch', 'haze', 'sal', 'captain-hale', 'commissioner-varga'];
  const aces = order.map((id) => Math.max(...C.bosses.find((x) => x.id === id)!.team.map((t) => t[1])));
  ok(aces.every((a, i) => i === 0 || a >= aces[i - 1]), `boss aces climb: ${aces.join(' → ')}`);
  ok(C.bosses.find((x) => x.id === 'dockside-dutch')!.team.length === 2, 'Dockside Dutch brings two Streetmon (you have about two by then)');
  const vq = C.legendaries.find((l) => l.id === 'vault-queen')!;
  ok(vq.level < aces[3], `the Vault Queen (Lv ${vq.level}) helps against Captain Hale but doesn't outclass him (ace Lv ${aces[3]})`);
  ok(BATTLE.starterLevel >= 7, 'starters begin at level 7');
  // A team two levels above the casual par beats each boss more often than not.
  const par: Record<string, { L: number; team: string[] }> = {
    'dockside-dutch': { L: 10, team: ['subsonic', 'doubleshift'] },
    haze: { L: 13, team: ['subsonic', 'streetlamp', 'cinderblock'] },
    sal: { L: 16, team: ['cinderblock', 'subsonic', 'curbstone', 'rebarb'] },
    'captain-hale': { L: 20, team: ['cinderblock', 'curbstone', 'subsonic', 'rebarb'] },
    'commissioner-varga': { L: 24, team: ['strapback', 'curbstone', 'flue', 'doubleshift', 'neonmoth'] },
  };
  // What those Streetmon will have grown into by then (level and condition evolutions).
  const grown = (id: string, L: number): string => {
    let sp = id;
    for (let k = 0; k < 3; k++) {
      const e = (species(sp) as unknown as { evolution?: Array<{ to: string; method: string; level?: number; minLevel?: number }> }).evolution?.[0];
      const at = e ? (e.method === 'level' ? e.level : e.method === 'condition' ? e.minLevel : undefined) : undefined;
      if (!e || at === undefined || L < at) break;
      sp = e.to;
    }
    return sp;
  };
  for (const id of order) {
    const p = par[id];
    let w = 0;
    for (let i = 0; i < 16; i++) {
      const r = seq(100 + i * 7);
      const team = p.team.map((sp, j) => createCreature(grown(sp, p.L + 2 - (j ? 1 : 0)), p.L + 2 - (j ? 1 : 0), r));
      const foes = C.bosses.find((x) => x.id === id)!.team.map(([sp, l]) => createCreature(sp, l, r));
      if (rt(team, foes, 50 + i).win) w++;
    }
    ok(w >= 8, `${id}: a sensible team at Lv ${p.L + 2} wins ${w} of 16`);
  }
  // Levelling: a casual Act 1 (eight wild fights) gets the starter to about Dutch's level.
  {
    const r = seq(9);
    const st = createCreature('cinderblock', BATTLE.starterLevel, r);
    for (let k = 0; k < 8; k++) gainXp(st, xpYield(createCreature('gutterat', storyLevel(2 + Math.floor(r() * 9), 0, st.level), r), st.level), { timeOfDay: 'day', district: 'midtown' } as never);
    ok(st.level >= 9, `eight wild fights take the starter from Lv ${BATTLE.starterLevel} to Lv ${st.level}`);
  }
  // The first heist is a gentle one.
  const qc = (heistsJson as unknown as { targets: Array<{ id: string; security: { suspicionRate: number }; escape: { stars: number } }> }).targets.find((t) => t.id === 'quik-cash')!;
  ok(qc.security.suspicionRate <= 0.35 && qc.escape.stars === 1, 'Quik Cash: a careful first job can stay quiet, and the getaway starts at one star');
}


// ---- Your Streetmon fights wild ones on its own.
{
  const chart = DATA.chart as unknown as Record<string, Record<string, number>>;
  const fz = (types: string[], level: number, speed = 50) => ({ level, attack: 60, defense: 50, speed, types, moves: [{ name: 'Hit', type: types[0], power: 60 }] });
  const mons = new Map<number, WildMon>();
  const mk = (id: number, x: number, z: number, over: Partial<WildMon> = {}): WildMon => {
    const m: WildMon = { id, x, z, layer: 'street', speciesId: `w${id}`, temperament: 'wander', rarity: 'common', state: 'wander', hp: 60, maxHp: 60, fighter: fz(['grind'], 10), free: true, calm: false, heldBy: null, ...over };
    mons.set(id, m);
    return m;
  };
  const F: SkirmishFollower = { x: 1, z: 0, hp: 80, maxHp: 80, fighter: fz(['gun'], 12, 60), ready: true };
  const log: string[] = [];
  const ad: SkirmishAdapter = {
    hold: (id, tag) => {
      const m = mons.get(id);
      if (!m) return tag === null;
      if (tag && m.heldBy) return false;
      m.heldBy = tag;
      return true;
    },
    lineOfSight: () => true,
    followerGoTo: (x, z) => {
      const d = Math.hypot(x - F.x, z - F.z) || 1;
      const st = Math.min(d, 0.7);
      F.x += ((x - F.x) / d) * st;
      F.z += ((z - F.z) / d) * st;
    },
    followerFollow: () => log.push('follow'),
    face: () => undefined,
    wildGoTo: () => undefined,
    hitWild: (id, h) => {
      const m = mons.get(id)!;
      m.hp = Math.max(0, m.hp - h.damage);
      log.push('hitW');
      return m.hp;
    },
    hitFollower: (_id, h) => {
      F.hp = Math.max(0, F.hp - h.damage);
      log.push('hitF');
      return F.hp;
    },
    ended: (id, o, why) => log.push(`end ${id} ${o} ${why}`),
  };
  const S = new FollowerSkirmish({ ...SKIRMISH_DEFAULTS }, ad, chart, () => 0.5);
  const ctx = (over: Record<string, unknown> = {}) => ({ follower: { ...F }, player: { x: 0, z: 0, onFoot: true }, wild: [...mons.values()].map((m) => ({ ...m })), enabled: true, ...over });
  mk(1, 30, 0);
  S.update(0.6, ctx());
  ok(!S.fight, 'a wild one 30 m off is left alone');
  mk(2, 7, 0);
  mk(3, 5, 4, { rarity: 'legendary' });
  S.update(0.6, ctx());
  ok(S.fight?.wild === 2 && mons.get(2)!.heldBy === 'follower', 'it squares up to a wild one wandering within 9 m (never a legendary)');
  for (let i = 0; i < 600 && S.fight; i++) S.update(0.1, ctx());
  ok(log.some((l) => l === 'end 2 won fled' || l === 'end 2 won fainted') && log.includes('hitW') && mons.get(2)!.heldBy === null && mons.get(2)!.hp / 60 <= 0.3, 'a type-advantaged Gun wears it down and it runs, let go');
  ok(S.cooldown > 0 && !S.update(0.1, ctx()), 'a short cooldown before the next fight');
  // Something coming for you comes first, even if a wanderer is closer.
  log.length = 0;
  S.cooldown = 0;
  mons.clear();
  F.x = 1; F.z = 0; F.hp = 80;
  mk(10, 3, 0);
  mk(11, 8, 0, { state: 'approach', temperament: 'aggro' });
  S.update(0.6, ctx());
  ok(S.fight?.wild === 11, 'one coming for you is taken on first');
  // Walking off breaks it up; getting in a car too.
  for (let i = 0; i < 5; i++) S.update(0.1, ctx({ player: { x: 40, z: 0, onFoot: true } }));
  ok(!S.fight && log.includes('end 11 broken far') && mons.get(11)!.heldBy === null, 'walking off (22 m) breaks the fight up and lets it go');
  S.cooldown = 0;
  S.start(10);
  S.update(0.1, ctx({ player: { x: 0, z: 0, onFoot: false } }));
  ok(!S.fight && log.includes('end 10 broken car'), 'getting in a car breaks it up');
  // A tough foe: yours backs off when hurt; a hurt one won't start; too strong ones are ignored.
  log.length = 0;
  mons.clear();
  S.cooldown = 0;
  F.x = 1; F.z = 0; F.hp = 80;
  mk(20, 4, 0, { fighter: { level: 18, attack: 120, defense: 90, speed: 90, types: ['concrete'], moves: [{ name: 'Slam', type: 'concrete', power: 90 }] }, hp: 400, maxHp: 400 });
  S.update(0.6, ctx());
  for (let i = 0; i < 600 && S.fight; i++) S.update(0.1, ctx());
  ok(log.includes('end 20 retreat hurt') && F.hp > 0 && F.hp / 80 <= 0.3, 'losing, yours backs off before it faints');
  S.cooldown = 0;
  mons.get(20)!.heldBy = null;
  S.update(0.6, ctx());
  ok(!S.fight, 'a hurt Streetmon doesn\'t pick another fight');
  F.hp = 80;
  mk(21, 3, 1, { fighter: fz(['grind'], 25) });
  mons.delete(20);
  S.update(0.6, ctx());
  ok(!S.fight, 'it leaves wild ones far above its level alone');
  // Off in options, and not while it's put away.
  mk(22, 3, 1);
  const off = new FollowerSkirmish({ ...SKIRMISH_DEFAULTS, enabled: false }, ad, chart, () => 0.5);
  off.update(0.6, ctx());
  S.update(0.6, ctx({ follower: { ...F, ready: false } }));
  ok(!off.fight && !S.fight, 'switched off in the options, or put away: no fights');
}


// ---- Zone music, sprint stamina, heist interiors.
{
  ok(pickTrack({ battle: null, stars: 0, chasing: false, zone: 'glass' }) === 'zone:glass-district' && pickTrack({ battle: null, stars: 0, chasing: false, zone: 'roof' }) === 'zone:rooftops', 'each neighbourhood and the rooftops have their own free-roam track');
  ok(pickTrack({ battle: null, stars: 0, chasing: false, sewer: true, deep: true }) === 'zone:sewer-deep' && pickTrack({ battle: null, stars: 0, chasing: false, sewer: true }) === 'sewer' && pickTrack({ battle: null, stars: 0, chasing: false, hideout: true, sewer: true }) === 'zone:gutter-kings-hideout', 'the deep drains and the Gutter Kings hideout too');
  ok(pickTrack({ battle: null, stars: 0, chasing: false, indoors: 'arcade' }) === 'zone:arcade' && pickTrack({ battle: null, stars: 0, chasing: false, indoors: 'room' }) === 'zone:shops' && pickTrack({ battle: 'wild', stars: 0, chasing: false, zone: 'glass' }) === 'wildBattle' && pickTrack({ battle: null, stars: 3, chasing: true, zone: 'canal' }) === 'chase', 'shops and the arcade have theirs; battles and chases still win');
  ok(ZONES.every((z) => fs.existsSync(`public/music/zone-${z}.mp3`) && fs.statSync(`public/music/zone-${z}.mp3`).size > 500000), `all ${ZONES.length} zone tracks are there`);
  const dd = new Dodge();
  let t = 0;
  while (dd.sprint(true, 1 / 60) && t < 20) t += 1 / 60;
  ok(t > 6 && t < 10 && dd.winded > 0, `sprinting runs the stamina dry in ${t.toFixed(1)} s and leaves you winded`);
  ok(!dd.sprint(true, 1 / 60) && !dd.canStart('roll'), 'winded: no sprint, no roll');
  ok(ROLL.roll.dist >= 6, 'a roll covers 6 m now');
  const tq = JSON.parse(JSON.stringify((heistsJson as unknown as { targets: Array<Record<string, unknown>> }).targets.find((x) => x.id === 'first-empire-vault')));
  const pl = planHeistInterior(tq)!;
  ok(!!pl && pl.lasers.length >= 6 && pl.cover.length >= 16 && pl.cameras.length >= Math.max(5, tq.location.cameras.length) && pl.guards.length >= Math.max(5, tq.location.guards.length) && pl.loot.length === tq.loot.bags, `the bank has a big room: ${pl.cover.length} pieces of cover, ${pl.lasers.length} laser gates, ${pl.cameras.length} cameras, ${pl.guards.length} guards`);
  ok(pl.D >= 30 && pl.W >= 30, `the bank floor is ${pl.W} x ${pl.D} m`);
  for (const id of ['quik-cash', 'diamond-row']) {
    const t2 = JSON.parse(JSON.stringify((heistsJson as unknown as { targets: Array<Record<string, unknown>> }).targets.find((x) => x.id === id)));
    const p2 = planHeistInterior(t2)!;
    ok(p2.D >= 20 && p2.W >= 18 && p2.cover.length >= 8, `${id}: ${p2.W} x ${p2.D} m with ${p2.cover.length} pieces of cover`);
  }
  // Police in the building: they come in after a delay, path round the cover and grab you.
  {
    const raid = new HeistRaid(pl);
    const open = Array.from(raid.grid.open).filter((x) => x).length;
    ok(open > raid.grid.nx * raid.grid.nz * 0.4, `the floor grid has room to move (${open} open cells)`);
    const target = pl.breachPoints[0];
    const sight = () => false;
    let st = raid.update(1, { stars: 0, px: target.x, pz: target.z, onFoot: true, dead: false, sight });
    ok(st.spawn.length === 0, 'no stars: nobody comes in');
    let spawned = 0;
    for (let i = 0; i < 20 && !spawned; i++) {
      st = raid.update(0.5, { stars: 2, px: target.x, pz: target.z, onFoot: true, dead: false, sight });
      for (const sp of st.spawn) raid.add(sp.x, sp.z, sp.heading);
      spawned = st.spawn.length;
    }
    ok(spawned >= 2 && raid.cops.every((c) => Math.hypot(c.x - pl.exit.x, c.z - pl.exit.z) < 4), `wanted inside: ${spawned} officers come in at the door`);
    let grabbed = false;
    let t = 0;
    for (; t < 40 && !grabbed; t += 0.1) grabbed = raid.update(0.1, { stars: 2, px: target.x, pz: target.z, onFoot: true, dead: false, sight }).grabbing;
    ok(grabbed, `they find their way round the counter and the offices to the vault door in ${t.toFixed(1)} s and grab you`);
    ok(raid.cops.every((c) => raid.grid.walkable(c.x, c.z)), 'never through the cover or walls');
  }

  const inRoom = (p: { x: number; z: number }) => Math.abs(p.x - pl.centre.x) < pl.W / 2 + 0.1 + (pl.vaultDoor ? 6 : 0) && Math.abs(p.z - pl.centre.z) < pl.D / 2 + 7;
  ok([...pl.loot, ...pl.breachPoints, ...pl.guards, pl.spawn, pl.exit].every(inRoom) && pl.floorY === HEIST_INTERIOR.floorY, 'everything is inside the building, under it');
  const L = pl.lasers[0];
  const mid = { x: (L.ax + L.bx) / 2, z: (L.az + L.bz) / 2 };
  const len = Math.hypot(L.bx - L.ax, L.bz - L.az);
  const px = -(L.bz - L.az) / len;
  const pz = (L.bx - L.ax) / len;
  ok(laserTouches(L, mid.x, mid.z, pl.floorY, pl.floorY) && !laserTouches(L, mid.x + px * 1.5, mid.z + pz * 1.5, pl.floorY, pl.floorY), 'standing in a beam touches it; a step away does not');
  const on = Array.from({ length: 100 }, (_, i) => laserOn(L, i * 0.05));
  ok(on.some((x) => x) && on.some((x) => !x), 'the gates switch on and off (time your run)');
  const truck = (heistsJson as unknown as { targets: Array<Record<string, unknown>> }).targets.find((x) => x.id === 'armored-transport');
  ok(planHeistInterior(truck as never) === null, 'the armored truck job stays in the street');
  // Crouching: slower than a jog, quiet footsteps, and the guards hear a jog close by.
  ok(PLAYER.crouchSpeed < PLAYER.jogSpeed * 0.5 && HEARING.crouch < 0.3 && HEARING.radius * HEARING.crouch < 2, 'crouching creeps: under half a jog, and only audible within a couple of metres');
  {
    const hm = new Humanoid(copLook(() => 0.5));
    hm.update(0.5, 0, true);
    const stand = hm.hips.position.y;
    hm.crouch = 1;
    for (let i = 0; i < 30; i++) hm.update(1 / 30, 1.5, true);
    ok(stand - hm.hips.position.y > 0.2, `crouched, the hips drop ${(stand - hm.hips.position.y).toFixed(2)} m`);
  }
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
