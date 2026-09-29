import type {
  BoardPreferences,
  Config,
  GridGroup,
  GuardrailCheck,
  ManagedRow,
  ProjectRow,
  SavedPrompt,
  SessionImage,
  TreeRow,
} from '@mesa/core';
import {
  DEFAULT_BOARD_PREFERENCES,
  GENERAL_PROJECT,
  isRun,
  projectLabel,
  sessionTitle,
  supportsAgentCapability,
} from '@mesa/core/browser';
import {
  Archive,
  ArrowLeft,
  Download,
  ExternalLink,
  Forward,
  Globe,
  ImagePlus,
  MessageSquareQuote,
  MoreVertical,
  Plus,
  RotateCcw,
  Send,
  Square,
  TerminalSquare,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KnowledgeContext } from '@/components/KnowledgeContext';
import { PageHeader } from '@/components/PageHeader';
import { SavedPromptPicker } from '@/components/SavedPromptPicker';
import { type Message, said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useCall, useRun } from '@/lib/useCommand';
import { ArchiveDialog } from './ArchiveDialog';
import { BoardControls } from './BoardControls';
import { BoardLayouts } from './BoardLayouts';
import { BrowserPanel } from './BrowserPanel';
import { DependencyDialog } from './DependencyDialog';
import { DescendantDialog } from './DescendantDialog';
import { ForkDialog } from './ForkDialog';
import { GridToolbar } from './GridToolbar';
import { GuardrailDialog, guardrailOf } from './GuardrailDialog';
import { HandoffDialog } from './HandoffDialog';
import { LogDialog } from './LogDialog';
import { NewSessionDialog, type NewSessionInput } from './NewSessionDialog';
import { RemoveDialog } from './RemoveDialog';
import { RenameDialog } from './RenameDialog';
import { ResponseReview } from './ResponseReview';
import { RowMenu } from './RowMenu';
import { exited, queued, recoverable, resumable } from './rows';
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
  | {
      kind:
        | 'rename'
        | 'handoff'
        | 'log'
        | 'remove'
        | 'archive'
        | 'fork'
        | 'dependency'
        | 'stop-descendants'
        | 'remove-descendants';
      row: ManagedRow;
    }
  | {
      kind: 'guardrail';
      id: string;
      prompt: string;
      form: HTMLFormElement;
      check: GuardrailCheck;
      image?: SessionImage;
    };

/**
 * The Session Board: every session, Mesa's and (muted, read-only) foreign ones, in mesa's order
 * (highest attention first, children under their parent, collapsible), with Faro's state,
 * the running time, and the last output line. It looks again every
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
      parent?: string;
    };
    archiveSessionRequest?: { count: number; id: string };
    dependencySessionRequest?: { count: number; id: string };
    preferences?: BoardPreferences;
    terminalPreferences?: Config['terminal'];
    savedPrompts?: readonly SavedPrompt[];
    promptInsertRequest?: { session: string; text: string };
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
  const platform = usePlatform();
  const [dialog, setDialog] = useState<OpenDialog>();
  const [image, setImage] = useState<SessionImage>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<{ url: string }>();
  const [pendingBrowser, setPendingBrowser] = useState<{ session: string; url: string }>();
  const selectionVersion = useRef(0);
  const handledArchiveRequest = useRef(0);
  const handledDependencyRequest = useRef(0);
  useEffect(() => {
    if (props.newSessionRequest?.count)
      setDialog({
        kind: 'new',
        project: props.newSessionRequest.project,
        general: props.newSessionRequest.general,
        location: props.newSessionRequest.location,
        parent: props.newSessionRequest.parent,
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
  useEffect(() => {
    const id = props.dependencySessionRequest?.id;
    const row = data?.find(
      (session): session is ManagedRow & TreeRow => session.id === id && session.managed,
    );
    if (row && props.dependencySessionRequest?.count !== handledDependencyRequest.current) {
      handledDependencyRequest.current = props.dependencySessionRequest?.count ?? 0;
      setDialog({ kind: 'dependency', row });
    }
  }, [props.dependencySessionRequest, data]);
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
  const promptField = useRef<HTMLTextAreaElement>(null);
  const actionsMenu = useRef<HTMLDetailsElement>(null);
  const handledPromptInsert = useRef<typeof props.promptInsertRequest>(undefined);
  const insertPrompt = useCallback((text: string) => {
    const field = promptField.current;
    if (!field) return;
    field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end');
    field.focus();
  }, []);
  useEffect(() => {
    const request = props.promptInsertRequest;
    if (!request || request === handledPromptInsert.current || request.session !== selected?.id)
      return;
    if (!promptField.current) return;
    // The field sits in the Session actions menu: open it, so the inserted text shows.
    if (actionsMenu.current) actionsMenu.current.open = true;
    insertPrompt(request.text);
    handledPromptInsert.current = request;
  }, [props.promptInsertRequest, selected?.id, insertPrompt]);
  useEffect(() => {
    selectionVersion.current += 1;
    setImage((current) => (current?.session === props.selectedSession ? current : undefined));
    setReviewOpen(false);
    setBrowserOpen(false);
    setBrowserTarget(undefined);
  }, [props.selectedSession]);
  useEffect(() => {
    if (!pendingBrowser || pendingBrowser.session !== props.selectedSession) return;
    setBrowserTarget({ url: pendingBrowser.url });
    setBrowserOpen(true);
    setReviewOpen(false);
    setPendingBrowser(undefined);
  }, [pendingBrowser, props.selectedSession]);
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
  const send = (
    id: string,
    prompt: string,
    form: HTMLFormElement,
    yes = false,
    attachment?: SessionImage,
  ) =>
    act(async (): Promise<Message | undefined> => {
      const sent = attachment
        ? await call('image.send', { image: attachment, note: prompt, yes })
        : await call('sessions.send', { id, prompt, yes });
      if (sent.ok) {
        form.reset();
        if (attachment) setImage(undefined);
        close();
        // Typed either way: a warning says so, so the prompt is not sent twice.
        return said(`Sent ${sent.data.chars} characters to ${id}`, sent.data);
      }
      const { error } = sent;
      const check = guardrailOf(error);
      if (check?.verdict === 'ask' && !yes) {
        setDialog({ kind: 'guardrail', id, prompt, form, check, image: attachment });
        return undefined;
      }
      close();
      return { text: check ? `Not sent to ${id}: ${check.reason}` : error.message, tone: 'alert' };
    });
  const pickImage = (id: string) =>
    act(async (): Promise<Message | undefined> => {
      const version = selectionVersion.current;
      const path = await platform.pickFile();
      if (!path || version !== selectionVersion.current) return undefined;
      const preview = await call('image.preview', { id, path });
      if (version !== selectionVersion.current) return undefined;
      if (!preview.ok) return { text: preview.error.message, tone: 'alert' };
      setImage(preview.data);
      return said(`Selected ${preview.data.name} for session ${id}`);
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
    stopDescendants: (row) => row.managed && setDialog({ kind: 'stop-descendants', row }),
    resume: (id) =>
      once(async () => {
        const version = selectionVersion.current;
        const resumed = await run('sessions.resume', { id });
        await look();
        // Its successor is shown only while it is still the session selected.
        if (resumed && props.selectedSession === id && version === selectionVersion.current)
          props.onSelectSession?.(resumed.id);
        return resumed && said(`Resumed session ${id} as ${resumed.id}`, resumed);
      }),
    rename: (row) => row.managed && setDialog({ kind: 'rename', row }),
    dependency: (row) => row.managed && setDialog({ kind: 'dependency', row }),
    forceStart: (id) =>
      act(async () => {
        const started = await run('sessions.forceStart', { id });
        return started && said(`Started queued session ${id}`, started);
      }),
    handoff: (row) => row.managed && setDialog({ kind: 'handoff', row }),
    log: (row) => row.managed && setDialog({ kind: 'log', row }),
    remove: (row) => row.managed && setDialog({ kind: 'remove', row }),
    removeDescendants: (row) => row.managed && setDialog({ kind: 'remove-descendants', row }),
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
  const handoff = (id: string, note: string, keep: boolean, agent?: string) =>
    act(async () => {
      const done = await run('sessions.handoff', { id, note, keep, agent });
      if (!done) return undefined;
      close();
      return said(`Handed off ${id} to ${done.to}`, done);
    });
  const fork = (id: string, branch?: string) =>
    act(async () => {
      const created = await run('sessions.fork', { id, branch });
      if (!created) return undefined;
      close();
      props.onSelectSession?.(created.id);
      return said(`Forked session ${id} as ${created.id}`, created);
    });
  const saveDependency = (id: string, change: { parent?: string | null; after?: string }) =>
    act(async () => {
      const changed = await run('sessions.dependencies', { id, ...change });
      if (!changed) return undefined;
      close();
      return said(`Updated dependencies of session ${id}`, changed);
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
      close();
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
    once(async () => {
      const opened = await run('sessions.open', input);
      await look();
      if (!opened) return undefined;
      close();
      props.onSelectSession?.(opened.id);
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
            {selected ? sessionTitle(selected) : props.selectedSession}
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
          {selected?.managed &&
            selected.kind === 'interactive' &&
            selected.agent !== 'terminal' && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Review responses"
                aria-pressed={reviewOpen}
                onClick={() => {
                  setBrowserOpen(false);
                  setReviewOpen((open) => !open);
                }}
              >
                <MessageSquareQuote aria-hidden /> Review
              </Button>
            )}
          {selected?.managed && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Open session browser"
              aria-pressed={browserOpen}
              onClick={() => {
                setReviewOpen(false);
                setBrowserTarget(undefined);
                setBrowserOpen((open) => !open);
              }}
            >
              <Globe aria-hidden /> Browser
            </Button>
          )}
          {selected && recoverable(selected) && (
            <span className="text-xs text-state-waiting">Terminal ended</span>
          )}
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
            <details ref={actionsMenu} className="relative z-20">
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
                  {selected.children.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={acting}
                      onClick={() => actions.stopDescendants(selected)}
                    >
                      <Square aria-hidden /> Stop descendants
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actions.resume(selected.id)}
                    disabled={!resumable(selected) || acting}
                  >
                    <RotateCcw aria-hidden /> Resume
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actions.dependency(selected)}
                    disabled={acting}
                  >
                    Set dependency
                  </Button>
                  {queued(selected) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => actions.forceStart(selected.id)}
                      disabled={acting}
                    >
                      Start now
                    </Button>
                  )}
                  {selected.kind === 'interactive' &&
                    !selected.background &&
                    selected.agent !== 'terminal' &&
                    supportsAgentCapability(selected.agent, 'fork') && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fork(selected.id)}
                          disabled={!selected.agentSessionId || acting}
                        >
                          <Plus aria-hidden /> Fork session
                        </Button>
                        {selected.project !== GENERAL_PROJECT && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDialog({ kind: 'fork', row: selected })}
                            disabled={!selected.agentSessionId || acting}
                          >
                            <Plus aria-hidden /> Fork into worktree
                          </Button>
                        )}
                      </>
                    )}
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
                    onDependency={() => actions.dependency(selected)}
                    onRemove={() => actions.remove(selected)}
                    onRemoveDescendants={
                      selected.children.length > 0
                        ? () => actions.removeDescendants(selected)
                        : undefined
                    }
                  />
                  {!isRun(selected) && selected.kind !== 'terminal' && !exited(selected) && (
                    <div className="flex min-w-48 flex-1 flex-col gap-2">
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!acting)
                            send(
                              selected.id,
                              String(new FormData(event.currentTarget).get('prompt') ?? ''),
                              event.currentTarget,
                              false,
                              image?.session === selected.id ? image : undefined,
                            );
                        }}
                      >
                        <Textarea
                          ref={promptField}
                          name="prompt"
                          aria-label={`Prompt for ${selected.id}`}
                          placeholder="Message session"
                          rows={2}
                          className="min-h-9 flex-1 resize-y"
                        />
                        <SavedPromptPicker prompts={props.savedPrompts} onSelect={insertPrompt} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={acting}
                          onClick={() => pickImage(selected.id)}
                          aria-label="Attach image"
                        >
                          <ImagePlus aria-hidden />
                        </Button>
                        <Button type="submit" size="sm" disabled={acting}>
                          <Send aria-hidden />{' '}
                          {image?.session === selected.id ? 'Send image' : 'Send'}
                        </Button>
                      </form>
                      {image?.session === selected.id && (
                        <div className="flex items-center gap-2 rounded border p-2 text-xs">
                          <img
                            src={image.dataUrl}
                            alt={`Selected image: ${image.name}`}
                            className="max-h-24 max-w-36 object-contain"
                          />
                          <span className="min-w-0 flex-1 truncate">{image.name}</span>
                          <Button size="sm" variant="ghost" onClick={() => setImage(undefined)}>
                            Remove image
                          </Button>
                        </div>
                      )}
                    </div>
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
          savedPrompts={props.savedPrompts}
          onOpen={open}
          onCancel={close}
          disabled={acting}
        />
      )}
      {dialog?.kind === 'handoff' && (
        <HandoffDialog
          row={dialog.row}
          disabled={acting}
          onHandoff={(note, keep, agent) => handoff(dialog.row.id, note, keep, agent)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'fork' && (
        <ForkDialog
          sessionId={dialog.row.id}
          disabled={acting}
          onFork={(branch) => fork(dialog.row.id, branch)}
          onCancel={close}
        />
      )}
      {dialog?.kind === 'dependency' && (
        <DependencyDialog
          row={dialog.row}
          rows={data ?? []}
          disabled={acting}
          onSave={(change) => saveDependency(dialog.row.id, change)}
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
          onConfirm={() =>
            dialog.image && props.selectedSession !== dialog.id
              ? close()
              : send(dialog.id, dialog.prompt, dialog.form, true, dialog.image)
          }
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
      {(dialog?.kind === 'stop-descendants' || dialog?.kind === 'remove-descendants') && (
        <DescendantDialog
          row={dialog.row}
          action={dialog.kind === 'stop-descendants' ? 'stop' : 'remove'}
          disabled={acting}
          onConfirm={(ids, options) =>
            cascade(
              dialog.kind === 'stop-descendants' ? 'stop' : 'remove',
              dialog.row.id,
              ids,
              options,
            )
          }
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
        selected && recoverable(selected) ? (
          <div
            data-testid="session-recovery"
            className="m-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4 text-sm"
          >
            <p className="flex-1">
              This session's terminal ended. Its record and logs remain available.
            </p>
            {resumable(selected) && (
              <Button disabled={acting} onClick={() => actions.resume(selected.id)}>
                <RotateCcw aria-hidden /> Restore
              </Button>
            )}
            <Button
              variant="outline"
              disabled={acting}
              onClick={() => setDialog({ kind: 'archive', row: selected })}
            >
              Dismiss
            </Button>
          </div>
        ) : (
          !selected && (
            <p className="p-4 text-sm text-muted-foreground">
              {data
                ? 'Session unavailable. Open Sessions to choose another.'
                : 'Loading session...'}
            </p>
          )
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
            ? 'flex min-h-0 flex-1'
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
                ? 'h-full min-w-0 flex-1'
                : props.gridMode
                  ? zoomed === id
                    ? 'col-span-full h-[70vh] min-w-[320px]'
                    : 'h-[380px] min-w-[320px] resize overflow-auto'
                  : undefined
            }
          >
            <TerminalPanel
              sessionId={id}
              preferences={props.terminalPreferences}
              onFileLink={props.onFileLink}
              onWebLink={(session, url) => {
                setPendingBrowser({ session, url });
                props.onSelectSession?.(session);
              }}
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
        {selected?.managed && reviewOpen && (
          <ResponseReview
            key={selected.id}
            sessionId={selected.id}
            project={selected.project === GENERAL_PROJECT ? undefined : selected.project}
            checkout={selected.worktree?.path ?? selected.cwd}
          />
        )}
        {selected?.managed && browserOpen && (
          <BrowserPanel
            key={selected.id}
            sessionId={selected.id}
            initialUrl={browserTarget}
            onClose={() => {
              setBrowserTarget(undefined);
              setBrowserOpen(false);
            }}
          />
        )}
      </div>
    </section>
  );
}
