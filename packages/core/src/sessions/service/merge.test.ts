import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listReceipts } from '../../receipts/store.js';
import {
  gitRepo,
  newSession,
  projectProfile,
  scriptedRunner,
  testGit,
  testStore,
  withRealGit,
} from '../../testing/index.js';

const idle = {
  state: 'idle',
  confidence: 1,
  at: '2026-09-24T12:00:00.000Z',
  source: 'hook',
} as const;

/**
 * lantern-cove as a real repository, a lead session in its checkout, and a worker in its own
 * worktree on `session/tides` that adds `tides.json`; `mesa merge` as the CLI calls it.
 */
function family() {
  const { run } = scriptedRunner();
  const { home, dir, mesa } = projectProfile(withRealGit(run));
  writeFileSync(join(dir, 'README.md'), 'Lantern Cove\n');
  gitRepo(dir);
  testGit(dir, 'config', 'user.name', 't');
  testGit(dir, 'config', 'user.email', 't@example.com');
  const tree = join(home, 'worker-tides');
  testGit(dir, 'worktree', 'add', '-q', '-b', 'session/tides', tree);
  const store = testStore(home);
  const lead = store.create(() => newSession({ lastState: idle }));
  const worker = store.create(() =>
    newSession({
      parent: lead.id,
      worktree: { path: tree, branch: 'session/tides' },
      lastState: idle,
    }),
  );
  const commit = (cwd: string, file: string, text: string) => {
    writeFileSync(join(cwd, file), text);
    testGit(cwd, 'add', file);
    testGit(cwd, 'commit', '-q', '-m', `Write ${file}`);
  };
  return { home, dir, tree, store, lead, worker, mesa, commit };
}

const clean = (cwd: string) => testGit(cwd, 'status', '--porcelain');

test("a worker's branch merges into its parent's checkout with a merge commit and a receipt", async () => {
  const { home, dir, tree, lead, worker, mesa, commit } = family();
  commit(tree, 'tides.json', '{"high": 6}\n');

  const done = await mesa.sessions.merge(worker.id);

  expect(done.result).toMatchObject({
    merged: true,
    child: worker.id,
    into: lead.id,
    branch: 'session/tides',
  });
  expect(readFileSync(join(dir, 'tides.json'), 'utf8')).toBe('{"high": 6}\n');
  // --no-ff: a merge commit with two parents, even where a fast-forward would do.
  expect(testGit(dir, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3);
  expect(done.receipt).not.toBeNull();
  const [entry] = listReceipts(join(home, 'vault'), 10, { kind: 'merge' });
  expect(entry?.receipt).toMatchObject({
    kind: 'merge',
    session: worker.id,
    outputs: { into: lead.id, branch: 'session/tides', merged: true },
  });
});

test('a conflict is aborted and named, leaving both checkouts as they were', async () => {
  const { dir, tree, worker, mesa, commit } = family();
  commit(tree, 'README.md', 'Lantern Cove, the north shore\n');
  commit(dir, 'README.md', 'Lantern Cove, the south shore\n');
  const before = testGit(dir, 'rev-parse', 'HEAD');

  const stopped = await mesa.sessions.merge(worker.id);

  expect(stopped.result).toMatchObject({ merged: false, conflicts: ['README.md'] });
  expect(testGit(dir, 'rev-parse', 'HEAD')).toBe(before);
  expect(clean(dir)).toBe('');
  expect(clean(tree)).toBe('');
  expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('Lantern Cove, the south shore\n');
});

test('uncommitted changes in either checkout, or a working child, refuse and change nothing', async () => {
  const { dir, tree, store, worker, mesa, commit } = family();
  commit(tree, 'tides.json', '{"high": 6}\n');
  const head = testGit(dir, 'rev-parse', 'HEAD');

  writeFileSync(join(tree, 'tides.json'), '{"high": 7}\n');
  await expect(mesa.sessions.merge(worker.id)).rejects.toThrow(
    "the worker's checkout has uncommitted changes",
  );
  testGit(tree, 'checkout', '--', 'tides.json');

  writeFileSync(join(dir, 'README.md'), 'Lantern Cove, edited\n');
  await expect(mesa.sessions.merge(worker.id)).rejects.toThrow(
    'the checkout it merges into has uncommitted changes',
  );
  testGit(dir, 'checkout', '--', 'README.md');

  store.update(worker.id, { lastState: { ...idle, state: 'working' } });
  await expect(mesa.sessions.merge(worker.id)).rejects.toThrow(
    `session ${worker.id} is still working; merge it once its turn ends`,
  );
  expect(testGit(dir, 'rev-parse', 'HEAD')).toBe(head);
});

test('--into merges into another session; one with no parent and no --into is refused', async () => {
  const { home, dir, store, lead, worker, mesa, commit } = family();
  const tree = join(home, 'reviewer');
  testGit(dir, 'worktree', 'add', '-q', '-b', 'session/review', tree);
  const reviewer = store.create(() =>
    newSession({ worktree: { path: tree, branch: 'session/review' }, lastState: idle }),
  );
  commit(join(home, 'worker-tides'), 'tides.json', '{"high": 6}\n');

  const done = await mesa.sessions.merge(worker.id, reviewer.id);
  expect(done.result).toMatchObject({ merged: true, into: reviewer.id });
  expect(readFileSync(join(tree, 'tides.json'), 'utf8')).toBe('{"high": 6}\n');
  await expect(mesa.sessions.merge(lead.id)).rejects.toThrow(
    `session ${lead.id} has no parent to merge into; name one with --into`,
  );
});
