const ICONS = {
  settings:
    '<path d="m9.5 3-.7 2.2-2.2 1.3-2.3-.5-2.5 4.3 1.6 1.7v2.6L1.8 16l2.5 4.3 2.3-.5 2.2 1.3.7 2.2h5l.7-2.2 2.2-1.3 2.3.5 2.5-4.3-1.6-1.7v-2.6l1.6-1.7-2.5-4.3-2.3.5-2.2-1.3-.7-2.2z" transform="translate(1 -1) scale(.92)"/><circle cx="12" cy="12" r="3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5m0 3v.2"/>',
  sound: '<path d="m11 4-5 5H3v6h3l5 5zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  jump: '<path d="M12 19V5m-5 5 5-5 5 5M5 20h14"/>',
  sprint: '<path d="m13 3-6 10h6l-2 8 8-12h-7z"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const mark =
  '<svg class="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M11 12 5 9v13l7 4m17-14 6-3v13l-7 4" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><rect x="10" y="9" width="20" height="23" rx="8" fill="currentColor"/><rect x="13" y="15" width="14" height="10" rx="4" fill="var(--paper)"/><path d="M17 19v2m6-2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const controlsMarkup = `
  <div class="control-row"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><strong>Move your companion</strong></div>
  <div class="control-row"><span><kbd>SPACE</kbd></span><strong>Jump</strong></div>
  <div class="control-row"><span><kbd>SHIFT</kbd></span><strong>Hold to sprint</strong></div>
  <div class="control-row"><span class="control-key">Mouse drag</span><strong>Orbit the camera</strong></div>
  <div class="control-row"><span class="control-key">Mouse wheel</span><strong>Zoom in / out</strong></div>
  <div class="control-row"><span><kbd>ESC</kbd></span><strong>Pause / resume</strong></div>
  <div class="control-row"><span><kbd>H</kbd></span><strong>Open this guide</strong></div>
  <div class="control-row"><span><kbd>F3</kbd></span><strong>Toggle live FPS</strong></div>`;

function rangeSetting(key, title, description, min, max, step) {
  return `<label class="setting-row range-setting" for="setting-${key}"><span class="setting-copy"><strong>${title}</strong><small>${description}</small></span><span class="range-control"><output id="value-${key}" for="setting-${key}"></output><input type="range" id="setting-${key}" data-setting="${key}" min="${min}" max="${max}" step="${step}"></span></label>`;
}
function toggleSetting(key, title, description) {
  return `<label class="setting-row" for="setting-${key}"><span class="setting-copy"><strong>${title}</strong><small>${description}</small></span><span class="toggle"><input id="setting-${key}" data-setting="${key}" type="checkbox"><span class="toggle-track" aria-hidden="true"></span></span></label>`;
}

/** Accessible menu, real-time HUD and mobile-control DOM for LUMA. */
export class UI {
  /** onPlay runs synchronously in a click event, so its caller can unlock audio. */
  constructor({ settings, onPlay, onPause, onResume, onRestart, onSettings }) {
    this.settings = settings;
    this.callbacks = { onPlay, onPause, onResume, onRestart, onSettings };
    this._listeners = [];
    this._screen = 'loading';
    this._returnScreen = 'start';
    this._isPlaying = false;
    this._gameStarted = false;
    this._quality = 'Auto';
    this._lastHudTime = 0;
    this._noticeTimer = null;
    this.root = document.createElement('div');
    this.root.id = 'game-ui';
    this.root.innerHTML = `
      <header class="hud-top" id="game-hud">
        <a class="brand" href="#" id="brand-home" aria-label="Luma, open pause menu">${mark}<span class="brand-word">luma<span class="brand-dot">.</span><small>ROBOT COMPANION CLUB</small></span></a>
        <nav class="hud-actions" aria-label="Game menu">
          <span class="quality-badge"><span class="status-dot"></span><span id="quality-label">AUTO QUALITY</span></span>
          <button type="button" class="icon-button" id="hud-controls" aria-label="Controls (H)" title="Controls (H)">${icon('help')}</button>
          <button type="button" class="icon-button" id="hud-settings" aria-label="Settings" title="Settings">${icon('settings')}</button>
          <button type="button" class="icon-button dark-button" id="hud-pause" aria-label="Pause (Escape)" title="Pause (Escape)">${icon('pause')}</button>
        </nav>
      </header>
      <div class="play-hud" id="play-hud" hidden>
        <aside class="companion-status" aria-label="Companion status"><span class="status-dot"></span><span>LUMA <span class="status-separator">/</span> <strong id="companion-state">Ready to explore</strong></span></aside>
        <div class="reticle" aria-hidden="true"></div>
        <aside class="play-hints"><span><kbd>W A S D</kbd> Move</span><span><kbd>SPACE</kbd> Jump</span><span><kbd>SHIFT</kbd> Sprint</span><button type="button" id="hint-controls"><kbd>H</kbd> All controls</button></aside>
        <aside class="speed-card" aria-label="Live movement speed"><span class="speed-caption">COMPANION PACE</span><div><strong id="speed-value">0.0</strong><span>m/s</span></div><span id="motion-label">Standing by</span></aside>
      </div>
      <output class="fps-counter" id="fps-counter" aria-label="Live frames per second" hidden>— FPS</output>
      <aside class="ui-notification" id="ui-notification" hidden><span id="notification-message" role="status" aria-live="polite"></span><button type="button" id="dismiss-notification" aria-label="Dismiss notification">${icon('close')}</button></aside>
      <div class="menu-overlay" id="menu-overlay" role="dialog" aria-modal="true" aria-labelledby="loading-title">
        <section class="loading-screen screen" data-screen="loading" aria-labelledby="loading-title">
          <span class="eyebrow">A LITTLE COMPANION. A BIG DAY AHEAD.</span>
          <h1 id="loading-title">A place to <em>belong.</em></h1>
          <p class="intro-copy">Making a little room for your new best friend.</p>
          <div class="loading-status"><span id="loading-label" role="status">Preparing the playground</span><span id="loading-percent">0%</span></div>
          <progress id="loading-progress" max="1" value="0" aria-label="Loading playground"></progress>
          <span class="loading-note">BUILT FOR WANDERING. DESIGNED FOR JOY.</span>
        </section>
        <section class="start-screen screen" data-screen="start" aria-labelledby="start-title" hidden>
          <div class="welcome-copy"><span class="eyebrow"><span class="tiny-line"></span> YOUR NEW FAVORITE COMPANION</span>
            <h1 id="start-title">Small paws.<br>Big <em>personality.</em></h1>
            <p class="intro-copy">Meet Luma. A curious little robot with a whole<br class="desktop-break"> world to explore. Make yourself at home.</p>
            <div class="start-actions"><button type="button" id="play-button" class="primary-button">Let’s play ${icon('arrow')}</button><button type="button" id="start-controls" class="text-button">How to play <span>↗</span></button></div>
            <p class="sound-note">${icon('sound')} A little better with sound on.</p>
          </div>
          <aside class="first-help" id="first-launch-help"><span class="eyebrow">FIRST TIME HERE?</span><p><span class="desktop-help"><kbd>W A S D</kbd> to wander · <kbd>SPACE</kbd> to jump<br>Drag to look around. Hold <kbd>SHIFT</kbd> to run.</span><span class="touch-help">Use the left joystick to wander. Drag anywhere in the room to look around. Pinch to zoom.</span></p><button type="button" class="inline-button" id="first-help-controls">Meet your controls ${icon('arrow')}</button></aside>
          <aside class="welcome-tag"><span class="tag-orbit" aria-hidden="true"></span><div><span>MEET YOUR COMPANION</span><strong>Luma <small>01</small></strong><p>All heart. A little hardware.</p></div></aside>
          <footer class="start-footer"><span>THE PLAYGROUND <span class="footer-dash">—</span> OPEN FOR EXPLORING</span><span>NO MISSIONS. JUST GOOD COMPANY.</span></footer>
        </section>
        <section class="panel pause-screen screen" data-screen="pause" aria-labelledby="pause-title" hidden>
          <span class="eyebrow">TAKE YOUR TIME</span><h2 id="pause-title">A little <em>paws.</em></h2><p class="panel-intro">Luma will be right here.</p>
          <div class="pause-actions"><button type="button" class="primary-button" id="resume-button">Keep exploring ${icon('arrow')}</button><button type="button" class="secondary-button" id="pause-settings">Settings ${icon('settings')}</button><button type="button" class="secondary-button" id="pause-controls">How to play ${icon('help')}</button><button type="button" class="text-button restart-button" id="restart-button">Start from the entrance <span>↗</span></button></div>
          <span class="panel-footnote"><kbd>ESC</kbd> to return to your companion</span>
        </section>
        <section class="panel settings-screen screen" data-screen="settings" aria-labelledby="settings-title" hidden>
          <div class="panel-heading"><div><span class="eyebrow">MAKE YOURSELF COMFORTABLE</span><h2 id="settings-title">Your <em>preferences.</em></h2></div><button type="button" id="close-settings" class="icon-button close-button" aria-label="Close settings">${icon('close')}</button></div>
          <div class="settings-scroll">
            <fieldset><legend>01 <span>THE LOOK</span></legend>
              <label class="setting-row" for="setting-quality"><span class="setting-copy"><strong>Graphics quality</strong><small id="quality-description">Auto chooses a preset for your device.</small></span><select id="setting-quality" data-setting="quality"><option value="auto">Auto · recommended</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
              ${toggleSetting('shadows', 'Soft shadows', 'Ground your companion in the room.')}
              ${toggleSetting('postProcessing', 'Finishing touches', 'Ambient shading, glow and antialiasing.')}
              ${toggleSetting('showFps', 'Show live FPS', 'Actual frame rate. Also available with F3.')}
            </fieldset>
            <fieldset><legend>02 <span>YOUR VIEW</span></legend>
              ${rangeSetting('sensitivity', 'Camera sensitivity', 'How quickly the camera follows your drag.', 0.2, 2, 0.05)}
              ${rangeSetting('fov', 'Field of view', 'A closer view or a wider perspective.', 45, 85, 1)}
              ${toggleSetting('invertY', 'Invert vertical camera', 'Reverse the up / down drag direction.')}
            </fieldset>
            <fieldset><legend>03 <span>THE SOUND</span></legend>
              ${rangeSetting('master', 'Master volume', 'The whole playground, at your level.', 0, 1, 0.01)}
              ${rangeSetting('music', 'Music', 'A soft soundtrack for a slow afternoon.', 0, 1, 0.01)}
              ${rangeSetting('sfx', 'Companion & surroundings', 'Little footsteps, servos and room ambience.', 0, 1, 0.01)}
            </fieldset>
          </div>
          <div class="panel-bottom"><span>Changes apply immediately.<br>Saved on this device when storage is available.</span><button type="button" class="primary-button compact-button" id="settings-done">All set ${icon('arrow')}</button></div>
        </section>
        <section class="panel controls-screen screen" data-screen="controls" aria-labelledby="controls-title" hidden>
          <div class="panel-heading"><div><span class="eyebrow">GOOD COMPANY. SIMPLE CONTROLS.</span><h2 id="controls-title">Find your <em>feet.</em></h2></div><button type="button" id="close-controls" class="icon-button close-button" aria-label="Close controls">${icon('close')}</button></div>
          <div class="controls-scroll"><div class="controls-list">${controlsMarkup}</div><div class="touch-guide"><span class="eyebrow">ON A TOUCHSCREEN</span><p>Left joystick to move. Hold the lightning button to sprint; tap the arrow to jump. Drag the room to orbit, and pinch with two fingers to zoom. The top-right pause button gives you a breather.</p></div><p class="controls-note">Explore at your own pace. Try the ramp, find a sunny spot, or take a lap. There’s no wrong way to spend an afternoon.</p></div>
          <div class="panel-bottom"><span>Go on. A little curiosity looks good on you.</span><button type="button" class="primary-button compact-button" id="controls-done">Got it ${icon('arrow')}</button></div>
        </section>
        <section class="panel error-screen screen" data-screen="error" aria-labelledby="error-title" hidden>
          <span class="eyebrow">LET’S TRY THAT AGAIN</span><h2 id="error-title">A small <em>hiccup.</em></h2><p id="error-message" role="alert"></p><p class="panel-intro">Luma needs a browser with WebGL 2 and hardware acceleration enabled.</p><button type="button" class="primary-button" id="reload-button">Reload playground ${icon('arrow')}</button>
        </section>
      </div>
      <div id="mobile-controls" class="mobile-controls" hidden aria-label="Touch gameplay controls"><div class="joystick-zone"><div id="mobile-joystick" class="joystick-base" role="group" aria-label="Drag joystick to move"><span class="joystick-axis axis-x"></span><span class="joystick-axis axis-y"></span><span class="joystick-stick"></span></div><span class="joystick-label">MOVE</span></div><div class="mobile-actions"><button type="button" id="mobile-sprint" class="mobile-action sprint-action" aria-label="Hold to sprint" aria-pressed="false">${icon('sprint')}<span>SPRINT</span></button><button type="button" id="mobile-jump" class="mobile-action jump-action" aria-label="Jump">${icon('jump')}<span>JUMP</span></button></div></div>`;
    document.querySelector('#app').append(this.root);
    this.overlay = this.root.querySelector('#menu-overlay');
    this.hud = this.root.querySelector('#play-hud');
    this.mobile = this.root.querySelector('#mobile-controls');
    this.fps = this.root.querySelector('#fps-counter');
    this._screens = [...this.root.querySelectorAll('[data-screen]')];
    this._settingInputs = [...this.root.querySelectorAll('[data-setting]')];
    this._speed = this.root.querySelector('#speed-value');
    this._motion = this.root.querySelector('#motion-label');
    this._companion = this.root.querySelector('#companion-state');
    this._qualityLabel = this.root.querySelector('#quality-label');
    this._progress = this.root.querySelector('#loading-progress');
    this._progressPercent = this.root.querySelector('#loading-percent');
    this._progressLabel = this.root.querySelector('#loading-label');
    this.root.querySelector('#first-launch-help').hidden = settings.helpSeen;

    this._click('play-button', () => {
      this.settings.markHelpSeen();
      this.setPlaying();
      this.callbacks.onPlay?.();
    });
    this._click('resume-button', () => this._resume());
    this._click('restart-button', () => {
      this.setPlaying();
      this.callbacks.onRestart?.();
    });
    this._click('hud-pause', () => this._pause());
    this._click('brand-home', (event) => {
      event.preventDefault();
      if (this._isPlaying) this._pause();
    });
    for (const id of ['hud-settings', 'pause-settings'])
      this._click(id, () => this._openPanel('settings'));
    for (const id of [
      'hud-controls',
      'hint-controls',
      'start-controls',
      'pause-controls',
      'first-help-controls',
    ])
      this._click(id, () => this._openPanel('controls'));
    for (const id of ['close-settings', 'settings-done', 'close-controls', 'controls-done'])
      this._click(id, () => this._closePanel());
    this._click('reload-button', () => window.location.reload());
    this._click('dismiss-notification', () => {
      clearTimeout(this._noticeTimer);
      this.root.querySelector('#ui-notification').hidden = true;
    });
    for (const input of this._settingInputs) {
      this._listen(input, input.type === 'range' ? 'input' : 'change', () => {
        const value =
          input.type === 'checkbox'
            ? input.checked
            : input.type === 'range'
              ? Number(input.value)
              : input.value;
        this.settings.set(input.dataset.setting, value);
      });
    }
    this._unsubscribe = settings.subscribe((values) => {
      this._syncSettings(values);
      this.callbacks.onSettings?.(values);
    });
    this._syncSettings(settings.values);
    this._listen(window, 'keydown', (event) => this._keyDown(event));
    this._listen(this.overlay, 'keydown', (event) => this._trapFocus(event));
    this._show('loading', false);
  }

  _listen(target, type, handler) {
    target.addEventListener(type, handler);
    this._listeners.push(() => target.removeEventListener(type, handler));
  }

  _click(id, callback) {
    this._listen(this.root.querySelector(`#${id}`), 'click', callback);
  }

  _show(screen, focus = true) {
    this._screen = screen;
    this.root.dataset.screen = screen;
    const playing = screen === 'playing';
    this.overlay.hidden = playing;
    this.hud.hidden = !playing;
    this.mobile.hidden = !playing;
    this.root.querySelector('.hud-actions').hidden = screen === 'loading' || screen === 'error';
    this.root.querySelector('#hud-pause').hidden = !playing;
    const modal = !playing && screen !== 'start' && screen !== 'loading';
    this.root.querySelector('#game-hud').inert = modal;
    for (const section of this._screens) section.hidden = section.dataset.screen !== screen;
    this.overlay.setAttribute('aria-modal', String(modal));
    if (!playing) this.overlay.setAttribute('aria-labelledby', `${screen}-title`);
    if (!focus) return;
    if (playing) {
      const canvas = document.querySelector('#game-canvas');
      if (canvas) {
        canvas.tabIndex = -1;
        canvas.focus({ preventScroll: true });
      }
    } else {
      const section = this._screens.find((item) => item.dataset.screen === screen);
      (section?.querySelector('button:not(.close-button), select, input') ?? this.overlay).focus({
        preventScroll: true,
      });
    }
  }

  _pause() {
    if (!this._isPlaying) return;
    this.setPaused();
    this.callbacks.onPause?.();
  }

  _resume() {
    if (!this._gameStarted) return;
    this.setPlaying();
    this.callbacks.onResume?.();
  }

  _openPanel(screen) {
    if (this._screen === 'loading' || this._screen === 'error') return;
    if (this._screen === screen) {
      this._closePanel();
      return;
    }
    if (this._isPlaying) this._pause();
    if (this._screen !== 'settings' && this._screen !== 'controls')
      this._returnScreen = this._gameStarted ? 'pause' : 'start';
    this._show(screen);
  }

  _closePanel() {
    if (this._screen !== 'settings' && this._screen !== 'controls') return;
    if (this._screen === 'controls') {
      this.settings.markHelpSeen();
      this.root.querySelector('#first-launch-help').hidden = true;
    }
    this._show(this._returnScreen);
  }

  _keyDown(event) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'F3') {
      event.preventDefault();
      this.settings.set('showFps', !this.settings.values.showFps);
      return;
    }
    if (event.code === 'Escape') {
      if (this._screen === 'loading' || this._screen === 'error' || this._screen === 'start')
        return;
      event.preventDefault();
      if (this._isPlaying) this._pause();
      else if (this._screen === 'pause') this._resume();
      else this._closePanel();
      return;
    }
    if (
      event.code === 'KeyH' &&
      !(
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable="true"]')
      )
    ) {
      event.preventDefault();
      this._openPanel('controls');
    }
  }

  _trapFocus(event) {
    if (
      event.key !== 'Tab' ||
      this.overlay.hidden ||
      this.overlay.getAttribute('aria-modal') !== 'true'
    )
      return;
    const section = this._screens.find((item) => !item.hidden);
    const targets = [
      ...section.querySelectorAll('button:not([disabled]), input, select, [tabindex="0"]'),
    ];
    if (!targets.length) return;
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  _syncSettings(values) {
    for (const input of this._settingInputs) {
      const value = values[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
      if (input.type === 'range') {
        const key = input.dataset.setting;
        const display =
          key === 'sensitivity'
            ? `${value.toFixed(2)}×`
            : key === 'fov'
              ? `${Math.round(value)}°`
              : `${Math.round(value * 100)}%`;
        this.root.querySelector(`#value-${key}`).textContent = display;
        input.setAttribute('aria-valuetext', display);
        const percent =
          ((value - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
        input.style.setProperty('--range-fill', `${percent}%`);
      }
    }
    this.fps.hidden = !values.showFps;
  }

  /** Show a nonblocking, dismissible status message; no HTML is interpreted. */
  notify(message) {
    const notification = this.root.querySelector('#ui-notification');
    this.root.querySelector('#notification-message').textContent = String(message);
    notification.hidden = false;
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => {
      notification.hidden = true;
    }, 9000);
  }

  /** Render actual asset-task completion, not elapsed time or a simulated percentage. */
  setProgress(fraction, label) {
    const value = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
    this._progress.value = value;
    this._progressPercent.textContent = `${Math.round(value * 100)}%`;
    if (typeof label === 'string') this._progressLabel.textContent = label;
  }

  /** Replace loading with the cinematic, user-activated Play screen. */
  ready() {
    if (this._screen === 'error') return;
    this.setProgress(1, 'Your companion is ready');
    this._show('start');
  }

  /** Show gameplay HUD; integration is responsible for enabling simulation/input. */
  setPlaying() {
    this._isPlaying = true;
    this._gameStarted = true;
    this._show('playing');
  }

  /** Show the pause menu, preserving an already-open settings or controls panel. */
  setPaused() {
    this._isPlaying = false;
    if (!this._gameStarted) return;
    if (this._screen !== 'settings' && this._screen !== 'controls') this._show('pause');
  }

  /** Display measured movement speed, state and frame rate from the active loop. */
  update({ speed = 0, grounded = true, state, fps = 0, quality } = {}) {
    if (quality && quality !== this._quality) {
      this._quality = quality;
      this._qualityLabel.textContent = `${String(quality).toUpperCase()} QUALITY`;
      this.root.querySelector('#quality-description').textContent =
        `Currently rendering at ${quality} quality. Auto chooses for your device.`;
    }
    const now = performance.now();
    if (now - this._lastHudTime < 90) return;
    this._lastHudTime = now;
    const pace = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    const inAir = state && typeof state === 'object' ? state.grounded === false : !grounded;
    const label = inAir
      ? 'A little airborne'
      : pace > 4
        ? 'Happy little sprint'
        : pace > 0.12
          ? 'Out exploring'
          : 'Standing by';
    const speedText = pace.toFixed(1);
    if (this._speed.textContent !== speedText) this._speed.textContent = speedText;
    if (this._motion.textContent !== label) {
      this._motion.textContent = label;
      this._companion.textContent = label;
    }
    if (this.settings.values.showFps)
      this.fps.textContent = Number.isFinite(fps) && fps > 0 ? `${Math.round(fps)} FPS` : '— FPS';
  }

  /** Replace the menu with a readable, non-HTML error and recovery action. */
  showError(message) {
    if (this._isPlaying) this._pause();
    this._isPlaying = false;
    this.root.querySelector('#error-message').textContent = String(message);
    this._show('error');
  }

  /** Remove the interface and every listener/subscription it owns. */
  dispose() {
    clearTimeout(this._noticeTimer);
    this._unsubscribe();
    for (const remove of this._listeners) remove();
    this._listeners.length = 0;
    this.root.remove();
  }
}
