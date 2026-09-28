import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const core = (file: string) => fileURLToPath(new URL(`packages/core/src/${file}`, import.meta.url));

export default defineConfig({
  // Tests run before build in `pnpm verify`, so resolve core from source. Most specific first.
  resolve: {
    alias: [
      { find: '@mesa/core/testing', replacement: core('testing/index.ts') },
      { find: '@mesa/core/browser', replacement: core('browser.ts') },
      { find: '@mesa/core', replacement: core('index.ts') },
      // The app's `@/` imports (shadcn/ui's components), its src.
      { find: /^@\//, replacement: fileURLToPath(new URL('apps/desktop/src/', import.meta.url)) },
    ],
  },
  test: {
    // Local-time frontmatter (Obsidian's Date & Time) is golden-tested, so every machine runs in UTC.
    env: { TZ: 'UTC' },
    // CLI and worktree tests spawn many git processes; five seconds flakes under desktop load.
    testTimeout: 15000,
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/desktop/src/**/*.test.ts',
      'apps/desktop/src/**/*.test.tsx',
    ],
  },
});
