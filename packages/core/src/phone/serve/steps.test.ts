import { expect, test } from 'vitest';
import type { NativeStep } from '../../sessions/native/responses.js';
import {
  CLAUDE_VERSION,
  fakeTmux,
  plantTranscript,
  projectProfile,
  scriptedRunner,
} from '../../testing/index.js';
import { MAX_STEPS, phoneSteps, stepText } from './steps.js';

test("a session's steps are placed among its replies as its prompts are", async () => {
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const { home, dir, mesa } = projectProfile(run);
  const opened = (await mesa.sessions.open('lantern-cove')).result;
  const line = (type: 'user' | 'assistant', content: unknown) => ({
    type,
    uuid: `${type}-${JSON.stringify(content).length}`,
    message: { role: type, content },
  });
  const tool = (id: string) => ({ type: 'tool_use', id, name: 'Bash', input: { command: id } });
  plantTranscript(home, opened.agentSessionId ?? '', dir, [
    line('user', 'Chart the tide'),
    line('assistant', [tool('first')]),
    line('assistant', [{ type: 'text', text: 'Charted.' }]),
    line('user', 'Now the moon'),
    line('assistant', [tool('second'), tool('third')]),
    line('assistant', [{ type: 'text', text: 'Moon added.' }]),
  ]);

  const { steps } = mesa.sessions.responses.list(opened.id);
  // Newest first, each with how many replies are newer: one after second and third, two after first.
  expect(steps.map((step) => [step.id, step.newer])).toEqual([
    ['third', 1],
    ['second', 1],
    ['first', 2],
  ]);
});

test('the step an agent is on now is its last, with no result and nothing said after it', async () => {
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const { home, dir, mesa } = projectProfile(run);
  const opened = (await mesa.sessions.open('lantern-cove')).result;
  const line = (type: 'user' | 'assistant', content: unknown) => ({
    type,
    uuid: `${type}-${JSON.stringify(content)}`,
    message: { role: type, content },
  });
  const bash = (id: string) =>
    line('assistant', [{ type: 'tool_use', id, name: 'Bash', input: { command: 'pnpm test' } }]);
  const result = (id: string) =>
    line('user', [{ type: 'tool_result', tool_use_id: id, content: 'ok' }]);
  const current = (lines: object[]) => {
    plantTranscript(home, opened.agentSessionId ?? '', dir, [
      line('user', 'Chart the tide'),
      ...lines,
    ]);
    return mesa.sessions.responses.list(opened.id).current;
  };

  expect(current([bash('run-1')])).toBe('run-1');
  expect(current([bash('run-1'), result('run-1')])).toBeUndefined();
  expect(
    current([
      bash('run-1'),
      result('run-1'),
      line('assistant', [{ type: 'thinking', thinking: 'Next, the moon.' }]),
    ]),
  ).toMatch(/^assistant-.*Next, the moon.*:0$/);
  // A call left without a result by a stop is not current once the person speaks again.
  expect(current([bash('run-1'), line('user', 'Stop, chart the moon')])).toBeUndefined();
  expect(
    current([
      bash('run-1'),
      result('run-1'),
      line('assistant', [{ type: 'text', text: 'Charted.' }]),
    ]),
  ).toBeUndefined();
});

const tool = (id: string, newer: number): NativeStep => ({
  type: 'tool',
  id,
  kind: 'command',
  name: 'Bash',
  target: 'x'.repeat(400),
  status: 'done',
  output: 'all 12 passed',
  newer,
});

test('a detail carries each step as its row, not its output, among the replies it holds', () => {
  const thought: NativeStep = {
    type: 'thought',
    id: 't',
    text: '\nThe tide table is in feet.\nConvert it.',
    newer: 0,
  };
  const edit: NativeStep = {
    type: 'edit',
    id: 'e',
    path: 'src/tide.ts',
    added: 2,
    removed: 1,
    hunk: ['-feet', '+metres', '+round'],
    status: 'done',
    newer: 1,
  };
  const rows = phoneSteps([thought, edit, tool('old', 3)], 2);
  expect(rows).toEqual([
    { type: 'thought', id: 't', newer: 0, line: 'The tide table is in feet.' },
    { type: 'edit', id: 'e', newer: 1, path: 'src/tide.ts', added: 2, removed: 1, status: 'done' },
  ]);
  expect(phoneSteps([tool('a', 0)], 1)[0]).toMatchObject({ kind: 'command', status: 'done' });
  expect(JSON.stringify(phoneSteps([tool('a', 0)], 1))).not.toContain('all 12 passed');
  expect((phoneSteps([tool('a', 0)], 1)[0] as { target: string }).target).toHaveLength(160);
  expect(
    phoneSteps(
      Array.from({ length: 90 }, (_, n) => tool(`${n}`, 0)),
      1,
    ),
  ).toHaveLength(MAX_STEPS);

  expect(stepText(tool('a', 0))).toBe('all 12 passed');
  expect(stepText(edit)).toBe('-feet\n+metres\n+round');
  expect(stepText(thought)).toBe(thought.text);
});
