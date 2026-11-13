import type { NotificationResponse } from 'expo-notifications';

const ID = /^[\w-]{1,64}$/;
const valid = (value: unknown) => (typeof value === 'string' && ID.test(value) ? value : undefined);

/**
 * The session a tapped push names, and the pairing of the Mac that sent it: the Notification
 * Service Extension copies the sealed notice's `session`, and the pairing that opened it as
 * `mac`, into the push's userInfo (#1016, #1069), which iOS gives as the push trigger's `payload`
 * (expo-notifications' `content.data` holds only userInfo's `body`). None for another tap.
 */
export function tappedSession(
  response: NotificationResponse,
): { session: string; mac?: string } | undefined {
  const { trigger } = response.notification.request;
  if (!trigger || !('type' in trigger) || trigger.type !== 'push') return undefined;
  const session = valid(trigger.payload?.session);
  const mac = valid(trigger.payload?.mac);
  if (!session) return undefined;
  return mac ? { session, mac } : { session };
}
