import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { profilePaths } from '../profile/paths.js';
import { initProfile, openProfile } from '../profile/profile.js';
import { tempDir, thrown } from '../testing/index.js';
import { cloneProject } from './clone.js';
import { repositoryUrl } from './project-url.js';
import { listProjects } from './projects.js';

test('repository URLs and Mesa links validate before any checkout', () => {
  expect(repositoryUrl('https://example.com/team/Lantern-Cove.git')).toEqual({
    url: 'https://example.com/team/Lantern-Cove.git',
    slug: 'lantern-cove',
  });
  expect(repositoryUrl('mesa://clone?url=https%3A%2F%2Fexample.com%2Fteam%2Fone.git')).toEqual({
    url: 'https://example.com/team/one.git',
    slug: 'one',
  });
  expect(repositoryUrl('git@example.com:team/one.git').slug).toBe('one');
  for (const input of [
    'file:///tmp/repo',
    'http://example.com/repo',
    'https://user:secret@example.com/repo',
    'https://example.com',
    'https://example.com/team/%XX.git',
    'mesa://clone?url=https%3A%2F%2Fexample.com%2Frepo&extra=1',
  ]) {
    expect(thrown(() => repositoryUrl(input)).code).toBe('usage');
  }
});

test('checkout uses the injected git runner and preserves a failed or pre-existing destination', async () => {
  const paths = profilePaths(tempDir(), 'test');
  initProfile(paths, { vault: '/tmp/v' });
  const profile = openProfile(paths);
  const source = repositoryUrl('https://example.com/team/one.git');
  const calls: string[][] = [];
  const result = await cloneProject(
    profile,
    async (file, args) => {
      calls.push([file, ...args]);
      writeFileSync(join(args[3] ?? '', 'README.md'), 'Invented content');
      return { ok: true, stdout: '' };
    },
    source,
  );
  expect(calls).toEqual([['git', 'clone', '--', source.url, join(paths.checkouts, 'one')]]);
  expect(result.project.name).toBe('one');
  expect(listProjects(profile)[0]?.path).toBe(join(paths.checkouts, 'one'));
  await expect(
    cloneProject(profile, async () => ({ ok: true, stdout: '' }), source),
  ).rejects.toMatchObject({ code: 'usage' });
  expect(existsSync(join(paths.checkouts, 'one', 'README.md'))).toBe(true);

  const other = repositoryUrl('https://example.com/team/two.git');
  await expect(
    cloneProject(profile, async () => ({ ok: false, reason: 'failed', detail: 'offline' }), other),
  ).rejects.toMatchObject({ code: 'usage' });
  expect(existsSync(join(paths.checkouts, 'two'))).toBe(false);
  expect(listProjects(profile)).toHaveLength(1);

  const clash = repositoryUrl('https://example.com/team/three.git');
  await expect(
    cloneProject(
      profile,
      async (_file, args) => {
        writeFileSync(join(args[3] ?? '', 'mesa.yaml'), 'name: one\n');
        return { ok: true, stdout: '' };
      },
      clash,
    ),
  ).rejects.toMatchObject({ code: 'invalid_config' });
  expect(existsSync(join(paths.checkouts, 'three'))).toBe(false);
  expect(existsSync(join(paths.checkouts, 'one', 'README.md'))).toBe(true);
});
