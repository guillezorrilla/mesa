import { expect, test } from 'vitest';
import { planDelivery } from './delivery-plan.js';
import type { InboxItem } from './inbox-items.js';

const SETTINGS = {
  quiet: false,
  visualAlert: true,
  inputRequired: 'sound',
  finished: 'off',
  subagent: 'silent',
  doctor: 'silent',
  automation: 'silent',
} as const;

const item = (id: string, kind: InboxItem['kind'], read = false): InboxItem => ({
  id,
  session: 'lantern',
  at: `2026-09-24T12:00:0${id}.000Z`,
  kind,
  title: `Notice ${id}`,
  read,
  target: { kind: 'session', id: 'lantern' },
});

test('planDelivery returns the plan and the skipped ids without touching its inputs', () => {
  const items = [item('4', 'subagent'), item('3', 'finished'), item('2', 'input-required', true)];
  const state = { startedAt: '2026-09-24T12:00:01.000Z', delivered: ['1'] };
  const before = structuredClone({ items, state });
  expect(planDelivery(items, SETTINGS, state)).toEqual({
    plan: expect.objectContaining({ kind: 'notice', id: '4', ids: ['4'], sound: false }),
    skipped: ['3', '2'],
  });
  expect({ items, state }).toEqual(before);
  expect(planDelivery(items, { ...SETTINGS, quiet: true }, state).plan).toEqual({ kind: 'none' });
});
