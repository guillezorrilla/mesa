import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../testing/index.js';
import { slashCommands } from './catalog.js';

const put = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const find = (rows: ReturnType<typeof slashCommands>, name: string) =>
  rows.find((r) => r.name === name);

function world() {
  const home = tempDir();
  const project = join(home, 'src/tide-pool');
  const claude = join(home, '.claude');
  put(
    join(claude, 'commands/ship.md'),
    '---\ndescription: Ship it\nargument-hint: <env>\n---\nbody',
  );
  put(join(claude, 'commands/team/plan.md'), 'Plan the sprint\n\nmore');
  put(join(claude, 'commands/broken.md'), '---\ndescription: [unclosed\n---\n');
  put(join(project, '.claude/commands/ship.md'), '---\ndescription: Ship from the project\n---\n');
  put(join(claude, 'skills/lint/SKILL.md'), '---\nname: lint\ndescription: Lint things\n---\n');
  put(join(project, '.claude/skills/deploy/SKILL.md'), '---\ndescription: Deploy\n---\n');
  const plugin = join(home, 'plugins/acme');
  put(join(plugin, 'commands/hello.md'), '---\ndescription: Say hello\n---\n');
  put(join(plugin, 'skills/greet/SKILL.md'), '---\nname: greet\ndescription: Greet\n---\n');
  put(
    join(claude, 'plugins/installed_plugins.json'),
    JSON.stringify({ plugins: { 'acme@market': [{ scope: 'user', installPath: plugin }] } }),
  );
  put(join(home, '.codex/prompts/review-pr.md'), '---\ndescription: Review a PR\n---\n');
  put(
    join(home, '.agents/skills/notes/SKILL.md'),
    '---\nname: notes\ndescription: Take notes\n---\n',
  );
  return { home, project };
}

test('claude: built-ins, user and project commands, skills and plugins, project over user', () => {
  const { home, project } = world();
  const rows = slashCommands({ home, env: {}, agent: 'claude', projectDir: project });
  expect(find(rows, 'usage')).toMatchObject({ source: 'builtin' });
  for (const n of [
    'model',
    'context',
    'compact',
    'clear',
    'cost',
    'config',
    'mcp',
    'agents',
    'permissions',
    'resume',
    'status',
    'review',
    'init',
    'memory',
    'hooks',
    'doctor',
    'export',
    'help',
  ])
    expect(find(rows, n), n).toBeDefined();
  expect(find(rows, 'ship')).toMatchObject({
    source: 'project',
    description: 'Ship from the project',
  });
  expect(find(rows, 'team:plan')).toMatchObject({ source: 'user', description: 'Plan the sprint' });
  expect(find(rows, 'lint')).toMatchObject({ source: 'skill', description: 'Lint things' });
  expect(find(rows, 'deploy')).toMatchObject({ source: 'skill' });
  expect(find(rows, 'acme:hello')).toMatchObject({ source: 'plugin' });
  expect(find(rows, 'acme:greet')).toMatchObject({ source: 'skill' });
  expect(find(rows, 'broken')).toBeUndefined();
  expect(rows.filter((r) => r.name === 'ship')).toHaveLength(1);
});

test('the user command keeps its argument hint without a project', () => {
  const { home } = world();
  expect(find(slashCommands({ home, env: {}, agent: 'claude' }), 'ship')).toMatchObject({
    argumentHint: '<env>',
    source: 'user',
  });
});

test('codex: built-ins, prompts as prompts:name, skills with a $ prefix', () => {
  const { home, project } = world();
  const rows = slashCommands({ home, env: {}, agent: 'codex', projectDir: project });
  for (const n of [
    'model',
    'status',
    'approvals',
    'compact',
    'new',
    'diff',
    'mention',
    'init',
    'review',
    'mcp',
    'quit',
  ])
    expect(find(rows, n), n).toMatchObject({ source: 'builtin' });
  expect(find(rows, 'prompts:review-pr')).toMatchObject({ source: 'user' });
  expect(find(rows, '$notes')).toMatchObject({ source: 'skill' });
  expect(find(rows, 'usage')).toBeUndefined();
});

test('symlinks are skipped', () => {
  const { home } = world();
  const target = join(home, 'elsewhere.md');
  put(target, '---\ndescription: linked\n---\n');
  symlinkSync(target, join(home, '.claude/commands/linked.md'));
  expect(find(slashCommands({ home, env: {}, agent: 'claude' }), 'linked')).toBeUndefined();
});

test('a plugin Claude has switched off in its settings offers nothing', () => {
  const { home } = world();
  put(
    join(home, '.claude/settings.json'),
    JSON.stringify({ enabledPlugins: { 'acme@market': false } }),
  );
  const rows = slashCommands({ home, env: {}, agent: 'claude' });
  expect(find(rows, 'acme:hello')).toBeUndefined();
  expect(find(rows, 'acme:greet')).toBeUndefined();
});
