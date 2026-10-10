/** Stable quality tiers; pixel budgets include device-pixel-ratio scaling. */
export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({
    maxPixelRatio: 1,
    pixelBudget: 1000000,
    shadowSize: 1024,
    ao: false,
    aoScale: 0.5,
    aoSamples: 8,
    bloom: false,
  }),
  medium: Object.freeze({
    maxPixelRatio: 1.35,
    pixelBudget: 2100000,
    shadowSize: 2048,
    ao: true,
    aoScale: 0.5,
    aoSamples: 12,
    bloom: true,
  }),
  high: Object.freeze({
    maxPixelRatio: 1.75,
    pixelBudget: 2800000,
    shadowSize: 2048,
    ao: true,
    aoScale: 0.65,
    aoSamples: 16,
    bloom: true,
  }),
  ultra: Object.freeze({
    maxPixelRatio: 2,
    pixelBudget: 4200000,
    shadowSize: 4096,
    ao: true,
    aoScale: 0.8,
    aoSamples: 24,
    bloom: true,
  }),
});

/** Selects a conservative tier once from available device capabilities, without frame-time oscillation. */
export function detectQuality(renderer) {
  const nav = globalThis.navigator ?? {};
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 4;
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(nav.userAgent ?? '') ||
    (nav.maxTouchPoints > 1 && /Macintosh/.test(nav.userAgent ?? ''));
  const gl = renderer.getContext();
  const debug = /Firefox\//.test(nav.userAgent ?? '')
    ? null
    : gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)).toLowerCase() : '';
  if (mobile || /swiftshader|llvmpipe|software/.test(gpu) || memory <= 2 || cores <= 2)
    return 'low';
  if (!debug || memory <= 4 || /intel|iris|uhd|mali|adreno/.test(gpu)) return 'medium';
  return 'high';
}

/** Resolves a setting against a previously detected automatic tier. */
export function resolveQuality(value, automatic = 'medium') {
  return Object.hasOwn(QUALITY_PRESETS, value) ? value : automatic;
}

/** Caps total drawing-buffer pixels as well as DPR, including large desktop displays. */
export function effectivePixelRatio(width, height, deviceRatio, preset) {
  return Math.max(
    0.35,
    Math.min(
      deviceRatio || 1,
      preset.maxPixelRatio,
      Math.sqrt(preset.pixelBudget / Math.max(1, width * height)),
    ),
  );
}
