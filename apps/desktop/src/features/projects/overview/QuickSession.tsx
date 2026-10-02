import { FolderGit2, Plus, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Quick empty session, which on hover splits into a session in the main checkout, one in a new
 * worktree, or a terminal.
 */
export function QuickSession(props: {
  disabled: boolean;
  /** An empty session in the main checkout, at once. */
  onStart: () => void;
  onNewSession: (kind: 'worktree' | 'terminal') => void;
}) {
  return (
    <div className="group relative flex min-h-16 w-[310px] items-stretch rounded-lg border border-dashed text-muted-foreground">
      <Button
        type="button"
        variant="ghost"
        data-testid="quick-session"
        className="absolute inset-0 h-full w-full group-hover:pointer-events-none group-hover:opacity-0 group-focus-within:opacity-0"
        disabled={props.disabled}
        onClick={props.onStart}
      >
        <Plus aria-hidden /> Quick empty session
      </Button>
      <div className="z-10 hidden w-full grid-cols-3 bg-card group-hover:grid group-focus-within:grid">
        {(['main', 'worktree', 'terminal'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            data-testid={`quick-${kind}`}
            className="flex flex-col items-center justify-center gap-1 border-r border-dashed text-xs last:border-r-0 hover:bg-accent"
            disabled={props.disabled}
            onClick={() => (kind === 'main' ? props.onStart() : props.onNewSession(kind))}
          >
            {kind === 'terminal' ? (
              <TerminalSquare aria-hidden className="size-4" />
            ) : kind === 'worktree' ? (
              <FolderGit2 aria-hidden className="size-4" />
            ) : (
              <Plus aria-hidden className="size-4" />
            )}
            {kind === 'main' ? 'Main' : kind === 'worktree' ? 'Worktree' : 'Terminal'}
          </button>
        ))}
      </div>
    </div>
  );
}
