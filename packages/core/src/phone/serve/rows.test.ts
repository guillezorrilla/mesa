import { expect, test } from 'vitest';
import { sessionRow } from '../../testing/sessions.js';
import { phoneRows } from './rows.js';

const at = '2026-11-12T10:00:00.000Z';
const row = (id: string, fields: object = {}) =>
  sessionRow({
    id,
    managed: true,
    kind: 'interactive',
    agent: 'claude',
    alive: true,
    startedAt: at,
    lastState: { state: 'working', at },
    children: [],
    ...fields,
  });
const exited = { alive: false, lastState: { state: 'done', at } };

test('the phone lists the sessions the sidebar does, in the board order', () => {
  const board = [
    row('waits', { lastState: { state: 'waiting', at } }),
    row('ended', { ...exited, endedAt: at }),
    row('capture', { kind: 'run', name: 'Vault capture' }),
    row('setup', { kind: 'terminal', agent: 'terminal', name: 'Setup mesa', parent: 'waits' }),
    row('archived', { ...exited, archivedAt: at }),
    row('recoverable', exited),
    row('works'),
    sessionRow({ id: 'foreign', managed: false, alive: true, lastState: { state: 'working', at } }),
  ];
  expect(phoneRows(board).map((r) => r.id)).toEqual(['waits', 'recoverable', 'works']);
});
