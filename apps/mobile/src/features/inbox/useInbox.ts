import type { PhoneNotice } from '@mesa/core/phone';
import { router } from 'expo-router';
import { useOnFocus } from '@/lib/useOnFocus';
import { useMac } from '../mac/useMac';
import { useInboxContext } from './inboxContext';
import { noticeHref } from './noticeHref';

/**
 * The Mac's Inbox as InboxProvider reads it, asked again on focus, marking a notice read (then
 * reading the Inbox again), and opening one: marked read, then its screen.
 */
export function useInbox() {
  const link = useMac();
  const read = useInboxContext();
  useOnFocus(read.again);
  const markRead = (notice: PhoneNotice) =>
    link.call({ method: 'noticeRead', id: notice.id }).then(read.again, () => undefined);
  const open = (notice: PhoneNotice) => {
    if (!notice.read) markRead(notice);
    const href = noticeHref(notice);
    if (href) router.push(href);
  };
  return { ...read, open, markRead };
}
