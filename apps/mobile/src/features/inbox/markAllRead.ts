import { MacCallError, type PhoneNotice } from '@mesa/core/phone';
import type { MacLink } from '../mac/macLink';

/**
 * Marks every notice read on the Mac in one call (#1123). A Mac older than that call drops it
 * unanswered, so on a timeout each of `notices` still unread is marked as before, one call each.
 */
export async function markAllRead(
  call: MacLink['call'],
  notices: () => Promise<readonly PhoneNotice[]>,
) {
  try {
    await call({ method: 'noticesRead' });
  } catch (error) {
    if (!(error instanceof MacCallError) || error.reason !== 'timeout') throw error;
    const unread = (await notices()).filter((notice) => !notice.read);
    await Promise.all(unread.map((notice) => call({ method: 'noticeRead', id: notice.id })));
  }
}
