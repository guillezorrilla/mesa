import { describe, expect, it } from 'vitest';
import {
  agentWorld,
  hostedSession,
  projectProfile,
  scriptedSpawner,
  shortTempDir,
  testStore,
} from '../../testing/index.js';

// Claude's answers as 2.1.325 gave them in stream-json mode (measured live, #1201).
const INIT = JSON.stringify({
  type: 'system',
  subtype: 'init',
  session_id: 'c0ffee00-0000-4000-8000-0000000000cc',
  model: 'claude-haiku-5-5',
  permissionMode: 'default',
});
const synthetic = (text: string) => ({
  type: 'assistant',
  message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text }] },
});
const ok = (requestId: unknown, response: object) => ({
  type: 'control_response',
  response: { subtype: 'success', request_id: requestId, response },
});

/** Claude as measured: set_model and set_permission_mode answered, /effort by a synthetic reply. */
function claude(message: Record<string, unknown>): object[] {
  const request = message.request as
    | { subtype?: string; model?: string; mode?: string }
    | undefined;
  if (request?.subtype === 'set_model')
    return [ok(message.request_id, { model: `claude-${request.model}-5-5` })];
  if (request?.subtype === 'set_permission_mode')
    return [
      ok(message.request_id, { mode: request.mode }),
      { type: 'system', subtype: 'status', permissionMode: request.mode },
    ];
  const content = (message.message as { content?: unknown } | undefined)?.content;
  if (content === '/effort low')
    return [synthetic('Set effort level to low (this session only): Quick, straightforward')];
  if (content === '/effort turbo') return [synthetic('Usage: /effort <low|medium|high|xhigh|max>')];
  if (content === '/usage') return [synthetic('Current session: 4% used')];
  return [];
}

describe("a Structured Claude session's controls", () => {
  it('show the model and mode its init named, and what each picker offers', async () => {
    const w = await hostedSession([INIT], claude);
    expect(w.mesa.sessions.controls(w.record.id)).toMatchObject({
      agent: 'claude',
      model: 'claude-haiku-5-5',
      mode: 'default',
      models: ['opus', 'sonnet', 'haiku', 'fable'],
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      modes: expect.arrayContaining(['plan', 'acceptEdits']),
    });
    w.host.stop();
    await w.host.done;
  });

  it('change model, effort and mode once claude confirms them, and keep model and effort', async () => {
    const w = await hostedSession([INIT], claude);
    const { result } = await w.mesa.sessions.setControls(w.record.id, {
      model: 'sonnet',
      effort: 'low',
    });
    expect(result).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'low' });
    expect(w.fake.sent).toContainEqual(
      expect.objectContaining({ request: { subtype: 'set_model', model: 'sonnet' } }),
    );
    expect(testStore(w.home).get(w.record.id)).toMatchObject({ model: 'sonnet', effort: 'low' });
    const { result: planned } = await w.mesa.sessions.setControls(w.record.id, { mode: 'plan' });
    expect(planned.mode).toBe('plan');
    w.host.stop();
    await w.host.done;
  });

  it('refuses what claude refuses, inline with its words, and what it does not take', async () => {
    const w = await hostedSession([INIT], claude);
    await expect(w.mesa.sessions.setControls(w.record.id, { effort: 'turbo' })).rejects.toThrow(
      /--effort is one of low, medium, high, xhigh, max/,
    );
    await expect(w.mesa.sessions.setControls(w.record.id, { mode: 'sideways' })).rejects.toThrow(
      /mode is one of/,
    );
    const refusing = await hostedSession([INIT], (m) =>
      (m.request as { subtype?: string } | undefined)?.subtype === 'set_model'
        ? [
            {
              type: 'control_response',
              response: { subtype: 'error', request_id: m.request_id, error: 'no such model' },
            },
          ]
        : [],
    );
    await expect(
      refusing.mesa.sessions.setControls(refusing.record.id, { model: 'opus' }),
    ).rejects.toThrow(/no such model/);
    expect(testStore(refusing.home).get(refusing.record.id).model).toBeUndefined();
    for (const s of [w, refusing]) {
      s.host.stop();
      await s.host.done;
    }
  });

  it('waits 10 s for a confirmation that never comes, then says so', async () => {
    const w = await hostedSession([INIT], () => []);
    await expect(w.mesa.sessions.setControls(w.record.id, { model: 'opus' })).rejects.toThrow(
      /did not confirm the change in 10 s/,
    );
    w.host.stop();
    await w.host.done;
  });

  it("takes an effort mid-turn as queued, and another command's reply is no refusal", async () => {
    const w = await hostedSession([INIT], (m) =>
      (m.message as { content?: string } | undefined)?.content === '/effort low'
        ? [synthetic('No response requested.')]
        : claude(m),
    );
    testStore(w.home).update(w.record.id, (r) => ({
      lastState: { ...r.lastState, state: 'working' as const },
    }));
    const { result } = await w.mesa.sessions.setControls(w.record.id, {
      model: 'sonnet',
      effort: 'low',
    });
    expect(result).toMatchObject({ model: 'claude-sonnet-5-5', effortQueued: 'low' });
    w.host.stop();
    await w.host.done;
  });

  it('shows the last /usage reply as its usage', async () => {
    const w = await hostedSession([INIT], claude);
    await w.mesa.sessions.send(w.record.id, '/usage');
    expect(w.mesa.sessions.controls(w.record.id).usage).toBe('Current session: 4% used');
    w.host.stop();
    await w.host.done;
  });

  it('refuse a Terminal session', async () => {
    const agents = agentWorld();
    const { mesa } = projectProfile(agents.run, { home: shortTempDir() });
    const { result } = await mesa.sessions.open('lantern-cove');
    expect(() => mesa.sessions.controls(result.id)).toThrow(/not in Structured view/);
  });
});

describe("a Structured Codex session's controls", () => {
  it('take a model and effort for the next turn, and refuse a mode', async () => {
    const fake = scriptedSpawner();
    const agents = agentWorld();
    const { home, mesa } = projectProfile(agents.run, { home: shortTempDir(), spawn: fake.spawn });
    const { result: record } = await mesa.sessions.open('lantern-cove', {
      view: 'structured',
      agent: 'codex',
    });
    const host = await mesa.sessions.host(record.id, () => undefined);
    fake.push(
      { id: 'initialize#1', result: {} },
      { id: 'thread/start#2', result: { thread: { id: 'th-1' }, model: 'gpt-invented' } },
      {
        id: 'model/list#4',
        result: { data: [{ id: 'gpt-invented', displayName: 'GPT', isDefault: true }] },
      },
    );
    expect(mesa.sessions.controls(record.id)).toMatchObject({
      agent: 'codex',
      model: 'gpt-invented',
      models: ['gpt-invented'],
      modes: [],
    });
    const { result } = await mesa.sessions.setControls(record.id, {
      model: 'gpt-other',
      effort: 'high',
    });
    expect(result).toMatchObject({ model: 'gpt-other', effort: 'high' });
    expect(testStore(home).get(record.id)).toMatchObject({ model: 'gpt-other', effort: 'high' });
    await mesa.sessions.send(record.id, 'next');
    expect(fake.sent.filter((m) => m.method === 'turn/start').at(-1)).toMatchObject({
      params: { model: 'gpt-other', effort: 'high' },
    });
    await expect(mesa.sessions.setControls(record.id, { mode: 'plan' })).rejects.toThrow(
      /codex has no permission modes/,
    );
    host.stop();
    await host.done;
  });
});
