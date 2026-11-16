// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { envelope, failure, fakeBridge, renderWithMesa } from '@/lib/testing';
import { type SessionPrompt, useSessionPrompt } from './useSessionPrompt';

/** The hook's `send` and `sent`, held where the test reads them. */
const held: { prompt?: SessionPrompt } = {};
function Probe() {
  held.prompt = useSessionPrompt({
    act: async (action) => void (await action()),
    selectedSession: 'aaaaaaaa',
    selectionVersion: { current: 0 },
    openDialog: () => {},
    closeDialog: () => {},
  });
  return <p data-testid="sent">{held.prompt.sent?.prompt ?? ''}</p>;
}

test('a prompt shows as sent at once, before the CLI answers, and is taken back when it is refused', async () => {
  let answer: (value: unknown) => void = () => undefined;
  const { bridge } = fakeBridge({
    send: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  const byTestId = await renderWithMesa(<Probe />, bridge);
  let sending: Promise<void> | undefined;
  await act(async () => {
    sending = held.prompt?.send('aaaaaaaa', 'chart the tide', document.createElement('form'));
  });
  expect(byTestId('sent')[0]?.textContent).toBe('chart the tide');
  await act(async () => {
    answer(failure('session aaaaaaaa has ended', 'agent_unavailable'));
    await sending;
  });
  expect(byTestId('sent')[0]?.textContent).toBe('');
  expect(held.prompt?.refused?.text).toBe('session aaaaaaaa has ended');
});

test('a prompt sent stays shown once the CLI says it was sent', async () => {
  const { bridge } = fakeBridge({
    send: () => envelope({ sent: true, session: 'aaaaaaaa', from: null, chars: 5 }),
  });
  const byTestId = await renderWithMesa(<Probe />, bridge);
  await act(async () => {
    await held.prompt?.send('aaaaaaaa', 'chart the tide', document.createElement('form'));
  });
  expect(byTestId('sent')[0]?.textContent).toBe('chart the tide');
});
