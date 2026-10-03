// @vitest-environment happy-dom
import { act, createRef } from 'react';
import { expect, test } from 'vitest';
import { ProfileMenu } from '@/app/ProfileMenu';
import {
  click,
  envelope,
  fakeBridge,
  fakePlatform,
  fakeUpdates,
  renderWithMesa,
} from '@/lib/testing';
import { UpdateDialog } from './UpdateDialog';
import { UpdateSettings } from './UpdateSettings';

async function render(ui: React.ReactNode, initial: Parameters<typeof fakeUpdates>[0] = {}) {
  const updates = fakeUpdates(initial);
  let closed = 0;
  const { bridge, calls } = fakeBridge({
    'update channel': (args) => envelope({ channel: args[3] ?? 'beta', receipt: null }),
  });
  const platform = fakePlatform({
    updates: updates.host,
    lifecycle: { onCloseRequested: async () => () => {}, close: async () => void closed++ },
  });
  const byTestId = await renderWithMesa(ui, bridge, platform);
  const push = (change: Parameters<typeof updates.push>[0]) =>
    act(async () => updates.push(change));
  return { byTestId, calls: updates.calls, bridgeCalls: calls, push, closed: () => closed };
}
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(label),
  );

test('a downloaded update shows the dialog; Later hides it and Install installs', async () => {
  const { byTestId, calls, push } = await render(<UpdateDialog />);
  expect(byTestId('update-ready')).toEqual([]);
  await push({ phase: 'downloading', version: '0.1.0-beta.5' });
  expect(byTestId('update-ready')).toEqual([]);
  await push({ phase: 'ready' });
  const dialog = byTestId('update-ready')[0];
  expect(dialog?.textContent).toContain('Update Mesa');
  expect(dialog?.textContent).toContain('v0.1.0-beta.5 is ready to install.');
  expect(dialog?.textContent).toContain('Active sessions will not be interrupted.');
  await click(button('Later'));
  expect(calls).toEqual(['later']);
  expect(byTestId('update-ready')).toEqual([]);
  // A manual check shows it again.
  await push({ dismissed: false });
  await click(button('Install'));
  expect(calls).toEqual(['later', 'install']);
});

test('a build that cannot update says why and offers the download page instead of Install', async () => {
  const { byTestId, calls } = await render(<UpdateDialog />, {
    phase: 'unsupported',
    version: '0.1.0-beta.5',
    message: 'This is a development build, which does not update itself.',
  });
  expect(byTestId('update-ready')[0]?.textContent).toContain('development build');
  expect(button('Install')).toBeUndefined();
  await click(button('Open download page'));
  expect(calls).toEqual(['openPage']);
});

test('a revoked version blocks with its reason, Check for update, and Quit', async () => {
  const { byTestId, calls, push, closed } = await render(<UpdateDialog />, {
    phase: 'up-to-date',
    revoked: { version: '0.1.0-beta.4', reason: 'It loses session logs.' },
  });
  const dialog = byTestId('update-revoked')[0];
  expect(dialog?.textContent).toContain('It loses session logs.');
  expect(dialog?.querySelector('[data-slot="dialog-close"]')).toBeNull();
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(byTestId('update-revoked')).toHaveLength(1);
  await click(button('Check for update'));
  expect(calls).toEqual(['check']);
  await push({ phase: 'ready', version: '0.1.0-beta.5' });
  await click(button('Install v0.1.0-beta.5'));
  expect(calls).toEqual(['check', 'install']);
  await click(button('Quit'));
  expect(closed()).toBe(1);
});

test('the profile menu checks for updates and keeps an Update ready entry after Later', async () => {
  const { byTestId, calls, push } = await render(
    <ProfileMenu ref={createRef()} doctor={undefined} onSettings={() => {}} />,
  );
  expect(byTestId('update-ready-entry')).toEqual([]);
  await click(byTestId('check-for-updates')[0]);
  expect(calls).toEqual(['check']);
  await push({ phase: 'ready', version: '0.1.0-beta.5', dismissed: true });
  expect(byTestId('update-ready-entry')[0]?.textContent).toContain('Update ready: v0.1.0-beta.5');
  await click(byTestId('update-ready-entry')[0]);
  expect(calls).toEqual(['check', 'check']);
});

test('Settings switches the channel through core and checks the new feed', async () => {
  const { calls, bridgeCalls } = await render(<UpdateSettings />, { phase: 'up-to-date' });
  expect(document.body.textContent).toContain('Mesa is up to date.');
  const stable = document.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
  expect(stable?.textContent).toBe('Stable');
  await click(stable ?? undefined);
  expect(bridgeCalls).toContainEqual(['--json', 'update', 'channel', 'stable']);
  expect(calls).toEqual(['check']);
  await click(button('Check now'));
  expect(calls).toEqual(['check', 'check']);
});
