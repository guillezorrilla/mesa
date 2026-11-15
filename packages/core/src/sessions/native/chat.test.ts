import { expect, test } from 'vitest';
import {
  CLAUDE_VERSION,
  codexWorld,
  fakeTmux,
  plantTranscript,
  projectProfile,
  scriptedRunner,
  testStore,
} from '../../testing/index.js';
import { chatMessages } from './chat.js';

const THREAD = '01a0e14e-be41-72f1-a81b-e25d2198602a';

/** A session open in the test profile, with Codex's home in its environment. */
async function opened() {
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const codex = codexWorld();
  const profile = projectProfile(run, { env: codex.env });
  const session = (await profile.mesa.sessions.open('lantern-cove')).result;
  return { ...profile, codex, session };
}

test("a Claude Code session's chat is its prompts and replies oldest first, without tool results or injected text", async () => {
  const { home, dir, mesa, session } = await opened();
  const line = (type: 'user' | 'assistant', content: unknown, second: number) =>
    JSON.stringify({
      type,
      timestamp: `2026-09-28T12:00:0${second}.000Z`,
      cwd: dir,
      message: { role: type, content },
    });
  plantTranscript(
    home,
    session.agentSessionId ?? '',
    dir,
    [
      line('user', 'Find the heron', 0),
      line('assistant', [{ type: 'text', text: 'Looking.' }], 1),
      line('user', [{ type: 'tool_result', content: 'heron.txt' }], 2),
      line('assistant', [{ type: 'text', text: 'Found it.' }], 3),
      line('user', '<command-name>/clear</command-name>', 4),
      line('user', [{ type: 'text', text: 'Thanks' }], 5),
    ].join('\n'),
  );

  const chat = mesa.sessions.chat(session.id);
  expect(chat.messages.map((m) => [m.from, m.text])).toEqual([
    ['you', 'Find the heron'],
    ['agent', 'Looking.'],
    ['agent', 'Found it.'],
    ['you', 'Thanks'],
  ]);
  expect(chat).toMatchObject({ count: 4, more: false });
  expect(chat.messages[0]?.at).toBe('2026-09-28T12:00:00.000Z');

  // The newest reply, the prompts after it, and that an older one exists.
  const newest = mesa.sessions.chat(session.id, 1);
  expect(newest.messages.map((m) => m.text)).toEqual(['Found it.', 'Thanks']);
  expect(newest).toMatchObject({ count: 2, more: true });
  expect(() => mesa.sessions.chat(session.id, 0)).toThrow('count must be');
});

test("a Codex session's chat reads its rollout, leaving out what Codex injects", async () => {
  const { home, mesa, codex, session } = await opened();
  testStore(home).update(session.id, { agent: 'codex', agentSessionId: THREAD });
  const item = (role: 'user' | 'assistant', text: string) => ({
    type: 'response_item',
    timestamp: '2026-09-28T12:00:00.000Z',
    payload: {
      type: 'message',
      role,
      content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }],
    },
  });
  codex.rollout({
    id: THREAD,
    cwd: '/src/lantern-cove',
    startedAt: '2026-09-28T11:59:00.000Z',
    lines: [
      { type: 'turn_context', payload: {} },
      item('user', '<environment_context>cwd</environment_context>'),
      item('user', 'Wire the lantern relay'),
      item('assistant', 'Relay wired.'),
    ],
  });
  const chat = mesa.sessions.chat(session.id);
  expect(chat.messages.slice(-2).map((m) => [m.from, m.text])).toEqual([
    ['you', 'Wire the lantern relay'],
    ['agent', 'Relay wired.'],
  ]);
  expect(chat.messages.map((m) => m.text)).not.toContain(
    '<environment_context>cwd</environment_context>',
  );
});

test('a session with no transcript yet has an empty chat that says why', async () => {
  const { mesa, session } = await opened();
  expect(mesa.sessions.chat(session.id)).toEqual({
    messages: [],
    count: 0,
    more: false,
    unavailable: 'Native transcript is not available',
  });
});

test('the phone asks for replies only, an older phone that cannot show prompts', () => {
  const read = {
    rows: [{ revision: 'r2', text: 'Found it.' }],
    prompts: [{ revision: 'p1', text: 'Thanks', newer: 0 }],
  };
  expect(chatMessages(read, 5, false).messages.map((m) => m.text)).toEqual(['Found it.']);
  expect(chatMessages(read, 5).messages.map((m) => m.text)).toEqual(['Thanks', 'Found it.']);
});
