import { useState } from 'react';
import { useMac } from '../mac/useMac';

/**
 * Step `step` of session `id`, its whole text (a tool's output, an edit's hunk, a thought) as a
 * promise to `use()`, asked once when its row opens; a failed ask reads as its error.
 */
export function useStepRead(id: string, step: string) {
  const link = useMac();
  const [read] = useState(
    (): Promise<{ text: string } | { error: string }> =>
      link.call({ method: 'step', id, step }).catch((error: Error) => ({ error: error.message })),
  );
  return read;
}
