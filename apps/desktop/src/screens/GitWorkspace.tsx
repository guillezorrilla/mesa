import type { TreeRow } from '@mesa/core';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { GitBranches } from './GitBranches';
import { GitDiffView } from './GitDiffView';

/** Git changes for the registered checkout and session worktrees. */
export function GitWorkspace(props: { project: string; sessions: readonly TreeRow[] }) {
  const [checkout, setCheckout] = useState('');
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [showBranches, setShowBranches] = useState(false);
  const run = useRun();
  const { acting, act } = useAct();
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
  const changeIndex = (action: 'stage' | 'unstage', path: string) =>
    act(async () => {
      const result = await run(action === 'stage' ? 'git.stage' : 'git.unstage', {
        project: props.project,
        checkout: checkout || undefined,
        path,
      });
      if (!result) return undefined;
      await status.refresh();
      setRevision((last) => last + 1);
      return said(`${action === 'stage' ? 'Staged' : 'Unstaged'} ${path}`, result);
    });
  const commit = () =>
    act(async () => {
      const result = await run('git.commit', {
        project: props.project,
        checkout: checkout || undefined,
        message,
      });
      if (!result) return undefined;
      setMessage('');
      await status.refresh();
      setRevision((last) => last + 1);
      return said(`Committed ${result.oid.slice(0, 7)}`, result);
    });
  const hasStaged = status.data?.changes.some(
    (change) => change.index !== ' ' && change.index !== '?',
  );
  return (
    <section className="space-y-4" aria-label="Git status">
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="Checkout"
          className="max-w-80"
          value={checkout}
          onChange={(event) => {
            setCheckout(event.target.value);
            setDiffPath(null);
          }}
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
          onClick={() => {
            void status.refresh();
            setRevision((last) => last + 1);
          }}
        >
          <RefreshCw aria-hidden /> Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDiffPath('')}>
          View diff
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowBranches((last) => !last)}>
          Branches
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
                  <span className="ml-auto flex shrink-0 gap-1">
                    {change.workingTree !== ' ' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting}
                        onClick={() => void changeIndex('stage', change.path)}
                      >
                        Stage
                      </Button>
                    )}
                    {change.index !== ' ' && change.index !== '?' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting}
                        onClick={() => void changeIndex('unstage', change.path)}
                      >
                        Unstage
                      </Button>
                    )}
                  </span>
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
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void commit();
        }}
      >
        <Input
          aria-label="Commit message"
          className="min-w-60 flex-1"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Commit message"
        />
        <Button type="submit" disabled={acting || !hasStaged || !message.trim()}>
          Commit staged
        </Button>
      </form>
      {diffPath !== null && (
        <GitDiffView
          key={`${checkout}:${diffPath}:${revision}`}
          project={props.project}
          checkout={checkout || undefined}
          path={diffPath || undefined}
          onClose={() => setDiffPath(null)}
        />
      )}
      {showBranches && (
        <GitBranches
          key={checkout}
          project={props.project}
          checkout={checkout || undefined}
          onChanged={() => {
            void status.refresh();
            setRevision((last) => last + 1);
          }}
        />
      )}
    </section>
  );
}
