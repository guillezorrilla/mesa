import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { profilePaths } from '../profile/paths.js';
import { initProfile, openProfile, type Profile } from '../profile/profile.js';
import { tempDir, thrown } from '../testing/index.js';
import { discoverProjects } from './discover.js';
import { slugify } from './project-file.js';
import { listProjects, registerProject, unregisterProject, updateProject } from './projects.js';

let root: string;
let profile: Profile;
beforeEach(() => {
  root = tempDir();
  const paths = profilePaths(join(root, 'home'), 'default');
  initProfile(paths, { vault: '/tmp/v' });
  profile = openProfile(paths);
});

const folder = (name: string, yaml?: string) => {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  if (yaml) writeFileSync(join(path, 'mesa.yaml'), yaml);
  return path;
};

test('create writes a minimal mesa.yaml named after the folder and registers it', () => {
  const dir = folder('Lantern Cove');
  expect(thrown(() => registerProject(profile, { dir })).code).toBe('not_found');

  const { project, created } = registerProject(profile, { dir, create: true });
  expect(created).toBe(true);
  expect(project).toEqual({ name: 'lantern-cove', priority: 0.5, guardrail: 'normal' });
  expect(readFileSync(join(dir, 'mesa.yaml'), 'utf8')).toBe(
    'name: lantern-cove\npriority: 0.5\nguardrail: normal\n',
  );
  expect(listProjects(profile)).toEqual([
    {
      name: 'lantern-cove',
      label: 'lantern-cove',
      path: dir,
      agent: 'claude',
      priority: 0.5,
      skills: [],
      exists: true,
      pinned: false,
      hidden: false,
    },
  ]);
});

test('registration validates and saves an optional display name without changing the project slug', () => {
  const dir = folder('lantern-cove');
  registerProject(profile, { dir, create: true, label: '  Lantern Cove  ' });
  expect(listProjects(profile)[0]).toMatchObject({ name: 'lantern-cove', label: 'Lantern Cove' });
  expect(readFileSync(join(dir, 'mesa.yaml'), 'utf8')).toContain('name: lantern-cove');
  const invalid = folder('invalid');
  for (const label of ['', '  ', 'a'.repeat(81), 'two\nlines', 'bad\u007f']) {
    expect(thrown(() => registerProject(profile, { dir: invalid, create: true, label })).code).toBe(
      'usage',
    );
    expect(existsSync(join(invalid, 'mesa.yaml'))).toBe(false);
    expect(listProjects(profile)).toHaveLength(1);
  }
});

test('an existing mesa.yaml is read, with its agent and skills', () => {
  const dir = folder('tide', 'name: tide\nagent: codex\npriority: 0.9\nskills: [review]\n');
  registerProject(profile, { dir, create: true });
  expect(readFileSync(join(dir, 'mesa.yaml'), 'utf8')).toContain('agent: codex');
  expect(listProjects(profile)[0]).toMatchObject({
    agent: 'codex',
    priority: 0.9,
    skills: ['review'],
  });
});

test('registered slugs fit their vault hub filename, reserving three bytes for .md', () => {
  const name = 'a'.repeat(252);
  registerProject(profile, { dir: folder('limit', `name: ${name}\n`) });
  const tooLong = folder('too-long', `name: ${name}a\n`);
  expect(thrown(() => registerProject(profile, { dir: tooLong })).code).toBe('invalid_config');
  expect(listProjects(profile).map((p) => p.name)).toEqual([name]);
});

test('a duplicate name or path is invalid_config, and nothing is written', () => {
  registerProject(profile, { dir: folder('a', 'name: shared\n') });
  const b = folder('b', 'name: shared\n');
  expect(thrown(() => registerProject(profile, { dir: b })).code).toBe('invalid_config');
  expect(thrown(() => registerProject(profile, { dir: join(root, 'a') })).code).toBe(
    'invalid_config',
  );

  // --create under a clashing slug must not leave a mesa.yaml behind.
  const c = folder('shared');
  expect(thrown(() => registerProject(profile, { dir: c, create: true })).code).toBe(
    'invalid_config',
  );
  expect(() => readFileSync(join(c, 'mesa.yaml'))).toThrow();
  expect(listProjects(profile)).toHaveLength(1);
});

test('a moved project shows exists: false; an invalid mesa.yaml is invalid_config', () => {
  const dir = folder('gone', 'name: gone\n');
  registerProject(profile, { dir });
  rmSync(dir, { recursive: true });
  expect(listProjects(profile)).toEqual([
    {
      name: 'gone',
      label: 'gone',
      path: dir,
      agent: null,
      priority: null,
      skills: [],
      exists: false,
      pinned: false,
      hidden: false,
    },
  ]);
  expect(thrown(() => registerProject(profile, { dir: join(root, 'nowhere') })).code).toBe(
    'not_found',
  );
  const bad = folder('bad', 'name: Not A Slug\npriority: 2\n');
  expect(thrown(() => registerProject(profile, { dir: bad })).code).toBe('invalid_config');
});

test('unregister removes the entry by name', () => {
  registerProject(profile, { dir: folder('one', 'name: one\n') });
  registerProject(profile, { dir: folder('two', 'name: two\n') });
  expect(unregisterProject(profile, 'one').name).toBe('one');
  expect(listProjects(profile).map((p) => p.name)).toEqual(['two']);
  expect(thrown(() => unregisterProject(profile, 'one')).code).toBe('not_found');
});

test('profile-local labels, pins, hiding, and order preserve stable slugs and project files', () => {
  const one = folder('one', 'name: one\n');
  registerProject(profile, { dir: one });
  registerProject(profile, { dir: folder('two', 'name: two\n') });
  registerProject(profile, { dir: folder('three', 'name: three\n') });
  updateProject(profile, 'one', { label: 'The First', pinned: true });
  updateProject(profile, 'three', { hidden: true, move: 'up' });
  expect(listProjects(profile).map((p) => [p.name, p.label, p.pinned, p.hidden])).toEqual([
    ['one', 'The First', true, false],
    ['three', 'three', false, true],
    ['two', 'two', false, false],
  ]);
  expect(readFileSync(join(one, 'mesa.yaml'), 'utf8')).toBe('name: one\n');
  expect(thrown(() => updateProject(profile, 'one', { label: '  ' })).code).toBe('usage');
  expect(thrown(() => updateProject(profile, 'one', { label: 'line\nbreak' })).code).toBe('usage');
  expect(thrown(() => updateProject(profile, 'unknown', { hidden: true })).code).toBe('not_found');
  expect(listProjects(profile)[0]?.label).toBe('The First');
});

test('local discovery is bounded to projects and leaves their folders untouched', () => {
  const rootPath = folder('scan');
  const configured = folder('scan/known', 'name: custom-slug\n');
  const git = folder('scan/nearby');
  mkdirSync(join(git, '.git'));
  folder('scan/ordinary');
  const deep = folder('scan/a/b/c/d');
  mkdirSync(join(deep, '.git'));
  registerProject(profile, { dir: configured });
  expect(
    discoverProjects(profile, rootPath).map((row) => [
      row.path,
      row.name,
      row.configured,
      row.registered,
    ]),
  ).toEqual([
    [configured, 'custom-slug', true, true],
    [git, 'nearby', false, false],
  ]);
  expect(thrown(() => discoverProjects(profile, join(root, 'absent'))).code).toBe('not_found');
});

test('slugify', () => {
  expect(slugify('My Repo.v2')).toBe('my-repo-v2');
  expect(slugify('--x--')).toBe('x');
});

test('a register waits while another mesa holds the registry, and keeps the entry it wrote', async () => {
  const lock = `${profile.paths.registry}.lock`;
  const harbor = folder('harbor', 'name: harbor\n');
  writeFileSync(lock, 'another mesa');
  // The other mesa writes its entry, then lets go.
  const theirs = `projects:\n  - name: harbor\n    path: ${harbor}\n`;
  const other = spawn('sh', [
    '-c',
    'sleep 0.2; printf "%s" "$1" > "$2"; rm "$3"',
    'sh',
    theirs,
    profile.paths.registry,
    lock,
  ]);
  await new Promise((resolve) => other.on('spawn', resolve));
  registerProject(profile, { dir: folder('tide'), create: true });
  await new Promise((resolve) => other.on('exit', resolve));
  expect(listProjects(profile).map((p) => p.name)).toEqual(['harbor', 'tide']);
  // Written whole, and still the profile's alone.
  expect(statSync(profile.paths.registry).mode & 0o777).toBe(0o600);
});
