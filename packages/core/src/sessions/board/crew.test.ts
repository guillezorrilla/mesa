import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { ChildReport } from '../../reports/reports.js';
import { newSession, placedRow, testStore } from '../../testing/index.js';
import { withParentsNow } from '../record/family.js';
import { GENERAL_PROJECT } from '../record/general.js';
import { crewOf } from './crew.js';

const report = (child: string, fields: Partial<ChildReport>): ChildReport => ({
  id: `${child}:x`,
  parent: 'p',
  child,
  childName: child,
  kind: 'finished',
  at: '2026-09-24T12:05:00.000Z',
  ...fields,
});

test("a parent's crew is its own children, oldest first, each with its branch, newest report and diff counts", async () => {
  const store = testStore(mkdtempSync(join(tmpdir(), 'mesa-crew-')));
  const parent = store.create(() => newSession());
  const later = store.create(() =>
    newSession({
      parent: parent.id,
      agentName: 'buoy-lights',
      startedAt: '2026-09-24T12:02:00.000Z',
      worktree: { path: '/w/lantern-cove/buoys', branch: 'buoys' },
    }),
  );
  const first = store.create(() =>
    newSession({
      parent: parent.id,
      agentName: 'tide-charts',
      project: GENERAL_PROJECT,
      cwd: '/w/notes',
    }),
  );
  const grandchild = store.create(() => newSession({ parent: later.id }));
  const other = store.create(() => newSession());
  const rows = withParentsNow([parent, later, first, grandchild, other]).map((r) =>
    placedRow(r, 'idle'),
  );
  const read: string[] = [];
  const crew = await crewOf(
    rows,
    parent.id,
    {
      [later.id]: report(later.id, {
        kind: 'done',
        outcome: 'succeeded',
        message: 'Lit them all\nand logged it',
      }),
      [first.id]: report(first.id, { kind: 'ended' }),
    },
    async (id) => {
      read.push(id);
      return { added: 12, removed: 3 };
    },
  );
  expect(crew.map((r) => r.id)).toEqual([first.id, later.id]);
  expect(crew[1]).toMatchObject({
    branch: 'buoys',
    report: { kind: 'done', outcome: 'succeeded', message: 'Lit them all\nand logged it' },
    diff: { added: 12, removed: 3 },
  });
  // A general session has no base to diff against, and a report that says nothing is no report.
  expect(read).toEqual([later.id]);
  expect(crew[0]).toMatchObject({ branch: null });
  expect(crew[0]).not.toHaveProperty('report');
  expect(crew[0]).not.toHaveProperty('diff');
  expect(await crewOf(rows, other.id, {}, async () => undefined)).toEqual([]);
});
