import type { Agent, ProjectRow, TreeRow } from '@mesa/core';
import { sessionLabel } from '@mesa/core/browser';
import { ArrowDown, ArrowUp, FolderGit2, MoreHorizontal, Play } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { AgentField } from './board/AgentField';

/** The selected project's existing information and effective skills, in its own workspace. */
export function ProjectWorkspace(props: {
  project: ProjectRow;
  sessions: readonly TreeRow[];
  onSession: (id: string) => void;
  onChanged: () => void;
  onUnregistered: () => void;
}) {
  const { project } = props;
  const [tab, setTab] = useState<'overview' | 'skills'>('overview');
  const [location, setLocation] = useState<'main' | 'worktree'>('main');
  const [dialog, setDialog] = useState<'label' | 'unregister'>();
  const skills = useCommand('skills.list', { project: project.name });
  const run = useRun();
  const { acting, act } = useAct();
  const sessions = props.sessions.filter((s) => s.managed && s.project === project.name);
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
        <FolderGit2 aria-hidden className="size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{project.label}</h2>
          <p className="truncate font-mono text-xs text-muted-foreground" title={project.path}>
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
      <nav aria-label={`${project.name} tabs`} className="flex gap-4 border-b">
        {(['overview', 'skills'] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-current={tab === name ? 'page' : undefined}
            className="-mb-px border-b-2 border-transparent px-1 pb-2 text-sm capitalize text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-primary aria-[current=page]:text-foreground"
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      {tab === 'overview' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New session</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                data-testid="project-session-form"
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const values = new FormData(form);
                  const goal = (form.elements.namedItem('goal') as HTMLTextAreaElement).value;
                  void open({
                    agent: String(values.get('agent')) as Agent,
                    goal,
                    branch:
                      location === 'worktree'
                        ? String(values.get('branch') ?? '').trim()
                        : undefined,
                  });
                }}
              >
                <AgentField defaultValue={project.agent ?? undefined} />
                <div className="grid gap-2">
                  <Label htmlFor="project-goal">Goal (optional)</Label>
                  <Textarea
                    id="project-goal"
                    name="goal"
                    data-testid="project-goal"
                    rows={3}
                    placeholder="What should the agent do?"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="session-location">Start in</Label>
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
                  <div className="grid gap-2">
                    <Label htmlFor="project-branch">Branch</Label>
                    <Input
                      id="project-branch"
                      name="branch"
                      data-testid="project-branch"
                      required
                      placeholder="feature/my-work"
                    />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!project.exists || acting}>
                    <Play aria-hidden /> Start session
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="quick-session"
                    disabled={!project.exists || acting}
                    onClick={() => void open({})}
                  >
                    Quick empty session
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 text-sm">
              <span>Agent: {project.agent ?? 'unknown'}</span>
              <span>Priority: {project.priority ?? 'unknown'}</span>
              {!project.exists && <Badge variant="destructive">Folder unavailable</Badge>}
            </CardContent>
          </Card>
          <div>
            <h3 className="mb-3 text-sm font-semibold">Sessions</h3>
            {sessions.length ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {sessions.map((session) => (
                  <Button
                    key={session.id}
                    variant="outline"
                    className="h-auto justify-start p-3 text-left"
                    onClick={() => props.onSession(session.id)}
                  >
                    <span className="truncate">{sessionLabel(session)}</span>
                    <Badge variant="secondary" className="ml-auto">
                      {session.lastState.state}
                    </Badge>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sessions for this project yet.</p>
            )}
          </div>
        </div>
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
