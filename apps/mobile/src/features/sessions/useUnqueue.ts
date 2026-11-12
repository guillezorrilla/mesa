import { setDraft } from '../compose/drafts';
import { useMac } from '../mac/useMac';

/**
 * Takes a queued reply back from session `id` before it is typed: removed, or put back in the
 * draft to edit and send again; `onDone` reads the session again.
 */
export function useUnqueue(id: string, onDone: () => void) {
  const link = useMac();
  const unqueue = (message: string) =>
    link.call({ method: 'unqueue', id, message }).finally(onDone);
  return {
    remove: (message: string) => unqueue(message),
    edit: (message: string, text: string) => unqueue(message).then(() => setDraft(id, text)),
  };
}
