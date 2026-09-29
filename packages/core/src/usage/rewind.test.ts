import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { writeReceipt } from '../receipts/store.js';
import {
  fixedClock,
  newSession,
  projectProfile,
  scriptedRunner,
  sequentialIds,
  testDeps,
  testStore,
} from '../testing/index.js';

test('weekly rewind keeps meaningful notes and outcomes within local days and names missing usage', async () => {
  const { run } = scriptedRunner();
  const clock = fixedClock('2026-09-24T12:00:00.000Z');
  const { home, mesa } = projectProfile(run, { clock });
  const vault = join(home, 'vault');
  const newId = sequentialIds();
  const write = (kind: 'decision' | 'vault-change', started: string, profile = 'default') =>
    writeReceipt(
      { vault, clock, newId },
      {
        type: 'decision',
        kind,
        profile,
        command: 'mesa decide',
        status: 'ok',
        summary: `${kind} in lantern-cove`,
        started,
      },
    );
  const recent = write('decision', '2026-09-24T11:00:00.000Z');
  write('vault-change', '2026-09-17T12:00:00.000Z');
  write('decision', '2026-09-24T10:00:00.000Z', 'other');
  const store = testStore(home);
  const session = store.create(() => newSession({ startedAt: '2026-09-24T10:00:00.000Z' }));
  const longRunning = store.create(() => newSession({ startedAt: '2026-09-01T10:00:00.000Z' }));
  store.update(session.id, { endedAt: '2026-09-24T11:30:00.000Z' });

  const report = await mesa.rewind.week();
  expect(report).toMatchObject({ from: '2026-09-18', through: '2026-09-24', timezone: 'UTC' });
  expect(report.notes.map((note) => note.path)).toEqual([recent.path]);
  expect(report.sessions.map((row) => row.id)).toEqual([session.id]);
  expect(report.usage.estimatedCostUsd).toBeNull();
  expect(report.missing).toContain(`${session.id}: native session id is not available`);
  expect(report.missing).toContain(`${longRunning.id}: native session id is not available`);
  expect((await createMesa('default', testDeps(home, { clock })).rewind.week()).notes).toEqual(
    report.notes,
  );
});

test('weekly rewind uses local midnight across a daylight-saving change', async () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Vancouver';
  try {
    const { run } = scriptedRunner();
    const clock = fixedClock('2026-03-09T07:30:00.000Z');
    const { home, mesa } = projectProfile(run, { clock });
    const vault = join(home, 'vault');
    const newId = sequentialIds();
    const note = (started: string) =>
      writeReceipt(
        { vault, clock, newId },
        {
          type: 'decision',
          kind: 'decision',
          profile: 'default',
          command: 'mesa decide',
          status: 'ok',
          summary: 'Invented local-day decision',
          started,
        },
      );
    note('2026-03-03T07:59:00.000Z');
    const inside = note('2026-03-03T08:01:00.000Z');
    const report = await mesa.rewind.week();
    expect(report).toMatchObject({
      from: '2026-03-03',
      through: '2026-03-09',
      timezone: 'America/Vancouver',
    });
    expect(report.notes.map((item) => item.path)).toEqual([inside.path]);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
