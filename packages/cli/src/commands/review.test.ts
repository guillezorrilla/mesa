import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitRepo, isolateGit, plantTranscript, withRealGit } from '@mesa/core/testing';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
isolateGit({ beforeAll, afterAll });
beforeEach(cli.reset);

test('review responses, preview and send use the public CLI and guarded send path', async () => {
  const world = cli.withTmux();
  const dir = await cli.withProject({ layOut: false });
  const opened = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const line = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-09-28T12:00:00.000Z',
    cwd: dir,
    message: { role: 'assistant', content: [{ type: 'text', text: 'A violet otter.' }] },
  });
  plantTranscript(cli.home, opened.agentSessionId, dir, line);
  const listed = await cli.mesa('review', 'responses', opened.id, '--json');
  expect(listed.json).toMatchObject({ ok: true, data: { rows: [{ text: 'A violet otter.' }] } });
  const row = listed.json.data.rows[0];
  const flags = [
    '--source',
    row.source,
    '--revision',
    row.revision,
    '--selection-profile',
    row.profile,
    '--start',
    '2',
    '--end',
    '14',
    '--comment',
    'Check this claim.',
  ];
  const preview = await cli.mesa('review', 'preview', opened.id, ...flags, '--json');
  expect(preview.json.data).toMatchObject({ passage: 'violet otter', target: opened.id });
  const sent = await cli.mesa('review', 'send', opened.id, ...flags, '--no-from', '--json');
  expect(sent.json.data).toMatchObject({ status: 'delivered', target: opened.id });
  expect(
    (await cli.mesa('review', 'send', opened.id, ...flags, '--no-from', '--json')).json.data,
  ).toMatchObject({
    status: 'delivered',
    already: true,
  });
  expect(world.windows[0]?.typed).toEqual([preview.json.data.prompt]);
});

test('selected Git hunk review pins HEAD and patch, and sends once to the agent', async () => {
  const repo = await cli.withProject();
  const file = join(repo, 'review.txt');
  writeFileSync(file, 'before\n');
  gitRepo(repo);
  const world = cli.withTmux();
  cli.run = withRealGit(cli.run);
  const opened = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  writeFileSync(file, 'after\n');

  const listed = await cli.mesa('review', 'changes', opened.id, 'review.txt', '--json');
  expect(listed.json.data).toMatchObject({
    session: opened.id,
    path: 'review.txt',
    hunks: [{ index: 0, header: expect.stringContaining('@@') }],
  });
  const change = listed.json.data;
  const flags = [
    '--path',
    'review.txt',
    '--source',
    change.source,
    '--revision',
    change.revision,
    '--selection-profile',
    change.profile,
    '--hunk',
    '0',
    '--comment',
    'Please check this edit.',
  ];
  const preview = await cli.mesa('review', 'change-preview', opened.id, ...flags, '--json');
  expect(preview.json.data).toMatchObject({ base: change.base, path: 'review.txt' });
  expect(preview.json.data.prompt).toContain('HEAD');
  const sent = await cli.mesa('review', 'change-send', opened.id, ...flags, '--no-from', '--json');
  expect(sent.json.data).toMatchObject({ status: 'delivered', target: opened.id });
  expect(
    (await cli.mesa('review', 'change-send', opened.id, ...flags, '--no-from', '--json')).json.data,
  ).toMatchObject({ already: true });
  expect(world.windows[0]?.typed).toEqual([preview.json.data.prompt]);

  writeFileSync(file, 'changed again\n');
  expect(
    (await cli.mesa('review', 'change-preview', opened.id, ...flags, '--json')).json,
  ).toMatchObject({
    ok: false,
    error: { code: 'locked' },
  });
  expect(world.windows[0]?.typed).toHaveLength(1);
});
