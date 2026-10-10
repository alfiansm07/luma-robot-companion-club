import { clamp, dampingFactor, normalizeAngle } from '../player/movementMath.js';

export const CAMERA_LIMITS = Object.freeze({
  minPitch: 0.08,
  maxPitch: 1.18,
  minDistance: 2.4,
  maxDistance: 10,
  defaultDistance: 6.2,
  defaultPitch: 0.35,
  collisionRadius: 0.3,
  wallClearance: 0.065,
});

/** Apply pixel-based orbit input to an existing orbit object without allocating. */
export function applyOrbitInput(orbit, input, sensitivity = 1, invertY = false) {
  const gain = 0.003 * clamp(sensitivity, 0.2, 2);
  orbit.yaw = normalizeAngle(orbit.yaw - (input.orbitX || 0) * gain);
  orbit.pitch = clamp(
    orbit.pitch + (input.orbitY || 0) * gain * (invertY ? -1 : 1),
    CAMERA_LIMITS.minPitch,
    CAMERA_LIMITS.maxPitch,
  );
  orbit.distance = clamp(
    orbit.distance * Math.exp(clamp(input.zoom || 0, -1000, 1000) * 0.001),
    CAMERA_LIMITS.minDistance,
    CAMERA_LIMITS.maxDistance,
  );
  return orbit;
}

/** Write a unit vector from the subject toward the orbiting camera. */
export function orbitDirection(out, yaw, pitch) {
  const horizontal = Math.cos(pitch);
  out.x = Math.sin(yaw) * horizontal;
  out.y = Math.sin(pitch);
  out.z = Math.cos(yaw) * horizontal;
  return out;
}

/** Snap inward immediately; ease outward only, never exceeding the collision limit. */
export function resolveCameraDistance(current, requested, collisionLimit, dt) {
  const safe = Math.max(0, Math.min(requested, collisionLimit));
  if (safe <= current) return safe;
  return Math.min(safe, current + (safe - current) * dampingFactor(6, Math.min(dt, 0.1)));
}
