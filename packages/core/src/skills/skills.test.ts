import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts/store.js';
import { gitRepo, scriptedRunner, tempDir, testDeps, testGit, thrown } from '../testing/index.js';
import { GUIDELINES } from './guidelines.js';
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
 * sessions.guidelines off (its own test turns it on), and lantern-cove registered with `b` as its
 * mesa.yaml extra.
 */
function setUp(env: Record<string, string> = {}) {
  const home = tempDir();
  const library = join(home, 'library');
  skill(library, 'a');
  skill(library, 'b');
  const dir = join(home, 'src/lantern-cove');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\nskills: [b]\n');
  const mesa = createMesa(
    'default',
    testDeps(home, { run: scriptedRunner().run, skillsDir: library, env }),
  );
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mesa.config.set('skills', '[a]');
  mesa.config.set('sessions.guidelines', 'false');
  mesa.projects.register(dir);
  return { home, library, dir, mesa };
}

test('every skill Mesa ships has the frontmatter both agents read; both landing skills are present', () => {
  const shipped = readLibrary(testDeps(tempDir()).skillsDir);
  expect(shipped.map((s) => s.name)).toContain('session-summary');
  expect(shipped.map((s) => s.name)).toContain('project-brief');
  for (const s of shipped) expect(s.description.length).toBeGreaterThan(20);
});

test('the library ships mesa-vault and the Obsidian skills, each with its upstream NOTICE', () => {
  const shipped = readLibrary(testDeps(tempDir()).skillsDir);
  const obsidian = ['obsidian-markdown', 'obsidian-bases', 'json-canvas', 'obsidian-cli'];
  expect(shipped.map((s) => s.name)).toEqual(expect.arrayContaining(['mesa-vault', ...obsidian]));
  for (const name of obsidian) {
    const folder = shipped.find((s) => s.name === name)?.path as string;
    expect(readFileSync(join(folder, 'NOTICE'), 'utf8')).toMatch(
      new RegExp(
        `github\\.com/kepano/obsidian-skills, path skills/${name},\\nat commit [0-9a-f]{40}\\.[\\s\\S]*\\nMIT License\\n`,
      ),
    );
  }
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

test('inventory reads installed Claude plugin skills and all their support files', () => {
  const { home, dir, mesa } = setUp();
  const cache = join(home, '.claude/plugins/cache/example/map/1.0.0');
  skill(join(cache, 'skills'), 'shared');
  skill(join(dir, '.claude/skills'), 'shared');
  skill(join(home, '.claude/skills'), 'quiet');
  skill(join(home, '.claude/plugins/cache/example/off/1.0.0/skills'), 'off-plugin');
  const plugin = join(cache, 'skills/shared');
  for (let i = 0; i < 40; i++) {
    writeFileSync(join(plugin, `reference-${i}.md`), `support ${i}\n`);
  }
  mkdirSync(join(home, '.claude/plugins'), { recursive: true });
  writeFileSync(
    join(home, '.claude/plugins/installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'map@example': [
          { scope: 'user', installPath: cache },
          {
            scope: 'project',
            projectPath: '/another/project',
            installPath: join(home, 'elsewhere'),
          },
        ],
        'off@example': [
          { scope: 'user', installPath: join(home, '.claude/plugins/cache/example/off/1.0.0') },
        ],
      },
    }),
  );
  writeFileSync(
    join(home, '.claude/settings.json'),
    JSON.stringify({
      enabledPlugins: { 'map@example': true, 'off@example': false },
      skillOverrides: { quiet: 'off' },
    }),
  );
  skill(join(home, 'elsewhere/skills'), 'unrelated');
  const rows = mesa.skills.inventory('lantern-cove');
  expect(rows.find((row) => row.path === plugin)).toMatchObject({
    scope: 'plugin',
    providers: ['claude'],
    writable: false,
    readOnlyReason: 'Managed by a provider plugin',
    conflicts: [join(dir, '.claude/skills/shared')],
  });
  expect(rows.some((row) => row.name === 'unrelated')).toBe(false);
  expect(rows.find((row) => row.name === 'off-plugin')).toMatchObject({
    enabled: false,
    disabledFor: ['claude'],
  });
  expect(rows.find((row) => row.name === 'quiet')).toMatchObject({
    enabled: false,
    disabledFor: ['claude'],
  });
  expect(rows.find((row) => row.path === plugin)?.supportFiles).toHaveLength(40);
  expect(mesa.skills.read(plugin, 'lantern-cove', 'reference-39.md').text).toBe('support 39\n');
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
  mkdirSync(join(home, '.agents/skills/synced/bucket'), { recursive: true });
  const rows = mesa.skills.inventory('lantern-cove');
  expect(rows.find((row) => row.name === 'legacy')).toMatchObject({
    providers: ['antigravity'],
    supportFiles: ['references/deep/example.md'],
  });
  expect(rows.find((row) => row.name === 'broken')).toMatchObject({
    enabled: false,
    invalidReason: 'SKILL.md has invalid metadata',
  });
  expect(rows.find((row) => row.name === 'unnamed')).toMatchObject({
    enabled: false,
    invalidReason: 'SKILL.md has invalid metadata',
  });
  expect(rows.some((row) => row.name === 'synced')).toBe(false);
});

test('inventory skips a linked file in a skills root and reads a linked SKILL.md, read-only', () => {
  const { home, mesa } = setUp();
  const root = join(home, '.claude/skills');
  mkdirSync(join(home, 'dotfiles/stowed'), { recursive: true });
  writeFileSync(join(home, 'dotfiles/README.md'), 'Invented notes\n');
  writeFileSync(
    join(home, 'dotfiles/stowed/SKILL.md'),
    '---\nname: stowed\ndescription: A skill whose SKILL.md is a link\n---\n',
  );
  mkdirSync(join(root, 'stowed'), { recursive: true });
  symlinkSync(join(home, 'dotfiles/README.md'), join(root, 'README.md'));
  symlinkSync(join(home, 'dotfiles/stowed/SKILL.md'), join(root, 'stowed/SKILL.md'));
  const rows = mesa.skills.inventory();
  expect(rows.some((row) => row.name === 'README.md')).toBe(false);
  const stowed = rows.find((row) => row.name === 'stowed');
  expect(stowed).toMatchObject({
    description: 'A skill whose SKILL.md is a link',
    enabled: true,
    writable: false,
    readOnlyReason: 'Linked SKILL.md',
  });
  expect(stowed?.invalidReason).toBeUndefined();
  const id = join(root, 'stowed');
  expect(thrown(() => mesa.skills.write(id, 'changed', 'any revision'))).toMatchObject({
    code: 'usage',
    message: 'Linked SKILL.md',
  });
  expect(readFileSync(join(home, 'dotfiles/stowed/SKILL.md'), 'utf8')).toContain('name: stowed');
});

test('inventory reports a skill disabled by Codex without editing its native config', () => {
  const { home, mesa } = setUp();
  skill(join(home, '.agents/skills'), 'codex-only');
  const file = join(home, '.agents/skills/codex-only/SKILL.md');
  mkdirSync(join(home, '.codex'), { recursive: true });
  const config = `[[skills.config]]\npath = ${JSON.stringify(file)}\nenabled = false\n`;
  writeFileSync(join(home, '.codex/config.toml'), config);
  expect(mesa.skills.inventory().find((row) => row.name === 'codex-only')).toMatchObject({
    enabled: false,
    disabledFor: ['codex'],
    precedence: 'only-discovered-source',
  });
  expect(readFileSync(join(home, '.codex/config.toml'), 'utf8')).toBe(config);
});

test('inventory reads Claude and Codex settings from the homes the injected env names', () => {
  const base = tempDir();
  const claudeHome = join(base, 'claude');
  const codexHome = join(base, 'codex');
  const { home, mesa } = setUp({ CLAUDE_CONFIG_DIR: claudeHome, CODEX_HOME: codexHome });
  skill(join(claudeHome, 'skills'), 'quiet');
  skill(join(claudeHome, 'skills'), 'loud');
  writeFileSync(
    join(claudeHome, 'settings.json'),
    JSON.stringify({ skillOverrides: { quiet: 'off' } }),
  );
  // Claude reads no ~/.claude while CLAUDE_CONFIG_DIR is set.
  skill(join(home, '.claude/skills'), 'unread');
  skill(join(home, '.agents/skills'), 'codex-only');
  mkdirSync(codexHome, { recursive: true });
  const file = join(home, '.agents/skills/codex-only/SKILL.md');
  writeFileSync(
    join(codexHome, 'config.toml'),
    `[[skills.config]]\npath = ${JSON.stringify(file)}\nenabled = false\n`,
  );
  const rows = mesa.skills.inventory();
  expect(rows.find((row) => row.name === 'loud')).toMatchObject({
    path: join(claudeHome, 'skills/loud'),
    scope: 'global',
    providers: ['claude'],
    enabled: true,
  });
  expect(rows.find((row) => row.name === 'quiet')).toMatchObject({
    enabled: false,
    disabledFor: ['claude'],
  });
  expect(rows.find((row) => row.name === 'codex-only')).toMatchObject({
    enabled: false,
    disabledFor: ['codex'],
  });
  expect(rows.some((row) => row.name === 'unread')).toBe(false);
});

test('project skill policy changes preserve mesa.yaml comments and leave profile policy alone', () => {
  const { dir, mesa } = setUp();
  writeFileSync(join(dir, 'mesa.yaml'), '# Project note\nname: lantern-cove\nskills: [b]\n');
  expect(mesa.skills.setProject('lantern-cove', 'a', true).result.changed).toBe(true);
  expect(mesa.skills.setProject('lantern-cove', 'a', true).result.changed).toBe(false);
  expect(mesa.skills.setProject('lantern-cove', 'b', false).result.skills).toEqual(['a']);
  expect(readFileSync(join(dir, 'mesa.yaml'), 'utf8')).toContain('# Project note');
  expect(mesa.config.get().skills).toEqual(['a']);
  expect(thrown(() => mesa.skills.setProject('lantern-cove', 'unknown', true))).toMatchObject({
    code: 'not_found',
  });
  // The profile enables a: one project cannot turn it off, so it is refused, not a quiet no-op.
  const policy = readFileSync(join(dir, 'mesa.yaml'), 'utf8');
  expect(thrown(() => mesa.skills.setProject('lantern-cove', 'a', false))).toMatchObject({
    code: 'usage',
    message: expect.stringContaining("profile default's skills"),
  });
  expect(readFileSync(join(dir, 'mesa.yaml'), 'utf8')).toBe(policy);
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

test('agent-guidelines is on for every project by default, off with sessions.guidelines false', () => {
  const { library, dir, mesa } = setUp();
  skill(library, GUIDELINES);
  mesa.config.set('sessions.guidelines', 'true');
  const guidelines = () => mesa.skills.list('lantern-cove').find((r) => r.name === GUIDELINES);
  expect(mesa.config.get().skills).toEqual(['a']);
  expect(guidelines()?.enabled).toBe(true);
  expect(mesa.skills.sync('lantern-cove').result.added).toContain(`.claude/skills/${GUIDELINES}`);
  // While it is on for every project, one project cannot turn it off.
  expect(thrown(() => mesa.skills.setProject('lantern-cove', GUIDELINES, false))).toMatchObject({
    code: 'usage',
    message: expect.stringContaining('mesa config set sessions.guidelines false'),
  });
  mesa.config.set('sessions.guidelines', 'false');
  expect(guidelines()?.enabled).toBe(false);
  expect(mesa.skills.sync('lantern-cove').result.removed).toContain(`.claude/skills/${GUIDELINES}`);
  expect(existsSync(join(dir, '.claude/skills', GUIDELINES))).toBe(false);
});

test('a new profile has sessions.guidelines on, and Mesa ships the agent-guidelines skill', () => {
  const mesa = createMesa('default', testDeps(tempDir()));
  mesa.init({ vault: 'vault' });
  expect(mesa.config.get().sessions.guidelines).toBe(true);
  expect(readLibrary(testDeps(tempDir()).skillsDir).map((s) => s.name)).toContain(GUIDELINES);
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

test("a link an earlier Mesa library made is repointed; a link of the user's, elsewhere, is not", () => {
  const { home, library, dir, mesa } = setUp();
  mkdirSync(join(dir, '.claude/skills'), { recursive: true });
  mkdirSync(join(dir, '.agents/skills'), { recursive: true });
  // A deleted checkout's library, and another checkout's, which ships Mesa's mesa skill.
  symlinkSync(join(home, 'mesa-399/skills/a'), join(dir, '.claude/skills/a'));
  skill(join(home, 'mesa-400/skills'), 'mesa');
  skill(join(home, 'mesa-400/skills'), 'b');
  symlinkSync(join(home, 'mesa-400/skills/b'), join(dir, '.claude/skills/b'));
  // The deleted checkout's link for a skill no longer enabled goes, like any link Mesa made.
  symlinkSync(join(home, 'mesa-399/skills/retired'), join(dir, '.claude/skills/retired'));
  // The user's own: an absolute link into a skills folder that is not a Mesa library.
  skill(join(home, 'dotfiles/skills'), 'a');
  symlinkSync(join(home, 'dotfiles/skills/a'), join(dir, '.agents/skills/a'));
  expect(mesa.skills.list('lantern-cove').filter((r) => r.source === 'repo')).toEqual([
    { name: 'a', source: 'repo', enabled: true, description: 'The a skill' },
  ]);

  const { result } = mesa.skills.sync('lantern-cove');
  expect(result).toMatchObject({
    added: ['.claude/skills/a', '.claude/skills/b', '.agents/skills/b'],
    removed: ['.claude/skills/retired'],
    conflicts: ['.agents/skills/a'],
  });
  expect(readlinkSync(join(dir, '.claude/skills/a'))).toBe(join(library, 'a'));
  expect(readlinkSync(join(dir, '.claude/skills/b'))).toBe(join(library, 'b'));
  expect(readlinkSync(join(dir, '.agents/skills/a'))).toBe(join(home, 'dotfiles/skills/a'));
  expect(existsSync(join(home, 'mesa-400/skills/b/SKILL.md'))).toBe(true);
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

test('a skill linked into a native folder is edited where its link points', () => {
  const { home, mesa } = setUp();
  skill(join(home, '.agents/skills'), 'linked', 'Linked skill');
  mkdirSync(join(home, '.claude/skills'), { recursive: true });
  symlinkSync('../../.agents/skills/linked', join(home, '.claude/skills/linked'));
  const row = mesa.skills.inventory().find((each) => each.name === 'linked');
  expect(row).toMatchObject({ writable: true, providers: ['claude', 'codex'] });
  const opened = mesa.skills.read(row?.id ?? '');
  mesa.skills.write(row?.id ?? '', `${opened.text}Edited.\n`, opened.revision);
  expect(readFileSync(join(home, '.agents/skills/linked/SKILL.md'), 'utf8')).toContain('Edited.');
  expect(lstatSync(join(home, '.claude/skills/linked')).isSymbolicLink()).toBe(true);
});

test("Mesa's library links stay Mesa skills when the library is reached through a link", () => {
  const { home, dir } = setUp();
  // The same library, named through a linked folder (as /var is /private/var on macOS).
  symlinkSync(join(home, 'library'), join(home, 'linked-library'));
  const mesa = createMesa(
    'default',
    testDeps(home, { run: scriptedRunner().run, skillsDir: join(home, 'linked-library') }),
  );
  mesa.skills.sync('lantern-cove');
  expect(existsSync(join(dir, '.claude/skills/a'))).toBe(true);
  const rows = mesa.skills.inventory('lantern-cove').filter((row) => row.name === 'a');
  expect(rows.map((row) => [row.scope, row.writable])).toEqual([['mesa', false]]);
});
