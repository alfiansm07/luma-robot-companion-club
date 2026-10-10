import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DogAnimationState, sampleFootTrajectory, solveLegIK } from './animationState.js';
import { clamp, dampingFactor } from './movementMath.js';

const FOOT_PHASES = [0, 0.5, 0.5, 0];
const UPPER_LENGTH = 0.34;
const LOWER_LENGTH = 0.37;

/** Original, procedurally modeled companion with four independently solved articulated legs. */
export class RobotDog {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'LUMA · robotic companion';
    this.root.rotation.order = 'YXZ';
    this.root.userData.companion = true;
    this.onFootstep = null;
    this.animation = new DogAnimationState();
    this.materials = {
      shell: new THREE.MeshStandardMaterial({ color: 0xf1edda, roughness: 0.37, metalness: 0.16 }),
      light: new THREE.MeshStandardMaterial({ color: 0xfffcf0, roughness: 0.28, metalness: 0.13 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x243a39, roughness: 0.63, metalness: 0.2 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x879a91, roughness: 0.3, metalness: 0.7 }),
      visor: new THREE.MeshPhysicalMaterial({
        color: 0x102c2e,
        roughness: 0.22,
        metalness: 0.22,
        clearcoat: 1,
      }),
      glow: new THREE.MeshStandardMaterial({
        color: 0x72f3e1,
        emissive: 0x39e8db,
        emissiveIntensity: 2.3,
        roughness: 0.3,
      }),
      coral: new THREE.MeshStandardMaterial({ color: 0xe98e71, roughness: 0.45, metalness: 0.15 }),
    };
    this._geometries = [];
    this._parts = [];
    this._matrix = new THREE.Matrix4();
    this._quaternion = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._position = new THREE.Vector3();
    this._one = new THREE.Vector3(1, 1, 1);
    this._foot = { y: 0, z: 0 };
    this._angles = { hip: 0, knee: 0 };
    this._stepEvent = { position: new THREE.Vector3(), intensity: 0 };
    this._time = 0;
    this._lastHeading = 0;
    this._turnLean = 0;
    this.body = this._part(this.root, 'floating shell');
    this._box(this.body, 'shell', [0.67, 0.48, 1.16], [0, 0.075, 0]);
    this._box(this.body, 'dark', [0.57, 0.13, 0.95], [0, -0.15, 0]);
    this._box(this.body, 'light', [0.6, 0.065, 0.93], [0, 0.33, 0.025]);
    this._box(this.body, 'coral', [0.44, 0.027, 0.1], [0, 0.366, 0.3]);
    this._box(this.body, 'glow', [0.16, 0.013, 0.035], [0, 0.371, 0.02]);
    for (const side of [-1, 1]) {
      this._box(this.body, 'dark', [0.018, 0.09, 0.39], [side * 0.342, 0.12, 0.08]);
      for (let slot = 0; slot < 4; slot++) {
        this._box(
          this.body,
          'metal',
          [0.022, 0.052, 0.017],
          [side * 0.354, 0.12, -0.06 + slot * 0.09],
        );
      }
      for (const end of [-1, 1]) this._screw(this.body, side * 0.347, 0.24, end * 0.4, side);
    }
    // Small front chest lens and sculpted collar separate the body from its expressive head.
    this._box(this.body, 'dark', [0.37, 0.16, 0.13], [0, 0.11, -0.57]);
    this._box(this.body, 'glow', [0.09, 0.037, 0.016], [0, 0.12, -0.645]);
    this.neck = this._part(this.body, 'neck servo');
    this.neck.position.set(0, 0.28, -0.47);
    this._box(this.neck, 'dark', [0.21, 0.29, 0.22], [0, 0.09, 0], [-0.22, 0, 0]);
    this.head = this._part(this.neck, 'expressive head');
    this.head.position.set(0, 0.3, -0.14);
    this._box(this.head, 'shell', [0.69, 0.48, 0.55], [0, 0.055, 0]);
    this._box(this.head, 'shell', [0.59, 0.115, 0.4], [0, 0.26, -0.015]);
    this._box(this.head, 'visor', [0.588, 0.322, 0.112], [0, 0.036, -0.263]);
    this._box(this.head, 'dark', [0.33, 0.1, 0.15], [0, -0.19, -0.15]);
    for (const side of [-1, 1]) this._screw(this.head, side * 0.351, 0.035, -0.035, side);
    this.eyes = this._part(this.head, 'cyan eyes');
    this.eyes.position.set(0, 0.065, -0.327);
    for (const side of [-1, 1]) {
      this._box(this.eyes, 'glow', [0.105, 0.09, 0.015], [side * 0.145, 0, 0]);
      this._box(this.head, 'glow', [0.04, 0.018, 0.015], [side * 0.225, -0.055, -0.324]);
    }
    const smile = new THREE.TorusGeometry(0.053, 0.009, 6, 14, Math.PI);
    this._add(this.head, 'glow', smile, [0, -0.036, -0.326], [0, 0, Math.PI]);
    this.ears = [];
    for (const side of [-1, 1]) {
      const ear = this._part(this.head, `${side < 0 ? 'left' : 'right'} listening ear`);
      ear.position.set(side * 0.3, 0.23, 0.085);
      ear.rotation.z = side * -0.24;
      this._box(ear, 'shell', [0.19, 0.4, 0.14], [side * 0.025, 0.17, 0], [0.14, 0, side * -0.11]);
      this._box(
        ear,
        'dark',
        [0.1, 0.24, 0.028],
        [side * 0.025, 0.185, -0.08],
        [0.14, 0, side * -0.11],
      );
      this.ears.push(ear);
    }
    this.tail = this._part(this.body, 'wagging tail');
    this.tail.position.set(0, 0.17, 0.55);
    this._box(this.tail, 'dark', [0.14, 0.16, 0.17], [0, 0.03, 0.035], [-0.5, 0, 0]);
    this._box(this.tail, 'shell', [0.14, 0.37, 0.16], [0, 0.22, 0.14], [-0.55, 0, 0]);
    this._box(this.tail, 'glow', [0.113, 0.072, 0.13], [0, 0.37, 0.235], [-0.55, 0, 0]);
    this.legs = [];
    for (const z of [-0.4, 0.4]) {
      for (const side of [-1, 1]) {
        const hip = this._part(
          this.body,
          `${z < 0 ? 'front' : 'rear'} ${side < 0 ? 'left' : 'right'} leg`,
        );
        hip.position.set(side * 0.34, -0.1, z);
        this._cylinder(hip, 'dark', 0.12, 0.12, 0.12, [0, 0, 0], [0, 0, Math.PI / 2]);
        this._box(
          hip,
          'shell',
          [0.19, UPPER_LENGTH + 0.025, 0.22],
          [side * 0.017, -UPPER_LENGTH / 2, 0],
        );
        this._screw(hip, side * 0.119, -0.02, 0, side);
        const knee = this._part(hip, 'knee actuator');
        knee.position.y = -UPPER_LENGTH;
        this._cylinder(knee, 'dark', 0.085, 0.085, 0.17, [0, 0, 0], [0, 0, Math.PI / 2]);
        this._box(
          knee,
          'light',
          [0.135, LOWER_LENGTH - 0.025, 0.14],
          [0, -LOWER_LENGTH / 2, 0.012],
        );
        this._box(knee, 'dark', [0.07, 0.14, 0.025], [0, -0.16, 0.087]);
        this._screw(knee, side * 0.091, 0, 0, side, 'light');
        const paw = this._part(knee, 'soft contact paw');
        paw.position.y = -LOWER_LENGTH;
        this._box(paw, 'dark', [0.235, 0.09, 0.3], [0, -0.065, -0.035]);
        this._box(paw, 'shell', [0.211, 0.075, 0.267], [0, -0.019, -0.042]);
        this.legs.push({ hip, knee, paw, bend: z < 0 ? 1 : -1 });
      }
    }
    this._finishParts();
    this.reset();
  }

  _part(parent, name) {
    const group = new THREE.Group();
    group.name = name;
    parent.add(group);
    group.userData.batches = new Map();
    this._parts.push(group);
    return group;
  }

  _box(part, material, size, position, rotation = [0, 0, 0]) {
    const radius = Math.min(...size) * 0.28;
    this._add(part, material, new RoundedBoxGeometry(...size, 2, radius), position, rotation);
  }

  _cylinder(part, material, top, bottom, length, position, rotation) {
    this._add(
      part,
      material,
      new THREE.CylinderGeometry(top, bottom, length, 12),
      position,
      rotation,
    );
  }

  _screw(part, x, y, z, side, material = 'shell') {
    this._cylinder(part, material, 0.027, 0.027, 0.013, [x, y, z], [0, 0, Math.PI / 2]);
    this._box(part, 'dark', [0.006, 0.026, 0.006], [x + side * 0.008, y, z]);
  }

  _add(part, material, geometry, position, rotation) {
    this._position.set(...position);
    this._euler.set(...rotation);
    this._quaternion.setFromEuler(this._euler);
    this._matrix.compose(this._position, this._quaternion, this._one);
    geometry.applyMatrix4(this._matrix);
    // Rounded boxes are non-indexed; unify once while constructing static material batches.
    const expanded = geometry.index ? geometry.toNonIndexed() : geometry;
    if (expanded !== geometry) geometry.dispose();
    const batches = part.userData.batches;
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(expanded);
  }

  _finishParts() {
    for (const part of this._parts) {
      for (const [material, geometries] of part.userData.batches) {
        const geometry = mergeGeometries(geometries, false);
        for (const source of geometries) source.dispose();
        this._geometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, this.materials[material]);
        mesh.castShadow = material === 'shell' || material === 'light';
        mesh.receiveShadow = true;
        part.add(mesh);
      }
      delete part.userData.batches;
    }
    this._parts.length = 0;
  }

  /** Blend locomotion, solve all feet, and emit contact-synchronized positional footsteps. */
  update(dt, state) {
    dt = clamp(dt, 0, 0.1);
    this.root.position.copy(state.position);
    this.root.rotation.y = state.heading;
    const frame = this.animation.update(dt, state);
    this.root.userData.animationState = frame.state;
    this._time += dt;
    const weights = frame.weights;
    const locomotion = weights.walk + weights.run;
    const running = frame.gaitBlend;
    const gait = frame.phase * Math.PI * 2;
    const bounce = Math.cos(gait * 2) * (0.01 + running * 0.026) * locomotion;
    const bodyY = frame.breath * 0.009 * weights.idle + bounce - frame.landing * 0.075;
    this.body.position.y = bodyY;
    this.body.rotation.x =
      -0.045 * weights.run + weights.jump * clamp(-state.verticalSpeed * 0.025, -0.13, 0.18);
    const turn = Math.atan2(
      Math.sin(state.heading - this._lastHeading),
      Math.cos(state.heading - this._lastHeading),
    );
    const targetLean = dt > 0 ? clamp((-turn / dt) * state.speed * 0.018, -0.1, 0.1) : 0;
    this._turnLean += (targetLean - this._turnLean) * dampingFactor(8, dt);
    this.body.rotation.z = this._turnLean + Math.sin(gait) * 0.018 * locomotion;
    this._lastHeading = state.heading;
    this.head.rotation.x =
      Math.sin(this._time * 1.4) * 0.035 * weights.idle - bounce * 0.8 - weights.jump * 0.08;
    this.head.rotation.y = Math.sin(this._time * 0.7) * 0.095 * weights.idle;
    this.head.rotation.z =
      Math.sin(this._time * 0.85) * 0.045 * weights.idle - this._turnLean * 0.6;
    for (let index = 0; index < this.ears.length; index++) {
      const side = index === 0 ? -1 : 1;
      this.ears[index].rotation.x =
        -weights.run * 0.3 + Math.sin(gait + index * 0.6) * 0.07 * locomotion;
      this.ears[index].rotation.z = side * (-0.24 + Math.sin(this._time * 1.8 + index) * 0.025);
    }
    this.tail.rotation.x = 0.08 + weights.jump * 0.3 + Math.sin(this._time * 5) * 0.07;
    this.tail.rotation.z = Math.sin(this._time * (6 + running * 4)) * (0.23 + locomotion * 0.12);
    // Deterministic, brief double blinks read clearly without a texture or per-frame drawing.
    const blinkClock = this._time % 5.7;
    const blink =
      blinkClock > 4.9 && blinkClock < 5.06 ? Math.sin(((blinkClock - 4.9) / 0.16) * Math.PI) : 0;
    this.eyes.scale.y = 1 - blink * 0.9;
    const stride = (0.43 + running * 0.35) * locomotion;
    const lift = (0.1 + running * 0.075) * locomotion;
    for (let index = 0; index < this.legs.length; index++) {
      const leg = this.legs[index];
      sampleFootTrajectory(this._foot, frame.phase + FOOT_PHASES[index], stride, lift);
      const tuck = weights.jump * (0.1 + clamp(state.verticalSpeed / 20, 0, 0.12));
      const targetY = -0.59 + this._foot.y - bodyY + tuck + frame.landing * 0.018;
      const targetZ = this._foot.z + weights.jump * (index < 2 ? -0.09 : 0.06);
      solveLegIK(this._angles, targetY, targetZ, UPPER_LENGTH, LOWER_LENGTH, leg.bend);
      leg.hip.rotation.x = this._angles.hip;
      leg.knee.rotation.x = this._angles.knee;
      leg.paw.rotation.x = -this._angles.hip - this._angles.knee - this.body.rotation.x;
      if (frame.stepMask & (1 << index) && this.onFootstep) {
        leg.paw.getWorldPosition(this._stepEvent.position);
        this._stepEvent.intensity = clamp(0.25 + state.speed / 8, 0.25, 1);
        this.onFootstep(this._stepEvent);
      }
    }
  }

  /** Return articulation and gait timing to a calm neutral pose. */
  reset() {
    this.animation.reset();
    this._time = 0;
    this._lastHeading = this.root.rotation.y;
    this._turnLean = 0;
    this.body.position.y = 0;
    this.body.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.tail.rotation.set(0.08, 0, 0);
    this.eyes.scale.y = 1;
    this.root.userData.animationState = 'idle';
    for (const leg of this.legs) {
      solveLegIK(this._angles, -0.59, 0, UPPER_LENGTH, LOWER_LENGTH, leg.bend);
      leg.hip.rotation.x = this._angles.hip;
      leg.knee.rotation.x = this._angles.knee;
      leg.paw.rotation.x = -this._angles.hip - this._angles.knee;
    }
  }

  /** Release every owned geometry and material, leaving shared scene resources untouched. */
  dispose() {
    this.root.removeFromParent();
    for (const geometry of this._geometries) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.onFootstep = null;
  }
}
