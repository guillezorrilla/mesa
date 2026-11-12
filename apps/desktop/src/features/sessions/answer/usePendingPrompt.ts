import type { PendingPrompt } from '@mesa/core';
import { useCallback, useEffect, useState } from 'react';
import { useAct } from '@/lib/useAct';
import { useCall } from '@/lib/useCommand';

/** An answer the card gives: an option's id, or typed text. */
export type CardAnswer = { option: string } | { text: string };

/**
 * The prompt a waiting session asks, read once it shows, and the answer to it: answered, the
 * card closes; refused (stale, say), the failure is toasted and the prompt read again.
 */
export function usePendingPrompt(session: string) {
  const call = useCall();
  const { acting, act } = useAct();
  const [prompt, setPrompt] = useState<PendingPrompt>();
  const read = useCallback(async () => {
    const result = await call('sessions.prompt', { id: session });
    // Not waiting after all (a state read late): nothing to show.
    setPrompt(result.ok ? result.data : undefined);
  }, [call, session]);
  useEffect(() => {
    void read();
  }, [read]);
  const answer = (choice: CardAnswer) =>
    act(async () => {
      if (prompt?.status !== 'pending') return undefined;
      const result = await call('sessions.answer', { id: session, prompt: prompt.id, ...choice });
      if (result.ok) {
        setPrompt(undefined);
        return undefined;
      }
      await read();
      return { text: result.error.message, tone: 'alert' };
    });
  return { prompt, acting, answer };
}
