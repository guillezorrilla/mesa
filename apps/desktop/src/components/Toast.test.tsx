// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { click, fakeBridge, renderWithMesa, toasts } from '@/lib/testing';
import { CONFIRMATION_MS, said, useToast, warningOf } from './Toast';

/** A button that toasts `message` each press. */
function Toaster(props: { message: ReturnType<typeof said> }) {
  const toast = useToast();
  return (
    <button
      type="button"
      data-testid="toaster"
      onClick={() => toast(props.message.text, props.message.tone)}
    >
      toast
    </button>
  );
}

test('a confirmation is neutral, shows every time, and goes by itself', async () => {
  vi.useFakeTimers();
  try {
    const byTestId = await renderWithMesa(
      <Toaster message={said('Response copied')} />,
      fakeBridge().bridge,
    );
    await click(byTestId('toaster')[0]);
    await click(byTestId('toaster')[0]);
    expect(toasts(byTestId)).toEqual([
      ['confirmation', 'Response copied'],
      ['confirmation', 'Response copied'],
    ]);
    await act(async () => vi.advanceTimersByTime(CONFIRMATION_MS));
    expect(toasts(byTestId)).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('warningOf keeps only a command warning, as an alert', () => {
  expect(warningOf({ warning: 'no receipt' })).toEqual({ text: 'no receipt', tone: 'alert' });
  expect(warningOf({})).toBeUndefined();
  expect(warningOf(undefined)).toBeUndefined();
});

test('an alert shows once, and once dismissed it does not come back', async () => {
  const byTestId = await renderWithMesa(
    <Toaster message={{ text: 'sessions: cannot read', tone: 'alert' }} />,
    fakeBridge().bridge,
  );
  await click(byTestId('toaster')[0]);
  await click(byTestId('toaster')[0]);
  expect(toasts(byTestId)).toEqual([['alert', 'sessions: cannot read']]);
  await click(
    byTestId('toast')[0]?.querySelector<HTMLElement>('[aria-label="Dismiss"]') ?? undefined,
  );
  await click(byTestId('toaster')[0]);
  expect(toasts(byTestId)).toEqual([]);
});
