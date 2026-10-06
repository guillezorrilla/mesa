import { expect, test } from 'vitest';
import { importSpecifiers } from './import-specifiers.mjs';

test('every import form is read one statement at a time, with whether only types come through', () => {
  const source = [
    "import { tide, type Ebb } from './tide.js';",
    "import type { Flood } from './flood.js';",
    'import {',
    '  shore,',
    '  reef,',
    "} from './coast.js';",
    'export type Depth = string;',
    "export { lantern } from './lantern.js';",
    "export type { Cove } from './cove.js';",
    "export * from './charts.js';",
    "import 'node:fs';",
    'import { createHash } from "crypto";',
    "const chart = await import('./chart.js');",
    "export const harbour = 'north';",
  ].join('\n');
  expect(importSpecifiers(source)).toEqual([
    { specifier: './tide.js', typeOnly: false },
    { specifier: './flood.js', typeOnly: true },
    { specifier: './coast.js', typeOnly: false },
    { specifier: './lantern.js', typeOnly: false },
    { specifier: './cove.js', typeOnly: true },
    { specifier: './charts.js', typeOnly: false },
    { specifier: 'node:fs', typeOnly: false },
    { specifier: 'crypto', typeOnly: false },
    { specifier: './chart.js', typeOnly: false },
  ]);
});
