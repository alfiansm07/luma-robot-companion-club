import * as THREE from 'three';
import {
  applyOrbitInput,
  CAMERA_LIMITS,
  orbitDirection,
  resolveCameraDistance,
} from './cameraMath.js';
import { clamp, dampAngle, dampingFactor } from '../player/movementMath.js';

/** Smoothed third-person orbit with a sphere cast on the final camera path every frame. */
export class ThirdPersonCamera {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.yaw = 0;
    this.pitch = CAMERA_LIMITS.defaultPitch;
    this.orbit = { yaw: 0, pitch: this.pitch, distance: CAMERA_LIMITS.defaultDistance };
    this.distance = CAMERA_LIMITS.defaultDistance;
    this._requestedDistance = this.distance;
    this._focus = new THREE.Vector3();
    this._anchor = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._candidate = new THREE.Vector3();
    this._sweepDirection = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._initialized = false;
  }

  /** Orbit input uses pixel deltas; target is the interpolated physics body center. */
  update(dt, target, input = {}, settings = {}) {
    dt = clamp(dt, 0, 0.1);
    if (!this._initialized) this.reset(target);
    applyOrbitInput(this.orbit, input, settings.sensitivity ?? 1, settings.invertY ?? false);
    const orbitResponse = dampingFactor(18, dt);
    this.yaw = dampAngle(this.yaw, this.orbit.yaw, 18, dt);
    this.pitch += (this.orbit.pitch - this.pitch) * orbitResponse;
    this._requestedDistance +=
      (this.orbit.distance - this._requestedDistance) * dampingFactor(10, dt);
    this._anchor.copy(target);
    this._anchor.y += 0.4;
    this._focus.lerp(this._anchor, dampingFactor(14, dt));
    // A bounded focus lag cannot remain in the previous room after reset/teleport.
    if (this._focus.distanceToSquared(this._anchor) > 2.25) this._focus.copy(this._anchor);
    orbitDirection(this._direction, this.yaw, this.pitch);
    const fov = clamp(settings.fov ?? 58, 45, 85);
    if (Math.abs(this.camera.fov - fov) > 0.001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const radius = this._collisionRadius();
    this.physics.resolveCameraAnchor(this._anchor, radius);
    // Collision comes before smoothing. Inward movement is never eased through a wall.
    const clearance = this.physics.castCamera(
      this._anchor,
      this._direction,
      this._requestedDistance,
      radius,
    );
    this.distance = resolveCameraDistance(this.distance, this._requestedDistance, clearance, dt);
    this._candidate.copy(this._focus).addScaledVector(this._direction, this.distance);
    // Focus smoothing/orbit can otherwise introduce a second untested path around a corner.
    this._sweepDirection.subVectors(this._candidate, this._anchor);
    const length = this._sweepDirection.length();
    if (length > 0.0001) {
      this._sweepDirection.multiplyScalar(1 / length);
      const finalDistance = this.physics.castCamera(
        this._anchor,
        this._sweepDirection,
        length,
        radius,
      );
      this.camera.position
        .copy(this._anchor)
        .addScaledVector(this._sweepDirection, Math.min(length, finalDistance));
    } else {
      this.camera.position.copy(this._anchor);
    }
    this._lookTarget.copy(this._focus);
    // At a pinched corner a zero-distance cast is correct; retain a valid viewing direction.
    if (this.camera.position.distanceToSquared(this._lookTarget) < 0.01) {
      this._lookTarget.copy(this.camera.position).addScaledVector(this._direction, -1);
    }
    this.camera.lookAt(this._lookTarget);
  }

  _collisionRadius() {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const nearRadius = this.camera.near * Math.sqrt(1 + tan * tan * (1 + this.camera.aspect ** 2));
    return Math.max(CAMERA_LIMITS.collisionRadius, nearRadius + CAMERA_LIMITS.wallClearance);
  }

  /** Snap the follow anchor and clear orbit/zoom lag for spawn or restart. */
  reset(target) {
    this.yaw = 0;
    this.pitch = CAMERA_LIMITS.defaultPitch;
    this.orbit.yaw = 0;
    this.orbit.pitch = this.pitch;
    this.orbit.distance = CAMERA_LIMITS.defaultDistance;
    this._requestedDistance = CAMERA_LIMITS.defaultDistance;
    this._anchor.copy(target);
    this._anchor.y += 0.4;
    this._focus.copy(this._anchor);
    const radius = this._collisionRadius();
    this.physics.resolveCameraAnchor(this._anchor, radius);
    orbitDirection(this._direction, this.yaw, this.pitch);
    this.distance = this.physics.castCamera(
      this._anchor,
      this._direction,
      this._requestedDistance,
      radius,
    );
    this.camera.position.copy(this._anchor).addScaledVector(this._direction, this.distance);
    this.camera.lookAt(this._focus);
    this._initialized = true;
  }
}
