// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import {
  click,
  deferred,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  fill,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { AddProjectDialog } from './AddProjectDialog';
import { ImportWorkspaceDialog } from './ImportWorkspaceDialog';

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const button = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`) ?? undefined;

test('Add accepts a typed path and optional name, and registers only on confirmation', async () => {
  const onCancel = vi.fn();
  const onRegistered = vi.fn(async () => {});
  const { bridge, calls } = fakeBridge({
    register: () => envelope({ name: 'lantern-cove', label: 'Lantern Cove', receipt: null }),
  });
  const byTestId = await renderWithMesa(
    <AddProjectDialog onCancel={onCancel} onRegistered={onRegistered} />,
    bridge,
  );
  expect(byTestId('register-folder')[0]?.hasAttribute('disabled')).toBe(true);
  await fill('project-path', '  /src/lantern-cove  ');
  await fill('project-name', '  Lantern Cove  ');
  expect(calls).toEqual([]);
  await click(byTestId('register-folder')[0]);
  expect(calls).toEqual([
    ['--json', 'register', '--create', '--label=Lantern Cove', '--', '/src/lantern-cove'],
  ]);
  expect(onRegistered).toHaveBeenCalledOnce();
  expect(onCancel).toHaveBeenCalledOnce();
});

test('a cancelled folder picker leaves the path alone, and cancellation never registers', async () => {
  const onCancel = vi.fn();
  const { bridge, calls } = fakeBridge();
  await renderWithMesa(
    <AddProjectDialog onCancel={onCancel} onRegistered={async () => {}} />,
    bridge,
  );
  await fill('project-path', '/src/lantern-cove');
  await click(button('Choose project folder'));
  expect(input('project-path').value).toBe('/src/lantern-cove');
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Cancel'),
  );
  expect(onCancel).toHaveBeenCalledOnce();
  expect(calls).toEqual([]);
});

test('a failed Add keeps the entered values for retry, and a pending Add runs only once', async () => {
  const pending = deferred();
  let retry = false;
  const onCancel = vi.fn();
  const { bridge, calls } = fakeBridge({
    register: () => (retry ? pending.promise : failure('already registered')),
  });
  const byTestId = await renderWithMesa(
    <AddProjectDialog onCancel={onCancel} onRegistered={async () => {}} />,
    bridge,
    fakePlatform({ folder: '/src/lantern-cove' }),
  );
  await click(button('Choose project folder'));
  await click(byTestId('register-folder')[0]);
  expect(input('project-path').value).toBe('/src/lantern-cove');
  expect(onCancel).not.toHaveBeenCalled();
  expect(toastTexts(byTestId)).toContain('already registered');
  retry = true;
  await click(byTestId('register-folder')[0]);
  await click(byTestId('register-folder')[0]);
  expect(calls.filter((args) => args[1] === 'register')).toHaveLength(2);
  await act(async () => pending.resolve(envelope({ name: 'lantern-cove', receipt: null })));
  expect(onCancel).toHaveBeenCalledOnce();
});

test('Import scans the chosen folder and imports only a selected eligible result', async () => {
  const onRegistered = vi.fn(async () => {});
  const candidate = {
    name: 'lantern-cove',
    path: '/src/lantern-cove',
    configured: false,
    registered: false,
  };
  const { bridge, calls } = fakeBridge({
    'projects discover': () =>
      envelope([
        candidate,
        { ...candidate, name: 'tide', path: '/src/tide', registered: true },
        { ...candidate, name: 'broken', path: '/src/broken', error: 'Invalid mesa.yaml' },
      ]),
    register: () => envelope({ name: 'lantern-cove', receipt: null }),
  });
  const byTestId = await renderWithMesa(
    <ImportWorkspaceDialog onCancel={() => {}} onRegistered={onRegistered} />,
    bridge,
    fakePlatform({ folder: '/src' }),
  );
  await click(button('Choose workspace folder'));
  expect(calls).toEqual([]);
  await click(byTestId('discover-projects')[0]);
  expect(calls).toEqual([['--json', 'projects', 'discover', '--', '/src']]);
  const rows = byTestId('discovered-project');
  expect(rows).toHaveLength(3);
  expect(rows[1]?.querySelector('button')).toBeNull();
  expect(rows[2]?.querySelector('button')?.disabled).toBe(true);
  await click(rows[0]?.querySelector('button') as HTMLElement);
  expect(calls.filter((args) => args[1] === 'register')).toEqual([
    ['--json', 'register', '--create', '--', candidate.path],
  ]);
  expect(onRegistered).toHaveBeenCalledOnce();
  expect(rows[0]?.textContent).toContain('Imported');
  await fill('workspace-path', '/other');
  expect(byTestId('discovered-projects')).toHaveLength(0);
});

test('a failed workspace scan can be retried and an empty scan is explained', async () => {
  let failed = true;
  const { bridge, calls } = fakeBridge({
    'projects discover': () => (failed ? failure('not a folder') : envelope([])),
  });
  const byTestId = await renderWithMesa(
    <ImportWorkspaceDialog onCancel={() => {}} onRegistered={async () => {}} />,
    bridge,
  );
  await fill('workspace-path', '/src');
  await click(byTestId('discover-projects')[0]);
  expect(input('workspace-path').value).toBe('/src');
  expect(toastTexts(byTestId)).toContain('not a folder');
  failed = false;
  await click(byTestId('discover-projects')[0]);
  expect(byTestId('discovered-projects')[0]?.textContent).toContain('No projects found');
  expect(calls.some((args) => args[1] === 'register')).toBe(false);
});
