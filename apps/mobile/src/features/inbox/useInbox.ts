import type { PhoneNotice } from '@mesa/core/phone';
import { router } from 'expo-router';
import { useLiveRead } from '../mac/useLiveRead';
import { useMac } from '../mac/useMac';
import { noticeHref } from './noticeHref';

/** The Mac's Inbox as useLiveRead reads it, and opening a notice: marked read, then its screen. */
export function useInbox() {
  const link = useMac();
  const read = useLiveRead({ method: 'inbox' });
  const open = (notice: PhoneNotice) => {
    if (!notice.read)
      link.call({ method: 'noticeRead', id: notice.id }).then(read.again, () => undefined);
    const href = noticeHref(notice);
    if (href) router.push(href);
  };
  return { ...read, open };
}
