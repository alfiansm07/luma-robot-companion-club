import { describe, expect, it } from 'vitest';
import {
  ANIMATION_STATES,
  DogAnimationState,
  sampleFootTrajectory,
  solveLegIK,
} from './animationState.js';

const standing = { grounded: true, speed: 0, distance: 0, landCount: 0 };

describe('robot dog animation state machine', () => {
  it('transitions through idle, walk, run, jump, land, and idle', () => {
    const animation = new DogAnimationState();
    expect(animation.update(0.016, standing).state).toBe('idle');
    expect(animation.update(0.016, { ...standing, speed: 2 }).state).toBe('walk');
    expect(animation.update(0.016, { ...standing, speed: 6 }).state).toBe('run');
    expect(animation.update(0.016, { ...standing, grounded: false, speed: 6 }).state).toBe('jump');
    expect(animation.update(0.016, { ...standing, landCount: 1 }).state).toBe('land');
    for (let frame = 0; frame < 20; frame++) animation.update(0.016, { ...standing, landCount: 1 });
    expect(animation.state).toBe('idle');
  });
  it('keeps all blend weights normalized through transitions', () => {
    const animation = new DogAnimationState();
    for (let frame = 0; frame < 80; frame++) {
      const result = animation.update(1 / 60, {
        ...standing,
        grounded: frame > 20,
        speed: frame / 10,
      });
      expect(ANIMATION_STATES.reduce((total, key) => total + result.weights[key], 0)).toBeCloseTo(
        1,
      );
      for (const name of ANIMATION_STATES) expect(result.weights[name]).toBeGreaterThanOrEqual(0);
    }
  });
  it('preserves an entire landing event between render frames using the counter', () => {
    const animation = new DogAnimationState();
    animation.update(0.016, standing);
    expect(animation.update(0.016, { ...standing, landCount: 1 }).state).toBe('land');
    animation.update(0.1, { ...standing, landCount: 1 });
    animation.update(0.1, { ...standing, landCount: 1 });
    expect(animation.update(0.016, { ...standing, landCount: 1 }).state).toBe('idle');
  });
  it('emits only grounded contact edges and never repeats a stationary contact', () => {
    const animation = new DogAnimationState();
    animation.update(0.016, standing);
    let mask = 0;
    for (let frame = 1; frame < 40; frame++) {
      mask |= animation.update(0.016, { ...standing, speed: 3, distance: frame * 0.06 }).stepMask;
    }
    expect(mask).toBe(15);
    const lastPhase = animation.phase;
    expect(
      animation.update(0.016, { ...standing, speed: 4, grounded: false, distance: 8 }).stepMask,
    ).toBe(0);
    expect(animation.phase).toBe(lastPhase);
    expect(animation.update(0.016, { ...standing, distance: 8 }).stepMask).toBe(0);
  });
  it('resets state and applies gait hysteresis around the walk/run threshold', () => {
    const animation = new DogAnimationState();
    animation.update(0.1, { ...standing, speed: 5 });
    expect(animation.update(0.016, { ...standing, speed: 4 }).state).toBe('run');
    animation.reset();
    expect(animation.update(0.016, standing).state).toBe('idle');
    expect(animation.phase).toBe(0);
    expect(animation.weights.idle).toBe(1);
  });
});

describe('continuous leg math', () => {
  it('keeps stance on the floor and lifts swing clear of it', () => {
    const foot = { y: 0, z: 0 };
    sampleFootTrajectory(foot, 0.3, 0.6, 0.12);
    expect(foot.y).toBe(0);
    sampleFootTrajectory(foot, 0.81, 0.6, 0.12);
    expect(foot.y).toBeCloseTo(0.12);
    sampleFootTrajectory(foot, 0, 0.6, 0.12);
    const first = { ...foot };
    sampleFootTrajectory(foot, 1, 0.6, 0.12);
    expect(foot).toEqual(first);
  });
  it('solves a two-link leg to its requested reachable foot position', () => {
    const angles = { hip: 0, knee: 0 };
    solveLegIK(angles, -0.58, 0.15, 0.33, 0.35);
    const y = -0.33 * Math.cos(angles.hip) - 0.35 * Math.cos(angles.hip + angles.knee);
    const z = -0.33 * Math.sin(angles.hip) - 0.35 * Math.sin(angles.hip + angles.knee);
    expect(y).toBeCloseTo(-0.58);
    expect(z).toBeCloseTo(0.15);
  });
  it('clamps unreachable targets instead of generating invalid joint rotations', () => {
    const angles = { hip: 0, knee: 0 };
    for (const target of [
      [0, 0],
      [-100, 100],
      [0.2, -0.1],
    ]) {
      solveLegIK(angles, target[0], target[1], 0.33, 0.35);
      expect(Number.isFinite(angles.hip)).toBe(true);
      expect(Number.isFinite(angles.knee)).toBe(true);
    }
  });
});
