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
