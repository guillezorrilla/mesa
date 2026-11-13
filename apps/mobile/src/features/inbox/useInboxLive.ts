import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { useMacRead } from '../mac/useMacRead';

/** How often the Inbox is asked again while the app is in front. */
const EVERY_MS = 60_000;

/**
 * The Mac's Inbox as useMacRead reads it, held once above the tabs (InboxProvider) so the tab's
 * badge counts what the screen shows, asked again every minute in front.
 */
export function useInboxLive() {
  const read = useMacRead({ method: 'inbox' });
  useRepeatWhileActive(EVERY_MS, read.again);
  return read;
}
