import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs/promises';

const addLicenses = () => ({
  name: 'add-licenses',
  async generateBundle(options, bundle) {
    try {
      const kokoroLicense = await fs.readFile(path.resolve(__dirname, 'node_modules/kokoro-js/LICENSE'), 'utf-8');
      
      for (const fileName in bundle) {
        const file = bundle[fileName];
        if (file.type === 'chunk' || file.type === 'asset') {
          file.code = `/**
 * Bundle of kokoro-js and dependencies
 * 
 * kokoro-js License:
 * ${kokoroLicense.trim()}
 */
${file.code}`;
        }
      }
    } catch (err) {
      console.warn('Could not read license file:', err);
    }
  }
});

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
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
      plugins: [addLicenses()]
    },
    outDir: 'dist/lib',
  },
  optimizeDeps: {
    exclude: ['kokoro-js'],
  },
});