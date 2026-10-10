import { describe, expect, it } from 'vitest';
import {
  approachHorizontalVelocity,
  computeMoveDirection,
  dampAngle,
  dampingFactor,
  headingFromDirection,
  interpolateHeading,
  moveToward,
  normalizeAngle,
  shortestAngleDelta,
} from './movementMath.js';

describe('camera-relative locomotion', () => {
  it('keeps forward at -Z and rotates with camera yaw', () => {
    const direction = { x: 0, z: 0 };
    computeMoveDirection(direction, 0, 1, 0);
    expect(direction.x).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);
    computeMoveDirection(direction, 0, 1, Math.PI / 2);
    expect(direction.x).toBeCloseTo(-1);
    expect(direction.z).toBeCloseTo(0);
    expect(headingFromDirection(direction.x, direction.z)).toBeCloseTo(Math.PI / 2);
  });
  it('normalizes diagonals without destroying analog input magnitude', () => {
    const direction = { x: 0, z: 0 };
    computeMoveDirection(direction, 1, 1, 0.7);
    expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(1);
    computeMoveDirection(direction, 0.2, 0, 0.7);
    expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(0.2);
  });
  it('limits acceleration as a vector instead of accelerating faster diagonally', () => {
    const velocity = { x: 0, z: 0 };
    approachHorizontalVelocity(velocity, 8, 8, 12, 1 / 60);
    expect(Math.hypot(velocity.x, velocity.z)).toBeCloseTo(0.2);
    approachHorizontalVelocity(velocity, 0, 0, 100, 1);
    expect(velocity).toEqual({ x: 0, z: 0 });
  });
  it('never overshoots a target', () => {
    expect(moveToward(2, 3, 10)).toBe(3);
    expect(moveToward(-2, -3, 10)).toBe(-3);
    expect(moveToward(2, 3, -1)).toBe(2);
  });
});

describe('heading interpolation', () => {
  it('crosses the +/-PI seam along the short two-degree arc', () => {
    const from = (179 * Math.PI) / 180;
    const to = (-179 * Math.PI) / 180;
    expect(shortestAngleDelta(from, to)).toBeCloseTo((2 * Math.PI) / 180);
    expect(Math.abs(interpolateHeading(from, to, 0.5))).toBeCloseTo(Math.PI);
  });
  it('remains normalized after many revolutions', () => {
    expect(normalizeAngle(Math.PI * 80 + 0.4)).toBeCloseTo(0.4);
    expect(normalizeAngle(-Math.PI * 80 - 0.4)).toBeCloseTo(-0.4);
  });
  it('has frame-independent angular damping', () => {
    const one = dampAngle(0, 2, 10, 0.1);
    const first = dampAngle(0, 2, 10, 0.05);
    expect(dampAngle(first, 2, 10, 0.05)).toBeCloseTo(one);
    expect(dampingFactor(10, 0)).toBe(0);
    expect(dampingFactor(10, -1)).toBe(0);
  });
});
