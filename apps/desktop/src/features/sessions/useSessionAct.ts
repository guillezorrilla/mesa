import type { Message } from '@/components/Toast';
import { useAct } from '@/lib/useAct';

/** An action Sessions runs: it returns the message to toast, if any. */
export type SessionAct = (action: () => Promise<Message | undefined>) => Promise<void>;

/**
 * Sessions' one action at a time: `once` runs it as is, and `act` looks again when it ends, so
 * Sessions shows what it did.
 */
export function useSessionAct(look: () => Promise<void>) {
  // Every action looks again when it ends, so Sessions shows what it did.
  const { acting, act: once } = useAct();
  const act: SessionAct = (action) =>
    once(async () => {
      try {
        return await action();
      } finally {
        await look();
      }
    });
  return { acting, act, once };
}
