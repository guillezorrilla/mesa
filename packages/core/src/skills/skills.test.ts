import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts/store.js';
import {
  gitRepo,
  isolateGit,
  scriptedRunner,
  tempDir,
  testDeps,
  testGit,
  thrown,
} from '../testing/index.js';
import { readLibrary } from './library.js';

isolateGit({ beforeAll, afterAll });

/** A skill folder with the frontmatter both agents read. */
function skill(dir: string, name: string, description = `The ${name} skill`, as = name) {
  mkdirSync(join(dir, as), { recursive: true });
  writeFileSync(
    join(dir, as, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  );
}

/**
 * A profile over a temp home with its own library (skills a and b), `a` enabled in the profile,
 * and lantern-cove registered with `b` as its mesa.yaml extra.
 */
function setUp() {
  const home = tempDir();
  const library = join(home, 'library');
  skill(library, 'a');
  skill(library, 'b');
  const dir = join(home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\nskills: [b]\n');
  const mesa = createMesa(
    'default',
    testDeps(home, { run: scriptedRunner().run, skillsDir: library }),
  );
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mesa.config.set('skills', '[a]');
  mesa.projects.register(dir);
  return { home, library, dir, mesa };
}

test('every skill Mesa ships has the frontmatter both agents read; both landing skills are present', () => {
  const shipped = readLibrary(testDeps(tempDir()).skillsDir);
  expect(shipped.map((s) => s.name)).toContain('session-summary');
  expect(shipped.map((s) => s.name)).toContain('project-brief');
  for (const s of shipped) expect(s.description.length).toBeGreaterThan(20);
});

test("list merges the library with the profile's set, the project's extras, and its own skills", () => {
  const { dir, mesa } = setUp();
  expect(mesa.skills.list()).toEqual([
    { name: 'a', source: 'mesa', enabled: true, description: 'The a skill' },
    { name: 'b', source: 'mesa', enabled: false, description: 'The b skill' },
  ]);
  // The project's own skill, and a link of its own to another tool's folder.
  skill(join(dir, '.claude/skills'), 'own');
  mkdirSync(join(dir, '.agents/skills/other'), { recursive: true });
  symlinkSync('../../.agents/skills/other', join(dir, '.claude/skills/other'));
  expect(mesa.skills.list('lantern-cove')).toEqual([
    { name: 'a', source: 'mesa', enabled: true, description: 'The a skill', linked: false },
    { name: 'b', source: 'mesa', enabled: true, description: 'The b skill', linked: false },
    { name: 'other', source: 'repo', enabled: true, description: '' },
    { name: 'own', source: 'repo', enabled: true, description: 'The own skill' },
  ]);
  // Once synced, the project has Mesa's links to them.
  mesa.skills.sync('lantern-cove');
  expect(
    mesa.skills
      .list('lantern-cove')
      .filter((r) => r.linked)
      .map((r) => r.name),
  ).toEqual(['a', 'b']);
});

test('inventory keeps native sources and same-name conflicts visible without changing user files', () => {
  const { home, dir, mesa } = setUp();
  skill(join(home, '.claude/skills'), 'shared', 'Global Claude skill');
  skill(join(dir, '.claude/skills'), 'shared', 'Project Claude skill');
  skill(join(home, '.gemini/antigravity-cli/plugins/example/skills'), 'plugin-skill');
  writeFileSync(join(dir, '.claude/skills/shared', 'reference.md'), 'support\n');

  const rows = mesa.skills.inventory('lantern-cove');
  const project = rows.find((row) => row.path === join(dir, '.claude/skills/shared'));
  const global = rows.find((row) => row.path === join(home, '.claude/skills/shared'));
  expect(project).toMatchObject({
    scope: 'project',
    providers: ['claude'],
    supportFiles: ['reference.md'],
    writable: true,
    conflicts: [join(home, '.claude/skills/shared')],
  });
  expect(global).toMatchObject({
    scope: 'global',
    providers: ['claude'],
    conflicts: [join(dir, '.claude/skills/shared')],
  });
  expect(rows).toContainEqual(
    expect.objectContaining({
      name: 'plugin-skill',
      scope: 'plugin',
      providers: ['antigravity'],
      writable: false,
    }),
  );
  expect(existsSync(join(dir, '.claude/skills/shared/SKILL.md'))).toBe(true);
});

test('inventory distinguishes malformed folders and lists nested support files in CLI roots', () => {
  const { home, dir, mesa } = setUp();
  skill(join(dir, '.agent/skills'), 'legacy');
  mkdirSync(join(dir, '.agents/skills/unnamed'), { recursive: true });
  writeFileSync(
    join(dir, '.agents/skills/unnamed/SKILL.md'),
    '---\ndescription: A provider skill without a name field.\n---\n',
  );
  mkdirSync(join(dir, '.agent/skills/legacy/references/deep'), { recursive: true });
  writeFileSync(join(dir, '.agent/skills/legacy/references/deep/example.md'), 'invented\n');
  mkdirSync(join(home, '.agents/skills/broken'), { recursive: true });
  writeFileSync(join(home, '.agents/skills/broken/SKILL.md'), 'invalid frontmatter\n');
  const rows = mesa.skills.inventory('lantern-cove');
  expect(rows.find((row) => row.name === 'legacy')).toMatchObject({
    providers: ['antigravity'],
    supportFiles: ['references/deep/example.md'],
  });
  expect(rows.find((row) => row.name === 'broken')).toMatchObject({
    enabled: false,
    invalidReason: 'SKILL.md has invalid metadata',
  });
  expect(rows.find((row) => row.name === 'unnamed')).toMatchObject({ enabled: true });
});

test('skill documents use the checked editor and reject stale or read-only writes', () => {
  const { home, dir, mesa } = setUp();
  skill(join(dir, '.claude/skills'), 'own');
  const id = join(dir, '.claude/skills/own');
  writeFileSync(join(id, 'reference.md'), 'first\n');
  const before = mesa.skills.read(id, 'lantern-cove', 'reference.md');
  expect(before.text).toBe('first\n');
  const saved = mesa.skills.write(id, 'second\n', before.revision, 'lantern-cove', 'reference.md');
  expect(saved.result.revision).toBe(mesa.skills.read(id, 'lantern-cove', 'reference.md').revision);
  expect(
    thrown(() => mesa.skills.write(id, 'lost\n', before.revision, 'lantern-cove', 'reference.md')),
  ).toMatchObject({ code: 'locked' });
  expect(thrown(() => mesa.skills.read(id, 'lantern-cove', '../mesa.yaml'))).toMatchObject({
    code: 'usage',
  });
  expect(mesa.skills.read(id, 'lantern-cove', 'reference.md').text).toBe('second\n');
  const shipped = join(home, 'library/a');
  expect(
    thrown(() => mesa.skills.write(shipped, 'changed', mesa.skills.read(shipped).revision)),
  ).toMatchObject({ code: 'usage' });
});

test('sync links the enabled skills into both folders, then unlinks only its own', async () => {
  const { home, library, dir, mesa } = setUp();
  const { result, receipt } = mesa.skills.sync('lantern-cove');
  expect(result).toEqual({
    added: ['.claude/skills/a', '.claude/skills/b', '.agents/skills/a', '.agents/skills/b'],
    removed: [],
    kept: [],
    conflicts: [],
    unknown: [],
  });
  for (const link of result.added) {
    expect(lstatSync(join(dir, link)).isSymbolicLink()).toBe(true);
  }
  expect(readlinkSync(join(dir, '.claude/skills/a'))).toBe(join(library, 'a'));
  expect(receipt).toBeNull();
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
  // Again: nothing to do, and no receipt for it.
  expect(mesa.skills.sync('lantern-cove').result.kept).toHaveLength(4);
  expect(
    listReceipts(join(home, 'vault'), 50).filter((e) => e.summary.startsWith('Synced')),
  ).toHaveLength(0);

  // b is no longer enabled (the project drops it): Mesa's links go, nothing else.
  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\n');
  skill(join(dir, '.claude/skills'), 'own');
  const again = mesa.skills.sync('lantern-cove').result;
  expect(again.removed).toEqual(['.claude/skills/b', '.agents/skills/b']);
  expect(existsSync(join(dir, '.claude/skills/b'))).toBe(false);
  expect(existsSync(join(dir, '.claude/skills/own/SKILL.md'))).toBe(true);
});

test("an entry of the project's own is never touched: a clash is a conflict, an unknown name is said", () => {
  const { dir, mesa } = setUp();
  // The project already has an `a` of its own in Claude's folder, and a link of its own in Codex's.
  skill(join(dir, '.claude/skills'), 'a', 'Our own a');
  mkdirSync(join(dir, 'elsewhere/a'), { recursive: true });
  mkdirSync(join(dir, '.agents/skills'), { recursive: true });
  symlinkSync('../../elsewhere/a', join(dir, '.agents/skills/a'));
  mesa.config.set('skills', '[a, nope]');
  const { result } = mesa.skills.sync('lantern-cove');
  expect(result.conflicts).toEqual(['.claude/skills/a', '.agents/skills/a']);
  expect(result.unknown).toEqual(['nope']);
  expect(readlinkSync(join(dir, '.agents/skills/a'))).toBe('../../elsewhere/a');
  expect(lstatSync(join(dir, '.claude/skills/a')).isDirectory()).toBe(true);
  // Disabling everything removes Mesa's own links (b, the project's extra), nothing of the project's.
  mesa.config.set('skills', '[]');
  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\n');
  expect(mesa.skills.sync('lantern-cove').result.removed).toEqual([
    '.claude/skills/b',
    '.agents/skills/b',
  ]);
  expect(lstatSync(join(dir, '.agents/skills/a')).isSymbolicLink()).toBe(true);
});

test('a library skill Mesa cannot ship is invalid_config: no SKILL.md, or the wrong name', () => {
  const library = tempDir();
  skill(library, 'right');
  mkdirSync(join(library, 'bare'));
  expect(thrown(() => readLibrary(library))).toMatchObject({ code: 'invalid_config' });
  const other = tempDir();
  skill(other, 'mislabelled', 'Named for another folder', 'folder');
  expect(thrown(() => readLibrary(other))).toMatchObject({
    code: 'invalid_config',
    message: `${join(other, 'folder/SKILL.md')}: name is mislabelled, not folder`,
  });
});

test('a skill folder that links to the other is one place: each link is made, and said, once', () => {
  const { dir, mesa } = setUp();
  mkdirSync(join(dir, '.agents/skills'), { recursive: true });
  mkdirSync(join(dir, '.claude'), { recursive: true });
  symlinkSync('../.agents/skills', join(dir, '.claude/skills'));
  const { result } = mesa.skills.sync('lantern-cove');
  expect(result.added).toEqual(['.claude/skills/a', '.claude/skills/b']);
  expect(result.kept).toEqual([]);
  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\n');
  expect(mesa.skills.sync('lantern-cove').result).toMatchObject({
    removed: ['.claude/skills/b'],
    kept: ['.claude/skills/a'],
  });
});

test('links into a folder inside the project (an adopted session in a subfolder) stay out of git too', () => {
  const { dir, mesa } = setUp();
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub/notes.md'), 'kept\n');
  gitRepo(dir);
  mesa.skills.linkInto('lantern-cove', join(dir, 'sub'));
  expect(existsSync(join(dir, 'sub/.claude/skills/a/SKILL.md'))).toBe(true);
  expect(testGit(dir, 'status', '--porcelain')).toBe('');
});
