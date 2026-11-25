import type { Config, GridGroup, ProjectRow, SavedPrompt, TreeRow } from '@mesa/core';
import { diffable, setupSessionsOf } from '@mesa/core/browser';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useSessionLogs } from '@/features/logs/useSessionLogs';
import type { ProjectAddRequest } from '@/features/projects/AddProjectMenu';
import { PromptCard } from './answer/PromptCard';
import { ChatPanel } from './chat/ChatPanel';
import { SwitchViewDialog } from './chat/SwitchViewDialog';
import { useSessionView } from './chat/useSessionView';
import { type OpenDialog, SessionDialogs } from './dialogs/SessionDialogs';
import { useDialogRequest } from './dialogs/useDialogRequest';
import { GridToolbar } from './grid/GridToolbar';
import { useGrid } from './grid/useGrid';
import { SessionStart } from './SessionStart';
import { SelectedSessionBar } from './selected/SelectedSessionBar';
import { SessionActionsMenu } from './selected/SessionActionsMenu';
import { SessionRecovery } from './selected/SessionRecovery';
import { SidePanels } from './selected/SidePanels';
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
import { useWakeShown } from './useWakeShown';

/** The session composer, selected session, and terminal grid share persistent terminal clients. */
export function SessionsScreen(
  props: {
    selectedSession?: string;
    onAddProject?: (request: ProjectAddRequest) => void;
    projects?: readonly ProjectRow[];
    projectsError?: string;
    onRetryProjects?: () => void;
    /** Reads the projects again, after the Logs panel hides itself for one. */
    onProjectsChanged?: () => void;
    onRowsChange?: (rows: TreeRow[]) => void;
    /** Called once the first look has answered, rows or a failure. */
    onLoaded?: () => void;
    onSessions?: () => void;
    onProject?: (project: string) => void;
    archiveSessionRequest?: { count: number; ids: string[] };
    dependencySessionRequest?: { count: number; ids: string[] };
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
  const { data, loaded, look } = useSessions();
  useEffect(() => {
    if (data) props.onRowsChange?.(data);
  }, [data, props.onRowsChange]);
  useEffect(() => {
    if (loaded) props.onLoaded?.();
  }, [loaded, props.onLoaded]);
  const [dialog, setDialog] = useState<OpenDialog>();
  useLookForSelected(props.selectedSession, data, look);
  useDialogRequest(props.archiveSessionRequest, data, 'archive', setDialog);
  useDialogRequest(props.dependencySessionRequest, data, 'dependency', setDialog);
  const close = () => setDialog(undefined);
  const run = useRun();
  const panels = useTerminalPanels(data, props.selectedSession, props.gridMode);
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
  const view = useSessionView(selected, props.terminalPreferences?.sessionView ?? 'terminal', act);
  const chat = Boolean(props.selectedSession) && view.view === 'chat';
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
  useWakeShown(selected, commands.wake);
  const logs = useSessionLogs({
    row: selected,
    projects: props.projects,
    open: side.open === 'logs',
    prompt: { put: insert.putPrompt, show: insert.showPrompt },
    openSession: commands.open,
    onHidden: () => {
      if (props.selectedSession) side.close(props.selectedSession);
      props.onProjectsChanged?.();
    },
  });
  const grid = useGrid({ panels, act, onGroupsChanged: props.onGridGroupsChanged });

  const emptyStart = !props.selectedSession && !props.gridMode;
  return (
    <section
      data-testid="session-workspace"
      data-returns-focus
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
          panel={side.open}
          onProject={props.onProject}
          onSessions={props.onSessions}
          onSwap={commands.swap}
          onTogglePanel={side.toggle}
          onDialog={setDialog}
          view={view.available ? view.view : undefined}
          switching={view.switching}
          onView={view.choose}
          logs={logs.bar}
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
      {view.asking && (
        <SwitchViewDialog
          to={view.asking}
          disabled={acting}
          onConfirm={view.confirm}
          onCancel={view.cancel}
        />
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
          onWake={commands.wake}
          onDialog={setDialog}
        />
      ) : null}
      {/* In chat the card sits at the chat's bottom. */}
      <PromptCard row={chat ? undefined : selected} />
      {props.gridMode && panels.panels.length === 0 && (
        <Muted>No tiles open. Choose a live session or reopen a saved group.</Muted>
      )}
      <div
        className={
          props.selectedSession
            ? // relative: the Diff panel's Expand covers this area.
              'relative flex min-h-0 flex-1'
            : props.gridMode
              ? 'grid gap-3 lg:grid-cols-2'
              : 'space-y-4'
        }
      >
        {chat && props.selectedSession && (
          <ChatPanel
            key={props.selectedSession}
            sessionId={props.selectedSession}
            row={selected}
            acting={acting}
            sent={prompt.sent}
            refused={prompt.refused?.id === props.selectedSession ? prompt.refused.text : undefined}
            onSend={(text, form, image) =>
              prompt.send(props.selectedSession ?? '', text, form, false, image)
            }
            image={prompt.image}
            onPickImage={() => prompt.pickImage(props.selectedSession ?? '')}
            onClearImage={prompt.clearImage}
            onOpenDiff={
              selected && diffable(selected)
                ? () => side.open !== 'diff' && side.toggle('diff')
                : undefined
            }
            terminal={props.terminalPreferences}
          />
        )}
        <TerminalTiles
          rows={data}
          panels={panels}
          selectedSession={props.selectedSession}
          covered={chat}
          gridMode={props.gridMode}
          gridProject={grid.project}
          terminalPreferences={props.terminalPreferences}
          projects={props.projects}
          acting={acting}
          onFileLink={props.onFileLink}
          onWebLink={(session, url) => {
            if (props.terminalPreferences?.webLinks === 'default') {
              void run('browser.external', { url });
              return;
            }
            side.requestBrowser(session, url);
            props.onSelectSession?.(session);
          }}
          onOpenTerminal={commands.openTerminal}
          onReviewResponse={(id, response) => {
            side.requestReview(response);
            props.onSelectSession?.(id);
          }}
        />
        <SidePanels
          rows={data}
          panels={side.panels}
          selectedSession={props.selectedSession}
          onClose={side.close}
          crew={{
            send: (id, text, form) => prompt.send(id, text, form),
            stop: commands.stop,
            select: (id) => props.onSelectSession?.(id),
            setupsOf: (id) => setupSessionsOf(data ?? [], id),
          }}
          logs={logs.panel}
          fill={!chat && !panels.liveRows.some((row) => row.id === props.selectedSession)}
        />
      </div>
    </section>
  );
}
