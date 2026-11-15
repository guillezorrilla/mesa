import { mkdtempSync, realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMesa } from '../../mesa.js';
import {
  agentWorld,
  plantTranscript,
  profilePaths,
  projectProfile,
  RECORDED_CLAUDE_STREAM,
  replaySpawner,
  scriptedRunner,
  testDeps,
} from '../../testing/index.js';
import { readJournal } from './journal.js';
import { askHost, hostSocket } from './socket.js';

// A unix socket path is capped near 104 bytes, and the system temp folder is long on macOS.
const shortHome = () => realpathSync(mkdtempSync('/tmp/mh-'));

/** A profile with lantern-cove, agents and tmux in memory, and claude's process from `fake`. */
function world(fake = replaySpawner(RECORDED_CLAUDE_STREAM, { stay: true })) {
  const agents = agentWorld();
  const { home, mesa } = projectProfile(agents.run, {
    home: shortHome(),
    spawn: fake.spawn,
  });
  return { home, mesa, agents, fake, paths: profilePaths(home, 'default') };
}

async function openStructured(w: ReturnType<typeof world>, goal = 'make a file') {
  const { result } = await w.mesa.sessions.open('lantern-cove', { view: 'structured', goal });
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
      w.mesa.sessions.open('lantern-cove', { view: 'structured', agent: 'codex' }),
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
      /not a Structured Claude Code session/,
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
