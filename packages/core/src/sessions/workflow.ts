import { MesaError } from '../lib/result.js';
import type { SessionStore } from './store.js';
import { WORKFLOW_STATUSES, type WorkflowStatus } from './workflow-status.js';

/** Sets or clears a person's workflow label without changing the observed agent state. */
export function setWorkflowStatus(store: SessionStore, id: string, status: string) {
  if (status !== 'clear' && !WORKFLOW_STATUSES.includes(status as WorkflowStatus)) {
    throw new MesaError(
      'usage',
      `workflow status must be ${WORKFLOW_STATUSES.join(', ')}, or clear`,
    );
  }
  return store.update(id, {
    workflowStatus: status === 'clear' ? undefined : (status as WorkflowStatus),
  });
}
