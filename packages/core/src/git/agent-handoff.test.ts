import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createContext } from '../context.js';
import { listReceipts } from '../receipts/store.js';
import type { SessionRow } from '../sessions/board/rows.js';
import type { Sent } from '../sessions/input/send.js';
import {
  gitRepo,
  mergeConflict,
  newSession,
  placedRow,
  projectProfile,
  scriptedRunner,
  testDeps,
  testGit,
  testStore,
  withRealGit,
} from '../testing/index.js';
import { handToAgent, keptBytes } from './agent-handoff.js';
import { fixPreCommit } from './hook-fix.js';
import { resolveConflicts } from './resolve.js';

/** lantern-cove as a git repository, and hand-off deps that record what they send and open. */
function setUp() {
  const run = withRealGit(scriptedRunner().run);
  const { home, dir } = projectProfile(run, { mesaYaml: 'name: lantern-cove\n' });
  gitRepo(dir);
  const store = testStore(home);
  const ctx = createContext('default', testDeps(home, { run }));
  let board: SessionRow[] = [];
  const typed: { id: string; prompt: string }[] = [];
  const opened: { project: string; goal: string; checkout?: string }[] = [];
  const deps = {
    board: async () => board,
    send: async (id: string, prompt: string) => {
      typed.push({ id, prompt });
      const sent: Sent = { sent: true, session: id, project: 'lantern-cove', from: null, chars: 1 };
      return { result: sent, receipt: null };
    },
    open: async (project: string, opts: { goal: string; checkout?: string }) => {
      opened.push({ project, ...opts });
      return { id: 'zzzzzzzz' };
    },
  };
  const main = { project: 'lantern-cove', path: dir, registered: true };
  const setBoard = (rows: SessionRow[]) => {
    board = rows;
  };
  return { ctx, dir, home, store, deps, main, typed, opened, setBoard };
}
const ask = { prompt: '[mesa] fix it', summary: 'Handed it over' };

test('one idle session in the checkout gets the prompt, with a decision receipt', async () => {
  const { ctx, home, store, deps, main, typed, setBoard } = setUp();
  const idle = store.create(() => newSession());
  setBoard([placedRow(idle, 'idle')]);
  expect(await handToAgent(ctx, deps, main, ask)).toEqual({ session: idle.id, how: 'sent' });
  expect(typed).toEqual([{ id: idle.id, prompt: '[mesa] fix it' }]);
  const [kept] = listReceipts(join(home, 'vault'));
  expect(kept?.receipt).toMatchObject({
    kind: 'decision',
    outputs: { state: 'idle', confidence: 0.95, probabilities: { idle: 0.95 } },
  });
});

test('a busy or waiting session refuses with its state, and several refuse naming them', async () => {
  const { ctx, store, deps, main, typed, opened, setBoard } = setUp();
  const busy = store.create(() => newSession());
  setBoard([placedRow(busy, 'working')]);
  await expect(handToAgent(ctx, deps, main, ask)).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining(`session ${busy.id} is working`),
  });
  setBoard([placedRow(busy, 'idle', 0.95, 'waiting-permission')]);
  await expect(handToAgent(ctx, deps, main, ask)).rejects.toMatchObject({
    message: expect.stringContaining('is waiting-permission'),
  });
  const other = store.create(() => newSession());
  setBoard([placedRow(busy, 'idle'), placedRow(other, 'idle')]);
  await expect(handToAgent(ctx, deps, main, ask)).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining(`(${busy.id}, ${other.id})`),
  });
  expect([typed, opened]).toEqual([[], []]);
});

test('with no session in the checkout, or --new, one starts there with the prompt as its goal', async () => {
  const { ctx, dir, store, deps, main, opened, setBoard } = setUp();
  // A session in a worktree of the project is not in its main checkout.
  const harbour = join(dir, '../harbour');
  const elsewhere = store.create(() =>
    newSession({ worktree: { path: harbour, branch: 'harbour' } }),
  );
  setBoard([placedRow(elsewhere, 'idle')]);
  expect(await handToAgent(ctx, deps, main, ask)).toEqual({ session: 'zzzzzzzz', how: 'started' });
  const worktree = { project: 'lantern-cove', path: harbour, registered: false };
  expect(await handToAgent(ctx, deps, worktree, { ...ask, fresh: true })).toMatchObject({
    how: 'started',
  });
  expect(opened).toEqual([
    { project: 'lantern-cove', goal: '[mesa] fix it' },
    { project: 'lantern-cove', goal: '[mesa] fix it', checkout: harbour },
  ]);
});

test('a failing pre-commit hook hands over the staged files and its output, fenced; a passing one sends nothing', async () => {
  const { ctx, dir, store, deps, typed, setBoard } = setUp();
  const idle = store.create(() => newSession());
  setBoard([placedRow(idle, 'idle')]);
  const hook = join(dir, '.git/hooks/pre-commit');
  mkdirSync(join(dir, '.git/hooks'), { recursive: true });
  writeFileSync(
    hook,
    '#!/bin/sh\necho "lint: tide.ts:3 missing semicolon"\necho "husky - pre-commit failed" >&2\nexit 1\n',
  );
  chmodSync(hook, 0o755);
  writeFileSync(join(dir, 'tide.ts'), 'const high = 6\n');
  testGit(dir, 'add', 'tide.ts');

  expect(await fixPreCommit(ctx, deps, 'lantern-cove')).toEqual({
    passed: false,
    session: idle.id,
    how: 'sent',
  });
  const [sent] = typed;
  expect(sent?.prompt).toMatch(/^\[mesa\] The pre-commit hook failed in /);
  expect(sent?.prompt).toContain('never use --no-verify');
  expect(sent?.prompt).toContain('Staged files:\n```untrusted-hook-output\nA\ttide.ts\n```\n');
  expect(sent?.prompt).toContain(
    '```untrusted-hook-output\nlint: tide.ts:3 missing semicolon\nhusky - pre-commit failed\n```',
  );

  writeFileSync(hook, '#!/bin/sh\nexit 0\n');
  expect(await fixPreCommit(ctx, deps, 'lantern-cove')).toEqual({ passed: true });
  expect(typed).toHaveLength(1);
});

test('a long hook output keeps its last whole lines within the cap, after a line saying what was cut', () => {
  const lastBytes = (text: string, max: number) => keptBytes(text, max, 'end');
  expect(lastBytes('a\nb\nc', 100)).toBe('a\nb\nc');
  expect(lastBytes('first line\nsecond\nthird', 13)).toBe(
    '[Mesa left out the first 11 bytes]\nsecond\nthird',
  );
  // A quote takes four bytes once shell-quoted, and a line longer than the cap keeps its end.
  expect(lastBytes("it's\nit's", 8)).toBe("[Mesa left out the first 5 bytes]\nit's");
  expect(lastBytes('x'.repeat(40), 20)).toBe('[Mesa left out the first 35 bytes]\nxxxxx');
  // Conflict hunks keep their start instead.
  expect(keptBytes('first\nsecond\nthird line', 13, 'start')).toBe(
    'first\nsecond\n[Mesa left out the last 11 bytes]',
  );
  expect(keptBytes('y'.repeat(40), 20, 'start')).toBe('yyyyy\n[Mesa left out the last 35 bytes]');
});

test('every hunk of a long conflict reaches the conflicts file, and the goal names it with an excerpt', async () => {
  const { ctx, dir, deps, opened, setBoard } = setUp();
  setBoard([]);
  mergeConflict(dir, 1000);
  const { conflictsFile } = await resolveConflicts(ctx, deps, 'lantern-cove');
  const file = readFileSync(conflictsFile, 'utf8');
  expect(file).toMatch(/^# Conflict hunks \(git diff\) of the merge in /);
  expect(file).toContain('```untrusted-conflict\ndiff --cc tide.ts\n');
  expect(file).toContain('export const high999 = 7;');
  expect(Buffer.byteLength(file)).toBeGreaterThan(50_000);
  const goal = opened[0]?.goal ?? '';
  expect(goal).toContain(`bytes in ${conflictsFile}; its start:`);
  expect(goal).not.toContain('high999');
  expect(Buffer.byteLength(goal)).toBeLessThan(12_000);
  // A second resolve replaces it.
  await resolveConflicts(ctx, deps, 'lantern-cove');
  expect(readFileSync(conflictsFile, 'utf8')).toBe(file);
});

test('a merge conflict hands over its operation, paths and hunks, fenced, and asks to test before continuing', async () => {
  const { ctx, dir, store, deps, typed, setBoard } = setUp();
  const idle = store.create(() => newSession());
  setBoard([placedRow(idle, 'idle')]);
  await expect(resolveConflicts(ctx, deps, 'lantern-cove')).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining('no file is conflicted'),
  });
  mergeConflict(dir);

  expect(await resolveConflicts(ctx, deps, 'lantern-cove')).toEqual({
    session: idle.id,
    how: 'sent',
    conflictsFile: join(dir, '.git', 'mesa-conflicts.md'),
  });
  const prompt = typed[0]?.prompt ?? '';
  expect(prompt).toMatch(/^\[mesa\] A merge in .* stopped on conflicts in 1 file\. /);
  expect(prompt).toContain("git add each file. Then run the project's tests");
  expect(prompt).toContain('continue with git commit --no-edit');
  expect(prompt).toContain('Conflicted files:\n```untrusted-conflict\ntide.ts\n```');
  expect(prompt).toContain('```untrusted-conflict\ndiff --cc tide.ts\n');
  expect(prompt).toContain(
    '--- a/tide.ts\n+++ b/tide.ts\n@@@ -1,1 -1,1 +1,5 @@@\n++<<<<<<< HEAD\n +export const high = 5;\n++=======\n+ export const high = 7;\n++>>>>>>> swell\n```',
  );
});
