import { Activity, useEffect, useRef, useState } from 'react';
import { FreshFor } from '@/lib/useCommand';
import type { WorkspaceView } from '@/lib/workspaceView';
import { CloudLogsScreen } from './CloudLogsScreen';
import type { CloudLogsView } from './types';
import { useLogsKept } from './useLogsKept';

/** How long a Logs read counts as fresh: shown again sooner, the tab reads nothing. */
const FRESH_MS = 60_000;

type LogsView = Extract<WorkspaceView, { kind: 'logs' }>;

/** The view `view` chose, when it has a mode: what is kept and shown. */
const chosenView = (view: LogsView | undefined): CloudLogsView | undefined =>
  view?.mode ? { mode: view.mode, query: view.query ?? {}, ask: view.ask } : undefined;

/**
 * The Logs tab as the person left it (CONTEXT.md, Cloud Logs): mounted from its first visit and
 * kept, hidden, while another tab or screen shows (Activity), so its scroll, selection, open rows,
 * drafts and conversation are as they were; a read younger than FRESH_MS is not made again. Its
 * view (Errors or Explorer, the filters, the conversation) is kept per profile, so the tab opened
 * with no view of its own (the sidebar's Logs) comes back to it, after a restart too.
 */
export function CloudLogsKeptScreen(props: {
  /** The Logs view in the workspace, undefined while another screen shows. */
  view?: LogsView;
  onView: (next: CloudLogsView) => void;
  onSession: (id: string) => void;
}) {
  const { view } = props;
  const [kept, keep, ready] = useLogsKept<CloudLogsView | undefined>('view', undefined);
  // The setter of this render, so keeping a view waits on the view alone.
  const keepRef = useRef(keep);
  keepRef.current = keep;
  const [seen, setSeen] = useState(Boolean(view));
  if (view && !seen) setSeen(true);
  const chosen = chosenView(view);
  // A view with a mode is a choice (a filter, a saved view, Ask about this): kept with its
  // conversation, not the one-off question an error hands to Claude.
  useEffect(() => {
    const next = chosenView(view);
    if (next) keepRef.current(next);
  }, [view]);
  // Until the profile is known the kept view cannot be read: wait, rather than read the defaults.
  if (!seen || (!chosen && !ready)) return null;
  const shown: CloudLogsView = chosen ?? kept ?? { mode: 'errors', query: {} };
  return (
    <Activity mode={view ? 'visible' : 'hidden'}>
      <FreshFor.Provider value={FRESH_MS}>
        <CloudLogsScreen
          mode={shown.mode}
          filters={shown.query}
          ask={shown.ask}
          prompt={view?.prompt}
          onView={props.onView}
          onSession={props.onSession}
        />
      </FreshFor.Provider>
    </Activity>
  );
}
