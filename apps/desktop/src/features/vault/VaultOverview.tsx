import { ArrowRight, Library } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/useCommand';
import { HubCard } from './overview/HubCard';
import { RecentGoalsCard } from './overview/RecentGoalsCard';
import { RelatedNotesCard } from './overview/RelatedNotesCard';

/**
 * A project's vault overview (`mesa vault context`): its hub, read with its links, beside its
 * related notes and recent sessions, each opening in the Vault screen. A project with none of
 * them yet gets a place to begin.
 */
export function VaultOverview(props: {
  project: string;
  onItem: (path: string) => void;
  onImport?: () => void;
}) {
  const { data, error } = useCommand('vault.context', { project: props.project });
  if (error) return <Muted role="status">{error.message}</Muted>;
  if (!data) return <Muted role="status">Reading project knowledge...</Muted>;
  const { hub, notes, goals } = data;
  const side = notes.length > 0 || goals.length > 0;
  return (
    <section data-testid="vault-overview" aria-label="Vault overview" className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl border bg-card text-ring">
          <Library aria-hidden className="size-5" />
        </span>
        <div>
          <h3 className="text-base font-medium">Project knowledge</h3>
          <Muted size="xs">Notes, decisions, and session summaries in your vault.</Muted>
        </div>
      </div>
      {!hub && !side ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-6 py-10 text-center">
          <Library aria-hidden className="mb-4 size-8 text-muted-foreground/60" />
          <h4 className="text-base font-medium">A home for your project knowledge</h4>
          <Muted className="mt-2 max-w-sm">
            Bring in context from your sources, or save a note, decision, or summary from a session.
            It will appear here.
          </Muted>
          {props.onImport && (
            <Button className="mt-5" variant="outline" onClick={props.onImport}>
              Import context <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      ) : (
        <div
          className={`grid items-start gap-4 ${hub && side ? 'lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]' : ''}`}
        >
          {hub && <HubCard hub={hub} onItem={props.onItem} />}
          {side && (
            <div className="min-w-0 space-y-4">
              {notes.length > 0 && <RelatedNotesCard notes={notes} onItem={props.onItem} />}
              {goals.length > 0 && <RecentGoalsCard goals={goals} onItem={props.onItem} />}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
