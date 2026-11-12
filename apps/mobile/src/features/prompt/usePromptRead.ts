import type { PhonePrompt } from '@mesa/core/phone';
import { useState } from 'react';
import { useMac } from '../mac/useMac';

/**
 * Session `id`'s pending prompt as a promise to `use()`, read once.
 * ponytail: a read that fails (the Mac asleep, or the session no longer waiting) shows no card;
 * the session screen already says when the Mac does not answer.
 */
export function usePromptRead(id: string) {
  const link = useMac();
  const [read] = useState(
    (): Promise<PhonePrompt | undefined> =>
      link.call({ method: 'prompt', id }).catch(() => undefined),
  );
  return read;
}
