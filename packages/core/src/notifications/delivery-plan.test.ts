import { expect, test } from 'vitest';
import { FINISHED_HOLD_MS, planDelivery } from './delivery-plan.js';
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
  const state = {
    startedAt: '2026-09-24T12:00:01.000Z',
    delivered: ['1'],
    now: '2026-09-24T12:01:00.000Z',
    seenAt: () => undefined,
  };
  const { seenAt: _, ...values } = state;
  const before = structuredClone({ items, values });
  expect(planDelivery(items, SETTINGS, state)).toEqual({
    plan: expect.objectContaining({ kind: 'notice', id: '4', ids: ['4'], sound: false }),
    skipped: ['3', '2'],
  });
  expect({ items, values }).toEqual(before);
  expect(planDelivery(items, { ...SETTINGS, quiet: true }, state).plan).toEqual({ kind: 'none' });
});

test('a finished turn banners once no one had its session open since, after a short hold', () => {
  const settings = { ...SETTINGS, finished: 'sound' } as const;
  const finished = [item('3', 'finished')];
  const at = Date.parse(finished[0]?.at ?? '');
  const plan = (now: number, seenAt?: string) =>
    planDelivery(finished, settings, {
      startedAt: '2026-09-24T12:00:00.000Z',
      delivered: [],
      now: new Date(now).toISOString(),
      seenAt: (session) => (session === 'lantern' ? seenAt : undefined),
    });
  // Held: the app may still mark the session it shows read.
  expect(plan(at + FINISHED_HOLD_MS - 1)).toEqual({ plan: { kind: 'none' }, skipped: [] });
  // Unread after the hold: sent, with its sound.
  expect(plan(at + FINISHED_HOLD_MS).plan).toMatchObject({ kind: 'notice', id: '3', sound: true });
  // Seen before it finished: still sent.
  expect(plan(at + FINISHED_HOLD_MS, '2026-09-24T12:00:00.000Z').plan).toMatchObject({ id: '3' });
  // Seen since, held or not: skipped for good.
  const seen = new Date(at + 1000).toISOString();
  expect(plan(at + 2000, seen)).toEqual({ plan: { kind: 'none' }, skipped: ['3'] });
  expect(plan(at + FINISHED_HOLD_MS, seen)).toEqual({ plan: { kind: 'none' }, skipped: ['3'] });
});
