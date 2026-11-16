import type { PendingPrompt } from '@mesa/core';
import { useCallback, useEffect, useState } from 'react';
import { useAct } from '@/lib/useAct';
import { useCall } from '@/lib/useCommand';

/** An answer the card gives: an option's id, or typed text. */
export type CardAnswer = { option: string } | { text: string };

/**
 * The prompt a waiting session asks, `streamed` by its chat's follow or else read once it shows,
 * and the answer to it: `pressed` names the option (or `text`) while its answer is on its way;
 * answered, the card closes at once; refused (stale, say), the failure is toasted and the prompt
 * read again (a streamed one stays as its stream says, to answer again).
 */
export function usePendingPrompt(session: string, streamed?: PendingPrompt) {
  const call = useCall();
  const { acting, act } = useAct();
  const [fetched, setFetched] = useState<PendingPrompt>();
  const [answered, setAnswered] = useState<string>();
  const [pressed, setPressed] = useState<string>();
  const refetch = useCallback(async () => {
    const result = await call('sessions.prompt', { id: session });
    // Not waiting after all (a state read late): nothing to show.
    setFetched(result.ok ? result.data : undefined);
  }, [call, session]);
  useEffect(() => {
    if (!streamed) void refetch();
  }, [refetch, streamed]);
  const asked = streamed ?? fetched;
  const prompt = asked?.status === 'pending' && asked.id === answered ? undefined : asked;
  const answer = (choice: CardAnswer) =>
    act(async () => {
      if (prompt?.status !== 'pending') return undefined;
      setPressed('option' in choice ? choice.option : 'text');
      const result = await call('sessions.answer', {
        id: session,
        prompt: prompt.id,
        ...choice,
      }).finally(() => setPressed(undefined));
      if (result.ok) {
        setAnswered(prompt.id);
        return undefined;
      }
      if (!streamed) await refetch();
      return { text: result.error.message, tone: 'alert' };
    });
  return { prompt, acting, pressed, answer };
}
