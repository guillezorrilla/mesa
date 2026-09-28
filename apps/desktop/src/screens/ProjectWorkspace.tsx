import type { Agent, ProjectRow, TreeRow } from '@mesa/core';
import { sessionLabel } from '@mesa/core/browser';
import { ArrowDown, ArrowUp, Folder, MoreHorizontal, Play, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { StateBadge } from '@/components/StateBadge';
import { said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { AgentField } from './board/AgentField';
import { exited, queued } from './board/rows';
import { FilesWorkspace } from './FilesWorkspace';
import { GitWorkspace } from './GitWorkspace';
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
}) {
  const { project } = props;
  const [tab, setTab] = useState<'overview' | 'git' | 'files' | 'worktrees' | 'skills'>('overview');
  useEffect(() => {
    if (props.file) setTab('files');
  }, [props.file]);
  const [pendingTab, setPendingTab] = useState<typeof tab>();
  const [location, setLocation] = useState<'main' | 'worktree'>('main');
  const [composerOpen, setComposerOpen] = useState(false);
  const [dialog, setDialog] = useState<'label' | 'unregister'>();
  const skills = useCommand('skills.list', { project: project.name });
  const run = useRun();
  const { acting, act } = useAct();
  const sessions = props.sessions.filter((s) => s.managed && s.project === project.name);
  const activeSessions = sessions.filter((s) => !exited(s) || queued(s));
  const recentSessions = sessions.filter((s) => exited(s) && !queued(s));
  const open = (input: { agent?: Agent; goal?: string; branch?: string }) =>
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
        <span className="flex size-10 items-center justify-center rounded-xl bg-card text-state-waiting">
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
          title="Discard unsaved file changes?"
          description="Save or discard the open file before leaving Files."
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
        {(['overview', 'git', 'files', 'worktrees', 'skills'] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-current={tab === name ? 'page' : undefined}
            className="-mb-px border-b-2 border-transparent px-1 pb-2 text-sm capitalize text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:text-foreground"
            onClick={() => {
              if (tab === 'files' && props.filesDirty && name !== tab) setPendingTab(name);
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
                <AgentField defaultValue={project.agent ?? undefined} />
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
              <Badge variant="secondary" className="ml-1">
                {activeSessions.length}
              </Badge>
            </h3>
            <div className="flex flex-wrap gap-3">
              {activeSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  data-testid="project-active-session"
                  className="flex min-h-32 w-64 flex-col items-start rounded-lg border bg-card/65 p-3 text-left hover:border-ring focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => props.onSession(session.id)}
                >
                  <StateBadge
                    state={session.lastState.state}
                    confidence={session.lastState.confidence}
                  />
                  <span className="mt-3 truncate font-medium">{sessionLabel(session)}</span>
                  <span className="mt-auto text-xs text-muted-foreground">{session.agent}</span>
                </button>
              ))}
              <Button
                type="button"
                variant="outline"
                data-testid="quick-session"
                className="h-32 w-64 border-dashed bg-transparent text-muted-foreground"
                disabled={!project.exists || acting}
                onClick={() => void open({})}
              >
                <Plus aria-hidden /> Quick empty session
              </Button>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent{' '}
              <Badge variant="secondary" className="ml-1">
                {recentSessions.length}
              </Badge>
            </h3>
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
          {!project.exists && <Badge variant="destructive">Folder unavailable</Badge>}
        </div>
      ) : tab === 'git' ? (
        <GitWorkspace key={project.name} project={project.name} sessions={props.sessions} />
      ) : tab === 'files' ? (
        <FilesWorkspace
          key={project.name}
          project={project.name}
          sessions={props.sessions}
          onDirtyChange={props.onFilesDirtyChange}
          target={props.file}
        />
      ) : tab === 'worktrees' ? (
        <WorktreesWorkspace project={project.name} onSession={props.onSession} />
      ) : (
        <div className="space-y-2">
          {skills.data?.map((skill) => (
            <Card key={`${skill.source}-${skill.name}`}>
              <CardContent className="flex items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{skill.name}</div>
                  <p className="text-muted-foreground">{skill.description}</p>
                </div>
                <Badge variant={skill.enabled ? 'secondary' : 'outline'}>
                  {skill.source} · {skill.enabled ? 'enabled' : 'off'}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {skills.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No skills found.</p>
          )}
        </div>
      )}
    </section>
  );
}
