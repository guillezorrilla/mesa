import type { Agent, ManagedRow, ProjectRow, TreeRow } from '@mesa/core';
import {
  DEFAULT_AGENT,
  duration,
  sessionBranch,
  sessionLabel,
  supportsAgentCapability,
  supportsPlanStart,
} from '@mesa/core/browser';
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Folder,
  FolderGit2,
  GitBranch,
  MoreHorizontal,
  Play,
  Plus,
  TerminalSquare,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { KnowledgeContext } from '@/components/KnowledgeContext';
import { StateBadge } from '@/components/StateBadge';
import { said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { AgentField } from './board/AgentField';
import { BackgroundField } from './board/BackgroundField';
import { exited, queued } from './board/rows';
import { SessionModeField } from './board/SessionModeField';
import { FilesWorkspace } from './FilesWorkspace';
import { GitWorkspace } from './GitWorkspace';
import { NativeHistory } from './NativeHistory';
import { RulesWorkspace } from './RulesWorkspace';
import { SkillsWorkspace } from './SkillsWorkspace';
import { WorktreesWorkspace } from './WorktreesWorkspace';

/** The selected project's existing information and effective skills, in its own workspace. */
export function ProjectWorkspace(props: {
  project: ProjectRow;
  sessions: readonly TreeRow[];
  onSession: (id: string) => void;
  onChanged: () => void;
  onUnregistered: () => void;
  filesDirty: boolean;
  file?: { checkout: string; path: string; line: number };
  onFilesDirtyChange: (dirty: boolean) => void;
  onNewSession: (project: string, kind: 'main' | 'worktree' | 'terminal') => void;
  onAgentSettings: () => void;
}) {
  const { project } = props;
  const [tab, setTab] = useState<'overview' | 'git' | 'files' | 'worktrees' | 'skills' | 'rules'>(
    'overview',
  );
  useEffect(() => {
    if (props.file) setTab('files');
  }, [props.file]);
  const [pendingTab, setPendingTab] = useState<typeof tab>();
  const [location, setLocation] = useState<'main' | 'worktree'>('main');
  const [composerOpen, setComposerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent>(
    (project.agent as Agent | undefined) ?? DEFAULT_AGENT,
  );
  useEffect(
    () => setSelectedAgent((project.agent as Agent | undefined) ?? DEFAULT_AGENT),
    [project.agent],
  );
  const [dialog, setDialog] = useState<'label' | 'unregister'>();
  const worktrees = useCommand('worktrees.list', { project: project.name });
  const run = useRun();
  const { acting, act } = useAct();
  const sessions = props.sessions.filter(
    (s): s is TreeRow & ManagedRow => s.managed && s.project === project.name,
  );
  const activeSessions = sessions.filter((s) => !exited(s) || queued(s));
  const recentSessions = sessions.filter((s) => exited(s) && !queued(s));
  const open = (input: {
    agent?: Agent;
    mode?: 'plan';
    background?: boolean;
    goal?: string;
    branch?: string;
  }) =>
    act(async () => {
      const session = await run('sessions.open', { project: project.name, ...input });
      if (!session) return undefined;
      props.onSession(session.id);
      return said(`Opened session ${session.id} on ${project.name}`, session);
    });
  const update = (patch: {
    label?: string;
    pinned?: boolean;
    hidden?: boolean;
    move?: 'up' | 'down';
  }) =>
    act(async () => {
      const changed = await run('projects.update', { name: project.name, ...patch });
      if (!changed) return undefined;
      setDialog(undefined);
      props.onChanged();
      return said(`Updated project ${project.name}`, changed);
    });
  const unregister = () =>
    act(async () => {
      const removed = await run('projects.unregister', { name: project.name });
      if (!removed) return undefined;
      setDialog(undefined);
      props.onUnregistered();
      return said(`Unregistered project ${project.name}`, removed);
    });
  return (
    <section data-testid="project-workspace" className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-card text-ring">
          <Folder aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{project.label}</h2>
          <p className="sr-only">
            {project.name} · {project.path}
          </p>
        </div>
        <details className="relative">
          <summary
            data-testid="project-menu"
            aria-label="Project actions"
            className="flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <MoreHorizontal aria-hidden className="size-4" />
          </summary>
          <div className="absolute right-0 z-20 mt-1 grid w-48 gap-1 rounded-md border bg-popover p-1 shadow-lg">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => setDialog('label')}
            >
              Rename display label
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              disabled={acting}
              onClick={() => void update({ pinned: !project.pinned })}
            >
              {project.pinned ? 'Unpin' : 'Pin'} project
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              disabled={acting}
              onClick={() => void update({ hidden: !project.hidden })}
            >
              {project.hidden ? 'Show' : 'Hide'} project
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              disabled={acting}
              onClick={() => void update({ move: 'up' })}
            >
              <ArrowUp aria-hidden /> Move up
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              disabled={acting}
              onClick={() => void update({ move: 'down' })}
            >
              <ArrowDown aria-hidden /> Move down
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-destructive"
              onClick={() => setDialog('unregister')}
            >
              Unregister project
            </Button>
          </div>
        </details>
      </div>
      {dialog === 'label' && (
        <ActionDialog
          testId="project-label-dialog"
          title="Rename display label"
          description="The project slug and historical session links stay the same."
          submit={{ label: 'Save label', testId: 'save-project-label', disabled: acting }}
          onSubmit={(form) => void update({ label: String(new FormData(form).get('label') ?? '') })}
          onCancel={() => setDialog(undefined)}
        >
          <Label htmlFor="project-label">Label</Label>
          <Input
            id="project-label"
            name="label"
            defaultValue={project.label}
            required
            maxLength={80}
          />
        </ActionDialog>
      )}
      {dialog === 'unregister' && (
        <ActionDialog
          testId="project-unregister-dialog"
          title="Unregister project?"
          description="This removes the project from this profile. It leaves the folder, mesa.yaml, and session history intact."
          submit={{
            label: 'Unregister',
            testId: 'confirm-unregister-project',
            disabled: acting,
            variant: 'destructive',
          }}
          onSubmit={() => void unregister()}
          onCancel={() => setDialog(undefined)}
        >
          <p className="text-sm">{project.label}</p>
        </ActionDialog>
      )}
      {pendingTab && (
        <ActionDialog
          testId="file-leave-dialog"
          title="Discard unsaved changes?"
          description="Save or discard the open document before leaving this tab."
          submit={{
            label: 'Discard changes',
            testId: 'confirm-file-leave',
            disabled: false,
            variant: 'destructive',
          }}
          onSubmit={() => {
            props.onFilesDirtyChange(false);
            setTab(pendingTab);
            setPendingTab(undefined);
          }}
          onCancel={() => setPendingTab(undefined)}
        >
          <p className="text-sm">Unsaved edits will be lost.</p>
        </ActionDialog>
      )}
      <nav aria-label={`${project.name} tabs`} className="flex gap-4 border-b">
        {(['overview', 'git', 'files', 'worktrees', 'skills', 'rules'] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-current={tab === name ? 'page' : undefined}
            className="-mb-px border-b-2 border-transparent px-1 pb-2 text-sm capitalize text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-state-working aria-[current=page]:text-foreground"
            onClick={() => {
              if (props.filesDirty && name !== tab) setPendingTab(name);
              else setTab(name);
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      {tab === 'overview' ? (
        <div className="space-y-8">
          <form
            data-testid="project-session-form"
            className="rounded-xl border bg-card/45 p-4 focus-within:border-ring"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = new FormData(form);
              const goal = (form.elements.namedItem('goal') as HTMLTextAreaElement).value;
              void open({
                agent: String(values.get('agent')) as Agent,
                mode:
                  supportsPlanStart(selectedAgent) && values.get('mode') === 'plan'
                    ? 'plan'
                    : undefined,
                background:
                  supportsAgentCapability(selectedAgent, 'background') &&
                  values.get('background') === 'on',
                goal,
                branch:
                  location === 'worktree' ? String(values.get('branch') ?? '').trim() : undefined,
              });
            }}
          >
            <Label htmlFor="project-goal" className="sr-only">
              Goal (optional)
            </Label>
            <Textarea
              id="project-goal"
              name="goal"
              data-testid="project-goal"
              rows={composerOpen ? 3 : 1}
              className="min-h-12 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
              placeholder="What are we shipping? Describe your goal or paste a ticket URL..."
              onFocus={() => setComposerOpen(true)}
            />
            {composerOpen && (
              <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
                <AgentField
                  defaultValue={project.agent ?? undefined}
                  onValueChange={setSelectedAgent}
                />
                <SessionModeField agent={selectedAgent} />
                <BackgroundField agent={selectedAgent} />
                <div className="grid gap-1">
                  <Label htmlFor="session-location" className="text-xs">
                    Start in
                  </Label>
                  <NativeSelect
                    id="session-location"
                    value={location}
                    onChange={(event) => setLocation(event.target.value as 'main' | 'worktree')}
                  >
                    <NativeSelectOption value="main">Main checkout</NativeSelectOption>
                    <NativeSelectOption value="worktree">Own worktree</NativeSelectOption>
                  </NativeSelect>
                </div>
                {location === 'worktree' && (
                  <div className="grid gap-1">
                    <Label htmlFor="project-branch" className="text-xs">
                      Branch
                    </Label>
                    <Input
                      id="project-branch"
                      name="branch"
                      data-testid="project-branch"
                      required
                      placeholder="feature/my-work"
                    />
                  </div>
                )}
                <Button className="ml-auto" type="submit" disabled={!project.exists || acting}>
                  <Play aria-hidden /> Start session
                </Button>
              </div>
            )}
          </form>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active{' '}
              <Badge variant="secondary" className="ml-1 bg-state-idle/20 text-state-idle">
                {activeSessions.length}
              </Badge>
            </h3>
            <div className="flex max-w-[960px] flex-wrap gap-3">
              {activeSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  data-testid="project-active-session"
                  aria-label={`Open ${session.name ?? 'Session'} (${session.id})`}
                  className="flex min-h-24 w-[310px] flex-col items-start gap-1 rounded-lg border bg-card/65 p-3 text-left hover:border-ring focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => props.onSession(session.id)}
                >
                  <StateBadge
                    state={session.lastState.state}
                    confidence={session.lastState.confidence}
                    compact
                  />
                  <span className="w-full truncate text-sm font-medium">
                    {session.name ?? 'Session'}
                  </span>
                  <span className="flex w-full min-w-0 items-center gap-1 truncate font-mono text-xs text-state-working">
                    <GitBranch aria-hidden className="size-3" />{' '}
                    {sessionBranch(session) ??
                      worktrees.data?.find((tree) => tree.main)?.branch ??
                      'branch unknown'}
                  </span>
                  <span className="mt-auto flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {session.context ? `${Math.round(session.context.used)}%` : 'Context unknown'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock3 aria-hidden className="size-3" />
                      {duration(session.runningSeconds)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="group relative flex min-h-16 w-[310px] items-stretch rounded-lg border border-dashed text-muted-foreground">
              <Button
                type="button"
                variant="ghost"
                data-testid="quick-session"
                className="absolute inset-0 h-full w-full group-hover:pointer-events-none group-hover:opacity-0 group-focus-within:opacity-0"
                disabled={!project.exists || acting}
                onClick={() => void open({})}
              >
                <Plus aria-hidden /> Quick empty session
              </Button>
              <div className="z-10 hidden w-full grid-cols-3 bg-card group-hover:grid group-focus-within:grid">
                {(['main', 'worktree', 'terminal'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    data-testid={`quick-${kind}`}
                    className="flex flex-col items-center justify-center gap-1 border-r border-dashed text-xs last:border-r-0 hover:bg-accent"
                    disabled={!project.exists || acting}
                    onClick={() =>
                      kind === 'main' ? void open({}) : props.onNewSession(project.name, kind)
                    }
                  >
                    {kind === 'terminal' ? (
                      <TerminalSquare aria-hidden className="size-4" />
                    ) : kind === 'worktree' ? (
                      <FolderGit2 aria-hidden className="size-4" />
                    ) : (
                      <Plus aria-hidden className="size-4" />
                    )}
                    {kind === 'main' ? 'Main' : kind === 'worktree' ? 'Worktree' : 'Terminal'}
                  </button>
                ))}
              </div>
            </div>
          </section>
          {worktrees.data && worktrees.data.length > 0 && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FolderGit2 aria-hidden className="size-4" /> Worktrees ({worktrees.data.length})
                <button
                  type="button"
                  className="font-normal normal-case hover:text-foreground"
                  onClick={() => setTab('worktrees')}
                >
                  Manage
                </button>
              </h3>
              <div className="flex flex-wrap gap-3">
                {worktrees.data.map((tree) => (
                  <button
                    key={tree.path}
                    type="button"
                    className="flex min-w-36 flex-col items-start gap-1 rounded-md border bg-card/40 p-3 text-left text-xs hover:border-ring"
                    onClick={() => setTab('worktrees')}
                  >
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Folder aria-hidden className="size-3" />
                      {tree.main ? 'main' : tree.path.split('/').at(-1)}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-state-working">
                      <GitBranch aria-hidden className="size-3" />
                      {tree.branch ?? 'detached'}
                    </span>
                    <span className="text-muted-foreground">
                      {tree.holders.length ? `${tree.holders.length} session(s)` : tree.state}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="flex h-12 min-w-24 items-center justify-center gap-2 rounded-md border border-dashed px-4 text-xs text-muted-foreground hover:bg-accent"
                onClick={() => setTab('worktrees')}
              >
                <Plus aria-hidden className="size-3.5" /> New
              </button>
            </section>
          )}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent{' '}
                <Badge variant="secondary" className="ml-1">
                  {recentSessions.length}
                </Badge>
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setHistoryOpen((open) => !open)}>
                {historyOpen ? 'Hide' : 'Native history'}
              </Button>
            </div>
            {historyOpen && (
              <NativeHistory
                key={project.name}
                project={project.name}
                onSession={props.onSession}
              />
            )}
            {recentSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className="flex w-full items-center gap-3 border-b py-2 text-left text-sm hover:text-primary"
                onClick={() => props.onSession(session.id)}
              >
                <Badge variant="outline">{session.lastState.state}</Badge>
                <span>{sessionLabel(session)}</span>
                <span className="ml-auto text-xs text-muted-foreground">{session.agent}</span>
              </button>
            ))}
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No sessions for this project yet.</p>
            )}
          </section>
          <KnowledgeContext project={project.name} />
          {!project.exists && <Badge variant="destructive">Folder unavailable</Badge>}
        </div>
      ) : tab === 'git' ? (
        <GitWorkspace key={project.name} project={project.name} />
      ) : tab === 'files' ? (
        <FilesWorkspace
          key={project.name}
          project={project.name}
          onDirtyChange={props.onFilesDirtyChange}
          target={props.file}
        />
      ) : tab === 'worktrees' ? (
        <WorktreesWorkspace project={project.name} onSession={props.onSession} />
      ) : tab === 'skills' ? (
        <SkillsWorkspace
          project={project.name}
          onDirtyChange={props.onFilesDirtyChange}
          onAgentSettings={props.onAgentSettings}
        />
      ) : (
        <RulesWorkspace project={project.name} onDirtyChange={props.onFilesDirtyChange} />
      )}
    </section>
  );
}
