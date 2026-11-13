import type { UpdateMessage } from '@mesa/core/phone';
import { groupOf } from '../sessions/sessionState';

/**
 * Whether a Mac's update may come with a new notice: a session in it waits on the person or has
 * stopped working, which is when a session's notice is raised. A working session's churn (its
 * context, its ask) is not.
 */
export const mayNotify = (update: UpdateMessage) =>
  update.rows.some((row) => groupOf(row.state) !== 'working');
