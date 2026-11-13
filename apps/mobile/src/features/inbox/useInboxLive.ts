import { use, useEffect, useEffectEvent } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { MacContext } from '../mac/macContext';
import { useMacRead } from '../mac/useMacRead';
import { mayNotify } from './mayNotify';

/** How often the Inbox is asked again while the app is in front. */
const EVERY_MS = 60_000;

/**
 * The Mac's Inbox as useMacRead reads it, held once above the tabs (InboxProvider) so the tab's
 * badge counts what the screen shows: asked again when the Mac pushes an update that may come
 * with a notice (mayNotify), and every minute in front.
 */
export function useInboxLive() {
  const link = use(MacContext);
  const read = useMacRead({ method: 'inbox' });
  const onUpdate = useEffectEvent(read.again);
  useEffect(
    () =>
      link?.onUpdate((update) => {
        if (mayNotify(update)) onUpdate();
      }),
    [link],
  );
  useRepeatWhileActive(EVERY_MS, read.again);
  return read;
}
