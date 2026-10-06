import { afterAll } from 'vitest';
import { gitConfigOff } from './packages/core/src/testing/env.js';
import { isolateTmp } from './packages/core/src/testing/tmp.js';

// Not `@mesa/core/testing`: its fixtures load through `import.meta.url`, which happy-dom files break.
isolateTmp({ afterAll, env: process.env });
// The git a test runs itself sees only its temp repositories: no GIT_DIR a git hook exported, no
// user or system config. Mesa's own git runs in testEnv through withRealGit.
for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) delete process.env[name];
Object.assign(process.env, gitConfigOff);
