import type { CallResult, PhoneNotice } from '@mesa/core/phone';
import { router } from 'expo-router';
import { useOnFocus } from '@/lib/useOnFocus';
import type { MacRead } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { useInboxContext } from './inboxContext';
import { markAllRead } from './markAllRead';
import { noticeHref } from './noticeHref';

/**
 * The Mac's Inbox as InboxProvider reads it, asked again on focus, marking a notice or every one
 * read (then reading the Inbox again), and opening one: marked read, then its screen.
 */
export function useInbox() {
  const link = useMac();
  const read = useInboxContext();
  useOnFocus(read.again);
  const markRead = (notice: PhoneNotice) =>
    link.call({ method: 'noticeRead', id: notice.id }).then(read.again, () => undefined);
  const readNotices = async () => {
    const answer: MacRead<CallResult<'inbox'>> = await read.answer;
    return answer.result?.notices ?? [];
  };
  const markAll = () => markAllRead(link.call, readNotices).then(read.again, () => undefined);
  const open = (notice: PhoneNotice) => {
    if (!notice.read) markRead(notice);
    const href = noticeHref(notice);
    if (href) router.push(href);
  };
  return { ...read, open, markRead, markAll };
}
