import { commitFile, testGit, testStore } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test("merge brings a worker's branch into its parent's checkout; a conflict aborts and exits 1", async () => {
  const { dir } = await cli.withTwoProjects();
  testGit(dir, 'config', 'user.name', 't');
  testGit(dir, 'config', 'user.email', 't@example.com');
  const parent = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const child = (
    await cli.mesa('worker', 'lantern-cove', 'Chart the tides', '--parent', parent, '--json')
  ).json.data;
  const store = testStore(cli.home);
  const idle = { state: 'idle', confidence: 1, at: child.startedAt, source: 'hook' } as const;
  for (const id of [parent, child.id]) store.update(id, { lastState: idle });

  commitFile(child.worktree.path, 'tides.md', 'north shore\n');
  commitFile(dir, 'tides.md', 'south shore\n');
  const stopped = await cli.mesa('merge', child.id, '--json');
  expect(stopped.code).toBe(1);
  expect(stopped.json.data).toMatchObject({ merged: false, conflicts: ['tides.md'], into: parent });
  expect(testGit(dir, 'status', '--porcelain')).toBe('');

  commitFile(child.worktree.path, 'tides.md', 'south shore\n');
  const merged = await cli.mesa('merge', child.id);
  expect(merged.code).toBe(0);
  expect(merged.stdout).toContain(`merged ${child.worktree.branch} into ${parent}`);
  expect((await cli.mesa('help', '--agent')).stdout).toContain('mesa merge');
});
