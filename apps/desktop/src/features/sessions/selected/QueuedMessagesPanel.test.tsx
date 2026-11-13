// @vitest-environment happy-dom
import type { QueuedEntry } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { QueuedMessagesPanel } from './QueuedMessagesPanel';

const queued = (id: string, text: string, error?: string): QueuedEntry => ({
  id,
  session: 'a1b2c3d4',
  text,
  at: '2026-09-24T11:58:00.000Z',
  from: 'phone',
  ...(error ? { error } : {}),
});

test("a session's queued replies from the phone each have Remove, which takes one back", async () => {
  let held = [
    queued('m1', 'then the docs'),
    queued('m2', 'and the changelog', 'the session is no longer on the board'),
  ];
  const { bridge, calls } = fakeBridge({
    'queue list': () => envelope(held),
    'queue remove': (args) => {
      const id = args.at(-1);
      held = held.filter((m) => m.id !== id);
      return envelope({ id, removed: true });
    },
  });
  const byTestId = await renderWithMesa(<QueuedMessagesPanel sessionId="a1b2c3d4" />, bridge);
  const list = byTestId('queued-messages')[0];
  expect(list?.textContent).toContain('Queued from your phone');
  expect(list?.textContent).toContain('then the docs');
  expect(list?.textContent).toContain('Not sent: the session is no longer on the board');
  expect(calls).toContainEqual(['--json', 'queue', 'list', 'a1b2c3d4']);

  await click(
    document.querySelector<HTMLButtonElement>('[aria-label="Remove queued reply m1"]') ?? undefined,
  );
  expect(calls).toContainEqual(['--json', 'queue', 'remove', 'm1']);
  expect(byTestId('queued-messages')[0]?.textContent).not.toContain('then the docs');
  expect(byTestId('queued-messages')[0]?.textContent).toContain('and the changelog');
});

test('nothing shows when no reply waits', async () => {
  const { bridge } = fakeBridge({ 'queue list': () => envelope([]) });
  const byTestId = await renderWithMesa(<QueuedMessagesPanel sessionId="a1b2c3d4" />, bridge);
  expect(byTestId('queued-messages')).toEqual([]);
});

test('a reply the phone removed leaves the list within 2 s while any wait', async () => {
  let held = [queued('m1', 'then the docs'), queued('m2', 'and the changelog')];
  const { bridge } = fakeBridge({ 'queue list': () => envelope(held) });
  const byTestId = await renderWithMesa(<QueuedMessagesPanel sessionId="a1b2c3d4" />, bridge);
  expect(byTestId('queued-messages')[0]?.textContent).toContain('then the docs');
  held = held.filter((m) => m.id !== 'm1');
  await new Promise((done) => setTimeout(done, 2500));
  expect(byTestId('queued-messages')[0]?.textContent).not.toContain('then the docs');
  expect(byTestId('queued-messages')[0]?.textContent).toContain('and the changelog');
});
