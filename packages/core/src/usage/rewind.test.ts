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
  store.update(session.id, { endedAt: '2026-09-24T11:30:00.000Z' });

  const report = await mesa.rewind.week();
  expect(report).toMatchObject({ from: '2026-09-18', through: '2026-09-24', timezone: 'UTC' });
  expect(report.notes.map((note) => note.path)).toEqual([recent.path]);
  expect(report.sessions.map((row) => row.id)).toEqual([session.id]);
  expect(report.usage.estimatedCostUsd).toBeNull();
  expect(report.missing).toContain(`${session.id}: native session id is not available`);
  expect((await createMesa('default', testDeps(home, { clock })).rewind.week()).notes).toEqual(
    report.notes,
  );
});
