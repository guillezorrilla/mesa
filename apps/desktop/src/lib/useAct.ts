import { useCallback, useRef, useState } from 'react';
import { useToast } from '../components/Toast';

/**
 * One action at a time: `acting` while one runs, a second press meanwhile ignored (so a double
 * click opens one session, not two), and the message it returns toasted when it ends.
 */
export function useAct() {
  const toast = useToast();
  const [acting, setActing] = useState(false);
  const running = useRef(false);
  const act = useCallback(
    async (action: () => Promise<string | undefined>) => {
      if (running.current) return;
      running.current = true;
      setActing(true);
      try {
        const message = await action();
        if (message) toast(message);
      } finally {
        running.current = false;
        setActing(false);
      }
    },
    [toast],
  );
  return { acting, act };
}

/**
 * A confirmation, with the warning a recorded command's data carries (no receipt, a skill not
 * synced) after it, so a gap in the audit trail never goes unseen.
 */
export const said = (message: string, data?: { warning?: string }) =>
  data?.warning ? `${message}; ${data.warning}` : message;
