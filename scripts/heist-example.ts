// Heists and the city map: a runnable integration example (no renderer).
//   npm run heist:example        (tsx scripts/heist-example.ts)
//
// In the game: src/core/Game.ts (setupHeists, heistKeys, updateHeists; setupCityMap,
// updateCityMap, mapMarkers). This script runs the same per-frame calls against a fake world.
//
// Hooking both into a game loop:
//
//   import { HeistManager } from './systems/heistManager.js';
//   import heistsConfig from './config/heists.json';
//   import { MapOverlay } from './ui/MapOverlay';
//   import mapIcons from './config/map_icons.json';
//
//   const heists = new HeistManager({ config: heistsConfig, adapter });   // adapter: money, stars, world hooks
//   const map = new MapOverlay(document.body, layout, mapIcons, { route, placeName });
//
//   function onKey(code) {
//     if (map.isOpen) return map.key(code);                // M / Esc close, C centre, +/- zoom
//     if (code === 'KeyM') return map.open();
//     if (code === 'KeyZ') heists.useAbility('hacker', ctx); // jam cameras and alarm
//     if (code === 'KeyX') heists.useAbility('smoke', ctx);  // knock out guards, blind witnesses
//     if (code === 'KeyE') {                                 // context action
//       if (world.nearLoot >= 0) heists.takeLoot(world.nearLoot);
//       else if (world.nearBreach >= 0) heists.startBreach(world.nearBreach, ctx);
//       else if (world.planSpot) { heists.plan(world.planSpot.id); /* open the board: assign(), launch() */ }
//     }
//     if (code === 'Backspace') heists.abandon();
//   }
//
//   function gameLoop(dt) {
//     const hud = heists.update(dt, { x, z, inVehicle, stars, seenBy: world.seenBy(), nearBreach, nearLoot, atDropOff, guardsAwake });
//     player.speedMult = inVehicle ? 1 : heists.encumbrance().speedMult;   // loot is heavy
//     drawHeistPanel(hud);
//     map.update(dt, { x, z, heading }, liveMarkers(), panKeys);          // waypoint route + redraw
//     minimap.setWaypoint(map.waypoint ? { path: map.path, at: map.waypoint } : null);
//   }
//   // and the game's own fail paths:
//   function onBusted() { heists.notifyBusted(); /* normal arrest */ }
//   function onWasted() { heists.notifyWasted(); /* normal death */ }

import heistsConfig from '../src/config/heists.json';
import { HeistManager, type CrewCandidate, type HeistConfig } from '../src/systems/heistManager.js';
import { pathLength, screenToWorld, worldToScreen, zoomAt } from '../src/ui/MapOverlay';

const cfg = heistsConfig as unknown as HeistConfig;
const party = new Map<string, CrewCandidate>([
  ['rebarb', { id: 'rebarb', speciesId: 'rebarb', name: 'Rebarb', types: ['concrete', 'gun'], level: 25, stats: { hp: 70, attack: 90, defense: 80, speed: 55, loud: 40 }, weightKg: 45, hp: 70 }],
  ['dishling', { id: 'dishling', speciesId: 'dishling', name: 'Dishling', types: ['wire'], level: 22, stats: { hp: 50, attack: 40, defense: 45, speed: 85, loud: 60 }, weightKg: 14, hp: 50 }],
  ['hazeling', { id: 'hazeling', speciesId: 'hazeling', name: 'Hazeling', types: ['smoke'], level: 20, stats: { hp: 45, attack: 35, defense: 30, speed: 90, loud: 70 }, weightKg: 8, hp: 45 }],
]);
const world = { money: 2000, stars: 0, guardsAwake: 3, cameras: true };
const heists = new HeistManager({
  config: cfg,
  rng: () => 0.5,
  adapter: {
    getStreetmon: (id) => party.get(id) ?? null,
    getMoney: () => world.money,
    spend: (n) => (world.money >= n ? ((world.money -= n), true) : false),
    earn: (n) => void (world.money += n),
    getStars: () => world.stars,
    raiseWanted: (s) => {
      if (s > world.stars) console.log(`[police] Wanted Level -> ${s} stars`);
      world.stars = Math.max(world.stars, s);
    },
    deploy: (t, crew) => console.log(`[world] crew out at ${t.name}: ${Object.entries(crew).map(([r, m]) => `${r} ${m.name}`).join(', ')}`),
    setCameras: (_t, on) => void (world.cameras = on),
    smokeScene: () => ((world.guardsAwake = 0), 3),
    breachDone: (_t, _i, bags) => console.log(`[world] vault open: ${bags.length} bags`),
    escapeStarted: (_t, stars, drops) => console.log(`[world] getaway at ${stars} stars to ${drops.map((d) => d.name).join(' / ')}`),
    soundAlarm: () => console.log('[world] ALARM'),
    notify: (t) => console.log(`[toast] ${t}`),
    showBig: (t) => console.log(`[BIG] ${t}`),
  },
});
heists.on('state', (e) => console.log(`[heist] ${e.from} -> ${e.to}`));

// Plan the bank: Breacher + Hacker are required; we take Smoke instead of a Hauler.
const bank = heists.target('first-empire-vault')!;
heists.plan(bank.id);
heists.assign('breacher', party.get('rebarb')!);
heists.assign('hacker', party.get('dishling')!);
heists.assign('smoke', party.get('hazeling')!);
console.log('crew:', heists.validateCrew());
console.log('launch:', heists.launch());

const at = { x: bank.location.facade!.x, z: bank.location.facade!.z, inVehicle: false, stars: 0 };
const frame = (dt: number, extra: Record<string, unknown> = {}) => heists.update(dt, { ...at, stars: world.stars, guardsAwake: world.guardsAwake, ...extra });
frame(0.1);
console.log('smoke:', heists.useAbility('smoke', at));
console.log('jam:', heists.useAbility('hacker', at));
console.log('breach:', heists.startBreach(0, { ...at, nearBreach: 0, guardsAwake: world.guardsAwake }));
while (heists.state === 'BREACH') frame(0.5, { nearBreach: 0, seenBy: 0 });
// Take every bag: no Hauler, so it's all on your back.
for (const b of heists.job!.bags) heists.takeLoot(b.index);
const enc = heists.encumbrance();
console.log(`carrying ${heists.carried().playerKg} kg: ${Math.round(enc.speedMult * 100)}% speed, sprint ${enc.canSprint ? 'ok' : 'no'}`);
// Lose the cops, then the lock-up.
world.stars = 0;
const hud = frame(0.1, { inVehicle: true, atDropOff: bank.escape.dropOffs[0] });
console.log('result:', hud.state, heists.result && { cash: heists.result.cash, spoiled: heists.result.spoiled, bonus: heists.result.bonus, heat: heists.result.heat });

// Map view maths: a waypoint click at (600, 200) on an 800x600 view centred on the bank.
let view = { cx: at.x, cz: at.z, zoom: 1, w: 800, h: 600 };
const wp = screenToWorld(view, 600, 200);
view = zoomAt(view, 400, 300, 2, 0.35, 6);
console.log(`waypoint at (${wp.x.toFixed(0)}, ${wp.z.toFixed(0)}); after zooming in it's drawn at`, worldToScreen(view, wp.x, wp.z), `- straight-line route ${pathLength([at, wp]).toFixed(0)} m`);
