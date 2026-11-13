import { expect, test } from 'vitest';
import { codexWorld, plantTranscript, tempDir } from '../testing/index.js';
import { AGENTS } from './agents.js';

const at = '2026-11-10T09:00:00.000Z';
const claudeLine = (type: 'user' | 'assistant', content: unknown, extra: object = {}) => ({
  type,
  uuid: `${type}-${JSON.stringify(content).length}`,
  timestamp: at,
  cwd: '/code/kettle',
  message: { role: type, content },
  ...extra,
});

test("Claude Code's tool calls, edits and thinking are read between its messages", () => {
  const home = tempDir('steps-');
  const file = plantTranscript(home, 'kettle-1', '/code/kettle', [
    claudeLine('user', 'Fix the boil timer'),
    claudeLine(
      'assistant',
      [
        { type: 'thinking', thinking: 'The timer rounds down.\nCheck boil.ts first.' },
        { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'pnpm test\n# all' } },
      ],
      { uuid: 'think-1' },
    ),
    claudeLine('user', [{ type: 'tool_result', tool_use_id: 'tu-1', content: '2 passed' }]),
    claudeLine('assistant', [
      {
        type: 'tool_use',
        id: 'tu-2',
        name: 'Edit',
        input: {
          // Claude Code writes the path whole; it reads relative to its folder.
          file_path: '/code/kettle/src/boil.ts',
          old_string: 'a\nfloor(t)\nb',
          new_string: 'a\nround(t)\nb',
        },
      },
      { type: 'tool_use', id: 'tu-3', name: 'Grep', input: { pattern: 'floor' } },
    ]),
    claudeLine('user', [
      { type: 'tool_result', tool_use_id: 'tu-2', content: 'ok' },
      { type: 'tool_result', tool_use_id: 'tu-3', content: 'no match', is_error: true },
    ]),
    claudeLine('assistant', [{ type: 'tool_use', id: 'tu-4', name: 'Read', input: {} }], {
      isSidechain: true,
    }),
    claudeLine('assistant', [{ type: 'text', text: 'The timer **rounds** now.' }]),
  ]);

  const { messages, steps } = AGENTS.claude.transcripts.messages(file);
  expect(messages.map((m) => m.role)).toEqual(['user', 'user', 'user', 'assistant']);
  expect(steps.map(({ step, before }) => [step.type, step.id, before])).toEqual([
    ['thought', 'think-1:0', 1],
    ['tool', 'tu-1', 1],
    ['edit', 'tu-2', 2],
    ['tool', 'tu-3', 2],
  ]);
  expect(steps[1]?.step).toMatchObject({
    kind: 'command',
    name: 'Bash',
    target: 'pnpm test',
    status: 'done',
    output: '2 passed',
  });
  expect(steps[2]?.step).toEqual({
    type: 'edit',
    id: 'tu-2',
    path: 'src/boil.ts',
    added: 1,
    removed: 1,
    hunk: [' a', '-floor(t)', '+round(t)', ' b'],
    status: 'done',
  });
  expect(steps[3]?.step).toMatchObject({ kind: 'search', target: 'floor', status: 'failed' });
});

test("Codex's calls, apply_patch edits and reasoning summaries are read between its messages", () => {
  const world = codexWorld();
  const response = (payload: object) => ({ timestamp: at, type: 'response_item', payload });
  const file = world.rollout({
    id: '01a1d249-0000-7000-8000-000000000001',
    cwd: '/code/kettle',
    startedAt: at,
    lines: [
      { timestamp: at, type: 'turn_context', payload: {} },
      response({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Fix it' }],
      }),
      response({
        type: 'reasoning',
        id: 'rs-1',
        summary: [{ type: 'summary_text', text: 'Look at the timer' }],
      }),
      response({ type: 'reasoning', id: 'rs-2', summary: [], encrypted_content: 'x' }),
      response({
        type: 'function_call',
        name: 'shell',
        call_id: 'call-1',
        arguments: JSON.stringify({ command: ['bash', '-lc', 'pnpm test'] }),
      }),
      response({
        type: 'function_call_output',
        call_id: 'call-1',
        output: JSON.stringify({ output: '1 failed', metadata: { exit_code: 1 } }),
      }),
      response({
        type: 'custom_tool_call',
        name: 'apply_patch',
        call_id: 'call-2',
        input: [
          '*** Begin Patch',
          '*** Update File: src/boil.ts',
          '@@',
          '-floor(t)',
          '+round(t)',
          '*** Add File: src/boil.test.ts',
          '+test()',
          '*** End Patch',
        ].join('\n'),
      }),
      response({ type: 'custom_tool_call_output', call_id: 'call-2', output: 'Success.' }),
      response({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Done.' }],
      }),
    ],
  });

  const { messages, steps } = AGENTS.codex.transcripts.messages(file);
  expect(messages.at(-1)?.text).toBe('Done.');
  expect(steps.map(({ step }) => step)).toMatchObject([
    { type: 'thought', id: 'rs-1', text: 'Look at the timer' },
    { type: 'tool', id: 'call-1', kind: 'command', target: 'pnpm test', status: 'failed' },
    { type: 'edit', id: 'call-2', path: 'src/boil.ts', added: 1, removed: 1, status: 'done' },
    { type: 'edit', id: 'call-2:1', path: 'src/boil.test.ts', added: 1, status: 'done' },
  ]);
});
