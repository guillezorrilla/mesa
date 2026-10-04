import type { ManagedRow } from '@mesa/core';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Fork a provider conversation into a new Mesa worktree; a session across several projects gives
 * every project one on the branch.
 */
export function ForkDialog(props: {
  row: ManagedRow;
  disabled: boolean;
  onFork: (branch: string) => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="fork-dialog"
      title={`Fork ${props.row.id} into a worktree`}
      description="Starts a separate native conversation from the source checkout's committed HEAD. The source session stays as it is."
      submit={{ label: 'Fork session', testId: 'fork-submit', disabled: props.disabled }}
      onSubmit={(form) => props.onFork(String(new FormData(form).get('branch') ?? '').trim())}
      onCancel={props.onCancel}
    >
      <div className="grid gap-2">
        <Label htmlFor="fork-branch">Branch</Label>
        <Input
          id="fork-branch"
          name="branch"
          data-testid="fork-branch"
          required
          aria-describedby={props.row.additional ? 'fork-branch-hint' : undefined}
          className="font-mono"
        />
        {props.row.additional && (
          <Muted id="fork-branch-hint" size="xs">
            Every project gets a worktree on this branch
          </Muted>
        )}
      </div>
    </ActionDialog>
  );
}
