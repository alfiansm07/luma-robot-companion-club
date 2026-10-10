import { Buffer } from 'node:buffer';

/**
 * Rapier compat embeds WASM as base64. Extract the exact bytes into a cacheable,
 * hashed WASM asset and use wasm-bindgen's current object initializer. No vendor
 * files are mutated, and an upstream layout change fails loudly rather than
 * shipping an unverified replacement. Also serves the same bytes in development.
 */
export function rapierWasm() {
  let development = false;
  let wasm;
  const endpoint = '/__luma_physics.wasm';
  const initializer =
    /((?:yield|await)\s+[\w$]+\()(\{module_or_path:)?([\w$]+\.toByteArray\("([A-Za-z0-9+/=]+)"\)\.buffer)(\})?\)/g;
  return {
    name: 'luma-rapier-wasm',
    enforce: 'pre',
    config() {
      return { optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] } };
    },
    configResolved(config) {
      development = config.command === 'serve';
    },
    configureServer(server) {
      server.middlewares.use(endpoint, (_request, response) => {
        if (!wasm) {
          response.statusCode = 503;
          response.end('Physics module has not been prepared.');
          return;
        }
        response.setHeader('Content-Type', 'application/wasm');
        response.setHeader('Cache-Control', 'no-cache');
        response.end(wasm);
      });
    },
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/@dimforge/rapier3d-compat/dist/rapier.mjs'))
        return null;
      const matches = [...code.matchAll(initializer)];
      if (matches.length !== 1)
        throw new Error('Rapier 0.21 initializer changed: review WASM extraction.');
      const match = matches[0];
      wasm = Buffer.from(match[4], 'base64');
      const reference = development
        ? JSON.stringify(endpoint)
        : `import.meta.ROLLUP_FILE_URL_${this.emitFile({ type: 'asset', name: 'rapier.wasm', source: wasm })}`;
      const replacement = `${match[1]}{module_or_path:fetch(${reference})})`;
      return {
        code: code.slice(0, match.index) + replacement + code.slice(match.index + match[0].length),
        map: null,
      };
    },
  };
}
