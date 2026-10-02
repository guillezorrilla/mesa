import type { UsageReport } from '@mesa/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { SectionLabel } from '@/components/SectionLabel';
import { AGENT_LABEL, allTokens, compact, dayLabel, modelKey, money, tokenLine } from './format';

/** The chart's days that had usage, newest first; each opens onto its models. */
export function UsageByDay(props: { daily: UsageReport['daily'] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const days = props.daily.filter((day) => day.totals.events > 0).reverse();
  if (!days.length) return null;
  return (
    <section aria-label="Daily usage and cost">
      <SectionLabel className="mb-2">Daily usage &amp; cost</SectionLabel>
      <div className="divide-y rounded-lg border bg-background">
        {days.map((day) => {
          const expanded = open.has(day.day);
          const Chevron = expanded ? ChevronDown : ChevronRight;
          return (
            <div key={day.day}>
              <button
                type="button"
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40"
                onClick={() =>
                  setOpen((last) => {
                    const next = new Set(last);
                    if (expanded) next.delete(day.day);
                    else next.add(day.day);
                    return next;
                  })
                }
              >
                <Chevron aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-sm">{dayLabel(day.day)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {day.models.map((row) => row.model).join(', ')}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {compact(allTokens(day.totals))} tokens
                </span>
                <span className="w-16 text-right text-sm font-medium">
                  {money(day.totals.estimatedCostUsd)}
                </span>
              </button>
              {expanded && (
                <div className="space-y-1 pr-3 pb-2 pl-10">
                  {day.models.map((row) => (
                    <p key={modelKey(row)} className="flex items-center gap-3 py-1 text-xs">
                      <span className="flex-1 truncate font-mono text-muted-foreground">
                        {row.model}
                      </span>
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {AGENT_LABEL[row.agent] ?? row.agent}
                      </span>
                      <span className="text-muted-foreground">{tokenLine(row.totals)}</span>
                      <span className="w-16 text-right font-medium">
                        {money(row.totals.estimatedCostUsd)}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
