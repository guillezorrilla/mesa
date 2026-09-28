import type { WorktreeRow } from '@mesa/core';
import { FolderGit2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useCommand } from '@/lib/useCommand';

/** Git inventory with the current profile's unfinished session holders. */
export function WorktreesWorkspace(props: { project: string; onSession: (id: string) => void }) {
  const worktrees = useCommand('worktrees.list', { project: props.project });
  const [branch, setBranch] = useState('');
  const [holder, setHolder] = useState('');
  const [state, setState] = useState<WorktreeRow['state'] | 'all'>('all');
  const visible = (worktrees.data ?? []).filter(
    (row) =>
      (!branch || (row.branch ?? '').toLowerCase().includes(branch.toLowerCase())) &&
      (!holder || row.holders.some((session) => session.id.includes(holder))) &&
      (state === 'all' || row.state === state),
  );
  return (
    <section data-testid="worktrees-workspace" className="space-y-4" aria-label="Worktrees">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Filter worktree branch"
          className="w-44"
          placeholder="Branch"
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
        />
        <Input
          aria-label="Filter worktree holder"
          className="w-44"
          placeholder="Session ID"
          value={holder}
          onChange={(event) => setHolder(event.target.value)}
        />
        <NativeSelect
          aria-label="Filter worktree state"
          value={state}
          onChange={(event) => setState(event.target.value as WorktreeRow['state'] | 'all')}
        >
          {(['all', 'ready', 'locked', 'stale', 'detached'] as const).map((value) => (
            <NativeSelectOption key={value} value={value}>
              {value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={worktrees.busy}
          onClick={() => void worktrees.refresh()}
        >
          <RefreshCw aria-hidden /> Refresh
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((row) => (
          <article key={row.path} className="min-w-0 rounded-lg border bg-card/40 p-4">
            <div className="flex items-center gap-2">
              <FolderGit2 aria-hidden className="size-4 text-primary" />
              <h3 className="min-w-0 flex-1 truncate font-medium">
                {row.main ? 'main' : (row.branch ?? 'Detached')}
              </h3>
              <Badge variant="outline">{row.state}</Badge>
            </div>
            <p className="mt-2 truncate font-mono text-xs text-muted-foreground" title={row.path}>
              {row.path}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.holders.map((session) => (
                <Button
                  key={session.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  title={`${session.state} at ${session.at}`}
                  onClick={() => props.onSession(session.id)}
                >
                  {session.name ?? session.id}
                </Button>
              ))}
              {!row.holders.length && (
                <span className="text-xs text-muted-foreground">No session holder</span>
              )}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && !worktrees.busy && (
        <p className="text-sm text-muted-foreground">No worktrees match.</p>
      )}
    </section>
  );
}
