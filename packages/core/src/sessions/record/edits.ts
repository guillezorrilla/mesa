// The edits a person makes to a session's record: the name it goes by and its workflow label.

import { MesaError } from '../../lib/result.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';
import { WORKFLOW_STATUSES, type WorkflowStatus } from './workflow-status.js';

/** A session's name as kept: trimmed; a blank one is refused. */
export function sessionName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new MesaError('usage', 'the name is empty');
  return trimmed;
}

/** Gives a session the name a person calls it by (`mesa rename`). */
export const renameSession = (store: SessionStore, id: string, name: string): SessionRecord =>
  store.update(id, { name: sessionName(name) });

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
