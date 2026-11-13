import type { PhoneNotice } from '@mesa/core/phone';

/** How many of the notices are unread. */
export const unreadCount = (notices: readonly PhoneNotice[]) =>
  notices.filter((notice) => !notice.read).length;
