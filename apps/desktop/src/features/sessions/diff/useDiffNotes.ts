import type { GuardrailCheck, ListedNote } from '@mesa/core';
import { counted, inNextSend, notesRecipients, sessionLabel } from '@mesa/core/browser';
import { useCallback, useMemo, useState } from 'react';
import { type Message, said } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useCall, useCommand } from '@/lib/useCommand';
import { guardrailOf } from '../dialogs/GuardrailDialog';
import { reviewOutcome } from '../review/reviewOutcome';

/** Where Send notes sends: the open file's only (`path`), and to whom (`to`: none is its own). */
export type NotesSend = { path?: string; to?: string };

/**
 * A session's review notes on its Session diff (the `branch` scope), with what changes them, and
 * the send of its unsent ones as one prompt to it, another session, or a new one (`recipients`):
 * a guardrail ask waits in `ask` for a person's yes.
 */
export function useDiffNotes(sessionId: string) {
  const read = useCommand('review.notes', { id: sessionId });
  const sessions = useCommand('sessions.list');
  const call = useCall();
  const { act, acting } = useAct();
  const [ask, setAsk] = useState<{ check: GuardrailCheck; send: NotesSend }>();
  const recipients = useMemo(
    () => notesRecipients(sessions.data ?? [], sessionId),
    [sessions.data, sessionId],
  );
  /** A session's name, as the board shows it, else its id. */
  const nameOf = useCallback(
    (id: string) => {
      const row = sessions.data?.find((r) => r.id === id);
      return row ? sessionLabel(row) : id;
    },
    [sessions.data],
  );
  const notes = useMemo(
    () => (read.data ?? []).filter((note) => note.scope === 'branch'),
    [read.data],
  );
  /** How many notes the next send holds, or `path`'s: unsent ones not stale, and sent ones still open. */
  const toSend = (path?: string) =>
    notes.filter((n) => inNextSend(n) && (!path || n.path === path)).length;

  /** Runs a change, reads the notes again, and says whether it went through. */
  const { refresh } = read;
  const change = useCallback(
    async (run: () => ReturnType<typeof call>) => {
      let ok = false;
      await act(async (): Promise<Message | undefined> => {
        const result = await run();
        await refresh();
        ok = result.ok;
        return result.ok ? undefined : { text: result.error.message, tone: 'alert' };
      });
      return ok;
    },
    [act, refresh],
  );
  // Stable, so the diff's line slots (useLineNotes) stay as they are while nothing changes.
  const add = useCallback(
    (path: string, line: number, end: number, text: string) =>
      change(() =>
        call('review.notesAdd', { id: sessionId, path, line, ...(line ? { end } : {}), text }),
      ),
    [change, call, sessionId],
  );
  const edit = useCallback(
    (note: ListedNote, text: string) =>
      change(() => call('review.notesEdit', { id: sessionId, note: note.id, text })),
    [change, call, sessionId],
  );
  const remove = useCallback(
    (note: ListedNote) =>
      change(() => call('review.notesRemove', { id: sessionId, note: note.id })),
    [change, call, sessionId],
  );
  const send = (to: NotesSend = {}, yes = false) =>
    act(async (): Promise<Message | undefined> => {
      const result = await call('review.notesSend', { id: sessionId, ...to, yes });
      if (!result.ok) {
        const check = guardrailOf(result.error);
        if (check?.verdict === 'ask' && !yes) {
          setAsk({ check, send: to });
          return undefined;
        }
        setAsk(undefined);
        return { text: result.error.message, tone: 'alert' };
      }
      setAsk(undefined);
      await refresh();
      const { sent, stale, delivery } = result.data;
      const left = stale.length ? `; ${counted(stale.length, 'note')} stale, left out` : '';
      if (!sent.length && !delivery)
        return { text: `No notes to send${left}`, tone: 'confirmation' };
      if (!delivery) {
        // A new session has them as its goal: the board lists it on its next look.
        void sessions.refresh();
        return said(
          `Started ${result.data.to} with ${counted(sent.length, 'note')}${left}`,
          result.data,
        );
      }
      if (sent.length)
        return said(
          `${delivery.already ? 'Already sent' : 'Sent'} ${counted(sent.length, 'note')} to ${nameOf(result.data.to)}${left}`,
          delivery,
        );
      return reviewOutcome(delivery, 'Notes').message;
    });

  const resolve = useCallback(
    (note: ListedNote) =>
      change(() => call('review.notesResolve', { id: sessionId, note: note.id })),
    [change, call, sessionId],
  );
  const clearSent = useCallback(
    () => change(() => call('review.notesClear', { id: sessionId })),
    [change, call, sessionId],
  );

  return {
    notes,
    refresh: () => Promise.all([refresh(), sessions.refresh()]),
    recipients,
    nameOf,
    toSend,
    acting,
    add,
    edit,
    remove,
    resolve,
    clearSent,
    send,
    ask,
    cancelAsk: () => setAsk(undefined),
  };
}

export type DiffNotes = ReturnType<typeof useDiffNotes>;
