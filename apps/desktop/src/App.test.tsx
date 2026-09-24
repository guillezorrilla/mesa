// @vitest-environment happy-dom
import type { Check, DoctorReport } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { App } from './App';
import { fakeBridge, renderWithMesa } from './lib/testing';

const envelope = (data: unknown) => ({ ok: true, data });
const check = (version: string): Check => ({
  name: 'tmux',
  ok: true,
  status: 'ok',
  version,
  hint: '',
});
const report = (checks: Check[]): DoctorReport => ({
  healthy: checks.every((c) => c.ok),
  summary: checks.every((c) => c.ok)
    ? 'ready'
    : 'tmux and at least one agent (claude or codex) are required',
  checks,
});

test('the Doctor screen renders the report, and Recheck runs doctor again', async () => {
  let version = 1;
  const { bridge, calls } = fakeBridge({
    profile: () => envelope({ profile: 'default', dir: '/h/.mesa/default' }),
    doctor: () => envelope(report([check(`3.${version++}`)])),
  });
  const byTestId = await renderWithMesa(<App />, bridge);

  expect(byTestId('active-profile')[0]?.textContent).toBe('Profile: default');
  expect(byTestId('doctor-row')[0]?.textContent).toBe('tmux✓3.1');
  await act(async () => byTestId('doctor-recheck')[0]?.click());
  expect(byTestId('doctor-row')[0]?.textContent).toBe('tmux✓3.2');
  expect(calls).toContainEqual(['--json', 'doctor']);
  expect(byTestId('toast')).toHaveLength(0);
  expect(byTestId('doctor-summary')).toHaveLength(0);
});

test('an unhealthy report shows its summary and each row by status', async () => {
  const missing: Check = {
    name: 'tmux',
    ok: false,
    status: 'fail',
    hint: 'install with `brew install tmux`',
  };
  const { bridge } = fakeBridge({
    profile: () => envelope({ profile: 'default', dir: '/h/.mesa/default' }),
    doctor: () => envelope(report([missing])),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('doctor-summary')[0]?.textContent).toBe(
    'tmux and at least one agent (claude or codex) are required',
  );
  expect(byTestId('doctor-row')[0]?.dataset.status).toBe('fail');
  expect(byTestId('doctor-row')[0]?.textContent).toContain('✗');
});

test('a failed envelope and a bridge error both show in the toast', async () => {
  const { bridge } = fakeBridge({
    profile: () => ({ ok: false, error: { code: 'not_found', message: 'no profile here' } }),
    doctor: () => {
      throw new Error('mesa exited with code 1: boom');
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const toasts = byTestId('toast').map((t) => t.querySelector('pre')?.textContent);
  expect(toasts).toHaveLength(2);
  expect(toasts).toEqual(
    expect.arrayContaining(['no profile here', 'mesa exited with code 1: boom']),
  );
});
