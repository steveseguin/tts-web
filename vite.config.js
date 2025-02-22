import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['kokoro-js'],
  },
});