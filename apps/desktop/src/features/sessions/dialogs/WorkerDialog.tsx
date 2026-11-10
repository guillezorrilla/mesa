import { ActionDialog } from '@/components/ActionDialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CHILD_START_HINT } from '../start/useStartSession';

/** Starts a worker of a session (`mesa worker`): its task, in a new worktree, briefed to report. */
export function WorkerDialog(props: {
  sessionId: string;
  project: string;
  disabled: boolean;
  onStart: (task: string) => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="worker-dialog"
      title="New worker"
      description={`A child of ${props.sessionId} on ${props.project}, in its own worktree.`}
      submit={{ label: 'Start', testId: 'worker-submit', disabled: props.disabled }}
      onSubmit={(form) => props.onStart(String(new FormData(form).get('task') ?? ''))}
      onCancel={props.onCancel}
    >
      <div className="grid gap-2">
        <Label htmlFor="worker-task">Task</Label>
        <Textarea id="worker-task" name="task" data-testid="worker-task" rows={4} required />
        <p className="text-xs text-muted-foreground">{CHILD_START_HINT}.</p>
      </div>
    </ActionDialog>
  );
}
