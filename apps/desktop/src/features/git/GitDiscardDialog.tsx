import type { GitChange } from '@mesa/core';
import { ActionDialog } from '@/components/ActionDialog';
import { warningOf } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** What a discard throws away: the listed changes, or with `all` every change in the checkout. */
export type DiscardRequest = { changes: GitChange[]; all: boolean };

/** Asks before throwing changes away, lists the files, then discards them and reports back. */
export function GitDiscardDialog(props: {
  project: string;
  checkout?: string;
  request: DiscardRequest;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const { changes, all } = props.request;
  const discard = () =>
    act(async () => {
      const result = await run('git.discard', {
        project: props.project,
        checkout: props.checkout,
        paths: changes.map((change) => change.path),
        all,
      });
      if (!result) return undefined;
      await props.onDone();
      return warningOf(result);
    });
  return (
    <ActionDialog
      testId="git-discard-dialog"
      title={all ? 'Discard all changes?' : 'Discard changes?'}
      description="Staged and unstaged changes go back to the last commit, and untracked files are deleted. This cannot be undone."
      submit={{
        label: all ? 'Discard all' : 'Discard changes',
        testId: 'confirm-git-discard',
        disabled: acting,
        variant: 'destructive',
      }}
      onSubmit={() => void discard()}
      onCancel={props.onCancel}
    >
      <ul aria-label="Files to discard" className="space-y-1 text-sm">
        {changes.map((change) => (
          <li key={`${change.path}:${change.index}`} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-all font-mono">{change.path}</span>
            {change.index === '?' && (
              <span className="shrink-0 text-xs text-state-failed">Untracked, deleted</span>
            )}
          </li>
        ))}
      </ul>
    </ActionDialog>
  );
}
