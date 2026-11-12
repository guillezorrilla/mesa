import { startTransition, useActionState, useOptimistic, useState } from 'react';
import { useMac } from '../mac/useMac';
import { answerErrorText, type LastAnswer } from './promptText';

/** An answer the card gives: an option or typed text, for the prompt with this id. */
export type Choice = ({ option: string } | { text: string }) & { prompt: string; label: string };

/**
 * Answers session `id`'s prompts as a form action, its label shown at once while it goes, and
 * keeps the last answer across prompts; a stale one bumps `round`, so the prompt is read again.
 */
export function useAnswer(id: string, since: string) {
  const link = useMac();
  const [round, setRound] = useState(0);
  const [sending, setSending] = useOptimistic<string | undefined>(undefined);
  const [last, act, answering] = useActionState(
    async (_last: LastAnswer | undefined, { label, ...choice }: Choice): Promise<LastAnswer> => {
      setSending(label);
      const at = since;
      try {
        const { status } = await link.call({ method: 'answer', id, ...choice });
        if (status === 'answered') return { outcome: { kind: 'answered', label }, at };
        // After an await the action's transition is gone: start one, so the card stays shown.
        startTransition(() => setRound((r) => r + 1));
        return { outcome: { kind: 'stale' }, at };
      } catch (error) {
        return { outcome: { kind: 'failed', text: answerErrorText(error) }, at };
      }
    },
    undefined,
  );
  const answer = (choice: Choice) => startTransition(() => act(choice));
  const busy = answering ? `Sending ${sending ?? 'your answer'}...` : undefined;
  return { last, round, busy, answer };
}
