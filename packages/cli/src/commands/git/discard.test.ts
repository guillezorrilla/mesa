import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitRepo, testGit, withRealGit } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('git discard needs --yes, names what it would discard without it, then lists what it discarded', async () => {
  const repo = await cli.withProject();
  writeFileSync(join(repo, 'tide.md'), 'High at six\n');
  writeFileSync(join(repo, 'harbour.md'), 'Moorings\n');
  gitRepo(repo);
  cli.run = withRealGit(cli.run);
  writeFileSync(join(repo, 'tide.md'), 'High at seven\n');
  writeFileSync(join(repo, 'harbour.md'), 'Empty\n');
  testGit(repo, 'add', 'harbour.md');
  writeFileSync(join(repo, 'gull.md'), 'Untracked\n');

  const refused = await cli.mesa('git', 'discard', 'lantern-cove', '--all', '--json');
  expect(refused.code).toBe(2);
  expect(refused.json.error.message).toContain('untracked files are deleted: gull.md');
  expect(refused.json.error.message).toContain('tide.md');
  expect(testGit(repo, 'status', '--porcelain')).toContain('gull.md');
  expect(readFileSync(join(repo, 'tide.md'), 'utf8')).toBe('High at seven\n');

  const one = await cli.mesa('git', 'discard', 'lantern-cove', 'tide.md', '--yes', '--json');
  expect(one.code).toBe(0);
  expect(one.json.data).toMatchObject({
    checkout: { registered: true },
    discarded: [{ path: 'tide.md', untracked: false }],
  });

  const all = await cli.mesa('git', 'discard', 'lantern-cove', '--all', '--yes');
  expect(all.code).toBe(0);
  expect(all.stdout).toContain('deleted gull.md');
  expect(testGit(repo, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  expect(existsSync(join(repo, 'gull.md'))).toBe(false);
});
