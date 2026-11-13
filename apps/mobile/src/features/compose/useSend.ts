import { MacCallError, type SendResult } from '@mesa/core/phone';
import { randomUUID } from 'expo-crypto';
import { startTransition, useActionState, useOptimistic, useState } from 'react';
import { haptic } from '@/lib/haptics';
import { useMac } from '../mac/useMac';
import { draftOf } from './drafts';
import type { Photo } from './pickPhoto';
import { useDraft } from './useDraft';

/** A reply this screen sent: shown at once while it travels, kept once the Mac typed it. */
export type Outgoing = { key: string; text: string; photo: boolean; sending: boolean };

/** What the last send came to: the Mac's answer, or why it failed. */
type Outcome = { result?: SendResult; error?: string };

type Sending = { text: string; photo?: Photo; yes: boolean };

/**
 * Sending session `id`'s draft: a send shows at once (useOptimistic) and settles with the Mac's
 * answer; one the guardrail stopped or that failed rolls back into the draft, its photo back
 * through `restorePhoto`. `onSent` reads the session again, for a reply now queued.
 */
export function useSend(
  id: string,
  { onSent, restorePhoto }: { onSent: () => void; restorePhoto: (photo: Photo) => void },
) {
  const link = useMac();
  const [draft, setDraft] = useDraft(id);
  const [sent, setSent] = useState<Outgoing[]>([]);
  const [shown, addShown] = useOptimistic(sent, (list, item: Outgoing) => [...list, item]);
  const [outcome, dispatch] = useActionState(
    async (_last: Outcome, input: Sending): Promise<Outcome> => {
      const item = { key: randomUUID(), text: input.text, photo: Boolean(input.photo) };
      addShown({ ...item, sending: true });
      const rollBack = () => {
        if (!draftOf(id)) setDraft(input.text);
        if (input.photo) restorePhoto(input.photo);
      };
      try {
        const result = await link.call({
          method: 'send',
          id,
          text: input.text,
          yes: input.yes,
          ...(input.photo ? { image: input.photo.base64 } : {}),
        });
        // After an await, a state update joins the action's transition only inside startTransition.
        if (result.status === 'sent')
          startTransition(() => setSent((list) => [...list, { ...item, sending: false }]));
        if (result.status === 'sent' || result.status === 'queued') {
          haptic('success');
          onSent();
        } else {
          haptic('warning');
          rollBack();
        }
        return { result };
      } catch (error) {
        haptic('error');
        rollBack();
        // A Mac that answered nothing may still have typed it; the person checks before sending again.
        const unsure = error instanceof MacCallError && error.reason !== 'failed';
        return {
          error: unsure
            ? 'Your Mac did not answer, so this may not have been sent. Check the session before sending again.'
            : (error as Error).message,
        };
      }
    },
    {},
  );
  /** Sends the draft with `photo`; `yes` past a guardrail ask (Send anyway). */
  const submit = (photo: Photo | undefined, yes = false) => {
    const text = draft.trim();
    if (!text && !photo) return;
    setDraft('');
    startTransition(() => dispatch({ text, photo, yes }));
  };
  return { draft, setDraft, shown, outcome, submit };
}
