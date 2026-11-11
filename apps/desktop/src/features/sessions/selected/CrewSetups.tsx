import type { CrewRow, TreeRow } from '@mesa/core';

/**
 * The Crew's branches and setup, folded: each worker's branch and how its worktree setup went
 * (CONTEXT.md, Worktree); a failed one opens its Setup session.
 */
export function CrewSetups(props: {
  workers: readonly CrewRow[];
  setupsOf: (id: string) => readonly TreeRow[];
  onOpen: (id: string) => void;
}) {
  if (!props.workers.length) return null;
  return (
    <details data-testid="crew-setups" className="mx-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">Branches and setup</summary>
      <ul className="mt-2 grid gap-1 font-mono text-[11px]">
        {props.workers.map((worker) => {
          const setups = props.setupsOf(worker.id);
          const failed = setups.find((setup) => setup.managed && setup.setupFailed);
          return (
            <li key={worker.id} className="flex min-w-0 gap-1">
              <span className="truncate">{worker.branch ?? 'no branch'},</span>{' '}
              {failed ? (
                <button
                  type="button"
                  className="shrink-0 text-state-failed hover:underline"
                  onClick={() => props.onOpen(failed.id)}
                >
                  setup failed
                </button>
              ) : (
                <span className="shrink-0">
                  {setups.length ? 'setup running or passed' : 'no setup'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
