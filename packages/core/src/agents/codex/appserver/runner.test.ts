import { describe, expect, it } from 'vitest';
import {
  INTERRUPTED_CODEX_STREAM,
  RECORDED_CODEX_STREAM,
  scriptedSpawner,
} from '../../../testing/index.js';
import { type AppServerEvent, parseAppServerLine } from './events.js';
import { startCodexRunner } from './runner.js';

const THREAD = 'th-0000-invented';
const turnStarted = {
  method: 'turn/started',
  params: { threadId: THREAD, turn: { id: 'turn-1', status: 'inProgress', items: [] } },
};
const turnCompleted = {
  method: 'turn/completed',
  params: { threadId: THREAD, turn: { id: 'turn-1', status: 'completed', items: [] } },
};

function start(resume?: string) {
  const fake = scriptedSpawner();
  const events: AppServerEvent[] = [];
  const runner = startCodexRunner(
    { spawn: fake.spawn, env: { PATH: '/bin' } },
    { cwd: '/proj', ...(resume ? { resume } : {}), args: ['-c', 'model=gpt-invented'] },
    (e) => events.push(e),
  );
  /** The handshake's answers: initialize, then the thread. */
  const open = () =>
    fake.push(
      { id: 'initialize#1', result: {} },
      { id: `${resume ? 'thread/resume' : 'thread/start'}#2`, result: { thread: { id: THREAD } } },
    );
  const methods = () => fake.sent.map((m) => m.method ?? m.result);
  return { fake, events, runner, open, methods };
}

describe('parseAppServerLine', () => {
  const events = RECORDED_CODEX_STREAM.map(parseAppServerLine);

  it('types every message of the recorded stream', () => {
    expect(events.map((e) => e.type)).toEqual([
      'response',
      'thread',
      'notification',
      'skills',
      'models',
      'turn_started',
      'item_completed',
      'item_started',
      'delta',
      'item_completed',
      'delta',
      'item_completed',
      'item_started',
      'approval',
      'resolved',
      'delta',
      'item_completed',
      'item_started',
      'item_completed',
      'delta',
      'delta',
      'item_completed',
      'token_usage',
      'notification',
      'turn_completed',
      'usage',
      'notification',
      'server_request',
      'error',
      'response',
      'other',
    ]);
  });

  it('keeps the fields Mesa reads', () => {
    expect(events[0]).toEqual({
      type: 'response',
      method: 'initialize',
      ok: true,
      error: undefined,
    });
    expect(events[1]).toEqual({ type: 'thread', threadId: THREAD, model: 'gpt-invented-codex' });
    expect(events[3]).toEqual({ type: 'skills', names: ['lantern'] });
    expect(events[4]).toEqual({
      type: 'models',
      models: [{ id: 'gpt-invented-codex', name: 'Invented Codex', isDefault: true }],
    });
    expect(events[6]).toEqual({
      type: 'item_completed',
      item: { kind: 'userMessage', id: 'u-1', text: 'make a file' },
    });
    expect(events[9]).toEqual({
      type: 'item_completed',
      item: { kind: 'reasoning', id: 'r-1', text: 'Plan the file' },
    });
    expect(events[11]).toMatchObject({ item: { kind: 'agentMessage', phase: 'commentary' } });
    expect(events[13]).toEqual({
      type: 'approval',
      requestId: '0',
      kind: 'command',
      itemId: 'c-1',
      command: 'echo tide > made.txt',
      reason: 'writes a file',
    });
    expect(events[14]).toEqual({ type: 'resolved', requestId: '0' });
    expect(events[16]).toEqual({
      type: 'item_completed',
      item: {
        kind: 'commandExecution',
        id: 'c-1',
        command: 'echo tide > made.txt',
        status: 'completed',
        output: '',
        exitCode: 0,
      },
    });
    expect(events[18]).toMatchObject({
      item: {
        kind: 'fileChange',
        changes: [{ path: 'notes.md', change: 'update', diff: '@@ -1 +1 @@\n-old\n+new' }],
      },
    });
    expect(events[22]).toEqual({
      type: 'token_usage',
      inputTokens: 1200,
      outputTokens: 80,
      cachedInputTokens: 900,
      totalTokens: 1280,
      contextWindow: 200000,
    });
    expect(events[24]).toEqual({
      type: 'turn_completed',
      turnId: 'turn-1',
      status: 'completed',
      error: undefined,
    });
    expect(events[25]).toEqual({ type: 'usage', usage: { summary: { invented: true } } });
    expect(events[27]).toEqual({
      type: 'server_request',
      requestId: '1',
      method: 'item/tool/requestUserInput',
    });
    expect(events[28]).toEqual({ type: 'error', message: 'stream lost', willRetry: true });
    expect(events[29]).toEqual({
      type: 'response',
      method: 'turn/steer',
      ok: false,
      error: 'no active turn',
    });
    expect(events[30]).toEqual({ type: 'other', raw: 'not json' });
  });

  it('types an interrupted turn and never throws on odd lines', () => {
    expect(parseAppServerLine(INTERRUPTED_CODEX_STREAM.at(-1) ?? '')).toMatchObject({
      type: 'turn_completed',
      status: 'interrupted',
    });
    for (const odd of ['[]', '42', '{}', '{"id":7}', '{"method":"item/completed"}'])
      expect(() => parseAppServerLine(odd)).not.toThrow();
    expect(parseAppServerLine('{"method":"item/completed"}')).toMatchObject({
      item: { kind: 'other' },
    });
  });
});

describe('startCodexRunner', () => {
  it('runs codex app-server with its overrides and opens a new thread after initialize', () => {
    const { fake, open, methods } = start();
    expect(fake.spawns).toEqual([
      {
        file: 'codex',
        args: ['app-server', '-c', 'model=gpt-invented'],
        cwd: '/proj',
        env: { PATH: '/bin' },
      },
    ]);
    expect(methods()).toEqual(['initialize']);
    open();
    expect(methods()).toEqual([
      'initialize',
      'initialized',
      'thread/start',
      'skills/list',
      'model/list',
    ]);
    expect(fake.sent[2]).toEqual({
      id: 'thread/start#2',
      method: 'thread/start',
      params: { cwd: '/proj' },
    });
    expect(fake.sent[3]).toMatchObject({ params: { cwds: ['/proj'] } });
  });

  it('resumes a thread by its id', () => {
    const { fake, open } = start(THREAD);
    open();
    expect(fake.sent[2]).toEqual({
      id: 'thread/resume#2',
      method: 'thread/resume',
      params: { threadId: THREAD, cwd: '/proj' },
    });
  });

  it('holds a message until the thread is open, then starts a turn with it', () => {
    const { fake, runner, open } = start();
    runner.send('hi');
    expect(fake.sent.some((m) => m.method === 'turn/start')).toBe(false);
    open();
    expect(fake.sent.find((m) => m.method === 'turn/start')).toMatchObject({
      params: { threadId: THREAD, input: [{ type: 'text', text: 'hi' }] },
    });
  });

  it('steers the running turn with a message sent mid-turn, and starts the next after it', () => {
    const { fake, runner, open } = start();
    open();
    runner.send('count');
    runner.send('stop counting');
    // Sent before turn/started: it waits for the turn id, then steers.
    expect(fake.sent.filter((m) => m.method === 'turn/steer')).toEqual([]);
    fake.push(turnStarted);
    expect(fake.sent.filter((m) => m.method === 'turn/steer')).toMatchObject([
      {
        params: { threadId: THREAD, expectedTurnId: 'turn-1', input: [{ text: 'stop counting' }] },
      },
    ]);
    runner.send('and again');
    expect(fake.sent.filter((m) => m.method === 'turn/steer')).toHaveLength(2);
    fake.push(turnCompleted);
    expect(fake.sent.at(-1)).toMatchObject({ method: 'account/usage/read' });
    runner.send('next');
    expect(fake.sent.filter((m) => m.method === 'turn/start')).toHaveLength(2);
  });

  it('lets waiting messages go when Codex refuses a turn', () => {
    const { fake, runner, open } = start();
    open();
    runner.send('first');
    runner.send('second');
    fake.push({ id: 'turn/start#5', error: { message: 'busy' } });
    expect(fake.sent.filter((m) => m.method === 'turn/start')).toHaveLength(2);
  });

  it('compacts the thread on /compact', () => {
    const { fake, runner, open } = start();
    open();
    runner.send('/compact');
    expect(fake.sent.at(-1)).toMatchObject({
      method: 'thread/compact/start',
      params: { threadId: THREAD },
    });
  });

  it('answers an approval by its id, once, and not after another client did', () => {
    const { fake, runner, open } = start();
    open();
    const ask = (id: number) => ({
      id,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: THREAD, turnId: 'turn-1', itemId: 'c-1', startedAtMs: 1 },
    });
    fake.push(ask(0), ask(1), ask(2));
    runner.allow('0', {});
    runner.allow('0', {});
    runner.deny('1', 'no');
    fake.push({ method: 'serverRequest/resolved', params: { threadId: THREAD, requestId: 2 } });
    runner.allow('2', {});
    expect(fake.sent.filter((m) => 'result' in m)).toEqual([
      { id: 0, result: { decision: 'accept' } },
      { id: 1, result: { decision: 'decline' } },
    ]);
  });

  it('interrupts the running turn only', () => {
    const { fake, runner, open } = start();
    open();
    runner.interrupt();
    expect(fake.sent.some((m) => m.method === 'turn/interrupt')).toBe(false);
    fake.push(turnStarted);
    runner.interrupt();
    expect(fake.sent.at(-1)).toMatchObject({
      method: 'turn/interrupt',
      params: { threadId: THREAD, turnId: 'turn-1' },
    });
  });

  it('reads a line cut across reads, and settles at exit after its last line', async () => {
    const { fake, runner, events } = start();
    const text = `${RECORDED_CODEX_STREAM.join('\n')}`;
    for (let i = 0; i < text.length; i += 7) fake.chunk(text.slice(i, i + 7));
    fake.end(0);
    expect(await runner.exited).toEqual({ code: 0 });
    expect(events).toEqual(RECORDED_CODEX_STREAM.map(parseAppServerLine));
  });

  it('stops by killing the process', async () => {
    const { fake, runner } = start();
    runner.stop();
    expect(fake.wasKilled()).toBe(true);
    expect(await runner.exited).toEqual({ code: undefined });
  });
});
