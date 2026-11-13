import { REWATCH_MS } from '@mesa/core/phone';
import { useEffect, useState } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { askWatch } from '../mac/askWatch';
import { useMac } from '../mac/useMac';

/**
 * Subscribes to session `id` while its screen is open (#1128), asked again every REWATCH_MS so it
 * never lapses, and ended when the screen closes. True while the Mac pushes the session's changes;
 * false until it answers, and on an older Mac, which answers no watch, so the screen polls instead.
 */
export function useSessionWatch(id: string, replies: number) {
  const link = useMac();
  const [pushed, setPushed] = useState(false);
  useEffect(() => {
    void askWatch(link, id, replies).then(setPushed);
    return () => void link.call({ method: 'unwatch', id }).catch(() => undefined);
  }, [link, id, replies]);
  useRepeatWhileActive(REWATCH_MS, () => void askWatch(link, id, replies).then(setPushed));
  return pushed;
}
