const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight']);
const isEditable = (target) =>
  target instanceof Element &&
  Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));

/** Keyboard, pointer and touch input. Sample exactly once per rendered frame. */
export class Input {
  /** Input starts disabled so loading and menu controls cannot move the player. */
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;
    this._keys = new Set();
    this._touches = new Map();
    this._listeners = [];
    this._mobileListeners = [];
    this._mouseId = null;
    this._mouseX = 0;
    this._mouseY = 0;
    this._pinchDistance = 0;
    this._orbitX = 0;
    this._orbitY = 0;
    this._zoom = 0;
    this._jump = false;
    this._mobileX = 0;
    this._mobileY = 0;
    this._mobileSprint = false;
    this._joystickId = null;
    this._sprintId = null;
    this._joystick = null;
    this._stick = null;
    this._sprintButton = null;
    this._joystickCenterX = 0;
    this._joystickCenterY = 0;
    this._joystickRadius = 1;
    this._sample = {
      moveX: 0,
      moveY: 0,
      sprint: false,
      jump: false,
      orbitX: 0,
      orbitY: 0,
      zoom: 0,
    };

    this._listen(window, 'keydown', (event) => {
      if (!this.enabled || !MOVEMENT_KEYS.has(event.code) || isEditable(event.target)) return;
      event.preventDefault();
      this._keys.add(event.code);
      if (event.code === 'Space' && !event.repeat) this._jump = true;
    });
    this._listen(window, 'keyup', (event) => {
      this._keys.delete(event.code);
      if (this.enabled && MOVEMENT_KEYS.has(event.code) && !isEditable(event.target))
        event.preventDefault();
    });
    this._listen(window, 'blur', () => this.clear());
    this._listen(document, 'visibilitychange', () => {
      if (document.hidden) this.clear();
    });
    this._listen(canvas, 'pointerdown', (event) => this._pointerDown(event));
    this._listen(canvas, 'pointermove', (event) => this._pointerMove(event));
    this._listen(canvas, 'pointerup', (event) => this._pointerEnd(event));
    this._listen(canvas, 'pointercancel', (event) => this._pointerEnd(event));
    this._listen(canvas, 'lostpointercapture', (event) => this._pointerEnd(event));
    this._listen(canvas, 'contextmenu', (event) => {
      if (this.enabled) event.preventDefault();
    });
    this._listen(
      canvas,
      'wheel',
      (event) => {
        if (!this.enabled) return;
        event.preventDefault();
        const multiplier =
          event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
        this._zoom += event.deltaY * multiplier;
      },
      { passive: false },
    );
  }

  _listen(target, type, handler, options, mobile = false) {
    target.addEventListener(type, handler, options);
    (mobile ? this._mobileListeners : this._listeners).push(() =>
      target.removeEventListener(type, handler, options),
    );
  }

  _capture(target, id) {
    try {
      target.setPointerCapture(id);
    } catch {
      /* The pointer may already have ended. */
    }
  }

  _release(target, id) {
    if (!target || id === null) return;
    try {
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    } catch {
      /* Detached elements do not retain capture. */
    }
  }

  _pointerDown(event) {
    if (
      !this.enabled ||
      (event.pointerType !== 'touch' && event.button !== 0 && event.button !== 2)
    )
      return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    if (event.pointerType === 'touch') {
      document.documentElement.classList.add('touch-input');
      this._touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this._pinchDistance = this._touchDistance();
    } else {
      this._mouseId = event.pointerId;
      this._mouseX = event.clientX;
      this._mouseY = event.clientY;
    }
    this._capture(this.canvas, event.pointerId);
  }

  _pointerMove(event) {
    if (!this.enabled) return;
    const touch = this._touches.get(event.pointerId);
    if (touch) {
      const dx = event.clientX - touch.x;
      const dy = event.clientY - touch.y;
      touch.x = event.clientX;
      touch.y = event.clientY;
      if (this._touches.size === 1) {
        this._orbitX += dx;
        this._orbitY += dy;
      } else {
        const distance = this._touchDistance();
        if (this._pinchDistance > 0) this._zoom += (this._pinchDistance - distance) * 3;
        this._pinchDistance = distance;
      }
    } else if (this._mouseId === event.pointerId) {
      this._orbitX += event.clientX - this._mouseX;
      this._orbitY += event.clientY - this._mouseY;
      this._mouseX = event.clientX;
      this._mouseY = event.clientY;
    }
  }

  _touchDistance() {
    if (this._touches.size < 2) return 0;
    const iterator = this._touches.values();
    const first = iterator.next().value;
    const second = iterator.next().value;
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  _pointerEnd(event) {
    this._touches.delete(event.pointerId);
    this._pinchDistance = this._touchDistance();
    if (this._mouseId === event.pointerId) this._mouseId = null;
  }

  /** Bind the UI-created #mobile-controls; safe to reattach or pass null. */
  attachMobile(container) {
    this.clear();
    for (const remove of this._mobileListeners) remove();
    this._mobileListeners.length = 0;
    this._joystick = container?.querySelector('#mobile-joystick') ?? null;
    this._stick = container?.querySelector('.joystick-stick') ?? null;
    this._sprintButton = container?.querySelector('#mobile-sprint') ?? null;
    const jump = container?.querySelector('#mobile-jump');
    if (!container) return;
    const listen = (target, type, callback) => {
      if (target) this._listen(target, type, callback, undefined, true);
    };
    listen(this._joystick, 'pointerdown', (event) => {
      if (!this.enabled || this._joystickId !== null || event.button !== 0) return;
      event.preventDefault();
      const bounds = this._joystick.getBoundingClientRect();
      this._joystickCenterX = bounds.left + bounds.width / 2;
      this._joystickCenterY = bounds.top + bounds.height / 2;
      this._joystickRadius = Math.max(1, bounds.width * 0.3);
      this._joystickId = event.pointerId;
      this._capture(this._joystick, event.pointerId);
      this._updateJoystick(event);
    });
    listen(this._joystick, 'pointermove', (event) => {
      if (this.enabled && event.pointerId === this._joystickId) this._updateJoystick(event);
    });
    const endJoystick = (event) => {
      if (event.pointerId !== this._joystickId) return;
      this._joystickId = null;
      this.setMobileMove(0, 0);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      listen(this._joystick, type, endJoystick);
    listen(jump, 'pointerdown', (event) => {
      if (!this.enabled || event.button !== 0) return;
      event.preventDefault();
      this.requestJump();
    });
    listen(jump, 'click', (event) => {
      if (event.detail === 0) this.requestJump();
    });
    listen(this._sprintButton, 'pointerdown', (event) => {
      if (!this.enabled || event.button !== 0) return;
      event.preventDefault();
      this._sprintId = event.pointerId;
      this._capture(this._sprintButton, event.pointerId);
      this.setMobileSprint(true);
    });
    const endSprint = (event) => {
      if (event.pointerId !== this._sprintId) return;
      this._sprintId = null;
      this.setMobileSprint(false);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      listen(this._sprintButton, type, endSprint);
    listen(this._sprintButton, 'click', (event) => {
      if (event.detail === 0) this.setMobileSprint(!this._mobileSprint);
    });
  }

  _updateJoystick(event) {
    this.setMobileMove(
      (event.clientX - this._joystickCenterX) / this._joystickRadius,
      (this._joystickCenterY - event.clientY) / this._joystickRadius,
    );
  }

  /** Set analog movement, with positive y moving forward. */
  setMobileMove(x, y) {
    if (!this.enabled) {
      x = 0;
      y = 0;
    }
    x = Number.isFinite(x) ? x : 0;
    y = Number.isFinite(y) ? y : 0;
    const magnitude = Math.max(1, Math.hypot(x, y));
    this._mobileX = x / magnitude;
    this._mobileY = y / magnitude;
    if (this._stick)
      this._stick.style.transform = `translate(${this._mobileX * this._joystickRadius}px, ${-this._mobileY * this._joystickRadius}px)`;
  }

  /** Hold sprint on touch devices; disabling input always releases it. */
  setMobileSprint(active) {
    this._mobileSprint = this.enabled && Boolean(active);
    this._sprintButton?.setAttribute('aria-pressed', String(this._mobileSprint));
  }

  /** Queue one jump for the next sample, only while gameplay is enabled. */
  requestJump() {
    if (this.enabled) this._jump = true;
  }

  /** Return a reused frame object, consuming jump, orbit and zoom deltas. */
  sample() {
    const frame = this._sample;
    let x = this.enabled
      ? Number(this._keys.has('KeyD')) - Number(this._keys.has('KeyA')) + this._mobileX
      : 0;
    let y = this.enabled
      ? Number(this._keys.has('KeyW')) - Number(this._keys.has('KeyS')) + this._mobileY
      : 0;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    frame.moveX = x;
    frame.moveY = y;
    frame.sprint =
      this.enabled &&
      (this._mobileSprint || this._keys.has('ShiftLeft') || this._keys.has('ShiftRight'));
    frame.jump = this.enabled && this._jump;
    frame.orbitX = this.enabled ? this._orbitX : 0;
    frame.orbitY = this.enabled ? this._orbitY : 0;
    frame.zoom = this.enabled ? this._zoom : 0;
    this._jump = false;
    this._orbitX = 0;
    this._orbitY = 0;
    this._zoom = 0;
    return frame;
  }

  /** Clear held keys, captured pointers and all unconsumed frame deltas. */
  clear() {
    this._keys.clear();
    this._release(this.canvas, this._mouseId);
    for (const id of this._touches.keys()) this._release(this.canvas, id);
    this._touches.clear();
    this._mouseId = null;
    this._pinchDistance = 0;
    this._release(this._joystick, this._joystickId);
    this._release(this._sprintButton, this._sprintId);
    this._joystickId = null;
    this._sprintId = null;
    this.setMobileMove(0, 0);
    this.setMobileSprint(false);
    this._jump = false;
    this._orbitX = 0;
    this._orbitY = 0;
    this._zoom = 0;
  }

  /** Menu transitions must disable input; old key presses are never retained. */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.clear();
  }

  /** Release input and remove every event listener. */
  dispose() {
    this.setEnabled(false);
    for (const remove of this._mobileListeners) remove();
    for (const remove of this._listeners) remove();
    this._mobileListeners.length = 0;
    this._listeners.length = 0;
  }
}
