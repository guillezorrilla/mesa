import type { ProjectContext } from '@mesa/core';
import { shortAgo } from '@mesa/core/browser';
import { History } from 'lucide-react';
import { CappedList } from '@/components/CappedList';
import { Badge } from '@/components/ui/badge';
import { OverviewCard } from './OverviewCard';

/** The project's earlier sessions, newest first: each goal's first line, and its summary note. */
export function RecentGoalsCard(props: {
  goals: ProjectContext['goals'];
  onItem: (path: string) => void;
}) {
  const now = Date.now();
  return (
    <OverviewCard title="Recent sessions" icon={History} count={props.goals.length}>
      <CappedList
        items={props.goals}
        cap={5}
        noun="sessions"
        render={(goal) => (
          <li
            key={goal.id}
            data-testid="vault-overview-goal"
            className="flex min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 text-sm"
          >
            <span
              className={goal.goal ? 'line-clamp-2' : 'italic text-muted-foreground'}
              title={goal.goal}
            >
              {goal.goal?.split('\n', 1)[0] ?? 'No goal set'}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="px-1.5 py-0 font-normal">
                {goal.agent}
              </Badge>
              <time dateTime={goal.started}>{shortAgo(goal.started, now)}</time>
              {goal.summary && (
                <button
                  type="button"
                  className="ml-auto text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
                  onClick={() => props.onItem(goal.summary as string)}
                >
                  Summary
                </button>
              )}
            </span>
          </li>
        )}
      />
    </OverviewCard>
  );
}
