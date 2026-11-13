import type { PhoneNotice } from '@mesa/core/phone';

/**
 * Where a notice opens on the phone: its decision gate or its session; none for a notice the
 * phone has no screen for (Doctor, a failed automation run, a release), which stays on the Mac.
 */
export function noticeHref(notice: PhoneNotice) {
  if (notice.gate) return `/agents/gates/${notice.gate}`;
  if (notice.session) return `/agents/${notice.session.id}`;
  return undefined;
}
