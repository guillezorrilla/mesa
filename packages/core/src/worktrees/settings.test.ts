import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { Runner } from '../lib/process.js';
import { createMesa, type Mesa } from '../mesa.js';
import {
  agentWorld,
  gitRepo,
  projectProfile,
  tempDir,
  testDeps,
  testGit,
  withRealGit,
} from '../testing/index.js';

/**
 * Real git, where a clone copies `cloneFrom`; `/usr/bin/true` records the argv it was given
 * instead of running.
 */
function recordingRun(cloneFrom?: string) {
  const ran: string[][] = [];
  const git = withRealGit(agentWorld().run);
  const run: Runner = (file, args, ms, options) => {
    if (file === 'git' && args[0] === 'clone' && cloneFrom)
      return git(file, ['clone', '-q', '--', cloneFrom, args.at(-1) ?? ''], ms, options);
    if (file !== '/usr/bin/true') return git(file, args, ms, options);
    ran.push(args);
    return Promise.resolve({ ok: true, stdout: '' });
  };
  return { ran, run };
}

/** Approves every script the project's mesa.yaml has waiting, as a person who reviewed them. */
const trustAll = (mesa: Mesa, name: string) =>
  mesa.projects.trust(
    name,
    Object.values(mesa.projects.pending(name)).map((script) => script.fingerprint),
  );

/** The fingerprint of the cloned repository's setup: sha256 of its exact argv as JSON. */
const CLONED = createHash('sha256')
  .update(JSON.stringify(['/usr/bin/true', 'cloned-setup']))
  .digest('hex');

/** The worktrees Git lists for the repository in `dir`, its main checkout included. */
const checkouts = (dir: string) =>
  testGit(dir, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '));

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
  // The repository's own setup runs only once this profile approves it.
  await expect(mesa.worktrees.create('lantern-cove', 'feature')).rejects.toMatchObject({
    code: 'needs_approval',
  });
  expect(checkouts(dir)).toHaveLength(1);
  trustAll(mesa, 'lantern-cove');

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
  await expect(mesa.worktrees.preview('lantern-cove', 'remove', result.path)).rejects.toMatchObject(
    { code: 'needs_approval' },
  );
  trustAll(mesa, 'lantern-cove');
  const preview = await mesa.worktrees.preview('lantern-cove', 'remove', result.path);
  expect(preview).toMatchObject({ allowed: true, teardown: ['/usr/bin/true', 'project-teardown'] });
  await mesa.worktrees.apply('lantern-cove', 'remove', preview.token, result.path);
  expect(ran).toEqual([['profile-setup'], ['project-teardown']]);
  expect(existsSync(result.path)).toBe(false);

  // A teardown changed after the approval asks again.
  const { result: next } = await mesa.worktrees.create('lantern-cove', 'next');
  writeFileSync(
    join(dir, 'mesa.yaml'),
    'name: lantern-cove\nworktrees:\n  teardown: [/usr/bin/true, changed-teardown]\n',
  );
  await expect(mesa.worktrees.preview('lantern-cove', 'remove', next.path)).rejects.toMatchObject({
    code: 'needs_approval',
    message: expect.stringContaining('["/usr/bin/true","changed-teardown"]'),
  });
});

test('a cloned repository runs its own setup only after trust, and again only after a change is approved', async () => {
  const source = join(tempDir(), 'reef');
  mkdirSync(source);
  writeFileSync(
    join(source, 'mesa.yaml'),
    'name: reef\nworktrees:\n  setup: [/usr/bin/true, cloned-setup]\n',
  );
  gitRepo(source);
  const { ran, run } = recordingRun(source);
  const { mesa } = projectProfile(run, { mesaYaml: 'name: lantern-cove\n' });
  const { result: cloned } = await mesa.projects.clone('https://example.com/team/reef.git');
  const dir = cloned.path;

  const refused = await mesa.worktrees.create('reef', 'feature').catch((error) => error);
  expect(refused).toMatchObject({
    code: 'needs_approval',
    details: {
      project: 'reef',
      scripts: { setup: { argv: ['/usr/bin/true', 'cloned-setup'], fingerprint: CLONED } },
    },
  });
  expect(refused.message).toContain(`(${CLONED})`);
  expect(refused.message).toContain(`mesa projects trust reef --expect ${CLONED}`);
  expect(mesa.projects.list().find((row) => row.name === 'reef')?.unapproved).toEqual({
    setup: { argv: ['/usr/bin/true', 'cloned-setup'], fingerprint: CLONED },
  });
  expect(checkouts(dir)).toHaveLength(1);
  expect(ran).toEqual([]);

  const { result: trusted } = trustAll(mesa, 'reef');
  expect(trusted).toEqual({ project: 'reef', setup: ['/usr/bin/true', 'cloned-setup'] });
  expect(mesa.projects.list().find((row) => row.name === 'reef')?.unapproved).toEqual({});
  const { result: first } = await mesa.worktrees.create('reef', 'feature');
  expect(ran).toEqual([['cloned-setup']]);

  // A pull, a checkout, or an agent's edit changes the argv: refused again, the rerun too.
  writeFileSync(
    join(dir, 'mesa.yaml'),
    'name: reef\nworktrees:\n  setup: [/usr/bin/true, pulled-setup]\n',
  );
  await expect(mesa.worktrees.create('reef', 'second')).rejects.toMatchObject({
    code: 'needs_approval',
  });
  await expect(mesa.worktrees.rerun('reef', first.path)).rejects.toMatchObject({
    code: 'needs_approval',
  });
  expect(checkouts(dir)).toHaveLength(2);
  expect(ran).toEqual([['cloned-setup']]);

  // Trust approves only what the person reviewed: the old fingerprint approves nothing now.
  const pending = mesa.projects.pending('reef');
  expect(() => mesa.projects.trust('reef', [CLONED])).toThrow(
    expect.objectContaining({
      code: 'usage',
      message: expect.stringContaining(
        `changed since its scripts were reviewed; nothing was approved. It now runs setup ["/usr/bin/true","pulled-setup"] (${pending.setup?.fingerprint})`,
      ),
    }),
  );
  expect(() => mesa.projects.trust('reef', [])).toThrow(expect.objectContaining({ code: 'usage' }));
  expect(mesa.projects.pending('reef')).toEqual(pending);

  // A setup a person writes through mesa projects set is approved as written.
  mesa.projects.override('reef', 'worktrees.setup', '[/usr/bin/true, written-setup]');
  await mesa.worktrees.create('reef', 'second');
  expect(ran.at(-1)).toEqual(['written-setup']);
  // An explicit empty setup runs nothing, and needs no approval.
  mesa.projects.override('reef', 'worktrees.setup', '[]');
  await mesa.worktrees.create('reef', 'third');
  expect(ran).toHaveLength(2);
});

test('only a caller outside a Mesa session approves: inside one, trust is refused and set stays unapproved', async () => {
  const { ran, run } = recordingRun();
  const { home, dir, mesa } = projectProfile(run, {
    mesaYaml: 'name: lantern-cove\nworktrees:\n  setup: [/usr/bin/true, repo-setup]\n',
  });
  repository(dir);
  // The same profile, from an agent's shell in a Mesa window (any profile's).
  const agent = createMesa(
    'default',
    testDeps(home, { run, env: { MESA_SESSION_ID: 'a1b2c3d4' } }),
  );

  expect(() => trustAll(agent, 'lantern-cove')).toThrow(
    expect.objectContaining({
      code: 'usage',
      message: expect.stringContaining('outside a Mesa session'),
    }),
  );
  agent.projects.override('lantern-cove', 'worktrees.setup', '[/usr/bin/true, agent-setup]');
  // Other overrides stay open to a session.
  agent.projects.override('lantern-cove', 'worktrees.fetch', 'false');
  expect(mesa.projects.list()[0]?.unapproved).toMatchObject({
    setup: { argv: ['/usr/bin/true', 'agent-setup'] },
  });
  await expect(mesa.worktrees.create('lantern-cove', 'feature')).rejects.toMatchObject({
    code: 'needs_approval',
  });
  expect(ran).toEqual([]);

  // A session rewriting an approved setup, even to the same argv, leaves it unapproved.
  trustAll(mesa, 'lantern-cove');
  agent.projects.override('lantern-cove', 'worktrees.setup', '[/usr/bin/true, agent-setup]');
  expect(mesa.projects.list()[0]?.unapproved).toMatchObject({
    setup: { argv: ['/usr/bin/true', 'agent-setup'] },
  });

  // Outside a session, set and trust both approve.
  mesa.projects.override('lantern-cove', 'worktrees.setup', '[/usr/bin/true, person-setup]');
  await mesa.worktrees.create('lantern-cove', 'feature');
  expect(ran).toEqual([['person-setup']]);
});

test("a Mesa session cannot change the profile's setup or teardown, by path or through a parent", () => {
  const { home, mesa } = projectProfile(recordingRun().run, { mesaYaml: 'name: lantern-cove\n' });
  mesa.config.set('worktrees.setup', '[/usr/bin/true, profile-setup]');
  const agent = createMesa('default', testDeps(home, { env: { MESA_SESSION_ID: 'a1b2c3d4' } }));
  const refused = expect.objectContaining({
    code: 'usage',
    message:
      'worktree scripts can only be approved from the Mesa app or a terminal outside a Mesa session',
  });
  for (const [path, value] of [
    ['worktrees.setup', '[/usr/bin/true, agent-setup]'],
    ['worktrees.teardown', '[/usr/bin/true, agent-teardown]'],
    ['worktrees.setup', '[]'],
    ['worktrees', '{teardown: [/usr/bin/true, agent-teardown]}'],
    ['worktrees', '{fetch: true}'],
  ] as const) {
    expect(() => agent.config.set(path, value)).toThrow(refused);
  }
  expect(mesa.config.get().worktrees).toMatchObject({
    setup: ['/usr/bin/true', 'profile-setup'],
    teardown: [],
  });
  // Other settings, and a parent write that keeps both scripts, stay open to a session.
  agent.config.set('worktrees.fetch', 'true');
  agent.config.set('worktrees', JSON.stringify({ ...mesa.config.get().worktrees, base: 'main' }));
  expect(mesa.config.get().worktrees).toMatchObject({ fetch: true, base: 'main' });
  // Outside a session, the person sets them as before.
  mesa.config.set('worktrees.teardown', '[/usr/bin/true, person-teardown]');
  expect(mesa.config.get().worktrees.teardown).toEqual(['/usr/bin/true', 'person-teardown']);
});

test('trust approves only the scripts whose fingerprints the person reviewed', () => {
  const { mesa } = projectProfile(recordingRun().run, {
    mesaYaml:
      'name: lantern-cove\nworktrees:\n  setup: [/usr/bin/true, s]\n  teardown: [/usr/bin/true, t]\n',
  });
  const { setup, teardown } = mesa.projects.pending('lantern-cove');
  expect(mesa.projects.trust('lantern-cove', [setup?.fingerprint ?? '']).result).toEqual({
    project: 'lantern-cove',
    setup: ['/usr/bin/true', 's'],
  });
  expect(mesa.projects.pending('lantern-cove')).toEqual({ teardown });
});
