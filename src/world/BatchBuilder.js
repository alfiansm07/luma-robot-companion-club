import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Construction-only geometry batching; static shelter meshes are merged by material and shadow policy. */
export class BatchBuilder {
  constructor(root) {
    this.root = root;
    this.batches = new Map();
    this.shapes = new Map();
    this.transform = new THREE.Object3D();
  }

  /** Adds a transformed primitive to its material batch without creating a scene object. */
  add(
    geometry,
    material,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    shadow = true,
  ) {
    const key = `${material.uuid}/${shadow}`;
    if (!this.batches.has(key)) this.batches.set(key, { material, shadow, geometries: [] });
    this.transform.position.fromArray(position);
    this.transform.rotation.set(...rotation);
    this.transform.scale.fromArray(scale);
    this.transform.updateMatrix();
    let copy = geometry.clone();
    if (copy.index) {
      const expanded = copy.toNonIndexed();
      copy.dispose();
      copy = expanded;
    }
    copy.applyMatrix4(this.transform.matrix);
    // Every primitive uses these common attributes; tangents are not needed by our materials.
    for (const name of Object.keys(copy.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) copy.deleteAttribute(name);
    this.batches.get(key).geometries.push(copy);
  }

  /** Returns a cached primitive shared during construction only. */
  shape(name) {
    if (this.shapes.has(name)) return this.shapes.get(name);
    const factories = {
      box: () => new THREE.BoxGeometry(),
      sphere: () => new THREE.SphereGeometry(1, 16, 10),
      cylinder: () => new THREE.CylinderGeometry(1, 1, 1, 24),
      cone: () => new THREE.CylinderGeometry(0.72, 1, 1, 20),
      ring: () => new THREE.TorusGeometry(1, 0.11, 8, 36),
      disc: () => new THREE.CircleGeometry(1, 48),
    };
    const geometry = factories[name]();
    this.shapes.set(name, geometry);
    return geometry;
  }

  /** Adds a dimensionally rounded furniture box. */
  box(material, position, dimensions, radius = 0.08, rotation = [0, 0, 0], shadow = true) {
    if (!radius) {
      this.add(this.shape('box'), material, position, rotation, dimensions, shadow);
      return;
    }
    const bevel = Math.min(radius, Math.min(...dimensions) * 0.45);
    const key = `rounded/${dimensions.join('/')}/${bevel}`;
    if (!this.shapes.has(key))
      this.shapes.set(key, new RoundedBoxGeometry(...dimensions, 2, bevel));
    this.add(this.shapes.get(key), material, position, rotation, [1, 1, 1], shadow);
  }

  /** Finalizes batches and releases all construction geometries. */
  finish() {
    for (const { material, shadow, geometries } of this.batches.values()) {
      const geometry = mergeGeometries(geometries, false);
      for (const source of geometries) source.dispose();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `Static ${material.name || material.type}`;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    for (const shape of this.shapes.values()) shape.dispose();
    this.batches.clear();
    this.shapes.clear();
  }
}
