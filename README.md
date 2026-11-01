# Empire Streets

A 3D open-world driving sandbox in an NYC-inspired city, running in the browser.
Three.js for rendering, Rapier for physics, TypeScript + Vite.

**Built so far:** the city, car physics, walking, getting in and out of cars, crashes, fire and
explosions (phase 1); live traffic, traffic signals, pedestrians and carjacking (phase 2); the
wanted level, police chases, arrests and roadblocks (phase 3).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` makes a static build in `dist/`. `npm run typecheck` runs TypeScript only,
`npm test` runs the unit tests (city, traffic, wanted, weapons, Streetmon data and models),
`npm run creatures` rebuilds and validates the creature models.

### Creature model pipeline (textures, bloom)

- **Shared texture atlas** (`src/creatures/models/Atlas.ts`, written to `public/creatures/atlas/`):
  three 512 x 512 images every model uses. The colour image multiplies the vertex colours (palette
  plus baked crevice AO), so one atlas serves every species and shiny variant. The normal image
  adds panel lines, rivets, armour seams, vent grills, fabric weave and concrete pits. The ORM
  image packs occlusion (R), roughness (G) and metalness (B). It is an 8 x 8 grid: columns are
  surface classes (metal, armour, gloss, vent, fabric, concrete, rubber, glow), rows are styles
  (vertical, strong and horizontal gradients, flat, edge wear, rust, grime, glow core).
- **Unwrap** (`Unwrap.ts`, run by `Kit.build`): each part gets a surface class from its species'
  types and palette colour (`Polish.SURFACES`; builders can override with `surface`). Each face
  maps onto a whole cell, so its gradient runs from the part's bottom to its top or along its
  length. Bevelled edges map to edge wear, or rust on metal; anything near the ground maps to
  grime. Each face also gets a tangent for the normal map.
- **Geometry clean-up**: flat caps are re-fanned with fewer triangles, and faces buried inside
  another opaque part on the same bone are dropped, before the 1,500-triangle hard cap is applied.
- **Materials**: `MeshStandardMaterial` with `map`, `normalMap` and `aoMap`/`roughnessMap`/
  `metalnessMap` (the ORM image, factors 1); glow parts add `emissiveMap` with strength 3.0 or more.
  The `.glb` files reference the atlas PNGs as external images; `CreatureModels` shares one GPU
  copy between all models.
- **Bloom** (`src/render/SelectiveBloom.ts`): only creature glow meshes bloom. They're drawn again
  on their own, depth-tested against the scene, blurred and added on top, so sunlit walls don't
  bloom. Settings are in `GRAPHICS.bloom` in `src/config.ts`. Turn it off with
  `localStorage['es.bloom'] = '0'` (costs about 4 ms a frame at 1200 x 1600).
- `npm run validate:glb -- public/creatures` runs the Khronos validator over a folder.

### Surfaces on everything else (city, cars, people, props)

- **City surfaces** (`src/world/Textures.ts`): facades, asphalt, sidewalks, grass and roofs are
  full PBR sets. Each has a colour map, a normal map from its relief, and a packed
  roughness/metalness map. The relief covers mortar joints, recessed windows, proud sills,
  aggregate, slab joints and gravel; the roughness/metalness map keeps glass smooth and slightly
  reflective while brick, stone and concrete stay matte.
- **Everything else** (`src/render/Surfaces.ts` + `SurfaceGen.ts`): `withSurface(material, kind)`
  adds tileable detail to any standard or physical material without UVs. The detail is projected
  from three directions in the mesh's own space, so it sticks to moving cars, skinned people and
  instanced props. It varies the colour, darkens cavities, varies roughness and bumps the normal,
  fading out with distance. There are 20 kinds: concrete, asphalt, brick, stone, gravel, painted
  metal, bare metal, rust, chrome, car paint, rubber, plastic, fabric, leather, skin, hair, wood,
  bark, foliage, paper. Every game material is tagged with one of them (cars, pedestrians, the
  tank, heist and race props, weapons, shops, clinics, sewers, rooftops, street furniture). The
  tiles are generated in idle time after start-up, about 50 ms each; until then surfaces render
  plain.
- Creatures keep their own atlas (above).

## Streetmon and the street

- **Shoot them.** Bullets, melee and fire hurt Streetmon (at 40% of their damage to people, 30% to Concrete types). Wild ones knocked out limp away; in a real-time battle your shots land on the foe through the battle, so they count for the win. Firing in public still draws heat.
- **Run them over.** Cars hurt Streetmon: damage grows with speed (none under 12 km/h, about 20% of a light Streetmon's HP at 40 km/h, about 75% at 80 km/h), heavier cars hit harder (SUVs and vans over 80 km/h knock anything out) and heavy Streetmon shrug more off and dent your car. They're knocked into the air, then faint, run, or come after you if they're aggressive, Gun or Concrete. Floating numbers show the damage (from shots too). Your own summoned Streetmon is never hit. Weights are `model.weightKg` in `creatures.json`; the maths is in `src/vehicles/CreatureImpacts.ts`.
- **Arrest battles.** When the police grab you, there's a 50% chance (once per chase) an officer sets a K-9 Streetmon on you. Win and the officers nearby are knocked down for 6 s while you run; lose and you're busted as usual. You can't catch police Streetmon.
- **Challengers.** Every minute or two, someone in the street (shown with a blue "!") may walk over and challenge you while you're on foot with no wanted level. Win for $40-200; you can't catch their Streetmon.
- **Spawns** are twice as frequent and twice as numerous as before (24 at once, 16 per district).
- **Home turf.** Every street species has a home district (the first in its `spawn.districts`):
  it's common there and only turns up elsewhere on its list as the odd stray (a fifth of the
  weight). Uptown has Curbstone, Cinderblock and Flue; Midtown Doubleshift, Overtime and
  Subsonic; Downtown Exhaust Fume and the gun and gang types; the Park Hustlepup, Cashew,
  Hazeling and Streetlamp; the Waterfront Longshot, Overwatch and Overpass. In every district
  and time of day at least 70% of what spawns lives there. Rooftops and sewers are their own
  areas with their own species. The dex habitat hints say where each one's home is.
- **Where it's dangerous.** Aggressive Streetmon only come for you **in the Park, on the
  rooftops and in the sewers**. Out on the other streets the same species keep to themselves
  (they watch you, like any other) unless you hurt one: then it fights back anywhere for 20 s.
  One that chases you out of the Park gives up at the edge. The aggressive gang and gun types
  all stray into the Park at night, so that's where the trouble is.
- **Hitting the Streetmon you're battling**: in a real-time battle your fists, bats and guns hit
  the foe (shots get aim assist: a Streetmon is knee-high and the crosshair sits at shoulder
  height, so a shot that's on target sideways counts). Your damage counts towards the win.

## World layers

The city has three layers: the **street**, the **rooftops** and the **sewers** 40 m below
(`src/world/WorldLayers.ts`). The game always knows which one you're in (walking off a roof onto
the next one, or falling to the street, updates it), and every system follows: rooftops and sewers
spawn only their own Streetmon with their own caps (8 on roofs, 10 underground, 14 at night) and
the street's disappear while you're away; the sewers swap the sky for darkness and close fog and
muffle the music; the HUD shows "Rooftops" or "Sewers" before the address; battles, evolutions
and your summoned Streetmon stand on the right floor. Climbs, elevators and manholes all go
through one `transition()` (input locked, fade out, move, fade in), which won't start in a car,
a battle or an evolution. Saving on a rooftop puts you back on it. Rooftop access and the sewer
maze arrive in the next steps.

## Rooftops

Low and mid-rise roofs are walkable (`src/world/Rooftops.ts` plans them from the city layout with
a fixed seed; `RooftopView.ts` builds them). Getting up:

- **Fire escapes** (black stairs on facades, about one building in three): E at the bottom to climb,
  E at the top of the roof to climb down.
- **Elevators** (lit blue doors, 2 per district, on the tallest towers): E to ride to the roof hut
  and back down.
- **Parking garages** (one per district): drive along the sidewalk, swing into the lane and up the
  ramp onto the deck, 9 m up. The area in front of each ramp is kept clear of parked cars and
  street furniture.
- **Jump pads** (glowing teal discs with an arrow): step on one to be thrown onto the higher roof
  next door. Miss the landing and you're put back on the pad.
- **Hidden jump spots** (a dull grey patch on some roofs, 2 per district) throw you onto a roof
  much taller than its neighbours, where a hidden stash waits.
- **Rooftop stairs** (grey steps with yellow edges, 209 of them): wherever two neighbouring
  roofs are 0.4-3 m apart, a short flight joins them, so you can walk both ways. Each step is
  0.3 m or less, so you never need to jump.

**No getting stuck on the roofs.** The planner works out every roof you can end up on (walking,
taking stairs or pads, or dropping down as far as you'd survive) and makes sure each one has a way
back to the street without a painful fall. Where a roof had none, it adds a jump pad back up to a
safe neighbour (21) or, failing that, a fire escape down (19, some on the ledges of stepped
towers). Stairs and new pads are kept clear of existing pads, crates, huts and arrival spots. A
unit test checks the whole city: all 455 roofs you can reach have a way out.

**Rooftop Streetmon** (Wire type, only on roofs, 8 at a time; models in
`src/creatures/models/RoofBuilders.ts`):

| # | Species | Types | Where and when | Evolves |
| --- | --- | --- | --- | --- |
| 23 | Rooftail | Wire | Every district, day and dusk (common) | Antennaroc at Lv 20 |
| 24 | Antennaroc | Wire/Bass | Midtown and Downtown, dusk (rare) | |
| 25 | Neonmoth | Wire/Smoke | Midtown and Downtown, dusk and night | Marqueen, levelling up at night from Lv 24 |
| 26 | Marqueen | Wire/Smoke | Downtown, night (rare) | |
| 27 | Dishling | Wire | Uptown and Midtown, any time | Broadcastle at Lv 28 |
| 28 | Broadcastle | Wire/Concrete | Uptown, night (rare) | |

Eight new Wire moves, including the signatures Dish Beam (Broadcastle) and Lights Out
(Marqueen). **The Skyline Crew** (Kite, Vega and Lux) wait on rooftops in Uptown, Midtown and
Downtown with rooftop teams and only notice you when you're up there too. **The Skyline Trader**,
on a Midtown roof by a fire escape, sells Spark Plugs ($1,200), Steel Cases ($2,000) and Crates
($350), cheaper than the clinic.

**Stashes** (crates; blue for hidden ones) hold cash and capture items; hidden ones also hold an
evolution item. Each opens once and stays open in your save. **Falls** now hurt: landing from
about 9 m up costs health, from about 30 m it's fatal at full health.

## The Central Green pond

The pond in the middle of the Central Green is real water (`src/world/Pond.ts`, `src/world/PondView.ts`):

- **A basin, not a floor.** A shallow wading shelf a few metres wide runs round a low stone rim,
  then the bed drops to about 2.4 m in the middle (a Rapier heightfield and a bed mesh from the
  same depth function). The rim is low enough to step over.
- **The surface moves:** waves in the vertex shader (the same sum the code uses for anything
  floating), a scrolling ripple normal map, sky reflections, see-through enough to make out the
  shelf. Rings spread from anything that splashes, swims or paddles; lily pads (some flowering)
  ride the waves along the edges.
- **Wading and swimming.** On the shelf you wade, slower the deeper it gets. Once it's deeper than
  about 1.25 m you swim (front crawl moving, treading water standing still; Shift swims faster),
  your head above the waves. Jumping or falling in splashes. Swim to the edge and keep going (or
  press Space) to climb out onto the grass. No guns, throws or fights while swimming: start a
  fight and you scramble out onto the bank first. The camera never dips under the surface.
- **Cars float, then sink.** A car that goes in gets buoyancy at the corners of its underside (so it
  lists and noses down), water drag and a big splash. It fills over a few seconds; once the water's
  over the engine it dies ("F  Get out: the engine's flooded"), and it settles on the bed. Get out
  and swim. A sunk car is gone once you're well away; one you own is towed to the Chop Shop.

### Pond Streetmon

Five water species (dex 52-56) live only on the pond (`spawn.biomes: ["pond"]`, a habitat on the
street layer with its own cap of 5, 6 at night). They float with part of themselves under the
surface (`model.sink`), paddle about and keep to the water; after a fight on the bank they waddle
straight back in. The Dex has a **Pond** filter.

| | Types | When | Notes |
| --- | --- | --- | --- |
| Quackpack | Sludge | day, dusk (common) | A rubber duck patched with bottle caps. Evolves at Lv 26 |
| Pedalswan | Sludge / Bass | dusk, night (rare, aggressive) | A runaway swan pedal boat with a sound system |
| Koinfish | Grind / Sludge | any time (uncommon, shy) | A koi with coins for scales. Evolves at Lv 30 |
| Wishmaw | Grind / Sludge | night (rare, aggressive) | A rowboat-sized koi with a fountain-stone mouth |
| Snapcase | Concrete / Sludge | any time (rare, aggressive) | A snapping turtle with a concrete shell |

Fogbank also drifts low over the water at night.

## Sewers

Under Uptown, Midtown and Downtown lie three sewer labyrinths, 40 m below the street
(`src/world/Sewers.ts` carves them from a fixed seed; `SewerView.ts` builds them). Each is a
49 x 49 grid of 3 m blocks: twisting tunnels with loops, six 9 m chambers, six 15 m halls (big
open rooms), dead ends, and a 15 m hub in the middle, where the underground community lives.

- **Manholes**: 6 per maze, round steel covers with a light rim and a cross on the road,
  sidewalk or park path (the Midtown ones are in the park). Stand on one and press E to climb
  down; E at the ladder (under the light shaft) to climb back up. The minimap shows manholes
  within 90 m (dim) and every one you've used (bright), and the first time you walk up to one a
  hint tells you what it's for.
- **Underground** the minimap shows the tunnels around you, you carry a flashlight, and the
  sewers have their own track (Dragging Through Concrete).
- **Open spaces and spawns**: the halls and chambers are where wild Streetmon gather: 60% of
  sewer spawns are placed in them (the rest anywhere in the tunnels), and up to 14 (18 at night)
  roam a maze at once.
- **Props**: barrels and chemical drums, crates and crate stacks, pallets, pipe bundles and tyre
  stacks line the rooms (never in a doorway, the middle stays open), junk is piled at dead ends,
  and barrels stand against the walls of straight tunnels (2 m stays clear). They're solid for
  you and for Streetmon; a test checks no prop ever cuts off part of the maze. About 70-80 per
  maze.
- **Hazards**: toxic sludge (green pools: 4 HP/s and slows you), steam grates (blow for 1.5 s of
  every 6: 10 HP/s and a lift), fast channels (push you along at 3.5 m/s) and dark stretches where
  the flashlight stutters.
- **Police** can't follow you down, and the search for you runs twice as fast: going underground
  is a way to lose stars.
- Saving underground puts you back in the tunnels.

### The community below

Nine people live down here (seven under Midtown, one each under Uptown and Downtown). Some stand
round the hub; others live at camps out in the halls, by a fire in an oil drum with their bedrolls
(each maze has three camps, the first near the hub and the others spread as far apart as the maze
allows). Walk up and press E to talk; pick answers with 1-4 or a click, Esc leaves. Wild
Streetmon stay out of the hubs and camps.

- **Mama Lu** heals your team for $40.
- **Fence** runs the black market: four items a day, always including Sludge Lures (x3 against
  Sludge types). From 20 reputation he also stocks Cages (x2.5 catch), Spark Plugs and Steel
  Cases; from 40 everything is 20% off.
- **Quests** (6): escort a lost Gutterat home, fetch a valve wheel, clear a Drainling nest,
  catch a Mildew for spore samples, gather radio parts under Uptown, and (at 30 reputation)
  take on the Rat Court under Downtown. The current step shows under the stars, with a yellow
  marker on the minimap. Rewards are cash, items and reputation.
- Quests and reputation are saved.
- People, dialogue and quests are data: `src/data/npcs.json` and `src/data/quests.json`,
  checked on load by `src/npc/Quests.ts` (step types: reach, collect, battle, escort, catch,
  talk; places: `hub`, `chamber:N`, `deadEnd:N`).

### Sewer Streetmon

Six new Sludge species live only underground: Gutterat → Ratking (Lv 22), Drainling →
Sewergator (Lv 30) and Mildew → Moldmother (Lv 26), with 8 new moves (signatures: Plague,
Death Roll, Spore Bloom).

## Underground Chop Shop (Streetmon vehicle tuning)

Bring a car and your Streetmon to the **Chop Shop**: a freight lift in the kerb lane of a Midtown
street, under a pink neon CHOP SHOP sign (pink square on the minimap). Stop on the lift and press
**E** to be lowered in. The shop won't open while you're wanted.

Every car has three mod slots. A slotted Streetmon leaves your party (or stash) and rides in the
car until you take it out; its type decides the mod, and its stats add a little on top.

| Slot | Takes | Mod | Ability |
| --- | --- | --- | --- |
| Engine Bay | Smoke | +20% top speed | **Nitrous Smokescreen** (Shift, 15 s cooldown): 5 s of nitrous (+15% speed, +35% pull) and a thick smoke trail. Police and tanks can't see you through it, and chasing cars that drive into it are blinded for 3.5 s |
| Engine Bay | Gun | +15% acceleration | **Exhaust Backfire** (on a crash, 6 s cooldown): a 10 m shockwave that shoves and staggers the cars around you |
| Trunk | Bass | +30% durability | **Sonic Bass Horn** (H, replaces the horn, 20 s cooldown): a 12 m shockwave all around; rolls light police cruisers onto their roofs, shoves roadblock cars, knocks people off their feet |
| Trunk | Grind | +30% durability | **Spike Strip Dispenser** (X, 12 s cooldown): drops a spike strip behind you; cars that cross it get flat tyres (less than half the grip, half the top speed) |
| Roof Rack | Bass, Concrete or a flying species | +100 m radar | **Early Warning Radar** (always on): the minimap zooms out 100 m further and marks roadblocks, tanks, spike strips, manholes, fire escapes, elevators, garages and hidden jump spots, with an alert line when a roadblock or tank is in range |

- "Flying" species (there's no Aerial type): Longshot, Streetlamp, Rooftail, Antennaroc,
  Neonmoth and Marqueen, listed in the config.
- A dual type uses the first of its types the slot takes (Rebarb, Concrete/Gun: Gun in the engine,
  Concrete on the roof).
- Stats: the mod's bonus plus up to +8% more from the Streetmon's matching stat (Speed for top
  speed, Attack for acceleration, Defense for durability). Faster Streetmon shorten cooldowns
  (up to 20%), higher levels make abilities stronger (radius and push, 0.85-1.15x). Extra weight
  (trunk and roof mods add 3-6%) slows the pull slightly.
- A tuned car is your **ride**: it never despawns, shows on the minimap (light pink), is saved,
  and after loading waits in the bays behind the lift. Wreck it and its Streetmon come back to
  your team. You can't install your last party member.
- While driving a tuned car, a panel above the speedometer shows each ability with its key and a
  cooldown bar (pink = ready, blue = running).

**Architecture**

| File | What it does |
| --- | --- |
| `src/config/vehicle_streetmon_tuning.json` | Slots (accepted types and species), mods (stat multipliers, stat bonus, ability), abilities (trigger, input keys and gamepad button, duration, cooldown, parameters, FX and sound ids), scaling and hazards |
| `src/systems/vehicleTuning.js` | `VehicleTuningManager`: engine-free ES module (JSDoc-typed, with `vehicleTuning.d.ts` for TypeScript). Slotting, stat maths, input edges, cooldowns, timed boosts, events, save/load. Unit-tested in Node |
| `src/systems/TuningWorld.ts` | The world side: smoke trail (instanced, blocks police and tank sight), shockwaves, flips, spike strips, radar markers |
| `src/world/ChopShop.ts` | Where the shop goes (planned from the layout, parking cleared) and its lift, door and sign |
| `src/ui/ChopShopMenu.ts` | The shop screen: slots, candidates with reasons, stock vs tuned stats |
| `src/core/Game.ts` (`setupTuning`) | The adapter: finds Streetmon, moves them in and out of the party, pushes stats into the car (`Car.mods`, `Car.setMass`), runs abilities, saves rides |

The manager talks to the game only through an adapter:

```js
import { VehicleTuningManager } from './src/systems/vehicleTuning.js';

const tuning = new VehicleTuningManager({
  adapter: {
    getStreetmon: (id) => ({ id, speciesId, name, types, level, stats }) /* or null */,
    takeStreetmon: (id) => true /* or a reason string to refuse */,
    returnStreetmon: (id) => {},
    getBaseStats: (vehicleId) => ({ topSpeed, acceleration, durability, mass, grip, steering, radarRange }),
    applyStats: (vehicleId, { base, final, multipliers }) => {},   // push into physics
    triggerAbility: (vehicleId, ability, ctx) => true,             // run the effect; false = didn't fire
    endAbility: (vehicleId, ability) => {},
  },
  // config: optional, defaults to src/config/vehicle_streetmon_tuning.json
});

tuning.slotStreetmon('ride-1', 'engineBay', 'streetmon-uid'); // { ok, reason?, replaced?, stats? }
tuning.unslotStreetmon('ride-1', 'engineBay');                  // gives it back to the player
tuning.getVehicleStats('ride-1');                               // { base, final, multipliers, mods }
tuning.handleInput('ride-1', { isDown: (code) => keys.has(code), gamepad: navigator.getGamepads()[0] });
tuning.notifyCollision('ride-1', { strength });                 // crash-triggered abilities
const hud = tuning.update(dt);                                  // [{ name, input, cooldown01, active01, ready, ... }]
const save = tuning.serialize();                                // tuning.load(save) to restore
```

`npm run tuning:example` runs a complete example (`scripts/tuning-example.js`) in Node.

### Streetmon you can see in the car

Whoever you slot rides on the car: the Engine Bay Streetmon comes up through a chrome-rimmed
hole in the hood facing the road, the Trunk one leans out of the boot (the tailgate on an SUV, the
top of a van's box) looking back, and the Roof Rack one sits up in a rack on the roof, scanning
side to side. They're the real models, about half hidden in the bodywork, idling, swaying with
the car (back as it pulls away, forward under braking, out of the turns) and playing an attack
when their ability fires (`src/vehicles/StreetmonRiders.ts`; mount points per body style in
`slotMount`, `src/vehicles/CarModel.ts`).

## Cars: the showroom, classes, parts and the body shop

**Empire Motors** is a showroom on a Downtown street (cyan sign, pennants, a couple of cars on
display out front; a cyan square on the minimap). Walk up to the window and press **E**:

- **Showroom**: every car for sale with its class, performance index, top speed, 0-100 time,
  drive and seats. Pick a colour and buy; it rolls into the delivery bay outside. Bought cars are
  **yours**: they never despawn, they are saved with their parts, paint, damage and where you left
  them, and the Chop Shop keeps them on its books. Wreck one and it's **towed to the Chop Shop**,
  barely running, for you to repair.
- **Sell a car**: park one of yours out front and get 60% of what it and its parts cost new (the
  Streetmon riding in it go back to your team).

| Car | Class | Price | Notes |
| --- | --- | --- | --- |
| Rustbucket Hatch | D | (Mama's) | Your first car |
| Pigeon Hatch | C | $9,000 | Tiny, light, turns on a dime; the best cheap car to build up |
| Yellow Cab | C | $12,000 | Tough and anonymous |
| Meridian Sedan | C | $15,000 | The everyday car |
| Box Van | D | $20,000 | Slow, huge, nearly indestructible |
| Mule Pickup | C | $24,000 | Rides high, keeps its grip on grass (an open bed for the trunk Streetmon) |
| Ranger SUV | C | $30,000 | Heavy, all-wheel drive |
| Brawler 440 | B | $32,000 | Muscle: big block, tail-happy |
| Medic Van | C | $40,000 | A van with a bigger engine and a siren (G) |
| Dune Rally | B | $48,000 | Long travel, AWD, a light pod; nearly full grip off the road |
| Vortex GT | A | $55,000 | The sports car |
| Monarch Limo | D | $65,000 | Seven metres of black glass |
| City Bus | D | $120,000 | Eleven metres of bus; carries a whole team |
| Hyperion S | S | $180,000 | The supercar: AWD, 340 km/h |

**Classes** (`src/vehicles/Performance.ts`): every car has a performance index from its top
speed, power-to-weight and grip, and a class from that: D (up to 50), C (60), B (75), A (92) and
S above. Parts raise the index and can lift a car a class, and races can be limited to a class
and below.

**Parts & body shop** (a button on the Chop Shop screen): seven parts with three levels each,
priced as a share of the car's price (so a hatchback is cheap to build):

| Part | What it does | Per level |
| --- | --- | --- |
| Engine | pull and top speed | +9% pull, +4% top speed |
| Tyres | grip | +6% |
| Brakes | stopping | +14% |
| Suspension | steering | +5% |
| Nitrous | a bottle of boost, hold **Shift** (gamepad RB) | 3 / 5 / 8 s, refills in ~24 s |
| Weight | lighter | -4% mass, +3% pull |
| Armour | takes more | +18% durability, +3% mass |

The same screen repairs the bodywork (12% of the car's price for a full rebuild, pro rata) and
resprays it (2%). Rival racers' cars get the same parts, more of them the higher the race tier.

**Handling**: the parts and the Streetmon tune are layers of multipliers on the car
(`Car.setLayer`): tune × parts × chips and blueprints × race prep. Beyond that, the surface
matters (grass and dirt have 70% of the road's grip; pickups 85%, the rally car 95%), damage
matters (past half health the engine loses up to a fifth of its pull and the top speed drops;
past 70% the car pulls to one side), nitrous pushes 18% past the top speed, and **V** cycles the
driving camera: chase, far chase, bonnet.

## Street races

Every 5-10 minutes of driving around (not wanted, nothing else going on) there's a 65% chance a
**pop-up race** is offered nearby: a panel top left shows the race, the entry fee and the prizes.
Each track also has an **organiser** waiting on the kerb by the start line (orange square on the
minimap, brown if you need more Street Cred): pull up next to them slowly and they offer their race.

- **Y** takes the offer, **Backspace** turns it down (or quits a race; no prize). After accepting
  you have 2 minutes to get to the start line; stop on it and you're lined up on the grid.
- The entry fee is paid on the grid. **3-2-1-GO**, then race three NPC drivers through the
  checkpoints (a beam of light and a ring on the road: yellow is the next one, a grey beam the one
  after, a checkered ring the finish). The minimap draws the racing line, the next checkpoints
  (clamped to the edge when they're off the map) and your rivals (orange dots).
- The track puts out **props** for the race only: barricades and cones that narrow the road, tyre
  stacks on the corners (all knock-over physics), **ramps** and **boost pads** (blue chevrons: drive
  over them along the arrows for a 1.2 s kick). Everything is removed when the race ends.
- **Prizes and Street Cred** go to 1st-3rd (1 Street Cred just for finishing). Street Cred is saved
  and unlocks the bigger races (Harbor Run needs 20).
- **Heat from the race doesn't stick.** Police can and will join in (smash a cruiser, run people
  over), but when the race ends (finish, quit, out of time, busted or wasted) every chaser stands
  down and your Wanted Level goes back to what it was before the race.
- **Busted or wasted mid-race**: no prize, but also no fine, confiscation or hospital bill. You come
  back on the starting grid in your car (or one like it if yours was wrecked).
- You also fail by leaving your car for 15 s, going 450 m off the course, or running out of time.
- **Tuning abilities work in races**: Nitrous Smokescreen blinds racers who drive into the smoke,
  the Sonic Bass Horn shoves them, spike strips pop their tyres. The Chop Shop is closed mid-race.
- NPC racers drive their own lanes, overtake slower cars, steer round ramps, recover from crashes
  (and are put back on the line when stuck out of sight), and rubber-band a little: quicker when
  far behind you, slower when far ahead.

| Track | District | Laps | Entry | 1st / 2nd / 3rd | Needs |
| --- | --- | --- | --- | --- | --- |
| West Side Sprint | Waterfront | 1 | $100 | $900 / $450 / $200 | |
| Central Green Circuit | Midtown | 2 | $200 | $1,500 / $700 / $300 | |
| Uptown Switchback | Uptown | 1 | $150 | $1,100 / $550 / $250 | |
| Harbor Run | Downtown | 1 | $300 | $2,400 / $1,100 / $500 | 20 Street Cred |
| Hatch Cup | Midtown | 1 | $50 | $700 / $350 / $150 | class C and below |
| Midtown Time Attack | Midtown | 1 | $100 | $1,800 / $900 / $400 | time trial: gold 0:58, silver 1:10, bronze 1:30 |
| Park Loop Drift | Park | 2 | $150 | $2,000 / $1,000 / $450 | drift: 12,000 / 7,000 / 3,000 pts; 5 Street Cred |
| Uptown Knockout | Uptown | 3 | $250 | $2,600 / $1,200 / $500 | knockout; class B and below; 10 Street Cred |
| Island Marathon | Waterfront | 1 | $400 | $4,200 / $2,000 / $800 | the longest race; 30 Street Cred |
| Downtown Grand Prix | Downtown | 4 | $500 | $5,000 / $2,400 / $1,000 | 40 Street Cred |

**Modes** (`mode` on a track): **sprint** (point to point), **circuit** (laps), **knockout**
(laps; at the end of every lap but the last, whoever is last is out and drives off; you're out
too if that's you), **time trial** (you alone against the clock, medal times for 1st/2nd/3rd
money) and **drift** (you alone on a loop, points for the slide angle times speed above 8° and
5 m/s, with a chain multiplier up to x4 the longer a slide lasts; medal scores). **Class
limits** (`maxClass`) turn away faster cars at the offer. The race panel shows lap times, your
best lap, the medal you're on and the score chain; **best times, best laps and best drift
scores are saved per track** and the result says when you set a record. The league's divisions
open the tracks: Rookie has the sprints, the Hatch Cup and the time attack; Street the Harbor
Run, the drift loop and the knockout; Pro the marathon; Elite the Grand Prix.

**Architecture**

| File | What it does |
| --- | --- |
| `src/config/races.json` | Pop-up chances and timings, rules, the racer pool, prop sizes, and the tracks: `id`, `name`, `entryFee`, `payouts` (first/second/third), `streetCred`, `laps`, `timeLimit`, `start`, `organizer`, `checkpointPositions` (one lap; the last is the finish) and `temporaryObstacles` (`type`, `x`, `z`, `rotationY`, optional `count`/`spacing` for a line of them) |
| `src/systems/streetRaceManager.js` | `StreetRaceManager`: engine-free ES module (with `.d.ts`). The state machine `IDLE -> PROMPT -> COUNTDOWN -> RACING -> CLEANUP -> RESOLVED`, the chance rolls and organiser offers, `RaceTrackInstance` (spawns props through the adapter, keeps them in a registry, disposes them in CLEANUP), checkpoints and live standings, payouts, Street Cred, and the `preRaceStars` snapshot/restore. Unit-tested in Node |
| `src/systems/RaceWorld.ts` | The 3D side: Three.js/Rapier props, checkpoint beams and rings, boost pads, NPC racer driving, organisers |
| `src/core/Game.ts` (`setupRaces`, `updateRaces`) | The adapter, busted/wasted routing, the countdown hold, HUD panel and minimap |
| `scripts/race-example.js` | Runnable integration example (`npm run race:example`) |

Hooking it into a game loop:

```js
import { StreetRaceManager } from './systems/streetRaceManager.js';
import racesConfig from './config/races.json';

const races = new StreetRaceManager({
  config: racesConfig,
  adapter: {
    spawnProp: (def, track) => handle,          // { dispose(), setState?('current'|'next'|'hidden') }
    spawnRacers: (track, gridSlots, drivers, course) => ids,
    updateRacers: (dt, { state, course, progress, standings }) => {},
    racerPosition: (id) => ({ x, z }),
    removeRacers: () => {},
    placePlayer: (slot) => true, holdPlayer: (hold) => {},
    getMoney: () => money, spend: (n) => true, earn: (n) => {},
    getWanted: () => ({ stars, heat }),
    restoreWanted: ({ stars, heat }) => {},     // clear chasers, set the level back
    respawnAt: (slot, reason) => {}, notify: (text) => {}, showBig: (text, color, ms) => {},
  },
});

function gameLoop(dt) {
  const hud = races.update(dt, { inVehicle, x, z, speed, freeRoam, dead });
  drawRaceHud(hud);
  if (keyPressed('KeyY')) races.accept();
  if (keyPressed('Backspace')) races.abort();
}
// While a race is on, the game's own fail paths go through the manager:
function onBusted() { if (races.active) return races.notifyBusted(); /* normal arrest */ }
function onWasted() { if (races.active) return races.notifyWasted(); /* normal death */ }
```

### Rivals with Streetmon

Rival racers run Streetmon in their cars too, under the same Chop Shop rules as yours (the slot
decides which types fit and what ability comes with them), and you can see them riding along.
A "brain" uses their abilities when it gets an opening on you: a smokescreen in your face when
you're on their tail (or for the speed on a straight), the backfire when you're alongside, the
bass horn when you're close, spike strips when you're lined up behind them. A rival's spike
strip gives you (or another racer) a slow puncture for a few seconds, not a wrecked race.

It all scales with the race's tier, the higher of the track's USRL division and yours
(`src/systems/rivalLoadout.ts`):

| Tier | Armed racers | Slots | Levels | Abilities | Stat boost | Reaction | Takes the opening | Cooldowns |
|---|---|---|---|---|---|---|---|---|
| 1 Rookie | about 1 in 3 | 1 | 6-12 | smokescreen, backfire, radar | 40% | 1.4 s | 45% | x1.6 |
| 2 Street | about 2 in 3 | 1 | 12-22 | + bass horn | 60% | 1.0 s | 60% | x1.35 |
| 3 Pro | all | 1-2 | 22-34 | + spike strips | 80% | 0.7 s | 75% | x1.15 |
| 4 Elite | all | 2 | 34-46 | all | 90% | 0.45 s | 90% | x1 |
| 5 Apex | all | 2-3 | 46-60 | all | full | 0.25 s | always | x0.85 |

Each racer has favourite types (`streetmon` in `races.json`), and the HUD lists who's running
what when the countdown starts.

## Wild Streetmon movement (walls and smart fleeing)

Wild Streetmon don't clip into buildings or hug walls, and when they run from you they look for a
way out instead of running straight away (and into the nearest wall).

- **Collision**: every move is swept against the walls (three parallel rays the width of the body)
  before it's applied. A move that would cross a wall stops just short of it, the velocity is
  clamped along the wall surface, and the rest of the move slides (so corners work). A creature
  found inside a wall is pushed out.
- **Wall buffer**: within 0.8 m of a wall (from the body's surface), a smooth push away from it is
  added to its steering, so it doesn't slide along walls. Wander spots are picked clear of walls.
- **Smart fleeing** (`SmartFleeBehavior`): 12 probe rays all round, each scored by how directly it
  leads away from you, how open it is (up to 5 m), and how close it is to the way it's already
  running; directions blocked inside the buffer or ending in a dead end within 2 m are penalised.
  Probes are re-cast 8 times a second (staggered between creatures). The threat follows you while
  you chase; from a car or a bang it's that spot.
- **Cornered** (every forward and side probe hits a wall within 2 m): it commits for a moment to a
  slide along the longest open ray that passes widest of you, so it skirts round you and out of a
  dead end instead of pressing into the corner.
- **What counts as a wall**: buildings, the river edge and the lake on the street; roof edges and
  big height changes on rooftops; tunnel walls in the sewers. Parked and stopped cars, roadblocks
  and race props are round obstacles.
- **Performance**: all creatures share one cached wall grid per layer (0.25 m cells in 32 x 32
  chunks, filled as creatures go near them). 30 Streetmon fleeing at once: 0.5 ms a frame for all
  the AI (about 375 rays), no measurable change in frame time against straight-away fleeing.
- **Debug view**: **F8** (or open the game with `?fleeDebug`) draws each fleeing creature's probes
  (green open, orange a wall ahead, red inside the buffer, white the chosen one), its escape
  direction (yellow), velocity (cyan), wall push (magenta), body and buffer rings (the buffer ring
  turns red when cornered) and a line to what it's fleeing.

| File | What it does |
| --- | --- |
| `src/creatures/WallProbe.ts` | `WallGrid` (chunked occupancy cache, DDA raycasts with surface normals), `CircleIndex` (round obstacles), `ObstacleField` (`ray`, `sweep`, `clear`), and the helpers `clampToWall`, `clampLength`, `moveWithCollision`, `wallRepulsion`, `rayCircle` |
| `src/creatures/SmartFlee.ts` | `SmartFleeBehavior` (`steer`, `plan`), its config `SMART_FLEE`, `newFleeMemory`, `steerWithRepulsion` |
| `src/creatures/SpawnSystem.ts` | Uses them: `move()` for every wild Streetmon, SmartFlee in the flee state, one field per layer (`fieldFor`, `resetWalls`), `obstacles` hook |
| `src/creatures/FleeDebug.ts` | The debug lines |
| `scripts/flee-example.ts` | Runnable integration example (`npm run flee:example`) |

Per frame, for each creature:

```ts
import { SmartFleeBehavior, newFleeMemory, steerWithRepulsion } from './creatures/SmartFlee';
import { ObstacleField, WallGrid, moveWithCollision, wallRepulsion } from './creatures/WallProbe';

const field = new ObstacleField(new WallGrid((x, z) => world.isWall(x, z))); // once per layer
const flee = new SmartFleeBehavior();                                        // shared

function updateCreature(c, dt) {
  let dir = c.wanderDir;
  if (c.fleeing) {
    const s = flee.steer(c, player.x, player.z, field, c.fleeMemory, dt);    // c.fleeMemory = newFleeMemory()
    dir = { x: s.dirX, z: s.dirZ };
  }
  const push = wallRepulsion(field, c.x, c.z, c.radius, 0.8);
  const v = steerWithRepulsion(dir.x, dir.z, c.speed, push.x, push.z);
  const m = moveWithCollision(field, c.x, c.z, v.vx, v.vz, dt, c.radius);
  c.vx = (m.x - c.x) / dt;
  c.vz = (m.z - c.z) / dt;
  c.x = m.x;
  c.z = m.z;
  c.mesh.position.set(c.x, groundY(c.x, c.z), c.z);
}
```

## Heists

Four jobs around the city, each with a planning spot on the sidewalk nearby (a gold ring with a
floating briefcase; purple on the minimap). Stand in the ring and press **E** to open the planning
board: pick a crew of up to three Streetmon from your party for the roles the job needs (and the
optional ones that help), then **Enter** to start.

| Job | District | Needs | Can use | Take | Getaway |
| --- | --- | --- | --- | --- | --- |
| Quik Cash Check Cashing | Uptown | Breacher | Hacker, Hauler | $1,500-2,200 (3 bags) | 2 stars |
| Diamond Row Jewelers | Midtown | Smoke | Breacher, Hauler | $5,200-6,800 (4 cases) | 3 stars |
| Armored Transport Pickup | Downtown | Breacher | Hacker, Smoke, Hauler | $6,500-8,500 (5 heavy bags), 4-minute window | 4 stars |
| First Empire Savings & Trust | Downtown | Breacher, Hacker | Smoke, Hauler | $16,000-21,000 (8 bags) | 5 stars |

**Roles** (which types can do them is in the config; stats and level make them better):

- **Breacher** (Concrete, Grind, Gun): goes to work on the vault door, truck doors or display
  cases while you stand at them (**E**). Attack makes it faster. Smashing cases without one is slow.
- **Hacker / Jammer** (Wire, Bass) **Z**: jams cameras and the alarm line for ~45 s: cameras go
  dark and breaching makes less than half the noise. The bank's vault alarm must be jammed first.
- **Smoke / Crowd Control** (Smoke, Sludge) **X**: smokes the scene: guards within ~14 m are out
  cold for ~50 s, bystanders inside can't report crimes, and the police can't see through it.
  The jewelers' guards must be smoked before you touch a case.
- **Hauler** (heavy Concrete, Grind, Bass, Gun or Sludge types, 20 kg+): carries loot bags first,
  up to its capacity (tougher, heavier Streetmon carry more), so you aren't slowed down.

**On the job**: guards patrol and cameras sweep (red fans and orange cones on the ground show what
they see). Walking past is fine; hanging round the door is suspicious; breaking in or carrying
bags in sight fills the suspicion meter fast. Breaching, smashing and gunfire fill the noise
meter. Either full sets off the alarm: the police are called after a few seconds, the getaway
gets one star hotter, and dye packs spoil 20-30% of the cash.

**Loot is heavy**: each bag weighs 3-15 kg. Whatever you carry yourself slows you on foot
(about 1% per kg over 6 kg, never below 42%; no sprinting above 28 kg). A car carries anything.

**Getaway**: leave with loot (or take the last bag) and the chase starts at the job's Wanted
Level (+1 for an alarm, + heat; the bank brings tanks). The job's lock-ups (green beams, green on
the minimap) are your drop-offs: lose the police, then stop in the bay to get paid. Optional
crew roles add 5% each. Busted or wasted, the loot is gone. Backspace walks away from a job.

Each job leaves **heat** that fades over time (about 1 per minute): every 35 heat adds a level of
security to the next jobs, every 60 a star to their getaways. A job you've hit stays on edge for
8-20 minutes. Heat, cooldowns and your record are saved.

**Architecture**

| File | What it does |
| --- | --- |
| `src/config/heists.json` | Roles (types, stat, ability keys, hauler capacity), skill and encumbrance curves, payout bonus, heat rules, phases, lock-ups, and the targets: location (facade or truck, planning spot, breach points, loot spots, guards with patrols, cameras), payout pool, bags and weight, required/optional roles, security (level, suspicion rate, alarm delay, noise limit), noise penalties (per second breaching, per case smashed, gunfire, explosions, dye-pack loss), breach mode and time, getaway stars and lock-ups, heat |
| `src/systems/heistManager.js` | `HeistManager`: engine-free ES module (+ `.d.ts`). Phases `IDLE -> PLANNING -> SETUP -> INFILTRATION -> BREACH <-> LOOT -> ESCAPE -> RESOLVED`; `plan`, `assign`/`unassign`, `validateCrew`, `launch`, `useAbility`, `startBreach`, `takeLoot`, `reportNoise`, `encumbrance`, `notifyBusted`/`notifyWasted`/`abandon`, `update(dt, ctx)`; helpers `roleFit`, `haulerCapacity`, `encumbrance`, `securityLevel`, `escapeStars`, `splitLoot`. Unit-tested |
| `src/systems/HeistWorld.ts` | The 3D side: storefronts, vault doors, display cases, the armored truck, planning spots, guards and cameras (and what they see), the crew following you and working, loot bags (on your back and the hauler's), lock-ups |
| `src/ui/HeistMenu.ts` | The planning board |
| `src/core/Game.ts` (`setupHeists`, `heistKeys`, `updateHeists`) | The adapter, keys, panel, speed, music, busted/wasted |
| `scripts/heist-example.ts` | Runnable integration example (`npm run heist:example`) |

## Street events

Every **8-12 minutes** of free roam (the first one 2.5-4.5 minutes in) something kicks off somewhere
in the city: an announcement, a panel under the Wanted stars (objective, distance, time left) and
an icon on the minimap and the city map (**M**, layer "Street events"). One event at a time; the
timer only runs on the street and the rooftops, and waits while you're in a heist, a race, a battle
or at 3+ stars. Ignore it and it times out.

| Event | Type | Where | Street Cred needed | Police when you get involved | Reward |
| --- | --- | --- | --- | --- | --- |
| Armored Cash Run | Armored truck | Bank depot to depot | 0 | 2 stars | Cash bundles + $400-800, cred, 20% upgrade chip |
| Gold Bullion Convoy | Armored truck (3 guards) | Bank depot to depot | 120 | 3 stars | Bundles + $1,500-2,500, capture pod 50%, chip |
| Alley Outbreak | Turf outbreak | A back alley | 0 | none (3-minute lockdown) | $300-600, capture pod 70%, lure 35% |
| Turf Outbreak | Turf outbreak (6-8, higher level) | A city block | 40 | none (lockdown 3:20) | $500-1,000, capture pod 85%, chip 15% |
| Rooftop Supply Drop | Supply crate | A rooftop | 0 | 2 stars | $300-600, capture pod, chip 60% |
| Gang Supply Drop | Supply crate, 3 scavengers | Street or alley | 20 | 2 stars | $300-700, capture pod, cuffs, chip 50% |
| Military Airdrop | Supply crate, 4 scavengers | Anywhere | 100 | 3 stars | $800-1,500, capture pod, cage, chip |

- **Armored truck**: an armoured van with guards drives a real road route between two bank depots
  (the beacon on its roof flashes). Disable it before it reaches the vault: ram it, blow it up, use
  a tuned car's abilities, or send your Streetmon (**summoned follower attacks it**; claws ignore
  most of the plating). Guns don't hurt cars in this game, so bullets won't do it. At 35% it stops:
  the rear doors open, cash bundles spill out (burnt and scattered if you blew it up) and the
  guards bail out shooting. Grab the bundles within 70 s (walk over them, or drive over them).
- **Turf outbreak**: a swarm of aggressive wild Streetmon inside a pulsing red ring. Battle, catch
  or scare off every one before the police lock the area down. Pays **regional Street Cred** for
  the district.
- **Supply drop**: a crate parachutes down with a smoke flare (watch for the smoke column). Get to
  it on foot, press **E** and stay close for 2.5 s to open it. Scavengers run in to pry it open
  first (6 s; knock them down, and watch out, they hit back), police parked on it for 4 s confiscate it, and a rival crew turns up after a
  few minutes. Rooftop crates are reached by the roof access points.
- **Rewards**: cash, Street Cred, regional cred per district, items (the new **Capture Pod**, x3
  catch rate, only found here) and **upgrade chips**: each chip gives every car you drive +3% top
  speed, +5% acceleration and +10% durability (up to 5 chips). Regional cred, chips, the timer and
  your record are saved.
- **Back alleys**: the city now has six 6 m service lanes cut through blocks (two per district,
  away from heist and race locations). Outbreaks and drops use them; you can walk and drive them.
- **Cleanup**: when an event ends (done or timed out) it lingers 8 s, then everything it put in the
  world goes: the truck and its guards (unless you're driving it), bundles, the crate, parachute,
  flare and smoke, scavengers, and event Streetmon you aren't battling.

**Architecture**

| File | What it does |
| --- | --- |
| `src/config/street_events.json` | `schedule` (interval, first event, retry, max active, spawn distance, linger, layers), `upgradeChips`, `events` (`id`, `eventType`, `name`, `announce`, `spawnWeight`, `durationSeconds`, `cooldownSeconds`, `requiredStreetCred`, `policeStarsOnTrigger`, `zoneLayers`, `rewards` {cash range, streetCred, regionalCred, items with chances, upgradeChips} and per-type tuning `truck` / `lockdownSeconds` + `swarm` / `drop`), `zones` (`street`, `roof` with roof height, `alley` with half-length, `depots`) |
| `src/systems/streetEventManager.js` | `StreetEventManager`: engine-free ES module (+ `.d.ts`). Lifecycle `SPAWNING -> ACTIVE -> COMPLETED / EXPIRED -> CLEANUP`; schedule, eligibility (Street Cred, cooldowns, zones in range), weighted pick, `start`, `update(dt, ctx)`, police hook (`raiseWanted` on first engagement), rewards, `abort` / `clear`, `hud`, `markers`, `serialize` / `load`; `validateEventConfig`. Events `state`, `spawned`, `engaged`, `resolved`. Unit-tested |
| `src/systems/EventWorld.ts` | The 3D side: the armoured truck (route driving, plates, beacon, guards, bundles), swarms and their ring, the crate (parachute, flare, smoke), scavengers, police confiscation, and cleanup |
| `src/world/Alleys.ts` | Cuts the back alleys into the layout (deterministic) |
| `scripts/gen-event-zones.ts` | Regenerates `zones` from the real city layout |
| `src/core/Game.ts` (`setupStreetEvents`, `updateStreetEvents`, `applyChips`, `renderEventHud`) | The adapter, busy rules, E to open crates, panel, markers, saving |
| `scripts/street-events-example.ts` | Runnable integration example (`npm run events:example`) |

## The living world

The street now runs without you: people hunt and catch Streetmon, chat with each other, wild
Streetmon fight over turf, roam in packs and scatter from speeding cars and explosions, and the
aggressive ones come after you. All of it is tuned in `src/config/living_world.json`.

- **NPC hunters**: every so often a passer-by near you goes hunting. They walk their normal route
  until they spot a free wild Streetmon (`SEARCHING`), call it out ("Ooh, a Cinderblock!"), walk
  over and send out their own (`BATTLING`): the two trade attacks with the real battle formula and
  type chart, with tracers, glowing shots, shockwaves and smoke, damage numbers and an HP bar over
  each. Below 35% HP they throw a net, crate or cage (`CATCHING`): it shakes up to three times
  (the game's catch roll), then it's caught or it breaks free (three pods, then it escapes). If
  their Streetmon faints they run (`FLEEING`). Battling the same creature yourself takes it
  ("Hey, that was mine!"); a car, gunfire or an explosion breaks it up. Caught Streetmon become
  bragging material for the chatter.
- **Chatter**: two people walking past each other within 3 m sometimes stop and talk: tips (from
  the real type chart: "Concrete types wreck Gun types"), the racing league (real tracks and
  racers), bragging about catches the hunters really made (species, level, street), local news.
  Lines are speech bubbles over their heads that fade in and out and with distance from the
  camera (only the nearest ten show).
- **Territory fights**: wild Streetmon of rival types (`territory.rivalries`: Gun vs Concrete,
  Smoke vs Bass, Concrete vs Bass, Gun vs Grind, Grind vs Smoke, Wire vs Sludge) that see each
  other within 13 m square up on their own, with the same FX and bars. The loser runs below 30%;
  the winner claims the spot. Both keep their damage, so a beaten-up survivor is an easier catch.
  Walking up (5 m), a fast car or an explosion breaks it up.
- **Packs**: a third of common and uncommon wanderers and aggressive species spawn with one or
  two followers of the same species. Followers wander around the leader, catch up when left
  behind, run when it runs, and if any of them goes for you the whole pack does. When the leader
  goes, the next in line leads.
- **Fleeing**: a car bearing down at speed is noticed from further away (0.2 m per km/h, up to
  20 m, inside its path), and heavy explosions (car blasts, tank shells) send every wild
  Streetmon within 40 m running, whole packs at once.
- **Aggressive Streetmon attack you**: only the species that were already aggressive (Rebarb,
  Strapback, Woofer...), and only in the Park, on the roofs and in the sewers (or after you've hurt one). Instead of forcing a battle when they reach you, they chase and bite:
  3 + 0.16 per level damage every 1.1-1.7 s (Gun and Concrete types hit harder), with a red flash
  and a warning. They only stop if you **get 36 m away**, **stay out of sight for 3 s** (behind
  a building, or in a car: they can't bite you in one), or **battle them (B)**. Afterwards they
  leave you alone for 50 s. (`aggro.autoBattle: true` brings back the old battle-on-contact.)
- **AI radius**: people and wild Streetmon within 80 m of you get their full behaviour; beyond
  that the crowd is moved every 3rd frame and wild ones every 4th, position only (no wall probes,
  car checks or noticing you), and hunts out there are settled without FX. With 55 people about
  this cuts the crowd's update from about 0.8 ms to 0.3 ms a frame; the living world itself costs
  under 0.1 ms.

**Architecture**

| File | What it does |
| --- | --- |
| `src/config/living_world.json` | `lod` (AI radius, light-tick rates, FX radius), `hunters`, `chatter`, `bubbles`, `territory` (rivalries), `packs`, `threats`, `aggro`, and all the lines (hunter calls, chatter by topic with `{placeholders}`) |
| `src/systems/livingCore.js` | Engine-free pieces: `SpatialGrid` (radius and pair queries), `ambientHit` (battle formula + type chart), `isRival`, `fillLine` (+ `.d.ts`) |
| `src/systems/npcLife.js` | `NpcLifeManager`: the hunter state machine (`SEARCHING -> BATTLING -> CATCHING / FLEEING -> DONE`) and chatter; engine-free, acts through an adapter (+ `.d.ts`). Unit-tested |
| `src/systems/wildInteractions.js` | `WildInteractionManager`: territory fights (`CLOSING -> FIGHTING -> resolved / broken`), packs, threats (cars, explosions); engine-free (+ `.d.ts`). Unit-tested |
| `src/systems/LivingWorld.ts` | Binds both to the crowd and the wild Streetmon and draws it: hunters' Streetmon, pods, attack FX, bubbles and bars; sets the AI radius |
| `src/ui/Overhead.ts` | `SpeechBubbles` and `HealthBars`: canvas sprites over heads, distance fade |
| `src/creatures/SpawnSystem.ts` | Held / scripted creatures, the `attack` state (chase, bite, give up), the light tier |
| `src/peds/PedestrianSystem.ts` | The `script` state (people borrowed for a hunt or a chat), the light tier |
| `src/core/Game.ts` (`setupLivingWorld`, `onWildBite`) | Wiring, bites, explosions, taking over a creature |
| `scripts/living-world-example.ts` | Runnable integration example (`npm run living:example`) |

## Opening and Act I: Mama's Welcome

A new game opens with the **wardrobe** (make your character), then a **cinematic** over the city
(skippable with Space, Enter or Esc), then a short **story card** (*The Night Bus*: why you're in
Empire City and who Mama Rust is). You start round the corner from her Chop Shop, on the avenue
sidewalk east of the park, with no Streetmon, no cuffs and no car, and walk to her: a waypoint is
set and yellow arrows on the road, a beam of light over her shop and a compass at the top of the
screen show the way.

1. **Talk to Mama (E).** She explains catching: weaken a wild Streetmon with your own, then throw
   cuffs (in a battle: 3 Bag; outside one: face it and press C). She hands over **5 Cuffs**.
2. **Pick your partner** from her back room: Cinderblock (Concrete), Strapback (Gun) or Subsonic
   (Bass).
3. **Catch one wild Streetmon** with it (any species, anywhere) and **go back to her.** She pays
   $150, 1 Street Cred and 3 more Cuffs, and a short cinematic shows the Chop Shop lift.
4. The story carries on with **Grease Monkey**: Mama gives you your **first car**, the
   primer-grey **Rustbucket Hatch** at the kerb in front of the shop (slow and fragile: a car to
   mod). Drive it onto the lift, press E and slot one of your two Streetmon into it. If it gets
   wrecked or left behind while that job is on, it's back at the kerb when you return.

Until you've accepted her welcome, clinics leave cuffs, nets and crates off the counter. Older
saves that already have a team skip the welcome (it's marked done, no rewards).

This is the quest `a1-welcome` in `campaign_quests.json`. Quests can now hand things over when you
accept them: `onAccept: { items: [[id, n]], chooseStarter: true }` (the items are given by the
quest manager; the game opens the starter pick when the conversation closes).

## Cinematics

Cinematics introduce the game and move the story on. The city carries on around the camera
(traffic, people, Streetmon), the player waits, the HUD hides, and black bars, captions and fades
frame it. **Space, Enter or Esc** skips; the pause menu has **Watch intro**.

| Cinematic | When | Shots |
| --- | --- | --- |
| `intro` (40 s) | A new game | The skyline ("Empire Streets"), Streetmon in the park, a street race, a police chase (crime), a legendary in the street, then Mama Rust's Chop Shop |
| `chop-shop` | You finish Mama's welcome | A cab rolling onto the lift outside the shop |
| `act2` - `act5` | An act starts | The act's title over its world: a race uptown, the bank from above, a police convoy, the Grand Prix |
| `boss-intro` | You walk up to a District Boss the first time | A slow orbit round them with their name and title, then their challenge |
| `raid-arrive` | A legendary turns up (once per legendary) | Its name, the camera circling it, the ground shaking |

Each plays once per save (saved in `cinematics`); old saves count the intro and the acts they've
reached as seen. Queued ones wait for a quiet moment (no battle, race, heist, dialogue, menu or
layer change).

**Architecture**

| File | What it does |
| --- | --- |
| `src/config/cinematics.json` | `settings` (letterbox, caption and black fades), fixed `anchors` ([x, z]), and `cinematics`: `trigger` (`newGame`, `actStarted`, `questStarted`, `questCompleted`, `bossIntro`, `raidArrive`), `once`, `skippable`, and `shots`: an anchor (fixed, or the game's `player`, `mama`, `chop`, `bank`, `boss`, `raid`), `seconds`, camera `cam` + `look` offsets (start and end, eased) or an `orbit`, `orient` (turn with the anchor's heading), `fade`, `caption` / `sub` (with `{name}` / `{title}`), `shake`, and `actors` (Streetmon by species and clip, cars by spec, colour and siren, each moving from `from` to `to`) |
| `src/systems/cinematics.js` | Engine-free rules (+ `.d.ts`), unit-tested: `validateCinematics`, `cinematicFor` (the one for an event, once only), `CinematicPlayer` (shots, events, eased poses, orbits, oriented offsets, captions, fades, actor paths, skipping) |
| `src/cinematics/CinematicView.ts` | Drives the camera, draws the letterbox, captions and black, places the actors (Streetmon models, car bodies with turning wheels and flashing light bars) and hides traffic that would drive through them |
| `src/core/Game.ts` (`playCinematic`, `queueCinematic`, `cineTick`, `cineAnchor`) | The `cinematic` state, triggers, anchors, the world tick around the camera, saving |

## The campaign: Underground Streetmon Racing League

Alongside free roam there's a story to follow. The **Underground Streetmon Racing League (USRL)**
rules the streets: race cars are powered and tuned by slotted Streetmon, and the bosses use the
League to run heists and control turf. It's five acts of jobs from people around the city; a
yellow **M** over someone's head (and on the minimap and city map) means they have a job for you.
Walk up and press **E** to talk; answer with **1-4**.

| Act | Where | What happens |
| --- | --- | --- |
| I. The Chop Shop Rookie | The industrial Waterfront and Mama Rust's Chop Shop (Midtown) | Mama Rust's welcome (cuffs, your first Streetmon, your first catch), learn to tune (slot a Streetmon), a timed courier run between the West Ave and East Ave docks, the Quik Cash job, then beat **Dockside Dutch**, the Waterfront's District Boss, for a **League Pass** |
| II. High-Octane Turf | Downtown and the avenues | Win a league race, catch a Bass type and beat **Haze** (Smoke Syndicate), catch a Concrete type and beat **Subwoofer Sal** (Bassline Cartel), win the Harbor Run |
| III. The Vault Hijack | The commercial and financial blocks (Midtown, Downtown) | Diamond Row, the armored transport, then the First Empire vault, for the money behind late-game tuning and Grand Prix buy-ins. Reward: the legendary **Vault Queen** |
| IV. Police Lockdown & Underground War | Citywide | Survive a 5-star crackdown (tanks included), win the Harbor Run at night through police roadblocks (3 stars), beat **Captain Hale** and the police tactical unit |
| V. The Apex Grand Prix & Syndicate Showdown | Citywide | Qualify (120 Street Cred, two Streetmon slotted in one car), pay the $2,500 buy-in, win three stages (the last with the police on you), lose the pursuit, then beat **Commissioner Varga**. Reward: the legendary **Apex** |

(The city's districts are Uptown, Midtown, Downtown, the Waterfront and Central Green, so the
story's "Industrial District" is the Waterfront docks and the "Financial Hub" is the Midtown and
Downtown blocks with the jewelers and the bank.)

- **Objectives**: `REACH_MARKER` (a yellow beacon and a ring on the ground; some need a car, some
  are timed), `WIN_RACE` (a track or any, a place, at night, with police), `COMPLETE_HEIST`,
  `CATCH_STREETMON` (by species, type, district, level), `DEFEAT_BOSS` (a red skull: walk up,
  E, then a team battle), `REACH_STREET_CRED`, and three the story needed: `TALK_TO`,
  `ESCAPE_WANTED` (the stars go up; lose them, and don't get busted) and `TUNE_VEHICLE`.
- **The tracker** (top right): the act, the job, the current objective, steps and any timer.
  **J** switches between active jobs. A failed job (out of time, busted in a crackdown) can be
  picked up again from whoever gave it.
- **Rewards**: cash, Street Cred, items, **tuning blueprints** (permanent upgrades on every car
  you drive: Cold Air Intake, Drift Differential, Vault-Grade Turbo, Tactical Roll Cage, Apex Aero
  Kit, on top of the street-event upgrade chips) and **legendary Streetmon** (shiny, high level,
  named).
- **The league** (`racing_league.json`): your division is the highest whose requirements you
  meet. Rookie (anyone), Street (20 Street Cred and a League Pass), Pro (60, Haze and Sal beaten),
  Elite (110, Captain Hale beaten), Apex Champions (150, the story finished). Your division
  sets the **entry fee** charged when you accept a race ($0-2,000) and a **prize money
  multiplier** (up to x2), and opens tracks: the Harbor Run is a Street Division race.

**Difficulty and pacing** (the campaign playthrough, 1 November 2026). Every job was played
through to the end, and the boss teams were set against the team a player actually has by then,
without grinding:

| Boss | Team | You'll have about | A sensible team at that level wins |
| --- | --- | --- | --- |
| Dockside Dutch | Doubleshift 6, Rebarb 8 | two Streetmon around Lv 10 | about 3 times in 4 |
| Haze | Hazeling 10, Flue 11, Backfire 13 | three around Lv 13 | about 7 in 10 |
| Subwoofer Sal | Subsonic 13, Streetlamp 14, Woofer 16, Wirewhip 17 | four around Lv 16 | about 3 in 4 |
| Captain Hale | Strapback 21, Holster 23, Hardcase 24, Overwatch 25 | four around Lv 20, plus the Vault Queen (Lv 22) | about 2 in 3 |
| Commissioner Varga | Moldmother 19, Overtime 20, Overpass 21, Ratking 22, Holster 25 | five or six around Lv 24 | about half (two levels more: 9 in 10) |

- **The city grows with you** (`STORY_LEVEL_BONUS` in `src/creatures/SpawnRules.ts`): wild
  Streetmon gain 3, 6, 10, 14 levels as you finish Acts I to IV, so there's always something
  worth fighting at your level. Before Act I is done, wild ones never outlevel your strongest
  Streetmon, and species that only live far above your level stay away.
- **Scouting**: a boss's intro lists their team (species, level, types) and how many of yours can
  fight, so you can catch the right counter first. Streetmon slotted into a car ride with the car,
  not in your team: pull them out at the lift before a boss if you need them.
- **Fights always finish**: the battle AI never picks a stat move that's already at its +6 / -6
  limit, and a damaging move always beats a pointless buff, so two walled-up Concrete types no
  longer brace at each other forever (that one could soft-lock a boss fight).
- **The first heist** (Quik Cash) is gentler: guards and cameras grow suspicious more slowly
  (0.3) and the getaway starts at one star (two if the alarm went off), so it's escapable by car.
- The Vault Queen joins at Lv 22 (it was 32, which made Captain Hale a walkover). Dre, the first
  street trainer, moved to the far corner of his block, out of Commissioner Varga's way.

**Architecture**

| File | What it does |
| --- | --- |
| `src/config/campaign_quests.json` | `acts` (number, title, region, quests), `npcs` (mission givers: look, corner), `bosses` (look, corner, team, lines), `blueprints`, `legendaries`, and `quests`: giver, prerequisites (quests, flags, Street Cred, division), objectives, rewards, `turnIn`, `cost`, and the dialogue tree (`offer` / `active` / `turnIn` nodes; choices lead to nodes or `accept`, `complete`, `end`) |
| `src/config/racing_league.json` | Crews, divisions (requirements, entry fee, payout multiplier, tracks), the Grand Prix stages |
| `src/systems/questManager.js` | `QuestManager`: engine-free (+ `.d.ts`). `activeQuests`, `completedQuests`, `storyFlags`, objectives per quest; `talk` / `choose` (dialogue), `accept`, `complete`, `notify` (races, heists, catches, bosses, talks, arrests), `update` (markers reached, Street Cred, stars, tuning, timers), the reward engine, `markers`, `hud`, league `divisionFor` / `raceRules`, `serialize` / `load`; `validateCampaign`, `validateLeague`. Events: `offer`, `started`, `objective`, `progress`, `objectiveDone`, `ready`, `completed`, `failed`, `reward`, `flag`, `actStarted`, `actCompleted`, `rank`. Unit-tested with a full playthrough |
| `src/systems/CampaignWorld.ts` | The givers and bosses on their corners with their icons, the objective beacon and ring |
| `src/core/Game.ts` (`setupCampaign`, `updateCampaign`, `campaignTalk`, `startBossBattle`) | The adapter, the hooks into races / heists / catches / battles / arrests, league fees and bonuses, dialogue, tracker, markers, saving |
| `scripts/campaign-example.ts` | Runnable integration example: plays Act I (`npm run campaign:example`) |

## Tutorials

Every mechanic is taught by a short tip card the first time it comes up: right before you use it
(next to your first car, your first wild Streetmon, a manhole, a heist board) or the moment it
happens (your first battle, first stars, getting busted, an evolution). The campaign teaches as it
goes too: each job's objective asks for the tip it needs (the Chop Shop for Grease Monkey,
timed deliveries for the Courier Run, heists for Small Time, bosses for Dockside Dutch, the
league, hunting a type, shaking a crackdown, Street Cred).

- **The onboarding chain** on a new game: *On foot* (move, look, sprint, jump, walk quietly) ->
  *Taking a car* -> *Driving* -> *The map and your first job* (open the map, click the M for a
  waypoint, drive there, talk). Tips that come up too early wait for the ones before them.
- **Practice steps** tick off when you do them (a green tick on the card); the card closes
  itself when they're done. Things you already did don't need telling: those steps start
  ticked, and a card that's all practice you've done is skipped.
- **Reading cards** close after a reading time, or with **Enter** / **Got it**.
- **Only while it's true**: a tip about a situation (a car within reach, three stars, a wild
  Streetmon nearby) only comes up while that's still the case, so you never get the heat tip
  after you've lost the stars. Tips for events (busted, a battle starting) and the campaign's
  come up as soon as there's room.
- **Outgrown tips are dropped**: the manhole tip once you've been down the sewers, the heist tip
  once you've planned one, the race tip once you've raced (`skipOn`).
- **One at a time**, highest priority first (getting bitten or busted beats a tip about night
  time), and only where it fits: battle tips during battles, menu tips over the Chop Shop and the
  heist board, street tips on the street. A street tip that's up when a battle starts steps
  aside and comes back afterwards. Urgent tips, and ones far more important than the card on screen (wanted over a tip about night
  time), cut in front of it: catch it now
  (the foe is weak), you're bitten, fighting free of an arrest, a trainer's challenge, an
  evolution.
- **Pause menu**: *Tips: on/off*, and *Tutorials*: every tip by category; click one to see it
  again (dashed ones haven't come up in your game yet).
- Saved with your game. A new game starts the tips over; a save from before tutorials existed
  skips the getting-around chain (and the Streetmon basics if you've caught more than your
  starter).

| Category | Tips |
| --- | --- |
| Getting around | On foot, Taking a car, Driving, Upside down, A police car, The map and your first job, Wasted, Saving |
| Streetmon | Wild Streetmon, Catching, Your team, The stash, Evolution, Healing up, Bitten!, Legendary raids, Catching a legendary |
| Battles | Battles (turn-based), Real-time battles, Types, Gang trainers, Raid battles |
| Weapons | Weapons |
| The law | Wanted, Turning up the heat, Fighting free, Busted, The impound, Setting your Streetmon on people |
| The city | Hardline Arms, Night, Manholes, The sewers, Up to the roofs, The rooftops |
| The story | Talking and taking jobs, Jobs, Against the clock, Bosses, The USRL, Hunting a type, Shaking a crackdown, Street Cred |
| Street life | The Underground Chop Shop, Tuning, A tuned car, Street races, Racing, Heists, Planning the job, On the job, Heavy bags, Street events, The city's other trainers |

**Architecture**

| File | What it does |
| --- | --- |
| `src/config/tutorials.json` | The tips: `id`, `category`, `title`, `intro`, `steps` (text with `{Key}` key caps; `do` makes a step practice), `trigger` (an event, with conditions: `{ "on": "wanted", "if": { "stars": { "gte": 3 } } }`), `after`, `where` (play / battle / menu / any), `priority`, `interrupt`, `skipOn`, `keep`, `seconds`. Also `events` and `actions` (every event the game fires and every practice action it reports, for validation), `situations` (the events re-checked continuously, whose tips only show while still true) and the timing `settings` |
| `src/systems/tutorialManager.js` | `TutorialManager`: engine-free (+ `.d.ts`). `fire(event, data)` (situations and events), `request(id)` (the campaign), `action(name)` (practice), `update(dt, { where })`, `dismiss`, `replay`, `setEnabled`, `list`, `serialize` / `load`; `validateTutorials`. Events: `show`, `step`, `hide`, `close` |
| `src/ui/TutorialCard.ts` | The card (right side; higher up in battles, lower over menus) |
| `src/core/Game.ts` (`setupTutorials`, `updateTutorials`) | Situations scanned 4x a second, event hooks (battles, catches, evolution, wanted, busted, wasted, bites, trainers, races, heists, the Chop Shop, the campaign's objectives), practice actions from the keys, Enter to close, saving |
| `src/config/campaign_quests.json` | `tutorial` on an objective: the tip to show when it starts |

Adding a tip: add it to `tutorials.json` with a `trigger` (one of the `events`) or reference it
from a campaign objective's `tutorial`. A new situation: fire it from `updateTutorials` (or a
hook) and add it to `events`. The unit tests check every control key is taught somewhere and
every event is used.

## Move effects and sounds

Every Streetmon move has its own look and sound, in battles and in the street (NPC hunts, turf
fights, raid trainers). Nothing is hand-animated per move: `src/config/move_fx.json` describes a
look per **type** (Gun: tracer shots; Concrete: slams and rubble; Grind: dashes with a trail;
Smoke: clouds; Bass: shock rings; Wire: lightning bolts; Sludge: arcing splashes), per **status
kind** (buffs, debuffs, heals, veils, broken glass, reload, choking), and overrides for moves
that deserve more (the signatures and the legendaries' moves). `moveFxPlan.js` merges them into a
plan: style, colour, how many projectiles (multi-hit moves fire several), size from the move's
power, travel time, the impact, melee lunges, camera shake, the cast and hit sounds.

- **20 styles**: shot, burst, tracer, beam, bolt, orb, slam, dash, drop, wave, ring, cloud, veil,
  splash, spray, spores, buff, heal, glass, reload. Melee moves lunge in (a short run at the
  target and back, a spin for some); area moves hit every foe; self moves play on the user.
- **Impacts** grow with the hit: critical and super-effective hits are bigger, brighter and
  heavier-sounding (with a flash and a shake), resisted ones are dull and small. Damage numbers
  float up from the target.
- **Sounds are synthesised** like the rest of the game's audio (`Audio.moveSfx`): gunfire
  variants, whooshes, slams, crumbling rubble, zaps and beam hums, bass thumps and drops, hissing
  smoke, wet splashes, chimes, glass, and the legendaries' roars, stomps and quakes. They fade
  with distance and get lower for bigger moves.
- **Budget**: at most 80 live effect pieces (shared geometry, pooled), so a big fight doesn't
  slow the game; far-off street fights skip the effects and just apply the hit.

## Battles that fit the street (no clipping)

A battle used to put the two Streetmon on a straight line from you towards the foe, which could
put one inside a wall, a parked car or a lamp post. The arena (`src/creatures/Arena.ts`) is now
laid out where everything fits: each mark, the gap between the two sides, and the camera all have
to be on open ground for the layer you're on (pavement and road on the street, the roof surface
up top, the tunnel floor underground), clear of cars and street props. It tries the natural line
first, then turns it (up to 180 degrees), then tightens it, then shifts it, and takes the first
layout with no problems (or the least bad one in a tight spot). Raid battles lay out room for
your Streetmon and the trainers' side by side. NPC hunters' Streetmon also come out on the
nearest clear spot.

## Destructible streets

Lamp posts, fire hydrants, street trees, park trees, trash cans, newspaper boxes, benches and
mailboxes (about 2,500 of them) can be broken: by cars, explosions, gunfire, Streetmon moves and
legendary stomps.

- **Breakaway props**: a car fast enough snaps a prop off and loses a little speed (a lamp post
  at 38 km/h or more keeps 86% of it); slower, it's a solid post as before. Each kind has its
  break speed, how much it slows you and how much it dents the car.
- **Explosions** flatten what's around them (falling off with distance) and scorch the road.
  **Gunfire** chips at props (plastic gives in a couple of shots, steel takes a magazine) and
  leaves bullet holes on walls. **Moves** that land at street level knock over what's next to
  the target; legendary signatures and stomps wreck a wide area and crack the ground.
- **What breaking looks like**: the prop is swapped for a few pieces with a physics push. Lamp
  posts topple, trees fall with a shower of leaves, hydrant tops pop off and the hydrant gushes
  water for a while, cans spill litter, newspaper boxes burst into paper, benches split. Each
  material has its own sound (a steel clang, a sheet-metal clatter, a wood crack, a plastic pop).
- **Budget**: at most 70 debris pieces at once (the oldest go first); pieces settle, then shrink
  away after 9-15 s. Debris collides with the ground, buildings and cars, but not you.
- **Repairs**: a broken prop is put back once it's been down 2.5 minutes, you're more than 70 m
  away and it's out of view, so the city never stays wrecked and you never see it pop back.
- **Battles and props**: intact props count as obstacles when a battle is laid out; broken ones
  don't.

How it's done, and why: games don't fracture props at runtime; they use **damage states with
pre-made pieces** (intact, then broken pieces with physics), a **hard cap and pooling** for
debris, **simple colliders**, pieces that **sleep and despawn** once settled, **decals** for
surface damage (bullet holes, scorch marks, cracks) rather than new geometry, **breakaway**
behaviour for street furniture at speed, and **world repair out of sight**. Runtime Voronoi
fracture (as in the three-pinata library) and full structural destruction (Red Faction's
Geo-Mod) were considered and left out: too costly for thousands of props in a browser, and
buildings stay standing so streets stay readable.

Sources: [How games do destruction](https://algieg.prose.sh/How_Games_Do_Destruction),
[Destructible environments: performance](https://bugnet.io), [Geo-Mod 2.0 (Red Faction wiki)](https://redfaction.fandom.com/wiki/Geo-Mod_2.0),
[three-pinata (Voronoi fracture for three.js)](https://github.com/dgreenheck/three-pinata).

| File | What it does |
| --- | --- |
| `src/config/destructibles.json` | Kinds (HP, material, footprint, break speed, car slow-down and damage, debris type), materials (damage multipliers per source, sound), damage (explosion reach, move and stomp damage), debris and repair settings, decal caps |
| `src/systems/destruction.js` | `DestructionManager` (engine-free, + `.d.ts`): a grid of props, `hit`, `carSweep` (breakaway), `area` / `explosion` / `move` / `stomp`, `update` (repairs), events `break` / `damage` / `repair` |
| `src/systems/DestructionWorld.ts` | Takes over the city's lamps, hydrants and trees, builds the small props, hides and restores instances, colliders on and off, debris bodies, hydrant water, sounds; car sweeps before each physics step, bullet hits |
| `src/world/StreetProps.ts` | Where the cans, boxes, benches and mailboxes go (deterministic; clear of corners, ramps and other furniture) |
| `src/fx/Decals.ts` | Bullet holes, scorch marks and cracks (instanced ring buffers) |

## Legendary raids

Three legendary Streetmon, each its own species with a signature move set. In a raid they're
**huge**: drawn 2.1x their size on the street (about 7-8 m tall), 1.6x on a roof and life-size in
the sewers (they have to fit under the tunnel roof), with the battle camera pulled back to match.
Guns and fists barely scratch them: weapon damage is a fifth of what it does to other Streetmon.
Taking one on plays **Leash the Beast**.

| Legendary | Type | Where and how |
| --- | --- | --- |
| **Gridlock** | Concrete / Grind | Rare: Midtown or Downtown streets by day or dusk. Every car alarm on the block goes off first |
| **Blackout** | Wire / Smoke | Rare: Uptown or Midtown streets at night. The street lamps flicker block by block first |
| **Undertow** | Sludge / Bass | Quest: *The Deep Hum* from Gus in the Midtown Under-Station (reputation 10). Once beaten there, it can turn up again in the tunnels if it got away |

- **The rare roll**: once a minute, if you're in the right place at the right time with a team
  strong enough (your best at Lv 14 or more), there's a small chance (3-4%) one turns up. One
  raid at a time; each has a 25-minute cooldown after it leaves.
- **The rampage**: an omen first (20 s), then it arrives near you and rampages for 7 minutes,
  roaming around and **stomping** every 7-11 s: a shock ring, a roar or quake, cracked ground,
  street props flattened, **every wild Streetmon in reach knocked out**, people thrown off their
  feet (they get up and run), cars shoved and dented, and you knocked back and hurt if you're on
  foot inside the ring. Cars that ram it crumple and bounce off. It can't be scared off, knocked
  flying, shot down or caught while it's rampaging.
- **Trainers join you**: two or three trainers come running, send out their Streetmon and attack
  it from range, wearing its HP down (to 35% at most: the finish is yours). It swats back at
  their Streetmon with its signature moves; one that's knocked out sends its trainer home.
- **The fight**: walk up and press **B**. Your team (one out at a time, as usual) and the
  trainers' Streetmon that are still standing (out beside yours, picking their own moves) against
  the legendary. It **acts twice as often** (twice a turn in turn-based battles) and has 1.5x HP; each hit is toned down (60%) so it's
  relentless rather than an instant wipe. Its level follows your team (your best + 2). It can't
  be caught mid-fight. **Lose or run and it keeps the damage**, and the rampage clock (paused
  while you fight) carries on, so you can heal up and go again. Balance, from the tests (a Lv 25
  team plus two trainers): about 20-25% wins from full HP, about 90% once it's worn down.
- **Subdued**: beat it and it slumps for 50 s. Face it and throw capture items (**C**); your odds
  get a 1.6x bonus, and the usual pity rules apply. Caught, it joins your team (its raid HP boost
  dropped). Not caught in time, it escapes (and heals a little).
- **On screen**: a boss bar under the HUD (HP, what it's doing, time left, how many trainers are
  fighting), a marker on the minimap and the city map, the boss music while it's near, and three
  tips (the raid, the raid battle, the catch window).
- Saved: which you've caught, cooldowns, how often each was beaten and got away. A raid in
  progress isn't saved (it's gone when you load).

| File | What it does |
| --- | --- |
| `src/config/legendaries.json` | Settings (rare check, team level gate, omen / rampage / subdued times, cooldowns, level and HP scaling, actions per turn, damage scale, stomp numbers, roaming, the trainers, catch bonus) and the three legendaries (species, rare and quest triggers, texts, colour) |
| `src/systems/raidManager.js` | `RaidManager` (engine-free, + `.d.ts`): `update` (rare rolls, timers), `trigger`, `engage` / `disengage`, `chip`, `caught`, `escape` / `abandon`, `save` / `load`; `validateRaids` |
| `src/systems/RaidWorld.ts` | The legendary in the world (held by the raid), roaming, stomps and what they hit, the trainers and their Streetmon, the boss bar, map markers |
| `src/creatures/BattleEngine.ts` | `allies` (AI Streetmon on your side, no XP, never asked to switch), `foeActions`, `foeDamage` |
| `src/creatures/BattleController.ts` | `startRaid` (layout with room for everyone, camera pulled back for the big foe and kept under tunnel ceilings, "subdued" instead of "fainted") |
| `src/creatures/models/LegendBuilders.ts` | The three models |
| `src/data/creatures.json`, `moves.json`, `streetmondex.json` | The species (rarity `legendary`, never spawns on its own), their nine moves, dex entries |
| `src/data/quests.json`, `npcs.json`, `src/npc/Quests.ts` | *The Deep Hum* (a new `raid` step type) and Gus |

## Your character (the wardrobe)

A new game opens on **Who are you?**: the camera turns to face you beside Mama Rust's shop, with a
panel of options; every change shows on you straight away. Change it any time from the pause menu
(**Character**), on foot and outside a fight, race or job.

- **Body**: masculine or feminine build, height (166-194 cm), 7 skin tones.
- **Hair**: short, long, bun, ponytail or shaved; 10 colours; moustache, goatee or beard.
- **Clothes**: top, open jacket (or none), trousers or skirt, and shoes, from a 14-colour palette.
- **Extras**: cap, beanie or fedora (any colour), shades.
- **Outfits**: Rookie, Racer, Mechanic, Heister, Boss, Downtown, or Random. A / D (or the arrow
  buttons) turn the camera round you; Enter is done, Esc cancels.

The look is saved with the game (`look`; older saves keep the default figure).
`src/player/playerLook.ts` has the options, outfits, random looks and the clean-up of saved looks
(unit-tested); `Humanoid.ts` builds the hats, shades, jacket and facial hair (player only, the crowd
is unaffected); `src/ui/WardrobeMenu.ts` is the panel; `Player.setModel` swaps the figure.

## People

People are built from one procedural rig (`src/player/Humanoid.ts`) with options in their look:
`build: 'f'` (a feminine figure: narrower shoulders and waist, fuller hips, a bust),
`hairStyle` (short, long, bun, ponytail, bald), `skirt` (with bare shins) and `apron`. About half
the passers-by are women, half of those in skirts (the crowd has three instanced rigs: men, women
in skirts, women in trousers); officers wear uniform trousers and women officers wear their hair
up. Named characters use it too: **Mama Rust** (grey bun, skirt and a leather shop apron),
**Mama Lu** (white bun, skirt and a cooking apron), Dot, Queenie, Sal and Pip down in the
Under-Station, Promoter Vex and Jinx in the campaign, Haze the boss, and Mika, Bree, Nina and
Vega among the gang trainers.

Everyone moves on the same gait: the knee folds from toe-off through mid-swing and straightens
for the heel strike (with a little give as it lands), elbows bend more as each arm swings
forward, the hips bob, shift over the standing leg and turn with the stride while the shoulders
counter-turn and the head turns back to keep the gaze steady. Standing still, people breathe,
shift their weight and glance around now and then.

## Walking, running and holding guns

People walk at a natural cadence now: about 1.3 strides a second walking, 1.7 jogging, 2.1
sprinting (`gaitFrequency` in `src/player/Humanoid.ts`, shared by the player and the crowd), with
arms swinging in step and a longer stride, not a faster one, as you speed up. Guns are held
properly: a pistol at the low ready in the right hand, rifles, shotguns and SMGs carried across
the body in both hands (`carry`); aiming or just after a shot the arms come up (one-handed or
two-handed, `onehand` / `twohand`). Melee weapons swing as before.

## Flyers in the sky

Flying Streetmon fly (`FLIGHT` in `SpawnRules.ts`): they cruise a few metres up and bob, climb
away when they flee (faster and higher, up to 14–18 m) and drop back to land when calm. Soaring
species (Longshot, Overwatch, Gullgrifter, Antennaroc) also fill the sky: up to four at a time
circle 18–30 m over the streets of any district (`skyTable`), mostly their own and at their usual
hours. They come down when you get close; anything higher than 3.5 m can't be battled or hit by
a throw until it does.

## The docks

West Ave and East Ave each have a working pier (`src/world/Docks.ts`): a plank deck on pilings
with railings, bollards and mooring lines, a T-head with a yellow gantry crane over stacked
shipping containers, pallets and lamps, and a tugboat and a fishing boat tied up and rocking on
the water. You can walk out on them; the boats are scenery for now. They're on the map and the
HUD names them.

## The deep sewers

The sewers go down three levels (`SEWER.levels`): the old drains (-40 m), the deep drains
(-56 m) and the old cisterns (-72 m), each its own maze under each district, joined by shafts
with ladders (E at the grate). The deeper you go:

- **Rarer and stronger Streetmon** (`deepTable`): commons fade out, uncommons and rares take
  over, +9 levels per level down, and shinies are likelier.
- **Real water.** Channels, cisterns and drowned halls are pools you wade or swim in, with the
  same swimming as the pond (climb out at an edge). Toxic sludge is now a pool too, the same
  but green: it burns while you're in it, faster swimming than wading.
- **Caches**: 4/5/6 sealed lockboxes per maze on levels 1/2/3, in far dead ends: cash, capture
  items and gear, better the deeper (open with E; they stay open in your save).

## Skylights

Some flat roofs have skylights (a framed glass box or a ridge light); they glow warm at night.

## Going inside

Eight buildings have their doors open (`src/world/Interiors.ts`): Sal's Corner Deli and the
Lucky 24 Bodega (buy supplies, a cold drink), The Night Owl Diner (eat to heal, a coffee),
Halvorsen & Pike Insurance and Brightline Logistics (offices: reception, desks, a manager),
Suds City Laundromat, Pixel Palace Arcade (play a cabinet for a prize) and Goldie's Pawn & Loan
(sell what you don't need). Walk up to the door and press E; inside, people work, sit and talk.
You can't go in with the police on you, and guns stay holstered inside.

## Talking to people

Press E next to a passer-by (or anyone inside) to talk (`src/npc/Talk.ts`). What they say comes
from what's going on: the time of day, the district, your wanted level (nobody wants to be seen
with you at three stars), your lead Streetmon, whether you've met before. Ask for directions and
they mark the clinic, a diner, the docks, a safehouse for sale or the pond on your map; ask
what's going on and you hear true rumours (the deep sewers, the races, the docks); ask for advice
and you get it. People inside talk shop: Sal about business, the diner's cook about the regulars,
the pawnbroker about what's selling; and their answers lead to the counter, the menu or a game.

## More to buy and use

New items (`src/data/items.json`, effects in `src/items/Items.ts`), most at the Corner Clinics, some
at the deli, the rest on the sewer black market:

- **Healing** (from the team screen, on the Streetmon you've selected): Bodega Sandwich (+30 HP),
  Volt Energy Drink (+80), Field Medkit (full, and stops choking), Smelling Salts (revives a
  fainted one at half HP), Family Bucket (+50 to the whole party).
- **For you**: First Aid Kit (+60 health), Repair Kit (fixes the car you're in or last drove),
  Burner Phone (one wanted star off, not at five), Lockpick Set (padlocked stashes).
- **Timed effects** (shown under your capture item): Pepper Musk (wild Streetmon weaker than your
  lead stay away, 4 min), Pheromone Bait (twice the spawns, 3 min), Lucky Rabbit's Foot (shinies x3,
  10 min).
- **Situational capture items**: Night Net (x3 between dusk and dawn), Dive Net (x3.5 in water),
  Rookie Cuffs (x3 on anything below your lead's level).
- **Protein Shake**: one level up on the spot (black market, needs reputation).

## Battles on the water

Start a fight while you're in the water (or with a Streetmon that's on it) and it stays on the
water: you tread water, pond and Sludge species swim low in it, flyers hover above it, and everyone
else rides an orange life raft that bobs on the swell (`src/creatures/WaterBattle.ts`).

## The Empire Royale Casino

A grand room in Midtown behind a gold marquee and a red carpet: banks and islands of slot
machines with flashing screens, two blackjack tables, a roulette wheel that turns, video poker by
the bar, chandeliers, a coffered ceiling and a crowd at every table, all talking. The games
(`src/casino/Games.ts`) have real rules: three-reel slots (about 93% back), blackjack from a
four-deck shoe (dealer stands on 17, 3:2 naturals, doubling), European roulette (one zero; colours,
odd/even, halves, dozens and single numbers) and 9/6 Jacks or Better. Bets $10 to $1,000; a big
win gets a cheer and a little Street Cred. Its own music, **High Roller Lounge**, is generated
from scratch by `scripts/make-casino-track.py` (a swinging lounge-jazz loop: walking bass,
brushes and ride, electric piano, vibraphone, a muted trumpet chorus and slot-machine bells).

## The sewers, closer to the real thing

The tunnels are vaulted now (curved haunches where wall meets ceiling), with pipe runs on brackets
down the walls, damp streaks under the vault, moss and slime at the foot of the walls (more the
deeper you go), a kerb along the water channel, caged lamps here and there and water dripping
from the vault around you. Each level's brick is its own colour: older, darker and greener lower
down. The people who live down there look like it: faded, grimy layers, heavy coats, beanies and
beards (`weatheredLook`).

## The Gutter Kings

A real gang, armed and hostile (`src/gangs/Gangs.ts`, `src/systems/GangWorld.ts`), in red hoodies.

- **Not for beginners.** Nothing of them shows until your best Streetmon reaches level 14; then
  Detective Alvarez calls you. The deep sewer levels also warn you if you're under-levelled
  (Lv 15 for level 2, Lv 28 for level 3) and only let you down if you insist.
- **Fights are two things at once.** The nearest member sets his Streetmon on yours (always a
  real-time battle) while the rest shoot from range or rush you with bats. You can fight their
  Streetmon, shoot back, or both. Members surrender when they're beaten down.
- **The police come for them.** A street gang fight brings a squad within seconds: they trade fire
  with the gang and cuff anyone who goes down. Shooting back at the Kings isn't a crime, but shoot
  an officer and it is.
- **Kings of the Gutter** (the quest line): meet Alvarez in Midtown; break up the Downtown corner
  (four of them); run down the courier for his key; find the steel door with the red crown on the
  deepest level under Downtown; fight through the hideout's guards (cover, barricades, a car on
  blocks, fuel drums) and beat **King Rook** and his three Streetmon. Reward: $6,000, an SMG, a
  Rabbit's Foot, Medkits and a lot of reputation; his four lockers are yours too. Leftover crews
  turn up later for strong players (unless your Street Cred has earned their respect).

## Weapons: earned, not found lying around

Guns are no longer scattered on the pavement. They come from **Hardline Arms**, **quest rewards**
(the Gutter Kings), the **sewer caches**, the hideout's lockers, and **stashes** down the back
alleys (`src/world/StreetCaches.ts`): a duffel bag with a bat, a knife or a pistol, or a padlocked
crate with a shotgun, SMG, rifle or sniper that needs a Lockpick Set. A fallen officer only leaves
ammo if you already carry a pistol.

## The park

The Central Green has meadows of tall grass that sway in the wind (harder in a storm), flower beds
along the paths and wildflowers in the grass, hedges and shrubs, pines among the broadleaf trees
and benches by the paths (`src/world/ParkFlora.ts`). Buildings come in three variants of each
facade (different window layouts and tones), so a street isn't one texture repeated.

## A living city

- **Weather** (`src/world/Weather.ts`): clear, overcast, rain, thunderstorms, fog and the odd snow,
  each lasting a few game hours. Rain and snow make every car slide more; rain, storms and fog cut
  how far the police can see; the streets empty in bad weather; Sludge types come out in the rain,
  Wire types in storms, Smoke types in fog. The sky greys over, rain falls round you, lightning
  flashes (and thunder follows), the grass bends in the wind. The clock shows the weather.
- **Two reputations** (`src/systems/Reputation.ts`): **Street Cred** (the underworld: races,
  fights, beating gangs, casino wins, some crimes) and **Civic standing** (ordinary people and the
  police: helping, finishing jobs, taking down gangs; crimes and hurting people lower it). Civic
  standing changes shop prices and whether witnesses report small crimes; Street Cred opens races,
  black-market prices and gang respect. Both are on the quest panel.
- **Speech bubbles** (`src/ui/Bubbles.ts`, `src/npc/Chatter.ts`): passers-by, shop staff, gamblers,
  sewer folk, gang members and police say things over their heads as you pass: about the weather,
  their neighbourhood, you (by your reputation), a gang fight down the block. Minor talk never
  stops the game.
- **Named neighbourhoods** (`src/world/Districts.ts`): Harlow Heights, Sutton Row, Hell's Galley,
  the Glass District, Canal Yards, Old Battery, the Central Green and the Waterfront. Crossing into
  one puts its name and tagline on screen; each has its own light (a gentle colour grade and haze),
  its locals dress their own way, and they talk about where they live.
- **Climbing** (`Player.tryMantle`): jump into anything waist- to head-high (a car, crates, a low
  wall, a container) and you climb up onto it or vault over it.
- **The environment as a weapon** (`src/systems/Hazards.ts`): red fuel drums in alleys, on gang
  corners and in the hideout explode when shot (throwing people, wrecking cars, setting off the next
  drum); transformer boxes on the pavement arc when shot, dropping everyone nearby, twice as far
  on wet ground.

## Phones, tablets and the Android app

On a touch screen (or with `?touch=1` in the address) the game shows **on-screen controls**
(`src/mobile/Touch.ts`): a stick appears where your left thumb lands (walk, or steer; push it
forward in a car for the gas), dragging on the right looks around, and buttons on the right do
what the moment needs: on foot jump, run, use, fight, fire, aim, throw and the weapon wheel; in a
car gas, brake, handbrake, horn, nitrous, out, camera and the race Y; in a battle the move bar is
tapped directly, with swap, flee, cuff, shoot and aim buttons. Team and map are top right, pause
beside them. Phones also get a lighter graphics profile (`src/mobile/Platform.ts`): a capped
pixel ratio, smaller shadow maps, no bloom on weaker phones, a shorter draw distance.

Two ways to put it on an Android phone:

1. **Install from the web (PWA).** The published site has a manifest, icons and a service worker
   (`public/manifest.webmanifest`, `public/sw.js`): open it in Chrome on the phone and choose
   *Add to Home screen*. It runs full screen in landscape and works offline once loaded.
2. **The Android app** (`android/`): a full-screen WebView that ships the built game inside the
   APK and plays offline. `npm run build:android` builds the game and copies `dist/` into the
   app; open `android/` in Android Studio and press Run (or build an APK). See `android/README.md`.
3. **An APK from GitHub Actions.** Push to GitHub and `.github/workflows/android.yml` builds the
   game and the app with the Android SDK; download `empire-streets-apk` from the run (a `v*` tag
   also attaches it to a release).

What makes it play well on a phone:

- **A context button.** A green pill low in the middle of the screen names what you can do right where you are
  and does it on a tap: *Go into Sal's Corner Deli*, *Talk*, *Get in the Sedan*, *Climb out*,
  *Open the vault box*, *Climb down to the deep drains*. It's the game's own prompt
  (`contextFromPrompt` in `Touch.ts`), so anything that shows "E …" on a desktop is one tap.
- **Sprint by pushing the stick all the way**, no button needed (RUN still locks it on).
- **Aim assist** (`src/mobile/AimAssist.ts`): while you aim or fire a gun the view eases onto the
  target nearest the crosshair inside a narrow cone (cops first when you're wanted), a little each
  frame, so your thumb on the look area always wins.
- **A thinner world**: the platform's crowd share (50–70%) now really applies: fewer people,
  less traffic, fewer wild Streetmon and flyers.
- Light haptics on the buttons; the app keeps sustained-performance clocks and stays full screen.

## Performance

**Quality governor** (`src/render/ResolutionScaler.ts`): when the GPU can't keep up, the shadow map
halves first (2048 → 1024, barely visible), and only then does the resolution step down, never far
enough to look pixelated: a 1x screen goes no lower than 0.875, a 2x screen no lower than 1.25 (it
used to go to 0.75). It steps back up when there's headroom.

The game was profiled frame by frame (time per system, draw calls, triangles, the slowest frames
and what was in them) on the street, driving at speed across the city, in battles, during a raid,
around explosions and in the sewers. What was fixed:

| Problem | Fix | Effect |
| --- | --- | --- |
| The physics step cost ~1.5 ms per thousand static colliders, and the city has ~6,900 | **Collider streaming** (`src/world/ColliderStreamer.ts`): posts, trees, street furniture, kerbs and low walls are only in the physics step within 150 m of you (off again past 185 m). Buildings, the ground and the water always stay in (police sight lines and long shots need them) | Physics 4.9 -> 0.8 ms a frame |
| Each car was ~31 separate meshes, and the shadow pass drew them all again: 2,600 draw calls a frame | **Merged car models** (one mesh per material, built once per model and shared), wheels without shadows, and **shadows only from cars within ~70 m** of the camera | 2,600 -> ~390 draw calls a frame |
| Every pedestrian body part was a 340-triangle capsule, drawn twice (with shadows) for ~80 people | **Low-detail crowd** (the same rig with fewer segments; the player keeps full detail) | 1.43 M -> 1.04 M triangles a frame |
| A **200 ms freeze** on the first explosion, raid stomp or street prop broken: the debris pieces needed new shader variants | Debris pieces are one-instance copies of the props, so they use the shaders already compiled | Gone |
| Molotov fires and heist alarms added and removed lights, which recompiles every lit shader | Their lights are made once and kept dark until needed | No more hitches when a fire starts or ends |
| A **70 ms hitch** the first time a species appeared on a battle card or the party bar (making its icon) | Icons are made on the title and starter screens and kept between sessions | Gone (after the first launch) |
| Up to a dozen parked cars spawned in one frame after a long drive (25 ms) | At most 3 per streaming pass (every 0.4 s) | Gone |
| High-DPI screens where the GPU can't keep up | **Dynamic resolution** (`src/render/ResolutionScaler.ts`): when frames run slow *because of the GPU*, the render resolution steps down (to 0.75x at the lowest), and back up when there's headroom. CPU-bound slowdowns leave the picture alone | Holds the frame rate on slower GPUs |

Result, CPU time per frame on the street: **15.5 ms -> 7.7 ms** (about half), with the slowest
frames in a raid down from ~250 ms to ~21 ms. Driving and the police behave the same (0-100 km/h
in 7.10 s, three units within 1.2 s at two stars).

## Getting around: entrances and guidance

**Entrances** are built to be obvious and never overlap:

- **Elevators**: a steel lift door in a dark surround, two brushed doors with a lit seam, a floor
  indicator (▲ ROOF), a call button and a canopy with a lit *ELEVATOR · ROOF ACCESS* sign. On the
  roof, steel doors in the stairwell hut with a light strip.
- **Fire escapes**: ladder stringers, a red *FIRE ESCAPE ▲* sign hung from the first landing, and
  yellow-and-black hazard paint on the pavement under the ladder.
- **Manholes**: semi-open, the cover slid aside and tipped on the rim, a dark hole with the ladder's
  rungs disappearing down it and its rails curling over the lip, and a painted yellow ring.
- **Parking garages**: a lit blue *P ▲ ROOF* sign on a post at each ramp's foot.
- **Clinics and gun shops**: a coloured awning and a lit doorway.
- **Placement**: fire escapes and elevator doors slide along their wall to the first spot clear of
  street furniture, shop and clinic doors, the Chop Shop and each other (7 m apart); manholes keep
  clear of all of those, the alleys, garage ramps and parked cars; benches, bins and news boxes
  keep off every entrance (`KeepClear` in `Rooftops.ts`, `keepClear` in `Game.ts`).

**Guidance** (`src/fx/WaypointGuide.ts`): whenever there's a waypoint, glowing chevrons run along
the route ahead of you (further apart and further ahead while driving), a beam of light rises over
the destination, and a compass at the top of the screen points the way with the name and distance.
Unless you place your own, the waypoint follows the story: the tracked job's objective, its boss,
whoever to go back to, or whoever has the next job.

Routes follow the roads from end to end: each end joins the network along the stretch of road it's
on (never diagonally through a block), the start and end junctions are whichever make the whole
trip shortest, a route never doubles back (no walking back to a junction you've passed, no going
past the destination to the far corner and back: `trimRoute`), and two ways round of about the
same length don't flip between each other as you move. The arrows run all the way to the
destination (up to 120 m ahead on foot, 220 m in a car), and you've arrived within 8 m.

## City map

**M** (or a gamepad's Select) opens a full-screen map of the whole island; the game keeps running
behind it (your character stands still and a car brakes). Drag or WASD/arrows to pan, the wheel,
+/- or Q/E to zoom (to about 6 px per metre, with street names), C to centre on you.

- **Look**: water with ripples and shallows, a promenade edge, pavements tinted by district
  (warm Uptown, neutral Midtown, cool Downtown, sea-green Waterfront), buildings shaded by height
  with drop shadows, the park with tree clumps, a ring path and its lake, lane markings, a compass
  rose, a vignette, and the route drawn as a glowing line with dashes that march towards the
  waypoint.
- **Live markers** (`src/config/map_icons.json`): you (with your heading), police units, tanks
  and roadblocks, the wanted area, wild Streetmon (by type colour; shiny ones as stars), heist
  jobs and lock-ups, sewer grates, rooftop fire escapes, elevators and garages, the Chop Shop, race
  organisers, clinics and gun shops.
- **Filters**: tick layers on and off in the side panel (Cops, Wanted area, Streetmon spawns,
  Heists, Races, Chop Shop, Sewer grates, Rooftop access, Clinics & shops). Saved with the game.
- **Waypoint**: click the map to set one (click it again, right-click, Backspace or Clear removes
  it). A route along the roads is drawn on the map and on the minimap, and the minimap keeps the
  pin on its edge when it's off the map. Arriving clears it. Saved with the game.
- Icons are vector sprites drawn into one atlas at start-up (`buildIconAtlas`), tinted per icon;
  the map is a pre-rendered image of the island (`src/ui/MapOverlay.ts`). The view maths
  (`worldToScreen`, `screenToWorld`, `zoomAt`, `clampView`, `visibleLayers`, `pathLength`) is pure
  and unit-tested.

## Music

Tracks live in `public/music/` (`src/audio/Music.ts`):

| Situation | Track |
| --- | --- |
| Free roam | Transit After Midnight (resumes where it left off) |
| In the sewers | Dragging Through Concrete (resumes where it left off) |
| Battle with a wild Streetmon | Kinetic Overdrive |
| Wanted level reaches 2 stars (until the heat is gone) | Blue and Red |
| Arrest battle with police Streetmon | Asphalt on Fire |
| Street challenger or gang trainer battle | Concrete Crown |
| Street race (countdown and race) | One Sixty on the Dash |
| Heist (from the moment you're on the job, getaway included) | Zero Hour Extraction |
| District Boss battles, and a legendary rampaging nearby | Bow To The Crown |
| Taking on a legendary (the raid battle) | Leash the Beast |
| The opening cinematic | Glass and Steel |
| High-octane cinematics: Acts II-V opening, District Boss intros, a legendary turning up | Apex of the Chain |

A cinematic picks its music with `music` in `cinematics.json` (`intro` or `action`); calm ones
(the Chop Shop scene) leave the street music playing.

**Transitions** are smoothed by a `MusicDirector` (unit-tested):

- **Equal-power crossfades** (sine/cosine), so the loudness doesn't dip mid-change the way a
  linear fade does.
- **Fade times that fit the change**: 0.9 s into something more intense, 2.6 s back down to
  something calmer, 1.4 s into a cinematic and 3.2 s out of one.
- **No ping-pong**: switching up is immediate; switching down waits until the calmer situation
  has held for 1.8 s, so a wanted level flickering 2-1-2, or one battle ending straight into
  another, doesn't bounce between tracks.
- **No gaps**: a track that hasn't loaded yet doesn't start fading in until it can play (the
  old one plays on, up to 2.5 s). Cinematic tracks load ahead of time: the opening theme while
  you're in the wardrobe, the others as soon as their cinematic is queued.
- **Resume or restart**: event tracks start from the top, unless you were away from them for
  under 20 s (then they pick up where they faded out). Free roam and the sewers always resume.
- Pause ducking and the sewer muffling glide instead of jumping.

Priority: a cinematic with music, battles, then a heist, a race, a police chase, the sewers, free roam. Event tracks load
the first time they play (the everyday ones up front). K mutes music with the other sound; it
ducks while paused.

## 3D sound

All sound is synthesised (no audio files). `src/audio/Spatial.ts` puts a `THREE.AudioListener` on
the camera and plays the world through pooled `THREE.PositionalAudio` voices on the synth's own
AudioContext, through its master bus (so K still mutes everything):

- **Vehicles**: the nearest moving AI cars (traffic, racers, police) each get an engine loop
  pitched by a gearbox model from their speed and throttle (bigger engines lower), and a tyre
  squeal that opens up with their sideways slip; crashes, explosions, horn blasts and popped tyres
  come from where they happen. Your own car stays in your head.
- **Police**: each unit with its lights on gets its own wailing siren (out of step with the
  others) that pans as it passes and fades over a few hundred metres.
- **Combat and world**: gunfire, bullet hits, molotovs, Streetmon moves (explosions, bass thumps
  and drops, electric zaps and hums, roars, quakes), cries, tuning abilities, props breaking,
  heist drills and alarms, and capture pods: the throw's whoosh, the flash as it opens, the clack
  when it lands, each wobble's click, the lock-shut click and chime or the pop when it bursts.

Sounds pan (HRTF on desktop, cheaper equal-power on phones) and fall off with distance (inverse,
reference distance an eighth of each sound's range). Every one-shot takes a world position or a
plain distance (`audio.crash(0.8, car.position)`), so adding a sound in the world is one line.

## Rolls and dives

Press **Z** (Y on a gamepad, ROLL on a phone) to roll the way you're moving, or forward if you're
standing still. A roll covers about 4 m in 0.6 s. For roughly 0.3 s in the middle of it you are
**invulnerable** (the i-frames). The start of the roll and getting up at the end are not, so you
have to time it. While you're **aiming a gun** the same button makes you **dive** instead: a
longer, lower dive (5.4 m) that keeps the gun up, so you can keep firing on the way down, with time
slowing a little while you're in the air. You land on your front and take 0.4 s to get up, and
you can be hit during that time. The HUD shows a stamina bar, with "DODGED" when the i-frames
saved you.

How it's kept from being spammed (`src/player/Roll.ts`):

- **Stamina.** A roll costs 28 and a dive 38, out of 100. Stamina refills at 24/s after a 0.9 s
  pause, and not at all while you're rolling. There is a 0.25 s gap between rolls.
- **Chains get worse.** Each roll within 2.2 s of the last one costs 50% more and has a shorter
  i-frame window (32% shorter each time). A third or fourth roll in a row protects you very little.
  Rolling nonstop keeps you invulnerable only about 12% of the time.
- **Winded.** If you spend your last stamina, you're winded for 1.8 s: you move at 60% speed,
  can't sprint or roll, and stamina refills at half speed.
- **What it doesn't dodge.** The i-frames only stop *hits*: gunfire, fists and bats, Streetmon
  attacks and being run over. Falls, fire, sludge, steam vents, shocks, drowning and being crushed
  still hurt in full, and explosions do half.
- **Arrests.** An officer's grab isn't a hit. Rolling doesn't break an arrest in progress: the
  arrest meter freezes while you roll instead of draining. If you're winded, the meter fills 35%
  faster. So rolling away is a way to get *out of reach*, not out of the cuffs. When you're
  wasted or busted, your stamina and roll state reset.
- **Where you can't.** You can't roll in water, while climbing, while carrying heist loot, in a
  car, or indoors (except in the casino).

## HUD

Bottom left: the minimap (heading-up) with your health and the car's, top right the Wanted
stars, cash, clock and your team's health, bottom right the weapon and ammo (and capture items),
the speedometer, gear and nitrous bar while driving, tuned-car abilities with their cooldowns,
and the autosave indicator. The minimap shows Streetmon nearby, race lines and checkpoints,
mission markers, your rides and safehouses, and every police officer and cruiser with its
**vision cone**: blue while it hasn't seen you, red when it has.

The cones are real: police see far (110 m from a cruiser, 60 m on foot) only where they're
looking, and only 40 m (22 m) behind and to the sides (`src/police/Vision.ts`), so you can slip
past a cruiser from behind. Once a unit is on your tail it watches you all round until it loses
sight of you.

## Controls

| On foot | |
| --- | --- |
| W A S D | Move (relative to the camera) |
| Shift / Alt | Sprint / crouch |
| Space | Jump |
| Z (pad Y, phone ROLL) | Dodge roll; with a gun aimed, a dive you can shoot through (see *Rolls and dives*) |
| Mouse | Look around (click the game to capture the mouse) |
| E or F | Get in / out of a car (or drag the driver out of one in traffic); enter a gun shop |
| E at a heist planning spot | Plan the job (pick the crew; Enter starts it) |
| E at the vault / truck / case | Breach it; E next to a loot bag picks it up |
| Z / X | Heist: Hacker jams cameras and alarm / Smoke knocks out guards (gamepad d-pad left / right) |
| Backspace | Walk away from a heist |
| E next to someone with an M | Talk (campaign jobs; answer with 1-4); next to a boss: challenge them |
| J | Campaign: track the next active job |

| Weapons (on foot) | |
| --- | --- |
| Right mouse | Aim over the shoulder (sniper: scope with 12° zoom) |
| Left mouse | Fire, swing or throw (hold for automatic weapons) |
| R | Reload |
| 1-8 | Select weapon slot (press again to cycle weapons in the slot). In a real-time battle, press T first (the number keys command your Streetmon there) |
| Mouse wheel / Q | Next weapon / last weapon used |
| Hold Tab | Weapon wheel (move the mouse, release to pick) |

| Streetmon | |
| --- | --- |
| B | Battle the wild Streetmon next to you (or set your lead on the person next to you: a crime) |
| 1-4 / mouse | Turn-based: menus and moves. Real-time: queue a move |
| 5 / X | Real-time: swap creature / flee |
| T | Real-time battles: switch the number keys between commanding your Streetmon (1-4 moves, 5 swap) and picking weapons (1-8). Each battle starts on commands; the bar at the bottom shows which |
| Space (hold) | Turn-based: speed up battle text |
| C / V | Throw a capture item at the creature in front of you / switch item |
| G | Summon your lead Streetmon to walk with you / recall it |
| Left mouse | Shoot or hit Streetmon too: wild ones outside battles, the foe in real-time battles |
| Mouse over / crosshair | Show a Streetmon's name, owner, level and health bar |
| I | Team: party, stash, summaries, evolution items |
| N | Dex |
| B (evolving) | Stop the evolution |
| E at a clinic | Heal your team, buy capture items |
| E at the impound | Get confiscated Streetmon back |
| E at Empire Motors (on foot) | Buy and sell cars |
| E at a safehouse door | Buy it, or go in: save, heal, rest your team, sleep |
| Hold T | Quick-select wheel: point at a Streetmon to make it your lead, or at a capture item to throw it at the nearest wild one (from a car too). Time slows while it's open |

| Driving | |
| --- | --- |
| W / S | Throttle / brake, then reverse |
| A / D | Steer |
| Space | Handbrake: tap it above 35 km/h with the steering held to start a drift. Steer into the turn to hold about 25-40° of slide, throttle to widen it and keep speed, let go of the steering to straighten out |
| H | Horn (Sonic Bass Horn with a Bass type in the trunk) |
| Shift | Nitrous (a bought part; also the Nitrous Smokescreen with a Smoke type in the engine bay) |
| V | Driving camera: chase, far chase, bonnet |
| R | Flip the car back onto its wheels |
| G | Siren (in a police car or the Medic Van) |
| E on the Chop Shop lift | Lower the car into the Underground Chop Shop (F still gets out) |
| Y | Take a street race offer |
| Backspace | Turn down a race offer, or quit a race |
| Shift | Nitrous Smokescreen (Smoke type in the engine bay) |
| X | Spike Strip Dispenser (Grind type in the trunk) |

M opens the city map, K mutes, Esc or P pauses, F8 shows the creature steering debug rays.

### Gamepad

Plug in any standard controller (Xbox, PlayStation, Switch Pro in a browser that maps it). Every
device feeds the same actions (`src/core/Gamepad.ts`), and the button map follows what you're
doing. Prompts switch to pad buttons ("X  Get in the Sedan") as soon as you touch the pad.

| | On foot | Driving | Real-time battle | City map |
| --- | --- | --- | --- | --- |
| Left stick | Move | Steer | Move | Pan |
| Right stick | Camera | Camera | Camera | |
| A | Jump | Handbrake | Move 1 | |
| B | Battle / set your lead on someone | Spike strip / Smoke | Move 4 | Close |
| X | Use (E) | Flip the car | Move 2 | Centre on you |
| Y | Get in a car | Get out | Move 3 | |
| LB (hold) | Quick-select wheel (aim with the right stick) | Quick-select wheel | Throw a capture item | Zoom out |
| RB | Throw a capture item | Nitrous | Swap Streetmon | Zoom in |
| LT / RT | Aim / fire | Brake-reverse / throttle (analogue) | Aim / fire | |
| L3 / R3 | Sprint / switch capture item | Horn / camera view | Sprint | |
| D-pad | ↑ team, ↓ reload, ←/→ weapons (heist: Hacker / Smoke) | ↑ take a race, ↓ siren, ← quit race (heist: Hacker), → Chop Shop lift | ↑ T toggle, ↓ flee, ←/→ weapons | |
| Back / Start | Map / pause | Map / pause | Pause | Close |

In menus (title, pause, team, dex, shops, dialogue, turn-based battles) the d-pad or left stick
moves a yellow focus ring between the buttons, A presses, B backs out, and the right stick
scrolls long lists.

## What's in it

- **City**: a Manhattan-style island about 1.1 x 1.3 km: 7 avenues, 20 streets with addresses
  ("5th Ave & 42nd St"), about 730 buildings with a midtown and downtown skyline, setback towers,
  spires, brownstone rows and rooftop water towers. A large central park with a lake, paths and
  400 trees. Lane markings, crosswalks, traffic signals, street lamps, hydrants, street trees,
  waterfront railings, rivers on all sides and distant shorelines.
- **Lighting**: physical sky, late-afternoon sun with soft shadows, sky reflections on car
  paint and glass towers, fog, ACES tone mapping.
- **Cars**: six models (yellow cab, sedan, SUV, sports car, police interceptor, box van) on
  Rapier's ray-cast vehicle: independent suspension, tyre grip limits, weight, front/rear/all-wheel
  drive, speed-sensitive steering, brakes, handbrake drifts, downforce and anti-roll. Measured in
  testing: the cab does 0-100 km/h in 8.5 s and brakes at about 0.8 g.
- **Damage**: crash forces wear cars down, then smoke, fire and an explosion that throws the
  wreck and nearby cars and hurts anyone close. Cars are tough: knocks under 3.4 m/s (kerbs,
  scrapes, nudging traffic) do nothing, and every hit is scaled by its kind (`CAR_DURABILITY` in
  `src/config.ts`): crashes 45%, bullets 50%, fire 55%, explosions 70%. A sedan now takes about
  four 50 km/h head-on hits or 40+ rifle rounds to catch fire (it used to be two), a car next to
  one that blows up survives (so no more chain reactions down a whole street), and once it's
  burning you have 9 s to get out (was 6). Armour mods still divide what's left.
- **On foot**: character controller that handles curbs, steps and slopes; jog, sprint, jump;
  getting hit by a car knocks you down and hurts. You ride visibly in the driver's seat.
- **HUD**: heading-up minimap, health, car health, speedometer with gear, street address, prompts.
- **Sound**: all synthesised: engine with gear changes, tyre squeal, wind, crashes, horn, siren,
  doors, footsteps, explosions, city ambience.
- **Traffic**: about 26 AI cars (lots of yellow cabs) on the same physics as yours. They follow
  lanes, plan turns at junctions (right from the kerb lane, left from the inner lane), keep a safe
  gap, brake for red lights and pedestrians, yield to oncoming traffic before turning left, honk
  when blocked, and stop after a crash. Wrecked or burning cars get abandoned.
- **Signals**: fixed-time lights at every junction with a green wave up the avenues; the
  red/amber/green lenses show the live state. Measured in testing: no red-light running, and cars
  stop with the bumper under a metre from the stop line.
- **Pedestrians**: about 55 people with varied looks, walking the sidewalks, waiting for the walk
  signal and using the crosswalks. They jump out of the way of cars, scatter from crashes and
  explosions, and get knocked down or killed when hit (a 50 km/h hit throws them about 20 m).
  Carjacked drivers run off. The crowd is drawn with instancing (about 17 draw calls for everyone).
- **Wanted level (0-5 stars)**: carjacking, stealing cars, hitting or killing people, ramming
  police, hurting officers, speeding past a patrol car and causing explosions all add heat — but
  only if someone sees it. Police who see it count in full, bystanders who call it in count 75%,
  and with no witnesses there's no crime. Once the police lose sight of you the stars blink and
  a search starts (18 s for 1 star, +4 s per star); when it runs out you drop a star. The minimap
  shows police cars and the search area.
- **Police**: two patrol cars drive in ordinary traffic. When you're wanted they and fresh units
  (2 at 1 star up to 8 at 5 stars) spawn out of sight around and ahead of you, route to you along
  the roads with sirens (traffic slows to let them through), and chase you directly once they can
  see you. They follow at 1-2 stars and ram from 3. Units that get stuck reverse out and re-route.
- **Arrests**: if you stop or are on foot, officers get out and run at you. Get grabbed on foot
  and it's "BUSTED" in about a second; stopped in a car they drag you out in about two, unless
  you drive off. You're released outside the precinct with no wanted level.
- **Roadblocks**: from 4 stars (every 22 s, every 15 s at 5), police cars park across the road
  120 m+ ahead of you, with an officer behind each.
- **Escalation table** (`src/police/Escalation.ts`): units, ramming, roadblocks and tanks per
  star level as data.
- **Tanks** (5 stars, `src/police/Tank.ts`, numbers in `TANK_SPEC` in `src/vehicles/specs.ts`):
  - The first rolls in 10 s after you hit 5 stars, entering out of sight about 250 m along the
    avenue nearest you; a second comes 60 s later (never more than 2). Destroying one resets
    that minute.
  - They stay on the avenues at up to 25 km/h, stop about 30 m from you, and turn on the spot.
    If you cross town, a tank on the wrong avenue pulls out after 15 s and a fresh one comes.
  - The turret turns at 40°/s and leads your movement. With a clear line of sight within 120 m,
    the barrel and turret band glow for 1 s, then it fires (one shell every 4.5 s). Shells fly at
    90 m/s with a little drop and explode in a 6 m radius: up to 120 damage to you on foot, 400
    to cars, heavy damage to Streetmon and people.
  - Cars in front get shoved and take 60 damage a second; parked cars are flattened. Wild
    Streetmon are knocked aside with a crush hit. On foot you get shoved out of the way (25
    damage). Traffic stops for tanks.
  - Armour: 2,500 HP. Bullets do 5% (sparks). Car explosions, molotov fire and another tank's
    shell do full damage. A destroyed tank burns and drops a rifle and molotovs.
  - They hold fire while you're tucked against a building front on foot, underground, or in a
    police Streetmon battle. Their crews count as police eyes on you. They pull out when you drop
    below 5 stars and vanish when you're busted or wasted.
- **Losing them**: when the stars run out, officers walk back to their cars, sirens go off and
  the units return to normal patrol. Being wasted or busted also clears the wanted level.
- Measured in testing: 1-star units reach a stationary suspect in about 15 s; at 3 stars they
  closed from 217 m to 4 m in 17 s against a car doing 108 km/h; a 5-star chase ran with 10
  units, 15 rams, a roadblock and 7 officers on foot at 59-60 fps. With 2 tanks and 15 police
  units a frame took 13.4 ms, the same as without the tanks.
- **Weapons** (data in `src/data/weapons.json`): fists, bat, knife, pistol, revolver, pump
  shotgun, micro SMG, assault rifle, bolt-action sniper and Molotov. Each has damage, fire rate,
  magazine and reserve, reload time (the shotgun loads shell by shell and can fire mid-reload),
  spread, aim spread, bloom, recoil, range with damage falloff, and a noise radius. Headshots do
  2.5x. The crosshair opens with the real spread. Melee is silent; gunshots alarm everyone within
  half the noise radius and are reported if police or bystanders hear them. Molotovs leave a
  burning area for 9 s. Guns hit cars too.
- **Getting weapons**: three Hardline Arms gun shops (orange squares on the minimap) sell weapons
  and ammo; they refuse service while you're wanted. Weapons and ammo lie around the city (yellow
  dots, they come back after 90 s). Dead officers drop their pistol, and people often drop cash.
- **Money**: start with $500. Wasted costs a $100 hospital bill; busted takes 10% and all weapons.
- **Police gunfire**: officers on foot shoot at you from 3 stars (from 2 if you're carrying a
  gun), and at your car from 4 stars, keeping their distance; accuracy drops with range and your
  speed. Measured in testing: at 4 stars, 6 units, about 3 shots a second, about a third hit.
- **Streaming**: parked cars, traffic and pedestrians spawn around you out of sight and are
  removed far away.

## Streetmon (creatures)

**51 species**, legendaries included. **Every one has its own cry** (`src/audio/Cries.ts`,
synthesised, no audio files): its size sets the pitch (a Gutterat squeaks around 900 Hz, Gridlock
bellows around 190 Hz), its type the voice (Gun barks, Concrete grumbles, Grind chitters, Smoke
wheezes, Bass throbs, Wire buzzes, Sludge gurgles), and its id the rest (syllables, pitch contour,
vibrato, formant), with evolutions keeping their family's shape and legendaries adding a sub layer
and an echo. You hear it when one is sent out or a wild one squares up, when it first spots you,
lower and slower when it faints, after an evolution, when a legendary roars, and from the dex
(**▶ Cry**). The 14 newest:

| # | Species | Type | How you get it |
| --- | --- | --- | --- |
| 38 | Curbcrusher | Concrete | Curbstone evolves at Lv 24 |
| 39 | Jackpot | Grind | Cashew evolves at Lv 22 |
| 40 | Fogbank | Smoke | Hazeling evolves at Lv 28 (it floats) |
| 41 | Floodlight | Bass / Wire | Streetlamp evolves at Lv 26 |
| 42 | Barricade | Concrete / Gun | Rebarb evolves at Lv 30 (7-round magazine) |
| 43 | Bigshot | Gun | Slugger evolves at Lv 30 (8-round magazine) |
| 44 | Smokestack | Smoke / Concrete | Flue evolves at Lv 32 |
| 45 | Livewire | Bass / Wire | Wirewhip evolves at Lv 33 |
| 46 | Hustlehound | Grind | Hustlepup evolves at Lv 22 |
| 47 | Tagling | Sludge | Midtown streets (a graffiti sprite) |
| 48 | Muralist | Sludge / Wire | Tagling evolves at Lv 25 |
| 49 | Bollard | Concrete | Waterfront, common |
| 50 | Gullgrifter | Grind | Waterfront, common; flees |
| 51 | Clogger | Sludge / Concrete | The sewers under Uptown and Midtown, uncommon |

Their models are procedural like the rest (`src/creatures/models/NewBuilders.ts`, within the
300-1,500 triangle and 5-draw budgets), with dex entries in `streetmondex.json`.


- **Data** (all config, validated at startup with a clear error naming the bad entry):
  - `src/data/types.json`: 7 types: the original Gun, Concrete, Grind, Smoke and Bass, plus Wire
    (rooftops) and Sludge (sewers), whose species arrive with those areas. The type chart is a 7x7
    matrix (the original 5x5 cells are unchanged; Wire beats Grind, Bass and Sludge, Sludge beats
    Gun and Concrete, and every type has as many strengths as weaknesses) (`chart[attacker][defender]`; dual-typed defenders multiply both entries) and the
    tuning numbers for each type's mechanic (Gun ammo/first-shot bonus, Concrete projectile block
    and Broken Glass, Grind stacking, Smoke clouds and choking, Bass spread damage).
  - `src/data/streetmondex.json`: dex text for every species (category, lore, habitat hints);
    startup fails with a clear message if a species has no entry.
  - `src/data/moves.json`: 48 moves, including the signature moves Ricochet and Empty the Clip.
  - `src/data/creatures.json`: 22 species with base stats (HP, Attack, Defense, Speed, Loud),
    magazine size for Gun types, XP growth curve, tier, catch rate, learnset, evolutions (by level,
    item or condition such as time of day or district), spawn districts/times/rarity/levels/
    temperament, biomes (`spawn.biomes`: street, roof and/or sewer, default street, with
    `spawn.biomeWeight` per layer), and model palette, height and weight (`model.weightKg`). Dual types: Hardcase (Gun/Concrete), Rebarb
    (Concrete/Gun), Flue (Smoke/Concrete).
  - `src/data/items.json`: evolution items (Steel Case, Spark Plug).
- **Type chart** (attacker down, defender across):

  |          | Gun | Concrete | Grind | Smoke | Bass |
  | -------- | --- | -------- | ----- | ----- | ---- |
  | Gun      | 1   | 0.5      | 2     | 0.5   | 2    |
  | Concrete | 2   | 0.5      | 1     | 0.5   | 2    |
  | Grind    | 0.5 | 2        | 1     | 2     | 1    |
  | Smoke    | 2   | 1        | 2     | 0.5   | 0.5  |
  | Bass     | 1   | 2        | 0.5   | 2     | 0.5  |

- **Models**: low-poly, flat-shaded, built in code (`src/creatures/models/Builders.ts`, helpers in
  `Kit.ts`): 300-1500 triangles, 2-5 draw calls each, origin at the feet, facing +Z, exact species
  height. Rig nodes `root > body > head, arm_L, arm_R, leg_L, leg_R, tail...` (one mesh per
  material, skinned to the nodes so every part animates without extra draw calls). Each has a
  shiny variant with a hue-shifted palette.
- **Articulation**: every arm, leg, wing and one-piece tail gets a second joint automatically
  (`arm_L_lo` elbow, `leg_FL_lo` knee, `wing_L_tip`, `tail_lo`) halfway along it. Hands, feet,
  paws and claws move to the new bone; parts across the joint are sliced there and soft-skinned
  to both bones, so a one-piece leg bends at the knee. (If the slices would break the 1,500
  triangle cap, the smallest are un-sliced first; they still bend.)
- **Clips** (`src/creatures/models/Motion.ts`, sampled at **30 fps**, then keys a straight line
  already gives are thinned out): `idle` (2 s loop), `walk` (1 s loop), `hurt`, `faint`,
  `evolve_glow`, the all-purpose `attack` (overworld bites), and one attack per move style that
  battles pick from the move's effect: `attack_strike` (swipe or bite or tail-whip; a
  quadruped rears and claws), `attack_slam` (both arms overhead, crash down, squash),
  `attack_shoot` (brace, aim, recoil; Gun types double-tap), `attack_throw` (overhand wind-up and
  release), `attack_blast` (curl in, fling everything out, roar), `attack_power` (gather, then
  flex) and `attack_taunt` (point, head-shake, tail lash). Every attack winds up, strikes with a
  little overshoot, holds and settles; the move's effects launch on the clip's release frame.
  Overlap is built in: forearms, shins, the head, tail segments, wing tips, ears and antennae run
  behind whatever they hang from. Each type moves in its own way and leads with different
  extremities (Gun: snappy, arms lead; Concrete: heavy, body and legs lead, big squash; Grind:
  twitchy arms and tail; Smoke: floaty, long trailing tails and wings; Bass: the body pulses,
  speaker rings bob; Wire: antennae and cables whip, constant jitter; Sludge: the most squash and
  wobble). Builders can still give a node its own motion (`k.motion`); on the styled attacks it
  is added on top of the library's. Animation runs every frame up close and at 15 fps beyond
  35 m.
- **Exported files**: `npm run creatures` writes `public/creatures/<id>.glb`,
  `<id>_shiny.glb` and `manifest.json` (id, file, triangles, draw calls, bounding box, clips,
  nodes), and validates every file with the Khronos glTF-Validator plus the project's own
  structural checks (`src/creatures/models/GlbCheck.ts`); any error or budget breach fails the
  build. The game loads these files (so you can swap in a better model with the same name and
  rig) and falls back to the built-in model if one is missing.
- **Preview**: with `npm run dev` running, open http://localhost:5173/preview.html for a turntable
  of every model: pick a creature and a clip, toggle shiny, line them all up at true scale, or
  tick "Live build" to see changes to the builder code without re-exporting.

- **Day and night**: a 24-minute day (one in-game hour per real minute; the game starts at
  16:30). The sun moves across the sky and sets; dusk turns the light gold, night is moonlit
  blue with the street lamps glowing. The clock under your cash shows the time and phase
  (day, dusk or night). Tuning in `src/world/DayCycle.ts`.
- **Wild spawning** (`src/creatures/SpawnSystem.ts`, rules in `SpawnRules.ts`):
  - Creatures appear out of sight 40-105 m around you on sidewalks, the park and the
    promenades, chosen from what lives in that **district** (uptown, midtown, downtown, park,
    waterfront) at that **time of day**, weighted by **rarity** (common 60 : uncommon 25 :
    rare 7). Levels come from the species' spawn range; 1 in 512 is **shiny** (you get a
    heads-up when one is near).
  - **Density caps**: 12 around you (15 at night), at most 8 from one district, and no two of
    the same species within 25 m. They despawn when 170 m away, or when out of view and over
    115 m away for 6 s, and day creatures slip away at night (and vice versa) when nobody's
    looking.
  - **Temperament**: *wander* creatures roam near home and stop to watch you (and bolt if you
    sprint at them); *flee* creatures run as soon as they notice you; *aggro* creatures come
    straight at you and square up (this will start a battle once battles are in).
  - **Loud** sets how close you can get before a creature notices you
    (6 m + 0.16 m per point of Loud): crouching (Alt) or standing still nearly halves it,
    sprinting makes it 1.5x and driving 1.8x. Loud creatures also show up on your minimap from
    farther away (22 m + 0.55 m per point). Minimap dots are coloured by type; shinies are
    yellow.
  - Gunfire scares everything nearby away, except Gun types: aggressive ones come looking.
    Creatures dodge traffic.

- **Your first Streetmon**: a new game starts with a choice of Cinderblock (Concrete),
  Strapback (Gun) or Subsonic (Bass) at level 7. Concrete beats Gun, Gun beats Bass, Bass beats
  Concrete.
- **Battles** (`src/creatures/BattleEngine.ts` for the rules, `BattleController.ts` for the
  staging): aggressive wild creatures start a fight when they reach you, or walk up to any wild
  creature and press **B**. Two modes, switched in the pause menu (or `BATTLE.mode` in
  `src/config.ts`). **Real-time is the default for every battle** (wild, gang trainers, people,
  the police, quest fights, bosses and legendary raids); a save keeps turn-based only if you
  picked it in the pause menu:
  - **Turn-based**: the camera frames both creatures in the street and you pick Fight (four
    moves, showing type, power, accuracy and ammo), Team (switch), Bag or Run. Keys 1-4 work in
    every menu, Esc goes back, holding Space speeds up the text.
  - **Real-time skirmish**: you stay free to move; press 1-4 to queue a move, which fires when
    your creature's action bar fills (2.4-4 s; faster creatures act more often; if you don't
    pick within 3 s, it acts on its own). 5 swaps creature, X tries to flee, and walking 28 m
    away ends the fight. Grind stacking, choking and clouds tick every 4.5 seconds. The pace is
    set in `BATTLE` (`realtimeCooldown`, `realtimeRound`, `realtimePlayback`, `realtimeIdle`).
    Nobody's bar fills while the last moves are still playing out, so what you see never falls
    behind the HP bars. In raids the trainers' Streetmon fight on their own, and the legendary's
    bar fills twice as fast.
  - **Damage** = ((2 x Level / 5 + 2) x Power x Attack / Defense) / 50 + 2, times the type
    multiplier (dual types multiply), x1.5 same-type bonus, x1.5 critical hit (1 in 16, 1 in 4
    with Steady Aim / Long Shot), x0.85-1.0 random.
  - **Type mechanics**: Gun moves use ammo (shown as pips); Reload takes the whole turn; the first
    shot of the battle and after every reload does x2; loud moves give away the user's evasion
    and are heard by people nearby. Projectiles do 25% less to Concrete types, and Broken Glass
    cuts anything switching in for 1/8 of its HP. Grind types gain +1 Attack for every turn they
    survive (up to +4). Smoke clouds cut the other side's accuracy to 70% for 3 turns, and choking
    costs 1/16 HP a turn for 4 turns (Smoke types are immune). Bass spread moves hit every foe at
    x0.75, often make them flinch, and blow away smoke over their own side.
  - **Signature moves**: Ricochet (ignores Concrete blocking and clouds, then bounces into a
    second foe, or the same one, for half damage) and Empty the Clip (fires every round left,
    at least 2, one hit each).
- **Clinics**: four Corner Clinics (green squares on the minimap) heal your team, restore status
  and reload ammo for $20 + $15 per fainted creature. Lose a fight with nobody left standing and
  you black out and come round at the nearest clinic ($60), or get busted if the police are
  after you. Being busted or wasted mid-fight ends the battle.

- **Catching** (`src/creatures/Catching.ts` for the rules, `CatchVisuals.ts` for the
  animation): throw a capture item from the battle Bag (it shows each item's catch chance), with
  **C** in a real-time skirmish, or with **C** in the street at a wild creature in front of you
  (**V** switches item). The item flies in an arc, the creature is pulled in with a flash, the
  item drops and shakes up to three times, then either clicks shut or bursts open. In a battle a
  failed throw costs your turn; in the street the creature runs off (aggressive ones attack).
  - Catch value a = ((3 x maxHP - 2 x HP) x catch rate x item x 1.5 if choking) / (3 x maxHP),
    x0.6 when thrown outside a battle; the chance is a / 255, and each of the three shakes holds
    with probability (a / 255)^(1/3).
  - **Cuffs** ($100, x1), **Crate** ($275, x1.5, x3.75 against Concrete and Grind types),
    **Net** ($200, x1, x3 against fast creatures with base Speed 80+). You start with **none**:
    Mama Rust hands you 5 Cuffs when she takes you on (Act I, "Mama's Welcome") and 3 more when
    you bring her your first catch, and clinics won't sell capture items until you've met her
    (`BATTLE.starterItems` in `src/config.ts` is empty).
  - **Pity** (`src/creatures/Pity.ts`, saved): after 4 failed throws in a row you get the item
    back plus a free one of the same kind; after 8, the same plus $150 + $10 x the target's
    level, and the count starts again. Any catch resets it. Each miss at the same creature also
    adds +8% to your chance against it, up to +40% (shown in the battle bag).
  - Beating a wild Streetmon pays $8 x its level.
  - Throwing things around while wanted, in front of an officer, adds heat.
- **Team** (**I**): your party of 6 and the stash (anything caught with a full party goes there).
  Each creature's summary shows stats, XP, moves (type, power, accuracy, ammo, description),
  ammo and where it was caught. Make a creature your lead, move creatures to and from the stash,
  or swap any two. Keys 1-6 select, Esc closes.
- **Levelling** (`src/creatures/Progression.ts`): beating or catching a foe gives XP =
  base(tier: 55 / 95 / 160) x foe level / 7 x ((2 x foe level + 10) / (foe level + your level
  + 10))^2.5 x 3 (`XP_MULTIPLIER`) + 1, x1.5 against a trainer's creature, shared between the
  creatures that fought it; the rest of the team (still standing) gets 30% of it too
  (`BENCH_SHARE`, one line in the battle log). That's three times the original curve (it was doubled first, then raised again after the
  campaign playthrough of 1 November 2026): eight wild fights take a starter from Lv 7 to about
  Lv 10. Beating something above your level
  pays far more than farming weaklings. XP curves are
  fast (x0.8), medium or slow (x1.25) of level^3; the cap is level 100. Levelling up raises max
  HP without healing the damage taken. New moves arrive at their learnset level: learned
  straight away while fewer than 4 are known, otherwise you pick one to forget or skip it (Gun
  types can't forget Reload).
- **Evolution**: by level (Strapback 16, Longshot 28, Cinderblock 30), by item (Steel Case on
  Holster, Spark Plug on Exhaust Fume, from the team screen; clinics sell both) or by condition
  (Double Shift levelling up at night from Lv 22, Subsonic levelling up downtown from Lv 20).
  The sequence (`src/fx/EvolutionFx.ts`): a column of light rises round the creature, motes of
  light spiral in, the screen's edges darken and a shimmering tone climbs; the creature turns
  into a white silhouette (playing its `evolve_glow` clip) and flickers between its old and new
  shapes faster and faster while the camera eases in; then a white flash, a ring of light across
  the ground, a shower of sparks and a fanfare as the new form appears in colour (the camera steps
  back if it's bigger). Press **B** (or Stop) before the end to cancel (the item isn't used). Evolving keeps level, XP, IVs, nickname and damage, refills ammo, and offers the new
  form's moves.
- **Escape Rope** ($350 at clinics, $300 on the sewer black market): open your team (**I**) and
  press **Use Escape Rope** while underground to climb straight out at the nearest manhole. It
  doesn't work on the street or mid-battle (the reason shows on the team screen).
- **Gang trainers** (`src/data/trainers.json`, `src/creatures/Trainers.ts`): ten members of
  five gangs (Uptown Hustle, Park Rats, Block Saints, Lot Kings, The Rooks) hang out on corners
  and in the park with their lead creature beside them (red squares on the minimap). Get within
  10 m (on foot, not wanted) and they spot you ("!"), walk over and challenge you: a battle you
  can't run from or catch in, against their whole team, levelled for their district (uptown
  6-8 up to Big Rook's 22-24 downtown). Win for cash ($150-$1,200) and x1.5 XP; once beaten they
  leave you alone. Lose and you black out as usual.
- **Fights with people**: next to someone with no wild creature around, **B** sets your lead
  creature on them. That's a crime (Wanted). Most passers-by run; about a third fight back (a
  Passer-by or a Tough Guy), and police officers always do: regular officers with pistol moves,
  or animal-control officers with Tranq Dart and Beanbag Round once you're at 2 stars. Knock a
  person out and they drop and may drop cash. People can't be caught and aren't in the dex.
- **Police and Streetmon**: using creatures in crimes while wanted (setting them on people, or
  your Gun types firing in front of officers) brings animal control. From 2 stars, officers on
  foot fire tranquilliser darts instead of bullets: each hit slows you for a few seconds and
  knocks 25% off your lead creature's HP; four darts and you go down (busted). Police who reach
  a fight while you're wanted break it up. Busted after creature crimes, the creatures involved
  are confiscated to the precinct **impound** (purple square near the precinct): get them back
  for $150 each.
- **HUD**: the **party bar** (right, under cash and the clock) shows each creature's portrait,
  level, HP, XP to the next level, choking status and, for Gun types, its ammo counter, with the
  lead highlighted. The weapon panel and the capture item you'll throw sit bottom right, wanted
  stars top right. The **minimap** shows wild creatures (coloured by type, shinies yellow; loud
  ones from farther away), gang trainers you haven't beaten (red), clinics (green), gun shops
  (orange), the impound (purple), pickups, police and the search area. Battle cards show type
  badges, portraits, HP, ammo pips, stat changes, choking, smoke and broken glass.
- **Streetmondex** (**N**): all 34 species, each Unseen, Seen, Captured or Evolved. Anything
  that comes within 30 m (or that you fight or throw at) counts as seen, and the dex remembers
  where and when you first saw it.
  - Unseen: a silhouette and a hint of where it lives (street, rooftops, sewers).
  - Seen: picture, name, types, category and habitat hints.
  - Captured: lore, base stats, height, weight, catch rate, a type matrix (what its types do to
    every type, and what every type does to it), its evolution stage and signature moves.
  - Evolved (you evolved one yourself): its evolution line with a check on each form you own.
  - Filters by place (with captured/total counters for Street, Rooftops and Sewers; **B** cycles
    them), by type and by state.

### Adding a creature

1. Add an entry to `src/data/creatures.json` (copy an existing one). Give it a unique lowercase
   `id`, the next `dex` number, 1-2 `types`, `base` stats (1-255), `ammo` if it's a Gun type, a
   `growth` curve, `tier`, `catchRate`, a `learnset` using move ids from `moves.json` (Gun types
   must be able to learn `reload`), any `evolution`s, its `spawn` rules and a `model` with
   `height` and a `palette` of four hex colours.
2. Add a builder with the same id to `BUILDERS` in `src/creatures/models/Builders.ts` (or reuse
   a shared body plan like `heron`, `runner`, `cloud` or `speaker`). Lay parts out in metres with
   `k.box/sphere/cylinder/cone/torus/capsule` on nodes you declare with `k.node(...)`; the kit
   scales the result to `height`, merges materials and generates the clips. `k.motion(node, fn)`
   adds custom animation for special parts.
3. Check it in the preview with "Live build", then run `npm run creatures` and `npm test`. The
   config validator and tests will tell you about any mistake (unknown move, bad colour, missing
   Reload, triangle budget, and so on).

## Textures and weathering

The surfaces were reworked on 1 November 2026 against a set of concept renders (weathered,
rusty Streetmon on a wet, stained street). Everything is still generated in code: there are no
texture files to license, and every surface stays tileable and consistent.

**Streetmon** (`src/creatures/models/Atlas.ts`). The shared atlas every creature samples is now
written at **2048 px** (`public/creatures/atlas/`, 256 px per cell, so a part's side gets 240 px of
detail instead of 56) with **1024 px copies** (`_1k` suffix) that phones load instead
(`CreatureModels` swaps the file names on touch devices). The 512 px version is still generated in
memory for the team-screen icons and the tests. Each cell now carries a weathering pass on top of
its base material: chipped edges along a part's border (bare metal showing through, concrete
corners crumbling, hems fraying), rust streaks running down from every rivet and seam and creeping
up from the bottom edge, dust and grime settling low on the part with drip marks and speckle, fine
scratches, dents in metal, a hammered finish on armour, round air pockets, aggregate grain and
hairline cracks in concrete, fibre grain in the weave of cloth. The heavy cells (`rust`, `grime`,
`wear`) get the full dose; ordinary cells a lighter one, so a palette still reads as its colour.
`npm run creatures` rewrites the atlas files (both sizes); `atlasImages(size)` makes any size.

**The street** (`src/world/Textures.ts`). Asphalt is a 10 m tile at 1024 px built texel by texel:
mottled lanes, aggregate showing through, tar-sealed crack lines (dark and glossy), hairline
cracks, a couple of repair patches with sealed seams, oil and damp low spots that go glossy.
The sidewalk is a 3 m tile at 1024 px: four slabs, each its own shade with a broomed finish,
bevelled joints with grime in them, hairline cracks, stains and gum spots. Road markings use a
**worn-paint mask** (`makeMarkingWear`): the paint has flaked along the cracks and the wheel
tracks, so the asphalt shows through, and what's left is scuffed and less than pure white.
Facades are drawn at 1024 px with per-brick shading (one in twelve bricks burnt dark or pale),
window air conditioners on some windows (standing proud in the normal map, with a drip stain),
and a full-resolution weathering pass: rain streaks under the sills, a dirt band up the ground
floor, soot under the cornice. Roofs got gravel ballast and seam pooling. The brick and stone
colours are a little darker and less saturated.

**Wet streets** (`Game.applyWeather`). The weather's `wet` value (it lags the rain and dries
slowly) now drives the ground: asphalt goes dark and glossy (roughness 1 → 0.4) so it reflects
the sky and the street lamps, the pavement less so, and the paint on the markings sheens up.

### Characters, trees and street clutter

The second pass (same day) took the remaining assets up to the renders' level: the people, the
trees and the mess of a real kerb. Still no model files, still one draw call per crowd part.

**People** (`src/player/Humanoid.ts`, `src/peds/CrowdRenderer.ts`). The rig has a proper body
now: shoulders, jaw, ears, eyes and brows, a waistband, soled shoes, sleeves with cuffs. On top
of it a `HumanoidLook` picks an **outfit** (`tee`, `hoodie`, `jacket`, `coat`, `suit`, `uniform`,
`swat`) and the parts that come with it: a hood (down as a roll at the collar, or up over the
head), a kangaroo pocket, a zipped jacket shell with collar, a long coat with lapels and tie,
a duty belt with pouches and holster, badge and radio, a police cap, helmet and visor, a plate
vest and knee pads, and a **bag** (`backpack`, `duffel`, `briefcase`). Hats (`cap`, `beanie`,
`fedora`, `glasses`) and facial hair are parts too. `partsFor(look)` says which pieces a look
wears and `roleColor(look, role)` what colour each role is, so the crowd renderer builds one
instanced mesh per part for the whole crowd and collapses the parts a pedestrian doesn't wear.
`randomLook()` dresses civilians by district (tees, hoodies with the hood up, jackets, long
coats, the odd suit with a briefcase); `copLook()` is the navy NYPD uniform with cap, belt and
badge; `swatLook()` (four stars and up, `PoliceSystem`) is the tactical unit in helmet, visor
and vest; the sewer's `weatheredLook()` layers coats and hoods.

**Trees** (`CityBuilder.buildTrees`, `StreetClutter.canopyGeometry`). A trunk that flares at the
root and forks into two limbs under the crown, and a crown made of three overlapping, lumpy
icosahedra with flat per-facet normals and a per-facet shade, tinted olive-to-khaki per tree
(`vertexColors`, instance colour). Only a whisper of surface detail, so the facets read as clean
planes the way they do in the render.

**Kerb clutter** (`src/world/StreetClutter.ts`). Instanced, no colliders, placed from the layout
seed clear of the street furniture: bin bags piled at the kerb for collection (lumpy, black,
slightly glossy), litter on the pavements and in the gutters (per-instance colour), storm-drain
grates at the block corners and manhole covers in the road. Density halves on touch devices.

### Breaking up the tiling

Big flat surfaces used to show their tile from a distance (roofs most of all: a polka-dot grid
from above). `withSurface(..., { antiTile, macro })` (`src/render/Surfaces.ts`) now fixes that
for any material:

- **`antiTile`**: the material's own maps (colour, normal, roughness, metalness) are looked up
  through `surfTex`, which blends between two randomly shifted copies of the tile, the shift
  changing smoothly every couple of tiles (Inigo Quilez's "texture repetition", method 3).
  `step` snaps the shifts to a grid so pavement joints and roof seams stay lined up. Two reads
  per map, so it's off on phones (`SURFACE_DETAIL.antiTile`).
- **`macro`**: soft light/dark weathering patches in world space (two octaves of value noise at
  ~23 m and ~6.5 m) that never repeat. Facades get this only (shifting them would break the
  window grid).

Used on the roads (free shifts), pavements (snapped to the slab), grass, and roofs (snapped to the
seams). Roofs also come in three finishes picked per building (silver-coated, grey gravel, dark
tar), and the roof texture is lighter and lower-contrast.

## Better-looking models

Everything is generated in code. To raise the visual quality, drop licensed `.glb` models into
`public/models/` and list them in `public/models/manifest.json` (see the README there).
Cars and the player switch over automatically; anything missing falls back to the built-in models.

## Options and the playtest pass

The pause menu (Esc, or II on a phone) has a row of **options**, kept outside the save so they
stick across new games and imports (`src/core/Options.ts`, localStorage `es.opts`): **Look
speed** (60–200%), **Invert look**, **Music** and **Effects** volume (100% to off, separately),
and **HUD size** (85–130%: the HUD, battle bars, tips and the compass scale together). Each
button cycles its ladder. **Save & quit to title** saves and goes back to the title screen (two
clicks, like starting over). The controls table under the menu shows the keyboard on a desktop
and the touch buttons on a phone.

A playtest pass against Entro Games' twenty post-playtest questions (what should have been
explained earlier, what did you want to do but couldn't, which moments felt like work, what was
missing from the reference cards, accessibility) found and fixed these:

- **Mama Rust now stands outside her Chop Shop**, wherever the city plan put the lift, so the
  opening walk, "the Rustbucket at the kerb" and the chop-shop cinematic all agree. (Her spot in
  the campaign config had drifted 600 m from the lift as the districts were re-planned: the new
  kid was being sent across town with no car.)
- A wild Streetmon at 0 HP that hadn't fainted (hit by a car while in a trainer's pod, say) could
  still be battled, and the battle crashed every frame. KO'd creatures now faint, can't be
  targeted, and `startWild` refuses a foe with nothing to fight.
- People who gave you a job vanished the moment you accepted it. They stay, with a grey "…"
  marker, and talking to them repeats the brief.
- Street events (outbreaks, supply drops) wait until Mama's welcome is done, so the first minutes
  aren't a timed panel 600 m away.
- Real-time battles show the **catch odds** of your quick capture item next to "C catch", and the
  hint pulses green once a throw is worth it (30%+).
- The objective beacon thins out as you arrive (it was a wall of light over the lift).
- At one or two stars an officer takes about 1.7 s to get the cuffs on (1.1 s from three), so
  "BEING ARRESTED" is readable and a roll can still get you out of reach.
- In the casino, "E Talk" to the dealer no longer hides "Play blackjack / roulette / slots": the
  nearest thing wins, with a bias to the table.
- The wardrobe clears bystanders from beside you (the world is frozen while it's open, and a
  frozen stranger made it unclear who you were dressing).
- Podded (invisible) Streetmon no longer show as dots on the maps or count as seen in the dex.
- The title and pause controls list Z (roll / dive), T (battle key toggle) and V (car camera).
- Phones: the job panel sits top-left clear of the thumb buttons, the capture line says THROW
  rather than "C throw V switch", battle hints name the buttons (SWAP · CUFF 25% · FLEE · SHOOT),
  the race button is labelled RACE and only shows while a race is on offer, the job panel hides
  during a battle (the foe's bar takes that corner), and BLACKED OUT / BUSTED fit the screen.

## Your Streetmon fights on its own

With your lead out walking with you (G), it takes on wild Streetmon that come near by itself
(`src/systems/FollowerSkirmish.ts`, engine-free and unit-tested; wired in `LivingWorld`):

- It picks anything wandering within 9 m of it and you, and first of all anything coming for
  you. Never a legendary, nothing more than 8 levels above it, nothing already beaten down.
- It runs over, the two trade blows with the same ambient formula and type chart as the wild
  turf fights (attack FX, HP bars over both), and:
  - the wild one worn below 30% runs off, beaten up (an easy catch), and yours gets half a
    normal battle's XP (it can level up and evolve);
  - yours worn below 35% backs off to your side; the wild one keeps its ground.
- Walking 22 m off, getting in a car, starting a battle or anything else taking the wild one
  breaks it up. A 6 s pause between fights, and it won't start one below half HP. Damage
  carries over: heal at a clinic.
- Switch it off in Settings → Gameplay → "Streetmon fights on its own" (`Options.petFights`).

Tuning: `SKIRMISH_DEFAULTS`, or `followerFights` in `src/config/living_world.json`.

## Menus

The title screen and pause menu (`src/ui/Menus.ts`) are laid out like most console games: a
column of menu items on the left, and a panel on the right for what's picked.

- **Title**: Continue (with the save summary), New game / Play, Settings, Controls.
- **Pause**: Resume, Settings, Controls, Tips & tutorials, Character, Save & load, Quit to title,
  with a one-line summary of the game under the heading.
- **Settings** has tabs (Gameplay, Audio, Display, Controls), one row per setting with a short
  explanation and ‹ value › to change it (click, or ← → on the keyboard, either way round).
- **Controls** is a set of cards by topic with keycaps, keyboard or touch.
- Keyboard: ↑ ↓ (or W S) along the column, Enter or → into a panel, ← or Esc back out; Esc
  with no panel open resumes. A pad's focus ring works over the same buttons. On a short phone
  screen the column tightens up; on a narrow one the panel takes the screen.

The class prefix is `mm-` (the garage menu already uses `gm-`).

## Heists inside the building

The check-casher, Diamond Row and the First Empire bank are robbed from the inside now
(`src/systems/HeistInterior.ts`; the armored truck stays on the street). Once the job's on, walk
to the front door and press E to go in; leave the same way.

- **The room** is built under the building (like the shops, at y -150), sized per kind and laid
  out from the frontage: a lobby with pillars and a teller counter (or the jeweller's display
  cases), desks in the back, and at the bank partition walls round a corridor to the vault. The
  vault is a steel door in the back wall with a strong room behind it (its collider goes when
  it swings open); the bags are inside.
- **Cover** is solid: guards and cameras check their line of sight against it, aimed at your
  middle, so hugging a counter or a pillar hides you.
- **Laser gates** (three red beams between two posts) cross the way in. Each switches on and
  off on a 3.4 s cycle, staggered gate to gate: time your run. Touching a live beam sets the
  alarm off at once. A Hacker's jam turns them off along with the cameras.
- **Cameras** sit in the corners looking into the room; guards walk patrol routes inside.
- `planHeistInterior` (pure, tested) works out every position; `HeistWorld` rewrites the job's
  breach points, bags, guards and cameras to the room's at start-up, so the rules
  (`heistManager.js`) didn't change apart from the laser (`ctx.laserTripped`).

Tracking: a waypoint you place stays yours, but the story's guidance takes over again as soon as
an objective moves on or a job completes; loading a save keeps the story's waypoint as the
story's (it used to come back as a manual one, which switched the guidance off for good); and
during a getaway the waypoint points at the nearest open lock-up.

## Heist overhaul: bigger rooms, crouching, guards that hear, police raids

- **Bigger rooms.** Check-casher 20 x 22 m, Diamond Row 26 x 24 m, the First Empire 34 x 34 m
  (plus the strong room). Two rows of lobby pillars, planters, a long teller counter with a gap,
  offices either side of the vault corridor with rows of desks and filing cabinets, staggered
  laser gates (four down the bank corridor, two across the office ends), and more staff:
  `HEIST_INTERIOR.staff` gives each kind a minimum of guards and cameras (bank 5 / 6).
- **Crouch replaces the slow walk** (hold Alt; a light push on the phone stick or a light tilt
  of the pad stick). 2 m/s, hips dropped, knees bent, leaning in. Guards and cameras see a
  crouched player at 72% of their range and aim at waist height, so counters, desks and display
  cases hide you completely. Wild Streetmon still notice you less, as before.
- **Guards hear you** inside (`HEARING` in `HeistInterior.ts`): footsteps carry 7 m at a jog,
  11 m sprinting, 1.5 m crouched, halved through a wall, no line of sight needed. Being heard
  builds suspicion (like loitering by the breach point) and the guard stops and turns to look,
  which usually means he then sees you.
- **Police come in.** Once you're wanted while inside, officers enter through the front door
  after a few seconds (sooner and more of them at higher levels, one more every 9 s up to 6),
  path round the cover on a floor grid (`src/systems/HeistRaid.ts`) and grab you (the normal
  arrest bar); from three stars they shoot when they can see you. Inside, the wanted level no
  longer cools off as if you were in the sewers; it holds while they can see you. They leave
  when you do.
- **Wasted or busted ends the job**: the bags are gone and the room resets. **A failed or
  abandoned job leaves no cooldown**, so the heist marker comes straight back for another try
  (only a successful score puts the place on cooldown). Walking deep into the room no longer
  counts as leaving the job (the escape / walk-away distance checks wait until you're outside).
- The location line shows the building's name while you're in it.

## Touch controls: tap the world, icons not words

On a phone or tablet you interact by tapping things, and the few buttons left are icons
(`src/mobile/Touch.ts`, `Icons.ts`, `TapTargets.ts`).

- **Tap the world.** A person: talk, or set your Streetmon on them. A wild Streetmon: battle it,
  or throw a capture item. A car: you walk over and get in. A spot on the ground: you walk there,
  and a yellow ring marks the spot. Where there's a choice, two or three icons fan out over the
  thing you tapped; where there's one thing to do, it just happens. You walk there yourself, the
  action happens when you arrive, and touching the stick takes over at any time.
- **Tap yourself** for the team screen, bring out or recall your Streetmon, the Dex, and walking
  away from a heist. **Tap your car** to get out, sound the horn, change the camera (and use the
  siren in a police car).
- **The HUD is tappable.** Tap the minimap to open the map. Tap the team bar for the quick wheel
  (tap a slot to pick it; a long press opens the team screen). Tap the weapon panel to switch
  weapons.
- **Fewer buttons.** On foot there are only jump and attack. Swipe the jump button to roll. Aim
  and reload appear only with a gun in hand, and the crew's jam and smoke only on a heist. In the
  car there's only the handbrake, plus nitrous on a car that has it. The stick drives: push it
  forward for gas, pull it back to brake and reverse, sideways to steer. The run, use, fight,
  throw, team, map, quick, weapon, roll, gas, brake, horn, get-out, camera, race and flip buttons
  are gone.
- **The action button is an icon** for what it does: a door, a speech bubble, a ladder, a car,
  crossed swords, a flag and so on. The prompt above it still says it in words.
- **Real-time battles on touch:** tap a move along the bottom to use it. Swap, flee, capture and
  the keys toggle sit top left.
- The tips are reworded for touch ("Tap one, then the crossed swords, to battle it").

## Optimisation pass

Measured in the browser at a busy street corner (1280x720, M1 Pro), CPU per frame went from about
17.5 ms to 12 ms, draw calls from ~930 to ~760, the physics step from 2.4 ms to 1.1 ms and the
scene-graph matrix update from 1.8 ms to 0.4 ms.

- **Hidden subtrees skip their matrix update** (`src/render/MatrixUpdates.ts`, installed in
  `main.ts`): the shop and heist interiors, the sewers and the other layer are two thirds of the
  scene graph, and three.js recomputed all of it every frame. A hidden object marks itself stale
  and catches up the frame it's shown. The bloom's glow pass no longer walks the whole graph a
  second time either.
- **Crowd**: each body part keeps its own instance count, a part nobody on screen wears isn't drawn,
  small parts (eyes, badges, ties...) don't cast shadows, only the used part of each instance
  buffer is uploaded, colours are parsed once, and only people in (or just outside) the view and
  within 170 m are posed at all.
- **Wild Streetmon** are frustum culled (skinned bounds padded 1.8x to cover the animation) and their
  aura shells and glowing bits no longer cast shadows.
- **Static merging** (`src/render/StaticMerge.ts`): the docks (272 meshes -> 18) and the heist rooms
  (~170 -> ~13) draw one mesh per material. The taxi sign is 2 draws instead of 6.
- **Colliders below ground** (tunnels, rooms under shops and banks) are held off by the collider
  streamer while you're on the street, and follow the streamer while you're down there.
- With bloom on (the default), the canvas isn't multisampled: the frame is drawn multisampled into
  the composer's buffer and only a full-screen copy reaches the canvas.
- **Dead code removed**: the old hover tooltip (`CreatureTooltip`, replaced by the always-on labels;
  its type moved to `CreatureLabels`) and its CSS, ~15 unused exports and ~55 unused class members
  across 40 files, and a few CSS rules nothing used.

## Zone music

Every part of the city has its own free-roam track (`public/music/zone-*.mp3`, from the zone
music brief), crossfading as you cross into a neighbourhood: Harlow Heights, Sutton Row, Hell's
Galley, the Glass District, Canal Yards, Old Battery, the Central Green and the Waterfront, plus
the rooftops, the deep drains (sewer levels 2-3), the Gutter Kings hideout, the shops and diners
and the Pixel Palace arcade. Battles, chases, races, heists, bosses and cutscenes still play their
own. `pickTrack` (Music.ts) takes `zone` (the neighbourhood id, or 'roof'), `deep`, `hideout` and
`indoors`.

The tracks are synthesised in code by `scripts/make-zone-tracks.py` (numpy/scipy, a style per
zone: drums, bass, chords, lead, ambience), seamless loops of 2-2.5 minutes normalised to about
-14 LUFS. They're placeholders: drop better files over them with the same names.

## Smaller changes (1 November 2026)

- **Streetmon labels**: name, level and an HP bar over every Streetmon you can see, all the time
  (within 26 m, fading at the edge, only with a clear line of sight: walls and buildings hide
  them), instead of on mouse-over (`src/ui/CreatureLabels.ts`). Battles keep their own bars.
- **Stamina**: sprinting drains it (12.5 a second, about 8 s from full); running dry leaves you
  winded. Rolls go 6 m (dives 7 m).
- **Conversations**: nobody talks to themselves any more. Passers-by stop in pairs and have a
  proper exchange (3-6 lines, taking turns, facing each other) about the weather, the night,
  their neighbourhood, the league, a Streetmon they saw, you, or the police; shop staff talk with
  customers, the sewer locals with each other (`src/npc/Chatter.ts`). Only gang-fight shouts are
  single lines.
- **Dialogue in speech bubbles**: conversations with people (story characters, shopkeepers,
  bosses) appear as a bubble over the speaker's head with the numbered answers inside it
  (DialogueBox.ts); with nobody to hang it on, it sits low in the middle of the screen.
- **No cash in the streets**: nothing lies about, and nobody drops money.
- **Flying Streetmon** fly: wings beat (a glide high up), legs tuck back, the body leans into the
  way it's going and bobs; things without wings drift and sway (`flightPose`, SpawnSystem.ts).
- **Sewers**: the sludge is a dark, murky green, and about one floor block in seven has a slime
  puddle.
- **Swimming**: a slower, steadier crawl (about two-thirds of a stroke a second).

## Saving

Saving goes through `src/core/SaveManager.ts`: the save is LZ-compressed (about a third of the
JSON's size), wrapped with a checksum and the time it was saved, and written twice, to
localStorage (synchronously, so the save when you close the tab still lands) and IndexedDB (in
the background, with a much bigger quota). Each store keeps the previous save as a backup; on
boot the newest good copy wins, so a damaged save loads the backup (and says so) and a cleared
or full localStorage still loads from IndexedDB. Old plain-JSON saves load as they are.
**Export save** downloads a compressed `.esave` file; **Import save** takes `.esave` or `.json`.

Autosave triggers, with a spinning-disc indicator bottom right saying why: going into a
safehouse (and waking up), pulling off a heist, winning a race, catching a Streetmon. On top of
those, routine saves every 45 s and after any change (at most every 4 s).

### Safehouses

A front door in each district (`src/world/Safehouses.ts`): the **Rust Row Walk-up** right where a
new game starts is yours; the Midtown Studio ($8,000), the Pier 9 Container Flat on the
Waterfront ($9,000) and the Downtown Loft ($15,000) are for sale. Owned doors have a green lamp
(a red one and a FOR SALE sign otherwise) and a green house on the maps. Walk up on foot and
press **E**: the game saves, you're patched up and your team is rested, and you can sleep till
morning (07:00) or evening (20:00). Get wasted and you wake at the last one you used. You can't
go in with the police after you. Owned safehouses, the last one used and visits are saved.

The game autosaves every 45 seconds (never mid-battle or mid-evolution), right after battles,
catches, evolutions and picking your starter, and when you close or hide the tab. The pause menu
has **Save game**, **Export save** (downloads a `.json` file) and **Import save**. The title screen
shows your save and offers **Continue** or **New game** (which asks for a second click, because
the next autosave replaces the old game).

Saved: cash, the time of day, where you are, weapons and ammo, the bag, your party, stash and
impound (every creature's species, level, XP, HP, ammo, IVs, moves, nickname, status, shininess
and where it was caught), the dex, which gang trainers you've beaten, the battle mode and play
time. Not saved: wanted level and the police, wild creatures and traffic (they respawn).
Saves are versioned JSON (`src/core/SaveSystem.ts`, compressed for storage), now version 2, which also stores your
height and world layer, species you've evolved, the capture pity counter, opened stashes, quest
progress, reputation, manholes found and the sewer seed (most of these are used by the rooftop,
sewer and pity features as they land). Version 1 saves upgrade automatically with defaults. Loading repairs anything that doesn't
fit the current config (unknown species, moves, items or weapons are dropped; levels, HP, ammo
and IVs are clamped; Gun types get Reload back; a party over 6 spills into the stash) and tells
you what it fixed, so old or hand-edited saves never break the game. Saves live in the
browser's storage for this site (localStorage and IndexedDB); use Export to back up or move a game.

## Systems and config at a glance

| Requirement | Where |
| --- | --- |
| Config: weapons, types (chart + mechanics), moves, creatures, items, people, gang trainers | `src/data/weapons.json`, `types.json`, `moves.json`, `creatures.json`, `items.json`, `humans.json`, `trainers.json` |
| WeaponSystem | `src/weapons/WeaponSystem.ts` (+ `Inventory`, `WeaponTypes`, `Shops`) |
| CreatureSystem | `src/creatures/Data.ts` (config + validation), `Creature.ts` (individuals, stats, XP curves), `CreatureModels.ts` (glb loading with built-in fallback), `models/` (procedural models, rig, clips, GLB checks) |
| BattleSystem | `src/creatures/BattleEngine.ts` (rules), `BattleController.ts` (staging, turn-based and real-time) |
| SpawnSystem | `src/creatures/SpawnSystem.ts`, `SpawnRules.ts`, `src/world/DayCycle.ts` |
| CatchSystem | `src/creatures/Catching.ts` (formula), `CatchVisuals.ts` (3-shake animation), `Bag.ts`, `Party.ts` |
| ProgressionSystem | `src/creatures/Progression.ts`, `EvolutionScene.ts` |
| SaveSystem | `src/core/SaveSystem.ts` |
| Heists | `src/config/heists.json`, `src/systems/heistManager.js`, `HeistWorld.ts`, `src/ui/HeistMenu.ts` |
| Street events | `src/config/street_events.json`, `src/systems/streetEventManager.js`, `EventWorld.ts`, `src/world/Alleys.ts` |
| Living world | `src/config/living_world.json`, `src/systems/livingCore.js`, `npcLife.js`, `wildInteractions.js`, `LivingWorld.ts`, `src/ui/Overhead.ts` |
| Campaign and league | `src/config/campaign_quests.json`, `src/config/racing_league.json`, `src/systems/questManager.js`, `CampaignWorld.ts` |
| Tutorials | `src/config/tutorials.json`, `src/systems/tutorialManager.js`, `src/ui/TutorialCard.ts` |
| City map | `src/config/map_icons.json`, `src/ui/MapOverlay.ts` |
| Move effects | `src/config/move_fx.json`, `src/fx/moveFxPlan.js`, `MoveFx.ts`, `Audio.moveSfx` |
| Battle layout | `src/creatures/Arena.ts` |
| Destruction | `src/config/destructibles.json`, `src/systems/destruction.js`, `DestructionWorld.ts`, `src/world/StreetProps.ts`, `src/fx/Decals.ts` |
| Legendary raids | `src/config/legendaries.json`, `src/systems/raidManager.js`, `RaidWorld.ts`, `src/creatures/models/LegendBuilders.ts` |
| Performance | `src/world/ColliderStreamer.ts`, `src/render/ResolutionScaler.ts`, car merging in `src/vehicles/CarModel.ts`, icon cache in `src/ui/CreatureIcons.ts` |
| People, police, gangs | `src/creatures/Trainers.ts`, `Clinics.ts`; police reactions in `src/core/Game.ts` |
| UI | `src/ui/` (Hud, WeaponHud, PartyBar, BattleUi, TeamScreen, DexScreen (the Streetmondex), ClinicMenu, CreatureIcons, Menus, DialogueBox) |
| Unit tests | `tests/run.ts`: city, traffic, wanted, weapons, data validation, **type chart**, **damage formula and battle mechanics**, **catch probability**, **levelling and evolution**, spawning, people/police/gangs, saving, **battle arena**, **move effects**, **destruction** and street props, **legendary raids** (rules, raid battles, balance) |

## Project layout

```
src/
  main.ts, config.ts, style.css
  core/       Game (loop, state, enter/exit, death), Input, Gamepad (pad mapping and menu focus),
              SaveSystem (save format, repair), SaveManager (compression, localStorage + IndexedDB)
  world/      CityLayout (pure, tested), CityBuilder (meshes + colliders), Environment, Textures
  vehicles/   specs (data), Car (physics), CarModel (procedural meshes), VehicleManager
  player/     Player (character controller), Humanoid (procedural rig + animation)
  traffic/    RoadGraph (lanes, junctions, turn paths; tested), Signals (tested), SignalView,
              TrafficSystem (AI drivers)
  peds/       PedestrianSystem, CrowdRenderer (instanced crowd)
  systems/    vehicleTuning.js (+ .d.ts; Chop Shop tuning manager), TuningWorld (ability effects),
              destruction.js + DestructionWorld (breakable props), raidManager.js + RaidWorld (legendaries),
              streetRaceManager.js (+ .d.ts; street races), RaceWorld (race props, racers)
  config/     vehicle_streetmon_tuning.json, races.json
  police/     Wanted (rules; tested), Escalation (per-star table), Vision (sight cones; tested), PoliceSystem (units, pursuit,
              arrests, roadblocks), Tank + TankLogic (5-star tanks)
  camera/     CameraRig (orbit on foot, chase in car, wall collision)
  fx/         Effects (smoke, fire, sparks, skid marks, explosion light, bursts), MoveFx + moveFxPlan.js
              (move effects), Decals (bullet holes, scorch, cracks), DamageNumbers
  audio/      Audio (WebAudio synthesis), Spatial (THREE.AudioListener + PositionalAudio voices)
  weapons/    WeaponTypes (data + validation; tested), Inventory (tested), WeaponSystem, WeaponModels, Shops
  creatures/  Data, Creature, BattleEngine, BattleController, SpawnRules, SpawnSystem, Catching,
              CatchVisuals, Bag, Party, Progression, EvolutionScene, Trainers, Clinics, CreatureModels
  creatures/models/  Kit (rig, merge, clips), Builders (all species), LegendBuilders, GlbCheck
  data/       weapons, types, moves, creatures, items, humans, trainers (JSON config)
  ui/         Hud, QuickWheel, Menus, WeaponHud, PartyBar, BattleUi, TeamScreen, DexScreen, ClinicMenu, CreatureIcons, DialogueBox,
              ChopShopMenu
  npc/        Quests (sewer people, dialogue, quests, black market)
  preview/    Model turntable (preview.html)
  assets/     ModelLibrary (optional glTF slots)
scripts/build-creatures.ts   Exports and validates the creature .glb files
tests/run.ts  Unit tests (run with `npm test`)
```
