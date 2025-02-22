import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  build: {
    target: 'esnext', // Target modern browsers
    lib: {
      entry: path.resolve(__dirname, 'bundle.js'),
      name: 'kokoroBundle',
      fileName: (format) => `kokoro-bundle.${format}.js`,
    },
    rollupOptions: {
      external: ['./main.js'],
      output: {
        globals: {
          './main.js': 'main',
        },
      },
    },
    outDir: 'dist/lib',
  },
  optimizeDeps: {
    exclude: ['kokoro-js'],
  },
});