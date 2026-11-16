import type { PlanUsage } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toneIndicator } from '../ContextBar';

/** A limit's tone: amber from 75% used, red from 90%, as a limit near its end reads. */
const tone = (percent: number) => (percent >= 90 ? 'red' : percent >= 75 ? 'amber' : 'normal');

/**
 * Claude Code's `/usage` as a panel (#1218): each limit a bar with its percent and when it resets,
 * and what contributes to it, collapsed, window by window. `/usage`'s card and the footer's usage
 * popover both show it.
 */
export function UsagePanel(props: { report: PlanUsage }) {
  const { notes, limits, contributors } = props.report;
  return (
    <div data-testid="usage-panel" className="flex flex-col gap-3 text-sm">
      {notes.map((note) => (
        <Muted key={note} size="xs">
          {note}
        </Muted>
      ))}
      <ul className="flex flex-col gap-3">
        {limits.map((limit) => (
          <li key={limit.label} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{limit.label}</span>
              <span className="text-muted-foreground tabular-nums">{limit.percent}% used</span>
            </div>
            <Progress
              value={limit.percent}
              aria-label={`${limit.label}: ${limit.percent}% used`}
              className={cn('h-1.5', toneIndicator(tone(limit.percent)))}
            />
            {limit.resets && <Muted size="xs">Resets {limit.resets}</Muted>}
          </li>
        ))}
      </ul>
      {contributors.windows.length > 0 && (
        <details className="group rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-muted-foreground text-xs" data-card-control>
            {contributors.notes[0] ?? 'What contributes to your usage'}
          </summary>
          <div className="mt-2 flex flex-col gap-3 text-xs">
            {contributors.notes.slice(1).map((note) => (
              <Muted key={note} size="xs">
                {note}
              </Muted>
            ))}
            {contributors.windows.map((window) => (
              <div key={window.title} className="grid gap-1">
                <span className="font-medium">{window.title}</span>
                <ul className="grid gap-0.5">
                  {window.lines.map((line) => (
                    <li key={line.text} className="flex gap-3">
                      <span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums">
                        {line.percent === undefined ? '' : `${line.percent}%`}
                      </span>
                      <span className="min-w-0 break-words">{line.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
