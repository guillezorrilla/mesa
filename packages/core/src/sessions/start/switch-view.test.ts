import { mkdtempSync, realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMesa } from '../../mesa.js';
import {
  agentWorld,
  plantTranscript,
  profilePaths,
  projectProfile,
  replaySpawner,
  scriptedRunner,
  testDeps,
  testStore,
} from '../../testing/index.js';

// A unix socket path is capped near 104 bytes, and the system temp folder is long on macOS.
const shortHome = () => realpathSync(mkdtempSync('/tmp/mv-'));

/** lantern-cove with claude's process from a fake that stays up, and a TUI that quits on /exit. */
function world() {
  const fake = replaySpawner([], { stay: true });
  const agents = agentWorld({
    onKeys: (window, text) => {
      if (text === '/exit') window.dead = true;
    },
  });
  const { home, mesa } = projectProfile(agents.run, { home: shortHome(), spawn: fake.spawn });
  return { home, mesa, agents, fake, paths: profilePaths(home, 'default') };
}

async function structured(w: ReturnType<typeof world>) {
  const { result } = await w.mesa.sessions.open('lantern-cove', { view: 'structured' });
  plantTranscript(w.home, result.agentSessionId ?? '', w.home);
  const host = await w.mesa.sessions.host(result.id, () => undefined);
  return { record: result, host };
}

/** The hooks said it is at work. */
const working = (w: ReturnType<typeof world>, id: string) =>
  testStore(w.home).update(id, (r) => ({
    lastState: { ...r.lastState, state: 'working' as const },
  }));

describe('switching a session between Structured and Terminal', () => {
  it('stops the host and resumes the TUI in the same window when idle', async () => {
    const w = world();
    const { record, host } = await structured(w);
    const { result } = await w.mesa.sessions.switchView(record.id, 'terminal');
    expect(result.switched).toBe(true);
    expect(await host.done).toEqual({ code: undefined });
    expect(w.fake.wasKilled()).toBe(true);
    const reopened = w.agents.tmux.opened.at(-1);
    expect(reopened?.window).toBe(record.tmux.window);
    expect(reopened?.launch).toContain(`claude --resume ${record.agentSessionId}`);
    expect(result.record.view).toBe('terminal');
    expect(result.record.switching).toBeUndefined();
    expect(result.record.events.at(-1)).toMatchObject({ type: 'switched', to: 'terminal' });
  });

  it('quits the TUI and starts the host when idle, a session from before views too', async () => {
    const w = world();
    const { result: plain } = await w.mesa.sessions.open('lantern-cove');
    expect(plain.view).toBeUndefined();
    const { result } = await w.mesa.sessions.switchView(plain.id, 'structured');
    expect(result.switched).toBe(true);
    expect(w.agents.tmux.opened.at(-1)?.launch).toContain(`host ${plain.id}`);
    expect(result.record.view).toBe('structured');
  });

  it('does nothing for a session already in that view', async () => {
    const w = world();
    const { result: plain } = await w.mesa.sessions.open('lantern-cove');
    const opened = w.agents.tmux.opened.length;
    const { result } = await w.mesa.sessions.switchView(plain.id, 'terminal');
    expect(result.switched).toBe(false);
    expect(w.agents.tmux.opened).toHaveLength(opened);
  });

  it('refuses mid-turn without --interrupt, touching nothing', async () => {
    const w = world();
    const { record, host } = await structured(w);
    working(w, record.id);
    await expect(w.mesa.sessions.switchView(record.id, 'terminal')).rejects.toThrow(
      /is mid-turn: wait for it to finish, or interrupt and switch/,
    );
    expect(w.fake.wasKilled()).toBe(false);
    expect(testStore(w.home).get(record.id)).toMatchObject({ view: 'structured' });
    expect(testStore(w.home).get(record.id).switching).toBeUndefined();
    host.stop();
    await host.done;
  });

  it('interrupts the turn, then stops and resumes, with --interrupt', async () => {
    const w = world();
    const { record, host } = await structured(w);
    working(w, record.id);
    const { result } = await w.mesa.sessions.switchView(record.id, 'terminal', { interrupt: true });
    await host.done;
    expect(w.fake.sent.map((m) => (m.request as { subtype?: string })?.subtype)).toContain(
      'interrupt',
    );
    expect(result.record).toMatchObject({ view: 'terminal', lastState: { state: 'idle' } });
  });

  it('refuses to start a second process while claude still runs the conversation', async () => {
    const w = world();
    const { result: plain } = await w.mesa.sessions.open('lantern-cove');
    plantTranscript(w.home, plain.agentSessionId ?? '', w.home);
    const listing = JSON.stringify([
      { pid: 77, cwd: w.home, startedAt: 1, sessionId: plain.agentSessionId, status: 'idle' },
    ]);
    const stuck = createMesa(
      'default',
      testDeps(w.home, {
        run: scriptedRunner({ claude: listing, tmux: w.agents.tmux.answer }).run,
        spawn: w.fake.spawn,
      }),
    );
    const opened = w.agents.tmux.opened.length;
    await expect(stuck.sessions.switchView(plain.id, 'structured')).rejects.toThrow(
      /still has claude running its conversation \(pid 77\)/,
    );
    expect(w.agents.tmux.opened).toHaveLength(opened);
    const after = testStore(w.home).get(plain.id);
    expect(after.view).toBeUndefined();
    expect(after.switching).toBeUndefined();
  });

  it('refuses a switch while another runs, and a Codex session', async () => {
    const w = world();
    const { result: plain } = await w.mesa.sessions.open('lantern-cove');
    testStore(w.home).update(plain.id, { switching: { at: new Date().toISOString() } });
    await expect(w.mesa.sessions.switchView(plain.id, 'structured')).rejects.toThrow(
      /switching already/,
    );
    const { result: codex } = await w.mesa.sessions.open('lantern-cove', { agent: 'codex' });
    await expect(w.mesa.sessions.switchView(codex.id, 'structured')).rejects.toThrow(
      /not a Claude Code session/,
    );
  });
});
