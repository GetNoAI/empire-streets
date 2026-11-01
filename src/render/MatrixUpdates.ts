import * as THREE from 'three';

/**
 * Skips the world-matrix update for hidden subtrees.
 *
 * three.js recomputes every object's matrices on every render, hidden or not. Most of this game's
 * scene graph is hidden at any moment (the shop and heist interiors, the sewers, whichever layer
 * you're not on: two thirds of ~6,700 objects on the street), so that work is wasted. A hidden
 * object now just marks itself stale; the frame it's shown again its whole subtree is brought up
 * to date before it's drawn (`matrixWorldNeedsUpdate` forces the children through). Reading a
 * hidden object's position with `getWorldPosition` still works (that path updates on demand).
 *
 * Call once at start-up, before the first render.
 */
export function installHiddenMatrixSkip(): void {
  const proto = THREE.Object3D.prototype as THREE.Object3D & { __hiddenSkip?: boolean };
  if (proto.__hiddenSkip) return;
  proto.__hiddenSkip = true;
  const update = proto.updateMatrixWorld;
  proto.updateMatrixWorld = function (this: THREE.Object3D, force?: boolean): void {
    if (!this.visible && this.parent !== null) {
      this.matrixWorldNeedsUpdate = true;
      return;
    }
    update.call(this, force);
  };
}
