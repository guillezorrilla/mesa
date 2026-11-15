import { plantTranscript } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('chat prints the prompts and replies oldest first, --count the newest replies', async () => {
  cli.withTmux();
  const dir = await cli.withProject({ layOut: false });
  const opened = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const line = (type: 'user' | 'assistant', text: string) =>
    JSON.stringify({ type, cwd: dir, message: { role: type, content: [{ type: 'text', text }] } });
  plantTranscript(
    cli.home,
    opened.agentSessionId,
    dir,
    [
      line('user', 'Find the heron'),
      line('assistant', 'Looking.'),
      line('user', 'Faster'),
      line('assistant', 'Found it.'),
    ].join('\n'),
  );

  expect((await cli.mesa('chat', opened.id)).stdout).toBe(
    'You:\nFind the heron\n\nAgent:\nLooking.\n\nYou:\nFaster\n\nAgent:\nFound it.\n',
  );
  const newest = await cli.mesa('chat', opened.id, '--count', '1', '--json');
  expect(newest.json.data).toMatchObject({
    messages: [
      { from: 'you', text: 'Faster' },
      { from: 'agent', text: 'Found it.' },
    ],
    count: 2,
    more: true,
  });
  expect((await cli.mesa('chat', opened.id, '--count', '1')).stdout).toContain(
    '(older replies: --count to see more)',
  );
  expect(await cli.mesa('chat', opened.id, '--count', 'all')).toMatchObject({
    code: 2,
    stderr: '--count must be a whole number, not all\n',
  });
});
