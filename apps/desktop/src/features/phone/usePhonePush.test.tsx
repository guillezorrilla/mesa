// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  failure,
  fakeBridge,
  fakePlatform,
  fakeSessionEvents,
  renderWithMesa,
  toasts,
} from '@/lib/testing';
import { usePhonePush } from './usePhonePush';

function Pusher() {
  usePhonePush();
  return null;
}

test('a session event asks core to push to the phone, and a failure says nothing', async () => {
  const { bridge, calls } = fakeBridge({ 'phone push': () => failure('offline', 'internal') });
  const events = fakeSessionEvents();
  const byTestId = await renderWithMesa(
    <Pusher />,
    bridge,
    fakePlatform({ sessions: events.host }),
  );
  const pushes = () => calls.filter((args) => args[1] === 'phone' && args[2] === 'push').length;
  expect(pushes()).toBe(1);
  await act(async () => events.push());
  expect(pushes()).toBe(2);
  expect(toasts(byTestId)).toEqual([]);
});
