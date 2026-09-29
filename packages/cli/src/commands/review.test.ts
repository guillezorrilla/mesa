import { plantTranscript } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
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
  expect(sent.json.data).toMatchObject({ sent: true, session: opened.id });
  expect(world.windows[0]?.typed).toEqual([preview.json.data.prompt]);
});
