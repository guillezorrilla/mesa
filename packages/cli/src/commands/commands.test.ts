import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('commands lists a project as JSON and as an aligned table, per agent', async () => {
  const dir = await cli.withProject();
  mkdirSync(join(dir, '.claude/commands'), { recursive: true });
  writeFileSync(
    join(dir, '.claude/commands/ship.md'),
    '---\ndescription: Ship it\nargument-hint: <env>\n---\n',
  );
  const { json } = await cli.mesa('commands', 'lantern-cove', '--json');
  const rows = json.data as { name: string; source: string; argumentHint?: string }[];
  expect(rows.find((r) => r.name === 'usage')?.source).toBe('builtin');
  expect(rows.find((r) => r.name === 'ship')).toMatchObject({
    source: 'project',
    argumentHint: '<env>',
  });
  const codex = await cli.mesa('commands', 'lantern-cove', '--agent', 'codex', '--json');
  expect((codex.json.data as { name: string }[]).some((r) => r.name === 'approvals')).toBe(true);
  const text = await cli.mesa('commands', 'lantern-cove');
  expect(text.stdout).toMatch(/\/ship\s+project\s+<env>\s+Ship it/);
});

test('commands rejects an unknown agent and an unknown target', async () => {
  await cli.withProject();
  expect((await cli.mesa('commands', 'lantern-cove', '--agent', 'nope')).code).not.toBe(0);
  expect((await cli.mesa('commands', 'nothing-here')).code).not.toBe(0);
});
