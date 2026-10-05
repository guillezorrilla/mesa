import type { UsageReport } from '@mesa/core';
import { AGENT_LABELS } from '@mesa/core/browser';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { modelKey, money, seriesColor, tokenLine } from './format';

/** The 90-day cost of each model, grouped under its provider, with its share as a bar. */
export function UsageByAgent(props: Pick<UsageReport, 'breakdown' | 'agents'>) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const top = Math.max(...props.breakdown.map((row) => row.totals.estimatedCostUsd ?? 0), 0);
  if (!props.agents.length) return null;
  return (
    <section aria-label="Cost by agent">
      <SectionLabel className="mb-2">
        Cost by agent <span className="normal-case">(last 90 days)</span>
      </SectionLabel>
      <div className="divide-y rounded-lg border bg-background">
        {props.agents.map(({ agent, totals }) => {
          const rows = props.breakdown.filter((row) => row.agent === agent);
          const open = !closed.has(agent);
          return (
            <div key={agent}>
              <button
                type="button"
                aria-expanded={open}
                className="flex w-full items-center justify-between bg-card px-3 py-1.5 hover:bg-accent"
                onClick={() =>
                  setClosed((last) => {
                    const next = new Set(last);
                    if (open) next.add(agent);
                    else next.delete(agent);
                    return next;
                  })
                }
              >
                <span className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
                  {open ? (
                    <ChevronDown aria-hidden className="size-3" />
                  ) : (
                    <ChevronRight aria-hidden className="size-3" />
                  )}
                  {AGENT_LABELS[agent]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {money(totals.estimatedCostUsd)}
                </span>
              </button>
              {open &&
                rows.map((row) => (
                  <div key={modelKey(row)} className="flex items-center gap-3 border-t px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm">{row.model}</p>
                      <Muted size="xs">{tokenLine(row.totals)}</Muted>
                    </div>
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-accent">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${top ? ((row.totals.estimatedCostUsd ?? 0) / top) * 100 : 0}%`,
                          background: seriesColor(props.breakdown.indexOf(row)),
                        }}
                      />
                    </span>
                    <span className="w-16 text-right text-sm font-medium">
                      {money(row.totals.estimatedCostUsd)}
                    </span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
