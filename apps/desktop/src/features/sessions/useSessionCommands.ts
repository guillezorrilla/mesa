import type { Agent, ManagedRow, TreeRow } from '@mesa/core';
import { GENERAL_PROJECT, projectLabel } from '@mesa/core/browser';
import type { RefObject } from 'react';
import { said } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';
import { exited } from './rows';
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
  rows?: TreeRow[];
  selectedSession?: string;
  selectionVersion: RefObject<number>;
  onSelectSession?: (id: string) => void;
  onSessions?: () => void;
}) {
  const run = useRun();
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
      return said(
        stopped.outcome === 'cancelled'
          ? `Cancelled session ${id}: it never starts`
          : `Stopped session ${id}`,
        stopped,
      );
    });
  const resume = (id: string) =>
    once(async () => {
      const version = selectionVersion.current;
      const resumed = await run('sessions.resume', { id });
      await look();
      // Its successor is shown only while it is still the session selected.
      if (resumed && selectedSession === id && version === selectionVersion.current)
        onSelectSession?.(resumed.id);
      return resumed && said(`Resumed session ${id} as ${resumed.id}`, resumed);
    });
  const forceStart = (id: string) =>
    act(async () => {
      const started = await run('sessions.forceStart', { id });
      return started && said(`Started queued session ${id}`, started);
    });
  const adopt = (agentSessionId: string, project?: string) =>
    act(async () => {
      const adopted = await run('sessions.adopt', { agentSessionId, project });
      return adopted && said(`Adopted as ${adopted.id}`, adopted);
    });
  const handoff = (id: string, note: string, keep: boolean, agent?: string) =>
    act(async () => {
      const done = await run('sessions.handoff', { id, note, keep, agent });
      if (!done) return undefined;
      closeDialog();
      return said(`Handed off ${id} to ${done.to}`, done);
    });
  const swap = (id: string, agent: Agent) =>
    act(async () => {
      const swapped = await run('sessions.swap', { id, agent });
      if (!swapped) return undefined;
      return said(`Swapped ${id} to ${agent}`, swapped);
    });
  const fork = (id: string, branch?: string) =>
    act(async () => {
      const created = await run('sessions.fork', { id, branch });
      if (!created) return undefined;
      closeDialog();
      onSelectSession?.(created.id);
      return said(`Forked session ${id} as ${created.id}`, created);
    });
  const saveDependency = (id: string, change: { parent?: string | null; after?: string }) =>
    act(async () => {
      const changed = await run('sessions.dependencies', { id, ...change });
      if (!changed) return undefined;
      closeDialog();
      return said(`Updated dependencies of session ${id}`, changed);
    });
  const rename = (id: string, name: string) =>
    act(async () => {
      const renamed = await run('sessions.rename', { id, name });
      if (!renamed) return undefined;
      closeDialog();
      return said(`Renamed ${id} to ${renamed.name}`, renamed);
    });
  const remove = (id: string, opts: { deleteWorktree: boolean; deleteBranch: boolean }) =>
    act(async () => {
      const removed = await run('sessions.remove', { id, ...opts });
      if (!removed) return undefined;
      closeDialog();
      if (selectedSession === id) leaveClosedSession([id]);
      const also = [
        removed.worktree &&
          (removed.additional?.some((a) => a.worktree) ? 'its worktrees' : 'its worktree'),
        removed.branch && `branch ${removed.branch}`,
      ];
      const extra = also.filter(Boolean).join(' and ');
      return said(`Removed session ${id}${extra ? ` with ${extra}` : ''}`, removed);
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
  /** Archives one session, or several in one `mesa archive`, which reports each. */
  const archive = ([id, ...more]: string[]) =>
    act(async () => {
      if (!id) return undefined;
      if (more.length === 0) {
        const archived = await run('sessions.archive', { id });
        if (!archived) return undefined;
        closeDialog();
        leaveClosedSession([id]);
        return said(`Archived session ${id}`, archived);
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
      };
    });
  const deletePermanently = (id: string) =>
    act(async () => {
      const removed = await run('sessions.remove', { id, force: true });
      if (!removed) return undefined;
      closeDialog();
      leaveClosedSession([id]);
      return said(`Deleted session ${id}`, removed);
    });
  const open = (input: NewSessionInput) =>
    once(async () => {
      const opened = await run('sessions.open', input);
      await look();
      if (!opened) return undefined;
      closeDialog();
      onSelectSession?.(opened.id);
      return said(`Opened session ${opened.id} on ${projectLabel(opened.project)}`, opened);
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
      return said(`Opened child terminal ${opened.id}`, opened);
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
    deletePermanently,
    open,
    openChildTerminal,
  };
}

/** What `useSessionCommands` returns: the commands a Sessions part runs. */
export type SessionCommands = ReturnType<typeof useSessionCommands>;
