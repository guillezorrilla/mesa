import type { UsageReport } from '@mesa/core';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { SegmentedControl } from '@/components/SegmentedControl';
import { cn } from '@/lib/utils';
import { compact, dayLabel, modelKey, money, SERIES, seriesColor } from './format';

type Day = UsageReport['daily'][number];
type Series = { key: string; label: string; color: string; value: (day: Day) => number };
export type ChartMode = 'cost' | 'tokens';
export type ChartDays = 7 | 30 | 90;

const TOKEN_SERIES: Series[] = (
  [
    ['input', 'Input'],
    ['output', 'Output'],
    ['cacheWrite', 'Cache Write'],
    ['cacheRead', 'Cache Read'],
  ] as const
).map(([field, label], index) => ({
  key: field,
  label,
  color: seriesColor(index),
  value: (day) => day.totals[field] ?? 0,
}));

/**
 * Cost series are the models in the 90-day breakdown's order, so a model keeps its colour when the
 * range changes; past the palette they fold into one Other.
 */
function costSeries(report: UsageReport): Series[] {
  const keys = report.breakdown.map(modelKey);
  const named = keys.slice(0, keys.length > SERIES ? SERIES - 1 : SERIES);
  const rest = new Set(keys.slice(named.length));
  const cost = (day: Day, wanted: (key: string) => boolean) =>
    day.models
      .filter((row) => wanted(modelKey(row)))
      .reduce((sum, row) => sum + (row.totals.estimatedCostUsd ?? 0), 0);
  return [
    ...named.map((key, index) => ({
      key,
      label: key.slice(key.indexOf(':') + 1),
      color: seriesColor(index),
      value: (day: Day) => cost(day, (other) => other === key),
    })),
    ...(rest.size
      ? [
          {
            key: 'other',
            label: 'Other',
            color: seriesColor(SERIES - 1),
            value: (day: Day) => cost(day, (other) => rest.has(other)),
          },
        ]
      : []),
  ];
}

/** The daily stacked bars: cost by model or tokens by kind, with a tooltip per day. */
export function UsageChart(props: {
  report: UsageReport;
  days: ChartDays;
  mode: ChartMode;
  onDays: (days: ChartDays) => void;
  onMode: (mode: ChartMode) => void;
}) {
  const [hover, setHover] = useState<number>();
  const range = props.report.daily.slice(-props.days);
  const format = props.mode === 'cost' ? money : compact;
  const all = props.mode === 'cost' ? costSeries(props.report) : TOKEN_SERIES;
  const series = all.filter((line) => range.some((day) => line.value(day) > 0));
  const stack = (day: Day) => series.reduce((sum, line) => sum + line.value(day), 0);
  const total = range.reduce((sum, day) => sum + stack(day), 0);
  // ponytail: a 4% headroom over the tallest bar, not "nice" round ticks.
  const top = Math.max(...range.map(stack), 0) * 1.04 || 1;
  const every = props.days === 7 ? 1 : props.days === 30 ? 5 : 15;
  const shown = hover === undefined ? undefined : range[hover];
  return (
    <section className="rounded-lg border bg-background p-4" aria-label="Daily usage chart">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Daily {props.mode === 'cost' ? 'cost' : 'tokens'}</SectionLabel>
          <Muted className="mt-0.5">
            {format(total)} over {props.days} days
          </Muted>
        </div>
        <div className="flex gap-2">
          <SegmentedControl
            label="Chart measure"
            value={props.mode}
            options={[
              ['cost', 'Cost'],
              ['tokens', 'Tokens'],
            ]}
            onChange={props.onMode}
          />
          <SegmentedControl
            label="Chart range"
            value={props.days}
            options={[
              [7, '7d'],
              [30, '30d'],
              [90, '90d'],
            ]}
            onChange={props.onDays}
          />
        </div>
      </div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
        {series.map((line) => (
          <li key={line.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: line.color }} />
            {line.label}
          </li>
        ))}
      </ul>
      <div className="relative grid h-48 grid-cols-[3.5rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_1.25rem]">
        <div className="relative">
          {[4, 3, 2, 1, 0].map((step) => (
            <span
              key={step}
              className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
              style={{ top: `${100 - step * 25}%` }}
            >
              {format((top * step) / 4)}
            </span>
          ))}
        </div>
        <div className="relative flex items-end">
          {[4, 3, 2, 1, 0].map((step) => (
            <span
              key={step}
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed border-border"
              style={{ top: `${100 - step * 25}%` }}
            />
          ))}
          {range.map((day, index) => (
            <button
              key={day.day}
              type="button"
              aria-label={`${dayLabel(day.day)}: ${format(stack(day))}`}
              className={cn(
                'relative z-10 flex h-full flex-1 flex-col-reverse items-center gap-[2px] outline-none',
                hover === index && 'bg-accent/40',
              )}
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              onMouseLeave={() => setHover(undefined)}
              onBlur={() => setHover(undefined)}
            >
              {series.map((line) =>
                line.value(day) > 0 ? (
                  <span
                    key={line.key}
                    className="w-3/5 max-w-6 last:rounded-t-[4px]"
                    style={{
                      background: line.color,
                      height: `${(line.value(day) / top) * 100}%`,
                    }}
                  />
                ) : null,
              )}
            </button>
          ))}
          {shown && hover !== undefined && (
            <div
              role="tooltip"
              className="absolute top-2 z-20 min-w-40 rounded-lg border bg-popover px-3 py-2 shadow-xl"
              style={
                hover > range.length / 2
                  ? { right: `${((range.length - hover) / range.length) * 100}%` }
                  : { left: `${((hover + 1) / range.length) * 100}%` }
              }
            >
              <Muted size="xs" className="mb-1.5">
                {dayLabel(shown.day)}
              </Muted>
              {!stack(shown) && <p className="text-xs">No usage</p>}
              {series
                .filter((line) => line.value(shown) > 0)
                .map((line) => (
                  <p key={line.key} className="flex items-center gap-2 py-0.5 text-xs">
                    <span className="size-2 rounded-full" style={{ background: line.color }} />
                    <span className="flex-1 text-muted-foreground">{line.label}</span>
                    <span className="font-medium">{format(line.value(shown))}</span>
                  </p>
                ))}
              {series.filter((line) => line.value(shown) > 0).length > 1 && (
                <p className="mt-1 flex items-center gap-2 border-t pt-1 text-xs">
                  <span className="flex-1 text-muted-foreground">Total</span>
                  <span className="font-semibold">{format(stack(shown))}</span>
                </p>
              )}
            </div>
          )}
        </div>
        <span />
        <div className="relative">
          {range.map((day, index) =>
            index % every === 0 ? (
              <span
                key={day.day}
                className="absolute top-1 -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground"
                style={{ left: `${((index + 0.5) / range.length) * 100}%` }}
              >
                {dayLabel(day.day, false)}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </section>
  );
}
