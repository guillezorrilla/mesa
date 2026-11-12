import type { PhonePrompt } from '@mesa/core/phone';
import { startTransition, useActionState, useState } from 'react';
import type { MacLink } from '../mac/macLink';
import { useMac } from '../mac/useMac';
import { type AnswerOutcome, answerErrorText } from './promptText';

/** An answer the card gives: one of the prompt's options, or typed text. */
export type Choice = { option: string } | { text: string };

// ponytail: a read that fails (the Mac asleep, or the session no longer waiting) shows no card;
// the session screen already says when the Mac does not answer.
const read = (link: MacLink, id: string): Promise<PhonePrompt | undefined> =>
  link.call({ method: 'prompt', id }).catch(() => undefined);

/**
 * Session `id`'s pending prompt as a promise to `use()`, and the answer to it as a form action:
 * answered, the card says so; stale, it says the prompt moved on and reads the one waiting now.
 */
export function usePrompt(id: string) {
  const link = useMac();
  const [prompt, setPrompt] = useState(() => read(link, id));
  const [outcome, act, answering] = useActionState(
    async (_last: AnswerOutcome | undefined, choice: Choice) => {
      const asked = await prompt;
      if (asked?.status !== 'pending') return undefined;
      try {
        const { status } = await link.call({ method: 'answer', id, prompt: asked.id, ...choice });
        if (status === 'stale') {
          setPrompt(read(link, id));
          return { stale: true } as const;
        }
        const label =
          'text' in choice ? choice.text : asked.options.find((o) => o.id === choice.option)?.label;
        return { answered: label ?? '' };
      } catch (error) {
        return { error: answerErrorText(error) };
      }
    },
    undefined,
  );
  const answer = (choice: Choice) => startTransition(() => act(choice));
  return { prompt, outcome, answering, answer };
}
