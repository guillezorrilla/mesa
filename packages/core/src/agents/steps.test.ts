import { appendFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

test('a transcript read again as it grows matches a full read of it', () => {
  const home = tempDir('steps-');
  const file = plantTranscript(home, 'kettle-2', '/code/kettle', [
    claudeLine('user', 'Fix the boil timer'),
  ]);
  const { messages } = AGENTS.claude.transcripts;
  // A full read: the same bytes under a name never read before.
  const fullRead = () => {
    const fresh = join(tempDir('steps-'), 'fresh.jsonl');
    copyFileSync(file, fresh);
    return messages(fresh);
  };
  const append = (...lines: (object | string)[]) =>
    appendFileSync(
      file,
      lines.map((line) => (typeof line === 'string' ? line : `\n${JSON.stringify(line)}`)).join(''),
    );

  expect(messages(file)).toEqual(fullRead());
  append(
    claudeLine('assistant', [
      { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'pnpm test' } },
    ]),
  );
  expect(messages(file).steps[0]?.step).toMatchObject({ status: 'running' });
  expect(messages(file)).toEqual(fullRead());
  // A result finishes the step read before it; a line half written is read as a full read does.
  const result = JSON.stringify(
    claudeLine('user', [{ type: 'tool_result', tool_use_id: 'tu-1', content: '2 passed' }]),
  );
  append(`\n${result.slice(0, 20)}`);
  expect(messages(file)).toEqual(fullRead());
  append(result.slice(20), claudeLine('assistant', [{ type: 'text', text: 'Fixed.' }]));
  const grown = messages(file);
  expect(grown).toEqual(fullRead());
  expect(grown.steps[0]?.step).toMatchObject({ status: 'done', output: '2 passed' });
  expect(grown.messages.at(-1)?.text).toBe('Fixed.');
  // A transcript cut shorter is read anew.
  writeFileSync(file, JSON.stringify(claudeLine('user', 'Start over')));
  expect(messages(file)).toEqual(fullRead());
  expect(messages(file).messages.map((m) => m.text)).toEqual(['Start over']);
});

test('a Codex rollout read again as it grows matches a full read of it', () => {
  const response = (payload: object) => ({ timestamp: at, type: 'response_item', payload });
  const message = (role: 'user' | 'assistant', text: string) =>
    response({
      type: 'message',
      role,
      content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }],
    });
  // Codex's startup message, which a later turn_context shows not to be the person's.
  const file = codexWorld().rollout({
    id: '01a1d249-0000-7000-8000-000000000002',
    cwd: '/code/kettle',
    startedAt: at,
    lines: [message('user', '# AGENTS.md for kettle')],
  });
  const { messages } = AGENTS.codex.transcripts;
  const fullRead = () => {
    const fresh = join(tempDir('steps-'), 'fresh.jsonl');
    copyFileSync(file, fresh);
    return messages(fresh);
  };
  const append = (...lines: object[]) =>
    appendFileSync(file, lines.map((line) => `\n${JSON.stringify(line)}`).join(''));

  expect(messages(file)).toEqual(fullRead());
  append(
    { timestamp: at, type: 'turn_context', payload: {} },
    message('user', 'Fix it'),
    response({
      type: 'function_call',
      name: 'shell',
      call_id: 'call-1',
      arguments: JSON.stringify({ command: ['bash', '-lc', 'pnpm test'] }),
    }),
  );
  expect(messages(file)).toEqual(fullRead());
  append(
    response({ type: 'function_call_output', call_id: 'call-1', output: '2 passed' }),
    message('assistant', 'Done.'),
  );
  const grown = messages(file);
  expect(grown).toEqual(fullRead());
  expect(grown.messages.map((m) => m.text)).toEqual(['Fix it', 'Done.']);
  expect(grown.steps[0]?.step).toMatchObject({ id: 'call-1', status: 'done' });
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
