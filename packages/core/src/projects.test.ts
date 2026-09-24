import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { initProfile } from './config.js';
import { profileDir } from './index.js';
import { listProjects, registerProject, slugify, unregisterProject } from './projects.js';
import { MesaError } from './result.js';

let root: string;
let dir: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mesa-projects-')));
  dir = profileDir('default', join(root, 'home'));
  initProfile({ dir, vault: '/tmp/v' });
});

const project = (name: string, yaml?: string) => {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  if (yaml) writeFileSync(join(path, 'mesa.yaml'), yaml);
  return path;
};

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof MesaError ? e.code : e;
  }
};

test('create writes a minimal mesa.yaml named after the folder and registers it', () => {
  const path = project('Lantern Cove');
  expect(errorCode(() => registerProject({ profileDir: dir, dir: path }))).toBe('not_found');

  const { project: p, created } = registerProject({ profileDir: dir, dir: path, create: true });
  expect(created).toBe(true);
  expect(p).toEqual({ name: 'lantern-cove', priority: 0.5, guardrail: 'normal' });
  expect(readFileSync(join(path, 'mesa.yaml'), 'utf8')).toBe(
    'name: lantern-cove\npriority: 0.5\nguardrail: normal\n',
  );
  expect(listProjects(dir)).toEqual([
    { name: 'lantern-cove', path, agent: 'claude', priority: 0.5, skills: [], exists: true },
  ]);
});

test('an existing mesa.yaml is read, with its agent and skills', () => {
  const path = project('tide', 'name: tide\nagent: codex\npriority: 0.9\nskills: [review]\n');
  registerProject({ profileDir: dir, dir: path, create: true });
  expect(readFileSync(join(path, 'mesa.yaml'), 'utf8')).toContain('agent: codex');
  expect(listProjects(dir)[0]).toMatchObject({ agent: 'codex', priority: 0.9, skills: ['review'] });
});

test('duplicate name or duplicate path is invalid_config, and nothing is written', () => {
  const a = project('a', 'name: shared\n');
  const b = project('b', 'name: shared\n');
  registerProject({ profileDir: dir, dir: a });
  expect(errorCode(() => registerProject({ profileDir: dir, dir: b }))).toBe('invalid_config');
  expect(errorCode(() => registerProject({ profileDir: dir, dir: a }))).toBe('invalid_config');

  // --create under a clashing slug must not leave a mesa.yaml behind.
  const c = project('shared');
  expect(errorCode(() => registerProject({ profileDir: dir, dir: c, create: true }))).toBe(
    'invalid_config',
  );
  expect(() => readFileSync(join(c, 'mesa.yaml'))).toThrow();
  expect(listProjects(dir)).toHaveLength(1);
});

test('a moved project shows exists: false; invalid mesa.yaml is invalid_config', () => {
  const path = project('gone', 'name: gone\n');
  registerProject({ profileDir: dir, dir: path });
  rmSync(path, { recursive: true });
  expect(listProjects(dir)).toEqual([
    { name: 'gone', path, agent: null, priority: null, skills: [], exists: false },
  ]);
  expect(errorCode(() => registerProject({ profileDir: dir, dir: join(root, 'nowhere') }))).toBe(
    'not_found',
  );
  const bad = project('bad', 'name: Not A Slug\npriority: 2\n');
  expect(errorCode(() => registerProject({ profileDir: dir, dir: bad }))).toBe('invalid_config');
});

test('unregister removes the entry by name', () => {
  registerProject({ profileDir: dir, dir: project('one', 'name: one\n') });
  registerProject({ profileDir: dir, dir: project('two', 'name: two\n') });
  expect(unregisterProject(dir, 'one').name).toBe('one');
  expect(listProjects(dir).map((p) => p.name)).toEqual(['two']);
  expect(errorCode(() => unregisterProject(dir, 'one'))).toBe('not_found');
  expect(errorCode(() => listProjects(profileDir('uninitialised', join(root, 'home'))))).toBe(
    'not_found',
  );
});

test('slugify', () => {
  expect(slugify('My Repo.v2')).toBe('my-repo-v2');
  expect(slugify('--x--')).toBe('x');
});
