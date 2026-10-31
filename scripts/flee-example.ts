// Smart fleeing and wall collision: a runnable integration example (no renderer needed).
//   npm run flee:example        (tsx scripts/flee-example.ts)
//
// In the game this is wired up in src/creatures/SpawnSystem.ts (`move` and the 'flee' case of
// `step`); this script is the same per-frame sequence on a small map, so you can see the parts:
//
//   1. one ObstacleField per layer: a cached WallGrid over "is this a wall?" + round obstacles
//   2. fleeing creatures ask SmartFleeBehavior which way to run (re-planned ~8x a second)
//   3. every moving creature gets the wall buffer's push added to its steering
//   4. the move is swept against the walls (moveWithCollision): it never ends inside one
//
// In a game loop:
//
//   const field = new ObstacleField(new WallGrid((x, z) => world.isWall(x, z)));
//   const flee = new SmartFleeBehavior();               // or new SmartFleeBehavior({ rays: 8 })
//   function updateCreatures(dt) {
//     field.circles.clear();                            // moving props: rebuilt each frame
//     for (const p of props) field.circles.add(p.x, p.z, p.radius);
//     for (const c of creatures) {
//       let dir = c.wanderDir;
//       if (c.fleeing) {
//         const s = flee.steer(c, player.x, player.z, field, c.fleeMemory, dt);
//         dir = { x: s.dirX, z: s.dirZ };
//       }
//       const push = wallRepulsion(field, c.x, c.z, c.radius, 0.8);
//       const v = steerWithRepulsion(dir.x, dir.z, c.speed, push.x, push.z);
//       const m = moveWithCollision(field, c.x, c.z, v.vx, v.vz, dt, c.radius);
//       c.vx = (m.x - c.x) / dt; c.vz = (m.z - c.z) / dt;
//       c.x = m.x; c.z = m.z;                             // then place the mesh at (c.x, ground, c.z)
//     }
//     debug.update(creatures);                          // optional: FleeDebug draws the rays
//   }

import { SmartFleeBehavior, newFleeMemory, steerWithRepulsion } from '../src/creatures/SmartFlee';
import { ObstacleField, WallGrid, moveWithCollision, wallRepulsion } from '../src/creatures/WallProbe';

// A 40 x 30 m courtyard with a building in the middle and a dead-end alcove on the east side.
const isWall = (x: number, z: number): boolean =>
  Math.abs(x) > 20 || Math.abs(z) > 15 || (Math.abs(x) < 5 && Math.abs(z) < 4) || (x > 12 && Math.abs(z) > 2 && Math.abs(z) < 3 && x < 20);
const field = new ObstacleField(new WallGrid(isWall));
// A few traffic cones (round obstacles).
for (const [x, z] of [[-10, 6], [-9, 6], [-8, 6]]) field.circles.add(x, z, 0.3);

const flee = new SmartFleeBehavior();
const creatures = [
  { name: 'Hazeling', x: 8, z: 0, vx: 0, vz: 0, radius: 0.3, speed: 5, mem: newFleeMemory(0) },
  { name: 'Gutterat', x: -12, z: 8, vx: 0, vz: 0, radius: 0.25, speed: 5.5, mem: newFleeMemory(0.05) },
  { name: 'Cinderblock', x: 17, z: 0, vx: 0, vz: 0, radius: 0.55, speed: 3.5, mem: newFleeMemory(0.1) },
];
const player = { x: 0, z: 8 };
const dt = 1 / 30;
let cornered = 0;
let hits = 0;

for (let frame = 0; frame < 30 * 8; frame++) {
  // The player chases whoever is closest.
  const target = creatures.reduce((a, b) => (Math.hypot(a.x - player.x, a.z - player.z) < Math.hypot(b.x - player.x, b.z - player.z) ? a : b));
  const tx = target.x - player.x;
  const tz = target.z - player.z;
  const tl = Math.hypot(tx, tz) || 1;
  player.x += (tx / tl) * 4 * dt;
  player.z += (tz / tl) * 4 * dt;

  for (const c of creatures) {
    const s = flee.steer(c, player.x, player.z, field, c.mem, dt);
    if (s.cornered) cornered++;
    const push = wallRepulsion(field, c.x, c.z, c.radius, 0.8);
    const v = steerWithRepulsion(s.dirX, s.dirZ, c.speed, push.x, push.z);
    const m = moveWithCollision(field, c.x, c.z, v.vx, v.vz, dt, c.radius);
    if (m.hit) hits++;
    c.vx = (m.x - c.x) / dt;
    c.vz = (m.z - c.z) / dt;
    c.x = m.x;
    c.z = m.z;
    if (isWall(c.x, c.z)) throw new Error(`${c.name} ended up inside a wall`);
  }
  if (frame % 60 === 59)
    console.log(
      `t=${((frame + 1) * dt).toFixed(0)}s player (${player.x.toFixed(1)}, ${player.z.toFixed(1)}) | ` +
        creatures.map((c) => `${c.name} (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) ${Math.hypot(c.x - player.x, c.z - player.z).toFixed(1)} m away`).join(' | '),
    );
}
console.log(`frames cornered: ${cornered}, wall contacts handled: ${hits}, rays cast: ${field.rays}, grid cells sampled: ${field.grid.stats.samples}`);
