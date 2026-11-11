import type { SessionModel } from '@mesa/core';
import { ActionDialog } from '@/components/ActionDialog';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { CHILD_START_HINT } from '../start/useStartSession';

const MODELS = [
  ['', 'Default'],
  ['sonnet', 'Sonnet'],
  ['haiku', 'Haiku'],
] as const;
const EFFORTS = [
  ['', 'Default'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
] as const;

/** Starts a worker of a session (`mesa worker`): its task, in a new worktree, briefed to report. */
export function WorkerDialog(props: {
  sessionId: string;
  project: string;
  disabled: boolean;
  onStart: (task: string, how: SessionModel) => void;
  onCancel: () => void;
}) {
  const select = (name: string, label: string, options: readonly (readonly [string, string])[]) => (
    <div className="grid gap-2">
      <Label htmlFor={`worker-${name}`}>{label}</Label>
      <NativeSelect id={`worker-${name}`} name={name} data-testid={`worker-${name}`}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
  return (
    <ActionDialog
      testId="worker-dialog"
      title="New worker"
      description={`A child of ${props.sessionId} on ${props.project}, in its own worktree.`}
      submit={{ label: 'Start', testId: 'worker-submit', disabled: props.disabled }}
      onSubmit={(form) => {
        const data = new FormData(form);
        const model = String(data.get('model') ?? '');
        const effort = String(data.get('effort') ?? '');
        props.onStart(String(data.get('task') ?? ''), {
          ...(model ? { model } : {}),
          ...(effort ? { effort } : {}),
        });
      }}
      onCancel={props.onCancel}
    >
      <div className="grid gap-2">
        <Label htmlFor="worker-task">Task</Label>
        <Textarea id="worker-task" name="task" data-testid="worker-task" rows={4} required />
        <p className="text-xs text-muted-foreground">{CHILD_START_HINT}.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {select('model', 'Model', MODELS)}
        {select('effort', 'Effort', EFFORTS)}
      </div>
    </ActionDialog>
  );
}
