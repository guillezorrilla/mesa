// @vitest-environment happy-dom
import { act, createRef } from 'react';
import { expect, test } from 'vitest';
import { ProfileMenu } from '@/features/profile/ProfileMenu';
import {
  click,
  envelope,
  fakeBridge,
  fakePlatform,
  fakeUpdates,
  renderWithMesa,
} from '@/lib/testing';
import { UpdateDialog } from './UpdateDialog';
import { UpdateSettingsPanel } from './UpdateSettingsPanel';

async function render(
  ui: React.ReactNode,
  initial: Parameters<typeof fakeUpdates>[0] & { eraseFails?: boolean } = {},
) {
  const updates = fakeUpdates(initial);
  let closed = 0;
  // The install count's switch: `installs` reads it, `installs on|off` sets it (off erases it).
  let enabled = true;
  const { bridge, calls } = fakeBridge({
    'update channel': (args) => envelope({ channel: args[3] ?? 'beta', receipt: null }),
    installs: (args) => {
      const to = args.at(-1);
      if (to === 'on' || to === 'off') enabled = to === 'on';
      const status = { id: '00000000-0000-4000-8000-000000000001', enabled, lastSentAt: null };
      return envelope(to === 'off' ? { ...status, erased: initial.eraseFails !== true } : status);
    },
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
  expect(calls).toEqual(['check', 'install', 'quit']);
  expect(closed()).toBe(0);
});

test('a revoked build that cannot update itself offers the download page', async () => {
  const { byTestId, calls } = await render(<UpdateDialog />, {
    phase: 'unsupported',
    version: '0.1.0-beta.5',
    message: 'Mesa is running from the disk image or a temporary copy.',
    revoked: { version: '0.1.0-beta.4', reason: 'It loses session logs.' },
  });
  expect(byTestId('update-revoked')[0]?.textContent).toContain('disk image');
  expect(button('Check for update')).toBeUndefined();
  await click(button('Open download page'));
  expect(calls).toEqual(['openPage']);
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
  await push({
    phase: 'failed',
    message: 'The update to 0.1.0-beta.5 was refused: signature mismatch. Nothing was changed.',
  });
  expect(byTestId('update-status')[0]?.textContent).toContain('was refused');
});

test('Settings switches the channel through core and checks the new feed', async () => {
  const { calls, bridgeCalls } = await render(<UpdateSettingsPanel />, { phase: 'up-to-date' });
  expect(document.body.textContent).toContain('Mesa is up to date.');
  const stable = document.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="false"]');
  expect(stable?.textContent).toBe('Stable');
  await click(stable ?? undefined);
  expect(bridgeCalls).toContainEqual(['--json', 'update', 'channel', 'stable']);
  expect(calls).toEqual(['check']);
  await click(button('Check now'));
  expect(calls).toEqual(['check', 'check']);
});

test('Settings shows the anonymous install count on, and its switch turns it off through core', async () => {
  const { bridgeCalls } = await render(<UpdateSettingsPanel />, { phase: 'up-to-date' });
  expect(document.body.textContent).toContain('Anonymous install count');
  expect(document.body.textContent).toContain('Nothing about your work or how you use Mesa.');
  const toggle = document.querySelector<HTMLButtonElement>('#install-count');
  expect(toggle?.getAttribute('aria-checked')).toBe('true');
  await click(toggle ?? undefined);
  expect(bridgeCalls).toContainEqual(['--json', 'installs', 'off']);
  expect(document.querySelector('#install-count')?.getAttribute('aria-checked')).toBe('false');
});

test("turning the install count off says so when the erase didn't reach the server", async () => {
  await render(<UpdateSettingsPanel />, { phase: 'up-to-date', eraseFails: true });
  await click(document.querySelector<HTMLButtonElement>('#install-count') ?? undefined);
  expect(document.body.textContent).toContain("The erase didn't reach Mesa's server");
});
