// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { SLEEP_PASS_MS } from '@/features/sessions/useSleepIdle';
import { click, envelope, fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { App } from './App';

const sleeps = (calls: string[][]) => calls.filter((args) => args[1] === 'sleep');

test('a sleeping session shows a Sleeping badge on its card; an awake one none', async () => {
  const { bridge } = fakeBridge({
    sessions: () =>
      envelope([
        managedRow('aaaaaaaa', { sleeping: { at: '2026-11-10T12:00:00.000Z' } }),
        managedRow('bbbbbbbb'),
      ]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const cards = byTestId('sidebar-session');
  const card = (id: string) => cards.find((c) => c.dataset.sessionId === id);
  expect(card('aaaaaaaa')?.querySelector('[data-testid="session-sleeping"]')?.textContent).toBe(
    'Sleeping',
  );
  expect(card('bbbbbbbb')?.querySelector('[data-testid="session-sleeping"]')).toBeNull();
});

test('with sessions.sleepAfterMinutes on, the app runs the sleep pass at once and every minute; off, never', async () => {
  vi.useFakeTimers();
  try {
    const healthy = (await fakeBridge().bridge(['--json', 'config'])) as { data: Config };
    let after = 30;
    const { bridge, calls } = fakeBridge({
      config: () =>
        envelope({
          ...healthy.data,
          sessions: { ...healthy.data.sessions, sleepAfterMinutes: after },
        }),
      sessions: () => envelope([managedRow('aaaaaaaa')]),
      sleep: () => envelope({ slept: [] }),
    });
    await renderWithMesa(<App />, bridge);
    expect(sleeps(calls)).toEqual([['--json', 'sleep']]);
    await act(async () => vi.advanceTimersByTime(SLEEP_PASS_MS));
    expect(sleeps(calls)).toHaveLength(2);

    after = 0;
    const off = fakeBridge({
      config: () =>
        envelope({ ...healthy.data, sessions: { ...healthy.data.sessions, sleepAfterMinutes: 0 } }),
    });
    await renderWithMesa(<App />, off.bridge);
    await act(async () => vi.advanceTimersByTime(SLEEP_PASS_MS * 2));
    expect(sleeps(off.calls)).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('opening a sleeping session wakes it, and its terminal attaches once it is awake', async () => {
  let sleeping = true;
  const { bridge, calls } = fakeBridge({
    sessions: () =>
      envelope([
        managedRow('aaaaaaaa', sleeping ? { sleeping: { at: '2026-11-10T12:00:00.000Z' } } : {}),
      ]),
    wake: () => {
      sleeping = false;
      return envelope({ ...managedRow('aaaaaaaa'), receipt: null });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(calls).not.toContainEqual(['--json', 'wake', '--', 'aaaaaaaa']);
  await click(byTestId('sidebar-session')[0]);
  // Shown: woken once, then the look after it shows it awake, with its terminal.
  expect(calls.filter((c) => c[1] === 'wake')).toEqual([['--json', 'wake', '--', 'aaaaaaaa']]);
  expect(byTestId('session-asleep')).toHaveLength(0);
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(1);
});
