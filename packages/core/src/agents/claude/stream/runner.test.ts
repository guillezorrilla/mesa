import { describe, expect, it } from 'vitest';
import { lineSplitter } from '../../../lib/lines.js';
import { RECORDED_CLAUDE_STREAM, replaySpawner } from '../../../testing/index.js';
import { parseStreamLine, type StreamEvent } from './events.js';
import { claudeStreamArgs, startClaudeRunner } from './runner.js';

async function run(chunks?: number, stream?: string[]) {
  const fake = replaySpawner(stream, { chunks });
  const events: StreamEvent[] = [];
  const runner = startClaudeRunner(
    { spawn: fake.spawn, env: { PATH: '/bin' } },
    { cwd: '/proj' },
    (e) => events.push(e),
  );
  runner.send('hi');
  const exit = await runner.exited;
  return { fake, events, runner, exit };
}

describe('parseStreamLine', () => {
  it('types every event of the recorded stream', async () => {
    const { events } = await run();
    expect(events.map((e) => e.type)).toEqual([
      'init',
      'stream',
      'delta',
      'delta',
      'delta',
      'permission_request',
      'assistant',
      'user',
      'control_request',
      'control_response',
      'compact_boundary',
      'system',
      'other',
      'result',
    ]);
    expect(events[0]).toMatchObject({
      sessionId: 'c0ffee00-0000-4000-8000-000000000001',
      slashCommands: ['compact', 'context', 'lanternecho'],
      permissionMode: 'default',
    });
    expect(events.slice(2, 5)).toEqual([
      { type: 'delta', kind: 'text', text: 'Sure, ', index: 0, sidechain: false },
      { type: 'delta', kind: 'thinking', text: 'a file', index: 0, sidechain: false },
      { type: 'delta', kind: 'input_json', text: '{"file_path":', index: 1, sidechain: false },
    ]);
    expect(events[5]).toEqual({
      type: 'permission_request',
      requestId: 'req-1',
      toolName: 'Write',
      toolUseId: 'toolu_1',
      input: { file_path: 'made.txt', content: 'tide' },
    });
    expect(events[6]).toMatchObject({
      content: [{ type: 'text' }, { type: 'tool_use', name: 'Write', id: 'toolu_1' }],
    });
    expect(events[7]).toEqual({
      type: 'user',
      content: [
        { type: 'tool_result', toolUseId: 'toolu_1', content: 'File created', isError: false },
      ],
      sidechain: false,
    });
    expect(events[8]).toEqual({
      type: 'control_request',
      requestId: 'req-2',
      subtype: 'interrupt',
    });
    expect(events[9]).toEqual({
      type: 'control_response',
      requestId: 'mesa-1',
      ok: true,
      error: undefined,
    });
    expect(events[10]).toEqual({ type: 'compact_boundary', trigger: 'manual', preTokens: 44600 });
    expect(events[11]).toEqual({ type: 'system', subtype: 'background_tasks_changed' });
    expect(events[12]).toMatchObject({ type: 'other' });
    expect(events[13]).toMatchObject({
      type: 'result',
      sessionId: 'c0ffee00-0000-4000-8000-000000000001',
      isError: false,
      costUsd: 0.0123,
      usage: { inputTokens: 12, outputTokens: 80, cacheReadTokens: 900, cacheCreationTokens: 40 },
    });
  });

  it('keeps a malformed line, JSON that is not an object, and an unknown type as other', () => {
    expect(parseStreamLine('{"type":"assistant","mess')).toEqual({
      type: 'other',
      raw: '{"type":"assistant","mess',
    });
    expect(parseStreamLine('42')).toEqual({ type: 'other', raw: '42' });
    expect(parseStreamLine('{"type":"stream_event"}')).toMatchObject({ type: 'other' });
    expect(parseStreamLine('{"type":"brand_new"}')).toMatchObject({ type: 'other' });
  });

  it('reads a tool error and block content, and a bare string message', () => {
    const e = parseStreamLine(
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't', is_error: true, content: [{ text: 'no' }] },
          ],
        },
      }),
    );
    expect(e).toEqual({
      type: 'user',
      content: [{ type: 'tool_result', toolUseId: 't', content: 'no', isError: true }],
      sidechain: false,
    });
    expect(parseStreamLine('{"type":"user","message":{"content":"hi"}}')).toEqual({
      type: 'user',
      content: [{ type: 'text', text: 'hi' }],
      sidechain: false,
    });
  });
});

describe('lineSplitter', () => {
  it('waits for the rest of a line cut across reads, and flushes a last line', () => {
    const got: string[] = [];
    const s = lineSplitter((l) => got.push(l));
    s.push('{"a":');
    expect(got).toEqual([]);
    s.push('1}\n{"b":2}\n\n{"c"');
    s.push(':3}');
    s.flush();
    expect(got).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });
});

describe('startClaudeRunner', () => {
  it('parses the same events when stdout arrives in 7-character reads', async () => {
    const whole = (await run()).events;
    expect((await run(7)).events).toEqual(whole);
  });

  it('keeps a malformed line in the stream without stopping it', async () => {
    const stream = [
      RECORDED_CLAUDE_STREAM[0] as string,
      '{not json',
      RECORDED_CLAUDE_STREAM.at(-1) as string,
    ];
    const { events } = await run(undefined, stream);
    expect(events.map((e) => e.type)).toEqual(['init', 'other', 'result']);
  });

  it('starts claude in stream-json mode, resuming a session with its flags', () => {
    expect(claudeStreamArgs({})).toEqual([
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool',
      'stdio',
    ]);
    expect(
      claudeStreamArgs({
        resume: 'sid',
        model: 'haiku',
        effort: 'high',
        permissionMode: 'plan',
      }).slice(9),
    ).toEqual([
      '--resume',
      'sid',
      '--model',
      'haiku',
      '--effort',
      'high',
      '--permission-mode',
      'plan',
    ]);
  });

  it('spawns in the cwd and env it is given, and writes what Mesa sends', async () => {
    const { fake, runner, exit } = await run();
    expect(exit).toEqual({ code: 0 });
    expect(fake.spawns[0]).toMatchObject({ file: 'claude', cwd: '/proj', env: { PATH: '/bin' } });
    runner.allow('req-1', { file_path: 'made.txt' });
    runner.deny('req-2', 'no');
    runner.interrupt();
    runner.setPermissionMode('acceptEdits');
    expect(fake.sent).toEqual([
      { type: 'user', message: { role: 'user', content: 'hi' } },
      {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: 'req-1',
          response: { behavior: 'allow', updatedInput: { file_path: 'made.txt' } },
        },
      },
      {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: 'req-2',
          response: { behavior: 'deny', message: 'no' },
        },
      },
      { type: 'control_request', request_id: 'mesa-1', request: { subtype: 'interrupt' } },
      {
        type: 'control_request',
        request_id: 'mesa-2',
        request: { subtype: 'set_permission_mode', mode: 'acceptEdits' },
      },
    ]);
  });

  it('stops the process', () => {
    const fake = replaySpawner();
    const runner = startClaudeRunner(
      { spawn: fake.spawn, env: {} },
      { cwd: '/p' },
      () => undefined,
    );
    runner.stop();
    expect(fake.wasKilled()).toBe(true);
    return expect(runner.exited).resolves.toEqual({ code: undefined });
  });
});
