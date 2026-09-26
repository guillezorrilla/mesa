import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts/store.js';
import { scriptedRunner, tempDir, testDeps, thrown } from '../testing/index.js';
import { readLibrary } from './library.js';

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

test('every skill Mesa ships has the frontmatter both agents read; session-summary is one', () => {
  const shipped = readLibrary(testDeps(tempDir()).skillsDir);
  expect(shipped.map((s) => s.name)).toContain('session-summary');
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
    { name: 'a', source: 'mesa', enabled: true, description: 'The a skill' },
    { name: 'b', source: 'mesa', enabled: true, description: 'The b skill' },
    { name: 'other', source: 'repo', enabled: true, description: '' },
    { name: 'own', source: 'repo', enabled: true, description: 'The own skill' },
  ]);
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
  const [entry] = listReceipts(join(home, 'vault'), 1);
  expect(entry?.receipt).toMatchObject({ id: receipt?.id, status: 'ok', project: 'lantern-cove' });
  // Again: nothing to do, and no receipt for it.
  expect(mesa.skills.sync('lantern-cove').result.kept).toHaveLength(4);
  expect(
    listReceipts(join(home, 'vault'), 50).filter((e) => e.summary.startsWith('Synced')),
  ).toHaveLength(1);

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
