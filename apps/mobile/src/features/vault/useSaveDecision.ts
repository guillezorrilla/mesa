import type { PhoneSaved } from '@mesa/core/phone';
import { useActionState } from 'react';
import { type MacRead, tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import type { DecisionDraft } from './vaultText';

/** Saving a decision in the vault on the Mac, as `vault save decision` does, as an action. */
export function useSaveDecision() {
  const link = useMac();
  return useActionState(
    (_last: MacRead<PhoneSaved>, draft: DecisionDraft) =>
      tryCall(link, () => link.call({ method: 'decide', ...draft })),
    {},
  );
}
