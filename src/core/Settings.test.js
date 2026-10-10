import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings, Settings } from './Settings.js';

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key, next) => {
      value = next;
    }),
  };
}

function persisted(values, helpSeen = false) {
  return JSON.stringify({ version: 1, values, helpSeen });
}

describe('normalizeSettings', () => {
  it.each([null, undefined, false, 4, 'high', [], ['high']])(
    'uses independent defaults for invalid settings: %s',
    (value) => {
      const result = normalizeSettings(value);
      expect(result).toEqual(DEFAULT_SETTINGS);
      expect(result).not.toBe(DEFAULT_SETTINGS);
    },
  );

  it('accepts every supported field without preserving unrelated properties', () => {
    expect(
      normalizeSettings({
        quality: 'ultra',
        shadows: false,
        postProcessing: false,
        sensitivity: 1.25,
        invertY: true,
        fov: 75,
        master: 0.5,
        music: 0.1,
        sfx: 0,
        showFps: true,
        obsolete: 'discard this',
      }),
    ).toEqual({
      quality: 'ultra',
      shadows: false,
      postProcessing: false,
      sensitivity: 1.25,
      invertY: true,
      fov: 75,
      master: 0.5,
      music: 0.1,
      sfx: 0,
      showFps: true,
    });
  });

  it.each(['auto', 'low', 'medium', 'high', 'ultra'])('accepts quality %s', (quality) => {
    expect(normalizeSettings({ quality }).quality).toBe(quality);
  });

  it('rejects coercion, invalid booleans, non-finite numbers and unknown quality', () => {
    expect(
      normalizeSettings({
        quality: 'maximum',
        shadows: 'false',
        postProcessing: 1,
        sensitivity: NaN,
        invertY: null,
        fov: Infinity,
        master: '0.7',
        music: false,
        sfx: -Infinity,
        showFps: 1,
      }),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps all bounded numeric fields to their supported range', () => {
    expect(
      normalizeSettings({ sensitivity: -10, fov: 200, master: -1, music: 2, sfx: -9 }),
    ).toMatchObject({
      sensitivity: 0.2,
      fov: 85,
      master: 0,
      music: 1,
      sfx: 0,
    });
    expect(normalizeSettings({ sensitivity: 30, fov: -1 })).toMatchObject({
      sensitivity: 2,
      fov: 45,
    });
  });

  it('ignores inherited fields and prototype keys', () => {
    const inherited = Object.create({ quality: 'ultra', master: 0 });
    inherited.music = 0.8;
    expect(normalizeSettings(inherited)).toEqual({ ...DEFAULT_SETTINGS, music: 0.8 });
    expect(normalizeSettings(JSON.parse('{"__proto__":{"polluted":true}}'))).toEqual(
      DEFAULT_SETTINGS,
    );
    expect({}.polluted).toBeUndefined();
  });

  it('does not mutate the source or frozen defaults', () => {
    const source = Object.freeze({ fov: 100 });
    const result = normalizeSettings(source);
    result.master = 0;
    expect(source.fov).toBe(100);
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });
});

describe('Settings persistence', () => {
  it('loads versioned data through validation', () => {
    const storage = memoryStorage(
      persisted({ quality: 'low', master: 20, showFps: 'false' }, true),
    );
    const settings = new Settings(storage);
    expect(settings.values).toEqual({ ...DEFAULT_SETTINGS, quality: 'low', master: 1 });
    expect(settings.helpSeen).toBe(true);
  });

  it.each(['not json', 'null', '[]', '42', '{}', '{"version":2,"values":{"quality":"ultra"}}'])(
    'recovers from unusable persisted data: %s',
    (data) => {
      const settings = new Settings(memoryStorage(data));
      expect(settings.values).toEqual(DEFAULT_SETTINGS);
      expect(settings.helpSeen).toBe(false);
    },
  );

  it('persists validated changes and reloads all state', () => {
    const storage = memoryStorage();
    const settings = new Settings(storage);
    settings.set('quality', 'medium');
    settings.set('sensitivity', 100);
    settings.set('music', 0);
    settings.markHelpSeen();
    const reloaded = new Settings(storage);
    expect(reloaded.values).toEqual(settings.values);
    expect(reloaded.helpSeen).toBe(true);
  });

  it('does not confuse a truthy invalid help flag with acknowledgement', () => {
    expect(new Settings(memoryStorage(persisted({}, 'true'))).helpSeen).toBe(false);
    expect(new Settings(memoryStorage(persisted({}, 1))).helpSeen).toBe(false);
  });

  it('marks help once without emitting gameplay-setting changes', () => {
    const storage = memoryStorage();
    const settings = new Settings(storage);
    const listener = vi.fn();
    settings.subscribe(listener);
    settings.markHelpSeen();
    settings.markHelpSeen();
    expect(settings.helpSeen).toBe(true);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('rejects invalid changes and skips redundant writes', () => {
    const storage = memoryStorage();
    const settings = new Settings(storage);
    expect(settings.set('unknown', 1)).toBe(false);
    expect(settings.set('__proto__', {})).toBe(false);
    expect(settings.set('quality', 'highest')).toBe(false);
    expect(settings.set('shadows', 'false')).toBe(false);
    expect(settings.set('master', NaN)).toBe(false);
    expect(settings.set('fov', Infinity)).toBe(false);
    expect(settings.set('sensitivity', '1.5')).toBe(false);
    expect(settings.set('quality', 'auto')).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('publishes immutable snapshots and supports unsubscribe', () => {
    const settings = new Settings(null);
    const initial = settings.values;
    const listener = vi.fn();
    const unsubscribe = settings.subscribe(listener);
    expect(settings.set('fov', 70)).toBe(true);
    expect(listener).toHaveBeenCalledWith(settings.values, 'fov');
    expect(settings.values).not.toBe(initial);
    expect(initial.fov).toBe(DEFAULT_SETTINGS.fov);
    expect(Object.isFrozen(settings.values)).toBe(true);
    unsubscribe();
    settings.set('fov', 75);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-function subscriber', () => {
    expect(() => new Settings(null).subscribe(null)).toThrow(TypeError);
  });

  it('supports explicitly unavailable storage', () => {
    const settings = new Settings(null);
    expect(() => {
      settings.set('sfx', 0.3);
      settings.markHelpSeen();
    }).not.toThrow();
    expect(settings.values.sfx).toBe(0.3);
    expect(settings.helpSeen).toBe(true);
  });

  it('survives unavailable localStorage property access', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Storage blocked by browser privacy policy');
      },
    });
    try {
      const settings = new Settings();
      expect(() => settings.set('master', 0.2)).not.toThrow();
      expect(settings.values.master).toBe(0.2);
      expect(settings.values.quality).toBe('auto');
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('survives read security errors and continues accepting updates', () => {
    const storage = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem: vi.fn(),
    };
    const settings = new Settings(storage);
    expect(settings.values).toEqual(DEFAULT_SETTINGS);
    settings.set('invertY', true);
    expect(settings.values.invertY).toBe(true);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('survives write/quota failures without discarding changes or subscriptions', () => {
    const storage = {
      getItem: () => persisted({ quality: 'high' }),
      setItem() {
        throw new Error('QuotaExceededError');
      },
    };
    const settings = new Settings(storage);
    const listener = vi.fn();
    settings.subscribe(listener);
    expect(() => {
      settings.set('master', 0);
      settings.markHelpSeen();
    }).not.toThrow();
    expect(settings.values).toMatchObject({ quality: 'high', master: 0 });
    expect(settings.helpSeen).toBe(true);
    expect(listener).toHaveBeenCalledWith(settings.values, 'master');
  });
});
