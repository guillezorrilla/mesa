import { useSyncExternalStore } from 'react';
import { draftOf, setDraft, subscribeDrafts } from './drafts';

/** Session `id`'s draft and its setter, kept across screens and launches. */
export function useDraft(id: string) {
  const draft = useSyncExternalStore(subscribeDrafts, () => draftOf(id));
  return [draft, (text: string) => setDraft(id, text)] as const;
}
