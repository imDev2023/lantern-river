import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Three.js core is one 560 KB module (138 KB gzipped) that cannot be split further;
    // it gets its own long-cached chunk below. Anything else that large should warn.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Three.js changes rarely, so it gets its own long-cached chunk.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
