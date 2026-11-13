// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { failure, fakeBridge, renderWithMesa, toasts } from '@/lib/testing';
import { usePhoneListenerOnLaunch } from './usePhoneListenerOnLaunch';

function Launch() {
  usePhoneListenerOnLaunch();
  return null;
}

test('the app looks at the phone pairing once at launch, and a failure says nothing', async () => {
  const { bridge, calls } = fakeBridge({ 'phone status': () => failure('offline', 'internal') });
  const byTestId = await renderWithMesa(<Launch />, bridge);
  expect(calls.filter((args) => args[1] === 'phone' && args[2] === 'status')).toHaveLength(1);
  expect(toasts(byTestId)).toEqual([]);
});
