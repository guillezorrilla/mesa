import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Runner } from '../lib/process.js';
import { listReceipts } from '../receipts/store.js';
import {
  agentWorld,
  gitProject,
  gitRepo,
  isolateGit,
  newSession,
  profilePaths,
  projectProfile,
  sequentialIds,
  testGit,
  withRealGit,
} from '../testing/index.js';
import { GENERAL_PROJECT } from './general.js';
import { SessionRecordSchema } from './record.js';

isolateGit({ beforeAll, afterAll });

// One id source for the file, so a second mesa over the same home never reuses an id.
const newId = sequentialIds();

/** lantern-cove and tide-pool, both git repositories on main, through the real git. */
function twoProjects({
  run,
  mesaYaml,
}: {
  run?: (world: Runner) => Runner;
  mesaYaml?: string;
} = {}) {
  const world = agentWorld();
  const git = withRealGit(world.run);
  const { home, dir, mesa } = projectProfile(run ? run(git) : git, { newId });
  gitRepo(dir);
  const tide = gitProject(mesa, home, 'tide-pool', mesaYaml);
  return { world, home, dir, tide, mesa };
}

/** Where Mesa puts `project`'s worktree for a branch folder. */
const worktreeAt = (home: string, project: string, folder: string) =>
  join(profilePaths(home, 'default').worktrees, project, folder);

/** A repository as a launch leaves it: its worktrees, and its branches. */
const repoState = (dir: string) => ({
  worktrees: testGit(dir, 'worktree', 'list', '--porcelain').match(/^worktree /gm)?.length,
  branches: testGit(dir, 'branch', '--list', '--format=%(refname:short)'),
});

test('--worktree with --with gives every project a worktree on one Mesa-named branch', async () => {
  const { world, home, mesa } = twoProjects();
  const { result } = await mesa.sessions.open('lantern-cove', {
    with: ['tide-pool'],
    goal: 'Tie the two together',
  });
  const branch = result.worktree?.branch ?? '';
  expect(branch).toMatch(/^session\/[a-z]+-[a-z]+-[0-9a-z]{4}$/);
  const folder = branch.replace('/', '-');
  expect(result.worktree?.path).toBe(worktreeAt(home, 'lantern-cove', folder));
  expect(result.additional).toEqual([
    {
      project: 'tide-pool',
      worktree: { path: worktreeAt(home, 'tide-pool', folder), branch, base: 'main' },
    },
  ]);
  expect((await mesa.sessions.show(result.id)).additional).toEqual(result.additional);
  // The agent runs in its own project's worktree, with the other's as an extra folder.
  const window = world.tmux.windows.find((w) => w.window === `claude-${result.id}`);
  expect(window?.path).toBe(result.worktree?.path);
  expect(window?.launch).toContain(`'--add-dir=${worktreeAt(home, 'tide-pool', folder)}'`);
});

test('the open receipt names the additional projects as inputs and outputs', async () => {
  const { home, mesa } = twoProjects();
  // A dangerous start keeps its receipt (dangerousLaunch).
  mesa.config.set('agents.claude.skipPermissions', 'true');
  const { result } = await mesa.sessions.open('lantern-cove', { with: ['tide-pool'] });
  const [kept] = listReceipts(join(home, 'vault'), 10, { session: result.id });
  expect(kept?.receipt).toMatchObject({
    inputs: { with: ['tide-pool'], branch: result.worktree?.branch },
    outputs: { worktree: result.worktree, additional: result.additional },
  });
});

test('every --with is checked before any git write: nothing is made in either repo', async () => {
  const yaml = 'name: tide-pool\nworktrees:\n  setup: [/usr/bin/touch, repo-file]\n';
  const { home, dir, tide, mesa } = twoProjects();
  const before = { alpha: repoState(dir), beta: repoState(tide) };
  const refused = async (
    opts: Parameters<typeof mesa.sessions.open>[1],
    code: string,
    message: string,
  ) => {
    await expect(mesa.sessions.open('lantern-cove', opts)).rejects.toMatchObject({ code, message });
    expect({ alpha: repoState(dir), beta: repoState(tide) }).toEqual(before);
    expect(await mesa.sessions.list()).toEqual([]);
  };
  await refused({ with: ['nope'] }, 'not_found', 'no project named nope; see mesa projects');
  await refused(
    { with: ['lantern-cove'] },
    'usage',
    "lantern-cove is the session's own project: drop --with lantern-cove",
  );
  await refused({ with: ['tide-pool', 'tide-pool'] }, 'usage', '--with tide-pool is given twice');
  // A folder that is not a git repository.
  const plain = join(home, 'src/drift');
  mkdirSync(plain, { recursive: true });
  writeFileSync(join(plain, 'mesa.yaml'), 'name: drift\n');
  mesa.projects.register(plain);
  await refused(
    { with: ['drift'], branch: 'shared' },
    'usage',
    expect.stringMatching(new RegExp(`^${plain} is not a git repository`)) as unknown as string,
  );
  // An unapproved setup in the second project.
  writeFileSync(join(tide, 'mesa.yaml'), yaml);
  await refused(
    { with: ['tide-pool'], branch: 'shared' },
    'needs_approval',
    expect.stringContaining('setup ["/usr/bin/touch","repo-file"]') as unknown as string,
  );
  expect(existsSync(worktreeAt(home, 'lantern-cove', 'shared'))).toBe(false);
});

test('the command is fitted with the planned worktree paths before any worktree exists', async () => {
  const { world, dir, tide, mesa } = twoProjects();
  // A goal that leaves 20 bytes under tmux's limit for a session without --with.
  const plain = (await mesa.sessions.open('lantern-cove', { goal: 'g' })).result;
  const used = Buffer.byteLength(
    world.tmux.windows.find((w) => w.window === `claude-${plain.id}`)?.launch ?? '',
  );
  const goal = 'g'.repeat(12_000 - 20 - used + 1);
  const before = { alpha: repoState(dir), beta: repoState(tide) };
  await expect(
    mesa.sessions.open('lantern-cove', { with: ['tide-pool'], branch: 'long', goal }),
  ).rejects.toMatchObject({ code: 'usage', message: expect.stringContaining('-byte command') });
  expect({ alpha: repoState(dir), beta: repoState(tide) }).toEqual(before);
  expect(await mesa.sessions.list()).toHaveLength(1);
});

test('a branch checked out in the second repo fails after the first worktree exists, and both repos end as they were', async () => {
  const { home, dir, tide, mesa } = twoProjects();
  testGit(tide, 'checkout', '-q', '-b', 'shared');
  const before = { alpha: repoState(dir), beta: repoState(tide) };
  await expect(
    mesa.sessions.open('lantern-cove', { with: ['tide-pool'], branch: 'shared' }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining(`cannot check out shared: fatal: 'shared' is already used`),
  });
  expect({ alpha: repoState(dir), beta: repoState(tide) }).toEqual(before);
  expect(existsSync(worktreeAt(home, 'lantern-cove', 'shared'))).toBe(false);
  expect(await mesa.sessions.list()).toEqual([]);
});

test('a worktree whose setup ran is kept and named in the error; the rest of the launch goes', async () => {
  const { home, dir, tide, mesa } = twoProjects({
    run:
      (git): Runner =>
      (file, args, ms, options) => {
        if (file !== '/usr/bin/touch') return git(file, args, ms, options);
        writeFileSync(join(options?.cwd ?? '', args[0] ?? ''), 'setup data');
        return Promise.resolve({ ok: true, stdout: '' });
      },
  });
  mesa.config.set('worktrees.setup', '["/usr/bin/touch", "keep.txt"]');
  testGit(tide, 'checkout', '-q', '-b', 'shared');
  const kept = worktreeAt(home, 'lantern-cove', 'shared');
  await expect(
    mesa.sessions.open('lantern-cove', { with: ['tide-pool'], branch: 'shared' }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringMatching(new RegExp(`; kept ${kept}, where setup ran$`)),
  });
  expect(readFileSync(join(kept, 'keep.txt'), 'utf8')).toBe('setup data');
  expect(testGit(dir, 'branch', '--list', 'shared')).toBe('+ shared');
  expect(await mesa.sessions.list()).toEqual([]);
});

test('a record without additional parses unchanged; the schema refuses additional out of place', () => {
  const worktree = { path: '/w/lantern-cove/x', branch: 'x' };
  const base = { ...newSession(), id: 'abcdefgh', events: [], worktree };
  expect(SessionRecordSchema.parse(base)).toEqual(base);
  const tide = { project: 'tide-pool', worktree: { path: '/w/tide-pool/x', branch: 'x' } };
  expect(SessionRecordSchema.safeParse({ ...base, additional: [tide] }).success).toBe(true);
  for (const bad of [
    { ...base, additional: [] },
    { ...base, worktree: undefined, additional: [tide] },
    { ...base, additional: [tide, tide] },
    { ...base, additional: [{ ...tide, project: 'lantern-cove' }] },
    { ...base, project: GENERAL_PROJECT, cwd: '/Users/a', worktree: undefined, additional: [tide] },
  ])
    expect(SessionRecordSchema.safeParse(bad).success).toBe(false);
});
