import type { ReactNode } from 'react';
import { InboxContext } from './inboxContext';
import { useInboxLive } from './useInboxLive';

/** Keeps the Mac's Inbox read for the Inbox tab and its badge alike. */
export function InboxProvider({ children }: { children: ReactNode }) {
  return <InboxContext value={useInboxLive()}>{children}</InboxContext>;
}
