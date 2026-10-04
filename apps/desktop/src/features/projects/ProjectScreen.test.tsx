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
/** A third project, whose folder is there. */
const TIDE_POOL = { ...PROJECT, name: 'tide-pool', label: 'tide-pool', path: '/src/tide-pool' };
const GOAL = 'Work on the imported Jira issue LC-12: Fix the tide alarm\nSource: x';

test('Context opens imported items; Start session fills the Overview composer and keeps the item', async () => {
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

  const tabs = [...document.querySelectorAll<HTMLButtonElement>('nav button')];
  const context = tabs.find((button) => button.textContent === 'Context');
  expect(context).toBeDefined();
  expect(tabs.some((button) => button.textContent?.toLowerCase() === 'import')).toBe(false);
  await click(context);
  expect(context?.getAttribute('aria-current')).toBe('page');
  expect(byTestId('import-tab')).toHaveLength(1);

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

test('the composer adds another project: its chip shows, Start in is its own worktree, and Start sends --with', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope([...PROJECTS, TIDE_POOL]),
    'worktrees list': () => envelope([]),
    open: () => envelope(managedRow('newnewne')),
  });
  const byTestId = await renderWithMesa(
    <ProjectScreen
      project={PROJECT}
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
  await act(async () => (byTestId('project-goal')[0] as HTMLTextAreaElement).focus());
  await click(byTestId('session-with-trigger')[0]);
  expect(byTestId('session-with-option-lantern-cove')).toHaveLength(0);
  // A project whose folder is gone cannot be added.
  expect(byTestId('session-with-option-tide')[0]?.hasAttribute('data-disabled')).toBe(true);
  await click(byTestId('session-with-option-tide-pool')[0]);
  expect(byTestId('session-with-chip-tide-pool')).toHaveLength(1);
  const location = document.getElementById('session-location') as HTMLSelectElement;
  expect(location.value).toBe('worktree');
  expect(location.disabled).toBe(true);
  const branch = byTestId('project-branch')[0] as HTMLInputElement;
  expect(branch.required).toBe(false);
  expect(branch.placeholder).toBe('Mesa names one');
  const form = byTestId('project-session-form')[0] as HTMLFormElement;
  await act(async () => form.requestSubmit());
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'claude',
    '--with=tide-pool',
    '--worktree',
    '--',
    'lantern-cove',
  ]);
  // Started, the next session starts with no other project again.
  expect(byTestId('session-with-chip-tide-pool')).toHaveLength(0);
});
