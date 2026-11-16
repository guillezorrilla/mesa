// @vitest-environment happy-dom
import type { ChatMessage } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  envelope,
  fakeBridge,
  fakeFollows,
  fakePlatform,
  fakeSessionEvents,
  fill,
  managedRow,
  press,
  renderWithMesa,
} from '@/lib/testing';
import { ChatPanel } from './ChatPanel';
import { followed } from './useFollowedChat';

const at = '2026-11-15T12:00:00.000Z';
const said = (from: ChatMessage['from'], text: string, id = text): ChatMessage => ({
  id,
  at,
  text,
  from,
});
const structured = managedRow('dddddddd', { view: 'structured' });

test('a followed line replaces the chat, adds a new item, and changes one in place', () => {
  const chat = followed(undefined, {
    type: 'chat',
    messages: [said('you', 'go')],
    count: 1,
    more: false,
  });
  const grown = followed(followed(chat, { type: 'item', item: said('agent', 'Hel', 'r1') }), {
    type: 'item',
    item: said('agent', 'Hello', 'r1'),
  });
  expect(grown?.messages.map((m) => ('text' in m ? m.text : ''))).toEqual(['go', 'Hello']);
  expect(followed(grown, { type: 'end' })).toBe(grown);
  const suggested = followed(grown, { type: 'suggestion', text: 'chart the reef' });
  expect(suggested?.suggestion).toBe('chart the reef');
  expect(followed(suggested, { type: 'suggestion', text: null })).not.toHaveProperty('suggestion');
});

test("a Structured session's chat reads its live stream: no chat call, the reply grows in place, closed on leaving", async () => {
  const follows = fakeFollows();
  const { bridge, calls } = fakeBridge({
    'sessions controls': () =>
      envelope({ session: 'dddddddd', agent: 'claude', models: [], efforts: [], modes: [] }),
  });
  const byTestId = await renderWithMesa(
    <ChatPanel sessionId="dddddddd" row={structured} acting={false} onSend={() => {}} />,
    bridge,
    fakePlatform({ follow: follows.host }),
  );
  expect(follows.calls).toEqual([
    ['open', 'dddddddd', 20],
    ['ready', 'f1'],
  ]);
  await act(async () => {
    follows.push({
      type: 'chat',
      messages: [said('you', 'Count the herons')],
      count: 1,
      more: false,
    });
    follows.push({ type: 'item', item: said('agent', 'One', 'r1') });
  });
  const list = () => byTestId('chat-messages')[0]?.textContent ?? '';
  expect(list()).toContain('One');
  await act(async () => follows.push({ type: 'item', item: said('agent', 'One, two', 'r1') }));
  expect(list()).toContain('One, two');
  expect(list().match(/One/g)).toHaveLength(1);
  expect(calls.some((c) => c[1] === 'chat')).toBe(false);
  await renderWithMesa(<div />, bridge);
  expect(follows.calls.at(-1)).toEqual(['close', 'f1']);
});

test('a follow that ended, its host stopped, opens again on the next session change', async () => {
  const follows = fakeFollows();
  const events = fakeSessionEvents();
  const { bridge } = fakeBridge({
    'sessions controls': () =>
      envelope({ session: 'dddddddd', agent: 'claude', models: [], efforts: [], modes: [] }),
  });
  await renderWithMesa(
    <ChatPanel sessionId="dddddddd" row={structured} acting={false} onSend={() => {}} />,
    bridge,
    fakePlatform({ follow: follows.host, sessions: events.host }),
  );
  const opens = () => follows.calls.filter((c) => c[0] === 'open').length;
  expect(opens()).toBe(1);
  await act(async () => events.push());
  expect(opens()).toBe(1);
  await act(async () => follows.exit());
  await act(async () => events.push());
  expect(opens()).toBe(2);
});

test("the agent's prompt suggestion shows dim in the empty composer; Tab or Right takes it, typing replaces it", async () => {
  const follows = fakeFollows();
  const { bridge } = fakeBridge({
    'sessions controls': () =>
      envelope({ session: 'dddddddd', agent: 'claude', models: [], efforts: [], modes: [] }),
  });
  await renderWithMesa(
    <ChatPanel sessionId="dddddddd" row={structured} acting={false} onSend={() => {}} />,
    bridge,
    fakePlatform({ follow: follows.host }),
  );
  await act(async () => {
    follows.push({ type: 'chat', messages: [said('agent', 'Charted.')], count: 1, more: false });
    follows.push({ type: 'suggestion', text: 'chart the reef too' });
  });
  const field = () =>
    document.querySelector<HTMLTextAreaElement>('[aria-label="Message dddddddd"]') ?? undefined;
  expect(field()?.placeholder).toBe('chart the reef too');
  await press(field(), 'Tab');
  expect(field()?.value).toBe('chart the reef too');
  await fill(field(), '');
  await press(field(), 'ArrowRight');
  expect(field()?.value).toBe('chart the reef too');
  await fill(field(), 'light the lantern');
  await press(field(), 'Tab');
  expect(field()?.value).toBe('light the lantern');
  // Sent, the suggestion is gone.
  await fill(field(), '');
  await act(async () => follows.push({ type: 'suggestion', text: null }));
  expect(field()?.placeholder).toBe('Type / for commands');
});

test('the prompt the agent waits on comes on the stream: no prompt call, the pressed answer spins, the card closes at once', async () => {
  const follows = fakeFollows();
  let answered: (value: unknown) => void = () => undefined;
  const { bridge, calls } = fakeBridge({
    'sessions controls': () =>
      envelope({ session: 'dddddddd', agent: 'claude', models: [], efforts: [], modes: [] }),
    answer: () =>
      new Promise((resolve) => {
        answered = resolve;
      }),
  });
  // Idle on the board: the stream alone says a prompt waits.
  await renderWithMesa(
    <ChatPanel sessionId="dddddddd" row={structured} acting={false} onSend={() => {}} />,
    bridge,
    fakePlatform({ follow: follows.host }),
  );
  await act(async () => {
    follows.push({ type: 'chat', messages: [], count: 0, more: false });
    follows.push({
      type: 'prompt',
      prompt: {
        status: 'pending',
        session: 'dddddddd',
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
    });
  });
  const card = () => document.querySelector('[data-testid="session-prompt"]');
  const allow = () =>
    [...(card()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (b) => b.textContent === 'Allow',
    );
  expect(card()?.textContent).toContain('tide.txt');
  expect(
    document.querySelector<HTMLTextAreaElement>('[aria-label="Message dddddddd"]')?.placeholder,
  ).toBe('Answer above');
  await act(async () => allow()?.click());
  expect(allow()?.getAttribute('aria-busy')).toBe('true');
  await act(async () => answered(envelope({ answered: true, prompt: 'req-w', receipt: null })));
  expect(card()).toBeNull();
  expect(calls.some((c) => c[1] === 'prompt')).toBe(false);
  await act(async () => follows.push({ type: 'prompt', prompt: null }));
  expect(card()).toBeNull();
});

test('a follow that ends takes its prompt card with it: nothing is left to answer', async () => {
  const follows = fakeFollows();
  const { bridge } = fakeBridge({
    'sessions controls': () =>
      envelope({ session: 'dddddddd', agent: 'claude', models: [], efforts: [], modes: [] }),
  });
  await renderWithMesa(
    <ChatPanel sessionId="dddddddd" row={structured} acting={false} onSend={() => {}} />,
    bridge,
    fakePlatform({ follow: follows.host }),
  );
  const prompt = {
    status: 'pending',
    session: 'dddddddd',
    id: 'req-q',
    kind: 'question',
    tool: 'AskUserQuestion',
    summary: 'Tea or coffee?',
    options: [{ id: '1', label: 'Tea' }],
    freeText: true,
  };
  await act(async () => {
    follows.push({ type: 'chat', messages: [], count: 0, more: false });
    follows.push({ type: 'prompt', prompt });
  });
  expect(document.querySelector('[data-testid="session-prompt"]')).not.toBeNull();
  await act(async () => follows.exit());
  expect(document.querySelector('[data-testid="session-prompt"]')).toBeNull();
});

test("while the chat's follow runs, its actions go over it: an answer starts no mesa", async () => {
  const follows = fakeFollows((argv) =>
    argv[0] === 'answer'
      ? envelope({ answered: true, prompt: 'req-w', receipt: null })
      : envelope({ session: 'dddddddd', agent: 'claude', models: [], efforts: [], modes: [] }),
  );
  const { bridge, calls } = fakeBridge({
    'sessions controls': () =>
      envelope({ session: 'dddddddd', agent: 'claude', models: [], efforts: [], modes: [] }),
  });
  await renderWithMesa(
    <ChatPanel sessionId="dddddddd" row={structured} acting={false} onSend={() => {}} />,
    bridge,
    fakePlatform({ follow: follows.host }),
  );
  await act(async () => {
    follows.push({ type: 'chat', messages: [], count: 0, more: false });
    follows.push({
      type: 'prompt',
      prompt: {
        status: 'pending',
        session: 'dddddddd',
        id: 'req-w',
        kind: 'permission',
        tool: 'Write',
        summary: 'tide.txt',
        options: [{ id: 'allow', label: 'Allow' }],
        freeText: false,
      },
    });
  });
  const allow = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === 'Allow',
  );
  await act(async () => allow?.click());
  expect(follows.calls).toContainEqual([
    'write',
    'f1',
    'answer',
    '--via',
    'app',
    '--prompt',
    'req-w',
    '--',
    'dddddddd',
    'allow',
  ]);
  expect(calls.some((c) => c[1] === 'answer')).toBe(false);
  expect(document.querySelector('[data-testid="session-prompt"]')).toBeNull();
});
