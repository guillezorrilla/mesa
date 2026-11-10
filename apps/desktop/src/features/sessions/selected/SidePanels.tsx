import type { TreeRow } from '@mesa/core';
import { diffable, GENERAL_PROJECT, sessionFolder } from '@mesa/core/browser';
import { Activity, memo } from 'react';
import { DiffPanel } from '../diff/DiffPanel';
import { BrowserPanel } from '../review/BrowserPanel';
import { RepliesPanel } from '../review/RepliesPanel';
import { type CrewActions, CrewPanel } from './CrewPanel';
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
  /** The Crew panel's Send and Stop; given only to a session whose Crew is open. */
  crew: CrewActions;
}) {
  return Object.entries(props.panels).map(([id, open]) => {
    const row = props.rows?.find((each) => each.id === id);
    if (!open || !row) return null;
    const mine = row.managed ? row : undefined;
    // Its children's states, so the Crew reads again when one changes.
    const crewStamp =
      mine && open.panel === 'crew'
        ? mine.children
            .map(
              (child) =>
                `${child}:${props.rows?.find((each) => each.id === child)?.lastState.state}`,
            )
            .join(' ')
        : '';
    return (
      <SessionPanel
        key={id}
        id={id}
        open={open}
        visible={id === props.selectedSession}
        managed={row.managed}
        diffable={diffable(row)}
        project={mine && mine.project !== GENERAL_PROJECT ? mine.project : undefined}
        checkout={mine && sessionFolder(mine)}
        branch={mine && (mine.cwd ? mine.gitBranch || undefined : mine.worktree?.branch)}
        state={row.lastState.state}
        crewStamp={crewStamp}
        crew={open.panel === 'crew' ? props.crew : undefined}
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
  crewStamp: string;
  crew?: CrewActions;
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
      {props.crew && open.panel === 'crew' && (
        <CrewPanel sessionId={id} stamp={props.crewStamp} actions={props.crew} onClose={close} />
      )}
      {props.managed && open.panel === 'browser' && (
        <BrowserPanel sessionId={id} initialUrl={open.browserTarget} onClose={close} />
      )}
    </Activity>
  );
});
