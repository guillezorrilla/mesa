import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

test("a session's own summary lands like a run's: the same text adds nothing, a changed one lands again", async () => {
  const deps = landingDeps();
  const run = {
    run: 'first123',
    about: 'abcdefgh',
    project: 'lantern-cove',
    endedAt: '2026-09-24T12:00:00.000Z',
  };
  const path = 'wiki/sessions/abcdefgh.md';
  await landOutput(deps, 'session-summary', run, 'Summary');
  const own = { about: 'abcdefgh', project: 'lantern-cove', actor: 'abcdefgh' };
  expect(await landOutput(deps, 'session-summary', own, 'Summary\n')).toEqual({
    path,
    changed: false,
    receipt: null,
  });
  const saved = await landOutput(deps, 'session-summary', own, 'Summary, revised');
  expect(saved).toMatchObject({ path, changed: true, receipt: { id: expect.any(String) } });
  expect(readNote(deps.vault, path)).toMatchObject({
    frontmatter: { type: 'session-summary', session: 'abcdefgh', project: 'lantern-cove' },
    body: 'Summary, revised\n',
  });
  expect(readNote(deps.vault, path).frontmatter.run).toBeUndefined();
  const changes = listReceipts(deps.vault).filter((e) => e.receipt.kind === 'vault-change');
  expect(changes.map((e) => [e.receipt.actor, e.receipt.inputs])).toEqual([
    ['abcdefgh', { target: path }],
    ['first123', { skill: 'session-summary', run: 'first123', target: path }],
  ]);
  // The run's retry is still once per run: it leaves the session's newer summary alone.
  await landOutput(deps, 'session-summary', run, 'Summary');
  expect(readNote(deps.vault, path).body).toBe('Summary, revised\n');
});

test("a session's own save never replaces the person's note; a run, which the person asked for, still lands", async () => {
  const deps = landingDeps();
  const path = 'wiki/sessions/abcdefgh.md';
  mkdirSync(join(deps.vault, 'wiki/sessions'), { recursive: true });
  writeFileSync(join(deps.vault, path), '# My notes\n');
  const own = { about: 'abcdefgh', project: 'lantern-cove' };
  await expect(landOutput(deps, 'session-summary', own, 'Summary')).rejects.toMatchObject({
    code: 'locked',
    details: { reason: 'not-mesa' },
  });
  expect(readFileSync(join(deps.vault, path), 'utf8')).toBe('# My notes\n');
  const run = { ...own, run: 'first123', endedAt: '2026-09-24T12:00:00.000Z' };
  expect((await landOutput(deps, 'session-summary', run, 'Summary'))?.changed).toBe(true);
  expect(readNote(deps.vault, path).body).toBe('Summary\n');
});
