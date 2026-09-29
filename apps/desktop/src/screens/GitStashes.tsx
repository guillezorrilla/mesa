import type { StashEntry } from '@mesa/core';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/** Saved changes in the selected project's Git repository. */
export function GitStashes(props: { project: string; checkout?: string; onChanged: () => void }) {
  const [message, setMessage] = useState('');
  const [dropping, setDropping] = useState<StashEntry>();
  const stashes = useCommand('git.stashes', { project: props.project, checkout: props.checkout });
  const run = useRun();
  const { acting, act } = useAct();
  const changed = async () => {
    await stashes.refresh();
    props.onChanged();
  };
  const create = () =>
    act(async () => {
      const result = await run('git.stashCreate', {
        project: props.project,
        checkout: props.checkout,
        message: message || undefined,
      });
      if (!result) return undefined;
      setMessage('');
      await changed();
      return said(result.created ? 'Saved stash' : 'No changes to stash', result);
    });
  // The listed oid goes along: a stash pushed meanwhile shifts every ref, and core refuses then.
  const change = (action: 'Apply' | 'Pop' | 'Drop', { ref, oid }: StashEntry) =>
    act(async () => {
      const result = await run(`git.stash${action}`, {
        project: props.project,
        checkout: props.checkout,
        ref,
        oid,
      });
      if (!result) return undefined;
      setDropping(undefined);
      await changed();
      return said(
        `${action === 'Apply' ? 'Applied' : action === 'Pop' ? 'Popped' : 'Dropped'} ${ref}`,
        result,
      );
    });
  return (
    <section aria-label="Git stashes" className="space-y-3 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">Stashes</h3>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Input
          aria-label="Stash message"
          className="min-w-40 flex-1"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Optional message"
        />
        <Button type="submit" disabled={acting}>
          Stash changes
        </Button>
      </form>
      {stashes.data?.stashes.length === 0 && (
        <p className="text-sm text-muted-foreground">No saved stashes.</p>
      )}
      <ul className="divide-y">
        {stashes.data?.stashes.map((stash) => (
          <li key={stash.oid} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 break-all">
              <span className="font-mono">{stash.ref}</span> {stash.message}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => void change('Apply', stash)}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => void change('Pop', stash)}
            >
              Pop
            </Button>
            <Button size="sm" variant="ghost" disabled={acting} onClick={() => setDropping(stash)}>
              Drop
            </Button>
          </li>
        ))}
      </ul>
      {dropping && (
        <ActionDialog
          testId="git-drop-stash-dialog"
          title={`Drop ${dropping.ref}?`}
          description="This permanently removes the saved stash."
          submit={{
            label: 'Drop stash',
            testId: 'confirm-git-drop-stash',
            disabled: acting,
            variant: 'destructive',
          }}
          onSubmit={() => void change('Drop', dropping)}
          onCancel={() => setDropping(undefined)}
        >
          <p className="text-sm">
            <span className="font-mono">{dropping.ref}</span> {dropping.message}
          </p>
        </ActionDialog>
      )}
    </section>
  );
}
