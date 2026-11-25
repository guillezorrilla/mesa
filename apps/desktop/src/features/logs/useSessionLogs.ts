import type { ProjectRow, TreeRow } from '@mesa/core';
import { GENERAL_PROJECT } from '@mesa/core/browser';
import { useRun } from '@/lib/useCommand';
import { type LogWatch, useLogWatch } from './useLogWatch';

/** The Logs panel's stream (useLogWatch), its Send to agent, and its Hide for this project. */
export type LogsActions = {
  watch: LogWatch;
  /** None for a session with no agent (a plain terminal). */
  send?: (text: string) => boolean;
  hide: () => void;
};

/**
 * The selected session's Logs (CONTEXT.md, Logs panel): for a session with a project whose
 * `logs.panel` is on, the bar's toggle with its red dot and the panel's stream, Send to agent (none
 * for a plain terminal, which has no prompt field) and Hide for this project; none otherwise.
 */
export function useSessionLogs(props: {
  row?: TreeRow;
  projects?: readonly ProjectRow[];
  open: boolean;
  /** Puts text in the session's prompt field (usePromptInsert); false when it shows none. */
  insert: (text: string) => boolean;
  /** After Hide for this project: the panel closes and the projects are read again. */
  onHidden: () => void;
}) {
  const { row } = props;
  const project = row?.managed && row.project !== GENERAL_PROJECT ? row.project : undefined;
  const shown = Boolean(props.projects?.find((each) => each.name === project)?.logsPanel);
  const watch = useLogWatch(shown ? project : undefined, props.open);
  const run = useRun();
  const hide = async () => {
    if (!project) return;
    const hidden = await run('projects.set', { name: project, path: 'logs.panel', value: false });
    if (hidden) props.onHidden();
  };
  const panel: LogsActions | undefined = shown
    ? {
        watch,
        send: row?.agent === 'terminal' ? undefined : props.insert,
        hide: () => void hide(),
      }
    : undefined;
  return { bar: shown ? { dot: watch.dot } : undefined, panel };
}
