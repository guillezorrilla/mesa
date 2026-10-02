// @vitest-environment happy-dom

import { act } from 'react';
import { expect, test } from 'vitest';
import {
  deferred,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  managedRow,
  PROJECTS,
  renderWithMesa,
} from '@/lib/testing';
import { App } from './App';

const newSessionKey = (init: KeyboardEventInit = {}) =>
  act(async () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true, ...init }),
    );
  });

test('pressing New session again while one is starting starts one session, and a later press another', async () => {
  const pending = deferred();
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => pending.promise,
  });
  await renderWithMesa(<App />, bridge);
  const opens = () => calls.filter((args) => args[1] === 'open');
  await newSessionKey();
  await newSessionKey();
  expect(opens()).toHaveLength(1);
  await act(async () => pending.resolve(envelope(managedRow('aaaaaaaa'))));
  await newSessionKey();
  expect(opens()).toHaveLength(2);
});

test('a held New session key does not start a session per key repeat', async () => {
  const { bridge, calls } = fakeBridge({ projects: () => envelope(PROJECTS) });
  await renderWithMesa(<App />, bridge);
  await newSessionKey({ repeat: true });
  expect(calls.filter((args) => args[1] === 'open')).toHaveLength(0);
});

test('a notice is marked delivered before it is sent, so a failed mark never sends it', async () => {
  const sent: string[] = [];
  const notice = {
    kind: 'notice' as const,
    id: '2026-09-24T12:00:01.000Z:abc123',
    ids: ['2026-09-24T12:00:01.000Z:abc123'],
    title: 'Session turn finished',
    body: 'Session aaaaaaaa',
    sound: true,
    target: { kind: 'session' as const, id: 'aaaaaaaa' },
  };
  const { bridge } = fakeBridge({
    'notifications delivery': () => envelope(notice),
    'notifications delivered': () => failure('inbox is locked'),
  });
  await renderWithMesa(
    <App />,
    bridge,
    fakePlatform({
      notifications: {
        status: async () => ({
          authorization: 'authorized',
          alertsEnabled: true,
          soundsEnabled: true,
        }),
        requestPermission: async () => {
          throw new Error('permission must be requested by a person');
        },
        send: async (item) => void sent.push(item.id),
        onOpen: async () => () => {},
        takeOpened: async () => null,
      },
    }),
  );
  expect(sent).toEqual([]);
});
