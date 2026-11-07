import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    target: 'firefox140',
    rollupOptions: {
      input: {
        picker: resolve('picker.html'),
        background: resolve('src/background.ts'),
      },
      output: { entryFileNames: '[name].js' },
    },
  },
});
