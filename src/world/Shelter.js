import * as THREE from 'three';
import { BatchBuilder } from './BatchBuilder.js';
import { createMaterials } from './materials.js';

const PI = Math.PI;
const VERTICAL = [-PI / 2, 0, 0];

/** Original procedural 36 × 44 m robotic-companion shelter with matching fixed colliders. */
export class Shelter {
  constructor(scene, physics) {
    this.root = new THREE.Group();
    this.root.name = 'LUMA / companion club';
    this.spawn = { x: 0, y: 0.9, z: 10 };
    this.audioSources = [
      { kind: 'fan', position: { x: -15.8, y: 4.9, z: -5 } },
      { kind: 'water', position: { x: 15, y: 0.4, z: 9 } },
      { kind: 'toy', position: { x: -3.6, y: 0.3, z: -2.4 } },
    ];
    this.physics = physics;
    this._colliders = [];
    this._textures = new Set();
    this._materials = createMaterials();
    for (const [name, material] of Object.entries(this._materials)) material.name = name;
    this._batch = new BatchBuilder(this.root);
    this._animations = [];
    this._signEntries = [];
    this._floorEntries = [];
    this._architecture();
    this._floorGraphics();
    this._restZone();
    this._agilityZone();
    this._careZone();
    this._lounge();
    this._plants();
    this._ceilingDetails();
    this._finishSignage(this._signEntries, false);
    this._finishSignage(this._floorEntries, true);
    this._signEntries = null;
    this._floorEntries = null;
    this._batch.finish();
    this._batch = null;
    scene.add(this.root);
    this._disposed = false;
  }

  _solid(position, dimensions, rotation = [0, 0, 0]) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    const collider = this.physics.addBox({
      position: { x: position[0], y: position[1], z: position[2] },
      halfExtents: { x: dimensions[0] / 2, y: dimensions[1] / 2, z: dimensions[2] / 2 },
      rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
    });
    if (collider) this._colliders.push(collider);
  }

  _box(
    material,
    position,
    dimensions,
    radius = 0.08,
    rotation = [0, 0, 0],
    solid = false,
    shadow = true,
  ) {
    this._batch.box(this._materials[material], position, dimensions, radius, rotation, shadow);
    if (solid) this._solid(position, dimensions, rotation);
  }

  _shape(shape, material, position, scale, rotation = [0, 0, 0], shadow = true) {
    this._batch.add(
      this._batch.shape(shape),
      this._materials[material],
      position,
      rotation,
      scale,
      shadow,
    );
  }

  _architecture() {
    this._box('floor', [0, -0.15, 0], [36, 0.3, 44], 0, [0, 0, 0], true, false);
    // Low sills, high clerestories and structural piers read as a real sunlit interior.
    for (const side of [-1, 1]) {
      const x = side * 18;
      this._box('ivory', [x, 3.5, 0], [0.42, 7, 44.4], 0, [0, 0, 0], true, false);
      this._box('sand', [side * 17.74, 0.19, 0], [0.1, 0.38, 44], 0.025, [0, 0, 0], false, false);
      this._box('mint', [side * 17.71, 1.1, -2], [0.11, 1.4, 34], 0.04, [0, 0, 0], false, false);
      for (const z of [-15.5, -7.5, 0.5, 8.5, 16.5]) {
        this._box('chalk', [side * 17.62, 4.15, z], [0.18, 3.9, 5.9], 0.1, [0, 0, 0], false, false);
        this._box(
          'window',
          [side * 17.5, 4.18, z],
          [0.08, 3.52, 5.52],
          0.025,
          [0, 0, 0],
          false,
          false,
        );
        this._box(
          'ivory',
          [side * 17.42, 4.2, z],
          [0.16, 3.62, 0.09],
          0.015,
          [0, 0, 0],
          false,
          false,
        );
        this._box(
          'ivory',
          [side * 17.42, 4.35, z],
          [0.16, 0.09, 5.58],
          0.015,
          [0, 0, 0],
          false,
          false,
        );
        this._box(
          'sand',
          [side * 17.43, 2.22, z],
          [0.62, 0.14, 6.06],
          0.055,
          [0, 0, 0],
          false,
          false,
        );
      }
      for (const z of [-21.5, -11.5, -3.5, 4.5, 12.5, 21.5]) {
        this._box(
          'ivory',
          [side * 17.55, 3.45, z],
          [0.75, 6.9, 0.62],
          0.12,
          [0, 0, 0],
          false,
          false,
        );
      }
    }
    for (const z of [-22, 22]) {
      this._box('ivory', [0, 3.5, z], [36, 7, 0.42], 0, [0, 0, 0], true, false);
      this._box(
        'sand',
        [0, 0.19, z > 0 ? 21.74 : -21.74],
        [35.5, 0.38, 0.1],
        0.025,
        [0, 0, 0],
        false,
        false,
      );
    }
    this._box('mint', [0, 2.8, -21.7], [20, 5.4, 0.12], 0.12, [0, 0, 0], false, false);
    this._sign('LUMA', 'ROBOT COMPANION CLUB', [0, 4.5, -21.53], 10.7, 2.15, {
      color: '#18534f',
      background: '#b1d7c6',
      fontSize: 154,
    });
    this._sign(
      'GOOD DOGS. BRIGHT DAYS.',
      'A place to roam, recharge & belong.',
      [0, 2.48, -21.5],
      8.8,
      0.92,
      { color: '#277f76', background: '#b1d7c6', fontSize: 54 },
    );

    // Flush entry doors are closed architecture, not misleading interactive controls.
    for (const x of [-1.22, 1.22]) {
      this._box('deepTeal', [x, 1.8, 21.65], [2.32, 3.6, 0.16], 0.08, [0, 0, 0], false, false);
      this._box('window', [x, 2.21, 21.52], [1.94, 2.18, 0.05], 0.03, [0, 0, 0], false, false);
      this._box('steel', [x < 0 ? -0.22 : 0.22, 1.34, 21.36], [0.06, 0.55, 0.08], 0.028);
    }
    this._sign('WELCOME HOME', 'EST. 2048  /  COMPANIONS ALWAYS', [0, 4.7, 21.63], 6.6, 1.2, {
      rotation: PI,
      color: '#18534f',
      background: '#f8f2e4',
    });
    this._box('deepTeal', [0, 0.025, 19.45], [5.5, 0.05, 2.35], 0.2, [0, 0, 0], false, false);
    this._floorLabel('HELLO, FRIEND', [0, 0.056, 19.5], 4.4, 0.75, '#e7eee0');

    // Open skylight strips alternate with acoustic roof panels. No low ceiling camera obstruction.
    this._solid([0, 7.45, 0], [36, 0.25, 44]);
    for (const x of [-15, -5, 5, 15])
      this._box('chalk', [x, 7.16, 0], [5.8, 0.2, 44], 0.02, [0, 0, 0], false, false);
    for (const x of [-10, 0, 10]) {
      this._box('window', [x, 7.29, 0], [3.7, 0.1, 43.6], 0.025, [0, 0, 0], false, false);
      for (const edge of [-1.92, 1.92])
        this._box('wood', [x + edge, 7.08, 0], [0.12, 0.22, 44], 0.025, [0, 0, 0], false, false);
    }
    for (const z of [-20, -12, -4, 4, 12, 20])
      this._box('sand', [0, 6.9, z], [35.7, 0.32, 0.17], 0.03, [0, 0, 0], false, false);
  }

  _floorGraphics() {
    this._shape('cylinder', 'carpet', [0, 0.015, -0.2], [5.65, 0.027, 5.65], [0, 0, 0], false);
    this._shape('ring', 'mint', [0, 0.036, -0.2], [5.15, 5.15, 0.12], VERTICAL, false);
    this._floorLabel('PLAY A LITTLE.', [0, 0.041, 1.15], 6.7, 1.05, '#edf0d9');
    this._floorLabel('FEEL A LOT.', [0, 0.042, 2.1], 5.1, 0.7, '#edf0d9');
    // Original paw motif inset in the central soft-play surface.
    this._shape('sphere', 'mint', [0, 0.04, -1.55], [0.79, 0.011, 0.68], [0, 0, 0], false);
    for (const [x, z, size] of [
      [-0.9, -2.1, 0.32],
      [-0.36, -2.6, 0.36],
      [0.37, -2.6, 0.36],
      [0.93, -2.1, 0.32],
    ]) {
      this._shape('sphere', 'mint', [x, 0.04, z], [size, 0.011, size * 1.15], [0, 0, 0], false);
    }
    // Wayfinding arcs are flat graphics, not physical barriers.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        this._box(
          'sand',
          [side * 5.9, 0.008, 7.6 + i * 1.3],
          [0.08, 0.012, 0.45],
          0,
          [0, 0, 0],
          false,
          false,
        );
      }
    }
    this._floorLabel('01 / REST & RECHARGE', [-10, 0.017, -11.3], 7.1, 0.6, '#277f76');
    this._floorLabel('02 / WANDER & PLAY', [10.4, 0.017, 4.8], 6.2, 0.6, '#277f76');
    this._floorLabel('03 / REFUEL', [12.3, 0.017, 13], 4.9, 0.6, '#277f76');
    this._toy(-3.6, -2.4, 'coral');
    this._toy(3.5, 0.8, 'lime');
    this._shape('sphere', 'coral', [2.8, 0.28, -3.6], [0.28, 0.28, 0.28]);
    this._shape('ring', 'chalk', [2.8, 0.28, -3.6], [0.252, 0.252, 0.252], [0.3, 0.2, 0]);
    this._solid([2.8, 0.25, -3.6], [0.46, 0.5, 0.46]);
  }

  _restZone() {
    for (const [index, x] of [-12, -6, 6, 12].entries()) this._house(x, -17.3, index);
    this._box('peachCarpet', [-9, 0.018, -15], [12, 0.036, 7.8], 0.5, [0, 0, 0], false, false);
    this._box('greenCarpet', [9, 0.018, -15], [12, 0.036, 7.8], 0.5, [0, 0, 0], false, false);
    // Low fence segments leave broad entries in the middle of each habitat.
    for (const x of [-15.35, -2.7, 2.7, 15.35]) this._fence(x, -14.4, 4.5, PI / 2);
    for (const x of [-13.7, -4.4, 4.4, 13.7]) this._fence(x, -12.18, 3.15, 0);
    this._bed(-10.5, -13.6, 'peach');
    this._bed(8.4, -13.55, 'mint');
    this._toy(-6.7, -14, 'lime');
    this._toy(13.1, -13.4, 'coral');
  }

  _house(x, z, index) {
    const color = ['teal', 'coral', 'teal', 'wood'][index];
    this._box('wood', [x, 0.11, z], [3.7, 0.22, 3.9], 0.12, [0, 0, 0], true);
    this._box('ivory', [x - 1.6, 1.23, z], [0.2, 2.24, 3.4], 0.04, [0, 0, 0], true);
    this._box('ivory', [x + 1.6, 1.23, z], [0.2, 2.24, 3.4], 0.04, [0, 0, 0], true);
    this._box('ivory', [x, 1.23, z - 1.65], [3.25, 2.24, 0.18], 0.04, [0, 0, 0], true);
    this._box(color, [x - 1.08, 1.13, z + 1.65], [1.05, 2.02, 0.22], 0.075, [0, 0, 0], true);
    this._box(color, [x + 1.08, 1.13, z + 1.65], [1.05, 2.02, 0.22], 0.075, [0, 0, 0], true);
    this._box(color, [x, 2.15, z + 1.65], [3.25, 0.27, 0.22], 0.06, [0, 0, 0], true);
    const pitch = 0.44;
    for (const side of [-1, 1]) {
      this._box(
        color,
        [x + side * 0.88, 2.65, z],
        [2.05, 0.2, 3.94],
        0.085,
        [0, 0, -side * pitch],
        true,
      );
      this._box('chalk', [x + side * 0.88, 2.65, z + 1.99], [2.07, 0.1, 0.1], 0.035, [
        0,
        0,
        -side * pitch,
      ]);
    }
    this._box(color, [x, 3.05, z], [0.22, 0.18, 4.02], 0.085);
    this._box('bed', [x, 0.29, z + 0.1], [2.8, 0.25, 2.7], 0.11, [0, 0, 0], true);
    this._sign(
      ['MISO', 'NOVA', 'BEAN', 'PIXEL'][index],
      `SUITE 0${index + 1}`,
      [x, 2.54, z + 2.08],
      1.15,
      0.43,
      { background: '#fffaf0', color: '#18534f', fontSize: 105 },
    );
    this._shape('disc', 'dark', [x + 1.12, 1.52, z + 1.776], [0.12, 0.12, 1]);
    this._shape('disc', 'lime', [x + 1.12, 1.52, z + 1.781], [0.055, 0.055, 1], [0, 0, 0], false);
  }

  _fence(x, z, length, yaw) {
    const dx = Math.cos(yaw);
    const dz = -Math.sin(yaw);
    const count = Math.ceil(length / 0.47);
    for (let i = 0; i <= count; i++) {
      const d = (i / count - 0.5) * length;
      this._box('chalk', [x + d * dx, 0.55, z + d * dz], [0.13, 1.1, 0.13], 0.06);
    }
    for (const y of [0.27, 0.9])
      this._box('chalk', [x, y, z], [length + 0.12, 0.11, 0.1], 0.045, [0, yaw, 0]);
    this._solid([x, 0.55, z], [length + 0.13, 1.1, 0.15], [0, yaw, 0]);
    for (const side of [-1, 1])
      this._shape(
        'sphere',
        'wood',
        [x + (side * length * dx) / 2, 1.1, z + (side * length * dz) / 2],
        [0.11, 0.11, 0.11],
      );
  }

  _bed(x, z, color) {
    this._box(color, [x, 0.14, z], [2.65, 0.27, 1.95], 0.12, [0, 0, 0], true);
    this._box('bed', [x, 0.29, z + 0.07], [2.3, 0.18, 1.56], 0.085, [0, 0, 0], true);
    this._box(color, [x, 0.45, z - 0.78], [2.58, 0.45, 0.32], 0.15, [0, 0, 0], true);
    for (const side of [-1, 1])
      this._box(color, [x + side * 1.18, 0.39, z], [0.29, 0.36, 1.67], 0.13, [0, 0, 0], true);
    this._box('chalk', [x + 0.46, 0.44, z - 0.27], [0.69, 0.22, 0.52], 0.105, [0, 0.16, 0]);
  }

  _toy(x, z, color) {
    // Low toys stay below the controller's step threshold.
    this._shape('cylinder', color, [x, 0.17, z], [0.13, 0.82, 0.13], [0, 0, PI / 2]);
    for (const side of [-1, 1]) {
      this._shape('sphere', color, [x + side * 0.42, 0.17, z - 0.11], [0.2, 0.17, 0.18]);
      this._shape('sphere', color, [x + side * 0.42, 0.17, z + 0.11], [0.2, 0.17, 0.18]);
    }
    this._solid([x, 0.15, z], [1.08, 0.3, 0.47]);
  }

  _agilityZone() {
    this._box('greenCarpet', [10.55, 0.015, -2.3], [9.1, 0.03, 11.4], 0.4, [0, 0, 0], false, false);
    this._box('teal', [10.4, 0.575, -5.15], [3.4, 1.15, 3.3], 0.09, [0, 0, 0], true);
    this._box('wood', [10.4, 1.17, -5.15], [3.44, 0.08, 3.34], 0.035, [0, 0, 0], true);
    const slope = Math.atan2(1.21, 4.2);
    const length = Math.hypot(1.21, 4.2);
    const center = [10.4, 0.605 - 0.08 * Math.cos(slope), -1.4];
    this._box('wood', center, [3.38, 0.16, length], 0.015, [slope, 0, 0], true);
    // High-contrast inset traction strips follow the actual ramp surface.
    for (let i = 1; i < 9; i++) {
      const offset = (i / 9 - 0.5) * length;
      this._box(
        'mint',
        [10.4, 0.615 - Math.sin(slope) * offset, -1.4 + Math.cos(slope) * offset],
        [3.14, 0.014, 0.11],
        0,
        [slope, 0, 0],
        false,
        false,
      );
    }
    // Low rails do not close the approach or the ramp's landing.
    for (const x of [8.7, 12.1]) {
      for (const z of [-6.5, -4.2])
        this._box('teal', [x, 1.61, z], [0.12, 0.82, 0.12], 0.05, [0, 0, 0], true);
      this._box('chalk', [x, 2, -5.35], [0.14, 0.12, 2.5], 0.05, [0, 0, 0], true);
    }
    for (const [x, z, angle] of [
      [6.8, 1.4, 0],
      [14.3, -1.3, 0.3],
      [14.3, -6.2, -0.25],
    ]) {
      this._shape('cone', 'coral', [x, 0.37, z], [0.22, 0.7, 0.22], [0, angle, 0]);
      this._box('coral', [x, 0.035, z], [0.67, 0.07, 0.67], 0.035, [0, angle, 0], true);
      this._shape('cylinder', 'chalk', [x, 0.41, z], [0.17, 0.13, 0.17]);
      this._solid([x, 0.35, z], [0.38, 0.7, 0.38]);
    }
    // Three stepping pods form a playable route beside the main ramp.
    for (const [x, z, height, color] of [
      [6.4, -7.1, 0.25, 'coral'],
      [6.15, -5.5, 0.42, 'teal'],
      [6.55, -3.7, 0.3, 'lime'],
    ]) {
      this._box(color, [x, height / 2, z], [1.1, height, 1.15], 0.11, [0, 0.15, 0], true);
      this._shape('disc', 'chalk', [x, height + 0.008, z], [0.2, 0.2, 1], VERTICAL, false);
    }
    this._sign('SMALL STEPS.', 'BIG ADVENTURES.', [17.37, 3.1, -5.5], 4.4, 1.15, {
      rotation: -PI / 2,
      background: '#f8f2e4',
      color: '#277f76',
    });
  }

  _careZone() {
    this._box('peachCarpet', [13.6, 0.017, 9.2], [7.2, 0.034, 5.7], 0.3, [0, 0, 0], false, false);
    this._box('ivory', [15.15, 0.26, 9], [2.35, 0.5, 3.65], 0.22, [0, 0, 0], true);
    this._box('teal', [15.4, 0.92, 7.45], [1.72, 1.6, 0.5], 0.16, [0, 0, 0], true);
    this._box('steel', [15.14, 0.93, 7.73], [0.12, 0.12, 0.45], 0.04);
    this._bowl(15.05, 8.48, true, 0.51);
    this._bowl(15.05, 10.27, false, 0.51);
    this._sign('THE REFILL BAR', 'FRESH WATER  /  FULL BATTERIES', [17.37, 3.1, 9.1], 4.8, 1.05, {
      rotation: -PI / 2,
      background: '#f8f2e4',
      color: '#277f76',
    });
    for (const z of [7.95, 9.7]) {
      this._box('teal', [11.05, 0.055, z], [1.9, 0.11, 1.4], 0.05, [0, 0, 0], true);
      this._bowl(11.05, z, z < 9, 0.11);
    }
    // Wall-mounted charging cubbies and their tiny status lamps.
    this._box('wood', [16.7, 1.15, 15.9], [1.35, 2.3, 4.15], 0.15, [0, 0, 0], true);
    for (const z of [14.55, 15.9, 17.25]) {
      this._box('deepTeal', [15.997, 1.15, z], [0.055, 1.8, 1.1], 0.025);
      this._box('lime', [15.955, 1.89, z], [0.03, 0.06, 0.3], 0.01, [0, 0, 0], false, false);
      this._box('steel', [15.93, 0.82, z + 0.29], [0.05, 0.38, 0.04], 0.019);
    }
    this._sign('RECHARGE', 'TAKE YOUR TIME.', [15.94, 2.77, 15.9], 3.85, 0.8, {
      rotation: -PI / 2,
      background: '#f8f2e4',
      color: '#277f76',
    });
  }

  _bowl(x, z, water, base = 0) {
    this._shape('cone', 'steel', [x, base + 0.15, z], [0.5, 0.29, 0.5]);
    this._shape('ring', 'chalk', [x, base + 0.29, z], [0.395, 0.395, 0.395], VERTICAL);
    this._shape(
      'cylinder',
      water ? 'water' : 'soil',
      [x, base + 0.275, z],
      [0.36, 0.015, 0.36],
      [0, 0, 0],
      false,
    );
    if (!water) {
      for (let i = 0; i < 13; i++) {
        const a = i * 2.4;
        const r = 0.27 * Math.sqrt(i / 13);
        this._shape(
          'sphere',
          'wood',
          [x + Math.cos(a) * r, base + 0.29, z + Math.sin(a) * r],
          [0.062, 0.04, 0.048],
        );
      }
    }
    this._solid([x, base + 0.12, z], [0.83, 0.24, 0.83]);
  }

  _lounge() {
    this._box('peachCarpet', [-12, 0.014, 2.4], [9.1, 0.028, 9.6], 0.5, [0, 0, 0], false, false);
    // Curated sofa: timber feet, thick upholstered cushions, separate arms and seams.
    for (const z of [-0.1, 4.3]) {
      for (const x of [-15.6, -14.2])
        this._box('wood', [x, 0.2, z], [0.17, 0.4, 0.17], 0.045, [0, 0, 0], true);
    }
    this._box('teal', [-14.9, 0.57, 2.1], [2.2, 0.57, 5.4], 0.22, [0, 0, 0], true);
    this._box('teal', [-15.8, 1.06, 2.1], [0.41, 1.23, 5.28], 0.19, [0, 0, 0], true);
    for (const z of [-0.55, 4.75])
      this._box('teal', [-14.9, 0.96, z], [2.15, 0.9, 0.34], 0.15, [0, 0, 0], true);
    for (const z of [0.38, 2.1, 3.82]) {
      this._box('mint', [-14.74, 0.95, z], [1.65, 0.35, 1.65], 0.16, [0, 0, 0], true);
      this._box('mint', [-15.4, 1.39, z], [0.3, 0.78, 1.65], 0.14, [0, 0, -0.12]);
    }
    this._box('peach', [-15.15, 1.48, 0.5], [0.27, 0.61, 0.62], 0.12, [0.16, 0.1, -0.25]);
    this._box('lime', [-15.13, 1.45, 3.9], [0.27, 0.58, 0.63], 0.12, [-0.14, 0.12, -0.3]);
    for (const side of [-1, 1])
      this._box(
        'wood',
        [-11.75 + side * 0.6, 0.39, 2.25],
        [0.19, 0.78, 1.05],
        0.08,
        [0, 0, side * 0.1],
        true,
      );
    this._box('wood', [-11.75, 0.81, 2.25], [2.1, 0.16, 2.65], 0.075, [0, 0, 0], true);
    this._box('coral', [-11.9, 0.93, 1.95], [0.83, 0.07, 0.61], 0.025, [0, 0.2, 0]);
    this._box('ivory', [-11.9, 0.98, 1.95], [0.76, 0.045, 0.56], 0.015, [0, 0.2, 0]);
    this._bed(-9.2, 4.25, 'coral');
    this._bed(-9.1, -0.7, 'mint');
    this._sign('STAY AWHILE.', 'YOU ARE IN GOOD COMPANY.', [-17.36, 3.05, 1.7], 5.2, 1.1, {
      rotation: PI / 2,
      background: '#f8f2e4',
      color: '#277f76',
    });
    // Entry concierge desk, purpose-built rounded counter and storage face.
    this._box('teal', [-11.4, 0.69, 16.4], [6.5, 1.38, 1.65], 0.2, [0, 0, 0], true);
    this._box('wood', [-11.4, 1.42, 16.4], [6.7, 0.13, 1.82], 0.06, [0, 0, 0], true);
    for (const x of [-13.6, -12.9, -12.2, -11.5, -10.8, -10.1, -9.4])
      this._box('mint', [x, 0.71, 17.24], [0.07, 1.05, 0.045], 0.02);
    this._box('dark', [-10.15, 1.54, 16.2], [0.58, 0.13, 0.46], 0.055);
    this._box('dark', [-10.15, 1.87, 16.21], [0.69, 0.59, 0.07], 0.03, [-0.17, 0, 0]);
    this._box(
      'mint',
      [-10.15, 1.88, 16.265],
      [0.57, 0.45, 0.012],
      0.005,
      [-0.17, 0, 0],
      false,
      false,
    );
    this._sign('A LITTLE CARE.', 'A LOT OF LOVE.', [-11.4, 3.9, 21.67], 7.2, 1.65, {
      rotation: PI,
      background: '#f8f2e4',
      color: '#277f76',
    });
    this._planter(-13.5, 16.4, 0.27, 1.49);
  }

  _plants() {
    for (const [x, z, size] of [
      [-16.1, -19.8, 0.74],
      [16.1, -19.8, 0.74],
      [-16.3, 10.1, 0.75],
      [16.5, 4.3, 0.65],
      [-5.8, 17.6, 0.64],
      [6.3, 17.8, 0.65],
      [-7.9, 8.7, 0.62],
      [-16.2, -7.5, 0.72],
    ]) {
      this._planter(x, z, size);
    }
    // Island bench wraps a planted spine; it does not pinch the spawn-to-play route.
    this._box('chalk', [-8.5, 0.4, 9.4], [4.5, 0.8, 1.65], 0.2, [0, 0, 0], true);
    this._box('wood', [-8.5, 0.85, 10.1], [4.65, 0.14, 0.75], 0.06, [0, 0, 0], true);
    this._box('soil', [-8.5, 0.81, 9.05], [3.9, 0.03, 0.68], 0.01, [0, 0, 0], false, false);
    for (const x of [-9.8, -8.6, -7.3]) this._foliage(x, 0.82, 9, 0.46);
  }

  _planter(x, z, size, base = 0) {
    this._shape(
      'cone',
      'peach',
      [x, base + size * 0.57, z],
      [size * 0.85, size * 1.14, size * 0.85],
    );
    this._shape(
      'ring',
      'ivory',
      [x, base + size * 1.09, z],
      [size * 0.64, size * 0.64, size * 0.64],
      VERTICAL,
    );
    this._shape(
      'cylinder',
      'soil',
      [x, base + size * 1.07, z],
      [size * 0.59, 0.025, size * 0.59],
      [0, 0, 0],
      false,
    );
    if (base === 0) this._solid([x, size * 0.56, z], [size * 1.4, size * 1.12, size * 1.4]);
    this._foliage(x, base + size * 1.08, z, size);
  }

  _foliage(x, y, z, size) {
    this._shape('cylinder', 'wood', [x, y + size * 0.72, z], [0.035, size * 1.44, 0.035]);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4;
      const r = size * (i < 4 ? 0.4 : 0.28);
      this._shape(
        'sphere',
        i % 2 ? 'leaf' : 'leafLight',
        [x + Math.cos(a) * r, y + size * (0.5 + i * 0.14), z + Math.sin(a) * r],
        [size * 0.26, size * 0.64, size * 0.14],
        [Math.cos(a) * 0.62, -a, Math.sin(a) * 0.62],
      );
    }
  }

  _ceilingDetails() {
    for (const x of [-12, 12]) {
      for (const z of [-10, 8, 17]) {
        this._shape('cylinder', 'dark', [x, 6.35, z], [0.019, 1.12, 0.019], [0, 0, 0], false);
        this._shape('cone', 'ivory', [x, 5.73, z], [0.7, 0.32, 0.7], [0, 0, 0], false);
        this._shape('cylinder', 'glow', [x, 5.55, z], [0.6, 0.035, 0.6], [0, 0, 0], false);
      }
    }
    const fan = new THREE.Group();
    fan.position.set(-16.2, 5.05, -5);
    fan.rotation.y = PI / 2;
    const bladeGeometry = new THREE.SphereGeometry(1, 12, 6);
    const rotor = new THREE.InstancedMesh(bladeGeometry, this._materials.mint, 3);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 3; i++) {
      const a = (i * PI * 2) / 3;
      transform.position.set(Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0);
      transform.rotation.z = a;
      transform.scale.set(0.33, 0.11, 0.035);
      transform.updateMatrix();
      rotor.setMatrixAt(i, transform.matrix);
    }
    rotor.instanceMatrix.needsUpdate = true;
    fan.add(rotor);
    this._shape('ring', 'dark', [-16.2, 5.05, -5], [0.63, 0.63, 0.45], [0, PI / 2, 0], false);
    this._shape('sphere', 'ivory', [-16.15, 5.05, -5], [0.13, 0.13, 0.13], [0, 0, 0], false);
    this.root.add(fan);
    this._animations.push(rotor);
    this._box('ivory', [-17.1, 5.05, -5], [0.75, 0.12, 0.12], 0.05, [0, 0, 0], false, false);
  }

  _sign(title, subtitle, position, width, height, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.max(128, Math.round((1024 * height) / width));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = options.background ?? '#fffaf0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = options.color ?? '#18534f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = Math.min(options.fontSize ?? 83, canvas.height * 0.52);
    ctx.font = `800 ${fontSize}px Arial, sans-serif`;
    ctx.fillText(title, 512, canvas.height * (subtitle ? 0.4 : 0.5), 946);
    if (subtitle) {
      ctx.font = `600 ${Math.min(27, canvas.height * 0.13)}px Arial, sans-serif`;
      ctx.fillText(subtitle, 512, canvas.height * 0.79, 925);
    }
    this._signEntries.push({
      canvas,
      position,
      width,
      height,
      rotation: [0, options.rotation ?? 0, 0],
    });
  }

  _floorLabel(text, position, width, height, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 78px Arial, sans-serif';
    ctx.fillText(text, 512, 64, 985);
    this._floorEntries.push({ canvas, position, width, height, rotation: VERTICAL });
  }

  _finishSignage(entries, floor) {
    const tileWidth = 512;
    const tileHeight = floor ? 128 : 256;
    const canvas = document.createElement('canvas');
    canvas.width = tileWidth * 2;
    canvas.height = THREE.MathUtils.ceilPowerOfTwo(Math.ceil(entries.length / 2) * tileHeight);
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this._textures.add(texture);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      alphaTest: 0.4,
      polygonOffset: floor,
      polygonOffsetFactor: floor ? -1 : 0,
    });
    material.name = floor ? 'Wayfinding atlas' : 'Signage atlas';
    entries.forEach((entry, index) => {
      const left = (index % 2) * tileWidth;
      const top = Math.floor(index / 2) * tileHeight;
      ctx.drawImage(entry.canvas, left + 2, top + 2, tileWidth - 4, tileHeight - 4);
      const geometry = new THREE.PlaneGeometry(entry.width, entry.height);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(
          i,
          (left + 2 + uv.getX(i) * (tileWidth - 4)) / canvas.width,
          1 - (top + 2 + (1 - uv.getY(i)) * (tileHeight - 4)) / canvas.height,
        );
      }
      this._batch.add(geometry, material, entry.position, entry.rotation, [1, 1, 1], false);
      geometry.dispose();
    });
    texture.needsUpdate = true;
  }

  /** Advances only the reusable fan rotor and procedural water uniforms. */
  update(dt, time) {
    for (const rotor of this._animations)
      rotor.rotation.z = (rotor.rotation.z - Math.min(dt, 0.05) * 1.45) % (PI * 2);
    this._materials.water.uniforms.uTime.value = time;
  }

  /** Releases all original geometry, materials, canvas textures and shelter-owned colliders. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const geometries = new Set();
    const materials = new Set(Object.values(this._materials));
    this.root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.isInstancedMesh) object.dispose();
      if (object.material) {
        if (Array.isArray(object.material))
          object.material.forEach((material) => materials.add(material));
        else materials.add(object.material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of this._textures) texture.dispose();
    this.root.removeFromParent();
    this.root.clear();
    this._animations.length = 0;
    this._textures.clear();
    if (this.physics.world) {
      for (const collider of this._colliders)
        if (collider.isValid()) this.physics.world.removeCollider(collider, false);
    }
    this._colliders.length = 0;
  }
}
