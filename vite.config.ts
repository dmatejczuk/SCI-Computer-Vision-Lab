import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { isOpenCvFile, patchOpenCv } from './scripts/opencv-patch';

// OpenCV.js must not use new Function() under the page CSP; see scripts/opencv-patch.ts.
const openCvCsp: Plugin = {
  name: 'opencv-csp-patch',
  enforce: 'pre',
  transform(code, id) {
    return isOpenCvFile(id) ? { code: patchOpenCv(code), map: null } : undefined;
  },
};

// `vite preview` sends the same Content-Security-Policy as Caddy, so production-like tests
// catch CSP problems (for example the 'wasm-unsafe-eval' needed by OpenCV.js).
const caddy = readFileSync(new URL('./Caddyfile.common', import.meta.url), 'utf8');
const csp = /Content-Security-Policy "([^"]+)"/
  .exec(caddy)?.[1]
  .replace(/\{\$SIGNALING_ORIGIN:[^}]*\}/, 'ws://localhost:*');

export default defineConfig({
  plugins: [openCvCsp, react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:3001', '/ws': { target: 'ws://127.0.0.1:3001', ws: true } },
  },
  preview: { headers: csp ? { 'Content-Security-Policy': csp } : {} },
  // Use Phaser's official pre-minified distribution to avoid reprocessing its large UMD bundle.
  resolve: { alias: [{ find: /^phaser$/, replacement: 'phaser/dist/phaser.min.js' }] },
  // The plate worker's dependencies are pre-bundled up front so the dev server does not reload.
  optimizeDeps: {
    include: ['@techstark/opencv-js', 'opentype.js', '@xyflow/react'],
    esbuildOptions: {
      plugins: [
        {
          name: 'opencv-csp-patch',
          setup(build) {
            build.onLoad({ filter: /opencv-js[\\/]dist[\\/]opencv\.js$/ }, async (args) => ({
              contents: patchOpenCv(await readFile(args.path, 'utf8')),
              loader: 'js',
            }));
          },
        },
      ],
    },
  },
  worker: {
    format: 'es',
    plugins: () => [openCvCsp],
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('@techstark/opencv-js') ? 'opencv' : undefined),
      },
    },
  },
  build: {
    // OpenCV.js (~11 MB with embedded WebAssembly) is a separate, lazily loaded worker chunk.
    chunkSizeWarningLimit: 12000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // tfApi is loaded lazily; kept with TFJS so it is never merged into an eager chunk.
          if (
            /[\\/]node_modules[\\/]@tensorflow[\\/]/.test(id) ||
            /[\\/]features[\\/]training[\\/]tfApi\.ts$/.test(id)
          )
            return 'tensorflow';
          if (/[\\/]node_modules[\\/]phaser[\\/]/.test(id)) return 'phaser';
          // Shared CommonJS interop helpers get their own tiny chunk, so the lazily loaded
          // plate module never has to import the TFJS chunk just for them.
          if (id.includes('commonjsHelpers')) return 'commonjs-helpers';
          return undefined;
        },
      },
    },
  },
});
