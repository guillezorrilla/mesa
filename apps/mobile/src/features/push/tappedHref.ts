import { openNotice, type SideKeys } from '@mesa/core/phone';
import type { NotificationResponse } from 'expo-notifications';

const SESSION_ID = /^[\w-]{1,64}$/;

/**
 * Where a tapped push opens: the session the Notification Service Extension copied into userInfo
 * (#1016), which iOS gives as the push trigger's `payload` (expo-notifications' `content.data`
 * holds only userInfo's `body`); or, for an automation run waiting for approval, Automations,
 * read from the sealed notice `n` itself, which the extension leaves in userInfo and does not
 * know to copy a run from (#1067). None for another tap.
 */
export function tappedHref(response: NotificationResponse, keys?: SideKeys) {
  const { trigger } = response.notification.request;
  if (!trigger || !('type' in trigger) || trigger.type !== 'push') return undefined;
  const { session, n } = trigger.payload ?? {};
  if (typeof session === 'string' && SESSION_ID.test(session)) return `/agents/${session}`;
  if (keys && typeof n === 'string' && openNotice(keys, n)?.run) return '/automations';
  return undefined;
}
