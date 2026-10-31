// Streetmon vehicle tuning: a runnable usage example.
//   npm run tuning:example        (tsx scripts/tuning-example.js)
//
// VehicleTuningManager has no engine dependencies. The game (or a test, a server, a tool) gives it
// an adapter: where to find Streetmon, a vehicle's stock stats, and what to do when stats change
// or an ability fires. In the game that adapter is in src/core/Game.ts (setupTuning) and the world
// effects are in src/systems/TuningWorld.ts.

import { VehicleTuningManager } from '../src/systems/vehicleTuning.js';

// 1. Your Streetmon, as the tuning system sees them (the game builds these from party creatures).
const streetmon = new Map([
  ['m-hazeling', { id: 'm-hazeling', speciesId: 'hazeling', name: 'Hazeling', types: ['smoke'], level: 22, stats: { hp: 62, attack: 40, defense: 33, speed: 66, loud: 30 } }],
  ['m-woofer', { id: 'm-woofer', speciesId: 'woofer', name: 'Woofer', types: ['bass'], level: 30, stats: { hp: 95, attack: 70, defense: 60, speed: 40, loud: 90 } }],
  ['m-rooftail', { id: 'm-rooftail', speciesId: 'rooftail', name: 'Rooftail', types: ['wire'], level: 18, stats: { hp: 45, attack: 30, defense: 25, speed: 70, loud: 35 } }],
]);
const inParty = new Set(streetmon.keys());

// 2. A stock car (the game reads these from the vehicle spec).
const taxi = { topSpeed: 48, acceleration: 4.3, durability: 1000, mass: 1750, grip: 1.45, steering: 1, radarRange: 105 };

// 3. The adapter.
const tuning = new VehicleTuningManager({
  adapter: {
    getStreetmon: (id) => streetmon.get(id) ?? null,
    takeStreetmon: (id) => (inParty.delete(id), true), // or return a reason string to refuse
    returnStreetmon: (id) => void inParty.add(id),
    getBaseStats: () => taxi,
    applyStats: (vehicleId, s) => {
      // Push to physics: car.mods.speed = s.multipliers.topSpeed, car.setMass(base * s.multipliers.mass), ...
      console.log(`[physics] ${vehicleId}: top speed x${s.multipliers.topSpeed.toFixed(2)}, armour x${s.multipliers.durability.toFixed(2)}, mass x${s.multipliers.mass.toFixed(2)}, radar ${s.final.radarRange} m`);
    },
    triggerAbility: (vehicleId, ability) => {
      // Run the world effect (smoke trail, shockwave, spike strip...). Return false if it can't fire.
      console.log(`[world] ${vehicleId}: ${ability.name} (power ${ability.power.toFixed(2)}, fx ${JSON.stringify(ability.fx)})`);
      return true;
    },
    endAbility: (vehicleId, ability) => console.log(`[world] ${vehicleId}: ${ability.name} ended`),
  },
});

tuning.on('abilityReady', (e) => console.log(`[hud] ${e.abilityId} ready`));

// 4. Chop Shop API.
console.log(tuning.slotStreetmon('ride-1', 'trunk', 'm-hazeling')); // refused: wrong type for the slot
tuning.slotStreetmon('ride-1', 'engineBay', 'm-hazeling');
tuning.slotStreetmon('ride-1', 'trunk', 'm-woofer');
tuning.slotStreetmon('ride-1', 'roofRack', 'm-rooftail');
const { base, final } = tuning.getVehicleStats('ride-1');
console.log(`top speed ${Math.round(base.topSpeed * 3.6)} -> ${Math.round(final.topSpeed * 3.6)} km/h, durability ${base.durability} -> ${Math.round(final.durability)}`);

// 5. Input: call every frame with what's held (keys and/or a browser Gamepad). Fires on a fresh press.
const held = new Set(['ShiftLeft']);
console.log('fired:', tuning.handleInput('ride-1', { isDown: (code) => held.has(code), gamepad: null }));
held.clear();
tuning.handleInput('ride-1', { isDown: (code) => held.has(code) }); // key released
// Collisions fire Exhaust Backfire (Gun engine) by themselves:
tuning.notifyCollision('ride-1', { strength: 12 });

// 6. Each frame: tick cooldowns and draw the HUD from the rows (cooldown01: 1 = just used, 0 = ready).
for (const t of [1, 4, 12]) {
  const rows = tuning.update(t);
  console.log(`after +${t}s:`, rows.map((r) => `${r.name} ${r.active01 > 0 ? 'ACTIVE ' : ''}${Math.round(r.cooldown01 * 100)}%`).join(' | '));
}

// 7. Saving: slots only (the game saves the Streetmon and the car alongside).
const saved = tuning.serialize();
console.log('save:', JSON.stringify(saved));
tuning.unslotStreetmon('ride-1', 'engineBay');
console.log('party now has hazeling again:', inParty.has('m-hazeling'));
