import type { TreeRow } from '@mesa/core';
import { diffable, GENERAL_PROJECT } from '@mesa/core/browser';
import { Activity, memo } from 'react';
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
  /** Stable (useSidePanel), so a hidden panel skips the Board's every look. */
  onClose: (session: string) => void;
}) {
  return Object.entries(props.panels).map(([id, open]) => {
    const row = props.rows?.find((each) => each.id === id);
    if (!open || !row) return null;
    const mine = row.managed ? row : undefined;
    return (
      <SessionPanel
        key={id}
        id={id}
        open={open}
        visible={id === props.selectedSession}
        managed={row.managed}
        diffable={diffable(row)}
        project={mine && mine.project !== GENERAL_PROJECT ? mine.project : undefined}
        checkout={mine && (mine.worktree?.path ?? mine.cwd)}
        branch={mine?.worktree?.branch}
        state={row.lastState.state}
        onClose={props.onClose}
      />
    );
  });
}

/** One session's panel, from plain values only, so it re-renders only when one of them changes. */
const SessionPanel = memo(function SessionPanel(props: {
  id: string;
  open: OpenPanel;
  visible: boolean;
  managed: boolean;
  diffable: boolean;
  project?: string;
  checkout?: string;
  branch?: string;
  state: string;
  onClose: (session: string) => void;
}) {
  const { id, open } = props;
  const close = () => props.onClose(id);
  return (
    <Activity mode={props.visible ? 'visible' : 'hidden'}>
      {props.managed && open.panel === 'review' && (
        <RepliesPanel
          key={open.reviewResponse?.source ?? ''}
          sessionId={id}
          initialResponse={open.reviewResponse}
          project={props.project}
          checkout={props.checkout}
        />
      )}
      {props.diffable && props.project && open.panel === 'diff' && (
        <DiffPanel
          sessionId={id}
          project={props.project}
          checkout={props.checkout}
          branch={props.branch}
          state={props.state}
          onClose={close}
        />
      )}
      {props.managed && open.panel === 'browser' && (
        <BrowserPanel sessionId={id} initialUrl={open.browserTarget} onClose={close} />
      )}
    </Activity>
  );
});
