// @vitest-environment happy-dom
import type { UsageReport } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
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
  const byTestId = await renderWithMesa(<UsageScreen />, bridge);
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
