import type { TreeRow } from '@mesa/core';
import { cn } from '@/lib/utils';
import { WAITING } from './rows';

/** A row's toggle for the rows under it: how many a closed one hides, and whether one waits. */
export function TreeToggle(props: {
  below: readonly TreeRow[];
  closed: boolean;
  onToggle: () => void;
}) {
  const { below, closed } = props;
  const waits = closed && below.some((r) => WAITING.has(r.lastState.state));
  const count = below.length === 1 ? 'the session' : `the ${below.length} sessions`;
  return (
    <button
      type="button"
      data-testid="session-toggle"
      data-waits={waits}
      aria-expanded={!closed}
      aria-label={
        closed
          ? `Show ${count} under it${waits ? ', one waits on you' : ''}`
          : 'Hide the sessions under it'
      }
      className={cn(
        'mr-1 rounded px-1 font-mono text-muted-foreground text-xs hover:bg-accent hover:text-foreground',
        // A collapsed row that hides a session waiting on you stands out as a wait does.
        waits && 'bg-state-waiting/25 font-semibold text-foreground',
      )}
      onClick={props.onToggle}
    >
      {closed ? `▸ ${below.length}` : '▾'}
    </button>
  );
}
