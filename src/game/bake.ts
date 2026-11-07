// Merge a chunk's static meshes into one mesh per material, so a chunk of houses, rocks
// and lanterns costs a handful of draw calls instead of hundreds. That matters twice
// over here, because the water's reflection draws the whole scene a second time.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Replace the group's static meshes with merged ones; meshes marked `userData.keep` and non-meshes stay. */
export function bake(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o === group) return;
    if (o instanceof THREE.Mesh && !o.userData.keep && !Array.isArray(o.material)) {
      // Every part becomes non-indexed with the same three attributes, so all of them can merge.
      let g = (o.geometry as THREE.BufferGeometry).clone();
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position!.count) * 2), 2));
      g.applyMatrix4(o.matrixWorld);
      const list = byMaterial.get(o.material) ?? [];
      list.push(g);
      byMaterial.set(o.material, list);
    } else if (!(o instanceof THREE.Group)) {
      // Sprites, lights, points and meshes marked to keep (they animate).
      keep.push(o);
    }
  });
  // Pull the kept objects out with their world transforms before clearing the group.
  const kept = keep.map((o) => {
    const m = o.matrixWorld.clone();
    return { o, m };
  });
  group.clear();
  for (const { o, m } of kept) {
    m.decompose(o.position, o.quaternion, o.scale);
    group.add(o);
  }
  for (const [material, geos] of byMaterial) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) throw new Error(`could not merge ${geos.length} meshes for ${material.name || material.type}`);
    group.add(new THREE.Mesh(merged, material));
  }
}
