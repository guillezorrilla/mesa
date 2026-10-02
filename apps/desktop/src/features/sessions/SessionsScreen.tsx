import type { Config, GridGroup, ProjectRow, SavedPrompt, TreeRow } from '@mesa/core';
import { GENERAL_PROJECT } from '@mesa/core/browser';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import type { ProjectAddRequest } from '@/features/projects/AddProjectMenu';
import { type OpenDialog, SessionDialogs } from './dialogs/SessionDialogs';
import { useDialogRequest } from './dialogs/useDialogRequest';
import { GridToolbar } from './grid/GridToolbar';
import { useGrid } from './grid/useGrid';
import { BrowserPanel } from './review/BrowserPanel';
import { ResponseReview } from './review/ResponseReview';
import { SessionStart } from './SessionStart';
import { SelectedSessionBar } from './selected/SelectedSessionBar';
import { SessionActionsMenu } from './selected/SessionActionsMenu';
import { SessionRecovery } from './selected/SessionRecovery';
import { usePromptInsert } from './selected/usePromptInsert';
import { useSessionPrompt } from './selected/useSessionPrompt';
import { useSidePanel } from './selected/useSidePanel';
import { TerminalTiles } from './terminals/TerminalTiles';
import { useTerminalPanels } from './terminals/useTerminalPanels';
import { useLookForSelected } from './useLookForSelected';
import { useSelectionVersion } from './useSelectionVersion';
import { useSessionAct } from './useSessionAct';
import { useSessionCommands } from './useSessionCommands';
import { useSessions } from './useSessions';

/** The session composer, selected session, and terminal grid share persistent terminal clients. */
export function SessionsScreen(
  props: {
    selectedSession?: string;
    onAddProject?: (request: ProjectAddRequest) => void;
    projects?: readonly ProjectRow[];
    projectsError?: string;
    onRetryProjects?: () => void;
    onRowsChange?: (rows: TreeRow[]) => void;
    onSessions?: () => void;
    onProject?: (project: string) => void;
    archiveSessionRequest?: { count: number; id: string };
    dependencySessionRequest?: { count: number; id: string };
    terminalPreferences?: Config['terminal'];
    savedPrompts?: readonly SavedPrompt[];
    promptInsertRequest?: { session: string; text: string };
    onSelectSession?: (id: string) => void;
    onFileLink?: (session: string, target: string) => void;
    gridMode?: boolean;
    gridGroups?: GridGroup[];
    onGridGroupsChanged?: () => void;
  } = {},
) {
  const { data, look } = useSessions();
  useEffect(() => {
    if (data) props.onRowsChange?.(data);
  }, [data, props.onRowsChange]);
  const [dialog, setDialog] = useState<OpenDialog>();
  useLookForSelected(props.selectedSession, data, look);
  useDialogRequest(props.archiveSessionRequest, data, 'archive', setDialog);
  useDialogRequest(props.dependencySessionRequest, data, 'dependency', setDialog);
  const close = () => setDialog(undefined);
  const panels = useTerminalPanels(data, props.selectedSession);
  const selected = data?.find((row) => row.id === props.selectedSession);
  const insert = usePromptInsert(props.promptInsertRequest, selected?.id);
  const selectionVersion = useSelectionVersion(props.selectedSession);
  const { acting, act, once } = useSessionAct(look);
  const prompt = useSessionPrompt({
    act,
    selectedSession: props.selectedSession,
    selectionVersion,
    openDialog: setDialog,
    closeDialog: close,
  });
  const side = useSidePanel(props.selectedSession);
  const commands = useSessionCommands({
    act,
    once,
    look,
    closeDialog: close,
    rows: data,
    selectedSession: props.selectedSession,
    selectionVersion,
    onSelectSession: props.onSelectSession,
    onSessions: props.onSessions,
  });
  const grid = useGrid({ panels, act, onGroupsChanged: props.onGridGroupsChanged });

  const emptyStart = !props.selectedSession && !props.gridMode;
  return (
    <section
      data-testid="session-workspace"
      className={props.selectedSession || emptyStart ? 'flex h-full min-h-0 flex-col' : 'space-y-4'}
    >
      {emptyStart ? (
        <SessionStart
          projects={props.projects}
          projectsError={props.projectsError}
          onRetryProjects={props.onRetryProjects}
          disabled={acting}
          onOpen={commands.open}
          onAddProject={props.onAddProject}
        />
      ) : props.selectedSession ? (
        <SelectedSessionBar
          sessionId={props.selectedSession}
          row={selected}
          projects={props.projects}
          acting={acting}
          reviewOpen={side.reviewOpen}
          browserOpen={side.browserOpen}
          onProject={props.onProject}
          onSessions={props.onSessions}
          onSwap={commands.swap}
          onToggleReview={side.toggleReview}
          onToggleBrowser={side.toggleBrowser}
          onDialog={setDialog}
        >
          {selected && (
            <SessionActionsMenu
              row={selected}
              acting={acting}
              commands={commands}
              prompt={prompt}
              insert={insert}
              savedPrompts={props.savedPrompts}
              onDialog={setDialog}
            />
          )}
        </SelectedSessionBar>
      ) : props.gridMode ? (
        <PageHeader
          title="Terminal grid"
          description="Live sessions in separate tiles, grouped by project."
        >
          <Button variant="outline" onClick={props.onSessions}>
            <ArrowLeft aria-hidden /> Sessions
          </Button>
        </PageHeader>
      ) : null}
      {props.gridMode && (
        <>
          <GridToolbar
            live={panels.liveRows}
            panels={panels.panels}
            groups={props.gridGroups ?? []}
            project={grid.project}
            busy={acting}
            onProject={grid.chooseProject}
            onAdd={panels.add}
            onAddProject={grid.addProject}
            onSave={grid.saveGroup}
            onOpenGroup={grid.openGroup}
            onRemoveGroup={grid.removeGroup}
          />
          {grid.notice && <Muted role="status">{grid.notice}</Muted>}
        </>
      )}
      <SessionDialogs
        dialog={dialog}
        rows={data ?? []}
        selectedSession={props.selectedSession}
        acting={acting}
        commands={commands}
        onSend={prompt.send}
        onClose={close}
      />
      {props.selectedSession ? (
        <SessionRecovery
          row={selected}
          loaded={Boolean(data)}
          acting={acting}
          onResume={commands.resume}
          onDialog={setDialog}
        />
      ) : null}
      {props.gridMode && panels.panels.length === 0 && (
        <Muted>No tiles open. Choose a live session or reopen a saved group.</Muted>
      )}
      <div
        className={
          props.selectedSession
            ? 'flex min-h-0 flex-1'
            : props.gridMode
              ? 'grid gap-3 lg:grid-cols-2'
              : 'space-y-4'
        }
      >
        <TerminalTiles
          rows={data}
          panels={panels}
          selectedSession={props.selectedSession}
          gridMode={props.gridMode}
          gridProject={grid.project}
          terminalPreferences={props.terminalPreferences}
          projects={props.projects}
          acting={acting}
          onFileLink={props.onFileLink}
          onWebLink={(session, url) => {
            side.requestBrowser(session, url);
            props.onSelectSession?.(session);
          }}
          onOpenTerminal={commands.openTerminal}
          onReviewResponse={(id, response) => {
            side.requestReview(response);
            props.onSelectSession?.(id);
          }}
        />
        {selected?.managed && side.reviewOpen && (
          <ResponseReview
            key={`${selected.id}:${side.reviewResponse?.source ?? ''}`}
            sessionId={selected.id}
            initialResponse={side.reviewResponse}
            project={selected.project === GENERAL_PROJECT ? undefined : selected.project}
            checkout={selected.worktree?.path ?? selected.cwd}
          />
        )}
        {selected?.managed && side.browserOpen && (
          <BrowserPanel
            key={selected.id}
            sessionId={selected.id}
            initialUrl={side.browserTarget}
            onClose={side.closeBrowser}
          />
        )}
      </div>
    </section>
  );
}
