import type { ListedNote } from '@mesa/core';

/**
 * Where a note stands: not sent yet; sent, its lines as they were; sent, and its lines changed
 * since (the agent may have acted on it); or unsent with its lines gone, so it cannot be sent.
 */
export type NoteState = 'unsent' | 'sent' | 'changed' | 'stale';

export const noteState = (note: ListedNote): NoteState =>
  note.sentAt ? (note.stale ? 'changed' : 'sent') : note.stale ? 'stale' : 'unsent';

/** The order a file's notes are listed in, and what each state reads as. */
export const NOTE_STATES: Record<NoteState, { order: number; label: string }> = {
  unsent: { order: 0, label: 'Unsent' },
  sent: { order: 1, label: 'Sent' },
  changed: { order: 2, label: 'Changed since sent' },
  stale: { order: 3, label: 'Stale' },
};
