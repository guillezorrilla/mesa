// @vitest-environment happy-dom
import type { ImportListRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  choose,
  click,
  envelope,
  fakeBridge,
  managedRow,
  PROJECTS,
  press,
  renderWithMesa,
} from '@/lib/testing';
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

/** The project screen on PROJECT, with no sessions, over `bridge`. */
const renderScreen = (bridge: ReturnType<typeof fakeBridge>['bridge']) =>
  renderWithMesa(
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
      onPrSetup={() => undefined}
    />,
    bridge,
  );

test('Context opens imported items; Start session fills the Overview composer and keeps the item', async () => {
  const { bridge, calls } = fakeBridge({
    'import list': () => envelope({ items: [ISSUE] }),
    'import goal': () => envelope({ source: 'jira', id: 'LC-12', title: ISSUE.title, goal: GOAL }),
    'sources list': () => envelope({ sources: [] }),
    'worktrees list': () => envelope([]),
    open: () => envelope(managedRow('newnewne')),
  });
  const byTestId = await renderScreen(bridge);
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
  const byTestId = await renderScreen(bridge);
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

test('the composer folds on a click outside or Esc, not on its menu, and keeps what was picked', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope([...PROJECTS, TIDE_POOL]),
    'worktrees list': () => envelope([]),
    open: () => envelope(managedRow('newnewne')),
  });
  const byTestId = await renderScreen(bridge);
  const goal = byTestId('project-goal')[0] as HTMLTextAreaElement;
  // Folded, its options are there but inert.
  const open = () => !document.getElementById('session-location')?.closest('[inert]');
  await act(async () => goal.focus());
  expect(open()).toBe(true);
  await choose(byTestId('session-mode')[0], 'plan');
  // The Add project menu portals out of the form, and still counts as inside.
  await click(byTestId('session-with-trigger')[0]);
  await click(byTestId('session-with-option-tide-pool')[0]);
  expect(open()).toBe(true);
  // Esc in the menu closes only the menu.
  await press(byTestId('session-with-option-tide-pool')[0], 'Escape');
  expect(byTestId('session-with-option-tide-pool')).toHaveLength(0);
  expect(open()).toBe(true);
  await click(document.querySelector<HTMLElement>('nav button') ?? undefined);
  expect(open()).toBe(false);
  await act(async () => goal.focus());
  expect(open()).toBe(true);
  await press(goal, 'Escape');
  expect(open()).toBe(false);
  // Folded and opened again, Mod+Enter starts it with the mode and project picked before.
  await act(async () => goal.focus());
  await press(goal, 'Enter', { metaKey: true });
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'claude',
    '--mode',
    'plan',
    '--with=tide-pool',
    '--worktree',
    '--',
    'lantern-cove',
  ]);
});

test('the Overview lists a session where the project is additional, marked from its primary', async () => {
  const placed = {
    worktree: { path: '/w/lantern-cove/b', branch: 'b' },
    additional: [{ project: 'tide-pool', worktree: { path: '/w/tide-pool/b', branch: 'b' } }],
  };
  const ended = {
    state: 'done',
    confidence: 1,
    at: '2026-09-25T13:00:00.000Z',
    source: 'tmux',
  } as const;
  const { bridge } = fakeBridge({ 'worktrees list': () => envelope([]) });
  const byTestId = await renderWithMesa(
    <ProjectScreen
      project={TIDE_POOL}
      sessions={[
        managedRow('aaaaaaaa', placed),
        managedRow('bbbbbbbb', { ...placed, alive: false, lastState: ended }),
      ]}
      onSession={() => undefined}
      onVaultItem={() => undefined}
      onChanged={() => undefined}
      onUnregistered={() => undefined}
      filesDirty={false}
      onFilesDirtyChange={() => undefined}
      onNewSession={() => undefined}
      onAgentSettings={() => undefined}
      onPrSetup={() => undefined}
    />,
    bridge,
  );
  expect(byTestId('project-active-session')).toHaveLength(1);
  expect(byTestId('project-recent-session')).toHaveLength(1);
  expect(byTestId('session-from-lantern-cove').map((badge) => badge.textContent)).toEqual([
    'from lantern-cove',
    'from lantern-cove',
  ]);
});

test('the Impact tab, after Vault, shows Impact scoped to the project', async () => {
  const { bridge, calls } = fakeBridge({
    'worktrees list': () => envelope([]),
    impact: () =>
      envelope({
        days: 7,
        since: '2026-10-06T12:00:00.000Z',
        project: PROJECT.name,
        summary: { caught: 1, corrected: 0, notesIn: 0, stopped: 0, kept: 0, sessions: 1 },
        sentence: `In the last 7 days in ${PROJECT.name}, Mesa caught 1 question the rules missed, across 1 session.`,
        sessions: [],
      }),
  });
  const byTestId = await renderScreen(bridge);
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('nav button')].map(
    (b) => b.textContent,
  );
  expect(tabs.indexOf('impact')).toBe(tabs.indexOf('vault') + 1);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('nav button')].find(
      (b) => b.textContent === 'impact',
    ),
  );
  expect(byTestId('impact-summary')[0]?.textContent).toBe(
    `In the last 7 days in ${PROJECT.name}, Mesa caught 1 question the rules missed, across 1 session.`,
  );
  expect(calls).toContainEqual(['--json', 'impact', '--days', '7', '--project', PROJECT.name]);
});
