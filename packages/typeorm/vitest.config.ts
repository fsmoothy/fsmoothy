/// <reference types="vitest" />
import swc from 'unplugin-swc';
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    watch: false,
    reporters: ['default'],
    coverage: {
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      include: ['src/**/*.ts'],
      reportsDirectory: './coverage',
      reporter: ['clover', 'html', 'lcov'],
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
