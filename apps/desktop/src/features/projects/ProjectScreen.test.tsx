// @vitest-environment happy-dom
import type { ImportListRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, managedRow, PROJECTS, renderWithMesa } from '@/lib/testing';
import { ProjectScreen } from './ProjectScreen';

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

test('Start session on an imported item lands on the Overview composer with its goal, and the start keeps the item', async () => {
  const { bridge, calls } = fakeBridge({
    'import list': () => envelope({ items: [ISSUE] }),
    'import goal': () => envelope({ source: 'jira', id: 'LC-12', title: ISSUE.title, goal: GOAL }),
    'sources list': () => envelope({ sources: [] }),
    'worktrees list': () => envelope([]),
    open: () => envelope(managedRow('newnewne')),
  });
  const byTestId = await renderWithMesa(
    <ProjectScreen
      project={PROJECT}
      initialTab="import"
      sessions={[]}
      onSession={() => undefined}
      onVaultItem={() => undefined}
      onChanged={() => undefined}
      onUnregistered={() => undefined}
      filesDirty={false}
      onFilesDirtyChange={() => undefined}
      onNewSession={() => undefined}
      onAgentSettings={() => undefined}
    />,
    bridge,
  );
  const goal = () => byTestId('project-goal')[0] as HTMLTextAreaElement;

  await click(
    document.querySelector<HTMLButtonElement>('button[aria-label="Start session from LC-12"]') ??
      undefined,
  );

  expect(calls).toContainEqual([
    '--json',
    'import',
    'goal',
    '--project',
    'lantern-cove',
    '--',
    'LC-12',
  ]);
  expect(byTestId('import-tab')).toHaveLength(0);
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
