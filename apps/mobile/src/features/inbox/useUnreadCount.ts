import { use } from 'react';
import { useSettled } from '@/lib/useSettled';
import { InboxContext } from './inboxContext';
import { unreadCount } from './unreadCount';

/** The Inbox's unread notices as InboxProvider last read them, for the tab's badge. */
export function useUnreadCount() {
  const inbox = use(InboxContext);
  if (!inbox) throw new Error('useUnreadCount outside InboxProvider');
  return unreadCount(useSettled(inbox.answer)?.result?.notices ?? []);
}
