import { MesaError } from '../lib/result.js';
import type { SessionRecord } from './record.js';
import type { SessionStore } from './store.js';

/** Gives a session the name a person calls it by (`mesa rename`); a blank one is refused. */
export function renameSession(store: SessionStore, id: string, name: string): SessionRecord {
  const trimmed = name.trim();
  if (!trimmed) throw new MesaError('usage', 'the name is empty');
  return store.update(id, { name: trimmed });
}
