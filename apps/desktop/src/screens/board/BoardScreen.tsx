import type {
  BoardPreferences,
  GridGroup,
  GuardrailCheck,
  ManagedRow,
  ProjectRow,
  TreeRow,
} from '@mesa/core';
import {
  DEFAULT_BOARD_PREFERENCES,
  GENERAL_PROJECT,
  isRun,
  projectLabel,
  sessionLabel,
} from '@mesa/core/browser';
import {
  Archive,
  ArrowLeft,
  Download,
  ExternalLink,
  Forward,
  MoreVertical,
  Plus,
  RotateCcw,
  Send,
  Square,
  TerminalSquare,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { KnowledgeContext } from '@/components/KnowledgeContext';
import { PageHeader } from '@/components/PageHeader';
import { type Message, said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAct } from '@/lib/useAct';
import { useCall, useRun } from '@/lib/useCommand';
import { ArchiveDialog } from './ArchiveDialog';
import { BoardControls } from './BoardControls';
import { BoardLayouts } from './BoardLayouts';
import { GridToolbar } from './GridToolbar';
import { GuardrailDialog, guardrailOf } from './GuardrailDialog';
import { HandoffDialog } from './HandoffDialog';
import { LogDialog } from './LogDialog';
import { NewSessionDialog, type NewSessionInput } from './NewSessionDialog';
import { RemoveDialog } from './RemoveDialog';
import { RenameDialog } from './RenameDialog';
import { RowMenu } from './RowMenu';
import { exited, queued, resumable } from './rows';
import { SelectedSessionDetails } from './SelectedSessionDetails';
import type { RowActions } from './SessionRow';
import { TerminalPanel } from './TerminalPanel';
import { useBoard } from './useBoard';

/**
 * The one dialog open on the Board, if any: New session, a row's Rename, Hand off, Log, or
 * Remove, or the guardrail's ask on a prompt a row's Send sent (its form is cleared once sent).
 */
type OpenDialog =
  | {
      kind: 'new';
      project?: string;
      general?: boolean;
      parent?: string;
      location?: 'main' | 'worktree' | 'terminal';
    }
  | { kind: 'rename' | 'handoff' | 'log' | 'remove' | 'archive'; row: ManagedRow }
  | { kind: 'guardrail'; id: string; prompt: string; form: HTMLFormElement; check: GuardrailCheck };

/**
 * The Session Board: every session, Mesa's and (muted, read-only) foreign ones, in mesa's order
 * (highest attention first, children under their parent, collapsible), with Faro's state,
 * confidence, and attention, the running time, and the last output line. It looks again every
 * two seconds and after every action; a live session's terminal opens under it.
 */
export function BoardScreen(
  props: {
    selectedSession?: string;
    projects?: readonly ProjectRow[];
    onRowsChange?: (rows: TreeRow[]) => void;
    onBoard?: () => void;
    onProject?: (project: string) => void;
    newSessionRequest?: {
      count: number;
      project?: string;
      general?: boolean;
      location?: 'main' | 'worktree' | 'terminal';
    };
    archiveSessionRequest?: { count: number; id: string };
    preferences?: BoardPreferences;
    onPreferencesChanged?: () => void;
    onSelectSession?: (id: string) => void;
    onFileLink?: (session: string, target: string) => void;
    gridMode?: boolean;
    gridGroups?: GridGroup[];
    onGridGroupsChanged?: () => void;
  } = {},
) {
  const [ended, setEnded] = useState(false);
  const { data, look, collapsed, toggle, elapsed } = useBoard(ended);
  useEffect(() => {
    if (data) props.onRowsChange?.(data);
  }, [data, props.onRowsChange]);
  const run = useRun();
  const call = useCall();
  const [dialog, setDialog] = useState<OpenDialog>();
  const handledArchiveRequest = useRef(0);
  useEffect(() => {
    if (props.newSessionRequest?.count)
      setDialog({
        kind: 'new',
        project: props.newSessionRequest.project,
        general: props.newSessionRequest.general,
        location: props.newSessionRequest.location,
      });
  }, [props.newSessionRequest]);
  useEffect(() => {
    const id = props.archiveSessionRequest?.id;
    const row = data?.find(
      (session): session is ManagedRow & TreeRow => session.id === id && session.managed,
    );
    if (row && props.archiveSessionRequest?.count !== handledArchiveRequest.current) {
      handledArchiveRequest.current = props.archiveSessionRequest?.count ?? 0;
      setDialog({ kind: 'archive', row });
    }
  }, [props.archiveSessionRequest, data]);
  const close = () => setDialog(undefined);
  // Embedded terminals, one panel per session, in the order opened; several at once.
  const [panels, setPanels] = useState<string[]>([]);
  const [gridProject, setGridProject] = useState('all');
  const [zoomed, setZoomed] = useState<string>();
  const [gridNotice, setGridNotice] = useState('');
  // A panel goes with its session: once it is not live (stopped, resumed, exited), tmux would
  // show the view another window of the project.
  const live = new Set((data ?? []).filter((s) => s.managed && !exited(s)).map((s) => s.id));
  const gridLive = (data ?? []).filter((s): s is ManagedRow & TreeRow => s.managed && !exited(s));
  if (data && panels.some((id) => !live.has(id))) setPanels(panels.filter((id) => live.has(id)));
  useEffect(() => {
    const id = props.selectedSession;
    if (id && data?.some((row) => row.id === id && row.managed && !exited(row))) {
      setPanels((open) => (open.includes(id) ? open : [...open, id]));
    }
  }, [data, props.selectedSession]);
  const selected = data?.find((row) => row.id === props.selectedSession);
  const preferences = props.preferences ?? DEFAULT_BOARD_PREFERENCES;

  // Every action looks again when it ends, so the Board shows what it did.
  const { acting, act: once } = useAct();
  const act = (action: () => Promise<Message | undefined>) =>
    once(async () => {
      try {
        return await action();
      } finally {
        await look();
      }
    });
  /**
   * Sends a prompt. The guardrail's ask opens its dialog, whose Send anyway sends it again with
   * `yes`; its block is said in the toast, with no way past it here (--force is the CLI's).
   */
  const send = (id: string, prompt: string, form: HTMLFormElement, yes = false) =>
    act(async (): Promise<Message | undefined> => {
      const sent = await call('sessions.send', { id, prompt, yes });
      if (sent.ok) {
        form.reset();
        close();
        // Typed either way: a warning says so, so the prompt is not sent twice.
        return said(`Sent ${sent.data.chars} characters to ${id}`, sent.data);
      }
      const { error } = sent;
      const check = guardrailOf(error);
      if (check?.verdict === 'ask' && !yes) {
        setDialog({ kind: 'guardrail', id, prompt, form, check });
        return undefined;
      }
      close();
      return { text: check ? `Not sent to ${id}: ${check.reason}` : error.message, tone: 'alert' };
    });
  const actions: RowActions = {
    embed: (id) => setPanels((open) => (open.includes(id) ? open : [...open, id])),
    openTerminal: (id) =>
      act(async () => {
        const attached = await run('sessions.attach', { id });
        return attached && said(`Opened ${attached.target} in ${attached.app}`);
      }),
    send: (id, form) => send(id, String(new FormData(form).get('prompt') ?? ''), form),
    stop: (id) =>
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
      }),
    resume: (id) =>
      act(async () => {
        const resumed = await run('sessions.resume', { id });
        return resumed && said(`Resumed session ${id} as ${resumed.id}`, resumed);
      }),
    rename: (row) => row.managed && setDialog({ kind: 'rename', row }),
    handoff: (row) => row.managed && setDialog({ kind: 'handoff', row }),
    log: (row) => row.managed && setDialog({ kind: 'log', row }),
    remove: (row) => row.managed && setDialog({ kind: 'remove', row }),
    unarchive: (id) =>
      act(async () => {
        const restored = await run('sessions.unarchive', { id });
        return restored && said(`Unarchived session ${id}`, restored);
      }),
    workflow: (id, status) =>
      act(async () => {
        const changed = await run('sessions.workflow', { id, status });
        return (
          changed &&
          said(`Session ${id} workflow: ${changed.workflowStatus ?? 'unassigned'}`, changed)
        );
      }),
    adopt: (agentSessionId, project) =>
      act(async () => {
        const adopted = await run('sessions.adopt', { agentSessionId, project });
        return adopted && said(`Adopted as ${adopted.id}`, adopted);
      }),
  };
  const handoff = (id: string, note: string, keep: boolean) =>
    act(async () => {
      const done = await run('sessions.handoff', { id, note, keep });
      if (!done) return undefined;
      close();
      return said(`Handed off ${id} to ${done.to}`, done);
    });
  const rename = (id: string, name: string) =>
    act(async () => {
      const renamed = await run('sessions.rename', { id, name });
      if (!renamed) return undefined;
      close();
      return said(`Renamed ${id} to ${renamed.name}`, renamed);
    });
  const remove = (id: string, opts: { deleteWorktree: boolean; deleteBranch: boolean }) =>
    act(async () => {
      const removed = await run('sessions.remove', { id, ...opts });
      if (!removed) return undefined;
      close();
      const also = [
        removed.worktree && 'its worktree',
        removed.branch && `branch ${removed.branch}`,
      ];
      const extra = also.filter(Boolean).join(' and ');
      return said(`Removed session ${id}${extra ? ` with ${extra}` : ''}`, removed);
    });
  const leaveClosedSession = (id: string) => {
    const next = data?.find((row) => row.id !== id && row.managed && !exited(row));
    if (next) props.onSelectSession?.(next.id);
    else if (selected?.project && selected.project !== GENERAL_PROJECT)
      props.onProject?.(selected.project);
    else props.onBoard?.();
  };
  const archive = (id: string) =>
    act(async () => {
      const archived = await run('sessions.archive', { id });
      if (!archived) return undefined;
      close();
      leaveClosedSession(id);
      return said(`Archived session ${id}`, archived);
    });
  const deletePermanently = (id: string) =>
    act(async () => {
      const removed = await run('sessions.remove', { id, force: true });
      if (!removed) return undefined;
      close();
      leaveClosedSession(id);
      return said(`Deleted session ${id}`, removed);
    });
  const open = (input: NewSessionInput) =>
    act(async () => {
      const opened = await run('sessions.open', input);
      if (!opened) return undefined;
      close();
      props.onSelectSession?.(opened.id);
      return said(`Opened session ${opened.id} on ${projectLabel(opened.project)}`, opened);
    });
  const openChildTerminal = (row: ManagedRow) =>
    act(async () => {
      const opened = await run('sessions.open', {
        ...(row.project === GENERAL_PROJECT ? { general: true } : { project: row.project }),
        terminal: true,
        parent: row.id,
      });
      if (!opened) return undefined;
      props.onSelectSession?.(opened.id);
      return said(`Opened child terminal ${opened.id}`, opened);
    });
  const savePreference = (key: 'view' | 'group' | 'density' | 'sort' | 'order', value: unknown) =>
    act(async () => {
      const saved = await run('config.set', { path: `board.${key}`, value });
      if (!saved) return undefined;
      props.onPreferencesChanged?.();
      return said(`Saved Board ${key}`, saved);
    });
  const move = (id: string, direction: -1 | 1) =>
    act(async () => {
      const moved = await run('board.move', { id, direction: direction === -1 ? 'up' : 'down' });
      if (!moved) return undefined;
      props.onPreferencesChanged?.();
      return said(`Moved ${id} on Board`, moved);
    });
  const saveGroup = (name: string) =>
    act(async () => {
      const sessions = panels.filter((id) =>
        gridLive.some(
          (row) => row.id === id && (gridProject === 'all' || row.project === gridProject),
        ),
      );
      const saved = await run('grid.save', {
        name,
        project: gridProject === 'all' ? undefined : gridProject,
        sessions,
      });
      if (!saved) return undefined;
      props.onGridGroupsChanged?.();
      return said(`Saved grid group ${name}`, saved);
    });
  const removeGroup = (name: string) =>
    act(async () => {
      const removed = await run('grid.remove', { name });
      if (!removed) return undefined;
      props.onGridGroupsChanged?.();
      return said(`Removed grid group ${name}; sessions kept`, removed);
    });
  const openGroup = (group: GridGroup) => {
    const available = group.sessions.filter((id) => live.has(id));
    setGridProject(group.project ?? 'all');
    setPanels(available);
    setZoomed(undefined);
    setGridNotice(
      group.sessions.length === available.length
        ? ''
        : `${group.sessions.length - available.length} saved session(s) are unavailable; the group was kept.`,
    );
  };

  return (
    <section
      data-testid="session-board"
      className={props.selectedSession ? 'flex h-full min-h-0 flex-col' : 'space-y-4'}
    >
      {props.selectedSession ? (
        <div
          data-testid="selected-session"
          className="flex min-h-12 shrink-0 items-center gap-2 border-b bg-card/40 px-4 text-sm"
        >
          <Button
            variant="ghost"
            size="sm"
            className="px-0 text-muted-foreground"
            onClick={() =>
              selected?.project && selected.project !== GENERAL_PROJECT && props.onProject
                ? props.onProject(selected.project)
                : props.onBoard?.()
            }
          >
            {projectLabel(selected?.project ?? null)}
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="truncate font-medium">
            {selected
              ? selected.managed && !selected.name
                ? 'Session'
                : sessionLabel(selected)
              : props.selectedSession}
          </span>
          {selected?.managed && (
            <SelectedSessionDetails
              key={selected.id}
              row={selected}
              projectPath={
                props.projects?.find((project) => project.name === selected.project)?.path
              }
            />
          )}
          <span className="ml-auto text-xs text-muted-foreground">{selected?.agent}</span>
          {selected?.managed && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Archive session"
              onClick={() => setDialog({ kind: 'archive', row: selected })}
            >
              <Archive aria-hidden />
            </Button>
          )}
          {selected && (
            <details className="relative z-20">
              <summary
                aria-label="Session actions"
                className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <MoreVertical aria-hidden className="size-4" />
              </summary>
              {selected.managed ? (
                <div className="absolute right-0 mt-2 flex w-80 flex-wrap items-center gap-2 rounded-lg border bg-popover p-3 shadow-lg">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actions.openTerminal(selected.id)}
                    disabled={!selected.alive || acting}
                  >
                    <ExternalLink aria-hidden /> Open in terminal app
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openChildTerminal(selected)}
                    disabled={exited(selected) || acting}
                  >
                    <TerminalSquare aria-hidden /> New terminal session
                  </Button>
                  {selected.project !== GENERAL_PROJECT && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDialog({
                          kind: 'new',
                          project: selected.project,
                          parent: selected.id,
                          location: 'worktree',
                        })
                      }
                      disabled={exited(selected) || acting}
                    >
                      <Plus aria-hidden /> New child worktree session
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actions.stop(selected.id)}
                    disabled={!(selected.alive || queued(selected)) || acting}
                  >
                    <Square aria-hidden /> {queued(selected) ? 'Cancel' : 'Stop'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actions.resume(selected.id)}
                    disabled={!resumable(selected) || acting}
                  >
                    <RotateCcw aria-hidden /> Resume
                  </Button>
                  {!isRun(selected) &&
                    selected.kind !== 'terminal' &&
                    selected.project !== GENERAL_PROJECT && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => actions.handoff(selected)}
                        disabled={exited(selected) || !selected.goal || acting}
                      >
                        <Forward aria-hidden /> Hand off
                      </Button>
                    )}
                  <RowMenu
                    sessionId={selected.id}
                    canRemove={exited(selected) && !queued(selected) && !acting}
                    onLog={() => actions.log(selected)}
                    onRename={() => actions.rename(selected)}
                    onRemove={() => actions.remove(selected)}
                  />
                  {!isRun(selected) && selected.kind !== 'terminal' && !exited(selected) && (
                    <form
                      className="flex min-w-48 flex-1 gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!acting) actions.send(selected.id, event.currentTarget);
                      }}
                    >
                      <Input
                        name="prompt"
                        aria-label={`Prompt for ${selected.id}`}
                        placeholder="Message session"
                      />
                      <Button type="submit" size="sm" disabled={acting}>
                        <Send aria-hidden /> Send
                      </Button>
                    </form>
                  )}
                  <div className="max-h-64 w-full overflow-auto">
                    <KnowledgeContext session={selected.id} />
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    actions.adopt(selected.agentSessionId, selected.project ?? undefined)
                  }
                >
                  <Download aria-hidden /> Adopt
                </Button>
              )}
            </details>
          )}
        </div>
      ) : props.gridMode ? (
        <PageHeader
          title="Terminal grid"
          description="Live sessions in separate tiles, grouped by project."
        >
          <Button variant="outline" onClick={props.onBoard}>
            <ArrowLeft aria-hidden /> Board
          </Button>
        </PageHeader>
      ) : (
        <PageHeader
          title="Board"
          description="Every session, the ones waiting on you first; children sit under their parent."
        >
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Checkbox
              id="sessions-ended"
              data-testid="sessions-ended"
              checked={ended}
              onCheckedChange={(checked) => setEnded(checked === true)}
            />
            <Label htmlFor="sessions-ended" className="font-normal">
              Show older
            </Label>
          </div>
          <Button data-testid="new-session" onClick={() => setDialog({ kind: 'new' })}>
            <Plus aria-hidden />
            New session
          </Button>
        </PageHeader>
      )}
      {!props.selectedSession && !props.gridMode && (
        <BoardControls
          preferences={preferences}
          disabled={acting}
          onChange={(key, value) => savePreference(key, value)}
        />
      )}
      {props.gridMode && (
        <>
          <GridToolbar
            live={gridLive}
            panels={panels}
            groups={props.gridGroups ?? []}
            project={gridProject}
            busy={acting}
            onProject={(project) => {
              setGridProject(project);
              setZoomed(undefined);
            }}
            onAdd={(id) => setPanels((open) => (open.includes(id) ? open : [...open, id]))}
            onAddProject={() =>
              setPanels((open) => [
                ...new Set([
                  ...open,
                  ...gridLive
                    .filter((row) => gridProject === 'all' || row.project === gridProject)
                    .map((row) => row.id),
                ]),
              ])
            }
            onSave={saveGroup}
            onOpenGroup={openGroup}
            onRemoveGroup={removeGroup}
          />
          {gridNotice && (
            <p role="status" className="text-muted-foreground text-sm">
              {gridNotice}
            </p>
          )}
        </>
      )}
      {dialog?.kind === 'new' && (
        <NewSessionDialog
          key={`${dialog.project ?? ''}-${dialog.location ?? ''}`}
          project={dialog.project}
          general={dialog.general}
          parent={dialog.parent}
          location={dialog.location}
          onOpen={open}
          onCancel={close}
          disabled={acting}
        />
      )}
      {dialog?.kind === 'handoff' && (
        <HandoffDialog
          row={dialog.row}
          disabled={acting}
          onHandoff={(note, keep) => handoff(dialog.row.id, note, keep)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'log' && <LogDialog row={dialog.row} onClose={close} />}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          sessionId={dialog.row.id}
          name={dialog.row.name}
          disabled={acting}
          onRename={(name) => rename(dialog.row.id, name)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'guardrail' && (
        <GuardrailDialog
          action="send"
          about={`this prompt goes to ${dialog.id}`}
          check={dialog.check}
          disabled={acting}
          onConfirm={() => send(dialog.id, dialog.prompt, dialog.form, true)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveDialog
          row={dialog.row}
          disabled={acting}
          onRemove={(opts) => remove(dialog.row.id, opts)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'archive' && (
        <ArchiveDialog
          row={dialog.row}
          disabled={acting}
          onArchive={() => archive(dialog.row.id)}
          onDelete={() => deletePermanently(dialog.row.id)}
          onCancel={close}
        />
      )}
      {props.selectedSession ? (
        !selected && (
          <p className="p-4 text-sm text-muted-foreground">
            {data ? 'Session unavailable. Open Sessions to choose another.' : 'Loading session...'}
          </p>
        )
      ) : !props.gridMode ? (
        <>
          {data?.length === 0 && (
            <p data-testid="sessions-empty" className="text-muted-foreground text-sm">
              No sessions yet: start one with New session.
            </p>
          )}
          <BoardLayouts
            rows={data ?? []}
            preferences={preferences}
            collapsed={collapsed}
            toggle={toggle}
            elapsed={elapsed}
            acting={acting}
            actions={actions}
            onSelect={props.onSelectSession}
            onMove={move}
          />
        </>
      ) : null}
      {props.gridMode && panels.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No tiles open. Choose a live session or reopen a saved group.
        </p>
      )}
      <div
        className={
          props.selectedSession
            ? 'min-h-0 flex-1'
            : props.gridMode
              ? 'grid gap-3 lg:grid-cols-2'
              : 'space-y-4'
        }
      >
        {panels.map((id) => (
          <div
            key={id}
            data-testid={props.gridMode ? 'grid-tile' : undefined}
            hidden={
              props.selectedSession
                ? id !== props.selectedSession
                : props.gridMode
                  ? (gridProject !== 'all' &&
                      !gridLive.some((row) => row.id === id && row.project === gridProject)) ||
                    (Boolean(zoomed) && zoomed !== id)
                  : false
            }
            className={
              props.selectedSession
                ? 'h-full'
                : props.gridMode
                  ? zoomed === id
                    ? 'col-span-full h-[70vh] min-w-[320px]'
                    : 'h-[380px] min-w-[320px] resize overflow-auto'
                  : undefined
            }
          >
            <TerminalPanel
              sessionId={id}
              onFileLink={props.onFileLink}
              busy={acting}
              onOpenExternal={() => actions.openTerminal(id)}
              onClose={() => {
                setPanels((open) => open.filter((p) => p !== id));
                setZoomed((current) => (current === id ? undefined : current));
              }}
              grid={props.gridMode}
              selected={Boolean(props.selectedSession)}
              zoomed={zoomed === id}
              onZoom={() => setZoomed((current) => (current === id ? undefined : id))}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
