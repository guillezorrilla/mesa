import { afterAll } from 'vitest';
import { isolateTmp } from './packages/core/src/testing/tmp.js';

// Not `@mesa/core/testing`: its fixtures load through `import.meta.url`, which happy-dom files break.
isolateTmp({ afterAll });
