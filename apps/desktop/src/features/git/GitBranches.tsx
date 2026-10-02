import { ChevronDown, ChevronRight, GitBranch } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/** The Git footer: a folded count of local branches that opens onto their guarded actions. */
export function GitBranches(props: { project: string; checkout?: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [base, setBase] = useState('');
  const [deleteName, setDeleteName] = useState<string>();
  const branches = useCommand('git.branches', { project: props.project, checkout: props.checkout });
  const run = useRun();
  const { acting, act } = useAct();
  const changed = async () => {
    await branches.refresh();
    props.onChanged();
  };
  const create = () =>
    act(async () => {
      const result = await run('git.branchCreate', {
        project: props.project,
        checkout: props.checkout,
        name,
        base: base || undefined,
      });
      if (!result) return undefined;
      setName('');
      setBase('');
      await changed();
      return said(`Created branch ${result.name}`, result);
    });
  const change = (action: 'checkout' | 'delete', branch: string) =>
    act(async () => {
      const input = { project: props.project, checkout: props.checkout, name: branch };
      const result =
        action === 'checkout'
          ? await run('git.branchCheckout', input)
          : await run('git.branchDelete', input);
      if (!result) return undefined;
      setDeleteName(undefined);
      await changed();
      return said(`${action === 'checkout' ? 'Checked out' : 'Deleted'} branch ${branch}`, result);
    });
  return (
    <section aria-label="Local branches" className="shrink-0 border-t bg-card">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        onClick={() => setOpen((last) => !last)}
      >
        {open ? (
          <ChevronDown aria-hidden className="size-4" />
        ) : (
          <ChevronRight aria-hidden className="size-4" />
        )}
        <GitBranch aria-hidden className="size-4 text-state-working" />
        Branches
        {branches.data && (
          <span className="font-normal text-muted-foreground">
            ({branches.data.branches.length})
          </span>
        )}
      </button>
      {open && (
        <div className="max-h-64 space-y-3 overflow-y-auto px-4 pb-3">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Input
              aria-label="New branch name"
              className="min-w-40 flex-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New branch"
            />
            <Input
              aria-label="Start branch from"
              className="min-w-32 flex-1"
              value={base}
              onChange={(event) => setBase(event.target.value)}
              placeholder="Start from HEAD"
            />
            <Button type="submit" disabled={acting || !name.trim()}>
              Create branch
            </Button>
          </form>
          {branches.data?.branches.length === 0 && <Muted>No local branches.</Muted>}
          <ul className="divide-y">
            {branches.data?.branches.map((branch) => (
              <li key={branch.name} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 break-all font-mono">
                  {branch.current ? '* ' : ''}
                  {branch.name}
                </span>
                {branch.checkedOutAt && (
                  <span
                    className="truncate text-xs text-muted-foreground"
                    title={branch.checkedOutAt}
                  >
                    {branch.checkedOutAt}
                  </span>
                )}
                {!branch.current && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting || Boolean(branch.checkedOutAt)}
                    onClick={() => void change('checkout', branch.name)}
                  >
                    Checkout
                  </Button>
                )}
                {!branch.checkedOutAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={acting}
                    onClick={() => setDeleteName(branch.name)}
                  >
                    Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {deleteName && (
            <ActionDialog
              testId="git-delete-branch-dialog"
              title={`Delete branch ${deleteName}?`}
              description="Git will refuse an unmerged branch or one checked out in a worktree."
              submit={{
                label: 'Delete branch',
                testId: 'confirm-git-delete-branch',
                disabled: acting,
                variant: 'destructive',
              }}
              onSubmit={() => void change('delete', deleteName)}
              onCancel={() => setDeleteName(undefined)}
            >
              <p className="font-mono text-sm">{deleteName}</p>
            </ActionDialog>
          )}
        </div>
      )}
    </section>
  );
}
