import { ArrowRight, ExternalLink, FileText, Library } from 'lucide-react';
import { MarkdownView } from '@/components/MarkdownView';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { useCommand, useRun } from '@/lib/useCommand';
import { PROSE } from './VaultReader';

const HEADING = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const ROW =
  'flex w-full min-w-0 items-baseline gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring';

/**
 * A project's vault overview (`mesa vault context`): its hub's excerpt with Open in Obsidian, its
 * related notes, each opening in the Vault screen, and its recent goals. A project with none of
 * them yet gets a place to begin.
 */
export function VaultOverview(props: {
  project: string;
  onItem: (path: string) => void;
  onImport?: () => void;
}) {
  const { data, error } = useCommand('vault.context', { project: props.project });
  const run = useRun();
  if (error) return <Muted role="status">{error.message}</Muted>;
  if (!data) return <Muted role="status">Reading project knowledge...</Muted>;
  const { hub, notes, goals } = data;
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
      {!hub && !notes.length && !goals.length ? (
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
          className={`grid gap-4 ${hub && (notes.length || goals.length) ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}
        >
          {hub && (
            <div
              data-testid="vault-overview-hub"
              className="min-w-0 space-y-4 rounded-xl border bg-card p-5"
            >
              <div className="flex items-center gap-2">
                <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{hub.path}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void run('vault.openNote', { note: hub.path })}
                >
                  <ExternalLink aria-hidden /> Open in Obsidian
                </Button>
              </div>
              <div className={`max-h-72 overflow-auto ${PROSE}`}>
                <MarkdownView text={hub.excerpt} />
              </div>
            </div>
          )}
          {(notes.length > 0 || goals.length > 0) && (
            <div className="min-w-0 space-y-5 rounded-xl border bg-card/40 p-5">
              {notes.length > 0 && (
                <div className="space-y-1">
                  <h4 className={HEADING}>Related notes</h4>
                  <ul>
                    {notes.map((note) => (
                      <li key={note.path}>
                        <button
                          type="button"
                          data-testid="vault-overview-note"
                          title={note.path}
                          className={ROW}
                          onClick={() => props.onItem(note.path)}
                        >
                          <span className="truncate">{note.title}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {note.modified.slice(0, 10)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {goals.length > 0 && (
                <div className="space-y-1">
                  <h4 className={HEADING}>Recent goals</h4>
                  <ul>
                    {goals.map((goal) => (
                      <li
                        key={goal.id}
                        data-testid="vault-overview-goal"
                        className="flex min-w-0 items-baseline gap-2 px-2 py-1 text-sm"
                      >
                        <span className="truncate" title={goal.goal}>
                          {goal.goal?.split('\n', 1)[0] ?? 'No goal'}
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {goal.agent} · {goal.started.slice(0, 10)}
                        </span>
                        {goal.summary && (
                          <Button
                            size="sm"
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => props.onItem(goal.summary as string)}
                          >
                            Summary
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
