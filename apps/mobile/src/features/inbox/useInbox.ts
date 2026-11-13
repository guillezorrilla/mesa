import type { PhoneNotice } from '@mesa/core/phone';
import { router } from 'expo-router';
import { useLiveRead } from '../mac/useLiveRead';
import { useMac } from '../mac/useMac';
import { noticeHref } from './noticeHref';

/**
 * The Mac's Inbox as useLiveRead reads it, marking a notice read (then reading the Inbox again),
 * and opening one: marked read, then its screen.
 */
export function useInbox() {
  const link = useMac();
  const read = useLiveRead({ method: 'inbox' });
  const markRead = (notice: PhoneNotice) =>
    link.call({ method: 'noticeRead', id: notice.id }).then(read.again, () => undefined);
  const open = (notice: PhoneNotice) => {
    if (!notice.read) markRead(notice);
    const href = noticeHref(notice);
    if (href) router.push(href);
  };
  return { ...read, open, markRead };
}
