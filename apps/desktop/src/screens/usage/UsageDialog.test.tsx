// @vitest-environment happy-dom
import type { Config, UsageReport, WeeklyRewind } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  choose,
  click,
  envelope,
  fakeBridge,
  managedRow,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { UsageDialog } from './UsageDialog';

const zero = { events: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estimatedCostUsd: 0 };
const opus = {
  events: 3,
  input: 8,
  output: 204,
  cacheRead: 178_600,
  cacheWrite: 28_600,
  estimatedCostUsd: 0.27,
};
const day = (date: string, models: UsageReport['breakdown'] = []) => ({
  day: date,
  totals: models.length ? opus : zero,
  models,
});
/** Thirty quiet days, then one with an invented model's usage. */
const used: UsageReport = {
  rows: [],
  unknown: [],
  periods: { today: zero, '7d': opus, '30d': opus, '90d': opus, month: opus },
  daily: [
    ...Array.from({ length: 29 }, (_, i) => day(`2026-08-${String(i + 1).padStart(2, '0')}`)),
    day('2026-09-26', [{ agent: 'claude', model: 'opus-5-5', totals: opus }]),
  ],
  breakdown: [{ agent: 'claude', model: 'opus-5-5', totals: opus }],
  agents: [{ agent: 'claude', totals: opus }],
  alerts: [],
};
const text = (id: string, byTestId: (id: string) => HTMLElement[]) =>
  byTestId(id)[0]?.textContent ?? '';
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );

test('the dialog shows period cards, the daily chart by model, agents, and days that open', async () => {
  const { bridge } = fakeBridge({ usage: () => envelope(used) });
  const byTestId = await renderWithMesa(
    <UsageDialog open onOpenChange={() => {}} onSession={() => {}} />,
    bridge,
  );
  const panel = () => text('usage-panel', byTestId);
  expect(panel()).toContain('Usage & Estimated Costs');
  expect(panel()).toContain('Today$0.00');
  expect(panel()).toContain('Last 7 days$0.27');
  expect(panel()).toContain('$0.27 over 30 days');
  expect(document.querySelector('[aria-label="Legend"]')?.textContent).toBe('opus-5-5');
  expect(document.querySelector('[aria-label="Cost by agent"]')?.textContent).toContain(
    '8 in / 204 out / 28.6k cache-w / 178.6k cache-r',
  );
  await click(button('Sat, Sep 26opus-5-5207.4k tokens$0.27'));
  expect(document.querySelector('[aria-label="Daily usage and cost"]')?.textContent).toContain(
    'Claude Code8 in / 204 out / 28.6k cache-w / 178.6k cache-r',
  );
  await click(button('Tokens'));
  expect(panel()).toContain('207.4k over 30 days');
  expect(document.querySelector('[aria-label="Legend"]')?.textContent).toBe(
    'InputOutputCache WriteCache Read',
  );
});

test('cost alerts show progress, save every changed limit, and preview without spending', async () => {
  const base = ((await fakeBridge().bridge(['--json', 'config'])) as { data: Config }).data;
  const config = { ...base, usage: { dailyAlertUsd: 1, weeklyAlertUsd: 0, monthlyAlertUsd: 0 } };
  const reached: UsageReport = {
    ...used,
    periods: { ...used.periods, today: { ...zero, estimatedCostUsd: 1.5 } },
    alerts: [{ period: 'today', thresholdUsd: 1, knownCostUsd: 1.5 }],
  };
  const { bridge, calls } = fakeBridge({
    usage: () => envelope(reached),
    config: () => envelope(config),
    'config set': () => envelope({ path: 'usage.weeklyAlertUsd', value: 2 }),
  });
  const byTestId = await renderWithMesa(
    <UsageDialog open onOpenChange={() => {}} onSession={() => {}} />,
    bridge,
  );
  const alerts = () => document.querySelector('[aria-label="Cost alerts"]')?.textContent ?? '';
  expect(alerts()).toContain('Reached: $1.50 of $1.00');
  expect(alerts()).toContain('No alert configured');
  expect(button('Save')?.disabled).toBe(true);
  const weekly = document.querySelector<HTMLInputElement>('#usage-weeklyAlertUsd');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(weekly, '2');
    weekly?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(button('Save'));
  const sets = calls.filter((args) => args[1] === 'config' && args[2] === 'set');
  expect(sets.map((args) => args.slice(-2))).toEqual([['usage.weeklyAlertUsd', '2']]);
  await click(button('Preview alert'));
  expect(toastTexts(byTestId).at(-1)).toContain('Preview: known estimated daily cost');
});

test('usage scope shows the selected session period totals', async () => {
  const retained: UsageReport['rows'][number] = {
    id: 'claude:old:message',
    session: 'oldold01',
    agent: 'claude',
    nativeSessionId: '00000000-0000-4000-8000-000000000009',
    at: '2026-09-24T12:00:00.000Z',
    source: 'claude-transcript',
    tokens: { input: 5, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
    priceVersion: null,
    estimatedCostUsd: null,
  };
  const report = (cost: number, rows: UsageReport['rows'] = []): UsageReport => {
    const spent = { ...zero, estimatedCostUsd: cost };
    return {
      ...used,
      rows,
      periods: { today: spent, '7d': spent, '30d': spent, '90d': spent, month: spent },
    };
  };
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([managedRow('abcdefgh', { name: 'Lantern' })]),
    usage: (args) =>
      envelope(
        args.includes('abcdefgh')
          ? report(7)
          : args.includes('oldold01')
            ? report(5, [retained])
            : report(12, [retained]),
      ),
  });
  const byTestId = await renderWithMesa(
    <UsageDialog open onOpenChange={() => {}} onSession={() => {}} />,
    bridge,
  );
  const today = () => text('usage-panel', byTestId).match(/Today(\$[\d.]+)/)?.[1];
  expect(today()).toBe('$12.00');
  const scope =
    document.querySelector<HTMLSelectElement>('[aria-label="Usage scope"]') ?? undefined;
  expect(scope?.textContent).toContain('oldold01 (retained usage)');
  await choose(scope, 'abcdefgh');
  expect(today()).toBe('$7.00');
  // A single session's cost has no profile alerts to set.
  expect(document.querySelector('[aria-label="Cost alerts"]')).toBeNull();
  await choose(scope, 'oldold01');
  expect(today()).toBe('$5.00');
  expect(calls.some((args) => args.join(' ').includes('usage --session abcdefgh'))).toBe(true);
  expect(calls.some((args) => args.join(' ').includes('usage --session oldold01'))).toBe(true);
});

test('weekly rewind loads when opened, then opens the exact note and session evidence', async () => {
  const rewind: WeeklyRewind = {
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
    usage: { ...zero, input: null, output: null, estimatedCostUsd: null },
    missing: ['aaaaaaaa: native session id is not available'],
  };
  const opened: string[] = [];
  const { bridge, calls } = fakeBridge({
    usage: () => envelope(used),
    rewind: () => envelope(rewind),
    'vault open': () => envelope({ opened: true, method: 'uri', target: 'obsidian://open' }),
  });
  const byTestId = await renderWithMesa(
    <UsageDialog open onOpenChange={() => {}} onSession={(id) => opened.push(id)} />,
    bridge,
  );
  expect(calls.some((args) => args[1] === 'rewind')).toBe(false);
  await click(button('Weekly rewind'));
  await act(async () => {});
  const buttons = byTestId('weekly-rewind')[0]?.querySelectorAll('button');
  await click(buttons?.[0]);
  await click(buttons?.[1]);
  expect(
    calls.some((args) => args.join(' ').includes('vault open -- receipts/2026/09/decision.md')),
  ).toBe(true);
  expect(opened).toEqual(['aaaaaaaa']);
  expect(byTestId('weekly-rewind')[0]?.textContent).toContain('Missing data');
});
