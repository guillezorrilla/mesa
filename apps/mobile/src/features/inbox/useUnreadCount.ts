import { useSettled } from '@/lib/useSettled';
import { useInboxContext } from './inboxContext';
import { unreadCount } from './unreadCount';

/** The Inbox's unread notices as InboxProvider last read them, for the tab's badge. */
export function useUnreadCount() {
  const notices = useSettled(useInboxContext().answer)?.result?.notices;
  return unreadCount(notices ?? []);
}
