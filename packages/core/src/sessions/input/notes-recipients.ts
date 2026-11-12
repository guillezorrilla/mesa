import type { SessionRow } from '../board/rows.js';
import { sessionFolder } from '../record/folder.js';
import { sessionLabel } from '../record/labels.js';
import { liveAgent, reviewable } from '../record/lifecycle.js';
import type { SessionState } from '../record/states.js';

// Who a session's review notes can go to (mesa review notes send --to). Pure, so the app bundles
// it (`@mesa/core/browser`).

/** `mesa review notes send --to new`: the notes go to a new session in the same checkout. */
export const NEW_SESSION = 'new';

/**
 * A session the notes can go to; `unavailable` says why it cannot take them now: it waits on a
 * person, or it is a plain terminal (`terminal`), which has no agent to read them.
 */
export type NotesRecipient = { id: string; name: string; unavailable?: string; terminal?: true };

const WAITING: Partial<Record<SessionState, string>> = {
  'waiting-permission': 'Waiting on a permission',
  'waiting-question': 'Waiting on a question',
};

/**
 * Where session `id`'s notes can go, itself first: each other live agent in the same checkout,
 * its parent, and its children. One waiting on a person, or itself as a plain terminal, is
 * listed with that reason.
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
    const terminal = !reviewable(r);
    const unavailable = terminal ? 'a plain terminal has no agent' : WAITING[r.lastState.state];
    return {
      id: r.id,
      name: sessionLabel(r),
      ...(unavailable ? { unavailable } : {}),
      ...(terminal ? { terminal: true as const } : {}),
    };
  });
}
