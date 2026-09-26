import { MesaError } from '../lib/result.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';

/** A session's name as kept: trimmed; a blank one is refused. */
export function sessionName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new MesaError('usage', 'the name is empty');
  return trimmed;
}

/** Gives a session the name a person calls it by (`mesa rename`). */
export const renameSession = (store: SessionStore, id: string, name: string): SessionRecord =>
  store.update(id, { name: sessionName(name) });
