import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { fixedClock, tempDir } from '../testing/index.js';
import { readNote } from '../vault/notes.js';
import { landOutput } from './landing.js';

test('a landing repairs its log after an interrupted write, then retries cannot replace a newer summary', async () => {
  const vault = join(tempDir(), 'vault');
  mkdirSync(vault);
  const deps = { vault, clock: fixedClock('2026-09-24T12:00:00Z'), sleep: async () => {} };
  const first = { run: 'first123', about: 'abcdefgh', project: 'lantern-cove' };
  // No log.md: the note is written before appending fails.
  await expect(
    landOutput(deps, 'session-summary', first, 'First summary', 'receipts/first.md'),
  ).rejects.toThrow('log.md not found');
  const path = 'wiki/sessions/abcdefgh.md';
  const written = readFileSync(join(vault, path), 'utf8');
  writeFileSync(join(vault, 'log.md'), '');
  await landOutput(
    deps,
    'session-summary',
    first,
    'Different output on retry',
    'receipts/first.md',
  );
  expect(readFileSync(join(vault, path), 'utf8')).toBe(written);
  await landOutput(
    deps,
    'session-summary',
    { ...first, run: 'second12' },
    'Second summary',
    'receipts/second.md',
  );
  await landOutput(deps, 'session-summary', first, 'Old retry', 'receipts/first.md');
  expect(readNote(vault, path).body).toBe('Second summary\n');
  expect(readFileSync(join(vault, 'log.md'), 'utf8').trim().split('\n')).toHaveLength(2);
});
