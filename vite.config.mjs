import { defineConfig } from 'vite';

// Only builds the demo page. The package itself ships as ES source and is
// bundled by whatever consumes it, so there is no library build step here.
export default defineConfig({
  root: 'demo',
  build: { outDir: '../dist', emptyOutDir: true },
  // The engine runs in a module worker that imports games lazily, so the
  // worker bundle has to stay ES format; the classic-script default cannot
  // contain a dynamic import.
  worker: { format: 'es' },
  test: {
    root: '.',
    environment: 'happy-dom',
    include: ['test/**/*.test.js'],
  },
});
