import RAPIER from '@dimforge/rapier3d-compat';

const IDENTITY_ROTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const CAMERA_CLEARANCE = 0.065;
let initialization;

/** Shared Rapier world for static shelter colliders and the companion character. */
export class PhysicsWorld {
  /** Initialize the real WASM engine once, then create an independent physics world. */
  static async create() {
    initialization ??= RAPIER.init();
    await initialization;
    return new PhysicsWorld();
  }

  constructor() {
    this.rapier = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    this.world.timestep = 1 / 60;
    this.playerCollider = undefined;
    this.playerBody = undefined;
    this._cameraBall = new RAPIER.Ball(0.3);
    this._castDirection = { x: 0, y: 0, z: 0 };
    this._cameraContact = new RAPIER.ShapeContact(
      0,
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    );
  }

  /** Register a fixed cuboid, optionally quaternion-rotated for a walkable ramp. Returns its collider. */
  addBox({ position, halfExtents, rotation }) {
    const descriptor = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(position.x, position.y, position.z)
      .setFriction(0.8)
      .setRestitution(0);
    if (rotation) descriptor.setRotation(rotation);
    return this.world.createCollider(descriptor);
  }

  /** Move an overlapping camera anchor out along real contact normals before sweeping. */
  resolveCameraAnchor(position, radius) {
    this._cameraBall.radius = Math.max(0.01, radius) + CAMERA_CLEARANCE;
    // Re-query after each correction so wall/roof corners resolve against every surface.
    for (let i = 0; i < 8; i++) {
      const collider = this.world.intersectionWithShape(
        position,
        IDENTITY_ROTATION,
        this._cameraBall,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        this.playerCollider,
        this.playerBody,
      );
      if (!collider) break;
      const contact = collider.contactShape(
        this._cameraBall,
        position,
        IDENTITY_ROTATION,
        0,
        this._cameraContact,
      );
      if (!contact || contact.distance >= 0) break;
      const correction = -contact.distance + 0.001;
      position.x += contact.normal1.x * correction;
      position.y += contact.normal1.y * correction;
      position.z += contact.normal1.z * correction;
    }
  }

  /** Return collision-safe camera travel in meters, excluding the player and all sensors. */
  castCamera(origin, direction, maxDistance, radius = 0.25) {
    if (maxDistance <= 0) return 0;
    const magnitude = Math.hypot(direction.x, direction.y, direction.z);
    if (magnitude < 0.000001) return 0;
    this._castDirection.x = direction.x / magnitude;
    this._castDirection.y = direction.y / magnitude;
    this._castDirection.z = direction.z / magnitude;
    this._cameraBall.radius = Math.max(0.01, radius);
    const hit = this.world.castShape(
      origin,
      IDENTITY_ROTATION,
      this._castDirection,
      this._cameraBall,
      CAMERA_CLEARANCE,
      maxDistance,
      false, // Permit a separating cast if floating-point contact leaves a tiny initial overlap.
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.playerCollider,
      this.playerBody,
    );
    return hit ? Math.max(0, Math.min(maxDistance, hit.time_of_impact - 0.005)) : maxDistance;
  }

  /** Free Rapier's WASM allocations after dependents have released their bodies/controllers. */
  dispose() {
    this.world.free();
    this.playerCollider = undefined;
    this.playerBody = undefined;
  }
}
