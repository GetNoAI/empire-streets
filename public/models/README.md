# Model slots

The game draws every car and character procedurally. To make it look more realistic, put `.glb`
files in this folder and point `manifest.json` at them, for example:

```json
{
  "vehicles": {
    "taxi": { "url": "models/taxi.glb", "rotationY": 90, "hideProceduralWheels": true }
  },
  "player": { "url": "models/character.glb" }
}
```

- Vehicles are scaled to the car's length, centred, and set on the ground automatically.
  `rotationY` (degrees) turns a model that doesn't face +X (east). Set `hideProceduralWheels` when the
  model has its own wheels (they won't spin or steer).
- The player model is scaled to 1.8 m. Animation clips whose names contain `idle`, `walk` or `run`
  are used automatically.
- A missing or broken file just falls back to the built-in model (check the browser console).

Use models whose licence allows it (for example CC0 packs from Kenney or Quaternius, or
CC-BY models from Sketchfab with credit). Don't use models ripped from commercial games.
