// @vitest-environment happy-dom
import type { CheckResult, TreeRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, managedRow, renderWithMesa, toasts } from '@/lib/testing';
import { RunCheckButton } from './RunCheckButton';

const row = {
  ...managedRow('aaaaaaaa', { worktree: { path: '/tmp/tide', branch: 'mesa/tide' } }),
  children: [],
  project: 'lantern-cove',
} as unknown as TreeRow & { project: string };
const result = (over: Partial<CheckResult>): CheckResult => ({
  ok: true,
  project: 'lantern-cove',
  command: 'pnpm verify',
  folder: '/tmp/tide',
  exitCode: 0,
  durationMs: 4200,
  log: '/tmp/checks/abcd1234.log',
  errors: [],
  more: 0,
  ...over,
});

test("Run check runs the project's check in the session's folder: a pass is one line, a failure its errors", async () => {
  let next = result({});
  const { bridge, calls } = fakeBridge({ check: () => envelope(next) });
  const byTestId = await renderWithMesa(<RunCheckButton row={row} />, bridge);
  await click(document.querySelector('button') ?? undefined);
  expect(calls.find((args) => args[1] === 'check')).toEqual([
    '--json',
    'check',
    '--checkout',
    '/tmp/tide',
    '--',
    'lantern-cove',
  ]);
  expect(toasts(byTestId)).toEqual([
    ['confirmation', 'check passed: pnpm verify (4.2 s); log /tmp/checks/abcd1234.log'],
  ]);
  next = result({ ok: false, exitCode: 1, errors: ['tide.test.ts', 'FAIL tide row 3'] });
  await click(document.querySelector('button') ?? undefined);
  expect(toasts(byTestId).at(-1)).toEqual([
    'alert',
    'check failed: pnpm verify exited 1 (4.2 s); log /tmp/checks/abcd1234.log\ntide.test.ts\nFAIL tide row 3',
  ]);
  expect(document.body.textContent).toContain('Copy log path');
});
