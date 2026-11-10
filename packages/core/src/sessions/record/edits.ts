// The edits made to a session's record: the name it goes by, a person's workflow label, and its
// agent's progress line.

import { MesaError } from '../../lib/result.js';
import { short } from '../../lib/untrusted-text.js';
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

/** The longest Progress line kept (CONTEXT.md). */
const PROGRESS_MAX = 120;

/**
 * Sets a session's Progress line, one plain line of at most PROGRESS_MAX characters, or clears it
 * with `text` undefined; a line with nothing left once cleaned is refused.
 */
export function setProgress(store: SessionStore, id: string, text: string | undefined, at: string) {
  if (text === undefined) return store.update(id, { progress: undefined });
  const line = short(text, PROGRESS_MAX);
  if (!line) throw new MesaError('usage', 'the progress line is empty');
  return store.update(id, { progress: { text: line, at } });
}
