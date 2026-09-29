// @vitest-environment happy-dom
import type { UsageReport, WeeklyRewind } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { choose, click, envelope, fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { UsageScreen } from './UsageScreen';

test('usage alerts are informational and a profile threshold saves through config', async () => {
  const zero = {
    events: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    estimatedCostUsd: 0,
  };
  const report: UsageReport = {
    rows: [],
    unknown: [],
    periods: { today: zero, '7d': zero, '30d': zero, '90d': zero, month: zero },
    daily: [],
    breakdown: [],
    alerts: [{ period: 'today', thresholdUsd: 1, knownCostUsd: 1.5 }],
  };
  const { bridge, calls } = fakeBridge({
    usage: () => envelope(report),
    'config set': () => envelope({ path: 'usage.dailyAlertUsd', value: 2 }),
  });
  const byTestId = await renderWithMesa(<UsageScreen onSession={() => {}} />, bridge);
  expect(byTestId('usage-panel')[0]?.textContent).toContain('Agents keep running');
  const input = document.querySelector<HTMLInputElement>('#usage-dailyAlertUsd');
  await act(async () => {
    if (!input) throw new Error('daily alert input missing');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '2');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(input?.parentElement?.querySelector('button') ?? undefined);
  expect(calls.some((args) => args.join(' ').includes('config set -- usage.dailyAlertUsd 2'))).toBe(
    true,
  );
});

test('usage scope shows the selected session period totals', async () => {
  const zero = {
    events: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    estimatedCostUsd: 0,
  };
  const report = (input: number): UsageReport => ({
    rows: [],
    unknown: [],
    periods: {
      today: { ...zero, input },
      '7d': { ...zero, input },
      '30d': { ...zero, input },
      '90d': { ...zero, input },
      month: zero,
    },
    daily: [],
    breakdown: [],
    alerts: [],
  });
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([managedRow('abcdefgh', { name: 'Lantern' })]),
    usage: (args) => envelope(report(args.includes('--session') ? 7 : 20)),
  });
  const byTestId = await renderWithMesa(<UsageScreen onSession={() => {}} />, bridge);
  expect(byTestId('usage-panel')[0]?.textContent).toContain('20 input');
  await choose(
    document.querySelector<HTMLSelectElement>('[aria-label="Usage scope"]') ?? undefined,
    'abcdefgh',
  );
  expect(byTestId('usage-panel')[0]?.textContent).toContain('7 input');
  expect(calls.some((args) => args.join(' ').includes('sessions --all --tree'))).toBe(true);
  expect(calls.some((args) => args.join(' ').includes('usage --session abcdefgh'))).toBe(true);
});

test('weekly rewind opens the exact note and session evidence', async () => {
  const report: WeeklyRewind = {
    from: '2026-09-18',
    through: '2026-09-24',
    timezone: 'UTC',
    notes: [
      {
        id: '01TEST00000000000000000001',
        kind: 'decision',
        at: '2026-09-24T11:00',
        summary: 'Choose a safe route',
        path: 'receipts/2026/09/decision.md',
      },
    ],
    sessions: [
      {
        id: 'aaaaaaaa',
        name: 'Build lantern',
        project: 'lantern-cove',
        agent: 'claude',
        endedAt: '2026-09-24T11:30:00.000Z',
        state: 'done',
      },
    ],
    usage: {
      events: 0,
      input: null,
      output: null,
      cacheRead: null,
      cacheWrite: null,
      estimatedCostUsd: null,
    },
    missing: ['aaaaaaaa: native session id is not available'],
  };
  const opened: string[] = [];
  const { bridge, calls } = fakeBridge({
    rewind: () => envelope(report),
    'vault open': () => envelope({ opened: true, method: 'uri', target: 'obsidian://open' }),
  });
  const byTestId = await renderWithMesa(
    <UsageScreen onSession={(id) => opened.push(id)} />,
    bridge,
  );
  const buttons = byTestId('weekly-rewind')[0]?.querySelectorAll('button');
  await click(buttons?.[0]);
  await click(buttons?.[1]);
  expect(
    calls.some((args) => args.join(' ').includes('vault open -- receipts/2026/09/decision.md')),
  ).toBe(true);
  expect(opened).toEqual(['aaaaaaaa']);
  expect(byTestId('weekly-rewind')[0]?.textContent).toContain('Missing data');
});
