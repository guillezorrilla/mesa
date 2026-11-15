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
import type { NativeStep } from './responses.js';

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
    ['command', '/clear'],
    ['you', 'Thanks'],
  ]);
  expect(chat).toMatchObject({ count: 5, more: false });
  expect(chat.messages[0]?.at).toBe('2026-09-28T12:00:00.000Z');

  // The newest reply, the prompts after it, and that an older one exists.
  const newest = mesa.sessions.chat(session.id, 1);
  expect(newest.messages.map((m) => m.text)).toEqual(['Found it.', '/clear', 'Thanks']);
  expect(newest).toMatchObject({ count: 3, more: true });
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

const tool = (id: string, kind: string, newer: number): NativeStep => ({
  type: 'tool',
  id,
  kind: kind as 'read',
  name: kind === 'read' ? 'Read' : 'Bash',
  target: `${id}.ts`,
  status: 'done',
  output: '',
  newer,
});
const row = (revision: string) => ({ revision, text: revision, at: '2026-09-28T12:00:00.000Z' });

test("a gap's steps show as one run between the replies, after the prompt that started it", () => {
  const { messages } = chatMessages(
    {
      // Newest first: reply b, reply a.
      rows: [row('b'), row('a')],
      prompts: [{ revision: 'p', text: 'go', newer: 1 }],
    },
    2,
    true,
    // Newest first: after b (newer 0), and between a and b (newer 1), in time order oldest last.
    [tool('s3', 'command', 0), tool('s2', 'read', 1), tool('s1', 'read', 1)],
  );
  // Newest first: run after b, b, run before b, prompt, a.
  expect(messages.map((m) => `${m.from}:${m.text}`)).toEqual([
    'steps:Ran 1 command',
    'agent:b',
    'steps:Read 2 files',
    'you:go',
    'agent:a',
  ]);
  const run = messages[2];
  expect(run?.from === 'steps' && run.steps.map((s) => s.line)).toEqual([
    'Read s1.ts',
    'Read s2.ts',
  ]);
});

const edit = (id: string, path: string, added: number, removed: number): NativeStep => ({
  type: 'edit',
  id,
  path,
  added,
  removed,
  hunk: [],
  status: 'done',
  newer: 0,
});

test('a run lists the files its edits changed, each once with its lines summed', () => {
  const { messages } = chatMessages(
    { rows: [row('a')], prompts: [] },
    1,
    true,
    // Newest first.
    [
      edit('e3', 'src/tide.ts', 2, 0),
      tool('s1', 'read', 0),
      edit('e2', 'src/moon.ts', 1, 1),
      edit('e1', 'src/tide.ts', 3, 1),
    ],
  );
  const run = messages[0];
  expect(run?.from === 'steps' && run.edits).toEqual([
    { path: 'src/tide.ts', added: 5, removed: 1 },
    { path: 'src/moon.ts', added: 1, removed: 1 },
  ]);
  const quiet = chatMessages({ rows: [row('a')], prompts: [] }, 1, true, [tool('s1', 'read', 0)]);
  expect(quiet.messages[0]).not.toHaveProperty('edits');
});
