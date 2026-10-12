import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// UI build: a small React app inside a sandboxed iframe. `base: './'` keeps URLs
// relative so the host can serve it from /plugins/<id>/ui/.
export default defineConfig({
  root: fileURLToPath(new URL('./src/ui', import.meta.url)),
  base: './',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/ui', import.meta.url)),
    emptyOutDir: true,
  },
});
