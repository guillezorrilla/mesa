import { plantTranscript } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('mesa chat prints a slash command as one command row: --json from "command", text without colours', async () => {
  cli.withTmux();
  const dir = await cli.withProject({ layOut: false });
  const opened = (await mesa('open', 'lantern-cove', '--json')).json.data;
  const line = (at: string, content: string) =>
    JSON.stringify({ type: 'user', timestamp: at, cwd: dir, message: { role: 'user', content } });
  plantTranscript(
    cli.home,
    opened.agentSessionId,
    dir,
    [
      line('2026-09-28T12:00:00.000Z', '<command-name>/cost</command-name>'),
      line(
        '2026-09-28T12:00:01.000Z',
        '<local-command-stdout>\x1b[1mTotal\x1b[22m $0.42</local-command-stdout>',
      ),
    ].join('\n'),
  );
  const shown = (await mesa('chat', opened.id, '--json')).json.data;
  expect(shown.messages).toMatchObject([
    { from: 'command', text: '/cost', output: '\x1b[1mTotal\x1b[22m $0.42' },
  ]);
  expect((await mesa('chat', opened.id)).stdout).toBe('Command: /cost\nTotal $0.42\n');
});
