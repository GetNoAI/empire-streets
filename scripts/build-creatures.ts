/**
 * Builds every Streetmon model to binary glTF:
 *   public/creatures/<id>.glb and <id>_shiny.glb (idle, walk, attack, hurt, faint, evolve_glow clips)
 *   public/creatures/manifest.json (id, files, triangle count, bounding box, clip names, nodes, surface)
 *   public/creatures/build-log.txt (the execution log: every file, its budget, polish and validation)
 *   public/creatures/atlas/streetmon_{color,normal,orm}.png (the shared texture atlas the models reference)
 * Every file is validated with the Khronos glTF-Validator (npm package "gltf-validator") and with
 * the project's own structural checks (GlbCheck); errors AND warnings from either fail the build,
 * as does a budget breach.
 *
 *   npm run creatures            (build + validate)
 *   npm run creatures -- --no-khronos   (skip the Khronos validator, e.g. offline without it installed)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { ALL_SPECIES } from '../src/creatures/Data';
import { buildCreatureModel } from '../src/creatures/models/Builders';
import { checkGlb } from '../src/creatures/models/GlbCheck';
import { CLIPS } from '../src/creatures/models/Kit';
import { ATLAS, atlasImages } from '../src/creatures/models/Atlas';
import { atlasRole } from '../src/creatures/models/AtlasTextures';
import { encodePng } from './png';
import { injectAtlas, type AtlasUse } from './glb-textures';
import type * as THREE from 'three';

// GLTFExporter's binary path uses FileReader; Node has Blob but not FileReader.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader ??= NodeFileReader;

const TRI_MIN = 300;
const TRI_MAX = 1500;
const MAX_DRAW_CALLS = 5; // "under 6"
const REQUIRED_CLIPS = CLIPS.map((c) => c.name);

const args = new Set(process.argv.slice(2));
const outDir = path.resolve('public/creatures');
fs.mkdirSync(outDir, { recursive: true });

type Validator = (bytes: Uint8Array, opts: { uri: string; externalResourceFunction?: (uri: string) => Promise<Uint8Array> }) => Promise<{ issues: { numErrors: number; numWarnings: number; messages: Array<{ code: string; message: string; severity: number; pointer?: string }> } }>;

async function loadKhronos(): Promise<Validator | null> {
  if (args.has('--no-khronos')) return null;
  try {
    const mod = (await import('gltf-validator' as string)) as { validateBytes: Validator; default?: { validateBytes: Validator } };
    return mod.validateBytes ?? mod.default?.validateBytes ?? null;
  } catch {
    console.error('\n✖ The Khronos validator ("gltf-validator") is not installed. Run `npm install`, or pass --no-khronos to skip it.\n');
    process.exit(1);
  }
}

const MAP_SLOTS = ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'] as const;

/** Writes the shared atlas images (once per build): the 2048 set the models reference, and the 1024 set phones load instead. */
function writeAtlas(): string[] {
  fs.mkdirSync(path.join(outDir, 'atlas'), { recursive: true });
  const out: string[] = [];
  for (const size of [ATLAS.shipSize, ATLAS.phoneSize]) {
    const img = atlasImages(size);
    for (const k of ['color', 'normal', 'orm'] as const) {
      const file = size === ATLAS.shipSize ? ATLAS.files[k] : ATLAS.files[k].replace(/\.png$/, `${ATLAS.phoneSuffix}.png`);
      fs.writeFileSync(path.join(outDir, file), encodePng(size, size, img[k], k === 'color'));
      if (size === ATLAS.shipSize) out.push(file);
    }
  }
  return out;
}

async function exportGlb(root: THREE.Object3D, clips: THREE.AnimationClip[]): Promise<Uint8Array> {
  // Note which atlas maps each material uses, and take them off for the exporter (it can't encode
  // textures under Node); they go back on afterwards and are referenced as external PNGs.
  const uses: AtlasUse[] = [];
  const saved: Array<[THREE.Material, string, THREE.Texture]> = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const use: AtlasUse = { material: mat.name, color: false, normal: false, orm: false, emissive: false };
    for (const slot of MAP_SLOTS) {
      const tex = mat[slot] as THREE.Texture | null;
      const role = atlasRole(tex);
      if (!tex || !role) continue;
      if (slot === 'map') use.color = true;
      else if (slot === 'normalMap') use.normal = true;
      else if (slot === 'emissiveMap') use.emissive = true;
      else use.orm = true;
      saved.push([mat, slot, tex]);
      (mat as unknown as Record<string, unknown>)[slot] = null;
    }
    if (use.color || use.normal || use.orm || use.emissive) uses.push(use);
  });
  const exporter = new GLTFExporter();
  // Export the skeleton and the skinned meshes as scene roots (not under a wrapper group):
  // glTF ignores parent transforms on skinned meshes, and the validator warns if they have one.
  const roots = [...root.children];
  try {
    const result = await exporter.parseAsync(roots as unknown as THREE.Object3D, { binary: true, animations: clips, onlyVisible: false });
    return injectAtlas(new Uint8Array(result as ArrayBuffer), uses, ATLAS.files);
  } finally {
    for (const [mat, slot, tex] of saved) (mat as unknown as Record<string, unknown>)[slot] = tex;
  }
}

/** Reads an external resource (the atlas PNGs) relative to the output folder. */
const resolveUri = (uri: string): Uint8Array | null => {
  const p = path.join(outDir, decodeURIComponent(uri));
  return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null;
};

async function main(): Promise<void> {
  const validate = await loadKhronos();
  const manifest: unknown[] = [];
  let failed = 0;
  let files = 0;
  let totalErr = 0;
  let totalWarn = 0;
  const tris: number[] = [];
  const t0 = Date.now();
  const log: string[] = [];
  const say = (line: string): void => {
    console.log(line);
    log.push(line);
  };
  const validatorName = validate ? 'Khronos glTF-Validator + GlbCheck' : 'GlbCheck (Khronos-equivalent data checks; gltf-validator not installed)';
  say(`Streetmon creature build — ${new Date().toISOString()}`);
  say(`validator: ${validatorName}; budget ${TRI_MIN}-${TRI_MAX} triangles, <= ${MAX_DRAW_CALLS} draw calls; warnings fail the build`);
  say('');
  const atlasFiles = writeAtlas();
  say(`atlas: ${atlasFiles.map((f) => `public/creatures/${f}`).join(', ')} (${ATLAS.shipSize} x ${ATLAS.shipSize}; ${ATLAS.phoneSize} copies with the ${ATLAS.phoneSuffix} suffix for phones)`);
  say('');
  say(`  ${'file'.padEnd(22)} ${'tris'.padStart(5)}  draws  ${'KB'.padStart(4)}  bevel/plain/cut  merged hidden  wear rust grime  errors warnings`);
  for (const spec of ALL_SPECIES()) {
    const entry: Record<string, unknown> = { id: spec.id, name: spec.name, dex: spec.dex, types: spec.types };
    for (const shiny of [false, true]) {
      const model = buildCreatureModel(spec, shiny);
      const file = `${spec.id}${shiny ? '_shiny' : ''}.glb`;
      const bytes = await exportGlb(model.root, model.clips);
      fs.writeFileSync(path.join(outDir, file), bytes);
      const problems: string[] = [];
      // Budgets and rig contract.
      if (model.triangles < TRI_MIN || model.triangles > TRI_MAX) problems.push(`${model.triangles} triangles (budget ${TRI_MIN}-${TRI_MAX})`);
      if (model.drawCalls > MAX_DRAW_CALLS) problems.push(`${model.drawCalls} draw calls (max ${MAX_DRAW_CALLS})`);
      for (const n of ['root', 'body']) if (!model.nodes.includes(n)) problems.push(`rig is missing node "${n}"`);
      const h = model.bbox.max.y;
      if (Math.abs(h - spec.model.height) > 0.02 + spec.model.height * 0.02) problems.push(`height ${h.toFixed(2)} m, expected ${spec.model.height} m`);
      if (model.bbox.min.y < -0.02) problems.push(`geometry below the feet (min y ${model.bbox.min.y.toFixed(3)})`);
      // Structural checks.
      const own = checkGlb(bytes, { resolve: resolveUri });
      problems.push(...own.errors);
      problems.push(...own.warnings.map((w) => `warning: ${w}`));
      const clipNames = (own.json?.animations ?? []).map((a) => a.name);
      for (const c of REQUIRED_CLIPS) if (!clipNames.includes(c)) problems.push(`missing clip "${c}"`);
      // Khronos validator.
      let kErr = 0;
      let kWarn = 0;
      if (validate) {
        const report = await validate(bytes, {
          uri: file,
          externalResourceFunction: async (uri) => {
            const data = resolveUri(uri);
            if (!data) throw new Error(`missing ${uri}`);
            return data;
          },
        });
        kErr = report.issues.numErrors;
        kWarn = report.issues.numWarnings;
        for (const m of report.issues.messages) if (m.severity <= 1) problems.push(`[gltf-validator] ${m.code}: ${m.message} ${m.pointer ?? ''}`);
      }
      const nErr = own.errors.length + kErr;
      const nWarn = own.warnings.length + kWarn;
      totalErr += nErr;
      totalWarn += nWarn;
      files++;
      tris.push(model.triangles);
      const status = problems.length ? '✖' : '✔';
      const pr = model.polish;
      const cl = model.cells;
      say(
        `${status} ${file.padEnd(22)} ${String(model.triangles).padStart(5)}  ${String(model.drawCalls).padStart(5)}  ${(bytes.byteLength / 1024).toFixed(0).padStart(4)}  ${`${pr.bevelled}/${pr.plain}/${pr.extrasDropped}`.padStart(15)}  ${String(pr.coplanarSaved).padStart(6)} ${String(pr.hiddenCulled).padStart(6)}  ${String(cl.wear ?? 0).padStart(4)} ${String(cl.rust ?? 0).padStart(4)} ${String(cl.grime ?? 0).padStart(5)}  ${String(nErr).padStart(6)} ${String(nWarn).padStart(8)}`,
      );
      for (const p of problems) say(`    - ${p}`);
      if (problems.length) failed++;
      const info = {
        file: `creatures/${file}`,
        triangles: model.triangles,
        drawCalls: model.drawCalls,
        bbox: { min: model.bbox.min.toArray().map((v) => +v.toFixed(3)), max: model.bbox.max.toArray().map((v) => +v.toFixed(3)) },
        clips: clipNames,
        bytes: bytes.byteLength,
        validation: { errors: nErr, warnings: nWarn },
      };
      if (shiny) entry.shiny = info;
      else Object.assign(entry, info, { height: spec.model.height, nodes: model.nodes, surface: model.surface, atlasCells: model.cells, polish: model.polish });
    }
    manifest.push(entry);
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ generated: new Date().toISOString(), validator: validatorName, atlas: { size: ATLAS.size, files: ATLAS.files }, creatures: manifest }, null, 2));
  say('');
  say(`${files} files (${manifest.length} species x standard + shiny) in ${((Date.now() - t0) / 1000).toFixed(1)} s -> public/creatures/`);
  say(`triangles: min ${Math.min(...tris)}, max ${Math.max(...tris)}, mean ${Math.round(tris.reduce((a, b) => a + b, 0) / tris.length)} (hard cap ${TRI_MAX})`);
  say(`validation: ${totalErr} errors, ${totalWarn} warnings across ${files} files`);
  say(`manifest: public/creatures/manifest.json (${manifest.length} entries, bounding boxes and triangle counts refreshed)`);
  say(failed ? `✖ ${failed} file(s) failed validation` : '✔ all models regenerated, valid and recorded in the manifest');
  fs.writeFileSync(path.join(outDir, 'build-log.txt'), log.join('\n') + '\n');
  if (failed) process.exit(1);
}

void main();
