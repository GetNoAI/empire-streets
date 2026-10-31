// The living world: a runnable integration example (no renderer).
//   npm run living:example        (tsx scripts/living-world-example.ts)
//
// In the game: src/systems/LivingWorld.ts binds both managers to the real crowd and wild
// Streetmon and draws what they do; src/core/Game.ts (setupLivingWorld, onWildBite) wires it in.
// This script runs the two engine-free managers against a small fake street and prints a log.
//
// Ticking the living world in a game loop:
//
//   import { LivingWorld } from './systems/LivingWorld';
//   import livingWorldConfig from './config/living_world.json';
//
//   const living = new LivingWorld({
//     scene, camera, effects, dmgNums, peds, spawns, vehicles, models, layout,
//     makePod: (id) => catcher.makeItem(id),            // capture pod meshes
//     placeName: (x, z) => hud.locationName(x, z),       // "5th Ave & 34th St" for chatter
//     player: () => ({ x, y, z, inCar, layer }),
//     enabled: () => playing && !inBattle && !inRace && !inHeist,
//     now: () => gameTime, time: () => phaseAt(hour),
//     lore: { tracks, racers, crews },                   // for "you see Dee at the Harbor Run?"
//   }, livingWorldConfig);                               // also sets the 80 m AI radius on peds and spawns
//
//   spawns.events.onSpawned      = (w) => living.onSpawned(w);         // packs
//   spawns.events.onAttackPlayer = (w, dmg) => hurtPlayer(dmg);        // aggressive Streetmon bite
//   onExplosion   = (x, z, r) => living.explosion(x, z, r);            // scatter, break up fights
//   startWildBattle = (w) => living.onPlayerBattle(w);                 // you take a creature over
//
//   function gameLoop(dt) {
//     spawns.update(dt, ctx);           // wild Streetmon (full AI within 80 m, light tick beyond)
//     peds.update(dt, focus, camera);   // the crowd (same tiers)
//     living.update(dt);                // hunters, chatter, territory fights, packs, bubbles, bars, FX
//   }

import livingJson from '../src/config/living_world.json';
import typesJson from '../src/data/types.json';
import { NpcLifeManager, type NpcLifeAdapter, type NpcLifeConfig, type Person, type WildView } from '../src/systems/npcLife.js';
import { WildInteractionManager, type WildAdapter, type WildConfig, type WildMon } from '../src/systems/wildInteractions.js';

const cfg = livingJson as unknown as NpcLifeConfig & WildConfig;
const chart = (typesJson as unknown as { chart: Record<string, Record<string, number>> }).chart;
let seed = 11;
const rng = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
let clock = 0;
const log = (s: string): void => console.log(`${clock.toFixed(1).padStart(5)}s  ${s}`);

// A small street: three passers-by and some wild Streetmon.
const fighter = (types: string[], level: number, speed: number) => ({ level, attack: 50 + level, defense: 45 + level, speed, types, moves: [{ name: 'Hit', type: types[0], power: 55 }] });
const people = new Map<number, Person>([
  [1, { id: 1, x: 0, z: 0, layer: 'street', free: true, walking: true, ctrl: null, street: '5th Ave & 34th St', district: 'Midtown' }],
  [2, { id: 2, x: 40, z: 2, layer: 'street', free: true, walking: true, ctrl: null }],
  [3, { id: 3, x: 41.5, z: 3, layer: 'street', free: true, walking: true, ctrl: null }],
]);
const wild = new Map<number, WildMon & { name: string; level: number }>([
  [10, { id: 10, x: 14, z: 0, layer: 'street', name: 'Cinderblock', speciesId: 'cinderblock', level: 8, temperament: 'wander', rarity: 'common', state: 'wander', hp: 32, maxHp: 32, fighter: fighter(['concrete'], 8, 30), free: true, calm: false, heldBy: null }],
  [20, { id: 20, x: -30, z: 20, layer: 'street', name: 'Strapback', speciesId: 'strapback', level: 11, temperament: 'aggro', rarity: 'uncommon', state: 'wander', hp: 38, maxHp: 38, fighter: fighter(['gun'], 11, 60), free: true, calm: false, heldBy: null }],
  [21, { id: 21, x: -24, z: 20, layer: 'street', name: 'Cinderblock', speciesId: 'cinderblock', level: 11, temperament: 'wander', rarity: 'common', state: 'wander', hp: 40, maxHp: 40, fighter: fighter(['concrete'], 11, 30), free: true, calm: false, heldBy: null }],
]);
const name = (id: number): string => wild.get(id)?.name ?? `#${id}`;

const npcAdapter: NpcLifeAdapter = {
  take: (id, tag) => ((people.get(id)!.ctrl = tag), true),
  release: (id, how) => {
    people.get(id)!.ctrl = null;
    log(`person ${id} ${how === 'flee' ? 'runs off' : 'walks on'}`);
  },
  walkTo: (id, x, z, speed, dt) => {
    const p = people.get(id)!;
    const d = Math.hypot(x - p.x, z - p.z);
    const s = Math.min(d, speed * dt);
    p.x += ((x - p.x) / d) * s;
    p.z += ((z - p.z) / d) * s;
    return d - s;
  },
  face: () => undefined,
  sendOut: (id, wid, tag) => {
    wild.get(wid)!.heldBy = tag;
    log(`person ${id} sends out a Hustlepup at the ${name(wid)}`);
    return { name: 'Hustlepup', speciesId: 'hustlepup', level: 10, hp: 34, maxHp: 34, fighter: fighter(['grind'], 10, 55) };
  },
  strike: (e) => {
    const w = wild.get(e.wildId)!;
    if (e.from === 'mon') w.hp = Math.max(0, w.hp - e.hit.damage);
    log(`  ${e.from === 'mon' ? 'Hustlepup' : name(e.wildId)} uses ${e.hit.move}: ${e.hit.damage}${e.hit.mult >= 2 ? ' (super effective)' : ''}  [wild HP ${w.hp}/${w.maxHp}]`);
    return e.from === 'mon' ? w.hp : (e.monHp ?? 0);
  },
  recall: () => undefined,
  throwPod: (id, wid, item) => log(`person ${id} throws a ${item} at the ${name(wid)}`),
  rollCatch: () => (rng() < 0.6 ? { shakes: 3, caught: true } : { shakes: 1, caught: false }),
  shake: (_id, n) => log(`  ...shake ${n}`),
  captured: (id, wid) => {
    log(`person ${id} caught the ${name(wid)}!`);
    wild.delete(wid);
  },
  breakFree: (_id, wid) => log(`  the ${name(wid)} broke free`),
  freeWild: (wid) => {
    const w = wild.get(wid);
    if (w) w.heldBy = null;
  },
  startTalk: (a, b, tag) => ((people.get(a)!.ctrl = tag), (people.get(b)!.ctrl = tag), true),
  endTalk: (a, b) => {
    people.get(a)!.ctrl = null;
    people.get(b)!.ctrl = null;
  },
  say: (id, text) => log(`💬 ${id}: "${text}"`),
  chatVars: () => ({ species: 'Rebarb', level: 12, district: 'Midtown', street: '5th Ave', strong: 'Concrete', weak: 'Gun', track: 'Harbor Run', racer: 'Dee Okafor', crew: 'The Smoke Syndicate', item: 'net' }),
};

const wildAdapter: WildAdapter = {
  hold: (id, tag) => {
    const w = wild.get(id);
    if (!w) return tag === null;
    if (tag && w.heldBy) return false;
    w.heldBy = tag;
    return true;
  },
  goTo: (id, x, z) => {
    const w = wild.get(id)!;
    const d = Math.hypot(x - w.x, z - w.z) || 1;
    const s = Math.min(d, 0.5);
    w.x += ((x - w.x) / d) * s;
    w.z += ((z - w.z) / d) * s;
  },
  face: () => undefined,
  strike: (e) => {
    const d = wild.get(e.defender)!;
    d.hp = Math.max(0, d.hp - e.hit.damage);
    log(`  ${name(e.attacker)} hits ${name(e.defender)} with ${e.hit.move}: ${e.hit.damage}  [${d.hp}/${d.maxHp}]`);
    return d.hp;
  },
  flee: (id) => {
    const w = wild.get(id);
    if (w) {
      w.state = 'flee';
      w.heldBy = null;
      log(`the ${name(id)} runs off`);
    }
  },
  claim: (id) => log(`the ${name(id)} claims the corner`),
  setHome: () => undefined,
  joinChase: () => undefined,
  lineOfSight: () => true,
  spawnFollowers: () => [],
  duelStarted: (d) => log(`territory fight: ${name(d.a)} vs ${name(d.b)}`),
};

const npc = new NpcLifeManager({ config: cfg, adapter: npcAdapter, chart, rng });
const wildAi = new WildInteractionManager({ config: cfg, adapter: wildAdapter, chart, rng });

// Person 1 starts looking; persons 2 and 3 are walking past each other.
npc.startHunt(1);
for (let t = 0; t < 60; t += 0.1) {
  clock = t;
  const snapshot = {
    people: [...people.values()].map((p) => ({ ...p })),
    wild: [...wild.values()].map((w) => ({ ...w, free: !w.heldBy && w.state !== 'flee' })) as Array<WildView & WildMon>,
    player: { x: 10, z: 60 },
    camera: { x: 20, z: 10 },
    activeRadius: 80,
    enabled: true,
  };
  npc.update(0.1, snapshot);
  wildAi.update(0.1, { ...snapshot, cars: [], playerInCar: false });
}
console.log('\nafter a minute:', { npc: npc.stats, fights: wildAi.stats, breaks: wildAi.breaks, remembered: npc.catches });
