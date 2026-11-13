import { createContext, use } from 'react';
import type { useInboxLive } from './useInboxLive';

/** The Inbox read, held above the tabs; undefined outside InboxProvider. */
export const InboxContext = createContext<ReturnType<typeof useInboxLive> | undefined>(undefined);

/** The Inbox read as InboxProvider holds it; only under it. */
export function useInboxContext() {
  const inbox = use(InboxContext);
  if (!inbox) throw new Error('Inbox read outside InboxProvider');
  return inbox;
}
