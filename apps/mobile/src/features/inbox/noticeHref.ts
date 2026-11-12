import type { PhoneNotice } from '@mesa/core/phone';

/**
 * Where a notice opens on the phone: its decision gate, its session, or Automations for a run
 * waiting for approval or a failed one; none for a notice the phone has no screen for (Doctor,
 * a release).
 */
export function noticeHref(notice: PhoneNotice) {
  if (notice.gate) return `/agents/gates/${notice.gate}`;
  if (notice.session) return `/agents/${notice.session.id}`;
  if (notice.automations) return '/automations';
  return undefined;
}
