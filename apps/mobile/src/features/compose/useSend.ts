import { MacCallError, type SendResult } from '@mesa/core/phone';
import { randomUUID } from 'expo-crypto';
import { startTransition, useActionState, useOptimistic, useState } from 'react';
import { Alert } from 'react-native';
import { useMac } from '../mac/useMac';
import { draftOf } from './drafts';
import { type Photo, pickPhoto } from './pickPhoto';
import { useDraft } from './useDraft';

/** A reply this screen sent: shown at once while it travels, kept once the Mac typed it. */
export type Outgoing = { key: string; text: string; photo: boolean; sending: boolean };

/** What the last send came to: the Mac's answer, or why it failed. */
type Outcome = { result?: SendResult; error?: string };

type Sending = { text: string; photo?: Photo; yes: boolean };

/**
 * The composer's state for session `id`: its draft (kept per session), an attached photo, and
 * the replies sent from here. A send shows at once (useOptimistic) and settles with the Mac's
 * answer; one the guardrail stopped or that failed rolls back into the draft. `onSent` reads the
 * session again, for a reply now queued.
 */
export function useSend(id: string, onSent: () => void) {
  const link = useMac();
  const [draft, setDraft] = useDraft(id);
  const [photo, setPhoto] = useState<Photo>();
  const [sent, setSent] = useState<Outgoing[]>([]);
  const [shown, addShown] = useOptimistic(sent, (list, item: Outgoing) => [...list, item]);
  const [outcome, dispatch] = useActionState(
    async (_last: Outcome, input: Sending): Promise<Outcome> => {
      const item = { key: randomUUID(), text: input.text, photo: Boolean(input.photo) };
      addShown({ ...item, sending: true });
      const rollBack = () => {
        if (!draftOf(id)) setDraft(input.text);
        if (input.photo) setPhoto(input.photo);
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
        if (result.status === 'sent' || result.status === 'queued') onSent();
        else rollBack();
        return { result };
      } catch (error) {
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
  /** Sends the draft and the photo; `yes` past a guardrail ask (Send anyway). */
  const submit = (yes = false) => {
    const text = draft.trim();
    if (!text && !photo) return;
    setDraft('');
    setPhoto(undefined);
    startTransition(() => dispatch({ text, photo, yes }));
  };
  const attach = () =>
    pickPhoto().then(
      (picked) => picked && setPhoto(picked),
      (error: Error) => Alert.alert('Could not attach the photo', error.message),
    );
  return {
    draft,
    setDraft,
    photo,
    attach,
    clearPhoto: () => setPhoto(undefined),
    shown,
    outcome,
    submit,
  };
}
