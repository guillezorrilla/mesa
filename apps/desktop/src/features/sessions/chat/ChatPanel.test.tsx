// @vitest-environment happy-dom
import type { ChatItem, ChatMessage, ChatRun, SessionChat } from '@mesa/core';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { asking, click, envelope, fakeBridge, press, renderWithMesa } from '@/lib/testing';
import { ChatPanel } from './ChatPanel';
import { transcriptHolds } from './useChat';

const at = '2026-09-28T12:00:00.000Z';
const said = (from: ChatMessage['from'], text: string, id = text): ChatMessage => ({
  id,
  at,
  text,
  from,
});
const chatOf = (messages: ChatItem[], more = false): SessionChat => ({
  messages,
  count: messages.length,
  more,
});

test('chat shows the prompts as plain bubbles and the replies as Markdown, oldest first', async () => {
  const { bridge, calls } = fakeBridge({
    chat: () =>
      envelope(
        chatOf([
          said('you', 'Find the **heron**'),
          said('agent', 'Found it in:\n\n```\nheron.txt\n```'),
        ]),
      ),
  });
  const byTestId = await renderWithMesa(
    <ChatPanel sessionId="a1b2c3d4" acting={false} onSend={() => {}} />,
    bridge,
  );
  expect(calls).toContainEqual(['--json', 'chat', '--count', '20', '--', 'a1b2c3d4']);
  const list = byTestId('chat-messages')[0];
  const rows = [...(list?.querySelectorAll('li') ?? [])].map((row) =>
    row.textContent?.replace(/\s+/g, ' ').trim(),
  );
  expect(rows).toEqual(['Find the **heron**', 'Found it in: heron.txt']);
  expect(list?.querySelector('pre')?.textContent).toBe('heron.txt\n');
  expect(list?.querySelector('[aria-label="Copy code"]')).not.toBeNull();
});

test('Enter sends what is typed, Shift+Enter does not', async () => {
  const { bridge } = fakeBridge({ chat: () => envelope(chatOf([])) });
  const onSend = vi.fn();
  await renderWithMesa(<ChatPanel sessionId="a1b2c3d4" acting={false} onSend={onSend} />, bridge);
  const field = document.querySelector<HTMLTextAreaElement>('[aria-label="Message a1b2c3d4"]');
  if (!field) throw new Error('no composer');
  field.value = 'Chart the tide';
  await press(field, 'Enter', { shiftKey: true });
  expect(onSend).not.toHaveBeenCalled();
  await press(field, 'Enter');
  expect(onSend).toHaveBeenCalledWith('Chart the tide', field.form);
});

test('a sent prompt shows as Sending until the transcript holds it', async () => {
  let messages = [said('agent', 'Ready.')];
  const { bridge } = fakeBridge({ chat: () => envelope(chatOf(messages)) });
  const sent = { id: 'a1b2c3d4', prompt: 'Chart the tide', at: Date.parse(at) };
  const byTestId = await renderWithMesa(
    <ChatPanel sessionId="a1b2c3d4" acting={false} sent={sent} onSend={() => {}} />,
    bridge,
  );
  expect(byTestId('chat-messages')[0]?.textContent).toContain('Chart the tideSending');
  messages = [...messages, said('you', 'Chart the tide')];
  await new Promise((done) => setTimeout(done, 2500));
  expect(byTestId('chat-messages')[0]?.textContent).not.toContain('Sending');
});

test('Older messages reads further back', async () => {
  const { bridge, calls } = fakeBridge({
    chat: (args) => envelope(chatOf([said('agent', `count ${args.at(-3)}`)], args.at(-3) === '20')),
  });
  const byTestId = await renderWithMesa(
    <ChatPanel sessionId="a1b2c3d4" acting={false} onSend={() => {}} />,
    bridge,
  );
  const older = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Older messages',
  );
  await click(older);
  expect(calls).toContainEqual(['--json', 'chat', '--count', '40', '--', 'a1b2c3d4']);
  expect(byTestId('chat-messages')[0]?.textContent).toContain('count 40');
});

test('a transcript holds a sent prompt once one of the person since says it', () => {
  const sent = { id: 'a1b2c3d4', prompt: ' Chart the tide ', at: Date.parse(at) };
  expect(transcriptHolds([said('agent', 'Chart the tide')], sent)).toBe(false);
  expect(transcriptHolds([{ ...said('you', 'Chart the tide'), at: null }], sent)).toBe(true);
  expect(transcriptHolds([said('you', 'Chart the tide')], sent)).toBe(true);
  const earlier = { ...said('you', 'Chart the tide'), at: '2026-09-28T11:00:00.000Z' };
  expect(transcriptHolds([earlier], sent)).toBe(false);
});

test("a guardrail's block shows beside the composer", async () => {
  const { bridge } = fakeBridge({ chat: () => envelope(chatOf([])) });
  await renderWithMesa(
    <ChatPanel
      sessionId="a1b2c3d4"
      acting={false}
      refused="Not sent to a1b2c3d4: the text holds a destructive command (rm -rf)"
      onSend={() => {}}
    />,
    bridge,
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('destructive command');
});

test('typing /us in the composer offers /usage and Tab completes it', async () => {
  const { bridge } = fakeBridge({
    chat: () => envelope(chatOf([])),
    commands: () =>
      envelope([
        { name: 'usage', description: 'Show plan usage', source: 'builtin' },
        { name: 'model', description: 'Choose the model', source: 'builtin' },
      ]),
  });
  await renderWithMesa(<ChatPanel sessionId="a1b2c3d4" acting={false} onSend={() => {}} />, bridge);
  const field = document.querySelector<HTMLTextAreaElement>('[aria-label="Message a1b2c3d4"]');
  if (!field) throw new Error('no composer');
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    set?.call(field, '/us');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(document.querySelector('[aria-label="Slash commands"]')?.textContent).toContain('/usage');
  expect(document.querySelector('[aria-label="Slash commands"]')?.textContent).not.toContain(
    '/model',
  );
  await press(field, 'Tab');
  expect(field.value).toBe('/usage');
});

test('a run of steps shows as one collapsed row that opens to its steps in order', async () => {
  const run: ChatMessage | ChatRun = {
    id: 'steps:s1',
    at,
    from: 'steps',
    text: 'Read 2 files, ran 1 command',
    steps: [
      { id: 's1', line: 'Read a.ts', status: 'done' },
      { id: 's2', line: 'Read b.ts', status: 'done' },
      { id: 's3', line: 'Bash ls', status: 'done' },
    ],
  };
  const { bridge } = fakeBridge({
    chat: () => envelope(chatOf([said('you', 'Look'), run, said('agent', 'Done.')])),
  });
  const byTestId = await renderWithMesa(
    <ChatPanel sessionId="a1b2c3d4" acting={false} onSend={() => {}} />,
    bridge,
  );
  const details = byTestId('chat-messages')[0]?.querySelector('details');
  expect(details?.open).toBe(false);
  expect(details?.querySelector('summary')?.textContent).toBe('Read 2 files, ran 1 command');
  expect([...(details?.querySelectorAll('ol li') ?? [])].map((li) => li.textContent)).toEqual([
    'Read a.ts',
    'Read b.ts',
    'Bash ls',
  ]);
});

test('a session waiting on a permission shows its answer card and the composer says Answer above', async () => {
  const { bridge } = fakeBridge({
    chat: () => envelope(chatOf([])),
    prompt: () =>
      envelope({
        status: 'pending',
        session: 'a1b2c3d4',
        id: 'p1',
        kind: 'permission',
        tool: 'Bash',
        summary: 'touch beacon.txt',
        options: [{ id: 'allow', label: 'Allow' }],
        freeText: false,
      }),
  });
  const byTestId = await renderWithMesa(
    <ChatPanel sessionId="a1b2c3d4" row={asking} acting={false} onSend={() => {}} />,
    bridge,
  );
  expect(byTestId('session-prompt')[0]?.textContent).toContain('Allow Bash?');
  const field = document.querySelector<HTMLTextAreaElement>('[aria-label="Message a1b2c3d4"]');
  expect(field?.disabled).toBe(true);
  expect(field?.placeholder).toBe('Answer above');
});
