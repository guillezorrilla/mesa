import type { ContextReport } from '@mesa/core';
import { modelLabel } from '@mesa/core/browser';
import { Muted } from '@/components/Muted';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { contextTone, toneIndicator } from '../ContextBar';

/**
 * Claude Code's `/context` as a panel (#1218): the window used, toned as the context ring is, and
 * each category's tokens and share as the agent counted them.
 */
export function ContextUsagePanel(props: { report: ContextReport }) {
  const { report } = props;
  const tone = contextTone(report.percent);
  return (
    <div data-testid="context-usage-panel" className="flex flex-col gap-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{report.percent}% used</span>
        <span className="text-muted-foreground tabular-nums">
          {report.used} of {report.window} tokens
          {report.model ? ` · ${modelLabel(report.model)}` : ''}
        </span>
      </div>
      <Progress
        value={report.percent}
        aria-label="Context used"
        className={cn('h-1.5', toneIndicator(tone))}
      />
      {report.categories.length > 0 ? (
        <ul className="grid gap-1.5 text-xs">
          {report.categories.map((category) => (
            <li
              key={category.name}
              className="grid grid-cols-[minmax(0,12rem)_4rem_minmax(0,1fr)_3.5rem] items-center gap-3"
            >
              <span className="truncate">{category.name}</span>
              <span className="text-right text-muted-foreground tabular-nums">
                {category.tokens}
              </span>
              <Progress value={category.percent} className="h-1" aria-hidden />
              <span className="text-right text-muted-foreground tabular-nums">
                {category.share}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Muted size="xs">No breakdown in the agent's reply.</Muted>
      )}
    </div>
  );
}
