import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  './vitest.config.ts',
  './packages/core/vitest.config.ts',
  './packages/typeorm/vitest.config.ts',
  './tools/package-template/vitest.config.ts',
]);
