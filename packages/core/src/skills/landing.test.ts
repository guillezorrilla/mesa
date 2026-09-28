import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { actionRecorder } from '../receipts/recorder.js';
import { listReceipts } from '../receipts/store.js';
import { fixedClock, sequentialIds, tempDir } from '../testing/index.js';
import { readNote } from '../vault/notes.js';
import { initVault } from '../vault/vault.js';
import { landOutput } from './landing.js';

const landingDeps = () => {
  const vault = join(tempDir(), 'vault');
  const clock = fixedClock('2026-09-24T12:00:00Z');
  initVault({ path: vault, clock });
  return {
    vault,
    clock,
    sleep: async () => {},
    record: actionRecorder({
      profile: 'test',
      vault: () => vault,
      clock,
      newId: sequentialIds(),
      command: () => 'mesa run session-summary',
      redact: (text) => text,
    }),
  };
};

test('a landing repairs its log after an interrupted write, then retries cannot replace a newer summary', async () => {
  const deps = landingDeps();
  const { vault } = deps;
  const first = {
    run: 'first123',
    about: 'abcdefgh',
    project: 'lantern-cove',
    endedAt: '2026-09-24T12:00:00.000Z',
  };
  await landOutput(deps, 'session-summary', first, 'First summary');
  const path = 'wiki/sessions/abcdefgh.md';
  const written = readFileSync(join(vault, path), 'utf8');
  await landOutput(deps, 'session-summary', first, 'Different output on retry');
  expect(readFileSync(join(vault, path), 'utf8')).toBe(written);
  expect(readFileSync(join(vault, 'log.md'), 'utf8').match(/Summarised session/g)).toHaveLength(1);
  await landOutput(deps, 'session-summary', { ...first, run: 'second12' }, 'Second summary');
  await landOutput(deps, 'session-summary', first, 'Old retry');
  expect(readNote(vault, path).body).toBe('Second summary\n');
  expect(listReceipts(vault).filter((entry) => entry.receipt.kind === 'vault-change')).toHaveLength(
    2,
  );
});

test('repairing an interrupted older landing preserves a newer summary', async () => {
  const deps = landingDeps();
  const { vault } = deps;
  const first = {
    run: 'first123',
    about: 'abcdefgh',
    project: 'lantern-cove',
    endedAt: '2026-09-24T12:00:00.000Z',
  };
  await landOutput(deps, 'session-summary', first, 'First');
  await landOutput(
    deps,
    'session-summary',
    { ...first, run: 'second12', endedAt: '2026-09-24T12:00:00.001Z' },
    'Second',
  );
  await landOutput(deps, 'session-summary', first, 'Old retry');
  expect(readNote(vault, 'wiki/sessions/abcdefgh.md').body).toBe('Second\n');
  expect(listReceipts(vault).filter((entry) => entry.receipt.kind === 'vault-change')).toHaveLength(
    2,
  );
});

test('the same summary from a later run creates no second history entry', async () => {
  const deps = landingDeps();
  const first = {
    run: 'first123',
    about: 'abcdefgh',
    project: 'lantern-cove',
    endedAt: '2026-09-24T12:00:00.000Z',
  };
  await landOutput(deps, 'session-summary', first, 'Unchanged summary');
  await landOutput(deps, 'session-summary', { ...first, run: 'second12' }, 'Unchanged summary');
  expect(readNote(deps.vault, 'wiki/sessions/abcdefgh.md').frontmatter.run).toBe('first123');
  expect(
    listReceipts(deps.vault).filter((entry) => entry.receipt.kind === 'vault-change'),
  ).toHaveLength(1);
});
