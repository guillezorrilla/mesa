import { repositoryUrl, sessionCount } from '@mesa/core/browser';
import { Columns2, FolderPlus, GitFork, Play, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AddProjectMenu, type ProjectAddRequest } from '@/components/AddProjectMenu';
import { PageHeader } from '@/components/PageHeader';
import { said } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * The profile's registered projects, with skill sync and session actions.
 */
export function ProjectsScreen(props: {
  onAddProject: (request: ProjectAddRequest) => void;
  refreshRequest?: number;
  cloneLink?: { url: string; request: number };
  onRegistered?: () => void;
  onSelectProject?: (name: string) => void;
}) {
  const { data: projects, refresh } = useCommand('projects.list');
  const lastRefresh = useRef(props.refreshRequest);
  useEffect(() => {
    if (lastRefresh.current === props.refreshRequest) return;
    lastRefresh.current = props.refreshRequest;
    void refresh();
  }, [props.refreshRequest, refresh]);
  const skills = useCommand('skills.list', {});
  const run = useRun();
  const { acting, act } = useAct();
  // Sync and open both link skills into a project: its Skills column reads again after either.
  const [linked, setLinked] = useState(0);
  const [cloneUrl, setCloneUrl] = useState('');
  useEffect(() => {
    if (props.cloneLink) setCloneUrl(props.cloneLink.url);
  }, [props.cloneLink]);
  let validClone = false;
  try {
    repositoryUrl(cloneUrl);
    validClone = true;
  } catch {
    // The field is not ready; core validates again before git runs.
  }

  const openSession = (project: string) =>
    act(async () => {
      const session = await run('sessions.open', { project });
      if (!session) return undefined;
      setLinked((n) => n + 1);
      return said(`Opened session ${session.id} on ${project}`, session);
    });

  // Its sessions side by side in the terminal app, laid out by its mesa.yaml tmux.layout.
  const viewSessions = (project: string) =>
    act(async () => {
      const viewed = await run('sessions.view', { project });
      const count = viewed && sessionCount(viewed.sessions.length);
      return viewed && said(`Viewing ${count} of ${project} in ${viewed.app}`);
    });

  // Links the profile's and the project's enabled skills into its skill folders.
  const syncSkills = (project: string) =>
    act(async () => {
      const synced = await run('skills.sync', { project });
      if (!synced) return undefined;
      setLinked((n) => n + 1);
      const clashes = synced.conflicts.length
        ? `; ${synced.conflicts.length} of the project's own left alone`
        : '';
      return said(
        `Synced skills into ${project}: ${synced.added.length} added, ${synced.removed.length} removed${clashes}`,
        synced,
      );
    });

  const clone = () =>
    act(async () => {
      const cloned = await run('projects.clone', { url: cloneUrl.trim() });
      if (!cloned) return undefined;
      setCloneUrl('');
      await refresh();
      props.onRegistered?.();
      return said(`Cloned project ${cloned.name}`, cloned);
    });

  return (
    <section data-testid="projects-screen" className="space-y-4">
      <PageHeader title="Projects" description="The repositories this profile has registered.">
        <AddProjectMenu onSelect={props.onAddProject}>
          <Button aria-label="Add project">
            <FolderPlus aria-hidden /> Add project
          </Button>
        </AddProjectMenu>
      </PageHeader>
      {props.cloneLink && (
        <Card>
          <CardContent>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (validClone) void clone();
              }}
            >
              <Input
                data-testid="repository-url"
                aria-label="Repository URL or Mesa project link"
                value={cloneUrl}
                onInput={(event) => setCloneUrl(event.currentTarget.value)}
                placeholder="HTTPS, SSH, or mesa://clone?url=..."
                className="min-w-64 flex-1 font-mono"
              />
              <Button
                type="submit"
                variant="outline"
                data-testid="clone-project"
                disabled={!validClone || acting}
              >
                <GitFork aria-hidden /> Clone and register
              </Button>
              {cloneUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cancel repository checkout"
                  disabled={acting}
                  onClick={() => setCloneUrl('')}
                >
                  <X aria-hidden />
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects?.map((p) => (
              <TableRow key={p.name} data-testid="project-row">
                <TableCell className="font-medium">
                  {props.onSelectProject ? (
                    <button
                      type="button"
                      className="text-left underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => props.onSelectProject?.(p.name)}
                    >
                      {p.label}
                    </button>
                  ) : (
                    p.label
                  )}
                  {p.label !== p.name && (
                    <div className="font-mono text-muted-foreground text-xs">{p.name}</div>
                  )}
                  {p.pinned && (
                    <Badge variant="secondary" className="ml-2">
                      Pinned
                    </Badge>
                  )}
                  {p.hidden && (
                    <Badge variant="outline" className="ml-2">
                      Hidden
                    </Badge>
                  )}
                  {!p.exists && (
                    <span
                      data-testid="project-missing"
                      title="path is gone"
                      className="font-semibold text-state-failed"
                    >
                      {' ✗'}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground text-xs">{p.path}</TableCell>
                <TableCell>{p.agent ?? ''}</TableCell>
                <TableCell className="font-mono tabular-nums">{p.priority ?? ''}</TableCell>
                <TableCell>
                  {p.exists && <SyncedSkills key={`${p.name}-${linked}`} project={p.name} />}
                </TableCell>
                <TableCell className="text-right">
                  {p.exists && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="sync-skills"
                        title="Link the enabled skills into its .claude/skills and .agents/skills"
                        onClick={() => syncSkills(p.name)}
                        disabled={acting}
                      >
                        <Sparkles aria-hidden />
                        Sync skills
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="open-session"
                        onClick={() => openSession(p.name)}
                        disabled={acting}
                      >
                        <Play aria-hidden />
                        Open session
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="view-sessions"
                        title="Its sessions side by side in your terminal app, laid out by mesa.yaml tmux.layout"
                        onClick={() => viewSessions(p.name)}
                        disabled={acting}
                      >
                        <Columns2 aria-hidden />
                        View sessions
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mesa's skills</CardTitle>
          <CardDescription>
            Enabled in this profile's config.yaml; a project's mesa.yaml can add more. Sync skills
            links them into the project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {skills.data?.map((s) => (
            <div key={s.name} data-testid="skill-row" className="flex items-start gap-3 text-sm">
              <Badge variant={s.enabled ? 'default' : 'outline'} className="font-mono">
                {s.enabled ? 'enabled' : 'off'}
              </Badge>
              <div>
                <div className="font-medium font-mono">{s.name}</div>
                <div className="text-muted-foreground text-xs">{s.description}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

/** The Mesa skills linked into a project (mesa skills sync, or mesa open, puts them there). */
function SyncedSkills({ project }: { project: string }) {
  const { data } = useCommand('skills.list', { project });
  const linked = data?.filter((s) => s.source === 'mesa' && s.linked) ?? [];
  return (
    <div data-testid="synced-skills" className="flex flex-wrap gap-1">
      {linked.length ? (
        linked.map((s) => (
          <Badge key={s.name} variant="secondary" className="font-mono">
            {s.name}
          </Badge>
        ))
      ) : (
        <span className="text-muted-foreground text-xs">none synced</span>
      )}
    </div>
  );
}
