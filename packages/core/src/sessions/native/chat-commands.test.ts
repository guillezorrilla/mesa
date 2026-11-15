import { expect, test } from 'vitest';
import {
  CLAUDE_VERSION,
  fakeTmux,
  plantTranscript,
  projectProfile,
  scriptedRunner,
} from '../../testing/index.js';

test('a slash command and its output are one command row in the chat, never a prompt', async () => {
  const run = scriptedRunner({ tmux: fakeTmux().answer, claude: CLAUDE_VERSION }).run;
  const { home, dir, mesa } = projectProfile(run);
  const opened = (await mesa.sessions.open('lantern-cove')).result;
  let second = 0;
  const timestamp = () => `2026-09-28T12:00:${String(second++).padStart(2, '0')}.000Z`;
  const line = (type: 'user' | 'assistant', content: unknown) =>
    JSON.stringify({ type, timestamp: timestamp(), cwd: dir, message: { role: type, content } });
  // Claude Code 2.1 writes a command as system lines, and a copy of its output for the model.
  const local = (content: string) =>
    JSON.stringify({ type: 'system', subtype: 'local_command', timestamp: timestamp(), content });
  const meta = (content: string) =>
    JSON.stringify({
      type: 'user',
      isMeta: true,
      timestamp: timestamp(),
      message: { role: 'user', content },
    });
  plantTranscript(
    home,
    opened.agentSessionId ?? '',
    dir,
    [
      line('user', 'Find the heron'),
      line('assistant', [{ type: 'text', text: 'Found it.' }]),
      local(
        '<command-name>/model</command-name>\n  <command-message>model</command-message>\n  <command-args>wren</command-args>',
      ),
      local('<local-command-stdout>Set model to \x1b[1mWren\x1b[22m</local-command-stdout>'),
      meta('## Model\n\nSet to Wren'),
      line('user', '<command-name>/kestrel</command-name>\n  <command-args></command-args>'),
      line('user', '<local-command-stderr>Unknown command: /kestrel</local-command-stderr>'),
      line('user', '<command-name>/clear</command-name>'),
      line('user', 'Thanks'),
      line('assistant', [{ type: 'text', text: 'Any time.' }]),
    ].join('\n'),
  );
  const chat = mesa.sessions.chat(opened.id);
  expect(chat.messages.map(({ id: _id, at: _at, ...message }) => message)).toEqual([
    { from: 'you', text: 'Find the heron' },
    { from: 'agent', text: 'Found it.' },
    { from: 'command', text: '/model wren', output: 'Set model to \x1b[1mWren\x1b[22m' },
    { from: 'command', text: '/kestrel', output: 'Unknown command: /kestrel', error: true },
    { from: 'command', text: '/clear' },
    { from: 'you', text: 'Thanks' },
    { from: 'agent', text: 'Any time.' },
  ]);
});
