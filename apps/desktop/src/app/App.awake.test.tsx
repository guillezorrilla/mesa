// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  envelope,
  fakeBridge,
  fakePlatform,
  fakeSessionEvents,
  managedRow,
  renderWithMesa,
} from '@/lib/testing';
import { App } from './App';

const configWith = async (keepAwake: Config['sessions']['keepAwake']) => {
  const base = ((await fakeBridge().bridge(['--json', 'config'])) as { data: Config }).data;
  return { ...base, sessions: { ...base.sessions, keepAwake } };
};
const icon = () => document.querySelector('[data-testid="keep-awake"]');

test('While agents work holds the assertion while a session works, and releases it once none does', async () => {
  let state: 'working' | 'idle' = 'working';
  const config = await configWith('working');
  const { bridge } = fakeBridge({
    config: () => envelope(config),
    sessions: () =>
      envelope([managedRow('aaaaaaaa', { lastState: { ...managedRow('x').lastState, state } })]),
  });
  const events = fakeSessionEvents();
  const platform = fakePlatform({ sessions: events.host });
  await renderWithMesa(<App />, bridge, platform);
  expect(platform.awake.calls).toEqual(['hold']);
  expect(icon()?.getAttribute('title')).toBe('Keeping the Mac awake');
  // The turn's end: its Stop hook event makes the board look again.
  state = 'idle';
  await act(async () => events.push());
  expect(platform.awake.calls).toEqual(['hold', 'release']);
  expect(icon()).toBeNull();
});

test('Off never holds the assertion, even with a session working', async () => {
  const config = await configWith('off');
  const { bridge } = fakeBridge({
    config: () => envelope(config),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
  });
  const platform = fakePlatform();
  await renderWithMesa(<App />, bridge, platform);
  expect(platform.awake.calls).toEqual([]);
  expect(icon()).toBeNull();
});
