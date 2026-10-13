import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Relative base so the build also runs from a sub-path (e.g. a hosted web copy).
// Two pages: the full office (index.html) and the corner farm widget (widget.html).
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), widget: resolve(__dirname, 'widget.html') } } },
});
