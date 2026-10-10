export const SETTINGS_STORAGE_KEY = 'luma.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  quality: 'auto',
  shadows: true,
  postProcessing: true,
  sensitivity: 1,
  invertY: false,
  fov: 60,
  master: 0.8,
  music: 0.35,
  sfx: 0.75,
  showFps: false,
});

const QUALITY_OPTIONS = new Set(['auto', 'low', 'medium', 'high', 'ultra']);
const RANGES = Object.freeze({
  sensitivity: [0.2, 2],
  fov: [45, 85],
  master: [0, 1],
  music: [0, 1],
  sfx: [0, 1],
});
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function validateValue(key, value) {
  if (key === 'quality') return QUALITY_OPTIONS.has(value) ? value : undefined;
  if (own(RANGES, key)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    const [min, max] = RANGES[key];
    return Math.max(min, Math.min(max, value));
  }
  return typeof value === 'boolean' ? value : undefined;
}

/** Return a complete, independent settings object, discarding invalid and unknown fields. */
export function normalizeSettings(value) {
  const result = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!own(value, key)) continue;
    const normalized = validateValue(key, value[key]);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

/** Local settings with validation and best-effort, versioned browser persistence. */
export class Settings {
  /** Pass null to use memory only; inaccessible browser storage is also safe. */
  constructor(storage) {
    this._storage = null;
    this._values = Object.freeze({ ...DEFAULT_SETTINGS });
    this._helpSeen = false;
    this._listeners = new Set();
    try {
      this._storage = storage === undefined ? globalThis.localStorage : storage;
      if (!this._storage) return;
      const serialized = this._storage.getItem(SETTINGS_STORAGE_KEY);
      if (!serialized) return;
      const saved = JSON.parse(serialized);
      if (!saved || typeof saved !== 'object' || saved.version !== 1) return;
      this._values = Object.freeze(normalizeSettings(saved.values));
      this._helpSeen = saved.helpSeen === true;
    } catch {
      // Privacy restrictions, malformed data and quota errors never prevent play.
    }
  }

  /** An immutable snapshot; later changes create a new snapshot. */
  get values() {
    return this._values;
  }

  /** Whether the first-launch controls have been acknowledged on this device. */
  get helpSeen() {
    return this._helpSeen;
  }

  /** Validate and set one field. Returns true only when its value changed. */
  set(key, value) {
    if (!own(DEFAULT_SETTINGS, key)) return false;
    const normalized = validateValue(key, value);
    if (normalized === undefined || normalized === this._values[key]) return false;
    this._values = Object.freeze({ ...this._values, [key]: normalized });
    this._persist();
    for (const callback of this._listeners) callback(this._values, key);
    return true;
  }

  /** Subscribe to changes; callbacks receive the snapshot and changed key. */
  subscribe(callback) {
    if (typeof callback !== 'function')
      throw new TypeError('Settings subscriber must be a function.');
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /** Persist acknowledgement without changing any gameplay setting. */
  markHelpSeen() {
    if (this._helpSeen) return;
    this._helpSeen = true;
    this._persist();
  }

  _persist() {
    try {
      this._storage?.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          values: this._values,
          helpSeen: this._helpSeen,
        }),
      );
    } catch {
      // Keep the in-memory settings functional when storage cannot be written.
    }
  }
}
