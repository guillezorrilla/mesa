// @vitest-environment happy-dom
import type { DoctorReport, InboxItem } from '@mesa/core';
import { timeAgo } from '@mesa/core/browser';
import { useState } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, failure, fakeBridge, renderWithMesa, toastTexts } from '@/lib/testing';
import { NotificationsMenu } from './NotificationsMenu';

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
const REVIEW =
  'The next Codex start asks you to review hooks: choose "Review hooks" in "Hooks need review" and trust Mesa\'s entries.';
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );

test('an automation notice retains reconnect guidance and opens Automations', async () => {
  const failure: InboxItem = {
    ...hooks,
    kind: 'automation',
    title: 'Automation failed: Refresh tides',
    detail: 'Notion needs reconnecting: run mesa sources connect notion',
    fix: undefined,
    target: { kind: 'automations' },
  };
  const { bridge, calls } = fakeBridge({
    notifications: () => envelope([failure]),
    'notifications read': () => envelope({ id: failure.id, read: true }),
  });
  let opened = 0;
  const byTestId = await renderWithMesa(
    <NotificationsMenu
      open
      onOpenChange={() => {}}
      onSession={() => {}}
      onDoctor={() => {}}
      onAutomations={() => {
        opened++;
      }}
      onSettings={() => {}}
      onRecheck={async () => {}}
    />,
    bridge,
  );
  expect(byTestId('inbox-panel')[0]?.textContent).toContain(failure.detail);
  await click(button('Review automation'));
  expect(opened).toBe(1);
  expect(calls.some((args) => args[2] === 'read' && args.at(-1) === failure.id)).toBe(true);
});

test('a Doctor notice explains itself and its fix runs, then Doctor rechecks', async () => {
  let installed = false;
  let rechecks = 0;
  const { bridge, calls } = fakeBridge({
    notifications: () => envelope(installed ? [finished] : [hooks, finished]),
    'notifications read': (args) => envelope({ id: args.at(-1), read: true }),
    'hooks install': () => {
      installed = true;
      return envelope({ changed: true, codex: { changed: false, hint: '' }, receipt: null });
    },
  });
  const opened: string[] = [];
  const byTestId = await renderWithMesa(
    <NotificationsMenu
      open
      onOpenChange={() => {}}
      onSession={(id) => opened.push(id)}
      onDoctor={() => opened.push('doctor')}
      onAutomations={() => opened.push('automations')}
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

test('a notice for hooks that need an update offers Update hooks, which runs the install and says how Codex approves them', async () => {
  const update: InboxItem = {
    ...hooks,
    title: 'Session hooks need an update',
    detail:
      "Your coding agents run Mesa's older hooks, so sessions can miss its tracking and advice.",
    fix: 'hooks update',
  };
  const { bridge, calls } = fakeBridge({
    notifications: () => envelope([update]),
    'hooks install': () =>
      envelope({ changed: true, codex: { changed: true, hint: REVIEW }, receipt: null }),
  });
  const byTestId = await renderWithMesa(
    <NotificationsMenu
      open
      onOpenChange={() => {}}
      onSession={() => {}}
      onDoctor={() => {}}
      onAutomations={() => {}}
      onSettings={() => {}}
      onRecheck={async () => {}}
    />,
    bridge,
  );
  expect(button('Enable hooks')).toBeUndefined();
  await click(button('Update hooks'));
  expect(calls.some((args) => args[1] === 'hooks' && args[2] === 'install')).toBe(true);
  // The update changed Codex's hooks: the same note the card shows, as an alert.
  expect(toastTexts(byTestId)).toEqual([
    `Codex needs you to approve Mesa's updated hooks. ${REVIEW}`,
  ]);
});

test('Clear all asks first, then clears the whole center in one call', async () => {
  let cleared = false;
  const closed: boolean[] = [];
  const { bridge, calls } = fakeBridge({
    notifications: () => envelope(cleared ? [] : [hooks, { ...finished, read: true }]),
    'notifications clear --all': () => {
      cleared = true;
      return envelope({ count: 2 });
    },
  });
  const byTestId = await renderWithMesa(
    <NotificationsMenu
      open
      onOpenChange={(open) => closed.push(open)}
      onSession={() => {}}
      onDoctor={() => {}}
      onAutomations={() => {}}
      onSettings={() => {}}
      onRecheck={async () => {}}
    />,
    bridge,
  );
  const clears = () => calls.filter((args) => args[2] === 'clear');
  await click(button('Clear all'));
  expect(closed).toContain(false);
  expect(byTestId('clear-notifications-dialog')[0]?.textContent).toContain('2 notices, 1 unread');
  expect(clears()).toEqual([]);
  await click(byTestId('confirm-clear-notifications')[0]);
  expect(clears()).toEqual([['--json', 'notifications', 'clear', '--all']]);
  expect(byTestId('clear-notifications-dialog')).toHaveLength(0);
  expect(byTestId('nav-inbox')[0]?.getAttribute('aria-label')).toBe('Notifications');
});

test('notice times read as relative times', () => {
  const now = Date.parse('2026-09-30T12:00:00.000Z');
  expect(timeAgo('2026-09-30T11:59:40.000Z', now)).toBe('just now');
  expect(timeAgo('2026-09-30T11:15:00.000Z', now)).toBe('45m ago');
  expect(timeAgo('2026-09-30T09:00:00.000Z', now)).toBe('3h ago');
  expect(timeAgo('2026-09-23T10:00:00.000Z', now)).toBe(
    new Date('2026-09-23T10:00:00.000Z').toLocaleDateString(),
  );
});

test('a new Doctor report is read into the bell without opening the menu', async () => {
  let recorded = false;
  const { bridge } = fakeBridge({ notifications: () => envelope(recorded ? [hooks] : []) });
  function Harness() {
    const [doctor, setDoctor] = useState<DoctorReport>();
    return (
      <>
        <button
          type="button"
          onClick={() => {
            recorded = true;
            setDoctor({ healthy: true, summary: 'ready', checks: [] });
          }}
        >
          Doctor ran
        </button>
        <NotificationsMenu
          open={false}
          onOpenChange={() => {}}
          onSession={() => {}}
          onDoctor={() => {}}
          onAutomations={() => {}}
          onSettings={() => {}}
          onRecheck={async () => {}}
          doctor={doctor}
        />
      </>
    );
  }
  const byTestId = await renderWithMesa(<Harness />, bridge);
  expect(byTestId('nav-inbox')[0]?.getAttribute('aria-label')).toBe('Notifications');
  await click(button('Doctor ran'));
  expect(byTestId('nav-inbox')[0]?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
});

test('opening a session reads its notice, so the bell counts one fewer unread', async () => {
  const other: InboxItem = {
    ...finished,
    id: '2026-09-23T09:30:00.000Z:other',
    session: 'bbbbbbbb',
    target: { kind: 'session', id: 'bbbbbbbb' },
  };
  const read = new Set<string>();
  const { bridge, calls } = fakeBridge({
    notifications: () =>
      envelope([other, finished].map((item) => ({ ...item, read: read.has(item.id) }))),
    'notifications read': (args) => {
      read.add(String(args.at(-1)));
      return envelope({ id: args.at(-1), read: true });
    },
  });
  function Harness() {
    const [session, setSession] = useState<string>();
    return (
      <>
        <button type="button" onClick={() => setSession('aaaaaaaa')}>
          Open session
        </button>
        <NotificationsMenu
          open={false}
          onOpenChange={() => {}}
          onSession={() => {}}
          onDoctor={() => {}}
          onAutomations={() => {}}
          onSettings={() => {}}
          onRecheck={async () => {}}
          session={session}
        />
      </>
    );
  }
  const byTestId = await renderWithMesa(<Harness />, bridge);
  const bell = () => byTestId('nav-inbox')[0]?.getAttribute('aria-label');
  expect(bell()).toBe('Notifications, 2 unread');
  await click(button('Open session'));
  expect(calls.filter((args) => args[2] === 'read').map((args) => args.at(-1))).toEqual([
    finished.id,
  ]);
  expect(bell()).toBe('Notifications, 1 unread');
});

test('a notice a newer turn replaced is read quietly, without an error toast', async () => {
  const newer: InboxItem = { ...finished, id: '2026-09-23T09:05:00.000Z:turn', read: true };
  let replaced = false;
  const { bridge, calls } = fakeBridge({
    notifications: () => envelope([replaced ? newer : finished]),
    // The session finished another turn after the list was read, so its old notice is gone.
    'notifications read': (args) => {
      replaced = true;
      return failure(`no inbox item ${args.at(-1)}`);
    },
  });
  const byTestId = await renderWithMesa(
    <NotificationsMenu
      open={false}
      onOpenChange={() => {}}
      onSession={() => {}}
      onDoctor={() => {}}
      onAutomations={() => {}}
      onSettings={() => {}}
      onRecheck={async () => {}}
      session="aaaaaaaa"
    />,
    bridge,
  );
  expect(calls.filter((args) => args[2] === 'read').map((args) => args.at(-1))).toEqual([
    finished.id,
  ]);
  expect(toastTexts(byTestId)).toEqual([]);
  expect(byTestId('nav-inbox')[0]?.getAttribute('aria-label')).toBe('Notifications');
});

const release: InboxItem = {
  id: '2026-09-23T11:00:00.000Z:release:0.1.6',
  session: '',
  at: '2026-09-23T11:00:00.000Z',
  kind: 'release',
  title: "What's new in v0.1.6",
  read: false,
  target: { kind: 'release', version: '0.1.6' },
  notes: {
    version: '0.1.6',
    date: '2026-09-23',
    added: ['Tide charts in the minimap.', 'A <b>bold</b> lantern board.'],
    changed: ['The Board opens faster.'],
    fixed: [
      'Kelp sync.',
      'Reef scroll.',
      'Harbor lights.',
      'Buoy names.',
      'Dock order.',
      'Gull tray.',
    ],
  },
};

test('a release notice sums its notes, expands to them as plain text, and expanding marks it read', async () => {
  let read = false;
  const { bridge, calls } = fakeBridge({
    notifications: () => envelope([{ ...release, read }]),
    'notifications read': (args) => {
      read = true;
      return envelope({ id: args.at(-1), read: true });
    },
    'notifications clear': (args) => envelope({ id: args.at(-1), cleared: true }),
  });
  let closed = 0;
  const byTestId = await renderWithMesa(
    <NotificationsMenu
      open
      onOpenChange={(open) => {
        if (!open) closed++;
      }}
      onSession={() => {}}
      onDoctor={() => {}}
      onAutomations={() => {}}
      onSettings={() => {}}
      onRecheck={async () => {}}
    />,
    bridge,
  );
  expect(byTestId('release-summary')[0]?.textContent).toBe('2 new · 1 changed · 6 fixed');
  expect(byTestId('release-notes')).toHaveLength(0);

  await click(button('Show notes'));
  const notes = byTestId('release-notes')[0];
  expect(
    [...(notes?.querySelectorAll('[data-slot="badge"]') ?? [])].map((b) => b.textContent),
  ).toEqual(['New', 'Changed', 'Fixed']);
  expect(notes?.querySelectorAll('li')).toHaveLength(9);
  // A note is text, never markup.
  expect(notes?.querySelector('b')).toBeNull();
  expect(notes?.textContent).toContain('A <b>bold</b> lantern board.');
  expect(calls.filter((args) => args[2] === 'read').map((args) => args.at(-1))).toEqual([
    release.id,
  ]);
  // It opens in place: the menu stays open.
  expect(closed).toBe(0);

  await click(button('Hide notes'));
  expect(byTestId('release-notes')).toHaveLength(0);
  // Expanding again does not mark it read twice.
  await click(button("What's new in v0.1.6"));
  expect(byTestId('release-notes')).toHaveLength(1);
  expect(calls.filter((args) => args[2] === 'read')).toHaveLength(1);

  await click(button("Clear What's new in v0.1.6"));
  expect(calls.some((args) => args[2] === 'clear' && args.at(-1) === release.id)).toBe(true);
});

test('Mark all read marks a release notice read', async () => {
  const { bridge, calls } = fakeBridge({
    notifications: () => envelope([release, finished]),
    'notifications read': (args) => envelope({ id: args.at(-1), read: true }),
  });
  await renderWithMesa(
    <NotificationsMenu
      open
      onOpenChange={() => {}}
      onSession={() => {}}
      onDoctor={() => {}}
      onAutomations={() => {}}
      onSettings={() => {}}
      onRecheck={async () => {}}
    />,
    bridge,
  );
  await click(button('Mark all read'));
  expect(calls.filter((args) => args[2] === 'read').map((args) => args.at(-1))).toEqual([
    release.id,
    finished.id,
  ]);
});
