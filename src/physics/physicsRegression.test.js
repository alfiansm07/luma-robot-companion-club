import { beforeAll, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { PhysicsWorld } from './PhysicsWorld.js';
import { PlayerController } from '../player/PlayerController.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';

beforeAll(async () => {
  const physics = await PhysicsWorld.create();
  physics.dispose();
});

const floor = { position: { x: 0, y: -0.15, z: 0 }, halfExtents: { x: 18, y: 0.15, z: 22 } };

describe('real Rapier regressions', () => {
  it('climbs and descends the shelter ramp without grounded downward-force stalls', async () => {
    const physics = await PhysicsWorld.create();
    physics.addBox(floor);
    physics.addBox({
      position: { x: 10.4, y: 0.575, z: -5.15 },
      halfExtents: { x: 1.7, y: 0.575, z: 1.65 },
    });
    physics.addBox({
      position: { x: 10.4, y: 1.17, z: -5.15 },
      halfExtents: { x: 1.72, y: 0.04, z: 1.67 },
    });
    const angle = Math.atan2(1.21, 4.2);
    physics.addBox({
      position: { x: 10.4, y: 0.605 - 0.08 * Math.cos(angle), z: -1.4 },
      halfExtents: { x: 1.69, y: 0.08, z: Math.hypot(1.21, 4.2) / 2 },
      rotation: { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) },
    });
    const player = new PlayerController(physics, { x: 10.4, y: 0.9, z: 2 });
    try {
      for (let i = 0; i < 45; i++) player.fixedUpdate(1 / 60, {});
      let minimumHeight = Infinity;
      for (let i = 0; i < 180; i++) {
        player.fixedUpdate(1 / 60, { moveY: 1 });
        const state = player.interpolate(1);
        minimumHeight = Math.min(minimumHeight, state.position.y);
        if (state.position.z < -5) break;
      }
      expect(player.interpolate(1).position.z).toBeLessThan(-5);
      expect(player.interpolate(1).position.y).toBeGreaterThan(2);
      for (let i = 0; i < 180; i++) {
        player.fixedUpdate(1 / 60, { moveY: -1 });
        const state = player.interpolate(1);
        minimumHeight = Math.min(minimumHeight, state.position.y);
        if (state.position.z > 2) break;
      }
      expect(player.interpolate(1).position.z).toBeGreaterThan(2);
      expect(minimumHeight).toBeGreaterThan(0.799);
      expect(player.interpolate(1).grounded).toBe(true);
    } finally {
      player.dispose();
      physics.dispose();
    }
  });

  it('keeps ultrawide near-plane corners inside walls when the follow anchor overlaps', async () => {
    const physics = await PhysicsWorld.create();
    physics.addBox(floor);
    physics.addBox({
      position: { x: 18, y: 3.5, z: 0 },
      halfExtents: { x: 0.21, y: 3.5, z: 22.2 },
    });
    physics.addBox({ position: { x: 0, y: 3.5, z: 22 }, halfExtents: { x: 18, y: 3.5, z: 0.21 } });
    physics.world.step();
    const camera = new PerspectiveCamera(85, 32 / 9, 0.1, 110);
    const rig = new ThirdPersonCamera(camera, physics);
    const target = new Vector3(17.502, 0.808, 21.502);
    const corner = new Vector3();
    try {
      rig.reset(target);
      for (let i = 0; i < 120; i++) {
        rig.update(1 / 60, target, { orbitX: (-Math.PI * 2) / 120 / 0.003 }, { fov: 85 });
        camera.updateMatrixWorld();
        const extent = Math.tan((85 * Math.PI) / 360) * camera.near;
        for (const x of [-1, 1])
          for (const y of [-1, 1]) {
            corner
              .set(x * extent * camera.aspect, y * extent, -camera.near)
              .applyMatrix4(camera.matrixWorld);
            expect(corner.x).toBeLessThan(17.79);
            expect(corner.z).toBeLessThan(21.79);
            expect(corner.y).toBeGreaterThan(0);
          }
      }
    } finally {
      physics.dispose();
    }
  });
});
