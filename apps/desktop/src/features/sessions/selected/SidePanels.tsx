import type { TreeRow } from '@mesa/core';
import { diffable, GENERAL_PROJECT } from '@mesa/core/browser';
import { Activity } from 'react';
import { DiffPanel } from '../diff/DiffPanel';
import { BrowserPanel } from '../review/BrowserPanel';
import { RepliesPanel } from '../review/RepliesPanel';
import type { OpenPanel } from './useSidePanel';

/**
 * Each session's open side panel beside its terminal. Only the selected session's shows; the
 * others stay mounted but hidden (Activity), so a session's panel is as it was when you go back:
 * the open file, the scroll, the page.
 */
export function SidePanels(props: {
  rows?: readonly TreeRow[];
  panels: Record<string, OpenPanel | undefined>;
  selectedSession?: string;
  onClose: (session: string) => void;
}) {
  return Object.entries(props.panels).map(([id, open]) => {
    const row = props.rows?.find((each) => each.id === id);
    if (!open || !row) return null;
    const close = () => props.onClose(id);
    return (
      <Activity key={id} mode={id === props.selectedSession ? 'visible' : 'hidden'}>
        {row.managed && open.panel === 'review' && (
          <RepliesPanel
            key={open.reviewResponse?.source ?? ''}
            sessionId={id}
            initialResponse={open.reviewResponse}
            project={row.project === GENERAL_PROJECT ? undefined : row.project}
            checkout={row.worktree?.path ?? row.cwd}
          />
        )}
        {diffable(row) && open.panel === 'diff' && (
          <DiffPanel
            sessionId={id}
            branch={row.worktree?.branch}
            state={row.lastState.state}
            onClose={close}
          />
        )}
        {row.managed && open.panel === 'browser' && (
          <BrowserPanel sessionId={id} initialUrl={open.browserTarget} onClose={close} />
        )}
      </Activity>
    );
  });
}
