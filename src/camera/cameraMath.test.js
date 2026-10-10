import { describe, expect, it } from 'vitest';
import {
  applyOrbitInput,
  CAMERA_LIMITS,
  orbitDirection,
  resolveCameraDistance,
} from './cameraMath.js';

describe('camera orbit bounds', () => {
  it('starts behind local forward and always produces a unit direction', () => {
    const direction = { x: 0, y: 0, z: 0 };
    orbitDirection(direction, 0, 0);
    expect(direction).toEqual({ x: 0, y: 0, z: 1 });
    orbitDirection(direction, 2.3, 0.8);
    expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1);
  });
  it('clamps pitch and wheel distance even after huge inputs', () => {
    const orbit = { yaw: 0, pitch: 0.35, distance: 6 };
    applyOrbitInput(orbit, { orbitX: 100000, orbitY: 100000, zoom: 100000 }, 2);
    expect(orbit.pitch).toBe(CAMERA_LIMITS.maxPitch);
    expect(orbit.distance).toBe(CAMERA_LIMITS.maxDistance);
    expect(orbit.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(orbit.yaw).toBeLessThan(Math.PI);
    applyOrbitInput(orbit, { orbitY: -100000, zoom: -100000 }, 2);
    applyOrbitInput(orbit, { zoom: -100000 }, 2);
    expect(orbit.pitch).toBe(CAMERA_LIMITS.minPitch);
    expect(orbit.distance).toBe(CAMERA_LIMITS.minDistance);
  });
  it('honors inverted orbit and sensitivity', () => {
    const normal = { yaw: 0, pitch: 0.6, distance: 6 };
    const inverted = { ...normal };
    applyOrbitInput(normal, { orbitY: 10 }, 0.5, false);
    applyOrbitInput(inverted, { orbitY: 10 }, 0.5, true);
    expect(normal.pitch - 0.6).toBeCloseTo(0.6 - inverted.pitch);
  });
});

describe('camera collision response', () => {
  it('snaps inward immediately instead of easing through a wall', () => {
    expect(resolveCameraDistance(6, 6, 1.4, 1 / 60)).toBe(1.4);
    expect(resolveCameraDistance(6, 6, 0, 1 / 60)).toBe(0);
  });
  it('smoothly releases without exceeding either request or clearance', () => {
    const distance = resolveCameraDistance(2, 6, 4, 1 / 60);
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(4);
    expect(resolveCameraDistance(4, 3, 6, 1 / 60)).toBe(3);
    expect(resolveCameraDistance(2, 6, 4, 0)).toBe(2);
  });
});
