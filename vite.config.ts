import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      // The game, plus the Streetmon model turntable (preview.html).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        preview: fileURLToPath(new URL('./preview.html', import.meta.url)),
      },
    },
  },
  optimizeDeps: {
    // Rapier's compat build inlines its WASM; pre-bundling it is unnecessary and slow.
    exclude: ['@dimforge/rapier3d-compat'],
  },
});
