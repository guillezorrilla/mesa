import type { ProjectContext } from '@mesa/core';
import { shortAgo } from '@mesa/core/browser';
import { FileText } from 'lucide-react';
import { CappedList } from '@/components/CappedList';
import { OverviewCard } from './OverviewCard';

/** The project's other notes, newest first; each opens in the Vault screen. */
export function RelatedNotesCard(props: {
  notes: ProjectContext['notes'];
  onItem: (path: string) => void;
}) {
  const now = Date.now();
  return (
    <OverviewCard title="Related notes" icon={FileText} count={props.notes.length}>
      <CappedList
        items={props.notes}
        cap={8}
        noun="notes"
        render={(note) => (
          <li key={note.path}>
            <button
              type="button"
              data-testid="vault-overview-note"
              title={note.path}
              className="flex w-full min-w-0 items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => props.onItem(note.path)}
            >
              <span className="min-w-0 flex-1 truncate">{note.title}</span>
              <time
                dateTime={note.modified}
                className="shrink-0 text-xs tabular-nums text-muted-foreground"
              >
                {shortAgo(note.modified, now)}
              </time>
            </button>
          </li>
        )}
      />
    </OverviewCard>
  );
}
