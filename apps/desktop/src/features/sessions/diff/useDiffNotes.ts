import type { GuardrailCheck, ListedNote } from '@mesa/core';
import { useState } from 'react';
import { type Message, said } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useCall, useCommand } from '@/lib/useCommand';
import { guardrailOf } from '../dialogs/GuardrailDialog';
import { reviewOutcome } from '../review/reviewOutcome';

const counted = (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`;

/**
 * A session's review notes on its Session diff (the `branch` scope), with what changes them, and
 * the send of its unsent ones as one prompt: a guardrail ask waits in `ask` for a person's yes.
 */
export function useDiffNotes(sessionId: string) {
  const read = useCommand('review.notes', { id: sessionId });
  const call = useCall();
  const { act, acting } = useAct();
  const [ask, setAsk] = useState<{ check: GuardrailCheck; path?: string }>();
  const notes = (read.data ?? []).filter((note) => note.scope === 'branch');
  const unsent = (path?: string) =>
    notes.filter((n) => !n.sentAt && !n.stale && (!path || n.path === path)).length;

  /** Runs a change, reads the notes again, and says whether it went through. */
  const change = async (run: () => ReturnType<typeof call>) => {
    let ok = false;
    await act(async (): Promise<Message | undefined> => {
      const result = await run();
      await read.refresh();
      ok = result.ok;
      return result.ok ? undefined : { text: result.error.message, tone: 'alert' };
    });
    return ok;
  };
  const send = (path?: string, yes = false) =>
    act(async (): Promise<Message | undefined> => {
      const result = await call('review.notesSend', {
        id: sessionId,
        ...(path ? { path } : {}),
        yes,
      });
      if (!result.ok) {
        const check = guardrailOf(result.error);
        if (check?.verdict === 'ask' && !yes) {
          setAsk({ check, ...(path ? { path } : {}) });
          return undefined;
        }
        setAsk(undefined);
        return { text: result.error.message, tone: 'alert' };
      }
      setAsk(undefined);
      await read.refresh();
      const { sent, stale, delivery } = result.data;
      const left = stale.length ? `; ${counted(stale.length)} stale, left out` : '';
      if (!delivery) return { text: `No unsent notes to send${left}`, tone: 'confirmation' };
      if (sent.length)
        return said(
          `${delivery.already ? 'Already sent' : 'Sent'} ${counted(sent.length)} to ${sessionId}${left}`,
          delivery,
        );
      return reviewOutcome(delivery, 'Notes').message;
    });

  return {
    notes,
    unsent,
    acting,
    add: (path: string, line: number, end: number, text: string) =>
      change(() =>
        call('review.notesAdd', {
          id: sessionId,
          path,
          line,
          ...(line ? { end } : {}),
          text,
        }),
      ),
    edit: (note: ListedNote, text: string) =>
      change(() => call('review.notesEdit', { id: sessionId, note: note.id, text })),
    remove: (note: ListedNote) =>
      change(() => call('review.notesRemove', { id: sessionId, note: note.id })),
    send,
    ask,
    cancelAsk: () => setAsk(undefined),
  };
}

export type DiffNotes = ReturnType<typeof useDiffNotes>;
