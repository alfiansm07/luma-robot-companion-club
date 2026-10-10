const TAU = Math.PI * 2;

/** Clamp a scalar to an inclusive range. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Normalize radians to [-PI, PI), including headings accumulated over many turns. */
export function normalizeAngle(angle) {
  return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/** The signed shortest rotation from one angle to another. */
export function shortestAngleDelta(from, to) {
  return normalizeAngle(to - from);
}

/** Interpolate heading across the wrap seam without a full-circle spin. */
export function interpolateHeading(from, to, alpha) {
  return normalizeAngle(from + shortestAngleDelta(from, to) * clamp(alpha, 0, 1));
}

/** Framerate-independent exponential response, with negative time treated as paused. */
export function dampingFactor(rate, dt) {
  return -Math.expm1(-Math.max(0, rate) * Math.max(0, dt));
}

/** Smooth an angle along its shortest arc. */
export function dampAngle(from, to, rate, dt) {
  return interpolateHeading(from, to, dampingFactor(rate, dt));
}

/** Approach a scalar without overshooting. */
export function moveToward(current, target, maxDelta) {
  const delta = target - current;
  return current + Math.sign(delta) * Math.min(Math.abs(delta), Math.max(0, maxDelta));
}

/** Write normalized camera-relative motion into an existing {x,z}. Forward is -Z. */
export function computeMoveDirection(out, moveX, moveY, cameraYaw) {
  const length = Math.hypot(moveX, moveY);
  const scale = length > 1 ? 1 / length : 1;
  const right = moveX * scale;
  const forward = moveY * scale;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  out.x = right * cos - forward * sin;
  out.z = -right * sin - forward * cos;
  return out;
}

/** Move a horizontal velocity toward its target with a circular acceleration limit. */
export function approachHorizontalVelocity(out, targetX, targetZ, acceleration, dt) {
  const dx = targetX - out.x;
  const dz = targetZ - out.z;
  const distance = Math.hypot(dx, dz);
  const maximum = Math.max(0, acceleration * dt);
  if (distance <= maximum || distance === 0) {
    out.x = targetX;
    out.z = targetZ;
  } else {
    const scale = maximum / distance;
    out.x += dx * scale;
    out.z += dz * scale;
  }
  return out;
}

/** Calculate the local-forward (-Z) heading for a nonzero horizontal direction. */
export function headingFromDirection(x, z) {
  return Math.atan2(-x, -z);
}
