import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PostProcessing } from '../rendering/PostProcessing.js';
import { StablePMREMGenerator } from '../rendering/StablePMREMGenerator.js';
import {
  QUALITY_PRESETS,
  detectQuality,
  resolveQuality,
  effectivePixelRatio,
} from '../rendering/quality.js';

/** WebGL2 renderer with stable hardware presets, physically based lighting and bounded HDR effects. */
export class Renderer {
  constructor(canvas, settingsValues = {}) {
    this.canvas = canvas;
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!context)
      throw new Error(
        'LUMA needs WebGL 2. Please enable hardware acceleration or use a recent browser.',
      );
    this.renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // One shadow update per displayed frame, not another update during SSAO's normal render.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e8e9e3');
    this.scene.fog = new THREE.Fog('#e8e9e3', 37, 80);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 110);
    this.camera.position.set(0, 3.7, 16);
    this.camera.lookAt(0, 0.9, 10);
    this.scene.add(this.camera);
    this.automaticQuality = detectQuality(this.renderer);
    this._stats = { calls: 0, triangles: 0 };
    this._disposed = false;
    this._post = null;
    this._pipelineKey = '';

    const pmrem = new StablePMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this._environment = pmrem.fromScene(environment);
    environment.dispose();
    pmrem.dispose();
    this.scene.environment = this._environment.texture;
    this.scene.environmentIntensity = 0.18;

    this._lights = new THREE.Group();
    this._lights.name = 'Shelter daylight';
    this.scene.add(this._lights);
    // Keep matte ivory below the HDR bloom threshold; the key supplies shape, not ambient wash.
    this._lights.add(new THREE.HemisphereLight('#dff1f3', '#b9a98c', 0.65));
    this.keyLight = new THREE.DirectionalLight('#fff0d6', 2.2);
    this.keyLight.position.set(-14, 26, 8);
    this.keyLight.target.position.set(0, 0, -3);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.camera.left = -28;
    this.keyLight.shadow.camera.right = 28;
    this.keyLight.shadow.camera.top = 30;
    this.keyLight.shadow.camera.bottom = -30;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 72;
    this.keyLight.shadow.bias = -0.00012;
    this.keyLight.shadow.normalBias = 0.045;
    this.keyLight.shadow.radius = 3;
    this.keyLight.shadow.intensity = 0.68;
    this._lights.add(this.keyLight, this.keyLight.target);
    const fill = new THREE.DirectionalLight('#d5f4ee', 0.45);
    fill.position.set(12, 9, -16);
    this._lights.add(fill);
    this.configure(settingsValues);
    this._onResize = () => this.resize();
    globalThis.addEventListener('resize', this._onResize);
    this._resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this._onResize);
    this._resizeObserver?.observe(canvas.parentElement ?? canvas);
  }

  /** Applies live settings without rebuilding unchanged effects or leaking old targets. */
  configure(values = {}) {
    this._settings = { quality: 'auto', shadows: true, postProcessing: true, fov: 60, ...values };
    this.quality = resolveQuality(this._settings.quality, this.automaticQuality);
    this._preset = QUALITY_PRESETS[this.quality];
    this.camera.fov = this._settings.fov;
    this.camera.updateProjectionMatrix();
    const shadowEnabled = Boolean(this._settings.shadows);
    const shadowChanged = this.renderer.shadowMap.enabled !== shadowEnabled;
    this.renderer.shadowMap.enabled = shadowEnabled;
    this.keyLight.castShadow = shadowEnabled;
    if (this.keyLight.shadow.mapSize.x !== this._preset.shadowSize) {
      this.keyLight.shadow.mapSize.setScalar(this._preset.shadowSize);
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
      this.keyLight.shadow.needsUpdate = true;
    }
    if (!this.keyLight.shadow.map) {
      // Explicit nearest depth comparisons are portable; the PCF shader still
      // performs its five rotated taps instead of relying on driver filtering.
      const size = this._preset.shadowSize;
      const map = new THREE.WebGLRenderTarget(size, size);
      map.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
      map.depthTexture.format = THREE.DepthFormat;
      map.depthTexture.compareFunction = THREE.LessEqualCompare;
      map.depthTexture.minFilter = THREE.NearestFilter;
      map.depthTexture.magFilter = THREE.NearestFilter;
      this.keyLight.shadow.map = map;
    }
    if (shadowChanged) {
      this.scene.traverse((object) => {
        if (!object.material) return;
        if (Array.isArray(object.material)) {
          for (const material of object.material) material.needsUpdate = true;
        } else object.material.needsUpdate = true;
      });
    }
    const pipelineKey = this._settings.postProcessing ? this.quality : 'off';
    if (pipelineKey !== this._pipelineKey) {
      this._post?.dispose();
      this._post = this._settings.postProcessing
        ? new PostProcessing(this.renderer, this.scene, this.camera, this._preset)
        : null;
      this._pipelineKey = pipelineKey;
    }
    this.resize();
  }

  /** Matches the container while keeping drawing-buffer pixels inside the tier's budget. */
  resize() {
    if (this._disposed) return;
    const container = this.canvas.parentElement;
    const width = Math.max(1, container?.clientWidth || globalThis.innerWidth || 1);
    const height = Math.max(1, container?.clientHeight || globalThis.innerHeight || 1);
    const ratio = effectivePixelRatio(width, height, globalThis.devicePixelRatio, this._preset);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this._post?.resize(width, height, ratio);
  }

  /** Draws one frame and records the complete scene/shadow/postprocessing draw count. */
  render(dt = 0) {
    if (this._disposed) return;
    this.renderer.info.reset();
    this.renderer.shadowMap.needsUpdate = true;
    if (this._post) this._post.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this._stats.calls = this.renderer.info.render.calls;
    this._stats.triangles = this.renderer.info.render.triangles;
  }

  /** Stable diagnostic object updated after each render, including postprocessing work. */
  get stats() {
    return this._stats;
  }

  /** Releases only renderer-owned lighting, environment, listeners and GPU resources. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    globalThis.removeEventListener('resize', this._onResize);
    this._resizeObserver?.disconnect();
    this._post?.dispose();
    this.keyLight.shadow.dispose();
    this._lights.removeFromParent();
    this.scene.environment = null;
    this._environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
