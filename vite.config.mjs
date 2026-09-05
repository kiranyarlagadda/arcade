import { defineConfig } from 'vite';

// Only builds the demo page. The package itself ships as ES source and is
// bundled by whatever consumes it, so there is no library build step here.
export default defineConfig({
  root: 'demo',
  build: { outDir: '../dist', emptyOutDir: true },
  test: {
    root: '.',
    environment: 'happy-dom',
    include: ['test/**/*.test.js'],
  },
});
