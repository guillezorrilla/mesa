import { useEffect } from 'react';
import { useMac } from '../mac/useMac';

/**
 * Marks the open session read whenever it shows unread, as the desktop does for the session it
 * shows (CONTEXT.md, Unread); its Mac then pushes the row read to the Agents list.
 */
export function useReadWhileOpen(id: string, unread: boolean) {
  const link = useMac();
  useEffect(() => {
    // Quietly: a failed mark leaves it unread, and the next read of it tries again.
    if (unread) link.call({ method: 'mark', id, unread: false }).catch(() => {});
  }, [link, id, unread]);
}
