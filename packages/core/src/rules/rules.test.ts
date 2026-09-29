import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { scriptedRunner, tempDir, testDeps, thrown } from '../testing/index.js';

test('rules inventory reads native scopes and saves only current writable files', () => {
  const home = tempDir();
  const dir = join(home, 'src/lantern-cove');
  mkdirSync(join(dir, '.agents/rules'), { recursive: true });
  mkdirSync(join(home, '.claude/rules'), { recursive: true });
  mkdirSync(join(home, '.gemini/antigravity-cli/plugins/example/rules'), { recursive: true });
  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\n');
  writeFileSync(join(dir, 'AGENTS.md'), 'Project instructions\n');
  writeFileSync(join(dir, '.agents/rules/ui.md'), 'UI rule\n');
  writeFileSync(join(home, '.claude/rules/global.md'), 'Global rule\n');
  mkdirSync(join(home, '.gemini/config'), { recursive: true });
  writeFileSync(join(home, '.gemini/config/AGENTS.md'), 'Antigravity global rule\n');
  writeFileSync(
    join(home, '.gemini/antigravity-cli/plugins/example/rules/plugin.md'),
    'Plugin rule\n',
  );
  symlinkSync('AGENTS.md', join(dir, 'GEMINI.md'));
  const mesa = createMesa('default', testDeps(home, { run: scriptedRunner().run }));
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  mesa.projects.register(dir);
  const rows = mesa.rules.list('lantern-cove');
  expect(rows).toContainEqual(
    expect.objectContaining({
      name: 'AGENTS.md',
      scope: 'project',
      providers: ['claude', 'codex', 'antigravity'],
      writable: true,
    }),
  );
  expect(rows).toContainEqual(
    expect.objectContaining({
      name: 'global.md',
      scope: 'global',
      providers: ['claude'],
      writable: true,
    }),
  );
  expect(rows).toContainEqual(
    expect.objectContaining({ name: 'plugin.md', scope: 'plugin', writable: false }),
  );
  expect(rows).toContainEqual(
    expect.objectContaining({
      id: join(home, '.gemini/config/AGENTS.md'),
      providers: ['antigravity'],
    }),
  );
  expect(rows).toContainEqual(expect.objectContaining({ name: 'GEMINI.md', writable: false }));
  const id = join(dir, 'AGENTS.md');
  const before = mesa.rules.read(id, 'lantern-cove');
  const saved = mesa.rules.write(id, 'Updated instructions\n', before.revision, 'lantern-cove');
  expect(saved.result.revision).toBe(mesa.rules.read(id, 'lantern-cove').revision);
  expect(
    thrown(() => mesa.rules.write(id, 'stale', before.revision, 'lantern-cove')),
  ).toMatchObject({ code: 'locked' });
  expect(
    thrown(() =>
      mesa.rules.write(join(dir, 'GEMINI.md'), 'unsafe', before.revision, 'lantern-cove'),
    ),
  ).toMatchObject({ code: 'usage' });
  expect(readFileSync(id, 'utf8')).toBe('Updated instructions\n');
  expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(false);
});
