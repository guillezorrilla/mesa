import type { Stdio } from '@mesa/core';
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

test('chat lists the tools the agent ran between replies as one Steps run', async () => {
  cli.withTmux();
  const dir = await cli.withProject({ layOut: false });
  const opened = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const at = (type: 'user' | 'assistant', content: unknown) =>
    JSON.stringify({ type, cwd: dir, message: { role: type, content } });
  plantTranscript(
    cli.home,
    opened.agentSessionId,
    dir,
    [
      at('user', [{ type: 'text', text: 'Count the herons' }]),
      at('assistant', [
        { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
        { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'pwd' } },
      ]),
      at('assistant', [{ type: 'text', text: 'Two.' }]),
    ].join('\n'),
  );
  const chat = (await cli.mesa('chat', opened.id)).stdout;
  expect(chat).toContain('Steps:\nRan 2 commands');
  expect(chat).not.toContain('Agent:\nRan');
});

test('chat --follow prints a Terminal session chat as one JSON line, then ends', async () => {
  cli.withTmux();
  await cli.withProject();
  const plain = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const started = await cli.mesa('chat', plain.id, '--follow');
  expect([started.code, started.stdout, started.stderr]).toEqual([0, '', '']);
  const written: string[] = [];
  await (started.serve as (io: Stdio) => Promise<void>)({
    lines: (async function* () {})(),
    write: (text) => written.push(text),
    log: () => undefined,
  });
  expect(written.map((line) => JSON.parse(line).type)).toEqual(['chat']);
});

test('chat --follow runs a request on stdin for its own session in this process, and refuses others', async () => {
  cli.withTmux();
  await cli.withProject();
  const plain = (await cli.mesa('open', 'lantern-cove', '--json')).json.data;
  const started = await cli.mesa('chat', plain.id, '--follow');
  const written: string[] = [];
  const run = (id: string, argv: string[]) => JSON.stringify({ type: 'run', id, argv });
  await (started.serve as (io: Stdio) => Promise<void>)({
    lines: (async function* () {
      yield run('r1', ['send', '--no-from', '--', plain.id, 'chart the tide']);
      yield run('r2', ['send', '--no-from', '--', 'zzzzzzzz', 'chart the tide']);
      yield run('r3', ['rename', '--', plain.id, 'tides']);
      yield 'not json';
    })(),
    write: (text) => written.push(text),
    log: () => undefined,
  });
  await new Promise((done) => setTimeout(done, 200));
  const replies = written.map((line) => JSON.parse(line)).filter((line) => line.type === 'reply');
  expect(replies.map((r) => [r.id, r.reply.ok])).toEqual([
    ['r2', false],
    ['r3', false],
    ['r1', true],
  ]);
  expect(replies[0].reply.error.message).toBe(
    `a chat's follow runs only ${plain.id}'s chat actions`,
  );
  expect(replies[2].reply.data).toMatchObject({ sent: true, session: plain.id });
});
