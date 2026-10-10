import * as THREE from 'three';
import { createSoundBuffers } from './synthesis.js';

const VOICE_COUNT = 12;
const TOY_ENTER_SQUARED = 1.6 * 1.6;
const TOY_LEAVE_SQUARED = 2.3 * 2.3;

function volume(value, fallback) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function setGain(parameter, value, time, smooth = true) {
  parameter.cancelScheduledValues(time);
  if (smooth) parameter.setTargetAtTime(value, time, 0.025);
  else parameter.setValueAtTime(value, time);
}

/**
 * Original, entirely synthesized shelter audio with persistent category buses and
 * pooled spatial voices. Construction is silent and creates no native context.
 * Call unlock() directly from Play's trusted user event, not a timer or loader.
 */
export class AudioManager {
  /**
   * @param {THREE.Camera} camera Camera to carry the listener.
   * @param {THREE.Scene} scene Scene for world-space sound emitters.
   * @param {{master?: number, music?: number, sfx?: number}} settingsValues Volumes.
   */
  constructor(camera, scene, settingsValues = {}) {
    this.camera = camera;
    this.scene = scene;
    this.listener = null;
    this.context = null;
    this.root = new THREE.Group();
    this.root.name = 'LUMA procedural sound emitters';
    scene.add(this.root);
    this._master = 0.75;
    this._music = 0.4;
    this._sfx = 0.7;
    this._musicBus = null;
    this._sfxBus = null;
    this._buffers = null;
    this._loops = [];
    this._voices = [];
    this._environment = [];
    this._sourceDefinitions = [];
    this._servo = null;
    this._servoRoot = null;
    this._servoLevel = 0;
    this._servoRate = 1;
    this._elapsed = 0;
    this._stepIndex = 0;
    this._paused = false;
    this._unlocked = false;
    this._disposed = false;
    this._hasState = false;
    this._grounded = true;
    this._jumping = false;
    this._landed = false;
    this._jumpCount = 0;
    this._landCount = 0;
    this._fallSpeed = 0;
    this._lastError = null;
    this._onContextState = () => {
      if (this._disposed) return;
      if (this._unlocked && !this._paused && this.context.state === 'running') {
        this._startLoops();
        this._applyMaster();
      } else {
        this._applyMaster(false);
      }
    };
    this.setVolumes(settingsValues);
  }

  /**
   * Lazily create and resume Web Audio inside the Play gesture. The resume call
   * happens before synthesis or any await, including on Safari. Returns false
   * when audio is unavailable or the browser refuses the request; gameplay may
   * continue silently and a later Play/Resume gesture can call unlock again.
   * @returns {Promise<boolean>} Whether the browser accepted the audio unlock.
   */
  async unlock() {
    if (this._disposed) return false;
    try {
      if (!this.listener) {
        this.listener = new THREE.AudioListener();
        this.context = this.listener.context;
        this.listener.gain.gain.setValueAtTime(0, this.context.currentTime);
        this.camera.add(this.listener);
        this.context.addEventListener('statechange', this._onContextState);
        this._musicBus = this.context.createGain();
        this._sfxBus = this.context.createGain();
        this._musicBus.connect(this.listener.getInput());
        this._sfxBus.connect(this.listener.getInput());
        this.setVolumes({});
      }
      const resumed = this.context.resume();
      if (!this._buffers) {
        this._buffers = createSoundBuffers(this.context);
        this._buildSounds();
      }
      await resumed;
      if (this._disposed) return false;
      this._unlocked = true;
      this._lastError = null;
      if (this._paused) this._synchronizeContext();
      else if (this.context.state === 'running') {
        this._startLoops();
        this._applyMaster();
      }
      return true;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this._applyMaster(false);
      return false;
    }
  }

  /**
   * Apply Settings values live. Master includes every source; music affects only
   * the score; SFX includes ambience, servo, all one-shots and positional sources.
   * @param {{master?: number, music?: number, sfx?: number}} values Settings values.
   */
  setVolumes(values) {
    this._master = volume(values.master, this._master);
    this._music = volume(values.music, this._music);
    this._sfx = volume(values.sfx, this._sfx);
    if (!this.context || this._disposed) return;
    const time = this.context.currentTime;
    setGain(this._musicBus.gain, this._music, time, false);
    setGain(this._sfxBus.gain, this._sfx, time, false);
    this._applyMaster();
  }

  /**
   * Pause immediately mutes and suspends the context, preserving loop playheads.
   * Resume never unlocks an untouched context or schedules accumulated effects.
   * @param {boolean} paused Whether game audio should be paused.
   */
  setPaused(paused) {
    if (this._disposed) return;
    this._paused = Boolean(paused);
    if (this._paused) {
      this._applyMaster(false);
      this._stopVoices();
    }
    this._synchronizeContext();
  }

  /**
   * Register shelter emitters; safe before unlock and safe to replace on restart.
   * Toys squeak on proximity entry, with hysteresis and a per-toy cooldown.
   * @param {Array<{kind: 'fan'|'water'|'toy', position: {x:number,y:number,z:number}}>} sources Emitters.
   */
  setSources(sources) {
    if (this._disposed) return;
    this._sourceDefinitions = sources.map(({ kind, position }) => ({
      kind,
      position: { x: position.x, y: position.y, z: position.z },
    }));
    if (this._buffers) {
      this._buildEnvironment();
      this._startLoops();
    }
  }

  /**
   * Follow the dog and observe render-safe transition counters. Grounded/jumping
   * edges remain supported for callers without counters; reset() clears history.
   * @param {number} dt Render delta in seconds.
   * @param {{position: THREE.Vector3, speed:number, grounded:boolean,
   * jumping?:boolean, landed?:boolean, verticalSpeed?:number,
   * jumpCount?:number, landCount?:number}} state Interpolated player state.
   */
  update(dt, state) {
    if (this._disposed || !state) return;
    const speed = Math.max(0, state.speed || 0);
    const grounded = Boolean(state.grounded);
    const jumping = Boolean(state.jumping);
    const landed = Boolean(state.landed);
    const verticalSpeed = state.verticalSpeed || 0;
    const hasJumpCount = Number.isFinite(state.jumpCount);
    const hasLandCount = Number.isFinite(state.landCount);
    const jumpEdge =
      this._hasState &&
      (hasJumpCount
        ? state.jumpCount > this._jumpCount
        : (!this._jumping && jumping) || (this._grounded && !grounded && verticalSpeed > 0.5));
    const landEdge =
      this._hasState &&
      (hasLandCount
        ? state.landCount > this._landCount
        : (!this._grounded && grounded) || (!this._landed && landed));
    this._fallSpeed = Math.max(this._fallSpeed, -verticalSpeed);
    if (this._canPlayEffects()) {
      if (jumpEdge) this._playVoice(this._buffers.jump, state.position, 0.65, 1);
      if (landEdge) {
        this._playVoice(
          this._buffers.land,
          state.position,
          Math.min(0.95, 0.35 + this._fallSpeed * 0.07),
          1,
        );
      }
    }
    if (grounded) this._fallSpeed = 0;
    if (this._servo) {
      this._servoRoot.position.copy(state.position);
      const target = this._paused ? 0 : Math.min(0.65, speed * 0.105) * (grounded ? 1 : 0.25);
      if (Math.abs(target - this._servoLevel) > 0.004 || (target === 0 && this._servoLevel !== 0)) {
        setGain(this._servo.gain.gain, target, this.context.currentTime);
        this._servoLevel = target;
      }
      const rate = 0.72 + Math.min(8, speed) * 0.075;
      if (Math.abs(rate - this._servoRate) > 0.02) {
        this._servo.setPlaybackRate(rate);
        this._servoRate = rate;
      }
    }
    if (!this._paused) this._elapsed += Math.max(0, Math.min(dt, 0.1));
    for (const emitter of this._environment) {
      if (emitter.kind !== 'toy') continue;
      const dx = state.position.x - emitter.group.position.x;
      const dz = state.position.z - emitter.group.position.z;
      const dy = state.position.y - emitter.group.position.y;
      const distanceSquared = dx * dx + dz * dz;
      const nearby = Math.abs(dy) < 1.8 && distanceSquared < TOY_ENTER_SQUARED;
      if (!this._hasState) emitter.inside = nearby;
      else if (!emitter.inside && nearby) {
        emitter.inside = true;
        if (this._canPlayEffects() && this._elapsed >= emitter.nextSqueak) {
          this._playVoice(
            this._buffers.toy,
            emitter.group.position,
            0.65,
            0.94 + (emitter.index % 3) * 0.06,
          );
          emitter.nextSqueak = this._elapsed + 3.5;
        }
      } else if (distanceSquared > TOY_LEAVE_SQUARED || Math.abs(dy) >= 1.8) {
        emitter.inside = false;
      }
    }
    this._grounded = grounded;
    this._jumping = jumping;
    this._landed = landed;
    if (hasJumpCount) this._jumpCount = state.jumpCount;
    if (hasLandCount) this._landCount = state.landCount;
    this._hasState = true;
  }

  /**
   * Play a paw contact from RobotDog's gait callback, at the actual contact point.
   * Variation is deterministic; buffers, panners and gains are all reused.
   * @param {{position: THREE.Vector3, intensity: number}} contact Gait contact.
   */
  footstep({ position, intensity = 0.5 }) {
    if (!this._canPlayEffects()) return;
    const strength = volume(intensity, 0.5);
    const variant = this._stepIndex % this._buffers.steps.length;
    const pitch = 0.93 + (this._stepIndex % 5) * 0.035 + strength * 0.07;
    this._stepIndex += 1;
    this._playVoice(this._buffers.steps[variant], position, 0.2 + strength * 0.55, pitch);
  }

  /** Reset transient history and loop playheads without changing user volumes or pause. */
  reset() {
    if (this._disposed) return;
    this._stopVoices();
    this._hasState = false;
    this._grounded = true;
    this._jumping = false;
    this._landed = false;
    this._jumpCount = 0;
    this._landCount = 0;
    this._fallSpeed = 0;
    this._elapsed = 0;
    this._stepIndex = 0;
    this._servoLevel = 0;
    if (this._servo) setGain(this._servo.gain.gain, 0, this.context.currentTime, false);
    for (const emitter of this._environment) {
      emitter.inside = false;
      emitter.nextSqueak = 0;
    }
    for (const sound of this._loops) this._stopSound(sound);
    this._startLoops();
  }

  /** @returns {{state:string, unlocked:boolean, paused:boolean, sources:number,
   * activeVoices:number, master:number, music:number, sfx:number, error:string|null}}
   * Actual runtime audio diagnostics; no simulated playback status.
   */
  get diagnostics() {
    let activeVoices = 0;
    for (const voice of this._voices) if (voice.sound.isPlaying) activeVoices += 1;
    return {
      state: this.context?.state ?? 'locked',
      unlocked: this._unlocked,
      paused: this._paused,
      sources: this._loops.length + activeVoices,
      activeVoices,
      master: this._master,
      music: this._music,
      sfx: this._sfx,
      error: this._lastError,
    };
  }

  /** Stop and disconnect every owned node and remove all scene/listener objects. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._unlocked = false;
    this._applyMaster(false);
    for (const sound of this._loops) this._disposeSound(sound);
    for (const voice of this._voices) this._disposeSound(voice.sound);
    this._loops.length = 0;
    this._voices.length = 0;
    this._environment.length = 0;
    this._sourceDefinitions.length = 0;
    this.root.removeFromParent();
    this.root.clear();
    this._musicBus?.disconnect();
    this._sfxBus?.disconnect();
    if (this.listener) {
      this.listener.removeFromParent();
      this.listener.gain.disconnect();
      this.context.removeEventListener('statechange', this._onContextState);
      // Three caches its context globally. Suspend, rather than close it, so a
      // later simulator instance can use that same context and unlock normally.
      if (this.context.state !== 'closed') this.context.suspend().catch(() => {});
    }
    this._buffers = null;
    this._servo = null;
    this._servoRoot = null;
  }

  _applyMaster(audible = this._unlocked && !this._paused && this.context?.state === 'running') {
    if (!this.listener || this.context.state === 'closed') return;
    setGain(this.listener.gain.gain, audible ? this._master : 0, this.context.currentTime, audible);
  }

  _synchronizeContext() {
    if (!this.context || !this._unlocked || this._disposed || this.context.state === 'closed')
      return;
    const paused = this._paused;
    const operation = paused ? this.context.suspend() : this.context.resume();
    operation
      .then(() => {
        if (this._disposed) return;
        // Rapid pause/resume can settle out of order. Reconcile against current
        // intent, never against the stale flag captured by an earlier request.
        if (paused !== this._paused) this._synchronizeContext();
        else if (!this._paused && this.context.state === 'running') {
          this._startLoops();
          this._applyMaster();
        }
      })
      .catch((error) => {
        this._lastError = error instanceof Error ? error.message : String(error);
        this._applyMaster(false);
      });
  }

  _canPlayEffects() {
    return (
      !this._disposed &&
      this._unlocked &&
      !this._paused &&
      this.context?.state === 'running' &&
      this._master > 0 &&
      this._sfx > 0
    );
  }

  _makeSound(positional, category, gain) {
    const sound = positional
      ? new THREE.PositionalAudio(this.listener)
      : new THREE.Audio(this.listener);
    sound.gain.disconnect();
    sound.gain.connect(category === 'music' ? this._musicBus : this._sfxBus);
    sound.gain.gain.setValueAtTime(gain, this.context.currentTime);
    if (positional) {
      sound.setDistanceModel('inverse');
      sound.setRefDistance(3.5);
      sound.setRolloffFactor(1.25);
      sound.setMaxDistance(55);
    }
    return sound;
  }

  _makeLoop(buffer, category, gain, group = this.root, positional = false) {
    const sound = this._makeSound(positional, category, gain);
    sound.setBuffer(buffer);
    sound.setLoop(true);
    group.add(sound);
    this._loops.push(sound);
    return sound;
  }

  _buildSounds() {
    this._makeLoop(this._buffers.music, 'music', 0.9);
    this._makeLoop(this._buffers.ambience, 'sfx', 0.85);
    this._servoRoot = new THREE.Group();
    this.root.add(this._servoRoot);
    this._servo = this._makeLoop(this._buffers.servo, 'sfx', 0, this._servoRoot, true);
    this._servo.setRefDistance(5);
    for (let i = 0; i < VOICE_COUNT; i += 1) {
      const group = new THREE.Group();
      const sound = this._makeSound(true, 'sfx', 0);
      const voice = { group, sound, startedAt: -1 };
      group.add(sound);
      this.root.add(group);
      const ended = sound.onEnded.bind(sound);
      sound.onEnded = () => {
        ended();
        // AudioBufferSourceNodes are single-use by Web Audio design. Their
        // panner/gain/scene object remain pooled; disconnect the spent source.
        if (sound.source) {
          sound.source.disconnect();
          sound.source = null;
        }
      };
      this._voices.push(voice);
    }
    this._buildEnvironment();
  }

  _buildEnvironment() {
    for (const emitter of this._environment) {
      if (emitter.sound) {
        const index = this._loops.indexOf(emitter.sound);
        if (index !== -1) this._loops.splice(index, 1);
        this._disposeSound(emitter.sound);
      }
      emitter.group.removeFromParent();
    }
    this._environment.length = 0;
    for (let index = 0; index < this._sourceDefinitions.length; index += 1) {
      const { kind, position } = this._sourceDefinitions[index];
      if (kind !== 'fan' && kind !== 'water' && kind !== 'toy') continue;
      const group = new THREE.Group();
      group.name = `LUMA ${kind} emitter`;
      group.position.set(position.x, position.y, position.z);
      this.root.add(group);
      let sound = null;
      if (kind !== 'toy') {
        sound = this._makeLoop(
          this._buffers[kind],
          'sfx',
          kind === 'fan' ? 0.55 : 0.85,
          group,
          true,
        );
        sound.setRefDistance(kind === 'fan' ? 2.5 : 2);
        sound.setRolloffFactor(1.7);
      }
      this._environment.push({ kind, group, sound, index, inside: false, nextSqueak: 0 });
    }
  }

  _startLoops() {
    if (!this._unlocked || this._paused || this._disposed || this.context?.state !== 'running')
      return;
    for (const sound of this._loops) if (!sound.isPlaying) sound.play();
  }

  _playVoice(buffer, position, gain, rate) {
    let chosen = this._voices[0];
    for (const voice of this._voices) {
      if (!voice.sound.isPlaying) {
        chosen = voice;
        break;
      }
      if (voice.startedAt < chosen.startedAt) chosen = voice;
    }
    const sound = chosen.sound;
    this._stopSound(sound);
    chosen.group.position.copy(position);
    chosen.startedAt = this.context.currentTime;
    // Set the panner immediately so the leading contact transient is not played
    // at the preceding pooled voice's position before Three's next render.
    const panner = sound.panner;
    if (panner.positionX) {
      setGain(panner.positionX, position.x, chosen.startedAt, false);
      setGain(panner.positionY, position.y, chosen.startedAt, false);
      setGain(panner.positionZ, position.z, chosen.startedAt, false);
    } else {
      panner.setPosition(position.x, position.y, position.z);
    }
    sound.setBuffer(buffer);
    sound.setPlaybackRate(rate);
    setGain(sound.gain.gain, gain, chosen.startedAt, false);
    sound.play();
  }

  _stopSound(sound) {
    if (sound.isPlaying) sound.stop();
    if (sound.source) {
      sound.source.onended = null;
      sound.source.disconnect();
      sound.source = null;
    }
  }

  _stopVoices() {
    for (const voice of this._voices) this._stopSound(voice.sound);
  }

  _disposeSound(sound) {
    this._stopSound(sound);
    sound.gain.disconnect();
    if (sound.panner) sound.panner.disconnect();
    sound.buffer = null;
    sound.removeFromParent();
  }
}
