/** Fixed-step simulation with interpolation and no accumulated time while hidden/paused. */
export class GameLoop {
  constructor({ beforeFrame, update, render, onVisibility }) {
    this.beforeFrame = beforeFrame;
    this.update = update;
    this.render = render;
    this.onVisibility = onVisibility;
    this.step = 1 / 60;
    this.accumulator = 0;
    this.previousTime = 0;
    this.running = false;
    this.paused = true;
    this.frameId = 0;
    this.tick = this.tick.bind(this);
    this.visibility = () => {
      this.accumulator = 0;
      this.previousTime = 0;
      cancelAnimationFrame(this.frameId);
      this.onVisibility?.(document.hidden);
      if (this.running && !document.hidden) this.frameId = requestAnimationFrame(this.tick);
    };
    document.addEventListener('visibilitychange', this.visibility);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.previousTime = 0;
    if (!document.hidden) this.frameId = requestAnimationFrame(this.tick);
  }

  setPaused(paused) {
    this.paused = paused;
    this.accumulator = 0;
    this.previousTime = 0;
  }

  tick(time) {
    if (!this.running || document.hidden) return;
    const frameDt = this.previousTime ? (time - this.previousTime) / 1000 : 0;
    const dt = Math.min(frameDt, 0.1);
    this.previousTime = time;
    // Input is sampled once, then held stable across all fixed steps in this frame.
    this.beforeFrame?.(dt, this.paused);
    if (!this.paused) {
      this.accumulator += dt;
      while (this.accumulator >= this.step) {
        this.update(this.step);
        this.accumulator -= this.step;
      }
    }
    this.render(dt, this.paused ? 1 : this.accumulator / this.step, this.paused, frameDt);
    this.frameId = requestAnimationFrame(this.tick);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
