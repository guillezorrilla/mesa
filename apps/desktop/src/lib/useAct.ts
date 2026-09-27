import { useCallback, useRef, useState } from 'react';
import { type Message, useToast } from '../components/Toast';

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

/**
 * A confirmation; with the warning a recorded command's data carries (no receipt, a skill not
 * synced) after it, an alert, which stays, so a gap in the audit trail never goes unseen.
 */
export const said = (message: string, data?: { warning?: string }): Message =>
  data?.warning
    ? { text: `${message}; ${data.warning}`, tone: 'alert' }
    : { text: message, tone: 'confirmation' };

/** A command's own warning, if it has one, as an alert. */
export const warned = (warning: string | undefined): Message | undefined =>
  warning ? { text: warning, tone: 'alert' } : undefined;
