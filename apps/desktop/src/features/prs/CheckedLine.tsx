import { timeAgo } from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { usePrs } from './usePrs';

/** When the Reviews list was last read, and Refresh to read it again; nothing polls. */
export function CheckedLine(props: {
  prs: Pick<ReturnType<typeof usePrs>, 'list' | 'readAt'>;
  now: number;
  className?: string;
}) {
  const { list, readAt } = props.prs;
  return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', props.className)}>
      <span data-testid="reviews-read-at">
        {readAt ? `Checked ${timeAgo(new Date(readAt).toISOString(), props.now)}` : ''}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={list.busy}
        onClick={() => void list.refresh()}
      >
        <RefreshCw aria-hidden className="size-3" />
        Refresh
      </Button>
    </div>
  );
}
