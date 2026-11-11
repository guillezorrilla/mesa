import type { SessionRow } from '../board/rows.js';
import { sessionFolder } from '../record/folder.js';
import { sessionLabel } from '../record/labels.js';
import { liveAgent } from '../record/lifecycle.js';
import type { SessionState } from '../record/states.js';

// Who a session's review notes can go to (mesa review notes send --to). Pure, so the app bundles
// it (`@mesa/core/browser`).

/** `mesa review notes send --to new`: the notes go to a new session in the same checkout. */
export const NEW_SESSION = 'new';

/** A session the notes can go to; `waiting` says why a send must wait for a person first. */
export type NotesRecipient = { id: string; name: string; waiting?: string };

const WAITING: Partial<Record<SessionState, string>> = {
  'waiting-permission': 'Waiting on a permission',
  'waiting-question': 'Waiting on a question',
};

/**
 * Where session `id`'s notes can go, itself first: each other live agent in the same checkout,
 * its parent, and its children. One waiting on a person is listed with that reason.
 */
export function notesRecipients(rows: readonly SessionRow[], id: string): NotesRecipient[] {
  const self = rows.find((r) => r.id === id);
  // Before the board has read it, it is still the first place its notes go.
  if (!self?.managed) return [{ id, name: id }];
  const here = (r: SessionRow) =>
    r.managed && r.project === self.project && sessionFolder(r) === sessionFolder(self);
  const kin = (r: SessionRow) => r.id === self.parentNow || self.children.includes(r.id);
  const others = rows.filter((r) => r.id !== id && liveAgent(r) && (here(r) || kin(r)));
  return [self, ...others].map((r) => {
    const waiting = WAITING[r.lastState.state];
    return { id: r.id, name: sessionLabel(r), ...(waiting ? { waiting } : {}) };
  });
}
