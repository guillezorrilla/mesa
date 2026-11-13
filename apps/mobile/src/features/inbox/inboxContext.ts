import { createContext } from 'react';
import type { useInboxLive } from './useInboxLive';

/** The Inbox read, held above the tabs; undefined outside InboxProvider. */
export const InboxContext = createContext<ReturnType<typeof useInboxLive> | undefined>(undefined);
