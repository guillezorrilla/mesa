import type { UsageBreakdown, UsageTotals } from '@mesa/core';
import { usd } from '@mesa/core/browser';

/** List-price dollars to the cent; a cost too small for a cent still reads as spent. */
export const money = (value: number | null) =>
  value === null ? 'Unknown' : value > 0 && value < 0.005 ? '<$0.01' : usd(value, 2);

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

/** The token kinds a row used; a kind it never touched is left out. */
export const tokenLine = (totals: UsageTotals) =>
  (
    [
      ['input', 'in'],
      ['output', 'out'],
      ['cacheWrite', 'cache-w'],
      ['cacheRead', 'cache-r'],
    ] as const
  )
    .filter(([field]) => totals[field] !== 0)
    .map(([field, label]) => `${compact(totals[field])} ${label}`)
    .join(' / ');

/** A model row that counted any tokens; an all-zero one (such as `<synthetic>`) is noise. */
export const counted = (row: UsageBreakdown[number]) => allTokens(row.totals) !== 0;

/** The priced part of some rows' spend: a cost with no list price counts as nothing. */
export const knownCost = (rows: UsageBreakdown) =>
  rows.reduce((sum, row) => sum + (row.totals.estimatedCostUsd ?? 0), 0);

/** A UTC day key (2026-09-26) as "Sat, Sep 26", read in UTC so it never shifts a day. */
export const dayLabel = (day: string, weekday = true) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    ...(weekday ? { weekday: 'short' } : {}),
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

export const modelKey = (row: UsageBreakdown[number]) => `${row.agent}:${row.model}`;

/** Chart colours in fixed order; a ninth model and beyond share the last slot as Other. */
export const SERIES = 8;
export const seriesColor = (index: number) => `var(--series-${Math.min(index, SERIES - 1) + 1})`;
