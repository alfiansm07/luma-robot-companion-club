import { clamp, dampingFactor } from './movementMath.js';

export const ANIMATION_STATES = Object.freeze(['idle', 'walk', 'run', 'jump', 'land']);
const FOOT_OFFSETS = [0, 0.5, 0.5, 0];

/** Pure locomotion state and blended gait clock; independent of rendering and physics engines. */
export class DogAnimationState {
  constructor() {
    this.weights = { idle: 1, walk: 0, run: 0, jump: 0, land: 0 };
    this.frame = {
      state: 'idle',
      weights: this.weights,
      phase: 0,
      breath: 0,
      landing: 0,
      speed: 0,
      gaitBlend: 0,
      stepMask: 0,
    };
    this.reset();
  }

  /** Clear phase, cached distances, and landing impulses for a fresh spawn. */
  reset() {
    this.state = 'idle';
    this.phase = 0;
    this.time = 0;
    this.landTimer = 0;
    this.lastDistance = null;
    this.lastLandCount = null;
    this.wasGrounded = true;
    for (const key of ANIMATION_STATES) this.weights[key] = key === 'idle' ? 1 : 0;
    Object.assign(this.frame, {
      state: 'idle',
      phase: 0,
      breath: 0,
      landing: 0,
      speed: 0,
      gaitBlend: 0,
      stepMask: 0,
    });
  }

  /** Advance animation; landCount preserves short physics events between render frames. */
  update(dt, motion) {
    dt = clamp(dt, 0, 0.1);
    const speed = Math.max(0, motion.speed || 0);
    const grounded = motion.grounded !== false;
    const countChanged =
      this.lastLandCount !== null &&
      motion.landCount !== undefined &&
      motion.landCount !== this.lastLandCount;
    const justLanded = grounded && (!this.wasGrounded || countChanged);
    if (justLanded) this.landTimer = 0.2;
    else this.landTimer = Math.max(0, this.landTimer - dt);
    this.time += dt;

    if (!grounded) this.state = 'jump';
    else if (this.landTimer > 0) this.state = 'land';
    else if (speed < (this.state === 'idle' ? 0.2 : 0.12)) this.state = 'idle';
    else if (speed > (this.state === 'run' ? 3.8 : 4.25)) this.state = 'run';
    else this.state = 'walk';

    const gaitBlend = clamp((speed - 3.0) / 2.5, 0, 1);
    const stride = (0.43 + gaitBlend * 0.35) / 0.62;
    let traveled = speed * dt;
    if (Number.isFinite(motion.distance)) {
      if (this.lastDistance !== null) traveled = Math.max(0, motion.distance - this.lastDistance);
      else traveled = 0;
      this.lastDistance = motion.distance;
    }
    // Airborne travel is not a foot cycle, and teleport/reset distances are not footsteps.
    const phaseDelta = grounded && speed > 0.12 ? Math.min(traveled / stride, 0.45) : 0;
    const nextPhase = this.phase + phaseDelta;
    let stepMask = 0;
    if (grounded && !justLanded && this.state !== 'idle' && this.state !== 'land') {
      for (let foot = 0; foot < FOOT_OFFSETS.length; foot++) {
        const offset = FOOT_OFFSETS[foot];
        if (Math.floor(this.phase + offset) !== Math.floor(nextPhase + offset))
          stepMask |= 1 << foot;
      }
    }
    this.phase = nextPhase % 1;
    const response = dampingFactor(this.state === 'jump' ? 15 : 11, dt);
    for (const name of ANIMATION_STATES) {
      this.weights[name] += ((name === this.state ? 1 : 0) - this.weights[name]) * response;
    }
    this.wasGrounded = grounded;
    if (motion.landCount !== undefined) this.lastLandCount = motion.landCount;
    Object.assign(this.frame, {
      state: this.state,
      phase: this.phase,
      breath: Math.sin(this.time * 2.4),
      landing: Math.sin((this.landTimer / 0.2) * Math.PI),
      speed,
      gaitBlend,
      stepMask,
    });
    return this.frame;
  }
}

/** Write a continuous stance/swing trajectory for an individual foot. */
export function sampleFootTrajectory(out, phase, stride, lift) {
  const cycle = ((phase % 1) + 1) % 1;
  const stance = 0.62;
  if (cycle < stance) {
    out.z = (cycle / stance - 0.5) * stride;
    out.y = 0;
  } else {
    const swing = (cycle - stance) / (1 - stance);
    const ease = swing * swing * (3 - 2 * swing);
    out.z = (0.5 - ease) * stride;
    out.y = Math.sin(swing * Math.PI) * lift;
  }
  return out;
}

/** Solve a two-link sagittal leg for a target below the hip; writes stable joint angles. */
export function solveLegIK(out, targetY, targetZ, upperLength, lowerLength, bend = 1) {
  const distance = clamp(Math.hypot(targetY, targetZ), 0.001, upperLength + lowerLength - 0.001);
  const direction = Math.atan2(targetZ, -targetY);
  const hipOffset = Math.acos(
    clamp(
      (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * upperLength * distance),
      -1,
      1,
    ),
  );
  const kneeInterior = Math.acos(
    clamp(
      (upperLength ** 2 + lowerLength ** 2 - distance ** 2) / (2 * upperLength * lowerLength),
      -1,
      1,
    ),
  );
  out.hip = -direction + bend * hipOffset;
  out.knee = -bend * (Math.PI - kneeInterior);
  return out;
}
