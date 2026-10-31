// Street races: a runnable integration example (the game loop hook-up, minus the 3D engine).
//   npm run race:example        (tsx scripts/race-example.js)
//
// StreetRaceManager has no engine dependencies. You give it an adapter (spawn props and racers,
// money, the wanted level, respawning) and call update(dt, ctx) once per frame. In the game the
// adapter lives in src/core/Game.ts (setupRaces) and the 3D side is src/systems/RaceWorld.ts.
//
// Minimal hook-up in an app.js / gameLoop.js:
//
//   import { StreetRaceManager } from './systems/streetRaceManager.js';
//   import racesConfig from './config/races.json';
//
//   const races = new StreetRaceManager({ config: racesConfig, adapter });
//   function gameLoop(dt) {
//     physics.step(dt);
//     const hud = races.update(dt, { inVehicle, x, z, speed, freeRoam, dead });
//     raceHud.render(hud);                         // panel, prompt, minimap
//     if (input.pressed('KeyY')) races.accept();    // take the offer
//     if (input.pressed('Backspace')) races.abort(); // decline / quit
//   }
//   // and route the game's own fail paths through it while a race is on:
//   function onBusted() { if (races.active) return races.notifyBusted(); /* normal arrest */ }
//   function onWasted() { if (races.active) return races.notifyWasted(); /* normal death */ }

import { StreetRaceManager, buildCourse } from '../src/systems/streetRaceManager.js';
import racesConfig from '../src/config/races.json' with { type: 'json' };

// ---- a pretend world: the bits of game state the races touch
const world = {
  money: 500,
  wanted: { stars: 1, heat: 2 },
  props: new Set(),
  racers: new Map(),
  playerHeld: false,
};

let nextProp = 0;
const adapter = {
  // Three.js would add a mesh (and a Rapier body) here; the handle removes it again.
  spawnProp: (def) => {
    const id = `${def.type}-${nextProp++}`;
    world.props.add(id);
    return { dispose: () => world.props.delete(id), setState: () => {} };
  },
  spawnRacers: (track, slots, drivers) =>
    slots.map((s, i) => {
      const id = `npc-${i}`;
      world.racers.set(id, { ...s, name: drivers[i].name, k: 0 });
      return id;
    }),
  // NPC driving: here they just hop from checkpoint to checkpoint at their own pace.
  updateRacers: (dt, info) => {
    if (info.state !== 'RACING') return;
    for (const [, r] of world.racers) {
      r.k += dt * (0.55 + Math.random() * 0.1);
      const c = info.course[Math.min(info.course.length - 1, Math.floor(r.k))];
      r.x = c.x;
      r.z = c.z;
    }
  },
  racerPosition: (id) => world.racers.get(id) ?? null,
  removeRacers: () => world.racers.clear(),
  placePlayer: (slot) => (Object.assign(player, { x: slot.x, z: slot.z }), true),
  holdPlayer: (h) => void (world.playerHeld = h),
  getMoney: () => world.money,
  spend: (n) => (world.money >= n ? ((world.money -= n), true) : false),
  earn: (n) => void (world.money += n),
  getWanted: () => ({ ...world.wanted }),
  // In the game: police.reset(), tanks.clearAll(), then set the level back.
  restoreWanted: (snap) => {
    console.log(`[police] all chasers stand down; wanted ${world.wanted.stars} -> ${snap.stars} stars`);
    world.wanted = { ...snap };
  },
  respawnAt: (slot, why) => console.log(`[respawn] ${why}: back on the grid at ${slot.x.toFixed(0)}, ${slot.z.toFixed(0)}`),
  notify: (t) => console.log(`[toast] ${t}`),
  showBig: (t) => console.log(`[BIG] ${t}`),
};

const races = new StreetRaceManager({ config: racesConfig, adapter });
races.on('state', (e) => console.log(`[race] ${e.from} -> ${e.to}`));
races.on('checkpoint', (e) => console.log(`[race] checkpoint ${e.index}/${e.total}`));
races.on('resolved', (r) => console.log(`[race] result: ${r.place ?? 'DNF'} (${r.reason}), +$${r.cash}, +${r.cred} cred; standings ${r.standings.join(' > ')}`));

// ---- the game loop
const player = { x: 0, z: 0, inVehicle: true };
const track = racesConfig.tracks[0];
const course = buildCourse(track);
const dt = 1 / 30;
const ctx = () => ({ inVehicle: player.inVehicle, x: player.x, z: player.z, speed: 3, freeRoam: true });
function frames(seconds, each) {
  for (let t = 0; t < seconds; t += dt) {
    each?.();
    races.update(dt, ctx());
  }
}

// 1. Pull up next to the organiser: an offer appears. Accept it.
Object.assign(player, track.organizer);
frames(0.1);
console.log('prompt:', races.hud(ctx()).prompt);
races.accept();

// 2. Drive to the start line: the countdown starts (fee paid, props and racers spawned).
Object.assign(player, track.start);
frames(0.1);
console.log(`props on the street: ${world.props.size}, racers: ${world.racers.size}, held: ${world.playerHeld}, money $${world.money}`);
frames(3.2);

// 3. Race: the police join in mid-race (smashed a cruiser).
world.wanted = { stars: 3, heat: 9 };
let k = 0;
frames(40, () => {
  if (races.state !== 'RACING') return;
  // Player drives checkpoint to checkpoint, a bit quicker than the NPCs.
  k += dt * 0.62;
  const c = course[Math.min(course.length - 1, Math.floor(k))];
  player.x = c.x;
  player.z = c.z;
});
console.log(`after the race: $${world.money}, ${world.wanted.stars} star(s) (was 1 before), props left ${world.props.size}, Street Cred ${races.streetCred}`);
console.log('save:', JSON.stringify(races.serialize()));
