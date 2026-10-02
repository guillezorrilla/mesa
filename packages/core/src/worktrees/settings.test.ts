import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Runner } from '../lib/process.js';
import {
  agentWorld,
  gitRepo,
  isolateGit,
  projectProfile,
  testGit,
  withRealGit,
} from '../testing/index.js';

isolateGit({ beforeAll, afterAll });

/** Real git; `/usr/bin/true` records the argv it was given instead of running. */
function recordingRun() {
  const ran: string[][] = [];
  const git = withRealGit(agentWorld().run);
  const run: Runner = (file, args, ms, options) => {
    if (file !== '/usr/bin/true') return git(file, args, ms, options);
    ran.push(args);
    return Promise.resolve({ ok: true, stdout: '' });
  };
  return { ran, run };
}

/** lantern-cove as a repository with an older commit on `older`, and an ignored cache folder. */
function repository(dir: string) {
  for (const folder of ['src', 'docs', 'cache', 'tmp']) mkdirSync(join(dir, folder));
  writeFileSync(join(dir, 'src', 'app.ts'), 'export const app = true;\n');
  writeFileSync(join(dir, 'docs', 'guide.md'), '# Guide\n');
  writeFileSync(join(dir, '.gitignore'), 'cache/\ntmp/\n');
  writeFileSync(join(dir, 'cache', 'local.txt'), 'invented cache\n');
  writeFileSync(join(dir, 'tmp', 'scratch.txt'), 'invented scratch\n');
  gitRepo(dir);
  testGit(dir, 'branch', 'older');
  testGit(dir, 'commit', '-q', '--allow-empty', '-m', 'newer');
}

const PROJECT_YAML = [
  'name: lantern-cove',
  '# Worktrees for this repository',
  'worktrees:',
  '  base: older',
  '  sparseDirectories: [src]',
  '  carryIgnoredDirectories: [cache]',
  '  setup: [/usr/bin/true, project-setup]',
  '  teardown: [/usr/bin/true, project-teardown]',
  '',
].join('\n');

const PROFILE_WORKTREES = JSON.stringify({
  base: 'main',
  sparseDirectories: ['docs'],
  carryIgnoredDirectories: ['tmp'],
  setup: ['/usr/bin/true', 'profile-setup'],
  teardown: ['/usr/bin/true', 'profile-teardown'],
});

test("a new worktree takes the project's mesa.yaml settings over the profile's", async () => {
  const { ran, run } = recordingRun();
  const { dir, mesa } = projectProfile(run, { mesaYaml: PROJECT_YAML });
  repository(dir);
  mesa.config.set('worktrees', PROFILE_WORKTREES);

  const { result } = await mesa.worktrees.create('lantern-cove', 'feature');
  expect(testGit(result.path, 'rev-parse', 'HEAD')).toBe(testGit(dir, 'rev-parse', 'older'));
  expect(existsSync(join(result.path, 'src', 'app.ts'))).toBe(true);
  expect(existsSync(join(result.path, 'docs', 'guide.md'))).toBe(false);
  expect(readFileSync(join(result.path, 'cache', 'local.txt'), 'utf8')).toBe('invented cache\n');
  expect(existsSync(join(result.path, 'tmp'))).toBe(false);
  expect(ran).toEqual([['project-setup']]);

  const preview = await mesa.worktrees.preview('lantern-cove', 'remove', result.path);
  expect(preview.teardown).toEqual(['/usr/bin/true', 'project-teardown']);
  await mesa.worktrees.rerun('lantern-cove', result.path);
  expect(ran.at(-1)).toEqual(['project-setup']);
});

test("a setting the project leaves out is the profile's", async () => {
  const { ran, run } = recordingRun();
  const { dir, mesa } = projectProfile(run, {
    mesaYaml: 'name: lantern-cove\nworktrees:\n  sparseDirectories: [src]\n',
  });
  repository(dir);
  mesa.config.set('worktrees', PROFILE_WORKTREES);

  const { result } = await mesa.worktrees.create('lantern-cove', 'feature');
  expect(testGit(result.path, 'rev-parse', 'HEAD')).toBe(testGit(dir, 'rev-parse', 'main'));
  expect(existsSync(join(result.path, 'docs'))).toBe(false);
  expect(readFileSync(join(result.path, 'tmp', 'scratch.txt'), 'utf8')).toBe('invented scratch\n');
  expect(ran).toEqual([['profile-setup']]);
  const preview = await mesa.worktrees.preview('lantern-cove', 'remove', result.path);
  expect(preview.teardown).toEqual(['/usr/bin/true', 'profile-teardown']);
});

test("removing a worktree runs the project's teardown, the one its preview showed", async () => {
  const { ran, run } = recordingRun();
  const { dir, mesa } = projectProfile(run, {
    mesaYaml: 'name: lantern-cove\nworktrees:\n  teardown: [/usr/bin/true, project-teardown]\n',
  });
  repository(dir);
  const remote = join(dir, '..', 'published.git');
  testGit(dir, 'init', '--bare', '-q', remote);
  testGit(dir, 'remote', 'add', 'origin', remote);
  testGit(dir, 'push', '-q', 'origin', 'main');
  mesa.config.set('worktrees', PROFILE_WORKTREES);
  mesa.config.set('worktrees.sparseDirectories', '[]');
  mesa.config.set('worktrees.carryIgnoredDirectories', '[]');

  const { result } = await mesa.worktrees.create('lantern-cove', 'feature');
  const preview = await mesa.worktrees.preview('lantern-cove', 'remove', result.path);
  expect(preview).toMatchObject({ allowed: true, teardown: ['/usr/bin/true', 'project-teardown'] });
  await mesa.worktrees.apply('lantern-cove', 'remove', preview.token, result.path);
  expect(ran).toEqual([['profile-setup'], ['project-teardown']]);
  expect(existsSync(result.path)).toBe(false);
});
