import type { NotificationResponse } from 'expo-notifications';

/**
 * The session a tapped push names: the Notification Service Extension copies the sealed notice's
 * `session` into the push's userInfo (#1016), which iOS gives as the push trigger's `payload`
 * (expo-notifications' `content.data` holds only userInfo's `body`). None for another tap.
 */
export function tappedSession(response: NotificationResponse): string | undefined {
  const { trigger } = response.notification.request;
  if (!trigger || !('type' in trigger) || trigger.type !== 'push') return undefined;
  const session = trigger.payload?.session;
  return typeof session === 'string' && /^[\w-]{1,64}$/.test(session) ? session : undefined;
}
