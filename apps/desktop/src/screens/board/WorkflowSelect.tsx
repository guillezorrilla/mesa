import type { WorkflowStatus } from '@mesa/core';
import { WORKFLOW_STATUSES } from '@mesa/core/browser';
import { Label } from '@/components/ui/label';

export function WorkflowSelect(props: {
  id: string;
  status?: WorkflowStatus;
  disabled: boolean;
  onChange: (status: WorkflowStatus | 'clear') => void;
}) {
  return (
    <Label className="flex items-center gap-2 text-muted-foreground text-xs">
      Workflow
      <select
        data-testid="session-workflow"
        aria-label={`Workflow for ${props.id}`}
        className="h-8 rounded-md border border-input bg-background px-2 text-foreground"
        value={props.status ?? 'clear'}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value as WorkflowStatus | 'clear')}
      >
        <option value="clear">Unassigned</option>
        {WORKFLOW_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </Label>
  );
}
