# Empire Streets: playtest report (living world and campaign)

This tests build s88, which added the living world and the campaign. The fixes are in s89 and s90, and all three are deployed. The unit suite now has 981 checks, all passing; the type check and the bundle are clean.

## Method

| Technique | What was done |
|---|---|
| Smoke test | Boot, title screen, new game, starter pick by mouse, first minute of play, with the console watched for errors. |
| Session-based exploratory charters | **A. Campaign:** talk, accept, courier, boss, and wasted or busted mid-job. **B. Living world:** hunters, chatter, duels, packs, and aggressive Streetmon. **C. HUD and UI:** readability and overlap at a short 597×786 window. |
| Interruption, edge and boundary tests | Dying or getting busted mid-objective. A fainted party at a boss. Hurting a hunter mid-hunt. Stealing a hunter's target with B. Explosions and cars through scenes. Leaving the 80 m AI radius. Teleports and streamer disposal. |
| Randomized monkey soak | 300 game-seconds of seeded random input: drive, walk, sprint, fire, explosions, wanted level, teleports, battles and campaign talk. Invariants were checked every tick: no NaN positions, the wild count stays within its cap, no orphaned bubbles or bars, no stuck "held" creatures, and valid state-machine states. Console errors were captured throughout. |
| Performance profiling | Frame time for every frame of the soak (18,600 frames), plus samples of entity counts, scene objects and heap. |
| Regression | The unit suite, then the driving (0–100 km/h) and police (2-star response) checks in the browser, with audio muted. |

## Soak and performance results

- **Invariants:** 0 violations and 0 console errors in 300 game-seconds.
- **Frame time:** p50 13.5 ms, p95 16.6 ms, p99 18.2 ms. 30 frames (0.16%) went over 33 ms, with a 72 ms worst case during a streaming burst.
- **Leaks:** none found. Scene objects stayed between 185 and 242, with no upward trend. The heap moved between 157 and 393 MB in a normal garbage-collection sawtooth and fell back to 224 MB.
- **Peak counts:** 61 people, 30 wild Streetmon (exactly the night cap), 78 cars, 5 police units, 2 hunters, 3 conversations and 1 duel.

## Bugs

| # | Sev | Area | Bug | Repro | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | Major | UI / title | The title menu overflows short windows: the logo, Continue and New Game are off-screen and can't be reached. | 597×786 window, title screen: Continue sits at y = −50. | Overlays scroll, and their content centres with auto margins (style.css). | Fixed, verified |
| 2 | Minor | UI / title | The controls list is missing the new keys: talk, track job, boss, crates, Chop Shop, race offer, and B on an aggressive Streetmon. | Title → controls. | Added rows and a "Story and the street" section (Menus.ts). | Fixed, verified |
| 3 | Major | Campaign | A new player gets no hint that the story exists. There's no message, and Mama Rust's M is 585 m away, off the minimap. | New game, play 20 s: nothing points at the campaign. | A toast on new work ("Mama Rust has work for you. Look for the yellow M on your map."), batched. Off-map M markers are pinned to the minimap's edge. | Fixed, verified |
| 4 | Minor | UI / starter | The starter picker's third card is cut off on short windows. Same cause as #1. | 597×786 window, New Game. | Same fix as #1. | Fixed, verified |
| 5 | Minor | Campaign | Wasted or busted mid timed delivery leaves the job running: no car, no crate, and the clock ticking from the respawn point. | Courier: pick up, get wasted. Still active with 173 s left. | Busted or wasted now fails an objective that's on a clock (questManager.js). | Fixed, unit test |
| 6 | Minor | Living world | A Streetmon held in an NPC hunt ignores explosions and speeding cars. | A blast next to a hunt: the hunter flees and the Streetmon stays idle. | Removed the hunt exclusion from the threat scan (wildInteractions.js). | Fixed, unit test |
| 7 | Major | HUD | Toasts render under the race, heist and street-event panels, which share the top-left corner, so they can't be read. | Start a street event: its intro toast is hidden behind the panel. | Toasts start below whichever panel is showing, re-checked a few times a second (Hud.layoutToasts). | Fixed, verified |
| 8 | Trivial | Living world | Duel health bars linger on a real-time timer instead of game time. | Code review during charter B. | Game-time linger list in LivingWorld. | Fixed |
| 9 | Trivial | Robustness | `placeCarAt` on a car the streamer has already removed panics Rapier and poisons the physics world. | Found by the test harness; current game code only passes live cars. | Guard on `car.disposed`. | Fixed, verified |
| 10 | Trivial | Living world | Pack followers spawn without checking the wild cap. The soak peaked exactly at the cap, so no breach was seen, but the path was unguarded. | Code review after the soak. | Followers stop at the current street cap (`SpawnSystem.streetCap`). | Fixed |
| 11 | Major | Police | **Pre-existing; found during the regression run.** Police dispatch picks a random road anywhere in the city, then rejects it unless it's 90–170 m from you. Only 3% of picks land there, so about 3 in 4 dispatches fail. At 2 stars, 3 units arrived anywhere from 1.2 s to more than 8 s, and one trial had none by 8 s. | Clear wanted, raise to 2 stars at the player spawn, and repeat. | Dispatch picks only from roads that pass through the ring (`police/spawnRing.ts`): 58% of picks land, against 3% before. | Fixed, unit test, verified: 3 units by 1.2–2.4 s in 5 of 5 trials |

## Regression

| Check | Result |
|---|---|
| Driving, 0–100 km/h (sedan, street z = −279, from x = −380) | 7.09–7.15 s, consistent across runs, with no handling or collision anomalies. s89 and s90 change no vehicle code. |
| Police, 2 stars at the player spawn | 3 units within 2.4 s in every trial (it was erratic before fix #11). The wanted level rises and clears normally. |
| Unit suite | 981 checks pass, including 6 new regression checks. |
| Type check and bundle | Clean. |

**The earlier 6.1 s driving baseline.** It came from stepping frames by hand while the page's own render loop kept stepping the game in between, so more game time passed than the stopwatch counted. With the render loop shut out, the true figure is about 7.1 s. The earlier "first run after a page load" reading of 7.3 s matches this.

## Files changed

- **s89:** `src/ui/Menus.ts`, `src/style.css`, `src/ui/Hud.ts`, `src/core/Game.ts`, `src/systems/questManager.js`, `src/systems/wildInteractions.js`, `src/systems/LivingWorld.ts`, `src/creatures/SpawnSystem.ts`, `tests/run.ts`.
- **s90:** `src/police/PoliceSystem.ts`, `src/police/spawnRing.ts` (new), `tests/run.ts`.
