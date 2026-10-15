import type { Agent, ManagedRow, SessionRow } from '@mesa/core';
import { exited, GENERAL_PROJECT, sessionTitle } from '@mesa/core/browser';
import { Undo2 } from 'lucide-react';
import type { RefObject } from 'react';
import { type Message, said, type ToastLink, useToast, warningOf } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';
import type { NewSessionInput } from './SessionStart';
import type { SessionAct } from './useSessionAct';

/**
 * The commands Sessions runs on its sessions, each saying in a toast what it did. A command a
 * dialog confirmed closes it once it succeeds.
 */
export function useSessionCommands({
  act,
  once,
  look,
  closeDialog,
  rows,
  selectedSession,
  selectionVersion,
  onSelectSession,
  onSessions,
}: {
  act: SessionAct;
  once: SessionAct;
  look: () => Promise<void>;
  closeDialog: () => void;
  /** The sessions it acts on as listed: the board's, or the Archived section's. */
  rows?: readonly SessionRow[];
  selectedSession?: string;
  selectionVersion: RefObject<number>;
  onSelectSession?: (id: string) => void;
  onSessions?: () => void;
}) {
  const run = useRun();
  const toast = useToast();
  const openTerminal = (id: string) =>
    act(async () => {
      const attached = await run('sessions.attach', { id });
      return attached && said(`Opened ${attached.target} in ${attached.app}`);
    });
  const stop = (id: string) =>
    act(async () => {
      const stopped = await run('sessions.stop', { id });
      if (!stopped) return undefined;
      if (stopped.outcome === 'already-ended') return said(`Session ${id} had already ended`);
      return warningOf(stopped);
    });
  const resume = (id: string) =>
    once(async () => {
      const version = selectionVersion.current;
      const resumed = await run('sessions.resume', { id });
      await look();
      // Its successor is shown only while it is still the session selected.
      if (resumed && selectedSession === id && version === selectionVersion.current)
        onSelectSession?.(resumed.id);
      return resumed && warningOf(resumed);
    });
  const forceStart = (id: string) =>
    act(async () => {
      const started = await run('sessions.forceStart', { id });
      return started && warningOf(started);
    });
  const adopt = (agentSessionId: string, project?: string) =>
    act(async () => {
      const adopted = await run('sessions.adopt', { agentSessionId, project });
      return adopted && warningOf(adopted);
    });
  const handoff = (id: string, note: string, keep: boolean, agent?: string) =>
    act(async () => {
      const done = await run('sessions.handoff', { id, note, keep, agent });
      if (!done) return undefined;
      closeDialog();
      return warningOf(done);
    });
  const swap = (id: string, agent: Agent) =>
    act(async () => {
      const swapped = await run('sessions.swap', { id, agent });
      if (!swapped) return undefined;
      return warningOf(swapped);
    });
  const fork = (id: string, branch?: string) =>
    act(async () => {
      const created = await run('sessions.fork', { id, branch });
      if (!created) return undefined;
      closeDialog();
      onSelectSession?.(created.id);
      return warningOf(created);
    });
  const saveDependency = (id: string, change: { parent?: string | null; after?: string }) =>
    act(async () => {
      const changed = await run('sessions.dependencies', { id, ...change });
      if (!changed) return undefined;
      closeDialog();
      return warningOf(changed);
    });
  const rename = (id: string, name: string) =>
    act(async () => {
      const renamed = await run('sessions.rename', { id, name });
      if (!renamed) return undefined;
      closeDialog();
      return warningOf(renamed);
    });
  const remove = (id: string, opts: { deleteWorktree: boolean; deleteBranch: boolean }) =>
    act(async () => {
      const removed = await run('sessions.remove', { id, ...opts });
      if (!removed) return undefined;
      closeDialog();
      if (selectedSession === id) leaveClosedSession([id]);
      return warningOf(removed);
    });
  const cascade = (
    kind: 'stop' | 'remove',
    id: string,
    expected: string[],
    options: { deleteWorktree: boolean; deleteBranch: boolean },
  ) =>
    act(async () => {
      const result =
        kind === 'stop'
          ? await run('sessions.stopDescendants', { id, expected })
          : await run('sessions.removeDescendants', { id, expected, ...options });
      if (!result) return undefined;
      closeDialog();
      if (
        kind === 'remove' &&
        selectedSession &&
        result.items.some((item) => item.ok && item.id === selectedSession)
      )
        leaveClosedSession([selectedSession]);
      const lines = result.items.map((item) =>
        item.ok
          ? `${item.id}: ${'outcome' in item.result ? item.result.outcome : 'removed'}${item.result.warning ? `; ${item.result.warning}` : ''}`
          : `${item.id}: ${item.skipped ? 'skipped, ' : ''}${item.error.message}`,
      );
      return {
        text: lines.join('\n'),
        tone: result.items.some((item) => !item.ok || (item.ok && item.result.warning))
          ? 'alert'
          : 'confirmation',
      };
    });
  /** When the shown session is among `ids`, which closed, shows the next listed one that did not. */
  const leaveClosedSession = (ids: readonly string[]) => {
    if (!selectedSession || !ids.includes(selectedSession)) return;
    const next = rows?.find((row) => !ids.includes(row.id) && row.managed && !exited(row));
    if (next) onSelectSession?.(next.id);
    else onSessions?.();
  };
  /** What a toast calls a session: its card's title, or its id when it is not listed. */
  const titleOf = (id: string) => {
    const row = rows?.find((r) => r.id === id);
    return row ? sessionTitle(row) : id;
  };
  /**
   * Unarchives and resumes each of `ids` (`mesa unarchive --resume`), then shows the first one
   * resumed, live in its project group; one with nothing to resume stays ended, and its warning
   * says why. Titles are read now, from the rows this render lists.
   */
  const restore = (ids: readonly string[]) => {
    const titles = new Map(ids.map((id) => [id, titleOf(id)]));
    return async (): Promise<Message | undefined> => {
      let shown = false;
      const warnings: string[] = [];
      let done = 0;
      for (const id of ids) {
        const restored = await run('sessions.unarchive', { id, resume: true });
        if (!restored) continue;
        done += 1;
        if (restored.warning) warnings.push(`${titles.get(id)}: ${restored.warning}`);
        if (restored.resumed && !shown) {
          shown = true;
          onSelectSession?.(restored.resumed.id);
        }
      }
      if (done === 0) return undefined;
      const [only] = ids;
      const text =
        ids.length === 1 && only ? `Unarchived ${titles.get(only)}` : `Unarchived ${done} sessions`;
      return said(text, warnings.length ? { warning: warnings.join('; ') } : undefined);
    };
  };
  /** The Archived section's Unarchive: one session, unarchived and resumed (restore). */
  const unarchive = (id: string) => act(restore([id]));
  /**
   * The Undo an archive's toast carries: restore, run at once rather than through `act`, which
   * drops a press while another action runs, so an Undo always happens; it toasts what it did.
   */
  const undo = (ids: readonly string[]): ToastLink => {
    const restoring = restore(ids);
    return {
      label: 'Undo',
      icon: Undo2,
      onFollow: () =>
        void restoring().then(async (message) => {
          await look();
          if (message) toast(message.text, message.tone);
        }),
    };
  };
  /**
   * Archives one session, or several in one `mesa archive`, which reports each; its toast's Undo
   * unarchives and resumes those it archived.
   */
  const archive = ([id, ...more]: string[]) =>
    act(async () => {
      if (!id) return undefined;
      if (more.length === 0) {
        const archived = await run('sessions.archive', { id });
        if (!archived) return undefined;
        closeDialog();
        leaveClosedSession([id]);
        return { ...said(`Archived ${titleOf(id)}`, archived), link: undo([id]) };
      }
      const result = await run('sessions.archiveEach', { ids: [id, ...more] });
      if (!result) return undefined;
      closeDialog();
      const done = result.items.flatMap((item) => (item.ok ? [item] : []));
      leaveClosedSession(done.map((item) => item.id));
      const lines = [
        done.length > 0 && `Archived ${done.length} ${done.length === 1 ? 'session' : 'sessions'}`,
        ...result.items.map((item) =>
          item.ok
            ? item.result.warning && `${item.id}: ${item.result.warning}`
            : `${item.id}: ${item.error.message}`,
        ),
      ].filter(Boolean);
      return {
        text: lines.join('\n'),
        tone: done.length < result.items.length ? 'alert' : 'confirmation',
        ...(done.length > 0 ? { link: undo(done.map((item) => item.id)) } : {}),
      };
    });
  const deletePermanently = (id: string) =>
    act(async () => {
      const removed = await run('sessions.remove', { id, force: true });
      if (!removed) return undefined;
      closeDialog();
      leaveClosedSession([id]);
      return warningOf(removed);
    });
  const open = (input: NewSessionInput) =>
    once(async () => {
      const opened = await run('sessions.open', input);
      await look();
      if (!opened) return undefined;
      closeDialog();
      onSelectSession?.(opened.id);
      return warningOf(opened);
    });
  const openChildTerminal = (row: ManagedRow) =>
    once(async () => {
      const opened = await run('sessions.open', {
        ...(row.project === GENERAL_PROJECT ? { general: true } : { project: row.project }),
        terminal: true,
        parent: row.id,
      });
      await look();
      if (!opened) return undefined;
      onSelectSession?.(opened.id);
      return warningOf(opened);
    });
  return {
    openTerminal,
    stop,
    resume,
    forceStart,
    adopt,
    handoff,
    swap,
    fork,
    saveDependency,
    rename,
    remove,
    cascade,
    archive,
    unarchive,
    deletePermanently,
    open,
    openChildTerminal,
  };
}

/** What `useSessionCommands` returns: the commands a Sessions part runs. */
export type SessionCommands = ReturnType<typeof useSessionCommands>;
