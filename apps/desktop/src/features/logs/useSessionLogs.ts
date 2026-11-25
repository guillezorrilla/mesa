import type { ProjectRow, TreeRow } from '@mesa/core';
import { GENERAL_PROJECT, takesPrompt } from '@mesa/core/browser';
import { useToast } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';
import { type LogWatch, useLogWatch } from './useLogWatch';

/** The Logs panel's stream (useLogWatch) and what its picked lines can do. */
export type LogsActions = {
  watch: LogWatch;
  /** The session shows a prompt field, which Send fills; else the lines start a new session. */
  takesPrompt: boolean;
  /** Puts text in the session's prompt field, without opening its menu; false when it has none. */
  send: (text: string) => boolean;
  /** Starts a new session in the project with `goal`. */
  start: (goal: string) => void;
  hide: () => void;
};

/**
 * The selected session's Logs (CONTEXT.md, Logs panel): for a session with a project whose
 * `logs.panel` is on, the bar's toggle with its red dot and the panel's stream and actions; none
 * otherwise.
 */
export function useSessionLogs(props: {
  row?: TreeRow;
  projects?: readonly ProjectRow[];
  open: boolean;
  /** The prompt field (usePromptInsert): fill it quietly, and show it on request. */
  prompt: { put: (text: string) => boolean; show: () => void };
  /** Starts a session (the Sessions screen's own open). */
  openSession: (input: { project: string; goal: string }) => void;
  /** After Hide for this project: the panel closes and the projects are read again. */
  onHidden: () => void;
}) {
  const { row } = props;
  const toast = useToast();
  const project = row?.managed && row.project !== GENERAL_PROJECT ? row.project : undefined;
  const shown = Boolean(props.projects?.find((each) => each.name === project)?.logsPanel);
  const watch = useLogWatch(shown ? project : undefined, props.open);
  const run = useRun();
  const hide = async () => {
    if (!project) return;
    const hidden = await run('projects.set', { name: project, path: 'logs.panel', value: false });
    if (hidden) props.onHidden();
  };
  const send = (text: string) => {
    if (!props.prompt.put(text)) {
      toast('This session takes no prompt now; start or resume it first');
      return false;
    }
    toast('Added the lines to the prompt', 'confirmation', {
      label: 'Show prompt',
      onFollow: props.prompt.show,
    });
    return true;
  };
  const panel: LogsActions | undefined =
    shown && project && row
      ? {
          watch,
          takesPrompt: takesPrompt(row),
          send,
          start: (goal) => props.openSession({ project, goal }),
          hide: () => void hide(),
        }
      : undefined;
  return { bar: shown ? { dot: watch.dot } : undefined, panel };
}
