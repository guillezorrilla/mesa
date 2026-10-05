import type { SessionImage } from '@mesa/core';
import { type RefObject, useEffect, useState } from 'react';
import { type Message, warningOf } from '@/components/Toast';
import { usePlatform } from '@/lib/MesaRoot';
import { useCall } from '@/lib/useCommand';
import { guardrailOf } from '../dialogs/GuardrailDialog';
import type { OpenDialog } from '../dialogs/SessionDialogs';
import type { SessionAct } from '../useSessionAct';

/**
 * The selected session's prompt: the image picked to send with it, kept only while its session
 * stays selected, and the Send that delivers either.
 */
export function useSessionPrompt({
  act,
  selectedSession,
  selectionVersion,
  openDialog,
  closeDialog,
}: {
  act: SessionAct;
  selectedSession?: string;
  selectionVersion: RefObject<number>;
  openDialog: (dialog: OpenDialog) => void;
  closeDialog: () => void;
}) {
  const call = useCall();
  const platform = usePlatform();
  const [image, setImage] = useState<SessionImage>();
  useEffect(() => {
    setImage((current) => (current?.session === selectedSession ? current : undefined));
  }, [selectedSession]);
  /**
   * Sends a prompt. The guardrail's ask opens its dialog, whose Send anyway sends it again with
   * `yes`; its block is said in the toast, with no way past it here (--force is the CLI's).
   */
  const send = (
    id: string,
    prompt: string,
    form: HTMLFormElement,
    yes = false,
    attachment?: SessionImage,
  ) =>
    act(async (): Promise<Message | undefined> => {
      const sent = attachment
        ? await call('image.send', { image: attachment, note: prompt, yes })
        : await call('sessions.send', { id, prompt, yes });
      if (sent.ok) {
        form.reset();
        if (attachment) setImage(undefined);
        closeDialog();
        // Typed either way: a warning says so, so the prompt is not sent twice.
        return warningOf(sent.data);
      }
      const { error } = sent;
      const check = guardrailOf(error);
      if (check?.verdict === 'ask' && !yes) {
        openDialog({ kind: 'guardrail', id, prompt, form, check, image: attachment });
        return undefined;
      }
      closeDialog();
      return { text: check ? `Not sent to ${id}: ${check.reason}` : error.message, tone: 'alert' };
    });
  const pickImage = (id: string) =>
    act(async (): Promise<Message | undefined> => {
      const version = selectionVersion.current;
      const path = await platform.pickFile();
      if (!path || version !== selectionVersion.current) return undefined;
      const preview = await call('image.preview', { id, path });
      if (version !== selectionVersion.current) return undefined;
      if (!preview.ok) return { text: preview.error.message, tone: 'alert' };
      setImage(preview.data);
      return undefined;
    });
  return { image, clearImage: () => setImage(undefined), send, pickImage };
}

/** What `useSessionPrompt` returns. */
export type SessionPrompt = ReturnType<typeof useSessionPrompt>;
