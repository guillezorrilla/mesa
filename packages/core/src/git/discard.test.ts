import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  gitRepo,
  mergeConflict,
  projectProfile,
  scriptedRunner,
  testGit,
  withRealGit,
} from '../testing/index.js';

function setUp() {
  const run = withRealGit(scriptedRunner().run);
  const { mesa, dir } = projectProfile(run, { mesaYaml: 'name: lantern-cove\n' });
  writeFileSync(join(dir, 'tide.md'), 'High at six\n');
  writeFileSync(join(dir, 'harbour.md'), 'Moorings\n');
  gitRepo(dir);
  const changes = async () =>
    (await mesa.git.status('lantern-cove')).changes.map((change) => change.path);
  return { mesa, dir, changes, read: (file: string) => readFileSync(join(dir, file), 'utf8') };
}

test('a tracked file returns to HEAD in both index and work tree, a staged one too', async () => {
  const { mesa, dir, changes, read } = setUp();
  writeFileSync(join(dir, 'tide.md'), 'High at seven\n');
  writeFileSync(join(dir, 'harbour.md'), 'Empty\n');
  testGit(dir, 'add', 'harbour.md');
  writeFileSync(join(dir, 'harbour.md'), 'Empty again\n');
  const done = await mesa.git.discard('lantern-cove', {
    paths: ['tide.md', 'harbour.md'],
    yes: true,
  });
  expect(done.result.discarded).toEqual([
    { path: 'tide.md', untracked: false },
    { path: 'harbour.md', untracked: false },
  ]);
  expect(await changes()).toEqual([]);
  expect(read('tide.md')).toBe('High at six\n');
  expect(read('harbour.md')).toBe('Moorings\n');
});

test('an untracked file is deleted and a staged new file leaves the index and the disk', async () => {
  const { mesa, dir, changes } = setUp();
  writeFileSync(join(dir, 'gull.md'), 'Untracked\n');
  writeFileSync(join(dir, 'buoy.md'), 'Staged new\n');
  testGit(dir, 'add', 'buoy.md');
  testGit(dir, 'mv', 'harbour.md', 'port.md');
  const done = await mesa.git.discard('lantern-cove', { paths: [], all: true, yes: true });
  expect(done.result.discarded).toEqual(
    expect.arrayContaining([
      { path: 'gull.md', untracked: true },
      { path: 'buoy.md', untracked: false },
      { path: 'port.md', oldPath: 'harbour.md', untracked: false },
    ]),
  );
  expect(await changes()).toEqual([]);
  expect(existsSync(join(dir, 'gull.md'))).toBe(false);
  expect(existsSync(join(dir, 'buoy.md'))).toBe(false);
  expect(existsSync(join(dir, 'harbour.md'))).toBe(true);
});

test('without yes it names what would go, untracked ones as deleted, and changes nothing', async () => {
  const { mesa, dir, changes, read } = setUp();
  writeFileSync(join(dir, 'tide.md'), 'High at seven\n');
  writeFileSync(join(dir, 'gull.md'), 'Untracked\n');
  const refused = mesa.git.discard('lantern-cove', { paths: [], all: true });
  await expect(refused).rejects.toMatchObject({ code: 'usage' });
  await expect(refused).rejects.toThrow(/tide\.md.*untracked files are deleted: gull\.md.*--yes/);
  expect((await changes()).sort()).toEqual(['gull.md', 'tide.md']);
  expect(read('tide.md')).toBe('High at seven\n');
});

test('a conflicted file is refused toward Resolve with AI, and nothing else is discarded', async () => {
  const { mesa, dir, read } = setUp();
  mergeConflict(dir);
  writeFileSync(join(dir, 'harbour.md'), 'Empty\n');
  const refused = mesa.git.discard('lantern-cove', { paths: [], all: true, yes: true });
  await expect(refused).rejects.toThrow(/tide\.ts is conflicted.*Resolve with AI/);
  expect(read('harbour.md')).toBe('Empty\n');
});

test('a path with no change, a path outside the checkout, or paths with --all are refused', async () => {
  const { mesa, dir, read } = setUp();
  writeFileSync(join(dir, 'tide.md'), 'High at seven\n');
  const discard = (paths: string[], all?: boolean) =>
    mesa.git.discard('lantern-cove', { paths, all, yes: true });
  await expect(discard(['tide.md', 'harbour.md'])).rejects.toThrow(/harbour\.md has no changes/);
  await expect(discard(['../tide.md'])).rejects.toMatchObject({ code: 'usage' });
  await expect(discard(['tide.md'], true)).rejects.toThrow(/not both/);
  await expect(discard([])).rejects.toThrow(/not both/);
  expect(read('tide.md')).toBe('High at seven\n');
});

test('a path git refuses (a nested repository) stops the whole discard before anything changes', async () => {
  const { mesa, dir, read } = setUp();
  writeFileSync(join(dir, 'tide.md'), 'High at seven\n');
  mkdirSync(join(dir, 'skiff'));
  testGit(join(dir, 'skiff'), 'init', '-q');
  const refused = mesa.git.discard('lantern-cove', { paths: [], all: true, yes: true });
  await expect(refused).rejects.toMatchObject({ code: 'usage' });
  expect(read('tide.md')).toBe('High at seven\n');
});

test('a path deleted in the index and back as untracked is discarded once, from HEAD', async () => {
  const { mesa, dir, changes, read } = setUp();
  testGit(dir, 'rm', '-q', '--cached', 'tide.md');
  writeFileSync(join(dir, 'tide.md'), 'Rewritten\n');
  const done = await mesa.git.discard('lantern-cove', { paths: [], all: true, yes: true });
  expect(done.result.discarded).toEqual([{ path: 'tide.md', untracked: false }]);
  expect(await changes()).toEqual([]);
  expect(read('tide.md')).toBe('High at six\n');
});
