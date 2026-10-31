/**
 * Structural checker for binary glTF (.glb) files, used by the creature build in addition to the
 * Khronos glTF-Validator (when installed) and by the unit tests. Engine-free.
 *
 * Checks: GLB header/chunks, asset version, buffer views inside the buffer, accessors inside their
 * views with valid component types and POSITION min/max, mesh attribute counts, material/accessor
 * references, node hierarchy (valid children, single parent, no cycles), skins (joints exist,
 * inverse bind matrices count), JOINTS_0 indices inside the skin, weights summing to 1,
 * animation channels/samplers (valid targets and paths, strictly increasing keyframe times,
 * output count matching the input, unit quaternions).
 *
 * Plus the Khronos validator's data checks that matter for these models (so a build without the
 * validator installed still enforces them): accessor min/max equal to the actual data
 * (ACCESSOR_MIN/MAX_MISMATCH), unit-length normals (ACCESSOR_NON_UNIT), COLOR_0 inside [0, 1],
 * no duplicate joints with non-zero weight, non-negative weights, material factors in range,
 * every extension used declared in extensionsUsed, and skinned meshes at the scene root with no
 * local transform (NODE_SKINNED_MESH_NON_ROOT / _LOCAL_TRANSFORMS, reported as warnings).
 *
 * Textures: image/sampler/texture references, external image files present (with `resolve`) and
 * really PNGs, every textured primitive has the TEXCOORD set its material reads, TEXCOORD_0 is a
 * float VEC2, and TANGENT is a float VEC4 with unit xyz and w = +-1.
 */

export interface GlbReport {
  errors: string[];
  warnings: string[];
  json: GltfJson | null;
}

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
  normalized?: boolean;
}

interface GltfJson {
  asset?: { version?: string };
  buffers?: Array<{ byteLength: number; uri?: string }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>;
  accessors?: Accessor[];
  meshes?: Array<{ name?: string; primitives: Array<{ attributes: Record<string, number>; indices?: number; material?: number; mode?: number }> }>;
  materials?: Material[];
  nodes?: Array<{ name?: string; children?: number[]; mesh?: number; skin?: number; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }>;
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  images?: Array<{ uri?: string; bufferView?: number; mimeType?: string }>;
  samplers?: Array<{ magFilter?: number; minFilter?: number; wrapS?: number; wrapT?: number }>;
  textures?: Array<{ source?: number; sampler?: number }>;
  skins?: Array<{ joints: number[]; inverseBindMatrices?: number; skeleton?: number }>;
  animations?: Array<{ name?: string; channels: Array<{ sampler: number; target: { node?: number; path: string } }>; samplers: Array<{ input: number; output: number; interpolation?: string }> }>;
  scenes?: Array<{ nodes?: number[] }>;
  scene?: number;
}

interface TexRef {
  index: number;
  texCoord?: number;
  scale?: number;
  strength?: number;
}

interface Material {
  name?: string;
  pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number; baseColorTexture?: TexRef; metallicRoughnessTexture?: TexRef };
  normalTexture?: TexRef;
  occlusionTexture?: TexRef;
  emissiveTexture?: TexRef;
  emissiveFactor?: number[];
  alphaMode?: string;
  extensions?: Record<string, { emissiveStrength?: number } | undefined>;
}

const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const PATH_COMPONENTS: Record<string, number> = { translation: 3, rotation: 4, scale: 3, weights: 1 };

export interface CheckOptions {
  /** Loads an external resource (image URI relative to the .glb); null if missing. */
  resolve?: (uri: string) => Uint8Array | null;
}

export function checkGlb(bytes: Uint8Array, opts: CheckOptions = {}): GlbReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20) return { errors: ['file too short for a GLB'], warnings, json: null };
  if (dv.getUint32(0, true) !== 0x46546c67) errors.push('bad magic (not "glTF")');
  if (dv.getUint32(4, true) !== 2) errors.push(`GLB version ${dv.getUint32(4, true)}, expected 2`);
  if (dv.getUint32(8, true) !== bytes.byteLength) errors.push(`header length ${dv.getUint32(8, true)} != file size ${bytes.byteLength}`);
  // Chunks.
  let off = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  let chunkIndex = 0;
  while (off + 8 <= bytes.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > bytes.byteLength) {
      errors.push(`chunk ${chunkIndex} runs past the end of the file`);
      break;
    }
    if (len % 4 !== 0) errors.push(`chunk ${chunkIndex} length ${len} not 4-byte aligned`);
    if (chunkIndex === 0 && type !== 0x4e4f534a) errors.push('first chunk is not JSON');
    if (type === 0x4e4f534a) {
      try {
        json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + len)).replace(/[\s\0]+$/, '')) as GltfJson;
      } catch (e) {
        errors.push(`JSON chunk does not parse: ${(e as Error).message}`);
      }
    } else if (type === 0x004e4942) bin = bytes.subarray(start, start + len);
    off = start + len;
    chunkIndex++;
  }
  if (!json) return { errors: errors.length ? errors : ['no JSON chunk'], warnings, json: null };
  const j = json;
  if (j.asset?.version !== '2.0') errors.push(`asset.version is "${j.asset?.version}", expected "2.0"`);

  const buffers = j.buffers ?? [];
  buffers.forEach((b, i) => {
    if (b.uri === undefined) {
      if (i !== 0) errors.push(`buffer ${i} has no uri (only buffer 0 may use the GLB BIN chunk)`);
      else if (!bin) errors.push('buffer 0 has no uri but there is no BIN chunk');
      else if (b.byteLength > bin.byteLength) errors.push(`buffer 0 byteLength ${b.byteLength} > BIN chunk ${bin.byteLength}`);
    }
  });
  const views = j.bufferViews ?? [];
  views.forEach((v, i) => {
    const buf = buffers[v.buffer];
    if (!buf) errors.push(`bufferView ${i}: buffer ${v.buffer} doesn't exist`);
    else if ((v.byteOffset ?? 0) + v.byteLength > buf.byteLength) errors.push(`bufferView ${i} runs past the end of buffer ${v.buffer}`);
  });
  const accessors = j.accessors ?? [];
  const accData = (i: number): Float32Array | Uint16Array | Uint8Array | Uint32Array | null => {
    const a = accessors[i];
    if (!a || a.bufferView === undefined || !bin) return null;
    const v = views[a.bufferView];
    if (!v) return null;
    const n = a.count * TYPE_SIZE[a.type];
    const start = bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const stride = v.byteStride;
    if (stride && stride !== COMPONENT_SIZE[a.componentType] * TYPE_SIZE[a.type]) return null; // interleaved: skip value checks
    const buf = bin.buffer.slice(start, start + n * COMPONENT_SIZE[a.componentType]);
    switch (a.componentType) {
      case 5126:
        return new Float32Array(buf);
      case 5123:
        return new Uint16Array(buf);
      case 5121:
        return new Uint8Array(buf);
      case 5125:
        return new Uint32Array(buf);
      default:
        return null;
    }
  };
  accessors.forEach((a, i) => {
    if (!(a.componentType in COMPONENT_SIZE)) errors.push(`accessor ${i}: invalid componentType ${a.componentType}`);
    if (!(a.type in TYPE_SIZE)) errors.push(`accessor ${i}: invalid type ${a.type}`);
    if (!(a.count >= 1)) errors.push(`accessor ${i}: count must be >= 1`);
    if (a.bufferView !== undefined) {
      const v = views[a.bufferView];
      if (!v) errors.push(`accessor ${i}: bufferView ${a.bufferView} doesn't exist`);
      else {
        const elem = COMPONENT_SIZE[a.componentType] * TYPE_SIZE[a.type];
        const stride = v.byteStride ?? elem;
        const need = (a.byteOffset ?? 0) + stride * (a.count - 1) + elem;
        if (need > v.byteLength) errors.push(`accessor ${i} runs past the end of bufferView ${a.bufferView}`);
        if ((a.byteOffset ?? 0) % COMPONENT_SIZE[a.componentType] !== 0) errors.push(`accessor ${i}: misaligned byteOffset`);
      }
    }
    if (a.min && a.min.length !== TYPE_SIZE[a.type]) errors.push(`accessor ${i}: min has the wrong length`);
    if (a.max && a.max.length !== TYPE_SIZE[a.type]) errors.push(`accessor ${i}: max has the wrong length`);
    // Declared bounds must equal the data's (the Khronos validator's ACCESSOR_MIN/MAX_MISMATCH).
    if (a.min && a.max && a.componentType === 5126) {
      const d = accData(i);
      const n = TYPE_SIZE[a.type];
      if (d) {
        const lo = new Array<number>(n).fill(Infinity);
        const hi = new Array<number>(n).fill(-Infinity);
        for (let k = 0; k < d.length; k++) {
          lo[k % n] = Math.min(lo[k % n], d[k]);
          hi[k % n] = Math.max(hi[k % n], d[k]);
        }
        for (let c = 0; c < n; c++) {
          if (Math.fround(a.min[c]) !== lo[c]) {
            errors.push(`accessor ${i}: declared min[${c}] ${a.min[c]} != actual ${lo[c]}`);
            break;
          }
          if (Math.fround(a.max[c]) !== hi[c]) {
            errors.push(`accessor ${i}: declared max[${c}] ${a.max[c]} != actual ${hi[c]}`);
            break;
          }
        }
      }
    }
  });

  const materials = j.materials ?? [];
  const meshes = j.meshes ?? [];
  meshes.forEach((m, mi) => {
    for (const [pi, p] of m.primitives.entries()) {
      const where = `mesh ${mi} primitive ${pi}`;
      let count = -1;
      for (const [name, ai] of Object.entries(p.attributes)) {
        const a = accessors[ai];
        if (!a) {
          errors.push(`${where}: attribute ${name} accessor ${ai} doesn't exist`);
          continue;
        }
        if (count === -1) count = a.count;
        else if (a.count !== count) errors.push(`${where}: attribute ${name} has ${a.count} items, others have ${count}`);
        if (name === 'POSITION') {
          if (a.type !== 'VEC3' || a.componentType !== 5126) errors.push(`${where}: POSITION must be float VEC3`);
          if (!a.min || !a.max) errors.push(`${where}: POSITION accessor needs min and max`);
          const d = accData(ai);
          if (d && a.min && a.max) {
            for (let k = 0; k < d.length; k++) {
              const c = k % 3;
              if (d[k] < a.min[c] - 1e-4 || d[k] > a.max[c] + 1e-4) {
                errors.push(`${where}: POSITION value outside accessor min/max`);
                break;
              }
            }
          }
        }
        if (name === 'NORMAL') {
          const d = accData(ai);
          if (d) {
            for (let k = 0; k < d.length; k += 3) {
              const l = Math.hypot(d[k], d[k + 1], d[k + 2]);
              if (Math.abs(l - 1) > 0.0005) {
                errors.push(`${where}: NORMAL not unit length (${l.toFixed(4)})`);
                break;
              }
            }
          }
        }
        if (name === 'WEIGHTS_0') {
          const d = accData(ai);
          if (d) {
            for (let k = 0; k < d.length; k += 4) {
              const s = d[k] + d[k + 1] + d[k + 2] + d[k + 3];
              if (Math.abs(s - 1) > 0.005) {
                errors.push(`${where}: WEIGHTS_0 don't sum to 1`);
                break;
              }
              if (d[k] < 0 || d[k + 1] < 0 || d[k + 2] < 0 || d[k + 3] < 0) {
                errors.push(`${where}: negative WEIGHTS_0`);
                break;
              }
            }
            // A joint may appear twice in a vertex only with zero weight (ACCESSOR_JOINTS_INDEX_DUPLICATE).
            const jd = p.attributes.JOINTS_0 !== undefined ? accData(p.attributes.JOINTS_0) : null;
            if (jd && jd.length === d.length) {
              outer: for (let k = 0; k < d.length; k += 4)
                for (let x = 0; x < 4; x++)
                  for (let y = x + 1; y < 4; y++)
                    if (jd[k + x] === jd[k + y] && d[k + x] > 0 && d[k + y] > 0) {
                      errors.push(`${where}: JOINTS_0 repeats joint ${jd[k + x]} with non-zero weight`);
                      break outer;
                    }
            }
          }
        }
        if (name === 'COLOR_0') {
          if (a.type !== 'VEC3' && a.type !== 'VEC4') errors.push(`${where}: COLOR_0 must be VEC3 or VEC4`);
          const d = accData(ai);
          if (d instanceof Float32Array)
            for (let k = 0; k < d.length; k++)
              if (!(d[k] >= 0 && d[k] <= 1)) {
                errors.push(`${where}: COLOR_0 value ${d[k]} outside [0, 1]`);
                break;
              }
        }
      }
      if (p.material !== undefined && !materials[p.material]) errors.push(`${where}: material ${p.material} doesn't exist`);
      if (p.indices !== undefined && !accessors[p.indices]) errors.push(`${where}: indices accessor doesn't exist`);
    }
  });

  // Materials: factors in range.
  const in01 = (v: number | undefined): boolean => v === undefined || (v >= 0 && v <= 1);
  const extUsed = new Set<string>();
  materials.forEach((m, i) => {
    const pbr = m.pbrMetallicRoughness;
    if (pbr?.baseColorFactor && (pbr.baseColorFactor.length !== 4 || !pbr.baseColorFactor.every((v) => in01(v)))) errors.push(`material ${i}: baseColorFactor outside [0, 1]`);
    if (!in01(pbr?.metallicFactor)) errors.push(`material ${i}: metallicFactor outside [0, 1]`);
    if (!in01(pbr?.roughnessFactor)) errors.push(`material ${i}: roughnessFactor outside [0, 1]`);
    if (m.emissiveFactor && (m.emissiveFactor.length !== 3 || !m.emissiveFactor.every((v) => in01(v)))) errors.push(`material ${i}: emissiveFactor outside [0, 1]`);
    if (m.alphaMode && !['OPAQUE', 'MASK', 'BLEND'].includes(m.alphaMode)) errors.push(`material ${i}: invalid alphaMode ${m.alphaMode}`);
    for (const [name, ext] of Object.entries(m.extensions ?? {})) {
      extUsed.add(name);
      if (name === 'KHR_materials_emissive_strength' && !((ext?.emissiveStrength ?? 1) >= 0)) errors.push(`material ${i}: negative emissiveStrength`);
    }
  });
  // Textures, samplers, images.
  const images = j.images ?? [];
  const textures = j.textures ?? [];
  const samplers = j.samplers ?? [];
  images.forEach((im, i) => {
    if (im.uri === undefined && im.bufferView === undefined) errors.push(`image ${i}: needs a uri or a bufferView`);
    if (im.bufferView !== undefined && !views[im.bufferView]) errors.push(`image ${i}: bufferView ${im.bufferView} doesn't exist`);
    if (im.uri !== undefined && !im.uri.startsWith('data:') && opts.resolve) {
      const data = opts.resolve(im.uri);
      if (!data) errors.push(`image ${i}: external file "${im.uri}" not found`);
      else if (!(data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) && !(data[0] === 0xff && data[1] === 0xd8)) errors.push(`image ${i}: "${im.uri}" is not a PNG or JPEG`);
    }
  });
  textures.forEach((t, i) => {
    if (t.source !== undefined && !images[t.source]) errors.push(`texture ${i}: image ${t.source} doesn't exist`);
    if (t.sampler !== undefined && !samplers[t.sampler]) errors.push(`texture ${i}: sampler ${t.sampler} doesn't exist`);
  });
  const texSets = new Map<number, Set<number>>(); // material -> TEXCOORD sets it reads
  materials.forEach((m, i) => {
    const refs: Array<[string, TexRef | undefined]> = [
      ['baseColorTexture', m.pbrMetallicRoughness?.baseColorTexture],
      ['metallicRoughnessTexture', m.pbrMetallicRoughness?.metallicRoughnessTexture],
      ['normalTexture', m.normalTexture],
      ['occlusionTexture', m.occlusionTexture],
      ['emissiveTexture', m.emissiveTexture],
    ];
    for (const [slot, r] of refs) {
      if (!r) continue;
      if (!textures[r.index]) errors.push(`material ${i}: ${slot} texture ${r.index} doesn't exist`);
      if (!texSets.has(i)) texSets.set(i, new Set());
      texSets.get(i)!.add(r.texCoord ?? 0);
    }
  });
  meshes.forEach((m, mi) => {
    for (const [pi, p] of m.primitives.entries()) {
      const sets = p.material !== undefined ? texSets.get(p.material) : undefined;
      for (const set of sets ?? []) if (p.attributes[`TEXCOORD_${set}`] === undefined) errors.push(`mesh ${mi} primitive ${pi}: material reads TEXCOORD_${set}, which the primitive doesn't have`);
      const uvAcc = p.attributes.TEXCOORD_0 !== undefined ? accessors[p.attributes.TEXCOORD_0] : undefined;
      if (uvAcc && (uvAcc.type !== 'VEC2' || uvAcc.componentType !== 5126)) errors.push(`mesh ${mi} primitive ${pi}: TEXCOORD_0 must be float VEC2`);
      const ti = p.attributes.TANGENT;
      if (ti !== undefined) {
        const a = accessors[ti];
        if (!a || a.type !== 'VEC4' || a.componentType !== 5126) errors.push(`mesh ${mi} primitive ${pi}: TANGENT must be float VEC4`);
        else {
          const d = accData(ti);
          if (d)
            for (let k = 0; k < d.length; k += 4) {
              if (Math.abs(Math.hypot(d[k], d[k + 1], d[k + 2]) - 1) > 0.0005 || Math.abs(Math.abs(d[k + 3]) - 1) > 1e-6) {
                errors.push(`mesh ${mi} primitive ${pi}: TANGENT xyz not unit or w not +-1`);
                break;
              }
            }
        }
      }
    }
  });
  const declared = new Set(j.extensionsUsed ?? []);
  for (const e of extUsed) if (!declared.has(e)) errors.push(`extension ${e} is used but not in extensionsUsed`);
  for (const e of declared) if (!extUsed.has(e)) warnings.push(`extension ${e} is declared in extensionsUsed but never used`);
  for (const e of j.extensionsRequired ?? []) if (!declared.has(e)) errors.push(`extensionsRequired ${e} is missing from extensionsUsed`);

  // Nodes: references, single parent, no cycles.
  const nodes = j.nodes ?? [];
  const parent = new Array<number>(nodes.length).fill(-1);
  nodes.forEach((n, i) => {
    for (const c of n.children ?? []) {
      if (!nodes[c]) errors.push(`node ${i}: child ${c} doesn't exist`);
      else if (parent[c] !== -1) errors.push(`node ${c} has two parents`);
      else parent[c] = i;
    }
    if (n.mesh !== undefined && !meshes[n.mesh]) errors.push(`node ${i}: mesh ${n.mesh} doesn't exist`);
    if (n.rotation) {
      const l = Math.hypot(...n.rotation);
      if (Math.abs(l - 1) > 0.001) errors.push(`node ${i}: rotation is not a unit quaternion`);
    }
  });
  nodes.forEach((_, i) => {
    const seen = new Set<number>();
    let p = i;
    while (p !== -1) {
      if (seen.has(p)) {
        errors.push(`node hierarchy has a cycle through node ${i}`);
        break;
      }
      seen.add(p);
      p = parent[p];
    }
  });
  // Skins.
  const skins = j.skins ?? [];
  skins.forEach((s, si) => {
    for (const jn of s.joints) if (!nodes[jn]) errors.push(`skin ${si}: joint node ${jn} doesn't exist`);
    if (s.inverseBindMatrices !== undefined) {
      const a = accessors[s.inverseBindMatrices];
      if (!a) errors.push(`skin ${si}: inverseBindMatrices accessor doesn't exist`);
      else if (a.type !== 'MAT4' || a.count !== s.joints.length) errors.push(`skin ${si}: inverseBindMatrices must be ${s.joints.length} MAT4s`);
    }
  });
  nodes.forEach((n, i) => {
    if (n.skin === undefined) return;
    const s = skins[n.skin];
    if (!s) {
      errors.push(`node ${i}: skin ${n.skin} doesn't exist`);
      return;
    }
    // Parent and local transforms don't affect a skinned mesh; Khronos warns when it has either.
    if (parent[i] !== -1) warnings.push(`node ${i} (${n.name ?? '?'}): skinned mesh is not a root node (NODE_SKINNED_MESH_NON_ROOT)`);
    if (n.translation || n.rotation || n.scale || n.matrix) warnings.push(`node ${i} (${n.name ?? '?'}): skinned mesh has a local transform (NODE_SKINNED_MESH_LOCAL_TRANSFORMS)`);
    if (n.mesh === undefined) errors.push(`node ${i}: has a skin but no mesh`);
    else
      for (const p of meshes[n.mesh]?.primitives ?? []) {
        const ji = p.attributes.JOINTS_0;
        if (ji === undefined) {
          errors.push(`node ${i}: skinned mesh without JOINTS_0`);
          continue;
        }
        const d = accData(ji);
        if (d) for (let k = 0; k < d.length; k++) if (d[k] >= s.joints.length) {
          errors.push(`node ${i}: JOINTS_0 index ${d[k]} >= ${s.joints.length} joints`);
          break;
        }
      }
  });
  // Animations.
  for (const [ai, an] of (j.animations ?? []).entries()) {
    const where = `animation ${ai} (${an.name ?? '?'})`;
    for (const ch of an.channels) {
      const smp = an.samplers[ch.sampler];
      if (!smp) {
        errors.push(`${where}: channel sampler ${ch.sampler} doesn't exist`);
        continue;
      }
      if (ch.target.node === undefined || !nodes[ch.target.node]) errors.push(`${where}: channel target node doesn't exist`);
      if (!(ch.target.path in PATH_COMPONENTS)) errors.push(`${where}: invalid target path ${ch.target.path}`);
      const inp = accessors[smp.input];
      const out = accessors[smp.output];
      if (!inp || !out) {
        errors.push(`${where}: sampler accessors missing`);
        continue;
      }
      if (!inp.min || !inp.max) errors.push(`${where}: input accessor needs min and max`);
      const comps = ch.target.path === 'weights' ? out.count / inp.count : PATH_COMPONENTS[ch.target.path];
      const perKey = smp.interpolation === 'CUBICSPLINE' ? 3 : 1;
      if (ch.target.path !== 'weights' && out.count !== inp.count * perKey) errors.push(`${where}: ${out.count} output values for ${inp.count} keyframes`);
      if (ch.target.path !== 'weights' && TYPE_SIZE[out.type] !== comps) errors.push(`${where}: output type ${out.type} wrong for ${ch.target.path}`);
      const times = accData(smp.input);
      if (times) {
        for (let k = 1; k < times.length; k++) {
          if (!(times[k] > times[k - 1])) {
            errors.push(`${where}: keyframe times not strictly increasing`);
            break;
          }
        }
        if (times[0] < 0) errors.push(`${where}: negative keyframe time`);
      }
      if (ch.target.path === 'rotation') {
        const q = accData(smp.output);
        if (q instanceof Float32Array)
          for (let k = 0; k < q.length; k += 4) {
            if (Math.abs(Math.hypot(q[k], q[k + 1], q[k + 2], q[k + 3]) - 1) > 0.002) {
              errors.push(`${where}: rotation keyframe is not a unit quaternion`);
              break;
            }
          }
      }
    }
  }
  if (j.scene !== undefined && !(j.scenes ?? [])[j.scene]) errors.push(`scene ${j.scene} doesn't exist`);
  return { errors, warnings, json: j };
}
