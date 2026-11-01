import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges a group's static mesh children that share a material into one mesh each (their
 * transforms baked in), so a pier of 270 planks, posts and bollards costs 18 draw calls instead of
 * 270. Only direct children are touched, and only plain meshes with one material and no children
 * of their own; anything in `keep` (parts something moves or hides later) is left alone, as are
 * groups (boats, doors) and instanced or skinned meshes. Shadow flags are kept: meshes are only
 * merged with others that cast and receive the same way.
 *
 * Returns how many draw calls it saved.
 */
export function mergeStaticChildren(root: THREE.Object3D, keep: ReadonlySet<THREE.Object3D> = new Set()): number {
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; meshes: THREE.Mesh[] }>();
  for (const o of root.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) continue;
    if (Array.isArray(m.material) || m.children.length || keep.has(m) || !m.visible) continue;
    if (m.geometry.morphAttributes && Object.keys(m.geometry.morphAttributes).length) continue;
    const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, meshes: [] }));
    b.meshes.push(m);
  }
  let saved = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const parts = b.meshes.map((m) => {
      m.updateMatrix();
      return normalise(m.geometry).applyMatrix4(m.matrix);
    });
    // Different primitives can carry different attributes; merge only what they all have.
    const common = Object.keys(parts[0].attributes).filter((k) => parts.every((p) => p.attributes[k]));
    for (const p of parts) for (const k of Object.keys(p.attributes)) if (!common.includes(k)) p.deleteAttribute(k);
    const geo = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!geo) continue;
    const merged = new THREE.Mesh(geo, b.mat);
    merged.castShadow = b.cast;
    merged.receiveShadow = b.receive;
    merged.name = `${root.name || 'merged'}-static`;
    // (The originals' geometry is often shared with other meshes, so it isn't disposed here;
    // this runs at build time, before anything reached the GPU.)
    for (const m of b.meshes) root.remove(m);
    root.add(merged);
    saved += b.meshes.length - 1;
  }
  return saved;
}

/** Non-indexed, no groups (so any two parts can be merged). */
function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  n.clearGroups();
  if (!n.attributes['normal']) n.computeVertexNormals();
  return n;
}
