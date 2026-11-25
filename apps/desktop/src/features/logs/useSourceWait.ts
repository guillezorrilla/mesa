import { useEffect, useRef, useState } from 'react';
import { useCall } from '@/lib/useCommand';
import { LOGS_POLL_MS } from './useLogWatch';

/**
 * Waits for `source` to be among `project`'s log sources, looking every 2 s, and hands it to
 * `onFound` once it appears. One that was already there at the first look is `already`: offered,
 * not picked by itself, so a guide opened again does not vanish at once.
 */
export function useSourceWait(
  project: string,
  source: string | undefined,
  onFound: (source: string) => void,
) {
  const call = useCall();
  // The panel renders on every read; the latest callback, without restarting the wait.
  const found = useRef(onFound);
  found.current = onFound;
  const [already, setAlready] = useState(false);
  useEffect(() => {
    setAlready(false);
    if (!source) return;
    /** Whether the source was there at the first look; undefined until a look answers. */
    let before: boolean | undefined;
    const look = () =>
      void call('logs.sources', { project }).then((listed) => {
        if (!listed.ok) return;
        const there = listed.data.sources.some((each) => each.id === source);
        if (before === undefined) {
          before = there;
          setAlready(there);
        } else if (there && !before) found.current(source);
      });
    look();
    const timer = window.setInterval(look, LOGS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [call, source, project]);
  return already;
}
