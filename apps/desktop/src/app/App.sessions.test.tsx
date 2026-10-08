// @vitest-environment happy-dom

import type { TreeRow } from '@mesa/core';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import {
  choose,
  click,
  deferred,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  foreignRow,
  managedRow,
  PROJECTS,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { App } from './App';

const fill = (field: HTMLTextAreaElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      field,
      value,
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
const tab = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((element) =>
    element.textContent?.trim().startsWith(name),
  );

test('empty Sessions starts the selected project with the exact first message and opens its session', async () => {
  let rows: TreeRow[] = [];
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS.map((project) => ({ ...project, exists: true }))),
    sessions: () => envelope(rows),
    open: () => {
      rows = [managedRow('new00001', { project: 'tide' })];
      return envelope({ id: 'new00001', project: 'tide', receipt: null });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('session-start')).toHaveLength(1);
  expect(byTestId('board-view')).toHaveLength(0);
  expect(byTestId('board-layout')).toHaveLength(0);
  expect(byTestId('sessions-ended')).toHaveLength(0);
  const submit = byTestId('session-start-submit')[0];
  await choose(document.getElementById('session-start-project') ?? undefined, 'tide');
  const goal = 'Fix the redirect\nthen run tests';
  await fill(byTestId('session-start-goal')[0] as HTMLTextAreaElement, goal);
  await click(submit);
  expect(calls.find((args) => args[1] === 'open')).toEqual([
    '--json',
    'open',
    '--no-parent',
    `--goal=${goal}`,
    '--',
    'tide',
  ]);
  expect(byTestId('session-start')).toHaveLength(0);
  expect(byTestId('selected-session')[0]?.textContent).toContain('new00001');
  expect(byTestId('terminal-new00001')).toHaveLength(1);
});

test('empty Sessions starts with no first message, and not on a project whose folder is missing', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS.map((project, i) => ({ ...project, exists: i === 0 }))),
    open: () => envelope({ id: 'new00001', project: 'lantern-cove', receipt: null }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const submit = byTestId('session-start-submit')[0];
  await choose(document.getElementById('session-start-project') ?? undefined, 'tide');
  expect(submit?.hasAttribute('disabled')).toBe(true);
  await choose(document.getElementById('session-start-project') ?? undefined, 'lantern-cove');
  await fill(byTestId('session-start-goal')[0] as HTMLTextAreaElement, '  \n ');
  expect(submit?.hasAttribute('disabled')).toBe(false);
  await click(submit);
  expect(calls.find((args) => args[1] === 'open')).toEqual([
    '--json',
    'open',
    '--no-parent',
    '--',
    'lantern-cove',
  ]);
});

test('empty Sessions has only Add project when none exist, and registration reveals the composer', async () => {
  let registered = false;
  const { bridge } = fakeBridge({
    projects: () => envelope(registered ? PROJECTS : []),
    register: () => {
      registered = true;
      return envelope({ name: 'lantern-cove', receipt: null });
    },
  });
  const byTestId = await renderWithMesa(
    <App />,
    bridge,
    fakePlatform({ folder: '/src/lantern-cove' }),
  );
  const start = byTestId('session-start')[0];
  expect(start?.querySelectorAll('button')).toHaveLength(1);
  expect(start?.querySelector('textarea')).toBeNull();
  expect(byTestId('board-view')).toHaveLength(0);
  await click(byTestId('empty-add-project')[0]);
  expect(byTestId('add-project-dialog')).toHaveLength(1);
  await click(
    document.querySelector<HTMLElement>('[aria-label="Choose project folder"]') ?? undefined,
  );
  await click(byTestId('register-folder')[0]);
  expect(byTestId('add-project-dialog')).toHaveLength(0);
  expect(byTestId('session-start-goal')).toHaveLength(1);
});

test('a missing profile opens onboarding, and Add project no longer asks for a vault', async () => {
  const missing = failure('config.yaml not found; run mesa init --vault <path>');
  const { bridge } = fakeBridge({ config: () => missing, projects: () => missing });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('onboarding')).toHaveLength(1);
  expect(byTestId('session-start')[0]?.textContent).not.toContain('Loading projects');
  await click(byTestId('empty-add-project')[0]);
  expect(byTestId('add-project-dialog')).toHaveLength(1);
  expect(document.getElementById('project-vault')).toBeNull();
});

test('a failed project lookup displays its error and retries instead of pretending to load forever', async () => {
  let failed = true;
  const { bridge } = fakeBridge({
    projects: () => (failed ? failure('Registry unreadable') : envelope([])),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('session-start')[0]?.textContent).toContain('Registry unreadable');
  expect(byTestId('session-start')[0]?.textContent).not.toContain('Loading projects');
  failed = false;
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find(
      (button) => button.textContent === 'Retry projects',
    ),
  );
  expect(byTestId('empty-add-project')).toHaveLength(1);
});

test('failed starts preserve the message for retry and pending starts cannot duplicate', async () => {
  const pending = deferred();
  let retry = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => (retry ? pending.promise : failure('agent unavailable')),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const field = byTestId('session-start-goal')[0] as HTMLTextAreaElement;
  await fill(field, 'Ship the fix');
  await click(byTestId('session-start-submit')[0]);
  expect(field.value).toBe('Ship the fix');
  expect(toastTexts(byTestId)).toContain('agent unavailable');
  retry = true;
  await click(byTestId('session-start-submit')[0]);
  await click(byTestId('session-start-submit')[0]);
  expect(calls.filter((args) => args[1] === 'open')).toHaveLength(2);
  await act(async () => pending.resolve(failure('still unavailable')));
  expect(field.disabled).toBe(false);
});

test('Sessions folder clicks collapse and expand its rows without changing the open session', async () => {
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa'), managedRow('bbbbbbbb', { project: 'tide' })]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const folder = byTestId('sidebar-project')[0];
  expect(folder?.getAttribute('aria-expanded')).toBe('true');
  await click(folder);
  expect(folder?.getAttribute('aria-expanded')).toBe('false');
  expect(byTestId('sidebar-session').map((row) => row.getAttribute('aria-current'))).toEqual([
    null,
  ]);
  expect(byTestId('selected-session')[0]?.textContent).toContain('aaaaaaaa');
  expect(byTestId('project-workspace')).toHaveLength(0);
  await click(folder);
  expect(byTestId('sidebar-session')).toHaveLength(2);
  expect(folder?.getAttribute('aria-expanded')).toBe('true');
  await click(tab('Projects'));
  await click(byTestId('sidebar-project')[1]);
  expect(byTestId('project-workspace')[0]?.textContent).toContain('tide');
});

test('a session new to a folded Sessions folder opens the folder', async () => {
  const rows = [managedRow('aaaaaaaa')];
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope(rows),
    open: () => {
      const created = managedRow('bbbbbbbb');
      rows.push(created);
      return envelope(created);
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const folder = byTestId('sidebar-project')[0];
  await click(folder);
  expect(folder?.getAttribute('aria-expanded')).toBe('false');
  await click(
    document.querySelector<HTMLElement>('[aria-label="New session in lantern-cove"]') ?? undefined,
  );
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'New session',
    ),
  );
  expect(folder?.getAttribute('aria-expanded')).toBe('true');
  expect(byTestId('sidebar-session')).toHaveLength(2);
});

test('Sessions returns to the simple landing view after visiting Grid, and missing folders cannot start', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS.map((project) => ({ ...project, exists: false }))),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await fill(byTestId('session-start-goal')[0] as HTMLTextAreaElement, 'Ship it');
  expect(byTestId('session-start-submit')[0]?.hasAttribute('disabled')).toBe(true);
  expect(calls.some((args) => args[1] === 'open')).toBe(false);
  await click(byTestId('nav-grid')[0]);
  expect(byTestId('grid-toolbar')).toHaveLength(1);
  await click(tab('Sessions'));
  expect(byTestId('session-start')).toHaveLength(1);
  expect(byTestId('sessions-ended')).toHaveLength(0);
});

test('recently stopped and foreign sessions do not replace the empty landing view, without exposing a Board view', async () => {
  const stopped = managedRow('stopped1', {
    alive: false,
    endedAt: '2026-09-25T12:00:00.000Z',
    lastState: { state: 'stopped', at: '2026-09-25T12:00:00.000Z', confidence: 1, source: 'mesa' },
  });
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([stopped, foreignRow]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('session-start')).toHaveLength(1);
  expect(byTestId('nav-board')).toHaveLength(0);
  expect(byTestId('session-row')).toHaveLength(0);
  await click(byTestId('nav-grid')[0]);
  await click(tab('Sessions'));
  expect(byTestId('session-start')).toHaveLength(1);
  expect(byTestId('sessions-ended')).toHaveLength(0);
});

test('Board is absent in both sidebar layouts, and search and the saved shortcut open Sessions', async () => {
  const { bridge } = fakeBridge({ projects: () => envelope(PROJECTS) });
  const byTestId = await renderWithMesa(<App />, bridge);
  for (const collapsed of [false, true]) {
    if (collapsed)
      await click(
        document.querySelector<HTMLElement>('[aria-label="Collapse sidebar"]') ?? undefined,
      );
    expect(document.querySelector('[aria-label="Board"]')).toBeNull();
    expect(byTestId('nav-board')).toHaveLength(0);
    expect(byTestId('board-layout')).toHaveLength(0);
    expect(byTestId('board-controls')).toHaveLength(0);
    expect(byTestId('sessions-ended')).toHaveLength(0);
    await click(byTestId('nav-doctor')[0]);
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true }),
      ),
    );
    expect(byTestId('session-start')[0]?.closest('[hidden]')).toBeNull();
    await click(byTestId('nav-doctor')[0]);
    await click(byTestId('search-trigger')[0]);
    const query = byTestId('palette-query')[0] as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        query,
        'Sessions',
      );
      query.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(
      byTestId('palette-hit').find((hit) => hit.textContent?.includes('Open session workspace')),
    );
    expect(byTestId('session-start')[0]?.closest('[hidden]')).toBeNull();
    expect(byTestId('command-palette')).toHaveLength(0);
  }
  await click(byTestId('nav-shortcuts')[0]);
  expect(byTestId('shortcut-settings')[0]?.textContent).toContain('Go to Sessions');
  expect(byTestId('shortcut-settings')[0]?.textContent).not.toContain('Go to Board');
});

test('archiving the last project session returns to the Sessions composer', async () => {
  let archived = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope(archived ? [] : [managedRow('last0001')]),
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    archive: () => {
      archived = true;
      return envelope({ ...managedRow('last0001'), archivedAt: '2026-09-30T12:00:00.000Z' });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector<HTMLElement>('[aria-label="Archive session"]') ?? undefined);
  await click(byTestId('archive-confirm')[0]);
  expect(calls).toContainEqual(['--json', 'archive', '--', 'last0001']);
  expect(byTestId('session-start')[0]?.closest('[hidden]')).toBeNull();
  expect(byTestId('project-workspace')).toHaveLength(0);
});

test('empty Sessions adds other projects to a new session, which then starts in worktrees', async () => {
  const tidePool = {
    ...PROJECTS[0],
    name: 'tide-pool',
    label: 'tide-pool',
    path: '/src/tide-pool',
  };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope([...PROJECTS, tidePool] as typeof PROJECTS),
    open: () => envelope({ id: 'new00001', project: 'lantern-cove', receipt: null }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await choose(document.getElementById('session-start-project') ?? undefined, 'lantern-cove');
  await click(byTestId('session-with-trigger')[0]);
  expect(byTestId('session-with-option-lantern-cove')).toHaveLength(0);
  await click(byTestId('session-with-option-tide-pool')[0]);
  expect(byTestId('session-with-chip-tide-pool')).toHaveLength(1);
  await click(byTestId('session-start-submit')[0]);
  expect(calls.find((args) => args[1] === 'open')).toEqual([
    '--json',
    'open',
    '--no-parent',
    '--with=tide-pool',
    '--worktree',
    '--',
    'lantern-cove',
  ]);
});

test('session details list the additional projects with their worktree paths', async () => {
  const path = '/w/tide-pool/session-amber-badger-0001';
  const row = managedRow('aaaaaaaa', {
    worktree: { path: '/w/lantern-cove/session-amber-badger-0001', branch: 'b' },
    additional: [{ project: 'tide-pool', worktree: { path, branch: 'b' } }],
  });
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([row]),
    show: () =>
      envelope({
        ...row,
        instructions: { state: 'missing', reason: 'Run mesa hooks install' },
        vault: { state: 'missing', reason: 'Run mesa hooks install' },
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  expect(byTestId('selected-session-details')[0]?.textContent).toContain('Also in');
  expect(byTestId('session-also-in')[0]?.textContent).toBe(`tide-pool ${path}`);
});

test('a session row shows a badge per additional project', async () => {
  const row = managedRow('aaaaaaaa', {
    worktree: { path: '/w/lantern-cove/b', branch: 'b' },
    additional: [{ project: 'tide-pool', worktree: { path: '/w/tide-pool/b', branch: 'b' } }],
  });
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([row, managedRow('bbbbbbbb')]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('session-additional-tide-pool').map((badge) => badge.textContent)).toEqual([
    '+tide-pool',
  ]);
});

test('the Projects tab counts a session for its additional project; the Sessions tab shows it once', async () => {
  const row = managedRow('aaaaaaaa', {
    worktree: { path: '/w/lantern-cove/b', branch: 'b' },
    additional: [{ project: 'tide', worktree: { path: '/w/tide/b', branch: 'b' } }],
  });
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([row, managedRow('bbbbbbbb', { project: 'tide' })]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('sidebar-session')).toHaveLength(2);
  await click(tab('Projects'));
  expect(byTestId('sidebar-project-count').map((count) => count.textContent)).toEqual(['1', '2']);
});

test('an unsure row is placed beside the look, and the next look shows by whom', async () => {
  const pending = managedRow('aaaaaaaa', {
    lastState: { state: 'idle', confidence: 0.6, at: '2026-09-25T12:00:00.000Z', source: 'mesa' },
    supervision: { source: 'rules', pending: true },
  });
  const placed = managedRow('aaaaaaaa', {
    lastState: {
      state: 'waiting-question',
      confidence: 0.9,
      at: '2026-09-25T12:00:00.000Z',
      source: 'clef',
    },
    supervision: { source: 'clef', model: 'clef', margin: 0.88, latencyMs: 318, inputTokens: 466 },
  });
  let rows = [pending];
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope(rows),
    'decisions place': () => {
      rows = [placed];
      return envelope({ placed: [{ id: 'aaaaaaaa', key: 'k', saved: { key: 'k' } }] });
    },
    show: () =>
      envelope({
        ...rows[0],
        instructions: { state: 'ok', reason: 'installed' },
        vault: { state: 'ok', reason: 'installed' },
      }),
  });
  vi.useFakeTimers();
  try {
    const byTestId = await renderWithMesa(<App />, bridge);
    await act(async () => {});
    expect(calls.filter((c) => c[1] === 'decisions' && c[2] === 'place')).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(2000));
    await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
    expect(byTestId('session-placed-by')[0]?.textContent).toBe(
      'clef (clef), margin 88%, 318 ms, 466 tokens',
    );
    // A row the model no longer needs placing asks nothing more.
    expect(calls.filter((c) => c[1] === 'decisions' && c[2] === 'place')).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});

test('details tell a configured decision tool from one observed, and restart a session started without it', async () => {
  const row = managedRow('aaaaaaaa', {
    lastState: { state: 'idle', confidence: 0.9, at: '2026-09-27T12:00:00.000Z', source: 'hook' },
  });
  let mounted = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([row]),
    show: () =>
      envelope({
        ...row,
        instructions: { state: 'configured', reason: 'SessionStart hook is configured' },
        vault: { state: 'configured', reason: 'mesa-vault is mounted in its launch command' },
        decisions: mounted
          ? {
              tool: {
                state: 'configured',
                reason: 'mesa-decisions is mounted in its launch command',
                observedAt: new Date().toISOString(),
              },
              advice: { state: 'conflicting', reason: 'Review and trust the Mesa hook in Codex' },
            }
          : {
              tool: {
                state: 'missing',
                reason:
                  'Started without mesa-decisions; stop it and resume through Mesa to mount it',
                action: 'restart',
              },
              advice: { state: 'disabled', reason: 'Turned off for this session' },
            },
      }),
    stop: () => envelope({ result: { ...row, outcome: 'stopped' }, receipt: null }),
    resume: () => {
      mounted = true;
      return envelope({ result: row, receipt: null });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  const delivery = () => byTestId('session-decision-delivery')[0]?.textContent ?? '';
  expect(delivery()).toContain(
    'Tool Missing: Started without mesa-decisions; stop it and resume through Mesa to mount it. Last call: never yet',
  );
  expect(delivery()).toContain(
    'Advice Disabled: Turned off for this session. Last sent: never yet',
  );
  await click(
    [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Restart to add the tool'),
    ),
  );
  expect(calls).toContainEqual(['--json', 'stop', '--', 'aaaaaaaa']);
  expect(calls).toContainEqual(['--json', 'resume', '--', 'aaaaaaaa']);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  expect(delivery()).toContain(
    'Tool Configured: mesa-decisions is mounted in its launch command. Last call now',
  );
  expect(delivery()).toContain('Advice Conflicting: Review and trust the Mesa hook in Codex.');
});

test("an Antigravity session without the global entry offers Mesa's hooks install, then reads again", async () => {
  const row = managedRow('aaaaaaaa', { agent: 'antigravity' });
  let installed = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([row]),
    show: () =>
      envelope({
        ...row,
        instructions: { state: 'configured', reason: 'PreInvocation hook is configured' },
        vault: {
          state: 'configured',
          reason: 'Global mesa-vault entry and allow rule are configured',
        },
        decisions: {
          tool: installed
            ? { state: 'configured', reason: 'Global mesa-decisions entry and allow rule' }
            : {
                state: 'missing',
                reason: 'No global mesa-decisions entry; run mesa hooks install',
                action: 'hooks install',
              },
          advice: { state: 'configured', reason: "PreInvocation re-sends the goal's ready advice" },
        },
      }),
    'hooks install': () => {
      installed = true;
      return envelope({ result: { installed: true, changed: true }, receipt: null });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  const delivery = () => byTestId('session-decision-delivery')[0]?.textContent ?? '';
  expect(delivery()).toContain(
    'Tool Missing: No global mesa-decisions entry; run mesa hooks install.',
  );
  await click(
    [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Install hooks to add the tool'),
    ),
  );
  expect(calls).toContainEqual(['--json', 'hooks', 'install']);
  expect(delivery()).toContain('Tool Configured: Global mesa-decisions entry and allow rule.');
});
