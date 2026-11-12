import type { PhoneSaved } from '@mesa/core/phone';
import { useActionState } from 'react';
import { useMac } from '../mac/useMac';
import type { DecisionDraft } from './vaultText';

export type Saving = { saved?: PhoneSaved; error?: string };

/** Saving a decision in the vault on the Mac, as `vault save decision` does, as an action. */
export function useSaveDecision() {
  const link = useMac();
  return useActionState(
    (_last: Saving, draft: DecisionDraft): Promise<Saving> =>
      link.call({ method: 'decide', ...draft }).then(
        (saved) => ({ saved }),
        (error: Error) => ({ error: error.message }),
      ),
    {},
  );
}
