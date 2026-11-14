import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitRepo, testGit, withRealGit } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const lines = (changed: Record<number, string> = {}) =>
  `${Array.from({ length: 20 }, (_, i) => changed[i + 1] ?? `line ${i + 1}`).join('\n')}\n`;

test('stage and unstage --hunk change one hunk; a stale --expect is refused', async () => {
  const repo = await cli.withProject();
  writeFileSync(join(repo, 'tide.txt'), lines());
  gitRepo(repo);
  writeFileSync(join(repo, 'tide.txt'), lines({ 2: 'high water', 18: 'low water' }));
  cli.run = withRealGit(cli.run);
  const staged = () => testGit(repo, 'diff', '--cached');

  const stage = await cli.mesa('git', 'stage', 'lantern-cove', 'tide.txt', '--hunk', '1', '--json');
  expect(stage.json.data).toMatchObject({ path: 'tide.txt', action: 'stage', hunk: 1 });
  expect(staged()).toContain('+low water');
  expect(staged()).not.toContain('high water');

  const stale = await cli.mesa(
    'git',
    'stage',
    'lantern-cove',
    'tide.txt',
    '--hunk',
    '0',
    '--expect=-1,9 +1,9',
  );
  expect(stale.code).toBe(2);
  expect(stale.stderr).toContain('is now -1,5 +1,5, not -1,9 +1,9');

  const unstage = await cli.mesa('git', 'unstage', 'lantern-cove', 'tide.txt', '--hunk', '0');
  expect(unstage.stdout).toContain('unstaged hunk 0 of tide.txt');
  expect(staged()).toBe('');
  expect((await cli.mesa('git', 'stage', 'lantern-cove', 'tide.txt', '--hunk', 'x')).code).toBe(2);
});
