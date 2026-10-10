import { Settings } from './core/Settings.js';
import { Input } from './core/Input.js';
import { AssetLoader } from './core/AssetLoader.js';
import { GameLoop } from './core/GameLoop.js';
import { UI } from './ui/UI.js';
import './ui/style.css';

const canvas = document.querySelector('#game-canvas');
const settings = new Settings();
let renderer;
let physics;
let shelter;
let player;
let dog;
let rig;
let audio;
let input;
let loop;
let AudioManager;
let started = false;
let disposed = false;
let elapsed = 0;
let frameInput = { moveX: 0, moveY: 0, sprint: false, jump: false, orbitX: 0, orbitY: 0, zoom: 0 };
let jumpPending = false;
let fps = 60;
let hudTime = 0;
let previewDirty = false;
let pausedSettleTime = 0;
let previousSettings = { ...settings.values };
const milestones = { boot: performance.now(), ready: 0 };

const ui = new UI({
  settings,
  onPlay: play,
  onPause: pause,
  onResume: resume,
  onRestart: restart,
  onSettings: configure,
});

/** Audio is constructed/resumed synchronously inside a real Play/Resume user gesture. */
function unlockAudio() {
  if (!audio) {
    audio = new AudioManager(renderer.camera, renderer.scene, settings.values);
    audio.setSources(shelter.audioSources);
    dog.onFootstep = (event) => audio.footstep(event);
  }
  audio
    .unlock()
    .then((unlocked) => {
      if (!unlocked) ui.notify('Audio is unavailable. Check your browser sound permissions.');
    })
    .catch(() => {
      ui.notify('Audio could not start. Gameplay is still available.');
    });
}

function play() {
  if (!loop || disposed) return;
  unlockAudio();
  started = true;
  loop.setPaused(false);
  input.clear();
  input.setEnabled(true);
  audio.setPaused(false);
  ui.setPlaying();
  canvas.focus({ preventScroll: true });
}

function pause() {
  if (!loop || !started) return;
  loop.setPaused(true);
  input.setEnabled(false);
  input.clear();
  jumpPending = false;
  audio?.setPaused(true);
  previewDirty = true;
  pausedSettleTime = 0.45;
  ui.setPaused();
}

function resume() {
  if (!started) return;
  play();
}

function restart() {
  if (!player) return;
  player.reset();
  dog.reset();
  rig.reset(player.interpolate(1).position);
  audio?.reset();
  input.clear();
  jumpPending = false;
  elapsed = 0;
  play();
}

function configure(values = settings.values) {
  if (
    renderer &&
    ['quality', 'shadows', 'postProcessing', 'fov'].some(
      (key) => values[key] !== previousSettings[key],
    )
  ) {
    renderer.configure(values);
    previewDirty = true;
  }
  audio?.setVolumes(values);
  previousSettings = { ...values };
}

function resize() {
  renderer?.resize();
  previewDirty = true;
}

function dispose() {
  if (disposed) return;
  disposed = true;
  loop?.dispose();
  input?.dispose();
  audio?.dispose();
  dog?.dispose();
  player?.dispose();
  shelter?.dispose();
  physics?.dispose();
  renderer?.dispose();
  ui.dispose();
  window.removeEventListener('resize', resize);
  window.removeEventListener('pagehide', pageHide);
}

function pageHide(event) {
  if (!event.persisted) dispose();
  else if (started) pause();
}

async function bootstrap() {
  const loader = new AssetLoader((fraction, label) => ui.setProgress(fraction * 0.6, label));
  const modules = await loader.load([
    { name: 'Lighting engine', load: () => import('./core/Renderer.js'), weight: 2 },
    { name: 'Physics engine', load: () => import('./physics/PhysicsWorld.js'), weight: 4 },
    { name: 'Shelter workshop', load: () => import('./world/Shelter.js') },
    { name: 'Companion controller', load: () => import('./player/PlayerController.js') },
    { name: 'Robot articulation', load: () => import('./player/RobotDog.js') },
    { name: 'Camera system', load: () => import('./camera/ThirdPersonCamera.js') },
    { name: 'Sound studio', load: () => import('./audio/AudioManager.js') },
  ]);
  renderer = new modules['Lighting engine'].Renderer(canvas, settings.values);
  physics = await modules['Physics engine'].PhysicsWorld.create();
  ui.setProgress(0.73, 'Physics ready');
  await new Promise(requestAnimationFrame);
  shelter = new modules['Shelter workshop'].Shelter(renderer.scene, physics);
  ui.setProgress(0.84, 'Shelter furnished');
  await new Promise(requestAnimationFrame);
  player = new modules['Companion controller'].PlayerController(physics, shelter.spawn);
  dog = new modules['Robot articulation'].RobotDog();
  renderer.scene.add(dog.root);
  rig = new modules['Camera system'].ThirdPersonCamera(renderer.camera, physics);
  AudioManager = modules['Sound studio'].AudioManager;
  input = new Input(canvas);
  input.attachMobile(document.querySelector('#mobile-controls'));
  input.setEnabled(false);
  // Settle the actual controller onto the floor before the first visible frame.
  for (let i = 0; i < 24; i++) player.fixedUpdate(1 / 60, frameInput, 0);
  const initialState = player.interpolate(1);
  dog.update(0, initialState);
  rig.reset(initialState.position);
  rig.update(1 / 60, initialState.position, frameInput, settings.values);
  ui.setProgress(0.92, 'Warming materials');
  if (renderer.renderer.extensions.has('KHR_parallel_shader_compile')) {
    await renderer.renderer.compileAsync(renderer.scene, renderer.camera);
  } else {
    renderer.renderer.compile(renderer.scene, renderer.camera);
  }
  renderer.render(0);
  ui.setProgress(1, 'Ready to meet Luma');
  milestones.ready = performance.now();

  loop = new GameLoop({
    beforeFrame() {
      frameInput = input.sample();
      jumpPending ||= frameInput.jump;
    },
    update(dt) {
      frameInput.jump = jumpPending;
      player.fixedUpdate(dt, frameInput, rig.yaw);
      jumpPending = false;
      frameInput.jump = false;
    },
    render(dt, alpha, paused, frameDt) {
      // The loading/start/menu view is static. Do not redraw it at display refresh
      // rate; keep a short settling window after pause, then render on invalidation.
      if (paused) {
        pausedSettleTime = Math.max(0, pausedSettleTime - dt);
        if (!previewDirty && pausedSettleTime === 0) return;
        previewDirty = false;
      }
      const state = player.interpolate(alpha);
      if (!paused) {
        elapsed += dt;
        dog.update(dt, state);
        shelter.update(dt, elapsed);
        audio?.update(dt, state);
      }
      // A static preview stays genuinely paused; camera still settles smoothly.
      rig.update(dt, state.position, frameInput, settings.values);
      renderer.render(dt);
      if (frameDt > 0) fps += (1 / frameDt - fps) * (1 - Math.exp(-frameDt * 2));
      hudTime += dt;
      if (hudTime > 0.12) {
        ui.update({
          speed: state.speed,
          grounded: state.grounded,
          state: dog.animation.state,
          fps,
          position: state.position,
          quality: renderer.quality,
        });
        hudTime = 0;
      }
    },
    onVisibility(hidden) {
      input.clear();
      jumpPending = false;
      if (hidden && started) pause();
    },
  });
  window.addEventListener('resize', resize);
  window.addEventListener('pagehide', pageHide);
  loop.start();
  ui.ready();
  ui.update({
    speed: 0,
    grounded: true,
    state: dog.animation.state,
    fps: 0,
    quality: renderer.quality,
  });
  if (new URLSearchParams(location.search).has('qa')) {
    // Explicit opt-in, read-only diagnostics for manual/browser QA; no gameplay bypasses.
    Object.defineProperty(window, '__LUMA__', {
      configurable: true,
      value: Object.freeze({
        snapshot() {
          const state = player.interpolate(1);
          return {
            position: { x: state.position.x, y: state.position.y, z: state.position.z },
            heading: state.heading,
            speed: state.speed,
            grounded: state.grounded,
            animation: dog.animation.state,
            jumpCount: state.jumpCount,
            landCount: state.landCount,
            verticalSpeed: state.verticalSpeed,
            camera: renderer.camera.position.toArray(),
            cameraYaw: rig.yaw,
            paused: loop.paused,
            elapsed,
            fps,
            quality: renderer.quality,
            stats: renderer.stats,
            memory: { ...renderer.renderer.info.memory },
            audio: audio?.diagnostics ?? { state: 'locked', unlocked: false, sources: 0 },
            settings: { ...settings.values },
            loadMs: milestones.ready - milestones.boot,
          };
        },
      }),
    });
  }
}

bootstrap().catch((error) => {
  ui.showError(error instanceof Error ? error.message : String(error));
});

if (import.meta.hot) import.meta.hot.dispose(dispose);
