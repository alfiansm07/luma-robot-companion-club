import * as THREE from 'three';
import {
  approachHorizontalVelocity,
  clamp,
  computeMoveDirection,
  dampAngle,
  headingFromDirection,
  interpolateHeading,
} from './movementMath.js';

export const PLAYER_TUNING = Object.freeze({
  radius: 0.28,
  halfHeight: 0.52,
  walkSpeed: 3.6,
  sprintSpeed: 6.4,
  acceleration: 19,
  braking: 25,
  airAcceleration: 6,
  gravity: 22,
  jumpSpeed: 7.0,
  terminalSpeed: 25,
});

/** Rapier capsule locomotion; this controller owns the world's fixed-step advancement. */
export class PlayerController {
  constructor(physics, spawn = { x: 0, y: 0.9, z: 10 }) {
    this.physics = physics;
    this.spawn = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    const rapier = physics.rapier;
    this.body = physics.world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .lockRotations(),
    );
    this.collider = physics.world.createCollider(
      rapier.ColliderDesc.capsule(PLAYER_TUNING.halfHeight, PLAYER_TUNING.radius)
        .setFriction(0)
        .setRestitution(0),
      this.body,
    );
    physics.playerCollider = this.collider;
    physics.playerBody = this.body;
    this.character = physics.world.createCharacterController(0.008);
    this.character.setUp({ x: 0, y: 1, z: 0 });
    this.character.setSlideEnabled(true);
    this.character.enableAutostep(0.23, 0.18, false);
    this.character.enableSnapToGround(0.22);
    this.character.setMaxSlopeClimbAngle(Math.PI * 0.26);
    this.character.setMinSlopeSlideAngle(Math.PI * 0.29);
    this.character.setApplyImpulsesToDynamicBodies(false);
    this._previous = new THREE.Vector3();
    this._current = new THREE.Vector3();
    this._desired = { x: 0, y: 0, z: 0 };
    this._movement = { x: 0, y: 0, z: 0 };
    this._next = { x: 0, y: 0, z: 0 };
    this._direction = { x: 0, z: 0 };
    this._velocity = { x: 0, z: 0 };
    this._previousHeading = 0;
    this._heading = 0;
    this._previousDistance = 0;
    this.state = {
      position: new THREE.Vector3(),
      heading: 0,
      speed: 0,
      grounded: false,
      verticalSpeed: 0,
      landed: false,
      jumping: false,
      distance: 0,
      jumpCount: 0,
      landCount: 0,
    };
    this.reset();
  }

  /** Consume one fixed-step input pulse. Airborne jump requests are discarded, never buffered. */
  fixedUpdate(dt, input = {}, cameraYaw = 0) {
    dt = clamp(dt, 0, 0.05);
    if (dt <= 0) return;
    const world = this.physics.world;
    world.timestep = dt;
    this._previous.copy(this._current);
    this._previousHeading = this._heading;
    this._previousDistance = this._distance;
    const wasGrounded = this._grounded;
    computeMoveDirection(this._direction, input.moveX || 0, input.moveY || 0, cameraYaw);
    const moving = Math.hypot(this._direction.x, this._direction.z) > 0.001;
    const maximumSpeed = input.sprint ? PLAYER_TUNING.sprintSpeed : PLAYER_TUNING.walkSpeed;
    const acceleration = this._grounded
      ? moving
        ? PLAYER_TUNING.acceleration
        : PLAYER_TUNING.braking
      : PLAYER_TUNING.airAcceleration;
    approachHorizontalVelocity(
      this._velocity,
      this._direction.x * maximumSpeed,
      this._direction.z * maximumSpeed,
      acceleration,
      dt,
    );
    if (moving) {
      this._heading = dampAngle(
        this._heading,
        headingFromDirection(this._direction.x, this._direction.z),
        13,
        dt,
      );
    }
    let initiatedJump = false;
    if (input.jump && this._grounded) {
      this._verticalSpeed = PLAYER_TUNING.jumpSpeed;
      this._grounded = false;
      this._jumpCount++;
      initiatedJump = true;
    } else if (this._grounded) {
      // Snap-to-ground maintains contact; a downward push projects into uphill braking
      // and can lose horizontal motion on near-flat Rapier contact normals.
      this._verticalSpeed = 0;
    }
    if (!this._grounded) {
      this._verticalSpeed = Math.max(
        -PLAYER_TUNING.terminalSpeed,
        this._verticalSpeed - PLAYER_TUNING.gravity * dt,
      );
    }
    if (this._verticalSpeed > 0) this.character.disableSnapToGround();
    else this.character.enableSnapToGround(0.22);
    this._desired.x = this._velocity.x * dt;
    this._desired.y = this._verticalSpeed * dt;
    this._desired.z = this._velocity.z * dt;
    this.character.computeColliderMovement(
      this.collider,
      this._desired,
      this.physics.rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    this.character.computedMovement(this._movement);
    this._grounded =
      this.character.computedGrounded() && !initiatedJump && this._verticalSpeed <= 0;
    if (this._verticalSpeed > 0 && this._movement.y < this._desired.y - 0.001)
      this._verticalSpeed = 0;
    this._landed = !wasGrounded && this._grounded;
    if (this._landed) this._landCount++;
    if (this._grounded) this._verticalSpeed = 0;
    this._next.x = this._current.x + this._movement.x;
    this._next.y = this._current.y + this._movement.y;
    this._next.z = this._current.z + this._movement.z;
    this.body.setNextKinematicTranslation(this._next);
    world.step();
    this.body.translation(this._current);
    const dx = this._current.x - this._previous.x;
    const dz = this._current.z - this._previous.z;
    const traveled = Math.hypot(dx, dz);
    this._speed = traveled / dt;
    this._distance += traveled;
    // Reflect the resolved velocity so acceleration does not accumulate into a wall.
    this._velocity.x = dx / dt;
    this._velocity.z = dz / dt;
    if (this._current.y < -12) this.reset();
  }

  /** Return the same reusable render state with shortest-arc heading interpolation. */
  interpolate(alpha) {
    alpha = clamp(alpha, 0, 1);
    const state = this.state;
    state.position.lerpVectors(this._previous, this._current, alpha);
    state.heading = interpolateHeading(this._previousHeading, this._heading, alpha);
    state.speed = this._speed;
    state.grounded = this._grounded;
    state.verticalSpeed = this._verticalSpeed;
    state.landed = this._landed;
    state.jumping = !this._grounded && this._verticalSpeed > 0;
    state.distance = this._previousDistance + (this._distance - this._previousDistance) * alpha;
    state.jumpCount = this._jumpCount;
    state.landCount = this._landCount;
    return state;
  }

  /** Teleport to spawn and clear movement, interpolation, and all transient input/event state. */
  reset() {
    this.body.setTranslation(this.spawn, true);
    this.body.setNextKinematicTranslation(this.spawn);
    this._previous.copy(this.spawn);
    this._current.copy(this.spawn);
    this._velocity.x = 0;
    this._velocity.z = 0;
    this._previousHeading = 0;
    this._heading = 0;
    this._verticalSpeed = 0;
    this._grounded = false;
    this._landed = false;
    this._speed = 0;
    this._distance = 0;
    this._previousDistance = 0;
    this._jumpCount = 0;
    this._landCount = 0;
    this.character.enableSnapToGround(0.22);
    // Rapier 0.21 refreshes scene queries on a world step, including newly built static colliders.
    this.physics.world.step();
    this.interpolate(1);
  }

  /** Release the character controller and its capsule before the owning physics world. */
  dispose() {
    if (this.physics.playerCollider === this.collider) {
      this.physics.playerCollider = undefined;
      this.physics.playerBody = undefined;
    }
    this.physics.world.removeCharacterController(this.character);
    this.physics.world.removeRigidBody(this.body);
  }
}
