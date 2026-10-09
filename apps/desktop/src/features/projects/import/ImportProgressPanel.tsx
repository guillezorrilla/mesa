import type { ImportProgress } from '@mesa/core';
import { timeAgo } from '@mesa/core/browser';
import { LoaderCircle } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Progress } from '@/components/ui/progress';

/** What the import is doing now, in words. */
const doing = (progress: ImportProgress | null) =>
  !progress
    ? 'Starting the import'
    : progress.phase === 'notes'
      ? `Writing notes for ${progress.total} ${progress.total === 1 ? 'item' : 'items'}`
      : progress.total
        ? `Fetching ${progress.done} of ${progress.total} ${progress.total === 1 ? 'item' : 'items'}`
        : 'Starting the import';

/**
 * A project's running import, while it runs: what it is doing and how far it is. Fetching fills
 * the bar item by item; Write notes is one agent run, so its bar only says it is working. Null is
 * an import just started, before its first step is read.
 */
export function ImportProgressPanel(props: { progress: ImportProgress | null }) {
  const { progress } = props;
  const fetched = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div
      role="status"
      data-testid="import-progress"
      className="space-y-2 rounded-lg border bg-card/60 px-4 py-3"
    >
      <div className="flex items-center gap-2 text-sm">
        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{doing(progress)}</span>
        {progress && (
          <Muted size="xs" className="shrink-0">
            started {timeAgo(progress.startedAt, Date.now())}
          </Muted>
        )}
      </div>
      {progress?.phase === 'notes' ? (
        <Progress
          aria-label="Writing notes"
          value={100}
          className="animate-pulse motion-reduce:animate-none"
        />
      ) : (
        <Progress aria-label="Fetching items" value={fetched} />
      )}
      <Muted size="xs">
        {progress?.phase === 'notes'
          ? 'An agent writes one note per item; this can take a few minutes. You can keep working.'
          : 'You can keep working; the imported items show below once it ends.'}
      </Muted>
    </div>
  );
}
