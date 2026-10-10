import { Vector2 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

class ScaledSSAO extends SSAOPass {
  constructor(scene, camera, scale, samples) {
    super(scene, camera, 1, 1, samples);
    this.resolutionScale = scale;
    this.kernelRadius = 0.65;
    this.minDistance = 0.001;
    this.maxDistance = 0.018;
  }

  setSize(width, height) {
    super.setSize(
      Math.max(1, Math.round(width * this.resolutionScale)),
      Math.max(1, Math.round(height * this.resolutionScale)),
    );
  }

  dispose() {
    super.dispose();
    // SSAOPass r186 does not release these two owned resources itself.
    this.ssaoMaterial.dispose();
    this.noiseTexture.dispose();
  }
}

/** Owns linear-HDR AO, highlight bloom and SMAA followed by exactly one display transform. */
export class PostProcessing {
  constructor(renderer, scene, camera, preset) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    if (preset.ao)
      this.composer.addPass(new ScaledSSAO(scene, camera, preset.aoScale, preset.aoSamples));
    // Only emissive lamps and robot indicators should bloom, never broad matte surfaces.
    if (preset.bloom) this.composer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.1, 0.3, 1.8));
    this.composer.addPass(new SMAAPass());
    this.composer.addPass(new OutputPass());
  }

  /** Resizes every owned target; width and height are CSS pixels. */
  resize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  /** Draws one frame using the caller's bounded delta. */
  render(dt) {
    this.composer.render(dt);
  }

  /** Releases passes as well as the composer's shared render targets. */
  dispose() {
    for (const pass of this.composer.passes) {
      // Three r186's bloom dispose omits its high-pass material.
      if (pass instanceof UnrealBloomPass) pass.materialHighPassFilter.dispose();
      pass.dispose();
    }
    this.composer.dispose();
  }
}
