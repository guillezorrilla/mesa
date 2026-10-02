import { useCallback, useRef, useState } from 'react';
import { type Message, useToast } from '@/components/Toast';

/**
 * One action at a time: `acting` while one runs, a second press meanwhile ignored (so a double
 * click opens one session, not two), and the message it returns toasted, in its tone, when it
 * ends.
 */
export function useAct() {
  const toast = useToast();
  const [acting, setActing] = useState(false);
  const running = useRef(false);
  const act = useCallback(
    async (action: () => Promise<Message | undefined>) => {
      if (running.current) return;
      running.current = true;
      setActing(true);
      try {
        const message = await action();
        if (message) toast(message.text, message.tone);
      } finally {
        running.current = false;
        setActing(false);
      }
    },
    [toast],
  );
  return { acting, act };
}
