import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests run before build in `pnpm verify`, so resolve core from source.
  resolve: {
    alias: { '@mesa/core': fileURLToPath(new URL('packages/core/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
});
