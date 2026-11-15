import { describe, expect, it } from 'vitest';
import { AGENTS } from '../../agents/agents.js';
import type { Spawner } from '../../lib/spawn.js';
import { createMesa } from '../../mesa.js';
import {
  agentWorld,
  NATIVE_LAUNCH,
  plantTranscript,
  profilePaths,
  projectProfile,
  RECORDED_CLAUDE_STREAM,
  replaySpawner,
  scriptedRunner,
  scriptedSpawner,
  shortTempDir,
  testDeps,
  testStore,
} from '../../testing/index.js';
import { readJournal } from './journal.js';
import { askHost, hostSocket } from './socket.js';

/** A profile with lantern-cove, agents and tmux in memory, and claude's process from `fake`. */
function world<F extends { spawn: Spawner }>(
  fake: F = replaySpawner(RECORDED_CLAUDE_STREAM, { stay: true }) as unknown as F,
) {
  const agents = agentWorld();
  const { home, mesa } = projectProfile(agents.run, {
    home: shortTempDir(),
    spawn: fake.spawn,
  });
  return { home, mesa, agents, fake, paths: profilePaths(home, 'default') };
}

async function openStructured(
  w: { mesa: ReturnType<typeof world>['mesa'] },
  goal = 'make a file',
  agent?: 'codex',
) {
  const { result } = await w.mesa.sessions.open('lantern-cove', {
    view: 'structured',
    goal,
    ...(agent ? { agent } : {}),
  });
  return result;
}

describe('opening a Structured session', () => {
  it('runs mesa host in its window and keeps the view on its record', async () => {
    const w = world();
    const record = await openStructured(w);
    expect(record.view).toBe('structured');
    expect(w.agents.tmux.opened[0]?.launch).toContain(`'/usr/local/bin/mesa' host ${record.id}`);
    expect(w.agents.tmux.opened[0]?.launch).not.toContain('claude --session-id');
  });

  it('starts as today without --view, and Structured when the profile defaults to it', async () => {
    const w = world();
    const { result: plain } = await w.mesa.sessions.open('lantern-cove');
    expect(plain.view).toBeUndefined();
    expect(w.agents.tmux.opened[0]?.launch).toContain('claude --session-id');
    w.mesa.config.set('terminal.sessionView', 'structured');
    const { result: defaulted } = await w.mesa.sessions.open('lantern-cove');
    expect(defaulted.view).toBe('structured');
  });

  it('refuses Structured for an agent without it, and with --background', async () => {
    const w = world();
    await expect(
      w.mesa.sessions.open('lantern-cove', { view: 'structured', agent: 'antigravity' }),
    ).rejects.toThrow(/no Structured view/);
    await expect(
      w.mesa.sessions.open('lantern-cove', { view: 'structured', background: true }),
    ).rejects.toThrow(/--view structured cannot use/);
  });
});

describe('mesa host', () => {
  it('starts claude under the session id, sends the goal, journals, and shows a status', async () => {
    const w = world();
    const record = await openStructured(w);
    const written: string[] = [];
    const host = await w.mesa.sessions.host(record.id, (t) => written.push(t));
    const spawned = w.fake.spawns[0];
    expect(spawned?.file).toBe('claude');
    expect(spawned?.args).toEqual(
      expect.arrayContaining(['--session-id', record.agentSessionId, '--permission-prompt-tool']),
    );
    expect(spawned?.args).not.toContain('--resume');
    expect(w.fake.sent[0]).toEqual({
      type: 'user',
      message: { role: 'user', content: 'make a file' },
    });
    const journal = (readJournal(w.paths.journals, record.id) ?? []).map((l) => JSON.parse(l));
    expect(journal[0]).toMatchObject({ sent: { type: 'user', text: 'make a file' } });
    expect(journal.filter((e) => 'event' in e)).toHaveLength(RECORDED_CLAUDE_STREAM.length);
    expect(written.join('')).toContain('Structured view - claude-sonnet-5-5 - idle - $0.01');
    host.stop();
    expect(await host.done).toEqual({ code: undefined });
  });

  it('answers messages on its socket and closes it when the agent ends', async () => {
    const w = world();
    const record = await openStructured(w);
    const host = await w.mesa.sessions.host(record.id, () => undefined);
    const socket = hostSocket(w.paths.hosts, record.id);
    expect(await askHost(socket, { type: 'send', text: 'and another' })).toEqual({
      ok: true,
      queued: false,
    });
    expect(await askHost(socket, { type: 'interrupt' })).toEqual({ ok: true });
    expect(await askHost(socket, { type: 'allow', requestId: 'req-1', input: { a: 1 } })).toEqual({
      ok: true,
    });
    expect(w.fake.sent.slice(1).map((m) => m.type)).toEqual([
      'user',
      'control_request',
      'control_response',
    ]);
    const sent = (readJournal(w.paths.journals, record.id) ?? [])
      .map((l) => JSON.parse(l))
      .filter((e) => e.sent);
    expect(sent.map((e) => e.sent.type)).toEqual(['user', 'user', 'interrupt', 'allow']);
    expect(await askHost(socket, { type: 'stop' })).toEqual({ ok: true });
    await host.done;
    expect(await askHost(socket, { type: 'ping' })).toBeUndefined();
  });

  it('reports a message sent mid-turn as queued', async () => {
    const w = world(replaySpawner([], { stay: true }));
    const record = await openStructured(w);
    const host = await w.mesa.sessions.host(record.id, () => undefined);
    const socket = hostSocket(w.paths.hosts, record.id);
    // The goal's turn has no result yet.
    expect(await askHost(socket, { type: 'send', text: 'also this' })).toEqual({
      ok: true,
      queued: true,
    });
    host.stop();
    await host.done;
  });

  it('resumes a conversation that has a transcript, sending no goal', async () => {
    const w = world();
    const record = await openStructured(w);
    plantTranscript(w.home, record.agentSessionId ?? '', w.home);
    const host = await w.mesa.sessions.host(record.id, () => undefined);
    expect(w.fake.spawns[0]?.args).toEqual(
      expect.arrayContaining(['--resume', record.agentSessionId]),
    );
    expect(w.fake.sent).toEqual([]);
    host.stop();
    await host.done;
  });

  it('refuses a second host, and a claude already running the conversation', async () => {
    const w = world();
    const record = await openStructured(w);
    const first = await w.mesa.sessions.host(record.id, () => undefined);
    await expect(w.mesa.sessions.host(record.id, () => undefined)).rejects.toThrow(
      /a host already runs/,
    );
    // Refused before it started a claude of its own.
    expect(w.fake.spawns).toHaveLength(1);
    first.stop();
    await first.done;

    // The same profile, where claude's listing shows its TUI on the conversation.
    const listing = JSON.stringify([
      { pid: 77, cwd: w.home, startedAt: 1, sessionId: record.agentSessionId, status: 'idle' },
    ]);
    const withTui = createMesa(
      'default',
      testDeps(w.home, { run: scriptedRunner({ claude: listing }).run, spawn: w.fake.spawn }),
    );
    await expect(withTui.sessions.host(record.id, () => undefined)).rejects.toThrow(
      /claude already runs .*pid 77/,
    );
  });

  it('refuses a session that is not Structured', async () => {
    const w = world();
    const { result } = await w.mesa.sessions.open('lantern-cove');
    await expect(w.mesa.sessions.host(result.id, () => undefined)).rejects.toThrow(
      /not a Structured Claude Code or Codex session/,
    );
  });

  it('gives mesa logs the journal of a Structured session', async () => {
    const w = world(replaySpawner(RECORDED_CLAUDE_STREAM));
    const record = await openStructured(w);
    const host = await w.mesa.sessions.host(record.id, () => undefined);
    await host.done;
    const log = w.mesa.sessions.logs(record.id, 1);
    expect(log.path).toMatch(/journals/);
    expect(JSON.parse(log.lines[0] ?? '')).toMatchObject({ event: { type: 'result' } });
  });
});

describe('mesa host for Codex', () => {
  const THREAD = 'th-0000-invented';
  const open = (fake: ReturnType<typeof scriptedSpawner>) =>
    fake.push(
      { id: 'initialize#1', result: {} },
      { id: 'thread/start#2', result: { thread: { id: THREAD }, model: 'gpt-invented-codex' } },
    );

  it('opens a Structured Codex session with no thread id yet, its window running mesa host', async () => {
    const w = world(scriptedSpawner());
    const record = await openStructured(w, 'make a file', 'codex');
    expect(record).toMatchObject({ agent: 'codex', view: 'structured' });
    expect(record.agentSessionId).toBeUndefined();
    expect(w.agents.tmux.opened[0]?.launch).toContain(`host ${record.id}`);
  });

  it('starts codex app-server, keeps the thread id on the record, sends the goal and goes idle', async () => {
    const w = world(scriptedSpawner());
    w.mesa.config.set('agents.codex.approvalPolicy', 'on-request');
    const record = await openStructured(w, 'make a file', 'codex');
    const written: string[] = [];
    const host = await w.mesa.sessions.host(record.id, (t) => written.push(t));
    expect(w.fake.spawns[0]?.file).toBe('codex');
    expect(w.fake.spawns[0]?.args.slice(0, 3)).toEqual([
      'app-server',
      '-c',
      'approval_policy="on-request"',
    ]);
    expect(w.fake.spawns[0]?.args).toEqual(
      expect.arrayContaining([expect.stringMatching(/^mcp_servers\./)]),
    );
    open(w.fake);
    expect(testStore(w.home).get(record.id).agentSessionId).toBe(THREAD);
    expect(w.fake.sent.find((m) => m.method === 'turn/start')).toMatchObject({
      params: { threadId: THREAD, input: [{ text: 'make a file' }] },
    });
    w.fake.push(
      {
        method: 'turn/started',
        params: { threadId: THREAD, turn: { id: 't1', status: 'inProgress', items: [] } },
      },
      {
        method: 'turn/completed',
        params: { threadId: THREAD, turn: { id: 't1', status: 'completed', items: [] } },
      },
    );
    expect(written.at(-1)).toContain('Structured view - gpt-invented-codex - idle');
    const socket = hostSocket(w.paths.hosts, record.id);
    expect(await askHost(socket, { type: 'mode', mode: 'plan' })).toEqual({
      ok: false,
      error: 'codex has no permission modes to set',
    });
    w.fake.push({
      id: 0,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: THREAD,
        turnId: 't2',
        itemId: 'c-1',
        command: `echo ${'x'.repeat(80)}\nmore`,
        startedAtMs: 1,
      },
    });
    expect(written.at(-1)).toMatch(/waiting for permission: echo x+\S*$/);
    expect(written.at(-1)?.length).toBeLessThan(140);
    const journal = (readJournal(w.paths.journals, record.id) ?? []).map((l) => JSON.parse(l));
    expect(journal.filter((e) => 'event' in e).map((e) => e.event.id ?? e.event.method)).toEqual([
      'initialize#1',
      'thread/start#2',
      'turn/started',
      'turn/completed',
      0,
    ]);
    // A refused request is not journalled as sent.
    expect(journal.filter((e) => 'sent' in e).map((e) => e.sent.type)).toEqual(['user']);
    host.stop();
    await host.done;
    // Terminal view resumes the same thread with Mesa's embedded codex, never a plain `codex resume`.
    const terminal = AGENTS.codex.resume(THREAD, w.home, {}, NATIVE_LAUNCH);
    expect(terminal).toMatch(/^codex -c mesa\.embedded=true /);
    expect(terminal).toContain(THREAD);
  });

  it("goes idle when Codex refuses the goal's turn, so the next message starts a turn", async () => {
    const w = world(scriptedSpawner());
    const record = await openStructured(w, 'make a file', 'codex');
    const written: string[] = [];
    const host = await w.mesa.sessions.host(record.id, (t) => written.push(t));
    open(w.fake);
    const start = w.fake.sent.find((m) => m.method === 'turn/start');
    w.fake.push({ id: start?.id, error: { message: 'usage limit reached' } });
    expect(written.at(-1)).toContain(' - idle');
    expect(
      await askHost(hostSocket(w.paths.hosts, record.id), { type: 'send', text: 'again' }),
    ).toEqual({
      ok: true,
      queued: false,
    });
    host.stop();
    await host.done;
  });

  it('resumes the recorded thread and sends no goal', async () => {
    const w = world(scriptedSpawner());
    const record = await openStructured(w, 'make a file', 'codex');
    testStore(w.home).update(record.id, { agentSessionId: THREAD });
    const host = await w.mesa.sessions.host(record.id, () => undefined);
    w.fake.push(
      { id: 'initialize#1', result: {} },
      { id: 'thread/resume#2', result: { thread: { id: THREAD } } },
    );
    expect(w.fake.sent.find((m) => m.method === 'thread/resume')).toMatchObject({
      params: { threadId: THREAD },
    });
    expect(w.fake.sent.some((m) => m.method === 'turn/start')).toBe(false);
    host.stop();
    await host.done;
  });
});
