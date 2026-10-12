import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Logic thread build: a single IIFE (no DOM) that the host evaluates inside its
// restricted vm, where the global `spresenter` is injected.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // keep dist/ui from the other build
    lib: {
      entry: fileURLToPath(new URL('./src/code.ts', import.meta.url)),
      formats: ['iife'],
      name: 'PcoTimersPlugin',
      fileName: () => 'code.js',
    },
    target: 'es2020',
    minify: false,
  },
});
