import type { UsageBreakdown, UsageTotals } from '@mesa/core';

/** List-price dollars to the cent; a cost too small for a cent still reads as spent. */
export const money = (value: number | null) =>
  value === null ? 'Unknown' : value > 0 && value < 0.005 ? '<$0.01' : `$${value.toFixed(2)}`;

/** 207.4k, 1.2M: token counts, short. */
export const compact = (value: number | null) =>
  value === null
    ? 'Unknown'
    : value >= 1e6
      ? `${(value / 1e6).toFixed(1)}M`
      : value >= 1e3
        ? `${(value / 1e3).toFixed(1)}k`
        : String(value);

/** Every token a provider counted, cache included; unknown when any part is. */
export const allTokens = (totals: UsageTotals) =>
  totals.input === null ||
  totals.output === null ||
  totals.cacheRead === null ||
  totals.cacheWrite === null
    ? null
    : totals.input + totals.output + totals.cacheRead + totals.cacheWrite;

export const tokenLine = (totals: UsageTotals) =>
  `${compact(totals.input)} in / ${compact(totals.output)} out / ${compact(totals.cacheWrite)} cache-w / ${compact(totals.cacheRead)} cache-r`;

/** A UTC day key (2026-09-26) as "Sat, Sep 26", read in UTC so it never shifts a day. */
export const dayLabel = (day: string, weekday = true) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    ...(weekday ? { weekday: 'short' } : {}),
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

export const AGENT_LABEL: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };

export const modelKey = (row: UsageBreakdown[number]) => `${row.agent}:${row.model}`;

/** Chart colours in fixed order; a ninth model and beyond share the last slot as Other. */
export const SERIES = 8;
export const seriesColor = (index: number) => `var(--series-${Math.min(index, SERIES - 1) + 1})`;
