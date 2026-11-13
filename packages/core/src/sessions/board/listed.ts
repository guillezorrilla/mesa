import { isInternalSession } from '../record/labels.js';
import { activeSession, recoverable } from '../record/lifecycle.js';
import type { SessionRow } from './rows.js';

/**
 * A session the sidebar and the phone's Agents tab list: an active or recoverable one, never Mesa's
 * own plumbing (isInternalSession: a Skill run such as a Vault capture's, or a Setup session).
 * An ended, archived or resumed session has nothing left to open, so it drops out. Pure, so the
 * app bundles it (`@mesa/core/browser`).
 */
export const listedSession = (s: SessionRow) =>
  !isInternalSession(s) && (activeSession(s) || recoverable(s));
