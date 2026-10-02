// @vitest-environment happy-dom
import type { ImportListRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, managedRow, PROJECTS, renderWithMesa } from '@/lib/testing';
import { useAct } from '@/lib/useAct';
import { OverviewTab } from './OverviewTab';
import { useOverviewState } from './useOverviewState';

const PROJECT = PROJECTS[0] as (typeof PROJECTS)[number];
const ISSUE: ImportListRow = {
  source: 'jira',
  id: 'LC-12',
  url: 'https://lantern-cove.atlassian.net/browse/LC-12',
  title: 'LC-12: Fix the tide alarm',
  fetched: '2026-09-24T12:00',
  snapshot: 'raw/jira/LC-12/2026-09-24T1200.md',
};
const GOAL = 'Work on the imported Jira issue LC-12: Fix the tide alarm\nSource: x';

/** The Overview tab as the project screen holds it: its state and one action at a time. */
function Overview() {
  const state = useOverviewState(PROJECT);
  const { acting, act } = useAct();
  return (
    <OverviewTab
      project={PROJECT}
      sessions={[]}
      worktrees={{ data: [], busy: false, refresh: async () => undefined }}
      state={state}
      acting={acting}
      act={act}
      onSession={() => undefined}
      onVaultItem={() => undefined}
      onNewSession={() => undefined}
    />
  );
}

test('Start session on an imported item fills the composer with its goal, and the start keeps the item', async () => {
  const { bridge, calls } = fakeBridge({
    'import list': () => envelope({ items: [ISSUE] }),
    'import goal': () => envelope({ source: 'jira', id: 'LC-12', title: ISSUE.title, goal: GOAL }),
    open: () => envelope(managedRow('newnewne')),
  });
  const byTestId = await renderWithMesa(<Overview />, bridge);
  const button = (label: string) =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? undefined;
  const goal = () => byTestId('project-goal')[0] as HTMLTextAreaElement;

  await click(button('Start session from LC-12'));

  expect(calls).toContainEqual([
    '--json',
    'import',
    'goal',
    '--project',
    'lantern-cove',
    '--',
    'LC-12',
  ]);
  expect(byTestId('project-goal-from')[0]?.textContent).toContain(ISSUE.title);
  expect(goal().value).toBe(GOAL);
  expect(document.activeElement).toBe(goal());

  // Edited, it starts with the edit as its whole goal, and the item kept.
  goal().value = `${GOAL}\n\nOnly the alarm.`;
  const form = byTestId('project-session-form')[0] as HTMLFormElement;
  await act(async () => form.requestSubmit());
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--from=LC-12',
    '--exact-goal',
    '--no-parent',
    '--agent',
    'claude',
    `--goal=${GOAL}\n\nOnly the alarm.`,
    '--',
    'lantern-cove',
  ]);
  // Started, the composer is blank again.
  expect(byTestId('project-goal-from')).toHaveLength(0);
  expect(goal().value).toBe('');
});
