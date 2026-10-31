// Points a .glb's materials at the shared atlas images (external PNG files next to the models).
//
// three.js's GLTFExporter can't encode textures under Node (it needs a canvas), and embedding the
// same three images in all 68 files would multiply them anyway. So the build exports without
// textures, then rewrites the GLB's JSON chunk: one image/texture entry per atlas file, and the
// texture slots on every material that used them in three.js.

export interface AtlasUse {
  /** glTF material name. */
  material: string;
  color: boolean;
  normal: boolean;
  orm: boolean;
  emissive: boolean;
}

export interface AtlasFiles {
  color: string;
  normal: string;
  orm: string;
}

interface Json {
  images?: unknown[];
  samplers?: unknown[];
  textures?: unknown[];
  materials?: Array<Record<string, unknown> & { name?: string; pbrMetallicRoughness?: Record<string, unknown> }>;
  [k: string]: unknown;
}

const GL = { LINEAR: 9729, LINEAR_MIPMAP_LINEAR: 9987, CLAMP_TO_EDGE: 33071 };

function readGlb(bytes: Uint8Array): { json: Json; bin: Uint8Array | null } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)).replace(/[\s\0]+$/, '')) as Json;
  let bin: Uint8Array | null = null;
  const off = 20 + jsonLen;
  if (off + 8 <= bytes.byteLength) {
    const binLen = dv.getUint32(off, true);
    bin = bytes.subarray(off + 8, off + 8 + binLen);
  }
  return { json, bin };
}

function writeGlb(json: Json, bin: Uint8Array | null): Uint8Array {
  let text = JSON.stringify(json);
  while (new TextEncoder().encode(text).length % 4) text += ' ';
  const jb = new TextEncoder().encode(text);
  const total = 12 + 8 + jb.length + (bin ? 8 + bin.length : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20);
  if (bin) {
    const o = 20 + jb.length;
    dv.setUint32(o, bin.length, true);
    dv.setUint32(o + 4, 0x004e4942, true);
    out.set(bin, o + 8);
  }
  return out;
}

/** Adds the atlas images and texture slots to the materials listed in `uses`. */
export function injectAtlas(bytes: Uint8Array, uses: AtlasUse[], files: AtlasFiles): Uint8Array {
  const { json, bin } = readGlb(bytes);
  if (!uses.some((u) => u.color || u.normal || u.orm || u.emissive)) return bytes;
  json.images = json.images ?? [];
  json.samplers = json.samplers ?? [];
  json.textures = json.textures ?? [];
  const sampler = json.samplers.length;
  json.samplers.push({ magFilter: GL.LINEAR, minFilter: GL.LINEAR_MIPMAP_LINEAR, wrapS: GL.CLAMP_TO_EDGE, wrapT: GL.CLAMP_TO_EDGE });
  const tex: Record<keyof AtlasFiles, number> = { color: -1, normal: -1, orm: -1 };
  for (const k of ['color', 'normal', 'orm'] as const) {
    if (!uses.some((u) => u[k] || (k === 'color' && u.emissive))) continue;
    const image = json.images.length;
    json.images.push({ uri: files[k], mimeType: 'image/png', name: `streetmon_${k}` });
    tex[k] = json.textures.length;
    json.textures.push({ sampler, source: image, name: `streetmon_${k}` });
  }
  for (const u of uses) {
    const m = (json.materials ?? []).find((x) => x.name === u.material);
    if (!m) throw new Error(`material "${u.material}" not found in the exported file`);
    const pbr = (m.pbrMetallicRoughness = m.pbrMetallicRoughness ?? {});
    if (u.color) pbr.baseColorTexture = { index: tex.color };
    if (u.orm) {
      pbr.metallicRoughnessTexture = { index: tex.orm };
      // The ORM image holds the values; factors 1 (the glTF default) let it through unchanged.
      delete pbr.metallicFactor;
      delete pbr.roughnessFactor;
      m.occlusionTexture = { index: tex.orm };
    }
    if (u.normal) m.normalTexture = { index: tex.normal };
    if (u.emissive) m.emissiveTexture = { index: tex.color };
  }
  return writeGlb(json, bin);
}
