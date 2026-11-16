import { mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hostedSession, profilePaths, testStore } from '../../testing/index.js';
import { recordHookEvent } from '../signals/hook-events.js';
import type { ChatFollowLine } from './live-chat.js';

describe('mesa send to a Structured session', () => {
  it('goes to its host after the guardrail, not into the window', async () => {
    const w = await hostedSession();
    const { result } = await w.mesa.sessions.send(w.record.id, 'and a second file', {
      noFrom: true,
    });
    expect(result).toMatchObject({ sent: true, chars: 17 });
    expect(result.queued).toBeUndefined();
    expect(w.fake.sent.at(-1)).toEqual({
      type: 'user',
      message: { role: 'user', content: 'and a second file' },
    });
    expect(w.agents.tmux.opened[0]?.typed ?? []).toEqual([]);
    w.host.stop();
    await w.host.done;
  });

  it('says a message sent mid-turn is queued', async () => {
    const w = await hostedSession([]);
    const { result } = await w.mesa.sessions.send(w.record.id, 'also this', { noFrom: true });
    expect(result.queued).toBe(true);
    w.host.stop();
    await w.host.done;
  });

  it('is refused, with nothing sent, when no host runs', async () => {
    const w = await hostedSession();
    w.host.stop();
    await w.host.done;
    await expect(
      w.mesa.sessions.send(w.record.id, 'anyone?', { noFrom: true }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it("carries a child's report to its Structured parent", async () => {
    const w = await hostedSession();
    const { result: child } = await w.mesa.sessions.open('lantern-cove', {
      parent: w.record.id,
      goal: 'chart the tides',
    });
    // The hold is off, so a report goes at once.
    w.mesa.config.set('sessions.reportHoldSeconds', '0');
    w.mesa.reports.list();
    const events = profilePaths(w.home, 'default').events;
    mkdirSync(events, { recursive: true });
    let second = 10;
    // The hooks fire in a Structured window as in a Terminal one (ADR-0003): each turn's Stop.
    const stop = (id: string, said: string) =>
      recordHookEvent(
        {
          store: testStore(w.home),
          eventsDir: events,
          clock: () => new Date(`2026-09-24T12:30:${second++}.000Z`),
          home: w.home,
          secrets: () => [],
        },
        {
          agent: 'claude',
          mesaSessionId: id,
          payload: JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: said }),
        },
      );
    stop(w.record.id, 'Waiting on the tides.');
    stop(child.id, 'Done: tides charted.');
    const delivered = await w.mesa.reports.deliver();
    expect(delivered.deliveries).toMatchObject([{ session: w.record.id, status: 'delivered' }]);
    const last = w.fake.sent.at(-1) as { message: { content: string } };
    expect(last.message.content).toContain('Done: tides charted.');
    w.host.stop();
    await w.host.done;
  });
});

describe('mesa chat --follow', () => {
  it('prints the chat, then each item as it changes, until the host ends', async () => {
    const w = await hostedSession();
    const lines: ChatFollowLine[] = [];
    let looks = 0;
    const following = w.mesa.sessions.chatFollow(
      w.record.id,
      (line) => lines.push(line),
      () => true,
    );
    // Once the follow has looked, a new message streams in; then the agent ends.
    const later = (async () => {
      while (lines.length < 1 || looks++ < 3) await new Promise((r) => setTimeout(r, 5));
      await w.mesa.sessions.send(w.record.id, 'and one more', { noFrom: true });
      await new Promise((r) => setTimeout(r, 300));
      w.host.stop();
    })();
    await Promise.all([following, later]);
    expect(lines[0]).toMatchObject({ type: 'chat' });
    const first = lines[0] as Extract<ChatFollowLine, { type: 'chat' }>;
    expect(first.messages.map((m) => m.from)).toEqual(['you', 'agent', 'steps']);
    const items = lines.filter((l) => l.type === 'item');
    expect(items.map((l) => (l as { item: { text: string } }).item.text)).toContain('and one more');
    expect(lines.at(-1)).toEqual({ type: 'end' });
  });

  it("prints the agent's prompt suggestion, and null once a message is sent", async () => {
    const turn = (text: string) => [
      { type: 'result', subtype: 'success', is_error: false, result: text, session_id: 's' },
      { type: 'prompt_suggestion', suggestion: `after ${text}`, session_id: 's' },
    ];
    const w = await hostedSession(undefined, (m) =>
      (m.message as { content?: unknown } | undefined)?.content === 'chart the tide'
        ? turn('tide')
        : [],
    );
    const lines: ChatFollowLine[] = [];
    let reading = true;
    const following = w.mesa.sessions.chatFollow(
      w.record.id,
      (line) => lines.push(line),
      () => reading,
    );
    const suggestions = () => lines.filter((l) => l.type === 'suggestion');
    const until = async (ok: () => boolean) => {
      for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
    };
    await until(() => lines.length > 0);
    await w.mesa.sessions.send(w.record.id, 'chart the tide', { noFrom: true });
    await until(() => suggestions().length > 0);
    expect(w.mesa.sessions.chat(w.record.id).suggestion).toBe('after tide');
    await w.mesa.sessions.send(w.record.id, 'light the lantern', { noFrom: true });
    await until(() => suggestions().length > 1);
    reading = false;
    await following;
    w.host.stop();
    await w.host.done;
    expect(suggestions()).toEqual([
      { type: 'suggestion', text: 'after tide' },
      { type: 'suggestion', text: null },
    ]);
  });

  it('prints the prompt the agent waits on, and null once it is answered', async () => {
    const write = {
      type: 'control_request',
      request_id: 'req-w',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Write',
        input: { file_path: 'tide.txt', content: 'high' },
        tool_use_id: 'toolu_w',
      },
    };
    const w = await hostedSession(undefined, (m) =>
      (m.message as { content?: unknown } | undefined)?.content === 'chart the tide' ? [write] : [],
    );
    const lines: ChatFollowLine[] = [];
    let reading = true;
    const following = w.mesa.sessions.chatFollow(
      w.record.id,
      (line) => lines.push(line),
      () => reading,
    );
    const prompts = () => lines.filter((l) => l.type === 'prompt');
    const until = async (ok: () => boolean) => {
      for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
    };
    await until(() => lines.length > 0);
    await w.mesa.sessions.send(w.record.id, 'chart the tide', { noFrom: true });
    await until(() => prompts().length > 0);
    await w.mesa.sessions.answer(w.record.id, { option: 'allow', prompt: 'req-w' });
    await until(() => prompts().length > 1);
    reading = false;
    await following;
    w.host.stop();
    await w.host.done;
    expect(prompts()).toEqual([
      {
        type: 'prompt',
        prompt: {
          status: 'pending',
          session: w.record.id,
          id: 'req-w',
          kind: 'permission',
          tool: 'Write',
          summary: 'tide.txt',
          options: [
            { id: 'allow', label: 'Allow' },
            { id: 'deny', label: 'Deny' },
          ],
          freeText: true,
        },
      },
      { type: 'prompt', prompt: null },
    ]);
  });

  it('ends when the window runs no host', async () => {
    const w = await hostedSession();
    w.host.stop();
    await w.host.done;
    const window = w.agents.tmux.opened[0];
    if (window) window.dead = true;
    const lines: ChatFollowLine[] = [];
    await w.mesa.sessions.chatFollow(
      w.record.id,
      (line) => lines.push(line),
      () => true,
    );
    expect(lines.map((l) => l.type)).toEqual(['chat', 'end']);
  });

  it('prints a Terminal session chat once, and stops when the reader leaves', async () => {
    const w = await hostedSession();
    const { result: plain } = await w.mesa.sessions.open('lantern-cove');
    const lines: ChatFollowLine[] = [];
    await w.mesa.sessions.chatFollow(
      plain.id,
      (line) => lines.push(line),
      () => true,
    );
    expect(lines.map((l) => l.type)).toEqual(['chat']);

    const gone: ChatFollowLine[] = [];
    await w.mesa.sessions.chatFollow(
      w.record.id,
      (line) => gone.push(line),
      () => false,
    );
    expect(gone.map((l) => l.type)).toEqual(['chat', 'end']);
    w.host.stop();
    await w.host.done;
  });
});
