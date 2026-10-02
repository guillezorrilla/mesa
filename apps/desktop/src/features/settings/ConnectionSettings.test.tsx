// @vitest-environment happy-dom
import type { SourceRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa, toastTexts } from '@/lib/testing';
import { ConnectionSettings } from './ConnectionSettings';

const SITES = [{ id: 'cloud-1', name: 'lantern-cove', url: 'https://lantern-cove.atlassian.net' }];
const DISCONNECTED: SourceRow = {
  id: 'atlassian',
  label: 'Atlassian',
  connected: false,
  status: 'disconnected',
};
const CONNECTED: SourceRow = {
  ...DISCONNECTED,
  connected: true,
  status: 'connected',
  account: { id: 'acc-1', name: 'Rowan Tide' },
  sites: SITES,
};

/** Settings > Connections over a bridge whose `sources list` answers `rows()` at each call. */
async function render(rows: () => SourceRow, answers: Parameters<typeof fakeBridge>[0] = {}) {
  const { bridge, calls } = fakeBridge({
    'sources list': () => envelope({ sources: [rows()] }),
    ...answers,
  });
  const byTestId = await renderWithMesa(<ConnectionSettings />, bridge);
  return { calls, byTestId };
}
const row = () => document.querySelector<HTMLElement>('[data-setting-row]');
const buttons = () => [...(row()?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
const button = (label: string) => buttons().find((b) => b.textContent === label);
const labels = () => buttons().map((b) => b.textContent);

test('a disconnected source offers Connect, which signs in and then shows the account and sites', async () => {
  let current = DISCONNECTED;
  const { calls, byTestId } = await render(() => current, {
    'sources connect': () => {
      current = CONNECTED;
      return envelope({ ...CONNECTED, receipt: null });
    },
  });
  expect(row()?.textContent).toContain('Not connected');
  expect(labels()).toEqual(['Connect']);
  await click(button('Connect'));
  expect(calls).toContainEqual(['--json', 'sources', 'connect', 'atlassian']);
  expect(row()?.textContent).toContain('Signed in as Rowan Tide. Sites: lantern-cove');
  expect(labels()).toEqual(['Disconnect']);
  expect(toastTexts(byTestId)).toContain('Connected Atlassian');
});

test('a connection that needs reconnecting offers Reconnect and Disconnect', async () => {
  const { account: _, ...revoked } = { ...CONNECTED, status: 'needs-reconnect' as const };
  await render(() => revoked);
  expect(row()?.textContent).toContain('reconnect to use it again. Sites: lantern-cove');
  expect(labels()).toEqual(['Reconnect', 'Disconnect']);
});

test('Disconnect removes the connection', async () => {
  let current = CONNECTED;
  const { calls } = await render(() => current, {
    'sources disconnect': () => {
      current = DISCONNECTED;
      return envelope({ source: 'atlassian', removed: true, receipt: null });
    },
  });
  await click(button('Disconnect'));
  expect(calls).toContainEqual(['--json', 'sources', 'disconnect', 'atlassian']);
  expect(labels()).toEqual(['Connect']);
});
