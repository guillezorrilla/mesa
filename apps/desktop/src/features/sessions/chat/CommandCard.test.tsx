// @vitest-environment happy-dom
import type { ChatMessage, SessionChat } from '@mesa/core';
import { expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { ChatPanel } from './ChatPanel';
import { chatItems } from './commandMarkers';

const at = '2026-09-28T12:00:00.000Z';
const chatOf = (messages: ChatMessage[]): SessionChat => ({
  messages,
  count: messages.length,
  more: false,
});
const button = (label: string) =>
  [...document.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  );

test('a sent slash command shows a live card at once, then its panel in colour, with keys', async () => {
  let lines: string[] = [];
  const { bridge, calls } = fakeBridge({
    chat: () => envelope(chatOf([])),
    panel: () => envelope({ session: 'a1b2c3d4', command: '/usage', lines }),
    keys: () => envelope({ session: 'a1b2c3d4', keys: ['Down'] }),
  });
  const onOpenTerminal = vi.fn();
  const byTestId = await renderWithMesa(
    <ChatPanel
      sessionId="a1b2c3d4"
      acting={false}
      sent={{ id: 'a1b2c3d4', prompt: '/usage', at: Date.now() }}
      onSend={() => {}}
      onOpenTerminal={onOpenTerminal}
    />,
    bridge,
  );
  const card = byTestId('command-card')[0];
  expect(card?.textContent).toContain('/usage');
  expect(byTestId('chat-messages')[0]?.textContent).not.toContain('Sending');
  // Read only while the app's window has focus, about every second.
  window.dispatchEvent(new Event('focus'));
  await new Promise((done) => setTimeout(done, 50));
  expect(calls).toContainEqual(['--json', 'panel', '--', 'a1b2c3d4', '/usage']);
  expect(card?.querySelector('.animate-spin')).not.toBeNull();
  lines = ['\x1b[31mSession\x1b[0m 65% used'];
  await new Promise((done) => setTimeout(done, 1100));
  expect(card?.querySelector('.animate-spin')).toBeNull();
  const red = card?.querySelector('pre span');
  expect(red?.textContent).toBe('Session');
  expect(red?.getAttribute('style')).toContain('color');
  await click(button('Press Down'));
  expect(calls).toContainEqual(['--json', 'keys', '--', 'a1b2c3d4', 'Down']);
  // Then a board look, so a closed picker no longer reads as a question that refuses a send.
  expect(calls.at(-1)).toEqual(['--json', 'sessions', '--tree', '--full']);
  await click(button('Open in terminal'));
  expect(onOpenTerminal).toHaveBeenCalled();
});

test("a transcript's command row is a card with its output, never a person's bubble", async () => {
  const { bridge } = fakeBridge({
    chat: () =>
      envelope(
        chatOf([
          { id: 'c1', at, text: '/model wren', from: 'command', output: 'Set model to Wren' },
        ]),
      ),
  });
  const byTestId = await renderWithMesa(
    <ChatPanel sessionId="a1b2c3d4" acting={false} onSend={() => {}} onOpenTerminal={() => {}} />,
    bridge,
  );
  expect(byTestId('command-card')[0]?.textContent).toBe('/model wrenSet model to Wren');
  expect(button('Press Enter')).toBeUndefined();
});

test('a marker joins the command row that records it, else sits where it was sent', () => {
  const sentAt = Date.parse(at);
  const row: ChatMessage = { id: 'c1', at, text: '/model', from: 'command', output: 'Kept' };
  const later: ChatMessage = {
    id: 'r1',
    at: '2026-09-28T12:05:00.000Z',
    text: 'Hi',
    from: 'agent',
  };
  const marker = { command: '/model', sentAt };
  expect(chatItems([row, later], [marker])).toEqual([{ message: row, marker }, { message: later }]);
  const codex = { command: '/status', sentAt };
  expect(chatItems([later], [codex])).toEqual([{ marker: codex }, { message: later }]);
  expect(chatItems([], [codex])).toEqual([{ marker: codex }]);
  // Typed with extra spaces, the transcript writes it with one.
  const spaced = { command: ' /model   wren', sentAt };
  const wren: ChatMessage = { ...row, text: '/model wren' };
  expect(chatItems([wren], [spaced])).toEqual([{ message: wren, marker: spaced }]);
});
