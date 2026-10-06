import type { SessionRecord } from '@mesa/core';
import { contextPercent, timeAgo } from '@mesa/core/browser';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { contextTone, toneIndicator } from '../ContextBar';

/** The ring's colour for each context tone: the Board's context bar's. */
const RING = {
  normal: 'var(--state-idle)',
  amber: 'var(--state-waiting)',
  red: 'var(--state-failed)',
};

/**
 * How full the selected session's context is, as a ring beside its name; clicking it opens its
 * context use: percent and tokens, model, effort, and when it was read.
 */
export function ContextRing(props: { context?: SessionRecord['context'] }) {
  const { context } = props;
  const shown = context ? contextPercent(context.used) : 0;
  const tone = context ? contextTone(context.used) : 'normal';
  return (
    <Popover>
      <PopoverTrigger
        data-testid="context-ring"
        data-tone={tone}
        aria-label={context ? `Context window: ${shown}%` : 'Context window: unknown'}
        className={cn(
          'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full p-0.5 focus-visible:outline-2 focus-visible:outline-ring',
          !context && 'border border-muted-foreground/50',
        )}
        style={
          context
            ? { background: `conic-gradient(${RING[tone]} ${shown}%, var(--border) 0)` }
            : undefined
        }
      >
        {context && <span className="size-full rounded-full bg-card" />}
      </PopoverTrigger>
      <PopoverContent data-testid="context-panel" align="start" className="w-64 text-xs">
        {context ? (
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-sm">{shown}% used</span>
              <span className="text-muted-foreground tabular-nums">
                ~{Math.round((Math.min(context.used, 100) / 100) * context.window).toLocaleString()}{' '}
                of {context.window.toLocaleString()} tokens
              </span>
            </div>
            <Progress
              value={shown}
              aria-label="Context used"
              className={cn('h-1.5', toneIndicator(tone))}
            />
            <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-2 gap-y-1">
              <dt className="text-muted-foreground">Model</dt>
              <dd className="break-all font-mono">{context.model ?? 'Unknown'}</dd>
              <dt className="text-muted-foreground">Effort</dt>
              <dd>{context.effort ?? 'Unknown'}</dd>
              <dt className="text-muted-foreground">Read</dt>
              <dd>{timeAgo(context.at, Date.now())}</dd>
            </dl>
          </div>
        ) : (
          <p className="text-muted-foreground">
            No context reading yet: one appears after the agent's first reply.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
