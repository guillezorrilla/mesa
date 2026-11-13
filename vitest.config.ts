import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Files that need macOS: Linux's sh does not exec its last command, so tmux reports another pane
// command. CI runs the `macos` project on a Mac and shards `unix` across Linux runners.
const macOnly = ['packages/core/src/sessions/tmux/backend.test.ts'];

const core = (file: string) => fileURLToPath(new URL(`packages/core/src/${file}`, import.meta.url));

export default defineConfig({
  // Tests run before build in `pnpm verify`, so resolve core from source. Most specific first.
  resolve: {
    alias: [
      { find: '@mesa/core/testing', replacement: core('testing/index.ts') },
      { find: '@mesa/core/browser', replacement: core('browser.ts') },
      { find: '@mesa/core/phone', replacement: core('phone/protocol/index.ts') },
      { find: '@mesa/core', replacement: core('index.ts') },
      // The app's `@/` imports (shadcn/ui's components), its src.
      { find: /^@\//, replacement: fileURLToPath(new URL('apps/desktop/src/', import.meta.url)) },
    ],
  },
  test: {
    // Local-time frontmatter (Obsidian's Date & Time) is golden-tested, so every machine runs in UTC.
    env: { TZ: 'UTC' },
    // Tests and vitest leave their temp files in TMPDIR; these remove them when a file and a run end.
    setupFiles: ['vitest.setup.ts'],
    globalSetup: ['vitest.global-setup.ts'],
    // CLI and worktree tests spawn many git processes; five seconds flakes under desktop load.
    testTimeout: 15000,
    // One worker per core starves the git and tmux processes those tests spawn on a many-core Mac
    // (#598); CI's runners have fewer cores, so they keep vitest's default (cores - 1).
    maxWorkers: Math.max(1, Math.min(availableParallelism() - 1, 4)),
    projects: [
      {
        extends: true,
        test: {
          name: 'unix',
          include: [
            'packages/*/src/**/*.test.ts',
            'apps/broker/src/**/*.test.ts',
            'apps/mobile/src/**/*.test.ts',
            'apps/desktop/src/**/*.test.ts',
            'apps/desktop/src/**/*.test.tsx',
            'scripts/**/*.test.ts',
          ],
          exclude: macOnly,
        },
      },
      { extends: true, test: { name: 'macos', include: macOnly } },
    ],
  },
});
