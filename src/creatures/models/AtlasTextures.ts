import * as THREE from 'three';
import { ATLAS, atlasImages } from './Atlas';

/**
 * The shared atlas as three.js textures (one set for every model built in code). Loaded .glb
 * models reference the same images as PNG files (public/creatures/atlas/), and CreatureModels
 * swaps their textures for these shared instances, so the GPU holds one copy.
 */

export interface AtlasTextures {
  color: THREE.Texture;
  normal: THREE.Texture;
  orm: THREE.Texture;
}

let shared: AtlasTextures | null = null;

function make(data: Uint8Array, name: string, srgb: boolean): THREE.DataTexture {
  // (a copy: DataTexture wants a plain ArrayBuffer-backed view, and the images stay reusable)
  const t = new THREE.DataTexture(new Uint8Array(data), ATLAS.size, ATLAS.size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.name = name;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.flipY = false; // UVs are in glTF convention (v = 0 at the top of the image)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.userData.atlas = name;
  t.needsUpdate = true;
  return t;
}

export function atlasTextures(): AtlasTextures {
  if (!shared) {
    const img = atlasImages();
    shared = {
      color: make(img.color, 'streetmon_color', true),
      normal: make(img.normal, 'streetmon_normal', false),
      orm: make(img.orm, 'streetmon_orm', false),
    };
  }
  return shared;
}

/** Which atlas image a texture is (by its glTF image file name or our own name), or null. */
export function atlasRole(tex: THREE.Texture | null | undefined): keyof AtlasTextures | null {
  if (!tex) return null;
  const key = `${tex.userData?.atlas ?? ''} ${tex.name ?? ''} ${(tex.source?.data as { src?: string } | undefined)?.src ?? ''}`;
  if (key.includes('streetmon_color')) return 'color';
  if (key.includes('streetmon_normal')) return 'normal';
  if (key.includes('streetmon_orm')) return 'orm';
  return null;
}
