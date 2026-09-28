import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Fork a provider conversation into a new Mesa worktree. */
export function ForkDialog(props: {
  sessionId: string;
  disabled: boolean;
  onFork: (branch: string) => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="fork-dialog"
      title={`Fork ${props.sessionId} into a worktree`}
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
          className="font-mono"
        />
      </div>
    </ActionDialog>
  );
}
