# Blender batch polish (`batch_update.py`)

Re-polishes every Streetmon `.glb` in Blender, headless, keeping file names, rigs, vertex weights,
animation clips and vertex colours. Originals are never touched: the output goes to its own folder.

## Run it

From the project folder (macOS; Blender 4.2 or later, tested with 5.2.3 LTS):

```bash
cd ~/workspace/empire-streets
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender   # or just `blender` if it's on your PATH

# The spec as written (bevel 0.02 m x 2 segments)
"$BLENDER" --background --factory-startup --python scripts/blender/batch_update.py -- \
  --input-dir "public/creatures" --output-dir "build/blender-polished"

# The same, but staying inside the 1,500-triangle budget
# (retries with 1 bevel segment, then without the bevel)
"$BLENDER" --background --factory-startup --python scripts/blender/batch_update.py -- \
  --input-dir "public/creatures" --output-dir "build/blender-polished-fit" --fit-budget
```

`--factory-startup` keeps your own Blender preferences and add-ons out of the run. Everything
after the lone `--` goes to the script. Exit code 0 = every file exported; 1 = at least one failed.

To process a few files only: `--pattern "woofer*.glb"`.

### All options

| Option | Default | |
|---|---|---|
| `--input-dir` | (required) | folder of `.glb` files |
| `--output-dir` | (required) | destination; must differ from the input |
| `--manifest` | `<input-dir>/manifest.json` | species types for the material rules |
| `--pattern` | `*.glb` | which files |
| `--bevel-offset` | `0.02` | bevel width, metres |
| `--bevel-segments` | `2` | |
| `--bevel-angle` | `30` | angle limit, degrees |
| `--smooth-angle` | `40` | smooth-by-angle, degrees |
| `--emission-strength` | `3.5` | emissive accents |
| `--clearcoat` | `0.15` | glossy surfaces and vehicles |
| `--tri-budget` | `1500` | warn above this (0 = off) |
| `--fit-budget` | off | reduce the bevel until the model fits the budget |
| `--merge-distance` | `0.00001` | weld distance for duplicate vertices |

## What it does to each file

1. Empty scene, import.
2. Meshes: rotation and scale applied (armatures are left alone so their animation stays intact),
   duplicate vertices welded per bone (parts on different bones are never joined), loose
   vertices/edges removed, normals recalculated outside, smooth by angle 40°, then a Bevel
   modifier (0.02 m, 2 segments, 30° limit, Harden Normals) and a Weighted Normal modifier, with
   the Armature modifier moved last. Vertex colours are moved to face corners first, so welding
   can't blur colour seams.
3. Materials, by material name and the species' types from the manifest:
   - metallic (gun / metal / chrome / steel, or a Gun species): Metallic 0.85, Roughness 0.25
   - matte (concrete / ground / stone, or a Concrete species): Metallic 0.0, Roughness 0.85
   - emissive (eyes / lights / cores / glow, or anything already emitting): Emission Strength 3.5;
     the game's pulse settings in the material extras get the new base value
   - Clearcoat 0.15 on vehicles and glossy surfaces (Bass and Sludge species, glossy names, or
     roughness ≤ 0.35)
   - translucent materials are left as they are
4. Rig: joints keep the input file's rest transforms exactly. Blender bones can't hold a rest
   *scale*, so joints that have one (the evolve aura, collapsed at 0.001) get their scale put
   back in the pose and a constant key in every clip that doesn't animate them; without that the
   aura shell would show in every clip.
5. Export `.glb`: modifiers applied (except the armature), +Y up, all clips, vertex colours,
   extras. Skinned meshes are parented to the armature for the exporter, and the armature
   object's own node is dropped, so the meshes sit at the scene root in the file (otherwise the
   Khronos validator warns `NODE_SKINNED_MESH_NON_ROOT`).
6. Each output is read back and compared with its input: triangles, clip names, joint names,
   joint rest scales, colour attributes, budget. `batch_log.txt` and `batch_log.json` go in the
   output folder.

## Results on the 68 Streetmon models (Blender 5.2.3 LTS, 2026-10-29)

| | Spec settings | `--fit-budget` |
|---|---|---|
| Triangles (all 68) | 79,380 -> 541,364 (+582%) | 79,380 (unchanged) |
| Per model | 4,372 - 11,208 | 694 - 1,488 |
| Over the 1,500 budget | 68 | 0 |
| Bevel kept | 2 segments | none (1 segment is still over budget for every model) |
| Khronos validator | 0 errors, 0 warnings | 0 errors, 0 warnings |
| Clips / joints / COLOR_0 | all kept | all kept |
| Time | about 4 s per file | about 4 s per file |

The models are already chamfered by the code that builds them (`src/creatures/models/Polish.ts`),
so the Blender bevel adds a second, much denser set of edges.

## Before using the output in the game

- `npm run creatures` regenerates `public/creatures` from code and **overwrites** anything copied
  there. To ship Blender-polished models, copy them in after the last `npm run creatures`, or
  load them from their own folder.
- Validate the output with the Khronos validator (fails on any error or warning):
  `npm run validate:glb -- build/blender-polished`
