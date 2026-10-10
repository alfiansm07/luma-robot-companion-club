import { defineConfig } from 'vite';
import { rapierWasm } from './build/rapierWasm.js';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [rapierWasm()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'physics', test: '@dimforge/rapier' },
            { name: 'three', test: 'node_modules/three' },
          ],
        },
      },
    },
  },
  test: { include: ['src/**/*.test.js'], environment: 'node' },
});
