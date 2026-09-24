// @vitest-environment happy-dom
import type { Check, DoctorReport, ProjectRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { App } from './App';
import { click, envelope, failure, fakeBridge, fakePlatform, renderWithMesa } from './lib/testing';

const PROJECTS: ProjectRow[] = [
  {
    name: 'lantern-cove',
    path: '/src/lantern-cove',
    agent: 'claude',
    priority: 0.5,
    skills: [],
    exists: true,
  },
  { name: 'tide', path: '/src/tide', agent: null, priority: null, skills: [], exists: false },
];
const check = (version: string): Check => ({
  name: 'tmux',
  ok: true,
  status: 'ok',
  version,
  hint: '',
});
const report = (checks: Check[]): DoctorReport => {
  const healthy = checks.every((c) => c.ok);
  const summary = healthy ? 'ready' : 'tmux and at least one agent (claude or codex) are required';
  return { healthy, summary, checks };
};
const cells = (row: HTMLElement | undefined) =>
  [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent);

test('the Projects screen lists the fixture projects, marking one whose path is gone', async () => {
  const { bridge } = fakeBridge({ projects: () => envelope(PROJECTS) });
  const byTestId = await renderWithMesa(<App />, bridge);

  expect(byTestId('projects-screen')).toHaveLength(1);
  const rows = byTestId('project-row');
  expect(cells(rows[0])).toEqual(['lantern-cove', '/src/lantern-cove', 'claude', '0.5']);
  expect(cells(rows[1])).toEqual(['tide ✗', '/src/tide', '', '']);
  expect(byTestId('project-missing')).toHaveLength(1);
});

test('the header shows the profile, the vault path, and a green or red doctor verdict', async () => {
  const healthy = await renderWithMesa(<App />, fakeBridge().bridge);
  expect(healthy('profile-summary')[0]?.textContent).toBe(
    'Profile: default | Vault: /h/vault | Doctor: ok',
  );
  expect(healthy('doctor-health')[0]?.style.color).toBe('green');

  const sick = fakeBridge({
    doctor: () => envelope(report([{ name: 'tmux', ok: false, status: 'fail', hint: '' }])),
    vault: () => envelope({ path: '/h/vault', ok: false, missing: ['receipts'] }),
  });
  const byTestId = await renderWithMesa(<App />, sick.bridge);
  expect(byTestId('vault-status')[0]?.textContent).toBe('Vault: /h/vault (missing receipts)');
  expect(byTestId('doctor-health')[0]?.textContent).toBe('Doctor: needs attention');
  expect(byTestId('doctor-health')[0]?.style.color).toBe('red');
});

test('Register folder picks a folder, registers it with --create, and refreshes the list', async () => {
  let registered = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(registered ? PROJECTS.slice(0, 1) : []),
    register: () => {
      registered = true;
      return envelope({ name: 'lantern-cove', path: '/src/lantern-cove', created: true });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge, fakePlatform('/src/lantern-cove'));
  expect(byTestId('project-row')).toHaveLength(0);

  await click(byTestId('register-folder')[0]);
  expect(calls).toContainEqual(['--json', 'register', '--create', '--', '/src/lantern-cove']);
  expect(byTestId('project-row')).toHaveLength(1);
});

test('a cancelled picker registers nothing; a failed register shows in the toast', async () => {
  const cancelled = fakeBridge();
  const quiet = await renderWithMesa(<App />, cancelled.bridge, fakePlatform(null));
  await click(quiet('register-folder')[0]);
  expect(cancelled.calls.some((c) => c[1] === 'register')).toBe(false);

  const clash = fakeBridge({ register: () => failure('already registered: tide at /src/tide') });
  const byTestId = await renderWithMesa(<App />, clash.bridge, fakePlatform('/src/tide'));
  await click(byTestId('register-folder')[0]);
  expect(byTestId('toast').map((t) => t.querySelector('pre')?.textContent)).toEqual([
    'already registered: tide at /src/tide',
  ]);
});

test('the Doctor screen shares the header run; Recheck runs doctor again', async () => {
  let version = 1;
  const { bridge, calls } = fakeBridge({
    doctor: () => envelope(report([check(`3.${version++}`)])),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);

  expect(byTestId('doctor-row')[0]?.textContent).toBe('tmux✓3.1');
  await click(byTestId('doctor-recheck')[0]);
  expect(byTestId('doctor-row')[0]?.textContent).toBe('tmux✓3.2');
  expect(calls.filter((c) => c[1] === 'doctor')).toHaveLength(2);
});

test('an unhealthy report shows its summary and each row by status', async () => {
  const missing: Check = {
    name: 'tmux',
    ok: false,
    status: 'fail',
    hint: 'install with `brew install tmux`',
  };
  const { bridge } = fakeBridge({ doctor: () => envelope(report([missing])) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('doctor-summary')[0]?.textContent).toBe(
    'tmux and at least one agent (claude or codex) are required',
  );
  expect(byTestId('doctor-row')[0]?.dataset.status).toBe('fail');
});

test('every distinct failure shows once in the toast', async () => {
  const notInit = failure('config.yaml not found; run mesa init --vault <path>');
  const { bridge } = fakeBridge({
    config: () => notInit,
    vault: () => notInit,
    projects: () => notInit,
    doctor: () => {
      throw new Error('mesa exited with code 1: boom');
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const toasts = byTestId('toast').map((t) => t.querySelector('pre')?.textContent);
  expect(toasts.sort()).toEqual([
    'config.yaml not found; run mesa init --vault <path>',
    'mesa exited with code 1: boom',
  ]);
});
