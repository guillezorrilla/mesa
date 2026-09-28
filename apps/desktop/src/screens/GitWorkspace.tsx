import type { TreeRow } from '@mesa/core';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useCommand } from '@/lib/useCommand';
import { GitDiffView } from './GitDiffView';

/** Read-only Git view for the registered checkout and session worktrees. */
export function GitWorkspace(props: { project: string; sessions: readonly TreeRow[] }) {
  const [checkout, setCheckout] = useState('');
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const paths = [
    ...new Set(
      props.sessions.flatMap((row) =>
        row.managed && row.project === props.project && row.worktree ? [row.worktree.path] : [],
      ),
    ),
  ];
  const status = useCommand('git.status', {
    project: props.project,
    checkout: checkout || undefined,
  });
  return (
    <section className="space-y-4" aria-label="Git status">
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="Checkout"
          className="max-w-80"
          value={checkout}
          onChange={(event) => setCheckout(event.target.value)}
        >
          <NativeSelectOption value="">Main checkout</NativeSelectOption>
          {paths.map((path) => (
            <NativeSelectOption key={path} value={path}>
              {path}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          size="sm"
          disabled={status.busy}
          onClick={() => void status.refresh()}
        >
          <RefreshCw aria-hidden /> Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDiffPath('')}>
          View diff
        </Button>
      </div>
      {status.data && (
        <>
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="secondary">{status.data.branch ?? 'Detached HEAD'}</Badge>
            <span
              className="truncate font-mono text-xs text-muted-foreground"
              title={status.data.checkout.path}
            >
              {status.data.checkout.path}
            </span>
          </div>
          {status.data.changes.length ? (
            <ul className="divide-y rounded-lg border" aria-label="Changed files">
              {status.data.changes.map((change) => (
                <li
                  key={`${change.path}:${change.oldPath ?? ''}`}
                  className="flex gap-3 px-3 py-2 text-sm"
                >
                  <span
                    className="w-8 shrink-0 font-mono text-muted-foreground"
                    title="Index and working tree status"
                  >
                    {change.index}
                    {change.workingTree}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 break-all text-left font-mono hover:text-primary"
                    onClick={() => setDiffPath(change.path)}
                  >
                    {change.oldPath ? `${change.oldPath} -> ${change.path}` : change.path}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Working tree clean.</p>
          )}
        </>
      )}
      {!status.data && status.busy && (
        <p className="text-sm text-muted-foreground">Loading Git status...</p>
      )}
      {diffPath !== null && (
        <GitDiffView
          project={props.project}
          checkout={checkout || undefined}
          path={diffPath || undefined}
          onClose={() => setDiffPath(null)}
        />
      )}
    </section>
  );
}
