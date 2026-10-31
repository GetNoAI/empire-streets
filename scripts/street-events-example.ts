// Street events: a runnable integration example (no renderer).
//   npm run events:example        (tsx scripts/street-events-example.ts)
//
// In the game: src/core/Game.ts (setupStreetEvents, updateStreetEvents, renderEventHud,
// applyChips, eventMarkers). This script runs the same per-frame calls against a fake world.
//
// Registering and ticking the manager in a game loop:
//
//   import { StreetEventManager } from './systems/streetEventManager.js';
//   import { EventWorld } from './systems/EventWorld';
//   import eventsConfig from './config/street_events.json';
//
//   // 1. The 3D side: builds trucks / swarms / crates, runs them each frame, removes them.
//   const world = new EventWorld({ scene, effects, vehicles, graph, peds, spawns, follower, police,
//     groundY, blocked, player, partyLevel, pickSpecies, damagePlayer, earn, listener });
//
//   // 2. The manager: schedule (a random event every 8-12 min), lifecycle, police hooks, rewards.
//   const events = new StreetEventManager({
//     config: eventsConfig,
//     adapter: {
//       spawn: (inst) => world.spawn(inst),               // false = can't right now (retried)
//       tick: (inst, dt) => world.tick(inst, dt),         // -> { phase, pos, objective, engaged, outcome, ... }
//       cleanup: (inst) => world.cleanup(inst),           // props, flares, wreckage, event NPCs
//       raiseWanted: (stars) => raiseWantedTo(stars),     // truck / drop engaged: 2-3 stars
//       earn: (cash) => (money += cash),
//       addItem: (id, n) => bag.add(id, n),               // capture pods, rare items
//       addStreetCred: (n) => (streetCred += n),
//       chipsChanged: (chips) => applyChips(chips),       // upgrade chips -> car mods
//       notify: (text, ms) => hud.toast(text, ms),
//     },
//   });
//   events.load(save.streetEvents);                       // regional cred, chips, timer, stats
//
//   // 3. Every frame of free roam:
//   function gameLoop(dt) {
//     const hud = events.update(dt, {
//       x, z, layer,                                      // the timer only runs on the street / roofs
//       district, streetCred,
//       busy: inHeist || inRace || inBattle || stars >= 3 // no new events while busy
//     });
//     drawEventPanel(hud);                                // objective, distance, time left
//     minimap.add(events.markers());                      // + map_icons.json layer "events"
//   }
//   function onKeyE() { if (world.prompt()) world.interact(); }  // open a supply crate
//   function save() { return { ...data, streetEvents: events.serialize() }; }

import eventsConfig from '../src/config/street_events.json';
import { StreetEventManager, validateEventConfig, type EventInstance, type StreetEventConfig, type TickResult } from '../src/systems/streetEventManager.js';

const cfg = eventsConfig as unknown as StreetEventConfig;
validateEventConfig(cfg);

let seed = 7;
const rng = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// A fake world: each event type plays out on its own little script.
const game = { money: 500, streetCred: 0, stars: 0, items: new Map<string, number>() };
const scripts = new Map<number, (inst: EventInstance, dt: number) => TickResult>();
const scriptFor = (inst: EventInstance): ((inst: EventInstance, dt: number) => TickResult) => {
  let t = 0;
  if (inst.type === 'armoredTruck')
    // The player rams it at 20 s, disables it at 40 s and has the cash by 55 s.
    return (_i, dt) => {
      t += dt;
      return { phase: 'active', engaged: t > 20, progress: Math.min(1, t / 55), objective: t < 40 ? 'Stop the armored truck' : 'Grab the cash', earned: t > 55 ? 4200 : 0, outcome: t > 55 ? 'completed' : null };
    };
  if (inst.type === 'turfOutbreak')
    // Nobody shows up: the police lock the block down.
    return (i) => ({ phase: 'active', objective: 'Clear the outbreak', outcome: i.stateTime > (i.def.lockdownSeconds ?? 180) ? 'failed' : null, reason: 'Police locked the area down' });
  // Supply drop: falls for 9 s, the player opens it at 30 s.
  return (_i, dt) => {
    t += dt;
    return { phase: t < 9 ? 'spawning' : 'active', engaged: t > 20, objective: t < 9 ? 'Supply crate coming down' : 'Open the crate (E)', outcome: t > 30 ? 'completed' : null };
  };
};

const events = new StreetEventManager({
  config: cfg,
  rng,
  adapter: {
    spawn: (inst) => (scripts.set(inst.uid, scriptFor(inst)), true),
    tick: (inst, dt) => scripts.get(inst.uid)!(inst, dt),
    cleanup: (inst) => void scripts.delete(inst.uid),
    raiseWanted: (stars) => void (game.stars = Math.max(game.stars, stars)),
    earn: (cash) => void (game.money += cash),
    addItem: (id, n) => void game.items.set(id, (game.items.get(id) ?? 0) + n),
    addStreetCred: (n) => void (game.streetCred += n),
    chipsChanged: (chips) => console.log(`  upgrade chips: ${chips}`),
    notify: (text) => console.log(`  [toast] ${text}`),
  },
});

events.on('state', ({ inst, from, to }) => console.log(`${clock(events.time)}  ${inst.def.name}: ${from ?? '-'} -> ${to}${inst.reason ? ` (${inst.reason})` : ''}`));
events.on('engaged', (inst) => console.log(`${clock(events.time)}  ${inst.def.name}: engaged -> wanted ${game.stars} stars`));
events.on('resolved', ({ inst, ok, reward }) => {
  if (ok && reward) console.log(`${clock(events.time)}  ${inst.def.name}: reward $${reward.cash} + ${reward.streetCred} cred + ${reward.regionalCred} ${reward.district} cred${reward.items.length ? ` + ${reward.items.map((i) => `${i.count}x ${i.id}`).join(', ')}` : ''}${reward.chips ? ` + ${reward.chips} chip` : ''}`);
  game.stars = 0; // (the fake police give up at once)
});

function clock(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// 45 minutes of free roam at 10 frames a second, wandering round uptown.
const dt = 0.1;
for (let t = 0; t < 45 * 60; t += dt) {
  const a = t / 300;
  events.update(dt, { x: 250 * Math.cos(a), z: -350 + 150 * Math.sin(a), layer: 'street', district: 'uptown', streetCred: game.streetCred, busy: game.stars >= 3 });
}

console.log('\nafter 45 minutes:', { money: game.money, streetCred: game.streetCred, items: Object.fromEntries(game.items), save: events.serialize() });
