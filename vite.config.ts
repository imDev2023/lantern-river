import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Three.js with its bloom and reflection add-ons is about 600 KB (150 KB gzipped), and
    // its core is one module that cannot be split; it gets its own long-cached chunk below.
    // Anything else that large should warn.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Three.js changes rarely, so it gets its own long-cached chunk.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
