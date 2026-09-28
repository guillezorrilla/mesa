import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isolateGit, withRealGit } from '@mesa/core/testing';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
isolateGit({ beforeAll, afterAll });
beforeEach(cli.reset);

test('files tree, search, exact line read, and revision-aware edits use one selected checkout', async () => {
  const repo = join(cli.home, 'lantern-cove');
  const linked = join(cli.home, 'linked');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  await cli.mesa('init', '--vault', 'vault');
  await cli.mesa('vault', 'init');
  await cli.mesa('register', '--create', repo);
  cli.run = withRealGit(cli.run);
  mkdirSync(join(repo, 'docs'));
  writeFileSync(join(repo, 'docs', 'guide.md'), '# Guide\nsecond line\n');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', [
    '-C',
    repo,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-qm',
    'first',
  ]);
  execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'linked', linked]);

  const tree = await cli.mesa('files', 'tree', 'lantern-cove', '--json');
  expect(tree.code, tree.stdout).toBe(0);
  expect(tree.json.data.entries).toContainEqual({ path: 'docs/guide.md', kind: 'file', depth: 1 });
  expect(
    tree.json.data.entries.some((entry: { path: string }) => entry.path.startsWith('.git')),
  ).toBe(false);
  const name = await cli.mesa('files', 'search', 'lantern-cove', 'guide', '--json');
  expect(name.json.data.hits).toContainEqual({
    path: 'docs/guide.md',
    line: 1,
    preview: 'docs/guide.md',
  });
  const content = await cli.mesa(
    'files',
    'search',
    'lantern-cove',
    'second',
    '--content',
    '--json',
  );
  expect(content.json.data.hits).toContainEqual({
    path: 'docs/guide.md',
    line: 2,
    preview: 'second line',
  });
  writeFileSync(join(repo, 'docs', 'many.md'), 'needle\n'.repeat(120));
  const bounded = await cli.mesa(
    'files',
    'search',
    'lantern-cove',
    'needle',
    '--content',
    '--json',
  );
  expect(bounded.json.data.hits).toHaveLength(100);
  expect(bounded.json.data.truncated).toBe(true);
  writeFileSync(join(repo, 'docs', 'binary.bin'), Buffer.from([0, 1, 2]));
  expect((await cli.mesa('files', 'read', 'lantern-cove', 'docs/binary.bin')).code).toBe(2);
  writeFileSync(join(repo, 'docs', 'large.txt'), 'x'.repeat(64 * 1024 + 1));
  expect((await cli.mesa('files', 'read', 'lantern-cove', 'docs/large.txt')).code).toBe(2);
  const read = await cli.mesa(
    'files',
    'read',
    'lantern-cove',
    'docs/guide.md',
    '--line',
    '2',
    '--json',
  );
  const revision = read.json.data.revision as string;
  expect(read.json.data.targetLine).toBe(2);
  expect(
    (await cli.mesa('files', 'read', 'lantern-cove', 'docs/guide.md', '--line', '4')).code,
  ).toBe(2);

  writeFileSync(join(repo, 'docs', 'guide.md'), 'external change\n');
  const stale = await cli.mesa(
    'files',
    'write',
    'lantern-cove',
    'docs/guide.md',
    '--revision',
    revision,
    '--text',
    'lost',
  );
  expect(stale.code).toBe(8);
  expect(readFileSync(join(repo, 'docs', 'guide.md'), 'utf8')).toBe('external change\n');
  const fresh = (await cli.mesa('files', 'read', 'lantern-cove', 'docs/guide.md', '--json')).json
    .data.revision as string;
  const saved = await cli.mesa(
    'files',
    'write',
    'lantern-cove',
    'docs/guide.md',
    '--revision',
    fresh,
    '--text',
    '# New\nbody\n',
    '--json',
  );
  expect(saved.code).toBe(0);
  expect(saved.json.data.receipt.id).toBeTypeOf('string');
  expect(readFileSync(join(repo, 'docs', 'guide.md'), 'utf8')).toBe('# New\nbody\n');
  expect(
    (await cli.mesa('files', 'delete', 'lantern-cove', 'docs/guide.md', '--revision', fresh)).code,
  ).toBe(8);

  const created = await cli.mesa(
    'files',
    'create',
    'lantern-cove',
    'docs/new.md',
    '--text',
    'new\n',
    '--json',
  );
  expect(created.code).toBe(0);
  expect((await cli.mesa('files', 'create', 'lantern-cove', 'docs/new.md')).code).toBe(2);
  expect(
    (
      await cli.mesa(
        'files',
        'rename',
        'lantern-cove',
        'docs/new.md',
        'docs/guide.md',
        '--revision',
        created.json.data.revision,
      )
    ).code,
  ).toBe(2);
  expect(readFileSync(join(repo, 'docs', 'new.md'), 'utf8')).toBe('new\n');
  const renamed = await cli.mesa(
    'files',
    'rename',
    'lantern-cove',
    'docs/new.md',
    'docs/renamed.md',
    '--revision',
    created.json.data.revision,
    '--json',
  );
  expect(renamed.code).toBe(0);
  expect(readFileSync(join(repo, 'docs', 'renamed.md'), 'utf8')).toBe('new\n');
  const deleted = await cli.mesa(
    'files',
    'delete',
    'lantern-cove',
    'docs/renamed.md',
    '--revision',
    renamed.json.data.revision,
    '--json',
  );
  expect(deleted.code).toBe(0);
  expect((await cli.mesa('files', 'read', 'lantern-cove', 'docs/renamed.md')).code).toBe(3);

  expect((await cli.mesa('files', 'read', 'lantern-cove', '../outside')).code).toBe(2);
  expect((await cli.mesa('files', 'read', 'lantern-cove', '.git/config')).code).toBe(2);
  symlinkSync(cli.home, join(repo, 'escape'));
  expect((await cli.mesa('files', 'read', 'lantern-cove', 'escape/outside')).code).toBe(2);
  expect((await cli.mesa('files', 'create', 'lantern-cove', 'escape/outside')).code).toBe(2);
  expect(
    (await cli.mesa('files', 'tree', 'lantern-cove', '--json')).json.data.entries.some(
      (entry: { path: string }) => entry.path === 'escape',
    ),
  ).toBe(false);
  expect(
    (await cli.mesa('files', 'read', 'lantern-cove', 'docs/guide.md', '--checkout', cli.home)).code,
  ).toBe(2);
  const linkedRead = await cli.mesa(
    'files',
    'read',
    'lantern-cove',
    'docs/guide.md',
    '--checkout',
    linked,
    '--json',
  );
  expect(linkedRead.json.data.text).toBe('# Guide\nsecond line\n');
  await cli.mesa('--profile', 'other', 'init', '--vault', 'other-vault');
  expect((await cli.mesa('--profile', 'other', 'files', 'tree', 'lantern-cove')).code).toBe(3);
});
