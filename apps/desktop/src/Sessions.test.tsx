// @vitest-environment happy-dom
import type { TreeRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { App } from '@/App';
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
  expect(submit?.hasAttribute('disabled')).toBe(true);
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

test('Sessions returns to the simple landing view after visiting Board, and missing folders cannot start', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS.map((project) => ({ ...project, exists: false }))),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await fill(byTestId('session-start-goal')[0] as HTMLTextAreaElement, 'Ship it');
  expect(byTestId('session-start-submit')[0]?.hasAttribute('disabled')).toBe(true);
  expect(calls.some((args) => args[1] === 'open')).toBe(false);
  await click(byTestId('nav-board')[0]);
  expect(byTestId('sessions-ended')).toHaveLength(1);
  await click(tab('Sessions'));
  expect(byTestId('session-start')).toHaveLength(1);
  expect(byTestId('sessions-ended')).toHaveLength(0);
});

test('recently stopped and foreign sessions do not replace the empty landing view, while Board keeps them', async () => {
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
  await click(byTestId('nav-board')[0]);
  expect(byTestId('session-row')).toHaveLength(2);
  await click(byTestId('sessions-ended')[0]);
  await click(tab('Sessions'));
  expect(byTestId('session-start')).toHaveLength(1);
  expect(byTestId('sessions-ended')).toHaveLength(0);
});
