import { REWATCH_MS } from '@mesa/core/phone';
import { useEffect } from 'react';
import { useRepeatWhileActive } from '@/lib/useRepeatWhileActive';
import { askWatch } from '../mac/askWatch';
import { useMac } from '../mac/useMac';

/**
 * Asks the Mac for what session `id`'s window prints (the watch's `stream`) while its output
 * terminal is shown, asked again every REWATCH_MS so it never lapses, and stopped when it closes;
 * the session screen's own watch (useSessionWatch) is kept either way.
 */
export function useStreamWatch(id: string) {
  const link = useMac();
  useEffect(() => {
    void askWatch(link, id, undefined, true);
    return () => void askWatch(link, id, undefined, false);
  }, [link, id]);
  useRepeatWhileActive(REWATCH_MS, () => void askWatch(link, id, undefined, true));
}
