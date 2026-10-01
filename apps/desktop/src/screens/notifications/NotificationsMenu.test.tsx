// @vitest-environment happy-dom
import type { InboxItem } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { NotificationsMenu } from './NotificationsMenu';
import { timeAgo } from './timeAgo';

const hooks: InboxItem = {
  id: '2026-09-23T10:00:00.000Z:hooks',
  session: '',
  at: '2026-09-23T10:00:00.000Z',
  kind: 'doctor',
  title: 'Session hooks are not enabled',
  detail: "Mesa can't tell when a coding agent needs you or finishes a turn.",
  fix: 'hooks install',
  read: false,
  target: { kind: 'doctor' },
};
const finished: InboxItem = {
  id: '2026-09-23T09:00:00.000Z:turn',
  session: 'aaaaaaaa',
  at: '2026-09-23T09:00:00.000Z',
  kind: 'finished',
  title: 'Session turn finished',
  read: false,
  target: { kind: 'session', id: 'aaaaaaaa' },
};
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );

test('a Doctor notice explains itself and its fix runs, then Doctor rechecks', async () => {
  let installed = false;
  let rechecks = 0;
  const { bridge, calls } = fakeBridge({
    notifications: () => envelope(installed ? [finished] : [hooks, finished]),
    'notifications read': (args) => envelope({ id: args.at(-1), read: true }),
    'hooks install': () => {
      installed = true;
      return envelope({ changed: true, receipt: null });
    },
  });
  const opened: string[] = [];
  const byTestId = await renderWithMesa(
    <NotificationsMenu
      open
      onOpenChange={() => {}}
      onSession={(id) => opened.push(id)}
      onDoctor={() => opened.push('doctor')}
      onSettings={() => {}}
      onRecheck={async () => {
        rechecks++;
      }}
    />,
    bridge,
  );
  const panel = () => byTestId('inbox-panel')[0]?.textContent ?? '';
  expect(byTestId('nav-inbox')[0]?.getAttribute('aria-label')).toBe('Notifications, 2 unread');
  expect(panel()).toContain('2 unread');
  expect(panel()).toContain("Session hooks are not enabledMesa can't tell when a coding agent");
  await click(button('Enable hooks'));
  expect(calls.some((args) => args[1] === 'hooks' && args[2] === 'install')).toBe(true);
  expect(rechecks).toBe(1);
  expect(panel()).not.toContain('Session hooks are not enabled');
  await click(button('Mark all read'));
  expect(calls.filter((args) => args[2] === 'read').map((args) => args.at(-1))).toEqual([
    finished.id,
  ]);
  await click(button('Session turn finished'));
  expect(opened).toEqual(['aaaaaaaa']);
});

test('notice times read as Xirp writes them', () => {
  const now = Date.parse('2026-09-30T12:00:00.000Z');
  expect(timeAgo('2026-09-30T11:59:40.000Z', now)).toBe('just now');
  expect(timeAgo('2026-09-30T11:15:00.000Z', now)).toBe('45m ago');
  expect(timeAgo('2026-09-30T09:00:00.000Z', now)).toBe('3h ago');
  expect(timeAgo('2026-09-23T10:00:00.000Z', now)).toBe(
    new Date('2026-09-23T10:00:00.000Z').toLocaleDateString(),
  );
});
