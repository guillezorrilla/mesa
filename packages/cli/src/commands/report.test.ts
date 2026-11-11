import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_VERSION, fakeTmux, scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

// Invented sessions in a fake tmux; the child runs mesa report from its own window.

const cli = cliHarness();
beforeEach(cli.reset);

test('report from a worker adds a done report for its parent; outside a window it is a usage error', async () => {
  cli.run = scriptedRunner({ tmux: fakeTmux().answer, claude: CLAUDE_VERSION }).run;
  await cli.withProject();
  const parent = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const child = (await cli.mesa('open', 'lantern-cove', '--parent', parent, '--json')).json.data
    .id as string;
  await cli.mesa('reports', '--json');

  const outside = await cli.mesa('report', 'done', 'x', '--json');
  expect(outside.code).toBe(2);
  expect(outside.json.error.message).toMatch(/no Mesa window/);
  expect((await cli.mesa('reports', '--json')).json.data.reports).toEqual([]);

  cli.env = { MESA_SESSION_ID: child, MESA_PROFILE: 'default' };
  const made = await cli.mesa(
    'report',
    'done',
    'Counted 12 tide tables; none missing',
    '--files',
    'docs/tides.md, docs/moon.md',
    '--json',
  );
  expect(made.code, made.stdout).toBe(0);
  expect(made.json.data.report).toMatchObject({
    parent,
    child,
    kind: 'done',
    outcome: 'succeeded',
    message: 'Counted 12 tide tables; none missing',
    files: ['docs/tides.md', 'docs/moon.md'],
  });
  expect((await cli.mesa('report', 'done', 'again')).stdout).toContain(
    `reported done (succeeded) to ${parent}`,
  );
  cli.env = {};
  expect((await cli.mesa('reports', parent, '--json')).json.data.reports).toMatchObject([
    { kind: 'done', message: 'again' },
  ]);
  expect((await cli.mesa('show', child, '--json')).json.data.report).toMatchObject({
    kind: 'done',
    outcome: 'succeeded',
    message: 'again',
  });
  expect((await cli.mesa('help', '--agent')).stdout).toContain('mesa report');
});

test('report question gives an id; reports lists it; reports reply types the answer once', async () => {
  const tmux = fakeTmux();
  cli.run = scriptedRunner({ tmux: tmux.answer, claude: CLAUDE_VERSION }).run;
  await cli.withProject();
  const parent = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const child = (await cli.mesa('open', 'lantern-cove', '--parent', parent, '--json')).json.data
    .id as string;
  await cli.mesa('reports', '--json');
  cli.env = { MESA_SESSION_ID: child, MESA_PROFILE: 'default' };
  const asked = await cli.mesa(
    'report',
    'question',
    'Use metres or feet for tide heights?',
    '--json',
  );
  expect(asked.code, asked.stdout).toBe(0);
  const { question } = asked.json.data;
  expect(question).toMatchObject({ parent, child, text: 'Use metres or feet for tide heights?' });
  cli.env = {};
  const listed = (await cli.mesa('reports', '--json')).json.data;
  expect(listed.questions).toMatchObject([{ id: question.id }]);
  expect(listed.reports).toMatchObject([{ kind: 'question', question: question.id }]);
  // From another session's window it is refused; a person outside one answers.
  cli.env = { MESA_SESSION_ID: child, MESA_PROFILE: 'default' };
  expect((await cli.mesa('reports', 'reply', question.id, 'Feet', '--json')).code).toBe(2);
  cli.env = {};
  const replied = await cli.mesa('reports', 'reply', question.id, 'Metres', '--json');
  expect(replied.code, replied.stdout).toBe(0);
  expect(replied.json.data.question).toMatchObject({ answer: 'Metres', answeredBy: 'person' });
  const typed = tmux.windows.find((w) => w.window === `claude-${child}`)?.typed ?? [];
  expect(typed.at(-1)).toBe(`[mesa] answer to your question ${question.id}:\nMetres`);
  expect((await cli.mesa('reports', '--json')).json.data.questions).toEqual([]);
  expect((await cli.mesa('reports', 'reply', question.id, 'Feet', '--json')).code).toBe(2);
  expect((await cli.mesa('reports', 'reply', 'q-zzzz', 'Feet', '--json')).json.error.code).toBe(
    'not_found',
  );
});

test('report --details keeps the file as an absolute path, never its content; a missing file writes nothing', async () => {
  cli.run = scriptedRunner({ tmux: fakeTmux().answer, claude: CLAUDE_VERSION }).run;
  await cli.withProject();
  const parent = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const child = (await cli.mesa('open', 'lantern-cove', '--parent', parent, '--json')).json.data
    .id as string;
  await cli.mesa('reports', '--json');
  const checkout = join(cli.home, 'tide-checkout');
  mkdirSync(join(checkout, 'docs'), { recursive: true });
  writeFileSync(join(checkout, 'docs/tides-notes.md'), 'Low water at 06:12, the reef shows.\n');
  cli.env = { MESA_SESSION_ID: child, MESA_PROFILE: 'default' };
  cli.deps = { cwd: checkout };

  const missing = await cli.mesa('report', 'done', 'x', '--details', 'nope.md', '--json');
  expect(missing.code).toBe(2);
  expect(missing.json.error.message).toBe(`no details file at ${join(checkout, 'nope.md')}`);
  expect((await cli.mesa('reports', '--json')).json.data.reports).toEqual([]);

  const long = `${'Counted 12 tide tables. '.repeat(40)}`;
  const made = await cli.mesa('report', 'done', long, '--details', 'docs/tides-notes.md', '--json');
  expect(made.code, made.stdout).toBe(0);
  expect(made.json.data.report.details).toBe(join(checkout, 'docs/tides-notes.md'));
  expect(made.json.data.report.message).toHaveLength(600);
  expect(made.stdout).not.toContain('Low water');
  expect((await cli.mesa('reports', '--json')).json.data.reports).toMatchObject([
    { child, kind: 'done', details: join(checkout, 'docs/tides-notes.md') },
  ]);
  expect((await cli.mesa('show', child, '--json')).json.data.report).toMatchObject({
    details: join(checkout, 'docs/tides-notes.md'),
  });
});
